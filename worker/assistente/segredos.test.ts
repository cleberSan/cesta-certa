import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * spec 0001, CA-34: a chave da Anthropic e o código de acesso existem só como segredos do
 * Worker. Nenhum arquivo do repositório pode trazê-los; a varredura de segredos do GitHub é a
 * segunda trava. O que vai para o navegador é conferido no build da tela (T16).
 */
const padroes: readonly [string, RegExp][] = [
  ["chave da Anthropic", /sk-ant-[A-Za-z0-9_-]{16,}/],
  ["chave atribuída", /ANTHROPIC_API_KEY\s*[=:]\s*["'`]?[A-Za-z0-9_-]{16,}/],
  ["código atribuído", /ASSISTENTE_CODIGO\s*[=:]\s*["'`]?[^\s"'`,;)]{16,}/],
];

/** Lê direto, sem conferir antes: arquivo apagado ou pasta (submódulo) fica de fora. */
function lerTexto(caminho: string): string | null {
  try {
    return readFileSync(caminho, "utf8");
  } catch {
    return null;
  }
}

function arquivosDoRepositorio(): string[] {
  const raiz = new URL("../../", import.meta.url);
  const saida = execFileSync("git", ["ls-files", "-z"], { cwd: raiz, encoding: "utf8" });
  return saida
    .split("\0")
    .filter((caminho) => caminho !== "")
    .map((caminho) => new URL(caminho, raiz).pathname);
}

describe("segredos fora do repositório", () => {
  const arquivos = arquivosDoRepositorio();

  it("a lista de arquivos vem do git e inclui este teste", () => {
    expect(arquivos.some((caminho) => caminho.endsWith("worker/assistente/segredos.test.ts"))).toBe(
      true,
    );
  });

  // spec 0001 CA-34
  it("nenhum arquivo guardado traz a chave ou o código", () => {
    const achados: string[] = [];
    for (const caminho of arquivos) {
      const texto = lerTexto(caminho);
      if (texto === null) continue;
      for (const [nome, padrao] of padroes) {
        if (padrao.test(texto)) achados.push(`${nome} em ${caminho}`);
      }
    }

    expect(achados).toEqual([]);
  });

  // spec 0001 CA-34
  it("os arquivos locais de segredo do wrangler não entram no git", () => {
    const locais = arquivos.filter((caminho) => /\/\.dev\.vars|\/\.env(\.|$)/.test(caminho));

    expect(locais.filter((caminho) => !caminho.endsWith(".env.example"))).toEqual([]);
  });

  it("os padrões acham uma chave e um código de verdade", () => {
    const exemplos = [
      `sk-ant-api03-${"A".repeat(40)}`,
      `ANTHROPIC_API_KEY="${"b".repeat(30)}"`,
      `ASSISTENTE_CODIGO=${"c".repeat(40)}`,
    ];

    expect(exemplos.map((exemplo) => padroes.some(([, padrao]) => padrao.test(exemplo)))).toEqual([
      true,
      true,
      true,
    ]);
  });
});
