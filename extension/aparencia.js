/* Contrato compartilhado de aparência. A projeção para o AF contém apenas cores e tema. */
(() => {
  'use strict';
  const TEMAS = Object.freeze(['padrao', 'homem-aranha', 'got', 'seguranca', 'homem-de-ferro', 'dark-puro', 'caveiras']);
  const CORES = Object.freeze({
    fundo: '--bg-principal', cartao: '--bg-card', texto: '--cor-texto', texto_secundario: '--cor-texto-secundario',
    primaria: '--btn-principal', primaria_hover: '--btn-principal-hover', primaria_texto: '--btn-principal-texto',
    destaque: '--btn-destaque', destaque_hover: '--btn-destaque-hover', destaque_texto: '--btn-destaque-texto',
    borda: '--borda-fina', link: '--cor-link', botao: '--bg-botao', botao_hover: '--bg-botao-hover',
    borda_botao: '--borda-botao', input: '--bg-input', desativado: '--bg-desativado',
    erro: '--cor-erro', sucesso: '--cor-ok', aviso: '--cor-aviso', vazio: '--cor-vazio',
    fundo_aviso: '--bg-aviso', borda_aviso: '--borda-aviso', fundo_perigo: '--bg-perigo', borda_perigo: '--borda-perigo',
    meu_pedido: '--bg-meu', borda_meu_pedido: '--borda-meu', chip: '--bg-chip', atraso: '--bg-atraso', borda_atraso: '--borda-atraso',
  });
  const corValida = valor => typeof valor === 'string' && /^#[0-9a-f]{6}$/i.test(valor);
  function normalizar(valor) {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor) || valor.schema !== 1 || !TEMAS.includes(valor.tema)) return null;
    const cores = {};
    if (valor.cores && typeof valor.cores === 'object' && !Array.isArray(valor.cores)) {
      for (const [chave, cor] of Object.entries(valor.cores)) {
        if (Object.hasOwn(CORES, chave) && corValida(cor)) cores[chave] = cor;
      }
    }
    return { schema: 1, ativo: valor.ativo !== false, tema: valor.tema, origem: valor.origem === 'equipe' ? 'equipe' : 'local', cores };
  }
  function capturar(tema, origem, raiz) {
    const cores = {};
    for (const [chave, propriedade] of Object.entries(CORES)) {
      const cor = raiz.style.getPropertyValue(propriedade).trim();
      if (corValida(cor)) cores[chave] = cor;
    }
    return normalizar({ schema: 1, ativo: raiz.dataset.temaAf !== 'false', tema, origem, cores });
  }
  window.FilaAparencia = Object.freeze({ CHAVE: 'filaAparenciaAF', TEMAS, CORES, normalizar, capturar });
})();
