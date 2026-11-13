/**
 * Importação da nota fiscal (spec 0001, CA-10 e CA-14; ADR-0003): a nota lida vira preços com
 * fonte "nota", depois que a pessoa diz qual mercado do app é a loja da nota e a que item da
 * lista corresponde cada produto, ou que ele deve ser ignorado. Nada é ligado sozinho por
 * semelhança de nome: a escolha é sempre da pessoa e fica lembrada por loja (CNPJ) e código
 * do produto, para as notas seguintes.
 *
 * Sem React e sem API do navegador, salvo o resumo SHA-256, que recebe o `SubtleCrypto`.
 */
import type { Alteracoes } from "../../../shared/armazenamento/banco";
import type { NotaConsultada } from "../../../shared/contratos/nfce";
import { maiorPrecoEmCentavos } from "../../../shared/dinheiro";
import { falha, sucesso, type Resultado } from "../../../shared/resultado";
import { limparTexto } from "../../../shared/texto";
import { chaveDoItem } from "../../lista/lista";
import type { OpcaoDeMercado } from "../escolha";
import {
  conferirMercado,
  ehDia,
  limitesDoPreco,
  lerProduto,
  type ContextoDoPreco,
  type MercadoDoPreco,
  type ObservacaoDePreco,
} from "../precos";
import {
  idDoMercado,
  idDoProduto,
  limitesDaAssociacao,
  mercadoLembrado,
  type Associacao,
  type AssociacaoDeProduto,
} from "./associacoes";

/** A chave de acesso da nota: 44 dígitos seguidos no link, sem outro dígito colado. */
export function chaveDoLink(link: string): string | null {
  return /(?<!\d)\d{44}(?!\d)/.exec(link)?.[0] ?? null;
}

/**
 * Resumo SHA-256, em hexadecimal, da chave de acesso: reconhece a mesma nota numa segunda
 * importação sem guardar o link nem a chave (CA-11). Sem chave no link, ou num navegador sem
 * criptografia (página fora de https), nulo: a nota entra sem essa marca.
 */
