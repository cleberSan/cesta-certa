/**
 * Chaves de acesso sintéticas para os testes: CNPJ de exemplo de documentação
 * (11.222.333/0001-81 e o alfanumérico 12.ABC.345/01DE-35), número e código inventados e
 * dígito verificador calculado. Nenhuma corresponde a uma nota real.
 */
export const chaves = {
  /** São Paulo, NFC-e (modelo 65), novembro de 2026. */
  sp: "35261111222333000181650010000123451123456780",
  /** São Paulo, NFC-e, outubro de 2026. */
  spOutubro: "35261011222333000181650020000000011000000010",
  /** São Paulo, NFC-e emitida em contingência (tipo de emissão 9). */
  spContingencia: "35261111222333000181650010000123459123456786",
  /** São Paulo, NFC-e, emitente com CNPJ alfanumérico. */
  spCnpjAlfanumerico: "35261112ABC34501DE35650010000123451123456781",
  /** São Paulo, NF-e (modelo 55): não é nota de consumidor. */
  spModelo55: "35261111222333000181550010000123451123456788",
  /** Minas Gerais (31), NFC-e: UF sem leitor. */
  mg: "31261111222333000181650010000123451123456781",
} as const;

/** Hash de 40 hexadecimais no formato do QR Code versão 2 (valor inventado). */
export const hashQr = "A1B2C3D4E5F60718293A4B5C6D7E8F9012345678";

export const hostSp = "www.nfce.fazenda.sp.gov.br";
export const rotaQrSp = "/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx";

/** Link de QR Code versão 2, emissão normal: chave|2|ambiente|idCSC|hash. */
export function linkSp(chave: string = chaves.sp, rota: string = rotaQrSp): string {
  return `https://${hostSp}${rota}?p=${chave}|2|1|1|${hashQr}`;
}
