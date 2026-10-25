(() => {
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dinheiro=n=>(Number(n||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  function valor(r){
    if(r.sem_valor && Number(r.sem_valor)===Number(r.quantidade))return 'Não informado';
    return dinheiro(r.valor_centavos)+(r.sem_valor?` + ${r.sem_valor} sem valor informado`:'');
  }
  function linhas(p){
    return [['Total analisado da equipe',p.totais],['Pedido aprovado automático',p.automaticos],['Conclusões informadas pelos analistas',p.manuais],...(p.analistas||[]).map(a=>[a.nome,a])];
  }
  function html(p){
    if(!p)return '<p class="meta">Atualize o banco para consultar os totais de pedidos.</p>';
    return `<h3>Pedidos analisados</h3><p class="meta">Totais da equipe no período; o filtro de analista seleciona as linhas individuais.</p><div class="escala-scroll"><table class="escala-tabela"><thead><tr><th>Origem / analista</th><th>Pedidos únicos</th><th>Valor</th></tr></thead><tbody>${linhas(p).map(([n,r])=>`<tr><th>${esc(n)}</th><td>${Number(r.quantidade||0)}</td><td>${esc(valor(r))}</td></tr>`).join('')}</tbody></table></div><p class="meta">Observados sem conclusão: ${Number(p.sem_conclusao||0)}.${p.legados_sem_conferencia?` Conclusões anteriores ainda sem conferência no AF: ${Number(p.legados_sem_conferencia)}.`:''} ${esc(p.cobertura)}</p>`;
  }
  function csv(p){
    if(!p)return [];
    return [['Pedidos analisados','Quantidade','Valor conhecido (R$)','Pedidos sem valor'],...linhas(p).map(([n,r])=>[n,r.quantidade,(Number(r.valor_centavos||0)/100).toFixed(2).replace('.',','),r.sem_valor||0]),['Observados sem conclusão',p.sem_conclusao],['Cobertura',p.cobertura],[]];
  }
  globalThis.FilaRelatorioProducao=Object.freeze({html,csv,valor});
})();
