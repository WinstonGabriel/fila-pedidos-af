# Correções do banco existente

Esta pasta não é um bootstrap. As migrações dependem da infraestrutura da fila já implantada e recusam definições incompatíveis.

`20261025175646_distribuicao_por_leitor_identificado.sql` permite que um coletor identificado OFF solicite a distribuição global. O alocador continua escolhendo somente destinatários ON, registrados e elegíveis. O patch remove somente a condição antiga sobre o coletor, preserva a validação do ator e os grants, e pode ser reaplicado sem duplicar alterações. Não altera pedidos, histórico, classificações ou dados de gestão.

Os testes de `tests/distribuicao-leitor.cjs` executam a reprodução anterior e a correção em PostgreSQL isolado, com dados fictícios. Não execute os fixtures contra produção.

`20261025183807_captura_e_conciliacao_af.sql` acrescenta o registro privado de observações e conclusões, consultas exclusivas por instalação, conciliação explícita no histórico do AF e relatório de quantidades/valores. Preserva a auditoria original e as declarações anteriores; não infere automáticos de desaparecimento ou recomendação. Os patches dos RPCs existentes recusam definições incompatíveis. Veja `docs/CAPTURA-E-APROVACAO-AUTOMATICA.md` e os testes isolados de conciliação antes de reutilizar esta migração.

`20261026025317_sincronizacao_economica.sql` compacta a resposta de `fila_estado` sem excluir o histórico e cria `fila_sincronizar`, que valida o ator a cada consulta e envia apenas blocos alterados. O teste isolado de banco verifica a compatibilidade com clientes anteriores e as permissões.
