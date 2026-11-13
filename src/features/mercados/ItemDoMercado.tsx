import { useId, useState } from "react";
import type { TotalDoMercado } from "../comparar/otimizador";
import { descreverTotalDoMercado } from "../comparar/textos";
import { DetalhesDoMercado, type MercadoNaTela } from "./DetalhesDoMercado";
import { formatarDistancia } from "./geo";
import type { Proximo } from "./proximos";
import { descreverTipo } from "./textos";

export type { MercadoNaTela };

/**
 * Um mercado da lista, com "Saber mais" (spec 0001, CA-09) e, para o mercado cadastrado
 * pela pessoa, a exclusão com confirmação (CA-08).
 */
export function ItemDoMercado({
  mercado,
  total,
  onExcluir,
}: {
  mercado: Proximo<MercadoNaTela>;
  /** O total da lista neste mercado, quando há preço de algum item (T14). */
  total: TotalDoMercado | undefined;
  onExcluir: (id: string) => void;
}) {
  const base = useId();
  const [aberto, setAberto] = useState(false);

  return (
    <li>
      <h3>{mercado.nome}</h3>
      <ResumoDoMercado mercado={mercado} total={total} />
      <div className="mercados-acoes-do-item">
        <button
          type="button"
          className="botao botao-secundario botao-pequeno"
          aria-expanded={aberto}
          aria-controls={`${base}-detalhes`}
          onClick={() => setAberto((atual) => !atual)}
        >
          {aberto ? "Fechar" : "Saber mais"}
          <span className="somente-leitor"> sobre {mercado.nome}</span>
        </button>
      </div>
      {aberto && (
        <div id={`${base}-detalhes`} className="mercados-detalhes">
          <DetalhesDoMercado mercado={mercado} onExcluir={onExcluir} />
        </div>
      )}
    </li>
  );
}

/** "Supermercado · 1,2 km · cadastrado por você" e, com preços, o total da lista. */
export function ResumoDoMercado({
  mercado,
  total,
}: {
  mercado: Proximo<MercadoNaTela>;
  total: TotalDoMercado | undefined;
}) {
  return (
    <>
      <p>
        {descreverTipo(mercado.tipo)} · {formatarDistancia(mercado.distanciaKm)}
        {mercado.origem === "proprio" && " · cadastrado por você"}
      </p>
      {total !== undefined && <p className="mercados-total">{descreverTotalDoMercado(total)}</p>}
    </>
  );
}
