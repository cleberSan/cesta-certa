import { limites, type Item } from "./lista";
import { detalhesDoItem } from "./textos";

/**
 * Um item da lista: a caixa de comprado, o resumo, a quantidade com "−" e "+" (spec 0002,
 * CA-09) e os botões de alterar e remover.
 */
export function ItemDaLista({
  item,
  comprado,
  idDaCaixa,
  idDosDetalhes,
  idDoBotaoEditar,
  aoMarcar,
  aoAjustar,
  aoEditar,
  aoRemover,
}: {
  item: Item;
  /** O que a caixa mostra: o toque da pessoa vale na hora, antes de a gravação terminar. */
  comprado: boolean;
  idDaCaixa: string;
  idDosDetalhes: string;
  idDoBotaoEditar: string;
  aoMarcar: (comprado: boolean) => void;
  aoAjustar: (passo: 1 | -1) => void;
  aoEditar: () => void;
  aoRemover: () => void;
}) {
  // aria-disabled em vez de disabled: o botão continua com o foco quando chega ao limite.
  const noMinimo = item.quantidade <= 1;
  const noMaximo = item.quantidade >= limites.quantidade;
  return (
    <>
      <label className="lista-item-marcar">
        <input
          id={idDaCaixa}
          type="checkbox"
          checked={comprado}
          aria-describedby={idDosDetalhes}
          onChange={(evento) => aoMarcar(evento.target.checked)}
        />
        <span className="lista-item-nome">{item.nome}</span>
      </label>
      <p className="lista-item-detalhes" id={idDosDetalhes}>
        {detalhesDoItem(item)}
        {comprado && " · comprado"}
      </p>
      <div className="lista-quantidade" role="group" aria-label={`Quantidade de ${item.nome}`}>
        <button
          type="button"
          aria-label={`Menos 1 ${item.nome}`}
          aria-disabled={noMinimo}
          onClick={() => {
            if (!noMinimo) aoAjustar(-1);
          }}
        >
          <span aria-hidden="true">−</span>
        </button>
        <span className="lista-quantidade-numero">{item.quantidade}</span>
        <button
          type="button"
          aria-label={`Mais 1 ${item.nome}`}
          aria-disabled={noMaximo}
          onClick={() => {
            if (!noMaximo) aoAjustar(1);
          }}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      <div className="acoes lista-item-acoes">
        <button
          id={idDoBotaoEditar}
          type="button"
          className="botao botao-secundario botao-pequeno"
          aria-label={`Editar ${item.nome}`}
          onClick={aoEditar}
        >
          Editar
        </button>
        <button
          type="button"
          className="botao botao-secundario botao-pequeno"
          aria-label={`Remover ${item.nome}`}
          onClick={aoRemover}
        >
          Remover
        </button>
      </div>
    </>
  );
}
