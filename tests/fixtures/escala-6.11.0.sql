-- Contratos anteriores da escala, sem dados operacionais.
CREATE OR REPLACE FUNCTION public.fila_escala_consultar(p_codigo text, p_token text, p_coord text, p_inicio date, p_fim date, p_analista text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 PERFORM public.fila_ator(p_codigo,p_token,p_coord,false);
 IF p_inicio IS NULL OR p_fim IS NULL OR p_fim<p_inicio OR p_fim-p_inicio>366 THEN RAISE EXCEPTION 'Selecione até 366 dias'; END IF;
 RETURN json_build_object('itens',(SELECT coalesce(json_agg(e ORDER BY e.data,e.analista),'[]'::json) FROM public.fila_escala e WHERE e.data BETWEEN p_inicio AND p_fim AND (nullif(p_analista,'') IS NULL OR e.analista=p_analista)), 'versao',(SELECT coalesce(max(id),0) FROM public.fila_eventos));
END $function$
;
CREATE OR REPLACE FUNCTION public.fila_escala_salvar(p_codigo text, p_token text, p_coord text, p_itens jsonb, p_origem text DEFAULT 'Edição manual'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a record; c jsonb; anterior public.fila_escala; novo public.fila_escala; n integer:=0; d date; alvo text;
BEGIN
 SELECT * INTO a FROM public.fila_ator(p_codigo,p_token,p_coord);
 IF NOT a.o_coord THEN RAISE EXCEPTION 'Somente Coordenação/Gestão pode alterar a escala'; END IF;
 IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' OR jsonb_array_length(p_itens) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Selecione entre 1 e 5000 dias'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_itens) x GROUP BY x->>'analista',x->>'data' HAVING count(*)>1) THEN RAISE EXCEPTION 'Há dias duplicados na seleção'; END IF;
 PERFORM pg_advisory_xact_lock(802153,601);
 FOR c IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
  alvo:=c->>'analista'; d:=(c->>'data')::date;
  IF d IS NULL OR d NOT BETWEEN date '2020-01-01' AND date '2100-12-31' THEN RAISE EXCEPTION 'Data inválida'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.fila_analistas f WHERE f.nome=alvo) THEN RAISE EXCEPTION 'Analista inválido: %',alvo; END IF;
  SELECT * INTO anterior FROM public.fila_escala e WHERE e.analista=alvo AND e.data=d;
  IF coalesce((c->>'versao')::integer,-1)<>coalesce(anterior.versao,0) THEN RAISE EXCEPTION 'A escala de % em % mudou. Atualize e revise antes de salvar.',alvo,d; END IF;
  INSERT INTO public.fila_escala AS e(analista,data,tipo,inicio,fim,observacao,presenca,atualizado_por,versao)
   VALUES(alvo,d,c->>'tipo',coalesce(c->>'inicio',''),coalesce(c->>'fim',''),coalesce(c->>'observacao',''),coalesce(c->>'presenca','nao_informada'),a.o_nome,coalesce(anterior.versao,0)+1)
   ON CONFLICT(analista,data) DO UPDATE SET tipo=excluded.tipo,inicio=excluded.inicio,fim=excluded.fim,observacao=excluded.observacao,presenca=excluded.presenca,atualizado_por=excluded.atualizado_por,atualizado_em=now(),versao=e.versao+1
   WHERE (e.tipo,e.inicio,e.fim,e.observacao,e.presenca) IS DISTINCT FROM (excluded.tipo,excluded.inicio,excluded.fim,excluded.observacao,excluded.presenca) RETURNING * INTO novo;
  IF FOUND THEN
   INSERT INTO public.fila_eventos(analista,tipo,ator,detalhe) VALUES(alvo,'escala',a.o_nome,jsonb_build_object('data',d,'antes',to_jsonb(anterior),'depois',to_jsonb(novo),'origem',left(p_origem,160)));
   PERFORM public.fila_log(a.o_nome,true,'alterou_escala',alvo,NULL,d::text||' · '||novo.tipo||' · '||left(p_origem,100)); n:=n+1;
  END IF;
 END LOOP;
 RETURN json_build_object('ok',true,'alterados',n);
END $function$
;
