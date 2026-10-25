/* Serialização evita perder observações de várias abas. Nenhuma credencial vai para a página. */
(() => {
  'use strict';
  let serial=Promise.resolve(),consulta=null,ultimaConsulta=0;
  const contexto=s=>JSON.stringify([SUPABASE_URL,s?.codigo,s?.token]);
  async function credenciais(){
    const {local:s}=await chrome.storage.local.get('local');
    if(!s?.codigo||!s.token)return null;
    const x=await chrome.storage.session?.get('filaGestaoSessao');
    const coord=x?.filaGestaoSessao?.contexto===contexto(s)?x.filaGestaoSessao.valor:s.coord||null;
    return {...s,credencialCoord:coord};
  }
  async function rpc(fn,s,args={}){
    const c=new AbortController(),timer=setTimeout(()=>c.abort(),15000);
    try{
      const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`},body:JSON.stringify({p_codigo:s.codigo,p_token:s.token,p_coord:s.credencialCoord,...args}),signal:c.signal});
      if(!r.ok)throw Error('Conciliação aguardando conexão ou identificação.');
      return await r.json();
    }finally{clearTimeout(timer);}
  }
  const atual=async(s)=>contexto((await chrome.storage.local.get('local')).local)===contexto(s);
  async function armazenar(pedidos){
    const s=await credenciais();
    if(!s)return false;
    const {filaAFCaptura:old}=await chrome.storage.local.get('filaAFCaptura');
    const queue=old?.contexto===contexto(s)?old.pedidos||{}:{};
    for(const p of pedidos){
      if(!p||!/^\d{10,20}$/.test(p.id)||!FilaAFEvidencias.link(p.href,p.href))continue;
      queue[p.id]={id:p.id,href:p.href,data:String(p.data||'').slice(0,10),hora:String(p.hora||'').slice(0,5),valor:String(p.valor||'').slice(0,40),cat:String(p.cat||'').slice(0,120),estab:String(p.estab||'').slice(0,200),modal:String(p.modal||'').slice(0,120)};
    }
    // Não descarta silenciosamente pendências em caso de falha de rede.
    if(await atual(s))await chrome.storage.local.set({filaAFCaptura:{contexto:contexto(s),pedidos:queue}});
  }
  async function descarregar(){
    const s=await credenciais();if(!s)return;
    const {filaAFCaptura:old}=await chrome.storage.local.get('filaAFCaptura');
    if(old?.contexto!==contexto(s))return;
    const lote=Object.values(old.pedidos||{}).slice(0,100);
    if(!lote.length)return;
    await rpc('fila_pedidos_observar',s,{p_pedidos:lote});
    if(!await atual(s))return;
    for(const p of lote)delete old.pedidos[p.id];
    await chrome.storage.local.set({filaAFCaptura:old});
  }
  async function conferir(tabId){
    const s=await credenciais();if(!s||!await atual(s))return;
    const pedidos=await rpc('fila_pedidos_pendentes',s);
    if(!pedidos?.length||!await atual(s))return;
    const r=await chrome.tabs.sendMessage(tabId,{tipo:'fila-af-conferir',pedidos});
    if(r?.ok&&Array.isArray(r.resultados)&&await atual(s))await rpc('fila_pedidos_conciliar',s,{p_resultados:r.resultados});
  }
  chrome.runtime.onMessage.addListener((msg,sender,responder)=>{
    if(msg?.tipo!=='fila-af-captura'||sender.id!==chrome.runtime.id||!Array.isArray(msg.pedidos)||msg.pedidos.length>100)return;
    const af=/^https:\/\/af\.mateusmais\.com\.br\//.test(sender.url||'');
    const painel=sender.url?.startsWith(chrome.runtime.getURL(''));
    if(!af&&!painel)return;
    const pedido=serial.catch(()=>{}).then(()=>armazenar(msg.pedidos));
    serial=pedido;
    pedido.then(r=>responder({ok:r!==false}),()=>responder({ok:false}));
    // Mantém a gravação local serializada também durante o envio ao servidor.
    serial=pedido.then(descarregar).catch(()=>{});
    if(af&&sender.tab?.id&&!consulta&&Date.now()-ultimaConsulta>=10000){
      ultimaConsulta=Date.now();
      consulta=serial.then(()=>conferir(sender.tab.id)).catch(()=>{}).finally(()=>{consulta=null;});
    }
    return true;
  });
})();
