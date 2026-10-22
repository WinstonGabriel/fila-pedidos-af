-- Atualizações 5.1 a 5.3.1 sobre o banco da fila existente. Já aplicadas.
BEGIN;
-- Fila de Pedidos 5.1: escolha explícita e exclusiva de nomes, histórico paginado.
CREATE OR REPLACE FUNCTION public.fila_escolher_nome(p_codigo text, p_token text, p_coord text, p_nome text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE antigo text;
BEGIN
  PERFORM public.fila_ator(p_codigo, p_token, p_coord, false);
  IF p_token IS NULL OR length(p_token) < 8 THEN RAISE EXCEPTION 'Identificação da extensão inválida'; END IF;
  IF p_nome IS NULL OR NOT EXISTS (SELECT 1 FROM public.fila_analistas WHERE nome = p_nome) THEN RAISE EXCEPTION 'Nome inválido'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(802153, 510);
  IF EXISTS (SELECT 1 FROM public.fila_usuarios WHERE nome = p_nome AND token <> p_token) THEN
    RAISE EXCEPTION 'O nome % já está em uso por outro analista. Aguarde a liberação.', p_nome;
  END IF;
  SELECT nome INTO antigo FROM public.fila_usuarios WHERE token = p_token;
  IF antigo = p_nome THEN
    UPDATE public.fila_usuarios SET atualizado_em = now() WHERE token = p_token;
    RETURN json_build_object('ok', true);
  END IF;
  IF antigo IS NOT NULL THEN
    DELETE FROM public.fila_usuarios WHERE token = p_token;
    PERFORM public.fila_log(antigo, false, 'liberou_nome', antigo, NULL, 'Troca de nome para ' || p_nome);
  END IF;
  INSERT INTO public.fila_usuarios(nome, token) VALUES (p_nome, p_token);
  PERFORM public.fila_log(p_nome, false, 'assumiu_nome', p_nome, NULL, 'Escolha explícita na extensão');
  RETURN json_build_object('ok', true);
END;
$$;

-- Clientes antigos não podem recuperar automaticamente reservas que foram liberadas.
CREATE OR REPLACE FUNCTION public.fila_assumir_nome(p_codigo text, p_token text, p_coord text, p_nome text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.fila_check(p_codigo);
  IF EXISTS (SELECT 1 FROM public.fila_usuarios WHERE nome=p_nome AND token=p_token) THEN
    RETURN json_build_object('ok', true);
  END IF;
  RAISE EXCEPTION 'Atualize a extensão para a versão 5.1 e escolha seu nome em "Eu sou".';
END;
$$;

CREATE OR REPLACE FUNCTION public.fila_liberar_nome(p_codigo text, p_token text, p_coord text, p_nome text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a record; liberado text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(802153, 510);
  SELECT * INTO a FROM public.fila_ator(p_codigo, p_token, p_coord);
  IF NOT a.o_coord AND a.o_nome IS DISTINCT FROM p_nome THEN
    RAISE EXCEPTION 'Você só pode liberar o seu próprio nome';
  END IF;
  DELETE FROM public.fila_usuarios WHERE nome=p_nome RETURNING nome INTO liberado;
  IF liberado IS NOT NULL THEN
    PERFORM public.fila_log(a.o_nome, a.o_coord, 'liberou_nome', p_nome, NULL, 'Nome disponível para nova escolha');
  END IF;
  RETURN json_build_object('ok', true);
END;
$$;



CREATE OR REPLACE FUNCTION public.fila_historico_pagina(
  p_codigo text, p_token text, p_coord text, p_limite integer DEFAULT 100,
  p_analista text DEFAULT NULL, p_antes bigint DEFAULT NULL,
  p_acao text DEFAULT NULL, p_pedido text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE limite integer := greatest(1, least(coalesce(p_limite,100),250)); resultado json;
BEGIN
  PERFORM public.fila_ator(p_codigo, p_token, p_coord, false);
  WITH filtrados AS (
    SELECT id, quando, ator, coord, acao, analista, pedido_id, detalhe
    FROM public.fila_historico
    WHERE (p_analista IS NULL OR ator=p_analista OR analista=p_analista)
      AND (p_antes IS NULL OR id < p_antes)
      AND (p_acao IS NULL OR acao=p_acao)
      AND (nullif(p_pedido,'') IS NULL OR position(p_pedido IN coalesce(pedido_id,'')) > 0)
    ORDER BY id DESC LIMIT limite+1
  ), pagina AS (SELECT * FROM filtrados ORDER BY id DESC LIMIT limite)
  SELECT json_build_object(
    'itens', (SELECT coalesce(json_agg(p ORDER BY p.id DESC),'[]'::json) FROM pagina p),
    'temMais', (SELECT count(*) > limite FROM filtrados),
    'proximo', (SELECT min(id) FROM pagina)
  ) INTO resultado;
  RETURN resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.fila_estado(p_codigo text, p_token text DEFAULT NULL, p_coord text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a record;
BEGIN
  SELECT * INTO a FROM public.fila_ator(p_codigo, p_token, p_coord, false);
  IF random() < 0.03 THEN
    DELETE FROM public.fila_atribuicoes WHERE status='concluido' AND atualizado_em < now()-interval '2 days';
  END IF;
  -- O histórico não é apagado automaticamente: permanece consultável por páginas.
  RETURN json_build_object(
    'analistas', (SELECT coalesce(json_agg(x),'[]'::json) FROM public.fila_analistas x),
    'atribuicoes', (SELECT coalesce(json_agg(t ORDER BY t.criado_em),'[]'::json) FROM public.fila_atribuicoes t),
    'janela', (SELECT coalesce(json_object_agg(chave,valor),'{}'::json) FROM public.fila_config WHERE chave NOT IN ('codigo','codigo_coord')),
    'usuarios', (SELECT coalesce(json_agg(json_build_object('nome',u.nome,'meu',(p_token IS NOT NULL AND u.token=p_token))),'[]'::json) FROM public.fila_usuarios u),
    'coord', a.o_coord);
END;
$$;

REVOKE ALL ON FUNCTION public.fila_escolher_nome(text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fila_historico_pagina(text,text,text,integer,text,bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fila_escolher_nome(text,text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fila_historico_pagina(text,text,text,integer,text,bigint,text,text) TO anon, authenticated;
-- Registros de auditoria só são criados pelas operações autorizadas da fila.
REVOKE EXECUTE ON FUNCTION public.fila_log(text,boolean,text,text,text,text) FROM PUBLIC, anon, authenticated;

-- Distribuição automática e devolução real à fila. Preserva os pedidos existentes.
ALTER TABLE public.fila_atribuicoes ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT '';
ALTER TABLE public.fila_atribuicoes DROP CONSTRAINT fila_status_valido;
ALTER TABLE public.fila_atribuicoes ADD CONSTRAINT fila_status_valido
  CHECK (status IN ('em_andamento','concluido','contato','reservado','devolvido'));

-- Helper interno: só é chamado por operações que já verificaram a equipe e o ator.
CREATE OR REPLACE FUNCTION public.fila_auto_alocar(p_ator text, p_coord boolean, p_candidatos jsonb, p_prioridade text)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE r public.fila_atribuicoes; pessoa record; c jsonb; destino text;
  quantidade integer := 0; precisa_fv boolean; pool jsonb := coalesce(p_candidatos,'[]'::jsonb);
BEGIN
  IF jsonb_typeof(pool) <> 'array' OR jsonb_array_length(pool)>1000 THEN RAISE EXCEPTION 'Lista de pedidos inválida'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(802153,530);
  UPDATE public.fila_atribuicoes q SET categoria=c.value->>'cat'
    FROM jsonb_array_elements(pool) c
   WHERE q.pedido_id=c.value->>'id' AND q.categoria='' AND coalesce(c.value->>'cat','')<>'';

  -- Reservas manuais do próprio analista continuam tendo prioridade.
  FOR r IN SELECT q.* FROM public.fila_atribuicoes q
    JOIN public.fila_analistas a ON a.nome=q.analista AND a.ligado
    JOIN public.fila_usuarios u ON u.nome=a.nome
    WHERE q.status='reservado' ORDER BY q.criado_em,q.pedido_id
  LOOP
    IF NOT EXISTS(SELECT 1 FROM public.fila_atribuicoes WHERE analista=r.analista AND status='em_andamento') THEN
      UPDATE public.fila_atribuicoes SET status='em_andamento',criado_em=now(),atualizado_em=now() WHERE pedido_id=r.pedido_id;
      PERFORM public.fila_log(p_ator,p_coord,'recebeu_pedido',r.analista,r.pedido_id,'Distribuição automática; reserva manual');
      quantidade := quantidade+1;
    END IF;
  END LOOP;

  -- Um pedido devolvido sorteia outro analista elegível, ON e sem pedido atual.
  FOR r IN SELECT * FROM public.fila_atribuicoes WHERE status='devolvido' ORDER BY atualizado_em,pedido_id
  LOOP
    precisa_fv := (r.categoria || ' ' || r.estab) ~* 'for[cç]a[[:space:]]+de[[:space:]]+vendas'
      OR (r.categoria='' AND r.analista IN ('Cássio','Gabriel'));
    SELECT a.nome INTO destino FROM public.fila_analistas a JOIN public.fila_usuarios u ON u.nome=a.nome
      WHERE a.ligado AND a.nome<>r.analista
        AND (NOT precisa_fv OR a.nome IN ('Cássio','Gabriel'))
        AND NOT EXISTS(SELECT 1 FROM public.fila_atribuicoes q WHERE q.analista=a.nome AND q.status='em_andamento')
      ORDER BY random() LIMIT 1 FOR UPDATE OF a;
    IF destino IS NOT NULL THEN
      UPDATE public.fila_atribuicoes SET analista=destino,status='em_andamento',criado_em=now(),atualizado_em=now() WHERE pedido_id=r.pedido_id;
      PERFORM public.fila_log(p_ator,p_coord,'recebeu_pedido',destino,r.pedido_id,'Redistribuição aleatória; liberado por ' || r.analista);
      quantidade := quantidade+1;
    END IF;
  END LOOP;

  -- Quem ligou ON ou concluiu recebe seu próximo; sorteia os demais analistas livres.
  -- Os pedidos mantêm a preferência e a antiguidade.
  FOR pessoa IN SELECT a.nome FROM public.fila_analistas a JOIN public.fila_usuarios u ON u.nome=a.nome
    WHERE a.ligado AND NOT EXISTS(SELECT 1 FROM public.fila_atribuicoes q WHERE q.analista=a.nome AND q.status='em_andamento')
    ORDER BY (a.nome=p_prioridade) DESC NULLS LAST, random() FOR UPDATE OF a
  LOOP
    FOR c IN SELECT value FROM jsonb_array_elements(pool) WITH ORDINALITY AS p(value,ordem)
      ORDER BY coalesce((value->>'preferencia')::boolean,false) DESC,ordem
    LOOP
      IF coalesce(c->>'id','')='' THEN CONTINUE; END IF;
      IF (coalesce(c->>'cat','') || ' ' || coalesce(c->>'estab','')) ~* 'for[cç]a[[:space:]]+de[[:space:]]+vendas'
        AND pessoa.nome NOT IN ('Cássio','Gabriel') THEN CONTINUE; END IF;
      INSERT INTO public.fila_atribuicoes(pedido_id,analista,status,hora,valor,estab,href,categoria)
      VALUES(c->>'id',pessoa.nome,'em_andamento',coalesce(c->>'hora',''),coalesce(c->>'valor',''),coalesce(c->>'estab',''),coalesce(c->>'href',''),coalesce(c->>'cat',''))
      ON CONFLICT(pedido_id) DO NOTHING;
      IF FOUND THEN
        PERFORM public.fila_log(p_ator,p_coord,'recebeu_pedido',pessoa.nome,c->>'id','Distribuição automática; ' || coalesce(c->>'estab',''));
        quantidade := quantidade+1;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
  RETURN quantidade;
END;
$$;

CREATE OR REPLACE FUNCTION public.fila_distribuir_auto(p_codigo text,p_token text,p_coord text,p_candidatos jsonb)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a record; n integer;
BEGIN
  SELECT * INTO a FROM public.fila_ator(p_codigo,p_token,p_coord);
  IF NOT a.o_coord AND NOT EXISTS(SELECT 1 FROM public.fila_analistas WHERE nome=a.o_nome AND ligado) THEN
    RETURN json_build_object('ok',true,'distribuidos',0);
  END IF;
  n := public.fila_auto_alocar(a.o_nome,a.o_coord,p_candidatos,a.o_nome);
  RETURN json_build_object('ok',true,'distribuidos',n);
END;
$$;

-- Uma única transação finaliza o pedido exibido e aloca os próximos.
-- O ID esperado impede que uma resposta repetida conclua o pedido seguinte.

-- Compatibilidade: clientes anteriores também devolvem, sem marcar como concluído.
CREATE OR REPLACE FUNCTION public.fila_liberar_pedido(p_codigo text,p_token text,p_coord text,p_analista text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a record; pedido text;
BEGIN
  SELECT * INTO a FROM public.fila_ator(p_codigo,p_token,p_coord);
  PERFORM public.fila_autoriza(a.o_nome,a.o_coord,p_analista);
  PERFORM pg_catalog.pg_advisory_xact_lock(802153,530);
  UPDATE public.fila_atribuicoes SET status='devolvido',atualizado_em=now()
    WHERE analista=p_analista AND status='em_andamento' RETURNING pedido_id INTO pedido;
  IF pedido IS NOT NULL THEN PERFORM public.fila_log(a.o_nome,a.o_coord,'liberou_pedido',p_analista,pedido,'Devolvido à fila; aguarda outro analista ON e disponível'); END IF;
  RETURN json_build_object('ok',true,'pedido_id',pedido);
END;
$$;

CREATE OR REPLACE FUNCTION public.fila_liberar(p_codigo text,p_token text,p_coord text,p_analista text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a record; pedido text;
BEGIN
  SELECT * INTO a FROM public.fila_ator(p_codigo,p_token,p_coord);
  PERFORM public.fila_autoriza(a.o_nome,a.o_coord,p_analista);
  PERFORM pg_catalog.pg_advisory_xact_lock(802153,530);
  UPDATE public.fila_atribuicoes SET status='devolvido',atualizado_em=now()
    WHERE analista=p_analista AND status='em_andamento' RETURNING pedido_id INTO pedido;
  IF pedido IS NOT NULL THEN PERFORM public.fila_log(a.o_nome,a.o_coord,'devolveu_pedido_a_fila',p_analista,pedido,'Disponibilidade desligada; devolvido à fila'); END IF;
  RETURN json_build_object('ok',true,'pedido_id',pedido);
END;
$$;

-- A versão antiga não pode recuperar imediatamente o próprio pedido devolvido.
CREATE OR REPLACE FUNCTION public.fila_puxar(p_codigo text,p_token text,p_coord text,p_analista text,p_candidatos jsonb)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a record; c jsonb; r public.fila_atribuicoes;
BEGIN
  SELECT * INTO a FROM public.fila_ator(p_codigo,p_token,p_coord);
  PERFORM public.fila_autoriza(a.o_nome,a.o_coord,p_analista);
  PERFORM pg_catalog.pg_advisory_xact_lock(802153,530);
  SELECT * INTO r FROM public.fila_atribuicoes WHERE analista=p_analista AND status='em_andamento' LIMIT 1;
  IF FOUND THEN RETURN row_to_json(r); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.fila_analistas WHERE nome=p_analista AND ligado) THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.fila_atribuicoes WHERE analista=p_analista AND status='reservado' ORDER BY criado_em LIMIT 1;
  IF FOUND THEN
    UPDATE public.fila_atribuicoes SET status='em_andamento',criado_em=now(),atualizado_em=now() WHERE pedido_id=r.pedido_id RETURNING * INTO r;
    PERFORM public.fila_log(a.o_nome,a.o_coord,'recebeu_pedido',p_analista,r.pedido_id,'Reserva manual');
    RETURN row_to_json(r);
  END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(coalesce(p_candidatos,'[]'::jsonb)) LOOP
    IF EXISTS(SELECT 1 FROM public.fila_atribuicoes WHERE pedido_id=c->>'id') THEN CONTINUE; END IF;
    INSERT INTO public.fila_atribuicoes(pedido_id,analista,status,hora,valor,estab,href,categoria)
    VALUES(c->>'id',p_analista,'em_andamento',coalesce(c->>'hora',''),coalesce(c->>'valor',''),coalesce(c->>'estab',''),coalesce(c->>'href',''),coalesce(c->>'cat',''))
    ON CONFLICT(pedido_id) DO NOTHING RETURNING * INTO r;
    IF FOUND THEN
      PERFORM public.fila_log(a.o_nome,a.o_coord,'recebeu_pedido',p_analista,r.pedido_id,coalesce(c->>'estab',''));
      RETURN row_to_json(r);
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

DROP FUNCTION IF EXISTS public.fila_auto_alocar(text,boolean,jsonb);
REVOKE ALL ON FUNCTION public.fila_auto_alocar(text,boolean,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fila_distribuir_auto(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fila_distribuir_auto(text,text,text,jsonb) TO anon,authenticated;

REVOKE ALL ON FUNCTION public.fila_liberar_pedido(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fila_liberar_pedido(text,text,text,text) TO anon,authenticated;


CREATE OR REPLACE FUNCTION public.fila_avancar(
  p_codigo text,p_token text,p_coord text,p_analista text,p_pedido_id text,p_acao text,p_candidatos jsonb)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a record; r public.fila_atribuicoes; n integer;
BEGIN
  SELECT * INTO a FROM public.fila_ator(p_codigo,p_token,p_coord);
  IF p_acao IS DISTINCT FROM 'contato' THEN
    PERFORM public.fila_autoriza(a.o_nome,a.o_coord,p_analista);
  END IF;
  IF p_acao NOT IN ('concluir','liberar','contato') OR p_acao IS NULL THEN RAISE EXCEPTION 'Ação inválida'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(802153,530);
  SELECT * INTO r FROM public.fila_atribuicoes WHERE analista=p_analista AND status='em_andamento' AND pedido_id=p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('ok',true,'ja_processado',true,'distribuidos',0); END IF;
  IF p_acao='liberar' THEN
    UPDATE public.fila_atribuicoes SET status='devolvido',atualizado_em=now() WHERE pedido_id=r.pedido_id;
    PERFORM public.fila_log(a.o_nome,a.o_coord,'liberou_pedido',p_analista,r.pedido_id,'Devolvido à fila; aguarda outro analista ON e disponível');
  ELSIF p_acao='concluir' THEN
    UPDATE public.fila_atribuicoes SET status='concluido',atualizado_em=now() WHERE pedido_id=r.pedido_id;
    PERFORM public.fila_log(a.o_nome,a.o_coord,'concluiu_pedido',p_analista,r.pedido_id,'');
  ELSE
    UPDATE public.fila_atribuicoes SET status='contato',atualizado_em=now() WHERE pedido_id=r.pedido_id;
    PERFORM public.fila_log(a.o_nome,a.o_coord,'marcou_para_contato',p_analista,r.pedido_id,'');
  END IF;
  n := public.fila_auto_alocar(a.o_nome,a.o_coord,p_candidatos,p_analista);
  RETURN json_build_object('ok',true,'pedido_id',r.pedido_id,'distribuidos',n);
END;
$$;

-- Contato é compartilhado entre analistas identificados da equipe.
-- A versão anterior do cliente continua usando esta assinatura.
CREATE OR REPLACE FUNCTION public.fila_contato(p_codigo text,p_token text,p_coord text,p_analista text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a record; r public.fila_atribuicoes;
BEGIN
  SELECT * INTO a FROM public.fila_ator(p_codigo,p_token,p_coord);
  PERFORM pg_catalog.pg_advisory_xact_lock(802153,530);
  SELECT * INTO r FROM public.fila_atribuicoes
    WHERE analista=p_analista AND status='em_andamento' FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('ok',true,'ja_processado',true); END IF;
  UPDATE public.fila_atribuicoes SET status='contato',atualizado_em=now() WHERE pedido_id=r.pedido_id;
  PERFORM public.fila_log(a.o_nome,a.o_coord,'marcou_para_contato',r.analista,r.pedido_id,'');
  RETURN json_build_object('ok',true,'pedido_id',r.pedido_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.fila_devolver(p_codigo text,p_token text,p_coord text,p_id text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a record; r public.fila_atribuicoes;
BEGIN
  SELECT * INTO a FROM public.fila_ator(p_codigo,p_token,p_coord);
  PERFORM pg_catalog.pg_advisory_xact_lock(802153,530);
  SELECT * INTO r FROM public.fila_atribuicoes
    WHERE pedido_id=p_id AND status IN ('contato','reservado') FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('ok',true,'ja_processado',true); END IF;
  -- Somente a marcação de contato é compartilhada. Reservas mantêm seu dono.
  IF r.status='reservado' THEN
    PERFORM public.fila_autoriza(a.o_nome,a.o_coord,r.analista);
  END IF;
  DELETE FROM public.fila_atribuicoes WHERE pedido_id=r.pedido_id AND status=r.status;
  PERFORM public.fila_log(a.o_nome,a.o_coord,
    CASE r.status WHEN 'contato' THEN 'removeu_de_contato' ELSE 'cancelou_reserva' END,
    r.analista,r.pedido_id,'');
  RETURN json_build_object('ok',true,'pedido_id',r.pedido_id);
END;
$$;

REVOKE ALL ON FUNCTION public.fila_avancar(text,text,text,text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fila_contato(text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fila_devolver(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fila_avancar(text,text,text,text,text,text,jsonb) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fila_contato(text,text,text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fila_devolver(text,text,text,text) TO anon,authenticated;

COMMIT;
