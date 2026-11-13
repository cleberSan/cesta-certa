import { describe, expect, it } from "vitest";
import {
  atacadoVale,
  custoDoItem,
  descreverPrecoPorUnidade,
  embalagemDoPreco,
  embalagemNaDescricao,
  embalagensNecessarias,
  formatarPrecoPorUnidade,
  lerEmbalagem,
  precoPorUnidade,
  type Embalagem,
} from "./unidades";

const massa = (quantidade: number): Embalagem => ({
  grandeza: "massa",
  quantidade,
  contavel: null,
});
const volume = (quantidade: number): Embalagem => ({
  grandeza: "volume",
  quantidade,
  contavel: null,
});
const contagem = (quantidade: number, contavel: "unidade" | "rolo" = "unidade"): Embalagem => ({
  grandeza: "contagem",
  quantidade,
  contavel,
});

// spec 0001 CA-17
describe("lerEmbalagem", () => {
  it.each([
    ["12x1L", volume(12_000)],
    ["12 x 1 L", volume(12_000)],
    ["6X500ML", volume(3000)],
    ["1,5L", volume(1500)],
    ["1.5 l", volume(1500)],
    ["2 litros", volume(2000)],
    ["350 ml", volume(350)],
    ["500G", massa(500)],
    ["500 gr", massa(500)],
    ["5 kg", massa(5000)],
    ["0,345 kg", massa(345)],
    ["1 quilo", massa(1000)],
    ["32 rolos", contagem(32, "rolo")],
    ["1 rolo", contagem(1, "rolo")],
    ["12 unidades", contagem(12)],
    ["30 un", contagem(30)],
    ["4x12 un", contagem(48)],
    ["  5   KG  ", massa(5000)],
  ])("lê %s", (texto, esperado) => {
    expect(lerEmbalagem(texto)).toEqual(esperado);
  });

  it.each([
    [null],
    [""],
    ["grande"],
    ["5"],
    ["kg"],
    ["0 kg"],
    ["0x1L"],
    ["0,0001 kg"],
    ["1,5 rolo"],
    ["5 kg de arroz"],
    ["5 kgg"],
    ["1001 t"],
    ["100001 kg"],
    ["5 kg 2"],
    ["-5 kg"],
  ])("não reconhece %s", (texto) => {
    expect(lerEmbalagem(texto)).toBeNull();
  });

  it("recusa o total acima de 100 milhões de gramas, mililitros ou unidades", () => {
    expect(lerEmbalagem("100000 kg")).toBeNull();
    expect(lerEmbalagem("99999 kg")).toEqual(massa(99_999_000));
    expect(lerEmbalagem("99999 un")).toEqual(contagem(99_999));
    expect(lerEmbalagem("999x99999 un")).toEqual(contagem(99_899_001));
  });
});

// spec 0001 CA-17
describe("embalagemNaDescricao", () => {
  it.each([
    ["CAFE SOLUVEL 200G", massa(200)],
    ["LEITE INTEGRAL 12X1L", volume(12_000)],
    ["ARROZ TIPO 1 5KG", massa(5000)],
    ["SABAO PO 1,6KG", massa(1600)],
    ["AGUA MIN 1.5L", volume(1500)],
    ["PAPEL HIG 12 ROLOS 30M", contagem(12, "rolo")],
    ["CERV LATA 350ML C/12 473ML", volume(473)],
    ["ARROZ 5KG 0KG", massa(5000)],
  ])("acha o tamanho em %s", (descricao, esperado) => {
    expect(embalagemNaDescricao(descricao)).toEqual(esperado);
  });

  it.each([[null], ["QUEIJO MUCARELA KG"], ["PAO FRANCES"], ["COD 7891000G1"], ["X200G"]])(
    "não inventa tamanho em %s",
    (descricao) => {
      expect(embalagemNaDescricao(descricao)).toBeNull();
    },
  );
});

describe("embalagemDoPreco", () => {
  it("prefere o tamanho escrito; sem ele, usa a descrição da nota", () => {
    expect(embalagemDoPreco({ tamanho: "1 kg", descricao: "QUEIJO 500G" })).toEqual(massa(1000));
    expect(embalagemDoPreco({ tamanho: null, descricao: "QUEIJO 500G" })).toEqual(massa(500));
    expect(embalagemDoPreco({ tamanho: "pacote", descricao: "CAFE 250G" })).toEqual(massa(250));
    expect(embalagemDoPreco({ tamanho: null, descricao: null })).toBeNull();
  });
});

