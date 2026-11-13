import { useEffect, useMemo, useState } from "react";
import type { MercadoDaBase } from "../../shared/contratos/mercados";
import type { Ajustes } from "../mercados/ajustes";
import { buscarNoSite, carregarDoRaio } from "../mercados/carga";
import { mercadosNoRaio } from "../mercados/proximos";
import type { MercadoProprio } from "../mercados/proprios";
import { opcoesDeMercado, type OpcaoDeMercado } from "./escolha";
import type { MercadoDoPreco, ObservacaoDePreco } from "./precos";

export type CargaDaBase = "sem-ponto" | "baixando" | "pronta" | "falhou";

/**
 * Mercados que o formulário de preço oferece: os da base perto do ponto da busca (baixados
 * uma vez, só se há ponto), os cadastrados e os já usados em algum preço.
 */
export function useOpcoesDeMercado(
  ajustes: Ajustes,
  proprios: readonly MercadoProprio[],
  observacoes: readonly ObservacaoDePreco[],
): { readonly opcoes: readonly OpcaoDeMercado[]; readonly carga: CargaDaBase } {
  const { ponto, raioKm } = ajustes;
  const [base, setBase] = useState<{
    fase: "pronta" | "falhou";
    mercados: readonly MercadoDaBase[];
  } | null>(null);

  useEffect(() => {
    if (ponto === null) return;
    let ativa = true;
    void carregarDoRaio(buscarNoSite, ponto, raioKm).then((carregados) => {
      if (!ativa) return;
      setBase(
        carregados.ok
          ? { fase: "pronta", mercados: carregados.valor }
          : { fase: "falhou", mercados: [] },
      );
    });
    return () => {
      ativa = false;
    };
  }, [ponto, raioKm]);

  const opcoes = useMemo(() => {
    const proximos =
      ponto === null ? [] : mercadosNoRaio([...(base?.mercados ?? []), ...proprios], ponto, raioKm);
    return opcoesDeMercado(proximos, proprios, observacoes);
  }, [base, ponto, raioKm, proprios, observacoes]);

  const carga: CargaDaBase = ponto === null ? "sem-ponto" : (base?.fase ?? "baixando");
  return { opcoes, carga };
}

/** Lista de escolha do mercado, com a situação da base logo abaixo. */
export function EscolhaDoMercado({
  id,
  rotulo,
  opcoes,
  carga,
  valor,
  onEscolher,
}: {
  id: string;
  rotulo: string;
  opcoes: readonly OpcaoDeMercado[];
  carga: CargaDaBase;
  valor: MercadoDoPreco | null;
  onEscolher: (mercado: MercadoDoPreco | null) => void;
}) {
  const ajuda = `${id}-ajuda`;
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <select
        id={id}
        aria-describedby={ajuda}
        value={valor?.id ?? ""}
        onChange={(evento) => {
          const escolhida = opcoes.find((opcao) => opcao.id === evento.target.value);
          onEscolher(escolhida === undefined ? null : { id: escolhida.id, nome: escolhida.nome });
        }}
      >
        <option value="">Escolha o mercado</option>
        {opcoes.map((opcao) => (
          <option key={opcao.id} value={opcao.id}>
            {opcao.nome} ({opcao.detalhe})
          </option>
        ))}
      </select>
      <p id={ajuda} className="precos-ajuda" role="status">
        {carga === "sem-ponto" && (
          <>
            Para ver os mercados perto, escolha o ponto da busca em <a href="/mercados">Mercados</a>
            . Aqui aparecem os que você cadastrou e os que já têm preço.
          </>
        )}
        {carga === "baixando" && "Baixando os mercados perto do ponto da busca…"}
        {carga === "falhou" &&
          "Os mercados perto do ponto não puderam ser baixados agora. Aparecem os que você cadastrou e os que já têm preço."}
        {carga === "pronta" && opcoes.length === 0 && (
          <>
            Nenhum mercado perto do ponto da busca. Cadastre o mercado em{" "}
            <a href="/mercados">Mercados</a>.
          </>
        )}
      </p>
    </div>
  );
}
