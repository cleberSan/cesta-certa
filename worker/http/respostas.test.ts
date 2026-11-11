import { describe, expect, it } from "vitest";
import { apiSecurityHeaders } from "../../src/config/security";
import { ehProblema } from "../../src/shared/contratos/nfce";
import { cabecalhoDeCorrelacao, responderJson, responderProblema } from "./respostas";

const traceId = "0b9d6f0e-1111-4222-8333-444455556666";

describe("responderJson", () => {
  it("responde 200 em JSON com os cabeçalhos de segurança e o identificador", async () => {
    const resposta = responderJson({ ok: true }, traceId);

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(resposta.headers.get(cabecalhoDeCorrelacao)).toBe(traceId);
    for (const [nome, valor] of Object.entries(apiSecurityHeaders)) {
      expect(resposta.headers.get(nome), nome).toBe(valor);
    }
    expect(await resposta.json()).toEqual({ ok: true });
  });

  it("não libera a API para outra origem", () => {
    const resposta = responderJson({}, traceId);
    expect(resposta.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(resposta.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("responderProblema", () => {
  it("monta o ProblemDetails com código estável e identificador", async () => {
    const resposta = responderProblema(
      { status: 422, code: "nfce.link-invalido", detail: "O link não é de nota fiscal." },
      traceId,
    );

    expect(resposta.status).toBe(422);
    expect(resposta.headers.get("Content-Type")).toBe("application/problem+json; charset=utf-8");
    const corpo: unknown = await resposta.json();
    expect(ehProblema(corpo)).toBe(true);
    expect(corpo).toEqual({
      type: "about:blank",
      title: "Unprocessable Content",
      status: 422,
      detail: "O link não é de nota fiscal.",
      code: "nfce.link-invalido",
      traceId,
    });
  });

  it("leva o diagnóstico só quando ele existe", async () => {
    const resposta = responderProblema(
      { status: 502, code: "nfce.captcha", detail: "Pediu verificação.", diagnostico: { a: 1 } },
      traceId,
    );
    expect(await resposta.json()).toMatchObject({ title: "Bad Gateway", diagnostico: { a: 1 } });
  });

  it("aceita cabeçalho extra sem deixar trocar o tipo nem o identificador", () => {
    const resposta = responderProblema(
      {
        status: 405,
        code: "requisicao.metodo-nao-permitido",
        detail: "Só POST.",
        cabecalhos: { Allow: "POST", "Content-Type": "text/html", "X-Correlation-Id": "outro" },
      },
      traceId,
    );

    expect(resposta.headers.get("Allow")).toBe("POST");
    expect(resposta.headers.get("Content-Type")).toBe("application/problem+json; charset=utf-8");
    expect(resposta.headers.get(cabecalhoDeCorrelacao)).toBe(traceId);
  });

  it("usa um título genérico para status sem frase cadastrada", async () => {
    const resposta = responderProblema(
      { status: 418, code: "erro.interno", detail: "Sem frase." },
      traceId,
    );
    expect(await resposta.json()).toMatchObject({ title: "Error", status: 418 });
  });
});
