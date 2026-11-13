/**
 * Onde comprar a lista (spec 0001, CA-19 a CA-23; ADR-0006). Conta pura, feita no aparelho:
 * recebe os itens, os preços guardados, os mercados do raio e o objetivo, e devolve as opções
 * (um mercado ou uma combinação de até três) em ordem.
 *
 * 1. Para cada item e mercado, a oferta mais barata que respeita a marca, com as embalagens
 *    necessárias e o atacado só quando a compra alcança o mínimo (CA-17, CA-18).
 * 2. Combinações de 1 até K mercados; em cada uma, cada item vai para o mais barato dela.
 * 3. Ordem por itens faltando, total, distância, quantidade de mercados, nomes e ids. Uma
 *    combinação só entra se completar mais itens ou economizar o mínimo configurado em relação
 *    à melhor opção com menos mercados (CA-21, CA-22, CA-23).
 * 4. Acima do teto, as trocas de marca e, se ainda faltar, os itens a retirar (CA-20).
 *
 * Dinheiro em centavos inteiros; a distância é estimada em linha reta.
 */
import { chaveDeComparacao } from "../../shared/texto";
import { chaveDoItem, type Item, type Preferencia } from "../lista/lista";
import { distanciaKm, type Ponto } from "../mercados/geo";
import type { ObservacaoDePreco } from "../precos/precos";
import { custoDoItem, embalagemDoPreco } from "../precos/unidades";

export type ItemDaComparacao = Pick<
  Item,
  "id" | "nome" | "quantidade" | "marca" | "tamanho" | "preferencia" | "ordem" | "comprado"
>;

export interface MercadoDaComparacao extends Ponto {
  readonly id: string;
  readonly nome: string;
  /** Distância em linha reta do ponto da pessoa, em km. */
  readonly distanciaKm: number;
}

export const maximosDeMercados = [1, 2, 3] as const;

export type MaximoDeMercados = (typeof maximosDeMercados)[number];

/** O que a conta usa do objetivo; o raio já filtrou os mercados recebidos. */
export interface Criterios {
  readonly tetoCentavos: number | null;
  /** Preferência de marca geral; vale a mais exigente entre ela e a do item (CA-19). */
  readonly marcas: Preferencia;
  readonly maximoDeMercados: MaximoDeMercados;
  /** Quanto uma combinação precisa economizar para ser sugerida (CA-22). */
  readonly economiaMinimaCentavos: number;
}

export interface Linha {
  readonly item: ItemDaComparacao;
  readonly observacao: ObservacaoDePreco;
  readonly embalagens: number;
  readonly centavos: number;
  /** O item pede uma marca e este preço é de outra ("marca boa" sem a marca no mercado). */
  readonly outraMarca: boolean;
}

export interface Parada {
  readonly mercado: MercadoDaComparacao;
  readonly linhas: readonly Linha[];
  readonly subtotalCentavos: number;
}

/** Como uma combinação se compara ao melhor mercado sozinho (CA-22). */
export interface Frente {
  readonly mercado: MercadoDaComparacao;
  /** Positivo quando a combinação sai mais barata. */
  readonly economiaCentavos: number;
  /** Itens com preço na combinação que faltam no mercado sozinho. */
  readonly itensAMais: number;
}

export interface Opcao {
  /** Ids dos mercados na ordem do caminho. */
  readonly id: string;
  /** Mercados na ordem do caminho estimado a partir do ponto, cada um com o que comprar lá. */
  readonly paradas: readonly Parada[];
  readonly totalCentavos: number;
  /** Itens sem preço em nenhum mercado da opção, na ordem da lista (CA-21). */
  readonly faltando: readonly ItemDaComparacao[];
  /** Caminho em linha reta do ponto até o último mercado, passando por todos (CA-22). */
  readonly distanciaKm: number;
  /** Quanto passa do teto; zero quando cabe ou quando não há teto. */
  readonly acimaDoTetoCentavos: number;
  /** Nula para um mercado só. */
  readonly frente: Frente | null;
}

export type Sugestao =
  | {
      readonly tipo: "trocar";
      readonly de: Linha;
      readonly para: Linha;
      readonly mercado: MercadoDaComparacao;
      readonly economiaCentavos: number;
    }
  | { readonly tipo: "retirar"; readonly linha: Linha; readonly economiaCentavos: number };

