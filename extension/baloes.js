(() => {
  'use strict';
  if (globalThis.FilaBaloes) return;
  const rotulos = {
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
    trabalho: 'Trabalho',
    feriado: 'Feriado',
    atestado: 'Atestado',
    nao_definido: 'Não definido',
  };
  const icone =
    '<svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M10 26A23 23 0 0 1 49 15l5 5M54 9v12H42M54 38A23 23 0 0 1 15 49l-5-5M10 55V43h12" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 20v13l9 7" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function resumo(e) {
    const d = e.detalhe || {},
      escala = e.tipo === 'escala',
      novo = escala ? d.depois || {} : d;
    const titulo = `${escala ? 'Escala atualizada' : 'Status atualizado'}: ${e.analista}`;
    const status = !escala && d.depois === 'intervalo' && d.pausa_20min === true
      ? 'Pausa 20min'
      : rotulos[escala ? novo.tipo : d.depois] || (escala ? 'Atualizada' : 'Atualizado');
    let texto =
      escala && novo.tipo === 'trabalho'
        ? `Turno: ${novo.inicio || 'horário não informado'}${novo.fim ? ' – ' + novo.fim : ''}`
        : `${escala ? 'Situação' : 'Status'}: ${status}${novo.inicio ? ' · ' + novo.inicio : ''}${novo.fim ? '–' + novo.fim : ''}`;
    if (escala && novo.observacao) texto += ` (${String(novo.observacao).slice(0, 160)})`;
    const data = escala && d.data ? String(d.data).split('-').reverse().join('/') : '';
    return { titulo, texto, autor: [data, `Por ${e.ator || 'Gestão'}`].filter(Boolean).join(' · ') };
  }
  function mensagem(e) {
    const r = resumo(e);
    return `${r.titulo}. ${r.texto}. ${r.autor}`;
  }
  let host, root, temaAtual=null;
  function aplicarTema(tema) {
    const hex=/^#[0-9a-f]{6}$/i;
    if(!tema || !tema.cores || !['fundo','cartao','texto','texto_secundario','destaque','borda'].every(k=>hex.test(tema.cores[k] || ''))){temaAtual=null;return;}
    temaAtual=tema;
    if(!host)return;
    const c=tema.cores;
    for(const [key,value] of Object.entries({fundo:c.fundo,cartao:c.cartao,texto:c.texto,secundario:c.texto_secundario,destaque:c.destaque,borda:c.borda,botao:c.primaria,botao_texto:c.primaria_texto,erro:c.erro})) {
      if(hex.test(value || ''))host.style.setProperty('--av-'+key,value);
    }
    host.setAttribute('data-tema', ['metal','aurora','hextech','tricolor','nuvens'].includes(tema.estilo)?tema.estilo:'simples');
    host.setAttribute('data-tematizado','true');
  }
  let temaVersao=0;
  async function carregarTema(){
    const versao=++temaVersao;
    try{const s=await chrome.storage.local.get('afTemaNotificacoes');const a=await chrome.storage.local.get('local');
    if(versao!==temaVersao)return;
    if(s.afTemaNotificacoes?.nome===(a.local?.me || ''))aplicarTema(s.afTemaNotificacoes.tema);
    else {temaAtual=null;host?.removeAttribute('data-tematizado');}
    }catch{}
  }
  chrome.storage.onChanged?.addListener((c,area)=>{if(area==='local'&&(c.afTemaNotificacoes||c.local))carregarTema();});
  carregarTema();
  const estilo = `:host{position:fixed!important;right:20px!important;bottom:22px!important;z-index:2147483647!important;width:min(510px,calc(100vw - 32px))!important;font:14px/1.45 system-ui,sans-serif!important;color:#fff!important}*{box-sizing:border-box}.b{position:relative;isolation:isolate;border:1px solid #ffffffa8;border-radius:24px;padding:18px;margin-top:12px;overflow:hidden;background:linear-gradient(115deg,#eef6ffed 0%,#d9e6f1db 14%,#25364eeb 34%,#1f304bd9 100%);box-shadow:0 18px 55px #0b183c42,inset 0 1px 1px #ffffff80;backdrop-filter:blur(26px) saturate(140%);-webkit-backdrop-filter:blur(26px) saturate(140%);animation:entrar .25s ease-out}.marca{display:block;margin:0 23px 12px 0;text-align:right;color:#e6efffc7;font-size:11px;letter-spacing:.03em}.corpo{display:grid;grid-template-columns:88px minmax(0,1fr);gap:16px;align-items:center}.icone{color:#302a83;filter:drop-shadow(0 4px 8px #3c289033)}.icone svg{display:block;width:78px;height:78px}strong{display:block;font-size:20px;line-height:1.2;letter-spacing:-.025em;text-shadow:0 1px 8px #142d4a22}.texto{font-size:16px;line-height:1.4;margin-top:7px;overflow-wrap:anywhere}.autor{display:block;font-size:11px;opacity:.76;margin-top:7px}.acoes{display:flex;margin:17px 0 0 104px;padding:4px;gap:4px;background:#ffffff20;border:1px solid #ffffff60;border-radius:30px;box-shadow:inset 0 1px #ffffff35}button{font:inherit;color:inherit;cursor:pointer}.acoes button{flex:1;border:0;border-radius:22px;background:transparent;min-height:36px;padding:7px 12px;white-space:nowrap}.acoes .entendi{background:linear-gradient(135deg,#0ba2ff,#0075ed);box-shadow:0 3px 12px #007eff38}.acoes button:hover{filter:brightness(1.12);background-color:#ffffff1a}button:focus-visible{outline:2px solid #fff;outline-offset:2px}button:disabled{opacity:.6;cursor:wait}.fechar{position:absolute;right:12px;top:11px;border:0;border-radius:50%;background:transparent;width:26px;height:26px;font-size:21px;color:#eef5ffbf}.feedback{font-size:11px;text-align:right;margin-top:8px;color:#ffe3e3;white-space:normal}@keyframes entrar{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@media(max-width:480px){:host{right:10px!important;bottom:12px!important;width:calc(100vw - 20px)!important}.b{padding:14px;border-radius:20px}.corpo{grid-template-columns:55px minmax(0,1fr);gap:11px}.icone svg{width:52px;height:52px}strong{font-size:17px}.texto{font-size:14px}.acoes{margin-left:66px}.acoes button{padding:6px 9px;font-size:13px}}@media(prefers-reduced-motion:reduce){.b{animation:none}}`;
  async function confirmar(ids, contexto) {
    if (globalThis.FilaGestao?.confirmarAvisos) return FilaGestao.confirmarAvisos(ids);
    const r = await chrome.runtime.sendMessage({ tipo: 'fila-confirmar-avisos', ids, contexto });
    if (!r?.ok) throw Error(r?.mensagem || 'Não foi possível registrar a leitura. Tente novamente.');
  }
  async function detalhes(evento) {
    if (globalThis.FilaGestao?.abrirAvisos) return FilaGestao.abrirAvisos(evento?.id);
    const r = await chrome.runtime.sendMessage({ tipo: 'fila-abrir-avisos', evento_id: evento?.id });
    if (!r?.ok) throw Error('Não foi possível abrir os avisos. Abra a extensão pelo sino.');
  }
  function mostrar(titulo, texto, opcoes = {}) {
    if (!document.body) return;
    if (!host?.isConnected) {
      host = document.createElement('div');
      host.setAttribute('data-fila-avisos', '');
      root = host.attachShadow({ mode: 'closed' });
      const css = document.createElement('style');
      css.textContent = estilo + `
:host([data-tematizado]){color:var(--av-texto)!important}
:host([data-tematizado]) .b{background:linear-gradient(135deg,var(--av-cartao),var(--av-fundo));border-color:var(--av-borda);color:var(--av-texto);box-shadow:0 16px 45px #0006,inset 0 1px #ffffff20}
:host([data-tematizado]) .marca,:host([data-tematizado]) .autor,:host([data-tematizado]) .fechar{color:var(--av-secundario)}
:host([data-tematizado]) .icone{color:var(--av-destaque)}
:host([data-tematizado]) .acoes{background:var(--av-fundo);border-color:var(--av-borda)}
:host([data-tematizado]) .entendi{background:var(--av-botao);color:var(--av-botao_texto)}
:host([data-tematizado]) .feedback{color:var(--av-erro)}
:host([data-tema=hextech]) .b{border-radius:3px;border:2px solid #a48750;box-shadow:inset 0 0 16px #00c8c820,0 12px 40px #0008}
:host([data-tema=hextech]) strong{font-family:Georgia,serif;color:#f0e6d2}
:host([data-tema=hextech]) .acoes{border-radius:0}
:host([data-tema=tricolor]) .b{border-top:4px solid #f5ecd8;border-left:7px solid #9f2f49;background-image:linear-gradient(115deg,#11352b 55%,#451723)}
:host([data-tema=metal]) .b{border:3px solid #9d815a;border-radius:5px;box-shadow:inset 0 0 15px #0008,0 12px 40px #0008}
:host([data-tema=nuvens]) .b{border:1px solid #ffffff;border-radius:26px;background:radial-gradient(ellipse at 10% 0,#ffffff 0,transparent 60%),linear-gradient(135deg,#e9f8ff,#d2eaf5);box-shadow:0 14px 40px #375c7540,inset 0 1px #fff}
:host([data-tema=nuvens]) .marca,:host([data-tema=nuvens]) .autor,:host([data-tema=nuvens]) .fechar{color:#435f73}
:host([data-tema=nuvens]) .acoes{border-radius:24px;border-color:#a4c6d8;background:#ffffffa8}
:host([data-tema=nuvens]) strong{color:#243d50;text-shadow:none}
:host([data-tema=aurora]) .b{background-image:radial-gradient(at top left,#5eead433,transparent 65%),linear-gradient(135deg,var(--av-cartao),var(--av-fundo))}
`;
      root.append(css);
      document.body.append(host);
      if(temaAtual)aplicarTema(temaAtual);
    }
    const box = document.createElement('section');
    box.className = 'b';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    const marca = document.createElement('span'),
      corpo = document.createElement('div'),
      icon = document.createElement('div'),
      conteudo = document.createElement('div'),
      title = document.createElement('strong'),
      body = document.createElement('div'),
      autor = document.createElement('small'),
      acoes = document.createElement('div'),
      entendi = document.createElement('button'),
      mais = document.createElement('button'),
      close = document.createElement('button'),
      feedback = document.createElement('div');
    marca.className = 'marca';
    marca.textContent = 'AF Operação · Notificações';
    corpo.className = 'corpo';
    icon.className = 'icone';
    icon.innerHTML = icone;
    title.textContent = titulo;
    body.className = 'texto';
    body.textContent = texto;
    autor.className = 'autor';
    autor.textContent = opcoes.autor || '';
    conteudo.append(title, body, autor);
    corpo.append(icon, conteudo);
    acoes.className = 'acoes';
    entendi.className = 'entendi';
    entendi.textContent = 'Entendi';
    mais.textContent = 'Saber mais';
    close.className = 'fechar';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Dispensar aviso');
    feedback.className = 'feedback';
    feedback.setAttribute('role', 'status');
    let timer;
    const sumir = () => {
      clearTimeout(timer);
      box.remove();
    };
    close.onclick = sumir;
    entendi.onclick = async () => {
      entendi.disabled = mais.disabled = true;
      clearTimeout(timer);
      try {
        if (opcoes.ids?.length) await confirmar(opcoes.ids, opcoes.contexto);
        sumir();
      } catch (e) {
        feedback.textContent = e.message;
        entendi.disabled = mais.disabled = false;
      }
    };
    mais.onclick = async () => {
      clearTimeout(timer);
      mais.disabled = true;
      try {
        await detalhes(opcoes.evento);
        sumir();
      } catch (e) {
        feedback.textContent = e.message;
        mais.disabled = false;
      }
    };
    const agendar = () => {
      clearTimeout(timer);
      timer = setTimeout(sumir, 22000);
    };
    box.onpointerenter = () => clearTimeout(timer);
    box.onpointerleave = () => {
      if (!box.contains(root.activeElement)) agendar();
    };
    box.onfocusin = () => clearTimeout(timer);
    box.onfocusout = agendar;
    acoes.append(entendi, mais);
    box.append(marca, corpo, acoes, close, feedback);
    root.append(box);
    while (root.querySelectorAll('.b').length > 3) root.querySelector('.b').remove();
    agendar();
  }
  async function receber(projecao) {
    if (!projecao?.analista || !Array.isArray(projecao.itens)) return;
    const chave = projecao.contexto + '|' + projecao.analista;
    const { filaAvisosExibidos: salvo = {} } = await chrome.storage.local.get('filaAvisosExibidos');
    const ultimo = Math.max(Number(salvo[chave] || 0), Number(projecao.lido_ate || 0));
    const novos = projecao.itens.filter((e) => e.id > ultimo && !e.lido);
    if (!novos.length) return;
    salvo[chave] = Math.max(...novos.map((e) => e.id));
    await chrome.storage.local.set({
      filaAvisosExibidos: Object.fromEntries(Object.entries(salvo).slice(-30)),
    });
    const recentes = novos
      .filter((e) => Date.now() - new Date(e.quando).getTime() < 86400000)
      .sort((a, b) => b.id - a.id);
    if (!recentes.length) return;
    if (recentes.length <= 3)
      recentes
        .slice()
        .reverse()
        .forEach((e) => {
          const r = resumo(e);
          mostrar(r.titulo, r.texto, { autor: r.autor, ids: [e.id], contexto: projecao.contexto, evento: e });
        });
    else
      mostrar(
        `Atualizações: ${projecao.analista}`,
        `${recentes.length} alterações de status ou escala. Consulte os detalhes na central de avisos.`,
        { ids: recentes.map((e) => e.id), contexto: projecao.contexto, evento: recentes[0] },
      );
  }
  globalThis.FilaBaloes = Object.freeze({ mostrar, mensagem, resumo, receber, icone, aplicarTema });
})();
