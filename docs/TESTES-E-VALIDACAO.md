# Testes e validação — AF Operação 6.11.0

## Executar

```bash
npm ci
npm test
npx commitlint --last --verbose
```

Use Node.js 24. `npm test` executa `npm run check` e as suítes declaradas em `package.json`, com dados fictícios e serviços simulados. Não precisa de credenciais nem consulta o banco de produção. A instalação npm prepara o hook Husky para validar mensagens de commit.

## Cobertura incluída

| Arquivo | Área verificada |
|---|---|
| `scripts/check-extension.cjs` | Sintaxe JS, manifesto, recursos existentes e oito avatares distintos |
| `tests/test-extension.cjs` | Extrator: 18 cenários da lista/paginação, falhas e consolidação |
| `tests/catalogo-integration.cjs` | 16 verificações de catálogo, persistência, revisão, validação e integração |
| `tests/individual-ui.cjs` | Combinações de identidade própria/alheia, descanso/ocultação e regressões de UI |
| `tests/notificacoes-tema.cjs` | Tema do destinatário, troca de identidade e isolamento visual |
| `tests/historico-origem.cjs` | Recebimento automático e origem por liberação explícita |
| `tests/efeito-pedido.cjs` | Normalização/configuração e escolha de evento |
| `tests/efeito-pedido-ui.cjs` | Consumo serial, visibilidade e exibição pessoal |
| `tests/painel-global.cjs` | Permissão, registro, token por aba/origem, expiração e guard |
| `tests/suporte.cjs` | Botão/lista, permissões compartilhadas e chamadas do fluxo |
| `tests/suporte-icone.cjs` | URL HTTPS, normalização, imagem alternativa, falhas e respostas atrasadas |
| `tests/distribuicao-leitor.cjs` | Leitor identificado OFF, gestão, destinatários elegíveis e nova tentativa após candidatos concorrentes |
| `tests/conciliacao-af.cjs` | Evidência do próprio pedido, captura, recuperação, origem, auditoria, produção e permissões em PostgreSQL isolado |
| `tests/captura-background.cjs` | Fila persistente, serialização, envio, troca de contexto e consultas exclusivas |
| `tests/sincronizacao-banco.cjs` | Estado compacto, ativos preservados, blocos, autorização e compatibilidade em PostgreSQL isolado |
| `tests/sincronizacao-worker.cjs` | Consulta compartilhada, TTL, relógio, atualização após ação, reinício e isolamento de contexto/remetente |
| `tests/liberacao-diaria.cjs` | Ativação, fuso, liberação por data, escolhas após a virada, rollback e permissões em PostgreSQL isolado |
| `tests/roy-alquimia.cjs` | Card próprio, consumo adiado, camadas, limpeza, áudio único/opcional, redesenho e encerramento |
| `tests/triagem-online.cjs` | Prazo antes da atribuição, prova da decisão, compatibilidade, fila individual/global, produção, repetição, falhas posteriores e permissões |
| `tests/feriados-tooltip.cjs` | Calendário sem pontos facultativos, pino/título no cabeçalho, semana/mês e filtros, linhas virtuais, escape de título, preservação de notas/versões, gravação e permissões |
| `tests/dom-harness.cjs` | Suporte de simulação DOM usado por testes atuais |

`test-ui-510.cjs`, `test-ui-530.cjs` e `test-contato-compartilhado.cjs` permanecem como referência da interface antiga; não fazem parte do comando principal. Não afirme que toda a pasta foi executada só porque `npm test` passou.

## Testes SQL

`database/tests/` contém cenários de fila, contato, descanso, histórico, efeito e suporte. Eles trocam dados dentro de transações e terminam em `ROLLBACK`. Execute manualmente somente em desenvolvimento, com o esquema compatível. Não fazem parte de `npm test` nem do GitHub Actions; um teste SQL com rollback ainda toca e bloqueia dados durante a execução.

As suítes JavaScript de distribuição, conciliação, sincronização de banco e liberação diária usam PGlite 0.5.11, PostgreSQL isolado com fixtures fictícios. Fazem parte de `npm test`. O agendador simulado verifica o contrato do job; não dispara nem certifica um cron real. Arquivos em `tests/fixtures/` são bases de teste e não são migrations para produção.

## Verificação manual por funcionalidade

| Fluxo | Verificação com ambiente de teste |
|---|---|
| Identidade | Dois perfis não escolhem o mesmo nome; liberar nome exige nova escolha |
| Liberação diária | Conferir job/fuso e execução por data no ambiente autorizado; preservar escolhas após a virada e dados operacionais |
| Distribuição | Dois clientes concorrentes não ficam com o mesmo pedido; ID antigo não conclui o próximo |
| Captura | Linha que entra/sai entre leituras é registrada; falha de rede mantém envio pendente; contexto antigo não é reenviado como outro |
| Conciliação | Conferir ID e decisão do próprio pedido; recomendação/desaparecimento não geram automático; recuperação exige análise atual |
| Produção | Automáticos fora do ranking humano, totais por origem, filtro individual, valores desconhecidos e CSV |
| Sincronização | Blocos inalterados não voltam; duas superfícies compartilham consulta; ação atualiza; troca de contexto descarta resposta anterior |
| Contato/suporte | Outro analista pode marcar/remover; retenção não volta sozinha para a fila |
| Descanso | Próprio usuário, limite diário, ON contínuo, proteção durante a pausa e retorno pelo servidor |
| Histórico | Recebimento automático não aparece como envio de colega; liberação explícita é relacionada |
| Hover | Ícone → painel sem recolher; sair recolhe; recarga/redesenho preservam o comportamento |
| Painel global | Conceder/revogar permissão, navegar entre origens, alternar abas e usar fallback em página protegida |
| Temas | Conferir os 13 temas, contraste, foco, diálogos, oito retratos e movimento reduzido |
| Avisos | Evento sobre colega usa a cor do destinatário; troca de identidade não reaproveita projeção antiga |
| Efeito | Evento novo próprio aparece uma vez; painel oculto não o consome; baseline não anima |
| Roy Mustang | Círculo atrás do texto, fogo nas bordas, botões acessíveis, estalo após interação, mute e movimento reduzido |
| Importação | PDF textual, PDF imagem e planilha; conflitos, cancelamento e revisão antes de gravar |
| Falhas | AF sem login, RPC lenta e rede indisponível; cache sinalizado e sem mensagem falsa de sucesso |

## Evidência e limites

O workflow `Testes` roda em push e pull request com Node 24, npm ci, commitlint e npm test. Consulte o resultado do commit publicado para confirmar a execução no GitHub. A suíte usa DOM e áudio simulados e PostgreSQL isolado: não prova compatibilidade com toda versão de navegador, não valida a renderização/áudio reais de cada tema e não garante o estado do backend/cron em produção.

Nesta revisão, as alterações são documentais. A conferência deve incluir links locais, arquivos e símbolos citados, consistência com manifesto/package/catalogo e ausência de credenciais. Rode testes de software novamente quando o código ou as dependências mudarem, ou quando um resultado trouxer dúvida nova.

## Relatar um problema

Informe versão, navegador, fluxo, resultado esperado/observado e se a tela indicava cache, parcial ou falha de rede. Use IDs fictícios e capture somente o trecho necessário, ocultando dados reais. Não publique código da equipe, token, PIN ou configuração real em uma issue.
