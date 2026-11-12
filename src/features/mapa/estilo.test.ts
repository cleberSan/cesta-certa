import { describe, expect, it } from "vitest";
import { cspDoMapa, origemDoMapa } from "../../config/security";
import {
  camadaDosPinos,
  camadasDosMercados,
  creditosDosMercados,
  estiloDoMapa,
  filtroDoEscolhido,
  fontes,
  imagemDaPessoinha,
  mensagemDoMapa,
  textosDoMapa,
} from "./estilo";

describe("estiloDoMapa", () => {
  it("vem da única origem que a CSP de /mercados libera, em https", () => {
    expect(estiloDoMapa).toBe("https://tiles.openfreemap.org/styles/liberty");
    expect(new URL(estiloDoMapa).origin).toBe(origemDoMapa);
    expect(cspDoMapa.every((diretiva) => diretiva.endsWith(origemDoMapa))).toBe(true);
  });

  it("dá crédito ao OpenStreetMap pelos mercados, com link seguro", () => {
    expect(creditosDosMercados).toContain("https://www.openstreetmap.org/copyright");
    expect(creditosDosMercados).toContain('rel="noopener noreferrer"');
  });
});

// spec 0001 CA-37
describe("textosDoMapa", () => {
  it("dá ao mapa o título da tela e põe os botões em português", () => {
    const textos = textosDoMapa("Mapa dos mercados");

    expect(textos["Map.Title"]).toBe("Mapa dos mercados");
    expect(textos["NavigationControl.ZoomIn"]).toBe("Aproximar");
    expect(textos["NavigationControl.ZoomOut"]).toBe("Afastar");
    expect(textos["CooperativeGesturesHandler.MobileHelpText"]).toBe(
      "Use dois dedos para mover o mapa",
    );
  });

  it("não deixa nenhum texto vazio", () => {
    expect(Object.values(textosDoMapa("Mapa")).every((texto) => texto.trim() !== "")).toBe(true);
  });
});

describe("camadasDosMercados", () => {
  const camadas = camadasDosMercados();

  it("desenha raio, rumo e pinos de baixo para cima, só com as fontes do app", () => {
    expect(camadas.map((camada) => camada.id)).toEqual([
      "raio-fundo",
      "raio-borda",
      "rumo",
      "ponto",
      "mercados",
      "mercados-miolo",
      "mercado-escolhido",
    ]);
    const usadas = new Set(camadas.map((camada) => ("source" in camada ? camada.source : null)));
    expect([...usadas].sort()).toEqual(Object.values(fontes).sort());
    expect(camadas.some((camada) => camada.id === camadaDosPinos)).toBe(true);
  });

  it("não usa texto no mapa, que dependeria de fontes baixadas", () => {
    for (const camada of camadas) {
      const layout = "layout" in camada ? (camada.layout ?? {}) : {};
      expect(Object.keys(layout).some((chave) => chave.startsWith("text-"))).toBe(false);
    }
  });

  it("desenha a pessoinha abaixo dos pinos, sem sumir quando encosta em outro desenho", () => {
    const ids = camadas.map((camada) => camada.id);
    const ponto = camadas.find((camada) => camada.id === "ponto");

    expect(ids.indexOf("ponto")).toBeLessThan(ids.indexOf("mercados"));
    expect(ponto && "layout" in ponto ? ponto.layout : null).toMatchObject({
      "icon-image": imagemDaPessoinha.nome,
      "icon-anchor": "bottom",
      "icon-allow-overlap": true,
    });
  });

  it("marca o mercado cadastrado pela forma, não só pela cor", () => {
    const miolo = camadas.find((camada) => camada.id === "mercados-miolo");

    expect(miolo && "filter" in miolo ? miolo.filter : null).toEqual([
      "==",
      ["get", "proprio"],
      true,
    ]);
  });
});

describe("filtroDoEscolhido", () => {
  it("filtra pelo id do mercado escolhido", () => {
    expect(filtroDoEscolhido("n101")).toEqual(["==", ["get", "id"], "n101"]);
  });

  it("sem escolha, não pega nenhum mercado", () => {
    expect(filtroDoEscolhido(null)).toEqual(["==", ["get", "id"], ""]);
  });
});

describe("mensagemDoMapa", () => {
  it.each(["sem-webgl", "sem-conexao"] as const)(
    "explica a falha %s sem termo técnico",
    (falha) => {
      expect(mensagemDoMapa(falha)).not.toMatch(/webgl|erro|falha/i);
    },
  );
});
