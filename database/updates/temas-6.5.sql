BEGIN;
DO $patch$
DECLARE c jsonb; temas jsonb; revisao int;
BEGIN
 SELECT valor::jsonb INTO c FROM public.fila_config WHERE chave='temas_catalogo_v1' FOR UPDATE;
 IF c IS NULL OR c->>'schema'<>'1' THEN RAISE EXCEPTION 'Catálogo incompatível'; END IF;
 SELECT coalesce(jsonb_agg(t ORDER BY ord),'[]'::jsonb) INTO temas FROM jsonb_array_elements(c->'temas') WITH ORDINALITY x(t,ord) WHERE t->>'id'<>'nuvens';
 temas:=temas || jsonb_build_array($nuvens${"id": "nuvens", "nome": "Nuvens", "icone": "☁️", "descricao": "Céu suave, nuvens brancas e painéis azul-profundo.", "modo": "claro", "estilo": "nuvens", "pulso": false, "novo": true, "cores": {"fundo": "#d9eff7", "cartao": "#f7fcff", "texto": "#243d50", "texto_secundario": "#435f73", "primaria": "#216b94", "primaria_hover": "#195778", "primaria_texto": "#ffffff", "destaque": "#276b8b", "destaque_hover": "#1c526d", "destaque_texto": "#ffffff", "borda": "#a4c6d8", "link": "#195d83", "botao": "#f4fbff", "botao_hover": "#ffffff", "borda_botao": "#9cbfd1", "input": "#ffffff", "desativado": "#e2edf3", "erro": "#a62232", "sucesso": "#14653f", "aviso": "#815409", "vazio": "#496375", "fundo_aviso": "#fff6df", "borda_aviso": "#ba9646", "fundo_perigo": "#fff0f2", "borda_perigo": "#c98d98", "meu_pedido": "#edf8ff", "borda_meu_pedido": "#468ab2", "chip": "#edf7fc", "atraso": "#fff0f2", "borda_atraso": "#bc425a"}, "energia": "#277ca8"}$nuvens$::jsonb);
 revisao:=greatest((c->>'revisao')::int+1,4);
 UPDATE public.fila_config SET valor=jsonb_set(jsonb_set(c,'{temas}',temas),'{revisao}',to_jsonb(revisao))::text WHERE chave='temas_catalogo_v1';
 UPDATE public.fila_config SET valor=revisao::text WHERE chave='temas_catalogo_revisao';
END $patch$;
COMMIT;
SELECT jsonb_build_object('revisao',valor::jsonb->'revisao','total',jsonb_array_length(valor::jsonb->'temas')) FROM public.fila_config WHERE chave='temas_catalogo_v1';
