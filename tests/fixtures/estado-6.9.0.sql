-- Definição anterior, sem dados operacionais nem credenciais.
CREATE OR REPLACE FUNCTION public.fila_estado(p_codigo text, p_token text DEFAULT NULL::text, p_coord text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a record;
BEGIN
 SELECT * INTO a FROM public.fila_ator(p_codigo,p_token,p_coord,false);
 IF random()<0.03 THEN DELETE FROM public.fila_atribuicoes WHERE status='concluido' AND atualizado_em<now()-interval '2 days'; END IF;
 RETURN json_build_object(
 'analistas',(SELECT coalesce(json_agg(x),'[]'::json) FROM public.fila_analistas x),
 'atribuicoes',(SELECT coalesce(json_agg(x ORDER BY x.criado_em),'[]'::json) FROM public.fila_atribuicoes x),
 'janela',(SELECT coalesce(json_object_agg(chave,valor),'{}'::json) FROM public.fila_config WHERE chave NOT IN ('codigo','codigo_coord','temas_catalogo_v1')),
 'usuarios',(SELECT coalesce(json_agg(json_build_object('nome',u.nome,'meu',u.token=p_token)),'[]'::json) FROM public.fila_usuarios u),
 'automaticos',(SELECT coalesce(json_agg(t),'[]'::json) FROM (SELECT pedido_id,href,concluido_em,CASE WHEN valor_centavos IS NULL THEN NULL ELSE 'R$ '||replace(to_char(valor_centavos/100.0,'FM9999999990.00'),'.',',') END AS valor FROM af_mobile.pedidos_capturados WHERE origem='automatico' AND concluido_em>now()-interval '2 days' ORDER BY concluido_em DESC LIMIT 100)t),
 'coord',a.o_coord,'gestao_nome',CASE WHEN a.o_coord THEN a.o_nome END,'gestao_versao',6,
 'eventos_versao',(SELECT coalesce(max(id),0) FROM public.fila_eventos),
 'preferencias_analistas',(SELECT coalesce(json_object_agg(analista,lojas),'{}'::json) FROM public.fila_preferencias_analista),
 'direcionamentos_lojas',(SELECT coalesce(json_agg(r ORDER BY r.loja),'[]'::json) FROM public.fila_rotas_loja r));
END $function$

;
