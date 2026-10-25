-- Captura durável e conciliação pela decisão do próprio pedido no AF.
-- Não usa recomendação, desaparecimento, duração nem autoria de outra compra.
CREATE TABLE af_mobile.pedidos_capturados (
 pedido_id text PRIMARY KEY CHECK (pedido_id ~ '^[0-9]{10,20}$'),
 href text NOT NULL DEFAULT '', data_pedido date, hora text NOT NULL DEFAULT '',
 valor_centavos bigint CHECK (valor_centavos BETWEEN 0 AND 100000000000),
 estab text NOT NULL DEFAULT '', categoria text NOT NULL DEFAULT '',
 primeiro_visto timestamptz NOT NULL DEFAULT now(), ultimo_visto timestamptz NOT NULL DEFAULT now(),
 origem text CHECK (origem IN ('analista','automatico')),
 analista text, concluido_em timestamptz, declarado_em timestamptz,
 af_situacao text NOT NULL DEFAULT 'pendente' CHECK (af_situacao IN ('pendente','automatico','autorizado_manual','cancelado','indisponivel')),
 proxima_consulta timestamptz NOT NULL DEFAULT now(), consulta_token uuid, consulta_instalacao text,
 verificado_em timestamptz, legado boolean NOT NULL DEFAULT false,
 CHECK (origem IS DISTINCT FROM 'automatico' OR (concluido_em IS NOT NULL AND analista IS NULL))
);
ALTER TABLE af_mobile.pedidos_capturados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON af_mobile.pedidos_capturados FROM PUBLIC,anon,authenticated;
CREATE INDEX pedidos_capturados_consulta_idx ON af_mobile.pedidos_capturados(proxima_consulta) WHERE af_situacao NOT IN ('automatico','autorizado_manual');
CREATE INDEX pedidos_capturados_conclusao_idx ON af_mobile.pedidos_capturados(concluido_em) WHERE origem IS NOT NULL;

CREATE FUNCTION af_mobile.valor_centavos(v text) RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN btrim(regexp_replace(coalesce(v,''),'^R\$[[:space:]]*','')) ~ '^([0-9]{1,3}(\.[0-9]{3})*|[0-9]+),[0-9]{2}$'
 AND length(v)<25 THEN CASE WHEN replace(replace(btrim(regexp_replace(v,'^R\$[[:space:]]*','')),'.',''),',','')::numeric<=100000000000 THEN replace(replace(btrim(regexp_replace(v,'^R\$[[:space:]]*','')),'.',''),',','')::bigint END END
$$;
REVOKE ALL ON FUNCTION af_mobile.valor_centavos(text) FROM PUBLIC,anon,authenticated;

-- Mantém metadados e a primeira declaração humana também para clientes anteriores.
CREATE FUNCTION af_mobile.capturar_atribuicao() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.pedido_id ~ '^[0-9]{10,20}$' THEN
  INSERT INTO af_mobile.pedidos_capturados(pedido_id,href,hora,valor_centavos,estab,categoria)
  VALUES(NEW.pedido_id,NEW.href,NEW.hora,af_mobile.valor_centavos(NEW.valor),NEW.estab,NEW.categoria)
  ON CONFLICT(pedido_id) DO UPDATE SET href=coalesce(nullif(EXCLUDED.href,''),pedidos_capturados.href),
    valor_centavos=coalesce(EXCLUDED.valor_centavos,pedidos_capturados.valor_centavos),estab=EXCLUDED.estab,categoria=EXCLUDED.categoria;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fila_capturar_atribuicao AFTER INSERT OR UPDATE OF href,valor,estab,categoria ON public.fila_atribuicoes FOR EACH ROW EXECUTE FUNCTION af_mobile.capturar_atribuicao();
