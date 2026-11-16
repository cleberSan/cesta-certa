/**
 * O service worker de public/sw.js (spec 0001, CA-36; ADR-0007), rodado numa máquina virtual do
 * Node com o cache e a rede de mentira. O E2E (e2e/offline.spec.ts) prova o mesmo no navegador.
 */
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { montarServiceWorker } from "./offline";

const origem = "https://cesta.exemplo";
// Rótulo legível no lugar dos 16 caracteres hexadecimais do build: o CodeQL trata texto hex
// fixo que vira código como carga escondida (js/hardcoded-data-interpreted-as-code), e para o
// service worker a versão é só um nome.
const versao = "versao-de-teste";
const enderecos = ["/", "/lista", "/_astro/ilha.js", "/icone.svg"];
const codigo = montarServiceWorker(
  readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8"),
  { versao, enderecos },
);

interface Resposta {
  readonly ok: boolean;
  readonly type: string;
  readonly redirected: boolean;
  readonly corpo: string;
  clone(): Resposta;
}

function resposta(corpo: string, campos: Partial<Omit<Resposta, "clone">> = {}): Resposta {
  const feita: Resposta = {
    ok: true,
    type: "basic",
    redirected: false,
    corpo,
    ...campos,
    clone: () => feita,
  };
  return feita;
}

interface Pedido {
  readonly url: string;
  readonly method: string;
  readonly mode: string;
}

const pedido = (caminho: string, campos: Partial<Pedido> = {}): Pedido => ({
  url: new URL(caminho, origem).href,
  method: "GET",
  mode: "cors",
  ...campos,
});

function chave(entrada: string | Pedido, ignorarBusca = false): string {
  const url = new URL(typeof entrada === "string" ? entrada : entrada.url, origem);
  return ignorarBusca ? url.origin + url.pathname : url.href;
}

/** CacheStorage em memória, com as opções que o service worker usa. */
class Caches {
  readonly porNome = new Map<string, Map<string, Resposta>>();

  async open(nome: string) {
    const mapa = this.porNome.get(nome) ?? new Map<string, Resposta>();
    this.porNome.set(nome, mapa);
    return {
      put: async (entrada: string | Pedido, valor: Resposta) => {
        mapa.set(chave(entrada), valor);
      },
    };
  }

  async keys() {
    return [...this.porNome.keys()];
  }

  async delete(nome: string) {
    return this.porNome.delete(nome);
  }

  async match(entrada: string | Pedido, opcoes: { cacheName?: string; ignoreSearch?: boolean }) {
    const ignorar = opcoes.ignoreSearch === true;
    const procurada = chave(entrada, ignorar);
    const mapas =
      opcoes.cacheName === undefined
        ? [...this.porNome.values()]
        : [this.porNome.get(opcoes.cacheName) ?? new Map<string, Resposta>()];
    for (const mapa of mapas) {
      for (const [guardada, valor] of mapa) {
        if (chave(guardada, ignorar) === procurada) return valor;
      }
    }
    return undefined;
  }

  conteudo(nome: string): Record<string, string> {
    const mapa = this.porNome.get(nome) ?? new Map<string, Resposta>();
    return Object.fromEntries(
      [...mapa].map(([url, valor]) => [new URL(url).pathname, valor.corpo]),
    );
  }
}

type Ouvinte = (evento: unknown) => void;

let caches: Caches;
let ouvintes: Map<string, Ouvinte>;
let rede: ReturnType<
  typeof vi.fn<(entrada: string | Pedido, opcoes?: object) => Promise<Resposta>>
>;
let skipWaiting: ReturnType<typeof vi.fn>;
let claim: ReturnType<typeof vi.fn>;

const cacheDoApp = `cesta-certa-app-${versao}`;

beforeEach(() => {
  caches = new Caches();
  ouvintes = new Map();
  rede = vi.fn(async (entrada: string | Pedido) => resposta(`rede ${chave(entrada)}`));
  skipWaiting = vi.fn(async () => undefined);
  claim = vi.fn(async () => undefined);
  runInNewContext(codigo, {
    URL,
    caches,
    fetch: rede,
    self: {
      location: { origin: origem },
      clients: { claim },
      skipWaiting,
      addEventListener: (tipo: string, ouvinte: Ouvinte) => ouvintes.set(tipo, ouvinte),
    },
  });
});

/** Dispara um evento e espera o que ele pediu para esperar. */
async function disparar(tipo: string, campos: object = {}) {
  const esperas: Promise<unknown>[] = [];
  let respondeu: Promise<Resposta> | undefined;
  const evento = {
    ...campos,
    waitUntil: (promessa: Promise<unknown>) => esperas.push(promessa),
    respondWith: (promessa: Promise<Resposta>) => {
      respondeu = promessa;
    },
  };
  ouvintes.get(tipo)!(evento);
  const resultado = respondeu === undefined ? undefined : await respondeu.catch((erro) => erro);
  await Promise.all(esperas);
  return resultado;
}

const semRede = () => rede.mockRejectedValue(new TypeError("Failed to fetch"));

