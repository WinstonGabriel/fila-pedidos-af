-- Retirada de contato/suporte é arquivamento operacional, não conclusão humana.
ALTER TABLE public.fila_atribuicoes ADD COLUMN apoio_saida_af_em timestamptz;
CREATE INDEX fila_apoio_saida_idx ON public.fila_atribuicoes(apoio_saida_af_em) WHERE apoio_saida_af_em IS NOT NULL;
CREATE FUNCTION af_mobile.registrar_saida_apoio() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF OLD.status='contato' AND NEW.status='concluido' THEN
  NEW.apoio_saida_af_em:=coalesce(NEW.apoio_saida_af_em,clock_timestamp());
  PERFORM public.fila_log('AF',false,'retirou_apoio_saida_af',OLD.analista,OLD.pedido_id,
   'Retirado automaticamente de '||CASE WHEN OLD.destino_apoio='suporte' THEN 'suporte' ELSE 'contato' END||'; saída do AF confirmada, sem crédito de conclusão humana');
 ELSIF OLD.apoio_saida_af_em IS NOT NULL AND NEW.status<>'concluido' THEN
  NEW.apoio_saida_af_em:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION af_mobile.registrar_saida_apoio() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER fila_registrar_saida_apoio BEFORE UPDATE OF status ON public.fila_atribuicoes FOR EACH ROW EXECUTE FUNCTION af_mobile.registrar_saida_apoio();

CREATE FUNCTION af_mobile.apoio_sincronizar_saida(p_codigo text,p_token text,p_coord text,p_ausentes jsonb,p_presentes jsonb,p_contexto text,p_completa boolean,p_total integer,p_menu integer,p_iniciada_em timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a record; r record; removidos integer:=0; retornados integer:=0; agora timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO a FROM public.fila_ator(p_codigo,p_token,p_coord);
 IF p_completa IS DISTINCT FROM true OR p_contexto IS DISTINCT FROM 'https://af.mateusmais.com.br/'
  OR p_total IS NULL OR p_menu IS DISTINCT FROM p_total OR p_total NOT BETWEEN 0 AND 5000
  OR p_iniciada_em IS NULL OR p_iniciada_em<agora-interval '4 minutes' OR p_iniciada_em>agora+interval '5 seconds' THEN
  RAISE EXCEPTION 'A retirada exige leitura completa, recente e sem filtros do AF';
 END IF;
 IF jsonb_typeof(p_ausentes) IS DISTINCT FROM 'array' OR jsonb_typeof(p_presentes) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Lote de apoio inválido'; END IF;
 IF jsonb_array_length(p_ausentes)>1000 OR jsonb_array_length(p_presentes)>1000 OR jsonb_array_length(p_presentes)>p_total
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_ausentes||p_presentes) x WHERE jsonb_typeof(x)<>'string' OR x#>>'{}' !~ '^[0-9]{10,20}$')
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_ausentes) x JOIN jsonb_array_elements(p_presentes) y ON x=y) THEN
  RAISE EXCEPTION 'IDs de apoio inválidos';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(802153,530);
 FOR r IN UPDATE public.fila_atribuicoes q SET status='concluido',apoio_saida_af_em=agora,atualizado_em=agora
  WHERE q.status='contato' AND q.apoio_saida_af_em IS NULL
   AND q.pedido_id IN (SELECT jsonb_array_elements_text(p_ausentes))
   -- Não encerra uma retenção criada/alterada depois do começo da leitura.
   AND q.atualizado_em<=least(p_iniciada_em,agora)-interval '2 seconds'
  RETURNING q.pedido_id LOOP removidos:=removidos+1; END LOOP;
 FOR r IN UPDATE public.fila_atribuicoes q SET status='contato',apoio_saida_af_em=NULL,atualizado_em=agora
  WHERE q.status='concluido' AND q.apoio_saida_af_em IS NOT NULL
   AND q.apoio_saida_af_em<p_iniciada_em AND q.pedido_id IN (SELECT jsonb_array_elements_text(p_presentes))
   AND NOT EXISTS(SELECT 1 FROM af_mobile.pedidos_capturados p WHERE p.pedido_id=q.pedido_id AND
    (p.origem IS NOT NULL OR p.af_situacao IN ('automatico','autorizado_manual','cancelado')))
  RETURNING q.pedido_id,q.analista LOOP
   PERFORM public.fila_log('AF',false,'retornou_apoio_af',r.analista,r.pedido_id,'Pedido voltou à lista completa do AF; retenção de apoio restaurada');
   retornados:=retornados+1;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'removidos',removidos,'retornados',retornados);
