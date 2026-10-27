const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '../extension');
const worker = fs.readFileSync(path.join(root, 'auto-reload-background.js'), 'utf8');
const nome = 'af-auto-reload-local', chave = 'afAutoReloadBaseline';
const event = () => { const listeners = []; return {addListener: f => listeners.push(f), emit: (...args) => listeners.map(f => f(...args))}; };
const tick = () => new Promise(setImmediate);
function runtime({tipo = 'development', session = {}, arquivos, alarmes = new Map()} = {}) {
  const obrigatorios = ['manifest.json', 'background.js', 'config.js', 'auto-reload-background.js', 'auto-reload-cliente.js', 'popup.html', 'gestao.css'];
  const files = arquivos || Object.fromEntries(obrigatorios.map(p => [p, '/* versão inicial */']));
  if (!arquivos) {
    files['manifest.json'] = JSON.stringify({manifest_version:3, version:'6.14.0', background:{service_worker:'background.js'}});
    files['config.js'] = "const CODIGO_FICTICIO='NAO-PERSISTIR-CONTEUDO';";
    files['auto-reload-arquivos.json'] = JSON.stringify({schema:1, arquivos: obrigatorios});
  }
  const onConnect = event(), onAlarm = event(), calls = [], docs = [], timers = new Set();
  const state = {files, session, calls, docs, alarmes, reloads:0, confirmar:null, failStorage:false, aposContextos:null};
  const setTimer = (fn, ms) => {
    const timer = {cancelado:false}; timers.add(timer);
    if (ms === 3000 || ms === 1500) setImmediate(() => {if (!timer.cancelado) {timers.delete(timer);if(ms===3000)state.confirmar?.();fn();}});
    return timer;
  };
  const clearTimer = timer => {if(timer){timer.cancelado=true;timers.delete(timer);}};
  const chrome = {
    management:{getSelf:async()=>({installType:tipo})},
    storage:{session:{get:async k=>{if(state.failStorage)throw Error('storage');return {[k]:structuredClone(session[k])};}, set:async v=>Object.assign(session,structuredClone(v))}},
    runtime:{id:'af-test', getURL:p=>'chrome-extension://af-test/'+p, getManifest:()=>({version:'6.14.0'}), onConnect,
      getContexts:async()=>{const result=structuredClone(docs);state.aposContextos?.();return result;}, reload:()=>state.reloads++},
    alarms:{onAlarm, get:async n=>alarmes.get(n), create:async(n,v)=>{calls.push(['alarme',n,v]);alarmes.set(n,v);}, clear:async n=>alarmes.delete(n)},
  };
  const ctx = vm.createContext({chrome, crypto:webcrypto, URL, TextEncoder, TextDecoder, Uint8Array, AbortController, console,
    setTimeout:setTimer, clearTimeout:clearTimer, fetch:async(url, opts)=>{
      const u = new URL(url);assert.equal(u.protocol,'chrome-extension:');assert.equal(u.hostname,'af-test');assert.equal(opts.cache,'no-store');assert(opts.signal);assert(u.searchParams.has('af_reload'));
      const p = u.pathname.slice(1);calls.push(['fetch',p]);
      if(!Object.hasOwn(files,p))return {ok:false};
      const bytes = new TextEncoder().encode(files[p]);return {ok:true,arrayBuffer:async()=>bytes.buffer};
    }});
  vm.runInContext(worker,ctx,{filename:'auto-reload-background.js'});
  state.api = ctx.FilaAutoReload;
  state.verificar = async()=>{await state.api.pronto;return state.api.verificar();};
  state.port = ({id='doc-1',ok=true,origem='chrome-extension://af-test/popup.html',senderId='af-test',responder=true,aoPreparar}={}) => {
    const p = {name:nome,sender:{id:senderId,documentId:id,url:origem},onMessage:event(),onDisconnect:event(),messages:[],
      postMessage(msg){this.messages.push(msg);if(msg.tipo==='preparar'){aoPreparar?.(msg,p);if(responder)p.onMessage.emit({tipo:'pronto',tentativa:msg.tentativa,ok});}}};
    docs.push({documentId:id,documentUrl:origem});onConnect.emit(p);return p;
  };
  state.alarme = ()=>onAlarm.emit({name:nome});
  return state;
}
function cliente() {
  const dom = new JSDOM('<input id="texto">',{runScripts:'outside-only',url:'https://extensao.invalid/'}), w=dom.window;
  const onMessage=event(),onDisconnect=event(), enviados=[];
  const port={onMessage,onDisconnect,postMessage:msg=>enviados.push(msg),disconnect:()=>{}};
  w.chrome={runtime:{id:'af-test',connect:()=>port}};
  let agora=10000;
  w.Date.now=()=>agora;
  w.eval(fs.readFileSync(path.join(root,'auto-reload-cliente.js'),'utf8'));
  return {dom,w,api:w.FilaAutoReloadCliente, enviados, enviar:tipo=>onMessage.emit({tipo,tentativa:1}), avancar:()=>{agora+=4000;}};
}
(async()=>{
  let n=0;const test=async(t,f)=>{await f();n++;console.log('PASS',t);};
  await test('somente instalação development monitora arquivos; normal/admin e API ausente ficam inertes',async()=>{
    for(const tipo of ['normal','admin','sideload','other']){const r=runtime({tipo});assert.equal(await r.verificar(),false);assert.equal(r.calls.length,0);assert.equal(r.reloads,0);}
    const c=vm.createContext({chrome:{runtime:{},storage:{}},console});vm.runInContext(worker,c);assert.equal(await c.FilaAutoReload.pronto,false);
  });
  await test('primeira leitura estabelece baseline sem recarga, sem código-fonte ou configuração na sessão',async()=>{
    const r=runtime();assert.equal(await r.verificar(),false);assert.equal(r.reloads,0);assert.match(r.session[chave].assinatura,/^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(r.session).includes('NAO-PERSISTIR-CONTEUDO'),false);assert.equal(r.alarmes.get(nome).periodInMinutes,1);
    const antes=r.calls.length;await r.verificar();assert.equal(r.reloads,0);assert(r.calls.length>antes);
  });
  await test('CSS muda sem mudar a versão; duas leituras estáveis causam uma única recarga',async()=>{
    const r=runtime();await r.verificar();const baseline=r.session[chave].assinatura;r.files['gestao.css']='.pino {color:green}';
    assert.equal(await r.verificar(),true);assert.equal(r.reloads,1);assert.equal(r.session[chave].assinatura,baseline);await r.verificar();assert.equal(r.reloads,1);
    const recarregado=runtime({arquivos:r.files});await recarregado.verificar();assert.equal(recarregado.reloads,0);
  });
  await test('baseline atravessa a suspensão do worker; alarme existente não é reiniciado e painel fechado não impede detectar',async()=>{
    const a=runtime();await a.verificar();a.files['gestao.css']='.pino {color:red}';
    const b=runtime({arquivos:a.files,session:a.session,alarmes:a.alarmes});await b.verificar();assert.equal(b.reloads,1);assert.equal(b.calls.some(c=>c[0]==='alarme'),false);
    const c=runtime();await c.verificar();c.files['gestao.css']='.pino {color:blue}';c.alarme();await c.verificar();assert.equal(c.reloads,1);
  });
  await test('cópia ainda mudando, arquivo ausente, vazio ou JSON inválido preservam a instalação e tentam depois',async()=>{
    const r=runtime();await r.verificar();const baseline=r.session[chave].assinatura;r.files['gestao.css']='a';
    r.confirmar=()=>{r.files['gestao.css']+='b';};await r.verificar();assert.equal(r.reloads,0);assert.equal(r.session[chave].assinatura,baseline);r.confirmar=null;
    const css=r.files['gestao.css'];delete r.files['gestao.css'];await r.verificar();r.files['gestao.css']='';await r.verificar();r.files['gestao.css']=css;
    const manifest=r.files['manifest.json'];r.files['manifest.json']='{';await r.verificar();assert.equal(r.reloads,0);r.files['manifest.json']=manifest;
    await r.verificar();assert.equal(r.reloads,1);
  });
  await test('índice novo pode adicionar arquivo; caminhos externos e travessia não são consultados',async()=>{
    const r=runtime();await r.verificar();const indice=JSON.parse(r.files['auto-reload-arquivos.json']);indice.arquivos.push('novo.js');r.files['novo.js']='const novo=1;';r.files['auto-reload-arquivos.json']=JSON.stringify(indice);await r.verificar();assert.equal(r.reloads,1);
    for(const p of ['https://intruso.invalid/x.js','../fora.js','/fora.js','%2e%2e/fora.js']){const s=runtime();await s.verificar();const i=JSON.parse(s.files['auto-reload-arquivos.json']);i.arquivos.push(p);s.files['auto-reload-arquivos.json']=JSON.stringify(i);await s.verificar();assert.equal(s.reloads,0);}
  });
  await test('todos os painéis precisam confirmar; edição, painel desconhecido, resposta atrasada ou outra origem adiam a recarga',async()=>{
    const r=runtime();await r.verificar();r.port();const b=r.port({id:'doc-2',ok:false});r.files['gestao.css']='mudou';await r.verificar();assert.equal(r.reloads,0);
    r.docs.splice(1,1);b.onDisconnect.emit();await r.verificar();assert.equal(r.reloads,1);
    for(const opts of [{senderId:'outra'},{responder:false},{responder:false,aoPreparar:(m,p)=>p.onMessage.emit({tipo:'pronto',tentativa:m.tentativa-1,ok:true})}]){
      const s=runtime();await s.verificar();s.port(opts);s.files['gestao.css']='mudou';await s.verificar();assert.equal(s.reloads,0);
    }
    const t=runtime();await t.verificar();t.docs.push({documentId:'sem-port',documentUrl:'chrome-extension://af-test/popup.html#escala'});t.files['gestao.css']='mudou';await t.verificar();assert.equal(t.reloads,0);
  });
  await test('operação em andamento adia; barreira impede novas operações durante a confirmação',async()=>{
    const r=runtime();await r.verificar();const liberar=r.api.iniciarOperacao();r.files['gestao.css']='mudou';await r.verificar();assert.equal(r.reloads,0);liberar();liberar();
    let bloqueou=false;r.port({aoPreparar:()=>{try{r.api.iniciarOperacao();}catch{bloqueou=true;}}});await r.verificar();assert.equal(r.reloads,1);assert.equal(bloqueou,true);
    const s=runtime();await s.verificar();await assert.rejects(s.api.executar(async()=>{throw Error('falhou');}),/falhou/);s.files['gestao.css']='mudou';await s.verificar();assert.equal(s.reloads,1);
  });
  await test('conferências concorrentes compartilham leitura e falha de armazenamento nunca força recarga',async()=>{
    const r=runtime();await r.verificar();r.files['gestao.css']='mudou';r.failStorage=true;await r.verificar();assert.equal(r.reloads,0);r.failStorage=false;
    await Promise.all([r.verificar(),r.verificar(),r.verificar()]);assert.equal(r.reloads,1);
  });
  await test('captura prioritária que chega na confirmação cancela a recarga antes de persistir a observação',async()=>{
    const r=runtime();await r.verificar();let escrita=false,primeira=true;
    r.port({aoPreparar:()=>{if(primeira){primeira=false;r.api.executar(async()=>{await tick();escrita=true;},{prioritaria:true});}}});
    r.files['gestao.css']='mudou';await r.verificar();await tick();assert.equal(r.reloads,0);assert.equal(escrita,true);
    await r.verificar();assert.equal(r.reloads,1);
  });
  await test('cliente só confirma após iniciar, sem operação ou interação recente; cancelar libera nova gravação',async()=>{
    const c=cliente();try{
      c.enviar('preparar');assert.equal(c.enviados.at(-1).ok,false);c.api.definirVerificacao(()=>true);
      const liberar=c.api.iniciarOperacao();c.enviar('preparar');assert.equal(c.enviados.at(-1).ok,false);liberar();liberar();
      c.w.document.getElementById('texto').dispatchEvent(new c.w.Event('input',{bubbles:true}));c.enviar('preparar');assert.equal(c.enviados.at(-1).ok,false);c.avancar();
      c.enviar('preparar');assert.equal(c.enviados.at(-1).ok,true);assert.equal(c.enviados.at(-1).tentativa,1);assert.throws(()=>c.api.iniciarOperacao(),/atualizando/);
      c.enviar('cancelar');c.api.iniciarOperacao()();c.api.definirVerificacao(()=>false);c.enviar('preparar');assert.equal(c.enviados.at(-1).ok,false);
      await assert.rejects(c.api.executar(async()=>{throw Error('rpc falhou');}),/rpc falhou/);c.api.definirVerificacao(()=>true);c.enviar('preparar');assert.equal(c.enviados.at(-1).ok,true);
    }finally{c.dom.window.close();}
  });
  await test('gestão conserva edição manual, rota, lojas, PIN e importação pendentes',async()=>{
    const dom=new JSDOM(fs.readFileSync(path.join(root,'popup.html'),'utf8'),{runScripts:'outside-only'}),w=dom.window;
    try{
      w.eval(fs.readFileSync(path.join(root,'gestao.js'),'utf8'));const pode=()=>!w.FilaGestao.edicaoPendente();assert.equal(pode(),true);
      w.document.getElementById('escalaEditar').open=true;assert.equal(pode(),false);w.document.getElementById('escalaEditar').open=false;
      for(const id of ['rotaLoja','gestaoPedido','gestaoNovoPin','gestaoConfirmarPin','gestaoPin']){w.document.getElementById(id).value='rascunho';assert.equal(pode(),false);w.document.getElementById(id).value='';}
      w.document.getElementById('gestaoLojas').dataset.sujo='true';assert.equal(pode(),false);delete w.document.getElementById('gestaoLojas').dataset.sujo;assert.equal(pode(),true);
    }finally{dom.window.close();}
  });
  console.log(`${n} verificações de recarga local passaram.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
