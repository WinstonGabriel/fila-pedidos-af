-- Reduz respostas para clientes existentes, preservando dados e permissões.
DO $patch$
DECLARE atual text; novo text;
BEGIN
 SELECT pg_get_functiondef('public.fila_estado(text,text,text)'::regprocedure) INTO atual;
 IF position('sincronizacao_economica_v6100' IN atual)>0 THEN RETURN; END IF;
 novo:=replace(atual,
  '''atribuicoes'',(SELECT coalesce(json_agg(x ORDER BY x.criado_em),''[]''::json) FROM public.fila_atribuicoes x),',
  $novo$-- sincronizacao_economica_v6100: ativos completos e oito conclusões humanas recentes.
 'atribuicoes',(SELECT coalesce(json_agg(x ORDER BY x.criado_em),'[]'::json) FROM public.fila_atribuicoes x
  WHERE x.status<>'concluido' OR x.pedido_id IN (
   SELECT q.pedido_id FROM public.fila_atribuicoes q WHERE q.status='concluido'
    AND NOT EXISTS(SELECT 1 FROM af_mobile.pedidos_capturados p WHERE p.pedido_id=q.pedido_id AND p.origem='automatico')
   ORDER BY q.atualizado_em DESC,q.pedido_id DESC LIMIT 8)),
 'concluidos_ids',(SELECT coalesce(json_agg(pedido_id ORDER BY pedido_id),'[]'::json) FROM public.fila_atribuicoes WHERE status='concluido'),$novo$);
 IF novo=atual THEN RAISE EXCEPTION 'A definição de fila_estado mudou; revisar antes de aplicar'; END IF;
 -- A lista visível de automáticos também mostra somente os oito mais recentes.
 novo:=replace(novo,'ORDER BY concluido_em DESC LIMIT 100)t)','ORDER BY concluido_em DESC LIMIT 8)t)');
 IF position('LIMIT 100)t)' IN novo)>0 THEN RAISE EXCEPTION 'A lista de automáticos mudou'; END IF;
 EXECUTE novo;
END $patch$;

-- Hashes servem exclusivamente para economia de transporte. A autorização é
-- executada em TODAS as chamadas, inclusive quando os hashes forem iguais.
CREATE OR REPLACE FUNCTION af_mobile.sincronizar(p_codigo text,p_token text,p_coord text,p_versoes jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE estado jsonb; pausas jsonb; avisos jsonb; hashes jsonb; dados jsonb:='{}'::jsonb; pausa_estavel jsonb;
BEGIN
 IF jsonb_typeof(p_versoes) IS DISTINCT FROM 'object' OR octet_length(p_versoes::text)>512 THEN RAISE EXCEPTION 'Versões de sincronização inválidas'; END IF;
 -- Encerrar descansos vencidos antes de obter os status e eventos atualizados.
 pausas:=public.fila_descanso(p_codigo,p_token,p_coord);
 estado:=public.fila_estado(p_codigo,p_token,p_coord)::jsonb;
 avisos:=public.fila_avisos(p_codigo,p_token,p_coord)::jsonb;
 pausa_estavel:=pausas-'servidor_em';
 -- Sem ON contínuo, a previsão depende do relógio. A elegibilidade efetiva
 -- continua validada no servidor; entrar em ON gera um novo hash e uma nova previsão.
 pausa_estavel:=jsonb_set(pausa_estavel,'{analistas}',coalesce((SELECT jsonb_object_agg(k,CASE WHEN v->>'on_desde' IS NULL THEN v-'proximo_em' ELSE v END) FROM jsonb_each(coalesce(pausas->'analistas','{}'::jsonb)) x(k,v)),'{}'::jsonb));
 hashes:=jsonb_build_object('estado',md5(estado::text),'descansos',md5(pausa_estavel::text),'avisos',md5(avisos::text));
 IF hashes->>'estado' IS DISTINCT FROM p_versoes->>'estado' THEN dados:=dados||jsonb_build_object('estado',estado); END IF;
 IF hashes->>'descansos' IS DISTINCT FROM p_versoes->>'descansos' THEN dados:=dados||jsonb_build_object('descansos',pausas); END IF;
 IF hashes->>'avisos' IS DISTINCT FROM p_versoes->>'avisos' THEN dados:=dados||jsonb_build_object('avisos',avisos); END IF;
 RETURN jsonb_build_object('versoes',hashes,'dados',dados,'servidor_em',clock_timestamp());
END $$;
CREATE OR REPLACE FUNCTION public.fila_sincronizar(p_codigo text,p_token text,p_coord text DEFAULT NULL,p_versoes jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql SET search_path='' AS $$ SELECT af_mobile.sincronizar(p_codigo,p_token,p_coord,p_versoes) $$;
REVOKE ALL ON FUNCTION af_mobile.sincronizar(text,text,text,jsonb),public.fila_sincronizar(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION af_mobile.sincronizar(text,text,text,jsonb),public.fila_sincronizar(text,text,text,jsonb) TO anon,authenticated,service_role;
