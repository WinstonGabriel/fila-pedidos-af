# Dados e estado compartilhados — AF Operação 6.12.2

Referência para manutenção e continuidade do projeto, revisada em 27/10/2026. O repositório `WinstonGabriel/fila-pedidos-af`, branch `main`, reúne o código, contratos, testes, catálogo de referência e migrations. A versão do cliente é 6.12.2 em `package.json`, `package-lock.json` e `extension/manifest.json`. O pino no cabeçalho de feriado existe desde a 6.11.1; instalações 6.11.0 conservam a referência online ao passar o mouse nas células até atualizarem seus arquivos. A 6.11.2 apresenta **Pausa 20min** nos avisos de descanso identificados pelo backend, preservando o rótulo do intervalo comum. A 6.11.3 acrescenta o visual LED dos seletores de status: ON verde neon, OFF vermelho e Intervalo amarelo. Essa apresentação é local e exige atualizar os arquivos instalados; não muda os valores de status nem os contratos compartilhados.

A 6.12.0 acrescenta preferências para folgar nos feriados. `af_mobile.feriado_preferencias` registra data, analista, posição e horário; a gestão recebe apenas as três primeiras solicitações por data. O prazo termina às 23h59 do terceiro dia anterior, no horário de São Luís. Os novos RPCs validam a identidade e não definem a escala. A interface exige atualizar os arquivos da extensão.

A 6.12.1 separa os manifestos por navegador: `extension/manifest.json` é o padrão Chrome e não inclui `sidebar_action`; `extension/manifest.opera.json` preserva a configuração de sidebar do Opera. O ZIP Chrome contém somente seu manifesto de instalação. Não há mudança de banco nesta revisão.

A 6.12.2 valida o ZIP operacional com `config.js` incluído e inicialização real dos scripts em VM isolada. O arquivo continua ignorado no Git e contém somente URL e chave pública anon do projeto, sem código de equipe, PIN ou token de instalação. Não há alteração no banco.

## Fontes e alcance

| Informação | Fonte e alcance |
|---|---|
| Pedidos e decisão antifraude | Lista e histórico autenticados do AF; a extensão consulta e organiza a fila |
| Reservas de nome, disponibilidade, atribuições e retenções | Banco compartilhado, com autorização e transações |
| Escala, rotas, preferências de loja e avisos | Backend da equipe; edição sujeita às permissões de gestão |
| Referência de feriados | Cadastro privado e cálculo anual no backend; anotação virtual na consulta, sem definir a escala |
| Conclusões e produção | Registro privado de captura/conciliação e auditoria; relatórios separam humanos de automáticos confirmados |
| Catálogo de temas | `extension/catalogo-temas.json` como referência local; revisão online autorizada pode ser posterior |
| Tema, ocultação e estalo | Preferências por analista neste navegador |
| Cópia de sincronização | Instalação e contexto autenticado; cache não autoriza operações |

O Git mantém definições e exemplos. Configuração real de conexão, códigos, PINs, tokens, exportações de pedidos e dados operacionais permanecem fora dos arquivos versionados.

## Configurações comuns da equipe

| Chave em `public.fila_config` | Uso e compatibilidade |
|---|---|
| `temas_catalogo_v1` e `temas_catalogo_revisao` | Catálogo declarativo e revisão; apenas estilos e campos que o cliente instalado reconhece |
| `cliente_config_v1` | `schema`, `revisao`, `leitura_ms` e `layout`; leitura padrão de 5.000 ms, faixa aceita de 2.000–60.000 ms |
| `cliente_config_v1.layout.icone_suporte_url` | Imagem HTTPS de Para suporte, com alternativa local; motor disponível desde 6.8.2 |
| `animacoes_pedido_v1` | Ativação, efeito, cor e duração; preferência por analista/tema, OFF prevalece; duração de 1.200–6.000 ms |

