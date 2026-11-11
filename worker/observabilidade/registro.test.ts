import { afterEach, describe, expect, it, vi } from "vitest";
import { registrarNoConsole } from "./registro";

describe("registrarNoConsole", () => {
  afterEach(() => vi.restoreAllMocks());

  it("escreve uma linha JSON por evento", () => {
    const saida = vi.spyOn(console, "log").mockImplementation(() => undefined);

    registrarNoConsole({ evento: "nfce.consulta", resultado: "ok", duracaoMs: 120, itens: 3 });

    expect(saida).toHaveBeenCalledTimes(1);
    const linha = String(saida.mock.calls[0]?.[0]);
    expect(linha).not.toContain("\n");
    expect(JSON.parse(linha)).toEqual({
      evento: "nfce.consulta",
      resultado: "ok",
      duracaoMs: 120,
      itens: 3,
    });
  });
});
