import { describe, expect, it } from "vitest";
import type { Banco, ErroDoBanco } from "../../shared/armazenamento/banco";
import { criarBancoEmMemoria } from "../../shared/armazenamento/memoria";
import { falha } from "../../shared/resultado";
import {
  adicionarItem,
  criarLista,
  itensDaLista,
  type Contexto,
  type EntradaDoItem,
  type Item,
  type Lista,
} from "./lista";
import { abrirSessao } from "./sessao";

const id = (numero: number) => `00000000-0000-4000-8000-${numero.toString(16).padStart(12, "0")}`;

function relogio(): () => Contexto {
  let proximo = 1000;
  return () => ({
    agora: new Date("2026-11-10T12:00:00.000Z"),
    gerarId: () => id(proximo++),
    fuso: "America/Sao_Paulo",
  });
}

const novembro: Lista = {
  id: id(1),
  nome: "Novembro de 2026",
  criadaEm: "2026-11-01T10:00:00.000Z",
  atualizadaEm: "2026-11-01T10:00:00.000Z",
};

const arroz: Item = {
  id: id(10),
  listaId: id(1),
  nome: "Arroz",
  quantidade: 1,
  marca: null,
  tamanho: null,
  preferencia: "mais-barato",
  comprado: false,
  ordem: 0,
  criadoEm: "2026-11-01T10:00:00.000Z",
};

const entrada = (nome: string): EntradaDoItem => ({
  nome,
  quantidade: "1",
  marca: "",
  tamanho: "",
  preferencia: "mais-barato",
});

/** Banco em memória que pode falhar ou demorar na próxima gravação. */
function bancoControlado(inicial: Parameters<typeof criarBancoEmMemoria>[0] = {}) {
  const real = criarBancoEmMemoria(inicial);
  const controle = {
    falharCom: null as ErroDoBanco | null,
    esperar: null as Promise<void> | null,
    gravacoes: 0,
  };
  const banco: Banco = {
    persistente: true,
    lerTudo: () => real.lerTudo(),
    substituirTudo: (registros) => real.substituirTudo(registros),
    async aplicar(alteracoes) {
      controle.gravacoes += 1;
      if (controle.esperar !== null) await controle.esperar;
      if (controle.falharCom !== null) return falha(controle.falharCom);
      return real.aplicar(alteracoes);
    },
  };
  return { banco, controle, real };
}

async function abrir(banco: Banco) {
  const aberta = await abrirSessao(banco, relogio());
  if (!aberta.ok) throw new Error(`Não abriu: ${aberta.erro}`);
  return aberta.valor;
}

describe("abrirSessao", () => {
  it("no primeiro uso cria e guarda a lista do mês atual", async () => {
    const { banco, real } = bancoControlado();

    const sessao = await abrir(banco);

    expect(sessao.estado().listas).toEqual([
      {
        id: id(1000),
        nome: "Novembro de 2026",
        criadaEm: "2026-11-10T12:00:00.000Z",
        atualizadaEm: "2026-11-10T12:00:00.000Z",
      },
    ]);
    expect(await real.lerTudo()).toEqual({
      ok: true,
      valor: {
        listas: sessao.estado().listas,
        itens: [],
        ajustes: [],
        mercadosProprios: [],
        observacoesDePreco: [],
        associacoes: [],
      },
    });
  });

  // spec 0001 CA-01
  it("reabre com o que estava guardado, sem criar lista nova", async () => {
    const { banco, controle } = bancoControlado({ listas: [novembro], itens: [arroz] });

    const sessao = await abrir(banco);

    expect(sessao.estado()).toEqual({ listas: [novembro], itens: [arroz] });
    expect(sessao.recusados).toBe(0);
    expect(controle.gravacoes).toBe(0);
  });

  // spec 0001 CA-01
  it("o item adicionado continua lá quando o app é fechado e aberto de novo", async () => {
    const { banco } = bancoControlado();
    const primeira = await abrir(banco);
    const listaId = primeira.estado().listas[0]!.id;
    await primeira.executar((estado, contexto) =>
      adicionarItem(estado, listaId, entrada("Feijão"), contexto),
    );

    const segunda = await abrir(banco);

    expect(itensDaLista(segunda.estado(), listaId).map((item) => item.nome)).toEqual(["Feijão"]);
  });

  it("deixa de fora o registro guardado fora do formato e informa quantos foram", async () => {
    const { banco } = bancoControlado({
      listas: [novembro],
      itens: [arroz, { id: "quebrado" }, { ...arroz, id: id(11), listaId: id(2) }],
    });

    const sessao = await abrir(banco);

    expect(sessao.estado().itens).toEqual([arroz]);
    expect(sessao.recusados).toBe(2);
  });

  it("repassa se o banco guarda de verdade ou só em memória", async () => {
    expect((await abrir(criarBancoEmMemoria())).persistente).toBe(false);
    expect((await abrir(bancoControlado().banco)).persistente).toBe(true);
  });

  it.each<ErroDoBanco>(["versao-mais-nova", "fechado", "falhou"])(
    "não abre quando a leitura falha com %s",
    async (motivo) => {
      const banco: Banco = { ...criarBancoEmMemoria(), lerTudo: async () => falha(motivo) };
      expect(await abrirSessao(banco, relogio())).toEqual({ ok: false, erro: motivo });
    },
  );

  it("não abre quando a primeira lista não pôde ser guardada", async () => {
    const { banco, controle } = bancoControlado();
    controle.falharCom = "sem-espaco";

    expect(await abrirSessao(banco, relogio())).toEqual({ ok: false, erro: "sem-espaco" });
  });
});

