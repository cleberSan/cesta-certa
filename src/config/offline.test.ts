import { describe, expect, it } from "vitest";
import {
  arquivoDoEndereco,
  arquivosDoAplicativo,
  enderecoDaPagina,
  importacoesDoModulo,
  marcasDoServiceWorker,
  montarListaDoServiceWorker,
  montarServiceWorker,
  referenciasDoHtml,
  type LerDoBuild,
} from "./offline";

const texto = (conteudo: string) => new TextEncoder().encode(conteudo);

/** Um dist/ pequeno, no formato que o Astro grava. */
function build(arquivos: Record<string, string>): LerDoBuild {
  const todos: Record<string, string> = {
    ...Object.fromEntries(arquivosDoAplicativo.map((endereco) => [endereco.slice(1), "ícone"])),
    ...arquivos,
  };
  return (arquivo) => (arquivo in todos ? texto(todos[arquivo]!) : undefined);
}

const paginaComIlha = `<!doctype html><html><head>
<link rel="stylesheet" href="/_astro/BaseLayout.abc.css">
<link rel="stylesheet" href="/_astro/lista.def.css"></head><body>
<astro-island uid="1" component-url="/_astro/ListaDoMes.ghi.js" component-export="default"
 renderer-url="/_astro/client.jkl.js" before-hydration-url="/_astro/antes.mno.js" client="load">
</astro-island><script type="module" src="/_astro/aviso.pqr.js"></script>
<script type="module">import{a}from"/_astro/escrito.abc.js";import"/outro/fora.js";</script>
<a href="/precos">Preços</a><img src="/icone.svg" alt=""></body></html>`;

const distDeExemplo = {
  "index.html": '<link rel="stylesheet" href="/_astro/BaseLayout.abc.css">',
  "lista.html": paginaComIlha,
  "404.html": '<link rel="stylesheet" href="/_astro/BaseLayout.abc.css">',
  "_astro/BaseLayout.abc.css": "body{}",
  "_astro/lista.def.css": "ul{}",
  "_astro/ListaDoMes.ghi.js":
    'import{a as b}from"./react.stu.js";import"./efeito.vwx.js";const m=()=>import("./motor.yz.js");',
  "_astro/client.jkl.js": 'import{r}from"./react.stu.js";',
  "_astro/antes.mno.js": "",
  "_astro/aviso.pqr.js": "",
  "_astro/escrito.abc.js": "",
  "_astro/react.stu.js": "export const r=1;",
  "_astro/efeito.vwx.js": 'export*from"./react.stu.js";',
  "_astro/motor.yz.js": "o mapa, carregado sob demanda",
};

// spec 0001 CA-36
describe("lista do service worker", () => {
  it("guarda as páginas, o que elas carregam, o que as ilhas importam e os ícones", () => {
    const lista = montarListaDoServiceWorker(build(distDeExemplo), [
      "404.html",
      "index.html",
      "lista.html",
    ]);

    expect(lista.enderecos).toEqual(
      [
        "/",
        "/lista",
        ...arquivosDoAplicativo,
        "/_astro/BaseLayout.abc.css",
        "/_astro/lista.def.css",
        "/_astro/ListaDoMes.ghi.js",
        "/_astro/client.jkl.js",
        "/_astro/antes.mno.js",
        "/_astro/aviso.pqr.js",
        "/_astro/escrito.abc.js",
        "/_astro/react.stu.js",
        "/_astro/efeito.vwx.js",
      ].sort(),
    );
  });

  it("deixa de fora o 404 e os módulos carregados sob demanda, como o mapa", () => {
    const { enderecos } = montarListaDoServiceWorker(build(distDeExemplo), [
      "404.html",
      "lista.html",
    ]);

    expect(enderecos).not.toContain("/404");
    expect(enderecos).not.toContain("/_astro/motor.yz.js");
  });

  it("muda a versão quando muda o conteúdo de um arquivo, e só então", () => {
    const paginas = ["index.html", "lista.html"];
    const antes = montarListaDoServiceWorker(build(distDeExemplo), paginas);
    const igual = montarListaDoServiceWorker(build(distDeExemplo), [...paginas].reverse());
    const depois = montarListaDoServiceWorker(
      build({ ...distDeExemplo, "_astro/react.stu.js": "export const r=2;" }),
      paginas,
    );

    expect(antes.versao).toMatch(/^[0-9a-f]{16}$/);
    expect(igual.versao).toBe(antes.versao);
    expect(depois.versao).not.toBe(antes.versao);
  });

  it("quebra o build quando falta um arquivo que o site pede", () => {
    const incompleto = Object.fromEntries(
      Object.entries(distDeExemplo).filter(([arquivo]) => arquivo !== "_astro/react.stu.js"),
    );

    expect(() => montarListaDoServiceWorker(build(incompleto), ["lista.html"])).toThrow(
      "O build não tem /_astro/react.stu.js, pedido pelo site.",
    );
  });

  it("quebra o build quando falta um ícone do aplicativo", () => {
    const semIcone: LerDoBuild = (arquivo) =>
      arquivo === "icone-192.png" ? undefined : build(distDeExemplo)(arquivo);

    expect(() => montarListaDoServiceWorker(semIcone, ["index.html"])).toThrow(/icone-192\.png/);
  });

  // spec 0002 CA-16
  it("guarda as fontes que a página pré-carrega, para abrir sem internet com elas", () => {
    const pagina = `<!doctype html><html><head>
<style>@font-face{font-family:Inter-x;src:url("/_astro/fonts/abc123.woff2") format("woff2")}</style>
<link rel="preload" href="/_astro/fonts/abc123.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/_astro/fonts/def456.woff2" as="font" type="font/woff2" crossorigin>
</head><body></body></html>`;
    const lista = montarListaDoServiceWorker(
      build({
        "index.html": pagina,
        "_astro/fonts/abc123.woff2": "fonte",
        "_astro/fonts/def456.woff2": "fonte",
      }),
      ["index.html"],
    );

    expect(lista.enderecos).toContain("/_astro/fonts/abc123.woff2");
    expect(lista.enderecos).toContain("/_astro/fonts/def456.woff2");
  });
});

