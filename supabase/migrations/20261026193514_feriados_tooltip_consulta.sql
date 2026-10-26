CREATE OR REPLACE FUNCTION public.fila_escala_consultar(p_codigo text,p_token text,p_coord text,p_inicio date,p_fim date,p_analista text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.fila_ator(p_codigo,p_token,p_coord,false);
 IF p_inicio IS NULL OR p_fim IS NULL OR p_fim<p_inicio OR p_fim-p_inicio>366 THEN RAISE EXCEPTION 'Selecione até 366 dias'; END IF;
 RETURN json_build_object('itens',(
  WITH feriados AS MATERIALIZED (SELECT * FROM af_mobile.feriados_periodo(p_inicio,p_fim)),
  linhas AS (
   SELECT e.analista,e.data,to_jsonb(e)||CASE WHEN f.nome IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
    'observacao',e.observacao||CASE WHEN e.observacao='' THEN '' ELSE E'\n' END||'[Calendário AF · 📅 Feriado: '||f.nome||']',
    'feriado_referencia',f.nome) END AS item
   FROM public.fila_escala e LEFT JOIN feriados f ON f.data=e.data
   WHERE e.data BETWEEN p_inicio AND p_fim AND (nullif(p_analista,'') IS NULL OR e.analista=p_analista)
   UNION ALL
   SELECT a.nome,f.data,jsonb_build_object('analista',a.nome,'data',f.data,'tipo','nao_definido','inicio','','fim','',
    'observacao','[Calendário AF · 📅 Feriado: '||f.nome||']','presenca','nao_informada','versao',0,
    'atualizado_em',NULL,'atualizado_por',NULL,'feriado_referencia',f.nome)
   FROM public.fila_analistas a CROSS JOIN feriados f
   WHERE (nullif(p_analista,'') IS NULL OR a.nome=p_analista)
    AND NOT EXISTS(SELECT 1 FROM public.fila_escala e WHERE e.analista=a.nome AND e.data=f.data)
  ) SELECT coalesce(json_agg(item ORDER BY data,analista),'[]'::json) FROM linhas),
  'versao',(SELECT coalesce(max(id),0) FROM public.fila_eventos));
END $$;
