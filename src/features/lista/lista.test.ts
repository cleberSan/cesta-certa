import { describe, expect, it } from "vitest";
import { criarBancoEmMemoria } from "../../shared/armazenamento/memoria";
import {
  adicionarItem,
  chaveDoItem,
  conferirEstado,
  criarLista,
  duplicarLista,
  editarItem,
  estadoVazio,
  excluirLista,
  itensDaLista,
  lerItem,
  lerLista,
  limites,
  listasRecentes,
  marcarComprado,
  nomeDoMes,
  removerItem,
  renomearLista,
  restaurarItem,
  somarQuantidade,
  sugerirNome,
  type Contexto,
  type EntradaDoItem,
  type Estado,
  type Item,
  type Lista,
  type Mudanca,
} from "./lista";

const fuso = "America/Sao_Paulo";

const id = (numero: number) => `00000000-0000-4000-8000-${numero.toString(16).padStart(12, "0")}`;

/** Relógio fixo e ids em sequência, a partir do número dado. */
function contexto(data = "2026-11-10T12:00:00.000Z", primeiroId = 1000): Contexto {
  let proximo = primeiroId;
  return { agora: new Date(data), gerarId: () => id(proximo++), fuso };
}

function entrada(campos: Partial<EntradaDoItem> = {}): EntradaDoItem {
  return {
    nome: "Arroz",
    quantidade: "1",
    marca: "",
    tamanho: "",
    preferencia: "mais-barato",
    ...campos,
  };
}

function lista(numero: number, campos: Partial<Lista> = {}): Lista {
  return {
    id: id(numero),
    nome: "Novembro de 2026",
    criadaEm: "2026-11-01T10:00:00.000Z",
    atualizadaEm: "2026-11-01T10:00:00.000Z",
    ...campos,
  };
}

function item(numero: number, campos: Partial<Item> = {}): Item {
  return {
    id: id(numero),
    listaId: id(1),
    nome: "Arroz",
    quantidade: 1,
    marca: null,
    tamanho: null,
    preferencia: "mais-barato",
    comprado: false,
    ordem: 0,
    criadoEm: "2026-11-01T10:00:00.000Z",
    ...campos,
  };
}

/** Congela o estado inteiro: uma operação que alterasse a entrada estouraria exceção. */
function congelar(estado: Estado): Estado {
  estado.listas.forEach(Object.freeze);
  estado.itens.forEach(Object.freeze);
  Object.freeze(estado.listas);
  Object.freeze(estado.itens);
  return Object.freeze(estado);
}

const umaLista = () => congelar({ listas: [lista(1)], itens: [] });

function valor<T>(resultado: { ok: true; valor: T } | { ok: false; erro: unknown }): T {
  if (!resultado.ok) throw new Error(`Esperava sucesso, veio ${JSON.stringify(resultado.erro)}`);
  return resultado.valor;
}

function tipoDoErro(resultado: { ok: boolean; erro?: { tipo: string } }): string | undefined {
  return resultado.ok ? undefined : resultado.erro?.tipo;
}

/** O que a operação manda gravar, aplicado ao que estava guardado, dá o estado novo. */
async function esperarGravacaoIgualAoEstado(antes: Estado, mudanca: Mudanca) {
  const banco = criarBancoEmMemoria(antes);
  await banco.aplicar(mudanca.alteracoes);
  const guardado = valor(await banco.lerTudo());
  const porId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  expect([...(guardado.listas as Lista[])].sort(porId)).toEqual(
    [...mudanca.estado.listas].sort(porId),
  );
  expect([...(guardado.itens as Item[])].sort(porId)).toEqual(
    [...mudanca.estado.itens].sort(porId),
  );
}

