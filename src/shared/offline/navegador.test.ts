import { describe, expect, it, vi } from "vitest";
import {
  acompanharConexao,
  avisoSemConexao,
  caminhoDoServiceWorker,
  registrarServiceWorker,
  type JanelaComConexao,
} from "./navegador";

// spec 0001 CA-36
describe("registro do service worker", () => {
  it("registra /sw.js para o site inteiro", async () => {
    const register = vi.fn(async () => ({}));

    expect(await registrarServiceWorker({ serviceWorker: { register } })).toBe(true);
    expect(register).toHaveBeenCalledWith(caminhoDoServiceWorker, { scope: "/" });
  });

  it("segue sem service worker quando o navegador não tem", async () => {
    expect(await registrarServiceWorker({})).toBe(false);
  });

  it("segue em silêncio quando o navegador recusa o registro", async () => {
    const register = vi.fn(async () => {
      throw new DOMException("bloqueado", "SecurityError");
    });

    expect(await registrarServiceWorker({ serviceWorker: { register } })).toBe(false);
  });
});

// spec 0001 CA-36
describe("aviso sem conexão", () => {
  function janela(onLine: boolean) {
    const ouvintes = new Map<string, () => void>();
    const navigator = { onLine };
    const falsa: JanelaComConexao = {
      navigator,
      addEventListener: (tipo, ouvinte) => ouvintes.set(tipo, ouvinte),
    };
    const mudar = (conectado: boolean) => {
      navigator.onLine = conectado;
      ouvintes.get(conectado ? "online" : "offline")!();
    };
    return { falsa, mudar };
  }

  it("avisa que o mapa e a leitura da nota precisam de conexão quando abre sem internet", () => {
    const regiao = { textContent: null as string | null };

    acompanharConexao(janela(false).falsa, regiao);

    expect(regiao.textContent).toBe(avisoSemConexao);
    expect(avisoSemConexao).toContain("a lista e os preços guardados");
    expect(avisoSemConexao).toContain("o mapa, a leitura da nota fiscal");
  });

  it("fica vazio com internet e acompanha a conexão que cai e volta", () => {
    const regiao = { textContent: null as string | null };
    const { falsa, mudar } = janela(true);

    acompanharConexao(falsa, regiao);
    expect(regiao.textContent).toBe("");

    mudar(false);
    expect(regiao.textContent).toBe(avisoSemConexao);

    mudar(true);
    expect(regiao.textContent).toBe("");
  });
});
