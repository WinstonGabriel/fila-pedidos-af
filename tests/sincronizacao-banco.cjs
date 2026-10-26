const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261026025317_sincronizacao_economica.sql'),'utf8');
(async()=>{
 const db=new PGlite();let n=0;const test=async(s,f)=>{await f();n++;console.log('PASS',s);};
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA af_mobile;GRANT USAGE ON SCHEMA af_mobile TO anon,authenticated,service_role;
   CREATE TABLE public.fila_analistas(nome text PRIMARY KEY,ligado boolean DEFAULT false);INSERT INTO public.fila_analistas VALUES('Gabriel',true),('Rayla',false);
   CREATE TABLE public.fila_usuarios(nome text,token text);INSERT INTO public.fila_usuarios VALUES('Gabriel','TOKEN-G'),('Rayla','TOKEN-R');
   CREATE TABLE public.fila_atribuicoes(pedido_id text PRIMARY KEY,analista text,status text,hora text,valor text,estab text,href text,categoria text,criado_em timestamptz DEFAULT now(),atualizado_em timestamptz DEFAULT now());
   CREATE TABLE public.fila_config(chave text,valor text);INSERT INTO public.fila_config VALUES('codigo','TEST'),('codigo_coord','SEGREDO'),('cliente_config_v1','{}');
   CREATE TABLE public.fila_eventos(id bigint);INSERT INTO public.fila_eventos VALUES(1);
   CREATE TABLE public.fila_preferencias_analista(analista text,lojas jsonb);CREATE TABLE public.fila_rotas_loja(loja text);
   CREATE TABLE af_mobile.pedidos_capturados(pedido_id text,origem text,href text,concluido_em timestamptz,valor_centavos bigint);
   CREATE FUNCTION public.fila_ator(p_codigo text,p_token text,p_coord text,p_exigir boolean DEFAULT true,OUT o_nome text,OUT o_coord boolean) RETURNS record LANGUAGE plpgsql AS $$BEGIN IF p_codigo IS DISTINCT FROM 'TEST' THEN RAISE EXCEPTION 'Equipe inválida';END IF;IF p_coord IS NOT NULL AND p_coord IS DISTINCT FROM 'GESTAO' THEN RAISE EXCEPTION 'Coordenação inválida';END IF;SELECT nome INTO o_nome FROM public.fila_usuarios WHERE token=p_token;o_coord:=coalesce(p_coord='GESTAO',false);IF p_exigir AND o_nome IS NULL AND NOT o_coord THEN RAISE EXCEPTION 'Escolha seu nome';END IF;END$$;
   CREATE FUNCTION public.fila_descanso(p_codigo text,p_token text,p_coord text)RETURNS jsonb LANGUAGE plpgsql AS $$BEGIN PERFORM public.fila_ator(p_codigo,p_token,p_coord,false);RETURN jsonb_build_object('servidor_em',clock_timestamp(),'analistas',jsonb_build_object('Gabriel',jsonb_build_object('on_desde',null,'proximo_em',clock_timestamp()+interval '20 minutes','usados',1)));END$$;
   CREATE FUNCTION public.fila_avisos(p_codigo text,p_token text,p_coord text)RETURNS json LANGUAGE sql AS $$SELECT json_build_object('analista',(select nome from public.fila_usuarios where token=p_token),'ultimo_id',(select max(id) from public.fila_eventos),'itens','[]'::json)$$;
   INSERT INTO public.fila_atribuicoes(pedido_id,analista,status,hora,valor,estab,href,categoria,atualizado_em)
    SELECT (2026000000000000+i)::text,'Gabriel','concluido','14:37','R$ 1.234,56',repeat('Loja teste ',12),'https://af.mateusmais.com.br/pedido/00000001-0000-4000-8000-000000000001','Varejo',now()+i*interval '1 millisecond' FROM generate_series(1,252) i;
   INSERT INTO public.fila_atribuicoes(pedido_id,analista,status,hora,valor,estab,href,categoria)
    SELECT (2026000000000300+i)::text,'Rayla',s,'14:37','R$ 10,00','Loja teste','https://af.mateusmais.com.br/pedido/00000001-0000-4000-8000-000000000001','Varejo' FROM unnest(ARRAY['em_andamento','reservado','contato','devolvido'])WITH ORDINALITY t(s,i);
   INSERT INTO af_mobile.pedidos_capturados SELECT (2026000000000000+i)::text,'automatico','https://af.mateusmais.com.br/pedido/00000001-0000-4000-8000-000000000001',now()+i*interval '1 millisecond',1000 FROM generate_series(240,252)i;`);
  await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/estado-6.9.0.sql'),'utf8'));
  const q=async(s,a=[])=>(await db.query(s,a)).rows;
  const estado=async()=> (await q("select public.fila_estado('TEST','TOKEN-G',null) as r"))[0].r;
  const antes=await estado(),bytesAntes=Buffer.byteLength(JSON.stringify(antes));
  await db.exec(migration);
  await test('clientes anteriores recebem todos os ativos e só oito conclusões humanas recentes',async()=>{
   const r=await estado();assert.equal(r.atribuicoes.length,12);assert.equal(r.atribuicoes.filter(x=>x.status==='concluido').length,8);assert.equal(r.automaticos.length,8);assert.equal(r.concluidos_ids.length,252);
   for(const s of ['em_andamento','reservado','contato','devolvido'])assert.ok(r.atribuicoes.some(x=>x.status===s));
   assert.ok(r.atribuicoes.filter(x=>x.status==='concluido').every(x=>Number(x.pedido_id.slice(-3))<240));
   assert.ok(Buffer.byteLength(JSON.stringify(r))<bytesAntes/4);assert.equal((await q('select count(*)::int n from public.fila_atribuicoes'))[0].n,256);
   console.log('JSON de teste:',bytesAntes,'→',Buffer.byteLength(JSON.stringify(r)),'bytes');
  });
  const sync=async(v={},token='TOKEN-G',coord=null)=>(await q("select public.fila_sincronizar('TEST',$1,$2,$3::jsonb) as r",[token,coord,JSON.stringify(v)]))[0].r;
  let primeiro=await sync();
  await test('primeira leitura entrega blocos e a repetição não reenvia dados nem relógios voláteis',async()=>{
   assert.deepEqual(Object.keys(primeiro.dados).sort(),['avisos','descansos','estado']);
   const r=await sync(primeiro.versoes);assert.deepEqual(r.dados,{});assert.ok(Buffer.byteLength(JSON.stringify(r))<512);
  });
  await test('somente o bloco de status alterado volta pela rede',async()=>{
   await db.exec("update public.fila_analistas set ligado=false where nome='Gabriel'");const r=await sync(primeiro.versoes);assert.deepEqual(Object.keys(r.dados),['estado']);primeiro=r;
  });
  await test('aviso novo atualiza avisos e versão de eventos; nenhuma notificação é descartada',async()=>{
   await db.exec('insert into public.fila_eventos values(2)');const r=await sync(primeiro.versoes);assert.ok(r.dados.avisos);assert.ok(r.dados.estado);assert.equal(r.dados.avisos.ultimo_id,2);primeiro=r;
  });
  await test('cache não dispensa autenticação nem mistura o destinatário',async()=>{
   await assert.rejects(q("select public.fila_sincronizar('ERRADA','TOKEN-G',null,$1::jsonb)",[JSON.stringify(primeiro.versoes)]),/Equipe inválida/);
   await assert.rejects(sync(primeiro.versoes,'TOKEN-G','INVÁLIDO'),/Coordenação inválida/);
   const r=await sync(primeiro.versoes,'TOKEN-R');assert.equal(r.dados.avisos.analista,'Rayla');assert.equal(r.dados.estado.usuarios.find(x=>x.meu).nome,'Rayla');
   assert.ok(!JSON.stringify(r.dados).includes('SEGREDO'));assert.ok(!JSON.stringify(r.dados).includes('TOKEN-R'));
  });
  await test('wrapper público invoker, helper privado, PUBLIC revogado e reaplicação sem perda',async()=>{
   const r=(await q("select p.prosecdef as definer,exists(select 1 from aclexplode(p.proacl) a where a.grantee=0) as publico from pg_proc p where p.oid='public.fila_sincronizar(text,text,text,jsonb)'::regprocedure"))[0];assert.equal(r.definer,false);assert.equal(r.publico,false);
   await db.exec(migration);assert.equal((await estado()).atribuicoes.length,12);
  });
  console.log(`${n} verificações de economia no banco passaram.`);
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
