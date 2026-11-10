import type { ItemDaNota, NotaConsultada } from "../../../src/shared/contratos/nfce";
import type { ChaveDeAcesso } from "../chave";
import { lerCentavos, lerQuantidade } from "../decimal";
import type { PaginaLida } from "../html";
import type { LeitorDeUf } from "./tipos";

/**
 * Leitor da consulta de NFC-e da Secretaria da Fazenda de São Paulo.
 *
 * A leitura se guia pelos rótulos que a página imprime, e não por nomes de classe ou de id:
 * cada item traz a descrição, "(Código: X)", "Qtde.:", "UN:", "Vl. Unit.:" e "Vl. Total";
 * o cabeçalho traz o nome do emitente, "CNPJ:" e o endereço; as informações gerais trazem
 * "Emissão:". A ordem dos rótulos foi conferida num print público dessa consulta.
 *
 * Só o que é pedido aqui sai da página. O bloco "Consumidor" (CPF e nome de quem comprou)
 * vem depois dos itens e nunca é lido (spec 0001, CA-11): o nome e o endereço do mercado só
 * são aceitos ao lado de um CNPJ igual ao da chave de acesso.
 */

const limiteDeItens = 1000;
const limiteDaDescricao = 200;

const inicioDoItem = /\(\s*C[óo]digo\s*:/gi;
const restoDoItem =
  /\(\s*C[óo]digo\s*:\s*([^)\n]{1,60}?)\s*\)\s*Qtde\.?\s*:\s*([\d.,]+)\s*UN\s*:\s*(\S{1,6})\s*Vl\.?\s*Unit\.?\s*:\s*([\d.,]+)\s*Vl\.?\s*Total\s*:?\s*([\d.,]+)/iy;
