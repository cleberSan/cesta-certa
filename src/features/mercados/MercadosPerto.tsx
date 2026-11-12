import { useEffect, useId, useMemo, useRef, useState } from "react";
import { celulaDe, type IndiceLido, type MercadoDaBase } from "../../shared/contratos/mercados";
import type { Pino } from "../mapa/geojson";
import { MapaDosMercadosSobDemanda } from "../mapa/SobDemanda";
import { ehRaio, raios, type PontoEscolhido, type Raio } from "./ajustes";
import { CadastrarMercado } from "./CadastrarMercado";
import { buscarNoSite, carregarIndice, carregarMercados, type ErroDaCarga } from "./carga";
import { celulasDoRaio, distanciaKm } from "./geo";
import { DetalhesDoMercado } from "./DetalhesDoMercado";
import { ItemDoMercado, ResumoDoMercado, type MercadoNaTela } from "./ItemDoMercado";
import type { MercadoProprio } from "./proprios";
import { mercadosNoRaio, situacaoDoPonto, type Proximo } from "./proximos";
import { avisoDoCadastro, mensagemDaCarga, mesDaBase, resumoDoRaio } from "./textos";

const porPagina = 50;

type CargaDosMercados =
  | { fase: "abrindo" }
  | { fase: "pronta"; mercados: readonly MercadoDaBase[]; geradoEm: string }
  | { fase: "falhou"; erro: ErroDaCarga };

const abrindo: CargaDosMercados = { fase: "abrindo" };

/**
 * Mercados perto do ponto (spec 0001, CA-07, CA-08, CA-09 e CA-39): os da base, baixados por
 * célula, e os que a pessoa cadastrou, juntos e em ordem de distância calculada no aparelho.
 * A lista é a visão padrão; o mapa abre sob demanda e mostra os mesmos mercados (CA-37).
 */
