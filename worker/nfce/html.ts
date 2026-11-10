/**
 * Separador de HTML para a consulta da NFC-e (spec 0001, plano.md).
 *
 * Não é um analisador completo: percorre a página uma vez e devolve o texto visível em
 * blocos, na ordem do documento, mais a contagem de alguns elementos. É o que os leitores de
 * cada UF precisam para achar os rótulos impressos na nota ("Qtde.:", "Vl. Unit.:").
 *
 * Por que não o HTMLRewriter da Cloudflare: ele só existe no runtime do Worker, e os testes
 * rodam no Node, pelo Vitest. Um separador em TypeScript puro roda igual nos dois lugares.
 *
 * Garantias: tempo linear no tamanho da página, limites fixos de blocos e de nomes guardados,
 * conteúdo de <script>, <style> e <textarea> ignorado, valores de atributo (campos ocultos,
 * por exemplo) fora do texto.
 */
export interface EstruturaDaPagina {
  elementos: number;
  tabelas: number;
  linhasDeTabela: number;
  formularios: number;
  campos: number;
  quadros: number;
  scripts: number;
  /** Até 30 ids e 30 classes, só nomes simples: servem ao diagnóstico de formato. */
  ids: string[];
  classes: string[];
}

export interface PaginaLida {
  titulo: string | null;
  /** Texto de cada bloco (parágrafo, célula, item de lista), sem marcação. */
  blocos: string[];
  /** Os blocos em ordem, um por linha. */
  texto: string;
  estrutura: EstruturaDaPagina;
  /** A página passou de um limite e o restante foi ignorado. */
  truncada: boolean;
}

const limiteDeBlocos = 20_000;
const limiteDoBloco = 2_000;
const limiteDeNomes = 30;
const limiteDeAspas = 2_048;
const limiteDeTagsMalformadas = 50;

/** Elementos que separam blocos de texto; os demais (span, strong, a, label) ficam na linha. */
const separadores = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
  "br",
  "caption",
  "center",
  "dd",
  "details",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "legend",
  "li",
  "main",
  "nav",
  "ol",
  "option",
  "p",
  "pre",
  "section",
  "select",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

/** Elementos cujo conteúdo não é marcação: vai até a tag de fechamento, sem interpretar. */
const fechamentos: Readonly<Record<string, RegExp>> = {
  script: /<\/script\b/gi,
  style: /<\/style\b/gi,
  textarea: /<\/textarea\b/gi,
  title: /<\/title\b/gi,
};

const entidades: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  aacute: "á",
  Aacute: "Á",
  acirc: "â",
  Acirc: "Â",
  agrave: "à",
  Agrave: "À",
  atilde: "ã",
  Atilde: "Ã",
  ccedil: "ç",
  Ccedil: "Ç",
  eacute: "é",
  Eacute: "É",
  ecirc: "ê",
  Ecirc: "Ê",
  iacute: "í",
  Iacute: "Í",
  oacute: "ó",
  Oacute: "Ó",
  ocirc: "ô",
  Ocirc: "Ô",
  otilde: "õ",
  Otilde: "Õ",
  uacute: "ú",
  Uacute: "Ú",
  uuml: "ü",
  Uuml: "Ü",
  ordm: "º",
  ordf: "ª",
  deg: "°",
  ndash: "–",
  mdash: "—",
};

const entidade = /&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,30});?/g;

