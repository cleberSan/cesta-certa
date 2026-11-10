import { limiteDoLink } from "../../src/shared/contratos/nfce";
import { falha, sucesso, type Resultado } from "../../src/shared/resultado";
import { lerChave, type ChaveDeAcesso } from "./chave";
import { leitores } from "./ufs/indice";
import type { LeitorDeUf } from "./ufs/tipos";

/**
 * Validação do link do QR Code da NFC-e (spec 0001, CA-12).
 *
 * O Worker nunca busca o endereço que recebeu. Ele confere que o link é da consulta oficial
 * de uma UF com leitor e monta um endereço novo: https, host e caminho da lista permitida e
 * o parâmetro `p` validado. Assim nenhum texto de quem chama decide para onde a requisição
 * vai (proteção contra SSRF).
 *
 * Parâmetro `p` do QR Code, campos separados por "|":
 * - versão 2, emissão normal: chave|2|ambiente|idCSC|hash
 * - versão 2, contingência: chave|2|ambiente|dia|valor|digest|idCSC|hash
 * - versão 3, emissão normal: chave|3|ambiente
 */
export interface LinkValidado {
  readonly leitor: LeitorDeUf;
  readonly chave: ChaveDeAcesso;
  /** Endereço que o Worker vai buscar, montado aqui. */
  readonly destino: URL;
}

export interface LinkRecusado {
  readonly code: "nfce.link-invalido" | "nfce.host-nao-permitido" | "nfce.uf-sem-leitor";
  /** Frase para a resposta de erro. Nunca repete o link recebido. */
  readonly detalhe: string;
}

/** Código do IBGE de cada UF, para dizer de onde é uma nota sem leitor. */
const siglasPorCodigo: Readonly<Record<string, string>> = {
  "11": "RO",
  "12": "AC",
  "13": "AM",
  "14": "RR",
  "15": "PA",
  "16": "AP",
  "17": "TO",
  "21": "MA",
  "22": "PI",
  "23": "CE",
  "24": "RN",
  "25": "PB",
  "26": "PE",
  "27": "AL",
  "28": "SE",
  "29": "BA",
  "31": "MG",
  "32": "ES",
  "33": "RJ",
  "35": "SP",
  "41": "PR",
  "42": "SC",
  "43": "RS",
  "50": "MS",
  "51": "MT",
  "52": "GO",
  "53": "DF",
};

const limiteDoParametro = 1200;
const campoPermitido = /^[0-9A-Za-z.+/=:_ -]{0,600}$/;

interface ParametroLido {
  readonly texto: string;
  readonly chave: ReturnType<typeof lerChave>;
  readonly ambiente: string;
}

function lerParametro(valores: readonly string[]): ParametroLido | undefined {
  const [texto] = valores;
  if (valores.length !== 1 || texto === undefined || texto.length > limiteDoParametro) {
    return undefined;
  }
  const campos = texto.split("|");
  if (campos.length < 3 || campos.length > 10 || !campos.every((c) => campoPermitido.test(c))) {
    return undefined;
  }
  const [chave, versao, ambiente] = campos as [string, string, string];
  if (versao !== "2" && versao !== "3") return undefined;
  return { texto, chave: lerChave(chave), ambiente };
}

function recusa(code: LinkRecusado["code"], detalhe: string): Resultado<never, LinkRecusado> {
  return falha({ code, detalhe });
}

const hostsPermitidos = leitores.map((leitor) => leitor.host).join(", ");

export function validarLink(entrada: unknown): Resultado<LinkValidado, LinkRecusado> {
  if (typeof entrada !== "string") {
    return recusa("nfce.link-invalido", "O link da nota precisa ser um texto.");
  }
  const texto = entrada.trim();
  if (texto === "" || texto.length > limiteDoLink || !URL.canParse(texto)) {
    return recusa("nfce.link-invalido", "O texto enviado não é um link de nota fiscal.");
  }
  const url = new URL(texto);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return recusa("nfce.link-invalido", "O link da nota precisa começar com https://.");
  }

  const parametro = lerParametro(url.searchParams.getAll("p"));
  const leitor = leitores.find((candidato) => candidato.host === url.hostname);
  if (leitor === undefined || url.port !== "" || url.username !== "" || url.password !== "") {
    // Link de consulta de outra UF: a chave diz de onde é a nota, sem buscar nada.
    if (leitor === undefined && parametro?.chave.ok && parametro.chave.valor.modelo === "65") {
      const uf = parametro.chave.valor.uf;
      const sigla = siglasPorCodigo[uf];
      const temLeitor = leitores.some((candidato) => candidato.codigoIbge === uf);
      if (sigla !== undefined && !temLeitor) {
        return recusa("nfce.uf-sem-leitor", `Ainda não há leitor para notas fiscais de ${sigla}.`);
      }
    }
    return recusa(
      "nfce.host-nao-permitido",
      `O endereço não é o da consulta oficial de NFC-e (${hostsPermitidos}).`,
    );
  }

  const caminho = url.pathname.replace(/\/+$/, "").toLowerCase();
  const rota = leitor.rotas.find((permitida) => permitida.toLowerCase() === caminho);
  if (rota === undefined) {
    return recusa(
      "nfce.link-invalido",
      "O endereço é do site da NFC-e, mas não é o link do QR Code de uma nota.",
    );
  }
  if (parametro === undefined) {
    return recusa("nfce.link-invalido", "O link não traz os dados do QR Code da nota (p).");
  }
  if (!parametro.chave.ok) {
    return recusa(
      "nfce.link-invalido",
      "A chave de acesso do link está incompleta ou com dígito errado.",
    );
  }
  const chave = parametro.chave.valor;
  if (chave.modelo !== "65") {
    return recusa("nfce.link-invalido", "A chave do link não é de uma nota de consumidor (NFC-e).");
  }
  if (chave.uf !== leitor.codigoIbge) {
    return recusa("nfce.link-invalido", `A chave do link não é de uma nota de ${leitor.sigla}.`);
  }
  if (parametro.ambiente !== "1") {
    return recusa(
      "nfce.link-invalido",
      "O link é de uma nota de teste (homologação), sem valor fiscal.",
    );
  }

  // "|" fica como o navegador envia; o resto é codificado para não alterar a URL.
  const p = encodeURIComponent(parametro.texto).replaceAll("%7C", "|");
  return sucesso({ leitor, chave, destino: new URL(`https://${leitor.host}${rota}?p=${p}`) });
}
