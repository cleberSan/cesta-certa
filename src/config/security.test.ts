import { describe, expect, it } from "vitest";
import {
  apiSecurityHeaders,
  cspDoMapa,
  headerCsp,
  metaCspDirectives,
  origemDoMapa,
  permissionsPolicy,
  renderHeadersFile,
  securityHeaders,
} from "./security";

describe("CSP das páginas", () => {
  it("não libera script nem estilo inline por 'unsafe-inline' ou 'unsafe-eval'", () => {
    const all = [...metaCspDirectives, headerCsp].join("; ");
    expect(all).not.toMatch(/unsafe-(inline|eval)/);
  });

  it("restringe tudo à própria origem por padrão", () => {
    expect(metaCspDirectives).toContain("default-src 'self'");
    expect(metaCspDirectives).toContain("connect-src 'self'");
    expect(metaCspDirectives).toContain("object-src 'none'");
    expect(metaCspDirectives).toContain("form-action 'none'");
  });

  it("não libera nenhuma origem de terceiro", () => {
    expect(metaCspDirectives.join(" ")).not.toMatch(/https?:|\*/);
  });

  it("libera para o mapa só a origem do OpenFreeMap, sem curinga", () => {
    expect(cspDoMapa).toEqual([
      "connect-src https://tiles.openfreemap.org",
      "img-src blob: https://tiles.openfreemap.org",
    ]);
    expect(origemDoMapa).toBe("https://tiles.openfreemap.org");
    expect(cspDoMapa.join(" ")).not.toMatch(/\*|unsafe|http:/);
  });

  it("leva ao cabeçalho as diretivas que o <meta> ignora", () => {
    expect(headerCsp).toContain("frame-ancestors 'none'");
    // Sem script-src/default-src no cabeçalho: os hashes do <meta> decidem os scripts.
    expect(headerCsp).not.toMatch(/script-src|style-src|default-src/);
  });
});

describe("Permissions-Policy", () => {
  it("libera localização e câmera só para o próprio site", () => {
    expect(permissionsPolicy).toContain("geolocation=(self)");
    expect(permissionsPolicy).toContain("camera=(self)");
  });

  it("bloqueia o que o app não usa", () => {
    for (const feature of ["microphone", "payment", "usb", "browsing-topics"]) {
      expect(permissionsPolicy).toContain(`${feature}=()`);
    }
  });
});

describe("cabeçalhos da API", () => {
  it("nunca deixam a resposta em cache nem embutida em outra página", () => {
    expect(apiSecurityHeaders["Cache-Control"]).toBe("no-store");
    expect(apiSecurityHeaders["Content-Security-Policy"]).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect(apiSecurityHeaders["X-Content-Type-Options"]).toBe("nosniff");
    expect(apiSecurityHeaders["Cross-Origin-Resource-Policy"]).toBe("same-origin");
  });

  it("usam o mesmo HSTS das páginas", () => {
    expect(apiSecurityHeaders["Strict-Transport-Security"]).toBe(
      securityHeaders["Strict-Transport-Security"],
    );
  });
});

describe("renderHeadersFile", () => {
  const file = renderHeadersFile();

  it("aplica os cabeçalhos de segurança a todas as rotas", () => {
    const [allRoutes] = file.split("\n\n");
    expect(allRoutes?.startsWith("/*\n")).toBe(true);
    for (const [name, value] of Object.entries(securityHeaders)) {
      expect(allRoutes).toContain(`  ${name}: ${value}`);
    }
  });

  it("deixa os arquivos com hash em cache por um ano", () => {
    expect(file).toContain("/_astro/*\n  Cache-Control: public, max-age=31536000, immutable");
  });

  it("termina com quebra de linha", () => {
    expect(file.endsWith("\n")).toBe(true);
  });
});
