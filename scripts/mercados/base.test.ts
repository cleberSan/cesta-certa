import { describe, expect, it } from "vitest";
import { lerCelula, lerCidades, lerIndice } from "../../src/shared/contratos/mercados";
import {
  arquivosDaBase,
  conferirBase,
  medir,
  montarBase,
  orcamentoDaCelula,
  relatorio,
  type BaseMontada,
} from "./base";
import {
  atacadoDeAlimentos,
  atacadoDeOutroRamo,
  atacarejoPorContorno,
  cidadeGrande,
  cidadePequena,
  hortifruti,
  mercadinho,
  semNome,
  supermercado,
} from "./fixtures/overpass";

const geradoEm = new Date("2026-11-03T06:23:00.000Z");

function baseDeExemplo(): BaseMontada {
  return montarBase([
    {
      uf: "SP",
      elementos: [
        mercadinho,
        supermercado,
        atacarejoPorContorno,
        atacadoDeAlimentos,
        atacadoDeOutroRamo,
        semNome,
        cidadePequena,
        cidadeGrande,
      ],
    },
    // O mesmo supermercado na consulta da UF vizinha (divisa), e um mercado só do RJ.
    { uf: "RJ", elementos: [supermercado, hortifruti] },
  ]);
}

// spec 0001 CA-06, CA-07
describe("montarBase", () => {
  it("reparte os mercados em células de 1 grau, em ordem de célula e de id", () => {
    const base = baseDeExemplo();

    expect([...base.celulas.keys()]).toEqual(["-23_-44", "-23_-48", "-24_-47"]);
    expect(base.celulas.get("-24_-47")?.map((mercado) => mercado.id)).toEqual([
      "n101",
      "n505",
      "w202",
    ]);
    expect(base.celulas.get("-23_-48")?.map((mercado) => mercado.id)).toEqual(["r303"]);
    expect(base.celulas.get("-23_-44")?.map((mercado) => mercado.id)).toEqual(["n606"]);
  });

  it("conta uma vez o mercado que vem em duas UFs", () => {
    const base = baseDeExemplo();

    expect(base.repetidos).toBe(1);
    expect(base.porUf).toEqual(
      new Map([
        ["SP", 4],
        ["RJ", 1],
      ]),
    );
  });

  it("soma os descartes por motivo", () => {
    expect(baseDeExemplo().descartes).toEqual({
      "sem-nome": 1,
      "sem-ponto": 0,
      "outro-ramo": 1,
      "fora-do-formato": 0,
    });
  });

  it("ordena as cidades por UF e por nome, com acento na ordem do português", () => {
    const base = montarBase([
      { uf: "SP", elementos: [cidadeGrande, cidadePequena] },
      {
        uf: "AC",
        elementos: [{ ...cidadeGrande, id: 2001, tags: { place: "town", name: "Zeta" } }],
      },
    ]);

    expect(base.cidades.map((cidade) => `${cidade.uf} ${cidade.nome}`)).toEqual([
      "AC Zeta",
      "SP Águas Fictícias",
      "SP Cidade Exemplo",
    ]);
  });

  it("não repete a cidade que vem duas vezes na mesma UF", () => {
    const base = montarBase([{ uf: "SP", elementos: [cidadeGrande, cidadeGrande] }]);

    expect(base.cidades).toHaveLength(1);
  });
});

// spec 0001 CA-06, CA-07
describe("arquivosDaBase", () => {
  it("gera uma célula por arquivo, o índice e as cidades, que o app lê de volta iguais", () => {
    const base = baseDeExemplo();
    const arquivos = arquivosDaBase(base, geradoEm);

    expect([...arquivos.keys()]).toEqual([
      "mercados/-23_-44.json",
      "mercados/-23_-48.json",
      "mercados/-24_-47.json",
      "mercados/indice.json",
      "cidades.json",
    ]);
    for (const [celula, mercados] of base.celulas) {
      const lida = lerCelula(JSON.parse(arquivos.get(`mercados/${celula}.json`) ?? ""), celula);
      expect(lida).toEqual({ ok: true, valor: { mercados, recusados: 0 } });
    }
    expect(lerIndice(JSON.parse(arquivos.get("mercados/indice.json") ?? ""))).toEqual({
      ok: true,
      valor: {
        geradoEm: "2026-11-03T06:23:00.000Z",
        celulas: new Map([
          ["-23_-44", 1],
          ["-23_-48", 1],
          ["-24_-47", 3],
        ]),
      },
    });
    expect(lerCidades(JSON.parse(arquivos.get("cidades.json") ?? ""))).toEqual({
      ok: true,
      valor: { geradoEm: "2026-11-03T06:23:00.000Z", cidades: base.cidades, recusados: 0 },
    });
  });

  it("escreve JSON compacto", () => {
    const arquivos = arquivosDaBase(baseDeExemplo(), geradoEm);

    expect(arquivos.get("mercados/-23_-48.json")).toBe(
      '{"versao":1,"celula":"-23_-48","mercados":[{"id":"r303","nome":"Distribuidora Modelo","tipo":"atacarejo","lat":-22.9,"lon":-47.06}]}',
    );
  });
});

