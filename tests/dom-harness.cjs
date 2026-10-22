const { JSDOM, VirtualConsole } = require('jsdom');
const vm = require('node:vm');

// DOM + Chrome API simulations. No requests are made to the AF panel or production RPCs.
async function createHarness() {
  return {
    async newPage() {
      let dom;
      let routeHandler;
      const handlers = {};
      async function load(html, url = 'https://extension.test/') {
        if (dom) dom.window.close();
        const vc = new VirtualConsole();
        vc.on('jsdomError', error => {
          if (error.type === 'unhandled exception') handlers.pageerror?.(error.detail || error);
        });
        dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
        Object.assign(dom.window, { Response, Request, Headers });
        await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
      }
      function execute(code) { return vm.runInContext(code, dom.getInternalVMContext()); }
      return {
        async route(_pattern, handler) { routeHandler = handler; },
        async goto(url) {
          let body = '';
          await routeHandler({ fulfill: async options => { body = options.body; } });
          await load(body, url);
        },
        async setContent(html) { await load(html); },
        async addScriptTag({ content }) { execute(content); },
        async exposeFunction(name, fn) { dom.window[name] = fn; },
        async evaluate(fn, arg) {
          const result = await execute(typeof fn === 'string' ? fn : `(${fn.toString()})(${JSON.stringify(arg) ?? ''})`);
          return result === undefined ? undefined : JSON.parse(JSON.stringify(result));
        },
        async waitForFunction(fn) {
          const deadline = Date.now() + 3000;
          while (!execute(`(${fn.toString()})()`)) {
            if (Date.now() >= deadline) throw new Error('DOM condition timed out: ' + fn.toString());
            await new Promise(r => setTimeout(r, 10));
          }
        },
        async waitForTimeout(ms) { await new Promise(r => setTimeout(r, ms)); },
        on(event, handler) { handlers[event] = handler; },
        async close() { dom?.window.close(); },
      };
    },
    async close() {},
  };
}
module.exports = { createHarness };
