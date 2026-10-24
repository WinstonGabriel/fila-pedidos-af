# Manual do analista — AF Operação 6.8.1

## 1. Entrar e escolher sua identidade

1. Abra a extensão pelo ícone da barra do navegador.
2. Em **Conexão**, informe o código da equipe fornecido pelo responsável.
3. Em **Eu sou**, escolha seu próprio nome.
4. Confira a mensagem de sincronização antes de operar pedidos.

A escolha reserva seu nome para esta instalação. Fechar o painel não libera o nome. Se o banco liberar sua reserva, selecione-o novamente. Não escolha o nome de um colega para contornar uma indisponibilidade; peça ao responsável para verificar a reserva.

Os oito nomes configurados são Natalie, Cássio, Evangela, Gabriel, Kazaf, Rayla, Abigail e Alisson. Uma nova instalação pode gerar outro token; preserve a instalação atual ao atualizar.

## 2. Status e recebimento

Os status exibidos são ON, OFF, Intervalo, Férias, Contato tel, Em call, Missão, CBKs, Valid e Folga. Seu próprio status pode ser alterado na linha do analista; a gestão possui controles adicionais. ON habilita a participação na fila, sujeita às regras e à disponibilidade no banco. O status de atividade não é uma mudança na decisão antifraude do pedido.

Ao voltar para ON, a interface seleciona Pilha e tenta distribuir quando há pedidos e leitura válida. Não é necessário um colega “enviar” o pedido: a alocação pode ocorrer automaticamente durante a sincronização. A equipe deve acompanhar status e eventuais pedidos em andamento ao sair da operação.

## 3. Operar um pedido

| Controle/ação | Resultado |
|---|---|
| Abrir pedido | Abre o link conhecido do AF para análise no sistema de origem |
| Copiar | Copia o texto/link oferecido pelo controle |
| Localizar/destacar | Ajuda a encontrar o pedido na lista AF acessível |
| Concluir | Conclui a tarefa na fila e tenta obter o próximo pedido |
| Liberar | Devolve para redistribuição; registra a liberação explícita |
| Reservar | Separa um pedido para atendimento pelo analista autorizado |
| Anexar por ID/link | Vincula um pedido reconhecido, conforme validação e permissão |
| Para contato | Retém o pedido na lista compartilhada de contato |
| Para suporte | Retém o pedido na lista compartilhada de suporte |

**Concluir na extensão não aprova nem nega a compra no AF.** Faça a decisão antifraude no sistema apropriado conforme o procedimento da equipe.

Se uma operação demorar ou apresentar erro, aguarde a sincronização e confira o pedido atual antes de clicar novamente. O banco valida o ID esperado para proteger contra cliques repetidos, mas uma falha de resposta não prova que a operação foi desfeita.

## 4. Contato e suporte

Qualquer analista identificado pode marcar um pedido atual para contato/suporte e remover a retenção compartilhada, mesmo sendo de outro analista. O histórico registra a autoria. Essas permissões não concedem acesso geral para concluir ou liberar o pedido de um colega.

Enquanto retido, o pedido fica fora da fila automática. **Remover da lista o disponibiliza novamente para distribuição**, quando reconhecido como candidato elegível; remover não significa concluir. Confirme que a tratativa terminou antes de remover. Versões antigas podem mostrar suporte dentro de Para contato, pois o banco conserva compatibilidade de retenção.

## 5. Descanso de 20 minutos

Abra **Analistas** e localize **Descanso 20 min** na sua linha. O botão aparece para cada pessoa, mas só o próprio usuário identificado pode iniciar a pausa.

Regras:

- Até duas pausas por dia, total de 40 minutos, pelo dia de `America/Fortaleza`.
- Cada pausa dura 20 minutos e conta assim que começa.
- É preciso estar ON e sem pedido em andamento.
- Entre pausas é necessário permanecer pelo menos 20 minutos contínuos em ON; não é permitido emendar 20 + 20.
- Durante a pausa, a mudança de status fica protegida no banco. Fechar o painel, trocar de computador ou reinstalar não zera o uso.
- Ao terminar, o servidor retorna o analista para ON. O cron periódico pode levar até aproximadamente um minuto se nenhum painel disparar a verificação antes.

