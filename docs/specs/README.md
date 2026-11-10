# Specs

Especificações das mudanças do cesta-certa (Spec-Driven Development): o que cada mudança deve fazer e por quê, escrito antes do código. Decisões de arquitetura continuam em [docs/adr](../adr).

## Quando

| Nível | Quando | Artefatos |
|---|---|---|
| Direto | Atualização de dependência, texto, documentação, refatoração sem mudança de comportamento, bug com causa clara (o teste de regressão é a spec) | Só o PR |
| Leve | Comportamento novo ou alterado, pequeno, sem nenhum gatilho do completo | `spec.md` com plano e tarefas curtos |
| Completo | Contrato público (rota, evento, schema, URL), dado pessoal ou segurança, mais de um repositório ou PR, dependência ou serviço novo | `spec.md`, `plano.md`, `tarefas.md`; implementação só depois de a spec ser aprovada |

## Como

1. Pasta `NNNN-titulo-em-kebab-case/` com o próximo número livre, nunca reaproveitado.
2. `spec.md`: problema, fora de escopo, critérios de aceite `CA-NN` verificáveis, requisitos não funcionais e perguntas abertas.
3. Cada teste que prova um critério leva o comentário `spec NNNN CA-NN` logo acima.
4. O PR linka a spec e mostra a tabela critério → teste. Ao concluir, o status vira `implementada`; depois disso a spec não é reescrita, e comportamento novo ganha spec nova.

Modelos e processo completo: [claude-works](https://github.com/cleberSan/claude-works/blob/main/memorias/spec-driven-development.md).
