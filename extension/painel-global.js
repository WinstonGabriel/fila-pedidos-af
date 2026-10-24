(async()=>{
 try{
  const token=location.hash.slice(1);history.replaceState(null,'',location.pathname);
  if(!/^[a-f0-9-]{72}$/i.test(token))throw Error('Abra pelo ícone flutuante da extensão.');
  const r=await chrome.runtime.sendMessage({tipo:'af-validar-painel',token});
  if(!r?.ok)throw Error('Abra novamente pelo ícone flutuante da extensão.');
  const frame=document.createElement('iframe');frame.title='AF Operação · painel atualizado';frame.src=chrome.runtime.getURL('popup.html');document.body.replaceChildren(frame);
 }catch(e){document.getElementById('estado').textContent=e.message||'Não foi possível abrir o painel.';}
})();
