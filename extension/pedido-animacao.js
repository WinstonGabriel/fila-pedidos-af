/* Aviso decorativo do próprio pedido: isolado do AF, sem captura de clique nem abertura automática. */
(() => {
 'use strict';
 if(globalThis.FilaPedidoEfeito)return;
 let host,timer,lendo=false,ultimaChave='',rodando=null;
 let superficieVisivel=typeof IntersectionObserver!=='function';
 const visivel=()=>document.visibilityState!=='hidden'&&superficieVisivel;
 if(typeof IntersectionObserver==='function'){const observer=new IntersectionObserver(es=>{superficieVisivel=es.some(e=>e.isIntersecting);if(superficieVisivel)atualizar();});observer.observe(document.documentElement);}
 const desenhos={
  alquimia:'<svg viewBox="0 0 120 120"><g fill="none" stroke="currentColor" stroke-width="2"><circle cx="60" cy="60" r="48"/><circle cx="60" cy="60" r="39"/><path d="m60 15 40 68H20zM60 105 20 37h80z"/><circle cx="60" cy="60" r="15"/></g></svg>',
  hextech:'<svg viewBox="0 0 120 120"><path d="m60 9 35 26-7 48-28 28-28-28-7-48z" fill="currentColor" opacity=".2"/><g fill="none" stroke="currentColor" stroke-width="3"><path d="m60 9 35 26-7 48-28 28-28-28-7-48zM60 9 45 44l15 67 15-67zM25 35l20 9h30l20-9M32 83l28-20 28 20"/></g></svg>',
  teia:'<svg viewBox="0 0 120 120"><g fill="none" stroke="currentColor" stroke-width="2"><path d="M60 5v110M5 60h110M21 21l78 78M21 99l78-78"/><path d="M60 15q15 20 32 13-7 17 13 32-20 15-13 32-17-7-32 13-15-20-32-13 7-17-13-32 20-15 13-32 17 7 32-13zM60 34q8 11 18 8-3 10 8 18-11 8-8 18-10-3-18 8-8-11-18-8 3-10-8-18 11-8 8-18 10 3 18-8z"/></g></svg>',
  gelo:'<svg viewBox="0 0 120 120"><g fill="none" stroke="currentColor" stroke-width="3"><path d="M60 8v104M15 34l90 52M15 86l90-52M45 18l15 14 15-14M45 102l15-14 15 14M18 49l20-5-4-20M102 71l-20 5 4 20M18 71l20 5-4 20M102 49l-20-5 4-20"/></g></svg>',
  chamas:'<svg viewBox="0 0 120 120"><path d="M62 9c12 30-6 31 13 48 9-9 7-18 7-18s28 29 14 53c-17 30-64 22-70-5-5-20 9-38 9-38s0 20 10 18c13-15 0-32 17-58z" fill="currentColor" opacity=".8"/><path d="M60 60c15 22 22 23 15 37-8 15-28 11-30-2-3-14 10-16 15-35z" fill="#fff" opacity=".85"/></svg>',
  caveira:'<svg viewBox="0 0 120 120"><path d="M60 15c-45 0-52 60-24 68v20h48V83c28-8 21-68-24-68z" fill="none" stroke="currentColor" stroke-width="4"/><g fill="currentColor"><ellipse cx="42" cy="58" rx="11" ry="13"/><ellipse cx="78" cy="58" rx="11" ry="13"/><path d="m60 73-6 12h12z"/></g><path d="M48 89v14m12-14v14m12-14v14" stroke="currentColor" stroke-width="3"/></svg>',
  tricolor:'<svg viewBox="0 0 120 120"><path d="m21 22 78 0-7 52-32 33-32-33z" fill="#174d37" stroke="#f5ecd8" stroke-width="3"/><path d="m45 23 25 0-15 70-15-16z" fill="#a12947"/><path d="m75 23 7 0-15 75-7 7z" fill="#f5ecd8"/><path d="m48 47 7 6-3 9h-9l-3-9z" fill="#fff"/></svg>',
  aurora:'<svg viewBox="0 0 120 120"><path d="M15 87Q30 10 48 66T90 24M29 103Q45 24 66 76T110 39" fill="none" stroke="currentColor" stroke-width="14" opacity=".5"/><path d="m29 24 3 8 8 3-8 3-3 8-3-8-8-3 8-3zM87 82l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="currentColor"/></svg>',
  pulso:'<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="39" fill="none" stroke="currentColor" stroke-width="3"/><path d="m39 60 14 14 29-30" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
 };
 const css=`:host{all:initial!important;position:fixed!important;top:18px!important;right:18px!important;z-index:2147483647!important;width:min(360px,calc(100vw - 36px))!important;pointer-events:none!important;font:14px/1.45 system-ui,sans-serif!important}*{box-sizing:border-box}.aviso{position:relative;border:1px solid var(--efeito-cor);border-radius:18px;padding:17px 105px 17px 18px;color:var(--efeito-texto);background:var(--efeito-fundo);box-shadow:0 10px 36px #0004;isolation:isolate;animation:chegada 380ms ease-out}strong{display:block;font-size:17px;margin-bottom:4px}.pedido{display:block;font-weight:700;overflow-wrap:anywhere}.meta{opacity:.8;font-size:12px}.arte{position:absolute;right:7px;top:50%;width:90px;height:90px;margin-top:-45px;color:var(--efeito-cor);filter:drop-shadow(0 0 6px var(--efeito-cor));animation:respirar 1500ms ease-in-out 2}.arte svg,.arte img{width:100%;height:100%;display:block}.alquimia .arte{animation:girar 3000ms ease-out 1}.nuvens .arte{filter:drop-shadow(0 6px 6px #316b8d44);animation:flutuar 1500ms ease-in-out 2}.hextech .arte{animation:cristal 1500ms ease-in-out 2}.tricolor .arte{animation:bandeira 1500ms ease-in-out 2}.aurora .arte{animation:flutuar 1500ms ease-in-out 2}.teia .arte{animation:tecer 800ms ease-out 1}.chamas .arte{transform-origin:bottom;animation:respirar 1500ms ease-in-out 2}.particula{position:absolute;left:var(--x);top:80%;height:5px;width:5px;border-radius:50%;background:var(--efeito-cor);opacity:0;animation:subir 2200ms ease-out 1;animation-delay:var(--delay);z-index:-1}@keyframes chegada{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}@keyframes respirar{0%,100%{opacity:.7;transform:scale(.94)}50%{opacity:1;transform:scale(1.06)}}@keyframes girar{from{opacity:0;transform:rotate(-150deg) scale(.6)}to{opacity:1;transform:none}}@keyframes flutuar{0%,100%{transform:translateY(4px)}50%{transform:translateY(-6px)}}@keyframes cristal{0%,100%{transform:rotate(-5deg) scale(.95)}50%{transform:rotate(5deg) scale(1.05)}}@keyframes bandeira{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}@keyframes tecer{from{opacity:0;transform:scale(.25) rotate(-20deg)}to{opacity:1;transform:none}}@keyframes subir{0%{opacity:0;transform:translateY(0)}20%{opacity:.6}100%{opacity:0;transform:translateY(-85px)}}@media(prefers-reduced-motion:reduce){.aviso,.arte,.particula{animation:none!important}.particula,.arte{display:none}.aviso{padding-right:18px}}`;
 function fechar(){clearTimeout(timer);host?.remove();host=null;rodando=null;}
 function mostrar(p,o,tema){
  fechar();if(!document.body)return;
  host=document.createElement('div');const r=host.attachShadow({mode:'closed'}),style=document.createElement('style');style.textContent=css;
  for(const [k,v] of Object.entries({cor:o.cor,fundo:o.fundo,texto:o.texto}))host.style.setProperty('--efeito-'+k,v);
  const box=document.createElement('section');box.className='aviso '+o.efeito;box.setAttribute('role','status');box.setAttribute('aria-live','polite');
  const title=document.createElement('strong');title.textContent='Novo pedido para você';
  const nome=document.createElement('span');nome.className='meta';nome.textContent=p.nome+' · AF Operação';
  const id=document.createElement('span');id.className='pedido';id.textContent='Pedido '+p.pedido;
  const art=document.createElement('div');art.className='arte';art.setAttribute('aria-hidden','true');
  if(o.efeito==='nuvens'){const img=document.createElement('img');img.src=chrome.runtime.getURL('assets/nuvem-3d.svg');img.alt='';art.append(img);}else art.innerHTML=desenhos[o.efeito]||desenhos.pulso;
  box.append(title,nome,id,art);
  for(let i=0;i<6;i++){const n=document.createElement('i');n.className='particula';n.style.setProperty('--x',(15+i*14)+'%');n.style.setProperty('--delay',(i*80)+'ms');n.setAttribute('aria-hidden','true');box.append(n);}
  r.append(style,box);document.body.append(host);rodando={p,o,tema};timer=setTimeout(fechar,o.duracao);
 }
 async function receber(p){
  if(lendo||!p||p.consumido||p.chave===ultimaChave||!visivel()||Date.now()-p.criado_em>30000)return;
  lendo=true;
  try{
   const {local:s}=await chrome.storage.local.get('local');if(!s?.me||p.nome!==s.me)return;
   const {afTemaNotificacoes:t}=await chrome.storage.local.get('afTemaNotificacoes');
   const {afEfeitoConfig:c}=await chrome.storage.local.get('afEfeitoConfig');
   const o=FilaEfeitoCore.normalizar(c||p.config,t?.nome===p.nome?t.tema:null,p.nome);
   const resposta=await chrome.runtime.sendMessage({tipo:'fila-consumir-pedido-efeito',chave:p.chave});
   ultimaChave=p.chave;
   if(resposta?.ok&&o.ativo&&visivel())mostrar(p,o,t?.nome===p.nome?t.tema:null);
  }catch{}finally{lendo=false;}
 }
 async function atualizar(){
  if(!visivel())return;
  try{await chrome.runtime.sendMessage({tipo:'fila-atualizar-pedido-efeito'});const s=await chrome.storage.local.get('afPedidoEfeitoUI');await receber(s.afPedidoEfeitoUI);}catch{}
 }
 chrome.storage.onChanged.addListener((c,area)=>{
  if(area!=='local')return;
  if(c.afPedidoEfeitoUI)receber(c.afPedidoEfeitoUI.newValue);
  if(c.local&&rodando&&(c.local.newValue?.me!==rodando.p.nome||c.local.oldValue?.token!==c.local.newValue?.token||c.local.oldValue?.codigo!==c.local.newValue?.codigo))fechar();
  if(c.afEfeitoConfig&&rodando){const x=FilaEfeitoCore.normalizar(c.afEfeitoConfig.newValue,rodando.tema,rodando.p.nome);if(!x.ativo)fechar();}
 });
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')fechar();else atualizar();});
 globalThis.FilaPedidoEfeito=Object.freeze({atualizar,receber});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',atualizar,{once:true});else atualizar();
 setInterval(atualizar,5000);
})();