describe("executar", () => {
  it("grava, troca o estado e avisa quem assinou", async () => {
    const { banco, real } = bancoControlado({ listas: [novembro] });
    const sessao = await abrir(banco);
    const antes = sessao.estado();
    let avisos = 0;
    sessao.assinar(() => {
      avisos += 1;
    });

    const resultado = await sessao.executar((estado, contexto) =>
      adicionarItem(estado, id(1), entrada("Feijão"), contexto),
    );

    expect(resultado.ok && resultado.valor.item.nome).toBe("Feijão");
    expect(sessao.estado()).not.toBe(antes);
    expect(sessao.estado().itens.map((item) => item.nome)).toEqual(["Feijão"]);
    expect(avisos).toBe(1);
    const guardado = await real.lerTudo();
    expect(guardado.ok && guardado.valor.itens).toEqual(sessao.estado().itens);
  });

  it("recusa da regra não grava, não troca o estado e não avisa", async () => {
    const { banco, controle } = bancoControlado({ listas: [novembro], itens: [arroz] });
    const sessao = await abrir(banco);
    const antes = sessao.estado();
    let avisos = 0;
    sessao.assinar(() => {
      avisos += 1;
    });

    const resultado = await sessao.executar((estado, contexto) =>
      adicionarItem(estado, id(1), entrada("arroz"), contexto),
    );

    expect(resultado).toEqual({ ok: false, erro: { tipo: "item.duplicado", existente: arroz } });
    expect(sessao.estado()).toBe(antes);
    expect(controle.gravacoes).toBe(0);
    expect(avisos).toBe(0);
  });

  it("quando o aparelho não guarda, o estado fica como estava e o motivo volta", async () => {
    const { banco, controle } = bancoControlado({ listas: [novembro] });
    const sessao = await abrir(banco);
    const antes = sessao.estado();
    controle.falharCom = "sem-espaco";

    const resultado = await sessao.executar((estado, contexto) =>
      adicionarItem(estado, id(1), entrada("Feijão"), contexto),
    );

    expect(resultado).toEqual({
      ok: false,
      erro: { tipo: "armazenamento", motivo: "sem-espaco" },
    });
    expect(sessao.estado()).toBe(antes);
  });

  it("roda uma operação de cada vez, cada uma sobre o estado que a anterior deixou", async () => {
    const { banco, controle } = bancoControlado({ listas: [novembro] });
    const sessao = await abrir(banco);
    let liberar = () => {};
    controle.esperar = new Promise<void>((resolver) => {
      liberar = resolver;
    });

    // Três toques seguidos, antes de a primeira gravação terminar.
    const pedidos = ["Arroz", "Feijão", "Sal"].map((nome) =>
      sessao.executar((estado, contexto) => adicionarItem(estado, id(1), entrada(nome), contexto)),
    );
    expect(sessao.estado().itens).toEqual([]);
    liberar();
    const resultados = await Promise.all(pedidos);

    expect(resultados.every((resultado) => resultado.ok)).toBe(true);
    const itens = itensDaLista(sessao.estado(), id(1));
    expect(itens.map((item) => item.nome)).toEqual(["Arroz", "Feijão", "Sal"]);
    expect(itens.map((item) => item.ordem)).toEqual([0, 1, 2]);
  });

  it("dois toques seguidos no mesmo nome: o segundo recebe o aviso de repetido", async () => {
    const { banco } = bancoControlado({ listas: [novembro] });
    const sessao = await abrir(banco);

    const [primeiro, segundo] = await Promise.all(
      ["Arroz", "arroz"].map((nome) =>
        sessao.executar((estado, contexto) =>
          adicionarItem(estado, id(1), entrada(nome), contexto),
        ),
      ),
    );

    expect(primeiro?.ok).toBe(true);
    expect(!segundo?.ok && segundo?.erro.tipo).toBe("item.duplicado");
    expect(sessao.estado().itens).toHaveLength(1);
  });

  it("uma operação que estoura exceção não trava as seguintes", async () => {
    const { banco } = bancoControlado({ listas: [novembro] });
    const sessao = await abrir(banco);

    const quebrada = sessao.executar(() => {
      throw new Error("erro de programação");
    });
    const seguinte = sessao.executar((estado, contexto) => criarLista(estado, "Outra", contexto));

    await expect(quebrada).rejects.toThrow("erro de programação");
    expect((await seguinte).ok).toBe(true);
    expect(sessao.estado().listas).toHaveLength(2);
  });

  it("para de avisar quem cancelou a assinatura", async () => {
    const { banco } = bancoControlado({ listas: [novembro] });
    const sessao = await abrir(banco);
    let avisos = 0;
    const cancelar = sessao.assinar(() => {
      avisos += 1;
    });

    await sessao.executar((estado, contexto) => criarLista(estado, "Uma", contexto));
    cancelar();
    await sessao.executar((estado, contexto) => criarLista(estado, "Duas", contexto));

    expect(avisos).toBe(1);
  });
});
