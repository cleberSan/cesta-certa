import { useId, useMemo, useRef, useState, type SubmitEvent } from "react";
import { formatarCentavos } from "../../shared/dinheiro";
import { Assistente, type DadosDoAssistente } from "../assistente/Assistente";
import type { Item, Lista } from "../lista/lista";
import type { ObservacaoDePreco } from "../precos/precos";
import { descreverFonte } from "../precos/textos";
import { modosDeViagem } from "../rota/links";
import { OpcoesDeRota } from "../rota/OpcoesDeRota";
import { descreverModo } from "../rota/textos";
import { economiasMinimas, lerTeto, textoDoTeto, type Objetivo } from "./objetivo";
import {
  comparar,
  maximosDeMercados,
  type Ajuste,
  type Comparacao as ResultadoDaComparacao,
  type MercadoDaComparacao,
  type Opcao,
} from "./otimizador";
import {
  aberturaDoAjuste,
  ajudaDasMarcas,
  ajudaDoTeto,
  descreverAcimaDoTeto,
  descreverCaminho,
  descreverFaltando,
  descreverFrente,
  descreverLinha,
  descreverSugestao,
  diferencaParaAMelhor,
  fechamentoDoAjuste,
  larguraDaBarra,
  mensagemDoTeto,
  nomeDaOpcao,
  ordemDasMarcas,
  perguntas,
  resumoDaComparacao,
  resumoDoObjetivo,
  rotuloDaEconomia,
  rotuloDosMercados,
  rotulosDasMarcas,
  selosDaLinha,
  semItens as textoSemItens,
  semPrecos as textoSemPrecos,
  type TipoDeSelo,
  semRotaNaDemonstracao,
} from "./textos";
import "./comparar.css";

/** O que a comparação lê do aparelho e como avisa a tela de uma escolha nova. */
export interface DadosDaComparacao {
  readonly listas: readonly Lista[];
  readonly listaId: string | null;
  /** Itens da lista escolhida. */
  readonly itens: readonly Item[];
  readonly observacoes: readonly ObservacaoDePreco[];
  readonly objetivo: Objetivo;
  /** Dia de hoje, "AAAA-MM-DD", para marcar o preço antigo (CA-16). */
  readonly hoje: string;
  readonly onLista: (id: string) => void;
  readonly onObjetivo: (objetivo: Objetivo) => void;
  readonly assistente: DadosDoAssistente;
  /**
   * Na demonstração (CA-38), os mercados são fictícios: a tela não oferece rota, que levaria a
   * um lugar de verdade.
   */
  readonly demonstracao: boolean;
}

/** A conta da comparação para os mercados do raio; nula sem itens ou sem preços. */
export function useComparacao(
  mercados: readonly MercadoDaComparacao[],
  dados: Pick<DadosDaComparacao, "itens" | "observacoes" | "objetivo">,
): ResultadoDaComparacao | null {
  const { itens, observacoes, objetivo } = dados;
  return useMemo(
    () =>
      itens.length === 0 || observacoes.length === 0
        ? null
        : comparar(itens, observacoes, mercados, objetivo),
    [itens, observacoes, mercados, objetivo],
  );
}

const opcoesDeInicio = 3;

/**
 * Onde comprar a lista (spec 0001, CA-19 a CA-22, CA-24): o objetivo em quatro perguntas e as
 * opções em ordem, cada uma com o que comprar em cada mercado e o "Ir". A conta é do
 * `otimizador.ts`; aqui é só a tela.
 */
