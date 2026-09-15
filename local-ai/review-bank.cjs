/* Local-only review server and packet preparation. No model inference or cloud. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const crypto = require('node:crypto'), { execFileSync, execFile } = require('node:child_process');
const Core = require('./review-core');
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_DATA = path.join(ROOT, 'local-ai-data', 'review');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const fail = (message, status = 400) => Object.assign(Error(message), { status });
const CRITICAL = ['IT-001', 'IT-002', 'IT-009', 'IT-010', 'IT-011', 'IT-012', 'IT-017', 'IT-018', 'IT-019', 'IT-028', 'IT-029', 'IT-030', 'IT-033', 'IT-036', 'IT-045', 'IT-055', 'IT-057', 'IT-058', 'IT-059', 'IT-060'];

function prepare(evalRoot, destination = DEFAULT_DATA) {
  evalRoot = fs.realpathSync(evalRoot);
  if (!evalRoot.startsWith('/private/tmp/')) throw Error('Preparare il banco soltanto dalle copie in /private/tmp.');
  if (fs.existsSync(destination)) throw Error('La cartella di destinazione esiste già: conservarla e scegliere una nuova cartella.');
  const corpusBytes = fs.readFileSync(path.join(evalRoot, 'corpus.json'));
  const corpus = JSON.parse(corpusBytes), bank = read(path.join(evalRoot, 'bank-resolved.json'));
  const seed = crypto.randomBytes(32).toString('hex');
  const config = read(path.join(require('node:os').homedir(), 'Library/Application Support/MappAI/local-ai/config.json'));
  const models = ['bge-m3', 'multilingual-e5-base'];
  const reports = Object.fromEntries(models.map(model => [model, read(path.join(evalRoot, model + '-mps.json'))]));
  const indexes = JSON.parse(execFileSync(config.python, ['-c',
    'import sys,json,sqlite3,pathlib,hashlib\nr=pathlib.Path(sys.argv[1]);out={}\nfor model in json.loads(sys.argv[2]):\n out[model]={}\n for name in json.loads(sys.argv[3]):\n  h=hashlib.sha256(json.dumps(name,sort_keys=True,ensure_ascii=False).encode()).hexdigest()\n  db=sqlite3.connect((r/("indexes-"+model)/(h+".sqlite")).as_uri()+"?mode=ro",uri=True)\n  out[model][name]={rid:json.loads(data) for rid,data in db.execute("select id,data from records")}\nprint(json.dumps(out,ensure_ascii=False))',
    evalRoot, JSON.stringify(models), JSON.stringify(Object.keys(corpus))], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  const pages = [], documents = [], pdfs = new Map();
  for (const [project, snap] of Object.entries(corpus)) {
    for (const record of snap.records.filter(r => ['original', 'reference'].includes(r.origin))) {
      if (!Number.isInteger(record.page) || path.basename(record.title) !== record.title || !record.title.toLowerCase().endsWith('.pdf')) throw Error('Fonte non PDF o pagina mancante: ' + record.recordId);
      const attachmentRoot = fs.realpathSync(path.join(evalRoot, 'projects', project, 'Allegati'));
      const file = fs.realpathSync(path.join(attachmentRoot, record.title));
      if (!file.startsWith(attachmentRoot + path.sep) || !file.startsWith(evalRoot + path.sep)) throw Error('Allegato fuori dalle copie temporanee.');
      const bytes = fs.readFileSync(file), hash = sha(bytes), pdfId = hash.slice(0, 24);
      if (!pdfs.has(pdfId)) { pdfs.set(pdfId, bytes); documents.push({ id: pdfId, title: record.title, sha256: hash, file: pdfId + '.pdf' }); }
      pages.push({ id: sha(project + '\0' + record.recordId).slice(0, 24), project, recordId: record.recordId, title: record.title, page: record.page, text: record.text, pdfId });
    }
  }
  function locator(project, row) {
    const rawId = row.rawLocator ? row.recordId.replace(/:\d+$/, '') : row.recordId;
    const page = pages.find(p => p.project === project && p.recordId === rawId);
    if (!page) throw Error('Pagina del risultato non trovata: ' + rawId);
    let start = row.rawLocator?.start, end = row.rawLocator?.end;
    if (start === undefined) {
      const pattern = row.text.trim().split(/\s+/).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
      const match = page.text.match(new RegExp(pattern));
      if (!match) throw Error('Estratto non verificabile: ' + rawId);
      start = [...page.text.slice(0, match.index)].length; end = start + [...match[0]].length;
    }
    const text = [...page.text].slice(start, end).join('');
    if (text.replace(/\s+/g, ' ').trim() !== row.text.replace(/\s+/g, ' ').trim()) throw Error('Snapshot cambiato: ' + rawId);
    return { pageId: page.id, recordId: page.recordId, start, end, text };
  }
  const cases = bank.cases.map(test => {
    const runs = { legacy: test.baseline.map(r => locator(test.project, r)) };
    for (const model of models) {
      const result = reports[model].cases.find(c => c.id === test.id);
      if (!result) throw Error('Risultati mancanti: ' + test.id);
      for (const [method, run] of Object.entries(result.methods)) {
        if (!run.ids) continue; // Old direct-reranker runs did not store their rankings.
        runs[model + '/' + method] = run.ids.map(id => {
          const record = indexes[model][test.project][id];
          if (!record) throw Error('Frammento non trovato: ' + id);
          return locator(test.project, record);
        });
      }
    }
    const pool = new Map();
    for (const run of Object.values(runs)) for (const item of run.slice(0, 5)) pool.set(item.pageId + ':' + item.start + ':' + item.end, item);
    const candidates = [...pool.values()].map(item => ({ ...item, id: sha(test.id + '\0' + item.pageId + ':' + item.start + ':' + item.end).slice(0, 20) }))
      .sort((a, b) => sha(seed + a.id).localeCompare(sha(seed + b.id)));
    return { id: test.id, query: test.query, project: test.project, split: test.split, category: test.category, critical: CRITICAL.includes(test.id), candidates, runs, initial: test };
  });
  const packet = { schema: 1, createdAt: new Date().toISOString(), corpusSha256: sha(corpusBytes), seedBankSha256: sha(fs.readFileSync(path.join(__dirname, 'italian-bank.json'))),
    poolDepth: 5, criticalIds: CRITICAL, pages, documents, cases, manifests: Object.fromEntries(models.map(m => [m, reports[m].manifest])) };
  packet.id = sha(JSON.stringify(packet));
  // Publish a complete packet once. No overwrite path and no project writes.
  const staging = destination + '.preparing-' + crypto.randomUUID();
  fs.mkdirSync(staging, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(staging, 'pdf'), { mode: 0o700 });
  for (const [id, bytes] of pdfs) fs.writeFileSync(path.join(staging, 'pdf', id + '.pdf'), bytes, { mode: 0o600 });
  fs.writeFileSync(path.join(staging, 'packet.json'), JSON.stringify(packet, null, 2), { mode: 0o600 });
  fs.writeFileSync(path.join(staging, 'corpus.json'), corpusBytes, { mode: 0o600 });
  fs.renameSync(staging, destination);
  return { cases: cases.length, critical: cases.filter(c => c.critical).length, candidates: cases.reduce((n, c) => n + c.candidates.length, 0), destination, packetId: packet.id };
}

function createStore(directory) {
  const packet = read(path.join(directory, 'packet.json'));
  const { id, ...content } = packet;
  if (sha(JSON.stringify(content)) !== id) throw Error('Il pacchetto del banco è cambiato o è danneggiato.');
  const history = path.join(directory, 'annotations');
  fs.mkdirSync(history, { recursive: true, mode: 0o700 });
  function load() {
    const versions = fs.readdirSync(history).filter(n => /^\d{8}\.json$/.test(n)).sort();
    if (!versions.length) return { schema: 1, packetId: packet.id, version: 0, annotations: {} };
    const state = read(path.join(history, versions.at(-1)));
    if (state.packetId !== packet.id || state.version !== Number(versions.at(-1).slice(0, 8))) throw Error('Archivio delle annotazioni incoerente.');
    return state;
  }
  function save(caseId, version, annotation) {
    const test = packet.cases.find(c => c.id === caseId);
    if (!test) throw fail('Caso sconosciuto.');
    const current = load();
    if (version !== current.version) throw fail('Un’altra finestra ha salvato modifiche. Ricarica prima di continuare; il tuo testo rimane nella schermata.', 409);
    const value = Core.validate(test, packet.pages, annotation);
    const next = { ...current, version: current.version + 1, savedAt: new Date().toISOString(), annotations: { ...current.annotations, [caseId]: { ...value, updatedAt: new Date().toISOString() } } };
    const temp = path.join(history, crypto.randomUUID() + '.tmp');
    const fd = fs.openSync(temp, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(next, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    try {
      // Immutable revisions; link fails if another process committed this version.
      fs.linkSync(temp, path.join(history, String(next.version).padStart(8, '0') + '.json'));
      const dir = fs.openSync(history, 'r'); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
    } catch (error) { if (error.code === 'EEXIST') throw fail('Conflitto di salvataggio: ricarica il banco.', 409); throw error; }
    finally { fs.unlinkSync(temp); }
    return next;
  }
  return { packet, load, save };
}

function publicView(packet, state) {
  return { packetId: packet.id, version: state.version, annotations: state.annotations,
    criticalIds: packet.criticalIds, cases: packet.cases.map(({ id, query, project, critical, candidates }) => ({ id, query, project, critical, candidates })), pages: packet.pages };
}
function serve(directory = DEFAULT_DATA, port = 8766) {
  const store = createStore(directory), token = crypto.randomBytes(32).toString('hex');
  const assets = new Map([
    ['/', [path.join(__dirname, 'review.html'), 'text/html; charset=utf-8']],
    ['/review-ui.js', [path.join(__dirname, 'review-ui.js'), 'text/javascript; charset=utf-8']],
    ['/ui.css', [path.join(ROOT, 'public/css/mappai-ui.css'), 'text/css; charset=utf-8']],
    ['/pdf.min.js', [path.join(ROOT, 'public/js/pdf.min.js'), 'text/javascript']],
    ['/pdf.worker.min.js', [path.join(ROOT, 'public/js/pdf.worker.min.js'), 'text/javascript']]
  ]);
  let origin;
  const server = http.createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    try {
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) throw fail('Origine non autorizzata.', 403);
      if (req.headers['sec-fetch-site'] === 'cross-site') throw fail('Origine non autorizzata.', 403);
      const url = new URL(req.url, origin), pathname = url.pathname;
      const asset = assets.get(pathname);
      if (req.method === 'GET' && asset) { res.writeHead(200, { 'Content-Type': asset[1] }); return fs.createReadStream(asset[0]).pipe(res); }
      if (req.headers['x-review-token'] !== token) throw fail('Sessione non autorizzata. Riapri il banco dal collegamento di avvio.', 403);
      if (req.method === 'GET' && pathname === '/api/state') return send(200, publicView(store.packet, store.load()));
      if (req.method === 'GET' && pathname === '/api/export') return send(200, Core.exportBank(store.packet, store.load()));
      if (req.method === 'GET' && pathname === '/api/report') return send(200, Core.report(store.packet, store.load()));
      if (req.method === 'GET' && pathname.startsWith('/api/pdf/')) {
        const document = store.packet.documents.find(d => pathname === '/api/pdf/' + d.id);
        if (!document) throw fail('PDF non trovato.', 404);
        const bytes = fs.readFileSync(path.join(directory, 'pdf', document.file));
        if (sha(bytes) !== document.sha256) throw fail('Il PDF è stato sostituito: consultazione bloccata.', 409);
        res.writeHead(200, { 'Content-Type': 'application/pdf' }); return res.end(bytes);
      }
      if (req.method === 'POST' && pathname === '/api/annotation') {
        if (req.headers.origin !== origin || req.headers['content-type'] !== 'application/json') throw fail('Richiesta non autorizzata.', 403);
        let bytes = 0, chunks = [];
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 2 * 1024 * 1024) throw fail('Annotazione troppo grande.', 413); chunks.push(chunk); }
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const next = store.save(data.caseId, data.version, data.annotation);
        return send(200, { version: next.version, annotation: next.annotations[data.caseId] });
      }
      throw fail('Percorso non disponibile.', 404);
    } catch (error) { if (!res.headersSent) send(error.status || 400, { error: error.message }); else res.end(); }
  });
  server.listen(port, '127.0.0.1');
  server.on('listening', () => { origin = 'http://127.0.0.1:' + server.address().port; server.reviewUrl = origin + '/#' + token; });
  return server;
}

if (require.main === module) {
  const [command = 'serve', ...args] = process.argv.slice(2);
  try {
    if (command === 'prepare') console.log(prepare(args[0], args[1] || DEFAULT_DATA));
    else if (command === 'serve') {
      const positional = args.filter(a => !a.startsWith('--'));
      const server = serve(positional[0] || DEFAULT_DATA, Number(positional[1] || 8766));
      server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Il banco è già aperto sulla porta scelta. Usa la finestra esistente o chiudi il processo precedente.' : error.message); process.exitCode = 1; });
      server.on('listening', () => { console.log('Banco locale: ' + server.reviewUrl + '\nChiudi con Ctrl+C. Le annotazioni rimangono su disco.'); if (args.includes('--open')) execFile('open', [server.reviewUrl]); });
    } else throw Error('Uso: review-bank.cjs prepare COPIE_TEMP [DEST] | serve [DATI] [PORTA] [--open]');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { prepare, createStore, publicView, serve, sha, CRITICAL };
