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

/**
 * Células de 1 grau que o círculo do raio toca, em ordem. Uma célula entra quando o ponto
 * dela mais perto do centro fica dentro do raio. Com raio de até 30 km, são no máximo quatro.
 */
export function celulasDoRaio(centro: Ponto, raioKm: number): string[] {
  const grausLat = raioKm / 111.2;
  const cosseno = Math.max(Math.cos(radianos(centro.lat)), 0.01);
  const grausLon = raioKm / (111.2 * cosseno);
  const celulas: string[] = [];
  for (
    let lat = Math.floor(centro.lat - grausLat);
    lat <= Math.floor(centro.lat + grausLat);
    lat++
  ) {
    for (
      let lon = Math.floor(centro.lon - grausLon);
      lon <= Math.floor(centro.lon + grausLon);
      lon++
    ) {
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
