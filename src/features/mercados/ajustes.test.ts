import { describe, expect, it } from "vitest";
import { ehRaio, lerAjustes, raioPadrao, raios, registroDoPonto, registroDoRaio } from "./ajustes";

const ponto = { lat: -23.5505, lon: -46.6333, origem: "localizacao" as const, rotulo: null };

// spec 0001 CA-05, CA-07
describe("lerAjustes", () => {
  it("sem nada guardado, não há ponto e o raio é o padrão de 5 km", () => {
    expect(lerAjustes([])).toEqual({ ponto: null, raioKm: 5 });
    expect(raioPadrao).toBe(5);
  });

  it("lê o ponto e o raio guardados", () => {
    const cidade = {
      lat: -22.9,
      lon: -47.06,
      origem: "cidade" as const,
      rotulo: "Cidade Exemplo, SP",
    };

    expect(lerAjustes([registroDoPonto(cidade), registroDoRaio(20)])).toEqual({
      ponto: cidade,
      raioKm: 20,
    });
  });

  it("deixa de fora campo que não conhece e limpa o rótulo", () => {
    const guardado = { ...registroDoPonto(ponto), rotulo: "  Cidade​ Exemplo ", extra: 1 };

    expect(lerAjustes([guardado]).ponto).toEqual({ ...ponto, rotulo: "Cidade Exemplo" });
  });

  it.each([
    ["sem latitude", { id: "ponto", lon: -46, origem: "cidade", rotulo: null }],
    ["latitude impossível", { id: "ponto", lat: 95, lon: -46, origem: "cidade", rotulo: null }],
    ["origem desconhecida", { ...registroDoPonto(ponto), origem: "ip" }],
    ["rótulo que não é texto", { ...registroDoPonto(ponto), rotulo: 3 }],
  ])("trata como sem ponto o registro %s", (_caso, registro) => {
    expect(lerAjustes([registro]).ponto).toBeNull();
  });

  it("trata rótulo vazio como sem rótulo", () => {
    expect(lerAjustes([{ ...registroDoPonto(ponto), rotulo: "  " }]).ponto?.rotulo).toBeNull();
  });

  it.each([0, 4, 31, "5", null])("usa o raio padrão quando o guardado é %j", (km) => {
    expect(lerAjustes([{ id: "raio", km }]).raioKm).toBe(5);
  });

  it("ignora registros que não são objeto ou de outro ajuste", () => {
    expect(lerAjustes([null, 3, "ponto", { id: "tema", valor: "escuro" }])).toEqual({
      ponto: null,
      raioKm: 5,
    });
  });
});

describe("raios", () => {
  it("vão de 1 a 30 km, em ordem", () => {
    expect(raios[0]).toBe(1);
    expect(raios.at(-1)).toBe(30);
    expect([...raios].sort((a, b) => a - b)).toEqual([...raios]);
  });

  it("ehRaio aceita só os da lista", () => {
    expect(ehRaio(10)).toBe(true);
    expect(ehRaio(7)).toBe(false);
    expect(ehRaio("10")).toBe(false);
  });
});
