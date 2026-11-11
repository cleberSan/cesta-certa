/**
 * Identificador aleatório (UUID versão 4) para os registros guardados no aparelho. Usa o
 * gerador do navegador; onde `randomUUID` não existe (navegador antigo, página sem https),
 * monta o mesmo formato com bytes aleatórios da mesma fonte.
 */
export function gerarId(
  cripto: Pick<Crypto, "getRandomValues"> & Partial<Pick<Crypto, "randomUUID">> = globalThis.crypto,
): string {
  if (typeof cripto.randomUUID === "function") return cripto.randomUUID();

  const bytes = cripto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
