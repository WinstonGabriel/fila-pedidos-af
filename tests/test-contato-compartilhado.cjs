const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHarness } = require('./dom-harness.cjs');
const dir = path.resolve(__dirname, '../extension');
const source = fs.readFileSync(dir+'/popup.js','utf8');
const aparencia = fs.readFileSync(dir+'/aparencia.js','utf8');
const html = fs.readFileSync(dir+'/popup.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<link[^>]+>/g,'');
const names = ['Gabriel','Abigail','Rayla'];
const users = {testGabriel:'Gabriel',testAbigail:'Abigail',testRayla:'Rayla'};
const order = n => ({id:String(5310000000000000n+BigInt(n)),hora:'10:00',data:'2026-10-21',minutos:600,cat:'Varejo',estab:'Loja teste',valor:'R$ 20',href:'https://af.mateusmais.com.br/pedido/test-'+n});
const row = (n,name,status) => ({...order(n),pedido_id:order(n).id,analista:name,status,criado_em:new Date().toISOString()});
let rows = [row(1,'Gabriel','em_andamento'),row(2,'Gabriel','contato'),row(3,'Gabriel','reservado'),row(5,'Gabriel','reservado'),row(7,'Abigail','em_andamento')];
const calls=[],logs=[],errors=[],pages=[];let count=0,browser;
const audit = (actor,action,r) => logs.unshift({id:logs.length+1,quando:new Date().toISOString(),ator:actor,analista:r.analista,acao:action,pedido_id:r.pedido_id,coord:false,detalhe:''});
async function backend(fn,a) {
  calls.push({fn,...a});const me=users[a.p_token];
  if(fn==='fila_estado') return {analistas:names.map(nome=>({nome,ligado:nome==='Gabriel'})),usuarios:names.map(nome=>({nome,meu:nome===me})),atribuicoes:rows,janela:{},coord:false};
  if(fn==='fila_distribuir_auto') return {ok:true,distribuidos:0};
  if(fn==='fila_avancar') {
    if(!me)throw new Error('Escolha seu nome');
    if(a.p_acao!=='contato' && a.p_analista!==me)throw new Error('Você só pode alterar os seus próprios dados');
    const r=rows.find(r=>r.pedido_id===a.p_pedido_id&&r.analista===a.p_analista&&r.status==='em_andamento');
    if(!r)return {ok:true,ja_processado:true};
    r.status='contato';audit(me,'marcou_para_contato',r);
    const next=rows.find(q=>q.analista===r.analista&&q.status==='reservado');if(next)next.status='em_andamento';
    return {ok:true,distribuidos:next?1:0};
  }
  if(fn==='fila_devolver') {
    if(!me)throw new Error('Escolha seu nome');
    const r=rows.find(r=>r.pedido_id===a.p_id&&['contato','reservado'].includes(r.status));
    if(!r)return {ok:true,ja_processado:true};
    if(r.status==='reservado'&&r.analista!==me)throw new Error('Reserva de outro analista');
    audit(me,r.status==='contato'?'removeu_de_contato':'cancelou_reserva',r);rows=rows.filter(q=>q!==r);return {ok:true};
  }
  if(fn==='fila_historico_pagina')return {itens:logs,temMais:false,proximo:logs.at(-1)?.id};
  return {ok:true};
}
async function test(name,fn){await fn();count++;console.log('PASS',name);}
async function installation(token) {
  const p=await browser.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));await p.setContent(html);
  await p.exposeFunction('testBackend',async(fn,a)=>{try{return {status:200,body:await backend(fn,a)};}catch(e){return {status:403,body:{message:e.message}};}});
  await p.evaluate(({token,orders})=>{
    window.nativeTimeout=setTimeout;
    window.setTimeout=(f,ms,...args)=>{if(f.name==='atualizar'){window.tickBanco=f;return 0;}if(f.name==='leituraContinua'){window.tickTela=f;return 0;}return nativeTimeout(f,ms,...args);};
    window.fetch=async(url,o)=>{const r=await testBackend(url.split('/').pop(),JSON.parse(o.body));return new Response(JSON.stringify(r.body),{status:r.status});};
    const tab={id:1,url:'https://af.mateusmais.com.br/',active:true};
    window.chrome={storage:{local:{get:async()=>({local:{codigo:'TEST',token,mode:'pilha'}}),set:async()=>{}}},permissions:{contains:async()=>true},windows:{getLastFocused:async()=>({id:1})},tabs:{query:async()=>[tab],get:async()=>tab,onUpdated:{addListener:()=>{}},onActivated:{addListener:()=>{}}},scripting:{executeScript:async({args})=>args[0].somenteTela?[{result:{ok:true,pedidos:orders,porPagina:{1:orders},paginaAtual:1,contexto:tab.url,paginas:1,primeira:orders.length,totalMenu:orders.length}}]:new Promise(()=>{})}};
  },{token,orders:Array.from({length:7},(_,i)=>order(i+1))});
  await p.addScriptTag({content:"const SUPABASE_URL='https://test.invalid';const SUPABASE_KEY='TEST';"});
  await p.addScriptTag({content:aparencia});await p.addScriptTag({content:source});await p.evaluate(()=>document.dispatchEvent(new Event('DOMContentLoaded')));
  await p.waitForFunction(()=>typeof tickBanco==='function'&&typeof tickTela==='function');return p;
}
const click = (p,selector) => p.evaluate(async selector=>{const target=document.querySelector(selector);if(!target)throw new Error('Missing action '+selector);await document.querySelector('#painel').onclick({target,preventDefault(){}});},selector);
(async()=>{
  browser=await createHarness();const a=await installation('testAbigail'),r=await installation('testRayla');
  await test('another identified analyst, even OFF, sees the mark and remove contact buttons',async()=>{
    assert.equal(await a.evaluate('local.me'),'Abigail');
    assert.equal(await a.evaluate(()=>!!document.querySelector('[data-contato="Gabriel"]')),true);
    assert.equal(await a.evaluate(id=>!!document.querySelector(`[data-rmcontato="${id}"]`),order(2).id),true);
  });
  await test('shared contact permissions preserve private completion, release and reservations',async()=>{
    for(const selector of ['[data-concluir="Gabriel"]','[data-liberar="Gabriel"]','[data-rmreserva]'])assert.equal(await a.evaluate(s=>!!document.querySelector(s),selector),false);
  });
  await test('another analyst removes an existing contact using that orders ID',async()=>{
    await click(a,`[data-rmcontato="${order(2).id}"]`);
    assert.ok(calls.some(c=>c.fn==='fila_devolver'&&c.p_id===order(2).id&&c.p_token==='testAbigail'));
    assert.ok(!rows.some(q=>q.pedido_id===order(2).id));
  });
  await test('marking another analysts current order sends its owner and exact ID, then shows their next',async()=>{
    await click(a,'[data-contato="Gabriel"]');
    assert.ok(calls.some(c=>c.fn==='fila_avancar'&&c.p_acao==='contato'&&c.p_analista==='Gabriel'&&c.p_pedido_id===order(1).id&&c.p_token==='testAbigail'));
    assert.equal(await a.evaluate("atualDe('Gabriel').pedido_id"),order(3).id);
    assert.equal(rows.find(q=>q.pedido_id===order(7).id).status,'em_andamento');
  });
  await test('a third analyst sees and removes the contact marked by someone else',async()=>{
    await r.evaluate(()=>tickBanco());await click(r,`[data-rmcontato="${order(1).id}"]`);
    assert.ok(logs.some(h=>h.acao==='removeu_de_contato'&&h.ator==='Rayla'&&h.analista==='Gabriel'&&h.pedido_id===order(1).id));
    assert.ok(!rows.some(q=>q.pedido_id===order(1).id));
  });
  await test('history identifies the actual analysts who marked and removed contact',async()=>{
    await a.evaluate(()=>abrirHist());await a.waitForFunction(()=>historico.itens.length>0);
    const text=await a.evaluate(()=>document.querySelector('#histBody').textContent.replace(/\s+/g,' '));
    assert.match(text,/Abigail marcou para contato o pedido de Gabriel/);assert.match(text,/Rayla removeu da lista de contato o pedido de Gabriel/);
  });
  await test('a stale mark request leaves the next order active',async()=>{
    await a.evaluate(id=>avancarPedido('Gabriel','contato',id),order(1).id);
    assert.equal(rows.find(q=>q.pedido_id===order(3).id).status,'em_andamento');
  });
  await test('unnamed installations have no shared contact controls while the owner retains their controls',async()=>{
    rows.push(row(6,'Gabriel','contato'));
    const unnamed=await installation('testUnnamed');
    assert.equal(await unnamed.evaluate(()=>document.querySelectorAll('[data-contato],[data-rmcontato]').length),0);
    const owner=await installation('testGabriel');
    assert.equal(await owner.evaluate(()=>!!document.querySelector('[data-concluir="Gabriel"]')),true);
    assert.equal(await owner.evaluate(()=>!!document.querySelector('[data-liberar="Gabriel"]')),true);
    assert.equal(await owner.evaluate(()=>!!document.querySelector('[data-rmreserva]')),true);
  });
  assert.deepEqual(errors,[]);console.log(`All ${count} shared-contact UI checks passed.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{for(const p of pages)await p.close();await browser?.close();});
