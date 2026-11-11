import type { Alteracoes } from "../../shared/armazenamento/banco";
import { falha, sucesso, type Resultado } from "../../shared/resultado";
import { chaveDeComparacao, limparTexto } from "../../shared/texto";

/**
 * Regras da lista de compras (spec 0001, CA-01 a CA-03), sem React e sem API do navegador.
 * Cada operação recebe o estado atual e devolve o estado novo junto com o que precisa ser
 * gravado no aparelho, ou o motivo da recusa. Nada aqui altera o estado recebido.
 */
export const limites = {
  listas: 60,
  itensPorLista: 200,
  nomeDaLista: 40,
  nomeDoItem: 60,
  marca: 40,
  tamanho: 20,
  quantidade: 999,
} as const;

export const preferencias = ["mais-barato", "marca-boa", "so-esta-marca"] as const;

export type Preferencia = (typeof preferencias)[number];

export interface Lista {
  readonly id: string;
  readonly nome: string;
  /** Datas em ISO 8601, UTC. */
  readonly criadaEm: string;
  readonly atualizadaEm: string;
}

export interface Item {
  readonly id: string;
  readonly listaId: string;
  readonly nome: string;
  /** Quantas embalagens ou unidades comprar: inteiro de 1 a 999. */
  readonly quantidade: number;
  readonly marca: string | null;
  /** Tamanho da embalagem como a pessoa escreveu ("5 kg", "12x1L"). */
  readonly tamanho: string | null;
  readonly preferencia: Preferencia;
  readonly comprado: boolean;
  /** Posição na lista: os itens aparecem na ordem em que entraram. */
  readonly ordem: number;
  readonly criadoEm: string;
}

export interface Estado {
  readonly listas: readonly Lista[];
  readonly itens: readonly Item[];
}

export const estadoVazio: Estado = { listas: [], itens: [] };

/** O que o formulário envia: tudo texto, como a pessoa digitou. */
export interface EntradaDoItem {
  readonly nome: string;
  readonly quantidade: string;
  readonly marca: string;
  readonly tamanho: string;
  readonly preferencia: Preferencia;
}

/** Relógio e gerador de identificador entram por parâmetro, para o teste controlar. */
export interface Contexto {
  readonly agora: Date;
  readonly gerarId: () => string;
  /** Fuso do nome do mês ("America/Sao_Paulo"); sem ele, vale o do aparelho. */
  readonly fuso?: string;
}

export interface Mudanca {
  readonly estado: Estado;
  readonly alteracoes: Alteracoes;
}

export interface MudancaComLista extends Mudanca {
  /** A lista que a tela deve mostrar depois da operação. */
  readonly listaId: string;
}

export interface MudancaComItem extends Mudanca {
  readonly item: Item;
}

export const tiposDeErro = [
  "lista.nome-vazio",
  "lista.nome-grande",
  "lista.limite",
  "lista.inexistente",
  "item.nome-vazio",
  "item.nome-grande",
  "item.quantidade-invalida",
  "item.quantidade-acima",
  "item.marca-grande",
  "item.marca-obrigatoria",
  "item.tamanho-grande",
  "item.limite",
  "item.inexistente",
] as const;

export type TipoDeErro = (typeof tiposDeErro)[number];

export type ErroDaLista =
  | { readonly tipo: TipoDeErro }
  /** Já existe um item com esse nome: a tela oferece somar as quantidades (CA-03). */
  | { readonly tipo: "item.duplicado"; readonly existente: Item };

type Campos = Pick<Item, "nome" | "quantidade" | "marca" | "tamanho" | "preferencia">;

const erro = (tipo: TipoDeErro): Resultado<never, ErroDaLista> => falha({ tipo });

// ---------------------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------------------

/** Itens de uma lista, na ordem em que entraram. */
export function itensDaLista(estado: Estado, listaId: string): readonly Item[] {
  return estado.itens
    .filter((item) => item.listaId === listaId)
    .sort((a, b) => a.ordem - b.ordem || comparar(a.criadoEm, b.criadoEm) || comparar(a.id, b.id));
}

