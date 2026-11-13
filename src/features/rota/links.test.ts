import { describe, expect, it } from "vitest";
import { linkDoLocalNoGoogleMaps, maximoDeParadas, montarRota } from "./links";

const a = { lat: -23.5503, lon: -46.6339 };
const b = { lat: -23.5395, lon: -46.6339 };
const c = { lat: -23.5197, lon: -46.6339 };
const d = { lat: -23.4784, lon: -46.6339 };
const e = { lat: -23.3255, lon: -46.6339 };

function rota(...argumentos: Parameters<typeof montarRota>) {
  const montada = montarRota(...argumentos);
  if (!montada.ok) throw new Error(montada.erro);
  return montada.valor;
}

// spec 0001 CA-09
describe("linkDoLocalNoGoogleMaps", () => {
  it("abre a busca do Google Maps no ponto do mercado", () => {
    const link = new URL(linkDoLocalNoGoogleMaps(a));
    expect(link.origin).toBe("https://www.google.com");
    expect(link.pathname).toBe("/maps/search/");
    expect(link.searchParams.get("api")).toBe("1");
    expect(link.searchParams.get("query")).toBe("-23.5503,-46.6339");
  });

  it("codifica a vírgula entre latitude e longitude", () => {
    expect(linkDoLocalNoGoogleMaps({ lat: 1, lon: 2 })).toBe(
      "https://www.google.com/maps/search/?api=1&query=1%2C2",
    );
  });

  it("corta em 6 casas e nunca usa notação científica", () => {
    const link = new URL(linkDoLocalNoGoogleMaps({ lat: -23.123456789, lon: 0.0000001 }));
    expect(link.searchParams.get("query")).toBe("-23.123457,0");
  });
});

// spec 0001 CA-24
describe("montarRota: um mercado", () => {
  it("abre a navegação no Google Maps até o mercado, de carro, sem a origem da pessoa", () => {
    const link = new URL(rota([a], "carro").googleMaps);
    expect(link.origin + link.pathname).toBe("https://www.google.com/maps/dir/");
    expect(Object.fromEntries(link.searchParams)).toEqual({
      api: "1",
      destination: "-23.5503,-46.6339",
      travelmode: "driving",
    });
  });

  it("usa o modo a pé quando a pessoa escolhe", () => {
    expect(new URL(rota([a], "a-pe").googleMaps).searchParams.get("travelmode")).toBe("walking");
  });

  it("abre a navegação no Waze até o mercado", () => {
    expect(rota([a], "carro").waze).toBe("https://waze.com/ul?ll=-23.5503%2C-46.6339&navigate=yes");
  });

  it("não avisa nada quando só há um mercado", () => {
    expect(rota([a], "carro")).toMatchObject({ foraDoGoogleMaps: 0, wazeSoAPrimeira: false });
  });
});

// spec 0001 CA-25
describe("montarRota: mais de um mercado", () => {
  it("leva as paradas em ordem no Google Maps, com o último mercado como destino", () => {
    const link = new URL(rota([a, b, c], "a-pe").googleMaps);
    expect(link.searchParams.get("waypoints")).toBe("-23.5503,-46.6339|-23.5395,-46.6339");
    expect(link.searchParams.get("destination")).toBe("-23.5197,-46.6339");
    expect(link.href).toContain("waypoints=-23.5503%2C-46.6339%7C-23.5395%2C-46.6339");
  });

  it("abre o Waze com o primeiro mercado e avisa que ele aceita um destino por vez", () => {
    const montada = rota([a, b], "carro");
    expect(new URL(montada.waze).searchParams.get("ll")).toBe("-23.5503,-46.6339");
    expect(montada.wazeSoAPrimeira).toBe(true);
  });

  it("aceita até 4 mercados, o limite do Google Maps no celular", () => {
    expect(maximoDeParadas).toBe(4);
    const montada = rota([a, b, c, d], "carro");
    const link = new URL(montada.googleMaps);
    expect(link.searchParams.get("waypoints")?.split("|")).toHaveLength(3);
    expect(link.searchParams.get("destination")).toBe("-23.4784,-46.6339");
    expect(montada.foraDoGoogleMaps).toBe(0);
  });

  it("deixa de fora do Google Maps o que passa do limite e diz quantos", () => {
    const montada = rota([a, b, c, d, e], "carro");
    const link = new URL(montada.googleMaps);
    expect(link.searchParams.get("destination")).toBe("-23.4784,-46.6339");
    expect(montada.foraDoGoogleMaps).toBe(1);
  });

  it("fica muito abaixo do limite de 2.048 caracteres do Google Maps", () => {
    const longe = { lat: -23.123456, lon: -46.123456 };
    expect(rota([longe, longe, longe, longe], "a-pe").googleMaps.length).toBeLessThan(400);
  });
});

describe("montarRota: entrada inválida", () => {
  it("recusa rota sem parada", () => {
    expect(montarRota([], "carro")).toEqual({ ok: false, erro: "sem-paradas" });
  });

  it.each([
    { lat: Number.NaN, lon: -46 },
    { lat: -23, lon: 200 },
  ])("recusa ponto fora do formato %j, sem montar link", (ponto) => {
    expect(montarRota([a, ponto], "carro")).toEqual({ ok: false, erro: "ponto-invalido" });
  });
});
