import { respostaGravada } from "../../src/shared/assistente/gravadas";
import { sucesso } from "../../src/shared/resultado";
import type { Provedor } from "./provedor";

/**
 * Provedor de respostas gravadas (spec 0001, CA-35; ADR-0004): serve o E2E e a prévia sem
 * chamar a Anthropic e sem gastar nada. As gravações ficam em src/shared, porque o modo
 * demonstração do app usa as mesmas no aparelho.
 */
export const provedorGravado: Provedor = {
  nome: "gravado",
  modelo: null,
  responder: async ({ pergunta }) =>
    sucesso({
      texto: respostaGravada(pergunta),
      tokensEntrada: 0,
      tokensSaida: 0,
      parada: "gravada",
    }),
};
