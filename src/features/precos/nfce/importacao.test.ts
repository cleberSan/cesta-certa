import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ItemDaNota, NotaConsultada } from "../../../shared/contratos/nfce";
import { limitesDoPreco, type ObservacaoDePreco } from "../precos";
import { limitesDaAssociacao, type Associacao } from "./associacoes";
import {
  aplicarImportacao,
  chaveDoLink,
  opcoesComLembrado,
  prepararImportacao,
  produtosParaLigar,
  resumoDaNota,
  type Decisao,
  type Preparo,
} from "./importacao";

const chave = "35261111222333000181650010000123451123456780";
const link = `https://www.nfce.fazenda.sp.gov.br/qrcode?p=${chave}|2|1|1|A1B2C3D4E5F6`;
const resumo = createHash("sha256").update(chave).digest("hex");
const cnpj = "11222333000181";
const hoje = "2026-11-13";
const agora = new Date("2026-11-13T15:00:00.000Z");
const mercado = { id: "n123", nome: "Mercadinho da Praça" };

function item(campos: Partial<ItemDaNota> = {}): ItemDaNota {
  return {
    descricao: "CAFE SOLUVEL 200G",
    codigo: "7890000000017",
    quantidade: "2",
    unidade: "UN",
    precoUnitarioCentavos: 1899,
    totalCentavos: 3798,
    ...campos,
  };
}

const cafe = item();
const queijo = item({
  descricao: "QUEIJO MUCARELA KG",
  codigo: "2000340",
  quantidade: "0.345",
  unidade: "KG",
  precoUnitarioCentavos: 3890,
  totalCentavos: 1342,
});
const sacola = item({
  descricao: "SACOLA",
  codigo: "1",
  quantidade: "1",
  precoUnitarioCentavos: 0,
  totalCentavos: 0,
});

function nota(campos: Partial<NotaConsultada> = {}): NotaConsultada {
  return {
    uf: "SP",
    mercado: { cnpj, nome: "MERCADO EXEMPLO LTDA", endereco: null },
    emitidaEm: "2026-11-07T10:15:30",
    itens: [cafe, queijo],
    itensNaoLidos: 0,
    ...campos,
  };
}

const vazio = { associacoes: [] as Associacao[], observacoes: [] as ObservacaoDePreco[] };

function contexto() {
  let proximo = 0;
  return {
    agora,
    gerarId: () => `00000000-0000-4000-8000-${String(++proximo).padStart(12, "0")}`,
  };
}

function observacao(campos: Partial<ObservacaoDePreco> = {}): ObservacaoDePreco {
  return {
    id: "00000000-0000-4000-8000-0000000000aa",
    produto: "Arroz",
    marca: null,
    tamanho: null,
    descricao: null,
    precoCentavos: 2500,
    minimoAtacado: null,
    mercadoId: "n9",
    mercadoNome: "Outro",
    fonte: "digitado",
    vistoEm: "2026-11-01",
    nota: null,
    criadoEm: "2026-11-01T12:00:00.000Z",
    ...campos,
  };
}

const ligar = (produto: string): Decisao => ({ produto });

describe("chaveDoLink", () => {
  it.each([
    [link, chave],
    [`https://x.example/consulta?chNFe=${chave}&tpAmb=1`, chave],
    [`https://x.example/?p=${chave}%7C2%7C1`, chave],
    [`https://x.example/?p=9${chave}`, null],
    [`https://x.example/?p=${chave.slice(1)}`, null],
    ["https://x.example/?p=abc", null],
  ])("%s → %s", (texto, esperado) => {
    expect(chaveDoLink(texto)).toBe(esperado);
  });
});

// spec 0001 CA-11
describe("resumoDaNota", () => {
  it("é o SHA-256 da chave de acesso, sem o resto do link", async () => {
    expect(await resumoDaNota(link)).toBe(resumo);
    expect(await resumoDaNota(`${link}&outro=1`)).toBe(resumo);
  });

  it("é nulo sem chave no link ou sem criptografia no navegador", async () => {
    expect(await resumoDaNota("https://x.example/?p=1")).toBeNull();
    expect(await resumoDaNota(link, {})).toBeNull();
  });
});

