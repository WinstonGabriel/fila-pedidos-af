# Configuração online das animações

Configuração privada em `public.fila_config`, chave `animacoes_pedido_v1`; leitura autenticada por `fila_pedido_efeito`. As tabelas não são expostas ao cliente. Os ajustes abaixo são administrativos, com acesso ao banco. Não há novo editor no painel de Gestão.

```json
{"schema":1,"revisao":1,"ativo":true,"duracao_ms":3200,"temas":{},"analistas":{}}
```

Exemplo de opções por tema: `"nuvens":{"ativo":true,"efeito":"nuvens","duracao_ms":2000,"cor":"#277ca8"}` dentro de `temas`.
Exemplo de opção individual: `"Gabriel":{"ativo":false}` dentro de `analistas`.

Prioridade de efeito, duração e cor: analista, tema, padrão. Um OFF em qualquer nível prevalece. IDs de tema são os do catálogo; nomes de analista usam a grafia exata, incluindo Cássio. Duração aceita: inteiro de 1200 a 6000 ms; cor aceita: hexadecimal de seis dígitos.

Efeitos locais permitidos: `pulso`, `nuvens`, `alquimia`, `hextech`, `tricolor`, `aurora`, `teia`, `chamas`, `gelo`, `caveira`. Valores inválidos usam os padrões; não é permitido CSS, HTML, URL ou JavaScript remoto.

As mudanças são consultadas pela página AF visível a cada cinco segundos e pelo painel durante a sincronização, com limite de uma consulta a cada dois segundos neste navegador. O desligamento remoto também encerra o aviso em tela na próxima consulta. OFF não reproduz o evento antigo quando reativado.

O evento é o ID do recebimento no histórico do pedido ativo do próprio usuário. O serviço serializa a marcação de consumo para impedir duas exibições no mesmo navegador. A primeira consulta cria referência sem reproduzir o pedido atual. Eventos acima de 90 segundos não geram aviso; eventos aguardando tela expiram após 30 segundos. Nenhuma alteração em pedidos ou status é realizada pelo motor.
