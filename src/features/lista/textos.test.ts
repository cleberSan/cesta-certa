import { describe, expect, it } from "vitest";
import type { ErroDoBanco } from "../../shared/armazenamento/banco";
import { mensagemDoBanco } from "../../shared/armazenamento/textos";
import { preferencias, tiposDeErro, type Item } from "./lista";
import {
  ajudaDaPreferencia,
  campoDoErro,
  contarItens,
  detalhesDoItem,
  mensagemDoErro,
  resumoDosItens,
  rotulosDaPreferencia,
} from "./textos";

const item = (campos: Partial<Item> = {}): Item => ({
  id: "00000000-0000-4000-8000-000000000001",
  listaId: "00000000-0000-4000-8000-000000000002",
  nome: "Arroz",
  quantidade: 1,
  marca: null,
  tamanho: null,
  preferencia: "mais-barato",
  comprado: false,
  ordem: 0,
  criadoEm: "2026-11-01T10:00:00.000Z",
  ...campos,
});

describe("mensagens de erro", () => {
  it.each(tiposDeErro)("tem frase para %s, sem código nem termo técnico", (tipo) => {
    const mensagem = mensagemDoErro({ tipo });
    expect(mensagem.length).toBeGreaterThan(15);
    expect(mensagem).not.toMatch(/undefined|IndexedDB|\b(item|lista)\.[a-z]/);
    expect(mensagem.endsWith(".")).toBe(true);
  });

  it("diz qual item já existe na lista", () => {
    const erro = { tipo: "item.duplicado", existente: item({ nome: "Banana" }) } as const;
    expect(mensagemDoErro(erro)).toBe("Banana já está na lista.");
    expect(campoDoErro(erro)).toBeNull();
  });

  it.each<ErroDoBanco>(["indisponivel", "versao-mais-nova", "fechado", "sem-espaco", "falhou"])(
    "explica a falha de armazenamento %s",
    (motivo) => {
      const mensagem = mensagemDoErro({ tipo: "armazenamento", motivo });
      expect(mensagem).toBe(mensagemDoBanco(motivo));
      expect(mensagem.length).toBeGreaterThan(20);
      expect(campoDoErro({ tipo: "armazenamento", motivo })).toBeNull();
    },
  );

  it.each([
    ["item.nome-vazio", "nome"],
    ["item.nome-grande", "nome"],
    ["item.quantidade-invalida", "quantidade"],
    ["item.quantidade-acima", "quantidade"],
    ["item.marca-grande", "marca"],
    ["item.marca-obrigatoria", "marca"],
    ["item.tamanho-grande", "tamanho"],
    ["item.limite", null],
    ["lista.nome-vazio", null],
  ] as const)("o erro %s aponta para o campo %s", (tipo, campo) => {
    expect(campoDoErro({ tipo })).toBe(campo);
  });
});

describe("textos da preferência", () => {
  it.each(preferencias)("tem rótulo e explicação para %s", (preferencia) => {
    expect(rotulosDaPreferencia[preferencia].length).toBeGreaterThan(5);
    expect(ajudaDaPreferencia[preferencia].length).toBeGreaterThan(10);
  });
});

describe("detalhesDoItem", () => {
  it.each([
    [item(), "1 unidade"],
    [item({ quantidade: 3 }), "3 unidades"],
    [item({ quantidade: 2, tamanho: "5 kg" }), "2 × 5 kg"],
    [item({ marca: "Marca Exemplo" }), "1 unidade · Marca Exemplo"],
    [item({ quantidade: 3, preferencia: "marca-boa" }), "3 unidades · marca boa"],
    [
      item({
        quantidade: 2,
        tamanho: "5 kg",
        marca: "Marca Exemplo",
        preferencia: "so-esta-marca",
      }),
      "2 × 5 kg · Marca Exemplo · só esta marca",
    ],
  ])("descreve o item em uma linha", (entrada, esperado) => {
    expect(detalhesDoItem(entrada)).toBe(esperado);
  });
});

describe("contarItens", () => {
  it.each([
    [0, "0 itens"],
    [1, "1 item"],
    [2, "2 itens"],
    [200, "200 itens"],
  ])("escreve %i como %j", (quantos, esperado) => {
    expect(contarItens(quantos)).toBe(esperado);
  });
});

describe("resumoDosItens", () => {
  it.each([
    [[], "Nenhum item"],
    [[item()], "1 item, nenhum comprado"],
    [[item({ comprado: true })], "1 item, 1 comprado"],
    [[item(), item(), item({ comprado: true })], "3 itens, 1 comprado"],
    [[item({ comprado: true }), item({ comprado: true })], "2 itens, 2 comprados"],
  ])("resume a lista", (itens, esperado) => {
    expect(resumoDosItens(itens)).toBe(esperado);
  });
});
