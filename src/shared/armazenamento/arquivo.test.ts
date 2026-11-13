import { describe, expect, it } from "vitest";
import {
  identificacaoDoArquivo,
  lerArquivo,
  limiteDoArquivo,
  montarArquivo,
  versaoDoArquivo,
} from "./arquivo";

const agora = new Date("2026-11-11T15:30:00.000Z");
const lista = { id: "00000000-0000-4000-8000-000000000001", nome: "Novembro de 2026" };
const item = { id: "00000000-0000-4000-8000-000000000010", nome: "Arroz" };
const mercado = { id: "00000000-0000-4000-8000-000000000100", nome: "Mercadinho" };
const preco = { id: "00000000-0000-4000-8000-000000001000", produto: "Arroz" };

/** Um arquivo no formato certo, com os campos trocados pelo teste. */
function arquivo(campos: Record<string, unknown> = {}): string {
  return JSON.stringify({
    app: identificacaoDoArquivo,
    versao: versaoDoArquivo,
    exportadoEm: "2026-11-11T15:30:00.000Z",
    dados: {
      listas: [lista],
      itens: [item],
      mercadosProprios: [mercado],
      observacoesDePreco: [preco],
      associacoes: [],
    },
    ...campos,
  });
}

/** Um arquivo válido com exatamente o tamanho pedido, em bytes. */
function arquivoComTamanho(bytes: number): string {
  const base = arquivo();
  return base + " ".repeat(bytes - base.length);
}

// spec 0001 CA-04
describe("montarArquivo", () => {
  it("gera um JSON com a identificação do app, a versão do formato, a data e os dados", () => {
    const texto = montarArquivo(
      {
        listas: [lista],
        itens: [item],
        mercadosProprios: [mercado],
        observacoesDePreco: [preco],
        associacoes: [],
      },
      agora,
    );

    expect(texto.ok && JSON.parse(texto.valor)).toEqual({
      app: "cesta-certa",
      versao: 4,
      exportadoEm: "2026-11-11T15:30:00.000Z",
      dados: {
        listas: [lista],
        itens: [item],
        mercadosProprios: [mercado],
        observacoesDePreco: [preco],
        associacoes: [],
      },
    });
  });

  it("gera o arquivo mesmo sem nenhum registro", () => {
    const texto = montarArquivo(
      { listas: [], itens: [], mercadosProprios: [], observacoesDePreco: [], associacoes: [] },
      agora,
    );

    expect(texto.ok && JSON.parse(texto.valor).dados).toEqual({
      listas: [],
      itens: [],
      mercadosProprios: [],
      observacoesDePreco: [],
      associacoes: [],
    });
  });

  it("recusa a cópia que passaria do limite, porque ela não poderia ser importada de volta", () => {
    const enorme = { id: lista.id, nome: "a".repeat(limiteDoArquivo) };

    expect(
      montarArquivo(
        {
          listas: [enorme],
          itens: [],
          mercadosProprios: [],
          observacoesDePreco: [],
          associacoes: [],
        },
        agora,
      ),
    ).toEqual({
      ok: false,
      erro: { tipo: "arquivo.grande-demais" },
    });
  });

  it("o arquivo que ele gera é lido de volta com o mesmo conteúdo", () => {
    const texto = montarArquivo(
      {
        listas: [lista],
        itens: [item],
        mercadosProprios: [mercado],
        observacoesDePreco: [preco],
        associacoes: [],
      },
      agora,
    );

    expect(texto.ok && lerArquivo(texto.valor)).toEqual({
      ok: true,
      valor: {
        versao: 4,
        exportadoEm: "2026-11-11T15:30:00.000Z",
        conteudo: {
          listas: [lista],
          itens: [item],
          mercadosProprios: [mercado],
          observacoesDePreco: [preco],
          associacoes: [],
        },
      },
    });
  });
});

// spec 0001 CA-04
describe("lerArquivo: tamanho", () => {
  it("aceita o arquivo com exatamente 5 MB", () => {
    expect(limiteDoArquivo).toBe(5 * 1024 * 1024);
    expect(lerArquivo(arquivoComTamanho(limiteDoArquivo)).ok).toBe(true);
  });

  it("recusa o arquivo com um byte a mais que 5 MB", () => {
    expect(lerArquivo(arquivoComTamanho(limiteDoArquivo + 1))).toEqual({
      ok: false,
      erro: { tipo: "arquivo.grande-demais" },
    });
  });

  it("conta bytes, não caracteres: texto acentuado ocupa mais no arquivo", () => {
    // 3 milhões de "é" são 3 milhões de caracteres e 6 milhões de bytes.
    const texto = arquivo({ sobra: "é".repeat(3_000_000) });

    expect(texto.length).toBeLessThan(limiteDoArquivo);
    expect(lerArquivo(texto)).toEqual({ ok: false, erro: { tipo: "arquivo.grande-demais" } });
  });

  it("confere o tamanho antes de interpretar o conteúdo", () => {
    expect(lerArquivo("x".repeat(limiteDoArquivo + 1))).toEqual({
      ok: false,
      erro: { tipo: "arquivo.grande-demais" },
    });
  });
});

