# Banco de dados e contratos RPC — 6.8.1

## Escopo das definições

O cliente usa PostgREST em `/rest/v1/rpc/<funcao>`, por POST JSON, com a chave pública de API nos cabeçalhos e credenciais de equipe/instalação no corpo. `popup.js:rpc()` acrescenta `p_codigo`, `p_token` e `p_coord`; `p_coord` recebe a sessão de gestão ou credencial compatível. O worker de avisos/efeitos usa o mesmo padrão com `p_coord=null`.

**Esta é uma referência dos contratos usados pelo cliente e dos SQLs presentes, não uma especificação completa reconstruída do banco de produção.** Não foram consultados ou exportados dados operacionais para esta revisão documental. Para funções ausentes do pacote, confira a definição autorizada no ambiente de desenvolvimento antes de alterar parâmetros ou permissões.

## Modelo lógico

| Objeto | Papel e campos relevantes |
|---|---|
| `public.fila_analistas` | Nome, disponibilidade, horários e atividade; descanso acrescenta `descanso_ate` e `descanso_on_desde` |
| `public.fila_usuarios` | Reserva exclusiva de nome por token da instalação |
| `public.fila_atribuicoes` | Pedido, analista, status, detalhes e datas; `destino_apoio` separa contato/suporte |
| `public.fila_config` | Configurações compartilhadas e documentos declarativos por chave |
| `public.fila_historico` | Eventos originais: ID, momento, ator, coordenação, ação, analista, pedido e detalhe |
| `af_mobile.descansos` | Pausas por analista/dia/número, início e fim; chave composta e limite 1–2 |
| `af_mobile.historico_exibicao` | View privada de apresentação, sem regravar a auditoria original |
| Objetos intermediários de gestão/escala/avisos | Dependências do backend implantado; suas definições completas não estão no repositório |

O schema `af_mobile` contém funções privadas usadas pela extensão. A existência desse schema não concede ao cliente acesso livre a todos os seus objetos.

## Identidade, autorização e concorrência

`fila_check`, `fila_ator` e `fila_autoriza` são dependências fundamentais. Validam equipe, instalação/nome e permissão sobre o alvo. A chave pública `anon` não é, isoladamente, autorização para operar a fila.

As mutações recentes de distribuição, suporte e descanso usam `pg_advisory_xact_lock(802153,530)` para serializar alterações compartilhadas. A reserva de nomes usa `(802153,510)`. Há bloqueios de linha onde necessário. Travas locais da interface reduzem cliques duplicados, mas a correção depende das transações no banco.

Novas entradas públicas de descanso, suporte e efeitos são wrappers `SECURITY INVOKER` de funções privadas `SECURITY DEFINER` com `search_path=''`. Mantenha grants mínimos; não exponha tabelas ou funções auxiliares diretamente para substituir uma RPC que esteja falhando.

## Inventário de RPCs usadas pelo cliente

Os argumentos abaixo são **adicionais** aos três argumentos comuns. Parâmetros e retornos não listados devem ser confirmados na definição implantada.

| RPC | Argumentos do fluxo atual | Finalidade |
|---|---|---|
| `fila_estado` | — | Estado compartilhado, usuários, atribuições, configuração e dados de gestão disponíveis |
| `fila_escolher_nome` / `fila_liberar_nome` | `p_nome` | Reservar ou liberar a identidade |
| `fila_distribuir_auto` | `p_candidatos` | Solicitar distribuição transacional |
| `fila_puxar` | `p_analista`, `p_candidatos` | Solicitar pedido para o alvo autorizado |
| `fila_avancar` | `p_analista`, `p_pedido_id`, `p_acao`, `p_candidatos` | Concluir, liberar ou reter para contato com ID esperado |
| `fila_anexar` | `p_analista`, `p_pedido` | Vincular pedido reconhecido |
| `fila_devolver` | `p_id` | Remover retenção/reserva com autorização correspondente |
| `fila_liberar` | `p_analista` | Devolver pedido no fluxo de desligamento |
| `fila_set_analista` | `p_nome`, `p_ligado`, `p_inicio`, `p_fim` | Compatibilidade dos controles de disponibilidade |
| `fila_set_janela` | `p_inicio`, `p_duracao`, `p_auto` | Configurar divisão por faixa de horário |
| `fila_set_pref` | `p_lista` como JSON textual | Preferências compartilhadas da fila |
| `fila_zerar` | — | Operação de reinício da fila, sujeita à autorização existente |
| `fila_historico_pagina` | `p_limite`, `p_analista`, `p_antes`, `p_acao`, `p_pedido` | Histórico por cursor e ranking quando retornado |
| `fila_temas_catalogo` | — | Catálogo autenticado de aparência |
| `fila_descanso` | `p_nome`, `p_iniciar`; padrões nulo/false | Consultar estado ou iniciar a própria pausa |
| `fila_suporte` | `p_nome`, `p_pedido`, `p_remover`, `p_candidatos` | Marcar/remover suporte compartilhado |
| `fila_pedido_efeito` | — | Pedido ativo/evento da própria identidade e configuração de efeitos |
| `fila_gestao_entrar` | `p_pin`, `p_perfil`, `p_responsavel`; coord nulo | Criar sessão de gestão |
| `fila_gestao_sair` / `fila_gestao_pin` | — / `p_pin` | Encerrar sessão / alterar PIN conforme autorização |
| `fila_mudar_status` | `p_nome`, `p_atividade`, `p_inicio`, `p_fim` | Alterar atividade operacional |
| `fila_rota_salvar` | `p_loja`, `p_analista`, `p_versao` | Criar/alterar/remover direcionamento |
| `fila_preferencia_salvar` | `p_analista`, `p_lojas` | Preferências individuais de lojas |
| `fila_gestao_vincular` | `p_analista`, `p_pedido`, `p_transferir` | Vínculo/transferência administrativa |
| `fila_escala_consultar` | `p_inicio`, `p_fim`, `p_analista` | Consultar escala |
| `fila_escala_salvar` | `p_itens`, `p_origem` | Edição/importação com versões por registro |
| `fila_gestao_relatorio` | `p_inicio`, `p_fim`, `p_analista` | Relatório de gestão |
| `fila_avisos` | `p_ultimo` quando aplicável | Consultar avisos do contexto autenticado |
| `fila_aviso_confirmar` | `p_ids` | Confirmar leitura individual |

