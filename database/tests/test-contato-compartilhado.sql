BEGIN;
SELECT pg_catalog.pg_advisory_xact_lock(802153,510);
SELECT pg_catalog.pg_advisory_xact_lock(802153,530);
DO $$
DECLARE codigo text; tg text:=gen_random_uuid()::text; ta text:=gen_random_uuid()::text;
  tr text:=gen_random_uuid()::text; resposta json; bloqueou boolean;
BEGIN
  SELECT valor INTO codigo FROM public.fila_config WHERE chave='codigo';
  DELETE FROM public.fila_usuarios;
  DELETE FROM public.fila_atribuicoes;
  INSERT INTO public.fila_usuarios(nome,token) VALUES ('Gabriel',tg),('Abigail',ta),('Rayla',tr);
  UPDATE public.fila_analistas SET ligado=(nome='Gabriel');
  INSERT INTO public.fila_atribuicoes(pedido_id,analista,status,categoria) VALUES
    ('5310000000000001','Gabriel','em_andamento','Varejo'),
    ('5310000000000002','Abigail','em_andamento','Varejo'),
    ('5310000000000003','Gabriel','reservado','Varejo'),
    ('5310000000000004','Gabriel','concluido','Varejo');

  -- Mesmo OFF, outra analista identificada marca contato e o dono recebe o próximo.
  resposta:=public.fila_avancar(codigo,ta,NULL,'Gabriel','5310000000000001','contato','[]');
  ASSERT EXISTS(SELECT 1 FROM public.fila_atribuicoes WHERE pedido_id='5310000000000001' AND status='contato' AND analista='Gabriel'), 'cross-analyst contact failed';
  ASSERT EXISTS(SELECT 1 FROM public.fila_atribuicoes WHERE pedido_id='5310000000000003' AND status='em_andamento' AND analista='Gabriel'), 'owner did not receive next order';
  ASSERT EXISTS(SELECT 1 FROM public.fila_atribuicoes WHERE pedido_id='5310000000000002' AND status='em_andamento' AND analista='Abigail'), 'contact action altered the callers current order';
  ASSERT EXISTS(SELECT 1 FROM public.fila_historico WHERE pedido_id='5310000000000001' AND acao='marcou_para_contato' AND ator='Abigail' AND analista='Gabriel'), 'mark audit has wrong actor or owner';
  resposta:=public.fila_avancar(codigo,ta,NULL,'Gabriel','5310000000000001','contato','[]');
  ASSERT (resposta->>'ja_processado')::boolean, 'repeated mark consumed the next order';
  ASSERT (SELECT count(*) FROM public.fila_historico WHERE pedido_id='5310000000000001' AND acao='marcou_para_contato')=1, 'repeated mark duplicated audit';

  bloqueou:=false;
  BEGIN PERFORM public.fila_avancar(codigo,ta,NULL,'Gabriel','5310000000000003','concluir','[]'); EXCEPTION WHEN OTHERS THEN bloqueou:=true; END;
  ASSERT bloqueou, 'shared contact also allowed completing another analysts order';
  bloqueou:=false;
  BEGIN PERFORM public.fila_avancar(codigo,ta,NULL,'Gabriel','5310000000000003','liberar','[]'); EXCEPTION WHEN OTHERS THEN bloqueou:=true; END;
  ASSERT bloqueou, 'shared contact also allowed releasing another analysts order';
  INSERT INTO public.fila_atribuicoes(pedido_id,analista,status) VALUES ('5310000000000005','Gabriel','reservado');
  bloqueou:=false;
  BEGIN PERFORM public.fila_devolver(codigo,ta,NULL,'5310000000000005'); EXCEPTION WHEN OTHERS THEN bloqueou:=true; END;
  ASSERT bloqueou, 'another analyst canceled a private reservation';
  PERFORM public.fila_devolver(codigo,tg,NULL,'5310000000000005');
  ASSERT NOT EXISTS(SELECT 1 FROM public.fila_atribuicoes WHERE pedido_id='5310000000000005'), 'owner cannot cancel their reservation';

  -- Sem nome ou com código incorreto, nenhuma das operações compartilhadas é liberada.
  bloqueou:=false;
  BEGIN PERFORM public.fila_avancar(codigo,NULL,NULL,'Gabriel','5310000000000003','contato','[]'); EXCEPTION WHEN OTHERS THEN bloqueou:=true; END;
  ASSERT bloqueou, 'unidentified caller marked contact';
  bloqueou:=false;
  BEGIN PERFORM public.fila_contato(codigo,NULL,NULL,'Gabriel'); EXCEPTION WHEN OTHERS THEN bloqueou:=true; END;
  ASSERT bloqueou, 'legacy RPC allowed unidentified marking';
  bloqueou:=false;
  BEGIN PERFORM public.fila_devolver(codigo,NULL,NULL,'5310000000000001'); EXCEPTION WHEN OTHERS THEN bloqueou:=true; END;
  ASSERT bloqueou, 'unidentified caller removed contact';
  bloqueou:=false;
  BEGIN PERFORM public.fila_devolver(codigo||'-invalido',ta,NULL,'5310000000000001'); EXCEPTION WHEN OTHERS THEN bloqueou:=true; END;
  ASSERT bloqueou, 'wrong team code removed contact';

  -- Uma terceira pessoa remove o contato; o histórico aponta essa pessoa.
  PERFORM public.fila_devolver(codigo,tr,NULL,'5310000000000001');
  ASSERT NOT EXISTS(SELECT 1 FROM public.fila_atribuicoes WHERE pedido_id='5310000000000001'), 'third analyst did not return marked order to queue';
  ASSERT EXISTS(SELECT 1 FROM public.fila_historico WHERE pedido_id='5310000000000001' AND acao='removeu_de_contato' AND ator='Rayla' AND analista='Gabriel'), 'remove audit has wrong actor or owner';
  resposta:=public.fila_devolver(codigo,tr,NULL,'5310000000000001');
  ASSERT (resposta->>'ja_processado')::boolean, 'repeated removal not detected';
  ASSERT (SELECT count(*) FROM public.fila_historico WHERE pedido_id='5310000000000001' AND acao='removeu_de_contato')=1, 'repeated removal duplicated audit';
  PERFORM public.fila_devolver(codigo,ta,NULL,'5310000000000003');
  PERFORM public.fila_devolver(codigo,ta,NULL,'5310000000000004');
  ASSERT EXISTS(SELECT 1 FROM public.fila_atribuicoes WHERE pedido_id='5310000000000003' AND status='em_andamento'), 'contact removal removed an active order';
  ASSERT EXISTS(SELECT 1 FROM public.fila_atribuicoes WHERE pedido_id='5310000000000004' AND status='concluido'), 'contact removal removed a completed order';

  PERFORM public.fila_contato(codigo,tr,NULL,'Gabriel');
  ASSERT EXISTS(SELECT 1 FROM public.fila_atribuicoes WHERE pedido_id='5310000000000003' AND status='contato'), 'legacy shared mark failed';
  ASSERT EXISTS(SELECT 1 FROM public.fila_historico WHERE pedido_id='5310000000000003' AND acao='marcou_para_contato' AND ator='Rayla' AND analista='Gabriel'), 'legacy mark audit incorrect';
  PERFORM public.fila_devolver(codigo,ta,NULL,'5310000000000003');
  INSERT INTO public.fila_atribuicoes(pedido_id,analista,status) VALUES ('5310000000000006','Gabriel','em_andamento');
  PERFORM set_config('fila531.codigo',codigo,true);
  PERFORM set_config('fila531.token',ta,true);
END;
$$;
SET LOCAL ROLE anon;
SELECT public.fila_avancar(current_setting('fila531.codigo'),current_setting('fila531.token'),NULL,'Gabriel','5310000000000006','contato','[]')->>'ok' AS marcou_via_api;
SELECT public.fila_devolver(current_setting('fila531.codigo'),current_setting('fila531.token'),NULL,'5310000000000006')->>'ok' AS removeu_via_api;
RESET ROLE;
DO $$ BEGIN
  ASSERT NOT EXISTS(SELECT 1 FROM public.fila_atribuicoes WHERE pedido_id='5310000000000006'), 'API role could not remove contact';
  ASSERT NOT EXISTS(SELECT analista FROM public.fila_atribuicoes WHERE status='em_andamento' GROUP BY analista HAVING count(*)>1), 'duplicate current orders';
END; $$;
ROLLBACK;
SELECT 'passed' AS contatos_compartilhados, 'dados de teste revertidos; nomes e pedidos reais preservados' AS resultado;
