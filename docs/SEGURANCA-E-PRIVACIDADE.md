# Segurança e privacidade — 6.8.1

## Fronteiras de confiança

A extensão executa código empacotado. A lista AF é lida na origem autorizada usando a sessão do usuário. O backend valida equipe, identidade e privilégios antes das operações. A página de outro site não recebe código da equipe, token da instalação ou PIN por meio da projeção de avisos/efeitos.

| Dado | Onde fica / tratamento |
|---|---|
| URL e chave pública anon | `config.js` local; a chave pública não substitui autorização das RPCs |
| Código da equipe e token da instalação | `chrome.storage.local`, usados no corpo das RPCs |
| Nome, modo, data e cache de pedidos | Armazenamento local e estado da interface |
| Sessão de gestão | Preferencialmente `chrome.storage.session`, vinculada ao contexto |
| Atribuições, pausas e auditoria | Banco compartilhado com controles de acesso |
| Preferências de tema/ocultação | Localmente por analista no navegador |
| Projeções de aviso/efeito | Storage local com contexto derivado por hash; sem os valores brutos de credenciais |
| Link pessoal do portal móvel | Credencial individual; não deve entrar no Git, exemplos ou mensagens públicas |

O cache contém dados da lista de pedidos. Proteja o perfil do navegador e a sessão do computador. Armazenamento local da extensão não deve ser descrito como cofre criptográfico ou defesa contra alguém com controle do dispositivo.

## Permissões do manifesto

| Permissão | Uso |
|---|---|
| `storage` | Estado, cache, preferências, cursores e autorizações temporárias |
| `activeTab` | Interação com a aba no contexto permitido |
| `scripting` | Extrator AF, destaque e scripts locais do painel |
| `sidePanel` | Painel lateral onde suportado |
| `clipboardWrite` | Ações explícitas de cópia |
| Host AF | Leitura/destaque e painel na origem AF |
| Hosts `*.supabase.co` | Chamadas à URL configurada do backend |
| HTTP/HTTPS opcionais | Painel global em sites autorizados após concessão explícita |

A permissão opcional é ampla em alcance de sites; o script atual usa esse acesso para apresentar o painel, não para raspar formulários das páginas. O usuário pode revogá-la na configuração da extensão. O recurso não funciona automaticamente em páginas privilegiadas do navegador.

## Painel global

O registro `af-operacao-flutuante-global` injeta somente arquivos locais e exclui o AF para evitar duplicação e as lojas conhecidas. O iframe externo abre `painel-global.html`; essa entrada solicita validação antes de carregar o painel operacional.

A autorização usa dois UUIDs concatenados, é armazenada por aba, vence em 30 minutos e se vincula à origem. A validação verifica remetente da extensão, aba, token, expiração, origem atual, Ocultação ON e permissão. Fechar a aba remove a autorização. O storage é de sessão, com fallback local quando necessário; a expiração continua sendo verificada. `popup.html` não é liberado como recurso operacional irrestrito para todas as origens.

Este mecanismo reduz o risco de incorporação indevida; não é uma garantia de isolamento contra falhas futuras no navegador, extensões maliciosas ou dispositivo comprometido.

## Backend e conteúdo remoto

Mantenha RLS e grants restritos. Wrappers públicos não devem dar acesso direto ao schema privado. Funções privilegiadas devem validar entradas e fixar resolução de nomes; valide as definições implantadas ao alterar migrations. Nenhuma chave `service_role` deve ser incluída na extensão.

Catálogo/layout aceitam campos limitados e cores hexadecimais, sem CSS/HTML/scripts/URLs arbitrários. Texto apresentado em HTML é escapado com `esc()`. Links de pedidos da raspagem são limitados à origem AF. Exemplos e testes usam dados fictícios.

## Práticas de colaboração

Não versionar `config.js`, `.env`, PIN, código da equipe, tokens de instalação, links pessoais, exportações reais de pedidos ou capturas com dados sensíveis. O repositório público é visível para qualquer pessoa; permissão de escrita permite contribuir diretamente e deve ser concedida só a colaboradores autorizados.

Se uma credencial vazar, remover o arquivo do último commit não basta: revogue/rotacione a credencial no serviço responsável, investigue o alcance e revise o histórico Git conforme o caso. Não inclua o segredo em uma issue pública ao relatar a ocorrência.

## Limites desta revisão

A documentação descreve proteções observadas no código e nos scripts incluídos. Não certifica o estado atual de todas as políticas, funções ou segredos do banco e dos Workers. As suítes simuladas não substituem revisão de permissões no ambiente de desenvolvimento nem uma avaliação de segurança completa.
