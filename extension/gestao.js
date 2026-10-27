/* Gestão e escala compartilham o RPC autenticado da fila; nenhuma edição depende só da interface. */
(() => {
  'use strict';
  const estados = {
    on: 'ON',
    off: 'OFF',
    intervalo: 'Intervalo',
    ferias: 'Férias',
    contato_tel: 'Contato tel',
    em_call: 'Em call',
    missao: 'Missão',
    cbks: 'CBKs',
    valid: 'Valid',
    folga: 'Folga',
  };
  const tipos = {
    trabalho: 'Trabalho',
    folga: 'Folga',
    feriado: 'Feriado',
    ferias: 'Férias',
    atestado: 'Atestado',
    nao_definido: 'Não definido',
  };
  const presencas = { nao_informada: 'Não informada', trabalhou: 'Trabalhou', ausente: 'Ausente' };
  const el = (id) => document.getElementById(id),
    valor = (id) => el(id).value;
  const fmt = (d) => String(d).split('-').reverse().join('/');
  const date = (s) => new Date(s + 'T12:00:00');
  const day = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const somar = (s, n) => {
    const d = date(s);
    d.setDate(d.getDate() + n);
    return day(d);
  };
  const chave = (n, d) => n + '|' + d;
  let tooltipFeriado = null, pinoFeriado = null;
  function ocultarTooltipFeriado() {
    if (!tooltipFeriado) return;
    tooltipFeriado.hidePopover?.();
    tooltipFeriado.hidden = true;
    pinoFeriado = null;
  }
  function mostrarTooltipFeriado(pino) {
    if (!pino) return;
    pinoFeriado = pino;
    tooltipFeriado.textContent = pino.getAttribute('aria-label');
    tooltipFeriado.hidden = false;
    // O popover fica acima da tabela e do dialog, sem corte na rolagem.
    tooltipFeriado.showPopover?.();
    const r = pino.getBoundingClientRect(), t = tooltipFeriado.getBoundingClientRect();
    const d = tooltipFeriado.showPopover ? {left: 0, top: 0, right: innerWidth, bottom: innerHeight}
      : el('escalaDialogo').getBoundingClientRect();
    const esquerda = Math.max(d.left + 8, Math.min(r.right - t.width, d.right - t.width - 8));
    const topo = r.bottom + 6 + t.height <= d.bottom - 8 ? r.bottom + 6 : r.top - t.height - 6;
    tooltipFeriado.style.left = esquerda + 'px';
    tooltipFeriado.style.top = Math.max(d.top + 8, topo) + 'px';
  }
  function prepararTooltipFeriado() {
    if (tooltipFeriado) return;
    tooltipFeriado = document.createElement('div');
    tooltipFeriado.id = 'escalaFeriadoTooltip';
    tooltipFeriado.className = 'escala-feriado-tooltip';
    tooltipFeriado.setAttribute('role', 'tooltip');
    tooltipFeriado.hidden = true;
    if (tooltipFeriado.showPopover) tooltipFeriado.setAttribute('popover', 'manual');
    const dialogo = el('escalaDialogo'), grade = el('escalaGrade');
    dialogo.append(tooltipFeriado);
    const pinoDoEvento = (e) => e.target.closest?.('.escala-feriado-pino');
    grade.addEventListener('pointerover', (e) => mostrarTooltipFeriado(pinoDoEvento(e)));
    grade.addEventListener('pointerout', (e) => {
      const pino = pinoDoEvento(e);
      if (pino && !pino.contains(e.relatedTarget) && document.activeElement !== pino) ocultarTooltipFeriado();
    });
    grade.addEventListener('focusin', (e) => mostrarTooltipFeriado(pinoDoEvento(e)));
    grade.addEventListener('focusout', (e) => { if (pinoDoEvento(e)) ocultarTooltipFeriado(); });
    dialogo.addEventListener('scroll', ocultarTooltipFeriado, true);
    dialogo.addEventListener('close', ocultarTooltipFeriado);
    dialogo.addEventListener('cancel', ocultarTooltipFeriado);
    dialogo.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !tooltipFeriado.hidden) {
        ocultarTooltipFeriado();
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
    window.addEventListener('resize', ocultarTooltipFeriado);
    window.addEventListener('blur', ocultarTooltipFeriado);
  }
  let iniciado = false,
    versao = 0,
    contexto = '',
    rows = new Map(),
    periodo = null,
    carregando = 0,
    ultimoRelatorio = null,
    avisos = null,
    ultimoAvisoCheck = 0,
    avisosPendente = null,
    previa = [],
    importAbort = null,
    editando = null,
    rotaEdicao = null,
    pedidoAvisosEm = 0;
  const abrir = (d) => {
    if (!d.open) d.showModal ? d.showModal() : d.setAttribute('open', '');
  };
  const fechar = (d) => {
    if (d.open) d.close ? d.close() : d.removeAttribute('open');
  };
  function feedback(id, msg, erro = false) {
    el(id).textContent = msg;
    el(id).classList.toggle('erro', erro);
  }
  function opcoes(lista, primeiro = '') {
    return (
      (primeiro ? `<option value="">${esc(primeiro)}</option>` : '') +
      lista.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('')
    );
  }
  function rotuloStatus(atividade, n, c) {
    if (atividade === 'intervalo' && n) {
      c = c || (typeof cfg === 'function' ? cfg(n) : {});
      const ate = Object.hasOwn(c, 'descanso_ate') ? c.descanso_ate
        : typeof descansos !== 'undefined' ? descansos.analistas?.[n]?.ate : null;
      const diferenca = typeof descansoRelogio === 'number' && Number.isFinite(descansoRelogio) ? descansoRelogio : 0;
      if (Date.parse(ate) > Date.now() + diferenca) return 'Pausa 20min';
    }
    return estados[atividade] || atividade;
  }
  function celulaStatus(n, c) {
    const atividade = c.atividade || (c.ligado ? 'on' : 'off');
    const rotulo = rotuloStatus(atividade, n, c);
    return `<td><select class="status-analista" data-atividade="${esc(n)}" aria-label="Status de ${esc(n)}" ${podeAgirEm(n) ? '' : 'disabled'}>${Object.entries(
      estados,
    )
      .map(([v, t]) => `<option value="${v}" ${v === atividade ? 'selected' : ''}>${v === atividade ? rotulo : t}</option>`)
      .join(
        '',
      )}</select>${atividade === 'intervalo' ? `<div class="status-periodo"><input type="time" data-atividade-hora="${esc(n)}" data-campo="inicio" value="${esc(c.atividade_inicio || '')}" aria-label="Início de ${esc(rotulo)} de ${esc(n)}" ${podeAgirEm(n) ? '' : 'disabled'}><input type="time" data-atividade-hora="${esc(n)}" data-campo="fim" value="${esc(c.atividade_fim || '')}" aria-label="Fim de ${esc(rotulo)} de ${esc(n)}" ${podeAgirEm(n) ? '' : 'disabled'}></div>` : ''}</td>`;
  }
  async function alterarStatus(t) {
    const n = t.dataset.atividade || t.dataset.atividadeHora,
      c = cfg(n);
    let atividade = t.dataset.atividade ? t.value : c.atividade || 'off',
      inicio = c.atividade_inicio || '',
      fim = c.atividade_fim || '';
    if (t.dataset.atividade) {
      inicio = '';
      fim = '';
    } else if (t.dataset.campo === 'inicio') inicio = t.value;
    else fim = t.value;
    await acao(() =>
      rpc('fila_mudar_status', { p_nome: n, p_atividade: atividade, p_inicio: inicio, p_fim: fim }),
    );
    if (atividade === 'on') {
      local.mode = 'pilha';
      await saveLocal();
      await distribuirAutomatico();
    }
    // A seleção acabou; permite renderizar imediatamente os campos do novo status.
    if (document.activeElement === t) t.blur();
    renderTudo();
  }
  function render() {
    if (!iniciado) return;
    window.FilaFeriadosPreferencias?.atualizar(periodo);
    renderRotas();
    el('gestaoLogin').hidden = !!remote.coord;
    el('gestaoSessao').hidden = !remote.coord;
    el('gestaoOpcoes').hidden = !remote.coord;
    el('gestaoIdentidade').textContent = remote.coord
      ? (remote.gestao_nome || 'Acesso de gestão ativo') + ' · consulta sem marcar ON'
      : '';
    document.querySelectorAll('[data-so-gestao]').forEach((n) => (n.hidden = !remote.coord));
    if (!remote.coord) {
      fechar(el('escalaEditar'));
      if (!el('importarSecao').hidden || !el('relatorioSecao').hidden) tab('escala');
    }
    const n = valor('gestaoAlvo');
    if (remote.coord && !el('gestaoOperacao').contains(document.activeElement)) {
      const filtrados = n ? [n] : ANALISTAS;
      el('gestaoOperacao').innerHTML =
        `<div class="escala-scroll"><table class="escala-tabela"><thead><tr><th>Analista</th><th>Status</th><th>Pedido atual</th><th>Reservas</th></tr></thead><tbody>${filtrados
          .map((n) => {
            const c = cfg(n),
              a = atualDe(n);
            return `<tr><th>${nomeHtml(n)}</th>${celulaStatus(n, c)}<td>${a ? `${esc(a.pedido_id)}<br><small>${esc(a.estab)}</small>` : '—'}</td><td>${reservadosDe(n).length}</td></tr>`;
          })
          .join('')}</tbody></table></div>`;
    }
    for (const id of [
      'gestaoLojas',
      'gestaoSalvarLojas',
      'gestaoPedido',
      'gestaoVincular',
      'gestaoTransferir',
      'gestaoOff',
      'gestaoLiberarNome',
    ])
      el(id).disabled = !remote.coord || !n;
    if (document.activeElement !== el('gestaoLojas') && !el('gestaoLojas').dataset.sujo)
      el('gestaoLojas').value = (remote.preferencias_analistas?.[n] || []).join('\n');
    if (periodo && !el('escalaDialogo').open) periodo = null;
  }
  const normalizarLoja = (s) =>
    semAcento(s)
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  function renderRotas() {
    const rotas = remote.direcionamentos_lojas || [];
    const nomes = [
      ...new Set(
        [
          ...pedidos.map((p) => p.estab),
          ...remote.atribuicoes.map((p) => p.estab),
          ...rotas.map((r) => r.loja),
        ].filter((s) => typeof s === 'string' && s.trim()),
      ),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    el('rotaSugestoes').innerHTML = nomes
      .slice(0, 2000)
      .map((n) => `<option value="${esc(n)}"></option>`)
      .join('');
    const filtro = valor('gestaoAlvo'),
      lista = rotas.filter((r) => !filtro || r.analista === filtro);
    el('rotaLista').innerHTML =
      lista
        .map(
          (r) =>
            `<div class="rota-item"><div class="rota-descricao"><strong>${esc(r.loja)}</strong><small>→ ${nomeHtml(r.analista)}</small></div><button type="button" data-rota-editar="${esc(r.loja_chave)}">Alterar</button><button type="button" data-rota-remover="${esc(r.loja_chave)}" data-versao="${r.versao}">Remover</button></div>`,
        )
        .join('') || '<p class="meta">Nenhuma loja direcionada neste filtro.</p>';
  }
  function prepararRota() {
    const k = normalizarLoja(valor('rotaLoja'));
    if (rotaEdicao?.chave === k) return;
    const atual = (remote.direcionamentos_lojas || []).find((r) => r.loja_chave === k);
    rotaEdicao = { chave: k, versao: atual?.versao || 0 };
    if (atual) el('rotaAnalista').value = atual.analista;
  }
  async function salvarRota(e) {
    e.preventDefault();
    if (!remote.coord) return;
    prepararRota();
    const b = e.currentTarget.querySelector('button[type=submit]');
    b.disabled = true;
    try {
      await executar(async () => {
        await rpc('fila_rota_salvar', {
          p_loja: valor('rotaLoja').trim(),
          p_analista: valor('rotaAnalista'),
          p_versao: rotaEdicao.versao,
        });
        el('rotaForm').reset();
        rotaEdicao = null;
      }, 'Direcionamento salvo. Pedidos automáticos desta loja aguardam o analista ficar ON e livre.');
    } finally {
      b.disabled = false;
    }
  }
  async function abrirAvisos(eventoId) {
    abrir(el('avisosDialogo'));
    await carregarAvisos(true);
    if (eventoId) {
      const n = el('avisosLista').querySelector(`[data-aviso-id="${Number(eventoId)}"]`);
      n?.classList.add('destacado');
      n?.scrollIntoView?.({ block: 'nearest' });
    }
  }
  async function confirmarAvisos(ids) {
    const ctx = contextoCliente();
    const d = await rpc('fila_aviso_confirmar', { p_ids: ids });
    if (ctx !== contextoCliente()) return;
    avisos = d;
    renderAvisos();
    chrome.runtime?.sendMessage?.({ tipo: 'fila-atualizar-avisos', forcar: true }).catch(() => {});
  }
  async function pedidoAbrirAvisos(p) {
    if (!p || p.quando <= pedidoAvisosEm || Date.now() - p.quando > 300000) return;
    pedidoAvisosEm = p.quando;
    await abrirAvisos(p.evento_id);
    await chrome.storage.session?.remove('filaAbrirAvisos');
  }
  async function executar(fn, msg = 'Alteração salva.') {
    try {
      feedback('gestaoFeedback', 'Salvando…');
      await fn();
      await sync();
      renderTudo();
      feedback('gestaoFeedback', msg);
      return true;
    } catch (e) {
      feedback('gestaoFeedback', e.message, true);
      return false;
    }
  }
  async function salvarSessao(v) {
    gestaoSessao = v || '';
    if (chrome.storage.session)
      await chrome.storage.session.set({
        filaGestaoSessao: { contexto: contextoCliente(), valor: gestaoSessao },
      });
  }
  async function entrar(e) {
    e.preventDefault();
    const button = e.currentTarget.querySelector('button');
    button.disabled = true;
    feedback('gestaoFeedback', 'Verificando código…');
    try {
      const r = await rpc('fila_gestao_entrar', {
        p_pin: valor('gestaoPin'),
        p_perfil: valor('gestaoPerfil'),
        p_responsavel: valor('gestaoResponsavel').trim(),
        p_coord: null,
      });
      el('gestaoPin').value = '';
      if (!r?.ok) throw Error(r?.mensagem || 'Não foi possível entrar.');
      await salvarSessao(r.sessao);
      await sync();
      renderTudo();
      feedback(
        'gestaoFeedback',
        'Acesso ativo por até 8 horas. Você pode acompanhar a operação sem escolher um analista ou marcar ON.',
      );
    } catch (err) {
      el('gestaoPin').value = '';
      feedback('gestaoFeedback', err.message, true);
    } finally {
      button.disabled = false;
    }
  }
  function calcularPeriodo() {
    const ref = valor('escalaReferencia') || hoje();
    let inicio, fim;
    if (valor('escalaModo') === 'mes') {
      inicio = ref.slice(0, 7) + '-01';
      const d = date(inicio);
      d.setMonth(d.getMonth() + 1);
      d.setDate(0);
      fim = day(d);
    } else {
      const d = date(ref),
        offset = (d.getDay() + 6) % 7;
      inicio = somar(ref, -offset);
      fim = somar(inicio, 6);
    }
    return { inicio, fim };
  }
  async function carregarEscala() {
    const seq = ++carregando,
      ctx = contextoCliente();
    feedback('escalaFeedback', 'Consultando escala…');
    const p = calcularPeriodo();
    try {
      const d = await rpc('fila_escala_consultar', { p_inicio: p.inicio, p_fim: p.fim, p_analista: null });
      if (seq !== carregando || ctx !== contextoCliente()) return;
      rows = new Map((d.itens || []).map((e) => [chave(e.analista, e.data), e]));
      periodo = p;
      versao = Number(d.versao || versao);
      renderEscala();
      window.FilaFeriadosPreferencias?.carregar(p);
      feedback(
        'escalaFeedback',
        remote.coord
          ? 'Clique em um dia para editar ou use “Editar período”.'
          : 'Escala disponível para consulta.',
      );
    } catch (e) {
      feedback('escalaFeedback', e.message, true);
    }
  }
  function renderEscala() {
    if (!periodo) return;
    prepararTooltipFeriado();
    const pinoAnterior = pinoFeriado, focoNoPino = pinoAnterior === document.activeElement;
    const dataAnterior = pinoAnterior?.closest('[data-escala-data]')?.dataset.escalaData;
    const retanguloAnterior = pinoAnterior?.getBoundingClientRect();
    ocultarTooltipFeriado();
    const dias = [];
    for (let d = periodo.inicio; d <= periodo.fim; d = somar(d, 1)) dias.push(d);
    const analistas = valor('escalaAnalista') ? [valor('escalaAnalista')] : ANALISTAS;
    const feriados = new Map();
    for (const e of rows.values()) {
      if (typeof e.feriado_referencia === 'string' && e.feriado_referencia.trim())
        feriados.set(e.data, e.feriado_referencia.trim());
    }
    el('escalaPeriodo').textContent =
      `${fmt(periodo.inicio)} a ${fmt(periodo.fim)} · ${remote.coord ? 'edição pela gestão' : 'somente consulta'}`;
    el('escalaGrade').innerHTML =
      `<table class="escala-tabela"><thead><tr><th class="fixo">Analista</th>${dias
        .map((d) => {
          const feriado = feriados.get(d);
          const titulo = feriado ? esc('Feriado: ' + feriado) : '';
          const pino = feriado
            ? `<span class="escala-feriado-pino" role="img" tabindex="0" aria-label="${titulo}" aria-describedby="escalaFeriadoTooltip"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g transform="rotate(30 12 12)"><path d="M12 15v7" stroke="#9ca3af" stroke-width="1.8" stroke-linecap="round"/><path d="M8 5v5l-2 3v2h12v-2l-2-3V5Z" fill="#dc2626" stroke="#991b1b" stroke-width="1.2" stroke-linejoin="round"/><rect x="6" y="2" width="12" height="4" rx="2" fill="#ef4444"/><path d="M8 3.5h7" stroke="#fca5a5" stroke-linecap="round"/></g></svg></span>`
            : '';
          return `<th scope="col" data-escala-data="${d}">${date(d).toLocaleDateString('pt-BR', { weekday: 'short' })}<br>${fmt(d).slice(0, 5)}${pino}</th>`;
        })
        .join('')}</tr></thead><tbody>${analistas
        .map(
          (n) =>
            `<tr><th class="fixo" scope="row">${nomeHtml(n)}</th>${dias
              .map((d) => {
                const e = rows.get(chave(n, d)),
                  tipo = e?.tipo || 'nao_definido';
                return `<td class="tipo-${tipo}"><${remote.coord ? 'button' : 'span'} class="escala-dia ${remote.coord ? 'editavel' : ''}" ${remote.coord ? `data-editar-nome="${esc(n)}" data-editar-data="${d}"` : ''} title="${esc([n, fmt(d), tipos[tipo], e?.observacao, e?.presenca && presencas[e.presenca]].filter(Boolean).join(' · '))}">${tipo === 'trabalho' ? e?.inicio || 'Trabalho' : tipos[tipo] || '—'}${tipo === 'trabalho' && e?.fim ? `<small>até ${esc(e.fim)}</small>` : ''}${e?.presenca === 'trabalhou' ? '<small>✓ Presença confirmada</small>' : ''}</${remote.coord ? 'button' : 'span'}></td>`;
              })
              .join('')}</tr>`,
        )
        .join('')}</tbody></table>`;
    if (dataAnterior) {
      const pino = el('escalaGrade').querySelector(`[data-escala-data="${dataAnterior}"] .escala-feriado-pino`);
      if (pino) {
        const r = pino.getBoundingClientRect();
        if (focoNoPino) pino.focus({preventScroll: true});
        else if (r.left === retanguloAnterior.left && r.top === retanguloAnterior.top) mostrarTooltipFeriado(pino);
      }
    }
  }
  function tab(t) {
    ocultarTooltipFeriado();
    if (!remote.coord && t !== 'escala') t = 'escala';
    el('escalaSecao').hidden = t !== 'escala';
    el('relatorioSecao').hidden = t !== 'relatorio';
    el('importarSecao').hidden = t !== 'importar';
    document
      .querySelectorAll('[data-escala-tab]')
      .forEach((b) => b.setAttribute('aria-selected', String(b.dataset.escalaTab === t)));
    feedback('escalaFeedback', '');
  }
  async function abrirEscala(t = 'escala') {
    abrir(el('escalaDialogo'));
    tab(t);
    if (t === 'escala') await cargar();
    else if (t === 'relatorio') await relatorio();
  }
  const cargar = () => carregarEscala();
  function editor(n, d) {
    if (!remote.coord || !periodo) return;
    ocultarTooltipFeriado();
    editando = { rows: new Map(rows), periodo: { ...periodo } };
    const e = rows.get(chave(n, d));
    el('editarAnalista').value = n || valor('escalaAnalista') || '';
    el('editarDe').value = d || periodo.inicio;
    el('editarAte').value = d || periodo.fim;
    for (const id of ['editarDe', 'editarAte']) {
      el(id).min = periodo.inicio;
      el(id).max = periodo.fim;
    }
    el('editarTipo').value = e?.tipo || 'trabalho';
    el('editarInicio').value = e?.inicio || '';
    el('editarFim').value = e?.fim || '';
    el('editarPresenca').value = 'manter';
    el('editarObservacao').value = e?.observacao || '';
    el('editarSemana')
      .querySelectorAll('input')
      .forEach((c) => (c.checked = true));
    feedback(
      'editarFeedback',
      'A edição usa a versão exibida. Atualize a escala se outra pessoa fizer mudanças.',
    );
    abrir(el('escalaEditar'));
  }
  async function salvarEscala(e) {
    e.preventDefault();
    if (!remote.coord || !editando) return;
    const b = e.currentTarget.querySelector('[type=submit]');
    b.disabled = true;
    try {
      const inicio = valor('editarDe'),
        fim = valor('editarAte'),
        nomes = valor('editarAnalista') ? [valor('editarAnalista')] : ANALISTAS;
      if (inicio < editando.periodo.inicio || fim > editando.periodo.fim || fim < inicio)
        throw Error('Use um intervalo dentro do período exibido.');
      const week = new Set(
        [...el('editarSemana').querySelectorAll('input:checked')].map((c) => Number(c.value)),
      );
      const itens = [];
      for (let d = inicio; d <= fim; d = somar(d, 1)) {
        if (!week.has(date(d).getDay())) continue;
        for (const n of nomes) {
          const old = editando.rows.get(chave(n, d));
          const tipo = valor('editarTipo');
          itens.push({
            analista: n,
            data: d,
            tipo,
            inicio: tipo === 'trabalho' ? valor('editarInicio') : '',
            fim: tipo === 'trabalho' ? valor('editarFim') : '',
            presenca:
              valor('editarPresenca') === 'manter'
                ? old?.presenca || 'nao_informada'
                : valor('editarPresenca'),
            observacao: valor('editarObservacao').trim(),
            versao: old?.versao || 0,
          });
        }
      }
      if (!itens.length) throw Error('Selecione pelo menos um dia.');
      feedback('editarFeedback', 'Salvando…');
      const r = await rpc('fila_escala_salvar', { p_itens: itens, p_origem: 'Edição manual da escala' });
      fechar(el('escalaEditar'));
      await carregarEscala();
      await sync();
      feedback(
        'escalaFeedback',
        `${r.alterados} dia(s) alterado(s). Os analistas afetados receberão um aviso.`,
      );
    } catch (err) {
      feedback('editarFeedback', err.message, true);
    } finally {
      b.disabled = false;
    }
  }
  async function relatorio() {
    if (!remote.coord) return;
    try {
      feedback('escalaFeedback', 'Consultando relatório…');
      ultimoRelatorio = await rpc('fila_gestao_relatorio', {
        p_inicio: valor('relatorioInicio'),
        p_fim: valor('relatorioFim'),
        p_analista: valor('relatorioAnalista') || null,
      });
      const r = ultimoRelatorio;
      el('relatorioResultado').innerHTML =
        FilaRelatorioProducao.html(r.producao) +
        `<div class="escala-scroll"><table class="escala-tabela"><thead><tr><th>Analista</th><th>Previstos</th><th>Trabalhados<br>confirmados</th><th>Folgas</th><th>Feriados</th><th>Férias</th><th>Pedidos<br>concluídos</th><th>Dias com<br>atividade</th></tr></thead><tbody>${r.resumo.map((x) => `<tr><th>${nomeHtml(x.nome)}</th>${['previstos', 'trabalhados_confirmados', 'folgas', 'feriados', 'ferias', 'concluidos', 'dias_com_atividade'].map((k) => `<td>${Number(x[k] || 0)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><h3>Dias por analista</h3><div class="escala-scroll"><table class="escala-tabela"><thead><tr><th>Analista</th><th>Data</th><th>Situação</th><th>Horário</th><th>Presença</th><th>Observação</th></tr></thead><tbody>${r.dias.map((x) => `<tr><th>${nomeHtml(x.analista)}</th><td>${fmt(x.data)}</td><td class="tipo-${x.tipo}">${esc(tipos[x.tipo])}</td><td>${esc(x.inicio)}${x.fim ? '–' + esc(x.fim) : ''}</td><td>${esc(presencas[x.presenca])}</td><td>${esc(x.observacao)}</td></tr>`).join('') || '<tr><td colspan="6">Sem escala registrada neste período.</td></tr>'}</tbody></table></div>`;
      el('relatorioExportar').disabled = false;
      feedback('escalaFeedback', 'Relatório atualizado.');
    } catch (e) {
      feedback('escalaFeedback', e.message, true);
    }
  }
  function exportar() {
    if (!ultimoRelatorio || !remote.coord) return;
    const linhas = [
      ...FilaRelatorioProducao.csv(ultimoRelatorio.producao),
      ['Analista', 'Data', 'Situação', 'Entrada', 'Saída', 'Presença', 'Observação'],
      ...ultimoRelatorio.dias.map((x) => [
        x.analista,
        x.data,
        tipos[x.tipo],
        x.inicio,
        x.fim,
        presencas[x.presenca],
        x.observacao,
      ]),
    ];
    const csv =
      '\ufeff' +
      linhas
        .map((r) =>
          r
            .map(
              (v) =>
                '"' +
                String(v ?? '')
                  .replace(/^[=+@-]/, "'$&")
                  .replace(/"/g, '""') +
                '"',
            )
            .join(';'),
        )
        .join('\r\n');
    const u = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })),
      a = document.createElement('a');
    a.href = u;
    a.download = `escala-${valor('relatorioInicio')}-${valor('relatorioFim')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  function renderPrevia() {
    el('escalaPrevia').innerHTML =
      `<table class="escala-tabela"><thead><tr><th>Salvar</th><th>Analista</th><th>Data</th><th>Situação</th><th>Entrada</th><th>Saída</th></tr></thead><tbody>${previa
        .map(
          (x, i) =>
            `<tr data-prev-row="${i}" class="${x.conflito ? 'conflito' : ''}"><td><input type="checkbox" data-prev="${i}" data-f="selecionado" ${x.selecionado ? 'checked' : ''} aria-label="Salvar linha ${i + 1}"></td><td><select data-prev="${i}" data-f="analista" aria-label="Analista da linha ${i + 1}">${ANALISTAS.map((n) => `<option ${n === x.analista ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></td><td><input data-prev="${i}" data-f="data" type="date" value="${x.data}" aria-label="Data da linha ${i + 1}"></td><td><select data-prev="${i}" data-f="tipo" aria-label="Situação da linha ${i + 1}">${Object.entries(
              tipos,
            )
              .map(([v, t]) => `<option value="${v}" ${v === x.tipo ? 'selected' : ''}>${t}</option>`)
              .join(
                '',
              )}</select></td><td><input type="time" data-prev="${i}" data-f="inicio" value="${esc(x.inicio)}" aria-label="Entrada da linha ${i + 1}"></td><td><input type="time" data-prev="${i}" data-f="fim" value="${esc(x.fim)}" aria-label="Saída da linha ${i + 1}"></td></tr>`,
        )
        .join('')}</tbody></table>`;
    el('importarConfirmacao').hidden = false;
    el('importarAplicar').hidden = false;
    el('importarRevisei').checked = false;
  }
  async function reconhecer() {
    if (!remote.coord) return;
    const file = el('importarArquivo').files[0];
    if (!file) return feedback('escalaFeedback', 'Selecione um arquivo.', true);
    const [ano, mes] = valor('importarMes').split('-').map(Number);
    importAbort = new AbortController();
    el('importarReconhecer').disabled = true;
    el('importarAplicar').disabled = true;
    el('importarCancelar').hidden = false;
    el('importarAplicar').hidden = true;
    el('importarConfirmacao').hidden = true;
    previa = [];
    el('escalaPrevia').textContent = '';
    try {
      const r = await FilaImportar.lerArquivo(
        file,
        { ano, mes },
        (m) => feedback('escalaFeedback', m),
        importAbort.signal,
      );
      if (r.itens.length > 1500)
        throw Error('Reconhecidos mais de 1.500 dias. Separe o documento por período para revisar.');
      previa = r.itens.map((x) => ({ ...x, selecionado: !x.conflito }));
      el('importarAvisos').textContent = r.avisos.slice(0, 60).join('\n');
      renderPrevia();
      feedback(
        'escalaFeedback',
        `${previa.length} dia(s) reconhecido(s). Revise a prévia antes de salvar. Linhas conflitantes começam desmarcadas.`,
      );
      // A versão é capturada na prévia. Outra edição posterior provoca conflito no servidor.
      const datas = previa.map((x) => x.data).sort();
      const atual = await rpc('fila_escala_consultar', {
        p_inicio: datas[0],
        p_fim: datas.at(-1),
        p_analista: null,
      });
      const base = new Map(atual.itens.map((x) => [chave(x.analista, x.data), x]));
      previa.forEach((x) => {
        x.baseAnalista = x.analista;
        x.baseData = x.data;
        x.versao = base.get(chave(x.analista, x.data))?.versao || 0;
        x.presenca = base.get(chave(x.analista, x.data))?.presenca || 'nao_informada';
      });
    } catch (e) {
      previa = [];
      el('escalaPrevia').textContent = '';
      el('importarAplicar').hidden = true;
      el('importarConfirmacao').hidden = true;
      feedback('escalaFeedback', e.name === 'AbortError' ? 'Leitura cancelada.' : e.message, true);
    } finally {
      importAbort = null;
      el('importarReconhecer').disabled = false;
      el('importarAplicar').disabled = false;
      el('importarCancelar').hidden = true;
    }
  }
  async function aplicarImportacao() {
    if (!remote.coord) return;
    if (!el('importarRevisei').checked)
      return feedback('escalaFeedback', 'Marque a confirmação de revisão.', true);
    const selecionados = previa.filter((x) => x.selecionado);
    if (!selecionados.length) return feedback('escalaFeedback', 'Selecione pelo menos um dia.', true);
    if (selecionados.some((x) => x.baseAnalista !== x.analista || x.baseData !== x.data))
      return feedback(
        'escalaFeedback',
        'Você alterou nomes ou datas. Clique em “Atualizar versões da prévia” para verificar os destinos antes de salvar.',
        true,
      );
    el('importarAplicar').disabled = true;
    try {
      const itens = selecionados.map(
        ({ analista, data, tipo, inicio, fim, observacao, presenca, versao }) => ({
          analista,
          data,
          tipo,
          inicio: tipo === 'trabalho' ? inicio : '',
          fim: tipo === 'trabalho' ? fim : '',
          observacao,
          presenca,
          versao,
        }),
      );
      const r = await rpc('fila_escala_salvar', {
        p_itens: itens,
        p_origem: 'Importação: ' + el('importarArquivo').files[0].name,
      });
      feedback('escalaFeedback', `${r.alterados} dia(s) salvo(s). Avisos enviados aos analistas afetados.`);
      el('importarAplicar').hidden = true;
      el('importarConfirmacao').hidden = true;
      await sync();
    } catch (e) {
      feedback('escalaFeedback', e.message, true);
    } finally {
      el('importarAplicar').disabled = false;
    }
  }
  async function atualizarVersoesPrevia() {
    if (!previa.length) return;
    try {
      const ds = previa.map((x) => x.data).sort();
      const r = await rpc('fila_escala_consultar', { p_inicio: ds[0], p_fim: ds.at(-1), p_analista: null }),
        base = new Map(r.itens.map((x) => [chave(x.analista, x.data), x]));
      for (const x of previa) {
        const e = base.get(chave(x.analista, x.data));
        x.versao = e?.versao || 0;
        x.presenca = e?.presenca || 'nao_informada';
        x.baseAnalista = x.analista;
        x.baseData = x.data;
      }
      el('importarRevisei').checked = false;
      feedback('escalaFeedback', 'Destinos atualizados. Revise novamente antes de salvar.');
    } catch (e) {
      feedback('escalaFeedback', e.message, true);
    }
  }
  async function receberAvisos(d,ctx=contextoCliente()) {
    if(ctx!==contextoCliente())return;
    avisos=d;ultimoAvisoCheck=Date.now();renderAvisos();
    if(d.analista){
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(local.codigo+'|'+local.token));
      if(ctx===contextoCliente())await FilaBaloes.receber({...d,contexto:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')});
    }
  }
  async function carregarAvisos(force = false) {
    if (avisosPendente) return avisosPendente;
    if (!force && Date.now() - ultimoAvisoCheck < 8000) return;
    const ctx = contextoCliente();
    avisosPendente = (async () => {
      try {
        let d;
        if(chrome.runtime?.sendMessage){
          const r=await chrome.runtime.sendMessage({tipo:'fila-atualizar-avisos',forcar:force});
          if(!r?.ok)throw Error(r?.mensagem||'Não foi possível atualizar os avisos.');
          d=(await chrome.storage.local.get('filaNotificacoesUI')).filaNotificacoesUI;
          const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(local.codigo+'|'+local.token));
          if(!d||d.contexto!==Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''))return;
        }else d=await rpc('fila_avisos');
        await receberAvisos(d,ctx);
      } catch (e) {
        if (el('avisosDialogo').open) el('avisosResumo').textContent = e.message;
      } finally {
        avisosPendente = null;
      }
    })();
    return avisosPendente;
  }
  function renderAvisos() {
    if (!avisos) return;
    const total = Number(avisos.nao_lidos || 0);
    el('avisosContagem').textContent = total > 99 ? '99+' : String(total);
    el('avisosContagem').hidden = !total;
    el('btnAvisos').classList.toggle('tem-avisos', total > 0);
    el('btnAvisos').setAttribute('aria-label', total ? `Notificações: ${total} não lidas` : 'Notificações');
    el('avisosResumo').textContent = avisos.analista
      ? `${avisos.analista} · ${avisos.nao_lidos || 0} aviso(s) não lido(s). Exibindo os 100 mais recentes.`
      : 'Escolha seu nome em “Eu sou” para consultar seus avisos.';
    el('avisosLista').innerHTML =
      (avisos.itens || [])
        .map(
          (e) =>
            `<article data-aviso-id="${e.id}" class="aviso-item ${!e.lido && e.id > (avisos.lido_ate || 0) ? 'novo' : ''}"><div class="aviso-titulo">${FilaBaloes.icone}<span>${esc(FilaBaloes.resumo(e).titulo)}</span></div><p>${esc(FilaBaloes.resumo(e).texto)}</p><small class="meta">${esc(FilaBaloes.resumo(e).autor)} · ${esc(new Date(e.quando).toLocaleString('pt-BR'))}</small><div class="gestao-acoes">${!e.lido && e.id > (avisos.lido_ate || 0) ? `<button data-aviso-lido="${e.id}">Entendi</button>` : ''}${e.tipo === 'escala' ? `<button data-aviso-escala="${e.id}">Ver na escala</button>` : ''}</div></article>`,
        )
        .join('') || '<p class="meta">Nenhum aviso.</p>';
  }
  function receber(d) {
    remote.gestao_nome = d.gestao_nome;
    remote.preferencias_analistas = d.preferencias_analistas || {};
    remote.direcionamentos_lojas = d.direcionamentos_lojas || [];
    const ctx = contextoCliente();
    if (contexto !== ctx) {
      contexto = ctx;
      rows.clear();
      window.FilaFeriadosPreferencias?.limpar();
      periodo = null;
      versao = 0;
      avisos = null;
      ultimoAvisoCheck = 0;
      previa = [];
      el('escalaGrade').textContent = '';
      el('escalaPrevia').textContent = '';
    }
    const mudou = Number(d.eventos_versao || 0) !== versao;
    if (mudou) {
      if (el('escalaDialogo').open && periodo)
        feedback(
          'escalaFeedback',
          'Houve mudanças na equipe. Atualize a escala para consultar a versão mais recente.',
        );
      versao = Number(d.eventos_versao || 0);
      ultimoAvisoCheck = 0;
    }
    render();
    if (el('escalaDialogo').open) renderEscala();
    if(d.avisos)receberAvisos(d.avisos).catch(()=>{});
    else carregarAvisos();
  }
  function iniciar() {
    if (iniciado) return;
    iniciado = true;
    el('rotaAnalista').innerHTML = opcoes(ANALISTAS);
    el('rotaLoja').oninput = prepararRota;
    el('rotaForm').onsubmit = salvarRota;
    el('rotaLista').onclick = async (e) => {
      const b = e.target.closest('[data-rota-editar],[data-rota-remover]');
      if (!b || !remote.coord) return;
      const k = b.dataset.rotaEditar || b.dataset.rotaRemover;
      const r = (remote.direcionamentos_lojas || []).find((x) => x.loja_chave === k);
      if (!r) return;
      if (b.dataset.rotaEditar) {
        el('rotaLoja').value = r.loja;
        el('rotaAnalista').value = r.analista;
        rotaEdicao = { chave: k, versao: r.versao };
        el('rotaLoja').focus();
      } else
        await executar(
          () =>
            rpc('fila_rota_salvar', { p_loja: r.loja, p_analista: null, p_versao: Number(b.dataset.versao) }),
          'Direcionamento removido. A loja voltou à distribuição normal.',
        );
    };
    for (const id of ['gestaoAlvo', 'escalaAnalista', 'relatorioAnalista', 'editarAnalista'])
      el(id).innerHTML = opcoes(
        ANALISTAS,
        id === 'editarAnalista' ? 'Todos os analistas' : 'Todos os analistas',
      );
    const now = hoje(),
      first = now.slice(0, 7) + '-01',
      last = date(first);
    last.setMonth(last.getMonth() + 1);
    last.setDate(0);
    el('escalaReferencia').value = now;
    el('importarMes').value = now.slice(0, 7);
    el('relatorioInicio').value = first;
    el('relatorioFim').value = day(last);
    el('editarSemana').innerHTML = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
      .map((s, i) => `<label><input type="checkbox" value="${i}" checked> ${s}</label>`)
      .join('');
    el('gestaoLogin').onsubmit = entrar;
    el('gestaoSair').onclick = () =>
      executar(async () => {
        await rpc('fila_gestao_sair');
        await salvarSessao('');
        local.coord = '';
        await saveLocal();
      }, 'Acesso de gestão encerrado.');
    el('gestaoTrocarPin').onclick = () => {
      el('gestaoPinForm').hidden = !el('gestaoPinForm').hidden;
    };
    el('gestaoPinForm').onsubmit = async (e) => {
      e.preventDefault();
      if (valor('gestaoNovoPin') !== valor('gestaoConfirmarPin'))
        return feedback('gestaoFeedback', 'Os códigos não coincidem.', true);
      if (
        await executar(
          () => rpc('fila_gestao_pin', { p_pin: valor('gestaoNovoPin') }),
          'Código alterado. Demais sessões foram encerradas.',
        )
      ) {
        el('gestaoPinForm').reset();
        el('gestaoPinForm').hidden = true;
      }
    };
    el('gestaoAlvo').onchange = () => {
      delete el('gestaoLojas').dataset.sujo;
      render();
    };
    el('gestaoLojas').oninput = () => (el('gestaoLojas').dataset.sujo = 'true');
    el('gestaoOperacao').onchange = (e) => alterarStatus(e.target);
    el('gestaoSalvarLojas').onclick = () =>
      executar(async () => {
        await rpc('fila_preferencia_salvar', {
          p_analista: valor('gestaoAlvo'),
          p_lojas: [
            ...new Set(
              valor('gestaoLojas')
                .split('\n')
                .map((x) => x.trim())
                .filter(Boolean),
            ),
          ],
        });
        delete el('gestaoLojas').dataset.sujo;
      });
    el('gestaoVincular').onclick = () =>
      executar(async () => {
        const texto = valor('gestaoPedido').trim();
        const entrada = acharEntrada(texto);
        const p =
          entrada.p ||
          pedidos.find((p) => p.id === texto) ||
          remote.atribuicoes.find((p) => p.pedido_id === texto);
        let id = entrada.id || p?.id || p?.pedido_id || texto;
        if (!p && !/^[0-9]{10,30}$/.test(id)) throw Error('Informe o ID ou link de um pedido reconhecido.');
        if (!p && entrada.uuid)
          throw Error('Link não encontrado na lista atual. Informe o ID numérico do pedido.');
        const r = await rpc('fila_gestao_vincular', {
          p_analista: valor('gestaoAlvo'),
          p_pedido: { ...p, id },
          p_transferir: el('gestaoTransferir').checked,
        });
        el('gestaoPedido').value = '';
        el('gestaoTransferir').checked = false;
        feedback(
          'gestaoFeedback',
          r.status === 'reservado'
            ? 'Pedido reservado para quando o analista estiver ON e livre.'
            : 'Pedido vinculado.',
        );
      });
    el('gestaoOff').onclick = () =>
      executar(
        () =>
          rpc('fila_mudar_status', {
            p_nome: valor('gestaoAlvo'),
            p_atividade: 'off',
            p_inicio: '',
            p_fim: '',
          }),
        'Analista OFF. Pedido atual devolvido à fila.',
      );
    el('gestaoLiberarNome').onclick = () =>
      executar(async () => {
        const n = valor('gestaoAlvo');
        await rpc('fila_mudar_status', { p_nome: n, p_atividade: 'off', p_inicio: '', p_fim: '' });
        await rpc('fila_liberar_nome', { p_nome: n });
      }, 'Analista OFF e nome liberado.');
    el('escalaAbrir').onclick = () => abrirEscala();
    el('relatorioAbrir').onclick = () => abrirEscala('relatorio');
    el('escalaFechar').onclick = () => {
      importAbort?.abort();
      fechar(el('escalaDialogo'));
    };
    document.querySelectorAll('[data-escala-tab]').forEach(
      (b) =>
        (b.onclick = () => {
          tab(b.dataset.escalaTab);
          if (b.dataset.escalaTab === 'relatorio') relatorio();
          if (b.dataset.escalaTab === 'escala' && !periodo) carregarEscala();
        }),
    );
    el('escalaReferencia').onchange = carregarEscala;
    el('escalaModo').onchange = carregarEscala;
    el('escalaAnalista').onchange = renderEscala;
    el('escalaAtualizar').onclick = carregarEscala;
    for (const [id, dir] of [
      ['escalaAnterior', -1],
      ['escalaProximo', 1],
    ])
      el(id).onclick = () => {
        const d = date(valor('escalaReferencia'));
        if (valor('escalaModo') === 'mes') {
          d.setDate(1);
          d.setMonth(d.getMonth() + dir);
        } else d.setDate(d.getDate() + dir * 7);
        el('escalaReferencia').value = day(d);
        carregarEscala();
      };
    el('escalaGrade').onclick = (e) => {
      const b = e.target.closest('[data-editar-nome]');
      if (b) editor(b.dataset.editarNome, b.dataset.editarData);
    };
    el('escalaLote').onclick = () => editor();
    el('escalaEditarFechar').onclick = () => fechar(el('escalaEditar'));
    el('escalaForm').onsubmit = salvarEscala;
    el('escalaJanela').onclick = async () => {
      try {
        const url = chrome.runtime.getURL('popup.html#escala');
        await chrome.windows.create({ url, type: 'popup', width: 1180, height: 850 });
      } catch (e) {
        feedback('escalaFeedback', e.message, true);
      }
    };
    el('relatorioGerar').onclick = relatorio;
    el('relatorioAnalista').onchange = relatorio;
    el('relatorioExportar').onclick = exportar;
    el('importarReconhecer').onclick = reconhecer;
    el('importarCancelar').onclick = () => importAbort?.abort();
    el('importarAplicar').onclick = aplicarImportacao;
    const limparPrevia = () => {
      importAbort?.abort();
      previa = [];
      el('escalaPrevia').textContent = '';
      el('importarAvisos').textContent = '';
      el('importarAplicar').hidden = true;
      el('importarConfirmacao').hidden = true;
      el('importarRevisei').checked = false;
    };
    el('importarArquivo').onchange = limparPrevia;
    el('importarMes').onchange = limparPrevia;
    const atualizar = document.createElement('button');
    atualizar.textContent = 'Atualizar versões da prévia';
    atualizar.onclick = atualizarVersoesPrevia;
    el('importarAplicar').parentElement.append(atualizar);
    el('escalaPrevia').onchange = (e) => {
      const t = e.target;
      if (t.dataset.prev === undefined) return;
      const x = previa[Number(t.dataset.prev)];
      if (!x) return;
      x[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value;
      el('importarRevisei').checked = false;
    };
    el('btnAvisos').onclick = () => abrirAvisos();
    el('avisosLista').onclick = async (e) => {
      const b = e.target.closest('[data-aviso-lido],[data-aviso-escala]');
      if (!b) return;
      try {
        if (b.dataset.avisoLido) await confirmarAvisos([Number(b.dataset.avisoLido)]);
        else {
          const aviso = avisos?.itens.find((x) => x.id === Number(b.dataset.avisoEscala));
          if (aviso?.detalhe?.data) {
            fechar(el('avisosDialogo'));
            el('escalaReferencia').value = aviso.detalhe.data;
            el('escalaAnalista').value = aviso.analista;
            await abrirEscala();
          }
        }
      } catch (err) {
        el('avisosResumo').textContent = err.message;
      }
    };
    el('avisosFechar').onclick = () => fechar(el('avisosDialogo'));
    el('avisosAtualizar').onclick = () => carregarAvisos(true);
    el('avisosLidos').onclick = async () => {
      try {
        avisos = await rpc('fila_avisos', { p_ultimo: avisos?.ultimo_id || 0 });
        renderAvisos();
        chrome.runtime?.sendMessage?.({tipo:'fila-atualizar-avisos',forcar:true}).catch(()=>{});
      } catch (e) {
        el('avisosResumo').textContent = e.message;
      }
    };
    for (const id of ['escalaDialogo', 'escalaEditar', 'avisosDialogo'])
      el(id).addEventListener('cancel', () => {
        if (id === 'escalaDialogo') importAbort?.abort();
      });
    chrome.storage.onChanged?.addListener((changes, area) => {
      if (area === 'session' && changes.filaAbrirAvisos)
        pedidoAbrirAvisos(changes.filaAbrirAvisos.newValue).catch(() => {});
      if (area === 'local' && changes.filaNotificacoesUI) {
        const p = changes.filaNotificacoesUI.newValue;
        if (!p || p.analista !== local.me) return;
        const ctx = contextoCliente();
        crypto.subtle
          .digest('SHA-256', new TextEncoder().encode(local.codigo + '|' + local.token))
          .then((h) => {
            if (
              ctx === contextoCliente() &&
              Array.from(new Uint8Array(h), (x) => x.toString(16).padStart(2, '0')).join('') === p.contexto
            ) {
              avisos = p;
              renderAvisos();
            }
          })
          .catch(() => {});
      }
    });
    chrome.storage.session
      ?.get('filaAbrirAvisos')
      .then((s) => pedidoAbrirAvisos(s.filaAbrirAvisos))
      .catch(() => {});
    if (location.hash === '#avisos') setTimeout(() => abrirAvisos(), 700);
    if (location.hash === '#escala') setTimeout(() => abrirEscala(), 1000);
    render();
  }
  window.FilaGestao = Object.freeze({
    destinoLoja: (loja) =>
      (remote.direcionamentos_lojas || []).find((r) => r.loja_chave === normalizarLoja(loja))?.analista,
    abrirAvisos,
    confirmarAvisos,
    rotuloStatus,
    iniciar,
    receber,
    render,
    celulaStatus,
    alterarStatus,
    carregarEscala,
    renderEscala,
    editor,
    calcularPeriodo,
  });
})();
