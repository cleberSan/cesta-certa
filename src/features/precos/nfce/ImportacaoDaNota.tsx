import { useId, useMemo, useRef, useState } from "react";
import type { NotaConsultada } from "../../../shared/contratos/nfce";
import { mensagemDoBanco } from "../../../shared/armazenamento/textos";
import { formatarCentavos } from "../../../shared/dinheiro";
import { gerarId } from "../../../shared/identificador";
import { chaveDoItem } from "../../lista/lista";
import type { AparelhoDosPrecos } from "../aparelho";
import { EscolhaDoMercado, useOpcoesDeMercado } from "../EscolhaDoMercado";
import { produtosDasListas } from "../escolha";
import { diaDe, type MercadoDoPreco } from "../precos";
import { formatarQuantidade } from "./cliente";
import {
  aplicarImportacao,
  opcoesComLembrado,
  prepararImportacao,
  produtosParaLigar,
  type Decisao,
  type Importacao,
} from "./importacao";
import {
  avisosDoPreparo,
  descreverPendentes,
  mensagemDaImportacao,
  resumoDaImportacao,
  rotuloDeGuardar,
} from "./textos";
import "../precos.css";

const ignorar = "ignorar";

/**
 * Guardar os preços da nota lida (spec 0001, CA-10 e CA-14): a pessoa escolhe o mercado e,
 * para cada produto, o item da lista ou "Ignorar". O que ela escolher numa nota fica lembrado
 * para as próximas da mesma loja e já aparece escolhido, podendo ser trocado. As regras ficam
 * em `importacao.ts`; aqui é só a tela.
 */
