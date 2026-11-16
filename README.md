# cesta-certa

Comparador da compra do mês: você monta a lista, o app mostra em quais mercados próximos ela sai mais barata, de acordo com o seu objetivo, e abre a rota no Waze ou no Google Maps. Feito primeiro para o celular.

- **Site:** <https://cesta-certa.clebersan.workers.dev>
- **Demonstração, com bairro, mercados e preços fictícios:** <https://cesta-certa.clebersan.workers.dev/demonstracao>

> **Estado:** o MVP da [spec 0001](docs/specs/0001-mvp-compra-do-mes/spec.md) está no código, na ordem de [tarefas.md](docs/specs/0001-mvp-compra-do-mes/tarefas.md). A conferência em produção (leitura de uma nota real e o assistente com os segredos criados) fecha a spec.

## O que faz

- **Lista do mês** guardada no aparelho, com quantidade, marca preferida e tamanho, e cópia dos dados em arquivo para levar a outro aparelho.
- **Preços com fonte e data**, vindos das suas próprias notas fiscais (QR Code da NFC-e de São Paulo) e do que você digita no mercado. Sem raspagem de site de mercado e sem prometer "preço de hoje"; preço com mais de 30 dias aparece como antigo.
- **Mercados próximos** de qualquer lugar do Brasil, a partir dos dados do OpenStreetMap, em lista e no mapa. O app pede a localização explicando o motivo, e as coordenadas não saem do aparelho.
- **Ranking pelo seu objetivo**: teto de gasto, preferência de marca, até quantos mercados você topa ir e a que distância. A conta é feita no aparelho por um algoritmo determinístico, que diz o que comprar em cada mercado e o que trocar ou tirar para caber no teto.
- **Rota** no Waze ou no Google Maps com um toque, com as paradas na ordem.
- **Assistente com Claude** para conversar sobre o resultado, de uso restrito (código de acesso e limite de perguntas). Na demonstração, ele responde com respostas gravadas.
- **Sem internet**, depois da primeira visita, a lista e os preços guardados continuam abrindo.

## Como funciona

| Parte           | Como                                                                                                                                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Páginas         | Astro estático com ilhas React só onde há interação; as demais páginas saem sem JavaScript ([ADR-0001](docs/adr/0001-pilha-e-hospedagem.md))                                                                                            |
| Dados da pessoa | IndexedDB no aparelho, com migração versionada e cópia em arquivo; nenhum servidor guarda lista, preço ou localização ([ADR-0002](docs/adr/0002-dados-da-pessoa-so-no-aparelho.md))                                                     |
| API             | Um Worker da Cloudflare atende só `/api`: a consulta da nota fiscal e o assistente, com limite por cliente e logs sem conteúdo ([ADR-0001](docs/adr/0001-pilha-e-hospedagem.md), [ADR-0004](docs/adr/0004-assistente-pelo-servidor.md)) |
| Mercados        | Base mensal do OpenStreetMap em células de 1 grau, servida com o site; o app baixa só a região do raio ([ADR-0005](docs/adr/0005-mercados-localizacao-e-mapa.md))                                                                       |
| Comparação      | Otimizador puro no aparelho, de um a três mercados ([ADR-0006](docs/adr/0006-comparacao-da-lista.md))                                                                                                                                   |
| Sem internet    | Service worker escrito à mão, com a lista de arquivos gerada no build ([ADR-0007](docs/adr/0007-demonstracao-e-uso-sem-internet.md))                                                                                                    |

O que vai para cada serviço, e o que não vai, está na página [Privacidade](https://cesta-certa.clebersan.workers.dev/privacidade).

## Documentos

| Documento                                                  | Para quê                                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [spec.md](docs/specs/0001-mvp-compra-do-mes/spec.md)       | O quê e por quê: problema, fora de escopo e critérios de aceite                     |
| [plano.md](docs/specs/0001-mvp-compra-do-mes/plano.md)     | Como: fatos verificados com fonte, desenho, segurança, testes por critério e riscos |
| [tarefas.md](docs/specs/0001-mvp-compra-do-mes/tarefas.md) | Em que ordem: uma tarefa por commit, em cinco PRs                                   |
| [spec 0002](docs/specs/0002-novo-visual-feira/spec.md)     | Novo visual, direção "Feira": critérios, plano e tarefas (em rascunho)              |
| [docs/specs](docs/specs/README.md)                         | Como as specs funcionam aqui                                                        |
| [CONTRIBUTING](CONTRIBUTING.md)                            | Como rodar, testar e publicar                                                       |
| [SECURITY](SECURITY.md)                                    | Como reportar uma falha de segurança                                                |

### Decisões de arquitetura

| ADR                                                      | Decisão                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [0000](docs/adr/0000-registrar-decisoes-com-adr.md)      | Registrar decisões arquiteturais com ADRs                                                  |
| [0001](docs/adr/0001-pilha-e-hospedagem.md)              | Astro estático com ilhas React e um Worker da Cloudflare para a API                        |
| [0002](docs/adr/0002-dados-da-pessoa-so-no-aparelho.md)  | Dados da pessoa só no aparelho, em IndexedDB com migração versionada                       |
| [0003](docs/adr/0003-fontes-e-registro-de-precos.md)     | Fontes de preço do MVP e como cada preço é guardado                                        |
| [0004](docs/adr/0004-assistente-pelo-servidor.md)        | Assistente pelo servidor, com código de acesso e cota no D1                                |
| [0005](docs/adr/0005-mercados-localizacao-e-mapa.md)     | Mercados do OpenStreetMap em células, localização pedida com explicação e mapa sob demanda |
| [0006](docs/adr/0006-comparacao-da-lista.md)             | Como o app compara a lista entre os mercados                                               |
| [0007](docs/adr/0007-demonstracao-e-uso-sem-internet.md) | Demonstração com dados fictícios e uso sem internet                                        |
| [0008](docs/adr/0008-conferencia-do-site-no-ar.md)       | Conferência agendada do site no ar                                                         |
| [0009](docs/adr/0009-identidade-visual-e-fontes.md)      | Identidade visual "Feira" e fontes próprias (proposto)                                     |

## Qualidade

O código entra por PR, com cada critério de aceite ligado a um teste (`spec 0001 CA-NN`), cobertura mínima de 80%, testes de ponta a ponta com Playwright no celular e no computador, acessibilidade WCAG 2.2 AA conferida com axe nos dois temas de cor, CSP sem `unsafe-inline`, CodeQL e revisão de dependências. Todo dia, a mesma suíte de ponta a ponta roda contra o site publicado e abre uma issue quando falha ([ADR-0008](docs/adr/0008-conferencia-do-site-no-ar.md)).

## Licença e créditos

- Código sob [MIT](LICENSE).
- Mercados e cidades: dados © [colaboradores do OpenStreetMap](https://www.openstreetmap.org/copyright), sob a licença ODbL.
- Mapa: estilo e quadros do [OpenFreeMap](https://openfreemap.org), com dados do [OpenMapTiles](https://openmaptiles.org) e do OpenStreetMap.
- Bibliotecas que vão para o navegador ou para o Worker: [Astro](https://astro.build) e [React](https://react.dev) (MIT), [MapLibre GL JS](https://maplibre.org) (BSD-3-Clause), [jsQR](https://github.com/cozmo/jsQR) (Apache-2.0) e o [SDK da Anthropic](https://github.com/anthropics/anthropic-sdk-typescript) (Apache-2.0). O assistente usa o Claude, da Anthropic.
- Waze, Google Maps, Claude e os nomes de redes de mercado são marcas de seus donos e ficam fora da licença. A demonstração usa nomes, marcas e preços inventados.
