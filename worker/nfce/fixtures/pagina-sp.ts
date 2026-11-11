import { chaves } from "./chaves";

/**
 * Página sintética da consulta de NFC-e de São Paulo, para os testes.
 *
 * Imita a marcação do DANFE NFC-e em HTML (tabela de itens, totais, informações gerais,
 * chave de acesso e consumidor), mas todo dado é inventado: mercado, produtos, preços,
 * número da nota e o consumidor. O CPF abaixo tem dígitos verificadores errados de
 * propósito, para não coincidir com o de ninguém.
 */
export const mercadoSintetico = {
  nome: "MERCADO EXEMPLO LTDA",
  cnpj: "11.222.333/0001-81",
  endereco: "AV. DAS NACOES, 1000, CENTRO, CIDADE EXEMPLO, SP",
} as const;

export const consumidorSintetico = {
  cpf: "123.456.789-00",
  nome: "FULANO DE TAL EXEMPLO",
} as const;

export interface ItemSintetico {
  descricao: string;
  codigo: string;
  quantidade: string;
  unidade: string;
  unitario: string;
  total: string;
}

export const itensSinteticos: readonly ItemSintetico[] = [
  {
    descricao: "CAFE SOLUVEL 200G",
    codigo: "7890000000017",
    quantidade: "2",
    unidade: "UN",
    unitario: "18,99",
    total: "37,98",
  },
  {
    descricao: "QUEIJO MUCARELA KG",
    codigo: "2000340",
    quantidade: "0,345",
    unidade: "KG",
    unitario: "38,90",
    total: "13,42",
  },
  {
    descricao: "LEITE INTEGRAL CX 12X1L",
    codigo: "7890000000024",
    quantidade: "1",
    unidade: "CX",
    unitario: "1.059,90",
    total: "1.059,90",
  },
];

export interface OpcoesDaPagina {
  itens?: readonly ItemSintetico[];
  chave?: string;
  cnpj?: string;
  comConsumidor?: boolean;
  emissao?: string;
  /** Marcação extra antes do fechamento do <body>. */
  extra?: string;
}

function linhaDoItem(item: ItemSintetico, indice: number): string {
  return `
      <tr id="Item + ${indice + 1}">
        <td valign="top">
          <span class="txtTit">${item.descricao}</span><span class="RCod">(Código: ${item.codigo})</span><br />
          <span class="Rqtd"><strong>Qtde.:</strong>${item.quantidade}</span><span class="RUN"><strong>UN: </strong>${item.unidade}</span><span class="RvlUnit"><strong>Vl. Unit.:</strong>&nbsp;${item.unitario}</span>
        </td>
        <td align="right" valign="top" class="txtTit noWrap">Vl. Total<br /><span class="valor">${item.total}</span></td>
      </tr>`;
}

const chaveEmGrupos = (chave: string): string => chave.replace(/(.{4})(?=.)/g, "$1 ");

export function paginaSp(opcoes: OpcoesDaPagina = {}): string {
  const {
    itens = itensSinteticos,
    chave = chaves.sp,
    cnpj = mercadoSintetico.cnpj,
    comConsumidor = true,
    emissao = "07/11/2026 10:15:30",
    extra = "",
  } = opcoes;
  const consumidor = comConsumidor
    ? `<ul><li><strong>CPF: </strong>${consumidorSintetico.cpf}</li><li><strong>Nome: </strong>${consumidorSintetico.nome}</li></ul>`
    : "<ul><li>Consumidor não identificado</li></ul>";

  return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <title>Consulta NFC-e - Documento sint&eacute;tico</title>
  <script>var modelo = "<tr><td>FALSO (Código: 1) Qtde.:1 UN: UN Vl. Unit.: 1,00 Vl. Total 1,00</td></tr>";</script>
  <style>.txtTit { font-weight: bold; } /* (Código: 2) */</style>
</head>
<body>
  <form id="aspnetForm" method="post" action="./ConsultaQRCode.aspx">
    <input type="hidden" name="__VIEWSTATE" value="${consumidorSintetico.cpf} > ${consumidorSintetico.nome}" />
    <!-- (Código: 3) Qtde.:1 UN: UN Vl. Unit.: 1,00 Vl. Total 1,00 -->
    <div id="conteudo">
      <div class="txtCenter">
        <div id="u20" class="txtTopo">${mercadoSintetico.nome}</div>
        <div class="text">CNPJ: ${cnpj}</div>
        <div class="text">${mercadoSintetico.endereco}</div>
      </div>
      <table border="0" align="center" cellpadding="0" cellspacing="0" id="tabResult">${itens.map(linhaDoItem).join("")}
      </table>
      <div id="totalNota" class="txtRight">
        <div id="linhaTotal"><label>Qtd. total de itens:</label><span class="totalNumb">${itens.length}</span></div>
        <div id="linhaTotal" class="linhaShade"><label>Valor a pagar R$:</label><span class="totalNumb txtMax">1.111,30</span></div>
      </div>
      <div id="infos" class="txtCenter">
        <div data-role="collapsible">
          <h4>Informa&ccedil;&otilde;es gerais da Nota</h4>
          <ul><li><strong>EMISS&Atilde;O NORMAL</strong><br><br><strong>N&uacute;mero: </strong>12345<strong> S&eacute;rie: </strong>1<strong> Emiss&atilde;o: </strong>${emissao} - Via Consumidor<br><strong>Protocolo de Autoriza&ccedil;&atilde;o: </strong>135260000000001 07/11/2026 10:15:35</li></ul>
        </div>
        <div data-role="collapsible">
          <h4>Chave de acesso</h4>
          <ul><li><span class="chave">${chaveEmGrupos(chave)}</span></li></ul>
        </div>
        <div data-role="collapsible">
          <h4>Consumidor</h4>
          ${consumidor}
        </div>
      </div>
    </div>
  </form>${extra}
</body>
</html>`;
}

/** Página que a consulta devolve quando pede verificação em vez de mostrar a nota. */
export const paginaComCaptcha = `<!DOCTYPE html>
<html lang="pt-br"><head><meta charset="utf-8"><title>Consulta NFC-e</title>
<script src="https://www.google.com/recaptcha/api.js" async defer></script></head>
<body><form method="post"><p>Confirme que voc&ecirc; n&atilde;o &eacute; um rob&ocirc;.</p>
<div class="g-recaptcha" data-sitekey="chave-sintetica"></div><input type="submit" value="Consultar" /></form></body></html>`;

/** Página de erro sem itens e sem captcha. */
export const paginaSemNota = `<!DOCTYPE html>
<html lang="pt-br"><head><meta charset="utf-8"><title>Consulta NFC-e 35261111222333000181</title></head>
<body><div id="conteudo"><h1>Consulta de NFC-e</h1><p class="erro">Nota fiscal n&atilde;o encontrada. Tente novamente.</p></div></body></html>`;
