BEGIN;
SELECT pg_advisory_xact_lock(802153,530);
DO $$
DECLARE codigo text; r jsonb; falhou boolean;
BEGIN
 SELECT valor INTO codigo FROM public.fila_config WHERE chave='codigo';
 INSERT INTO public.fila_analistas(nome,atividade,ligado,inicio,fim,atividade_inicio,atividade_fim,atualizado_em) VALUES('__sup_dono__','off',false,'','','','',now()),('__sup_outro__','off',false,'','','','',now()),('__sup_terceiro__','off',false,'','','','',now());
 INSERT INTO public.fila_usuarios(nome,token) VALUES('__sup_outro__','teste-sup-outro'),('__sup_terceiro__','teste-sup-terceiro');
 INSERT INTO public.fila_atribuicoes(pedido_id,analista,status,hora,valor,estab,href,categoria) VALUES('__teste_suporte__','__sup_dono__','em_andamento','','','Teste','',''),('__teste_contato__','__sup_dono__','contato','','','Teste','','');
 r:=public.fila_suporte(codigo,'teste-sup-outro',NULL,'__sup_dono__','__teste_suporte__',false,'[]');
 IF NOT EXISTS(SELECT 1 FROM public.fila_atribuicoes WHERE pedido_id='__teste_suporte__' AND status='contato' AND destino_apoio='suporte' AND analista='__sup_dono__') THEN RAISE EXCEPTION 'Retenção falhou'; END IF;
 -- The allocation run inside fila_suporte must leave the support item untouched.
 IF NOT EXISTS(SELECT 1 FROM public.fila_historico WHERE pedido_id='__teste_suporte__' AND ator='__sup_outro__' AND acao='marcou_para_suporte') THEN RAISE EXCEPTION 'Histórico incorreto'; END IF;
 PERFORM public.fila_suporte(codigo,'teste-sup-outro',NULL,'__sup_dono__','__teste_suporte__',false,'[]');
 IF (SELECT count(*) FROM public.fila_historico WHERE pedido_id='__teste_suporte__' AND acao='marcou_para_suporte')<>1 THEN RAISE EXCEPTION 'Ação duplicada'; END IF;
 falhou:=false;BEGIN PERFORM public.fila_suporte(codigo,'sem-reserva',NULL,'__sup_dono__','__teste_suporte__',true);EXCEPTION WHEN OTHERS THEN falhou:=true;END;
 IF NOT falhou THEN RAISE EXCEPTION 'Usuário sem nome autorizado'; END IF;
 PERFORM public.fila_suporte(codigo,'teste-sup-terceiro',NULL,NULL,'__teste_suporte__',true);
 IF EXISTS(SELECT 1 FROM public.fila_atribuicoes WHERE pedido_id='__teste_suporte__') THEN RAISE EXCEPTION 'Outro analista não removeu'; END IF;
 PERFORM public.fila_suporte(codigo,'teste-sup-terceiro',NULL,NULL,'__teste_contato__',true);
 IF NOT EXISTS(SELECT 1 FROM public.fila_atribuicoes WHERE pedido_id='__teste_contato__' AND destino_apoio='contato') THEN RAISE EXCEPTION 'Contato comum alterado'; END IF;
END $$;
SELECT 'Suporte: retenção, permissão compartilhada, histórico, ação duplicada, autenticação, remoção por terceiro e contato preservado aprovados' AS resultado;
ROLLBACK;
