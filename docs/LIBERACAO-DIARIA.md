# Liberação diária de nomes

A partir de 27/10/2026, as reservas de nome dos analistas são liberadas automaticamente todos os dias às **00:00 em America/Fortaleza**, horário de São Luís. O agendamento principal roda no próprio banco, inclusive com navegadores e extensões fechados. As instalações existentes recebem a lista de nomes livres na próxima sincronização, sem atualização dos arquivos.

A operação equivale a **liberar nome**: remove somente o vínculo de `fila_usuarios` e registra `liberou_nome` no histórico, com ator Sistema e motivo da liberação diária. Não exclui o cadastro de analistas, não altera ON/OFF, status, escala ou férias, não conclui/devolve pedidos e não encerra sessões de gestão. Ao voltar, o colaborador escolhe seu nome novamente em **Eu sou**.

## Execução e concorrência

O cron `af-liberar-nomes-meia-noite` executa `SELECT af_mobile.liberar_nomes_diario();` no horário `0 3 * * *`, pois o cron do projeto usa GMT. A rotina converte a data para America/Fortaleza e usa o mesmo bloqueio transacional da escolha/liberação manual de nomes. A configuração global do cron e os jobs dos outros aplicativos não mudam.

A tabela privada `af_mobile.liberacao_nomes_diaria` registra uma execução por data. Na ativação, o dia atual é marcado como ativação, com zero nomes liberados, para não desconectar quem já está trabalhando. Chamadas repetidas no mesmo dia não liberam de novo. Existe também uma execução externa de contingência da mesma rotina à meia-noite; o controle por dia impede duplicidade e não gera mensagens em caso de sucesso.

Somente reservas com `atualizado_em` anterior à meia-noite local são liberadas. Uma escolha explícita depois da virada é preservada mesmo se a execução tiver algum atraso. Exclusão do vínculo, auditoria e registro diário acontecem na mesma transação: uma falha desfaz o lote inteiro e permite nova tentativa.

## Acesso e verificação

A rotina fica em schema privado, é invoker, tem `search_path=''` e não concede EXECUTE a PUBLIC, anon, authenticated ou service_role. O proprietário do banco, também usuário do cron, é quem a executa. A tabela tem RLS e acesso direto revogado. Não há novo endpoint público, chave de serviço no cliente ou temporizador por instalação.

O teste `tests/liberacao-diaria.cjs` usa PostgreSQL isolado e dados fictícios para validar ativação sem liberação imediata, conversão de fuso, escolhas após 00:00, repetição, dia seguinte, preservação de pedidos/status/escala/gestão, rollback da auditoria e permissões. No PGlite, a extensão de cron é substituída por um agendador de teste apenas para validar o contrato do job; o agendamento real é conferido no banco após a migração.
