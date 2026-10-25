-- O coletor não precisa estar ON. A elegibilidade de quem recebe continua no alocador.
-- A alteração preserva assinatura, autorização, grants e demais regras implantadas.
DO $patch$
DECLARE antes text; depois text;
  bloco text := $gate$  IF NOT a.o_coord AND NOT EXISTS(SELECT 1 FROM public.fila_analistas WHERE nome=a.o_nome AND ligado) THEN
    RETURN json_build_object('ok',true,'distribuidos',0);
  END IF;
$gate$;
BEGIN
  antes:=pg_get_functiondef('public.fila_distribuir_auto(text,text,text,jsonb)'::regprocedure);
  IF position('leitor_identificado_v683' IN antes)>0 THEN RETURN; END IF;
  IF (length(antes)-length(replace(antes,bloco,'')))<>length(bloco) THEN
    RAISE EXCEPTION 'A distribuição mudou. Revise a definição antes de aplicar esta correção.';
  END IF;
  depois:=replace(antes,bloco,E'  -- leitor_identificado_v683: o alocador escolhe somente destinos ON e elegíveis.\n');
  EXECUTE depois;
END $patch$;