/** O que fazer para a primeira opção caber no teto (CA-20). */
export interface Ajuste {
  readonly excessoCentavos: number;
  readonly sugestoes: readonly Sugestao[];
  readonly totalDepoisCentavos: number;
}

export interface TotalDoMercado {
  readonly totalCentavos: number;
  readonly faltando: number;
}

export interface Comparacao {
  /** As melhores opções, no máximo `maximoDeOpcoes`. */
  readonly opcoes: readonly Opcao[];
  /** Cada mercado sozinho, para o pino do mapa e a lista de mercados. */
  readonly porMercado: ReadonlyMap<string, TotalDoMercado>;
  readonly ajuste: Ajuste | null;
  /** Itens que entraram na conta: os da lista ainda não comprados. */
  readonly itens: readonly ItemDaComparacao[];
}

export const maximoDeOpcoes = 10;

/**
 * Mercados considerados nas combinações: os que têm preço de mais itens, depois os mais
 * perto. Com 20, são 1.350 combinações de até três (CA-23).
 */
export const mercadosNasCombinacoes = 20;

const rigor: Readonly<Record<Preferencia, number>> = {
  "mais-barato": 0,
  "marca-boa": 1,
  "so-esta-marca": 2,
};

const ordemDosNomes = new Intl.Collator("pt-BR", { sensitivity: "base" });

const compararTexto = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

interface Oferta {
  readonly observacao: ObservacaoDePreco;
  /** Chave da marca; vazia quando o preço não tem marca (o da nota, por exemplo). */
  readonly marca: string;
  /** Chave da descrição da nota entre espaços, para achar a marca escrita nela. */
  readonly descricao: string;
}

/** A preferência que vale para o item: a mais exigente entre a dele e a geral. */
export function preferenciaDoItem(
  item: Pick<ItemDaComparacao, "marca" | "preferencia">,
  geral: Preferencia,
): Preferencia {
  if (item.marca === null || chaveDeComparacao(item.marca) === "") return "mais-barato";
  return rigor[item.preferencia] >= rigor[geral] ? item.preferencia : geral;
}

/**
 * A marca confere quando é a mesma, sem diferença de maiúsculas e acentos, ou, no preço sem
 * marca (o da nota), quando a descrição traz as palavras dela ("ARROZ TIO JOAO 5KG").
 */
function marcaConfere(oferta: Oferta, marca: string): boolean {
  if (oferta.marca !== "") return oferta.marca === marca;
  return oferta.descricao.includes(` ${marca} `);
}

function maisRecente(a: ObservacaoDePreco, b: ObservacaoDePreco): boolean {
  if (a.vistoEm !== b.vistoEm) return a.vistoEm > b.vistoEm;
  if (a.criadoEm !== b.criadoEm) return a.criadoEm > b.criadoEm;
  return a.id < b.id;
}

/**
 * As ofertas de cada mercado e produto. O mesmo produto, marca, descrição, tamanho e mínimo de
 * atacado no mesmo mercado é uma oferta só, e vale o preço visto por último: o preço antigo
 * não volta a valer porque era menor.
 */
function agruparOfertas(observacoes: readonly ObservacaoDePreco[]): Map<string, Oferta[]> {
  const ultimas = new Map<string, Oferta>();
  for (const observacao of observacoes) {
    const marca = observacao.marca === null ? "" : chaveDeComparacao(observacao.marca);
    const descricao =
      observacao.descricao === null ? "" : ` ${chaveDeComparacao(observacao.descricao)} `;
    const embalagem = embalagemDoPreco(observacao);
    const tamanho =
      embalagem === null
        ? `?${chaveDeComparacao(observacao.tamanho ?? "")}`
        : `${embalagem.grandeza}:${embalagem.quantidade}`;
    const chave = [
      observacao.mercadoId,
      chaveDoItem(observacao.produto),
      marca,
      descricao,
      tamanho,
      observacao.minimoAtacado ?? "",
    ].join("\n");
    const atual = ultimas.get(chave);
    if (atual === undefined || maisRecente(observacao, atual.observacao)) {
      ultimas.set(chave, { observacao, marca, descricao });
    }
  }
  const grupos = new Map<string, Oferta[]>();
  for (const oferta of ultimas.values()) {
    const chave = `${oferta.observacao.mercadoId}\n${chaveDoItem(oferta.observacao.produto)}`;
    const grupo = grupos.get(chave);
    if (grupo === undefined) grupos.set(chave, [oferta]);
    else grupo.push(oferta);
  }
  return grupos;
}