// spec 0001 CA-01
describe("adicionarItem", () => {
  it("guarda um item só com nome e quantidade", async () => {
    const antes = umaLista();

    const mudanca = valor(adicionarItem(antes, id(1), entrada({ quantidade: "2" }), contexto()));

    expect(mudanca.item).toEqual({
      id: id(1000),
      listaId: id(1),
      nome: "Arroz",
      quantidade: 2,
      marca: null,
      tamanho: null,
      preferencia: "mais-barato",
      comprado: false,
      ordem: 0,
      criadoEm: "2026-11-10T12:00:00.000Z",
    });
    expect(mudanca.estado.itens).toEqual([mudanca.item]);
    await esperarGravacaoIgualAoEstado(antes, mudanca);
  });

  it("guarda marca, tamanho e preferência quando a pessoa informa", () => {
    const mudanca = valor(
      adicionarItem(
        umaLista(),
        id(1),
        entrada({
          nome: "Café",
          marca: "Marca Exemplo",
          tamanho: "500 g",
          preferencia: "so-esta-marca",
        }),
        contexto(),
      ),
    );

    expect(mudanca.item).toMatchObject({
      nome: "Café",
      marca: "Marca Exemplo",
      tamanho: "500 g",
      preferencia: "so-esta-marca",
    });
  });

  it("limpa espaços e caracteres invisíveis do que foi digitado", () => {
    const mudanca = valor(
      adicionarItem(
        umaLista(),
        id(1),
        entrada({ nome: "  Arroz \n branco ", quantidade: " 07 ", marca: "  ", tamanho: " 5 kg " }),
        contexto(),
      ),
    );

    expect(mudanca.item).toMatchObject({
      nome: "Arroz branco",
      quantidade: 7,
      marca: null,
      tamanho: "5 kg",
    });
  });

  it("marca a lista como atualizada agora, sem mexer no resto dela", () => {
    const mudanca = valor(adicionarItem(umaLista(), id(1), entrada(), contexto()));

    expect(mudanca.estado.listas).toEqual([lista(1, { atualizadaEm: "2026-11-10T12:00:00.000Z" })]);
  });

  it("põe cada item novo depois dos que já estão na lista", () => {
    const antes = congelar({
      listas: [lista(1), lista(2)],
      itens: [item(10, { ordem: 4 }), item(11, { ordem: 9, listaId: id(2), nome: "Sal" })],
    });

    const mudanca = valor(adicionarItem(antes, id(1), entrada({ nome: "Feijão" }), contexto()));

    expect(mudanca.item.ordem).toBe(5);
  });

  it.each([
    ["nome vazio", { nome: "" }, "item.nome-vazio"],
    ["nome só com espaços", { nome: " \n\t " }, "item.nome-vazio"],
    ["nome grande demais", { nome: "a".repeat(limites.nomeDoItem + 1) }, "item.nome-grande"],
    ["quantidade vazia", { quantidade: "" }, "item.quantidade-invalida"],
    ["quantidade zero", { quantidade: "0" }, "item.quantidade-invalida"],
    ["quantidade negativa", { quantidade: "-1" }, "item.quantidade-invalida"],
    ["quantidade com vírgula", { quantidade: "1,5" }, "item.quantidade-invalida"],
    ["quantidade com ponto", { quantidade: "1.5" }, "item.quantidade-invalida"],
    ["quantidade em notação científica", { quantidade: "1e2" }, "item.quantidade-invalida"],
    ["quantidade com letras", { quantidade: "dois" }, "item.quantidade-invalida"],
    ["quantidade acima do máximo", { quantidade: "1000" }, "item.quantidade-invalida"],
    ["quantidade enorme", { quantidade: "9".repeat(30) }, "item.quantidade-invalida"],
    ["marca grande demais", { marca: "m".repeat(limites.marca + 1) }, "item.marca-grande"],
    ["tamanho grande demais", { tamanho: "t".repeat(limites.tamanho + 1) }, "item.tamanho-grande"],
    [
      "só esta marca, sem dizer a marca",
      { preferencia: "so-esta-marca" as const, marca: "  " },
      "item.marca-obrigatoria",
    ],
  ])("recusa %s sem alterar nada", (_caso, campos, tipo) => {
    const resultado = adicionarItem(umaLista(), id(1), entrada(campos), contexto());
    expect(tipoDoErro(resultado)).toBe(tipo);
  });

  it.each([
    ["nome", { nome: "a".repeat(limites.nomeDoItem) }],
    ["quantidade", { quantidade: String(limites.quantidade) }],
    ["marca", { marca: "m".repeat(limites.marca) }],
    ["tamanho", { tamanho: "t".repeat(limites.tamanho) }],
  ])("aceita %s no limite exato", (_campo, campos) => {
    expect(adicionarItem(umaLista(), id(1), entrada(campos), contexto()).ok).toBe(true);
  });

  it("recusa o item que passaria do máximo da lista", () => {
    const cheia = congelar({
      listas: [lista(1)],
      itens: Array.from({ length: limites.itensPorLista }, (_, indice) =>
        item(100 + indice, { nome: `Item ${indice}`, ordem: indice }),
      ),
    });

    const resultado = adicionarItem(cheia, id(1), entrada({ nome: "Mais um" }), contexto());

    expect(tipoDoErro(resultado)).toBe("item.limite");
  });

  it("recusa item para uma lista que não existe", () => {
    const resultado = adicionarItem(umaLista(), id(99), entrada(), contexto());
    expect(tipoDoErro(resultado)).toBe("lista.inexistente");
  });

  it("guarda como texto um nome com marcação HTML", () => {
    const nome = '<img src=x onerror="alert(1)">';
    const mudanca = valor(adicionarItem(umaLista(), id(1), entrada({ nome }), contexto()));
    expect(mudanca.item.nome).toBe(nome);
  });
});

