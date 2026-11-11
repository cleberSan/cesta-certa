import { describe, expect, it } from "vitest";
import { lerChave } from "../chave";
import { chaves } from "../fixtures/chaves";
import {
  consumidorSintetico,
  itensSinteticos,
  mercadoSintetico,
  paginaComCaptcha,
  paginaSemNota,
  paginaSp,
  type ItemSintetico,
} from "../fixtures/pagina-sp";
import { lerPagina } from "../html";
import { sp } from "./sp";

function chaveDe(texto: string) {
  const resultado = lerChave(texto);
  if (!resultado.ok) throw new Error(`Chave de teste inválida: ${resultado.erro}`);
  return resultado.valor;
}

const chave = chaveDe(chaves.sp);
const ler = (html: string, comChave = chave) => sp.ler(lerPagina(html), comChave);

const item = (mudancas: Partial<ItemSintetico> = {}): ItemSintetico => ({
  descricao: "ARROZ 5KG",
  codigo: "100",
  quantidade: "1",
  unidade: "UN",
  unitario: "29,90",
  total: "29,90",
  ...mudancas,
});

describe("leitor de São Paulo", () => {
  it("declara só o host e os caminhos oficiais da consulta por QR Code", () => {
    expect(sp.host).toBe("www.nfce.fazenda.sp.gov.br");
    expect(sp.rotas).toEqual(["/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx", "/qrcode"]);
    expect(sp.codigoIbge).toBe("35");
  });

  it("lê o mercado, a data e os itens da página", () => {
    expect(ler(paginaSp())).toEqual({
      uf: "SP",
      mercado: {
        cnpj: "11222333000181",
        nome: mercadoSintetico.nome,
        endereco: mercadoSintetico.endereco,
      },
      emitidaEm: "2026-11-07T10:15:30",
      itens: [
        {
          descricao: "CAFE SOLUVEL 200G",
          codigo: "7890000000017",
          quantidade: "2",
          unidade: "UN",
          precoUnitarioCentavos: 1899,
          totalCentavos: 3798,
        },
        {
          descricao: "QUEIJO MUCARELA KG",
          codigo: "2000340",
          quantidade: "0.345",
          unidade: "KG",
          precoUnitarioCentavos: 3890,
          totalCentavos: 1342,
        },
        {
          descricao: "LEITE INTEGRAL CX 12X1L",
          codigo: "7890000000024",
          quantidade: "1",
          unidade: "CX",
          precoUnitarioCentavos: 105990,
          totalCentavos: 105990,
        },
      ],
      itensNaoLidos: 0,
    });
  });

  // spec 0001 CA-11
  it("não devolve o CPF nem o nome do consumidor, que estão na página", () => {
    const html = paginaSp();
    expect(html).toContain(consumidorSintetico.cpf);
    expect(html).toContain(consumidorSintetico.nome);

    const resposta = JSON.stringify(ler(html));
    expect(resposta).not.toContain(consumidorSintetico.cpf);
    expect(resposta).not.toContain(consumidorSintetico.cpf.replace(/\D/g, ""));
    expect(resposta).not.toContain(consumidorSintetico.nome);
    expect(resposta).not.toMatch(/consumidor|cpf/i);
  });

  // spec 0001 CA-11
  it("não toma o consumidor pelo mercado quando o cabeçalho não traz o emitente", () => {
    const semCabecalho = paginaSp().replace(/<div class="txtCenter">[\s\S]*?<\/div>\s*<\/div>/, "");
    expect(semCabecalho).not.toContain(mercadoSintetico.nome);

    const nota = ler(semCabecalho);
    expect(nota?.mercado).toEqual({ cnpj: "11222333000181", nome: null, endereco: null });
    expect(nota?.itens).toHaveLength(3);
  });

  it("ignora texto parecido com item dentro de script, estilo, comentário e atributo", () => {
    const nota = ler(paginaSp());
    expect(nota?.itens.map((lido) => lido.descricao)).not.toContain("FALSO");
    expect(nota?.itens).toHaveLength(itensSinteticos.length);
  });

  it("devolve como texto a descrição com marcação, sem interpretar", () => {
    const nota = ler(
      paginaSp({
        itens: [item({ descricao: "SABAO &lt;script&gt;alert(1)&lt;/script&gt; &amp; CIA" })],
      }),
    );
    expect(nota?.itens[0]?.descricao).toBe("SABAO <script>alert(1)</script> & CIA");
  });

  it("aceita descrição com parênteses", () => {
    const nota = ler(paginaSp({ itens: [item({ descricao: "REFRIGERANTE (2L) COLA" })] }));
    expect(nota?.itens[0]?.descricao).toBe("REFRIGERANTE (2L) COLA");
  });

  it("corta a descrição em 200 caracteres", () => {
    const nota = ler(paginaSp({ itens: [item({ descricao: "A".repeat(300) })] }));
    expect(nota?.itens[0]?.descricao).toHaveLength(200);
  });

  it("arredonda para centavos o preço unitário com mais de duas casas", () => {
    const nota = ler(
      paginaSp({ itens: [item({ quantidade: "1,2500", unitario: "5,4950", total: "6,87" })] }),
    );
    expect(nota?.itens[0]).toMatchObject({
      quantidade: "1.25",
      precoUnitarioCentavos: 550,
      totalCentavos: 687,
    });
  });

  it("põe a unidade em maiúsculas", () => {
    expect(ler(paginaSp({ itens: [item({ unidade: "kg" })] }))?.itens[0]?.unidade).toBe("KG");
  });

  it("conta o item que não conseguiu ler e segue com os outros", () => {
    const nota = ler(
      paginaSp({
        itens: [
          item({ descricao: "BOM 1" }),
          item({ descricao: "RUIM QUANTIDADE", quantidade: "duas" }),
          item({ descricao: "RUIM PRECO", unitario: "9.99.9" }),
          item({ descricao: "RUIM ZERO", quantidade: "0" }),
          item({ descricao: "BOM 2", codigo: "200" }),
        ],
      }),
    );
    expect(nota?.itens.map((lido) => lido.descricao)).toEqual(["BOM 1", "BOM 2"]);
    expect(nota?.itensNaoLidos).toBe(3);
  });

  it("lê itens fora de tabela, guiado só pelos rótulos", () => {
    const html = `<html><body>
      <h1>${mercadoSintetico.nome}</h1><p>CNPJ:</p><p>${mercadoSintetico.cnpj}</p><p>${mercadoSintetico.endereco}</p>
      <ul>
        <li><div>FEIJAO CARIOCA 1KG</div><div>(CÓDIGO: 55)</div><div>QTDE: 3</div><div>UN: PC</div><div>VL UNIT: 8,49</div><div>VL TOTAL: 25,47</div></li>
        <li><div>ACUCAR 1KG (Codigo: 56) Qtde.: 1 UN: UN Vl. Unit.: 4,99 Vl. Total 4,99</div></li>
      </ul>
      <p>Emissao: 01/10/2026</p></body></html>`;
    expect(ler(html)).toEqual({
      uf: "SP",
      mercado: {
        cnpj: "11222333000181",
        nome: mercadoSintetico.nome,
        endereco: mercadoSintetico.endereco,
      },
      emitidaEm: "2026-10-01",
      itens: [
        {
          descricao: "FEIJAO CARIOCA 1KG",
          codigo: "55",
          quantidade: "3",
          unidade: "PC",
          precoUnitarioCentavos: 849,
          totalCentavos: 2547,
        },
        {
          descricao: "ACUCAR 1KG",
          codigo: "56",
          quantidade: "1",
          unidade: "UN",
          precoUnitarioCentavos: 499,
          totalCentavos: 499,
        },
      ],
      itensNaoLidos: 0,
    });
  });

  it("aceita emitente com CNPJ alfanumérico", () => {
    const alfanumerica = chaveDe(chaves.spCnpjAlfanumerico);
    const nota = ler(
      paginaSp({ chave: chaves.spCnpjAlfanumerico, cnpj: "12.ABC.345/01DE-35" }),
      alfanumerica,
    );
    expect(nota?.mercado).toEqual({
      cnpj: "12ABC34501DE35",
      nome: mercadoSintetico.nome,
      endereco: mercadoSintetico.endereco,
    });
  });

  it("deixa nome e endereço em branco quando o CNPJ impresso não é o da chave", () => {
    const nota = ler(paginaSp({ cnpj: "99.888.777/0001-66" }));
    expect(nota?.mercado).toEqual({ cnpj: "11222333000181", nome: null, endereco: null });
  });

  it("não aceita como endereço um bloco que é outro rótulo", () => {
    const html = paginaSp().replace(
      `<div class="text">${mercadoSintetico.endereco}</div>`,
      '<div class="text">Inscrição Estadual: 123.456.789.110</div>',
    );
    expect(ler(html)?.mercado).toEqual({
      cnpj: "11222333000181",
      nome: mercadoSintetico.nome,
      endereco: null,
    });
  });

  it.each([
    ["só a data", "07/11/2026", "2026-11-07"],
    ["hora sem segundos", "07/11/2026 10:15", "2026-11-07T10:15:00"],
    ["ano bissexto", "29/02/2028 08:00:00", "2028-02-29T08:00:00"],
    ["hora impossível", "07/11/2026 25:00:00", "2026-11-07"],
  ])("lê a emissão com %s", (_caso, emissao, esperado) => {
    expect(ler(paginaSp({ emissao }))?.emitidaEm).toBe(esperado);
  });

  it.each([
    ["dia impossível", "31/02/2026 10:00:00"],
    ["mês impossível", "10/13/2026 10:00:00"],
    ["dia zero", "00/11/2026 10:00:00"],
    ["ano fora da faixa", "07/11/1999 10:00:00"],
    ["texto", "ontem"],
  ])("devolve emissão nula com %s", (_caso, emissao) => {
    expect(ler(paginaSp({ emissao }))?.emitidaEm).toBeNull();
  });

  it("não devolve nota quando a página não tem itens", () => {
    expect(ler(paginaSp({ itens: [] }))).toBeUndefined();
    expect(ler(paginaComCaptcha)).toBeUndefined();
    expect(ler(paginaSemNota)).toBeUndefined();
    expect(ler("")).toBeUndefined();
  });

  it("não devolve nota quando nenhum item pôde ser lido", () => {
    expect(ler(paginaSp({ itens: [item({ total: "grátis" })] }))).toBeUndefined();
  });

  it("para em 1000 itens", () => {
    const muitos = Array.from({ length: 1005 }, (_, n) => item({ codigo: String(n) }));
    const nota = ler(paginaSp({ itens: muitos }));
    expect(nota?.itens).toHaveLength(1000);
  });
});
