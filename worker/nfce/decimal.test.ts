import { describe, expect, it } from "vitest";
import { lerCentavos, lerQuantidade } from "./decimal";

describe("lerCentavos", () => {
  it.each([
    ["0,00", 0],
    ["0,01", 1],
    ["9,99", 999],
    ["18,9", 1890],
    ["7", 700],
    [" 37,98 ", 3798],
    ["1.059,90", 105990],
    ["12.345.678,00", 1234567800],
    ["1234,56", 123456],
  ])("%j vira %d centavos", (texto, esperado) => {
    expect(lerCentavos(texto)).toBe(esperado);
  });

  it.each([
    ["5,494", 549],
    ["5,495", 550],
    ["5,4950", 550],
    ["9,999", 1000],
    ["0,004", 0],
    ["0,005", 1],
    ["38,9000", 3890],
  ])("com mais de duas casas, %j arredonda a metade para cima: %d", (texto, esperado) => {
    expect(lerCentavos(texto)).toBe(esperado);
  });

  it.each([
    ["vazio", ""],
    ["texto", "grátis"],
    ["ponto decimal", "9.99"],
    ["milhar mal agrupado", "1.23,45"],
    ["negativo", "-1,00"],
    ["duas vírgulas", "1,2,3"],
    ["vírgula no fim", "10,"],
    ["símbolo de moeda", "R$ 9,99"],
    ["acima do limite", "100.000.000,01"],
    ["dígitos demais", "1234567890123,00"],
  ])("recusa %s", (_caso, texto) => {
    expect(lerCentavos(texto)).toBeUndefined();
  });

  it("aceita exatamente o limite de R$ 100 milhões", () => {
    expect(lerCentavos("100.000.000,00")).toBe(10_000_000_000);
  });
});

describe("lerQuantidade", () => {
  it.each([
    ["1", "1"],
    ["2", "2"],
    ["12", "12"],
    ["0,345", "0.345"],
    ["0,3450", "0.345"],
    ["1,000", "1"],
    ["1,5", "1.5"],
    ["1.000,00", "1000"],
    ["007", "7"],
    ["0,0001", "0.0001"],
  ])("%j vira %j", (texto, esperado) => {
    expect(lerQuantidade(texto)).toBe(esperado);
  });

  it.each([
    ["zero", "0"],
    ["zero com casas", "0,000"],
    ["vazio", ""],
    ["texto", "duas"],
    ["negativo", "-1"],
    ["ponto decimal", "1.5"],
  ])("recusa %s", (_caso, texto) => {
    expect(lerQuantidade(texto)).toBeUndefined();
  });
});
