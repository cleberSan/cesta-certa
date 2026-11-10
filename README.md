# cesta-certa

Comparador da compra do mês: você monta a lista, o app mostra em quais mercados próximos ela sai mais barata, de acordo com o seu objetivo, e abre a rota no Waze ou no Google Maps. Feito primeiro para o celular.

> **Estado: em especificação.** Ainda não há código. A [spec 0001](docs/specs/0001-mvp-compra-do-mes/spec.md) descreve o MVP e aguarda aprovação.

## A ideia

- **Lista do mês** guardada no aparelho, com quantidade, marca preferida e tamanho.
- **Preços com fonte e data**, vindos das suas próprias notas fiscais (QR Code da NFC-e) e do que você digita no mercado. Sem raspagem de site de mercado e sem prometer "preço de hoje".
- **Mercados próximos** de qualquer lugar do Brasil, a partir dos dados do OpenStreetMap. O app pede a localização explicando o motivo, e as coordenadas não saem do aparelho.
- **Ranking pelo seu objetivo**: teto de gasto, preferência de marca, até quantos mercados você topa ir e a que distância. A conta é feita no aparelho por um algoritmo determinístico.
- **Rota** no Waze ou no Google Maps com um toque.
- **Assistente com Claude** para conversar sobre o resultado, de uso restrito ao dono; a demonstração pública usa respostas gravadas e mercados fictícios.

## Documentos

| Documento | Para quê |
|---|---|
| [spec.md](docs/specs/0001-mvp-compra-do-mes/spec.md) | O quê e por quê: problema, fora de escopo e critérios de aceite |
| [plano.md](docs/specs/0001-mvp-compra-do-mes/plano.md) | Como: fatos verificados com fonte, desenho, segurança, testes por critério e riscos |
| [tarefas.md](docs/specs/0001-mvp-compra-do-mes/tarefas.md) | Em que ordem: uma tarefa por commit, em cinco PRs |
| [docs/adr](docs/adr) | Decisões de arquitetura |
| [docs/specs](docs/specs/README.md) | Como as specs funcionam aqui |

## Qualidade

O código entra por PR, com cada critério de aceite ligado a um teste, cobertura mínima de 80%, CodeQL, revisão de dependências e acessibilidade WCAG 2.2 AA. Esses checks chegam com o primeiro PR de código.

## Licença

Código sob [MIT](LICENSE). Os dados de mercados virão do OpenStreetMap, sob ODbL. Waze, Google Maps e os nomes de redes de mercado são marcas de seus donos e ficam fora da licença.
