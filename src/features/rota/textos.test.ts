import { describe, expect, it } from "vitest";
import { avisosDaRota, descreverModo } from "./textos";

describe("descreverModo", () => {
  it("nomeia os dois modos", () => {
    expect(descreverModo("carro")).toBe("De carro");
    expect(descreverModo("a-pe")).toBe("A pé");
  });
});

// spec 0001 CA-24 e CA-25
describe("avisosDaRota", () => {
  const simples = { foraDoGoogleMaps: 0, wazeSoAPrimeira: false };

  it("não avisa nada para um mercado de carro", () => {
    expect(avisosDaRota(simples, "Mercado A", "carro")).toEqual([]);
  });

  it("avisa que o Waze vai só ao primeiro mercado", () => {
    expect(avisosDaRota({ ...simples, wazeSoAPrimeira: true }, "Mercado A", "carro")).toEqual([
      "O Waze aceita um destino por vez: ele abre com o primeiro mercado, Mercado A.",
    ]);
  });

  it("avisa que o Waze é de carro quando a pessoa vai a pé", () => {
    expect(avisosDaRota(simples, "Mercado A", "a-pe")).toEqual(["O Waze calcula a rota de carro."]);
  });

  it.each([
    [1, "O Google Maps no celular aceita até 4 paradas: o último mercado ficou de fora."],
    [2, "O Google Maps no celular aceita até 4 paradas: os 2 últimos mercados ficaram de fora."],
  ])("diz quantos mercados ficaram fora do Google Maps (%i)", (fora, aviso) => {
    expect(avisosDaRota({ ...simples, foraDoGoogleMaps: fora }, "Mercado A", "carro")).toEqual([
      aviso,
    ]);
  });
});
