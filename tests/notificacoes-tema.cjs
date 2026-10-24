const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
const dados=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../extension/catalogo-temas.json'),'utf8'));
const nodes=[];let alterar;const salvo={local:{me:'Gabriel'}};
class E{
 constructor(tag){this.tag=tag;this.attrs={};this.children=[];this.isConnected=true;this.valores=new Map();this.style={setProperty:(k,v)=>this.valores.set(k,v)};nodes.push(this)}
 append(...a){this.children.push(...a)}attachShadow(){return this.shadow=new E('shadow')}setAttribute(k,v){this.attrs[k]=v}removeAttribute(k){delete this.attrs[k]}remove(){this.isConnected=false}contains(el){return this===el || this.children.some(c=>c.contains(el))}querySelectorAll(s){return this.children.flatMap(c=>[...(s==='.'+c.className?[c]:[]),...c.querySelectorAll(s)])}querySelector(s){return this.querySelectorAll(s)[0]}
}
const doc={body:new E('body'),createElement:t=>new E(t)};
const c={document:doc,console,setTimeout:()=>1,clearTimeout:()=>{},chrome:{runtime:{sendMessage:async()=>({ok:true})},storage:{local:{get:async key=>({[key]:salvo[key]}),set:async d=>Object.assign(salvo,d)},onChanged:{addListener:f=>alterar=f}}}};
vm.createContext(c);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../extension/baloes.js'),'utf8'),c);await new Promise(setImmediate);
const lol=dados.temas.find(t=>t.id==='league-of-legends'),flu=dados.temas.find(t=>t.id==='fluminense');
salvo.afTemaNotificacoes={nome:'Gabriel',tema:lol};alterar({afTemaNotificacoes:{}},'local');await new Promise(setImmediate);
c.FilaBaloes.mostrar('Status atualizado: Abigail','ON');
const host=nodes.find(n=>Object.hasOwn(n.attrs,'data-fila-avisos'));
assert.equal(host.attrs['data-tema'],'hextech');assert.equal(host.valores.get('--av-fundo'),lol.cores.fundo);
// The notification subject is Abigail; theme remains the recipient Gabriel's.
assert.equal(host.attrs['data-tema'],'hextech');
salvo.afTemaNotificacoes={nome:'Gabriel',tema:flu};alterar({afTemaNotificacoes:{}},'local');await new Promise(setImmediate);
assert.equal(host.attrs['data-tema'],'tricolor');assert.equal(host.valores.get('--av-fundo'),flu.cores.fundo);
assert(host.shadow.children[0].textContent.includes(':host([data-tema=hextech])'));
assert(host.shadow.children[0].textContent.includes(':host([data-tema=tricolor])'));
c.FilaBaloes.aplicarTema({...lol,cores:{...lol.cores,fundo:'url(https://invalido.test/pixel)'}});
assert.equal(host.valores.get('--av-fundo'),flu.cores.fundo);
const nuvens=dados.temas.find(t=>t.id==='nuvens');salvo.afTemaNotificacoes={nome:'Gabriel',tema:nuvens};alterar({afTemaNotificacoes:{}},'local');await new Promise(setImmediate);assert.equal(host.attrs['data-tema'],'nuvens');assert.equal(host.valores.get('--av-texto'),'#243d50');assert(host.shadow.children[0].textContent.includes(':host([data-tema=nuvens])'));
salvo.local.me='Abigail';alterar({local:{}},'local');await new Promise(setImmediate);assert.equal(host.attrs['data-tematizado'],undefined);
console.log('Notificações: Shadow DOM tematizado, atualização imediata, tema do destinatário, isolamento de usuário e rejeição de CSS remoto passaram');
})().catch(e=>{console.error(e);process.exitCode=1});
