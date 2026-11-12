/**
 * Respostas sintéticas da Overpass: nomes, marcas, sites e números de objeto inventados.
 * Os pontos caem em células reais do Brasil para exercitar a divisão em células.
 */
import type { ElementoOverpass } from "../overpass.ts";

export const supermercado: ElementoOverpass = {
  type: "node",
  id: 101,
  lat: -23.5505123,
  lon: -46.6333456,
  tags: {
    shop: "supermarket",
    name: "Supermercado Exemplo",
    opening_hours: "Mo-Sa 07:00-22:00; Su 08:00-20:00",
    website: "https://exemplo.invalid/loja",
  },
};

export const atacarejoPorContorno: ElementoOverpass = {
  type: "way",
  id: 202,
  center: { lat: -23.6, lon: -46.7 },
  tags: { shop: "supermarket", name: "Atacadão Fictício", brand: "Rede Fictícia" },
};

export const atacadoDeAlimentos: ElementoOverpass = {
  type: "relation",
  id: 303,
  center: { lat: -22.9, lon: -47.06 },
  tags: { shop: "wholesale", name: "Distribuidora Modelo", wholesale: "food" },
};

export const atacadoDeOutroRamo: ElementoOverpass = {
  type: "node",
  id: 404,
  lat: -22.91,
  lon: -47.07,
  tags: { shop: "wholesale", name: "Depósito de Tijolos", wholesale: "building_materials" },
};

export const mercadinho: ElementoOverpass = {
  type: "node",
  id: 505,
  lat: -23.55,
  lon: -46.64,
  tags: {
    shop: "convenience",
    brand: "Mercadinho da Esquina",
    "contact:website": "http://exemplo.invalid",
  },
};

export const hortifruti: ElementoOverpass = {
  type: "node",
  id: 606,
  lat: -22.95,
  lon: -43.2,
  tags: { shop: "greengrocer", name: "Sacolão Modelo", website: "javascript:alert(1)" },
};

export const semNome: ElementoOverpass = {
  type: "node",
  id: 707,
  lat: -23.5,
  lon: -46.6,
  tags: { shop: "supermarket" },
};

export const contornoSemCentro: ElementoOverpass = {
  type: "way",
  id: 808,
  tags: { shop: "supermarket", name: "Mercado Sem Ponto" },
};

export const padaria: ElementoOverpass = {
  type: "node",
  id: 909,
  lat: -23.5,
  lon: -46.6,
  tags: { shop: "bakery", name: "Padaria Exemplo" },
};

export const cidadeGrande: ElementoOverpass = {
  type: "node",
  id: 1001,
  lat: -23.5506789,
  lon: -46.6333111,
  tags: { place: "city", name: "Cidade Exemplo" },
};

export const cidadePequena: ElementoOverpass = {
  type: "node",
  id: 1002,
  lat: -22.9,
  lon: -47.06,
  tags: { place: "town", name: "Águas Fictícias" },
};

export const vila: ElementoOverpass = {
  type: "node",
  id: 1003,
  lat: -22.8,
  lon: -47.1,
  tags: { place: "village", name: "Vila Exemplo" },
};

/** Corpo de resposta da Overpass com os elementos dados. */
export function resposta(
  elementos: readonly unknown[],
  extras: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    version: 0.6,
    generator: "Overpass API (sintético)",
    osm3s: { timestamp_osm_base: "2026-11-01T00:00:00Z" },
    elements: elementos,
    ...extras,
  });
}
