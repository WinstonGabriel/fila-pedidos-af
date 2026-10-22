# Fila de Pedidos AF

Extensão Chrome Manifest V3 para organizar a fila do AF Mateus Mais entre analistas. A versão 5.3.1 inclui distribuição automática ao ligar ON, próximo pedido após conclusão, devolução para outro analista, contato compartilhado, nomes exclusivos, histórico e temas locais.

## Funcionalidades

- Leitura da tela com cadência nominal de dois segundos e paginação separada.
- Um pedido atual por analista, com atribuição coordenada no banco.
- Reservas manuais, lojas de preferência e elegibilidade de Força de Vendas.
- Marcação e remoção de contato entre analistas identificados.
- Histórico por analista, ação e pedido.
- Seis temas personalizados e opção Padrão, salvos por instalação.
- Painel lateral no Chrome e janela alternativa conforme as APIs do navegador.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `extension/` | Arquivos que o navegador carrega |
| `tests/` | Testes automatizados com DOM e serviços simulados |
| `database/` | SQL de atualização e documentação das dependências do banco |
| `docs/` | Arquitetura e instruções de publicação |
| `.github/` | Testes no GitHub Actions e modelos de contribuição |

## Instalar para desenvolvimento

1. Baixe o projeto ou clone o repositório.
2. Copie `extension/config.example.js` para `extension/config.js`.
3. Preencha a URL do Supabase e a chave pública `anon` compatível com as RPCs da equipe. A configuração real fica fora do Git.
4. Abra `chrome://extensions` ou `opera://extensions` e ative o modo de desenvolvedor.
5. Escolha **Carregar sem compactação** e selecione a pasta `extension/`.
6. Abra a lista do AF, entre na sua conta e informe o código da equipe dentro da extensão.

```bash
cp extension/config.example.js extension/config.js
```

O manifesto do projeto permite a origem do AF e subdomínios `*.supabase.co`. Para um domínio próprio de API, ajuste também `host_permissions`. O pacote não contém o endereço do projeto de produção, códigos da equipe ou tokens de instalações.

Os testes locais não precisam de configuração do Supabase nem de sessão do AF. Para usar as funcionalidades reais, é necessário um banco com o esquema e as RPCs descritos em [database/README.md](database/README.md).

## Executar os testes

Utilize Node.js 24 e npm. A dependência de desenvolvimento é fixada no `package-lock.json`.

```bash
npm ci
npm test
```

Os testes usam dados fictícios, DOM simulado e chamadas de rede simuladas. Eles não acessam o AF nem executam operações no banco real. A validação visual no navegador é uma etapa complementar.

## Contribuir

Qualquer pessoa pode trabalhar em uma cópia do projeto e propor uma alteração por pull request. O mantenedor revisa a proposta antes de incorporá-la à versão principal. Acesso direto de escrita é uma permissão separada.

Veja [CONTRIBUTING.md](CONTRIBUTING.md), o [documento de arquitetura](docs/ARQUITETURA.md) e as [instruções para publicar no GitHub](docs/PUBLICAR_NO_GITHUB.md).

## Atualizações para a equipe

O Git mantém o código e permite colaboração. Publicar um commit não atualiza automaticamente uma extensão carregada manualmente nas máquinas da equipe.

Alterações compatíveis nas RPCs podem valer nas próximas chamadas ao banco. Alterações de interface dependem dos arquivos instalados. Ao atualizar a mesma instalação, preserve `extension/config.js`, mantenha o mesmo armazenamento local e recarregue a extensão.

## Licenciamento

Este pacote prepara a colaboração por repositório público. Uma licença geral de redistribuição ainda deve ser definida pelo titular; nenhuma licença adicional é atribuída automaticamente por estes arquivos.
