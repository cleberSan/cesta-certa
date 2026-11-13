/**
 * Contrato de `POST /api/assistente` (spec 0001, plano.md e ADR-0004): usado pelo Worker para
 * conferir o pedido e responder, e pelo app para montar o pedido e ler a resposta.
 */
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

/** Tamanho da pergunta em caracteres, como a pessoa conta: um emoji vale um. */
export function tamanhoDaPergunta(pergunta: string): number {
  return Array.from(pergunta).length;
}

/** Tamanho do contexto em bytes, do jeito que ele viaja: JSON em UTF-8. */
export function tamanhoDoContexto(contexto: unknown): number {
  return new TextEncoder().encode(JSON.stringify(contexto)).byteLength;
}
