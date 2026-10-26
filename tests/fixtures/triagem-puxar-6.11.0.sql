-- Contrato anterior da fila individual, sem dados operacionais.
CREATE OR REPLACE FUNCTION public.fila_puxar(p_codigo text, p_token text, p_coord text, p_analista text, p_candidatos jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a record; c jsonb; r public.fila_atribuicoes;
BEGIN
  SELECT * INTO a FROM public.fila_ator(p_codigo,p_token,p_coord);
  PERFORM public.fila_autoriza(a.o_nome,a.o_coord,p_analista);
  PERFORM pg_catalog.pg_advisory_xact_lock(802153,530);
  SELECT * INTO r FROM public.fila_atribuicoes WHERE analista=p_analista AND status='em_andamento' LIMIT 1;
  IF FOUND THEN RETURN row_to_json(r); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.fila_analistas WHERE nome=p_analista AND ligado) THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.fila_atribuicoes WHERE analista=p_analista AND status='reservado' ORDER BY criado_em LIMIT 1;
  IF FOUND THEN
    UPDATE public.fila_atribuicoes SET status='em_andamento',criado_em=now(),atualizado_em=now() WHERE pedido_id=r.pedido_id RETURNING * INTO r;
    PERFORM public.fila_log(a.o_nome,a.o_coord,'recebeu_pedido',p_analista,r.pedido_id,'Reserva manual');
    RETURN row_to_json(r);
  END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(coalesce(p_candidatos,'[]'::jsonb)) WITH ORDINALITY p(value,ordem)
    WHERE public.fila_destino_loja(value->>'estab') IS NULL OR public.fila_destino_loja(value->>'estab')=p_analista
    ORDER BY (public.fila_destino_loja(value->>'estab')=p_analista) DESC NULLS LAST,ordem LOOP
    IF (coalesce(c->>'cat','') || ' ' || coalesce(c->>'estab','')) ~* 'for[cç]a[[:space:]]+de[[:space:]]+vendas' AND p_analista NOT IN ('Cássio','Gabriel') THEN CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM public.fila_atribuicoes WHERE pedido_id=c->>'id') THEN CONTINUE; END IF;
    INSERT INTO public.fila_atribuicoes(pedido_id,analista,status,hora,valor,estab,href,categoria)
    VALUES(c->>'id',p_analista,'em_andamento',coalesce(c->>'hora',''),coalesce(c->>'valor',''),coalesce(c->>'estab',''),coalesce(c->>'href',''),coalesce(c->>'cat',''))
    ON CONFLICT(pedido_id) DO NOTHING RETURNING * INTO r;
    IF FOUND THEN
      PERFORM public.fila_log(a.o_nome,a.o_coord,'recebeu_pedido',p_analista,r.pedido_id,coalesce(c->>'estab',''));
      RETURN row_to_json(r);
    END IF;
  END LOOP;
  RETURN NULL;
END;
$function$
;
