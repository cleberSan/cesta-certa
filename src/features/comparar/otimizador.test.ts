import { describe, expect, it } from "vitest";
import { distanciaKm, pontoNoRumo, type Ponto } from "../mercados/geo";
import type { ObservacaoDePreco } from "../precos/precos";
import {
  comparar,
  maximoDeOpcoes,
  preferenciaDoItem,
  type Criterios,
  type ItemDaComparacao,
  type MercadoDaComparacao,
} from "./otimizador";

const centro: Ponto = { lat: -23.55, lon: -46.63 };

function mercado(id: string, nome: string, km: number, rumo = 0): MercadoDaComparacao {
  const ponto = pontoNoRumo(centro, km, rumo);
  return { id, nome, ...ponto, distanciaKm: distanciaKm(centro, ponto) };
}

let ordem = 0;
function item(nome: string, campos: Partial<ItemDaComparacao> = {}): ItemDaComparacao {
  ordem++;
  return {
    id: `item-${nome}`,
    nome,
    quantidade: 1,
    marca: null,
    tamanho: null,
    preferencia: "mais-barato",
    ordem,
    comprado: false,
    ...campos,
  };
}

let sequencia = 0;
function preco(
  mercadoId: string,
  produto: string,
  precoCentavos: number,
  campos: Partial<ObservacaoDePreco> = {},
): ObservacaoDePreco {
  sequencia++;
  return {
    id: `preco-${String(sequencia).padStart(4, "0")}`,
    produto,
    marca: null,
    tamanho: null,
    descricao: null,
    precoCentavos,
    minimoAtacado: null,
    mercadoId,
    mercadoNome: mercadoId,
    fonte: "digitado",
    vistoEm: "2026-11-10",
    nota: null,
    criadoEm: "2026-11-10T12:00:00.000Z",
    ...campos,
  };
}

const criterios: Criterios = {
  tetoCentavos: null,
  marcas: "mais-barato",
  maximoDeMercados: 1,
  economiaMinimaCentavos: 2000,
};

const a = mercado("a", "Mercado A", 1, 0);
const b = mercado("b", "Mercado B", 2, 90);
const c = mercado("c", "Mercado C", 3, 180);

const ids = (resultado: ReturnType<typeof comparar>) => resultado.opcoes.map((opcao) => opcao.id);

