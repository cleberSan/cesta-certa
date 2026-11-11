/**
 * Endereço público e indexação.
 *
 * O endereço de produção fica aqui, revisado em PR como o resto do código. Canonical, Open
 * Graph e sitemap usam ele, inclusive nas prévias da Cloudflare, que apontam o canonical para
 * o site oficial.
 */
export const productionSiteUrl = "https://cesta-certa.clebersan.workers.dev";

export const siteName = "Cesta Certa";
export const siteTagline = "a compra do mês no mercado certo";
export const repositoryUrl = "https://github.com/cleberSan/cesta-certa";

/**
 * Valida a variável SITE_URL, que troca o endereço no build dos testes E2E (o do
 * `wrangler dev`). Só origem: https, ou http em 127.0.0.1 e localhost.
 */
export function parseSiteUrl(value: string | undefined): URL | undefined {
  if (value === undefined || value.trim() === "") return undefined;

  if (!URL.canParse(value)) {
    throw new Error(`SITE_URL inválida: ${value}`);
  }
  const url = new URL(value);
  const isLoopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    throw new Error(`SITE_URL precisa usar https (http só para 127.0.0.1 ou localhost): ${value}`);
  }
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error(`SITE_URL deve ter só a origem, sem caminho, query ou credenciais: ${value}`);
  }
  return url;
}

/**
 * Endereço do site no build: o de produção, ou a SITE_URL quando definida. No build da
 * Cloudflare (Workers Builds define WORKERS_CI=1), uma SITE_URL diferente do endereço de
 * produção quebra o build, para uma variável esquecida no painel não desviar o canonical.
 */
export function siteUrlFromEnv(env: Readonly<Record<string, string | undefined>>): URL {
  const production = new URL(productionSiteUrl);
  const override = parseSiteUrl(env["SITE_URL"]);
  if (override === undefined) return production;

  if (env["WORKERS_CI"] === "1" && override.origin !== production.origin) {
    throw new Error(
      `SITE_URL do painel da Cloudflare (${override.origin}) difere do endereço em src/config/site.ts: apague a variável do painel (CONTRIBUTING.md)`,
    );
  }
  return override;
}

/**
 * Páginas fora dos buscadores: o 404 não é conteúdo, e a lista e o teste da nota fiscal são
 * ferramentas, não vitrine. Recebem `<meta name="robots" content="noindex">` e ficam fora do
 * sitemap.
 */
export const noindexPaths: readonly string[] = ["/404", "/lista", "/nota"];

/**
 * Caminho público de uma página: sem ".html", sem "index" e sem barra no final, como a
 * Cloudflare serve (ADR-0001). Aceita tanto o `Astro.url.pathname` quanto os caminhos do
 * fim do build, que vêm sem a barra inicial.
 */
export function publicPath(pathname: string): string {
  return `/${pathname}`
    .replace(/\/{2,}/g, "/")
    .replace(/\.html$/, "")
    .replace(/(^|\/)index$/, "$1")
    .replace(/(.)\/$/, "$1");
}

export function isIndexable(pathname: string): boolean {
  return !noindexPaths.includes(publicPath(pathname));
}
