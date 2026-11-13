import { describe, expect, it } from "vitest";
import { codigoConfere, lerCodigo } from "./acesso";

const codigo = "um-codigo-de-teste-com-mais-de-32-caracteres";

function cabecalhos(autorizacao?: string): Headers {
  return new Headers(autorizacao === undefined ? {} : { Authorization: autorizacao });
}

describe("lerCodigo", () => {
  it.each([
    ["Bearer abc", "abc"],
    ["bearer abc", "abc"],
    ["Bearer    abc", "abc"],
  ])("lê o código de %j", (valor, esperado) => {
    expect(lerCodigo(cabecalhos(valor))).toBe(esperado);
  });

  // spec 0001 CA-29
  it.each([undefined, "", "Basic abc", "Bearer", "Bearer ", "Bearer a b", "abc"])(
    "sem código legível em %j",
    (valor) => {
      expect(lerCodigo(cabecalhos(valor))).toBeNull();
    },
  );

  it("recusa um código longo demais sem resumi-lo", () => {
    expect(lerCodigo(cabecalhos(`Bearer ${"a".repeat(513)}`))).toBeNull();
    expect(lerCodigo(cabecalhos(`Bearer ${"a".repeat(512)}`))).toHaveLength(512);
  });
});

describe("codigoConfere", () => {
  it("aceita o código igual", async () => {
    expect(await codigoConfere(codigo, codigo)).toBe(true);
  });

  // spec 0001 CA-29
  it.each([
    ["ausente", null],
    ["vazio", ""],
    ["com um caractere a menos", codigo.slice(0, -1)],
    ["com um caractere a mais", `${codigo}x`],
    ["com a última letra trocada", `${codigo.slice(0, -1)}X`],
    ["em maiúsculas", codigo.toUpperCase()],
  ])("recusa o código %s", async (_, recebido) => {
    expect(await codigoConfere(recebido, codigo)).toBe(false);
  });

  it("um código vazio no servidor não deixa passar quem não manda código", async () => {
    expect(await codigoConfere(null, "")).toBe(false);
  });
});
