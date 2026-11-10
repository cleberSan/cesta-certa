# Política de segurança

## Reportar uma vulnerabilidade

Não abra issue pública para vulnerabilidades. Use o [reporte privado de vulnerabilidades do GitHub](https://github.com/cleberSan/cesta-certa/security/advisories/new). O retorno inicial acontece em até 5 dias úteis.

## Práticas adotadas

- Segredos nunca são versionados; ficam em GitHub secrets ou no cofre do provedor.
- Análise estática com CodeQL, revisão de dependências em todo PR e atualizações semanais via Dependabot entram com o primeiro PR de código (tarefa T01 da [spec 0001](docs/specs/0001-mvp-compra-do-mes/tarefas.md)).
- Nenhum dado pessoal real em código, testes, issues ou PRs.