CREATE FUNCTION af_mobile.capturar_conclusao() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.fila_atribuicoes;
BEGIN
 IF NEW.acao='concluiu_pedido' AND NEW.pedido_id ~ '^[0-9]{10,20}$' THEN
  SELECT * INTO q FROM public.fila_atribuicoes WHERE pedido_id=NEW.pedido_id;
  INSERT INTO af_mobile.pedidos_capturados(pedido_id,href,hora,valor_centavos,estab,categoria,origem,analista,concluido_em,declarado_em)
  VALUES(NEW.pedido_id,coalesce(q.href,''),coalesce(q.hora,''),af_mobile.valor_centavos(q.valor),coalesce(q.estab,''),coalesce(q.categoria,''),'analista',NEW.analista,NEW.quando,NEW.quando)
  ON CONFLICT(pedido_id) DO UPDATE SET origem=CASE WHEN pedidos_capturados.origem='automatico' THEN 'automatico' ELSE 'analista' END,
    analista=CASE WHEN pedidos_capturados.origem='automatico' THEN NULL ELSE coalesce(pedidos_capturados.analista,EXCLUDED.analista) END,
    concluido_em=coalesce(pedidos_capturados.concluido_em,EXCLUDED.concluido_em),declarado_em=coalesce(pedidos_capturados.declarado_em,EXCLUDED.declarado_em);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fila_capturar_conclusao AFTER INSERT ON public.fila_historico FOR EACH ROW EXECUTE FUNCTION af_mobile.capturar_conclusao();
REVOKE ALL ON FUNCTION af_mobile.capturar_atribuicao(),af_mobile.capturar_conclusao() FROM PUBLIC,anon,authenticated;

-- Histórico anterior preservado como declaração, sem presumir origem automática.
INSERT INTO af_mobile.pedidos_capturados(pedido_id,href,hora,valor_centavos,estab,categoria,origem,analista,concluido_em,declarado_em,primeiro_visto,legado)
 SELECT h.pedido_id,coalesce(q.href,''),coalesce(q.hora,''),af_mobile.valor_centavos(q.valor),coalesce(q.estab,''),coalesce(q.categoria,''),
 'analista',h.analista,h.quando,h.quando,h.quando,true
 FROM (SELECT DISTINCT ON(pedido_id) * FROM public.fila_historico WHERE acao='concluiu_pedido' AND pedido_id ~ '^[0-9]{10,20}$' ORDER BY pedido_id,id) h
 LEFT JOIN public.fila_atribuicoes q ON q.pedido_id=h.pedido_id;
INSERT INTO af_mobile.pedidos_capturados(pedido_id,href,hora,valor_centavos,estab,categoria,primeiro_visto,legado)
 SELECT pedido_id,href,hora,af_mobile.valor_centavos(valor),estab,categoria,criado_em,true FROM public.fila_atribuicoes WHERE pedido_id ~ '^[0-9]{10,20}$'
 ON CONFLICT(pedido_id) DO NOTHING;

CREATE FUNCTION af_mobile.pedidos_observar(p_codigo text,p_token text,p_coord text,p_pedidos jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p jsonb; qtd integer:=0;
BEGIN
 PERFORM public.fila_ator(p_codigo,p_token,p_coord);
 IF jsonb_typeof(p_pedidos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_pedidos)>100 THEN RAISE EXCEPTION 'Lote de captura inválido'; END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(p_pedidos) LOOP
  IF coalesce(p->>'id','') !~ '^[0-9]{10,20}$' OR coalesce(p->>'href','') !~ '^https://af\.mateusmais\.com\.br/pedido/[0-9a-fA-F-]{36}/?$' THEN CONTINUE; END IF;
  INSERT INTO af_mobile.pedidos_capturados(pedido_id,href,data_pedido,hora,valor_centavos,estab,categoria)
  VALUES(p->>'id',p->>'href',CASE WHEN p->>'data' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN (p->>'data')::date END,left(coalesce(p->>'hora',''),5),af_mobile.valor_centavos(p->>'valor'),left(coalesce(p->>'estab',''),200),left(coalesce(p->>'cat',''),120))
  ON CONFLICT(pedido_id) DO UPDATE SET ultimo_visto=now(),href=EXCLUDED.href,
    data_pedido=coalesce(pedidos_capturados.data_pedido,EXCLUDED.data_pedido),valor_centavos=coalesce(EXCLUDED.valor_centavos,pedidos_capturados.valor_centavos),estab=EXCLUDED.estab,categoria=EXCLUDED.categoria
  WHERE pedidos_capturados.ultimo_visto<now()-interval '30 seconds' OR pedidos_capturados.href='' OR pedidos_capturados.valor_centavos IS NULL;
  qtd:=qtd+1;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'observados',qtd);
