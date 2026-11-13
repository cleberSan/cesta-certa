import { describe, expect, it } from "vitest";
import { criarProvedorAnthropic, modeloDoAssistente } from "./anthropic";
import { promptDoSistema } from "./prompt";

const chave = "chave-de-teste-anthropic";
const pedido = { pergunta: "Qual a melhor opção?", contexto: { opcoes: [{ total: "R$ 81,15" }] } };

interface Chamada {
  url: string;
  corpo: Record<string, unknown>;
  cabecalhos: Headers;
}

function mensagem(campos: Record<string, unknown> = {}) {
  return {
    id: "msg_teste",
    type: "message",
    role: "assistant",
    model: modeloDoAssistente,
    content: [{ type: "text", text: " A primeira opção custa R$ 81,15. " }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 1200, output_tokens: 150 },
    ...campos,
  };
}

function json(corpo: unknown, status = 200, extras: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json", ...extras },
  });
}

/** Erro da API como a Anthropic manda; `retry-after-ms` curto para o teste não esperar. */
function erro(status: number): Response {
  return json({ type: "error", error: { type: "api_error", message: "falhou" } }, status, {
    "retry-after-ms": "1",
  });
}

/** Rede simulada: cada chamada consome a próxima resposta da fila. */
function rede(respostas: (() => Promise<Response>)[]) {
  const chamadas: Chamada[] = [];
  const buscar = async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const requisicao = new Request(entrada, init);
    chamadas.push({
      url: requisicao.url,
      corpo: (await requisicao.json()) as Record<string, unknown>,
      cabecalhos: requisicao.headers,
    });
    const proxima = respostas.shift();
    if (proxima === undefined) throw new Error("chamada a mais");
    return proxima();
  };
  return { chamadas, buscar: buscar as typeof fetch };
}

