import { describe, expect, it } from "vitest";
import {
  atacadoDeAlimentos,
  atacadoDeOutroRamo,
  atacarejoPorContorno,
  cidadeGrande,
  cidadePequena,
  contornoSemCentro,
  hortifruti,
  mercadinho,
  padaria,
  resposta,
  semNome,
  supermercado,
  vila,
} from "./fixtures/overpass";
import { consultaDaUf, converterElemento, lerRespostaOverpass, ufs } from "./overpass";

// spec 0001 CA-07
describe("consultaDaUf", () => {
  it("pede as lojas de alimentos e as sedes de município dentro da UF, com centro dos contornos", () => {
    const consulta = consultaDaUf("SP");

    expect(consulta).toContain('area["ISO3166-2"="BR-SP"]["admin_level"="4"]->.uf;');
    expect(consulta).toContain(
      'nwr["shop"~"^(supermarket|wholesale|convenience|greengrocer)$"](area.uf);',
    );
    expect(consulta).toContain('node["place"~"^(city|town)$"](area.uf);');
    expect(consulta).toContain("[out:json][timeout:300];");
    expect(consulta.endsWith("out center tags;")).toBe(true);
  });

  it("recusa o que não é uma sigla de UF, para nada ser montado dentro da consulta", () => {
    expect(() => consultaDaUf('SP"];out;')).toThrow("UF inválida");
    expect(() => consultaDaUf("sp")).toThrow("UF inválida");
  });

  it("cobre as 27 UFs, sem repetição", () => {
    expect(new Set(ufs).size).toBe(27);
    expect(ufs).toContain("DF");
  });
});

// spec 0001 CA-07
describe("lerRespostaOverpass", () => {
  it("lê pontos, contornos com centro e etiquetas de texto", () => {
    const lida = lerRespostaOverpass(resposta([supermercado, atacarejoPorContorno]));

    expect(lida).toEqual({ ok: true, elementos: [supermercado, atacarejoPorContorno] });
  });

  it.each([
    ["HTML de fila cheia", "<html><body>rate_limited</body></html>"],
    ["JSON sem elementos", JSON.stringify({ version: 0.6 })],
    ["lista solta", "[]"],
    ["vazio", ""],
  ])("recusa %s", (_caso, texto) => {
    expect(lerRespostaOverpass(texto)).toEqual({ ok: false, erro: { tipo: "resposta-invalida" } });
  });

  it("trata o aviso de erro da Overpass como consulta incompleta, mesmo com status 200", () => {
    const texto = resposta([supermercado], {
      remark: 'runtime error: Query timed out in "query" at line 4 after 301 seconds.',
    });

    expect(lerRespostaOverpass(texto)).toEqual({
      ok: false,
      erro: {
        tipo: "consulta-incompleta",
        observacao: 'runtime error: Query timed out in "query" at line 4 after 301 seconds.',
      },
    });
  });

  it("aceita uma observação que não é erro", () => {
    const lida = lerRespostaOverpass(resposta([supermercado], { remark: "aviso qualquer" }));

    expect(lida.ok).toBe(true);
  });

  it("deixa de fora elementos fora do formato e etiquetas que não são texto", () => {
    const lida = lerRespostaOverpass(
      resposta([
        null,
        { type: "area", id: 1 },
        { type: "node", id: -5 },
        { type: "node", id: 1.5 },
        { type: "node", id: 7, lat: "x", lon: 1, tags: { shop: "supermarket", nivel: 3 } },
      ]),
    );

    expect(lida).toEqual({
      ok: true,
      elementos: [{ type: "node", id: 7, tags: { shop: "supermarket" } }],
    });
  });
});

