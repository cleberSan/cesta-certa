import { describe, expect, it } from "vitest";
import { formatarCentavos } from "./dinheiro";

const nbsp = "\u00a0";

describe("formatarCentavos", () => {
  it.each([
    [0, `R$${nbsp}0,00`],
    [5, `R$${nbsp}0,05`],
    [99, `R$${nbsp}0,99`],
    [100, `R$${nbsp}1,00`],
    [1999, `R$${nbsp}19,99`],
    [123456, `R$${nbsp}1.234,56`],
    [100000000, `R$${nbsp}1.000.000,00`],
    [-250, `-R$${nbsp}2,50`],
  ])("%d centavos vira %j", (centavos, esperado) => {
    expect(formatarCentavos(centavos)).toBe(esperado);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60])("recusa %d", (valor) => {
    expect(() => formatarCentavos(valor)).toThrow(RangeError);
  });
});
