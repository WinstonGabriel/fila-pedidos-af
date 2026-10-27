const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {PGlite} = require('@electric-sql/pglite'), {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'supabase/migrations');
const sql = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find(f => f.endsWith('_preferencia_folga_feriados.sql'))), 'utf8');
const names = ['Analista 1', 'Analista 2', 'Analista 3', 'Analista 4', 'Analista 5'];
(async () => {
 const db = new PGlite(); let total = 0;
 const q = async (s, p = []) => (await db.query(s, p)).rows;
 const clock = t => q("select set_config('test.clock',$1,false)", [t]);
 const send = (token = 'TOKEN1', day = '2026-11-20', coord = null) => q('select public.fila_feriado_solicitar_folga($1,$2,$3,$4) r', ['TEST', token, coord, day]).then(r => r[0].r);
 const read = (token = 'TOKEN1', coord = null, start = '2026-11-01', end = '2026-11-30') => q('select public.fila_feriados_preferencias($1,$2,$3,$4,$5) r', ['TEST', token, coord, start, end]).then(r => r[0].r);
 const run = async (name, fn) => {await fn(); total++; console.log('PASS', name);};
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA af_mobile; CREATE SCHEMA test_util;
   CREATE FUNCTION test_util.agora() RETURNS timestamptz LANGUAGE sql AS $$SELECT current_setting('test.clock')::timestamptz$$;
   CREATE TABLE public.fila_analistas(nome text PRIMARY KEY);
   CREATE TABLE public.fila_escala(analista text,data date,tipo text,PRIMARY KEY(analista,data));
   CREATE TABLE public.fila_historico(ator text,acao text,analista text,detalhe text);
   CREATE FUNCTION public.fila_log(n text,c boolean,a text,an text,p text,d text) RETURNS void LANGUAGE sql AS $$INSERT INTO public.fila_historico VALUES(n,a,an,d)$$;
   CREATE FUNCTION public.fila_ator(p_codigo text,p_token text,p_coord text,p_exigir boolean DEFAULT true,OUT o_nome text,OUT o_coord boolean) RETURNS record LANGUAGE plpgsql AS $$
   BEGIN
    IF p_codigo IS DISTINCT FROM 'TEST' THEN RAISE EXCEPTION 'Equipe inválida'; END IF;
    o_nome:=CASE WHEN p_token ~ '^TOKEN[1-5]$' THEN 'Analista '||right(p_token,1) END;
    IF p_coord IS NOT NULL AND p_coord<>'GESTAO' THEN RAISE EXCEPTION 'Gestão inválida'; END IF;
    o_coord:=coalesce(p_coord='GESTAO',false);
    IF p_exigir AND o_nome IS NULL AND NOT o_coord THEN RAISE EXCEPTION 'Escolha quem você é'; END IF;
   END$$;`);
  for (const n of names) await q('insert into public.fila_analistas values($1)', [n]);
  for (const f of fs.readdirSync(dir).filter(f => /feriados_tooltip_(estrutura|dados|funcoes)\.sql$/.test(f)).sort()) await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  await clock('2026-11-17T23:59:59.999999-03:00');
  // Injeta apenas o relógio; a SQL de produção e os controles de permissão são executados pelo PostgreSQL.
  await db.exec(sql.replaceAll('clock_timestamp()', 'test_util.agora()'));
  await run('prazo usa meia-noite de São Luís e aceita o último instante de D-3', async () => {
   assert.equal(Number((await q("select extract(epoch from af_mobile.feriado_preferencia_prazo('2026-11-20')) p"))[0].p), Date.parse('2026-11-18T03:00:00Z')/1000);
   const r = await send(); assert.equal(r.posicao, 1); assert.equal(r.ja_enviada, false);
  });
  await run('00h de D-2 encerra o prazo, incluindo quando o navegador informa outra data', async () => {
   await clock('2026-11-18T00:00:00-03:00');
   await assert.rejects(send('TOKEN2'), /Prazo encerrado/);
   const f = (await read()).feriados.find(f => f.data === '2026-11-20'); assert.equal(f.aberto, false);
  });
  await run('repetição após o prazo mantém posição e horário, sem outro registro', async () => {
   const before = (await read()).feriados.find(f => f.data === '2026-11-20').minha;
   const r = await send(); assert.equal(r.ja_enviada, true); assert.equal(r.posicao, before.posicao); assert.equal(r.solicitado_em, before.solicitado_em);
   assert.equal((await q('select count(*)::int n from public.fila_historico'))[0].n, 1);
  });
  await run('pedidos em paralelo têm posições únicas; gestão recebe só os três primeiros', async () => {
   await clock('2026-11-16T09:00:00-03:00');
   await Promise.all([send('TOKEN2'), send('TOKEN3'), send('TOKEN4'), send('TOKEN5'), send('TOKEN2')]);
   assert.deepEqual((await q('select posicao from af_mobile.feriado_preferencias order by posicao')).map(r => r.posicao), [1,2,3,4,5]);
   const d = await read('GESTOR', 'GESTAO'); assert.equal(d.gestao, true);
   const rows = d.feriados.find(f => f.data === '2026-11-20').primeiras;
   assert.deepEqual(rows.map(r => r.analista), names.slice(0,3)); assert.ok(rows.every(r => r.solicitado_em));
   assert.equal(JSON.stringify(d).includes('Analista 4'), false);
  });
  await run('analista vê somente seu envio, inclusive fora das três primeiras', async () => {
   const d = await read('TOKEN4'); assert.equal(d.analista, 'Analista 4');
   const f = d.feriados.find(f => f.data === '2026-11-20'); assert.equal(f.minha.posicao, 4); assert.equal('primeiras' in f, false);
   assert.equal(JSON.stringify(d).includes('Analista 1'), false);
  });
  await run('solicitar não preenche nem confirma escala; decisão da gestão é refletida na consulta', async () => {
   assert.equal((await q('select count(*)::int n from public.fila_escala'))[0].n, 0);
   await db.exec("INSERT INTO public.fila_escala VALUES('Analista 1','2026-11-20','folga')");
   assert.equal((await read('GESTOR', 'GESTAO')).feriados.find(f => f.data === '2026-11-20').primeiras[0].escala_tipo, 'folga');
  });
  await run('identidade, equipe, datas e permissão de gestão são validadas no servidor', async () => {
   await assert.rejects(send('GESTOR','2026-11-20','GESTAO'), /Escolha quem/);
   await assert.rejects(send('TOKEN1','2026-11-19'), /não é um feriado/);
   await assert.rejects(send('TOKEN1',null), /não é um feriado/);
   await assert.rejects(q("select public.fila_feriados_preferencias('ERRADO','TOKEN1',NULL,'2026-11-01','2026-11-30')"), /Equipe inválida/);
   await assert.rejects(read('TOKEN1','INVALIDO'), /Gestão inválida/);
   await assert.rejects(read('TOKEN1',null,'2026-11-30','2026-11-01'), /366 dias/);
   await assert.rejects(read('TOKEN1',null,'2026-01-01','2028-01-01'), /366 dias/);
  });
  await run('ponto facultativo não permite pedido e falta de nome permite apenas consulta', async () => {
   await clock('2026-01-01T12:00:00-03:00'); await assert.rejects(send('TOKEN1','2026-06-04'), /não é um feriado/);
   const d = await read('SEM-NOME'); assert.equal(d.analista, null); assert.ok(d.feriados.every(f => f.minha === null));
  });
  await run('tabela e prazo são privados; wrappers públicos são invoker e aplicam autenticação', async () => {
   await db.exec('SET ROLE anon');
   await assert.rejects(q('select * from af_mobile.feriado_preferencias'), /permission denied/);
   await assert.rejects(q("select af_mobile.feriado_preferencia_prazo('2026-11-20')"), /permission denied/);
   assert.equal((await read()).analista, 'Analista 1');
   await assert.rejects(send('SEM-NOME'), /Escolha quem/); await db.exec('RESET ROLE');
   assert.ok((await q("select prosecdef from pg_proc where pronamespace='public'::regnamespace and proname in ('fila_feriados_preferencias','fila_feriado_solicitar_folga')")).every(r => !r.prosecdef));
  });
  await run('cada feriado mantém sua ordem e não aceita cliques duplicados de uma instalação', async () => {
   assert.equal((await send('TOKEN3','2026-12-08')).posicao, 1);
   assert.equal((await send('TOKEN3','2026-12-08')).posicao, 1);
   assert.equal((await q("select count(*)::int n from af_mobile.feriado_preferencias where data='2026-12-08'"))[0].n, 1);
  });
  await run('interface envia preferência própria, bloqueia duplo clique e mostra confirmação', async () => {
   const dom = new JSDOM(fs.readFileSync(path.join(root,'extension/popup.html'),'utf8'), {runScripts:'outside-only'}), w = dom.window;
   try {
    w.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    w.local = {me:'Analista 1'}; w.remote = {coord:false}; w.contextoCliente = () => 'TEST'; w.credencialCoord = () => null;
    let sends = 0, release;
    const payload = {gestao:false, analista:'Analista 1', servidor_em:new Date().toISOString(), feriados:[{data:'2026-11-20',nome:'Feriado <img src=x onerror=alert(1)>',prazo_em:new Date(Date.now()+86400000).toISOString(),aberto:true,minha:null}]};
    w.rpc = async (fn,p) => {
     if (fn === 'fila_feriados_preferencias') return structuredClone(payload);
     assert.equal(fn,'fila_feriado_solicitar_folga'); assert.deepEqual(Object.keys(p).sort(),['p_coord','p_data']); assert.equal(p.p_coord,null);
     sends++; await new Promise(r => release = r); return {posicao:1, solicitado_em:new Date().toISOString()};
    };
    w.eval(fs.readFileSync(path.join(root,'extension/feriados-preferencias.js'),'utf8'));
    await w.FilaFeriadosPreferencias.carregar({inicio:'2026-11-01',fim:'2026-11-30'});
    assert.equal(w.document.querySelector('#feriadoPreferencias img'), null);
    const button = w.document.querySelector('[data-feriado-solicitar]'); button.click(); button.click(); assert.equal(sends,1);
    release(); await new Promise(setImmediate);
    assert.equal(w.document.querySelector('[data-feriado-solicitar]').disabled,true);
    assert.ok(w.document.querySelector('#feriadoPreferencias').textContent.includes('Preferência enviada'));
    assert.ok(w.document.querySelector('#feriadoFeedback').textContent.includes('Aguarde'));
    w.local.me='Analista 2'; w.FilaFeriadosPreferencias.atualizar(); assert.equal(w.document.getElementById('feriadoPreferencias').hidden,true);
   } finally {dom.window.close();}
  });
  await run('interface da gestão limita a três nomes e só abre o editor; respostas antigas não vazam após sair', async () => {
   const dom = new JSDOM(fs.readFileSync(path.join(root,'extension/popup.html'),'utf8'), {runScripts:'outside-only'}), w = dom.window;
   try {
    w.esc = s => String(s ?? ''); w.local={me:''}; w.remote={coord:true}; w.contextoCliente=()=> 'TEST'; w.credencialCoord=()=> w.remote.coord?'GESTAO':null;
    let opened, release;
    w.FilaGestao={editor:(...v)=>opened=v};
    const payload={gestao:true,analista:null,servidor_em:new Date().toISOString(),feriados:[{data:'2026-11-20',nome:'Feriado',prazo_em:'2026-11-18T03:00:00Z',aberto:true,primeiras:names.map((analista,i)=>({analista,posicao:i+1,solicitado_em:'2026-11-16T12:00:00Z',escala_tipo:'nao_definido'}))}]};
    w.rpc=async()=>payload; w.eval(fs.readFileSync(path.join(root,'extension/feriados-preferencias.js'),'utf8'));
    await w.FilaFeriadosPreferencias.carregar({inicio:'2026-11-01',fim:'2026-11-30'});
    assert.equal(w.document.querySelectorAll('[data-feriado-editar]').length,3); assert.equal(w.document.querySelector('[data-feriado-solicitar]'),null);
    w.document.querySelector('[data-feriado-editar]').click(); assert.deepEqual(opened,['Analista 1','2026-11-20']);
    w.rpc=()=>new Promise(r=>release=r); const load=w.FilaFeriadosPreferencias.carregar({inicio:'2026-12-01',fim:'2026-12-31'});
    w.remote.coord=false; w.FilaFeriadosPreferencias.atualizar(); release(payload); await load;
    assert.equal(w.document.getElementById('feriadoPreferencias').hidden,true); assert.equal(w.document.querySelector('[data-feriado-editar]'),null);
   } finally {dom.window.close();}
  });
  console.log(`${total} verificações de preferência de folga passaram.`);
 } finally {await db.close();}
})().catch(e => {console.error(e); process.exitCode=1;});
