'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cheerio = require('cheerio');
const Core = require('../public/js/mappai-review-core');
const Material = require('../public/js/mappai-material-review');
const Pipeline = require('../public/js/mappai-pipeline-core');
const clone = x => JSON.parse(JSON.stringify(x));
const DB = { nodes: [{ id: 'a', label: 'Germania', desc: 'Prima.', level: 0 }, { id: 'b', label: 'Svizzera', desc: 'Altro testo.', level: 1 }],
  links: [{ source: 'a', target: 'b', rel: 'richiede', isCross: true }], sourcesDict: {} };
const SOURCES = [{ nome: 'Libro.pdf', pages: [{ n: 4, text: 'La fonte dice: dopo. Un contesto più ampio.' }] }];
function initial(report) { return Core.createReview({ db: DB, sources: SOURCES, report: report || { checkStatus: 'completed', issues: [
  { id: 'issue', target: { kind: 'node', id: 'a', field: 'desc' }, after: 'Dopo.', problem: 'Testo da correggere.', evidence: [{ source: 'Libro.pdf', page: 4, text: 'dopo.' }] }
] } }); }
function manifest(review = initial()) { const m = Pipeline.createManifest({}, { vaultPath: '/vault' }); m.steps.A.status = 'done'; m.review = review; return m; }

// Cheerio supplies parsing/selectors already used by the app. This small DOM
// adapter implements only native methods the real controller calls; events are
// invoked explicitly, without timers, Electron windows or model calls.
function dom() {
  const $ = cheerio.load('<html><body><button id="previous">Prima</button></body></html>');
  const wrappers = new WeakMap();
  let active;
  function wrap(n) {
    if (!n) return null;
    if (wrappers.has(n)) return wrappers.get(n);
    const e = { n, listeners: {},
      setAttribute(k, v) { $(n).attr(k, String(v)); },
      getAttribute(k) { return $(n).attr(k); },
      appendChild(child) { $(n).append(child.n); return child; },
      replaceChildren(...children) { $(n).empty(); children.forEach(c => this.appendChild(c)); },
      remove() { $(n).remove(); },
      querySelector(s) { return wrap($(n).find(s).get(0)); },
      querySelectorAll(s) { return $(n).find(s).toArray().map(wrap); },
      focus() { active = this; }, getClientRects() { return this.hidden || $(n).parents('[hidden]').length ? [] : [{}]; },
      addEventListener(k, fn) { this.listeners[k] = fn; },
      classList: {
        toggle(c, on) { const v = on === undefined ? !$(n).hasClass(c) : !!on; $(n).toggleClass(c, v); return v; },
        add(...c) { c.forEach(x => $(n).addClass(x)); }, remove(...c) { c.forEach(x => $(n).removeClass(x)); }, contains(c) { return $(n).hasClass(c); }
      },
      style: { setProperty(k, v) { $(n).css(k, v); } },
      async click() { if (!this.disabled && this.onclick) return this.onclick(); }
    };
    for (const name of ['id', 'className', 'type', 'rows', 'min', 'max', 'step']) Object.defineProperty(e, name, {
      get() { return $(n).attr(name === 'className' ? 'class' : name) || ''; },
      set(v) { $(n).attr(name === 'className' ? 'class' : name, String(v)); }
    });
    for (const name of ['disabled', 'hidden', 'checked']) Object.defineProperty(e, name, {
      get() { return $(n).attr(name) !== undefined; }, set(v) { if (v) $(n).attr(name, name); else $(n).removeAttr(name); }
    });
    Object.defineProperties(e, {
      innerHTML: { get() { return $(n).html(); }, set(v) { $(n).html(v); } },
      textContent: { get() { return $(n).text(); }, set(v) { $(n).text(v == null ? '' : String(v)); } },
      value: { get() { return this._value !== undefined ? this._value : $(n).val() || ''; }, set(v) { this._value = String(v == null ? '' : v); $(n).val(this._value); } },
      isConnected: { get() { return $(n).parents('html').length > 0; } }
    });
    wrappers.set(n, e); return e;
  }
  const document = { body: wrap($('body')[0]), createElement: tag => wrap($('<' + tag + '>')[0]),
    createTextNode: text => wrap({ type: 'text', data: text }),
    getElementById: id => wrap($('#' + id)[0]), get activeElement() { return active; } };
  active = document.getElementById('previous');
  return { document, text: () => $('body').text(), html: () => $.html() };
}

const SPENTI_0089 = new Set(['mappai_banco_veste', 'mappai_affermazioni', 'mappai_quarantena']);
function runtime(opts = {}) {
  const d = dom(), calls = { manifest: 0, map: 0, load: 0, cache: 0, pipeline: 0 }, saved = { manifest: null, map: clone(DB), version: 0 };
  const st = { activeVaultPath: '/vault', db: clone(DB), sources: [], _pdfPagine: [], _reviewRevision: null };
  const window = { MappAIReviewCore: Core, MappAILinkEditorCore: require('../public/js/mappai-link-editor-core'), MappAIMaterialReview: Material, MappAIPipelineCore: Pipeline,
    MappAIReviewContext: require('../public/js/mappai-review-context'),
    MappAIGroundingCore: require('../public/js/mappai-grounding-core.js'),
    MappAIConfrontoCore: require('../public/js/mappai-confronto-core.js'),
    t: (_key, fallback) => fallback, renderGraph() {}, getSystemKey: () => 'mock-key',
    MappAIPipeline: { run: async () => { calls.pipeline++; } },
    buildVaultMapData: () => ({ ...st.db, reviewRevision: st._reviewRevision, reviewCommit: st._reviewCommit }),
    electronAPI: {
      saveVaultFile: async args => {
        if (args.relPath !== 'pipeline.json') return { ok: true };
        calls.manifest++;
        if (opts.failSave) return { ok: false, error: 'Disco non disponibile' };
        assert.equal(args.expectedVersion, saved.version);
        saved.manifest = JSON.parse(args.text); saved.version++;
        saved.manifest._storageVersion = saved.version;
        return { ok: true, version: saved.version };
      },
      saveVault: async args => { calls.map++; saved.map = clone(args.mapData); if (opts.afterMapWrite) opts.afterMapWrite(st, saved); return { success: true }; },
      loadVault: async () => { calls.load++; return { success: true, data: clone(opts.diskData || saved.map) }; },
      readVaultFile: async () => ({ ok: true, text: JSON.stringify(opts.readback ? opts.readback(clone(saved.manifest)) : saved.manifest) }),
      vaultMaterialsList: async () => ({ manifest: clone(saved.manifest) })
    } };
  const ctx = vm.createContext({ window, appState: st, document: d.document, console, TextDecoder, Uint8Array,
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    StorageManager: { currentProjectId: 'project', saveCurrentProject: () => { calls.cache++; } },
    // packet 0089 (ADR 0020): veste, affermazioni e quarantena accese senza chiave; qui il default è il '0' esplicito (inv. 1)
    localStorage: opts.localStorage || { getItem: k => (SPENTI_0089.has(k) ? '0' : null) } });
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/mappai-review.js'), 'utf8'), ctx);
  return { R: window.MappAIReview, window, st, calls, saved, dom: d, opts,
    load: file => vm.runInContext(fs.readFileSync(require.resolve('../public/js/' + file), 'utf8'), ctx) };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

function setupJudge() {
  const profile = require('../tools/smoke/modelli-per-fase').profile();
  profile.modelli.giudice = 'google/gemma-4-31B-it';
  const values = new Map([['mappai_multimodello', '1'], ['mappai_modelli_infomaniak', JSON.stringify(profile)]]);
  const h = runtime({ localStorage: { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v) } });
  h.st.aiProvider = 'infomaniak'; h.st.infomaniakProductId = 'private-product';
  h.window.MappAIModelliCore = require('../public/js/mappai-modelli-core');
  h.window.getProviderKey = () => 'private-key';
  h.window.fetchEmbeddings = async () => { throw new Error('Unexpected embeddings call'); };
  const calls = [];
  h.window.fetchModelAPI = async (_payload, key, ctx) => {
    calls.push({ ...ctx, key });
    return { _mappaiAI: { provider: ctx.provider, phase: ctx.phase, requestedModel: ctx.model,
      actualModel: ctx.model, runId: ctx.runId } };
  };
  h.load('mappai-modelli.js');
  const partial = { stato: 'parziale', copertura: { nodiEsaminati: ['a'], nodiSaltati: [{ id: 'b' }],
    linkEsaminati: [], linkSaltati: [{ source: 'a', target: 'b', rel: 'richiede', motivo: 'prova mancante' }] } };
  const m = manifest(Core.setDecision(initial({ ...initial().initial.report, ...partial, checkStatus: 'incomplete' }), 'issue', 'reject'));
  m.config.modelli = clone(profile); m.config.modelli.modelli.giudice = 'mistralai/Mistral-Small-4-119B-2603';
  m.modelliGiro = { runId: 'generation-original', profilo: clone(m.config.modelli), chiamate: [] };
  h.st._pipelineManifest = m; h.st._judgeReport = h.st._giudiceReport = m.review.initial.report;
  h.window.executeJudgePass = async (key, opts, giro) => {
    // Packet 0026: «Riprova» passa anche il rapporto precedente (ripresa mirata);
    // un nuovo controllo dal Setup no.
    assert.equal(key, null); assert.deepEqual({ enabled: opts.enabled, apply: opts.apply }, { enabled: true, apply: false });
    assert.ok(!opts.rapportoPrecedente || opts.rapportoPrecedente === h.m.review.initial.report ||
      clone(opts.rapportoPrecedente).stato === 'parziale');
    assert.deepEqual(clone(h.st._generationSources), Core.sourceSnapshot(SOURCES));
    assert.equal(h.st.db.nodes[0].desc, 'Prima.');
    h.st._judgeReport = h.st._giudiceReport = clone(partial);
    await giro.chat('giudice', {});
    return h.st._judgeReport;
  };
  return Object.assign(h, { m, values, profile, aiCalls: calls });
}

function fullSourceReport() {
  const proof = { evidenzaId: 'ev-original-2', docId: 'pdf-1', sourceRevision: 'revision-original', recordId: 'record-2',
    start: 0, end: 42, page: 2, title: '<img src=x onerror=bad()>', source: 'pagina 2', text: 'Testo originale <script>bad()</script>.', verbatim: true };
  return { contratto: 'mappai-giudice@2', stato: 'parziale', quando: '2026-09-25T00:00:00Z',
    fonte: { schema: 'mappai-fonti-giudice@1', revisione: 'registry-1', fornita: true,
      copertura: { pagineTotali: 6, pagineConTesto: 5, pagineVuote: 1, pagineNonNumerate: 0, caratteri: 9000 }, diagnostica: [] },
    copertura: { nodiEsaminati: ['a', 'b'], nodiSaltati: [], linkEsaminati: [{ source: 'a', target: 'b', rel: 'richiede' }],
      linkSaltati: [{ source: 'b', target: 'a', rel: 'determina', motivo: 'Il testo non chiarisce la direzione.' },
        { source: 'a', target: 'b', rel: 'causa', motivo: 'ID non ammesso.' }] },
    esitiLink: [{ source: 'a', target: 'b', rel: 'richiede', esito: 'sostenuto', problema: 'Il rapporto è descritto nel passaggio.', prove: [proof.evidenzaId], evidenze: [proof] },
      { source: 'b', target: 'a', rel: 'determina', esito: 'non_verificabile', problema: 'Il testo non chiarisce la direzione.', prove: [], evidenze: [] }] };
}

test('full-source report shows provenance, extraction limits and uncertainty separately from technical failures', async () => {
  const h = runtime(), report = fullSourceReport(), m = manifest(initial(report));
  h.st._pipelineManifest = m;
  const modal = h.R.open('/vault', m), evidence = modal.querySelector('[data-judge-evidence]');
  assert.match(modal.querySelector('#mrv-judge-model-result').textContent, /Descrizioni esaminate: 2/);
  assert.match(evidence.textContent, /Pagine con testo disponibili: 5 \/ 6.*Parti prive di testo: 1/);
  assert.match(evidence.textContent, /non sono automaticamente confermate/);
  assert.match(evidence.textContent, /Sostenuto dalla fonte/);
  assert.match(evidence.textContent, /Pagina 2/);
  assert.equal(evidence.querySelector('[data-judge-proof] blockquote').textContent, report.esitiLink[0].evidenze[0].text);
  assert.match(evidence.querySelector('[data-judge-proof] details').textContent, /ev-original-2.*revision-original/);
  assert.equal(evidence.querySelector('script'), null); assert.equal(evidence.querySelector('img'), null);
  assert.match(modal.querySelector('#mrv-unchecked').textContent, /Prove insufficienti.*direzione/);
  assert.match(modal.querySelector('#mrv-unchecked').textContent, /Risposta del controllo non utilizzabile.*ID non ammesso/);
  assert.equal(modal.querySelector('#mrv-manual-confirm').checked, false);
  await h.R.writeManifest('/vault', m);
  const next = fullSourceReport(); next.esitiLink[0].esito = 'contraddetto'; next.esitiLink[0].problema = 'Direzione contraddetta.';
  m.review = Core.mergeRetry(m.review, initial(next)); await h.R.writeManifest('/vault', m);
  const fresh = runtime(); await fresh.R.restore('/vault', clone(h.saved.manifest));
  const reopened = fresh.R.open('/vault', fresh.st._pipelineManifest);
  assert.match(reopened.querySelector('[data-judge-link-outcome="contraddetto"]').textContent, /Contraddetto dalla fonte/);
  assert.match(reopened.querySelector('#mrv-judge-history').textContent, /Sostenuto dalla fonte.*Testo originale/s);
  assert.deepEqual(clone(fresh.R.current().initial.previousReports[0]), report);
});

test('missing or unnumbered source reports never imply that the whole document was checked', () => {
  for (const supplied of [true, false]) {
    const h = runtime(), report = fullSourceReport(); report.fonte.fornita = supplied;
    report.fonte.copertura = { pagineTotali: 1, pagineConTesto: 1, pagineVuote: 0, pagineNonNumerate: 1, caratteri: 100 };
    report.esitiLink = [];
    const modal = h.R.open('/vault', manifest(initial(report))), text = modal.querySelector('[data-judge-evidence]').textContent;
    assert.match(text, /Parti senza numero di pagina: 1/);
    assert.doesNotMatch(text, /Pagina 1|100%|Pagine con testo/);
    assert.match(text, supplied ? /Testo originale fornito/ : /non è stato fornito/);
  }
});

test('a rejected description finding names the uncovered node and its reason without changing legacy reports', () => {
  for (const legacy of [false, true]) {
    const h = runtime(), report = fullSourceReport();
    report.esitiLink = []; report.copertura.linkSaltati = []; report.copertura.linkEsaminati = [];
    report.copertura.nodiEsaminati = ['b']; report.copertura.nodiSaltati = [{ id: 'a', motivo: 'riferimento della prova non ammesso <script>bad()</script>' }];
    if (legacy) delete report.contratto;
    const modal = h.R.open('/vault', manifest(initial(report))), list = modal.querySelector('[data-judge-unchecked-nodes]');
    if (legacy) assert.equal(list, null);
    else {
      assert.match(list.textContent, /Germania: Descrizione da controllare · riferimento della prova non ammesso/);
      assert.equal(list.querySelector('script'), null);
      assert.match(modal.querySelector('#mrv-unchecked').textContent, /Parti ancora da controllare: 1/);
      assert.equal(modal.querySelector('#mrv-manual-confirm').checked, false);
    }
  }
});

test('empty pages or uncertain extraction order explain why zero target residuals still leave a partial check', () => {
  for (const reason of ['empty-page', 'extraction-order']) {
    const h = runtime(), report = fullSourceReport();
    report.esitiLink = []; report.copertura.linkSaltati = []; report.copertura.nodiSaltati = [];
    if (reason === 'extraction-order') {
      report.fonte.copertura.pagineVuote = 0; report.fonte.copertura.pagineConTesto = 6;
      report.fonte.diagnostica = [{ code: 'extraction_order' }];
    }
    const modal = h.R.open('/vault', manifest(initial(report)));
    assert.match(modal.querySelector('#mrv-judge-model-result').textContent, /Parti ancora da controllare: 0/);
    assert.match(modal.querySelector('[data-judge-evidence]').textContent, /resta parziale per i limiti del testo estratto, anche se non ci sono descrizioni o collegamenti ancora da controllare/);
    assert.equal(modal.querySelector('#mrv-coverage-label').textContent, 'Parziale');
    assert.equal(modal.querySelector('#mrv-manual-confirm').checked, false);
  }
});

test('rechecking an approved edited map uses its source snapshot and restores the caller on success or failure', async () => {
  for (const fail of [false, true]) {
    const h = runtime(), begun = Core.beginApproval(initial({ checkStatus: 'completed', issues: [] }), DB);
    const m = manifest(Core.completeApproval(begun.review, begun.revision)); h.st._pipelineManifest = m;
    h.st.db.nodes[0].desc = 'Una modifica successiva.';
    const other = [{ title: 'Altra fonte', content: 'Non appartiene alla revisione.' }]; h.st._generationSources = other;
    const oldReview = m.review, pages = h.st._pdfPagine, sources = h.st.sources;
    h.window.executeJudgePass = async (_key, opts) => {
      assert.equal(opts.apply, false);
      assert.deepEqual(clone(h.st._generationSources), Core.sourceSnapshot(SOURCES));
      assert.equal(h.st.db.nodes[0].desc, 'Una modifica successiva.');
      if (fail) throw new Error('controllo non disponibile');
      return fullSourceReport();
    };
    if (fail) await assert.rejects(h.R.requireApproved(), /controllo non disponibile/);
    else {
      assert.equal(await h.R.requireApproved(), false);
      assert.deepEqual(clone(m.review.previous), clone(oldReview));
      assert.equal(m.review.initial.report.contratto, 'mappai-giudice@2');
    }
    assert.equal(h.st._generationSources, other); assert.equal(h.st._pdfPagine, pages); assert.equal(h.st.sources, sources);
    assert.equal(h.calls.map + h.calls.pipeline, 0);
    if (fail) assert.equal(m.review, oldReview);
  }
});

/* 0123, lotto 3 (0056): G1 IN ATTESA e una modifica vera sulla tela. Prima era un vicolo cieco: «Riprova» e «Nuovo controllo»
   rifiutavano, riaprire riapriva la stessa revisione. Il controllo nuovo sulla mappa di adesso parte SOLO dal gesto del docente
   («Ricontrolla la mappa adesso», il bottone in fondo al Banco): `requireApproved` e i suoi chiamanti aprono il Banco come
   prima, senza una chiamata AI. */
test('0123 lotto 3: G1 in attesa e mappa cambiata — «Ricontrolla la mappa adesso» fa un controllo nuovo; requireApproved da solo apre il Banco e basta', async () => {
  for (const gesto of [true, false]) {
    const h = runtime(), m = manifest(Core.setDecision(initial(), 'issue', 'reject')); h.st._pipelineManifest = m;
    h.st.db.nodes[1].desc = 'Una modifica vera.';
    const old = m.review, giudice = [], aperte = [];
    h.window.executeJudgePass = async (key, opts) => {
      giudice.push({ key, apply: opts.apply });
      assert.deepEqual(clone(h.st._generationSources), Core.sourceSnapshot(SOURCES), 'il giudice legge le fonti della revisione');
      assert.equal(h.st.db.nodes[1].desc, 'Una modifica vera.', 'e la mappa di adesso');
      return fullSourceReport();
    };
    const open = h.R.open; h.R.open = (...a) => { aperte.push(a[0]); return open.apply(h.R, a); };
    if (gesto) {
      const modal = h.R.open('/vault', m), bottone = modal.querySelector('#mrv-continue');
      assert.equal(bottone.hidden, false);
      await bottone.click(); await tick(); await tick();
      assert.deepEqual(giudice, [{ key: 'mock-key', apply: false }], 'UNA chiamata al giudice');
      assert.equal(m.review.initial.status, 'awaiting_review');
      assert.equal(m.review.initial.report.contratto, 'mappai-giudice@2');
      assert.equal(Core.coincide(h.st.db, m.review.sources, m.review, 'base'), true, 'la revisione nuova fotografa la mappa di adesso');
      assert.deepEqual(clone(m.review.previous), clone(old), 'la revisione di prima in previous');
      assert.equal(h.calls.manifest, 1);
      assert.equal(h.saved.manifest.review.previous.initial.decisions.issue.choice, 'reject', 'le scelte fatte restano, sul disco');
      assert.deepEqual(aperte, ['/vault', '/vault'], 'il Banco si riapre, sulla revisione nuova');
    } else {
      assert.equal(await h.R.requireApproved(), false);
      assert.equal(await h.R.requireApproved({ quarantena: true }), false);
      assert.equal(giudice.length, 0, 'nessuna chiamata AI senza il gesto del docente');
      assert.equal(m.review, old); assert.equal(h.calls.manifest, 0);
      assert.deepEqual(aperte, ['/vault', '/vault'], 'il Banco si apre, come prima');
    }
    assert.equal(h.calls.map + h.calls.pipeline, 0);
  }
});

test('0123 lotto 3: la G1 approvata e superata si ricontrolla come prima (0097); una G1 in attesa che coincide non si ricontrolla', async () => {
  const h = conStrato(runtime()), begun = Core.beginApproval(initial({ checkStatus: 'completed', issues: [] }), DB);
  const m = manifest(Core.completeApproval(begun.review, begun.revision)); h.st._pipelineManifest = m;
  m.review.final = { stage: 'done', items: [] };
  h.st.db.nodes[0].desc = 'Una modifica successiva.';
  const old = m.review; let chiamate = 0;
  h.window.executeJudgePass = async () => { chiamate++; return fullSourceReport(); };
  assert.equal(await h.R.requireApproved(), false);
  assert.equal(chiamate, 1); assert.deepEqual(clone(m.review.previous), clone(old));
  assert.equal(m.review.initial.status, 'awaiting_review');
  // la strada dello 0097 non cambia: `final` resta solo nella revisione di prima (conservaMateriali vale per la G1 in attesa)
  assert.equal(m.review.final, undefined); assert.equal(m.review.previous.final.stage, 'done');
  // in attesa e la mappa com'era: il bottone fa la strada di sempre (approva), niente controllo nuovo
  const a = runtime(), ma = manifest(); a.st._pipelineManifest = ma;
  let chiamateA = 0;
  a.window.executeJudgePass = async () => { chiamateA++; return fullSourceReport(); };
  const modal = a.R.open('/vault', ma);
  assert.notEqual(modal.querySelector('#mrv-continue').textContent, 'Ricontrolla la mappa adesso');
  assert.equal(await a.R.requireApproved(), false);
  assert.equal(chiamateA, 0); assert.equal(ma.review.previous, undefined); assert.equal(a.calls.manifest, 0);
});

test('0123 lotto 3: «Ricontrolla la mappa adesso» con la G1 in attesa porta alla revisione nuova bozze, final e consegne nate sotto quarantena (come retryJudge, 0042)', async () => {
  const h = conStrato(runtime()), m = manifest(); h.st._pipelineManifest = m;
  const g2 = Core.createReview({ db: { items: [{ id: 'q1', kind: 'mc', question: 'Domanda?' }] }, sources: SOURCES, report: { checkStatus: 'completed', issues: [] } });
  m.review.drafts = { B: { 'mc-auto': { id: 's1', items: [{ id: 'q1' }], quarantena: { firma: 'f1' } } }, C: {} };
  m.review.final = { stage: 'awaiting_review', items: [{ id: 'q1', kind: 'mc', question: 'Domanda?' }], review: g2, quarantena: { firma: 'f1' } };
  m.review.deliveries = [{ final: { stage: 'done' } }];
  m.review.quarantena = { schema: 'mappai-quarantena@1', firma: 'f1', completo: true };
  const prima = clone(m.review);
  h.st.db.nodes[1].desc = 'Una modifica vera.';
  h.window.executeJudgePass = async () => ({ checkStatus: 'completed', issues: [] });
  await h.R.open('/vault', m).querySelector('#mrv-continue').click(); await tick(); await tick();
  assert.equal(m.review.previous.baseRevision, prima.baseRevision, 'il controllo nuovo è avvenuto');
  assert.deepEqual(clone(m.review.drafts), prima.drafts);
  assert.deepEqual(clone(m.review.final), prima.final);
  assert.deepEqual(clone(m.review.deliveries), prima.deliveries);
  assert.equal(m.review.quarantena, undefined, 'dopo un ricontrollo il record non vale più');
  assert.deepEqual(clone(h.saved.manifest.review.deliveries), prima.deliveries, 'e sul disco');
});

test('new Setup check: cancel is inert; preview is frozen, history and decisions survive reload', async () => {
  const h = setupJudge(), before = clone(h.m), pages = h.st._pdfPagine, sources = h.st.sources;
  const modal = h.R.open('/vault', h.m);
  await modal.querySelector('#mrv-setup-judge').click();
  assert.match(modal.querySelector('#mrv-setup-preview').textContent, /gemma-4.*Mistral-Small/s);
  assert.match(modal.querySelector('#mrv-setup-preview').textContent, /prima delle correzioni/);
  await modal.querySelector('#mrv-setup-cancel').click();
  assert.equal(h.aiCalls.length + h.calls.manifest, 0);
  assert.deepEqual(clone(h.m), before);
  await modal.querySelector('#mrv-setup-judge').click();
  h.profile.modelli.giudice = 'different-after-preview'; h.window.MappAIModelli.salvaProfilo(h.profile);
  const confirm = modal.querySelector('#mrv-manual-confirm'); confirm.checked = true; confirm.onchange();
  await modal.querySelector('#mrv-setup-start').click();
  assert.equal(h.aiCalls.length, 1); assert.equal(h.aiCalls[0].model, 'google/gemma-4-31B-it');
  assert.equal(h.aiCalls[0].phase, 'giudice'); assert.equal(h.aiCalls[0].vaultPath, '/vault');
  assert.notEqual(h.aiCalls[0].runId, before.modelliGiro.runId);
  assert.deepEqual(clone(h.m.config), before.config); assert.deepEqual(clone(h.m.modelliGiro), before.modelliGiro);
  assert.deepEqual(clone(h.m.review.initial.decisions), before.review.initial.decisions);
  assert.deepEqual(clone(h.m.review.initial.previousReports), [before.review.initial.report]);
  assert.equal(h.m.review.initial.checkStatus, 'incomplete');
  assert.equal(h.st._pdfPagine, pages); assert.equal(h.st.sources, sources);
  assert.equal(Object.hasOwn(h.st, '_generationSources'), false);
  assert.equal(h.R.isBusy(), false); assert.equal(h.calls.map + h.calls.pipeline, 0);
  assert.equal(modal.querySelector('#mrv-manual-confirm').checked, false);
  assert.match(modal.querySelector('#mrv-status').textContent, /spunta/);
  assert.match(modal.querySelector('#mrv-judge-model-result').textContent, /gemma-4.*→.*gemma-4/);
  assert.match(modal.querySelector('#mrv-judge-model-result').textContent, /Collegamenti controllati: 0/);
  assert.match(modal.querySelector('#mrv-judge-history').textContent, /Modello non registrato/);
  assert(!JSON.stringify(h.saved.manifest).includes('private-'));
  const fresh = runtime(); await fresh.R.restore('/vault', clone(h.saved.manifest));
  const reopened = fresh.R.open('/vault', fresh.st._pipelineManifest);
  assert.match(reopened.querySelector('#mrv-judge-model-result').textContent, /gemma-4/);
  assert.equal(fresh.st._judgeReport, fresh.R.current().initial.report);
  // Ordinary retry continues to request the saved model even after a new check.
  await h.R.retryJudge('/vault', h.m);
  assert.equal(h.aiCalls[1].model, 'mistralai/Mistral-Small-4-119B-2603');
  assert.match(h.R.open('/vault', h.m).querySelector('#mrv-judge-history').textContent, /gemma-4/);
});

test('new check locks actions, starts once, and requires a new preview after a failed save', async () => {
  const h = setupJudge(), modal = h.R.open('/vault', h.m), old = h.m.review;
  let release;
  const execute = h.window.executeJudgePass;
  h.window.executeJudgePass = async (...args) => { await new Promise(resolve => { release = resolve; }); return execute(...args); };
  await modal.querySelector('#mrv-setup-judge').click();
  const button = modal.querySelector('#mrv-setup-start'), attempt = button.click(); await tick();
  assert.equal(h.R.isBusy(), true); assert.equal(button.disabled, true);
  assert.equal(modal.querySelector('#mrv-later').disabled, true);
  await button.click(); h.opts.failSave = true; release(); await attempt;
  assert.equal(h.aiCalls.length, 1); assert.equal(h.m.review, old);
  assert.equal(h.R.isBusy(), false); assert.equal(modal.querySelector('#mrv-setup-judge').hidden, false);
  assert.match(modal.querySelector('#mrv-status').textContent, /Disco/);
  assert.equal(modal.querySelector('#mrv-later').disabled, false);
});

test('new Setup check cannot start while a teacher decision has an unresolved save failure', async () => {
  const h = setupJudge(), modal = h.R.open('/vault', h.m); h.opts.failSave = true;
  await modal.querySelector('[data-review-filter=decided]').click();
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Annulla decisione').click();
  assert.equal(modal.querySelector('#mrv-save-retry').hidden, false);
  await modal.querySelector('#mrv-setup-judge').click();
  assert.equal(h.aiCalls.length, 0);
  assert.match(modal.querySelector('#mrv-status').textContent, /Disco/);
});

test('Setup check preflight: disabled phases, key, Product ID and judge errors stay visible without calls', async () => {
  for (const [change, expected] of [
    [h => h.window.MappAIModelli.spegni(), /Attiva/],
    [h => { h.window.getProviderKey = () => ''; }, /Chiave/],
    [h => { h.st.infomaniakProductId = ''; }, /Product ID/],
    [h => { h.profile.modelli.giudice = null; h.window.MappAIModelli.salvaProfilo(h.profile); }, /Assegna/]
  ]) {
    const h = setupJudge(), before = clone(h.m); change(h);
    const modal = h.R.open('/vault', h.m); await modal.querySelector('#mrv-setup-judge').click();
    assert.match(modal.querySelector('#mrv-status').textContent, expected);
    assert.equal(h.aiCalls.length + h.calls.manifest, 0); assert.deepEqual(clone(h.m), before);
  }
});

test('new check preserves the previous report and source context on AI or write failure', async () => {
  for (const kind of ['ai', 'write', 'empty']) {
    const h = setupJudge(), old = h.m.review, oldReport = h.st._judgeReport, pages = h.st._pdfPagine;
    if (kind === 'write') h.opts.failSave = true;
    if (kind !== 'write') h.window.executeJudgePass = async () => {
      h.st._judgeReport = h.st._giudiceReport = { stato: 'in-corso' };
      if (kind === 'ai') throw new Error('model unavailable');
      return null;
    };
    const prepared = h.R.prepareSetupJudge('/vault', h.m);
    await assert.rejects(prepared.run(), /Disco|model unavailable|rapporto/);
    assert.equal(h.m.review, old); assert.equal(h.st._pipelineManifest, h.m);
    assert.equal(h.st._judgeReport, oldReport); assert.equal(h.st._giudiceReport, oldReport);
    assert.equal(h.st._pdfPagine, pages); assert.equal(h.R.isBusy(), false);
    assert.equal(h.saved.manifest, null);
    await assert.rejects(prepared.run(), /anteprima/);
  }
});

