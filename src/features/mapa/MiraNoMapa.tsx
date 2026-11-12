import { useEffect, useId, useRef, useState } from "react";
import type { Ponto } from "../mercados/geo";
import { mensagemDoMapa, type FalhaDoMapa } from "./estilo";
import { pontoDaMira } from "./geojson";
import { criarMapa } from "./motor";

export interface PropsDaMiraNoMapa {
  readonly titulo: string;
  readonly inicio: Ponto;
  readonly zoom: number;
  /** O ponto sob a mira, a cada vez que o mapa para; `null` se o mapa não abrir. */
  readonly onCentro: (ponto: Ponto | null) => void;
  readonly alternativa: string;
}

/**
 * Mapa com uma mira fixa no meio (spec 0001, CA-05 e CA-08): a pessoa move o mapa, com o dedo,
 * o mouse ou as setas do teclado, até a mira ficar sobre o lugar.
 */
export default function MiraNoMapa({
  titulo,
  inicio,
  zoom,
  onCentro,
  alternativa,
}: PropsDaMiraNoMapa) {
  const dica = useId();
  const quadro = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [falha, setFalha] = useState<FalhaDoMapa | null>(null);
  const comeco = useRef({ titulo, inicio, zoom });
  const avisar = useRef(onCentro);

  useEffect(() => {
    avisar.current = onCentro;
  });

  useEffect(() => {
    const elemento = quadro.current;
    if (elemento === null) return;
    const { titulo, inicio, zoom } = comeco.current;
    return criarMapa(elemento, {
      titulo,
      centro: inicio,
      zoom,
      cooperativo: false,
      aoAbrir: (mapa) => {
        mapa.getCanvas().setAttribute("aria-describedby", dica);
        const informar = () => avisar.current(pontoDaMira(mapa.getCenter()));
        mapa.on("moveend", informar);
        informar();
        setAberto(true);
      },
      aoFalhar: (motivo) => {
        setFalha(motivo);
        avisar.current(null);
      },
    });
  }, [dica]);

  return (
    <>
      {falha !== null && (
        <p className="alerta" role="alert">
          {mensagemDoMapa(falha)} {alternativa}
        </p>
      )}
      <p id={dica} className="mercados-nota" hidden={falha !== null}>
        Mova o mapa até a mira ficar sobre o lugar. No teclado, as setas movem o mapa e as teclas +
        e - aproximam e afastam.
      </p>
      <div className="mapa-quadro mapa-quadro-mira" hidden={falha !== null}>
        <div ref={quadro} className="mapa-tela" />
        <span className="mapa-mira" aria-hidden="true" />
        {!aberto && falha === null && (
          <p className="mapa-abrindo" role="status">
            Abrindo o mapa…
          </p>
        )}
      </div>
    </>
  );
}
