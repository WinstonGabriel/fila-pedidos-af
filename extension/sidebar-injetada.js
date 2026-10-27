/* Sidebar injetada na página do AF: orelha (botão 44×44) que abre/fecha o painel. */
(() => {
  'use strict';
  if (window.top !== window) return;
  if (globalThis.__afSidebarInjetada) return;
  globalThis.__afSidebarInjetada = true;

  const CONTAINER_ID = 'fila-pedidos-container';
  const ESTADO = 'af-operacao:sidebar-aberta';
  let host = null;
  let iframe = null;
  let aberto = false;
  let timer = null;
  let geracao = 0;

  function desmontar() {
    geracao++;
    clearTimeout(timer);
    timer = null;
    if (host && host.isConnected) host.remove();
    host = null;
    iframe = null;
    aberto = false;
  }

  function montarFrame() {
    if (iframe) return;
    const novo = document.createElement('iframe');
    novo.id = 'fila-pedidos-frame';
    novo.title = 'AF Operação';
    novo.allow = 'autoplay';
    novo.src = chrome.runtime.getURL('popup.html');
    iframe = novo;
    const painel = host.querySelector('#fila-pedidos-painel');
    if (painel) painel.append(novo);
  }

  function abrir() {
    if (!host) return;
    clearTimeout(timer);
    timer = null;
    montarFrame();
    aberto = true;
    host.classList.add('aberto');
    const orelha = host.querySelector('#fila-pedidos-orelha');
    if (orelha) orelha.setAttribute('aria-expanded', 'true');
    try { sessionStorage.setItem(ESTADO, '1'); } catch {}
  }

  function fechar() {
    if (!host) return;
    clearTimeout(timer);
    timer = null;
    aberto = false;
    host.classList.remove('aberto');
    const orelha = host.querySelector('#fila-pedidos-orelha');
    if (orelha) orelha.setAttribute('aria-expanded', 'false');
    try { sessionStorage.removeItem(ESTADO); } catch {}
  }

  function aplicar(p) {
    if (!p?.ativo || !p.nome) { desmontar(); return; }
    if (host) {
      const orelha = host.querySelector('#fila-pedidos-orelha');
      if (orelha) orelha.title = `${p.nome} · AF Operação`;
      return;
    }
    geracao++;
    const versao = geracao;

    const container = document.createElement('div');
    container.id = CONTAINER_ID;

    const orelha = document.createElement('button');
    orelha.id = 'fila-pedidos-orelha';
    orelha.type = 'button';
    orelha.title = `${p.nome} · AF Operação`;
    orelha.setAttribute('aria-label', orelha.title);
    orelha.setAttribute('aria-expanded', 'false');
    const img = document.createElement('img');
    img.src = chrome.runtime.getURL('icons/icon32.png');
    img.alt = '';
    orelha.append(img);

    const painel = document.createElement('div');
    painel.id = 'fila-pedidos-painel';

    container.append(orelha, painel);
    document.body.append(container);
    host = container;

    orelha.addEventListener('mouseenter', () => { if (geracao === versao) abrir(); });
    container.addEventListener('mouseleave', () => {
      if (geracao !== versao) return;
      clearTimeout(timer);
      timer = setTimeout(() => { if (geracao === versao && host && !host.matches(':hover')) fechar(); }, 350);
    });
    orelha.addEventListener('click', () => { if (geracao !== versao) return; aberto ? fechar() : abrir(); });
    container.addEventListener('keydown', (e) => { if (geracao !== versao) return; if (e.key === 'Escape') { fechar(); orelha.focus(); } });

    const obs = new MutationObserver(() => {
      if (geracao !== versao) return;
      if (host && !host.isConnected && document.documentElement) document.documentElement.append(host);
    });
    obs.observe(document, { childList: true, subtree: true });

    try { if (sessionStorage.getItem(ESTADO) === '1') abrir(); } catch {}
  }

  (async () => {
    try {
      const s = await chrome.storage.local.get('afPainelFlutuante');
      aplicar(s.afPainelFlutuante);
    } catch {}
  })();

  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== 'local') return;
    if (c.afPainelFlutuante) aplicar(c.afPainelFlutuante.newValue);
  });
})();
