# Como contribuir

1. Crie uma branch a partir de `main` (`feat/...`, `fix/...`, `chore/...`, `docs/...`).
2. Funcionalidade nova ou alterada começa por uma spec em `docs/specs/` ([quando e como](docs/specs/README.md)). No nível completo (rota pública, dado pessoal, segurança, dependência ou serviço novo), o código só vem depois de a spec ser aprovada.
3. Use [Conventional Commits](https://www.conventionalcommits.org/pt-br/), uma tarefa da spec por commit.
4. Abra um PR com o template, com o link para a spec e a tabela critério → teste; o CI precisa estar verde.
5. Decisões de arquitetura, segurança, dados ou operação entram como ADR em `docs/adr/`.

## Rodando localmente

Pré-requisito: Node.js 24 (ver `.nvmrc`).

```bash
npm ci
npm run dev            # http://localhost:4321, só as páginas (sem CSP e sem o Worker de /api)
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage  # Vitest, mínimo de 80% em linhas, branches, funções e statements
SITE_URL=http://127.0.0.1:8787 npm run build
npm run preview        # serve dist/ e o Worker de /api como a Cloudflare, em http://127.0.0.1:8787
npm run test:e2e       # sobe o preview e roda Playwright + axe (rode o build antes)
```

Os testes E2E esperam o build feito com `SITE_URL=http://127.0.0.1:8787`, o endereço do preview. Sem a variável, o build usa o endereço de produção (`productionSiteUrl` em `src/config/site.ts`).

Antes do primeiro `test:e2e`, instale o navegador com `npx playwright install chromium`. Se a máquina já tiver um Chromium compatível, aponte para ele com `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## Onde fica cada coisa

| Pasta                                        | O quê                                                                                                                                     |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/pages`, `src/layouts`, `src/components` | Páginas Astro, sem JavaScript por padrão                                                                                                  |
| `src/features/<fatia>`                       | Uma fatia por assunto (lista, mercados, preços, comparar, rota, assistente): ilha React em `.tsx` e as regras em `.ts`, com teste ao lado |
| `src/shared`                                 | O que mais de uma fatia usa, inclusive os contratos da API                                                                                |
| `src/config`                                 | Endereço do site e cabeçalhos de segurança (fonte única do `_headers` e da CSP)                                                           |
| `worker`                                     | Worker da Cloudflare que atende `/api/*`; o resto do site são arquivos estáticos                                                          |
| `e2e`                                        | Testes Playwright sobre o build                                                                                                           |

## Regras que os testes cobram

- Cada critério de aceite (`CA-NN`) tem um teste com o comentário `spec NNNN CA-NN` logo acima.
- Só dados sintéticos em código, testes e fixtures: nenhuma nota fiscal, CPF, nome ou endereço real.
- Dinheiro em centavos inteiros, nunca em ponto flutuante.
- Log sem conteúdo: nada de link de nota, HTML, CPF ou texto digitado pela pessoa.
- Segredo só no cofre do provedor (Cloudflare) ou nos secrets do GitHub, nunca no repositório.

## Publicação

O site é publicado na Cloudflare como um Worker com arquivos estáticos, pela integração da própria Cloudflare com o GitHub ([ADR-0001](docs/adr/0001-pilha-e-hospedagem.md)):

- Endereço: <https://cesta-certa.clebersan.workers.dev>.
- Merge no `main` publica em produção. PRs de outras branches ganham um link de prévia no check da Cloudflare.
- Para voltar uma versão, use **Deployments** no painel do Worker, ou reverta o PR.
- Os cabeçalhos HTTP das páginas vêm de `dist/_headers`, gerado no build a partir de `src/config/security.ts`; as respostas de `/api` levam os de `worker/http/respostas.ts`.

Configuração inicial, feita uma vez pelo dono do repositório:

1. Em **Settings → Branches** do GitHub, proteja o `main` exigindo PR, sem aprovação obrigatória (o autor não aprova o próprio PR), e os checks `Lint, tipos, testes e build`, `Revisão de dependências` e `CodeQL`, sem permitir bypass. A Cloudflare publica tudo que chega ao `main`, então é essa regra que garante que só código testado vai ao ar.
2. Em **Settings → Advanced Security**, ligue o gráfico de dependências, os alertas do Dependabot, o secret scanning com push protection e o reporte privado de vulnerabilidades.
3. No painel da Cloudflare, **Create app** → importar repositório do GitHub. No app da Cloudflare no GitHub, escolha **Only select repositories** e acrescente só `cesta-certa`.
4. Use o nome `cesta-certa` (o mesmo de `wrangler.jsonc`), build command `npm run build` e os comandos de deploy e prévia padrão. Deixe **Protect with Cloudflare Access** desligado: o site é público.
5. O build da Cloudflare não precisa de variável: o endereço fica em `productionSiteUrl` (`src/config/site.ts`), também para as prévias dos PRs. Uma `SITE_URL` no painel com valor diferente do código quebra o build de propósito.
6. Os segredos do assistente (tarefa T16 da spec 0001) são criados no painel do Worker, em **Settings → Variables and secrets**, como **Secret**. Nunca em arquivo, em chat ou em secret do GitHub.

Nenhum token da Cloudflare deve ser guardado no repositório nem nos secrets do GitHub.