export function Comparacao({
  dados,
  comparacao,
  raioKm,
}: {
  dados: DadosDaComparacao;
  comparacao: ResultadoDaComparacao | null;
  raioKm: number;
}) {
  const base = useId();
  const [editando, setEditando] = useState(false);
  const [mostrar, setMostrar] = useState(opcoesDeInicio);
  const botaoDoObjetivo = useRef<HTMLButtonElement>(null);
  const { listas, listaId, itens, observacoes, objetivo } = dados;

  const fecharFormulario = () => {
    setEditando(false);
    queueMicrotask(() => botaoDoObjetivo.current?.focus());
  };

  const semItens = itens.every((item) => item.comprado);
  const semPrecos = observacoes.length === 0;
  const pronta = !semItens && !semPrecos;

  return (
    <section className="comparar" aria-labelledby={`${base}-titulo`}>
      <h3 id={`${base}-titulo`}>Onde comprar a lista</h3>
      {listas.length > 1 && listaId !== null && (
        <div className="campo">
          <label htmlFor={`${base}-lista`}>Lista</label>
          <select
            id={`${base}-lista`}
            value={listaId}
            onChange={(evento) => {
              setMostrar(opcoesDeInicio);
              dados.onLista(evento.target.value);
            }}
          >
            {listas.map((lista) => (
              <option key={lista.id} value={lista.id}>
                {lista.nome}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="comparar-objetivo">
        <p>
          <span className="somente-leitor">Objetivo: </span>
          {resumoDoObjetivo(objetivo, raioKm)}
        </p>
        <button
          ref={botaoDoObjetivo}
          type="button"
          className="botao botao-secundario botao-pequeno"
          aria-expanded={editando}
          aria-controls={`${base}-objetivo`}
          onClick={() => setEditando((atual) => !atual)}
        >
          Mudar o objetivo
        </button>
      </div>
      {editando && (
        <FormularioDoObjetivo
          id={`${base}-objetivo`}
          objetivo={objetivo}
          raioKm={raioKm}
          onSalvar={(novo) => {
            setMostrar(opcoesDeInicio);
            dados.onObjetivo(novo);
            fecharFormulario();
          }}
          onCancelar={fecharFormulario}
        />
      )}

      {semItens && (
        <div className="cartao">
          <p>{textoSemItens}</p>
          <p>
            <a className="botao botao-secundario" href="/lista">
              Abrir a lista
            </a>
          </p>
        </div>
      )}
      {semPrecos && (
        <div className="cartao">
          <p>{textoSemPrecos}</p>
          <p className="comparar-links">
            <a className="botao botao-secundario" href="/nota">
              Ler uma nota fiscal
            </a>
            <a className="botao botao-secundario" href="/precos#digitar">
              Digitar um preço
            </a>
            <a className="botao botao-secundario" href="/demonstracao">
              Ver a demonstração
            </a>
          </p>
        </div>
      )}
      <p role="status" className="comparar-resumo">
        {pronta && comparacao !== null ? resumoDaComparacao(comparacao) : ""}
      </p>
      {pronta && comparacao !== null && (
        <>
          {comparacao.ajuste !== null && objetivo.tetoCentavos !== null && (
            <AjusteAoTeto ajuste={comparacao.ajuste} tetoCentavos={objetivo.tetoCentavos} />
          )}
          {comparacao.opcoes.length > 0 && dados.demonstracao && (
            <p className="campo-ajuda">{semRotaNaDemonstracao}</p>
          )}
          {comparacao.opcoes.length > 0 && (
            <ol className="comparar-opcoes">
              {comparacao.opcoes.slice(0, mostrar).map((opcao, posicao) => (
                <OpcaoDeCompra
                  key={opcao.id}
                  opcao={opcao}
                  posicao={posicao + 1}
                  melhorCentavos={comparacao.opcoes[0]!.totalCentavos}
                  maiorCentavos={Math.max(...comparacao.opcoes.map((cada) => cada.totalCentavos))}
                  objetivo={objetivo}
                  hoje={dados.hoje}
                  comRota={!dados.demonstracao}
                />
              ))}
            </ol>
          )}
          {comparacao.opcoes.length > mostrar && (
            <p>
              <button
                type="button"
                className="botao botao-secundario"
                onClick={() => setMostrar(comparacao.opcoes.length)}
              >
                Mostrar mais {comparacao.opcoes.length - mostrar} opções
              </button>
            </p>
          )}
          {comparacao.opcoes.length > 0 && (
            <Assistente
              dados={dados.assistente}
              entrada={{ comparacao, objetivo, raioKm, hoje: dados.hoje }}
            />
          )}
        </>
      )}
    </section>
  );
}

function FormularioDoObjetivo({
  id,
  objetivo,
  raioKm,
  onSalvar,
  onCancelar,
}: {
  id: string;
  objetivo: Objetivo;
  raioKm: number;
  onSalvar: (objetivo: Objetivo) => void;
  onCancelar: () => void;
}) {
  const base = useId();
  const [teto, setTeto] = useState(textoDoTeto(objetivo.tetoCentavos));
  const [rascunho, setRascunho] = useState(objetivo);
  const [erro, setErro] = useState(false);
  const campoDoTeto = useRef<HTMLInputElement>(null);

  const salvar = (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const lido = lerTeto(teto);
    if (!lido.ok) {
      setErro(true);
      campoDoTeto.current?.focus();
      return;
    }
    onSalvar({ ...rascunho, tetoCentavos: lido.valor });
  };

  return (
    <form
      id={id}
      className="comparar-formulario"
      aria-label="Objetivo da compra"
      noValidate
      onSubmit={salvar}
    >
      <div className="campo">
        <label htmlFor={`${base}-teto`}>{perguntas.teto}</label>
        <p id={`${base}-teto-ajuda`} className="campo-ajuda">
          {ajudaDoTeto}
        </p>
        <input
          ref={campoDoTeto}
          id={`${base}-teto`}
          inputMode="decimal"
          autoComplete="off"
          value={teto}
          aria-invalid={erro}
          aria-describedby={`${base}-teto-ajuda${erro ? ` ${base}-teto-erro` : ""}`}
          onChange={(evento) => {
            setTeto(evento.target.value);
            setErro(false);
          }}
        />
        {erro && (
          <p id={`${base}-teto-erro`} className="mensagem-erro">
            {mensagemDoTeto}
          </p>
        )}
      </div>

      <fieldset className="comparar-escolhas">
        <legend>{perguntas.marcas}</legend>
        {ordemDasMarcas.map((marcas) => (
          <label key={marcas} className="comparar-escolha">
            <input
              type="radio"
              name={`${base}-marcas`}
              value={marcas}
              checked={rascunho.marcas === marcas}
              onChange={() => setRascunho((atual) => ({ ...atual, marcas }))}
            />
            <span>
              {rotulosDasMarcas[marcas]}
              <small>{ajudaDasMarcas[marcas]}</small>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="comparar-escolhas">
        <legend>{perguntas.mercados}</legend>
        {maximosDeMercados.map((maximo) => (
          <label key={maximo} className="comparar-escolha">
            <input
              type="radio"
              name={`${base}-mercados`}
              value={maximo}
              checked={rascunho.maximoDeMercados === maximo}
              onChange={() => setRascunho((atual) => ({ ...atual, maximoDeMercados: maximo }))}
            />
            <span>{rotuloDosMercados(maximo)}</span>
          </label>
        ))}
        {rascunho.maximoDeMercados > 1 && (
          <div className="campo">
            <label htmlFor={`${base}-economia`}>
              Sugerir mais de um mercado só se economizar pelo menos
            </label>
            <select
              id={`${base}-economia`}
              value={rascunho.economiaMinimaCentavos}
              onChange={(evento) => {
                const centavos = Number(evento.target.value);
                setRascunho((atual) => ({ ...atual, economiaMinimaCentavos: centavos }));
              }}
            >
              {economiasMinimas.map((centavos) => (
                <option key={centavos} value={centavos}>
                  {rotuloDaEconomia(centavos)}
                </option>
              ))}
            </select>
          </div>
        )}
      </fieldset>

      <fieldset className="comparar-escolhas">
        <legend>{perguntas.caminho}</legend>
        {modosDeViagem.map((modo) => (
          <label key={modo} className="comparar-escolha">
            <input
              type="radio"
              name={`${base}-modo`}
              value={modo}
              checked={rascunho.modo === modo}
              onChange={() => setRascunho((atual) => ({ ...atual, modo }))}
            />
            <span>{descreverModo(modo)}</span>
          </label>
        ))}
        <p className="campo-ajuda">
          A distância é a do campo &quot;Distância máxima&quot;, acima: até {raioKm} km.
        </p>
      </fieldset>

      <div className="comparar-botoes">
        <button type="submit" className="botao">
          Comparar
        </button>
        <button type="button" className="botao botao-secundario" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function AjusteAoTeto({ ajuste, tetoCentavos }: { ajuste: Ajuste; tetoCentavos: number }) {
  const titulo = useId();
  return (
    <section className="comparar-ajuste" aria-labelledby={titulo}>
      <h4 id={titulo}>Para caber no teto</h4>
      <p>{aberturaDoAjuste(ajuste, tetoCentavos)}</p>
      <ol>
        {ajuste.sugestoes.map((sugestao) => (
          <li
            key={`${sugestao.tipo} ${sugestao.tipo === "trocar" ? sugestao.de.item.id : sugestao.linha.item.id}`}
          >
            {descreverSugestao(sugestao)}
          </li>
        ))}
      </ol>
      <p>{fechamentoDoAjuste(ajuste)}</p>
    </section>
  );
}

/** Classe de cada selo de preço (global.css): a cor ajuda, o texto diz tudo (CA-13). */
const classeDoSelo: Record<TipoDeSelo, string> = {
  antigo: "selo selo-antigo",
  "outra-marca": "selo selo-marca",
  atacado: "selo selo-atacado",
};

/**
 * Uma opção de compra (spec 0002, CA-11 e CA-12): a primeira, a mais barata, ganha um cartão
 * próprio com o total na etiqueta amarela; as outras dizem quanto custam a mais e têm uma barra
 * proporcional ao total. A barra é SVG, com a largura em atributo: a CSP não aceita style inline.
 */
function OpcaoDeCompra({
  opcao,
  posicao,
  melhorCentavos,
  maiorCentavos,
  objetivo,
  hoje,
  comRota,
}: {
  opcao: Opcao;
  posicao: number;
  melhorCentavos: number;
  maiorCentavos: number;
  objetivo: Objetivo;
  hoje: string;
  comRota: boolean;
}) {
  const base = useId();
  const [compras, setCompras] = useState(false);
  const [rota, setRota] = useState(false);
  const nome = nomeDaOpcao(opcao);
  const faltando = descreverFaltando(opcao);
  const vencedora = posicao === 1;
  const diferenca = vencedora ? null : diferencaParaAMelhor(opcao.totalCentavos, melhorCentavos);
  const total = formatarCentavos(opcao.totalCentavos);

  return (
    <li className={vencedora ? "comparar-opcao comparar-vencedora" : "comparar-opcao"}>
      <div className="comparar-opcao-topo">
        {vencedora && <p className="comparar-rotulo">A mais barata</p>}
        <h4>
          <span className="somente-leitor">Opção {posicao}: </span>
          {nome}
        </h4>
        {vencedora ? (
          <p className="comparar-total">
            <span className="etiqueta-preco">{total}</span>
          </p>
        ) : (
          <>
            <p className="comparar-total">
              {total}
              {diferenca !== null && (
                <span className="comparar-diferenca">
                  {diferenca}
                  <span className="somente-leitor"> a mais que a opção 1</span>
                </span>
              )}
            </p>
            <svg
              className="comparar-barra"
              aria-hidden="true"
              focusable="false"
              width="100%"
              height="8"
            >
              <rect className="comparar-barra-fundo" width="100%" height="8" rx="4" />
              <rect
                className="comparar-barra-valor"
                width={`${larguraDaBarra(opcao.totalCentavos, maiorCentavos)}%`}
                height="8"
                rx="4"
              />
            </svg>
          </>
        )}
        {opcao.frente !== null && (
          <p className="comparar-frente">{descreverFrente(opcao.frente)}</p>
        )}
        <p className="comparar-caminho">{descreverCaminho(opcao)}</p>
      </div>
      {opcao.acimaDoTetoCentavos > 0 && (
        <p className="comparar-alerta">{descreverAcimaDoTeto(opcao.acimaDoTetoCentavos)}</p>
      )}
      {faltando !== null && <p className="comparar-alerta">{faltando}</p>}
      <div className="comparar-acoes">
        <button
          type="button"
          className="botao botao-secundario botao-pequeno"
          aria-expanded={compras}
          aria-controls={`${base}-compras`}
          onClick={() => setCompras((atual) => !atual)}
        >
          {compras ? "Fechar a lista" : "O que comprar"}
          <span className="somente-leitor"> em {nome}</span>
        </button>
        {comRota && (
          <button
            type="button"
            className="botao botao-pequeno"
            aria-expanded={rota}
            aria-controls={`${base}-rota`}
            onClick={() => setRota((atual) => !atual)}
          >
            {rota ? "Fechar a rota" : "Ir"}
            <span className="somente-leitor"> para {nome}</span>
          </button>
        )}
      </div>
      {compras && (
        <div id={`${base}-compras`} className="comparar-compras">
          {opcao.paradas.map((parada) => (
            <section key={parada.mercado.id} aria-label={`Em ${parada.mercado.nome}`}>
              <h5>
                Em {parada.mercado.nome}: {formatarCentavos(parada.subtotalCentavos)}
              </h5>
              <ul>
                {parada.linhas.map((linha) => (
                  <li key={linha.item.id}>
                    {descreverLinha(linha)}
                    <small>{descreverFonte(linha.observacao)}</small>
                    {selosDaLinha(linha, hoje).map((selo) => (
                      <span key={selo.tipo} className={classeDoSelo[selo.tipo]}>
                        {selo.texto}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {comRota && rota && (
        <div id={`${base}-rota`}>
          <OpcoesDeRota
            paradas={opcao.paradas.map(({ mercado }) => ({
              lat: mercado.lat,
              lon: mercado.lon,
              nome: mercado.nome,
            }))}
            titulo={`Rota até ${nome}`}
            modoInicial={objetivo.modo}
          />
        </div>
      )}
    </li>
  );
}