A linha mostra uso do dia, contador ou motivo de bloqueio: outro usuário, banco indisponível, duas pausas usadas, status diferente de ON, pedido atual ou espera entre pausas. O **Intervalo comum**, com horários informados, é distinto deste benefício limitado.

## 6. Pilha e aba Intervalo

Pilha apresenta atribuições e retenções. A aba Intervalo divide os pedidos da data selecionada por faixas de horário automáticas ou configuradas. A aba não inicia uma pausa. Confira a data, a leitura parcial e a indicação de cache quando a lista parecer incompleta. O destaque de 30 minutos indica tempo no mesmo pedido; não libera o pedido automaticamente.

## 7. Histórico e ranking

Abra o histórico pelo controle da interface e filtre por analista, ação ou pedido. **Carregar mais** busca as páginas anteriores. Ranking é contagem de conclusões do período oferecido, não contagem de avisos nem prova de produtividade completa fora da extensão.

Exemplos de apresentação:

- “Rayla recebeu automaticamente o pedido”: alocação automática, sem atribuir envio a um colega.
- “Gabriel recebeu o pedido após liberação de Abigail”: só quando a liberação do mesmo pedido está comprovada no evento imediatamente anterior.

## 8. Temas, avisos e animações

Escolha um tema no seletor de aparência. A preferência é por analista neste navegador; uma configuração fixa de equipe pode prevalecer. **Atualizar temas** consulta o catálogo online. Sem rede, a última cópia válida continua disponível.

Os avisos são acessíveis pelo sino e informam eventos de status/escala conforme o backend. As cores seguem o destinatário. Na página AF há balões de aviso; no painel global a consulta pode continuar pelo painel, mas o script global não injeta o mesmo componente de balões AF em todo site.

Uma animação temática pode aparecer quando chega um novo pedido para você. Abrir o painel com um pedido que já existia não dispara uma animação retroativa. Não há som ou abertura automática do pedido. A preferência de movimento reduzido do sistema preserva a mensagem sem animação decorativa. Os ajustes remotos do efeito são administrativos; não existe editor de animações em Gestão nesta versão.

## 9. Ocultação e uso em outros sites

1. Escolha sua identidade e ative **Ocultação ON**.
2. Para outras páginas, clique em **Permitir painel em outros sites** e aceite a permissão do navegador.
3. Passe o mouse sobre o ícone flutuante dentro da página para abrir; retire para recolher.
4. Se uma aba já aberta não mostrar o ícone, recarregue-a.

A preferência é individual no navegador. OFF remove o ícone; o clique no ícone da barra continua disponível. O navegador não oferece hover sobre o ícone nativo da barra para esta função. Páginas internas, lojas e visualizadores protegidos podem impedir a injeção.

Mantenha a **lista AF autenticada aberta**, mesmo em segundo plano, para que um painel carregado consiga ler novos pedidos. O estado compartilhado continua vindo do banco em outras páginas. O recurso não flutua sobre a área de trabalho ou outros aplicativos.

## 10. Problemas frequentes

| Situação | Como agir |
|---|---|
| Nome ocupado | Confira se a instalação antiga ainda está em uso; solicite verificação ao responsável |
| “Seu nome foi liberado” | Escolha seu nome novamente em Eu sou |
| Cache/última leitura | Abra a lista AF, confira login, filtros e carregamento; use Ler página |
| Botão de descanso desativado | Leia o motivo logo abaixo do botão |
| Painel recolhe após atualização | Recarregue AF e extensão; confira ON e permissão; reporte navegador e passos se persistir |
| Tema não chegou | Use Atualizar temas e confira conexão; efeitos novos podem exigir atualizar o código |
| Sem animação | Pode ser baseline, evento antigo/consumido, movimento reduzido ou configuração OFF |
| Falha ao concluir/liberar | Aguarde sincronização e confira o ID atual; não presuma que a resposta perdida desfez a ação |
