import { describe, expect, it } from "vitest";
import type { Importacao, Preparo } from "./importacao";
import {
  avisosDoPreparo,
  contarProdutos,
  descreverPendentes,
  mensagemDaImportacao,
  resumoDaImportacao,
  rotuloDeGuardar,
} from "./textos";

const preparo: Preparo = {
  cnpj: "11222333000181",
  vistoEm: "2026-11-07",
  nota: null,
  mercado: null,
  itens: [],
  semPreco: 0,
  jaGuardados: 0,
};

function importacao(guardados: number, ignorados: number): Importacao {
  return { alteracoes: {}, observacoes: [], associacoes: [], guardados, ignorados };
}

describe("textos da importação da nota", () => {
  it.each([
    [1, "1 produto"],
    [3, "3 produtos"],
  ])("conta %i como %s", (quantos, esperado) => {
    expect(contarProdutos(quantos)).toBe(esperado);
  });

  // spec 0001 CA-14
  it.each([
    [0, "Todos os produtos têm uma escolha."],
    [1, "Falta escolher 1 produto."],
    [4, "Faltam escolher 4 produtos."],
  ])("diz quantos produtos faltam: %i", (quantos, esperado) => {
    expect(descreverPendentes(quantos)).toBe(esperado);
  });

  it.each([
    [0, "Guardar as escolhas"],
    [1, "Guardar 1 preço"],
    [12, "Guardar 12 preços"],
  ])("o botão de guardar com %i preços diz %s", (quantos, esperado) => {
    expect(rotuloDeGuardar(quantos)).toBe(esperado);
  });

  it("avisa dos itens sem preço e da nota já importada", () => {
    expect(avisosDoPreparo(preparo)).toEqual([]);
    expect(avisosDoPreparo({ ...preparo, semPreco: 1 })).toEqual([
      "1 item sem preço na nota fica de fora.",
    ]);
    expect(avisosDoPreparo({ ...preparo, semPreco: 2, jaGuardados: 3 })).toEqual([
      "2 itens sem preço na nota ficam de fora.",
      "Esta nota já foi importada (3 preços). Guardar de novo troca os preços dela pelos desta vez, sem repetir.",
    ]);
  });

  it("resume o que foi guardado e lembrado", () => {
    expect(resumoDaImportacao(importacao(2, 0), "Mercadinho")).toBe(
      "2 preços de Mercadinho guardados. As escolhas ficam lembradas para as próximas notas desta loja.",
    );
    expect(resumoDaImportacao(importacao(1, 1), "Mercadinho")).toBe(
      "1 preço de Mercadinho guardado. 1 produto ignorado. As escolhas ficam lembradas para as próximas notas desta loja.",
    );
    expect(resumoDaImportacao(importacao(0, 3), "Mercadinho")).toBe(
      "Nenhum preço guardado de Mercadinho. 3 produtos ignorados. As escolhas ficam lembradas para as próximas notas desta loja.",
    );
  });

  it.each([
    [{ tipo: "mercado-vazio" } as const, "Escolha o mercado desta nota."],
    [{ tipo: "faltam-produtos", quantos: 2 } as const, "Faltam escolher 2 produtos."],
    [{ tipo: "limite-de-precos" } as const, "5.000 preços"],
    [{ tipo: "limite-de-escolhas" } as const, "20.000 escolhas"],
  ])("explica o erro %o", (erro, trecho) => {
    expect(mensagemDaImportacao(erro)).toContain(trecho);
  });
});
