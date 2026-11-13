/**
 * Preços que a pessoa registra (spec 0001, CA-15 e CA-16; ADR-0003): lidos da nota fiscal dela
 * ou digitados no mercado, sempre com a fonte e o dia em que foram vistos. Ficam só no
 * aparelho, no armazém `observacoesDePreco`, e entram na cópia dos dados (CA-04).
 *
 * Sem React e sem API do navegador: cada operação recebe o que precisa e devolve o registro
 * novo ou o motivo da recusa.
 */
import type { Alteracoes } from "../../shared/armazenamento/banco";
import { lerReais, maiorPrecoEmCentavos } from "../../shared/dinheiro";
import { falha, sucesso, type Resultado } from "../../shared/resultado";
import { limparTexto } from "../../shared/texto";
import { ehDataIso, ehObjeto, ehUuid } from "../../shared/validacao";
import { limites as limitesDaLista } from "../lista/lista";

export const fontesDePreco = ["nota", "digitado"] as const;

export type FonteDePreco = (typeof fontesDePreco)[number];

export const limitesDoPreco = {
  produto: limitesDaLista.nomeDoItem,
  marca: limitesDaLista.marca,
  tamanho: limitesDaLista.tamanho,
  /** Descrição como a nota imprime; o leitor da nota aceita até 200 caracteres. */
  descricao: 200,
  mercado: 200,
  minimoAtacado: 999,
  /** Bem acima do uso de uma pessoa e dentro dos 5 MB do arquivo de cópia. */
  precos: 5000,
  /** Preço visto há mais dias que isto aparece como antigo (CA-16). */
  diasAteAntigo: 30,
} as const;

/** O mercado do preço: o id da base (OpenStreetMap) ou do mercado cadastrado, e o nome. */
export interface MercadoDoPreco {
  readonly id: string;
  readonly nome: string;
}

export interface ObservacaoDePreco {
  readonly id: string;
  /** Nome do produto como na lista ("Arroz"): é por ele que o preço encontra o item. */
  readonly produto: string;
  readonly marca: string | null;
  /** Tamanho da embalagem como a pessoa escreveu ou a nota trouxe ("5 kg", "12x1L"). */
  readonly tamanho: string | null;
  /** Texto do item na nota fiscal; nulo no preço digitado. */
  readonly descricao: string | null;
  /** Preço de uma embalagem (ou de 1 kg, no item vendido a peso), em centavos. */
  readonly precoCentavos: number;
  /** O preço só vale a partir desta quantidade (atacado, CA-18); nulo quando vale sempre. */
  readonly minimoAtacado: number | null;
  readonly mercadoId: string;
  /** Nome do mercado no dia do registro, para mostrar mesmo longe do ponto da busca. */
  readonly mercadoNome: string;
  readonly fonte: FonteDePreco;
  /** Dia em que o preço foi visto, "AAAA-MM-DD": a emissão da nota ou o dia da digitação. */
  readonly vistoEm: string;
  /** Resumo SHA-256 da chave da nota, para importar a mesma nota de novo sem repetir preço. */
  readonly nota: string | null;
  readonly criadoEm: string;
}

/** O que a pessoa preenche no formulário do preço digitado (CA-15). */
export interface EntradaDoPreco {
  readonly produto: string;
  readonly marca: string;
  readonly tamanho: string;
  readonly preco: string;
  readonly mercado: MercadoDoPreco | null;
  readonly minimoAtacado: string;
}

export interface ContextoDoPreco {
  readonly agora: Date;
  readonly gerarId: () => string;
  /** Fuso do dia "visto em"; sem ele, o do aparelho. */
  readonly fuso?: string;
}

export type ErroDoPreco =
  | { readonly tipo: "produto-vazio" }
  | { readonly tipo: "produto-longo" }
  | { readonly tipo: "marca-longa" }
  | { readonly tipo: "tamanho-longo" }
  | { readonly tipo: "preco-invalido" }
  | { readonly tipo: "mercado-vazio" }
  | { readonly tipo: "atacado-invalido" }
  | { readonly tipo: "limite" };

/** Id de mercado da base ("n123", "w45", "r6") ou de mercado cadastrado (UUID). */
export function ehIdDeMercado(valor: unknown): valor is string {
  return ehUuid(valor) || (typeof valor === "string" && /^[nwr][1-9]\d{0,15}$/.test(valor));
}

/** "AAAA-MM-DD" que existe no calendário. */
export function ehDia(valor: unknown): valor is string {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().startsWith(valor);
}

