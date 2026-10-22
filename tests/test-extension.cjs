const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHarness } = require('./dom-harness.cjs');
const root = path.resolve(__dirname, '../extension');
const source = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
const scraper = source.slice(source.indexOf('async function scrapeFn('), source.indexOf('/* ---------- destaque na página'));
const html = fs.readFileSync(path.join(root, 'popup.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<link[^>]+>/g, '');
const id = n => String(1000000000000000n + BigInt(n));
const table = (n, pages = [1]) => `<div class="main-menu">6 Pedidos em análise</div><table id="table-extended-transactions"><tbody>${n ? `<tr><td><a href="/pedido/uuid-${n}">${id(n)}</a></td><td>21/10/2026 10:0${n}</td><td>R$ 25,00</td><td>review</td><td>Varejo</td><td>Loja ${n}</td><td>Entrega</td></tr>` : '<tr><td>Nenhum pedido encontrado</td></tr>'}</tbody></table>${pages.map(p => `<a href="?page=${p}">${p}</a>`).join('')}`;
const opts = { esperaTelaMs: 1000, tempoPaginaMs: 500, tempoTotalMs: 4000, esperaRetryMs: 5, concorrencia: 2, maxPaginas: 40 };
let browser;
let count = 0;
async function test(name, fn) { await fn(); console.log('PASS', name); count++; }
async function pageWith(content, url = 'https://af.mateusmais.com.br/?status=analise&page=1') {
  const p = await browser.newPage();
  await p.route('**/*', r => r.fulfill({ contentType: 'text/html', body: content }));
  await p.goto(url);
  await p.addScriptTag({ content: `window.runScrape = ${scraper};` });
  return p;
}
async function fakeFetch(p, responses, delay = 10, special = {}) {
  await p.evaluate(({ responses, delay, special }) => {
    window.net = { active: 0, max: 0, calls: [], aborts: 0, attempts: {} };
    window.fetch = (url, options) => new Promise((resolve, reject) => {
      const n = Number(new URL(url).searchParams.get('page'));
      const attempt = window.net.attempts[n] = (window.net.attempts[n] || 0) + 1;
      window.net.calls.push(url); window.net.active++;
      window.net.max = Math.max(window.net.max, window.net.active);
      let done = false;
      let timer;
      const end = () => { if (done) return false; done = true; clearTimeout(timer); window.net.active--; options.signal.removeEventListener('abort', abort); return true; };
      const abort = () => { if (end()) { window.net.aborts++; reject(new DOMException('aborted', 'AbortError')); } };
      options.signal.addEventListener('abort', abort, { once: true });
      if (special.hang) return;
      timer = setTimeout(() => {
        if (!end()) return;
        const status = special.status || (special.retry && attempt === 1 ? 503 : 200);
        resolve(new Response(responses[n] ?? responses.default ?? '', { status }));
      }, delay);
    });
  }, { responses, delay, special });
}
async function run(p, extra = {}) { return p.evaluate(options => window.runScrape(options), { ...opts, ...extra }); }

(async () => {
  browser = await createHarness();
  await test('six pages, current page 3, filter preserved, duplicate invocations share a scan', async () => {
    const pages = [1, 2, 3, 4, 5, 6];
    const p = await pageWith(table(3, pages), 'https://af.mateusmais.com.br/?status=analise&page=3');
    await fakeFetch(p, Object.fromEntries(pages.map(n => [n, table(n, pages)])), 30);
    const results = await p.evaluate(o => Promise.all([runScrape(o), runScrape(o), runScrape(o)]), opts);
    for (const r of results) { assert.equal(r.ok, true); assert.equal(r.pedidos.length, 6); assert.equal(r.primeira, 1); assert.equal(r.paginas, 6); assert.equal(r.pedidos[0].cat, 'Varejo'); }
    const net = await p.evaluate(() => net);
    assert.equal(net.calls.length, 5); assert.equal(net.max, 2); assert.equal(net.active, 0);
    assert.ok(net.calls.every(u => new URL(u).searchParams.get('status') === 'analise'));
    await p.close();
  });
  await test('retry a transient error once', async () => {
    const p = await pageWith(table(1, [1, 2])); await fakeFetch(p, { 2: table(2, [1, 2]) }, 10, { retry: true });
    assert.equal((await run(p)).pedidos.length, 2); assert.equal(await p.evaluate(() => net.calls.length), 2); await p.close();
  });
  await test('page timeout aborts, releases lock, then a later reading succeeds', async () => {
    const p = await pageWith(table(1, [1, 2])); await fakeFetch(p, {}, 10, { hang: true });
    const r = await run(p, { tempoPaginaMs: 35 }); assert.equal(r.ok, false); assert.match(r.erro, /60 s/);
    const net = await p.evaluate(() => net); assert.equal(net.calls.length, 2); assert.equal(net.aborts, 2); assert.equal(net.active, 0);
    await fakeFetch(p, { 2: table(2, [1, 2]) }); assert.equal((await run(p)).ok, true); await p.close();
  });
  await test('total deadline cancels both workers', async () => {
    const p = await pageWith(table(1, [1, 2, 3, 4])); await fakeFetch(p, {}, 10, { hang: true });
    const r = await run(p, { tempoTotalMs: 70 }); assert.equal(r.ok, false); assert.match(r.erro, /3 minutos/);
    assert.equal(await p.evaluate(() => net.active), 0); assert.equal(await p.evaluate(() => net.aborts), 2); await p.close();
  });
  await test('expired login never becomes an empty valid list', async () => {
    const p = await pageWith(table(1, [1, 2])); await fakeFetch(p, { 2: '<form id="kc-form-login"><input type="password"></form>' });
    const r = await run(p); assert.equal(r.ok, false); assert.match(r.erro, /sessão|sessao/); assert.equal(await p.evaluate(() => net.calls.length), 1); await p.close();
  });
  await test('unknown pagination stops on repeated orders and deduplicates', async () => {
    const p = await pageWith(table(1, [])); await fakeFetch(p, { 2: table(2, []), 3: table(2, []) });
    const r = await run(p); assert.equal(r.ok, true); assert.equal(r.pedidos.length, 2); assert.equal(r.paginas, 2); assert.equal(await p.evaluate(() => net.calls.length), 2); await p.close();
  });
  await test('probe failures do not return partial success', async () => {
    const p = await pageWith(table(1, [])); await fakeFetch(p, { 2: table(2, []) }, 5, { status: 503 });
    assert.equal((await run(p)).ok, false); await p.close();
  });
  await test('404 for an unknown next page confirms the end of pagination', async () => {
    const p = await pageWith(table(1, [])); await fakeFetch(p, {}, 5, { status: 404 });
    const r = await run(p); assert.equal(r.ok, true); assert.equal(r.pedidos.length, 1); assert.equal(await p.evaluate(() => net.calls.length), 1); await p.close();
  });
  await test('404 for an explicitly linked page is a failed reading', async () => {
    const p = await pageWith(table(1, [1, 2])); await fakeFetch(p, {}, 5, { status: 404 });
    assert.equal((await run(p)).ok, false); await p.close();
  });
  await test('a valid empty table is accepted', async () => {
    const p = await pageWith(table(0)); await fakeFetch(p, {});
    const r = await run(p); assert.equal(r.ok, true); assert.equal(r.pedidos.length, 0); assert.equal(await p.evaluate(() => net.calls.length), 0); await p.close();
  });
  await test('new pagination links discovered on fetched pages are followed', async () => {
    const p = await pageWith(table(1, [1, 2])); await fakeFetch(p, { 2: table(2, [1, 2, 3, 4]), 3: table(3, [1, 2, 3, 4]), 4: table(4, [1, 2, 3, 4]) });
    const r = await run(p); assert.equal(r.ok, true); assert.equal(r.pedidos.length, 4); assert.equal(await p.evaluate(() => net.calls.length), 3); await p.close();
  });
  await test('page cap is explicit and never returns an incomplete list', async () => {
    const p = await pageWith(table(1, [1, 41])); await fakeFetch(p, {}); const r = await run(p);
    assert.equal(r.ok, false); assert.match(r.erro, /40 páginas/); await p.close();
  });
  await test('wait for a delayed AF table', async () => {
    const p = await pageWith('<main>Carregando…</main>'); await fakeFetch(p, {});
    await p.evaluate(content => setTimeout(() => { document.body.innerHTML = content; }, 80), table(1));
    const r = await run(p); assert.equal(r.ok, true); assert.equal(r.pedidos.length, 1); await p.close();
  });
  await test('a loading placeholder on a fetched page is rejected', async () => {
    const p = await pageWith(table(1, [1, 2])); await fakeFetch(p, { 2: '<table id="table-extended-transactions"><tbody><tr><td>Carregando...</td></tr></tbody></table>' });
    assert.equal((await run(p)).ok, false); assert.equal(await p.evaluate(() => net.calls.length), 2); await p.close();
  });
  await test('permanent HTTP errors are not retried', async () => {
    const p = await pageWith(table(1, [1, 2])); await fakeFetch(p, {}, 5, { status: 403 });
    assert.equal((await run(p)).ok, false); assert.equal(await p.evaluate(() => net.calls.length), 1); await p.close();
  });

  await test('fast screen reading performs no HTTP and does not wait for pagination', async () => {
    const p = await pageWith(table(1, [1, 2, 3, 4])); await fakeFetch(p, {}, 10, { hang: true });
    const started = Date.now();
    const r = await run(p, { somenteTela: true, esperaTelaMs: 1500, tempoTotalMs: 1800 });
    assert.equal(r.ok, true); assert.equal(r.pedidos.length, 1); assert.equal(r.paginas, 4);
    assert.equal(await p.evaluate(() => net.calls.length), 0); assert.ok(Date.now() - started < 2000); await p.close();
  });
  await test('screen updates remain independent of a blocked full scan in the same tab', async () => {
    const p = await pageWith(table(1, [1, 2])); await fakeFetch(p, {}, 10, { hang: true });
    await p.evaluate(o => { window.fullPending = runScrape(o); }, { ...opts, tempoTotalMs: 80 });
    assert.equal((await run(p, { somenteTela: true })).ok, true);
    assert.equal((await p.evaluate(() => fullPending)).ok, false); await p.close();
  });
  await test('screen reading times out promptly when the AF table never appears', async () => {
    const p = await pageWith('<main>Carregando...</main>'); await fakeFetch(p, {});
    const started = Date.now(); const r = await run(p, { somenteTela: true, esperaTelaMs: 50, tempoTotalMs: 80 });
    assert.equal(r.ok, false); assert.ok(Date.now()-started < 2000); await p.close();
  });
  console.log(`All ${count} scraper checks passed.`);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
