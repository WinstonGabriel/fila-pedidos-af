/* Posição pessoal do ícone flutuante; não acessa formulários da página. */
(() => {
  'use strict';
  if (globalThis.FilaPainelPosicao) return;
  const CHAVE = 'afPainelPosicao', TAM = 44, GAP = 6;
  const limitar = (v, a, b) => Math.max(a, Math.min(v, Math.max(a, b)));
  const valido = p => p?.schema === 1 && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
  function geometria(w, h, x, y, largura = 400, altura = 820) {
    const m = Math.min(8, Math.max(0, (Math.min(w, h) - TAM) / 2));
    x = limitar(x, m, w - TAM - m); y = limitar(y, m, h - TAM - m);
    const pw = Math.max(1, Math.min(largura, w - 2 * m));
    let ph = Math.max(1, Math.min(altura, h - 2 * m)), px, py;
    if (w - x - TAM - GAP - m >= pw) { px = x + TAM + GAP; py = limitar(y, m, h - ph - m); }
    else if (x - GAP - m >= pw) { px = x - GAP - pw; py = limitar(y, m, h - ph - m); }
    else {
      px = limitar(x, m, w - pw - m);
      const abaixo = h - y - TAM - GAP - m, acima = y - GAP - m;
      if (abaixo >= acima) { ph = Math.max(1, Math.min(ph, abaixo)); py = y + TAM + GAP; }
      else { ph = Math.max(1, Math.min(ph, acima)); py = y - GAP - ph; }
      py = limitar(py, m, h - ph - m);
    }
    return {x, y, largura: pw, altura: ph, esquerda: px - x, topo: py - y, margem: m};
  }
  function vincular({host, botao, painel, aoArrastar = () => {}, aoSoltar = () => {}, largura = 400, altura = 820}) {
    let salvo = null, atual = null, gesto = null, destruido = false, revisao = 0, ignorarClique = false, cliqueTimer;
    const ouvintes = [];
    const ouvir = (alvo, tipo, fn, opcoes) => { alvo.addEventListener(tipo, fn, opcoes); ouvintes.push(() => alvo.removeEventListener(tipo, fn, opcoes)); };
    const estilo = (elemento, dados) => { for (const [k, v] of Object.entries(dados)) elemento.style.setProperty(k, v, 'important'); };
    function posicionar(ponto) {
      if (destruido) return;
      const w = window.innerWidth, h = window.innerHeight;
      const m = Math.min(8, Math.max(0, (Math.min(w, h) - TAM) / 2));
      const x = ponto?.x ?? (salvo ? m + salvo.x * Math.max(0, w - TAM - 2 * m) : w - TAM - 10);
      const y = ponto?.y ?? (salvo ? m + salvo.y * Math.max(0, h - TAM - 2 * m) : 70);
      atual = geometria(w, h, x, y, largura, altura);
      estilo(host, {position: 'fixed', left: atual.x + 'px', top: atual.y + 'px', right: 'auto', bottom: 'auto', width: TAM + 'px', height: TAM + 'px', transition: 'none'});
      const p = painel();
      if (p) estilo(p, {position: 'absolute', left: atual.esquerda + 'px', top: atual.topo + 'px', right: 'auto', bottom: 'auto', width: atual.largura + 'px', height: atual.altura + 'px', margin: '0', 'box-sizing': 'border-box'});
    }
    function guardar() {
      const m = atual.margem;
      salvo = {schema: 1, x: limitar((atual.x - m) / Math.max(1, window.innerWidth - TAM - 2 * m), 0, 1), y: limitar((atual.y - m) / Math.max(1, window.innerHeight - TAM - 2 * m), 0, 1)};
      chrome.storage.local.set({[CHAVE]: salvo}).catch(() => {});
    }
    function terminar(e, cancelar = false) {
      if (!gesto || (e.pointerId !== undefined && e.pointerId !== gesto.id)) return;
      const g = gesto; gesto = null;
      botao.style.setProperty('cursor', 'grab', 'important');
      try { if (botao.hasPointerCapture?.(g.id)) botao.releasePointerCapture(g.id); } catch {}
      if (!g.arrastou) return;
      ignorarClique = true; clearTimeout(cliqueTimer); cliqueTimer = setTimeout(() => { ignorarClique = false; }, 400);
      e.preventDefault?.(); e.stopImmediatePropagation?.();
      if (cancelar) posicionar({x: g.x, y: g.y});
      else { guardar(); aoSoltar(); }
    }
    ouvir(botao, 'pointerdown', e => {
      if (gesto || e.button !== 0 || e.isPrimary === false || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
      revisao++; ignorarClique = false;
      gesto = {id: e.pointerId, cx: e.clientX, cy: e.clientY, x: atual.x, y: atual.y, arrastou: false};
      try { botao.setPointerCapture(e.pointerId); } catch {}
    });
    ouvir(document, 'pointermove', e => {
      if (!gesto || e.pointerId !== gesto.id || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
      const dx = e.clientX - gesto.cx, dy = e.clientY - gesto.cy;
      if (!gesto.arrastou && Math.hypot(dx, dy) < 6) return;
      if (!gesto.arrastou) { gesto.arrastou = true; botao.style.setProperty('cursor', 'grabbing', 'important'); aoArrastar(); }
      e.preventDefault(); e.stopPropagation();
      posicionar({x: gesto.x + dx, y: gesto.y + dy});
    }, {capture: true, passive: false});
    ouvir(document, 'pointerup', e => terminar(e), true);
    ouvir(document, 'pointercancel', e => terminar(e, true), true);
    ouvir(botao, 'lostpointercapture', e => terminar(e, true));
    ouvir(botao, 'click', e => { if (ignorarClique) { ignorarClique = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    ouvir(botao, 'dragstart', e => e.preventDefault());
    ouvir(botao, 'keydown', e => {
      const delta = {ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10]}[e.key];
      if (!e.altKey || !delta || gesto) return;
      revisao++; e.preventDefault(); e.stopPropagation();
      posicionar({x: atual.x + delta[0], y: atual.y + delta[1]}); guardar();
    });
    ouvir(window, 'resize', () => { if (gesto) terminar({pointerId: gesto.id}, true); posicionar(); });
    estilo(botao, {cursor: 'grab', 'touch-action': 'none', 'user-select': 'none'});
    botao.setAttribute('aria-description', 'Arraste para mover. Alt mais as setas também muda a posição.');
    posicionar();
    const versao = revisao;
    chrome.storage.local.get(CHAVE).then(s => { if (!destruido && versao === revisao && valido(s[CHAVE])) { salvo = s[CHAVE]; posicionar(); } }).catch(() => {});
    const mudou = (c, area) => {
      if (destruido || gesto || area !== 'local' || !c[CHAVE]) return;
      revisao++; salvo = valido(c[CHAVE].newValue) ? c[CHAVE].newValue : null; posicionar();
    };
    chrome.storage.onChanged.addListener(mudou);
    return Object.freeze({
      posicionar: () => posicionar(gesto ? {x: atual.x, y: atual.y} : undefined),
      interagindo: () => !!gesto,
      destruir() {
        destruido = true; gesto = null; clearTimeout(cliqueTimer);
        for (const remover of ouvintes) remover();
        chrome.storage.onChanged.removeListener?.(mudou);
      },
    });
  }
  globalThis.FilaPainelPosicao = Object.freeze({vincular, geometria});
})();
