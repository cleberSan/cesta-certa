/**
 * Ponte com o MapLibre (ADR-0005): cria o mapa, liga as camadas e avisa as falhas. Só os
 * componentes carregados sob demanda importam este arquivo, então o `maplibre-gl` não entra no
 * JavaScript inicial. As contas e os dados ficam em `geojson.ts` e `estilo.ts`, com teste de
 * unidade; esta ponte precisa de WebGL e é provada pelo E2E (`e2e/mapa.spec.ts`).
 */
import {
  Map as MapaGl,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type LngLatBoundsLike,
} from "maplibre-gl";
import urlDoCss from "maplibre-gl/dist/maplibre-gl.css?url";
import urlDoWorker from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { Ponto } from "../mercados/geo";
import {
  camadaDosPinos,
  camadasDosMercados,
  creditosDosMercados,
  estiloDoMapa,
  filtroDoEscolhido,
  fontes,
  imagemDaPessoinha,
  textosDoMapa,
  type FalhaDoMapa,
} from "./estilo";
import { circuloDoRaio, colecaoDoPonto, colecaoDosPinos, rumoAte, type Pino } from "./geojson";
import urlDaPessoinha from "./pessoinha.svg?url";

// O worker vem do próprio site, com hash no nome: a CSP (worker-src 'self') já o aceita.
setWorkerUrl(urlDoWorker);

export type { MapaGl };

export interface OpcoesDoMapa {
  readonly titulo: string;
  readonly centro: Ponto;
  readonly zoom?: number;
  readonly limites?: LngLatBoundsLike;
  /** Num mapa no meio da página, um dedo rola a página e dois movem o mapa. */
  readonly cooperativo: boolean;
  /** Chamado uma vez quando o mapa termina de abrir. */
  readonly aoAbrir: (mapa: MapaGl) => void;
  /** Chamado uma vez, se o mapa não abrir. Quadros que falham depois só deixam buracos. */
  readonly aoFalhar: (falha: FalhaDoMapa) => void;
}

let cssDoMapa: Promise<void> | null = null;

/**
 * O CSS do MapLibre (cerca de 70 KB) entra na página só quando um mapa abre, como o código:
 * importado com `?url`, ele não vai para o CSS da página. Se não chegar, a próxima tentativa
 * pede de novo.
 */
function carregarCss(): Promise<void> {
  cssDoMapa ??= new Promise<void>((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = urlDoCss;
    link.addEventListener("load", () => resolve());
    link.addEventListener("error", () => {
      link.remove();
      cssDoMapa = null;
      reject(new Error("CSS do mapa não carregou"));
    });
    document.head.append(link);
  });
  return cssDoMapa;
}

/**
 * Cria o mapa no elemento, depois do CSS. Devolve a função que o desmonta; as respostas de
 * `aoAbrir` e `aoFalhar` chegam sempre depois, nunca durante a chamada.
 */
export function criarMapa(elemento: HTMLElement, opcoes: OpcoesDoMapa): () => void {
  let ativo = true;
  let desmontar: (() => void) | null = null;
  carregarCss().then(
    () => {
      if (ativo) desmontar = montar(elemento, opcoes);
    },
    () => {
      if (ativo) opcoes.aoFalhar("sem-conexao");
    },
  );
  return () => {
    ativo = false;
    desmontar?.();
  };
}

