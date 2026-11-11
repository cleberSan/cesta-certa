import { describe, expect, it } from "vitest";
import { chaves, hashQr, hostSp, linkSp, rotaQrSp } from "./fixtures/chaves";
import { validarLink } from "./link";

const destinoDe = (link: string): string | undefined => {
  const resultado = validarLink(link);
  return resultado.ok ? resultado.valor.destino.href : undefined;
};

const codigoDe = (link: unknown): string | undefined => {
  const resultado = validarLink(link);
  return resultado.ok ? undefined : resultado.erro.code;
};

describe("validarLink: links aceitos", () => {
  it("aceita o link do QR Code de São Paulo e devolve leitor, chave e destino", () => {
    const resultado = validarLink(linkSp());
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.valor.leitor.sigla).toBe("SP");
    expect(resultado.valor.chave.valor).toBe(chaves.sp);
    expect(resultado.valor.destino.href).toBe(
      `https://${hostSp}${rotaQrSp}?p=${chaves.sp}|2|1|1|${hashQr}`,
    );
  });

  it("aceita a rota curta /qrcode", () => {
    expect(destinoDe(linkSp(chaves.sp, "/qrcode"))).toBe(
      `https://${hostSp}/qrcode?p=${chaves.sp}|2|1|1|${hashQr}`,
    );
  });

  it("monta o destino sempre em https, mesmo quando o cupom imprime http", () => {
    const link = linkSp().replace("https://", "http://");
    expect(destinoDe(link)).toMatch(/^https:\/\/www\.nfce\.fazenda\.sp\.gov\.br\//);
  });

  it("usa a grafia oficial do caminho, qualquer que seja a do link", () => {
    const link = linkSp(chaves.sp, "/nfceconsultapublica/PAGINAS/consultaqrcode.ASPX/");
    expect(new URL(destinoDe(link)!).pathname).toBe(rotaQrSp);
  });

  it("aceita espaço em volta e host em maiúsculas", () => {
    const link = `  ${linkSp().replace(hostSp, hostSp.toUpperCase())}\n`;
    expect(destinoDe(link)).toBe(destinoDe(linkSp()));
  });

  it.each([
    ["versão 3, emissão normal", `${chaves.sp}|3|1`],
    [
      "versão 2, contingência",
      `${chaves.spContingencia}|2|1|07|61.34|${"6A".repeat(28)}|1|${hashQr}`,
    ],
    ["CNPJ alfanumérico", `${chaves.spCnpjAlfanumerico}|2|1|1|${hashQr}`],
    ["outro mês", `${chaves.spOutubro}|2|1|000001|${hashQr.toLowerCase()}`],
  ])("aceita QR Code de %s", (_caso, p) => {
    expect(validarLink(`https://${hostSp}/qrcode?p=${p}`).ok).toBe(true);
  });

  it("não deixa o parâmetro p mudar a estrutura do endereço montado", () => {
    // Campo com espaço (um "+" na URL) e barra: tudo vai codificado dentro de p.
    const destino = new URL(destinoDe(`https://${hostSp}/qrcode?p=${chaves.sp}|3|1|a+b/c=d`)!);
    expect(destino.origin).toBe(`https://${hostSp}`);
    expect(destino.pathname).toBe("/qrcode");
    expect([...destino.searchParams.keys()]).toEqual(["p"]);
    expect(destino.searchParams.get("p")).toBe(`${chaves.sp}|3|1|a b/c=d`);
    expect(destino.hash).toBe("");
  });

  it("ignora outros parâmetros e o fragmento do link", () => {
    const destino = new URL(destinoDe(`${linkSp()}&utm_source=x&redirect=https://evil.example#a`)!);
    expect([...destino.searchParams.keys()]).toEqual(["p"]);
    expect(destino.href).not.toContain("evil");
  });
});

