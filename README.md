# AF Operação

Extensão Manifest V3 para organizar os pedidos do AF Mateus Mais. **Versão atual: 6.8.2.**

## Documentação completa

O [índice de documentação](docs/README.md) reúne os manuais de analista e gestão, arquitetura atualizada a partir do modelo 5.3.1, banco/RPCs, temas, segurança, manutenção e testes. Comece pelo [manual do analista](docs/MANUAL-DO-ANALISTA.md) para usar a extensão ou pela [arquitetura](docs/ARQUITETURA.md) para desenvolver.

## Funcionalidades

- Fila compartilhada, distribuição automática, reserva exclusiva de nome e confirmação pelo ID do pedido.
- Listas **Para contato** e **Para suporte**, compartilhadas entre analistas identificados; pedidos retidos ficam fora da distribuição até remoção explícita.
- Imagem de **Para suporte** configurável online para a equipe, com desenho original como alternativa se a imagem falhar. Requer a atualização inicial para 6.8.2.
- Status, escala, gestão, direcionamento por loja, histórico com origem de liberação comprovada e ranking de conclusões.
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
| `database/tests/` | Testes SQL separados, com dados simulados e rollback |
| `docs/` | Arquitetura e documentação histórica |
| `scripts/check-extension.cjs` | Verificação de sintaxe, manifesto e recursos |

## Testes

Com Node.js 24 e npm:

```bash
npm ci
npm test
```

A suíte executa o extrator original e os testes atuais de catálogo, identidade, notificações, histórico, animações, painel global e suporte. Usa dados fictícios e serviços simulados, sem acessar o banco de produção. Os arquivos `test-ui-510.cjs`, `test-ui-530.cjs` e `test-contato-compartilhado.cjs` permanecem como referência da interface 5.x e foram substituídos na suíte pelos testes atuais.

## Banco e atualização

O SQL é incremental sobre o banco AF existente, não um instalador completo. Veja [database/README.md](database/README.md) antes de executar qualquer script. Algumas atualizações corrigem funções existentes por trechos exatos e exigem revisão ao mudar a versão de base. Nunca rode testes SQL em produção como parte do CI.

Publicar no GitHub não atualiza automaticamente as extensões instaladas. Atualize os arquivos da mesma instalação e clique em **Recarregar**. Depois da instalação do motor adequado, paletas e opções declarativas compatíveis podem ser alteradas online; novos comportamentos fora do motor instalado ainda precisam de atualização.

Os créditos dos campeões estão em `extension/assets/lol/CREDITOS.txt`. A licença geral do projeto continua pendente de definição pelo titular; esta atualização não altera esse status.