describe("endereços e arquivos do build", () => {
  it.each([
    ["index.html", "/"],
    ["lista.html", "/lista"],
    ["demonstracao.html", "/demonstracao"],
    ["404.html", null],
    ["_headers", null],
    ["pasta/pagina.html", null],
    ["Lista.html", null],
  ])("a página de %s é %s", (arquivo, endereco) => {
    expect(enderecoDaPagina(arquivo)).toBe(endereco);
  });

  it.each([
    ["/", "index.html"],
    ["/lista", "lista.html"],
    ["/_astro/x.js", "_astro/x.js"],
    ["/manifest.webmanifest", "manifest.webmanifest"],
  ])("%s fica em %s", (endereco, arquivo) => {
    expect(arquivoDoEndereco(endereco)).toBe(arquivo);
  });

  it("lê só os arquivos de /_astro/ dos atributos que carregam algo", () => {
    expect(referenciasDoHtml(paginaComIlha)).toEqual([
      "/_astro/BaseLayout.abc.css",
      "/_astro/lista.def.css",
      "/_astro/ListaDoMes.ghi.js",
      "/_astro/client.jkl.js",
      "/_astro/antes.mno.js",
      "/_astro/aviso.pqr.js",
      "/_astro/escrito.abc.js",
    ]);
  });

  it("resolve as importações fixas a partir da pasta do módulo e ignora as sob demanda", () => {
    const codigo =
      'import{a}from"./a.js";import"../b.js";export{c}from "./c.mjs";import"/_astro/e.js";const d=import("./d.js");';

    expect(importacoesDoModulo(codigo, "/_astro/pasta/modulo.js")).toEqual([
      "/_astro/pasta/a.js",
      "/_astro/b.js",
      "/_astro/pasta/c.mjs",
      "/_astro/e.js",
    ]);
  });
});

describe("montarServiceWorker", () => {
  const fonte = `// cabeçalho\n${marcasDoServiceWorker.versao}\n${marcasDoServiceWorker.arquivos}\nconst resto = 1;\n`;
  const lista = { versao: "0123456789abcdef", enderecos: ["/", "/_astro/a$&.js"] };

  it("escreve a versão e a lista no lugar das marcas", () => {
    expect(montarServiceWorker(fonte, lista)).toBe(
      `// cabeçalho\nconst versao = "0123456789abcdef";\nconst arquivos = ["/","/_astro/a$&.js"];\nconst resto = 1;\n`,
    );
  });

  it.each([
    ["sem a marca da versão", fonte.replace(marcasDoServiceWorker.versao, "")],
    ["com a lista duas vezes", `${fonte}${marcasDoServiceWorker.arquivos}\n`],
  ])("quebra o build %s", (_caso, alterada) => {
    expect(() => montarServiceWorker(alterada, lista)).toThrow(/public\/sw\.js precisa ter/);
  });
});
