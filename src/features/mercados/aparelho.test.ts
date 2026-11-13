import { describe, expect, it } from "vitest";
import type { Banco, ErroDoBanco } from "../../shared/armazenamento/banco";
import { criarBancoEmMemoria } from "../../shared/armazenamento/memoria";
import { falha, sucesso, type Resultado } from "../../shared/resultado";
import { acessoInicial, registroDoAcesso } from "../assistente/acesso";
import { objetivoPadrao, registroDoObjetivo, type Objetivo } from "../comparar/objetivo";
import { raioPadrao, registroDoPonto, registroDoRaio, type PontoEscolhido } from "./ajustes";
import {
  abrirAparelho,
  apagarMercado,
  esquecerPonto,
  guardarAcesso,
  guardarMercado,
  guardarObjetivo,
  guardarPonto,
  guardarRaio,
} from "./aparelho";
import type { MercadoProprio } from "./proprios";

const ponto: PontoEscolhido = { lat: -23.5, lon: -46.6, origem: "cidade", rotulo: "Serra, ES" };

const abrirCom = (resultado: Resultado<Banco, ErroDoBanco>) => () => Promise.resolve(resultado);

// spec 0001 CA-05
describe("abrirAparelho", () => {
  it("lê o ponto e o raio guardados", async () => {
    const banco = criarBancoEmMemoria({
      ajustes: [registroDoPonto(ponto), registroDoRaio(10)],
    });
    const aberto = await abrirAparelho(undefined, abrirCom(sucesso(banco)));
    expect(aberto).toEqual({
      ok: true,
      valor: {
        banco,
        ajustes: { ponto, raioKm: 10 },
        proprios: [],
        lista: { listas: [], itens: [] },
        observacoes: [],
        objetivo: objetivoPadrao,
        assistente: acessoInicial,
      },
    });
  });

  it("começa sem ponto e com o raio padrão num aparelho novo", async () => {
    const aberto = await abrirAparelho(undefined, abrirCom(sucesso(criarBancoEmMemoria())));
    expect(aberto.ok && aberto.valor.ajustes).toEqual({ ponto: null, raioKm: raioPadrao });
  });

  it("funciona em memória quando o navegador não deixa guardar", async () => {
    const aberto = await abrirAparelho(undefined, abrirCom(falha("indisponivel")));
    expect(aberto.ok).toBe(true);
    expect(aberto.ok && aberto.valor.banco.persistente).toBe(false);
  });

  it.each(["versao-mais-nova", "falhou"] as const)(
    "não abre nem sobrepõe dados quando o banco falha com %s",
    async (erro) => {
      expect(await abrirAparelho(undefined, abrirCom(falha(erro)))).toEqual({ ok: false, erro });
    },
  );

  it("devolve a falha da leitura", async () => {
    const banco: Banco = {
      ...criarBancoEmMemoria(),
      lerTudo: () => Promise.resolve(falha("fechado")),
    };
    expect(await abrirAparelho(undefined, abrirCom(sucesso(banco)))).toEqual({
      ok: false,
      erro: "fechado",
    });
  });
});

// spec 0001 CA-19
describe("objetivo da comparação", () => {
  const objetivo: Objetivo = { ...objetivoPadrao, tetoCentavos: 60_000, maximoDeMercados: 3 };

  it("guarda o objetivo nos ajustes, fora da cópia, e lê de volta", async () => {
    const banco = criarBancoEmMemoria();

    expect(await guardarObjetivo(banco, objetivo)).toEqual({ ok: true, valor: undefined });

    const lido = await banco.lerTudo();
    expect(lido.ok && lido.valor.ajustes).toEqual([registroDoObjetivo(objetivo)]);
    const aberto = await abrirAparelho(undefined, abrirCom(sucesso(banco)));
    expect(aberto.ok && aberto.valor.objetivo).toEqual(objetivo);
  });
});

