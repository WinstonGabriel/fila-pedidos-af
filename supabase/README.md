# Correções do banco existente

Esta pasta não é um bootstrap. As migrações dependem da infraestrutura da fila já implantada e recusam definições incompatíveis.

`20261025175646_distribuicao_por_leitor_identificado.sql` permite que um coletor identificado OFF solicite a distribuição global. O alocador continua escolhendo somente destinatários ON, registrados e elegíveis. O patch remove somente a condição antiga sobre o coletor, preserva a validação do ator e os grants, e pode ser reaplicado sem duplicar alterações. Não altera pedidos, histórico, classificações ou dados de gestão.

Os testes de `tests/distribuicao-leitor.cjs` executam a reprodução anterior e a correção em PostgreSQL isolado, com dados fictícios. Não execute os fixtures contra produção.