/** Mais barata primeiro; empate pelo preço visto por último e pelo id. */
function vemAntes(a: Linha, b: Linha): boolean {
  if (a.centavos !== b.centavos) return a.centavos < b.centavos;
  if (a.observacao.vistoEm !== b.observacao.vistoEm) {
    return a.observacao.vistoEm > b.observacao.vistoEm;
  }
  return a.observacao.id < b.observacao.id;
}

function melhorLinha(
  item: ItemDaComparacao,
  ofertas: readonly Oferta[],
  marca: string | null,
  soDaMarca: boolean,
): Linha | null {
  let melhor: Linha | null = null;
  for (const oferta of ofertas) {
    const confere = marca !== null && marcaConfere(oferta, marca);
    if (soDaMarca && !confere) continue;
    const custo = custoDoItem(item, oferta.observacao);
    if (custo === null) continue;
    const linha: Linha = {
      item,
      observacao: oferta.observacao,
      embalagens: custo.embalagens,
      centavos: custo.centavos,
      outraMarca: marca !== null && !confere,
    };
    if (melhor === null || vemAntes(linha, melhor)) melhor = linha;
  }
  return melhor;
}

interface Escolhas {
  /** O preço que respeita a preferência de marca, por item e mercado. */
  readonly escolhida: (Linha | null)[][];
  /** O mais barato de qualquer marca, para sugerir a troca (CA-20). */
  readonly livre: (Linha | null)[][];
}

function escolher(
  itens: readonly ItemDaComparacao[],
  mercados: readonly MercadoDaComparacao[],
  grupos: ReadonlyMap<string, readonly Oferta[]>,
  geral: Preferencia,
): Escolhas {
  const escolhida = itens.map((item) => {
    const preferencia = preferenciaDoItem(item, geral);
    const marca = preferencia === "mais-barato" ? null : chaveDeComparacao(item.marca ?? "");
    const produto = chaveDoItem(item.nome);
    return mercados.map((mercado) => {
      const ofertas = grupos.get(`${mercado.id}\n${produto}`);
      if (ofertas === undefined) return null;
      const daMarca = marca === null ? null : melhorLinha(item, ofertas, marca, true);
      if (preferencia === "so-esta-marca") return daMarca;
      return daMarca ?? melhorLinha(item, ofertas, marca, false);
    });
  });
  const livre = itens.map((item) => {
    const produto = chaveDoItem(item.nome);
    const marca = chaveDeComparacao(item.marca ?? "") || null;
    return mercados.map((mercado) => {
      const ofertas = grupos.get(`${mercado.id}\n${produto}`);
      return ofertas === undefined ? null : melhorLinha(item, ofertas, marca, false);
    });
  });
  return { escolhida, livre };
}

/** Uma combinação avaliada só com números, antes de virar opção. */
interface Avaliacao {
  /** Índices dos mercados na ordem de distância. */
  readonly mercados: readonly number[];
  /** Para cada item, o índice do mercado que o vende mais barato, ou -1. */
  readonly destino: ArrayLike<number>;
  readonly totalCentavos: number;
  readonly faltando: number;
}

/** A combinação que entrou, com o caminho: só ela precisa da distância. */
interface Candidata extends Avaliacao {
  readonly distanciaKm: number;
  /** Índices dos mercados na ordem do caminho. */
  readonly caminho: readonly number[];
}

function permutacoes(valores: readonly number[]): number[][] {
  if (valores.length <= 1) return [[...valores]];
  return valores.flatMap((valor, i) =>
    permutacoes([...valores.slice(0, i), ...valores.slice(i + 1)]).map((resto) => [
      valor,
      ...resto,
    ]),
  );
}

/** Junta o caminho mais curto do ponto passando por todos os mercados, sem voltar. */
function comCaminho(avaliacao: Avaliacao, mercados: readonly MercadoDaComparacao[]): Candidata {
  let melhor: { caminho: number[]; km: number } | null = null;
  for (const caminho of permutacoes(avaliacao.mercados)) {
    let km = mercados[caminho[0]!]!.distanciaKm;
    for (let j = 1; j < caminho.length; j++) {
      km += distanciaKm(mercados[caminho[j - 1]!]!, mercados[caminho[j]!]!);
    }
    if (melhor === null || km < melhor.km) melhor = { caminho, km };
  }
  return { ...avaliacao, distanciaKm: melhor!.km, caminho: melhor!.caminho };
}

