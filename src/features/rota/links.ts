/**
 * Links para abrir um lugar ou uma rota em outro app (spec 0001, CA-09, CA-24 e CA-25). Só
 * monta o endereço: nada é pedido a esses serviços até a pessoa tocar no link. O endereço
 * leva só o ponto dos mercados, nunca o da pessoa: sem origem, o Google Maps e o Waze partem
 * da localização que o próprio app deles tiver.
 */
import { falha, sucesso, type Resultado } from "../../shared/resultado";
import { ehPonto, type Ponto } from "../mercados/geo";

export const modosDeViagem = ["carro", "a-pe"] as const;

export type ModoDeViagem = (typeof modosDeViagem)[number];

/**
 * O Google Maps no navegador do celular aceita até 3 paradas intermediárias além do destino
 * (Google Maps URLs, `waypoints`); a rota leva no máximo 4 mercados.
 */
export const maximoDeParadas = 4;

const modoNoGoogleMaps: Record<ModoDeViagem, string> = { carro: "driving", "a-pe": "walking" };

/** Até 6 casas decimais (cerca de 10 cm), sem notação científica. */
function coordenadas(ponto: Ponto): string {
  const casas = (valor: number) => String(Number(valor.toFixed(6)) + 0);
  return `${casas(ponto.lat)},${casas(ponto.lon)}`;
}

/** Mostra o lugar no Google Maps, pelo formato público de URLs dele (api=1). */
export function linkDoLocalNoGoogleMaps(ponto: Ponto): string {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", coordenadas(ponto));
  return url.href;
}

export interface Rota {
  /** Navegação no Google Maps com as paradas em ordem e o modo escolhido. */
  readonly googleMaps: string;
  /** Navegação no Waze até a primeira parada: ele aceita um destino por vez. */
  readonly waze: string;
  /** Paradas que ficaram de fora do Google Maps por passarem do limite, em ordem. */
  readonly foraDoGoogleMaps: number;
  /** Verdadeiro quando a rota tem mais de uma parada e o Waze leva só à primeira. */
  readonly wazeSoAPrimeira: boolean;
}

export type ErroDaRota = "sem-paradas" | "ponto-invalido";

/** Monta os dois links da rota pelas paradas, na ordem em que a pessoa vai visitar. */
export function montarRota(
  paradas: readonly Ponto[],
  modo: ModoDeViagem,
): Resultado<Rota, ErroDaRota> {
  if (paradas.length === 0) return falha("sem-paradas");
  if (!paradas.every((parada) => ehPonto(parada))) return falha("ponto-invalido");

  const usadas = paradas.slice(0, maximoDeParadas);
  const destino = usadas[usadas.length - 1]!;
  const intermediarias = usadas.slice(0, -1);

  const google = new URL("https://www.google.com/maps/dir/");
  google.searchParams.set("api", "1");
  google.searchParams.set("destination", coordenadas(destino));
  if (intermediarias.length > 0) {
    google.searchParams.set("waypoints", intermediarias.map(coordenadas).join("|"));
  }
  google.searchParams.set("travelmode", modoNoGoogleMaps[modo]);

  const waze = new URL("https://waze.com/ul");
  waze.searchParams.set("ll", coordenadas(paradas[0]!));
  waze.searchParams.set("navigate", "yes");

  return sucesso({
    googleMaps: google.href,
    waze: waze.href,
    foraDoGoogleMaps: paradas.length - usadas.length,
    wazeSoAPrimeira: paradas.length > 1,
  });
}
