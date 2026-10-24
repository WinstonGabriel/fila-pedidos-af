BEGIN;
SELECT pg_advisory_xact_lock(802153,530);
CREATE TEMP TABLE resultados(caso text);
DO $$
DECLARE codigo text; token text:='teste-descanso-6.3-rollback'; r jsonb; n text:='__teste_descanso_af__'; falhou boolean;
BEGIN
 SELECT valor INTO codigo FROM public.fila_config WHERE chave='codigo';
 INSERT INTO public.fila_analistas(nome,atividade,ligado,inicio,fim,atividade_inicio,atividade_fim,atualizado_em) VALUES(n,'on',true,'','','','',clock_timestamp());
 INSERT INTO public.fila_usuarios(nome,token) VALUES(n,token);
 r:=public.fila_descanso(codigo,token,NULL,n,false);
 IF r->'analistas'->n->>'proximo_em' IS NOT NULL THEN RAISE EXCEPTION 'Falha: primeira pausa bloqueada pela espera'; END IF;
 INSERT INTO resultados VALUES('primeira pausa sem espera indevida');
 -- Foreign identity cannot spend a break.
 falhou:=false; BEGIN PERFORM public.fila_descanso(codigo,token,NULL,'Gabriel',true); EXCEPTION WHEN OTHERS THEN falhou:=true; END;
 IF NOT falhou THEN RAISE EXCEPTION 'Falha: acesso alheio'; END IF;
 INSERT INTO resultados VALUES('outro analista bloqueado');
 r:=public.fila_descanso(codigo,token,NULL,n,true);
 IF (r->'analistas'->n->>'usados')::int<>1 OR NOT EXISTS(SELECT 1 FROM public.fila_analistas WHERE nome=n AND not ligado AND atividade='intervalo' AND descanso_ate IS NOT NULL) THEN RAISE EXCEPTION 'Falha: início'; END IF;
 INSERT INTO resultados VALUES('primeiro descanso de 20 min');
 falhou:=false; BEGIN PERFORM public.fila_descanso(codigo,token,NULL,n,true); EXCEPTION WHEN OTHERS THEN falhou:=true; END;
 IF NOT falhou THEN RAISE EXCEPTION 'Falha: duplo clique'; END IF;
 INSERT INTO resultados VALUES('duplo clique não consome outra pausa');
 falhou:=false; BEGIN PERFORM public.fila_mudar_status(codigo,token,NULL,n,'on'); EXCEPTION WHEN OTHERS THEN falhou:=true; END;
 IF NOT falhou THEN RAISE EXCEPTION 'Falha: atalho ON'; END IF;
 INSERT INTO resultados VALUES('atalho de status bloqueado');
 falhou:=false; BEGIN PERFORM public.fila_set_analista(codigo,token,NULL,n,true,'',''); EXCEPTION WHEN OTHERS THEN falhou:=true; END;
 IF NOT falhou THEN RAISE EXCEPTION 'Falha: API antiga'; END IF;
 INSERT INTO resultados VALUES('API antiga não interrompe descanso');
 -- Test only: move timestamps with the guard disabled inside this rollback transaction.
 ALTER TABLE public.fila_analistas DISABLE TRIGGER fila_descanso_proteger;
 UPDATE public.fila_analistas SET descanso_ate=clock_timestamp()-interval '1 second' WHERE nome=n;
 ALTER TABLE public.fila_analistas ENABLE TRIGGER fila_descanso_proteger;
 UPDATE af_mobile.descansos SET inicio=statement_timestamp()-interval '20 minutes 1 second',fim=statement_timestamp()-interval '1 second' WHERE analista=n;
 -- Use exact identical clock to satisfy the duration check.
 PERFORM af_mobile.descanso_encerrar();
 IF NOT EXISTS(SELECT 1 FROM public.fila_analistas WHERE nome=n AND ligado AND descanso_ate IS NULL) THEN RAISE EXCEPTION 'Falha: retorno'; END IF;
 INSERT INTO resultados VALUES('retorno automático ON');
 falhou:=false; BEGIN PERFORM public.fila_descanso(codigo,token,NULL,n,true); EXCEPTION WHEN OTHERS THEN falhou:=true; END;
 IF NOT falhou THEN RAISE EXCEPTION 'Falha: descansos consecutivos'; END IF;
 INSERT INTO resultados VALUES('20+20 consecutivos bloqueados');
 UPDATE af_mobile.descansos SET inicio=statement_timestamp()-interval '61 minutes',fim=statement_timestamp()-interval '41 minutes' WHERE analista=n;
 UPDATE public.fila_analistas SET descanso_on_desde=clock_timestamp()-interval '21 minutes' WHERE nome=n;
 r:=public.fila_descanso(codigo,token,NULL,n,true);
 IF (r->'analistas'->n->>'usados')::int<>2 THEN RAISE EXCEPTION 'Falha: segundo'; END IF;
 INSERT INTO resultados VALUES('segunda pausa após trabalho ON');
 ALTER TABLE public.fila_analistas DISABLE TRIGGER fila_descanso_proteger;
 UPDATE public.fila_analistas SET descanso_ate=clock_timestamp()-interval '1 second' WHERE nome=n;
 ALTER TABLE public.fila_analistas ENABLE TRIGGER fila_descanso_proteger;
 PERFORM af_mobile.descanso_encerrar();
 UPDATE public.fila_analistas SET descanso_on_desde=clock_timestamp()-interval '21 minutes' WHERE nome=n;
 falhou:=false; BEGIN PERFORM public.fila_descanso(codigo,token,NULL,n,true); EXCEPTION WHEN OTHERS THEN falhou:=true; END;
 IF NOT falhou THEN RAISE EXCEPTION 'Falha: terceira'; END IF;
 INSERT INTO resultados VALUES('terceira pausa bloqueada');
END $$;
SELECT jsonb_build_object('passaram',count(*),'casos',jsonb_agg(caso)) FROM resultados;
ROLLBACK;