/**
 * Avalia uma combinação: cada item vai para o mercado mais barato dela (no empate, o mais
 * perto). Nula quando algum mercado da combinação não recebe nenhum item: a mesma compra sai
 * com menos mercados e menos caminho.
 */
function avaliar(indices: readonly number[], custos: readonly Float64Array[]): Avaliacao | null {
  const destino = new Int32Array(custos.length);
  const todos = (1 << indices.length) - 1;
  let usados = 0;
  let totalCentavos = 0;
  let faltando = 0;
  for (let i = 0; i < custos.length; i++) {
    const custo = custos[i]!;
    let melhor = -1;
    for (let k = 0; k < indices.length; k++) {
      const valor = custo[indices[k]!]!;
      if (valor < Infinity && (melhor === -1 || valor < custo[indices[melhor]!]!)) melhor = k;
    }
    if (melhor === -1) {
      destino[i] = -1;
      faltando++;
    } else {
      destino[i] = indices[melhor]!;
      totalCentavos += custo[indices[melhor]!]!;
      usados |= 1 << melhor;
    }
  }
  return usados === todos ? { mercados: indices, destino, totalCentavos, faltando } : null;
}

function compararCandidatas(
  a: Candidata,
  b: Candidata,
  mercados: readonly MercadoDaComparacao[],
): number {
  const nomes = (c: Candidata) => c.caminho.map((m) => mercados[m]!.nome).join(" + ");
  const ids = (c: Candidata) => c.caminho.map((m) => mercados[m]!.id).join(" ");
  return (
    a.faltando - b.faltando ||
    a.totalCentavos - b.totalCentavos ||
    a.distanciaKm - b.distanciaKm ||
    a.mercados.length - b.mercados.length ||
    ordemDosNomes.compare(nomes(a), nomes(b)) ||
    compararTexto(ids(a), ids(b))
  );
}

/** A combinação entra se completa mais itens ou economiza o mínimo (CA-21, CA-22). */
function valeAPena(candidata: Avaliacao, referencia: Avaliacao, minimo: number): boolean {
  if (candidata.faltando !== referencia.faltando) return candidata.faltando < referencia.faltando;
  return referencia.totalCentavos - candidata.totalCentavos >= Math.max(minimo, 1);
}

function combinacoes(quantos: number, tamanho: number): number[][] {
  const todas: number[][] = [];
  const montar = (inicio: number, atual: number[]) => {
    if (atual.length === tamanho) {
      todas.push(atual);
      return;
    }
    for (let i = inicio; i < quantos; i++) montar(i + 1, [...atual, i]);
  };
  montar(0, []);
  return todas;
}

function ordenarItens(itens: readonly ItemDaComparacao[]): ItemDaComparacao[] {
  return itens
    .filter((item) => !item.comprado)
    .sort((a, b) => a.ordem - b.ordem || compararTexto(a.id, b.id));
}

function ordenarMercados(mercados: readonly MercadoDaComparacao[]): MercadoDaComparacao[] {
  const vistos = new Set<string>();
  return mercados
    .filter((mercado) => {
      if (vistos.has(mercado.id)) return false;
      vistos.add(mercado.id);
      return true;
    })
    .sort(
      (a, b) =>
        a.distanciaKm - b.distanciaKm ||
        ordemDosNomes.compare(a.nome, b.nome) ||
        compararTexto(a.id, b.id),
    );
}

function montarOpcao(
  candidata: Candidata,
  itens: readonly ItemDaComparacao[],
  mercados: readonly MercadoDaComparacao[],
  escolhida: readonly (readonly (Linha | null)[])[],
  teto: number | null,
  melhorUnico: Candidata | null,
): Opcao {
  const paradas = candidata.caminho.map((m): Parada => {
    const linhas = itens.flatMap((_, i) => (candidata.destino[i] === m ? [escolhida[i]![m]!] : []));
    return {
      mercado: mercados[m]!,
      linhas,
      subtotalCentavos: linhas.reduce((soma, linha) => soma + linha.centavos, 0),
    };
  });
  const frente =
    candidata.mercados.length === 1 || melhorUnico === null
      ? null
      : {
          mercado: mercados[melhorUnico.mercados[0]!]!,
          economiaCentavos: melhorUnico.totalCentavos - candidata.totalCentavos,
          itensAMais: melhorUnico.faltando - candidata.faltando,
        };
  return {
    id: paradas.map((parada) => parada.mercado.id).join(" "),
    paradas,
    totalCentavos: candidata.totalCentavos,
    faltando: itens.filter((_, i) => candidata.destino[i] === -1),
    distanciaKm: candidata.distanciaKm,
    acimaDoTetoCentavos: teto === null ? 0 : Math.max(0, candidata.totalCentavos - teto),
    frente,
  };
}