export async function resumoDaNota(
  link: string,
  cripto: { readonly subtle?: SubtleCrypto } = globalThis.crypto,
): Promise<string | null> {
  const chave = chaveDoLink(link);
  const sutil = cripto.subtle;
  if (chave === null || sutil === undefined) return null;
  const resumo = await sutil.digest("SHA-256", new TextEncoder().encode(chave));
  return Array.from(new Uint8Array(resumo), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** O que a pessoa decide sobre um produto da nota: o nome do item da lista ou ignorar. */
export type Decisao = { readonly produto: string } | "ignorar";

/** Um produto da nota, pronto para a pessoa ligar a um item da lista. */
export interface ItemParaLigar {
  /** Código do produto na loja; nulo quando a nota não traz (a escolha não fica lembrada). */
  readonly codigo: string | null;
  readonly descricao: string;
  /** Quantidade e unidade como a nota imprime, para a pessoa reconhecer o item. */
  readonly quantidade: string;
  readonly unidade: string;
  readonly precoCentavos: number;
  /** A escolha feita numa nota anterior desta loja para este código, se houve. */
  readonly lembrado: Decisao | null;
}

export interface Preparo {
  readonly cnpj: string;
  /** Dia da compra: a data de emissão da nota ou, sem ela, o dia de hoje. */
  readonly vistoEm: string;
  readonly nota: string | null;
  /** O mercado do app que a pessoa ligou a esta loja numa nota anterior. */
  readonly mercado: MercadoDoPreco | null;
  readonly itens: readonly ItemParaLigar[];
  /** Itens com preço zero ou acima do máximo, que não viram preço. */
  readonly semPreco: number;
  /** Preços desta mesma nota já guardados: guardar de novo troca esses pelos novos. */
  readonly jaGuardados: number;
}

/** Item vendido a peso ou a litro: o preço unitário da nota é o de 1 kg ou 1 L. */
function tamanhoDaUnidade(unidade: string): string | null {
  switch (unidade.trim().toUpperCase()) {
    case "KG":
      return "1 kg";
    case "L":
    case "LT":
      return "1 L";
    default:
      return null;
  }
}

function lembrar(associacoes: ReadonlyMap<string, Associacao>, id: string): Decisao | null {
  const achada = associacoes.get(id);
  if (achada?.tipo !== "produto") return null;
  return achada.produto === null ? "ignorar" : { produto: achada.produto };
}

/**
 * Monta o que a tela mostra para a nota lida: os produtos sem repetir o mesmo código, cada um
 * com a escolha lembrada, e o mercado ligado antes a esta loja.
 */
export function prepararImportacao(
  nota: NotaConsultada,
  resumo: string | null,
  aparelho: {
    readonly associacoes: readonly Associacao[];
    readonly observacoes: readonly ObservacaoDePreco[];
  },
  hoje: string,
): Preparo {
  const porId = new Map(aparelho.associacoes.map((associacao) => [associacao.id, associacao]));
  const vistos = new Set<string>();
  const itens: ItemParaLigar[] = [];
  let semPreco = 0;
  for (const item of nota.itens) {
    if (item.precoUnitarioCentavos <= 0 || item.precoUnitarioCentavos > maiorPrecoEmCentavos) {
      semPreco += 1;
      continue;
    }
    const codigo = limparTexto(item.codigo).slice(0, limitesDaAssociacao.codigo) || null;
    if (codigo !== null) {
      // O mesmo produto passado duas vezes no caixa vira uma linha só.
      if (vistos.has(codigo)) continue;
      vistos.add(codigo);
    }
    const descricao = limparTexto(item.descricao).slice(0, limitesDoPreco.descricao);
    itens.push({
      codigo,
      descricao: descricao === "" ? "Produto sem descrição na nota" : descricao,
      quantidade: item.quantidade,
      unidade: limparTexto(item.unidade),
      precoCentavos: item.precoUnitarioCentavos,
      lembrado: codigo === null ? null : lembrar(porId, idDoProduto(nota.mercado.cnpj, codigo)),
    });
  }
  const emissao = nota.emitidaEm?.slice(0, 10) ?? "";
  return {
    cnpj: nota.mercado.cnpj,
    vistoEm: ehDia(emissao) ? emissao : hoje,
    nota: resumo,
    mercado: mercadoLembrado(aparelho.associacoes, nota.mercado.cnpj),
    itens,
    semPreco,
    jaGuardados:
      resumo === null
        ? 0
        : aparelho.observacoes.filter((observacao) => observacao.nota === resumo).length,
  };
}

const ordemDosNomes = new Intl.Collator("pt-BR", { sensitivity: "base" });

/**
 * Produtos que a pessoa pode escolher para os itens da nota: os das listas, os que já têm
 * preço e os lembrados desta nota, sem repetir o mesmo produto, em ordem alfabética.
 */
export function produtosParaLigar(
  dasListas: readonly string[],
  observacoes: readonly ObservacaoDePreco[],
  preparo: Preparo,
): readonly string[] {
  const porChave = new Map<string, string>();
  const lembrados = preparo.itens.flatMap((item) =>
    item.lembrado === null || item.lembrado === "ignorar" ? [] : [item.lembrado.produto],
  );
  for (const nome of [...dasListas, ...observacoes.map((o) => o.produto), ...lembrados]) {
    const chave = chaveDoItem(nome);
    if (!porChave.has(chave)) porChave.set(chave, nome);
  }
  return [...porChave.values()].sort(ordemDosNomes.compare);
}

/** O mercado lembrado entra na escolha mesmo longe do ponto da busca, no começo da lista. */
export function opcoesComLembrado(
  opcoes: readonly OpcaoDeMercado[],
  lembrado: MercadoDoPreco | null,
): readonly OpcaoDeMercado[] {
  if (lembrado === null || opcoes.some((opcao) => opcao.id === lembrado.id)) return opcoes;
  return [{ ...lembrado, detalhe: "escolhido antes para esta loja" }, ...opcoes];
}

export type ErroDaImportacao =
  | { readonly tipo: "mercado-vazio" }
  | { readonly tipo: "faltam-produtos"; readonly quantos: number }
  | { readonly tipo: "limite-de-precos" }
  | { readonly tipo: "limite-de-escolhas" };

export interface Importacao {
  /** Gravações e remoções numa transação só: preços e escolhas entram juntos. */
  readonly alteracoes: Alteracoes;
  /** Todos os preços e escolhas do aparelho depois de guardar, para a tela seguir sem reler. */
  readonly observacoes: readonly ObservacaoDePreco[];
  readonly associacoes: readonly Associacao[];
  readonly guardados: number;
  readonly ignorados: number;
}

/**
 * Confere as escolhas e monta os preços e as associações, sem gravar nada. `decisoes` segue a
 * ordem de `preparo.itens`; sem decisão, o item está pendente e a importação espera (CA-14).
 * Os preços de uma importação anterior da mesma nota saem, para a nota não contar duas vezes.
 */
export function aplicarImportacao(
  preparo: Preparo,
  mercadoEscolhido: MercadoDoPreco | null,
  decisoes: readonly (Decisao | undefined)[],
  aparelho: {
    readonly associacoes: readonly Associacao[];
    readonly observacoes: readonly ObservacaoDePreco[];
  },
  contexto: ContextoDoPreco,
): Resultado<Importacao, ErroDaImportacao> {
  const mercado = conferirMercado(mercadoEscolhido);
  if (mercado === null) return falha({ tipo: "mercado-vazio" });

  const escolhas = preparo.itens.map((_, indice) => {
    const decisao = decisoes[indice];
    if (decisao === undefined || decisao === "ignorar") return decisao;
    const produto = lerProduto(decisao.produto);
    return produto.ok ? { produto: produto.valor } : undefined;
  });
  const pendentes = escolhas.filter((escolha) => escolha === undefined).length;
  if (pendentes > 0) return falha({ tipo: "faltam-produtos", quantos: pendentes });

  const criadoEm = contexto.agora.toISOString();
  const novas: ObservacaoDePreco[] = [];
  const escolhasLembradas: AssociacaoDeProduto[] = [];
  preparo.itens.forEach((item, indice) => {
    const escolha = escolhas[indice]!;
    const produto = escolha === "ignorar" ? null : escolha!.produto;
    if (item.codigo !== null) {
      escolhasLembradas.push({
        id: idDoProduto(preparo.cnpj, item.codigo),
        tipo: "produto",
        cnpj: preparo.cnpj,
        codigo: item.codigo,
        descricao: item.descricao,
        produto,
        atualizadaEm: criadoEm,
      });
    }
    if (produto === null) return;
    novas.push({
      id: contexto.gerarId(),
      produto,
      marca: null,
      tamanho: tamanhoDaUnidade(item.unidade),
      descricao: item.descricao,
      precoCentavos: item.precoCentavos,
      minimoAtacado: null,
      mercadoId: mercado.id,
      mercadoNome: mercado.nome,
      fonte: "nota",
      vistoEm: preparo.vistoEm,
      nota: preparo.nota,
      criadoEm,
    });
  });

  const substituidas = new Set(
    preparo.nota === null
      ? []
      : aparelho.observacoes.filter((o) => o.nota === preparo.nota).map((o) => o.id),
  );
  const ficam = aparelho.observacoes.filter((observacao) => !substituidas.has(observacao.id));
  if (ficam.length + novas.length > limitesDoPreco.precos) {
    return falha({ tipo: "limite-de-precos" });
  }

  const associacoes = new Map(
    aparelho.associacoes.map((associacao) => [associacao.id, associacao]),
  );
  const escolhaDoMercado: Associacao = {
    id: idDoMercado(preparo.cnpj),
    tipo: "mercado",
    cnpj: preparo.cnpj,
    mercadoId: mercado.id,
    mercadoNome: mercado.nome,
    atualizadaEm: criadoEm,
  };
  const gravar: Associacao[] = [escolhaDoMercado, ...escolhasLembradas];
  for (const associacao of gravar) associacoes.set(associacao.id, associacao);
  if (associacoes.size > limitesDaAssociacao.associacoes) {
    return falha({ tipo: "limite-de-escolhas" });
  }

  return sucesso({
    alteracoes: {
      observacoesDePreco: {
        gravar: novas,
        apagar: [...substituidas],
      },
      associacoes: { gravar },
    },
    observacoes: [...ficam, ...novas],
    associacoes: [...associacoes.values()],
    guardados: novas.length,
    ignorados: escolhas.filter((escolha) => escolha === "ignorar").length,
  });
}
