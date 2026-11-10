import { describe, expect, it } from "vitest";
import { declaraMaisQue, lerComLimite } from "./corpo";

function emPedacos(tamanhos: readonly number[], aoCancelar?: () => void) {
  let proximo = 0;
  return new ReadableStream<Uint8Array>(
    {
      pull(controlador) {
        const tamanho = tamanhos[proximo++];
        if (tamanho === undefined) controlador.close();
        else controlador.enqueue(new Uint8Array(tamanho).fill(proximo));
      },
      cancel() {
        aoCancelar?.();
      },
    },
    { highWaterMark: 0 },
  );
}

describe("lerComLimite", () => {
  it("devolve corpo vazio quando não há corpo", async () => {
    expect(await lerComLimite(null, 10)).toEqual(new Uint8Array(0));
  });

  it("junta os pedaços na ordem em que chegaram", async () => {
    const lido = await lerComLimite(emPedacos([2, 3, 1]), 10);
    expect(lido).toEqual(new Uint8Array([1, 1, 2, 2, 2, 3]));
  });

  it("aceita o corpo com exatamente o tamanho do limite", async () => {
    expect((await lerComLimite(emPedacos([4, 6]), 10))?.byteLength).toBe(10);
  });

  it("para de ler e cancela a origem ao passar do limite em um byte", async () => {
    let cancelado = false;
    const corpo = emPedacos([4, 7, 1000], () => (cancelado = true));

    expect(await lerComLimite(corpo, 10)).toBeUndefined();
    expect(cancelado).toBe(true);
  });
});

describe("declaraMaisQue", () => {
  const com = (valor?: string) =>
    new Headers(valor === undefined ? {} : { "Content-Length": valor });

  it.each([
    ["sem o cabeçalho", undefined, false],
    ["abaixo do limite", "99", false],
    ["igual ao limite", "100", false],
    ["acima do limite", "101", true],
    ["valor que não é número", "muito", false],
    ["valor negativo", "-5", false],
  ])("%s", (_caso, valor, esperado) => {
    expect(declaraMaisQue(com(valor), 100)).toBe(esperado);
  });
});
