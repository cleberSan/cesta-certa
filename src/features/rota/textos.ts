/** Avisos da rota (spec 0001, CA-24 e CA-25), fora do componente para terem teste. */
import type { ModoDeViagem, Rota } from "./links";

export function descreverModo(modo: ModoDeViagem): string {
  return modo === "carro" ? "De carro" : "A pé";
}

/** O que a pessoa precisa saber antes de abrir a rota; vazio quando não há nada a avisar. */
export function avisosDaRota(
  rota: Pick<Rota, "foraDoGoogleMaps" | "wazeSoAPrimeira">,
  primeiro: string,
  modo: ModoDeViagem,
): string[] {
  const avisos: string[] = [];
  if (rota.wazeSoAPrimeira) {
    avisos.push(`O Waze aceita um destino por vez: ele abre com o primeiro mercado, ${primeiro}.`);
  }
  if (modo === "a-pe") avisos.push("O Waze calcula a rota de carro.");
  if (rota.foraDoGoogleMaps > 0) {
    const quantos =
      rota.foraDoGoogleMaps === 1
        ? "o último mercado ficou"
        : `os ${rota.foraDoGoogleMaps} últimos mercados ficaram`;
    avisos.push(`O Google Maps no celular aceita até 4 paradas: ${quantos} de fora.`);
  }
  return avisos;
}
