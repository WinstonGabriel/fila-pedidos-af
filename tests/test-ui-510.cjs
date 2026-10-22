const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHarness } = require('./dom-harness.cjs');
const root = require('node:path').resolve(__dirname, '../extension');
const source = fs.readFileSync(root + '/popup.js', 'utf8');
const html = fs.readFileSync(root + '/popup.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<link[^>]+>/g, '');
const names = ['Natalie','Cássio','Evangela','Gabriel','Kazaf','Rayla','Abigail','Alisson'];
const users = new Map(); const calls = []; const logs = []; const errors = [];
let nextId = 1000;
let checks = 0;
function log(actor, action, name, pedido = null) { logs.unshift({ id: nextId++, quando: new Date().toISOString(), ator: actor, acao: action, analista: name, pedido_id: pedido, coord: false, detalhe: '' }); }
async function backend(fn, a) {
  calls.push({ fn, ...a });
  const me = [...users].find(([,t]) => t===a.p_token)?.[0];
  if (fn === 'fila_estado') return { analistas: names.map(nome => ({nome, ligado: true})), atribuicoes: [], janela: {}, usuarios: [...users].map(([nome,token]) => ({nome,meu:token===a.p_token})), coord: false };
  if (fn === 'fila_escolher_nome') {
    if (users.has(a.p_nome) && users.get(a.p_nome)!==a.p_token) throw new Error('O nome já está em uso por outro analista. Aguarde a liberação.');
    if (me && me!==a.p_nome) { users.delete(me); log(me,'liberou_nome',me); }
    if (me!==a.p_nome) log(a.p_nome,'assumiu_nome',a.p_nome);
    users.set(a.p_nome,a.p_token); return {ok:true};
  }
  if (fn === 'fila_liberar_nome') {
    if (me!==a.p_nome) throw new Error('Você só pode liberar o seu próprio nome');
    users.delete(a.p_nome); log(me,'liberou_nome',a.p_nome); return {ok:true};
  }
  if (fn === 'fila_historico_pagina') {
    const rows = logs.filter(h => (!a.p_antes || h.id<a.p_antes) && (!a.p_analista || h.ator===a.p_analista || h.analista===a.p_analista) && (!a.p_acao || h.acao===a.p_acao) && (!a.p_pedido || (h.pedido_id || '').includes(a.p_pedido)));
    const itens = rows.slice(0,a.p_limite); return {itens,temMais:rows.length>a.p_limite,proximo:itens.at(-1)?.id || null};
  }
  if (fn === 'fila_distribuir_auto') return {ok:true,distribuidos:0};
  if (fn === 'fila_avancar' && a.p_acao === 'liberar') { log(me,'liberou_pedido',a.p_analista,a.p_pedido_id); return {ok:true}; }
  return {ok:true};
}
async function test(name, f) { await f(); console.log('PASS',name); checks++; }
let browser; const pages=[];
async function installation(token, savedMe = '') {
  const p=await browser.newPage(); pages.push(p); p.on('pageerror',e=>errors.push(e.message));
  await p.setContent(html);
  await p.exposeFunction('testBackend', async (fn,a) => { try {return {status:200,body:await backend(fn,a)};} catch(e) {return {status:409,body:{message:e.message}};} });
  await p.evaluate(({token,savedMe})=>{
    window.nativeTimeout=window.setTimeout;
    window.delays={}; window.scripts={fast:0,full:0};
    window.setTimeout=(f,ms,...args)=>{
      if (f.name==='atualizar') {window.tickBanco=f; delays.banco=ms; return 0;}
      if (f.name==='leituraContinua') {window.tickTela=f; delays.tela=ms; return 0;}
      return nativeTimeout(f,ms,...args);
    };
    window.fetch=async (url,options)=>{
      const r=await testBackend(url.split('/').pop(),JSON.parse(options.body));
      return new Response(JSON.stringify(r.body),{status:r.status});
    };
    const tab={id:1,url:'https://af.mateusmais.com.br/',active:true};
    window.testOrder={id:'1000000000000042',data:'2026-10-21',hora:'10:00',minutos:600,valor:'R$ 20,00',estab:'Loja',cat:'Varejo',href:tab.url+'pedido/test'};
    window.snapshot={ok:true,pedidos:[testOrder],porPagina:{1:[testOrder]},paginaAtual:1,contexto:tab.url,paginas:2,primeira:1,totalMenu:2};
    window.chrome={
      storage:{local:{get:async()=>({local:{codigo:'TESTTEAM',token,me:savedMe,mode:'pilha'}}),set:async()=>{}}},
      permissions:{contains:async()=>true},windows:{getLastFocused:async()=>({id:1})},
      tabs:{query:async()=>[tab],get:async()=>tab,onActivated:{addListener:f=>window.activated=f},onUpdated:{addListener:f=>window.updated=f}},
      scripting:{executeScript:async({args})=>{
        if (args?.[0]?.somenteTela) {scripts.fast++; if(window.holdFast) return new Promise(r=>window.finishFast=()=>r([{result:snapshot}])); return [{result:snapshot}];}
        scripts.full++; return new Promise(r=>window.finishFull=value=>r([{result:value}]));
      }},
    };
  },{token,savedMe});
  await p.addScriptTag({content:"const SUPABASE_URL='https://test.invalid'; const SUPABASE_KEY='TEST';"});
  await p.addScriptTag({content:source});
  await p.evaluate(()=>document.dispatchEvent(new Event('DOMContentLoaded')));
  await p.waitForFunction(()=>typeof tickBanco==='function' && typeof tickTela==='function');
  return p;
}
(async()=>{
  browser=await createHarness();
  const p1=await installation('test-token-510-one','Gabriel');
  const p2=await installation('test-token-510-two');
  await test('fresh clients see all eight names and stale local names are not auto claimed',async()=>{
    for(const p of [p1,p2]) {
      const r=await p.evaluate('({me:local.me,available:[...document.querySelectorAll("#eu option")].filter(o=>o.value&&!o.disabled).length})');
      assert.equal(r.me,''); assert.equal(r.available,8);
    }
    assert.equal(calls.filter(c=>/assumir|escolher/.test(c.fn)).length,0);
  });
  await test('screen is available while full pagination remains blocked, with two second cadence',async()=>{
    const r=await p1.evaluate('({orders:pedidos.length,full:!!completaEmCurso,interval:INTERVALO_LEITURA_MS,sync:delays.banco,screen:delays.tela,partial:leitura.parcial})');
    assert.equal(r.orders,1); assert.equal(r.full,true); assert.equal(r.interval,2000); assert.equal(r.sync,2000); assert.ok(r.screen<=2000 && r.screen>0); assert.equal(r.partial,true);
    const n=await p1.evaluate(()=>scripts.fast); await p1.evaluate(()=>tickTela()); assert.equal(await p1.evaluate(()=>scripts.fast),n+1);
    await p1.evaluate(()=>tickBanco()); assert.equal(await p1.evaluate(()=>scripts.full),1);
  });
  await test('choosing a name blocks it in every other installation',async()=>{
    await p1.evaluate(()=>escolherNome('Gabriel')); await p2.evaluate(()=>sync()); await p2.evaluate(()=>renderEu(true));
    assert.equal(await p1.evaluate('local.me'),'Gabriel');
    assert.equal(await p2.evaluate(()=>document.querySelector('#eu option[value="Gabriel"]').disabled),true);
    await p2.evaluate(()=>escolherNome('Gabriel')); assert.equal(await p2.evaluate('local.me'),''); assert.match(await p2.evaluate('rede.aviso'),/em uso/);
    assert.equal(users.get('Gabriel'),'test-token-510-one');
  });
  await test('a new installation does not release another analyst reservation',async()=>{
    const p3=await installation('test-token-510-three');
    assert.equal(users.get('Gabriel'),'test-token-510-one');
    assert.equal(await p3.evaluate(()=>document.querySelector('#eu option[value="Gabriel"]').disabled),true);
  });
  await test('only the owner may release a name; release allows a new choice',async()=>{
    await p2.evaluate(()=>escolherNome('Rayla'));
    const denied=await p2.evaluate(async()=>{try{await rpc('fila_liberar_nome',{p_nome:'Gabriel'});return false;}catch(_){return true;}}); assert.equal(denied,true);
    await p1.evaluate(()=>escolherNome('')); assert.equal(users.has('Gabriel'),false);
    await p2.evaluate(()=>escolherNome('Gabriel')); assert.equal(users.get('Gabriel'),'test-token-510-two'); assert.equal(users.has('Rayla'),false);
  });
  await test('reopening the same installation restores its reservation without choosing again',async()=>{
    const before=calls.filter(c=>c.fn==='fila_escolher_nome').length;
    const reopened=await installation('test-token-510-two','Gabriel'); assert.equal(await reopened.evaluate('local.me'),'Gabriel');
    assert.equal(calls.filter(c=>c.fn==='fila_escolher_nome').length,before);
  });
  await test('the release-order action uses a distinct audited operation',async()=>{
    await p2.evaluate(()=>liberarEPuxar('Gabriel','1000000000000042'));
    assert.ok(calls.some(c=>c.fn==='fila_avancar' && c.p_acao==='liberar')); assert.ok(logs.some(h=>h.acao==='liberou_pedido' && h.pedido_id==='1000000000000042' && h.ator==='Gabriel'));
  });
  await test('minimal info button opens and closes the history dialog',async()=>{
    await p2.evaluate(()=>document.querySelector('#btnHist').click()); await p2.waitForFunction(()=>document.querySelector('#histBody').textContent.includes('liberou o pedido'));
    assert.equal(await p2.evaluate(()=>document.querySelector('#hist').open),true);
    const text=await p2.evaluate(()=>document.querySelector('#histBody').textContent); assert.match(text,/Gabriel/); assert.match(text,/1000000000000042/);
    await p2.evaluate(()=>document.querySelector('#histFechar').click()); assert.equal(await p2.evaluate(()=>document.querySelector('#hist').open),false);
  });
  await test('history loads older pages with no 100-record cutoff',async()=>{
    for(let i=0;i<205;i++)log(i%2?'Gabriel':'Rayla',i%2?'liberou_pedido':'concluiu_pedido',i%2?'Gabriel':'Rayla',String(1000000000001000n+BigInt(i)));
    await p2.evaluate(()=>abrirHist()); await p2.waitForFunction(()=>historico.itens.length===100);
    await p2.evaluate(()=>carregarHist(true)); assert.equal(await p2.evaluate('historico.itens.length'),200);
    await p2.evaluate(()=>carregarHist(true)); assert.equal(await p2.evaluate('historico.itens.length'),logs.length);
    assert.equal(await p2.evaluate('historico.temMais'),false);
  });
  await test('history filters by analyst, action and order ID',async()=>{
    await p2.evaluate(async()=>{
      document.querySelector('#histFiltro').value='Gabriel'; document.querySelector('#histAcao').value='liberou_pedido'; document.querySelector('#histPedido').value='1000000000001001'; await carregarHist();
    });
    const rows=await p2.evaluate('historico.itens'); assert.equal(rows.length,1); assert.equal(rows[0].ator,'Gabriel'); assert.equal(rows[0].acao,'liberou_pedido');
  });
  await test('failed screen scan preserves the last valid snapshot',async()=>{
    await p2.evaluate(async()=>{const previous=chrome.scripting.executeScript;chrome.scripting.executeScript=async()=>[{result:{ok:false,erro:'AF indisponível'}}];await lerPedidos();chrome.scripting.executeScript=previous;});
    assert.equal(await p2.evaluate('pedidos.length'),1); assert.equal(await p2.evaluate('usandoCache'),true);
  });
  await test('double actions and concurrent syncs do not produce duplicate operations',async()=>{
    const count=await p2.evaluate(async()=>{let n=0;await Promise.all([acao(async()=>{n++;await new Promise(r=>nativeTimeout(r,20));}),acao(async()=>{n++;})]);return n;}); assert.equal(count,1);
    const before=calls.filter(c=>c.fn==='fila_estado').length;await p2.evaluate(()=>Promise.all([sync(),sync(),sync()]));assert.equal(calls.filter(c=>c.fn==='fila_estado').length-before,1);
  });
  await test('a temporary database failure does not erase the selected name',async()=>{
    const result=await p2.evaluate(async()=>{const old=window.fetch;window.fetch=async()=>{throw new TypeError('network failure');};const ok=await sync();window.fetch=old;return {ok,me:local.me};});
    assert.deepEqual(result,{ok:false,me:'Gabriel'});
  });
  assert.deepEqual(errors,[]); console.log(`All ${checks} UI and multi-installation checks passed.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{for(const p of pages)await p.close();await browser?.close();});
