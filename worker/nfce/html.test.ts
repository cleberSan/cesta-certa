import { describe, expect, it } from "vitest";
import { decodificarEntidades, lerPagina, limparTexto } from "./html";

describe("decodificarEntidades", () => {
  it.each([
    ["Caf&eacute; &amp; P&atilde;o", "Café & Pão"],
    ["&lt;script&gt;", "<script>"],
    ["&quot;oferta&quot; &apos;do dia&apos;", "\"oferta\" 'do dia'"],
    ["A&nbsp;B", "A B"],
    ["&#233;&#xE9;&#XE9;", "ééé"],
    ["N&ordm; 5 &ndash; 2&ordf; via", "Nº 5 – 2ª via"],
    ["&Ccedil;&Atilde;O", "ÇÃO"],
    ["sem ponto e v&iacute;rgula: &amp", "sem ponto e vírgula: &"],
  ])("%j vira %j", (texto, esperado) => {
    expect(decodificarEntidades(texto)).toBe(esperado);
  });

  it("deixa como está a entidade que não conhece e o & solto", () => {
    expect(decodificarEntidades("&desconhecida; A & B &;")).toBe("&desconhecida; A & B &;");
  });

  it.each(["&#0;", "&#xD800;", "&#x110000;", "&#9999999;"])(
    "troca o código inválido %s pelo caractere de substituição",
    (texto) => {
      expect(decodificarEntidades(texto)).toBe("\ufffd");
    },
  );

  it("não mexe em texto sem entidade", () => {
    const texto = "ARROZ 5KG";
    expect(decodificarEntidades(texto)).toBe(texto);
  });
});

describe("limparTexto", () => {
  it("junta espaços, quebras e espaço que não quebra num só espaço", () => {
    expect(limparTexto("  A\n\t B\u00a0\u00a0C  ")).toBe("A B C");
  });

  it("tira caracteres de controle e marcas invisíveis", () => {
    expect(limparTexto("A\u0000B\u200bC\u202eD\ufeff")).toBe("A B C D");
  });
});

