import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import {
  avisoDeOutroQr,
  carregarJsQr,
  detectorDoNavegador,
  falhaDaCamera,
  intervaloDaLeituraMs,
  mensagemDaCamera,
  pareceLinkDeNota,
  tamanhoDoQuadro,
  type FalhaDaCamera,
  type LerImagem,
  type LerQuadro,
} from "./qr";

type Estado =
  | { fase: "fechada" }
  | { fase: "abrindo" }
  | { fase: "lendo"; outroQr: boolean }
  | { fase: "falhou"; falha: FalhaDaCamera };

const semAssinatura = () => () => undefined;

/** O navegador oferece a câmera: só em https e com a API de mídia. Falso no HTML do build. */
function useTemCamera(): boolean {
  return useSyncExternalStore(
    semAssinatura,
    () => typeof globalThis.navigator?.mediaDevices?.getUserMedia === "function",
    () => false,
  );
}

function desligar(fluxo: MediaStream | null) {
  for (const trilha of fluxo?.getTracks() ?? []) trilha.stop();
}

/**
 * Botão que abre a câmera de trás e lê o QR Code do cupom (spec 0001, CA-10). A imagem nunca
 * sai do aparelho: cada quadro é lido aqui e só o link da nota volta para a tela. A câmera
 * desliga assim que o link é lido, no "Fechar a câmera" e quando a tela sai.
 */
export function LeitorDeQr({
  desligado,
  onLer,
}: {
  desligado: boolean;
  onLer: (link: string) => void;
}) {
  const temCamera = useTemCamera();
  const [estado, setEstado] = useState<Estado>({ fase: "fechada" });
  const video = useRef<HTMLVideoElement>(null);
  const aberta = estado.fase === "abrindo" || estado.fase === "lendo";
  const entregar = useEffectEvent((link: string) => {
    setEstado({ fase: "fechada" });
    onLer(link);
  });

  useEffect(() => {
    const elemento = video.current;
    if (!aberta || elemento === null) return;
    let ativa = true;
    let fluxo: MediaStream | null = null;
    let proxima: ReturnType<typeof setTimeout> | undefined;

    const falhar = (falha: FalhaDaCamera) => {
      if (ativa) setEstado({ fase: "falhou", falha });
    };

    async function abrir(elemento: HTMLVideoElement) {
      try {
        fluxo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (erro) {
        falhar(falhaDaCamera(erro));
        return;
      }
      if (!ativa) {
        desligar(fluxo);
        return;
      }
      elemento.srcObject = fluxo;
      // Vídeo sem som pode tocar sozinho; se o navegador recusar, os quadros chegam mesmo assim.
      await elemento.play().catch(() => undefined);

      const lerImagem: LerImagem | null = await detectorDoNavegador();
      let lerQuadro: LerQuadro | null = null;
      if (lerImagem === null) {
        try {
          lerQuadro = await carregarJsQr();
        } catch {
          falhar("sem-leitor");
          return;
        }
      }
      if (!ativa) return;
      setEstado({ fase: "lendo", outroQr: false });

      const tela = document.createElement("canvas");
      const contexto = tela.getContext("2d", { willReadFrequently: true });
      const ler = async (): Promise<string | null> => {
        if (elemento.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || elemento.videoWidth === 0) {
          return null;
        }
        if (lerImagem !== null) return lerImagem(elemento);
        if (lerQuadro === null || contexto === null) return null;
        const { largura, altura } = tamanhoDoQuadro(elemento.videoWidth, elemento.videoHeight);
        tela.width = largura;
        tela.height = altura;
        contexto.drawImage(elemento, 0, 0, largura, altura);
        return lerQuadro({
          pixels: contexto.getImageData(0, 0, largura, altura).data,
          largura,
          altura,
        });
      };
      const tentar = async () => {
        const texto = await ler().catch(() => null);
        if (!ativa) return;
        if (texto !== null && pareceLinkDeNota(texto)) {
          entregar(texto.trim());
          return;
        }
        if (texto !== null) setEstado({ fase: "lendo", outroQr: true });
        proxima = setTimeout(() => void tentar(), intervaloDaLeituraMs);
      };
      void tentar();
    }

    void abrir(elemento);
    return () => {
      ativa = false;
      clearTimeout(proxima);
      desligar(fluxo);
      elemento.srcObject = null;
    };
  }, [aberta]);

  if (!temCamera) return null;

  return (
    <div className="leitor-qr">
      {!aberta && (
        <button
          type="button"
          className="botao"
          disabled={desligado}
          onClick={() => setEstado({ fase: "abrindo" })}
        >
          Ler o QR Code com a câmera
        </button>
      )}
      {aberta && (
        <div className="leitor-qr-camera">
          <video
            ref={video}
            className="leitor-qr-video"
            aria-label="Imagem da câmera para ler o QR Code"
            muted
            playsInline
          />
          <p role="status" className="leitor-qr-situacao">
            {estado.fase === "abrindo" && "Abrindo a câmera…"}
            {estado.fase === "lendo" &&
              (estado.outroQr ? avisoDeOutroQr : "Aponte a câmera para o QR Code do cupom.")}
          </p>
          <button
            type="button"
            className="botao botao-secundario"
            onClick={() => setEstado({ fase: "fechada" })}
          >
            Fechar a câmera
          </button>
        </div>
      )}
      {estado.fase === "falhou" && (
        <p className="mensagem-erro" role="alert">
          {mensagemDaCamera(estado.falha)}
        </p>
      )}
    </div>
  );
}