END $$;
REVOKE ALL ON FUNCTION af_mobile.apoio_sincronizar_saida(text,text,text,jsonb,jsonb,text,boolean,integer,integer,timestamptz) FROM PUBLIC;
CREATE FUNCTION public.fila_apoio_sincronizar_saida(p_codigo text,p_token text,p_coord text,p_ausentes jsonb,p_presentes jsonb,p_contexto text,p_completa boolean,p_total integer,p_menu integer,p_iniciada_em timestamptz)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT af_mobile.apoio_sincronizar_saida(p_codigo,p_token,p_coord,p_ausentes,p_presentes,p_contexto,p_completa,p_total,p_menu,p_iniciada_em)
$$;
REVOKE ALL ON FUNCTION public.fila_apoio_sincronizar_saida(text,text,text,jsonb,jsonb,text,boolean,integer,integer,timestamptz) FROM PUBLIC;
GRANT USAGE ON SCHEMA af_mobile TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION af_mobile.apoio_sincronizar_saida(text,text,text,jsonb,jsonb,text,boolean,integer,integer,timestamptz),public.fila_apoio_sincronizar_saida(text,text,text,jsonb,jsonb,text,boolean,integer,integer,timestamptz) TO anon,authenticated,service_role;

DO $patch$
DECLARE antes text; depois text;
BEGIN
 SELECT pg_get_functiondef('public.fila_estado(text,text,text)'::regprocedure) INTO antes;
 depois:=replace(antes,$a$WHERE status='concluido' AND atualizado_em<now()-interval '2 days'$a$, $b$WHERE status='concluido' AND apoio_saida_af_em IS NULL AND atualizado_em<now()-interval '2 days'$b$);
 depois:=replace(depois,$a$WHERE x.status<>'concluido' OR x.pedido_id IN ($a$, $b$WHERE x.apoio_saida_af_em IS NULL AND (x.status<>'concluido' OR x.pedido_id IN ($b$);
 depois:=replace(depois,$a$q WHERE q.status='concluido'$a$, $b$q WHERE q.status='concluido' AND q.apoio_saida_af_em IS NULL$b$);
 depois:=replace(depois,'ORDER BY q.atualizado_em DESC,q.pedido_id DESC LIMIT 8)),','ORDER BY q.atualizado_em DESC,q.pedido_id DESC LIMIT 8))),');
 depois:=replace(depois,'''concluidos_ids'',','''apoio_encerrados_ids'',(SELECT coalesce(json_agg(pedido_id),''[]''::json) FROM public.fila_atribuicoes WHERE apoio_saida_af_em IS NOT NULL),''concluidos_ids'',');
 IF depois=antes OR position('WHERE x.apoio_saida_af_em IS NULL' IN depois)=0 THEN RAISE EXCEPTION 'Revisar contrato de fila_estado'; END IF;
 EXECUTE depois;
 SELECT pg_get_functiondef('af_mobile.pedidos_conciliar(text,text,text,jsonb)'::regprocedure) INTO antes;
 depois:=replace(antes,$a$status IN ('em_andamento','reservado','devolvido')$a$, $b$status IN ('em_andamento','reservado','devolvido','contato')$b$);
 depois:=replace(depois,'  -- Falha posterior de leitura não desfaz uma decisão já confirmada.', $novo$  IF situacao='cancelado' AND coalesce(p->>'status_atual','') ~* 'cancelad' THEN
   UPDATE public.fila_atribuicoes SET status='concluido',atualizado_em=now() WHERE pedido_id=q.pedido_id AND status='contato';
  END IF;
  -- Falha posterior de leitura não desfaz uma decisão já confirmada.$novo$);
 IF depois=antes OR position($a$'devolvido','contato'$a$ IN depois)=0 THEN RAISE EXCEPTION 'Revisar contrato de conciliação AF'; END IF;
 EXECUTE depois;
END $patch$;

-- Corrige somente retenções cuja saída já está comprovada no estado AF salvo.
UPDATE public.fila_atribuicoes q SET status='concluido',atualizado_em=clock_timestamp()
 WHERE q.status='contato' AND EXISTS(SELECT 1 FROM af_mobile.pedidos_capturados p WHERE p.pedido_id=q.pedido_id
  AND p.verificado_em IS NOT NULL AND p.af_situacao IN ('automatico','autorizado_manual','cancelado'));
NOTIFY pgrst,'reload schema';
