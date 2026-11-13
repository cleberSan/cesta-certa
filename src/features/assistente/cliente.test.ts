import { describe, expect, it, vi } from "vitest";
import { respostaGravada } from "../../shared/assistente/gravadas";
import { rotaDoAssistente, type PedidoAoAssistente } from "../../shared/contratos/assistente";
import type { Enviar } from "../precos/nfce/cliente";
import { perguntar, type OpcoesDaPergunta } from "./cliente";

const traceId = "0b9d6f0e-1111-4222-8333-444455556666";
const codigo = "c".repeat(40);
const pedido: PedidoAoAssistente = {
  pergunta: "Vale a pena ir a dois mercados?",
  contexto: { hoje: "2026-11-13", opcoes: [] },
};
const limite = { restantesHoje: 29, restantesMes: 299, voltaEm: null };

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json", "X-Correlation-Id": traceId },
  });
}

function problema(code: string, status: number, extras: Record<string, unknown> = {}): Response {
  return json(
    { type: "about:blank", title: "Erro", status, detail: "Detalhe.", code, traceId, ...extras },
    status,
  );
}

function opcoes(enviar: Enviar, campos: Partial<OpcoesDaPergunta> = {}): OpcoesDaPergunta {
  return { modo: "servidor", codigo, enviar, ...campos };
}

describe("pergunta ao assistente", () => {
  // spec 0001 CA-26
  it("envia a pergunta e o contexto com o código de acesso e devolve o texto", async () => {
    const enviar = vi.fn<Enviar>(async () => json({ texto: "Resposta.", limite }));

    const resultado = await perguntar(pedido, opcoes(enviar));

    expect(resultado).toEqual({
      ok: true,
      valor: { texto: "Resposta.", limite, gravada: false },
    });
    const [rota, init] = enviar.mock.calls[0]!;
    expect(rota).toBe(rotaDoAssistente);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${codigo}`,
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual(pedido);
    expect(init).toMatchObject({
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
  });

  // spec 0001 CA-35
  it("na demonstração responde com a gravação, sem chamar o servidor", async () => {
    const enviar = vi.fn<Enviar>();

    const resultado = await perguntar(
      pedido,
      opcoes(enviar, { modo: "demonstracao", codigo: null }),
    );

    expect(resultado).toEqual({
      ok: true,
      valor: { texto: respostaGravada(pedido.pergunta), limite: null, gravada: true },
    });
    expect(enviar).not.toHaveBeenCalled();
  });

  // spec 0001 CA-29
  it("sem código guardado, não envia nada", async () => {
    const enviar = vi.fn<Enviar>();

    const resultado = await perguntar(pedido, opcoes(enviar, { codigo: null }));

    expect(resultado).toEqual({
      ok: false,
      erro: { code: "assistente.nao-autorizado", traceId: null, limite: null },
    });
    expect(enviar).not.toHaveBeenCalled();
  });

  // spec 0001 CA-29, CA-30, CA-31, CA-32
  it.each([
    ["assistente.nao-autorizado", 401, null],
    [
      "assistente.limite",
      429,
      { ...limite, restantesHoje: 0, voltaEm: "2026-11-14T03:00:00.000Z" },
    ],
    ["assistente.grande-demais", 413, null],
    ["assistente.indisponivel", 503, limite],
    ["assistente.tempo-esgotado", 504, limite],
    ["assistente.recusa", 422, limite],
    ["requisicao.muitas-consultas", 429, null],
  ])("devolve a falha %s com o limite que o servidor mandou", async (code, status, comLimite) => {
    const extras = comLimite === null ? {} : { limite: comLimite };
    const enviar: Enviar = async () => problema(code, status, extras);

    const resultado = await perguntar(pedido, opcoes(enviar));

    expect(resultado).toEqual({ ok: false, erro: { code, traceId, limite: comLimite } });
  });

  it("sem rede, avisa que não conectou", async () => {
    const enviar: Enviar = async () => {
      throw new TypeError("Failed to fetch");
    };

    const resultado = await perguntar(pedido, opcoes(enviar));

    expect(resultado.ok || resultado.erro.code).toBe("app.sem-conexao");
  });

  // spec 0001 CA-32
  it("desiste quando o servidor passa do tempo de espera", async () => {
    const enviar: Enviar = (_rota, init) =>
      new Promise((_resolver, rejeitar) => {
        init.signal?.addEventListener("abort", () => rejeitar(new DOMException("", "AbortError")));
      });

    const resultado = await perguntar(pedido, opcoes(enviar, { esperaMs: 20 }));

    expect(resultado.ok || resultado.erro.code).toBe("app.tempo-esgotado");
  });

  it.each([
    ["corpo que não é JSON", new Response("<html>", { status: 200 })],
    ["resposta fora do formato", json({ texto: 1, limite })],
    ["erro fora do formato", json({ erro: "x" }, 500)],
  ])("trata %s como resposta inesperada", async (_nome, resposta) => {
    const resultado = await perguntar(
      pedido,
      opcoes(async () => resposta),
    );

    expect(resultado.ok || resultado.erro.code).toBe("app.resposta-inesperada");
  });

  it("corpo que demora e passa do tempo vira tempo esgotado", async () => {
    const enviar: Enviar = async (_rota, init) => {
      const corpo = new ReadableStream({
        start(controle) {
          init.signal?.addEventListener("abort", () => controle.error(new Error("abortado")));
        },
      });
      return new Response(corpo, { status: 200 });
    };

    const resultado = await perguntar(pedido, opcoes(enviar, { esperaMs: 20 }));

    expect(resultado.ok || resultado.erro.code).toBe("app.tempo-esgotado");
  });

  it("usa o identificador do cabeçalho quando o erro não traz um", async () => {
    const resultado = await perguntar(
      pedido,
      opcoes(async () => json({ code: "erro.interno" }, 500)),
    );

    expect(resultado).toEqual({
      ok: false,
      erro: { code: "erro.interno", traceId, limite: null },
    });
  });
});
