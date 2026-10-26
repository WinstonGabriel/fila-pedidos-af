DO $parte$
DECLARE antes text; depois text; alvo text;
BEGIN
 SELECT pg_get_functiondef('af_mobile.producao_relatorio(date,date,text)'::regprocedure) INTO antes;
 depois:=replace(antes,$a$'sem_conclusao',(SELECT$a$,
  $b$'aprovados_origem_pendente',(SELECT jsonb_build_object('quantidade',count(*),'valor_centavos',coalesce(sum(valor_centavos),0),'sem_valor',count(*) FILTER(WHERE valor_centavos IS NULL)) FROM af_mobile.pedidos_capturados WHERE origem IS NULL AND af_situacao='autorizado_manual' AND aprovacao_af_em>=p_inicio::timestamp AT TIME ZONE 'America/Fortaleza' AND aprovacao_af_em<(p_fim+1)::timestamp AT TIME ZONE 'America/Fortaleza'),
  'sem_conclusao',(SELECT$b$);
 IF depois=antes THEN RAISE EXCEPTION 'Relatório de produção mudou'; END IF;
 EXECUTE depois;

 -- Os clientes antigos exibem a ação textual e o detalhe já pelo histórico.

END $parte$;
