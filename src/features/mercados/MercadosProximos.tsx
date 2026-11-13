import { useEffect, useMemo, useState } from "react";
import type { ErroDoBanco } from "../../shared/armazenamento/banco";
import { mensagemDoBanco } from "../../shared/armazenamento/textos";
import { recarregarAoVoltar } from "../../shared/recarregarAoVoltar";
import type { Resultado } from "../../shared/resultado";
import type { DadosDaComparacao } from "../comparar/Comparacao";
import type { Objetivo } from "../comparar/objetivo";
import { itensDaLista, listasRecentes } from "../lista/lista";
import { diaDe } from "../precos/precos";
import type { Ajustes, PontoEscolhido, Raio } from "./ajustes";
import {
  abrirAparelho,
  apagarMercado,
  esquecerPonto,
  guardarMercado,
  guardarObjetivo,
  guardarPonto,
  guardarRaio,
  type Aparelho,
} from "./aparelho";
import { EscolhaDoPonto } from "./EscolhaDoPonto";
import { MercadosPerto } from "./MercadosPerto";
import type { MercadoProprio } from "./proprios";
import "./mercados.css";

type Carga =
  | { fase: "abrindo" }
  | { fase: "pronta"; aparelho: Aparelho }
  | { fase: "falhou"; motivo: ErroDoBanco };

/**
 * Mercados perto de um ponto (spec 0001, T07 e T08). As regras ficam nos arquivos .ts ao lado;
 * aqui é só a tela. O ponto não sai do aparelho: o app baixa as células e calcula a distância
 * aqui.
 */
export default function MercadosProximos() {
  const [carga, setCarga] = useState<Carga>({ fase: "abrindo" });

  useEffect(() => recarregarAoVoltar(globalThis), []);

  useEffect(() => {
    let ativa = true;
    void abrirAparelho(globalThis.indexedDB).then((aberto) => {
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
      <p className="mercados-carregando" role="status">
        Abrindo…
      </p>
    );
  }
  if (carga.fase === "falhou") {
    return (
      <div className="alerta" role="alert">
        <p>
          <strong>A tela de mercados não abriu.</strong> {mensagemDoBanco(carga.motivo)}
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

function Painel({ aparelho }: { aparelho: Aparelho }) {
  const { banco } = aparelho;
  const [ajustes, setAjustes] = useState<Ajustes>(aparelho.ajustes);
  const [proprios, setProprios] = useState<readonly MercadoProprio[]>(aparelho.proprios);
  const [aviso, setAviso] = useState<string | null>(null);
  const [objetivo, setObjetivo] = useState<Objetivo>(aparelho.objetivo);
  const listas = useMemo(() => listasRecentes(aparelho.lista), [aparelho.lista]);
  const [listaId, setListaId] = useState<string | null>(listas[0]?.id ?? null);
  const itens = useMemo(
    () => (listaId === null ? [] : itensDaLista(aparelho.lista, listaId)),
    [aparelho.lista, listaId],
  );
  const hoje = useMemo(() => diaDe(new Date()), []);

  const avisarSeFalhou = (resultado: Resultado<void, ErroDoBanco>) => {
    setAviso(
      resultado.ok ? null : `Não ficou guardado neste aparelho. ${mensagemDoBanco(resultado.erro)}`,
    );
  };

  const escolher = (ponto: PontoEscolhido) => {
    setAjustes((atual) => ({ ...atual, ponto }));
    void guardarPonto(banco, ponto).then(avisarSeFalhou);
  };
  const trocar = () => {
    setAjustes((atual) => ({ ...atual, ponto: null }));
    void esquecerPonto(banco).then(avisarSeFalhou);
  };
  const mudarRaio = (km: Raio) => {
    setAjustes((atual) => ({ ...atual, raioKm: km }));
    void guardarRaio(banco, km).then(avisarSeFalhou);
  };
  const cadastrar = (mercado: MercadoProprio) => {
    setProprios((atuais) => [...atuais, mercado]);
    void guardarMercado(banco, mercado).then(avisarSeFalhou);
  };
  const dados: DadosDaComparacao = {
    listas,
    listaId,
    itens,
    observacoes: aparelho.observacoes,
    objetivo,
    hoje,
    onLista: setListaId,
    onObjetivo: (novo) => {
      setObjetivo(novo);
      void guardarObjetivo(banco, novo).then(avisarSeFalhou);
    },
  };
  const excluir = (id: string) => {
    setProprios((atuais) => atuais.filter((mercado) => mercado.id !== id));
    void apagarMercado(banco, id).then(avisarSeFalhou);
  };

  return (
    <div className="mercados">
      {!banco.persistente && (
        <p className="alerta" role="note">
          Este navegador não deixa o site guardar dados: o ponto e os mercados cadastrados somem ao
          fechar a página.
        </p>
      )}
      {aviso !== null && (
        <p className="alerta" role="alert">
          {aviso}
        </p>
      )}
      {ajustes.ponto === null ? (
        <EscolhaDoPonto onEscolher={escolher} />
      ) : (
        <MercadosPerto
          ponto={ajustes.ponto}
          raioKm={ajustes.raioKm}
          proprios={proprios}
          comparacao={dados}
          onRaio={mudarRaio}
          onTrocar={trocar}
          onCadastrar={cadastrar}
          onExcluir={excluir}
        />
      )}
    </div>
  );
}
