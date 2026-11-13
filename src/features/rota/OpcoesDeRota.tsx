import { useId, useState } from "react";
import type { Ponto } from "../mercados/geo";
import { modosDeViagem, montarRota, type ModoDeViagem } from "./links";
import { avisosDaRota, descreverModo } from "./textos";
import "./rota.css";

export interface Parada extends Ponto {
  readonly nome: string;
}

/**
 * "Ir" (spec 0001, CA-24 e CA-25): abre a navegação no Waze ou no Google Maps, em outra aba ou
 * no app, com as paradas na ordem recebida. Os botões são texto, sem marca nem cores deles.
 */
export function OpcoesDeRota({
  paradas,
  titulo,
  modoInicial = "carro",
}: {
  paradas: readonly Parada[];
  titulo: string;
  /** O modo que a pessoa escolheu no objetivo da comparação (T14). */
  modoInicial?: ModoDeViagem;
}) {
  const base = useId();
  const [modo, setModo] = useState<ModoDeViagem>(modoInicial);
  const rota = montarRota(paradas, modo);
  if (!rota.ok) return null;
  const avisos = avisosDaRota(rota.valor, paradas[0]!.nome, modo);

  return (
    <div className="rota" role="group" aria-labelledby={`${base}-titulo`}>
      <p id={`${base}-titulo`} className="rota-titulo">
        {titulo}
      </p>
      <fieldset className="rota-modo">
        <legend>Como você vai</legend>
        {modosDeViagem.map((opcao) => (
          <label key={opcao}>
            <input
              type="radio"
              name={`${base}-modo`}
              value={opcao}
              checked={modo === opcao}
              onChange={() => setModo(opcao)}
            />
            {descreverModo(opcao)}
          </label>
        ))}
      </fieldset>
      <div className="acoes">
        <a
          className="botao botao-pequeno"
          href={rota.valor.googleMaps}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir no Google Maps
          <span className="somente-leitor"> (abre em outra aba)</span>
        </a>
        <a
          className="botao botao-secundario botao-pequeno"
          href={rota.valor.waze}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir no Waze
          <span className="somente-leitor"> (abre em outra aba)</span>
        </a>
      </div>
      {avisos.length > 0 && (
        <ul className="rota-avisos">
          {avisos.map((aviso) => (
            <li key={aviso}>{aviso}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
