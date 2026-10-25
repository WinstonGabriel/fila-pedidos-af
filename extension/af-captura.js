/* Captura independente do painel lateral: inclusive linhas que entram e saem entre leituras. */
(() => {
  'use strict';
  if (location.origin !== 'https://af.mateusmais.com.br' || window.top !== window) return;
  let enviando = false;
  const fila = new Map();
  function guardar(p) { if(p) fila.set(p.id,p); }
  async function enviar() {
    if (enviando) return;
    enviando = true;
    const lote = [...fila.values()].slice(0,100);
    try {
      const r = await chrome.runtime.sendMessage({ tipo:'fila-af-captura', pedidos:lote });
      if(r?.ok) for(const p of lote) if(fila.get(p.id)===p) fila.delete(p.id);
    } catch { /* O próximo ciclo repete; a fila do background também é persistente. */ }
    finally { enviando=false; }
  }
  function ler() {
    if(location.pathname==='/') FilaAFEvidencias.lista(document,location.href).forEach(guardar);
  }
  const observer = new MutationObserver(records=>{
    if(location.pathname!=='/')return;
    for(const m of records){
      for(const node of [...m.addedNodes,...m.removedNodes]){
        if(node.nodeType!==1)continue;
        const rows=node.matches('tr')?[node]:[...node.querySelectorAll('tr')];
        rows.forEach(r=>guardar(FilaAFEvidencias.linha(r,location.href)));
      }
      const row=m.target.nodeType===1?m.target.closest('tr'):m.target.parentElement?.closest('tr');
      if(row)guardar(FilaAFEvidencias.linha(row,location.href));
    }
    ler();
    enviar();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  chrome.runtime.onMessage.addListener((msg,sender,responder)=>{
    if(msg?.tipo!=='fila-af-conferir'||sender.id!==chrome.runtime.id)return;
    if(!Array.isArray(msg.pedidos)||msg.pedidos.length>5)return;
    (async()=>{
      const resultados=[];
      for(const p of msg.pedidos){
        if(!/^\d{10,20}$/.test(p.id)||!FilaAFEvidencias.link(p.href,location.href))continue;
        const controle=new AbortController(),timer=setTimeout(()=>controle.abort(),10000);
        try{
          const r=await fetch(p.href,{credentials:'same-origin',signal:controle.signal,redirect:'error',cache:'no-store'});
          if(!r.ok)throw Error('Consulta indisponível');
          const doc=new DOMParser().parseFromString(await r.text(),'text/html');
          resultados.push({...FilaAFEvidencias.detalhe(doc,p.href,p.id),consulta_token:p.consulta_token});
        }catch{resultados.push({id:p.id,href:p.href,consulta_token:p.consulta_token,situacao:'indisponivel'});}
        finally{clearTimeout(timer);}
      }
      return resultados;
    })().then(resultados=>responder({ok:true,resultados}),()=>responder({ok:false}));
    return true;
  });
  ler();enviar();
  const timer=setInterval(()=>{ler();enviar();},5000);
  window.addEventListener('pagehide',e=>{if(!e.persisted){observer.disconnect();clearInterval(timer);}});
})();
