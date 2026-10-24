BEGIN;
INSERT INTO public.fila_config(chave,valor) VALUES('animacoes_pedido_v1','{"schema":1,"revisao":1,"ativo":true,"duracao_ms":3200,"temas":{},"analistas":{}}') ON CONFLICT(chave) DO NOTHING;
CREATE OR REPLACE FUNCTION af_mobile.pedido_efeito(p_codigo text,p_token text,p_coord text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n text; pedido jsonb; config jsonb; ultimo bigint;
BEGIN
 PERFORM public.fila_ator(p_codigo,p_token,NULL,false);
 SELECT nome INTO n FROM public.fila_usuarios WHERE token=p_token;
 IF n IS NULL THEN RETURN jsonb_build_object('nome',NULL,'pedido',NULL,'ultimo_evento',0); END IF;
 SELECT coalesce(max(id),0) INTO ultimo FROM public.fila_historico WHERE analista=n AND acao='recebeu_pedido';
 SELECT jsonb_build_object('id',a.pedido_id,'evento_id',h.id,'quando',h.quando) INTO pedido
 FROM public.fila_atribuicoes a JOIN LATERAL (
  SELECT id,quando FROM public.fila_historico WHERE analista=n AND pedido_id=a.pedido_id AND acao='recebeu_pedido' ORDER BY id DESC LIMIT 1
 )h ON true WHERE a.analista=n AND a.status='em_andamento' LIMIT 1;
 SELECT valor::jsonb INTO config FROM public.fila_config WHERE chave='animacoes_pedido_v1';
 RETURN jsonb_build_object('nome',n,'pedido',pedido,'ultimo_evento',ultimo,'config',config,'servidor_em',clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION af_mobile.pedido_efeito(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION af_mobile.pedido_efeito(text,text,text) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.fila_pedido_efeito(p_codigo text,p_token text,p_coord text DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT af_mobile.pedido_efeito(p_codigo,p_token,p_coord) $$;
REVOKE ALL ON FUNCTION public.fila_pedido_efeito(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fila_pedido_efeito(text,text,text) TO anon,authenticated;
COMMIT;