// spec 0001 CA-28 e CA-29
describe("aceite e código do assistente", () => {
  const acesso = { aceitoEm: "2026-11-13T12:00:00.000Z", codigo: "k".repeat(40) };

  it("guarda o aceite e o código nos ajustes, fora da cópia, e lê de volta", async () => {
    const banco = criarBancoEmMemoria();

    expect(await guardarAcesso(banco, acesso)).toEqual({ ok: true, valor: undefined });

    const lido = await banco.lerTudo();
    expect(lido.ok && lido.valor.ajustes).toEqual([registroDoAcesso(acesso)]);
    const aberto = await abrirAparelho(undefined, abrirCom(sucesso(banco)));
    expect(aberto.ok && aberto.valor.assistente).toEqual(acesso);
  });

  it("esquecer apaga o registro do aparelho", async () => {
    const banco = criarBancoEmMemoria({ ajustes: [registroDoAcesso(acesso)] });

    await guardarAcesso(banco, acessoInicial);

    const lido = await banco.lerTudo();
    expect(lido.ok && lido.valor.ajustes).toEqual([]);
  });
});

// spec 0001 CA-05 e CA-06
describe("guardar e esquecer o ponto", () => {
  async function ajustesDe(banco: Banco) {
    const lido = await banco.lerTudo();
    return lido.ok ? lido.valor.ajustes : null;
  }

  it("guarda o ponto e o raio só no armazém dos ajustes", async () => {
    const banco = criarBancoEmMemoria();
    expect(await guardarPonto(banco, ponto)).toEqual({ ok: true, valor: undefined });
    expect(await guardarRaio(banco, 15)).toEqual({ ok: true, valor: undefined });
    const lido = await banco.lerTudo();
    expect(lido.ok && lido.valor.listas).toEqual([]);
    expect(lido.ok && lido.valor.itens).toEqual([]);
    expect(await ajustesDe(banco)).toEqual(
      expect.arrayContaining([
        { id: "ponto", ...ponto },
        { id: "raio", km: 15 },
      ]),
    );
  });

  it("troca o ponto em vez de juntar dois", async () => {
    const banco = criarBancoEmMemoria();
    await guardarPonto(banco, ponto);
    await guardarPonto(banco, { lat: -3.7, lon: -38.5, origem: "localizacao", rotulo: null });
    expect(await ajustesDe(banco)).toEqual([
      { id: "ponto", lat: -3.7, lon: -38.5, origem: "localizacao", rotulo: null },
    ]);
  });

  it("esquece o ponto e mantém o raio", async () => {
    const banco = criarBancoEmMemoria();
    await guardarPonto(banco, ponto);
    await guardarRaio(banco, 2);
    expect(await esquecerPonto(banco)).toEqual({ ok: true, valor: undefined });
    expect(await ajustesDe(banco)).toEqual([{ id: "raio", km: 2 }]);
  });
});

// spec 0001 CA-08
describe("mercados cadastrados", () => {
  const mercado: MercadoProprio = {
    id: "11111111-1111-4111-8111-111111111111",
    nome: "Mercadinho do Bairro",
    tipo: "bairro",
    lat: -23.5,
    lon: -46.6,
    criadoEm: "2026-11-12T15:00:00.000Z",
  };

  it("abre com os mercados guardados e deixa de fora o registro estragado", async () => {
    const banco = criarBancoEmMemoria({
      mercadosProprios: [mercado, { id: "estragado" } as unknown as MercadoProprio],
    });
    const aberto = await abrirAparelho(undefined, abrirCom(sucesso(banco)));
    expect(aberto.ok && aberto.valor.proprios).toEqual([mercado]);
  });

  it("guarda e apaga o mercado", async () => {
    const banco = criarBancoEmMemoria();
    expect(await guardarMercado(banco, mercado)).toEqual({ ok: true, valor: undefined });
    let lido = await banco.lerTudo();
    expect(lido.ok && lido.valor.mercadosProprios).toEqual([mercado]);
    expect(await apagarMercado(banco, mercado.id)).toEqual({ ok: true, valor: undefined });
    lido = await banco.lerTudo();
    expect(lido.ok && lido.valor.mercadosProprios).toEqual([]);
  });
});
