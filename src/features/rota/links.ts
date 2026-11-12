/**
 * Links para abrir um lugar ou uma rota em outro app (spec 0001, CA-09, CA-24 e CA-25). Só
 * monta o endereço: nada é pedido a esses serviços até a pessoa tocar no link, e o que vai
 * no endereço é o ponto do mercado, nunca o da pessoa.
 */
import type { Ponto } from "../mercados/geo";

/** Mostra o lugar no Google Maps, pelo formato público de URLs dele (api=1). */
export function linkDoLocalNoGoogleMaps(ponto: Ponto): string {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", `${ponto.lat},${ponto.lon}`);
  return url.href;
}