/** O dia de hoje no fuso informado ou no do aparelho, "AAAA-MM-DD". */
export function diaDe(agora: Date, fuso?: string): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(fuso === undefined ? {} : { timeZone: fuso }),
  }).formatToParts(agora);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((atual) => atual.type === tipo)?.value ?? "";
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

/** Dias corridos entre dois dias "AAAA-MM-DD"; negativo se `ate` vem antes. */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

/** Mais de 30 dias desde que o preço foi visto (CA-16). */
export function ehAntigo(vistoEm: string, hoje: string): boolean {
  return diasEntre(vistoEm, hoje) > limitesDoPreco.diasAteAntigo;
}

function textoOuNulo(texto: string, maximo: number): Resultado<string | null, "longo"> {
  const limpo = limparTexto(texto);
  if (limpo === "") return sucesso(null);
  return limpo.length > maximo ? falha("longo") : sucesso(limpo);
}

/** Produto obrigatório, até o tamanho do nome de item da lista. */
export function lerProduto(texto: string): Resultado<string, ErroDoPreco> {
  const limpo = limparTexto(texto);
  if (limpo === "") return falha({ tipo: "produto-vazio" });
  if (limpo.length > limitesDoPreco.produto) return falha({ tipo: "produto-longo" });
  return sucesso(limpo);
}

/** Quantidade mínima do atacado: vazio é "vale sempre"; senão, inteiro de 2 a 999. */
function lerAtacado(texto: string): Resultado<number | null, ErroDoPreco> {
  const limpo = texto.trim();
  if (limpo === "") return sucesso(null);
  if (!/^\d{1,3}$/.test(limpo)) return falha({ tipo: "atacado-invalido" });
  const minimo = Number(limpo);
  return minimo >= 2 && minimo <= limitesDoPreco.minimoAtacado
    ? sucesso(minimo)
    : falha({ tipo: "atacado-invalido" });
}

/** Mercado escolhido com id válido e nome limpo, cortado no tamanho guardado; senão, nulo. */
export function conferirMercado(mercado: MercadoDoPreco | null): MercadoDoPreco | null {
  if (mercado === null || !ehIdDeMercado(mercado.id)) return null;
  const nome = limparTexto(mercado.nome);
  return nome === "" ? null : { id: mercado.id, nome: nome.slice(0, limitesDoPreco.mercado) };
}

/** Confere o preço digitado e monta o registro, sem gravar nada (CA-15). */
export function registrarPrecoDigitado(
  quantosHa: number,
  entrada: EntradaDoPreco,
  contexto: ContextoDoPreco,
): Resultado<ObservacaoDePreco, ErroDoPreco> {
  const produto = lerProduto(entrada.produto);
  if (!produto.ok) return produto;
  const marca = textoOuNulo(entrada.marca, limitesDoPreco.marca);
  if (!marca.ok) return falha({ tipo: "marca-longa" });
  const tamanho = textoOuNulo(entrada.tamanho, limitesDoPreco.tamanho);
  if (!tamanho.ok) return falha({ tipo: "tamanho-longo" });
  const preco = lerReais(entrada.preco);
  if (preco === null) return falha({ tipo: "preco-invalido" });
  const mercado = conferirMercado(entrada.mercado);
  if (mercado === null) return falha({ tipo: "mercado-vazio" });
  const atacado = lerAtacado(entrada.minimoAtacado);
  if (!atacado.ok) return atacado;
  if (quantosHa >= limitesDoPreco.precos) return falha({ tipo: "limite" });

  return sucesso({
    id: contexto.gerarId(),
    produto: produto.valor,
    marca: marca.valor,
    tamanho: tamanho.valor,
    descricao: null,
    precoCentavos: preco,
    minimoAtacado: atacado.valor,
    mercadoId: mercado.id,
    mercadoNome: mercado.nome,
    fonte: "digitado",
    vistoEm: diaDe(contexto.agora, contexto.fuso),
    nota: null,
    criadoEm: contexto.agora.toISOString(),
  });
}

function ehTextoLimpo(valor: unknown, maximo: number): valor is string {
  return (
    typeof valor === "string" &&
    valor !== "" &&
    valor.length <= maximo &&
    limparTexto(valor) === valor
  );
}

function ehTextoLimpoOuNulo(valor: unknown, maximo: number): valor is string | null {
  return valor === null || ehTextoLimpo(valor, maximo);
}

