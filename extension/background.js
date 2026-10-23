// Chrome: o ícone abre o painel lateral fixo.
// Opera GX (e outros sem painel lateral): o ícone abre uma janelinha própria, que fica aberta até você fechar.
const temPainelLateral = !!(chrome.sidePanel && chrome.sidePanel.setPanelBehavior);

if (temPainelLateral) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e) => console.error(e));
} else {
  chrome.action.onClicked.addListener(async () => {
    const { janelaId } = await chrome.storage.local.get('janelaId');
    if (janelaId) {
      try {
        await chrome.windows.update(janelaId, { focused: true });
        return;
      } catch (e) { /* a janela foi fechada: cria outra */ }
    }
    const w = await chrome.windows.create({
      url: chrome.runtime.getURL('popup.html'),
      type: 'popup',
      width: 450,
      height: 820,
      left: 0,
      top: 0,
    });
    await chrome.storage.local.set({ janelaId: w.id });
  });
}

importScripts('config.js', 'avisos-background.js');
