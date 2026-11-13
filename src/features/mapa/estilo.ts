/**
 * Aparência e textos do mapa (spec 0001, T10; ADR-0005). Só dados: o MapLibre os recebe em
 * `motor.ts`, e o tipo importado daqui some no build.
 */
import type { AddLayerObject } from "maplibre-gl";
import { origemDoMapa } from "../../config/security";

/**
 * Estilo do OpenFreeMap, sem chave. O estilo, os quadros, as fontes e os ícones vêm da mesma
 * origem que a CSP de /mercados libera (`cspDoMapa`).
 */
export const estiloDoMapa = `${origemDoMapa}/styles/liberty`;

/** Créditos dos mercados no rodapé do mapa; os do mapa de fundo vêm do próprio estilo. */
export const creditosDosMercados =
  'Mercados: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">colaboradores do OpenStreetMap</a>';

/** Cores do mapa. A cor só reforça: o mercado cadastrado também tem um miolo branco. */
export const coresDoMapa = {
  raio: "#0f6b4f",
  base: "#0f6b4f",
  proprio: "#a8410b",
  contorno: "#ffffff",
  escolhido: "#1b4fd6",
  rumo: "#16211b",
} as const;

/** Textos dos botões e rótulos do MapLibre, em português. */
export function textosDoMapa(titulo: string): Record<string, string> {
  return {
    "AttributionControl.ToggleAttribution": "Mostrar ou esconder os créditos do mapa",
    "AttributionControl.MapFeedback": "Avisar um erro no mapa",
    "FullscreenControl.Enter": "Abrir em tela cheia",
    "FullscreenControl.Exit": "Sair da tela cheia",
    "GeolocateControl.FindMyLocation": "Achar a minha localização",
    "GeolocateControl.LocationNotAvailable": "Localização indisponível",
    "LogoControl.Title": "Logo do MapLibre",
    "Map.Title": titulo,
    "Marker.Title": "Marcador no mapa",
    "NavigationControl.ResetBearing": "Voltar o norte para cima",
    "NavigationControl.ZoomIn": "Aproximar",
    "NavigationControl.ZoomOut": "Afastar",
    "Popup.Close": "Fechar",
    "ScaleControl.Feet": "pés",
    "ScaleControl.Meters": "m",
    "ScaleControl.Kilometers": "km",
    "ScaleControl.Miles": "mi",
    "ScaleControl.NauticalMiles": "mn",
    "GlobeControl.Enable": "Ver como globo",
    "GlobeControl.Disable": "Ver como plano",
    "TerrainControl.Enable": "Mostrar o relevo",
    "TerrainControl.Disable": "Esconder o relevo",
    "CooperativeGesturesHandler.WindowsHelpText": "Use Ctrl e a rolagem para aproximar o mapa",
    "CooperativeGesturesHandler.MacHelpText": "Use ⌘ e a rolagem para aproximar o mapa",
    "CooperativeGesturesHandler.MobileHelpText": "Use dois dedos para mover o mapa",
  };
}

export const fontes = {
  raio: "raio",
  rumo: "rumo",
  ponto: "ponto",
  mercados: "mercados",
} as const;

/** A pessoinha do ponto da busca, em pixels de tela, desenhada no dobro para ficar nítida. */
export const imagemDaPessoinha = { nome: "pessoinha", largura: 30, altura: 37, escala: 2 } as const;

/** Nenhum mercado tem id vazio: o filtro do escolhido começa sem pegar nada. */
export function filtroDoEscolhido(id: string | null): ["==", ["get", "id"], string] {
  return ["==", ["get", "id"], id ?? ""];
}

/**
 * Camadas desenhadas sobre o mapa de fundo, de baixo para cima: o raio, a linha até o mercado
 * escolhido, a pessoinha, os pinos, o miolo dos cadastrados e o anel do escolhido. A pessoinha
 * fica abaixo dos pinos para não esconder o mercado mais perto.
 */
export function camadasDosMercados(): AddLayerObject[] {
  return [
    {
      id: "raio-fundo",
      type: "fill",
      source: fontes.raio,
      paint: { "fill-color": coresDoMapa.raio, "fill-opacity": 0.08 },
    },
    {
      id: "raio-borda",
      type: "line",
      source: fontes.raio,
      paint: { "line-color": coresDoMapa.raio, "line-width": 2, "line-opacity": 0.6 },
    },
    {
      id: "rumo",
      type: "line",
      source: fontes.rumo,
      layout: { "line-cap": "round" },
      paint: { "line-color": coresDoMapa.rumo, "line-width": 2.5, "line-dasharray": [2, 2] },
    },
    {
      id: "ponto",
      type: "symbol",
      source: fontes.ponto,
      layout: {
        "icon-image": imagemDaPessoinha.nome,
        "icon-anchor": "bottom",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    },
    {
      id: "mercados",
      type: "circle",
      source: fontes.mercados,
      paint: {
        "circle-radius": 8,
        "circle-color": ["case", ["get", "proprio"], coresDoMapa.proprio, coresDoMapa.base],
        "circle-stroke-width": 2,
        "circle-stroke-color": coresDoMapa.contorno,
      },
    },
    {
      id: "mercados-miolo",
      type: "circle",
      source: fontes.mercados,
      filter: ["==", ["get", "proprio"], true],
      paint: { "circle-radius": 3, "circle-color": coresDoMapa.contorno },
    },
    {
      id: "mercado-escolhido",
      type: "circle",
      source: fontes.mercados,
      filter: filtroDoEscolhido(null),
      paint: {
        "circle-radius": 13,
        "circle-opacity": 0,
        "circle-stroke-width": 3,
        "circle-stroke-color": coresDoMapa.escolhido,
      },
    },
  ];
}

/** Camada em que o toque escolhe um mercado. */
export const camadaDosPinos = "mercados";

export type FalhaDoMapa = "sem-webgl" | "sem-conexao";

/** Por que o mapa não apareceu, sem termo técnico; a tela diz em seguida o outro caminho. */
export function mensagemDoMapa(falha: FalhaDoMapa): string {
  return falha === "sem-webgl"
    ? "Este aparelho não conseguiu desenhar o mapa."
    : "O mapa não abriu. Confira a conexão e tente de novo mais tarde.";
}
