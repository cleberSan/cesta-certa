import { describe, expect, it } from "vitest";
import { ehIdDeCelula } from "../../shared/contratos/mercados";
import {
  caixaDoRaio,
  celulasDoRaio,
  dentroDoBrasil,
  distanciaKm,
  ehPonto,
  formatarDistancia,
  pontoNoRumo,
} from "./geo";

// spec 0001 CA-07
describe("distanciaKm", () => {
  it("é zero do ponto para ele mesmo", () => {
    expect(distanciaKm({ lat: -23.55, lon: -46.63 }, { lat: -23.55, lon: -46.63 })).toBe(0);
  });

  it("mede cerca de 111 km por grau de latitude", () => {
    expect(distanciaKm({ lat: -23, lon: -46 }, { lat: -24, lon: -46 })).toBeCloseTo(111.2, 1);
  });

  it("mede a distância entre duas capitais com erro pequeno", () => {
    // São Paulo (Praça da Sé) a Rio de Janeiro (Cinelândia): cerca de 361 km em linha reta.
    const distancia = distanciaKm(
      { lat: -23.5503, lon: -46.6339 },
      { lat: -22.9111, lon: -43.1758 },
    );
    expect(distancia).toBeGreaterThan(355);
    expect(distancia).toBeLessThan(365);
  });

  it("é simétrica", () => {
    const a = { lat: -3.73, lon: -38.52 };
    const b = { lat: -8.05, lon: -34.88 };
    expect(distanciaKm(a, b)).toBeCloseTo(distanciaKm(b, a), 9);
  });
});

// spec 0001 CA-06
describe("celulasDoRaio", () => {
  it("pede só a célula do ponto quando o raio não chega à divisa", () => {
    expect(celulasDoRaio({ lat: -23.5, lon: -46.5 }, 5)).toEqual(["-24_-47"]);
  });

  it("pede as quatro células quando o ponto está perto de um canto", () => {
    expect(celulasDoRaio({ lat: -23.01, lon: -46.01 }, 5)).toEqual([
      "-23_-46",
      "-23_-47",
      "-24_-46",
      "-24_-47",
    ]);
  });

  it("pede a célula vizinha só quando o raio alcança a divisa", () => {
    // A divisa de latitude -23 fica a cerca de 5,6 km de -23,05.
    expect(celulasDoRaio({ lat: -23.05, lon: -46.5 }, 5)).toEqual(["-24_-47"]);
    expect(celulasDoRaio({ lat: -23.05, lon: -46.5 }, 10)).toEqual(["-23_-47", "-24_-47"]);
  });

  it("não passa de quatro células com o raio máximo, nem no sul do Brasil", () => {
    for (const ponto of [
      { lat: -33.5, lon: -53.4 },
      { lat: 4.9, lon: -60.5 },
      { lat: -15.5, lon: -47.5 },
    ]) {
      expect(celulasDoRaio(ponto, 30).length).toBeLessThanOrEqual(4);
    }
  });

  it("não deixa de fora o canto diagonal que o círculo toca", () => {
    // O canto (-23, -46) fica a cerca de 4,5 km do ponto, dentro do raio de 5 km.
    const celulas = celulasDoRaio({ lat: -23.03, lon: -46.03 }, 5);
    expect(celulas).toContain("-23_-46");
  });

  it("deixa de fora o canto diagonal que o círculo não toca", () => {
    // Cada divisa fica a cerca de 4,5 km, mas o canto fica a cerca de 6,3 km.
    const celulas = celulasDoRaio({ lat: -23.04, lon: -46.044 }, 5);
    expect(celulas).toEqual(["-23_-47", "-24_-46", "-24_-47"]);
  });

  it("não inventa célula fora do globo perto dos polos e do antimeridiano", () => {
    const celulas = celulasDoRaio({ lat: 89.99, lon: 179.99 }, 5);

    expect(celulas).toContain("89_179");
    expect(celulas.every(ehIdDeCelula)).toBe(true);
  });
});

describe("ehPonto", () => {
  it("aceita coordenadas válidas", () => {
    expect(ehPonto({ lat: -23.5, lon: -46.6 })).toBe(true);
  });

  it.each([
    null,
    "ponto",
    { lat: "-23", lon: -46 },
    { lat: -91, lon: 0 },
    { lat: 0, lon: 181 },
    { lat: Number.NaN, lon: 0 },
    { lat: 0 },
  ])("recusa %j", (valor) => {
    expect(ehPonto(valor)).toBe(false);
  });
});

// spec 0001 CA-39
describe("dentroDoBrasil", () => {
  it.each([
    [-23.55, -46.63],
    [5.2, -60.7],
    [-33.7, -53.4],
    [-3.85, -32.42],
    [-7.5, -73.9],
  ])("(%f, %f) está na caixa do Brasil", (lat, lon) => {
    expect(dentroDoBrasil({ lat, lon })).toBe(true);
  });

  it.each([
    [38.72, -9.14],
    [-34.9, -56.16],
    [40.71, -74.0],
    [-12.05, -77.04],
  ])("(%f, %f) está fora", (lat, lon) => {
    expect(dentroDoBrasil({ lat, lon })).toBe(false);
  });
});

// spec 0001 CA-07
describe("formatarDistancia", () => {
  it.each([
    [0, "10 m"],
    [0.004, "10 m"],
    [0.347, "350 m"],
    [0.999, "1 km"],
    [1, "1 km"],
    [1.26, "1,3 km"],
    [9.96, "10 km"],
    [12.4, "12 km"],
    [29.6, "30 km"],
  ])("%f km vira %s", (km, texto) => {
    expect(formatarDistancia(km)).toBe(texto);
  });
});

describe("caixaDoRaio", () => {
  it("cobre o raio para os quatro lados", () => {
    const centro = { lat: -23.55, lon: -46.63 };
    const caixa = caixaDoRaio(centro, 5);
    expect(distanciaKm(centro, { lat: caixa.norte, lon: centro.lon })).toBeCloseTo(5, 1);
    expect(distanciaKm(centro, { lat: caixa.sul, lon: centro.lon })).toBeCloseTo(5, 1);
    expect(distanciaKm(centro, { lat: centro.lat, lon: caixa.leste })).toBeCloseTo(5, 1);
    expect(distanciaKm(centro, { lat: centro.lat, lon: caixa.oeste })).toBeCloseTo(5, 1);
  });

  it("não explode perto do polo", () => {
    const caixa = caixaDoRaio({ lat: 90, lon: 0 }, 10);
    expect(Number.isFinite(caixa.leste)).toBe(true);
  });
});

describe("pontoNoRumo", () => {
  it("anda a distância pedida em qualquer rumo", () => {
    const centro = { lat: -23.55, lon: -46.63 };
    for (const rumo of [0, 45, 90, 180, 270]) {
      expect(distanciaKm(centro, pontoNoRumo(centro, 7, rumo))).toBeCloseTo(7, 6);
    }
  });

  it("vai para o norte com rumo 0 e para o leste com rumo 90", () => {
    const centro = { lat: 0, lon: 0 };
    expect(pontoNoRumo(centro, 10, 0).lat).toBeGreaterThan(0);
    expect(pontoNoRumo(centro, 10, 90).lon).toBeGreaterThan(0);
  });
});
