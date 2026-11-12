import { describe, expect, it } from "vitest";
import {
  consultarTodas,
  consultarUf,
  prepararPublicacao,
  totalDoIndice,
  type Dependencias,
  type Opcoes,
} from "./executar";
import { cidadeGrande, resposta, supermercado } from "./fixtures/overpass";

type Passo = { status: number; texto: string } | "falha-de-rede";

/** Overpass simulada: devolve os passos em ordem e anota consultas, esperas e registros. */
function simular(passos: Passo[]) {
  const consultas: string[] = [];
  const esperas: number[] = [];
  const registros: string[] = [];
  const deps: Dependencias = {
    consultar(consulta) {
      consultas.push(consulta);
      const passo = passos.shift();
      if (passo === undefined) throw new Error("consulta a mais");
      if (passo === "falha-de-rede") return Promise.reject(new Error("https://exemplo falhou"));
      return Promise.resolve(passo);
    },
    esperar(ms) {
      esperas.push(ms);
      return Promise.resolve();
    },
    registrar(linha) {
      registros.push(linha);
    },
  };
  return { deps, consultas, esperas, registros };
}

const opcoes: Opcoes = { ufs: ["SP", "RJ"], pausaMs: 20_000, tentativas: 3, esperaMs: 60_000 };
const ok = { status: 200, texto: resposta([supermercado, cidadeGrande]) };

// spec 0001 CA-07
describe("consultarUf", () => {
  it("devolve os elementos na primeira tentativa", async () => {
    const { deps, consultas, esperas } = simular([ok]);

    await expect(consultarUf("SP", deps, opcoes)).resolves.toEqual({
      uf: "SP",
      elementos: [supermercado, cidadeGrande],
    });
    expect(consultas).toHaveLength(1);
    expect(consultas[0]).toContain("BR-SP");
    expect(esperas).toEqual([]);
  });

  it("repete com espera dobrada em fila cheia, erro do servidor, falha de rede e consulta incompleta", async () => {
    const incompleta = {
      status: 200,
      texto: resposta([], { remark: "runtime error: out of memory" }),
    };
    const { deps, esperas, registros } = simular([{ status: 429, texto: "" }, "falha-de-rede", ok]);

    await expect(consultarUf("SP", deps, opcoes)).resolves.toMatchObject({ uf: "SP" });
    expect(esperas).toEqual([60_000, 120_000]);
    expect(registros).toEqual([
      "SP: tentativa 1 de 3 falhou (HTTP 429).",
      "SP: tentativa 2 de 3 falhou (falha de rede ou tempo esgotado).",
    ]);

    const segunda = simular([{ status: 504, texto: "<html>" }, incompleta, ok]);
    await expect(consultarUf("SP", segunda.deps, opcoes)).resolves.toMatchObject({ uf: "SP" });
    expect(segunda.registros[1]).toBe(
      "SP: tentativa 2 de 3 falhou (consulta incompleta: runtime error: out of memory).",
    );
  });

  it("desiste depois das tentativas e diz o último motivo, sem repetir o endereço do erro", async () => {
    const { deps, esperas } = simular([
      { status: 200, texto: "<html>" },
      { status: 503, texto: "" },
      "falha-de-rede",
    ]);

    await expect(consultarUf("SP", deps, opcoes)).resolves.toBe(
      "SP: falha de rede ou tempo esgotado.",
    );
    expect(esperas).toEqual([60_000, 120_000]);
  });

  it("não repete erro na própria consulta (4xx que não é fila cheia)", async () => {
    const { deps, consultas } = simular([{ status: 400, texto: "parse error" }]);

    await expect(consultarUf("SP", deps, opcoes)).resolves.toBe("SP: HTTP 400.");
    expect(consultas).toHaveLength(1);
  });

  it("explica a resposta que não é da Overpass", async () => {
    const { deps } = simular([{ status: 200, texto: "<html>" }]);

    await expect(consultarUf("SP", deps, { ...opcoes, tentativas: 1 })).resolves.toBe(
      "SP: resposta que não é JSON da Overpass.",
    );
  });

  it("sem tentativa nenhuma, não consulta", async () => {
    const { deps, consultas } = simular([]);

    await expect(consultarUf("SP", deps, { ...opcoes, tentativas: 0 })).resolves.toBe(
      "SP: nenhuma tentativa.",
    );
    expect(consultas).toEqual([]);
  });
});

// spec 0001 CA-07
describe("consultarTodas", () => {
  it("consulta as UFs uma por vez, com pausa entre elas", async () => {
    const { deps, consultas, esperas, registros } = simular([ok, ok]);

    const resultado = await consultarTodas(deps, opcoes);

    expect(resultado.ok && resultado.respostas.map((resposta) => resposta.uf)).toEqual([
      "SP",
      "RJ",
    ]);
    expect(consultas.map((consulta) => consulta.includes("BR-SP"))).toEqual([true, false]);
    expect(esperas).toEqual([20_000]);
    expect(registros).toEqual(["SP: 2 elementos.", "RJ: 2 elementos."]);
  });

  it("para na primeira UF que falha, sem consultar as seguintes", async () => {
    const { deps, consultas } = simular([{ status: 400, texto: "" }]);

    await expect(consultarTodas(deps, opcoes)).resolves.toEqual({
      ok: false,
      motivo: "SP: HTTP 400.",
    });
    expect(consultas).toHaveLength(1);
  });
});

// spec 0001 CA-07
describe("totalDoIndice", () => {
  it("soma os mercados do índice publicado antes", () => {
    const indice = JSON.stringify({
      versao: 1,
      geradoEm: "2026-10-03T06:23:00.000Z",
      celulas: { "-24_-47": 10, "-23_-44": 5 },
    });

    expect(totalDoIndice(indice)).toBe(15);
  });

  it.each([
    ["sem índice anterior", null],
    ["texto que não é JSON", "{"],
    ["índice fora do formato", JSON.stringify({ versao: 1 })],
  ])("devolve nulo %s", (_caso, texto) => {
    expect(totalDoIndice(texto)).toBeNull();
  });
});

// spec 0001 CA-07
describe("prepararPublicacao", () => {
  it("monta os arquivos, o relatório e a conferência", () => {
    const publicacao = prepararPublicacao(
      [{ uf: "SP", elementos: [supermercado, cidadeGrande] }],
      null,
      new Date("2026-11-03T06:23:00.000Z"),
    );

    expect([...publicacao.arquivos.keys()]).toEqual([
      "mercados/-24_-47.json",
      "mercados/indice.json",
      "cidades.json",
    ]);
    expect(publicacao.problemas).toEqual([]);
    expect(publicacao.relatorio).toContain("- Mercados: **1**");
  });

  it("aponta o problema que impede a publicação", () => {
    const publicacao = prepararPublicacao(
      [{ uf: "SP", elementos: [supermercado, cidadeGrande] }],
      100,
      new Date("2026-11-03T06:23:00.000Z"),
    );

    expect(publicacao.problemas).toEqual(["O total caiu de 100 para 1 mercados, mais de 20%."]);
    expect(publicacao.relatorio).toContain("### Problemas (a base não foi publicada)");
  });
});
