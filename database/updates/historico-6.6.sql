BEGIN;
CREATE INDEX IF NOT EXISTS fila_historico_pedido_id_idx ON public.fila_historico(pedido_id,id DESC) WHERE pedido_id IS NOT NULL;
CREATE OR REPLACE VIEW af_mobile.historico_exibicao WITH (security_invoker=true) AS
 SELECT h.id,h.quando,
 CASE WHEN h.acao='recebeu_pedido' THEN
   CASE WHEN anterior.acao='liberou_pedido' AND anterior.analista IS DISTINCT FROM h.analista THEN anterior.analista ELSE h.analista END
 ELSE h.ator END AS ator,
 h.coord,h.acao,h.analista,h.pedido_id,h.detalhe,h.ator AS ator_tecnico,
 CASE WHEN h.acao<>'recebeu_pedido' THEN NULL
      WHEN anterior.acao='liberou_pedido' AND anterior.analista IS DISTINCT FROM h.analista THEN 'redistribuicao'
      WHEN h.detalhe LIKE 'Distribuição automática;%' OR h.detalhe LIKE 'Redistribuição %' OR h.detalhe LIKE 'Direcionamento por loja; liberado por %' THEN 'automatica'
      ELSE 'recebimento' END AS modalidade,
 CASE WHEN h.acao='recebeu_pedido' AND anterior.acao='liberou_pedido' AND anterior.analista IS DISTINCT FROM h.analista
   THEN jsonb_build_object('id',anterior.id,'analista',anterior.analista,'ator',anterior.ator,'quando',anterior.quando) END AS origem_liberacao
 FROM public.fila_historico h
 LEFT JOIN LATERAL (
  SELECT p.id,p.quando,p.acao,p.analista,p.ator FROM public.fila_historico p
  WHERE h.acao='recebeu_pedido' AND p.pedido_id=h.pedido_id AND p.id<h.id
  ORDER BY p.id DESC LIMIT 1
 ) anterior ON true;
REVOKE ALL ON af_mobile.historico_exibicao FROM PUBLIC,anon,authenticated;
DO $patch$
DECLARE antes text; depois text;
BEGIN
 antes:=pg_get_functiondef('public.fila_historico_pagina(text,text,text,integer,text,bigint,text,text)'::regprocedure);
 IF position('af_mobile.historico_exibicao' IN antes)=0 THEN
  depois:=replace(antes,'SELECT id, quando, ator, coord, acao, analista, pedido_id, detalhe','SELECT id, quando, ator, coord, acao, analista, pedido_id, detalhe, modalidade, origem_liberacao, ator_tecnico');
  depois:=replace(depois,E'FROM public.fila_historico\n    WHERE (p_analista',E'FROM af_mobile.historico_exibicao\n    WHERE (p_analista');
  IF depois=antes OR position('af_mobile.historico_exibicao' IN depois)=0 THEN RAISE EXCEPTION 'Consulta do histórico mudou. Revise a atualização.'; END IF;
  EXECUTE depois;
 END IF;
 antes:=pg_get_functiondef('public.fila_historico(text,text,text,integer,text)'::regprocedure);
 IF position('af_mobile.historico_exibicao' IN antes)=0 THEN
  depois:=replace(antes,E'from fila_historico\n       where',E'from af_mobile.historico_exibicao\n       where');
  IF depois=antes THEN RAISE EXCEPTION 'Consulta legada mudou. Revise a atualização.'; END IF;
  EXECUTE depois;
 END IF;
END $patch$;
COMMIT;
