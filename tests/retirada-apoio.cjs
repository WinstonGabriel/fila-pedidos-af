const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const dir=path.join(__dirname,'../supabase/migrations');
const migration=fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(f=>f.endsWith('_retirada_automatica_apoio_af.sql'))),'utf8');
const id=n=>String(2026000000000000+n),href=n=>`https://af.mateusmais.com.br/pedido/${String(n).padStart(8,'0')}-0000-4000-8000-000000000001`;
(async()=>{
 const db=new PGlite();let passou=0;
 const q=async(s,p=[])=>(await db.query(s,p)).rows;
 const test=async(n,f)=>{await f();passou++;console.log('PASS',n);};
 const call=async(fn,args=[],codigo='TEST',token='TOKEN-G')=>(await q(`select public.${fn}($1,$2,NULL${args.map((_,i)=>',$'+(i+3)).join('')}) r`,[codigo,token,...args]))[0].r;
 const retirar=(ausentes,presentes=[],extra={})=>call('fila_apoio_sincronizar_saida',[
  JSON.stringify(ausentes),JSON.stringify(presentes),extra.contexto??'https://af.mateusmais.com.br/',extra.completa??true,
  extra.total??presentes.length,extra.menu??extra.total??presentes.length,extra.inicio??new Date().toISOString()]);
 const add=async(n,status='contato',apoio='contato')=>q("INSERT INTO public.fila_atribuicoes(pedido_id,analista,status,destino_apoio,href,valor,atualizado_em)VALUES($1,'Rayla',$2,$3,$4,'R$ 10,00',now()-interval '10 seconds')",[id(n),status,apoio,href(n)]);
 const registro=async n=>(await q('select * from public.fila_atribuicoes where pedido_id=$1',[id(n)]))[0];
 const estado=()=>call('fila_estado');
 const reset=()=>db.exec('TRUNCATE public.fila_atribuicoes,public.fila_historico,af_mobile.pedidos_capturados');
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA af_mobile;GRANT USAGE ON SCHEMA af_mobile TO anon,authenticated,service_role;
   CREATE TABLE public.fila_analistas(nome text PRIMARY KEY,ligado boolean,atualizado_em timestamptz DEFAULT now());
   CREATE TABLE public.fila_usuarios(nome text PRIMARY KEY,token text UNIQUE);
   CREATE TABLE public.fila_atribuicoes(pedido_id text PRIMARY KEY,analista text NOT NULL,status text CHECK(status IN ('contato','em_andamento','reservado','concluido','devolvido')),hora text DEFAULT '',valor text DEFAULT '',estab text DEFAULT '',href text DEFAULT '',categoria text DEFAULT '',destino_apoio text DEFAULT 'contato',criado_em timestamptz DEFAULT now(),atualizado_em timestamptz DEFAULT now());
   ALTER TABLE public.fila_atribuicoes ENABLE ROW LEVEL SECURITY;
   CREATE TABLE public.fila_historico(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,quando timestamptz DEFAULT now(),ator text,coord boolean,acao text,analista text,pedido_id text,detalhe text);
   CREATE TABLE public.fila_config(chave text,valor text);CREATE TABLE public.fila_eventos(id bigint);CREATE TABLE public.fila_preferencias_analista(analista text,lojas jsonb);CREATE TABLE public.fila_rotas_loja(loja text);CREATE TABLE public.rotas_teste(loja text PRIMARY KEY,analista text);
   CREATE TABLE public.fila_escala(analista text,data date,tipo text,presenca text,inicio text,fim text,observacao text);
   CREATE FUNCTION public.fila_destino_loja(p text)RETURNS text LANGUAGE sql AS $$SELECT analista FROM public.rotas_teste WHERE loja=p$$;
   CREATE FUNCTION public.fila_log(a text,c boolean,ac text,n text,p text,d text)RETURNS void LANGUAGE sql AS $$INSERT INTO public.fila_historico(ator,coord,acao,analista,pedido_id,detalhe)VALUES(a,c,ac,n,p,d)$$;
   CREATE FUNCTION public.fila_ator(p_codigo text,p_token text,p_coord text,p_exigir boolean DEFAULT true,OUT o_nome text,OUT o_coord boolean) RETURNS record LANGUAGE plpgsql AS $$BEGIN IF p_codigo IS DISTINCT FROM 'TEST' THEN RAISE EXCEPTION 'Equipe inválida';END IF;SELECT nome INTO o_nome FROM public.fila_usuarios WHERE token=p_token;o_coord:=false;IF p_exigir AND o_nome IS NULL THEN RAISE EXCEPTION 'Escolha seu nome';END IF;END$$;
   CREATE FUNCTION public.fila_autoriza(n text,c boolean,a text)RETURNS void LANGUAGE plpgsql AS $$BEGIN IF NOT c AND n IS DISTINCT FROM a THEN RAISE EXCEPTION 'Sem permissão';END IF;END$$;
   INSERT INTO public.fila_analistas(nome,ligado)VALUES('Gabriel',false),('Rayla',false),('Cássio',false);INSERT INTO public.fila_usuarios VALUES('Gabriel','TOKEN-G'),('Rayla','TOKEN-R');`);
  for(const f of ['tests/fixtures/conciliacao-6.8.3.sql','supabase/migrations/20261025183807_captura_e_conciliacao_af.sql','supabase/migrations/20261026025317_sincronizacao_economica.sql','tests/fixtures/triagem-puxar-6.11.0.sql']) await db.exec(fs.readFileSync(path.join(__dirname,'..',f),'utf8'));
  for(const f of fs.readdirSync(dir).filter(f=>f.includes('_triagem_online_')).sort())await db.exec(fs.readFileSync(path.join(dir,f),'utf8'));
  await add(1);await add(2,'contato','suporte');await add(3,'em_andamento');
  await q("UPDATE af_mobile.pedidos_capturados SET af_situacao='autorizado_manual',verificado_em=now() WHERE pedido_id=$1",[id(1)]);
  await db.exec(migration);
  await test('implantação retira apenas apoio já confirmado como autorizado; análise e apoio pendente ficam preservados',async()=>{
   assert.equal((await registro(1)).status,'concluido');assert.ok((await registro(1)).apoio_saida_af_em);
   assert.equal((await registro(2)).status,'contato');assert.equal((await registro(3)).status,'em_andamento');
  });
  await test('contato e suporte ausentes saem para todos os clientes, sem crédito humano nem redistribuição',async()=>{
   await reset();await add(10);await add(11,'contato','suporte');await add(12,'em_andamento');
   const r=await retirar([id(10),id(11),id(12)]);assert.equal(r.removidos,2);
   const d=await estado();assert.ok(d.atribuicoes.some(p=>p.pedido_id===id(12)));assert.ok(d.atribuicoes.every(p=>![id(10),id(11)].includes(p.pedido_id)));
   assert.ok(d.concluidos_ids.includes(id(10)));assert.ok(d.apoio_encerrados_ids.includes(id(11)));
   assert.equal((await q("select count(*)::int n from public.fila_historico where acao='concluiu_pedido'"))[0].n,0);
   assert.equal((await q("select count(*)::int n from af_mobile.pedidos_capturados where origem='analista'"))[0].n,0);
   await db.exec('UPDATE public.fila_analistas SET ligado=true');
   const n=(await q("select public.fila_auto_alocar('Sistema',false,$1::jsonb,null) n",[JSON.stringify([{id:id(10),href:href(10),cat:'Varejo'}])]))[0].n;assert.equal(n,0);
  });
  await test('repetição não duplica histórico nem apaga os metadados do pedido',async()=>{
   const before=(await q("select count(*)::int n from public.fila_historico where acao='retirou_apoio_saida_af'"))[0].n;
   assert.equal((await retirar([id(10),id(11)])).removidos,0);
   assert.equal((await q("select count(*)::int n from public.fila_historico where acao='retirou_apoio_saida_af'"))[0].n,before);
   assert.equal((await registro(11)).destino_apoio,'suporte');assert.equal((await registro(11)).href,href(11));
  });
  await test('limpeza de registros antigos preserva a trava de apoio e o histórico',async()=>{
   await q("update public.fila_atribuicoes set atualizado_em=now()-interval '3 days' where pedido_id=$1",[id(10)]);
   const definition=(await q("select pg_get_functiondef('public.fila_estado(text,text,text)'::regprocedure) sql"))[0].sql;
   // Executa deterministicamente a rotina de limpeza que em produção é amostrada.
   await db.exec(definition.replace('IF random()<0.03','IF true'));await estado();
   assert.ok(await registro(10));assert.ok((await registro(10)).apoio_saida_af_em);
   assert.ok((await q("select count(*)::int n from public.fila_historico where acao='retirou_apoio_saida_af'"))[0].n>0);
   await db.exec(definition);
  });
  await test('leitura parcial, filtros, contagem divergente e consulta antiga/futura não removem apoio',async()=>{
   await add(13);
   for(const extra of [{completa:false},{contexto:'https://af.mateusmais.com.br/?loja=1'},{total:1,menu:2},{inicio:new Date(Date.now()-300000).toISOString()},{inicio:new Date(Date.now()+60000).toISOString()}])await assert.rejects(retirar([id(13)],[],extra),/leitura completa/);
   assert.equal((await registro(13)).status,'contato');
  });
  await test('retenção nova durante a varredura é preservada até uma próxima leitura',async()=>{
   await add(14);await q('update public.fila_atribuicoes set atualizado_em=clock_timestamp() where pedido_id=$1',[id(14)]);
   assert.equal((await retirar([id(14)],[],{inicio:new Date(Date.now()-5000).toISOString()})).removidos,0);
   assert.equal((await registro(14)).status,'contato');
  });
  await test('retorno realmente visto no AF restaura a retenção anterior; snapshot antigo não a ressuscita',async()=>{
   assert.equal((await retirar([],[id(11)],{inicio:new Date(Date.now()-5000).toISOString()})).retornados,0);
   assert.equal((await retirar([],[id(11)],{inicio:new Date(Date.now()+1000).toISOString()})).retornados,1);
   assert.equal((await registro(11)).status,'contato');assert.equal((await registro(11)).destino_apoio,'suporte');assert.equal((await registro(11)).apoio_saida_af_em,null);
   await q("UPDATE af_mobile.pedidos_capturados SET af_situacao='autorizado_manual' WHERE pedido_id=$1",[id(10)]);
   assert.equal((await retirar([],[id(10)],{inicio:new Date(Date.now()+1000).toISOString()})).retornados,0);
  });
  await test('conciliação de autorização/cancelamento confirmado encerra apoio sem esperar outra varredura',async()=>{
   await reset();
   for(const [n,situacao,status]of [[20,'autorizado_manual','Pedido autorizado'],[21,'cancelado','Pedido cancelado'],[22,'automatico','Pedido autorizado']]){
    await add(n,'contato',n===21?'suporte':'contato');
    const token=(await q("UPDATE af_mobile.pedidos_capturados SET consulta_token=gen_random_uuid(),consulta_instalacao='TOKEN-G' WHERE pedido_id=$1 RETURNING consulta_token",[id(n)]))[0].consulta_token;
    await call('fila_pedidos_conciliar',[JSON.stringify([{id:id(n),href:href(n),consulta_token:token,situacao,status_decisao:status,status_atual:status,evento_em:new Date().toISOString(),nota_automatica:situacao==='automatico'?'Aprovação Automática com status de análise APPROVE':''}])]);
    assert.equal((await registro(n)).status,'concluido');assert.ok((await registro(n)).apoio_saida_af_em);
   }
  });
  await test('intervenção explícita de gestão que reabre um pedido limpa o marcador antigo',async()=>{
   await q("UPDATE public.fila_atribuicoes SET status='em_andamento' WHERE pedido_id=$1",[id(20)]);
   assert.equal((await registro(20)).apoio_saida_af_em,null);assert.equal((await registro(20)).status,'em_andamento');
  });
  await test('equipe, identidade, papéis e IDs inválidos não permitem encerramento',async()=>{
   await assert.rejects(call('fila_apoio_sincronizar_saida',['[]','[]','https://af.mateusmais.com.br/',true,0,0,new Date().toISOString()],'ERRADA'),/Equipe inválida/);
   await assert.rejects(call('fila_apoio_sincronizar_saida',['[]','[]','https://af.mateusmais.com.br/',true,0,0,new Date().toISOString()],'TEST','SEM-NOME'),/Escolha seu nome/);
   await assert.rejects(retirar(['invalido']),/IDs de apoio inválidos/);await assert.rejects(retirar([id(20)],[id(20)]),/IDs de apoio inválidos/);
   await db.exec('SET ROLE anon');await assert.rejects(q('select * from public.fila_atribuicoes'),/permission denied/);await db.exec('RESET ROLE');
  });
  await test('leitor só envia ausências de apoio após resultado fresco completo e contabilizado',async()=>{
   const {runtime}=require('./catalogo-integration.cjs'),r=runtime({});let calls=[];
   r.context.rpc=async(fn,args)=>{calls.push({fn,args});return {removidos:0};};
   vm.runInContext(`remote.atribuicoes=[{pedido_id:'${id(30)}',status:'contato',destino_apoio:'contato',analista:'Rayla'},{pedido_id:'${id(31)}',status:'contato',destino_apoio:'suporte',analista:'Rayla'},{pedido_id:'${id(32)}',status:'em_andamento',analista:'Rayla'}];descansoRelogio=0;`,r.context);
   const snapshot={ok:true,semFiltros:true,contexto:'https://af.mateusmais.com.br/',pedidos:[{id:id(30)}],totalMenu:1,paginas:1,paginaAtual:1};
   const send=async(s,full=false)=>{r.context.snapshot=s;return vm.runInContext('sincronizarSaidaApoio(snapshot,'+full+',Date.now())',r.context);};
   for(const bad of [{...snapshot,semFiltros:false},{...snapshot,totalMenu:2},{...snapshot,paginas:2},{...snapshot,ok:false},{...snapshot,contexto:'https://af.mateusmais.com.br/?busca=x'}])await send(bad);
   assert.equal(calls.length,0);await send(snapshot);assert.equal(calls.length,1);assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args.p_ausentes)),[id(31)]);
   assert.equal(calls[0].fn,'fila_apoio_sincronizar_saida');
   calls=[];await send({...snapshot,paginas:2},true);assert.equal(calls.length,1);
  });
  await test('pedidos arquivados não aparecem em contato, suporte ou lista de conclusão humana',async()=>{
   const {runtime}=require('./catalogo-integration.cjs'),r=runtime({});
   vm.runInContext(`usandoCache=false;leitura.parcial=false;remote.atribuicoes=[{pedido_id:'${id(40)}',analista:'Rayla',status:'contato',destino_apoio:'contato',apoio_saida_af_em:new Date().toISOString()},{pedido_id:'${id(41)}',analista:'Rayla',status:'concluido',apoio_saida_af_em:new Date().toISOString()}];renderPilha();`,r.context);
   assert.ok(!r.el('painel').innerHTML.includes(id(40)));assert.ok(!r.el('painel').innerHTML.includes(id(41)));
  });
  console.log(`${passou} verificações de retirada automática de apoio passaram.`);
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
