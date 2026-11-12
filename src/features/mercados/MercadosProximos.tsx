import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ErroDoBanco } from "../../shared/armazenamento/banco";
import { mensagemDoBanco } from "../../shared/armazenamento/textos";
import {
  celulaDe,
  type Cidade,
  type IndiceLido,
  type MercadoDaBase,
} from "../../shared/contratos/mercados";
import { recarregarAoVoltar } from "../../shared/recarregarAoVoltar";
import type { Resultado } from "../../shared/resultado";
import { ehRaio, raios, type Ajustes, type PontoEscolhido, type Raio } from "./ajustes";
import { abrirAparelho, esquecerPonto, guardarPonto, guardarRaio, type Aparelho } from "./aparelho";
import {
  carregarCidades,
  carregarIndice,
  carregarMercados,
  type Buscar,
  type ErroDaCarga,
} from "./carga";
import { buscarCidades, rotuloDaCidade } from "./cidades";
import { celulasDoRaio, formatarDistancia } from "./geo";
import { pedirLocalizacao, type ErroDaLocalizacao } from "./localizacao";
import { mercadosNoRaio, situacaoDoPonto } from "./proximos";
import {
  descreverTipo,
  mensagemDaCarga,
  mensagemDaLocalizacao,
  mesDaBase,
  resumoDoRaio,
} from "./textos";
import "./mercados.css";

/** Só arquivos do próprio site (CSP `connect-src 'self'`). */
const buscarNoSite: Buscar = (caminho) => fetch(caminho);

const porPagina = 50;

type Carga =
  | { fase: "abrindo" }
  | { fase: "pronta"; aparelho: Aparelho }
  | { fase: "falhou"; motivo: ErroDoBanco };

