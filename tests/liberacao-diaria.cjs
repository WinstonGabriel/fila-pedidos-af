const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const arquivo=process.env.AF_MIGRATION_PATH||path.join(__dirname,'../supabase/migrations',fs.readdirSync(path.join(__dirname,'../supabase/migrations')).find(f=>f.endsWith('_liberar_nomes_meia_noite.sql'))||'MIGRACAO-AUSENTE');
const migration=fs.readFileSync(arquivo,'utf8');
(async()=>{
 const db=new PGlite();let n=0;const test=async(s,f)=>{await f();n++;console.log('PASS',s);};
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA af_mobile;CREATE SCHEMA cron;GRANT USAGE ON SCHEMA af_mobile TO anon,authenticated,service_role;
   CREATE TABLE public.fila_usuarios(nome text PRIMARY KEY,token text UNIQUE,atualizado_em timestamptz NOT NULL DEFAULT now());
   CREATE TABLE public.fila_analistas(nome text PRIMARY KEY,ligado boolean,atividade text);INSERT INTO public.fila_analistas VALUES('Cássio',true,'on'),('Rayla',false,'ferias'),('Gabriel',true,'on');
   CREATE TABLE public.fila_atribuicoes(pedido_id text PRIMARY KEY,analista text,status text);INSERT INTO public.fila_atribuicoes VALUES('1000000000001','Cássio','em_andamento'),('1000000000002','Rayla','contato');
   CREATE TABLE public.fila_escala(analista text,data date,tipo text);INSERT INTO public.fila_escala VALUES('Rayla','2026-10-26','ferias');
   CREATE TABLE public.fila_historico(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,ator text,coord boolean,acao text,analista text,pedido_id text,detalhe text);INSERT INTO public.fila_historico(ator,acao,analista)VALUES('Cássio','concluiu_pedido','Cássio');
   CREATE TABLE public.fila_gestao_sessoes(instalacao text,perfil text);INSERT INTO public.fila_gestao_sessoes VALUES('TOKEN-GESTAO','Coordenador');
   CREATE TABLE public.falha_teste(ativa boolean);INSERT INTO public.falha_teste VALUES(false);
   CREATE FUNCTION public.fila_log(p_ator text,p_coord boolean,p_acao text,p_analista text,p_pedido text,p_detalhe text)RETURNS void LANGUAGE plpgsql AS $$BEGIN IF (SELECT ativa FROM public.falha_teste) AND p_analista='Rayla' THEN RAISE EXCEPTION 'Falha simulada na auditoria';END IF;INSERT INTO public.fila_historico(ator,coord,acao,analista,pedido_id,detalhe)VALUES(p_ator,p_coord,p_acao,p_analista,p_pedido,p_detalhe);END$$;
   CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,jobname text UNIQUE,schedule text,command text,active boolean DEFAULT true);
   INSERT INTO cron.job(jobname,schedule,command)VALUES('outro-aplicativo','*/5 * * * *','SELECT 1'),('af-descanso-encerrar','* * * * *','SELECT 2');
   CREATE FUNCTION cron.schedule(p_name text,p_schedule text,p_command text) RETURNS bigint LANGUAGE sql AS $$INSERT INTO cron.job(jobname,schedule,command)VALUES(p_name,p_schedule,p_command)ON CONFLICT(jobname)DO UPDATE SET schedule=EXCLUDED.schedule,command=EXCLUDED.command RETURNING jobid$$;
   INSERT INTO public.fila_usuarios VALUES('Cássio','TOKEN-C','2026-10-25T14:00:00Z'),('Rayla','TOKEN-R','2026-10-25T23:00:00Z'),('Gabriel','TOKEN-G','2026-10-26T03:00:01Z');`);
  // PGlite não carrega pg_cron: somente a detecção da extensão é substituída.
  const localMigration=migration.replace("NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron')",'false');
  await db.exec(localMigration);
  const q=async(s,a=[])=>(await db.query(s,a)).rows;
  const executar=async iso=>(await q('select af_mobile.liberar_nomes_diario($1::timestamptz) r',[iso]))[0].r;
  await test('ativação não libera nomes de quem já está trabalhando',async()=>{
   assert.equal((await q('select count(*)::int n from public.fila_usuarios'))[0].n,3);
   assert.equal((await q('select count(*)::int n from af_mobile.liberacao_nomes_diaria where ativacao'))[0].n,1);
  });
  await db.exec("TRUNCATE af_mobile.liberacao_nomes_diaria;INSERT INTO af_mobile.liberacao_nomes_diaria(dia,ativacao)VALUES('2026-10-25',true)");
  await test('00:00 UTC ainda é o dia anterior em São Luís; não antecipa a liberação',async()=>{
   assert.equal((await executar('2026-10-26T00:00:00Z')).ja_processado,true);assert.equal((await q('select count(*)::int n from public.fila_usuarios'))[0].n,3);
  });
  const original=(await q('select jsonb_build_object(\'analistas\',(select jsonb_agg(a)from public.fila_analistas a),\'pedidos\',(select jsonb_agg(a)from public.fila_atribuicoes a),\'escala\',(select jsonb_agg(a)from public.fila_escala a),\'gestao\',(select jsonb_agg(a)from public.fila_gestao_sessoes a)) r'))[0].r;
  await test('meia-noite local libera reservas antigas e preserva escolha explícita após a virada',async()=>{
   const r=await executar('2026-10-26T03:00:05Z');assert.equal(r.dia,'2026-10-26');assert.equal(r.liberados,2);
   assert.deepEqual((await q('select nome from public.fila_usuarios')).map(x=>x.nome),['Gabriel']);
   const h=await q("select * from public.fila_historico where acao='liberou_nome'");assert.equal(h.length,2);assert.ok(h.every(x=>x.ator==='Sistema'&&!x.coord&&!x.pedido_id));assert.ok(h.every(x=>!x.detalhe.includes('TOKEN-')));
  });
  await test('execução repetida não libera de novo, e o dia seguinte pode liberar normalmente',async()=>{
   assert.equal((await executar('2026-10-26T03:00:30Z')).ja_processado,true);assert.equal((await executar('2026-10-27T03:00:00Z')).liberados,1);
   assert.equal((await q("select count(*)::int n from public.fila_historico where acao='liberou_nome'"))[0].n,3);
  });
  await test('pedidos, status, férias, escala, sessão de gestão e histórico original são preservados',async()=>{
   const depois=(await q('select jsonb_build_object(\'analistas\',(select jsonb_agg(a)from public.fila_analistas a),\'pedidos\',(select jsonb_agg(a)from public.fila_atribuicoes a),\'escala\',(select jsonb_agg(a)from public.fila_escala a),\'gestao\',(select jsonb_agg(a)from public.fila_gestao_sessoes a)) r'))[0].r;assert.deepEqual(depois,original);assert.equal((await q("select count(*)::int n from public.fila_historico where acao='concluiu_pedido'"))[0].n,1);
  });
  await test('falha na auditoria desfaz toda a operação e permite repetir o mesmo dia',async()=>{
   await db.exec("INSERT INTO public.fila_usuarios VALUES('Cássio','TOKEN-C','2026-10-27T12:00:00Z'),('Rayla','TOKEN-R','2026-10-27T12:00:00Z');UPDATE public.falha_teste SET ativa=true");
   await assert.rejects(executar('2026-10-28T03:00:00Z'),/Falha simulada/);assert.equal((await q('select count(*)::int n from public.fila_usuarios'))[0].n,2);assert.equal((await q("select count(*)::int n from af_mobile.liberacao_nomes_diaria where dia='2026-10-28'"))[0].n,0);
   await db.exec('UPDATE public.falha_teste SET ativa=false');assert.equal((await executar('2026-10-28T03:00:00Z')).liberados,2);
  });
  await test('agendamento aponta para 03:00 GMT e reaplicar não duplica nem altera outros jobs',async()=>{
   await db.exec(localMigration);const jobs=await q('select * from cron.job order by jobid');assert.equal(jobs.length,3);const job=jobs.find(x=>x.jobname==='af-liberar-nomes-meia-noite');assert.equal(job.schedule,'0 3 * * *');assert.equal(job.command,'SELECT af_mobile.liberar_nomes_diario();');assert.equal(jobs[0].schedule,'*/5 * * * *');
  });
  await test('rotina privada não pode ser executada por clientes, inclusive service_role',async()=>{
   for(const role of ['anon','authenticated','service_role']){await db.exec('SET ROLE '+role);await assert.rejects(q("select af_mobile.liberar_nomes_diario('2026-10-29T03:00:00Z')"),/permission denied/);await assert.rejects(q('select * from af_mobile.liberacao_nomes_diaria'),/permission denied/);await db.exec('RESET ROLE');}
   const r=(await q("select prosecdef,exists(select 1 from aclexplode(proacl) a where a.grantee=0) publico from pg_proc where oid='af_mobile.liberar_nomes_diario(timestamptz)'::regprocedure"))[0];assert.equal(r.prosecdef,false);assert.equal(r.publico,false);
  });
  console.log(`${n} verificações de liberação diária passaram.`);
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
