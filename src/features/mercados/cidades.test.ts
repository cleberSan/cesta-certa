import { describe, expect, it } from "vitest";
import type { Cidade } from "../../shared/contratos/mercados";
import { buscarCidades, limiteDeResultados, rotuloDaCidade } from "./cidades";

const cidade = (nome: string, uf: string): Cidade => ({ nome, uf, lat: -23, lon: -46 });

const cidades: Cidade[] = [
  cidade("Campinas", "SP"),
  cidade("Campina Grande", "PB"),
  cidade("São Paulo", "SP"),
  cidade("São José dos Campos", "SP"),
  cidade("Mogi das Cruzes", "SP"),
  cidade("Itapecerica da Serra", "SP"),
  cidade("Serra", "ES"),
];

const nomes = (lista: readonly Cidade[]) => lista.map((c) => c.nome);

// spec 0001 CA-05
describe("buscarCidades", () => {
  it("não busca com menos de 2 letras, para não listar o país inteiro", () => {
    expect(buscarCidades(cidades, "")).toEqual([]);
    expect(buscarCidades(cidades, "s")).toEqual([]);
    expect(buscarCidades(cidades, "  .  ")).toEqual([]);
  });

  it("ignora acento, maiúscula e pontuação", () => {
    expect(nomes(buscarCidades(cidades, "SAO PAULO"))).toEqual(["São Paulo"]);
    expect(nomes(buscarCidades(cidades, "são-paulo"))).toEqual(["São Paulo"]);
  });

  it("não tira o plural do nome: 'Campinas' não acha 'Campina Grande'", () => {
    expect(nomes(buscarCidades(cidades, "campinas"))).toEqual(["Campinas"]);
  });

  it("põe primeiro quem começa pelo termo, depois palavra que começa, depois o resto", () => {
    expect(nomes(buscarCidades(cidades, "camp"))).toEqual([
      "Campinas",
      "Campina Grande",
      "São José dos Campos",
    ]);
    expect(nomes(buscarCidades(cidades, "serra"))).toEqual(["Serra", "Itapecerica da Serra"]);
    expect(nomes(buscarCidades(cidades, "erra"))).toEqual(["Itapecerica da Serra", "Serra"]);
  });

  it("aceita o nome seguido da UF", () => {
    expect(nomes(buscarCidades(cidades, "serra es"))).toEqual(["Serra"]);
    expect(nomes(buscarCidades(cidades, "campina gr"))).toEqual(["Campina Grande"]);
  });

  it("acha a UF como palavra", () => {
    expect(nomes(buscarCidades(cidades, "pb"))).toEqual(["Campina Grande"]);
  });

  it("devolve vazio quando nada combina", () => {
    expect(buscarCidades(cidades, "xyz")).toEqual([]);
  });

  it("corta no limite de resultados", () => {
    const muitas = Array.from({ length: 30 }, (_, i) => cidade(`Santa ${i}`, "SC"));
    expect(buscarCidades(muitas, "santa")).toHaveLength(limiteDeResultados);
    expect(buscarCidades(muitas, "santa", 3)).toHaveLength(3);
  });
});

describe("rotuloDaCidade", () => {
  it("junta nome e UF", () => {
    expect(rotuloDaCidade(cidade("Serra", "ES"))).toBe("Serra, ES");
  });
});
