-- Contrato anterior do trigger de avisos, sem dados operacionais.
CREATE OR REPLACE FUNCTION public.fila_atividade_evento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE ator text:=coalesce(nullif(current_setting('fila.ator',true),''),'Sistema'); coord boolean:=coalesce(nullif(current_setting('fila.coord',true),'')::boolean,false); pedido text;
BEGIN
 IF (NEW.atividade,NEW.atividade_inicio,NEW.atividade_fim) IS DISTINCT FROM (OLD.atividade,OLD.atividade_inicio,OLD.atividade_fim) THEN
  INSERT INTO public.fila_eventos(analista,tipo,ator,detalhe) VALUES(NEW.nome,'status',ator,jsonb_build_object('antes',OLD.atividade,'depois',NEW.atividade,'inicio',NEW.atividade_inicio,'fim',NEW.atividade_fim));
  IF NEW.atividade IN ('off','ferias','folga') THEN
   FOR pedido IN WITH devolvidos AS (UPDATE public.fila_atribuicoes SET status='devolvido',atualizado_em=now() WHERE analista=NEW.nome AND status='em_andamento' RETURNING pedido_id) SELECT pedido_id FROM devolvidos LOOP
    PERFORM public.fila_log(ator,coord,'devolveu_pedido_a_fila',NEW.nome,pedido,'Status: '||NEW.atividade);
   END LOOP;
  END IF;
 END IF;
 RETURN NEW;
END $function$;
