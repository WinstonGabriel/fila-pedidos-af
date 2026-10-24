# Instalação, atualização e manutenção — 6.8.1

## Pré-requisitos

- Navegador com recursos Manifest V3 compatíveis. Chrome usa painel lateral; o código oferece janela alternativa quando necessário. Validar cada versão de Opera/Chrome usada pela equipe.
- Acesso válido à lista AF para leitura de pedidos.
- Backend AF já provisionado, com RPCs e permissões compatíveis.
- URL Supabase e chave pública anon autorizadas, código da equipe e identidade disponível.
- Node.js 24 e npm para desenvolver/validar; não são necessários para executar a pasta pronta no navegador.

## Instalação a partir do GitHub

```bash
git clone https://github.com/WinstonGabriel/fila-pedidos-af.git
cd fila-pedidos-af
cp extension/config.example.js extension/config.js
```

Preencha `SUPABASE_URL` e `SUPABASE_KEY` em `extension/config.js`. Use apenas chave pública anon compatível com a autorização das RPCs. O exemplo é placeholder: baixar o GitHub não fornece configuração pronta de produção.

Abra `chrome://extensions` ou `opera://extensions`, habilite modo de desenvolvedor e escolha **Carregar sem compactação**, apontando para `extension/`, onde está `manifest.json`. Se recebeu ZIP, extraia antes. Informe código da equipe e escolha seu nome. Abra a lista AF e confira a primeira leitura e a sincronização.

## Atualizar uma instalação existente

1. Registre a versão atual e mantenha cópia dos arquivos anteriores para diagnóstico.
2. Preserve o `config.js` real e a mesma instalação/perfil do navegador.
3. Atualize os arquivos da pasta com o código validado; no checkout Git, use atualização sem sobrescrever mudanças locais inadvertidamente.
4. Confira `manifest.json` e recursos locais; preserve a configuração ignorada pelo Git.
5. Clique **Recarregar** na instalação existente.
6. Recarregue as páginas AF e páginas autorizadas para substituir scripts já injetados.
7. Confira identidade, tema, leitura, status e permissão global. Faça teste operacional com pedido fictício em desenvolvimento.

Remover e instalar novamente pode trocar identidade local e preferências, deixando uma reserva antiga no banco. Não use reinstalação como primeira tentativa para resolver nome ocupado. Atualizar código não instala migrations automaticamente.

## Configurar painel em outros sites

Abra o painel, identifique-se, clique em **Permitir painel em outros sites**, aceite as origens e ative Ocultação ON. A concessão registra scripts e tenta alcançar abas já abertas; recarregue a página se necessário. O painel acompanha o banco, mas novos candidatos ainda exigem uma lista AF autenticada acessível. Revogar a permissão remove o registro global; Ocultação OFF remove o ícone.

## Diagnóstico por camada

| Camada / sintoma | Verificação útil |
|---|---|
| Extensão não carrega | Manifesto, pasta escolhida, arquivos ausentes e tela de erros do navegador |
| Painel abre sem conexão | `config.js`, código da equipe, endpoint acessível e mensagem de erro RPC |
| Nome indisponível | Reserva por token no banco; distinguir identidade de pedido atual |
| Lista não lê | Aba AF correta, login, tabela carregada, filtros, seletores e indicação parcial/cache |
| Banco sincroniza, sem novos pedidos | Verificar leitura AF e existência de superfície operacional carregada |
| Cliques lentos | Aguardar timeout/sincronização; conferir estado remoto antes de repetir |
| Descanso não encerra | Função de encerramento, trigger, execução periódica e relógio do servidor |
| Tema não atualiza | Revisão, normalização, contexto do cache e compatibilidade do renderer |
| Ícone global ausente | Permissão HTTP/HTTPS, ON, aba protegida, injeção e recarga |
| Animação ausente | Baseline, idade do evento, consumo anterior, visibilidade e OFF remoto |
| Escala conflita | Reconsultar versões e revisar a prévia antes de salvar |

O painel usa timeout de banco de 35 s; o worker de avisos usa 15 s. Timeout é ausência de resposta no prazo, não uma confirmação de rollback da operação. Preserve a última informação válida e compare o estado após reconectar.

## Reversão e compatibilidade

Uma reversão de arquivos deve preservar `config.js` e a instalação. Cliente antigo pode não reconhecer novas telas; suporte permanece retido no status legado de contato. Não remova campos/objetos novos do banco apenas porque voltou o cliente. Auditoria e contagem de pausas não devem ser apagadas para compatibilizar a tela.

A base SQL não é autossuficiente. Veja [Banco e RPCs](BANCO-E-RPCS.md) antes de preparar ambiente novo ou reparar funções. Não reexecute todos os patches como tentativa de diagnóstico.

## Preparar uma entrega

1. Trabalhe em branch própria e confira alterações não relacionadas.
2. Atualize código, documentação e versão quando houver mudança de software.
3. Rode `npm ci`, `npm test` e validação da mensagem de commit.
4. Para mudanças visuais/comportamentais, execute as verificações manuais pertinentes.
5. Revise segredos, configurações e dados de exemplo; não empacote `.git` ou `node_modules`.
6. Se gerar pacote operacional, use a pasta da extensão e configuração autorizada, sem PIN/código/token embutido; documente como preservar os dados locais.
7. Publique no GitHub e confira o workflow. Distribua a atualização pelo canal da equipe.

Paletas e parâmetros declarativos suportados podem chegar online. Código novo, imagens e permissões precisam de atualização do pacote. Publicar no repositório não é mecanismo automático de atualização do navegador.
