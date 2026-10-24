/* Motor declarativo: apenas efeitos locais conhecidos; nunca executa código remoto. */
(() => {
 'use strict';
 const EFEITOS=Object.freeze(['pulso','nuvens','alquimia','hextech','tricolor','aurora','teia','chamas','gelo','caveira']);
 const estilos={metal:'alquimia',nuvens:'nuvens',hextech:'hextech',tricolor:'tricolor',aurora:'aurora'};
 const presets={'homem-aranha':'teia',got:'gelo','homem-de-ferro':'chamas',caveiras:'caveira'};
 const hex=c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c);
 function normalizar(config,tema,nome){
  const c=config?.schema===1?config:{};
  const t=c.temas?.[tema?.id] || {},a=c.analistas?.[nome] || {};
  const efeito=EFEITOS.includes(a.efeito)?a.efeito:EFEITOS.includes(t.efeito)?t.efeito:estilos[tema?.estilo]||presets[tema?.id]||'pulso';
  const duracao=[a.duracao_ms,t.duracao_ms,c.duracao_ms].find(v=>Number.isInteger(v)&&v>=1200&&v<=6000)||3200;
  return {ativo:c.ativo!==false&&t.ativo!==false&&a.ativo!==false,efeito,duracao,
   cor:[a.cor,t.cor,tema?.energia,tema?.cores?.destaque].find(hex)||'#38bdf8',
   fundo:hex(tema?.cores?.cartao)?tema.cores.cartao:'#102233',texto:hex(tema?.cores?.texto)?tema.cores.texto:'#ffffff'};
 }
 function escolherEvento(d,cursor){
  const ultimo=Number.isSafeInteger(d?.ultimo_evento)?d.ultimo_evento:0;
  const p=d?.pedido;
  const valido=typeof d?.nome==='string'&&typeof p?.id==='string'&&p.id.length<=100&&Number.isSafeInteger(p.evento_id)&&p.evento_id>0;
  // First contact establishes the baseline; opening/reloading never replays a current order.
  const novo=Number.isSafeInteger(cursor)&&valido&&p.evento_id>cursor;
  return {cursor:Math.max(Number.isSafeInteger(cursor)?cursor:0,ultimo,valido?p.evento_id:0),novo};
 }
 globalThis.FilaEfeitoCore=Object.freeze({EFEITOS,normalizar,escolherEvento});
})();
