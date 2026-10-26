/* Alquimia das Chamas: SVG e CSS locais, sem imagens, bibliotecas ou áudio remoto. */
(() => {
 'use strict';
 if(globalThis.FilaRoyAlquimia)return;
 let ativo=null,timer=0,audio=null,fontes=new Set(),usuario='',temaRoy=false,som=true,preferencias={},geracao=0,anuncio=null;
 const midia=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):null;
 const circulo=`<svg class="runas" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg"><g stroke="currentColor" stroke-linejoin="round"><circle cx="100" cy="100" r="90" stroke-width="1.4"/><circle cx="100" cy="100" r="83" stroke-width=".8"/><circle cx="100" cy="100" r="68" stroke-width="1.2"/><path d="M100 26 164 137H36ZM100 174 36 63H164Z" stroke-width="1.2"/><circle cx="100" cy="100" r="33" stroke-width=".8"/><path d="M100 8v17m0 150v17M8 100h17m150 0h17M35 35l12 12m106 106 12 12M35 165l12-12m106-106 12-12"/><path d="m68 20 3 7m58 146 3 7M20 68l7 3m146 58 7 3m-160 0 7-3m146-58 7-3M68 180l3-7m58-146 3-7" stroke-width="3"/><path d="M100 65c8 15-1 22 9 29 6-5 7-12 7-12 19 20 14 45-9 49-24 4-36-18-24-36 0 10 4 13 8 11 8-11-1-22 9-41Z" fill="currentColor" fill-opacity=".28" stroke-width="1.5"/><path d="M96 96c1 13-8 15-6 23 2 10 17 12 22 3 5-9-3-14-4-20-1 8-6 9-12-6Z" stroke-width="1"/></g></svg>`;
 const fogo=`<svg viewBox="0 0 40 70" aria-hidden="true"><defs><linearGradient id="f" x1="0" y1="1" x2=".25" y2="0"><stop stop-color="#b91912"/><stop offset=".42" stop-color="#ff5718"/><stop offset=".76" stop-color="#ffb343"/><stop offset="1" stop-color="#fff2c0"/></linearGradient></defs><path d="M19 69C-8 62 6 42 10 32c-1 13 3 15 7 9C27 25 14 20 24 1c-2 20 10 24 6 39 7-5 5-12 5-12 12 24 1 42-16 41Z" fill="url(#f)"/><path d="M20 68C8 62 17 53 17 43c10 11 3 15 8 18 3-3 3-8 3-8 6 9-1 16-8 15Z" fill="#ffeab1" opacity=".88"/></svg>`;
 const css=`:host{position:absolute!important;inset:0!important;display:block!important;z-index:0!important;pointer-events:none!important;border-radius:inherit;overflow:hidden;contain:layout paint;--tempo:3200ms;--atraso:0ms}*{box-sizing:border-box;pointer-events:none!important}.cena{position:absolute;inset:0;border-radius:inherit;overflow:hidden;animation:sumir var(--tempo) linear both;animation-delay:var(--atraso)}.selo{position:absolute;left:50%;top:49%;width:min(245px,75%);aspect-ratio:1;transform:translate(-50%,-50%);color:#ffad62;opacity:0;animation:surgir var(--tempo) ease-out both;animation-delay:var(--atraso)}.runas{width:100%;height:100%;display:block;filter:drop-shadow(0 0 4px #ff6231);animation:girar var(--tempo) cubic-bezier(.12,.7,.2,1) both;animation-delay:var(--atraso)}.clarear{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 58%,#fff9df70 0,#bdefff20 28%,transparent 62%);opacity:0;animation:ignicao var(--tempo) linear both;animation-delay:var(--atraso)}.moldura{position:absolute;inset:1px;border-radius:inherit;border:1px solid #ffa33e;box-shadow:inset 0 0 12px #ff6d223b;opacity:0;animation:contorno var(--tempo) ease-out both;animation-delay:var(--atraso)}.rastro{position:absolute;inset:2px;width:calc(100% - 4px);height:calc(100% - 4px);opacity:0;animation:contorno var(--tempo) ease-out both;animation-delay:var(--atraso)}.rastro rect{fill:none;stroke:#ffcf78;stroke-width:1.4;stroke-dasharray:14 4 3 8 10 12;animation:orbitar var(--tempo) linear both;animation-delay:var(--atraso)}.borda{position:absolute;overflow:hidden;opacity:0;animation:arder var(--tempo) linear both;animation-delay:var(--atraso)}.baixo,.cima{left:0;right:0;height:42px}.baixo{bottom:0}.cima{top:0;transform:rotate(180deg)}.esquerda,.direita{top:0;bottom:0;width:32px}.esquerda{left:0}.direita{right:0;transform:rotate(180deg)}.labareda{position:absolute;bottom:-11px;left:var(--x);width:var(--w);height:64px;transform-origin:50% 100%;opacity:.8;animation:labareda var(--tempo) ease-in-out both;animation-delay:calc(var(--atraso) - var(--fase))}.labareda svg{display:block;width:100%;height:100%;filter:drop-shadow(0 0 3px #ff8b29)}.lateral{left:-14px;bottom:auto;top:var(--x);width:33px;height:47px;transform:rotate(90deg);animation:lateral var(--tempo) ease-in-out both;animation-delay:calc(var(--atraso) - var(--fase))}.fagulha{position:absolute;left:var(--x);bottom:5px;width:3px;height:7px;border-radius:50%;background:#ffcf7a;opacity:0;box-shadow:0 0 5px #ff9a36;animation:fagulha var(--tempo) ease-out both;animation-delay:calc(var(--atraso) - var(--fase))}.arco{position:absolute;inset:8px;width:calc(100% - 16px);height:calc(100% - 16px);color:#d1f5ff;opacity:0;filter:drop-shadow(0 0 3px #80dfff);animation:eletrica var(--tempo) linear both;animation-delay:var(--atraso)}@keyframes surgir{0%{opacity:0;transform:translate(-50%,-50%) scale(.18)}10%{opacity:.28;color:#e5f6ff;transform:translate(-50%,-50%) scale(1.06)}23%{opacity:.15;color:#ffbd79;transform:translate(-50%,-50%) scale(1)}78%{opacity:.12}100%{opacity:0;transform:translate(-50%,-50%) scale(1.08)}}@keyframes girar{from{transform:rotate(-170deg)}to{transform:rotate(120deg)}}@keyframes ignicao{0%{opacity:0}2%{opacity:.7}9%,100%{opacity:0}}@keyframes contorno{0%{opacity:0}9%{opacity:.95}68%{opacity:.6}100%{opacity:0}}@keyframes orbitar{from{stroke-dashoffset:100}to{stroke-dashoffset:-100}}@keyframes arder{0%,5%{opacity:0}15%{opacity:.92}75%{opacity:.72}100%{opacity:0}}@keyframes labareda{0%{transform:scale(.35,.25) rotate(-8deg)}16%{transform:scale(.8,1) rotate(5deg)}29%{transform:scale(1,.6) rotate(-5deg)}42%{transform:scale(.75,.95) rotate(7deg)}58%{transform:scale(.9,.68) rotate(-5deg)}73%{transform:scale(.8,.9) rotate(4deg)}100%{transform:scale(.5,.2);opacity:0}}@keyframes lateral{0%{transform:rotate(90deg) scale(.4,.3)}20%{transform:rotate(85deg) scale(.9,1)}45%{transform:rotate(96deg) scale(.75,.7)}70%{transform:rotate(87deg) scale(.9,.9)}100%{transform:rotate(90deg) scale(.3,.1);opacity:0}}@keyframes fagulha{0%,8%{opacity:0;transform:translateY(0) scale(.4)}20%{opacity:.9}60%{opacity:.5}85%,100%{opacity:0;transform:translate(10px,-34px) scale(.2)}}@keyframes eletrica{0%,6%{opacity:0}9%{opacity:.65}17%,100%{opacity:0}}@keyframes sumir{0%,78%{opacity:1}100%{opacity:0}}@media(prefers-reduced-motion:reduce){.cena,.moldura{animation:none!important}.moldura{opacity:.5;box-shadow:inset 0 0 5px #ff9a3622}.selo,.borda,.fagulha,.arco,.clarear,.rastro{display:none!important}}`;
 function alvo(p){
  return [...document.querySelectorAll('[data-card-analista]')].find(c=>c.getAttribute('data-analista')===p.nome&&c.getAttribute('data-pedido-atual')===String(p.pedido)&&[...c.querySelectorAll('[data-open]')].some(a=>a.getAttribute('data-open')===String(p.pedido)))||null;
 }
 function pararSom(){for(const f of fontes){try{f.stop();}catch{}}fontes.clear();}
 function parar(){clearTimeout(timer);if(ativo){ativo.caixa?.classList.remove('roy-transmutando');ativo.host.remove();ativo=null;}if(anuncio)anuncio.textContent='';pararSom();}
 function controle(){
  const linha=document.getElementById('roySomLinha'),botao=document.getElementById('roySom'),estado=document.getElementById('roySomEstado');
  if(!linha||!botao)return;
  linha.hidden=!temaRoy||!usuario;
  const pronto=audio?.state==='running';
  botao.textContent=som&&pronto?'Estalo: ligado':som?'Ativar e testar estalo':'Estalo: desligado · ativar';
  botao.setAttribute('aria-pressed',String(som&&pronto));
  if(estado)estado.textContent=som&&pronto?'Som curto e suave ao chegar um pedido.':'O círculo e as chamas funcionam também sem som.';
 }
 async function lerPreferencias(){
  const g=++geracao;
  const [a,b,c]=await Promise.all(['local','afTemaNotificacoes','filaRoySom'].map(k=>chrome.storage.local.get(k)));
  if(g!==geracao)return;
  const s=a.local||{},t=b.afTemaNotificacoes;
  usuario=s.me||'';temaRoy=t?.nome===usuario&&t.tema?.id==='fullmetal-alchemist';preferencias=c.filaRoySom||{};som=preferencias[usuario]!==false;
  if(!temaRoy||ativo&&ativo.p.nome!==usuario)parar();
  controle();
 }
 function desbloquear(){
  try{
   const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)return Promise.resolve(false);
   if(!audio||audio.state==='closed'){audio=new C();audio.onstatechange=controle;}
   if(audio.state==='running'){controle();return Promise.resolve(true);}
   return new Promise(resolve=>{let terminou=false;const finalizar=ok=>{if(terminou)return;terminou=true;clearTimeout(limite);controle();resolve(ok);};const limite=setTimeout(()=>finalizar(false),1200);Promise.resolve(audio.resume()).then(()=>finalizar(audio.state==='running'),()=>finalizar(false));});
  }catch{return Promise.resolve(false);}
 }
 function estalo(){
  if(!som||!temaRoy||audio?.state!=='running')return false;
  try{
   const dur=.085,b=audio.createBuffer(1,Math.ceil(audio.sampleRate*dur),audio.sampleRate),v=b.getChannelData(0);let seed=14713;
   for(let i=0;i<v.length;i++){seed=(seed*16807)%2147483647;const t=i/audio.sampleRate;v[i]=((seed/2147483647)*2-1)*Math.exp(-t*85)*(1-Math.exp(-t*3000));}
   const fonte=audio.createBufferSource(),filtro=audio.createBiquadFilter(),ganho=audio.createGain();fonte.buffer=b;filtro.type='highpass';filtro.frequency.value=1300;ganho.gain.setValueAtTime(.22,audio.currentTime);ganho.gain.exponentialRampToValueAtTime(.001,audio.currentTime+dur);
   fonte.connect(filtro);filtro.connect(ganho);ganho.connect(audio.destination);fontes.add(fonte);fonte.onended=()=>{fontes.delete(fonte);fonte.disconnect();filtro.disconnect();ganho.disconnect();};fonte.start();fonte.stop(audio.currentTime+dur);return true;
  }catch{return false;}
 }
 function arte(){
  const host=document.createElement('div');host.setAttribute('data-roy-efeito','');host.setAttribute('aria-hidden','true');const r=host.attachShadow({mode:'closed'}),s=document.createElement('style');s.textContent=css;
  const cena=document.createElement('div');cena.className='cena';
  cena.innerHTML=`<div class="clarear"></div><div class="selo">${circulo}</div><div class="moldura"></div><svg class="rastro" viewBox="0 0 600 300" preserveAspectRatio="none"><rect x="2" y="2" width="596" height="296" rx="16" pathLength="100"/></svg><svg class="arco" viewBox="0 0 600 300" preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-width="1.2"><path d="m8 55 15-24 5 13 18-29 5 9 26-12M590 245l-18 24-4-13-18 29-6-9-28 12"/></svg>`;
  for(const lado of ['baixo','cima','esquerda','direita']){
   const borda=document.createElement('div');borda.className='borda '+lado;const vertical=lado==='esquerda'||lado==='direita';
   for(let i=0;i<(vertical?4:8);i++){const lab=document.createElement('i');lab.className='labareda'+(vertical?' lateral':'');lab.style.setProperty('--x',(vertical?10+i*23:2+i*13)+'%');lab.style.setProperty('--w',(22+(i*7)%15)+'px');lab.style.setProperty('--fase',(i*37)+'ms');lab.innerHTML=fogo;borda.append(lab);}
   cena.append(borda);
  }
  for(let i=0;i<10;i++){const f=document.createElement('i');f.className='fagulha';f.style.setProperty('--x',(4+i*10)+'%');f.style.setProperty('--fase',(i*49)+'ms');cena.append(f);}
  r.append(s,cena);return host;
 }
 function atualizar(){
  if(!ativo)return;
  const caixa=alvo(ativo.p);
  if(!caixa||Date.now()>=ativo.fim){parar();return;}
  if(caixa!==ativo.caixa||!ativo.host.isConnected){
   ativo.caixa?.classList.remove('roy-transmutando');ativo.caixa=caixa;caixa.classList.add('roy-transmutando');
   ativo.host.style.setProperty('--atraso',`${-Math.max(0,Date.now()-ativo.inicio)}ms`);caixa.prepend(ativo.host);
  }
 }
 function mostrar(p,o){
  const caixa=alvo(p);if(!caixa||!temaRoy||p.nome!==usuario)return false;
  parar();const duracao=Math.min(6000,Math.max(1200,o.duracao||3000)),host=arte(),inicio=Date.now();host.style.setProperty('--tempo',duracao+'ms');
  ativo={p,host,caixa,inicio,fim:inicio+duracao};caixa.classList.add('roy-transmutando');caixa.prepend(host);if(anuncio)anuncio.textContent=`Novo pedido ${p.pedido} para ${p.nome}.`;timer=setTimeout(parar,duracao);estalo();return true;
 }
 document.addEventListener('pointerdown',e=>{if(e.isTrusted&&som&&!e.target?.closest?.('#roySom')&&(temaRoy||e.target?.closest?.('[data-tema="fullmetal-alchemist"]')))desbloquear();},{capture:true});
 document.addEventListener('keydown',e=>{if(e.isTrusted&&som&&!e.target?.closest?.('#roySom')&&(e.key==='Enter'||e.key===' ')&&(temaRoy||e.target?.closest?.('[data-tema="fullmetal-alchemist"]')))desbloquear();},{capture:true});
 function iniciar(){
  anuncio=document.createElement('span');anuncio.className='roy-anuncio';anuncio.setAttribute('role','status');anuncio.setAttribute('aria-live','polite');document.body.append(anuncio);
  const b=document.getElementById('roySom');if(b)b.onclick=async()=>{
   const nome=usuario;if(!nome)return;
   if(som&&audio?.state==='running'){som=false;pararSom();}else{som=true;await desbloquear();}
   if(nome!==usuario)return;preferencias={...preferencias,[nome]:som};await chrome.storage.local.set({filaRoySom:preferencias});if(nome!==usuario)return;controle();if(som)estalo();
  };
  lerPreferencias().catch(()=>{});
 }
 chrome.storage.onChanged.addListener((c,area)=>{if(area==='local'&&(c.local||c.afTemaNotificacoes||c.filaRoySom))lerPreferencias().catch(()=>{});});
 midia?.addEventListener?.('change',()=>{if(midia.matches)parar();});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar,{once:true});else iniciar();
 async function preparar(p){await lerPreferencias();return temaRoy&&usuario===p.nome&&!!alvo(p);}
 globalThis.FilaRoyAlquimia=Object.freeze({alvo,mostrar,atualizar,parar,preparar});
})();
