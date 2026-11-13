import { describe, expect, it } from "vitest";
import type { Banco } from "../../shared/armazenamento/banco";
import { criarBancoEmMemoria } from "../../shared/armazenamento/memoria";
import { falha, sucesso } from "../../shared/resultado";
import { abrirPrecos, apagarPreco, guardarPrecos } from "./aparelho";
import type { ObservacaoDePreco } from "./precos";

const preco: ObservacaoDePreco = {
  id: "00000000-0000-4000-8000-000000000001",
  produto: "Arroz",
  marca: null,
  tamanho: null,
  descricao: null,
  precoCentavos: 100,
  minimoAtacado: null,
  mercadoId: "n1",
  mercadoNome: "Mercado",
  fonte: "digitado",
  vistoEm: "2026-11-10",
  nota: null,
  criadoEm: "2026-11-10T12:00:00.000Z",
};

describe("abrirPrecos", () => {
  it("lê os preços, a lista, os ajustes e os mercados cadastrados, deixando de fora o estragado", async () => {
    const banco = criarBancoEmMemoria({ observacoesDePreco: [preco, { id: "x" }] });

    const aberto = await abrirPrecos(undefined, async () => sucesso(banco));

    expect(aberto.ok && aberto.valor.observacoes).toEqual([preco]);
    expect(aberto.ok && aberto.valor.ajustes.ponto).toBeNull();
    expect(aberto.ok && aberto.valor.lista).toEqual({ listas: [], itens: [] });
    expect(aberto.ok && aberto.valor.proprios).toEqual([]);
    expect(aberto.ok && aberto.valor.associacoes).toEqual([]);
  });

  // spec 0001 CA-14
  it("lê as escolhas das notas, deixando de fora a fora do formato", async () => {
    const escolha = {
      id: "mercado 11222333000181",
      tipo: "mercado",
      cnpj: "11222333000181",
      mercadoId: "n1",
      mercadoNome: "Mercado",
      atualizadaEm: "2026-11-10T12:00:00.000Z",
    };
    const banco = criarBancoEmMemoria({ associacoes: [escolha, { id: "mercado x" }] });

    const aberto = await abrirPrecos(undefined, async () => sucesso(banco));

    expect(aberto.ok && aberto.valor.associacoes).toEqual([escolha]);
  });

  it("sem IndexedDB, abre em memória", async () => {
    const aberto = await abrirPrecos(undefined, async () => falha("indisponivel"));

    expect(aberto.ok && aberto.valor.banco.persistente).toBe(false);
  });

  it("não abre dados de uma versão mais nova", async () => {
    expect(await abrirPrecos(undefined, async () => falha("versao-mais-nova"))).toEqual({
      ok: false,
      erro: "versao-mais-nova",
    });
  });

  it("diz quando a leitura falha", async () => {
    const banco: Banco = { ...criarBancoEmMemoria(), lerTudo: async () => falha("falhou") };

    expect(await abrirPrecos(undefined, async () => sucesso(banco))).toEqual({
      ok: false,
      erro: "falhou",
    });
  });
});

describe("guardarPrecos e apagarPreco", () => {
  it("gravam e apagam no armazém de preços", async () => {
    const banco = criarBancoEmMemoria();

    await guardarPrecos(banco, [preco]);
    const gravado = await banco.lerTudo();
    await apagarPreco(banco, preco.id);
    const apagado = await banco.lerTudo();

    expect(gravado.ok && gravado.valor.observacoesDePreco).toEqual([preco]);
    expect(apagado.ok && apagado.valor.observacoesDePreco).toEqual([]);
  });
});
