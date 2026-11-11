import { describe, expect, it } from "vitest";
import type { ErroDoBanco } from "../../shared/armazenamento/banco";
import { criarBancoEmMemoria } from "../../shared/armazenamento/memoria";
import { falha, sucesso } from "../../shared/resultado";
import { abrirLista } from "./abertura";

const fabrica = {} as IDBFactory;

describe("abrirLista", () => {
  it("abre o banco do aparelho com a fábrica recebida", async () => {
    const recebidas: unknown[] = [];
    const banco = { ...criarBancoEmMemoria(), persistente: true };

    const sessao = await abrirLista(fabrica, async (recebida) => {
      recebidas.push(recebida);
      return sucesso(banco);
    });

    expect(recebidas).toEqual([fabrica]);
    expect(sessao.ok && sessao.valor.persistente).toBe(true);
    expect(sessao.ok && sessao.valor.estado().listas).toHaveLength(1);
  });

  it("gera identificadores e datas do aparelho quando ninguém informa o contexto", async () => {
    const antes = Date.now();

    const sessao = await abrirLista(undefined, async () => falha("indisponivel"));

    const lista = sessao.ok ? sessao.valor.estado().listas[0] : undefined;
    expect(lista?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(Date.parse(lista?.criadaEm ?? "")).toBeGreaterThanOrEqual(antes);
  });

  it("sem armazenamento no navegador, abre a lista em memória", async () => {
    const sessao = await abrirLista(undefined, async () => falha("indisponivel"));

    expect(sessao.ok && sessao.valor.persistente).toBe(false);
    expect(sessao.ok && sessao.valor.estado().listas).toHaveLength(1);
  });

  it.each<ErroDoBanco>(["versao-mais-nova", "fechado", "sem-espaco", "falhou"])(
    "não troca os dados do aparelho por uma lista em memória quando a falha é %s",
    async (motivo) => {
      const sessao = await abrirLista(fabrica, async () => falha(motivo));
      expect(sessao).toEqual({ ok: false, erro: motivo });
    },
  );
});
