import { describe, expect, it } from "vitest";
import { chaveDoItem } from "../lista/lista";
import {
  conferirObservacoes,
  diaDe,
  diasEntre,
  ehAntigo,
  ehDia,
  ehIdDeMercado,
  excluirPreco,
  gravarPrecos,
  lerObservacao,
  limitesDoPreco,
  precosPorProduto,
  registrarPrecoDigitado,
  type EntradaDoPreco,
  type ObservacaoDePreco,
} from "./precos";

const id = (numero: number) => `00000000-0000-4000-8000-${numero.toString(16).padStart(12, "0")}`;
const fuso = "America/Sao_Paulo";
// 12/11/2026 às 23:30 em Brasília, já 13/11 em UTC.
const agora = new Date("2026-11-13T02:30:00.000Z");
const contexto = { agora, gerarId: () => id(1), fuso };

const entrada: EntradaDoPreco = {
  produto: "  Arroz ",
  marca: "Marca Exemplo",
  tamanho: "5 kg",
  preco: "25,90",
  mercado: { id: "n123", nome: "Mercado Exemplo" },
  minimoAtacado: "",
};

const observacao: ObservacaoDePreco = {
  id: id(1),
  produto: "Arroz",
  marca: "Marca Exemplo",
  tamanho: "5 kg",
  descricao: null,
  precoCentavos: 2590,
  minimoAtacado: null,
  mercadoId: "n123",
  mercadoNome: "Mercado Exemplo",
  fonte: "digitado",
  vistoEm: "2026-11-12",
  nota: null,
  criadoEm: "2026-11-13T02:30:00.000Z",
};

// spec 0001 CA-15
describe("registrarPrecoDigitado", () => {
  it("monta o preço com produto, marca, tamanho, mercado, fonte digitado e o dia do aparelho", () => {
    expect(registrarPrecoDigitado(0, entrada, contexto)).toEqual({ ok: true, valor: observacao });
  });

  it("guarda o mínimo do atacado quando há", () => {
    const registrado = registrarPrecoDigitado(0, { ...entrada, minimoAtacado: " 3 " }, contexto);

    expect(registrado.ok && registrado.valor.minimoAtacado).toBe(3);
  });

  it("aceita marca e tamanho vazios, que ficam nulos", () => {
    const registrado = registrarPrecoDigitado(
      0,
      { ...entrada, marca: "  ", tamanho: "" },
      contexto,
    );

    expect(registrado.ok && [registrado.valor.marca, registrado.valor.tamanho]).toEqual([
      null,
      null,
    ]);
  });

  it("limpa o nome do mercado e corta no limite", () => {
    const longo = `${"M".repeat(limitesDoPreco.mercado)}XYZ`;
    const registrado = registrarPrecoDigitado(
      0,
      { ...entrada, mercado: { id: id(9), nome: ` ${longo} ` } },
      contexto,
    );

    expect(registrado.ok && registrado.valor.mercadoNome).toBe("M".repeat(limitesDoPreco.mercado));
    expect(registrado.ok && registrado.valor.mercadoId).toBe(id(9));
  });

  it("usa o dia do aparelho sem fuso informado", () => {
    const registrado = registrarPrecoDigitado(0, entrada, { agora, gerarId: contexto.gerarId });

    expect(registrado.ok && registrado.valor.vistoEm).toBe(diaDe(agora));
  });

  it.each<[string, Partial<EntradaDoPreco>, string]>([
    ["produto vazio", { produto: "   " }, "produto-vazio"],
    ["produto longo", { produto: "a".repeat(limitesDoPreco.produto + 1) }, "produto-longo"],
    ["marca longa", { marca: "a".repeat(limitesDoPreco.marca + 1) }, "marca-longa"],
    ["tamanho longo", { tamanho: "a".repeat(limitesDoPreco.tamanho + 1) }, "tamanho-longo"],
    ["preço vazio", { preco: "" }, "preco-invalido"],
    ["preço zero", { preco: "0,00" }, "preco-invalido"],
    ["preço com texto", { preco: "barato" }, "preco-invalido"],
    ["sem mercado", { mercado: null }, "mercado-vazio"],
    ["mercado sem nome", { mercado: { id: "n1", nome: " " } }, "mercado-vazio"],
    ["mercado com id estranho", { mercado: { id: "javascript:1", nome: "X" } }, "mercado-vazio"],
    ["atacado de 1 unidade", { minimoAtacado: "1" }, "atacado-invalido"],
    ["atacado acima de 999", { minimoAtacado: "1000" }, "atacado-invalido"],
    ["atacado fracionado", { minimoAtacado: "2,5" }, "atacado-invalido"],
    ["atacado negativo", { minimoAtacado: "-3" }, "atacado-invalido"],
  ])("recusa %s", (_caso, campos, tipo) => {
    expect(registrarPrecoDigitado(0, { ...entrada, ...campos }, contexto)).toEqual({
      ok: false,
      erro: { tipo },
    });
  });

  it.each([
    ["no limite de produto", { produto: "a".repeat(limitesDoPreco.produto) }],
    ["atacado de 2", { minimoAtacado: "2" }],
    ["atacado de 999", { minimoAtacado: "999" }],
  ])("aceita %s", (_caso, campos) => {
    expect(registrarPrecoDigitado(0, { ...entrada, ...campos }, contexto).ok).toBe(true);
  });

  it("recusa quando o aparelho já tem o máximo de preços", () => {
    expect(registrarPrecoDigitado(limitesDoPreco.precos, entrada, contexto)).toEqual({
      ok: false,
      erro: { tipo: "limite" },
    });
    expect(registrarPrecoDigitado(limitesDoPreco.precos - 1, entrada, contexto).ok).toBe(true);
  });
});

