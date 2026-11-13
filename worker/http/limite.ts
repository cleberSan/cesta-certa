import type { Registrar } from "../observabilidade/registro";

/**
 * Limite de requisições por cliente na API (ADR-0001), com o binding de rate limiting da
 * Cloudflare. A contagem é aproximada e vale por local da rede da Cloudflare: segura rajada e
 * uso automatizado, não é cota exata. A cota exata do assistente fica no D1 (T15).
 */
export interface LimiteDeTaxa {
  limit(opcoes: { key: string }): Promise<{ success: boolean }>;
}

/** O período configurado em `wrangler.jsonc`; vai no `Retry-After` da recusa. */
export const periodoDoLimiteS = 60;

export type Veredito = "liberado" | "excedido";

/**
 * A chave é o IP de quem chama, que a Cloudflare põe em `CF-Connecting-IP`: a API é anônima e
 * não há outro identificador. O IP só alimenta o contador da própria Cloudflare; não vai para
 * log nem para resposta.
 *
 * Sem o binding (testes, prévia sem limite) ou com o binding falhando, a consulta segue: o
 * plano gratuito já corta tudo ao passar do limite diário, sem cobrar, e uma falha do contador
 * não deve derrubar a leitura da nota.
 */
export async function conferirLimite(
  limite: LimiteDeTaxa | undefined,
  request: Request,
  rota: string,
  traceId: string,
  registrar: Registrar,
): Promise<Veredito> {
  if (limite === undefined) return "liberado";
  const cliente = request.headers.get("cf-connecting-ip") ?? "sem-ip";
  try {
    const { success } = await limite.limit({ key: `${rota} ${cliente}` });
    if (success) return "liberado";
    registrar({ evento: "api.limite", traceId, rota });
    return "excedido";
  } catch (erro) {
    registrar({
      evento: "api.limite-indisponivel",
      traceId,
      tipo: erro instanceof Error ? erro.name : "desconhecido",
    });
    return "liberado";
  }
}
