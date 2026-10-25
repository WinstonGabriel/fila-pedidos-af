-- Definições anteriores à correção, sem dados operacionais ou credenciais.
CREATE OR REPLACE FUNCTION public.fila_auto_alocar(p_ator text, p_coord boolean, p_candidatos jsonb, p_prioridade text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE r public.fila_atribuicoes; pessoa record; c jsonb; destino text; rota text;
  quantidade integer := 0; precisa_fv boolean; pool jsonb := coalesce(p_candidatos,'[]'::jsonb);
BEGIN
  IF jsonb_typeof(pool) <> 'array' OR jsonb_array_length(pool)>1000 THEN RAISE EXCEPTION 'Lista de pedidos inválida'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(802153,530);
  SELECT coalesce(jsonb_agg(c.value || jsonb_build_object('_destino_loja',public.fila_destino_loja(c.value->>'estab')) ORDER BY c.ord),'[]'::jsonb) INTO pool
    FROM jsonb_array_elements(pool) WITH ORDINALITY c(value,ord);
  UPDATE public.fila_atribuicoes q SET categoria=c.value->>'cat'
    FROM jsonb_array_elements(pool) c
   WHERE q.pedido_id=c.value->>'id' AND q.categoria='' AND coalesce(c.value->>'cat','')<>'';

  -- Reservas manuais continuam exclusivas do analista que as criou.
  FOR r IN SELECT q.* FROM public.fila_atribuicoes q
    JOIN public.fila_analistas a ON a.nome=q.analista AND a.ligado
    JOIN public.fila_usuarios u ON u.nome=a.nome
    WHERE q.status='reservado' ORDER BY q.criado_em,q.pedido_id
  LOOP
    IF NOT EXISTS(SELECT 1 FROM public.fila_atribuicoes WHERE analista=r.analista AND status='em_andamento') THEN
      UPDATE public.fila_atribuicoes SET status='em_andamento',criado_em=now(),atualizado_em=now() WHERE pedido_id=r.pedido_id;
      PERFORM public.fila_log(p_ator,p_coord,'recebeu_pedido',r.analista,r.pedido_id,'Distribuição automática; reserva manual');
      quantidade := quantidade+1;
    END IF;
  END LOOP;

  -- Liberar mantém o sorteio entre os outros analistas elegíveis e livres.
  FOR r IN SELECT * FROM public.fila_atribuicoes WHERE status='devolvido' ORDER BY atualizado_em,pedido_id
  LOOP
    rota:=public.fila_destino_loja(r.estab);
    precisa_fv := (r.categoria || ' ' || r.estab) ~* 'for[cç]a[[:space:]]+de[[:space:]]+vendas'
      OR (r.categoria='' AND r.analista IN ('Cássio','Gabriel'));
    SELECT a.nome INTO destino FROM public.fila_analistas a JOIN public.fila_usuarios u ON u.nome=a.nome
      WHERE a.ligado AND (a.nome<>r.analista OR rota=a.nome)
        AND (public.fila_destino_loja(r.estab) IS NULL OR rota=a.nome)
        AND (NOT precisa_fv OR a.nome IN ('Cássio','Gabriel'))
        AND NOT EXISTS(SELECT 1 FROM public.fila_atribuicoes q WHERE q.analista=a.nome AND q.status='em_andamento')
      ORDER BY random() LIMIT 1 FOR UPDATE OF a;
    IF destino IS NOT NULL THEN
      UPDATE public.fila_atribuicoes SET analista=destino,status='em_andamento',criado_em=now(),atualizado_em=now() WHERE pedido_id=r.pedido_id;
      PERFORM public.fila_log(p_ator,p_coord,'recebeu_pedido',destino,r.pedido_id,(CASE WHEN rota IS NULL THEN 'Redistribuição aleatória; liberado por ' ELSE 'Direcionamento por loja; liberado por ' END) || r.analista);
      quantidade := quantidade+1;
    END IF;
  END LOOP;

  -- A ordem do histórico é compartilhada entre as máquinas. O ID do evento,
  -- diferente de now(), também ordena conclusões feitas na mesma transação.
  -- Alterar horários enquanto já está ON não muda a posição de espera.
  -- p_prioridade permanece na assinatura por compatibilidade; o chamador não
  -- passa à frente de quem ficou livre antes.
  FOR pessoa IN SELECT a.nome FROM public.fila_analistas a JOIN public.fila_usuarios u ON u.nome=a.nome
    LEFT JOIN LATERAL (
      SELECT greatest(
        (SELECT max(h.id) FROM public.fila_historico h WHERE h.analista=a.nome
          AND h.acao IN ('concluiu_pedido','marcou_para_contato','marcou_para_suporte','liberou_pedido','devolveu_pedido_a_fila','assumiu_nome')),
        (SELECT min(h.id) FROM public.fila_historico h WHERE h.analista=a.nome
          AND h.acao='alterou_disponibilidade' AND h.detalhe LIKE 'ON=sim,%'
          AND h.id > coalesce((SELECT max(d.id) FROM public.fila_historico d WHERE d.analista=a.nome
            AND d.acao='alterou_disponibilidade' AND d.detalhe LIKE 'ON=não,%'),0))
      ) AS ordem
    ) livre ON true
    WHERE a.ligado AND NOT EXISTS(SELECT 1 FROM public.fila_atribuicoes q WHERE q.analista=a.nome AND q.status='em_andamento')
    ORDER BY livre.ordem ASC NULLS FIRST,a.atualizado_em,a.nome FOR UPDATE OF a
  LOOP
    -- Não agrupar por hora: IDs diferentes continuam sendo pedidos distintos,
    -- mesmo que todos tenham exatamente o mesmo horário no painel.
    FOR c IN SELECT value FROM jsonb_array_elements(pool) WITH ORDINALITY AS p(value,ordem)
      WHERE (value->>'_destino_loja') IS NULL OR (value->>'_destino_loja')=pessoa.nome
      ORDER BY ((value->>'_destino_loja')=pessoa.nome) DESC NULLS LAST, EXISTS(SELECT 1 FROM public.fila_preferencias_analista pa CROSS JOIN LATERAL jsonb_array_elements_text(pa.lojas) l(loja) WHERE pa.analista=pessoa.nome AND strpos(lower(coalesce(value->>'estab','')),lower(l.loja))>0) DESC, coalesce((value->>'preferencia')::boolean,false) DESC,ordem
    LOOP
      IF coalesce(c->>'id','')='' THEN CONTINUE; END IF;
      IF (coalesce(c->>'cat','') || ' ' || coalesce(c->>'estab','')) ~* 'for[cç]a[[:space:]]+de[[:space:]]+vendas'
        AND pessoa.nome NOT IN ('Cássio','Gabriel') THEN CONTINUE; END IF;
      INSERT INTO public.fila_atribuicoes(pedido_id,analista,status,hora,valor,estab,href,categoria)
      VALUES(c->>'id',pessoa.nome,'em_andamento',coalesce(c->>'hora',''),coalesce(c->>'valor',''),coalesce(c->>'estab',''),coalesce(c->>'href',''),coalesce(c->>'cat',''))
      ON CONFLICT(pedido_id) DO NOTHING;
      IF FOUND THEN
        PERFORM public.fila_log(p_ator,p_coord,'recebeu_pedido',pessoa.nome,c->>'id','Distribuição automática; ordem de disponibilidade; ' || coalesce(c->>'estab',''));
        quantidade := quantidade+1;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
  RETURN quantidade;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fila_distribuir_auto(p_codigo text, p_token text, p_coord text, p_candidatos jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a record; n integer;
BEGIN
  SELECT * INTO a FROM public.fila_ator(p_codigo,p_token,p_coord);
  IF NOT a.o_coord AND NOT EXISTS(SELECT 1 FROM public.fila_analistas WHERE nome=a.o_nome AND ligado) THEN
    RETURN json_build_object('ok',true,'distribuidos',0);
  END IF;
  n := public.fila_auto_alocar(a.o_nome,a.o_coord,p_candidatos,a.o_nome);
  RETURN json_build_object('ok',true,'distribuidos',n);
END;
$function$;

