/* Também pode executar em um runtime JS sem Node: exporta uma verificação pura. */
async function verificarPainelArrastavel(codigo) {
  const ok = (condicao, nome) => { if (!condicao) throw Error(nome); };
  const igual = (a, b, nome) => ok(JSON.stringify(a) === JSON.stringify(b), nome + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b));
  class Alvo {
    constructor() { this.eventos = {}; this.attrs = {}; this.valores = {}; this.style = {setProperty: (k, v) => { this.valores[k] = v; }}; }
    addEventListener(t, f, o) { (this.eventos[t] ||= []).push({f, captura: o === true || o?.capture}); }
    removeEventListener(t, f) { this.eventos[t] = (this.eventos[t] || []).filter(x => x.f !== f); }
    setAttribute(k, v) { this.attrs[k] = v; }
    emitir(t, dados = {}) {
      const e = {pointerId: 1, isPrimary: true, button: 0, clientX: 0, clientY: 0, ...dados,
        preventDefault() { this.prevented = true; }, stopPropagation() {}, stopImmediatePropagation() { this.parou = true; }};
      for (const x of [...(this.eventos[t] || [])].sort((a, b) => Number(b.captura) - Number(a.captura))) { x.f(e); if (e.parou) break; }
      return e;
    }
    setPointerCapture(id) { this.captura = id; }
    hasPointerCapture(id) { return this.captura === id; }
    releasePointerCapture(id) { if (this.captura === id) { this.captura = null; this.emitir('lostpointercapture', {pointerId: id}); } }
  }
  function runtime({salvo, aguardar = false, largura = 1280, altura = 900} = {}) {
    const janela = new Alvo(), doc = new Alvo(), host = new Alvo(), botao = new Alvo(), painel = new Alvo(), global = {};
    janela.innerWidth = largura; janela.innerHeight = altura;
    const mudancas = [], gravacoes = [], timers = new Map(); let timer = 0, resolver, arrastou = 0, abriu = 0, painelAtual = painel;
    const chrome = {storage: {local: {get: () => aguardar ? new Promise(r => { resolver = r; }) : Promise.resolve({afPainelPosicao: salvo}),
      set: async v => { gravacoes.push(v.afPainelPosicao); }}, onChanged: {addListener: f => mudancas.push(f), removeListener: f => { const i = mudancas.indexOf(f); if (i >= 0) mudancas.splice(i, 1); }}}};
    new Function('window', 'document', 'chrome', 'globalThis', 'setTimeout', 'clearTimeout', codigo)(
      janela, doc, chrome, global, f => { timers.set(++timer, f); return timer; }, id => timers.delete(id));
    const vinculo = global.FilaPainelPosicao.vincular({host, botao, painel: () => painelAtual, aoArrastar: () => { arrastou++; }, aoSoltar: () => { abriu++; }});
    return {janela, doc, host, botao, painel, vinculo, api: global.FilaPainelPosicao, gravacoes, timers,
      pos: () => ({x: parseFloat(host.valores.left), y: parseFloat(host.valores.top)}),
      mudou: v => mudancas.forEach(f => f({afPainelPosicao: {newValue: v}}, 'local')),
      restaurar: v => resolver?.({afPainelPosicao: v}), contagem: () => ({arrastou, abriu}),
      frame: p => { painelAtual = p; }, novaTela: (w, h) => { janela.innerWidth = w; janela.innerHeight = h; janela.emitir('resize'); }};
  }
  let total = 0;
  const test = async (nome, fn) => { await fn(); total++; };
  await test('geometria nas bordas e telas pequenas', async () => {
    const r = runtime();
    for (const [w, h] of [[1280,900],[400,800],[320,480],[1920,1080]]) for (const [x,y] of [[-90,-90],[0,70],[w-44,0],[w-44,h-44],[w/2,h/2]]) {
      const g = r.api.geometria(w,h,x,y);
      ok(g.x >= 0 && g.y >= 0 && g.x+44 <= w && g.y+44 <= h, 'ícone visível');
      const px=g.x+g.esquerda, py=g.y+g.topo;
      ok(px>=0 && py>=0 && px+g.largura<=w && py+g.altura<=h, 'painel dentro da tela');
      ok(px+g.largura<=g.x || px>=g.x+44 || py+g.altura<=g.y || py>=g.y+44, 'ícone acessível junto do painel');
    }
  });
  await test('clique e pequeno movimento não iniciam arraste', async () => {
    const r=runtime();await Promise.resolve();let cliques=0;r.botao.addEventListener('click',()=>cliques++);
    r.botao.emitir('pointerdown',{clientX:100,clientY:100});r.doc.emitir('pointermove',{clientX:103,clientY:102});r.doc.emitir('pointerup');r.botao.emitir('click');
    igual(cliques,1,'clique normal');igual(r.gravacoes.length,0,'posição intacta');igual(r.contagem(),{arrastou:0,abriu:0},'sem arraste');
  });
  await test('arrastar guarda a posição, abre ao soltar e não dispara clique extra', async () => {
    const r=runtime();await Promise.resolve();let cliques=0;r.botao.addEventListener('click',()=>cliques++);const inicio=r.pos();
    r.botao.emitir('pointerdown',{clientX:20,clientY:20});r.doc.emitir('pointermove',{clientX:-480,clientY:220});r.doc.emitir('pointerup');r.botao.emitir('click');
    igual(r.pos(),{x:inicio.x-500,y:inicio.y+200},'posição escolhida');igual(r.contagem(),{arrastou:1,abriu:1},'uma abertura');igual(cliques,0,'clique suprimido');igual(r.gravacoes.length,1,'uma gravação');
    igual(Object.keys(r.gravacoes[0]).sort(),['schema','x','y'],'somente posição');
    r.botao.emitir('click');igual(cliques,1,'próximo clique funciona');
  });
  await test('cancelar ou perder captura restaura a posição anterior', async () => {
    for(const evento of ['pointercancel','lostpointercapture']) {
      const r=runtime();await Promise.resolve();const inicio=r.pos();r.botao.emitir('pointerdown');r.doc.emitir('pointermove',{clientX:-200,clientY:200});
      (evento==='pointercancel'?r.doc:r.botao).emitir(evento);
      igual(r.pos(),inicio,'posição restaurada');igual(r.gravacoes.length,0,'sem gravação');igual(r.contagem().abriu,0,'sem abertura');
    }
  });
  await test('outro ponteiro e botão secundário são ignorados', async () => {
    const r=runtime();await Promise.resolve();r.botao.emitir('pointerdown',{button:2});ok(!r.vinculo.interagindo(),'botão direito');
    r.botao.emitir('pointerdown');const inicio=r.pos();r.doc.emitir('pointermove',{pointerId:2,clientX:-300,clientY:300});r.doc.emitir('pointerup',{pointerId:2});
    igual(r.pos(),inicio,'ponteiro diferente');ok(r.vinculo.interagindo(),'mantém ponteiro original');r.doc.emitir('pointercancel');
  });
  await test('restauração e redimensionamento conservam o ícone visível', async () => {
    const r=runtime({salvo:{schema:1,x:0,y:1}});await Promise.resolve();igual(r.pos(),{x:8,y:848},'restaurou');
    r.novaTela(400,480);igual(r.pos(),{x:8,y:428},'adaptou');igual(r.gravacoes.length,0,'resize não grava');
  });
  await test('leitura inicial atrasada não desfaz um arraste', async () => {
    const r=runtime({aguardar:true});r.botao.emitir('pointerdown');r.doc.emitir('pointermove',{clientX:-200,clientY:200});r.doc.emitir('pointerup');const pos=r.pos();
    r.restaurar({schema:1,x:0,y:0});await Promise.resolve();igual(r.pos(),pos,'preservou escolha recente');
  });
  await test('posição sincronizada entre páginas não grava em ciclo', async () => {
    const r=runtime();await Promise.resolve();r.mudou({schema:1,x:0,y:0});igual(r.pos(),{x:8,y:8},'posição recebida');igual(r.gravacoes.length,0,'sem ciclo');
    r.botao.emitir('pointerdown');r.doc.emitir('pointermove',{clientX:100,clientY:100});const pos=r.pos();r.mudou({schema:1,x:1,y:1});igual(r.pos(),pos,'não interrompe gesto');r.doc.emitir('pointerup');
  });
  await test('Alt e setas movem o ícone pelo teclado', async () => {
    const r=runtime();await Promise.resolve();const inicio=r.pos();r.botao.emitir('keydown',{key:'ArrowLeft',altKey:true});
    igual(r.pos(),{x:inicio.x-10,y:inicio.y},'atalho');igual(r.gravacoes.length,1,'posição salva');r.botao.emitir('keydown',{key:'ArrowLeft'});igual(r.gravacoes.length,1,'seta comum');
  });
  await test('movimento além da tela é limitado', async () => {
    const r=runtime();await Promise.resolve();r.botao.emitir('pointerdown');r.doc.emitir('pointermove',{clientX:100000,clientY:-100000});r.doc.emitir('pointerup');
    igual(r.pos(),{x:1228,y:8},'limites');ok(r.gravacoes[0].x<=1 && r.gravacoes[0].y>=0,'posição normalizada');
  });
  await test('desmontagem remove ouvintes e ignora respostas atrasadas', async () => {
    const r=runtime({aguardar:true});const inicio=r.pos();r.vinculo.destruir();r.restaurar({schema:1,x:0,y:1});await Promise.resolve();r.mudou({schema:1,x:1,y:1});r.botao.emitir('pointerdown');r.doc.emitir('pointermove',{clientX:50,clientY:50});r.doc.emitir('pointerup');
    igual(r.pos(),inicio,'sem atualização após destruir');igual(r.gravacoes.length,0,'sem gravação');
  });
  await test('painel criado depois recebe posição e tamanho', async () => {
    const r=runtime();await Promise.resolve();r.frame(null);r.vinculo.posicionar();const novo=new Alvo();r.frame(novo);r.vinculo.posicionar();ok(novo.valores.left&&novo.valores.height,'painel posicionado');
  });
  return total;
}
module.exports = verificarPainelArrastavel;
if (require.main === module) {
  const fs=require('node:fs'),path=require('node:path');
  verificarPainelArrastavel(fs.readFileSync(path.join(__dirname,'../extension/painel-posicao.js'),'utf8'))
    .then(n=>console.log(n+' verificações de arraste, clique, bordas, posição e ciclo de vida passaram.'))
    .catch(e=>{console.error(e);process.exitCode=1;});
}
