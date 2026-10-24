# Arquitetura — AF Operação 6.8.1

## Fluxo

A leitura da página AF e a sincronização com o banco são ciclos independentes. A tela fornece os pedidos candidatos; RPCs autenticadas validam a equipe, a identidade e a disponibilidade para realizar operações sob bloqueio transacional. O histórico mantém a auditoria original, enquanto a leitura apresenta automaticamente os recebimentos e só identifica uma origem quando existe liberação anterior do mesmo pedido.

## Componentes

- `popup.js`, `gestao.js`: fila, status, suporte, descanso, gestão, escala e histórico.
- `aparencia.js`, `catalogo-temas.js`, `temas.js`, `temas.css`: paletas e efeitos locais; o catálogo remoto aceita apenas dados limitados.
- `baloes.js`, `avisos-background.js`: avisos da equipe com identidade de leitura individual e cores do destinatário.
- `efeito-core.js`, `pedido-background.js`, `pedido-animacao.js`: recebimento do próprio pedido, referência inicial sem repetição, consumo serializado e efeitos locais. O modo de movimento reduzido mantém somente texto.
- `painel-flutuante.js`: apresentação e ocultação pelo mouse, com estado da aba e reparação após redesenho.
- `painel-global-background.js`, `painel-global-host.js`, `painel-global.html`, `painel-global.js`: permissões opcionais, registro dinâmico e validação de token por aba/origem antes de carregar o painel em outros sites.
- `background.js`: inicializa os serviços e preserva abertura lateral ou janela alternativa.
- `vendor/`: dependências locais de planilhas e OCR; não são baixadas durante o uso normal.

## Contratos principais

`fila_estado` retorna analistas, atribuições, identidades e configurações declarativas. O suporte preserva o estado de retenção compatível `contato`, distinguido por `destino_apoio='suporte'`; a interface atual separa as duas listas. `fila_suporte` permite marcar/remover a qualquer analista autenticado, sob o mesmo bloqueio da distribuição.

O descanso usa `af_mobile.descansos`, `fila_descanso`, proteção nas atualizações de disponibilidade e encerramento periódico. Cada pausa é contabilizada no início e a data segue America/Fortaleza.

`fila_pedido_efeito` consulta somente o pedido ativo da identidade vinculada ao token. O navegador mantém um cursor por identidade e um único consumo por evento; não há reprodução do pedido já existente na primeira sincronização. A configuração administrativa `animacoes_pedido_v1` aceita ativação, duração, cor e efeito de uma lista conhecida.

O código de configuração de produção é local e ignorado. Funções privilegiadas novas ficam no esquema privado `af_mobile`, com wrappers públicos `SECURITY INVOKER`. O acesso às tabelas é restrito, e não se usa CSS ou JavaScript remoto para atualizar funcionalidades.

## Documentação anterior

[Arquitetura da versão 5.3.1](ARQUITETURA-5.3.1.md) permanece como referência histórica. As notas `extension/ATUALIZACAO-*.txt` registram as mudanças recentes.
