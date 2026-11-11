import { falha, sucesso, type Resultado } from "../../src/shared/resultado";

/**
 * Chave de acesso da nota fiscal eletrônica: 44 posições.
 *
 * | Posições | Campo |
 * |---|---|
 * | 1-2 | UF do emitente (código do IBGE; 35 = São Paulo) |
 * | 3-6 | Ano e mês da emissão (AAMM) |
 * | 7-20 | CNPJ do emitente |
 * | 21-22 | Modelo (65 = NFC-e, a nota do consumidor) |
 * | 23-25 | Série |
 * | 26-34 | Número |
 * | 35 | Tipo de emissão |
 * | 36-43 | Código numérico |
 * | 44 | Dígito verificador (módulo 11) |
 *
 * O CNPJ pode ter letras nas 12 primeiras posições (CNPJ alfanumérico, em uso desde julho de
 * 2026). No dígito verificador, cada caractere vale o código ASCII menos 48, a mesma regra do
 * próprio CNPJ: dígitos continuam valendo de 0 a 9 e "A" vale 17.
 */
export interface ChaveDeAcesso {
  readonly valor: string;
  /** Código do IBGE da UF do emitente, com dois dígitos. */
  readonly uf: string;
  /** Ano e mês da emissão, "AAAA-MM". */
  readonly anoMes: string;
  readonly cnpj: string;
  readonly modelo: string;
}

export type ErroDeChave = "formato" | "mes" | "digito";

const formato = /^\d{6}[0-9A-Z]{12}\d{26}$/;

/** Dígito verificador das 43 primeiras posições: módulo 11 com pesos de 2 a 9. */
export function digitoVerificador(base: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += (base.charCodeAt(i) - 48) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function lerChave(texto: string): Resultado<ChaveDeAcesso, ErroDeChave> {
  if (!formato.test(texto)) return falha("formato");

  const mes = Number(texto.slice(4, 6));
  if (mes < 1 || mes > 12) return falha("mes");

  if (digitoVerificador(texto.slice(0, 43)) !== Number(texto[43])) return falha("digito");

  return sucesso({
    valor: texto,
    uf: texto.slice(0, 2),
    anoMes: `20${texto.slice(2, 4)}-${texto.slice(4, 6)}`,
    cnpj: texto.slice(6, 20),
    modelo: texto.slice(20, 22),
  });
}
