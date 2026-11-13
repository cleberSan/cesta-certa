import { rotaDoAssistente } from "../src/shared/contratos/assistente";
import { rotaDaConsulta } from "../src/shared/contratos/nfce";
import type { Resultado } from "../src/shared/resultado";
import type { ConfiguracaoDoAssistente, MotivoDeDesligado } from "./assistente/config";
import { atenderAssistente } from "./assistente/rota";
import { conferirLimite, periodoDoLimiteS, type LimiteDeTaxa } from "./http/limite";
import { responderProblema } from "./http/respostas";
import { consultarNota, type Dependencias } from "./nfce/consultar";

/**
 * Rotas de `/api/*`. Tudo que o Worker depende de fora (rede, relógio, log, identificador)
 * chega por parâmetro, para os testes trocarem por versões controladas.
 */
export interface DependenciasDaApi extends Dependencias {
  gerarId: () => string;
  /** Limite por cliente de cada rota da API; ausente nos testes que não tratam dele. */
  limite?: LimiteDeTaxa;
  /**
   * Segredos, banco e provedor do assistente, lidos do ambiente do Worker (ADR-0004) só quando
   * o pedido é para o assistente.
   */
  assistente: () => Resultado<ConfiguracaoDoAssistente, MotivoDeDesligado>;
}

type Rota = (request: Request, traceId: string, deps: DependenciasDaApi) => Promise<Response>;

const rotas: ReadonlyMap<string, Rota> = new Map<string, Rota>([
  [rotaDaConsulta, (request, traceId, deps) => consultarNota(request, traceId, deps)],
  [
    rotaDoAssistente,
    (request, traceId, deps) =>
      atenderAssistente(request, traceId, {
        registrar: deps.registrar,
        agora: deps.agora,
        configuracao: deps.assistente(),
      }),
  ],
]);

/**
 * A API só atende o próprio site. Navegador de outra origem não consegue chamar: o corpo em
 * JSON exige preflight, que não recebe cabeçalho de CORS, e aqui a origem é conferida de novo.
 * Cliente que não é navegador não manda esses cabeçalhos e passa; para ele valem as outras
 * travas (lista de endereços, chave válida, tamanho, tempo).
 */
function vemDoProprioSite(request: Request, url: URL): boolean {
  const origem = request.headers.get("origin");
  if (origem !== null && origem !== url.origin) return false;
  const relacao = request.headers.get("sec-fetch-site");
  return relacao === null || relacao === "same-origin";
}

export async function tratarApi(request: Request, deps: DependenciasDaApi): Promise<Response> {
  const traceId = deps.gerarId();
  try {
    const url = new URL(request.url);
    const rota = rotas.get(url.pathname);
    if (rota === undefined) {
      return responderProblema(
        {
          status: 404,
          code: "requisicao.rota-desconhecida",
          detail: "Essa rota não existe na API.",
        },
        traceId,
      );
    }
    if (request.method !== "POST") {
      return responderProblema(
        {
          status: 405,
          code: "requisicao.metodo-nao-permitido",
          detail: "Essa rota só aceita POST.",
          cabecalhos: { Allow: "POST" },
        },
        traceId,
      );
    }
    if (!vemDoProprioSite(request, url)) {
      return responderProblema(
        {
          status: 403,
          code: "requisicao.origem-nao-permitida",
          detail: "A API só atende o próprio site.",
        },
        traceId,
      );
    }
    // Depois das travas baratas: pedido de outra origem nem conta no limite. A chave do
    // limite leva a rota, então a nota e o assistente têm contadores separados.
    const veredito = await conferirLimite(
      deps.limite,
      request,
      url.pathname,
      traceId,
      deps.registrar,
    );
    if (veredito === "excedido") {
      return responderProblema(
        {
          status: 429,
          code: "requisicao.muitas-consultas",
          detail: "Muitas consultas seguidas. Espere um minuto e tente de novo.",
          cabecalhos: { "Retry-After": String(periodoDoLimiteS) },
        },
        traceId,
      );
    }
    return await rota(request, traceId, deps);
  } catch (erro) {
    // Só o tipo do erro: a mensagem pode trazer endereço ou conteúdo.
    deps.registrar({
      evento: "erro.interno",
      traceId,
      tipo: erro instanceof Error ? erro.name : "desconhecido",
    });
    return responderProblema(
      {
        status: 500,
        code: "erro.interno",
        detail: "Erro inesperado no servidor. Tente de novo em instantes.",
      },
      traceId,
    );
  }
}
