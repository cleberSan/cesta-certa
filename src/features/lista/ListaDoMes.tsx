import { useEffect, useId, useState, useSyncExternalStore, type SubmitEvent } from "react";
import type { ErroDoBanco } from "../../shared/armazenamento/banco";
import { mensagemDoBanco } from "../../shared/armazenamento/textos";
import { recarregarAoVoltar } from "../../shared/recarregarAoVoltar";
import { abrirLista } from "./abertura";
import { CamposDoItem, Erro } from "./CamposDoItem";
import { ItemDaLista } from "./ItemDaLista";
import {
  adicionarItem,
  criarLista,
  duplicarLista,
  editarItem,
  excluirLista,
  itensDaLista,
  listasRecentes,
  marcarComprado,
  removerItem,
  renomearLista,
  restaurarItem,
  somarQuantidade,
  sugerirNome,
  type EntradaDoItem,
  type Item,
  type Lista,
  type MudancaComLista,
} from "./lista";
import { OpcoesDaLista } from "./OpcoesDaLista";
import type { ErroDaSessao, Operacao, Sessao } from "./sessao";
import { campoDoErro, contarItens, resumoDosItens } from "./textos";
import "./lista.css";

type Carga =
  | { fase: "abrindo" }
  | { fase: "pronta"; sessao: Sessao }
  | { fase: "falhou"; motivo: ErroDoBanco };

const entradaVazia: EntradaDoItem = {
  nome: "",
  quantidade: "1",
  marca: "",
  tamanho: "",
  preferencia: "mais-barato",
};

/** O formulário de item novo: o que foi digitado e se os campos opcionais estão à mostra. */
const formularioVazio: { entrada: EntradaDoItem; detalhes: boolean } = {
  entrada: entradaVazia,
  detalhes: false,
};

/**
 * Lista do mês (spec 0001, tarefa T04). As regras ficam em lista.ts e a gravação em
 * sessao.ts; aqui é só a tela. Todo texto digitado é mostrado como texto pelo React.
 */
export default function ListaDoMes() {
  const [carga, setCarga] = useState<Carga>({ fase: "abrindo" });

  useEffect(() => recarregarAoVoltar(globalThis), []);

  useEffect(() => {
    let ativa = true;
    void abrirLista(globalThis.indexedDB).then((aberta) => {
      if (!ativa) return;
      setCarga(
        aberta.ok
          ? { fase: "pronta", sessao: aberta.valor }
          : { fase: "falhou", motivo: aberta.erro },
      );
    });
    return () => {
      ativa = false;
    };
  }, []);

  if (carga.fase === "abrindo") {
    return (
      <p className="lista-abrindo" role="status">
        Abrindo a sua lista…
      </p>
    );
  }
  if (carga.fase === "falhou") {
    return (
      <div className="alerta" role="alert">
        <p>
          <strong>A lista não abriu.</strong> {mensagemDoBanco(carga.motivo)}
        </p>
        <p>
          <button type="button" className="botao" onClick={() => globalThis.location.reload()}>
            Recarregar a página
          </button>
        </p>
      </div>
    );
  }
  return <Painel sessao={carga.sessao} />;
}

interface Aviso {
  readonly texto: string;
  /** Item recém-removido, que o botão "Desfazer" devolve à lista. */
  readonly desfazer?: Item;
}

interface Falha {
  /** Onde a mensagem aparece: junto do formulário ou da ação que falhou. */
  readonly onde: "novo" | "repetido" | "edicao" | "lista" | "geral";
  readonly erro: ErroDaSessao;
}

