/**
 * Dinheiro sempre em centavos inteiros: somar e comparar preço em ponto flutuante erra
 * centavo.
 */

const nbsp = "\u00a0";

/** 123456 vira "R$ 1.234,56" (com espaço que não quebra linha). */
export function formatarCentavos(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) {
    throw new RangeError(`Valor em centavos inválido: ${centavos}`);
  }
  const absoluto = Math.abs(centavos);
  const reais = Math.trunc(absoluto / 100)
    .toString()
    .replace(/\B(?=(\d{3})+$)/g, ".");
  const fracao = (absoluto % 100).toString().padStart(2, "0");
  return `${centavos < 0 ? "-" : ""}R$${nbsp}${reais},${fracao}`;
}

/** O maior preço que o app aceita: R$ 100 mil, bem acima de qualquer compra do mês. */
export const maiorPrecoEmCentavos = 10_000_000;

/**
 * Lê um preço digitado em reais e devolve centavos, ou nulo se não for um preço válido.
 * Aceita "12,90", "12.90", "R$ 1.234,56", "1234" e "0,5"; recusa negativo, zero, mais de duas
 * casas, texto e valor acima de `maiorPrecoEmCentavos`. Sem ponto flutuante: o texto vira
 * inteiro direto.
 */
export function lerReais(texto: string): number | null {
  const limpo = texto.trim().replace(/^R\$\s*/i, "");
  let inteiro: string;
  let fracao: string;
  const comVirgula = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})$/.exec(limpo);
  const comPonto = /^(\d+)\.(\d{1,2})$/.exec(limpo);
  const semCentavos = /^(\d{1,3}(?:\.\d{3})+|\d+),?$/.exec(limpo);
  if (comVirgula !== null) {
    inteiro = comVirgula[1]!;
    fracao = comVirgula[2]!;
  } else if (comPonto !== null) {
    inteiro = comPonto[1]!;
    fracao = comPonto[2]!;
  } else if (semCentavos !== null) {
    inteiro = semCentavos[1]!;
    fracao = "";
  } else {
    return null;
  }
  const digitos = inteiro.replaceAll(".", "");
  if (digitos.length > 9) return null;
  const centavos = Number(digitos) * 100 + Number(fracao.padEnd(2, "0"));
  return centavos > 0 && centavos <= maiorPrecoEmCentavos ? centavos : null;
}