// spec 0001 CA-19
describe("comparar: um mercado", () => {
  it("ordena os mercados pelo total da lista", () => {
    const itens = [item("Arroz"), item("Feijão")];
    const precos = [
      preco("a", "Arroz", 2500),
      preco("a", "Feijão", 900),
      preco("b", "Arroz", 2300),
      preco("b", "Feijão", 800),
    ];

    const resultado = comparar(itens, precos, [a, b], criterios);

    expect(ids(resultado)).toEqual(["b", "a"]);
    expect(resultado.opcoes[0]).toMatchObject({ totalCentavos: 3100, faltando: [], frente: null });
    expect(resultado.porMercado.get("a")).toEqual({ totalCentavos: 3400, faltando: 0 });
  });

  it("usa as embalagens necessárias e o preço de atacado só quando a compra alcança o mínimo", () => {
    const itens = [item("Arroz", { quantidade: 2, tamanho: "5 kg" })];
    const precos = [
      preco("a", "Arroz", 699, { tamanho: "1 kg" }),
      preco("a", "Arroz", 599, { tamanho: "1 kg", minimoAtacado: 12 }),
      preco("b", "Arroz", 650, { tamanho: "1 kg" }),
      preco("b", "Arroz", 550, { tamanho: "1 kg", minimoAtacado: 10 }),
    ];

    const resultado = comparar(itens, precos, [a, b], criterios);

    expect(resultado.opcoes.map((opcao) => opcao.totalCentavos)).toEqual([5500, 6990]);
    expect(resultado.opcoes[0]!.paradas[0]!.linhas[0]).toMatchObject({ embalagens: 10 });
  });

  it("vale o preço visto por último de cada oferta, mesmo quando o antigo era menor", () => {
    const itens = [
      item("Café", { id: "cafe-500", tamanho: "500 g" }),
      item("Café", { id: "cafe" }),
    ];
    const precos = [
      preco("a", "Café", 1500, { tamanho: "500 g", vistoEm: "2026-10-01" }),
      preco("a", "café", 1800, { tamanho: "500g", vistoEm: "2026-11-05" }),
      preco("a", "Café", 1000, { tamanho: "250 g", vistoEm: "2026-09-01" }),
    ];

    const resultado = comparar(itens, precos, [a], criterios);

    // 500 g: vale o de novembro; o item sem tamanho fica com a embalagem mais barata.
    expect(resultado.opcoes[0]!.paradas[0]!.linhas.map((linha) => linha.centavos)).toEqual([
      1800, 1000,
    ]);
  });

  it("no mesmo dia vale o registrado por último; no empate de preço, o visto por último e o id", () => {
    const itens = [item("Leite"), item("Pão"), item("Ovo")];
    const precos = [
      preco("a", "Leite", 500, { id: "x2", criadoEm: "2026-11-10T08:00:00.000Z" }),
      preco("a", "Leite", 450, { id: "x1", criadoEm: "2026-11-10T09:00:00.000Z" }),
      preco("a", "Leite", 470, { id: "x0", criadoEm: "2026-11-10T09:00:00.000Z" }),
      preco("a", "Pão", 100, { id: "y1", tamanho: "pequeno", vistoEm: "2026-11-01" }),
      preco("a", "Pão", 100, { id: "y2", tamanho: "grande", vistoEm: "2026-11-09" }),
      preco("a", "Ovo", 900, { id: "z2", tamanho: "bandeja" }),
      preco("a", "Ovo", 900, { id: "z1", tamanho: "caixa" }),
    ];

    for (const ordemDosPrecos of [precos, [...precos].reverse()]) {
      const resultado = comparar(itens, ordemDosPrecos, [a, a], criterios);
      const linhas = resultado.opcoes[0]!.paradas[0]!.linhas;

      expect(linhas.map((linha) => linha.observacao.id)).toEqual(["x0", "y2", "z1"]);
      expect(resultado.opcoes).toHaveLength(1);
    }
  });

  it("fica de fora o item já comprado", () => {
    const itens = [item("Arroz"), item("Feijão", { comprado: true })];
    const resultado = comparar(
      itens,
      [preco("a", "Arroz", 2500), preco("a", "Feijão", 900)],
      [a],
      criterios,
    );

    expect(resultado.itens.map((i) => i.nome)).toEqual(["Arroz"]);
    expect(resultado.opcoes[0]!.totalCentavos).toBe(2500);
  });

  it("sem preço da lista nos mercados do raio, não há opção nem ajuste", () => {
    const resultado = comparar(
      [item("Arroz")],
      [preco("longe", "Arroz", 100), preco("a", "Sabão", 100)],
      [a, b],
      { ...criterios, tetoCentavos: 1 },
    );

    expect(resultado.opcoes).toEqual([]);
    expect(resultado.ajuste).toBeNull();
    expect(resultado.porMercado.size).toBe(0);
  });
});

