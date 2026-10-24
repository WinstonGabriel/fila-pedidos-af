BEGIN;
ALTER TABLE public.fila_atribuicoes ADD COLUMN IF NOT EXISTS destino_apoio text NOT NULL DEFAULT 'contato' CHECK(destino_apoio IN ('contato','suporte'));
CREATE OR REPLACE FUNCTION af_mobile.suporte_exec(p_codigo text,p_token text,p_coord text,p_nome text,p_pedido text,p_remover boolean DEFAULT false,p_candidatos jsonb DEFAULT '[]') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a record; r public.fila_atribuicoes; n integer:=0;
BEGIN
 SELECT * INTO a FROM public.fila_ator(p_codigo,p_token,p_coord);
 IF p_pedido IS NULL OR length(p_pedido) NOT BETWEEN 1 AND 100 OR p_remover IS NULL THEN RAISE EXCEPTION 'Pedido inválido'; END IF;
 IF p_candidatos IS NULL OR jsonb_typeof(p_candidatos)<>'array' OR jsonb_array_length(p_candidatos)>1000 THEN RAISE EXCEPTION 'Lista de pedidos inválida'; END IF;
 PERFORM pg_advisory_xact_lock(802153,530);
 SELECT * INTO r FROM public.fila_atribuicoes WHERE pedido_id=p_pedido FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'ja_processado',true); END IF;
 IF p_remover THEN
  IF r.status<>'contato' OR r.destino_apoio<>'suporte' THEN RETURN jsonb_build_object('ok',true,'ja_processado',true); END IF;
  DELETE FROM public.fila_atribuicoes WHERE pedido_id=p_pedido;
  PERFORM public.fila_log(a.o_nome,a.o_coord,'removeu_de_suporte',r.analista,p_pedido,'Removido de suporte; disponível para distribuição');
 ELSE
  IF r.analista IS DISTINCT FROM p_nome OR r.status NOT IN ('em_andamento','contato') OR r.destino_apoio='suporte' THEN RETURN jsonb_build_object('ok',true,'ja_processado',true); END IF;
  UPDATE public.fila_atribuicoes SET status='contato',destino_apoio='suporte',atualizado_em=clock_timestamp() WHERE pedido_id=p_pedido;
  PERFORM public.fila_log(a.o_nome,a.o_coord,'marcou_para_suporte',r.analista,p_pedido,'Retido em suporte; fora da distribuição automática');
  n:=public.fila_auto_alocar(a.o_nome,a.o_coord,p_candidatos,r.analista);
 END IF;
 RETURN jsonb_build_object('ok',true,'pedido_id',p_pedido,'distribuidos',n);
END $$;
REVOKE ALL ON FUNCTION af_mobile.suporte_exec(text,text,text,text,text,boolean,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION af_mobile.suporte_exec(text,text,text,text,text,boolean,jsonb) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.fila_suporte(p_codigo text,p_token text,p_coord text,p_nome text,p_pedido text,p_remover boolean DEFAULT false,p_candidatos jsonb DEFAULT '[]') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT af_mobile.suporte_exec(p_codigo,p_token,p_coord,p_nome,p_pedido,p_remover,p_candidatos) $$;
REVOKE ALL ON FUNCTION public.fila_suporte(text,text,text,text,text,boolean,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fila_suporte(text,text,text,text,text,boolean,jsonb) TO anon,authenticated;
DO $patch$
DECLARE antes text; depois text;
BEGIN
 antes:=pg_get_functiondef('public.fila_auto_alocar(text,boolean,jsonb,text)'::regprocedure);
 IF position('marcou_para_suporte' IN antes)=0 THEN
  depois:=replace(antes,$a$'marcou_para_contato','liberou_pedido'$a$,$b$'marcou_para_contato','marcou_para_suporte','liberou_pedido'$b$);
  IF depois=antes THEN RAISE EXCEPTION 'Distribuição mudou: revise a prioridade'; END IF; EXECUTE depois;
 END IF;
 antes:=pg_get_functiondef('public.fila_devolver(text,text,text,text)'::regprocedure);
 IF position('removeu_de_suporte' IN antes)=0 THEN
  depois:=replace(antes,$a$WHEN 'contato' THEN 'removeu_de_contato'$a$,$b$WHEN 'contato' THEN CASE WHEN r.destino_apoio='suporte' THEN 'removeu_de_suporte' ELSE 'removeu_de_contato' END$b$);
  IF depois=antes THEN RAISE EXCEPTION 'Remoção mudou: revise a atualização'; END IF; EXECUTE depois;
 END IF;
END $patch$;
COMMIT;