/** Listas da mais recente para a mais antiga: a primeira é a que a tela abre. */
export function listasRecentes(estado: Estado): readonly Lista[] {
  return [...estado.listas].sort(
    (a, b) =>
      comparar(b.atualizadaEm, a.atualizadaEm) ||
      comparar(b.criadaEm, a.criadaEm) ||
      comparar(a.id, b.id),
  );
}

/** Mesmo nome para o app: sem diferença de maiúsculas, acentos e plural simples (CA-03). */
export function chaveDoItem(nome: string): string {
  return chaveDeComparacao(nome) || limparTexto(nome).toLowerCase();
}

/** "Novembro de 2026", no fuso informado ou no do aparelho. */
export function nomeDoMes(data: Date, fuso?: string): string {
  const texto = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    ...(fuso === undefined ? {} : { timeZone: fuso }),
  }).format(data);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Nome para uma lista nova: o mês atual, com "(2)", "(3)" se já houver uma com esse nome. */
export function sugerirNome(estado: Estado, contexto: Pick<Contexto, "agora" | "fuso">): string {
  const base = nomeDoMes(contexto.agora, contexto.fuso);
  const usados = new Set(estado.listas.map((lista) => lista.nome.toLowerCase()));
  let nome = base;
  for (let numero = 2; usados.has(nome.toLowerCase()); numero += 1) {
    nome = `${base} (${numero})`;
  }
  return nome;
}

// ---------------------------------------------------------------------------------------
// Listas
// ---------------------------------------------------------------------------------------

export function criarLista(
  estado: Estado,
  nome: string,
  contexto: Contexto,
): Resultado<MudancaComLista, ErroDaLista> {
  if (estado.listas.length >= limites.listas) return erro("lista.limite");
  const lido = lerNomeDaLista(nome);
  if (!lido.ok) return lido;

  const agora = contexto.agora.toISOString();
  const lista: Lista = {
    id: contexto.gerarId(),
    nome: lido.valor,
    criadaEm: agora,
    atualizadaEm: agora,
  };
  return sucesso({ ...mudar(estado, { listas: { gravar: [lista] } }), listaId: lista.id });
}

export function renomearLista(
  estado: Estado,
  listaId: string,
  nome: string,
  contexto: Contexto,
): Resultado<MudancaComLista, ErroDaLista> {
  const lista = acharLista(estado, listaId);
  if (lista === undefined) return erro("lista.inexistente");
  const lido = lerNomeDaLista(nome);
  if (!lido.ok) return lido;

  const renomeada = tocar({ ...lista, nome: lido.valor }, contexto);
  return sucesso({ ...mudar(estado, { listas: { gravar: [renomeada] } }), listaId });
}

/**
 * Cria uma lista nova com os mesmos itens, quantidades e preferências, e nenhum item marcado
 * como comprado (CA-02). O nome é o do mês atual.
 */
export function duplicarLista(
  estado: Estado,
  listaId: string,
  contexto: Contexto,
): Resultado<MudancaComLista, ErroDaLista> {
  const origem = acharLista(estado, listaId);
  if (origem === undefined) return erro("lista.inexistente");
  const criada = criarLista(estado, sugerirNome(estado, contexto), contexto);
  if (!criada.ok) return criada;

  const agora = contexto.agora.toISOString();
  const copias = itensDaLista(estado, listaId).map((item): Item => ({
    ...item,
    id: contexto.gerarId(),
    listaId: criada.valor.listaId,
    comprado: false,
    criadoEm: agora,
  }));
  const comItens = mudar(criada.valor.estado, { itens: { gravar: copias } });
  return sucesso({
    estado: comItens.estado,
    alteracoes: { ...criada.valor.alteracoes, ...comItens.alteracoes },
    listaId: criada.valor.listaId,
  });
}

/**
 * Apaga a lista e os itens dela. O app sempre tem uma lista aberta: se esta era a última,
 * entra uma vazia com o nome do mês.
 */