test('new check refuses a changed review, base or project after preview and during the call', async () => {
  for (const timing of ['preview', 'call']) for (const kind of ['decision', 'base', 'project']) {
    const h = setupJudge(), prepared = h.R.prepareSetupJudge('/vault', h.m);
    const change = () => {
      if (kind === 'decision') h.m.review = Core.setDecision(h.m.review, 'issue', 'accept');
      if (kind === 'base') h.st.db.nodes[0].desc = 'Changed by teacher';
      if (kind === 'project') { h.st.activeVaultPath = '/other'; h.st.sources = ['other sources']; h.st._judgeReport = { project: 'other' }; }
    };
    if (timing === 'preview') change();
    else {
      const execute = h.window.executeJudgePass;
      h.window.executeJudgePass = async (...args) => { const report = await execute(...args); change(); return report; };
    }
    await assert.rejects(prepared.run(), /cambiato/);
    assert.equal(h.calls.manifest, 0); assert.equal(h.R.isBusy(), false);
    if (kind === 'decision') assert.equal(h.m.review.initial.decisions.issue.choice, 'accept');
    if (kind === 'base') assert.equal(h.st.db.nodes[0].desc, 'Changed by teacher');
    if (kind === 'project') { assert.deepEqual(h.st.sources, ['other sources']); assert.deepEqual(h.st._judgeReport, { project: 'other' }); }
  }
});

test('new check is unavailable on an approved map; a complete pending check can be checked again', () => {
  const h = setupJudge(); h.m.review.initial.checkStatus = 'completed';
  assert(h.R.open('/vault', h.m).querySelector('#mrv-setup-judge'));
  h.m.review.initial.status = 'approved';
  assert.equal(h.R.open('/vault', h.m).querySelector('#mrv-setup-judge'), null);
  assert.throws(() => h.R.prepareSetupJudge('/vault', h.m), /cambiato/);
});

test('link editor saves a manual decision and Undo persists without changing the base map', async () => {
  const h = runtime(), m = manifest(Core.setDecision(initial(), 'issue', 'reject'));
  h.st._pipelineManifest = m;
  const before = clone(h.st.db), ref = h.window.MappAILinkEditorCore.reference(h.st.db.links[0]);
  const undo = await h.R.editLinkLabel(ref, 'influenza');
  assert.equal(h.calls.manifest, 1); assert.equal(h.calls.map, 0);
  assert.deepEqual(h.st.db, before);
  assert.equal(h.saved.manifest.review.initial.decisions.issue.choice, 'reject');
  assert.equal(h.window.MappAILinkEditorCore.draft(h.R.current(), ref), 'influenza');
  await undo();
  assert.equal(h.calls.manifest, 2);
  assert.deepEqual(h.saved.manifest.review.initial.decisions, m.review.initial.decisions);
});

test('link decision Undo refuses later decisions; disk failure does not change review', async () => {
  const h = runtime(); h.st._pipelineManifest = manifest();
  const ref = h.window.MappAILinkEditorCore.reference(h.st.db.links[0]);
  const undo = await h.R.editLinkLabel(ref, 'influenza');
  h.st._pipelineManifest.review = Core.setDecision(h.R.current(), 'issue', 'reject');
  await assert.rejects(undo(), /stale_revision/);
  assert.equal(h.R.current().initial.decisions.issue.choice, 'reject');
  h.opts.failSave = true; const before = h.R.current();
  await assert.rejects(h.R.editLinkLabel(ref, 'precede'), /Disco/);
  assert.equal(h.R.current(), before); assert.equal(h.R.isBusy(), false);
});

test('Nessuna is passed through the real review writer and stays explicit after restore', async () => {
  const h = runtime(), m = manifest(Core.setDecision(initial(), 'issue', 'reject'));
  h.st._pipelineManifest = m;
  const ref = h.window.MappAILinkEditorCore.reference(h.st.db.links[0]);
  await assert.rejects(h.R.editLinkLabel(ref, ''), /empty_review_label/);
  const undo = await h.R.editLinkLabel(ref, '', { relNone: true });
  assert.equal(h.calls.manifest, 1); assert.equal(h.calls.map, 0);
  assert.equal(h.saved.manifest.review.initial.decisions.issue.choice, 'reject');
  assert.equal(h.window.MappAILinkEditorCore.draftNone(h.saved.manifest.review, ref), true);
  const preview = Core.preview(h.saved.manifest.review, h.st.db);
  assert.equal(preview.ok, true); assert.equal(preview.db.links[0].rel, '');
  assert.equal(preview.db.links[0].relNone, true);
  await undo(); assert.equal(h.calls.manifest, 2);
  assert.deepEqual(h.saved.manifest.review.initial.decisions, m.review.initial.decisions);
});

test('G1 commit verifies actual persisted content and uses lexical StorageManager', async () => {
  const h = runtime(), r = initial(), m = manifest(Core.setDecision(r, 'issue', 'accept'));
  await h.R.approve('/vault', m);
  assert.equal(h.calls.map, 1); assert.equal(h.calls.load, 1); assert.ok(h.calls.cache > 0);
  assert.equal(h.window.StorageManager, undefined, 'the test intentionally provides only the lexical global');
  assert.equal(m.review.initial.status, 'approved');
  assert.equal(h.st.db.nodes.find(n => n.id === 'a').desc, 'Dopo.');
  assert.equal(h.st.db.nodes.find(n => n.id === 'a').content, 'Dopo.');
  assert.equal(h.st._reviewCommit, undefined);
});

test('wrong disk link/source or project switch leaves the durable commit applying', async () => {
  for (const fault of ['link', 'source', 'project']) {
    const h = runtime({ afterMapWrite: (st, saved) => {
      if (fault === 'link') saved.map.links = [];
      if (fault === 'source') saved.map.sourcesDict.a = [{ text: 'Altra fonte.' }];
      if (fault === 'project') st.activeVaultPath = '/other';
    } });
    const m = manifest(Core.setDecision(initial(), 'issue', 'accept'));
    await assert.rejects(h.R.approve('/vault', m));
    assert.equal(h.saved.manifest.review.initial.status, 'applying');
    assert.equal(h.calls.manifest, 1);
  }
});

test('restore uses diskData, preserves same-token teacher drafts and never replaces actual citations with an old approval', async () => {
  const r = initial({ checkStatus: 'completed', issues: [] });
  const begun = Core.beginApproval(r, DB), approved = Core.completeApproval(begun.review, begun.revision), m = manifest(approved);
  const h = runtime(); h.st.db.nodes[0].desc = 'Bozza locale legittima.'; h.st._reviewRevision = approved.approvedRevision;
  const disk = clone(DB); disk.sourcesDict.a = [{ id: 'new', text: 'Fonte corretta su disco.' }];
  await h.R.restore('/vault', m, { fromCache: true, diskData: disk });
  assert.equal(h.calls.load, 0);
  assert.equal(h.st.db.nodes[0].desc, 'Bozza locale legittima.');
  assert.equal(h.st.db.sourcesDict.a[0].text, 'Fonte corretta su disco.');
  assert.equal(h.st._reviewDiskDraft.db.sourcesDict.a[0].text, 'Fonte corretta su disco.');
  assert.equal(h.st._reviewLocalDraft.db.nodes.find(n => n.id === 'a').desc, 'Bozza locale legittima.');
  const direct = runtime(); direct.st.db = disk;
  await direct.R.restore('/vault', m, { fromCache: false });
  assert.equal(direct.st.db.sourcesDict.a[0].text, 'Fonte corretta su disco.');
});

test('older cache token selects disk while retaining the local draft; legacy clears commit metadata', async () => {
  const m = manifest(), h = runtime(); h.st.db.nodes[0].desc = 'Vecchia cache.'; h.st._reviewCommit = 'old';
  await h.R.restore('/vault', m, { fromCache: true, diskData: clone(DB) });
  assert.equal(h.st.db.nodes[0].desc, 'Prima.');
  assert.equal(h.st._reviewLocalDraft.db.nodes.find(n => n.id === 'a').desc, 'Vecchia cache.');
  assert.equal(h.st._reviewCommit, undefined);
  await h.R.restore('/vault', null);
  assert.equal(h.st._pipelineManifest, null); assert.equal(h.st._reviewRevision, undefined);
});

test('retry rechecks sources in proposal mode, keeps existing decisions and restores caller source context', async () => {
  const h = runtime(), r = initial({ checkStatus: 'incomplete', issues: [{ id: 'existing', target: { kind: 'node', id: 'a' }, after: 'Dopo.' }] });
  const m = manifest(Core.setDecision(r, 'existing', 'reject'));
  const pages = [{ nome: 'Altro.pdf', pages: [] }]; h.st._pdfPagine = pages;
  h.window.executeJudgePass = async (_key, opts) => {
    assert.equal(opts.apply, false); assert.equal(opts.enabled, true);
    assert.equal(h.st._pdfPagine[0].nome, 'Libro.pdf');
    return { checkStatus: 'completed', issues: [{ id: 'reworded', target: { kind: 'node', id: 'a' }, after: 'Dopo.', problem: 'La stessa proposta, spiegata diversamente.' }] };
  };
  await h.R.retryJudge('/vault', m);
  assert.equal(m.review.initial.decisions.existing.choice, 'reject');
  assert.equal(m.review.initial.issues.length, 1);
  assert.equal(m.review.initial.issues[0].id, 'existing');
  assert.equal(m.review.initial.checkStatus, 'completed'); assert.equal(h.st._pdfPagine, pages);
  assert.equal(h.st.db.nodes[0].desc, 'Prima.');
});

test('text-only and mixed generation archives survive checkpoint and retry without stale source context', async () => {
  for (const sources of [[{ id: 'text', title: 'Testo incollato', content: 'La Germania riceveva valuta.' }],
    [{ id: 'pdf', nome: 'Libro.pdf', pages: [{ n: 4, text: 'Commercio dell’oro.' }] }, { id: 'web', title: 'Articolo', content: 'La Germania riceveva valuta.' }]]) {
    const h = runtime(); h.st._generationSources = sources; h.st._pdfPagine = [{ nome: 'Vecchio.pdf', pages: [] }];
    const m = Pipeline.createManifest({}, { vaultPath: '/vault' });
    await h.R.checkpoint('/vault', m);
    assert.deepEqual(clone(m.review.sources), Core.sourceSnapshot(sources));
    const currentSources = [{ id: 'unrelated', text: 'Altro contesto corrente.' }]; h.st._generationSources = currentSources;
    h.window.executeJudgePass = async () => {
      assert.deepEqual(clone(h.st._generationSources), Core.sourceSnapshot(sources));
      return { checkStatus: 'completed', issues: [] };
    };
    await h.R.retryJudge('/vault', m); assert.equal(h.st._generationSources, currentSources);
    await h.R.restore('/vault', null); assert.equal(h.st._generationSources, undefined);
  }
});

test('retry without new findings explains partial coverage; only a complete check removes manual confirmation', async () => {
  const h = runtime(), partial = { stato: 'parziale', copertura: {
    nodiEsaminati: ['b'], linkSaltati: [{ source: 'a', target: 'b', rel: 'richiede', motivo: 'evidenze mancanti' }]
  }, issues: [] };
  const m = manifest(Core.setDecision(initial({ ...partial, issues: [
    { id: 'existing', target: { kind: 'node', id: 'b', field: 'desc' }, after: 'Correzione.' }
  ] }), 'existing', 'reject'));
  const modal = h.R.open('/vault', m), proceed = modal.querySelector('#mrv-continue');
  assert.equal(proceed.hidden, true);
  assert.match(modal.querySelector('#mrv-manual').textContent, /Controllo automatico eseguito: alcune parti restano da verificare/);
  h.window.executeJudgePass = async () => clone(partial);
  await modal.querySelector('#mrv-retry-judge').click();
  assert.equal(m.review.initial.checkStatus, 'incomplete');
  assert.equal(m.review.initial.issues.length, 1, 'a partial check without findings does not invent correction cards');
  assert.equal(m.review.initial.decisions.existing.choice, 'reject');
  assert.match(modal.querySelector('#mrv-status').textContent, /Controllo automatico eseguito: alcune parti restano da verificare/);
  assert.match(modal.querySelector('#mrv-manual').textContent, /Anche senza nuove segnalazioni/);
  assert.match(modal.querySelector('#mrv-manual-option').textContent, /Ho verificato personalmente anche le parti non coperte/);
  assert.equal(modal.querySelector('#mrv-manual-confirm').checked, false);
  assert.equal(proceed.hidden, true);
  h.window.executeJudgePass = async () => ({ stato: 'completato', issues: [] });
  await modal.querySelector('#mrv-retry-judge').click();
  assert.equal(m.review.initial.checkStatus, 'completed');
  assert.equal(m.review.initial.decisions.existing.choice, 'reject');
  assert.match(modal.querySelector('#mrv-status').textContent, /Controllo automatico completato/);
  assert.equal(modal.querySelector('#mrv-manual-confirm'), null);
  assert.equal(proceed.hidden, false);
});

function finalManifest(items, issues) {
  const r = initial({ checkStatus: 'completed', issues: [] });
  const first = Core.beginApproval(r, DB), m = manifest(Core.completeApproval(first.review, first.revision));
  m.review.final = { stage: 'awaiting_review', items: clone(items), review: Core.createReview({ db: { items }, sources: SOURCES,
    report: { checkStatus: 'completed', issues: issues || [] } }) };
  return m;
}

function stalledMaterialFixture(opts = {}) {
  const h = runtime(opts), items = Array.from({ length: 250 }, (_, i) => ({ id: 'material-' + i, kind: 'flashcard', question: 'Domanda ' + i + '?', answer: 'Risposta ' + i + '.' }));
  const issues = Array.from({ length: 6 }, (_, i) => ({ id: 'decision-' + i, target: { kind: 'item', id: items[i].id, field: 'answer' }, after: 'Correzione ' + i + '.' }));
  const m = finalManifest(items, issues), final = m.review.final;
  issues.forEach((issue, i) => { final.review = Core.setDecision(final.review, issue.id, i < 3 ? 'accept' : i < 5 ? 'reject' : 'manual', { text: 'Scelta personale.' }); });
  final.review.initial.checkStatus = 'incomplete';
  final.review.initial.report = { checkStatus: 'incomplete', coverage: { expectedIds: items.map(i => i.id), checkedIds: items.slice(0, 240).map(i => i.id),
    skipped: items.slice(240).map(i => ({ id: i.id, reason: 'Una o più affermazioni non hanno un esito verificabile' })),
    claims: items.slice(240).map((i, index) => ({ itemId: i.id, field: 'answer', text: i.answer, status: index === 9 ? 'missing' : 'uncertain', checked: false })) } };
  final.review.initial.retrySummary = { newIssueIds: [], decisionsPreserved: 6, targeted: 10, reused: 240, checked: 0, remaining: 10 };
  h.st._pipelineManifest = m;
  return { ...h, m };
}

test('a stalled retry explains attempted vs completed checks and exposes the exact draft, original sources and missing verdicts', () => {
  const h = stalledMaterialFixture(), before = clone(h.m), modal = h.R.open('/vault', h.m, { final: true });
  assert.match(modal.querySelector('#mrv-retry-summary').textContent, /10 materiali sottoposti al tentativo · 0 nuovi controlli completati · 10 materiali ancora da verificare · 240 controlli riutilizzati/);
  assert.match(modal.querySelector('#mrv-no-progress').textContent, /non ha completato nuovi controlli/);
  assert.equal(modal.querySelectorAll('[data-coverage-item]').length, 10);
  const first = modal.querySelector('[data-coverage-item="material-240"]');
  assert.match(first.textContent, /Riscontro nella fonte non confermato/); assert.match(first.textContent, /Risposta 240/);
  assert.match(modal.querySelector('[data-coverage-item="material-249"]').textContent, /non ha restituito un esito/);
  assert.match(modal.querySelector('.mrv-coverage-sources').textContent, /Libro.pdf · Pagina 4/);
  assert.match(modal.querySelector('.mrv-coverage-sources').textContent, /Un contesto più ampio/);
  assert.match(modal.querySelector('#mrv-material-coverage').textContent, /non sono valutate dal pulsante di ricontrollo/);
  assert.deepEqual(clone(h.m), before); assert.equal(h.calls.manifest, 0);
});

/* La pelle del Banco (16/9/26): finestra intera, fonte accanto alla scheda, maniglia, Aa.
   Qui non c'è un DOM vero (niente canvas né pdf.js): si controlla che la struttura
   ci sia, che l'interruttore la tolga e che i gesti del modale restino quelli. */
test('the Banco skin adds the source column, handle and text size without changing decisions; the kill switch restores the old modal', async () => {
  const h = stalledMaterialFixture();
  h.window.MappAIReviewFonte = require('../public/js/mappai-review-fonte.js');
  const modal = h.R.open('/vault', h.m, { final: true });
  assert.match(modal.className, /mrv-banco/);
  assert.ok(modal.querySelector('.mrv-colonne #mrv-fonte'), 'the source column sits beside the cards');
  assert.ok(modal.querySelector('.mrv-carte #mrv-content'), 'cards keep their container and ids');
  assert.equal(modal.querySelector('#mrv-maniglia').getAttribute('aria-controls'), 'mrv-sidebar');
  // testata ad altezza fissa (25/9/26): il testo intero compare al passaggio del mouse SOLO se accorciato
  const testata = modal.querySelector('.mrv-header');
  const accorciato = { textContent: 'Controllo in corso… (3/12)', scrollWidth: 400, clientWidth: 120, title: '' };
  const intero = { textContent: '1 / 2 decise', scrollWidth: 90, clientWidth: 120, title: 'testo di prima' };
  testata.listeners.mouseover({ target: { closest: () => accorciato } });
  testata.listeners.mouseover({ target: { closest: () => intero } });
  testata.listeners.mouseover({ target: { closest: () => null } });
  assert.equal(accorciato.title, 'Controllo in corso… (3/12)');
  assert.equal(intero.title, '', 'a text that fits gets no tooltip, and a stale one is cleared');
  // il divisore fra fonte e schede (17/9/26): un separatore da tastiera; Invio chiude la fonte e la riapre
  const divisore = modal.querySelector('.mrv-colonne .mrv-divisore'), colonne = modal.querySelector('.mrv-colonne');
  assert.equal(divisore.getAttribute('role'), 'separator');
  const tasto = key => divisore.listeners.keydown({ key, preventDefault() {} });
  tasto('Enter');
  assert.ok(colonne.classList.contains('is-fonte-chiusa')); assert.equal(modal.querySelector('#mrv-fonte').inert, true);
  assert.equal(divisore.getAttribute('aria-valuenow'), '0');
  tasto('ArrowRight');
  assert.ok(!colonne.classList.contains('is-fonte-chiusa'), 'freccia a destra riapre la fonte chiusa');
  assert.equal(divisore.getAttribute('aria-valuenow'), '50');
  assert.equal(modal.querySelector('#mrv-testo').textContent, 'Aa x1');
  await modal.querySelector('#mrv-testo').click();
  assert.equal(modal.querySelector('#mrv-testo').textContent, 'Aa x1,5');
  for (let i = 240; i < 250; i++) await modal.querySelector('[data-coverage-approve="material-' + i + '"]').click();
  assert.equal(modal.querySelector('#mrv-continue').hidden, false, 'approving still works in the new skin');
  const spento = stalledMaterialFixture({ localStorage: { getItem: k => (k === 'mappai_revisione_banco' ? '0' : null), setItem() {} } });
  spento.window.MappAIReviewFonte = require('../public/js/mappai-review-fonte.js');
  const vecchio = spento.R.open('/vault', spento.m, { final: true });
  assert.doesNotMatch(vecchio.className, /mrv-banco/);
  assert.equal(vecchio.querySelector('#mrv-fonte'), null);
  assert.equal(vecchio.querySelector('#mrv-maniglia'), null);
  assert.equal(vecchio.querySelector('#mrv-testo'), null);
  assert.ok(vecchio.querySelector('.mrv-detail > #mrv-content'), 'the old modal keeps its original structure');
});

/* «Svizzera e 2a GM», 16/9/26: esaminare i materiali rimasti non registrava niente e
   l'unica uscita era una casella globale nascosta. Ora ognuno si approva da solo. */
test('each remaining material is approved on its own; all approved unlocks completion, and a later change revokes that approval', async () => {
  const h = stalledMaterialFixture(), modal = h.R.open('/vault', h.m, { final: true });
  const proceed = () => modal.querySelector('#mrv-continue');
  const ids = Array.from({ length: 10 }, (_, i) => 'material-' + (240 + i));
  assert.equal(proceed().hidden, true);
  assert.equal(modal.querySelectorAll('[data-coverage-approve]').length, 10);
  assert.equal(modal.querySelector('#mrv-retry-judge').className, 'pm-btn-cancel', 'a stalled retry is no longer the primary way out');
  for (const id of ids.slice(0, 9)) await modal.querySelector('[data-coverage-approve="' + id + '"]').click();
  assert.equal(proceed().hidden, true, 'nine out of ten is not enough');
  await modal.querySelector('[data-coverage-approve="material-249"]').click();
  assert.equal(proceed().hidden, false, 'no global checkbox needed once every material is approved');
  assert.equal(modal.querySelector('#mrv-manual-confirm').checked, false);
  assert.match(modal.querySelector('#mrv-unchecked').textContent, /10 · 10 approvati da te/);
  assert.match(modal.querySelector('[data-coverage-item="material-245"] summary').textContent, /approvato/);
  assert.ok(h.calls.manifest >= 10, 'every approval is saved');
  await modal.querySelector('[data-coverage-approve="material-249"]').click();
  assert.equal(proceed().hidden, true, 'undoing one approval locks completion again');
  await modal.querySelector('[data-coverage-approve="material-249"]').click();
  assert.equal(proceed().hidden, false);
  // una correzione a un materiale approvato: la versione letta non è più quella che si consegnerebbe
  await modal.querySelector('[data-coverage-item="material-240"] [data-coverage-edit="answer"]').click();
  const card = currentCard(modal);
  await card.querySelector('[data-review-choice="manual"]').click();
  const input = card.querySelector('[data-editor] textarea'); input.value = 'Risposta corretta a mano.'; input.oninput(); await tick();
  await card.querySelector('[data-edit-save]').click();
  assert.equal(proceed().hidden, true);
  await modal.querySelector('[data-review-filter="pending"]').click();
  // l'etichetta dice QUALE versione si approva (17/9/26): corretta a mano → la proposta; intatta → l'originale
  assert.match(modal.querySelector('[data-coverage-approve="material-240"]').textContent, /^Approva proposta/);
  assert.match(modal.querySelector('[data-coverage-item="material-240"] [data-coverage-edit="answer"]').textContent, /^Modifica proposta · /);
  assert.match(modal.querySelector('[data-coverage-approve="material-241"]').textContent, /^Invariato approvato · annulla/);
  assert.match(modal.querySelector('[data-coverage-item="material-241"] [data-coverage-edit="answer"]').textContent, /^Modifica originale · /);
  await modal.querySelector('[data-coverage-approve="material-240"]').click();
  assert.equal(proceed().hidden, false);
  await proceed().click();
  const fin = h.m.review.final.review.initial;
  assert.equal(fin.status, 'approved');
  assert.equal(fin.manualReview, true);
  assert.equal(fin.checkStatus, 'incomplete', 'approving never rewrites the model verdict');
  assert.equal(Object.keys(fin.manualChecks).length, 10);
  assert.equal(h.m.review.final.items.find(i => i.id === 'material-240').answer, 'Risposta corretta a mano.');
});

test('reviewing a residual adds one field decision, previews its correction and requires a fresh personal confirmation before approval', async () => {
  const h = stalledMaterialFixture(), initialDecisions = clone(h.m.review.final.review.initial.decisions), report = clone(h.m.review.final.review.initial.report);
  const modal = h.R.open('/vault', h.m, { final: true });
  let confirmation = modal.querySelector('#mrv-manual-confirm'); confirmation.checked = true; confirmation.onchange();
  assert.equal(modal.querySelector('#mrv-continue').hidden, false);
  await modal.querySelector('[data-coverage-item="material-240"] [data-coverage-edit="answer"]').click();
  assert.equal(modal.querySelector('#mrv-manual-confirm').checked, true);
  assert.equal(modal.querySelector('#mrv-continue').hidden, false);
  assert.equal(h.m.review.final.review.initial.issues.length, 6);
  let card = currentCard(modal);
  assert.doesNotMatch(card.textContent, /Il giudice segnala un problema|La prova non è disponibile/);
  assert.match(card.textContent, /Hai aperto questa scheda/);
  await card.querySelector('[data-review-choice="manual"]').click();
  const input = card.querySelector('[data-editor] textarea'); input.value = 'Risposta verificata personalmente.'; input.oninput(); await tick();
  await card.querySelector('[data-edit-save]').click();
  await modal.querySelector('[data-review-filter="pending"]').click();
  const version = modal.querySelector('[data-coverage-item="material-240"] .mrv-coverage-version');
  assert.match(version.textContent, /Risposta 240\./); assert.match(version.textContent, /Risposta verificata personalmente/);
  assert.match(modal.querySelector('#mrv-unchecked').textContent, /10/);
  assert.equal(h.m.review.final.items[240].answer, 'Risposta 240.', 'corrections are still separate from the checked drafts');
  await modal.querySelector('[data-coverage-item="material-240"] [data-coverage-edit="answer"]').click();
  assert.equal(h.m.review.final.review.initial.issues.length, 7, 'opening the same field reuses its saved decision');
  assert.equal(currentCard(modal).querySelector('[data-editor] textarea').value, 'Risposta verificata personalmente.');
  confirmation = modal.querySelector('#mrv-manual-confirm'); confirmation.checked = true; confirmation.onchange();
  // Saving a later edit invalidates the confirmation; a local draft does not.
  const edit = currentCard(modal).querySelector('[data-editor] textarea'); edit.value = 'Versione definitiva verificata.'; edit.oninput(); await tick();
  await currentCard(modal).querySelector('[data-edit-save]').click();
  confirmation = modal.querySelector('#mrv-manual-confirm');
  assert.equal(confirmation.checked, false); assert.equal(modal.querySelector('#mrv-continue').hidden, true);
  confirmation.checked = true; confirmation.onchange();
  await modal.querySelector('#mrv-continue').click();
  assert.equal(h.m.review.final.review.initial.status, 'approved');
  assert.equal(h.m.review.final.review.initial.manualReview, true);
  assert.equal(h.m.review.final.review.initial.checkStatus, 'incomplete', 'personal approval never changes the model verdict');
  assert.equal(h.m.review.final.items.find(i => i.id === 'material-240').answer, 'Versione definitiva verificata.');
  for (const [id, decision] of Object.entries(initialDecisions)) assert.deepEqual(clone(h.m.review.final.review.initial.decisions[id]), decision);
  assert.deepEqual(clone(h.m.review.final.review.initial.report), report);
});

test('a residual edit reopens an existing decision without resetting it, and blocked saves cannot silently navigate away', async () => {
  const h = stalledMaterialFixture(), final = h.m.review.final;
  final.review = Core.addIssue(final.review, { id: 'existing', target: { kind: 'item', id: 'material-240', field: 'answer' }, after: 'Proposta scelta.' });
  final.review = Core.setDecision(final.review, 'existing', 'accept');
  const modal = h.R.open('/vault', h.m, { final: true }), before = clone(final.review);
  await modal.querySelector('[data-coverage-item="material-240"] [data-coverage-edit="answer"]').click();
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'existing');
  assert.deepEqual(clone(final.review), before); assert.equal(h.calls.manifest, 0);
  h.opts.failSave = true;
  const input = currentCard(modal).querySelector('textarea'); input.value = 'Correzione da conservare.'; input.oninput();
  await currentCard(modal).querySelector('[data-edit-save]').click();
  await modal.querySelector('[data-coverage-item="material-241"] [data-coverage-edit="answer"]').click();
  assert.match(modal.querySelector('#mrv-status').textContent, /Disco non disponibile/);
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'existing');
  h.opts.failSave = false; await modal.querySelector('#mrv-save-retry').click(); await tick();
  await modal.querySelector('[data-coverage-item="material-241"] [data-coverage-edit="answer"]').click();
  assert.equal(final.review.initial.issues.length, 7, 'retrying the save does not duplicate the decision, and opening another field adds no issue');
});

test('manual corrections for two residuals with identical text never share a decision group', () => {
  const h = runtime(), m = finalManifest([{ id: 'a', kind: 'flashcard', answer: 'Uguale' }, { id: 'b', kind: 'flashcard', answer: 'Uguale' }]);
  let r = m.review.final.review;
  for (const id of ['a', 'b']) r = Core.addIssue(r, { origin: 'teacher', problem: 'Modifica del docente: Risposta', target: { kind: 'item', id, field: 'answer' } });
  assert.equal(h.R.groupIssues(r.initial.issues).length, 2);
});

test('G2 rejects invalid MC keys even when teacher keeps the proposal; explicit exclusion succeeds', async () => {
  const items = [{ id: 'q', kind: 'mc', question: 'Chi?', options: ['Germania', 'Svizzera'], correctIndex: 8 }];
  const report = Material.validate(items), m = finalManifest(items, report.issues), h = runtime();
  for (const i of m.review.final.review.initial.issues) m.review.final.review = Core.setDecision(m.review.final.review, i.id, 'reject');
  await assert.rejects(h.R.approve('/vault', m, { final: true }), /Correggi o escludi/);
  assert.equal(h.calls.manifest, 0);
  m.review.final.review = Core.addIssue(m.review.final.review, { id: 'exclude', target: { kind: 'item', id: 'q', field: '$item' }, after: null });
  m.review.final.review = Core.setDecision(m.review.final.review, 'exclude', 'accept');
  await h.R.approve('/vault', m, { final: true });
  assert.equal(m.review.final.stage, 'approved'); assert.equal(m.review.final.items.length, 0);
});

test('G2 compares item readback from pipeline.json and does not approve damaged saved data', async () => {
  const items = [{ id: 'f', kind: 'flashcard', question: 'Chi?', answer: 'Germania.' }];
  const h = runtime({ readback: m => { m.review.final.items[0].answer = 'Svizzera.'; return m; } });
  const m = finalManifest(items);
  await assert.rejects(h.R.approve('/vault', m, { final: true }), /persisted_revision_mismatch/);
  assert.equal(h.saved.manifest.review.final.review.initial.status, 'applying');
});

