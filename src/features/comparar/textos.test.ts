import { describe, expect, it } from "vitest";
import type { ObservacaoDePreco } from "../precos/precos";
import { objetivoPadrao } from "./objetivo";
import type { ItemDaComparacao, Linha, MercadoDaComparacao, Opcao } from "./otimizador";
import {
  aberturaDoAjuste,
  descreverAcimaDoTeto,
  descreverCaminho,
  descreverFaltando,
  descreverFrente,
  descreverLinha,
  descreverSugestao,
  descreverTotalDoMercado,
  fechamentoDoAjuste,
  juntar,
  nomeDaOpcao,
  resumoDaComparacao,
  resumoDoObjetivo,
  rotuloDaEconomia,
  rotuloDoPino,
  rotuloDosMercados,
} from "./textos";

const mercado = (nome: string): MercadoDaComparacao => ({
  id: nome,
  nome,
  lat: -23.55,
  lon: -46.63,
  distanciaKm: 1.234,
});

const item = (nome: string): ItemDaComparacao => ({
  id: nome,
  nome,
  quantidade: 1,
  marca: null,
  tamanho: null,
  preferencia: "mais-barato",
  ordem: 1,
  comprado: false,
});

function linha(campos: Partial<ObservacaoDePreco>, embalagens = 1): Linha {
  const observacao: ObservacaoDePreco = {
    id: "p",
    produto: "Arroz",
    marca: null,
    tamanho: null,
    descricao: null,
    precoCentavos: 2790,
    minimoAtacado: null,
    mercadoId: "a",
    mercadoNome: "A",
    fonte: "digitado",
    vistoEm: "2026-11-10",
    nota: null,
    criadoEm: "2026-11-10T12:00:00.000Z",
    ...campos,
  };
  return {
    item: item("Arroz"),
    observacao,
    embalagens,
    centavos: embalagens * observacao.precoCentavos,
    outraMarca: false,
  };
}

const parada = (nome: string) => ({ mercado: mercado(nome), linhas: [], subtotalCentavos: 0 });

// spec 0001 CA-19
describe("objetivo", () => {
  it("resume as quatro respostas numa linha", () => {
    expect(resumoDoObjetivo(objetivoPadrao, 5)).toBe(
      "Sem teto · O mais barato · Até 2 mercados · De carro, até 5 km",
    );
    expect(
      resumoDoObjetivo(
        {
          ...objetivoPadrao,
          tetoCentavos: 60_000,
          marcas: "so-esta-marca",
          maximoDeMercados: 1,
          modo: "a-pe",
        },
        2,
      ),
    ).toBe("Até R$ 600,00 · Só as marcas que escolhi · Só 1 mercado · A pé, até 2 km");
  });

  it("dá nome às opções de mercados e de economia mínima", () => {
    expect([1, 2, 3].map((n) => rotuloDosMercados(n as 1 | 2 | 3))).toEqual([
      "Só 1 mercado",
      "Até 2 mercados",
      "Até 3 mercados",
    ]);
    expect(rotuloDaEconomia(0)).toBe("Qualquer economia");
    expect(rotuloDaEconomia(2000)).toBe("R$ 20,00");
  });
});

