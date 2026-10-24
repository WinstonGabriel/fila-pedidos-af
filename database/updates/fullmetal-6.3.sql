BEGIN;
DO $patch$
DECLARE c jsonb; temas jsonb; nova_revisao int;
BEGIN
 SELECT valor::jsonb INTO c FROM public.fila_config WHERE chave='temas_catalogo_v1' FOR UPDATE;
 IF c IS NULL OR c->>'schema'<>'1' THEN RAISE EXCEPTION 'Catálogo incompatível'; END IF;
 SELECT jsonb_agg(CASE WHEN tema->>'id'='fullmetal-alchemist' THEN tema || $tema${"id": "fullmetal-alchemist", "nome": "Fullmetal Alchemist", "icone": "⚗️", "descricao": "Registro de transmutação: bronze envelhecido, aço automail e ouro alquímico.", "modo": "escuro", "estilo": "metal", "pulso": true, "novo": true, "energia": "#e63946", "cores": {"fundo": "#2b251e", "cartao": "#252b35", "texto": "#ebdfc8", "texto_secundario": "#c7baa1", "primaria": "#a92c36", "primaria_hover": "#8e202c", "primaria_texto": "#ffffff", "destaque": "#e2bd65", "destaque_hover": "#e7c45d", "destaque_texto": "#211a11", "borda": "#74634e", "link": "#edca80", "botao": "#423526", "botao_hover": "#594735", "borda_botao": "#9d815a", "input": "#211e1a", "desativado": "#282d37", "erro": "#ff9199", "sucesso": "#95d8b0", "aviso": "#d4af37", "vazio": "#94a3b8", "fundo_aviso": "#39331f", "borda_aviso": "#d4af37", "fundo_perigo": "#40252e", "borda_perigo": "#e63946", "meu_pedido": "#252b35", "borda_meu_pedido": "#d4af37", "chip": "#30291f", "atraso": "#40252e", "borda_atraso": "#e63946"}}$tema$::jsonb ELSE tema END ORDER BY ord) INTO temas FROM jsonb_array_elements(c->'temas') WITH ORDINALITY AS x(tema,ord);
 nova_revisao:=(c->>'revisao')::int+1;
 c:=jsonb_set(jsonb_set(c,'{temas}',temas),'{revisao}',to_jsonb(nova_revisao));
 UPDATE public.fila_config SET valor=c::text WHERE chave='temas_catalogo_v1';
 UPDATE public.fila_config SET valor=nova_revisao::text WHERE chave='temas_catalogo_revisao';
END $patch$;
COMMIT;
SELECT jsonb_build_object('revisao',valor::jsonb->'revisao','fullmetal',(SELECT t->'cores'->>'fundo' FROM jsonb_array_elements(valor::jsonb->'temas')t WHERE t->>'id'='fullmetal-alchemist')) FROM public.fila_config WHERE chave='temas_catalogo_v1';
