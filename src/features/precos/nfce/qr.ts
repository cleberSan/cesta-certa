/**
 * Leitura do QR Code do cupom pela câmera (spec 0001, CA-10; ADR-0003). O navegador que tem o
 * `BarcodeDetector` (Chrome no Android) lê sozinho; os outros (Safari no iPhone, Firefox) usam
 * o jsQR, baixado só quando a câmera abre. A imagem da câmera fica no aparelho: só o texto do
 * QR, quando parece o link de uma nota, segue para a consulta.
 *
 * As regras e os textos ficam aqui, com teste de unidade; a tela (`LeitorDeQr.tsx`) só liga a
 * câmera e chama estas funções.
 */
import { limiteDoLink } from "../../../shared/contratos/nfce";

/** Imagem de um quadro da câmera em RGBA, como o canvas devolve. */
export interface Quadro {
  readonly pixels: Uint8ClampedArray;
  readonly largura: number;
  readonly altura: number;
}

export type LerQuadro = (quadro: Quadro) => string | null;

/** Lê o texto do QR na imagem da câmera, pelo detector do próprio navegador. */
export type LerImagem = (imagem: CanvasImageSource) => Promise<string | null>;

interface DetectorDoNavegador {
  detect(imagem: CanvasImageSource): Promise<readonly { readonly rawValue: string }[]>;
}

interface ConstrutorDoDetector {
  new (opcoes: { formats: string[] }): DetectorDoNavegador;
  getSupportedFormats(): Promise<readonly string[]>;
}

/**
 * O detector do navegador, quando ele existe e lê QR Code; senão, nulo. Qualquer falha ao
 * perguntar vira nulo: o jsQR fica de reserva.
 */
export async function detectorDoNavegador(global: object = globalThis): Promise<LerImagem | null> {
  const { BarcodeDetector: Construtor } = global as { readonly BarcodeDetector?: unknown };
  if (typeof Construtor !== "function") return null;
  const Detector = Construtor as ConstrutorDoDetector;
  try {
    const formatos = await Detector.getSupportedFormats();
    if (!formatos.includes("qr_code")) return null;
    const detector = new Detector({ formats: ["qr_code"] });
    return async (imagem) => {
      const achados = await detector.detect(imagem);
      return achados[0]?.rawValue ?? null;
    };
  } catch {
    return null;
  }
}

/** O jsQR, importado sob demanda: fica fora do JavaScript inicial da página. */
export async function carregarJsQr(): Promise<LerQuadro> {
  const { default: jsQR } = await import("jsqr");
  return ({ pixels, largura, altura }) =>
    // O QR impresso no cupom é preto no branco: tentar a imagem invertida só gastaria tempo.
    jsQR(pixels, largura, altura, { inversionAttempts: "dontInvert" })?.data ?? null;
}

/** Lado maior do quadro entregue ao jsQR: lê o QR do cupom e cabe no tempo de um celular. */
export const ladoMaximoDoQuadro = 800;

/** Tamanho do quadro reduzido, mantendo a proporção; nunca aumenta a imagem. */
export function tamanhoDoQuadro(
  largura: number,
  altura: number,
  maximo: number = ladoMaximoDoQuadro,
): { readonly largura: number; readonly altura: number } {
  const maior = Math.max(largura, altura);
  if (maior <= maximo) return { largura, altura };
  const escala = maximo / maior;
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  };
}

/** Intervalo entre duas tentativas de leitura, em milissegundos. */
export const intervaloDaLeituraMs = 250;

/**
 * O texto lido parece o link de uma nota: um endereço web, sem espaço, dentro do tamanho que o
 * servidor aceita. Outro QR (Wi-Fi, contato, Pix) nunca sai do aparelho; o servidor ainda
 * confere o endereço inteiro (CA-12).
 */
export function pareceLinkDeNota(texto: string): boolean {
  const limpo = texto.trim();
  return limpo.length <= limiteDoLink && /^https?:\/\/[^\s]+$/i.test(limpo);
}

export type FalhaDaCamera = "permissao" | "sem-camera" | "ocupada" | "sem-leitor" | "falhou";

/** Traduz o erro do `getUserMedia` (um `DOMException`) para a mensagem da tela. */
export function falhaDaCamera(erro: unknown): FalhaDaCamera {
  const nome = erro instanceof Error || erro instanceof DOMException ? erro.name : "";
  switch (nome) {
    case "NotAllowedError":
    case "SecurityError":
      return "permissao";
    case "NotFoundError":
    case "OverconstrainedError":
      return "sem-camera";
    case "NotReadableError":
    case "AbortError":
      return "ocupada";
    default:
      return "falhou";
  }
}

export function mensagemDaCamera(falha: FalhaDaCamera): string {
  switch (falha) {
    case "permissao":
      return "O navegador não deixou usar a câmera. Libere a câmera para este site nas configurações do navegador, ou cole o link da nota no campo abaixo.";
    case "sem-camera":
      return "Nenhuma câmera foi encontrada neste aparelho. Cole o link da nota no campo abaixo.";
    case "ocupada":
      return "A câmera está sendo usada por outro aplicativo. Feche o outro aplicativo e tente de novo, ou cole o link da nota.";
    case "sem-leitor":
      return "O leitor de QR Code não carregou. Confira a conexão e tente de novo, ou cole o link da nota.";
    case "falhou":
      return "A câmera não abriu. Tente de novo ou cole o link da nota no campo abaixo.";
  }
}

export const avisoDeOutroQr =
  "Esse QR Code não é o de uma nota fiscal. Aponte para o QR Code impresso no cupom.";
