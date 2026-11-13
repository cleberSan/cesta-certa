/**
 * Lado do app na conversa com o assistente (spec 0001, CA-26 a CA-35; ADR-0004): envia a
 * pergunta e o contexto com o código de acesso, confere a resposta e devolve a falha com o
 * limite, quando o servidor manda. No modo demonstração, a resposta é a gravada e nada sai do
 * aparelho (CA-35).
 */
import { respostaGravada } from "../../shared/assistente/gravadas";
import {
  ehRespostaDoAssistente,
  lerProblemaDoAssistente,
  rotaDoAssistente,
  type CodigoDoProblemaDoAssistente,
  type LimiteDoAssistente,
  type PedidoAoAssistente,
} from "../../shared/contratos/assistente";
import { falha, sucesso, type Resultado } from "../../shared/resultado";
import type { Enviar } from "../precos/nfce/cliente";

/** O servidor desiste da Anthropic em 20 s (CA-32); o app espera um pouco mais por ele. */
export const esperaDoAssistenteMs = 30_000;

export const modosDoAssistente = ["servidor", "demonstracao"] as const;

export type ModoDoAssistente = (typeof modosDoAssistente)[number];

export interface RespostaNaTela {
  readonly texto: string;
  /** Nulo na demonstração, que não gasta cota. */
  readonly limite: LimiteDoAssistente | null;
  readonly gravada: boolean;
}

export type CodigoDaFalhaDoAssistente =
  | CodigoDoProblemaDoAssistente
  | "app.sem-conexao"
  | "app.tempo-esgotado"
  | "app.resposta-inesperada";

export interface FalhaDoAssistente {
  readonly code: CodigoDaFalhaDoAssistente;
  /** Identificador da requisição no servidor, para ligar um print ao log. */
  readonly traceId: string | null;
  readonly limite: LimiteDoAssistente | null;
}

function falhar(
  code: CodigoDaFalhaDoAssistente,
  traceId: string | null = null,
  limite: LimiteDoAssistente | null = null,
): Resultado<never, FalhaDoAssistente> {
  return falha({ code, traceId, limite });
}

export interface OpcoesDaPergunta {
  readonly modo: ModoDoAssistente;
  /** Código de acesso guardado no aparelho; nulo antes de digitar. */
  readonly codigo: string | null;
  readonly enviar: Enviar;
  readonly esperaMs?: number;
}

export async function perguntar(
  pedido: PedidoAoAssistente,
  { modo, codigo, enviar, esperaMs = esperaDoAssistenteMs }: OpcoesDaPergunta,
): Promise<Resultado<RespostaNaTela, FalhaDoAssistente>> {
  if (modo === "demonstracao") {
    return sucesso({ texto: respostaGravada(pedido.pergunta), limite: null, gravada: true });
  }
  if (codigo === null) return falhar("assistente.nao-autorizado");

  const sinal = AbortSignal.timeout(esperaMs);
  let resposta: Response;
  let corpo: unknown;
  try {
    resposta = await enviar(rotaDoAssistente, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${codigo}`,
      },
      body: JSON.stringify(pedido),
      signal: sinal,
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
  } catch {
    return falhar(sinal.aborted ? "app.tempo-esgotado" : "app.sem-conexao");
  }
  const traceId = resposta.headers.get("X-Correlation-Id");
  try {
    corpo = await resposta.json();
  } catch {
    return falhar(sinal.aborted ? "app.tempo-esgotado" : "app.resposta-inesperada", traceId);
  }

  if (resposta.ok) {
    return ehRespostaDoAssistente(corpo)
      ? sucesso({ texto: corpo.texto, limite: corpo.limite, gravada: false })
      : falhar("app.resposta-inesperada", traceId);
  }
  const problema = lerProblemaDoAssistente(corpo);
  return problema === null
    ? falhar("app.resposta-inesperada", traceId)
    : falhar(problema.code, problema.traceId ?? traceId, problema.limite);
}