test('dialog renders human link labels, original quote and expandable page context without JSON', () => {
  const h = runtime(), m = manifest(initial({ checkStatus: 'completed', linkTolti: [{ source: 'a', target: 'b', rel: 'richiede',
    problema: 'Nesso da discutere.', evidenze: [{ source: 'Libro.pdf', page: 4, text: 'dopo.' }] }] }));
  const dialog = h.R.open('/vault', m);
  assert.match(h.dom.text(), /Germania → richiede → Svizzera/);
  assert.match(h.dom.text(), /Pagina 4/); assert.match(h.dom.text(), /Leggi il contesto/);
  assert.doesNotMatch(h.dom.text(), /"source"|"target"|"verbatim"|\{\s*"/);
  assert.equal(dialog.getAttribute('role'), 'dialog');
  assert.equal(h.dom.document.activeElement.id, 'mrv-title');
});

test('only exact duplicate issues group, with all precise targets preserved', () => {
  const h = runtime();
  const base = { target: { kind: 'node', id: 'a', field: 'desc' }, before: 'Prima.', after: 'Dopo.', problem: 'Uguale', evidence: 'prova', hasProposal: true };
  const groups = h.R.groupIssues([{ ...base, id: '1' }, { ...base, id: '2', target: { ...base.target, id: 'b' } }, { ...base, id: '3', evidence: 'diversa' }]);
  assert.equal(groups.length, 2); assert.equal(groups[0].length, 2);
  assert.equal(groups[0][1].target.id, 'b');
});

test('MC alternatives use separate fields and preserve commas, arrays and decision undo', async () => {
  const items = [{ id: 'q', kind: 'mc', question: 'Chi?', options: ['Germania, nel 1940', 'Svizzera'], correctIndex: 0 }];
  const issue = { id: 'options', target: { kind: 'item', id: 'q', field: 'options' }, after: ['Germania', 'Svizzera'], problem: 'Alternative da rivedere.' };
  const m = finalManifest(items, [issue]), h = runtime(), modal = h.R.open('/vault', m, { final: true });
  const buttons = modal.querySelectorAll('[data-actions] button');
  await buttons.find(b => b.textContent === 'Modifica il testo').click();
  const fields = modal.querySelectorAll('[data-editor] textarea');
  assert.equal(fields.length, 2); assert.equal(fields[0].value, 'Germania, nel 1940');
  fields[0].value = 'Germania, prima della guerra'; fields[0].oninput(); await tick();
  await currentCard(modal).querySelector('[data-edit-save]').click();
  assert.deepEqual(clone(m.review.final.review.initial.decisions.options.text), ['Germania, prima della guerra', 'Svizzera']);
  await modal.querySelector('[data-review-filter=decided]').click();
  await currentCard(modal).querySelector('[data-review-choice=pending]').click(); await tick();
  assert.equal(m.review.final.review.initial.decisions.options.choice, 'pending');
  assert.equal(m.review.final.items[0].options[0], 'Germania, nel 1940');
});

test('save failure keeps dialog open, enables retry and freezes every action during confirmation', async () => {
  const h = runtime({ failSave: true }), m = manifest(), modal = h.R.open('/vault', m);
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Applica la proposta').click(); await tick();
  assert.equal(modal.querySelector('#mrv-save-retry').hidden, false);
  await modal.querySelector('#mrv-later').click(); assert.ok(h.dom.document.getElementById('mappai-teacher-review'));
  h.opts.failSave = false; await modal.querySelector('#mrv-save-retry').click(); await tick();
  assert.equal(modal.querySelector('#mrv-save-retry').hidden, true);
  let release; h.window.electronAPI.saveVault = async args => { h.saved.map = clone(args.mapData); await new Promise(r => { release = r; }); return { success: true }; };
  const proceed = modal.querySelector('#mrv-continue').click();
  for (let i = 0; i < 10 && !release; i++) await Promise.resolve();
  assert.equal(modal.getAttribute('aria-busy'), 'true');
  assert.ok(modal.querySelectorAll('button,input,textarea,select').every(e => e.disabled));
  release(); await proceed;
  assert.equal(h.dom.document.getElementById('mappai-teacher-review'), null);
  assert.equal(h.dom.document.activeElement.id, 'previous');
});

test('openCurrent chooses G2, including completed delivery history, without regenerating materials', async () => {
  const h = runtime(), m = finalManifest([{ id: 'f', kind: 'flashcard', question: 'Chi?', answer: 'Germania.' }]);
  h.st._pipelineManifest = m;
  await h.R.openCurrent(); assert.equal(h.dom.document.getElementById('mrv-title').textContent, 'Rivedi i materiali');
  const done = runtime(), approved = Core.beginApproval(m.review.final.review, { items: m.review.final.items }, { sources: SOURCES });
  m.review.final.review = Core.completeApproval(approved.review, approved.revision);
  m.review.final.stage = 'done'; done.st._pipelineManifest = m;
  await done.R.openCurrent();
  assert.equal(done.dom.document.getElementById('mrv-title').textContent, 'Rivedi i materiali');
  const button = done.dom.document.getElementById('mrv-continue'); assert.equal(button.textContent, 'Chiudi');
  await button.click(); assert.equal(done.calls.pipeline, 0); assert.equal(done.calls.map, 0);
});

test('causal cards show the complete relationship and a no-proposal warning; keeping it reports no text correction', async () => {
  const item = { id: 'relation', kind: 'causal', question: 'Il metallo era stato sottratto', text: 'quindi', answer: 'era frutto di rapina' };
  const m = finalManifest([item], [{ id: 'causal-issue', target: { kind: 'item', id: item.id, field: 'answer' },
    problem: 'La relazione ripete il significato della premessa.' }]);
  const h = runtime(), before = clone(m), modal = h.R.open('/vault', m, { final: true });
  assert.match(modal.querySelector('[data-relation]').textContent, /Il metallo era stato sottratto → quindi → era frutto di rapina/);
  assert.doesNotMatch(h.dom.text(), /Domanda:/);
  assert.match(modal.querySelector('[data-no-proposal]').textContent, /non propone una correzione pronta/);
  assert.ok(!modal.querySelectorAll('[data-actions] button').some(b => /Applica/.test(b.textContent)));
  assert.deepEqual(m, before, 'rendering is read-only');
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Mantieni il testo senza modifiche').click();
  assert.match(modal.querySelector('#mrv-decision-summary').textContent, /Modifiche manuali: 0 · Senza modifiche: 1/);
  assert.equal(m.review.final.review.initial.decisions['causal-issue'].choice, 'reject');
  assert.deepEqual(m.review.final.items, [item]);
  await modal.querySelector('[data-review-filter="decided"]').click();
  assert.match(modal.querySelector('[data-choice]').textContent, /Testo mantenuto senza modifiche/);
});

test('a proposal on one part of a relationship is compared word by word on the whole relationship', async () => {
  const item = { id: 'hydraulic', kind: 'causal', step: 'D', question: 'L’acqua scorre nel tubo.', text: 'causa', answer: 'la corrente nel circuito.', citations: [] };
  const m = finalManifest([item], [{ id: 'connector', target: { kind: 'item', id: item.id, field: 'text' }, after: 'è analogo a', problem: 'Rivedi il rapporto.' }]);
  const modal = runtime().R.open('/vault', m, { final: true }), card = currentCard(modal);
  assert.deepEqual(card.querySelectorAll('.mrv-proposal ins').map(x => x.textContent), ['è analogo a']);
  assert.deepEqual(card.querySelectorAll('.mrv-before del').map(x => x.textContent), ['causa']);
});

test('relationship editing previews every chosen field, offers the gerund fix explicitly and persists the composed result', async () => {
  const item = { id: 'hydraulic', kind: 'causal', step: 'D', question: "L’acqua scorre con facendo girare una turbina [[src-water]].", text: 'causa',
    answer: 'il movimento nel circuito elettrico.', citations: [{ id: 'src-water', idx: 1, title: 'Modello idraulico', text: 'Estratto originale.' }] };
  const m = finalManifest([item], [
    { id: 'wording', target: { kind: 'item', id: item.id, field: 'question' }, problem: 'Rileggi la frase.' },
    { id: 'connector', target: { kind: 'item', id: item.id, field: 'text' }, after: 'è analogo a', problem: 'Rivedi il rapporto.' }
  ]);
  m.review.final.review = Core.setDecision(m.review.final.review, 'connector', 'accept');
  const h = runtime(), untouched = clone(m), modal = h.R.open('/vault', m, { final: true });
  let card = currentCard(modal);
  assert.match(card.querySelector('[data-relation-sentence]').textContent, /con facendo.*è analogo a.*circuito elettrico/);
  assert.doesNotMatch(card.querySelector('[data-relation-sentence]').textContent, /src-water|→/);
  assert.ok(card.querySelector('[data-relation-hint]'));
  assert.deepEqual(m, untouched, 'the hint never edits the teacher’s text on its own');
  // l'etichetta dice quale versione si modifica (17/9/26): il nesso accettato è una proposta, le altre parti l'originale
  assert.match(card.querySelector('[data-relation-edit=text]').textContent, /^Modifica proposta · /);
  assert.match(card.querySelector('[data-relation-edit=question]').textContent, /^Modifica originale · /);
  assert.match(card.querySelector('[data-relation-edit=answer]').textContent, /^Modifica originale · /);
  await card.querySelector('[data-relation-edit=question]').click();
  card = currentCard(modal);
  const input = card.querySelector('[data-review-field=question]');
  assert.equal(h.dom.document.activeElement, input);
  await card.querySelector('[data-relation-suggestion=question]').click(); await tick();
  assert.equal(card.querySelector('[data-review-field=question]'), input, 'typing and suggestions retain the actual editor');
  assert.equal(h.dom.document.activeElement, input);
  assert.equal(card.querySelector('[data-relation-hint]'), null);
  assert.match(card.querySelector('[data-relation-sentence]').textContent, /scorre facendo.*è analogo a/);
  assert.equal(card.querySelector('[data-relation-part=question]').getAttribute('data-changed'), 'true');
  assert.match(card.querySelector('[data-relation-edit=question]').textContent, /^Modifica proposta · /, 'once edited, the part is a proposal');
  await card.querySelector('[data-edit-save]').click();
  assert.equal(m.review.final.review.initial.decisions.wording.text, item.question.replace('con facendo', 'facendo'));
  assert.deepEqual(m.review.final.items, [item], 'approval, not an inline suggestion, updates the published draft');

  await modal.querySelector('[data-review-filter=decided]').click();
  card = currentCard(modal);
  await card.querySelector('[data-relation-edit=answer]').click();
  card = currentCard(modal);
  const second = card.querySelector('[data-review-field=answer]');
  second.value = 'ciò che accade nel circuito elettrico.'; second.oninput(); await tick();
  assert.match(card.querySelector('[data-relation-sentence]').textContent, /scorre facendo.*è analogo a ciò che accade/);
  await card.querySelector('[data-edit-save]').click();
  await modal.querySelector('#mrv-later').click();
  const reopened = h.R.open('/vault', h.saved.manifest, { final: true });
  await reopened.querySelector('[data-review-filter=decided]').click();
  assert.match(currentCard(reopened).querySelector('[data-relation-sentence]').textContent, /scorre facendo.*è analogo a ciò che accade/);
  await reopened.querySelector('#mrv-continue').click();
  assert.equal(h.saved.manifest.review.final.items[0].question, item.question.replace('con facendo', 'facendo'));
  assert.equal(h.saved.manifest.review.final.items[0].text, 'è analogo a');
  assert.equal(h.saved.manifest.review.final.items[0].answer, second.value);
  assert.deepEqual(h.saved.manifest.review.final.items[0].citations, item.citations);
});

test('whole-relationship editors follow sentence order, escape live text and handle a residue across field boundaries', async () => {
  const item = { id: 'whole', kind: 'causal', question: 'L’acqua scorre con', text: 'facendo', answer: 'girare una turbina.' };
  const m = finalManifest([item], [{ id: 'whole-issue', target: { kind: 'item', id: item.id, field: '$item' }, problem: 'Rileggi la relazione.' }]);
  const h = runtime(), modal = h.R.open('/vault', m, { final: true });
  await currentCard(modal).querySelector('[data-review-choice=manual]').click();
  const card = currentCard(modal), inputs = card.querySelectorAll('[data-review-field]');
  assert.deepEqual(inputs.map(el => el.getAttribute('data-review-field')), ['question', 'text', 'answer']);
  assert.ok(card.querySelector('[data-relation-hint]'));
  assert.equal(card.querySelector('[data-relation-suggestion]'), null, 'no partial fix can silently cross two fields');
  inputs[0].value = 'L’acqua scorre <img src=x onerror=alert(1)>'; inputs[0].oninput(); await tick();
  assert.equal(card.querySelector('[data-relation-preview] img'), null);
  assert.match(card.querySelector('[data-relation-sentence]').textContent, /<img/);
  assert.equal(card.querySelector('[data-relation-hint]'), null);
  await card.querySelector('[data-relation-edit=answer]').click();
  assert.equal(h.dom.document.activeElement, inputs[2]);
  assert.deepEqual(m.review.final.items, [item]);
});

test('relationship previews do not group different sentences or claim a result for conflicts and exclusions', async () => {
  const items = ['one', 'two'].map((id, n) => ({ id, kind: 'causal', question: 'Premessa comune', text: 'quindi', answer: 'Risultato ' + n }));
  const issues = items.map(i => ({ id: 'fix-' + i.id, target: { kind: 'item', id: i.id, field: 'question' }, after: 'Premessa corretta',
    problem: 'Stesso problema', evidence: [{ text: 'dopo.', quotationMatched: true, verifiedAgainst: 'archived-source-text' }] }));
  const m = finalManifest(items, issues), h = runtime(), modal = h.R.open('/vault', m, { final: true });
  assert.equal(modal.querySelectorAll('[data-review-card]').length, 2);
  await currentCard(modal).querySelector('[data-review-choice=manual]').click();
  const input = currentCard(modal).querySelector('textarea'); input.value = 'Premessa scelta'; input.oninput(); await tick();
  await currentCard(modal).querySelector('[data-edit-save]').click();
  assert.equal(m.review.final.review.initial.decisions['fix-two']?.choice || 'pending', 'pending');
  await modal.querySelector('#mrv-later').click();
  m.review.final.review = Core.addIssue(m.review.final.review, { id: 'overlap', target: { kind: 'item', id: 'one', field: 'question' }, after: 'Altra scelta' });
  m.review.final.review = Core.setDecision(m.review.final.review, 'overlap', 'accept');
  const conflict = h.R.open('/vault', m, { final: true });
  await conflict.querySelector('[data-review-filter=all]').click();
  await conflict.querySelector('[data-review-issue=fix-one]').click();
  assert.match(currentCard(conflict).querySelector('[data-relation-preview]').textContent, /decisioni in conflitto/);
  assert.equal(currentCard(conflict).querySelector('[data-relation-sentence]'), null);
  await conflict.querySelector('#mrv-later').click();
  const excluded = finalManifest([items[0]], [{ id: 'exclude', target: { kind: 'item', id: 'one', field: '$item' }, after: null, hasProposal: true }]);
  excluded.review.final.review = Core.setDecision(excluded.review.final.review, 'exclude', 'accept');
  const last = h.R.open('/vault', excluded, { final: true });
  await last.querySelector('[data-review-filter=decided]').click();
  assert.match(currentCard(last).querySelector('[data-relation-preview]').textContent, /esclusa dai materiali/);
  assert.equal(currentCard(last).querySelector('[data-relation-edit]'), null);
});

test('review references and editor use reversible source labels, leaving original IDs and decisions intact', async () => {
  const item = { id: 'intro', kind: 'synthesis', text: 'Il governo agì [[src-one]]. Un altro fatto [[src-missing]].',
    citations: [{ id: 'src-one', idx: 1, title: 'Libro.pdf', page: 4, text: 'Fonte originale.' }] };
  const m = finalManifest([item], [{ id: 'intro-issue', target: { kind: 'item', id: item.id, field: 'text' }, problem: 'Soggetto da correggere.' }]);
  const h = runtime(), before = clone(m), modal = h.R.open('/vault', m, { final: true });
  assert.doesNotMatch(h.dom.text(), /\[\[src-/);
  assert.match(h.dom.text(), /Fonte 1/); assert.match(h.dom.text(), /Fonte da verificare/);
  assert.match(modal.querySelector('[data-references]').textContent, /Pagina 4/);
  assert.deepEqual(m, before); assert.equal(h.calls.manifest, 0);
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Modifica il testo').click();
  const input = modal.querySelector('[data-editor] textarea');
  assert.doesNotMatch(input.value, /src-/);
  input.value = input.value.replace('Il governo', 'L’Assemblea'); input.oninput(); await tick();
  await currentCard(modal).querySelector('[data-edit-save]').click();
  assert.equal(m.review.final.review.initial.decisions['intro-issue'].text,
    'L’Assemblea agì [[src-one]]. Un altro fatto [[src-missing]].');
  assert.deepEqual(m.review.final.items, [item], 'drafts change only on final approval');
  assert.match(modal.querySelector('#mrv-decision-summary').textContent, /Modifiche manuali: 1 · Senza modifiche: 0/);
});

test('a long-text correction shows a compact passage and its added source, while approval saves the full text and registry', async () => {
  const filler = 'Questo paragrafo rimane invariato e dà contesto al tema. '.repeat(12);
  const item = { id: 'synthesis-0', kind: 'synthesis', text: filler + '\nLa fonte non dice nulla.\n' + 'a'.repeat(92) + ' [[src-marker-at-cut]] ' + filler,
    citations: [{ id: 'src-marker-at-cut', idx: 1, title: 'Libro.pdf', page: 1, text: 'prima' }] };
  const G = require('../public/js/mappai-grounding-core');
  const entry = G.buildInput({}, [], SOURCES).sourcesArr[0];
  const after = item.text.replace('La fonte non dice nulla.', 'La fonte dice: dopo. [[' + entry.id + ']]');
  const m = finalManifest([item], [{ id: 'with-source', target: { kind: 'item', id: item.id, field: 'text' }, before: item.text,
    after, hasProposal: true, citationAdditions: [entry], problem: 'La fonte contiene il passaggio.' }]);
  const h = runtime(), modal = h.R.open('/vault', m, { final: true });
  assert.ok(modal.querySelector('[data-full-change]'));
  assert.equal(modal.querySelector('[data-full-change]').getAttribute('open'), undefined);
  assert.ok(modal.querySelector('[data-added-sources]'));
  assert.match(modal.querySelector('[data-references]').textContent, /Libro.pdf/);
  assert.doesNotMatch(h.dom.text(), /\[\[src-/);
  assert.deepEqual(m.review.final.items, [item]);
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Applica la proposta').click(); await tick();
  await modal.querySelector('#mrv-continue').click();
  assert.equal(m.review.final.stage, 'approved');
  assert.equal(m.review.final.items[0].text, after);
  assert.equal(m.review.final.items[0].citations.find(s => s.id === entry.id).text, entry.text);
  assert.ok(h.saved.manifest.review.final.items[0].citations.some(s => s.id === entry.id));
});

test('manual review requires an explicit checkbox and keyboard navigation stays in the dialog', async () => {
  const h = runtime(), m = manifest(initial({ checkStatus: 'unavailable', issues: [] })), modal = h.R.open('/vault', m);
  assert.equal(modal.querySelector('#mrv-continue').hidden, true);
  await modal.querySelector('#mrv-continue').click(); assert.equal(h.calls.map, 0);
  const confirmation = modal.querySelector('#mrv-manual-confirm'); assert.equal(confirmation.checked, false);
  const manualOption = modal.querySelector('#mrv-manual-option');
  assert.equal(manualOption.getAttribute('open'), undefined);
  let prevented = false;
  modal.listeners.keydown({ key: 'Tab', shiftKey: true, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true); assert.notEqual(h.dom.document.activeElement.id, 'previous');
  manualOption.setAttribute('open', ''); confirmation.checked = true; confirmation.onchange();
  assert.equal(modal.querySelector('#mrv-continue').hidden, false);
  await modal.querySelector('#mrv-continue').click();
  assert.equal(m.review.initial.manualReview, true); assert.equal(m.review.initial.status, 'approved');
});

test('standalone new generation redirects reviewed projects without starting AI or a pipeline', async () => {
  const h = runtime(); assert.equal(await h.R.requireStandalone(), true, 'legacy remains compatible');
  const r = initial({ checkStatus: 'completed', issues: [] }), begun = Core.beginApproval(r, DB);
  h.st._pipelineManifest = manifest(Core.completeApproval(begun.review, begun.revision));
  let opened = 0, message = '';
  h.window.MappAIPipeline.openModal = opts => { assert.equal(opts.fromApproved, true); opened++; };
  h.window.showToast = text => { message = text; };
  assert.equal(await h.R.requireStandalone(), false);
  assert.equal(opened, 1); assert.match(message, /Genera materiali/); assert.equal(h.calls.pipeline, 0);
  const final = finalManifest([{ id: 'f', kind: 'flashcard', question: 'Chi?', answer: 'Germania.' }]);
  h.st._pipelineManifest = final;
  assert.equal(await h.R.requireStandalone(), false);
  assert.equal(h.dom.document.getElementById('mrv-title').textContent, 'Rivedi i materiali');
  assert.equal(h.calls.pipeline, 0);
});

test('G2 exclusion button resolves all questions for the exact item and publishes no invalid exercise', async () => {
  const items = [{ id: 'q', kind: 'mc', question: 'Chi?', options: ['Germania', 'Svizzera'], correctIndex: 9 }];
  const m = finalManifest(items, Material.validate(items).issues), h = runtime();
  const modal = h.R.open('/vault', m, { final: true });
  await modal.querySelectorAll('button').find(b => b.textContent === 'Escludi dagli esercizi').click(); await tick();
  await modal.querySelector('#mrv-continue').click();
  assert.equal(m.review.final.stage, 'approved'); assert.equal(m.review.final.items.length, 0);
});

test('double confirmation starts continuation only once', async () => {
  const h = runtime(), m = manifest(Core.setDecision(initial(), 'issue', 'accept')); let continued = 0;
  const modal = h.R.open('/vault', m, { onContinue: async () => { continued++; } });
  const next = modal.querySelector('#mrv-continue');
  const first = next.onclick(); const second = next.onclick();
  await Promise.all([first, second]); await next.onclick();
  assert.equal(continued, 1); assert.equal(h.calls.map, 1);
});

test('review defaults to actionable decisions, retains history and keeps manual confirmation available as an optional disclosure', async () => {
  const report = { checkStatus: 'incomplete', issues: [
    { id: 'pending', target: { kind: 'node', id: 'a', field: 'desc' }, after: 'Dopo.', problem: 'Ancora da decidere' },
    { id: 'accepted', target: { kind: 'node', id: 'b', field: 'desc' }, after: 'Corretto.', problem: 'Proposta già accettata' },
    { id: 'rejected', target: { kind: 'link', source: 'a', target: 'b', field: 'rel' }, after: 'include', problem: 'Proposta già respinta' }
  ] };
  const r = Core.setDecision(Core.setDecision(initial(report), 'accepted', 'accept'), 'rejected', 'reject');
  const h = runtime(), m = manifest(r), modal = h.R.open('/vault', m), before = clone(m.review);
  const filter = key => modal.querySelector('[data-review-filter="' + key + '"]');
  assert.equal(filter('pending').getAttribute('aria-pressed'), 'true');
  assert.equal(modal.querySelectorAll('.pm-section').length, 1);
  assert.match(h.dom.text(), /Ancora da decidere/); assert.doesNotMatch(h.dom.text(), /Proposta già accettata|Proposta già respinta/);
  assert.ok(modal.querySelector('#mrv-manual-confirm'));
  assert.equal(modal.querySelector('#mrv-manual-option').getAttribute('open'), undefined);
  assert.equal(modal.querySelector('#mrv-other-nodes').getAttribute('open'), undefined, 'unreported nodes stay behind a closed disclosure');
  await filter('decided').click();
  assert.equal(modal.querySelectorAll('.pm-section').length, 2);
  await filter('all').click();
  assert.equal(modal.querySelectorAll('.pm-section').length, 3);
  assert.deepEqual(clone(m.review), before); assert.equal(h.calls.manifest, 0, 'a view filter never changes or saves decisions');
});

test('saved decision leaves the actionable view; undo in history restores it and filtering never loses a manual draft', async () => {
  const h = runtime(), m = manifest(), modal = h.R.open('/vault', m);
  const filter = key => modal.querySelector('[data-review-filter="' + key + '"]');
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Applica la proposta').click();
  assert.equal(modal.querySelectorAll('.pm-section').length, 0);
  assert.match(filter('pending').textContent, /\(0\)/); assert.match(filter('decided').textContent, /\(1\)/);
  assert.ok(modal.querySelector('#mrv-filter-empty'));
  await filter('decided').click();
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Annulla decisione').click();
  assert.equal(modal.querySelectorAll('.pm-section').length, 0);
  await filter('pending').click();
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Modifica il testo').click();
  const input = modal.querySelector('[data-editor] textarea');
  input.value = 'Correzione del docente in corso.'; input.oninput(); await tick();
  assert.equal(h.dom.document.activeElement, input, 'typing does not remove or remount the active editor');
  await filter('decided').click();
  assert.equal(modal.querySelector('[data-editor] textarea').value, 'Correzione del docente in corso.');
  assert.equal(h.saved.manifest.review.initial.decisions.issue.text, 'Correzione del docente in corso.');
});

test('filtering precedes duplicate grouping so a new decision cannot overwrite a previously resolved twin', async () => {
  const report = { checkStatus: 'completed', issues: ['first', 'second'].map(id => ({ id,
    target: { kind: 'node', id: 'a', field: 'desc' }, after: 'Dopo.', problem: 'Stessa segnalazione' })) };
  const m = manifest(Core.setDecision(initial(report), 'first', 'reject')), h = runtime();
  const modal = h.R.open('/vault', m);
  assert.equal(modal.querySelectorAll('.pm-section').length, 1);
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Applica la proposta').click();
  assert.equal(m.review.initial.decisions.first.choice, 'reject');
  assert.equal(m.review.initial.decisions.second.choice, 'accept');
});

test('saved manual correction and two accepted rewrites expose the conflict and can be resolved without losing the teacher text', async () => {
  const issues = [
    { id: 'teacher', target: { kind: 'node', id: 'a', field: 'desc' }, problem: 'Il testo nega un fatto presente nella fonte.', quote: 'dopo.', evidence: [{ text: 'dopo.' }] },
    ...['variant-a', 'variant-b'].map((id, n) => ({ id, target: { kind: 'node', id: 'a', field: 'desc' },
      after: 'Versione proposta ' + n + '.', problem: 'Riformulazione della stessa segnalazione.', quote: 'dopo.', evidence: [{ text: 'dopo.' }] }))
  ];
  let review = initial({ checkStatus: 'incomplete', issues });
  review = Core.setDecision(review, 'teacher', 'manual', { text: 'Il testo scritto dal docente.' });
  for (const id of ['variant-a', 'variant-b']) review = Core.setDecision(review, id, 'accept');
  const m = manifest(review), h = runtime(), modal = h.R.open('/vault', m);
  assert.match(modal.querySelector('#mrv-filter-count').textContent, /2 da rivedere/);
  assert.match(modal.querySelector('[data-decision-conflict]').textContent, /Il testo scritto dal docente/);
  assert.match(modal.querySelector('.mrv-queue-state').textContent, /Scelte in conflitto/);
  assert.equal(modal.querySelector('[data-review-choice="accept"]').disabled, true, 'clicking the same accepted proposal cannot solve the conflict');
  modal.querySelector('#mrv-search').value = 'Riformulazione';
  await modal.querySelector('#mrv-search').oninput();
  await modal.querySelector('[data-decision-conflict] button').click();
  assert.equal(modal.querySelector('#mrv-search').value, '', 'opening the other choice clears filters that would hide it');
  assert.match(modal.querySelector('#mrv-current-title').textContent, /Il testo nega/);
  await modal.querySelector('[data-review-filter="pending"]').click();
  for (let n = 0; n < 2; n++) {
    const keep = modal.querySelectorAll('[data-review-choice="reject"]').find(b => b.textContent === 'Conserva l’altra scelta');
    assert.ok(keep); await keep.click(); await tick();
  }
  assert.match(modal.querySelector('#mrv-filter-count').textContent, /0 da rivedere/);
  assert.equal(m.review.initial.decisions.teacher.text, 'Il testo scritto dal docente.');
  assert.equal(Core.preview(m.review, h.st.db).db.nodes[0].desc, 'Il testo scritto dal docente.');
  assert.equal(m.review.initial.checkStatus, 'incomplete', 'resolving choices does not fabricate model coverage');
  assert.deepEqual(h.st.db, DB, 'nothing is applied to the map before final confirmation');
  const reload = runtime(), reopened = reload.R.open('/vault', clone(h.saved.manifest));
  assert.match(reopened.querySelector('#mrv-filter-count').textContent, /0 da rivedere/);
});

test('already chosen actions remain actionable when structurally invalid or conflicting', async () => {
  const items = [{ id: 'q', kind: 'mc', question: 'Chi?', options: ['Germania', 'Svizzera'], correctIndex: 9 }];
  const issue = { id: 'key', target: { kind: 'item', id: 'q', field: 'correctIndex' }, after: 0, problem: 'Chiave non valida' };
  const m = finalManifest(items, [issue]), h = runtime();
  m.review.final.review = Core.setDecision(m.review.final.review, 'key', 'reject');
  const modal = h.R.open('/vault', m, { final: true });
  assert.equal(modal.querySelectorAll('.pm-section').length, 1, 'rejecting a broken key cannot hide the blocker');
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Applica la proposta').click();
  assert.equal(modal.querySelectorAll('.pm-section').length, 0);
  const conflict = runtime(), conflicting = manifest(Core.setDecision(initial(), 'issue', 'manual', { text: '' }));
  const other = conflict.R.open('/vault', conflicting);
  assert.equal(other.querySelectorAll('.pm-section').length, 1, 'an invalid manual replacement still needs attention');
});

test('all decisions made retains a compact check warning and optional manual confirmation without reopening resolved issues', () => {
  const h = runtime(), m = manifest(Core.setDecision(initial({ checkStatus: 'incomplete', copertura: {
    nodiSaltati: [{ id: 'a', label: 'Germania', motivo: 'Fuori dal controllo' }],
    linkSaltati: [{ source: 'a', target: 'b', rel: 'richiede', motivo: 'Prova mancante' }]
  }, issues: [
    { id: 'done', target: { kind: 'node', id: 'a', field: 'desc' }, after: 'Dopo.', problem: 'Già decisa' }
  ] }), 'done', 'accept'));
  const before = clone(m), modal = h.R.open('/vault', m);
  assert.equal(modal.querySelectorAll('.pm-section').length, 0);
  assert.ok(modal.querySelector('#mrv-manual-confirm'));
  assert.match(h.dom.text(), /Tutte le segnalazioni hanno una decisione/);
  const unchecked = modal.querySelector('#mrv-unchecked');
  assert.match(unchecked.textContent, /2/);
  assert.match(unchecked.textContent, /Germania → richiede → Svizzera: Prova mancante/);
  assert.doesNotMatch(unchecked.textContent, /Fuori dal controllo/);
  assert.equal(unchecked.querySelectorAll('li').length, 1, 'il nesso residuo espone il motivo senza riaprire le decisioni');
  assert.equal(modal.querySelector('#mrv-manual-option').getAttribute('open'), undefined);
  assert.equal(modal.querySelector('#mrv-filters').hidden, false, 'existing resolved decisions remain accessible through the filters');
  assert.equal(m.review.initial.status, 'awaiting_review');
  assert.deepEqual(clone(m), before); assert.equal(h.calls.manifest, 0);
});

test('reading an unreported node does not create a decision or write to the project', async () => {
  const h = runtime(), m = manifest(initial({ checkStatus: 'completed', issues: [] }));
  const modal = h.R.open('/vault', m), box = modal.querySelector('#mrv-other-nodes');
  const selects = box.querySelectorAll('select'), nodeSelect = selects[1], field = selects[0];
  nodeSelect.value = 'b'; nodeSelect.onchange();
  assert.match(box.textContent, /Altro testo\./);
  field.value = 'label'; field.onchange();
  assert.equal(m.review.initial.issues.length, 0); assert.equal(h.calls.manifest, 0);
  await box.querySelector('#mrv-add-node').click(); await tick();
  assert.equal(m.review.initial.issues.length, 1); assert.equal(m.review.initial.issues[0].target.field, 'label');
  assert.match(modal.querySelector('[data-review-filter="pending"]').textContent, /\(1\)/);
});

function materialRetryFixture(opts = {}) {
  const h = runtime(opts), items = Array.from({ length: 105 }, (_, i) => ({ id: 'saved-' + i, kind: 'flashcard',
    question: 'Domanda salvata ' + i + '?', answer: 'Risposta salvata ' + i + '.' }));
  const issues = [0, 1, 2].map(i => ({ id: 'prior-' + i, target: { kind: 'item', id: items[i].id, field: 'answer' },
    after: 'Proposta precedente ' + i + '.', problem: 'Segnalazione precedente ' + i + '.' }));
  const m = finalManifest(items, issues);
  m.config.aiContext = { provider: 'google', model: 'saved-model' };
  m.review.final.review.initial.checkStatus = 'incomplete';
  m.review.final.review.initial.report = { checkStatus: 'incomplete', issues, coverage: { expectedIds: items.map(i => i.id),
    checkedIds: [], skipped: items.map(i => ({ id: i.id, reason: 'HTTP 400: schema non valido' })) },
    batches: [{ ids: items.slice(0, 12).map(i => i.id), status: 'incomplete', error: 'HTTP 400: schema non valido' }] };
  m.review.final.review = Core.setDecision(Core.setDecision(Core.setDecision(m.review.final.review,
    'prior-0', 'reject'), 'prior-1', 'accept'), 'prior-2', 'manual', { text: 'Rettifica conservata del docente.' });
  m.review.final.review.initial.previousReports = [{ checkStatus: 'unavailable', reason: 'Prima interruzione' }];
  m.review.drafts = { B: { sets: [{ id: 'saved-set', items: clone(items) }] } };
  h.st.db.studySets = [{ id: 'existing-set', items: [{ question: 'Attività precedente' }] }];
  h.st._pipelineManifest = m;
  h.st._reviewAIContext = { provider: 'infomaniak', model: 'caller-model' };
  h.st._generationSources = [{ title: 'Fonte estranea corrente', content: 'Contenuto di un altro contesto.' }];
  h.calls.material = 0; h.calls.generation = 0; h.calls.export = 0; h.calls.grounding = 0; h.calls.filePaths = [];
  const save = h.window.electronAPI.saveVaultFile;
  h.window.electronAPI.saveVaultFile = args => { h.calls.filePaths.push(args.relPath); return save(args); };
  const forbidden = name => async () => { h.calls.generation++; throw new Error('Generatore inatteso: ' + name); };
  ['generateDynamicQuiz', 'generateBranchSynthesisWithAI', 'executeJudgePass', 'fetchModelAPI'].forEach(name => { h.window[name] = forbidden(name); });
  h.window.MappAIMaterialDrafts = { flatten: forbidden('flatten') };
  h.window.electronAPI.htmlToPdf = async () => { h.calls.export++; throw new Error('Export inatteso'); };
  h.window.MappAIGroundingCore = { buildInput: (db, nodes, sources, review, options) => {
    h.calls.grounding++;
    assert.deepEqual(clone(db), h.st.db); assert.deepEqual(clone(nodes), h.st.db.nodes);
    assert.equal(review, m.review); assert.deepEqual(clone(sources), SOURCES);
    assert.equal(options.includeOriginalPages, true);
    return { material: 'Riferimento approvato e passaggi originali.', sourcesArr: [{ id: 'src-book', title: 'Libro.pdf', page: 4, text: 'dopo.' }] };
  } };
  h.materialCheck = async (checked, checkOpts) => {
    assert.deepEqual(clone(checked), items);
    assert.deepEqual(clone(h.st._reviewAIContext), m.config.aiContext);
    assert.deepEqual(clone(checkOpts.aiContext), m.config.aiContext);
    assert.equal(checkOpts.apiKey, 'mock-key'); assert.equal(checkOpts.review, m.review);
    assert.equal(checkOpts.material.sourcesArr[0].title, 'Libro.pdf');
    return { checkStatus: 'completed', coverage: { expectedIds: items.map(i => i.id), checkedIds: items.map(i => i.id), skipped: [] }, issues: [
      { id: 'fresh', target: { kind: 'item', id: items[3].id, field: 'answer' }, after: 'Nuova proposta.', problem: 'Da decidere dopo il nuovo controllo.' }
    ] };
  };
  h.window.MappAIMaterialReview = { ...Material, checkRemaining: async (...args) => {
    assert.equal(args[1].previousReport, h.m?.review.final.review.initial.report || m.review.final.review.initial.report);
    h.calls.material++; return h.materialCheck(...args);
  } };
  return Object.assign(h, { m, items });
}

test('G2 retry checks the 105 saved items once, preserving decisions, original sources and frozen model without generating or exporting', async () => {
  const h = materialRetryFixture(), old = h.m.review.final.review, beforeDb = clone(h.st.db), beforeItems = clone(h.m.review.final.items),
    beforeDrafts = clone(h.m.review.drafts), priorContext = h.st._reviewAIContext, priorSources = h.st._generationSources;
  const check = h.materialCheck;
  h.materialCheck = async (...args) => {
    const report = await check(...args);
    report.issues.push(...old.initial.issues.map(i => ({ ...clone(i), id: i.id + '-again', problem: 'Stessa proposta riformulata.' })));
    return report;
  };
  await h.R.retryMaterialJudge('/vault', h.m);
  const next = h.m.review.final.review;
  assert.equal(h.calls.material, 1); assert.equal(h.calls.grounding, 1);
  assert.deepEqual(clone(next.initial.decisions), old.initial.decisions);
  old.initial.issues.forEach(issue => assert.deepEqual(clone(next.initial.issues.find(i => i.id === issue.id)), issue));
  assert.ok(next.initial.issues.some(i => i.id === 'fresh'));
  assert.equal(next.initial.issues.length, old.initial.issues.length + 1, 'only the genuinely new finding needs a decision');
  assert.deepEqual(clone(next.initial.previousReports), old.initial.previousReports.concat([old.initial.report]));
  assert.equal(next.initial.checkStatus, 'completed'); assert.equal(next.initial.status, 'awaiting_review');
  assert.equal(h.m.review.final.stage, 'awaiting_review');
  assert.deepEqual(clone(h.st.db), beforeDb); assert.deepEqual(clone(h.m.review.final.items), beforeItems);
  assert.deepEqual(clone(h.m.review.drafts), beforeDrafts);
  assert.equal(h.st._reviewAIContext, priorContext); assert.equal(h.st._generationSources, priorSources);
  assert.equal(h.calls.map, 0); assert.equal(h.calls.pipeline, 0); assert.equal(h.calls.generation, 0); assert.equal(h.calls.export, 0);
  assert.deepEqual(h.calls.filePaths, ['pipeline.json']);
  assert.equal(h.saved.manifest.review.final.review.initial.checkStatus, 'completed');
});

test('G2 retry refuses a different project, an edited approved map, altered saved items or a final stage already applying', async () => {
  for (const fault of ['project', 'map', 'items', 'stage']) {
    const h = materialRetryFixture(), old = h.m.review.final.review;
    if (fault === 'project') h.st.activeVaultPath = '/other';
    if (fault === 'map') h.st.db.nodes[0].desc = 'Modifica dopo approvazione';
    if (fault === 'items') h.m.review.final.items[0].answer = 'Modifica non rivista';
    if (fault === 'stage') h.m.review.final.stage = 'applying';
    await assert.rejects(h.R.retryMaterialJudge('/vault', h.m), undefined, fault);
    assert.equal(h.calls.material, 0, fault); assert.equal(h.calls.manifest, 0, fault);
    assert.equal(h.m.review.final.review, old, fault);
  }
});

test('G2 retry discards a late result after project, map or item mutation and always restores caller model context', async () => {
  for (const fault of ['project', 'map', 'items', 'provider-error']) {
    const h = materialRetryFixture(), old = h.m.review.final.review, context = h.st._reviewAIContext;
    let resolveCheck, started;
    const entered = new Promise(resolve => { started = resolve; });
    h.materialCheck = async () => { started(); return new Promise((resolve, reject) => { resolveCheck = fault === 'provider-error' ? reject : resolve; }); };
    const pending = h.R.retryMaterialJudge('/vault', h.m);
    await entered;
    if (fault === 'project') h.st.activeVaultPath = '/other';
    if (fault === 'map') h.st.db.links[0].rel = 'Modificato durante il controllo';
    if (fault === 'items') h.m.review.final.items[0].answer = 'Modificata durante il controllo';
    resolveCheck(fault === 'provider-error' ? new Error('Provider HTTP 400') : { checkStatus: 'completed', issues: [] });
    await assert.rejects(pending, undefined, fault);
    assert.equal(h.calls.material, 1); assert.equal(h.calls.manifest, 0, fault);
    assert.equal(h.m.review.final.review, old, fault); assert.equal(h.st._reviewAIContext, context, fault);
  }
});

test('G2 retry rolls back a failed manifest write and remains retryable without losing decisions or duplicating report history', async () => {
  const h = materialRetryFixture({ failSave: true }), old = h.m.review.final.review, context = h.st._reviewAIContext;
  await assert.rejects(h.R.retryMaterialJudge('/vault', h.m), /Disco non disponibile/);
  assert.equal(h.m.review.final.review, old); assert.equal(h.m.review.final.stage, 'awaiting_review');
  assert.equal(old.initial.checkStatus, 'incomplete'); assert.equal(h.st._reviewAIContext, context);
  h.opts.failSave = false;
  await h.R.retryMaterialJudge('/vault', h.m);
  assert.equal(h.calls.material, 2); assert.equal(h.calls.map, 0); assert.equal(h.calls.generation, 0);
  assert.equal(h.m.review.final.review.initial.previousReports.length, 2);
  assert.deepEqual(clone(h.m.review.final.review.initial.decisions), old.initial.decisions);
  assert.equal(h.saved.manifest.review.final.review.initial.checkStatus, 'completed');
});

test('G2 incomplete review offers material retry, freezes controls and retains a retryable dialog after provider failure', async () => {
  const h = materialRetryFixture(), modal = h.R.open('/vault', h.m, { final: true });
  const retry = modal.querySelector('#mrv-retry-judge');
  assert.ok(retry); assert.equal(retry.textContent, 'Riprova il controllo automatico dei residui');
  retry.focus();
  const confirmation = modal.querySelector('#mrv-manual-confirm');
  assert.ok(confirmation); assert.equal(modal.querySelector('#mrv-continue').hidden, true);
  modal.querySelector('#mrv-manual-option').setAttribute('open', '');
  confirmation.checked = true; confirmation.onchange();
  assert.equal(modal.querySelector('#mrv-continue').hidden, false);
  confirmation.checked = false; confirmation.onchange();
  assert.equal(modal.querySelector('#mrv-continue').hidden, true);
  let failCheck, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  h.materialCheck = async () => { entered(); return new Promise((_, reject) => { failCheck = reject; }); };
  const pending = retry.click(); await ready;
  assert.equal(modal.getAttribute('aria-busy'), 'true');
  assert.ok(modal.querySelectorAll('button,input,textarea,select').every(el => el.disabled));
  failCheck(new Error('HTTP 400: schema non valido')); await pending;
  assert.ok(h.dom.document.getElementById('mappai-teacher-review'));
  assert.match(modal.querySelector('#mrv-status').textContent, /HTTP 400/);
  assert.equal(retry.disabled, false); assert.equal(modal.getAttribute('aria-busy'), 'false');
  h.materialCheck = async () => ({ checkStatus: 'completed', issues: [] });
  await retry.click();
  assert.equal(h.m.review.final.review.initial.checkStatus, 'completed');
  assert.equal(modal.querySelector('#mrv-retry-judge'), null);
  assert.equal(modal.querySelector('#mrv-manual-confirm'), null);
  assert.equal(modal.querySelector('#mrv-continue').hidden, false);
  assert.equal(h.dom.document.activeElement.id, 'mrv-title', 'retry rerender restores dialog focus instead of leaving it on a removed button');
  assert.equal(h.calls.pipeline, 0); assert.equal(h.calls.map, 0); assert.equal(h.calls.export, 0);
});

test('G2 cannot spend another model call while a teacher decision has an unresolved save failure', async () => {
  const h = materialRetryFixture({ failSave: true }), modal = h.R.open('/vault', h.m, { final: true });
  await modal.querySelector('[data-review-filter="decided"]').click();
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Annulla decisione').click();
  assert.equal(modal.querySelector('#mrv-save-retry').hidden, false);
  await modal.querySelector('#mrv-retry-judge').click();
  assert.equal(h.calls.material, 0); assert.equal(h.m.review.final.review.initial.checkStatus, 'incomplete');
  assert.match(modal.querySelector('#mrv-status').textContent, /Disco non disponibile/);
});

test('G2 exposes every unchecked material without creating findings or modifying the manifest', () => {
  const h = materialRetryFixture();
  h.m.review.final.review.initial.issues = [];
  h.m.review.final.review.initial.decisions = {};
  const before = clone(h.m), modal = h.R.open('/vault', h.m, { final: true });
  const unchecked = modal.querySelector('#mrv-unchecked');
  assert.ok(unchecked, 'skipped material checks remain visible even when no correction issue was returned');
  assert.match(unchecked.textContent, /105/);
  assert.equal(unchecked.querySelectorAll('li,details').length, 0);
  const details = modal.querySelector('#mrv-material-coverage');
  assert.equal(details.querySelectorAll('[data-coverage-item]').length, 105);
  assert.match(details.textContent, /Domanda salvata 104/);
  // 0053 (Giacomo, 27/09): la causa tecnica non si mostra al docente — un pallino per materiale e una legenda sola
  assert.doesNotMatch(details.textContent, /HTTP 400: schema non valido|Il controllo automatico non è completo|Dettaglio del controllo/);
  assert.doesNotMatch(details.textContent, /interrotto per un problema tecnico/);
  assert.equal(!!details.querySelector('.mrv-coverage-technical'), false);
  assert.equal(details.querySelectorAll('[data-coverage-pallino]').length, 105);
  assert.equal(details.querySelectorAll('[data-coverage-legenda]').length, 1);
  assert.doesNotMatch(h.dom.text(), /Nessuna proposta di correzione\. Puoi leggere i contenuti e continuare\./);
  assert.equal(modal.querySelector('#mrv-filters').hidden, true);
  assert.equal(modal.querySelector('#mrv-filter-count').hidden, true);
  assert.ok(modal.querySelector('#mrv-manual-confirm'));
  assert.ok(modal.querySelector('#mrv-retry-judge'));
  const manualOption = modal.querySelector('#mrv-manual-option');
  assert.equal(manualOption.getAttribute('open'), undefined);
  assert.equal(manualOption.querySelector('#mrv-retry-judge'), null, 'retry is immediately available outside the optional manual path');
  assert.ok(h.dom.html().indexOf('id="mrv-retry-judge"') < h.dom.html().indexOf('id="mrv-manual-option"'));
  assert.deepEqual(clone(h.m), before); assert.equal(h.calls.manifest, 0);
  assert.equal(h.m.review.final.review.initial.report.coverage.skipped.length, 105);
  assert.equal(h.m.review.final.review.initial.report.coverage.skipped[104].reason, 'HTTP 400: schema non valido');
});

test('G2 retry preserves an unfinished invalid numeric edit and does not call the judge', async () => {
  const h = runtime(), items = [{ id: 'open-1', kind: 'open', question: 'Perché?', guide: 'Spiega il rapporto causale.',
    criteria: ['Indica una causa e la sua conseguenza.'], lines: 8 }];
  const m = finalManifest(items, [{ id: 'line-count', target: { kind: 'item', id: 'open-1', field: 'lines' },
    after: 10, problem: 'Spazio di risposta da rivedere.' }]);
  m.review.final.review.initial.checkStatus = 'incomplete'; h.st._pipelineManifest = m;
  let judgeCalls = 0;
  h.window.MappAIGroundingCore = { buildInput: () => ({ material: 'Fonte della lezione.' }) };
  h.window.MappAIMaterialReview = { ...Material, check: async () => { judgeCalls++; return { checkStatus: 'completed', issues: [] }; } };
  const modal = h.R.open('/vault', m, { final: true });
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Modifica il testo').click(); await tick();
  const input = modal.querySelector('[data-editor] input[type="number"]');
  input.value = '4.5'; input.oninput();
  const savedBeforeRetry = h.saved.manifest && clone(h.saved.manifest), writesBeforeRetry = h.calls.manifest;
  await modal.querySelector('#mrv-retry-judge').click();
  assert.equal(judgeCalls, 0); assert.equal(h.calls.manifest, writesBeforeRetry);
  assert.equal(modal.querySelector('[data-editor] input[type="number"]'), input);
  assert.equal(input.isConnected, true); assert.equal(input.value, '4.5');
  assert.equal(modal.querySelector('#mrv-continue').disabled, true);
  assert.match(modal.querySelector('#mrv-status').textContent, /Completa il campo/);
  assert.deepEqual(h.saved.manifest && clone(h.saved.manifest), savedBeforeRetry);
  assert.equal(m.review.final.items[0].lines, 8);
});

function dashboardReview(count = 3, incomplete = false) {
  const h = runtime();
  h.st.db = { nodes: Array.from({ length: count }, (_, i) => ({ id: 'n' + i, label: 'Concetto ' + (i + 1), desc: 'Testo originale ' + i })), links: [], sourcesDict: {} };
  const r = Core.createReview({ db: h.st.db, sources: SOURCES, report: {
    checkStatus: incomplete ? 'incomplete' : 'completed',
    issues: h.st.db.nodes.map((n, i) => ({ id: 'd' + i, target: { kind: 'node', id: n.id, field: 'desc' },
      after: 'Testo corretto ' + i, problem: 'Verifica del concetto ' + (i + 1) }))
  } });
  const m = manifest(r), modal = h.R.open('/vault', m);
  return { ...h, m, modal };
}
const currentCard = modal => modal.querySelector('[data-review-card]:not([hidden])');

test('dashboard keeps fifty findings in a navigable queue, displays one card and advances only after saving', async () => {
  const h = dashboardReview(50), { modal } = h;
  // testata del 25/9/26: titolo breve e due fasi sole («Pronti da usare» e il pallino 3 tolti)
  assert.equal(modal.querySelector('#mrv-title').textContent, 'Revisione pre-materiali');
  assert.deepEqual(Array.from(modal.querySelectorAll('.mrv-stages li'), li => li.textContent), ['1Contenuti', '2Materiali']);
  assert.equal(modal.querySelectorAll('[data-review-issue]').length, 50);
  assert.equal(modal.querySelectorAll('[data-review-card]:not([hidden])').length, 1);
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'd0');
  assert.equal(modal.querySelector('#mrv-prev').disabled, true);
  await currentCard(modal).querySelector('[data-review-choice=accept]').click();
  assert.equal(h.saved.manifest.review.initial.decisions.d0.choice, 'accept');
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'd1');
  assert.equal(modal.querySelectorAll('[data-review-issue]').length, 49);
  assert.equal(modal.querySelector('#mrv-progress-label').textContent, '1 / 50 decise');
  assert.equal(modal.querySelector('#mrv-progress').getAttribute('value'), '2');
  assert.equal(h.dom.document.activeElement.id, 'mrv-current-title');
  await modal.querySelector('#mrv-next').click();
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'd2');
  await modal.querySelector('#mrv-prev').click();
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'd1');
  const before = h.calls.manifest;
  await modal.querySelector('[data-review-issue=d40]').click();
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'd40');
  assert.equal(h.calls.manifest, before, 'navigation is read-only');
});

test('dashboard search spans concept and content, restores the queue and never changes decisions', async () => {
  const h = dashboardReview(), { modal } = h, search = modal.querySelector('#mrv-search');
  search.value = 'concetto 3'; await search.oninput();
  assert.equal(modal.querySelectorAll('[data-review-issue]').length, 1);
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'd2');
  search.value = 'originale 0'; await search.oninput();
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'd0');
  search.value = 'nessun risultato'; await search.oninput();
  assert.equal(currentCard(modal), null);
  assert.match(modal.querySelector('#mrv-filter-empty').textContent, /Nessuna segnalazione/);
  search.value = ''; await search.oninput();
  assert.equal(modal.querySelectorAll('[data-review-issue]').length, 3);
  assert.equal(h.calls.manifest, 0);
  assert.deepEqual(h.m.review.initial.decisions, {});
});

