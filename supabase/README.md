# Correções do banco existente

Esta pasta não é um bootstrap. As migrações dependem da infraestrutura da fila já implantada e recusam definições incompatíveis.

Referência do cliente: **6.11.2**, revisão documental de 26/10/2026. Os [dados e regras compartilhados](../docs/DADOS-COMPARTILHADOS.md) e os [contratos RPC](../docs/BANCO-E-RPCS.md) consolidam o uso atual. O efeito visual 6.11.0 não acrescenta migration.

`20261026205118_pausa_20min_notificacao.sql` identifica novos eventos de status com `pausa_20min` quando existe um descanso ativo. O status interno continua `intervalo`; o cliente 6.11.2 apresenta **Pausa 20min** no balão e na central. Não altera registros anteriores, duração, limites, permissões ou devolução de pedidos. O novo rótulo exige atualizar os arquivos da extensão; esta revisão não gerou ZIP.

As cinco migrations `20261026193505_feriados_tooltip_estrutura.sql` a `20261026193514_feriados_tooltip_consulta.sql` implantam a [referência de feriados na escala](../docs/FERIADOS-NA-ESCALA.md): estrutura privada, dados oficiais, helpers, limpeza no salvamento e ativação da consulta. Aplique na ordem dos arquivos. A referência é virtual, não grava folgas ou horários e não exige outro ZIP.

As nove migrations `20261026185310_triagem_online_estrutura.sql` a `20261026185644_triagem_online_pedidos.sql` implantam a [triagem online](../docs/TRIAGEM-ONLINE.md), na ordem dos arquivos: estrutura, helper privado, consultas, conciliação, estado, relatório, histórico, obtenção individual e ativação no alocador global. A versão dos arquivos da extensão permanece 6.11.0, sem outro ZIP. Use todas as etapas em desenvolvimento ao reproduzir a atualização.

`20261025175646_distribuicao_por_leitor_identificado.sql` permite que um coletor identificado OFF solicite a distribuição global. O alocador continua escolhendo somente destinatários ON, registrados e elegíveis. O patch remove somente a condição antiga sobre o coletor, preserva a validação do ator e os grants, e pode ser reaplicado sem duplicar alterações. Não altera pedidos, histórico, classificações ou dados de gestão.

Os testes de `tests/distribuicao-leitor.cjs` executam a reprodução anterior e a correção em PostgreSQL isolado, com dados fictícios. Não execute os fixtures contra produção.

`20261025183807_captura_e_conciliacao_af.sql` acrescenta o registro privado de observações e conclusões, consultas exclusivas por instalação, conciliação explícita no histórico do AF e relatório de quantidades/valores. Preserva a auditoria original e as declarações anteriores; não infere automáticos de desaparecimento ou recomendação. Os patches dos RPCs existentes recusam definições incompatíveis. Veja [Captura e aprovação automática](../docs/CAPTURA-E-APROVACAO-AUTOMATICA.md) e os testes isolados de conciliação antes de reutilizar esta migração.

`20261026025317_sincronizacao_economica.sql` compacta a resposta de `fila_estado` sem excluir o histórico e cria `fila_sincronizar`, que valida o ator a cada consulta e envia apenas blocos alterados. O teste isolado de banco verifica a compatibilidade com clientes anteriores e as permissões.

`20261026031910_liberar_nomes_meia_noite.sql` libera diariamente as reservas de nome às 00:00 de São Luís (03:00 GMT), com execução única por data, auditoria e proteção de escolhas feitas após a virada. Preserva pedidos, status, escalas e cadastros. A ativação não libera nomes imediatamente. Veja [Liberação diária](../docs/LIBERACAO-DIARIA.md).
