# Captura, recuperação e origem da aprovação — 6.9.0

A inspeção autenticada do AF confirmou no histórico do próprio pedido uma tabela com os cabeçalhos **Status do Pedido**, **Nota** e **Criado por**. O evento **Pedido autorizado** com a nota **Aprovação Automática com status de análise APPROVE** é a evidência usada para classificar um automático. O autor pode conter um login: não é usado para transformar a aprovação em produção humana. A recomendação do motor e as notas do histórico de compras de outros pedidos não são evidência do resultado deste pedido.

## Captura e recuperação

`af-captura.js` monitora a tabela da lista por MutationObserver, incluindo linhas removidas antes da próxima amostragem, e faz uma amostragem adicional a cada cinco segundos. Funciona sem o painel lateral aberto. A varredura completa do painel também envia suas páginas. `af-captura-background.js` serializa a fila local persistente entre abas e tenta o envio novamente após falha de conexão. Trocas de equipe não transferem pendências entre contextos. Nenhuma credencial é transmitida à página.

O banco registra cada ID, mesmo sem analista livre. Cada instalação recebe até cinco consultas com comprovante temporário exclusivo, evitando que todas consultem o mesmo lote. A consulta de detalhe é somente leitura, no AF autenticado. Sessão expirada, HTML inesperado, ID divergente ou ausência de decisão mantêm a pendência. As consultas têm prazo, lote e intervalo entre tentativas.

Um pedido ausente da leitura periódica só é recuperado para distribuição após confirmar que tanto seu estado atual quanto sua última decisão continuam **Pedido em análise**. Essa confirmação vale por trinta segundos. A distribuição utiliza o mesmo alocador, com registro de nome, ON, capacidade, regras de Força de Vendas, exclusividade de lojas e retenções de contato/suporte.

## Conclusão e auditoria

A tabela privada `af_mobile.pedidos_capturados` tem RLS, acesso direto revogado e chave primária por pedido. Os RPCs públicos são invoker e chamam funções privadas definer com `search_path=''`, permissões explícitas e autenticação por `fila_ator`, mantendo o modelo da equipe existente.

A confirmação automática e a distribuição usam a mesma trava transacional. O registro muda para origem automática, libera eventual atribuição e cria um único evento **Pedido aprovado automático**. O vínculo anterior fica no histórico original e na descrição da reclassificação. Não há ação de aprovação, cancelamento ou alteração financeira no AF.

Triggers registram metadados e a primeira declaração humana de conclusão, inclusive de clientes anteriores. Uma confirmação automática posterior substitui o crédito de produção daquele mesmo ID. O histórico original não é apagado: a projeção mostra a conclusão anterior como reclassificada, e ranking e relatório excluem esse crédito humano. Repetições e resultados de consulta de outra instalação não criam novos créditos.

A migração importa conclusões anteriores como **declarações de analistas**, preservando datas e valores recuperáveis, sem presumir sua origem real. Pedidos com links recuperáveis entram na conciliação. Registros antigos sem link ou valor não são reconstruídos por suposição.

## Relatórios

Gestão > Relatório apresenta quantidade e valor dos IDs únicos no período: total da equipe, automáticos confirmados, conclusões humanas informadas e cada analista. O CSV inclui os mesmos totais e a escala. O filtro individual seleciona a linha do analista e seus dias; os totais da equipe permanecem identificados como globais. Períodos usam America/Fortaleza. Valores são guardados em centavos e valores ausentes são destacados, sem convertê-los em zero. Observados sem conclusão e declarações antigas ainda não conferidas ficam explícitos.

## Cobertura e atualização

A captura depende de uma aba autenticada do AF aberta e desta versão do coletor. Atualize os arquivos na mesma pasta, recarregue a extensão e as abas do AF. Configurações declarativas continuam online, mas novos scripts exigem essa atualização inicial. Pedidos que nunca foram renderizados numa aba monitorada nem obtidos pela varredura não podem ser garantidos por uma extensão; cobertura integral do AF exigiria uma API, exportação ou eventos oficiais.

A correção 6.8.3 permanece: um coletor identificado OFF pode distribuir para outros analistas ON; mudanças durante uma requisição provocam nova tentativa; a leitura completa distribui imediatamente e lotes respeitam o teto de mil pedidos.

## Verificação

`tests/conciliacao-af.cjs` usa HTML sintético e PostgreSQL isolado para decisão própria, reabertura, recomendação, autenticação, captura transitória, repetição, comprovante por instalação, recuperação, elegibilidade, reclassificação, ranking, relatório, fuso, valores desconhecidos e RLS. `tests/captura-background.cjs` cobre durabilidade, concorrência entre abas, reinício, troca de contexto e ausência de credenciais nas mensagens ao AF. Fixtures não contêm dados operacionais nem credenciais.
