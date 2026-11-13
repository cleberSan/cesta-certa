import { useEffect, useId, useRef, useState } from "react";
import type { Ponto } from "../mercados/geo";
import { mensagemDoMapa, type FalhaDoMapa } from "./estilo";
import { limitesDoRaio, type Pino } from "./geojson";
import {
  criarMapa,
  mostrarEscolhido,
  mostrarPinos,
  mostrarRaio,
  prepararMercados,
  type MapaGl,
} from "./motor";

export interface PropsDoMapaDosMercados {
  readonly ponto: Ponto;
  readonly raioKm: number;
  readonly pinos: readonly Pino[];
  readonly escolhido: string | null;
  readonly onEscolher: (id: string) => void;
  /** O outro caminho, dito depois da falha: a lista tem as mesmas informações. */
  readonly alternativa: string;
}

/**
 * Mapa dos mercados perto do ponto (spec 0001, T10): a pessoinha no ponto da busca, o raio e
 * um pino por mercado. Tocar num pino escolhe o mercado; os detalhes aparecem na folha abaixo
 * do mapa. Tudo o que o mapa mostra está também na lista (CA-37).
 */
export default function MapaDosMercados({
  ponto,
  raioKm,
  pinos,
  escolhido,
  onEscolher,
  alternativa,
}: PropsDoMapaDosMercados) {
  const legenda = useId();
  const quadro = useRef<HTMLDivElement>(null);
  const [mapa, setMapa] = useState<MapaGl | null>(null);
  const [falha, setFalha] = useState<FalhaDoMapa | null>(null);
  // O mapa nasce uma vez, já enquadrando o raio; as mudanças seguintes vêm pelos efeitos.
  const inicio = useRef({ ponto, raioKm });
  const escolher = useRef(onEscolher);

  useEffect(() => {
    escolher.current = onEscolher;
  });

  useEffect(() => {
    const elemento = quadro.current;
    if (elemento === null) return;
    const { ponto, raioKm } = inicio.current;
    return criarMapa(elemento, {
      titulo: "Mapa dos mercados",
      centro: ponto,
      limites: limitesDoRaio(ponto, raioKm),
      cooperativo: true,
      aoAbrir: (aberto) => {
        aberto.getCanvas().setAttribute("aria-describedby", legenda);
        prepararMercados(aberto, (id) => escolher.current(id));
        setMapa(aberto);
      },
      aoFalhar: setFalha,
    });
  }, [legenda]);

  useEffect(() => {
    if (mapa === null) return;
    mostrarRaio(mapa, ponto, raioKm, limitesDoRaio(ponto, raioKm));
  }, [mapa, ponto, raioKm]);

  useEffect(() => {
    if (mapa !== null) mostrarPinos(mapa, pinos);
  }, [mapa, pinos]);

  const pinoEscolhido = pinos.find((pino) => pino.id === escolhido) ?? null;
  useEffect(() => {
    if (mapa !== null) mostrarEscolhido(mapa, ponto, pinoEscolhido);
  }, [mapa, ponto, pinoEscolhido]);

  return (
    <>
      {falha !== null && (
        <p className="alerta" role="alert">
          {mensagemDoMapa(falha)} {alternativa}
        </p>
      )}
      <p id={legenda} className="mapa-legenda" hidden={falha !== null}>
        A pessoinha marca o ponto da busca.{" "}
        <span className="mapa-amostra mapa-amostra-base" aria-hidden="true" /> Mercado da base.{" "}
        <span className="mapa-amostra mapa-amostra-proprio" aria-hidden="true" /> Mercado cadastrado
        por você, com miolo branco. Toque num mercado para ver os detalhes abaixo do mapa.
      </p>
      <div className="mapa-quadro" hidden={falha !== null}>
        <div ref={quadro} className="mapa-tela" />
        {mapa === null && falha === null && (
          <p className="mapa-abrindo" role="status">
            Abrindo o mapa…
          </p>
        )}
      </div>
    </>
  );
}
