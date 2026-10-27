# AF Operação

Extensão Manifest V3 para organizar os pedidos do AF Mateus Mais. **Versão atual do código: 6.14.0.**

A versão 6.14.0 acrescenta [recarga automática da pasta local](docs/AUTO-RELOAD-LOCAL.md) nas instalações sem compactação. Confere os arquivos por minuto e espera uma alteração estável e os painéis sem operações/edições pendentes antes de recarregar. Exige atualizar os arquivos e recarregar uma vez para ativar. Não baixa código do GitHub nem distribui arquivos entre computadores. Código preparado sem novo ZIP.

A versão 6.13.1 mostra imediatamente **Feriado: nome do feriado** ao passar o ponteiro sobre o pino ou dar foco pelo teclado, sem esperar o balão nativo do navegador. Código publicado sem novo ZIP. As instalações atuais precisam atualizar seus arquivos locais; o servidor não consegue alterar esse comportamento nos clientes antigos. Consulte [Dica imediata no pino](docs/FERIADOS-NA-ESCALA.md#dica-imediata-no-pino--6131).

A versão 6.13.0 [retira automaticamente pedidos de contato e suporte](docs/RETIRADA-AUTOMATICA-DE-APOIO.md) após saída confirmada da lista completa do AF ou decisão final comprovada. Preserva a auditoria e não gera uma nova conclusão humana. A confirmação por varredura exige atualizar os arquivos instalados.

A versão 6.12.3 mostra **Pausa 20min** no campo de status quando o descanso regulamentado está ativo, também na gestão e no card. O intervalo comum continua **Intervalo**; o indicador amarelo, as regras e o retorno automático para ON permanecem. A nova apresentação exige atualizar os arquivos instalados.

A versão 6.12.2 corrige a entrega operacional: o ZIP configurado inclui `config.js`, obrigatório para iniciar o worker. O empacotador verifica a configuração pública e executa a cadeia de imports extraída do próprio ZIP em VM isolada. O código-fonte continua sem configuração de produção no Git; prepare a configuração local e use `npm run package:chrome` ou `npm run package:opera` para gerar uma distribuição.

A versão 6.12.1 corrige o aviso de manifesto no Chrome: `manifest.json` usa o painel `side_panel`; a configuração específica do Opera foi separada em `manifest.opera.json`. Para Opera, copie o manifesto alternativo sobre `manifest.json` somente na pasta dessa instalação.

A versão 6.12.0 acrescenta **Quero folgar** nos feriados da escala. O servidor aceita a preferência até 23h59 do terceiro dia anterior, registra a ordem sem duplicidade e entrega à gestão somente as três primeiras solicitações. A definição da escala continua manual e exclusiva da gestão. Consulte [Feriados na escala](docs/FERIADOS-NA-ESCALA.md). Atualize os arquivos instalados para exibir os novos controles.

A versão 6.11.3 apresenta os status dos analistas com indicador LED e brilho discreto: **ON em verde neon**, **OFF em vermelho** e **Intervalo em amarelo**, em todos os temas e na visão da gestão. As cores acompanham a seleção e a sincronização. Atualize os arquivos instalados e recarregue a extensão para aplicar o novo visual.

A versão 6.11.2 identifica o descanso regulamentado nas notificações como **Pausa 20min**. O intervalo comum mantém o nome **Intervalo**. O novo texto exige atualizar os arquivos instalados, além do metadado de pausa emitido pelo backend; não há novo ZIP nesta revisão.

A versão 6.11.1 acrescenta um pino vermelho discreto no canto da data de feriado na escala. Passe o mouse sobre ele para consultar o nome. O pino exige atualizar os arquivos instalados; publicar no Git não atualiza os navegadores automaticamente.

A versão 6.11.0 Acrescenta som ao chegar notificação . A [sincronização econômica](docs/ECONOMIA-DE-TRANSFERENCIA.md) e a [captura e conciliação de automáticos](docs/CAPTURA-E-APROVACAO-AUTOMATICA.md) permanecem disponíveis.

## Documentação completa

O [índice de documentação](docs/README.md) reúne os manuais de analista e gestão, arquitetura atualizada a partir do modelo 5.3.1, banco/RPCs, temas, segurança, manutenção e testes. A referência de [dados e estado compartilhados](docs/DADOS-COMPARTILHADOS.md) consolida a versão, fontes de dados, configurações e regras atuais. Comece pelo [manual do analista](docs/MANUAL-DO-ANALISTA.md) para usar a extensão ou pela [arquitetura](docs/ARQUITETURA.md) para desenvolver.

## Funcionalidades

- Fila compartilhada, distribuição automática, reserva exclusiva de nome e confirmação pelo ID do pedido.
- Captura de pedidos que passam rapidamente pela lista, recuperação após confirmação no AF e separação de aprovações automáticas nos relatórios e no ranking.
- [Triagem online antes da distribuição](docs/TRIAGEM-ONLINE.md): janela mínima de 10 segundos e consulta ao AF nas instalações com coletor 6.9+, sem outro ZIP; decisões já autorizadas ficam fora da fila.
- [Liberação automática dos nomes às 00:00](docs/LIBERACAO-DIARIA.md), no horário de São Luís, sem precisar manter a extensão aberta.
- Listas **Para contato** e **Para suporte**, compartilhadas entre analistas identificados; pedidos retidos ficam fora da distribuição até remoção manual ou saída confirmada do AF.
- Imagem de **Para suporte** configurável online para a equipe, com desenho original como alternativa se a imagem falhar. Requer a atualização inicial para 6.8.2.
- Status, escala, gestão, direcionamento por loja, histórico com origem de liberação comprovada e ranking de conclusões.
- [Referência de feriados na escala](docs/FERIADOS-NA-ESCALA.md): pino no cabeçalho da data a partir de 6.11.1, sem preencher a escala nem incluir pontos facultativos. A referência de texto nas células da 6.11.0 continua disponível online.
- Descanso individual de 20 minutos, até duas vezes por dia, com 20 minutos contínuos em ON entre pausas; regras no banco e retorno automático.
- Catálogo online com 13 temas, incluindo Fullmetal Alchemist, LoL, Fluminense e Nuvens com volume 3D. No tema LoL, os oito analistas têm campeões distintos.
- Notificações nas cores do destinatário e animação de novos pedidos do próprio analista, com controles remotos de duração, cor e efeito incluído.
- Painel lateral no Chrome, janela alternativa e painel flutuante com abertura pelo mouse nas páginas web autorizadas.

## Instalação

1. Clone ou baixe o repositório.
2. Copie `extension/config.example.js` para `extension/config.js` e configure a URL do Supabase e a chave pública `anon`. Em uma atualização, preserve o `config.js` da instalação atual.
3. Abra `chrome://extensions` ou `opera://extensions`, ative o modo de desenvolvedor e carregue a pasta **extension** sem compactação.
4. Informe o código da equipe dentro da extensão e escolha seu nome em **Eu sou**.
5. Para o painel em outros sites, clique em **Permitir painel em outros sites** e ative **Ocultação ON**.

O código de equipe, credenciais de gestão, tokens pessoais e a configuração real de produção não estão no Git. Nunca use uma chave `service_role` no navegador.

O mouse abre o painel pelo ícone flutuante da página; o ícone nativo da barra funciona por clique. Páginas internas e protegidas do navegador podem bloquear a injeção. Para capturar pedidos novos do AF, mantenha uma aba AF disponível, mesmo em segundo plano. Os dados já conhecidos continuam sincronizando pelo banco em outras páginas.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `extension/` | Extensão completa, recursos locais, bibliotecas OCR e notas das atualizações |
| `tests/` | Testes atuais e testes legados preservados |
| `database/updates/` | Atualizações de banco das funcionalidades recentes |
| `supabase/migrations/` | Migrações incrementais de distribuição, conciliação, sincronização e liberação diária |
| `database/tests/` | Testes SQL separados, com dados simulados e rollback |
| `docs/` | Arquitetura e documentação histórica |
| `scripts/check-extension.cjs` | Verificação de sintaxe, manifesto e recursos |

## Testes

Com Node.js 24 e npm:

```bash
npm ci
npm test
```

A suíte executa o extrator original e os testes atuais de catálogo, identidade, notificações, histórico, animações, painel global, suporte, distribuição, captura, conciliação, sincronização econômica e liberação diária. Usa dados fictícios, serviços simulados e PostgreSQL isolado, sem acessar o banco de produção. Os arquivos `test-ui-510.cjs`, `test-ui-530.cjs` e `test-contato-compartilhado.cjs` permanecem como referência da interface 5.x e foram substituídos na suíte pelos testes atuais.

## Banco e atualização

O SQL é incremental sobre o banco AF existente, não um instalador completo. Veja [database/README.md](database/README.md) antes de executar qualquer script. Algumas atualizações corrigem funções existentes por trechos exatos e exigem revisão ao mudar a versão de base. Nunca rode testes SQL em produção como parte do CI.

Publicar no GitHub não atualiza automaticamente as extensões instaladas. Atualize os arquivos da mesma instalação e clique em **Recarregar**. Depois da instalação do motor adequado, paletas e opções declarativas compatíveis podem ser alteradas online; novos comportamentos fora do motor instalado ainda precisam de atualização.

Os créditos dos campeões estão em `extension/assets/lol/CREDITOS.txt`. A licença geral do projeto continua pendente de definição pelo titular; esta atualização não altera esse status.
