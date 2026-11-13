import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { apiSecurityHeaders } from "../../src/config/security";
import {
  limiteDaPergunta,
  limiteDoContexto,
  rotaDoAssistente,
} from "../../src/shared/contratos/assistente";
import { falha, sucesso, type Resultado } from "../../src/shared/resultado";
import { ehObjeto } from "../../src/shared/validacao";
import { tratarApi, type DependenciasDaApi } from "../api";
import type { Evento } from "../observabilidade/registro";
import type { ConfiguracaoDoAssistente, MotivoDeDesligado } from "./config";
import type { BancoD1 } from "./cota";
import { abrirD1, type D1DeTeste } from "./fixtures/d1";
import type { FalhaDoProvedor, Provedor, RespostaDoProvedor } from "./provedor";
import { custoEstimadoUsd } from "./rota";

const origem = "https://cesta-certa.exemplo.workers.dev";
const traceId = "0b9d6f0e-1111-4222-8333-444455556666";
const codigo = "codigo-de-teste-do-assistente-com-40-letras";
/** 13/11/2026, 14h em Brasília: o dia vira em 10 horas. */
const sextaAsDuas = Date.UTC(2026, 10, 13, 17, 0, 0);
const pergunta = "Vale a pena ir a dois mercados?";
const contexto = { opcoes: [{ nome: "Mercadinho da Praça", total: "R$ 81,15" }] };
const textoDaResposta = "Vale: a combinação economiza R$ 28,00.";

let d1: D1DeTeste;

beforeAll(async () => {
  d1 = await abrirD1();
}, 30_000);

afterAll(async () => {
  await d1.fechar();
});

beforeEach(async () => {
  await d1.limpar();
});

type Saida = Resultado<RespostaDoProvedor, FalhaDoProvedor>;

interface Cenario {
  deps: DependenciasDaApi;
  eventos: Evento[];
  perguntas: string[];
  chavesDoLimite: string[];
}

function cenario(
  opcoes: {
    saida?: Saida;
    configuracao?: Resultado<ConfiguracaoDoAssistente, MotivoDeDesligado>;
    banco?: BancoD1;
  } = {},
): Cenario {
  const eventos: Evento[] = [];
  const perguntas: string[] = [];
  const chavesDoLimite: string[] = [];
  const provedor: Provedor = {
    nome: "falso",
    modelo: "modelo-falso",
    responder: async (pedido) => {
      perguntas.push(pedido.pergunta);
      return (
        opcoes.saida ??
        sucesso({
          texto: textoDaResposta,
          parada: "end_turn",
          tokensEntrada: 2000,
          tokensSaida: 300,
        })
      );
    },
  };
  let relogio = sextaAsDuas;
  return {
    eventos,
    perguntas,
    chavesDoLimite,
    deps: {
      buscar: () => Promise.reject(new Error("o assistente não busca páginas")),
      registrar: (evento) => eventos.push(evento),
      agora: () => (relogio += 5),
      gerarId: () => traceId,
      limite: {
        limit: async ({ key }) => {
          chavesDoLimite.push(key);
          return { success: true };
        },
      },
      assistente: () =>
        opcoes.configuracao ??
        sucesso({
          codigo,
          banco: opcoes.banco ?? d1.banco,
          provedor,
          limites: { porDia: 2, porMes: 3 },
        }),
    },
  };
}

