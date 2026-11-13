/**
 * Opções que os formulários de preço oferecem (spec 0001, CA-15): os produtos das listas e os
 * mercados que fazem sentido para a pessoa. Contas puras; a tela só mostra.
 */
import { chaveDoItem, type Estado } from "../lista/lista";
import { formatarDistancia } from "../mercados/geo";
import type { ComPonto, Proximo } from "../mercados/proximos";
import type { MercadoProprio } from "../mercados/proprios";
import type { ObservacaoDePreco } from "./precos";

const ordemDosNomes = new Intl.Collator("pt-BR", { sensitivity: "base" });

/** Nomes dos itens de todas as listas, sem repetir o mesmo produto, em ordem alfabética. */
export function produtosDasListas(lista: Estado): readonly string[] {
  const porChave = new Map<string, string>();
  for (const item of lista.itens) {
    const chave = chaveDoItem(item.nome);
    if (!porChave.has(chave)) porChave.set(chave, item.nome);
  }
  return [...porChave.values()].sort(ordemDosNomes.compare);
}

export interface OpcaoDeMercado {
  readonly id: string;
  readonly nome: string;
  /** "1,2 km", "cadastrado por você" ou "usado antes". */
  readonly detalhe: string;
}

/**
 * Os mercados perto do ponto, em ordem de distância; depois os cadastrados pela pessoa que
 * ficaram fora do raio; por fim os que já têm preço guardado e não apareceram antes. Cada
 * mercado aparece uma vez.
 */
export function opcoesDeMercado(
  proximos: readonly Proximo<ComPonto>[],
  proprios: readonly MercadoProprio[],
  observacoes: readonly ObservacaoDePreco[],
): readonly OpcaoDeMercado[] {
  const opcoes = new Map<string, OpcaoDeMercado>();
  const doAparelho = new Set(proprios.map((mercado) => mercado.id));
  for (const mercado of proximos) {
    const distancia = formatarDistancia(mercado.distanciaKm);
    opcoes.set(mercado.id, {
      id: mercado.id,
      nome: mercado.nome,
      detalhe: doAparelho.has(mercado.id) ? `${distancia}, cadastrado por você` : distancia,
    });
  }
  const restantes = [...proprios].sort((a, b) => ordemDosNomes.compare(a.nome, b.nome));
  for (const mercado of restantes) {
    if (!opcoes.has(mercado.id)) {
      opcoes.set(mercado.id, {
        id: mercado.id,
        nome: mercado.nome,
        detalhe: "cadastrado por você",
      });
    }
  }
  const usados = [...observacoes].sort(
    (a, b) => ordemDosNomes.compare(a.mercadoNome, b.mercadoNome) || (a.id < b.id ? -1 : 1),
  );
  for (const observacao of usados) {
    if (!opcoes.has(observacao.mercadoId)) {
      opcoes.set(observacao.mercadoId, {
        id: observacao.mercadoId,
        nome: observacao.mercadoNome,
        detalhe: "usado antes",
      });
    }
  }
  return [...opcoes.values()];
}
