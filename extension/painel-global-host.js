/* Executado só nos sites em que o usuário concedeu permissão. */
globalThis.__afModoGlobal=true;
globalThis.AF_MontarPainelURL=async()=>{
 const r=await chrome.runtime.sendMessage({tipo:'af-autorizar-painel'});
 if(!r?.ok||typeof r.url!=='string')throw Error('Permissão para o painel indisponível');
 return r.url;
};