// spec 0001 CA-10
describe("prepararImportacao", () => {
  it("traz a loja, o dia da emissão, o resumo e os produtos, sem nada lembrado na primeira vez", () => {
    const preparo = prepararImportacao(nota(), resumo, vazio, hoje);

    expect(preparo).toEqual({
      cnpj,
      vistoEm: "2026-11-07",
      nota: resumo,
      mercado: null,
      itens: [
        {
          codigo: "7890000000017",
          descricao: "CAFE SOLUVEL 200G",
          quantidade: "2",
          unidade: "UN",
          precoCentavos: 1899,
          lembrado: null,
        },
        {
          codigo: "2000340",
          descricao: "QUEIJO MUCARELA KG",
          quantidade: "0.345",
          unidade: "KG",
          precoCentavos: 3890,
          lembrado: null,
        },
      ],
      semPreco: 0,
      jaGuardados: 0,
    });
  });

  it("sem a data na nota, usa o dia de hoje", () => {
    expect(prepararImportacao(nota({ emitidaEm: null }), resumo, vazio, hoje).vistoEm).toBe(hoje);
    expect(prepararImportacao(nota({ emitidaEm: "2026-02-30" }), resumo, vazio, hoje).vistoEm).toBe(
      hoje,
    );
    expect(prepararImportacao(nota({ emitidaEm: "2026-11-05" }), resumo, vazio, hoje).vistoEm).toBe(
      "2026-11-05",
    );
  });

  it("junta o mesmo código passado duas vezes no caixa e deixa de fora o item sem preço", () => {
    const repetida = nota({ itens: [cafe, sacola, cafe, queijo] });

    const preparo = prepararImportacao(repetida, resumo, vazio, hoje);

    expect(preparo.itens.map((linha) => linha.codigo)).toEqual(["7890000000017", "2000340"]);
    expect(preparo.semPreco).toBe(1);
  });

  it("deixa de fora o preço acima do máximo que o app guarda", () => {
    const caro = item({ codigo: "9", precoUnitarioCentavos: 100_000_000 });

    expect(prepararImportacao(nota({ itens: [caro] }), resumo, vazio, hoje).semPreco).toBe(1);
  });

  it("limpa a descrição e o código; sem código, cada linha fica separada e nada é lembrado", () => {
    const semCodigo = item({ codigo: "  ", descricao: "  PAO​  FRANCES  " });
    const semDescricao = item({ codigo: "", descricao: " " });

    const preparo = prepararImportacao(
      nota({ itens: [semCodigo, semCodigo, semDescricao] }),
      resumo,
      vazio,
      hoje,
    );

    expect(preparo.itens.map((linha) => [linha.codigo, linha.descricao])).toEqual([
      [null, "PAO FRANCES"],
      [null, "PAO FRANCES"],
      [null, "Produto sem descrição na nota"],
    ]);
  });

  // spec 0001 CA-14
  it("traz o mercado e as escolhas lembradas desta loja", () => {
    const associacoes: Associacao[] = [
      {
        id: `mercado ${cnpj}`,
        tipo: "mercado",
        cnpj,
        mercadoId: "n123",
        mercadoNome: "Mercadinho da Praça",
        atualizadaEm: "2026-11-01T12:00:00.000Z",
      },
      {
        id: `produto ${cnpj} 7890000000017`,
        tipo: "produto",
        cnpj,
        codigo: "7890000000017",
        descricao: "CAFE SOLUVEL 200G",
        produto: "Café",
        atualizadaEm: "2026-11-01T12:00:00.000Z",
      },
      {
        id: `produto ${cnpj} 2000340`,
        tipo: "produto",
        cnpj,
        codigo: "2000340",
        descricao: "QUEIJO MUCARELA KG",
        produto: null,
        atualizadaEm: "2026-11-01T12:00:00.000Z",
      },
      {
        id: "produto 99888777000166 7890000000017",
        tipo: "produto",
        cnpj: "99888777000166",
        codigo: "7890000000017",
        descricao: "CAFE",
        produto: "Outro nome",
        atualizadaEm: "2026-11-01T12:00:00.000Z",
      },
    ];

    const preparo = prepararImportacao(nota(), resumo, { associacoes, observacoes: [] }, hoje);

    expect(preparo.mercado).toEqual(mercado);
    expect(preparo.itens.map((linha) => linha.lembrado)).toEqual([{ produto: "Café" }, "ignorar"]);
  });

  it("conta os preços desta mesma nota que já estão no aparelho", () => {
    const observacoes = [
      observacao({ fonte: "nota", nota: resumo }),
      observacao({ id: "00000000-0000-4000-8000-0000000000bb", fonte: "nota", nota: resumo }),
      observacao({
        id: "00000000-0000-4000-8000-0000000000cc",
        fonte: "nota",
        nota: "f".repeat(64),
      }),
    ];

    expect(
      prepararImportacao(nota(), resumo, { associacoes: [], observacoes }, hoje).jaGuardados,
    ).toBe(2);
    expect(
      prepararImportacao(nota(), null, { associacoes: [], observacoes }, hoje).jaGuardados,
    ).toBe(0);
  });
});

