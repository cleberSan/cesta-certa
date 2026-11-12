import { describe, expect, it } from "vitest";
import type { ErroDoBanco } from "../../shared/armazenamento/banco";
import { criarBancoEmMemoria } from "../../shared/armazenamento/memoria";
import { falha, sucesso } from "../../shared/resultado";
import { abrirDados } from "./abertura";

const fabrica = {} as IDBFactory;
const lista = {
  id: "00000000-0000-4000-8000-000000000001",
  nome: "Novembro de 2026",
  criadaEm: "2026-11-01T10:00:00.000Z",
  atualizadaEm: "2026-11-01T10:00:00.000Z",
};

describe("abrirDados", () => {
  it("abre o banco do aparelho com a fábrica recebida e lê o que está guardado", async () => {
    const recebidas: unknown[] = [];
    const banco = criarBancoEmMemoria({ listas: [lista], itens: [] });

    const aberto = await abrirDados(fabrica, async (recebida) => {
      recebidas.push(recebida);
      return sucesso(banco);
    });

    expect(recebidas).toEqual([fabrica]);
    expect(aberto.ok && aberto.valor.banco).toBe(banco);
    expect(aberto.ok && aberto.valor.aparelho.resumo).toEqual({ listas: 1, itens: 0, mercados: 0 });
  });

  it("não cria lista nenhuma só por abrir a tela", async () => {
    const banco = criarBancoEmMemoria();

    const aberto = await abrirDados(fabrica, async () => sucesso(banco));

    expect(aberto.ok && aberto.valor.aparelho.resumo).toEqual({ listas: 0, itens: 0, mercados: 0 });
    expect(await banco.lerTudo()).toEqual({
      ok: true,
      valor: { listas: [], itens: [], ajustes: [], mercadosProprios: [] },
    });
  });

  it.each<ErroDoBanco>(["indisponivel", "versao-mais-nova", "fechado", "falhou"])(
    "repassa a falha %s sem abrir uma reserva em memória",
    async (motivo) => {
      expect(await abrirDados(fabrica, async () => falha(motivo))).toEqual({
        ok: false,
        erro: motivo,
      });
    },
  );

  it("repassa a falha de leitura do aparelho", async () => {
    const banco = { ...criarBancoEmMemoria(), lerTudo: async () => falha("falhou" as const) };

    expect(await abrirDados(fabrica, async () => sucesso(banco))).toEqual({
      ok: false,
      erro: "falhou",
    });
  });
});
