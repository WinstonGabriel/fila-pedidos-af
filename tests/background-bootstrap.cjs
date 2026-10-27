const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const source = path.resolve(__dirname, '../extension');
const fixture = "const SUPABASE_URL='https://example.supabase.co'; const SUPABASE_KEY='CHAVE-PUBLICA-FICTICIA';";
const tick = () => new Promise(setImmediate);
function iniciar({root = source, config = fixture, painel = true} = {}) {
 const eventos = new Map(), imports = [], chamadas = [], salvo = {};
 const event = name => ({addListener(fn) {eventos.set(name, [...(eventos.get(name) || []), fn]);}});
 const storage = {get: async key => ({[key]: salvo[key]}), set: async values => Object.assign(salvo, values), remove: async key => delete salvo[key]};
 const context = vm.createContext({URL, crypto:webcrypto, TextEncoder, Uint8Array, AbortController, console,
  setTimeout: () => 1, clearTimeout() {}, fetch() {throw new Error('O bootstrap não deve consultar a rede');},
  chrome: {
   sidePanel: painel ? {setPanelBehavior:async p => chamadas.push(['painel',p]), open:async()=>{}} : undefined,
   action:{onClicked:event('action')},
   storage:{local:storage, session:storage, onChanged:event('storage')},
   permissions:{contains:async()=>false, onAdded:event('permission:add'), onRemoved:event('permission:remove')},
   runtime:{id:'teste', getURL:p=>'chrome-extension://teste/'+p, onMessage:event('message'), onInstalled:event('install'), onStartup:event('startup')},
   scripting:{getRegisteredContentScripts:async()=>[], registerContentScripts:async()=>{}, updateContentScripts:async()=>{}, unregisterContentScripts:async()=>{}},
   tabs:{query:async()=>[], onRemoved:event('tabs:remove')},
   windows:{create:async p=>{chamadas.push(['janela',p]);return {id:1};},update:async()=>{}},
  },
 });
 context.self = context;
 context.importScripts = (...files) => files.forEach(file => {
  assert.equal(path.dirname(path.resolve(root, file)), root, 'Import deve ficar na pasta da extensão');
  imports.push(file);
  if (file === 'config.js' && config === null) throw new Error('Arquivo obrigatório ausente: config.js');
  const code = file === 'config.js' && config !== undefined ? config : fs.readFileSync(path.join(root,file),'utf8');
  vm.runInContext(code, context, {filename:file});
 });
 vm.runInContext(fs.readFileSync(path.join(root,'background.js'),'utf8'),context,{filename:'background.js'});
 return {context, imports, eventos, chamadas};
}
async function verificarPacote(root) {
 root = path.resolve(root);
 assert(fs.existsSync(path.join(root,'config.js')), 'O pacote operacional precisa incluir config.js');
 const config = fs.readFileSync(path.join(root,'config.js'),'utf8');
 const c = vm.createContext({}); vm.runInContext(config,c,{filename:'config.js'});
 const url = vm.runInContext('SUPABASE_URL',c), key = vm.runInContext('SUPABASE_KEY',c);
 assert(/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) && !url.includes('seu-projeto'), 'URL de produção ausente');
 const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
 assert.equal(claims.role,'anon','Somente chave pública anon pode entrar no pacote');
 assert.equal(new URL(url).hostname.split('.')[0],claims.ref,'Chave deve pertencer ao projeto configurado');
 assert(claims.exp * 1000 > Date.now(), 'Chave pública expirada');
 const r = iniciar({root,config}); await tick(); await tick();
 assert(r.imports.includes('sincronizacao-background.js'));
 assert(r.eventos.get('message')?.length >= 4, 'Os módulos do worker devem registrar seus listeners');
 console.log('Pacote operacional: configuração pública válida e bootstrap completo do worker verificados em VM isolada');
}
async function testes() {
 assert.throws(() => iniciar({config:null}), /Arquivo obrigatório ausente: config.js/);
 const r = iniciar(); await tick(); await tick();
 assert(r.imports.includes('config.js')); assert.equal(r.imports.at(-1),'sincronizacao-background.js');
 assert.equal(r.chamadas[0][0],'painel'); assert.equal(r.eventos.get('message').length,5);
 assert.equal(vm.runInContext('typeof window',r.context),'undefined');
 assert.equal(vm.runInContext('typeof document',r.context),'undefined');
 assert.equal(typeof r.context.FilaSincronizacao.obter,'function');
 assert.throws(() => iniciar({config:fixture+' const AF_SCRIPT_GLOBAL="duplicado";'}), /already been declared/);
 const fallback = iniciar({painel:false}); await tick(); await tick();
 await fallback.eventos.get('action')[0](); assert.equal(fallback.chamadas[0][0],'janela');
 console.log('Bootstrap: falta de config, cadeia real de imports, listeners, colisão global e janela alternativa passaram');
}
module.exports = {iniciar,verificarPacote};
if(require.main===module) (process.argv[2] ? verificarPacote(process.argv[2]) : testes()).catch(e=>{console.error(e);process.exitCode=1;});
