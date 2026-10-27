/* Coordena a recarga do worker com todos os painéis, sem descartar uma edição aberta. */
(() => {
  'use strict';
  if (!chrome.runtime.connect) return;
  let port = null, bloqueado = false, operacoes = 0, ultimaInteracao = 0, verificar = null, encerrado = false, desbloqueio;
  const liberarBloqueio = () => { bloqueado = false; clearTimeout(desbloqueio); };
  function iniciarOperacao() {
    if (bloqueado) throw Error('A extensão está atualizando os arquivos locais. Aguarde e tente novamente.');
    operacoes++;
    let terminou = false;
    return () => { if (!terminou) { terminou = true; operacoes--; } };
  }
  async function executar(fn) {
    const liberar = iniciarOperacao();
    try { return await fn(); } finally { liberar(); }
  }
  function conectar() {
    if (encerrado) return;
    try {
      port = chrome.runtime.connect({name: 'af-auto-reload-local'});
      port.onMessage.addListener(msg => {
        if (msg?.tipo === 'cancelar') { liberarBloqueio(); return; }
        if (msg?.tipo !== 'preparar') return;
        let ok = false;
        try { ok = !operacoes && Date.now() - ultimaInteracao >= 3000 && verificar?.() === true; } catch { /* Adia se o painel não estiver pronto. */ }
        bloqueado = ok;
        clearTimeout(desbloqueio);
        desbloqueio = setTimeout(liberarBloqueio, 5000);
        port.postMessage({tipo: 'pronto', tentativa: msg.tentativa, ok});
      });
      port.onDisconnect.addListener(() => {
        liberarBloqueio();
        if (!encerrado) setTimeout(conectar, 1000);
      });
    } catch {
      // Após invalidar o contexto, a página própria pode carregar os novos arquivos.
      if (!encerrado && !chrome.runtime.id) location.reload();
    }
  }
  for (const evento of ['input', 'change', 'click', 'keydown'])
    document.addEventListener(evento, () => { ultimaInteracao = Date.now(); }, true);
  window.addEventListener('pagehide', () => { encerrado = true; liberarBloqueio(); port?.disconnect(); });
  globalThis.FilaAutoReloadCliente = Object.freeze({iniciarOperacao, executar, definirVerificacao: fn => { verificar = fn; }});
  conectar();
})();
