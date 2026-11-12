import { describe, expect, it } from "vitest";
import { criarBancoEmMemoria } from "./memoria";

const lista = { id: "l1", nome: "Novembro" };
const arroz = { id: "i1", listaId: "l1", nome: "Arroz" };
const feijao = { id: "i2", listaId: "l1", nome: "Feijão" };

describe("banco em memória", () => {
  it("começa vazio e avisa que não é persistente", async () => {
    const banco = criarBancoEmMemoria();
    expect(banco.persistente).toBe(false);
    expect(await banco.lerTudo()).toEqual({
      ok: true,
      valor: { listas: [], itens: [], ajustes: [] },
    });
  });

  it("começa com o conteúdo recebido", async () => {
    const banco = criarBancoEmMemoria({ listas: [lista], itens: [arroz] });
    expect(await banco.lerTudo()).toEqual({
      ok: true,
      valor: { listas: [lista], itens: [arroz], ajustes: [] },
    });
  });

  it("grava, regrava pelo id e apaga na mesma aplicação", async () => {
    const banco = criarBancoEmMemoria({ listas: [lista], itens: [arroz, feijao] });
    const arrozIntegral = { ...arroz, nome: "Arroz integral" };

    const resultado = await banco.aplicar({ itens: { gravar: [arrozIntegral], apagar: ["i2"] } });

    expect(resultado.ok).toBe(true);
    expect(await banco.lerTudo()).toEqual({
      ok: true,
      valor: { listas: [lista], itens: [arrozIntegral], ajustes: [] },
    });
  });

  it("aceita aplicação vazia e remoção de id que não existe", async () => {
    const banco = criarBancoEmMemoria({ listas: [lista] });
    expect((await banco.aplicar({})).ok).toBe(true);
    expect((await banco.aplicar({ itens: { apagar: ["nao-existe"] } })).ok).toBe(true);
    expect(await banco.lerTudo()).toEqual({
      ok: true,
      valor: { listas: [lista], itens: [], ajustes: [] },
    });
  });

  it("troca tudo na substituição, inclusive o que o conteúdo novo não traz, menos os ajustes", async () => {
    const ponto = { id: "ponto", lat: -23.5, lon: -46.6 };
    const banco = criarBancoEmMemoria({
      listas: [lista],
      itens: [arroz, feijao],
      ajustes: [ponto],
    });
    const outra = { id: "l2", nome: "Dezembro" };

    await banco.substituirTudo({ listas: [outra], itens: [] });

    expect(await banco.lerTudo()).toEqual({
      ok: true,
      valor: { listas: [outra], itens: [], ajustes: [ponto] },
    });
  });
});
