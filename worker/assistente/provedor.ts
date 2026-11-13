import type { PedidoAoAssistente } from "../../src/shared/contratos/assistente";
import type { Resultado } from "../../src/shared/resultado";

/**
 * Quem responde a pergunta (spec 0001, plano.md; ADR-0004), atrás de uma interface só, como na
 * triagem do CareFlow: `anthropic` em produção, `gravado` na demonstração e no E2E (CA-35) e um
 * falso nos testes de unidade. O resto do servidor não sabe qual está em uso.
 */
export interface Consumo {
  tokensEntrada: number;
  tokensSaida: number;
}

export interface RespostaDoProvedor extends Consumo {
  texto: string;
  /** Por que o modelo parou (`end_turn`, `max_tokens`...), só para o log. */
  parada: string;
}

export interface FalhaDoProvedor extends Partial<Consumo> {
  motivo: "recusa" | "tempo-esgotado" | "indisponivel";
  /** Tipo técnico para o log (classe do erro, status, categoria da recusa). Nunca conteúdo. */
  tipo: string;
}

export interface Provedor {
  readonly nome: "anthropic" | "gravado" | "falso";
  /** Modelo usado, para o log; null quando não há modelo. */
  readonly modelo: string | null;
  responder(pedido: PedidoAoAssistente): Promise<Resultado<RespostaDoProvedor, FalhaDoProvedor>>;
}
