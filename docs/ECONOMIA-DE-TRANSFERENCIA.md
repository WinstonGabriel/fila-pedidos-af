# Economia de transferência — 6.10.0

A inspeção encontrou mais de 124 mil respostas bem-sucedidas de `fila_estado` e 82 mil de `fila_avisos` numa janela de 24 horas. A sincronização anterior reenviava aproximadamente 103 KB de JSON por consulta, principalmente 252 atribuições concluídas. Esses números identificam um desperdício; o tamanho do JSON não equivale necessariamente ao tráfego faturado, que pode usar compressão e incluir outros serviços e projetos.

## Compatibilidade imediata no banco

`fila_estado` conserva todos os registros não concluídos, incluindo andamento, contato/suporte, reservas e devolvidos. Retorna somente oito conclusões humanas recentes, oito automáticos recentes e uma lista compacta de IDs concluídos. Clientes novos usam esses IDs na filtragem de candidatos. O alocador mantém a validação no servidor. Histórico original, registro de conclusões, ranking e relatórios não são excluídos ou truncados por esta migração.

No projeto inspecionado, a resposta de estado passou de aproximadamente 103.054 para 12.340 bytes de JSON, cerca de 88% menor naquela amostra. Essa parte já beneficia versões anteriores, sem alteração de permissões ou necessidade de reinstalação.

## Sincronização por blocos

O RPC público `fila_sincronizar` é invoker e delega a uma função definer privada em `af_mobile`, com `search_path=''`, grants explícitos e sem EXECUTE para PUBLIC. A autorização da equipe, instalação e coordenação é validada em cada chamada, mesmo quando os hashes forem iguais. Hashes não concedem acesso.

A função executa a rotina existente de encerramento de descanso, obtém o estado e a projeção existente de avisos, preservando a rotação de notificações para todos os analistas. Calcula um hash por bloco: estado, descansos e avisos. O cliente envia as versões já recebidas e o banco devolve somente os blocos alterados. O relógio fica fora do hash de descansos. Quando não há ON contínuo, a previsão de próxima pausa também depende do relógio e fica fora desse hash; entrar em ON altera os campos estáveis e atualiza a previsão. A elegibilidade permanece validada no servidor.

A consulta repetida sem alterações devolveu 218 bytes de JSON na medição, incluindo versões e relógio. Na primeira consulta, o exemplo medido teve 13.342 bytes. Não se promete uma porcentagem fixa da franquia mensal: mudanças reais, quantidade de usuários, notificações, outros serviços e versões ainda não atualizadas também influenciam o consumo.

## Compartilhamento na extensão

`sincronizacao-background.js` mantém uma única consulta em andamento por instalação, equipe, token e credencial de coordenação. Polls simultâneos de painéis e de avisos reaproveitam a consulta ou uma cópia válida por até cinco segundos. O estado e suas versões podem sobreviver ao reinício do service worker dentro da mesma sessão, em `chrome.storage.session`. Somente páginas internas da extensão podem solicitar o estado completo. Páginas do AF e outros sites continuam recebendo exclusivamente a projeção permitida de avisos.

A troca de equipe ou credencial invalida o contexto e descarta respostas atrasadas. Falhas de autorização não são convertidas em sucesso com dados antigos. Ações forçam uma consulta após qualquer requisição já em andamento. A cópia local conserva blocos não alterados e avança a estimativa do relógio sem reiniciar o contador de descanso.

A gestão usa os avisos recebidos na sincronização e deixa de fazer uma segunda consulta periódica própria. O worker publica a projeção apenas quando ela muda. Confirmações de leitura invalidam a cópia para buscar os indicadores atualizados.

A captura do AF permanece em cinco segundos, com MutationObserver para passagens rápidas. A sincronização do banco também usa cinco segundos e mantém atualização imediata depois de ações. Não foi contratado plano, desativada proteção de cobrança ou apagado consumo acumulado.

## Instalação e verificação

Atualize os arquivos na mesma pasta já instalada, recarregue a extensão e as abas do AF. Cada perfil de navegador continua sendo uma instalação independente; o compartilhamento não transfere dados entre pessoas ou computadores.

`tests/sincronizacao-banco.cjs` valida em PostgreSQL isolado a projeção compacta, preservação de ativos, ausência de perda de registros, blocos, autenticação, destinatários e permissões. `tests/sincronizacao-worker.cjs` cobre concorrência, TTL, relógio, atualização após ação, reinício, troca de contexto, falha de autorização e bloqueio de páginas web. Os testes usam dados fictícios. Os testes de distribuição, conciliação, notificações, temas e demais funcionalidades continuam na suíte principal.
