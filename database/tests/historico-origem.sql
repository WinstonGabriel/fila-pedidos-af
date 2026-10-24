BEGIN;
DO $$
DECLARE r af_mobile.historico_exibicao; codigo text; d json;
BEGIN
 INSERT INTO public.fila_historico(ator,coord,acao,analista,pedido_id,detalhe) VALUES('Abigail',false,'recebeu_pedido','Rayla','__teste_hist_auto__','Distribuição automática; ordem de disponibilidade; Loja');
 SELECT * INTO r FROM af_mobile.historico_exibicao WHERE pedido_id='__teste_hist_auto__';
 IF r.ator<>'Rayla' OR r.ator_tecnico<>'Abigail' OR r.modalidade<>'automatica' OR r.origem_liberacao IS NOT NULL THEN RAISE EXCEPTION 'Distribuição automática incorreta'; END IF;
 INSERT INTO public.fila_historico(ator,coord,acao,analista,pedido_id,detalhe) VALUES('Gabriel',false,'liberou_pedido','Gabriel','__teste_hist_liberacao__','Devolvido à fila');
 INSERT INTO public.fila_historico(ator,coord,acao,analista,pedido_id,detalhe) VALUES('Abigail',false,'recebeu_pedido','Rayla','__teste_hist_liberacao__','Redistribuição aleatória; liberado por Gabriel');
 SELECT * INTO r FROM af_mobile.historico_exibicao WHERE pedido_id='__teste_hist_liberacao__' AND acao='recebeu_pedido';
 IF r.ator<>'Gabriel' OR r.modalidade<>'redistribuicao' OR r.origem_liberacao->>'analista'<>'Gabriel' THEN RAISE EXCEPTION 'Origem da liberação incorreta'; END IF;
 -- A second receipt cannot reuse an old release from a previous cycle.
 INSERT INTO public.fila_historico(ator,coord,acao,analista,pedido_id,detalhe) VALUES('Abigail',false,'recebeu_pedido','Kazaf','__teste_hist_liberacao__','Distribuição automática; ordem de disponibilidade');
 SELECT * INTO r FROM af_mobile.historico_exibicao WHERE pedido_id='__teste_hist_liberacao__' AND analista='Kazaf';
 IF r.origem_liberacao IS NOT NULL OR r.ator<>'Kazaf' THEN RAISE EXCEPTION 'Liberação antiga reutilizada'; END IF;
 INSERT INTO public.fila_historico(ator,coord,acao,analista,pedido_id,detalhe) VALUES('Gabriel',false,'devolveu_pedido_a_fila','Gabriel','__teste_hist_off__','Status OFF'),('Abigail',false,'recebeu_pedido','Rayla','__teste_hist_off__','Redistribuição aleatória; liberado por Gabriel');
 SELECT * INTO r FROM af_mobile.historico_exibicao WHERE pedido_id='__teste_hist_off__' AND acao='recebeu_pedido';
 IF r.origem_liberacao IS NOT NULL OR r.ator<>'Rayla' THEN RAISE EXCEPTION 'OFF confundido com liberação manual'; END IF;
 SELECT valor INTO codigo FROM public.fila_config WHERE chave='codigo';
 d:=public.fila_historico_pagina(codigo,'teste-hist-leitura',NULL,1,NULL,NULL,NULL,'__teste_hist_auto__');
 IF d->'itens'->0->>'ator'<>'Rayla' OR d->'itens'->0->>'modalidade'<>'automatica' THEN RAISE EXCEPTION 'RPC paginado incorreto'; END IF;
 d:=public.fila_historico(codigo,'teste-hist-leitura',NULL,100,NULL);
 IF NOT EXISTS(SELECT 1 FROM json_array_elements(d) x WHERE x->>'pedido_id'='__teste_hist_auto__' AND x->>'ator'='Rayla') THEN RAISE EXCEPTION 'RPC legado incorreto'; END IF;
END $$;
SELECT '6 cenários de histórico aprovados; dados simulados serão revertidos' AS resultado;
ROLLBACK;