test('dashboard preserves a manual draft while switching cards and exposes the saved outcome in its queue', async () => {
  const h = dashboardReview(), { modal } = h;
  await currentCard(modal).querySelector('[data-review-choice=manual]').click();
  const input = currentCard(modal).querySelector('textarea');
  input.value = 'Una spiegazione scritta dal docente.'; input.oninput(); await tick();
  assert.match(modal.querySelector('[data-review-issue=d0] .mrv-queue-state').textContent, /modificato da te/);
  await currentCard(modal).querySelector('[data-review-choice=manual]').click();
  assert.equal(currentCard(modal).querySelector('textarea').value, input.value, 'reopening the editor does not reset the draft');
  await modal.querySelector('#mrv-next').click();
  await modal.querySelector('[data-review-filter=decided]').click();
  assert.equal(currentCard(modal).querySelector('textarea').value, input.value);
  assert.equal(h.saved.manifest.review.initial.decisions.d0.text, input.value);
  await currentCard(modal).querySelector('[data-review-choice=pending]').click();
  await modal.querySelector('[data-review-filter=pending]').click();
  assert.equal(modal.querySelectorAll('[data-review-issue]').length, 3);
});

test('dashboard does not navigate away from failed saves or invalid numeric edits', async () => {
  const h = dashboardReview(), { modal } = h;
  h.opts.failSave = true;
  await currentCard(modal).querySelector('[data-review-choice=accept]').click();
  await modal.querySelector('#mrv-next').click();
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'd0');
  h.opts.failSave = false;
  await modal.querySelector('#mrv-save-retry').click(); await tick();
  await modal.querySelector('#mrv-next').click();
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'd1');

  const j = runtime(), items = [{ id: 'q1', kind: 'open', question: 'Perché?', lines: 4 }, { id: 'q2', kind: 'open', question: 'Come?', lines: 6 }];
  const m = finalManifest(items, items.map((item, i) => ({ id: 'lines' + i, target: { kind: 'item', id: item.id, field: 'lines' }, after: 8, problem: 'Spazio per la risposta ' + i })));
  const other = j.R.open('/vault', m, { final: true });
  await currentCard(other).querySelector('[data-review-choice=manual]').click();
  const number = currentCard(other).querySelector('input[type=number]'); number.value = ''; number.oninput();
  await other.querySelector('#mrv-next').click();
  const search = other.querySelector('#mrv-search'); search.value = 'Come'; await search.oninput();
  assert.equal(currentCard(other).getAttribute('data-review-card'), 'lines0');
  assert.equal(number.value, ''); assert.equal(search.value, '');
  assert.equal(other.querySelector('#mrv-continue').disabled, true);
});

test('dashboard separates complete decisions from incomplete AI coverage and reveals the remaining step', async () => {
  const h = dashboardReview(1, true), { modal } = h;
  assert.equal(modal.querySelector('#mrv-coverage-options').getAttribute('open'), undefined);
  await currentCard(modal).querySelector('[data-review-choice=reject]').click();
  assert.equal(modal.querySelector('#mrv-progress').getAttribute('value'), '100');
  assert.equal(modal.querySelector('#mrv-coverage-label').textContent, 'Parziale');
  assert.notEqual(modal.querySelector('#mrv-coverage-options').getAttribute('open'), undefined);
  assert.match(modal.querySelector('#mrv-next-step').textContent, /Resta da completare il controllo/);
  assert.equal(modal.querySelector('#mrv-continue').hidden, true);
  const confirm = modal.querySelector('#mrv-manual-confirm'); confirm.checked = true; confirm.onchange();
  assert.equal(modal.querySelector('#mrv-continue').hidden, false);
  assert.match(modal.querySelector('#mrv-next-step').textContent, /creare i materiali/);
});

test('adding an unreported node clears search and opens the newly added decision', async () => {
  const h = runtime(), m = manifest(), modal = h.R.open('/vault', m);
  const search = modal.querySelector('#mrv-search'); search.value = 'Germania'; await search.oninput();
  const select = modal.querySelector('#mrv-other-nodes label select'); select.value = 'b'; select.onchange();
  await modal.querySelector('#mrv-add-node').click();
  assert.equal(search.value, '');
  assert.equal(modal.querySelectorAll('[data-review-issue]').length, 2);
  const teacher = m.review.initial.issues.find(i => i.origin === 'teacher');
  assert.equal(currentCard(modal).getAttribute('data-review-card'), teacher.id);
  assert.equal(h.saved.manifest.review.initial.issues.length, 2);
  assert.equal(h.dom.document.activeElement.id, 'mrv-current-title');
});

test('reopening a manually approved dashboard describes approval without requesting unavailable check actions', () => {
  const h = runtime();
  let r = initial({ checkStatus: 'incomplete', issues: [] });
  const result = Core.beginApproval(r, DB, { manualReview: true });
  r = Core.completeApproval(result.review, result.revision);
  const modal = h.R.open('/vault', manifest(r));
  assert.match(modal.querySelector('#mrv-next-step').textContent, /revisione è approvata/);
  assert.match(modal.querySelector('#mrv-coverage-status').textContent, /completata dal docente/);
  assert.equal(modal.querySelector('#mrv-manual-confirm'), null);
  assert.equal(modal.querySelector('#mrv-continue').textContent, 'Chiudi');
});

function contextualDashboard() {
  const h = runtime();
  h.st.db = { ...clone(DB), customColors: { 1: '#ffe899', 2: 'rgb(0, 120, 90)' },
    nodes: DB.nodes.map((node, i) => ({ ...node, level: 1, group: String(i + 1) })) };
  const base = Core.createReview({ db: h.st.db, sources: SOURCES, report: { checkStatus: 'completed', issues: [] } });
  const approved = Core.beginApproval(base, h.st.db), m = manifest(Core.completeApproval(approved.review, approved.revision));
  const items = [
    { id: 'mc', kind: 'mc', question: 'Domanda a scelta multipla', options: ['A', 'B'], correctIndex: 0, explanation: 'Prima del conflitto.', ramo: 'Germania' },
    { id: 'open', kind: 'open', question: 'Domanda da sviluppare', guide: 'Spiega perché.', explanation: 'Prima del conflitto.', areas: ['Germania', 'Svizzera'], lines: 4 },
    { id: 'card', kind: 'flashcard', question: 'Che cosa accadde?', answer: 'Accadde un evento.', ramo: 'Svizzera' }
  ];
  const evidence = [{ source: 'Libro.pdf', page: 4, text: 'La fonte dice: dopo.', quotationMatched: true, verifiedAgainst: 'archived-source-text' }];
  const issues = items.map((item, i) => ({ id: 'context-' + item.id, target: { kind: 'item', id: item.id, field: i === 2 ? 'answer' : 'explanation' },
    after: i === 2 ? 'Accadde questo evento.' : 'Dopo il conflitto.', problem: 'Motivo ' + i,
    type: i === 2 ? 'editorial' : 'semantic', evidence: clone(evidence) }));
  m.review.final = { stage: 'awaiting_review', items, review: Core.createReview({ db: { items }, sources: SOURCES, report: { checkStatus: 'completed', issues } }) };
  const modal = h.R.open('/vault', m, { final: true });
  return { ...h, m, modal };
}

test('context chips preserve map colors and group only the identical correction backed by the same verified source', async () => {
  const h = contextualDashboard(), { modal } = h, before = clone(h.m);
  const card = currentCard(modal);
  assert.equal(modal.querySelectorAll('[data-review-card]').length, 2, 'same literal correction can group despite different explanations of the problem');
  assert.match(card.querySelector('[data-area-chip="1"] .mrv-area-dot').getAttribute('style'), /#ffe899/);
  assert.match(card.querySelector('[data-area-chip="2"] .mrv-area-dot').getAttribute('style'), /rgb\(0, 120, 90\)/);
  assert.ok(card.querySelector('[data-material-chip=mc]'));
  assert.ok(card.querySelector('[data-material-chip=open]'));
  assert.equal(card.querySelectorAll('[data-review-targets] li').length, 2);
  assert.equal(card.querySelector('[data-change=before]').textContent, 'Prima del');
  assert.equal(card.querySelector('[data-change=after]').textContent, 'Dopo il');
  assert.match(card.querySelector('[data-evidence-excerpt]').textContent, /La fonte dice: dopo\./);
  assert.match(card.querySelector('[data-evidence-excerpt]').textContent, /Libro.pdf · Pagina 4/);
  assert.deepEqual(clone(h.m), before, 'displaying context must not mutate revisions or drafts');
  await card.querySelector('[data-review-choice=accept]').click();
  assert.equal(h.saved.manifest.review.final.review.initial.decisions['context-mc'].choice, 'accept');
  assert.equal(h.saved.manifest.review.final.review.initial.decisions['context-open'].choice, 'accept');
  assert.equal(h.saved.manifest.review.final.review.initial.decisions['context-card'], undefined);
});

test('area, material and reason filters combine before grouping and an action affects only visible targets', async () => {
  const h = contextualDashboard(), { modal } = h;
  const area = modal.querySelector('#mrv-area'), kind = modal.querySelector('#mrv-kind'), reason = modal.querySelector('#mrv-reason');
  area.value = '2'; await area.onchange();
  assert.equal(h.dom.document.activeElement, area);
  assert.equal(modal.querySelectorAll('[data-review-issue]').length, 2);
  kind.value = 'open'; await kind.onchange();
  assert.equal(h.dom.document.activeElement, kind);
  assert.equal(modal.querySelectorAll('[data-review-issue]').length, 1);
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'context-open');
  assert.match(reason.querySelector('option[value=semantic]').textContent, /\(1\)/);
  reason.value = 'editorial'; await reason.onchange();
  assert.equal(currentCard(modal), null);
  assert.match(modal.querySelector('#mrv-filter-empty').textContent, /filtri/);
  reason.value = ''; await reason.onchange();
  await currentCard(modal).querySelector('[data-review-choice=reject]').click();
  assert.equal(h.m.review.final.review.initial.decisions['context-open'].choice, 'reject');
  assert.equal(h.m.review.final.review.initial.decisions['context-mc'], undefined);
  await modal.querySelector('#mrv-clear-filters').click();
  assert.equal(area.value, ''); assert.equal(kind.value, ''); assert.equal(reason.value, '');
  assert.equal(modal.querySelectorAll('[data-review-issue]').length, 2);
  assert.match(kind.querySelector('option[value=mc]').textContent, /\(1\)/);
});

