DO $patch$
DECLARE antes text; depois text;
BEGIN
 SELECT pg_get_functiondef('public.fila_escala_salvar(text,text,text,jsonb,text)'::regprocedure) INTO antes;
 depois:=replace(antes,' FOR c IN SELECT value FROM jsonb_array_elements(p_itens) LOOP',
  $novo$ FOR c IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
  -- feriados_tooltip_v1: não persistir a anotação virtual retornada pela consulta.
  c:=jsonb_set(c,'{observacao}',to_jsonb(af_mobile.limpar_feriado_exibicao(c->>'observacao')));$novo$);
 IF depois=antes THEN RAISE EXCEPTION 'O contrato de gravação da escala mudou'; END IF;
 EXECUTE depois;
END $patch$;