`fila_log` é auxiliar interna, não uma API a ser usada pelo cliente. Seu detalhe é texto. Não transmita uma assinatura inventada porque um documento antigo apresentou formato diferente.

## Contratos recentes

### Suporte

`fila_suporte(p_codigo text, p_token text, p_coord text, p_nome text, p_pedido text, p_remover boolean=false, p_candidatos jsonb=[])` delega para `af_mobile.suporte_exec`.

Valida o ator e o pedido, aceita no máximo 1.000 candidatos e mantém retenção em `status='contato'`. A marcação grava `destino_apoio='suporte'` e evento de auditoria; remoção explícita registra a saída e disponibiliza o pedido novamente. Uma solicitação já superada pode retornar `ja_processado=true`. A operação não concede permissão geral para concluir o trabalho de outro analista.

### Descanso

`fila_descanso(p_codigo text, p_token text, p_coord text=null, p_nome text=null, p_iniciar boolean=false)` delega para `af_mobile.descanso_executar`.

O retorno usado pela interface contém `servidor_em` e mapa `analistas`, com `usados`, `ate`, `on_desde`, `proximo_em`. A UI calcula diferença entre relógio do servidor e navegador para o contador. A regra diária usa `America/Fortaleza`; horário visual e data local de outras telas podem depender do navegador.

O início exige identidade real igual ao alvo, ON, ausência de pedido e limite diário. Uma segunda pausa exige ON contínuo após o fim anterior; mudar o dia não permite emendar pausas. O trigger `af_mobile.descanso_proteger` protege atualizações feitas por diferentes clientes. `af_mobile.descanso_encerrar()` encerra as pausas vencidas; o agendamento periódico é dependência operacional e deve ser verificado separadamente da existência da função.

### Histórico

A view privada `af_mobile.historico_exibicao` acrescenta `ator_tecnico`, `modalidade` e `origem_liberacao`. Para recebimento, só relaciona outro analista quando o evento anterior do **mesmo pedido**, ordenado por ID, é `liberou_pedido`. O índice parcial `fila_historico_pedido_id_idx` apoia a busca. Eventos originais não são regravados; filtros usam a projeção corrigida, enquanto contagem de conclusões preserva sua origem auditada.

### Efeito de pedido

`fila_pedido_efeito(p_codigo text, p_token text, p_coord text=null)` delega para `af_mobile.pedido_efeito`. A identidade é a vinculada ao token; uma sessão de gestão não permite observar efeitos pessoais de outro analista. O cliente usa `nome`, `pedido.id`, `pedido.evento_id`, `pedido.quando`, `servidor_em` e `config`.

## Migrações e compatibilidade

| Arquivo | Conteúdo | Dependência/cuidado |
|---|---|---|
| `banco-5.3.1.sql` | Reserva, atribuições e histórico da base histórica | Atualiza banco existente; pode substituir funções mais recentes |
| `updates/catalogo-temas.sql` | Consulta e catálogo inicial | Preserva catálogo já existente; revisar funções/grants |
| `updates/fullmetal-6.3.sql` | Dados/estilo Fullmetal | Revisão de catálogo e compatibilidade do cliente |
| `updates/descanso.sql` | Tabela, campos, trigger e RPC de pausa | Schema privado, pg_cron e funções de autorização já existentes |
| `updates/temas-6.4.sql` | LoL/Fluminense | Atualização de dados, não motor CSS remoto |
| `updates/temas-6.5.sql` | Nuvens | Requer renderer local correspondente |
| `updates/historico-6.6.sql` | View de apresentação e patch das leituras | Depende das assinaturas e trechos atuais das funções |
| `updates/efeito-pedido-6.7.sql` | Consulta privada de evento e configuração | Backend AF existente e schema privado |
| `updates/suporte.sql` | Destino de retenção, RPC e patches de histórico/alocador | Inspecionar definições atuais antes de aplicar |

Não execute a pasta em lote nem use o SQL 5.3.1 para “atualizar tudo”. Os patches por `pg_get_functiondef` dependem de trechos específicos e podem recusar versões divergentes. Prepare backup e ambiente de desenvolvimento, compare definições, revise dependências, aplique somente a migração necessária e teste a operação e os grants. Rollback de código e rollback de dados são trabalhos distintos: não apague descansos, histórico ou retenções para voltar uma interface.

Os testes SQL em `database/tests/` usam transações e `ROLLBACK`, mas alteram dados durante a execução. Devem rodar somente em banco de desenvolvimento, fora do CI público.