/** Reconstrói um preço guardado ou importado, campo a campo; fora do formato, nulo. */
export function lerObservacao(valor: unknown): ObservacaoDePreco | null {
  if (!ehObjeto(valor)) return null;
  const {
    id,
    produto,
    marca,
    tamanho,
    descricao,
    precoCentavos,
    minimoAtacado,
    mercadoId,
    mercadoNome,
    fonte,
    vistoEm,
    nota,
    criadoEm,
  } = valor;
  const valido =
    ehUuid(id) &&
    ehTextoLimpo(produto, limitesDoPreco.produto) &&
    ehTextoLimpoOuNulo(marca, limitesDoPreco.marca) &&
    ehTextoLimpoOuNulo(tamanho, limitesDoPreco.tamanho) &&
    ehTextoLimpoOuNulo(descricao, limitesDoPreco.descricao) &&
    typeof precoCentavos === "number" &&
    Number.isSafeInteger(precoCentavos) &&
    precoCentavos > 0 &&
    precoCentavos <= maiorPrecoEmCentavos &&
    (minimoAtacado === null ||
      (typeof minimoAtacado === "number" &&
        Number.isSafeInteger(minimoAtacado) &&
        minimoAtacado >= 2 &&
        minimoAtacado <= limitesDoPreco.minimoAtacado)) &&
    ehIdDeMercado(mercadoId) &&
    ehTextoLimpo(mercadoNome, limitesDoPreco.mercado) &&
    typeof fonte === "string" &&
    (fontesDePreco as readonly string[]).includes(fonte) &&
    ehDia(vistoEm) &&
    (nota === null || (typeof nota === "string" && /^[0-9a-f]{64}$/.test(nota))) &&
    ehDataIso(criadoEm);
  if (!valido) return null;
  return {
    id,
    produto,
    marca,
    tamanho,
    descricao,
    precoCentavos,
    minimoAtacado,
    mercadoId,
    mercadoNome,
    fonte: fonte as FonteDePreco,
    vistoEm,
    nota,
    criadoEm,
  };
}

/**
 * Lê todos os preços. Registro fora do formato, repetido ou além do limite fica de fora e é
 * contado: o aparelho segue com o resto, a importação recusa o arquivo.
 */
export function conferirObservacoes(registros: readonly unknown[]): {
  readonly observacoes: readonly ObservacaoDePreco[];
  readonly recusados: number;
} {
  const observacoes = new Map<string, ObservacaoDePreco>();
  let recusados = 0;
  for (const registro of registros) {
    const observacao = lerObservacao(registro);
    if (
      observacao === null ||
      observacoes.has(observacao.id) ||
      observacoes.size >= limitesDoPreco.precos
    ) {
      recusados += 1;
    } else {
      observacoes.set(observacao.id, observacao);
    }
  }
  return { observacoes: [...observacoes.values()], recusados };
}

export function gravarPrecos(observacoes: readonly ObservacaoDePreco[]): Alteracoes {
  return { observacoesDePreco: { gravar: observacoes } };
}

export function excluirPreco(id: string): Alteracoes {
  return { observacoesDePreco: { apagar: [id] } };
}

export interface PrecoNaTela {
  readonly observacao: ObservacaoDePreco;
  readonly antigo: boolean;
}

export interface Produto {
  readonly nome: string;
  readonly precos: readonly PrecoNaTela[];
}

const ordemDosNomes = new Intl.Collator("pt-BR", { sensitivity: "base" });

/**
 * Preços agrupados por produto, para a tela: produtos em ordem alfabética e, em cada um, o
 * visto mais recente primeiro, com desempate pelo mercado e pelo id (mesma entrada, mesma
 * ordem). O nome do grupo é o do registro mais recente.
 */
export function precosPorProduto(
  observacoes: readonly ObservacaoDePreco[],
  hoje: string,
  chave: (nome: string) => string,
): readonly Produto[] {
  const grupos = new Map<string, ObservacaoDePreco[]>();
  for (const observacao of observacoes) {
    const doProduto = chave(observacao.produto);
    const grupo = grupos.get(doProduto);
    if (grupo === undefined) grupos.set(doProduto, [observacao]);
    else grupo.push(observacao);
  }
  const produtos = [...grupos.values()].map((grupo) => {
    const ordenados = grupo.sort(
      (a, b) =>
        (a.vistoEm < b.vistoEm ? 1 : a.vistoEm > b.vistoEm ? -1 : 0) ||
        (a.criadoEm < b.criadoEm ? 1 : a.criadoEm > b.criadoEm ? -1 : 0) ||
        ordemDosNomes.compare(a.mercadoNome, b.mercadoNome) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    return {
      nome: ordenados[0]!.produto,
      precos: ordenados.map((observacao) => ({
        observacao,
        antigo: ehAntigo(observacao.vistoEm, hoje),
      })),
    };
  });
  return produtos.sort((a, b) => ordemDosNomes.compare(a.nome, b.nome));
}