test('changing facets preserves a saved manual draft and does not reset the current decision', async () => {
  const h = contextualDashboard(), { modal } = h, kind = modal.querySelector('#mrv-kind');
  kind.value = 'mc'; await kind.onchange();
  await currentCard(modal).querySelector('[data-review-choice=manual]').click();
  const input = currentCard(modal).querySelector('textarea'); input.value = 'Rettifica scelta dal docente.'; input.oninput(); await tick();
  await currentCard(modal).querySelector('[data-edit-save]').click();
  kind.value = 'flashcard'; await kind.onchange();
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'context-card');
  await modal.querySelector('[data-review-filter=decided]').click();
  kind.value = 'mc'; await kind.onchange();
  await currentCard(modal).querySelector('[data-review-choice=manual]').click();
  assert.equal(currentCard(modal).querySelector('textarea').value, input.value);
  assert.equal(h.saved.manifest.review.final.review.initial.decisions['context-mc'].text, input.value);
});

test('new retry findings and retained decisions are explained without counting paraphrased duplicates as new', async () => {
  const h = materialRetryFixture(), old = h.m.review.final.review;
  const check = h.materialCheck;
  h.materialCheck = async (...args) => {
    const report = await check(...args);
    report.retrySummary = { targeted: 3, reused: 102, remaining: 0 };
    report.issues.push(...old.initial.issues.map(i => ({ ...clone(i), id: i.id + '-copy', problem: 'Obiezione riformulata.' })));
    return report;
  };
  const modal = h.R.open('/vault', h.m, { final: true });
  await modal.querySelector('#mrv-retry-judge').click();
  assert.deepEqual(clone(h.m.review.final.review.initial.retrySummary.newIssueIds), ['fresh']);
  const summary = modal.querySelector('#mrv-retry-summary');
  assert.match(summary.textContent, /1 nuove segnalazioni/);
  assert.match(summary.textContent, /3 materiali sottoposti al tentativo/);
  assert.match(summary.textContent, /102 controlli riutilizzati/);
  assert.ok(modal.querySelector('[data-review-issue=fresh] .mrv-new-finding'));
  assert.equal(h.saved.manifest.review.final.review.initial.retrySummary.newIssueIds.length, 1);
});

test('shared changes keep separate groups when evidence, changed field or proposal differs', () => {
  const h = contextualDashboard(), issues = h.m.review.final.review.initial.issues;
  const first = clone(issues[0]);
  const changedEvidence = { ...clone(first), id: 'other-evidence', evidence: [{ ...first.evidence[0], text: 'Un passaggio diverso.' }] };
  const changedProposal = { ...clone(first), id: 'other-proposal', after: 'Durante il conflitto.' };
  const changedField = { ...clone(first), id: 'other-field', target: { ...first.target, field: 'question' } };
  assert.equal(h.R.groupIssues([first, changedEvidence, changedProposal, changedField]).length, 4);
});

test('numeric MC keys remain separate even with identical indices, source evidence and problem text', () => {
  const h = runtime();
  const row = { before: 0, after: 1, hasProposal: true, type: 'semantic', problem: 'La chiave non corrisponde alla fonte.',
    evidence: [{ text: 'Guisan guidò l’esercito, Wahlen l’agricoltura.', quotationMatched: true, verifiedAgainst: 'archived-source-text' }] };
  assert.equal(h.R.groupIssues(['mc-a', 'mc-b'].map(id => ({ ...row, id, target: { kind: 'item', id, field: 'correctIndex' } }))).length, 2);
});

test('first phase reasons retain the actual judge categories and support filtering them', async () => {
  const h = runtime(), types = ['termine-sostituito', 'nesso-non-nella-fonte', 'fatto-contraddetto', 'unsupported-link', 'soggetto-invertito', 'data-attribuita-male'];
  const review = initial({ checkStatus: 'completed', issues: types.map((type, i) => ({ id: 'reason-' + i, type,
    target: { kind: 'node', id: 'a', field: 'desc' }, problem: 'Verifica ' + i })) });
  const modal = h.R.open('/vault', manifest(review)), filter = modal.querySelector('#mrv-reason');
  for (const type of types) {
    assert.ok(filter.querySelector('option[value="' + type + '"]'));
    filter.value = type; await filter.onchange();
    assert.equal(modal.querySelectorAll('[data-review-issue]').length, 1);
    assert.equal(currentCard(modal).querySelector('[data-review-reason]').getAttribute('data-review-reason'), type);
  }
});

test('a link targeted by ID shows its real concept names, including D3 object endpoints', () => {
  const h = runtime();
  h.st.db.links[0].id = 'cross-link';
  h.st.db.links[0].source = h.st.db.nodes[0];
  h.st.db.links[0].target = h.st.db.nodes[1];
  const review = Core.createReview({ db: h.st.db, sources: SOURCES, report: { checkStatus: 'completed', issues: [
    { id: 'link-finding', target: { kind: 'link', id: 'cross-link', field: 'rel' }, after: 'condiziona', problem: 'Verifica il rapporto.' }
  ] } });
  const modal = h.R.open('/vault', manifest(review));
  assert.match(currentCard(modal).textContent, /Germania → richiede → Svizzera/);
  assert.match(currentCard(modal).textContent, /Germania → condiziona → Svizzera/);
  assert.doesNotMatch(currentCard(modal).textContent, /Concetto non disponibile/);
});

async function searchMaterials(modal, query, mode = 'words') {
  modal.querySelector('#mrv-occurrence-query').value = query;
  modal.querySelector('#mrv-occurrence-mode').value = mode;
  await modal.querySelector('#mrv-occurrence-search').click();
  return modal.querySelectorAll('[data-occurrence-item]');
}

test('individual decisions remain separate after closing and reopening the review', async () => {
  const h = contextualDashboard();
  await searchMaterials(h.modal, 'conflitto');
  await h.modal.querySelector('[data-occurrence-item=mc] [data-occurrence-edit=explanation]').click();
  await currentCard(h.modal).querySelector('[data-review-choice=manual]').click();
  const input = currentCard(h.modal).querySelector('textarea'); input.value = 'Correzione individuale MC.'; input.oninput(); await tick();
  await currentCard(h.modal).querySelector('[data-edit-save]').click();
  await h.modal.querySelector('[data-review-filter=pending]').click();
  await h.modal.querySelector('[data-review-issue=context-open]').click();
  await currentCard(h.modal).querySelector('[data-review-choice=reject]').click();
  await h.modal.querySelector('#mrv-later').click();
  const reopened = h.R.open('/vault', h.m, { final: true });
  await reopened.querySelector('[data-review-filter=decided]').click();
  assert.equal(reopened.querySelectorAll('[data-review-issue]').length, 2);
  await reopened.querySelector('[data-review-issue=context-mc]').click();
  assert.equal(currentCard(reopened).querySelector('[data-review-targets]'), null);
  await currentCard(reopened).querySelector('[data-review-choice=manual]').click();
  assert.equal(currentCard(reopened).querySelector('textarea').value, input.value);
  assert.equal(h.saved.manifest.review.final.review.initial.decisions['context-open'].choice, 'reject');
});

test('reopening occurrence results refreshes edited text without replacing the active editor', async () => {
  const h = contextualDashboard(), { modal } = h;
  await searchMaterials(modal, 'conflitto');
  await modal.querySelector('[data-occurrence-item=mc] [data-occurrence-edit=explanation]').click();
  await currentCard(modal).querySelector('[data-review-choice=manual]').click();
  const input = currentCard(modal).querySelector('textarea'); input.value = 'Scelta individuale.'; input.oninput(); await tick();
  const details = modal.querySelector('#mrv-occurrences'); details.open = true; details.ontoggle();
  assert.ok(modal.querySelector('[data-occurrence-item=mc]'), 'search still uses saved text while the editor contains a local draft');
  assert.ok(modal.querySelector('[data-occurrence-item=open]'));
  assert.ok(currentCard(modal).querySelector('textarea') === input);
  await currentCard(modal).querySelector('[data-edit-save]').click();
  assert.equal(modal.querySelector('[data-occurrence-item=mc]'), null);
  await searchMaterials(modal, 'individuale');
  await modal.querySelector('[data-occurrence-item=mc] [data-occurrence-edit=explanation]').click();
  const second = currentCard(modal).querySelector('textarea'); second.value = 'Il conflitto spiegato.'; second.oninput(); await tick();
  assert.ok(currentCard(modal).querySelector('textarea') === second);
  await currentCard(modal).querySelector('[data-edit-save]').click();
  await searchMaterials(modal, 'conflitto');
  assert.ok(modal.querySelector('[data-occurrence-item=mc]'));
});

test('full material context shows canonical criteria and MC options without stale aliases', async () => {
  const h = runtime(), items = [
    { id: 'open', kind: 'open', question: 'Circuito?', guide: 'Spiega il circuito.', criteria: ['Criterio aggiornato.'], criteri: ['Criterio vecchio.'], lines: 5 },
    { id: 'mc', kind: 'mc', question: 'Circuito?', options: ['Opzione aggiornata.', 'Altra opzione.'], answer: 'Risposta vecchia.', correctIndex: 0 }
  ];
  const m = finalManifest(items), modal = h.R.open('/vault', m, { final: true });
  await searchMaterials(modal, 'Circuito');
  assert.match(modal.querySelector('[data-occurrence-item=open] .mrv-item-context').textContent, /Criterio aggiornato/);
  assert.doesNotMatch(modal.querySelector('[data-occurrence-item=open] .mrv-item-context').textContent, /Criterio vecchio/);
  assert.doesNotMatch(modal.querySelector('[data-occurrence-item=mc] .mrv-item-context').textContent, /Risposta vecchia/);
});

test('a short generated batch stays visible in material review after reopening', () => {
  const h = runtime(), m = finalManifest([{ id: 'mc', kind: 'mc', question: 'Circuito?', options: ['Sì', 'No'], correctIndex: 0 }]);
  m.review.drafts = { B: { 'mc-auto': { title: 'Quiz MC', generation: { requested: 12, produced: 9 } } } };
  const modal = h.R.open('/vault', m, { final: true });
  assert.match(modal.querySelector('#mrv-batch-coverage').textContent, /Quiz MC: 9 \/ 12/);
  assert.match(modal.querySelector('#mrv-batch-coverage').textContent, /alla generazione/);
});

test('occurrences include unflagged materials with the full exercise and do not turn matches into findings', async () => {
  const h = runtime(), items = [
    { id: 'mc', kind: 'mc', question: 'Quando avviene il corto circuito?', options: ['Con un filo diretto.', 'Con il circuito aperto.'], correctIndex: 0, explanation: 'Il corto circuito evita il carico.' },
    { id: 'open', kind: 'open', question: 'Giustifica il risultato.', guide: 'Spiega il corto circuito.', criteria: ['Spiega il corto circuito.'], lines: 5 },
    { id: 'synthesis', kind: 'synthesis', text: 'Il corto circuito: <img src=x onerror=alert(1)>.', title: 'Circuiti' }
  ];
  const m = finalManifest(items), before = clone(m), modal = h.R.open('/vault', m, { final: true });
  const results = await searchMaterials(modal, 'corto circuito');
  assert.equal(results.length, 3);
  assert.match(modal.querySelector('.mrv-occurrences-count').textContent, /3 materiali con corrispondenze · 3 materiali esaminati/);
  const mc = modal.querySelector('[data-occurrence-item=mc] .mrv-item-context');
  assert.match(mc.textContent, /Risposta corretta:[\s\n]*A\. Con un filo diretto/);
  assert.match(mc.textContent, /Spiegazione:[\s\n]*Il corto circuito evita il carico/);
  const open = modal.querySelector('[data-occurrence-item=open]');
  assert.ok(open.querySelector('[data-occurrence-edit=guide]'));
  assert.ok(open.querySelector('[data-occurrence-edit=criteria]'));
  assert.match(open.querySelector('.mrv-item-context').textContent, /Criteri di correzione/);
  assert.ok(modal.querySelector('[data-occurrence-item=mc] mark'));
  assert.equal(modal.querySelector('[data-occurrence-item=synthesis] img'), null);
  assert.match(modal.querySelector('[data-occurrence-item=synthesis]').textContent, /<img src=x/);
  assert.deepEqual(clone(m), before); assert.equal(h.calls.manifest, 0);
  assert.equal(h.dom.document.activeElement, modal.querySelector('#mrv-occurrence-results'));
});

test('editing a found occurrence isolates a previously grouped proposal and keeps other materials unchanged', async () => {
  const h = contextualDashboard(), { modal } = h;
  assert.equal(currentCard(modal).querySelectorAll('[data-review-targets] li').length, 2);
  await currentCard(modal).querySelector('[data-find-occurrences]').click();
  assert.match(modal.querySelector('.mrv-occurrences-source').textContent, /Motivo 0/);
  assert.equal(h.dom.document.activeElement, modal.querySelector('#mrv-occurrence-query'));
  await searchMaterials(modal, 'Prima conflitto');
  await modal.querySelector('[data-occurrence-item=mc] [data-occurrence-edit=explanation]').click();
  let card = currentCard(modal);
  assert.equal(card.getAttribute('data-review-card'), 'context-mc');
  assert.equal(card.querySelector('[data-review-targets]'), null, 'an individual edit must not inherit a shared action');
  await card.querySelector('[data-review-choice=manual]').click();
  const input = card.querySelector('textarea'); input.value = 'Spiegazione rettificata dal docente.'; input.oninput(); await tick();
  await card.querySelector('[data-edit-save]').click();
  assert.equal(h.saved.manifest.review.final.review.initial.decisions['context-mc'].text, input.value);
  assert.equal(h.saved.manifest.review.final.review.initial.decisions['context-open'], undefined);
  assert.equal(h.m.review.final.items[0].explanation, 'Prima del conflitto.');
  const matches = await searchMaterials(modal, 'rettificata');
  assert.equal(matches.length, 1, 'search applies the saved edit while other findings remain pending');
  await modal.querySelector('[data-occurrence-item=mc] [data-occurrence-edit=explanation]').click();
  assert.equal(currentCard(modal).querySelector('textarea').value, input.value);
  assert.equal(h.m.review.final.review.initial.issues.length, 3);
});

test('moving from an accepted occurrence to manual editing starts from the chosen proposal', async () => {
  const h = contextualDashboard(), { modal } = h;
  h.m.review.final.review = Core.setDecision(h.m.review.final.review, 'context-mc', 'accept');
  const before = clone(h.m.review.final.review);
  const matches = await searchMaterials(modal, 'Dopo conflitto');
  assert.equal(matches.length, 1);
  await modal.querySelector('[data-occurrence-item=mc] [data-occurrence-edit=explanation]').click();
  assert.deepEqual(clone(h.m.review.final.review), before, 'opening an existing field is read-only');
  await currentCard(modal).querySelector('[data-review-choice=manual]').click();
  assert.equal(currentCard(modal).querySelector('textarea').value, 'Dopo il conflitto.');
  assert.deepEqual(clone(h.m.review.final.review), before, 'opening the manual editor does not replace the accepted decision');
  assert.equal(h.calls.manifest, 0);
  assert.equal(h.m.review.final.review.initial.decisions['context-open'], undefined);
});

test('an occurrence edit invalidates personal confirmation, persists once and exports only that field', async () => {
  const h = stalledMaterialFixture(), { m } = h, modal = h.R.open('/vault', m, { final: true });
  const initial = clone(m.review.final.review.initial.decisions);
  let confirmation = modal.querySelector('#mrv-manual-confirm'); confirmation.checked = true; confirmation.onchange();
  await searchMaterials(modal, 'Risposta 240');
  assert.equal(confirmation.checked, true, 'looking for matches is not a new decision');
  await modal.querySelector('[data-occurrence-item="material-240"] [data-occurrence-edit=answer]').click();
  assert.equal(modal.querySelector('#mrv-manual-confirm').checked, true);
  await currentCard(modal).querySelector('[data-review-choice=manual]').click();
  const input = currentCard(modal).querySelector('textarea'); input.value = 'Risposta controllata.'; input.oninput(); await tick();
  await currentCard(modal).querySelector('[data-edit-save]').click();
  assert.equal(modal.querySelector('#mrv-manual-confirm').checked, false);
  confirmation = modal.querySelector('#mrv-manual-confirm'); confirmation.checked = true; confirmation.onchange();
  await modal.querySelector('#mrv-continue').click();
  assert.equal(m.review.final.items.find(item => item.id === 'material-240').answer, 'Risposta controllata.');
  assert.equal(m.review.final.items.find(item => item.id === 'material-241').answer, 'Risposta 241.');
  for (const [id, decision] of Object.entries(initial)) assert.deepEqual(clone(m.review.final.review.initial.decisions[id]), decision);
});

test('occurrences in approved deliveries remain searchable and excluded materials stay excluded', async () => {
  const h = runtime(), items = [
    { id: 'kept', kind: 'flashcard', question: 'Circuito?', answer: 'Circuito chiuso.' },
    { id: 'excluded', kind: 'flashcard', question: 'Circuito?', answer: 'Circuito aperto.' }
  ];
  const m = finalManifest(items, [{ id: 'drop', target: { kind: 'item', id: 'excluded', field: '$item' }, after: null }]);
  const decision = Core.setDecision(m.review.final.review, 'drop', 'accept'), approval = Core.beginApproval(decision, { items });
  m.review.final.review = Core.completeApproval(approval.review, approval.revision); m.review.final.items = approval.db.items; m.review.final.stage = 'done';
  const before = clone(m), modal = h.R.open('/vault', m, { final: true });
  assert.equal((await searchMaterials(modal, 'Circuito')).length, 1);
  assert.equal(modal.querySelectorAll('[data-occurrence-edit]').length, 0);
  assert.deepEqual(clone(m), before); assert.equal(h.calls.manifest, 0);
});

test('failed saves and unfinished numeric edits block occurrence navigation without discarding the editor', async () => {
  const h = contextualDashboard(), { modal } = h;
  await searchMaterials(modal, 'Domanda');
  h.opts.failSave = true;
  await modal.querySelector('[data-occurrence-item=open] [data-occurrence-edit=question]').click();
  assert.equal(h.calls.manifest, 0, 'opening an occurrence needs no save');
  const question = currentCard(modal).querySelector('textarea'); question.value = 'Domanda corretta.'; question.oninput();
  await currentCard(modal).querySelector('[data-edit-save]').click();
  const failedCard = currentCard(modal).getAttribute('data-review-card');
  await modal.querySelector('[data-occurrence-item=mc] [data-occurrence-edit=question]').click();
  assert.match(modal.querySelector('#mrv-status').textContent, /Disco non disponibile/);
  assert.equal(currentCard(modal).getAttribute('data-review-card'), failedCard);
  h.opts.failSave = false; await modal.querySelector('#mrv-save-retry').click(); await tick();
  await modal.querySelector('[data-occurrence-item=open] [data-occurrence-edit=question]').click();
  assert.equal(h.m.review.final.review.initial.issues.length, 4);
  const next = Core.addIssue(h.m.review.final.review, { id: 'line-edit', origin: 'teacher', target: { kind: 'item', id: 'open', field: 'lines' } });
  h.m.review.final.review = Core.setDecision(next, 'line-edit', 'manual', { text: 4 });
  const reopened = h.R.open('/vault', h.m, { final: true });
  await reopened.querySelector('[data-review-filter=all]').click();
  await reopened.querySelector('[data-review-issue="line-edit"]').click();
  const input = currentCard(reopened).querySelector('input[type=number]'); input.value = ''; input.oninput();
  await searchMaterials(reopened, 'Domanda');
  assert.equal(currentCard(reopened).getAttribute('data-review-card'), 'line-edit');
  assert.equal(currentCard(reopened).querySelector('input[type=number]'), input);
  assert.equal(input.value, '');
});

test('0015 opening or cancelling an editor preserves approvals and creates no persisted issue', async () => {
  const h = stalledMaterialFixture(), modal = h.R.open('/vault', h.m, { final: true });
  for (let i = 240; i < 245; i++) await modal.querySelector('[data-coverage-approve="material-' + i + '"]').click();
  const before = clone(h.m.review.final.review), writes = h.calls.manifest;
  await modal.querySelector('[data-coverage-item="material-245"] [data-coverage-edit="answer"]').click();
  assert.deepEqual(clone(h.m.review.final.review), before, 'opening must not persist a pending issue');
  assert.equal(h.calls.manifest, writes);
  assert.equal(modal.querySelectorAll('[data-coverage-approve][aria-pressed="true"]').length, 5);
  await currentCard(modal).querySelector('[data-edit-cancel]').click();
  assert.deepEqual(clone(h.m.review.final.review), before);
  assert.equal(modal.querySelectorAll('[data-teacher-approved]').length, 5);
});

test('0015 direct exclusion is conclusive and restore preserves previous approvals', async () => {
  const h = stalledMaterialFixture(), modal = h.R.open('/vault', h.m, { final: true });
  for (let i = 240; i < 250; i++) await modal.querySelector('[data-coverage-approve="material-' + i + '"]').click();
  const checks = clone(h.m.review.final.review.initial.manualChecks);
  await modal.querySelector('[data-coverage-exclude="material-245"]').click();
  assert.equal(modal.querySelector('[data-coverage-approve="material-245"]'), null);
  assert.equal(modal.querySelector('#mrv-continue').hidden, false);
  assert.ok(modal.querySelector('[data-coverage-restore="material-245"]'));
  assert.deepEqual(clone(h.m.review.final.review.initial.manualChecks), checks);
  await modal.querySelector('[data-coverage-restore="material-245"]').click();
  assert.equal(modal.querySelectorAll('[data-coverage-approve][aria-pressed="true"]').length, 10);
});

test('0015 only a saved change revokes the matching approval and a draft cannot be accidentally reset', async () => {
  const h = stalledMaterialFixture(), modal = h.R.open('/vault', h.m, { final: true });
  for (let i = 240; i < 246; i++) await modal.querySelector('[data-coverage-approve="material-' + i + '"]').click();
  const before = clone(h.m.review.final.review);
  const open = () => modal.querySelector('[data-coverage-item="material-245"] [data-coverage-edit="answer"]').click();
  await open();
  await currentCard(modal).querySelector('[data-edit-save]').click();
  assert.deepEqual(clone(h.m.review.final.review), before, 'save unchanged does not add an issue');
  await open();
  let card = currentCard(modal), input = card.querySelector('textarea');
  input.value = 'Correzione in bozza.'; input.oninput();
  await card.querySelector('[data-review-choice="manual"]').click();
  assert.equal(card.querySelector('textarea').value, 'Correzione in bozza.');
  await card.querySelector('[data-review-choice="reject"]').click();
  assert.deepEqual(clone(h.m.review.final.review), before, 'another choice cannot discard an unsaved draft');
  assert.equal(modal.querySelectorAll('[data-teacher-approved]').length, 6);
  await card.querySelector('[data-edit-save]').click();
  assert.equal(modal.querySelectorAll('[data-teacher-approved]').length, 5);
  assert.equal(h.m.review.final.review.initial.checkStatus, 'incomplete');
  const reloaded = clone(h.saved.manifest);
  await modal.querySelector('#mrv-later').click();
  const again = h.R.open('/vault', reloaded, { final: true });
  assert.equal(again.querySelectorAll('[data-teacher-approved]').length, 5);
  assert.match(again.querySelector('[data-coverage-item="material-245"] .mrv-coverage-version').textContent, /Correzione in bozza/);
});

test('0015 local pending/conflicts leave other previews and checks valid but block final approval', async () => {
  const h = stalledMaterialFixture(), modal = h.R.open('/vault', h.m, { final: true });
  for (let i = 240; i < 246; i++) await modal.querySelector('[data-coverage-approve="material-' + i + '"]').click();
  const final = h.m.review.final;
  final.review = Core.addIssue(final.review, {id:'local-pending',target:{kind:'item',id:'material-245',field:'answer'},after:'Una scelta.'});
  await modal.querySelector('[data-review-filter="all"]').click();
  assert.equal(modal.querySelectorAll('[data-teacher-approved]').length, 5);
  assert.equal(modal.querySelector('[data-coverage-approve="material-245"]').disabled, true);
  assert.ok(modal.querySelector('[data-coverage-resolve="material-245"]'));
  assert.match(modal.querySelector('[data-coverage-item="material-244"] .mrv-coverage-version').textContent, /Risposta 244/);
  final.review = Core.setDecision(final.review,'local-pending','accept');
  final.review = Core.addIssue(final.review,{id:'collision',target:{kind:'item',id:'material-245',field:'answer'},after:'Scelta incompatibile.'});
  final.review = Core.setDecision(final.review,'collision','accept');
  await modal.querySelector('[data-review-filter="all"]').click();
  assert.equal(modal.querySelectorAll('[data-teacher-approved]').length, 5);
  assert.equal(Core.beginApproval(final.review,{items:final.items},{manualReview:true}).ok,false);
  await modal.querySelector('[data-coverage-exclude="material-245"]').click();
  assert.equal(modal.querySelector('[data-coverage-approve="material-245"]'),null);
  const persisted = clone(h.saved.manifest);
  await modal.querySelector('#mrv-later').click();
  const again = h.R.open('/vault',persisted,{final:true});
  await again.querySelector('[data-coverage-restore="material-245"]').click();
  assert.equal(again.querySelector('[data-coverage-approve="material-245"]').disabled,true,'restoring exposes the previous conflict');
  assert.equal(again.querySelectorAll('[data-teacher-approved]').length,5);
});

test('0015 recorded validation causes remain distinct from network failures in the 95-item case', () => {
  const items = Array.from({length:95},(_,i)=>({id:'n'+i,kind:i<38?'nodesheet':'flashcard',question:'Domanda '+i,answer:'Risposta '+i}));
  const m=finalManifest(items,[]),h=runtime(),r=m.review.final.review;
  const reasons=['Gli elenchi di controllo contengono ID estranei al lotto','Una o più affermazioni non hanno un esito verificabile','Una segnalazione non è verificabile'];
  r.initial.checkStatus='incomplete';
  r.initial.report={checkStatus:'incomplete',coverage:{expectedIds:items.slice(38).map(i=>i.id),checkedIds:[],skipped:items.slice(38).map((i,n)=>({id:i.id,reason:reasons[n<36?0:n<54?1:2]}))}};
  const before=clone(r.initial.report),modal=h.R.open('/vault',m,{final:true});
  assert.equal(modal.querySelectorAll('[data-coverage-item]').length,57);
  /* 0053 (Giacomo, 27/09): le cause restano distinte nel rapporto (deepEqual qui sotto, e il classificatore in
     review-context.test.js), ma al docente arriva un pallino «Revisione necessaria», uguale per tutte */
  for (const id of ['n38','n74','n92']) {
    const riga=modal.querySelector('[data-coverage-item="'+id+'"]');
    assert.doesNotMatch(riga.textContent,/identificativi|ID estranei|esito verificabile|non è stato possibile verificare|non è verificabile|Dettaglio del controllo|Il materiale è conservato/);
    assert.equal(riga.querySelector('summary [data-coverage-pallino]').getAttribute('aria-label'),'Revisione necessaria');
  }
  assert.doesNotMatch(modal.textContent,/interrotto per un problema tecnico|errore di rete/);
  assert.equal(modal.querySelector('#mrv-continue').hidden,true);
  assert.deepEqual(clone(r.initial.report),before);
});

test('0015 stale global content explains the global block without erasing saved checks', async () => {
  const h=stalledMaterialFixture(),modal=h.R.open('/vault',h.m,{final:true});
  await modal.querySelector('[data-coverage-approve="material-240"]').click();
  h.m.review.final.items[0].answer='Modifica esterna';
  await modal.querySelector('[data-review-filter="all"]').click();
  assert.match(modal.querySelector('[data-coverage-item="material-240"] .mrv-coverage-version').textContent,/non corrispondono alla versione/);
  assert.doesNotMatch(modal.querySelector('[data-coverage-item="material-240"] .mrv-coverage-version').textContent,/altri materiali restano disponibili/);
  assert.ok(h.m.review.final.review.initial.manualChecks['material-240']);
  assert.equal(modal.querySelector('[data-coverage-approve="material-240"]').disabled,true);
});


test('0015 a report referring to a missing material remains readable and cannot be approved', () => {
  const h=stalledMaterialFixture(),r=h.m.review.final.review;
  r.initial.report.coverage.skipped.push({id:'unknown-item',reason:'Esito mancante'});
  const modal=h.R.open('/vault',h.m,{final:true});
  assert.match(modal.querySelector('[data-coverage-item="unknown-item"]').textContent,/non è disponibile nella bozza salvata/);
  assert.equal(modal.querySelector('[data-coverage-approve="unknown-item"]'),null);
  assert.equal(modal.querySelector('#mrv-continue').hidden,true);
});

test('0026: «Riprova» passa il rapporto precedente e mostra «Lotto k di N» su #mrv-status', async () => {
  const h = runtime(), partial = { stato: 'parziale', copertura: {
    nodiEsaminati: ['b'], linkSaltati: [{ source: 'a', target: 'b', rel: 'richiede', motivo: 'risposta interrotta al tetto' }]
  }, issues: [] };
  const m = manifest(initial(partial));
  const modal = h.R.open('/vault', m), previous = m.review.initial.report, seen = [];
  h.window.executeJudgePass = async (_key, opts) => {
    assert.equal(opts.rapportoPrecedente, previous, 'la ripresa mirata riceve il rapporto salvato');
    opts.onProgress({ lotto: 2, totale: 12, etichetta: 'Difesa Militare', modo: 'mirata', daRifare: 3 });
    seen.push(modal.querySelector('#mrv-status').textContent);
    opts.onProgress({ lotto: 5, totale: 12, etichetta: 'ROOT', modo: 'completa', daRifare: 12 });
    seen.push(modal.querySelector('#mrv-status').textContent);
    return clone(partial);
  };
  await modal.querySelector('#mrv-retry-judge').click();
  assert.match(seen[0], /Lotto 2 di 12 · Difesa Militare · si ripetono solo i lotti non riusciti \(3\)/);
  assert.match(seen[1], /Lotto 5 di 12 · ROOT$/);
  assert.equal(m.review.initial.checkStatus, 'incomplete');
  assert.equal(m.review.initial.previousReports.length, 1, 'il rapporto precedente resta nello storico');
});

test('0026: il nuovo controllo dal Setup mostra l’avanzamento e non passa un rapporto precedente', async () => {
  const h = setupJudge(), modal = h.R.open('/vault', h.m), seen = [];
  const execute = h.window.executeJudgePass;
  h.window.executeJudgePass = async (key, opts, giro) => {
    assert.equal(opts.rapportoPrecedente, undefined);
    opts.onProgress({ lotto: 1, totale: 4, etichetta: 'Economia' });
    seen.push(modal.querySelector('#mrv-status').textContent);
    return execute(key, opts, giro);
  };
  await modal.querySelector('#mrv-setup-judge').click();
  await modal.querySelector('#mrv-setup-start').click();
  assert.match(seen[0], /Controllo in corso.*Lotto 1 di 4 · Economia/);
  assert.equal(h.aiCalls.length, 1);
});

