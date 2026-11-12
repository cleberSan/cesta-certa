import type { ReactNode } from "react";
import { limites, preferencias, type EntradaDoItem } from "./lista";
import type { ErroDaSessao } from "./sessao";
import {
  ajudaDaPreferencia,
  campoDoErro,
  mensagemDoErro,
  rotulosDaPreferencia,
  type CampoDoItem,
} from "./textos";

/**
 * Campos de um item, usados para adicionar e para alterar. O `prefixo` forma o id de cada
 * campo (`<prefixo>-nome`, `<prefixo>-quantidade`...), que a tela usa para levar o foco.
 */
export function CamposDoItem({
  prefixo,
  entrada,
  erro,
  detalhesAbertos,
  aoAbrirDetalhes,
  aoMudar,
}: {
  prefixo: string;
  entrada: EntradaDoItem;
  erro: ErroDaSessao | null;
  detalhesAbertos: boolean;
  aoAbrirDetalhes: (abertos: boolean) => void;
  aoMudar: (entrada: EntradaDoItem) => void;
}) {
  const campoComErro = erro === null ? null : campoDoErro(erro);
  const idDoErro = `${prefixo}-erro`;
  const marcar = (campo: CampoDoItem) => ({
    "aria-invalid": campoComErro === campo,
    "aria-describedby": campoComErro === campo ? idDoErro : undefined,
  });

  return (
    <>
      <div className="lista-campos">
        <div className="campo">
          <label htmlFor={`${prefixo}-nome`}>Nome do item</label>
          <input
            id={`${prefixo}-nome`}
            type="text"
            autoComplete="off"
            enterKeyHint="done"
            maxLength={limites.nomeDoItem}
            value={entrada.nome}
            onChange={(evento) => aoMudar({ ...entrada, nome: evento.target.value })}
            {...marcar("nome")}
          />
        </div>
        <div className="campo lista-campo-curto">
          <label htmlFor={`${prefixo}-quantidade`}>Quantidade</label>
          <input
            id={`${prefixo}-quantidade`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            maxLength={3}
            value={entrada.quantidade}
            onChange={(evento) => aoMudar({ ...entrada, quantidade: evento.target.value })}
            {...marcar("quantidade")}
          />
        </div>
      </div>

      <details
        className="lista-detalhes"
        open={detalhesAbertos}
        onToggle={(evento) => aoAbrirDetalhes(evento.currentTarget.open)}
      >
        <summary>Marca, tamanho e preferência</summary>
        <div className="lista-campos">
          <div className="campo">
            <label htmlFor={`${prefixo}-marca`}>Marca preferida</label>
            <input
              id={`${prefixo}-marca`}
              type="text"
              autoComplete="off"
              maxLength={limites.marca}
              value={entrada.marca}
              onChange={(evento) => aoMudar({ ...entrada, marca: evento.target.value })}
              {...marcar("marca")}
            />
          </div>
          <div className="campo lista-campo-curto">
            <label htmlFor={`${prefixo}-tamanho`}>Tamanho</label>
            <input
              id={`${prefixo}-tamanho`}
              type="text"
              autoComplete="off"
              maxLength={limites.tamanho}
              placeholder="5 kg"
              value={entrada.tamanho}
              onChange={(evento) => aoMudar({ ...entrada, tamanho: evento.target.value })}
              {...marcar("tamanho")}
            />
          </div>
        </div>
        <fieldset className="lista-preferencias">
          <legend>Preferência de marca</legend>
          {preferencias.map((preferencia) => (
            <label key={preferencia} className="lista-preferencia">
              <input
                type="radio"
                name={`${prefixo}-preferencia`}
                value={preferencia}
                checked={entrada.preferencia === preferencia}
                onChange={() => aoMudar({ ...entrada, preferencia })}
              />
              <span>
                {rotulosDaPreferencia[preferencia]}
                <small>{ajudaDaPreferencia[preferencia]}</small>
              </span>
            </label>
          ))}
        </fieldset>
      </details>

      <Erro id={idDoErro} erro={erro} />
    </>
  );
}

/** Mensagem de recusa, anunciada pelo leitor de tela assim que aparece. */
export function Erro({ id, erro }: { id: string; erro: ErroDaSessao | null }): ReactNode {
  if (erro === null) return null;
  return (
    <p id={id} className="mensagem-erro" role="alert">
      {mensagemDoErro(erro)}
    </p>
  );
}
