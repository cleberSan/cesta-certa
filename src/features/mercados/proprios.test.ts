import { describe, expect, it } from "vitest";
import {
  cadastrarMercado,
  conferirMercadosProprios,
  excluirMercado,
  gravarMercado,
  lerMercadoProprio,
  limitesDoProprio,
  type MercadoProprio,
} from "./proprios";

const agora = new Date("2026-11-12T15:00:00.000Z");
let sequencia = 0;
const contexto = {
  agora,
  gerarId: () => `00000000-0000-4000-8000-${String((sequencia += 1)).padStart(12, "0")}`,
};
const ponto = { lat: -23.550312, lon: -46.633918 };

const mercado = (campos: Partial<MercadoProprio> = {}): MercadoProprio => ({
  id: "11111111-1111-4111-8111-111111111111",
  nome: "Mercadinho do Bairro",
  tipo: "bairro",
  lat: -23.5503,
  lon: -46.63392,
  criadoEm: "2026-11-12T15:00:00.000Z",
  ...campos,
});

// spec 0001 CA-08
describe("cadastrarMercado", () => {
  it("monta o mercado com nome limpo, tipo, ponto arredondado e data", () => {
    const resultado = cadastrarMercado(
      [],
      { nome: "  Mercadinho\tdo  Bairro ", tipo: "bairro", ponto },
      contexto,
    );
    expect(resultado).toEqual({
      ok: true,
      valor: {
        id: expect.stringMatching(/^00000000-/),
        nome: "Mercadinho do Bairro",
        tipo: "bairro",
        lat: -23.55031,
        lon: -46.63392,
        criadoEm: "2026-11-12T15:00:00.000Z",
      },
    });
  });

  it.each([
    ["vazio", "", "nome-vazio"],
    ["só espaços", "   ​ ", "nome-vazio"],
    ["longo demais", "M".repeat(limitesDoProprio.nome + 1), "nome-longo"],
  ])("recusa nome %s", (_caso, nome, tipo) => {
    expect(cadastrarMercado([], { nome, tipo: "bairro", ponto }, contexto)).toEqual({
      ok: false,
      erro: { tipo },
    });
  });

  it("aceita nome no limite", () => {
    const nome = "M".repeat(limitesDoProprio.nome);
    expect(cadastrarMercado([], { nome, tipo: "bairro", ponto }, contexto).ok).toBe(true);
  });

  it("recusa tipo que não existe", () => {
    expect(cadastrarMercado([], { nome: "Mercado", tipo: "feira", ponto }, contexto)).toEqual({
      ok: false,
      erro: { tipo: "tipo-invalido" },
    });
  });

  it.each([
    { lat: Number.NaN, lon: -46 },
    { lat: -91, lon: -46 },
    { lat: -23, lon: 181 },
  ])("recusa ponto fora do formato %j", (invalido) => {
    expect(
      cadastrarMercado([], { nome: "Mercado", tipo: "bairro", ponto: invalido }, contexto),
    ).toEqual({ ok: false, erro: { tipo: "ponto-invalido" } });
  });

  it("recusa passar do limite de mercados", () => {
    const cheios = Array.from({ length: limitesDoProprio.mercados }, (_, i) =>
      mercado({ id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`, nome: `M ${i}` }),
    );
    expect(cadastrarMercado(cheios, { nome: "Novo", tipo: "bairro", ponto }, contexto)).toEqual({
      ok: false,
      erro: { tipo: "limite" },
    });
  });

  it("avisa que o mercado já existe: mesmo nome, sem acento e maiúscula, a menos de 200 m", () => {
    const existente = mercado();
    expect(
      cadastrarMercado(
        [existente],
        { nome: "MERCADINHOS DO BAIRRO", tipo: "supermercado", ponto },
        contexto,
      ),
    ).toEqual({ ok: false, erro: { tipo: "repetido", existente } });
  });

  it("aceita o mesmo nome em outro lugar e outro nome no mesmo lugar", () => {
    const existente = mercado();
    const longe = { lat: ponto.lat + 0.01, lon: ponto.lon };
    expect(
      cadastrarMercado(
        [existente],
        { nome: existente.nome, tipo: "bairro", ponto: longe },
        contexto,
      ).ok,
    ).toBe(true);
    expect(
      cadastrarMercado([existente], { nome: "Outro Mercado", tipo: "bairro", ponto }, contexto).ok,
    ).toBe(true);
  });
});

// spec 0001 CA-04 e CA-08
describe("lerMercadoProprio", () => {
  it("lê o mercado guardado e deixa de fora campo a mais", () => {
    expect(lerMercadoProprio({ ...mercado(), extra: "<script>" })).toEqual(mercado());
  });

  it.each([
    ["que não é objeto", "texto"],
    ["sem id", { ...mercado(), id: undefined }],
    ["com id que não é UUID", { ...mercado(), id: "n123" }],
    ["sem nome", { ...mercado(), nome: undefined }],
    ["com nome vazio", { ...mercado(), nome: "" }],
    ["com nome sujo", { ...mercado(), nome: " Mercado " }],
    ["com nome longo", { ...mercado(), nome: "M".repeat(limitesDoProprio.nome + 1) }],
    ["com tipo desconhecido", { ...mercado(), tipo: "feira" }],
    ["com latitude em texto", { ...mercado(), lat: "-23.5" }],
    ["com longitude fora do mundo", { ...mercado(), lon: 200 }],
    ["com data fora do formato", { ...mercado(), criadoEm: "12/11/2026" }],
  ])("recusa o registro %s", (_caso, valor) => {
    expect(lerMercadoProprio(valor)).toBeNull();
  });
});

describe("conferirMercadosProprios", () => {
  it("conta os recusados e os ids repetidos", () => {
    const resultado = conferirMercadosProprios([mercado(), mercado(), { nome: "x" }]);
    expect(resultado).toEqual({ mercados: [mercado()], recusados: 2 });
  });

  it("para no limite de mercados", () => {
    const muitos = Array.from({ length: limitesDoProprio.mercados + 2 }, (_, i) =>
      mercado({ id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}` }),
    );
    const resultado = conferirMercadosProprios(muitos);
    expect(resultado.mercados).toHaveLength(limitesDoProprio.mercados);
    expect(resultado.recusados).toBe(2);
  });

  it("aceita lista vazia", () => {
    expect(conferirMercadosProprios([])).toEqual({ mercados: [], recusados: 0 });
  });
});

describe("alterações no aparelho", () => {
  it("grava e exclui só no armazém dos mercados próprios", () => {
    expect(gravarMercado(mercado())).toEqual({ mercadosProprios: { gravar: [mercado()] } });
    expect(excluirMercado("abc")).toEqual({ mercadosProprios: { apagar: ["abc"] } });
  });
});
