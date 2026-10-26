const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');const root=path.resolve(__dirname,'../extension'),tick=()=>new Promise(setImmediate);
const tema=JSON.parse(fs.readFileSync(root+'/catalogo-temas.json')).temas.find(t=>t.id==='fullmetal-alchemist');
const card=(nome='Gabriel',pedido='123')=>`<div class="card" data-card-analista data-analista="${nome}" data-pedido-atual="${pedido}"><h3>${nome}</h3><ul><li><a data-open="${pedido}">${pedido}</a><span>R$ 189,90 · Loja teste</span></li></ul><button data-concluir>Concluí → próximo</button></div>`;
async function runtime(){
 const dom=new JSDOM(`<main id="painel">${card()}${card('Rayla','456')}</main><div id="roySomLinha" hidden><button id="roySom"></button><small id="roySomEstado"></small></div>`,{url:'https://preview.invalid/',runScripts:'outside-only'}),w=dom.window;
 await new Promise(resolve=>{if(w.document.readyState!=='loading')resolve();else w.document.addEventListener('DOMContentLoaded',resolve,{once:true});});
 const saved={local:{me:'Gabriel',codigo:'A',token:'TOKEN-A'},afTemaNotificacoes:{nome:'Gabriel',tema},afEfeitoConfig:{schema:1,ativo:true,duracao_ms:3200}},listeners=[],timers=new Map(),shadows=new WeakMap();let seq=0,claims=0,agora=Date.now(),sons=0,contexts=0,aceitaSom=true;
 const NativeDate=w.Date;w.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[agora]));}static now(){return agora;}};
 w.setTimeout=(f,ms)=>{timers.set(++seq,{f,ms});return seq;};w.clearTimeout=n=>timers.delete(n);w.setInterval=()=>0;
 Object.defineProperty(w.document,'visibilityState',{value:'visible',writable:true,configurable:true});
 const gestos=[];const add=w.document.addEventListener.bind(w.document);w.document.addEventListener=(t,fn,o)=>{if(t==='pointerdown')gestos.push(fn);return add(t,fn,o);};
 const original=w.Element.prototype.attachShadow;w.Element.prototype.attachShadow=function(o){const s=original.call(this,o);shadows.set(this,s);return s;};
 const audioLog=[];class Audio{constructor(){contexts++;this.state='suspended';this.sampleRate=48000;this.currentTime=10;this.destination={};}resume(){if(aceitaSom==='pendente')return new Promise(()=>{});if(!aceitaSom)return Promise.reject(Error('autoplay indisponível'));this.state='running';this.onstatechange?.();return Promise.resolve();}createBuffer(_,n){return{getChannelData:()=>new Float32Array(n)}}createBufferSource(){const s={connect(){},disconnect(){},start(){sons++},stop(t){audioLog.push(t);if(t===undefined)s.onended?.();}};return s;}createBiquadFilter(){return{type:'',frequency:{value:0},connect(){},disconnect(){}}}createGain(){return{gain:{setValueAtTime:v=>audioLog.push(v),exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}}
 w.AudioContext=Audio;w.matchMedia=()=>({matches:false,addEventListener(){}});
 w.chrome={runtime:{sendMessage:async m=>{if(m.tipo==='fila-consumir-pedido-efeito')claims++;return{ok:true};}},storage:{local:{get:async k=>({[k]:structuredClone(saved[k])}),set:async data=>{const changes={};for(const[k,v]of Object.entries(data)){changes[k]={oldValue:saved[k],newValue:v};saved[k]=structuredClone(v);}listeners.forEach(fn=>fn(changes,'local'));}},onChanged:{addListener:fn=>listeners.push(fn)}}};
 for(const f of ['efeito-core.js','roy-alquimia.js','pedido-animacao.js'])w.eval(fs.readFileSync(root+'/'+f,'utf8'));
 await tick();await tick();
 const p=key=>({nome:'Gabriel',pedido:'123',chave:key,criado_em:agora,config:{schema:1}});
 return{dom,w,saved,shadows,timers,audioLog,p,claims:()=>claims,sons:()=>sons,contexts:()=>contexts,avancar:ms=>agora+=ms,aceitaSom:v=>aceitaSom=v,gesto:target=>gestos.forEach(fn=>fn({isTrusted:true,target})),emit:(c)=>listeners.forEach(fn=>fn(c,'local'))};
}
(async()=>{
 let n=0;async function test(s,f){await f();n++;console.log('PASS',s);}
 await test('Roy fica dentro da própria caixa, atrás do texto, com controles disponíveis e limpeza automática',async()=>{
  const r=await runtime(),{w}=r;try{
   await w.FilaPedidoEfeito.receber(r.p('card'));const own=w.document.querySelector('[data-analista="Gabriel"]'),other=w.document.querySelector('[data-analista="Rayla"]'),host=own.querySelector('[data-roy-efeito]');assert.ok(host);assert.equal(other.querySelector('[data-roy-efeito]'),null);assert.equal(host.getAttribute('aria-hidden'),'true');
   const shadow=r.shadows.get(host);assert.ok(shadow.querySelector('.selo svg'));assert.equal(shadow.querySelectorAll('.borda').length,4);assert.ok(shadow.querySelectorAll('.labareda').length<=24);assert.match(shadow.querySelector('style').textContent,/pointer-events:none/);assert.match(shadow.querySelector('style').textContent,/prefers-reduced-motion/);assert.equal(own.querySelector('[data-concluir]').disabled,false);assert.match(w.document.querySelector('.roy-anuncio').textContent,/Novo pedido 123 para Gabriel/);
   const css=fs.readFileSync(root+'/roy-alquimia.css','utf8');assert.match(css,/z-index:1/);assert.match(css,/not\(\[data-roy-efeito\]\)/);
   for(const{f}of [...r.timers.values()])f();assert.equal(own.querySelector('[data-roy-efeito]'),null);assert.equal(own.classList.contains('roy-transmutando'),false);
  }finally{r.dom.window.close();}
 });
 await test('evento aguarda a caixa correta sem ser consumido pela página do AF ou por outro pedido',async()=>{
  const r=await runtime();try{
   const own=r.w.document.querySelector('[data-analista="Gabriel"]');own.setAttribute('data-pedido-atual','antigo');await r.w.FilaPedidoEfeito.receber(r.p('pendente'));assert.equal(r.claims(),0);
   own.setAttribute('data-pedido-atual','123');r.w.FilaPedidoEfeito.aposRender();await tick();await tick();assert.equal(r.claims(),1);assert.ok(own.querySelector('[data-roy-efeito]'));
   await r.w.FilaPedidoEfeito.receber({...r.p('outro'),nome:'Rayla',pedido:'456'});assert.equal(r.claims(),1);
  }finally{r.dom.window.close();}
 });
 await test('estalo exige áudio habilitado, ocorre uma vez por evento e pode ser silenciado por analista',async()=>{
  const r=await runtime();try{
   await r.w.FilaPedidoEfeito.receber(r.p('sem-gesto'));assert.equal(r.sons(),0);
   r.gesto(r.w.document.getElementById('roySom'));assert.equal(r.contexts(),0,'o controle de som não deve ser pré-ativado pelo pointerdown');
   await r.w.document.getElementById('roySom').onclick();const antes=r.sons();assert.equal(r.contexts(),1);assert.ok(antes>=1);
   await r.w.FilaPedidoEfeito.receber(r.p('com-som'));assert.equal(r.sons(),antes+1);await r.w.FilaPedidoEfeito.receber(r.p('com-som'));assert.equal(r.sons(),antes+1);
   assert.ok(r.audioLog.includes(.22));assert.ok(r.audioLog.some(v=>typeof v==='number'&&v===10.085));
   await r.w.document.getElementById('roySom').onclick();const muted=r.sons();await r.w.FilaPedidoEfeito.receber(r.p('mutado'));assert.equal(r.sons(),muted);assert.equal(r.saved.filaRoySom.Gabriel,false);assert.ok(r.w.document.querySelector('[data-roy-efeito]'));
  }finally{r.dom.window.close();}
 });
 await test('uma nova renderização preserva o tempo restante sem repetir o som ou o consumo',async()=>{
  const r=await runtime();try{
   await r.w.document.getElementById('roySom').onclick();await r.w.FilaPedidoEfeito.receber(r.p('reatar'));const sons=r.sons(),host=r.w.document.querySelector('[data-roy-efeito]');r.avancar(850);
   r.w.document.getElementById('painel').innerHTML=card()+card('Rayla','456');r.w.FilaPedidoEfeito.aposRender();assert.equal(r.w.document.querySelector('[data-roy-efeito]'),host);assert.equal(host.style.getPropertyValue('--atraso'),'-850ms');assert.equal(r.sons(),sons);assert.equal(r.claims(),1);
   r.w.document.querySelector('[data-analista="Gabriel"]').setAttribute('data-pedido-atual','novo');r.w.FilaPedidoEfeito.aposRender();assert.equal(r.w.document.querySelector('[data-roy-efeito]'),null);
  }finally{r.dom.window.close();}
 });
 await test('bloqueio de áudio não interrompe o efeito e aba oculta, troca de nome e OFF encerram a animação',async()=>{
  const r=await runtime();try{
   r.aceitaSom(false);await r.w.document.getElementById('roySom').onclick();await r.w.FilaPedidoEfeito.receber(r.p('bloqueado'));assert.equal(r.sons(),0);assert.ok(r.w.document.querySelector('[data-roy-efeito]'));
   r.w.document.visibilityState='hidden';r.w.document.dispatchEvent(new r.w.Event('visibilitychange'));assert.equal(r.w.document.querySelector('[data-roy-efeito]'),null);const claims=r.claims();await r.w.FilaPedidoEfeito.receber(r.p('oculto'));assert.equal(r.claims(),claims);
   r.w.document.visibilityState='visible';await r.w.FilaPedidoEfeito.receber(r.p('off'));r.emit({afEfeitoConfig:{newValue:{schema:1,ativo:false}}});assert.equal(r.w.document.querySelector('[data-roy-efeito]'),null);
   r.saved.afEfeitoConfig={schema:1,ativo:false};await r.w.FilaPedidoEfeito.receber(r.p('ainda-off'));assert.equal(r.w.document.querySelector('[data-roy-efeito]'),null);
   r.saved.afEfeitoConfig={schema:1,ativo:true};await r.w.FilaPedidoEfeito.receber(r.p('nome'));r.saved.local.me='Rayla';r.emit({local:{oldValue:{me:'Gabriel'},newValue:r.saved.local}});assert.equal(r.w.document.querySelector('[data-roy-efeito]'),null);
  }finally{r.dom.window.close();}
 });
 await test('uma tentativa de áudio que fica suspensa não bloqueia o botão nem a chegada visual',async()=>{
  const r=await runtime();try{
   r.aceitaSom('pendente');const t=r.w.document.getElementById('roySom').onclick();for(const{f,ms}of [...r.timers.values()])if(ms===1200)f();await t;assert.equal(r.sons(),0);
   await r.w.FilaPedidoEfeito.receber(r.p('audio-suspenso'));assert.ok(r.w.document.querySelector('[data-roy-efeito]'));assert.equal(r.claims(),1);
  }finally{r.dom.window.close();}
 });
 console.log(`${n} verificações de Alquimia das Chamas passaram.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
