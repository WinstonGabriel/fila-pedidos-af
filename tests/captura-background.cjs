const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const AF=require('../extension/af-evidencias.js'),source=fs.readFileSync(require('node:path').join(__dirname,'../extension/af-captura-background.js'),'utf8');
const tick=()=>new Promise(setImmediate),clone=x=>structuredClone(x),url='https://af.mateusmais.com.br';
const p=n=>({id:String(2026000000000000+n),href:`${url}/pedido/${String(n).padStart(8,'0')}-0000-4000-8000-000000000001`,data:'2026-10-25',hora:'14:00',valor:'R$ 10,00',cat:'Varejo',estab:'Teste'});
function runtime(initial){
 const state=initial||{local:{codigo:'EQUIPE-A',token:'TOKEN-A',me:'Rayla'}},calls=[],messages=[];let listener,fail=false,hold=null,pending=[];
 const ctx=vm.createContext({SUPABASE_URL:'https://example.supabase.co',SUPABASE_KEY:'CHAVE-TESTE',FilaAFEvidencias:AF,AbortController,setTimeout,clearTimeout,URL,console,
  chrome:{runtime:{id:'test',getURL:()=> 'chrome-extension://test/',onMessage:{addListener:fn=>listener=fn}},storage:{local:{get:async k=>({[k]:clone(state[k])}),set:async v=>Object.assign(state,clone(v))},session:{get:async()=>({})}},tabs:{sendMessage:async(id,msg)=>{messages.push(clone(msg));return{ok:true,resultados:msg.pedidos.map(q=>({...q,situacao:'indisponivel'}))};}}},
  fetch:async(u,opts)=>{const fn=u.split('/').at(-1),args=JSON.parse(opts.body);calls.push({fn,args});if(fn==='fila_pedidos_observar'){if(hold)await hold;if(fail)throw Error('sem rede');}return{ok:true,json:async()=>fn==='fila_pedidos_pendentes'?clone(pending):{ok:true}};}
 });vm.runInContext(source,ctx);
 return{state,calls,messages,setFail:v=>fail=v,setHold:v=>hold=v,setPending:v=>pending=v,send:(pedidos,opts={})=>new Promise(resolve=>{const r=listener({tipo:'fila-af-captura',pedidos},{id:opts.id||'test',url:opts.url||url+'/',tab:{id:1}},resolve);if(r!==true)resolve(undefined);})};
}
(async()=>{
 let n=0;const test=async(name,fn)=>{await fn();n++;console.log('PASS',name);};
 await test('observações simultâneas de duas abas permanecem salvas após falha de rede',async()=>{
  const r=runtime();r.setFail(true);await Promise.all([r.send([p(1)]),r.send([p(2)])]);await tick();await tick();
  assert.equal(Object.keys(r.state.filaAFCaptura.pedidos).length,2);assert.equal(r.state.filaAFCaptura.pedidos[p(1).id].valor,'R$ 10,00');
 });
 await test('reiniciar service worker repete o lote persistido e limpa somente após confirmação',async()=>{
  const a=runtime();a.setFail(true);await a.send([p(3)]);await tick();await tick();
  const b=runtime(a.state);await b.send([]);await tick();await tick();
  assert.equal(b.calls.find(c=>c.fn==='fila_pedidos_observar').args.p_pedidos[0].id,p(3).id);assert.equal(Object.keys(b.state.filaAFCaptura.pedidos).length,0);
 });
 await test('troca de equipe não transfere lote anterior nem aplica retorno antigo ao contexto novo',async()=>{
  const r=runtime();let release;r.setHold(new Promise(res=>release=res));await r.send([p(4)]);await tick();
  r.state.local={codigo:'EQUIPE-B',token:'TOKEN-B',me:'Gabriel'};release();await tick();await tick();r.setHold(null);
  await r.send([p(5)]);await tick();await tick();
  assert.equal(r.calls.filter(c=>c.fn==='fila_pedidos_observar'&&c.args.p_codigo==='EQUIPE-B').flatMap(c=>c.args.p_pedidos).some(q=>q.id===p(4).id),false);
 });
 await test('consulta usa apenas IDs e comprovantes; não transmite credenciais à página do AF',async()=>{
  const r=runtime();r.setPending([{id:p(6).id,href:p(6).href,consulta_token:'lease'}]);await r.send([]);await tick();await tick();await tick();
  assert.equal(r.messages.length,1);assert.ok(!JSON.stringify(r.messages).includes('TOKEN-A'));assert.ok(!JSON.stringify(r.messages).includes('CHAVE-TESTE'));
  assert.equal(r.calls.filter(c=>c.fn==='fila_pedidos_conciliar').length,1);
 });
 await test('mensagens de outra origem/extension são ignoradas e falta de configuração não confirma descarte',async()=>{
  const r=runtime();assert.equal(await r.send([p(7)],{url:'https://intruso.invalid/'}),undefined);assert.equal(await r.send([p(7)],{id:'outra'}),undefined);assert.equal(r.calls.length,0);
  const vazio=runtime({local:{}});assert.equal((await vazio.send([p(8)])).ok,false);
 });
 console.log(`${n} verificações do coletor em segundo plano passaram.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