function Painel({ sessao }: { sessao: Sessao }) {
  const estado = useSyncExternalStore(sessao.assinar, sessao.estado, sessao.estado);
  const base = useId();
  const id = (parte: string) => `${base}-${parte}`;

  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [formulario, setFormulario] = useState(formularioVazio);
  const [repetido, setRepetido] = useState<{ existente: Item; entrada: EntradaDoItem } | null>(
    null,
  );
  const [edicao, setEdicao] = useState<{ itemId: string; entrada: EntradaDoItem } | null>(null);
  const [detalhesDaEdicao, setDetalhesDaEdicao] = useState(false);
  const [falha, setFalha] = useState<Falha | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  // Caixas marcadas cuja gravação ainda não terminou: a tela mostra o toque na hora.
  const [marcando, setMarcando] = useState<Readonly<Record<string, boolean>>>({});

  // O foco muda depois que a tela é redesenhada: cada pedido é um objeto novo, então o
  // efeito roda mesmo quando o alvo é o mesmo do pedido anterior.
  const [foco, setFoco] = useState<{ readonly alvo: string } | null>(null);
  useEffect(() => {
    if (foco !== null) document.getElementById(foco.alvo)?.focus();
  }, [foco]);
  const focar = (parte: string) => setFoco({ alvo: id(parte) });

  const recentes = listasRecentes(estado);
  const ativa = recentes.find((lista) => lista.id === escolhida) ?? recentes[0];
  if (ativa === undefined) return null;
  const listaId = ativa.id;
  const itens = itensDaLista(estado, listaId);
  const falhaEm = (onde: Falha["onde"]) => (falha?.onde === onde ? falha.erro : null);

  function concluir(texto: string, desfazer?: Item) {
    setFalha(null);
    setAviso(desfazer === undefined ? { texto } : { texto, desfazer });
  }

  function falhar(onde: Falha["onde"], erro: ErroDaSessao) {
    setFalha({ onde, erro });
    setAviso(null);
  }

  /** Mostra a recusa junto do formulário e leva o foco ao campo que ela aponta. */
  function recusar(onde: "novo" | "edicao", erro: ErroDaSessao) {
    falhar(onde, erro);
    const campo = campoDoErro(erro);
    if (campo === "marca" || campo === "tamanho") {
      if (onde === "novo") setFormulario((atual) => ({ ...atual, detalhes: true }));
      else setDetalhesDaEdicao(true);
    }
    if (campo !== null) focar(`${onde}-${campo}`);
  }

  /**
   * Esvazia o formulário depois que o item foi guardado. Se a pessoa já começou a digitar o
   * item seguinte enquanto a gravação terminava, o que ela digitou fica.
   */
  function limparFormulario(enviada: EntradaDoItem) {
    setFormulario((atual) => (atual.entrada === enviada ? formularioVazio : atual));
    setRepetido((atual) => (atual?.entrada === enviada ? null : atual));
  }

  async function adicionar(aceitarDuplicado: boolean) {
    const entrada = repetido?.entrada ?? formulario.entrada;
    const resultado = await sessao.executar((atual, contexto) =>
      adicionarItem(atual, listaId, entrada, contexto, { aceitarDuplicado }),
    );
    if (resultado.ok) {
      limparFormulario(entrada);
      concluir(`${resultado.valor.item.nome} entrou na lista.`);
      focar("novo-nome");
    } else if (resultado.erro.tipo === "item.duplicado") {
      setRepetido({ existente: resultado.erro.existente, entrada });
      setFalha(null);
      setAviso(null);
      focar("somar");
    } else {
      recusar("novo", resultado.erro);
    }
  }

  async function somar() {
    if (repetido === null) return;
    const { existente, entrada } = repetido;
    const resultado = await sessao.executar((atual, contexto) =>
      somarQuantidade(atual, existente.id, entrada.quantidade, contexto),
    );
    if (resultado.ok) {
      const { nome, quantidade } = resultado.valor.item;
      limparFormulario(entrada);
      concluir(`Somado: ${nome} agora tem ${quantidade}.`);
      focar("novo-nome");
    } else {
      falhar("repetido", resultado.erro);
    }
  }

  function abrirEdicao(item: Item) {
    setEdicao({
      itemId: item.id,
      entrada: {
        nome: item.nome,
        quantidade: String(item.quantidade),
        marca: item.marca ?? "",
        tamanho: item.tamanho ?? "",
        preferencia: item.preferencia,
      },
    });
    setDetalhesDaEdicao(
      item.marca !== null || item.tamanho !== null || item.preferencia !== "mais-barato",
    );
    setRepetido(null);
    setFalha(null);
    focar("edicao-nome");
  }

  async function salvarEdicao() {
    if (edicao === null) return;
    const { itemId, entrada } = edicao;
    const resultado = await sessao.executar((atual, contexto) =>
      editarItem(atual, itemId, entrada, contexto),
    );
    if (resultado.ok) {
      setEdicao((atual) => (atual?.entrada === entrada ? null : atual));
      concluir(`${resultado.valor.item.nome} foi alterado.`);
      focar(`editar-${itemId}`);
    } else {
      recusar("edicao", resultado.erro);
    }
  }

  async function marcar(item: Item, comprado: boolean) {
    setMarcando((atual) => ({ ...atual, [item.id]: comprado }));
    const resultado = await sessao.executar((atual, contexto) =>
      marcarComprado(atual, item.id, comprado, contexto),
    );
    setMarcando((atual) =>
      Object.fromEntries(Object.entries(atual).filter(([itemId]) => itemId !== item.id)),
    );
    if (resultado.ok) concluir(`${item.nome}: ${comprado ? "comprado" : "falta comprar"}.`);
    else falhar("geral", resultado.erro);
  }

  async function remover(item: Item) {
    const resultado = await sessao.executar((atual, contexto) =>
      removerItem(atual, item.id, contexto),
    );
    if (resultado.ok) {
      if (edicao?.itemId === item.id) setEdicao(null);
      concluir(`${item.nome} saiu da lista.`, resultado.valor.item);
      focar("desfazer");
    } else {
      falhar("geral", resultado.erro);
    }
  }

  async function desfazer(item: Item) {
    const resultado = await sessao.executar((atual, contexto) =>
      restaurarItem(atual, item, contexto),
    );
    if (resultado.ok) {
      setEscolhida(item.listaId);
      concluir(`${item.nome} voltou para a lista.`);
      focar(`editar-${item.id}`);
    } else {
      falhar("geral", resultado.erro);
    }
  }

  function escolherLista(escolha: string) {
    setEscolhida(escolha);
    setEdicao(null);
    setRepetido(null);
    setFalha(null);
    setAviso(null);
  }

  /** Criar, duplicar, renomear e excluir: todas terminam com uma lista aberta. */
  async function mudarLista(
    operacao: Operacao<MudancaComLista>,
    texto: (aberta: Lista) => string,
  ): Promise<boolean> {
    const resultado = await sessao.executar(operacao);
    if (!resultado.ok) {
      falhar("lista", resultado.erro);
      return false;
    }
    const aberta = resultado.valor.estado.listas.find(
      (lista) => lista.id === resultado.valor.listaId,
    );
    escolherLista(resultado.valor.listaId);
    setFormulario(formularioVazio);
    concluir(aberta === undefined ? "Pronto." : texto(aberta));
    focar("lista");
    return true;
  }

  return (
    <section className="lista" aria-label="Lista de compras">
      {!sessao.persistente && (
        <p className="alerta" role="alert">
          <strong>Esta lista não está sendo guardada.</strong> O navegador não deixou guardar dados
          neste aparelho. Ela funciona, mas some quando você fechar a página.
        </p>
      )}
      {sessao.recusados > 0 && (
        <p className="alerta">
          {sessao.recusados === 1
            ? "1 registro guardado neste aparelho não pôde ser lido e ficou de fora."
            : `${sessao.recusados} registros guardados neste aparelho não puderam ser lidos e ficaram de fora.`}
        </p>
      )}

      <OpcoesDaLista
        listas={recentes}
        ativa={ativa}
        quantosItens={itens.length}
        erro={falhaEm("lista")}
        id={id}
        focar={focar}
        aoEscolher={escolherLista}
        aoLimparErro={() => setFalha(null)}
        aoCriar={() =>
          mudarLista(
            (atual, contexto) => criarLista(atual, sugerirNome(atual, contexto), contexto),
            (aberta) => `Lista "${aberta.nome}" criada.`,
          )
        }
        aoDuplicar={() =>
          mudarLista(
            (atual, contexto) => duplicarLista(atual, listaId, contexto),
            (aberta) =>
              `Lista duplicada em "${aberta.nome}": ${contarItens(itens.length)}, nenhum marcado como comprado.`,
          )
        }
        aoRenomear={(nome) =>
          mudarLista(
            (atual, contexto) => renomearLista(atual, listaId, nome, contexto),
            (aberta) => `A lista agora se chama "${aberta.nome}".`,
          )
        }
        aoExcluir={() =>
          mudarLista(
            (atual, contexto) => excluirLista(atual, listaId, contexto),
            (aberta) => `Lista "${ativa.nome}" excluída. Aberta: "${aberta.nome}".`,
          )
        }
      />

      <form
        className="lista-cartao"
        noValidate
        aria-labelledby={id("titulo-novo")}
        onSubmit={(evento: SubmitEvent<HTMLFormElement>) => {
          evento.preventDefault();
          void adicionar(false);
        }}
      >
        <h2 id={id("titulo-novo")}>Adicionar item</h2>
        <CamposDoItem
          prefixo={id("novo")}
          entrada={formulario.entrada}
          erro={falhaEm("novo")}
          detalhesAbertos={formulario.detalhes}
          aoAbrirDetalhes={(detalhes) => setFormulario((atual) => ({ ...atual, detalhes }))}
          aoMudar={(entrada) => {
            setFormulario((atual) => ({ ...atual, entrada }));
            setRepetido(null);
          }}
        />
        <div className="acoes">
          <button type="submit" className="botao" disabled={repetido !== null}>
            Adicionar
          </button>
        </div>

        {repetido !== null && (
          <div className="confirmacao" role="group" aria-labelledby={id("titulo-repetido")}>
            <p id={id("titulo-repetido")}>
              <strong>{repetido.existente.nome}</strong> já está na lista, com quantidade{" "}
              {repetido.existente.quantidade}. Somar mais {Number(repetido.entrada.quantidade)}?
            </p>
            <div className="acoes">
              <button id={id("somar")} type="button" className="botao" onClick={() => somar()}>
                Somar as quantidades
              </button>
              <button
                type="button"
                className="botao botao-secundario"
                onClick={() => adicionar(true)}
              >
                Adicionar como outro item
              </button>
              <button
                type="button"
                className="botao botao-secundario"
                onClick={() => {
                  setRepetido(null);
                  setFalha(null);
                  focar("novo-nome");
                }}
              >
                Cancelar
              </button>
            </div>
            <Erro id={id("erro-repetido")} erro={falhaEm("repetido")} />
          </div>
        )}
      </form>

      <div className="lista-aviso">
        <p role="status">{aviso?.texto}</p>
        {aviso?.desfazer !== undefined && (
          <button
            id={id("desfazer")}
            type="button"
            className="botao botao-secundario botao-pequeno"
            onClick={() => desfazer(aviso.desfazer!)}
          >
            Desfazer
          </button>
        )}
      </div>
      <Erro id={id("erro-geral")} erro={falhaEm("geral")} />

      <h2 id={id("titulo-itens")}>Itens</h2>
      <p className="lista-resumo">{resumoDosItens(itens)}</p>
      {itens.length === 0 ? (
        <p className="lista-vazia">A lista está vazia. Adicione o primeiro item acima.</p>
      ) : (
        <ul className="lista-itens" aria-labelledby={id("titulo-itens")}>
          {itens.map((item) => {
            const comprado = marcando[item.id] ?? item.comprado;
            return (
              <li key={item.id} className="lista-item" data-comprado={comprado}>
                {edicao?.itemId === item.id ? (
                  <form
                    noValidate
                    aria-label={`Alterar ${item.nome}`}
                    onSubmit={(evento: SubmitEvent<HTMLFormElement>) => {
                      evento.preventDefault();
                      void salvarEdicao();
                    }}
                  >
                    <CamposDoItem
                      prefixo={id("edicao")}
                      entrada={edicao.entrada}
                      erro={falhaEm("edicao")}
                      detalhesAbertos={detalhesDaEdicao}
                      aoAbrirDetalhes={setDetalhesDaEdicao}
                      aoMudar={(entrada) => setEdicao({ itemId: item.id, entrada })}
                    />
                    <div className="acoes">
                      <button type="submit" className="botao">
                        Salvar
                      </button>
                      <button
                        type="button"
                        className="botao botao-secundario"
                        onClick={() => {
                          setEdicao(null);
                          setFalha(null);
                          focar(`editar-${item.id}`);
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <ItemDaLista
                    item={item}
                    comprado={comprado}
                    idDosDetalhes={id(`detalhes-${item.id}`)}
                    idDoBotaoEditar={id(`editar-${item.id}`)}
                    aoMarcar={(novo) => marcar(item, novo)}
                    aoEditar={() => abrirEdicao(item)}
                    aoRemover={() => remover(item)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
