BEGIN;
CREATE TABLE IF NOT EXISTS af_mobile.descansos (
 analista text NOT NULL REFERENCES public.fila_analistas(nome),
 dia date NOT NULL, numero smallint NOT NULL CHECK(numero BETWEEN 1 AND 2),
 inicio timestamptz NOT NULL, fim timestamptz NOT NULL,
 PRIMARY KEY(analista,dia,numero), CHECK(fim=inicio+interval '20 minutes')
);
ALTER TABLE af_mobile.descansos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON af_mobile.descansos FROM PUBLIC,anon,authenticated;
ALTER TABLE public.fila_analistas ADD COLUMN IF NOT EXISTS descanso_ate timestamptz;
ALTER TABLE public.fila_analistas ADD COLUMN IF NOT EXISTS descanso_on_desde timestamptz;
CREATE OR REPLACE FUNCTION af_mobile.descanso_proteger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- Both extension APIs and the mobile portal pass through this guard.
 IF TG_OP='UPDATE' AND OLD.descanso_ate IS NOT NULL AND OLD.descanso_ate>clock_timestamp() AND
   (NEW.atividade,NEW.ligado,NEW.atividade_inicio,NEW.atividade_fim,NEW.descanso_ate) IS DISTINCT FROM
   (OLD.atividade,OLD.ligado,OLD.atividade_inicio,OLD.atividade_fim,OLD.descanso_ate) THEN
   RAISE EXCEPTION 'Descanso de 20 min em andamento. Aguarde o término.';
 END IF;
 IF OLD.descanso_ate<=clock_timestamp() AND NEW.atividade<>'intervalo' THEN NEW.descanso_ate:=NULL; END IF;
 IF TG_OP='UPDATE' AND NEW.atividade='on' AND (OLD.atividade<>'on' OR OLD.descanso_ate IS NOT NULL) THEN
   NEW.descanso_on_desde:=clock_timestamp();
 ELSIF NEW.atividade<>'on' THEN NEW.descanso_on_desde:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION af_mobile.descanso_proteger() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS fila_descanso_proteger ON public.fila_analistas;
CREATE TRIGGER fila_descanso_proteger BEFORE UPDATE ON public.fila_analistas FOR EACH ROW EXECUTE FUNCTION af_mobile.descanso_proteger();
CREATE OR REPLACE FUNCTION af_mobile.descanso_encerrar() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(802153,530);
 PERFORM set_config('fila.ator','Sistema · descanso',true);
 PERFORM set_config('fila.coord','false',true);
 UPDATE public.fila_analistas SET atividade='on',ligado=true,atividade_inicio='',atividade_fim='',descanso_ate=NULL,atualizado_em=clock_timestamp()
 WHERE descanso_ate<=clock_timestamp() AND atividade='intervalo';
END $$;
REVOKE ALL ON FUNCTION af_mobile.descanso_encerrar() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION af_mobile.descanso_executar(p_codigo text,p_token text,p_coord text DEFAULT NULL,p_nome text DEFAULT NULL,p_iniciar boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ator record; alvo text; a public.fila_analistas; agora timestamptz:=clock_timestamp(); dia_local date:=(clock_timestamp() AT TIME ZONE 'America/Fortaleza')::date; usados integer; ultimo timestamptz;
BEGIN
 -- Coordination credentials deliberately cannot grant a break on another person's behalf.
 SELECT * INTO ator FROM public.fila_ator(p_codigo,p_token,NULL,false);
 SELECT nome INTO alvo FROM public.fila_usuarios WHERE token=p_token;
 PERFORM af_mobile.descanso_encerrar();
 IF p_iniciar THEN
  IF alvo IS NULL OR alvo IS DISTINCT FROM p_nome THEN RAISE EXCEPTION 'Somente o próprio analista pode iniciar seu descanso'; END IF;
  PERFORM pg_advisory_xact_lock(802153,530);
  agora:=clock_timestamp();
  dia_local:=(agora AT TIME ZONE 'America/Fortaleza')::date;
  SELECT * INTO a FROM public.fila_analistas WHERE nome=alvo FOR UPDATE;
  SELECT count(*),max(fim) INTO usados,ultimo FROM af_mobile.descansos WHERE analista=alvo AND dia=dia_local;
  IF a.descanso_ate>agora THEN RAISE EXCEPTION 'Você já está em descanso'; END IF;
  IF usados>=2 THEN RAISE EXCEPTION 'Limite diário de dois descansos de 20 min atingido'; END IF;
  IF a.atividade<>'on' THEN RAISE EXCEPTION 'Fique ON antes de iniciar o descanso'; END IF;
  -- Last break is read across dates as well: midnight never permits consecutive breaks.
  SELECT max(fim) INTO ultimo FROM af_mobile.descansos WHERE analista=alvo;
  IF ultimo IS NOT NULL AND (a.descanso_on_desde IS NULL OR agora<greatest(ultimo,a.descanso_on_desde)+interval '20 minutes') THEN
   RAISE EXCEPTION 'Cumpra 20 minutos contínuos em ON entre os descansos';
  END IF;
  IF EXISTS(SELECT 1 FROM public.fila_atribuicoes WHERE analista=alvo AND status='em_andamento') THEN RAISE EXCEPTION 'Conclua ou libere o pedido atual antes de descansar'; END IF;
  INSERT INTO af_mobile.descansos VALUES(alvo,dia_local,usados+1,agora,agora+interval '20 minutes');
  PERFORM set_config('fila.ator',alvo,true);
  UPDATE public.fila_analistas SET atividade='intervalo',ligado=false,atividade_inicio=to_char(agora AT TIME ZONE 'America/Fortaleza','HH24:MI'),atividade_fim=to_char((agora+interval '20 minutes') AT TIME ZONE 'America/Fortaleza','HH24:MI'),descanso_ate=agora+interval '20 minutes',atualizado_em=agora WHERE nome=alvo;
  PERFORM public.fila_log(alvo,false,'descanso_20min',alvo,NULL,'Descanso '||(usados+1)||'/2 · 20 minutos');
 END IF;
 RETURN jsonb_build_object('servidor_em',clock_timestamp(),'dia',dia_local,'analistas',(
 SELECT jsonb_object_agg(x.nome,jsonb_build_object('usados',(SELECT count(*) FROM af_mobile.descansos d WHERE d.analista=x.nome AND d.dia=dia_local),'ate',x.descanso_ate,'on_desde',x.descanso_on_desde,'proximo_em',(SELECT CASE WHEN max(d.fim) IS NOT NULL THEN greatest(max(d.fim),coalesce(x.descanso_on_desde,clock_timestamp()))+interval '20 minutes' END FROM af_mobile.descansos d WHERE d.analista=x.nome))) FROM public.fila_analistas x));
END $$;
REVOKE ALL ON FUNCTION af_mobile.descanso_executar(text,text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION af_mobile.descanso_executar(text,text,text,text,boolean) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.fila_descanso(p_codigo text,p_token text,p_coord text DEFAULT NULL,p_nome text DEFAULT NULL,p_iniciar boolean DEFAULT false) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT af_mobile.descanso_executar(p_codigo,p_token,p_coord,p_nome,p_iniciar) $$;
REVOKE ALL ON FUNCTION public.fila_descanso(text,text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fila_descanso(text,text,text,text,boolean) TO anon,authenticated;
SELECT cron.schedule('af-descanso-encerrar','* * * * *','SELECT af_mobile.descanso_encerrar()');
COMMIT;
