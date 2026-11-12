import { describe, expect, it } from "vitest";
import { armazens } from "./banco";
import {
  aplicarMigracoes,
  migracoes,
  versaoDoBanco,
  type BancoEmAtualizacao,
  type Migracao,
} from "./migracoes";

function bancoFalso() {
  const criados: { nome: string; chave: unknown }[] = [];
  const banco: BancoEmAtualizacao = {
    createObjectStore(nome, opcoes) {
      criados.push({ nome, chave: opcoes?.keyPath });
      return {} as IDBObjectStore;
    },
  };
  return { banco, criados };
}

describe("migrações do banco", () => {
  it("a versão do banco é o número de migrações", () => {
    expect(versaoDoBanco).toBe(migracoes.length);
    expect(versaoDoBanco).toBeGreaterThanOrEqual(1);
  });

  it("um aparelho sem banco recebe todos os armazéns, com o id como chave", () => {
    const { banco, criados } = bancoFalso();

    aplicarMigracoes(banco, 0, versaoDoBanco);

    expect(criados.map((criado) => criado.nome).sort()).toEqual([...armazens].sort());
    expect(criados.every((criado) => criado.chave === "id")).toBe(true);
  });

  it("não refaz nada num banco que já está na versão atual", () => {
    const { banco, criados } = bancoFalso();
    aplicarMigracoes(banco, versaoDoBanco, versaoDoBanco);
    expect(criados).toEqual([]);
  });

  it("aplica só as migrações que faltam, em ordem", () => {
    const aplicadas: number[] = [];
    const lista: Migracao[] = [0, 1, 2, 3].map((versao) => () => {
      aplicadas.push(versao);
    });
    const { banco } = bancoFalso();

    aplicarMigracoes(banco, 1, 3, lista);

    expect(aplicadas).toEqual([1, 2]);
  });

  it("para na migração que falha e deixa a exceção subir, para o IndexedDB desfazer tudo", () => {
    const aplicadas: number[] = [];
    const lista: Migracao[] = [
      () => aplicadas.push(0),
      () => {
        throw new Error("falhou");
      },
      () => aplicadas.push(2),
    ];
    const { banco } = bancoFalso();

    expect(() => aplicarMigracoes(banco, 0, 3, lista)).toThrow("falhou");
    expect(aplicadas).toEqual([0]);
  });

  it.each([
    [2, 1],
    [-1, 1],
    [0.5, 1],
    [0, Number.NaN],
  ])("recusa ir da versão %s para a %s", (de, para) => {
    const { banco } = bancoFalso();
    expect(() => aplicarMigracoes(banco, de, para)).toThrow(RangeError);
  });

  it("recusa uma versão de destino que não tem migração", () => {
    const { banco } = bancoFalso();
    expect(() => aplicarMigracoes(banco, 0, versaoDoBanco + 1)).toThrow(RangeError);
  });
});
