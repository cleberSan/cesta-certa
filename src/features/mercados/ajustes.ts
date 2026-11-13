/**
 * Ponto escolhido e raio, guardados no armazém `ajustes` do aparelho (ADR-0005): fora da
 * cópia exportada e nunca enviados a servidor (CA-06).
 */
import type { Registro } from "../../shared/armazenamento/banco";
import { limparTexto } from "../../shared/texto";
import { ehPonto } from "./geo";

export const raios = [1, 2, 3, 5, 10, 15, 20, 30] as const;

export type Raio = (typeof raios)[number];

export const raioPadrao: Raio = 5;

export const origens = ["localizacao", "cidade", "mapa"] as const;

export type Origem = (typeof origens)[number];

export interface PontoEscolhido {
  readonly lat: number;
  readonly lon: number;
  readonly origem: Origem;
  /** Como a tela chama o ponto: "Cidade, UF"; nulo para a localização do aparelho. */
  readonly rotulo: string | null;
}

export interface Ajustes {
  readonly ponto: PontoEscolhido | null;
  readonly raioKm: Raio;
}

export const idDoPonto = "ponto";
export const idDoRaio = "raio";

export function ehRaio(valor: unknown): valor is Raio {
  return typeof valor === "number" && (raios as readonly number[]).includes(valor);
}

function ehOrigem(valor: unknown): valor is Origem {
  return typeof valor === "string" && (origens as readonly string[]).includes(valor);
}

function lerPonto(valor: Record<string, unknown>): PontoEscolhido | null {
  const { lat, lon, origem, rotulo } = valor;
  const ponto = { lat, lon };
  if (!ehPonto(ponto) || !ehOrigem(origem)) return null;
  if (rotulo !== null && typeof rotulo !== "string") return null;
  const texto = rotulo === null ? null : limparTexto(rotulo).slice(0, 160) || null;
  return { lat: ponto.lat, lon: ponto.lon, origem, rotulo: texto };
}

/**
 * Lê os ajustes guardados, campo a campo. O que não estiver no formato é tratado como
 * ausente: sem ponto, a tela volta à explicação; sem raio, vale o padrão.
 */
export function lerAjustes(registros: readonly unknown[]): Ajustes {
  let ponto: PontoEscolhido | null = null;
  let raioKm: Raio = raioPadrao;
  for (const registro of registros) {
    if (typeof registro !== "object" || registro === null) continue;
    const campos = registro as Record<string, unknown>;
    if (campos["id"] === idDoPonto) ponto = lerPonto(campos);
    if (campos["id"] === idDoRaio && ehRaio(campos["km"])) raioKm = campos["km"];
  }
  return { ponto, raioKm };
}

export function registroDoPonto(ponto: PontoEscolhido): Registro & PontoEscolhido {
  return { id: idDoPonto, ...ponto };
}

export function registroDoRaio(km: Raio): Registro & { readonly km: Raio } {
  return { id: idDoRaio, km };
}
