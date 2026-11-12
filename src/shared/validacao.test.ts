import { describe, expect, it } from "vitest";
import { ehDataIso, ehObjeto, ehUuid } from "./validacao";

describe("ehObjeto", () => {
  it("aceita objeto comum", () => {
    expect(ehObjeto({})).toBe(true);
    expect(ehObjeto({ a: 1 })).toBe(true);
  });

  it.each([null, undefined, [], "texto", 1, true])("recusa %j", (valor) => {
    expect(ehObjeto(valor)).toBe(false);
  });
});

describe("ehUuid", () => {
  it("aceita o UUID que o app gera", () => {
    expect(ehUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
  });

  it.each([
    ["maiúsculas", "11111111-1111-4111-8111-11111111111A"],
    ["sem hífen", "11111111111141118111111111111111"],
    ["versão 0", "11111111-1111-0111-8111-111111111111"],
    ["variante errada", "11111111-1111-4111-c111-111111111111"],
    ["espaço", " 11111111-1111-4111-8111-111111111111"],
    ["número", 1],
  ])("recusa %s", (_caso, valor) => {
    expect(ehUuid(valor)).toBe(false);
  });
});

describe("ehDataIso", () => {
  it("aceita a data como toISOString escreve", () => {
    expect(ehDataIso(new Date(Date.UTC(2026, 10, 12, 15)).toISOString())).toBe(true);
    expect(ehDataIso("2028-02-29T00:00:00.000Z")).toBe(true);
  });

  it.each([
    ["sem milissegundos", "2026-11-12T15:00:00Z"],
    ["com fuso", "2026-11-12T15:00:00.000-03:00"],
    ["só a data", "2026-11-12"],
    ["dia que não existe", "2026-02-30T00:00:00.000Z"],
    ["29 de fevereiro fora do bissexto", "2026-02-29T00:00:00.000Z"],
    ["mês 13", "2026-13-01T00:00:00.000Z"],
    ["texto", "ontem"],
    ["número", 1_700_000_000_000],
  ])("recusa %s", (_caso, valor) => {
    expect(ehDataIso(valor)).toBe(false);
  });
});
