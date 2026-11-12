import { useId, useState } from "react";
import type { MercadoDaBase } from "../../shared/contratos/mercados";
import { linkDoLocalNoGoogleMaps } from "../rota/links";
import { siteParaMostrar } from "./detalhes";
import { formatarDistancia } from "./geo";
import type { MercadoProprio } from "./proprios";
import type { Proximo } from "./proximos";
import { descreverTipo } from "./textos";

/** Mercado como a tela mostra: da base do OpenStreetMap ou cadastrado pela pessoa. */
export type MercadoNaTela =
  (MercadoDaBase & { readonly origem: "base" }) | (MercadoProprio & { readonly origem: "proprio" });

const dataDoCadastro = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

/**
 * Um mercado da lista, com "Saber mais" (spec 0001, CA-09) e, para o mercado cadastrado
 * pela pessoa, a exclusão com confirmação (CA-08).
 */
export function ItemDoMercado({
  mercado,
  onExcluir,
}: {
  mercado: Proximo<MercadoNaTela>;
  onExcluir: (id: string) => void;
}) {
  const base = useId();
  const [aberto, setAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const distancia = formatarDistancia(mercado.distanciaKm);
  const proprio = mercado.origem === "proprio";
  const horario = mercado.origem === "base" ? mercado.horario : undefined;
  const site =
    mercado.origem === "base" && mercado.site !== undefined ? siteParaMostrar(mercado.site) : null;

  return (
    <li>
      <h3>{mercado.nome}</h3>
      <p>
        {descreverTipo(mercado.tipo)} · {distancia}
        {proprio && " · cadastrado por você"}
      </p>
      <div className="mercados-acoes-do-item">
        <button
          type="button"
          className="botao botao-secundario botao-pequeno"
          aria-expanded={aberto}
          aria-controls={`${base}-detalhes`}
          onClick={() => {
            setAberto((atual) => !atual);
            setConfirmando(false);
          }}
        >
          {aberto ? "Fechar" : "Saber mais"}
          <span className="somente-leitor"> sobre {mercado.nome}</span>
        </button>
      </div>
      {aberto && (
        <div id={`${base}-detalhes`} className="mercados-detalhes">
          <dl>
            <dt>Tipo</dt>
            <dd>{descreverTipo(mercado.tipo)}</dd>
            <dt>Distância</dt>
            <dd>{distancia} em linha reta do ponto da busca</dd>
            {horario !== undefined && (
              <>
                <dt>Horário</dt>
                <dd>
                  {horario} <span className="mercados-nota">(como está no OpenStreetMap)</span>
                </dd>
              </>
            )}
            {site !== null && (
              <>
                <dt>Site</dt>
                <dd>
                  {site.href === null ? (
                    <>
                      {site.texto} <span className="mercados-nota">(sem conexão segura)</span>
                    </>
                  ) : (
                    <a href={site.href} target="_blank" rel="noopener noreferrer">
                      {site.texto}
                      <span className="somente-leitor"> (abre em outra aba)</span>
                    </a>
                  )}
                </dd>
              </>
            )}
            {mercado.origem === "proprio" && (
              <>
                <dt>Origem</dt>
                <dd>
                  Cadastrado por você em {dataDoCadastro.format(new Date(mercado.criadoEm))}, só
                  neste aparelho
                </dd>
              </>
            )}
          </dl>
          <div className="acoes">
            <a
              className="botao botao-secundario botao-pequeno"
              href={linkDoLocalNoGoogleMaps(mercado)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir no Google Maps
              <span className="somente-leitor"> (abre em outra aba)</span>
            </a>
            {proprio && !confirmando && (
              <button
                type="button"
                className="botao botao-perigo botao-pequeno"
                onClick={() => setConfirmando(true)}
              >
                Excluir este mercado
              </button>
            )}
          </div>
          {proprio && confirmando && (
            <div className="confirmacao" role="group" aria-labelledby={`${base}-excluir`}>
              <p id={`${base}-excluir`}>
                Excluir <strong>{mercado.nome}</strong>? Ele sai deste aparelho.
              </p>
              <div className="acoes">
                <button
                  type="button"
                  className="botao botao-perigo"
                  onClick={() => onExcluir(mercado.id)}
                >
                  Excluir
                </button>
                <button
                  type="button"
                  className="botao botao-secundario"
                  onClick={() => setConfirmando(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
