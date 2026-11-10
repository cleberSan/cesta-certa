import { describe, expect, it } from "vitest";
import { renderRobots, renderSitemap } from "./seo";

const site = new URL("https://cesta-certa.exemplo.workers.dev");

describe("renderSitemap", () => {
  it("lista os caminhos com URL absoluta, sem repetição e em ordem alfabética", () => {
    const xml = renderSitemap(site, ["/sobre", "/", "/privacidade", "/sobre"]);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locs).toEqual([
      "https://cesta-certa.exemplo.workers.dev/",
      "https://cesta-certa.exemplo.workers.dev/privacidade",
      "https://cesta-certa.exemplo.workers.dev/sobre",
    ]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
    expect(xml.endsWith("</urlset>\n")).toBe(true);
  });

  it("escapa caracteres especiais do XML", () => {
    const xml = renderSitemap(site, ["/busca?a=1&b=2"]);
    expect(xml).toContain("/busca?a=1&amp;b=2</loc>");
    expect(xml).not.toMatch(/&(?!amp;|apos;|lt;|gt;|quot;)/);
  });

  it("sem páginas, gera um sitemap vazio e válido", () => {
    expect(renderSitemap(site, [])).not.toContain("<url>");
  });
});

describe("renderRobots", () => {
  it("libera as páginas, deixa a API de fora e aponta o sitemap", () => {
    expect(renderRobots(site)).toBe(
      [
        "User-agent: *",
        "Allow: /",
        "Disallow: /api/",
        "",
        "Sitemap: https://cesta-certa.exemplo.workers.dev/sitemap.xml",
        "",
      ].join("\n"),
    );
  });
});