const blocoDoCnpj = /^CNPJ\s*:?\s*([0-9A-Za-z][0-9A-Za-z./-]{12,17})?/i;
const emissao = /Emiss[ãa]o\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/i;
const naoEhEndereco = /^(?:inscri|i\.?e\.?\b|\(\s*c[óo]digo|qtde|cnpj|cpf)/i;

/** Descrição do item: o texto antes de "(Código:" na mesma linha ou, se vazio, a linha anterior. */
function descricaoAntes(texto: string, posicao: number): string | undefined {
  const inicioDaLinha = texto.lastIndexOf("\n", posicao - 1) + 1;
  let descricao = texto.slice(inicioDaLinha, posicao).trim();
  if (descricao === "" && inicioDaLinha > 0) {
    const fimDaAnterior = inicioDaLinha - 1;
    const inicioDaAnterior = texto.lastIndexOf("\n", fimDaAnterior - 1) + 1;
    descricao = texto.slice(inicioDaAnterior, fimDaAnterior).trim();
  }
  return descricao === "" ? undefined : descricao.slice(0, limiteDaDescricao);
}

const semPontuacaoFinal = (numero: string): string => numero.replace(/[.,]+$/, "");

function montarItem(descricao: string, campos: RegExpExecArray): ItemDaNota | undefined {
  const quantidade = lerQuantidade(semPontuacaoFinal(campos[2]!));
  const precoUnitarioCentavos = lerCentavos(semPontuacaoFinal(campos[4]!));
  const totalCentavos = lerCentavos(semPontuacaoFinal(campos[5]!));
  if (
    quantidade === undefined ||
    precoUnitarioCentavos === undefined ||
    totalCentavos === undefined
  ) {
    return undefined;
  }
  return {
    descricao,
    codigo: campos[1]!.trim(),
    quantidade,
    unidade: campos[3]!.toUpperCase(),
    precoUnitarioCentavos,
    totalCentavos,
  };
}

function lerItens(texto: string): { itens: ItemDaNota[]; naoLidos: number } {
  const itens: ItemDaNota[] = [];
  let naoLidos = 0;
  inicioDoItem.lastIndex = 0;
  for (
    let inicio = inicioDoItem.exec(texto);
    inicio !== null && itens.length + naoLidos < limiteDeItens;
    inicio = inicioDoItem.exec(texto)
  ) {
    restoDoItem.lastIndex = inicio.index;
    const campos = restoDoItem.exec(texto);
    const descricao = descricaoAntes(texto, inicio.index);
    const item =
      campos !== null && descricao !== undefined ? montarItem(descricao, campos) : undefined;
    if (item === undefined) {
      naoLidos++;
    } else {
      itens.push(item);
      inicioDoItem.lastIndex = restoDoItem.lastIndex;
    }
  }
  return { itens, naoLidos };
}

const textoCurto = (texto: string | undefined, minimo: number, maximo: number): string | null =>
  texto !== undefined && texto.length >= minimo && texto.length <= maximo ? texto : null;

/**
 * Nome e endereço do emitente: os blocos vizinhos ao "CNPJ:" do cabeçalho, antes do primeiro
 * item, e só se o CNPJ impresso for o da chave de acesso.
 */
function lerEmitente(
  blocos: readonly string[],
  cnpj: string,
): { nome: string | null; endereco: string | null } {
  const semEmitente = { nome: null, endereco: null };
  const primeiroItem = blocos.findIndex((bloco) => /\(\s*C[óo]digo\s*:/i.test(bloco));
  const cabecalho = primeiroItem === -1 ? [] : blocos.slice(0, primeiroItem);

  for (const [indice, bloco] of cabecalho.entries()) {
    const achado = blocoDoCnpj.exec(bloco);
    if (achado === null) continue;

    // O número pode vir no mesmo bloco do rótulo ou no bloco seguinte.
    const noMesmoBloco = achado[1] !== undefined;
    const impresso = (noMesmoBloco ? achado[1]! : (cabecalho[indice + 1] ?? ""))
      .replace(/[./\s-]/g, "")
      .toUpperCase();
    if (impresso !== cnpj) return semEmitente;

    const endereco = cabecalho[indice + (noMesmoBloco ? 1 : 2)];
    return {
      nome: textoCurto(cabecalho[indice - 1], 2, 150),
      endereco:
        endereco !== undefined && !naoEhEndereco.test(endereco)
          ? textoCurto(endereco, 5, 250)
          : null,
    };
  }
  return semEmitente;
}

const diasDoMes = (ano: number, mes: number): number =>
  new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** "Emissão: 07/11/2026 10:15:30" vira "2026-11-07T10:15:30", no horário impresso na nota. */
function lerEmissao(texto: string): string | null {
  const achado = emissao.exec(texto);
  if (achado === null) return null;

  const dia = achado[1]!;
  const mes = achado[2]!;
  const ano = achado[3]!;
  const hora = achado[4];
  const minuto = achado[5];
  const segundo = achado[6] ?? "00";
  const dataValida =
    Number(ano) >= 2000 &&
    Number(mes) >= 1 &&
    Number(mes) <= 12 &&
    Number(dia) >= 1 &&
    Number(dia) <= diasDoMes(Number(ano), Number(mes));
  if (!dataValida) return null;

  const data = `${ano}-${mes}-${dia}`;
  if (hora === undefined || minuto === undefined) return data;
  const horaValida = Number(hora) < 24 && Number(minuto) < 60 && Number(segundo) < 60;
  return horaValida ? `${data}T${hora}:${minuto}:${segundo}` : data;
}

function ler(pagina: PaginaLida, chave: ChaveDeAcesso): NotaConsultada | undefined {
  const { itens, naoLidos } = lerItens(pagina.texto);
  if (itens.length === 0) return undefined;

  return {
    uf: sp.sigla,
    mercado: { cnpj: chave.cnpj, ...lerEmitente(pagina.blocos, chave.cnpj) },
    emitidaEm: lerEmissao(pagina.texto),
    itens,
    itensNaoLidos: naoLidos,
  };
}

/**
 * Endereços de produção da consulta por QR Code, da página oficial de web services da
 * Sefaz-SP (portal.fazenda.sp.gov.br/servicos/nfce). A consulta por chave digitada e o
 * ambiente de homologação ficam de fora.
 */
export const sp: LeitorDeUf = {
  sigla: "SP",
  codigoIbge: "35",
  host: "www.nfce.fazenda.sp.gov.br",
  rotas: ["/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx", "/qrcode"],
  ler,
};
