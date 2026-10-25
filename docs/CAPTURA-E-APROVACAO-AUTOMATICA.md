# Distribuição e origem da aprovação

## Correção 6.8.3

A inspeção identificou limitações que podem deixar pedidos sem distribuição: a máquina que coleta precisava estar ON mesmo havendo outros analistas livres; uma lista nova recebida durante uma distribuição em andamento não disparava outra tentativa imediata; o fim da leitura completa aguardava o próximo ciclo; o lote cortava novos candidatos em 500 apesar de o servidor aceitar 1.000. A correção remove esses pontos sem alterar elegibilidade, preferência, exclusividade de lojas, retenções ou limite de um pedido por analista.

Sem um ID e a leitura correspondente, essas limitações não comprovam retrospectivamente a causa de um caso específico. O banco anterior guarda atribuições e ações, mas não um registro completo de cada pedido visto e não atribuído pela coleta. Portanto, não permite reconstruir com segurança todos os pedidos que passaram rapidamente pelo painel.

A mensagem que atribuía trabalho a um analista apenas porque o pedido desapareceu foi corrigida para “conclusão e origem da saída a confirmar”. Distribuição, recomendação `approve`, desaparecimento e aprovação final são fatos diferentes. O ID do pedido deve ser a unidade de contagem.

## Conciliação de aprovação automática — pendente de fonte do AF

Para automatizar esse registro, é necessário identificar no detalhe/histórico do AF a decisão final, sua origem (sistema ou operador) e seu momento. A tela de análise ou a recomendação do motor, isoladamente, não comprova aprovação final nem seu autor. O mapeamento da origem no histórico do AF ainda precisa ser validado numa sessão autenticada.

O desenho proposto após validar a fonte é:

1. Registrar os pedidos observados, inclusive enquanto não houver analista disponível, sem deduplicar por horário.
2. Capturar mudanças da tabela entre leituras para registrar passagens rápidas; as consultas completas continuam necessárias para outras páginas.
3. Ao detectar saída, consultar o estado final do mesmo ID no AF. Falha de leitura, filtro, paginação e saída sem origem confirmada ficam pendentes de conciliação.
4. Quando o AF confirmar aprovação do sistema, registrar “Pedido aprovado automático” no histórico, mesmo se o pedido havia sido distribuído. Guardar a atribuição anterior para auditoria, sem somar à produção desse analista, e liberar sua próxima tarefa de forma transacional.
5. Manter cancelamentos, recusas e saídas não confirmadas separados de aprovações. Uma retomada da fila ou classificação posterior precisa atualizar o mesmo ID, não criar outra conclusão.

## Relatório pretendido

| Grupo | Quantidade | Valor |
|---|---|---|
| Aprovações automáticas confirmadas | IDs únicos confirmados pelo AF | Valor dos mesmos IDs |
| Produção de cada analista | IDs com conclusão humana confirmada | Valor dos mesmos IDs, por analista |
| Total conciliado | União sem duplicações dos grupos anteriores | Soma dos mesmos pedidos |
| Pendentes de conciliação | IDs observados sem decisão/origem suficiente | Valor conhecido, com indicação dos valores ausentes |

O período deve usar America/Fortaleza e o momento da conclusão confirmada, com filtro de analista e exportação. Não atribuir valor zero a um valor desconhecido. O total deve declarar a cobertura da captura: uma extensão não observa pedidos enquanto não há coleta ativa; para garantir o total integral do AF, a origem precisa ser uma API, exportação ou integração de eventos do próprio AF. Dados anteriores só podem ser conciliados quando houver evidência recuperável na fonte.
