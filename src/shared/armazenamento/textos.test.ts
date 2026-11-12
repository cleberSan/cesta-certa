import { describe, expect, it } from "vitest";
import type { ErroDoBanco } from "./banco";
import { mensagemDoBanco } from "./textos";

const motivos: readonly ErroDoBanco[] = [
  "indisponivel",
  "versao-mais-nova",
  "fechado",
  "sem-espaco",
  "falhou",
];

describe("mensagemDoBanco", () => {
  it.each(motivos)("explica a falha %s sem termo técnico", (motivo) => {
    const mensagem = mensagemDoBanco(motivo);

    expect(mensagem.length).toBeGreaterThan(20);
    expect(mensagem).not.toMatch(/undefined|IndexedDB|transa/i);
    expect(mensagem.endsWith(".")).toBe(true);
  });

  it("tem uma frase diferente para cada falha", () => {
    expect(new Set(motivos.map(mensagemDoBanco)).size).toBe(motivos.length);
  });

  it("diz que nada foi alterado quando a gravação falha", () => {
    expect(mensagemDoBanco("sem-espaco")).toContain("Nada foi alterado");
    expect(mensagemDoBanco("falhou")).toContain("Nada foi alterado");
  });

  it("pede para recarregar quando os dados mudaram em outra aba ou o app é mais novo", () => {
    expect(mensagemDoBanco("fechado")).toContain("Recarregue");
    expect(mensagemDoBanco("versao-mais-nova")).toContain("Recarregue");
  });
});
