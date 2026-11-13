import { describe, expect, it } from "vitest";
import {
  isIndexable,
  noindexPaths,
  parseSiteUrl,
  productionSiteUrl,
  publicPath,
  repositoryUrl,
  siteUrlFromEnv,
} from "./site";

describe("parseSiteUrl", () => {
  it("aceita a origem em https", () => {
    expect(parseSiteUrl("https://cesta-certa.exemplo.workers.dev")?.origin).toBe(
      "https://cesta-certa.exemplo.workers.dev",
    );
    expect(parseSiteUrl("https://cestacerta.example/")?.href).toBe("https://cestacerta.example/");
  });

  it("aceita http só no próprio computador, para os testes E2E", () => {
    expect(parseSiteUrl("http://127.0.0.1:8787")?.port).toBe("8787");
    expect(parseSiteUrl("http://localhost:4321")?.hostname).toBe("localhost");
  });

  it.each([undefined, "", "  "])("sem valor (%j) não define endereço", (value) => {
    expect(parseSiteUrl(value)).toBeUndefined();
  });

  it.each([
    ["texto que não é URL", "cesta"],
    ["http fora do computador local", "http://cestacerta.example"],
    ["outro protocolo", "ftp://cestacerta.example"],
    ["javascript:", "javascript:alert(1)"],
    ["caminho", "https://cestacerta.example/app"],
    ["query", "https://cestacerta.example/?utm=1"],
    ["fragmento", "https://cestacerta.example/#topo"],
    ["credenciais", "https://user:senha@cestacerta.example"],
  ])("recusa %s", (_case, value) => {
    expect(() => parseSiteUrl(value)).toThrow(/SITE_URL/);
  });
});

describe("productionSiteUrl", () => {
  it("é uma origem válida em https", () => {
    expect(parseSiteUrl(productionSiteUrl)?.origin).toBe(productionSiteUrl);
    expect(productionSiteUrl).toMatch(/^https:\/\//);
  });
});

describe("repositoryUrl", () => {
  it("aponta para o repositório no GitHub, em https", () => {
    expect(new URL(repositoryUrl).origin).toBe("https://github.com");
  });
});

describe("siteUrlFromEnv", () => {
  const local = "http://127.0.0.1:8787";

  it.each([{}, { SITE_URL: "" }, { SITE_URL: "  " }, { WORKERS_CI: "1" }])(
    "sem SITE_URL (%j) usa o endereço de produção, inclusive no build da Cloudflare",
    (env) => {
      expect(siteUrlFromEnv(env).origin).toBe(productionSiteUrl);
    },
  );

  it("fora da Cloudflare, a SITE_URL troca o endereço para os testes E2E", () => {
    expect(siteUrlFromEnv({ SITE_URL: local }).origin).toBe(local);
    expect(siteUrlFromEnv({ SITE_URL: local, WORKERS_CI: "0" }).origin).toBe(local);
  });

  it("no build da Cloudflare, aceita a SITE_URL igual ao endereço de produção", () => {
    expect(siteUrlFromEnv({ SITE_URL: `${productionSiteUrl}/`, WORKERS_CI: "1" }).origin).toBe(
      productionSiteUrl,
    );
  });

  it("no build da Cloudflare, SITE_URL diferente do código quebra o build", () => {
    expect(() =>
      siteUrlFromEnv({ SITE_URL: "https://outro.exemplo.workers.dev", WORKERS_CI: "1" }),
    ).toThrow(/difere do endereço em src\/config\/site.ts/);
  });

  it("valor inválido quebra o build em qualquer ambiente", () => {
    expect(() => siteUrlFromEnv({ SITE_URL: "http://cestacerta.example" })).toThrow(/https/);
    expect(() =>
      siteUrlFromEnv({ SITE_URL: "http://cestacerta.example", WORKERS_CI: "1" }),
    ).toThrow(/https/);
  });

  it("devolve uma URL nova a cada chamada", () => {
    const first = siteUrlFromEnv({});
    first.hostname = "alterado.exemplo";
    expect(siteUrlFromEnv({}).origin).toBe(productionSiteUrl);
  });
});

describe("publicPath", () => {
  it.each([
    ["", "/"],
    ["/", "/"],
    ["index.html", "/"],
    ["/index", "/"],
    ["sobre", "/sobre"],
    ["/sobre.html", "/sobre"],
    ["/sobre/", "/sobre"],
    ["ajuda/nota-fiscal", "/ajuda/nota-fiscal"],
    ["//sobre", "/sobre"],
  ])("%j vira %j", (input, expected) => {
    expect(publicPath(input)).toBe(expected);
  });
});

describe("isIndexable", () => {
  it("deixa o 404 e as páginas de ferramenta fora dos buscadores", () => {
    expect(noindexPaths).toEqual(["/404", "/dados", "/lista", "/mercados", "/nota", "/precos"]);
    expect(isIndexable("/404.html")).toBe(false);
    for (const path of ["nota", "lista", "/lista.html", "/dados", "dados.html"]) {
      expect(isIndexable(path)).toBe(false);
    }
  });

  it("indexa as páginas de conteúdo", () => {
    for (const path of ["/", "/sobre", "/privacidade"]) {
      expect(isIndexable(path)).toBe(true);
    }
  });
});
