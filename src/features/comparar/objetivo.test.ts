import { describe, expect, it } from "vitest";
import {
  idDoObjetivo,
  lerObjetivo,
  lerTeto,
  objetivoPadrao,
  registroDoObjetivo,
  textoDoTeto,
  type Objetivo,
} from "./objetivo";

const escolhido: Objetivo = {
  tetoCentavos: 65_050,
  marcas: "so-esta-marca",
  maximoDeMercados: 3,
  economiaMinimaCentavos: 5000,
  modo: "a-pe",
};

// spec 0001 CA-19
describe("lerObjetivo", () => {
  it("sem registro, vale o padrão: sem teto, o mais barato, até 2 mercados, R$ 20 e de carro", () => {
    expect(lerObjetivo([])).toEqual(objetivoPadrao);
    expect(objetivoPadrao).toEqual({
      tetoCentavos: null,
      marcas: "mais-barato",
      maximoDeMercados: 2,
      economiaMinimaCentavos: 2000,
      modo: "carro",
    });
  });

  it("lê o que foi guardado, entre outros ajustes", () => {
    const registros = [{ id: "raio", km: 5 }, null, "x", registroDoObjetivo(escolhido)];

    expect(lerObjetivo(registros)).toEqual(escolhido);
    expect(registroDoObjetivo(escolhido).id).toBe(idDoObjetivo);
  });

  it("o campo fora do formato volta ao padrão e os outros ficam", () => {
    expect(
      lerObjetivo([
        {
          id: idDoObjetivo,
          tetoCentavos: 0,
          marcas: "qualquer",
          maximoDeMercados: 4,
          economiaMinimaCentavos: 1500,
          modo: "a-pe",
        },
      ]),
    ).toEqual({ ...objetivoPadrao, modo: "a-pe" });
    expect(lerObjetivo([{ id: idDoObjetivo, tetoCentavos: 10_000_001 }]).tetoCentavos).toBeNull();
    expect(lerObjetivo([{ id: idDoObjetivo, tetoCentavos: 12.5 }]).tetoCentavos).toBeNull();
    expect(lerObjetivo([{ id: idDoObjetivo, tetoCentavos: "600" }]).tetoCentavos).toBeNull();
    expect(lerObjetivo([{ id: idDoObjetivo, tetoCentavos: 10_000_000 }]).tetoCentavos).toBe(
      10_000_000,
    );
  });
});

// spec 0001 CA-20
describe("lerTeto", () => {
  it.each([
    ["", null],
    ["   ", null],
    ["600", 60_000],
    ["650,50", 65_050],
    ["R$ 1.200,00", 120_000],
  ])("lê %j", (texto, esperado) => {
    expect(lerTeto(texto)).toEqual({ ok: true, valor: esperado });
  });

  it.each([["abc"], ["-10"], ["0"], ["100000,01"], ["12,345"]])("recusa %j", (texto) => {
    expect(lerTeto(texto)).toEqual({ ok: false, erro: "teto-invalido" });
  });

  it.each([
    [null, ""],
    [60_000, "600"],
    [65_050, "650,50"],
    [65_005, "650,05"],
  ])("devolve %j ao campo como %j", (centavos, texto) => {
    expect(textoDoTeto(centavos)).toBe(texto);
    if (centavos !== null) expect(lerTeto(texto)).toEqual({ ok: true, valor: centavos });
  });
});
