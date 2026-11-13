import { describe, expect, it, vi } from "vitest";
import { modulosDoQr, textoDoQr } from "./fixtures/qr-da-nota";
import {
  carregarJsQr,
  detectorDoNavegador,
  falhaDaCamera,
  mensagemDaCamera,
  pareceLinkDeNota,
  tamanhoDoQuadro,
  type FalhaDaCamera,
  type Quadro,
} from "./qr";

/** Desenha os módulos do QR em RGBA, com margem branca e `escala` pixels por módulo. */
function desenhar(modulos: readonly string[], escala = 4, margem = 4): Quadro {
  const lado = (modulos.length + margem * 2) * escala;
  const pixels = new Uint8ClampedArray(lado * lado * 4).fill(255);
  modulos.forEach((linha, y) => {
    [...linha].forEach((modulo, x) => {
      if (modulo !== "1") return;
      for (let dy = 0; dy < escala; dy++) {
        for (let dx = 0; dx < escala; dx++) {
          const px = (x + margem) * escala + dx;
          const py = (y + margem) * escala + dy;
          const i = (py * lado + px) * 4;
          pixels[i] = 0;
          pixels[i + 1] = 0;
          pixels[i + 2] = 0;
        }
      }
    });
  });
  return { pixels, largura: lado, altura: lado };
}

function detectorFalso(formatos: readonly string[], achados: readonly { rawValue: string }[]) {
  const detect = vi.fn(async () => achados);
  const criados: unknown[] = [];
  class Detector {
    static getSupportedFormats = vi.fn(async () => formatos);
    constructor(opcoes: unknown) {
      criados.push(opcoes);
    }
    detect = detect;
  }
  return { Detector, detect, criados };
}

// spec 0001 CA-10
describe("carregarJsQr", () => {
  it("lê o link do QR Code do cupom numa imagem da câmera", async () => {
    const ler = await carregarJsQr();

    expect(ler(desenhar(modulosDoQr))).toBe(textoDoQr);
  });

  it("devolve nulo quando a imagem não tem QR Code", async () => {
    const ler = await carregarJsQr();
    const branca = {
      pixels: new Uint8ClampedArray(64 * 64 * 4).fill(255),
      largura: 64,
      altura: 64,
    };

    expect(ler(branca)).toBeNull();
  });
});

// spec 0001 CA-10
describe("detectorDoNavegador", () => {
  it("usa o detector do navegador quando ele lê QR Code", async () => {
    const { Detector, detect, criados } = detectorFalso(
      ["ean_13", "qr_code"],
      [{ rawValue: textoDoQr }],
    );

    const ler = await detectorDoNavegador({ BarcodeDetector: Detector });
    const imagem = {} as CanvasImageSource;

    expect(ler).not.toBeNull();
    expect(await ler!(imagem)).toBe(textoDoQr);
    expect(criados).toEqual([{ formats: ["qr_code"] }]);
    expect(detect).toHaveBeenCalledWith(imagem);
  });

  it("devolve nulo no quadro sem QR Code", async () => {
    const { Detector } = detectorFalso(["qr_code"], []);

    const ler = await detectorDoNavegador({ BarcodeDetector: Detector });

    expect(await ler!({} as CanvasImageSource)).toBeNull();
  });

  it("fica sem detector no navegador que não tem a API", async () => {
    expect(await detectorDoNavegador({})).toBeNull();
    expect(await detectorDoNavegador({ BarcodeDetector: "não é função" })).toBeNull();
  });

  it("fica sem detector quando o navegador não lê QR Code", async () => {
    const { Detector } = detectorFalso(["ean_13"], []);

    expect(await detectorDoNavegador({ BarcodeDetector: Detector })).toBeNull();
  });

  it("fica sem detector quando perguntar os formatos falha", async () => {
    const { Detector } = detectorFalso([], []);
    Detector.getSupportedFormats.mockRejectedValueOnce(new Error("indisponível"));

    expect(await detectorDoNavegador({ BarcodeDetector: Detector })).toBeNull();
  });
});

describe("tamanhoDoQuadro", () => {
  it.each([
    [1280, 720, { largura: 800, altura: 450 }],
    [720, 1280, { largura: 450, altura: 800 }],
    [800, 600, { largura: 800, altura: 600 }],
    [801, 801, { largura: 800, altura: 800 }],
    [640, 480, { largura: 640, altura: 480 }],
    [10_000, 1, { largura: 800, altura: 1 }],
  ])("%ix%i vira %o", (largura, altura, esperado) => {
    expect(tamanhoDoQuadro(largura, altura)).toEqual(esperado);
  });
});

// spec 0001 CA-10
describe("pareceLinkDeNota", () => {
  it.each([
    [textoDoQr, true],
    [`  ${textoDoQr}  `, true],
    ["http://www.nfce.fazenda.sp.gov.br/qrcode?p=123", true],
    ["WIFI:S:Casa;T:WPA;P:senha;;", false],
    ["00020126580014BR.GOV.BCB.PIX0136", false],
    ["https://exemplo.com/com espaço", false],
    ["ftp://www.nfce.fazenda.sp.gov.br", false],
    ["", false],
    [`https://a.b/${"x".repeat(2048)}`, false],
  ])("%s → %s", (texto, esperado) => {
    expect(pareceLinkDeNota(texto)).toBe(esperado);
  });
});

describe("falhaDaCamera", () => {
  it.each([
    ["NotAllowedError", "permissao"],
    ["SecurityError", "permissao"],
    ["NotFoundError", "sem-camera"],
    ["OverconstrainedError", "sem-camera"],
    ["NotReadableError", "ocupada"],
    ["AbortError", "ocupada"],
    ["TypeError", "falhou"],
  ] as const)("%s vira %s", (nome, esperado) => {
    expect(falhaDaCamera(new DOMException("x", nome))).toBe(esperado);
  });

  it("trata o que não é erro como falha genérica", () => {
    expect(falhaDaCamera("texto")).toBe("falhou");
    expect(falhaDaCamera(null)).toBe("falhou");
    expect(falhaDaCamera(Object.assign(new Error("x"), { name: "NotFoundError" }))).toBe(
      "sem-camera",
    );
  });

  it.each<FalhaDaCamera>(["permissao", "sem-camera", "ocupada", "sem-leitor", "falhou"])(
    "a falha %s sempre aponta a saída de colar o link",
    (falha) => {
      expect(mensagemDaCamera(falha)).toMatch(/cole o link/i);
    },
  );
});