export function excluirLista(
  estado: Estado,
  listaId: string,
  contexto: Contexto,
): Resultado<MudancaComLista, ErroDaLista> {
  if (acharLista(estado, listaId) === undefined) return erro("lista.inexistente");

  const itens = estado.itens.filter((item) => item.listaId === listaId).map((item) => item.id);
  const semLista = mudar(estado, { listas: { apagar: [listaId] }, itens: { apagar: itens } });
  const proxima = listasRecentes(semLista.estado)[0];
  if (proxima !== undefined) return sucesso({ ...semLista, listaId: proxima.id });

  const agora = contexto.agora.toISOString();
  const nova: Lista = {
    id: contexto.gerarId(),
    nome: sugerirNome(semLista.estado, contexto),
    criadaEm: agora,
    atualizadaEm: agora,
  };
  return sucesso({
    ...mudar(estado, { listas: { apagar: [listaId], gravar: [nova] }, itens: { apagar: itens } }),
    listaId: nova.id,
  });
}

// ---------------------------------------------------------------------------------------
// Itens
// ---------------------------------------------------------------------------------------

/**
 * Guarda um item novo (CA-01). Se já existe um com o mesmo nome, recusa com `item.duplicado`
 * e devolve o existente, para a tela oferecer somar as quantidades (CA-03); com
 * `aceitarDuplicado`, entra como outro item.
 */
export function adicionarItem(
  estado: Estado,
  listaId: string,
  entrada: EntradaDoItem,
  contexto: Contexto,
  opcoes: { readonly aceitarDuplicado?: boolean } = {},
): Resultado<MudancaComItem, ErroDaLista> {
  const lista = acharLista(estado, listaId);
  if (lista === undefined) return erro("lista.inexistente");
  const campos = lerCampos(entrada);
  if (!campos.ok) return campos;

  const daLista = itensDaLista(estado, listaId);
  if (opcoes.aceitarDuplicado !== true) {
    const chave = chaveDoItem(campos.valor.nome);
    const existente = daLista.find((item) => chaveDoItem(item.nome) === chave);
    if (existente !== undefined) return falha({ tipo: "item.duplicado", existente });
  }
  if (daLista.length >= limites.itensPorLista) return erro("item.limite");

  const item: Item = {
    id: contexto.gerarId(),
    listaId,
    ...campos.valor,
    comprado: false,
    ordem: daLista.reduce((maior, atual) => Math.max(maior, atual.ordem + 1), 0),
    criadoEm: contexto.agora.toISOString(),
  };
  return sucesso({ ...gravarItem(estado, lista, item, contexto), item });
}

/**
 * Soma a quantidade digitada à de um item que já existe (CA-03). O item volta a aparecer
 * como não comprado: há mais para comprar.
 */
export function somarQuantidade(
  estado: Estado,
  itemId: string,
  quantidade: string,
  contexto: Contexto,
): Resultado<MudancaComItem, ErroDaLista> {
  const achado = acharItem(estado, itemId);
  if (achado === undefined) return erro("item.inexistente");
  const somar = lerQuantidade(quantidade);
  if (somar === null) return erro("item.quantidade-invalida");
  const total = achado.item.quantidade + somar;
  if (total > limites.quantidade) return erro("item.quantidade-acima");

  const item: Item = { ...achado.item, quantidade: total, comprado: false };
  return sucesso({ ...gravarItem(estado, achado.lista, item, contexto), item });
}

export function editarItem(
  estado: Estado,
  itemId: string,
  entrada: EntradaDoItem,
  contexto: Contexto,
): Resultado<MudancaComItem, ErroDaLista> {
  const achado = acharItem(estado, itemId);
  if (achado === undefined) return erro("item.inexistente");
  const campos = lerCampos(entrada);
  if (!campos.ok) return campos;

  const item: Item = { ...achado.item, ...campos.valor };
  return sucesso({ ...gravarItem(estado, achado.lista, item, contexto), item });
}

export function marcarComprado(
  estado: Estado,
  itemId: string,
  comprado: boolean,
  contexto: Contexto,
): Resultado<MudancaComItem, ErroDaLista> {
  const achado = acharItem(estado, itemId);
  if (achado === undefined) return erro("item.inexistente");

  const item: Item = { ...achado.item, comprado };
  return sucesso({ ...gravarItem(estado, achado.lista, item, contexto), item });
}

