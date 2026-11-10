# Política de segurança

## Reportar uma vulnerabilidade

Não abra issue pública para vulnerabilidades. Use o [reporte privado de vulnerabilidades do GitHub](https://github.com/cleberSan/cesta-certa/security/advisories/new). O retorno inicial acontece em até 5 dias úteis.

## Práticas adotadas

- Segredos nunca são versionados; ficam em GitHub secrets ou no cofre do provedor.
- Análise estática com CodeQL e revisão de dependências em todo PR; atualizações semanais via Dependabot, com espera de 7 dias depois da publicação de cada versão.
- O servidor só consulta os endereços oficiais de nota fiscal de uma lista fixa, monta ele mesmo o endereço que vai buscar e limita tempo, tamanho e redirecionamentos ([ADR-0001](docs/adr/0001-pilha-e-hospedagem.md), `worker/nfce/`).
- Cabeçalhos de segurança e CSP por hash definidos em um só lugar (`src/config/security.ts`) e conferidos nos testes E2E.
- Logs só com metadados técnicos: nunca o link da nota, o conteúdo da página, CNPJ, CPF ou texto digitado.
- Nenhum dado pessoal real em código, testes, issues ou PRs.
