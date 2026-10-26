-- Distingue a pausa regulamentada no aviso, preservando o status interno intervalo.
DO $patch$
DECLARE
 definicao text := pg_get_functiondef('public.fila_atividade_evento()'::regprocedure);
 anterior text := $old$jsonb_build_object('antes',OLD.atividade,'depois',NEW.atividade,'inicio',NEW.atividade_inicio,'fim',NEW.atividade_fim)$old$;
 novo text := $new$jsonb_build_object('antes',OLD.atividade,'depois',NEW.atividade,'inicio',NEW.atividade_inicio,'fim',NEW.atividade_fim,'pausa_20min',coalesce(NEW.atividade='intervalo' AND NEW.descanso_ate>clock_timestamp(),false))$new$;
BEGIN
 IF strpos(definicao,novo)>0 THEN RETURN; END IF;
 IF (length(definicao)-length(replace(definicao,anterior,'')))/length(anterior)<>1 THEN
  RAISE EXCEPTION 'Definição de fila_atividade_evento incompatível. Revise antes de aplicar.';
 END IF;
 EXECUTE replace(definicao,anterior,novo);
END;
$patch$;
