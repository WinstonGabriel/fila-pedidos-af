/* Uma consulta por instalação/contexto. Dados sem mudanças não voltam pela rede. */
(() => {
  'use strict';
  const entradas=new Map();
  const TTL=5000,CHAVE='filaSincronizacaoCache';
  let geracao=0;
  const contexto=(s,coord)=>JSON.stringify([SUPABASE_URL,s.codigo,s.token,coord||null]);
  const chave=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))),b=>b.toString(16).padStart(2,'0')).join('');
  async function identidade(coord,esperado){
    const {local:s}=await chrome.storage.local.get('local');
    if(!s?.codigo||!s.token)throw Error('Informe o código da equipe na extensão.');
    if(esperado&&esperado!==contexto(s,coord))throw Error('A identificação mudou. Atualize o painel.');
    return {s,contexto:contexto(s,coord)};
  }
  async function rpc(s,coord,versoes){
    const liberar=globalThis.FilaAutoReload?.iniciarOperacao();
    const c=new AbortController(),timer=setTimeout(()=>c.abort(),35000);
    try{
      const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/fila_sincronizar`,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`},body:JSON.stringify({p_codigo:s.codigo,p_token:s.token,p_coord:coord||null,p_versoes:versoes}),signal:c.signal});
      const d=await r.json();
      if(!r.ok)throw Error(d?.message||'Não foi possível sincronizar a equipe.');
      if(!d||!d.versoes||!d.dados||!Number.isFinite(Date.parse(d.servidor_em)))throw Error('Resposta de sincronização inválida.');
      return d;
    }catch(e){if(c.signal.aborted)throw Error('O banco demorou para responder. Aguarde a próxima sincronização.');throw e;}
    finally{clearTimeout(timer);liberar?.();}
  }
  function montar(e){return {...e.blocos.estado,descansos:e.blocos.descansos,avisos:e.blocos.avisos,servidor_em:new Date(Date.parse(e.servidor_em)+Math.max(0,Date.now()-e.em)).toISOString()};}
  async function obter({forcar=false,coord=null,esperado=null}={}){
    const id=await identidade(coord,esperado),g=geracao,k=await chave(id.contexto);
    if(g!==geracao)throw Error('A identificação mudou. Atualize o painel.');
    let e=entradas.get(k);
    if(!e){
      e={blocos:{},versoes:{},em:0,promessa:null};entradas.set(k,e);
      // Apenas a cópia da sessão atual: uma nova sessão autentica novamente.
      e.restauracao=(async()=>{
        try{const salvo=(await chrome.storage.session?.get(CHAVE))?.[CHAVE];if(salvo?.chave===k&&salvo.blocos?.estado){e.blocos=salvo.blocos;e.versoes=salvo.versoes||{};}}catch{/* Falha no cache não impede consulta ao servidor. */}
      })();
    }
    await e.restauracao;
    await identidade(coord,id.contexto);
    if(g!==geracao)throw Error('A identificação mudou. Atualize o painel.');
    if(e.promessa){
      if(!forcar)return e.promessa;
      await e.promessa.catch(()=>{});
      return obter({forcar:true,coord,esperado});
    }
    if(!forcar&&e.em&&Date.now()-e.em<TTL)return montar(e);
    e.promessa=(async()=>{
      const r=await rpc(id.s,coord,e.versoes);
      // Revalidar após a rede antes de armazenar qualquer resposta.
      await identidade(coord,id.contexto);
      if(g!==geracao)throw Error('A identificação mudou. Atualize o painel.');
      const blocos={...e.blocos,...r.dados};
      if(!blocos.estado||!blocos.descansos||!blocos.avisos)throw Error('Sincronização incompleta. Abra novamente o painel.');
      e.blocos=blocos;e.versoes=r.versoes;e.servidor_em=r.servidor_em;e.em=Date.now();
      try{await chrome.storage.session?.set({[CHAVE]:{chave:k,blocos:e.blocos,versoes:e.versoes}});}catch{/* Cache em memória permanece válido. */}
      return montar(e);
    })().catch(e2=>{e.em=0;throw e2;});
    const promessa=e.promessa;
    try{return await promessa;}finally{if(e.promessa===promessa)e.promessa=null;}
  }
  function invalidar(){for(const e of entradas.values())e.em=0;}
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&changes.local){
      const c=changes.local;
      if(JSON.stringify([c.oldValue?.codigo,c.oldValue?.token,c.oldValue?.coord])!==JSON.stringify([c.newValue?.codigo,c.newValue?.token,c.newValue?.coord])){geracao++;entradas.clear();chrome.storage.session?.remove(CHAVE).catch(()=>{});}
    }
    if(area==='session'&&changes.filaGestaoSessao){geracao++;entradas.clear();chrome.storage.session?.remove(CHAVE).catch(()=>{});}
  });
  globalThis.FilaSincronizacao=Object.freeze({obter,invalidar});
  chrome.runtime.onMessage.addListener((msg,sender,responder)=>{
    if(msg?.tipo!=='fila-sincronizar'||sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL('')))return;
    if(typeof msg.contexto!=='string'||msg.contexto.length>4096||!(msg.coord==null||typeof msg.coord==='string'))return;
    obter({forcar:msg.forcar===true,coord:msg.coord||null,esperado:msg.contexto}).then(async dados=>{
      // A página AF recebe apenas a projeção de avisos, nunca este estado completo.
      const {local:s}=await chrome.storage.local.get('local');
      if(contexto(s,msg.coord)!==msg.contexto)throw Error('A identificação mudou.');
      await publicarAvisosBackground(dados.avisos,s);
      responder({ok:true,dados});
    }).catch(e=>responder({ok:false,mensagem:e.message}));
    return true;
  });
})();