/** Tira o item da lista e o devolve, para a tela poder desfazer. */
export function removerItem(
  estado: Estado,
  itemId: string,
  contexto: Contexto,
): Resultado<MudancaComItem, ErroDaLista> {
  const achado = acharItem(estado, itemId);
  if (achado === undefined) return erro("item.inexistente");

  const mudanca = mudar(estado, {
    listas: { gravar: [tocar(achado.lista, contexto)] },
    itens: { apagar: [itemId] },
  });
  return sucesso({ ...mudanca, item: achado.item });
}

/** Desfaz uma remoção: o item volta como era, no mesmo lugar. */
export function restaurarItem(
  estado: Estado,
  item: Item,
  contexto: Contexto,
): Resultado<MudancaComItem, ErroDaLista> {
  const lista = acharLista(estado, item.listaId);
  if (lista === undefined) return erro("lista.inexistente");
  if (estado.itens.some((atual) => atual.id === item.id))
    return sucesso({ ...mudar(estado, {}), item });
  if (itensDaLista(estado, lista.id).length >= limites.itensPorLista) return erro("item.limite");

  return sucesso({ ...gravarItem(estado, lista, item, contexto), item });
}

// ---------------------------------------------------------------------------------------
// Leitura do que está guardado ou veio de um arquivo
// ---------------------------------------------------------------------------------------

/**
 * Confere registro por registro o que veio do aparelho ou de um arquivo importado. Só passa
 * o que tem o formato desta versão; cada objeto é remontado campo a campo, então propriedade
 * a mais não entra. `recusados` conta o que ficou de fora: registro fora do formato, id
 * repetido, item de lista que não existe e o que passa dos limites.
 */
export function conferirEstado(conteudo: {
  readonly listas: readonly unknown[];
  readonly itens: readonly unknown[];
}): { readonly estado: Estado; readonly recusados: number } {
  let recusados = 0;

  const listas = new Map<string, Lista>();
  for (const valor of conteudo.listas) {
    const lista = lerLista(valor);
    if (lista === null || listas.has(lista.id) || listas.size >= limites.listas) recusados += 1;
    else listas.set(lista.id, lista);
  }

  const itens = new Map<string, Item>();
  const porLista = new Map<string, number>();
  for (const valor of conteudo.itens) {
    const item = lerItem(valor);
    const naLista = item === null ? 0 : (porLista.get(item.listaId) ?? 0);
    if (
      item === null ||
      itens.has(item.id) ||
      !listas.has(item.listaId) ||
      naLista >= limites.itensPorLista
    ) {
      recusados += 1;
    } else {
      itens.set(item.id, item);
      porLista.set(item.listaId, naLista + 1);
    }
  }

  return { estado: { listas: [...listas.values()], itens: [...itens.values()] }, recusados };
}

export function lerLista(valor: unknown): Lista | null {
  if (!ehObjeto(valor)) return null;
  const { id, nome, criadaEm, atualizadaEm } = valor;
  if (!ehId(id) || !ehData(criadaEm) || !ehData(atualizadaEm) || typeof nome !== "string") {
    return null;
  }
  const lido = lerNomeDaLista(nome);
  return lido.ok ? { id, nome: lido.valor, criadaEm, atualizadaEm } : null;
}

export function lerItem(valor: unknown): Item | null {
  if (!ehObjeto(valor)) return null;
  const { id, listaId, nome, quantidade, marca, tamanho, preferencia, comprado, ordem, criadoEm } =
    valor;
  if (
    !ehId(id) ||
    !ehId(listaId) ||
    typeof nome !== "string" ||
    typeof quantidade !== "number" ||
    !(marca === null || typeof marca === "string") ||
    !(tamanho === null || typeof tamanho === "string") ||
    !ehPreferencia(preferencia) ||
    typeof comprado !== "boolean" ||
    typeof ordem !== "number" ||
    !Number.isSafeInteger(ordem) ||
    ordem < 0 ||
    !ehData(criadoEm)
  ) {
    return null;
  }
  const campos = lerCampos({
    nome,
    quantidade: Number.isSafeInteger(quantidade) ? String(quantidade) : "",
    marca: marca ?? "",
    tamanho: tamanho ?? "",
    preferencia,
  });
  return campos.ok ? { id, listaId, ...campos.valor, comprado, ordem, criadoEm } : null;
}

// ---------------------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------------------

