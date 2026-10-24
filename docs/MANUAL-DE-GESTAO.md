# Manual de gestão — AF Operação 6.8.1

## Acesso e separação de identidades

Em Gestão, selecione o perfil disponível, informe o responsável e o PIN autorizado. `fila_gestao_entrar` entrega uma sessão validada pelo backend, anunciada pela interface como ativa por até oito horas. É possível acompanhar a operação sem escolher um nome de analista ou marcar ON. Use Sair ao encerrar o acesso de gestão. A sessão preferencial é mantida em `chrome.storage.session`; o cliente conserva compatibilidade com credencial de coordenação anterior.

O código da equipe permite conexão; o PIN/sessão permite gestão; o token com nome reservado representa o analista. Esses papéis não são intercambiáveis. O descanso continua exclusivo do analista real e não pode ser concedido pela gestão no nome de outra pessoa.

## Operação e nomes

Selecione o analista alvo para consultar status, pedido atual, reservas e controles de vínculo. As operações de gestão passam pelas RPCs autenticadas; ocultar controles na tela não é a barreira de autorização.

Antes de liberar um nome, confira a instalação que o utiliza. Liberar a identidade resolve a seleção exclusiva, mas não deve ser tratado como exclusão do cadastro do analista. OFF e liberação de nome são ações distintas. O fluxo de gestão que reúne ambas as operações deve ser lido e confirmado na interface, pois pode afetar a disponibilidade e o pedido atual.

Vincular/transferir pedidos e zerar o estado são intervenções operacionais: confira o alvo e a intenção antes de usar. Não execute uma operação destrutiva de fila como forma genérica de corrigir conexão ou aparência.

## Preferências e direcionamento por loja

A interface oferece listas de preferência por analista e rotas por loja. Uma rota associa a loja ao analista escolhido; os pedidos automáticos dessa loja aguardam o alvo ficar ON e livre, conforme o aviso da interface. A remoção envia analista nulo. O salvamento inclui a versão observada para evitar sobrescrever uma edição concorrente.

Use nomes de loja consistentes com a lista AF. O cliente normaliza acentos, caixa e separadores para comparação. Se a rota não surtir efeito, confira a grafia, a disponibilidade do alvo, os candidatos extraídos e a versão implantada da função de distribuição. Não confunda uma preferência com garantia de recebimento sem atender às regras de elegibilidade.

## Consulta e edição da escala

A escala permite consultar período e filtrar analista. A edição de gestão trabalha com nome, data, tipo, horários, presença, observação e versão.

| Campo | Opções/uso |
|---|---|
| Tipo | Trabalho, Folga, Feriado, Férias, Atestado, Não definido |
| Horários | Entrada e saída em dias de trabalho |
| Presença | Não informada, Trabalhou, Ausente; edição pode manter o valor existente |
| Período/dias da semana | Aplicação em lote dentro do período exibido |
| Versão | Capturada na consulta; conflito exige atualizar e revisar |

Ao salvar, confira a quantidade de dias alterados. A alteração gera avisos conforme as regras do backend. A escala planejada e o status instantâneo do analista são dados relacionados, mas não devem ser tratados como a mesma informação.

## Importação de escala

1. Selecione mês de referência e arquivo.
2. Acione o reconhecimento e acompanhe o progresso.
3. Revise nomes, datas, tipos e horários da prévia.
4. Corrija os itens necessários; linhas conflitantes começam desmarcadas.
5. Se alterar nomes ou datas, use **Atualizar versões da prévia**.
6. Marque a confirmação de revisão e aplique somente as linhas desejadas.
7. Confira o total salvo e consulte novamente a escala.

| Limite do leitor instalado | Valor |
|---|---|
| Formatos | XLSX, XLS, CSV e PDF |
| Tamanho | Até 25 MB |
| Dimensão da planilha | Limite de índices equivalente a cerca de 10.000 linhas e 400 colunas; divida arquivos extensos |
| PDF | Até 24 páginas |
| Imagem renderizada para OCR | Até 24 milhões de pixels por página |
| Prévia reconhecida | Até 1.500 dias/itens |

Planilhas são lidas com SheetJS. PDF com texto usa PDF.js; página com pouco texto pode passar por Tesseract local com modelo `eng`. Isso não garante reconhecimento perfeito de nomes e acentos. O arquivo é processado localmente; os registros selecionados e a origem de importação são enviados ao backend ao salvar. Cancelar reconhecimento não grava a prévia.

## Relatórios e avisos

A interface consulta `fila_gestao_relatorio` para o período e permite exportar o resultado oferecido. O relatório não substitui o histórico auditado nem dados que existem apenas no AF. Revise o período antes de compartilhar uma exportação.

O sino permite consultar e confirmar avisos. Confirmação de leitura é individual; não muda a situação do pedido. A distribuição de avisos para a equipe depende da infraestrutura implantada, cuja instalação completa não está incluída neste repositório.

## Portais de celular

Os portais individuais são serviços separados. Cada acesso fica restrito à identidade vinculada no servidor, permite a operação de status prevista e consulta da escala. Não distribua o link pessoal de um analista para outro: ele é uma credencial de acesso. Esta documentação não contém esses links. A extensão e os portais compartilham as proteções do descanso no banco; o botão de iniciar descanso está na extensão 6.8.1.