END $$;

CREATE FUNCTION af_mobile.pedidos_pendentes(p_codigo text,p_token text,p_coord text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb;
BEGIN
 PERFORM public.fila_ator(p_codigo,p_token,p_coord);
 WITH escolhidos AS (
  SELECT pedido_id FROM af_mobile.pedidos_capturados
  WHERE af_situacao NOT IN ('automatico','autorizado_manual') AND href ~ '^https://af\.mateusmais\.com\.br/pedido/[0-9a-fA-F-]{36}/?$'
   AND proxima_consulta<=now() ORDER BY proxima_consulta,pedido_id LIMIT 5 FOR UPDATE SKIP LOCKED
 ), marcados AS (
  UPDATE af_mobile.pedidos_capturados p SET proxima_consulta=now()+interval '2 minutes',consulta_token=gen_random_uuid(),consulta_instalacao=p_token
  FROM escolhidos e WHERE p.pedido_id=e.pedido_id RETURNING p.pedido_id AS id,p.href,p.consulta_token
 ) SELECT coalesce(jsonb_agg(m),'[]'::jsonb) INTO r FROM marcados m;
 RETURN r;
END $$;

-- Recupera um pedido visto rapidamente somente após confirmar que ainda está em análise.
CREATE FUNCTION af_mobile.pool_confirmado() RETURNS jsonb LANGUAGE sql SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(t.c ORDER BY t.primeiro_visto,t.pedido_id),'[]'::jsonb) FROM (
  SELECT jsonb_build_object('id',p.pedido_id,'href',p.href,'hora',p.hora,'cat',p.categoria,'estab',p.estab,
   'valor',CASE WHEN p.valor_centavos IS NULL THEN '' ELSE 'R$ '||replace(to_char(p.valor_centavos/100.0,'FM9999999990.00'),'.',',') END) AS c,p.primeiro_visto,p.pedido_id
  FROM af_mobile.pedidos_capturados p WHERE p.origem IS NULL AND p.af_situacao='pendente' AND p.verificado_em>now()-interval '30 seconds'
   AND NOT EXISTS(SELECT 1 FROM public.fila_atribuicoes q WHERE q.pedido_id=p.pedido_id AND q.status<>'devolvido')
  ORDER BY p.primeiro_visto,p.pedido_id LIMIT 1000
 )t
