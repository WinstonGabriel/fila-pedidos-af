/* Preferência pessoal com opção de tema central da equipe, sem sobrescrever a escolha salva. */
(() => {
  'use strict';
  const CHAVE = 'filaPreferenciasVisuais';
  const TEMAS = [
    { id: 'padrao', nome: 'Padrão', icone: '☀️', classe: '' },
    { id: 'homem-aranha', nome: 'Homem Aranha', icone: '🕷️', classe: 'tema-homem-aranha' },
    { id: 'got', nome: 'Game of Thrones', icone: '👑', classe: 'tema-got' },
    { id: 'seguranca', nome: 'Segurança / Cyber', icone: '🛡️', classe: 'tema-seguranca' },
    { id: 'homem-de-ferro', nome: 'Homem de Ferro', icone: '🚀', classe: 'tema-homem-de-ferro' },
    { id: 'dark-puro', nome: 'Dark Puro', icone: '🌑', classe: 'tema-dark-puro' },
    { id: 'caveiras', nome: 'Caveiras / Punisher', icone: '💀', classe: 'tema-caveiras' },
  ];
  let atual = 'padrao';
  let salvando = false;
  let alteracoes = 0;
  let preferenciaCarregada = false;
  let ultimaPublicada = '';
  let publicacao = Promise.resolve();
  const $ = (id) => document.getElementById(id);
  const temaEquipe = () => TEMAS.find((t) => t.id === document.documentElement.dataset.temaEquipe);

  function publicarAparencia(tema, equipe) {
    if (!preferenciaCarregada) return;
    const dados = window.FilaAparencia.capturar(tema.id, equipe ? 'equipe' : 'local', document.documentElement);
    const assinatura = JSON.stringify(dados);
    if (assinatura === ultimaPublicada) return;
    ultimaPublicada = assinatura;
    // Gravações sequenciais impedem uma escolha anterior de sobrescrever a mais recente.
    publicacao = publicacao.then(() => chrome.storage.local.set({ [window.FilaAparencia.CHAVE]: dados })).catch(() => {
      if (ultimaPublicada === assinatura) ultimaPublicada = '';
      mensagem('Não foi possível sincronizar a aparência com o AF. Reabra o painel para tentar novamente.', true);
    });
  }

  function aplicar(id) {
    const pessoal = TEMAS.find((t) => t.id === id) || TEMAS[0];
    const equipe = temaEquipe();
    const tema = equipe || pessoal;
    document.documentElement.classList.remove(...TEMAS.map((t) => t.classe).filter(Boolean));
    if (tema.classe) document.documentElement.classList.add(tema.classe);
    atual = pessoal.id;
    for (const botao of $('temaOpcoes').querySelectorAll('[data-tema]')) {
      botao.setAttribute('aria-pressed', String(botao.dataset.tema === tema.id));
      botao.disabled = salvando || !!equipe;
    }
    $('btnTema').title = `Tema: ${tema.nome}`;
    $('btnTema').setAttribute('aria-label', `Personalizar tema. Atual: ${tema.nome}`);
    $('temaTitulo').textContent = equipe ? 'Tema da equipe' : 'Seu tema';
    $('temaDescricao').textContent = equipe
      ? `O tema ${tema.nome} foi definido para toda a equipe. Sua preferência pessoal fica salva para quando o tema individual for liberado.`
      : 'Escolha a aparência desta extensão neste computador.';
    publicarAparencia(tema, equipe);
  }

  function mensagem(texto, erro = false) {
    $('temaFeedback').textContent = texto;
    $('temaFeedback').classList.toggle('tema-erro', erro);
  }

  async function escolher(id) {
    if (salvando || temaEquipe() || !TEMAS.some((t) => t.id === id)) return;
    const anterior = atual;
    alteracoes++;
    salvando = true;
    aplicar(id);
    mensagem('Salvando tema…');
    try {
      await chrome.storage.local.set({ [CHAVE]: { tema: atual } });
      mensagem('Tema salvo só neste computador.');
    } catch (e) {
      aplicar(anterior);
      mensagem('Não foi possível salvar o tema. Tente novamente.', true);
    } finally {
      salvando = false;
      aplicar(atual);
    }
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
    if (typeof dialogo.close === 'function') dialogo.close();
    else dialogo.removeAttribute('open');
    $('btnTema').setAttribute('aria-expanded', 'false');
    $('btnTema').focus();
  }

  async function iniciar() {
    const fragmento = document.createDocumentFragment();
    for (const tema of TEMAS) {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'tema-opcao';
      botao.dataset.tema = tema.id;
      botao.setAttribute('aria-label', tema.nome);
      botao.setAttribute('aria-pressed', 'false');
      // Os valores vêm exclusivamente do catálogo fixo acima.
      botao.innerHTML = `<span class="tema-amostra ${tema.classe || 'tema-amostra-padrao'}" aria-hidden="true"><span class="tema-mini-card"><span class="tema-mini-linha"></span><span class="tema-mini-botoes"><span></span><span></span></span></span></span><span class="tema-rotulo"><span aria-hidden="true">${tema.icone}</span> ${tema.nome}</span><span class="tema-check" aria-hidden="true">✓</span>`;
      fragmento.appendChild(botao);
    }
    $('temaOpcoes').appendChild(fragmento);
    $('btnTema').onclick = abrir;
    $('temaFechar').onclick = fechar;
    $('temaDialogo').addEventListener('close', () => $('btnTema').setAttribute('aria-expanded', 'false'));
    $('temaDialogo').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); fechar(); }
    });
    $('temaOpcoes').onclick = (e) => {
      const botao = e.target.closest('[data-tema]');
      if (botao && $('temaOpcoes').contains(botao)) escolher(botao.dataset.tema);
    };
    aplicar(atual);
    const versao = alteracoes;
    try {
      const dados = await chrome.storage.local.get(CHAVE);
      // Uma leitura antiga não desfaz uma escolha feita enquanto o armazenamento respondia.
      if (versao === alteracoes) aplicar(dados[CHAVE]?.tema);
    } catch (e) {
      if (versao === alteracoes) mensagem('Escolha um tema para salvar neste computador.');
    } finally {
      preferenciaCarregada = true;
      aplicar(atual);
      document.documentElement.dataset.temaPronto = 'true';
    }

    chrome.storage.onChanged?.addListener((alteradas, area) => {
      if (area === 'local' && alteradas[CHAVE] && !salvando) {
        alteracoes++;
        aplicar(alteradas[CHAVE].newValue?.tema);
      }
    });
  }

  document.addEventListener('fila:tema-equipe', () => {
    aplicar(atual);
    mensagem(temaEquipe() ? 'Tema sincronizado com a equipe.' : 'A escolha é salva automaticamente só aqui.');
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  else iniciar();
})();
