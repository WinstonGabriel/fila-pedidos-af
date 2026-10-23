(() => {
  'use strict';
  if (location.protocol !== 'https:' || location.hostname !== 'af.mateusmais.com.br' || window.top !== window)
    return;
  async function atualizar() {
    if (document.visibilityState === 'hidden') return;
    try {
      await chrome.runtime.sendMessage({ tipo: 'fila-atualizar-avisos' });
      const { filaNotificacoesUI } = await chrome.storage.local.get('filaNotificacoesUI');
      await FilaBaloes.receber(filaNotificacoesUI);
    } catch {
      /* Extensão recarregada ou conexão temporariamente indisponível. */
    }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.filaNotificacoesUI)
      FilaBaloes.receber(changes.filaNotificacoesUI.newValue).catch(() => {});
  });
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', atualizar, { once: true });
  else atualizar();
  document.addEventListener('visibilitychange', atualizar);
  setInterval(atualizar, 10000);
})();
