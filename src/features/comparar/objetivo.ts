/**
 * O objetivo da comparação em quatro perguntas (spec 0001, CA-19; plano, "Objetivo em quatro
 * perguntas"): quanto gastar no máximo, que marcas, até quantos mercados e como ir. A distância
 * é o raio da tela de mercados, guardado no registro dele. O objetivo fica no armazém
 * `ajustes`, fora da cópia exportada, como o ponto e o raio (ADR-0005, ADR-0006).
 */
import type { Registro } from "../../shared/armazenamento/banco";
import { lerReais, maiorPrecoEmCentavos } from "../../shared/dinheiro";
import { falha, sucesso, type Resultado } from "../../shared/resultado";
import { preferencias, type Preferencia } from "../lista/lista";
import { modosDeViagem, type ModoDeViagem } from "../rota/links";
import { maximosDeMercados, type Criterios, type MaximoDeMercados } from "./otimizador";

/** Economias mínimas para sugerir mais de um mercado, em centavos (CA-22; padrão R$ 20). */
export const economiasMinimas = [0, 1000, 2000, 3000, 5000] as const;

export interface Objetivo extends Criterios {
  readonly modo: ModoDeViagem;
}

export const objetivoPadrao: Objetivo = {
  tetoCentavos: null,
  marcas: "mais-barato",
  maximoDeMercados: 2,
  economiaMinimaCentavos: 2000,
  modo: "carro",
};

export const idDoObjetivo = "objetivo";

function ehUmDe<T>(valores: readonly T[], valor: unknown): valor is T {
  return (valores as readonly unknown[]).includes(valor);
}

function ehTeto(valor: unknown): valor is number {
  return (
    Number.isSafeInteger(valor) &&
    (valor as number) > 0 &&
    (valor as number) <= maiorPrecoEmCentavos
  );
}

/**
 * Lê o objetivo guardado campo a campo: o campo fora do formato volta ao padrão, e os outros
 * ficam como a pessoa deixou.
 */
export function lerObjetivo(registros: readonly unknown[]): Objetivo {
  const registro = registros.find(
    (valor): valor is Record<string, unknown> =>
      typeof valor === "object" && valor !== null && "id" in valor && valor.id === idDoObjetivo,
  );
  if (registro === undefined) return objetivoPadrao;
  const { tetoCentavos, marcas, maximoDeMercados, economiaMinimaCentavos, modo } = registro;
  return {
    tetoCentavos: ehTeto(tetoCentavos) ? tetoCentavos : null,
    marcas: ehUmDe<Preferencia>(preferencias, marcas) ? marcas : objetivoPadrao.marcas,
    maximoDeMercados: ehUmDe<MaximoDeMercados>(maximosDeMercados, maximoDeMercados)
      ? maximoDeMercados
      : objetivoPadrao.maximoDeMercados,
    economiaMinimaCentavos: ehUmDe<number>(economiasMinimas, economiaMinimaCentavos)
      ? economiaMinimaCentavos
      : objetivoPadrao.economiaMinimaCentavos,
    modo: ehUmDe<ModoDeViagem>(modosDeViagem, modo) ? modo : objetivoPadrao.modo,
  };
}

export function registroDoObjetivo(objetivo: Objetivo): Registro & Objetivo {
  return { id: idDoObjetivo, ...objetivo };
}

/**
 * O teto como a pessoa digitou: em branco é sem teto; senão, um valor em reais, lido direto
 * para centavos, até R$ 100 mil.
 */
export function lerTeto(texto: string): Resultado<number | null, "teto-invalido"> {
  if (texto.trim() === "") return sucesso(null);
  const centavos = lerReais(texto);
  return centavos === null ? falha("teto-invalido") : sucesso(centavos);
}

/** O teto guardado de volta no campo de texto: "650,50"; vazio quando não há teto. */
export function textoDoTeto(centavos: number | null): string {
  if (centavos === null) return "";
  const reais = Math.trunc(centavos / 100);
  const fracao = centavos % 100;
  return fracao === 0 ? String(reais) : `${reais},${String(fracao).padStart(2, "0")}`;
}
