/* Lê somente os campos operacionais do AF. Recomendação do motor não é conclusão. */
(() => {
  'use strict';
  const limpar = (v) => String(v || '').replace(/\s+/g, ' ').trim();
  const normal = (v) => limpar(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function link(raw, base) {
    try {
      const u = new URL(raw, base);
      return u.origin === 'https://af.mateusmais.com.br' && /^\/pedido\/[a-f0-9-]{36}\/?$/i.test(u.pathname) && !u.search && !u.hash && !u.username && !u.password ? u.href : '';
    } catch { return ''; }
  }
  function centavos(v) {
    const s = limpar(v).replace(/^R\$\s*/, '');
    if (!/^(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(s)) return null;
    const n = Number(s.replace(/\./g, '').replace(',', ''));
    return Number.isSafeInteger(n) && n >= 0 && n <= 100000000000 ? n : null;
  }
  function linha(row, base) {
    const t = [...row.querySelectorAll('td')].map(c => limpar(c.textContent));
    const a = row.querySelector('td a[href*="/pedido/"]');
    if (t.length < 9 || !a || !/^\d{10,20}$/.test(limpar(a.textContent))) return null;
    const d = t[3].match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
    const href = link(a.getAttribute('href'), base);
    if (!d || !href) return null;
    return { id: limpar(a.textContent), href, data: `${d[3]}-${d[2]}-${d[1]}`, hora: `${d[4]}:${d[5]}`, valor: t[2], valor_centavos: centavos(t[2]), cat: t[4].slice(0,120), estab: t[5].slice(0,200), modal: t[6].slice(0,120) };
  }
  function tabelaLista(doc) {
    return [...doc.querySelectorAll('table')].find(t => {
      const h = [...t.querySelectorAll('thead th')].map(c => normal(c.textContent));
      return h[0] === 'pedido' && h[1] === 'status' && h[3] === 'data' && h[4] === 'categoria' && h[5] === 'estabelecimento';
    });
  }
  const lista = (doc, base) => [...(tabelaLista(doc)?.querySelectorAll('tbody tr') || [])].map(r=>linha(r,base)).filter(Boolean);
  function detalhe(doc, base, esperado) {
    const id = limpar(doc.querySelector('#order_number span')?.textContent).replace(/^#/, '');
    const href = link(base, base);
    if (doc.querySelector('input[type="password"],#kc-form-login') || id !== esperado || !href) throw Error('Pedido ou sessão do AF não conferem.');
    const tabela = [...doc.querySelectorAll('table')].find(t => {
      const h = [...t.querySelectorAll('thead th')].map(c=>normal(c.textContent));
      return h.length === 3 && h[0] === 'status do pedido' && h[1] === 'nota' && h[2] === 'criado por';
    });
    if (!tabela) throw Error('Histórico de decisão do AF indisponível.');
    const eventos = [...tabela.querySelectorAll('tbody tr')].map(r=>{
      const cells = [...r.querySelectorAll('td')];
      const data = limpar(cells[0]?.querySelector('p')?.textContent).match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2}):(\d{2})/);
      const status = limpar([...cells[0]?.querySelectorAll('strong') || []].at(-1)?.textContent);
      return { status, nota: limpar(cells[1]?.textContent), em: data ? `${data[3]}-${data[2]}-${data[1]}T${data[4]}:${data[5]}:00-03:00` : null };
    });
    // Apenas a última decisão deste pedido, nunca notas do histórico de outros pedidos.
    const decisao = eventos.filter(e=>['pedido autorizado','pedido em analise'].includes(normal(e.status))).at(-1);
    const automatico = normal(decisao?.status) === 'pedido autorizado' && normal(decisao.nota) === 'aprovacao automatica com status de analise approve';
    const cancelado = /cancelad/.test(normal(eventos.at(-1)?.status));
    const statusAtual = limpar(doc.querySelector('#delivery_status span')?.textContent);
    const pendente = normal(statusAtual)==='pedido em analise' && normal(decisao?.status)==='pedido em analise';
    return { id, href, situacao: automatico ? 'automatico' : normal(decisao?.status) === 'pedido autorizado' ? 'autorizado_manual' : cancelado ? 'cancelado' : pendente ? 'pendente' : 'indisponivel', evento_em: decisao?.em || null, status_atual: statusAtual, status_decisao: decisao?.status || '', nota_automatica: automatico ? 'Aprovação Automática com status de análise APPROVE' : '' };
  }
  const api = Object.freeze({ limpar, normal, link, centavos, linha, tabelaLista, lista, detalhe });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.FilaAFEvidencias = api;
})();
