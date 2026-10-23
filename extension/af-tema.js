/* Executado somente na página principal do AF e no mundo isolado da extensão. */
(() => {
  'use strict';
  if (location.origin !== 'https://af.mateusmais.com.br' || window.top !== window || window.filaAfTemaIniciado) return;
  window.filaAfTemaIniciado = true;
  const { CHAVE, TEMAS, CORES, normalizar } = window.FilaAparencia;
  const PESSOAL = 'filaPreferenciasVisuais';
  let versao = 0;
  let atual = null;
  let aguardandoDom = false;
  const propriedadeAf = propriedade => `--fila-af-${propriedade.slice(2)}`;
  const pessoal = tema => TEMAS.includes(tema) ? tema : 'padrao';

  function aplicar(valor) {
    const aparencia = normalizar(valor);
    if (!aparencia) return;
    atual = aparencia;
    const raiz = document.documentElement;
    if (!raiz) {
      if (!aguardandoDom) document.addEventListener('DOMContentLoaded', () => { aguardandoDom = false; aplicar(atual); }, { once: true });
      aguardandoDom = true;
      return;
    }
    for (const propriedade of Object.values(CORES)) raiz.style.removeProperty(propriedadeAf(propriedade));
    if (!aparencia.ativo) { raiz.removeAttribute('data-fila-af-tema'); return; }
    raiz.dataset.filaAfTema = aparencia.tema;
    for (const [chave, cor] of Object.entries(aparencia.cores)) raiz.style.setProperty(propriedadeAf(CORES[chave]), cor);
  }

  async function carregar() {
    const inicio = versao;
    try {
      // Não solicita código da equipe, tokens, pedidos nem o estado local da fila.
      const dados = await chrome.storage.local.get([CHAVE, PESSOAL]);
      if (inicio !== versao) return;
      const salvo = normalizar(dados[CHAVE]);
      if (salvo) {
        if (salvo.origem === 'local') salvo.tema = pessoal(dados[PESSOAL]?.tema || salvo.tema);
        aplicar(salvo);
      } else aplicar({ schema: 1, tema: pessoal(dados[PESSOAL]?.tema) });
    } catch (e) { /* Uma extensão recarregada não deve gerar erro na aplicação do AF. */ }
  }

  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area !== 'local') return;
    if (Object.hasOwn(mudancas, CHAVE)) {
      versao++;
      const valor = mudancas[CHAVE].newValue;
      if (valor === undefined) carregar();
      else aplicar(valor);
    } else if (Object.hasOwn(mudancas, PESSOAL) && (!atual || atual.origem === 'local')) {
      versao++;
      aplicar({ ...(atual || { schema: 1 }), tema: pessoal(mudancas[PESSOAL].newValue?.tema) });
    }
  });
  carregar();
})();
