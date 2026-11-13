import Anthropic from "@anthropic-ai/sdk";
import { falha, sucesso, type Resultado } from "../../src/shared/resultado";
import { montarMensagem, promptDoSistema } from "./prompt";
import type { FalhaDoProvedor, Provedor, RespostaDoProvedor } from "./provedor";

/**
 * Provedor de produção (spec 0001, CA-32; ADR-0004): Claude Haiku 5.5 pelo SDK oficial.
 *
 * - `max_tokens` 2.000 e esforço baixo: a resposta é curta e o pensamento conta como saída.
 * - Uma retentativa só, feita pelo SDK (429, 5xx, 408, 409 e falha de conexão).
 * - 20 segundos no total, com as retentativas: o sinal corta a espera no meio.
 * - Sem ferramentas: o pior caso de injeção é um texto enganoso, que a tela confere (CA-33).
 * - Log do SDK desligado: nada da pergunta nem da resposta sai daqui.
 */
export const modeloDoAssistente = "claude-haiku-5-5";
export const tempoLimiteDoAssistenteMs = 20_000;
const maximoDeTokens = 2_000;

export interface OpcoesDoAnthropic {
  apiKey: string;
  /** Só nos testes: rede simulada e tempo menor. */
  fetch?: typeof fetch;
  tempoLimiteMs?: number;
}

function classificar(erro: unknown): FalhaDoProvedor {
  if (
    erro instanceof Anthropic.APIUserAbortError ||
    erro instanceof Anthropic.APIConnectionTimeoutError
  ) {
    return { motivo: "tempo-esgotado", tipo: erro.name };
  }
  if (erro instanceof Anthropic.APIError) {
    return {
      motivo: "indisponivel",
      tipo: erro.status === undefined ? erro.name : `${erro.name} ${erro.status}`,
    };
  }
  return { motivo: "indisponivel", tipo: erro instanceof Error ? erro.name : "desconhecido" };
}

export function criarProvedorAnthropic(opcoes: OpcoesDoAnthropic): Provedor {
  const tempoLimiteMs = opcoes.tempoLimiteMs ?? tempoLimiteDoAssistenteMs;
  const cliente = new Anthropic({
    apiKey: opcoes.apiKey,
    maxRetries: 1,
    timeout: tempoLimiteMs,
    logLevel: "off",
    ...(opcoes.fetch === undefined ? {} : { fetch: opcoes.fetch }),
  });

  return {
    nome: "anthropic",
    modelo: modeloDoAssistente,
    responder: async (pedido): Promise<Resultado<RespostaDoProvedor, FalhaDoProvedor>> => {
      try {
        const resposta = await cliente.messages.create(
          {
            model: modeloDoAssistente,
            max_tokens: maximoDeTokens,
            output_config: { effort: "low" },
            system: promptDoSistema,
            messages: [{ role: "user", content: montarMensagem(pedido) }],
          },
          { signal: AbortSignal.timeout(tempoLimiteMs) },
        );
        const consumo = {
          tokensEntrada: resposta.usage.input_tokens,
          tokensSaida: resposta.usage.output_tokens,
        };
        if (resposta.stop_reason === "refusal") {
          // A categoria é técnica ("cyber", "bio"...); a explicação fica fora do log.
          return falha({
            motivo: "recusa",
            tipo: resposta.stop_details?.category ?? "sem-categoria",
            ...consumo,
          });
        }
        const texto = resposta.content
          .flatMap((bloco) => (bloco.type === "text" ? [bloco.text] : []))
          .join("")
          .trim();
        const parada = resposta.stop_reason ?? "desconhecida";
        if (texto === "") {
          return falha({ motivo: "indisponivel", tipo: `sem-texto ${parada}`, ...consumo });
        }
        return sucesso({ texto, parada, ...consumo });
      } catch (erro) {
        return falha(classificar(erro));
      }
    },
  };
}
