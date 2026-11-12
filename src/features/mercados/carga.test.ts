import { describe, expect, it } from "vitest";
import { carregarCidades, carregarIndice, carregarMercados, type Buscar } from "./carga";

const indice = {
  versao: 1,
  geradoEm: "2026-11-03T06:23:00.000Z",
  celulas: { "-24_-47": 1, "-23_-47": 1 },
};
const mercadoA = { id: "n1", nome: "Mercado A", tipo: "supermercado", lat: -23.5, lon: -46.6 };
const mercadoB = { id: "n2", nome: "Mercado B", tipo: "bairro", lat: -22.9, lon: -46.9 };
const celulaA = { versao: 1, celula: "-24_-47", mercados: [mercadoA, { id: "estragado" }] };
const celulaB = { versao: 1, celula: "-23_-47", mercados: [mercadoB] };
const cidades = {
  versao: 1,
  geradoEm: "2026-11-03T06:23:00.000Z",
  cidades: [{ nome: "Cidade Exemplo", uf: "SP", lat: -23.55, lon: -46.63 }],
};

type Arquivo = unknown | "404" | "500" | "sem-conexao" | "não-é-json";

/** Site simulado: devolve os arquivos do mapa e anota os caminhos pedidos. */
function site(arquivos: Record<string, Arquivo>) {
  const pedidos: string[] = [];
  const buscar: Buscar = async (caminho) => {
    pedidos.push(caminho);
    const arquivo = Object.hasOwn(arquivos, caminho) ? arquivos[caminho] : "404";
    if (arquivo === "sem-conexao") throw new TypeError("Failed to fetch");
    if (arquivo === "404") return { ok: false, status: 404, json: async () => ({}) };
    if (arquivo === "500") return { ok: false, status: 500, json: async () => ({}) };
    return {
      ok: true,
      status: 200,
      json: async () => {
        if (arquivo === "não-é-json") throw new SyntaxError("Unexpected token <");
        return arquivo;
      },
    };
  };
  return { buscar, pedidos };
}

// spec 0001 CA-06, CA-07
describe("carregarIndice", () => {
  it("lê o índice publicado", async () => {
    const { buscar, pedidos } = site({ "/data/mercados/indice.json": indice });

    const lido = await carregarIndice(buscar);

    expect(lido.ok && [...lido.valor.celulas.keys()]).toEqual(["-24_-47", "-23_-47"]);
    expect(pedidos).toEqual(["/data/mercados/indice.json"]);
  });

  it.each([
    ["sem-base", "404"],
    ["sem-conexao", "sem-conexao"],
    ["sem-conexao", "500"],
    ["base-invalida", "não-é-json"],
    ["base-invalida", { ...indice, versao: 2 }],
  ])("diz %s quando o índice vem %j", async (erro, arquivo) => {
    const { buscar } = site({ "/data/mercados/indice.json": arquivo });

    expect(await carregarIndice(buscar)).toEqual({ ok: false, erro });
  });
});

// spec 0001 CA-06, CA-07
describe("carregarMercados", () => {
  const lido = {
    geradoEm: indice.geradoEm,
    celulas: new Map([
      ["-24_-47", 1],
      ["-23_-47", 1],
    ]),
  };

  it("baixa só as células pedidas que o índice diz ter mercado", async () => {
    const { buscar, pedidos } = site({
      "/data/mercados/-24_-47.json": celulaA,
      "/data/mercados/-23_-47.json": celulaB,
    });

    const carregados = await carregarMercados(buscar, lido, ["-24_-47", "-24_-46"]);

    expect(carregados).toEqual({ ok: true, valor: { mercados: [mercadoA], recusados: 1 } });
    expect(pedidos).toEqual(["/data/mercados/-24_-47.json"]);
  });

  it("junta as células e não pede nada quando nenhuma tem mercado", async () => {
    const { buscar, pedidos } = site({
      "/data/mercados/-24_-47.json": celulaA,
      "/data/mercados/-23_-47.json": celulaB,
    });

    const juntas = await carregarMercados(buscar, lido, ["-23_-47", "-24_-47"]);
    expect(juntas.ok && juntas.valor.mercados).toEqual([mercadoB, mercadoA]);

    pedidos.length = 0;
    expect(await carregarMercados(buscar, lido, ["0_0"])).toEqual({
      ok: true,
      valor: { mercados: [], recusados: 0 },
    });
    expect(pedidos).toEqual([]);
  });

  it.each([
    ["base-invalida", "404"],
    ["sem-conexao", "sem-conexao"],
    ["base-invalida", "não-é-json"],
    ["base-invalida", { ...celulaA, celula: "-23_-47" }],
  ])("diz %s quando a célula vem %j", async (erro, arquivo) => {
    const { buscar } = site({ "/data/mercados/-24_-47.json": arquivo });

    expect(await carregarMercados(buscar, lido, ["-24_-47"])).toEqual({ ok: false, erro });
  });
});

// spec 0001 CA-05
describe("carregarCidades", () => {
  it("lê as cidades", async () => {
    const { buscar } = site({ "/data/cidades.json": cidades });

    expect(await carregarCidades(buscar)).toEqual({ ok: true, valor: cidades.cidades });
  });

  it.each([
    ["sem-base", "404"],
    ["sem-conexao", "sem-conexao"],
    ["base-invalida", { ...cidades, cidades: {} }],
  ])("diz %s quando as cidades vêm %j", async (erro, arquivo) => {
    const { buscar } = site({ "/data/cidades.json": arquivo });

    expect(await carregarCidades(buscar)).toEqual({ ok: false, erro });
  });
});
