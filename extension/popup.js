const ANALISTAS = ['Natalie', 'Cássio', 'Evangela', 'Gabriel', 'Kazaf', 'Rayla', 'Abigail', 'Alisson'];
const FV_ANALISTAS = ['Cássio', 'Gabriel'];
const COR = { Natalie: '#db2777', Cássio: '#ea580c', Evangela: '#7c3aed', Gabriel: '#2563eb', Kazaf: '#16a34a', Rayla: '#a16207', Abigail: '#0891b2', Alisson: '#475569' };
const PREF_PADRAO = ['Mateus Express', 'Mix Toureiro Farma'];
const LIMITE_ATRASO_MS = 30 * 60 * 1000; // 30 min com o mesmo pedido
const ORIGEM_PAINEL = 'https://af.mateusmais.com.br';
const INTERVALO_LEITURA_MS = 5000;
const INTERVALO_COMPLETA_MS = 60000;
const INTERVALO_SYNC_MS = 5000;
const TEMPO_BANCO_MS = 35 * 1000;
const RASPAGEM = { esperaTelaMs: 30000, tempoPaginaMs: 60000, tempoTotalMs: 180000, concorrencia: 2, maxPaginas: 40, esperaRetryMs: 1500 };

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoje = () => new Date().toLocaleDateString('sv-SE');
const agoraHHMM = () => new Date().toTimeString().slice(0, 5);
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const nomeHtml = (n) => `<span class="nome" data-nome="${esc(n)}" style="color:${COR[n] || 'inherit'}">${esc(n)}</span>`;

/* ---------- estado local (salvo neste computador, sobrevive ao fechar o painel) ---------- */
let local = { mode: 'pilha', me: '', data: hoje(), codigo: '', token: '', cache: null, origem: ORIGEM_PAINEL, coord: '' };
/* ---------- estado compartilhado (vem do banco) ---------- */
let gestaoSessao = '';
const credencialCoord = () => gestaoSessao || local.coord || null;
let descansos = { analistas: {} };
let descansoRelogio = 0;
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
let distribuicaoAssinatura = '';
let distribuicaoPendente = false;
let estadoLeitura = { lendo: false, erro: '' };
let rede = { ok: false, msg: '', hora: '' };
let zerarArmado = false;
let anex = { msg: '', erro: false, valor: '' };

