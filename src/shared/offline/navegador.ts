/**
 * Uso sem internet do lado da página (spec 0001, CA-36; ADR-0007): registra o service worker
 * de public/sw.js e avisa quando o aparelho está sem conexão. Só as páginas com o aplicativo
 * carregam isto (src/components/AvisoSemConexao.astro); as demais seguem sem JavaScript.
 */

export const caminhoDoServiceWorker = "/sw.js";

export const avisoSemConexao =
  "Sem internet: a lista e os preços guardados neste aparelho continuam aqui, mas o mapa, a leitura da nota fiscal e o assistente precisam de conexão.";

export interface NavegadorComServiceWorker {
  readonly serviceWorker?: {
    register(endereco: string, opcoes: { readonly scope: string }): Promise<unknown>;
  };
}

/**
 * Registra o service worker. Sem suporte ou com o registro recusado (navegação privada, teste
 * com service worker bloqueado), o site funciona igual, só não abre sem internet: por isso não
 * há aviso nem erro no console.
 */
export async function registrarServiceWorker(
  navegador: NavegadorComServiceWorker,
): Promise<boolean> {
  if (navegador.serviceWorker === undefined) return false;
  try {
    await navegador.serviceWorker.register(caminhoDoServiceWorker, { scope: "/" });
    return true;
  } catch {
    return false;
  }
}

export interface JanelaComConexao {
  readonly navigator: { readonly onLine: boolean };
  addEventListener(tipo: "online" | "offline", ouvinte: () => void): void;
}

/**
 * Escreve o aviso na região viva enquanto o navegador diz que está sem conexão e o apaga
 * quando a conexão volta. A região fica sempre na página, para o leitor de tela anunciar a
 * mudança.
 */
export function acompanharConexao(
  janela: JanelaComConexao,
  regiao: { textContent: string | null },
): void {
  const atualizar = () => {
    regiao.textContent = janela.navigator.onLine ? "" : avisoSemConexao;
  };
  atualizar();
  janela.addEventListener("online", atualizar);
  janela.addEventListener("offline", atualizar);
}
