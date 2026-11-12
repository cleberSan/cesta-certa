import { describe, expect, it } from "vitest";
import { tiposDeMercado } from "../../shared/contratos/mercados";
import type { MercadoProprio } from "./proprios";
import {
  avisoDoCadastro,
  contarMercados,
  descreverTipo,
  mensagemDaCarga,
  mensagemDaLocalizacao,
  mensagemDoCadastro,
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

  it.each(["negada", "indisponivel", "sem-resposta"] as const)(
    "no cadastro de mercado, oferece o ponto da busca (%s)",
    (erro) => {
      expect(mensagemDaLocalizacao(erro, "cadastro")).toMatch(/adastre no ponto da busca/);
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

// spec 0001 CA-08
describe("mensagemDoCadastro", () => {
  const existente: MercadoProprio = {
    id: "11111111-1111-4111-8111-111111111111",
    nome: "Mercadinho do Bairro",
    tipo: "bairro",
    lat: -23.5,
    lon: -46.6,
    criadoEm: "2026-11-12T15:00:00.000Z",
  };

  it.each([
    [{ tipo: "nome-vazio" }, "Escreva o nome do mercado."],
    [{ tipo: "nome-longo" }, "O nome pode ter até 120 caracteres."],
    [{ tipo: "tipo-invalido" }, "Escolha o tipo do mercado."],
    [
      { tipo: "ponto-invalido" },
      "O lugar do mercado não veio certo. Escolha de novo onde ele fica.",
    ],
    [
      { tipo: "limite" },
      "Este aparelho já tem 300 mercados cadastrados, o máximo. Exclua um que não usa mais.",
    ],
    [{ tipo: "repetido", existente }, '"Mercadinho do Bairro" já está cadastrado neste lugar.'],
  ] as const)("explica %j", (erro, texto) => {
    expect(mensagemDoCadastro(erro)).toBe(texto);
  });
});

describe("avisoDoCadastro", () => {
  it("confirma o cadastro dentro do raio", () => {
    expect(avisoDoCadastro("Mercado Novo", 1.2, 5)).toBe("Mercado cadastrado: Mercado Novo.");
  });

  it("avisa quando o mercado ficou fora da distância máxima", () => {
    expect(avisoDoCadastro("Mercado Novo", 7.4, 5)).toBe(
      "Mercado cadastrado: Mercado Novo. Ele fica a 7,4 km do ponto da busca, fora da distância máxima de 5 km.",
    );
  });
});
