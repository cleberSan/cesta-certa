import { describe, expect, it } from "vitest";
import { siteParaMostrar } from "./detalhes";

// spec 0001 CA-09
describe("siteParaMostrar", () => {
  it("mostra o domínio sem protocolo e sem www, com link em https", () => {
    expect(siteParaMostrar("https://www.mercado.example/")).toEqual({
      href: "https://www.mercado.example/",
      texto: "mercado.example",
    });
  });

  it("mantém o caminho da página", () => {
    expect(siteParaMostrar("https://mercado.example/loja/centro")?.texto).toBe(
      "mercado.example/loja/centro",
    );
  });

  it("mostra site sem https só como texto", () => {
    expect(siteParaMostrar("http://mercado.example")).toEqual({
      href: null,
      texto: "mercado.example",
    });
  });

  it("corta endereço longo", () => {
    const texto = siteParaMostrar(`https://mercado.example/${"a".repeat(100)}`)?.texto ?? "";
    expect(texto).toHaveLength(60);
    expect(texto.endsWith("…")).toBe(true);
  });

  it.each(["javascript:alert(1)", "ftp://mercado.example", "não é endereço"])(
    "ignora %s",
    (site) => {
      expect(siteParaMostrar(site)).toBeNull();
    },
  );
});
