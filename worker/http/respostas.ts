import { apiSecurityHeaders } from "../../src/config/security";
import type { CodigoDeErro, Problema } from "../../src/shared/contratos/nfce";

/**
 * Respostas da API. Toda resposta sai em JSON, com os cabeçalhos de segurança de
 * src/config/security.ts e o identificador da requisição, que também vai no log: é ele que a
 * tela de erro mostra, para ligar um print ao registro sem expor conteúdo.
 */
export const cabecalhoDeCorrelacao = "X-Correlation-Id";

const titulos: Readonly<Record<number, string>> = {
  400: "Bad Request",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  413: "Content Too Large",
  415: "Unsupported Media Type",
  422: "Unprocessable Content",
  500: "Internal Server Error",
  502: "Bad Gateway",
  504: "Gateway Timeout",
};

export interface DadosDoProblema {
  status: number;
  code: CodigoDeErro;
  /** Frase para quem lê. Nunca leva dado pessoal nem o link recebido. */
  detail: string;
  diagnostico?: unknown;
  cabecalhos?: Readonly<Record<string, string>>;
}

function responder(
  corpo: unknown,
  status: number,
  tipo: string,
  traceId: string,
  extras: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      ...apiSecurityHeaders,
      ...extras,
      "Content-Type": `${tipo}; charset=utf-8`,
      [cabecalhoDeCorrelacao]: traceId,
    },
  });
}

export function responderJson(corpo: unknown, traceId: string): Response {
  return responder(corpo, 200, "application/json", traceId);
}

/** ProblemDetails (RFC 9457) com `code` estável e `traceId`; o título é a frase do status. */
export function responderProblema(dados: DadosDoProblema, traceId: string): Response {
  const problema: Problema = {
    type: "about:blank",
    title: titulos[dados.status] ?? "Error",
    status: dados.status,
    detail: dados.detail,
    code: dados.code,
    traceId,
    ...(dados.diagnostico === undefined ? {} : { diagnostico: dados.diagnostico }),
  };
  return responder(problema, dados.status, "application/problem+json", traceId, dados.cabecalhos);
}
