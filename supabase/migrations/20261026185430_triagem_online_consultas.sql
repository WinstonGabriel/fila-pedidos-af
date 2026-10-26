CREATE OR REPLACE FUNCTION af_mobile.pedidos_pendentes(p_codigo text,p_token text,p_coord text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb;
BEGIN
 PERFORM public.fila_ator(p_codigo,p_token,p_coord);
 WITH escolhidos AS (
  SELECT p.pedido_id FROM af_mobile.pedidos_capturados p
  WHERE p.href ~ '^https://af\.mateusmais\.com\.br/pedido/[0-9a-fA-F-]{36}/?$'
   AND p.proxima_consulta<=now()
   AND (p.af_situacao NOT IN ('automatico','autorizado_manual') OR
     (p.af_situacao='autorizado_manual' AND p.triagem_consultas<3))
   AND (p.triagem_ate<=now() OR EXISTS(SELECT 1 FROM public.fila_atribuicoes q WHERE q.pedido_id=p.pedido_id AND q.status IN ('em_andamento','reservado','contato')))
  ORDER BY CASE WHEN p.origem IS NULL AND p.af_situacao<>'autorizado_manual' AND p.primeiro_visto>now()-interval '5 minutes' AND NOT EXISTS(SELECT 1 FROM public.fila_atribuicoes q WHERE q.pedido_id=p.pedido_id) THEN 0
    WHEN p.af_situacao IN ('pendente','indisponivel') THEN 1 ELSE 2 END,
   p.proxima_consulta,p.primeiro_visto,p.pedido_id LIMIT 2 FOR UPDATE OF p SKIP LOCKED
 ), marcados AS (
  UPDATE af_mobile.pedidos_capturados p SET proxima_consulta=now()+interval '45 seconds',consulta_token=gen_random_uuid(),consulta_instalacao=p_token
  FROM escolhidos e WHERE p.pedido_id=e.pedido_id RETURNING p.pedido_id AS id,p.href,p.consulta_token
 ) SELECT coalesce(jsonb_agg(m),'[]'::jsonb) INTO r FROM marcados m;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION af_mobile.pedidos_pendentes(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION af_mobile.pedidos_pendentes(text,text,text) TO anon,authenticated,service_role;