Os procedimentos estão em [Temas e configuração](TEMAS-E-CONFIGURACAO.md). Publicar arquivos no Git não altera esses registros nem instala código nos navegadores. Após instalar o motor correspondente, mudanças declarativas compatíveis são recebidas pelo fluxo online.

## Regras vigentes

- A captura observa inclusões e remoções da tabela AF e faz amostragem a cada 5 segundos. IDs observados são persistidos para conciliação; coleta depende de uma aba AF autenticada disponível.
- Um leitor identificado, mesmo OFF, ou a gestão pode solicitar distribuição. Somente analistas com nome reservado, ON e elegíveis recebem; capacidade, Força de Vendas, rotas e retenções continuam validadas no banco.
- Desaparecer da lista ou ter recomendação `approve` não confirma aprovação automática. É necessária a decisão explícita do próprio pedido, conforme o [contrato de conciliação](CAPTURA-E-APROVACAO-AUTOMATICA.md).
- A [triagem online](TRIAGEM-ONLINE.md) exige no mínimo 10 segundos e uma consulta posterior antes de distribuir candidatos novos. Autorizações conhecidas ficam fora da fila. Falta de origem não é classificada automaticamente como trabalho humano ou aprovação automática; o cliente antigo não transmite o autor da decisão.
- Um automático confirmado libera a atribuição e deixa de contar como produção humana, preservando o histórico original. Relatórios oferecem total analisado, automáticos e produção por analista, com valores e indicação dos valores desconhecidos.
- A lista de saídas mostra **Horário do pedido** a partir da hora original e **Pedido concluído por:**. A projeção operacional é curta; o histórico e os relatórios mantêm a consulta dos registros anteriores.
- `fila_sincronizar` envia blocos alterados de estado, descansos e avisos. O worker compartilha consultas e uma cópia por até 5 segundos entre superfícies da mesma instalação/contexto. Ações exigem consulta nova.
- A partir de 27/10/2026, o banco libera as reservas de nome diariamente às 00:00 em America/Fortaleza. A rotina não muda status, pedidos, escala ou sessão de gestão. O analista volta a escolher seu nome em **Eu sou**.
- A [referência de feriados](FERIADOS-NA-ESCALA.md) usa o calendário oficial de São Luís, exclui pontos facultativos e aparece ao passar o mouse nas células. Dias sem escala continuam `nao_definido`; a informação não vira folga ou presença no banco.
- No Fullmetal Alchemist, `alquimia` anima apenas o card do pedido próprio novo e visível. Círculo atrás do texto, fogo nas bordas e estalo opcional usam recursos locais; som depende da interação e da política do navegador.

## Migrações de referência

| Arquivo em `supabase/migrations/` | Finalidade |
|---|---|
| `20261025175646_distribuicao_por_leitor_identificado.sql` | Distribuição solicitada por leitor identificado, preservando a elegibilidade dos destinatários |
| `20261025183807_captura_e_conciliacao_af.sql` | Registro de observações, consulta exclusiva, conciliação, auditoria e produção |
| `20261026025317_sincronizacao_economica.sql` | Estado compacto e sincronização autenticada por blocos |
| `20261026031910_liberar_nomes_meia_noite.sql` | Liberação diária de nomes, registro por data e agendamento no banco |

São incrementais sobre o backend existente. Consulte [Banco e RPCs](BANCO-E-RPCS.md) e [supabase/README.md](../supabase/README.md) antes de reutilizar. A versão 6.11.0 do efeito visual não exige outra migration.

## Manutenção e validação

Atualizações de código preservam a mesma pasta, `config.js`, perfil e instalação, seguidas de **Recarregar** e atualização das abas AF. Evite remover e instalar novamente para conservar a identidade local.

Para código, use Node.js 24, `npm ci` e `npm test`. A suíte usa dados fictícios, DOM simulado e PostgreSQL isolado; não confirma áudio/renderização em navegador real nem substitui a verificação dos agendamentos implantados. Para revisão documental, confira links, versões, contratos e exemplos. Atualize esta referência quando mudar uma regra, fonte de dados ou compatibilidade.
