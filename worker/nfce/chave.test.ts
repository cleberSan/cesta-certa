import { describe, expect, it } from "vitest";
import { digitoVerificador, lerChave } from "./chave";
import { chaves } from "./fixtures/chaves";

describe("digitoVerificador", () => {
  // Valores conferidos à mão. A função também foi conferida, fora do repositório, com a
  // chave de exemplo do Manual de Orientação do Contribuinte.
  it("aplica os pesos de 2 a 9 da direita para a esquerda, voltando ao 2", () => {
    // 43 dígitos 1: cinco ciclos de pesos (5 x 44) mais 2 + 3 + 4 = 229; resto 9; dígito 2.
    expect(digitoVerificador("1".repeat(43))).toBe(2);
    // Oitava posição a partir da direita tem peso 9: soma 9, dígito 2.
    expect(digitoVerificador(`${"0".repeat(35)}1${"0".repeat(7)}`)).toBe(2);
    // Nona posição volta ao peso 2: soma 2, dígito 9.
    expect(digitoVerificador(`${"0".repeat(34)}1${"0".repeat(8)}`)).toBe(9);
  });

  it("devolve 0 quando o resto da divisão por 11 é 0 ou 1", () => {
    // Soma 0 (resto 0) e soma 2 x 6 = 12 (resto 1).
    expect(digitoVerificador("0".repeat(43))).toBe(0);
    expect(digitoVerificador(`${"0".repeat(42)}6`)).toBe(0);
  });

  it("vale o código ASCII menos 48 para letra (CNPJ alfanumérico)", () => {
    // "A" vale 17 com peso 2 = 34; 34 mod 11 = 1, então o dígito é 0.
    expect(digitoVerificador(`${"0".repeat(42)}A`)).toBe(0);
    // "B" vale 18 com peso 2 = 36; 36 mod 11 = 3, então o dígito é 8.
    expect(digitoVerificador(`${"0".repeat(42)}B`)).toBe(8);
  });
});

describe("lerChave", () => {
  it("separa UF, mês, CNPJ e modelo de uma chave válida", () => {
    const resultado = lerChave(chaves.sp);
    expect(resultado).toEqual({
      ok: true,
      valor: {
        valor: chaves.sp,
        uf: "35",
        anoMes: "2026-11",
        cnpj: "11222333000181",
        modelo: "65",
      },
    });
  });

  it("aceita CNPJ alfanumérico", () => {
    const resultado = lerChave(chaves.spCnpjAlfanumerico);
    expect(resultado.ok && resultado.valor.cnpj).toBe("12ABC34501DE35");
  });

  it.each([
    ["vazia", ""],
    ["curta", chaves.sp.slice(0, 43)],
    ["longa", `${chaves.sp}0`],
    ["com espaço", `${chaves.sp.slice(0, 22)} ${chaves.sp.slice(22)}`],
    ["letra fora do CNPJ", `${chaves.sp.slice(0, 30)}A${chaves.sp.slice(31)}`],
    ["letra minúscula no CNPJ", chaves.spCnpjAlfanumerico.toLowerCase()],
    ["letra nos dígitos do CNPJ", `${chaves.sp.slice(0, 19)}X${chaves.sp.slice(20)}`],
  ])("recusa chave %s pelo formato", (_caso, texto) => {
    expect(lerChave(texto)).toEqual({ ok: false, erro: "formato" });
  });

  it.each(["00", "13", "99"])("recusa mês %s", (mes) => {
    const texto = `${chaves.sp.slice(0, 4)}${mes}${chaves.sp.slice(6)}`;
    expect(lerChave(texto)).toEqual({ ok: false, erro: "mes" });
  });

  it("recusa chave com um dígito trocado", () => {
    for (let posicao = 0; posicao < 44; posicao++) {
      const original = chaves.sp[posicao]!;
      // Posições 4 e 5 são o mês: trocar pode cair no erro de mês antes do dígito.
      if (posicao === 4 || posicao === 5) continue;
      const trocado = original === "9" ? "0" : String(Number(original) + 1);
      const texto = `${chaves.sp.slice(0, posicao)}${trocado}${chaves.sp.slice(posicao + 1)}`;
      expect(lerChave(texto), `posição ${posicao + 1}`).toEqual({ ok: false, erro: "digito" });
    }
  });
});