function montar(elemento: HTMLElement, opcoes: OpcoesDoMapa): () => void {
  let mapa: MapaGl;
  try {
    mapa = new MapaGl({
      container: elemento,
      style: estiloDoMapa,
      center: [opcoes.centro.lon, opcoes.centro.lat],
      zoom: opcoes.zoom ?? 12,
      ...(opcoes.limites === undefined
        ? {}
        : { bounds: opcoes.limites, fitBoundsOptions: { padding: 24 } }),
      locale: textosDoMapa(opcoes.titulo),
      attributionControl: { compact: true, customAttribution: creditosDosMercados },
      cooperativeGestures: opcoes.cooperativo,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
    });
  } catch {
    // Sem WebGL o MapLibre não desenha nada; a tela mostra o outro caminho.
    opcoes.aoFalhar("sem-webgl");
    return () => {};
  }

  mapa.touchZoomRotate.disableRotation();
  mapa.keyboard.disableRotation();
  mapa.addControl(new NavigationControl({ showCompass: false }), "top-right");

  let aberto = false;
  mapa.once("load", () => {
    aberto = true;
    opcoes.aoAbrir(mapa);
  });
  // Ouvir "error" também evita que o MapLibre escreva cada quadro perdido no console.
  mapa.on("error", () => {
    if (aberto) return;
    aberto = true;
    opcoes.aoFalhar("sem-conexao");
  });
  return () => mapa.remove();
}

/** Liga as fontes e camadas dos mercados, com a pessoinha no ponto da busca. */
export function prepararMercados(mapa: MapaGl, aoEscolher: (id: string) => void): void {
  const vazia = { type: "FeatureCollection" as const, features: [] };
  for (const fonte of Object.values(fontes)) {
    mapa.addSource(fonte, { type: "geojson", data: vazia });
  }
  for (const camada of camadasDosMercados()) mapa.addLayer(camada);
  void desenharPessoinha(mapa);

  mapa.on("click", camadaDosPinos, (evento) => {
    const id: unknown = evento.features?.[0]?.properties["id"];
    if (typeof id === "string") aoEscolher(id);
  });
  mapa.on("mouseenter", camadaDosPinos, () => {
    mapa.getCanvas().style.cursor = "pointer";
  });
  mapa.on("mouseleave", camadaDosPinos, () => {
    mapa.getCanvas().style.cursor = "";
  });
}

/**
 * A pessoinha (SVG do projeto) vira imagem do próprio mapa, numa camada abaixo dos pinos: assim
 * ela não cobre o mercado mais perto. O MapLibre não lê SVG, então o desenho passa por um
 * canvas 2D, no dobro do tamanho para ficar nítido. Se falhar, o mapa segue sem ela.
 */
async function desenharPessoinha(mapa: MapaGl): Promise<void> {
  const { largura, altura, escala } = imagemDaPessoinha;
  try {
    const imagem = new Image(largura, altura);
    imagem.src = urlDaPessoinha;
    await imagem.decode();
    const tela = document.createElement("canvas");
    tela.width = largura * escala;
    tela.height = altura * escala;
    const contexto = tela.getContext("2d");
    if (contexto === null) return;
    contexto.drawImage(imagem, 0, 0, tela.width, tela.height);
    const pixels = contexto.getImageData(0, 0, tela.width, tela.height);
    if (!mapa.hasImage(imagemDaPessoinha.nome)) {
      mapa.addImage(imagemDaPessoinha.nome, pixels, { pixelRatio: escala });
    }
  } catch {
    // Sem a pessoinha o raio ainda mostra onde fica o ponto.
  }
}

function atualizar(mapa: MapaGl, fonte: string, dados: Parameters<GeoJSONSource["setData"]>[0]) {
  mapa.getSource<GeoJSONSource>(fonte)?.setData(dados);
}

export function mostrarRaio(mapa: MapaGl, ponto: Ponto, raioKm: number, limites: LngLatBoundsLike) {
  atualizar(mapa, fontes.ponto, colecaoDoPonto(ponto));
  atualizar(mapa, fontes.raio, circuloDoRaio(ponto, raioKm));
  // Com "reduzir movimento" ligado no aparelho, o MapLibre pula a animação.
  mapa.fitBounds(limites, { padding: 24 });
}

export function mostrarPinos(mapa: MapaGl, pinos: readonly Pino[]) {
  atualizar(mapa, fontes.mercados, colecaoDosPinos(pinos));
}

export function mostrarEscolhido(mapa: MapaGl, ponto: Ponto, escolhido: Pino | null) {
  mapa.setFilter("mercado-escolhido", filtroDoEscolhido(escolhido?.id ?? null));
  atualizar(mapa, fontes.rumo, rumoAte(ponto, escolhido));
}
