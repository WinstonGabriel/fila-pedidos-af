const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto,createHash}=require('node:crypto');
const src=fs.readFileSync(path.join(__dirname,'../extension/sincronizacao-background.js'),'utf8');
const copy=x=>structuredClone(x),plain=x=>JSON.parse(JSON.stringify(x)),tick=()=>new Promise(setImmediate);
const url='https://example.supabase.co';
function runtime(saved,projectUrl=url){
 const local=saved?.local||{local:{codigo:'A',token:'TOKEN-A',me:'Gabriel'}},session=saved?.session||{},requests=[],publicacoes=[];const listeners=[];let listener,now=1000000,hold=null,erro=null,iniciou;const inicio=new Promise(r=>iniciou=r);
 const blocks={estado:{analistas:[{nome:'Gabriel',ligado:true}],atribuicoes:[],usuarios:[{nome:'Gabriel',meu:true}],concluidos_ids:['2026000000000001']},descansos:{analistas:{}},avisos:{analista:'Gabriel',itens:[],nao_lidos:0}};
 class Clock extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
 const ctx=vm.createContext({Date:Clock,SUPABASE_URL:projectUrl,SUPABASE_KEY:'CHAVE-TESTE',crypto:webcrypto,TextEncoder,Uint8Array,AbortController,setTimeout,clearTimeout,console,
  publicarAvisosBackground:async(d,s)=>publicacoes.push({d:copy(d),nome:s.me}),
  chrome:{runtime:{id:'ext',getURL:()=> 'chrome-extension://ext/',onMessage:{addListener:fn=>listener=fn}},storage:{local:{get:async k=>({[k]:copy(local[k])})},session:{get:async k=>({[k]:copy(session[k])}),set:async d=>Object.assign(session,copy(d)),remove:async k=>delete session[k]},onChanged:{addListener:fn=>listeners.push(fn)}}},
  fetch:async(u,opts)=>{
   const args=JSON.parse(opts.body);requests.push(args);iniciou();const snapshot=copy(blocks),agora=now;
   if(hold)await hold;
   if(erro)return{ok:false,json:async()=>({message:erro})};
   if(args.p_coord&&args.p_coord!=='COORD')return{ok:false,json:async()=>({message:'Coordenação inválida'})};
   snapshot.estado.coord=args.p_coord==='COORD';
   const versoes={},dados={};for(const[k,v]of Object.entries(snapshot)){versoes[k]=createHash('md5').update(JSON.stringify(v)).digest('hex');if(args.p_versoes[k]!==versoes[k])dados[k]=v;}
   return{ok:true,json:async()=>({versoes,dados,servidor_em:new Date(agora+100).toISOString()})};
  }
 });vm.runInContext(src,ctx);
 return{ctx,local,session,requests,blocks,publicacoes,inicio,obter:o=>ctx.FilaSincronizacao.obter(o),avancar:ms=>now+=ms,setHold:p=>hold=p,setErro:e=>erro=e,invalidar:()=>ctx.FilaSincronizacao.invalidar(),trocar:s=>{const old=copy(local.local);local.local=s;listeners.forEach(fn=>fn({local:{oldValue:old,newValue:copy(s)}},'local'));},mensagem:(msg,origin='chrome-extension://ext/popup.html')=>new Promise(resolve=>{if(listener(msg,{id:'ext',url:origin},resolve)!==true)resolve(undefined);})};
}
(async()=>{
 let n=0;const test=async(s,f)=>{await f();n++;console.log('PASS',s);};
 await test('painéis e notificações simultâneos compartilham uma consulta; novos pedidos dentro de 5 s usam cache',async()=>{
  const r=runtime();const a=await Promise.all([r.obter(),r.obter(),r.obter()]);assert.equal(r.requests.length,1);assert.equal(a[0].usuarios[0].nome,'Gabriel');await r.obter();assert.equal(r.requests.length,1);
 });
 await test('depois de 5 s envia hashes, mescla apenas mudanças e conserva blocos anteriores',async()=>{
  const r=runtime();await r.obter();r.avancar(5001);r.blocks.estado.analistas[0].ligado=false;const d=await r.obter();assert.equal(r.requests.length,2);assert.equal(Object.keys(r.requests[1].p_versoes).length,3);assert.equal(d.analistas[0].ligado,false);assert.equal(d.avisos.analista,'Gabriel');assert.equal(d.concluidos_ids.length,1);
 });
 await test('relógio continua avançando durante reutilização do cache',async()=>{
  const r=runtime();const a=await r.obter();r.avancar(2000);const b=await r.obter();assert.equal(Date.parse(b.servidor_em)-Date.parse(a.servidor_em),2000);
 });
 await test('ação força consulta imediata e aguarda resposta anterior antes de pedir estado novo',async()=>{
  const r=runtime();let liberar;r.setHold(new Promise(res=>liberar=res));const a=r.obter();await r.inicio;r.blocks.estado.analistas[0].ligado=false;const b=r.obter({forcar:true});r.setHold(null);liberar();await a;const novo=await b;assert.equal(novo.analistas[0].ligado,false);assert.equal(r.requests.length,2);
 });
 await test('reinício do worker preserva hashes da sessão e não precisa baixar de novo todos os dados',async()=>{
  const a=runtime();await a.obter();const b=runtime({local:a.local,session:a.session});const d=await b.obter();assert.equal(Object.keys(b.requests[0].p_versoes).length,3);assert.equal(d.usuarios[0].nome,'Gabriel');
 });
 await test('troca de equipe descarta resposta em andamento e não reaproveita dados do contexto anterior',async()=>{
  const r=runtime();let liberar;r.setHold(new Promise(res=>liberar=res));const a=r.obter();await r.inicio;r.trocar({codigo:'B',token:'TOKEN-B',me:'Rayla'});r.setHold(null);liberar();await assert.rejects(a,/identificação mudou/);await r.obter();assert.equal(r.requests[1].p_codigo,'B');assert.equal(Object.keys(r.requests[1].p_versoes).length,0);
 });
 await test('falha de autorização não devolve o último cache como uma sincronização válida',async()=>{
  const r=runtime();await r.obter();r.setErro('Equipe inválida');await assert.rejects(r.obter({forcar:true}),/Equipe inválida/);await assert.rejects(r.obter(),/Equipe inválida/);assert.equal(r.requests.length,3);
 });
 await test('coordenação tem contexto separado; páginas web não recebem o estado completo',async()=>{
  const r=runtime();assert.equal((await r.obter()).coord,false);assert.equal((await r.obter({coord:'COORD'})).coord,true);assert.equal(r.requests.length,2);
  const msg={tipo:'fila-sincronizar',coord:null,contexto:JSON.stringify([url,'A','TOKEN-A',null])};assert.equal(await r.mensagem(msg,'https://af.mateusmais.com.br/'),undefined);
  const d=await r.mensagem(msg);assert.equal(d.ok,true);assert.ok(!JSON.stringify(d.dados).includes('TOKEN-A'));assert.equal(r.publicacoes.length,1);
 });
 await test('painel usa a consulta compartilhada, conserva IDs concluídos e força atualização depois de ação',async()=>{
  const {runtime:uiRuntime}=require('./catalogo-integration.cjs');
  const ui=uiRuntime({}),recebidos=[];vm.runInContext("local.codigo='A';local.token='TOKEN-A';local.me='Gabriel'",ui.context);
  const r=runtime(undefined,vm.runInContext('SUPABASE_URL',ui.context));ui.context.chrome.runtime={sendMessage:m=>r.mensagem(m)};ui.context.FilaGestao={receber:d=>recebidos.push(plain(d))};
  assert.equal(await ui.sync(),true);assert.equal(r.requests.length,1);assert.equal(ui.api.requests.length,0);assert.equal(recebidos[0].avisos.analista,'Gabriel');
  assert.equal(vm.runInContext("ocupados().has('2026000000000001')",ui.context),true);
  assert.equal(await vm.runInContext('sync(false)',ui.context),true);assert.equal(r.requests.length,1);
  r.blocks.estado.analistas[0].ligado=false;assert.equal(await ui.sync(),true);assert.equal(r.requests.length,2);assert.equal(vm.runInContext('remote.analistas.Gabriel.ligado',ui.context),false);
  assert.equal(vm.runInContext('INTERVALO_LEITURA_MS',ui.context),5000);assert.equal(vm.runInContext('INTERVALO_SYNC_MS',ui.context),5000);
 });
 console.log(`${n} verificações do compartilhamento de sincronização passaram.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
