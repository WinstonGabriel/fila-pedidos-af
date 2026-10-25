const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runtime } = require('./catalogo-integration.cjs');
const source = fs.readFileSync(require('node:path').join(__dirname,'../extension/suporte-icone.js'),'utf8');
const padrao = '<svg>original</svg>';
const a = 'https://imagens.example/suporte-a.png';
const b = 'https://imagens.example/suporte-b.png?v=2&cor=azul';
const imagens = [], eventos = [];
let tempo = 100000;
class Imagem {
  constructor() { this.naturalWidth = this.naturalHeight = 64; imagens.push(this); }
}
const contexto = vm.createContext({window:{},URL,Image:Imagem,Date:{now:()=>tempo},document:{dispatchEvent:e=>eventos.push(e.type)},CustomEvent:class{constructor(type){this.type=type;}}});
vm.runInContext(source,contexto);
const icone = contexto.window.FilaIconeSuporte;
let passaram = 0;
const test = async (nome,fn) => {await fn();passaram++;console.log('PASS',nome);};
(async()=>{
  await test('somente URLs HTTPS sem credenciais são aceitas',()=>{
    for(const valor of [undefined,null,{},'','javascript:alert(1)','data:image/svg+xml,<svg/>','http://example.org/a.png','file:///a.png','/icone.png','https://usuario:senha@example.org/i.png','https://example.org/'+ 'a'.repeat(2100)]) assert.equal(icone.normalizar(valor),'');
    assert.equal(icone.normalizar('  '+a+'  '),a);
    assert.equal(icone.normalizar('https://example.org/'+'á'.repeat(1000)),'');
    assert.equal(icone.html(padrao),padrao);
  });
  await test('a imagem só substitui o desenho após carregar e usa dimensões fixas',()=>{
    icone.definir(a);icone.definir(a);
    assert.equal(imagens.length,1);
    assert.equal(icone.html(padrao),padrao);
    imagens[0].onload();
    assert.match(icone.html(padrao),/<img /);
    assert.match(icone.html(padrao),/width="17" height="17"/);
    assert.equal(imagens[0].referrerPolicy,'no-referrer');
  });
  await test('a configuração mais recente prevalece sobre respostas atrasadas',()=>{
    icone.definir(b);
    imagens[1].onload();imagens[0].onerror();imagens[0].onload();
    assert.match(icone.html(padrao),/suporte-b.png/);
    assert.match(icone.html(padrao),/&amp;cor=azul/);
    assert.ok(eventos.includes('fila:icone-suporte'));
  });
  await test('falha de imagem mantém o padrão e permite nova tentativa depois de 30 segundos',()=>{
    icone.falhou(b);assert.equal(icone.html(padrao),padrao);
    icone.definir(b);assert.equal(imagens.length,2);
    tempo+=30001;icone.definir(b);assert.equal(imagens.length,3);
    imagens[2].onload();assert.match(icone.html(padrao),/suporte-b.png/);
    icone.falhou(a);assert.match(icone.html(padrao),/suporte-b.png/);
  });
  await test('remover a URL ou trocar a equipe descarta carregamentos pendentes',()=>{
    icone.definir(a);const pendente=imagens.at(-1);
    icone.definir('');pendente.onload();
    assert.equal(icone.html(padrao),padrao);
  });
  await test('duas instalações recebem a troca online no botão e na lista de suporte',async()=>{
    for(let i=0;i<2;i++) {
      const r=runtime({});const cargas=[];
      const render = () => vm.runInContext("remote.atribuicoes=[{pedido_id:'ativo',analista:'Gabriel',status:'em_andamento'},{pedido_id:'retido',analista:'Rayla',status:'contato',destino_apoio:'suporte'}];renderPilha()",r.context);
      r.context.Image=class{constructor(){this.naturalWidth=this.naturalHeight=64;cargas.push(this);}};
      r.api.config.layout.icone_suporte_url=a;
      assert.equal(await r.sync(),true);cargas.at(-1).onload();
      render();
      assert.equal((r.el('painel').innerHTML.match(/icone-suporte-remoto/g)||[]).length,2);
      assert.ok(r.el('painel').innerHTML.includes('data-suporte="Gabriel"'));
      r.api.config.revisao++;r.api.config.layout.icone_suporte_url=b;
      await r.sync();cargas.at(-1).onload();render();
      assert.ok(r.el('painel').innerHTML.includes('suporte-b.png'));
      assert.ok(!r.el('painel').innerHTML.includes('suporte-a.png'));
      r.api.offline=true;await r.sync();
      assert.match(r.context.FilaIconeSuporte.html(padrao),/suporte-b.png/);
      vm.runInContext("local.codigo='outra-equipe';prepararCliente()",r.context);
      assert.equal(r.context.FilaIconeSuporte.html(padrao),padrao);
    }
  });
  console.log(`${passaram} verificações do ícone online passaram.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
