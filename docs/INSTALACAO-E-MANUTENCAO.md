# Instalação, atualização e manutenção — 6.11.0

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
| Nome liberado à meia-noite | Comportamento diário esperado; selecionar novamente em Eu sou |
| Lista não lê | Aba AF correta, login, tabela carregada, filtros, seletores e indicação parcial/cache |
| Banco sincroniza, sem novos pedidos | Verificar leitura AF e existência de superfície operacional carregada |
| Pedido passou e sumiu | Conferir captura/conciliação; desaparecer não prova automático nem conclusão humana |
| Produção divergente | Conferir período, origem confirmada, pendências e valores desconhecidos; consultar histórico |
| Transferência elevada | Conferir versão instalada, fila_sincronizar e blocos/cache; consumo já acumulado não é apagado |
| Cliques lentos | Aguardar timeout/sincronização; conferir estado remoto antes de repetir |
| Descanso não encerra | Função de encerramento, trigger, execução periódica e relógio do servidor |
| Tema não atualiza | Revisão, normalização, contexto do cache e compatibilidade do renderer |
| Ícone global ausente | Permissão HTTP/HTTPS, ON, aba protegida, injeção e recarga |
| Animação ausente | Baseline, idade do evento, consumo anterior, visibilidade e OFF remoto |
| Estalo ausente | Fullmetal ativo, controle Ativar e testar estalo, preferência local e política de áudio do navegador |
| Escala conflita | Reconsultar versões e revisar a prévia antes de salvar |

O painel e a sincronização compartilhada usam timeout de banco de 35 s. Captura e chamadas legadas de avisos têm limites próprios, de 15 s. Timeout é ausência de resposta no prazo, não uma confirmação de rollback da operação. Preserve a última informação válida e compare o estado após reconectar.

A leitura AF e a sincronização periódica têm padrão de 5 s; são ciclos distintos. O worker compartilha consultas por contexto e envia as versões recebidas para obter apenas blocos alterados. Depois de ações, a tela consulta novamente o banco. A captura de linhas rápidas continua ativa na aba AF autenticada mesmo com o painel fechado.

A liberação diária de nomes roda no banco às 00:00 em America/Fortaleza e não exige atualização de pacote. Confira o job e o registro por data se ela falhar; não use a função com datas inventadas para testar produção. Veja [Liberação diária](LIBERACAO-DIARIA.md).

## Reversão e compatibilidade

Uma reversão de arquivos deve preservar `config.js` e a instalação. Cliente antigo pode não reconhecer novas telas; suporte permanece retido no status legado de contato. Não remova campos/objetos novos do banco apenas porque voltou o cliente. Auditoria e contagem de pausas não devem ser apagadas para compatibilizar a tela.

A base SQL não é autossuficiente. Veja [Banco e RPCs](BANCO-E-RPCS.md) antes de preparar ambiente novo ou reparar funções. Não reexecute todos os patches como tentativa de diagnóstico.

## Preparar uma entrega

1. Trabalhe em branch própria e confira alterações não relacionadas.
2. Atualize código, documentação e versão quando houver mudança de software.
3. Para código ou dependências, rode `npm ci`, `npm test` e validação da mensagem de commit. Em mudanças exclusivamente documentais, confira links, referências, versão e exemplos.
4. Para mudanças visuais/comportamentais, execute as verificações manuais pertinentes.
5. Revise segredos, configurações e dados de exemplo; não empacote `.git` ou `node_modules`.
6. Se gerar pacote operacional, use a pasta da extensão e configuração autorizada, sem PIN/código/token embutido; documente como preservar os dados locais.
7. Publique no GitHub e confira o workflow. Distribua a atualização pelo canal da equipe.

Paletas e parâmetros declarativos suportados podem chegar online. Código novo, imagens e permissões precisam de atualização do pacote. Publicar no repositório não é mecanismo automático de atualização do navegador.

## Manifestos por navegador — 6.12.1

O `extension/manifest.json` padrão e o ZIP identificado como Chrome usam `side_panel`, sem `sidebar_action`. A configuração de sidebar do Opera foi preservada em `extension/manifest.opera.json`; para usá-la, copie esse arquivo sobre `manifest.json` somente na pasta instalada no Opera e recarregue. Os arquivos de código são os mesmos. A checagem compara ambos os manifestos para impedir divergências de versão e de configuração compartilhada.

No Chrome, depois de substituir os arquivos na mesma pasta e recarregar, use **Limpar tudo** na lista de erros para remover o aviso antigo de manifesto. Abra a extensão novamente e confira se houve novo registro. Preserve `config.js` e a instalação existente.

## Pacote operacional e erro de registro do worker — 6.12.2

O worker importa `config.js` durante o registro. Se o arquivo faltar ou tiver erro de JavaScript, o Chrome pode informar **Service worker registration failed. Status code: 15**. Esse código é genérico: examine também a causa de avaliação indicada nos erros do worker. Os ZIPs anteriores destinados apenas à atualização dependiam da configuração já existente na pasta instalada.

A distribuição operacional configurada da 6.12.2 inclui esse arquivo, somente com URL e chave pública anon do projeto autorizado. Não inclui código da equipe, PIN ou token de analista. Para atualizar essa equipe com o ZIP pronto, substitua também o `config.js` fornecido. O clone do Git continua exigindo a configuração manual descrita acima. Não copie uma configuração de outra equipe/projeto sobre uma instalação diferente.

Para preparar uma distribuição, configure `extension/config.js` localmente e use `npm run package:chrome` ou `npm run package:opera`. O arquivo permanece ignorado no Git. O empacotador recusa sua ausência, cria o ZIP, verifica CRC, extrai em diretório temporário e executa `tests/background-bootstrap.cjs` sobre a pasta extraída. Essa checagem valida o papel anon da chave, sua correspondência ao projeto, validade e inicialização dos scripts em VM sem DOM e sem rede. Não equivale a executar Chrome real.