// spec 0001 CA-14
describe("produtosParaLigar", () => {
  it("junta listas, preços e lembrados, sem repetir o mesmo produto, em ordem alfabética", () => {
    const preparo: Preparo = {
      ...prepararImportacao(nota(), resumo, vazio, hoje),
      itens: [
        {
          ...prepararImportacao(nota(), resumo, vazio, hoje).itens[0]!,
          lembrado: { produto: "Café" },
        },
        { ...prepararImportacao(nota(), resumo, vazio, hoje).itens[1]!, lembrado: "ignorar" },
      ],
    };

    const produtos = produtosParaLigar(
      ["Leite", "Arroz"],
      [observacao({ produto: "arroz" }), observacao({ produto: "Feijão" })],
      preparo,
    );

    expect(produtos).toEqual(["Arroz", "Café", "Feijão", "Leite"]);
  });
});

describe("opcoesComLembrado", () => {
  const opcoes = [{ id: "n1", nome: "Perto", detalhe: "300 m" }];

  it("põe o mercado lembrado no começo quando ele não está entre as opções", () => {
    expect(opcoesComLembrado(opcoes, mercado)).toEqual([
      { ...mercado, detalhe: "escolhido antes para esta loja" },
      ...opcoes,
    ]);
  });

  it("não repete o mercado que já está nas opções nem mexe quando não há lembrado", () => {
    expect(opcoesComLembrado(opcoes, { id: "n1", nome: "Perto" })).toBe(opcoes);
    expect(opcoesComLembrado(opcoes, null)).toBe(opcoes);
  });
});

