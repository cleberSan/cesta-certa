import { useState, type SubmitEvent } from "react";
import { Erro } from "./CamposDoItem";
import { limites, type Lista } from "./lista";
import type { ErroDaSessao } from "./sessao";
import { contarItens } from "./textos";

type Acao = { tipo: "renomear"; nome: string } | { tipo: "excluir" } | null;

/**
 * Escolha da lista aberta e as ações sobre ela: nova, duplicar, renomear e excluir. Cada
 * ação devolve se deu certo; a recusa aparece aqui, pelo `erro` que a tela repassa.
 */
export function OpcoesDaLista({
  listas,
  ativa,
  quantosItens,
  erro,
  id,
  focar,
  aoEscolher,
  aoCriar,
  aoDuplicar,
  aoRenomear,
  aoExcluir,
  aoLimparErro,
}: {
  listas: readonly Lista[];
  ativa: Lista;
  quantosItens: number;
  erro: ErroDaSessao | null;
  /** Id de um elemento da tela a partir do nome dele, e pedido de foco pelo mesmo nome. */
  id: (parte: string) => string;
  focar: (parte: string) => void;
  aoEscolher: (listaId: string) => void;
  aoCriar: () => Promise<boolean>;
  aoDuplicar: () => Promise<boolean>;
  aoRenomear: (nome: string) => Promise<boolean>;
  aoExcluir: () => Promise<boolean>;
  aoLimparErro: () => void;
}) {
  const [acao, setAcao] = useState<Acao>(null);

  /** Fecha o formulário ou a pergunta quando a ação deu certo. */
  const concluir = (pedido: Promise<boolean>) => {
    void pedido.then((deuCerto) => {
      if (deuCerto) setAcao(null);
    });
  };

  return (
    <div className="lista-cartao">
      <div className="lista-campo">
        <label htmlFor={id("lista")}>Lista</label>
        <select
          id={id("lista")}
          value={ativa.id}
          onChange={(evento) => {
            setAcao(null);
            aoEscolher(evento.target.value);
          }}
        >
          {listas.map((lista) => (
            <option key={lista.id} value={lista.id}>
              {lista.nome}
            </option>
          ))}
        </select>
      </div>

      <details className="lista-opcoes">
        <summary>Opções da lista</summary>
        <div className="lista-acoes">
          <button
            type="button"
            className="botao botao-secundario"
            onClick={() => concluir(aoCriar())}
          >
            Nova lista
          </button>
          <button
            type="button"
            className="botao botao-secundario"
            onClick={() => concluir(aoDuplicar())}
          >
            Duplicar
          </button>
          <button
            type="button"
            className="botao botao-secundario"
            aria-expanded={acao?.tipo === "renomear"}
            onClick={() => {
              setAcao({ tipo: "renomear", nome: ativa.nome });
              aoLimparErro();
              focar("nome-da-lista");
            }}
          >
            Renomear
          </button>
          <button
            type="button"
            className="botao botao-secundario"
            aria-expanded={acao?.tipo === "excluir"}
            onClick={() => {
              setAcao({ tipo: "excluir" });
              aoLimparErro();
              focar("confirmar-exclusao");
            }}
          >
            Excluir
          </button>
        </div>

        {acao?.tipo === "renomear" && (
          <form
            className="lista-confirmacao"
            noValidate
            onSubmit={(evento: SubmitEvent<HTMLFormElement>) => {
              evento.preventDefault();
              concluir(aoRenomear(acao.nome));
            }}
          >
            <div className="lista-campo">
              <label htmlFor={id("nome-da-lista")}>Novo nome da lista</label>
              <input
                id={id("nome-da-lista")}
                type="text"
                autoComplete="off"
                maxLength={limites.nomeDaLista}
                value={acao.nome}
                aria-invalid={erro !== null}
                aria-describedby={erro === null ? undefined : id("erro-lista")}
                onChange={(evento) => setAcao({ tipo: "renomear", nome: evento.target.value })}
              />
            </div>
            <div className="lista-acoes">
              <button type="submit" className="botao">
                Salvar nome
              </button>
              <button
                type="button"
                className="botao botao-secundario"
                onClick={() => {
                  setAcao(null);
                  aoLimparErro();
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {acao?.tipo === "excluir" && (
          <div className="lista-confirmacao" role="group" aria-labelledby={id("pergunta")}>
            <p id={id("pergunta")}>
              Excluir a lista <strong>{ativa.nome}</strong>
              {quantosItens > 0 && ` e ${contarItens(quantosItens)}`}? Não dá para desfazer.
            </p>
            <div className="lista-acoes">
              <button
                id={id("confirmar-exclusao")}
                type="button"
                className="botao botao-perigo"
                onClick={() => concluir(aoExcluir())}
              >
                Excluir a lista
              </button>
              <button
                type="button"
                className="botao botao-secundario"
                onClick={() => setAcao(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        <Erro id={id("erro-lista")} erro={erro} />
      </details>
    </div>
  );
}
