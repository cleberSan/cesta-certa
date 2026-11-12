import { describe, expect, it } from "vitest";
import { chaveDeComparacao, limparTexto } from "./texto";

describe("limparTexto", () => {
  it.each([
    ["  Arroz   branco  ", "Arroz branco"],
    ["Arroz\tbranco\nintegral", "Arroz branco integral"],
    ["Leite\u00a0integral", "Leite integral"],
    ["Fei\u200bjão", "Feijão"],
    ["\u202eoãjieF\u202c", "oãjieF"],
    ["\ufeffCafé", "Café"],
    ["linha\u2028outra\u2029fim", "linha outra fim"],
    ["a\u0000b", "a b"],
    ["", ""],
    [" \n\t ", ""],
  ])("limpa %j", (entrada, esperado) => {
    expect(limparTexto(entrada)).toBe(esperado);
  });

  it("junta letra e acento separados num caractere só", () => {
    const separado = "Cafe\u0301";
    expect(separado).toHaveLength(5);
    expect(limparTexto(separado)).toBe("Café");
    expect(limparTexto(separado)).toHaveLength(4);
  });

  it("mantém emoji e letras de outros alfabetos", () => {
    expect(limparTexto("Maçã 🍎 りんご")).toBe("Maçã 🍎 りんご");
  });
});

// spec 0001 CA-03
describe("chaveDeComparacao", () => {
  it.each([
    ["Banana", "bananas"],
    ["ARROZ", "arroz"],
    ["Feijão", "feijao"],
    ["Limão", "limões"],
    ["Pão", "pães"],
    ["Pão de queijo", "pães de queijo"],
    ["Ovos", "ovo"],
    ["Café  solúvel", "cafe soluvel"],
    ["Leite (integral)", "leite integral"],
    ["Água c/ gás", "agua c gas"],
    ["Papel-toalha", "papel toalha"],
    ["Sabão em pó", "SABÃO EM PÓ"],
    ["Cafe\u0301", "café"],
  ])("trata %j e %j como o mesmo nome", (um, outro) => {
    expect(chaveDeComparacao(um)).toBe(chaveDeComparacao(outro));
  });

  it.each([
    ["Arroz", "Arroz integral"],
    ["Leite", "Leite condensado"],
    ["Pão", "Pá"],
    ["Coco", "Cocô de gato (areia)"],
    ["Papel", "Papéis"],
  ])("não confunde %j com %j", (um, outro) => {
    expect(chaveDeComparacao(um)).not.toBe(chaveDeComparacao(outro));
  });

  it("não mexe em palavras curtas", () => {
    expect(chaveDeComparacao("os")).toBe("os");
    expect(chaveDeComparacao("7 UP")).toBe("7 up");
  });

  it("devolve vazio para texto sem letra nem número", () => {
    expect(chaveDeComparacao(" -- ")).toBe("");
  });
});
