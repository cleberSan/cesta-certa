import { describe, expect, it } from "vitest";
import { limiteDoArquivo } from "../../shared/armazenamento/arquivo";
import type { Banco, ErroDoBanco, Registros } from "../../shared/armazenamento/banco";
import { criarBancoEmMemoria } from "../../shared/armazenamento/memoria";
import { falha } from "../../shared/resultado";
import { limites, type Item, type Lista } from "../lista/lista";
import type { MercadoProprio } from "../mercados/proprios";
import type { ObservacaoDePreco } from "../precos/precos";
import { conferirArquivo, exportar, importar, lerAparelho, nomeDaCopia } from "./copia";

const id = (numero: number) => `00000000-0000-4000-8000-${numero.toString(16).padStart(12, "0")}`;
const agora = new Date("2026-11-11T15:30:00.000Z");
const fuso = "America/Sao_Paulo";

const lista = (numero: number, campos: Partial<Lista> = {}): Lista => ({
  id: id(numero),
  nome: `Lista ${numero}`,
  criadaEm: "2026-11-01T10:00:00.000Z",
  atualizadaEm: "2026-11-02T10:00:00.000Z",
  ...campos,
});

const item = (numero: number, listaId: string, campos: Partial<Item> = {}): Item => ({
  id: id(numero),
  listaId,
  nome: `Item ${numero}`,
  quantidade: 1,
  marca: null,
  tamanho: null,
  preferencia: "mais-barato",
  comprado: false,
  ordem: 0,
  criadoEm: "2026-11-01T10:00:00.000Z",
  ...campos,
});

const novembro = lista(1, { nome: "Novembro de 2026" });
const dezembro = lista(2, { nome: "Dezembro de 2026" });
const arroz = item(10, novembro.id, {
  nome: "Arroz",
  quantidade: 2,
  marca: "Marca Exemplo",
  tamanho: "5 kg",
  preferencia: "so-esta-marca",
  comprado: true,
});
const feijao = item(11, novembro.id, { nome: "Feijão", ordem: 1 });
const cafe = item(12, dezembro.id, { nome: "Café", preferencia: "marca-boa", marca: "Outra" });

const mercadinho: MercadoProprio = {
  id: id(200),
  nome: "Mercadinho do Bairro",
  tipo: "bairro",
  lat: -23.5503,
  lon: -46.6339,
  criadoEm: "2026-11-05T10:00:00.000Z",
};

const precoDoArroz: ObservacaoDePreco = {
  id: id(300),
  produto: "Arroz",
  marca: "Marca Exemplo",
  tamanho: "5 kg",
  descricao: null,
  precoCentavos: 2590,
  minimoAtacado: null,
  mercadoId: mercadinho.id,
  mercadoNome: mercadinho.nome,
  fonte: "digitado",
  vistoEm: "2026-11-10",
  nota: null,
  criadoEm: "2026-11-10T12:00:00.000Z",
};

const guardado: Registros = {
  listas: [novembro, dezembro],
  itens: [arroz, feijao, cafe],
  mercadosProprios: [mercadinho],
  observacoesDePreco: [precoDoArroz],
};

/** O texto de um arquivo de cópia, com os dados trocados pelo teste. */
function arquivo(dados: {
  listas: readonly unknown[];
  itens: readonly unknown[];
  mercadosProprios?: readonly unknown[];
  observacoesDePreco?: readonly unknown[];
}): string {
  return JSON.stringify({
    app: "cesta-certa",
    versao: 3,
    exportadoEm: "2026-11-11T15:30:00.000Z",
    dados: {
      listas: dados.listas,
      itens: dados.itens,
      mercadosProprios: dados.mercadosProprios ?? [],
      observacoesDePreco: dados.observacoesDePreco ?? [],
    },
  });
}

/** Banco em memória em que uma das operações falha. */
function bancoQueFalha(operacao: keyof Banco, motivo: ErroDoBanco, inicial?: Registros): Banco {
  return { ...criarBancoEmMemoria(inicial), [operacao]: async () => falha(motivo) };
}

