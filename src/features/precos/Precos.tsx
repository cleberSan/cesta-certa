import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ErroDoBanco } from "../../shared/armazenamento/banco";
import { mensagemDoBanco } from "../../shared/armazenamento/textos";
import { formatarCentavos } from "../../shared/dinheiro";
import { recarregarAoVoltar } from "../../shared/recarregarAoVoltar";
import type { Resultado } from "../../shared/resultado";
import { chaveDoItem } from "../lista/lista";
import { abrirPrecos, apagarPreco, guardarPrecos, type AparelhoDosPrecos } from "./aparelho";
import { useOpcoesDeMercado } from "./EscolhaDoMercado";
import { produtosDasListas } from "./escolha";
import { FormularioDoPreco } from "./FormularioDoPreco";
import { diaDe, precosPorProduto, type ObservacaoDePreco, type PrecoNaTela } from "./precos";
import {
  avisoDeAntigo,
  avisoDoPreco,
  contarPrecos,
  descreverAtacado,
  descreverEmbalagem,
  descreverFonte,
} from "./textos";
import "./precos.css";

type Carga =
  | { fase: "abrindo" }
  | { fase: "pronta"; aparelho: AparelhoDosPrecos }
  | { fase: "falhou"; motivo: ErroDoBanco };

/**
 * Preços que a pessoa registrou (spec 0001, T12): cada um com a fonte, o dia em que foi visto
 * e a marca de antigo (CA-16), e o formulário do preço digitado (CA-15). As regras ficam nos
 * arquivos .ts ao lado; aqui é só a tela.
 */
export default function Precos() {
  const [carga, setCarga] = useState<Carga>({ fase: "abrindo" });

  useEffect(() => recarregarAoVoltar(globalThis), []);

  useEffect(() => {
    let ativa = true;
    void abrirPrecos(globalThis.indexedDB).then((aberto) => {
      if (!ativa) return;
      setCarga(
        aberto.ok
          ? { fase: "pronta", aparelho: aberto.valor }
          : { fase: "falhou", motivo: aberto.erro },
      );
    });
    return () => {
      ativa = false;
    };
  }, []);

  if (carga.fase === "abrindo") {
    return (
      <p className="precos-carregando" role="status">
        Abrindo…
      </p>
    );
  }
  if (carga.fase === "falhou") {
    return (
      <div className="alerta" role="alert">
        <p>
          <strong>A tela de preços não abriu.</strong> {mensagemDoBanco(carga.motivo)}
        </p>
        <p>
          <button type="button" className="botao" onClick={() => globalThis.location.reload()}>
            Recarregar a página
          </button>
        </p>
      </div>
    );
  }
  return <Painel aparelho={carga.aparelho} />;
}

