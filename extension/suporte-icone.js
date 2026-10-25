/* Imagem declarativa da equipe; não executa HTML, SVG ou scripts recebidos do banco. */
(() => {
  'use strict';
  let atual = '', pronta = false, carregando = false, falhouEm = 0, geracao = 0;
  function normalizar(valor) {
    if (typeof valor !== 'string' || valor.length > 2048 || !valor.trim()) return '';
    try {
      const url = new URL(valor.trim());
      if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2048) return '';
      return url.href;
    } catch { return ''; }
  }
  const emitir = () => document.dispatchEvent(new CustomEvent('fila:icone-suporte'));
  function falhou(url) {
    if (normalizar(url) !== atual) return;
    pronta = carregando = false;
    falhouEm = Date.now();
    emitir();
  }
  function definir(valor) {
    const url = normalizar(valor);
    if (url === atual && (pronta || carregando || !url || Date.now() - falhouEm < 30000)) return;
    const mudou = url !== atual;
    atual = url;
    pronta = carregando = false;
    const vez = ++geracao;
    if (mudou) emitir();
    if (!url) return;
    carregando = true;
    const imagem = new Image();
    imagem.referrerPolicy = 'no-referrer';
    imagem.onload = () => {
      if (vez !== geracao) return;
      carregando = false;
      if (!imagem.naturalWidth || !imagem.naturalHeight) return falhou(url);
      pronta = true;
      emitir();
    };
    imagem.onerror = () => { if (vez === geracao) falhou(url); };
    imagem.src = url;
  }
  function html(padrao) {
    if (!pronta) return padrao;
    const src = atual.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    return `<img class="icone-suporte-remoto" src="${src}" width="17" height="17" alt="" aria-hidden="true" referrerpolicy="no-referrer">`;
  }
  window.FilaIconeSuporte = Object.freeze({ normalizar, definir, html, falhou });
})();
