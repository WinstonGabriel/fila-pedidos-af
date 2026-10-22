# Publicar o projeto no GitHub

Nome sugerido: `fila-pedidos-af`. Para permitir contribuições de qualquer pessoa, utilize um repositório público com colaboração por forks e pull requests.

## Publicação pela interface

1. Entre na sua conta do GitHub e escolha **New repository**.
2. Informe o nome e selecione **Public**.
3. Crie o repositório e envie o conteúdo da pasta do projeto, mantendo a estrutura.
4. Não envie `extension/config.js`, arquivos `.env`, `node_modules/` ou configurações de produção.
5. Ative ou confira o workflow **Testes**, incluído em `.github/workflows/testes.yml`.

## Publicação por Git

Se você recebeu o projeto como ZIP e ainda não o inicializou:

```bash
git init -b main
git add .
git commit -m "Organiza a extensão 5.3.1 para colaboração"
```

Crie o repositório vazio na sua conta e substitua o marcador abaixo pela URL fornecida pelo GitHub:

```bash
git remote add origin <URL-DO-REPOSITORIO>
git push -u origin main
```

Se o diretório já contém um repositório com um commit inicial, utilize apenas a etapa de associar o remoto e enviar. Use a sua identidade Git e a autenticação da sua conta.

## Como as outras pessoas colaboram

Um repositório público permite leitura e forks. A pessoa faz alterações em sua cópia e abre um pull request para propor a integração. Para editar diretamente o repositório principal, ela precisa de acesso de escrita concedido pelo proprietário.

Referências oficiais:

- [Escrever código para um projeto](https://docs.github.com/en/pull-requests/concepts/writing-code-for-a-project)
- [Criar um pull request a partir de um fork](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/creating-a-pull-request-from-a-fork)

Publicar no GitHub organiza o desenvolvimento; a distribuição automática de novas versões da extensão é outro fluxo e não está implementada por este pacote.