// spec 0001 CA-07, CA-09
describe("converterElemento", () => {
  it("guarda nome, tipo, ponto com 5 casas, horário e site de um supermercado", () => {
    expect(converterElemento(supermercado, "SP")).toEqual({
      mercado: {
        id: "n101",
        nome: "Supermercado Exemplo",
        tipo: "supermercado",
        lat: -23.55051,
        lon: -46.63335,
        horario: "Mo-Sa 07:00-22:00; Su 08:00-20:00",
        site: "https://exemplo.invalid/loja",
      },
    });
  });

  it("usa o centro do contorno e reconhece atacarejo pelo nome", () => {
    expect(converterElemento(atacarejoPorContorno, "SP")).toEqual({
      mercado: { id: "w202", nome: "Atacadão Fictício", tipo: "atacarejo", lat: -23.6, lon: -46.7 },
    });
  });

  it("reconhece atacarejo pela marca", () => {
    const elemento = {
      ...supermercado,
      tags: { shop: "supermarket", name: "Loja 12", brand: "Rede Atacarejo Exemplo" },
    };

    expect(converterElemento(elemento, "SP")).toMatchObject({ mercado: { tipo: "atacarejo" } });
  });

  it("aceita atacado de alimentos e atacado sem ramo informado", () => {
    expect(converterElemento(atacadoDeAlimentos, "SP")).toMatchObject({
      mercado: { id: "r303", tipo: "atacarejo" },
    });
    const semRamo = { ...atacadoDeAlimentos, tags: { shop: "wholesale", name: "Atacado Modelo" } };
    expect(converterElemento(semRamo, "SP")).toMatchObject({ mercado: { tipo: "atacarejo" } });
  });

  it("deixa de fora atacado de outro ramo", () => {
    expect(converterElemento(atacadoDeOutroRamo, "SP")).toEqual({ descarte: "outro-ramo" });
  });

  it("chama de mercado de bairro a loja de conveniência e o hortifrúti, e usa a marca sem nome", () => {
    expect(converterElemento(mercadinho, "SP")).toEqual({
      mercado: {
        id: "n505",
        nome: "Mercadinho da Esquina",
        tipo: "bairro",
        lat: -23.55,
        lon: -46.64,
        site: "http://exemplo.invalid/",
      },
    });
    expect(converterElemento(hortifruti, "RJ")).toMatchObject({ mercado: { tipo: "bairro" } });
  });

  it("descarta site que não é http(s), mas guarda o mercado", () => {
    const convertido = converterElemento(hortifruti, "RJ");

    expect(convertido).toMatchObject({ mercado: { id: "n606" } });
    expect("mercado" in convertido && "site" in convertido.mercado).toBe(false);
  });

  it("deixa de fora mercado sem nome nem marca e contorno sem ponto", () => {
    expect(converterElemento(semNome, "SP")).toEqual({ descarte: "sem-nome" });
    expect(converterElemento(contornoSemCentro, "SP")).toEqual({ descarte: "sem-ponto" });
  });

  it("deixa de fora coordenada impossível", () => {
    const fora = { ...supermercado, lat: 123, lon: -46 };

    expect(converterElemento(fora, "SP")).toEqual({ descarte: "fora-do-formato" });
  });

  it("limpa caracteres de controle e corta horário longo demais", () => {
    const elemento = {
      ...supermercado,
      tags: {
        shop: "supermarket",
        name: "Mercado\u0000 <b>Teste</b>​",
        opening_hours: "x".repeat(201),
      },
    };

    expect(converterElemento(elemento, "SP")).toEqual({
      mercado: {
        id: "n101",
        nome: "Mercado <b>Teste</b>",
        tipo: "supermercado",
        lat: -23.55051,
        lon: -46.63335,
      },
    });
  });

  it("guarda a sede de município com a UF da consulta e o ponto com 4 casas", () => {
    expect(converterElemento(cidadeGrande, "SP")).toEqual({
      cidade: { nome: "Cidade Exemplo", uf: "SP", lat: -23.5507, lon: -46.6333 },
    });
    expect(converterElemento(cidadePequena, "SP")).toMatchObject({
      cidade: { nome: "Águas Fictícias" },
    });
  });

  it("ignora vila, cidade sem nome e loja de outro tipo", () => {
    expect(converterElemento(vila, "SP")).toEqual({ ignorado: true });
    expect(converterElemento({ ...cidadeGrande, tags: { place: "city" } }, "SP")).toEqual({
      ignorado: true,
    });
    expect(converterElemento({ ...cidadeGrande, type: "way" }, "SP")).toEqual({ ignorado: true });
    expect(converterElemento(padaria, "SP")).toEqual({ ignorado: true });
    expect(converterElemento({ type: "node", id: 1 }, "SP")).toEqual({ ignorado: true });
  });
});
