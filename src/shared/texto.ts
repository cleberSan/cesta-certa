/**
 * Texto digitado pela pessoa ou vindo de um arquivo importado: limpo antes de guardar e
 * comparado sem diferença de maiúsculas, acentos e plural simples (spec 0001, CA-03).
 */

/**
 * Tira caracteres invisíveis (controle de direção do texto, largura zero), troca quebras de
 * linha, tabulações e espaços especiais por um espaço só e apara as pontas.
 */
export function limparTexto(texto: string): string {
  return texto
    .normalize("NFC")
    .replace(/\p{Cf}+/gu, "")
    .replace(/[\p{Cc}\p{Z}]+/gu, " ")
    .trim();
}

/**
 * Chave para saber se dois nomes são o mesmo item: sem maiúsculas, acentos e pontuação, e com
 * cada palavra no singular. Cobre o plural em "s" (banana, bananas) e em "ões" e "ães" (limão,
 * limões; pão, pães). Plural irregular fica de fora: nesse caso o app só não avisa.
 */
export function chaveDeComparacao(texto: string): string {
  return limparTexto(texto)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .map(singular)
    .join(" ");
}

function singular(palavra: string): string {
  if (palavra.length >= 4 && /[ao]es$/.test(palavra)) return `${palavra.slice(0, -3)}ao`;
  if (palavra.length >= 3 && palavra.endsWith("s")) return palavra.slice(0, -1);
  return palavra;
}
