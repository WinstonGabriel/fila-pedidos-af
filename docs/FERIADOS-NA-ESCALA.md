# Feriados na escala

Atualização online do backend de 26/10/2026, compatível com a tela de escala já instalada. Não exige outro ZIP, alteração dos arquivos da extensão ou nova permissão. Para receber a informação, abra a escala ou use **Atualizar** dentro dela.

O código 6.11.1 acrescenta o pino de feriado descrito abaixo. Esse elemento novo exige atualizar os arquivos da extensão e recarregar a instalação existente; não é ativado somente pelo banco. Nenhum novo ZIP foi gerado para esta mudança.

## Apresentação

Ao posicionar o mouse sobre a célula de um analista num dia de feriado, o título existente mostra **📅 Feriado: nome do feriado** na linha de referência do calendário. Um dia sem registro continua **Não definido**, com horários vazios e sem presença presumida. Horários, folgas, férias, presença e observações já preenchidos pela gestão continuam valendo.

A partir da 6.11.1, cada data de feriado tem apenas um pequeno pino vermelho de 14 px no canto superior direito do cabeçalho, sem sombreado adicional. Passe o mouse sobre o pino para ler **Feriado: nome do feriado**. O indicador também pode receber foco pelo teclado e tem nome acessível. Aparece uma vez por data, tanto na visão semanal quanto na mensal, inclusive ao filtrar um único analista.

A referência aparece também nas células já preenchidas, junto da observação existente. Na 6.11.0, continua somente na informação ao passar o mouse sobre as células, sem pino no cabeçalho. Não inclui solicitações para trabalhar no feriado nem altera quem pode editar a escala.

## Calendário

O cadastro inicial segue os 14 feriados do [calendário oficial de São Luís para 2026](https://diariooficial.saoluis.ma.gov.br/portal/calendario), referente ao Decreto nº 62.168, de 24/12/2025. Pontos facultativos não entram na referência.

| Data em 2026 | Feriado |
|---|---|
| 01/01 | Confraternização Universal |
| 03/04 | Paixão de Cristo / Sexta-feira Santa |
| 21/04 | Tiradentes |
| 01/05 | Dia do Trabalho |
| 29/06 | Dia de São Pedro |
| 28/07 | Adesão do Maranhão à Independência do Brasil |
| 07/09 | Independência do Brasil |
| 08/09 | Natividade de Nossa Senhora / Aniversário de São Luís |
| 12/10 | Nossa Senhora Aparecida |
| 02/11 | Finados |
| 15/11 | Proclamação da República |
| 20/11 | Dia Nacional de Zumbi e da Consciência Negra |
| 08/12 | Nossa Senhora da Conceição |
| 25/12 | Natal |

As regras recorrentes atuais são calculadas para períodos de 2026 a 2100. A Sexta-feira Santa acompanha a Páscoa de cada ano. Uma mudança legal futura exige revisão do cadastro central; o calendário não consulta ou importa automaticamente novas leis. Consultas anteriores a 2026 conservam o comportamento anterior, sem essa referência nova.

## Preservação da escala e das permissões

O cadastro fica em `af_mobile.feriados_referencia`, com RLS e acesso direto revogado para os papéis de cliente. Helpers privados invoker calculam as datas e removem a anotação de apresentação quando o formulário volta ao servidor. O RPC existente `fila_escala_consultar` mantém sua validação de equipe/período e o filtro individual.

Dias de feriado ainda sem escala são linhas virtuais na resposta, com `tipo=nao_definido` e `versao=0`. Não são inseridos em `public.fila_escala` e não entram nos relatórios como folga, feriado definido ou trabalho. A consulta não grava eventos nem gera notificações. Linhas reais preservam todos os campos e a versão; somente a resposta de apresentação acrescenta o nome do feriado.

No editor instalado, a linha `[Calendário AF · 📅 Feriado: ...]` pode aparecer no campo de observação. Ela é metadado temporário: o servidor a remove antes de gravar, inclusive em edições de período. O restante do texto é preservado. Abrir e salvar um registro sem mudança não cria aviso apenas por causa dessa linha. A gestão continua usando a versão real para detectar edições concorrentes; o primeiro preenchimento de uma linha virtual usa a versão zero e gera somente os eventos normais da decisão de escala.

Os argumentos, permissões e a sessão de gestão dos RPCs existentes são preservados. O pino da 6.11.1 usa o campo `feriado_referencia` já recebido na mesma consulta; não faz consultas extras nem exige outra migration. A atualização não executa aprovações no AF, não interfere nas atribuições de pedidos e não altera a liberação diária de nomes.

## Validação

`tests/feriados-tooltip.cjs` usa PostgreSQL isolado, dados fictícios e a renderização real de `gestao.js` em DOM simulado. Verifica calendário, exclusão de pontos facultativos, datas móveis, virada do ano, pino e título no cabeçalho, troca entre semana/mês, filtro individual sem consulta adicional, escape do título, linhas virtuais, observações de 500 caracteres, gravação, conflitos de versão, ausência de avisos indevidos e permissões. Não acessa produção nem exige credenciais para testar. A conferência visual e o balão nativo do navegador devem ser validados na instalação.
