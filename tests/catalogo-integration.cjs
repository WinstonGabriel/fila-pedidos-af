const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const source = require('path').resolve(__dirname, '../extension') + '/';
const base = JSON.parse(fs.readFileSync(source+'catalogo-temas.json','utf8'));
const tick = () => new Promise(r=>setImmediate(r));
const checks = [];

function runtime(saved, initial = base) {
  let doc;
  class Element {
    constructor(tag='div') { this.tagName=tag.toUpperCase(); this.children=[]; this.parentElement=null; this.dataset={}; this.attributes={}; this.disabled=false; this._text=''; this.isConnected=true; this.styles=new Map(); this.style={setProperty:(k,v)=>this.styles.set(k,v),removeProperty:k=>this.styles.delete(k),getPropertyValue:k=>this.styles.get(k)||''}; const s=new Set(); this.classList={add:(...a)=>a.forEach(x=>s.add(x)),remove:(...a)=>a.forEach(x=>s.delete(x)),contains:x=>s.has(x),toggle:(x,y)=>{if(y??!s.has(x))s.add(x);else s.delete(x);},[Symbol.iterator]:()=>s[Symbol.iterator]()}; }
    set textContent(v){this._text=String(v);this.children=[];} get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
    append(...nodes){for(const n of nodes){if(n.fragment){this.append(...n.children);continue;}n.parentElement=this;this.children.push(n);}}
    replaceChildren(...nodes){this.children=[];this.append(...nodes);}
    setAttribute(k,v){this.attributes[k]=String(v);if(k==='open')this.open=true;}
    getAttribute(k){return this.attributes[k]??null;}
    hasAttribute(k){return Object.hasOwn(this.attributes,k);}
    removeAttribute(k){delete this.attributes[k];if(k==='open')this.open=false;}
    querySelectorAll(selector){const out=[];for(const c of this.children){if(selector==='[data-tema]'&&c.dataset.tema)out.push(c);out.push(...c.querySelectorAll(selector));}return out;}
    contains(n){return n===this||this.children.some(c=>c.contains(n));}
    closest(s){return s==='[data-tema]'?(this.dataset.tema?this:this.parentElement?.closest(s)):null;}
    focus(){doc.activeElement=this;}
    showModal(){this.open=true;}close(){this.open=false;}
    addEventListener(){}
  }
  const ids=new Map(),listeners=new Map(),storageListeners=[];
  const el = id => {if(!ids.has(id))ids.set(id,new Element(id.startsWith('btn')||id==='temaAtualizar'?'button':'div'));return ids.get(id);};
  const root=new Element('html'),body=new Element('body'),heading=new Element('h1');
  doc={readyState:'complete',documentElement:root,body,activeElement:body,getElementById:el,querySelector:s=>s==='header h1'?heading:s.startsWith('#')?el(s.slice(1)):null,createElement:t=>new Element(t),createDocumentFragment:()=>Object.assign(new Element(),{fragment:true}),addEventListener:(t,cb)=>{if(!listeners.has(t))listeners.set(t,[]);listeners.get(t).push(cb);},dispatchEvent:e=>{for(const cb of listeners.get(e.type)||[])cb(e);return true;}};
  const api={catalog:structuredClone(initial),offline:false,config:{schema:1,revisao:3,leitura_ms:5000,layout:{tema:'local'}},requests:[],failSave:false};
  const store={get:async k=>structuredClone({[k]:saved[k]}),set:async data=>{if(api.failSave&&data.filaPreferenciasVisuais){api.failSave=false;throw Error('storage failure');}const changes={};for(const[k,v]of Object.entries(data)){changes[k]={oldValue:saved[k],newValue:v};saved[k]=structuredClone(v);}queueMicrotask(()=>storageListeners.forEach(cb=>cb(changes,'local')));},remove:async k=>delete saved[k]};
  const context={document:doc,chrome:{storage:{local:store,session:{get:async()=>({}),set:async()=>{},remove:async()=>{}},onChanged:{addListener:cb=>storageListeners.push(cb)}}},crypto:webcrypto,TextEncoder,Uint8Array,CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},AbortController,setTimeout,clearTimeout,queueMicrotask,structuredClone,console,fetch:async(url,args)=>{if(api.offline)throw Error('offline');const fn=url.split('/').pop();api.requests.push(fn);assert(['fila_estado','fila_temas_catalogo','fila_descanso'].includes(fn),'Testes não podem alterar o banco');if(fn==='fila_descanso')return{ok:true,text:async()=>JSON.stringify({servidor_em:new Date().toISOString(),analistas:{}})};if(fn==='fila_temas_catalogo')return{ok:true,text:async()=>JSON.stringify(api.catalog)};return{ok:true,text:async()=>JSON.stringify({analistas:[],atribuicoes:[],usuarios:[{nome:'Gabriel',meu:true}],janela:{temas_catalogo_revisao:String(api.catalog.revisao),cliente_config_v1:JSON.stringify(api.config)},coord:false})};}};
  context.window=context;context.globalThis=context;
  vm.createContext(context);
  // A inicialização real por DOMContentLoaded do popup fica suspensa: os ciclos
  // são acionados explicitamente contra o RPC simulado, sem conexão ao AF.
  context.URL=URL;
  for(const f of ['config.example.js','aparencia.js','catalogo-temas.js','temas.js','suporte-icone.js','popup.js'])vm.runInContext(fs.readFileSync(source+f,'utf8'),context,{filename:f});
  vm.runInContext("local.codigo='equipe-teste';local.token='token-de-teste-123';local.me='Gabriel';",context);
  const sync=async()=>{const ok=await vm.runInContext('sync()',context);if(ok)await vm.runInContext('sincronizarCatalogo(remote.janela.temas_catalogo_revisao)',context);return ok;};
  const choose=async id=>{const b=el('temaOpcoes').querySelectorAll('[data-tema]').find(b=>b.dataset.tema===id);assert(b,'Tema ausente: '+id);el('temaOpcoes').onclick({target:b});await tick();};
  return{context,doc,root,el,api,sync,choose,saved,catalog:context.FilaCatalogoTemas};
}