/* ---------- configurações declarativas compartilhadas ---------- */
const CHAVE_CLIENTE = 'cliente_config_v1';
const BLOCOS_CLIENTE = ['cabecalho', 'status', 'conexao', 'identificacao', 'abas', 'gestao', 'analistas', 'pedidos'];
const CORES_CLIENTE = window.FilaAparencia.CORES;
const numeroCliente = (v, minimo, maximo, padrao) => typeof v === 'number' && Number.isInteger(v) && v >= minimo && v <= maximo ? v : padrao;
function normalizarCliente(valor) {
  try {
    if (typeof valor === 'string') {
      if (valor.length > 16000) return null;
      valor = JSON.parse(valor);
    }
    if (!valor || typeof valor !== 'object' || Array.isArray(valor) || valor.schema !== 1) return null;
    const l = valor.layout && typeof valor.layout === 'object' && !Array.isArray(valor.layout) ? valor.layout : {};
    const ordem = Array.isArray(l.ordem_blocos) ? l.ordem_blocos.filter((b) => BLOCOS_CLIENTE.includes(b)) : [];
    if (!ordem.includes('gestao')) { const i = ordem.indexOf('analistas'); if (i >= 0) ordem.splice(i, 0, 'gestao'); }
    const cores = {};
    if (l.cores && typeof l.cores === 'object' && !Array.isArray(l.cores)) {
      for (const [chave, cor] of Object.entries(l.cores)) {
        if (Object.hasOwn(CORES_CLIENTE, chave) && typeof cor === 'string' && /^#[0-9a-f]{6}$/i.test(cor)) cores[chave] = cor;
      }
    }
    return {
      schema: 1, revisao: numeroCliente(valor.revisao, 0, Number.MAX_SAFE_INTEGER, 0),
      leitura_ms: numeroCliente(valor.leitura_ms, 2000, 60000, INTERVALO_LEITURA_MS),
      layout: {
        tema: l.tema === 'local' || FilaCatalogoTemas.validoId(l.tema) ? l.tema : 'local',
        icone_suporte_url: FilaIconeSuporte.normalizar(l.icone_suporte_url),
        titulo: typeof l.titulo === 'string' && l.titulo.trim() ? l.titulo.trim().slice(0, 80) : 'AF Operação',
        fonte_px: numeroCliente(l.fonte_px, 11, 20, 13), espacamento_px: numeroCliente(l.espacamento_px, 4, 20, 8),
        margem_px: numeroCliente(l.margem_px, 4, 24, 12), raio_px: numeroCliente(l.raio_px, 0, 20, 8),
        largura_max_px: numeroCliente(l.largura_max_px, 320, 1200, null),
        cabecalho: l.cabecalho === 'coluna' ? 'coluna' : 'linha', cartoes: l.cartoes === 'grade' ? 'grade' : 'lista',
        ordem_blocos: [...new Set([...ordem, ...BLOCOS_CLIENTE])], cores,
      },
    };
  } catch (e) { return null; }
}
const clientePadrao = () => normalizarCliente({ schema: 1 });
let cliente = { contexto: '', config: clientePadrao(), erro: '', cache: false };
let reagendarLeitura = null;
const contextoCliente = () => JSON.stringify([SUPABASE_URL, local.codigo, local.token]);
let catalogoPedido = null;
let catalogoTentativa = { contexto: '', em: 0, revisao: null };

async function sincronizarCatalogo(versao, forcar = false) {
  const contexto = contextoCliente();
  await FilaCatalogoTemas.mudarContexto(contexto);
  if (contexto !== contextoCliente()) return false;
  const revisao = typeof versao === 'string' && /^\d+$/.test(versao) ? Number(versao) : versao;
  if (!forcar && (!Number.isSafeInteger(revisao) || revisao < 1)) return false;
  if (!forcar && revisao <= FilaCatalogoTemas.estado().revisao) {
    if (revisao === FilaCatalogoTemas.estado().revisao) FilaCatalogoTemas.confirmarConexao();
    return true;
  }
  if (catalogoPedido?.contexto === contexto) return catalogoPedido.promessa;
  if (!forcar && catalogoTentativa.contexto === contexto && catalogoTentativa.revisao === revisao && Date.now() - catalogoTentativa.em < 30000) return false;
  catalogoTentativa = { contexto, em: Date.now(), revisao };
  const pedido = { contexto, promessa: null };
  catalogoPedido = pedido;
  pedido.promessa = (async () => {
    try {
      const dados = await rpc('fila_temas_catalogo');
      if (contexto !== contextoCliente()) return false;
      return await FilaCatalogoTemas.receber(dados, contexto);
    } catch {
      if (contexto === contextoCliente()) FilaCatalogoTemas.indisponivel();
      return false;
    } finally {
      if (catalogoPedido === pedido) catalogoPedido = null;
    }
  })();
  return pedido.promessa;
}
function intervaloLeitura() { return cliente.config.leitura_ms; }
const segundosLeitura = () => (intervaloLeitura() / 1000).toLocaleString('pt-BR');

function aplicarCliente() {
  const l = cliente.config.layout;
  FilaIconeSuporte.definir(l.icone_suporte_url);
  const raiz = document.documentElement;
  for (const [propriedade, valor] of Object.entries({
    '--fila-fonte': l.fonte_px, '--fila-espaco': l.espacamento_px, '--fila-margem': l.margem_px,
    '--fila-raio': l.raio_px, '--fila-raio-botao': Math.max(0, l.raio_px - 2), '--fila-largura': l.largura_max_px,
  })) {
    if (valor === null) raiz.style.removeProperty(propriedade);
    else raiz.style.setProperty(propriedade, `${valor}px`);
  }
  raiz.dataset.temaEquipe = l.tema;
  raiz.dataset.cabecalho = l.cabecalho;
  document.querySelector('header h1').textContent = l.titulo === 'Fila de Pedidos' ? 'AF Operação' : l.titulo;
  $('#painel').dataset.cartoes = l.cartoes;
  const atuais = [...document.body.children].filter((n) => n.hasAttribute('data-bloco'));
  const desejados = l.ordem_blocos.map((b) => atuais.find((n) => n.dataset.bloco === b)).filter(Boolean);
  if (desejados.some((n, i) => n !== atuais[i])) {
    const foco = document.activeElement;
    const selecao = typeof foco.selectionStart === 'number' ? [foco.selectionStart, foco.selectionEnd] : null;
    for (const bloco of desejados) document.body.insertBefore(bloco, $('#hist'));
    if (foco.isConnected && foco !== document.body) {
      foco.focus({ preventScroll: true });
      if (selecao) foco.setSelectionRange(...selecao);
    }
  }
  document.dispatchEvent(new CustomEvent('fila:tema-equipe', { detail: { cores: l.cores } }));
  reagendarLeitura?.();
  renderClienteInfo();
}

function prepararCliente(restaurar = false) {
  const contexto = contextoCliente();
  if (cliente.contexto === contexto) return;
  FilaCatalogoTemas.mudarContexto(contexto);
  const salvo = restaurar && local.clienteCompartilhado?.contexto === contexto ? normalizarCliente(local.clienteCompartilhado.config) : null;
  cliente = { contexto, config: salvo || clientePadrao(), erro: '', cache: !!salvo };
  if (!salvo) delete local.clienteCompartilhado;
  aplicarCliente();
}

async function receberCliente(valor) {
  const proxima = valor === undefined ? clientePadrao() : normalizarCliente(valor);
  if (!proxima) {
    cliente.erro = 'Configuração da equipe inválida ou de uma versão mais recente. Mantendo a última configuração válida.';
    return renderClienteInfo();
  }
  const mudou = JSON.stringify(proxima) !== JSON.stringify(cliente.config);
  cliente.config = proxima;
  cliente.erro = '';
  cliente.cache = false;
  FilaIconeSuporte.definir(proxima.layout.icone_suporte_url);
  if (mudou) aplicarCliente();
  if (mudou || !local.clienteCompartilhado) {
    local.clienteCompartilhado = { contexto: cliente.contexto, config: proxima };
    try { await saveLocal(); } catch (e) { cliente.erro = 'Configuração aplicada; não foi possível salvar a cópia neste computador.'; }
  }
  renderClienteInfo();
}

function renderClienteInfo() {
  const el = $('#clienteInfo');
  if (!el) return;
  el.textContent = cliente.erro || (cliente.config.revisao
    ? `Configuração da equipe #${cliente.config.revisao} · leitura a cada ${segundosLeitura()} s${cliente.cache ? ' · cópia salva, aguardando conexão' : ''}`
    : `Leitura a cada ${segundosLeitura()} s · aguardando configuração da equipe`);
}

const saveLocal = () => chrome.storage.local.set({ local });
async function loadLocal() {
  const { local: s } = await chrome.storage.local.get('local');
  if (s) local = { ...local, ...s };
  if (!local.token) local.token = crypto.randomUUID();
  if (!local.origem) local.origem = ORIGEM_PAINEL;
  if (local.me && !ANALISTAS.includes(local.me)) local.me = '';
  if (chrome.storage.session) { const s = await chrome.storage.session.get('filaGestaoSessao'); if (s.filaGestaoSessao?.contexto === contextoCliente()) gestaoSessao = s.filaGestaoSessao.valor || ''; }
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
      body: JSON.stringify({ p_codigo: local.codigo, p_token: local.token, p_coord: credencialCoord(), ...args }),
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

async function sync(forcar = true) {
  if (syncEmCurso) {
    if (!forcar) return syncEmCurso;
    await syncEmCurso;
    return sync(true);
  }
  syncEmCurso = sincronizar(forcar);
  try { return await syncEmCurso; } finally { syncEmCurso = null; }
}

async function sincronizar(forcar = true) {
  prepararCliente();
  if (!local.codigo) {
    rede = { ok: false, msg: 'Informe o código da equipe em "Conexão".' };
    return false;
  }
  try {
    const contexto = JSON.stringify([local.codigo, local.token, credencialCoord()]);
    let d;
    if (chrome.runtime?.sendMessage) {
      const r = await chrome.runtime.sendMessage({tipo:'fila-sincronizar',contexto:JSON.stringify([SUPABASE_URL,local.codigo,local.token,credencialCoord()]),coord:credencialCoord(),forcar});
      if (!r?.ok) throw Error(r?.mensagem || 'Recarregue a extensão para atualizar a sincronização.');
      d = r.dados;
    } else d = await rpc('fila_estado', { p_token: local.token });
    if (contexto !== JSON.stringify([local.codigo, local.token, credencialCoord()])) return false;
    if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('O banco retornou uma resposta inválida.');
    const m = {};
    (d.analistas || []).forEach((a) => (m[a.nome] = a));
    remote.analistas = m;
    remote.atribuicoes = d.atribuicoes || [];
    remote.automaticos = d.automaticos || [];
    remote.concluidos_ids = d.concluidos_ids || [];
    remote.apoio_encerrados_ids = d.apoio_encerrados_ids || [];
    remote.janela = d.janela || {};
    remote.usuarios = d.usuarios || [];
    remote.coord = !!d.coord;
    try { const r = d.descansos || await rpc('fila_descanso'); descansos = r; descansoRelogio = Date.parse(d.servidor_em || r.servidor_em) - Date.now(); } catch { descansos = { analistas: {} }; }
    await publicarOcultacao();
    // A consulta do catálogo não bloqueia a fila nem a distribuição de pedidos.
    sincronizarCatalogo(remote.janela.temas_catalogo_revisao).catch(() => {});
    await receberCliente(remote.janela[CHAVE_CLIENTE]);
    rede = { ok: true, hora: new Date().toLocaleTimeString('pt-BR') };
    if (!escolhendoNome) await garantirNome();
    window.FilaGestao?.receber(d);
    window.FilaPedidoEfeito?.atualizar();
    return true;
  } catch (e) {
    FilaCatalogoTemas.indisponivel();
    if (/coordena/i.test(e.message)) { local.coord = ''; gestaoSessao = ''; remote.coord = false; chrome.storage.session?.remove('filaGestaoSessao'); saveLocal(); window.FilaGestao?.render(); }
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
const contatos = () => remote.atribuicoes.filter((a) => a.status === 'contato' && !a.apoio_saida_af_em && a.destino_apoio !== 'suporte');
const suportes = () => remote.atribuicoes.filter((a) => a.status === 'contato' && !a.apoio_saida_af_em && a.destino_apoio === 'suporte');
const ICONE_SUPORTE = '<svg viewBox="0 0 48 48" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;margin-right:3px"><path d="m20 5 1-3h7l1 7 5 2 5-4 6 6-4 5 2 5 3 1v7l-7 1-2 5-5-4-5 2-1 7h-7l-1-7-5-2-5 4-6-6 4-5-2-5-7-1v-7l7-1 2-5 5 4z" transform="translate(2 3) scale(.83)"/><path d="M28 19a9 9 0 0 0-12-8l6 6-5 5-6-6a9 9 0 0 0 9 12l14 14a6 6 0 0 0 8-8L28 20z"/></svg>';
const ocupados = () => new Set([...remote.atribuicoes.filter((a) => a.status !== 'devolvido').map((a) => a.pedido_id), ...(remote.automaticos || []).map(p=>p.pedido_id), ...(remote.concluidos_ids || [])]);
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
    const cfg = { esperaTelaMs: 30000, tempoPaginaMs: 60000, tempoTotalMs: 180000, concorrencia: 2, maxPaginas: 40, esperaRetryMs: 1500, cadenciaMs: 5000, ...opcoes };
    const novaLeitura = `Nova leitura em ${(cfg.cadenciaMs / 1000).toLocaleString('pt-BR')} s.`;
    const controleTotal = new AbortController();
    const prazo = Date.now() + cfg.tempoTotalMs;
    const timerTotal = setTimeout(() => controleTotal.abort(), cfg.tempoTotalMs);
    const conferirPrazo = () => {
      if (controleTotal.signal.aborted || Date.now() >= prazo) throw new Error(cfg.somenteTela ? `A tela do AF ainda não está pronta. ${novaLeitura}` : 'A leitura do AF excedeu 3 minutos. A última lista válida foi mantida.');
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
        if (Date.now() >= limiteTela) throw new Error(cfg.somenteTela ? `A tabela do AF ainda está carregando. ${novaLeitura}` : 'A tabela de pedidos do AF não ficou pronta em 30 s. Aguarde o carregamento e clique em Ler página.');
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
      const semFiltros = () => {
        const u = new URL(location.href); u.searchParams.delete('page'); u.hash = '';
        return u.href === 'https://af.mateusmais.com.br/' && filtro.href === u.href
          && ![...document.querySelectorAll('.dataTables_filter input,input[type="search"],input[type="date"],input[name*="search"],input[name*="filter"],input[name*="filtro"]')].some(e => String(e.value || '').trim());
      };
      const menuAtual = (document.querySelector('.main-menu') || document.body).textContent.match(/(\d+)\s*Pedidos em an[aá]lise/i);
      if (cfg.somenteTela) return {
        ok: true, pedidos: atual, porPagina, paginaAtual: cur, contexto: filtro.href, semFiltros: semFiltros(),
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
      return { ok: true, pedidos: [...mapa.values()], porPagina, paginaAtual: cur, contexto: filtro.href, semFiltros: semFiltros(), primeira: (porPagina[1] || []).length, paginas: Object.keys(porPagina).length, totalMenu: menu ? Number(menu[1]) : null };
    } catch (e) {
      return { ok: false, erro: controleTotal.signal.aborted && Date.now() >= prazo ? (cfg.somenteTela ? `A tela do AF ainda não está pronta. ${novaLeitura}` : 'A leitura do AF excedeu 3 minutos. A última lista válida foi mantida.') : e.message };
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
  // Envia também páginas obtidas pela varredura, não apenas a página visível.
  if (chrome.runtime?.sendMessage) {
    const observados = Object.values(r.porPagina || {}).flat();
    for (let i = 0; i < observados.length; i += 100) {
      chrome.runtime.sendMessage({ tipo: 'fila-af-captura', pedidos: observados.slice(i, i + 100) }).catch(() => {});
    }
  }
  await sincronizarSaidaApoio(r, completa, inicio);
}

async function sincronizarSaidaApoio(r, completa, inicio) {
  // Usa o resultado fresco da varredura, nunca a união de páginas antigas/cache.
  if (!r.ok || r.semFiltros !== true || r.contexto !== ORIGEM_PAINEL + '/' || !Array.isArray(r.pedidos)
      || !(completa || (r.paginas === 1 && r.paginaAtual === 1)) || !Number.isInteger(r.totalMenu)) return;
  const vistos = new Set(r.pedidos.map(p => p.id));
  if (vistos.size !== r.pedidos.length || vistos.size !== r.totalMenu || !Number.isFinite(descansoRelogio)) return;
  const ausentes = contatos().concat(suportes()).filter(a => !vistos.has(a.pedido_id)).map(a => a.pedido_id).slice(0, 1000);
  const presentes = (remote.apoio_encerrados_ids || []).filter(id => vistos.has(id)).slice(0, 1000);
  if (!ausentes.length && !presentes.length) return;
  const contexto = contextoCliente();
  try {
    const resultado = await rpc('fila_apoio_sincronizar_saida', {
      p_ausentes: ausentes, p_presentes: presentes, p_contexto: r.contexto, p_completa: true,
      p_total: vistos.size, p_menu: r.totalMenu, p_iniciada_em: new Date(inicio + descansoRelogio).toISOString(),
    });
    if (contexto !== contextoCliente()) return;
    if (resultado.removidos || resultado.retornados) await sync();
  } catch { /* Uma falha mantém os pedidos e a próxima leitura tenta novamente. */ }
}

async function lerCompleto(tab, contexto) {
  if (completaEmCurso) return completaEmCurso;
  const inicio = Date.now();
  completaEmCurso = (async () => {
    try {
      const r = await injetarLeitura(tab, RASPAGEM, RASPAGEM.tempoTotalMs + 5000);
      // Um filtro alterado durante a busca não pode receber resultados do filtro antigo.
      if (r.contexto === contexto && paginasLidas.contexto === contexto) {
        await aplicarLeitura(r, true, inicio);
        distribuirAutomatico();
      }
    } catch (e) { /* A tela mantém a cadência da equipe; as outras páginas serão tentadas novamente. */ }
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
    const inicio = Date.now();
    const r = await injetarLeitura(tab, { ...RASPAGEM, somenteTela: true, esperaTelaMs: 1500, tempoTotalMs: 1800, cadenciaMs: intervaloLeitura() }, 2000);
    await aplicarLeitura(r, false, inicio);
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
  const p = pedidos.find((x) => x.id === id) || remote.atribuicoes.find((x) => x.pedido_id === id) || (remote.automaticos || []).find(x=>x.pedido_id===id);
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
  const detalhes = lista.filter((p) => essenciais.has(p.id));
  const disponiveis = lista.filter((p) => !ocup.has(p.id) && !essenciais.has(p.id)).slice(0, Math.max(0, 1000 - detalhes.length));
  return [...new Map([...detalhes, ...disponiveis].map((p) => [p.id, p])).values()].slice(0, 1000)
    .map((p) => ({ id: p.id, hora: p.hora, valor: p.valor, estab: p.estab, href: p.href, cat: p.cat || '', preferencia: ehPref(p) }));
}

async function sincronizarAposAcao() {
  if (syncEmCurso) await syncEmCurso;
  return sync();
}

async function distribuirAutomatico() {
  if (distribuicaoEmCurso) {
    if (JSON.stringify(candidatosAuto()) !== distribuicaoAssinatura) distribuicaoPendente = true;
    return distribuicaoEmCurso;
  }
  if (acaoEmCurso || escolhendoNome || !rede.ok || (!local.me && !remote.coord) || usandoCache) return false;
  const registrados = new Set(remote.usuarios.map((u) => u.nome));
  const alguemLivre = ANALISTAS.some((n) => registrados.has(n) && cfg(n).ligado && !atualDe(n));
  const ocup = ocupados();
  const haPedidos = pedidos.some((p) => !ocup.has(p.id)) || remote.atribuicoes.some((a) => ['reservado','devolvido'].includes(a.status));
  if (!alguemLivre || !haPedidos) return false;
  const pool = candidatosAuto();
  distribuicaoAssinatura = JSON.stringify(pool);
  distribuicaoPendente = false;
  distribuicaoEmCurso = (async () => {
    try {
      const resultado = await rpc('fila_distribuir_auto', { p_candidatos: pool });
      if (resultado?.distribuidos > 0) await sincronizarAposAcao();
      return true;
    } catch (e) {
      rede = { ok: false, msg: e.message };
      return false;
    } finally { renderPainel(); renderStatus(); }
  })();
  try { return await distribuicaoEmCurso; } finally {
    distribuicaoEmCurso = null;
    distribuicaoAssinatura = '';
    if (distribuicaoPendente) {
      distribuicaoPendente = false;
      queueMicrotask(() => distribuirAutomatico().catch(() => {}));
    }
  }
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
  renderClienteInfo();
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
    else base += ` · leitura da tela a cada ${segundosLeitura()} s`;
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
  renderOcultacao();
  renderAlcancePainel();
  document.dispatchEvent(new CustomEvent('fila:identidade',{detail:{nome:local.me}}));
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
  h += `<table class="cfg"><tr><th>Analista</th><th>ON</th><th>Status / horário</th>${inter ? '<th>Início</th><th>Fim</th>' : ''}</tr>`;
  ANALISTAS.forEach((n) => {
    const c = cfg(n);
    const f = F[n];
    h += `<tr><td>${nomeHtml(n)}${descansoHtml(n)}</td>
      <td><input type="checkbox" data-n="${n}" data-f="on" ${c.ligado ? 'checked' : ''} ${podeAgirEm(n) ? '' : 'disabled'}></td>
      ${window.FilaGestao ? window.FilaGestao.celulaStatus(n, c) : '<td></td>'}
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
    <div class="card" data-card-analista data-analista="${esc(local.me)}" data-pedido-atual="${esc(atualDe(local.me)?.pedido_id || '')}">
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
  const ativos = ANALISTAS.filter((n) => cfg(n).ligado || remote.coord || atualDe(n)).sort((a, b) => (b === local.me) - (a === local.me));
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
    const destinoLoja = p && window.FilaGestao?.destinoLoja(p.estab);
    const saiu = a && !noPainel && !usandoCache && !leitura.parcial;
    const atr = atrasado(a); // cronômetro oculto: só aparece como animação vermelha
    h += `<div data-card-analista data-analista="${esc(n)}" data-pedido-atual="${esc(a?.pedido_id || '')}" class="card ${n === local.me ? 'voce' : ''} ${atr ? 'atraso' : ''}"><h3>${nomeHtml(n)}${n === local.me ? ' (você)' : ''}</h3>${
      p
        ? `<ul>${item(p, { atraso: atr })}</ul>${destinoLoja ? `<div class="meta">Loja direcionada para ${nomeHtml(destinoLoja)}</div>` : ''}${saiu ? '<div class="tag">Saiu da lista do AF · conclusão e origem da saída a confirmar</div>' : ''}
           <div class="linha">${podeAgirEm(n) ? `<button data-concluir="${n}" data-pedido="${esc(a.pedido_id)}" class="primario">✔ Concluí → próximo</button>` : ''}
           ${podeEditarContato() ? `<button data-contato="${n}" data-pedido="${esc(a.pedido_id)}" title="Marcar para contato e buscar o próximo para ${esc(n)}">📞 Para contato</button>` : ''}
           ${podeEditarContato() ? `<button data-suporte="${esc(n)}" data-pedido="${esc(a.pedido_id)}" title="Reter em suporte e buscar o próximo pedido">${FilaIconeSuporte.html(ICONE_SUPORTE)}Para suporte</button>` : ''}
           ${podeAgirEm(n) ? `<button data-liberar="${n}" data-pedido="${esc(a.pedido_id)}" ${destinoLoja === n ? 'disabled title="Solicite à gestão outro destino para esta loja ou pedido"' : 'title="Devolver à fila para redistribuir a outro analista ON"'}>↩ Liberar</button>` : ''}</div>`
        : `<div class="vazio">${cfg(n).ligado ? 'Aguardando pedido disponível…' : esc(window.FilaGestao?.rotuloStatus(cfg(n).atividade || 'off', n) || 'OFF') + ' · sem pedido atual'}</div>`
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
          <span class="meta">${esc(c.hora)} · ${esc(c.valor)} · ${esc(c.estab)}<br>pedido de ${nomeHtml(c.analista)}${!naPagina && !usandoCache && !leitura.parcial ? ' · verificando presença no AF' : ''}</span>
          ${c.href ? `<button class="ghost" data-copiar="${esc(c.href)}" title="Copiar link do pedido">⧉</button>` : ''}
          ${podeEditarContato() ? `<button data-rmcontato="${esc(c.pedido_id)}" title="Remover marcação de contato e devolver à fila" aria-label="Remover marcação de contato do pedido ${esc(c.pedido_id)}">↩</button>` : ''}</li>`;
      })
      .join('')}</ul></div>`;
  }
  const ss = suportes();
  if (ss.length) h += `<div class="card sem"><h3>${FilaIconeSuporte.html(ICONE_SUPORTE)}Para suporte (${ss.length})</h3><p class="meta">Retidos: não voltam à distribuição enquanto estiverem aqui.</p><ul>${ss.map(c=>`<li><a href="#" data-open="${esc(c.pedido_id)}">${esc(c.pedido_id)}</a><span class="meta">${esc(c.hora)} · ${esc(c.valor)} · ${esc(c.estab)}<br>pedido de ${nomeHtml(c.analista)}</span>${c.href ? `<button class="ghost" data-copiar="${esc(c.href)}" title="Copiar link">⧉</button>` : ''}${podeEditarContato() ? `<button data-rmsuporte="${esc(c.pedido_id)}" title="Remover de suporte e devolver à distribuição">↩ Remover</button>` : ''}</li>`).join('')}</ul></div>`;
  const saidos = usandoCache || leitura.parcial
    ? []
    : remote.atribuicoes
        .filter((a) => a.status === 'concluido' && !a.apoio_saida_af_em && !(remote.automaticos || []).some(p=>p.pedido_id===a.pedido_id) && !pedidos.some((p) => p.id === a.pedido_id))
        .sort((a, b) => String(b.atualizado_em).localeCompare(String(a.atualizado_em)))
        .slice(0, 8);
  if (saidos.length) {
    h += `<div class="card"><h3>Saíram da lista</h3><ul>${saidos
      .map((a) => `<li><a href="#" data-open="${esc(a.pedido_id)}">${esc(a.pedido_id)}</a>
        <span class="meta">Horário do pedido: ${esc(a.hora || 'não informado')}<br>Pedido concluído por: ${nomeHtml(a.analista)}</span>
        ${a.href ? `<button class="ghost" data-copiar="${esc(a.href)}" title="Copiar link do pedido">⧉</button>` : ''}</li>`)
      .join('')}</ul></div>`;
  }
  if (remote.automaticos?.length) h += `<div class="card"><h3>Pedidos aprovados automaticamente</h3><ul>${remote.automaticos.slice(0,8).map(a=>`<li><a href="#" data-open="${esc(a.pedido_id)}">${esc(a.pedido_id)}</a><span class="meta">Pedido aprovado automático · confirmado no AF · ${esc(a.valor || 'valor não informado')}</span>${a.href ? `<button class="ghost" data-copiar="${esc(a.href)}" title="Copiar link">⧉</button>` : ''}</li>`).join('')}</ul></div>`;
  $('#painel').innerHTML = h;
}

function renderPainel() {
  local.mode === 'intervalo' ? renderIntervalo() : renderPilha();
  if (acaoEmCurso) $('#painel').querySelectorAll('button:not([data-loc]):not([data-copiar])').forEach((b) => { b.disabled = true; });
  window.FilaPedidoEfeito?.aposRender?.();
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
  window.FilaGestao?.render();
}

/* ---------- histórico de ações ---------- */
const ROTULO = {
  retirou_apoio_saida_af: 'retirou do apoio após saída do AF', retornou_apoio_af: 'restaurou apoio após retorno ao AF',
  marcou_para_suporte: 'marcou para suporte o pedido', removeu_de_suporte: 'removeu de suporte o pedido',
  recebeu_pedido: 'recebeu o pedido', concluiu_pedido: 'concluiu o pedido', marcou_para_contato: 'marcou para contato o pedido',
  removeu_de_contato: 'removeu da lista de contato o pedido', cancelou_reserva: 'cancelou a reserva', anexou_pedido: 'anexou o pedido',
  devolveu_pedido_a_fila: 'devolveu à fila o pedido', alterou_disponibilidade: 'alterou a disponibilidade',
  alterou_janela: 'alterou a janela de tempo', alterou_preferencias: 'alterou as lojas de preferência',
  direcionou_loja: 'direcionou a loja', removeu_direcionamento: 'removeu o direcionamento da loja',
  zerou_pilha: 'zerou a pilha', assumiu_nome: 'assumiu o nome', liberou_nome: 'liberou o nome', liberou_pedido: 'liberou o pedido',
};
let historicoEmCurso = false;
let historico = { itens: [], cursor: null, temMais: false, erro: '', recarregar: false, atualizado: 0 };
let ranking = { hoje: [], geral: [], data: '', atualizado: 0, contexto: '' };
let periodoRanking = 'hoje';
const contextoRanking = () => JSON.stringify([local.codigo, local.token, credencialCoord()]);
function linhasRanking(linhas) {
  const nomes = new Set();
  return (Array.isArray(linhas) ? linhas : []).filter((r) => {
    if (!r || typeof r.nome !== 'string' || !r.nome.trim() || !Number.isSafeInteger(r.quantidade) || r.quantidade < 1 || nomes.has(r.nome)) return false;
    nomes.add(r.nome);
    return true;
  }).slice(0, 3);
}
function renderRanking() {
  const valido = ranking.contexto === contextoRanking() && ranking.atualizado > 0;
  const linhas = valido ? ranking[periodoRanking] : [];
  const medalhas = ['🥇','🥈','🥉'];
  $('#rankingPodio').innerHTML = [0,1,2].map((i) => {
    const r = linhas[i];
    const nome = r ? r.nome : 'Sem colocação';
    const total = r ? r.quantidade.toLocaleString('pt-BR') : '—';
    return `<li class="ranking-posicao ranking-posicao-${i + 1}${r ? '' : ' ranking-sem-dados'}" aria-label="${i + 1}º lugar: ${esc(nome)}${r ? `, ${r.quantidade} pedido${r.quantidade === 1 ? '' : 's'} concluído${r.quantidade === 1 ? '' : 's'}` : ''}">
      <span class="ranking-medalha" aria-hidden="true">${medalhas[i]}</span>
      <strong class="ranking-nome" title="${esc(nome)}">${esc(nome)}</strong>
      <span class="ranking-quantidade">${total}${r ? ` <small>${r.quantidade === 1 ? 'pedido' : 'pedidos'}</small>` : ''}</span>
      <span class="ranking-base" aria-hidden="true">${i + 1}º</span></li>`;
  }).join('');
  document.querySelectorAll('[data-ranking]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ranking === periodoRanking)));
  const resumo = $('#rankingResumo');
  resumo.title = 'Conta uma vez cada conclusão informada por analista, excluindo aprovações automáticas confirmadas no AF. Empates por ordem alfabética. Hoje usa o horário de São Luís.';
  resumo.textContent = historicoEmCurso && !valido ? 'Carregando ranking…'
    : !valido ? 'Ranking indisponível no momento.'
      : historico.erro ? 'Não foi possível atualizar · exibindo o último ranking.'
        : !linhas.length ? 'Nenhum pedido concluído neste período.'
          : periodoRanking === 'hoje' ? 'Concluídos hoje · horário de São Luís' : 'Concluídos em todo o histórico';
}
const filtroHist = () => JSON.stringify([local.codigo, local.token, local.coord, $('#histFiltro').value, $('#histAcao').value, $('#histPedido').value.trim()]);
function tituloHistorico(h) {
 if(h.acao==='pedido_aprovado_automatico') return 'Pedido aprovado automático <span class="meta">· confirmado no histórico do AF</span>';
 if(h.acao==='conclusao_reclassificada') return 'Conclusão anterior reclassificada como aprovação automática <span class="meta">· sem crédito ao analista</span>';
 if(h.acao==='recebeu_pedido' && h.analista){
  const origem=h.origem_liberacao;
  if(h.modalidade==='redistribuicao' && origem?.analista && origem.analista!==h.analista)
   return `${nomeHtml(h.analista)} recebeu o pedido <span class="meta">após liberação de ${nomeHtml(origem.analista)}</span>`;
  const automatico=h.modalidade==='automatica' || /^Distribuição automática;/.test(h.detalhe || '');
  return `${nomeHtml(h.analista)} ${automatico ? 'recebeu automaticamente o pedido' : 'recebeu o pedido'}`;
 }
 return `${nomeHtml(h.ator)}${h.coord ? ' <span class="tag">(coordenação)</span>' : ''} ${esc(ROTULO[h.acao] || h.acao)}${h.analista && h.analista!==h.ator ? ` de ${nomeHtml(h.analista)}` : ''}`;
}
function renderHist() {
  renderRanking();
  $('#histResumo').textContent = historicoEmCurso ? 'Carregando ações…' : historico.erro || `${historico.itens.length} ação(ões) exibida(s)${historico.temMais ? ' · há ações anteriores' : ''}`;
  $('#histBody').innerHTML = historico.itens.length
    ? `<ul>${historico.itens.map((h) => `<li><div>
      <span class="meta">${esc(new Date(h.quando).toLocaleString('pt-BR'))}</span><br>
      ${tituloHistorico(h)}${h.pedido_id ? ` · <strong>${esc(h.pedido_id)}</strong>` : ''}
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
    if (resultado.ranking && typeof resultado.ranking === 'object') {
      ranking = { hoje: linhasRanking(resultado.ranking.hoje), geral: linhasRanking(resultado.ranking.geral), data: resultado.ranking.data || '', atualizado: Date.now(), contexto: contextoRanking() };
    } else {
      ranking = { hoje: [], geral: [], data: '', atualizado: 0, contexto: '' };
    }
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
  document.addEventListener('fila:icone-suporte', () => renderTudo());
  document.addEventListener('error', e => {
    if (e.target?.classList?.contains('icone-suporte-remoto')) FilaIconeSuporte.falhou(e.target.getAttribute('src'));
  }, true);
  document.addEventListener('fila:atualizar-catalogo', () => sincronizarCatalogo(remote.janela.temas_catalogo_revisao, true));
  await loadLocal();
  window.FilaGestao?.iniciar();
  prepararCliente(true);
  renderTudo(); // mostra o que está salvo já na abertura, antes de a rede responder

  $('#btnLer').onclick = ler;
  $('#btnPermitirGlobal').onclick = async () => {
    try { const ok=await chrome.permissions.request({origins:['http://*/*','https://*/*']});
      if(ok){await chrome.runtime.sendMessage({tipo:'af-atualizar-painel-global'});}
      $('#painelGlobalInfo').textContent=ok?'Permissão concedida. Ative Ocultação ON para usar o painel nos sites.':'Permissão não concedida. O painel continua disponível no AF.';
    }catch(e){$('#painelGlobalInfo').textContent=e.message || 'Não foi possível solicitar a permissão.';}
  };
  $('#btnOcultacao').onclick = async () => { if (!local.me) return; const key = 'afOcultar:' + local.me; const s = await chrome.storage.local.get(key); await chrome.storage.local.set({[key]: !s[key]}); await publicarOcultacao(); await renderOcultacao(); };
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-descanso]'); if (!b) return; const n = b.dataset.descanso; if (n !== local.me || !rede.ok) return; if (!confirm('Iniciar seu descanso de 20 minutos? Ele conta como uma das duas pausas de hoje.')) return; acao(() => rpc('fila_descanso', {p_nome: n, p_iniciar: true})).then(() => renderCfg()); });
  setInterval(() => { document.querySelectorAll('[data-descanso-contador]').forEach((e) => { e.textContent = tempoDescanso(e.dataset.descansoContador); }); atualizarBotoesDescanso(); }, 1000);

  $('#histFiltro').innerHTML = '<option value="">Todos os analistas</option>' + ANALISTAS.map((n) => `<option value="${n}">${n}</option>`).join('');
  $('#btnHist').onclick = abrirHist;
  $('#histFechar').onclick = fecharHist;
  document.querySelectorAll('[data-ranking]').forEach((b) => {
    b.onclick = () => { periodoRanking = b.dataset.ranking; renderRanking(); };
  });
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

  $('#codigo').oninput = (e) => { local.codigo = e.target.value.trim(); prepararCliente(); saveLocal(); };
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
    if (t.dataset.atividade || t.dataset.atividadeHora) return window.FilaGestao?.alterarStatus(t);
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
    const t = e.target.closest('[data-open],[data-loc],[data-copiar],[data-concluir],[data-contato],[data-suporte],[data-rmsuporte],[data-liberar],[data-rmcontato],[data-rmreserva],#btnProximo,#btnDestacar,#btnZerar');
    if (!t) return;
    e.preventDefault();
    const d = t.dataset;
    if (d.open) return abrir(d.open);
    if (d.loc) return destacar([d.loc], d.loc);
    if (d.copiar) return copiar(d.copiar, t);
    if (d.concluir) return acao(() => concluirEPuxar(d.concluir, d.pedido));
    if (d.liberar) return acao(() => liberarEPuxar(d.liberar, d.pedido));
    if (d.suporte) return acao(() => rpc('fila_suporte', {p_nome:d.suporte,p_pedido:d.pedido,p_remover:false,p_candidatos:candidatosAuto()}));
    if (d.rmsuporte) { if (!confirm('Remover este pedido de suporte e disponibilizá-lo para distribuição?')) return; return acao(() => rpc('fila_suporte', {p_nome:null,p_pedido:d.rmsuporte,p_remover:true})); }
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
      const antes = JSON.stringify([remote.analistas, remote.janela, descansos.analistas]);
      if (!acaoEmCurso && await sync(false)) {
        await distribuirAutomatico();
        if (JSON.stringify([remote.analistas, remote.janela, descansos.analistas]) !== antes && !$('#cfgBody').contains(document.activeElement)) renderCfg();
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
  let timerLeitura = null;
  let inicioLeitura = 0;
  const leituraContinua = async () => {
    timerLeitura = null;
    inicioLeitura = Date.now();
    try { await lerPedidos(); renderPainel(); renderStatus(); }
    finally { timerLeitura = setTimeout(leituraContinua, Math.max(0, intervaloLeitura() - (Date.now() - inicioLeitura))); }
  };
  reagendarLeitura = () => {
    if (timerLeitura === null) return; // A leitura em curso agenda a próxima com o valor novo.
    clearTimeout(timerLeitura);
    timerLeitura = setTimeout(leituraContinua, Math.max(0, intervaloLeitura() - (Date.now() - inicioLeitura)));
  };
  leituraContinua();
  atualizar();

  // Persistência do estado dos menus details (conn, cfg e gestao).
  ['conn', 'cfg', 'gestao'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    chrome.storage.local.get([id]).then((resultado) => {
      const padrao = id === 'cfg'; // cfg inicia aberto por padrão, os demais fechados.
      if (resultado[id] !== undefined ? resultado[id] : padrao) el.setAttribute('open', '');
      else el.removeAttribute('open');
    });
    el.addEventListener('toggle', () => chrome.storage.local.set({ [id]: el.open }));
  });
});

/* Preferências por analista, sem credenciais compartilhadas com a página AF. */
async function publicarOcultacao() {
 const key = 'afOcultar:' + local.me;
 const s = local.me ? await chrome.storage.local.get(key) : {};
 await chrome.storage.local.set({afPainelFlutuante: {nome: local.me, ativo: !!local.me && !!s[key]}});
}
async function renderOcultacao() {
 const b = $('#btnOcultacao'); if (!b) return;
 const n = local.me; const key = 'afOcultar:' + n;
 const s = n ? await chrome.storage.local.get(key) : {};
 if (n !== local.me) return;
 b.disabled = !n;
 b.textContent = n ? `${n} · ocultação ${s[key] ? 'ON' : 'OFF'}` : 'Escolha seu nome para ativar ocultação';
 b.setAttribute('aria-pressed', String(!!s[key]));
}
function tempoDescanso(ate) {
 const segundos = Math.max(0, Math.ceil((Date.parse(ate) - Date.now() - descansoRelogio) / 1000));
 return segundos ? `${String(Math.floor(segundos/60)).padStart(2,'0')}:${String(segundos%60).padStart(2,'0')} restantes` : 'Finalizando descanso…';
}
function estadoDescanso(n) {
 const d=descansos.analistas?.[n], agora=Date.now()+descansoRelogio;
 if(n!==local.me)return {bloqueado:true,motivo:'Uso exclusivo de '+n};
 if(!rede.ok)return {bloqueado:true,motivo:'Aguarde a conexão com o banco'};
 if(!d)return {bloqueado:true,motivo:'Não foi possível consultar o descanso. Tente sincronizar.'};
 if(d.ate && Date.parse(d.ate)>agora)return {bloqueado:true,motivo:'Descanso em andamento'};
 if(d.usados>=2)return {bloqueado:true,motivo:'Duas pausas usadas hoje · limite de 40 min'};
 if(cfg(n).atividade!=='on')return {bloqueado:true,motivo:'Mude seu status para ON para descansar'};
 if(atualDe(n))return {bloqueado:true,motivo:'Conclua ou libere o pedido atual'};
 if(d.proximo_em && Date.parse(d.proximo_em)>agora){const min=Math.ceil((Date.parse(d.proximo_em)-agora)/60000);return {bloqueado:true,motivo:`Aguarde ${min} min em ON antes da próxima pausa`};}
 if(acaoEmCurso)return {bloqueado:true,motivo:'Salvando…'};
 return {bloqueado:false,motivo:'Disponível · pausa de 20 minutos'};
}
function descansoHtml(n) {
 const d=descansos.analistas?.[n], e=estadoDescanso(n);
 if(d?.ate && Date.parse(d.ate)>Date.now()+descansoRelogio)return `<div class="descanso-ativo">☕ Descanso <span data-descanso-contador="${esc(d.ate)}">${tempoDescanso(d.ate)}</span></div>`;
 return `<div class="descanso-opcao"><button data-descanso="${esc(n)}" title="${esc(e.motivo)}" ${e.bloqueado?'disabled':''}>☕ Descanso 20 min</button><small data-descanso-info="${esc(n)}">${d ? d.usados+'/2 hoje · ' : ''}${esc(e.motivo)}</small></div>`;
}
function atualizarBotoesDescanso() {
 document.querySelectorAll('[data-descanso]').forEach(b=>{
  const n=b.dataset.descanso,d=descansos.analistas?.[n],e=estadoDescanso(n);
  b.disabled=e.bloqueado;b.title=e.motivo;
  const info=b.parentElement.querySelector('[data-descanso-info]');
  if(info)info.textContent=(d?d.usados+'/2 hoje · ':'')+e.motivo;
 });
}

async function renderAlcancePainel(){
 const el=$('#painelGlobalInfo');if(!el)return;
 try{const s=await chrome.storage.local.get('afAlcancePainel'),a=s.afAlcancePainel;
 el.textContent=a?.http&&a?.https?'Painel permitido em sites HTTP e HTTPS.':'Para usar fora do AF, clique em Permitir painel em outros sites.';
 }catch{}
}