$$;
REVOKE ALL ON FUNCTION af_mobile.pool_confirmado() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION af_mobile.pedidos_conciliar(p_codigo text,p_token text,p_coord text,p_resultados jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a record; p jsonb; q af_mobile.pedidos_capturados; momento timestamptz; qtd integer:=0; anterior text; situacao text; distribuidos integer;
BEGIN
 SELECT * INTO a FROM public.fila_ator(p_codigo,p_token,p_coord);
 IF jsonb_typeof(p_resultados) IS DISTINCT FROM 'array' OR jsonb_array_length(p_resultados)>5 THEN RAISE EXCEPTION 'Lote de conciliação inválido'; END IF;
 -- Mesma trava da distribuição: concluir automaticamente libera o lugar uma única vez.
 PERFORM pg_catalog.pg_advisory_xact_lock(802153,530);
 FOR p IN SELECT value FROM jsonb_array_elements(p_resultados) LOOP
  SELECT * INTO q FROM af_mobile.pedidos_capturados WHERE pedido_id=p->>'id' AND href=p->>'href'
    AND consulta_token::text=p->>'consulta_token' AND consulta_instalacao=p_token FOR UPDATE;
  IF NOT FOUND THEN CONTINUE; END IF;
  situacao:=coalesce(p->>'situacao','indisponivel');
  IF situacao NOT IN ('automatico','autorizado_manual','cancelado','pendente','indisponivel') THEN RAISE EXCEPTION 'Situação inválida'; END IF;
  IF situacao='automatico' THEN
   IF p->>'status_decisao' IS DISTINCT FROM 'Pedido autorizado' OR p->>'nota_automatica' IS DISTINCT FROM 'Aprovação Automática com status de análise APPROVE' OR nullif(p->>'evento_em','') IS NULL THEN RAISE EXCEPTION 'Aprovação automática sem evidência do AF'; END IF;
   momento:=(p->>'evento_em')::timestamptz;
   IF momento>now()+interval '5 minutes' OR momento<'2000-01-01'::timestamptz THEN RAISE EXCEPTION 'Data da decisão inválida'; END IF;
   IF q.origem IS DISTINCT FROM 'automatico' THEN
    SELECT analista INTO anterior FROM public.fila_atribuicoes WHERE pedido_id=q.pedido_id;
    anterior:=coalesce(anterior,q.analista);
    UPDATE af_mobile.pedidos_capturados SET origem='automatico',analista=NULL,concluido_em=momento WHERE pedido_id=q.pedido_id;
    UPDATE public.fila_atribuicoes SET status='concluido',atualizado_em=now() WHERE pedido_id=q.pedido_id AND status<>'concluido';
    PERFORM public.fila_log('AF',false,'pedido_aprovado_automatico',NULL,q.pedido_id,'Pedido aprovado automático; decisão confirmada no AF em '||to_char(momento AT TIME ZONE 'America/Fortaleza','DD/MM/YYYY HH24:MI')||CASE WHEN anterior IS NULL THEN '' ELSE '; vínculo anterior: '||anterior||' (sem crédito de produção)' END);
    qtd:=qtd+1;
   END IF;
  ELSIF situacao='autorizado_manual' AND p->>'status_decisao' IS DISTINCT FROM 'Pedido autorizado' THEN
   RAISE EXCEPTION 'Autorização sem evidência do AF';
  ELSIF situacao='pendente' AND (p->>'status_decisao' IS DISTINCT FROM 'Pedido em análise' OR p->>'status_atual' IS DISTINCT FROM 'Pedido em análise') THEN
   RAISE EXCEPTION 'Pedido em análise sem confirmação do AF';
  END IF;
  UPDATE af_mobile.pedidos_capturados SET af_situacao=situacao,verificado_em=now(),consulta_token=NULL,consulta_instalacao=NULL,
    proxima_consulta=now()+CASE WHEN primeiro_visto>now()-interval '5 minutes' THEN interval '15 seconds' WHEN primeiro_visto>now()-interval '2 days' THEN interval '1 minute' ELSE interval '15 minutes' END
    WHERE pedido_id=q.pedido_id;
 END LOOP;
 distribuidos:=public.fila_auto_alocar(a.o_nome,a.o_coord,af_mobile.pool_confirmado(),a.o_nome);
 RETURN jsonb_build_object('ok',true,'automaticos',qtd,'distribuidos',distribuidos);
END $$;

CREATE FUNCTION public.fila_pedidos_observar(p_codigo text,p_token text,p_coord text,p_pedidos jsonb) RETURNS jsonb LANGUAGE sql SET search_path='' AS $$ SELECT af_mobile.pedidos_observar(p_codigo,p_token,p_coord,p_pedidos) $$;
CREATE FUNCTION public.fila_pedidos_pendentes(p_codigo text,p_token text,p_coord text) RETURNS jsonb LANGUAGE sql SET search_path='' AS $$ SELECT af_mobile.pedidos_pendentes(p_codigo,p_token,p_coord) $$;
CREATE FUNCTION public.fila_pedidos_conciliar(p_codigo text,p_token text,p_coord text,p_resultados jsonb) RETURNS jsonb LANGUAGE sql SET search_path='' AS $$ SELECT af_mobile.pedidos_conciliar(p_codigo,p_token,p_coord,p_resultados) $$;
REVOKE ALL ON FUNCTION af_mobile.pedidos_observar(text,text,text,jsonb),af_mobile.pedidos_pendentes(text,text,text),af_mobile.pedidos_conciliar(text,text,text,jsonb),public.fila_pedidos_observar(text,text,text,jsonb),public.fila_pedidos_pendentes(text,text,text),public.fila_pedidos_conciliar(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION af_mobile.pedidos_observar(text,text,text,jsonb),af_mobile.pedidos_pendentes(text,text,text),af_mobile.pedidos_conciliar(text,text,text,jsonb),public.fila_pedidos_observar(text,text,text,jsonb),public.fila_pedidos_pendentes(text,text,text),public.fila_pedidos_conciliar(text,text,text,jsonb) TO anon,authenticated,service_role;

CREATE FUNCTION af_mobile.producao_relatorio(p_inicio date,p_fim date,p_analista text) RETURNS jsonb LANGUAGE sql SET search_path='' AS $$
 WITH periodo AS (
  SELECT * FROM af_mobile.pedidos_capturados WHERE concluido_em>=p_inicio::timestamp AT TIME ZONE 'America/Fortaleza' AND concluido_em<(p_fim+1)::timestamp AT TIME ZONE 'America/Fortaleza' AND origem IS NOT NULL
 ), grupos AS (
  SELECT a.nome,count(p.pedido_id) AS quantidade,coalesce(sum(p.valor_centavos),0) AS valor_centavos,count(p.pedido_id) FILTER(WHERE p.valor_centavos IS NULL) AS sem_valor
  FROM public.fila_analistas a LEFT JOIN periodo p ON p.analista=a.nome AND p.origem='analista'
  WHERE nullif(p_analista,'') IS NULL OR a.nome=p_analista GROUP BY a.nome
 ) SELECT jsonb_build_object('producao',jsonb_build_object(
  'totais',(SELECT jsonb_build_object('quantidade',count(*),'valor_centavos',coalesce(sum(valor_centavos),0),'sem_valor',count(*) FILTER(WHERE valor_centavos IS NULL)) FROM periodo),
  'automaticos',(SELECT jsonb_build_object('quantidade',count(*),'valor_centavos',coalesce(sum(valor_centavos),0),'sem_valor',count(*) FILTER(WHERE valor_centavos IS NULL)) FROM periodo WHERE origem='automatico'),
  'manuais',(SELECT jsonb_build_object('quantidade',count(*),'valor_centavos',coalesce(sum(valor_centavos),0),'sem_valor',count(*) FILTER(WHERE valor_centavos IS NULL)) FROM periodo WHERE origem='analista'),
  'analistas',(SELECT coalesce(jsonb_agg(g ORDER BY g.nome),'[]'::jsonb) FROM grupos g),
  'sem_conclusao',(SELECT count(*) FROM af_mobile.pedidos_capturados WHERE origem IS NULL AND (primeiro_visto AT TIME ZONE 'America/Fortaleza')::date BETWEEN p_inicio AND p_fim),
  'legados_sem_conferencia',(SELECT count(*) FROM periodo WHERE origem='analista' AND legado AND verificado_em IS NULL),
  'cobertura','Pedidos capturados pela extensão. Conclusões humanas são informadas pelos analistas; automáticos exigem a nota explícita no AF. Valores ausentes não são zero.'
 ))
$$;
REVOKE ALL ON FUNCTION af_mobile.producao_relatorio(date,date,text) FROM PUBLIC,anon,authenticated;

-- Patches conservadores: falham se a definição-base já tiver mudado.
DO $patch$
DECLARE v text; novo text;
BEGIN
 SELECT pg_get_functiondef('public.fila_auto_alocar(text,boolean,jsonb,text)'::regprocedure) INTO v;
 novo:=replace(v,'  PERFORM pg_catalog.pg_advisory_xact_lock(802153,530);', E'  PERFORM pg_catalog.pg_advisory_xact_lock(802153,530);\n  -- conciliacao_af_v690: não redistribuir uma conclusão conhecida.\n  SELECT coalesce(jsonb_agg(c.value ORDER BY c.ord),\'[]\'::jsonb) INTO pool FROM jsonb_array_elements(pool) WITH ORDINALITY c(value,ord) WHERE NOT EXISTS(SELECT 1 FROM af_mobile.pedidos_capturados p WHERE p.pedido_id=c.value->>\'id\' AND p.origem IS NOT NULL);');
 IF novo=v THEN RAISE EXCEPTION 'Base do alocador mudou'; END IF; EXECUTE novo;
 SELECT pg_get_functiondef('public.fila_estado(text,text,text)'::regprocedure) INTO v;
 novo:=replace(v,'''coord'',a.o_coord',E'''automaticos'',(SELECT coalesce(json_agg(t),\'[]\'::json) FROM (SELECT pedido_id,href,concluido_em,CASE WHEN valor_centavos IS NULL THEN NULL ELSE \'R$ \'||replace(to_char(valor_centavos/100.0,\'FM9999999990.00\'),\'.\',\',\') END AS valor FROM af_mobile.pedidos_capturados WHERE origem=\'automatico\' AND concluido_em>now()-interval \'2 days\' ORDER BY concluido_em DESC LIMIT 100)t),\n ''coord'',a.o_coord');
 IF novo=v THEN RAISE EXCEPTION 'Base do estado mudou'; END IF; EXECUTE novo;
 SELECT pg_get_functiondef('public.fila_historico_pagina(text,text,text,integer,text,bigint,text,text)'::regprocedure) INTO v;
 novo:=replace(v,'WHERE h.acao=''concluiu_pedido'' AND',E'WHERE h.acao=\'concluiu_pedido\' AND NOT EXISTS(SELECT 1 FROM af_mobile.pedidos_capturados p WHERE p.pedido_id=h.pedido_id AND p.origem=\'automatico\') AND');
 IF novo=v THEN RAISE EXCEPTION 'Base do ranking mudou'; END IF; EXECUTE novo;
 SELECT pg_get_functiondef('public.fila_gestao_relatorio(text,text,text,date,date,text)'::regprocedure) INTO v;
 novo:=replace(v,'RETURN json_build_object(', 'RETURN (json_build_object(');
 novo:=replace(novo,'WHERE h.acao=''concluiu_pedido'' AND',E'WHERE h.acao=\'concluiu_pedido\' AND NOT EXISTS(SELECT 1 FROM af_mobile.pedidos_capturados p WHERE p.pedido_id=h.pedido_id AND p.origem=\'automatico\') AND');
 novo:=replace(novo,E'));\nEND',E'))::jsonb || af_mobile.producao_relatorio(p_inicio,p_fim,p_analista))::json;\nEND');
 IF novo=v OR position('producao_relatorio(p_inicio' IN novo)=0 THEN RAISE EXCEPTION 'Base do relatório mudou'; END IF; EXECUTE novo;
 SELECT pg_get_viewdef('af_mobile.historico_exibicao'::regclass,true) INTO v;
 novo:=replace(v,E'    h.acao,',E'    CASE WHEN h.acao=\'concluiu_pedido\' AND EXISTS(SELECT 1 FROM af_mobile.pedidos_capturados pc WHERE pc.pedido_id=h.pedido_id AND pc.origem=\'automatico\') THEN \'conclusao_reclassificada\' ELSE h.acao END AS acao,');
 IF novo=v THEN RAISE EXCEPTION 'Base da projeção do histórico mudou'; END IF;
 EXECUTE 'CREATE OR REPLACE VIEW af_mobile.historico_exibicao WITH(security_invoker=true) AS '||novo;
END $patch$;