function pedir(corpo: unknown, cabecalhos: Record<string, string> = {}): Request {
  return new Request(`${origem}${rotaDoAssistente}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origem,
      Authorization: `Bearer ${codigo}`,
      ...cabecalhos,
    },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

async function problemaDe(resposta: Response): Promise<Record<string, unknown>> {
  expect(resposta.headers.get("Content-Type")).toBe("application/problem+json; charset=utf-8");
  const corpo: unknown = await resposta.json();
  if (!ehObjeto(corpo)) throw new Error("Não é ProblemDetails");
  expect(corpo["status"]).toBe(resposta.status);
  expect(corpo["traceId"]).toBe(traceId);
  return corpo;
}

/** Faz uma pergunta válida e devolve quantas sobram hoje: prova se algo gastou crédito. */
async function restantesHoje(): Promise<unknown> {
  const resposta = await tratarApi(pedir({ pergunta, contexto }), cenario().deps);
  const corpo: unknown = await resposta.json();
  return ehObjeto(corpo) && ehObjeto(corpo["limite"]) ? corpo["limite"]["restantesHoje"] : null;
}

describe("POST /api/assistente", () => {
  it("responde o texto e quanto sobra da cota, com os cabeçalhos da API", async () => {
    // Arrange
    const { deps, perguntas, eventos } = cenario();

    // Act
    const resposta = await tratarApi(pedir({ pergunta: `  ${pergunta}  `, contexto }), deps);

    // Assert
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({
      texto: textoDaResposta,
      limite: { restantesHoje: 1, restantesMes: 2, voltaEm: null },
    });
    for (const [nome, valor] of Object.entries(apiSecurityHeaders)) {
      expect(resposta.headers.get(nome), nome).toBe(valor);
    }
    expect(resposta.headers.get("X-Correlation-Id")).toBe(traceId);
    expect(perguntas).toEqual([pergunta]);
    expect(eventos).toEqual([
      {
        evento: "assistente",
        traceId,
        resultado: "ok",
        prompt: "assistente-v1",
        duracaoMs: expect.any(Number) as number,
        provedor: "falso",
        modelo: "modelo-falso",
        tokensEntrada: 2000,
        tokensSaida: 300,
        custoUsd: custoEstimadoUsd(2000, 300),
        parada: "end_turn",
      },
    ]);
  });

  it("estima o custo pela tabela do Haiku 5.5", () => {
    expect(custoEstimadoUsd(8000, 3000)).toBe(0.0023);
    expect(custoEstimadoUsd(0, 0)).toBe(0);
  });

  it("conta no limite por cliente com chave própria, separada da nota", async () => {
    const { deps, chavesDoLimite } = cenario();

    await tratarApi(pedir({ pergunta, contexto }, { "CF-Connecting-IP": "203.0.113.9" }), deps);

    expect(chavesDoLimite).toEqual(["/api/assistente 203.0.113.9"]);
  });

  describe("código de acesso (CA-29)", () => {
    // spec 0001 CA-29
    it.each([
      ["sem o cabeçalho", { Authorization: "" }],
      ["com o código errado", { Authorization: `Bearer ${codigo.slice(0, -1)}x` }],
      ["com outro esquema", { Authorization: `Basic ${codigo}` }],
    ])("responde 401 %s, sem chamar o provedor nem gastar crédito", async (_, cabecalhos) => {
      // Arrange
      const { deps, perguntas, eventos } = cenario();

      // Act
      const resposta = await tratarApi(pedir({ pergunta, contexto }, cabecalhos), deps);

      // Assert
      expect(resposta.status).toBe(401);
      expect(resposta.headers.get("WWW-Authenticate")).toBe('Bearer realm="assistente"');
      expect(await problemaDe(resposta)).toMatchObject({ code: "assistente.nao-autorizado" });
      expect(perguntas).toEqual([]);
      expect(eventos).toMatchObject([{ evento: "assistente", resultado: "nao-autorizado" }]);
      expect(await restantesHoje()).toBe(1);
    });

    // spec 0001 CA-29
    it("confere o código antes de ler o corpo: corpo enorme sem código ainda é 401", async () => {
      const { deps } = cenario();
      const enorme = JSON.stringify({ pergunta, contexto: { x: "a".repeat(100_000) } });

      const resposta = await tratarApi(pedir(enorme, { Authorization: "" }), deps);

      expect(resposta.status).toBe(401);
    });
  });

  describe("tamanho e formato (CA-31)", () => {
    // spec 0001 CA-31
    it.each([
      [
        "a pergunta passa de 500 caracteres",
        { pergunta: "a".repeat(limiteDaPergunta + 1), contexto },
      ],
      [
        "o contexto passa de 32 KB",
        { pergunta, contexto: { texto: "a".repeat(limiteDoContexto - 10) } },
      ],
    ])("recusa com 413 quando %s, sem chamar o provedor nem gastar crédito", async (_, corpo) => {
      const { deps, perguntas } = cenario();

      const resposta = await tratarApi(pedir(corpo), deps);

      expect(resposta.status).toBe(413);
      expect(await problemaDe(resposta)).toMatchObject({ code: "assistente.grande-demais" });
      expect(perguntas).toEqual([]);
      expect(await restantesHoje()).toBe(1);
    });

    // spec 0001 CA-31
    it("aceita exatamente 500 caracteres, mesmo de emoji (1.000 unidades UTF-16)", async () => {
      const { deps } = cenario();

      const resposta = await tratarApi(
        pedir({ pergunta: "🛒".repeat(limiteDaPergunta), contexto }),
        deps,
      );

      expect(resposta.status).toBe(200);
    });

    // spec 0001 CA-31
    it("recusa pelo tamanho declarado sem ler o corpo", async () => {
      const { deps } = cenario();

      const resposta = await tratarApi(
        pedir({ pergunta, contexto }, { "Content-Length": String(64 * 1024) }),
        deps,
      );

      expect(resposta.status).toBe(413);
    });

    // spec 0001 CA-31
    it("recusa um corpo maior que o teto mesmo sem tamanho declarado", async () => {
      const { deps } = cenario();

      const resposta = await tratarApi(pedir(`{"pergunta":"${"a".repeat(40 * 1024)}"}`), deps);

      expect(resposta.status).toBe(413);
      expect(await problemaDe(resposta)).toMatchObject({ code: "assistente.grande-demais" });
    });

    it("recusa com 415 corpo que não é JSON", async () => {
      const { deps } = cenario();

      const resposta = await tratarApi(pedir("pergunta", { "Content-Type": "text/plain" }), deps);

      expect(resposta.status).toBe(415);
    });

    it.each([
      ["JSON quebrado", "{"],
      ["uma lista", "[]"],
      ["sem pergunta", JSON.stringify({ contexto })],
      ["pergunta vazia", JSON.stringify({ pergunta: "   ", contexto })],
      ["pergunta que não é texto", JSON.stringify({ pergunta: 42, contexto })],
      ["contexto que é lista", JSON.stringify({ pergunta, contexto: [] })],
      ["sem contexto", JSON.stringify({ pergunta })],
    ])("recusa com 400 %s", async (_, corpo) => {
      const { deps, perguntas } = cenario();

      const resposta = await tratarApi(pedir(corpo), deps);

      expect(resposta.status).toBe(400);
      expect(await problemaDe(resposta)).toMatchObject({ code: "requisicao.invalida" });
      expect(perguntas).toEqual([]);
    });
  });

  describe("cota (CA-30)", () => {
    // spec 0001 CA-30
    it("depois do limite do dia, responde 429 com quando volta, sem chamar o provedor", async () => {
      // Arrange: o limite do cenário é 2 por dia.
      const { deps, perguntas, eventos } = cenario();
      await tratarApi(pedir({ pergunta, contexto }), deps);
      await tratarApi(pedir({ pergunta, contexto }), deps);

      // Act
      const resposta = await tratarApi(pedir({ pergunta, contexto }), deps);

      // Assert
      expect(resposta.status).toBe(429);
      const problema = await problemaDe(resposta);
      expect(problema).toMatchObject({
        code: "assistente.limite",
        detail: "As perguntas de hoje acabaram.",
        limite: { restantesHoje: 0, restantesMes: 1, voltaEm: "2026-11-14T03:00:00.000Z" },
      });
      // Faltam 10 horas para a meia-noite de Brasília (o relógio do teste andou alguns ms).
      expect(Number(resposta.headers.get("Retry-After"))).toBe(10 * 60 * 60);
      expect(perguntas).toHaveLength(2);
      expect(eventos.at(-1)).toMatchObject({ resultado: "limite", restantesMes: 1 });
    });

    // spec 0001 CA-30
    it("com o mês esgotado, diz que acabou o mês", async () => {
      const { deps } = cenario();
      const ontem = cenario();
      ontem.deps.agora = () => sextaAsDuas - 24 * 60 * 60 * 1000;
      await tratarApi(pedir({ pergunta, contexto }), ontem.deps);
      await tratarApi(pedir({ pergunta, contexto }), deps);
      await tratarApi(pedir({ pergunta, contexto }), deps);

      const resposta = await tratarApi(pedir({ pergunta, contexto }), deps);

      expect(await problemaDe(resposta)).toMatchObject({
        detail: "As perguntas deste mês acabaram.",
        limite: { restantesMes: 0, voltaEm: "2026-12-01T03:00:00.000Z" },
      });
    });

    it("sem o contador, recusa a pergunta: sem trava de custo não há chamada", async () => {
      const banco: BancoD1 = {
        prepare: () => ({ bind: () => banco.prepare("") }),
        batch: () => Promise.reject(new TypeError("D1 fora do ar")),
      };
      const { deps, perguntas, eventos } = cenario({ banco });

      const resposta = await tratarApi(pedir({ pergunta, contexto }), deps);

      expect(resposta.status).toBe(503);
      expect(await problemaDe(resposta)).toMatchObject({ code: "assistente.indisponivel" });
      expect(perguntas).toEqual([]);
      expect(eventos).toMatchObject([
        { resultado: "indisponivel", motivo: "banco", tipo: "TypeError" },
      ]);
    });
  });

  describe("falhas do provedor (CA-32)", () => {
    // spec 0001 CA-32
    it.each([
      ["recusa", 422, "assistente.recusa"],
      ["tempo-esgotado", 504, "assistente.tempo-esgotado"],
      ["indisponivel", 503, "assistente.indisponivel"],
    ] as const)(
      "%s vira %i com o código estável e a cota atualizada",
      async (motivo, status, code) => {
        // Arrange
        const { deps, eventos } = cenario({
          saida: falha({ motivo, tipo: "Tipo", tokensEntrada: 10, tokensSaida: 0 }),
        });

        // Act
        const resposta = await tratarApi(pedir({ pergunta, contexto }), deps);

        // Assert: o crédito foi gasto e a tela fica sabendo quanto sobra.
        expect(resposta.status).toBe(status);
        expect(await problemaDe(resposta)).toMatchObject({
          code,
          limite: { restantesHoje: 1, restantesMes: 2, voltaEm: null },
        });
        expect(eventos).toMatchObject([
          { resultado: motivo, tipo: "Tipo", tokensEntrada: 10, tokensSaida: 0, provedor: "falso" },
        ]);
      },
    );

    it("falha sem consumo informado registra zero tokens", async () => {
      const { deps, eventos } = cenario({ saida: falha({ motivo: "indisponivel", tipo: "x" }) });

      await tratarApi(pedir({ pergunta, contexto }), deps);

      expect(eventos).toMatchObject([{ tokensEntrada: 0, tokensSaida: 0, custoUsd: 0 }]);
    });
  });

  describe("assistente desligado", () => {
    // spec 0001 CA-34
    it.each(["sem-banco", "sem-codigo", "codigo-curto", "sem-chave"] as const)(
      "responde 503 (%s) sem conferir nada nem chamar o provedor",
      async (motivo) => {
        const { deps, eventos } = cenario({ configuracao: falha(motivo) });

        const resposta = await tratarApi(pedir({ pergunta, contexto }), deps);

        expect(resposta.status).toBe(503);
        expect(await problemaDe(resposta)).toMatchObject({ code: "assistente.indisponivel" });
        expect(eventos).toMatchObject([{ resultado: "indisponivel", motivo }]);
      },
    );
  });

  it("aceita só POST e só o próprio site", async () => {
    const { deps } = cenario();

    const get = await tratarApi(new Request(`${origem}${rotaDoAssistente}`), deps);
    const outraOrigem = await tratarApi(
      pedir({ pergunta, contexto }, { Origin: "https://outro.exemplo" }),
      deps,
    );

    expect(get.status).toBe(405);
    expect(outraOrigem.status).toBe(403);
  });

  // spec 0001 CA-34
  it("nenhum log nem resposta leva a pergunta, o contexto ou o código", async () => {
    // Arrange: um caminho de cada resultado.
    const casos = [
      cenario(),
      cenario({ saida: falha({ motivo: "recusa", tipo: "cyber" }) }),
      cenario({ configuracao: falha("sem-chave") }),
    ];
    const respostas: string[] = [];

    // Act
    for (const { deps } of casos) {
      respostas.push(await (await tratarApi(pedir({ pergunta, contexto }), deps)).text());
    }
    respostas.push(
      await (
        await tratarApi(pedir({ pergunta }, { Authorization: "Bearer x" }), cenario().deps)
      ).text(),
    );

    // Assert
    const logs = JSON.stringify(casos.flatMap(({ eventos }) => eventos));
    for (const segredo of [pergunta, "Mercadinho", "81,15", textoDaResposta, codigo]) {
      expect(logs).not.toContain(segredo);
    }
    expect(respostas.join("\n")).not.toContain(codigo);
  });
});
