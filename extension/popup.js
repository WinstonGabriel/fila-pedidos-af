const ANALISTAS = ['Natalie', 'Cássio', 'Evangela', 'Gabriel', 'Kazaf', 'Rayla', 'Abigail', 'Alisson'];
const FV_ANALISTAS = ['Cássio', 'Gabriel'];
const COR = { Natalie: '#db2777', Cássio: '#ea580c', Evangela: '#7c3aed', Gabriel: '#2563eb', Kazaf: '#16a34a', Rayla: '#a16207', Abigail: '#0891b2', Alisson: '#475569' };
const PREF_PADRAO = ['Mateus Express', 'Mix Toureiro Farma'];
const LIMITE_ATRASO_MS = 30 * 60 * 1000; // 30 min com o mesmo pedido
const ORIGEM_PAINEL = 'https://af.mateusmais.com.br';
const INTERVALO_LEITURA_MS = 2000;
const INTERVALO_COMPLETA_MS = 60000;
const INTERVALO_SYNC_MS = 2000;
const TEMPO_BANCO_MS = 35 * 1000;
const RASPAGEM = { esperaTelaMs: 30000, tempoPaginaMs: 60000, tempoTotalMs: 180000, concorrencia: 2, maxPaginas: 40, esperaRetryMs: 1500 };

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoje = () => new Date().toLocaleDateString('sv-SE');
const agoraHHMM = () => new Date().toTimeString().slice(0, 5);
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const nomeHtml = (n) => `<span class="nome" style="color:${COR[n] || 'inherit'}">${esc(n)}</span>`;

/* ---------- estado local (salvo neste computador, sobrevive ao fechar o painel) ---------- */
let local = { mode: 'pilha', me: '', data: hoje(), codigo: '', token: '', cache: null, origem: ORIGEM_PAINEL, coord: '' };
/* ---------- estado compartilhado (vem do banco) ---------- */
let remote = { analistas: {}, atribuicoes: [], janela: {}, usuarios: [], coord: false };
let pedidos = [];
let leitura = { primeira: 0, paginas: 1, totalMenu: null };
let usandoCache = true;
let ultimaLeitura = 0;
let leituraEmCurso = null;
let completaEmCurso = null;
let ultimaCompleta = 0;
let contextoUltimaCompleta = '';
let paginasLidas = { contexto: '', paginas: {}, versoes: {}, completa: false };
let syncEmCurso = null;
let escolhendoNome = false;
let acaoEmCurso = false;
let distribuicaoEmCurso = null;
let estadoLeitura = { lendo: false, erro: '' };
let rede = { ok: false, msg: '', hora: '' };
let zerarArmado = false;
let anex = { msg: '', erro: false, valor: '' };

const saveLocal = () => chrome.storage.local.set({ local });
async function loadLocal() {
  const { local: s } = await chrome.storage.local.get('local');
  if (s) local = { ...local, ...s };
  if (!local.token) local.token = crypto.randomUUID();
  if (!local.origem) local.origem = ORIGEM_PAINEL;
  if (local.me && !ANALISTAS.includes(local.me)) local.me = '';
  local.data = hoje();
  if (Array.isArray(local.cache?.pedidos)) {
    pedidos = local.cache.pedidos;
    leitura = local.cache.leitura || leitura;
    if (local.cache.paginasLidas) paginasLidas = local.cache.paginasLidas;
  }
  await saveLocal();
}

