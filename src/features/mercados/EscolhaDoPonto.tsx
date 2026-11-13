import { useEffect, useId, useMemo, useState } from "react";
import type { Cidade } from "../../shared/contratos/mercados";
import { centroDoBrasil, zoomDoBrasil } from "../mapa/geojson";
import { MiraNoMapaSobDemanda } from "../mapa/SobDemanda";
import type { PontoEscolhido } from "./ajustes";
import { buscarNoSite, carregarCidades, type ErroDaCarga } from "./carga";
import { buscarCidades, rotuloDaCidade } from "./cidades";
import type { Ponto } from "./geo";
import { pedirLocalizacao, type ErroDaLocalizacao } from "./localizacao";
import { mensagemDaCarga, mensagemDaLocalizacao } from "./textos";

/**
 * Primeiro acesso (spec 0001, CA-05): explica para que serve o ponto e só pede a localização
 * depois do toque; a cidade e o ponto marcado no mapa são os outros caminhos.
 */
export function EscolhaDoPonto({ onEscolher }: { onEscolher: (ponto: PontoEscolhido) => void }) {
  const titulo = useId();
  const [modo, setModo] = useState<"inicio" | "pedindo" | "cidade" | "mapa">("inicio");
  const [erro, setErro] = useState<ErroDaLocalizacao | null>(null);

  const usarLocalizacao = async () => {
    setModo("pedindo");
    setErro(null);
    const resultado = await pedirLocalizacao(globalThis.navigator?.geolocation);
    if (resultado.ok) {
      onEscolher({ ...resultado.valor, origem: "localizacao", rotulo: null });
      return;
    }
    setErro(resultado.erro);
    setModo("inicio");
  };

  if (modo === "cidade") {
    return <EscolherCidade onEscolher={onEscolher} onVoltar={() => setModo("inicio")} />;
  }
  if (modo === "mapa") {
    return <MarcarNoMapa onEscolher={onEscolher} onVoltar={() => setModo("inicio")} />;
  }
  return (
    <section className="cartao" aria-labelledby={titulo}>
      <h2 id={titulo}>Para achar os mercados perto de você</h2>
      <p>
        O app precisa de um ponto, a sua localização ou uma cidade, para listar os mercados num raio
        de até 30 km e dizer a que distância cada um fica.
      </p>
      <p>
        O ponto fica só neste aparelho. Para listar os mercados, o app baixa deste site os mercados
        de uma região de cerca de 110 km e faz a conta da distância aqui, sem mandar o ponto para
        ninguém.
      </p>
      <p>
        Se você abrir um mapa, ele baixa do OpenFreeMap as imagens da área que aparece na tela, e o
        OpenFreeMap fica sabendo que área é essa.
      </p>
      <div className="acoes">
        <button
          type="button"
          className="botao"
          onClick={() => void usarLocalizacao()}
          disabled={modo === "pedindo"}
        >
          Usar minha localização
        </button>
        <button type="button" className="botao botao-secundario" onClick={() => setModo("cidade")}>
          Escolher cidade
        </button>
        <button type="button" className="botao botao-secundario" onClick={() => setModo("mapa")}>
          Marcar no mapa
        </button>
      </div>
      <p role="status" className="mercados-carregando">
        {modo === "pedindo" ? "Pedindo a localização ao navegador…" : ""}
      </p>
      {erro !== null && (
        <p className="mensagem-erro" role="alert">
          {mensagemDaLocalizacao(erro)}
        </p>
      )}
    </section>
  );
}

type CargaDasCidades =
  | { fase: "abrindo" }
  | { fase: "pronta"; cidades: readonly Cidade[] }
  | { fase: "falhou"; erro: ErroDaCarga };

