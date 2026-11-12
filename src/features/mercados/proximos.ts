/** Mercados dentro do raio, em ordem de distância (CA-07), calculados no aparelho. */
import type { MercadoDaBase } from "../../shared/contratos/mercados";
import { dentroDoBrasil, distanciaKm, type Ponto } from "./geo";

export interface MercadoProximo extends MercadoDaBase {
  readonly distanciaKm: number;
}

const ordemDosNomes = new Intl.Collator("pt-BR", { sensitivity: "base" });

/**
 * Filtra pelo raio e ordena por distância em linha reta; empate pelo nome e pelo id, para a
 * mesma entrada dar sempre a mesma ordem.
 */
export function mercadosNoRaio(
  mercados: readonly MercadoDaBase[],
  centro: Ponto,
  raioKm: number,
): MercadoProximo[] {
  const vistos = new Set<string>();
  const proximos: MercadoProximo[] = [];
  for (const mercado of mercados) {
    if (vistos.has(mercado.id)) continue;
    vistos.add(mercado.id);
    const distancia = distanciaKm(centro, mercado);
    if (distancia <= raioKm) proximos.push({ ...mercado, distanciaKm: distancia });
  }
  return proximos.sort(
    (a, b) =>
      a.distanciaKm - b.distanciaKm ||
      ordemDosNomes.compare(a.nome, b.nome) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export type Situacao = "com-mercados" | "sem-mercados" | "fora-do-brasil";

/** Para a tela dizer por que a lista está vazia (CA-39). */
export function situacaoDoPonto(centro: Ponto, quantos: number): Situacao {
  if (quantos > 0) return "com-mercados";
  return dentroDoBrasil(centro) ? "sem-mercados" : "fora-do-brasil";
}
