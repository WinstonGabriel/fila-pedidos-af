DO $parte$
DECLARE antes text; depois text; alvo text;
BEGIN
 SELECT pg_get_functiondef('public.fila_auto_alocar(text,boolean,jsonb,text)'::regprocedure) INTO antes;
 depois:=replace(antes,'  -- conciliacao_af_v690:',E'  -- triagem_online_v1: decisão após dez segundos, antes de atribuir.\n  pool:=af_mobile.triar_candidatos(pool);\n  -- conciliacao_af_v690:');
 IF depois=antes THEN RAISE EXCEPTION 'Base do alocador mudou'; END IF;
 antes:=depois;
 depois:=replace(antes,$a$WHERE q.status='reservado' ORDER BY$a$,
  $b$WHERE q.status='reservado' AND NOT EXISTS(SELECT 1 FROM af_mobile.pedidos_capturados p WHERE p.pedido_id=q.pedido_id AND (p.origem='automatico' OR p.af_situacao IN ('automatico','autorizado_manual','cancelado'))) ORDER BY$b$);
 IF depois=antes THEN RAISE EXCEPTION 'Seleção de reservas mudou'; END IF;
 antes:=depois;
 depois:=replace(antes,$a$WHERE status='devolvido' ORDER BY$a$,
  $b$WHERE status='devolvido' AND NOT EXISTS(SELECT 1 FROM af_mobile.pedidos_capturados p WHERE p.pedido_id=public.fila_atribuicoes.pedido_id AND (p.origem='automatico' OR p.af_situacao IN ('automatico','autorizado_manual','cancelado'))) ORDER BY$b$);
 IF depois=antes THEN RAISE EXCEPTION 'Seleção de devolvidos mudou'; END IF;
 EXECUTE depois;


END $parte$;
