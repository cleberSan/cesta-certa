import { describe, expect, it } from "vitest";
import { codigosDeErro, ehCodigoDeErro, ehNotaConsultada, ehProblema } from "./nfce";

const item = {
  descricao: "CAFE SOLUVEL 200G",
  codigo: "7890000000017",
  quantidade: "2",
  unidade: "UN",
  precoUnitarioCentavos: 1899,
  totalCentavos: 3798,
};

const nota = {
  uf: "SP",
  mercado: { cnpj: "11222333000181", nome: "MERCADO EXEMPLO LTDA", endereco: null },
  emitidaEm: "2026-11-07T10:15:30",
  itens: [item],
  itensNaoLidos: 0,
};

describe("ehNotaConsultada", () => {
  it("aceita a resposta no formato do contrato", () => {
    expect(ehNotaConsultada(nota)).toBe(true);
    expect(ehNotaConsultada({ ...nota, emitidaEm: null, itens: [] })).toBe(true);
  });

  it("aceita CNPJ alfanumérico", () => {
    const mercado = { ...nota.mercado, cnpj: "12ABC34501DE35" };
    expect(ehNotaConsultada({ ...nota, mercado })).toBe(true);
  });

  it.each([
    ["nulo", null],
    ["texto", "nota"],
    ["lista", [nota]],
    ["sem mercado", { ...nota, mercado: undefined }],
    ["CNPJ com pontuação", { ...nota, mercado: { ...nota.mercado, cnpj: "11.222.333/0001-81" } }],
    ["nome que não é texto", { ...nota, mercado: { ...nota.mercado, nome: 7 } }],
    ["itens que não são lista", { ...nota, itens: {} }],
    ["item sem descrição", { ...nota, itens: [{ ...item, descricao: undefined }] }],
    ["preço fracionado", { ...nota, itens: [{ ...item, precoUnitarioCentavos: 18.99 }] }],
    ["preço negativo", { ...nota, itens: [{ ...item, totalCentavos: -1 }] }],
    ["quantidade com vírgula", { ...nota, itens: [{ ...item, quantidade: "0,5" }] }],
    ["unidade longa", { ...nota, itens: [{ ...item, unidade: "UNIDADE" }] }],
    ["descrição grande demais", { ...nota, itens: [{ ...item, descricao: "A".repeat(201) }] }],
    ["itens não lidos negativo", { ...nota, itensNaoLidos: -1 }],
    ["data grande demais", { ...nota, emitidaEm: "2026-11-07T10:15:30-03:00" }],
    ["itens demais", { ...nota, itens: Array.from({ length: 1001 }, () => item) }],
  ])("recusa %s", (_caso, valor) => {
    expect(ehNotaConsultada(valor)).toBe(false);
  });
});

describe("ehProblema", () => {
  const problema = {
    type: "about:blank",
    title: "Unprocessable Content",
    status: 422,
    detail: "O endereço não é da consulta de NFC-e.",
    code: "nfce.host-nao-permitido",
    traceId: "3f0c2a52-8a4e-4a57-9d0e-1c2b3a4d5e6f",
  };

  it("aceita ProblemDetails com código conhecido", () => {
    expect(ehProblema(problema)).toBe(true);
    expect(ehProblema({ ...problema, diagnostico: { status: 200 } })).toBe(true);
  });

  it.each([
    ["código desconhecido", { ...problema, code: "outro.codigo" }],
    ["sem traceId", { ...problema, traceId: undefined }],
    ["status em texto", { ...problema, status: "422" }],
    ["detalhe enorme", { ...problema, detail: "x".repeat(501) }],
    ["HTML de erro", "<html>erro</html>"],
  ])("recusa %s", (_caso, valor) => {
    expect(ehProblema(valor)).toBe(false);
  });
});

describe("ehCodigoDeErro", () => {
  it("reconhece todos os códigos do contrato e nada além deles", () => {
    for (const codigo of codigosDeErro) expect(ehCodigoDeErro(codigo)).toBe(true);
    expect(ehCodigoDeErro("nfce.outro")).toBe(false);
    expect(ehCodigoDeErro(404)).toBe(false);
  });
});