/** O que vai na cópia: listas, itens, mercados cadastrados e preços. */
async function conteudo(banco: Banco) {
  const lido = await banco.lerTudo();
  return lido.ok
    ? {
        listas: lido.valor.listas,
        itens: lido.valor.itens,
        mercadosProprios: lido.valor.mercadosProprios,
        observacoesDePreco: lido.valor.observacoesDePreco,
      }
    : null;
}

const ponto = { id: "ponto", lat: -23.5505, lon: -46.6333, origem: "localizacao" };

// spec 0001 CA-04
describe("exportar", () => {
  it("gera o arquivo com tudo o que está guardado no aparelho", async () => {
    const copia = await exportar(criarBancoEmMemoria(guardado), agora, fuso);

    expect(copia.ok && JSON.parse(copia.valor.texto)).toEqual({
      app: "cesta-certa",
      versao: 3,
      exportadoEm: "2026-11-11T15:30:00.000Z",
      dados: guardado,
    });
    expect(copia.ok && copia.valor.resumo).toEqual({ listas: 2, itens: 3, mercados: 1, precos: 1 });
    expect(copia.ok && copia.valor.recusados).toBe(0);
  });

  it("deixa o ponto e o raio fora do arquivo: a cópia pode ser compartilhada", async () => {
    const raio: { id: string; km: number } = { id: "raio", km: 5 };
    const banco = criarBancoEmMemoria({ ...guardado, ajustes: [ponto, raio] });

    const copia = await exportar(banco, agora, fuso);

    expect(copia.ok && Object.keys(JSON.parse(copia.valor.texto).dados)).toEqual([
      "listas",
      "itens",
      "mercadosProprios",
      "observacoesDePreco",
    ]);
    expect(copia.ok && copia.valor.texto).not.toContain("-23.5505");
  });

  it("dá ao arquivo um nome com a data do aparelho", async () => {
    const copia = await exportar(criarBancoEmMemoria(guardado), agora, fuso);

    expect(copia.ok && copia.valor.nome).toBe("cesta-certa-2026-11-11.json");
  });

  it("gera uma cópia vazia quando o aparelho não tem nada", async () => {
    const copia = await exportar(criarBancoEmMemoria(), agora, fuso);

    expect(copia.ok && JSON.parse(copia.valor.texto).dados).toEqual({
      listas: [],
      itens: [],
      mercadosProprios: [],
      observacoesDePreco: [],
    });
    expect(copia.ok && copia.valor.resumo).toEqual({ listas: 0, itens: 0, mercados: 0, precos: 0 });
  });

  it("deixa de fora o registro guardado fora do formato e conta quantos ficaram de fora", async () => {
    const estragado = { id: id(99), nome: "sem data" };
    const banco = criarBancoEmMemoria({ listas: [novembro, estragado], itens: [arroz] });

    const copia = await exportar(banco, agora, fuso);

    expect(copia.ok && JSON.parse(copia.valor.texto).dados).toEqual({
      listas: [novembro],
      itens: [arroz],
      mercadosProprios: [],
      observacoesDePreco: [],
    });
    expect(copia.ok && copia.valor.recusados).toBe(1);
  });

  it("lê o aparelho na hora do pedido, não o que estava lá antes", async () => {
    const banco = criarBancoEmMemoria({ listas: [novembro], itens: [] });
    await banco.aplicar({ itens: { gravar: [arroz] } });

    const copia = await exportar(banco, agora, fuso);

    expect(copia.ok && copia.valor.resumo).toEqual({ listas: 1, itens: 1, mercados: 0, precos: 0 });
  });

  it("diz que o armazenamento falhou quando não consegue ler o aparelho", async () => {
    const copia = await exportar(bancoQueFalha("lerTudo", "fechado", guardado), agora, fuso);

    expect(copia).toEqual({ ok: false, erro: { tipo: "armazenamento", motivo: "fechado" } });
  });

  it("recusa gerar uma cópia maior que o limite de importação", async () => {
    // O máximo de listas e de itens, com todos os campos de texto cheios de caracteres de 3 bytes.
    const listas = Array.from({ length: limites.listas }, (_, indice) => lista(indice + 1));
    const itens = listas.flatMap((dona, daLista) =>
      Array.from({ length: limites.itensPorLista }, (_, indice) =>
        item(1000 + daLista * limites.itensPorLista + indice, dona.id, {
          nome: "あ".repeat(limites.nomeDoItem),
          marca: "あ".repeat(limites.marca),
          tamanho: "あ".repeat(limites.tamanho),
          ordem: indice,
        }),
      ),
    );

    const copia = await exportar(criarBancoEmMemoria({ listas, itens }), agora, fuso);

    expect(copia).toEqual({ ok: false, erro: { tipo: "arquivo.grande-demais" } });
  });
});