// spec 0001 CA-03
describe("item com nome que já existe na lista", () => {
  const comBanana = () =>
    congelar({
      listas: [lista(1), lista(2)],
      itens: [item(10, { nome: "Banana", quantidade: 6 })],
    });

  it.each(["banana", "BANANAS", "  Bánána ", "bananas"])(
    "avisa que %j já existe e devolve o item da lista",
    (nome) => {
      const resultado = adicionarItem(comBanana(), id(1), entrada({ nome }), contexto());

      expect(resultado).toEqual({
        ok: false,
        erro: { tipo: "item.duplicado", existente: item(10, { nome: "Banana", quantidade: 6 }) },
      });
    },
  );

  it("trata limão e limões, pão e pães como o mesmo item", () => {
    const antes = congelar({
      listas: [lista(1)],
      itens: [item(10, { nome: "Limão" }), item(11, { nome: "Pães", ordem: 1 })],
    });

    expect(tipoDoErro(adicionarItem(antes, id(1), entrada({ nome: "limões" }), contexto()))).toBe(
      "item.duplicado",
    );
    expect(tipoDoErro(adicionarItem(antes, id(1), entrada({ nome: "pão" }), contexto()))).toBe(
      "item.duplicado",
    );
  });

  it("não avisa quando o nome igual está em outra lista", () => {
    const resultado = adicionarItem(comBanana(), id(2), entrada({ nome: "Banana" }), contexto());
    expect(resultado.ok).toBe(true);
  });

  it("não avisa para nomes só parecidos", () => {
    const resultado = adicionarItem(
      comBanana(),
      id(1),
      entrada({ nome: "Banana prata" }),
      contexto(),
    );
    expect(resultado.ok).toBe(true);
  });

  it("não confunde dois nomes feitos só de símbolos", () => {
    const antes = congelar({ listas: [lista(1)], itens: [item(10, { nome: "🍎" })] });

    expect(adicionarItem(antes, id(1), entrada({ nome: "🍌" }), contexto()).ok).toBe(true);
    expect(tipoDoErro(adicionarItem(antes, id(1), entrada({ nome: "🍎" }), contexto()))).toBe(
      "item.duplicado",
    );
    expect(chaveDoItem("🍎")).toBe("🍎");
  });

  it("avisa do nome repetido mesmo com a lista cheia, porque somar não cria item", () => {
    const cheia = congelar({
      listas: [lista(1)],
      itens: Array.from({ length: limites.itensPorLista }, (_, indice) =>
        item(100 + indice, { nome: `Item ${indice}`, ordem: indice }),
      ),
    });

    const resultado = adicionarItem(cheia, id(1), entrada({ nome: "item 7" }), contexto());

    expect(tipoDoErro(resultado)).toBe("item.duplicado");
  });

  it("soma as quantidades no item que já existe", async () => {
    const antes = comBanana();

    const mudanca = valor(somarQuantidade(antes, id(10), "4", contexto()));

    expect(mudanca.item).toEqual(item(10, { nome: "Banana", quantidade: 10 }));
    expect(mudanca.estado.itens).toEqual([mudanca.item]);
    expect(mudanca.estado.listas[0]?.atualizadaEm).toBe("2026-11-10T12:00:00.000Z");
    await esperarGravacaoIgualAoEstado(antes, mudanca);
  });

  it("volta o item somado para não comprado", () => {
    const antes = congelar({
      listas: [lista(1)],
      itens: [item(10, { nome: "Banana", quantidade: 6, comprado: true })],
    });

    const mudanca = valor(somarQuantidade(antes, id(10), "1", contexto()));

    expect(mudanca.item).toMatchObject({ quantidade: 7, comprado: false });
  });

  it("aceita a soma que dá exatamente o máximo e recusa a que passa", () => {
    const antes = congelar({
      listas: [lista(1)],
      itens: [item(10, { quantidade: limites.quantidade - 1 })],
    });

    expect(valor(somarQuantidade(antes, id(10), "1", contexto())).item.quantidade).toBe(
      limites.quantidade,
    );
    expect(tipoDoErro(somarQuantidade(antes, id(10), "2", contexto()))).toBe(
      "item.quantidade-acima",
    );
  });

  it("recusa somar quantidade inválida ou a um item que não existe", () => {
    expect(tipoDoErro(somarQuantidade(comBanana(), id(10), "muitas", contexto()))).toBe(
      "item.quantidade-invalida",
    );
    expect(tipoDoErro(somarQuantidade(comBanana(), id(99), "1", contexto()))).toBe(
      "item.inexistente",
    );
  });

  it("entra como outro item quando a pessoa prefere não somar", () => {
    const mudanca = valor(
      adicionarItem(comBanana(), id(1), entrada({ nome: "Bananas", quantidade: "3" }), contexto(), {
        aceitarDuplicado: true,
      }),
    );

    expect(itensDaLista(mudanca.estado, id(1)).map((atual) => atual.nome)).toEqual([
      "Banana",
      "Bananas",
    ]);
  });
});

