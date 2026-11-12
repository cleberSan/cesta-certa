import { describe, expect, it } from "vitest";
import { recarregarAoVoltar, type Janela } from "./recarregarAoVoltar";

/** Janela de mentira: guarda os ouvintes e conta as recargas. */
function janelaDeTeste() {
  const ouvintes = new Set<(evento: { readonly persisted: boolean }) => void>();
  const controle = {
    recargas: 0,
    mostrar(persisted: boolean) {
      for (const ouvinte of ouvintes) ouvinte({ persisted });
    },
  };
  const janela: Janela = {
    addEventListener: (_tipo, ouvinte) => void ouvintes.add(ouvinte),
    removeEventListener: (_tipo, ouvinte) => void ouvintes.delete(ouvinte),
    location: {
      reload: () => {
        controle.recargas += 1;
      },
    },
  };
  return { janela, controle };
}

describe("recarregarAoVoltar", () => {
  it("recarrega quando a página volta do cache do navegador", () => {
    const { janela, controle } = janelaDeTeste();
    recarregarAoVoltar(janela);

    controle.mostrar(true);

    expect(controle.recargas).toBe(1);
  });

  it("não recarrega na abertura normal da página", () => {
    const { janela, controle } = janelaDeTeste();
    recarregarAoVoltar(janela);

    controle.mostrar(false);

    expect(controle.recargas).toBe(0);
  });

  it("para de ouvir quando é desligado", () => {
    const { janela, controle } = janelaDeTeste();
    const desligar = recarregarAoVoltar(janela);

    desligar();
    controle.mostrar(true);

    expect(controle.recargas).toBe(0);
  });
});
