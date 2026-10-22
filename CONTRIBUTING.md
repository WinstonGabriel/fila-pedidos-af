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

## Revisão

O mantenedor pode solicitar ajustes no pull request. A proposta só integra a versão principal depois de ser aceita. O fluxo automatizado verifica os testes locais com dados simulados, sem credenciais de produção.