// spec 0001 CA-02
describe("duplicarLista", () => {
  const comItens = () =>
    congelar({
      listas: [lista(1, { nome: "Outubro de 2026" }), lista(2, { nome: "Festa" })],
      itens: [
        item(10, {
          nome: "Arroz",
          quantidade: 2,
          marca: "Marca Exemplo",
          tamanho: "5 kg",
          preferencia: "so-esta-marca",
          comprado: true,
          ordem: 0,
        }),
        item(11, { nome: "Feijão", quantidade: 3, preferencia: "marca-boa", ordem: 1 }),
        item(12, { nome: "Refrigerante", listaId: id(2), comprado: true }),
      ],
    });

  it("cria uma lista nova com os mesmos itens, quantidades e preferências, nenhum comprado", async () => {
    const antes = comItens();

    const mudanca = valor(duplicarLista(antes, id(1), contexto()));

    expect(mudanca.listaId).toBe(id(1000));
    expect(mudanca.estado.listas).toContainEqual({
      id: id(1000),
      nome: "Novembro de 2026",
      criadaEm: "2026-11-10T12:00:00.000Z",
      atualizadaEm: "2026-11-10T12:00:00.000Z",
    });
    expect(itensDaLista(mudanca.estado, id(1000))).toEqual([
      {
        id: id(1001),
        listaId: id(1000),
        nome: "Arroz",
        quantidade: 2,
        marca: "Marca Exemplo",
        tamanho: "5 kg",
        preferencia: "so-esta-marca",
        comprado: false,
        ordem: 0,
        criadoEm: "2026-11-10T12:00:00.000Z",
      },
      {
        id: id(1002),
        listaId: id(1000),
        nome: "Feijão",
        quantidade: 3,
        marca: null,
        tamanho: null,
        preferencia: "marca-boa",
        comprado: false,
        ordem: 1,
        criadoEm: "2026-11-10T12:00:00.000Z",
      },
    ]);
    await esperarGravacaoIgualAoEstado(antes, mudanca);
  });

  it("deixa a lista de origem e as outras como estavam", () => {
    const antes = comItens();

    const mudanca = valor(duplicarLista(antes, id(1), contexto()));

    expect(itensDaLista(mudanca.estado, id(1))).toEqual(itensDaLista(antes, id(1)));
    expect(itensDaLista(mudanca.estado, id(2))).toEqual(itensDaLista(antes, id(2)));
    expect(mudanca.estado.listas.slice(0, 2)).toEqual(antes.listas);
  });

  it("numera o nome quando o mês atual já tem lista", () => {
    const antes = congelar({
      listas: [lista(1), lista(2, { nome: "novembro de 2026 (2)" })],
      itens: [],
    });

    const mudanca = valor(duplicarLista(antes, id(1), contexto()));

    expect(mudanca.estado.listas.at(-1)?.nome).toBe("Novembro de 2026 (3)");
  });

  it("duplica uma lista vazia", () => {
    const mudanca = valor(duplicarLista(umaLista(), id(1), contexto()));
    expect(itensDaLista(mudanca.estado, mudanca.listaId)).toEqual([]);
    expect(mudanca.estado.listas).toHaveLength(2);
  });

  it("recusa duplicar uma lista que não existe ou passar do máximo de listas", () => {
    expect(tipoDoErro(duplicarLista(umaLista(), id(99), contexto()))).toBe("lista.inexistente");

    const cheio = congelar({
      listas: Array.from({ length: limites.listas }, (_, indice) =>
        lista(indice + 1, { nome: `Lista ${indice}` }),
      ),
      itens: [],
    });
    expect(tipoDoErro(duplicarLista(cheio, id(1), contexto()))).toBe("lista.limite");
  });
});