// spec 0001 CA-19
describe("comparar: preferência de marca", () => {
  const precos = [
    preco("a", "Arroz", 2800, { marca: "Tio João" }),
    preco("a", "Arroz", 2200, { marca: "Camil" }),
    preco("b", "Arroz", 2100, { marca: "Prato Fino" }),
  ];

  it("só esta marca: conta só a marca escrita; sem ela no mercado, o item falta", () => {
    const itens = [item("Arroz", { marca: "tio joao", preferencia: "so-esta-marca" })];

    const resultado = comparar(itens, precos, [a, b], criterios);

    expect(ids(resultado)).toEqual(["a"]);
    expect(resultado.opcoes[0]!.totalCentavos).toBe(2800);
    expect(resultado.porMercado.get("b")).toBeUndefined();
  });

  it("marca boa: prefere a marca escrita e, sem ela, aceita outra e avisa", () => {
    const itens = [item("Arroz", { marca: "Tio João", preferencia: "marca-boa" })];

    const resultado = comparar(itens, precos, [a, b], criterios);

    expect(resultado.porMercado.get("a")!.totalCentavos).toBe(2800);
    const linhaDeB = resultado.opcoes.find((opcao) => opcao.id === "b")!.paradas[0]!.linhas[0]!;
    expect(linhaDeB).toMatchObject({ centavos: 2100, outraMarca: true });
  });

  it("o mais barato: qualquer marca", () => {
    const itens = [item("Arroz", { marca: "Tio João" })];

    const resultado = comparar(itens, precos, [a, b], criterios);

    expect(resultado.porMercado.get("a")!.totalCentavos).toBe(2200);
    expect(resultado.opcoes[0]!.paradas[0]!.linhas[0]!.outraMarca).toBe(false);
  });

  it("a preferência geral mais exigente vale sobre a do item, e o item sem marca aceita qualquer uma", () => {
    const itens = [item("Arroz", { marca: "Tio João" }), item("Feijão")];
    const comFeijao = [...precos, preco("a", "Feijão", 800, { marca: "Kicaldo" })];

    const resultado = comparar(itens, comFeijao, [a, b], {
      ...criterios,
      marcas: "so-esta-marca",
    });

    expect(resultado.porMercado.get("a")).toEqual({ totalCentavos: 3600, faltando: 0 });
  });

  it("acha a marca na descrição da nota, que não traz marca separada", () => {
    const itens = [item("Arroz", { marca: "Tio João", preferencia: "so-esta-marca" })];
    const daNota = [
      preco("a", "Arroz", 2600, { fonte: "nota", descricao: "ARROZ T1 TIO JOAO 5KG" }),
      preco("a", "Arroz", 2000, { fonte: "nota", descricao: "ARROZ TIOJ 5KG" }),
    ];

    const resultado = comparar(itens, daNota, [a], criterios);

    expect(resultado.opcoes[0]!.totalCentavos).toBe(2600);
  });

  it.each([
    [{ marca: null, preferencia: "so-esta-marca" }, "marca-boa", "mais-barato"],
    [{ marca: " ! ", preferencia: "so-esta-marca" }, "so-esta-marca", "mais-barato"],
    [{ marca: "Omo", preferencia: "mais-barato" }, "marca-boa", "marca-boa"],
    [{ marca: "Omo", preferencia: "so-esta-marca" }, "mais-barato", "so-esta-marca"],
    [{ marca: "Omo", preferencia: "marca-boa" }, "marca-boa", "marca-boa"],
  ] as const)("item %o com a geral %s vale %s", (doItem, geral, esperado) => {
    expect(preferenciaDoItem(doItem, geral)).toBe(esperado);
  });
});

// spec 0001 CA-21
describe("comparar: itens sem preço", () => {
  it("diz quais itens faltam e nunca põe a opção incompleta à frente da completa", () => {
    const itens = [item("Arroz"), item("Feijão"), item("Óleo")];
    const precos = [
      preco("a", "Arroz", 2500),
      preco("a", "Feijão", 900),
      preco("a", "Óleo", 800),
      preco("b", "Arroz", 100),
      preco("b", "Óleo", 100),
    ];

    const resultado = comparar(itens, precos, [a, b], criterios);

    expect(ids(resultado)).toEqual(["a", "b"]);
    expect(resultado.opcoes[1]!.faltando.map((i) => i.nome)).toEqual(["Feijão"]);
    expect(resultado.porMercado.get("b")).toEqual({ totalCentavos: 200, faltando: 1 });
  });

  it("sugere a combinação que completa a lista mesmo sem a economia mínima", () => {
    const itens = [item("Arroz"), item("Feijão")];
    const precos = [preco("a", "Arroz", 2500), preco("b", "Feijão", 900)];

    const resultado = comparar(itens, precos, [a, b], { ...criterios, maximoDeMercados: 2 });

    expect(resultado.opcoes[0]).toMatchObject({ id: "a b", faltando: [], totalCentavos: 3400 });
    // O melhor sozinho é o B (R$ 9,00, sem o arroz): a combinação custa mais, mas tem tudo.
    expect(resultado.opcoes[0]!.frente).toEqual({
      mercado: b,
      economiaCentavos: -2500,
      itensAMais: 1,
    });
  });
});

