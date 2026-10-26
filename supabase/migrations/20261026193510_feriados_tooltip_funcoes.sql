CREATE FUNCTION af_mobile.feriados_periodo(p_inicio date,p_fim date)
RETURNS TABLE(data date,nome text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH anos AS (
  SELECT generate_series(greatest(2026,extract(year FROM p_inicio)::integer),least(2100,extract(year FROM p_fim)::integer)) AS ano
 ), datas AS (
  SELECT CASE WHEN r.deslocamento_pascoa IS NOT NULL THEN af_mobile.pascoa_referencia(a.ano)+r.deslocamento_pascoa ELSE make_date(a.ano,r.mes,r.dia) END AS data,r.nome,r.vigente_desde
  FROM anos a CROSS JOIN af_mobile.feriados_referencia r
 ) SELECT d.data,string_agg(d.nome,' / ' ORDER BY d.nome) FROM datas d
 WHERE d.data BETWEEN p_inicio AND p_fim AND d.data>=d.vigente_desde GROUP BY d.data ORDER BY d.data
$$;
REVOKE ALL ON FUNCTION af_mobile.feriados_periodo(date,date) FROM PUBLIC,anon,authenticated,service_role;

-- Esta linha é metadado de apresentação, não uma observação de escala.
-- Remove também ao editar período ou importar uma prévia copiada da tela.
CREATE FUNCTION af_mobile.limpar_feriado_exibicao(observacao text) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT regexp_replace(
  regexp_replace(coalesce(observacao,''),E'^\\[Calendário AF · 📅 Feriado: [^\\[\\]\\r\\n]+\\]\\n?',''),
  E'\\n?\\[Calendário AF · 📅 Feriado: [^\\[\\]\\r\\n]+\\]','','g')
$$;
REVOKE ALL ON FUNCTION af_mobile.limpar_feriado_exibicao(text) FROM PUBLIC,anon,authenticated,service_role;
