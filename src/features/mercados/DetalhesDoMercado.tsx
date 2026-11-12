import { useId, useState } from "react";
import type { MercadoDaBase } from "../../shared/contratos/mercados";
import { linkDoLocalNoGoogleMaps } from "../rota/links";
import { OpcoesDeRota } from "../rota/OpcoesDeRota";
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
 * "Saber mais" de um mercado (spec 0001, CA-09): o mesmo conteúdo no item da lista e na folha
 * do mapa (CA-37), com a rota e, no mercado cadastrado, a exclusão com confirmação (CA-08).
 */
export function DetalhesDoMercado({
  mercado,
  onExcluir,
}: {
  mercado: Proximo<MercadoNaTela>;
  onExcluir: (id: string) => void;
}) {
  const base = useId();
  const [confirmando, setConfirmando] = useState(false);
  const proprio = mercado.origem === "proprio";
  const horario = mercado.origem === "base" ? mercado.horario : undefined;
  const site =
    mercado.origem === "base" && mercado.site !== undefined ? siteParaMostrar(mercado.site) : null;

  return (
    <>
      <dl>
        <dt>Tipo</dt>
        <dd>{descreverTipo(mercado.tipo)}</dd>
        <dt>Distância</dt>
        <dd>{formatarDistancia(mercado.distanciaKm)} em linha reta do ponto da busca</dd>
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
        {proprio && (
          <>
            <dt>Origem</dt>
            <dd>
              Cadastrado por você em {dataDoCadastro.format(new Date(mercado.criadoEm))}, só neste
              aparelho
            </dd>
          </>
        )}
      </dl>
      <OpcoesDeRota paradas={[mercado]} titulo={`Ir até ${mercado.nome}`} />
      <div className="acoes">
        <a
          className="botao botao-secundario botao-pequeno"
          href={linkDoLocalNoGoogleMaps(mercado)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Ver o lugar no Google Maps
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
    </>
  );
}