// spec 0001 CA-04
describe("importar o que foi exportado", () => {
  it("restaura o mesmo estado em outro aparelho, no lugar do que havia lá", async () => {
    const origem = criarBancoEmMemoria(guardado);
    const antigo = lista(50, { nome: "Lista antiga" });
    const destino = criarBancoEmMemoria({
      listas: [antigo],
      itens: [item(51, antigo.id, { nome: "Sabão" })],
    });

    const copia = await exportar(origem, agora, fuso);
    const conferido = conferirArquivo(copia.ok ? copia.valor.texto : "");
    const importado = conferido.ok ? await importar(destino, conferido.valor) : null;

    expect(importado).toEqual({ ok: true, valor: { listas: 2, itens: 3, mercados: 1, precos: 1 } });
    expect(await conteudo(destino)).toEqual(await conteudo(origem));
  });

  it("a cópia do aparelho restaurado é igual à cópia de origem", async () => {
    const origem = criarBancoEmMemoria(guardado);
    const destino = criarBancoEmMemoria();

    const copia = await exportar(origem, agora, fuso);
    const conferido = conferirArquivo(copia.ok ? copia.valor.texto : "");
    if (conferido.ok) await importar(destino, conferido.valor);
    const deNovo = await exportar(destino, agora, fuso);

    expect(deNovo.ok && deNovo.valor.texto).toBe(copia.ok && copia.valor.texto);
  });

  it("não mexe no ponto e no raio guardados neste aparelho", async () => {
    const origem = await exportar(criarBancoEmMemoria(guardado), agora, fuso);
    const destino = criarBancoEmMemoria({ ajustes: [ponto] });

    const conferido = conferirArquivo(origem.ok ? origem.valor.texto : "");
    if (conferido.ok) await importar(destino, conferido.valor);

    const lido = await destino.lerTudo();
    expect(lido.ok && lido.valor.ajustes).toEqual([ponto]);
    expect(await conteudo(destino)).toEqual(guardado);
  });

  it("mostra o resumo e a data da cópia antes de gravar qualquer coisa", () => {
    const conferido = conferirArquivo(arquivo(guardado));

    expect(conferido.ok && conferido.valor.resumo).toEqual({
      listas: 2,
      itens: 3,
      mercados: 1,
      precos: 1,
    });
    expect(conferido.ok && conferido.valor.exportadoEm).toBe("2026-11-11T15:30:00.000Z");
  });

  it("aceita a cópia vazia: importar apaga o que havia", async () => {
    const destino = criarBancoEmMemoria(guardado);

    const conferido = conferirArquivo(arquivo({ listas: [], itens: [] }));
    if (conferido.ok) await importar(destino, conferido.valor);

    expect(await conteudo(destino)).toEqual({
      listas: [],
      itens: [],
      mercadosProprios: [],
      observacoesDePreco: [],
    });
  });

  it("mantém o item marcado como comprado, a marca, o tamanho e a preferência", async () => {
    const destino = criarBancoEmMemoria();

    const conferido = conferirArquivo(arquivo(guardado));
    if (conferido.ok) await importar(destino, conferido.valor);

    expect((await conteudo(destino))?.itens).toContainEqual(arroz);
  });
});