function compararSugestoes(a: Linha, b: Linha, economiaA: number, economiaB: number): number {
  return (
    economiaB - economiaA ||
    ordemDosNomes.compare(a.item.nome, b.item.nome) ||
    compararTexto(a.item.id, b.item.id)
  );
}

/**
 * Para caber no teto (CA-20): primeiro as trocas por outra marca, da que mais economiza para a
 * que menos, até caber. Se ainda passar, retirar itens: o mais barato que sozinho faz caber
 * ou, se nenhum faz, o mais caro, e segue. Empates pelo nome do item.
 */
function ajustarAoTeto(
  candidata: Candidata,
  itens: readonly ItemDaComparacao[],
  mercados: readonly MercadoDaComparacao[],
  escolhas: Escolhas,
  teto: number,
): Ajuste | null {
  const excessoCentavos = candidata.totalCentavos - teto;
  if (excessoCentavos <= 0) return null;
  const trocas: { de: Linha; para: Linha; mercado: MercadoDaComparacao; economia: number }[] = [];
  const custoAtual = new Map<number, number>();
  itens.forEach((_, i) => {
    const m = candidata.destino[i]!;
    if (m === -1) return;
    const de = escolhas.escolhida[i]![m]!;
    custoAtual.set(i, de.centavos);
    let melhor = -1;
    for (const outro of candidata.mercados) {
      const livre = escolhas.livre[i]![outro];
      if (livre && (melhor === -1 || livre.centavos < escolhas.livre[i]![melhor]!.centavos)) {
        melhor = outro;
      }
    }
    const para = escolhas.livre[i]![melhor]!;
    if (para.centavos < de.centavos) {
      trocas.push({ de, para, mercado: mercados[melhor]!, economia: de.centavos - para.centavos });
    }
  });
  trocas.sort((a, b) => compararSugestoes(a.de, b.de, a.economia, b.economia));

  let falta = excessoCentavos;
  const trocadas = new Map<string, (typeof trocas)[number]>();
  for (const troca of trocas) {
    if (falta <= 0) break;
    trocadas.set(troca.de.item.id, troca);
    falta -= troca.economia;
  }

  const retiradas: Linha[] = [];
  if (falta > 0) {
    const restantes = itens.flatMap((_, i) => {
      const m = candidata.destino[i]!;
      if (m === -1) return [];
      const linha = escolhas.escolhida[i]![m]!;
      const troca = trocadas.get(linha.item.id);
      return [{ linha, custo: troca === undefined ? linha.centavos : troca.para.centavos }];
    });
    while (falta > 0 && restantes.length > 0) {
      const resolvem = restantes.filter((r) => r.custo >= falta);
      const lista = resolvem.length > 0 ? resolvem : restantes;
      const ordenados = lista.sort((a, b) =>
        resolvem.length > 0
          ? compararSugestoes(a.linha, b.linha, b.custo, a.custo)
          : compararSugestoes(a.linha, b.linha, a.custo, b.custo),
      );
      const escolhido = ordenados[0]!;
      restantes.splice(restantes.indexOf(escolhido), 1);
      retiradas.push(escolhido.linha);
      falta -= escolhido.custo;
    }
  }

  const retiradosIds = new Set(retiradas.map((linha) => linha.item.id));
  const sugestoes: Sugestao[] = [
    ...[...trocadas.values()]
      .filter((troca) => !retiradosIds.has(troca.de.item.id))
      .map((troca): Sugestao => ({
        tipo: "trocar",
        de: troca.de,
        para: troca.para,
        mercado: troca.mercado,
        economiaCentavos: troca.economia,
      })),
    ...retiradas.map((linha): Sugestao => ({
      tipo: "retirar",
      linha,
      economiaCentavos: linha.centavos,
    })),
  ];
  const economia = sugestoes.reduce((soma, sugestao) => soma + sugestao.economiaCentavos, 0);
  return { excessoCentavos, sugestoes, totalDepoisCentavos: candidata.totalCentavos - economia };
}

