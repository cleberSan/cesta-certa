import { describe, expect, it } from "vitest";
import {
  caminhoDaCelula,
  caminhoDasCidades,
  caminhoDoIndice,
  celulaDe,
  ehIdDeCelula,
  lerCelula,
  lerCidade,
  lerCidades,
  lerIndice,
  lerMercado,
  limitesDaBase,
  siteSeguro,
  textoDaBase,
} from "./mercados";

const mercado = {
  id: "n101",
  nome: "Supermercado Exemplo",
  tipo: "supermercado",
  lat: -23.55051,
  lon: -46.63335,
  horario: "Mo-Sa 07:00-22:00",
  site: "https://exemplo.invalid/loja",
};

// spec 0001 CA-06
describe("celulaDe", () => {
  it.each([
    [-23.55, -46.63, "-24_-47"],
    [-23, -46, "-23_-46"],
    [-22.999999, -46.000001, "-23_-47"],
    [0.5, -0.5, "0_-1"],
    [-0, -0, "0_0"],
    [5.27, -73.98, "5_-74"],
    [-33.75, -53.39, "-34_-54"],
  ])("põe (%f, %f) na célula %s", (lat, lon, celula) => {
    expect(celulaDe(lat, lon)).toBe(celula);
  });

  it("dá os caminhos públicos da célula, do índice e das cidades", () => {
    expect(caminhoDaCelula("-24_-47")).toBe("/data/mercados/-24_-47.json");
    expect(caminhoDoIndice).toBe("/data/mercados/indice.json");
    expect(caminhoDasCidades).toBe("/data/cidades.json");
  });
});

// spec 0001 CA-06
describe("ehIdDeCelula", () => {
  it.each(["-24_-47", "0_0", "5_-74", "-90_-180", "89_179"])("aceita %s", (id) => {
    expect(ehIdDeCelula(id)).toBe(true);
  });

  it.each([
    "-0_0",
    "01_02",
    "90_0",
    "0_180",
    "-91_0",
    "a_b",
    "-24_-47.json",
    "../indice",
    "__proto__",
    "",
    42,
    null,
  ])("recusa %s", (id) => {
    expect(ehIdDeCelula(id)).toBe(false);
  });
});

// spec 0001 CA-09
describe("siteSeguro", () => {
  it.each([
    ["https://exemplo.invalid/loja", "https://exemplo.invalid/loja"],
    ["  http://exemplo.invalid  ", "http://exemplo.invalid/"],
  ])("aceita %s", (entrada, saida) => {
    expect(siteSeguro(entrada)).toBe(saida);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "ftp://exemplo.invalid",
    "https://usuario:senha@exemplo.invalid",
    "https://usuario@exemplo.invalid",
    "www.exemplo.invalid",
    "",
    `https://exemplo.invalid/${"a".repeat(limitesDaBase.site)}`,
  ])("recusa %s", (entrada) => {
    expect(siteSeguro(entrada)).toBeNull();
  });
});

describe("textoDaBase", () => {
  it("limpa e aceita até o limite", () => {
    expect(textoDaBase("  Mercado​  Exemplo ", 20)).toBe("Mercado Exemplo");
    expect(textoDaBase("a".repeat(20), 20)).toBe("a".repeat(20));
  });

  it("recusa vazio, longo demais e o que não é texto", () => {
    expect(textoDaBase("   ", 20)).toBeNull();
    expect(textoDaBase("a".repeat(21), 20)).toBeNull();
    expect(textoDaBase(42, 20)).toBeNull();
  });
});

// spec 0001 CA-07, CA-09
describe("lerMercado", () => {
  it("reconstrói o mercado e deixa de fora campo que não conhece", () => {
    expect(lerMercado({ ...mercado, telefone: "x", __proto__: { tipo: "atacarejo" } })).toEqual(
      mercado,
    );
  });

  it("guarda o mercado sem horário e sem site", () => {
    const simples = {
      id: mercado.id,
      nome: mercado.nome,
      tipo: mercado.tipo,
      lat: mercado.lat,
      lon: mercado.lon,
    };

    expect(lerMercado(simples)).toEqual(simples);
  });

  it("descarta site perigoso e horário fora do formato, mas guarda o mercado", () => {
    expect(lerMercado({ ...mercado, site: "javascript:alert(1)", horario: 3 })).toEqual({
      id: "n101",
      nome: "Supermercado Exemplo",
      tipo: "supermercado",
      lat: -23.55051,
      lon: -46.63335,
    });
  });

  it.each([
    ["nulo", null],
    ["lista", [mercado]],
    ["id sem tipo do OSM", { ...mercado, id: "101" }],
    ["id com zero na frente", { ...mercado, id: "n0101" }],
    ["id de área", { ...mercado, id: "a101" }],
    ["sem nome", { ...mercado, nome: "  " }],
    ["nome longo demais", { ...mercado, nome: "a".repeat(limitesDaBase.nome + 1) }],
    ["tipo desconhecido", { ...mercado, tipo: "padaria" }],
    ["latitude em texto", { ...mercado, lat: "-23.5" }],
    ["latitude impossível", { ...mercado, lat: -91 }],
    ["longitude infinita", { ...mercado, lon: Number.POSITIVE_INFINITY }],
    ["longitude que não é número", { ...mercado, lon: Number.NaN }],
  ])("recusa mercado %s", (_caso, valor) => {
    expect(lerMercado(valor)).toBeNull();
  });
});

