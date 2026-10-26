# Alquimia das Chamas — 6.11.0

O tema Fullmetal Alchemist usa o efeito inspirado em Roy Mustang dentro do card do próprio pedido: um clarão de ignição, círculo alquímico em SVG que expande e gira atrás dos dados, arcos de energia, labaredas nas quatro bordas, faíscas e encerramento suave. O estalo é uma síntese percussiva breve com Web Audio, sem arquivo remoto ou amostra extraída do anime.

## Acionamento e apresentação

O evento continua vindo do mecanismo pessoal existente, com baseline, expiração e consumo serial único por navegador. O preset declarativo permanece `alquimia`; a apresentação especial depende do tema `fullmetal-alchemist`. Outros temas mantêm seus avisos existentes.

Cada caixa declara o analista e o ID do pedido atual. O renderizador também confere o link do pedido dentro dela. Uma página do AF ou outro site, sem o card real da extensão, não consome esse evento antes do painel. O evento pode aguardar o card por até a validade já existente de trinta segundos. Só o pedido próprio, atual e visível é animado. No modo por intervalo, o mesmo requisito de presença do ID na caixa se aplica.

`roy-alquimia.js` constrói a decoração em Shadow DOM, com SVGs estáticos e animações CSS finitas de transform e opacity. `roy-alquimia.css` limita o efeito ao card, posiciona o conteúdo acima e mantém os cliques disponíveis. Escala e rotação usam elementos separados para não disputar a mesma propriedade transform. Não há observador genérico do corpo da página, canvas, biblioteca externa ou laço de renderização em JavaScript.

Após redesenhar o painel, `aposRender()` reanexa o efeito ao mesmo analista/ID com atraso negativo correspondente ao tempo já passado. O temporizador original continua valendo; não se toca outro estalo. Se o pedido mudar, a decoração é removida. OFF remoto, troca de identidade/tema e ocultação encerram o efeito. Texto do pedido e controles continuam legíveis durante toda a apresentação. Um anúncio discreto com aria-live informa o novo pedido aos leitores de tela.

## Estalo e preferência local

O menu de temas mostra **Ativar e testar estalo** somente para Fullmetal Alchemist. Depois de habilitado, o controle indica **Estalo: ligado** e permite silenciar. A preferência fica em `filaRoySom`, por nome de analista neste navegador. A primeira interação no tema ou a escolha explícita do Fullmetal pode preparar o contexto de áudio; o controle de ativação não se pré-ativa pelo pointerdown, para evitar desligar na primeira tentativa.

O estalo usa um buffer curto de ruído com envelope de decaimento, filtro e ganho baixo. Um único AudioContext é reutilizado; as fontes são encerradas e desconectadas. A política de autoplay do navegador é respeitada. Uma tentativa bloqueada, rejeitada ou suspensa tem prazo e não impede o efeito visual. Os iframes do painel delegam apenas autoplay; não foi adicionada permissão de microfone, câmera ou código remoto.

Movimento reduzido remove giro, fogo, faíscas e clarão, preservando um contorno estático suave e a informação acessível. O controle de som permanece independente.

## Atualização e validação

Instale os arquivos desta versão na mesma pasta já usada, recarregue a extensão e as abas do AF. O tema, a ativação, a duração e as cores continuam usando a configuração existente. A duração segue os limites já aceitos de 1,2 a 6 segundos, com cerca de 3 segundos no padrão. Não há migração de banco, consulta extra, mídia hospedada ou alteração de dados operacionais nesta entrega.

`tests/roy-alquimia.cjs` verifica em DOM isolado o card correto, adiamento do consumo, visibilidade, acessibilidade, limpeza, som único, mute por analista, atualização do DOM sem repetição, bloqueio/suspensão do áudio e encerramento por identidade/OFF. A suíte principal também conserva testes de avisos dos demais temas, distribuição, captura, conciliação e sincronização econômica. A validação descrita é automatizada em DOM isolado; o áudio real ainda depende da política do navegador usado na instalação.