/**
 * Compara a lista entre os mercados (CA-19 a CA-23). Mesma entrada, mesmo resultado: itens,
 * mercados e preços são ordenados antes da conta, e cada empate tem desempate documentado.
 */
export function comparar(
  itensDaLista: readonly ItemDaComparacao[],
  observacoes: readonly ObservacaoDePreco[],
  mercadosDoRaio: readonly MercadoDaComparacao[],
  criterios: Criterios,
): Comparacao {
  const itens = ordenarItens(itensDaLista);
  // Só os preços dos mercados do raio e dos produtos da lista entram na conta: o aparelho
  // guarda até 5.000, quase todos de fora desta comparação.
  const doRaio = new Set(mercadosDoRaio.map((mercado) => mercado.id));
  const produtos = new Set(itens.map((item) => chaveDoItem(item.nome)));
  const relevantes = observacoes.filter(
    (observacao) =>
      doRaio.has(observacao.mercadoId) && produtos.has(chaveDoItem(observacao.produto)),
  );
  const comPreco = new Set(relevantes.map((observacao) => observacao.mercadoId));
  const mercados = ordenarMercados(mercadosDoRaio.filter((mercado) => comPreco.has(mercado.id)));
  const escolhas = escolher(itens, mercados, agruparOfertas(relevantes), criterios.marcas);
  const custos = escolhas.escolhida.map((porMercado) =>
    Float64Array.from(porMercado, (linha) => (linha === null ? Infinity : linha.centavos)),
  );

  // Um mercado sozinho: todos os que vendem pelo menos um item da lista.
  const unicos = mercados
    .flatMap((_, m) => {
      const avaliacao = avaliar([m], custos);
      return avaliacao === null ? [] : [comCaminho(avaliacao, mercados)];
    })
    .sort((a, b) => compararCandidatas(a, b, mercados));
  const porMercado = new Map<string, TotalDoMercado>(
    unicos.map((c) => [
      mercados[c.mercados[0]!]!.id,
      { totalCentavos: c.totalCentavos, faltando: c.faltando },
    ]),
  );

  // Combinações: só entre os mercados que vendem mais itens (no empate, os mais perto), e
  // cada tamanho só entra se valer a pena em relação à melhor opção com menos mercados.
  const pool = unicos
    .slice()
    .sort((a, b) => a.faltando - b.faltando || a.mercados[0]! - b.mercados[0]!)
    .slice(0, mercadosNasCombinacoes)
    .map((c) => c.mercados[0]!)
    .sort((a, b) => a - b);
  const aceitas: Candidata[] = [...unicos];
  let referencia: Candidata | undefined = unicos[0];
  for (let tamanho = 2; tamanho <= criterios.maximoDeMercados && referencia; tamanho++) {
    const doTamanho: Candidata[] = [];
    for (const indices of combinacoes(pool.length, tamanho)) {
      const avaliacao = avaliar(
        indices.map((i) => pool[i]!),
        custos,
      );
      if (avaliacao && valeAPena(avaliacao, referencia, criterios.economiaMinimaCentavos)) {
        doTamanho.push(comCaminho(avaliacao, mercados));
      }
    }
    aceitas.push(...doTamanho);
    for (const candidata of doTamanho) {
      if (compararCandidatas(candidata, referencia, mercados) < 0) referencia = candidata;
    }
  }

  const ordenadas = aceitas.sort((a, b) => compararCandidatas(a, b, mercados));
  const melhorUnico = unicos[0] ?? null;
  const opcoes = ordenadas
    .slice(0, maximoDeOpcoes)
    .map((c) =>
      montarOpcao(c, itens, mercados, escolhas.escolhida, criterios.tetoCentavos, melhorUnico),
    );
  const primeira = ordenadas[0];
  const ajuste =
    primeira === undefined || criterios.tetoCentavos === null
      ? null
      : ajustarAoTeto(primeira, itens, mercados, escolhas, criterios.tetoCentavos);
  return { opcoes, porMercado, ajuste, itens };
}
