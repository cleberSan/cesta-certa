import { useId, useMemo, useState } from "react";
import { acessoInicial } from "../assistente/acesso";
import { Comparacao, useComparacao, type DadosDaComparacao } from "../comparar/Comparacao";
import { objetivoPadrao, type Objetivo } from "../comparar/objetivo";
import { descreverTotalDoMercado } from "../comparar/textos";
import { detalhesDoItem } from "../lista/textos";
import { formatarDistancia } from "../mercados/geo";
import { descreverTipo, resumoDoRaio } from "../mercados/textos";
import { diaDe } from "../precos/precos";
import { dadosDaDemonstracao, montarDemonstracao } from "./demo";
import "../mercados/mercados.css";
import "./demo.css";

const nada = () => {};

/**
 * A demonstração (spec 0001, T17; ADR-0007): a mesma comparação da tela de mercados, com o
 * bairro, os mercados, a lista e os preços fictícios do `demo.json`. Tudo fica na memória da
 * página: esta ilha não abre o banco do aparelho, então nada daqui se mistura com os dados da
 * pessoa (CA-38), e o objetivo mudado aqui some ao sair. O assistente responde com as
 * gravações, sem chamar o servidor (CA-35).
 */
export default function Demonstracao() {
  const base = useId();
  const hoje = useMemo(() => diaDe(new Date()), []);
  const demo = useMemo(() => montarDemonstracao(dadosDaDemonstracao, hoje), [hoje]);
  const [objetivo, setObjetivo] = useState<Objetivo>(objetivoPadrao);
  const comparacao = useComparacao(demo.mercados, {
    itens: demo.itens,
    observacoes: demo.observacoes,
    objetivo,
  });
  const dados: DadosDaComparacao = {
    listas: [demo.lista],
    listaId: demo.lista.id,
    itens: demo.itens,
    observacoes: demo.observacoes,
    objetivo,
    hoje,
    onLista: nada,
    onObjetivo: setObjetivo,
    demonstracao: true,
    assistente: { acesso: acessoInicial, onAcesso: nada, modo: "demonstracao" },
  };

  return (
    <div className="demo">
      <section aria-labelledby={`${base}-lista`}>
        <h2 id={`${base}-lista`}>{demo.lista.nome}</h2>
        <ul className="demo-itens">
          {demo.itens.map((item) => (
            <li key={item.id}>
              <strong>{item.nome}</strong>: {detalhesDoItem(item)}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby={`${base}-mercados`}>
        <h2 id={`${base}-mercados`}>
          Mercados perto da {demo.bairro}, em {demo.cidade}
        </h2>
        <p>{resumoDoRaio(demo.mercados.length, demo.raioKm)}</p>
        <Comparacao dados={dados} comparacao={comparacao} raioKm={demo.raioKm} />
        <ol className="mercados-lista">
          {demo.mercados.map((mercado) => {
            const total = comparacao?.porMercado.get(mercado.id);
            return (
              <li key={mercado.id}>
                <h3>{mercado.nome}</h3>
                <p>
                  {descreverTipo(mercado.tipo)} · {formatarDistancia(mercado.distanciaKm)} ·
                  fictício
                </p>
                {total !== undefined && (
                  <p className="mercados-total">{descreverTotalDoMercado(total)}</p>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
