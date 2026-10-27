const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite'),{JSDOM}=require('jsdom');
const dir=path.join(__dirname,'../supabase/migrations');
const arquivos=fs.readdirSync(dir).filter(f=>f.includes('_feriados_tooltip_')).sort();
assert.ok(process.env.FERIADOS_SQL||arquivos.length,'Migrações de feriados disponíveis');
const migration=process.env.FERIADOS_SQL?fs.readFileSync(process.env.FERIADOS_SQL,'utf8'):arquivos.map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('\n');
const marcador='[Calendário AF · 📅 Feriado: Dia Nacional de Zumbi e da Consciência Negra]';
(async()=>{
 const db=new PGlite();let passou=0;
 const q=async(s,p=[])=>(await db.query(s,p)).rows;
 const consulta=async(inicio='2026-11-01',fim='2026-11-30',analista=null,codigo='TEST')=>(await q('select public.fila_escala_consultar($1,$2,$3,$4,$5,$6) r',[codigo,'TOKEN-G',null,inicio,fim,analista]))[0].r;
 const salvar=async itens=>(await q("select public.fila_escala_salvar('TEST','TOKEN-G','GESTAO',$1::jsonb,'Teste isolado') r",[JSON.stringify(itens)]))[0].r;
 const resumo=async()=>(await q("select count(*)::int n,md5(coalesce(jsonb_agg(to_jsonb(e) order by analista,data)::text,'')) hash from public.fila_escala e"))[0];
 const test=async(n,f)=>{await f();passou++;console.log('PASS',n);};
 const reset=async()=>db.exec(`TRUNCATE public.fila_escala,public.fila_eventos,public.fila_historico;
  INSERT INTO public.fila_escala(analista,data,tipo,inicio,fim,observacao,presenca,versao,atualizado_por)VALUES
  ('Gabriel','2026-11-20','trabalho','08:00','17:00',repeat('x',500),'trabalhou',7,'Gestão fictícia'),
  ('Gabriel','2026-11-10','folga','','','Observação preservada','nao_informada',2,'Gestão fictícia'),
  ('Rayla','2026-12-08','ferias','','','Texto com <tag> e aspas "','nao_informada',3,'Gestão fictícia');`);
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA af_mobile;GRANT USAGE ON SCHEMA af_mobile TO anon,authenticated,service_role;
   CREATE TABLE public.fila_analistas(nome text PRIMARY KEY);INSERT INTO public.fila_analistas VALUES('Gabriel'),('Rayla');
   CREATE TABLE public.fila_escala(analista text REFERENCES public.fila_analistas(nome),data date,tipo text NOT NULL CHECK(tipo IN ('trabalho','folga','feriado','ferias','atestado','nao_definido')),inicio text NOT NULL DEFAULT '',fim text NOT NULL DEFAULT '',observacao text NOT NULL DEFAULT '' CHECK(length(observacao)<=500),presenca text NOT NULL DEFAULT 'nao_informada',versao integer NOT NULL DEFAULT 1,atualizado_em timestamptz DEFAULT now(),atualizado_por text,PRIMARY KEY(analista,data));
   CREATE TABLE public.fila_eventos(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,analista text,tipo text,ator text,detalhe jsonb);
   CREATE TABLE public.fila_historico(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,ator text,coord boolean,acao text,analista text,pedido_id text,detalhe text);
   CREATE FUNCTION public.fila_log(n text,c boolean,a text,an text,p text,d text)RETURNS void LANGUAGE sql AS $$INSERT INTO public.fila_historico(ator,coord,acao,analista,pedido_id,detalhe)VALUES(n,c,a,an,p,d)$$;
   CREATE FUNCTION public.fila_ator(p_codigo text,p_token text,p_coord text,p_exigir boolean DEFAULT true,OUT o_nome text,OUT o_coord boolean)RETURNS record LANGUAGE plpgsql AS $$BEGIN IF p_codigo IS DISTINCT FROM 'TEST' THEN RAISE EXCEPTION 'Equipe inválida';END IF;o_nome:='Gabriel';o_coord:=coalesce(p_coord='GESTAO',false);END$$;`);
  await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/escala-6.11.0.sql'),'utf8'));
  await db.exec("REVOKE ALL ON FUNCTION public.fila_escala_consultar(text,text,text,date,date,text),public.fila_escala_salvar(text,text,text,jsonb,text) FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.fila_escala_consultar(text,text,text,date,date,text),public.fila_escala_salvar(text,text,text,jsonb,text) TO anon,authenticated,service_role;");
  await reset();const antes=await resumo();await db.exec(migration);
  await test('implantação e consultas não gravam escala, presença, eventos ou histórico',async()=>{
   assert.deepEqual(await resumo(),antes);await consulta();await consulta();assert.deepEqual(await resumo(),antes);
   assert.equal((await q('select count(*)::int n from public.fila_eventos'))[0].n,0);assert.equal((await q('select count(*)::int n from public.fila_historico'))[0].n,0);
  });
  await test('calendário oficial de 2026 contém 14 datas, sem pontos facultativos',async()=>{
   const r=await q("select data::text,nome from af_mobile.feriados_periodo('2026-01-01','2026-12-31')");assert.equal(r.length,14);
   for(const d of ['2026-01-01','2026-04-03','2026-04-21','2026-05-01','2026-06-29','2026-07-28','2026-09-07','2026-09-08','2026-10-12','2026-11-02','2026-11-15','2026-11-20','2026-12-08','2026-12-25'])assert.ok(r.some(x=>x.data===d),d);
   for(const d of ['2026-02-16','2026-02-17','2026-02-18','2026-04-02','2026-04-20','2026-06-04','2026-06-05','2026-06-30','2026-07-27','2026-10-28','2026-10-30'])assert.ok(!r.some(x=>x.data===d),d);
  });
  await test('Sexta-feira Santa é móvel e a virada anual não exige novo cadastro',async()=>{
   for(const [ano,data] of [[2026,'2026-04-05'],[2027,'2027-03-28'],[2028,'2028-04-16'],[2029,'2029-04-01'],[2030,'2030-04-21'],[2100,'2100-03-28']])assert.equal((await q('select af_mobile.pascoa_referencia($1)::text d',[ano]))[0].d,data);
   assert.equal((await q("select data::text from af_mobile.feriados_periodo('2027-03-01','2027-03-31')"))[0].data,'2027-03-26');
   assert.deepEqual((await q("select data::text from af_mobile.feriados_periodo('2026-12-25','2027-01-01')")).map(x=>x.data),['2026-12-25','2027-01-01']);
   assert.equal((await q("select count(*)::int n from af_mobile.feriados_periodo('2025-01-01','2025-12-31')"))[0].n,0);
  });
  await test('dias sem escala são virtuais, Não definido, versão zero e sem horários',async()=>{
   const r=await consulta(),v=r.itens.find(x=>x.analista==='Rayla'&&x.data==='2026-11-20');assert.ok(v);assert.equal(v.tipo,'nao_definido');assert.equal(v.versao,0);assert.equal(v.inicio,'');assert.equal(v.fim,'');assert.equal(v.presenca,'nao_informada');assert.equal(v.observacao,marcador);
   assert.equal(r.itens.length,7);assert.equal((await resumo()).n,3);assert.equal(new Set(r.itens.map(x=>x.analista+'|'+x.data)).size,r.itens.length);
  });
  await test('escala preenchida conserva horários, presença, versão e observação de 500 caracteres',async()=>{
   const r=await consulta(),e=r.itens.find(x=>x.analista==='Gabriel'&&x.data==='2026-11-20');assert.equal(e.tipo,'trabalho');assert.equal(e.inicio,'08:00');assert.equal(e.fim,'17:00');assert.equal(e.presenca,'trabalhou');assert.equal(e.versao,7);assert.equal(e.observacao,'x'.repeat(500)+'\n'+marcador);
   assert.equal((await q('select af_mobile.limpar_feriado_exibicao($1) o',[e.observacao]))[0].o,'x'.repeat(500));
   assert.equal(r.itens.find(x=>x.data==='2026-11-10').observacao,'Observação preservada');
  });
  await test('filtro individual, intervalo e consulta autorizada mantêm o contrato',async()=>{
   assert.ok((await consulta('2026-11-01','2026-11-30','Rayla')).itens.every(x=>x.analista==='Rayla'));assert.equal((await consulta('2026-11-03','2026-11-04')).itens.length,0);
   await assert.rejects(consulta('2026-01-01','2028-01-01'),/366 dias/);await assert.rejects(consulta('2026-11-20','2026-11-01'),/366 dias/);await assert.rejects(consulta('2026-11-01','2026-11-30',null,'ERRADO'),/Equipe inválida/);
  });
  await test('salvar sem mudança não persiste anotação virtual nem gera aviso indevido',async()=>{
   await reset();const e=(await consulta()).itens.find(x=>x.analista==='Gabriel'&&x.data==='2026-11-20');const r=await salvar([e]);assert.equal(r.alterados,0);assert.equal((await q("select observacao,versao from public.fila_escala where analista='Gabriel' and data='2026-11-20'"))[0].observacao,'x'.repeat(500));assert.equal((await q('select count(*)::int n from public.fila_eventos'))[0].n,0);
  });
  await test('gestão preenche célula virtual; versão e aviso passam a existir só após decisão real',async()=>{
   await reset();const e=(await consulta()).itens.find(x=>x.analista==='Rayla'&&x.data==='2026-11-20');const r=await salvar([{...e,tipo:'trabalho',inicio:'09:00',fim:'18:00'}]);assert.equal(r.alterados,1);
   const gravado=(await q("select tipo,observacao,versao from public.fila_escala where analista='Rayla' and data='2026-11-20'"))[0];assert.equal(gravado.tipo,'trabalho');assert.equal(gravado.observacao,'');assert.equal(gravado.versao,1);assert.equal((await q('select count(*)::int n from public.fila_eventos'))[0].n,1);
   await assert.rejects(salvar([{...e,tipo:'folga'}]),/mudou/);
  });
  await test('edição em lote para outro dia remove metadado e preserva texto do gestor',async()=>{
   await reset();const obs='Minha nota\n'+marcador+'\nAnotação extra';await salvar([{analista:'Rayla',data:'2026-11-03',tipo:'folga',versao:0,observacao:obs}]);
   assert.equal((await q("select observacao from public.fila_escala where analista='Rayla' and data='2026-11-03'"))[0].observacao,'Minha nota\nAnotação extra');
   assert.equal((await q('select af_mobile.limpar_feriado_exibicao($1) o',[marcador+'\nNova nota']))[0].o,'Nova nota');
   assert.equal((await q('select af_mobile.limpar_feriado_exibicao($1) o',['Feriado: anotação manual [normal]']))[0].o,'Feriado: anotação manual [normal]');
  });
  await test('analista não ganha edição; helpers e cadastro permanecem privados',async()=>{
   await assert.rejects(q("select public.fila_escala_salvar('TEST','TOKEN-G',null,$1::jsonb,'Teste')",[JSON.stringify([{analista:'Rayla',data:'2026-11-03',tipo:'folga',versao:0}])]),/Somente Coordenação/);
   await db.exec('SET ROLE anon');await assert.rejects(q('select * from af_mobile.feriados_referencia'),/permission denied/);await assert.rejects(q("select * from af_mobile.feriados_periodo('2026-01-01','2026-12-31')"),/permission denied/);await db.exec('RESET ROLE');
   assert.ok((await q("select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='af_mobile' and p.proname in ('pascoa_referencia','feriados_periodo','limpar_feriado_exibicao')")).every(x=>x.prosecdef===false));
   assert.equal((await q("select relrowsecurity rls from pg_class where oid='af_mobile.feriados_referencia'::regclass"))[0].rls,true);
  });
  await test('pino identifica o feriado no cabeçalho, preserva filtros e edição apenas para gestão',async()=>{
   await reset();const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../extension/popup.html'),'utf8'),{runScripts:'outside-only',url:'https://extensao.invalid/'}),w=dom.window;
   try{
    w.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));w.nomeHtml=n=>w.esc(n);w.ANALISTAS=['Gabriel','Rayla'];w.remote={coord:false};w.contextoCliente=()=> 'teste';w.hoje=()=> '2026-11-01';
    let consultas=0;
    w.rpc=async(fn,p)=>{consultas++;assert.equal(fn,'fila_escala_consultar');return consulta(p.p_inicio,p.p_fim,p.p_analista);};
    w.document.getElementById('escalaReferencia').value='2026-11-01';w.document.getElementById('escalaModo').value='mes';w.document.getElementById('editarAnalista').innerHTML='<option>Gabriel</option><option>Rayla</option>';
    w.eval(fs.readFileSync(path.join(__dirname,'../extension/gestao.js'),'utf8'));await w.FilaGestao.carregarEscala();
    const pinos=()=>w.document.querySelectorAll('#escalaGrade thead .escala-feriado-pino');
    assert.equal(pinos().length,3);assert.equal(consultas,1);
    const pino=w.document.querySelector('[data-escala-data="2026-11-20"] .escala-feriado-pino');
    assert.equal(pino.getAttribute('aria-label'),'Feriado: Dia Nacional de Zumbi e da Consciência Negra');assert.equal(pino.hasAttribute('title'),false);assert.equal(pino.tabIndex,0);assert.ok(pino.querySelector('svg'));assert.equal(pino.textContent,'');
    const tooltip=w.document.getElementById(pino.getAttribute('aria-describedby'));
    const apontar=p=>p.dispatchEvent(new w.MouseEvent('pointerover',{bubbles:true}));
    assert.equal(tooltip.hidden,true);assert.equal(tooltip.getAttribute('role'),'tooltip');
    apontar(pino.querySelector('svg'));assert.equal(tooltip.hidden,false);assert.equal(tooltip.textContent,pino.getAttribute('aria-label'));assert.equal(consultas,1);
    pino.querySelector('svg').dispatchEvent(new w.MouseEvent('pointerout',{bubbles:true,relatedTarget:pino}));assert.equal(tooltip.hidden,false);
    pino.dispatchEvent(new w.MouseEvent('pointerout',{bubbles:true}));assert.equal(tooltip.hidden,true);
    const finados=w.document.querySelector('[data-escala-data="2026-11-02"] .escala-feriado-pino');
    apontar(finados);assert.equal(tooltip.hidden,false);assert.equal(tooltip.textContent,'Feriado: Finados');
    w.FilaGestao.renderEscala();assert.equal(tooltip.hidden,false);assert.equal(tooltip.textContent,'Feriado: Finados');assert.equal(w.document.querySelectorAll('#escalaFeriadoTooltip').length,1);
    const finadosNovo=w.document.querySelector('[data-escala-data="2026-11-02"] .escala-feriado-pino');
    finadosNovo.focus();assert.equal(tooltip.hidden,false);
    const escape=new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});finadosNovo.dispatchEvent(escape);assert.equal(tooltip.hidden,true);assert.equal(escape.defaultPrevented,true);
    const segundoEscape=new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});finadosNovo.dispatchEvent(segundoEscape);assert.equal(segundoEscape.defaultPrevented,false);
    finadosNovo.blur();finadosNovo.focus();assert.equal(tooltip.hidden,false);finadosNovo.blur();assert.equal(tooltip.hidden,true);
    apontar(finadosNovo);w.document.getElementById('escalaGrade').dispatchEvent(new w.Event('scroll'));assert.equal(tooltip.hidden,true);
    apontar(finadosNovo);w.dispatchEvent(new w.Event('resize'));assert.equal(tooltip.hidden,true);
    apontar(finadosNovo);w.document.getElementById('escalaDialogo').dispatchEvent(new w.Event('close'));assert.equal(tooltip.hidden,true);
    // Navegadores sem Popover API mantêm a dica dentro dos limites do dialog.
    const dialogo=w.document.getElementById('escalaDialogo');
    dialogo.getBoundingClientRect=()=>({left:0,top:0,right:320,bottom:400});
    tooltip.getBoundingClientRect=()=>({width:200,height:40});
    finadosNovo.getBoundingClientRect=()=>({left:300,right:314,top:20,bottom:34});
    apontar(finadosNovo);assert.equal(tooltip.style.left,'112px');assert.equal(tooltip.style.top,'40px');
    finadosNovo.getBoundingClientRect=()=>({left:0,right:14,top:365,bottom:379});
    apontar(finadosNovo);assert.equal(tooltip.style.left,'8px');assert.equal(tooltip.style.top,'319px');
    finadosNovo.dispatchEvent(new w.MouseEvent('pointerout',{bubbles:true}));
    assert.equal(w.document.querySelector('[data-escala-data="2026-11-19"] .escala-feriado-pino'),null);
    w.document.getElementById('escalaAnalista').innerHTML='<option value="">Todos</option><option>Rayla</option>';w.document.getElementById('escalaAnalista').value='Rayla';w.FilaGestao.renderEscala();assert.equal(pinos().length,3);assert.equal(w.document.querySelectorAll('#escalaGrade tbody tr').length,1);assert.equal(consultas,1);
    let linha=[...w.document.querySelectorAll('#escalaGrade tbody tr')].find(r=>r.firstElementChild.textContent==='Rayla'),celula=linha.querySelectorAll('.escala-dia')[19];assert.equal(celula.textContent,'Não definido');assert.equal(celula.tagName,'SPAN');assert.ok(celula.title.includes('📅 Feriado: Dia Nacional de Zumbi'));
    w.remote.coord=true;w.FilaGestao.renderEscala();w.FilaGestao.editor('Rayla','2026-11-20');assert.equal(w.document.getElementById('editarTipo').value,'nao_definido');assert.equal(w.document.getElementById('editarObservacao').value,marcador);
    w.document.getElementById('escalaModo').value='semana';w.document.getElementById('escalaReferencia').value='2026-11-20';await w.FilaGestao.carregarEscala();assert.equal(pinos().length,1);assert.equal(consultas,2);
    w.document.getElementById('escalaModo').value='mes';w.document.getElementById('escalaReferencia').value='2026-12-01';await w.FilaGestao.carregarEscala();assert.equal(pinos().length,2);assert.equal(w.document.querySelector('[data-escala-data="2026-11-20"]'),null);assert.equal(tooltip.hidden,true);assert.ok(w.document.querySelector('[data-escala-data="2026-12-08"] .escala-feriado-pino').getAttribute('aria-label').includes('Nossa Senhora da Conceição'));assert.equal(consultas,3);
    w.rpc=async()=>({itens:[{analista:'Rayla',data:'2026-12-08',feriado_referencia:'Feriado com "aspas" e <img src=x onerror=alert(1)>'}]});await w.FilaGestao.carregarEscala();assert.equal(pinos().length,1);apontar(pinos()[0]);assert.equal(tooltip.hidden,false);assert.ok(tooltip.textContent.includes('<img src=x'));assert.equal(w.document.querySelector('#escalaGrade img'),null);assert.equal(tooltip.querySelector('img'),null);
   }finally{dom.window.close();}
  });
  console.log(`${passou} verificações de feriados no tooltip passaram.`);
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
