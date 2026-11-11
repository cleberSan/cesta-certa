import { tratarApi } from "./api";
import { registrarNoConsole } from "./observabilidade/registro";

/**
 * Worker da Cloudflare (ADR-0001). As páginas e os arquivos de dist/ são servidos direto pela
 * plataforma, sem passar por aqui: o `wrangler.jsonc` só manda para o Worker o que começa com
 * /api/. O repasse ao ASSETS cobre o que mais chegar, como o 404 de um caminho que não existe.
 */
export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return tratarApi(request, {
        buscar: (url, init) => fetch(url, init),
        registrar: registrarNoConsole,
        agora: () => Date.now(),
        gerarId: () => crypto.randomUUID(),
      });
    }
    return env.ASSETS.fetch(request);
  },
};
