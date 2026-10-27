-- Preferência não define escala. Somente RPCs autenticadas acessam o registro.
CREATE TABLE af_mobile.feriado_preferencias (
 data date NOT NULL,
 analista text NOT NULL REFERENCES public.fila_analistas(nome),
 posicao integer NOT NULL CHECK(posicao>0),
 solicitado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(data,analista),
 UNIQUE(data,posicao)
);
ALTER TABLE af_mobile.feriado_preferencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON af_mobile.feriado_preferencias FROM PUBLIC,anon,authenticated,service_role;

-- Limite exclusivo: feriado 20/11 => encerra em 18/11 00:00, aceita até 17/11 23:59:59.
CREATE FUNCTION af_mobile.feriado_preferencia_prazo(p_data date)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT (p_data-2)::timestamp AT TIME ZONE 'America/Fortaleza'
$$;
REVOKE ALL ON FUNCTION af_mobile.feriado_preferencia_prazo(date) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION af_mobile.feriado_preferencias_consultar(p_codigo text,p_token text,p_coord text,p_inicio date,p_fim date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a record; agora timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO a FROM public.fila_ator(p_codigo,p_token,p_coord,false);
 IF p_inicio IS NULL OR p_fim IS NULL OR p_fim<p_inicio OR p_fim-p_inicio>366 THEN
  RAISE EXCEPTION 'Selecione até 366 dias';
 END IF;
 RETURN jsonb_build_object('gestao',a.o_coord,'analista',CASE WHEN NOT a.o_coord THEN a.o_nome END,'servidor_em',agora,
  'feriados',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'data',f.data,'nome',f.nome,'prazo_em',af_mobile.feriado_preferencia_prazo(f.data),
   'aberto',agora<af_mobile.feriado_preferencia_prazo(f.data),
   'minha',CASE WHEN NOT a.o_coord THEN (SELECT jsonb_build_object('posicao',p.posicao,'solicitado_em',p.solicitado_em)
     FROM af_mobile.feriado_preferencias p WHERE p.data=f.data AND p.analista=a.o_nome) END
  ) || CASE WHEN a.o_coord THEN jsonb_build_object('primeiras',coalesce((
   SELECT jsonb_agg(jsonb_build_object('analista',p.analista,'posicao',p.posicao,'solicitado_em',p.solicitado_em,
      'escala_tipo',coalesce(e.tipo,'nao_definido')) ORDER BY p.posicao)
   FROM af_mobile.feriado_preferencias p LEFT JOIN public.fila_escala e ON e.data=p.data AND e.analista=p.analista
   WHERE p.data=f.data AND p.posicao<=3
  ),'[]'::jsonb)) ELSE '{}'::jsonb END ORDER BY f.data)
  FROM af_mobile.feriados_periodo(p_inicio,p_fim) f),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION af_mobile.feriado_preferencias_consultar(text,text,text,date,date) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION af_mobile.feriado_solicitar_folga(p_codigo text,p_token text,p_coord text,p_data date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a record; r af_mobile.feriado_preferencias; agora timestamptz; proxima integer;
BEGIN
 -- A preferência é sempre da identidade da instalação; o cliente não escolhe outro nome.
 SELECT * INTO a FROM public.fila_ator(p_codigo,p_token,NULL,true);
 IF a.o_nome IS NULL OR NOT EXISTS(SELECT 1 FROM public.fila_analistas WHERE nome=a.o_nome) THEN
  RAISE EXCEPTION 'Escolha seu nome em “Eu sou” para solicitar folga';
 END IF;
 IF p_data IS NULL OR NOT EXISTS(SELECT 1 FROM af_mobile.feriados_periodo(p_data,p_data)) THEN
  RAISE EXCEPTION 'A data selecionada não é um feriado do calendário';
 END IF;
 -- Serializa por feriado; cliques simultâneos recebem posições distintas e definitivas.
 PERFORM pg_advisory_xact_lock(802154,p_data-date '2000-01-01');
 SELECT * INTO r FROM af_mobile.feriado_preferencias WHERE data=p_data AND analista=a.o_nome;
 IF FOUND THEN
  RETURN jsonb_build_object('data',r.data,'posicao',r.posicao,'solicitado_em',r.solicitado_em,'ja_enviada',true);
 END IF;
 agora:=clock_timestamp();
 IF agora>=af_mobile.feriado_preferencia_prazo(p_data) THEN
  RAISE EXCEPTION 'Prazo encerrado: solicite até 23h59 do terceiro dia anterior ao feriado, no horário de São Luís';
 END IF;
 SELECT coalesce(max(posicao),0)+1 INTO proxima FROM af_mobile.feriado_preferencias WHERE data=p_data;
 INSERT INTO af_mobile.feriado_preferencias(data,analista,posicao,solicitado_em) VALUES(p_data,a.o_nome,proxima,agora) RETURNING * INTO r;
 PERFORM public.fila_log(a.o_nome,false,'solicitou_folga_feriado',a.o_nome,NULL,
  'Preferência para folgar em '||to_char(p_data,'DD/MM/YYYY')||' · posição '||proxima||' · aguarda definição da gestão');
 RETURN jsonb_build_object('data',r.data,'posicao',r.posicao,'solicitado_em',r.solicitado_em,'ja_enviada',false);
END $$;
REVOKE ALL ON FUNCTION af_mobile.feriado_solicitar_folga(text,text,text,date) FROM PUBLIC,anon,authenticated,service_role;

-- Wrappers invoker compatíveis com o protocolo de equipe/instalação existente.
CREATE FUNCTION public.fila_feriados_preferencias(p_codigo text,p_token text,p_coord text,p_inicio date,p_fim date)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT af_mobile.feriado_preferencias_consultar(p_codigo,p_token,p_coord,p_inicio,p_fim)
$$;
CREATE FUNCTION public.fila_feriado_solicitar_folga(p_codigo text,p_token text,p_coord text,p_data date)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT af_mobile.feriado_solicitar_folga(p_codigo,p_token,p_coord,p_data)
$$;
REVOKE ALL ON FUNCTION public.fila_feriados_preferencias(text,text,text,date,date),public.fila_feriado_solicitar_folga(text,text,text,date) FROM PUBLIC;
GRANT USAGE ON SCHEMA af_mobile TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION af_mobile.feriado_preferencias_consultar(text,text,text,date,date),af_mobile.feriado_solicitar_folga(text,text,text,date),
 public.fila_feriados_preferencias(text,text,text,date,date),public.fila_feriado_solicitar_folga(text,text,text,date) TO anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
