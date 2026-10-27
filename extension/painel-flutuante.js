/* Ícone flutuante do AF e dos sites autorizados. O ícone nativo da barra não fornece mouseenter/mouseleave. */
(() => {
 'use strict';
 if (window.top !== window || globalThis.__afPainelFlutuante) return;
 globalThis.__afPainelFlutuante = true;
 let host, raiz, timer, ancora, chave = '';
 let alcance={http:false,https:false},geracao=0,config=null;
 const ESTADO = 'af-operacao:painel-aberto';
 const lembrar = (aberto) => { try { if(aberto) sessionStorage.setItem(ESTADO,chave); else sessionStorage.removeItem(ESTADO); } catch {} };
 const estavaAberto = (nome) => { try { return sessionStorage.getItem(ESTADO) === nome; } catch { return false; } };
 let reparar = () => {};
 const observador = new MutationObserver(() => reparar());
 observador.observe(document,{childList:true,subtree:true});
 function desmontar() { geracao++; clearTimeout(timer); ancora?.destruir(); ancora=null; host?.remove(); host = null; chave = ''; reparar=()=>{}; }
 function aplicar(p) {
  config=p;
  if(globalThis.__afModoGlobal&&!alcance[location.protocol==='https:'?'https':'http']){desmontar();return;}
  if (!p?.ativo || !p.nome) { lembrar(false); return desmontar(); }
  if (host && chave === p.nome) { reparar(); return; }
  desmontar(); chave = p.nome;
  host = document.createElement('div');
  host.style.cssText = 'all:initial!important;position:fixed!important;right:10px!important;top:70px!important;z-index:2147483646!important;display:block!important;';
  raiz = host.attachShadow({mode:'closed'});
  const style = document.createElement('style');
  style.textContent = `:host{font:13px system-ui} .painel{position:relative;display:block;width:44px;height:44px}button{width:44px;height:44px;border:1px solid #8eacca;border-radius:14px;background:#14283b;color:white;cursor:grab;touch-action:none;user-select:none;box-shadow:0 4px 18px #0004}img{width:30px;height:30px}iframe{position:absolute;display:none;width:min(470px,calc(100vw - 82px));height:min(820px,calc(100dvh - 90px));border:1px solid #6e8397;border-radius:12px;background:#fff;box-shadow:0 12px 40px #0006}.aberto iframe{display:block}button:focus-visible{outline:3px solid #38bdf8}`;
  const box = document.createElement('div'); box.className = 'painel';
  const botao = document.createElement('button'); botao.type = 'button';
  botao.title = `${p.nome} · abrir AF Operação`; botao.setAttribute('aria-label',botao.title); botao.setAttribute('aria-expanded','false');
  const img = document.createElement('img'); img.src = chrome.runtime.getURL('icons/icon32.png'); img.alt=''; img.draggable=false; botao.append(img);
  const versaoDoPainel=geracao;
  let iframe;
  function montarFrame(){
   if(geracao!==versaoDoPainel||iframe||document.visibilityState==='hidden')return;
   const novo=document.createElement('iframe');iframe=novo;novo.title=`AF Operação · ${p.nome}`;novo.allow='autoplay';box.append(novo);ancora?.posicionar();
   if(globalThis.__afModoGlobal){const versao=geracao;AF_MontarPainelURL().then(url=>{if(geracao===versao&&iframe===novo)novo.src=url;}).catch(()=>{novo.remove();if(iframe===novo)iframe=null;});}
   else novo.src=chrome.runtime.getURL('popup.html');
  }
  function abrir() {
   if(ancora?.interagindo())return;
   clearTimeout(timer);
   montarFrame();
   lembrar(true); box.classList.add('aberto'); botao.setAttribute('aria-expanded','true'); ancora?.posicionar();
  }
  function fechar() { lembrar(false); box.classList.remove('aberto'); botao.setAttribute('aria-expanded','false'); }
  box.addEventListener('mouseenter',abrir);
  box.addEventListener('mouseleave',()=>{if(ancora?.interagindo())return;clearTimeout(timer);timer=setTimeout(()=>{ if (!box.matches(':hover')) fechar(); },350);});
  botao.addEventListener('focus',abrir);
  botao.addEventListener('click',()=>box.classList.contains('aberto') ? fechar() : abrir());
  box.addEventListener('keydown',(e)=>{if(e.key==='Escape'){fechar();botao.focus();fechar();}});
  box.addEventListener('focusout',(e)=>{if(!e.relatedTarget)return; clearTimeout(timer);timer=setTimeout(()=>{if(!raiz.activeElement && !box.matches(':hover'))fechar();},350);});
  document.addEventListener('mousemove',(e)=>{if(geracao!==versaoDoPainel||ancora?.interagindo()||!box.classList.contains('aberto'))return;const r=box.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){clearTimeout(timer);timer=setTimeout(()=>{if(!box.matches(':hover'))fechar();},350);}else clearTimeout(timer);});
  box.append(botao); raiz.append(style,box);
  ancora=globalThis.FilaPainelPosicao?.vincular({host,botao,painel:()=>iframe,largura:470,aoArrastar:()=>{clearTimeout(timer);fechar();},aoSoltar:abrir});
  reparar=()=>{if(host && !host.isConnected && document.documentElement)document.documentElement.append(host);};
  reparar();
  if(estavaAberto(p.nome)) abrir();
  if(globalThis.__afModoGlobal){montarFrame();document.addEventListener('visibilitychange',()=>{if(geracao!==versaoDoPainel)return;if(document.visibilityState==='hidden'){iframe?.remove();iframe=null;}else if(host&&chave===p.nome)montarFrame();});}
 }
 (async()=>{if(globalThis.__afModoGlobal){const a=await chrome.storage.local.get('afAlcancePainel');alcance=a.afAlcancePainel||alcance;}const s=await chrome.storage.local.get('afPainelFlutuante');aplicar(s.afPainelFlutuante);})().catch(()=>{});
 chrome.storage.onChanged.addListener((c,area)=>{if(area!=='local')return;if(c.afAlcancePainel){alcance=c.afAlcancePainel.newValue||{http:false,https:false};aplicar(config);}if(c.afPainelFlutuante)aplicar(c.afPainelFlutuante.newValue);});
})();
