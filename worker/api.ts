import { rotaDaConsulta } from "../src/shared/contratos/nfce";
import { responderProblema } from "./http/respostas";
import { consultarNota, type Dependencias } from "./nfce/consultar";

/**
 * Rotas de `/api/*`. Tudo que o Worker depende de fora (rede, relógio, log, identificador)
 * chega por parâmetro, para os testes trocarem por versões controladas.
 */
export interface DependenciasDaApi extends Dependencias {
  gerarId: () => string;
}

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
    if (url.pathname !== rotaDaConsulta) {
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
    return await consultarNota(request, traceId, deps);
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
