DO $parte$
DECLARE antes text; depois text; alvo text;
BEGIN
 SELECT pg_get_functiondef('af_mobile.pedidos_conciliar(text,text,text,jsonb)'::regprocedure) INTO antes;
 -- Mantém integralmente a autenticação, comprovante, validação da nota
 -- automática e regras de pendência aceitas pelos clientes existentes.
 alvo:=$a$  UPDATE af_mobile.pedidos_capturados SET af_situacao=situacao$a$;
 depois:=replace(antes,alvo,$b$  -- Falha posterior de leitura não desfaz uma decisão já confirmada.
  IF q.af_situacao IN ('automatico','autorizado_manual','cancelado') AND situacao IN ('pendente','indisponivel') THEN
   situacao:=q.af_situacao;
  END IF;
  IF p->>'situacao'='autorizado_manual' AND nullif(p->>'evento_em','') IS NOT NULL THEN
   momento:=(p->>'evento_em')::timestamptz;
   IF momento>now()+interval '5 minutes' OR momento<'2000-01-01'::timestamptz THEN RAISE EXCEPTION 'Data da decisão inválida'; END IF;
  END IF;
  IF situacao='autorizado_manual' THEN
   -- O nome legado deste estado não comprova autoria humana. Liberar uma
   -- atribuição já autorizada não cria concluiu_pedido nem crédito humano.
   UPDATE public.fila_atribuicoes SET status='concluido',atualizado_em=now()
    WHERE pedido_id=q.pedido_id AND status IN ('em_andamento','reservado','devolvido');
   IF q.af_situacao IS DISTINCT FROM 'autorizado_manual' THEN
    PERFORM public.fila_log('AF',false,'aprovacao_origem_pendente',NULL,q.pedido_id,'Aprovado no AF; origem a confirmar. Retirado da distribuição sem gerar conclusão humana.');
   END IF;
  END IF;
  UPDATE af_mobile.pedidos_capturados SET triagem_consultas=triagem_consultas+CASE WHEN situacao='autorizado_manual' THEN 1 ELSE 0 END,
   aprovacao_af_em=CASE WHEN p->>'situacao' IN ('automatico','autorizado_manual') AND nullif(p->>'evento_em','') IS NOT NULL
    THEN (p->>'evento_em')::timestamptz ELSE aprovacao_af_em END,
   af_situacao=situacao$b$);
 IF depois=antes THEN RAISE EXCEPTION 'Persistência da conciliação mudou'; END IF;
 EXECUTE depois;

 -- A lista recente de conclusões humanas não inclui autorizações sem origem
 -- e sem declaração humana. O ID continua excluído dos candidatos.

END $parte$;