export function MercadosPerto({
  ponto,
  raioKm,
  proprios,
  onRaio,
  onTrocar,
  onCadastrar,
  onExcluir,
}: {
  ponto: PontoEscolhido;
  raioKm: Raio;
  proprios: readonly MercadoProprio[];
  onRaio: (km: Raio) => void;
  onTrocar: () => void;
  onCadastrar: (mercado: MercadoProprio) => void;
  onExcluir: (id: string) => void;
}) {
  const base = useId();
  const [tentativa, setTentativa] = useState(0);
  const [mostrar, setMostrar] = useState(porPagina);
  const [cadastrando, setCadastrando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [mapaAberto, setMapaAberto] = useState(false);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const botaoCadastrar = useRef<HTMLButtonElement>(null);
  const botaoDoMapa = useRef<HTMLButtonElement>(null);
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

  // Os cadastrados aparecem mesmo sem a base: antes de ela chegar ou quando ela falha.
  const proximos = useMemo(() => {
    const daBase = carga.fase === "pronta" ? carga.mercados : [];
    const todos: MercadoNaTela[] = [
      ...daBase.map((mercado) => ({ ...mercado, origem: "base" as const })),
      ...proprios.map((mercado) => ({ ...mercado, origem: "proprio" as const })),
    ];
    return mercadosNoRaio(todos, ponto, raioKm);
  }, [carga, proprios, ponto, raioKm]);
  const proximoRaio = raios.find((km) => km > raioKm);
  const pinos = useMemo(
    (): Pino[] =>
      proximos.map(({ id, lat, lon, origem }) => ({ id, lat, lon, proprio: origem === "proprio" })),
    [proximos],
  );
  const mercadoEscolhido = mapaAberto
    ? proximos.find((mercado) => mercado.id === escolhido)
    : undefined;

  const voltarAoMapa = () => {
    setEscolhido(null);
    queueMicrotask(() => botaoDoMapa.current?.focus());
  };

  const cadastrar = (mercado: MercadoProprio) => {
    setCadastrando(false);
    setAviso(avisoDoCadastro(mercado.nome, distanciaKm(ponto, mercado), raioKm));
    onCadastrar(mercado);
    // O formulário some: o foco volta para o botão que o abriu.
    queueMicrotask(() => botaoCadastrar.current?.focus());
  };

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
      <div className="mercados-mapa">
        <div className="mercados-mapa-alternar">
          <button
            ref={botaoDoMapa}
            type="button"
            className="botao botao-secundario"
            aria-expanded={mapaAberto}
            aria-controls={`${base}-mapa`}
            onClick={() => {
              setMapaAberto((aberto) => !aberto);
              setEscolhido(null);
            }}
          >
            {mapaAberto ? "Esconder o mapa" : "Mostrar no mapa"}
          </button>
          <p className="mercados-nota">
            O mapa baixa do OpenFreeMap as imagens da área na tela. A lista tem as mesmas
            informações.
          </p>
        </div>
        {mapaAberto && (
          <div id={`${base}-mapa`}>
            <MapaDosMercadosSobDemanda
              ponto={ponto}
              raioKm={raioKm}
              pinos={pinos}
              escolhido={escolhido}
              onEscolher={setEscolhido}
              alternativa="A lista abaixo tem as mesmas informações."
            />
            {mercadoEscolhido !== undefined && (
              <FolhaDoMercado
                key={mercadoEscolhido.id}
                mercado={mercadoEscolhido}
                onFechar={voltarAoMapa}
                onExcluir={(id) => {
                  voltarAoMapa();
                  onExcluir(id);
                }}
              />
            )}
          </div>
        )}
      </div>
      {carga.fase === "pronta" && proximos.length === 0 && (
        <div className="cartao">
          <p>
            {situacaoDoPonto(ponto, 0) === "fora-do-brasil"
              ? "Este ponto parece estar fora do Brasil, e a base de mercados cobre só o Brasil."
              : `Não há mercado da base em até ${raioKm} km deste ponto. Aumente a distância ou cadastre o mercado que você conhece.`}
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
            <ItemDoMercado key={mercado.id} mercado={mercado} onExcluir={onExcluir} />
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

      <p role="status" className="mercados-aviso">
        {aviso}
      </p>
      {cadastrando ? (
        <CadastrarMercado
          ponto={ponto}
          proprios={proprios}
          onCadastrar={cadastrar}
          onCancelar={() => {
            setCadastrando(false);
            queueMicrotask(() => botaoCadastrar.current?.focus());
          }}
        />
      ) : (
        <p className="mercados-falta">
          Não achou um mercado?{" "}
          <button
            ref={botaoCadastrar}
            type="button"
            className="botao botao-secundario botao-pequeno"
            onClick={() => {
              setAviso("");
              setCadastrando(true);
            }}
          >
            Cadastrar mercado
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

/**
 * Folha logo abaixo do mapa com o mercado tocado (T10): o mesmo "Saber mais" da lista. O foco
 * vai para ela, para quem segue pelo teclado ou leitor de tela chegar à rota.
 */
function FolhaDoMercado({
  mercado,
  onFechar,
  onExcluir,
}: {
  mercado: Proximo<MercadoNaTela>;
  onFechar: () => void;
  onExcluir: (id: string) => void;
}) {
  const titulo = useId();
  const folha = useRef<HTMLElement>(null);

  useEffect(() => folha.current?.focus(), []);

  return (
    <section ref={folha} tabIndex={-1} className="mercados-folha" aria-labelledby={titulo}>
      <div className="mercados-folha-topo">
        <h3 id={titulo}>{mercado.nome}</h3>
        <button type="button" className="botao botao-secundario botao-pequeno" onClick={onFechar}>
          Fechar<span className="somente-leitor"> os detalhes de {mercado.nome}</span>
        </button>
      </div>
      <ResumoDoMercado mercado={mercado} />
      <div className="mercados-detalhes">
        <DetalhesDoMercado mercado={mercado} onExcluir={onExcluir} />
      </div>
    </section>
  );
}
