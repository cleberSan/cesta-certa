/** Busca de cidade para "Escolher cidade" (CA-05), feita no aparelho sobre cidades.json. */
import type { Cidade } from "../../shared/contratos/mercados";
import { limparTexto } from "../../shared/texto";

export const limiteDeResultados = 20;

/** Sem acento, sem maiúsculas e sem pontuação, mas sem tirar o plural ("Campinas"). */
function chaveDaBusca(texto: string): string {
  return limparTexto(texto)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Cidades cujo nome (ou "nome UF") contém o termo, a partir de 2 letras. Primeiro as que
 * começam pelo termo, depois as que têm uma palavra começando por ele, depois o resto; em
 * cada grupo, a ordem do arquivo (UF e nome).
 */
export function buscarCidades(
  cidades: readonly Cidade[],
  termo: string,
  limite = limiteDeResultados,
): Cidade[] {
  const busca = chaveDaBusca(termo);
  if (busca.length < 2) return [];
  const grupos: [Cidade[], Cidade[], Cidade[]] = [[], [], []];
  for (const cidade of cidades) {
    const nome = chaveDaBusca(cidade.nome);
    const completo = `${nome} ${cidade.uf.toLowerCase()}`;
    if (nome.startsWith(busca) || completo.startsWith(busca)) grupos[0].push(cidade);
    else if (` ${completo}`.includes(` ${busca}`)) grupos[1].push(cidade);
    else if (completo.includes(busca)) grupos[2].push(cidade);
  }
  return grupos.flat().slice(0, limite);
}

export function rotuloDaCidade(cidade: Cidade): string {
  return `${cidade.nome}, ${cidade.uf}`;
}
