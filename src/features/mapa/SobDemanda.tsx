import { Component, lazy, Suspense, type ReactNode } from "react";
import { mensagemDoMapa } from "./estilo";
import type { PropsDoMapaDosMercados } from "./MapaDosMercados";
import type { PropsDaMiraNoMapa } from "./MiraNoMapa";
// Estilos do quadro, da mira e da legenda: poucos, ficam no CSS da página.
import "./mapa.css";

// O MapLibre (cerca de 1 MB) só é baixado quando a pessoa abre um mapa (ADR-0005).
const MapaDosMercados = lazy(() => import("./MapaDosMercados"));
const MiraNoMapa = lazy(() => import("./MiraNoMapa"));

const abrindo = (
  <p className="mercados-carregando" role="status">
    Abrindo o mapa…
  </p>
);

/** Se o código do mapa não chegar (sem conexão, por exemplo), a tela diz o outro caminho. */
class LimiteDoMapa extends Component<
  { readonly alternativa: string; readonly children: ReactNode },
  { readonly falhou: boolean }
> {
  override state = { falhou: false };

  static getDerivedStateFromError() {
    return { falhou: true };
  }

  override render() {
    if (!this.state.falhou) return this.props.children;
    return (
      <p className="alerta" role="alert">
        {mensagemDoMapa("sem-conexao")} {this.props.alternativa}
      </p>
    );
  }
}

export function MapaDosMercadosSobDemanda(props: PropsDoMapaDosMercados) {
  return (
    <LimiteDoMapa alternativa={props.alternativa}>
      <Suspense fallback={abrindo}>
        <MapaDosMercados {...props} />
      </Suspense>
    </LimiteDoMapa>
  );
}

export function MiraNoMapaSobDemanda(props: PropsDaMiraNoMapa) {
  return (
    <LimiteDoMapa alternativa={props.alternativa}>
      <Suspense fallback={abrindo}>
        <MiraNoMapa {...props} />
      </Suspense>
    </LimiteDoMapa>
  );
}