// spec 0001 CA-04
describe("conferirArquivo: arquivo recusado", () => {
  it.each([
    ["que não é JSON", "{", { tipo: "arquivo.ilegivel" }],
    ["cortado", arquivo(guardado).slice(0, 200), { tipo: "arquivo.ilegivel" }],
    ["de outro app", JSON.stringify({ app: "outro" }), { tipo: "arquivo.outro-formato" }],
    [
      "de versão mais nova",
      arquivo(guardado).replace('"versao":3', '"versao":4'),
      { tipo: "arquivo.versao-desconhecida", versao: 4 },
    ],
    ["maior que 5 MB", " ".repeat(limiteDoArquivo + 1), { tipo: "arquivo.grande-demais" }],
  ] as const)("recusa o arquivo %s e diz o motivo", (_caso, texto, erro) => {
    expect(conferirArquivo(texto)).toEqual({ ok: false, erro });
  });

  it.each([
    ["item com quantidade zero", { listas: [novembro], itens: [{ ...arroz, quantidade: 0 }] }, 1],
    [
      "item com quantidade em texto",
      { listas: [novembro], itens: [{ ...arroz, quantidade: "2" }] },
      1,
    ],
    ["item de uma lista que não veio no arquivo", { listas: [dezembro], itens: [arroz, cafe] }, 1],
    ["item sem nome", { listas: [novembro], itens: [{ ...arroz, nome: "   " }] }, 1],
    [
      "item com preferência desconhecida",
      { listas: [novembro], itens: [{ ...arroz, preferencia: "cara" }] },
      1,
    ],
    [
      "só esta marca, sem dizer a marca",
      { listas: [novembro], itens: [{ ...arroz, marca: null }] },
      1,
    ],
    [
      "lista com nome grande demais",
      { listas: [{ ...novembro, nome: "a".repeat(41) }], itens: [] },
      1,
    ],
    [
      "lista com identificador que não é UUID",
      { listas: [{ ...novembro, id: "1" }], itens: [] },
      1,
    ],
    ["lista com data inválida", { listas: [{ ...novembro, criadaEm: "hoje" }], itens: [] }, 1],
    ["duas listas com o mesmo identificador", { listas: [novembro, novembro], itens: [] }, 1],
    ["dois itens com o mesmo identificador", { listas: [novembro], itens: [arroz, arroz] }, 1],
    ["registros que não são objeto", { listas: [novembro, null, 42], itens: ["arroz"] }, 3],
    [
      "mercado cadastrado de tipo desconhecido",
      { listas: [], itens: [], mercadosProprios: [{ ...mercadinho, tipo: "feira" }] },
      1,
    ],
    [
      "dois mercados cadastrados com o mesmo identificador",
      { listas: [], itens: [], mercadosProprios: [mercadinho, mercadinho] },
      1,
    ],
    [
      "preço com valor negativo",
      { listas: [], itens: [], observacoesDePreco: [{ ...precoDoArroz, precoCentavos: -1 }] },
      1,
    ],
    [
      "preço de fonte desconhecida",
      { listas: [], itens: [], observacoesDePreco: [{ ...precoDoArroz, fonte: "encarte" }] },
      1,
    ],
  ])("recusa o arquivo inteiro quando tem %s", (_caso, dados, quantos) => {
    expect(conferirArquivo(arquivo(dados))).toEqual({
      ok: false,
      erro: { tipo: "arquivo.registros-invalidos", quantos },
    });
  });

  it("recusa o arquivo com mais listas do que o app aceita", () => {
    const listas = Array.from({ length: limites.listas + 1 }, (_, indice) => lista(indice + 1));

    expect(conferirArquivo(arquivo({ listas, itens: [] }))).toEqual({
      ok: false,
      erro: { tipo: "arquivo.registros-invalidos", quantos: 1 },
    });
  });

  it("recusa o arquivo com mais itens numa lista do que o app aceita", () => {
    const itens = Array.from({ length: limites.itensPorLista + 2 }, (_, indice) =>
      item(100 + indice, novembro.id, { ordem: indice }),
    );

    expect(conferirArquivo(arquivo({ listas: [novembro], itens }))).toEqual({
      ok: false,
      erro: { tipo: "arquivo.registros-invalidos", quantos: 2 },
    });
  });

  it("aceita o arquivo no limite de listas e de itens por lista", () => {
    const listas = Array.from({ length: limites.listas }, (_, indice) => lista(indice + 1));
    const itens = Array.from({ length: limites.itensPorLista }, (_, indice) =>
      item(100 + indice, id(1), { ordem: indice }),
    );

    const conferido = conferirArquivo(arquivo({ listas, itens }));

    expect(conferido.ok && conferido.valor.resumo).toEqual({
      listas: limites.listas,
      itens: limites.itensPorLista,
      mercados: 0,
      precos: 0,
    });
  });
});