/**
 * Mercados perto de um ponto (spec 0001, T07). As regras ficam nos arquivos .ts ao lado; aqui
 * é só a tela. O ponto não sai do aparelho: o app baixa as células e calcula a distância aqui.
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
  const [aviso, setAviso] = useState<string | null>(null);

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

  return (
    <div className="mercados">
      {!banco.persistente && (
        <p className="alerta" role="note">
          Este navegador não deixa o site guardar dados: o ponto escolhido some ao fechar a página.
        </p>
      )}
      {aviso !== null && (
        <p className="alerta" role="alert">
          {aviso}
        </p>
      )}
      {ajustes.ponto === null ? (
        <Escolha onEscolher={escolher} />
      ) : (
        <Proximos
          ponto={ajustes.ponto}
          raioKm={ajustes.raioKm}
          onRaio={mudarRaio}
          onTrocar={trocar}
        />
      )}
    </div>
  );
}

function Escolha({ onEscolher }: { onEscolher: (ponto: PontoEscolhido) => void }) {
  const titulo = useId();
  const [modo, setModo] = useState<"inicio" | "pedindo" | "cidade">("inicio");
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

type CargaDosMercados =
  | { fase: "abrindo" }
  | { fase: "pronta"; mercados: readonly MercadoDaBase[]; geradoEm: string }
  | { fase: "falhou"; erro: ErroDaCarga };

const abrindo: CargaDosMercados = { fase: "abrindo" };

function Proximos({
  ponto,
  raioKm,
  onRaio,
  onTrocar,
}: {
  ponto: PontoEscolhido;
  raioKm: Raio;
  onRaio: (km: Raio) => void;
  onTrocar: () => void;
}) {
  const base = useId();
  const [tentativa, setTentativa] = useState(0);
  const [mostrar, setMostrar] = useState(porPagina);
  // A resposta vale para o ponto, o raio e a tentativa em que foi pedida; enquanto a do
  // pedido atual não chega, a tela mostra "baixando".
  const chave = `${ponto.lat} ${ponto.lon} ${raioKm} ${tentativa}`;
  const [resposta, setResposta] = useState<{ chave: string; carga: CargaDosMercados } | null>(null);
  const carga = resposta?.chave === chave ? resposta.carga : abrindo;
  // Índice e células já baixados nesta tela: trocar o raio não baixa de novo o que já veio.
  const indiceBaixado = useRef<IndiceLido | null>(null);
  const baixadas = useRef(new Map<string, readonly MercadoDaBase[]>());

  useEffect(() => {
    let ativa = true;
    const responder = (carga: CargaDosMercados) => {
      if (ativa) setResposta({ chave, carga });
    };
    void (async () => {
      if (indiceBaixado.current === null) {
        const indice = await carregarIndice(buscarNoSite);
        if (!indice.ok) {
          responder({ fase: "falhou", erro: indice.erro });
          return;
        }
        indiceBaixado.current = indice.valor;
      }
      const indice = indiceBaixado.current;
      const celulas = celulasDoRaio(ponto, raioKm);
      const faltam = celulas.filter((celula) => !baixadas.current.has(celula));
      const novas = await carregarMercados(buscarNoSite, indice, faltam);
      if (!novas.ok) {
        responder({ fase: "falhou", erro: novas.erro });
        return;
      }
      const porCelula = new Map<string, MercadoDaBase[]>(faltam.map((celula) => [celula, []]));
      for (const mercado of novas.valor.mercados) {
        porCelula.get(celulaDe(mercado.lat, mercado.lon))?.push(mercado);
      }
      for (const [celula, mercados] of porCelula) baixadas.current.set(celula, mercados);
      const mercados = celulas.flatMap((celula) => baixadas.current.get(celula) ?? []);
      responder({ fase: "pronta", mercados, geradoEm: indice.geradoEm });
    })();
    return () => {
      ativa = false;
    };
  }, [chave, ponto, raioKm]);

  const proximos = useMemo(
    () => (carga.fase === "pronta" ? mercadosNoRaio(carga.mercados, ponto, raioKm) : []),
    [carga, ponto, raioKm],
  );
  const proximoRaio = raios.find((km) => km > raioKm);

  return (
    <section aria-labelledby={`${base}-titulo`}>
      <h2 id={`${base}-titulo`}>
        {ponto.rotulo === null ? "Mercados perto de você" : `Mercados perto de ${ponto.rotulo}`}
      </h2>
      <div className="mercados-ponto">
        <p>
          {ponto.origem === "localizacao"
            ? "Ponto: a sua localização."
            : `Ponto: ${ponto.rotulo ?? "escolhido no mapa"}.`}
        </p>
        <button type="button" className="botao botao-secundario botao-pequeno" onClick={onTrocar}>
          Trocar o ponto
        </button>
      </div>
      <div className="campo mercados-raio">
        <label htmlFor={`${base}-raio`}>Distância máxima</label>
        <select
          id={`${base}-raio`}
          value={raioKm}
          onChange={(evento) => {
            const km = Number(evento.target.value);
            if (ehRaio(km)) {
              setMostrar(porPagina);
              onRaio(km);
            }
          }}
        >
          {raios.map((km) => (
            <option key={km} value={km}>
              {km} km
            </option>
          ))}
        </select>
      </div>

      <p role="status" className={carga.fase === "pronta" ? undefined : "mercados-carregando"}>
        {carga.fase === "abrindo"
          ? "Baixando os mercados da região…"
          : carga.fase === "pronta"
            ? resumoDoRaio(proximos.length, raioKm)
            : ""}
      </p>
      {carga.fase === "falhou" && (
        <div role="alert">
          <p className="mensagem-erro">{mensagemDaCarga(carga.erro)}</p>
          {carga.erro !== "sem-base" && (
            <p>
              <button
                type="button"
                className="botao botao-secundario"
                onClick={() => setTentativa((n) => n + 1)}
              >
                Tentar de novo
              </button>
            </p>
          )}
        </div>
      )}
      {carga.fase === "pronta" && proximos.length === 0 && (
        <div className="cartao">
          <p>
            {situacaoDoPonto(ponto, 0) === "fora-do-brasil"
              ? "Este ponto parece estar fora do Brasil, e a base de mercados cobre só o Brasil."
              : `Não há mercado da base em até ${raioKm} km deste ponto.`}
          </p>
          {proximoRaio !== undefined && (
            <p>
              <button type="button" className="botao" onClick={() => onRaio(proximoRaio)}>
                Aumentar para {proximoRaio} km
              </button>
            </p>
          )}
        </div>
      )}
      {proximos.length > 0 && (
        <ol className="mercados-lista">
          {proximos.slice(0, mostrar).map((mercado) => (
            <li key={mercado.id}>
              <h3>{mercado.nome}</h3>
              <p>
                {descreverTipo(mercado.tipo)} · {formatarDistancia(mercado.distanciaKm)}
              </p>
            </li>
          ))}
        </ol>
      )}
      {proximos.length > mostrar && (
        <p>
          <button
            type="button"
            className="botao botao-secundario"
            onClick={() => setMostrar((n) => n + porPagina)}
          >
            Mostrar mais {Math.min(porPagina, proximos.length - mostrar)}
          </button>
        </p>
      )}
      {carga.fase === "pronta" && (
        <p className="mercados-atribuicao">
          Mercados da base de {mesDaBase(carga.geradoEm)}, com dados ©{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
          >
            colaboradores do OpenStreetMap
          </a>
          .
        </p>
      )}
    </section>
  );
}
