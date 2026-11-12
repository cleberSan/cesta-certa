/**
 * Cabeçalhos de segurança do site e da API: a única fonte (ADR-0001).
 *
 * Páginas: a CSP fica dividida em duas partes que o navegador aplica juntas:
 * - no <meta> de cada página, gerado pelo Astro: as diretivas de recursos abaixo mais
 *   script-src e style-src com os hashes calculados no build, sem 'unsafe-inline';
 * - no cabeçalho HTTP (arquivo `_headers`): as diretivas que um <meta> não aceita, como
 *   frame-ancestors.
 *
 * API (`/api/*`): o Worker responde só JSON e aplica `apiSecurityHeaders` em toda resposta,
 * porque o `_headers` vale apenas para os arquivos estáticos.
 */
export const metaCspDirectives = [
  "default-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
] as const;

/**
 * Mapa de /mercados (ADR-0005): os quadros, o estilo, as fontes e os ícones vêm do
 * OpenFreeMap, sem chave. Só a página de mercados recebe estas diretivas (por
 * `Astro.csp.insertDirective`), e o mapa só baixa algo quando a pessoa o abre.
 */
export const origemDoMapa = "https://tiles.openfreemap.org";

export const cspDoMapa = [`connect-src ${origemDoMapa}`, `img-src blob: ${origemDoMapa}`] as const;

export const headerCsp = [
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join("; ");

const strictTransportSecurity = "max-age=63072000; includeSubDomains";

/**
 * Localização e câmera ficam liberadas só para o próprio site: o app pede a localização para
 * achar os mercados próximos e a câmera para ler o QR Code da nota (spec 0001). Nenhum
 * conteúdo embutido de terceiro pode usá-las.
 */
export const permissionsPolicy =
  "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), browsing-topics=()";

export const securityHeaders: Readonly<Record<string, string>> = {
  "Content-Security-Policy": headerCsp,
  "Strict-Transport-Security": strictTransportSecurity,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": permissionsPolicy,
  "Cross-Origin-Opener-Policy": "same-origin",
};

/** Respostas da API: JSON que nunca é guardado em cache nem embutido em outra página. */
export const apiSecurityHeaders: Readonly<Record<string, string>> = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Strict-Transport-Security": strictTransportSecurity,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
};

/** Arquivos em /_astro/ têm hash no nome: podem ficar em cache por um ano. */
export const immutableAssetsCacheControl = "public, max-age=31536000, immutable";

/**
 * Conteúdo do arquivo `_headers` lido pelos arquivos estáticos da Cloudflare.
 * Formato: um caminho por bloco e um cabeçalho por linha, indentado.
 */
export function renderHeadersFile(): string {
  const block = (path: string, headers: Readonly<Record<string, string>>) =>
    [path, ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`)].join("\n");

  return [
    block("/*", securityHeaders),
    block("/_astro/*", { "Cache-Control": immutableAssetsCacheControl }),
  ]
    .join("\n\n")
    .concat("\n");
}