// spec 0001 CA-04
describe("conferirArquivo: o que entra no aparelho", () => {
  it("guarda só os campos conhecidos de cada registro", async () => {
    const texto = arquivo({
      listas: [{ ...novembro, dono: "outra pessoa", admin: true }],
      itens: [{ ...arroz, preco: 10, constructor: { prototype: { poluido: true } } }],
    }).replace('"admin":true', '"admin":true,"__proto__":{"poluido":true}');
    const destino = criarBancoEmMemoria();

    const conferido = conferirArquivo(texto);
    if (conferido.ok) await importar(destino, conferido.valor);

    expect(await conteudo(destino)).toEqual({
      listas: [novembro],
      itens: [arroz],
      mercadosProprios: [],
      observacoesDePreco: [],
    });
    expect(Object.keys((await conteudo(destino))?.listas[0] ?? {})).toEqual(Object.keys(novembro));
    expect(({} as Record<string, unknown>)["poluido"]).toBeUndefined();
  });

  it("limpa espaços sobrando e caracteres invisíveis dos textos, como na digitação", () => {
    const texto = arquivo({
      listas: [{ ...novembro, nome: "  Novembro   de 2026 " }],
      itens: [{ ...arroz, nome: "Arroz\u200b  integral" }],
    });

    const conferido = conferirArquivo(texto);

    expect(conferido.ok && conferido.valor.dados.listas[0]?.nome).toBe("Novembro de 2026");
    expect(conferido.ok && conferido.valor.dados.itens[0]?.nome).toBe("Arroz integral");
  });

  it("mantém como texto um nome com marcação HTML", () => {
    const nome = '<img src=x onerror="alert(1)">';

    const conferido = conferirArquivo(arquivo({ listas: [{ ...novembro, nome }], itens: [] }));

    expect(conferido.ok && conferido.valor.dados.listas[0]?.nome).toBe(nome);
  });
});

// spec 0001 CA-04
describe("importar: falha ao gravar", () => {
  it.each<ErroDoBanco>(["sem-espaco", "fechado", "falhou"])(
    "diz que o armazenamento falhou (%s) e deixa o aparelho como estava",
    async (motivo) => {
      const antigo = {
        listas: [dezembro],
        itens: [cafe],
        mercadosProprios: [mercadinho],
        observacoesDePreco: [precoDoArroz],
      };
      const destino = bancoQueFalha("substituirTudo", motivo, antigo);
      const conferido = conferirArquivo(arquivo({ listas: [novembro], itens: [arroz] }));

      const importado = conferido.ok ? await importar(destino, conferido.valor) : null;

      expect(importado).toEqual({ ok: false, erro: { tipo: "armazenamento", motivo } });
      expect(await conteudo(destino)).toEqual(antigo);
    },
  );
});

describe("lerAparelho", () => {
  it("conta as listas, os itens e os registros fora do formato", async () => {
    const banco = criarBancoEmMemoria({ listas: [novembro], itens: [arroz, feijao, { id: "x" }] });

    const aparelho = await lerAparelho(banco);

    expect(aparelho.ok && aparelho.valor.resumo).toEqual({
      listas: 1,
      itens: 2,
      mercados: 0,
      precos: 0,
    });
    expect(aparelho.ok && aparelho.valor.recusados).toBe(1);
    expect(aparelho.ok && aparelho.valor.dados.itens).toEqual([arroz, feijao]);
  });

  it("repassa a falha do armazenamento", async () => {
    const aparelho = await lerAparelho(bancoQueFalha("lerTudo", "falhou"));

    expect(aparelho).toEqual({ ok: false, erro: { tipo: "armazenamento", motivo: "falhou" } });
  });
});