// spec 0001 CA-16
describe("ehAntigo", () => {
  it.each([
    ["2026-11-13", "2026-11-13", false],
    ["2026-10-14", "2026-11-13", false],
    ["2026-10-13", "2026-11-13", true],
    ["2025-11-13", "2026-11-13", true],
    ["2026-11-20", "2026-11-13", false],
  ])("visto em %s, hoje %s: antigo %s", (vistoEm, hoje, antigo) => {
    expect(ehAntigo(vistoEm, hoje)).toBe(antigo);
  });

  it("conta os dias pelo calendário, mesmo na troca de horário de verão", () => {
    expect(diasEntre("2026-02-28", "2026-03-01")).toBe(1);
    expect(diasEntre("2024-02-28", "2024-03-01")).toBe(2);
    expect(diasEntre("2026-11-13", "2026-11-01")).toBe(-12);
  });
});

describe("diaDe", () => {
  it("dá o dia no fuso informado", () => {
    expect(diaDe(agora, fuso)).toBe("2026-11-12");
    expect(diaDe(agora, "UTC")).toBe("2026-11-13");
  });
});

describe("ehDia e ehIdDeMercado", () => {
  it.each([
    ["2026-11-13", true],
    ["2024-02-29", true],
    ["2026-02-29", false],
    ["2026-13-01", false],
    ["2026-11-13T00:00", false],
    [20261113, false],
  ])("ehDia(%j) é %s", (valor, esperado) => {
    expect(ehDia(valor)).toBe(esperado);
  });

  it.each([
    ["n123", true],
    ["w4", true],
    ["r99", true],
    [id(5), true],
    ["n0123", false],
    ["x123", false],
    ["n", false],
    ["N123", false],
    [123, false],
  ])("ehIdDeMercado(%j) é %s", (valor, esperado) => {
    expect(ehIdDeMercado(valor)).toBe(esperado);
  });
});