/* ── Packet 0053 (Giacomo, 27/09) ─────────────────────────────────────────────
   Nel G2 un pallino «Revisione necessaria» accanto a ogni materiale ancora da
   rileggere, e una legenda sola in cima al riquadro. Approvato: l'icona di oggi,
   niente pallino. Escluso: niente pallino. Nessun testo tecnico nelle schede. */
test('0053: pallino solo sui materiali da rileggere, legenda una volta sola, nessun testo tecnico', async () => {
  const h = stalledMaterialFixture(), modal = h.R.open('/vault', h.m, { final: true });
  for (let i = 240; i < 245; i++) await modal.querySelector('[data-coverage-approve="material-' + i + '"]').click();
  await modal.querySelector('[data-coverage-exclude="material-246"]').click();
  const box = modal.querySelector('#mrv-material-coverage');
  const righe = box.querySelectorAll('[data-coverage-item]');
  for (const riga of righe) {
    const id = riga.getAttribute('data-coverage-item'), n = Number(id.split('-')[1]);
    const pallino = riga.querySelector('summary [data-coverage-pallino]'), approvato = riga.querySelector('summary [data-teacher-approved]');
    // booleani: un oggetto del DOM finto in un messaggio d'errore fa girare Node all'infinito
    if (n >= 240 && n < 245) { assert.equal(!!approvato, true, id + ' approvato: l’icona'); assert.equal(!!pallino, false, id + ' approvato: niente pallino'); }
    else if (n === 246) assert.equal(!!pallino, false, 'escluso: niente pallino');
    else { assert.equal(!!pallino, true, id + ' da rileggere: il pallino'); assert.equal(pallino.getAttribute('role'), 'img'); assert.equal(pallino.getAttribute('aria-label'), 'Revisione necessaria'); }
    assert.equal(!!riga.querySelector('.mrv-coverage-technical'), false, id + ': niente «Dettaglio del controllo»');
  }
  const legende = box.querySelectorAll('[data-coverage-legenda]');
  assert.equal(legende.length, 1);
  assert.match(legende[0].textContent, /Revisione necessaria/);
  assert.match(legende[0].textContent, /Approvato da te/);
  assert.doesNotMatch(box.textContent, /identificativi|ID estranei|Dettaglio del controllo|Il materiale è conservato/);
  // Giacomo, 27/09 (via ADMIN): «Questo numero conta i materiali…» esce subito — il «non sono errori» lo dice la legenda
  assert.doesNotMatch(box.textContent, /Questo numero conta i materiali/);
});

/* ── Packet 0042: lo strato delle affermazioni nel Banco ──────────────────────
   Il core vero (require), la cucitura e le superfici vere caricate nel contesto.
   Ogni runtime ha la SUA copia di review-core: l'avvolgimento del gate non esce. */
function conStrato(h) {
  h.window.MappAIReviewCore = Object.assign({}, Core);
  h.window.MappAIAffermazioniCore = require('../public/js/mappai-affermazioni-core');
  h.load('mappai-affermazioni.js');
  h.load('mappai-affermazioni-ui.js');
  return h;
}
const ACCESO = (extra = {}) => { const v = Object.assign({ mappai_affermazioni: '1', mappai_quarantena: '1' }, extra); return { getItem: k => (k in v ? v[k] : null), setItem: (k, x) => { v[k] = String(x); } }; };
function rapportoStrato() {
  return { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['a', 'b'], nodiSaltati: [] },
    issues: [{ id: 'issue', target: { kind: 'node', id: 'a', field: 'desc' }, after: 'Dopo.', problem: 'Testo da correggere.', evidence: [{ source: 'Libro.pdf', page: 4, text: 'dopo.' }] }] };
}

test('0042: da spento lo strato caricato lascia il Banco identico byte per byte — coda, piede, copertura', () => {
  for (const report of [undefined, rapportoStrato()]) {
    const a = runtime(), ma = manifest(initial(report)); a.st._pipelineManifest = ma;
    const b = conStrato(runtime()), mb = manifest(initial(report)); b.st._pipelineManifest = mb;
    assert.equal(b.window.MappAIReviewCore.gate.__quarantena, true);
    a.R.open('/vault', ma); b.R.open('/vault', mb);
    assert.equal(b.dom.html(), a.dom.html());
    assert.equal(b.dom.document.getElementById('mrv-next-step').textContent, a.dom.document.getElementById('mrv-next-step').textContent);
    assert.equal(b.dom.document.getElementById('mrv-coverage-label').textContent, a.dom.document.getElementById('mrv-coverage-label').textContent);
  }
  // e in G2 lo strato non c'è nemmeno da acceso
  const g2 = conStrato(runtime({ localStorage: ACCESO() })), m = manifest();
  m.review.final = { stage: 'awaiting_review', items: [], review: Core.createReview({ db: { items: [] }, sources: SOURCES, report: { checkStatus: 'completed', issues: [] } }) };
  const modal = g2.R.open('/vault', m, { final: true });
  assert.equal(modal.querySelector('[data-aff-blocco]'), null);
});

test('0042: da acceso compaiono lo stato della segnalazione esclusa, il piede e il blocco in sola lettura', async () => {
  const h = conStrato(runtime({ localStorage: ACCESO() })), m = manifest(initial(rapportoStrato()));
  h.st._pipelineManifest = m;
  const modal = h.R.open('/vault', m);
  assert.equal(modal.querySelector('[data-review-issue="issue"] .mrv-queue-state').textContent, 'Fuori dai materiali finché non decidi');
  assert.match(modal.querySelector('#mrv-next-step').textContent, /Non serve decidere tutto per creare i materiali/);
  assert.match(modal.querySelector('#mrv-coverage-label').textContent, /^Completa · descrizioni esaminate in almeno un giro: 2 \/ 2$/);
  const blocco = modal.querySelector('#mrv-coverage-details [data-aff-blocco]');
  assert.ok(blocco, 'il blocco «Affermazioni delle descrizioni»');
  assert.match(blocco.textContent, /Affermazioni delle descrizioni/);
  assert.match(blocco.querySelector('[data-aff-conteggi]').textContent, /1 fuori dai materiali/);
  assert.match(blocco.querySelector('[data-aff-nota]').textContent, /non è una frase verificata/);
  assert.ok(!/verificat[ae] dalla fonte|frase verificata:/.test(blocco.querySelector('[data-aff-conteggi]').textContent), 'mai «verificata» (inv. 22)');
  const fuori = blocco.querySelector('[data-corsia="fuori-contestata"]');
  assert.ok(fuori && /Prima\./.test(fuori.textContent) && /contestata dal controllo/.test(fuori.textContent));
  assert.notEqual(blocco.querySelector('[data-aff-gruppo="fuori"]').getAttribute('open'), undefined, 'il gruppo «fuori» è aperto');
  // in sola lettura: nessun bottone di decisione, solo la strada verso la segnalazione
  assert.deepEqual(blocco.querySelectorAll('button').map(b => b.getAttribute('data-aff-vai')), ['issue']);
  assert.equal(blocco.querySelectorAll('[data-review-choice]').length, 0);
  assert.equal(h.calls.manifest, 0, 'aprire il Banco non scrive niente');
  // la decisione cambia lo stato: la voce non è più «da decidere»
  await modal.querySelector('[data-review-card="issue"] [data-review-choice="reject"]').click();
  await tick();
  assert.doesNotMatch(modal.querySelector('#mrv-coverage-details [data-aff-blocco]').textContent, /Fuori dai materiali finché non decidi/);
  // solo lo strato, senza quarantena: il blocco dice che cosa resterebbe fuori, la coda e il piede restano quelli di oggi
  const solo = conStrato(runtime({ localStorage: ACCESO({ mappai_quarantena: '0' }) })), ms = manifest(initial(rapportoStrato()));
  solo.st._pipelineManifest = ms;
  const vista = solo.R.open('/vault', ms);
  assert.equal(vista.querySelector('[data-review-issue="issue"] .mrv-queue-state').textContent, 'Da decidere');
  assert.doesNotMatch(vista.querySelector('#mrv-next-step').textContent, /Non serve decidere tutto/);
  assert.match(vista.querySelector('[data-aff-blocco]').textContent, /Resterebbero fuori dai materiali con la quarantena/);
});

test('0042 giro 1: le parole dicono solo ciò che si sa — nodo senza frase indicata, collegamento non esaminato', () => {
  const report = { contratto: 'mappai-giudice@2', stato: 'completo',
    copertura: { nodiEsaminati: ['a', 'b'], nodiSaltati: [], linkEsaminati: [], linkSaltati: [{ source: 'a', target: 'b', rel: 'richiede', motivo: 'tempo scaduto' }] },
    issues: [{ id: 'vaga', target: { kind: 'node', id: 'b', field: 'desc' }, problem: 'Tono troppo netto' }] };
  const h = conStrato(runtime({ localStorage: ACCESO() })), m = manifest(initial(report));
  h.st._pipelineManifest = m;
  const blocco = h.R.open('/vault', m).querySelector('#mrv-coverage-details [data-aff-blocco]');
  const fuori = blocco.querySelector('[data-corsia="fuori-contestata"]');
  assert.ok(fuori && /Altro testo\./.test(fuori.textContent));
  assert.match(fuori.textContent, /il controllo ha segnalato il nodo senza dire quale frase/);
  assert.doesNotMatch(fuori.textContent, /contestata dal controllo/);
  assert.match(blocco.querySelector('[data-aff-conteggi]').textContent, /1 collegamenti che il controllo non ha esaminato/);
  assert.doesNotMatch(blocco.querySelector('[data-aff-conteggi]').textContent, /collegamenti da decidere/);
  assert.doesNotMatch(blocco.textContent, /[Ss]critte da te/);
});

test('0042: il Banco aperto con `alza` chiede il piano al motore; senza, resta quello di sempre', () => {
  const h = runtime(), m = manifest();
  h.window.MappAIModal = { prossimoZ: () => 12345 };
  const alzato = h.R.open('/vault', m, { alza: true });
  assert.equal(alzato.style.zIndex, '12345');
  const normale = h.R.open('/vault', m);
  assert.equal(normale.style.zIndex, undefined);
});

test('0042: un ricontrollo con `final` conserva bozze, final.review e consegne, e toglie il record della quarantena', async () => {
  const h = conStrato(runtime()), r = initial({ checkStatus: 'incomplete', issues: [{ id: 'existing', target: { kind: 'node', id: 'a' }, after: 'Dopo.' }] });
  const m = manifest(r);
  const g2 = Core.createReview({ db: { items: [{ id: 'q1', kind: 'mc', question: 'Domanda?' }] }, sources: SOURCES, report: { checkStatus: 'completed', issues: [] } });
  m.review.drafts = { B: { 'mc-auto': { id: 's1', items: [{ id: 'q1' }], quarantena: { firma: 'f1' } } }, C: {} };
  m.review.final = { stage: 'awaiting_review', items: [{ id: 'q1', kind: 'mc', question: 'Domanda?' }], review: g2, quarantena: { firma: 'f1' } };
  m.review.deliveries = [{ final: { stage: 'done' } }];
  m.review.quarantena = { schema: 'mappai-quarantena@1', firma: 'f1', completo: true };
  const prima = clone(m.review);
  h.window.executeJudgePass = async () => ({ checkStatus: 'completed', issues: [] });
  await h.R.retryJudge('/vault', m);
  assert.deepEqual(clone(m.review.final), prima.final, 'final.review sopravvive al ricontrollo');
  assert.deepEqual(clone(m.review.drafts), prima.drafts);
  assert.deepEqual(clone(m.review.deliveries), prima.deliveries);
  assert.equal(m.review.quarantena, undefined, 'dopo un ricontrollo il record non vale più');
  assert.equal(m.review.initial.checkStatus, 'completed');
  assert.deepEqual(clone(h.saved.manifest.review.final), prima.final, 'e sul disco');
  // anche il nuovo controllo dal Setup
  const s = conStrato(setupJudge());
  s.m.review.drafts = clone(prima.drafts); s.m.review.final = clone(prima.final); s.m.review.quarantena = clone(prima.quarantena);
  const prepared = s.R.prepareSetupJudge('/vault', s.m);
  await prepared.run();
  assert.deepEqual(clone(s.m.review.final), prima.final);
  assert.deepEqual(clone(s.m.review.drafts), prima.drafts);
  assert.equal(s.m.review.quarantena, undefined);
  // senza la cucitura, come prima: mergeRetry non porta i materiali
  const legacy = runtime(), ml = manifest(clone(r));
  ml.review.final = clone(prima.final);
  legacy.window.executeJudgePass = async () => ({ checkStatus: 'completed', issues: [] });
  await legacy.R.retryJudge('/vault', ml);
  assert.equal(ml.review.final, undefined);
});

test('0042: il ricontrollo di G2 sotto quarantena confronta i materiali con la vista, non con la mappa', async () => {
  const PENDENTE = 'La Svizzera pagava in franchi svizzeri tutto il suo oro.';
  const db = { nodes: [{ id: 'a', label: 'Oro', level: 0, desc: 'La Germania vendeva oro alla Svizzera durante la guerra. ' + PENDENTE },
    { id: 'b', label: 'Commercio', level: 1, desc: 'La Svizzera commerciava anche con gli Alleati durante la guerra.' }],
    links: [{ source: 'a', target: 'b', rel: 'include' }], sourcesDict: {} };
  const fonti = [{ nome: 'Libro.pdf', pages: [{ n: 4, text: 'La Germania vendeva oro alla Svizzera durante la guerra mondiale. La Svizzera commerciava anche con gli Alleati durante tutta la guerra.' }] }];
  const h = conStrato(runtime({ localStorage: ACCESO() }));
  h.st.db = clone(db);
  const review = Core.createReview({ db, sources: fonti, generationId: 'g', report: { contratto: 'mappai-giudice@2', stato: 'completo',
    copertura: { nodiEsaminati: ['a', 'b'], nodiSaltati: [] },
    issues: [{ id: 'i-oro', target: { kind: 'node', id: 'a', field: 'desc' }, problem: 'La fonte non dice «La Svizzera pagava in franchi svizzeri».' }] } });
  review.quarantena = require('../public/js/mappai-affermazioni-core').record(review, h.st.db);
  assert.equal(review.quarantena.completo, true, review.quarantena.motivo);
  const items = [{ id: 'q1', kind: 'mc', question: 'Chi vendeva oro?', options: ['La Germania', 'La Svizzera'], correctIndex: 0 }];
  review.final = { stage: 'awaiting_review', items: clone(items), review: Core.createReview({ db: { items }, sources: fonti, report: { checkStatus: 'incomplete', issues: [] } }) };
  const m = manifest(review); h.st._pipelineManifest = m;
  let materiale = null;
  h.window.MappAIMaterialReview = { ...Material, checkRemaining: async (_items, opts) => {
    materiale = opts.material.material;
    return { checkStatus: 'completed', coverage: { expectedIds: ['q1'], checkedIds: ['q1'], skipped: [] }, issues: [] };
  } };
  await h.R.retryMaterialJudge('/vault', m);
  assert.ok(materiale, 'il controllo è partito: il cancello avvolto consente con il record');
  assert.ok(!materiale.split('PASSAGGI ORIGINALI')[0].includes(PENDENTE), 'la frase contestata non è nel riferimento di G2');
  assert.match(materiale, /La Germania vendeva oro alla Svizzera/);
  assert.equal(h.st.db.nodes[0].desc, db.nodes[0].desc, 'la mappa non cambia');
  assert.equal(m.review.final.review.initial.checkStatus, 'completed');
});

/* ── Packet 0042, giro 2 del 26/09 ────────────────────────────────────────── */
test('0042 giro 2: dopo «Riprova il controllo» lo strato si ricalcola sulla copertura nuova, anche con le stesse segnalazioni', async () => {
  const parziale = { contratto: 'mappai-giudice@2', stato: 'parziale',
    copertura: { nodiEsaminati: ['a'], nodiSaltati: [{ id: 'b', motivo: 'tempo scaduto' }] },
    issues: [{ id: 'issue', target: { kind: 'node', id: 'a', field: 'desc' }, after: 'Dopo.', problem: 'Testo da correggere.' }] };
  const h = conStrato(runtime({ localStorage: ACCESO() })), m = manifest(initial(parziale));
  h.st._pipelineManifest = m;
  const modal = h.R.open('/vault', m);
  assert.match(modal.querySelector('#mrv-coverage-label').textContent, /descrizioni esaminate in almeno un giro: 1 \/ 2$/);
  assert.match(modal.querySelector('[data-aff-blocco]').textContent, /Altro testo\./, 'la frase del nodo non esaminato è fuori');
  // il ricontrollo esamina anche «b» e non trova niente di nuovo: stesse segnalazioni, stesse decisioni
  h.window.executeJudgePass = async () => ({ contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['a', 'b'], nodiSaltati: [] }, issues: [] });
  const firmaPrima = h.window.MappAIAffermazioniCore.firma(m.review, h.st.db, h.st.db.causalDoc);
  await modal.querySelector('#mrv-retry-judge').click();
  // giro 3, D6: la copertura sta nella firma — le bozze nate prima del ricontrollo non valgono più
  assert.notEqual(h.window.MappAIAffermazioniCore.firma(m.review, h.st.db, h.st.db.causalDoc), firmaPrima, 'la firma cambia con la copertura');
  assert.match(modal.querySelector('#mrv-coverage-label').textContent, /descrizioni esaminate in almeno un giro: 2 \/ 2$/);
  assert.doesNotMatch(modal.querySelector('[data-aff-blocco] [data-aff-gruppo="fuori"]')?.textContent || '', /Altro testo\./);
});

test('0042 giro 2: una segnalazione aperta che non toglie niente lo dice; il piede promette solo ciò che fa', () => {
  const report = { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['a', 'b'], nodiSaltati: [] },
    issues: [{ id: 'corretta', target: { kind: 'node', id: 'a', field: 'desc' }, problem: 'Troppo breve.' },
      { id: 'vaga', target: { kind: 'node', id: 'a', field: 'desc' }, problem: 'Tono troppo netto.' }] };
  const h = conStrato(runtime({ localStorage: ACCESO() }));
  const m = manifest(Core.setDecision(initial(report), 'corretta', 'manual', { text: 'Prima, con la correzione del docente.' }));
  h.st._pipelineManifest = m;
  const modal = h.R.open('/vault', m);
  // «a» contiene soltanto testo del docente: la segnalazione aperta non toglie niente dai materiali
  // (giro 4, E1: il testo non dice a quali frasi si riferisca — il controllo ha indicato il nodo;
  // giro 6, G1: dice che il testo scritto o ritoccato dal docente resta nei materiali)
  const statoVaga = modal.querySelector('[data-review-issue="vaga"] .mrv-queue-state').textContent;
  assert.equal(statoVaga, 'Da decidere · per ora non toglie niente dai materiali: il testo del nodo l’hai scritto o ritoccato tu con le tue decisioni, e resta nei materiali');
  assert.doesNotMatch(statoVaga, /frasi a cui si riferisce/);
  // giro 3, D4c: il piede dice che cosa succede quando la frase non si individua (giro 6, G1: il testo del docente resta;
  // giro 7, H6: se non ripete parola per parola una frase del nodo)
  assert.match(modal.querySelector('#mrv-next-step').textContent,
    /quando una segnalazione non permette di individuare la frase, lascia fuori tutto il nodo, ma il testo che hai scritto o ritoccato con una tua decisione resta nei materiali, se non ripete parola per parola una frase del nodo\./);
  assert.doesNotMatch(modal.querySelector('#mrv-next-step').textContent, /frasi ancora da decidere|quando le trova/);
  // giro 8 (I4): con la frase individuata esce ogni frase della mappa che la riprende (H3); senza, per le
  // segnalazioni del controllo, anche le frasi di altri nodi che la segnalazione ripete (H5, solo del Giudice: I3)
  assert.match(modal.querySelector('#mrv-next-step').textContent,
    /lascia fuori le frasi indicate dalle segnalazioni aperte, con ogni frase della mappa che le riprende;/);
  assert.match(modal.querySelector('#mrv-next-step').textContent,
    /una frase del nodo\. In quel caso, se la segnalazione viene dal controllo, possono restare fuori anche frasi di altri nodi che ripete\. I materiali passano comunque dalla tua revisione\./);
});

test('0042 giro 3 (D4a): lo stato «superata» non dice a quali frasi si riferisse la segnalazione', () => {
  // il docente toglie con «Modifica» la frase contestata; una seconda segnalazione aperta la citava
  const TOLTA = 'La Germania pagava in oro rubato.';
  const db = { nodes: [{ id: 'a', label: 'Germania', level: 0, desc: 'Prima. ' + TOLTA + ' Poi altro.' }, { id: 'b', label: 'Svizzera', level: 1, desc: 'Altro testo.' }],
    links: [{ source: 'a', target: 'b', rel: 'include' }], sourcesDict: {} };
  const report = { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['a', 'b'], nodiSaltati: [] },
    issues: [{ id: 'taglio', target: { kind: 'node', id: 'a', field: 'desc' }, problem: 'Frase da togliere.' },
      { id: 'citata', target: { kind: 'node', id: 'a', field: 'desc' }, problem: 'La fonte non dice «La Germania pagava in oro rubato».' }] };
  const h = conStrato(runtime({ localStorage: ACCESO() }));
  h.st.db = clone(db);
  const m = manifest(Core.setDecision(Core.createReview({ db, sources: SOURCES, report }), 'taglio', 'manual', { text: 'Prima. Poi altro.' }));
  h.st._pipelineManifest = m;
  const modal = h.R.open('/vault', m);
  const stato = modal.querySelector('[data-review-issue="citata"] .mrv-queue-state').textContent;
  assert.equal(stato, 'Da decidere · il passo contestato non si ritrova più nel testo che hai corretto: per ora non toglie niente dai materiali');
  assert.doesNotMatch(stato, /frasi a cui si riferisce|già cambiato/);
  // e il resto del nodo non esce (D1): nel blocco il gruppo «fuori» non c'è
  assert.equal(modal.querySelector('[data-aff-blocco] [data-aff-gruppo="fuori"]'), null);
});

test('0042 giro 3 (D4c), giro 6 (G1): il riquadro del Setup dice che, quando la frase non si individua, esce tutto il nodo tranne il testo del docente', () => {
  const h = conStrato(runtime({ localStorage: ACCESO() }));
  const host = h.dom.document.createElement('div');
  h.window.MappAIAffermazioniUI.disegnaSetup(host);
  // giro 7 (H6): se non ripete parola per parola una frase del nodo
  assert.match(host.textContent, /Quando una segnalazione non permette di individuare la frase, resta fuori tutto il nodo, ma il testo che hai scritto o ritoccato con una tua decisione resta nei materiali, se non ripete parola per parola una frase del nodo\./);
  // giro 7 (H10): nei nodi non esaminati il testo del docente resta, e il riquadro lo dice
  assert.match(host.textContent, /quelle dei nodi che il controllo non ha esaminato \(tranne il testo che hai scritto o ritoccato tu\)\./);
  // giro 8 (I4): con la frase individuata esce ogni frase della mappa che la riprende; senza, per le
  // segnalazioni del controllo, anche le frasi di altri nodi che la segnalazione ripete
  assert.match(host.textContent, /\(tranne il testo che hai scritto o ritoccato tu\)\. Quando la frase contestata è individuata, resta fuori ogni frase della mappa che la riprende\. Quando una segnalazione/);
  assert.match(host.textContent, /una frase del nodo\. In quel caso, se la segnalazione viene dal controllo, possono restare fuori anche frasi di altri nodi che ripete\. La revisione dei materiali si apre sempre\./);
});

test('0042 giro 2: il documento dei nessi che non va ai materiali si dice, nel Banco e nel riepilogo', () => {
  const CC = require('../public/js/mappai-causal-core.js');
  const db = { nodes: [{ id: 'a', label: 'Economia di guerra', level: 0, desc: 'La guerra provocò la fame. Il razionamento del cibo valeva per tutti.' },
    { id: 'b', label: 'Svizzera', level: 1, desc: 'Altro testo.' }], links: [{ source: 'a', target: 'b', rel: 'include' }], sourcesDict: {} };
  db.causalDoc = CC.docFromChains(CC.buildChains({ nodes: db.nodes, links: db.links }), {});
  const report = { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['a', 'b'], nodiSaltati: [] },
    issues: [{ id: 'fame', target: { kind: 'node', id: 'a', field: 'desc' }, problem: 'La fonte parla di carestia.' }] };
  const h = conStrato(runtime({ localStorage: ACCESO() }));
  h.st.db = clone(db);
  const rv = Core.setDecision(Core.createReview({ db, sources: SOURCES, report }), 'fame', 'manual',
    { text: 'La guerra provocò la carestia. Il razionamento del cibo valeva per tutti.' });
  const m = manifest(rv); h.st._pipelineManifest = m;
  const blocco = h.R.open('/vault', m).querySelector('[data-aff-blocco]');
  // giro 4, E3: prima di generare si dice che cosa succederà, e il motivo vero
  assert.equal(blocco.querySelector('[data-aff-causal]').textContent, 'Con «Genera materiali» la catena dei perché che hai rivisto non verrà usata: ' +
    'una tua decisione ha cambiato un nodo o un collegamento che vi compare. Se chiedi la catena, sarà ricavata dal testo usato per i materiali, senza le tue modifiche.');
  // il riepilogo lo legge dalla ricevuta, con le segnalazioni che non tolgono niente e i collegamenti tolti
  const UI = h.window.MappAIAffermazioniUI;
  const conteggi = { fuori: { totale: 2, giudice: 2, docente: 0, nonEsaminate: 0, coesione: 0 }, superate: 4, senzaEffetto: 2, linkEsclusi: 2, linkNonEsaminati: 1 };
  // giro 3, D4b: la frase sulla catena compare solo se la catena è nata in questo giro (passo E concluso, bozza con la stessa firma)
  const ric = { firma: 'q-1', conteggi, causalDocScartato: true, causalDocMotivo: 'decisione_descrizione', svuotati: [] };
  const conCatena = { steps: { E: { status: 'done' } }, review: { final: { quarantena: ric },
    drafts: { B: {}, C: {}, E: { chains: { total: 1 }, quarantena: { firma: 'q-1' }, published: true } } } };
  const riepilogo = UI.rigaRiepilogo(conCatena, db);
  assert.match(riepilogo, /6 segnalazioni aperte non tolgono niente dai materiali · 2 collegamenti fuori dai materiali \(1 mai esaminati dal controllo\)/);
  assert.match(riepilogo, /data-aff-causal[^>]*>La catena dei perché che hai rivisto non è stata usata: una tua decisione ha cambiato un nodo o un collegamento che vi compare\. Nei materiali c’è la catena/);
  const senzaCatena = [
    { steps: { E: { status: 'skipped' } }, review: { final: { quarantena: ric }, drafts: { B: {}, C: {} } } },   // nessun nesso: catena non generata
    { steps: { E: { status: 'pending' } }, review: { final: { quarantena: ric }, drafts: { B: {}, C: {} } } },   // catena non chiesta
    { review: { final: { quarantena: ric } } },
    { steps: { E: { status: 'done' } }, review: { final: { quarantena: ric }, drafts: { E: { chains: { total: 1 }, quarantena: { firma: 'q-vecchia' } } } } }
  ];
  senzaCatena.forEach((m, i) => assert.doesNotMatch(UI.rigaRiepilogo(m, db), /data-aff-causal/, 'caso ' + i));
  assert.match(UI.rigaRiepilogo(senzaCatena[0], db), /id="mps-aff"/, 'il resto del riepilogo c\'è');
  const uno = UI.rigaRiepilogo({ review: { final: { quarantena: { conteggi: Object.assign({}, conteggi, { superate: 0, senzaEffetto: 1, linkEsclusi: 1, linkNonEsaminati: 0 }), svuotati: [] } } } }, db);
  assert.match(uno, /1 segnalazione aperta non toglie niente dai materiali · 1 collegamento fuori dai materiali</);
  assert.doesNotMatch(uno, /data-aff-causal/);
});

/* ── Packet 0042, giro 4 del 26/09 ────────────────────────────────────────── */
test('0042 giro 4 (E1): una frase ritoccata dal docente che ripete ancora il passo contestato — lo stato lo dice, la riga pure', () => {
  const PRIMA = 'Il Consiglio Federale ha scritto la dichiarazione di neutralità grazie a un mandato speciale.';
  const MANDATO = 'Questo mandato è un incarico ufficiale dato dall\'Assemblea Federale, l\'organo che rappresenta il popolo e i cantoni, per gestire la situazione di guerra.';
  const db = { nodes: [{ id: 'a', label: 'Mandato', level: 0, desc: PRIMA + ' ' + MANDATO }, { id: 'b', label: 'Svizzera', level: 1, desc: 'Altro testo.' }],
    links: [{ source: 'a', target: 'b', rel: 'include' }], sourcesDict: {} };
  const report = { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['a', 'b'], nodiSaltati: [] },
    issues: [{ id: 'deciso', target: { kind: 'node', id: 'a', field: 'desc' }, problem: 'La fonte non definisce l\'Assemblea Federale come \'l\'organo che rappresenta il popolo e i cantoni\'.' },
      { id: 'aperta', target: { kind: 'node', id: 'a', field: 'desc' }, problem: 'La fonte non definisce l\'Assemblea Federale come l\'organo che rappresenta il popolo e i cantoni.' }] };
  const h = conStrato(runtime({ localStorage: ACCESO() }));
  h.st.db = clone(db);
  const m = manifest(Core.setDecision(Core.createReview({ db, sources: SOURCES, report }), 'deciso', 'manual',
    { text: PRIMA + ' ' + MANDATO.replace('è un incarico', 'è stato un incarico') }));
  h.st._pipelineManifest = m;
  const modal = h.R.open('/vault', m);
  const stato = modal.querySelector('[data-review-issue="aperta"] .mrv-queue-state').textContent;
  // giro 5 (F3): la riprende per contenimento — «somiglia», mai «contiene»
  assert.equal(stato, 'Da decidere · una frase che hai ritoccato somiglia ancora al passo contestato: resta fuori dai materiali finché non decidi');
  assert.doesNotMatch(stato, /contiene/);
  assert.doesNotMatch(stato, /non si ritrova più/, 'non è «superata»: il passo c\'è ancora');
  const fuori = modal.querySelector('[data-aff-blocco] [data-corsia="fuori-contestata"]');
  assert.ok(fuori && /è stato un incarico/.test(fuori.textContent));
  assert.match(fuori.textContent, /l’hai ritoccata, ma somiglia ancora al passo contestato: da decidere/);
  assert.doesNotMatch(fuori.textContent, /contiene/);
});

