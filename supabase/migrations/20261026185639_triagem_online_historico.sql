DO $parte$
DECLARE antes text; depois text; alvo text;
BEGIN
 SELECT pg_get_functiondef('public.fila_historico_pagina(text,text,text,integer,text,bigint,text,text)'::regprocedure) INTO antes;
 depois:=replace(antes,$a$SELECT id, quando, ator, coord, acao, analista,$a$,
  $b$SELECT id, quando, ator, coord, CASE WHEN acao='aprovacao_origem_pendente' THEN 'registrou aprovação no AF com origem a confirmar' ELSE acao END AS acao, analista,$b$);
 IF depois=antes THEN RAISE EXCEPTION 'Apresentação do histórico mudou'; END IF;
 EXECUTE depois;

END $parte$;
