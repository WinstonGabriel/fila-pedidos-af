/* Painel em sites autorizados: scripts locais, permissão opcional e acesso ao iframe por token de aba. */
const AF_SCRIPT_GLOBAL='af-operacao-flutuante-global';
const AF_ARQUIVOS_GLOBAIS=['efeito-core.js','pedido-animacao.js','painel-global-host.js','painel-posicao.js','painel-flutuante.js'];
const AF_EXCLUIR=['https://af.mateusmais.com.br/*','https://chromewebstore.google.com/*','https://chrome.google.com/webstore/*'];
async function AFOrigemPermitida(url){
 try{
  if(url.startsWith(chrome.runtime.getURL(''))||/^https:\/\/af\.mateusmais\.com\.br\//.test(url))return true;
  const u=new URL(url);if(!['http:','https:'].includes(u.protocol))return false;
  const s=await chrome.storage.local.get('afPainelFlutuante');
  return !!s.afPainelFlutuante?.ativo&&await chrome.permissions.contains({origins:[u.origin+'/*']});
 }catch{return false;}
}
globalThis.AFOrigemPermitida=AFOrigemPermitida;
async function registrarPainelGlobal(injetar=false){
 const [http,https]=await Promise.all(['http://*/*','https://*/*'].map(o=>chrome.permissions.contains({origins:[o]})));
 const matches=[...(http?['http://*/*']:[]),...(https?['https://*/*']:[])];
 await chrome.storage.local.set({afAlcancePainel:{http,https}});
 const anteriores=await chrome.scripting.getRegisteredContentScripts({ids:[AF_SCRIPT_GLOBAL]});
 const definicao={id:AF_SCRIPT_GLOBAL,matches,excludeMatches:AF_EXCLUIR,js:AF_ARQUIVOS_GLOBAIS,runAt:'document_idle',allFrames:false,persistAcrossSessions:true};
 if(!matches.length){if(anteriores.length)await chrome.scripting.unregisterContentScripts({ids:[AF_SCRIPT_GLOBAL]});return;}
 if(anteriores.length)await chrome.scripting.updateContentScripts([definicao]);else await chrome.scripting.registerContentScripts([definicao]);
 if(injetar){
  const tabs=await chrome.tabs.query({url:matches});
  await Promise.allSettled(tabs.filter(t=>Number.isInteger(t.id)&&!/^https:\/\/(af\.mateusmais\.com\.br|chromewebstore\.google\.com|chrome\.google\.com)\//.test(t.url||'')).map(t=>chrome.scripting.executeScript({target:{tabId:t.id},files:AF_ARQUIVOS_GLOBAIS})));
 }
}
let filaPainel=Promise.resolve();
const atualizarRegistro=(injetar=false)=>{filaPainel=filaPainel.catch(()=>{}).then(()=>registrarPainelGlobal(injetar));return filaPainel;};
chrome.permissions.onAdded.addListener(()=>atualizarRegistro(true).catch(()=>{}));
chrome.permissions.onRemoved.addListener(()=>atualizarRegistro(false).catch(()=>{}));
chrome.runtime.onInstalled.addListener(()=>atualizarRegistro(true).catch(()=>{}));
chrome.runtime.onStartup.addListener(()=>atualizarRegistro(false).catch(()=>{}));
atualizarRegistro(false).catch(()=>{});
const AF_TOKEN_STORAGE=chrome.storage.session||chrome.storage.local;
async function emitirTokenPainel(sender){
 if(!Number.isInteger(sender.tab?.id)||!await AFOrigemPermitida(sender.url))return {ok:false};
 const u=new URL(sender.url);if(!['https:','http:'].includes(u.protocol))return {ok:false};
 const token=crypto.randomUUID()+crypto.randomUUID();
 const chave='afPanelToken:'+sender.tab.id;
 await AF_TOKEN_STORAGE.set({[chave]:{token,origem:u.origin,expira:Date.now()+30*60*1000}});
 return {ok:true,url:chrome.runtime.getURL('painel-global.html')+'#'+token};
}
async function validarTokenPainel(msg,sender){
 if(!Number.isInteger(sender.tab?.id)||!sender.url?.startsWith(chrome.runtime.getURL('painel-global.html')))return {ok:false};
 const key='afPanelToken:'+sender.tab.id,s=await AF_TOKEN_STORAGE.get(key),d=s[key];
 if(!d||d.token!==msg.token||d.expira<Date.now())return {ok:false};
 const tab=await chrome.tabs.get(sender.tab.id);if(new URL(tab.url).origin!==d.origem||!await AFOrigemPermitida(tab.url))return {ok:false};
 return {ok:true};
}
chrome.runtime.onMessage.addListener((msg,sender,responder)=>{
 if(sender.id!==chrome.runtime.id||!['af-autorizar-painel','af-validar-painel','af-atualizar-painel-global'].includes(msg?.tipo))return;
 if(msg.tipo==='af-atualizar-painel-global'&&!sender.url?.startsWith(chrome.runtime.getURL('')))return;
 const fn=msg.tipo==='af-autorizar-painel'?()=>emitirTokenPainel(sender):msg.tipo==='af-validar-painel'?()=>validarTokenPainel(msg,sender):()=>atualizarRegistro(true).then(()=>({ok:true}));
 fn().then(responder,()=>responder({ok:false}));return true;
});
chrome.tabs.onRemoved.addListener(id=>AF_TOKEN_STORAGE.remove('afPanelToken:'+id).catch(()=>{}));