// spec 0001 CA-22
describe("comparar: combinações", () => {
  const itens = [item("Arroz"), item("Feijão"), item("Carne")];

  function precosCom(economiaEmB: number) {
    return [
      preco("a", "Arroz", 3000),
      preco("a", "Feijão", 1000),
      preco("a", "Carne", 5000),
      preco("b", "Arroz", 3000 - economiaEmB),
      preco("b", "Feijão", 3000),
      preco("b", "Carne", 7000),
    ];
  }

  it("sugere a combinação que economiza o mínimo e diz o que comprar em cada mercado", () => {
    const resultado = comparar(itens, precosCom(2000), [a, b], {
      ...criterios,
      maximoDeMercados: 2,
    });

    const [combinacao] = resultado.opcoes;
    expect(combinacao!.paradas.map((parada) => parada.mercado.id)).toEqual(["a", "b"]);
    expect(combinacao!.paradas.map((parada) => parada.linhas.map((l) => l.item.nome))).toEqual([
      ["Feijão", "Carne"],
      ["Arroz"],
    ]);
    expect(combinacao!.paradas.map((parada) => parada.subtotalCentavos)).toEqual([6000, 1000]);
    expect(combinacao!.frente).toEqual({ mercado: a, economiaCentavos: 2000, itensAMais: 0 });
    expect(combinacao!.distanciaKm).toBeCloseTo(a.distanciaKm + distanciaKm(a, b), 6);
  });

  it("não sugere a combinação que economiza menos que o mínimo", () => {
    const resultado = comparar(itens, precosCom(1999), [a, b], {
      ...criterios,
      maximoDeMercados: 2,
    });

    expect(ids(resultado)).toEqual(["a", "b"]);
  });

  it("com o mínimo zero, sugere qualquer combinação que economize", () => {
    const resultado = comparar(itens, precosCom(1), [a, b], {
      ...criterios,
      maximoDeMercados: 2,
      economiaMinimaCentavos: 0,
    });

    expect(ids(resultado)).toEqual(["a b", "a", "b"]);
  });

  it("até um mercado, não monta combinação", () => {
    const resultado = comparar(itens, precosCom(2500), [a, b], criterios);

    expect(ids(resultado)).toEqual(["a", "b"]);
  });

  it("descarta a combinação em que um mercado não recebe nenhum item", () => {
    const precos = [
      preco("a", "Arroz", 1000),
      preco("b", "Arroz", 5000),
      preco("c", "Arroz", 9000),
    ];

    const resultado = comparar([item("Arroz")], precos, [a, b, c], {
      ...criterios,
      maximoDeMercados: 3,
      economiaMinimaCentavos: 0,
    });

    expect(ids(resultado)).toEqual(["a", "b", "c"]);
  });

  it("três mercados só entram se economizarem o mínimo sobre a melhor opção com dois", () => {
    const base = [
      preco("a", "Arroz", 5000),
      preco("a", "Feijão", 5000),
      preco("b", "Arroz", 2000),
      preco("b", "Feijão", 5000),
      preco("b", "Carne", 5000),
      preco("c", "Feijão", 3000),
    ];
    const ate3 = { ...criterios, maximoDeMercados: 3 } as const;

    const semGanho = comparar(itens, [...base, preco("a", "Carne", 3001)], [a, b, c], ate3);
    const comGanho = comparar(itens, [...base, preco("a", "Carne", 3000)], [a, b, c], ate3);

    // Sem ganho: os três dariam R$ 80,01, R$ 39,99 a menos que o B sozinho, mas só R$ 19,99
    // a menos que B + C, a melhor com dois.
    expect(ids(semGanho)).toEqual(["b c", "b", "a", "c"]);
    expect(comGanho.opcoes[0]).toMatchObject({ id: "a b c", totalCentavos: 8000 });
  });

  it("põe os mercados na ordem do caminho mais curto a partir do ponto", () => {
    // B fica a 2 km para leste e C a 2,2 km também para leste: de A, passar por B antes de C.
    const leste1 = mercado("l1", "Leste 1", 2, 90);
    const leste2 = mercado("l2", "Leste 2", 2.2, 90);
    const oeste = mercado("o", "Oeste", 1, 270);
    const precos = [
      preco("o", "Arroz", 1000),
      preco("l1", "Feijão", 1000),
      preco("l2", "Carne", 1000),
    ];

    const resultado = comparar(itens, precos, [leste2, oeste, leste1], {
      ...criterios,
      maximoDeMercados: 3,
    });

    expect(resultado.opcoes[0]!.id).toBe("o l1 l2");
    expect(resultado.opcoes[0]!.distanciaKm).toBeCloseTo(
      oeste.distanciaKm + distanciaKm(oeste, leste1) + distanciaKm(leste1, leste2),
      6,
    );
  });

  it("devolve no máximo as dez melhores opções e o total de cada mercado", () => {
    const muitos = Array.from({ length: 15 }, (_, i) => mercado(`m${i}`, `M ${i}`, 1 + i / 10));
    const precos = muitos.map((m, i) => preco(m.id, "Arroz", 1000 + i));

    const resultado = comparar([item("Arroz")], precos, muitos, criterios);

    expect(resultado.opcoes).toHaveLength(maximoDeOpcoes);
    expect(resultado.porMercado.size).toBe(15);
  });
});