// spec 0001 CA-10 e CA-14
describe("aplicarImportacao", () => {
  const preparo = prepararImportacao(nota(), resumo, vazio, hoje);

  it("vira preços com fonte nota, o dia da compra e o resumo, e lembra o mercado e os produtos", () => {
    const importado = aplicarImportacao(
      preparo,
      mercado,
      [ligar("Café"), ligar("Queijo")],
      vazio,
      contexto(),
    );

    expect(importado.ok).toBe(true);
    if (!importado.ok) return;
    const [doCafe, doQueijo] = importado.valor.observacoes;
    expect(doCafe).toEqual({
      id: "00000000-0000-4000-8000-000000000001",
      produto: "Café",
      marca: null,
      tamanho: null,
      descricao: "CAFE SOLUVEL 200G",
      precoCentavos: 1899,
      minimoAtacado: null,
      mercadoId: "n123",
      mercadoNome: "Mercadinho da Praça",
      fonte: "nota",
      vistoEm: "2026-11-07",
      nota: resumo,
      criadoEm: "2026-11-13T15:00:00.000Z",
    });
    // Vendido a peso: o preço unitário da nota é o de 1 kg.
    expect(doQueijo).toMatchObject({ produto: "Queijo", tamanho: "1 kg", precoCentavos: 3890 });
    expect(importado.valor.associacoes).toEqual([
      {
        id: `mercado ${cnpj}`,
        tipo: "mercado",
        cnpj,
        mercadoId: "n123",
        mercadoNome: "Mercadinho da Praça",
        atualizadaEm: "2026-11-13T15:00:00.000Z",
      },
      {
        id: `produto ${cnpj} 7890000000017`,
        tipo: "produto",
        cnpj,
        codigo: "7890000000017",
        descricao: "CAFE SOLUVEL 200G",
        produto: "Café",
        atualizadaEm: "2026-11-13T15:00:00.000Z",
      },
      {
        id: `produto ${cnpj} 2000340`,
        tipo: "produto",
        cnpj,
        codigo: "2000340",
        descricao: "QUEIJO MUCARELA KG",
        produto: "Queijo",
        atualizadaEm: "2026-11-13T15:00:00.000Z",
      },
    ]);
    expect(importado.valor.alteracoes).toEqual({
      observacoesDePreco: { gravar: importado.valor.observacoes, apagar: [] },
      associacoes: { gravar: importado.valor.associacoes },
    });
    expect(importado.valor.guardados).toBe(2);
    expect(importado.valor.ignorados).toBe(0);
  });

  it("o produto ignorado não vira preço, mas a escolha fica lembrada", () => {
    const importado = aplicarImportacao(
      preparo,
      mercado,
      [ligar("Café"), "ignorar"],
      vazio,
      contexto(),
    );

    expect(importado.ok && importado.valor.observacoes.map((o) => o.produto)).toEqual(["Café"]);
    expect(importado.ok && importado.valor.associacoes[2]).toMatchObject({
      codigo: "2000340",
      produto: null,
    });
    expect(importado.ok && [importado.valor.guardados, importado.valor.ignorados]).toEqual([1, 1]);
  });

  it("guarda só as escolhas quando tudo foi ignorado", () => {
    const importado = aplicarImportacao(
      preparo,
      mercado,
      ["ignorar", "ignorar"],
      vazio,
      contexto(),
    );

    expect(importado.ok && importado.valor.observacoes).toEqual([]);
    expect(importado.ok && importado.valor.associacoes).toHaveLength(3);
  });

  it("vendido a litro vira o preço de 1 L; outras unidades ficam sem tamanho", () => {
    const litros = item({ codigo: "10", unidade: "LT" });
    const litro = item({ codigo: "11", unidade: " l " });
    const caixa = item({ codigo: "12", unidade: "CX" });
    const doLitro = prepararImportacao(
      nota({ itens: [litros, litro, caixa] }),
      resumo,
      vazio,
      hoje,
    );

    const importado = aplicarImportacao(
      doLitro,
      mercado,
      [ligar("Leite"), ligar("Óleo"), ligar("Sabão")],
      vazio,
      contexto(),
    );

    expect(importado.ok && importado.valor.observacoes.map((o) => o.tamanho)).toEqual([
      "1 L",
      "1 L",
      null,
    ]);
  });

  it("item sem código vira preço, mas a escolha não fica lembrada", () => {
    const semCodigo = prepararImportacao(
      nota({ itens: [item({ codigo: "" })] }),
      resumo,
      vazio,
      hoje,
    );

    const importado = aplicarImportacao(semCodigo, mercado, [ligar("Café")], vazio, contexto());

    expect(importado.ok && importado.valor.observacoes).toHaveLength(1);
    expect(importado.ok && importado.valor.associacoes.map((a) => a.tipo)).toEqual(["mercado"]);
  });

  it("recusa sem mercado escolhido ou com um mercado inválido", () => {
    expect(aplicarImportacao(preparo, null, ["ignorar", "ignorar"], vazio, contexto())).toEqual({
      ok: false,
      erro: { tipo: "mercado-vazio" },
    });
    expect(
      aplicarImportacao(preparo, { id: "x", nome: "X" }, ["ignorar", "ignorar"], vazio, contexto()),
    ).toEqual({ ok: false, erro: { tipo: "mercado-vazio" } });
  });

  it("espera a escolha de cada produto e diz quantos faltam", () => {
    expect(aplicarImportacao(preparo, mercado, [ligar("Café")], vazio, contexto())).toEqual({
      ok: false,
      erro: { tipo: "faltam-produtos", quantos: 1 },
    });
    expect(aplicarImportacao(preparo, mercado, [], vazio, contexto())).toEqual({
      ok: false,
      erro: { tipo: "faltam-produtos", quantos: 2 },
    });
  });

  it("um nome de produto vazio conta como escolha que falta", () => {
    expect(
      aplicarImportacao(preparo, mercado, [ligar("  "), "ignorar"], vazio, contexto()),
    ).toEqual({ ok: false, erro: { tipo: "faltam-produtos", quantos: 1 } });
  });

  it("importar a mesma nota de novo troca os preços dela, sem repetir, e mantém os outros", () => {
    const daNota = observacao({
      id: "00000000-0000-4000-8000-0000000000bb",
      fonte: "nota",
      nota: resumo,
    });
    const outro = observacao();
    const aparelho = { associacoes: [], observacoes: [outro, daNota] };

    const importado = aplicarImportacao(
      prepararImportacao(nota(), resumo, aparelho, hoje),
      mercado,
      [ligar("Café"), "ignorar"],
      aparelho,
      contexto(),
    );

    expect(importado.ok && importado.valor.alteracoes.observacoesDePreco?.apagar).toEqual([
      daNota.id,
    ]);
    expect(importado.ok && importado.valor.observacoes.map((o) => o.id)).toEqual([
      outro.id,
      "00000000-0000-4000-8000-000000000001",
    ]);
  });

  it("sem o resumo da nota, não apaga nenhum preço", () => {
    const semResumo = observacao({ fonte: "nota", nota: null });
    const aparelho = { associacoes: [], observacoes: [semResumo] };

    const importado = aplicarImportacao(
      prepararImportacao(nota(), null, aparelho, hoje),
      mercado,
      [ligar("Café"), "ignorar"],
      aparelho,
      contexto(),
    );

    expect(importado.ok && importado.valor.alteracoes.observacoesDePreco?.apagar).toEqual([]);
    expect(importado.ok && importado.valor.observacoes).toHaveLength(2);
  });

  it("troca a escolha lembrada quando a pessoa muda de ideia", () => {
    const antes = aplicarImportacao(
      preparo,
      mercado,
      [ligar("Café"), "ignorar"],
      vazio,
      contexto(),
    );
    if (!antes.ok) throw new Error("devia importar");
    const aparelho = { associacoes: antes.valor.associacoes, observacoes: [] };
    const outroMercado = { id: "n456", nome: "Atacadão do Bairro" };

    const depois = aplicarImportacao(
      prepararImportacao(nota(), resumo, aparelho, hoje),
      outroMercado,
      [ligar("Café solúvel"), ligar("Queijo")],
      aparelho,
      contexto(),
    );

    expect(depois.ok && depois.valor.associacoes).toHaveLength(3);
    expect(
      depois.ok &&
        depois.valor.associacoes.map((a) => (a.tipo === "mercado" ? a.mercadoId : a.produto)),
    ).toEqual(["n456", "Café solúvel", "Queijo"]);
  });

  it("recusa quando os preços passariam do máximo do aparelho, contando os que serão trocados", () => {
    const cheios = Array.from({ length: limitesDoPreco.precos - 1 }, (_, indice) =>
      observacao({ id: `00000000-0000-4000-8000-${String(indice + 1000).padStart(12, "0")}` }),
    );

    expect(
      aplicarImportacao(
        preparo,
        mercado,
        [ligar("Café"), ligar("Queijo")],
        { associacoes: [], observacoes: cheios },
        contexto(),
      ),
    ).toEqual({ ok: false, erro: { tipo: "limite-de-precos" } });
    expect(
      aplicarImportacao(
        preparo,
        mercado,
        [ligar("Café"), "ignorar"],
        { associacoes: [], observacoes: cheios },
        contexto(),
      ).ok,
    ).toBe(true);
    const comANota = [...cheios.slice(1), observacao({ fonte: "nota", nota: resumo })];
    expect(
      aplicarImportacao(
        preparo,
        mercado,
        [ligar("Café"), ligar("Queijo")],
        { associacoes: [], observacoes: comANota },
        contexto(),
      ).ok,
    ).toBe(true);
  });

  it("recusa quando as escolhas lembradas passariam do máximo", () => {
    const lotadas: Associacao[] = Array.from(
      { length: limitesDaAssociacao.associacoes - 1 },
      (_, indice) => ({
        id: `produto 99888777000166 ${indice}`,
        tipo: "produto",
        cnpj: "99888777000166",
        codigo: String(indice),
        descricao: "X",
        produto: null,
        atualizadaEm: "2026-11-01T12:00:00.000Z",
      }),
    );

    expect(
      aplicarImportacao(
        preparo,
        mercado,
        ["ignorar", "ignorar"],
        { associacoes: lotadas, observacoes: [] },
        contexto(),
      ),
    ).toEqual({ ok: false, erro: { tipo: "limite-de-escolhas" } });
  });
});
