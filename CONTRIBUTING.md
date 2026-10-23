# Como contribuir

1. Faça um fork e crie uma branch com um nome que descreva a mudança.
2. Trabalhe sobre os arquivos em `extension/` e utilize uma configuração local própria, quando precisar do navegador.
3. Rode `npm ci` e `npm test`.
4. Abra um pull request explicando o problema, o comportamento final e a validação realizada.

## Organização das mudanças

- Preserve a reserva exclusiva de nomes, a autoria do histórico e a confirmação pelo ID exato do pedido.
- Ao alterar contato, confira também as permissões de conclusão, devolução e reserva.
- Para mudanças nos seletores do AF, registre um exemplo fictício do HTML e teste a extração.
- Para mudanças nas RPCs, documente os parâmetros e a compatibilidade com clientes anteriores.
- Atualize o documento de arquitetura quando mudar o fluxo ou o contrato entre cliente e banco.

## Arquivos locais

`extension/config.js`, arquivos `.env`, dependências instaladas e pacotes ZIP são ignorados pelo Git. Nunca inclua códigos da equipe, tokens de instalações, chaves privilegiadas ou dados reais de pedidos em exemplos e relatos.

## Banco de dados

O SQL incluído depende de um esquema existente. Os testes em `database/tests/` utilizam dados temporários em transação e devem ser executados numa base de desenvolvimento. Eles não fazem parte de `npm test` nem do fluxo de CI.

## Commit

Este projeto adota o padrão **Conventional Commits**. Assim que o commit for registrado, o husky valida automaticamente a mensagem.

Formato da mensagem:

```
<tipo>(<escopo>): <descrição>

[corpo opcional]

[rodapé opcional]
```

### Tipos permitidos

| Tipo | Uso |
|---|---|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `docs` | Apenas documentação |
| `style` | Formatação, espaços em branco, ponto e vírgula etc. (sem alterar lógica) |
| `refactor` | Mudança interna que não corrige um bug nem adiciona funcionalidade |
| `test` | Adição ou ajuste de testes |
| `chore` | Tarefas de manutenção, build, dependências |
| `ci` | Alterações nas pipelines de integração contínua |
| `perf` | Mudança para melhorar o desempenho |

### Regras

- O **tipo** é obrigatório e deve estar em inglês minúsculo (`feat`, `fix`, ...).
- O **escopo** é opcional, separe com `:` e coloque em inglês, minúsculo, sem espaços.
- O **título** (subject) é obrigatório, em português imperativo, sem ponto final no final, com no máximo 100 caracteres.
- O **corpo** é opcional, em parágrafos.
- A **porta** (footer) pode conter references para issue, como `Fixes #123`.

### Exemplos

```bash
feat(sidebar): adiciona suporte ao Opera GX
fix(distribution): corrige lançamento duplo do mesmo pedido
docs(readme): atualiza instruções de instalação local
chore(deps): atualiza jsdom para 26.1.0
```

### Rejeitados

```bash
# Sem tipo
adiciona suporte ao Opera GX

# Tipo em maiúsculo
Feat: algo

# Com ponto final no título
feat: algo.

# Título longo (>100 caracteres)
```

## Revisão

## Revisão

O mantenedor pode solicitar ajustes no pull request. A proposta só integra a versão principal depois de ser aceita. O fluxo automatizado verifica os testes locais com dados simulados, sem credenciais de produção.