// spec 0001 CA-20
describe("comparar: teto de gasto", () => {
  const itens = [
    item("Arroz", { marca: "Tio João", preferencia: "so-esta-marca" }),
    item("Feijão", { marca: "Camil", preferencia: "marca-boa" }),
    item("Carne"),
    item("Café"),
  ];
  const precos = [
    preco("a", "Arroz", 3000, { marca: "Tio João" }),
    preco("a", "Arroz", 2000, { marca: "Prato Fino" }),
    preco("a", "Feijão", 1000, { marca: "Camil" }),
    preco("a", "Feijão", 700, { marca: "Kicaldo" }),
    preco("a", "Carne", 4000),
    preco("a", "Café", 1500),
  ];

  it("sem passar do teto, não sugere nada", () => {
    const resultado = comparar(itens, precos, [a], { ...criterios, tetoCentavos: 9500 });

    expect(resultado.opcoes[0]!.acimaDoTetoCentavos).toBe(0);
    expect(resultado.ajuste).toBeNull();
  });

  it("começa pelas trocas de marca que mais economizam e para quando cabe", () => {
    const resultado = comparar(itens, precos, [a], { ...criterios, tetoCentavos: 9000 });

    expect(resultado.opcoes[0]!.acimaDoTetoCentavos).toBe(500);
    expect(resultado.ajuste).toMatchObject({ excessoCentavos: 500, totalDepoisCentavos: 8500 });
    const [troca, ...resto] = resultado.ajuste!.sugestoes;
    expect(resto).toEqual([]);
    expect(troca).toMatchObject({ tipo: "trocar", economiaCentavos: 1000, mercado: a });
    expect(troca!.tipo === "trocar" && troca!.para.observacao.marca).toBe("Prato Fino");
  });

  it("depois das trocas, retira o item mais barato que sozinho faz caber", () => {
    const resultado = comparar(itens, precos, [a], { ...criterios, tetoCentavos: 7000 });

    // 9.500 - 1.000 (arroz) - 300 (feijão) = 8.200; falta 1.200: o café (1.500) resolve.
    expect(resultado.ajuste!.sugestoes.map((s) => [s.tipo, s.economiaCentavos] as const)).toEqual([
      ["trocar", 1000],
      ["trocar", 300],
      ["retirar", 1500],
    ]);
    expect(resultado.ajuste!.totalDepoisCentavos).toBe(6700);
  });

  it("sem item que sozinho resolva, retira o mais caro e segue; a troca do item retirado sai", () => {
    const resultado = comparar(itens, precos, [a], { ...criterios, tetoCentavos: 1000 });

    // Depois das trocas: 8.200, falta 7.200. Carne (4.000), depois arroz (2.000, já trocado)
    // e então o café (1.500) resolve: o arroz sai inteiro (3.000) e a troca dele some.
    expect(
      resultado.ajuste!.sugestoes.map((s) =>
        s.tipo === "trocar" ? `trocar ${s.de.item.nome}` : `retirar ${s.linha.item.nome}`,
      ),
    ).toEqual(["trocar Feijão", "retirar Carne", "retirar Arroz", "retirar Café"]);
    expect(resultado.ajuste!.totalDepoisCentavos).toBe(700);
  });

  it("marca quanto cada opção passa do teto", () => {
    const resultado = comparar(
      [item("Arroz")],
      [preco("a", "Arroz", 3000), preco("b", "Arroz", 3500)],
      [a, b],
      { ...criterios, tetoCentavos: 3200 },
    );

    expect(resultado.opcoes.map((opcao) => opcao.acimaDoTetoCentavos)).toEqual([0, 300]);
    expect(resultado.ajuste).toBeNull();
  });
});

