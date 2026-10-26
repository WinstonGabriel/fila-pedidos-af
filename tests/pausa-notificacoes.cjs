const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const dir=path.join(__dirname,'../supabase/migrations');
const arquivo=process.env.PAUSA_SQL||path.join(dir,fs.readdirSync(dir).find(f=>f.endsWith('_pausa_20min_notificacao.sql'))||'MIGRACAO-AUSENTE');
const migration=fs.readFileSync(arquivo,'utf8');
(async()=>{
 const db=new PGlite();let passou=0;
 const q=async(s,p=[])=>(await db.query(s,p)).rows;
 const test=async(n,f)=>{await f();passou++;console.log('PASS',n);};
 const ui={chrome:{storage:{local:{get:async()=>({})},onChanged:{addListener(){}}}}};
 vm.createContext(ui);vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/baloes.js'),'utf8'),ui);
 const ultimo=async()=>(await q('select analista,tipo,ator,detalhe from public.fila_eventos order by id desc limit 1'))[0];
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
   CREATE TABLE public.fila_analistas(nome text PRIMARY KEY,atividade text,atividade_inicio text,atividade_fim text,descanso_ate timestamptz);
   CREATE TABLE public.fila_eventos(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,analista text,tipo text,ator text,detalhe jsonb);
   CREATE TABLE public.fila_atribuicoes(pedido_id text PRIMARY KEY,analista text,status text,atualizado_em timestamptz);
   CREATE TABLE public.fila_historico(ator text,coord boolean,acao text,analista text,pedido_id text,detalhe text);
   CREATE FUNCTION public.fila_log(a text,c boolean,ac text,n text,p text,d text)RETURNS void LANGUAGE sql AS $$INSERT INTO public.fila_historico VALUES(a,c,ac,n,p,d)$$;
   INSERT INTO public.fila_analistas VALUES('Analista fictício','on','','',NULL);`);
  await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/atividade-evento-6.11.1.sql'),'utf8'));
  await db.exec(`REVOKE ALL ON FUNCTION public.fila_atividade_evento() FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.fila_atividade_evento() TO service_role;
   CREATE TRIGGER fila_atividade_evento AFTER UPDATE ON public.fila_analistas FOR EACH ROW EXECUTE FUNCTION public.fila_atividade_evento();`);
  const permissoes=async()=>(await q("select proacl::text,prosecdef,proconfig from pg_proc where oid='public.fila_atividade_evento()'::regprocedure"))[0];
  const antes=await permissoes();await db.exec(migration);
  await test('implantação preserva permissões e não altera status nem cria avisos',async()=>{
   assert.deepEqual(await permissoes(),antes);assert.equal((await q('select atividade from public.fila_analistas'))[0].atividade,'on');assert.equal((await q('select count(*)::int n from public.fila_eventos'))[0].n,0);
  });
  await test('pausa real gera metadado e texto Pausa 20min no balão e na central',async()=>{
   await db.exec("UPDATE public.fila_analistas SET atividade='intervalo',atividade_inicio='10:00',atividade_fim='10:20',descanso_ate=clock_timestamp()+interval '20 minutes'");
   const e=await ultimo();assert.equal(e.detalhe.depois,'intervalo');assert.equal(e.detalhe.pausa_20min,true);assert.equal(ui.FilaBaloes.resumo(e).texto,'Status: Pausa 20min · 10:00–10:20');assert.ok(ui.FilaBaloes.mensagem(e).includes('Pausa 20min'));
  });
  await test('retorno ON e intervalo comum de 20 minutos mantêm os próprios nomes',async()=>{
   await db.exec("UPDATE public.fila_analistas SET atividade='on',atividade_inicio='',atividade_fim='',descanso_ate=NULL");
   assert.equal(ui.FilaBaloes.resumo(await ultimo()).texto,'Status: ON');
   await db.exec("UPDATE public.fila_analistas SET atividade='intervalo',atividade_inicio='10:00',atividade_fim='10:20'");
   const e=await ultimo();assert.equal(e.detalhe.pausa_20min,false);assert.equal(ui.FilaBaloes.resumo(e).texto,'Status: Intervalo · 10:00–10:20');
   assert.equal(ui.FilaBaloes.resumo({...e,detalhe:{...e.detalhe,pausa_20min:'false'}}).texto,'Status: Intervalo · 10:00–10:20');
   assert.equal(ui.FilaBaloes.resumo({...e,detalhe:{depois:'intervalo'}}).texto,'Status: Intervalo');
  });
  await test('prazo vencido não identifica pausa ativa e avisos de escala ficam preservados',async()=>{
   await db.exec("UPDATE public.fila_analistas SET atividade_inicio='11:00',atividade_fim='11:20',descanso_ate=clock_timestamp()-interval '1 second'");
   assert.equal((await ultimo()).detalhe.pausa_20min,false);
   assert.equal(ui.FilaBaloes.resumo({tipo:'escala',analista:'Analista fictício',detalhe:{pausa_20min:true,depois:{tipo:'feriado'}}}).texto,'Situação: Feriado');
  });
  await test('devolução de pedido ao ficar OFF e reaplicação permanecem funcionando',async()=>{
   await db.exec("INSERT INTO public.fila_atribuicoes VALUES('PEDIDO-FICTICIO','Analista fictício','em_andamento',now());UPDATE public.fila_analistas SET atividade='off',descanso_ate=NULL");
   assert.equal((await q('select status from public.fila_atribuicoes'))[0].status,'devolvido');assert.equal((await q('select acao from public.fila_historico'))[0].acao,'devolveu_pedido_a_fila');
   const n=(await q('select count(*)::int n from public.fila_eventos'))[0].n;await db.exec(migration);assert.equal((await q('select count(*)::int n from public.fila_eventos'))[0].n,n);assert.deepEqual(await permissoes(),antes);
  });
  console.log(`${passou} verificações de nomenclatura da pausa passaram.`);
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
