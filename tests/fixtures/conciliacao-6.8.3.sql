-- Definições anteriores, sem dados operacionais ou credenciais.
CREATE OR REPLACE FUNCTION public.fila_avancar(p_codigo text, p_token text, p_coord text, p_analista text, p_pedido_id text, p_acao text, p_candidatos jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a record; r public.fila_atribuicoes; n integer;
BEGIN
  SELECT * INTO a FROM public.fila_ator(p_codigo,p_token,p_coord);
  IF p_acao IS DISTINCT FROM 'contato' THEN
    PERFORM public.fila_autoriza(a.o_nome,a.o_coord,p_analista);
  END IF;
  IF p_acao NOT IN ('concluir','liberar','contato') OR p_acao IS NULL THEN RAISE EXCEPTION 'Ação inválida'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(802153,530);
  SELECT * INTO r FROM public.fila_atribuicoes WHERE analista=p_analista AND status='em_andamento' AND pedido_id=p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('ok',true,'ja_processado',true,'distribuidos',0); END IF;
  IF p_acao='liberar' THEN
    UPDATE public.fila_atribuicoes SET status='devolvido',atualizado_em=now() WHERE pedido_id=r.pedido_id;
    PERFORM public.fila_log(a.o_nome,a.o_coord,'liberou_pedido',p_analista,r.pedido_id,'Devolvido à fila; aguarda outro analista ON e disponível');
  ELSIF p_acao='concluir' THEN
    UPDATE public.fila_atribuicoes SET status='concluido',atualizado_em=now() WHERE pedido_id=r.pedido_id;
    PERFORM public.fila_log(a.o_nome,a.o_coord,'concluiu_pedido',p_analista,r.pedido_id,'');
  ELSE
    UPDATE public.fila_atribuicoes SET status='contato',atualizado_em=now() WHERE pedido_id=r.pedido_id;
    PERFORM public.fila_log(a.o_nome,a.o_coord,'marcou_para_contato',p_analista,r.pedido_id,'');
  END IF;
  n := public.fila_auto_alocar(a.o_nome,a.o_coord,p_candidatos,p_analista);
  RETURN json_build_object('ok',true,'pedido_id',r.pedido_id,'distribuidos',n);
END;
$function$

;
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
$function$
;
CREATE OR REPLACE FUNCTION public.fila_gestao_relatorio(p_codigo text, p_token text, p_coord text, p_inicio date, p_fim date, p_analista text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a record;
BEGIN
 SELECT * INTO a FROM public.fila_ator(p_codigo,p_token,p_coord);
 IF NOT a.o_coord THEN RAISE EXCEPTION 'Somente a gestão pode consultar relatórios'; END IF;
 IF p_inicio IS NULL OR p_fim IS NULL OR p_fim<p_inicio OR p_fim-p_inicio>366 THEN RAISE EXCEPTION 'Selecione até 366 dias'; END IF;
 RETURN json_build_object('resumo',(SELECT coalesce(json_agg(t),'[]'::json) FROM (
  SELECT f.nome,
   (SELECT count(*) FROM public.fila_escala e WHERE e.analista=f.nome AND e.data BETWEEN p_inicio AND p_fim AND tipo='trabalho') AS previstos,
   (SELECT count(*) FROM public.fila_escala e WHERE e.analista=f.nome AND e.data BETWEEN p_inicio AND p_fim AND presenca='trabalhou') AS trabalhados_confirmados,
   (SELECT count(*) FROM public.fila_escala e WHERE e.analista=f.nome AND e.data BETWEEN p_inicio AND p_fim AND tipo='folga') AS folgas,
   (SELECT count(*) FROM public.fila_escala e WHERE e.analista=f.nome AND e.data BETWEEN p_inicio AND p_fim AND tipo='feriado') AS feriados,
   (SELECT count(*) FROM public.fila_escala e WHERE e.analista=f.nome AND e.data BETWEEN p_inicio AND p_fim AND tipo='ferias') AS ferias,
   (SELECT count(*) FROM (SELECT DISTINCT ON (h.pedido_id) h.analista,h.quando FROM public.fila_historico h WHERE h.acao='concluiu_pedido' AND nullif(h.pedido_id,'') IS NOT NULL ORDER BY h.pedido_id,h.id) h WHERE h.analista=f.nome AND h.quando>=p_inicio::timestamp AT TIME ZONE 'America/Fortaleza' AND h.quando<(p_fim+1)::timestamp AT TIME ZONE 'America/Fortaleza') AS concluidos,
   (SELECT count(DISTINCT (h.quando AT TIME ZONE 'America/Fortaleza')::date) FROM public.fila_historico h WHERE h.analista=f.nome AND h.quando>=p_inicio::timestamp AT TIME ZONE 'America/Fortaleza' AND h.quando<(p_fim+1)::timestamp AT TIME ZONE 'America/Fortaleza' AND acao IN ('recebeu_pedido','concluiu_pedido','marcou_para_contato')) AS dias_com_atividade
  FROM public.fila_analistas f WHERE nullif(p_analista,'') IS NULL OR f.nome=p_analista ORDER BY f.nome
 )t),'dias',(SELECT coalesce(json_agg(e ORDER BY e.data,e.analista),'[]'::json) FROM public.fila_escala e WHERE e.data BETWEEN p_inicio AND p_fim AND (nullif(p_analista,'') IS NULL OR e.analista=p_analista)));
END $function$
;
CREATE OR REPLACE FUNCTION public.fila_historico_pagina(p_codigo text, p_token text, p_coord text, p_limite integer DEFAULT 100, p_analista text DEFAULT NULL::text, p_antes bigint DEFAULT NULL::bigint, p_acao text DEFAULT NULL::text, p_pedido text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE limite integer := greatest(1, least(coalesce(p_limite,100),250)); resultado json; podio json;
  dia date := (current_timestamp AT TIME ZONE 'America/Fortaleza')::date;
BEGIN
  -- Mantém a autorização já usada para ler o histórico da equipe.
  PERFORM public.fila_ator(p_codigo, p_token, p_coord, false);
  WITH concluidos AS (
    -- A primeira conclusão válida é contada uma vez, pelo analista do pedido.
    -- Liberar/devolver à fila e marcar contato não são conclusões.
    SELECT DISTINCT ON (h.pedido_id) h.pedido_id,h.analista,h.quando
    FROM public.fila_historico h
    WHERE h.acao='concluiu_pedido' AND h.pedido_id IS NOT NULL AND h.pedido_id<>''
      AND EXISTS(SELECT 1 FROM public.fila_analistas a WHERE a.nome=h.analista)
    ORDER BY h.pedido_id,h.id
  ), totais AS (
    SELECT analista AS nome,count(*) AS geral,
      count(*) FILTER(WHERE (quando AT TIME ZONE 'America/Fortaleza')::date=dia) AS hoje
    FROM concluidos GROUP BY analista
  ), ranking_hoje AS (
    SELECT nome,hoje AS quantidade FROM totais WHERE hoje>0 ORDER BY hoje DESC,nome LIMIT 3
  ), ranking_geral AS (
    SELECT nome,geral AS quantidade FROM totais WHERE geral>0 ORDER BY geral DESC,nome LIMIT 3
  )
  SELECT json_build_object(
    'data',dia,
    'hoje',(SELECT coalesce(json_agg(r ORDER BY r.quantidade DESC,r.nome),'[]'::json) FROM ranking_hoje r),
    'geral',(SELECT coalesce(json_agg(r ORDER BY r.quantidade DESC,r.nome),'[]'::json) FROM ranking_geral r)
  ) INTO podio;

  -- Os filtros e o cursor afetam só a lista de ações, nunca o ranking da equipe.
  WITH filtrados AS (
    SELECT id, quando, ator, coord, acao, analista, pedido_id, detalhe, modalidade, origem_liberacao, ator_tecnico
    FROM af_mobile.historico_exibicao
    WHERE (p_analista IS NULL OR ator=p_analista OR analista=p_analista)
      AND (p_antes IS NULL OR id < p_antes)
      AND (p_acao IS NULL OR acao=p_acao)
      AND (nullif(p_pedido,'') IS NULL OR position(p_pedido IN coalesce(pedido_id,'')) > 0)
    ORDER BY id DESC LIMIT limite+1
  ), pagina AS (SELECT * FROM filtrados ORDER BY id DESC LIMIT limite)
  SELECT json_build_object(
    'itens', (SELECT coalesce(json_agg(p ORDER BY p.id DESC),'[]'::json) FROM pagina p),
    'temMais', (SELECT count(*) > limite FROM filtrados),
    'proximo', (SELECT min(id) FROM pagina),
    'ranking', podio
  ) INTO resultado;
  RETURN resultado;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fila_estado(p_codigo text, p_token text DEFAULT NULL::text, p_coord text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a record;
BEGIN
 SELECT * INTO a FROM public.fila_ator(p_codigo,p_token,p_coord,false);
 IF random()<0.03 THEN DELETE FROM public.fila_atribuicoes WHERE status='concluido' AND atualizado_em<now()-interval '2 days'; END IF;
 RETURN json_build_object(
 'analistas',(SELECT coalesce(json_agg(x),'[]'::json) FROM public.fila_analistas x),
 'atribuicoes',(SELECT coalesce(json_agg(x ORDER BY x.criado_em),'[]'::json) FROM public.fila_atribuicoes x),
 'janela',(SELECT coalesce(json_object_agg(chave,valor),'{}'::json) FROM public.fila_config WHERE chave NOT IN ('codigo','codigo_coord','temas_catalogo_v1')),
 'usuarios',(SELECT coalesce(json_agg(json_build_object('nome',u.nome,'meu',u.token=p_token)),'[]'::json) FROM public.fila_usuarios u),
 'coord',a.o_coord,'gestao_nome',CASE WHEN a.o_coord THEN a.o_nome END,'gestao_versao',6,
 'eventos_versao',(SELECT coalesce(max(id),0) FROM public.fila_eventos),
 'preferencias_analistas',(SELECT coalesce(json_object_agg(analista,lojas),'{}'::json) FROM public.fila_preferencias_analista),
 'direcionamentos_lojas',(SELECT coalesce(json_agg(r ORDER BY r.loja),'[]'::json) FROM public.fila_rotas_loja r));
END $function$
;
CREATE VIEW af_mobile.historico_exibicao WITH(security_invoker=true) AS  SELECT h.id,
    h.quando,
        CASE
            WHEN h.acao = 'recebeu_pedido'::text THEN
            CASE
                WHEN anterior.acao = 'liberou_pedido'::text AND anterior.analista IS DISTINCT FROM h.analista THEN anterior.analista
                ELSE h.analista
            END
            ELSE h.ator
        END AS ator,
    h.coord,
    h.acao,
    h.analista,
    h.pedido_id,
    h.detalhe,
    h.ator AS ator_tecnico,
        CASE
            WHEN h.acao <> 'recebeu_pedido'::text THEN NULL::text
            WHEN anterior.acao = 'liberou_pedido'::text AND anterior.analista IS DISTINCT FROM h.analista THEN 'redistribuicao'::text
            WHEN h.detalhe ~~ 'Distribuição automática;%'::text OR h.detalhe ~~ 'Redistribuição %'::text OR h.detalhe ~~ 'Direcionamento por loja; liberado por %'::text THEN 'automatica'::text
            ELSE 'recebimento'::text
        END AS modalidade,
        CASE
            WHEN h.acao = 'recebeu_pedido'::text AND anterior.acao = 'liberou_pedido'::text AND anterior.analista IS DISTINCT FROM h.analista THEN jsonb_build_object('id', anterior.id, 'analista', anterior.analista, 'ator', anterior.ator, 'quando', anterior.quando)
            ELSE NULL::jsonb
        END AS origem_liberacao
   FROM fila_historico h
     LEFT JOIN LATERAL ( SELECT p.id,
            p.quando,
            p.acao,
            p.analista,
            p.ator
           FROM fila_historico p
          WHERE h.acao = 'recebeu_pedido'::text AND p.pedido_id = h.pedido_id AND p.id < h.id
          ORDER BY p.id DESC
         LIMIT 1) anterior ON true;
