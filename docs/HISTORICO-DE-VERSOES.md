# Histórico de versões documentadas

Este histórico consolida as notas presentes no pacote; não inventaria cada versão intermediária que não possui nota própria. As versões abaixo descrevem código da extensão. Revisões do catálogo online são independentes.

| Versão | Mudança principal |
|---|---|
| 5.3.1 | Base histórica: extração/paginação, identidade exclusiva, histórico por cursor, distribuição, avanço por ID e contato compartilhado |
| 6.2.0 | Leitor do catálogo online; Dark Mode, Fullmetal Alchemist e Aurora, além dos sete temas originais |
| 6.3.0 | Ocultação por analista, descanso 20 min com regras de servidor e aperfeiçoamento industrial do Fullmetal |
| 6.4.0 | Nome AF Operação, ajustes do hover após refresh, LoL/Fluminense, tema por analista e nos avisos |
| 6.5.0 | Tema Nuvens, superfícies claras/escuras e controles arredondados |
| 6.5.1 | Desenhos locais de nuvens com volume 3D |
| 6.6.0 | Apresentação de recebimento automático e redistribuição comprovada sem regravar auditoria |
| 6.7.0 | Motor de animação pessoal, consumo único e parâmetros administrativos online |
| Suporte (incluído em 6.8+) | Lista Para suporte e ícone local, retenção compatível, remoção compartilhada e auditoria |
| 6.8.0 | Painel flutuante em outros sites autorizados, guard por aba/origem e permissão opcional |
| 6.8.1 | Oito retratos distintos de campeões no tema LoL, empacotados localmente |
| 6.8.2 | Imagem de Para suporte configurável online para a equipe, com validação de URL e alternativa local |
| 6.8.3 | Distribuição por leitor identificado, nova tentativa para listas recebidas em paralelo e mensagem de saída sem atribuição indevida de conclusão |
| 6.9.0 | Captura de passagens rápidas, recuperação confirmada no AF, classificação de automáticos e relatórios de quantidade/valor separados por origem |
| 6.10.0 | Resposta de estado compacta, sincronização por blocos e compartilhamento de consultas por instalação/contexto |
| 6.11.0 | Alquimia das Chamas de Roy Mustang no card próprio, com estalo local opcional, movimento reduzido e consumo único |
| 6.11.1 | Pino vermelho minimalista no canto da data de feriado; título com o nome, sem alterar a definição da escala |
| 6.11.2 | Notificações do descanso identificado mostram Pausa 20min; intervalo comum preservado |

## Revisão documental de 26/10/2026

A atualização online de [feriados na escala](FERIADOS-NA-ESCALA.md) acrescenta o nome ao passar o mouse nas células, preservando **Não definido** até o preenchimento da gestão. Usa somente feriados, sem pontos facultativos, e não exige novo ZIP nem altera a versão 6.11.0 do cliente. A revisão 6.11.1 do código acrescenta um pino no cabeçalho da data e exige atualizar os arquivos da instalação; foi publicada no Git sem gerar outro ZIP.

A atualização online de [triagem de pedidos](TRIAGEM-ONLINE.md) acrescenta espera mínima de dez segundos e verificação antes da atribuição, com bloqueio de autorizações conhecidas. Reutiliza os RPCs do coletor instalado, sem novo ZIP nem mudança da versão 6.11.0 do cliente. Aprovações sem origem comprovada não são presumidas automáticas.

Manuais, arquitetura, contratos, índice de testes e referência de dados compartilhados foram alinhados à versão 6.11.0. A leitura AF e a sincronização periódica usam 5 segundos como padrão. A lista de saídas informa a hora original do pedido e **Pedido concluído por:**; automáticos confirmados têm apresentação e contabilização próprias.

A atualização de banco `20261026031910_liberar_nomes_meia_noite.sql`, independente da versão instalada, programa a liberação diária das reservas de nome às 00:00 em America/Fortaleza, a partir de 27/10/2026. Preserva status, pedidos, escala e sessões de gestão. Veja [Liberação diária](LIBERACAO-DIARIA.md).

## Revisão documental de 24/10/2026

A documentação 6.8.1 foi ampliada a partir da arquitetura 5.3.1, com manual do analista, gestão, instalação/manutenção, contratos do banco, configuração online, segurança e testes. A arquitetura antiga continua preservada. A revisão documental não altera comportamento, manifesto ou dados do banco.

As notificações de equipe, gestão, escala e rotas também dependem de infraestrutura de versões intermediárias implantada fora do conjunto de migrations completo deste repositório. Não deduza uma ordem de instalação total apenas pela tabela acima.

Para o texto das notas originais, consulte `extension/ATUALIZACAO-6.3.txt` até `ATUALIZACAO-6.11.0.txt`, conforme os arquivos disponíveis. Notas antigas descrevem a entrega de seu momento; os manuais atuais resolvem diferenças de caminhos e limites da versão atual.
