import { describe, expect, it } from "vitest";
import { limiteDoContexto, tamanhoDaPergunta, tamanhoDoContexto } from "./assistente";

describe("contrato do assistente", () => {
  // spec 0001 CA-31
  it("conta a pergunta em caracteres que a pessoa vê, não em unidades UTF-16", () => {
    expect(tamanhoDaPergunta("feijão")).toBe(6);
    expect(tamanhoDaPergunta("🛒🛒")).toBe(2);
    expect("🛒🛒".length).toBe(4);
  });

  // spec 0001 CA-31
  it("mede o contexto em bytes do JSON em UTF-8", () => {
    expect(tamanhoDoContexto({ a: "é" })).toBe(10);
    expect(tamanhoDoContexto({ texto: "x".repeat(limiteDoContexto) })).toBeGreaterThan(
      limiteDoContexto,
    );
  });
});