// spec 0001 CA-07
describe("lerCelula", () => {
  const celula = { versao: 1, celula: "-24_-47", mercados: [mercado] };

  it("lê os mercados da célula pedida", () => {
    expect(lerCelula(celula, "-24_-47")).toEqual({
      ok: true,
      valor: { mercados: [mercado], recusados: 0 },
    });
  });

  it("deixa de fora e conta o registro fora do formato e o mercado de outra célula", () => {
    const valor = {
      ...celula,
      mercados: [mercado, { id: "x" }, { ...mercado, id: "n2", lat: -22.5 }],
    };

    expect(lerCelula(valor, "-24_-47")).toEqual({
      ok: true,
      valor: { mercados: [mercado], recusados: 2 },
    });
  });

  it("recusa versão desconhecida antes de olhar o resto", () => {
    expect(lerCelula({ versao: 2, mercados: "formato novo" }, "-24_-47")).toEqual({
      ok: false,
      erro: "versao",
    });
  });

  it.each([
    ["nulo", null],
    ["outra célula", { ...celula, celula: "-23_-47" }],
    ["mercados que não são lista", { ...celula, mercados: {} }],
    [
      "mercados demais",
      { ...celula, mercados: Array.from({ length: limitesDaBase.mercadosPorCelula + 1 }) },
    ],
  ])("recusa %s", (_caso, valor) => {
    expect(lerCelula(valor, "-24_-47")).toEqual({ ok: false, erro: "formato" });
  });
});

// spec 0001 CA-06, CA-07
describe("lerIndice", () => {
  const indice = {
    versao: 1,
    geradoEm: "2026-11-03T06:23:00.000Z",
    celulas: { "-24_-47": 3, "-23_-44": 1 },
  };

  it("lê a data e as células com mercado", () => {
    expect(lerIndice(indice)).toEqual({
      ok: true,
      valor: {
        geradoEm: "2026-11-03T06:23:00.000Z",
        celulas: new Map([
          ["-24_-47", 3],
          ["-23_-44", 1],
        ]),
      },
    });
  });

  it("recusa versão desconhecida", () => {
    expect(lerIndice({ ...indice, versao: 2 })).toEqual({ ok: false, erro: "versao" });
  });

  it.each([
    ["nulo", null],
    ["data que não é data", { ...indice, geradoEm: "novembro" }],
    ["data fora do padrão", { ...indice, geradoEm: "2026-11-03" }],
    ["células em lista", { ...indice, celulas: [] }],
    ["célula com nome estranho", { ...indice, celulas: { "../segredo": 1 } }],
    ["célula vazia", { ...indice, celulas: { "-24_-47": 0 } }],
    ["contagem quebrada", { ...indice, celulas: { "-24_-47": 1.5 } }],
    ["contagem em texto", { ...indice, celulas: { "-24_-47": "3" } }],
    [
      "células demais",
      {
        ...indice,
        celulas: Object.fromEntries(
          Array.from({ length: limitesDaBase.celulas + 1 }, (_, i) => [
            celulaDe(-89 + Math.floor(i / 300), -150 + (i % 300)),
            1,
          ]),
        ),
      },
    ],
  ])("recusa %s", (_caso, valor) => {
    expect(lerIndice(valor)).toEqual({ ok: false, erro: "formato" });
  });

  it("não aceita célula vinda de __proto__", () => {
    const texto =
      '{"versao":1,"geradoEm":"2026-11-03T06:23:00.000Z","celulas":{"__proto__":{"0_0":1}}}';

    expect(lerIndice(JSON.parse(texto))).toEqual({ ok: false, erro: "formato" });
  });
});

// spec 0001 CA-05
describe("lerCidades", () => {
  const cidade = { nome: "Cidade Exemplo", uf: "SP", lat: -23.5507, lon: -46.6333 };
  const arquivo = { versao: 1, geradoEm: "2026-11-03T06:23:00.000Z", cidades: [cidade] };

  it("lê as cidades e conta as que ficaram de fora", () => {
    expect(lerCidades({ ...arquivo, cidades: [cidade, { ...cidade, uf: "sp" }, 3] })).toEqual({
      ok: true,
      valor: { geradoEm: "2026-11-03T06:23:00.000Z", cidades: [cidade], recusados: 2 },
    });
  });

  it("recusa versão desconhecida e arquivo fora do formato", () => {
    expect(lerCidades({ ...arquivo, versao: 9 })).toEqual({ ok: false, erro: "versao" });
    expect(lerCidades({ ...arquivo, cidades: {} })).toEqual({ ok: false, erro: "formato" });
    expect(lerCidades([])).toEqual({ ok: false, erro: "formato" });
    expect(
      lerCidades({ ...arquivo, cidades: Array.from({ length: limitesDaBase.cidades + 1 }) }),
    ).toEqual({ ok: false, erro: "formato" });
  });

  it.each([
    ["sem nome", { ...cidade, nome: "" }],
    ["UF por extenso", { ...cidade, uf: "São Paulo" }],
    ["UF que não é texto", { ...cidade, uf: 35 }],
    ["latitude impossível", { ...cidade, lat: 100 }],
    ["longitude em texto", { ...cidade, lon: "-46" }],
  ])("recusa cidade %s", (_caso, valor) => {
    expect(lerCidade(valor)).toBeNull();
  });
});
