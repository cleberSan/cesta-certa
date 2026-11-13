import { describe, expect, it } from "vitest";
import {
  conferirAssociacoes,
  ehCnpj,
  idDoMercado,
  idDoProduto,
  lerAssociacao,
  limitesDaAssociacao,
  mercadoLembrado,
  type AssociacaoDeMercado,
  type AssociacaoDeProduto,
} from "./associacoes";

const cnpj = "11222333000181";
const atualizadaEm = "2026-11-10T12:00:00.000Z";

const doMercado: AssociacaoDeMercado = {
  id: "mercado 11222333000181",
  tipo: "mercado",
  cnpj,
  mercadoId: "n123",
  mercadoNome: "Mercadinho da Praça",
  atualizadaEm,
};

const doProduto: AssociacaoDeProduto = {
  id: "produto 11222333000181 7890000000017",
  tipo: "produto",
  cnpj,
  codigo: "7890000000017",
  descricao: "CAFE SOLUVEL 200G",
  produto: "Café",
  atualizadaEm,
};

describe("ehCnpj", () => {
  it.each([
    [cnpj, true],
    ["12ABC34501DE35", true],
    ["1122233300018", false],
    ["112223330001810", false],
    ["11.222.333/0001-81", false],
    ["12abc34501de35", false],
    [11222333000181, false],
    [null, false],
  ])("%s → %s", (valor, esperado) => {
    expect(ehCnpj(valor)).toBe(esperado);
  });
});

describe("ids das associações", () => {
  it("o do mercado é a loja; o do produto, a loja e o código", () => {
    expect(idDoMercado(cnpj)).toBe(doMercado.id);
    expect(idDoProduto(cnpj, "7890000000017")).toBe(doProduto.id);
  });
});

// spec 0001 CA-14
describe("lerAssociacao", () => {
  it("lê a escolha do mercado e a do produto", () => {
    expect(lerAssociacao(doMercado)).toEqual(doMercado);
    expect(lerAssociacao(doProduto)).toEqual(doProduto);
  });

  it("lê o produto ignorado, com o nome nulo", () => {
    const ignorado = { ...doProduto, produto: null };

    expect(lerAssociacao(ignorado)).toEqual(ignorado);
  });

  it("devolve só os campos conhecidos", () => {
    expect(lerAssociacao({ ...doMercado, extra: "x" })).toEqual(doMercado);
  });

  it.each([
    ["nulo", null],
    ["texto", "mercado"],
    ["sem tipo", { ...doMercado, tipo: undefined }],
    ["tipo desconhecido", { ...doMercado, tipo: "loja" }],
    ["CNPJ formatado", { ...doMercado, cnpj: "11.222.333/0001-81" }],
    ["data inválida", { ...doMercado, atualizadaEm: "ontem" }],
    ["id do mercado de outra loja", { ...doMercado, id: idDoMercado("99888777000166") }],
    ["mercado com id inválido", { ...doMercado, mercadoId: "x1" }],
    ["mercado sem nome", { ...doMercado, mercadoNome: "" }],
    ["nome do mercado com espaço sobrando", { ...doMercado, mercadoNome: " Mercado" }],
    ["nome do mercado longo", { ...doMercado, mercadoNome: "a".repeat(201) }],
    ["produto sem código", { ...doProduto, codigo: "" }],
    [
      "código longo",
      {
        ...doProduto,
        codigo: "1".repeat(limitesDaAssociacao.codigo + 1),
        id: idDoProduto(cnpj, "1".repeat(limitesDaAssociacao.codigo + 1)),
      },
    ],
    ["id do produto que não bate", { ...doProduto, id: idDoProduto(cnpj, "outro") }],
    ["descrição vazia", { ...doProduto, descricao: "" }],
    ["descrição longa", { ...doProduto, descricao: "a".repeat(201) }],
    ["nome do produto vazio", { ...doProduto, produto: "" }],
    ["nome do produto que não é texto", { ...doProduto, produto: 7 }],
  ])("recusa %s", (_caso, valor) => {
    expect(lerAssociacao(valor)).toBeNull();
  });
});

// spec 0001 CA-14 e CA-04
describe("conferirAssociacoes", () => {
  it("fica com as boas e conta as fora do formato e as repetidas", () => {
    const conferidas = conferirAssociacoes([doMercado, { id: "x" }, doProduto, doMercado]);

    expect(conferidas).toEqual({ associacoes: [doMercado, doProduto], recusados: 2 });
  });

  it("para no limite e conta o que passou dele", () => {
    const muitas = Array.from({ length: limitesDaAssociacao.associacoes + 1 }, (_, indice) => {
      const codigo = String(indice);
      return { ...doProduto, codigo, id: idDoProduto(cnpj, codigo) };
    });

    const conferidas = conferirAssociacoes(muitas);

    expect(conferidas.associacoes).toHaveLength(limitesDaAssociacao.associacoes);
    expect(conferidas.recusados).toBe(1);
  });
});

// spec 0001 CA-14
describe("mercadoLembrado", () => {
  it("devolve o mercado ligado à loja da nota", () => {
    expect(mercadoLembrado([doProduto, doMercado], cnpj)).toEqual({
      id: "n123",
      nome: "Mercadinho da Praça",
    });
  });

  it("devolve nulo para uma loja nova", () => {
    expect(mercadoLembrado([doMercado, doProduto], "99888777000166")).toBeNull();
    expect(mercadoLembrado([], cnpj)).toBeNull();
  });
});
