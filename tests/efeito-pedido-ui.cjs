const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const dir=path.resolve(__dirname,'../extension'),catalogo=JSON.parse(fs.readFileSync(dir+'/catalogo-temas.json'));
 const nodes=[],timers=new Map(),listeners=[];let seq=0,claims=0;
 const saved={local:{me:'Gabriel'},afEfeitoConfig:{schema:1,ativo:true}};
 class E{constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.props={};this.style={setProperty:(k,v)=>this.props[k]=v};nodes.push(this)}append(...x){this.children.push(...x)}attachShadow(){return this.shadow=new E('shadow')}setAttribute(k,v){this.attrs[k]=v}remove(){this.removido=true}}
 const doc={body:new E('body'),readyState:'loading',visibilityState:'visible',events:{},createElement:t=>new E(t),addEventListener(k,v){this.events[k]=v}};
 const ctx={document:doc,Date,console,setInterval:()=>0,setTimeout:f=>{timers.set(++seq,f);return seq},clearTimeout:k=>timers.delete(k),chrome:{runtime:{getURL:p=>'chrome-extension://ext/'+p,sendMessage:async m=>{if(m.tipo==='fila-consumir-pedido-efeito'){claims++;return{ok:true}}return{ok:true}}},storage:{local:{get:async k=>({[k]:saved[k]})},onChanged:{addListener:f=>listeners.push(f)}}}};
 vm.createContext(ctx);for(const file of ['efeito-core.js','pedido-animacao.js'])vm.runInContext(fs.readFileSync(dir+'/'+file,'utf8'),ctx);
 const base={nome:'Gabriel',pedido:'123',criado_em:Date.now(),config:{schema:1}};
 for(const t of catalogo.temas){saved.afTemaNotificacoes={nome:'Gabriel',tema:t};const p={...base,chave:t.id};await ctx.FilaPedidoEfeito.receber(p);const host=doc.body.children.at(-1);assert(host.shadow);const box=host.shadow.children[1];assert(box.className.includes(ctx.FilaEfeitoCore.normalizar(saved.afEfeitoConfig,t,'Gabriel').efeito));assert.equal(box.attrs.role,'status');assert.equal(box.children[2].textContent,'Pedido 123');assert(host.shadow.children[0].textContent.includes('prefers-reduced-motion'));assert(host.shadow.children[0].textContent.includes('pointer-events:none'));
  const count=claims;await ctx.FilaPedidoEfeito.receber(p);assert.equal(claims,count);
 }
 let count=claims;await ctx.FilaPedidoEfeito.receber({...base,chave:'outro',nome:'Rayla'});assert.equal(claims,count);
 doc.visibilityState='hidden';await ctx.FilaPedidoEfeito.receber({...base,chave:'oculto'});assert.equal(claims,count);doc.visibilityState='visible';
 const last=doc.body.children.at(-1);listeners[0]({afEfeitoConfig:{newValue:{schema:1,ativo:false}}},'local');assert(last.removido);
 saved.afEfeitoConfig={schema:1,ativo:false};const hosts=doc.body.children.length;await ctx.FilaPedidoEfeito.receber({...base,chave:'desativado'});assert.equal(doc.body.children.length,hosts);
 console.log('Interface: 13 animações por tema, nome e pedido, acessibilidade, não bloquear cliques, repetição, usuário alheio, aba oculta e OFF remoto passaram');
})().catch(e=>{console.error(e);process.exitCode=1});
