import type { Item } from "./lista";
import { detalhesDoItem } from "./textos";

/** Um item da lista: a caixa de comprado, o resumo e os botões de alterar e remover. */
export function ItemDaLista({
  item,
  comprado,
  idDosDetalhes,
  idDoBotaoEditar,
  aoMarcar,
  aoEditar,
  aoRemover,
}: {
  item: Item;
  /** O que a caixa mostra: o toque da pessoa vale na hora, antes de a gravação terminar. */
  comprado: boolean;
  idDosDetalhes: string;
  idDoBotaoEditar: string;
  aoMarcar: (comprado: boolean) => void;
  aoEditar: () => void;
  aoRemover: () => void;
}) {
  return (
    <>
      <label className="lista-item-marcar">
        <input
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
      <div className="lista-acoes lista-item-acoes">
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