// spec 0001 CA-04
describe("lerObservacao", () => {
  const daNota: ObservacaoDePreco = {
    ...observacao,
    id: id(2),
    marca: null,
    tamanho: "1 kg",
    descricao: "ARROZ EXEMPLO T1 5KG",
    fonte: "nota",
    nota: "a".repeat(64),
    minimoAtacado: 3,
  };

  it.each([
    ["digitado", observacao],
    ["da nota", daNota],
  ])("aceita o preço %s como foi gravado", (_caso, registro) => {
    expect(lerObservacao(registro)).toEqual(registro);
  });

  it("descarta campos a mais", () => {
    expect(lerObservacao({ ...observacao, extra: true })).toEqual(observacao);
  });

  it.each<[string, Record<string, unknown>]>([
    ["id que não é UUID", { id: "1" }],
    ["produto vazio", { produto: "" }],
    ["produto com espaço sobrando", { produto: " Arroz" }],
    ["marca que não é texto", { marca: 7 }],
    ["descrição longa", { descricao: "a".repeat(limitesDoPreco.descricao + 1) }],
    ["preço fracionado", { precoCentavos: 25.9 }],
    ["preço zero", { precoCentavos: 0 }],
    ["preço acima do máximo", { precoCentavos: 10_000_001 }],
    ["preço em texto", { precoCentavos: "2590" }],
    ["atacado de 1", { minimoAtacado: 1 }],
    ["atacado em texto", { minimoAtacado: "3" }],
    ["mercado sem id válido", { mercadoId: "mercado" }],
    ["mercado sem nome", { mercadoNome: "" }],
    ["fonte desconhecida", { fonte: "encarte" }],
    ["dia inválido", { vistoEm: "2026-02-30" }],
    ["nota que não é resumo", { nota: "abc" }],
    ["data de criação inválida", { criadoEm: "ontem" }],
  ])("recusa %s", (_caso, campos) => {
    expect(lerObservacao({ ...observacao, ...campos })).toBeNull();
  });

  it.each([null, 42, "texto", []])("recusa %j", (valor) => {
    expect(lerObservacao(valor)).toBeNull();
  });
});

describe("conferirObservacoes", () => {
  it("conta o registro fora do formato e o repetido", () => {
    expect(conferirObservacoes([observacao, observacao, { id: "x" }])).toEqual({
      observacoes: [observacao],
      recusados: 2,
    });
  });

  it("recusa o que passa do limite do aparelho", () => {
    const muitos = Array.from({ length: limitesDoPreco.precos + 1 }, (_, indice) => ({
      ...observacao,
      id: id(1000 + indice),
    }));

    const conferido = conferirObservacoes(muitos);

    expect(conferido.observacoes).toHaveLength(limitesDoPreco.precos);
    expect(conferido.recusados).toBe(1);
  });
});

describe("gravarPrecos e excluirPreco", () => {
  it("montam as alterações do armazém de preços", () => {
    expect(gravarPrecos([observacao])).toEqual({ observacoesDePreco: { gravar: [observacao] } });
    expect(excluirPreco(id(1))).toEqual({ observacoesDePreco: { apagar: [id(1)] } });
  });
});

// spec 0001 CA-16
describe("precosPorProduto", () => {
  const preco = (numero: number, campos: Partial<ObservacaoDePreco>): ObservacaoDePreco => ({
    ...observacao,
    id: id(numero),
    ...campos,
  });

  it("agrupa pelo nome do produto, sem diferença de maiúsculas, acentos e plural", () => {
    const grupos = precosPorProduto(
      [
        preco(1, { produto: "Feijão", vistoEm: "2026-11-01" }),
        preco(2, { produto: "feijoes", vistoEm: "2026-11-10" }),
        preco(3, { produto: "Arroz" }),
      ],
      "2026-11-13",
      chaveDoItem,
    );

    expect(grupos.map((grupo) => [grupo.nome, grupo.precos.map((p) => p.observacao.id)])).toEqual([
      ["Arroz", [id(3)]],
      ["feijoes", [id(2), id(1)]],
    ]);
  });

  it("põe o visto mais recente primeiro, com desempate estável, e marca o antigo", () => {
    const grupos = precosPorProduto(
      [
        preco(4, { vistoEm: "2026-10-01", mercadoNome: "B" }),
        preco(3, { vistoEm: "2026-11-12", mercadoNome: "B" }),
        preco(2, { vistoEm: "2026-11-12", mercadoNome: "A" }),
        preco(1, { vistoEm: "2026-11-12", mercadoNome: "A" }),
        preco(5, { vistoEm: "2026-11-12", criadoEm: "2026-11-13T05:00:00.000Z" }),
      ],
      "2026-11-13",
      chaveDoItem,
    );

    expect(grupos[0]?.precos.map((p) => [p.observacao.id, p.antigo])).toEqual([
      [id(5), false],
      [id(1), false],
      [id(2), false],
      [id(3), false],
      [id(4), true],
    ]);
  });

  it("sem preço nenhum, nenhum grupo", () => {
    expect(precosPorProduto([], "2026-11-13", chaveDoItem)).toEqual([]);
  });
});
