// Gera os PNGs de public/ a partir de public/icone.svg, com o Chromium do Playwright (já é
// dependência de desenvolvimento). Rode só quando o desenho mudar: `node scripts/gerar-icones.mjs`.
// Os PNGs ficam versionados, então o build não depende deste script.
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const publicDir = new URL("../public/", import.meta.url);
const svg = await readFile(new URL("icone.svg", publicDir), "utf8");
const desenho = svg.replace(/<rect[^>]*\/>/, "");
const dataUrl = (conteudo) =>
  `data:image/svg+xml;base64,${Buffer.from(conteudo).toString("base64")}`;

const verde = "#0f6b4f";
const pagina = (largura, altura, corpo, fundo = "transparent") => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: ${largura}px; height: ${altura}px; background: ${fundo}; }
  body { display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; }
</style></head><body>${corpo}</body></html>`;

const imagens = [
  {
    arquivo: "icone-192.png",
    largura: 192,
    altura: 192,
    html: pagina(192, 192, `<img src="${dataUrl(svg)}" width="192" height="192" alt="">`),
  },
  {
    arquivo: "icone-512.png",
    largura: 512,
    altura: 512,
    html: pagina(512, 512, `<img src="${dataUrl(svg)}" width="512" height="512" alt="">`),
  },
  {
    arquivo: "favicon-32.png",
    largura: 32,
    altura: 32,
    html: pagina(32, 32, `<img src="${dataUrl(svg)}" width="32" height="32" alt="">`),
  },
  // iOS aplica o próprio arredondamento: fundo inteiro, sem cantos transparentes.
  {
    arquivo: "apple-touch-icon.png",
    largura: 180,
    altura: 180,
    html: pagina(
      180,
      180,
      `<img src="${dataUrl(desenho)}" width="180" height="180" alt="">`,
      verde,
    ),
  },
  // Ícone mascarável: fundo até a borda e desenho dentro da área segura (80% do lado).
  {
    arquivo: "icone-mascaravel-512.png",
    largura: 512,
    altura: 512,
    html: pagina(
      512,
      512,
      `<img src="${dataUrl(desenho)}" width="400" height="400" alt="">`,
      verde,
    ),
  },
  {
    arquivo: "compartilhamento.png",
    largura: 1200,
    altura: 630,
    html: pagina(
      1200,
      630,
      `<div style="display:flex;align-items:center;gap:56px;color:#fff">
        <img src="${dataUrl(desenho)}" width="300" height="300" alt="">
        <div><div style="font-size:104px;font-weight:800;letter-spacing:-2px">Cesta Certa</div>
        <div style="font-size:44px;margin-top:12px;opacity:.92">a compra do mês no mercado certo</div></div>
      </div>`,
      verde,
    ),
  },
];

const navegador = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {},
);
try {
  for (const { arquivo, largura, altura, html } of imagens) {
    const aba = await navegador.newPage({
      viewport: { width: largura, height: altura },
      deviceScaleFactor: 1,
    });
    await aba.setContent(html);
    await aba
      .locator("img")
      .first()
      .evaluate((img) => img.decode());
    await aba.screenshot({ path: new URL(arquivo, publicDir).pathname, omitBackground: true });
    await aba.close();
    console.log(`gerado public/${arquivo}`);
  }
} finally {
  await navegador.close();
}
