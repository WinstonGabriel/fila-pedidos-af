const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),{PGlite}=require('@electric-sql/pglite');
const AF=require('../extension/af-evidencias.js');
const base='https://af.mateusmais.com.br',uuid=n=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000001`,href=n=>`${base}/pedido/${uuid(n)}`;
const id=n=>String(2026000000000000+n),tick=()=>new Promise(setImmediate);
const money='R$ 1.234,56',nota='Aprovação Automática com status de análise APPROVE';
const evento=(status,nota='--',data='25/10/2026 - 15:10')=>`<tr><td><p><strong>Data/Hora:</strong> ${data}</p><strong>${status}</strong></td><td><p>${nota}</p></td><td>operador@exemplo.invalid</td></tr>`;
const historico=rows=>`<table id="table-extended-transactions"><thead><tr><th>Status do Pedido</th><th>Nota</th><th>Criado por</th></tr></thead><tbody>${rows}</tbody></table>`;
const detail=(n,rows,extra='')=>new JSDOM(`<p id="order_number"><strong>Número do pedido:</strong><span>#${id(n)}</span></p><p id="delivery_status"><span>Pedido em análise</span></p>${extra}${historico(rows)}`,{url:href(n)});
const row=n=>`<tr><td><a href="/pedido/${uuid(n)}">${id(n)}</a></td><td>Pedido em análise</td><td>${money}</td><td>25/10/2026 14:00</td><td>Varejo</td><td>Loja teste</td><td>Entrega</td><td>email omitido</td><td>approve</td></tr>`;
const list=rows=>`<table id="table-extended-transactions"><thead><tr>${['Pedido','Status','Valor total','Data','Categoria','Estabelecimento','Modalidade','Email','Recomendação'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
let passou=0;
async function test(n,fn){await fn();passou++;console.log('PASS',n);}
(async()=>{
 await test('confirma apenas a nota da decisão do próprio pedido, ignorando compra de outro cliente e recomendação',()=>{
  for(const rows of [evento('Pedido em análise'),evento('Pedido autorizado','Recomendação: approve'),evento('Pedido autorizado','--')]){
   const d=detail(1,rows,`<strong id="recommendation">approve</strong><table><tr><td>${nota}</td></tr></table>`);
   assert.notEqual(AF.detalhe(d.window.document,href(1),id(1)).situacao,'automatico');d.window.close();
  }
  const d=detail(1,evento('Pedido autorizado',nota));const r=AF.detalhe(d.window.document,href(1),id(1));
  assert.equal(r.situacao,'automatico');assert.equal(r.evento_em,'2026-10-25T15:10:00-03:00');assert.ok(!JSON.stringify(r).includes('operador@'));d.window.close();
 });
 await test('pedido reaberto, sessão expirada, outro ID e cancelamento não viram aprovação automática',()=>{
  const d=detail(2,evento('Pedido autorizado',nota)+evento('Pedido em análise'));
  assert.equal(AF.detalhe(d.window.document,href(2),id(2)).situacao,'pendente');
  assert.throws(()=>AF.detalhe(d.window.document,href(2),id(3)),/não conferem/);d.window.close();
  const cancel=detail(3,evento('Cancelado via painel AF'));assert.equal(AF.detalhe(cancel.window.document,href(3),id(3)).situacao,'cancelado');cancel.window.close();
  const login=new JSDOM('<input type="password">');assert.throws(()=>AF.detalhe(login.window.document,href(1),id(1)),/sessão/);login.window.close();
 });
 await test('lista usa ID, cabeçalhos e moeda exata; horários iguais não são deduplicados',()=>{
  const d=new JSDOM(list(row(1)+row(2)));const xs=AF.lista(d.window.document,base+'/');assert.equal(xs.length,2);assert.equal(xs[0].hora,xs[1].hora);assert.equal(xs[0].valor_centavos,123456);d.window.close();
  assert.equal(AF.centavos(''),null);assert.equal(AF.centavos('R$ 0,00'),0);assert.equal(AF.centavos('1,234.56'),null);
  assert.equal(AF.link(base+'/pedido/'+uuid(1)+'?senha=secret',base),'');assert.equal(AF.link('https://outro.invalid/pedido/'+uuid(1),base),'');
 });
 await test('MutationObserver captura linha inserida e removida antes do próximo ciclo de 5 segundos',async()=>{
  const d=new JSDOM(list(''),{url:base+'/',runScripts:'outside-only'}),w=d.window,mensagens=[];
  w.chrome={runtime:{id:'test',sendMessage:async m=>{mensagens.push(m);return {ok:true};},onMessage:{addListener(){}}}};
  w.eval(fs.readFileSync(path.join(__dirname,'../extension/af-evidencias.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(__dirname,'../extension/af-captura.js'),'utf8'));await tick();
  const body=w.document.querySelector('tbody');body.insertAdjacentHTML('beforeend',row(6));body.firstElementChild.remove();await tick();await tick();
  assert.ok(mensagens.some(m=>m.pedidos.some(p=>p.id===id(6))));w.dispatchEvent(new w.Event('pagehide'));d.window.close();
 });
 await test('relatório diferencia valor desconhecido e conhecido; exporta totais e analistas sem HTML injetado',()=>{
  const c=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/relatorio-producao.js'),'utf8'),c);
  const p={totais:{quantidade:2,valor_centavos:123456,sem_valor:1},automaticos:{quantidade:1,valor_centavos:123456},manuais:{quantidade:1,sem_valor:1},analistas:[{nome:'<script>nome</script>',quantidade:1,sem_valor:1}],cobertura:'captura',sem_conclusao:3};
  assert.match(c.FilaRelatorioProducao.html(p),/Não informado/);assert.match(c.FilaRelatorioProducao.html(p),/1 sem valor/);assert.ok(!c.FilaRelatorioProducao.html(p).includes('<script>nome'));
  assert.ok(c.FilaRelatorioProducao.csv(p).some(r=>r[0]==='Pedido aprovado automático'&&r[1]===1));
 });
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA af_mobile;GRANT USAGE ON SCHEMA af_mobile TO anon,authenticated,service_role;
   CREATE TABLE public.fila_analistas(nome text PRIMARY KEY,ligado boolean DEFAULT false,atualizado_em timestamptz DEFAULT now());
   CREATE TABLE public.fila_usuarios(nome text PRIMARY KEY,token text UNIQUE);
   CREATE TABLE public.fila_atribuicoes(pedido_id text PRIMARY KEY,analista text NOT NULL,status text,hora text DEFAULT '',valor text DEFAULT '',estab text DEFAULT '',href text DEFAULT '',categoria text DEFAULT '',destino_apoio text DEFAULT '',criado_em timestamptz DEFAULT now(),atualizado_em timestamptz DEFAULT now());
   CREATE TABLE public.fila_historico(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,quando timestamptz DEFAULT now(),ator text,coord boolean,acao text,analista text,pedido_id text,detalhe text);
   CREATE TABLE public.fila_preferencias_analista(analista text PRIMARY KEY,lojas jsonb);CREATE TABLE public.rotas_teste(loja text PRIMARY KEY,analista text);
   CREATE TABLE public.fila_config(chave text,valor text);CREATE TABLE public.fila_eventos(id bigint);CREATE TABLE public.fila_rotas_loja(loja text);
   CREATE TABLE public.fila_escala(analista text,data date,tipo text,presenca text,inicio text,fim text,observacao text);
   CREATE FUNCTION public.fila_destino_loja(p_loja text)RETURNS text LANGUAGE sql AS $$SELECT analista FROM public.rotas_teste WHERE loja=p_loja$$;
   CREATE FUNCTION public.fila_log(p_ator text,p_coord boolean,p_acao text,p_analista text,p_pedido text,p_detalhe text)RETURNS void LANGUAGE sql AS $$INSERT INTO public.fila_historico(ator,coord,acao,analista,pedido_id,detalhe)VALUES(p_ator,p_coord,p_acao,p_analista,p_pedido,p_detalhe)$$;
   CREATE FUNCTION public.fila_ator(p_codigo text,p_token text,p_coord text,p_exigir boolean DEFAULT true,OUT o_nome text,OUT o_coord boolean)RETURNS record LANGUAGE plpgsql AS $$BEGIN IF p_codigo IS DISTINCT FROM 'TEST' THEN RAISE EXCEPTION 'Equipe inválida';END IF;SELECT nome INTO o_nome FROM public.fila_usuarios WHERE token=p_token;o_coord:=coalesce(p_coord='GESTAO',false);IF p_exigir AND o_nome IS NULL AND NOT o_coord THEN RAISE EXCEPTION 'Escolha seu nome';END IF;END$$;
   CREATE FUNCTION public.fila_autoriza(p_nome text,p_coord boolean,p_alvo text)RETURNS void LANGUAGE plpgsql AS $$BEGIN IF NOT p_coord AND p_nome IS DISTINCT FROM p_alvo THEN RAISE EXCEPTION 'Sem permissão';END IF;END$$;
   INSERT INTO public.fila_analistas(nome,ligado)VALUES('Gabriel',false),('Rayla',true),('Cássio',false);INSERT INTO public.fila_usuarios VALUES('Gabriel','TOKEN-G'),('Rayla','TOKEN-R'),('Cássio','TOKEN-C');
   INSERT INTO public.fila_historico(ator,coord,acao,analista,pedido_id,detalhe)VALUES('Rayla',false,'concluiu_pedido','Rayla','${id(99)}','');`);
  await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/conciliacao-6.8.3.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261025183807_captura_e_conciliacao_af.sql'),'utf8'));
  const sql=async(q,p=[])=>(await db.query(q,p)).rows;
  const call=async(fn,args=[],token='TOKEN-G',coord=null)=>(await sql(`select public.${fn}($1,$2,$3${args.map((_,i)=>',$'+(i+4)).join('')}) as r`,['TEST',token,coord,...args])).at(0).r;
  const observar=ns=>call('fila_pedidos_observar',[JSON.stringify(ns.map(n=>({id:id(n),href:href(n),data:'2026-10-25',hora:'14:00',valor:money,estab:'Loja teste',cat:'Varejo'})))]);
  const claim=async n=>{await db.exec(`UPDATE af_mobile.pedidos_capturados SET proxima_consulta=now()+interval '1 day';UPDATE af_mobile.pedidos_capturados SET proxima_consulta=now()-interval '1 second' WHERE pedido_id='${id(n)}';`);return (await call('fila_pedidos_pendentes')).at(0);};
  const confirmar=async(p,extras={})=>call('fila_pedidos_conciliar',[JSON.stringify([{...p,situacao:'automatico',status_decisao:'Pedido autorizado',nota_automatica:nota,evento_em:new Date().toISOString(),...extras}])]);
  await test('migração preserva histórico anterior como declaração e não inventa valor zero',async()=>{
   const r=(await sql('select origem,legado,valor_centavos from af_mobile.pedidos_capturados where pedido_id=$1',[id(99)]))[0];assert.equal(r.origem,'analista');assert.equal(r.legado,true);assert.equal(r.valor_centavos,null);
  });
  await test('persistência registra pedidos simultâneos sem nenhum analista livre',async()=>{
   await db.exec('UPDATE public.fila_analistas SET ligado=false');await observar([1,2,3]);assert.equal((await sql("select count(*)::int n from af_mobile.pedidos_capturados where origem is null"))[0].n,3);
   await observar([1,2,3]);assert.equal((await sql('select count(*)::int n from af_mobile.pedidos_capturados'))[0].n,4);
  });
  await test('instalações não recebem o mesmo lote em paralelo e resultado de outro token é ignorado',async()=>{
   await db.exec("update af_mobile.pedidos_capturados set proxima_consulta=now()-interval '1 second'");
   const [a,b]=await Promise.all([call('fila_pedidos_pendentes'),call('fila_pedidos_pendentes',[],'TOKEN-R')]);assert.equal(new Set([...a,...b].map(x=>x.id)).size,a.length+b.length);
   const fake=await call('fila_pedidos_conciliar',[JSON.stringify([{...a[0],situacao:'automatico',status_decisao:'Pedido autorizado',nota_automatica:nota,evento_em:new Date().toISOString()}])],'TOKEN-R');assert.equal(fake.automaticos,0);
  });
  await test('desaparecimento, falha de sessão e recomendação não encerram nem creditam pedido',async()=>{
   await db.exec(`INSERT INTO public.fila_atribuicoes(pedido_id,analista,status,href,valor)VALUES('${id(1)}','Rayla','em_andamento','${href(1)}','${money}')`);
   const p=await claim(1);await confirmar(p,{situacao:'indisponivel'});
   assert.equal((await sql('select status from public.fila_atribuicoes where pedido_id=$1',[id(1)]))[0].status,'em_andamento');
   const p2=await claim(1);await assert.rejects(confirmar(p2,{nota_automatica:'Recomendação approve'}),/sem evidência/);
   assert.equal((await sql('select origem from af_mobile.pedidos_capturados where pedido_id=$1',[id(1)]))[0].origem,null);
  });
  await test('automático anteriormente atribuído libera o analista uma vez e preserva o vínculo na auditoria',async()=>{
   const p=await claim(1);assert.equal((await confirmar(p)).automaticos,1);assert.equal((await confirmar(p)).automaticos,0);
   const r=(await sql('select origem,analista from af_mobile.pedidos_capturados where pedido_id=$1',[id(1)]))[0];assert.equal(r.origem,'automatico');assert.equal(r.analista,null);
   assert.equal((await sql('select status from public.fila_atribuicoes where pedido_id=$1',[id(1)]))[0].status,'concluido');
   const h=await sql("select detalhe from public.fila_historico where acao='pedido_aprovado_automatico' and pedido_id=$1",[id(1)]);assert.equal(h.length,1);assert.match(h[0].detalhe,/Rayla.*sem crédito/);
   await db.exec('UPDATE public.fila_analistas SET ligado=true');
   assert.equal((await sql("select public.fila_auto_alocar('Gabriel',false,$1::jsonb,null) as n",[JSON.stringify([{id:id(1),cat:'Varejo',estab:'Loja teste'}])]))[0].n,0);
  });
  await test('automático sem atribuição entra no histórico e relatório; não precisa criar analista fictício',async()=>{
   const p=await claim(2);await confirmar(p);assert.equal((await sql('select count(*)::int n from public.fila_atribuicoes where pedido_id=$1',[id(2)]))[0].n,0);
  });
  await test('conclusão humana seguida de evidência automática corrige relatório, histórico exibido e pódio',async()=>{
   await db.exec(`INSERT INTO public.fila_atribuicoes(pedido_id,analista,status,href,valor)VALUES('${id(3)}','Rayla','em_andamento','${href(3)}','${money}')`);
   await call('fila_avancar',['Rayla',id(3),'concluir','[]'],'TOKEN-R');
   assert.equal((await sql('select origem from af_mobile.pedidos_capturados where pedido_id=$1',[id(3)]))[0].origem,'analista');
   const p=await claim(3);await confirmar(p);
   assert.equal((await sql("select acao from af_mobile.historico_exibicao where pedido_id=$1 and acao='conclusao_reclassificada'",[id(3)])).length,1);
   const h=await call('fila_historico_pagina',[100,null,null,null,null]);assert.equal(h.ranking.geral.find(x=>x.nome==='Rayla').quantidade,1);
   const antes=(await sql("select count(*)::int n from public.fila_historico where acao='concluiu_pedido'"))[0].n;
   assert.equal((await call('fila_avancar',['Rayla',id(3),'concluir','[]'],'TOKEN-R')).ja_processado,true);
   assert.equal((await sql("select count(*)::int n from public.fila_historico where acao='concluiu_pedido'"))[0].n,antes);
  });
  await test('relatório soma IDs únicos, valores em centavos e automáticos fora da produção humana',async()=>{
   const dia=(await sql("select (now() AT TIME ZONE 'America/Fortaleza')::date::text d"))[0].d;
   const r=await call('fila_gestao_relatorio',[dia,dia,null],'TOKEN-G','GESTAO');
   assert.equal(r.producao.automaticos.quantidade,3);assert.equal(r.producao.automaticos.valor_centavos,3*123456);
   assert.equal(r.producao.manuais.quantidade,1);assert.equal(r.producao.manuais.sem_valor,1);assert.equal(r.producao.totais.quantidade,4);
   assert.equal(r.resumo.find(x=>x.nome==='Rayla').concluidos,1);assert.equal(r.producao.analistas.find(x=>x.nome==='Rayla').quantidade,1);
   const estado=await call('fila_estado');assert.equal(estado.automaticos.length,3);
   const filtro=await call('fila_gestao_relatorio',[dia,dia,'Gabriel'],'TOKEN-G','GESTAO');assert.equal(filtro.producao.analistas.length,1);assert.equal(filtro.producao.automaticos.quantidade,3);
  });
  await test('RLS e autenticação: acesso direto negado, novos RPCs sem PUBLIC e equipe/nome exigidos',async()=>{
   await db.exec('SET ROLE anon');await assert.rejects(sql('select * from af_mobile.pedidos_capturados'),/permission denied/);await db.exec('RESET ROLE');
   await assert.rejects(call('fila_pedidos_observar',['[]'],'DESCONHECIDO'),/Escolha seu nome/);
   await assert.rejects(sql("select public.fila_pedidos_pendentes('ERRADA','TOKEN-G',null)"),/Equipe inválida/);
   const r=(await sql("select count(*)::int n from pg_proc p cross join lateral aclexplode(p.proacl) a where p.proname in ('pedidos_observar','pedidos_pendentes','pedidos_conciliar','fila_pedidos_observar','fila_pedidos_pendentes','fila_pedidos_conciliar') and a.grantee=0"))[0];assert.equal(r.n,0);
   await assert.rejects(call('fila_gestao_relatorio',['2026-01-01','2026-01-02',null]),/Somente a gestão/);
  });
  await test('pedido perdido pela leitura periódica só é recuperado após confirmar análise e mantém elegibilidade',async()=>{
   await observar([6]);await db.exec("UPDATE public.fila_analistas SET ligado=false;UPDATE public.fila_analistas SET ligado=true WHERE nome='Rayla'");
   const p=await claim(6);await assert.rejects(confirmar(p,{situacao:'pendente',status_decisao:'',status_atual:''}),/sem confirmação/);
   const r=await confirmar(p,{situacao:'pendente',status_decisao:'Pedido em análise',status_atual:'Pedido em análise'});
   assert.equal(r.distribuidos,1);assert.equal((await sql('select analista from public.fila_atribuicoes where pedido_id=$1',[id(6)]))[0].analista,'Rayla');
   await observar([7]);await db.exec(`UPDATE af_mobile.pedidos_capturados SET categoria='Força de Vendas' WHERE pedido_id='${id(7)}'`);
   const fv=await claim(7);assert.equal((await confirmar(fv,{situacao:'pendente',status_decisao:'Pedido em análise',status_atual:'Pedido em análise'})).distribuidos,0);
   await db.exec("UPDATE public.fila_analistas SET ligado=true WHERE nome='Gabriel'");
   const fv2=await claim(7);assert.equal((await confirmar(fv2,{situacao:'pendente',status_decisao:'Pedido em análise',status_atual:'Pedido em análise'})).distribuidos,1);
   assert.equal((await sql('select analista from public.fila_atribuicoes where pedido_id=$1',[id(7)]))[0].analista,'Gabriel');
  });
  await test('período respeita meia-noite de Fortaleza e números monetários fora do limite permanecem desconhecidos',async()=>{
   await db.exec(`INSERT INTO af_mobile.pedidos_capturados(pedido_id,origem,analista,concluido_em)VALUES('${id(100)}','analista','Rayla','2020-01-02T02:59:00Z'),('${id(101)}','analista','Rayla','2020-01-02T03:00:00Z')`);
   const r=await call('fila_gestao_relatorio',['2020-01-01','2020-01-01',null],'TOKEN-G','GESTAO');assert.equal(r.producao.totais.quantidade,1);assert.equal(r.producao.totais.sem_valor,1);
   const money=(await sql("select af_mobile.valor_centavos('R$ 0,00') as zero,af_mobile.valor_centavos('R$ 9999999999999999999,99') as enorme"))[0];assert.equal(Number(money.zero),0);assert.equal(money.enorme,null);
  });
 }finally{await db.close();}
 console.log(`${passou} verificações de captura e conciliação passaram.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