// spec 0001 CA-23
describe("comparar: determinismo e desempenho", () => {
  function embaralhar<T>(valores: readonly T[], semente: number): T[] {
    const copia = [...valores];
    let estado = semente;
    for (let i = copia.length - 1; i > 0; i--) {
      estado = (estado * 1_103_515_245 + 12_345) % 2_147_483_648;
      const j = estado % (i + 1);
      [copia[i], copia[j]] = [copia[j]!, copia[i]!];
    }
    return copia;
  }

  function cenario(itensQuantos: number, mercadosQuantos: number) {
    const mercados = Array.from({ length: mercadosQuantos }, (_, m) =>
      mercado(`m${String(m).padStart(2, "0")}`, `Mercado ${m}`, 0.5 + (m % 7) * 0.7, m * 37),
    );
    const itens = Array.from({ length: itensQuantos }, (_, i) =>
      item(`Produto ${i}`, { id: `i${String(i).padStart(2, "0")}`, ordem: i }),
    );
    const precos = mercados.flatMap((m, mi) =>
      itens.flatMap((it, ii) =>
        (ii * 7 + mi * 3) % 11 === 0
          ? []
          : [preco(m.id, it.nome, 500 + ((ii * 131 + mi * 71) % 997), { id: `p-${mi}-${ii}` })],
      ),
    );
    return { mercados, itens, precos };
  }

  it("a mesma entrada em outra ordem dá o mesmo resultado", () => {
    const { mercados, itens, precos } = cenario(12, 8);
    const objetivo = { ...criterios, maximoDeMercados: 3, economiaMinimaCentavos: 500 } as const;

    const primeiro = comparar(itens, precos, mercados, { ...objetivo, tetoCentavos: 3000 });
    const segundo = comparar(
      embaralhar(itens, 7),
      embaralhar(precos, 11),
      embaralhar(mercados, 13),
      { ...objetivo, tetoCentavos: 3000 },
    );

    expect(segundo).toEqual(primeiro);
    expect(primeiro.opcoes.length).toBeGreaterThan(1);
  });

  it("no empate de total e itens, vem o mais perto e, à mesma distância, o nome", () => {
    const perto = mercado("z", "Zebra", 1, 0);
    const longe = mercado("y", "Abelha", 2, 0);
    const mesmaDistancia = mercado("x", "Abelha", 1, 0);
    const precos = [perto, longe, mesmaDistancia].map((m) => preco(m.id, "Arroz", 1000));

    const resultado = comparar([item("Arroz")], precos, [longe, perto, mesmaDistancia], criterios);

    expect(ids(resultado)).toEqual(["x", "z", "y"]);
  });

  it("calcula 60 itens, 20 mercados e até 3 por opção em até 200 ms, com 5.000 preços guardados", () => {
    const cheio = cenario(60, 20);
    const deFora = Array.from({ length: 5000 - cheio.precos.length }, (_, i) =>
      preco(i % 2 === 0 ? "longe" : "m00", `Outro ${i % 300}`, 100 + i, {
        id: `fora-${i}`,
        marca: "Marca",
        descricao: "OUTRO PRODUTO 1KG",
      }),
    );
    const { mercados, itens } = cheio;
    const precos = [...cheio.precos, ...deFora];
    expect(precos).toHaveLength(5000);
    const objetivo = {
      ...criterios,
      maximoDeMercados: 3,
      economiaMinimaCentavos: 0,
      tetoCentavos: 1000,
    } as const;
    comparar(itens, precos, mercados, objetivo);

    const inicio = performance.now();
    const resultado = comparar(itens, precos, mercados, objetivo);
    const duracao = performance.now() - inicio;

    expect(resultado.opcoes).toHaveLength(maximoDeOpcoes);
    expect(resultado.opcoes[0]!.paradas.length).toBeGreaterThan(1);
    expect(duracao).toBeLessThan(200);
  });
});
