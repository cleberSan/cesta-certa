/**
 * Formas que o mapa desenha (spec 0001, T10), em GeoJSON e com longitude antes da latitude,
 * como o formato pede. São contas puras: o MapLibre só recebe o resultado.
 */
import { caixaDoRaio, pontoNoRumo, type Ponto } from "../mercados/geo";

export type Posicao = [lon: number, lat: number];

export interface Poligono {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "Polygon"; coordinates: Posicao[][] };
}

export interface Linha {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "LineString"; coordinates: Posicao[] };
}

export interface PontoNoMapa {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "Point"; coordinates: Posicao };
}

export interface PinoNoMapa {
  type: "Feature";
  properties: { id: string; proprio: boolean };
  geometry: { type: "Point"; coordinates: Posicao };
}

export interface Colecao<T> {
  type: "FeatureCollection";
  features: T[];
}

/** O que o mapa precisa de cada mercado: nada além do que a lista já mostra. */
export interface Pino extends Ponto {
  readonly id: string;
  readonly proprio: boolean;
  /** O total da lista neste mercado, escrito sobre o pino quando há preço (T14). */
  readonly rotulo?: string;
}

/** Ponto de partida de "Marcar no mapa" quando ainda não há ponto: o Brasil inteiro na tela. */
export const centroDoBrasil: Ponto = { lat: -14.24, lon: -51.93 };
export const zoomDoBrasil = 3.3;

const posicao = (ponto: Ponto): Posicao => [ponto.lon, ponto.lat];

/** Círculo do raio sobre a esfera, com `lados` vértices e o anel fechado. */
export function circuloDoRaio(centro: Ponto, raioKm: number, lados = 64): Poligono {
  const anel: Posicao[] = [];
  for (let i = 0; i < lados; i++) {
    anel.push(posicao(pontoNoRumo(centro, raioKm, (360 * i) / lados)));
  }
  anel.push(anel[0]!);
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [anel] },
  };
}

/** Caixa que o mapa enquadra para mostrar o raio inteiro: [[oeste, sul], [leste, norte]]. */
export function limitesDoRaio(centro: Ponto, raioKm: number): [Posicao, Posicao] {
  const caixa = caixaDoRaio(centro, raioKm);
  return [
    [caixa.oeste, caixa.sul],
    [caixa.leste, caixa.norte],
  ];
}

/** O ponto da busca, onde o mapa desenha a pessoinha. */
export function colecaoDoPonto(ponto: Ponto): Colecao<PontoNoMapa> {
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: posicao(ponto) } },
    ],
  };
}

export function colecaoDosPinos(pinos: readonly Pino[]): Colecao<PinoNoMapa> {
  return {
    type: "FeatureCollection",
    features: pinos.map((pino) => ({
      type: "Feature",
      properties: { id: pino.id, proprio: pino.proprio },
      geometry: { type: "Point", coordinates: posicao(pino) },
    })),
  };
}

/** Linha tracejada do ponto da busca até o mercado escolhido; sem mercado, nenhuma. */
export function rumoAte(de: Ponto, ate: Ponto | null): Colecao<Linha> {
  return {
    type: "FeatureCollection",
    features:
      ate === null
        ? []
        : [
            {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: [posicao(de), posicao(ate)] },
            },
          ],
  };
}

const casas = 1e5;
const arredondar = (valor: number) => Math.round(valor * casas) / casas;

/**
 * Ponto sob a mira do mapa, com 5 casas (cerca de 1 m), a longitude trazida de volta para
 * -180 a 180 quando a pessoa dá a volta no mundo e a latitude dentro de -90 a 90.
 */
export function pontoDaMira(centro: { readonly lng: number; readonly lat: number }): Ponto {
  const lon = ((((centro.lng + 180) % 360) + 360) % 360) - 180;
  return {
    lat: arredondar(Math.min(90, Math.max(-90, centro.lat))),
    lon: arredondar(lon) + 0,
  };
}