export function ImportacaoDaNota({
  nota,
  resumo,
  aparelho,
  onImportar,
}: {
  nota: NotaConsultada;
  resumo: string | null;
  aparelho: AparelhoDosPrecos;
  onImportar: (importacao: Importacao) => void;
}) {
  const base = useId();
  // A nota não muda depois de lida: o preparo é feito uma vez, com o aparelho daquele momento.
  const [preparo] = useState(() => prepararImportacao(nota, resumo, aparelho, diaDe(new Date())));
  const [mercado, setMercado] = useState<MercadoDoPreco | null>(preparo.mercado);
  const [decisoes, setDecisoes] = useState<(Decisao | undefined)[]>(() =>
    preparo.itens.map((item) => item.lembrado ?? undefined),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardada, setGuardada] = useState<string | null>(null);
  const aviso = useRef<HTMLDivElement>(null);
  // Dois toques seguidos chegam antes do botão desligar: a trava evita guardar a nota duas vezes.
  const salvando = useRef(false);
  const { opcoes, carga } = useOpcoesDeMercado(
    aparelho.ajustes,
    aparelho.proprios,
    aparelho.observacoes,
  );
  const opcoesDaNota = useMemo(
    () => opcoesComLembrado(opcoes, preparo.mercado),
    [opcoes, preparo.mercado],
  );
  const produtos = useMemo(
    () => produtosParaLigar(produtosDasListas(aparelho.lista), aparelho.observacoes, preparo),
    [aparelho.lista, aparelho.observacoes, preparo],
  );
  const pendentes = decisoes.filter((decisao) => decisao === undefined).length;
  const ligados = decisoes.filter((decisao) => decisao !== undefined && decisao !== ignorar).length;

  const valorDe = (decisao: Decisao | undefined): string => {
    if (decisao === undefined) return "";
    if (decisao === ignorar) return ignorar;
    const chave = chaveDoItem(decisao.produto);
    const indice = produtos.findIndex((nome) => chaveDoItem(nome) === chave);
    return indice === -1 ? "" : `p${indice}`;
  };
  const decidir = (indice: number, valor: string) => {
    setErro(null);
    const decisao: Decisao | undefined =
      valor === ignorar
        ? ignorar
        : valor.startsWith("p") && produtos[Number(valor.slice(1))] !== undefined
          ? { produto: produtos[Number(valor.slice(1))]! }
          : undefined;
    setDecisoes((atuais) => atuais.map((atual, i) => (i === indice ? decisao : atual)));
  };
  const ignorarOsQueFaltam = () => {
    setErro(null);
    setDecisoes((atuais) => atuais.map((atual) => atual ?? ignorar));
  };

  async function guardar() {
    if (salvando.current) return;
    const importado = aplicarImportacao(preparo, mercado, decisoes, aparelho, {
      agora: new Date(),
      gerarId,
    });
    if (!importado.ok) {
      setErro(mensagemDaImportacao(importado.erro));
      return;
    }
    setErro(null);
    salvando.current = true;
    setGuardando(true);
    const gravado = await aparelho.banco.aplicar(importado.valor.alteracoes);
    salvando.current = false;
    setGuardando(false);
    if (!gravado.ok) {
      setErro(mensagemDoBanco(gravado.erro));
      return;
    }
    onImportar(importado.valor);
    setGuardada(resumoDaImportacao(importado.valor, mercado?.nome ?? ""));
    requestAnimationFrame(() => aviso.current?.focus());
  }

  if (guardada !== null) {
    return (
      <div ref={aviso} className="importacao importacao-guardada" tabIndex={-1}>
        <h2>Preços guardados</h2>
        <p role="status">{guardada}</p>
        <p>
          <a className="botao" href="/precos">
            Ver os preços
          </a>
        </p>
      </div>
    );
  }

  return (
    <section className="importacao" aria-labelledby={`${base}-titulo`}>
      <h2 id={`${base}-titulo`}>Guardar os preços desta nota</h2>
      {!aparelho.banco.persistente && (
        <p className="alerta" role="note">
          Este navegador não deixa o site guardar dados: os preços somem ao fechar a página.
        </p>
      )}
      {avisosDoPreparo(preparo).map((texto) => (
        <p key={texto} className="consulta-aviso">
          {texto}
        </p>
      ))}
      <EscolhaDoMercado
        id={`${base}-mercado`}
        rotulo="Mercado desta nota"
        opcoes={opcoesDaNota}
        carga={carga}
        valor={mercado}
        onEscolher={(escolhido) => {
          setErro(null);
          setMercado(escolhido);
        }}
      />

      {preparo.itens.length === 0 ? (
        <p>Nenhum produto desta nota tem preço para guardar.</p>
      ) : (
        <fieldset className="importacao-produtos" aria-describedby={`${base}-ajuda`}>
          <legend>Produtos da nota</legend>
          <p id={`${base}-ajuda`} className="precos-ajuda">
            Escolha o item da sua lista que corresponde a cada produto, ou ignore o produto. A
            escolha fica lembrada para as próximas notas desta loja.
          </p>
          {produtos.length === 0 && (
            <p className="consulta-aviso">
              Sua lista ainda não tem itens. Monte a lista em <a href="/lista">Lista</a> para ligar
              os produtos da nota; por enquanto, eles só podem ser ignorados.
            </p>
          )}
          <ul className="importacao-itens">
            {preparo.itens.map((item, indice) => {
              const id = `${base}-item-${indice}`;
              return (
                <li key={id}>
                  <label htmlFor={id}>{item.descricao}</label>
                  <p id={`${id}-conta`} className="importacao-conta">
                    {formatarQuantidade(item.quantidade)} {item.unidade} ×{" "}
                    {formatarCentavos(item.precoCentavos)}
                    {item.codigo !== null && ` · Código ${item.codigo}`}
                    {item.lembrado !== null && " · escolha lembrada da última nota"}
                  </p>
                  <select
                    id={id}
                    aria-describedby={`${id}-conta`}
                    value={valorDe(decisoes[indice])}
                    onChange={(evento) => decidir(indice, evento.target.value)}
                  >
                    <option value="">Escolha o item da lista</option>
                    {produtos.map((nome, posicao) => (
                      <option key={nome} value={`p${posicao}`}>
                        {nome}
                      </option>
                    ))}
                    <option value={ignorar}>Ignorar este produto</option>
                  </select>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      <p className="precos-ajuda" role="status">
        {preparo.itens.length > 0 && descreverPendentes(pendentes)}
      </p>
      {erro !== null && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      <div className="acoes">
        <button type="button" className="botao" disabled={guardando} onClick={() => void guardar()}>
          {guardando ? "Guardando…" : rotuloDeGuardar(ligados)}
        </button>
        {pendentes > 0 && (
          <button type="button" className="botao botao-secundario" onClick={ignorarOsQueFaltam}>
            Ignorar os que faltam
          </button>
        )}
      </div>
    </section>
  );
}
