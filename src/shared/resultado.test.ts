import { describe, expect, it } from "vitest";
import { falha, sucesso } from "./resultado";

describe("Resultado", () => {
  it("sucesso carrega o valor", () => {
    expect(sucesso(42)).toEqual({ ok: true, valor: 42 });
  });

  it("falha carrega o erro", () => {
    expect(falha("motivo")).toEqual({ ok: false, erro: "motivo" });
  });
});
