const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {runtime}=require('./catalogo-integration.cjs');
const {PGlite}=require('@electric-sql/pglite');
const tick=()=>new Promise(setImmediate);
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261025175646_distribuicao_por_leitor_identificado.sql'),'utf8');
let passaram=0;
const test=async(nome,fn)=>{await fn();passaram++;console.log('PASS',nome);};
const preparar=async()=>{
  const r=runtime({});await r.sync();
  vm.runInContext("remote.analistas={Gabriel:{ligado:false},Rayla:{ligado:true}};remote.usuarios=[{nome:'Gabriel'},{nome:'Rayla'}];remote.atribuicoes=[];usandoCache=false;leitura.parcial=false;pedidos=[{id:'1000000000001',cat:'Varejo',estab:'Loja teste',hora:'10:00',valor:'R$ 10,00'}]",r.context);
  return r;
};
(async()=>{
  await test('leitor OFF e gestor sem nome conseguem solicitar distribuição para quem está ON',async()=>{
    for(const gestor of [false,true]){
      const r=await preparar();const chamadas=[];
      r.context.rpc=async(fn,args)=>{chamadas.push({fn,args});return{distribuidos:0};};
      if(gestor)vm.runInContext("local.me='';remote.coord=true",r.context);
      assert.equal(await vm.runInContext('distribuirAutomatico()',r.context),true);
      assert.equal(chamadas.length,1);assert.equal(chamadas[0].fn,'fila_distribuir_auto');
    }
  });
  await test('não distribui sem identidade, sem destinatário livre ou usando leitura antiga',async()=>{
    for(const estado of ["local.me='';remote.coord=false","usandoCache=true","remote.atribuicoes=[{pedido_id:'ocupado',analista:'Rayla',status:'em_andamento'}]"]){
      const r=await preparar();let chamadas=0;r.context.rpc=async()=>{chamadas++;return{distribuidos:0};};
      vm.runInContext(estado,r.context);
      assert.equal(await vm.runInContext('distribuirAutomatico()',r.context),false);assert.equal(chamadas,0);
    }
  });
  await test('um pedido novo durante a requisição recebe nova tentativa imediatamente',async()=>{
    const r=await preparar();const chamadas=[];let liberar;
    r.context.rpc=async(fn,args)=>{chamadas.push(args.p_candidatos.map(p=>p.id));if(chamadas.length===1)await new Promise(resolve=>liberar=resolve);return{distribuidos:0};};
    const primeira=vm.runInContext('distribuirAutomatico()',r.context);
    vm.runInContext("pedidos.push({id:'1000000000002',cat:'Varejo',estab:'Loja nova'})",r.context);
    const segunda=vm.runInContext('distribuirAutomatico()',r.context);liberar();
    await Promise.all([primeira,segunda]);await tick();
    assert.equal(chamadas.length,2);assert.ok(chamadas[1].includes('1000000000002'));
  });
  await test('consultas concorrentes da mesma lista não criam requisições repetidas',async()=>{
    const r=await preparar();let chamadas=0,liberar;
    r.context.rpc=async()=>{chamadas++;await new Promise(resolve=>liberar=resolve);return{distribuidos:0};};
    const a=vm.runInContext('distribuirAutomatico()',r.context),b=vm.runInContext('distribuirAutomatico()',r.context);liberar();
    await Promise.all([a,b]);await tick();assert.equal(chamadas,1);
  });
  await test('lotes incluem pedidos além do antigo limite de 500 e preservam detalhes essenciais',async()=>{
    const r=await preparar();
    vm.runInContext("pedidos=Array.from({length:1200},(_,i)=>({id:String(1000000000000+i),cat:i<550?'Força de Vendas':'Varejo',estab:'Loja '+i}));remote.atribuicoes=[{pedido_id:'1000000001199',analista:'Rayla',status:'devolvido'}]",r.context);
    const pool=vm.runInContext('candidatosAuto()',r.context);
    assert.equal(pool.length,1000);assert.ok(pool.some(p=>p.id==='1000000000550'));
    assert.ok(pool.some(p=>p.id==='1000000001199'));
  });
  await test('sair da lista sem conclusão não é apresentado como trabalho feito',async()=>{
    const r=await preparar();
    vm.runInContext("pedidos=[];remote.atribuicoes=[{pedido_id:'ativo',analista:'Rayla',status:'em_andamento'}];renderPilha()",r.context);
    assert.match(r.el('painel').innerHTML,/origem da saída a confirmar/);
    assert.ok(!r.el('painel').innerHTML.includes('feito por:'));
  });
  await test('terminar a varredura completa distribui sem esperar outra leitura e respeita o contexto',async()=>{
    const r=await preparar();let chamadas=0;
    r.context.distribuirAutomatico=async()=>{chamadas++;};
    r.context.injetarLeitura=async()=>({ok:true,contexto:'contexto-af',pedidos:[],porPagina:{1:[]},paginaAtual:1,paginas:1,totalMenu:0});
    vm.runInContext("paginasLidas.contexto='contexto-af'",r.context);
    await vm.runInContext("lerCompleto({id:1},'contexto-af')",r.context);
    assert.equal(chamadas,1);
    await vm.runInContext("lerCompleto({id:1},'outro-filtro')",r.context);
    assert.equal(chamadas,1);
  });
  const db=new PGlite();
  try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
      CREATE TABLE public.fila_analistas(nome text PRIMARY KEY,ligado boolean DEFAULT false,atualizado_em timestamptz DEFAULT now());
      CREATE TABLE public.fila_usuarios(nome text PRIMARY KEY,token text UNIQUE);
      CREATE TABLE public.fila_atribuicoes(pedido_id text PRIMARY KEY,analista text,status text,hora text DEFAULT '',valor text DEFAULT '',estab text DEFAULT '',href text DEFAULT '',categoria text DEFAULT '',criado_em timestamptz DEFAULT now(),atualizado_em timestamptz DEFAULT now());
      CREATE TABLE public.fila_historico(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,quando timestamptz DEFAULT now(),ator text,coord boolean,acao text,analista text,pedido_id text,detalhe text);
      CREATE TABLE public.fila_preferencias_analista(analista text PRIMARY KEY,lojas jsonb);
      CREATE TABLE public.rotas_teste(loja text PRIMARY KEY,analista text);
      CREATE FUNCTION public.fila_destino_loja(p_loja text) RETURNS text LANGUAGE sql AS $$SELECT analista FROM public.rotas_teste WHERE loja=p_loja$$;
      CREATE FUNCTION public.fila_log(p_ator text,p_coord boolean,p_acao text,p_analista text,p_pedido text,p_detalhe text) RETURNS void LANGUAGE sql AS $$INSERT INTO public.fila_historico(ator,coord,acao,analista,pedido_id,detalhe)VALUES(p_ator,p_coord,p_acao,p_analista,p_pedido,p_detalhe)$$;
      CREATE FUNCTION public.fila_ator(p_codigo text,p_token text,p_coord text,OUT o_nome text,OUT o_coord boolean) RETURNS record LANGUAGE plpgsql AS $$BEGIN IF p_codigo IS DISTINCT FROM 'TEST' THEN RAISE EXCEPTION 'Equipe inválida';END IF;SELECT nome INTO o_nome FROM public.fila_usuarios WHERE token=p_token;o_coord:=coalesce(p_coord='GESTAO',false);IF o_nome IS NULL AND NOT o_coord THEN RAISE EXCEPTION 'Escolha seu nome';END IF;END$$;
      INSERT INTO public.fila_analistas(nome,ligado)VALUES('Gabriel',false),('Rayla',true),('Cássio',false);
      INSERT INTO public.fila_usuarios VALUES('Gabriel','TOKEN-G'),('Rayla','TOKEN-R'),('Cássio','TOKEN-C');`);
    await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/distribuicao-6.8.2.sql'),'utf8'));
    await db.exec('REVOKE ALL ON FUNCTION public.fila_distribuir_auto(text,text,text,jsonb) FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.fila_distribuir_auto(text,text,text,jsonb) TO anon,authenticated;');
    const chamar=async(pool,token='TOKEN-G',codigo='TEST')=>(await db.query('select public.fila_distribuir_auto($1,$2,null,$3::jsonb) as r',[codigo,token,JSON.stringify(pool)])).rows[0].r;
    await test('reproduz o bloqueio antigo do coletor OFF no banco',async()=>{
      assert.equal((await chamar([{id:'antes',cat:'Varejo',estab:'Geral'}])).distribuidos,0);
    });
    await db.exec(migration);
    await test('banco recebe coleta OFF e destina somente ao analista ON e livre',async()=>{
      assert.equal((await chamar([{id:'corrigido',cat:'Varejo',estab:'Geral'}])).distribuidos,1);
      assert.equal((await db.query("select analista from public.fila_atribuicoes where pedido_id='corrigido'")).rows[0].analista,'Rayla');
      assert.equal((await db.query("select count(*)::int as n from public.fila_atribuicoes where analista='Gabriel'")).rows[0].n,0);
      await db.exec('TRUNCATE public.fila_atribuicoes');
    });
    await test('restrições de Força de Vendas e direcionamento continuam sendo aplicadas',async()=>{
      assert.equal((await chamar([{id:'fv',cat:'Força de Vendas',estab:'Geral'}])).distribuidos,0);
      await db.exec("INSERT INTO public.rotas_teste VALUES('Exclusiva','Cássio')");
      assert.equal((await chamar([{id:'rota',cat:'Varejo',estab:'Exclusiva'}])).distribuidos,0);
      assert.equal((await chamar([{id:'livre',cat:'Varejo',estab:'Geral'}])).distribuidos,1);
    });
    await test('autorização e permissões são preservadas e reaplicar é seguro',async()=>{
      await assert.rejects(chamar([],'DESCONHECIDO'),/Escolha seu nome/);
      await assert.rejects(chamar([],'TOKEN-G','ERRADA'),/Equipe inválida/);
      await db.exec(migration);
      const r=(await db.query("select has_function_privilege('anon','public.fila_distribuir_auto(text,text,text,jsonb)','EXECUTE') as anon, exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid='public.fila_distribuir_auto(text,text,text,jsonb)'::regprocedure and a.grantee=0) as publico")).rows[0];
      assert.equal(r.anon,true);assert.equal(r.publico,false);
    });
  } finally {await db.close();}
  console.log(`${passaram} verificações de distribuição passaram.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