describe("editarItem", () => {
  const antes = () =>
    congelar({
      listas: [lista(1)],
      itens: [item(10, { nome: "Arroz", comprado: true, ordem: 3 }), item(11, { nome: "Sal" })],
    });

  it("troca os campos e mantém id, lista, posição, data e a marca de comprado", async () => {
    const mudanca = valor(
      editarItem(
        antes(),
        id(10),
        entrada({ nome: "Arroz integral", quantidade: "4", marca: "Boa", tamanho: "1 kg" }),
        contexto(),
      ),
    );

    expect(mudanca.item).toEqual(
      item(10, {
        nome: "Arroz integral",
        quantidade: 4,
        marca: "Boa",
        tamanho: "1 kg",
        comprado: true,
        ordem: 3,
      }),
    );
    expect(mudanca.estado.itens.map((atual) => atual.id)).toEqual([id(10), id(11)]);
    await esperarGravacaoIgualAoEstado(antes(), mudanca);
  });

  it("recusa campos inválidos e item que não existe", () => {
    expect(tipoDoErro(editarItem(antes(), id(10), entrada({ nome: "" }), contexto()))).toBe(
      "item.nome-vazio",
    );
    expect(tipoDoErro(editarItem(antes(), id(99), entrada(), contexto()))).toBe("item.inexistente");
  });

  it("trata como inexistente o item cuja lista sumiu", () => {
    const orfao = congelar({ listas: [lista(1)], itens: [item(10, { listaId: id(2) })] });
    expect(tipoDoErro(editarItem(orfao, id(10), entrada(), contexto()))).toBe("item.inexistente");
  });
});

describe("marcarComprado", () => {
  it("marca e desmarca o item", async () => {
    const antes = congelar({ listas: [lista(1)], itens: [item(10)] });

    const marcado = valor(marcarComprado(antes, id(10), true, contexto()));
    expect(marcado.item.comprado).toBe(true);
    await esperarGravacaoIgualAoEstado(antes, marcado);

    const desmarcado = valor(marcarComprado(marcado.estado, id(10), false, contexto()));
    expect(desmarcado.item.comprado).toBe(false);
  });

  it("recusa item que não existe", () => {
    expect(tipoDoErro(marcarComprado(umaLista(), id(10), true, contexto()))).toBe(
      "item.inexistente",
    );
  });
});

describe("removerItem e restaurarItem", () => {
  const antes = () =>
    congelar({
      listas: [lista(1)],
      itens: [
        item(10, { nome: "Arroz", ordem: 0 }),
        item(11, { nome: "Feijão", ordem: 1 }),
        item(12, { nome: "Sal", ordem: 2 }),
      ],
    });

  it("tira o item da lista e o devolve para desfazer", async () => {
    const mudanca = valor(removerItem(antes(), id(11), contexto()));

    expect(mudanca.item).toEqual(item(11, { nome: "Feijão", ordem: 1 }));
    expect(itensDaLista(mudanca.estado, id(1)).map((atual) => atual.nome)).toEqual([
      "Arroz",
      "Sal",
    ]);
    await esperarGravacaoIgualAoEstado(antes(), mudanca);
  });

  it("desfazer devolve o item no mesmo lugar", async () => {
    const removido = valor(removerItem(antes(), id(11), contexto()));

    const mudanca = valor(restaurarItem(removido.estado, removido.item, contexto()));

    expect(itensDaLista(mudanca.estado, id(1))).toEqual(itensDaLista(antes(), id(1)));
    await esperarGravacaoIgualAoEstado(removido.estado, mudanca);
  });

  it("desfazer duas vezes não duplica o item", () => {
    const removido = valor(removerItem(antes(), id(11), contexto()));
    const restaurado = valor(restaurarItem(removido.estado, removido.item, contexto()));

    const deNovo = valor(restaurarItem(restaurado.estado, removido.item, contexto()));

    expect(deNovo.estado).toEqual(restaurado.estado);
    expect(deNovo.alteracoes).toEqual({});
  });

  it("recusa desfazer quando a lista foi excluída ou encheu nesse meio-tempo", () => {
    const removido = valor(removerItem(antes(), id(11), contexto()));
    const semLista = valor(excluirLista(removido.estado, id(1), contexto()));
    expect(tipoDoErro(restaurarItem(semLista.estado, removido.item, contexto()))).toBe(
      "lista.inexistente",
    );

    const cheia = congelar({
      listas: [lista(1)],
      itens: Array.from({ length: limites.itensPorLista }, (_, indice) =>
        item(100 + indice, { nome: `Item ${indice}`, ordem: indice }),
      ),
    });
    expect(tipoDoErro(restaurarItem(cheia, removido.item, contexto()))).toBe("item.limite");
  });

  it("recusa remover item que não existe", () => {
    expect(tipoDoErro(removerItem(antes(), id(99), contexto()))).toBe("item.inexistente");
  });
});

