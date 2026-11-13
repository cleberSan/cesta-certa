import { describe, expect, it } from "vitest";
import {
  ehLimiteDoAssistente,
  ehRespostaDoAssistente,
  lerProblemaDoAssistente,
  limiteDaResposta,
  limiteDoContexto,
  tamanhoDaPergunta,
  tamanhoDoContexto,
} from "./assistente";

const limite = { restantesHoje: 29, restantesMes: 299, voltaEm: null };

describe("contrato do assistente", () => {
  // spec 0001 CA-31
  it("conta a pergunta em caracteres que a pessoa vê, não em unidades UTF-16", () => {
    expect(tamanhoDaPergunta("feijão")).toBe(6);
    expect(tamanhoDaPergunta("🛒🛒")).toBe(2);
    expect("🛒🛒".length).toBe(4);
  });

  // spec 0001 CA-31
  it("mede o contexto em bytes do JSON em UTF-8", () => {
    expect(tamanhoDoContexto({ a: "é" })).toBe(10);
    expect(tamanhoDoContexto({ texto: "x".repeat(limiteDoContexto) })).toBeGreaterThan(
      limiteDoContexto,
    );
  });
});

describe("limite do assistente", () => {
  it("aceita as contagens e a volta em ISO ou nula", () => {
    expect(ehLimiteDoAssistente(limite)).toBe(true);
    expect(
      ehLimiteDoAssistente({ ...limite, restantesHoje: 0, voltaEm: "2026-11-14T03:00:00.000Z" }),
    ).toBe(true);
  });

  it.each([
    ["contagem negativa", { ...limite, restantesHoje: -1 }],
    ["contagem fracionada", { ...limite, restantesMes: 1.5 }],
    ["contagem em texto", { ...limite, restantesMes: "3" }],
    ["volta fora do ISO", { ...limite, voltaEm: "amanhã" }],
    ["volta ausente", { restantesHoje: 1, restantesMes: 1 }],
    ["lista", [1, 2, null]],
    ["nulo", null],
  ])("recusa %s", (_nome, valor) => {
    expect(ehLimiteDoAssistente(valor)).toBe(false);
  });
});

describe("resposta do assistente", () => {
  it("aceita texto com o limite", () => {
    expect(ehRespostaDoAssistente({ texto: "Oi", limite })).toBe(true);
  });

  it.each([
    ["sem texto", { limite }],
    ["texto que não é texto", { texto: 1, limite }],
    ["texto grande demais", { texto: "x".repeat(limiteDaResposta + 1), limite }],
    ["sem limite", { texto: "Oi" }],
    ["limite fora do formato", { texto: "Oi", limite: { restantesHoje: 1 } }],
  ])("recusa %s", (_nome, valor) => {
    expect(ehRespostaDoAssistente(valor)).toBe(false);
  });
});

describe("erro da rota do assistente", () => {
  it("lê o código, o identificador e o limite", () => {
    expect(
      lerProblemaDoAssistente({
        code: "assistente.limite",
        traceId: "abc",
        status: 429,
        limite: { ...limite, restantesHoje: 0, voltaEm: "2026-11-14T03:00:00.000Z" },
      }),
    ).toEqual({
      code: "assistente.limite",
      traceId: "abc",
      limite: { ...limite, restantesHoje: 0, voltaEm: "2026-11-14T03:00:00.000Z" },
    });
  });

  it("aceita os códigos comuns da API, sem limite e sem identificador", () => {
    expect(lerProblemaDoAssistente({ code: "requisicao.muitas-consultas" })).toEqual({
      code: "requisicao.muitas-consultas",
      traceId: null,
      limite: null,
    });
  });

  it("descarta identificador longo e limite fora do formato", () => {
    expect(
      lerProblemaDoAssistente({
        code: "assistente.recusa",
        traceId: "x".repeat(65),
        limite: { restantesHoje: "1" },
      }),
    ).toEqual({ code: "assistente.recusa", traceId: null, limite: null });
  });

  it.each([
    ["código desconhecido", { code: "outro.codigo" }],
    ["sem código", { traceId: "abc" }],
    ["texto", "erro"],
    ["nulo", null],
  ])("recusa %s", (_nome, valor) => {
    expect(lerProblemaDoAssistente(valor)).toBeNull();
  });
});