test('0042 giro 4 (E3): il documento dei nessi — il motivo vero per frase e collegamento, nel Banco prima di generare e senza quarantena', () => {
  const CC = require('../public/js/mappai-causal-core.js');
  const db = { nodes: [{ id: 'a', label: 'Economia di guerra', level: 0, desc: 'La guerra provocò la fame. Il razionamento del cibo valeva per tutti.' },
    { id: 'b', label: 'Svizzera', level: 1, desc: 'Altro testo.' }], links: [{ source: 'a', target: 'b', rel: 'causa' }], sourcesDict: {} };
  db.causalDoc = CC.docFromChains(CC.buildChains({ nodes: db.nodes, links: db.links }), {});
  const casi = [
    // una frase del documento è contestata da una segnalazione aperta
    { issues: [{ id: 'fame', target: { kind: 'node', id: 'a', field: 'desc' }, problem: 'La fonte non dice «La guerra provocò la fame».' }],
      motivo: 'contiene una frase che la quarantena tiene fuori dai materiali' },
    // il collegamento del documento è da decidere
    { issues: [{ id: 'rel', target: { kind: 'link', source: 'a', target: 'b', rel: 'causa', field: '$link' }, after: null, problem: 'Il collegamento non è sostenuto.' }],
      motivo: 'contiene un collegamento che la quarantena tiene fuori dai materiali' },
    // giro 5 (F3): la riga del documento viene da un nodo con una frase esclusa, ma non la contiene
    { issues: [{ id: 'razionamento', target: { kind: 'node', id: 'a', field: 'desc' }, problem: 'La fonte non dice «Il razionamento del cibo valeva per tutti».' }],
      motivo: 'tocca un nodo con frasi che la quarantena tiene fuori' }
  ];
  for (const caso of casi) {
    const report = { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['a', 'b'], nodiSaltati: [],
      linkEsaminati: [{ source: 'a', target: 'b', rel: 'causa' }], linkSaltati: [] }, issues: caso.issues };
    for (const quarantena of ['1', '0']) {
      const h = conStrato(runtime({ localStorage: ACCESO({ mappai_quarantena: quarantena }) }));
      h.st.db = clone(db);
      const m = manifest(Core.createReview({ db, sources: SOURCES, report })); h.st._pipelineManifest = m;
      const p = h.R.open('/vault', m).querySelector('[data-aff-blocco] [data-aff-causal]');
      assert.ok(p, caso.motivo);
      const testo = p.textContent;
      assert.ok(testo.includes(': ' + caso.motivo + '.'), testo);
      assert.doesNotMatch(testo, /[Nn]ei materiali c’è|contiene frasi o collegamenti/, 'prima di generare non si parla della catena nei materiali');
      assert.match(testo, quarantena === '1' ? /^Con «Genera materiali» la catena dei perché che hai rivisto non verrà usata/ : /^Con la quarantena la catena dei perché che hai rivisto non andrebbe ai materiali/);
    }
  }
});

test('0042 giro 4 (E3): nel riepilogo la frase sulla catena solo se la catena è stata pubblicata, con almeno un nesso dopo G2', () => {
  const h = conStrato(runtime({ localStorage: ACCESO() })), UI = h.window.MappAIAffermazioniUI;
  const db = { nodes: [{ id: 'a', label: 'Economia', level: 0, desc: 'Testo.' }], links: [] };
  const conteggi = { fuori: { totale: 1, giudice: 1, docente: 0, nonEsaminate: 0, coesione: 0 }, superate: 0, senzaEffetto: 0, linkEsclusi: 0, linkNonEsaminati: 0 };
  const ric = { firma: 'q-1', conteggi, causalDocScartato: true, causalDocMotivo: 'frase_esclusa', svuotati: [] };
  const giro = E => ({ steps: { E: { status: 'done' } }, review: { final: { stage: 'done', quarantena: ric }, drafts: { B: {}, C: {}, E } } });
  // passo E «done» ma la bozza non pubblicata (G2 non ancora approvata), oppure G2 ha escluso tutti i nessi
  assert.doesNotMatch(UI.rigaRiepilogo(giro({ chains: { total: 2 }, quarantena: { firma: 'q-1' } }), db), /data-aff-causal/);
  assert.doesNotMatch(UI.rigaRiepilogo(giro({ chains: { total: 0 }, quarantena: { firma: 'q-1' }, published: true }), db), /data-aff-causal/);
  const pubblicata = UI.rigaRiepilogo(giro({ chains: { total: 2 }, quarantena: { firma: 'q-1' }, published: true }), db);
  assert.match(pubblicata, /data-aff-causal[^>]*>La catena dei perché che hai rivisto non è stata usata: contiene una frase che la quarantena tiene fuori dai materiali\. Nei materiali c’è la catena ricavata/);
});

/* ── Packet 0042, giro 5 del 26/09 (F3) ───────────────────────────────────── */
test('0042 giro 5 (F3): una frase (non del docente) che somiglia al passo contestato, in un nodo cambiato da una decisione — la riga dice «somiglia», non «contestata»', () => {
  const PRIMA = 'Il Consiglio Federale ha scritto la dichiarazione di neutralità grazie a un mandato speciale.';
  const MANDATO = 'Questo mandato è un incarico ufficiale dato dall\'Assemblea Federale, l\'organo che rappresenta il popolo e i cantoni, per gestire la situazione di guerra.';
  const SIMILE = 'Il mandato era un incarico ufficiale dato dall\'Assemblea Federale, l\'organo che rappresenta il popolo e i cantoni.';
  const db = { nodes: [{ id: 'a', label: 'Mandato', level: 0, desc: PRIMA + ' ' + MANDATO },
    { id: 'c', label: 'Assemblea', level: 1, desc: 'Le sessioni duravano poche settimane. ' + SIMILE }],
    links: [{ source: 'a', target: 'c', rel: 'include' }], sourcesDict: {} };
  const report = { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['a', 'c'], nodiSaltati: [] },
    issues: [{ id: 'sessioni', target: { kind: 'node', id: 'c', field: 'desc' }, problem: 'La fonte non parla di settimane.' },
      { id: 'aperta', target: { kind: 'node', id: 'a', field: 'desc' }, problem: 'La fonte non definisce l\'Assemblea Federale come l\'organo che rappresenta il popolo e i cantoni.' }] };
  const h = conStrato(runtime({ localStorage: ACCESO() }));
  h.st.db = clone(db);
  const m = manifest(Core.setDecision(Core.createReview({ db, sources: SOURCES, report }), 'sessioni', 'manual',
    { text: 'Le sessioni si tenevano a Berna. ' + SIMILE }));
  h.st._pipelineManifest = m;
  const modal = h.R.open('/vault', m);
  const righe = Array.from(modal.querySelectorAll('[data-aff-blocco] [data-corsia="fuori-contestata"]'));
  const simile = righe.find(r => /Il mandato era/.test(r.textContent));
  assert.ok(simile, 'la frase simile del nodo cambiato è fuori');
  assert.match(simile.textContent, /somiglia a un passo contestato, da decidere/);
  assert.doesNotMatch(simile.textContent, /contestata dal controllo/);
});

/* ── Packet 0042, giro 7 del 26/09 (H10): i testi del Banco dicono ciò che il sistema sa ── */
test('0042 giro 7 (H10): in modo \'nodo\' il perché si guarda prima della via — l\'altro nodo e il problema che parla d\'altro hanno un testo loro; «docente» solo se niente del nodo è fuori', () => {
  const ECONOMIA = 'La Svizzera adottò il piano Wahlen per garantire il cibo alla popolazione. Lo Stato usò un sistema di razionamento per dividere le provvigioni in modo controllato.';
  const BASE_D = 'La Svizzera fu criticata. Inoltre, lo Stato è accusato di aver aiutato la Germania fornendo materiale militare.';
  const db = { nodes: [{ id: 'a', label: 'Economia', level: 0, desc: ECONOMIA },
    { id: 'b', label: 'Commercio', level: 1, desc: 'La convenzione dell’Aia è un accordo internazionale. Questo accordo permette agli stati neutrali di commerciare liberamente con i paesi in guerra.' },
    { id: 'c', label: 'Razionamento', level: 1, desc: 'Il razionamento durò fino al 1948.' },
    { id: 'd', label: 'Accuse', level: 1, desc: BASE_D }],
  links: [{ source: 'a', target: 'b', rel: 'include' }, { source: 'a', target: 'c', rel: 'include' }, { source: 'a', target: 'd', rel: 'include' }], sourcesDict: {} };
  const report = { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['a', 'b', 'c', 'd'], nodiSaltati: [] },
    issues: [
      // il caso 899d5 di Svizzera: segnala «Economia», il problema parla del commercio con i belligeranti
      { id: 'i-899', target: { kind: 'node', id: 'a', field: 'desc' },
        problem: 'La Svizzera ha adottato misure per conservare la sua neutralità durante la Seconda Guerra Mondiale. Tuttavia, non è vero che ha commercio liberamente con tutti i paesi belligeranti' },
      { id: 'i-sposta', target: { kind: 'node', id: 'c', field: 'desc' }, problem: 'Troppo breve.' },
      { id: 'i-d-deciso', target: { kind: 'node', id: 'd', field: 'desc' }, problem: 'Da riscrivere.' },
      { id: 'i-d-citata', target: { kind: 'node', id: 'd', field: 'desc' },
        problem: 'La fonte non dice «Inoltre, lo Stato è accusato di aver aiutato la Germania fornendo materiale militare».' },
      { id: 'i-d-vaga', target: { kind: 'node', id: 'd', field: 'desc' }, problem: 'Tono troppo netto' }] };
  let rv = Core.createReview({ db, sources: SOURCES, report });
  // il docente sposta PAROLA PER PAROLA una frase di «Economia» in «Razionamento» (H6: non è testo suo)
  rv = Core.setDecision(rv, 'i-sposta', 'manual', { text: 'Il razionamento durò fino al 1948. Lo Stato usò un sistema di razionamento per dividere le provvigioni in modo controllato.' });
  rv = Core.setDecision(rv, 'i-d-deciso', 'manual', { text: 'La Confederazione ricevette molte critiche. Inoltre, la Svizzera è stata accusata di aver prolungato la guerra rifornendo la Germania di materiale militare.' });
  const h = conStrato(runtime({ localStorage: ACCESO() }));
  h.st.db = clone(db);
  const m = manifest(rv); h.st._pipelineManifest = m;
  const modal = h.R.open('/vault', m);
  const blocco = modal.querySelector('[data-aff-blocco]');
  const rigaDi = inizio => blocco.querySelectorAll('[data-corsia="fuori-contestata"]').find(r => r.querySelector('.mrv-aff-testo').textContent.startsWith(inizio));
  // la frase dell'altro nodo di cui parla il problema (H5)
  const problema = rigaDi('Questo accordo permette');
  assert.ok(problema, 'la frase di «Commercio» è fuori');
  assert.match(problema.textContent, /il controllo ha segnalato un altro nodo, ma il problema che descrive parla di questa frase: da decidere/);
  // la frase base spostata in un altro nodo: somiglia a una frase del nodo segnalato — non «l'hai ritoccata, ma somiglia al passo contestato»
  const spostata = rigaDi('Lo Stato usò');
  const nelNodo = blocco.querySelectorAll('[data-corsia="fuori-contestata"]').filter(r => r.querySelector('.mrv-aff-testo').textContent.startsWith('Lo Stato usò'));
  assert.equal(nelNodo.length, 2, 'la frase in «Economia» e la copia in «Razionamento»');
  const inC = nelNodo.find(r => /^Razionamento/.test(r.querySelector('.mrv-aff-nodo').textContent));
  const inA = nelNodo.find(r => /^Economia/.test(r.querySelector('.mrv-aff-nodo').textContent));
  assert.ok(spostata && inC && inA);
  assert.match(inC.textContent, /somiglia a una frase di un nodo che il controllo ha segnalato senza dire quale frase contesta, da decidere/);
  assert.doesNotMatch(inC.textContent, /l’hai ritoccata/);
  assert.match(inA.textContent, /il controllo ha segnalato il nodo senza dire quale frase, da decidere/);
  // la frase ritoccata che riprende il passo CITATO resta «ritoccata»: lì il passo si sa
  assert.match(rigaDi('Inoltre, la Svizzera').textContent, /l’hai ritoccata, ma somiglia ancora al passo contestato/);
  // «Accuse» è tutto del docente, ma una sua frase è fuori per la citata: la 'nodo' non dice «resta nei materiali»
  const stato = modal.querySelector('[data-review-issue="i-d-vaga"] .mrv-queue-state').textContent;
  assert.equal(stato, 'Da decidere · da sola non toglie niente dai materiali: il testo del nodo l’hai scritto o ritoccato tu, ma una sua parte resta fuori per un’altra segnalazione aperta');
  assert.doesNotMatch(stato, /e resta nei materiali/);
});

/* ── Packet 0041: le frasi della fonte rimaste fuori dalla mappa ──────────────
   Tre frasi di Svizzera: una ripresa dalla mappa, una orfana (il raid aereo) e
   una a cui mancano 45% e 1942. Il core vero, la cucitura e l'interfaccia vere. */
const ORF_DB = { nodes: [
  { id: 'a', label: 'Mobilitazione', level: 0, desc: 'Per proteggere il territorio, lo Stato ha decretato la mobilitazione generale, che significa chiamare tutti i soldati al servizio.' },
  { id: 'b', label: 'Esportazioni verso l’Asse', level: 1, desc: 'Tra il 1940 e il 1944, la Germania è stata il paese che ha comprato più prodotti svizzeri. ' +
    'Le esportazioni svizzere andavano soprattutto alle due potenze dell’Asse, Germania e Italia.' },
  { id: 'c', label: 'Fortezze', level: 1, desc: 'Queste basi facevano parte del Ridotto nazionale, un piano per resistere in caso di invasione.' }],
  links: [{ source: 'a', target: 'b', rel: 'include' }, { source: 'a', target: 'c', rel: 'include' }], sourcesDict: {} };
const ORF_SOURCES = [{ nome: 'Svizzera.pdf', pages: [
  { n: 2, text: '- decretò la mobilitazione generale, chiamando tutti i soldati al servizio del paese; - informò la popolazione sul comportamento da adottare in caso di raid aereo.' },
  { n: 4, text: 'Le due potenze dell’Asse (Germania e Italia) erano destinatarie del 45% delle esportazioni svizzere negli anni 1940 - 1942.' }] }];
const ORF_45 = 'Le due potenze dell’Asse (Germania e Italia) erano destinatarie del 45% delle esportazioni svizzere negli anni 1940 - 1942.';
function revisioneOrfane() {
  return Core.createReview({ db: ORF_DB, sources: ORF_SOURCES, report: { contratto: 'mappai-giudice@2', stato: 'completo',
    copertura: { nodiEsaminati: ['a', 'b', 'c'], nodiSaltati: [] },
    issues: [{ id: 'issue', target: { kind: 'node', id: 'c', field: 'desc' }, problem: 'Il nodo non dice dove stavano le basi.' }] } });
}
function bancoOrfane(localStorage, prima) {
  const h = runtime({ localStorage });
  if (localStorage) conStrato(h);
  if (prima) prima(h);
  h.st.db = clone(ORF_DB);
  const m = manifest(revisioneOrfane()); h.st._pipelineManifest = m;
  return { h, m, modal: h.R.open('/vault', m) };
}

test('0041: da spento il Banco è quello del 0042 — nessun blocco; da acceso l’unica differenza è il blocco in coda', () => {
  const spento = bancoOrfane(ACCESO()), zero = bancoOrfane(ACCESO({ mappai_frasi_orfane: '0' })), acceso = bancoOrfane(ACCESO({ mappai_frasi_orfane: '1' }));
  assert.ok(spento.modal.querySelector('[data-aff-blocco]'), 'il blocco del 0042 c’è');
  assert.equal(spento.modal.querySelector('[data-aff-orfane]'), null);
  assert.equal(zero.h.dom.html(), spento.h.dom.html());
  const blocco = acceso.modal.querySelector('#mrv-coverage-details [data-aff-blocco] [data-aff-orfane]');
  assert.ok(blocco, 'il blocco nuovo sta in coda a quello del 0042');
  blocco.remove();
  assert.equal(acceso.h.dom.html(), spento.h.dom.html(), 'tolto il blocco nuovo, il Banco è lo stesso byte per byte');
  // l'interruttore da solo, con lo strato spento, non fa niente: il Banco è quello di sempre
  const base = bancoOrfane(null);
  const solo = bancoOrfane({ getItem: k => (k === 'mappai_frasi_orfane' ? '1' : SPENTI_0089.has(k) ? '0' : null), setItem() {} });
  assert.equal(solo.h.dom.html(), base.h.dom.html());
  assert.equal([spento, acceso, solo].reduce((n, x) => n + x.h.calls.manifest, 0), 0, 'aprire il Banco non scrive niente');
  // il riepilogo: con l'interruttore spento la riga del 0042 non cambia
  const ric = { firma: 'q-1', conteggi: { fuori: { totale: 1, giudice: 1, docente: 0, nonEsaminate: 0, coesione: 0 }, superate: 0, senzaEffetto: 0, linkEsclusi: 0, linkNonEsaminati: 0 }, svuotati: [] };
  const giro = () => ({ review: Object.assign(revisioneOrfane(), { final: { quarantena: ric } }) });
  const riga0042 = spento.h.window.MappAIAffermazioniUI.rigaRiepilogo(giro(), clone(ORF_DB));
  assert.doesNotMatch(riga0042, /data-aff-orfane/);
  const riga0041 = acceso.h.window.MappAIAffermazioniUI.rigaRiepilogo(giro(), clone(ORF_DB));
  // giro di correzione del 27/09: il riepilogo dice anche DOVE sta l'elenco (dentro «Copertura del controllo», che si apre a mano)
  assert.match(riga0041, /data-aff-orfane>Frasi della fonte rimaste fuori dalla mappa: 2 \(1 che la mappa riprende poco o per niente, 1 con elementi mancanti\)\. L’elenco è in «Rivedi i contenuti», sotto «Copertura del controllo»\.</);
  assert.equal(riga0041.replace(/<div class="pm-option-desc" data-aff-orfane>[^<]*<\/div>/, ''), riga0042);
  // G1 approvata: l'elenco nel Banco non c'è, e il riepilogo non ci manda
  const approvata = giro(); approvata.review.initial.status = 'approved';
  assert.doesNotMatch(acceso.h.window.MappAIAffermazioniUI.rigaRiepilogo(approvata, clone(ORF_DB)), /data-aff-orfane/);
});

test('0041: da acceso il blocco elenca le frasi rimaste fuori; «Mostra nella fonte» e «Correggi il nodo vicino» portano ai posti giusti', async () => {
  const mostrate = [];
  const { h, modal } = bancoOrfane(ACCESO({ mappai_frasi_orfane: '1' }), x => {
    x.window.MappAIReviewFonte = { monta: () => ({ mostra: prove => mostrate.push(clone(prove)), smonta() {} }) };
  });
  const blocco = modal.querySelector('#mrv-coverage-details [data-aff-orfane]');
  assert.equal(blocco.querySelector('summary').textContent, 'Frasi della fonte rimaste fuori (2)');
  /* gate 3 del 27/09 (Giacomo, niente sovraccarico): a schermo una riga sola; le avvertenze sui limiti del
     confronto restano, nel suggerimento del titolo */
  assert.equal(blocco.querySelector('[data-aff-orf-nota]').textContent, 'Da rileggere nella fonte: la mappa non le riprende, o le riprende senza un numero, una data o un nome.');
  assert.match(blocco.querySelector('summary').getAttribute('title'), /Il confronto è fra parole.*Le frasi molto brevi e quelle che finiscono in un vuoto da riempire non si confrontano.*l’elenco non garantisce che la mappa riprenda tutto\.$/);
  assert.doesNotMatch(blocco.textContent, /verificat|coperta/i, 'nessun certificato (inv. 22)');
  const orfana = blocco.querySelector('[data-aff-orf-gruppo="orfane"] [data-aff-orf-riga]');
  // giro di correzione del 27/09: con «Fortezze» il raid aereo ha in comune solo «caso» — niente nodo, niente bottone
  assert.equal(orfana.querySelector('.mrv-aff-nodo').textContent, 'Pagina 2');
  assert.equal(orfana.querySelector('[data-aff-orf-correggi]'), null);
  assert.equal(orfana.querySelector('.mrv-aff-testo').textContent, '- informò la popolazione sul comportamento da adottare in caso di raid aereo.');
  assert.equal(orfana.querySelector('[data-aff-orf-manca]'), null);
  const manca = blocco.querySelector('[data-aff-orf-gruppo="mancanti"] [data-aff-orf-riga]');
  assert.equal(manca.querySelector('.mrv-aff-nodo').textContent, 'Pagina 4 · nodo più simile per parole: Esportazioni verso l’Asse');
  assert.equal(manca.querySelector('[data-aff-orf-manca]').textContent, 'Nella mappa manca: 45%, 1942');
  assert.match(blocco.querySelector('[data-aff-orf-gruppo="orfane"] .mrv-field-label').textContent, /^Riprese poco o per niente dalla mappa \(1\)$/);
  assert.deepEqual(blocco.querySelectorAll('button').map(b => b.type), ['button', 'button', 'button']);
  assert.equal(blocco.querySelectorAll('[data-aff-orf-altre]').length, 0);
  // «Mostra nella fonte»: la frase e la sua pagina al pannello della fonte
  mostrate.length = 0;
  await manca.querySelector('[data-aff-orf-fonte]').click();
  assert.deepEqual(mostrate, [[{ text: ORF_45, page: 4 }]]);
  // «Correggi il nodo vicino»: il riquadro «Correggi anche un nodo non segnalato», col nodo scelto e il suo testo
  const altri = modal.querySelector('#mrv-other-nodes');
  assert.equal(altri.getAttribute('open'), undefined);
  assert.equal(modal.querySelector('#mrv-add-node').disabled, true);
  await manca.querySelector('[data-aff-orf-correggi]').click();
  assert.notEqual(altri.getAttribute('open'), undefined, 'il riquadro si apre');
  assert.equal(altri.querySelector('label select').value, 'b');
  assert.equal(altri.querySelector('p').textContent, ORF_DB.nodes[1].desc, 'l’anteprima del nodo, come dopo una scelta a mano');
  assert.equal(modal.querySelector('#mrv-add-node').disabled, false);
  assert.equal(h.calls.manifest, 0, 'scegliere il nodo non scrive niente: si aggiunge con «Aggiungi alla revisione»');
  // e il gesto porta davvero alla revisione del nodo scelto
  await modal.querySelector('#mrv-add-node').click();
  assert.ok(h.st._pipelineManifest.review.initial.issues.some(i => i.origin === 'teacher' && i.target.kind === 'node' && String(i.target.id) === 'b'), 'una «Modifica del docente» sul nodo scelto');
});

test('0041: il blocco vive solo in G1; con la mappa cambiata resta, e l’elenco lungo si taglia a 12 per gruppo', () => {
  // G2: lo strato non c'è, quindi nemmeno le frasi rimaste fuori
  const g2 = conStrato(runtime({ localStorage: ACCESO({ mappai_frasi_orfane: '1' }) })), m2 = manifest();
  m2.review.final = { stage: 'awaiting_review', items: [], review: Core.createReview({ db: { items: [] }, sources: SOURCES, report: { checkStatus: 'completed', issues: [] } }) };
  assert.equal(g2.R.open('/vault', m2, { final: true }).querySelector('[data-aff-orfane]'), null);
  // la mappa cambiata dopo il controllo: il blocco del 0042 lo dice, le frasi rimaste fuori si calcolano sulla mappa viva
  const cambiata = bancoOrfane(ACCESO({ mappai_frasi_orfane: '1' }), x => { x.st.db = clone(ORF_DB); });
  cambiata.h.st.db.nodes[1].desc += ' Nel 1942 il 45% delle esportazioni andava all’Asse.';
  const modal = cambiata.h.R.open('/vault', cambiata.m);
  assert.match(modal.querySelector('[data-aff-blocco]').textContent, /La mappa è cambiata dopo il controllo/);
  assert.equal(modal.querySelector('[data-aff-orfane] summary').textContent, 'Frasi della fonte rimaste fuori (1)');
  assert.equal(modal.querySelector('[data-aff-orf-gruppo="mancanti"]'), null, 'il 45% e il 1942 ora ci sono');
  // tanti raid aerei: 12 righe e il conto delle altre
  const molte = [{ nome: 'Svizzera.pdf', pages: Array.from({ length: 15 }, (_, i) => ({ n: i + 1,
    text: 'Il bollettino numero ' + (i + 1) + ' informò la popolazione sul comportamento da adottare in caso di raid aereo.' })) }];
  const h = conStrato(runtime({ localStorage: ACCESO({ mappai_frasi_orfane: '1' }) }));
  h.st.db = clone(ORF_DB);
  const rv = Core.createReview({ db: ORF_DB, sources: molte, report: { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['a', 'b', 'c'], nodiSaltati: [] },
    issues: [{ id: 'issue', target: { kind: 'node', id: 'c', field: 'desc' }, problem: 'Il nodo non dice dove stavano le basi.' }] } });
  const mm = manifest(rv); h.st._pipelineManifest = mm;
  const lungo = h.R.open('/vault', mm).querySelector('[data-aff-orfane]');
  assert.equal(lungo.querySelector('summary').textContent, 'Frasi della fonte rimaste fuori (15)');
  assert.equal(lungo.querySelectorAll('[data-aff-orf-riga]').length, 12);
  assert.deepEqual(lungo.querySelectorAll('[data-aff-orf-riga] .mrv-aff-nodo').map(p => p.textContent.split(' · ')[0]),
    Array.from({ length: 12 }, (_, i) => 'Pagina ' + (i + 1)), 'in ordine di pagina');
  assert.equal(lungo.querySelector('[data-aff-orf-altre="orfane"]').textContent, 'Altre frasi non mostrate: 3');
});

test('0041, giro di correzione: la voce d’elenco corta entra nell’elenco; a zero righe la nota conta le frasi e dice che cosa non vede', () => {
  const apri = (db, sources) => {
    const h = conStrato(runtime({ localStorage: ACCESO({ mappai_frasi_orfane: '1' }) }));
    h.st.db = clone(db);
    const rv = Core.createReview({ db, sources, report: { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: db.nodes.map(n => n.id), nodiSaltati: [] },
      issues: [{ id: 'issue', target: { kind: 'node', id: 'c', field: 'desc' }, problem: 'Il nodo non dice dove stavano le basi.' }] } });
    const m = manifest(rv); h.st._pipelineManifest = m;
    return h.R.open('/vault', m).querySelector('#mrv-coverage-details [data-aff-orfane]');
  };
  // «- aumentò i finanziamenti alla difesa;» ha tre parole piene: con lo splitter a 5 non si confrontava
  const fonte = [{ nome: 'Svizzera.pdf', pages: [{ n: 2, text: ORF_SOURCES[0].pages[0].text + ' - aumentò i finanziamenti alla difesa;' }, ORF_SOURCES[0].pages[1]] }];
  const corta = apri(ORF_DB, fonte);
  assert.equal(corta.querySelector('summary').textContent, 'Frasi della fonte rimaste fuori (3)');
  const righe = corta.querySelectorAll('[data-aff-orf-gruppo="orfane"] [data-aff-orf-riga]');
  const fin = righe.find(r => r.querySelector('.mrv-aff-testo').textContent === '- aumentò i finanziamenti alla difesa;');
  assert.ok(fin, 'la voce corta è fra le frasi riprese poco o per niente');
  assert.equal(fin.querySelector('.mrv-aff-nodo').textContent, 'Pagina 2');
  assert.equal(fin.querySelector('[data-aff-orf-correggi]'), null);
  // la mappa che riprende tutte e tre le frasi: la nota conta, e non certifica
  const tutto = clone(ORF_DB);
  tutto.nodes[2].desc += ' Lo Stato informò la popolazione sul comportamento da adottare in caso di raid aereo.';
  tutto.nodes[1].desc += ' Negli anni 1940 - 1942 il 45% delle esportazioni svizzere andava all’Asse.';
  const zero = apri(tutto, ORF_SOURCES);
  assert.equal(zero.querySelector('summary').textContent, 'Frasi della fonte rimaste fuori (0)');
  assert.equal(zero.querySelector('[data-aff-orf-nota]').textContent, 'Nessuna frase rimasta fuori.');
  assert.match(zero.querySelector('summary').getAttribute('title'), /l’elenco non garantisce che la mappa riprenda tutto\.$/, 'il limite resta nel suggerimento');
  assert.doesNotMatch(zero.textContent, /Ogni frase|verificat|coperta/i, 'nessun certificato di completezza (inv. 22)');
  assert.equal(zero.querySelectorAll('[data-aff-orf-riga]').length, 0);
});

test('0041: la sotto-spunta del Setup compare con lo strato acceso e scrive `mappai_frasi_orfane`', () => {
  const valori = new Map([['mappai_affermazioni', '0']]);   // packet 0089: senza chiave lo strato è acceso; «spento» è il '0'
  const h = conStrato(runtime({ localStorage: { getItem: k => (valori.has(k) ? valori.get(k) : null), setItem: (k, v) => valori.set(k, String(v)) } }));
  const host = h.dom.document.createElement('div');
  const UI = h.window.MappAIAffermazioniUI;
  UI.disegnaSetup(host);
  assert.equal(host.querySelector('#aff-orphans-toggle'), null, 'con lo strato spento non c’è: non farebbe niente');
  assert.equal(host.querySelectorAll('input[type="checkbox"]').length, 2);
  valori.set('mappai_affermazioni', '1');
  UI.disegnaSetup(host);
  const orf = host.querySelector('#aff-orphans-toggle');
  assert.ok(orf);
  assert.equal(orf.checked, false);
  assert.equal(orf.disabled, false);
  assert.match(host.textContent, /Frasi della fonte rimaste fuori dalla mappa/);
  assert.match(host.textContent, /Nella revisione dei contenuti, sotto «Copertura del controllo», elenca/, 'dice dove compare l’elenco');
  assert.doesNotMatch(host.textContent, /verificat/);
  orf.checked = true; orf.onchange();
  assert.equal(valori.get('mappai_frasi_orfane'), '1');
  assert.equal(host.querySelector('#aff-orphans-toggle').checked, true);
  valori.set('mappai_review_enabled', '0');
  UI.disegnaSetup(host);
  assert.equal(host.querySelector('#aff-orphans-toggle').disabled, true);
  assert.match(host.textContent, /l’elenco si vede solo lì/);
});

/* ── Packet 0042, gate 3 del 27/09 (b) ────────────────────────────────────────
   Su un progetto nato senza il controllo G1 la quarantena non si può
   calcolare: il blocco lo dice, invece di contare «134 fuori dai materiali»
   come se valesse; coda e piede restano quelli di oggi (G1 non è facoltativa). */
test('0042 gate 3 (b): senza rapporto o senza fonti il blocco dice che la quarantena non vale, e non conta niente', () => {
  const casi = [
    { review: initial({}), motivo: /il controllo automatico dei contenuti non ha un rapporto/ },
    { review: Core.createReview({ db: DB, sources: [], report: rapportoStrato() }), motivo: /la revisione di questa mappa non ha le fonti/ },
    // il progetto del gate 3: né rapporto né fonti — si dice per prima la mancanza che nessun controllo ripara
    { review: Core.createReview({ db: DB, sources: [], report: {} }), motivo: /la revisione di questa mappa non ha le fonti/ }
  ];
  for (const caso of casi) {
    const h = conStrato(runtime({ localStorage: ACCESO() })), m = manifest(caso.review);
    h.st._pipelineManifest = m;
    const modal = h.R.open('/vault', m);
    const blocco = modal.querySelector('#mrv-coverage-details [data-aff-blocco]');
    assert.ok(blocco, 'il blocco «Affermazioni delle descrizioni» c’è');
    assert.match(blocco.textContent, /La quarantena non vale per questo progetto/);
    assert.match(blocco.textContent, caso.motivo);
    assert.equal(blocco.querySelector('[data-aff-conteggi]'), null, 'niente conteggi: la quarantena non è in vigore');
    assert.doesNotMatch(modal.querySelector('#mrv-next-step').textContent, /Non serve decidere tutto/);
  }
});


