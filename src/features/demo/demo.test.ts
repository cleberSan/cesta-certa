import { describe, expect, it } from "vitest";
import { tiposDeMercado } from "../../shared/contratos/mercados";
import { maiorPrecoEmCentavos } from "../../shared/dinheiro";
import { objetivoPadrao } from "../comparar/objetivo";
import { comparar } from "../comparar/otimizador";
import { chaveDoItem, limites, preferencias } from "../lista/lista";
import { raios } from "../mercados/ajustes";
import { ehAntigo, lerObservacao, limitesDoPreco } from "../precos/precos";
import {
  dadosDaDemonstracao,
  diaAntes,
  idDaListaDeExemplo,
  montarDemonstracao,
  type DadosDaDemonstracao,
} from "./demo";

const hoje = "2026-11-13";
const dados = dadosDaDemonstracao;
const demonstracao = montarDemonstracao(dados, hoje);

/** Minúsculas, sem acento e só letras e números, com espaço simples entre as palavras. */
function normalizar(texto: string): string {
  return ` ${texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

/**
 * Redes e lojas conhecidas de supermercado, atacarejo e hortifrúti do Brasil. A lista não é
 * completa: a garantia principal é que todo nome diga que é fictício (teste abaixo).
 */
const redesReais = [
  "Carrefour",
  "Atacadão",
  "Assaí",
  "Pão de Açúcar",
  "Extra",
  "Dia",
  "Sonda",
  "Hirota",
  "Tenda",
  "Roldão",
  "Makro",
  "Sam's Club",
  "Walmart",
  "Big",
  "Bompreço",
  "Nacional",
  "Mercadorama",
  "Bretas",
  "Zaffari",
  "Bourbon",
  "Guanabara",
  "Mundial",
  "Prezunic",
  "Savegnago",
  "Covabra",
  "Spani",
  "Max Atacadista",
  "Fort Atacadista",
  "Comper",
  "Condor",
  "Muffato",
  "Angeloni",
  "Giassi",
  "Koch",
  "Bistek",
  "Atakarejo",
  "GBarbosa",
  "Mateus",
  "Super Nosso",
  "Supernosso",
  "Verdemar",
  "Epa",
  "Coop",
  "Oba",
  "St Marche",
  "Mambo",
  "Andorinha",
  "Shibata",
  "Barbosa",
  "Lopes",
  "Semar",
  "Ricoy",
  "Davó",
  "Joanin",
  "Enxuto",
  "Higa's",
  "Tonin",
  "Pague Menos",
  "Dalben",
  "Confiança",
  "Nagumo",
  "Cometa",
  "Cidade Canção",
  "Hortifruti",
  "Natural da Terra",
  "Perini",
  "Rede Economia",
  "Cencosud",
  "GPA",
];

/** Palavras que dizem, no próprio nome, que o mercado ou o lugar não existem. */
const marcasDeFiccao = ["exemplo", "ficticio", "ficticia", "imaginario", "faz de conta"];

describe("dados da demonstração", () => {
  const nomesDeLugar = [dados.bairro, dados.cidade, ...dados.mercados.map(({ nome }) => nome)];

  // spec 0001 CA-38
  it.each(nomesDeLugar)("%s não é nome de rede ou loja real", (nome) => {
    const normalizado = normalizar(nome);
    for (const rede of redesReais) {
      expect(normalizado, rede).not.toContain(normalizar(rede));
    }
  });

  // spec 0001 CA-38
  it.each(nomesDeLugar)("%s diz no nome que é fictício", (nome) => {
    const normalizado = normalizar(nome);
    expect(marcasDeFiccao.some((marca) => normalizado.includes(normalizar(marca)))).toBe(true);
  });

  // spec 0001 CA-38
  it("usa marcas de produto inventadas, como Marca A", () => {
    const marcas = [
      ...dados.lista.itens.map(({ marca }) => marca),
      ...dados.precos.map(({ marca }) => marca),
    ].filter((marca) => marca !== null);

    expect(marcas.length).toBeGreaterThan(0);
    for (const marca of marcas) expect(marca).toMatch(/^Marca [A-Z]$/);
  });

  it("tem mercados com id, nome e tipo conhecidos, dentro do raio", () => {
    const ids = dados.mercados.map(({ id }) => id);
    const nomes = dados.mercados.map(({ nome }) => normalizar(nome));

    expect(dados.mercados.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(nomes).size).toBe(nomes.length);
    expect(raios).toContain(dados.raioKm);
    for (const mercado of dados.mercados) {
      expect(mercado.id).toMatch(/^demo-[a-z-]+$/);
      expect(tiposDeMercado).toContain(mercado.tipo);
      expect(mercado.distanciaKm).toBeGreaterThan(0);
      expect(mercado.distanciaKm).toBeLessThanOrEqual(dados.raioKm);
      expect(mercado.rumo).toBeGreaterThanOrEqual(0);
      expect(mercado.rumo).toBeLessThan(360);
    }
  });

  it("tem itens válidos, sem nome repetido", () => {
    const chaves = dados.lista.itens.map(({ nome }) => chaveDoItem(nome));

    expect(new Set(chaves).size).toBe(chaves.length);
    for (const item of dados.lista.itens) {
      expect(item.nome.length).toBeLessThanOrEqual(limites.nomeDoItem);
      expect(Number.isSafeInteger(item.quantidade)).toBe(true);
      expect(item.quantidade).toBeGreaterThanOrEqual(1);
      expect(item.quantidade).toBeLessThanOrEqual(limites.quantidade);
      expect(preferencias).toContain(item.preferencia);
    }
  });

  it("tem preços de mercados da demonstração, de itens da lista, em valores possíveis", () => {
    const ids = new Set(dados.mercados.map(({ id }) => id));
    const itens = new Set(dados.lista.itens.map(({ nome }) => chaveDoItem(nome)));

    for (const preco of dados.precos) {
      expect(ids.has(preco.mercado), preco.mercado).toBe(true);
      expect(itens.has(chaveDoItem(preco.produto)), preco.produto).toBe(true);
      expect(Number.isSafeInteger(preco.centavos)).toBe(true);
      expect(preco.centavos).toBeGreaterThan(0);
      expect(preco.centavos).toBeLessThanOrEqual(maiorPrecoEmCentavos);
      if (preco.atacadoAPartirDe !== null) {
        expect(preco.atacadoAPartirDe).toBeGreaterThanOrEqual(2);
        expect(preco.atacadoAPartirDe).toBeLessThanOrEqual(limitesDoPreco.minimoAtacado);
      }
      expect(Number.isSafeInteger(preco.diasAtras)).toBe(true);
      expect(preco.diasAtras).toBeGreaterThanOrEqual(0);
    }
    // Todo item tem preço em algum mercado, senão a demonstração mostra item faltando sempre.
    expect(new Set(dados.precos.map(({ produto }) => chaveDoItem(produto)))).toEqual(itens);
  });
});

describe("demonstração montada", () => {
  // spec 0001 CA-38
  it("marca todo preço como da demonstração, e o aparelho recusa guardar algum deles", () => {
    expect(demonstracao.observacoes).toHaveLength(dados.precos.length);
    for (const observacao of demonstracao.observacoes) {
      expect(observacao.fonte).toBe("demonstracao");
      expect(lerObservacao(observacao)).toBeNull();
    }
  });

  it("conta os dias dos preços a partir de hoje, com um preço antigo para mostrar o aviso", () => {
    const [primeiro] = demonstracao.observacoes;

    expect(primeiro!.vistoEm).toBe(diaAntes(hoje, dados.precos[0]!.diasAtras));
    expect(demonstracao.observacoes.some(({ vistoEm }) => ehAntigo(vistoEm, hoje))).toBe(true);
    expect(demonstracao.observacoes.filter(({ vistoEm }) => !ehAntigo(vistoEm, hoje))).not.toEqual(
      [],
    );
  });

  it("põe os mercados em ordem de distância, com a distância dos dados", () => {
    const distancias = demonstracao.mercados.map(({ distanciaKm }) => distanciaKm);

    expect(distancias).toEqual([...distancias].sort((a, b) => a - b));
    for (const mercado of demonstracao.mercados) {
      const original = dados.mercados.find(({ id }) => id === mercado.id)!;
      expect(mercado.distanciaKm).toBeCloseTo(original.distanciaKm, 2);
      expect(mercado.tipo).toBe(original.tipo);
    }
  });

  it("monta a lista de exemplo com os itens na ordem dos dados, nenhum comprado", () => {
    expect(demonstracao.lista).toMatchObject({
      id: idDaListaDeExemplo,
      nome: dados.lista.nome,
    });
    expect(demonstracao.itens.map(({ nome }) => nome)).toEqual(
      dados.lista.itens.map(({ nome }) => nome),
    );
    expect(demonstracao.itens.every((item) => item.listaId === idDaListaDeExemplo)).toBe(true);
    expect(demonstracao.itens.some((item) => item.comprado)).toBe(false);
  });

  // spec 0001 CA-22, CA-38
  it("dá uma comparação completa em que combinar dois mercados compensa", () => {
    const comparacao = comparar(
      demonstracao.itens,
      demonstracao.observacoes,
      demonstracao.mercados,
      objetivoPadrao,
    );
    const [primeira] = comparacao.opcoes;

    expect(comparacao.opcoes.length).toBeGreaterThanOrEqual(3);
    expect(primeira!.faltando).toEqual([]);
    expect(primeira!.paradas).toHaveLength(2);
    expect(primeira!.frente).not.toBeNull();
  });

  it("cai no padrão quando o tipo, a preferência ou o mercado do preço não existem", () => {
    const estranho: DadosDaDemonstracao = {
      ...dados,
      mercados: [{ id: "demo-x", nome: "Mercado Exemplo", tipo: "feira", distanciaKm: 1, rumo: 0 }],
      lista: {
        nome: "Lista",
        itens: [{ nome: "Arroz", quantidade: 1, marca: null, tamanho: null, preferencia: "?" }],
      },
      precos: [
        {
          mercado: "demo-y",
          produto: "Arroz",
          marca: null,
          tamanho: null,
          centavos: 100,
          atacadoAPartirDe: null,
          diasAtras: 0,
        },
      ],
    };

    const montada = montarDemonstracao(estranho, hoje);

    expect(montada.mercados[0]!.tipo).toBe("bairro");
    expect(montada.itens[0]!.preferencia).toBe("mais-barato");
    expect(montada.observacoes[0]!.mercadoNome).toBe("demo-y");
  });
});

describe("diaAntes", () => {
  it.each([
    ["2026-11-13", 0, "2026-11-13"],
    ["2026-11-13", 3, "2026-11-10"],
    ["2026-03-01", 1, "2026-02-28"],
    ["2028-03-01", 1, "2028-02-29"],
    ["2026-01-01", 1, "2025-12-31"],
  ])("%s menos %i dia(s) é %s", (dia, dias, esperado) => {
    expect(diaAntes(dia, dias)).toBe(esperado);
  });
});
