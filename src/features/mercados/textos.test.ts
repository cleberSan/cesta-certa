import { describe, expect, it } from "vitest";
import { tiposDeMercado } from "../../shared/contratos/mercados";
import {
  contarMercados,
  descreverTipo,
  mensagemDaCarga,
  mensagemDaLocalizacao,
  mesDaBase,
  resumoDoRaio,
} from "./textos";

// spec 0001 CA-07
describe("descreverTipo", () => {
  it("dá um nome para cada tipo da base", () => {
    expect(tiposDeMercado.map(descreverTipo)).toEqual([
      "Mercado de bairro",
      "Supermercado",
      "Atacarejo",
    ]);
  });
});

// spec 0001 CA-05
describe("mensagemDaLocalizacao", () => {
  it.each(["negada", "indisponivel", "sem-resposta"] as const)(
    "oferece outro caminho quando a localização falha (%s)",
    (erro) => {
      expect(mensagemDaLocalizacao(erro)).toMatch(/Escolha a cidade/);
    },
  );

  it("diz quanto tempo esperou", () => {
    expect(mensagemDaLocalizacao("sem-resposta")).toContain("10 segundos");
  });
});

describe("mensagemDaCarga", () => {
  const erros = ["sem-base", "sem-conexao", "base-invalida"] as const;

  it.each(erros)("explica a falha %s sem termo técnico", (erro) => {
    for (const oQue of ["mercados", "cidades"] as const) {
      const texto = mensagemDaCarga(erro, oQue);
      expect(texto.length).toBeGreaterThan(20);
      expect(texto).not.toMatch(/json|http|404|500|fetch/i);
    }
  });

  it("fala dos mercados por padrão e da lista de cidades quando é ela que falha", () => {
    expect(mensagemDaCarga("sem-conexao")).toContain("os mercados");
    expect(mensagemDaCarga("sem-conexao", "cidades")).toContain("a lista de cidades");
    expect(mensagemDaCarga("base-invalida")).toContain("Os mercados desta região");
    expect(mensagemDaCarga("base-invalida", "cidades")).toContain("A lista de cidades");
  });
});

describe("contarMercados", () => {
  it("usa singular e plural", () => {
    expect(contarMercados(0)).toBe("0 mercados");
    expect(contarMercados(1)).toBe("1 mercado");
    expect(contarMercados(2)).toBe("2 mercados");
  });

  it("separa milhares como no Brasil", () => {
    expect(contarMercados(1234)).toBe("1.234 mercados");
  });
});

describe("mesDaBase", () => {
  it("escreve o mês da geração por extenso", () => {
    expect(mesDaBase("2026-11-03T09:23:00Z")).toBe("novembro de 2026");
  });

  it("usa o horário de Brasília na virada do mês", () => {
    // 1º de dezembro às 01h UTC ainda é 30 de novembro em São Paulo.
    expect(mesDaBase("2026-12-01T01:00:00Z")).toBe("novembro de 2026");
  });
});

describe("resumoDoRaio", () => {
  it("resume quantos mercados e a ordem", () => {
    expect(resumoDoRaio(12, 5)).toBe("12 mercados em até 5 km, do mais perto ao mais longe.");
    expect(resumoDoRaio(1, 2)).toBe("1 mercado em até 2 km, do mais perto ao mais longe.");
  });

  it("diz quando não há nenhum", () => {
    expect(resumoDoRaio(0, 3)).toBe("Nenhum mercado da base em até 3 km.");
  });
});