describe("criarLista e renomearLista", () => {
  it("cria a lista com o nome limpo e diz qual abrir", async () => {
    const mudanca = valor(criarLista(estadoVazio, "  Churrasco \n de domingo ", contexto()));

    expect(mudanca.listaId).toBe(id(1000));
    expect(mudanca.estado.listas).toEqual([
      {
        id: id(1000),
        nome: "Churrasco de domingo",
        criadaEm: "2026-11-10T12:00:00.000Z",
        atualizadaEm: "2026-11-10T12:00:00.000Z",
      },
    ]);
    await esperarGravacaoIgualAoEstado(estadoVazio, mudanca);
  });

  it.each([
    ["vazio", "", "lista.nome-vazio"],
    ["só espaços", "   ", "lista.nome-vazio"],
    ["grande demais", "n".repeat(limites.nomeDaLista + 1), "lista.nome-grande"],
  ])("recusa nome %s ao criar e ao renomear", (_caso, nome, tipo) => {
    expect(tipoDoErro(criarLista(estadoVazio, nome, contexto()))).toBe(tipo);
    expect(tipoDoErro(renomearLista(umaLista(), id(1), nome, contexto()))).toBe(tipo);
  });

  it("aceita nome no limite exato", () => {
    const nome = "n".repeat(limites.nomeDaLista);
    expect(criarLista(estadoVazio, nome, contexto()).ok).toBe(true);
  });

  it("renomeia e marca a lista como atualizada", async () => {
    const antes = umaLista();

    const mudanca = valor(renomearLista(antes, id(1), "Compra grande", contexto()));

    expect(mudanca.estado.listas).toEqual([
      lista(1, { nome: "Compra grande", atualizadaEm: "2026-11-10T12:00:00.000Z" }),
    ]);
    expect(mudanca.listaId).toBe(id(1));
    await esperarGravacaoIgualAoEstado(antes, mudanca);
  });

  it("recusa renomear lista que não existe", () => {
    expect(tipoDoErro(renomearLista(umaLista(), id(99), "Outra", contexto()))).toBe(
      "lista.inexistente",
    );
  });
});

describe("excluirLista", () => {
  const duasListas = () =>
    congelar({
      listas: [
        lista(1, { nome: "Outubro de 2026", atualizadaEm: "2026-10-20T10:00:00.000Z" }),
        lista(2, { nome: "Novembro de 2026", atualizadaEm: "2026-11-05T10:00:00.000Z" }),
      ],
      itens: [
        item(10, { listaId: id(1) }),
        item(11, { listaId: id(2) }),
        item(12, { listaId: id(2) }),
      ],
    });

  it("apaga a lista com os itens dela e abre a mais recente das que sobraram", async () => {
    const antes = duasListas();

    const mudanca = valor(excluirLista(antes, id(2), contexto()));

    expect(mudanca.estado.listas.map((atual) => atual.id)).toEqual([id(1)]);
    expect(mudanca.estado.itens.map((atual) => atual.id)).toEqual([id(10)]);
    expect(mudanca.listaId).toBe(id(1));
    await esperarGravacaoIgualAoEstado(antes, mudanca);
  });

  it("ao apagar a última lista, deixa uma vazia com o nome do mês", async () => {
    const antes = congelar({ listas: [lista(1)], itens: [item(10)] });

    const mudanca = valor(excluirLista(antes, id(1), contexto()));

    expect(mudanca.estado).toEqual({
      listas: [
        {
          id: id(1000),
          nome: "Novembro de 2026",
          criadaEm: "2026-11-10T12:00:00.000Z",
          atualizadaEm: "2026-11-10T12:00:00.000Z",
        },
      ],
      itens: [],
    });
    expect(mudanca.listaId).toBe(id(1000));
    await esperarGravacaoIgualAoEstado(antes, mudanca);
  });

  it("recusa excluir lista que não existe", () => {
    expect(tipoDoErro(excluirLista(umaLista(), id(99), contexto()))).toBe("lista.inexistente");
  });
});