// spec 0001 CA-04
describe("lerArquivo: arquivo que não é JSON", () => {
  const inteiro = arquivo();

  it.each([
    ["vazio", ""],
    ["só espaços", "   "],
    ["texto qualquer", "lista de compras"],
    ["cortado no meio", inteiro.slice(0, inteiro.length / 2)],
    ["sem a última chave", inteiro.slice(0, -1)],
    ["com vírgula sobrando", `${inteiro.slice(0, -1)},}`],
    ["HTML", "<!doctype html><title>cesta</title>"],
    ["aninhado sem fechar", "[".repeat(100_000)],
  ])("recusa o arquivo %s", (_caso, texto) => {
    expect(lerArquivo(texto)).toEqual({ ok: false, erro: { tipo: "arquivo.ilegivel" } });
  });
});

// spec 0001 CA-04
describe("lerArquivo: JSON que não é uma cópia do app", () => {
  it.each([
    ["nulo", "null"],
    ["número", "42"],
    ["texto", '"cesta-certa"'],
    ["lista", "[]"],
    ["objeto vazio", "{}"],
    ["cópia de outro app", arquivo({ app: "outro-app" })],
    ["sem a identificação", arquivo({ app: undefined })],
    ["versão em texto", arquivo({ versao: "1" })],
    ["versão zero", arquivo({ versao: 0 })],
    ["versão negativa", arquivo({ versao: -1 })],
    ["versão quebrada", arquivo({ versao: 1.5 })],
    ["sem versão", arquivo({ versao: undefined })],
    ["sem a data da cópia", arquivo({ exportadoEm: undefined })],
    ["data que não é data", arquivo({ exportadoEm: "ontem" })],
    ["data impossível", arquivo({ exportadoEm: "2026-13-45T99:99:99.000Z" })],
    ["sem os dados", arquivo({ dados: undefined })],
    ["dados nulos", arquivo({ dados: null })],
    ["dados em lista", arquivo({ dados: [] })],
    ["sem as listas", arquivo({ dados: { itens: [] } })],
    ["sem os itens", arquivo({ dados: { listas: [] } })],
    ["listas que não são lista", arquivo({ dados: { listas: {}, itens: [] } })],
    ["itens que não são lista", arquivo({ dados: { listas: [], itens: "nenhum" } })],
    ["versão 2 sem os mercados próprios", arquivo({ versao: 2, dados: { listas: [], itens: [] } })],
    [
      "mercados próprios que não são lista",
      arquivo({
        dados: {
          listas: [],
          itens: [],
          mercadosProprios: {},
          observacoesDePreco: [],
          associacoes: [],
        },
      }),
    ],
    [
      "versão 3 sem os preços",
      arquivo({ versao: 3, dados: { listas: [], itens: [], mercadosProprios: [] } }),
    ],
    [
      "preços que não são lista",
      arquivo({
        dados: {
          listas: [],
          itens: [],
          mercadosProprios: [],
          observacoesDePreco: 7,
          associacoes: [],
        },
      }),
    ],
    [
      "versão 4 sem as associações das notas",
      arquivo({
        dados: { listas: [], itens: [], mercadosProprios: [], observacoesDePreco: [] },
      }),
    ],
    [
      "associações que não são lista",
      arquivo({
        dados: {
          listas: [],
          itens: [],
          mercadosProprios: [],
          observacoesDePreco: [],
          associacoes: "nenhuma",
        },
      }),
    ],
  ])("recusa %s", (_caso, texto) => {
    expect(lerArquivo(texto)).toEqual({ ok: false, erro: { tipo: "arquivo.outro-formato" } });
  });

  it("não aceita os dados vindos de __proto__ no lugar dos campos de verdade", () => {
    const texto = arquivo().replace(
      '"dados":{"listas":[',
      '"dados":{"__proto__":{"listas":[],"itens":[]},"sobra":[',
    );
    const semItens = texto.replace('"itens":[{', '"outros":[{');

    expect(lerArquivo(semItens)).toEqual({ ok: false, erro: { tipo: "arquivo.outro-formato" } });
    expect(Object.hasOwn(Object.prototype, "listas")).toBe(false);
  });
});

