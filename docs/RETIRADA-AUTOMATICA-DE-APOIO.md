# Retirada automática de contato e suporte — 6.13.0

Quando um pedido retido em **Para contato** ou **Para suporte** deixa a lista AF, a extensão o retira dessas áreas após uma leitura completa e sem filtros. Um detalhe AF confirmado como autorizado ou cancelado também encerra a retenção. O analista não precisa clicar em Remover. A sincronização propaga a retirada para as demais instalações.

O arquivamento mantém os dados e o histórico. A ação de auditoria é `retirou_apoio_saida_af`; não cria `concluiu_pedido`, não determina a autoria da decisão no AF e não acrescenta crédito de produção humana. O registro deixa de aparecer também entre as oito conclusões humanas recentes. A identificação de aprovação automática continua dependendo da evidência específica já exigida pelo coletor.

## Confirmação da saída

A leitura precisa estar atual, ter concluído todas as páginas, vir da raiz `https://af.mateusmais.com.br/` sem filtros e apresentar a mesma quantidade de IDs únicos que o menu de pedidos em análise. Uma leitura da tela pode confirmar a saída quando existe apenas uma página e a contagem coincide. A extensão usa o resultado dessa leitura, sem misturar páginas antigas ou cache. O envio contém somente os IDs de apoio afetados e as contagens, sem reenviar a lista inteira.

Filtros na URL, pesquisa local identificada, data selecionada, carregamento incompleto, falta de sessão, falha de rede, duplicidade de IDs ou divergência de contagem preservam a retenção. O servidor exige equipe e identidade válidas, contexto exato, confirmação de completude, IDs válidos e início da leitura recente. A janela é de até quatro minutos, com tolerância de cinco segundos no futuro para relógios. Usa-se a diferença de horário do servidor. Retenções alteradas depois do início da leitura, com margem de dois segundos, aguardam uma próxima consulta.

## Persistência e concorrência

`public.fila_atribuicoes.apoio_saida_af_em` marca o arquivamento operacional. O registro assume `status=concluido` para encerrar a tarefa, mas esse estado interno não constitui uma conclusão do analista. A mesma trava `(802153,530)` da distribuição protege as alterações. Repetir o pedido é idempotente e não duplica a auditoria. O ID permanece ocupado, evitando redistribuição de uma lista antiga. A limpeza amostrada de conclusões antigas preserva esses marcadores.

`fila_estado` omite os registros arquivados da lista visível e informa `apoio_encerrados_ids`. Uma leitura posterior que realmente encontre um desses IDs pode restaurar sua retenção original em contato/suporte, desde que comece depois do arquivamento e não haja origem ou decisão final confirmada. Uma resposta antiga não restaura o pedido. Uma intervenção explícita pelas rotinas autorizadas que reabra a tarefa limpa o marcador anterior.

A RPC pública `fila_apoio_sincronizar_saida` é `SECURITY INVOKER` e delega ao helper privado autenticado com `search_path=''`. Não concede acesso direto às tabelas. A conciliação existente conserva os comprovantes por instalação e suas validações de autorização, aprovação automática e pendência. Cancelamento encerra apoio quando seu estado atual confirma o cancelamento. A implantação também retira retenções com decisão final já comprovada no estado AF persistido; não presume ausência para os demais registros.

## Ativação e validação

As regras e o filtro compartilhado ficam no servidor. Para enviar a confirmação de ausência pela leitura completa, atualize os arquivos da extensão para 6.13.0, recarregue a instalação existente e as abas AF. A retirada ocorre na leitura válida seguinte, acompanhando a cadência da tela de uma página ou a varredura completa existente em filas paginadas. Não exige mudança de permissões do navegador.

`tests/retirada-apoio.cjs` executa a migração e as rotinas reais em PostgreSQL isolado. Verifica contato e suporte, preservação de análise, paginação/filtros/contagem, tempo e concorrência de marcação, repetição, auditoria sem produção, restauração, decisões comprovadas, limpeza de registros antigos, autenticação, RLS e a interface sem intervenção manual. Os testes usam dados fictícios e não acessam produção.
