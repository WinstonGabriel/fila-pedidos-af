/* Escolha pessoal preservada; o catálogo e a paleta chegam como dados. */
(() => {
  'use strict';
  const CHAVE = 'filaPreferenciasVisuais';
  const catalogo = FilaCatalogoTemas;
  const $ = (id) => document.getElementById(id);
  let preferencia = 'padrao', salvando = false, alteracoes = 0, iniciado = false;
  let coresEquipe = {};
  let perfil = '', preferencias = {}, temaPublicado = '';
  const temaDoPerfil = () => preferencias.porAnalista?.[perfil] || (Object.keys(preferencias.porAnalista || {}).length ? 'padrao' : preferencias.tema) || 'padrao';
  function publicarTema(tema) {
    const t={id:tema.id,modo:tema.modo,estilo:tema.estilo,energia:tema.energia,cores:{...tema.cores,...coresEquipe}};
    globalThis.FilaBaloes?.aplicarTema(t);
    const dados={nome:perfil,tema:t},assinatura=JSON.stringify(dados);
    if(assinatura===temaPublicado)return;
    temaPublicado=assinatura;
    chrome.storage.local.set({afTemaNotificacoes:dados}).catch(()=>{temaPublicado='';});
  }
  const temaEquipe = () => catalogo.obter(document.documentElement.dataset.temaEquipe);

  function mensagem(texto, erro = false) {
    $('temaFeedback').textContent = texto;
    $('temaFeedback').classList.toggle('tema-erro', erro);
  }

  function aplicar() {
    const pessoal = catalogo.obter(preferencia);
    const equipe = temaEquipe();
    const tema = equipe || pessoal || catalogo.obter('padrao') || catalogo.listar()[0];
    const raiz = document.documentElement;
    for (const classe of Array.from(raiz.classList)) if (classe.startsWith('tema-')) raiz.classList.remove(classe);
    if (tema.modo === 'escuro') raiz.classList.add('tema-online');
    catalogo.aplicarPaleta(raiz, tema, coresEquipe);
    raiz.dataset.temaId = tema.id;
    publicarTema(tema);
    for (const botao of $('temaOpcoes').querySelectorAll('[data-tema]')) {
      botao.setAttribute('aria-pressed', String(botao.dataset.tema === tema.id));
      botao.disabled = salvando || !!equipe;
    }
    $('btnTema').title = `Tema: ${tema.nome}`;
    $('btnTema').setAttribute('aria-label', `Personalizar tema. Atual: ${tema.nome}`);
    $('temaTitulo').textContent = equipe ? 'Tema da equipe' : 'Seu tema';
    $('temaDescricao').textContent = equipe
      ? `O tema ${tema.nome} foi definido para a equipe. Sua escolha pessoal continua salva.`
      : 'Escolha seu tema. Novos estilos aparecem aqui automaticamente.';
    if (!pessoal && !equipe && preferencia !== 'padrao') mensagem('Seu tema salvo está indisponível. Sua preferência foi preservada.');
  }

  function renderEstado() {
    const e = catalogo.estado();
    const online = e.origem === 'online';
    $('temaCatalogoStatus').textContent = e.erro || (online
      ? `${e.total} temas · Catálogo sincronizado`
      : `${e.total} temas · Disponíveis offline`);
    $('temaCatalogoStatus').dataset.online = String(online && !e.erro);
  }

  function criar(tag, classe, texto) {
    const n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function renderCatalogo() {
    const foco = document.activeElement?.dataset.tema;
    const fragmento = document.createDocumentFragment();
    for (const tema of catalogo.listar()) {
      const botao = criar('button', 'tema-opcao');
      botao.type = 'button'; botao.dataset.tema = tema.id;
      botao.setAttribute('aria-label', tema.nome);
      botao.setAttribute('aria-pressed', 'false');
      const amostra = criar('span', 'tema-amostra');
      amostra.setAttribute('aria-hidden', 'true');
      catalogo.aplicarPaleta(amostra, tema);
      const card = criar('span', 'tema-mini-card');
      card.append(criar('span', 'tema-mini-linha'));
      const botoes = criar('span', 'tema-mini-botoes');
      botoes.append(criar('span'), criar('span'));
      card.append(botoes); amostra.append(card);
      const rotulo = criar('span', 'tema-rotulo');
      const icone = criar('span', 'tema-emoji', tema.icone);
      icone.setAttribute('aria-hidden', 'true');
      rotulo.append(icone, criar('span', '', tema.nome));
      const descricao = criar('span', 'tema-legenda', tema.descricao);
      const check = criar('span', 'tema-check', '✓');
      check.setAttribute('aria-hidden', 'true');
      botao.append(amostra, rotulo, descricao, check);
      if (tema.novo) botao.append(criar('span', 'tema-novo', 'Novo'));
      fragmento.append(botao);
    }
    $('temaOpcoes').replaceChildren(fragmento);
    aplicar(); renderEstado();
    if (foco) Array.from($('temaOpcoes').querySelectorAll('[data-tema]')).find((b) => b.dataset.tema === foco)?.focus({ preventScroll: true });
  }

  async function escolher(id) {
    if (salvando || temaEquipe() || !catalogo.obter(id)) return;
    const anterior = preferencia;
    alteracoes++; salvando = true; preferencia = id; aplicar(); mensagem('Salvando tema…');
    try {
      const proxima={...preferencias,tema:preferencia,porAnalista:{...preferencias.porAnalista,...(perfil ? {[perfil]:preferencia} : {})}};
      await chrome.storage.local.set({ [CHAVE]: proxima }); preferencias=proxima;
      mensagem('Tema salvo neste computador.');
    } catch {
      preferencia = anterior; aplicar(); mensagem('Não foi possível salvar o tema. Tente novamente.', true);
    } finally { salvando = false; aplicar(); }
  }

  function abrir() {
    const dialogo = $('temaDialogo');
    if (!dialogo.open) {
      if (typeof dialogo.showModal === 'function') dialogo.showModal();
      else dialogo.setAttribute('open', '');
    }
    $('btnTema').setAttribute('aria-expanded', 'true');
  }
  function fechar() {
    const dialogo = $('temaDialogo');
    if (typeof dialogo.close === 'function') dialogo.close(); else dialogo.removeAttribute('open');
    $('btnTema').setAttribute('aria-expanded', 'false'); $('btnTema').focus();
  }

  async function iniciar() {
    iniciado = true;
    renderCatalogo();
    $('btnTema').onclick = abrir;
    $('temaFechar').onclick = fechar;
    $('temaDialogo').addEventListener('close', () => $('btnTema').setAttribute('aria-expanded', 'false'));
    $('temaDialogo').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); fechar(); } });
    $('temaOpcoes').onclick = (e) => {
      const botao = e.target.closest('[data-tema]');
      if (botao && $('temaOpcoes').contains(botao)) escolher(botao.dataset.tema);
    };
    $('temaAtualizar').onclick = () => document.dispatchEvent(new CustomEvent('fila:atualizar-catalogo'));
    const versao = alteracoes;
    try {
      const dados = await chrome.storage.local.get(CHAVE);
      const identidade=await chrome.storage.local.get('local');
      if(versao===alteracoes){perfil=identidade.local?.me || perfil;preferencias=dados[CHAVE] || {};const id=temaDoPerfil();if(catalogo.validoId(id))preferencia=id;}
    } catch { mensagem('Escolha um tema para salvar neste computador.'); }
    aplicar(); document.documentElement.dataset.temaPronto = 'true';
    chrome.storage.onChanged?.addListener((alteradas, area) => {
      if (area === 'local' && alteradas[CHAVE] && !salvando) {
        alteracoes++;
        preferencias=alteradas[CHAVE].newValue || {};
        const id = temaDoPerfil();
        preferencia = catalogo.validoId(id) ? id : 'padrao'; aplicar();
      }
    });
  }
  document.addEventListener('fila:identidade',(e)=>{const nome=e.detail?.nome || '';if(nome===perfil)return;perfil=nome;const id=temaDoPerfil();preferencia=catalogo.validoId(id)?id:'padrao';if(iniciado)aplicar();});
  document.addEventListener('fila:tema-equipe', (e) => {
    coresEquipe = e.detail?.cores || {};
    if (iniciado) aplicar();
  });
  document.addEventListener('fila:catalogo-temas', (e) => {
    if (!iniciado) return;
    if (e.detail.alterado) renderCatalogo(); else renderEstado();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  else iniciar();
})();
