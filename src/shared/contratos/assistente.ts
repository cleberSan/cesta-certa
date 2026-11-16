/**
 * Contrato de `POST /api/assistente` (spec 0001, plano.md e ADR-0004): usado pelo Worker para
 * conferir o pedido e responder, e pelo app para montar o pedido e ler a resposta.
 */
import { ehDataIso, ehObjeto } from "../validacao";
import { codigosDeErro, type CodigoDeErro } from "./nfce";

export const rotaDoAssistente = "/api/assistente";

/** CA-31: a pergunta vai até 500 caracteres, contados como a pessoa vê (pontos de código). */
export const limiteDaPergunta = 500;

/** CA-31: o contexto, em JSON e UTF-8, vai até 32 KB. */
export const limiteDoContexto = 32 * 1024;

export const codigosDoAssistente = [
  "assistente.nao-autorizado",
  "assistente.limite",
  "assistente.grande-demais",
  "assistente.indisponivel",
  "assistente.tempo-esgotado",
  "assistente.recusa",
] as const;

export type CodigoDoAssistente = (typeof codigosDoAssistente)[number];

/** Quanto falta da cota e, quando uma delas acabou, a hora (ISO, UTC) em que ela volta. */
export interface LimiteDoAssistente {
  restantesHoje: number;
  restantesMes: number;
  voltaEm: string | null;
}

/** O corpo do pedido. O contexto é montado pelo app (T16); o servidor só confere o tamanho. */
export interface PedidoAoAssistente {
  pergunta: string;
  contexto: Readonly<Record<string, unknown>>;
}

export interface RespostaDoAssistente {
  /** Texto simples: a tela mostra como texto, sem HTML nem link. */
  texto: string;
  limite: LimiteDoAssistente;
}

/**
 * Teto do texto aceito pelo app. Com `max_tokens` de 2.000, a resposta fica bem abaixo disso;
 * passou, a resposta não veio do servidor do jeito combinado.
 */
export const limiteDaResposta = 20_000;

/** Tamanho da pergunta em caracteres, como a pessoa conta: um emoji vale um. */
export function tamanhoDaPergunta(pergunta: string): number {
  return Array.from(pergunta).length;
}

/** Tamanho do contexto em bytes, do jeito que ele viaja: JSON em UTF-8. */
export function tamanhoDoContexto(contexto: unknown): number {
  return new TextEncoder().encode(JSON.stringify(contexto)).byteLength;
}

function ehContagem(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isSafeInteger(valor) && valor >= 0;
}

export function ehLimiteDoAssistente(valor: unknown): valor is LimiteDoAssistente {
  return (
    ehObjeto(valor) &&
    ehContagem(valor["restantesHoje"]) &&
    ehContagem(valor["restantesMes"]) &&
    (valor["voltaEm"] === null || ehDataIso(valor["voltaEm"]))
  );
}

export function ehRespostaDoAssistente(valor: unknown): valor is RespostaDoAssistente {
  return (
    ehObjeto(valor) &&
    typeof valor["texto"] === "string" &&
    valor["texto"].length <= limiteDaResposta &&
    ehLimiteDoAssistente(valor["limite"])
  );
}

/** Códigos que a rota do assistente pode devolver: os dela e os comuns da API. */
export type CodigoDoProblemaDoAssistente = CodigoDoAssistente | CodigoDeErro;

export interface ProblemaDoAssistente {
  code: CodigoDoProblemaDoAssistente;
  traceId: string | null;
  /** A cota depois da reserva; nula quando o servidor parou antes dela. */
  limite: LimiteDoAssistente | null;
}

const codigosDoProblema: readonly string[] = [...codigosDoAssistente, ...codigosDeErro];

function ehCodigoDoProblema(valor: unknown): valor is CodigoDoProblemaDoAssistente {
  return typeof valor === "string" && codigosDoProblema.includes(valor);
}

/** Lê o corpo de erro (RFC 9457) da rota; nulo quando não está no formato combinado. */
export function lerProblemaDoAssistente(valor: unknown): ProblemaDoAssistente | null {
  if (!ehObjeto(valor) || !ehCodigoDoProblema(valor["code"])) return null;
  const { traceId, limite } = valor;
  return {
    code: valor["code"],
    traceId: typeof traceId === "string" && traceId.length <= 64 ? traceId : null,
    limite: ehLimiteDoAssistente(limite) ? limite : null,
  };
}
