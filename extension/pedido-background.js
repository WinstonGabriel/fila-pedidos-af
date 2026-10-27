/* A fila serializa consultas e a confirmação visual: uma animação por evento neste navegador. */
let filaEfeito=Promise.resolve(),pedidoConsultadoEm=0,pedidoContexto='';
function serialEfeito(fn){const operar=()=>globalThis.FilaAutoReload ? FilaAutoReload.executar(fn) : fn();const p=filaEfeito.then(operar,operar);filaEfeito=p.catch(()=>{});return p;}
async function atualizarPedidoEfeito(){
 const {local:s}=await chrome.storage.local.get('local');
 if(!s?.codigo||!s?.token||!s.me){await chrome.storage.local.remove('afPedidoEfeitoUI');return;}
 const ctx=await contextoPublicoAvisos(s)+'|'+s.me;
 if(pedidoContexto===ctx&&Date.now()-pedidoConsultadoEm<2000)return;
 const d=await rpcAvisosBackground('fila_pedido_efeito',s);
 const {local:atual}=await chrome.storage.local.get('local');
 if(chaveAvisos(atual)!==chaveAvisos(s))return;
 if(d.nome!==s.me){await chrome.storage.local.remove('afPedidoEfeitoUI');return;}
 const {afEfeitoCursores:cursores={}}=await chrome.storage.local.get('afEfeitoCursores');
 const e=FilaEfeitoCore.escolherEvento(d,cursores[ctx]);
 cursores[ctx]=e.cursor;
 await chrome.storage.local.set({afEfeitoCursores:Object.fromEntries(Object.entries(cursores).slice(-32))});
 // Remote OFF also closes an animation that is currently on screen.
 await chrome.storage.local.set({afEfeitoConfig:d.config||{schema:1,ativo:false}});
 if(e.novo){
  const quando=Date.parse(d.pedido.quando);
  if(Number.isFinite(quando)&&Math.abs(Date.parse(d.servidor_em)-quando)<=90000)
   await chrome.storage.local.set({afPedidoEfeitoUI:{chave:ctx+'|'+d.pedido.evento_id,nome:d.nome,pedido:d.pedido.id,evento_id:d.pedido.evento_id,criado_em:Date.now(),config:d.config}});
 }
 pedidoContexto=ctx;pedidoConsultadoEm=Date.now();
}
async function consumirPedidoEfeito(msg){
 const s=await chrome.storage.local.get('afPedidoEfeitoUI');const p=s.afPedidoEfeitoUI;
 const {local:atual}=await chrome.storage.local.get('local');
 if(!p||p.chave!==msg.chave||p.consumido||Date.now()-p.criado_em>30000||!atual?.me||p.nome!==atual.me)return {ok:false};
 const ctx=await contextoPublicoAvisos(atual)+'|'+atual.me;
 if(p.chave!==ctx+'|'+p.evento_id)return {ok:false};
 await chrome.storage.local.set({afPedidoEfeitoUI:{...p,consumido:true}});
 return {ok:true};
}
chrome.runtime.onMessage.addListener((msg,sender,responder)=>{
 if(!['fila-atualizar-pedido-efeito','fila-consumir-pedido-efeito'].includes(msg?.tipo)||sender.id!==chrome.runtime.id)return;
 const local=sender.url?.startsWith(chrome.runtime.getURL(''))||/^https:\/\/af\.mateusmais\.com\.br\//.test(sender.url||'');
 if(!local&&!globalThis.AFOrigemPermitida)return;
 Promise.resolve(local||AFOrigemPermitida(sender.url||'')).then(ok=>ok?serialEfeito(()=>msg.tipo==='fila-consumir-pedido-efeito'?consumirPedidoEfeito(msg):atualizarPedidoEfeito().then(()=>({ok:true}))):{ok:false}).then(responder,()=>responder({ok:false}));return true;
});
