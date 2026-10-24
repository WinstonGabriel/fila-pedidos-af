# Publicação e colaboração no GitHub

O repositório existente é [WinstonGabriel/fila-pedidos-af](https://github.com/WinstonGabriel/fila-pedidos-af), com extensão em `extension/` e branch principal `main`. Não crie outro repositório para atualizar esta cópia.

## Fluxo recomendado

```bash
git clone https://github.com/WinstonGabriel/fila-pedidos-af.git
cd fila-pedidos-af
git switch -c docs/atualizar-manual
npm ci
```

Faça a mudança e confira `git diff`, os arquivos selecionados e as regras de [contribuição](../CONTRIBUTING.md). Para mudanças de código, rode `npm test`. Para documentação, confira links relativos, contratos e exemplos.

```bash
git add docs/ README.md
git diff --cached --check
git commit -m "docs: atualize a documentação da extensão"
git push -u origin docs/atualizar-manual
```

Abra um pull request com problema, comportamento final e validação. Confira o workflow **Testes**. Colaboradores com escrita podem publicar em branches do repositório; leitura pública permite fork e propostas por PR, sem conceder escrita a todos. Siga as proteções configuradas pelo proprietário.

## Identidade, integração e acesso

A conta autenticada e a instalação do aplicativo GitHub são autorizações distintas. Um conector pode ler repositórios públicos e ainda receber 403 ao tentar escrever se não estiver instalado/autorizado no proprietário e repositório corretos. Configure somente o alcance necessário e confirme o acesso antes de repetir um envio. Não use a conta de outro colaborador como substituição da autorização do proprietário.

No terminal, use o mecanismo de autenticação aprovado da sua conta. Não inclua tokens na URL remota, em arquivos versionados ou em relatos de erro. Antes de atualizar `main`, confira o head remoto e integre alterações concorrentes; não use force push para evitar uma divergência.

## Conteúdo que não deve ser enviado

`extension/config.js`, `.env`, `node_modules/`, ZIPs locais, códigos da equipe, PINs, tokens e dados reais de pedidos. Confira `.gitignore`, mas lembre que ignorar não remove um arquivo que já foi rastreado.

## Entrega para os analistas

O GitHub organiza código, revisões e testes. Publicar um commit não atualiza as extensões instaladas. A instalação por pasta exige atualizar os arquivos da mesma instalação e recarregar o navegador/extensão conforme o [guia de manutenção](INSTALACAO-E-MANUTENCAO.md). Configurações declarativas compatíveis seguem o fluxo online descrito em [Temas e configuração](TEMAS-E-CONFIGURACAO.md).
