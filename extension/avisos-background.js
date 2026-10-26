/* As páginas recebem apenas a projeção dos próprios avisos, sem credenciais. */
let consultaAvisos = null,
  ultimoContextoAvisos = '',
  ultimoAvisosEm = 0;
const chaveAvisos = (s) => (s?.codigo && s?.token ? `${s.codigo}|${s.token}|${s.me || ''}` : '');
async function contextoPublicoAvisos(s) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${s.codigo}|${s.token}`));
  return Array.from(new Uint8Array(hash), (x) => x.toString(16).padStart(2, '0')).join('');
}
async function rpcAvisosBackground(fn, s, args = {}) {
  const controle = new AbortController(),
    timer = setTimeout(() => controle.abort(), 15000);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ p_codigo: s.codigo, p_token: s.token, p_coord: null, ...args }),
      signal: controle.signal,
    });
    if (!r.ok) throw Error('Não foi possível atualizar os avisos. Tente novamente.');
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}
async function publicarAvisosBackground(d, s) {
  const atual = await chrome.storage.local.get('local');
  if (chaveAvisos(atual.local) !== chaveAvisos(s))
    throw Error('A identificação mudou. Abra a extensão para consultar seus avisos.');
  const contexto = await contextoPublicoAvisos(s);
  const projecao = {
      contexto,
      analista: d.analista,
      destinatario: d.destinatario,
      itens: d.itens || [],
      lido_ate: d.lido_ate || 0,
      nao_lidos: d.nao_lidos || 0,
      ultimo_id: d.ultimo_id || 0,
    };
  const anterior=(await chrome.storage.local.get('filaNotificacoesUI')).filaNotificacoesUI;
  if(JSON.stringify(anterior)!==JSON.stringify(projecao))await chrome.storage.local.set({filaNotificacoesUI:projecao});
  ultimoContextoAvisos = chaveAvisos(s);
  ultimoAvisosEm = Date.now();
}
function enfileirarAvisos(fn) {
  const anterior = consultaAvisos;
  const promessa = (async () => {
    try {
      if (anterior) await anterior.catch(() => {});
      return await fn();
    } finally {
      if (consultaAvisos === promessa) consultaAvisos = null;
    }
  })();
  consultaAvisos = promessa;
  return promessa;
}
function atualizarAvisosBackground(forcar = false) {
  if (consultaAvisos && !forcar) return consultaAvisos;
  return enfileirarAvisos(async () => {
    const { local: s } = await chrome.storage.local.get('local'),
      contexto = chaveAvisos(s);
    if (!contexto) {
      await chrome.storage.local.remove('filaNotificacoesUI');
      return;
    }
    if (!forcar && contexto === ultimoContextoAvisos && Date.now() - ultimoAvisosEm < 8000) return;
    const d=globalThis.FilaSincronizacao ? (await FilaSincronizacao.obter({forcar,coord:null})).avisos : await rpcAvisosBackground('fila_avisos', s);
    await publicarAvisosBackground(d, s);
  });
}
function confirmarAvisosBackground(msg) {
  if (
    !Array.isArray(msg.ids) ||
    !msg.ids.length ||
    msg.ids.length > 100 ||
    msg.ids.some((id) => !Number.isSafeInteger(id) || id < 1)
  )
    return Promise.reject(Error('Avisos inválidos.'));
  return enfileirarAvisos(async () => {
    const { local: s } = await chrome.storage.local.get('local');
    if (!chaveAvisos(s) || msg.contexto !== (await contextoPublicoAvisos(s)))
      throw Error('A identificação mudou. Consulte os avisos na extensão.');
    await publicarAvisosBackground(
      await rpcAvisosBackground('fila_aviso_confirmar', s, { p_ids: msg.ids }),
      s,
    );
    globalThis.FilaSincronizacao?.invalidar();
  });
}
async function abrirAvisosBackground(sender, msg) {
  const pedido = {
    evento_id: Number.isSafeInteger(msg.evento_id) ? msg.evento_id : null,
    quando: Date.now(),
  };
  const salvar = chrome.storage.session?.set({ filaAbrirAvisos: pedido });
  // Invoca open durante o gesto de clicar em Saber mais, antes de aguardar a rede.
  if (chrome.sidePanel?.open && sender.tab?.id) {
    try {
      const abrir = chrome.sidePanel.open({ tabId: sender.tab.id });
      await Promise.all([salvar, abrir]);
      return;
    } catch {
      /* Opera e versões sem abertura de painel usam janela. */
    }
  }
  await salvar;
  await chrome.windows.create({
    url: chrome.runtime.getURL('popup.html#avisos'),
    type: 'popup',
    width: 500,
    height: 820,
  });
}
chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  if (
    !['fila-atualizar-avisos', 'fila-confirmar-avisos', 'fila-abrir-avisos'].includes(msg?.tipo) ||
    sender.id !== chrome.runtime.id
  )
    return;
  const origemLocal=sender.url?.startsWith(chrome.runtime.getURL('')) || /^https:\/\/af\.mateusmais\.com\.br\//.test(sender.url || '');
  if(!origemLocal && !globalThis.AFOrigemPermitida)return;
  const fn =
    msg.tipo === 'fila-confirmar-avisos'
      ? () => confirmarAvisosBackground(msg)
      : msg.tipo === 'fila-abrir-avisos'
        ? () => abrirAvisosBackground(sender, msg)
        : () => atualizarAvisosBackground(msg.forcar === true);
  Promise.resolve(origemLocal || AFOrigemPermitida(sender.url || '')).then(ok=>{if(!ok)throw Error('Página sem permissão');return fn();}).then(
    () => responder({ ok: true }),
    (e) => responder({ ok: false, mensagem: e.message }),
  );
  return true;
});
