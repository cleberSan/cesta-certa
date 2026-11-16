import { describe, expect, it } from "vitest";
import { formatarCentavos } from "../../shared/dinheiro";
import { objetivoPadrao } from "../comparar/objetivo";
import { comparar } from "../comparar/otimizador";
import { dadosDaDemonstracao, montarDemonstracao, type DadosDaDemonstracao } from "./demo";
import { previaDaDemonstracao } from "./previa";

const hoje = "2026-11-16";

// spec 0002 CA-06
describe("previaDaDemonstracao", () => {
  it("mostra a opção 1 da mesma comparação que a /demonstracao faz", () => {
    const demo = montarDemonstracao(dadosDaDemonstracao, hoje);
    const melhor = comparar(demo.itens, demo.observacoes, demo.mercados, objetivoPadrao).opcoes[0]!;

    const previa = previaDaDemonstracao(dadosDaDemonstracao, hoje)!;

    expect(previa.total).toBe(formatarCentavos(melhor.totalCentavos));
    expect(previa.nome).toBe("Mercadinho Exemplo da Praça e Atacarejo Imaginário");
    expect(previa.total).toBe(formatarCentavos(17506));
    expect(previa.economia).toBe(`${formatarCentavos(2850)} a menos`);
    expect(previa.economiaFrente).toBe("que tudo no Supermercado Fictício Central");
    expect(previa.caminho).toBe("2 paradas · 5,4 km");
    expect(previa.lugar).toBe("Vila Exemplo, até 5 km");
  });

  it("não depende do dia: os totais são os mesmos em outra data", () => {
    expect(previaDaDemonstracao(dadosDaDemonstracao, "2027-03-01")).toEqual(
      previaDaDemonstracao(dadosDaDemonstracao, hoje),
    );
  });

  it("sem economia quando a melhor opção é um mercado só", () => {
    const umMercado: DadosDaDemonstracao = {
      ...dadosDaDemonstracao,
      precos: dadosDaDemonstracao.precos.filter(
        (preco) => preco.mercado === dadosDaDemonstracao.mercados[0]!.id,
      ),
    };

    const previa = previaDaDemonstracao(umMercado, hoje)!;

    expect(previa.economia).toBeNull();
    expect(previa.economiaFrente).toBeNull();
    expect(previa.caminho).toMatch(/^1 parada · /);
  });

  it("é nula quando não há nenhum preço para comparar", () => {
    expect(previaDaDemonstracao({ ...dadosDaDemonstracao, precos: [] }, hoje)).toBeNull();
  });
});
