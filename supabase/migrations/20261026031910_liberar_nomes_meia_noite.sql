-- Liberação diária das reservas de nome, sem alterar cadastro, status ou pedidos.
CREATE TABLE IF NOT EXISTS af_mobile.liberacao_nomes_diaria (
 dia date PRIMARY KEY,
 executado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
 nomes_liberados integer NOT NULL DEFAULT 0 CHECK(nomes_liberados>=0),
 ativacao boolean NOT NULL DEFAULT false
);
ALTER TABLE af_mobile.liberacao_nomes_diaria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON af_mobile.liberacao_nomes_diaria FROM PUBLIC,anon,authenticated,service_role;

-- Ativar a partir da próxima meia-noite, sem desconectar quem está trabalhando.
INSERT INTO af_mobile.liberacao_nomes_diaria(dia,ativacao)
 SELECT (clock_timestamp() AT TIME ZONE 'America/Fortaleza')::date,true
 WHERE NOT EXISTS(SELECT 1 FROM af_mobile.liberacao_nomes_diaria)
 ON CONFLICT(dia) DO NOTHING;

CREATE OR REPLACE FUNCTION af_mobile.liberar_nomes_diario(p_agora timestamptz DEFAULT clock_timestamp())
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE dia_local date; corte timestamptz; n text; quantidade integer:=0;
BEGIN
 IF p_agora IS NULL THEN RAISE EXCEPTION 'Horário da liberação inválido'; END IF;
 dia_local:=(p_agora AT TIME ZONE 'America/Fortaleza')::date;
 corte:=dia_local::timestamp AT TIME ZONE 'America/Fortaleza';
 -- A mesma trava usada na escolha e na liberação manual de nomes.
 PERFORM pg_catalog.pg_advisory_xact_lock(802153,510);
 INSERT INTO af_mobile.liberacao_nomes_diaria(dia,executado_em) VALUES(dia_local,p_agora)
  ON CONFLICT(dia) DO NOTHING;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('ok',true,'dia',dia_local,'liberados',0,'ja_processado',true);
 END IF;
 -- Se o agendamento atrasar, uma escolha explícita feita após 00:00 é preservada.
 FOR n IN DELETE FROM public.fila_usuarios WHERE atualizado_em<corte RETURNING nome
 LOOP
  PERFORM public.fila_log('Sistema',false,'liberou_nome',n,NULL,
   'Liberação diária automática às 00:00 · horário de São Luís · '||dia_local::text);
  quantidade:=quantidade+1;
 END LOOP;
 UPDATE af_mobile.liberacao_nomes_diaria SET nomes_liberados=quantidade WHERE dia=dia_local;
 RETURN jsonb_build_object('ok',true,'dia',dia_local,'liberados',quantidade,'ja_processado',false);
END $$;
-- Somente o proprietário (o mesmo usuário do cron) executa a rotina privada.
REVOKE ALL ON FUNCTION af_mobile.liberar_nomes_diario(timestamptz) FROM PUBLIC,anon,authenticated,service_role;

DO $cron$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
  RAISE EXCEPTION 'pg_cron precisa estar habilitado';
 END IF;
 IF coalesce(current_setting('cron.timezone',true),'GMT') NOT IN ('GMT','UTC','Etc/UTC') THEN
  RAISE EXCEPTION 'Revisar o fuso do cron antes de agendar; a configuração global não foi alterada';
 END IF;
 -- 03:00 GMT = 00:00 America/Fortaleza. Não modifica os outros agendamentos.
 PERFORM cron.schedule('af-liberar-nomes-meia-noite','0 3 * * *','SELECT af_mobile.liberar_nomes_diario();');
END $cron$;
