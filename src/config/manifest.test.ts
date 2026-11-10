import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { siteName } from "./site";

const pastaPublica = resolve(import.meta.dirname, "../../public");
const lerArquivo = (caminho: string) => readFileSync(resolve(pastaPublica, `.${caminho}`));

interface Icone {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

interface Manifesto {
  name: string;
  short_name: string;
  lang: string;
  id: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: Icone[];
}

const manifesto = JSON.parse(lerArquivo("/manifest.webmanifest").toString("utf8")) as Manifesto;

/** Largura e altura gravadas no cabeçalho IHDR de um PNG. */
function tamanhoDoPng(bytes: Buffer): string {
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

// spec 0001 CA-37 (base): o app pode ser instalado na tela inicial do celular.
describe("manifest.webmanifest", () => {
  it("identifica o app e abre na página inicial, em tela cheia", () => {
    expect(manifesto).toMatchObject({
      name: siteName,
      short_name: siteName,
      lang: "pt-BR",
      id: "/",
      start_url: "/",
      scope: "/",
      display: "standalone",
    });
    expect(manifesto.short_name.length).toBeLessThanOrEqual(12);
  });

  it("usa cores em hexadecimal completo", () => {
    expect(manifesto.background_color).toMatch(/^#[0-9a-f]{6}$/);
    expect(manifesto.theme_color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("traz ícone de 192, de 512 e um mascarável, como a instalação exige", () => {
    const resumo = manifesto.icons.map((icone) => `${icone.sizes} ${icone.purpose}`);
    expect(resumo).toEqual(["192x192 any", "512x512 any", "512x512 maskable"]);
  });

  it.each(manifesto.icons)("o arquivo $src existe e tem o tamanho declarado", (icone) => {
    expect(icone.src).toMatch(/^\/[a-z0-9-]+\.png$/);
    expect(icone.type).toBe("image/png");
    expect(tamanhoDoPng(lerArquivo(icone.src))).toBe(icone.sizes);
  });

  it.each([
    ["/apple-touch-icon.png", "180x180"],
    ["/favicon-32.png", "32x32"],
    ["/compartilhamento.png", "1200x630"],
  ])("o arquivo %s que o layout usa tem %s", (caminho, tamanho) => {
    expect(tamanhoDoPng(lerArquivo(caminho))).toBe(tamanho);
  });

  it("o ícone vetorial não carrega script nem recurso de fora", () => {
    const svg = lerArquivo("/icone.svg").toString("utf8");
    expect(svg).toMatch(/^<svg /);
    expect(svg).not.toMatch(/<script|on\w+=|href=|url\(/i);
  });
});