describe("lerPagina", () => {
  it("devolve o texto em blocos, na ordem do documento", () => {
    const pagina = lerPagina("<div>Um</div><p>Dois</p><ul><li>Três</li><li>Quatro</li></ul>");
    expect(pagina.blocos).toEqual(["Um", "Dois", "Três", "Quatro"]);
    expect(pagina.texto).toBe("Um\nDois\nTrês\nQuatro");
    expect(pagina.truncada).toBe(false);
  });

  it("mantém na mesma linha o texto de elementos de linha", () => {
    const pagina = lerPagina(
      '<td><span class="a">CAFE</span><span>(Código: 1)</span> <strong>Qtde.:</strong>2</td>',
    );
    expect(pagina.blocos).toEqual(["CAFE (Código: 1) Qtde.: 2"]);
  });

  it("separa blocos no <br> e nas células de tabela", () => {
    const pagina = lerPagina("<table><tr><td>A<br>B</td><td>C<br />D</td></tr></table>");
    expect(pagina.blocos).toEqual(["A", "B", "C", "D"]);
  });

  it("decodifica entidades e limpa espaços do texto", () => {
    const pagina = lerPagina("<p>  Vl.&nbsp;Unit.:&nbsp;\n 9,99  </p>");
    expect(pagina.blocos).toEqual(["Vl. Unit.: 9,99"]);
  });

  it("ignora o conteúdo de script, style, textarea e comentário", () => {
    const pagina = lerPagina(
      [
        "<p>antes</p>",
        '<script>var a = "<p>dentro do script</p>";</script>',
        "<STYLE>p::after { content: '<p>estilo</p>' }</STYLE>",
        "<textarea><p>digitado</p></textarea>",
        "<!-- <p>comentário</p> -->",
        "<p>depois</p>",
      ].join(""),
    );
    expect(pagina.blocos).toEqual(["antes", "depois"]);
    expect(pagina.estrutura.scripts).toBe(1);
  });

  it("não leva valor de atributo para o texto, nem com > dentro das aspas", () => {
    const pagina = lerPagina(
      '<input type="hidden" value="segredo > 1"><a title=\'x > y\' href="/a">link</a>',
    );
    expect(pagina.blocos).toEqual(["link"]);
    expect(pagina.texto).not.toContain("segredo");
  });

  it("guarda o título à parte, decodificado e sem entrar nos blocos", () => {
    const pagina = lerPagina("<title> Consulta &amp; Nota </title><p>corpo</p>");
    expect(pagina.titulo).toBe("Consulta & Nota");
    expect(pagina.blocos).toEqual(["corpo"]);
  });

  it("sem título ou com título vazio, devolve null", () => {
    expect(lerPagina("<p>a</p>").titulo).toBeNull();
    expect(lerPagina("<title>   </title>").titulo).toBeNull();
  });

  it("trata < solto como texto", () => {
    expect(lerPagina("<p>2 < 3 e 5 > 4</p>").blocos).toEqual(["2 < 3 e 5 > 4"]);
  });

  it("pula doctype, CDATA e instrução de processamento", () => {
    const pagina = lerPagina('<!DOCTYPE html><?xml version="1.0"?><p>a</p><![CDATA[ x ]]>');
    expect(pagina.blocos).toEqual(["a"]);
  });

  it("aguenta marcação cortada no meio", () => {
    expect(lerPagina("<p>inteiro</p><p>cortado").blocos).toEqual(["inteiro", "cortado"]);
    expect(lerPagina("<p>a</p><div class=").blocos).toEqual(["a"]);
    expect(lerPagina("<p>a</p><!-- sem fim").blocos).toEqual(["a"]);
    expect(lerPagina("<p>a</p><script>sem fim").blocos).toEqual(["a"]);
    expect(lerPagina("<p>a</p><!DOCTYPE").blocos).toEqual(["a"]);
    expect(lerPagina("").blocos).toEqual([]);
  });

  it("segue em frente quando uma tag tem aspas sem fechar", () => {
    const longo = "x".repeat(3000);
    const pagina = lerPagina(`<p>a</p><div title="${longo}>b</div><p>c</p>`);
    expect(pagina.blocos.at(-1)).toBe("c");
    expect(pagina.truncada).toBe(false);
  });

  it("desiste da página com tags malformadas demais", () => {
    const ruim = `<div title="${"x".repeat(3000)}>b</div>`;
    const pagina = lerPagina(`<p>a</p>${ruim.repeat(60)}<p>fim</p>`);
    expect(pagina.truncada).toBe(true);
    expect(pagina.blocos).not.toContain("fim");
  });

  it("conta os elementos que interessam ao diagnóstico", () => {
    const pagina = lerPagina(
      "<form><input><select><option>a</option></select><textarea></textarea></form>" +
        "<table><tr><td>1</td></tr><tr><td>2</td></tr></table><iframe></iframe><frame>",
    );
    expect(pagina.estrutura).toMatchObject({
      tabelas: 1,
      linhasDeTabela: 2,
      formularios: 1,
      campos: 3,
      quadros: 2,
    });
    expect(pagina.estrutura.elementos).toBe(12);
  });

  it("guarda ids e classes simples, sem repetir", () => {
    const pagina = lerPagina(
      '<div id="conteudo" class="txtCenter caixa"><span class=txtTit>a</span>' +
        "<span CLASS='txtTit valor'>b</span></div>",
    );
    expect(pagina.estrutura.ids).toEqual(["conteudo"]);
    expect(pagina.estrutura.classes).toEqual(["txtCenter", "caixa", "txtTit", "valor"]);
  });

  it("não guarda nome com sequência longa de dígitos nem com caractere estranho", () => {
    const pagina = lerPagina(
      '<div id="cliente12345678900" class="ok item-1 12abc a.b &lt;x&gt;"><p id="Item + 1">a</p></div>',
    );
    expect(pagina.estrutura.ids).toEqual(["Item"]);
    expect(pagina.estrutura.classes).toEqual(["ok", "item-1"]);
  });

  it("guarda no máximo 30 ids e 30 classes", () => {
    const html = Array.from({ length: 50 }, (_, n) => `<i id="i${n}" class="c${n}"></i>`).join("");
    const { ids, classes } = lerPagina(html).estrutura;
    expect(ids).toHaveLength(30);
    expect(classes).toHaveLength(30);
  });

  it("corta o bloco muito grande e para de guardar blocos depois do limite", () => {
    expect(lerPagina(`<p>${"a".repeat(5000)}</p>`).blocos[0]).toHaveLength(2000);

    const pagina = lerPagina("<p>x</p>".repeat(20_001));
    expect(pagina.blocos).toHaveLength(20_000);
    expect(pagina.truncada).toBe(true);
  });

  it("lê uma página de 512 KB em tempo linear", () => {
    const linha = '<tr><td class="a">PRODUTO (Código: 1)</td><td>Vl. Total 9,99</td></tr>';
    const html = `<table>${linha.repeat(Math.ceil((512 * 1024) / linha.length))}</table>`;
    const inicio = performance.now();
    const pagina = lerPagina(html);
    const duracao = performance.now() - inicio;
    expect(pagina.blocos.length).toBeGreaterThan(10_000);
    // Folga larga para máquina de CI lenta; na prática fica em poucos milissegundos.
    expect(duracao).toBeLessThan(1_000);
  });
});
