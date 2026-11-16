// @ts-check
import { readFileSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import react from "@astrojs/react";
import { defineConfig, fontProviders } from "astro/config";
import { montarListaDoServiceWorker, montarServiceWorker } from "./src/config/offline.ts";
import { metaCspDirectives, renderHeadersFile } from "./src/config/security.ts";
import { isIndexable, publicPath, siteUrlFromEnv } from "./src/config/site.ts";
import { renderRobots, renderSitemap } from "./src/shared/seo.ts";

const site = siteUrlFromEnv(process.env);

/** Grava dist/_headers a partir de src/config/security.ts, a única fonte dos cabeçalhos. */
function cloudflareHeaders() {
  return /** @type {import("astro").AstroIntegration} */ ({
    name: "cesta-certa:cloudflare-headers",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        await writeFile(new URL("_headers", dir), renderHeadersFile());
        logger.info("_headers gerado");
      },
    },
  });
}

/**
 * Grava robots.txt e sitemap.xml com as páginas geradas no build, menos as de
 * src/config/site.ts que ficam fora dos buscadores.
 */
function searchEngineFiles() {
  return /** @type {import("astro").AstroIntegration} */ ({
    name: "cesta-certa:search-engine-files",
    hooks: {
      "astro:build:done": async ({ dir, pages, logger }) => {
        await writeFile(new URL("robots.txt", dir), renderRobots(site));
        const paths = pages.map((page) => publicPath(page.pathname)).filter(isIndexable);
        await writeFile(new URL("sitemap.xml", dir), renderSitemap(site, paths));
        logger.info(`sitemap.xml gerado com ${paths.length} páginas`);
      },
    },
  });
}

/**
 * Escreve em dist/sw.js a versão e a lista de arquivos que o service worker guarda para abrir
 * sem internet (spec 0001, CA-36; ADR-0007). A lista sai das páginas geradas; as regras ficam
 * em src/config/offline.ts.
 */
function serviceWorker() {
  return /** @type {import("astro").AstroIntegration} */ ({
    name: "cesta-certa:service-worker",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        /** @param {string} arquivo */
        const ler = (arquivo) => {
          try {
            return readFileSync(new URL(arquivo, dir));
          } catch {
            return undefined;
          }
        };
        const paginas = (await readdir(dir)).filter((nome) => nome.endsWith(".html"));
        const lista = montarListaDoServiceWorker(ler, paginas);
        const destino = new URL("sw.js", dir);
        await writeFile(destino, montarServiceWorker(await readFile(destino, "utf8"), lista));
        logger.info(`sw.js gerado com ${lista.enderecos.length} arquivos (versão ${lista.versao})`);
      },
    },
  });
}

export default defineConfig({
  // Endereço de produção, ou SITE_URL nos testes E2E (src/config/site.ts).
  site: site.origin,
  // Gera sobre.html em vez de sobre/index.html: URLs sem barra no final, como os arquivos
  // estáticos da Cloudflare servem por padrão (ADR-0001).
  build: { format: "file", inlineStylesheets: "never" },
  trailingSlash: "never",
  security: {
    csp: {
      algorithm: "SHA-256",
      directives: [...metaCspDirectives],
    },
  },
  // Fontes próprias, servidas pelo site (spec 0002, ADR-0009): o build publica os arquivos com
  // hash em /_astro/fonts/ e gera o @font-face com uma fonte reserva de métricas ajustadas. O
  // estilo que o <Font /> põe na página entra na CSP por hash, como os demais.
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Bricolage Grotesque",
      cssVariable: "--fonte-titulo",
      fallbacks: ["system-ui", "sans-serif"],
      display: "swap",
      options: {
        variants: [
          {
            src: ["./src/assets/fonts/bricolage-grotesque-800-latin.woff2"],
            weight: 800,
            style: "normal",
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: "Inter",
      cssVariable: "--fonte-texto",
      fallbacks: ["system-ui", "sans-serif"],
      display: "swap",
      options: {
        variants: [
          { src: ["./src/assets/fonts/inter-latin.woff2"], weight: "400 700", style: "normal" },
        ],
      },
    },
  ],
  // React só nas ilhas (ADR-0001); as demais páginas saem sem JavaScript.
  integrations: [react(), cloudflareHeaders(), searchEngineFiles(), serviceWorker()],
  devToolbar: { enabled: false },
});
