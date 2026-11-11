/**
 * Lê um corpo em pedaços e para ao passar do limite, para que nem a requisição de quem chama
 * nem a resposta de um site consultado ocupem memória sem teto. Devolve `undefined` quando o
 * limite é ultrapassado.
 */
export async function lerComLimite(
  corpo: ReadableStream<Uint8Array> | null,
  limite: number,
): Promise<Uint8Array | undefined> {
  if (corpo === null) return new Uint8Array(0);

  const leitor = corpo.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await leitor.cancel();
      return undefined;
    }
    partes.push(value);
  }

  const tudo = new Uint8Array(total);
  let posicao = 0;
  for (const parte of partes) {
    tudo.set(parte, posicao);
    posicao += parte.byteLength;
  }
  return tudo;
}

/** O Content-Length declarado já passa do limite? Sem o cabeçalho, quem decide é a leitura. */
export function declaraMaisQue(cabecalhos: Headers, limite: number): boolean {
  const declarado = Number(cabecalhos.get("content-length") ?? "0");
  return Number.isFinite(declarado) && declarado > limite;
}