function lerNomeDaLista(nome: string): Resultado<string, ErroDaLista> {
  const limpo = limparTexto(nome);
  if (limpo === "") return erro("lista.nome-vazio");
  if (limpo.length > limites.nomeDaLista) return erro("lista.nome-grande");
  return sucesso(limpo);
}

function lerCampos(entrada: EntradaDoItem): Resultado<Campos, ErroDaLista> {
  const nome = limparTexto(entrada.nome);
  if (nome === "") return erro("item.nome-vazio");
  if (nome.length > limites.nomeDoItem) return erro("item.nome-grande");

  const quantidade = lerQuantidade(entrada.quantidade);
  if (quantidade === null) return erro("item.quantidade-invalida");

  const marca = limparTexto(entrada.marca);
  if (marca.length > limites.marca) return erro("item.marca-grande");
  const tamanho = limparTexto(entrada.tamanho);
  if (tamanho.length > limites.tamanho) return erro("item.tamanho-grande");
  if (entrada.preferencia === "so-esta-marca" && marca === "")
    return erro("item.marca-obrigatoria");

  return sucesso({
    nome,
    quantidade,
    marca: marca === "" ? null : marca,
    tamanho: tamanho === "" ? null : tamanho,
    preferencia: entrada.preferencia,
  });
}

/** Inteiro de 1 a 999, só com algarismos: "2", " 12 ", "007". Nada de "1,5", "1e2" ou "-1". */
function lerQuantidade(texto: string): number | null {
  const limpo = texto.trim();
  if (!/^\d{1,6}$/.test(limpo)) return null;
  const quantidade = Number(limpo);
  return quantidade >= 1 && quantidade <= limites.quantidade ? quantidade : null;
}

function acharLista(estado: Estado, listaId: string): Lista | undefined {
  return estado.listas.find((lista) => lista.id === listaId);
}

function acharItem(estado: Estado, itemId: string): { item: Item; lista: Lista } | undefined {
  const item = estado.itens.find((atual) => atual.id === itemId);
  const lista = item === undefined ? undefined : acharLista(estado, item.listaId);
  return item === undefined || lista === undefined ? undefined : { item, lista };
}

/** Toda mudança numa lista atualiza a data dela: a mais recente é a que a tela abre. */
function tocar(lista: Lista, contexto: Contexto): Lista {
  return { ...lista, atualizadaEm: contexto.agora.toISOString() };
}

function gravarItem(estado: Estado, lista: Lista, item: Item, contexto: Contexto): Mudanca {
  return mudar(estado, {
    listas: { gravar: [tocar(lista, contexto)] },
    itens: { gravar: [item] },
  });
}

interface Troca<T> {
  readonly gravar?: readonly T[];
  readonly apagar?: readonly string[];
}

function mudar(
  estado: Estado,
  { listas, itens }: { readonly listas?: Troca<Lista>; readonly itens?: Troca<Item> },
): Mudanca {
  return {
    estado: {
      listas: listas === undefined ? estado.listas : trocar(estado.listas, listas),
      itens: itens === undefined ? estado.itens : trocar(estado.itens, itens),
    },
    alteracoes: {
      ...(listas === undefined ? {} : { listas }),
      ...(itens === undefined ? {} : { itens }),
    },
  };
}

/** Registro gravado entra no lugar do antigo com o mesmo id, ou no fim se for novo. */
function trocar<T extends { readonly id: string }>(
  atuais: readonly T[],
  { gravar = [], apagar = [] }: Troca<T>,
): readonly T[] {
  const gravados = new Map(gravar.map((registro) => [registro.id, registro]));
  const apagados = new Set(apagar);
  const existentes = new Set(atuais.map((registro) => registro.id));
  return [
    ...atuais
      .filter((registro) => !apagados.has(registro.id))
      .map((registro) => gravados.get(registro.id) ?? registro),
    ...gravar.filter((registro) => !existentes.has(registro.id)),
  ];
}

const comparar = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function ehId(valor: unknown): valor is string {
  return (
    typeof valor === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(valor)
  );
}

function ehData(valor: unknown): valor is string {
  return (
    typeof valor === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(valor) &&
    !Number.isNaN(Date.parse(valor))
  );
}

function ehPreferencia(valor: unknown): valor is Preferencia {
  return preferencias.some((preferencia) => preferencia === valor);
}
