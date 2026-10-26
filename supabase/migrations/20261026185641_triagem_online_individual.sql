DO $parte$
DECLARE antes text; depois text; alvo text;
BEGIN
 SELECT pg_get_functiondef('public.fila_puxar(text,text,text,text,jsonb)'::regprocedure) INTO antes;
 depois:=replace(antes,$a$jsonb_array_elements(coalesce(p_candidatos,'[]'::jsonb))$a$,
  $b$jsonb_array_elements(af_mobile.triar_candidatos(coalesce(p_candidatos,'[]'::jsonb)))$b$);
 IF depois=antes THEN RAISE EXCEPTION 'Fluxo individual mudou'; END IF;
 antes:=depois;
 depois:=replace(antes,$a$AND status='reservado' ORDER BY$a$,
  $b$AND status='reservado' AND NOT EXISTS(SELECT 1 FROM af_mobile.pedidos_capturados p WHERE p.pedido_id=public.fila_atribuicoes.pedido_id AND (p.origem='automatico' OR p.af_situacao IN ('automatico','autorizado_manual','cancelado'))) ORDER BY$b$);
 IF depois=antes THEN RAISE EXCEPTION 'Reserva individual mudou'; END IF;
 EXECUTE depois;


END $parte$;
