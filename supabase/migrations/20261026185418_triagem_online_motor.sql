CREATE FUNCTION af_mobile.triar_candidatos(p_candidatos jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE resultado jsonb;
BEGIN
 IF jsonb_typeof(p_candidatos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_candidatos)>1000 THEN RAISE EXCEPTION 'Lista de pedidos inválida'; END IF;
 -- A primeira chamada do alocador também registra o pedido se a observação
 -- assíncrona ainda não tiver chegado. Repetir a chamada não reinicia o prazo.
 INSERT INTO af_mobile.pedidos_capturados(pedido_id,href,hora,valor_centavos,estab,categoria)
  SELECT c->>'id',c->>'href',left(coalesce(c->>'hora',''),5),af_mobile.valor_centavos(c->>'valor'),left(coalesce(c->>'estab',''),200),left(coalesce(c->>'cat',''),120)
  FROM jsonb_array_elements(p_candidatos) c
  WHERE coalesce(c->>'id','') ~ '^[0-9]{10,20}$' AND coalesce(c->>'href','') ~ '^https://af\.mateusmais\.com\.br/pedido/[0-9a-fA-F-]{36}/?$'
  ON CONFLICT(pedido_id) DO NOTHING;
 -- O candidato ainda precisa estar na leitura atual enviada pelo painel.
 -- Clientes sem histórico de decisão retornam indisponivel: este resultado
 -- não prova aprovação, mas a presença atual na lista permite atendimento.
 SELECT coalesce(jsonb_agg(x.value ORDER BY x.ord),'[]'::jsonb) INTO resultado
 FROM jsonb_array_elements(p_candidatos) WITH ORDINALITY x(value,ord)
 JOIN af_mobile.pedidos_capturados p ON p.pedido_id=x.value->>'id' AND p.href=x.value->>'href'
 WHERE p.origem IS NULL AND p.af_situacao IN ('pendente','indisponivel')
  AND p.triagem_ate<=clock_timestamp() AND p.verificado_em>=p.triagem_ate
  AND p.verificado_em>clock_timestamp()-interval '30 seconds';
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION af_mobile.triar_candidatos(jsonb) FROM PUBLIC,anon,authenticated,service_role;
