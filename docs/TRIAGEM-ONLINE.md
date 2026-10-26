# Triagem online antes da distribuição

Atualização do backend de 26/10/2026 para o coletor AF já instalado nas versões 6.9.0–6.11.0. Não instala código no navegador e não exige outro ZIP. O cliente continua na versão 6.11.0.

## Fluxo

1. A primeira observação registra o pedido e uma janela mínima de dez segundos pelo relógio do banco. Chamadas repetidas não reiniciam esse prazo.
2. A consulta de detalhe ocorre depois da janela, com prioridade para pedidos novos ainda sem analista. O lote é de dois detalhes e cada comprovante pertence à instalação, com reserva por 45 segundos.
3. O alocador recebe somente candidatos presentes na leitura enviada pelo painel e com consulta posterior à janela, válida por trinta segundos. Uma confirmação de pendência também pode alimentar o pool de recuperação existente.
4. Aprovação automática comprovada é contabilizada uma vez como automática. Autorização sem prova de origem e cancelamento ficam fora da distribuição. Nome reservado, ON, capacidade, Força de Vendas, rotas e retenções continuam sujeitos às regras existentes.

O prazo de dez segundos é mínimo, não promessa de entrega exata: cadência do coletor, autenticação, lote e tempo de resposta do AF também influenciam. É necessário manter uma aba AF autenticada e um cliente com captura/conciliação ativo.

## Compatibilidade e limites da evidência

O leitor instalado reconhece o automático pela decisão **Pedido autorizado** com a nota explícita de aprovação automática do próprio pedido. Ele não transmite o autor da decisão nem a nota original de uma autorização sem esse marcador. O estado legado `autorizado_manual` significa autorização sem a prova automática reconhecida; isoladamente, não comprova autoria humana.

Se o AF não apresenta histórico de decisão, o leitor antigo devolve `indisponivel`. Para não paralisar pedidos pendentes nesse formato, a triagem permite atendimento quando o ID continua na leitura atual e houve tentativa de consulta depois da janela. Esse caminho não transforma falta de informação, rapidez, recomendação ou desaparecimento em aprovação automática. O pool de recuperação de pedidos ausentes continua exigindo confirmação explícita de análise.

Uma decisão final já recebida não é substituída por `indisponivel` ou `pendente` numa consulta posterior. Autorizações sem origem recebem até três consultas para eventual confirmação automática posterior. Não há garantia de impedir toda atribuição breve: o AF pode aprovar depois da última leitura, e um erro de consulta não revela sua decisão. Uma origem que o cliente não transmite não é inventada no banco.

## Liberação, auditoria e produção

Uma autorização confirmada depois da atribuição encerra os estados `em_andamento`, `reservado` ou `devolvido`, liberando a capacidade sem criar `concluiu_pedido`. O histórico informa **Aprovado no AF; origem a confirmar**. Contato e suporte não são removidos por essa autorização de origem desconhecida.

Automáticos comprovados usam o fluxo anterior: registro único, liberação de eventual atribuição e exclusão do crédito humano. Declarações humanas anteriores permanecem auditadas e podem ser reclassificadas quando surgir prova automática. A atualização não transforma em automáticos todos os registros antigos sem autor ou nota.

Autorizações sem origem e sem declaração humana não entram na lista recente de conclusões humanas nem criam crédito no ranking. O ID continua bloqueado contra nova distribuição. O RPC de relatório acrescenta `producao.aprovados_origem_pendente`, com quantidade, valor em centavos e valores desconhecidos. Esse campo adicional está disponível no contrato; o quadro/CSV das versões já instaladas não ganha uma seção nova sem atualização da interface. Registros sem conclusão continuam identificados na cobertura existente.

## Implementação e validação

`af_mobile.pedidos_capturados` recebe `triagem_ate`, `triagem_consultas` e `aprovacao_af_em`; um índice parcial apoia as consultas de origem pendente. `af_mobile.triar_candidatos` é invoker e tem EXECUTE revogado para os papéis de cliente. Os fluxos autenticados existentes chamam o helper sem expor uma nova RPC pública, configuração privilegiada ou credencial do AF.

A triagem atua no alocador global e na obtenção individual de pedido. Promoções de reservas/devoluções excluem decisões finais conhecidas. Um vínculo manual continua sendo uma intervenção explícita com sua autorização existente.

`tests/triagem-online.cjs` verifica PostgreSQL isolado com dados fictícios: prazo, consulta, classificação, capacidade, rotas, FV, ordem dos lotes, comprovantes exclusivos, falhas posteriores, limites de repetição, projeções, ranking, relatório, idempotência e permissões. A suíte existente permanece no comando principal. Não são necessários dados reais nem credenciais para executar os testes.
