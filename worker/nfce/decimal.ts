/**
 * Números como a nota imprime: vírgula decimal e ponto de milhar ("1.234,56"). A leitura é
 * feita em texto e inteiros, sem ponto flutuante.
 */

const numero = /^(\d{1,3}(?:\.\d{3})+|\d{1,12})(?:,(\d{1,10}))?$/;

/** R$ 100 milhões em centavos: acima disso não é preço de mercado, é leitura errada. */
const limiteEmCentavos = 10_000_000_000;

function separar(texto: string): { inteiro: string; decimais: string } | undefined {
  const partes = numero.exec(texto.trim());
  if (partes === null) return undefined;
  return { inteiro: partes[1]!.replaceAll(".", ""), decimais: partes[2] ?? "" };
}

/**
 * "9,99" vira 999 e "1.234,5" vira 123450. Com mais de duas casas, arredonda a metade para
 * cima ("5,495" vira 550), como o preço unitário de produto vendido por peso. Devolve
 * `undefined` para o que não é número ou passa do limite.
 */
export function lerCentavos(texto: string): number | undefined {
  const partes = separar(texto);
  if (partes === undefined) return undefined;

  const centavos =
    Number(partes.inteiro) * 100 +
    Number(partes.decimais.padEnd(2, "0").slice(0, 2)) +
    (partes.decimais.length > 2 && partes.decimais[2]! >= "5" ? 1 : 0);
  return centavos <= limiteEmCentavos ? centavos : undefined;
}

/**
 * Quantidade como texto decimal com ponto, sem zeros sobrando: "2" fica "2", "0,3450" vira
 * "0.345" e "1.000,00" vira "1000". Devolve `undefined` para zero ou para o que não é número.
 */
export function lerQuantidade(texto: string): string | undefined {
  const partes = separar(texto);
  if (partes === undefined) return undefined;

  const inteiro = partes.inteiro.replace(/^0+(?=\d)/, "");
  const decimais = partes.decimais.replace(/0+$/, "");
  if (inteiro === "0" && decimais === "") return undefined;
  return decimais === "" ? inteiro : `${inteiro}.${decimais}`;
}