// spec 0001 CA-07
describe("medir e conferirBase", () => {
  it("mede o tamanho em bytes e comprimido de cada arquivo", () => {
    const tamanhos = medir(new Map([["mercados/0_0.json", "a".repeat(10_000)]]));

    expect(tamanhos).toEqual([
      { caminho: "mercados/0_0.json", bytes: 10_000, comprimido: expect.any(Number) },
    ]);
    expect(tamanhos[0]?.comprimido).toBeLessThan(200);
  });

  it("aceita a base sem problema nem aviso", () => {
    const base = baseDeExemplo();

    expect(conferirBase(base, medir(arquivosDaBase(base, geradoEm)), 5)).toEqual({
      problemas: [],
      avisos: [],
    });
  });

  it("recusa a UF que veio sem nenhum mercado", () => {
    const base = montarBase([
      { uf: "SP", elementos: [supermercado, cidadeGrande] },
      { uf: "AC", elementos: [] },
    ]);

    expect(conferirBase(base, [], null).problemas).toEqual(["AC veio sem nenhum mercado."]);
  });

  it("recusa queda de mais de 20% no total, e aceita exatamente 20%", () => {
    const base = baseDeExemplo();

    expect(conferirBase(base, [], 7).problemas).toEqual([
      "O total caiu de 7 para 5 mercados, mais de 20%.",
    ]);
    expect(conferirBase(base, [], 6.25).problemas).toEqual([]);
  });

  it("recusa a base sem nenhuma cidade", () => {
    const base = montarBase([{ uf: "SP", elementos: [supermercado] }]);

    expect(conferirBase(base, [], null).problemas).toEqual(["Nenhuma cidade veio na consulta."]);
  });

  it("avisa da célula acima da meta comprimida, sem barrar a publicação", () => {
    const conferencia = conferirBase(
      baseDeExemplo(),
      [
        { caminho: "mercados/-24_-47.json", bytes: 2_000_000, comprimido: orcamentoDaCelula + 1 },
        { caminho: "cidades.json", bytes: 2_000_000, comprimido: orcamentoDaCelula + 1 },
      ],
      null,
    );

    expect(conferencia.problemas).toEqual([]);
    expect(conferencia.avisos).toEqual([
      "mercados/-24_-47.json tem 300 KB comprimido, acima da meta de 300 KB.",
    ]);
  });
});

// spec 0001 CA-07
describe("relatorio", () => {
  it("resume totais, células maiores, UFs, descartes e a atribuição do OpenStreetMap", () => {
    const base = baseDeExemplo();
    const tamanhos = medir(arquivosDaBase(base, geradoEm));

    const texto = relatorio(base, tamanhos, { problemas: [], avisos: [] }, 4, geradoEm);

    expect(texto).toContain("## Base de mercados (OpenStreetMap), gerada em 2026-11-03");
    expect(texto).toContain("- Mercados: **5** (antes: 4)");
    expect(texto).toContain("- Células de 1 grau com mercado: **3**");
    expect(texto).toContain('- Cidades para "Escolher cidade": **2**');
    expect(texto).toContain("- Repetidos entre UFs: 1");
    expect(texto).toContain("sem nome nem marca 1");
    expect(texto).toContain("atacado de outro ramo 1");
    expect(texto).toMatch(/\| -24_-47 \| 3 \| [\d,]+ KB \| [\d,]+ KB \|/);
    expect(texto).toContain("SP 4 · RJ 1");
    expect(texto).toContain("ODbL 1.0");
    expect(texto).not.toContain("### Problemas");
    expect(texto).not.toContain("### Avisos");
  });

  it("lista avisos e problemas quando há", () => {
    const base = baseDeExemplo();

    const texto = relatorio(
      base,
      [],
      { problemas: ["AC veio sem nenhum mercado."], avisos: ["célula grande"] },
      null,
      geradoEm,
    );

    expect(texto).toContain("- Mercados: **5**\n");
    expect(texto).toContain("- Índice: - comprimido; cidades: - comprimido");
    expect(texto).toContain("### Avisos\n\n- célula grande");
    expect(texto).toContain(
      "### Problemas (a base não foi publicada)\n\n- AC veio sem nenhum mercado.",
    );
  });
});