// spec 0001 CA-17
describe("precoPorUnidade", () => {
  it("dá o preço por kg, por litro, por unidade e por rolo", () => {
    expect(precoPorUnidade(1899, massa(200))).toEqual({
      grandeza: "massa",
      centavos: 9495,
      referencia: "kg",
    });
    expect(precoPorUnidade(5988, volume(12_000))).toEqual({
      grandeza: "volume",
      centavos: 499,
      referencia: "litro",
    });
    expect(precoPorUnidade(2000, contagem(32, "rolo"))).toEqual({
      grandeza: "contagem",
      centavos: 62.5,
      referencia: "rolo",
    });
    expect(precoPorUnidade(1500, contagem(30))).toMatchObject({
      centavos: 50,
      referencia: "unidade",
    });
  });

  it("compara embalagens diferentes do mesmo produto pelo preço por unidade", () => {
    const pequeno = precoPorUnidade(699, massa(1000));
    const grande = precoPorUnidade(2990, massa(5000));

    expect(grande.centavos).toBeLessThan(pequeno.centavos);
  });
});

describe("formatarPrecoPorUnidade", () => {
  it.each([
    [{ grandeza: "massa", centavos: 9495, referencia: "kg" } as const, "R$ 94,95 por kg"],
    [{ grandeza: "contagem", centavos: 62.5, referencia: "rolo" } as const, "R$ 0,63 por rolo"],
    [
      { grandeza: "volume", centavos: 123_456.4, referencia: "litro" } as const,
      "R$ 1.234,56 por litro",
    ],
    [
      { grandeza: "contagem", centavos: 0.4, referencia: "unidade" } as const,
      "menos de R$ 0,01 por unidade",
    ],
  ])("%o vira %s", (preco, esperado) => {
    expect(formatarPrecoPorUnidade(preco)).toBe(esperado);
  });

  it("mostra o preço por unidade só quando o tamanho é reconhecido", () => {
    expect(
      descreverPrecoPorUnidade({ tamanho: "200 g", descricao: null, precoCentavos: 1899 }),
    ).toBe("R$ 94,95 por kg");
    expect(
      descreverPrecoPorUnidade({ tamanho: null, descricao: null, precoCentavos: 1899 }),
    ).toBeNull();
  });
});

// spec 0001 CA-17
describe("embalagensNecessarias", () => {
  it.each([
    ["2 de 5 kg com preço de 1 kg", { quantidade: 2, tamanho: "5 kg" }, massa(1000), 10],
    ["1 de 5 kg com preço de 5 kg", { quantidade: 1, tamanho: "5 kg" }, massa(5000), 1],
    [
      "1 de 5 kg com preço de 2 kg arredonda para cima",
      { quantidade: 1, tamanho: "5 kg" },
      massa(2000),
      3,
    ],
    ["1 de 1 kg com preço de 5 kg compra uma", { quantidade: 1, tamanho: "1 kg" }, massa(5000), 1],
    ["12 de 1 L com fardo 12x1L", { quantidade: 12, tamanho: "1 L" }, volume(12_000), 1],
    ["13 de 1 L com fardo 12x1L", { quantidade: 13, tamanho: "1 L" }, volume(12_000), 2],
    ["3 de 1,5 L com garrafa de 1,5 L", { quantidade: 3, tamanho: "1,5L" }, volume(1500), 3],
    ["sem tamanho no item", { quantidade: 4, tamanho: null }, massa(1000), 4],
    ["sem tamanho no preço", { quantidade: 4, tamanho: "1 kg" }, null, 4],
    ["grandezas diferentes", { quantidade: 2, tamanho: "1 kg" }, volume(1000), 2],
  ])("%s", (_caso, item, embalagem, esperado) => {
    expect(embalagensNecessarias(item, embalagem)).toBe(esperado);
  });
});

// spec 0001 CA-18
describe("atacadoVale", () => {
  it.each([
    [null, 1, true],
    [3, 2, false],
    [3, 3, true],
    [3, 4, true],
    [999, 998, false],
  ])("mínimo %s com %i embalagens: %s", (minimo, embalagens, esperado) => {
    expect(atacadoVale(minimo, embalagens)).toBe(esperado);
  });
});

// spec 0001 CA-17 e CA-18
describe("custoDoItem", () => {
  const preco = { tamanho: "1 kg", descricao: null, precoCentavos: 699, minimoAtacado: null };

  it("multiplica as embalagens necessárias pelo preço da embalagem", () => {
    expect(custoDoItem({ quantidade: 2, tamanho: "5 kg" }, preco)).toEqual({
      embalagens: 10,
      centavos: 6990,
    });
  });

  it("usa o preço de atacado só quando a compra alcança o mínimo", () => {
    const atacado = { ...preco, precoCentavos: 599, minimoAtacado: 3 };

    expect(custoDoItem({ quantidade: 2, tamanho: null }, atacado)).toBeNull();
    expect(custoDoItem({ quantidade: 3, tamanho: null }, atacado)).toEqual({
      embalagens: 3,
      centavos: 1797,
    });
    // O mínimo conta embalagens deste preço: 1 pacote de 5 kg são 5 de 1 kg.
    expect(custoDoItem({ quantidade: 1, tamanho: "5 kg" }, atacado)).toEqual({
      embalagens: 5,
      centavos: 2995,
    });
  });
});