// spec 0001 CA-04
describe("lerArquivo: versão do formato", () => {
  it.each([5, 6, 99])("recusa a versão %i, mais nova que a deste app, dizendo qual é", (versao) => {
    expect(lerArquivo(arquivo({ versao }))).toEqual({
      ok: false,
      erro: { tipo: "arquivo.versao-desconhecida", versao },
    });
  });

  it("olha a versão antes dos dados: uma cópia mais nova pode ter outro formato", () => {
    expect(lerArquivo(arquivo({ versao: 5, dados: "formato novo" }))).toEqual({
      ok: false,
      erro: { tipo: "arquivo.versao-desconhecida", versao: 5 },
    });
  });
});

// spec 0001 CA-04
describe("lerArquivo: campos a mais", () => {
  it("ignora o que não conhece no envelope e nos dados, e devolve só os armazéns do app", () => {
    const texto = arquivo({
      observacao: "editado à mão",
      dados: {
        listas: [lista],
        itens: [item],
        mercadosProprios: [],
        observacoesDePreco: [],
        associacoes: [],
        segredos: [{ id: "x" }],
      },
    });

    const lido = lerArquivo(texto);

    expect(lido.ok && lido.valor.conteudo).toEqual({
      listas: [lista],
      itens: [item],
      mercadosProprios: [],
      observacoesDePreco: [],
      associacoes: [],
    });
    expect(lido.ok && Object.keys(lido.valor)).toEqual(["versao", "exportadoEm", "conteudo"]);
  });

  it("entrega os registros como vieram, sem conferir o formato de cada um", () => {
    const texto = arquivo({
      dados: {
        listas: [42, null, "texto"],
        itens: [{}],
        mercadosProprios: [false],
        observacoesDePreco: [""],
        associacoes: [],
      },
    });

    const lido = lerArquivo(texto);

    expect(lido.ok && lido.valor.conteudo).toEqual({
      listas: [42, null, "texto"],
      itens: [{}],
      mercadosProprios: [false],
      observacoesDePreco: [""],
      associacoes: [],
    });
  });
});

// spec 0001 CA-04
describe("lerArquivo: versões anteriores", () => {
  it("lê a cópia da versão 1, de antes dos mercados próprios, com eles vazios", () => {
    const texto = arquivo({ versao: 1, dados: { listas: [lista], itens: [item] } });

    expect(lerArquivo(texto)).toEqual({
      ok: true,
      valor: {
        versao: 1,
        exportadoEm: "2026-11-11T15:30:00.000Z",
        conteudo: {
          listas: [lista],
          itens: [item],
          mercadosProprios: [],
          observacoesDePreco: [],
          associacoes: [],
        },
      },
    });
  });

  it("na versão 1, ignora mercados próprios que o arquivo traga", () => {
    const texto = arquivo({ versao: 1, dados: { listas: [], itens: [], mercadosProprios: [1] } });

    expect(lerArquivo(texto).ok && lerArquivo(texto)).toMatchObject({
      valor: { conteudo: { mercadosProprios: [] } },
    });
  });

  it("lê a cópia da versão 2, de antes dos preços, com eles vazios", () => {
    const texto = arquivo({
      versao: 2,
      dados: {
        listas: [lista],
        itens: [item],
        mercadosProprios: [mercado],
        observacoesDePreco: [1],
        associacoes: [],
      },
    });

    expect(lerArquivo(texto)).toEqual({
      ok: true,
      valor: {
        versao: 2,
        exportadoEm: "2026-11-11T15:30:00.000Z",
        conteudo: {
          listas: [lista],
          itens: [item],
          mercadosProprios: [mercado],
          observacoesDePreco: [],
          associacoes: [],
        },
      },
    });
  });

  it("lê a cópia da versão 3, de antes das associações das notas, com elas vazias", () => {
    const texto = arquivo({
      versao: 3,
      dados: {
        listas: [lista],
        itens: [item],
        mercadosProprios: [mercado],
        observacoesDePreco: [preco],
        associacoes: [1],
      },
    });

    expect(lerArquivo(texto)).toEqual({
      ok: true,
      valor: {
        versao: 3,
        exportadoEm: "2026-11-11T15:30:00.000Z",
        conteudo: {
          listas: [lista],
          itens: [item],
          mercadosProprios: [mercado],
          observacoesDePreco: [preco],
          associacoes: [],
        },
      },
    });
  });
});
