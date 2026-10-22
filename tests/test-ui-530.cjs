const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHarness}=require('./dom-harness.cjs');
const dir=require('node:path').resolve(__dirname,'../extension');
const source=fs.readFileSync(dir+'/popup.js','utf8');
const html=fs.readFileSync(dir+'/popup.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<link[^>]+>/g,'');
const item=n=>({id:String(5300000000000000n+BigInt(n)),hora:'10:00',data:'2026-10-21',minutos:600,cat:'Varejo',estab:'Loja teste',valor:'R$ 20,00',href:'https://af.mateusmais.com.br/pedido/test-'+n});
const assignment=(n,name,status='em_andamento')=>({...item(n),pedido_id:item(n).id,analista:name,status,criado_em:new Date().toISOString()});
const state={analistas:[{nome:'Gabriel',ligado:false},{nome:'Rayla',ligado:false}],usuarios:[{nome:'Gabriel',meu:true},{nome:'Rayla',meu:false}],atribuicoes:[],janela:{janela_inicio:'10:00'},coord:false};
const calls=[];const errors=[];let nextAuto=null;let releaseHeld=null;let hold=false;let fail=false;let count=0;let p;
async function test(name,fn){await fn();console.log('PASS',name);count++;}
async function backend(fn,args){
 calls.push({fn,...args});
 if(fn==='fila_estado')return JSON.parse(JSON.stringify(state));
 if(fn==='fila_set_analista'){state.analistas.find(a=>a.nome===args.p_nome).ligado=args.p_ligado;return {ok:true};}
 if(fn==='fila_distribuir_auto'){
  if(fail)throw new Error('simulated network error');
  if(hold)await new Promise(resolve=>releaseHeld=resolve);
  if(nextAuto){state.atribuicoes=nextAuto;nextAuto=null;return {ok:true,distribuidos:1};}
  return {ok:true,distribuidos:0};
 }
 if(fn==='fila_avancar'){
  if(args.p_acao==='concluir')state.atribuicoes=[assignment(1,'Gabriel','concluido'),assignment(2,'Gabriel')];
  if(args.p_acao==='liberar')state.atribuicoes=[assignment(1,'Gabriel','concluido'),assignment(2,'Gabriel','devolvido'),assignment(3,'Gabriel')];
  return {ok:true,distribuidos:1};
 }
 if(fn==='fila_liberar'){state.atribuicoes=state.atribuicoes.map(a=>a.analista===args.p_analista&&a.status==='em_andamento'?{...a,status:'devolvido'}:a);return {ok:true};}
 return {ok:true};
}
async function toggle(on){await p.evaluate(async on=>{const target=document.querySelector('[data-n="Gabriel"][data-f="on"]');target.checked=on;await document.querySelector('#cfgBody').onchange({target});},on);}
(async()=>{
 const browser=await createHarness();p=await browser.newPage();p.on('pageerror',e=>errors.push(e.message));await p.setContent(html);
 await p.exposeFunction('backend',async(fn,args)=>{try{return {status:200,body:await backend(fn,args)};}catch(e){return {status:500,body:{message:e.message}};}});
 await p.evaluate(orders=>{
  window.nativeTimeout=setTimeout;
  window.setTimeout=(fn,ms,...args)=>{if(fn.name==='atualizar'){window.tickBanco=fn;return 0;}if(fn.name==='leituraContinua'){window.tickTela=fn;return 0;}return nativeTimeout(fn,ms,...args);};
  window.fetch=async(url,o)=>{const r=await backend(url.split('/').pop(),JSON.parse(o.body));return new Response(JSON.stringify(r.body),{status:r.status});};
  window.orders=orders;const tab={id:1,url:'https://af.mateusmais.com.br/',active:true};
  window.chrome={storage:{local:{get:async()=>({local:{codigo:'TEST',token:'TEST-TOKEN-530',me:'Gabriel',mode:'pilha'}}),set:async()=>{}}},permissions:{contains:async()=>true},windows:{getLastFocused:async()=>({id:1})},tabs:{query:async()=>[tab],get:async()=>tab,onUpdated:{addListener:()=>{}},onActivated:{addListener:()=>{}}},scripting:{executeScript:async({args})=>args[0].somenteTela?[{result:{ok:true,pedidos:orders,porPagina:{1:orders},paginaAtual:1,contexto:tab.url,paginas:1,primeira:orders.length,totalMenu:orders.length}}]:new Promise(()=>{})}};
 },[item(1),item(2),item(3)]);
 await p.addScriptTag({content:"const SUPABASE_URL='https://test.invalid';const SUPABASE_KEY='TEST';"});
 await p.addScriptTag({content:source});await p.evaluate(()=>document.dispatchEvent(new Event('DOMContentLoaded')));await p.waitForFunction(()=>typeof tickBanco==='function'&&typeof tickTela==='function');
 await test('manual pick button is absent and OFF receives no automatic call',async()=>{
  assert.equal(await p.evaluate(()=>document.querySelector('#btnDistribuir')),null);
  assert.ok(!await p.evaluate(()=>document.querySelector('#painel').textContent.includes('Pegar meu pedido')));
  assert.equal(calls.filter(c=>c.fn==='fila_distribuir_auto').length,0);
 });
 await test('ON triggers assignment immediately and renders the current order',async()=>{
  await p.evaluate(()=>{local.mode='intervalo';renderTudo();});
  nextAuto=[assignment(1,'Gabriel')];await toggle(true);
  assert.equal(await p.evaluate('local.mode'),'pilha');
  assert.equal(await p.evaluate("atualDe('Gabriel').pedido_id"),item(1).id);
  assert.equal(await p.evaluate(()=>document.querySelector('[data-concluir="Gabriel"]').dataset.pedido),item(1).id);
 });
 await test('conclude sends the displayed ID and renders its next order',async()=>{
  await p.evaluate(async()=>{const target=document.querySelector('[data-concluir="Gabriel"]');await document.querySelector('#painel').onclick({target,preventDefault(){}});});
  const call=calls.find(c=>c.fn==='fila_avancar'&&c.p_acao==='concluir');assert.equal(call.p_pedido_id,item(1).id);
  assert.equal(await p.evaluate("atualDe('Gabriel').pedido_id"),item(2).id);
 });
 await test('release returns the displayed order to the shared queue and gets another',async()=>{
  await p.evaluate(async()=>{const target=document.querySelector('[data-liberar="Gabriel"]');await document.querySelector('#painel').onclick({target,preventDefault(){}});});
  const call=calls.find(c=>c.fn==='fila_avancar'&&c.p_acao==='liberar');assert.equal(call.p_pedido_id,item(2).id);
  assert.equal(await p.evaluate("atualDe('Gabriel').pedido_id"),item(3).id);
  assert.equal(await p.evaluate(id=>ocupados().has(id),item(2).id),false);
  assert.match(await p.evaluate(()=>document.querySelector('#painel').textContent),/devolvido.*aguardando outro/);
 });
 await test('polling distributes a returned order when another analyst becomes ON',async()=>{
  state.analistas[1].ligado=true;
  nextAuto=[assignment(1,'Gabriel','concluido'),assignment(2,'Rayla'),assignment(3,'Gabriel')];
  await p.evaluate(()=>tickBanco());assert.equal(await p.evaluate("atualDe('Rayla').pedido_id"),item(2).id);
  assert.equal(await p.evaluate("atualDe('Gabriel').pedido_id"),item(3).id);
 });
 await test('OFF stops automatic pulls and returns the current order',async()=>{
  await toggle(false);const before=calls.filter(c=>c.fn==='fila_distribuir_auto').length;
  await p.evaluate(()=>tickTela());await p.evaluate(()=>tickBanco());
  assert.equal(calls.filter(c=>c.fn==='fila_distribuir_auto').length,before);
  assert.equal(await p.evaluate("!!atualDe('Gabriel')"),false);
 });
 await test('an ON analyst waiting for work receives a newly read AF order',async()=>{
  state.atribuicoes=[assignment(1,'Gabriel','concluido'),assignment(2,'Rayla'),assignment(3,'Gabriel','concluido')];
  await toggle(true);
  nextAuto=[...state.atribuicoes,assignment(4,'Gabriel')];
  await p.evaluate(newItem=>orders.push(newItem),item(4));await p.evaluate(()=>tickTela());
  await p.waitForFunction(()=>atualDe('Gabriel')?.pedido_id==='5300000000000004');
 });
 await test('simultaneous screen and polling requests share a single allocation call',async()=>{
  state.atribuicoes=[];await p.evaluate(()=>sync());
  hold=true;nextAuto=[assignment(1,'Gabriel'),assignment(2,'Rayla')];
  const before=calls.filter(c=>c.fn==='fila_distribuir_auto').length;
  await p.evaluate(()=>{window.autoWait=Promise.all([distribuirAutomatico(),distribuirAutomatico(),distribuirAutomatico()]);});
  assert.equal(calls.filter(c=>c.fn==='fila_distribuir_auto').length-before,1);hold=false;releaseHeld();await p.evaluate(()=>autoWait);
 });
 await test('allocation failure releases its lock and a later cycle can recover',async()=>{
  state.atribuicoes=[];await p.evaluate(()=>sync());fail=true;await p.evaluate(()=>distribuirAutomatico());
  assert.equal(await p.evaluate('distribuicaoEmCurso'),null);fail=false;nextAuto=[assignment(4,'Gabriel')];await p.evaluate(()=>sync());await p.evaluate(()=>distribuirAutomatico());
  assert.equal(await p.evaluate("atualDe('Gabriel').pedido_id"),item(4).id);
 });
 await test('large panels send available orders beyond the first 500 occupied entries',async()=>{
  const result=await p.evaluate(()=>{
   const oldPedidos=pedidos,oldAtribuicoes=remote.atribuicoes;
   try {
    pedidos=Array.from({length:602},(_,i)=>({id:String(i+1),cat:'Varejo',estab:'Loja teste',hora:'10:00',valor:'',href:''}));
    remote.atribuicoes=pedidos.slice(0,601).map(p=>({pedido_id:p.id,analista:'Gabriel',status:'concluido'}));
    remote.atribuicoes[600].status='devolvido';
    return candidatosAuto().map(p=>p.id);
   } finally {pedidos=oldPedidos;remote.atribuicoes=oldAtribuicoes;}
  });
  assert.deepEqual(result,['601','602']);
 });
 await test('automatic history names the receiving analyst and the initiating analyst',async()=>{
  const result=await p.evaluate(()=>{
   historico.itens=[{id:1,quando:new Date().toISOString(),ator:'Gabriel',analista:'Rayla',acao:'recebeu_pedido',pedido_id:'5300000000000002',detalhe:'Distribuição automática'}];
   renderHist();return document.querySelector('#histBody').textContent;
  });
  assert.match(result,/Rayla recebeu o pedido/);assert.match(result,/acionada por Gabriel/);assert.ok(!result.includes('Gabriel recebeu o pedido de Rayla'));
 });
 assert.deepEqual(errors,[]);console.log(`All ${count} automatic-distribution UI checks passed.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await p?.close();});