// Packet 0070: the same persisted review protocol, backed by canonical reading
// JSON instead of a map. The runtime owns projection and disk readback.
function readingFixture(options = {}) {
  const h = runtime(options), value = { db: { items: [
    { id: 'p1', kind: 'reading-paragraph', text: 'Prima.', blockType: 'heading', emphasis: [], order: 0 },
    { id: 'p2', kind: 'reading-paragraph', text: 'Altro testo.', blockType: 'paragraph', emphasis: [{ start: 0, end: 5, kind: 'em' }], order: 1 }
  ] }, current: true, contentWrites: 0, commits: 0, continuations: 0 };
  h.st.db = { nodes: [], links: [] };
  h.window.MappAIPercorsoLetturaView = require('../public/js/mappai-percorso-lettura-view');
  const review = Core.createReview({ db: value.db, sources: SOURCES, report: null, checkStatus: 'unavailable',
    generationId: 'reading-g1', projectId: 'project', vaultPath: '/vault' });
  const m = manifest(review);
  const adapter = {
    phase: 'source', getDb: () => value.db,
    assertCurrent() { if (!value.current) throw new Error('reading_session_changed'); },
    validateDb(db) {
      assert.ok(db.items.length);
      db.items.forEach((it, i) => {
        assert.ok(typeof it.text === 'string' && it.text.trim());
        assert.equal(it.order, i);
        assert.ok(it.emphasis.every(e => e.start >= 0 && e.end <= it.text.length));
      });
    },
    async saveReadback(db, context) {
      context.assertCurrent(); value.contentWrites++; value.disk = clone(db);
      if (value.afterContentWrite) await value.afterContentWrite(db);
      return clone(value.readback || value.disk);
    },
    onCommit(db) { value.db = clone(db); value.commits++; },
    onContinue() { value.continuations++; }
  };
  return { ...h, m, adapter, value };
}

test('reading G1 displays every paragraph without nodes and requires a real manual confirmation', async () => {
  const h = readingFixture(), modal = h.R.openReading('/vault', h.m, h.adapter);
  assert.equal(modal.querySelectorAll('[data-reading-paragraph]').length, 2);
  assert.equal(modal.querySelector('[data-reading-source] h2').textContent, 'Prima.');
  assert.equal(modal.querySelector('[data-reading-source] em').textContent, 'Altro');
  assert.match(h.dom.text(), /La fonte dice: dopo/);
  assert.equal(modal.querySelector('#mrv-other-nodes'), null);
  assert.equal(modal.querySelector('#mrv-retry-judge'), null);
  assert.equal(modal.querySelector('#mrv-setup-judge'), null);
  assert.equal(modal.querySelector('#mrv-continue').hidden, true);
  await assert.rejects(h.R.approveReading('/vault', h.m, h.adapter), /incompleto/);
  assert.equal(h.value.contentWrites, 0);
  const confirm = modal.querySelector('#mrv-manual-confirm'); confirm.checked = true; confirm.onchange();
  await modal.querySelector('#mrv-continue').click();
  assert.equal(h.m.review.initial.status, 'approved');
  assert.equal(h.m.review.initial.checkStatus, 'unavailable');
  assert.equal(h.m.review.initial.manualReview, true);
  assert.equal(Core.gate(h.m.review, h.value.db, SOURCES).allowed, true);
  assert.equal(h.value.commits, 1); assert.equal(h.value.continuations, 1);
  assert.equal(h.calls.map + h.calls.load + h.calls.cache + h.calls.pipeline, 0);
});

test('reading source corrections stay in decisions, invalidate the checkbox and persist through JSON readback', async () => {
  const h = readingFixture(), modal = h.R.openReading('/vault', h.m, h.adapter);
  const confirm = modal.querySelector('#mrv-manual-confirm'); confirm.checked = true; confirm.onchange();
  await modal.querySelector('[data-reading-edit="p1"]').click();
  assert.equal(modal.querySelector('#mrv-manual-confirm').checked, false);
  const card = modal.querySelector('[data-review-card]');
  await card.querySelector('[data-review-choice="manual"]').click();
  const input = card.querySelector('textarea'); input.value = 'Dopo.'; input.oninput(); await tick();
  assert.equal(h.value.db.items[0].text, 'Prima.');
  assert.equal(h.saved.manifest.review.initial.decisions[h.m.review.initial.issues[0].id].text, 'Dopo.');
  await h.R.approveReading('/vault', h.m, h.adapter, { manualReview: true });
  assert.equal(h.value.disk.items[0].text, 'Dopo.');
  assert.equal(h.value.db.items[0].text, 'Dopo.');
  assert.equal(h.calls.map + h.calls.load + h.calls.cache + h.calls.pipeline, 0);
});

test('reading source G1 does not mount the node vest or change its global flag', () => {
  const flags = new Map([['mappai_banco_veste', '1']]), h = readingFixture({ localStorage: { getItem: k => flags.get(k) || null } });
  let mounts = 0;
  h.window.MappAIBancoVeste = { monta() { mounts++; throw new Error('node vest must not mount'); } };
  h.window.MappAIBancoCore = {};
  h.window.MappAIReviewFonte = { monta() { return { mostra() { return 0; }, pagine() { return []; }, smonta() {} }; } };
  h.R.openReading('/vault', h.m, h.adapter);
  assert.equal(mounts, 0); assert.equal(flags.get('mappai_banco_veste'), '1');
  assert.equal(h.m.review.initial.status, 'awaiting_review');
});

test('reading source changes and invalid projections cannot reach the content writer', async () => {
  for (const change of [
    h => { h.value.db.items[0].text = 'Cambiato fuori dal Banco.'; },
    h => { h.value.db.items.reverse(); h.value.db.items.forEach((it, i) => { it.order = i; }); },
    h => { h.value.db.items[1].emphasis[0].end = 200; },
    h => { h.value.current = false; }
  ]) {
    const h = readingFixture(); change(h);
    await assert.rejects(h.R.approveReading('/vault', h.m, h.adapter, { manualReview: true }));
    assert.equal(h.value.contentWrites, 0); assert.equal(h.m.review.initial.status, 'awaiting_review');
  }
});

test('reading G1 failed writes and readback mismatch never install approved in memory', async () => {
  for (const failure of ['manifest', 'content', 'readback', 'final', 'project']) {
    const h = readingFixture();
    if (failure === 'manifest') h.opts.failSave = true;
    h.value.afterContentWrite = () => {
      if (failure === 'content') throw new Error('content_failed');
      if (failure === 'readback') { h.value.readback = clone(h.value.disk); h.value.readback.items[0].text = 'Testo diverso sul disco.'; }
      if (failure === 'final') h.opts.failSave = true;
      if (failure === 'project') h.st.activeVaultPath = '/another';
    };
    await assert.rejects(h.R.approveReading('/vault', h.m, h.adapter, { manualReview: true }));
    assert.equal(h.m.review.initial.status, failure === 'manifest' ? 'awaiting_review' : 'applying', failure);
    assert.equal(h.value.commits, 0); assert.equal(h.value.continuations, 0);
    assert.notEqual(h.st._pipelineManifest?.review.initial.status, 'approved', failure);
    assert.equal(h.calls.map + h.calls.load + h.calls.cache + h.calls.pipeline, 0);
  }
});

test('reading applying resumes after a failed final manifest without a second manual approval', async () => {
  const h = readingFixture();
  h.value.afterContentWrite = () => { h.opts.failSave = true; };
  await assert.rejects(h.R.approveReading('/vault', h.m, h.adapter, { manualReview: true }));
  h.opts.failSave = false; h.value.afterContentWrite = null;
  // Reopening from disk retains the applying consent and the exact snapshot.
  h.m = clone(h.saved.manifest);
  await h.R.approveReading('/vault', h.m, h.adapter);
  assert.equal(h.m.review.initial.status, 'approved');
  assert.equal(h.m.review.initial.checkStatus, 'unavailable');
  assert.equal(h.value.commits, 1);
});

function readingMaterials() {
  const h = readingFixture(), begun = Core.beginApproval(h.m.review, h.value.db, { manualReview: true });
  h.m.review = Core.completeApproval(begun.review, begun.revision);
  const items = [{ id: 'q1', kind: 'mc', question: 'Che cosa dice il testo?', options: ['Prima.', 'Dopo.', 'Altro.', 'Nulla.'],
    correctIndex: 0, explanation: 'La prima parola.', reading: { optionIds: ['a', 'b', 'c', 'd'], privateGuide: 'Solo docente' } }];
  const report = { checkStatus: 'incomplete', checkedIds: [], issues: [{ id: 'reading-note',
    target: { kind: 'item', id: 'q1', field: 'question' }, problem: 'Consegna da verificare.', after: 'Qual è la prima parola?' }] };
  h.m.review.final = { stage: 'awaiting_review', items: clone(items), sourceRevision: h.m.review.approvedRevision,
    review: Core.createReview({ db: { items }, sources: SOURCES, report, projectId: 'project', vaultPath: '/vault' }) };
  h.value.db = { items: clone(items) };
  h.adapter.phase = 'materials'; h.adapter.validateDb = db => { assert.equal(db.items[0].options.length, 4); };
  return h;
}

test('reading G2 uses real material items and preserves private adapter metadata on approval', async () => {
  const h = readingMaterials();
  h.m.review.final.review = Core.setDecision(h.m.review.final.review, 'reading-note', 'accept');
  await h.R.approveReading('/vault', h.m, h.adapter, { manualReview: true });
  assert.equal(h.value.disk.items[0].question, 'Qual è la prima parola?');
  assert.deepEqual(h.value.disk.items[0].reading.optionIds, ['a', 'b', 'c', 'd']);
  assert.equal(h.value.disk.items[0].reading.privateGuide, 'Solo docente');
  assert.equal(h.m.review.final.review.initial.status, 'approved');
  assert.equal(h.m.review.final.items[0].question, 'Qual è la prima parola?');
  assert.equal(h.calls.map + h.calls.load + h.calls.cache + h.calls.pipeline, 0);
});

test('reading G2 checks source revision and retry preserves existing teacher decisions', async () => {
  const h = readingMaterials();
  h.m.review.final.review = Core.setDecision(h.m.review.final.review, 'reading-note', 'reject');
  let retries = 0;
  h.window.executeJudgePass = () => { throw new Error('map judge must not run'); };
  h.adapter.retry = async args => {
    retries++; args.assertCurrent(); assert.equal(args.items[0].id, 'q1'); assert.deepEqual(clone(args.sources), Core.sourceSnapshot(SOURCES));
    return { checkStatus: 'completed', checkedIds: ['q1'], issues: [] };
  };
  const modal = h.R.openReading('/vault', h.m, h.adapter);
  await modal.querySelector('#mrv-retry-judge').click();
  assert.equal(retries, 1);
  assert.equal(h.m.review.final.review.initial.decisions['reading-note'].choice, 'reject');
  assert.equal(h.m.review.final.review.initial.checkStatus, 'completed');
  assert.equal(h.calls.cache, 0);
  h.m.review.final.sourceRevision = 'old-source';
  await assert.rejects(h.R.approveReading('/vault', h.m, h.adapter, { manualReview: true }));
  assert.equal(h.value.contentWrites, 0);
});


test('reading G2 checkpoint preserves an unchanged revision across metadata readback but rejects changed decisions', async () => {
  for (const changed of [false, true]) {
    const h = readingMaterials();
    h.adapter.retry = async args => {
      const checkpoint = clone(h.m);
      checkpoint.reading = { reviewCheckpoint: { checkStatus: 'incomplete', checkedIds: ['q1'] } };
      if (changed) checkpoint.review.final.review = Core.setDecision(checkpoint.review.final.review, 'reading-note', 'reject');
      await h.R.writeManifest('/vault', checkpoint, args.assertCurrent);
      Object.assign(h.m, checkpoint);
      args.assertCurrent();
      return { checkStatus: 'completed', checkedIds: ['q1'], issues: [] };
    };
    const modal = h.R.openReading('/vault', h.m, h.adapter);
    await modal.querySelector('#mrv-retry-judge').click();
    assert.equal(h.m.review.final.review.initial.checkStatus, changed ? 'incomplete' : 'completed');
    if (changed) assert.match(modal.querySelector('#mrv-status').textContent, /cambiato/);
    assert.equal(h.value.contentWrites, 0);
  }
});

test('reading G2 progress shows item coverage and set review without undefined map lots', async () => {
  const h = readingMaterials();
  let modal; const statuses = [];
  h.adapter.retry = async args => {
    args.onProgress({ done: 6, total: 41, reused: 3, batch: 2 });
    statuses.push(modal.querySelector('#mrv-status').textContent);
    args.onProgress({ phase: 'design-review', etichetta: 'Controllo strategie e ripetizioni nella scheda…' });
    statuses.push(modal.querySelector('#mrv-status').textContent);
    return { checkStatus: 'completed', checkedIds: ['q1'], issues: [] };
  };
  modal = h.R.openReading('/vault', h.m, h.adapter);
  await modal.querySelector('#mrv-retry-judge').click();
  assert.equal(h.m.review.final.review.initial.checkStatus, 'completed');
  assert.match(statuses[0], /6\/41/);
  assert.doesNotMatch(statuses.join(' '), /undefined|Lotto/);
  assert.match(statuses[1], /strategie e ripetizioni/);
});

test('reading G2 can repair an invalid base item before validating the composed result', async () => {
  const h = readingMaterials(), items = clone(h.value.db.items);
  items[0].options[1] = items[0].options[0];
  const report = { checkStatus: 'completed', issues: [{ id: 'options', target: { kind: 'item', id: 'q1', field: 'options' },
    problem: 'Alternative duplicate.', after: ['Prima.', 'Dopo.', 'Altro.', 'Nulla.'] }] };
  h.value.db = { items };
  h.m.review.final.items = clone(items);
  h.m.review.final.review = Core.createReview({ db: { items }, sources: SOURCES, report, projectId: 'project', vaultPath: '/vault' });
  const modal = h.R.openReading('/vault', h.m, h.adapter);
  assert.ok(modal.querySelector('[data-review-card]'));
  h.m.review.final.review = Core.setDecision(h.m.review.final.review, 'options', 'accept');
  await h.R.approveReading('/vault', h.m, h.adapter);
  assert.equal(h.value.db.items[0].options[1], 'Dopo.');
  assert.equal(h.m.review.final.review.initial.status, 'approved');
});


test('reading identity is rechecked after the queued manifest write before touching canonical content', async () => {
  const h = readingFixture(), write = h.window.electronAPI.saveVaultFile;
  h.window.electronAPI.saveVaultFile = async args => {
    const result = await write(args);
    h.value.db.items[0].text = 'Un cambiamento concorrente.';
    return result;
  };
  await assert.rejects(h.R.approveReading('/vault', h.m, h.adapter, { manualReview: true }), /cambiato/);
  assert.equal(h.value.contentWrites, 0);
  assert.equal(h.value.commits, 0);
  assert.equal(h.saved.manifest.review.initial.status, 'applying');
  assert.notEqual(h.m.review.initial.status, 'approved');
});

function readingMenuFixture(status = 'approved') {
  const h = readingFixture();
  h.m.reading = { kind: 'percorso-lettura', extractionMode: 'lettura', projectId: 'project',
    percorsoId: 'percorso', sourceId: 'fonte', sourcePath: 'Materiale Studio/Sorgenti/Percorso-lettura-percorso.json' };
  h.st.extractionMode = 'lettura'; h.st._pipelineManifest = h.m;
  if (status !== 'awaiting_review') {
    const approved = Core.beginApproval(h.m.review, h.value.db, { manualReview: true });
    h.m.review = status === 'applying' ? approved.review : Core.completeApproval(approved.review, approved.review.approvedRevision);
  }
  const entryCalls = { reading: 0, judge: 0 };
  h.window.MappAIPercorsoLettura = { openCurrent: async () => { entryCalls.reading++; return 'editor-lettura'; } };
  h.window.executeJudgePass = async () => { entryCalls.judge++; throw new Error('Il giudice della mappa non deve essere chiamato.'); };
  return { ...h, entryCalls };
}

test('0070 menu generale: Rivedi contenuti rinvia fonte in attesa, applying e approvata senza ripristinare nodi', async () => {
  const $ = cheerio.load(fs.readFileSync(require.resolve('../public/index.html'), 'utf8'));
  const button = $('button').toArray().find(e => ($(e).attr('onclick') || '').includes('MappAIReview.openCurrent()'));
  assert.ok(button);
  for (const status of ['awaiting_review', 'applying', 'approved']) {
    const h = readingMenuFixture(status), before = JSON.stringify(h.m);
    assert.equal(await vm.runInNewContext($(button).attr('onclick'), { window: h.window }), 'editor-lettura');
    assert.deepEqual(h.entryCalls, { reading: 1, judge: 0 });
    assert.deepEqual(h.calls, { manifest: 0, map: 0, load: 0, cache: 0, pipeline: 0 });
    assert.equal(JSON.stringify(h.m), before); assert.equal(h.dom.document.getElementById('mappai-review-modal'), null);
  }
});

test('0070 menu generale: Percorso breve e requireApproved non concedono il gate mappa né ricreano G1, anche sotto quarantena', async () => {
  const h = readingMenuFixture(), before = JSON.stringify(h.m);
  h.window.appState = h.st;
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/mappai-learning-path.js'), 'utf8'), h.window);
  const $ = cheerio.load(fs.readFileSync(require.resolve('../public/index.html'), 'utf8'));
  const button = $('button').toArray().find(e => ($(e).attr('onclick') || '').includes('MappAILearningPath.open()'));
  assert.ok(button);
  assert.equal(await vm.runInNewContext($(button).attr('onclick'), { window: h.window }), false);
  h.window.MappAIAffermazioni = { facoltativa: () => true };
  assert.equal(await h.R.requireApproved({ quarantena: true }), false);
  assert.equal(await h.R.requireStandalone(), false);
  assert.deepEqual(h.entryCalls, { reading: 3, judge: 0 });
  assert.deepEqual(h.calls, { manifest: 0, map: 0, load: 0, cache: 0, pipeline: 0 });
  assert.equal(JSON.stringify(h.m), before);
});

test('0070 ingresso R.open: senza adapter rinvia al percorso; openReading continua a montare e salvare il G1 canonico', async () => {
  const h = readingMenuFixture('awaiting_review');
  assert.equal(await h.R.open('/vault', h.m, { final: true }), 'editor-lettura');
  assert.equal(h.entryCalls.reading, 1); assert.equal(h.calls.map, 0);
  const modal = h.R.openReading('/vault', h.m, h.adapter);
  assert.equal(modal.querySelectorAll('[data-reading-paragraph]').length, 2);
  assert.equal(h.entryCalls.reading, 1);
  await h.R.approveReading('/vault', h.m, h.adapter, { manualReview: true });
  assert.equal(h.value.contentWrites, 1); assert.equal(h.calls.map, 0); assert.equal(h.calls.cache, 0);
});

test('0070 ingressi legacy: identità divergenti e runtime assente fermano il rinvio senza toccare il progetto', async () => {
  for (const invalidate of [
    h => { h.m.reading.projectId = 'altro-progetto'; },
    h => { h.m.review.projectId = 'altro-progetto'; },
    h => { h.m.vaultPath = '/altro-vault'; },
    h => { h.st.activeVaultPath = '/altro-vault'; },
    h => { h.st.extractionMode = 'mindmap'; },
    h => { delete h.window.MappAIPercorsoLettura; }
  ]) {
    const h = readingMenuFixture(); invalidate(h); const before = JSON.stringify(h.st);
    await assert.rejects(h.R.openCurrent(), /progetto è cambiato|non è disponibile/);
    await assert.rejects(h.R.requireApproved(), /progetto è cambiato|non è disponibile/);
    assert.throws(() => h.R.open('/vault', h.m), /progetto è cambiato|non è disponibile/);
    assert.equal(JSON.stringify(h.st), before);
    assert.deepEqual(h.entryCalls, { reading: 0, judge: 0 });
    assert.deepEqual(h.calls, { manifest: 0, map: 0, load: 0, cache: 0, pipeline: 0 });
  }
  const h = readingMenuFixture(), stale = clone(h.m); stale.reading.percorsoId = 'percorso-precedente';
  assert.throws(() => h.R.open('/vault', stale), /progetto è cambiato/);
  assert.equal(h.entryCalls.reading, 0); assert.equal(h.st._pipelineManifest, h.m);
});

/* ── 0088 · B10: «1 Contenuti» cliccabile in G2 ─────────────────────────────────────────────────────
   Con la quarantena accesa (di default dal 0089) G1 è FACOLTATIVA: aprire un progetto porta dritto a G2, e in testata «1
   Contenuti · 2 Materiali» era solo un indicatore. Ora, in G2, quando G1 è facoltativa e ancora in attesa, il passo è un
   bottone che chiude G2 come «Salva e continua più tardi» (nessuna decisione persa) e apre G1 con la stessa chiamata di
   «Rivedi i contenuti» (`MappAIReview.open(vaultPath, manifest, { alza: true })`). In tutti gli altri casi resta com'è. */
function g2ConG1Facoltativa(opts = {}) {
  const h = runtime(opts);
  const items = [{ id: 'material-0', kind: 'flashcard', question: 'Domanda 0?', answer: 'Risposta 0.' },
    { id: 'material-1', kind: 'flashcard', question: 'Domanda 1?', answer: 'Risposta 1.' }];
  const issues = [{ id: 'decision-0', target: { kind: 'item', id: 'material-0', field: 'answer' }, after: 'Correzione 0.' }];
  const m = manifest(initial({ checkStatus: 'completed', issues: [] }));        // G1 ancora in attesa
  m.review.final = { stage: 'awaiting_review', items: clone(items), review: Core.createReview({ db: { items }, sources: SOURCES,
    report: { checkStatus: 'completed', issues } }) };
  assert.equal(m.review.initial.status, 'awaiting_review');
  h.st._pipelineManifest = m;
  /* il vero `facoltativa` somma la quarantena accesa e il record calcolabile: qui basta la sua forma */
  if (!opts.senzaModulo) h.window.MappAIAffermazioni = { facoltativa: rv => opts.facoltativa !== false && !!rv && !!rv.initial && rv.initial.status === 'awaiting_review' };
  return { ...h, m };
}
const passiTesto = modal => Array.from(modal.querySelectorAll('.mrv-stages li'), li => li.textContent);
const ETICHETTA_PASSO = 'Torna a rivedere i contenuti. Le correzioni valgono per i materiali che generi dopo.';

test('0088 B10: in G2, con G1 facoltativa e in attesa, «1 Contenuti» è un bottone accessibile; le due fasi restano quelle di prima', () => {
  const h = g2ConG1Facoltativa(), modal = h.R.open('/vault', h.m, { final: true });
  const passo = modal.querySelector('#mrv-step-contenuti');
  assert.equal(!!passo, true);
  assert.equal(passo.n.name, 'button');
  assert.equal(passo.getAttribute('type'), 'button');
  assert.equal(passo.getAttribute('aria-label'), ETICHETTA_PASSO);
  assert.equal(passo.getAttribute('title'), ETICHETTA_PASSO);
  assert.deepEqual(passiTesto(modal), ['1Contenuti', '2Materiali'], 'il testo delle fasi non cambia');
  const li = modal.querySelectorAll('.mrv-stages li');
  assert.equal(li[0].getAttribute('aria-current'), undefined, 'il passo corrente resta «2 Materiali»');
  assert.equal(li[1].getAttribute('aria-current'), 'step');
  assert.equal(li[1].querySelector('button'), null, '«2 Materiali» non è un bottone');
  assert.equal(h.calls.manifest, 0, 'aprire non scrive niente');
});

test('0088 B10: il clic chiude G2 come «Salva e continua più tardi» e apre G1 con la chiamata di «Rivedi i contenuti»', async () => {
  const h = g2ConG1Facoltativa(), modal = h.R.open('/vault', h.m, { final: true });
  const aperture = [];
  h.R.open = (...a) => { aperture.push(a); };
  await modal.querySelector('#mrv-step-contenuti').click();
  assert.equal(modal.isConnected, false, 'G2 si è chiusa');
  assert.equal(aperture.length, 1);
  assert.equal(aperture[0][0], '/vault');
  assert.equal(aperture[0][1], h.m, 'lo stesso manifesto');
  assert.deepEqual(clone(aperture[0][2]), { alza: true }, 'sopra la console che l\'ha aperta, e NON come G2 (niente final)');
});

test('0088 B10: nessuna decisione si perde passando da G2 a G1', async () => {
  const h = g2ConG1Facoltativa(), modal = h.R.open('/vault', h.m, { final: true });
  await currentCard(modal).querySelector('[data-review-choice=accept]').click();
  assert.equal(h.saved.manifest.review.final.review.initial.decisions['decision-0'].choice, 'accept');
  const aperture = [];
  h.R.open = (...a) => { aperture.push(a); };
  await modal.querySelector('#mrv-step-contenuti').click();
  assert.equal(aperture.length, 1);
  assert.equal(h.m.review.final.review.initial.decisions['decision-0'].choice, 'accept');
  assert.equal(h.saved.manifest.review.final.review.initial.decisions['decision-0'].choice, 'accept');
});

test('0088 B10: se il salvataggio fallisce G2 resta aperta e G1 NON si apre (come «Salva e continua più tardi»)', async () => {
  const h = g2ConG1Facoltativa({ failSave: true }), modal = h.R.open('/vault', h.m, { final: true });
  await currentCard(modal).querySelector('[data-review-choice=accept]').click();      // il disco non salva
  const aperture = [];
  h.R.open = (...a) => { aperture.push(a); };
  await modal.querySelector('#mrv-step-contenuti').click();
  assert.equal(modal.isConnected, true, 'la finestra resta');
  assert.equal(aperture.length, 0);
});

test('0088 B10: negli altri casi il passo resta un semplice indicatore (G1 approvata, quarantena spenta, modulo assente, G1 aperta)', () => {
  const approvata = g2ConG1Facoltativa(); approvata.m.review.initial.status = 'approved';
  const mA = approvata.R.open('/vault', approvata.m, { final: true });
  assert.equal(mA.querySelector('#mrv-step-contenuti'), null, 'G1 già approvata');
  assert.deepEqual(passiTesto(mA), ['1Contenuti', '2Materiali']);
  const spenta = g2ConG1Facoltativa({ facoltativa: false });
  assert.equal(spenta.R.open('/vault', spenta.m, { final: true }).querySelector('#mrv-step-contenuti'), null, 'quarantena spenta: G1 non è facoltativa');
  const senza = g2ConG1Facoltativa({ senzaModulo: true });
  assert.equal(senza.R.open('/vault', senza.m, { final: true }).querySelector('#mrv-step-contenuti'), null, 'senza il modulo delle affermazioni');
  const g1 = g2ConG1Facoltativa();
  const mG1 = g1.R.open('/vault', g1.m);
  assert.equal(mG1.querySelector('#mrv-step-contenuti'), null, 'dentro G1 il passo corrente è «1 Contenuti»');
  assert.equal(mG1.querySelectorAll('.mrv-stages li')[0].getAttribute('aria-current'), 'step');
});

/* ── 0088 · B14: alla chiusura di G2 la pipeline può chiedere di uscire da CREA (`options.dopoChiusura`) ───────────
   «Salva e continua più tardi» ed ESC la chiamano SOLO a chiusura avvenuta; se il salvataggio fallisce la finestra resta
   e non succede niente; il clic di B10 («1 Contenuti») e «Continua» non la chiamano; senza l'opzione tutto resta com'è. */
test('0088 B14: «Salva e continua più tardi» chiama `dopoChiusura` dopo aver chiuso G2; senza l\'opzione niente cambia', async () => {
  const h = g2ConG1Facoltativa(); let chiamate = 0;
  const modal = h.R.open('/vault', h.m, { final: true, dopoChiusura: () => { chiamate++; assert.equal(modal.isConnected, false, 'prima si chiude, poi si esce da CREA'); } });
  await modal.querySelector('#mrv-later').click();
  assert.equal(modal.isConnected, false); assert.equal(chiamate, 1);
  const senza = g2ConG1Facoltativa(), m2 = senza.R.open('/vault', senza.m, { final: true });
  await m2.querySelector('#mrv-later').click();
  assert.equal(m2.isConnected, false);
});

test('0088 B14: ESC è «Salva e continua più tardi»: chiama `dopoChiusura` una volta', async () => {
  const h = g2ConG1Facoltativa(); let chiamate = 0;
  const modal = h.R.open('/vault', h.m, { final: true, dopoChiusura: () => { chiamate++; } });
  modal.listeners.keydown({ key: 'Escape', preventDefault() {} });
  for (let i = 0; i < 4; i++) await tick();
  assert.equal(modal.isConnected, false); assert.equal(chiamate, 1);
});

test('0088 B14: se il salvataggio fallisce G2 resta aperta e `dopoChiusura` NON è chiamata', async () => {
  const h = g2ConG1Facoltativa({ failSave: true }); let chiamate = 0;
  const modal = h.R.open('/vault', h.m, { final: true, dopoChiusura: () => { chiamate++; } });
  await currentCard(modal).querySelector('[data-review-choice=accept]').click();      // il disco non salva
  await modal.querySelector('#mrv-later').click();
  assert.equal(modal.isConnected, true); assert.equal(chiamate, 0);
});

test('0088 B14: il clic di B10 («1 Contenuti») chiude G2 e apre G1 senza chiamare `dopoChiusura`: G1 si apre sopra CREA', async () => {
  const h = g2ConG1Facoltativa(); let chiamate = 0;
  const modal = h.R.open('/vault', h.m, { final: true, dopoChiusura: () => { chiamate++; } });
  const aperture = []; h.R.open = (...a) => { aperture.push(a); };
  await modal.querySelector('#mrv-step-contenuti').click();
  assert.equal(modal.isConnected, false); assert.equal(aperture.length, 1); assert.equal(chiamate, 0);
});

test('0088 B14: «Continua» chiama `onContinue` e NON `dopoChiusura` (è la continuazione a sapere da dove viene)', async () => {
  const h = stalledMaterialFixture(); let chiamate = 0, continuate = 0;
  const modal = h.R.open('/vault', h.m, { final: true, onContinue: async () => { continuate++; }, dopoChiusura: () => { chiamate++; } });
  for (let i = 240; i < 250; i++) await modal.querySelector('[data-coverage-approve="material-' + i + '"]').click();
  assert.equal(modal.querySelector('#mrv-continue').hidden, false);
  await modal.querySelector('#mrv-continue').click();
  assert.equal(modal.isConnected, false); assert.equal(continuate, 1); assert.equal(chiamate, 0);
});
