import { describe, expect, it } from "vitest";
import { linkDoLocalNoGoogleMaps } from "./links";

// spec 0001 CA-09
describe("linkDoLocalNoGoogleMaps", () => {
  it("abre a busca do Google Maps no ponto do mercado", () => {
    const link = new URL(linkDoLocalNoGoogleMaps({ lat: -23.5503, lon: -46.6339 }));
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
});
