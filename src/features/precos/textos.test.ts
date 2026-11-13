import { describe, expect, it } from "vitest";
import type { ErroDoPreco, ObservacaoDePreco } from "./precos";
import {
  avisoDeAntigo,
  avisoDoPreco,
  contarPrecos,
  descreverAtacado,
  descreverEmbalagem,
  descreverFonte,
  formatarDia,
  mensagemDoPreco,
} from "./textos";

// spec 0001 CA-16
describe("descreverFonte", () => {
  it.each([
    [{ fonte: "nota", vistoEm: "2026-11-07" }, "Nota fiscal de 07/11/2026"],
    [{ fonte: "digitado", vistoEm: "2026-01-31" }, "Digitado em 31/01/2026"],
  ] as const)("descreve %j como %j", (observacao, esperado) => {
    expect(descreverFonte(observacao)).toBe(esperado);
  });

  it("formata o dia sem fuso", () => {
    expect(formatarDia("2026-12-31")).toBe("31/12/2026");
  });

  it("diz o que é antigo", () => {
    expect(avisoDeAntigo).toBe("Antigo: visto há mais de 30 dias");
  });
});

describe("descreverEmbalagem", () => {
  it.each([
    [{ marca: "Marca", tamanho: "5 kg" }, "Marca, 5 kg"],
    [{ marca: "Marca", tamanho: null }, "Marca"],
    [{ marca: null, tamanho: "1 L" }, "1 L"],
    [{ marca: null, tamanho: null }, null],
  ])("descreve %j como %j", (observacao, esperado) => {
    expect(descreverEmbalagem(observacao)).toBe(esperado);
  });
});

// spec 0001 CA-18
describe("descreverAtacado", () => {
  it("diz a partir de quantas unidades", () => {
    expect(descreverAtacado(3)).toBe("Preço de atacado: a partir de 3 unidades");
  });
});

describe("contarPrecos e avisoDoPreco", () => {
  it("contam no singular e no plural", () => {
    expect(contarPrecos(1)).toBe("1 preço");
    expect(contarPrecos(12)).toBe("12 preços");
  });

  it("anuncia o preço guardado", () => {
    const observacao = {
      produto: "Arroz",
      precoCentavos: 2590,
      mercadoNome: "Mercado Exemplo",
    } as ObservacaoDePreco;

    expect(avisoDoPreco(observacao)).toBe("Preço guardado: Arroz, R$ 25,90, em Mercado Exemplo.");
  });
});

// spec 0001 CA-15
describe("mensagemDoPreco", () => {
  const erros: ErroDoPreco[] = [
    { tipo: "produto-vazio" },
    { tipo: "produto-longo" },
    { tipo: "marca-longa" },
    { tipo: "tamanho-longo" },
    { tipo: "preco-invalido" },
    { tipo: "mercado-vazio" },
    { tipo: "atacado-invalido" },
    { tipo: "limite" },
  ];

  it("tem uma frase diferente para cada motivo", () => {
    expect(new Set(erros.map(mensagemDoPreco)).size).toBe(erros.length);
  });

  it("diz os limites", () => {
    expect(mensagemDoPreco({ tipo: "produto-longo" })).toContain("60 caracteres");
    expect(mensagemDoPreco({ tipo: "atacado-invalido" })).toContain("de 2 a 999");
    expect(mensagemDoPreco({ tipo: "limite" })).toContain("5000 preços");
  });
});
