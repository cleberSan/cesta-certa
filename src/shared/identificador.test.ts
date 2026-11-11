import { describe, expect, it } from "vitest";
import { gerarId } from "./identificador";

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("gerarId", () => {
  it("usa o gerador do ambiente e não repete", () => {
    const ids = new Set(Array.from({ length: 200 }, () => gerarId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(uuidV4);
  });

  it("usa randomUUID quando existe", () => {
    const fixo = "11111111-2222-4333-8444-555555555555";
    const cripto = {
      randomUUID: () => fixo,
      getRandomValues: () => {
        throw new Error("não deveria ser chamado");
      },
    } as unknown as Crypto;

    expect(gerarId(cripto)).toBe(fixo);
  });

  it.each([
    ["zeros", 0x00, "00000000-0000-4000-8000-000000000000"],
    ["uns", 0xff, "ffffffff-ffff-4fff-bfff-ffffffffffff"],
    ["alternados", 0xa5, "a5a5a5a5-a5a5-45a5-a5a5-a5a5a5a5a5a5"],
  ])("sem randomUUID, monta um UUID versão 4 com bytes %s", (_caso, byte, esperado) => {
    const cripto = {
      getRandomValues: <T extends ArrayBufferView>(vetor: T): T => {
        new Uint8Array(vetor.buffer).fill(byte);
        return vetor;
      },
    } as Pick<Crypto, "getRandomValues">;

    const id = gerarId(cripto);

    expect(id).toBe(esperado);
    expect(id).toMatch(uuidV4);
  });
});
