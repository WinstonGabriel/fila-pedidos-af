/* O servidor fornece somente dados validados: nunca CSS, HTML ou JavaScript. */
(() => {
  'use strict';
  const CHAVE = 'filaCatalogoTemasV1';
  const CORES = FilaAparencia.CORES;
  const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
  const HEX = /^#[0-9a-f]{6}$/i;
  const OBRIGATORIAS = ['fundo', 'cartao', 'texto', 'texto_secundario', 'primaria', 'destaque', 'borda', 'link'];
  const ESTILOS = ['simples', 'metal', 'aurora', 'hextech', 'tricolor', 'nuvens'];
  const validoId = (id) => typeof id === 'string' && ID.test(id) && id !== 'local';

  function normalizar(valor) {
    try {
      if (typeof valor === 'string') {
        if (valor.length > 98304) return null;
        valor = JSON.parse(valor);
      }
      if (!valor || typeof valor !== 'object' || Array.isArray(valor) || valor.schema !== 1 ||
          !Number.isSafeInteger(valor.revisao) || valor.revisao < 0 ||
          !Array.isArray(valor.temas) || valor.temas.length < 1 || valor.temas.length > 50) return null;
      if (JSON.stringify(valor).length > 98304) return null;
      const ids = new Set();
      const temas = [];
      for (const t of valor.temas) {
        if (!t || !validoId(t.id) || ids.has(t.id) || typeof t.nome !== 'string' ||
            !t.nome.trim() || t.nome.length > 60 || !['claro', 'escuro'].includes(t.modo) ||
            !t.cores || typeof t.cores !== 'object' || Array.isArray(t.cores)) return null;
        const cores = {};
        for (const [chave, cor] of Object.entries(t.cores)) {
          if (!Object.hasOwn(CORES, chave)) continue;
          if (typeof cor !== 'string' || !HEX.test(cor)) return null;
          cores[chave] = cor.toLowerCase();
        }
        if (OBRIGATORIAS.some((chave) => !cores[chave])) return null;
        ids.add(t.id);
        temas.push({
          id: t.id, nome: t.nome.trim(),
          icone: typeof t.icone === 'string' ? Array.from(t.icone).slice(0, 6).join('') : '◐',
          descricao: typeof t.descricao === 'string' ? t.descricao.slice(0, 180) : '',
          modo: t.modo, estilo: ESTILOS.includes(t.estilo) ? t.estilo : 'simples',
          pulso: t.pulso === true, novo: t.novo === true,
          energia: typeof t.energia === 'string' && HEX.test(t.energia) ? t.energia.toLowerCase() : cores.destaque,
          cores,
        });
      }
      return { schema: 1, revisao: valor.revisao, temas };
    } catch { return null; }
  }

  const inicial = normalizar(FilaAparencia.CATALOGO_INICIAL);
  let catalogo = inicial;
  let contexto = null, hashContexto = '', geracao = 0, pronto = Promise.resolve();
  let origem = 'embutido', erro = '';
  let assinatura = JSON.stringify(inicial);
  const emitir = (alterado = false) => document.dispatchEvent(new CustomEvent('fila:catalogo-temas', {
    detail: { alterado, revisao: catalogo.revisao, origem, erro },
  }));
  const estado = () => ({ revisao: catalogo.revisao, origem, erro, total: catalogo.temas.length });

  function mudarContexto(novo) {
    if (contexto === novo) return pronto;
    contexto = novo;
    const vez = ++geracao;
    catalogo = inicial;
    assinatura = JSON.stringify(inicial);
    origem = 'embutido'; erro = ''; hashContexto = '';
    emitir(true);
    pronto = (async () => {
      try {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(novo));
        const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
        const salvo = (await chrome.storage.local.get(CHAVE))[CHAVE];
        if (vez !== geracao) return;
        hashContexto = hash;
        const dados = salvo?.contexto === hash && normalizar(salvo.dados);
        if (dados) {
          catalogo = dados; assinatura = JSON.stringify(dados); origem = 'salvo'; emitir(true);
        }
      } catch {
        if (vez === geracao) { erro = 'Usando os temas incluídos nesta versão.'; emitir(); }
      }
    })();
    return pronto;
  }

  async function receber(valor, novoContexto) {
    const esperando = mudarContexto(novoContexto);
    const vez = geracao;
    await esperando;
    if (vez !== geracao || contexto !== novoContexto) return false;
    if (valor === undefined || valor === null) return false;
    const dados = normalizar(valor);
    if (!dados) {
      if (!erro) { erro = 'Catálogo indisponível. Seus temas continuam disponíveis.'; emitir(); }
      return false;
    }
    if (dados.revisao < catalogo.revisao) return false;
    const proxima = JSON.stringify(dados);
    const alterado = proxima !== assinatura;
    const mudouEstado = origem !== 'online' || !!erro;
    catalogo = dados; assinatura = proxima; origem = 'online'; erro = '';
    if (alterado || mudouEstado) emitir(alterado);
    if (alterado || mudouEstado) {
      try {
        if (hashContexto) await chrome.storage.local.set({ [CHAVE]: { contexto: hashContexto, dados } });
      } catch {
        if (vez === geracao) { erro = 'Temas aplicados. A cópia offline não pôde ser salva.'; emitir(); }
      }
    }
    return true;
  }

  function indisponivel() {
    if (origem === 'online') { origem = 'salvo'; emitir(); }
  }

  function confirmarConexao() {
    if (origem !== 'online' || erro) { origem = 'online'; erro = ''; emitir(); }
  }

  function aplicarPaleta(elemento, tema, substituicoes = {}) {
    for (const propriedade of Object.values(CORES)) elemento.style.removeProperty(propriedade);
    const c = tema.cores;
    const base = tema.modo === 'escuro' ? {
      botao: c.cartao, botao_hover: c.borda, borda_botao: c.borda, input: c.fundo,
      desativado: c.cartao, erro: '#ff9292', sucesso: '#82e0a2', aviso: '#f2c66d', vazio: c.texto_secundario,
      fundo_aviso: c.cartao, borda_aviso: c.borda, fundo_perigo: '#3b1418', borda_perigo: '#7f353d',
      meu_pedido: c.cartao, borda_meu_pedido: c.destaque, chip: c.fundo, atraso: '#3b1418', borda_atraso: '#f87171',
      primaria_texto: '#ffffff', destaque_texto: '#ffffff',
    } : inicial.temas[0].cores;
    for (const [chave, cor] of Object.entries({ ...base, ...c, ...substituicoes })) {
      if (Object.hasOwn(CORES, chave) && typeof cor === 'string' && HEX.test(cor)) elemento.style.setProperty(CORES[chave], cor);
    }
    elemento.style.setProperty('--tema-energia', tema.energia);
    const rgb = [1, 3, 5].map((i) => parseInt(tema.energia.slice(i, i + 2), 16)).join(', ');
    elemento.style.setProperty('--tema-energia-rgb', rgb);
    elemento.dataset.temaModo = tema.modo;
    elemento.dataset.temaEstilo = tema.estilo;
    elemento.dataset.temaPulso = String(tema.pulso);
  }

  window.FilaCatalogoTemas = Object.freeze({
    normalizar, validoId, mudarContexto, receber, indisponivel, confirmarConexao, estado, aplicarPaleta,
    listar: () => catalogo.temas.slice(),
    obter: (id) => catalogo.temas.find((t) => t.id === id),
  });
})();
