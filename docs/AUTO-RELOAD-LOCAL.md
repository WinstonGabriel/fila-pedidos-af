# Recarga automática da pasta — 6.14.0

A extensão carregada por **Carregar sem compactação** passa a conferir os arquivos da própria pasta. Quando detecta uma alteração estável, chama `chrome.runtime.reload()`. O primeiro uso exige atualizar o código completo da pasta, preservar `config.js` e recarregar manualmente a instalação existente uma vez.

## Funcionamento

- `chrome.management.getSelf()` limita o monitoramento a `installType=development`. Consultar a própria instalação dispensa a permissão ampla `management`.
- A permissão `alarms` agenda uma verificação por minuto. O alarme é conferido em cada início do worker e recriado se estiver ausente; não depende de `setInterval` nem de manter o painel aberto. O navegador pode atrasar alarmes, especialmente durante suspensão do computador.
- O worker lê `auto-reload-arquivos.json` e os arquivos locais com `fetch(chrome.runtime.getURL(...))`, `cache: no-store` e um parâmetro para evitar reutilização de cache. Não consulta GitHub, Supabase ou servidor de atualização para verificar os arquivos.
- O índice cobre JS, CSS, HTML e JSON da raiz usados pelo cliente, `config.js` e o mapeamento de avatares. Não cobre imagens, áudio, bibliotecas de `vendor/`, arquivos SQL ou documentação. O manifesto alternativo Opera e o exemplo de configuração não são monitorados: a instalação usa o seu `manifest.json` e o seu `config.js`.
- O conteúdo do índice e dos arquivos é resumido com SHA-256. A primeira leitura estável estabelece a referência em `chrome.storage.session`, sem copiar código-fonte, chaves ou dados de pedidos para esse registro.
- Uma mudança precisa aparecer igual em duas varreduras separadas por três segundos. Arquivo ausente/vazio, JSON inválido, manifesto incompleto, índice inválido ou falha de leitura adiam a recarga. Essa estabilidade reduz o risco de carregar uma cópia em andamento; não é validação sintática de todo JavaScript nem garantia de uma cópia atômica.
- A referência sobrevive à suspensão do worker. A recarga real limpa o storage de sessão e cria uma nova referência, evitando um ciclo de recargas. Várias verificações simultâneas compartilham uma execução.

O recurso usa `runtime.getContexts`, disponível no Chrome 116+, e storage de sessão. Quando as APIs necessárias não estão disponíveis, o monitor fica inativo e os demais recursos seguem funcionando. Valide a compatibilidade da versão de Opera usada pela equipe.

## Operações e edições

Antes de recarregar, o worker espera as operações acompanhadas de captura, conciliação, avisos, efeitos e consultas de banco. As páginas operacionais se identificam por uma conexão interna vinculada ao `documentId`; todas precisam confirmar que estão prontas. Uma página sem confirmação ou recém-aberta adia a recarga.

No painel, RPCs e gravação do estado local são acompanhados. A confirmação também espera a leitura/distribuição e as ações da fila, três segundos sem interação de teclado/clique, saída dos campos com foco e ausência de edição pendente na gestão. Editor de escala aberto, OCR/importação em revisão, lojas alteradas, rota, pedido a vincular ou PIN ainda preenchido conservam a atualização pendente. Salve ou descarte a edição; o próximo ciclo tenta novamente.

Durante a confirmação, novas operações acompanhadas recebem uma mensagem para aguardar. A captura é prioritária: uma nova observação que chega ao worker cancela a preparação para persistir a fila, e a recarga fica para outra tentativa. Um cancelamento ou ausência da recarga libera a barreira do painel em até cinco segundos. O protocolo de confirmação só aceita páginas `popup.html` da própria extensão, com a resposta da tentativa atual.

## O que ainda precisa ser distribuído

**Auto-reload não baixa nem copia arquivos.** O código validado precisa chegar à mesma pasta de cada computador por uma atualização do checkout ou pelo canal de distribuição da equipe. Publicar um commit no GitHub não altera as cópias locais. O recurso também não é instalado retroativamente nas versões antigas pelo banco.

Após a primeira ativação, uma alteração apenas em `gestao.css` ou `gestao.js`, por exemplo, pode provocar a recarga mesmo sem trocar o número de versão. Ao adicionar/remover um arquivo monitorado no desenvolvimento, atualize o índice:

```bash
node scripts/listar-auto-reload.cjs --escrever
npm test
```

A checagem do projeto recusa um índice desatualizado. Distribua os arquivos completos, incluindo o índice e o manifesto correto para o navegador; evite editar diretamente uma instalação operacional sem validar a mudança.

A recarga preserva o storage local e os registros do banco, mas limpa o storage de sessão, inclusive a sessão de gestão, que pode exigir novo acesso. O navegador pode fechar a superfície da extensão; reabra-a se necessário. Scripts que já estavam injetados em páginas AF ou outros sites precisam de atualização dessas páginas para receber o código novo. O monitor não recarrega automaticamente páginas de trabalho nem promete restaurar seus formulários. Nenhum ZIP foi gerado para esta revisão.

## Validação

`tests/auto-reload.cjs` usa arquivos fictícios, APIs simuladas, VM e DOM. Cobre tipo da instalação, alarmes, referência por sessão, suspensão do worker, mudança de CSS sem trocar versão, confirmação de estabilidade, falhas, índice novo, caminhos rejeitados, vários painéis, resposta antiga/ausente, operações pendentes, concorrência e edição da gestão. O bootstrap carrega o módulo real junto dos demais imports.

Os testes não reproduzem o carregador de arquivos do Chrome. Na instalação real, confirme: alterar um CSS monitorado recarrega uma vez; deixar um editor aberto adia; fechar/salvar permite a recarga; repetir a leitura sem mudanças não recarrega. Confira também painel fechado, retomada do navegador, reconexão do painel e atualização das páginas com scripts injetados.

Referências: [runtime.reload](https://developer.chrome.com/docs/extensions/reference/api/runtime#method-reload), [management.getSelf](https://developer.chrome.com/docs/extensions/reference/api/management#method-getSelf), [alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms) e [storage.session](https://developer.chrome.com/docs/extensions/reference/api/storage#property-session).