function EscolherCidade({
  onEscolher,
  onVoltar,
}: {
  onEscolher: (ponto: PontoEscolhido) => void;
  onVoltar: () => void;
}) {
  const base = useId();
  const [carga, setCarga] = useState<CargaDasCidades>({ fase: "abrindo" });
  const [termo, setTermo] = useState("");
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativa = true;
    void carregarCidades(buscarNoSite).then((carregadas) => {
      if (!ativa) return;
      setCarga(
        carregadas.ok
          ? { fase: "pronta", cidades: carregadas.valor }
          : { fase: "falhou", erro: carregadas.erro },
      );
    });
    return () => {
      ativa = false;
    };
  }, [tentativa]);

  const resultados = useMemo(
    () => (carga.fase === "pronta" ? buscarCidades(carga.cidades, termo) : []),
    [carga, termo],
  );
  const curto = termo.trim().length < 2;

  return (
    <section className="cartao" aria-labelledby={`${base}-titulo`}>
      <h2 id={`${base}-titulo`}>Escolher cidade</h2>
      {carga.fase === "abrindo" && (
        <p role="status" className="mercados-carregando">
          Baixando a lista de cidades…
        </p>
      )}
      {carga.fase === "falhou" && (
        <div role="alert">
          <p className="mensagem-erro">{mensagemDaCarga(carga.erro, "cidades")}</p>
          {carga.erro === "sem-conexao" && (
            <p>
              <button
                type="button"
                className="botao botao-secundario"
                onClick={() => {
                  setCarga({ fase: "abrindo" });
                  setTentativa((n) => n + 1);
                }}
              >
                Tentar de novo
              </button>
            </p>
          )}
        </div>
      )}
      {carga.fase === "pronta" && (
        <>
          <div className="campo">
            <label htmlFor={`${base}-busca`}>Nome da cidade</label>
            <input
              id={`${base}-busca`}
              type="search"
              autoComplete="off"
              aria-describedby={`${base}-dica`}
              value={termo}
              onChange={(evento) => setTermo(evento.target.value)}
            />
          </div>
          <p id={`${base}-dica`} className="mercados-carregando">
            Digite pelo menos 2 letras. A busca é feita neste aparelho.
          </p>
          <p role="status">
            {curto
              ? ""
              : resultados.length === 0
                ? "Nenhuma cidade com esse nome."
                : `${resultados.length === 1 ? "1 cidade encontrada" : `${resultados.length} cidades encontradas`}.`}
          </p>
          <ul className="mercados-cidades">
            {resultados.map((cidade) => (
              <li key={`${cidade.uf}|${cidade.nome}|${cidade.lat}|${cidade.lon}`}>
                <button
                  type="button"
                  className="botao botao-secundario"
                  onClick={() =>
                    onEscolher({
                      lat: cidade.lat,
                      lon: cidade.lon,
                      origem: "cidade",
                      rotulo: rotuloDaCidade(cidade),
                    })
                  }
                >
                  {rotuloDaCidade(cidade)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p>
        <button type="button" className="botao botao-secundario" onClick={onVoltar}>
          Voltar
        </button>
      </p>
    </section>
  );
}

/** O ponto marcado com a mira do mapa, partindo do Brasil inteiro na tela (CA-05). */
function MarcarNoMapa({
  onEscolher,
  onVoltar,
}: {
  onEscolher: (ponto: PontoEscolhido) => void;
  onVoltar: () => void;
}) {
  const titulo = useId();
  const [centro, setCentro] = useState<Ponto | null>(null);

  return (
    <section className="cartao" aria-labelledby={titulo}>
      <h2 id={titulo}>Marcar no mapa</h2>
      <MiraNoMapaSobDemanda
        titulo="Mapa para marcar o ponto"
        inicio={centroDoBrasil}
        zoom={zoomDoBrasil}
        onCentro={setCentro}
        alternativa="Volte e escolha a cidade."
      />
      <div className="acoes">
        <button
          type="button"
          className="botao"
          disabled={centro === null}
          onClick={() => {
            if (centro !== null) onEscolher({ ...centro, origem: "mapa", rotulo: null });
          }}
        >
          Usar este ponto
        </button>
        <button type="button" className="botao botao-secundario" onClick={onVoltar}>
          Voltar
        </button>
      </div>
    </section>
  );
}