describe("nomeDaCopia", () => {
  it("usa a data do lugar onde a pessoa está, não a de Greenwich", () => {
    // 01h30 de 12/11 em UTC ainda é 22h30 de 11/11 em São Paulo.
    const madrugadaEmUtc = new Date("2026-11-12T01:30:00.000Z");

    expect(nomeDaCopia(madrugadaEmUtc, "America/Sao_Paulo")).toBe("cesta-certa-2026-11-11.json");
    expect(nomeDaCopia(madrugadaEmUtc, "UTC")).toBe("cesta-certa-2026-11-12.json");
  });

  it("escreve mês e dia com dois algarismos", () => {
    expect(nomeDaCopia(new Date("2026-03-05T12:00:00.000Z"), "UTC")).toBe(
      "cesta-certa-2026-03-05.json",
    );
  });

  it("sem fuso informado, usa o do aparelho", () => {
    expect(nomeDaCopia(agora)).toMatch(/^cesta-certa-\d{4}-\d{2}-\d{2}\.json$/);
  });
});

// spec 0001 CA-04 e CA-08
describe("mercados cadastrados na cópia", () => {
  it("lê a cópia da versão 1, de antes dos mercados cadastrados", async () => {
    const versao1 = JSON.stringify({
      app: "cesta-certa",
      versao: 1,
      exportadoEm: "2026-11-11T15:30:00.000Z",
      dados: { listas: [novembro], itens: [arroz] },
    });
    const destino = criarBancoEmMemoria(guardado);

    const conferido = conferirArquivo(versao1);
    if (conferido.ok) await importar(destino, conferido.valor);

    expect(conferido.ok && conferido.valor.resumo).toEqual({
      listas: 1,
      itens: 1,
      mercados: 0,
      precos: 0,
    });
    expect(await conteudo(destino)).toEqual({
      listas: [novembro],
      itens: [arroz],
      mercadosProprios: [],
      observacoesDePreco: [],
    });
  });

  it("deixa de fora o mercado guardado fora do formato e conta como recusado", async () => {
    const banco = criarBancoEmMemoria({
      mercadosProprios: [mercadinho, { id: "estragado" }],
    });

    const copia = await exportar(banco, agora, fuso);

    expect(copia.ok && JSON.parse(copia.valor.texto).dados.mercadosProprios).toEqual([mercadinho]);
    expect(copia.ok && copia.valor.recusados).toBe(1);
  });
});

// spec 0001 CA-04 e CA-15
describe("preços na cópia", () => {
  it("leva os preços e os traz de volta iguais", async () => {
    const copia = await exportar(criarBancoEmMemoria(guardado), agora, fuso);
    const destino = criarBancoEmMemoria();

    const conferido = copia.ok ? conferirArquivo(copia.valor.texto) : null;
    if (conferido?.ok) await importar(destino, conferido.valor);

    expect((await conteudo(destino))?.observacoesDePreco).toEqual([precoDoArroz]);
  });

  it("lê a cópia da versão 2, de antes dos preços, e apaga os preços do aparelho", async () => {
    const versao2 = JSON.stringify({
      app: "cesta-certa",
      versao: 2,
      exportadoEm: "2026-11-11T15:30:00.000Z",
      dados: { listas: [novembro], itens: [arroz], mercadosProprios: [mercadinho] },
    });
    const destino = criarBancoEmMemoria(guardado);

    const conferido = conferirArquivo(versao2);
    if (conferido.ok) await importar(destino, conferido.valor);

    expect(conferido.ok && conferido.valor.resumo).toEqual({
      listas: 1,
      itens: 1,
      mercados: 1,
      precos: 0,
    });
    expect((await conteudo(destino))?.observacoesDePreco).toEqual([]);
  });

  it("deixa de fora o preço guardado fora do formato e conta como recusado", async () => {
    const banco = criarBancoEmMemoria({
      observacoesDePreco: [precoDoArroz, { ...precoDoArroz, id: id(301), vistoEm: "ontem" }],
    });

    const copia = await exportar(banco, agora, fuso);

    expect(copia.ok && JSON.parse(copia.valor.texto).dados.observacoesDePreco).toEqual([
      precoDoArroz,
    ]);
    expect(copia.ok && copia.valor.recusados).toBe(1);
  });
});
