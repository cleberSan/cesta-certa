import { describe, expect, it } from "vitest";
import { formatarCentavos, lerReais, maiorPrecoEmCentavos } from "./dinheiro";

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

// spec 0001 CA-15
describe("lerReais", () => {
  it.each([
    ["12,90", 1290],
    ["12.90", 1290],
    ["12,9", 1290],
    ["0,05", 5],
    ["7", 700],
    ["7,", 700],
    ["R$ 1.234,56", 123456],
    ["r$12,00", 1200],
    ["1.234", 123400],
    ["  3,49  ", 349],
    ["R$\u00a025,90", 2590],
    ["100.000,00", maiorPrecoEmCentavos],
  ])("lê %j como %d centavos", (texto, centavos) => {
    expect(lerReais(texto)).toBe(centavos);
  });

  it.each([
    "",
    "abc",
    "-5,00",
    "0",
    "0,00",
    "12,345",
    "1,234,56",
    "12.3.4",
    "1.23,45",
    "100.000,01",
    "9999999999",
    "1e3",
    "Infinity",
    "12 ,90",
    "12,90 reais",
    "1 290,00",
  ])("recusa %j", (texto) => {
    expect(lerReais(texto)).toBeNull();
  });
});
