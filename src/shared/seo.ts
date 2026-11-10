/**
 * Arquivos para buscadores: sitemap.xml e robots.txt. Funções puras; quem chama passa o
 * endereço do site já resolvido (src/config/site.ts).
 */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** sitemap.xml com os caminhos públicos, em ordem alfabética para um diff estável. */
export function renderSitemap(site: URL, paths: readonly string[]): string {
  const urls = [...new Set(paths)]
    .sort()
    .map((path) => `  <url><loc>${escapeXml(new URL(path, site).href)}</loc></url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

/**
 * robots.txt: as páginas ficam liberadas e a API fica fora, porque só responde a POST do
 * próprio site.
 */
export function renderRobots(site: URL): string {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "",
    `Sitemap: ${new URL("/sitemap.xml", site).href}`,
    "",
  ].join("\n");
}