describe("provedor anthropic", () => {
  it("pede ao Haiku 5.5 com 2.000 tokens, esforço baixo e o prompt fixo, e devolve só o texto", async () => {
    // Arrange
    const { chamadas, buscar } = rede([async () => json(mensagem())]);
    const provedor = criarProvedorAnthropic({ apiKey: chave, fetch: buscar });

    // Act
    const resposta = await provedor.responder(pedido);

    // Assert
    expect(resposta).toEqual({
      ok: true,
      valor: {
        texto: "A primeira opção custa R$ 81,15.",
        parada: "end_turn",
        tokensEntrada: 1200,
        tokensSaida: 150,
      },
    });
    expect(chamadas).toHaveLength(1);
    const [chamada] = chamadas;
    expect(chamada?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(chamada?.corpo).toMatchObject({
      model: "claude-haiku-5-5",
      max_tokens: 2000,
      output_config: { effort: "low" },
      system: promptDoSistema,
    });
    // Haiku 5.5 recusa orçamento de pensamento, temperatura e prefill; nada disso vai.
    expect(chamada?.corpo).not.toHaveProperty("thinking");
    expect(chamada?.corpo).not.toHaveProperty("temperature");
    expect(chamada?.corpo).not.toHaveProperty("tools");
    const mensagens = chamada?.corpo["messages"] as { role: string; content: string }[];
    expect(mensagens).toHaveLength(1);
    expect(mensagens[0]?.role).toBe("user");
    expect(mensagens[0]?.content).toContain("<pergunta>\nQual a melhor opção?\n</pergunta>");
  });

  // spec 0001 CA-34
  it("a chave vai só no cabeçalho de autenticação, nunca no corpo", async () => {
    const { chamadas, buscar } = rede([async () => json(mensagem())]);

    await criarProvedorAnthropic({ apiKey: chave, fetch: buscar }).responder(pedido);

    const [chamada] = chamadas;
    expect(JSON.stringify(chamada?.corpo)).not.toContain(chave);
    const valores = [...(chamada?.cabecalhos.values() ?? [])].join(" ");
    expect(valores).toContain(chave);
  });

  // spec 0001 CA-32
  it("recusa do modelo vira recusa, com a categoria e o consumo para o log", async () => {
    const { buscar } = rede([
      async () =>
        json(
          mensagem({
            content: [],
            stop_reason: "refusal",
            stop_details: { type: "refusal", category: "cyber", explanation: "não" },
          }),
        ),
    ]);

    const resposta = await criarProvedorAnthropic({ apiKey: chave, fetch: buscar }).responder(
      pedido,
    );

    expect(resposta).toEqual({
      ok: false,
      erro: { motivo: "recusa", tipo: "cyber", tokensEntrada: 1200, tokensSaida: 150 },
    });
  });

  it("recusa sem categoria ainda é recusa", async () => {
    const { buscar } = rede([
      async () => json(mensagem({ content: [], stop_reason: "refusal", stop_details: null })),
    ]);

    const resposta = await criarProvedorAnthropic({ apiKey: chave, fetch: buscar }).responder(
      pedido,
    );

    expect(resposta).toMatchObject({
      ok: false,
      erro: { motivo: "recusa", tipo: "sem-categoria" },
    });
  });

  it("resposta sem texto vira indisponível", async () => {
    const { buscar } = rede([
      async () =>
        json(
          mensagem({
            content: [{ type: "thinking", thinking: "", signature: "x" }],
            stop_reason: "max_tokens",
          }),
        ),
    ]);

    const resposta = await criarProvedorAnthropic({ apiKey: chave, fetch: buscar }).responder(
      pedido,
    );

    expect(resposta).toMatchObject({
      ok: false,
      erro: { motivo: "indisponivel", tipo: "sem-texto max_tokens" },
    });
  });

  // spec 0001 CA-32
  it.each([429, 500, 529])("tenta de novo uma vez depois de %i e responde", async (status) => {
    const { chamadas, buscar } = rede([async () => erro(status), async () => json(mensagem())]);

    const resposta = await criarProvedorAnthropic({ apiKey: chave, fetch: buscar }).responder(
      pedido,
    );

    expect(resposta.ok).toBe(true);
    expect(chamadas).toHaveLength(2);
  });

  // spec 0001 CA-32
  it("depois de duas falhas seguidas, desiste: indisponível", async () => {
    const { chamadas, buscar } = rede([async () => erro(503), async () => erro(503)]);

    const resposta = await criarProvedorAnthropic({ apiKey: chave, fetch: buscar }).responder(
      pedido,
    );

    expect(resposta).toMatchObject({ ok: false, erro: { motivo: "indisponivel" } });
    expect(resposta.ok || resposta.erro.tipo).toMatch(/503$/);
    expect(chamadas).toHaveLength(2);
  });

  it.each([400, 401, 403])("não tenta de novo depois de %i", async (status) => {
    const { chamadas, buscar } = rede([async () => erro(status)]);

    const resposta = await criarProvedorAnthropic({ apiKey: chave, fetch: buscar }).responder(
      pedido,
    );

    expect(resposta).toMatchObject({ ok: false, erro: { motivo: "indisponivel" } });
    expect(resposta.ok || resposta.erro.tipo).toMatch(new RegExp(`${status}$`));
    expect(chamadas).toHaveLength(1);
  });

  // spec 0001 CA-32
  it("falha de conexão: tenta de novo uma vez e desiste", async () => {
    const semRede = () => Promise.reject(new TypeError("fetch failed"));
    const { chamadas, buscar } = rede([semRede, semRede]);

    const resposta = await criarProvedorAnthropic({ apiKey: chave, fetch: buscar }).responder(
      pedido,
    );

    expect(resposta).toMatchObject({ ok: false, erro: { motivo: "indisponivel" } });
    expect(chamadas).toHaveLength(2);
  });

  // spec 0001 CA-32
  it("passou do tempo limite, contando a retentativa: tempo esgotado", async () => {
    // Arrange: a Anthropic nunca responde; o tempo limite do teste é 200 ms.
    const pendurada = (init?: RequestInit) =>
      new Promise<Response>((_, rejeitar) => {
        init?.signal?.addEventListener("abort", () => rejeitar(init.signal?.reason));
      });
    const chamadas: number[] = [];
    const buscar = ((_: RequestInfo | URL, init?: RequestInit) => {
      chamadas.push(Date.now());
      return pendurada(init);
    }) as typeof fetch;
    const inicio = Date.now();

    // Act
    const resposta = await criarProvedorAnthropic({
      apiKey: chave,
      fetch: buscar,
      tempoLimiteMs: 200,
    }).responder(pedido);

    // Assert
    expect(resposta).toMatchObject({ ok: false, erro: { motivo: "tempo-esgotado" } });
    expect(Date.now() - inicio).toBeLessThan(2_000);
    expect(chamadas.length).toBeLessThanOrEqual(2);
  });

  it("erro que não é da API também vira indisponível", async () => {
    const { buscar } = rede([async () => new Response("não é json", { status: 200 })]);

    const resposta = await criarProvedorAnthropic({ apiKey: chave, fetch: buscar }).responder(
      pedido,
    );

    expect(resposta).toMatchObject({ ok: false, erro: { motivo: "indisponivel" } });
  });
});