describe("consultas", () => {
  it("lista os itens pela ordem de entrada, com desempate estável", () => {
    const estado: Estado = {
      listas: [lista(1)],
      itens: [
        item(12, { nome: "C", ordem: 1, criadoEm: "2026-11-02T10:00:00.000Z" }),
        item(11, { nome: "B", ordem: 1, criadoEm: "2026-11-01T10:00:00.000Z" }),
        item(13, { nome: "D", ordem: 1, criadoEm: "2026-11-02T10:00:00.000Z" }),
        item(10, { nome: "A", ordem: 0 }),
        item(14, { nome: "De outra lista", listaId: id(2), ordem: 0 }),
      ],
    };

    expect(itensDaLista(estado, id(1)).map((atual) => atual.nome)).toEqual(["A", "B", "C", "D"]);
  });

  it("ordena as listas da mexida mais recente para a mais antiga", () => {
    const estado: Estado = {
      listas: [
        lista(1, { nome: "antiga", atualizadaEm: "2026-09-01T10:00:00.000Z" }),
        lista(2, { nome: "recente", atualizadaEm: "2026-11-09T10:00:00.000Z" }),
        lista(4, {
          nome: "empate, criada depois",
          atualizadaEm: "2026-10-01T10:00:00.000Z",
          criadaEm: "2026-10-01T10:00:00.000Z",
        }),
        lista(3, {
          nome: "empate, criada antes",
          atualizadaEm: "2026-10-01T10:00:00.000Z",
          criadaEm: "2026-09-15T10:00:00.000Z",
        }),
      ],
      itens: [],
    };

    expect(listasRecentes(estado).map((atual) => atual.nome)).toEqual([
      "recente",
      "empate, criada depois",
      "empate, criada antes",
      "antiga",
    ]);
    expect(listasRecentes(estadoVazio)).toEqual([]);
  });

  it("dá o nome do mês no fuso pedido", () => {
    // 1h da manhã de 1º de dezembro em UTC ainda é 30 de novembro em São Paulo.
    const virada = new Date("2026-12-01T01:00:00.000Z");
    expect(nomeDoMes(virada, "America/Sao_Paulo")).toBe("Novembro de 2026");
    expect(nomeDoMes(virada, "UTC")).toBe("Dezembro de 2026");
    expect(nomeDoMes(virada)).toMatch(/^(Novembro|Dezembro) de 2026$/);
  });

  it("sugere o mês atual e numera quando o nome já está em uso", () => {
    const agora = { agora: new Date("2026-03-15T12:00:00.000Z"), fuso };
    expect(sugerirNome(estadoVazio, agora)).toBe("Março de 2026");
    expect(sugerirNome({ listas: [lista(1, { nome: "MARÇO DE 2026" })], itens: [] }, agora)).toBe(
      "Março de 2026 (2)",
    );
  });
});

describe("conferirEstado", () => {
  it("aceita o que as operações gravam", () => {
    let estado = valor(criarLista(estadoVazio, "Novembro de 2026", contexto())).estado;
    const listaId = estado.listas[0]!.id;
    estado = valor(
      adicionarItem(
        estado,
        listaId,
        entrada({ marca: "Boa", tamanho: "5 kg", preferencia: "marca-boa" }),
        contexto("2026-11-10T12:00:01.000Z", 2000),
      ),
    ).estado;

    expect(conferirEstado(estado)).toEqual({ estado, recusados: 0 });
  });

  it("aceita conteúdo vazio", () => {
    expect(conferirEstado({ listas: [], itens: [] })).toEqual({
      estado: estadoVazio,
      recusados: 0,
    });
  });

  it("remonta cada registro só com os campos conhecidos", () => {
    const comSobra = {
      listas: [{ ...lista(1), dono: "alguém", __proto__: { admin: true } }],
      itens: [{ ...item(10), preco: 999, constructor: "x" }],
    };

    const { estado, recusados } = conferirEstado(comSobra);

    expect(recusados).toBe(0);
    expect(estado).toEqual({ listas: [lista(1)], itens: [item(10)] });
    expect(Object.keys(estado.listas[0]!)).toEqual(["id", "nome", "criadaEm", "atualizadaEm"]);
    expect(Object.keys(estado.itens[0]!)).toHaveLength(10);
  });

  it("deixa de fora e conta registro inválido, id repetido e item sem lista", () => {
    const { estado, recusados } = conferirEstado({
      listas: [lista(1), lista(1, { nome: "Repetida" }), { id: "x" }, null],
      itens: [
        item(10),
        item(10, { nome: "Repetido" }),
        item(11, { listaId: id(2) }),
        item(12, { quantidade: 0 }),
        "texto",
      ],
    });

    expect(estado).toEqual({ listas: [lista(1)], itens: [item(10)] });
    expect(recusados).toBe(7);
  });

  it("deixa de fora o que passa dos limites", () => {
    const listas = Array.from({ length: limites.listas + 2 }, (_, indice) =>
      lista(indice + 1, { nome: `Lista ${indice}` }),
    );
    const itens = Array.from({ length: limites.itensPorLista + 3 }, (_, indice) =>
      item(1000 + indice, { nome: `Item ${indice}`, ordem: indice }),
    );

    const { estado, recusados } = conferirEstado({ listas, itens });

    expect(estado.listas).toHaveLength(limites.listas);
    expect(estado.itens).toHaveLength(limites.itensPorLista);
    expect(recusados).toBe(5);
  });

  it("limpa o texto dos registros lidos", () => {
    const { estado, recusados } = conferirEstado({
      listas: [lista(1, { nome: "  Novembro  " })],
      itens: [item(10, { nome: " Arroz\tbranco ", marca: "", tamanho: " 5 kg " })],
    });

    expect(recusados).toBe(0);
    expect(estado.listas[0]?.nome).toBe("Novembro");
    expect(estado.itens[0]).toMatchObject({ nome: "Arroz branco", marca: null, tamanho: "5 kg" });
  });
});

