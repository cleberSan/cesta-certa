import { describe, expect, it } from "vitest";
import { diagnosticar, temCaptcha } from "./diagnostico";
import {
  consumidorSintetico,
  mercadoSintetico,
  paginaComCaptcha,
  paginaSemNota,
  paginaSp,
} from "./fixtures/pagina-sp";
import { lerPagina } from "./html";

const busca = {
  status: 200,
  bytes: 1234,
  saltos: 1,
  caminho: "/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx",
  tipoDeConteudo: "text/html; charset=utf-8",
  codificacao: "utf-8",
};

const diagnosticoDe = (html: string) => diagnosticar(html, lerPagina(html), busca);

describe("diagnosticar", () => {
  it("descreve a estrutura da página e os rótulos encontrados", () => {
    const diagnostico = diagnosticoDe(paginaSp());

    expect(diagnostico).toMatchObject({
      ...busca,
      titulo: "Consulta NFC-e - Documento sintético",
      truncada: false,
      rotulos: {
        codigo: 3,
        quantidade: 3,
        valorUnitario: 3,
        valorTotal: 3,
        emissao: true,
        cnpj: true,
        chaveDeAcesso: true,
      },
      sinais: { captcha: false, naoEncontrada: false, erro: false, pedeJavascript: false },
    });
    expect(diagnostico.estrutura.tabelas).toBe(1);
    expect(diagnostico.estrutura.linhasDeTabela).toBe(3);
    expect(diagnostico.estrutura.ids).toContain("tabResult");
    expect(diagnostico.estrutura.classes).toContain("txtTit");
    expect(diagnostico.blocos).toBeGreaterThan(10);
  });

  // spec 0001 CA-11
  it("não leva nenhum texto da nota: nem consumidor, nem mercado, nem produto", () => {
    const texto = JSON.stringify(diagnosticoDe(paginaSp()));

    expect(texto).not.toContain(consumidorSintetico.cpf);
    expect(texto).not.toContain(consumidorSintetico.nome);
    expect(texto).not.toContain(mercadoSintetico.nome);
    expect(texto).not.toContain(mercadoSintetico.cnpj);
    expect(texto).not.toContain("CAFE");
    expect(texto).not.toMatch(/\d{6}/);
  });

  it("reconhece a página de captcha", () => {
    const diagnostico = diagnosticoDe(paginaComCaptcha);
    expect(diagnostico.sinais.captcha).toBe(true);
    expect(diagnostico.rotulos.codigo).toBe(0);
    expect(diagnostico.estrutura.formularios).toBe(1);
  });

  it("reconhece a página de nota não encontrada e tira números longos do título", () => {
    const diagnostico = diagnosticoDe(paginaSemNota);
    expect(diagnostico.sinais).toEqual({
      captcha: false,
      naoEncontrada: true,
      erro: true,
      pedeJavascript: false,
    });
    expect(diagnostico.titulo).toBe("Consulta NFC-e #");
  });

  it("reconhece a página que pede JavaScript e a página sem título", () => {
    const diagnostico = diagnosticoDe(
      "<noscript><p>Ative o JavaScript para continuar.</p></noscript>",
    );
    expect(diagnostico.sinais.pedeJavascript).toBe(true);
    expect(diagnostico.titulo).toBeNull();
  });
});

describe("temCaptcha", () => {
  it.each([
    '<div class="g-recaptcha"></div>',
    '<script src="https://www.google.com/recaptcha/api.js"></script>',
    '<div class="h-captcha"></div>',
    '<div class="cf-turnstile"></div>',
    '<img id="imgCaptcha" src="/captcha.aspx">',
  ])("acha o captcha em %s", (html) => {
    expect(temCaptcha(html)).toBe(true);
  });

  it("não acusa captcha numa página comum", () => {
    expect(temCaptcha(paginaSp())).toBe(false);
  });
});
