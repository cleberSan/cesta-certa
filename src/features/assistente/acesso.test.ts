import { describe, expect, it } from "vitest";
import {
  acessoInicial,
  idDoAssistente,
  lerAcesso,
  lerCodigoDigitado,
  registroDoAcesso,
  tamanhoMaximoDoCodigo,
  tamanhoMinimoDoCodigo,
} from "./acesso";

const codigo = "Abc123_-~!".padEnd(tamanhoMinimoDoCodigo, "z");
const aceitoEm = "2026-11-13T12:00:00.000Z";

describe("código de acesso digitado", () => {
  // spec 0001 CA-29
  it("aceita o código com 32 caracteres ou mais, sem os espaços das pontas", () => {
    expect(lerCodigoDigitado(`  ${codigo}\n`)).toEqual({ ok: true, valor: codigo });
    expect(lerCodigoDigitado("x".repeat(tamanhoMaximoDoCodigo)).ok).toBe(true);
  });

  it.each([
    ["vazio", "   ", "codigo-vazio"],
    ["curto", "x".repeat(tamanhoMinimoDoCodigo - 1), "codigo-curto"],
    ["longo", "x".repeat(tamanhoMaximoDoCodigo + 1), "codigo-longo"],
    ["com espaço no meio", `${"x".repeat(20)} ${"y".repeat(20)}`, "codigo-invalido"],
    ["com acento, que o cabeçalho HTTP recusa", `${"x".repeat(40)}ç`, "codigo-invalido"],
    ["com emoji", `${"x".repeat(40)}🛒`, "codigo-invalido"],
  ])("recusa o código %s", (_nome, texto, erro) => {
    expect(lerCodigoDigitado(texto)).toEqual({ ok: false, erro });
  });
});

describe("aceite e código guardados no aparelho", () => {
  it("sem registro, nada foi aceito nem digitado", () => {
    expect(lerAcesso([])).toEqual(acessoInicial);
    expect(lerAcesso([{ id: "ponto" }, null, "texto"])).toEqual(acessoInicial);
  });

  // spec 0001 CA-28
  it("lê o aceite e o código guardados", () => {
    const registro = registroDoAcesso({ aceitoEm, codigo });

    expect(registro).toEqual({ id: idDoAssistente, aceitoEm, codigo });
    expect(lerAcesso([{ id: "raio", km: 5 }, registro])).toEqual({ aceitoEm, codigo });
  });

  it.each([
    ["aceite fora do formato", { aceitoEm: "ontem", codigo }, { aceitoEm: null, codigo }],
    ["código curto", { aceitoEm, codigo: "curto" }, { aceitoEm, codigo: null }],
    ["código que não é texto", { aceitoEm, codigo: 123 }, { aceitoEm, codigo: null }],
  ])("trata %s como ausente", (_nome, campos, esperado) => {
    expect(lerAcesso([{ id: idDoAssistente, ...campos }])).toEqual(esperado);
  });
});
