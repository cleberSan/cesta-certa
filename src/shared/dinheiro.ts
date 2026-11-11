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