// spec 0001 CA-36
describe("instalação e ativação", () => {
  it("guarda toda a lista do build, pedindo à rede sem cache do navegador", async () => {
    await disparar("install");

    expect(Object.keys(caches.conteudo(cacheDoApp)).sort()).toEqual([...enderecos].sort());
    expect(rede).toHaveBeenCalledWith("/lista", { cache: "no-cache" });
    expect(skipWaiting).toHaveBeenCalled();
  });

  it.each([
    ["um arquivo que falta", resposta("", { ok: false })],
    ["um redirecionamento", resposta("", { redirected: true })],
  ])("não instala com %s na lista", async (_caso, ruim) => {
    rede.mockImplementation(async (entrada) => (entrada === "/lista" ? ruim : resposta("ok")));

    await expect(disparar("install")).rejects.toThrow("Não deu para guardar /lista.");
    expect(skipWaiting).not.toHaveBeenCalled();
  });

  it("apaga as listas antigas e os arquivos guardados por elas, mas mantém a base e outros caches", async () => {
    for (const nome of [
      "cesta-certa-app-antiga",
      "cesta-certa-arquivos",
      "cesta-certa-dados",
      cacheDoApp,
      "outro-site",
    ]) {
      await caches.open(nome);
    }

    await disparar("activate");

    expect(await caches.keys()).toEqual(["cesta-certa-dados", cacheDoApp, "outro-site"]);
    expect(claim).toHaveBeenCalled();
  });
});

// spec 0001 CA-36
describe("páginas", () => {
  const navegar = (caminho: string) =>
    disparar("fetch", { request: pedido(caminho, { mode: "navigate" }) });

  it("com internet, mostra a página da rede e guarda a cópia sem a busca", async () => {
    const pagina = await navegar("/lista?x=1");

    expect(pagina).toMatchObject({ corpo: `rede ${origem}/lista?x=1` });
    expect(caches.conteudo(cacheDoApp)).toEqual({ "/lista": `rede ${origem}/lista?x=1` });
  });

  it("não guarda página fora da lista nem resposta de erro", async () => {
    await navegar("/pagina-que-nao-existe");
    rede.mockResolvedValueOnce(resposta("erro", { ok: false }));
    await navegar("/lista");

    expect(caches.conteudo(cacheDoApp)).toEqual({});
  });

  it("sem internet, abre a cópia guardada, com ou sem barra e busca no final", async () => {
    await disparar("install");
    semRede();

    expect(await navegar("/lista/")).toMatchObject({ corpo: `rede ${origem}/lista` });
    expect(await navegar("/?origem=atalho")).toMatchObject({ corpo: `rede ${origem}/` });
  });

  it("sem internet e sem cópia, deixa o navegador mostrar o erro de conexão", async () => {
    semRede();

    expect(await navegar("/lista")).toBeInstanceOf(TypeError);
    expect(await navegar("/pagina-que-nao-existe")).toBeInstanceOf(TypeError);
  });
});

// spec 0001 CA-36
describe("arquivos e base de mercados", () => {
  const buscar = (caminho: string) => disparar("fetch", { request: pedido(caminho) });

  it("usa a cópia do arquivo com hash sem ir à rede", async () => {
    await disparar("install");
    rede.mockClear();

    expect(await buscar("/_astro/ilha.js")).toMatchObject({
      corpo: `rede ${origem}/_astro/ilha.js`,
    });
    expect(rede).not.toHaveBeenCalled();
  });

  it("guarda o arquivo com hash que não estava na lista na primeira vez que baixa", async () => {
    await buscar("/_astro/outro.js");
    semRede();

    expect(await buscar("/_astro/outro.js")).toMatchObject({
      corpo: `rede ${origem}/_astro/outro.js`,
    });
    expect(caches.conteudo("cesta-certa-arquivos")).toHaveProperty(["/_astro/outro.js"]);
  });

  it("baixa a base de mercados da rede e, sem internet, usa a última cópia", async () => {
    await buscar("/data/mercados/indice.json");
    rede.mockResolvedValueOnce(resposta("versão nova"));
    expect(await buscar("/data/mercados/indice.json")).toMatchObject({ corpo: "versão nova" });

    semRede();
    expect(await buscar("/data/mercados/indice.json")).toMatchObject({ corpo: "versão nova" });
    expect(await buscar("/data/mercados/-24_-47.json")).toBeInstanceOf(TypeError);
  });

  it("não guarda a região que não existe na base", async () => {
    rede.mockResolvedValueOnce(resposta("", { ok: false }));
    await buscar("/data/mercados/-24_-47.json");

    expect(caches.conteudo("cesta-certa-dados")).toEqual({});
  });
});

// spec 0001 CA-36
describe("o que o service worker não toca", () => {
  it.each([
    ["a API da nota", pedido("/api/nfce/consultar")],
    ["a API do assistente", pedido("/api/assistente", { method: "POST" })],
    ["a raiz da API", pedido("/api")],
    ["um envio", pedido("/lista", { method: "POST", mode: "navigate" })],
    ["outro site", pedido("https://tiles.openfreemap.org/styles/liberty")],
    ["arquivo do site fora da lista", pedido("/robots.txt")],
  ])("%s vai direto à rede", async (_caso, outro) => {
    expect(await disparar("fetch", { request: outro })).toBeUndefined();
    expect(rede).not.toHaveBeenCalled();
  });
});

describe("sem a lista do build", () => {
  it("instala sem guardar nada, como no `astro dev`", async () => {
    ouvintes = new Map();
    runInNewContext(readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8"), {
      URL,
      caches,
      fetch: rede,
      self: {
        location: { origin: origem },
        clients: { claim },
        skipWaiting,
        addEventListener: (tipo: string, ouvinte: Ouvinte) => ouvintes.set(tipo, ouvinte),
      },
    });

    await disparar("install");

    expect(caches.conteudo("cesta-certa-app-desenvolvimento")).toEqual({});
    expect(rede).not.toHaveBeenCalled();
  });
});
