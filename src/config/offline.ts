/**
 * Lista de arquivos do service worker (spec 0001, CA-36; ADR-0007), montada no build a partir
 * do que o Astro gravou em dist/ (astro.config.mjs).
 *
 * Entram as páginas, os arquivos que elas carregam (CSS, as ilhas e o que as ilhas importam de
 * forma fixa) e os ícones do aplicativo instalado. Fica de fora o que só serve com internet:
 * os módulos carregados sob demanda (o mapa, com mais de 1 MB, e o leitor de QR), a imagem de
 * compartilhamento, a base de mercados (guardada quando a pessoa baixa a região) e o 404.
 *
 * A versão é um resumo do conteúdo de tudo o que entra: qualquer mudança gera um service
 * worker novo, que baixa a lista outra vez e apaga a anterior.
 */
import { createHash } from "node:crypto";

/** Lê um arquivo de dist/ pelo caminho relativo ("lista.html", "_astro/x.js"); sem ele, nulo. */
export type LerDoBuild = (arquivo: string) => Uint8Array | undefined;

export interface ListaDoServiceWorker {
  readonly versao: string;
  /** Endereços como o navegador pede: "/", "/lista", "/_astro/x.js". */
  readonly enderecos: readonly string[];
}

/** Ícones e manifesto do aplicativo instalado (public/). */
export const arquivosDoAplicativo = [
  "/manifest.webmanifest",
  "/icone.svg",
  "/favicon-32.png",
  "/apple-touch-icon.png",
  "/icone-192.png",
  "/icone-512.png",
  "/icone-mascaravel-512.png",
] as const;

/** Páginas que o service worker não guarda: o 404 não é página do aplicativo. */
const paginasDeFora = new Set(["404.html"]);

/** "index.html" vira "/", "lista.html" vira "/lista"; o que não é página fica nulo. */
export function enderecoDaPagina(arquivo: string): string | null {
  if (!/^[a-z0-9-]+\.html$/.test(arquivo) || paginasDeFora.has(arquivo)) return null;
  return arquivo === "index.html" ? "/" : `/${arquivo.slice(0, -".html".length)}`;
}

/** O caminho em dist/ de um endereço: "/" é "index.html", "/lista" é "lista.html". */
export function arquivoDoEndereco(endereco: string): string {
  if (endereco === "/") return "index.html";
  const caminho = endereco.slice(1);
  return caminho.includes(".") ? caminho : `${caminho}.html`;
}

/**
 * Os arquivos de /_astro/ que a página pede no HTML: estilos, scripts, as ilhas do Astro e o
 * que os scripts escritos na página importam.
 */
export function referenciasDoHtml(html: string): string[] {
  const padrao =
    /\s(?:src|href|component-url|renderer-url|before-hydration-url)="(\/_astro\/[^"?#]+)"/g;
  const atributos = [...html.matchAll(padrao)].map(([, endereco]) => endereco!);
  const importados = importacoesDoModulo(html, "/").filter((endereco) =>
    endereco.startsWith("/_astro/"),
  );
  return [...atributos, ...importados];
}

/**
 * Os módulos que um módulo importa de forma fixa (`import ... from "./x.js"`,
 * `import "/_astro/x.js"`), como endereços. O `import("./x.js")` sob demanda fica de fora de
 * propósito: é o mapa e o leitor de QR, que precisam de internet de qualquer jeito.
 */
export function importacoesDoModulo(codigo: string, endereco: string): string[] {
  const pasta = endereco.slice(0, endereco.lastIndexOf("/") + 1);
  const padrao = /(?:\bfrom|\bimport)\s*["'](\.{0,2}\/[^"']+)["']/g;
  return [...codigo.matchAll(padrao)].map(
    ([, relativo]) => new URL(relativo!, `https://site${pasta}`).pathname,
  );
}

const ehModulo = (endereco: string) => /\.m?js$/.test(endereco);

/**
 * Monta a lista a partir das páginas de dist/. Falta de um arquivo referenciado quebra o
 * build: um service worker com a lista errada deixaria o aplicativo sem abrir sem internet.
 */
export function montarListaDoServiceWorker(
  ler: LerDoBuild,
  arquivosHtml: readonly string[],
): ListaDoServiceWorker {
  const decodificador = new TextDecoder();
  const conteudo = (endereco: string): Uint8Array => {
    const bytes = ler(arquivoDoEndereco(endereco));
    if (bytes === undefined) throw new Error(`O build não tem ${endereco}, pedido pelo site.`);
    return bytes;
  };

  const paginas = arquivosHtml
    .map(enderecoDaPagina)
    .filter((endereco): endereco is string => endereco !== null);
  const enderecos = new Set<string>([...paginas, ...arquivosDoAplicativo]);
  const pendentes = paginas.flatMap((pagina) =>
    referenciasDoHtml(decodificador.decode(conteudo(pagina))),
  );
  while (pendentes.length > 0) {
    const endereco = pendentes.pop()!;
    if (enderecos.has(endereco)) continue;
    enderecos.add(endereco);
    if (ehModulo(endereco)) {
      pendentes.push(...importacoesDoModulo(decodificador.decode(conteudo(endereco)), endereco));
    }
  }

  const ordenados = [...enderecos].sort();
  const resumo = createHash("sha256");
  for (const endereco of ordenados) {
    resumo.update(endereco).update("\0").update(conteudo(endereco)).update("\0");
  }
  return { versao: resumo.digest("hex").slice(0, 16), enderecos: ordenados };
}

/** As duas linhas de public/sw.js que o build troca. */
export const marcasDoServiceWorker = {
  versao: 'const versao = "desenvolvimento";',
  arquivos: "const arquivos = [];",
} as const;

/** Escreve a versão e a lista no service worker de public/; sem as marcas, quebra o build. */
export function montarServiceWorker(fonte: string, lista: ListaDoServiceWorker): string {
  let resultado = fonte;
  for (const [campo, marca] of Object.entries(marcasDoServiceWorker)) {
    if (resultado.split(marca).length !== 2) {
      throw new Error(`public/sw.js precisa ter a linha ${marca} uma vez só (campo ${campo}).`);
    }
  }
  resultado = resultado.replace(
    marcasDoServiceWorker.versao,
    () => `const versao = ${JSON.stringify(lista.versao)};`,
  );
  resultado = resultado.replace(
    marcasDoServiceWorker.arquivos,
    () => `const arquivos = ${JSON.stringify(lista.enderecos)};`,
  );
  return resultado;
}
