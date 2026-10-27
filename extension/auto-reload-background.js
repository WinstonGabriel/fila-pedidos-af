/* Observa somente arquivos locais da instalação sem compactação. Não baixa atualizações. */
(() => {
  'use strict';
  const ALARME = 'af-auto-reload-local', CHAVE = 'afAutoReloadBaseline', LISTA = 'auto-reload-arquivos.json';
  const clientes = new Map();
  let ocupado = 0, preparando = false, recarregando = false, verificacao = null, geracao = 0, tentativa = 0;
  const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  function iniciarOperacao(prioritaria = false) {
    if (preparando && prioritaria) cancelarPreparacao();
    if (preparando) throw Error('A extensão está atualizando os arquivos locais. Aguarde e tente novamente.');
    ocupado++;
    let terminou = false;
    return () => { if (!terminou) { terminou = true; ocupado--; } };
  }
  async function executar(fn, {prioritaria = false} = {}) {
    const liberar = iniciarOperacao(prioritaria);
    try { return await fn(); } finally { liberar(); }
  }
  function localValido(p) {
    return typeof p === 'string' && /^[a-zA-Z0-9_/-]+(?:\.[a-zA-Z0-9_-]+)+$/.test(p) && !p.startsWith('/') && !p.split('/').includes('..');
  }
  async function lerArquivos() {
    const controle = new AbortController(), timer = setTimeout(() => controle.abort(), 12000);
    try {
      const ler = async p => {
        if (!localValido(p)) throw Error('Caminho local inválido');
        const url = new URL(chrome.runtime.getURL(p));
        url.searchParams.set('af_reload', String(Date.now()));
        const r = await fetch(url.href, {cache: 'no-store', signal: controle.signal});
        if (!r.ok) throw Error('Arquivo local indisponível');
        const bytes = await r.arrayBuffer();
        if (!bytes.byteLength) throw Error('Arquivo local vazio');
        return bytes;
      };
      const indice = await ler(LISTA), lista = JSON.parse(new TextDecoder().decode(indice));
      if (lista.schema !== 1 || !Array.isArray(lista.arquivos) || lista.arquivos.length > 128 || !lista.arquivos.every(localValido)) throw Error('Índice local inválido');
      const arquivos = [...new Set(lista.arquivos)].sort();
      for (const p of ['manifest.json', 'background.js', 'config.js', 'auto-reload-background.js', 'auto-reload-cliente.js', 'popup.html'])
        if (!arquivos.includes(p)) throw Error('Índice local incompleto');
      const assinaturas = [await hash(indice)];
      let manifest;
      for (let i = 0; i < arquivos.length; i += 6) {
        const lote = await Promise.all(arquivos.slice(i, i + 6).map(async p => {
          const bytes = await ler(p);
          if (p.endsWith('.json')) {
            const valor = JSON.parse(new TextDecoder().decode(bytes));
            if (p === 'manifest.json') manifest = valor;
          }
          return p + ':' + await hash(bytes);
        }));
        assinaturas.push(...lote);
      }
      if (manifest?.manifest_version !== 3 || !/^\d+(?:\.\d+){0,3}$/.test(manifest.version || '') || !arquivos.includes(manifest.background?.service_worker)) throw Error('Manifesto local incompleto');
      return {assinatura: await hash(new TextEncoder().encode(assinaturas.join('\n'))), versao: manifest.version};
    } finally { clearTimeout(timer); }
  }
  const documentos = async () => (await chrome.runtime.getContexts({})).filter(c => {
    try { const u = new URL(c.documentUrl); return u.href.split(/[?#]/)[0] === chrome.runtime.getURL('popup.html'); }
    catch { return false; }
  });
  async function prepararClientes() {
    const numero = ++tentativa;
    const docs = await documentos();
    const porDocumento = new Map([...clientes.values()].map(c => [c.port.sender.documentId, c]));
    if (docs.some(d => !porDocumento.has(d.documentId))) return false;
    const respostas = docs.map(d => {
      const c = porDocumento.get(d.documentId);
      c.tentativa = numero;
      return new Promise(resolve => {
        const timer = setTimeout(() => { c.responder = null; resolve(false); }, 1500);
        c.responder = ok => { clearTimeout(timer); c.responder = null; resolve(ok); };
        try { c.port.postMessage({tipo: 'preparar', tentativa: numero}); } catch { c.responder?.(false); }
      });
    });
    const g = geracao;
    if (!(await Promise.all(respostas)).every(Boolean) || g !== geracao || ocupado || !preparando) return false;
    // Uma página que surgiu durante a preparação também precisa estar registrada.
    const atuais = await documentos();
    return preparando && g === geracao && !ocupado && atuais.every(d => docs.some(old => old.documentId === d.documentId));
  }
  function cancelarPreparacao() {
    preparando = false;
    for (const c of clientes.values()) {
      c.responder?.(false);
      try { c.port.postMessage({tipo: 'cancelar'}); } catch { /* Página já fechada. */ }
    }
  }
  async function conferir() {
    if (!await pronto || recarregando) return false;
    const atual = await lerArquivos();
    const baseline = (await chrome.storage.session.get(CHAVE))[CHAVE];
    if (baseline?.assinatura === atual.assinatura) return false;
    await esperar(3000);
    const confirmacao = await lerArquivos();
    if (confirmacao.assinatura !== atual.assinatura) return false;
    if (!baseline && atual.versao === chrome.runtime.getManifest().version) {
      await chrome.storage.session.set({[CHAVE]: atual});
      return false;
    }
    if (ocupado) return false;
    preparando = true;
    try {
      if (!await prepararClientes()) return false;
      // Não substitui o baseline antigo: ele só é descartado pela recarga real.
      recarregando = true;
      chrome.runtime.reload();
      return true;
    } catch (e) { recarregando = false; throw e; }
    finally { if (!recarregando) cancelarPreparacao(); }
  }
  function verificar() {
    if (verificacao) return verificacao;
    verificacao = conferir().catch(() => false).finally(() => { verificacao = null; });
    return verificacao;
  }
  chrome.runtime.onConnect?.addListener(port => {
    if (port.name !== ALARME || port.sender?.id !== chrome.runtime.id || !port.sender.documentId) return;
    try { if (new URL(port.sender.url).href.split(/[?#]/)[0] !== chrome.runtime.getURL('popup.html')) return; }
    catch { return; }
    const c = {port, responder: null};
    clientes.set(port, c); geracao++;
    port.onMessage.addListener(msg => { if (msg?.tipo === 'pronto' && msg.tentativa === c.tentativa) c.responder?.(msg.ok === true); });
    port.onDisconnect.addListener(() => { c.responder?.(false); clientes.delete(port); geracao++; });
    if (preparando) cancelarPreparacao();
  });
  chrome.alarms?.onAlarm.addListener(a => { if (a.name === ALARME) verificar(); });
  const pronto = (async () => {
    if (!chrome.management?.getSelf || !chrome.runtime.getContexts || !chrome.alarms || !chrome.storage.session) return false;
    try {
      const info = await chrome.management.getSelf();
      if (info.installType !== 'development') { await chrome.alarms.clear(ALARME); return false; }
      if (!await chrome.alarms.get(ALARME)) await chrome.alarms.create(ALARME, {periodInMinutes: 1});
      return true;
    } catch { return false; }
  })();
  globalThis.FilaAutoReload = Object.freeze({verificar, iniciarOperacao, executar, pronto});
  pronto.then(ok => { if (ok) verificar(); });
})();
