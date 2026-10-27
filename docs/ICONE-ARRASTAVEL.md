# Ícone arrastável — 6.15.0

O ícone flutuante pode ser arrastado para outro ponto da página. Segure o botão principal do mouse, mova o ícone e solte: o painel abre junto da posição escolhida. Um clique sem movimento continua abrindo/fechando; passar o mouse continua abrindo. O foco pelo teclado também é preservado. Com o ícone focado, Alt mais as setas muda a posição em passos de 10 pixels.

O painel abre à direita ou à esquerda conforme o espaço. Em telas estreitas, abre acima ou abaixo, ajustando tamanho e posição para caber na tela e conservar o ícone acessível. O arraste não transforma a página AF nem altera seus formulários.

A posição é salva em `chrome.storage.local.afPainelPosicao`, com `schema=1` e coordenadas normalizadas `x/y` entre 0 e 1. É uma preferência deste perfil de navegador e acompanha outras páginas autorizadas e a reabertura do ícone. Redimensionar a janela adapta a posição. Uma restauração antiga não desfaz um movimento recente.

`painel-posicao.js` é carregado antes da sidebar injetada do Chrome e antes do painel dos outros sites autorizados. As permissões e a validação do iframe global continuam as mesmas. A sidebar nativa do Opera e o ícone da barra do navegador continuam sob controle do navegador; o arraste vale para o ícone inserido na página.

O gesto usa Pointer Events e captura do ponteiro. Um movimento menor que seis pixels é tratado como clique. Cancelamento/perda da captura restaura a posição anterior; soltar após arrastar salva e abre uma vez, suprimindo o clique extra. O toque usa `touch-action: none` apenas no botão. OFF ou revogação da permissão desmontam o controle e seus ouvintes.

`tests/painel-arrastavel.cjs` executa 12 cenários com ambiente DOM simulado: posição nas bordas, clique, arraste, cancelamento, múltiplos ponteiros, resize, restauração atrasada, sincronização, teclado, limites e desmontagem. A aparência, o comportamento do iframe e o arraste real precisam ser conferidos no navegador.

Para receber o recurso, atualize os arquivos instalados, incluindo o manifesto e o índice do auto-reload, e atualize as páginas com scripts injetados. Publicar no GitHub não copia esses arquivos para os computadores. Veja [Distribuição e atualizações](DISTRIBUICAO-E-ATUALIZACOES.md).
