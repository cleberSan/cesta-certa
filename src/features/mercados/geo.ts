/**
 * Contas de lugar feitas no aparelho (spec 0001, CA-06 e CA-07): distância em linha reta,
 * células que o raio toca e a caixa que contém o Brasil. Nada daqui sai do aparelho.
 */
import { celulaDe } from "../../shared/contratos/mercados";

export interface Ponto {
  readonly lat: number;
  readonly lon: number;
}

/** Raio médio da Terra, em km. */
const raioDaTerra = 6371.0088;

const radianos = (graus: number) => (graus * Math.PI) / 180;

/** Distância em linha reta (fórmula de haversine), em km. */
export function distanciaKm(a: Ponto, b: Ponto): number {
  const dLat = radianos(b.lat - a.lat);
  const dLon = radianos(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radianos(a.lat)) * Math.cos(radianos(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * raioDaTerra * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function ehPonto(valor: unknown): valor is Ponto {
  if (typeof valor !== "object" || valor === null) return false;
  const { lat, lon } = valor as Record<string, unknown>;
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}

const limitar = (valor: number, minimo: number, maximo: number) =>
  Math.min(Math.max(valor, minimo), maximo);

export interface Caixa {
  readonly sul: number;
  readonly norte: number;
  readonly oeste: number;
  readonly leste: number;
}

/**
 * Caixa que contém o círculo do raio, com cerca de 111,2 km por grau de latitude. Perto dos
 * polos a longitude é limitada para a conta não explodir.
 */
export function caixaDoRaio(centro: Ponto, raioKm: number): Caixa {
  const grausLat = raioKm / 111.2;
  const cosseno = Math.max(Math.cos(radianos(centro.lat)), 0.01);
  const grausLon = raioKm / (111.2 * cosseno);
  return {
    sul: centro.lat - grausLat,
    norte: centro.lat + grausLat,
    oeste: centro.lon - grausLon,
    leste: centro.lon + grausLon,
  };
}

/** Ponto a `km` do centro no rumo dado, em graus a partir do norte, sobre a esfera. */
export function pontoNoRumo(centro: Ponto, km: number, rumoGraus: number): Ponto {
  const d = km / raioDaTerra;
  const rumo = radianos(rumoGraus);
  const lat1 = radianos(centro.lat);
  const lon1 = radianos(centro.lon);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(rumo),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(rumo) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

/**
 * Células de 1 grau que o círculo do raio toca, em ordem. Uma célula entra quando o ponto
 * dela mais perto do centro fica dentro do raio. Com raio de até 30 km, são no máximo quatro.
 */
export function celulasDoRaio(centro: Ponto, raioKm: number): string[] {
  const caixa = caixaDoRaio(centro, raioKm);
  const celulas: string[] = [];
  for (let lat = Math.floor(caixa.sul); lat <= Math.floor(caixa.norte); lat++) {
    for (let lon = Math.floor(caixa.oeste); lon <= Math.floor(caixa.leste); lon++) {
      if (lat < -90 || lat > 89 || lon < -180 || lon > 179) continue;
      const maisPerto = {
        lat: limitar(centro.lat, lat, lat + 1),
        lon: limitar(centro.lon, lon, lon + 1),
      };
      if (distanciaKm(centro, maisPerto) <= raioKm) celulas.push(celulaDe(lat, lon));
    }
  }
  return celulas.sort();
}

/**
 * Caixa que contém o Brasil, ilhas oceânicas incluídas. Ponto fora dela está fora do Brasil;
 * ponto dentro pode ser de um país vizinho, e aí o app só não acha mercado da base (CA-39).
 */
export function dentroDoBrasil(ponto: Ponto): boolean {
  return ponto.lat >= -33.76 && ponto.lat <= 5.28 && ponto.lon >= -73.99 && ponto.lon <= -28.84;
}

/** "350 m", "1,2 km", "12 km". */
export function formatarDistancia(km: number): string {
  const metros = Math.round((km * 1000) / 10) * 10;
  if (metros < 1000) return `${Math.max(10, metros)} m`;
  const casas = km < 10 ? 1 : 0;
  return `${km.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: 0 })} km`;
}
