DO $parte$
DECLARE antes text; depois text; alvo text;
BEGIN
 SELECT pg_get_functiondef('public.fila_estado(text,text,text)'::regprocedure) INTO antes;
 alvo:=$a$AND NOT EXISTS(SELECT 1 FROM af_mobile.pedidos_capturados p WHERE p.pedido_id=q.pedido_id AND p.origem='automatico')$a$;
 depois:=replace(antes,alvo,$b$AND NOT EXISTS(SELECT 1 FROM af_mobile.pedidos_capturados p WHERE p.pedido_id=q.pedido_id AND (p.origem='automatico' OR (p.af_situacao='autorizado_manual' AND p.origem IS NULL)))$b$);
 IF depois=antes THEN RAISE EXCEPTION 'Projeção econômica do estado mudou'; END IF;
 EXECUTE depois;

 -- Campos extras preservam o contrato dos relatórios já instalados.

END $parte$;