describe("lerLista e lerItem", () => {
  it.each([
    ["nulo", null],
    ["texto", "lista"],
    ["lista vazia de campos", {}],
    ["vetor", [lista(1)]],
    ["id que não é UUID", lista(1, { id: "1" })],
    ["id com maiúsculas", lista(1, { id: "ABCDEF00-0000-4000-8000-000000000001" })],
    ["nome que não é texto", { ...lista(1), nome: 42 }],
    ["nome vazio", lista(1, { nome: " " })],
    ["nome grande demais", lista(1, { nome: "n".repeat(limites.nomeDaLista + 1) })],
    ["data sem hora", lista(1, { criadaEm: "2026-11-01" })],
    ["data impossível", lista(1, { atualizadaEm: "2026-13-45T10:00:00.000Z" })],
    ["data que não é texto", { ...lista(1), criadaEm: 1762768800000 }],
  ])("lerLista recusa %s", (_caso, entradaInvalida) => {
    expect(lerLista(entradaInvalida)).toBeNull();
  });

  it.each([
    ["nulo", null],
    ["vetor", []],
    ["id inválido", item(10, { id: "item-1" })],
    ["lista inválida", item(10, { listaId: "lista-1" })],
    ["nome que não é texto", { ...item(10), nome: ["Arroz"] }],
    ["nome vazio", item(10, { nome: "" })],
    ["quantidade em texto", { ...item(10), quantidade: "2" }],
    ["quantidade quebrada", item(10, { quantidade: 1.5 })],
    ["quantidade zero", item(10, { quantidade: 0 })],
    ["quantidade negativa", item(10, { quantidade: -3 })],
    ["quantidade acima do máximo", item(10, { quantidade: limites.quantidade + 1 })],
    ["quantidade infinita", item(10, { quantidade: Number.POSITIVE_INFINITY })],
    ["quantidade que não é número", item(10, { quantidade: Number.NaN })],
    ["marca que não é texto", { ...item(10), marca: 7 }],
    ["marca ausente", { ...item(10), marca: undefined }],
    ["marca grande demais", item(10, { marca: "m".repeat(limites.marca + 1) })],
    ["tamanho que não é texto", { ...item(10), tamanho: {} }],
    ["tamanho grande demais", item(10, { tamanho: "t".repeat(limites.tamanho + 1) })],
    ["preferência desconhecida", { ...item(10), preferencia: "premium" }],
    ["só esta marca, sem marca", item(10, { preferencia: "so-esta-marca", marca: null })],
    ["comprado que não é booleano", { ...item(10), comprado: "sim" }],
    ["ordem negativa", item(10, { ordem: -1 })],
    ["ordem quebrada", item(10, { ordem: 0.5 })],
    ["ordem em texto", { ...item(10), ordem: "0" }],
    ["data inválida", item(10, { criadoEm: "ontem" })],
  ])("lerItem recusa %s", (_caso, entradaInvalida) => {
    expect(lerItem(entradaInvalida)).toBeNull();
  });

  it("lê registros válidos", () => {
    expect(lerLista(lista(1))).toEqual(lista(1));
    const completo = item(10, {
      marca: "Boa",
      tamanho: "1 kg",
      preferencia: "so-esta-marca",
      comprado: true,
      ordem: 7,
      quantidade: limites.quantidade,
    });
    expect(lerItem(completo)).toEqual(completo);
  });
});