// spec 0001 CA-21 e CA-22
describe("opções", () => {
  it.each([
    [[], ""],
    [["A"], "A"],
    [["A", "B"], "A e B"],
    [["A", "B", "C"], "A, B e C"],
  ])("junta %j como %j", (nomes, esperado) => {
    expect(juntar(nomes)).toBe(esperado);
  });

  it("dá à opção o nome dos mercados na ordem do caminho", () => {
    expect(nomeDaOpcao({ paradas: [parada("Mercado B"), parada("Mercado A")] })).toBe(
      "Mercado B e Mercado A",
    );
  });

  it("diz quantos e quais itens faltam, até cinco nomes", () => {
    expect(descreverFaltando({ faltando: [] })).toBeNull();
    expect(descreverFaltando({ faltando: [item("Feijão")] })).toBe(
      "Falta preço de 1 item: Feijão.",
    );
    expect(descreverFaltando({ faltando: ["A", "B", "C"].map(item) })).toBe(
      "Falta preço de 3 itens: A, B e C.",
    );
    expect(descreverFaltando({ faltando: ["A", "B", "C", "D", "E", "F", "G"].map(item) })).toBe(
      "Falta preço de 7 itens: A, B, C, D, E e mais 2.",
    );
  });

  it("compara a combinação com o melhor mercado sozinho", () => {
    expect(
      descreverFrente({ mercado: mercado("Mercado A"), economiaCentavos: 2540, itensAMais: 0 }),
    ).toBe("Economiza R$ 25,40 em relação a comprar tudo em Mercado A.");
    expect(
      descreverFrente({ mercado: mercado("Mercado A"), economiaCentavos: -900, itensAMais: 1 }),
    ).toBe("Tem preço de 1 item a mais que Mercado A sozinho.");
    expect(
      descreverFrente({ mercado: mercado("Mercado A"), economiaCentavos: 0, itensAMais: 2 }),
    ).toBe("Tem preço de 2 itens a mais que Mercado A sozinho.");
  });

  it("descreve o caminho de um mercado e de vários", () => {
    expect(descreverCaminho({ paradas: [parada("A")], distanciaKm: 1.234 })).toBe(
      "1,2 km do ponto, em linha reta",
    );
    expect(descreverCaminho({ paradas: [parada("A"), parada("B")], distanciaKm: 3.46 })).toBe(
      "3,5 km de caminho estimado, em linha reta, passando pelos 2 mercados",
    );
  });

  it("descreve cada compra com a conta das embalagens", () => {
    expect(descreverLinha(linha({ marca: "Tio João", tamanho: "5 kg" }, 2))).toBe(
      "Arroz (Tio João, 5 kg): 2 × R$ 27,90 = R$ 55,80",
    );
    expect(descreverLinha(linha({ fonte: "nota", descricao: "ARROZ T1 5KG" }))).toBe(
      "Arroz (ARROZ T1 5KG): R$ 27,90",
    );
    expect(descreverLinha(linha({}))).toBe("Arroz: R$ 27,90");
  });

  it("resume a comparação para o anúncio da tela", () => {
    const opcao = {} as Opcao;
    expect(resumoDaComparacao({ opcoes: [opcao, opcao], itens: [item("A"), item("B")] })).toBe(
      "2 opções para 2 itens da lista, da mais barata para a mais cara.",
    );
    expect(resumoDaComparacao({ opcoes: [opcao], itens: [item("A")] })).toBe(
      "1 opção para 1 item da lista, da mais barata para a mais cara.",
    );
    expect(resumoDaComparacao({ opcoes: [], itens: [item("A")] })).toBe(
      "Nenhum mercado do raio tem preço do item da lista.",
    );
    expect(resumoDaComparacao({ opcoes: [], itens: [item("A"), item("B")] })).toBe(
      "Nenhum mercado do raio tem preço dos 2 itens da lista.",
    );
  });
});

// spec 0001 CA-20
describe("teto", () => {
  it("diz quanto passa e o que fazer para caber", () => {
    const ajuste = { excessoCentavos: 1500, sugestoes: [], totalDepoisCentavos: 58_500 };

    expect(descreverAcimaDoTeto(300)).toBe("Passa do teto em R$ 3,00.");
    expect(aberturaDoAjuste(ajuste, 60_000)).toBe(
      "A opção mais barata passa do teto de R$ 600,00 em R$ 15,00. Para caber, começando pelo que mais economiza:",
    );
    expect(fechamentoDoAjuste(ajuste)).toBe("Com isso, a compra fica em R$ 585,00.");
  });

  it("descreve a troca de marca e a retirada", () => {
    const de = linha({ marca: "Tio João", tamanho: "5 kg", precoCentavos: 3000 });
    const para = linha({ marca: "Prato Fino", tamanho: "5 kg", precoCentavos: 2000 });

    expect(
      descreverSugestao({
        tipo: "trocar",
        de,
        para,
        mercado: mercado("Mercado A"),
        economiaCentavos: 1000,
      }),
    ).toBe("Trocar Arroz (Tio João, 5 kg) por Prato Fino, 5 kg em Mercado A: economiza R$ 10,00.");
    expect(
      descreverSugestao({
        tipo: "trocar",
        de: linha({}),
        para: linha({}),
        mercado: mercado("Mercado A"),
        economiaCentavos: 1,
      }),
    ).toBe("Trocar Arroz por outra opção em Mercado A: economiza R$ 0,01.");
    expect(descreverSugestao({ tipo: "retirar", linha: de, economiaCentavos: 3000 })).toBe(
      "Tirar Arroz da compra: economiza R$ 30,00.",
    );
  });
});

// spec 0001 CA-21
describe("total de cada mercado", () => {
  it.each([
    [{ totalCentavos: 41_230, faltando: 0 }, "R$ 412,30", "Sua lista aqui: R$ 412,30"],
    [
      { totalCentavos: 20_000, faltando: 1 },
      "R$ 200,00 (falta 1)",
      "Sua lista aqui: R$ 200,00, sem preço de 1 item",
    ],
    [
      { totalCentavos: 20_000, faltando: 3 },
      "R$ 200,00 (faltam 3)",
      "Sua lista aqui: R$ 200,00, sem preço de 3 itens",
    ],
  ])("%o vira %j no pino e %j na lista", (total, pino, lista) => {
    expect(rotuloDoPino(total)).toBe(pino);
    expect(descreverTotalDoMercado(total)).toBe(lista);
  });
});
