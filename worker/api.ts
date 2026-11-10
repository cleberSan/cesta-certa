import { responderProblema } from "./http/respostas";

/**
 * Rotas de `/api/*`. Tudo que o Worker depende de fora (identificador, e depois rede, relógio
 * e log) chega por parâmetro, para os testes trocarem por versões controladas.
 */
export interface DependenciasDaApi {
  gerarId: () => string;
}

/** Ainda sem rotas: a primeira chega com a consulta de nota fiscal (tarefa T03). */
export function tratarApi(_request: Request, deps: DependenciasDaApi): Response {
  return responderProblema(
    { status: 404, code: "requisicao.rota-desconhecida", detail: "Essa rota não existe na API." },
    deps.gerarId(),
  );
}