// spec 0001 CA-12
describe("validarLink: links recusados sem nenhuma requisição", () => {
  const p = `${chaves.sp}|2|1|1|${hashQr}`;

  it.each([
    ["número", 42],
    ["nulo", null],
    ["objeto", { url: linkSp() }],
    ["lista", [linkSp()]],
    ["vazio", ""],
    ["só espaços", "   "],
    ["texto solto", "nota fiscal do mercado"],
    ["só a chave", chaves.sp],
    ["grande demais", `${linkSp()}&x=${"a".repeat(2100)}`],
  ])("recusa %s como link inválido", (_caso, entrada) => {
    expect(codigoDe(entrada)).toBe("nfce.link-invalido");
  });

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<p>x</p>"],
    ["file:", "file:///etc/passwd"],
    ["ftp:", `ftp://${hostSp}/qrcode?p=${p}`],
  ])("recusa o protocolo %s", (_caso, link) => {
    expect(codigoDe(link)).toBe("nfce.link-invalido");
  });

  it.each([
    ["outro site", `https://evil.example/qrcode?p=${p}`],
    ["host oficial como subdomínio de outro", `https://${hostSp}.evil.example/qrcode?p=${p}`],
    ["host oficial no usuário da URL", `https://${hostSp}@evil.example/qrcode?p=${p}`],
    ["host oficial no caminho", `https://evil.example/${hostSp}/qrcode?p=${p}`],
    ["sem www", `https://nfce.fazenda.sp.gov.br/qrcode?p=${p}`],
    ["outro subdomínio", `https://portal.fazenda.sp.gov.br/qrcode?p=${p}`],
    ["homologação", `https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode?p=${p}`],
    ["ponto no fim do host", `https://${hostSp}./qrcode?p=${p}`],
    ["IP", `https://200.144.0.1/qrcode?p=${p}`],
    ["IP interno", `https://10.0.0.1/qrcode?p=${p}`],
    ["IPv6 local", `https://[::1]/qrcode?p=${p}`],
    ["localhost", `http://localhost:8787/qrcode?p=${p}`],
    ["endereço de metadados de nuvem", `http://169.254.169.254/latest/meta-data?p=${p}`],
    ["letra parecida no host", `https://www.nfce.fazenda.sp.gov.ьr/qrcode?p=${p}`],
    ["porta", `https://${hostSp}:8443/qrcode?p=${p}`],
    ["usuário e senha", `https://usuario:senha@${hostSp}/qrcode?p=${p}`],
  ])("recusa %s como endereço fora da lista", (_caso, link) => {
    expect(codigoDe(link)).toBe("nfce.host-nao-permitido");
  });

  it.each([
    ["consulta por chave digitada", `https://${hostSp}/NFCeConsultaPublica?p=${p}`],
    ["página inicial", `https://${hostSp}/?p=${p}`],
    ["caminho com volta", `https://${hostSp}/qrcode/../admin?p=${p}`],
    ["caminho parecido", `https://${hostSp}/qrcode2?p=${p}`],
    ["sem o parâmetro p", `https://${hostSp}/qrcode`],
    ["p vazio", `https://${hostSp}/qrcode?p=`],
    ["p repetido", `https://${hostSp}/qrcode?p=${p}&p=${p}`],
    ["P maiúsculo", `https://${hostSp}/qrcode?P=${p}`],
    ["só a chave em p", `https://${hostSp}/qrcode?p=${chaves.sp}`],
    ["campos demais", `https://${hostSp}/qrcode?p=${p}|1|2|3|4|5|6`],
    ["versão 1", `https://${hostSp}/qrcode?p=${chaves.sp}|1|1`],
    ["versão 4", `https://${hostSp}/qrcode?p=${chaves.sp}|4|1`],
    ["marcação em p", `https://${hostSp}/qrcode?p=${chaves.sp}|2|1|<script>|x`],
    ["quebra de linha em p", `https://${hostSp}/qrcode?p=${chaves.sp}|2|1|a%0d%0ab|x`],
    ["campo enorme", `https://${hostSp}/qrcode?p=${chaves.sp}|2|1|${"a".repeat(601)}`],
    [
      "p enorme",
      `https://${hostSp}/qrcode?p=${chaves.sp}|2|1|${"a".repeat(600)}|${"b".repeat(600)}`,
    ],
    ["dígito verificador errado", `https://${hostSp}/qrcode?p=${chaves.sp.slice(0, 43)}9|2|1`],
    ["chave curta", `https://${hostSp}/qrcode?p=${chaves.sp.slice(0, 40)}|2|1`],
    ["NF-e modelo 55", `https://${hostSp}/qrcode?p=${chaves.spModelo55}|2|1`],
    ["chave de outra UF no site de SP", `https://${hostSp}/qrcode?p=${chaves.mg}|2|1`],
    ["ambiente de homologação", `https://${hostSp}/qrcode?p=${chaves.sp}|2|2|1|${hashQr}`],
  ])("recusa %s como link inválido", (_caso, link) => {
    expect(codigoDe(link)).toBe("nfce.link-invalido");
  });

  it("reconhece nota de outra UF pela chave e avisa que não há leitor", () => {
    const resultado = validarLink(
      `https://portalsped.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?p=${chaves.mg}|2|1|1|${hashQr}`,
    );
    expect(resultado).toEqual({
      ok: false,
      erro: {
        code: "nfce.uf-sem-leitor",
        detalhe: "Ainda não há leitor para notas fiscais de MG.",
      },
    });
  });

  it("chave de São Paulo em site que não é o de São Paulo não ganha tratamento especial", () => {
    expect(codigoDe(`https://evil.example/qrcode?p=${p}`)).toBe("nfce.host-nao-permitido");
    expect(codigoDe(`https://evil.example/qrcode?p=${chaves.spModelo55}|2|1`)).toBe(
      "nfce.host-nao-permitido",
    );
  });

  it("nunca repete o link recebido na frase de erro", () => {
    const links = [
      `https://evil.example/segredo?p=${p}`,
      `https://${hostSp}/outro-caminho?p=${p}`,
      `https://${hostSp}/qrcode?p=${chaves.sp.slice(0, 43)}9|2|1|1|${hashQr}`,
      `https://outra-uf.example/qrcode?p=${chaves.mg}|2|1|1|${hashQr}`,
    ];
    for (const link of links) {
      const resultado = validarLink(link);
      expect(resultado.ok).toBe(false);
      if (resultado.ok) continue;
      expect(resultado.erro.detalhe).not.toMatch(/evil|segredo|outro-caminho|outra-uf|\d{10}/);
      expect(resultado.erro.detalhe).not.toContain(hashQr);
    }
  });
});
