# Imagem online de Para suporte — 6.8.2

Não há migração de esquema nem novas permissões. A extensão lê o campo opcional `layout.icone_suporte_url` do documento já existente `public.fila_config.cliente_config_v1`, devolvido pela RPC da equipe. O botão e o título da lista usam a mesma imagem. Sem URL, o SVG original continua ativo.

Depois da atualização inicial para 6.8.2, uma conexão administrativa pode trocar a URL para todas as instalações dessa equipe. Elas recebem a configuração na próxima sincronização; painéis fechados recebem ao abrir. A configuração e o cache mantêm o isolamento por equipe e instalação. Versões anteriores ignoram esse campo e continuam com o ícone embutido.

Hospede uma imagem pública em HTTPS e use sua URL direta. Não use páginas de compartilhamento que exibem uma tela em vez do arquivo, nem links temporários que exigem autenticação. Para substituir o arquivo no mesmo endereço, use uma URL nova ou acrescente uma versão, por exemplo `?v=2`, para renovar o cache do navegador. Para voltar ao original, use uma string vazia.

Exemplo parametrizado: `$1` é a URL nova (ou string vazia), vinculada pelo cliente SQL administrativo. Preserve os outros campos do documento:

```sql
UPDATE public.fila_config
SET valor = jsonb_set(
  valor::jsonb || jsonb_build_object('revisao', coalesce((valor::jsonb->>'revisao')::bigint,0)+1),
  '{layout}',
  coalesce(valor::jsonb->'layout','{}'::jsonb) || jsonb_build_object('icone_suporte_url',$1::text)
)::text
WHERE chave='cliente_config_v1' AND valor::jsonb->>'schema'='1'
RETURNING valor::jsonb->'revisao' AS revisao,
          valor::jsonb->'layout'->>'icone_suporte_url' AS icone_suporte_url;
```

O cliente aceita no máximo 2.048 caracteres, somente HTTPS e URLs sem usuário/senha. A imagem é carregada como `img`, com tamanho fixo e sem Referer; o conteúdo não vira HTML ou código executável. Só substitui o desenho após carregar. Uma falha preserva o botão com o SVG original; a sincronização permite outra tentativa após 30 segundos. Respostas de imagens antigas são descartadas se a configuração mudar durante o carregamento.