/** Troca entidades HTML (&amp;, &#233;, &#xE9;) pelo caractere; as desconhecidas ficam como estão. */
export function decodificarEntidades(texto: string): string {
  if (!texto.includes("&")) return texto;
  return texto.replace(entidade, (tudo, corpo: string) => {
    if (corpo.startsWith("#")) {
      const hexadecimal = corpo[1] === "x" || corpo[1] === "X";
      const codigo = Number.parseInt(corpo.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      const valido = codigo > 0 && codigo <= 0x10ffff && (codigo < 0xd800 || codigo > 0xdfff);
      return valido ? String.fromCodePoint(codigo) : "\ufffd";
    }
    return entidades[corpo] ?? tudo;
  });
}

// Caracteres de controle, espaço que não quebra, marcas invisíveis e de direção do texto.
const invisiveis = /[\u0000-\u001f\u007f-\u00a0\u200b-\u200f\u2028-\u202e\u2060\ufeff]+/g;

/** Um espaço entre palavras, sem caractere invisível, sem espaço nas pontas. */
export function limparTexto(texto: string): string {
  return texto.replace(invisiveis, " ").replace(/\s+/g, " ").trim();
}

const aberturaDeTag = /<(\/?)([A-Za-z][A-Za-z0-9:-]*)/y;
const atributoDeNome = /(?:^|\s)(id|class)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
// Nome curto e sem sequência longa de dígitos: nome de marcação, não dado de alguém.
const nomeSimples = /^(?!.*\d{6})[A-Za-z][A-Za-z0-9_-]{0,39}$/;

/** Posição do ">" que fecha a tag, respeitando aspas de atributo; -1 se não achou no limite. */
function fimDaTag(html: string, inicio: number): number {
  let aspas = 0;
  let inicioDasAspas = 0;
  for (let i = inicio; i < html.length; i++) {
    const c = html.charCodeAt(i);
    if (aspas !== 0) {
      if (c === aspas) aspas = 0;
      else if (i - inicioDasAspas > limiteDeAspas) return -1;
    } else if (c === 34 || c === 39) {
      aspas = c;
      inicioDasAspas = i;
    } else if (c === 62) {
      return i;
    }
  }
  return -1;
}

export function lerPagina(html: string): PaginaLida {
  const blocos: string[] = [];
  const estrutura: EstruturaDaPagina = {
    elementos: 0,
    tabelas: 0,
    linhasDeTabela: 0,
    formularios: 0,
    campos: 0,
    quadros: 0,
    scripts: 0,
    ids: [],
    classes: [],
  };
  let titulo: string | null = null;
  let truncada = false;
  let tagsMalformadas = 0;
  let atual = "";

  const fecharBloco = (): void => {
    if (atual === "") return;
    const limpo = limparTexto(decodificarEntidades(atual)).slice(0, limiteDoBloco);
    atual = "";
    if (limpo === "") return;
    if (blocos.length < limiteDeBlocos) blocos.push(limpo);
    else truncada = true;
  };

  const guardarNomes = (atributos: string): void => {
    const cheio =
      estrutura.ids.length >= limiteDeNomes && estrutura.classes.length >= limiteDeNomes;
    if (cheio || atributos.length > limiteDeAspas) return;
    for (const achado of atributos.matchAll(atributoDeNome)) {
      const destino = achado[1]!.toLowerCase() === "id" ? estrutura.ids : estrutura.classes;
      const valor = achado[2] ?? achado[3] ?? achado[4] ?? "";
      for (const nome of valor.split(/\s+/)) {
        if (destino.length >= limiteDeNomes) break;
        if (nomeSimples.test(nome) && !destino.includes(nome)) destino.push(nome);
      }
    }
  };

  const contar = (nome: string): void => {
    estrutura.elementos++;
    if (nome === "table") estrutura.tabelas++;
    else if (nome === "tr") estrutura.linhasDeTabela++;
    else if (nome === "form") estrutura.formularios++;
    else if (nome === "input" || nome === "select" || nome === "textarea") estrutura.campos++;
    else if (nome === "iframe" || nome === "frame") estrutura.quadros++;
    else if (nome === "script") estrutura.scripts++;
  };

  const tamanho = html.length;
  let i = 0;
  while (i < tamanho) {
    const menor = html.indexOf("<", i);
    if (menor === -1) {
      atual += `${html.slice(i)} `;
      break;
    }
    if (menor > i) atual += `${html.slice(i, menor)} `;

    if (html.startsWith("<!--", menor)) {
      const fim = html.indexOf("-->", menor + 4);
      i = fim === -1 ? tamanho : fim + 3;
      continue;
    }
    const seguinte = html.charCodeAt(menor + 1);
    // "<!" (doctype, CDATA) e "<?" (instrução de processamento): pula até o ">".
    if (seguinte === 33 || seguinte === 63) {
      const fim = html.indexOf(">", menor + 2);
      i = fim === -1 ? tamanho : fim + 1;
      continue;
    }

    aberturaDeTag.lastIndex = menor;
    const tag = aberturaDeTag.exec(html);
    if (tag === null) {
      // "<" solto no texto, como em "a < b".
      atual += "<";
      i = menor + 1;
      continue;
    }
    const depoisDoNome = aberturaDeTag.lastIndex;
    let fim = fimDaTag(html, depoisDoNome);
    if (fim === -1) {
      // Aspas sem fechar: usa o primeiro ">" e segue. Página com muitas tags assim é descartada.
      tagsMalformadas++;
      fim = html.indexOf(">", depoisDoNome);
      if (fim === -1 || tagsMalformadas > limiteDeTagsMalformadas) {
        truncada = true;
        break;
      }
    }
    const fechando = tag[1] === "/";
    const nome = tag[2]!.toLowerCase();
    i = fim + 1;

    if (!fechando) {
      contar(nome);
      guardarNomes(html.slice(depoisDoNome, fim));

      const fechamento = fechamentos[nome];
      if (fechamento !== undefined) {
        fechamento.lastIndex = i;
        const achado = fechamento.exec(html);
        const fimDoConteudo = achado === null ? tamanho : achado.index;
        if (nome === "title" && titulo === null) {
          const texto = limparTexto(decodificarEntidades(html.slice(i, fimDoConteudo)));
          titulo = texto === "" ? null : texto.slice(0, 120);
        }
        const fimDoFechamento = achado === null ? -1 : html.indexOf(">", fechamento.lastIndex);
        i = fimDoFechamento === -1 ? tamanho : fimDoFechamento + 1;
        fecharBloco();
        continue;
      }
    }
    if (separadores.has(nome)) fecharBloco();
  }
  fecharBloco();

  return { titulo, blocos, texto: blocos.join("\n"), estrutura, truncada };
}