function Painel({ aparelho }: { aparelho: AparelhoDosPrecos }) {
  const { banco } = aparelho;
  const [observacoes, setObservacoes] = useState(aparelho.observacoes);
  // A tela só chega aqui no navegador, depois de abrir o aparelho: dá para ler o endereço.
  const [digitando, setDigitando] = useState(() => globalThis.location.hash === "#digitar");
  const [anuncio, setAnuncio] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const botaoDigitar = useRef<HTMLButtonElement>(null);
  const { opcoes, carga } = useOpcoesDeMercado(aparelho.ajustes, aparelho.proprios, observacoes);
  const produtos = useMemo(() => produtosDasListas(aparelho.lista), [aparelho.lista]);
  const hoje = diaDe(new Date());
  const grupos = useMemo(
    () => precosPorProduto(observacoes, hoje, chaveDoItem),
    [observacoes, hoje],
  );

  const avisarSeFalhou = (resultado: Resultado<void, ErroDoBanco>) => {
    if (!resultado.ok) setAviso(mensagemDoBanco(resultado.erro));
  };
  const guardar = (observacao: ObservacaoDePreco) => {
    setAviso(null);
    setObservacoes((atuais) => [...atuais, observacao]);
    setAnuncio(avisoDoPreco(observacao));
    void guardarPrecos(banco, [observacao]).then(avisarSeFalhou);
  };
  const excluir = (id: string) => {
    setAviso(null);
    setObservacoes((atuais) => atuais.filter((observacao) => observacao.id !== id));
    setAnuncio("Preço excluído.");
    void apagarPreco(banco, id).then(avisarSeFalhou);
  };
  const fechar = () => {
    setDigitando(false);
    botaoDigitar.current?.focus();
  };

  return (
    <div className="precos">
      {!banco.persistente && (
        <p className="alerta" role="note">
          Este navegador não deixa o site guardar dados: os preços somem ao fechar a página.
        </p>
      )}
      {aviso !== null && (
        <p className="alerta" role="alert">
          {aviso}
        </p>
      )}
      <div className="acoes">
        <a className="botao" href="/nota">
          Ler a nota fiscal de uma compra
        </a>
        {!digitando && (
          <button
            ref={botaoDigitar}
            type="button"
            className="botao botao-secundario"
            onClick={() => setDigitando(true)}
          >
            Digitar um preço
          </button>
        )}
      </div>
      {digitando && (
        <FormularioDoPreco
          produtos={produtos}
          opcoes={opcoes}
          carga={carga}
          quantosHa={observacoes.length}
          onGuardar={guardar}
          onFechar={fechar}
        />
      )}
      <p className="somente-leitor" role="status">
        {anuncio}
      </p>
      <h2>
        {observacoes.length === 0
          ? "Nenhum preço registrado"
          : `${contarPrecos(observacoes.length)} neste aparelho`}
      </h2>
      {observacoes.length === 0 ? (
        <p>
          Leia a nota fiscal de uma compra ou digite um preço visto no mercado. Cada preço mostra de
          onde veio e quando foi visto.
        </p>
      ) : (
        grupos.map((grupo) => (
          <section key={grupo.nome} className="precos-produto" aria-label={grupo.nome}>
            <h3>{grupo.nome}</h3>
            <ul className="precos-lista">
              {grupo.precos.map((preco) => (
                <ItemDePreco key={preco.observacao.id} preco={preco} onExcluir={excluir} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function ItemDePreco({
  preco,
  onExcluir,
}: {
  preco: PrecoNaTela;
  onExcluir: (id: string) => void;
}) {
  const base = useId();
  const [confirmando, setConfirmando] = useState(false);
  const { observacao, antigo } = preco;
  const embalagem = descreverEmbalagem(observacao);
  const resumo = `${formatarCentavos(observacao.precoCentavos)} em ${observacao.mercadoNome}`;

  return (
    <li>
      <p className="precos-valor">
        <strong>{formatarCentavos(observacao.precoCentavos)}</strong>
        {embalagem !== null && <span> · {embalagem}</span>}
      </p>
      <p>{observacao.mercadoNome}</p>
      <p className="precos-fonte">
        {descreverFonte(observacao)}
        {antigo && <span className="etiqueta precos-antigo">{avisoDeAntigo}</span>}
      </p>
      {observacao.minimoAtacado !== null && <p>{descreverAtacado(observacao.minimoAtacado)}</p>}
      {observacao.descricao !== null && (
        <p className="precos-ajuda">Na nota: {observacao.descricao}</p>
      )}
      {confirmando ? (
        <div className="confirmacao" role="group" aria-labelledby={`${base}-excluir`}>
          <p id={`${base}-excluir`}>Excluir o preço de {resumo}?</p>
          <div className="acoes">
            <button
              type="button"
              className="botao botao-perigo botao-pequeno"
              onClick={() => onExcluir(observacao.id)}
            >
              Excluir
            </button>
            <button
              type="button"
              className="botao botao-secundario botao-pequeno"
              onClick={() => setConfirmando(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="botao botao-secundario botao-pequeno"
          onClick={() => setConfirmando(true)}
        >
          Excluir<span className="somente-leitor"> o preço de {resumo}</span>
        </button>
      )}
    </li>
  );
}