/* ---------- banco compartilhado ---------- */
async function rpc(fn, args = {}) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TEMPO_BANCO_MS);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ p_codigo: local.codigo, p_token: local.token, p_coord: local.coord || null, ...args }),
      signal: controle.signal,
    });
    const txt = await r.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (e) { /* corpo vazio */ }
    if (!r.ok) throw new Error((data && data.message) || txt || `Erro ${r.status}`);
    return data;
  } catch (e) {
    if (controle.signal.aborted) throw new Error('O banco demorou mais de 35 s para responder. Aguarde a sincronização antes de repetir a ação.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function sync() {
  if (syncEmCurso) return syncEmCurso;
  syncEmCurso = sincronizar();
  try { return await syncEmCurso; } finally { syncEmCurso = null; }
}

async function sincronizar() {
  if (!local.codigo) {
    rede = { ok: false, msg: 'Informe o código da equipe em "Conexão".' };
    return false;
  }
  try {
    const contexto = JSON.stringify([local.codigo, local.token, local.coord]);
    const d = await rpc('fila_estado', { p_token: local.token });
    if (contexto !== JSON.stringify([local.codigo, local.token, local.coord])) return false;
    if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('O banco retornou uma resposta inválida.');
    const m = {};
    (d.analistas || []).forEach((a) => (m[a.nome] = a));
    remote.analistas = m;
    remote.atribuicoes = d.atribuicoes || [];
    remote.janela = d.janela || {};
    remote.usuarios = d.usuarios || [];
    remote.coord = !!d.coord;
    rede = { ok: true, hora: new Date().toLocaleTimeString('pt-BR') };
    if (!escolhendoNome) await garantirNome();
    return true;
  } catch (e) {
    if (/coordena/i.test(e.message)) { local.coord = ''; remote.coord = false; saveLocal(); }
    rede = { ok: false, msg: e.message };
    return false;
  }
}

async function garantirNome() {
  const meu = remote.usuarios.find((u) => u.meu);
  if (meu) {
    if (local.me !== meu.nome) { local.me = meu.nome; await saveLocal(); }
    return;
  }
  if (local.me) {
    local.me = '';
    await saveLocal();
    rede.aviso = 'Seu nome foi liberado. Escolha seu nome em "Eu sou".';
  }
}

async function escolherNome(nome) {
  if (escolhendoNome) return;
  escolhendoNome = true;
  renderEu(true);
  let erro = '';
  try {
    if (syncEmCurso) await syncEmCurso;
    if (nome) {
      if (!ANALISTAS.includes(nome)) throw new Error('Escolha um nome válido.');
      await rpc('fila_escolher_nome', { p_nome: nome });
      local.me = nome;
    } else if (local.me) {
      await rpc('fila_liberar_nome', { p_nome: local.me });
      local.me = '';
    }
    await saveLocal();
  } catch (e) { erro = e.message; }
  finally { escolhendoNome = false; }
  await sync();
  if (erro) rede.aviso = erro;
  else delete rede.aviso;
  renderTudo();
  renderEu(true);
}

const cfg = (n) => remote.analistas[n] || { ligado: false, inicio: '', fim: '' };
const atualDe = (n) => remote.atribuicoes.find((a) => a.analista === n && a.status === 'em_andamento');
const podeAgirEm = (n) => remote.coord || n === local.me;
const podeEditarContato = () => remote.coord || !!local.me;
const reservadosDe = (n) => remote.atribuicoes.filter((a) => a.analista === n && a.status === 'reservado');
const contatos = () => remote.atribuicoes.filter((a) => a.status === 'contato');
const ocupados = () => new Set(remote.atribuicoes.filter((a) => a.status !== 'devolvido').map((a) => a.pedido_id));
const atrasado = (a) => !!a && Date.now() - new Date(a.criado_em).getTime() >= LIMITE_ATRASO_MS;

/* ---------- lojas de preferência (compartilhadas) ---------- */
function prefLojas() {
  try {
    const l = JSON.parse(remote.janela.pref_lojas);
    if (Array.isArray(l)) return l;
  } catch (e) { /* usa o padrão */ }
  return PREF_PADRAO;
}
const ehPref = (p) => prefLojas().some((l) => semAcento(l).trim() && semAcento(p.estab).includes(semAcento(l).trim()));

/* ---------- leitura de TODAS as páginas (roda dentro da aba do painel) ---------- */
async function scrapeFn(opcoes = {}) {
  // O contexto isolado é compartilhado pelas injeções desta extensão na mesma aba.
  // Reabrir o painel ou clicar novamente não inicia outra varredura em paralelo.
  const chave = opcoes.somenteTela ? '__filaPedidosTela510' : '__filaPedidosLeitura501';
  if (window[chave]) return window[chave];
  const executar = async () => {
    const cfg = { esperaTelaMs: 30000, tempoPaginaMs: 60000, tempoTotalMs: 180000, concorrencia: 2, maxPaginas: 40, esperaRetryMs: 1500, ...opcoes };
    const controleTotal = new AbortController();
    const prazo = Date.now() + cfg.tempoTotalMs;
    const timerTotal = setTimeout(() => controleTotal.abort(), cfg.tempoTotalMs);
    const conferirPrazo = () => {
      if (controleTotal.signal.aborted || Date.now() >= prazo) throw new Error(cfg.somenteTela ? 'A tela do AF ainda não está pronta. Nova leitura em 2 s.' : 'A leitura do AF excedeu 3 minutos. A última lista válida foi mantida.');
    };
    const pausa = (ms) => new Promise((resolve, reject) => {
      if (controleTotal.signal.aborted) return reject(new Error('Leitura interrompida.'));
      const finalizar = () => { controleTotal.signal.removeEventListener('abort', abortar); resolve(); };
      const timer = setTimeout(finalizar, ms);
      const abortar = () => { clearTimeout(timer); reject(new Error('Leitura interrompida.')); };
      controleTotal.signal.addEventListener('abort', abortar, { once: true });
    });
    const limpa = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const lerDoc = (doc, base) => {
      const out = [];
      (doc.querySelector('#table-extended-transactions') || doc).querySelectorAll('tr').forEach((row) => {
        const a = [...row.querySelectorAll('a')].find((x) => /\d{10,}/.test(x.textContent));
        if (!a) return;
        const text = limpa(row.textContent);
        const d = text.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
        if (!d) return;
        const id = a.textContent.match(/\d{10,}/)[0];
        const raw = a.getAttribute('href') || '';
        let href = '';
        if (raw && raw !== '#') {
          try {
            const url = new URL(raw, base);
            if (url.origin === new URL(base).origin && /^https?:$/.test(url.protocol)) href = url.href;
          } catch (e) { /* href inválido */ }
        }
        const tds = [...row.querySelectorAll('td')].map((td) => limpa(td.textContent));
        out.push({
          id,
          href,
          cat: tds[4] || '',
          estab: tds[5] || '',
          modal: tds[6] || '',
          data: `${d[3]}-${d[2]}-${d[1]}`,
          hora: `${d[4]}:${d[5]}`,
          minutos: Number(d[4]) * 60 + Number(d[5]),
          valor: (text.match(/R\$\s?[\d.]+,\d{2}/) || [''])[0],
          rec: (text.match(/\b(approve|review|reject|deny|decline)\b/i) || [/não analisado/i.test(text) ? 'não analisado' : ''])[0],
        });
      });
      return out;
    };

    const paginasDe = (doc, base) => [...doc.querySelectorAll('a[href*="page="]')].map((a) => {
      try {
        const url = new URL(a.getAttribute('href'), base);
        const pagina = Number(url.searchParams.get('page'));
        return url.origin === new URL(base).origin && url.pathname === new URL(base).pathname && Number.isInteger(pagina) && pagina > 0 ? pagina : 0;
      } catch (e) { return 0; }
    }).filter(Boolean);
    const ehLogin = (doc) => !!doc.querySelector('input[type="password"], #kc-form-login');
    const carregando = (doc) => [...doc.querySelectorAll('[aria-busy="true"], .dataTables_processing, .spinner-border, [role="progressbar"]')]
      .some((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    const vazia = (doc) => /nenhum[a]? (pedido|registro|resultado)|n[aã]o (h[aá]|existem) (pedidos|registros)|no (data|records|results)|nothing found/i.test(doc.querySelector('#table-extended-transactions')?.textContent || '');

    try {
      let atual = [];
      const limiteTela = Date.now() + cfg.esperaTelaMs;
      while (true) {
        conferirPrazo();
        if (ehLogin(document)) throw new Error('Sua sessão do AF expirou. Entre novamente no painel.');
        atual = lerDoc(document, location.href);
        const tabela = document.querySelector('#table-extended-transactions');
        if (!carregando(document) && (atual.length || (tabela && vazia(document)))) break;
        // Algumas versões do painel exibem um tbody realmente vazio, sem mensagem.
        if (tabela?.tBodies.length && !tabela.tBodies[0].rows.length && document.readyState === 'complete' && !carregando(document) && limiteTela - Date.now() <= cfg.esperaTelaMs - 2000) break;
        if (Date.now() >= limiteTela) throw new Error(cfg.somenteTela ? 'A tabela do AF ainda está carregando. Nova leitura em 2 s.' : 'A tabela de pedidos do AF não ficou pronta em 30 s. Aguarde o carregamento e clique em Ler página.');
        await pausa(Math.min(500, Math.max(1, limiteTela - Date.now())));
      }

      const base = location.href;
      const cur = Math.max(1, Number(new URL(base).searchParams.get('page')) || 1);
      const nums = paginasDe(document, base);
      let max = Math.max(cur, ...nums);
      const porPagina = { [cur]: atual };
      const filtro = new URL(base);
      filtro.searchParams.delete('page');
      filtro.searchParams.sort();
      filtro.hash = '';
      const menuAtual = (document.querySelector('.main-menu') || document.body).textContent.match(/(\d+)\s*Pedidos em an[aá]lise/i);
      if (cfg.somenteTela) return {
        ok: true, pedidos: atual, porPagina, paginaAtual: cur, contexto: filtro.href,
        primeira: cur === 1 ? atual.length : 0, paginas: max,
        totalMenu: menuAtual ? Number(menuAtual[1]) : null,
      };

      const buscar = async (n, sondagem = false) => {
        const url = new URL(base);
        url.searchParams.set('page', String(n));
        for (let tentativa = 0; tentativa < 2; tentativa++) {
          conferirPrazo();
          const controle = new AbortController();
          const abortar = () => controle.abort();
          controleTotal.signal.addEventListener('abort', abortar, { once: true });
          const timer = setTimeout(abortar, Math.min(cfg.tempoPaginaMs, prazo - Date.now()));
          let repetir = true;
          try {
            const r = await fetch(url.href, { credentials: 'same-origin', cache: 'no-store', signal: controle.signal });
            // Na sondagem sem links, 404 confirma que a página seguinte não existe.
            if (sondagem && r.status === 404) return { itens: [], paginas: [] };
            if (!r.ok) {
              repetir = [408, 429].includes(r.status) || r.status >= 500;
              throw new Error(`O AF respondeu HTTP ${r.status} na página ${n}.`);
            }
            if (new URL(r.url || url.href).origin !== url.origin || /login|\/auth\//i.test(new URL(r.url || url.href).pathname)) {
              repetir = false;
              throw new Error('Sua sessão do AF expirou. Entre novamente no painel.');
            }
            const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
            const itens = lerDoc(doc, url.href);
            if (ehLogin(doc) || (!doc.querySelector('#table-extended-transactions') && !itens.length)) {
              repetir = false;
              throw new Error(`A página ${n} não retornou a lista de pedidos. Confira sua sessão do AF.`);
            }
            const tabela = doc.querySelector('#table-extended-transactions');
            if (!itens.length && !vazia(doc) && tabela?.tBodies[0]?.rows.length) {
              throw new Error(`A página ${n} retornou uma tabela ainda em carregamento.`);
            }
            conferirPrazo();
            return { itens, paginas: paginasDe(doc, url.href) };
          } catch (e) {
            conferirPrazo();
            if (!repetir || tentativa === 1) throw new Error(controle.signal.aborted ? `A página ${n} demorou mais de 60 s para responder.` : e.message);
          } finally {
            clearTimeout(timer);
            controleTotal.signal.removeEventListener('abort', abortar);
          }
          await pausa(cfg.esperaRetryMs);
        }
      };

      // Poucas requisições por vez, inclusive quando a paginação revela novas páginas.
      let proxima = 1;
      let falha = null;
      const trabalhador = async () => {
        try {
          while (proxima <= max) {
            conferirPrazo();
            if (max > cfg.maxPaginas) throw new Error(`O AF indicou mais de ${cfg.maxPaginas} páginas. Refine o filtro para ler a fila completa.`);
            const n = proxima++;
            if (n === cur) continue;
            const pagina = await buscar(n);
            porPagina[n] = pagina.itens;
            max = Math.max(max, ...pagina.paginas);
            await pausa(0); // devolve o controle à tela entre as páginas
          }
        } catch (e) {
          if (!falha) falha = e;
          controleTotal.abort();
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, Math.min(2, cfg.concorrencia)) }, trabalhador));
      if (falha) throw falha;

      // Sem paginação, só encerra ao confirmar que não há pedidos novos.
      if (!nums.length) {
        const vistos = new Set(Object.values(porPagina).flat().map((p) => p.id));
        let fimConfirmado = false;
        for (let n = max + 1; n <= cfg.maxPaginas + 1; n++) {
          const pagina = await buscar(n, true);
          const novos = pagina.itens.filter((p) => !vistos.has(p.id));
          if (!novos.length) { fimConfirmado = true; break; }
          if (n > cfg.maxPaginas) break;
          porPagina[n] = novos;
          novos.forEach((p) => vistos.add(p.id));
          await pausa(0);
        }
        if (!fimConfirmado) throw new Error(`Não foi possível confirmar o fim da fila em ${cfg.maxPaginas} páginas. Refine o filtro.`);
      }

      const mapa = new Map();
      Object.values(porPagina).flat().forEach((p) => mapa.set(p.id, p));
      const menu = (document.querySelector('.main-menu') || document.body).textContent.match(/(\d+)\s*Pedidos em an[aá]lise/i);
      return { ok: true, pedidos: [...mapa.values()], porPagina, paginaAtual: cur, contexto: filtro.href, primeira: (porPagina[1] || []).length, paginas: Object.keys(porPagina).length, totalMenu: menu ? Number(menu[1]) : null };
    } catch (e) {
      return { ok: false, erro: controleTotal.signal.aborted && Date.now() >= prazo ? (cfg.somenteTela ? 'A tela do AF ainda não está pronta. Nova leitura em 2 s.' : 'A leitura do AF excedeu 3 minutos. A última lista válida foi mantida.') : e.message };
    } finally {
      clearTimeout(timerTotal);
      controleTotal.abort();
    }
  };
  const tarefa = executar();
  window[chave] = tarefa;
  try { return await tarefa; } finally { if (window[chave] === tarefa) delete window[chave]; }
}

/* ---------- destaque na página (roda dentro da aba) ---------- */
function highlightFn(ids, focus) {
  document.querySelectorAll('[data-fila-hl]').forEach((r) => {
    r.style.outline = '';
    r.style.background = '';
    r.removeAttribute('data-fila-hl');
  });
  let alvo = null;
  document.querySelectorAll('tr, [role="row"]').forEach((row) => {
    const a = [...row.querySelectorAll('a')].find((x) => /\d{10,}/.test(x.textContent));
    if (!a) return;
    const id = a.textContent.match(/\d{10,}/)[0];
    if (!ids.includes(id)) return;
    row.setAttribute('data-fila-hl', '1');
    row.style.outline = '3px solid #7c3aed';
    row.style.background = '#f3e8ff';
    if (id === focus || !alvo) alvo = row;
  });
  if (alvo) alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// aba da lista de pedidos: a aba "/" da origem do painel; senão, a aba ativa da janela normal em foco
async function abaPainel() {
  if (local.origem) {
    try {
      const tabs = await chrome.tabs.query({ url: local.origem + '/*' });
      const lista = tabs.filter((t) => {
        try { return new URL(t.url).pathname === '/'; } catch (e) { return false; }
      });
      if (lista.length) return lista.find((t) => t.active) || lista[0];
    } catch (e) { /* sem permissão para essa origem */ }
  }
  try {
    const w = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    const [a] = await chrome.tabs.query({ active: true, windowId: w.id });
    if (a && ehAbaLista(a)) return a;
  } catch (e) { /* tenta o próximo */ }
  const [b] = await chrome.tabs.query({ active: true, currentWindow: true });
  return b && ehAbaLista(b) ? b : null;
}

function ehAbaLista(tab) {
  try {
    const url = new URL(tab.url);
    return url.origin === local.origem && url.pathname === '/';
  } catch (e) { return false; }
}

async function lerPedidos() {
  if (leituraEmCurso) return leituraEmCurso;
  leituraEmCurso = executarLeitura();
  try { return await leituraEmCurso; } finally { leituraEmCurso = null; }
}

async function injetarLeitura(tab, opcoes, limiteMs) {
  let timer;
  try {
    return await Promise.race([
      chrome.scripting.executeScript({ target: { tabId: tab.id }, injectImmediately: true, func: scrapeFn, args: [opcoes] })
        .then((res) => {
          const r = res?.[0]?.result;
          if (!r?.ok || !Array.isArray(r.pedidos)) throw new Error(r?.erro || 'Não foi possível ler a lista do AF.');
          return r;
        }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('A tabela do AF ainda não respondeu. A última leitura foi mantida.')), limiteMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

async function aplicarLeitura(r, completa, inicio) {
  if (r.contexto !== paginasLidas.contexto) {
    paginasLidas = { contexto: r.contexto, paginas: {}, versoes: {}, completa: false };
  }
  if (completa) {
    const novas = { ...r.porPagina };
    for (const [n, versao] of Object.entries(paginasLidas.versoes)) {
      if (versao > inicio) novas[n] = paginasLidas.paginas[n];
    }
    paginasLidas.paginas = novas;
    paginasLidas.completa = true;
  } else {
    Object.assign(paginasLidas.paginas, r.porPagina);
    paginasLidas.versoes[r.paginaAtual] = Date.now();
    if (r.paginas > Object.keys(paginasLidas.paginas).length) paginasLidas.completa = false;
  }
  const mapa = new Map();
  Object.values(paginasLidas.paginas).flat().forEach((p) => mapa.set(p.id, p));
  pedidos = [...mapa.values()].sort((a, b) => (a.data + a.hora + a.id).localeCompare(b.data + b.hora + b.id));
  leitura = { primeira: (paginasLidas.paginas[1] || []).length, paginas: Math.max(r.paginas, Object.keys(paginasLidas.paginas).length), totalMenu: r.totalMenu, parcial: !paginasLidas.completa };
  usandoCache = false;
  const assinatura = JSON.stringify([pedidos, leitura, paginasLidas.contexto]);
  const mudou = assinatura !== local.cache?.assinatura;
  local.cache = { hora: new Date().toLocaleTimeString('pt-BR'), pedidos, leitura, paginasLidas, assinatura };
  if (mudou) await saveLocal();
}

async function lerCompleto(tab, contexto) {
  if (completaEmCurso) return completaEmCurso;
  const inicio = Date.now();
  completaEmCurso = (async () => {
    try {
      const r = await injetarLeitura(tab, RASPAGEM, RASPAGEM.tempoTotalMs + 5000);
      // Um filtro alterado durante a busca não pode receber resultados do filtro antigo.
      if (r.contexto === contexto && paginasLidas.contexto === contexto) await aplicarLeitura(r, true, inicio);
    } catch (e) { /* A tela continua sendo lida a cada 2 s; as outras páginas serão tentadas novamente. */ }
    finally {
      ultimaCompleta = Date.now();
      contextoUltimaCompleta = contexto;
      renderPainel();
      renderStatus();
    }
  })();
  try { return await completaEmCurso; } finally { completaEmCurso = null; }
}

async function executarLeitura() {
  estadoLeitura = { lendo: true, erro: '' };
  renderStatus();
  try {
    const tab = await abaPainel();
    if (!tab) throw new Error('Abra a lista de pedidos do AF Mateus em uma aba e entre na sua conta.');
    const r = await injetarLeitura(tab, { ...RASPAGEM, somenteTela: true, esperaTelaMs: 1500, tempoTotalMs: 1800 }, 2000);
    await aplicarLeitura(r, false, Date.now());
    distribuirAutomatico();
    if (!completaEmCurso && (contextoUltimaCompleta !== r.contexto || !ultimaCompleta || Date.now() - ultimaCompleta >= INTERVALO_COMPLETA_MS)) lerCompleto(tab, r.contexto);
  } catch (e) {
    estadoLeitura.erro = e.message || String(e);
    usandoCache = true;
  } finally {
    ultimaLeitura = Date.now();
    estadoLeitura.lendo = false;
    renderStatus();
  }
}

async function ler() {
  await Promise.all([
    lerPedidos().then(() => { renderPainel(); renderStatus(); }),
    sync().then(() => renderTudo()),
  ]);
}

async function renderPerm() {
  const el = $('#perm');
  let ok = false;
  try { ok = await chrome.permissions.contains({ origins: [local.origem + '/*'] }); } catch (e) { /* ignora */ }
  el.innerHTML = ok
    ? `<div class="meta">Leitura contínua ativa em ${esc(local.origem)}</div>`
    : `<button id="btnPerm" class="primario">Permitir leitura contínua do painel</button>
       <div class="meta">${esc(local.origem)}</div>`;
}

async function destacar(ids, focus) {
  try {
    const tab = await abaPainel();
    if (tab) await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: highlightFn, args: [ids, focus || null] });
  } catch (e) { /* sem acesso à aba */ }
}

function abrir(id) {
  const p = pedidos.find((x) => x.id === id) || remote.atribuicoes.find((x) => x.pedido_id === id);
  if (p && p.href) chrome.tabs.create({ url: p.href, active: true }); // sempre em nova guia
  else destacar([id], id);
}

async function copiar(texto, btn) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = texto;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  const antes = btn.textContent;
  btn.textContent = '✓';
  setTimeout(() => (btn.textContent = antes), 1000);
}

/* ---------- regras ---------- */
const ehFV = (p) => /for[cç]a\s+de\s+vendas/i.test(`${p.cat || ''} ${p.estab || ''}`);

// livres para o analista: lojas de preferência primeiro (independente do horário), depois o resto; cada grupo do mais antigo ao mais novo
function livresPara(n) {
  const ocup = ocupados();
  const l = pedidos.filter((p) => !ocup.has(p.id) && (!ehFV(p) || FV_ANALISTAS.includes(n)));
  return [...l.filter(ehPref), ...l.filter((p) => !ehPref(p))];
}

const toMin = (t) => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const fmt = (min) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

function janela() {
  const j = remote.janela || {};
  return { inicio: j.janela_inicio || '', duracao: Number(j.janela_duracao) || 60, auto: (j.janela_auto ?? 'true') !== 'false' };
}

function faixas() {
  const J = janela();
  const on = ANALISTAS.filter((n) => cfg(n).ligado);
  const k = on.length;
  const out = {};
  if (J.auto) {
    const ini = toMin(J.inicio || agoraHHMM().slice(0, 2) + ':00');
    on.forEach((n, i) => {
      const a = ini + Math.round((i * J.duracao) / k);
      const b = ini + Math.round(((i + 1) * J.duracao) / k) - 1;
      out[n] = { i: a, f: b, inicio: fmt(a), fim: fmt(b) };
    });
  } else {
    on.forEach((n) => {
      const c = cfg(n);
      out[n] = { i: toMin(c.inicio), f: toMin(c.fim), inicio: c.inicio, fim: c.fim };
    });
  }
  return out;
}

function porIntervalo() {
  const F = faixas();
  const map = {};
  ANALISTAS.forEach((n) => (map[n] = []));
  const sem = [];
  pedidos
    .filter((p) => !local.data || p.data === local.data)
    .forEach((p) => {
      const dono = ANALISTAS.find((n) => F[n] && F[n].i != null && F[n].f != null && p.minutos >= F[n].i && p.minutos <= F[n].f);
      dono ? map[dono].push(p) : sem.push(p);
    });
  return { map, sem };
}

/* ---------- ações (gravam no banco e recarregam) ---------- */
async function acao(fn) {
  if (acaoEmCurso) return false;
  acaoEmCurso = true;
  renderPainel();
  try {
    if (distribuicaoEmCurso) await distribuicaoEmCurso;
    await fn();
    await sync();
    return true;
  } catch (e) {
    rede = { ok: false, msg: e.message };
    return false;
  } finally {
    acaoEmCurso = false;
    renderPainel();
    renderStatus();
  }
}

const candidatos = (n) =>
  livresPara(n).slice(0, 25).map((p) => ({ id: p.id, hora: p.hora, valor: p.valor, estab: p.estab, href: p.href, cat: p.cat || '' }));
const puxar = (n) => rpc('fila_puxar', { p_analista: n, p_candidatos: candidatos(n) });

function candidatosAuto() {
  const essenciais = new Set(remote.atribuicoes.filter((a) => ['em_andamento','reservado','devolvido'].includes(a.status)).map((a) => a.pedido_id));
  const lista = [...pedidos.filter(ehPref), ...pedidos.filter((p) => !ehPref(p))];
  const ocup = ocupados();
  const disponiveis = lista.filter((p) => !ocup.has(p.id)).slice(0, 500);
  const detalhes = lista.filter((p) => essenciais.has(p.id));
  return [...new Map([...disponiveis, ...detalhes].map((p) => [p.id, p])).values()].slice(0, 1000)
    .map((p) => ({ id: p.id, hora: p.hora, valor: p.valor, estab: p.estab, href: p.href, cat: p.cat || '', preferencia: ehPref(p) }));
}

async function sincronizarAposAcao() {
  if (syncEmCurso) await syncEmCurso;
  return sync();
}

async function distribuirAutomatico() {
  if (distribuicaoEmCurso) return distribuicaoEmCurso;
  if (acaoEmCurso || escolhendoNome || !rede.ok || !local.me || !cfg(local.me).ligado || usandoCache) return false;
  const registrados = new Set(remote.usuarios.map((u) => u.nome));
  const alguemLivre = ANALISTAS.some((n) => registrados.has(n) && cfg(n).ligado && !atualDe(n));
  const ocup = ocupados();
  const haPedidos = pedidos.some((p) => !ocup.has(p.id)) || remote.atribuicoes.some((a) => ['reservado','devolvido'].includes(a.status));
  if (!alguemLivre || !haPedidos) return false;
  distribuicaoEmCurso = (async () => {
    try {
      const resultado = await rpc('fila_distribuir_auto', { p_candidatos: candidatosAuto() });
      if (resultado?.distribuidos > 0) await sincronizarAposAcao();
      return true;
    } catch (e) {
      rede = { ok: false, msg: e.message };
      return false;
    } finally { renderPainel(); renderStatus(); }
  })();
  try { return await distribuicaoEmCurso; } finally { distribuicaoEmCurso = null; }
}

async function avancarPedido(n, tipo, id = atualDe(n)?.pedido_id) {
  if (!id) return;
  await rpc('fila_avancar', { p_analista: n, p_pedido_id: id, p_acao: tipo, p_candidatos: candidatosAuto() });
  await sincronizarAposAcao();
}
const concluirEPuxar = (n, id) => avancarPedido(n, 'concluir', id);
const liberarEPuxar = (n, id) => avancarPedido(n, 'liberar', id);

// aceita o ID numérico ou o link do pedido (/pedido/<uuid>)
function acharEntrada(txt) {
  const t = txt.trim();
  const uuid = (t.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0];
  if (uuid) {
    const p = pedidos.find((x) => (x.href || '').includes(uuid));
    return p ? { p, id: p.id } : { id: null, uuid };
  }
  const id = (t.match(/\d{10,}/) || [])[0];
  return id ? { p: pedidos.find((x) => x.id === id), id } : { id: null };
}

// reserva o pedido para mim: não vai para mais ninguém; se eu estiver sem pedido, ele já vira o atual
async function anexarManual(txt) {
  if (!local.me) throw new Error('Escolha quem você é em "Eu sou".');
  const r = acharEntrada(txt);
  if (!r.id) throw new Error(r.uuid ? 'Link não encontrado na lista atual: digite o ID numérico do pedido.' : 'Digite o ID do pedido (16 dígitos).');
  const p = r.p || { id: r.id, hora: '', valor: '', estab: '', href: '' };
  await rpc('fila_anexar', { p_analista: local.me, p_pedido: { id: p.id, hora: p.hora || '', valor: p.valor || '', estab: p.estab || '', href: p.href || '' } });
  await sync();
  await puxar(local.me);
  return r.p ? `Pedido ${r.id} reservado para você.` : `Pedido ${r.id} reservado para você (não está na lista atual).`;
}

const salvarJanela = (inicio, duracao, auto) => rpc('fila_set_janela', { p_inicio: inicio, p_duracao: duracao, p_auto: auto });

/* ---------- renderização ---------- */
const item = (p, o = {}) => `
  <li class="${o.atraso ? 'atraso' : ''}">
    <a href="#" data-open="${esc(p.id)}">${esc(p.id)}</a>
    <span class="meta">${esc(p.hora)} · ${esc(p.valor)} · ${esc(p.rec || '')}${ehFV(p) ? ' · <b>Força de Vendas</b>' : ''}${ehPref(p) ? ' · <b class="pref">★ Preferência</b>' : ''}<br>${esc(p.estab)}${p.modal ? ' · ' + esc(p.modal) : ''}</span>
    ${p.href ? `<button class="ghost" data-copiar="${esc(p.href)}" title="Copiar link do pedido">⧉</button>` : ''}
    <button class="ghost" data-loc="${esc(p.id)}" title="Localizar na página">📍</button>
  </li>`;

function renderStatus() {
  const st = $('#status');
  const btn = $('#btnLer');
  btn.disabled = estadoLeitura.lendo;
  btn.textContent = estadoLeitura.lendo ? 'Lendo…' : '↻ Ler página';
  st.setAttribute('aria-busy', String(estadoLeitura.lendo));
  let base;
  if (usandoCache) base = local.cache ? `${pedidos.length} pedidos (última leitura ${local.cache.hora})` : 'aguardando a primeira leitura válida';
  else {
    base = `${pedidos.length} pedidos no total`;
    if (leitura.paginas > 1) base += ` · ${leitura.primeira} na primeira página (${leitura.paginas} páginas)`;
    if (leitura.totalMenu != null && leitura.totalMenu !== pedidos.length) base += ` · menu indica ${leitura.totalMenu}`;
    if (leitura.parcial) base += ' · página atual lida; completando outras páginas';
    else base += ' · leitura da tela a cada 2 s';
  }
  if (rede.ok) {
    st.className = rede.aviso ? 'erro' : 'ok';
    st.textContent = rede.aviso ? `⚠ ${rede.aviso}` : `● sincronizado ${rede.hora} · ${base}`;
  } else {
    st.className = 'erro';
    st.textContent = `✖ ${rede.msg || 'sem conexão'} · ${base}`;
  }
  if (estadoLeitura.lendo) {
    st.textContent = `⟳ Lendo tela do AF… · ${st.textContent}`;
  } else if (estadoLeitura.erro) {
    st.className = 'erro';
    st.textContent += ` · ⚠ ${estadoLeitura.erro}`;
  }
}

function renderEu(forcar = false) {
  const eu = $('#eu');
  eu.disabled = escolhendoNome || !rede.ok;
  $('#btnLiberarNome').disabled = escolhendoNome || !local.me || !rede.ok;
  if (!forcar && document.activeElement === eu) return;
  const usos = remote.usuarios || [];
  eu.innerHTML =
    `<option value="">— quem é você? —</option>` +
    ANALISTAS.map((n) => {
      const u = usos.find((x) => x.nome === n);
      const outro = u && !u.meu;
      return `<option value="${n}" style="color:${COR[n]}" ${n === local.me ? 'selected' : ''} ${outro ? 'disabled' : ''}>${n}${outro ? ' (em uso)' : ''}</option>`;
    }).join('');
}

function renderUsos() {
  const usos = remote.usuarios || [];
  $('#usos').innerHTML = usos.length
    ? `<div class="meta">Nomes em uso (liberar só se o analista não usa mais):</div>` +
      usos.map((u) => `<div class="linha"><span>${nomeHtml(u.nome)}${u.meu ? ' (você)' : ''}</span>${u.meu || remote.coord ? `<button data-liberar-nome="${esc(u.nome)}">Liberar</button>` : ''}</div>`).join('')
    : '';
}

function renderCfg() {
  const inter = local.mode === 'intervalo';
  const J = janela();
  const F = inter ? faixas() : {};
  let h = '';
  if (inter) {
    h += `<label class="data">Data dos pedidos <input type="date" id="data" value="${esc(local.data)}"></label>
    <div class="janela">
      <label><input type="checkbox" id="jAuto" ${J.auto ? 'checked' : ''}> Dividir automaticamente</label>
      ${J.auto ? `Início <input type="time" id="jInicio" value="${esc(J.inicio || agoraHHMM().slice(0, 2) + ':00')}">
      <button id="jAgora" title="Começar a janela agora">Agora</button>
      Duração <input type="number" id="jDur" min="1" value="${J.duracao}"> min` : ''}
    </div>`;
  }
  h += `<table class="cfg"><tr><th>Analista</th><th>ON</th>${inter ? '<th>Início</th><th>Fim</th>' : ''}</tr>`;
  ANALISTAS.forEach((n) => {
    const c = cfg(n);
    const f = F[n];
    h += `<tr><td>${nomeHtml(n)}</td>
      <td><input type="checkbox" data-n="${n}" data-f="on" ${c.ligado ? 'checked' : ''} ${podeAgirEm(n) ? '' : 'disabled'}></td>
      ${inter ? `<td><input type="time" data-n="${n}" data-f="inicio" value="${esc(J.auto ? (f ? f.inicio : '') : c.inicio)}" ${J.auto || !podeAgirEm(n) ? 'disabled' : ''}></td>
                 <td><input type="time" data-n="${n}" data-f="fim" value="${esc(J.auto ? (f ? f.fim : '') : c.fim)}" ${J.auto || !podeAgirEm(n) ? 'disabled' : ''}></td>` : ''}</tr>`;
  });
  h += '</table>';
  if (!inter) {
    h += `<div class="prefbox"><div class="meta">Lojas de preferência — vão sempre à frente na fila, independente do horário</div>
      <div class="chips">${prefLojas().map((l, i) => `<span class="chip">${esc(l)} <button class="ghost" data-rmpref="${i}" title="Remover">✕</button></span>`).join('')}</div>
      <div class="linha"><input id="prefNovo" placeholder="Nome da loja (ou parte dele)"><button id="prefAdd">Adicionar</button></div></div>
    <div class="prefbox"><div class="meta">Anexar pedido manualmente — fica reservado para você e não vai para mais ninguém</div>
      <div class="linha"><input id="anexId" placeholder="ID do pedido" value="${esc(anex.valor)}"><button id="anexAdd" class="primario">Anexar</button></div>
      ${anex.msg ? `<div class="meta" style="color:var(${anex.erro ? '--cor-erro' : '--cor-ok'})">${esc(anex.msg)}</div>` : ''}</div>`;
  }
  $('#cfgBody').innerHTML = h;
}

function renderIntervalo() {
  const { map, sem } = porIntervalo();
  if (!local.me) {
    $('#painel').innerHTML = '<div class="card sem">Escolha quem você é em <b>Eu sou</b> para ver os seus pedidos.</div>';
    return;
  }
  const lista = map[local.me] || [];
  let h = `<div class="linha"><span class="meta">Pedidos de ${nomeHtml(local.me)}</span>
    <button class="primario" id="btnProximo" ${lista.length ? '' : 'disabled'}>Abrir 1º pedido</button>
    <button id="btnDestacar" ${lista.length ? '' : 'disabled'}>Destacar</button></div>
    <div class="card">
    ${lista.length ? `<ul>${lista.map((p) => item(p)).join('')}</ul>` : '<div class="vazio">Nenhum pedido neste intervalo.</div>'}</div>
    <div class="meta">${ANALISTAS.filter((n) => map[n].length).map((n) => `${nomeHtml(n)}: ${map[n].length}`).join(' · ')}</div>`;
  if (sem.length) h += `<div class="card sem"><h3>Sem analista (${sem.length})</h3><ul>${sem.map((p) => item(p)).join('')}</ul></div>`;
  $('#painel').innerHTML = h;
}

function renderPilha() {
  const ocup = ocupados();
  const livres = pedidos.filter((p) => !ocup.has(p.id));
  const fvLivres = livres.filter(ehFV).length;
  const prefLivres = livres.filter(ehPref).length;
  const ativos = ANALISTAS.filter((n) => cfg(n).ligado).sort((a, b) => (b === local.me) - (a === local.me));
  const fvOn = FV_ANALISTAS.some((n) => cfg(n).ligado);
  const btnZerar = remote.coord ? `<button class="perigo" id="btnZerar">${zerarArmado ? 'Clique de novo para confirmar' : 'Zerar pilha'}</button>` : '';
  let h = `<div class="linha">${btnZerar}
    <span class="meta">Distribuição automática · Na fila: ${livres.length} (★ ${prefLivres} · Força de Vendas ${fvLivres})</span></div>`;
  if (fvLivres && !fvOn) h += `<div class="card sem">${fvLivres} pedido(s) de Força de Vendas aguardando: marque ${FV_ANALISTAS.join(' ou ')} como ON.</div>`;
  if (!ativos.length) h += '<div class="vazio">Marque os analistas que estão ON.</div>';
  ativos.forEach((n) => {
    const a = atualDe(n);
    const noPainel = a && pedidos.find((x) => x.id === a.pedido_id);
    const p = a && (noPainel || { id: a.pedido_id, hora: a.hora, valor: a.valor, estab: a.estab, href: a.href });
    const saiu = a && !noPainel && !usandoCache && !leitura.parcial;
    const atr = atrasado(a); // cronômetro oculto: só aparece como animação vermelha
    h += `<div class="card ${n === local.me ? 'voce' : ''} ${atr ? 'atraso' : ''}"><h3>${nomeHtml(n)}${n === local.me ? ' (você)' : ''}</h3>${
      p
        ? `<ul>${item(p, { atraso: atr })}</ul>${saiu ? `<div class="tag ok">✔ saiu da lista — feito por: ${nomeHtml(n)}</div>` : ''}
           <div class="linha">${podeAgirEm(n) ? `<button data-concluir="${n}" data-pedido="${esc(a.pedido_id)}" class="primario">✔ Concluí → próximo</button>` : ''}
           ${podeEditarContato() ? `<button data-contato="${n}" data-pedido="${esc(a.pedido_id)}" title="Marcar para contato e buscar o próximo para ${esc(n)}">📞 Para contato</button>` : ''}
           ${podeAgirEm(n) ? `<button data-liberar="${n}" data-pedido="${esc(a.pedido_id)}" title="Devolver à fila para redistribuir aleatoriamente a outro analista ON">↩ Liberar</button>` : ''}</div>`
        : '<div class="vazio">Aguardando pedido disponível…</div>'
    }${reservadosDe(n).length ? `<div class="meta">Reservados${n === local.me ? ' para você' : ''} (próximos):</div><ul>${reservadosDe(n)
      .map((r) => `<li><a href="#" data-open="${esc(r.pedido_id)}">${esc(r.pedido_id)}</a>
        <span class="meta">${esc(r.hora)} ${esc(r.valor)} ${esc(r.estab)}</span>
        ${r.href ? `<button class="ghost" data-copiar="${esc(r.href)}" title="Copiar link do pedido">⧉</button>` : ''}
        ${podeAgirEm(r.analista) ? `<button class="ghost" data-rmreserva="${esc(r.pedido_id)}" title="Cancelar reserva">✕</button>` : ''}</li>`)
      .join('')}</ul>` : ''}</div>`;
  });
  const devolvidos = remote.atribuicoes.filter((a) => a.status === 'devolvido');
  if (devolvidos.length) h += `<div class="meta">${devolvidos.length} pedido(s) devolvido(s) aguardando outro analista ON e disponível.</div>`;
  const cs = contatos();
  if (cs.length) {
    h += `<div class="card sem"><h3>Para contato (${cs.length})</h3><ul>${cs
      .map((c) => {
        const naPagina = pedidos.some((x) => x.id === c.pedido_id);
        return `<li><a href="#" data-open="${esc(c.pedido_id)}">${esc(c.pedido_id)}</a>
          <span class="meta">${esc(c.hora)} · ${esc(c.valor)} · ${esc(c.estab)}<br>pedido de ${nomeHtml(c.analista)}${!naPagina && !usandoCache && !leitura.parcial ? ' · saiu da lista' : ''}</span>
          ${c.href ? `<button class="ghost" data-copiar="${esc(c.href)}" title="Copiar link do pedido">⧉</button>` : ''}
          ${podeEditarContato() ? `<button data-rmcontato="${esc(c.pedido_id)}" title="Remover marcação de contato e devolver à fila" aria-label="Remover marcação de contato do pedido ${esc(c.pedido_id)}">↩</button>` : ''}</li>`;
      })
      .join('')}</ul></div>`;
  }
  const saidos = usandoCache || leitura.parcial
    ? []
    : remote.atribuicoes
        .filter((a) => a.status === 'concluido' && !pedidos.some((p) => p.id === a.pedido_id))
        .sort((a, b) => String(b.atualizado_em).localeCompare(String(a.atualizado_em)))
        .slice(0, 8);
  if (saidos.length) {
    h += `<div class="card"><h3>Saíram da lista</h3><ul>${saidos
      .map((a) => `<li><a href="#" data-open="${esc(a.pedido_id)}">${esc(a.pedido_id)}</a>
        <span class="meta">saiu da lista — feito por: ${nomeHtml(a.analista)}</span>
        ${a.href ? `<button class="ghost" data-copiar="${esc(a.href)}" title="Copiar link do pedido">⧉</button>` : ''}</li>`)
      .join('')}</ul></div>`;
  }
  $('#painel').innerHTML = h;
}

function renderPainel() {
  local.mode === 'intervalo' ? renderIntervalo() : renderPilha();
  if (acaoEmCurso) $('#painel').querySelectorAll('button:not([data-loc]):not([data-copiar])').forEach((b) => { b.disabled = true; });
}

function renderTudo() {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('ativo', b.dataset.mode === local.mode));
  if (document.activeElement !== $('#codigo')) $('#codigo').value = local.codigo;
  $('#coordInfo').textContent = remote.coord ? '✔ Modo coordenação ativo: você pode agir em nome de qualquer analista.' : '';
  $('#conn').open = !local.codigo || !rede.ok;
  renderEu();
  renderUsos();
  renderPerm();
  if (!$('#cfgBody').contains(document.activeElement)) renderCfg();
  renderPainel();
  renderStatus();
}

/* ---------- histórico de ações ---------- */
const ROTULO = {
  recebeu_pedido: 'recebeu o pedido', concluiu_pedido: 'concluiu o pedido', marcou_para_contato: 'marcou para contato o pedido',
  removeu_de_contato: 'removeu da lista de contato o pedido', cancelou_reserva: 'cancelou a reserva', anexou_pedido: 'anexou o pedido',
  devolveu_pedido_a_fila: 'devolveu à fila o pedido', alterou_disponibilidade: 'alterou a disponibilidade',
  alterou_janela: 'alterou a janela de tempo', alterou_preferencias: 'alterou as lojas de preferência',
  zerou_pilha: 'zerou a pilha', assumiu_nome: 'assumiu o nome', liberou_nome: 'liberou o nome', liberou_pedido: 'liberou o pedido',
};
let historicoEmCurso = false;
let historico = { itens: [], cursor: null, temMais: false, erro: '', recarregar: false, atualizado: 0 };
const filtroHist = () => JSON.stringify([local.codigo, local.token, local.coord, $('#histFiltro').value, $('#histAcao').value, $('#histPedido').value.trim()]);
function renderHist() {
  $('#histResumo').textContent = historicoEmCurso ? 'Carregando ações…' : historico.erro || `${historico.itens.length} ação(ões) exibida(s)${historico.temMais ? ' · há ações anteriores' : ''}`;
  $('#histBody').innerHTML = historico.itens.length
    ? `<ul>${historico.itens.map((h) => `<li><div>
      <span class="meta">${esc(new Date(h.quando).toLocaleString('pt-BR'))}</span><br>
      ${h.acao === 'recebeu_pedido' && h.analista ? `${nomeHtml(h.analista)} ${esc(ROTULO[h.acao])}${h.ator !== h.analista ? ` <span class="meta">(distribuição acionada por ${nomeHtml(h.ator)})</span>` : ''}` : `${nomeHtml(h.ator)}${h.coord ? ' <span class="tag">(coordenação)</span>' : ''} ${esc(ROTULO[h.acao] || h.acao)}${h.analista && h.analista !== h.ator ? ` de ${nomeHtml(h.analista)}` : ''}`}${h.pedido_id ? ` · <strong>${esc(h.pedido_id)}</strong>` : ''}
      ${h.detalhe ? `<br><span class="meta">${esc(h.detalhe)}</span>` : ''}</div></li>`).join('')}</ul>`
    : '<div class="vazio">Nenhuma ação encontrada.</div>';
  $('#histMais').hidden = !historico.temMais;
  $('#histMais').disabled = historicoEmCurso;
}
async function carregarHist(mais = false) {
  if (!$('#hist').open || !local.codigo) return;
  if (historicoEmCurso) { if (!mais) historico.recarregar = true; return; }
  historicoEmCurso = true;
  const filtro = filtroHist();
  if (!mais) historico = { itens: [], cursor: null, temMais: false, erro: '', recarregar: false, atualizado: 0 };
  renderHist();
  try {
    const resultado = await rpc('fila_historico_pagina', {
      p_limite: 100, p_analista: $('#histFiltro').value || null, p_antes: mais ? historico.cursor : null,
      p_acao: $('#histAcao').value || null, p_pedido: $('#histPedido').value.trim() || null,
    });
    if (filtro !== filtroHist()) { historico.recarregar = true; return; }
    if (!resultado || !Array.isArray(resultado.itens)) throw new Error('Não foi possível carregar o histórico.');
    const mapa = new Map((mais ? historico.itens : []).map((h) => [h.id, h]));
    resultado.itens.forEach((h) => mapa.set(h.id, h));
    historico.itens = [...mapa.values()];
    historico.cursor = resultado.proximo;
    historico.temMais = !!resultado.temMais;
    historico.erro = '';
    historico.atualizado = Date.now();
  } catch (e) { historico.erro = e.message; }
  finally {
    historicoEmCurso = false;
    renderHist();
    if (historico.recarregar) { historico.recarregar = false; carregarHist(); }
  }
}
function abrirHist() {
  const dialogo = $('#hist');
  if (!dialogo.open) {
    if (typeof dialogo.showModal === 'function') dialogo.showModal();
    else dialogo.setAttribute('open', '');
  }
  carregarHist();
}
function fecharHist() {
  const dialogo = $('#hist');
  if (typeof dialogo.close === 'function') dialogo.close();
  else dialogo.removeAttribute('open');
  $('#btnHist').focus();
}

/* ---------- eventos ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  await loadLocal();
  renderTudo(); // mostra o que está salvo já na abertura, antes de a rede responder

  $('#btnLer').onclick = ler;

  $('#histFiltro').innerHTML = '<option value="">Todos os analistas</option>' + ANALISTAS.map((n) => `<option value="${n}">${n}</option>`).join('');
  $('#btnHist').onclick = abrirHist;
  $('#histFechar').onclick = fecharHist;
  $('#histFiltro').onchange = () => carregarHist();
  $('#histAcao').onchange = () => carregarHist();
  $('#histAtualizar').onclick = () => carregarHist();
  $('#histPedido').onkeydown = (e) => { if (e.key === 'Enter') carregarHist(); };
  $('#histMais').onclick = () => carregarHist(true);
  $('#hist').onkeydown = (e) => { if (e.key === 'Escape') fecharHist(); };

  $('#perm').onclick = async (e) => {
    if (e.target.id !== 'btnPerm') return;
    try { await chrome.permissions.request({ origins: [local.origem + '/*'] }); } catch (err) { rede = { ok: false, msg: err.message }; }
    await ler();
  };

  $('#codigo').oninput = (e) => { local.codigo = e.target.value.trim(); saveLocal(); };
  $('#btnCodigo').onclick = async () => {
    local.codigo = $('#codigo').value.trim();
    await saveLocal();
    await sync();
    renderTudo();
  };

  $('#eu').onchange = (e) => escolherNome(e.target.value);
  $('#btnLiberarNome').onclick = () => escolherNome('');

  $('#usos').onclick = async (e) => {
    const n = e.target.dataset.liberarNome;
    if (!n) return;
    const liberou = await acao(() => rpc('fila_liberar_nome', { p_nome: n }));
    if (liberou && n === local.me) { local.me = ''; await saveLocal(); }
    renderTudo();
  };

  document.querySelector('.tabs').onclick = async (e) => {
    const m = e.target.dataset.mode;
    if (!m) return;
    local.mode = m;
    await saveLocal();
    renderTudo();
  };

  $('#cfgBody').onchange = async (e) => {
    const t = e.target;
    if (t.id === 'data') {
      local.data = t.value;
      return renderPainel();
    }
    if (['jAuto', 'jInicio', 'jDur'].includes(t.id)) {
      const J = janela();
      const auto = $('#jAuto').checked;
      const inicio = $('#jInicio') ? $('#jInicio').value : J.inicio || agoraHHMM().slice(0, 2) + ':00';
      const dur = $('#jDur') ? Math.max(1, Number($('#jDur').value) || 60) : J.duracao;
      remote.janela = { ...remote.janela, janela_inicio: inicio, janela_duracao: String(dur), janela_auto: String(auto) };
      await acao(() => salvarJanela(inicio, dur, auto));
      return renderCfg();
    }
    if (!t.dataset.n) return;
    const n = t.dataset.n;
    const c = { ...cfg(n) };
    if (t.dataset.f === 'on') c.ligado = t.checked;
    else c[t.dataset.f] = t.value;
    remote.analistas[n] = { nome: n, ...c };
    const ok = await acao(async () => {
      if (t.dataset.f === 'on' && c.ligado && !remote.janela.janela_inicio) {
        const J = janela();
        const ini = agoraHHMM().slice(0, 2) + ':00';
        remote.janela = { ...remote.janela, janela_inicio: ini, janela_duracao: String(J.duracao), janela_auto: String(J.auto) };
        await salvarJanela(ini, J.duracao, J.auto);
      }
      await rpc('fila_set_analista', { p_nome: n, p_ligado: c.ligado, p_inicio: c.inicio || '', p_fim: c.fim || '' });
      if (t.dataset.f === 'on' && !c.ligado) await rpc('fila_liberar', { p_analista: n });
    });
    if (ok) {
      if (t.dataset.f === 'on' && c.ligado) { local.mode = 'pilha'; await saveLocal(); }
      await distribuirAutomatico();
    }
    renderTudo();
  };

  $('#cfgBody').onkeydown = (e) => {
    if (e.key === 'Enter' && e.target.id === 'anexId') $('#anexAdd').click();
  };

  $('#cfgBody').onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'jAgora') {
      const J = janela();
      const ini = agoraHHMM();
      remote.janela = { ...remote.janela, janela_inicio: ini, janela_duracao: String(J.duracao), janela_auto: 'true' };
      await acao(() => salvarJanela(ini, J.duracao, true));
      return renderCfg();
    }
    if (b.id === 'anexAdd') {
      const v = $('#anexId').value;
      await acao(async () => {
        try { anex = { msg: await anexarManual(v), erro: false, valor: '' }; } catch (err) { anex = { msg: err.message, erro: true, valor: v }; }
      });
      return renderCfg();
    }
    let lista = null;
    if (b.id === 'prefAdd') {
      const v = $('#prefNovo').value.trim();
      if (!v) return;
      lista = [...prefLojas().filter((l) => semAcento(l) !== semAcento(v)), v];
    } else if (b.dataset.rmpref !== undefined) {
      lista = prefLojas().filter((_, i) => i !== Number(b.dataset.rmpref));
    }
    if (lista) {
      remote.janela = { ...remote.janela, pref_lojas: JSON.stringify(lista) };
      await acao(() => rpc('fila_set_pref', { p_lista: JSON.stringify(lista) }));
      renderCfg();
    }
  };

  $('#painel').onclick = async (e) => {
    const t = e.target.closest('[data-open],[data-loc],[data-copiar],[data-concluir],[data-contato],[data-liberar],[data-rmcontato],[data-rmreserva],#btnProximo,#btnDestacar,#btnZerar');
    if (!t) return;
    e.preventDefault();
    const d = t.dataset;
    if (d.open) return abrir(d.open);
    if (d.loc) return destacar([d.loc], d.loc);
    if (d.copiar) return copiar(d.copiar, t);
    if (d.concluir) return acao(() => concluirEPuxar(d.concluir, d.pedido));
    if (d.liberar) return acao(() => liberarEPuxar(d.liberar, d.pedido));
    if (d.contato) return acao(() => avancarPedido(d.contato, 'contato', d.pedido));
    if (d.rmcontato) return acao(() => rpc('fila_devolver', { p_id: d.rmcontato }));
    if (d.rmreserva) return acao(() => rpc('fila_devolver', { p_id: d.rmreserva }));
    if (t.id === 'btnProximo') {
      const { map } = porIntervalo();
      if (map[local.me] && map[local.me][0]) abrir(map[local.me][0].id);
    }
    if (t.id === 'btnDestacar') {
      const { map } = porIntervalo();
      destacar((map[local.me] || []).map((p) => p.id));
    }
    if (t.id === 'btnZerar') {
      if (!zerarArmado) {
        zerarArmado = true;
        setTimeout(() => { zerarArmado = false; renderPainel(); }, 4000);
        return renderPainel();
      }
      zerarArmado = false;
      return acao(() => rpc('fila_zerar'));
    }
  };

  // Os eventos são registrados antes da rede, para a interface responder imediatamente.
  let agenda = null;
  const reler = () => {
    clearTimeout(agenda);
    agenda = setTimeout(async () => {
      await lerPedidos();
      renderPainel();
      renderStatus();
    }, 100);
  };
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    chrome.tabs.get(tabId).then((tab) => { if (ehAbaLista(tab)) reler(); }).catch(() => {});
  });
  chrome.tabs.onUpdated.addListener((id, info, tab) => { if (info.status === 'complete' && ehAbaLista(tab)) reler(); });

  // Ciclos independentes: uma raspagem lenta não interrompe o banco.
  // O próximo ciclo só é agendado depois que a consulta anterior terminou.
  const atualizar = async () => {
    try {
      const antes = JSON.stringify([remote.analistas, remote.janela]);
      if (!acaoEmCurso && await sync()) {
        await distribuirAutomatico();
        if (JSON.stringify([remote.analistas, remote.janela]) !== antes && !$('#cfgBody').contains(document.activeElement)) renderCfg();
        renderEu();
        renderUsos();
        if ($('#hist').open && historico.itens.length <= 100 && Date.now() - historico.atualizado >= 10000) carregarHist();
        const f = document.activeElement;
        if (!($('#painel').contains(f) && /INPUT|SELECT|TEXTAREA/.test(f.tagName))) renderPainel();
      }
      renderStatus();
    } finally {
      setTimeout(atualizar, INTERVALO_SYNC_MS);
    }
  };
  const leituraContinua = async () => {
    const inicio = Date.now();
    try { await lerPedidos(); renderPainel(); renderStatus(); }
    finally { setTimeout(leituraContinua, Math.max(0, INTERVALO_LEITURA_MS - (Date.now() - inicio))); }
  };
  leituraContinua();
  atualizar();
});
