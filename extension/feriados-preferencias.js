/* Preferências de folga: prazo, identidade e ordem são decididos no servidor. */
(() => {
  'use strict';
  let periodo = null, dados = null, geracao = 0, contexto = '', ultimo = 0, pendente = null;
  const enviando = new Set();
  const box = () => document.getElementById('feriadoPreferencias');
  const identidade = () => JSON.stringify([contextoCliente(), local.me, remote.coord, credencialCoord()]);
  const horario = (valor) => new Date(valor).toLocaleString('pt-BR', {
    timeZone: 'America/Fortaleza', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const data = (v) => String(v).split('-').reverse().join('/');
  const venceu = (f) => !f.aberto || Date.now() >= Date.parse(f.prazo_em) - Date.parse(dados.servidor_em) + ultimo;
  const situacoes = {folga: 'Folga definida', trabalho: 'Trabalho definido', feriado: 'Feriado definido', ferias: 'Férias definidas', atestado: 'Atestado definido'};
  function limpar() {
    geracao++; dados = null; periodo = null; contexto = ''; ultimo = 0; pendente = null;
    enviando.clear();
    if (box()) { box().hidden = true; box().replaceChildren(); }
  }
  function renderizar() {
    if (!box()) return;
    if (contexto !== identidade()) { limpar(); return; }
    if (!dados || dados.gestao !== !!remote.coord) return;
    const feriados = dados.feriados || [];
    box().hidden = !feriados.length;
    if (!feriados.length) {box().replaceChildren(); return;}
    box().innerHTML = `<h3>Preferência para folgar no feriado</h3><p class="meta">${remote.coord
      ? 'As três primeiras solicitações de cada feriado. A definição continua com Coordenação/Gestão.'
      : 'A gestão visualiza as três primeiras solicitações. O envio não confirma a folga.'}</p>` + feriados.map(f => {
      const prazo = horario(Date.parse(f.prazo_em) - 1000);
      let corpo;
      if (remote.coord) {
        const primeiras = (f.primeiras || []).slice(0, 3);
        corpo = primeiras.length ? `<ol class="feriado-solicitacoes">${primeiras.map(p => `<li><div><strong>${esc(p.analista)}</strong><small class="meta">${esc(horario(p.solicitado_em))} · ${esc(situacoes[p.escala_tipo] || 'Aguarda definição')}</small></div><button type="button" data-feriado-editar="${esc(p.analista)}" data-feriado-data="${esc(f.data)}">Definir escala</button></li>`).join('')}</ol>` : '<p class="meta">Nenhuma solicitação.</p>';
      } else {
        const enviada = f.minha;
        corpo = `<button type="button" class="feriado-solicitar" data-feriado-solicitar="${esc(f.data)}" ${enviada || venceu(f) || !dados.analista || enviando.has(f.data) ? 'disabled' : ''}>${enviada ? '✓ Preferência enviada' : enviando.has(f.data) ? 'Enviando…' : venceu(f) ? 'Prazo encerrado' : 'Quero folgar'}</button>`;
        if (enviada) corpo += `<small class="meta">${esc(horario(enviada.solicitado_em))} · ${Number(enviada.posicao)}ª solicitação${Number(enviada.posicao) > 3 ? ' · fora das três primeiras' : ''}</small>`;
        else if (!dados.analista) corpo += '<small class="meta">Escolha seu nome em “Eu sou” para solicitar.</small>';
      }
      return `<article class="feriado-preferencia"><div><strong>${esc(data(f.data))} · ${esc(f.nome)}</strong><small class="meta">Prazo: ${esc(prazo)} · São Luís</small></div>${corpo}</article>`;
    }).join('') + '<p id="feriadoFeedback" class="meta" role="status" aria-live="polite"></p>';
    box().onclick = async e => {
      const editar = e.target.closest('[data-feriado-editar]');
      if (editar && remote.coord) { window.FilaGestao?.editor(editar.dataset.feriadoEditar, editar.dataset.feriadoData); return; }
      const botao = e.target.closest('[data-feriado-solicitar]');
      if (!botao || botao.disabled || remote.coord) return;
      const dia = botao.dataset.feriadoSolicitar, ctx = identidade(), versao = geracao;
      if (enviando.has(dia)) return;
      enviando.add(dia); renderizar();
      try {
        const r = await rpc('fila_feriado_solicitar_folga', {p_data: dia, p_coord: null});
        if (ctx !== identidade() || versao !== geracao) return;
        const f = dados.feriados.find(f => f.data === dia);
        if (f) f.minha = r;
        enviando.delete(dia); renderizar();
        document.getElementById('feriadoFeedback').textContent = 'Preferência registrada. Aguarde a definição da gestão.';
      } catch (error) {
        if (ctx !== identidade() || versao !== geracao) return;
        enviando.delete(dia); renderizar();
        document.getElementById('feriadoFeedback').textContent = error.message;
      }
    };
  }
  function carregar(p, forcar = true) {
    if (!box()) return Promise.resolve();
    const ctx = identidade();
    if (!forcar && (pendente || (contexto === ctx && Date.now() - ultimo < 30000))) return pendente || Promise.resolve();
    const vez = ++geracao;
    periodo = {...p}; contexto = ctx; dados = null; enviando.clear();
    box().hidden = false; box().textContent = 'Consultando preferências de folga…';
    pendente = (async () => {
      try {
        const d = await rpc('fila_feriados_preferencias', {p_inicio: p.inicio, p_fim: p.fim});
        if (vez !== geracao || ctx !== identidade()) return;
        dados = d; ultimo = Date.now(); renderizar();
      } catch (error) {
        if (vez !== geracao || ctx !== identidade()) return;
        ultimo = Date.now();
        box().textContent = 'Não foi possível consultar as preferências. Clique em Atualizar para tentar novamente.';
      } finally { if (vez === geracao) pendente = null; }
    })();
    return pendente;
  }
  function atualizar(p = periodo) {
    if (contexto !== identidade()) {
      limpar();
      if (p && document.getElementById('escalaDialogo').open) carregar(p);
      return;
    }
    if (periodo && document.getElementById('escalaDialogo').open && !enviando.size) carregar(periodo, false);
  }
  window.FilaFeriadosPreferencias = Object.freeze({carregar, limpar, renderizar, atualizar});
})();
