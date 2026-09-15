/* Real Electron + real IPC + real models. Operates only copies under /private/tmp. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
const WebSocket = require('ws');
const dir = '/private/tmp/mappai-st-eval';
const name = process.argv[2] || 'development';
const port = Number(process.argv[3] || 9336);
const get = url => new Promise((resolve, reject) => http.get(url, res => { let text = ''; res.on('data', c => text += c); res.on('end', () => { try { resolve(JSON.parse(text)); } catch (e) { reject(e); } }); }).on('error', reject));
async function connect(port) {
  const targets = await get('http://127.0.0.1:' + port + '/json/list');
  const target = targets.find(t => t.url?.includes('index.html')) || targets[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.on('open', r));
  let id = 0; const pending = new Map(); const errors = [];
  ws.on('message', bytes => { const msg = JSON.parse(bytes); if (msg.id) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p?.reject(Error(JSON.stringify(msg.error))) : p?.resolve(msg.result); } if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text); });
  function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); }); }
  async function evaluate(expression) { const out = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (out.exceptionDetails) throw Error(JSON.stringify(out.exceptionDetails)); return out.result.value; }
  return { ws, send, evaluate, errors };
}
(async () => {
  const c = await connect(port); const { send, evaluate } = c;
  await send('Runtime.enable'); await send('Network.enable'); await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
  const out = { name, tests: [], errors: c.errors };
  const check = (label, value) => { assert(value, label); out.tests.push(label); console.log('PASS', label); };
  check('real preload and renderer loaded', await evaluate('Boolean(window.electronAPI?.localSearch && window.MappAILocalSearch)'));
  // Guard against a QA profile accidentally pointing to a real project.
  const vault = path.join(dir, 'projects/Officina Elettrica');
  const manifest = JSON.parse(fs.readFileSync(path.join(vault, 'pipeline.json')));
  const source = JSON.stringify(manifest);
  await evaluate(`(async()=>{ const loaded = await electronAPI.loadVault(${JSON.stringify(vault)}); if(!loaded.success) throw Error(loaded.error); appState.db=loaded.data; appState.activeVaultPath=${JSON.stringify(vault)}; appState._pipelineManifest=${source}; localStorage.setItem('mappai_local_search_enabled','1'); return true; })()`);
  const before = await evaluate('JSON.stringify(appState._pipelineManifest.review)');
  out.index = await evaluate('MappAILocalSearch.sync()');
  check('persistent index includes PDF, map and generated materials', out.index.semantic && out.index.count > 300);
  out.status = await evaluate("electronAPI.localSearch({method:'status'})");
  check('MPS worker alive', out.status.manifest.device === 'mps' && out.status.pid > 0);
  out.evidence = await evaluate("MappAILocalSearch.search('La corrente scorre solo quando il circuito è chiuso', 'evidence')");
  check('evidence excludes generated content', out.evidence.results.length && out.evidence.results.every(r => ['original', 'reference'].includes(r.origin)));
  out.occurrences = await evaluate("MappAILocalSearch.search('Il circuito deve essere chiuso perché scorra corrente', 'occurrences')");
  check('occurrences include current materials', out.occurrences.results.some(r => r.itemId));
  check('queries preserve all teacher decisions', before === await evaluate('JSON.stringify(appState._pipelineManifest.review)'));
  await evaluate(`MappAIReview.open(${JSON.stringify(vault)}, appState._pipelineManifest, {final:true}); true`);
  check('search integrated in the real review modal', await evaluate("Boolean(document.querySelector('#mappai-teacher-review [data-local-search] details'))"));
  await evaluate(`(()=>{const h=document.querySelector('#mappai-teacher-review [data-local-search]');h.querySelector('details').open=true;h.querySelector('input').value='resistenza ohm';[...h.querySelectorAll('button')].find(b=>b.textContent.includes('passaggi')).click();return true})()`);
  for (let i = 0; i < 120; i++) {
    if (await evaluate("Boolean(document.querySelector('[data-local-search] article'))")) break;
    await new Promise(r => setTimeout(r, 500));
  }
  check('real search button renders safe passage cards', await evaluate("document.querySelectorAll('[data-local-search] article').length > 0"));
  for (const width of [1200, 700]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: false });
    const png = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(dir, name + '-' + width + '.png'), Buffer.from(png.data, 'base64'));
    check('modal stays within viewport ' + width, await evaluate("(()=>{const r=document.querySelector('#mappai-teacher-review').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth+1})()"));
  }
  out.cache = await evaluate("electronAPI.localSearch({...MappAILocalSearch.snapshot(),method:'sync'})");
  check('reopening reuses every compatible vector', out.cache.encoded === 0 && out.cache.reused > 300);
  out.invalid = await evaluate("electronAPI.localSearch({method:'exec',command:'invalid'})");
  check('IPC rejects arbitrary commands', out.invalid.status === 'unavailable');
  out.scope = await evaluate("electronAPI.localSearch({method:'search',scope:'another-project',revision:'v1',query:'private',mode:'evidence'})");
  check('cross-project request yields no content', out.scope.status === 'stale');
  // One in-memory manual edit; original files and decisions remain untouched.
  await evaluate("appState.db.nodes[0].desc += ' QA temporary edit.'; MappAILocalSearch.schedule(); true");
  check('old results invalidated immediately on change', await evaluate("document.querySelectorAll('[data-local-search] article').length === 0"));
  out.updated = await evaluate('MappAILocalSearch.sync()');
  check('incremental edit encodes only changed content', out.updated.encoded > 0 && out.updated.encoded < out.updated.count);
  fs.writeFileSync(path.join(dir, name + '-qa.json'), JSON.stringify(out, null, 2));
  c.ws.close();
  console.log('Worker PID', out.status.pid);
})().catch(error => { console.error(error); process.exit(1); });
