BEGIN;
SELECT pg_advisory_xact_lock(802153,530);
DO $$
DECLARE codigo text; r jsonb; n text:='__teste_efeito__'; token text:='teste-efeito-6.7-rollback';
BEGIN
 SELECT valor INTO codigo FROM public.fila_config WHERE chave='codigo';
 INSERT INTO public.fila_analistas(nome,atividade,ligado,inicio,fim,atividade_inicio,atividade_fim,atualizado_em) VALUES(n,'on',true,'','','','',clock_timestamp());
 INSERT INTO public.fila_usuarios(nome,token) VALUES(n,token);
 r:=public.fila_pedido_efeito(codigo,token,NULL);
 IF r->>'nome'<>n OR r->'pedido'<>'null'::jsonb THEN RAISE EXCEPTION 'Identidade ou pedido inicial incorreto'; END IF;
 INSERT INTO public.fila_atribuicoes(pedido_id,analista,status,hora,valor,estab,href,categoria) VALUES('__teste_efeito_pedido__',n,'em_andamento','','','Teste','','');
 PERFORM public.fila_log('Gabriel',false,'recebeu_pedido',n,'__teste_efeito_pedido__','Distribuição automática; ordem de disponibilidade');
 r:=public.fila_pedido_efeito(codigo,token,NULL);
 IF r->'pedido'->>'id'<>'__teste_efeito_pedido__' OR (r->'pedido'->>'evento_id')::bigint<1 THEN RAISE EXCEPTION 'Pedido próprio não reconhecido'; END IF;
 r:=public.fila_pedido_efeito(codigo,'token-sem-reserva',NULL);
 IF r->>'nome' IS NOT NULL OR r->'pedido'<>'null'::jsonb THEN RAISE EXCEPTION 'Usuário sem reserva recebeu pedido'; END IF;
 UPDATE public.fila_atribuicoes SET status='reservado' WHERE pedido_id='__teste_efeito_pedido__';
 r:=public.fila_pedido_efeito(codigo,token,NULL);
 IF r->'pedido'<>'null'::jsonb THEN RAISE EXCEPTION 'Reserva tratada como pedido ativo'; END IF;
 UPDATE public.fila_config SET valor='{"schema":1,"ativo":false,"duracao_ms":2000}' WHERE chave='animacoes_pedido_v1';
 r:=public.fila_pedido_efeito(codigo,token,NULL);
 IF (r->'config'->>'ativo')::boolean<>false THEN RAISE EXCEPTION 'OFF remoto não retornou'; END IF;
END $$;
SELECT 'Identidade própria, pedido ativo, evento, reserva e controle remoto aprovados; rollback dos dados simulados' AS resultado;
ROLLBACK;
