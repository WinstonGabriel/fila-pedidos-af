const {runtime}=require('./catalogo-integration.cjs');
const vm=require('node:vm'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const names=['Natalie','Cássio','Evangela','Gabriel','Kazaf','Rayla','Abigail','Alisson'];
 const r=runtime({});
 for(const own of names){
  vm.runInContext(`local.me=${JSON.stringify(own)};rede.ok=true;descansos={analistas:Object.fromEntries(ANALISTAS.map(n=>[n,{usados:0,ate:null,proximo_em:null}]))};remote.analistas=Object.fromEntries(ANALISTAS.map(n=>[n,{atividade:'on',ligado:true}]));`,r.context);
  for(const target of names){const html=vm.runInContext(`descansoHtml(${JSON.stringify(target)})`,r.context);assert.equal(/<button[^>]*\sdisabled/.test(html),own!==target);}
 }
 vm.runInContext("local.me='Gabriel';descansos.analistas.Gabriel.usados=2",r.context);assert(/<button[^>]*\sdisabled/.test(vm.runInContext("descansoHtml('Gabriel')",r.context)));
 vm.runInContext("descansos.analistas.Gabriel={usados:1,proximo_em:new Date(Date.now()+1200000).toISOString()}",r.context);assert(/<button[^>]*\sdisabled/.test(vm.runInContext("descansoHtml('Gabriel')",r.context)));
 r.saved['afOcultar:Gabriel']=true;await vm.runInContext('publicarOcultacao()',r.context);assert.equal(r.saved.afPainelFlutuante.nome,'Gabriel');assert.equal(r.saved.afPainelFlutuante.ativo,true);assert.deepEqual(Object.keys(r.saved.afPainelFlutuante).sort(),['ativo','nome']);
 vm.runInContext("local.me='Abigail'",r.context);await vm.runInContext('publicarOcultacao()',r.context);assert.equal(r.saved.afPainelFlutuante.ativo,false);
 console.log('UI: 64 combinações de identidade, limite, espera e preferências individuais passaram');

 const storage=new Map();
 function flutuante(globalMode=false){
 const nodes=[];let change,mutacao;const timers=new Map();let t=0;
 class E{constructor(tag){this.tag=tag;this.children=[];this.events={};this.attrs={};this.style={};this.isConnected=false;this.hover=false;const c=new Set();this.classList={add:x=>c.add(x),remove:x=>c.delete(x),contains:x=>c.has(x)};nodes.push(this)}append(...a){this.children.push(...a);a.forEach(n=>n.isConnected=true)}attachShadow(){this.shadow=new E('shadow');return this.shadow}setAttribute(k,v){this.attrs[k]=v}addEventListener(k,v){this.events[k]=v}remove(){this.removed=true;this.isConnected=false}matches(){return this.hover}focus(){this.events.focus?.()}getBoundingClientRect(){return {left:100,right:600,top:70,bottom:700}}}
 const doc={createElement:tag=>new E(tag),documentElement:new E('html'),events:{},addEventListener(k,v){this.events[k]=v}};const win={};win.top=win;
 const c={document:doc,window:win,__afModoGlobal:globalMode,location:{protocol:'https:'},AF_MontarPainelURL:async()=> 'chrome-extension://test/painel-global.html#token',MutationObserver:class{constructor(cb){mutacao=cb}observe(){}},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},chrome:{runtime:{getURL:p=>'chrome-extension://test/'+p},storage:{local:{get:async()=>({afPainelFlutuante:{nome:'Gabriel',ativo:true},afAlcancePainel:{http:true,https:true}})},onChanged:{addListener:f=>change=f}}},setTimeout:f=>{timers.set(++t,f);return t},clearTimeout:k=>timers.delete(k)};
 vm.createContext(c);vm.runInContext(fs.readFileSync(require('node:path').resolve(__dirname,'../extension/painel-flutuante.js'),'utf8'),c);
 return {nodes,doc,timers,change:(...args)=>change(...args),mutacao:()=>mutacao(),flush:()=>{const fs=[...timers.values()];timers.clear();fs.forEach(f=>f())}};
 }
 let f=flutuante();await new Promise(setImmediate);
 let box=f.nodes.find(n=>n.className==='painel'),button=f.nodes.find(n=>n.tag==='button');assert(box);
 box.events.mouseenter();assert(box.classList.contains('aberto'));assert.equal(f.nodes.filter(n=>n.tag==='iframe').length,1);
 box.events.mouseleave();box.events.mouseenter();assert.equal(f.timers.size,0);
 // A transient leave during iframe/page repaint must not collapse a hovered panel.
 box.hover=true;box.events.mouseleave();f.flush();assert(box.classList.contains('aberto'));
 box.events.focusout({relatedTarget:null});f.flush();assert(box.classList.contains('aberto'));
 const host=f.doc.documentElement.children[0];host.isConnected=false;f.mutacao();assert(host.isConnected);assert(box.classList.contains('aberto'));
 f.change({afPainelFlutuante:{newValue:{nome:'Gabriel',ativo:true}}},'local');assert.equal(f.nodes.filter(n=>n.tag==='iframe').length,1);
 // Full document reload uses the same per-tab session state.
 f=flutuante();await new Promise(setImmediate);box=f.nodes.find(n=>n.className==='painel');assert(box.classList.contains('aberto'));assert.equal(f.nodes.filter(n=>n.tag==='iframe').length,1);
 f.doc.events.mousemove({clientX:150,clientY:150});f.flush();assert(box.classList.contains('aberto'));
 f.doc.events.mousemove({clientX:20,clientY:20});f.flush();assert(!box.classList.contains('aberto'));
 box.events.mouseenter();box.events.keydown({key:'Escape'});assert(!box.classList.contains('aberto'));
 f.change({afPainelFlutuante:{newValue:{nome:'Gabriel',ativo:false}}},'local');assert(!storage.has('af-operacao:painel-aberto'));
 const global=flutuante(true);await new Promise(setImmediate);assert.equal(global.nodes.filter(n=>n.tag==='iframe').length,1);assert(global.nodes.find(n=>n.tag==='iframe').src.includes('painel-global.html'));
 global.change({afAlcancePainel:{newValue:{http:false,https:false}}},'local');assert(global.doc.documentElement.children.at(-1).removido || global.doc.documentElement.children.at(-1).removed);
 console.log('Flutuante: atualização com hover, foco transitório, remoção do host, recarga completa, saída e OFF passaram');
 const t=runtime({});await new Promise(setImmediate);
 t.doc.dispatchEvent({type:'fila:identidade',detail:{nome:'Gabriel'}});await t.choose('league-of-legends');
 assert.equal(t.saved.afTemaNotificacoes.nome,'Gabriel');assert.equal(t.saved.afTemaNotificacoes.tema.estilo,'hextech');
 t.doc.dispatchEvent({type:'fila:identidade',detail:{nome:'Abigail'}});await t.choose('fluminense');
 assert.equal(t.saved.afTemaNotificacoes.nome,'Abigail');assert.equal(t.saved.afTemaNotificacoes.tema.estilo,'tricolor');
 t.doc.dispatchEvent({type:'fila:identidade',detail:{nome:'Gabriel'}});assert.equal(t.root.dataset.temaId,'league-of-legends');
 assert.equal(t.saved.filaPreferenciasVisuais.porAnalista.Abigail,'fluminense');
 await t.choose('nuvens');assert.equal(t.root.dataset.temaEstilo,'nuvens');assert.equal(t.root.dataset.temaModo,'claro');assert.equal(t.saved.afTemaNotificacoes.tema.id,'nuvens');
 console.log('Temas: Nuvens, LoL e Fluminense preservados por analista e enviados às notificações do destinatário');
})().catch(e=>{console.error(e);process.exitCode=1});
