/**
 * Código de acesso do assistente (spec 0001, CA-29; ADR-0004): um texto longo e aleatório que o
 * Cleber cria, guarda só como segredo do Worker (`ASSISTENTE_CODIGO`) e digita uma vez em cada
 * aparelho. O app manda no cabeçalho `Authorization: Bearer <código>`.
 */

/** Abaixo disso o assistente fica desligado: código curto se adivinha. */
export const tamanhoMinimoDoCodigo = 32;

/** Bem acima de qualquer código razoável; só evita resumir um cabeçalho enorme. */
const tamanhoMaximoDoCodigo = 512;

export function lerCodigo(cabecalhos: Headers): string | null {
  const valor = cabecalhos.get("authorization");
  if (valor === null) return null;
  const achado = /^Bearer +(\S+)$/i.exec(valor);
  const codigo = achado?.[1];
  return codigo !== undefined && codigo.length <= tamanhoMaximoDoCodigo ? codigo : null;
}

async function resumo(texto: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
}

/**
 * Compara em tempo constante: resume os dois com SHA-256 (o mesmo tamanho, seja qual for o do
 * código) e confere todos os bytes, sem parar no primeiro diferente. Assim o tempo da resposta
 * não diz quantos caracteres acertaram.
 */
export async function codigoConfere(recebido: string | null, esperado: string): Promise<boolean> {
  const [daPessoa, doServidor] = await Promise.all([resumo(recebido ?? ""), resumo(esperado)]);
  let diferenca = recebido === null ? 1 : 0;
  for (let i = 0; i < doServidor.length; i += 1) {
    diferenca |= (daPessoa[i] ?? 0) ^ (doServidor[i] ?? 0);
  }
  return diferenca === 0;
}
