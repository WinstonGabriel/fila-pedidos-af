const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const dir=path.join(__dirname,'../supabase/migrations');
const arquivos=fs.readdirSync(dir).filter(f=>f.includes('_triagem_online_')).sort();
assert.ok(process.env.TRIAGEM_SQL||arquivos.length,'Migrações da triagem disponíveis');
const migration=process.env.TRIAGEM_SQL?fs.readFileSync(process.env.TRIAGEM_SQL,'utf8'):arquivos.map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('\n');
const id=n=>String(2026000000000000+n),href=n=>`https://af.mateusmais.com.br/pedido/${String(n).padStart(8,'0')}-0000-4000-8000-000000000001`;
const pedido=(n,extra={})=>({id:id(n),href:href(n),hora:'14:00',valor:'R$ 12,34',estab:'Loja teste',cat:'Varejo',...extra});
const nota='Aprovação Automática com status de análise APPROVE';
(async()=>{
 const db=new PGlite();let passou=0;
 const q=async(s,p=[])=>(await db.query(s,p)).rows;
 const call=async(fn,args=[],token='TOKEN-G',coord=null)=>(await q(`select public.${fn}($1,$2,$3${args.map((_,i)=>',$'+(i+4)).join('')}) r`,['TEST',token,coord,...args]))[0].r;
 const test=async(n,f)=>{await f();passou++;console.log('PASS',n);};
 const reset=async()=>db.exec("TRUNCATE public.fila_atribuicoes,public.fila_historico,af_mobile.pedidos_capturados,public.rotas_teste;UPDATE public.fila_analistas SET ligado=true;");
 const observar=ps=>call('fila_pedidos_observar',[JSON.stringify(ps)]);
 const alocar=ps=>q("select public.fila_auto_alocar('Sistema',false,$1::jsonb,null) n",[JSON.stringify(ps)]).then(r=>r[0].n);
 const pronto=async n=>q("update af_mobile.pedidos_capturados set triagem_ate=now()-interval '1 second',proxima_consulta=now()-interval '1 second' where pedido_id=$1",[id(n)]);
 const verificar=async(n,situacao,extra={})=>{
  await q("update af_mobile.pedidos_capturados set proxima_consulta=now()+interval '1 day' where pedido_id<>$1",[id(n)]);
  await q("update af_mobile.pedidos_capturados set proxima_consulta=now()-interval '1 second' where pedido_id=$1",[id(n)]);
  const p=(await call('fila_pedidos_pendentes')).find(p=>p.id===id(n));assert.ok(p,'Comprovante disponível');
  return call('fila_pedidos_conciliar',[JSON.stringify([{...p,situacao,...extra}])]);
 };
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA af_mobile;GRANT USAGE ON SCHEMA af_mobile TO anon,authenticated,service_role;
   CREATE TABLE public.fila_analistas(nome text PRIMARY KEY,ligado boolean,atualizado_em timestamptz DEFAULT now());
   CREATE TABLE public.fila_usuarios(nome text PRIMARY KEY,token text UNIQUE);
   CREATE TABLE public.fila_atribuicoes(pedido_id text PRIMARY KEY,analista text NOT NULL,status text,hora text DEFAULT '',valor text DEFAULT '',estab text DEFAULT '',href text DEFAULT '',categoria text DEFAULT '',destino_apoio text DEFAULT 'contato',criado_em timestamptz DEFAULT now(),atualizado_em timestamptz DEFAULT now());
   CREATE TABLE public.fila_historico(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,quando timestamptz DEFAULT now(),ator text,coord boolean,acao text,analista text,pedido_id text,detalhe text);
   CREATE TABLE public.fila_config(chave text,valor text);CREATE TABLE public.fila_eventos(id bigint);CREATE TABLE public.fila_preferencias_analista(analista text,lojas jsonb);CREATE TABLE public.fila_rotas_loja(loja text);CREATE TABLE public.rotas_teste(loja text PRIMARY KEY,analista text);
   CREATE TABLE public.fila_escala(analista text,data date,tipo text,presenca text,inicio text,fim text,observacao text);
   CREATE FUNCTION public.fila_destino_loja(p text)RETURNS text LANGUAGE sql AS $$SELECT analista FROM public.rotas_teste WHERE loja=p$$;
   CREATE FUNCTION public.fila_log(a text,c boolean,ac text,n text,p text,d text)RETURNS void LANGUAGE sql AS $$INSERT INTO public.fila_historico(ator,coord,acao,analista,pedido_id,detalhe)VALUES(a,c,ac,n,p,d)$$;
   CREATE FUNCTION public.fila_ator(p_codigo text,p_token text,p_coord text,p_exigir boolean DEFAULT true,OUT o_nome text,OUT o_coord boolean) RETURNS record LANGUAGE plpgsql AS $$BEGIN IF p_codigo IS DISTINCT FROM 'TEST' THEN RAISE EXCEPTION 'Equipe inválida';END IF;SELECT nome INTO o_nome FROM public.fila_usuarios WHERE token=p_token;o_coord:=coalesce(p_coord='GESTAO',false);IF p_exigir AND o_nome IS NULL AND NOT o_coord THEN RAISE EXCEPTION 'Escolha seu nome';END IF;END$$;
   CREATE FUNCTION public.fila_autoriza(n text,c boolean,a text)RETURNS void LANGUAGE plpgsql AS $$BEGIN IF NOT c AND n IS DISTINCT FROM a THEN RAISE EXCEPTION 'Sem permissão';END IF;END$$;
   INSERT INTO public.fila_analistas(nome,ligado)VALUES('Gabriel',true),('Rayla',true),('Cássio',true);INSERT INTO public.fila_usuarios VALUES('Gabriel','TOKEN-G'),('Rayla','TOKEN-R'),('Cássio','TOKEN-C');`);
  for(const f of ['fixtures/conciliacao-6.8.3.sql','../supabase/migrations/20261025183807_captura_e_conciliacao_af.sql','../supabase/migrations/20261026025317_sincronizacao_economica.sql','fixtures/triagem-puxar-6.11.0.sql'])await db.exec(fs.readFileSync(path.join(__dirname,f),'utf8'));
  await db.exec(migration);
  await test('espera dez segundos, persiste observação antes do coletor e não reinicia o prazo',async()=>{
   await reset();assert.equal(await alocar([pedido(1)]),0);const a=(await q('select triagem_ate,primeiro_visto from af_mobile.pedidos_capturados'))[0];
   assert.ok(new Date(a.triagem_ate)-new Date(a.primeiro_visto)>=9900);await alocar([pedido(1)]);assert.equal(new Date((await q('select triagem_ate from af_mobile.pedidos_capturados'))[0].triagem_ate).getTime(),new Date(a.triagem_ate).getTime());
   assert.equal((await call('fila_pedidos_pendentes')).length,0);
  });
  await test('aprovação automática confirmada na triagem não passa por analista e conta uma vez',async()=>{
   await reset();await observar([pedido(2)]);await pronto(2);
   const r=await verificar(2,'automatico',{status_decisao:'Pedido autorizado',nota_automatica:nota,evento_em:new Date().toISOString()});assert.equal(r.automaticos,1);
   assert.equal(await alocar([pedido(2)]),0);assert.equal((await q('select count(*)::int n from public.fila_atribuicoes'))[0].n,0);
   const p=(await q('select origem,analista from af_mobile.pedidos_capturados'))[0];assert.equal(p.origem,'automatico');assert.equal(p.analista,null);
   assert.equal((await q("select count(*)::int n from public.fila_historico where acao='pedido_aprovado_automatico'"))[0].n,1);
  });
  await test('autorização sem prova de origem fica fora da fila e sem crédito humano ou automático',async()=>{
   await reset();await observar([pedido(3)]);await pronto(3);
   await verificar(3,'autorizado_manual',{status_decisao:'Pedido autorizado',evento_em:new Date().toISOString()});
   assert.equal(await alocar([pedido(3)]),0);assert.equal(await call('fila_puxar',['Gabriel',JSON.stringify([pedido(3)])]),null);
   assert.equal((await q('select origem from af_mobile.pedidos_capturados'))[0].origem,null);
   const dia=new Date().toISOString().slice(0,10),r=await call('fila_gestao_relatorio',[dia,dia,null],'TOKEN-G','GESTAO');assert.equal(r.producao.totais.quantidade,0);assert.equal(r.producao.aprovados_origem_pendente.quantidade,1);
   assert.ok((await call('fila_historico_pagina',[100,null,null,null,null])).itens.some(h=>h.acao.includes('origem a confirmar')));
   await verificar(3,'indisponivel');assert.equal((await q('select af_situacao from af_mobile.pedidos_capturados'))[0].af_situacao,'autorizado_manual');assert.equal(await alocar([pedido(3)]),0);
  });
  await test('pendência confirmada só é distribuída após a janela e continua com capacidade e identidade únicas',async()=>{
   await reset();await observar([pedido(4)]);await pronto(4);await db.exec("update public.fila_analistas set ligado=false where nome<>'Gabriel'");
   const r=await verificar(4,'pendente',{status_decisao:'Pedido em análise',status_atual:'Pedido em análise'});assert.equal(r.distribuidos,1);assert.equal(await alocar([pedido(4)]),0);
   assert.equal((await q('select analista from public.fila_atribuicoes'))[0].analista,'Gabriel');
  });
  await test('cliente sem histórico usa presença atual após consulta; consulta anterior à janela ou vencida não basta',async()=>{
   await reset();await observar([pedido(5)]);await pronto(5);await verificar(5,'indisponivel');assert.equal((await q('select count(*)::int n from public.fila_atribuicoes'))[0].n,0);
   assert.equal(await alocar([pedido(5)]),1);await reset();await observar([pedido(6)]);await pronto(6);
   await q("update af_mobile.pedidos_capturados set verificado_em=triagem_ate-interval '1 second'");assert.equal(await alocar([pedido(6)]),0);
   await q("update af_mobile.pedidos_capturados set verificado_em=now()-interval '31 seconds',triagem_ate=now()-interval '1 minute'");assert.equal(await alocar([pedido(6)]),0);
  });
  await test('Força de Vendas, direcionamento e OFF continuam validados após triagem',async()=>{
   await reset();const p=pedido(7,{cat:'Força de Vendas',estab:'Loja exclusiva'});await observar([p]);await pronto(7);await verificar(7,'indisponivel');
   await db.exec("insert into public.rotas_teste values('Loja exclusiva','Cássio');update public.fila_analistas set ligado=false where nome='Cássio'");assert.equal(await alocar([p]),0);
   await db.exec("update public.fila_analistas set ligado=true where nome='Cássio'");assert.equal(await alocar([p]),1);assert.equal((await q('select analista from public.fila_atribuicoes'))[0].analista,'Cássio');
  });
  await test('pedidos de mesmo horário continuam distintos e consulta prioriza novos sem repetir comprovante',async()=>{
   await reset();await observar([pedido(8),pedido(9)]);await pronto(8);await pronto(9);
   const [a,b]=await Promise.all([call('fila_pedidos_pendentes'),call('fila_pedidos_pendentes',[],'TOKEN-R')]);assert.equal(new Set([...a,...b].map(p=>p.id)).size,a.length+b.length);assert.equal(a.length+b.length,2);
   await q("update af_mobile.pedidos_capturados set verificado_em=now(),af_situacao='indisponivel'");assert.equal(await alocar([pedido(8),pedido(9)]),2);
  });
  await test('novos candidatos têm prioridade sobre pendências antigas e autorização sem origem tem três consultas',async()=>{
   await reset();await observar([pedido(20)]);await pronto(20);await q("update af_mobile.pedidos_capturados set primeiro_visto=now()-interval '2 days',proxima_consulta=now()-interval '1 day'");
   await observar([pedido(21),pedido(22)]);await pronto(21);await pronto(22);const p=await call('fila_pedidos_pendentes');assert.deepEqual(p.map(x=>x.id).sort(),[id(21),id(22)]);
   await reset();await observar([pedido(23)]);await pronto(23);for(let i=0;i<3;i++)await verificar(23,'autorizado_manual',{status_decisao:'Pedido autorizado'});
   await q("update af_mobile.pedidos_capturados set proxima_consulta=now()-interval '1 second'");assert.equal((await call('fila_pedidos_pendentes')).length,0);assert.equal(await alocar([pedido(23)]),0);
  });
  await test('autorização posterior libera card sem registrar produção humana e clique atrasado não conclui próximo',async()=>{
   await reset();await observar([pedido(10)]);await pronto(10);await verificar(10,'indisponivel');await alocar([pedido(10)]);
   await verificar(10,'autorizado_manual',{status_decisao:'Pedido autorizado',evento_em:new Date().toISOString()});
   assert.equal((await q('select status from public.fila_atribuicoes'))[0].status,'concluido');assert.equal((await q('select origem from af_mobile.pedidos_capturados'))[0].origem,null);
   await call('fila_avancar',['Gabriel',id(10),'concluir','[]']);assert.equal((await q("select count(*)::int n from public.fila_historico where acao='concluiu_pedido'"))[0].n,0);
   const r=await call('fila_estado');assert.equal(r.atribuicoes.length,0);assert.ok(r.concluidos_ids.includes(id(10)));
  });
  await test('nota automática posterior reclassifica declaração humana sem apagar auditoria',async()=>{
   await reset();await observar([pedido(11)]);await pronto(11);await verificar(11,'indisponivel');await alocar([pedido(11)]);
   const n=(await q('select analista from public.fila_atribuicoes'))[0].analista,token={'Gabriel':'TOKEN-G','Rayla':'TOKEN-R','Cássio':'TOKEN-C'}[n];await call('fila_avancar',[n,id(11),'concluir','[]'],token);
   await verificar(11,'autorizado_manual',{status_decisao:'Pedido autorizado',evento_em:new Date().toISOString()});await verificar(11,'automatico',{status_decisao:'Pedido autorizado',nota_automatica:nota,evento_em:new Date().toISOString()});
   assert.equal((await q('select origem from af_mobile.pedidos_capturados'))[0].origem,'automatico');assert.equal((await q("select count(*)::int n from public.fila_historico where acao='concluiu_pedido'"))[0].n,1);assert.equal((await call('fila_historico_pagina',[100,null,null,null,null])).ranking.geral.length,0);
  });
  await test('cancelados e aprovados não são promovidos de reserva ou devolução por clientes antigos',async()=>{
   await reset();await observar([pedido(12)]);await pronto(12);await verificar(12,'autorizado_manual',{status_decisao:'Pedido autorizado'});
   await q("insert into public.fila_atribuicoes(pedido_id,analista,status,href) values($1,'Gabriel','reservado',$2)",[id(12),href(12)]);
   assert.equal(await alocar([]),0);assert.equal(await call('fila_puxar',['Gabriel','[]']),null);
   await db.exec("update public.fila_atribuicoes set status='devolvido';update af_mobile.pedidos_capturados set af_situacao='cancelado'");assert.equal(await alocar([]),0);
  });
  await test('autenticação, comprovante, nota obrigatória, RLS e helper privado permanecem protegidos',async()=>{
   await reset();await observar([pedido(13)]);await pronto(13);const [p]=await call('fila_pedidos_pendentes');
   await assert.rejects(call('fila_pedidos_conciliar',[JSON.stringify([{...p,situacao:'automatico',status_decisao:'Pedido autorizado',evento_em:new Date().toISOString()}])]),/sem evidência/);
   assert.equal((await call('fila_pedidos_conciliar',[JSON.stringify([{...p,situacao:'indisponivel'}])],'TOKEN-R')).distribuidos,0);
   await assert.rejects(call('fila_pedidos_pendentes',[],'DESCONHECIDO'),/Escolha seu nome/);
   await db.exec('SET ROLE anon');await assert.rejects(q('select af_mobile.triar_candidatos($1::jsonb)',['[]']),/permission denied/);await assert.rejects(q('select * from af_mobile.pedidos_capturados'),/permission denied/);await db.exec('RESET ROLE');
   assert.equal((await q("select prosecdef from pg_proc where oid='af_mobile.triar_candidatos(jsonb)'::regprocedure"))[0].prosecdef,false);
  });
  console.log(`${passou} verificações de triagem online passaram.`);
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
