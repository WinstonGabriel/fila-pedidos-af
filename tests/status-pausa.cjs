const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const script=fs.readFileSync(path.join(__dirname,'../extension/gestao.js'),'utf8');
const dom=new JSDOM('<table><tbody><tr id="status"></tr></tbody></table>',{runScripts:'outside-only'}),w=dom.window;
w.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
w.podeAgirEm=n=>n==='Gabriel';w.descansos={analistas:{}};w.descansoRelogio=0;
w.remote={analistas:{}};w.cfg=n=>w.remote.analistas[n]||{};w.eval(script);
const futuro=new Date(Date.now()+20*60000).toISOString(),passado=new Date(Date.now()-60000).toISOString();
const render=(n,c)=>{w.remote.analistas[n]=c;w.document.getElementById('status').innerHTML=w.FilaGestao.celulaStatus(n,c);return w.document.querySelector('select');};
try{
 for(const nome of ['Gabriel','Cássio','Abigail']){
  w.descansos.analistas[nome]={ate:futuro};
  const c={atividade:'intervalo',ligado:false,atividade_inicio:'10:00',atividade_fim:'10:20'},antes=JSON.stringify(c);
  const select=render(nome,c);
  assert.equal(select.value,'intervalo');assert.equal(select.selectedOptions[0].textContent,'Pausa 20min');
  assert.equal(select.disabled,nome!=='Gabriel');assert.ok(w.document.querySelector('[type=time]').getAttribute('aria-label').includes('Pausa 20min'));
  assert.ok(select.matches(".status-analista:has(> option[value='intervalo']:checked)"),'Pausa continua usando o indicador amarelo');
  assert.equal(w.FilaGestao.rotuloStatus('intervalo',nome),'Pausa 20min');assert.equal(JSON.stringify(c),antes);
 }
 delete w.descansos.analistas.Gabriel;
 let select=render('Gabriel',{atividade:'intervalo',atividade_inicio:'10:00',atividade_fim:'10:20'});
 assert.equal(select.selectedOptions[0].textContent,'Intervalo','Um intervalo comum de vinte minutos não é a pausa regulamentada');
 select=render('Gabriel',{atividade:'intervalo',descanso_ate:futuro});assert.equal(select.selectedOptions[0].textContent,'Pausa 20min');
 w.descansos.analistas.Gabriel={ate:futuro};
 select=render('Gabriel',{atividade:'intervalo',descanso_ate:null});assert.equal(select.selectedOptions[0].textContent,'Intervalo','Estado do analista prevalece sobre metadado antigo');
 select=render('Gabriel',{atividade:'intervalo',descanso_ate:passado});assert.equal(select.selectedOptions[0].textContent,'Intervalo');
 select=render('Gabriel',{atividade:'intervalo',descanso_ate:'invalido'});assert.equal(select.selectedOptions[0].textContent,'Intervalo');
 w.descansoRelogio=60*60000;
 select=render('Gabriel',{atividade:'intervalo',descanso_ate:futuro});assert.equal(select.selectedOptions[0].textContent,'Intervalo','Usa a diferença do relógio do servidor');
 w.descansoRelogio=0;
 for(const estado of ['on','off','ferias']){
  select=render('Gabriel',{atividade:estado,descanso_ate:futuro});assert.equal(select.selectedOptions[0].textContent,{on:'ON',off:'OFF',ferias:'Férias'}[estado]);
  assert.equal(select.querySelector('option[value="intervalo"]').textContent,'Intervalo');
 }
 assert.equal(w.FilaGestao.rotuloStatus('intervalo'),'Intervalo','Assinatura anterior continua compatível');
 const {runtime}=require('./catalogo-integration.cjs');const r=runtime({});vm.runInContext(script,r.context);
 vm.runInContext(`remote.coord=true;remote.analistas['Cássio']={atividade:'intervalo',ligado:false};descansos.analistas['Cássio']={ate:${JSON.stringify(futuro)}};renderPilha();`,r.context);
 assert.ok(r.doc.getElementById('painel').innerHTML.includes('Pausa 20min · sem pedido atual'));
 console.log('Status da pausa: seletor próprio/colegas/gestão, valor interno, indicador amarelo, horários, card, intervalo comum, prazo e retorno ON verificados');
}finally{dom.window.close();}
