import type { Resultado } from "../../src/shared/resultado";
import { responderJson, responderProblema, type DadosDoProblema } from "../http/respostas";
import type { Evento, Registrar } from "../observabilidade/registro";
import { codigoConfere, lerCodigo } from "./acesso";
import type { ConfiguracaoDoAssistente, MotivoDeDesligado } from "./config";
import { reservar, type Reserva } from "./cota";
import { lerPedido } from "./pedido";
import { versaoDoPrompt } from "./prompt";
import type { FalhaDoProvedor } from "./provedor";

/**
 * `POST /api/assistente` (spec 0001, CA-29 a CA-32; ADR-0004). A ordem é a das travas, da mais
 * barata para a mais cara, e nenhuma chama o provedor antes de passar:
 *
 * 1. assistente ligado (segredos e banco presentes);
 * 2. código de acesso, em tempo constante (401);
 * 3. tamanho e formato do pedido (413, 415, 400), antes de gastar crédito;
 * 4. reserva atômica na cota do dia e do mês (429);
 * 5. o provedor, com tempo limite (504), recusa (422) e falha (503).
 *
 * O crédito reservado não volta quando o provedor falha: uma chamada que estourou o tempo pode
 * ter custado, e a cota existe para travar o custo.
 *
 * O log tem uma linha por pedido, com o resultado, a duração, os tokens e o custo estimado.
 * A pergunta, o contexto e a resposta nunca entram nele.
 */
export interface DependenciasDoAssistente {
  registrar: Registrar;
  agora: () => number;
  configuracao: Resultado<ConfiguracaoDoAssistente, MotivoDeDesligado>;
}

/** Claude Haiku 5.5, prompts até 100 mil tokens (tabela de 2026-11): US$ por token. */
const precoPorTokenDeEntrada = 0.1 / 1_000_000;
const precoPorTokenDeSaida = 0.5 / 1_000_000;

export function custoEstimadoUsd(tokensEntrada: number, tokensSaida: number): number {
  const custo = tokensEntrada * precoPorTokenDeEntrada + tokensSaida * precoPorTokenDeSaida;
  return Math.round(custo * 1_000_000) / 1_000_000;
}

const indisponivel: DadosDoProblema = {
  status: 503,
  code: "assistente.indisponivel",
  detail: "O assistente não está disponível agora. O ranking continua valendo.",
};

function problemaDoProvedor(falhaDoProvedor: FalhaDoProvedor): DadosDoProblema {
  switch (falhaDoProvedor.motivo) {
    case "recusa":
      return {
        status: 422,
        code: "assistente.recusa",
        detail: "O assistente não respondeu a essa pergunta. O ranking continua valendo.",
      };
    case "tempo-esgotado":
      return {
        status: 504,
        code: "assistente.tempo-esgotado",
        detail: "O assistente demorou mais de 20 segundos. O ranking continua valendo.",
      };
    case "indisponivel":
      return indisponivel;
  }
}

function segundosAte(voltaEm: string | null, agoraMs: number): number {
  if (voltaEm === null) return 60;
  return Math.max(1, Math.ceil((Date.parse(voltaEm) - agoraMs) / 1000));
}

export async function atenderAssistente(
  request: Request,
  traceId: string,
  deps: DependenciasDoAssistente,
): Promise<Response> {
  const inicio = deps.agora();
  const registrar = (resultado: string, extras: Evento = {}) => {
    deps.registrar({
      evento: "assistente",
      traceId,
      resultado,
      prompt: versaoDoPrompt,
      duracaoMs: deps.agora() - inicio,
      ...extras,
    });
  };

  if (!deps.configuracao.ok) {
    registrar("indisponivel", { motivo: deps.configuracao.erro });
    return responderProblema(indisponivel, traceId);
  }
  const config = deps.configuracao.valor;

  if (!(await codigoConfere(lerCodigo(request.headers), config.codigo))) {
    registrar("nao-autorizado");
    return responderProblema(
      {
        status: 401,
        code: "assistente.nao-autorizado",
        detail: "Código de acesso ausente ou errado.",
        cabecalhos: { "WWW-Authenticate": 'Bearer realm="assistente"' },
      },
      traceId,
    );
  }

  const pedido = await lerPedido(request);
  if (!pedido.ok) {
    registrar(pedido.erro.resultado);
    return responderProblema(pedido.erro.problema, traceId);
  }

  let reserva: Reserva;
  try {
    reserva = await reservar(config.banco, deps.agora(), config.limites);
  } catch (erro) {
    registrar("indisponivel", {
      motivo: "banco",
      tipo: erro instanceof Error ? erro.name : "desconhecido",
    });
    return responderProblema(indisponivel, traceId);
  }
  if (!reserva.reservada) {
    registrar("limite", { restantesMes: reserva.limite.restantesMes });
    return responderProblema(
      {
        status: 429,
        code: "assistente.limite",
        detail:
          reserva.limite.restantesMes === 0
            ? "As perguntas deste mês acabaram."
            : "As perguntas de hoje acabaram.",
        limite: reserva.limite,
        cabecalhos: { "Retry-After": String(segundosAte(reserva.limite.voltaEm, deps.agora())) },
      },
      traceId,
    );
  }

  const provedor = config.provedor;
  const resposta = await provedor.responder(pedido.valor);
  const tokensEntrada = resposta.ok
    ? resposta.valor.tokensEntrada
    : (resposta.erro.tokensEntrada ?? 0);
  const tokensSaida = resposta.ok ? resposta.valor.tokensSaida : (resposta.erro.tokensSaida ?? 0);
  const consumo: Evento = {
    provedor: provedor.nome,
    modelo: provedor.modelo,
    tokensEntrada,
    tokensSaida,
    custoUsd: custoEstimadoUsd(tokensEntrada, tokensSaida),
  };

  if (!resposta.ok) {
    registrar(resposta.erro.motivo, { ...consumo, tipo: resposta.erro.tipo });
    return responderProblema(
      { ...problemaDoProvedor(resposta.erro), limite: reserva.limite },
      traceId,
    );
  }
  registrar("ok", { ...consumo, parada: resposta.valor.parada });
  return responderJson({ texto: resposta.valor.texto, limite: reserva.limite }, traceId);
}
