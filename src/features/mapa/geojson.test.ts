import { describe, expect, it } from "vitest";
import { distanciaKm } from "../mercados/geo";
import {
  centroDoBrasil,
  circuloDoRaio,
  colecaoDoPonto,
  colecaoDosPinos,
  limitesDoRaio,
  pontoDaMira,
  rumoAte,
} from "./geojson";

const centro = { lat: -23.5503, lon: -46.6339 };

// spec 0001 CA-37
describe("circuloDoRaio", () => {
  it("fecha o anel com todos os vértices na distância do raio", () => {
    const circulo = circuloDoRaio(centro, 5, 32);

    const [anel] = circulo.geometry.coordinates;
    expect(anel).toHaveLength(33);
    expect(anel![0]).toEqual(anel![32]);
    for (const [lon, lat] of anel!) {
      expect(distanciaKm(centro, { lat, lon })).toBeCloseTo(5, 6);
    }
  });

  it("começa no norte e usa 64 lados se nada for dito", () => {
    const [anel] = circuloDoRaio(centro, 1).geometry.coordinates;

    expect(anel).toHaveLength(65);
    expect(anel![0]![0]).toBeCloseTo(centro.lon, 9);
    expect(anel![0]![1]).toBeGreaterThan(centro.lat);
  });
});

describe("limitesDoRaio", () => {
  it("devolve oeste-sul e leste-norte, com o centro dentro", () => {
    const [[oeste, sul], [leste, norte]] = limitesDoRaio(centro, 10);

    expect(oeste).toBeLessThan(centro.lon);
    expect(leste).toBeGreaterThan(centro.lon);
    expect(sul).toBeLessThan(centro.lat);
    expect(norte).toBeGreaterThan(centro.lat);
    expect(distanciaKm(centro, { lat: norte, lon: centro.lon })).toBeGreaterThanOrEqual(9.99);
  });
});

// spec 0001 CA-37
describe("colecaoDosPinos", () => {
  it("leva só id, origem e posição, com a longitude primeiro", () => {
    const colecao = colecaoDosPinos([
      { id: "n101", lat: -23.55, lon: -46.63, proprio: false },
      { id: "p1", lat: -23.56, lon: -46.64, proprio: true },
    ]);

    expect(colecao).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { id: "n101", proprio: false },
          geometry: { type: "Point", coordinates: [-46.63, -23.55] },
        },
        {
          type: "Feature",
          properties: { id: "p1", proprio: true },
          geometry: { type: "Point", coordinates: [-46.64, -23.56] },
        },
      ],
    });
  });

  it("aceita lista vazia", () => {
    expect(colecaoDosPinos([]).features).toEqual([]);
  });
});

describe("colecaoDoPonto", () => {
  it("põe o ponto da busca, com a longitude primeiro", () => {
    expect(colecaoDoPonto(centro).features).toEqual([
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [centro.lon, centro.lat] },
      },
    ]);
  });
});

describe("rumoAte", () => {
  it("liga o ponto ao mercado escolhido", () => {
    const destino = { lat: -23.56, lon: -46.64 };

    expect(rumoAte(centro, destino).features[0]?.geometry.coordinates).toEqual([
      [centro.lon, centro.lat],
      [destino.lon, destino.lat],
    ]);
  });

  it("não desenha nada sem mercado escolhido", () => {
    expect(rumoAte(centro, null)).toEqual({ type: "FeatureCollection", features: [] });
  });
});

// spec 0001 CA-05, CA-08
describe("pontoDaMira", () => {
  it("arredonda para 5 casas", () => {
    expect(pontoDaMira({ lng: -46.633912345, lat: -23.550298765 })).toEqual({
      lat: -23.5503,
      lon: -46.63391,
    });
  });

  it.each([
    [190, -170],
    [-190, 170],
    [540, -180],
    [-46.6, -46.6],
  ])("traz a longitude %d de volta para %d", (lng, esperada) => {
    expect(pontoDaMira({ lng, lat: 0 }).lon).toBeCloseTo(esperada, 9);
  });

  it("limita a latitude e não devolve -0", () => {
    expect(pontoDaMira({ lng: 0, lat: 95 })).toEqual({ lat: 90, lon: 0 });
    expect(pontoDaMira({ lng: 0, lat: -95 }).lat).toBe(-90);
    expect(Object.is(pontoDaMira({ lng: -0.000001, lat: 0 }).lon, -0)).toBe(false);
  });

  it("parte do centro do Brasil, que fica dentro do país", () => {
    expect(centroDoBrasil.lat).toBeGreaterThan(-33.76);
    expect(centroDoBrasil.lon).toBeLessThan(-28.84);
  });
});