module.exports = {runtime};
if (require.main === module) (async()=>{
  const saved={filaPreferenciasVisuais:{tema:'homem-aranha'}};
  let r=runtime(saved);await tick();assert.equal(r.root.dataset.temaId,'homem-aranha');checks.push('preferência anterior preservada');
  assert.equal(await r.sync(),true);assert.equal(r.catalog.estado().origem,'online');assert.equal(r.el('temaOpcoes').children.length,base.temas.length);assert.equal(r.root.dataset.temaId,'homem-aranha');checks.push('RPC → catálogo → seletor sem recarregar');const antes=r.api.requests.filter(x=>x==='fila_temas_catalogo').length;await r.sync();await r.sync();assert.equal(r.api.requests.filter(x=>x==='fila_temas_catalogo').length,antes);checks.push('catálogo completo só é baixado quando muda');
  await r.choose('dark-mode');assert.equal(r.root.style.getPropertyValue('--bg-principal'),'#20252b');assert.equal(saved.filaPreferenciasVisuais.tema,'dark-mode');checks.push('escolha e paleta salvas');
  const novo=structuredClone(base.temas.find(t=>t.id==='aurora'));Object.assign(novo,{id:'oceano-teste',nome:'<img src=x onerror=alert(1)>',descricao:'<script>teste</script>',cores:{...novo.cores,fundo:'#071a23'}});
  r.api.catalog={...structuredClone(base),revisao:base.revisao+1,temas:[...structuredClone(base.temas),novo]};
  r.el('temaDialogo').showModal();await r.sync();assert.equal(r.el('temaOpcoes').children.length,base.temas.length+1);assert.equal(r.root.dataset.temaId,'dark-mode');assert(r.el('temaOpcoes').textContent.includes(novo.nome));assert(!r.el('temaOpcoes').children.some(b=>b.tagName==='IMG'));checks.push('tema novo aparece automaticamente e texto é seguro');
  await r.choose('oceano-teste');assert.equal(r.root.style.getPropertyValue('--bg-principal'),'#071a23');
  r.api.catalog.revisao=base.revisao+2;r.api.catalog.temas.at(-1).cores.fundo='#091f29';await r.sync();assert.equal(r.root.style.getPropertyValue('--bg-principal'),'#091f29');checks.push('tema selecionado recebe alteração remota');
  const valido=structuredClone(r.api.catalog);
  r.api.catalog.revisao=base.revisao+3;r.api.catalog.temas.at(-1).cores.fundo='url(https://invalido.test/pixel)';await r.sync();assert.equal(r.catalog.estado().revisao,base.revisao+2);assert.equal(r.root.style.getPropertyValue('--bg-principal'),'#091f29');assert(r.el('temaCatalogoStatus').textContent.includes('indisponível'));checks.push('catálogo inválido mantém última cópia válida');
  r.api.catalog=structuredClone(base);await r.sync();assert.equal(r.catalog.estado().revisao,base.revisao+2);checks.push('resposta antiga não desfaz atualização');
  r.api.catalog=valido;await r.sync();
  r.api.config.layout.tema='fullmetal-alchemist';await r.sync();assert.equal(r.root.dataset.temaId,'fullmetal-alchemist');assert(r.el('temaOpcoes').children.every(b=>b.disabled));assert.equal(saved.filaPreferenciasVisuais.tema,'oceano-teste');assert.equal(r.root.dataset.temaPulso,'true');checks.push('tema da equipe preserva preferência pessoal e pulso');
  r.api.config.layout.tema='local';await r.sync();assert.equal(r.root.dataset.temaId,'oceano-teste');
  r.api.offline=true;assert.equal(await r.sync(),false);assert.equal(r.catalog.estado().origem,'salvo');checks.push('queda de rede mantém temas');
  r=runtime(saved);r.api.offline=true;await tick();await r.sync();await vm.runInContext('FilaCatalogoTemas.mudarContexto(contextoCliente())',r.context);assert.equal(r.root.dataset.temaId,'oceano-teste');assert.equal(r.root.style.getPropertyValue('--bg-principal'),'#091f29');checks.push('reabertura offline restaura catálogo e escolha');
  r.api.offline=false;r.api.catalog=structuredClone(valido);await r.sync();r.api.failSave=true;await r.choose('aurora');assert.equal(r.root.dataset.temaId,'oceano-teste');assert.equal(saved.filaPreferenciasVisuais.tema,'oceano-teste');checks.push('falha ao salvar reverte a escolha');
  r.api.catalog={...structuredClone(base),revisao:base.revisao+3};await r.sync();assert.equal(r.root.dataset.temaId,'padrao');assert.equal(saved.filaPreferenciasVisuais.tema,'oceano-teste');r.api.catalog={...structuredClone(valido),revisao:base.revisao+4};await r.sync();assert.equal(r.root.dataset.temaId,'oceano-teste');checks.push('tema temporariamente removido não apaga preferência');
  await r.catalog.mudarContexto('outra-equipe');assert.equal(r.catalog.estado().revisao,base.revisao);assert.equal(r.catalog.obter('oceano-teste'),undefined);checks.push('cache isolado por equipe e instalação');
  const bad=structuredClone(base);bad.temas.push(structuredClone(bad.temas[0]));assert.equal(r.catalog.normalizar(bad),null);assert.equal(r.catalog.normalizar({...base,schema:2}),null);assert.equal(r.catalog.normalizar({...base,revisao:-1}),null);assert.equal(r.catalog.validoId('url(javascript:alert(1))'),false);checks.push('identificadores, versões e duplicações validados');
  const css=fs.readFileSync(source+'temas.css','utf8');assert(css.includes('@keyframes pulsoAlquimico'));assert(css.includes('prefers-reduced-motion: reduce'));assert(css.includes('html[data-tema-modo="escuro"] .tipo-trabalho'));checks.push('pulso com redução de movimento e cobertura dos estados escuros');
  console.log(JSON.stringify({passaram:checks.length,verificacoes:checks},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
