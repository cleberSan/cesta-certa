import { describe, expect, it } from "vitest";
import type { Item } from "../lista/lista";
import type { MercadoProprio } from "../mercados/proprios";
import { opcoesDeMercado, produtosDasListas } from "./escolha";
import type { ObservacaoDePreco } from "./precos";

const id = (numero: number) => `00000000-0000-4000-8000-${numero.toString(16).padStart(12, "0")}`;

const item = (numero: number, nome: string): Item => ({
  id: id(numero),
  listaId: id(1),
  nome,
  quantidade: 1,
  marca: null,
  tamanho: null,
  preferencia: "mais-barato",
  comprado: false,
  ordem: numero,
  criadoEm: "2026-11-01T10:00:00.000Z",
});

const proprio = (numero: number, nome: string): MercadoProprio => ({
  id: id(numero),
  nome,
  tipo: "bairro",
  lat: -23.55,
  lon: -46.63,
  criadoEm: "2026-11-05T10:00:00.000Z",
});

const preco = (numero: number, mercadoId: string, mercadoNome: string): ObservacaoDePreco => ({
  id: id(numero),
  produto: "Arroz",
  marca: null,
  tamanho: null,
  descricao: null,
  precoCentavos: 100,
  minimoAtacado: null,
  mercadoId,
  mercadoNome,
  fonte: "digitado",
  vistoEm: "2026-11-10",
  nota: null,
  criadoEm: "2026-11-10T12:00:00.000Z",
});

// spec 0001 CA-15
describe("produtosDasListas", () => {
  it("dá os nomes dos itens sem repetir o mesmo produto, em ordem alfabética", () => {
    const produtos = produtosDasListas({
      listas: [],
      itens: [item(1, "Feijão"), item(2, "arroz"), item(3, "Feijões"), item(4, "Óleo")],
    });

    expect(produtos).toEqual(["arroz", "Feijão", "Óleo"]);
  });
});

// spec 0001 CA-15
describe("opcoesDeMercado", () => {
  it("põe os mercados perto primeiro, depois os cadastrados fora do raio e os já usados", () => {
    const perto = proprio(10, "Mercadinho Perto");
    const longe = proprio(11, "Armazém Longe");
    const opcoes = opcoesDeMercado(
      [
        { id: "n1", nome: "Super Exemplo", lat: 0, lon: 0, distanciaKm: 0.3 },
        { ...perto, distanciaKm: 1.25 },
      ],
      [perto, longe],
      [preco(20, "n1", "Super Exemplo"), preco(21, "w9", "Atacado Antigo")],
    );

    expect(opcoes).toEqual([
      { id: "n1", nome: "Super Exemplo", detalhe: "300 m" },
      { id: perto.id, nome: "Mercadinho Perto", detalhe: "1,3 km, cadastrado por você" },
      { id: longe.id, nome: "Armazém Longe", detalhe: "cadastrado por você" },
      { id: "w9", nome: "Atacado Antigo", detalhe: "usado antes" },
    ]);
  });

  it("mostra cada mercado usado uma vez, pelo nome em ordem", () => {
    const opcoes = opcoesDeMercado(
      [],
      [],
      [preco(3, "n2", "Bom Preço"), preco(1, "n2", "Bom Preço"), preco(2, "n3", "Atacado")],
    );

    expect(opcoes.map((opcao) => opcao.id)).toEqual(["n3", "n2"]);
  });

  it("sem nada, nenhuma opção", () => {
    expect(opcoesDeMercado([], [], [])).toEqual([]);
  });
});
