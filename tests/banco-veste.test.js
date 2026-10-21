'use strict';
/*
 * LA VESTE DI G2 (packet 0073; ADR 0012 revisioni 3, 4 e 5; decisioni R1-R4 di Giacomo del 04/10).
 * I gemelli dei test del controller per la veste: si monta il Banco vero (`mappai-review.js` caricato con
 * `vm`, come in tests/review-controller.test.js) con la Fonte finta, l'interruttore `mappai_banco_veste`
 * acceso, e si provano i gesti uno per uno. Il DOM è quello finto del controller (cheerio): niente
 * `closest`, `children`, `insertBefore`; gli assert sugli elementi si fanno su booleani, testo e attributi
 * (un assert fallito su un elemento fa girare Node all'infinito).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cheerio = require('cheerio');
const Core = require('../public/js/mappai-review-core');
const Material = require('../public/js/mappai-material-review');
const Pipeline = require('../public/js/mappai-pipeline-core');
const BancoCore = require('../public/js/mappai-banco-core');
const clone = x => JSON.parse(JSON.stringify(x));
// il modulo si carica al momento dell'uso: senza, ogni test fallisce per conto suo
const Veste = () => require('../public/js/mappai-banco-veste.js');

const DB = { nodes: [{ id: 'a', label: 'Germania', desc: 'Prima.', level: 0 }, { id: 'b', label: 'Svizzera', desc: 'Altro testo.', level: 1 }],
  links: [{ source: 'a', target: 'b', rel: 'richiede', isCross: true }], sourcesDict: {} };
const SOURCES = [{ nome: 'Libro.pdf', pages: [{ n: 4, text: 'Le banche svizzere furono accusate di aver accettato oro.' }] }];
const ITEMS = [
  { id: 'mc1', kind: 'mc', question: 'Chi fu accusato?', options: ['Lo Stato', 'Le banche', 'I cantoni'], correctIndex: 1, explanation: 'Furono le banche.' },
  { id: 'mc2', kind: 'mc', question: 'Che cosa custodivano?', options: ['Oro', 'Grano'], correctIndex: 0, explanation: 'I depositi.' },
  { id: 'op1', kind: 'open', question: 'Spiega le accuse.', guide: 'Le banche accettarono oro.', criteria: ['Cita le banche.'], lines: 5 },
  { id: 'fc1', kind: 'flashcard', question: 'Neutralità', answer: 'Non prendere parte alla guerra.' },
  { id: 'ca1', kind: 'causal', question: 'Pressioni', answer: 'Accordi', text: 'portano a' },
  { id: 'sy1', kind: 'synthesis', title: 'Le banche', text: 'Le banche custodivano oro.' },
  { id: 'ns1', kind: 'nodesheet', text: 'Scheda del nodo' }
];
const NOTE = [
  { id: 'n-mc1-q', target: { kind: 'item', id: 'mc1', field: 'question' }, after: 'Chi venne accusato?', problem: 'La domanda va riformulata.', evidence: [{ source: 'Libro.pdf', page: 4, text: 'accusate di aver accettato oro' }] },
  { id: 'n-mc2-e', target: { kind: 'item', id: 'mc2', field: 'explanation' }, problem: 'La spiegazione non cita la fonte.' },
  { id: 'n-ca1', target: { kind: 'item', id: 'ca1', field: '$item' }, after: null, problem: 'La catena non esprime una causa.' }
];
function rapporto(extra) {
  return Object.assign({ checkStatus: 'incomplete', stato: 'parziale', coverage: { checkedIds: ['mc1', 'mc2', 'ca1'] }, issues: clone(NOTE) }, extra || {});
}
/* 0086 g3d (D41): su un materiale con una nota del controllo il campo è una bozza fino al bottone. Il rapporto senza la nota
   di mc1 (e mc1 non controllato, quindi in barra) lascia una scelta multipla dove il campo si salva all'uscita come prima:
   lo usano i test che hanno bisogno di una scrittura su un materiale con le alternative. */
const senzaNotaMc1 = () => rapporto({ coverage: { checkedIds: ['mc2', 'ca1'] }, issues: [clone(NOTE[1]), clone(NOTE[2])] });
function finalManifest(items, report) {
  const r = Core.createReview({ db: DB, sources: SOURCES, report: { checkStatus: 'completed', issues: [] } });
  const first = Core.beginApproval(r, DB), m = Pipeline.createManifest({}, { vaultPath: '/vault' });
  m.steps.A.status = 'done'; m.review = Core.completeApproval(first.review, first.revision);
  m.review.final = { stage: 'awaiting_review', items: clone(items), review: Core.createReview({ db: { items }, sources: SOURCES, report }) };
  return m;
}
// la stessa impronta di `improntaTesto` (mappai-review.js): l'approvazione vale per la versione letta
function impronta(value) {
  let n = 2166136261;
  for (const c of String(value)) n = Math.imul(n ^ c.codePointAt(0), 16777619);
  return (n >>> 0).toString(36);
}

// Il DOM finto di tests/review-controller.test.js, ricopiato: quel file non si tocca (packet 0073 §3).
// `conInsertBefore` (0074, giro 2): il pannello vero con la foto usa `insertBefore`; di predefinito non c'è, perché
// R.open lo usa (se c'è) per spostare l'avanzamento nella testata e i test di prima sono scritti senza
function dom(conInsertBefore) {
  const $ = cheerio.load('<html><body><button id="previous">Prima</button></body></html>');
  const wrappers = new WeakMap();
  let active;
  function wrap(n) {
    if (!n) return null;
    if (wrappers.has(n)) return wrappers.get(n);
    const e = { n, listeners: {},
      setAttribute(k, v) { $(n).attr(k, String(v)); },
      getAttribute(k) { return $(n).attr(k); },
      // in più (0075, giro 2, N6): il `title` della nota decisa si toglie quando la nota si riapre
      removeAttribute(k) { $(n).removeAttr(k); },
      appendChild(child) { $(n).append(child.n); return child; },
      // in più (0074): il pannello vero della Fonte monta i suoi pezzi con `append`
      append(...children) { children.forEach(c => this.appendChild(c)); },
      replaceChildren(...children) { $(n).empty(); children.forEach(c => this.appendChild(c)); },
      remove() { $(n).remove(); },
      querySelector(s) { return wrap($(n).find(s).get(0)); },
      querySelectorAll(s) { return $(n).find(s).toArray().map(wrap); },
      focus() { active = this; }, getClientRects() { return this.hidden || $(n).parents('[hidden]').length ? [] : [{}]; },
      addEventListener(k, fn) { this.listeners[k] = fn; },
      // in più rispetto al DOM finto del controller (gate 3, G1): il Banco riconosce il fuoco dentro di sé
      contains(o) { return !!o && !!o.n && (o.n === n || $(o.n).parents().toArray().indexOf(n) >= 0); },
      classList: {
        toggle(c, on) { const v = on === undefined ? !$(n).hasClass(c) : !!on; $(n).toggleClass(c, v); return v; },
        add(...c) { c.forEach(x => $(n).addClass(x)); }, remove(...c) { c.forEach(x => $(n).removeClass(x)); }, contains(c) { return $(n).hasClass(c); }
      },
      style: { setProperty(k, v) { $(n).css(k, v); } },
      async click() { if (!this.disabled && this.onclick) return this.onclick(); }
    };
    if (conInsertBefore) e.insertBefore = (c, ref) => { if (ref) $(ref.n).before(c.n); else $(n).append(c.n); return c; };
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
      isConnected: { get() { return $(n).parents('html').length > 0; } },
      // in più rispetto al DOM finto del controller: la veste distingue i suoi campi dagli altri campi (giro 2, difetto 9)
      tagName: { get() { return String(n.name || '').toUpperCase(); } }
    });
    wrappers.set(n, e); return e;
  }
  const document = { body: wrap($('body')[0]), createElement: tag => wrap($('<' + tag + '>')[0]),
    createTextNode: text => wrap({ type: 'text', data: text }),
    getElementById: id => wrap($('#' + id)[0]), get activeElement() { return active; } };
  active = document.getElementById('previous');
  return { document, text: () => $('body').text(), html: () => $.html() };
}

/* Il runtime del controller, con il Banco acceso (la Fonte finta) e la veste: `flag` è il valore di
   `mappai_banco_veste` ('1' di predefinito), `senzaVeste` toglie il modulo dalla pagina. */
function runtime(opts = {}) {
  const d = dom(!!opts.insertBefore), calls = { manifest: 0, map: 0, load: 0, cache: 0, pipeline: 0, previewItem: 0, preview: 0 }, saved = { manifest: null, version: 0 };
  // `opts.db` (0075): la mappa di G1 della prova; di predefinito quella dei test di G2
  const st = { activeVaultPath: '/vault', db: clone(opts.db || DB), sources: [], _pdfPagine: [], _reviewRevision: null };
  const valori = Object.assign({ mappai_banco_veste: '1' }, opts.storage || {});
  if (opts.flag !== undefined) valori.mappai_banco_veste = opts.flag;
  const mostrate = [];
  const contato = Object.assign({}, Core, {
    previewItem: (...a) => { calls.previewItem++; return Core.previewItem(...a); },
    preview: (...a) => { calls.preview++; return Core.preview(...a); }
  });
  const window = { MappAIReviewCore: contato, MappAIMaterialReview: Material, MappAIPipelineCore: Pipeline,
    MappAIReviewContext: require('../public/js/mappai-review-context'),
    MappAIGroundingCore: require('../public/js/mappai-grounding-core.js'),
    MappAIConfrontoCore: require('../public/js/mappai-confronto-core.js'),
    MappAIBancoCore: BancoCore,
    MappAIReviewFonte: { monta: () => ({ mostra: prove => mostrate.push(clone(prove)), smonta() {} }) },
    t: (_key, fallback) => fallback, renderGraph() {}, getSystemKey: () => 'mock-key',
    MappAIPipeline: { run: async () => { calls.pipeline++; } },
    buildVaultMapData: () => ({ ...st.db }),
    electronAPI: {
      saveVaultFile: async args => {
        if (args.relPath !== 'pipeline.json') return { ok: true };
        calls.manifest++;
        if (opts.failSave) return { ok: false, error: 'Disco non disponibile' };
        saved.manifest = JSON.parse(args.text); saved.version++;
        saved.manifest._storageVersion = saved.version;
        return { ok: true, version: saved.version };
      },
      saveVault: async () => { calls.map++; return { success: true }; },
      loadVault: async () => { calls.load++; return { success: true, data: clone(st.db) }; },
      readVaultFile: async () => ({ ok: true, text: JSON.stringify(saved.manifest) }),
      vaultMaterialsList: async () => ({ manifest: clone(saved.manifest) })
    } };
  if (!opts.senzaVeste) window.MappAIBancoVeste = Veste();
  if (opts.senzaBanco) delete window.MappAIReviewFonte;
  // gli ascolti su window (la veste ascolta in cattura, giro 2, difetto 8)
  const finestra = [];
  window.addEventListener = (k, fn, cattura) => { finestra.push({ k, fn, cattura: !!cattura }); };
  window.removeEventListener = (k, fn) => { const i = finestra.findIndex(l => l.k === k && l.fn === fn); if (i >= 0) finestra.splice(i, 1); };
  const ctx = vm.createContext({ window, appState: st, document: d.document, console, TextDecoder, Uint8Array,
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    StorageManager: { currentProjectId: 'project', saveCurrentProject: () => { calls.cache++; } },
    localStorage: { getItem: k => (Object.prototype.hasOwnProperty.call(valori, k) ? valori[k] : null), setItem: (k, v) => { valori[k] = String(v); } } });
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/mappai-review.js'), 'utf8'), ctx);
  const m = opts.manifest || finalManifest(opts.items || ITEMS, opts.report || rapporto());
  st._pipelineManifest = m;
  // `valori` (la preferenza della Fonte, 0074) e `ctx` (per caricare nel contesto il pannello vero della Fonte)
  const h = { R: window.MappAIReview, window, st, calls, saved, dom: d, opts, m, mostrate, finestra, valori, ctx };
  h.final = () => h.m.review.final.review;
  h.apri = (o = { final: true }) => { h.modal = h.R.open('/vault', h.m, o); return h.modal; };
  return h;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const q = (h, s) => h.modal.querySelector(s);
const qa = (h, s) => h.modal.querySelectorAll(s);
const scheda = h => (q(h, '[data-veste-scheda]') || { getAttribute: () => null }).getAttribute('data-veste-scheda');
const riga = (h, id) => q(h, '[data-veste-riga="' + id + '"]');
const statoRiga = (h, id) => riga(h, id).getAttribute('data-stato');
const campo = (h, f) => q(h, '[data-veste-scheda] [data-veste-input="' + f + '"]');
const bottone = h => q(h, '#mrv-veste-bottone');
const tasto = (h, e) => { let fermato = false; h.modal.listeners.keydown(Object.assign({ preventDefault() { fermato = true; } }, e)); return fermato; };
// come il browser: il fuoco arriva (onfocus), si scrive (oninput), si esce (onblur)
const entra = el => { el.focus(); if (el.onfocus) el.onfocus(); return el; };
async function scrivi(h, f, testo, esci = true) {
  const el = entra(campo(h, f)); el.value = testo; el.oninput(); if (esci) { el.onblur(); await tick(); }
  return el;
}
async function vaiA(h, id) { await riga(h, id).click(); await tick(); }
const decisione = (h, issueId) => (h.final().initial.decisions[issueId] || {}).choice || 'pending';
/* Un evento di tastiera che attraversa le fasi come nel browser: la cattura su window (dove ascolta la veste),
   la cattura del documento (una console MappAIModal sotto il Banco aperto con `alza`, mappai-modal.js:935-945),
   la bolla sul modale (R.open), la bolla sul documento (mappai-undo.js:110-117). Chi chiama `stopPropagation`
   ferma le fasi dopo. */
function evento(h, e, fasi = {}) {
  const ev = Object.assign({ prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }, e);
  for (const l of h.finestra.filter(x => x.k === 'keydown' && x.cattura).slice()) { l.fn(ev); if (ev.stopped) return ev; }
  if (fasi.console) { fasi.console(ev); if (ev.stopped) return ev; }
  h.modal.listeners.keydown(ev); if (ev.stopped) return ev;
  if (fasi.documento) fasi.documento(ev);
  return ev;
}
const alternativa = (h, k) => q(h, '[data-veste-scheda] [data-veste-input="options"][data-veste-indice="' + k + '"]');
/* 0086, giro 3c: le spunte anche in G2 e sui collegamenti — la spunta di una nota, la sua area «Proposta» che si copia nel
   campo, il bottone in fondo (in G2 il bottone del materiale) e la sua riga */
const spuntaG = (h, id) => q(h, '[data-veste-spunta="' + id + '"]');
const vistaG = (h, id) => { const e = q(h, '[data-veste-spunta-etichetta="' + id + '"]'); return !!e && !e.hidden; };
const nomeSpuntaG = (h, id) => q(h, '[data-veste-spunta-etichetta="' + id + '"] [data-veste-spunta-nome]').textContent;
async function cambiaG(h, id, valore) { const el = spuntaG(h, id); el.checked = valore; el.onchange(); await tick(); }
const bottoniNotaG = (h, id) => qa(h, '[data-veste-nota="' + id + '"] button').map(b => b.textContent);
const areaG = (h, id) => q(h, '[data-veste-nota="' + id + '"] [data-veste-nota-proposta]');
const attesaG = h => q(h, '#mrv-veste-attesa').textContent;
const costoG = h => { const el = q(h, '#mrv-veste-costo'); return el && !el.hidden ? el.textContent : ''; };
async function premiG(h) { await bottone(h).click(); await tick(); await tick(); }
const esitoG = (h, id) => q(h, '[data-veste-nota="' + id + '"] [data-veste-esito]').textContent;
// il materiale come risulta dalle decisioni prese (con le note ancora aperte `previewItem` non applica niente: trappola 1)
const itemG2 = (h, id) => BancoCore.testoAdesso(null, h.final(), { db: { items: h.m.review.final.items }, bersaglio: { kind: 'item', id, field: '$item' } }).adesso;

/* ═══ L'interruttore ═════════════════════════════════════════════════════ */
test('a interruttore spento il Banco di G2 è quello di oggi byte per byte; la veste vive solo nel Banco (in G2 e, dallo 0075, in G1)', () => {
  const html = o => { const h = runtime(o); h.apri(); return h.dom.html(); };
  const oggi = html({ senzaVeste: true });
  // packet 0089 (ADR 0020): l'interruttore assente vale acceso; spento solo col '0' (inv. 1)
  assert.notEqual(html({ flag: null }), oggi, 'l’interruttore assente accende la veste');
  assert.equal(html({ flag: null }), html({}), 'l’interruttore assente è come \'1\'');
  assert.equal(html({ flag: '0' }), oggi);
  assert.ok(oggi.includes('mrv-manual-confirm') && oggi.includes('data-review-filter'), 'il modale di oggi ha la spunta e i filtri delle segnalazioni');
  const acceso = runtime(); acceso.apri();
  assert.ok(acceso.modal.className.includes('mrv-veste'));
  assert.ok(!acceso.dom.html().includes('data-review-filter'));
  // 0075, punto 1: G1 prende la veste con lo stesso interruttore (prima dello 0075 qui si chiedeva il contrario);
  // senza il Banco (mappai_revisione_banco = '0') niente veste
  const g1 = runtime(); g1.apri({});
  assert.ok(g1.modal.className.includes('mrv-veste'));
  const spento = runtime({ storage: { mappai_revisione_banco: '0' } }); spento.apri();
  assert.ok(!spento.modal.className.includes('mrv-veste'));
  assert.ok(!!spento.modal.querySelector('#mrv-manual-confirm'));
  assert.equal([acceso, g1, spento].reduce((n, h) => n + h.calls.manifest, 0), 0, 'aprire non scrive niente');
});

/* ═══ Barra, scheda, comandi ════════════════════════════════════════════════ */
test('la barra elenca i materiali per tipo coi conteggi; al centro una scheda sola; i comandi di prima non ci sono più', async () => {
  const h = runtime(); h.apri();
  assert.deepEqual(qa(h, '[data-veste-gruppo]').map(g => g.textContent),
    ['Scelta multipla · 2 di 2', 'Domande aperte · 1 di 1', 'Flashcard · 1 di 1', 'Catene causali · 1 di 1', 'Sintesi · 1 di 1']);
  // dentro un tipo e nei numeri vale l'ordine della bozza controllata (baseSnapshot: il core lo ordina per forma canonica)
  const ordine = h.final().baseSnapshot.items.filter(i => i.kind !== 'nodesheet').map(i => i.id);
  const attese = ['mc', 'open', 'flashcard', 'causal', 'synthesis'].flatMap(k => ordine.filter(id => ITEMS.find(x => x.id === id).kind === k));
  assert.deepEqual(attese, ['mc2', 'mc1', 'op1', 'fc1', 'ca1', 'sy1']);
  assert.deepEqual(qa(h, '[data-veste-riga]').map(b => b.getAttribute('data-veste-riga')), attese);
  assert.deepEqual(qa(h, '[data-veste-riga]').map(b => b.getAttribute('data-stato')), Array(6).fill('da-rivedere'));
  assert.deepEqual(qa(h, '[data-veste-riga]').map(b => b.querySelector('.mrv-veste-num').textContent), attese.map(id => String(ordine.indexOf(id) + 1)));
  assert.equal(riga(h, 'mc1').querySelector('.mrv-veste-note').textContent, '1 nota');
  assert.ok(!riga(h, 'op1').querySelector('.mrv-veste-note'), 'senza note aperte la riga non le nomina');
  assert.ok(!!riga(h, 'op1').querySelector('.mrv-pallino'), 'il pallino «Revisione necessaria» dello 0053');
  assert.equal(riga(h, 'mc2').getAttribute('aria-current'), 'true', 'si apre sulla prima da rivedere');
  assert.equal(qa(h, '[data-veste-scheda]').length, 1);
  assert.equal(scheda(h), 'mc2');
  await vaiA(h, 'mc1');
  assert.equal(qa(h, '[data-veste-scheda]').length, 1);
  assert.equal(riga(h, 'mc1').getAttribute('aria-current'), 'true');
  assert.equal(riga(h, 'mc2').getAttribute('aria-current'), 'false');
  assert.equal(qa(h, '.mrv-card').length, 0);
  assert.equal(q(h, '#mrv-veste-riepilogo').textContent, '6 generati · 3 verificati dal controllo · 6 da rivedere · 0 rivisti e approvati');
  assert.deepEqual(qa(h, '#mrv-filters button').map(b => b.textContent), ['Da rivedere 6', 'Fatti 0', 'Tutti 6']);
  // invariante 21: un comando per cosa
  for (const s of ['#mrv-prev', '#mrv-next', '#mrv-position']) assert.equal(q(h, s).hidden, true, s);
  for (const s of ['#mrv-manual-confirm', '#mrv-show-unchecked', '#mrv-material-coverage', '[data-coverage-approve]', '[data-review-choice]', '[data-edit-save]', '[data-cf-vista]'])
    assert.ok(!q(h, s), s + ' non c’è');
  assert.ok(!!q(h, '#mrv-coverage-options #mrv-retry-judge'), '«Riprova il controllo automatico dei residui» resta dentro «Copertura del controllo»');
  assert.equal(q(h, '#mrv-veste-annulla').textContent, 'CTRL+Z');
  assert.equal(q(h, '#mrv-veste-annulla').disabled, true, 'pila vuota → bottone spento');
  assert.equal(q(h, '#mrv-continue').hidden, true);
  // la scelta multipla: domanda in grassetto, un pallino per alternativa con le lettere, la corretta segnata
  assert.ok(campo(h, 'question').className.includes('mrv-veste-forte'));
  assert.deepEqual(qa(h, '[data-veste-scheda] .mrv-veste-lettera').map(x => x.textContent), ['A', 'B', 'C']);
  assert.deepEqual(qa(h, '[data-veste-scheda] [data-veste-corretta]').map(x => x.checked), [false, true, false]);
  // la nota del controllo sta SOPRA il campo che riguarda, senza titoletto, col nome per lo screen reader
  const nota = q(h, '[data-veste-campo="question"] [data-veste-nota="n-mc1-q"]');
  assert.ok(!!nota);
  assert.equal(nota.getAttribute('aria-label'), 'Nota del controllo');
  assert.ok(h.dom.html().indexOf('data-veste-nota="n-mc1-q"') < h.dom.html().indexOf('data-veste-input="question"'));
  assert.deepEqual(h.mostrate[h.mostrate.length - 1], [{ source: 'Libro.pdf', page: 4, text: 'accusate di aver accettato oro' }], 'la Fonte mostra la prova del materiale attivo');
});

test('Macroarea, ricerca e filtri restringono la barra senza toccare la scheda', async () => {
  const h = runtime(); h.apri();
  await vaiA(h, 'op1');
  const cerca = q(h, '#mrv-search'); cerca.value = 'custod'; await cerca.oninput();
  assert.deepEqual(qa(h, '[data-veste-riga]').map(b => b.getAttribute('data-veste-riga')), ['mc2', 'sy1']);
  assert.equal(scheda(h), 'op1', 'la scheda resta dov’è');
  cerca.value = ''; await cerca.oninput();
  await q(h, '[data-veste-filtro="fatti"]').click();
  assert.equal(qa(h, '[data-veste-riga]').length, 0);
  await q(h, '[data-veste-filtro="tutti"]').click();
  assert.equal(qa(h, '[data-veste-riga]').length, 6);
  assert.equal(q(h, '[data-veste-filtro="tutti"]').getAttribute('aria-pressed'), 'true');
  assert.ok(!!q(h, '#mrv-area'), 'Macroarea resta');
  assert.equal(q(h, 'label[for=mrv-reason]').hidden, true);
});

/* ═══ 0015 §4.1-§4.3 ══════════════════════════════════════════════════════ */
test('0015 §4.1: entrare e uscire da un campo senza cambiarlo non scrive niente (anche scrivendo e tornando com’era)', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'fc1');
  const prima = clone(h.final());
  const el = entra(campo(h, 'answer')); el.onblur(); await tick();
  entra(el); el.value = 'Non prendere parte alla guerra!'; el.oninput(); el.value = 'Non prendere parte alla guerra.'; el.oninput(); el.onblur(); await tick();
  assert.equal(h.calls.manifest, 0);
  assert.deepEqual(clone(h.final()), prima);
  // una nota con proposta: aprire «Testi» e uscire non sceglie la proposta
  await vaiA(h, 'mc1');
  await q(h, '[data-veste-campo="question"] [data-veste-vista="testi"]').click();
  const d = entra(campo(h, 'question')); d.onblur(); await tick();
  assert.equal(decisione(h, 'n-mc1-q'), 'pending');
  assert.equal(h.calls.manifest, 0);
});

test('R1: si salva all’uscita dal campo, mai a battuta; la correzione non approva (0015 §4.2) e la scheda non si ricostruisce', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'op1');
  const el = campo(h, 'guide'); el.focus();
  for (const testo of ['Le banche accettarono', 'Le banche accettarono oro rubato', 'Le banche accettarono oro rubato.']) { el.value = testo; el.oninput(); }
  await tick();
  assert.equal(h.calls.manifest, 0, 'nessuna scrittura a battuta');
  const altra = riga(h, 'sy1');
  el.onblur(); await tick();
  assert.ok(riga(h, 'sy1') === altra, 'la barra si aggiorna sul posto: la riga che si sta per cliccare non viene ricostruita');
  assert.equal(h.calls.manifest, 1);
  const correzione = h.final().initial.issues.find(i => i.origin === 'teacher' && i.target.id === 'op1');
  assert.ok(!!correzione, 'nasce la correzione del docente');
  assert.equal(h.final().initial.decisions[correzione.id].choice, 'manual');
  assert.equal(h.final().initial.decisions[correzione.id].text, 'Le banche accettarono oro rubato.');
  assert.equal(statoRiga(h, 'op1'), 'da-rivedere', 'una correzione non equivale ad approvazione');
  assert.ok(campo(h, 'guide') === el, 'la scheda resta quella: lo stesso campo, non uno ricostruito');
  assert.equal(h.saved.manifest.review.final.review.initial.decisions[correzione.id].text, 'Le banche accettarono oro rubato.');
});

test('R1: il cambio di materiale salva il campo aperto; con il salvataggio fallito la navigazione si ferma', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'fc1');
  await scrivi(h, 'answer', 'Non partecipare alla guerra.', false);
  await vaiA(h, 'sy1');
  assert.equal(h.calls.manifest, 1);
  assert.equal(scheda(h), 'sy1');
  assert.equal(BancoCore.testoAdesso(null, h.final(), { db: { items: h.m.review.final.items }, bersaglio: { kind: 'item', id: 'fc1', field: 'answer' } }).adesso, 'Non partecipare alla guerra.');
  const g = runtime({ failSave: true }); g.apri(); await vaiA(g, 'fc1');
  await scrivi(g, 'answer', 'Non partecipare alla guerra.');
  assert.match(q(g, '#mrv-status').textContent, /Disco non disponibile/);
  assert.equal(q(g, '#mrv-save-retry').hidden, false, '«Riprova il salvataggio»');
  await vaiA(g, 'sy1');
  assert.equal(scheda(g), 'fc1', 'navigazione ferma');
  tasto(g, { key: 'ArrowDown', altKey: true }); await tick();
  assert.equal(scheda(g), 'fc1');
  g.opts.failSave = false; await q(g, '#mrv-save-retry').click(); await tick();
  await vaiA(g, 'sy1');
  assert.equal(scheda(g), 'sy1');
  // e la chiusura («Salva e continua più tardi») salva il campo aperto prima di chiudere
  const c = runtime(); c.apri(); await vaiA(c, 'fc1');
  await scrivi(c, 'answer', 'Non partecipare alla guerra.', false);
  await q(c, '#mrv-later').click(); await tick();
  assert.equal(c.calls.manifest, 1);
  assert.ok(!c.dom.html().includes('mappai-teacher-review'), 'chiuso dopo il salvataggio');
  assert.equal(BancoCore.testoAdesso(null, c.saved.manifest.review.final.review, { db: { items: c.m.review.final.items }, bersaglio: { kind: 'item', id: 'fc1', field: 'answer' } }).adesso, 'Non partecipare alla guerra.');
});

test('0015 §4.3 e rev. 3 punto 4 (0086 g3c: rev. 12, il bottone del materiale non è mai spento per una nota aperta): con una nota aperta il bottone registra la sua spunta e il visto in una scrittura; Ctrl+Invio non fa niente', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc2');
  assert.equal(bottone(h).disabled, false);
  assert.equal(bottone(h).textContent, 'Approvato');
  assert.equal(q(h, '#mrv-veste-attesa').textContent, '');
  tasto(h, { key: 'Enter', ctrlKey: true }); await tick();
  assert.equal(h.calls.manifest, 0);
  assert.ok(!h.final().initial.manualChecks || !h.final().initial.manualChecks.mc2);
  await premiG(h);
  assert.equal(decisione(h, 'n-mc2-e'), 'reject');
  assert.equal(h.calls.manifest, 1, 'la nota e il visto in una scrittura');
  assert.equal(statoRiga(h, 'mc2'), 'approvato');
  assert.ok(!riga(h, 'mc2').querySelector('.mrv-veste-note'), 'la riga non conta più note aperte');
});

/* ═══ Il bottone: Rivisto / Approvato, un dato per ogni riga ═══════════════ */
test('rev. 5 A: il nome del bottone segue il testo a schermo; il clic registra l’impronta, salva e apre il successivo', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'fc1');
  assert.equal(bottone(h).textContent, 'Approvato');
  const el = await scrivi(h, 'answer', 'Non prendere parte alla guerra', false);
  assert.equal(bottone(h).textContent, 'Approvato', 'solo punteggiatura');
  el.value = 'Non partecipare alla guerra.'; el.oninput();
  assert.equal(bottone(h).textContent, 'Rivisto', 'il nome cambia mentre si scrive');
  assert.equal(h.calls.manifest, 0);
  await bottone(h).click(); await tick();
  assert.equal(h.calls.manifest, 2, 'una scrittura per il campo, una per il clic');
  const p = Core.previewItem(h.final(), { items: h.m.review.final.items }, 'fc1');
  assert.equal(h.final().initial.manualChecks.fc1.impronta, impronta(JSON.stringify(p.db.items.find(i => i.id === 'fc1'))));
  assert.equal(statoRiga(h, 'fc1'), 'rivisto');
  assert.equal(scheda(h), 'ca1', 'successiva: la prossima da rivedere dopo quella attiva');
  assert.equal(q(h, '#mrv-veste-riepilogo').textContent, '6 generati · 3 verificati dal controllo · 5 da rivedere · 1 rivisti e approvati');
  // un materiale invariato è «Approvato»
  await vaiA(h, 'sy1'); await bottone(h).click(); await tick();
  assert.equal(statoRiga(h, 'sy1'), 'approvato');
  assert.ok(!!riga(h, 'sy1').querySelector('.mrv-teacher-approved'), 'la spunta al posto del pallino');
  // l'approvazione decade da sé se il testo cambia per un'altra strada (0015 §4.2)
  await vaiA(h, 'fc1'); await scrivi(h, 'answer', 'Non partecipare mai alla guerra.');
  assert.equal(statoRiga(h, 'fc1'), 'da-rivedere');
  // con «Da rivedere» la riga appena fatta resta in vista con la spunta; al prossimo cambio di filtro esce
  assert.equal(statoRiga(h, 'sy1'), 'approvato');
  await q(h, '[data-veste-filtro="fatti"]').click(); await q(h, '[data-veste-filtro="da-rivedere"]').click();
  assert.ok(!riga(h, 'sy1'), 'sy1 è fatta: fuori da «Da rivedere»');
  assert.ok(!!riga(h, 'fc1'));
});

test('rev. 5 D: il clic è un dato anche per un materiale segnalato con il controllo completo; poi G2 si chiude', async () => {
  const report = { checkStatus: 'completed', issues: [clone(NOTE[0])] };
  const h = runtime({ report }); h.apri();
  assert.deepEqual(qa(h, '[data-veste-riga]').map(b => b.getAttribute('data-veste-riga')), ['mc1']);
  assert.ok(!q(h, '#mrv-retry-judge'), 'controllo completo: niente da riprovare');
  // 0086 g3c: la proposta si copia dall'area della nota e il bottone del materiale la registra insieme al visto
  areaG(h, 'n-mc1-q').onclick(); await tick();
  assert.equal(bottone(h).textContent, 'Rivisto');
  assert.equal(q(h, '#mrv-continue').hidden, true, 'senza il bottone il materiale resta da rivedere');
  await premiG(h);
  assert.equal(decisione(h, 'n-mc1-q'), 'accept');
  assert.ok(!!h.final().initial.manualChecks.mc1, 'setManualCheck anche con checkStatus completed');
  assert.equal(statoRiga(h, 'mc1'), 'rivisto');
  assert.equal(q(h, '#mrv-continue').hidden, false);
  assert.equal(q(h, '#mrv-continue').textContent, 'Salva le decisioni e completa i materiali');
  // Cmd/Ctrl+Invio non arriva mai al bottone finale
  tasto(h, { key: 'Enter', metaKey: true }); await tick();
  assert.equal(h.m.review.final.stage, 'awaiting_review');
  await q(h, '#mrv-continue').click(); await tick();
  assert.equal(h.m.review.final.stage, 'approved');
  assert.equal(h.saved.manifest.review.final.items.find(i => i.id === 'mc1').question, 'Chi venne accusato?');
});

test('R4: niente spunta in blocco; G2 si chiude solo quando ogni riga è fatta, con manualReview se il controllo è parziale', async () => {
  const h = runtime(); h.apri();
  assert.ok(!q(h, '#mrv-manual-confirm'));
  assert.ok(!h.dom.html().includes('Scelgo di completare io il controllo'));
  assert.equal(scheda(h), 'mc2');
  // 0086 g3c: la nota ha la spunta; il bottone del materiale la registra col visto e apre il successivo
  await premiG(h);
  assert.equal(scheda(h), 'mc1', 'il bottone apre il successivo');
  await premiG(h);
  for (const id of ['op1', 'fc1']) { assert.equal(scheda(h), id); await bottone(h).click(); await tick(); }
  assert.equal(scheda(h), 'ca1');
  // un'esclusione proposta: la spunta «Tieni il materiale»; tolta, il bottone esclude il materiale
  assert.equal(nomeSpuntaG(h, 'n-ca1'), 'Tieni il materiale');
  await cambiaG(h, 'n-ca1', false); await premiG(h);
  assert.equal(statoRiga(h, 'ca1'), 'escluso');
  assert.equal(q(h, '#mrv-continue').hidden, true, 'sy1 è ancora da rivedere');
  await vaiA(h, 'sy1'); await bottone(h).click(); await tick();
  assert.equal(q(h, '#mrv-continue').hidden, false);
  assert.match(q(h, '#mrv-next-step').textContent, /Hai rivisto tutti i materiali/);
  await q(h, '#mrv-continue').click(); await tick();
  assert.equal(h.m.review.final.stage, 'approved');
  assert.equal(h.final().initial.manualReview, true);
  assert.ok(!h.m.review.final.items.some(i => i.id === 'ca1'), 'il materiale escluso non va all’allievo');
});

/* ═══ ⌘Z / Ctrl+Z ═════════════════════════════════════════════════════════ */
test('R2: ⌘Z toglie l’ultima scrittura e riapre la scheda di quel materiale; dentro un campo con battitura non salvata è del campo', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'sy1');
  // 0086 g3c: la prima scrittura è una correzione nel campo (le note non hanno più gesti); g3d (D41): su un materiale senza
  // note del controllo, perché su mc2 il campo è una bozza fino al bottone
  await scrivi(h, 'text', 'Le banche custodivano oro tedesco.');
  assert.equal(q(h, '#mrv-veste-annulla').disabled, false);
  await vaiA(h, 'op1');
  const el = await scrivi(h, 'guide', 'Le banche accettarono oro rubato.', false);
  const fermato = tasto(h, { key: 'z', ctrlKey: true });
  assert.equal(fermato, false, 'nel campo con battitura non salvata ⌘Z resta quello nativo');
  assert.equal(adessoG2(h, 'sy1', 'text'), 'Le banche custodivano oro tedesco.');
  el.onblur(); await tick();
  const scritte = h.calls.manifest;
  q(h, '#mrv-veste-annulla').focus();
  assert.equal(tasto(h, { key: 'z', ctrlKey: true }), true); await tick();
  assert.equal(h.calls.manifest, scritte + 1, 'si rimette la revisione di prima e si salva');
  assert.ok(!h.final().initial.issues.some(i => i.origin === 'teacher' && i.target.id === 'op1'), 'la correzione della traccia è tolta');
  assert.equal(scheda(h), 'op1');
  await q(h, '#mrv-veste-annulla').click(); await tick();
  assert.equal(adessoG2(h, 'sy1', 'text'), 'Le banche custodivano oro.', 'e prima ancora la correzione della sintesi');
  assert.equal(scheda(h), 'sy1', 'la scheda di quel materiale torna attiva');
  assert.equal(q(h, '#mrv-veste-annulla').disabled, true, 'pila vuota');
  assert.equal(q(h, '#mrv-veste-annulla').getAttribute('aria-label'), 'Annulla l’ultima azione');
});

/* ═══ Tastiera ════════════════════════════════════════════════════════════ */
// gate 3, G8: Alt+↑/↓ tolto dalla veste (Giacomo: «Toglilo»). Prima del gate qui si provava che salvava e cambiava riga.
test('tastiera: Esc in un campo rimette l’ultimo salvato senza scrivere; fuori Esc chiude come oggi; Alt+↑/↓ non fa niente', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'fc1');
  const el = await scrivi(h, 'answer', 'Testo da buttare', false);
  assert.equal(tasto(h, { key: 'Escape' }), true); await tick();
  assert.equal(el.value, 'Non prendere parte alla guerra.');
  assert.equal(h.calls.manifest, 0);
  assert.ok(h.dom.html().includes('mappai-teacher-review'), 'il Banco resta aperto');
  await scrivi(h, 'answer', 'Non partecipare alla guerra.', false);
  tasto(h, { key: 'ArrowDown', altKey: true }); await tick(); await tick();
  assert.equal(h.calls.manifest, 0, 'Alt+↓ non salva');
  assert.equal(scheda(h), 'fc1', 'e non cambia riga');
  tasto(h, { key: 'ArrowUp', altKey: true }); await tick(); await tick();
  assert.equal(scheda(h), 'fc1');
  assert.equal(campo(h, 'answer').value, 'Non partecipare alla guerra.', 'la battitura resta nel campo');
  q(h, '#mrv-title').focus();
  tasto(h, { key: 'Escape' }); await tick(); await tick();
  assert.ok(!h.dom.html().includes('mappai-teacher-review'), 'fuori da un campo Esc fa quello che fa oggi');
});

/* ═══ Esclusione, alternative, «Prima / Proposta» ═════════════════════════ */
test('Escludi / Ripristina per il materiale intero: le scelte si conservano, ⌘Z le toglie', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc1');
  // 0086 g3c: la scelta è la proposta copiata nel campo e salvata (una correzione del docente)
  areaG(h, 'n-mc1-q').onclick(); campo(h, 'question').onblur(); await tick();
  await q(h, '#mrv-veste-escludi').click(); await tick();
  assert.equal(statoRiga(h, 'mc1'), 'escluso');
  assert.equal(q(h, '#mrv-veste-escludi').textContent, 'Ripristina');
  assert.equal(bottone(h).hidden, true);
  assert.ok(!!riga(h, 'mc1').querySelector('.mrv-veste-escluso'), 'un segno distinto per l’escluso');
  await q(h, '#mrv-veste-escludi').click(); await tick();
  assert.equal(statoRiga(h, 'mc1'), 'da-rivedere');
  assert.equal(adessoG2(h, 'mc1', 'question'), 'Chi venne accusato?', 'la correzione salvata prima dell’esclusione resta');
  await q(h, '#mrv-veste-annulla').click(); await tick();
  assert.equal(statoRiga(h, 'mc1'), 'escluso', '⌘Z toglie il ripristino');
});

test('le alternative: togliere una alternativa sposta la corretta; togliere la corretta ferma tutto finché non se ne sceglie un’altra', async () => {
  // 0086 g3d (D41): mc1 senza la nota del controllo — con la nota le alternative sono una bozza fino al bottone (test «0086 g3d D41 G2, le alternative»)
  const h = runtime({ report: senzaNotaMc1() }); h.apri(); await vaiA(h, 'mc1');
  const scritte = h.calls.manifest;
  await q(h, '[data-veste-scheda] [data-veste-togli="0"]').click(); await tick();
  assert.equal(h.calls.manifest, scritte + 1, 'un gesto, una scrittura');
  let it = itemG2(h, 'mc1');
  assert.deepEqual([it.options, it.correctIndex], [['Le banche', 'I cantoni'], 0]);
  // «Aggiungi un’alternativa»: la riga vuota non si salva finché non ha un testo
  await q(h, '[data-veste-scheda] [data-veste-aggiungi]').click(); await tick();
  assert.equal(h.calls.manifest, scritte + 1);
  const nuova = entra(alternativa(h, 2)); nuova.value = 'Il Parlamento'; nuova.oninput(); nuova.onblur(); await tick();
  assert.equal(h.calls.manifest, scritte + 2);
  await q(h, '[data-veste-scheda] [data-veste-togli="0"]').click(); await tick();
  assert.equal(h.calls.manifest, scritte + 2, 'tolta la corretta non si scrive');
  assert.equal(bottone(h).disabled, true);
  assert.match(q(h, '#mrv-veste-attesa').textContent, /risposta corretta/);
  await vaiA(h, 'mc2');
  assert.equal(scheda(h), 'mc1', 'un campo non valido ferma la navigazione e lo dice');
  assert.match(q(h, '#mrv-status').textContent, /risposta corretta/);
  const radio = q(h, '[data-veste-scheda] [data-veste-corretta="1"]'); radio.checked = true; await radio.onchange(); await tick();
  assert.equal(h.calls.manifest, scritte + 3, 'alternative e corretta in una scrittura sola');
  it = itemG2(h, 'mc1');
  assert.deepEqual([it.options, it.correctIndex], [['I cantoni', 'Il Parlamento'], 1]);
  assert.equal(bottone(h).disabled, false);
});

test('«Prima / Proposta» (0086 g3c, D36.1): il campo parte dall’«Originale»; la proposta copiata dall’area della nota fa le due aree, «Originale» colorata e le parole aggiunte verdi nel campo; «Differenze» di sola lettura; al salvataggio niente scambio e la nota resta aperta (D37.1); nota senza proposta', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc1');
  const c = () => q(h, '[data-veste-campo="question"]');
  assert.equal(campo(h, 'question').value, 'Chi fu accusato?', 'la proposta non è scritta nel campo');
  assert.equal(c().querySelector('[data-veste-seg]').hidden, true, 'un campo solo');
  areaG(h, 'n-mc1-q').onclick(); await tick();
  assert.equal(c().querySelector('[data-veste-seg]').hidden, false);
  assert.equal(c().querySelector('[data-veste-prima-testo] del').textContent, 'fu');
  assert.deepEqual(c().querySelectorAll('[data-veste-sfondo] ins').map(x => x.textContent), ['venne']);
  await c().querySelector('[data-veste-vista="differenze"]').onclick();
  assert.equal(c().querySelector('[data-veste-diff] ins').textContent, 'venne');
  assert.equal(c().querySelector('[data-veste-vivo]').hidden, true, 'in «Differenze» non si scrive');
  await c().querySelector('[data-veste-diff]').onclick();
  assert.equal(c().querySelector('[data-veste-vista="testi"]').getAttribute('aria-pressed'), 'true', 'un clic sulla proposta porta a «Testi»');
  assert.equal(c().querySelector('[data-veste-vivo]').hidden, false);
  const el = campo(h, 'question'); el.value = 'Chi venne mai accusato?'; el.oninput();
  assert.equal(c().querySelector('[data-veste-prima-testo] del').textContent, 'fu', '«Prima» resta colorata mentre si scrive');
  assert.deepEqual(c().querySelectorAll('[data-veste-sfondo] ins').map(x => x.textContent), ['venne mai'], 'le parole aggiunte restano verdi nel campo');
  assert.equal(c().querySelector('[data-veste-sfondo]').textContent, 'Chi venne mai accusato?', 'lo strato dietro ha lo stesso identico testo');
  el.onblur(); await tick();
  assert.equal(decisione(h, 'n-mc1-q'), 'pending', 'il salvataggio non chiude la nota (D37.1)');
  assert.equal(c().querySelector('[data-veste-prima-testo]').textContent, 'Chi fu accusato?', 'niente scambio: «Prima» resta il testo di partenza');
  assert.equal(!!c().querySelector('[data-veste-partenza]'), false, 'il testo di partenza è già sopra: niente bottone «Testo di partenza»');
  // nota senza proposta: un campo solo; selettore e «Prima» compaiono appena si scrive
  await vaiA(h, 'mc2');
  const s = () => q(h, '[data-veste-campo="explanation"]');
  assert.equal(s().querySelector('[data-veste-seg]').hidden, true);
  assert.equal(s().querySelector('[data-veste-prima]').hidden, true);
  const e2 = campo(h, 'explanation'); e2.focus(); e2.value = 'I depositi d’oro.'; e2.oninput();
  assert.equal(s().querySelector('[data-veste-seg]').hidden, false);
  assert.equal(s().querySelector('[data-veste-prima]').hidden, false);
  assert.equal(s().querySelector('[data-veste-vivo]').hidden, false, 'si continua a scrivere');
});

test('testi lunghi: in «Differenze» solo le frasi cambiate, in «Testi» «Prima» parte chiusa', async () => {
  const frase = n => 'Frase numero ' + n + ' della sintesi sulle banche svizzere e il loro ruolo nella guerra.';
  const testo = Array.from({ length: 12 }, (_, i) => frase(i + 1)).join(' ');
  const sy = { id: 'syL', kind: 'synthesis', title: 'Lunga', text: testo };
  const report = { checkStatus: 'incomplete', coverage: { checkedIds: [] }, issues: [
    { id: 'L1', target: { kind: 'item', id: 'syL', field: 'text' }, after: testo.replace('Frase numero 5 della', 'Frase numero 5, rivista, della'), problem: 'Una frase da rivedere.' }] };
  const h = runtime({ items: [sy], report }); h.apri();
  const c = () => q(h, '[data-veste-campo="text"]');
  assert.ok(testo.length > 600);
  // 0086 g3c: la proposta arriva nel campo dall'area della nota (prima la scriveva `carica`)
  areaG(h, 'L1').onclick(); await tick();
  await c().querySelector('[data-veste-vista="differenze"]').onclick();
  assert.equal(c().querySelectorAll('[data-veste-diff] p').length, 1, 'una frase cambiata, una riga');
  assert.match(c().querySelector('[data-veste-diff]').textContent, /Frase numero 5, rivista,/);
  await c().querySelector('[data-veste-vista="testi"]').onclick();
  assert.equal(c().querySelector('[data-veste-prima-testo]').hidden, true, '«Prima» parte chiusa');
  assert.equal(c().querySelector('[data-veste-mostra-prima]').hidden, false);
  await c().querySelector('[data-veste-mostra-prima]').onclick();
  assert.equal(c().querySelector('[data-veste-prima-testo]').hidden, false);
});

/* ═══ Stati da non dimenticare ════════════════════════════════════════════ */
test('stati: revisione approvata in sola lettura senza pila; «Riprova il controllo» salva prima il campo e azzera la pila', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc1');
  // 0086 g3c: una scrittura nella pila: una correzione nel campo (le note non hanno più gesti)
  await scrivi(h, 'explanation', 'Furono proprio le banche.');
  await vaiA(h, 'fc1');
  await scrivi(h, 'answer', 'Non partecipare alla guerra.', false);
  let vista = null;
  h.R.retryMaterialJudge = async () => {
    vista = BancoCore.testoAdesso(null, h.final(), { db: { items: h.m.review.final.items }, bersaglio: { kind: 'item', id: 'fc1', field: 'answer' } }).adesso;
    h.m.review.final.review = clone(h.final());
  };
  await q(h, '#mrv-retry-judge').click(); await tick(); await tick();
  assert.equal(vista, 'Non partecipare alla guerra.', 'il campo aperto si salva prima del controllo');
  assert.equal(q(h, '#mrv-veste-annulla').disabled, true, 'dopo «Riprova il controllo» la pila è vuota');
  // approvata: sola lettura, niente bottone, niente pila
  const report = { checkStatus: 'completed', issues: [] }, m = finalManifest(ITEMS, report), fr = m.review.final;
  const prima = Core.beginApproval(fr.review, { items: fr.items }, { sources: fr.review.sources });
  fr.review = Core.completeApproval(prima.review, Core.revision({ items: fr.items }, fr.review.sources)); fr.stage = 'approved';
  const a = runtime({ manifest: m, report }); a.apri();
  assert.equal(qa(a, '[data-veste-riga]').length, 0);
  assert.equal(q(a, '#mrv-veste-annulla').disabled, true);
  assert.equal(q(a, '#mrv-veste-bottone').hidden, true);
  assert.equal(q(a, '#mrv-continue').hidden, false);
  assert.match(q(a, '#mrv-next-step').textContent, /approvata/);
});

test('stati: revisione non più della versione del progetto (stale_revision) e materiale assente dalla bozza: la frase di oggi, nessun bottone', async () => {
  const report = rapporto({ coverage: { expectedIds: ITEMS.map(i => i.id).concat(['perso']), checkedIds: ['mc1', 'mc2', 'ca1'] } });
  const h = runtime({ report }); h.apri();
  assert.equal(statoRiga(h, 'perso'), 'assente');
  assert.equal(q(h, '[data-veste-gruppo="assenti"]').textContent, 'Non nella bozza · 1');
  await vaiA(h, 'perso');
  assert.equal(scheda(h), 'perso');
  assert.match(q(h, '[data-veste-scheda]').textContent, /non è disponibile nella bozza salvata/);
  assert.equal(bottone(h).hidden, true);
  assert.equal(q(h, '#mrv-veste-escludi').hidden, true);
  assert.equal(q(h, '#mrv-veste-riepilogo').textContent, '6 generati · 3 verificati dal controllo · 6 da rivedere · 0 rivisti e approvati', 'l’assente non conta fra i da fare');
  // i materiali cambiati fuori dalla revisione: la frase globale, campi in sola lettura, niente bottone
  const s = runtime(); s.m.review.final.items.find(i => i.id === 'fc1').answer = 'Cambiata altrove.'; s.apri(); await vaiA(s, 'fc1');
  assert.match(q(s, '[data-veste-avvisi]').textContent, /non corrispondono alla versione di questa revisione/);
  assert.equal(campo(s, 'answer').disabled, true);
  assert.equal(bottone(s).hidden, true);
  assert.equal(q(s, '#mrv-continue').hidden, true);
  assert.match(q(s, '#mrv-next-step').textContent, /non corrispondono alla versione/);
});

test('i richiami alle fonti restano protetti: a schermo il nome, nei dati l’id (referenceView / restoreReferences)', async () => {
  const sy = { id: 'syR', kind: 'synthesis', title: 'Le banche', text: 'Le banche custodivano oro [[src-a1]].',
    citations: [{ id: 'src-a1', title: 'Libro.pdf', page: 4, text: 'Le banche svizzere furono accusate di aver accettato oro.' }] };
  const report = { checkStatus: 'incomplete', coverage: { checkedIds: [] }, issues: [] };
  const h = runtime({ items: [sy], report }); h.apri();
  const el = campo(h, 'text');
  assert.equal(el.value, 'Le banche custodivano oro [Fonte 1].');
  assert.equal(q(h, '[data-veste-campo="text"] [data-veste-richiami]').hidden, false);
  await scrivi(h, 'text', 'Le banche custodivano molto oro [Fonte 1].');
  const correzione = h.final().initial.issues.find(i => i.origin === 'teacher');
  assert.equal(h.final().initial.decisions[correzione.id].text, 'Le banche custodivano molto oro [[src-a1]].');
  assert.equal(campo(h, 'text').value, 'Le banche custodivano molto oro [Fonte 1].');
  assert.deepEqual(h.mostrate[0], [sy.citations[0]], 'la Fonte riceve il passo citato dal materiale');
});

test('costo: le anteprime si tengono per materiale; un gesto ricalcola solo il suo, una navigazione nessuna', async () => {
  const h = runtime(); h.apri();
  const aperto = h.calls.previewItem;
  assert.ok(aperto >= 6 && aperto <= 7, 'all’apertura una anteprima per riga (' + aperto + ')');
  await vaiA(h, 'fc1');
  assert.equal(h.calls.previewItem, aperto, 'cambiare materiale non ricalcola');
  await scrivi(h, 'answer', 'Non partecipare alla guerra.');
  assert.equal(h.calls.previewItem, aperto + 1, 'il campo salvato ricalcola solo il suo materiale');
  const p = h.calls.preview;
  await bottone(h).click(); await tick();
  assert.equal(h.calls.previewItem, aperto + 1, 'il clic non cambia le anteprime');
  assert.ok(h.calls.preview - p <= 2, 'il controllo globale per la chiusura, non uno per riga');
});

test('il modulo: UMD, chiavi nuove solo in en_translations, nessuna scrittura su disco da sé', () => {
  const src = fs.readFileSync(require.resolve('../public/js/mappai-banco-veste.js'), 'utf8');
  assert.ok(!/electronAPI|localStorage|writeManifest|saveVaultFile/.test(src), 'tutto passa dall’oggetto che R.open le dà');
  assert.ok(!/window\.t\b/.test(src));
  assert.equal(typeof Veste().monta, 'function');
  const en = fs.readFileSync(require.resolve('../public/traduzioni/en_translations.js'), 'utf8');
  const it = fs.readFileSync(require.resolve('../public/traduzioni/it_translations.js'), 'utf8');
  const chiavi = [...src.matchAll(/\bt\('(rv_veste_[a-z0-9_]+)'/g)].map(x => x[1]);
  assert.ok(chiavi.length > 10);
  for (const k of chiavi) { assert.ok(en.includes(k + ':'), k + ' in en'); assert.ok(!it.includes(k + ':'), k + ' non in it (invariante 14)'); }
  const ctx = vm.createContext({});
  for (const f of ['mappai-review-core.js', 'mappai-review-context.js', 'mappai-banco-core.js', 'mappai-banco-veste.js'])
    vm.runInContext(fs.readFileSync(require.resolve('../public/js/' + f), 'utf8'), ctx);
  assert.equal(typeof ctx.MappAIBancoVeste.monta, 'function');
});

/* ═══ GIRO DI CORREZIONE (05/10): i dodici difetti delle due verifiche indipendenti ═════════════════════════
   Ogni test qui sotto è stato scritto PRIMA del codice che lo fa passare. */

// mappai-undo.js VERO, col suo ascolto sul documento: un'azione sulla mappa fatta prima di aprire il Banco
function mappaConUndo() {
  const ascolti = [];
  const finto = { addEventListener: (k, fn) => ascolti.push({ k, fn }), getElementById: () => null,
    get activeElement() { return { tagName: 'BUTTON', closest: () => null }; } };
  const ctx = vm.createContext({ document: finto, console, appState: { db: { nodes: [{ id: 'x', label: 'Economia' }], links: [], sourcesDict: {}, customColors: {} } } });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/mappai-undo.js'), 'utf8'), ctx);
  ctx.pushUndoSnapshot('Elimina Nodo: Economia');
  ctx.appState.db.nodes = [];
  return { ctx, documento: ascolti.find(l => l.k === 'keydown').fn };
}

test('difetto 1: ⌘Z della veste ferma l’evento — l’annulla della MAPPA (mappai-undo.js vero) non lo riceve', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc2');
  // 0086 g3c: l'ultima scrittura della veste è una correzione nel campo (le note non hanno più gesti)
  await scrivi(h, 'explanation', 'I depositi d’oro.');
  const mappa = mappaConUndo();
  q(h, '#mrv-veste-annulla').focus();
  const ev = evento(h, { key: 'z', metaKey: true }, { documento: mappa.documento }); await tick(); await tick();
  assert.equal(ev.prevented, true); assert.equal(ev.stopped, true);
  assert.equal(adessoG2(h, 'mc2', 'explanation'), 'I depositi.', 'la veste ha tolto la sua ultima scrittura');
  assert.equal(mappa.ctx.undoStack.length, 1, 'la pila della mappa è intatta');
  assert.equal(mappa.ctx.appState.db.nodes.length, 0, 'la mappa non è tornata indietro');
  // controprova: lo stesso evento, non fermato, l'annulla della mappa lo consuma davvero
  mappa.documento({ key: 'z', metaKey: true, preventDefault() {} });
  assert.equal(mappa.ctx.undoStack.length, 0);
  // e anche Cmd/Ctrl+Invio, Alt+↓ ed Esc nel campo non vanno oltre la veste
  for (const e of [{ key: 'Enter', ctrlKey: true }, { key: 'ArrowDown', altKey: true }]) assert.equal(evento(h, e).stopped, true, e.key);
  await tick(); await tick();
});

/* Gate 3, G7: Cmd/Ctrl+Invio tolto dalla veste (Giacomo: «è una scorciatoia che non mi piace, disattivala»). Prima del
   gate questo test provava che, tenuto premuto, approvava un materiale solo; ora prova che non approva niente, e
   l'approvazione resta del solo clic sul bottone, con le sue guardie (doppio clic, ripetizione). */
test('difetto 2 dopo G7: Cmd/Ctrl+Invio (anche tenuto premuto) non approva niente; il doppio clic e ⌘Z tenuto premuto fanno un gesto solo', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'op1');
  tasto(h, { key: 'Enter', metaKey: true }); await tick(); await tick();
  for (let k = 0; k < 4; k++) { tasto(h, { key: 'Enter', metaKey: true, repeat: true }); await tick(); await tick(); }
  assert.deepEqual(Object.keys(h.final().initial.manualChecks || {}), [], 'Cmd/Ctrl+Invio non approva');
  assert.equal(scheda(h), 'op1');
  await bottone(h).onclick({ detail: 1 }); await tick(); await tick();
  assert.deepEqual(Object.keys(h.final().initial.manualChecks || {}), ['op1'], 'il clic sì');
  assert.equal(scheda(h), 'fc1');
  q(h, '#mrv-veste-annulla').focus();
  tasto(h, { key: 'z', ctrlKey: true }); await tick(); await tick();
  tasto(h, { key: 'z', ctrlKey: true, repeat: true }); await tick(); await tick();
  assert.deepEqual(Object.keys(h.final().initial.manualChecks || {}), [], '⌘Z tenuto premuto toglie una scrittura sola');
  // il doppio clic: il primo approva op1 e apre fc1 (approvabile), il secondo (detail 2) non lo tocca
  const d = runtime(); d.apri(); await vaiA(d, 'op1');
  await bottone(d).onclick({ detail: 1 }); await tick(); await tick();
  assert.equal(scheda(d), 'fc1');
  assert.equal(bottone(d).disabled, false, 'fc1 si potrebbe approvare: il test lo prova davvero');
  await bottone(d).onclick({ detail: 2 }); await tick(); await tick();
  assert.deepEqual(Object.keys(d.final().initial.manualChecks), ['op1'], 'il secondo clic del doppio clic non arriva a fc1');
  assert.equal(scheda(d), 'fc1');
});

test('difetto 3 (0086 g3c): sotto due alternative non si salva; una struttura non valida spegne il bottone col motivo (la riga segnata è nel test dopo: con le note aperte fino al bottone `previewItem` non applica le decisioni)', async () => {
  const report = { checkStatus: 'completed', issues: [clone(NOTE[0])] };
  const h = runtime({ report }); h.apri();
  await q(h, '[data-veste-scheda] [data-veste-togli="2"]').click(); await tick();
  const scritte = h.calls.manifest;
  await q(h, '[data-veste-scheda] [data-veste-togli="0"]').click(); await tick();
  assert.equal(h.calls.manifest, scritte, 'con una sola alternativa non si salva');
  assert.equal(bottone(h).disabled, true);
  assert.match(q(h, '#mrv-veste-attesa').textContent, /almeno due alternative/);
  // la struttura generata non valida (due alternative uguali), con le note del controllo strutturale tenute
  const items = [{ id: 'mcD', kind: 'mc', question: 'Chi fu accusato?', options: ['Le banche', 'Le banche', 'I cantoni'], correctIndex: 0, explanation: 'Furono le banche.' }];
  const g = runtime({ items, report: { checkStatus: 'completed', issues: Material.validate(items).issues } }); g.apri();
  // 0086 g3c: le note del controllo strutturale hanno la spunta; il bottone resta spento per la struttura, col motivo
  assert.equal(bottone(g).disabled, true);
  assert.match(q(g, '#mrv-veste-attesa').textContent, /stesso testo/);
  await bottone(g).onclick({ detail: 1 }); await tick();
  assert.ok(!(g.final().initial.manualChecks || {}).mcD, 'non diventa «Approvato»');
  assert.equal(q(g, '#mrv-continue').hidden, true);
  const a = entra(q(g, '[data-veste-scheda] [data-veste-input="options"][data-veste-indice="1"]')); a.value = 'Lo Stato'; a.oninput(); a.onblur(); await tick();
  assert.equal(bottone(g).disabled, false, 'corretta la struttura, si può approvare');
});

test('difetto 3: un materiale non valido senza nessuna nota (il controllo non l’ha segnalato) ha la sua riga, segnata; la chiusura non resta ferma senza un perché', async () => {
  const items = ITEMS.concat([{ id: 'mcD', kind: 'mc', question: 'Chi fu accusato?', options: ['Le banche', 'Le banche'], correctIndex: 0, explanation: 'Furono le banche.' }]);
  const h = runtime({ items, report: { checkStatus: 'completed', issues: [] } }); h.apri();
  assert.deepEqual(qa(h, '[data-veste-riga]').map(b => b.getAttribute('data-veste-riga')), ['mcD']);
  assert.equal(riga(h, 'mcD').getAttribute('data-invalido'), 'true');
  assert.equal(bottone(h).disabled, true);
  assert.match(q(h, '#mrv-veste-attesa').textContent, /stesso testo/);
  assert.equal(q(h, '#mrv-continue').hidden, true);
  await q(h, '#mrv-veste-escludi').click(); await tick();
  assert.equal(q(h, '#mrv-continue').hidden, false, 'escluso il materiale non valido, si completa');
});

test('difetto 3: un’approvazione vecchia (impronta che combacia) non tiene «approvato» un materiale non valido', async () => {
  const mcD = { id: 'mcD', kind: 'mc', question: 'Chi fu accusato?', options: ['Le banche', 'Le banche'], correctIndex: 0, explanation: 'Furono le banche.' };
  const report = { checkStatus: 'incomplete', coverage: { checkedIds: [] }, issues: [] };
  const m = finalManifest([mcD], report), r = m.review.final.review;
  const p = Core.previewItem(r, { items: m.review.final.items }, 'mcD');
  r.initial.manualChecks = { mcD: { impronta: impronta(JSON.stringify(p.db.items[0])), updatedAt: null } };
  const h = runtime({ manifest: m, report }); h.apri();
  assert.equal(statoRiga(h, 'mcD'), 'da-rivedere');
  assert.equal(riga(h, 'mcD').getAttribute('data-invalido'), 'true');
  assert.equal(q(h, '#mrv-continue').hidden, true);
});

test('difetto 3: «Righe per rispondere» fuori da 3–12 non si salva, ferma la navigazione e lo dice; Esc rimette il numero', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'op1');
  const n = entra(campo(h, 'lines')); n.value = '40'; n.oninput(); n.onblur(); await tick();
  assert.equal(h.calls.manifest, 0);
  assert.match(q(h, '#mrv-status').textContent, /da 3 a 12/);
  assert.equal(bottone(h).disabled, true);
  await vaiA(h, 'fc1'); assert.equal(scheda(h), 'op1');
  assert.equal(tasto(h, { key: 'Escape' }), true);
  assert.equal(campo(h, 'lines').value, '5');
  await vaiA(h, 'fc1'); assert.equal(scheda(h), 'fc1');
});

test('R5 (difetto 4): controllo parziale e niente da cliccare → la conferma nel piede con una frase vera; senza la casella G2 non si chiude', async () => {
  const report = { checkStatus: 'incomplete', stato: 'parziale', coverage: { expectedIds: ITEMS.map(i => i.id).concat(['perso']), checkedIds: ITEMS.map(i => i.id) }, issues: [] };
  const h = runtime({ report }); h.apri();
  assert.deepEqual(qa(h, '[data-veste-riga]').map(b => b.getAttribute('data-stato')), ['assente']);
  assert.ok(!!q(h, '#mrv-veste-conferma'), 'la casella nel piede');
  assert.match(q(h, '#mrv-next-step').textContent, /parziale/);
  assert.match(q(h, '#mrv-next-step').textContent, /1 materiale che il rapporto attendeva non è nella bozza/);
  assert.match(q(h, '#mrv-next-step').textContent, /Ho verificato personalmente/);
  assert.equal(q(h, '#mrv-continue').hidden, true, 'senza la casella non si chiude');
  await q(h, '#mrv-continue').onclick(); await tick();
  assert.equal(h.m.review.final.stage, 'awaiting_review');
  const conferma = q(h, '#mrv-veste-conferma'); conferma.checked = true; conferma.onchange();
  assert.equal(q(h, '#mrv-continue').hidden, false);
  await q(h, '#mrv-continue').click(); await tick(); await tick();
  assert.equal(h.m.review.final.stage, 'approved');
  assert.equal(h.final().initial.manualReview, true);
  // zero righe: niente frase falsa, la casella c'è
  const z = runtime({ report: { checkStatus: 'incomplete', stato: 'parziale', coverage: { expectedIds: ITEMS.filter(i => i.kind !== 'nodesheet').map(i => i.id), checkedIds: ITEMS.map(i => i.id) }, issues: [] } }); z.apri();
  assert.equal(qa(z, '[data-veste-riga]').length, 0);
  assert.ok(!z.dom.html().includes('non ha lasciato niente in sospeso'), 'la frase falsa non c’è');
  assert.match(q(z, '#mrv-content').textContent, /parziale/);
  assert.ok(!!q(z, '#mrv-veste-conferma'));
  assert.equal(q(z, '#mrv-continue').hidden, true);
  // con righe da cliccare la casella non c'è (R4); controllo completo e niente da fare: niente casella, si chiude
  const r = runtime(); r.apri(); assert.ok(!q(r, '#mrv-veste-conferma'));
  const c = runtime({ report: { checkStatus: 'completed', issues: [] } }); c.apri();
  assert.ok(!q(c, '#mrv-veste-conferma'));
  assert.equal(q(c, '#mrv-continue').hidden, false);
  assert.match(q(c, '#mrv-content').textContent, /non ha lasciato niente in sospeso/);
});

test('difetto 5: un materiale fuori elenco con una nota aperta (anche del docente, anche una Scheda nodi) ha la sua riga', async () => {
  const report = { checkStatus: 'completed', issues: [clone(NOTE[0])] };
  const m = finalManifest(ITEMS, report);
  m.review.final.review = Core.addIssue(m.review.final.review, { target: { kind: 'item', id: 'op1', field: 'guide' }, origin: 'teacher', blocking: true, problem: 'Modifica del docente: Traccia di risposta' });
  m.review.final.review = Core.addIssue(m.review.final.review, { target: { kind: 'item', id: 'ns1', field: 'text' }, origin: 'teacher', blocking: true, problem: 'Modifica del docente: Testo' });
  const h = runtime({ manifest: m, report }); h.apri();
  assert.deepEqual(qa(h, '[data-veste-riga]').map(b => b.getAttribute('data-veste-riga')), ['mc1', 'op1', 'ns1']);
  assert.equal(riga(h, 'op1').querySelector('.mrv-veste-note').textContent, '1 nota');
  assert.equal(q(h, '[data-veste-gruppo="nodesheet"]').textContent, 'Schede dei nodi · 1 di 1');
  // 0086 g3c: la nota del controllo di mc1 ha la spunta, e il bottone del materiale la registra col visto
  await premiG(h);
  assert.equal(q(h, '#mrv-continue').hidden, true, 'le note aperte su op1 e ns1 tengono chiuso');
  for (const id of ['op1', 'ns1']) {
    await vaiA(h, id);
    const nota = qa(h, '[data-veste-scheda] [data-veste-nota]').find(n => n.getAttribute('data-esito') === 'pending');
    // tredicesimo giro (Q20): la nota sola ha i bottoni in fondo; la scatola porta il nome della nota
    await q(h, '[data-veste-azioni-di="' + nota.getAttribute('data-veste-nota') + '"] [data-veste-tieni]').click(); await tick();
    // R7: decisa la nota, la riga resta «da rivedere» finché non si preme il bottone
    assert.equal(statoRiga(h, id), 'da-rivedere', 'R7: ' + id);
  }
  assert.equal(q(h, '#mrv-continue').hidden, true, 'le note decise non bastano: serve il bottone (rev. 5 A.1)');
  for (const id of ['op1', 'ns1']) { await vaiA(h, id); await bottone(h).click(); await tick(); }
  assert.deepEqual([statoRiga(h, 'op1'), statoRiga(h, 'ns1')], ['approvato', 'approvato']);
  assert.equal(q(h, '#mrv-continue').hidden, false, 'col clic su ognuna, G2 si chiude');
});

test('difetto 6 (rev. 4 A.5; 0086 g3c, D36.1): con due note aperte sul campo il campo parte dall’«Originale», le due proposte si leggono nelle loro note; la correzione del docente resta nel campo, e un ritocco la aggiorna', async () => {
  const issues = [
    { id: 'nA', target: { kind: 'item', id: 'mc1', field: 'question' }, after: 'Chi venne accusato?', problem: 'Riformula.' },
    { id: 'nB', target: { kind: 'item', id: 'mc1', field: 'question' }, after: 'Chi fu accusato dagli Alleati?', problem: 'Manca il soggetto.' }];
  const h = runtime({ report: { checkStatus: 'completed', issues } }); h.apri();
  assert.equal(campo(h, 'question').value, 'Chi fu accusato?', 'all’apertura l’«Originale»');
  assert.equal(q(h, '[data-veste-nota="nA"] [data-veste-nota-proposta]').hidden, false, 'ogni proposta si legge nella sua nota');
  assert.equal(q(h, '[data-veste-nota="nB"] [data-veste-nota-proposta]').hidden, false);
  await scrivi(h, 'question', 'Chi fu accusato di ricettazione?');
  assert.deepEqual([decisione(h, 'nA'), decisione(h, 'nB')], ['pending', 'pending'], 'nessuna nota si chiude (D37.1)');
  assert.equal(campo(h, 'question').value, 'Chi fu accusato di ricettazione?', 'il campo tiene la bozza (0086 g3d, D41)');
  assert.equal(q(h, '[data-veste-campo="question"] [data-veste-prima-testo]').textContent, 'Chi fu accusato?', '«Prima» è il testo di partenza');
  assert.equal(q(h, '[data-veste-nota="nA"] [data-veste-nota-proposta]').hidden, false);
  await scrivi(h, 'question', 'Chi fu davvero accusato di ricettazione?');
  // 0086 g3d (D41): il ritocco aggiorna la bozza; il bottone la registra con le spunte (prima: la correzione salvata all'uscita)
  assert.equal(h.calls.manifest, 0);
  await premiG(h);
  assert.equal(h.calls.manifest, 1);
  const t = h.final().initial.issues.find(i => i.origin === 'teacher');
  assert.equal(h.final().initial.decisions[t.id].text, 'Chi fu davvero accusato di ricettazione?', 'il ritocco è il testo registrato, non la proposta');
  assert.deepEqual([decisione(h, 'nA'), decisione(h, 'nB')], ['reject', 'reject']);
});

/* Nono giro (0075, D1; Q13: «Va bene così» tiene il testo com'è ADESSO nel campo): questo test, nato quando il bottone
   si chiamava «Tieni il testo», fissava che il gesto dopo la battitura la sovrascrivesse (reject: testo di partenza,
   correzione persa). Adeguato: la battitura salvata chiude la nota sola, e «Va bene così» non scrive altro — col mouse e
   da tastiera. Restano il fuoco nel campo al mousedown, la battitura salvata prima del gesto, ⌘Z che la toglie, i gesti
   che restano dove va il fuoco. */
test('difetto 8: aperto sopra una console (alza), Esc dentro un campo arriva alla veste prima della console; l’ascolto si toglie alla chiusura', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'fc1');
  let allaConsole = 0;
  // come `tasti` di mappai-modal.js:935-945, in cattura sul documento: ferma l'Esc e chiude la console
  const console_ = ev => { if (ev.key === 'Escape') { allaConsole++; ev.preventDefault(); ev.stopPropagation(); } };
  const el = await scrivi(h, 'answer', 'Testo da buttare', false);
  const ev = evento(h, { key: 'Escape' }, { console: console_ });
  assert.equal(allaConsole, 0, 'la console non riceve l’Esc del campo');
  assert.equal(ev.stopped, true);
  assert.equal(el.value, 'Non prendere parte alla guerra.', 'la veste ha rimesso il testo salvato');
  assert.equal(h.calls.manifest, 0);
  q(h, '#mrv-title').focus();
  evento(h, { key: 'Escape' }, { console: console_ });
  assert.equal(allaConsole, 1, 'fuori da un campo la cattura della veste non fa niente');
  assert.equal(h.finestra.filter(l => l.cattura).length, 1);
  await q(h, '#mrv-later').click(); await tick();
  assert.equal(h.finestra.filter(l => l.cattura).length, 0, 'tolto alla chiusura');
});

test('difetto 9: ⌘Z con il fuoco nella ricerca (un campo che non è della veste) resta quello nativo', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'sy1');
  await scrivi(h, 'text', 'Le banche custodivano oro tedesco.');   // 0086 g3d (D41): la scrittura su un materiale senza note del controllo
  const cerca = q(h, '#mrv-search'); cerca.focus(); cerca.value = 'banch'; await cerca.oninput();
  const ev = evento(h, { key: 'z', metaKey: true }); await tick();
  assert.equal(ev.prevented, false); assert.equal(ev.stopped, false);
  assert.equal(adessoG2(h, 'sy1', 'text'), 'Le banche custodivano oro tedesco.');
});

test('difetto 10: «Rivedi questo campo» dalle occorrenze apre anche una Scheda nodi, col fuoco sul campo', async () => {
  const h = runtime(); h.apri();
  await q(h, '#mrv-occorrenze').click(); await tick();
  const query = q(h, '#mrv-occurrence-query'); query.value = 'Scheda del nodo'; query.oninput();
  await q(h, '#mrv-occurrence-search').click(); await tick();
  await q(h, '[data-occurrence-item="ns1"] [data-occurrence-edit]').click(); await tick(); await tick();
  assert.equal(scheda(h), 'ns1');
  assert.ok(h.dom.document.activeElement === campo(h, 'text'), 'il fuoco sul campo');
  assert.match(q(h, '#mrv-current-title').textContent, /Scheda nodi/);
});

/* Gate breve, G10 (Giacomo: «ESC funziona ma dovrebbe funzionare anche il bottone '⌘+Z' o i tasti ⌘Z»): la regola del
   difetto 12 («con un campo non valido ⌘Z si ferma e lo dice») è rovesciata. ⌘Z scarta la modifica non salvata come
   Esc e lo dice; l'azione salvata resta. La bozza delle alternative si conserva ancora quando la scheda si ricostruisce
   per un ripristino (⇧⌘Z), che con un campo sporco sullo stesso materiale va avanti. */
test('difetto 12 dopo G10: con un campo non valido ⌘Z scarta la modifica non salvata e lo dice; le alternative conservano la bozza quando la scheda si ricostruisce', async () => {
  const h = runtime({ report: senzaNotaMc1() }); h.apri(); await vaiA(h, 'mc1');
  await scrivi(h, 'explanation', 'Furono proprio le banche.');   // 0086 g3d (D41): mc1 senza la nota, dove il campo si salva all'uscita
  await q(h, '[data-veste-scheda] [data-veste-togli="1"]').click(); await tick();
  assert.equal(bottone(h).disabled, true);
  await q(h, '#mrv-veste-annulla').click(); await tick();
  assert.equal(adessoG2(h, 'mc1', 'explanation'), 'Furono proprio le banche.', 'l’azione salvata resta');
  assert.match(q(h, '#mrv-status').textContent, /^Annullato: la modifica non salvata di «Alternative»/);
  assert.deepEqual([alternativa(h, 0).value, alternativa(h, 1).value, alternativa(h, 2).value], ['Lo Stato', 'Le banche', 'I cantoni'], 'l’alternativa tolta è tornata');
  const g = runtime(); g.apri(); await vaiA(g, 'mc2');
  await q(g, '#mrv-veste-escludi').click(); await tick();
  await q(g, '#mrv-veste-annulla').click(); await tick();
  const a = entra(alternativa(g, 0)); a.value = 'Oro fino'; a.oninput();
  fuoriDalModale(g, { key: 'z', metaKey: true, shiftKey: true }); await tick(); await tick();
  assert.equal(statoRiga(g, 'mc2'), 'escluso', '⇧⌘Z ha rifatto l’esclusione e la scheda si è ricostruita');
  assert.equal(alternativa(g, 0).value, 'Oro fino', 'l’alternativa conserva la bozza');
});

test('giro 2: «completa i materiali» resta nascosto se il `preview` globale non riesce, anche con zero righe (revisione non più della versione)', async () => {
  const s = runtime({ report: { checkStatus: 'completed', issues: [] } });
  s.m.review.final.items.find(i => i.id === 'fc1').answer = 'Cambiata altrove.';
  s.apri();
  assert.equal(qa(s, '[data-veste-riga]').length, 0);
  assert.equal(q(s, '#mrv-continue').hidden, true);
  assert.match(q(s, '#mrv-next-step').textContent, /non corrispondono alla versione/);
});

test('giro 2: con il salvataggio fallito il clic sul bottone non apre il successivo', async () => {
  const h = runtime({ failSave: true }); h.apri(); await vaiA(h, 'op1');
  await bottone(h).click(); await tick(); await tick();
  assert.equal(scheda(h), 'op1');
  assert.match(q(h, '#mrv-status').textContent, /Disco non disponibile/);
});

test('giro 2 (0086 g3c): più campi dello stesso gesto si compongono — la proposta del materiale intero copiata nei campi e un’alternativa tolta, in una scrittura', async () => {
  const mc = ITEMS[0];
  const report = { checkStatus: 'completed', issues: [{ id: 'nX', target: { kind: 'item', id: 'mc1', field: '$item' }, after: Object.assign({}, mc, { explanation: 'Furono proprio le banche.' }), problem: 'Spiegazione' }] };
  const h = runtime({ report }); h.apri();
  // 0086 g3c: la proposta del materiale intero copiata nei campi dal clic sulla proposta nella nota (D31)
  areaG(h, 'nX').onclick(); await tick();
  await q(h, '[data-veste-scheda] [data-veste-togli="0"]').click(); await tick();
  // 0086 g3d (D41): i due campi restano una bozza; il bottone del materiale li registra insieme, in una scrittura
  assert.equal(h.calls.manifest, 0);
  await premiG(h);
  assert.equal(h.calls.manifest, 1);
  const it = itemG2(h, 'mc1');
  assert.deepEqual([it.options, it.correctIndex, it.explanation], [['Le banche', 'I cantoni'], 0, 'Furono proprio le banche.']);
});

test('punto 13 (§4.6, Giacomo 05/10): le frasi che il controllo non ha verificato stanno in una sezione chiusa, col numero nel titolo, richiusa a ogni apertura della scheda', async () => {
  const report = rapporto({ coverage: { checkedIds: ['mc1', 'mc2', 'ca1'], claims: [
    { itemId: 'fc1', field: 'answer', text: 'Non prendere parte alla guerra.', status: 'missing', checked: false },
    { itemId: 'fc1', field: 'question', text: 'Neutralità', status: 'uncertain', checked: false },
    { itemId: 'op1', field: 'guide', text: 'Le banche accettarono oro.', status: 'unverified', checked: false }] } });
  const h = runtime({ report });
  // le frasi arrivano da MappAIReviewContext.incompleteMaterials, una volta: non si ricalcolano a ogni gesto
  const ctxVero = h.window.MappAIReviewContext;
  let chiamate = 0;
  h.window.MappAIReviewContext = Object.assign({}, ctxVero, { incompleteMaterials: (...a) => { chiamate++; return ctxVero.incompleteMaterials(...a); } });
  h.apri(); await vaiA(h, 'fc1');
  const sez = () => q(h, '[data-veste-scheda] [data-veste-frasi]');
  assert.ok(!!sez(), 'la sezione c’è');
  assert.equal(sez().getAttribute('open'), undefined, 'chiusa di default');
  assert.equal(sez().querySelector('summary').textContent, 'Frasi che il controllo non ha verificato (2)');
  assert.deepEqual(sez().querySelectorAll('li strong').map(x => x.textContent), ['Risposta · Il modello non ha restituito un esito', 'Domanda · Riscontro nella fonte non confermato']);
  assert.deepEqual(sez().querySelectorAll('li .mrv-coverage-text').map(x => x.textContent), ['Non prendere parte alla guerra.', 'Neutralità']);
  const dopoApertura = chiamate;
  await scrivi(h, 'answer', 'Non partecipare alla guerra.');
  assert.equal(chiamate, dopoApertura, 'un gesto non ricalcola le frasi');
  // aperta a mano, si richiude quando la scheda si riapre e quando si ricostruisce
  sez().setAttribute('open', '');
  await vaiA(h, 'op1');
  assert.equal(sez().querySelector('li strong').textContent, 'Traccia di risposta · Esito non validato');
  await vaiA(h, 'fc1');
  assert.equal(sez().getAttribute('open'), undefined, 'richiusa riaprendo la scheda');
  sez().setAttribute('open', '');
  await q(h, '#mrv-veste-escludi').click(); await tick();
  assert.equal(sez().getAttribute('open'), undefined, 'richiusa quando la scheda si ricostruisce');
  // un materiale senza frasi senza esito non ha la sezione
  await vaiA(h, 'sy1');
  assert.ok(!sez());
  // la frase passa da referenceView, come altrove (richiami a schermo col nome)
  const sy = { id: 'syR', kind: 'synthesis', title: 'Le banche', text: 'Le banche custodivano oro [[src-a1]].',
    citations: [{ id: 'src-a1', title: 'Libro.pdf', page: 4, text: 'Le banche svizzere furono accusate di aver accettato oro.' }] };
  const g = runtime({ items: [sy], report: { checkStatus: 'incomplete', coverage: { checkedIds: [], claims: [
    { itemId: 'syR', field: 'text', text: 'Le banche custodivano oro [[src-a1]].', status: 'uncertain', checked: false }] }, issues: [] } }); g.apri();
  assert.equal(q(g, '[data-veste-frasi] li .mrv-coverage-text').textContent, 'Le banche custodivano oro [Fonte 1].');
});

/* ═══ Le regole che la verifica delle mutazioni ha trovato senza test (giro 2) ═══════════════════════════════
   Portate da verifica-mutazioni-0073/_runner/killer.test.js; il nome dice la mutazione che ciascuna uccide. */
test('V01 R1: scrivere in un’alternativa non salva a battuta, l’uscita sì', async () => {
  const h = runtime({ report: senzaNotaMc1() }); h.apri(); await vaiA(h, 'mc1');   // 0086 g3d (D41): senza note del controllo
  const a = entra(alternativa(h, 0)); a.value = 'Oro fino'; a.oninput(); await tick();
  assert.equal(h.calls.manifest, 0);
  a.onblur(); await tick();
  assert.equal(h.calls.manifest, 1);
});

test('V03 R1: scrivere nel campo «Righe» non salva a battuta, l’uscita sì', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'op1');
  const n = entra(campo(h, 'lines')); n.value = '7'; n.oninput(); await tick();
  assert.equal(h.calls.manifest, 0);
  n.onblur(); await tick();
  assert.equal(h.calls.manifest, 1);
});

test('V04 testo uguale ad «adesso» a meno degli spazi: nessuna scrittura e niente nella pila di ⌘Z', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'fc1');
  await scrivi(h, 'answer', 'Non prendere parte alla guerra.  ');
  assert.equal(h.calls.manifest, 0);
  assert.equal(q(h, '#mrv-veste-annulla').disabled, true);
});

test('V09 una correzione che non si salva ({ errore }) resta nel campo e ferma la navigazione (0086 g3c: il rifiuto viene da due correzioni salvate prima che si contraddicono)', async () => {
  const { h } = conflittoFc3c(rapporto());
  await vaiA(h, 'fc1');
  await scrivi(h, 'answer', 'Restò neutrale, ma commerciò.');
  const scritte = h.calls.manifest;
  // 0086 g3d (D41): la correzione è una bozza della seduta — il cambio di riga non la salva (non c'è niente da respingere), va
  // avanti e la ritrova; la respinge il bottone del materiale, che non scrive e dice di premere Esc e poi il bottone
  await vaiA(h, 'mc2');
  assert.equal(scheda(h), 'mc2');
  await vaiA(h, 'fc1');
  assert.equal(campo(h, 'answer').value, 'Restò neutrale, ma commerciò.');
  await premiG(h);
  assert.equal(h.calls.manifest, scritte);
  assert.match(q(h, '#mrv-status').textContent, /premi Esc per lasciare il campo com’era, poi il bottone in fondo/);
  assert.equal(campo(h, 'answer').value, 'Restò neutrale, ma commerciò.', 'la bozza resta nel campo');
});

test('V14 R3 nella veste (0086 g3c): il testo a schermo che salda due parole fa «Rivisto» anche nella barra — scritto nel campo (due proposte non si compongono più: il campo ha un testo solo, D36)', async () => {
  const fc = { id: 'f9', kind: 'flashcard', question: 'Che cosa fece?', answer: 'Restò neutrale , commerciando.' };
  const report = { checkStatus: 'incomplete', coverage: { checkedIds: [] }, issues: [
    { id: 'p1', target: { kind: 'item', id: 'f9', field: 'answer' }, after: 'Restò neutrale, commerciando.', problem: 'spazio' },
    { id: 'p2', target: { kind: 'item', id: 'f9', field: 'answer' }, after: 'Restò neutrale ,commerciando.', problem: 'spazio' }] };
  const h = runtime({ items: [fc], report }); h.apri();
  await scrivi(h, 'answer', 'Restò neutrale,commerciando.', false);
  assert.equal(bottone(h).textContent, 'Rivisto');
  await premiG(h);
  assert.equal(statoRiga(h, 'f9'), 'rivisto');
});

test('V16 un nuovo clic dopo una correzione registra la nuova impronta', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'fc1');
  await scrivi(h, 'answer', 'Non partecipare alla guerra.');
  await bottone(h).click(); await tick();
  await vaiA(h, 'fc1'); await scrivi(h, 'answer', 'Non partecipare mai alla guerra.');
  assert.equal(statoRiga(h, 'fc1'), 'da-rivedere');
  await bottone(h).click(); await tick();
  assert.equal(statoRiga(h, 'fc1'), 'rivisto');
  const p = Core.previewItem(h.final(), { items: h.m.review.final.items }, 'fc1');
  assert.equal(h.final().initial.manualChecks.fc1.impronta, impronta(JSON.stringify(p.db.items.find(i => i.id === 'fc1'))));
});

test('V19 R2: il clic su «Approvato» si toglie con ⌘Z e la scheda torna su quel materiale', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'sy1');
  await bottone(h).click(); await tick();
  assert.equal(statoRiga(h, 'sy1'), 'approvato');
  assert.equal(q(h, '#mrv-veste-annulla').disabled, false);
  await q(h, '#mrv-veste-annulla').click(); await tick();
  assert.ok(!(h.final().initial.manualChecks || {}).sy1);
  assert.equal(statoRiga(h, 'sy1'), 'da-rivedere');
  assert.equal(scheda(h), 'sy1');
});

// G10: prima il bottone si fermava per non buttare la battitura non salvata; ora la scarta dicendolo, e solo il ⌘Z dopo
// tocca l'azione salvata (su un altro materiale)
test('V20 R2 dopo G10: con una battitura non salvata ⌘Z la scarta e lo dice; l’azione salvata su un altro materiale la toglie il ⌘Z dopo', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'sy1');
  await scrivi(h, 'text', 'Le banche custodivano oro tedesco.');   // 0086 g3d (D41): l'azione salvata su un materiale senza note
  await vaiA(h, 'fc1');
  await scrivi(h, 'answer', 'Testo nuovo.', false);
  await q(h, '#mrv-veste-annulla').click(); await tick();
  assert.equal(adessoG2(h, 'sy1', 'text'), 'Le banche custodivano oro tedesco.', 'l’azione salvata resta');
  assert.equal(scheda(h), 'fc1');
  assert.equal(campo(h, 'answer').value, 'Non prendere parte alla guerra.', 'la battitura è scartata');
  assert.match(q(h, '#mrv-status').textContent, /^Annullato: la modifica non salvata di «Risposta»/);
  assert.equal(h.calls.manifest, 1, 'nessuna scrittura');
  await q(h, '#mrv-veste-annulla').click(); await tick(); await tick();
  assert.equal(adessoG2(h, 'sy1', 'text'), 'Le banche custodivano oro.');
  assert.equal(scheda(h), 'sy1');
});

test('V23 R2: «Riprova il controllo» azzera la pila anche quando la revisione resta lo stesso oggetto', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'op1');
  await scrivi(h, 'guide', 'Le banche accettarono oro rubato.');   // 0086 g3d (D41): una scrittura su un materiale senza note
  assert.equal(q(h, '#mrv-veste-annulla').disabled, false);
  h.R.retryMaterialJudge = async () => {};
  await q(h, '#mrv-retry-judge').click(); await tick(); await tick();
  assert.equal(q(h, '#mrv-veste-annulla').disabled, true);
});

test('V26 Invio nudo non preme il bottone', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'sy1');
  entra(campo(h, 'text'));
  assert.equal(tasto(h, { key: 'Enter' }), false); await tick();
  assert.equal(h.calls.manifest, 0);
  assert.equal(scheda(h), 'sy1');
});

test('V27 Esc in un campo non modificato non chiude il Banco', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'fc1');
  entra(campo(h, 'answer'));
  assert.equal(tasto(h, { key: 'Escape' }), true); await tick(); await tick();
  assert.ok(h.dom.html().includes('mappai-teacher-review'));
});

test('V28 Esc in un’alternativa rimette il testo salvato senza scrivere', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc2');
  const a = entra(alternativa(h, 0)); a.value = 'Argento'; a.oninput();
  assert.equal(tasto(h, { key: 'Escape' }), true); await tick();
  assert.equal(alternativa(h, 0).value, 'Oro');
  const b = entra(alternativa(h, 0)); b.onblur(); await tick();
  assert.equal(h.calls.manifest, 0);
});

test('V29 Esc nel campo «Righe» rimette il numero salvato', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'op1');
  const n = entra(campo(h, 'lines')); n.value = '9'; n.oninput();
  assert.equal(tasto(h, { key: 'Escape' }), true); await tick();
  assert.equal(campo(h, 'lines').value, '5');
});

// una revisione approvata (o in applying) CON righe: controllo completo, una nota decisa
function approvata(applying) {
  const report = { checkStatus: 'completed', issues: [clone(NOTE[0])] }, m = finalManifest(ITEMS, report), fr = m.review.final;
  fr.review = Core.setDecision(fr.review, 'n-mc1-q', 'reject');
  const prima = Core.beginApproval(fr.review, { items: fr.items }, { sources: fr.review.sources });
  if (applying) fr.review = prima.review;
  else { fr.review = Core.completeApproval(prima.review, Core.revision({ items: fr.items }, fr.review.sources)); fr.stage = 'approved'; }
  const h = runtime({ manifest: m, report }); h.apri();
  return h;
}
test('V34 revisione in applying: sola lettura', async () => {
  const h = approvata(true);
  assert.equal(h.final().initial.status, 'applying');
  const c = campo(h, 'question');
  assert.ok(!c || c.disabled === true, 'campo spento o assente');
  assert.equal(bottone(h).hidden, true);
});

test('V35 revisione approvata con righe: i campi sono spenti', async () => {
  const h = approvata(false);
  await vaiA(h, 'mc1');
  const c = campo(h, 'question');
  assert.ok(!!c, 'la scheda c’è');
  assert.equal(c.disabled, true);
});

test('V37 revisione non più della versione del progetto (0086 g3c): le spunte delle note sono ferme e il bottone non c’è', async () => {
  const s = runtime(); s.m.review.final.items.find(i => i.id === 'fc1').answer = 'Cambiata altrove.'; s.apri(); await vaiA(s, 'mc1');
  assert.equal(spuntaG(s, 'n-mc1-q').disabled, true);
  assert.equal(bottone(s).hidden, true);
});

test('V39 un materiale escluso ha i campi in sola lettura', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'fc1');
  await q(h, '#mrv-veste-escludi').click(); await tick();
  assert.equal(statoRiga(h, 'fc1'), 'escluso');
  assert.equal(campo(h, 'answer').disabled, true);
});

test('V42 «successivo» rispetta la ricerca', async () => {
  const h = runtime(); h.apri();
  const cerca = q(h, '#mrv-search'); cerca.value = 'custod'; await cerca.oninput();
  await vaiA(h, 'mc2');
  await premiG(h);   // 0086 g3c: la spunta della nota e il visto, col bottone del materiale
  assert.equal(scheda(h), 'sy1');
});

// G10: con una battitura in sospeso ⌘Z la scarta; la regola (un cambio di forma della scheda conserva la battitura) la
// prova ora il ripristino, che con un campo sporco sullo stesso materiale va avanti
test('V43 dopo G10: ⇧⌘Z che cambia la forma della scheda conserva la battitura non salvata', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'fc1');
  await q(h, '#mrv-veste-escludi').click(); await tick();
  await q(h, '#mrv-veste-annulla').click(); await tick();
  await scrivi(h, 'answer', 'Testo in sospeso.', false);
  fuoriDalModale(h, { key: 'z', metaKey: true, shiftKey: true }); await tick(); await tick();
  assert.equal(statoRiga(h, 'fc1'), 'escluso');
  assert.equal(campo(h, 'answer').value, 'Testo in sospeso.');
});

test('R04 controllo completo: manualReview resta falso alla chiusura', async () => {
  const report = { checkStatus: 'completed', issues: [clone(NOTE[0])] };
  const h = runtime({ report }); h.apri();
  areaG(h, 'n-mc1-q').onclick(); await premiG(h);   // 0086 g3c: la proposta copiata dall'area, poi il bottone
  await q(h, '#mrv-continue').click(); await tick();
  assert.equal(h.m.review.final.stage, 'approved');
  assert.notEqual(h.final().initial.manualReview, true);
});

test('R06/R07 «completa i materiali» con un campo aperto: si salva prima e, se l’approvazione decade, non si chiude', async () => {
  const report = { checkStatus: 'completed', issues: [clone(NOTE[0])] };
  const h = runtime({ report }); h.apri();
  await premiG(h);   // 0086 g3c: la spunta della nota e il visto, col bottone del materiale
  assert.equal(q(h, '#mrv-continue').hidden, false);
  await scrivi(h, 'explanation', 'Furono proprio le banche.', false);
  await q(h, '#mrv-continue').click(); await tick(); await tick();
  assert.equal(h.m.review.final.stage, 'awaiting_review', 'non si approva un materiale appena cambiato');
  assert.equal(BancoCore.testoAdesso(null, h.final(), { db: { items: h.m.review.final.items }, bersaglio: { kind: 'item', id: 'mc1', field: 'explanation' } }).adesso, 'Furono proprio le banche.');
});

/* ═══ TERZO GIRO (05/10): difetti A–F della revisione avversaria, la decisione R7, i test minimi delle mutazioni ═══
   Ogni test dei difetti e di R7 è stato scritto PRIMA del codice che lo fa passare. */

test('difetto B: ⌘Z con il fuoco sulla tendina Macroarea (un select non è un campo in cui si scrive) è della veste, e la mappa non lo riceve', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc2');
  await scrivi(h, 'explanation', 'I depositi d’oro.');   // 0086 g3c: una scrittura nel campo (le note non hanno più gesti)
  const mappa = mappaConUndo();
  q(h, '#mrv-area').focus();
  const ev = evento(h, { key: 'z', metaKey: true }, { documento: mappa.documento }); await tick(); await tick();
  assert.equal(ev.stopped, true);
  assert.equal(adessoG2(h, 'mc2', 'explanation'), 'I depositi.', 'la veste ha tolto la sua ultima scrittura');
  assert.equal(mappa.ctx.undoStack.length, 1, 'la mappa è intatta');
});

test('R7 (difetto C): una riga entrata per un blocco (struttura non valida, anche una Scheda nodi) resta «da rivedere» fino al clic', async () => {
  const items = ITEMS.map(clone); items.find(i => i.id === 'ns1').text = '';
  const h = runtime({ items, report: { checkStatus: 'completed', issues: [] } }); h.apri();
  assert.deepEqual(qa(h, '[data-veste-riga]').map(b => b.getAttribute('data-veste-riga')), ['ns1']);
  assert.equal(riga(h, 'ns1').getAttribute('data-invalido'), 'true');
  await scrivi(h, 'text', 'Il nodo Germania e il nodo Svizzera.');
  assert.ok(!!riga(h, 'ns1'), 'sciolto il blocco, la riga resta');
  assert.equal(statoRiga(h, 'ns1'), 'da-rivedere');
  assert.equal(riga(h, 'ns1').getAttribute('data-invalido'), 'false');
  assert.equal(q(h, '#mrv-continue').hidden, true, 'senza il clic G2 non si chiude');
  await q(h, '[data-veste-filtro="tutti"]').click(); await q(h, '[data-veste-filtro="da-rivedere"]').click();
  assert.ok(!!riga(h, 'ns1'), 'nemmeno cambiando filtro: è ancora da rivedere');
  await bottone(h).click(); await tick();
  assert.equal(statoRiga(h, 'ns1'), 'rivisto');
  assert.equal(q(h, '#mrv-continue').hidden, false);
});

test('R7 (difetto C) e R9: una nota del docente aperta su un materiale verificato — decisa, la riga resta fino al clic, anche riaprendo il Banco', async () => {
  const report = { checkStatus: 'incomplete', stato: 'parziale', coverage: { expectedIds: ITEMS.filter(i => i.kind !== 'nodesheet').map(i => i.id), checkedIds: ITEMS.map(i => i.id) }, issues: [] };
  const m = finalManifest(ITEMS, report);
  m.review.final.review = Core.addIssue(m.review.final.review, { target: { kind: 'item', id: 'op1', field: 'guide' }, origin: 'teacher', blocking: true, problem: 'Modifica del docente: Traccia di risposta' });
  const h = runtime({ manifest: m, report }); h.apri();
  assert.deepEqual(qa(h, '[data-veste-riga]').map(b => b.getAttribute('data-veste-riga') + '=' + b.getAttribute('data-stato')), ['op1=da-rivedere']);
  // R10 (quinto giro): controllo parziale senza materiali residui — nessuna riga rappresenta la parte non controllata,
  // quindi la casella c'è anche con la riga di op1. Fino al quarto giro qui si chiedeva «niente casella» (R4).
  assert.ok(!!q(h, '#mrv-veste-conferma'));
  await q(h, '[data-veste-azioni-di] [data-veste-tieni]').click(); await tick();   // Q20: la nota sola, coi bottoni in fondo
  assert.equal(statoRiga(h, 'op1'), 'da-rivedere', 'R7: la nota decisa non basta');
  assert.equal(q(h, '#mrv-continue').hidden, true);
  // R9 (quarto giro): riaprendo, la riga torna dai dati — la nota decisa del docente resta nella revisione — ed è ancora
  // da rivedere. Prima di R9 la riga non tornava.
  const r = runtime({ manifest: h.m, report }); r.apri();
  assert.deepEqual(qa(r, '[data-veste-riga]').map(b => b.getAttribute('data-veste-riga') + '=' + b.getAttribute('data-stato')), ['op1=da-rivedere']);
  assert.equal(q(r, '#mrv-continue').hidden, true, 'senza il clic G2 non si chiude, nemmeno riaprendo');
  // la casella da sola non basta: la riga va cliccata
  const cr = q(r, '#mrv-veste-conferma'); cr.checked = true; cr.onchange();
  assert.equal(q(r, '#mrv-continue').hidden, true, 'casella spuntata ma riga da rivedere: G2 non si chiude');
  // nella stessa seduta, col clic e con la casella si chiude
  await bottone(h).click(); await tick();
  assert.equal(statoRiga(h, 'op1'), 'approvato');
  assert.equal(q(h, '#mrv-continue').hidden, true, 'R10: manca ancora la casella');
  const c = q(h, '#mrv-veste-conferma'); c.checked = true; c.onchange();
  assert.equal(q(h, '#mrv-continue').hidden, false);
});

/* Con R9 (quarto giro) una correzione del docente tiene la riga dai dati: lo scenario di prima (la Scheda nodi non
   valida corretta a mano) ora resta in elenco anche dopo un nuovo controllo, ed è giusto. Resta della seduta soltanto
   una riga che i dati non tengono più: qui la correzione fatta dalle occorrenze e tolta con ⌘Z. */
test('R7 (dichiarato) con R9: una riga che i dati non tengono più (la correzione del docente tolta con ⌘Z) resta nella seduta; un nuovo controllo riparte dalle righe del rapporto nuovo', async () => {
  const report = { checkStatus: 'incomplete', stato: 'parziale', coverage: { expectedIds: ITEMS.filter(i => i.kind !== 'nodesheet').map(i => i.id), checkedIds: ITEMS.map(i => i.id) }, issues: [] };
  const h = runtime({ report }); h.apri();
  assert.equal(qa(h, '[data-veste-riga]').length, 0);
  await q(h, '#mrv-occorrenze').click(); await tick();
  const query = q(h, '#mrv-occurrence-query'); query.value = 'guerra'; query.oninput();
  await q(h, '#mrv-occurrence-search').click(); await tick();
  await q(h, '[data-occurrence-item="fc1"] [data-occurrence-edit]').click(); await tick(); await tick();
  await scrivi(h, 'answer', 'Non partecipare alla guerra.');
  assert.equal(statoRiga(h, 'fc1'), 'da-rivedere');
  await q(h, '#mrv-veste-annulla').click(); await tick();
  assert.ok(!h.final().initial.issues.some(i => i.origin === 'teacher'), '⌘Z ha tolto la correzione: nei dati non resta niente');
  assert.ok(!!riga(h, 'fc1'), 'nella seduta la riga resta (R7)');
  assert.equal(statoRiga(h, 'fc1'), 'da-rivedere');
  assert.equal(q(h, '#mrv-continue').hidden, true, 'la riga della seduta ferma la chiusura');
  // (fino al quarto giro qui si chiedeva «niente casella»: con R10 la casella c'è comunque, il controllo è parziale e
  // nessun materiale residuo lo rappresenta)
  h.R.retryMaterialJudge = async () => { h.m.review.final.review = clone(h.final()); };
  await q(h, '#mrv-retry-judge').click(); await tick(); await tick();
  assert.ok(!riga(h, 'fc1'), 'dopo un nuovo controllo la riga che i dati non tengono non c’è più');
  assert.ok(!!q(h, '#mrv-veste-conferma'), 'controllo parziale e niente da cliccare: la conferma di R5');
});

test('difetto F (0086 g3c): il doppio clic e il gesto ripetuto su «Escludi» e sul bottone del materiale fanno un gesto solo', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'fc1');
  const b = q(h, '#mrv-veste-escludi');
  const p1 = b.onclick({ detail: 1 }), p2 = b.onclick({ detail: 2 }); await Promise.all([p1, p2]); await tick(); await tick();
  assert.equal(statoRiga(h, 'fc1'), 'escluso', 'il secondo clic del doppio clic non ripristina');
  assert.equal(h.calls.manifest, 1);
  const p3 = b.onclick({ detail: 1 }), p4 = b.onclick({ detail: 1 }); await Promise.all([p3, p4]); await tick(); await tick();
  assert.equal(statoRiga(h, 'fc1'), 'da-rivedere', 'due gesti insieme: ne passa uno (il ripristino)');
  assert.equal(h.calls.manifest, 2);
  // Invio tenuto premuto su un bottone: la ripetizione non diventa un altro clic
  for (const sel of ['#mrv-veste-escludi', '#mrv-veste-bottone']) {
    let fermato = false; q(h, sel).onkeydown({ key: 'Enter', repeat: true, preventDefault() { fermato = true; } });
    assert.equal(fermato, true, sel);
    let primo = false; q(h, sel).onkeydown({ key: 'Enter', preventDefault() { primo = true; } });
    assert.equal(primo, false, 'la prima pressione resta un clic: ' + sel);
  }
  // 0086 g3c: i gesti delle note non ci sono più (D36); il bottone del materiale con la spunta: il secondo clic non scrive
  await vaiA(h, 'mc2');
  const scritte = h.calls.manifest;
  await Promise.all([bottone(h).onclick({ detail: 1 }), bottone(h).onclick({ detail: 2 })]); await tick(); await tick();
  assert.equal(decisione(h, 'n-mc2-e'), 'reject');
  assert.equal(h.calls.manifest, scritte + 1);
});

// G10: prima ⌘Z si fermava; ora scarta la modifica non valida, e l'azione salvata resta
test('N45 dopo G10: con un campo appena reso non valido (non ancora uscito) ⌘Z scarta la modifica e lo dice', async () => {
  // 0086 g3d (D41): mc1 senza la nota del controllo, dove il campo si salva all'uscita (su mc2 sarebbe una bozza)
  const h = runtime({ report: senzaNotaMc1() }); h.apri(); await vaiA(h, 'mc1');
  await scrivi(h, 'explanation', 'Furono proprio le banche.');
  const a = entra(alternativa(h, 0)); a.value = ''; a.oninput();
  await q(h, '#mrv-veste-annulla').click(); await tick();
  assert.equal(adessoG2(h, 'mc1', 'explanation'), 'Furono proprio le banche.', 'la scrittura salvata resta');
  assert.equal(alternativa(h, 0).value, 'Lo Stato');
  assert.match(q(h, '#mrv-status').textContent, /^Annullato: la modifica non salvata di «Alternative»/);
});

/* ═══ I test minimi del terzo giro (verifica-mutazioni-0073/giro2/_runner/killer2.test.js) ════════════════════ */
const rapportoR5 = () => ({ checkStatus: 'incomplete', stato: 'parziale', coverage: { expectedIds: ITEMS.filter(i => i.kind !== 'nodesheet').map(i => i.id), checkedIds: ITEMS.map(i => i.id) }, issues: [] });
const conFrasi = claims => rapporto({ coverage: { checkedIds: ['mc1', 'mc2', 'ca1'], claims } });

test('N07 ⌘Z tenuto premuto toglie UNA scrittura anche con la pila lunga', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'op1');
  await scrivi(h, 'guide', 'Le banche accettarono oro rubato.');   // 0086 g3d (D41): una scrittura su un materiale senza note
  await vaiA(h, 'sy1'); await bottone(h).onclick({ detail: 1 }); await tick(); await tick();
  assert.ok(!!h.final().initial.manualChecks.sy1);
  q(h, '#mrv-veste-annulla').focus();
  tasto(h, { key: 'z', ctrlKey: true }); await tick(); await tick();
  tasto(h, { key: 'z', ctrlKey: true, repeat: true }); await tick(); await tick();
  assert.ok(!(h.final().initial.manualChecks || {}).sy1, 'la prima pressione toglie il clic');
  assert.equal(adessoG2(h, 'op1', 'guide'), 'Le banche accettarono oro rubato.', 'la ripetizione non toglie la scrittura prima');
});

test('N14 «Righe» sotto 3 non si salva', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'op1');
  const n = entra(campo(h, 'lines')); n.value = '2'; n.oninput(); n.onblur(); await tick();
  assert.equal(h.calls.manifest, 0);
  assert.match(q(h, '#mrv-status').textContent, /da 3 a 12/);
});

test('N15 una sintesi coi richiami nel registro di un’altra sezione non è «non valida»', async () => {
  const syA = { id: 'syA', kind: 'synthesis', title: 'A', text: 'Le banche custodivano oro [[src-a1]].', citations: [{ id: 'src-a1', title: 'Libro.pdf', page: 4, text: 'Le banche svizzere furono accusate di aver accettato oro.' }] };
  const syB = { id: 'syB', kind: 'synthesis', title: 'B', text: 'Le banche accettarono oro [[src-a1]].', citations: [] };
  assert.equal(Material.validate([syA, syB]).ok, true, 'insieme: valide');
  assert.equal(Material.validate([syB]).ok, false, 'da sola: richiamo fuori registro');
  const h = runtime({ items: [syA, syB], report: { checkStatus: 'incomplete', coverage: { checkedIds: [] }, issues: [] } }); h.apri();
  await vaiA(h, 'syB');
  assert.equal(riga(h, 'syB').getAttribute('data-invalido'), 'false');
  assert.equal(bottone(h).disabled, false);
});

test('N16 i problemi strutturali di un ALTRO materiale non spengono il bottone di una sintesi', async () => {
  const items = ITEMS.concat([{ id: 'mcD', kind: 'mc', question: 'Chi fu accusato?', options: ['Le banche', 'Le banche'], correctIndex: 0, explanation: 'Furono le banche.' }]);
  const h = runtime({ items }); h.apri(); await vaiA(h, 'sy1');
  assert.equal(riga(h, 'sy1').getAttribute('data-invalido'), 'false');
  assert.equal(bottone(h).disabled, false);
});

test('N21 R5: con la revisione non più della versione niente casella', async () => {
  const s = runtime({ report: rapportoR5() });
  s.m.review.final.items.find(i => i.id === 'fc1').answer = 'Cambiata altrove.';
  s.apri();
  assert.equal(qa(s, '[data-veste-riga]').length, 0);
  assert.ok(!q(s, '#mrv-veste-conferma'));
});

test('N22 R5: togliere la spunta revoca la conferma', async () => {
  const h = runtime({ report: rapportoR5() }); h.apri();
  const c = q(h, '#mrv-veste-conferma');
  c.checked = true; c.onchange();
  assert.equal(q(h, '#mrv-continue').hidden, false);
  c.checked = false; c.onchange();
  assert.equal(q(h, '#mrv-continue').hidden, true);
});

test('N38 riaperto il Banco (R.open toglie il vecchio modale), l’ascolto vecchio si toglie al primo tasto', async () => {
  const h = runtime(); h.apri(); h.apri();
  assert.equal(h.finestra.filter(l => l.cattura).length, 2);
  evento(h, { key: 'x' });
  assert.equal(h.finestra.filter(l => l.cattura).length, 1);
});

/* Con R9 (quarto giro) una correzione, anche da «Cerca altre occorrenze», fa nascere una riga e la casella sparisce:
   la casella c'è solo senza righe, quindi ⌘Z qui non ha niente da togliere. Si prova che il tasto è della veste —
   fermato (non il ⌘Z nativo di un campo) e non passato all'annulla della mappa. Prima di R9 lo si provava dopo una
   correzione dalle occorrenze, che lasciava la casella in vista. */
test('N41 col fuoco sulla casella di R5 (non è un campo in cui si scrive) ⌘Z è della veste', async () => {
  const h = runtime({ report: rapportoR5() }); h.apri();
  const box = q(h, '#mrv-veste-conferma'); assert.ok(!!box); box.focus();
  let mappa = 0;
  const ev = evento(h, { key: 'z', metaKey: true }, { documento: () => { mappa++; } }); await tick(); await tick();
  assert.equal(ev.prevented, true, 'non è il ⌘Z nativo di un campo');
  assert.equal(mappa, 0, 'l’annulla della mappa non lo riceve');
  assert.equal(h.calls.manifest, 0);
});

test('N49 dopo «Riprova il controllo» le frasi senza esito sono quelle del rapporto nuovo', async () => {
  const report = conFrasi([{ itemId: 'fc1', field: 'answer', text: 'Non prendere parte alla guerra.', status: 'missing', checked: false }]);
  const h = runtime({ report }); h.apri(); await vaiA(h, 'fc1');
  assert.ok(!!q(h, '[data-veste-scheda] [data-veste-frasi]'));
  h.R.retryMaterialJudge = async () => {
    const r = clone(h.final()); r.initial.report = conFrasi([]); h.m.review.final.review = r;
  };
  await q(h, '#mrv-retry-judge').click(); await tick(); await tick();
  await vaiA(h, 'fc1');
  assert.ok(!q(h, '[data-veste-scheda] [data-veste-frasi]'), 'il rapporto nuovo non ha frasi senza esito');
});

test('N52 con la scheda come fonte (0069) la frase incerta dice «nella scheda»', async () => {
  const report = conFrasi([{ itemId: 'fc1', field: 'question', text: 'Neutralità', status: 'uncertain', checked: false }]);
  const h = runtime({ report });
  h.window.MappAIDossierFonteCore = require('../public/js/mappai-dossier-fonte-core.js');
  h.m.review.sources = [{ type: 'scheda', pages: [{ n: 1, text: 'Neutralità: non prendere parte alla guerra.' }] }];
  h.apri(); await vaiA(h, 'fc1');
  assert.match(q(h, '[data-veste-scheda] [data-veste-frasi] li strong').textContent, /Riscontro nella scheda non confermato/);
});

// Uno stato che il giudice di oggi non produce (un rapporto «completo» che attende un materiale assente dalla bozza):
// il test resta, perché la regola (col controllo completo nessun residuo) non dipende da che cosa produce il giudice.
test('N54 col controllo completo nessuna riga «assente» dal rapporto (stato che il giudice di oggi non produce)', async () => {
  const report = { checkStatus: 'completed', coverage: { expectedIds: ITEMS.map(i => i.id).concat(['perso']), checkedIds: ITEMS.map(i => i.id) }, issues: [clone(NOTE[0])] };
  const h = runtime({ report }); h.apri();
  assert.ok(!riga(h, 'perso'));
});

// Uno stato che il giudice di oggi non produce (le sue note nascono bloccanti): una revisione approvata con una nota
// NON bloccante rimasta aperta. In sola lettura i gesti non si vedono comunque.
test('V36 revisione approvata con una nota non bloccante aperta: niente da decidere — la spunta ferma, niente bottone (0086 g3c; stato che il giudice di oggi non produce)', async () => {
  const nota = Object.assign(clone(NOTE[0]), { blocking: false });
  const report = { checkStatus: 'completed', issues: [nota] }, m = finalManifest(ITEMS, report), fr = m.review.final;
  const prima = Core.beginApproval(fr.review, { items: fr.items }, { sources: fr.review.sources });
  assert.equal(prima.ok, true, 'una nota non bloccante aperta non ferma l’approvazione');
  fr.review = Core.completeApproval(prima.review, Core.revision({ items: fr.items }, fr.review.sources)); fr.stage = 'approved';
  const h = runtime({ manifest: m, report }); h.apri(); await vaiA(h, 'mc1');
  assert.equal(scheda(h), 'mc1');
  assert.equal(spuntaG(h, 'n-mc1-q').disabled, true, '0086 g3c: la spunta è ferma');
  assert.equal(bottone(h).hidden, true);
});

/* ═══ Quarto giro dello 0073: R9 e i punti 2-6 ════════════════════════════════════════════════════════════ */
const elencoDi = h => qa(h, '[data-veste-riga]').map(b => b.getAttribute('data-veste-riga') + '=' + b.getAttribute('data-stato'));
const conflittiScelte = (h, id) => Core.previewItem(h.final(), { items: h.m.review.final.items }, id).conflicts.filter(c => c.code === 'conflicting_decisions').length;
const docente = h => h.final().initial.issues.filter(i => i.origin === 'teacher');
async function daOccorrenze(h, id, parola) {
  await q(h, '#mrv-occorrenze').click(); await tick();
  const query = q(h, '#mrv-occurrence-query'); query.value = parola; query.oninput();
  await q(h, '#mrv-occurrence-search').click(); await tick();
  await q(h, '[data-occurrence-item="' + id + '"] [data-occurrence-edit]').click(); await tick(); await tick();
}

test('R9 (punto 1): riaperto il Banco dopo «Salva e continua più tardi», il materiale con la nota del docente decisa e mai cliccato è in barra, da rivedere, e G2 non si chiude', async () => {
  const m = finalManifest(ITEMS, { checkStatus: 'completed', issues: [clone(NOTE[0])] });
  m.review.final.review = Core.addIssue(m.review.final.review, { target: { kind: 'item', id: 'op1', field: 'guide' }, origin: 'teacher', blocking: true, problem: 'Modifica del docente: Traccia di risposta' });
  const h = runtime({ manifest: m }); h.apri();
  assert.deepEqual(elencoDi(h), ['mc1=da-rivedere', 'op1=da-rivedere']);
  await vaiA(h, 'op1'); await q(h, '[data-veste-azioni-di] [data-veste-tieni]').click(); await tick();   // Q20: la nota sola, in fondo
  await vaiA(h, 'mc1'); await premiG(h);   // 0086 g3c: la spunta della nota di mc1 e il visto, col bottone del materiale
  assert.deepEqual(elencoDi(h), ['mc1=approvato', 'op1=da-rivedere']);
  await q(h, '#mrv-later').click(); await tick();
  h.apri();
  await q(h, '[data-veste-filtro="tutti"]').click();
  assert.deepEqual(elencoDi(h), ['mc1=approvato', 'op1=da-rivedere'], 'la riga torna dai dati: la nota decisa del docente è nella revisione');
  assert.equal(q(h, '#mrv-continue').hidden, true, 'senza il clic G2 non si chiude');
  await vaiA(h, 'op1'); await bottone(h).click(); await tick();
  assert.equal(statoRiga(h, 'op1'), 'approvato');
  assert.equal(q(h, '#mrv-continue').hidden, false);
});

test('R9 (punto 1): una correzione fatta da «Cerca altre occorrenze» mette il materiale in barra, da rivedere fino al clic, anche riaprendo il Banco', async () => {
  const h = runtime({ report: rapportoR5() }); h.apri();
  assert.equal(qa(h, '[data-veste-riga]').length, 0);
  await daOccorrenze(h, 'fc1', 'guerra');
  assert.equal(scheda(h), 'fc1');
  await scrivi(h, 'answer', 'Non partecipare alla guerra.');
  assert.equal(statoRiga(h, 'fc1'), 'da-rivedere');
  assert.equal(q(h, '#mrv-continue').hidden, true);
  const r = runtime({ manifest: h.m, report: rapportoR5() }); r.apri();
  assert.deepEqual(elencoDi(r), ['fc1=da-rivedere'], 'riaprendo la riga torna dai dati');
  await vaiA(r, 'fc1'); await bottone(r).click(); await tick();
  assert.equal(statoRiga(r, 'fc1'), 'rivisto');
  // R10 (quinto giro): il controllo è parziale e nessuna riga lo rappresenta, quindi la casella resta anche con la
  // riga di fc1 e serve per chiudere. Fino al quarto giro qui si chiedeva «niente casella» e la chiusura col solo clic.
  assert.ok(!!q(r, '#mrv-veste-conferma'));
  assert.equal(q(r, '#mrv-continue').hidden, true);
  const c = q(r, '#mrv-veste-conferma'); c.checked = true; c.onchange();
  assert.equal(q(r, '#mrv-continue').hidden, false);
});

const dueNote = () => [
  { id: 'nA', target: { kind: 'item', id: 'mc1', field: 'question' }, after: 'Chi venne accusato?', problem: 'Riformula.' },
  { id: 'nB', target: { kind: 'item', id: 'mc1', field: 'question' }, after: 'Chi fu accusato dagli Alleati?', problem: 'Manca il soggetto.' }];

// Quinto giro: la riga la danno le due segnalazioni decise (punto 4), non più il conflitto (che non passa da `bloccati`).
test('difetto 5 con R9: una Scheda nodi (esente) con due scelte del controllo in conflitto ha la sua riga, e la tiene dopo un nuovo controllo (mergeRetry conserva note e decisioni)', async () => {
  const issues = [
    { id: 'c1', target: { kind: 'item', id: 'ns1', field: 'text' }, after: 'Scheda del nodo Germania', problem: 'Manca il nodo.' },
    { id: 'c2', target: { kind: 'item', id: 'ns1', field: 'text' }, after: 'Scheda del nodo Svizzera', problem: 'Manca l’altro nodo.' }];
  // controllo parziale senza residui: c'è «Riprova il controllo»
  const report = Object.assign(rapportoR5(), { issues });
  const m = finalManifest(ITEMS, report), fr = m.review.final;
  fr.review = Core.setDecision(Core.setDecision(fr.review, 'c1', 'accept'), 'c2', 'accept');
  assert.ok(Core.previewItem(fr.review, { items: fr.items }, 'ns1').conflicts.some(c => c.code === 'conflicting_decisions'));
  const h = runtime({ manifest: m, report }); h.apri();
  assert.deepEqual(elencoDi(h), ['ns1=da-rivedere'], 'nessuna nota aperta, esente, niente del docente: la riga c’è (segnalazioni decise, punto 4)');
  assert.equal(q(h, '#mrv-continue').hidden, true, 'la riga da rivedere ferma la chiusura');
  /* Sesto giro, punto 3: un nuovo controllo vero passa da `mergeRetry`, che conserva segnalazioni e decisioni. Il finto
     di prima rifaceva la revisione da zero (`createReview` vuota) e documentava un caso che non può succedere. */
  h.R.retryMaterialJudge = async () => {
    const prima = h.final(), nuova = Core.createReview({ db: { items: h.m.review.final.items }, sources: prima.sources, report: rapportoR5() });
    h.m.review.final.review = Core.mergeRetry(prima, nuova);
  };
  await q(h, '#mrv-retry-judge').click(); await tick(); await tick();
  assert.ok(h.final() !== undefined && h.final().initial.issues.some(i => i.id === 'c1'), 'mergeRetry conserva le segnalazioni');
  assert.deepEqual(elencoDi(h), ['ns1=da-rivedere'], 'dopo un nuovo controllo la riga resta: le segnalazioni decise ci sono ancora');
});

// killer5.test.js dei verificatori (K-N27): `bloccati` si ricalcola dopo una scrittura
test('K-N27 bloccati ricalcolati dopo una scrittura: esclusa la sezione col registro, l’altra che lo richiamava ha la riga', async () => {
  const syA = { id: 'syA', kind: 'synthesis', title: 'A', text: 'Le banche custodivano oro [[src-a1]].', citations: [{ id: 'src-a1', title: 'Libro.pdf', page: 4, text: 'Le banche svizzere furono accusate di aver accettato oro.' }] };
  const syB = { id: 'syB', kind: 'synthesis', title: 'B', text: 'Le banche accettarono oro [[src-a1]].', citations: [] };
  const fcX = { id: 'fcX', kind: 'flashcard', question: 'Neutralità', answer: 'Non prendere parte alla guerra.' };
  assert.equal(Material.validate([syA, syB, fcX]).ok, true);
  assert.equal(Material.validate([syB, fcX]).ok, false);
  const h = runtime({ items: [syA, syB, fcX], report: { checkStatus: 'incomplete', coverage: { checkedIds: ['syB', 'fcX'] }, issues: [] } }); h.apri();
  assert.deepEqual(qa(h, '[data-veste-riga]').map(b => b.getAttribute('data-veste-riga')), ['syA']);
  await q(h, '#mrv-veste-escludi').click(); await tick();
  assert.equal(statoRiga(h, 'syA'), 'escluso');
  assert.ok(!!riga(h, 'syB'), 'senza syA la sezione B richiama un registro che non c’è più: riga');
});


test('punto 5 (R1; 0086 g3c): nell’ordine del browser (change, poi blur) i passi delle frecce in «Righe» non salvano; si salva all’uscita, e la nota resta aperta (D37.1); e al cambio di materiale', async () => {
  const report = { checkStatus: 'completed', issues: [{ id: 'nL', target: { kind: 'item', id: 'op1', field: 'lines' }, problem: 'Righe da rivedere.' }, clone(NOTE[0])] };
  const h = runtime({ report }); h.apri(); await vaiA(h, 'op1');
  assert.equal(scheda(h), 'op1');
  const n = entra(campo(h, 'lines'));
  // ↑/↓ in un campo numerico: ogni passo è un input e un change; nessuno salva (R1: mai a battuta)
  for (const v of ['6', '7', '2', '8']) { n.value = v; n.oninput(); if (n.onchange) n.onchange({}); await tick(); }
  assert.equal(h.calls.manifest, 0, 'nessun salvataggio a ogni passo');
  assert.equal(decisione(h, 'nL'), 'pending');
  assert.equal(q(h, '#mrv-status').textContent.includes('3 a 12'), false, 'un passo fuori intervallo non avvisa a metà');
  h.dom.document.body.focus();
  if (n.onchange) n.onchange({});
  n.onblur({ relatedTarget: bottone(h) }); await tick();
  // 0086 g3d (D41): con la nota del controllo sul materiale il numero è una bozza fino al bottone — l'uscita e il cambio di
  // materiale non salvano (prima: una scrittura ciascuno), la bozza torna, e il bottone la registra con la nota
  assert.equal(h.calls.manifest, 0, 'l’uscita non salva');
  assert.equal(decisione(h, 'nL'), 'pending');
  const n2 = entra(campo(h, 'lines')); n2.value = '9'; n2.oninput(); if (n2.onchange) n2.onchange({});
  await vaiA(h, 'mc1');
  assert.equal(h.calls.manifest, 0, 'il cambio di materiale non salva');
  await vaiA(h, 'op1');
  assert.equal(campo(h, 'lines').value, '9', 'la bozza torna');
  await premiG(h);
  assert.equal(h.calls.manifest, 1);
  assert.equal(itemG2(h, 'op1').lines, 9);
  assert.equal(decisione(h, 'nL'), 'reject');
});

// esplora-a-numero.test.js dei verificatori, portato: nel browser `change` arriva PRIMA di `blur` e senza relatedTarget.
// Senza un ascolto di `change` il browser non fa niente: da qui `if (n.onchange)`.
/* ═══ I test minimi del quarto giro (verifica-mutazioni-0073/giro3/_runner/killer3.test.js) ═══════════════════ */
test('T21 F: il bottone del materiale e «Escludi» partiti insieme: passa solo il primo gesto', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'op1');
  await Promise.all([bottone(h).onclick({ detail: 1 }), q(h, '#mrv-veste-escludi').onclick({ detail: 1 })]); await tick(); await tick();
  assert.ok(!!(h.final().initial.manualChecks || {}).op1, 'il primo gesto (il bottone) è passato');
  assert.notEqual(statoRiga(h, 'op1'), 'escluso', 'il secondo, partito mentre il primo era in corso, no');
  assert.equal(h.calls.manifest, 1);
});

test('T25 F: il doppio clic sul bottone ⌘Z toglie una scrittura sola', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'op1');
  await scrivi(h, 'guide', 'Le banche accettarono oro rubato.');   // 0086 g3d (D41): una scrittura su un materiale senza note
  await vaiA(h, 'sy1'); await bottone(h).onclick({ detail: 1 }); await tick(); await tick();
  const z = q(h, '#mrv-veste-annulla');
  await z.onclick({ detail: 1 }); await tick();
  await z.onclick({ detail: 2 }); await tick();
  assert.ok(!(h.final().initial.manualChecks || {}).sy1, 'il primo clic toglie il clic su sy1');
  assert.equal(adessoG2(h, 'op1', 'guide'), 'Le banche accettarono oro rubato.', 'il secondo clic del doppio clic non toglie altro');
  let fermato = false; if (z.onkeydown) z.onkeydown({ key: 'Enter', repeat: true, preventDefault() { fermato = true; } });
  assert.equal(fermato, true, 'Invio tenuto premuto sul bottone ⌘Z non ripete');
});

/* ═══ Quinto giro dello 0073: R10, R11 e i punti 2-6 ═══════════════════════════════════════════════════════ */
const rapportoConAssente = () => ({ checkStatus: 'incomplete', stato: 'parziale', coverage: { expectedIds: ITEMS.map(i => i.id).concat(['perso']), checkedIds: ITEMS.map(i => i.id) }, issues: [] });
// una correzione del docente salvata in una seduta di prima (la stessa scrittura della veste e delle occorrenze)
function correggi(r, id, field, testo) {
  const ris = BancoCore.decisioniDaCampo({ review: r, regime: 'g2', bersaglio: { kind: 'item', id, field }, salvato: testo, db: { items: ITEMS } });
  return ris.chiamate.reduce((x, c) => c.chiamata === 'addIssue' ? Core.addIssue(x, c.issue) : Core.setDecision(x, c.issueId, c.choice, c.opts), r);
}
const confDi = (h, id) => Core.previewItem(h.final(), { items: h.m.review.final.items }, id).conflicts.filter(c => c.code === 'conflicting_decisions').map(c => c.issueId + '|' + c.otherIssueId);

test('R10 (punto 1): controllo parziale con un materiale assente e una correzione in barra — la casella c’è e dice che cosa copre; G2 si chiude solo con la casella, e allora manualReview', async () => {
  const report = rapportoConAssente(), m = finalManifest(ITEMS, report);
  m.review.final.review = correggi(m.review.final.review, 'fc1', 'answer', 'Non partecipare alla guerra.');
  const h = runtime({ manifest: m, report }); h.apri(); await q(h, '[data-veste-filtro="tutti"]').click();
  assert.deepEqual(elencoDi(h), ['fc1=da-rivedere', 'perso=assente']);
  assert.ok(!!q(h, '#mrv-veste-conferma'), 'una parte scoperta senza riga: la casella c’è anche con altre righe');
  assert.match(q(h, '#mrv-next-step').textContent, /Resta 1 materiale da rivedere/);
  assert.match(q(h, '#mrv-next-step').textContent, /1 materiale che il rapporto attendeva non è nella bozza/);
  await vaiA(h, 'fc1'); await bottone(h).onclick({ detail: 1 }); await tick();
  assert.equal(statoRiga(h, 'fc1'), 'rivisto');
  assert.equal(q(h, '#mrv-continue').hidden, true, 'cliccate le righe, senza la casella G2 non si chiude');
  await q(h, '#mrv-continue').onclick(); await tick();
  assert.equal(h.m.review.final.stage, 'awaiting_review');
  const c = q(h, '#mrv-veste-conferma'); c.checked = true; c.onchange();
  assert.equal(q(h, '#mrv-continue').hidden, false);
  await q(h, '#mrv-continue').click(); await tick(); await tick();
  assert.equal(h.m.review.final.stage, 'approved');
  assert.equal(h.final().initial.manualReview, true);
});

test('R10 (punto 1): controllo parziale senza materiali residui né assenti, con una correzione in barra — la casella copre la parte non controllata; con le parti scoperte tutte in barra (R4) non c’è', async () => {
  const report = rapportoR5(), m = finalManifest(ITEMS, report);
  m.review.final.review = correggi(m.review.final.review, 'fc1', 'answer', 'Non partecipare alla guerra.');
  const h = runtime({ manifest: m, report }); h.apri();
  assert.deepEqual(elencoDi(h), ['fc1=da-rivedere']);
  assert.ok(!!q(h, '#mrv-veste-conferma'));
  assert.match(q(h, '#mrv-next-step').textContent, /nessuna riga rappresenta la parte non controllata/);
  // R4: i materiali residui sono righe, nessun assente — niente casella
  const g = runtime(); g.apri();
  assert.ok(qa(g, '[data-veste-riga]').some(b => b.getAttribute('data-veste-riga') === 'op1'));
  assert.ok(!q(g, '#mrv-veste-conferma'));
});

test('R10 (punto 1): un materiale assente chiede la casella anche quando in barra ci sono i materiali residui', async () => {
  const report = { checkStatus: 'incomplete', stato: 'parziale', coverage: { expectedIds: ITEMS.filter(i => i.kind !== 'nodesheet').map(i => i.id).concat(['perso']), checkedIds: ['mc1', 'mc2', 'ca1'] }, issues: [] };
  const h = runtime({ report }); h.apri(); await q(h, '[data-veste-filtro="tutti"]').click();
  assert.ok(elencoDi(h).includes('op1=da-rivedere'), 'i residui sono righe');
  assert.ok(elencoDi(h).includes('perso=assente'));
  assert.ok(!!q(h, '#mrv-veste-conferma'), 'l’assente non ha una riga da cliccare: la casella c’è');
  assert.match(q(h, '#mrv-next-step').textContent, /1 materiale che il rapporto attendeva non è nella bozza salvata e nessuna riga lo rappresenta/);
});

// killer4.test.js dei verificatori (K-Q14), rovesciato col punto 2: prima fotografava la ripartenza
test('punto 3: la testata conta «da rivedere» sugli stessi materiali di «generati» e nomina a parte le Schede nodi; il piede conta tutto ciò che ferma la chiusura', async () => {
  const report = { checkStatus: 'completed', issues: [] }, m = finalManifest(ITEMS, report);
  m.review.final.review = correggi(m.review.final.review, 'ns1', 'text', 'Scheda del nodo, corretta.');
  const h = runtime({ manifest: m, report }); h.apri();
  assert.deepEqual(elencoDi(h), ['ns1=da-rivedere']);
  assert.equal(q(h, '#mrv-veste-riepilogo').textContent, '6 generati · 0 verificati dal controllo · 0 da rivedere · 0 rivisti e approvati · 1 scheda dei nodi da rivedere');
  // sesto giro, punto 4: il piede nomina la scheda dei nodi (nel quinto giro qui si chiedeva «Resta 1 materiale da rivedere»)
  assert.match(q(h, '#mrv-next-step').textContent, /Resta 1 scheda dei nodi da rivedere\./);
  assert.ok(!/materiale/.test(q(h, '#mrv-next-step').textContent));
  await bottone(h).click(); await tick();
  assert.equal(q(h, '#mrv-veste-riepilogo').textContent, '6 generati · 0 verificati dal controllo · 0 da rivedere · 0 rivisti e approvati');
});

test('punto 4 (0086 g3c): una nota del controllo su una Scheda nodi, decisa in una seduta di prima e mai cliccata, è in barra da rivedere', async () => {
  const nota = { id: 'c-ns1', target: { kind: 'item', id: 'ns1', field: 'text' }, after: 'Scheda del nodo Germania.', problem: 'Manca il nodo.' };
  const report = { checkStatus: 'completed', issues: [nota] };
  // 0086 g3c: la nota decisa in una seduta di prima (nel Banco le note non hanno più gesti: le decide il bottone, col visto)
  const m = finalManifest(ITEMS, report);
  m.review.final.review = Core.setDecision(m.review.final.review, 'c-ns1', 'reject');
  const r = runtime({ manifest: m, report }); r.apri();
  assert.deepEqual(elencoDi(r), ['ns1=da-rivedere'], 'riaprendo la riga torna dai dati');
  assert.equal(q(r, '#mrv-continue').hidden, true);
  await bottone(r).click(); await tick();
  assert.equal(statoRiga(r, 'ns1'), 'approvato');
  assert.equal(q(r, '#mrv-continue').hidden, false);
});

test('punto 5 (R7, `st.entrate`): un’esclusione tolta con ⌘Z non lascia niente nei dati — la riga resta nella seduta, da rivedere fino al clic', async () => {
  const h = runtime({ report: rapportoR5() }); h.apri();
  await q(h, '[data-veste-filtro="tutti"]').click();
  await daOccorrenze(h, 'fc1', 'guerra');
  assert.equal(scheda(h), 'fc1');
  await q(h, '#mrv-veste-escludi').click(); await tick();
  assert.equal(statoRiga(h, 'fc1'), 'escluso');
  await q(h, '#mrv-veste-annulla').click(); await tick();
  assert.equal(docente(h).length, 0, '⌘Z ha tolto l’esclusione: nei dati non resta niente');
  assert.equal(statoRiga(h, 'fc1'), 'da-rivedere', 'nella seduta la riga resta');
  assert.equal(q(h, '#mrv-continue').hidden, true);
  await bottone(h).click(); await tick();
  assert.equal(statoRiga(h, 'fc1'), 'approvato');
});

test('punto 5 (`noteAperte`; 0086 g3c): la riga dice quante note restano aperte; il salvataggio del campo non le chiude (D37.1); il bottone del materiale le decide tutte e la riga smette di dirlo', async () => {
  const issues = [clone(NOTE[0]), { id: 'n-mc1-e', target: { kind: 'item', id: 'mc1', field: 'explanation' }, problem: 'Spiegazione da verificare.' }];
  const h = runtime({ report: { checkStatus: 'completed', issues } }); h.apri();
  assert.equal(riga(h, 'mc1').querySelector('.mrv-veste-note').textContent, '2 note');
  await scrivi(h, 'explanation', 'Furono proprio le banche.');
  assert.equal(riga(h, 'mc1').querySelector('.mrv-veste-note').textContent, '2 note', 'la correzione non chiude le note');
  await premiG(h);
  assert.ok(!riga(h, 'mc1').querySelector('.mrv-veste-note'));
  assert.equal(statoRiga(h, 'mc1'), 'rivisto');
});

/* ═══ Sesto giro dello 0073: i punti 1-6 ═══════════════════════════════════════════════════════════════════════ */
const idsGenerati = ITEMS.filter(i => i.kind !== 'nodesheet').map(i => i.id);
const conAssente = nome => ({ checkStatus: 'incomplete', stato: 'parziale', coverage: { expectedIds: idsGenerati.concat([nome]), checkedIds: idsGenerati }, issues: [] });
function riprovaCon(h, report) { h.R.retryMaterialJudge = async () => { const r = clone(h.final()); r.initial.report = report; h.m.review.final.review = r; }; }
// nA e nC accettate in una seduta di prima si contraddicono sulla domanda di mc1
function conflittoSalvato() {
  const issues = [
    { id: 'nA', target: { kind: 'item', id: 'mc1', field: 'question' }, after: 'Chi venne accusato?', problem: 'Riformula.' },
    { id: 'nC', target: { kind: 'item', id: 'mc1', field: 'question' }, after: 'Chi è stato accusato?', problem: 'Tempo verbale.' }];
  const m = finalManifest(ITEMS, { checkStatus: 'completed', issues });
  m.review.final.review = Core.setDecision(Core.setDecision(m.review.final.review, 'nA', 'accept'), 'nC', 'accept');
  return runtime({ manifest: m });
}

test('punto 1 (R10): «Riprova il controllo» toglie la spunta della casella e la riga di stato lo dice; senza una spunta da togliere, niente frase', async () => {
  const h = runtime({ report: conAssente('perso') }); h.apri();
  const c = q(h, '#mrv-veste-conferma'); c.checked = true; c.onchange();
  assert.equal(q(h, '#mrv-continue').hidden, false);
  riprovaCon(h, conAssente('altro'));
  await q(h, '#mrv-retry-judge').click(); await tick(); await tick();
  const dopo = q(h, '#mrv-veste-conferma');
  assert.ok(!!dopo, 'il rapporto nuovo attende un altro assente: la casella resta');
  assert.equal(dopo.checked, false, 'la spunta di prima non vale più');
  assert.equal(q(h, '#mrv-continue').hidden, true);
  assert.match(q(h, '#mrv-status').textContent, /va rimessa la spunta/);
  const g = runtime({ report: conAssente('perso') }); g.apri();
  riprovaCon(g, conAssente('altro'));
  await q(g, '#mrv-retry-judge').click(); await tick(); await tick();
  assert.doesNotMatch(q(g, '#mrv-status').textContent, /va rimessa la spunta/, 'nessuna spunta da togliere: niente frase');
});

test('punto 2 (0086 g3c, D37.7): con la pila di ⌘Z vuota, un conflitto salvato in una seduta di prima non indica ⌘Z: la riga dice che il bottone in fondo lo sostituisce; una battitura respinta dice di premere Esc e poi il bottone', async () => {
  const h = conflittoSalvato(); h.apri();
  assert.equal(q(h, '#mrv-veste-annulla').disabled, true, 'la pila è vuota');
  const avviso = q(h, '[data-veste-avvisi]').textContent;
  assert.match(avviso, /il bottone in fondo le sostituisce/);
  assert.doesNotMatch(avviso, /CTRL\+Z|⌘Z/);
  assert.doesNotMatch(q(h, '#mrv-veste-attesa').textContent, /CTRL\+Z|⌘Z/);
  assert.equal(bottone(h).disabled, false, 'il bottone sostituisce le scelte in conflitto');
  // una battitura che non si salva per il conflitto: il messaggio dice che cosa premere, non ⌘Z. 0086 g3d (D41): la battitura
  // è una bozza (l'uscita non scrive); la respinge il bottone, al clic
  const el = entra(campo(h, 'explanation')); el.value = 'Furono proprio le banche.'; el.oninput(); el.onblur(); await tick();
  assert.equal(h.calls.manifest, 0);
  await premiG(h);
  assert.equal(h.calls.manifest, 0);
  assert.match(q(h, '#mrv-status').textContent, /premi Esc per lasciare il campo com’era, poi il bottone in fondo/);
  assert.doesNotMatch(q(h, '#mrv-status').textContent, /CTRL\+Z|⌘Z/);
  // con una scrittura nella pila ⌘Z torna a essere indicato
  const g = runtime(); g.apri(); await vaiA(g, 'sy1');
  await scrivi(g, 'text', 'Le banche custodivano oro tedesco.');
  assert.equal(q(g, '#mrv-veste-annulla').disabled, false);
});

/* 0086, giro 2 bis (D30): in `conflittoSalvato` le due note in conflitto non hanno più «Tieni…» (e «Usa Proposta» l'hanno
   già scelto), quindi il gesto che scioglie il conflitto non c'è più dal mouse. I due test di R6 qui sotto provano la stessa
   regola su un conflitto che ha ancora il suo gesto: l'esclusione del materiale scelta in una seduta di prima e la proposta
   della domanda scelta (si contraddicono); «Tieni il materiale» sta fuori dalla regola dei nomi e resta. */
test('punto 4: il piede nomina le Schede nodi da rivedere; con materiali e schede le nomina entrambe', async () => {
  const report = { checkStatus: 'completed', issues: [] }, m = finalManifest(ITEMS, report);
  m.review.final.review = correggi(correggi(m.review.final.review, 'ns1', 'text', 'Scheda del nodo, corretta.'), 'fc1', 'answer', 'Non partecipare alla guerra.');
  const h = runtime({ manifest: m, report }); h.apri();
  assert.equal(q(h, '#mrv-next-step').textContent, 'Resta 1 materiale da rivedere. Resta 1 scheda dei nodi da rivedere.');
  await vaiA(h, 'fc1'); await bottone(h).click(); await tick();
  assert.equal(q(h, '#mrv-next-step').textContent, 'Resta 1 scheda dei nodi da rivedere.');
});

// esplora-sintesi-sola.test.js dei verificatori: le sintesi si validano sull'anteprima, senza le sezioni escluse
test('punto 5: esclusa la sezione col registro, l’unica sezione rimasta che lo richiama ha la riga (validata sull’anteprima, non sulla bozza)', async () => {
  const syA = { id: 'syA', kind: 'synthesis', title: 'A', text: 'Le banche custodivano oro [[src-a1]].', citations: [{ id: 'src-a1', title: 'Libro.pdf', page: 4, text: 'Le banche svizzere furono accusate di aver accettato oro.' }] };
  const syB = { id: 'syB', kind: 'synthesis', title: 'B', text: 'Le banche accettarono oro [[src-a1]].', citations: [] };
  const h = runtime({ items: [syA, syB], report: { checkStatus: 'incomplete', coverage: { checkedIds: ['syB'] }, issues: [] } }); h.apri();
  await q(h, '#mrv-veste-escludi').click(); await tick();
  const p = Core.preview(h.final(), { items: h.m.review.final.items }, { sources: h.final().sources });
  assert.equal(Material.validate(p.db.items).ok, false, 'l’anteprima che andrà all’allievo non è valida');
  assert.ok(!!riga(h, 'syB'), 'e la riga lo dice');
  assert.equal(riga(h, 'syB').getAttribute('data-invalido'), 'true');
});

test('punto 5: con più materiali la sezione che richiama un registro escluso ha il bottone spento, come ogni struttura non valida', async () => {
  const syA = { id: 'syA', kind: 'synthesis', title: 'A', text: 'Le banche custodivano oro [[src-a1]].', citations: [{ id: 'src-a1', title: 'Libro.pdf', page: 4, text: 'Le banche svizzere furono accusate di aver accettato oro.' }] };
  const syB = { id: 'syB', kind: 'synthesis', title: 'B', text: 'Le banche accettarono oro [[src-a1]].', citations: [] };
  const fcX = { id: 'fcX', kind: 'flashcard', question: 'Neutralità', answer: 'Non prendere parte alla guerra.' };
  const h = runtime({ items: [syA, syB, fcX], report: { checkStatus: 'incomplete', coverage: { checkedIds: ['syB', 'fcX'] }, issues: [] } }); h.apri();
  await q(h, '#mrv-veste-escludi').click(); await tick();
  await vaiA(h, 'syB');
  assert.equal(bottone(h).disabled, true, 'syB richiama un registro escluso: il bottone è spento');
  assert.ok(q(h, '#mrv-veste-attesa').textContent.length > 0, 'e dice perché');
  await bottone(h).onclick({ detail: 1 }); await tick();
  assert.notEqual(statoRiga(h, 'syB'), 'approvato');
  assert.equal(q(h, '#mrv-continue').hidden, true, 'G2 non si chiude col richiamo appeso');
});

test('punto 5: una sezione già in elenco si rivalida quando si esclude la sezione che porta il registro dei suoi richiami', async () => {
  const syA = { id: 'syA', kind: 'synthesis', title: 'A', text: 'Le banche custodivano oro [[src-a1]].', citations: [{ id: 'src-a1', title: 'Libro.pdf', page: 4, text: 'Le banche svizzere furono accusate di aver accettato oro.' }] };
  const syB = { id: 'syB', kind: 'synthesis', title: 'B', text: 'Le banche accettarono oro [[src-a1]].', citations: [] };
  const fcX = { id: 'fcX', kind: 'flashcard', question: 'Neutralità', answer: 'Non prendere parte alla guerra.' };
  const nota = { id: 'n-syB', target: { kind: 'item', id: 'syB', field: 'title' }, problem: 'Titolo da rivedere.' };
  // 0086 g3c: la nota di syB decisa in una seduta di prima (nel Banco la decide il bottone, insieme al visto)
  const report = { checkStatus: 'incomplete', coverage: { checkedIds: ['syB', 'fcX'] }, issues: [nota] }, m = finalManifest([syA, syB, fcX], report);
  m.review.final.review = Core.setDecision(m.review.final.review, 'n-syB', 'reject');
  const h = runtime({ items: [syA, syB, fcX], report, manifest: m }); h.apri();
  await vaiA(h, 'syB');
  assert.equal(riga(h, 'syB').getAttribute('data-invalido'), 'false', 'con syA il richiamo ha il suo registro');
  await vaiA(h, 'syA'); await q(h, '#mrv-veste-escludi').click(); await tick();
  assert.equal(riga(h, 'syB').getAttribute('data-invalido'), 'true', 'esclusa syA, syB si rivalida');
  await vaiA(h, 'syB');
  assert.equal(bottone(h).disabled, true);
});

test('punto 5: anche con una nota aperta altrove (anteprima intera non disponibile) la sezione che richiama un registro escluso ha la riga', async () => {
  const syA = { id: 'syA', kind: 'synthesis', title: 'A', text: 'Le banche custodivano oro [[src-a1]].', citations: [{ id: 'src-a1', title: 'Libro.pdf', page: 4, text: 'Le banche svizzere furono accusate di aver accettato oro.' }] };
  const syB = { id: 'syB', kind: 'synthesis', title: 'B', text: 'Le banche accettarono oro [[src-a1]].', citations: [] };
  const fcX = { id: 'fcX', kind: 'flashcard', question: 'Neutralità', answer: 'Non prendere parte alla guerra.' };
  const nota = { id: 'n-fcX', target: { kind: 'item', id: 'fcX', field: 'answer' }, problem: 'Da rivedere.' };
  const h = runtime({ items: [syA, syB, fcX], report: { checkStatus: 'incomplete', coverage: { checkedIds: ['syB', 'fcX'] }, issues: [nota] } }); h.apri();
  await vaiA(h, 'syA'); await q(h, '#mrv-veste-escludi').click(); await tick();
  assert.equal(Core.preview(h.final(), { items: h.m.review.final.items }, { sources: h.final().sources }).ok, false, 'la nota di fcX è aperta');
  assert.ok(!!riga(h, 'syB'), 'syB richiama il registro di una sezione esclusa: riga');
  assert.equal(riga(h, 'syB').getAttribute('data-invalido'), 'true');
});

test('punto 5: dopo un controllo nuovo le anteprime si rileggono (una correzione arrivata da fuori fa «Rivisto»)', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'fc1');
  assert.equal(bottone(h).textContent, 'Approvato');
  h.R.retryMaterialJudge = async () => { h.m.review.final.review = correggi(clone(h.final()), 'fc1', 'answer', 'Non partecipare alla guerra.'); };
  await q(h, '#mrv-retry-judge').click(); await tick(); await tick();
  await vaiA(h, 'fc1');
  assert.equal(bottone(h).textContent, 'Rivisto', 'l’anteprima di fc1 è quella del controllo nuovo');
});

// killer5.test.js dei verificatori (K-W07, K-W16)
test('K-W07 R10: con la casella necessaria il piede non dice «Hai rivisto tutti i materiali»', async () => {
  const h = runtime({ report: rapportoR5() }); h.apri();
  await daOccorrenze(h, 'fc1', 'guerra');
  await scrivi(h, 'answer', 'Non partecipare alla guerra.');
  assert.ok(!!riga(h, 'fc1'), 'R9: la correzione mette fc1 in barra');
  await bottone(h).click(); await tick();
  assert.equal(statoRiga(h, 'fc1'), 'rivisto');
  assert.ok(!!q(h, '#mrv-veste-conferma'), 'R10: la casella c’è');
  assert.match(q(h, '#mrv-next-step').textContent, /nessuna riga rappresenta/);
  assert.ok(!/Hai rivisto tutti i materiali/.test(q(h, '#mrv-next-step').textContent), 'il bottone non c’è finché manca la casella: la frase non lo promette');
});

test('K-W16 testata: «rivisti e approvati» conta anche gli approvati', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'sy1');
  await bottone(h).click(); await tick();
  assert.equal(statoRiga(h, 'sy1'), 'approvato');
  assert.match(q(h, '#mrv-veste-riepilogo').textContent, /· 1 rivisti e approvati/);
});

/* ═══ Settimo giro dello 0073: i punti 1-4 ════════════════════════════════════════════════════════════════════ */
const CONFLITTO_Q = [clone(NOTE[1]),
  { id: 'nA', target: { kind: 'item', id: 'mc1', field: 'question' }, after: 'Chi venne accusato?', problem: 'Riformula.' },
  { id: 'nC', target: { kind: 'item', id: 'mc1', field: 'question' }, after: 'Chi è stato accusato?', problem: 'Tempo verbale.' },
  { id: 'nE', target: { kind: 'item', id: 'mc1', field: 'explanation' }, problem: 'La spiegazione non cita la fonte.' }];
// nA e nC accettate in una seduta di prima (conflitto); mc2 ha una nota sua
function conflittoDiPrima() {
  const m = finalManifest(ITEMS, { checkStatus: 'completed', issues: CONFLITTO_Q });
  m.review.final.review = Core.setDecision(Core.setDecision(m.review.final.review, 'nA', 'accept'), 'nC', 'accept');
  return runtime({ manifest: m });
}

test('punto 2: dopo «Riprova» la riga di stato nomina la casella della veste («Ho verificato personalmente…»), non quella del Banco di oggi', async () => {
  const h = runtime({ report: conAssente('perso') }); h.apri();
  const c = q(h, '#mrv-veste-conferma'); c.checked = true; c.onchange();
  riprovaCon(h, conAssente('perso'));
  await q(h, '#mrv-retry-judge').click(); await tick(); await tick();
  assert.match(q(h, '#mrv-status').textContent, /va rimessa la spunta «Ho verificato personalmente/);
  assert.doesNotMatch(q(h, '#mrv-status').textContent, /completo io il controllo/);
});

// killer6.test.js dei verificatori (K-X05, K-X10)
test('K-X05 p1: «va rimessa la spunta» si dice una volta sola, al «Riprova» che l’ha tolta', async () => {
  const h = runtime({ report: rapportoR5() }); h.apri();
  const c = q(h, '#mrv-veste-conferma'); c.checked = true; c.onchange();
  h.R.retryMaterialJudge = async () => { h.m.review.final.review = clone(h.final()); };
  await q(h, '#mrv-retry-judge').click(); await tick(); await tick();
  assert.match(q(h, '#mrv-status').textContent, /va rimessa la spunta/);
  await q(h, '#mrv-retry-judge').click(); await tick(); await tick();
  assert.ok(!/va rimessa la spunta/.test(q(h, '#mrv-status').textContent), 'senza spunta da togliere non si dice');
});

/* ═══ Gate 3 di Giacomo in Electron (05/10): G1-G9 ═══════════════════════════════════════════════════════════
   Un tasto col fuoco FUORI dal modale (body, o un'altra finestra), come nel browser: la cattura su window (la
   veste), la cattura del documento (una console sotto il Banco), la bolla sul documento (mappai-undo.js). Il modale
   non riceve l'evento: non è un antenato del fuoco. */
function fuoriDalModale(h, e, fasi = {}, fuoco) {
  (fuoco || h.dom.document.body).focus();
  const ev = Object.assign({ prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }, e);
  for (const l of h.finestra.filter(x => x.k === 'keydown' && x.cattura).slice()) { l.fn(ev); if (ev.stopped) return ev; }
  if (fasi.console) { fasi.console(ev); if (ev.stopped) return ev; }
  if (fasi.documento) fasi.documento(ev);
  return ev;
}
const CMD_Z = { key: 'z', metaKey: true }, CMD_SHIFT_Z = { key: 'z', metaKey: true, shiftKey: true };

test('G1: ⌘Z col fuoco su body è della veste — toglie la sua ultima scrittura e la pila della mappa (mappai-undo.js vero) resta intatta; ⇧⌘Z, Ctrl+Shift+Z e Ctrl+Y non arrivano mai alla mappa', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc2');
  await scrivi(h, 'explanation', 'I depositi d’oro.');   // 0086 g3c: una scrittura nel campo (le note non hanno più gesti)
  const mappa = mappaConUndo();
  const ev = fuoriDalModale(h, CMD_Z, { documento: mappa.documento }); await tick(); await tick();
  assert.equal(ev.prevented, true); assert.equal(ev.stopped, true);
  assert.equal(adessoG2(h, 'mc2', 'explanation'), 'I depositi.', 'la scrittura della veste è annullata');
  assert.equal(mappa.ctx.undoStack.length, 1, 'la pila della mappa è intatta');
  assert.equal(mappa.ctx.appState.db.nodes.length, 0, 'la mappa non è tornata indietro');
  for (const e of [CMD_SHIFT_Z, { key: 'Z', ctrlKey: true, shiftKey: true }, { key: 'y', ctrlKey: true }, CMD_Z]) {
    const x = fuoriDalModale(h, e, { documento: mappa.documento }); await tick(); await tick();
    assert.equal(x.stopped, true, JSON.stringify(e));
  }
  assert.equal(mappa.ctx.undoStack.length, 1);
});

test('G1: restano nativi ⌘Z e ⇧⌘Z in un campo della veste con battitura non salvata e nella ricerca; con un’altra finestra sopra il Banco non sono della veste', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'fc1');
  await scrivi(h, 'answer', 'Non partecipare alla guerra.');
  const el = entra(campo(h, 'answer')); el.value = 'Non partecipare alla guerra mondiale.'; el.oninput();
  for (const e of [CMD_Z, CMD_SHIFT_Z]) { const x = evento(h, e); assert.equal(x.prevented, false, JSON.stringify(e)); assert.equal(x.stopped, false); }
  tasto(h, { key: 'Escape' });
  const cerca = q(h, '#mrv-search'); cerca.focus();
  for (const e of [CMD_Z, CMD_SHIFT_Z]) { const x = evento(h, e); assert.equal(x.prevented, false, 'ricerca'); assert.equal(x.stopped, false); }
  // un'altra finestra sopra il Banco (il fuoco sta in lei): il tasto è suo
  const altra = h.dom.document.createElement('div'), b = h.dom.document.createElement('button');
  h.dom.document.body.appendChild(altra); altra.appendChild(b);
  const scritte = h.calls.manifest;
  const x = fuoriDalModale(h, CMD_Z, {}, b); await tick();
  assert.equal(x.stopped, false); assert.equal(x.prevented, false);
  assert.equal(h.calls.manifest, scritte, 'la veste non ha annullato niente');
});

test('G7/G8: Cmd/Ctrl+Invio e Alt+↑/↓ nella veste non fanno niente — nessuna scrittura, nessun cambio di scheda — e non arrivano alla mappa né alla console', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'op1');
  let console = 0, documento = 0;
  const fasi = { console: () => { console++; }, documento: () => { documento++; } };
  for (const e of [{ key: 'Enter', metaKey: true }, { key: 'Enter', ctrlKey: true }, { key: 'ArrowDown', altKey: true }, { key: 'ArrowUp', altKey: true }]) {
    assert.equal(fuoriDalModale(h, e, fasi).stopped, true, 'su body: ' + JSON.stringify(e));
    entra(campo(h, 'guide')); assert.equal(evento(h, e, fasi).stopped, true, 'nel campo: ' + JSON.stringify(e));
    bottone(h).focus(); assert.equal(evento(h, e, fasi).stopped, true, 'sul bottone: ' + JSON.stringify(e));
    await tick(); await tick();
  }
  assert.equal(h.calls.manifest, 0, 'nessuna scrittura');
  assert.equal(scheda(h), 'op1', 'nessun cambio di scheda');
  assert.deepEqual(Object.keys(h.final().initial.manualChecks || {}), []);
  assert.equal(console, 0); assert.equal(documento, 0);
  // Invio e le frecce senza modificatori non sono della veste: passano
  for (const e of [{ key: 'Enter' }, { key: 'ArrowDown' }]) assert.equal(fuoriDalModale(h, e, fasi).stopped, false, JSON.stringify(e));
  assert.equal(console, 2); assert.equal(documento, 2);
});

test('G2: aprire la veste (e un materiale, entrando e uscendo da un campo) non scrive pipeline.json', async () => {
  const h = runtime(); h.apri(); await tick(); await tick();
  assert.equal(h.calls.manifest, 0);
  await vaiA(h, 'fc1'); const el = entra(campo(h, 'answer')); el.onblur(); await tick();
  assert.equal(h.calls.manifest, 0);
});

function scelteSenzaCorretta() {
  const items = ITEMS.map(clone); items.find(i => i.id === 'mc1').correctIndex = -1;
  const nota = { id: 'n-ci', target: { kind: 'item', id: 'mc1', field: 'correctIndex' }, problem: 'La chiave non identifica una delle alternative.' };
  const h = runtime({ items, report: { checkStatus: 'completed', issues: [nota] } }); h.apri();
  return h;
}
test('G2 (0086 g3c, D37.1): scelta multipla senza risposta corretta — il pallino salva solo la corretta, mai una «correzione» identica delle alternative, e la nota resta aperta; ⌘Z col fuoco su body la toglie tutta', async () => {
  const h = scelteSenzaCorretta(); await vaiA(h, 'mc1');
  const radio = q(h, '[data-veste-scheda] [data-veste-corretta="1"]'); radio.checked = true; await radio.onchange(); await tick();
  // 0086 g3d (D41): con la nota del controllo il pallino è una bozza; il bottone del materiale la registra con la nota
  assert.equal(h.calls.manifest, 0, 'il pallino non scrive');
  assert.equal(decisione(h, 'n-ci'), 'pending');
  await premiG(h);
  assert.equal(h.calls.manifest, 1);
  assert.deepEqual(docente(h).map(i => i.target.field), ['correctIndex'], 'nessuna correzione delle alternative');
  assert.equal(adessoG2(h, 'mc1', 'correctIndex'), 1);
  const mappa = mappaConUndo();
  fuoriDalModale(h, CMD_Z, { documento: mappa.documento }); await tick(); await tick();
  assert.deepEqual(docente(h), [], '⌘Z toglie la correzione');
  assert.equal(decisione(h, 'n-ci'), 'pending', 'e riapre la nota');
  assert.equal(h.calls.manifest, 2);
  assert.equal(mappa.ctx.undoStack.length, 1);
});

test('G2 (b): una scrittura con più chiamate (alternativa cambiata e pallino nello stesso salvataggio) è una voce sola: un ⌘Z le toglie tutte', async () => {
  const h = runtime({ report: senzaNotaMc1() }); h.apri(); await vaiA(h, 'mc1');   // 0086 g3d (D41): mc1 senza note
  const a = entra(alternativa(h, 0)); a.value = 'Lo Stato federale'; a.oninput();
  const radio = q(h, '[data-veste-scheda] [data-veste-corretta="2"]'); radio.checked = true; await radio.onchange(); await tick();
  assert.equal(h.calls.manifest, 1, 'una scrittura');
  assert.deepEqual(docente(h).map(i => i.target.field).sort(), ['correctIndex', 'options']);
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.deepEqual(docente(h), [], 'un ⌘Z toglie le due correzioni');
  assert.equal(Object.keys(h.final().initial.decisions).length, 0);
});

/* 0074, F3 (Giacomo, 06/10: «Sì, anche a veste spenta»): la regola di G3 vale anche senza `.mrv-veste`. Prima dello 0074
   questo test chiedeva la regola sotto la veste e il Banco di oggi invariato; ora la chiede senza la veste. */
test('G3 e G4: la fila dei bottoni della Fonte va a capo nella sua colonna (dallo 0074, F3, anche a veste spenta); il bottone principale spento ha l’aspetto del ⌘Z spento', () => {
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8');
  const regola = sel => { const k = css.indexOf(sel + ' {'); return k < 0 ? null : css.slice(k + sel.length + 2, css.indexOf('}', k)); };
  const tutte = sel => { const out = []; let k = -1; while ((k = css.indexOf(sel + ' {', k + 1)) >= 0) out.push(css.slice(k + sel.length + 2, css.indexOf('}', k))); return out; };
  const prove = tutte('\n#mappai-teacher-review .mrv-fonte-prove').find(r => /flex-wrap/.test(r));
  assert.ok(!!prove, 'la regola c’è, senza .mrv-veste');
  assert.match(prove, /flex-wrap:\s*wrap/); assert.match(prove, /min-width:\s*0/); assert.match(prove, /max-width:\s*100%/);
  assert.equal(regola('#mappai-teacher-review.mrv-veste .mrv-fonte-prove'), null, 'non più una regola della sola veste');
  assert.equal(regola('#mappai-teacher-review .mrv-fonte-prove'), ' display: flex; align-items: center; gap: 4px; flex: 0 0 auto; margin-left: auto; ', 'la regola di partenza della fila resta quella');
  const spento = regola('#mappai-teacher-review.mrv-veste .mrv-veste-azioni .pm-btn-primary:disabled');
  assert.ok(spento !== null);
  assert.doesNotMatch(spento, /opacity/, 'prende l’opacità dei bottoni spenti, come ⌘Z');
  assert.match(spento, /background:\s*#fff/); assert.match(spento, /border-color:\s*var\(--mm-bordo/); assert.match(spento, /color:\s*var\(--mm-testo-2/);
  assert.match(css, /#mappai-teacher-review button:disabled \{ opacity: \.45;/, 'il ⌘Z spento: opacità .45');
});

test('G5: «Rivisto» sull’ultima riga riporta alla prima ancora da rivedere più su; finite le righe ci si ferma e il piede lo dice', async () => {
  const report = { checkStatus: 'incomplete', stato: 'parziale', coverage: { expectedIds: idsGenerati, checkedIds: [] }, issues: [] };
  const h = runtime({ report }); h.apri();
  const ordine = qa(h, '[data-veste-riga]').map(b => b.getAttribute('data-veste-riga'));
  const ultima = ordine[ordine.length - 1];
  await vaiA(h, ultima); await bottone(h).onclick({ detail: 1 }); await tick(); await tick();
  assert.equal(scheda(h), ordine[0], 'dall’ultima si torna alla prima da rivedere');
  for (let k = 0; k < ordine.length - 1; k++) { await bottone(h).onclick({ detail: 1 }); await tick(); await tick(); }
  assert.ok(qa(h, '[data-veste-riga]').length === 0 || ordine.every(id => statoRiga(h, id) !== 'da-rivedere'));
  assert.match(q(h, '#mrv-next-step').textContent, /Hai rivisto tutti i materiali/);
});

test('G6 (a) e (b) (0086 g3c): ⌘Z riapre il materiale dell’azione annullata, lo seleziona in barra, evidenzia il campo toccato e dice che cosa ha annullato; l’evidenza si toglie al gesto dopo', async () => {
  const h = runtime({ report: senzaNotaMc1() }); h.apri(); await vaiA(h, 'mc1');   // 0086 g3d (D41): mc1 senza note, dove il campo si salva all'uscita
  await scrivi(h, 'explanation', 'Furono proprio le banche.');
  await vaiA(h, 'fc1');
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(scheda(h), 'mc1', 'la scheda del materiale annullato');
  assert.equal(riga(h, 'mc1').getAttribute('aria-current'), 'true', 'selezionato in barra');
  assert.ok(q(h, '[data-veste-scheda] [data-veste-campo="explanation"]').classList.contains('mrv-veste-evidenza'), 'il campo toccato è evidenziato');
  assert.match(q(h, '#mrv-status').textContent, /^Annullato: la correzione di «Spiegazione» su \d+ · Scelta multipla\.$/);
  await scrivi(h, 'explanation', 'I depositi della banca.');
  assert.ok(!qa(h, '.mrv-veste-evidenza').length, 'al gesto dopo l’evidenza si toglie');
});

test('G6 (b): le frasi dicono per esteso il bottone, la correzione di un campo e l’esclusione, col materiale', async () => {
  const report = { checkStatus: 'incomplete', stato: 'parziale', coverage: { expectedIds: idsGenerati, checkedIds: [] }, issues: [] };
  const h = runtime({ report }); h.apri(); await vaiA(h, 'sy1');
  const n = riga(h, 'sy1').querySelector('.mrv-veste-num').textContent;
  await bottone(h).onclick({ detail: 1 }); await tick(); await tick();
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(q(h, '#mrv-status').textContent, 'Annullato: «Approvato» su ' + n + ' · Sintesi.');
  assert.equal(scheda(h), 'sy1');
  await vaiA(h, 'fc1');
  const m = riga(h, 'fc1').querySelector('.mrv-veste-num').textContent;
  await scrivi(h, 'answer', 'Non partecipare alla guerra.');
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(q(h, '#mrv-status').textContent, 'Annullato: la correzione di «Risposta» su ' + m + ' · Flashcard.');
  assert.ok(q(h, '[data-veste-scheda] [data-veste-campo="answer"]').classList.contains('mrv-veste-evidenza'), 'il campo toccato è evidenziato');
  await q(h, '#mrv-veste-escludi').click(); await tick();
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(q(h, '#mrv-status').textContent, 'Annullato: l’esclusione di ' + m + ' · Flashcard.');
  await q(h, '#mrv-veste-escludi').click(); await tick();
  await q(h, '#mrv-veste-escludi').click(); await tick();   // «Ripristina»
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(q(h, '#mrv-status').textContent, 'Annullato: il ripristino di ' + m + ' · Flashcard.');
});

test('G6 (c): ⇧⌘Z, Ctrl+Shift+Z e Ctrl+Y rifanno l’ultima azione annullata, portano sul materiale e lo dicono; la pila del ripristino si svuota alla prima scrittura nuova e a «Riprova il controllo»; in un campo con battitura non salvata ⇧⌘Z resta nativo', async () => {
  const h = runtime({ report: senzaNotaMc1() }); h.apri(); await vaiA(h, 'mc1');
  await scrivi(h, 'explanation', 'Furono proprio le banche.');   // 0086 g3d (D41): su mc1 senza note, dove il campo si salva all'uscita
  await vaiA(h, 'fc1');
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(adessoG2(h, 'mc1', 'explanation'), 'Furono le banche.');
  await vaiA(h, 'fc1');
  fuoriDalModale(h, CMD_SHIFT_Z); await tick(); await tick();
  assert.equal(adessoG2(h, 'mc1', 'explanation'), 'Furono proprio le banche.', 'rifatta');
  assert.equal(scheda(h), 'mc1', 'portato sul materiale');
  assert.match(q(h, '#mrv-status').textContent, /^Ripristinato: la correzione di «Spiegazione» su \d+ · Scelta multipla\.$/);
  await vaiA(h, 'fc1');
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(adessoG2(h, 'mc1', 'explanation'), 'Furono le banche.', 'anche il ripristino si annulla');
  assert.equal(scheda(h), 'mc1', 'e il suo ⌘Z riporta sul materiale del ripristino');
  fuoriDalModale(h, { key: 'y', ctrlKey: true }); await tick(); await tick();
  assert.equal(adessoG2(h, 'mc1', 'explanation'), 'Furono proprio le banche.', 'Ctrl+Y (Windows, Linux)');
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  fuoriDalModale(h, { key: 'Z', ctrlKey: true, shiftKey: true }); await tick(); await tick();
  assert.equal(adessoG2(h, 'mc1', 'explanation'), 'Furono proprio le banche.', 'Ctrl+Shift+Z');
  // più livelli: due ⌘Z, poi due ⇧⌘Z rifanno tutte e due le azioni, nell'ordine
  await vaiA(h, 'fc1'); await scrivi(h, 'answer', 'Non partecipare alla guerra.');
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.deepEqual([adessoG2(h, 'mc1', 'explanation'), docente(h).length], ['Furono le banche.', 0]);
  fuoriDalModale(h, CMD_SHIFT_Z); await tick(); await tick();
  fuoriDalModale(h, CMD_SHIFT_Z); await tick(); await tick();
  assert.deepEqual([adessoG2(h, 'mc1', 'explanation'), docente(h).length], ['Furono proprio le banche.', 2], 'tutte e due rifatte');
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  // una scrittura nuova svuota la pila del ripristino
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  await vaiA(h, 'fc1'); await scrivi(h, 'answer', 'Non partecipare alla guerra.');
  const scritte = h.calls.manifest;
  fuoriDalModale(h, CMD_SHIFT_Z); await tick(); await tick();
  assert.equal(h.calls.manifest, scritte, 'niente da ripristinare');
  assert.equal(adessoG2(h, 'mc1', 'explanation'), 'Furono le banche.');
  // dentro un campo con battitura non salvata ⇧⌘Z è del campo
  const el = entra(campo(h, 'answer')); el.value = 'Altro testo'; el.oninput();
  const x = evento(h, CMD_SHIFT_Z); assert.equal(x.prevented, false); assert.equal(x.stopped, false);
  tasto(h, { key: 'Escape' });
  // «Riprova il controllo» svuota anche la pila del ripristino
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  h.R.retryMaterialJudge = async () => { h.m.review.final.review = clone(h.final()); };
  await q(h, '#mrv-retry-judge').click(); await tick(); await tick();
  const dopo = h.calls.manifest;
  fuoriDalModale(h, CMD_SHIFT_Z); await tick(); await tick();
  assert.equal(h.calls.manifest, dopo, 'dopo «Riprova» non si ripristina niente');
});

test('G9: un richiamo alla scheda rotto — la riga di stato in grassetto e, nel campo, il nome rotto segnato in rosso nello strato dietro l’area di testo; tornato giusto, tutto sparisce', async () => {
  const report = { checkStatus: 'incomplete', stato: 'parziale', coverage: { expectedIds: idsGenerati, checkedIds: idsGenerati.filter(id => id !== 'sy1') }, issues: [] };
  const h = runtime({ report });
  h.window.MappAIDossierFonteCore = require('../public/js/mappai-dossier-fonte-core.js');
  h.m.review.sources = [{ type: 'scheda', pages: [{ n: 1, text: 'Che cosa si vede: le banche.' }] }];
  h.apri(); await vaiA(h, 'sy1');
  const el = entra(campo(h, 'text')); el.value = 'Le banche custodivano oro [Che cosa si vedi].'; el.oninput();
  assert.ok(!!q(h, '#mrv-status strong'), 'la riga di stato in grassetto');
  assert.match(q(h, '#mrv-status strong').textContent, /\[Che cosa si vedi\] non è più un richiamo alla scheda/);
  const rotto = () => q(h, '[data-veste-scheda] [data-veste-campo="text"] [data-veste-sfondo] .mrv-veste-rotto');
  assert.ok(!!rotto(), 'il nome rotto è segnato nello strato dietro');
  assert.equal(rotto().textContent, '[Che cosa si vedi]');
  assert.equal(q(h, '[data-veste-scheda] [data-veste-campo="text"] [data-veste-sfondo]').textContent, el.value, 'lo strato ha lo stesso testo, carattere per carattere');
  el.value = 'Le banche custodivano oro.'; el.oninput();
  assert.ok(!rotto(), 'tornato giusto, il segno sparisce');
  assert.ok(!q(h, '#mrv-status strong'));
  // il rosso: ≥ 4,5:1 col testo del campo
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8');
  assert.match(css, /\.mrv-veste-sfondo \.mrv-veste-rotto \{[^}]*background: var\(--mrv-veste-tolto-fondo\)/);
  // senza la scheda come fonte niente segno
  const g = runtime({ report }); g.apri(); await vaiA(g, 'sy1');
  const e2 = entra(campo(g, 'text')); e2.value = 'Le banche custodivano oro [Che cosa si vedi].'; e2.oninput();
  assert.ok(!q(g, '[data-veste-scheda] [data-veste-sfondo] .mrv-veste-rotto'));
});

/* ═══ Ritocco prima del gate breve ═══════════════════════════════════════════════════════════════════════════ */
// la sintesi di un dossier da foto (0069), coi richiami alla scheda: revisione-0073/giro-gate/g9-rotto.js
// `prima(h)` (0074) gira prima dell'apertura: per esempio una Fonte finta che conta zero passi; `opzioni` vanno a `runtime`
function dossierConSintesi(altri = [], prima, opzioni = {}) {
  const DF = require('../public/js/mappai-dossier-fonte-core.js');
  const scheda = { titolo: 'Manifesto', nomeFile: 'm.jpg', fotoB64: 'AAAA', mime: 'image/jpeg',
    identita: { genere: 'Manifesto elettorale', titolo: 'Deutschland wählt', autore: 'CDU', data: '1949', luogo: 'Germania', tecnica: 'Litografia' },
    osservazione: { descrizione: 'Un uomo anziano guarda verso destra.', testo: 'Wählt CDU!', iconografia: 'Rovine', linguaggioVisivo: 'Contrasto', tipografia: 'Bastoni' },
    interpretazione: { corrente: '', committente: 'Il partito CDU', destinatario: 'Gli elettori', finalita: 'Convincere', strategie: 'Contrapporre', diffusione: '' },
    critica: { prova: 'La propaganda', tace: 'Non mostra le altre forze' } };
  const sources = DF.fontiDaScheda(scheda);
  const cit = sources.map((p, i) => ({ id: 'src-n' + i, idx: i + 1, docId: p.id, title: p.title, page: 0, source: 'fonte', text: p.pages[0].text }));
  const items = [{ id: 'syS', kind: 'synthesis', title: 'Il manifesto', text: 'Il manifesto mostra rovine [1] e chiede il voto [2].', citations: cit }].concat(altri);
  const report = { checkStatus: 'incomplete', coverage: { checkedIds: [] }, issues: [] };
  const r0 = Core.createReview({ db: DB, sources, report: { checkStatus: 'completed', issues: [] } });
  const first = Core.beginApproval(r0, DB), m = Pipeline.createManifest({}, { vaultPath: '/vault' });
  m.steps.A.status = 'done'; m.review = Core.completeApproval(first.review, first.revision);
  m.review.final = { stage: 'awaiting_review', items: clone(items), review: Core.createReview({ db: { items }, sources, report }) };
  const h = runtime(Object.assign({ manifest: m }, opzioni)); h.window.MappAIDossierFonteCore = DF;
  if (prima) prima(h);
  h.apri();
  return h;
}
test('ritocco, G9: il nome ritoccato a cavallo fra parte uguale e parte aggiunta è segnato in rosso per intero, e lo strato resta il testo del campo', async () => {
  for (const [nome, vecchio, nuovo] of [['una lettera in più', "[Carta d'identità]", "[Carta d'identitàx]"],
    ['una parola in più', "[Carta d'identità]", "[Carta d'identità X]"],
    ['un nome nuovo intero', 'e chiede il voto', 'e [Che cosa si vedi] chiede il voto'],
    ['lo stesso nome rotto due volte', 'e chiede il voto', 'e [Che cosa si vedi] chiede il voto [Che cosa si vedi]']]) {
    const h = dossierConSintesi();
    const el = entra(campo(h, 'text'));
    assert.ok(el.value.includes(vecchio), nome + ': il campo mostra i nomi dei richiami');
    el.value = el.value.replace(vecchio, nuovo); el.oninput();
    const rotto = nuovo.match(/\[[^\]]+\]/g).join('');
    assert.ok(!!q(h, '#mrv-status strong'), nome + ': la riga di stato in grassetto');
    const sfondo = q(h, '[data-veste-campo="text"] [data-veste-sfondo]');
    assert.equal(sfondo.querySelectorAll('.mrv-veste-rotto').map(x => x.textContent).join(''), rotto, nome + ': il rosso copre tutto il nome, ogni volta che compare');
    assert.equal(sfondo.textContent.replace(/\n$/, ''), el.value, nome + ': lo strato è il testo del campo, carattere per carattere');
  }
});

test('ritocco, punto doppio (0086 g3c): dopo una descrizione che finisce già con un segno di fine frase la cornice non aggiunge il punto; altrimenti sì — sul gesto della richiesta del docente, che ha ancora i suoi bottoni in fondo', async () => {
  const h = runtime3([], { prima: r => Core.addIssue(r, { target: { kind: 'node', id: 'M', field: 'desc' }, origin: 'teacher', blocking: true, problem: 'Rivedi la frase sulla memoria.' }) }); h.apri3();
  assert.equal(scheda(h), 'M');
  await clicInFondo(h, 'tieni');
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(q(h, '#mrv-status').textContent, 'Annullato: la tua scelta sulla nota «Rivedi la frase sulla memoria.»');
  fuoriDalModale(h, CMD_SHIFT_Z); await tick(); await tick();
  assert.equal(q(h, '#mrv-status').textContent, 'Ripristinato: la tua scelta sulla nota «Rivedi la frase sulla memoria.»');
  await scrivi(h, 'desc', 'Il resto è storia antica.');
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.match(q(h, '#mrv-status').textContent, /su Memoria\.$/, 'senza segno finale la cornice mette il punto');
});

test('N03 (secondo test): ⇧⌘Z tenuto premuto rifà una sola azione', async () => {
  const h = runtime({ report: senzaNotaMc1() }); h.apri(); await vaiA(h, 'mc1');
  await scrivi(h, 'explanation', 'Furono proprio le banche.');   // 0086 g3d (D41): mc1 senza note, dove il campo si salva all'uscita
  await vaiA(h, 'fc1'); await scrivi(h, 'answer', 'Non partecipare alla guerra.');
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.deepEqual([adessoG2(h, 'mc1', 'explanation'), adessoG2(h, 'fc1', 'answer')], ['Furono le banche.', 'Non prendere parte alla guerra.']);
  fuoriDalModale(h, CMD_SHIFT_Z); await tick(); await tick();
  for (let k = 0; k < 3; k++) { fuoriDalModale(h, Object.assign({ repeat: true }, CMD_SHIFT_Z)); await tick(); await tick(); }
  assert.deepEqual([adessoG2(h, 'mc1', 'explanation'), adessoG2(h, 'fc1', 'answer')], ['Furono proprio le banche.', 'Non prendere parte alla guerra.'], 'chi tiene premuto rifà una sola azione');
});

// killerG.test.js dei verificatori (K-G05, K-G14, K-G26, K-G28, K-G29, K-G36/G37)
test('K-G05 G7/G8: Cmd+Invio e Alt+↑/↓ in un campo si fermano ma senza preventDefault (il campo tiene il suo comportamento)', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'fc1');
  const el = entra(campo(h, 'answer'));
  for (const e of [{ key: 'Enter', metaKey: true }, { key: 'ArrowDown', altKey: true }, { key: 'ArrowUp', altKey: true }]) {
    const ev = fuoriDalModale(h, e, {}, el);
    assert.equal(ev.stopped, true, JSON.stringify(e));
    assert.equal(ev.prevented, false, 'niente preventDefault: ' + JSON.stringify(e));
  }
});

test('K-G14 G6/G2b: togliere un’alternativa (con la corretta che si sposta) si annulla come «la correzione di «Alternative»»', async () => {
  const h = runtime({ report: senzaNotaMc1() }); h.apri(); await vaiA(h, 'mc1');   // 0086 g3d (D41): mc1 senza note, dove il campo si salva all'uscita
  await q(h, '[data-veste-scheda] [data-veste-togli="0"]').click(); await tick();
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.match(q(h, '#mrv-status').textContent, /^Annullato: la correzione di «Alternative» su /);
});

test('K-G26 G6 (0086 g3c): una nota lunga si accorcia nella frase di ⌘Z — sulla richiesta del docente, che ha ancora i suoi bottoni', async () => {
  const lunga = 'Rivedi la descrizione: confonde le banche svizzere con quelle tedesche, che sono un’altra cosa del tutto e vanno distinte.';
  assert.ok(lunga.length > 80);
  const h = runtime3([], { prima: r => Core.addIssue(r, { target: { kind: 'node', id: 'M', field: 'desc' }, origin: 'teacher', blocking: true, problem: lunga }) }); h.apri3();
  await clicInFondo(h, 'tieni');
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  const s = q(h, '#mrv-status').textContent;
  assert.match(s, /^Annullato: la tua scelta sulla nota «/);
  assert.ok(s.includes('…') && !s.includes(lunga), 'la nota è accorciata: ' + s);
});

test('K-G28 G6: il ripristino che riguarda un altro materiale non butta la battitura non salvata', async () => {
  const h = runtime({ report: senzaNotaMc1() }); h.apri(); await vaiA(h, 'mc1');
  await scrivi(h, 'explanation', 'Furono proprio le banche.');   // 0086 g3d (D41): mc1 senza note, dove il campo si salva all'uscita
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  await vaiA(h, 'fc1');
  await scrivi(h, 'answer', 'Testo nuovo.', false);
  fuoriDalModale(h, CMD_SHIFT_Z); await tick(); await tick();
  assert.equal(adessoG2(h, 'mc1', 'explanation'), 'Furono le banche.', 'non rifatto');
  assert.equal(scheda(h), 'fc1');
  assert.equal(campo(h, 'answer').value, 'Testo nuovo.');
});

test('K-G29 G6: con un campo non valido il ripristino si ferma e lo dice', async () => {
  const h = runtime({ report: senzaNotaMc1() }); h.apri(); await vaiA(h, 'mc1');
  await scrivi(h, 'explanation', 'Furono proprio le banche.');   // 0086 g3d (D41): mc1 senza note, dove il campo si salva all'uscita
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  const a = entra(alternativa(h, 0)); a.value = ''; a.oninput();
  fuoriDalModale(h, CMD_SHIFT_Z); await tick(); await tick();
  assert.equal(adessoG2(h, 'mc1', 'explanation'), 'Furono le banche.', 'non rifatto');
  assert.match(q(h, '#mrv-status').textContent, /Prima completa il campo/);
});

test('K-G36/G37 CSS: lo strato dei richiami rotti resta trasparente; con «riduci movimento» l’evidenza non si anima', () => {
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8');
  assert.match(css, /\.mrv-veste-sfondo \.mrv-veste-rotto \{[^}]*color: transparent/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*#mappai-teacher-review\.mrv-veste \.mrv-veste-evidenza \{ animation: none;/);
});

/* ═══ Gate breve (05/10): G10 e G11 ══════════════════════════════════════════════════════════════════════════ */
test('G10: tolta con «×» l’alternativa del pallino, ⌘Z (tasto col fuoco su body) scarta la modifica non salvata come Esc e lo dice; il bottone «⌘+Z» è acceso anche a pila vuota', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc1');
  assert.equal(q(h, '#mrv-veste-annulla').disabled, true, 'niente da annullare');
  await q(h, '[data-veste-scheda] [data-veste-togli="1"]').click(); await tick();
  assert.equal(h.calls.manifest, 0, 'non valida: non si salva');
  assert.equal(q(h, '#mrv-veste-annulla').disabled, false, 'il bottone «⌘+Z» è acceso per la modifica non salvata');
  const ev = fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(ev.prevented, true);
  assert.deepEqual([alternativa(h, 0).value, alternativa(h, 1).value, alternativa(h, 2).value], ['Lo Stato', 'Le banche', 'I cantoni']);
  assert.equal(q(h, '[data-veste-scheda] [data-veste-corretta="1"]').checked, true, 'il pallino è tornato');
  assert.equal(q(h, '#mrv-status').textContent, 'Annullato: la modifica non salvata di «Alternative».');
  assert.equal(h.calls.manifest, 0);
  assert.equal(q(h, '#mrv-veste-annulla').disabled, true);
  // ⇧⌘Z dopo uno scarto: niente da ripristinare (la modifica non salvata non va nella pila del ripristino)
  fuoriDalModale(h, CMD_SHIFT_Z); await tick(); await tick();
  assert.equal(alternativa(h, 2).value, 'I cantoni');
  assert.equal(h.calls.manifest, 0);
  // anche «Aggiungi un’alternativa» lasciata vuota
  await q(h, '[data-veste-scheda] [data-veste-aggiungi]').click(); await tick();
  assert.equal(q(h, '#mrv-veste-annulla').disabled, false);
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.ok(!alternativa(h, 3), 'l’alternativa aggiunta è scartata');
  assert.equal(h.calls.manifest, 0);
});

test('G10: con niente di non salvato ⌘Z toglie l’ultima azione salvata; con una modifica non salvata la scarta prima, e solo il ⌘Z dopo tocca l’azione', async () => {
  const h = runtime({ report: senzaNotaMc1() }); h.apri(); await vaiA(h, 'mc1');
  await scrivi(h, 'explanation', 'Furono proprio le banche.');   // 0086 g3d (D41): mc1 senza note, dove il campo si salva all'uscita
  const a = entra(alternativa(h, 1)); a.value = 'Le banche svizzere'; a.oninput();
  h.dom.document.body.focus();
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(alternativa(h, 1).value, 'Le banche', 'scartata la battitura');
  assert.equal(adessoG2(h, 'mc1', 'explanation'), 'Furono proprio le banche.', 'l’azione salvata resta');
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(adessoG2(h, 'mc1', 'explanation'), 'Furono le banche.', 'il ⌘Z dopo la toglie');
});

test('G10 e G1: dentro un campo di testo con battitura non salvata il tasto ⌘Z resta nativo finché il testo è diverso dal salvato; il bottone «⌘+Z» scarta tutta la battitura come Esc; tornato il testo, il ⌘Z dopo è della veste', async () => {
  const h = runtime({ report: senzaNotaMc1() }); h.apri(); await vaiA(h, 'mc1');
  await scrivi(h, 'question', 'Chi fu accusato dagli Alleati?');   // 0086 g3d (D41): mc1 senza note, dove il campo si salva all'uscita
  const el = entra(campo(h, 'explanation')); el.value = 'Furono proprio le banche.'; el.oninput();
  const x = evento(h, CMD_Z); assert.equal(x.prevented, false, 'nel campo con battitura: nativo');
  // il bottone non toglie il fuoco al campo (niente salvataggio all’uscita) e scarta la battitura
  const b = q(h, '#mrv-veste-annulla');
  let preso = false; if (b.onmousedown) b.onmousedown({ preventDefault() { preso = true; } });
  assert.equal(preso, true, 'il bottone non prende il fuoco al campo');
  await b.click(); await tick();
  assert.equal(campo(h, 'explanation').value, 'Furono le banche.');
  assert.match(q(h, '#mrv-status').textContent, /^Annullato: la modifica non salvata di «Spiegazione»/);
  assert.equal(adessoG2(h, 'mc1', 'question'), 'Chi fu accusato dagli Alleati?');
  // l’annulla nativo riporta il testo al salvato: il ⌘Z dopo è della veste
  const el2 = entra(campo(h, 'explanation')); el2.value = 'Furono le banche svizzere.'; el2.oninput();
  el2.value = 'Furono le banche.'; el2.oninput();
  const y = evento(h, CMD_Z); await tick(); await tick();
  assert.equal(y.prevented, true, 'niente più di diverso dal salvato: è della veste');
  assert.equal(adessoG2(h, 'mc1', 'question'), 'Chi fu accusato?');
});

test('G11: il richiamo rotto resta segnato dopo il salvataggio, cambiando materiale e riaprendo il Banco: rosso nel campo e avviso in grassetto nella scheda; tornato giusto, sparisce', async () => {
  const fc = { id: 'fcS', kind: 'flashcard', question: 'Che cosa mostra il manifesto?', answer: 'Rovine.' };
  const h = dossierConSintesi([fc]); await vaiA(h, 'syS');
  const el = entra(campo(h, 'text'));
  el.value = el.value.replace("[Carta d'identità]", "[Carta d'identitàx]"); el.oninput();
  el.onblur(); await tick();
  assert.equal(h.calls.manifest, 1, 'la correzione si salva (è un avviso, non un blocco)');
  const segnato = g => !!q(g, '[data-veste-campo="text"] [data-veste-sfondo] .mrv-veste-rotto');
  const avviso = g => { const s = q(g, '[data-veste-scheda] [data-veste-avvisi] strong'); return s ? s.textContent : ''; };
  assert.ok(segnato(h), 'dopo il salvataggio il rosso resta');
  assert.match(avviso(h), /\[Carta d'identitàx\] non è più un richiamo alla scheda/);
  await vaiA(h, 'fcS'); await vaiA(h, 'syS');
  assert.ok(segnato(h), 'cambiando materiale il rosso resta');
  assert.match(avviso(h), /non è più un richiamo alla scheda/);
  const r = runtime({ manifest: h.m }); r.window.MappAIDossierFonteCore = h.window.MappAIDossierFonteCore; r.apri(); await vaiA(r, 'syS');
  assert.ok(segnato(r), 'riaprendo il Banco il rosso resta');
  assert.match(avviso(r), /non è più un richiamo alla scheda/);
  /* tornato giusto, sparisce. Dopo il salvataggio il nome riscritto a mano non ricollega il richiamo (0069, giro 16:
     nel testo salvato la nota non c'è più, e il nome arriverebbe all'allievo come testo): torna giusto con ⌘Z, che
     rimette il testo di prima col richiamo. Scritto PRIMA del codice col nome riscritto; corretto dopo averlo visto
     fallire per questa ragione (vedi i limiti del giro). */
  h.dom.document.body.focus();
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.match(q(h, '#mrv-status').textContent, /^Annullato: la correzione di /);
  assert.ok(campo(h, 'text').value.includes("[Carta d'identità]") && !campo(h, 'text').value.includes('identitàx'));
  assert.ok(!segnato(h)); assert.equal(avviso(h), '');
});

/* G10 (0086 g3c: le guardie dello stato di A.9 sono tolte con i conflitti nati nella seduta, che la veste non crea più) */
test('G10: due modifiche non salvate in due campi si scartano insieme, e la frase le nomina tutte e due', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc1');
  await q(h, '[data-veste-scheda] [data-veste-togli="1"]').click(); await tick();
  await scrivi(h, 'explanation', 'Furono le banche svizzere.', false);
  await q(h, '#mrv-veste-annulla').click(); await tick(); await tick();
  assert.equal(q(h, '#mrv-status').textContent, 'Annullato: le modifiche non salvate di «Alternative», «Spiegazione».');
  assert.equal(alternativa(h, 2).value, 'I cantoni');
  assert.equal(campo(h, 'explanation').value, 'Furono le banche.');
  assert.equal(h.calls.manifest, 0);
});
test('G10 e G1: col cursore nell’alternativa appena aggiunta e ancora vuota ⌘Z è della veste e la scarta; con del testo dentro resta nativo', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc1');
  await q(h, '[data-veste-scheda] [data-veste-aggiungi]').click(); await tick();
  const nuova = alternativa(h, 3);
  assert.ok(h.dom.document.activeElement === nuova, 'il cursore è nella nuova alternativa');
  const x = evento(h, CMD_Z); await tick(); await tick();
  assert.equal(x.prevented, true, 'niente battitura: è della veste');
  assert.ok(!alternativa(h, 3), 'scartata');
  await q(h, '[data-veste-scheda] [data-veste-aggiungi]').click(); await tick();
  const a = alternativa(h, 3); a.value = 'Il Consiglio federale'; a.oninput();
  const y = evento(h, CMD_Z);
  assert.equal(y.prevented, false, 'con la battitura dentro: nativo');
  assert.ok(!!alternativa(h, 3));
});
test('G10: ⌘Z premuto mentre il Banco è fermo su un lavoro in corso («Riprova il controllo») non fa niente', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'fc1');
  await scrivi(h, 'answer', 'Restare neutrale.');
  let rilascia; h.R.retryMaterialJudge = () => new Promise(res => { rilascia = res; });
  const riprova = q(h, '#mrv-retry-judge').click(); await tick();
  assert.equal(typeof rilascia, 'function', 'il controllo è in corso');
  h.dom.document.body.focus();
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(campo(h, 'answer').value, 'Restare neutrale.', 'niente annullato durante il lavoro');
  assert.equal((h.final().initial.decisions[Object.keys(h.final().initial.decisions)[0]] || {}).text, 'Restare neutrale.');
  rilascia(); await riprova; await tick();
});
test('G10: dopo lo scarto lo strato dietro il campo è di nuovo il testo salvato, senza segni, e «Prima» si richiude', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc2');
  const el = entra(campo(h, 'explanation')); el.value = 'I depositi d’oro custoditi.'; el.oninput();
  const sfondo = () => q(h, '[data-veste-scheda] [data-veste-campo="explanation"] [data-veste-sfondo]');
  const prima = () => q(h, '[data-veste-scheda] [data-veste-campo="explanation"] [data-veste-prima]');
  assert.equal(sfondo().textContent, 'I depositi d’oro custoditi.');
  assert.equal(prima().hidden, false, 'scrivendo, «Prima» si apre');
  await q(h, '#mrv-veste-annulla').click(); await tick(); await tick();
  assert.equal(campo(h, 'explanation').value, 'I depositi.');
  assert.equal(sfondo().textContent, 'I depositi.', 'lo strato segue il campo');
  assert.equal(sfondo().querySelectorAll('ins').length, 0);
  assert.equal(prima().hidden, true);
});
test('G10 (0086 g3c): lo scarto (Esc) rimette il testo salvato ADESSO, anche se è cambiato mentre la battitura era nel campo — qui da ⇧⌘Z col fuoco fuori dal campo', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'fc1');
  await scrivi(h, 'answer', 'Restò neutrale fino al 1945.');
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(adessoG2(h, 'fc1', 'answer'), 'Non prendere parte alla guerra.');
  const el = entra(campo(h, 'answer')); el.value = 'Restò neutrale, ma commerciò.'; el.oninput();
  fuoriDalModale(h, CMD_SHIFT_Z); await tick(); await tick();
  assert.equal(adessoG2(h, 'fc1', 'answer'), 'Restò neutrale fino al 1945.', 'rifatta la correzione mentre la battitura è nel campo');
  assert.equal(campo(h, 'answer').value, 'Restò neutrale, ma commerciò.', 'la battitura resta nel campo');
  entra(campo(h, 'answer'));
  tasto(h, { key: 'Escape' });
  assert.equal(campo(h, 'answer').value, 'Restò neutrale fino al 1945.', 'Esc: il salvato di adesso, non quello di quando si è cominciato a scrivere');
  assert.equal(q(h, '#mrv-veste-annulla').disabled, false, 'resta la voce salvata');
});
test('G10 (0086 g3c, D37.7): respinta per le scelte salvate prima che si contraddicono, ⌘Z scarta la correzione', async () => {
  const h = conflittoDiPrima(); h.apri();
  // 0086 g3d (D41): la voce che resta è il bottone di mc2 (sul campo, prima di premere, c'è solo una bozza); su mc1 la
  // correzione è una bozza, respinta al clic
  await vaiA(h, 'mc2'); await premiG(h);
  assert.equal(decisione(h, 'n-mc2-e'), 'reject');
  await vaiA(h, 'mc1');
  await scrivi(h, 'explanation', 'Furono proprio le banche.');
  await premiG(h);
  assert.match(q(h, '#mrv-status').textContent, /si scontra/);
  h.dom.document.body.focus();
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(q(h, '#mrv-status').textContent, 'Annullato: la modifica non salvata di «Spiegazione».');
  assert.equal(decisione(h, 'n-mc2-e'), 'reject', 'la voce di mc2 resta');
  assert.equal(q(h, '[data-veste-scheda]').getAttribute('data-veste-scheda'), 'mc1');
});

/* ═══ G12 (05/10, Giacomo: «Sì, si ricollega») ═════════════════════════════════════════════════════════════════
   Con la scheda come fonte, il nome ESATTO di un blocco fra parentesi quadre torna richiamo vero al salvataggio, nel
   formato che il testo generato ha per quel blocco; rosso e avvisi spariscono. Solo nella veste. */
const testoEffettivo = (h, id, f = 'text') => Core.previewItem(h.final(), { items: h.m.review.final.items }, id).db.items.find(i => i.id === id)[f];
const GIUSTO = "[Carta d'identità]", ROTTO = "[Carta d'identitàx]";
// il testo in rosso, in ordine (un nome a cavallo fra verde e non verde sta in due tratti: si uniscono)
const rossoIn = (h, f = 'text') => { const s = q(h, '[data-veste-scheda] [data-veste-campo="' + f + '"] [data-veste-sfondo]').querySelectorAll('.mrv-veste-rotto').map(x => x.textContent).join(''); return s ? [s] : []; };
const avvisoScheda = h => { const s = q(h, '[data-veste-scheda] [data-veste-avvisi] strong'); return s ? s.textContent : ''; };
async function sostituisciESalva(h, da, a, f = 'text') { const el = entra(campo(h, f)); el.value = el.value.replace(da, a); el.oninput(); el.onblur(); await tick(); }
function riapri(h) { const r = runtime({ manifest: h.m }); r.window.MappAIDossierFonteCore = h.window.MappAIDossierFonteCore; r.apri(); return r; }

test('G12: nome rotto salvato, poi riscritto giusto nella stessa seduta → richiamo vero nei dati, rosso e avvisi via, lo strato è il testo; ⌘Z rimette il testo di prima', async () => {
  const h = dossierConSintesi(); await vaiA(h, 'syS');
  await sostituisciESalva(h, GIUSTO, ROTTO);
  assert.equal(testoEffettivo(h, 'syS'), "Il manifesto mostra rovine [Carta d'identitàx] e chiede il voto [2].");
  const el = entra(campo(h, 'text')); el.value = el.value.replace(ROTTO, GIUSTO); el.oninput();
  assert.deepEqual(rossoIn(h), [], 'scritto giusto, il rosso sparisce già mentre si scrive');
  assert.ok(!q(h, '#mrv-status strong'), 'e la riga di stato non avvisa');
  el.onblur(); await tick();
  assert.equal(testoEffettivo(h, 'syS'), 'Il manifesto mostra rovine [1] e chiede il voto [2].', 'il richiamo vero, nei dati');
  assert.equal(campo(h, 'text').value, "Il manifesto mostra rovine [Carta d'identità] e chiede il voto [Che cosa si vede].");
  assert.equal(q(h, '[data-veste-campo="text"] [data-veste-sfondo]').textContent, campo(h, 'text').value, 'lo strato è il testo, carattere per carattere');
  assert.deepEqual(rossoIn(h), []);
  assert.equal(avvisoScheda(h), '');
  h.dom.document.body.focus();
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(testoEffettivo(h, 'syS'), "Il manifesto mostra rovine [Carta d'identitàx] e chiede il voto [2].", '⌘Z rimette il testo di prima');
  assert.ok(campo(h, 'text').value.includes(ROTTO));
  assert.deepEqual(rossoIn(h), [ROTTO]);
  assert.match(avvisoScheda(h), /non è più un richiamo alla scheda/);
});

test('G12: dopo la riapertura del Banco il nome rotto salvato in una seduta prima, riscritto giusto, torna richiamo', async () => {
  const h = dossierConSintesi(); await vaiA(h, 'syS');
  await sostituisciESalva(h, GIUSTO, ROTTO);
  const r = riapri(h); await vaiA(r, 'syS');
  assert.deepEqual(rossoIn(r), [ROTTO]);
  await sostituisciESalva(r, ROTTO, GIUSTO);
  assert.equal(testoEffettivo(r, 'syS'), 'Il manifesto mostra rovine [1] e chiede il voto [2].');
  assert.deepEqual(rossoIn(r), []);
  assert.equal(avvisoScheda(r), '');
});

test('G12: un nome giusto salvato come testo (prima di G12) resta rosso finché non lo si tocca, e aprire o navigare non scrive; ritoccato, torna richiamo', async () => {
  const fc = { id: 'fcS', kind: 'flashcard', question: 'Che cosa mostra il manifesto?', answer: 'Rovine.' };
  const h = dossierConSintesi([fc]); await vaiA(h, 'syS');
  await sostituisciESalva(h, GIUSTO, ROTTO);
  // il dato come lo lasciava il comportamento di prima: il nome giusto, ma come testo
  const d = h.final().initial.decisions, k = Object.keys(d).find(x => d[x].choice === 'manual');
  d[k].text = d[k].text.replace(ROTTO, GIUSTO);
  const r = riapri(h); await vaiA(r, 'syS');
  const scritte = r.calls.manifest;
  assert.deepEqual(rossoIn(r), [GIUSTO], 'nei dati è testo: è rosso');
  // G14 (a), 06/10: l'avviso dice la cosa vera (prima diceva «Rimetti il nome com'era», che qui non aiuta)
  assert.equal(avvisoScheda(r), GIUSTO + ' è scritto giusto ma non è collegato alla scheda: arriverà all’allievo come testo. Per ricollegarlo modifica il campo e salva.');
  await vaiA(r, 'fcS'); await vaiA(r, 'syS');
  assert.equal(r.calls.manifest, scritte, 'aprire e navigare non scrivono');
  const el = entra(campo(r, 'text')), v = el.value;
  el.value = v.slice(0, -1); el.oninput(); el.value = v; el.oninput();   // tolto e rimesso il punto finale
  assert.deepEqual(rossoIn(r), [], 'ritoccato: si ricollegherà, il rosso va via');
  el.onblur(); await tick();
  assert.equal(testoEffettivo(r, 'syS'), 'Il manifesto mostra rovine [1] e chiede il voto [2].');
  assert.equal(avvisoScheda(r), '');
});

test('G12: un nome scritto da zero torna richiamo se il testo generato ha quel blocco; il nome di un blocco che il testo generato non richiama resta testo e rosso', async () => {
  const h = dossierConSintesi(); await vaiA(h, 'syS');
  await sostituisciESalva(h, GIUSTO, ROTTO);
  // il nome giusto scritto in un punto nuovo (quello rotto resta rotto)
  await sostituisciESalva(h, 'chiede il voto', 'chiede il voto ' + GIUSTO);
  assert.equal(testoEffettivo(h, 'syS'), "Il manifesto mostra rovine [Carta d'identitàx] e chiede il voto [1] [2].");
  assert.deepEqual(rossoIn(h), [ROTTO]);
  // «Che cosa vuole ottenere» è citato dalla sintesi (idx 3) ma il testo generato non lo richiama
  await sostituisciESalva(h, 'Il manifesto', 'Il manifesto [Che cosa vuole ottenere]');
  assert.equal(testoEffettivo(h, 'syS'), "Il manifesto [Che cosa vuole ottenere] mostra rovine [Carta d'identitàx] e chiede il voto [1] [2].");
  assert.deepEqual(rossoIn(h), ['[Che cosa vuole ottenere]' + ROTTO]);
});

test('G12: un nome quasi giusto (maiuscole, spazi) resta rotto', async () => {
  for (const quasi of ["[carta d'identità]", "[Carta  d'identità]", "[ Carta d'identità]", "[Carta d’identità]"]) {
    const h = dossierConSintesi(); await vaiA(h, 'syS');
    await sostituisciESalva(h, GIUSTO, ROTTO);
    await sostituisciESalva(h, ROTTO, quasi);
    assert.equal(testoEffettivo(h, 'syS'), 'Il manifesto mostra rovine ' + quasi + ' e chiede il voto [2].', quasi);
    assert.deepEqual(rossoIn(h), [quasi], quasi);
  }
});

test('G12: due nomi giusti nella stessa frase tornano tutti e due richiami', async () => {
  const h = dossierConSintesi(); await vaiA(h, 'syS');
  const el = entra(campo(h, 'text')); el.value = el.value.replace(GIUSTO, ROTTO).replace('[Che cosa si vede]', '[Che cosa si vedi]'); el.oninput(); el.onblur(); await tick();
  assert.equal(testoEffettivo(h, 'syS'), "Il manifesto mostra rovine [Carta d'identitàx] e chiede il voto [Che cosa si vedi].");
  const e2 = entra(campo(h, 'text')); e2.value = e2.value.replace(ROTTO, GIUSTO).replace('[Che cosa si vedi]', '[Che cosa si vede]'); e2.oninput(); e2.onblur(); await tick();
  assert.equal(testoEffettivo(h, 'syS'), 'Il manifesto mostra rovine [1] e chiede il voto [2].');
  assert.deepEqual(rossoIn(h), []);
  assert.equal(avvisoScheda(h), '');
});

test('G12: anche un rimando [[id]] a un blocco della scheda (non una nota [n]) torna richiamo col suo id', async () => {
  const sy = { id: 'syT', kind: 'synthesis', title: 'Lo scopo', text: 'Il manifesto vuole convincere [[src-n2]].' };
  const h = dossierConSintesi([sy]); await vaiA(h, 'syT');
  assert.equal(campo(h, 'text').value, 'Il manifesto vuole convincere [Che cosa vuole ottenere].');
  await sostituisciESalva(h, '[Che cosa vuole ottenere]', '[Che cosa vuole ottenerx]');
  assert.equal(testoEffettivo(h, 'syT'), 'Il manifesto vuole convincere [Che cosa vuole ottenerx].');
  await sostituisciESalva(h, '[Che cosa vuole ottenerx]', '[Che cosa vuole ottenere]');
  assert.equal(testoEffettivo(h, 'syT'), 'Il manifesto vuole convincere [[src-n2]].');
  assert.deepEqual(rossoIn(h), []);
});

test('G12: con una fonte normale (un PDF) niente cambia: il nome riscritto resta testo', async () => {
  const sy = { id: 'syR', kind: 'synthesis', title: 'Le banche', text: 'Le banche custodivano oro [[src-a1]].',
    citations: [{ id: 'src-a1', title: 'Libro.pdf', page: 4, text: 'Le banche svizzere furono accusate di aver accettato oro.' }] };
  const h = runtime({ items: [sy], report: { checkStatus: 'incomplete', coverage: { checkedIds: [] }, issues: [] } }); h.apri();
  await scrivi(h, 'text', 'Le banche custodivano oro [Fonte 1x].');
  await scrivi(h, 'text', 'Le banche custodivano oro [Fonte 1].');
  assert.equal(testoEffettivo(h, 'syR'), 'Le banche custodivano oro [Fonte 1].');
});

/* ═══ G14 (06/10): ritocchi dopo la revisione di G10–G12 ═══════════════════════════════════════════════════════ */
const avvisiScheda = h => qa(h, '[data-veste-scheda] [data-veste-avvisi] strong').map(x => x.textContent);
test('G14 (a): un nome giusto salvato come testo e un nome rotto nello stesso campo: due avvisi, ognuno con la sua frase vera', async () => {
  const h = dossierConSintesi(); await vaiA(h, 'syS');
  await sostituisciESalva(h, GIUSTO, ROTTO);
  const d = h.final().initial.decisions, k = Object.keys(d).find(x => d[x].choice === 'manual');
  d[k].text = "Il manifesto mostra rovine [Carta d'identità] e chiede il voto [Che cosa si vedi].";
  const r = riapri(h); await vaiA(r, 'syS');
  assert.deepEqual(avvisiScheda(r), [
    '[Che cosa si vedi] non è più un richiamo alla scheda: arriverà all’allievo come testo. Rimetti il nome com’era.',
    GIUSTO + ' è scritto giusto ma non è collegato alla scheda: arriverà all’allievo come testo. Per ricollegarlo modifica il campo e salva.'
  ]);
  assert.equal(r.calls.manifest, 0, 'aprire non ricollega e non scrive');
});

test('G14 (b): uno scarto è un’azione nuova e svuota la pila del ripristino: dopo, ⇧⌘Z non fa niente', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc2');
  await scrivi(h, 'explanation', 'I depositi d’oro.');   // 0086 g3c: una scrittura nel campo (le note non hanno più gesti)
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(adessoG2(h, 'mc2', 'explanation'), 'I depositi.');
  await vaiA(h, 'fc1');
  await scrivi(h, 'answer', 'Testo che poi scarto.', false);
  await q(h, '#mrv-veste-annulla').click(); await tick();
  assert.match(q(h, '#mrv-status').textContent, /^Annullato: la modifica non salvata di «Risposta»/);
  const scritte = h.calls.manifest;
  fuoriDalModale(h, CMD_SHIFT_Z); await tick(); await tick();
  assert.equal(scheda(h), 'fc1', 'non salta su un altro materiale');
  assert.equal(adessoG2(h, 'mc2', 'explanation'), 'I depositi.', 'non rifà la scelta vecchia');
  assert.equal(h.calls.manifest, scritte);
});

test('G14 (d): l’avviso della scheda segue il testo che si scrive: rimesso il nome giusto va via subito, un nome rotto nuovo compare, scartata la battitura torna quello del salvato', async () => {
  const h = dossierConSintesi(); await vaiA(h, 'syS');
  await sostituisciESalva(h, GIUSTO, ROTTO);
  assert.match(avvisoScheda(h), /^\[Carta d'identitàx\] non è più un richiamo/);
  // una battuta che non cambia l'avviso non lo riscrive (una regione «status» riscritta si rilegge)
  const prima = q(h, '[data-veste-scheda] [data-veste-avvisi] strong');
  const el = entra(campo(h, 'text')); el.value = el.value.replace('Il manifesto', 'Questo manifesto'); el.oninput();
  assert.ok(q(h, '[data-veste-scheda] [data-veste-avvisi] strong') === prima, 'lo stesso avviso, non riscritto');
  el.value = el.value.replace(ROTTO, GIUSTO); el.oninput();
  assert.deepEqual(avvisiScheda(h), [], 'scritto giusto: l’avviso del campo va via subito');
  el.value = el.value.replace('[Che cosa si vede]', '[Che cosa si vedi]'); el.oninput();
  assert.deepEqual(avvisiScheda(h), ['[Che cosa si vedi] non è più un richiamo alla scheda: arriverà all’allievo come testo. Rimetti il nome com’era.']);
  tasto(h, { key: 'Escape' });
  assert.match(avvisoScheda(h), /^\[Carta d'identitàx\] non è più un richiamo/, 'scartata la battitura: di nuovo il testo salvato');
});

test('K-A20 G10: dopo una chiusura non riuscita (revisione «applying») ⌘Z non tocca decisioni né manualChecks e non scrive', async () => {
  const report = { checkStatus: 'completed', issues: [clone(NOTE[0])] };
  const h = runtime({ report }); h.apri();
  areaG(h, 'n-mc1-q').onclick(); await premiG(h);   // 0086 g3c: la proposta copiata dall'area, poi il bottone
  assert.equal(q(h, '#mrv-continue').hidden, false);
  h.opts.failSave = true;
  await q(h, '#mrv-continue').click(); await tick(); await tick();
  assert.equal(h.final().initial.status, 'applying', 'il salvataggio della chiusura è fallito');
  const scritte = h.calls.manifest, prima = JSON.stringify([h.final().initial.decisions, h.final().initial.manualChecks]);
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(JSON.stringify([h.final().initial.decisions, h.final().initial.manualChecks]), prima, 'niente annullato');
  assert.equal(h.calls.manifest, scritte, 'niente scritto');
});

test('K-H20 G11/G14 (d) (0086 g3c): con una proposta aperta del controllo che ha un nome sbagliato, il campo e l’avviso della scheda guardano il testo salvato; copiata la proposta, l’avviso segue il campo', async () => {
  const report = { checkStatus: 'incomplete', stato: 'parziale', coverage: { expectedIds: idsGenerati, checkedIds: idsGenerati }, issues: [
    { id: 'nP', target: { kind: 'item', id: 'sy1', field: 'text' }, after: 'Le banche custodivano oro [Che cosa si vedi].', problem: 'Proposta con un nome sbagliato.' }] };
  const h = runtime({ report });
  h.window.MappAIDossierFonteCore = require('../public/js/mappai-dossier-fonte-core.js');
  h.m.review.sources = [{ type: 'scheda', pages: [{ n: 1, text: 'Che cosa si vede: le banche.' }] }];
  h.apri(); await vaiA(h, 'sy1');
  assert.equal(campo(h, 'text').value, 'Le banche custodivano oro.', 'nel campo il testo salvato, non la proposta (D36.1)');
  assert.ok(!q(h, '[data-veste-avvisi] strong'), 'il testo salvato non ha richiami rotti: niente avviso');
  areaG(h, 'nP').onclick(); await tick();
  assert.match(q(h, '[data-veste-avvisi] strong').textContent, /\[Che cosa si vedi\] non è più un richiamo alla scheda/, 'copiata, l’avviso segue il campo (G14 d)');
});

/* ═══ Packet 0074: la Fonte a destra (ADR 0012 rev. 3, p. 5; decisioni F1–F4 di Giacomo del 06/10) ═════════════
   F1 «vince il tuo gesto»: chiusa a mano col divisore resta chiusa; altrimenti si apre da sola sui materiali con passi
   nella fonte e si chiude su quelli senza, e lo dice sulla linguetta; la chiusura automatica non scrive
   `mappai_revisione_fonte`. F2 testo della pagina aperto (provato col pannello vero in tests/review-fonte.test.js e
   qui sotto). F3 la fila dei blocchi a capo anche a veste spenta. F4 una prova con meno di tre parole fatte di lettere
   non si cerca nella fonte. Ogni test qui sotto è scritto PRIMA del codice. */
const SENZA_PASSI = 'Nessun passo nella fonte per questo materiale';
/* Una Fonte finta che conta come il pannello vero (`mostra` dice quante prove hanno una pagina): di predefinito una
   pagina per prova. Tiene le opzioni di `monta` e le chiamate a `mostra` col loro secondo argomento. */
function fonteContata(h, conta) {
  const f = { opzioni: null, chiamate: [] };
  h.window.MappAIReviewFonte = { monta: (host, o) => {
    f.opzioni = o;
    return { mostra: (prove, x) => { f.chiamate.push({ prove: clone(prove), x: x === undefined ? undefined : clone(x) }); return conta ? conta(prove) : prove.length; }, smonta() {} };
  } };
  return f;
}
// il pannello vero della Fonte, caricato nel contesto del Banco (usa il `document` finto)
function fonteVera(h) {
  h.ctx.MappAIGroundingCore = require('../public/js/mappai-grounding-core.js');
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/mappai-review-fonte.js'), 'utf8'), h.ctx);
  h.window.MappAIReviewFonte = h.ctx.MappAIReviewFonte;
}
const divisoreDi = h => q(h, '.mrv-colonne .mrv-divisore');
const fonteChiusa = h => q(h, '.mrv-colonne').classList.contains('is-fonte-chiusa');
const DUE_CITAZIONI = [{ title: 'Libro.pdf', page: 4, text: 'Le banche svizzere furono' }, { title: 'Libro.pdf', page: 4, text: 'accusate di aver accettato oro' }];

test('0074 colonne: con la veste l’ordine nel DOM è barra · scheda · Fonte (il Tab passa dalla scheda alla Fonte); a veste spenta la Fonte prima, come oggi', () => {
  const h = runtime(); h.apri();
  const html = h.dom.html();
  assert.ok(html.indexOf('id="mrv-sidebar"') < html.indexOf('class="mrv-carte"'), 'prima la barra');
  assert.ok(html.indexOf('class="mrv-carte"') < html.indexOf('id="mrv-fonte"'), 'poi la scheda, poi la Fonte');
  assert.ok(html.indexOf('id="mrv-veste-bottone"') < html.indexOf('id="mrv-fonte"'), 'il bottone del materiale prima della Fonte');
  const spento = runtime({ flag: '0' }); spento.apri();
  const oggi = spento.dom.html();
  assert.ok(oggi.indexOf('id="mrv-fonte"') < oggi.indexOf('class="mrv-carte"'), 'a veste spenta la Fonte sta a sinistra, come oggi');
});

test('0074 divisore specchiato (gemello del test del controller con ArrowRight): ← allarga la Fonte, → la stringe, Invio chiude e riapre, gli stessi minimi, oltre il bordo destro si chiude; aria-valuenow = % della Fonte', () => {
  const h = runtime(); fonteContata(h, () => 1); h.apri();
  const div = divisoreDi(h), colonne = q(h, '.mrv-colonne'), tasto = key => div.listeners.keydown({ key, preventDefault() {} });
  const ora = () => div.getAttribute('aria-valuenow');
  assert.equal(div.getAttribute('role'), 'separator');
  assert.equal(ora(), '50'); assert.equal(fonteChiusa(h), false);
  assert.match(div.getAttribute('aria-label'), /oltre il bordo destro la fonte si chiude/);
  tasto('Enter');
  assert.equal(fonteChiusa(h), true); assert.equal(q(h, '#mrv-fonte').inert, true); assert.equal(ora(), '0');
  tasto('ArrowRight');
  assert.equal(fonteChiusa(h), true, 'la linguetta sta a destra: → non la riapre (a veste spenta sì, è a sinistra)');
  tasto('ArrowLeft');
  assert.equal(fonteChiusa(h), false, '← la riapre'); assert.equal(ora(), '50');
  tasto('ArrowLeft'); assert.equal(ora(), '55', '← allarga la Fonte');
  tasto('ArrowRight'); tasto('ArrowRight'); assert.equal(ora(), '45', '→ la stringe');
  const pref = JSON.parse(h.valori.mappai_revisione_fonte);
  assert.equal(pref.chiusa, false); assert.equal(Math.round(pref.frazione * 100), 45, 'i gesti del docente si ricordano');
  // gli stessi minimi di oggi: 280 px la Fonte, 360 la scheda
  colonne.clientWidth = 1000;
  for (let i = 0; i < 12; i++) tasto('ArrowLeft');
  assert.equal(ora(), '64', 'la scheda non scende sotto 360 px');
  for (let i = 0; i < 20; i++) tasto('ArrowRight');
  assert.equal(ora(), '28', 'la Fonte non scende sotto 280 px');
  // trascinando: la Fonte è la distanza dal bordo DESTRO; oltre il bordo destro si chiude e torna poi alla larghezza di prima
  colonne.getBoundingClientRect = () => ({ left: 100, width: 1000, right: 1100 }); div.setPointerCapture = () => {};
  div.listeners.pointerdown({ button: 0, clientX: 820, pointerId: 7, preventDefault() {} });
  div.listeners.pointermove({ clientX: 500, pointerId: 7 });
  assert.equal(ora(), '60', 'il divisore a 600 px dal bordo destro: la Fonte al 60%');
  div.listeners.pointermove({ clientX: 1060, pointerId: 7 });
  div.listeners.pointerup({ pointerId: 7 });
  assert.equal(fonteChiusa(h), true, 'oltre il bordo destro la Fonte si chiude');
  const chiusa = JSON.parse(h.valori.mappai_revisione_fonte);
  assert.equal(chiusa.chiusa, true); assert.equal(Math.round(chiusa.frazione * 100), 28, 'si riaprirà alla larghezza di prima');
  // un clic sulla linguetta la riapre
  div.listeners.pointerdown({ button: 0, clientX: 1095, pointerId: 8, preventDefault() {} }); div.listeners.pointerup({ pointerId: 8 });
  assert.equal(fonteChiusa(h), false); assert.equal(ora(), '28');
});

test('0074 F1, passi sì e no, Fonte non chiusa a mano: si chiude da sola sul materiale senza passi e lo dice sulla linguetta; si riapre da sola sul successivo con passi, alla larghezza di prima; la chiusura automatica non scrive la preferenza', async () => {
  const pref = JSON.stringify({ frazione: 0.4, chiusa: false });
  const h = runtime({ storage: { mappai_revisione_fonte: pref } }); fonteContata(h);
  // ogni scrittura della preferenza, anche con lo stesso valore: la chiusura automatica non ne fa nessuna
  const scritte = [], scrivi0 = h.ctx.localStorage.setItem;
  h.ctx.localStorage.setItem = (k, v) => { if (k === 'mappai_revisione_fonte') scritte.push(v); return scrivi0(k, v); };
  h.apri();
  assert.equal(scheda(h), 'mc2', 'la nota di mc2 non porta evidenza: nessuna prova');
  assert.equal(fonteChiusa(h), true, 'nessun passo: la Fonte si chiude da sola');
  assert.equal(q(h, '#mrv-fonte').inert, true);
  assert.match(divisoreDi(h).getAttribute('aria-label'), new RegExp(SENZA_PASSI), 'per lo screen reader');
  assert.match(String(divisoreDi(h).title), new RegExp(SENZA_PASSI), 'sulla linguetta');
  assert.equal(divisoreDi(h).getAttribute('aria-valuenow'), '0');
  await vaiA(h, 'mc1');
  assert.equal(fonteChiusa(h), false, 'un materiale con passi: si riapre da sola');
  assert.equal(divisoreDi(h).getAttribute('aria-valuenow'), '40', 'alla larghezza di prima');
  assert.doesNotMatch(divisoreDi(h).getAttribute('aria-label'), new RegExp(SENZA_PASSI));
  assert.equal(q(h, '#mrv-fonte').inert, false);
  await vaiA(h, 'op1');
  assert.equal(fonteChiusa(h), true);
  await vaiA(h, 'mc1');
  assert.equal(fonteChiusa(h), false);
  assert.equal(h.valori.mappai_revisione_fonte, pref, 'la chiusura automatica non scrive mappai_revisione_fonte');
  assert.deepEqual(scritte, [], 'nemmeno lo stesso valore');
});

test('0074 F1, chiusa a mano: resta chiusa su ogni materiale, con passi e senza; la linguetta dice quando il materiale non ha passi', async () => {
  const pref = JSON.stringify({ frazione: 0.5, chiusa: true });
  const h = runtime({ storage: { mappai_revisione_fonte: pref } }); fonteContata(h); h.apri();
  assert.equal(fonteChiusa(h), true);
  assert.match(divisoreDi(h).getAttribute('aria-label'), new RegExp(SENZA_PASSI));
  await vaiA(h, 'mc1');
  assert.equal(fonteChiusa(h), true, 'il gesto del docente vince anche su un materiale con passi');
  assert.doesNotMatch(divisoreDi(h).getAttribute('aria-label'), new RegExp(SENZA_PASSI));
  assert.match(divisoreDi(h).getAttribute('aria-label'), /Riapri la fonte/);
  await vaiA(h, 'op1');
  assert.equal(fonteChiusa(h), true);
  assert.equal(h.valori.mappai_revisione_fonte, pref, 'niente scritto');
});

test('0074 F1, riaperta a mano su un materiale senza passi: resta aperta su quel materiale anche se la scheda si ricostruisce; il materiale dopo senza passi la richiude; richiusa a mano resta chiusa anche sui materiali con passi', async () => {
  const h = runtime(); const f = fonteContata(h); h.apri();
  assert.equal(scheda(h), 'mc2'); assert.equal(fonteChiusa(h), true);
  divisoreDi(h).listeners.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(fonteChiusa(h), false, 'il gesto del docente vince sulla chiusura automatica');
  assert.match(f.opzioni.vuoto, new RegExp('^' + SENZA_PASSI), 'al posto della pagina la Fonte dice la frase');
  const prima = f.chiamate.length;
  await q(h, '#mrv-veste-escludi').click(); await tick();
  assert.ok(f.chiamate.length > prima, 'la scheda si è ricostruita (esclusione)');
  assert.equal(scheda(h), 'mc2');
  assert.equal(fonteChiusa(h), false, 'resta aperta su quel materiale');
  await vaiA(h, 'op1');
  assert.equal(fonteChiusa(h), true, 'il materiale dopo, senza passi: si richiude da sola');
  await vaiA(h, 'mc1');
  assert.equal(fonteChiusa(h), false);
  divisoreDi(h).listeners.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(fonteChiusa(h), true);
  assert.equal(JSON.parse(h.valori.mappai_revisione_fonte).chiusa, true, 'il gesto del docente si ricorda');
  await vaiA(h, 'op1'); await vaiA(h, 'mc1');
  assert.equal(fonteChiusa(h), true, 'chiusa a mano resta chiusa anche sui materiali con passi');
});

test('0074 F1 con la foto come fonte (dossier, 0069): la Fonte non si chiude mai da sola, nemmeno su un materiale senza passi', async () => {
  const fc = { id: 'fcD', kind: 'flashcard', question: 'Chi firma il manifesto?', answer: 'Il partito CDU.' };
  let f = null;
  const h = dossierConSintesi([fc], x => { f = fonteContata(x, () => 0); });
  assert.equal(scheda(h), 'fcD', 'le flashcard vengono prima delle sintesi');
  assert.equal(fonteChiusa(h), false, 'zero passi, ma con la foto la Fonte resta aperta: mostra la scheda intera');
  await vaiA(h, 'syS');
  assert.equal(fonteChiusa(h), false);
  assert.ok(f.chiamate.length >= 2, 'la Fonte ha seguito le schede');
  assert.doesNotMatch(divisoreDi(h).getAttribute('aria-label'), new RegExp(SENZA_PASSI));
});

test('0074 la Fonte segue la scheda: le prove nell’ordine di oggi e il colore della prima macroarea del materiale; senza area nessun colore (il giallo); le opzioni del pannello solo con la veste', async () => {
  const items = ITEMS.map(clone);
  items.find(i => i.id === 'mc1').nodeIds = ['b', 'c'];
  const h = runtime({ items });
  h.st.db = { nodes: [{ id: 'a', label: 'Germania', desc: 'Prima.', level: 0 }, { id: 'b', label: 'Svizzera', desc: 'x', level: 1, group: 2 }, { id: 'c', label: 'Banche', desc: 'y', level: 1, group: 3 }],
    links: [], sourcesDict: {}, customColors: { 2: '#f59e0b', 3: '#0ea5e9' } };
  const f = fonteContata(h); h.apri();
  assert.equal(f.opzioni.testoAperto, true, 'F2'); assert.equal(f.opzioni.soloCitazioni, true, 'F4');
  assert.match(f.opzioni.vuoto, new RegExp('^' + SENZA_PASSI));
  await vaiA(h, 'mc1');
  const ultima = f.chiamate[f.chiamate.length - 1];
  assert.deepEqual(ultima.prove, [{ source: 'Libro.pdf', page: 4, text: 'accusate di aver accettato oro' }]);
  assert.equal(ultima.x.colore, '#f59e0b', 'il colore della prima macroarea');
  await vaiA(h, 'op1');
  assert.equal(f.chiamate[f.chiamate.length - 1].x.colore, null, 'senza macroarea nessun colore: il giallo di oggi');
  // a veste spenta il pannello di oggi: nessuna opzione nuova
  const s = runtime({ flag: '0' }); const g = fonteContata(s); s.apri();
  for (const k of ['testoAperto', 'soloCitazioni', 'vuoto']) assert.equal(Object.prototype.hasOwnProperty.call(g.opzioni, k), false, k);
});

test('0074 la Fonte segue anche la scheda di un materiale assente dalla bozza: nessuna prova, e la Fonte si chiude da sola invece di restare sulla pagina di prima', async () => {
  const report = rapporto({ coverage: { expectedIds: ITEMS.map(i => i.id).concat(['perso']), checkedIds: ['mc1', 'mc2', 'ca1'] } });
  const h = runtime({ report }); const f = fonteContata(h); h.apri();
  await vaiA(h, 'mc1'); assert.equal(fonteChiusa(h), false);
  await vaiA(h, 'perso');
  assert.equal(scheda(h), 'perso');
  assert.deepEqual(f.chiamate[f.chiamate.length - 1].prove, []);
  assert.equal(fonteChiusa(h), true);
});

test('0074 col pannello vero: F4 (una prova corta non apre la pagina e non tiene aperta la Fonte), F1 coi conti veri, F2 testo della pagina aperto, il colore dell’area sul pannello', async () => {
  const items = [
    { id: 'mcF', kind: 'mc', question: 'Chi fu accusato?', options: ['Lo Stato', 'Le banche'], correctIndex: 1, explanation: 'Le banche.', nodeIds: ['b'], citations: clone(DUE_CITAZIONI) },
    { id: 'mcC', kind: 'mc', question: 'Quante fasi?', options: ['Una', 'Due'], correctIndex: 1, explanation: 'Due.', evidenza: { title: 'Libro.pdf', page: 4, text: '2' } }];
  const report = { checkStatus: 'incomplete', coverage: { checkedIds: [] }, issues: [] };
  const h = runtime({ items, report });
  h.st.db = { nodes: [{ id: 'a', label: 'Germania', desc: 'Prima.', level: 0 }, { id: 'b', label: 'Svizzera', desc: 'x', level: 1, group: 2 }], links: [], sourcesDict: {}, customColors: { 2: '#10b981' } };
  fonteVera(h); h.apri();
  await vaiA(h, 'mcC'); await vaiA(h, 'mcF');
  assert.equal(scheda(h), 'mcF');
  assert.equal(fonteChiusa(h), false, 'due citazioni nella pagina: la Fonte è aperta');
  assert.equal(qa(h, '#mrv-fonte .mrv-fonte-prove button').map(b => b.textContent).join(','), 'Prova 1,Prova 2');
  assert.equal(q(h, '#mrv-fonte .mrv-fonte-righe mark').textContent, 'Le banche svizzere furono');
  assert.equal(q(h, '#mrv-fonte').classList.contains('mrv-fonte--segno-area'), true, 'il segno col colore dell’area');
  assert.equal(q(h, '#mrv-fonte .mrv-fonte-testo').open, true, 'F2: il testo della pagina aperto');
  await vaiA(h, 'mcC');
  assert.equal(fonteChiusa(h), true, '«2» non è una citazione: nessun passo, la Fonte si chiude');
  assert.equal(q(h, '#mrv-fonte .mrv-fonte-testo').hidden, true, 'nessuna pagina aperta');
  assert.match(q(h, '#mrv-fonte .mrv-fonte-vuoto').textContent, new RegExp('^' + SENZA_PASSI));
  assert.equal(q(h, '#mrv-fonte').classList.contains('mrv-fonte--segno-area'), false, 'senza area il giallo');
});

test('0074 N40: ⌘Z, ⇧⌘Z ed Esc col fuoco nella Fonte (tendina, PDF, testo, bottoni delle prove) restano del Banco e non arrivano mai all’Annulla della mappa (mappai-undo.js vero)', async () => {
  const items = ITEMS.map(clone); items.find(i => i.id === 'mc1').citations = clone(DUE_CITAZIONI);
  const SEL = { tendina: '.mrv-fonte-pagina', pdf: '.mrv-fonte-pdf', testo: '.mrv-fonte-righe', prova: '.mrv-fonte-prove button' };
  // 0086 g3d (D41): mc1 senza la nota del controllo, perché ogni giro ha bisogno di una scrittura nel campo
  const h = runtime({ items, report: senzaNotaMc1() }); fonteVera(h); h.apri(); await vaiA(h, 'mc1');
  for (const [nome, s] of Object.entries(SEL)) assert.equal(!!q(h, '#mrv-fonte ' + s), true, nome);
  // il Tab passa dalla scheda alla Fonte
  const ordine = qa(h, 'button, select').map(b => b.getAttribute('id') || b.className);
  assert.ok(ordine.indexOf('mrv-veste-bottone') >= 0 && ordine.indexOf('mrv-veste-bottone') < ordine.indexOf('mrv-fonte-pagina'), 'nel DOM la scheda viene prima della Fonte');
  const mappa = mappaConUndo();
  // 0086 g3c: ogni giro una correzione nel campo (le note non hanno più gesti)
  const prima = 'Furono le banche.';
  for (const [nome, s] of Object.entries(SEL)) {
    const nuovo = 'Furono le banche: ' + nome + '.';
    await scrivi(h, 'explanation', nuovo);
    assert.equal(adessoG2(h, 'mc1', 'explanation'), nuovo, nome);
    q(h, '#mrv-fonte ' + s).focus();
    const z = evento(h, CMD_Z, { documento: mappa.documento }); await tick(); await tick();
    assert.equal(z.stopped, true, nome + ': ⌘Z è della veste'); assert.equal(z.prevented, true, nome);
    assert.equal(adessoG2(h, 'mc1', 'explanation'), prima, nome + ': ⌘Z ha tolto l’ultima scrittura del Banco');
    q(h, '#mrv-fonte ' + s).focus();
    const y = evento(h, CMD_SHIFT_Z, { documento: mappa.documento }); await tick(); await tick();
    assert.equal(y.stopped, true, nome + ': ⇧⌘Z è della veste');
    assert.equal(adessoG2(h, 'mc1', 'explanation'), nuovo, nome + ': ⇧⌘Z la rimette');
    q(h, '#mrv-fonte ' + s).focus();
    evento(h, CMD_Z, { documento: mappa.documento }); await tick(); await tick();
    assert.equal(mappa.ctx.undoStack.length, 1, nome + ': la pila della mappa è intatta');
    assert.equal(mappa.ctx.appState.db.nodes.length, 0, nome + ': la mappa non è tornata indietro');
  }
  // Esc col fuoco nella Fonte (fuori da un campo) fa quello di oggi, «Salva e continua più tardi», e non tocca la mappa
  for (const [nome, s] of Object.entries(SEL)) {
    const e = runtime({ items }); fonteVera(e); e.apri(); await vaiA(e, 'mc1');
    q(e, '#mrv-fonte ' + s).focus();
    const m2 = mappaConUndo();
    const esc = evento(e, { key: 'Escape' }, { documento: m2.documento }); await tick(); await tick();
    assert.equal(esc.prevented, true, nome + ': Esc lo prende il Banco');
    assert.equal(m2.ctx.undoStack.length, 1, nome + ': la mappa è intatta');
    assert.equal(e.calls.manifest, 0, nome + ': nessuna scrittura');
    assert.equal(e.modal.isConnected, false, nome + ': il Banco si chiude, come Esc fuori da un campo oggi');
  }
});

test('0074 F3 e il foglio di stile: la fila dei blocchi della Fonte va a capo anche a veste spenta; colonne e divisore specchiati e il segno col colore dell’area sotto la veste', () => {
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8');
  assert.match(css, /\n#mappai-teacher-review \.mrv-fonte-prove \{[^}]*flex-wrap: wrap/, 'F3: la regola di G3 senza .mrv-veste');
  assert.doesNotMatch(css, /\.mrv-veste \.mrv-fonte-prove/, 'una regola sola');
  assert.match(css, /#mappai-teacher-review\.mrv-veste \.mrv-colonne \{[^}]*grid-template-columns: minmax\(0, 1fr\) var\(--mrv-fonte-w, 50%\)/, 'la Fonte nella seconda colonna');
  assert.match(css, /#mappai-teacher-review\.mrv-veste \.mrv-colonne\.is-fonte-chiusa \.mrv-divisore \{[^}]*right: 0/, 'la linguetta sul bordo destro');
  assert.match(css, /#mappai-teacher-review\.mrv-veste \.mrv-fonte--segno-area \.mrv-fonte-righe mark \{[^}]*text-decoration-color: var\(--mrv-fonte-segno\)/, 'il segno col colore dell’area');
});

/* ═══ 0074, giro di correzione (06/10) dopo le due verifiche indipendenti ═══════════════════════════════════════════
   Ogni test qui sotto è scritto PRIMA del codice; i «K-F…» sono i test minimi del verificatore, portati qui. */
test('0074 giro 2, difetto 1: Fonte chiusa da sola, una presa sulla linguetta che scivola di qualche px e si lascia nel bordo — torna chiusa da sola, senza scrivere la preferenza; aperta trascinando e riportata oltre il bordo è un gesto del docente', async () => {
  const pref = JSON.stringify({ frazione: 0.4, chiusa: false });
  const h = runtime({ storage: { mappai_revisione_fonte: pref } }); fonteContata(h);
  const scritte = [], scrivi0 = h.ctx.localStorage.setItem;
  h.ctx.localStorage.setItem = (k, v) => { if (k === 'mappai_revisione_fonte') scritte.push(v); return scrivi0(k, v); };
  h.apri();
  assert.equal(scheda(h), 'mc2'); assert.equal(fonteChiusa(h), true);
  const d = divisoreDi(h);
  q(h, '.mrv-colonne').getBoundingClientRect = () => ({ left: 100, width: 1000, right: 1100 }); d.setPointerCapture = () => {};
  // la sequenza del revisore (a1-f1-matrice.js, «clic-con-deriva»): 4 px di deriva, rilascio a 9 px dal bordo destro
  d.listeners.pointerdown({ button: 0, clientX: 1095, pointerId: 1, preventDefault() {} });
  d.listeners.pointermove({ clientX: 1091, pointerId: 1 });
  d.listeners.pointerup({ pointerId: 1 });
  assert.equal(fonteChiusa(h), true, 'resta chiusa');
  assert.match(d.getAttribute('aria-label'), new RegExp(SENZA_PASSI), 'chiusa da sola, come prima');
  assert.deepEqual(scritte, [], 'nessuna preferenza scritta');
  await vaiA(h, 'mc1');
  assert.equal(fonteChiusa(h), false, 'sul materiale con passi si riapre da sola');
  assert.equal(d.getAttribute('aria-valuenow'), '40');
  // aperta trascinando e riportata oltre il bordo nello stesso gesto: è il docente che la chiude, e si ricorda
  await vaiA(h, 'op1'); assert.equal(fonteChiusa(h), true);
  d.listeners.pointerdown({ button: 0, clientX: 1095, pointerId: 2, preventDefault() {} });
  d.listeners.pointermove({ clientX: 600, pointerId: 2 });
  assert.equal(fonteChiusa(h), false, 'trascinata: aperta');
  d.listeners.pointermove({ clientX: 1080, pointerId: 2 });
  d.listeners.pointerup({ pointerId: 2 });
  assert.equal(fonteChiusa(h), true);
  const ultima = JSON.parse(scritte[scritte.length - 1]);
  assert.equal(ultima.chiusa, true, 'chiusa a mano: si ricorda');
  assert.equal(Math.round(ultima.frazione * 100), 40, 'e si riaprirà alla larghezza di prima');
  await vaiA(h, 'mc1');
  assert.equal(fonteChiusa(h), true, 'chiusa a mano resta chiusa anche sul materiale con passi');
});

test('0074 giro 2, difetto 2: con le colonne impilate (sotto i 900 px) niente chiusura automatica né inert; allargata la finestra la Fonte si chiude sul materiale senza passi, ristretta si riapre', async () => {
  const h = runtime(); fonteContata(h);
  let stretta = true; const ascolti = [];
  h.window.matchMedia = query => ({ media: query, get matches() { return /max-width:\s*900px/.test(query) ? stretta : false; },
    addEventListener(k, fn) { if (k === 'change') ascolti.push(fn); }, removeEventListener() {} });
  h.apri();
  assert.equal(scheda(h), 'mc2');
  assert.equal(fonteChiusa(h), false, 'impilate: la Fonte resta visibile e usabile');
  assert.equal(q(h, '#mrv-fonte').inert, false, 'mai inert per una chiusura automatica');
  assert.ok(ascolti.length >= 1, 'la larghezza si ascolta');
  stretta = false; ascolti.forEach(fn => fn({ matches: false }));
  assert.equal(fonteChiusa(h), true, 'colonne affiancate: chiusa da sola');
  assert.equal(q(h, '#mrv-fonte').inert, true);
  stretta = true; ascolti.forEach(fn => fn({ matches: true }));
  assert.equal(fonteChiusa(h), false); assert.equal(q(h, '#mrv-fonte').inert, false);
  await vaiA(h, 'op1');
  assert.equal(fonteChiusa(h), false, 'anche sul materiale dopo');
  assert.equal(h.valori.mappai_revisione_fonte, undefined, 'niente scritto');
});

test('0074 giro 2, «F4 non vale per la foto»: nel Banco, col dossier da foto, una citazione corta di un blocco («Wählt CDU!») ha il suo bottone col nome del blocco e il segno', async () => {
  const h = dossierConSintesi([], x => {
    fonteVera(x); x.ctx.MappAIDossierFonteCore = x.window.MappAIDossierFonteCore;
    const src = x.m.review.final.review.sources, b = src[1];
    x.m.review.final.items.push({ id: 'mcS', kind: 'mc', question: 'Che cosa dice lo slogan?', options: ['Votate CDU', 'Votate SPD'], correctIndex: 0,
      explanation: 'Lo slogan.', citations: [{ docId: b.id, title: b.title, page: 0, text: 'Wählt CDU!' }] });
    x.m.review.final.review = Core.createReview({ db: { items: x.m.review.final.items }, sources: src, report: { checkStatus: 'incomplete', coverage: { checkedIds: [] }, issues: [] } });
  }, { insertBefore: true });
  await tick();
  assert.equal(!!q(h, '#mrv-fonte figure.mrv-fonte-foto'), true, 'la foto c’è');
  await vaiA(h, 'mcS');
  assert.equal(fonteChiusa(h), false);
  assert.deepEqual(qa(h, '#mrv-fonte .mrv-fonte-prove button').map(b => b.textContent), ['Che cosa si vede', '×']);
  assert.equal(q(h, '#mrv-fonte .mrv-fonte-righe mark').textContent, 'Wählt CDU!');
});

test('0074 giro 2: a veste spenta il divisore è quello di oggi — linguetta a sinistra, → riapre la Fonte chiusa, «bordo sinistro», niente chiusura automatica', () => {
  const h = runtime({ flag: '0' }); fonteContata(h, () => 0); h.apri();
  const div = divisoreDi(h), tasto = key => div.listeners.keydown({ key, preventDefault() {} });
  assert.match(div.getAttribute('aria-label'), /oltre il bordo sinistro la fonte si chiude/);
  assert.equal(fonteChiusa(h), false, 'a veste spenta nessuna chiusura automatica');
  tasto('Enter'); assert.equal(fonteChiusa(h), true);
  tasto('ArrowLeft'); assert.equal(fonteChiusa(h), true, '← non la riapre');
  tasto('ArrowRight'); assert.equal(fonteChiusa(h), false, '→ la riapre, come oggi');
  tasto('ArrowRight'); assert.equal(div.getAttribute('aria-valuenow'), '55', '→ la allarga, come oggi');
});

test('K-F47 F1: nessun materiale da aprire (zero righe) — la Fonte riceve zero prove e si chiude da sola, e lo dice', async () => {
  const h = runtime({ report: { checkStatus: 'completed', issues: [] } }); const f = fonteContata(h); h.apri();
  assert.equal(qa(h, '[data-veste-riga]').length, 0);
  assert.deepEqual(f.chiamate[f.chiamate.length - 1].prove, []);
  assert.equal(fonteChiusa(h), true, 'la Fonte non resta aperta su niente');
  assert.match(divisoreDi(h).getAttribute('aria-label'), new RegExp(SENZA_PASSI));
});

test('K-F51/F53 CSS: il divisore specchiato si misura dal bordo destro; col colore d’area il segno nel testo non ha più il fondo giallo', () => {
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8');
  assert.match(css, /#mappai-teacher-review\.mrv-veste \.mrv-divisore \{ left: auto; right: var\(--mrv-fonte-w, 50%\);/);
  assert.match(css, /\.mrv-fonte--segno-area \.mrv-fonte-righe mark \{ background: transparent;/);
});

/* ═══ 0074, test portati dalla verifica del giro di correzione (06/10): sette comportamenti giusti senza un test ═══ */
test('K2-A03 divisore: Fonte aperta (non da sola), un trascinamento che entra subito nel bordo destro la chiude e si ricorda', () => {
  const h = runtime(); fonteContata(h, () => 1); h.apri();
  assert.equal(fonteChiusa(h), false);
  const d = divisoreDi(h);
  q(h, '.mrv-colonne').getBoundingClientRect = () => ({ left: 100, width: 1000, right: 1100 }); d.setPointerCapture = () => {};
  d.listeners.pointerdown({ button: 0, clientX: 600, pointerId: 1, preventDefault() {} });
  d.listeners.pointermove({ clientX: 1095, pointerId: 1 });   // un solo evento, già oltre il 10%
  d.listeners.pointerup({ pointerId: 1 });
  assert.equal(fonteChiusa(h), true, 'chiusa dal docente');
  assert.equal(JSON.parse(h.valori.mappai_revisione_fonte).chiusa, true, 'e si ricorda');
});
test('K2-A03b divisore a veste spenta: un trascinamento che entra subito nel bordo sinistro chiude la Fonte', () => {
  const h = runtime({ flag: '0' }); fonteContata(h, () => 1); h.apri();
  const d = divisoreDi(h);
  q(h, '.mrv-colonne').getBoundingClientRect = () => ({ left: 100, width: 1000, right: 1100 }); d.setPointerCapture = () => {};
  d.listeners.pointerdown({ button: 0, clientX: 600, pointerId: 1, preventDefault() {} });
  d.listeners.pointermove({ clientX: 105, pointerId: 1 });
  d.listeners.pointerup({ pointerId: 1 });
  assert.equal(fonteChiusa(h), true);
  assert.equal(JSON.parse(h.valori.mappai_revisione_fonte).chiusa, true);
});
test('K2-B06 a Banco chiuso il cambio di larghezza stacca il suo ascolto', () => {
  const h = runtime(); fonteContata(h);
  const ascolti = [], tolti = [];
  h.window.matchMedia = query => ({ media: query, matches: false,
    addEventListener(k, fn) { if (k === 'change') ascolti.push(fn); }, removeEventListener(k, fn) { if (k === 'change') tolti.push(fn); } });
  h.apri();
  assert.ok(ascolti.length >= 1);
  h.modal.remove();
  assert.equal(h.modal.isConnected, false);
  ascolti.forEach(fn => fn({ matches: true }));
  assert.equal(ascolti.every(fn => tolti.includes(fn)), true, 'ogni ascolto si è staccato');
});
test('K2-A09 linguetta: 3 px di deriva sono ancora un clic (riapre la Fonte chiusa a mano)', () => {
  const h = runtime({ storage: { mappai_revisione_fonte: JSON.stringify({ frazione: 0.4, chiusa: true }) } }); fonteContata(h, () => 1); h.apri();
  assert.equal(fonteChiusa(h), true);
  const d = divisoreDi(h);
  q(h, '.mrv-colonne').getBoundingClientRect = () => ({ left: 100, width: 1000, right: 1100 }); d.setPointerCapture = () => {};
  d.listeners.pointerdown({ button: 0, clientX: 1095, pointerId: 1, preventDefault() {} });
  d.listeners.pointermove({ clientX: 1092, pointerId: 1 });
  d.listeners.pointerup({ pointerId: 1 });
  assert.equal(fonteChiusa(h), false, 'un clic: riaperta');
});
test('K2-A11 divisore: lasciato al 15% dal bordo destro la Fonte resta aperta (la soglia di chiusura è il 10%)', () => {
  const h = runtime(); fonteContata(h, () => 1); h.apri();
  const d = divisoreDi(h);
  q(h, '.mrv-colonne').getBoundingClientRect = () => ({ left: 100, width: 1000, right: 1100 }); d.setPointerCapture = () => {};
  d.listeners.pointerdown({ button: 0, clientX: 600, pointerId: 1, preventDefault() {} });
  d.listeners.pointermove({ clientX: 950, pointerId: 1 });
  d.listeners.pointerup({ pointerId: 1 });
  assert.equal(fonteChiusa(h), false, 'al 15% resta aperta');
  d.listeners.pointerdown({ button: 0, clientX: 950, pointerId: 2, preventDefault() {} });
  d.listeners.pointermove({ clientX: 1015, pointerId: 2 });
  d.listeners.pointerup({ pointerId: 2 });
  assert.equal(fonteChiusa(h), true, 'all’8,5% si chiude');
});
test('K2-A12 linguetta: un clic sulla Fonte chiusa da sola la riapre su quel materiale', () => {
  const h = runtime(); fonteContata(h); h.apri();
  assert.equal(scheda(h), 'mc2'); assert.equal(fonteChiusa(h), true);
  const d = divisoreDi(h); d.setPointerCapture = () => {};
  d.listeners.pointerdown({ button: 0, clientX: 1095, pointerId: 1, preventDefault() {} });
  d.listeners.pointerup({ pointerId: 1 });
  assert.equal(fonteChiusa(h), false, 'riaperta dal docente');
});
test('K2-E01 tastiera: ← sulla linguetta di una Fonte chiusa da sola la riapre (e non sposta solo la larghezza)', () => {
  const h = runtime(); fonteContata(h); h.apri();
  assert.equal(scheda(h), 'mc2'); assert.equal(fonteChiusa(h), true);
  divisoreDi(h).listeners.keydown({ key: 'ArrowLeft', preventDefault() {} });
  assert.equal(fonteChiusa(h), false, '← la riapre');
  assert.equal(divisoreDi(h).getAttribute('aria-valuenow'), '50', 'alla larghezza di prima');
});
test('K2-D14 CSS: la sottolineatura nel testo della pagina è spessa almeno 2 px', () => {
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8');
  const m = css.match(/\.mrv-fonte--segno-area \.mrv-fonte-righe mark \{[^}]*text-decoration-thickness: (\d+(?:\.\d+)?)px/);
  assert.ok(m && Number(m[1]) >= 2, m ? m[1] : 'manca');
});

/* ═══ 0074, punti 10 e 11 (F7–F9, Giacomo 06/10, chat «packet0074bis»): il divisore delle occorrenze, solo con la veste;
   il Banco sopra le console, sempre ══════════════════════════════════════════════════════════════════════════════════
   Il divisore sta fra il pannello delle occorrenze e ciò che sta sotto: trascinato in basso il pannello cresce fino al
   75% dell'area dei materiali (`.mrv-carte`, il contenitore del pannello, della navigazione e della scheda); lasciato al
   15% o meno si chiude come col bottone; ↓/↑ di 5 punti con gli stessi limiti; l'altezza scelta resta finché il Banco è
   aperto, senza salvarsi. Geometria finta: l'area da 100 a 700 px (600 px), il pannello «di oggi» alto 180 px (30%).
   Scritti PRIMA del codice. */
const divOcc = h => q(h, '[role="separator"][aria-orientation="horizontal"]');
const divOccVisibile = h => { const d = divOcc(h); return !!d && !d.hidden; };
const occAperte = h => !!q(h, '#mrv-occurrences[open]');
const occEspanse = h => q(h, '#mrv-occorrenze').getAttribute('aria-expanded');
const valoreOcc = h => divOcc(h).getAttribute('aria-valuenow');
const stileOcc = h => String(q(h, '#mrv-occurrences-host').getAttribute('style') || '');
function geometriaOcc(h, altezzaOggi = 180) {
  q(h, '.mrv-carte').getBoundingClientRect = () => ({ top: 100, bottom: 700, height: 600, left: 0, right: 800, width: 800 });
  q(h, '#mrv-occurrences-host').getBoundingClientRect = () => ({ top: 100, bottom: 100 + altezzaOggi, height: altezzaOggi, left: 0, right: 800, width: 800 });
}
async function bottoneOcc(h) { await q(h, '#mrv-occorrenze').click(); await tick(); }
// una presa sul divisore: giù dove sta (`da`), uno o più movimenti, poi il rilascio
function trascinaOcc(h, da, a, id = 1) {
  const d = divOcc(h); d.setPointerCapture = () => {};
  d.listeners.pointerdown({ button: 0, clientY: da, pointerId: id, preventDefault() {} });
  (Array.isArray(a) ? a : [a]).forEach(y => d.listeners.pointermove({ clientY: y, pointerId: id }));
  d.listeners.pointerup({ pointerId: id });
}
const tastoOcc = (h, key) => { let fermato = false; divOcc(h).listeners.keydown({ key, preventDefault() { fermato = true; } }); return fermato; };

test('0074 p10: il divisore delle occorrenze c’è solo con la veste e a pannello aperto — separatore orizzontale, nel Tab, col nome, fra il pannello e la navigazione', async () => {
  const h = runtime(); h.apri();
  assert.equal(occEspanse(h), 'false', 'all’apertura del Banco il pannello è chiuso');
  assert.equal(divOccVisibile(h), false, 'e il divisore non c’è');
  await bottoneOcc(h);
  assert.equal(occAperte(h), true); assert.equal(occEspanse(h), 'true');
  assert.equal(divOccVisibile(h), true, 'a pannello aperto il divisore c’è');
  const d = divOcc(h);
  assert.equal(d.getAttribute('role'), 'separator');
  assert.equal(d.getAttribute('aria-orientation'), 'horizontal');
  assert.equal(String(d.tabIndex === 0 ? 0 : d.getAttribute('tabindex')), '0', 'nel Tab');
  assert.ok(String(d.getAttribute('aria-label') || '').length > 0, 'un nome per lo screen reader');
  assert.ok(/^\d+$/.test(String(d.getAttribute('aria-valuenow'))), 'aria-valuenow è un numero');
  const html = h.dom.html();
  assert.ok(html.indexOf('id="mrv-occurrences-host"') < html.indexOf('aria-orientation="horizontal"'), 'dopo il pannello');
  assert.ok(html.indexOf('aria-orientation="horizontal"') < html.indexOf('id="mrv-detail-nav"'), 'prima di ciò che sta sotto');
  await bottoneOcc(h);   // il bottone lo richiude
  assert.equal(occAperte(h), false); assert.equal(divOccVisibile(h), false, 'a pannello chiuso il divisore non c’è');
});

test('0074 p10 (F8): a veste spenta nessun divisore delle occorrenze, e il pannello aperto è quello di oggi', async () => {
  const aperto = async o => { const h = runtime(o); h.apri(); await bottoneOcc(h); return h; };
  const oggi = await aperto({ senzaVeste: true });
  for (const o of [{ flag: '0' }]) {   // 0089: senza chiave la veste è accesa
    const h = await aperto(o);
    assert.equal(occAperte(h), true);
    assert.equal(!!divOcc(h), false, 'nessun separatore orizzontale');
    assert.equal(q(h, '#mrv-occurrences-host').getAttribute('style'), undefined, 'nessuna altezza imposta');
    assert.equal(q(h, '#mrv-occurrences-host').className, '');
    assert.equal(h.dom.html(), oggi.dom.html(), 'lo stesso DOM del Banco senza il modulo della veste');
  }
});

test('0074 p10: trascinato in basso il pannello cresce fino al 75% dell’area dei materiali, non oltre; aria-valuenow è la percentuale', async () => {
  const h = runtime(); h.apri(); geometriaOcc(h); await bottoneOcc(h);
  assert.equal(valoreOcc(h), '30', 'la prima volta l’altezza di oggi, misurata sull’area');
  trascinaOcc(h, 280, 400);
  assert.equal(valoreOcc(h), '50');
  assert.match(stileOcc(h), /50(\.0+)?%/, 'il pannello prende l’altezza scelta');
  trascinaOcc(h, 400, [600, 690]);   // 83% e 98%
  assert.equal(valoreOcc(h), '75', 'fermo al 75%');
  assert.match(stileOcc(h), /75(\.0+)?%/);
  assert.doesNotMatch(stileOcc(h), /(8[0-9]|9[0-9])(\.\d+)?%/, 'mai oltre il 75%');
  assert.equal(occAperte(h), true); assert.equal(occEspanse(h), 'true');
});

test('0074 p10: lasciato al 15% o meno il pannello si chiude come col bottone; sopra il 15% resta aperto; conta il punto del rilascio', async () => {
  const h = runtime(); h.apri(); geometriaOcc(h); await bottoneOcc(h);
  trascinaOcc(h, 280, 196);   // 16%
  assert.equal(occAperte(h), true, 'al 16% resta aperto'); assert.equal(valoreOcc(h), '16');
  trascinaOcc(h, 196, [150, 400]);   // passa dall'8% e lo si lascia al 50%
  assert.equal(occAperte(h), true, 'conta dove si lascia'); assert.equal(valoreOcc(h), '50');
  assert.equal(h.dom.document.activeElement === q(h, '#mrv-occurrence-query'), true, 'il bottone ha messo il fuoco nella ricerca');
  trascinaOcc(h, 400, [300, 190]);   // lasciato esattamente al 15%
  assert.equal(occAperte(h), false, 'al 15% si chiude');
  assert.equal(occEspanse(h), 'false', 'come col bottone');
  assert.equal(divOccVisibile(h), false);
  assert.equal(h.dom.document.activeElement === q(h, '#mrv-occorrenze'), true, 'il fuoco era nel pannello chiuso: torna sul bottone');
  await bottoneOcc(h);   // lo stato è «chiuso», non solo nascosto: un clic sul bottone lo riapre
  assert.equal(occAperte(h), true); assert.equal(occEspanse(h), 'true');
  assert.equal(valoreOcc(h), '50', 'riaperto all’altezza di prima della presa, non a quella di passaggio');
});

test('0074 p10: da tastiera ↓ allarga e ↑ stringe di 5 punti, fermo al 75%; al 15% o meno si chiude e il fuoco torna sul bottone', async () => {
  const h = runtime(); h.apri(); geometriaOcc(h); await bottoneOcc(h);
  assert.equal(valoreOcc(h), '30');
  assert.equal(tastoOcc(h, 'ArrowDown'), true, 'la freccia è del divisore');
  assert.equal(valoreOcc(h), '35'); assert.match(stileOcc(h), /35(\.0+)?%/);
  for (let i = 0; i < 10; i++) tastoOcc(h, 'ArrowDown');
  assert.equal(valoreOcc(h), '75', 'fermo al 75%');
  tastoOcc(h, 'ArrowUp'); assert.equal(valoreOcc(h), '70');
  for (let i = 0; i < 10; i++) tastoOcc(h, 'ArrowUp');
  assert.equal(valoreOcc(h), '20'); assert.equal(occAperte(h), true);
  assert.equal(tastoOcc(h, 'ArrowLeft'), false, 'le frecce orizzontali non sono sue');
  assert.equal(valoreOcc(h), '20');
  divOcc(h).focus();
  tastoOcc(h, 'ArrowUp');
  assert.equal(occAperte(h), false, 'al 15% si chiude'); assert.equal(occEspanse(h), 'false');
  assert.equal(h.dom.document.activeElement === q(h, '#mrv-occorrenze'), true, 'il divisore sparisce: il fuoco torna sul bottone');
  await bottoneOcc(h);
  assert.equal(valoreOcc(h), '20', 'riaperto all’ultima altezza scelta');
});

test('0074 p10: riaperto riprende l’altezza scelta finché il Banco è aperto; la prima volta e in un Banco nuovo quella di oggi; niente si salva', async () => {
  const h = runtime(); h.apri(); geometriaOcc(h); await bottoneOcc(h);
  const prima = JSON.stringify(h.valori);
  assert.equal(/%/.test(stileOcc(h)), false, 'la prima volta nessuna altezza imposta: quella di oggi');
  trascinaOcc(h, 280, [400, 160]);   // dall'altezza di oggi, passando dal 50%, lasciato al 10%: si chiude
  assert.equal(occAperte(h), false);
  await bottoneOcc(h);
  assert.equal(valoreOcc(h), '30', 'riaperto all’altezza di oggi, quella di prima della presa');
  trascinaOcc(h, 280, 460);   // 60%
  await bottoneOcc(h); assert.equal(occAperte(h), false, 'chiuso col bottone');
  await bottoneOcc(h);
  assert.equal(valoreOcc(h), '60', 'riaperto col bottone riprende l’altezza scelta');
  assert.match(stileOcc(h), /60(\.0+)?%/);
  assert.equal(JSON.stringify(h.valori), prima, 'non si salva niente');
  h.apri(); geometriaOcc(h); await bottoneOcc(h);
  assert.equal(valoreOcc(h), '30', 'un Banco nuovo riparte dall’altezza di oggi');
  assert.equal(/%/.test(stileOcc(h)), false);
});

test('0074 p11 (F9): con una finestra del motore aperta il Banco chiede il suo piano, a veste accesa e spenta, in G2 e in G1; senza, nessuno zIndex; `alza` come prima', () => {
  for (const flag of ['1', '0']) {
    let z = 20000, chieste = 0;
    const h = runtime({ flag });
    h.window.MappAIModal = { aperti: 1, prossimoZ: () => { chieste++; z += 100; return z; } };
    h.apri();
    assert.equal(h.modal.style.zIndex, String(z), 'una console aperta: il Banco sopra (veste ' + flag + ')');
    assert.equal(chieste, 1);
    h.apri({});   // G1
    assert.equal(h.modal.style.zIndex, String(z), 'anche G1');
    h.window.MappAIModal.aperti = 0; chieste = 0;
    h.apri();
    assert.equal(h.modal.style.zIndex, undefined, 'nessuna finestra del motore: nessuno zIndex, resta z-[3400]');
    assert.match(h.modal.className, /z-\[3400\]/);
    assert.equal(chieste, 0);
    // `alza` come prima: chiede il piano anche senza console; con una console aperta una richiesta sola
    h.apri({ final: true, alza: true });
    assert.equal(h.modal.style.zIndex, String(z)); assert.equal(chieste, 1);
    h.window.MappAIModal.aperti = 2; chieste = 0;
    h.apri({ final: true, alza: true });
    assert.equal(h.modal.style.zIndex, String(z)); assert.equal(chieste, 1, 'una richiesta sola');
  }
  // anche col Banco spento (il modale di prima, `mappai_revisione_banco` = '0')
  const vecchio = runtime({ storage: { mappai_revisione_banco: '0' } });
  vecchio.window.MappAIModal = { aperti: 1, prossimoZ: () => 31337 };
  vecchio.apri();
  assert.equal(vecchio.modal.style.zIndex, '31337');
  // un motore senza `prossimoZ`: nessun errore, nessuno zIndex
  const senza = runtime(); senza.window.MappAIModal = { aperti: 1 };
  senza.apri();
  assert.equal(senza.modal.style.zIndex, undefined);
});

/* I test minimi portati dalla scelta delle mutazioni (scritti dopo il codice, verdi sul codice e rossi sulla loro
   mutazione, come i «K» dei giri di prima). La geometria qui segue il pannello vero: alto 0 finché è chiuso
   (`display: none` del foglio di stile), alto quanto il contenuto quando è aperto. */
function geometriaOccViva(h, altezzaOggi = 180) {
  geometriaOcc(h, altezzaOggi);
  q(h, '#mrv-occurrences-host').getBoundingClientRect = () => {
    const alta = q(h, '#mrv-occurrences[open]') ? altezzaOggi : 0;
    return { top: 100, bottom: 100 + alta, height: alta, left: 0, right: 800, width: 800 };
  };
}
const regolato = h => q(h, '#mrv-occurrences-host').classList.contains('is-regolato');
test('K3-p10 la misura dell’altezza di oggi si prende DOPO aver disegnato il pannello (alla prima apertura non è 0)', async () => {
  const h = runtime(); h.apri(); geometriaOccViva(h); await bottoneOcc(h);
  assert.equal(valoreOcc(h), '30');
});
test('K3-p10 un clic sul divisore, o 3 px di deriva, non cambiano niente', async () => {
  const h = runtime(); h.apri(); geometriaOccViva(h); await bottoneOcc(h);
  trascinaOcc(h, 280, 283);
  assert.equal(valoreOcc(h), '30'); assert.equal(regolato(h), false, 'nessuna altezza scelta');
  trascinaOcc(h, 190, []);   // un clic dove il pannello sarebbe al 15%: non è un rilascio dopo un trascinamento
  assert.equal(occAperte(h), true);
});
test('K3-p10 l’altezza scelta si applica al pannello (la classe che il foglio di stile lega all’altezza); tornati all’altezza di oggi non si applica più', async () => {
  const h = runtime(); h.apri(); geometriaOccViva(h); await bottoneOcc(h);
  assert.equal(regolato(h), false, 'la prima volta: quella di oggi');
  trascinaOcc(h, 280, 400);
  assert.equal(regolato(h), true);
  trascinaOcc(h, 400, 130);   // chiuso: si riaprirà all'altezza di prima della presa (50%)
  await bottoneOcc(h); assert.equal(regolato(h), true); assert.equal(valoreOcc(h), '50');
  const nuovo = runtime(); nuovo.apri(); geometriaOccViva(nuovo); await bottoneOcc(nuovo);
  trascinaOcc(nuovo, 280, [400, 130]);   // dall'altezza di oggi, chiuso passando dal 50%
  await bottoneOcc(nuovo);
  assert.equal(regolato(nuovo), false, 'riaperto all’altezza di oggi: niente altezza imposta');
  assert.equal(valoreOcc(nuovo), '30');
});
test('K3-p10 durante la presa, al 15% o meno il pannello non scende: si schiarisce (si chiuderà) e risale se si torna su', async () => {
  const h = runtime(); h.apri(); geometriaOccViva(h); await bottoneOcc(h);
  trascinaOcc(h, 280, 400);
  const d = divOcc(h);
  d.listeners.pointerdown({ button: 0, clientY: 400, pointerId: 5, preventDefault() {} });
  d.listeners.pointermove({ clientY: 150, pointerId: 5 });   // 8%
  assert.equal(valoreOcc(h), '50', 'resta all’ultima altezza sopra il 15%');
  assert.equal(q(h, '#mrv-occurrences-host').classList.contains('sta-chiudendo'), true);
  d.listeners.pointermove({ clientY: 340, pointerId: 5 });   // 40%
  assert.equal(q(h, '#mrv-occurrences-host').classList.contains('sta-chiudendo'), false);
  d.listeners.pointerup({ pointerId: 5 });
  assert.equal(valoreOcc(h), '40'); assert.equal(occAperte(h), true);
});

// scritto dopo il foglio di stile (un controllo statico, come K-F51): rosso sul foglio di `474a9c35`
test('0074 p10 CSS: il divisore delle occorrenze e l’altezza scelta vivono solo sotto la veste; l’altezza scelta si ferma al 75%', () => {
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8');
  const regole = css.split('\n').filter(r => /mrv-occ-divisore|is-regolato|is-trascinando-occ|--mrv-occ-h/.test(r) && !/^\s*(\/\*|\*)/.test(r));
  assert.ok(regole.length >= 5, 'le regole ci sono');
  assert.equal(regole.every(r => r.includes('#mappai-teacher-review.mrv-veste')), true, 'tutte sotto .mrv-veste');
  assert.match(css, /#mappai-teacher-review\.mrv-veste #mrv-occurrences-host\.is-regolato \{ height: var\(--mrv-occ-h, auto\); max-height: 75%; \}/);
  assert.match(css, /#mappai-teacher-review\.mrv-veste \.mrv-occ-divisore \{ display: none; \}/, 'nascosto dove le colonne sono impilate');
  assert.match(css, /\.mrv-occ-divisore:not\(\[hidden\]\) \{ display: block;[^}]*cursor: row-resize;/, 'e il `hidden` del pannello chiuso vince');
});

/* DIFETTO D1 (verificatore): su uno schermo alto l'altezza di oggi è già sotto il 15% (Chrome vero, 2560×1440:
   area 1346 px, pannello 156 px = 11,6%). Una presa per ALLARGARE il pannello (verso il basso) che non supera il
   15% lo schiarisce, non lo muove e al rilascio lo CHIUDE: il packet chiude solo «trascinato in alto». Rosso sul
   codice di oggi. */
test('D1 trascinato verso il BASSO da un’altezza di oggi sotto il 15%, il pannello non si chiude', async () => {
  const h = runtime(); h.apri();
  q(h, '.mrv-carte').getBoundingClientRect = () => ({ top: 43, bottom: 1389, height: 1346, left: 0, right: 1130, width: 1130 });
  q(h, '#mrv-occurrences-host').getBoundingClientRect = () => { const alta = q(h, '#mrv-occurrences[open]') ? 156 : 0; return { top: 43, bottom: 43 + alta, height: alta, left: 0, right: 1130, width: 1130 }; };
  await bottoneOcc(h);
  assert.equal(valoreOcc(h), '12');
  const d = divOcc(h); d.setPointerCapture = () => {};
  d.listeners.pointerdown({ button: 0, clientY: 199, pointerId: 1, preventDefault() {} });
  d.listeners.pointermove({ clientY: 214, pointerId: 1 });   // 15 px più in basso: 12,8%
  assert.equal(q(h, '#mrv-occurrences-host').classList.contains('sta-chiudendo'), false, 'scendendo non annuncia la chiusura');
  d.listeners.pointerup({ pointerId: 1 });
  assert.equal(occAperte(h), true, 'scendendo non si chiude');
});

/* D1, la cura (F7: «se il trascinamento verso l'alto da alla sezione 'occorrenze' il 15% o meno allora la sezione
   occorrenze si chiude»): si chiude, e si schiarisce durante la presa, solo se il puntatore è SALITO rispetto al punto
   della presa e il pannello è al 15% o meno; verso il basso il pannello segue il puntatore. La geometria è quella dello
   schermo alto di D1: l'area da 43 a 1389 px (1346 px), il pannello di oggi alto 156 px (11,6%). */
function geometriaSchermoAlto(h) {
  q(h, '.mrv-carte').getBoundingClientRect = () => ({ top: 43, bottom: 1389, height: 1346, left: 0, right: 1130, width: 1130 });
  q(h, '#mrv-occurrences-host').getBoundingClientRect = () => { const alta = q(h, '#mrv-occurrences[open]') ? 156 : 0; return { top: 43, bottom: 43 + alta, height: alta, left: 0, right: 1130, width: 1130 }; };
}
const schiarito = h => q(h, '#mrv-occurrences-host').classList.contains('sta-chiudendo');
test('0074 p10 D1: sotto il 15% il pannello segue il puntatore che scende; la salita si misura dal punto della presa, non dall’ultimo movimento', async () => {
  const h = runtime(); h.apri(); geometriaSchermoAlto(h); await bottoneOcc(h);
  assert.equal(valoreOcc(h), '12');
  const d = divOcc(h); d.setPointerCapture = () => {};
  d.listeners.pointerdown({ button: 0, clientY: 199, pointerId: 1, preventDefault() {} });
  d.listeners.pointermove({ clientY: 230, pointerId: 1 });   // 13,9%: sotto la presa
  assert.equal(schiarito(h), false); assert.equal(valoreOcc(h), '14', 'il pannello segue il puntatore');
  assert.equal(regolato(h), true); assert.match(stileOcc(h), /13\.89%/);
  d.listeners.pointermove({ clientY: 220, pointerId: 1 });   // 13,1%: risale, ma è ancora sotto il punto della presa
  assert.equal(schiarito(h), false, 'risalire un poco non è salire rispetto alla presa'); assert.equal(valoreOcc(h), '13');
  d.listeners.pointermove({ clientY: 202, pointerId: 1 });   // 11,8%: 3 px sotto la presa
  assert.equal(schiarito(h), false, '3 px sotto la presa non è salire'); assert.equal(valoreOcc(h), '12');
  d.listeners.pointermove({ clientY: 199, pointerId: 1 });   // esattamente il punto della presa
  assert.equal(schiarito(h), false, 'tornato al punto della presa non è salito');
  d.listeners.pointermove({ clientY: 190, pointerId: 1 });   // 10,9%: sopra il punto della presa
  assert.equal(schiarito(h), true, 'salito e al 15% o meno: si chiuderà'); assert.equal(valoreOcc(h), '12', 'e non scende');
  d.listeners.pointermove({ clientY: 240, pointerId: 1 });   // 14,6%: di nuovo sotto la presa
  assert.equal(schiarito(h), false); assert.equal(valoreOcc(h), '15');
  d.listeners.pointerup({ pointerId: 1 });
  assert.equal(occAperte(h), true, 'lasciato sotto il punto della presa: resta aperto'); assert.equal(occEspanse(h), 'true');
  assert.equal(valoreOcc(h), '15'); assert.equal(divOccVisibile(h), true);
  trascinaOcc(h, 240, 200);   // una presa nuova, verso l'alto: 11,7%
  assert.equal(occAperte(h), false, 'salito al 15% o meno: si chiude'); assert.equal(occEspanse(h), 'false');
  assert.equal(schiarito(h), false);
  await bottoneOcc(h);
  assert.equal(valoreOcc(h), '15', 'riaperto all’altezza di prima della presa');
});
test('0074 p10 D1: da tastiera ↓ non chiude mai, anche da sotto il 15% allarga; ↑ chiude quando arriva al 15% o meno', async () => {
  const h = runtime(); h.apri(); geometriaOccViva(h, 18); await bottoneOcc(h);   // l'altezza di oggi: 3%
  assert.equal(valoreOcc(h), '3');
  assert.equal(tastoOcc(h, 'ArrowDown'), true, 'la freccia è del divisore');
  assert.equal(occAperte(h), true, '↓ dal 3% non chiude'); assert.equal(occEspanse(h), 'true');
  assert.equal(valoreOcc(h), '8', 'allarga di 5 punti'); assert.match(stileOcc(h), /8(\.0+)?%/);
  tastoOcc(h, 'ArrowDown'); assert.equal(valoreOcc(h), '13'); assert.equal(occAperte(h), true);
  tastoOcc(h, 'ArrowDown'); assert.equal(valoreOcc(h), '18');
  tastoOcc(h, 'ArrowUp');
  assert.equal(occAperte(h), false, '↑ al 13%: si chiude'); assert.equal(occEspanse(h), 'false');
  const bordo = runtime(); bordo.apri(); geometriaOccViva(bordo, 60); await bottoneOcc(bordo);   // 10%
  tastoOcc(bordo, 'ArrowDown');
  assert.equal(occAperte(bordo), true, '↓ che arriva esattamente al 15% non chiude'); assert.equal(valoreOcc(bordo), '15');
  tastoOcc(bordo, 'ArrowDown'); assert.equal(valoreOcc(bordo), '20');
  tastoOcc(bordo, 'ArrowUp');
  assert.equal(occAperte(bordo), false, '↑ che arriva al 15%: si chiude');
});

/* I test minimi del verificatore indipendente dei punti 10 e 11 (06/10): uccidono le mutazioni sopravvissute al primo
   giro (verdi sul codice, rossi sulla loro mutazione). Le chiusure qui sono tutte trascinamenti verso l'alto: valgono
   anche con la cura di D1. */
function presa(h, y, id = 1, button = 0) {
  const d = divOcc(h), ev = { button, clientY: y, pointerId: id, prevenuto: false, preventDefault() { this.prevenuto = true; } };
  d.listeners.pointerdown(ev); return ev;
}
test('K4-p10 la presa cattura il puntatore (senza, il trascinamento si perde appena il puntatore esce dalla fascia di 12 px) e ferma la selezione del testo', async () => {
  const h = runtime(); h.apri(); geometriaOccViva(h); await bottoneOcc(h);
  const catturati = []; divOcc(h).setPointerCapture = id => catturati.push(id);
  const ev = presa(h, 280, 7);
  assert.deepEqual(catturati, [7], 'setPointerCapture col pointerId della presa');
  assert.equal(ev.prevenuto, true, 'preventDefault sulla presa');
  divOcc(h).listeners.pointerup({ pointerId: 7 });
});
test('K4-p10 durante la presa l’area dei materiali porta la classe del trascinamento; al rilascio (anche dopo una chiusura) non restano né quella né il pannello schiarito', async () => {
  const h = runtime(); h.apri(); geometriaOccViva(h); await bottoneOcc(h);
  divOcc(h).setPointerCapture = () => {};
  presa(h, 280);
  assert.equal(q(h, '.mrv-carte').classList.contains('is-trascinando-occ'), true, 'durante la presa');
  divOcc(h).listeners.pointermove({ clientY: 150, pointerId: 1 });   // 8%: si chiuderà
  assert.equal(q(h, '#mrv-occurrences-host').classList.contains('sta-chiudendo'), true);
  divOcc(h).listeners.pointerup({ pointerId: 1 });
  assert.equal(occAperte(h), false, 'chiuso');
  assert.equal(q(h, '.mrv-carte').classList.contains('is-trascinando-occ'), false, 'la classe del trascinamento se ne va');
  assert.equal(q(h, '#mrv-occurrences-host').classList.contains('sta-chiudendo'), false, 'il pannello non resta schiarito');
  await bottoneOcc(h);
  assert.equal(q(h, '#mrv-occurrences-host').classList.contains('sta-chiudendo'), false, 'riaperto: non schiarito');
});
test('K4-p10 chiuso trascinando col fuoco FUORI dal pannello (un campo della scheda, il titolo): il fuoco resta dov’era', async () => {
  const h = runtime(); h.apri(); geometriaOccViva(h); await bottoneOcc(h);
  const titolo = q(h, '#mrv-title'); titolo.focus();
  trascinaOcc(h, 280, [200, 150]);
  assert.equal(occAperte(h), false);
  assert.equal(h.dom.document.activeElement === titolo, true, 'il bottone non ruba il fuoco');
});
test('K4-p10 il tasto destro non prende il divisore; un secondo puntatore non lo muove', async () => {
  const h = runtime(); h.apri(); geometriaOccViva(h); await bottoneOcc(h);
  const d = divOcc(h); d.setPointerCapture = () => {};
  presa(h, 280, 1, 2);
  d.listeners.pointermove({ clientY: 400, pointerId: 1 });
  d.listeners.pointerup({ pointerId: 1 });
  assert.equal(valoreOcc(h), '30', 'tasto destro: niente'); assert.equal(regolato(h), false);
  presa(h, 280, 1);
  d.listeners.pointermove({ clientY: 400, pointerId: 2 });   // un altro dito/puntatore
  assert.equal(valoreOcc(h), '30', 'un altro puntatore: niente');
  d.listeners.pointermove({ clientY: 160, pointerId: 2 });
  d.listeners.pointerup({ pointerId: 1 });
  assert.equal(occAperte(h), true, 'il secondo puntatore non chiude');
});
test('K4-p10 CSS: il divisore si vede solo sopra i 900 px, non prende posto, e sul tocco non scorre la pagina; schiarito e senza selezione durante la presa', () => {
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8');
  const inizio = css.indexOf('@media (min-width: 901px) {', css.indexOf('IL DIVISORE DELLE OCCORRENZE'));
  const blocco = css.slice(inizio, css.indexOf('\n}', inizio));
  const i = css.indexOf('.mrv-occ-divisore:not([hidden]) { display: block;');
  assert.ok(inizio > 0 && blocco.includes('.mrv-occ-divisore:not([hidden]) { display: block;'), 'la regola che lo mostra sta nel blocco @media (min-width: 901px)');
  const regola = css.slice(i, css.indexOf('}', i));
  assert.match(regola, /touch-action: none/);
  assert.match(regola, /margin: -6px 0/);
  assert.match(css, /#mrv-occurrences-host\.sta-chiudendo \{ opacity: \.35; \}/);
  assert.match(css, /\.mrv-carte\.is-trascinando-occ \{ user-select: none;/);
});
test('K4-p10 chiuso trascinando col fuoco in un campo della SCHEDA (dentro l’area dei materiali, fuori dal pannello): il fuoco resta nel campo', async () => {
  const h = runtime(); h.apri(); geometriaOccViva(h); await bottoneOcc(h);
  const el = entra(campo(h, 'question'));
  trascinaOcc(h, 280, [200, 150]);
  assert.equal(occAperte(h), false);
  assert.equal(h.dom.document.activeElement === el, true, 'il bottone non ruba il fuoco al campo in cui si scrive');
});
test('K4-p10 ↑ da tastiera conta dal valore che il divisore annuncia (arrotondato): da 20,4% annunciato «20», ↑ porta al 15 e chiude', async () => {
  const h = runtime(); h.apri(); geometriaOccViva(h, 122.4); await bottoneOcc(h);
  assert.equal(valoreOcc(h), '20');
  tastoOcc(h, 'ArrowUp');
  assert.equal(occAperte(h), false, 'annunciato 20, un passo di 5 punti porta al 15%: si chiude');
});
test('K4-p10 una presa diventa trascinamento oltre 3 px (come il divisore della Fonte): 6 px spostano il confine', async () => {
  const h = runtime(); h.apri(); geometriaOccViva(h); await bottoneOcc(h);
  trascinaOcc(h, 280, 286);   // 6 px: 31%
  assert.equal(valoreOcc(h), '31'); assert.equal(regolato(h), true);
});
test('K4-p10 aria-valuemax dice il tetto (75), coerente col valore massimo raggiungibile', async () => {
  const h = runtime(); h.apri(); geometriaOccViva(h); await bottoneOcc(h);
  assert.equal(divOcc(h).getAttribute('aria-valuemax'), '75');
  assert.equal(divOcc(h).getAttribute('aria-valuemin'), '0');
});
test('K4-p10 il divisore dice che cosa governa (aria-controls) e ha il fumetto col nome, come quello della Fonte', async () => {
  const h = runtime(); h.apri(); geometriaOccViva(h); await bottoneOcc(h);
  assert.equal(divOcc(h).getAttribute('aria-controls'), 'mrv-occurrences-host');
  assert.equal(divOcc(h).getAttribute('title'), divOcc(h).getAttribute('aria-label'));
});
test('K4-p10 CSS: col fuoco da tastiera il divisore si vede (contorno), come quello della Fonte', () => {
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8');
  assert.match(css, /\.mrv-veste \.mrv-occ-divisore:focus-visible \{ outline: 3px solid/);
});

/* ═══ 0074, F10 (06/10): il chip del divisore delle occorrenze ═══════════════════════════════════════════════════ */
test('0074 F10 CSS: il divisore delle occorrenze porta una maniglia sempre visibile, verde come la linguetta, solo CSS e solo sotto la veste', () => {
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8');
  const m = css.match(/#mappai-teacher-review\.mrv-veste \.mrv-occ-divisore::after \{([^}]*)\}/);
  assert.ok(m, 'la regola della maniglia c’è, sotto .mrv-veste');
  const r = m[1];
  assert.match(r, /content: ''/, 'un disegno, non un’icona');
  assert.match(r, /var\(--mm-ok, #059669\)/, 'il verde della linguetta (3,77:1 sul bianco)');
  assert.match(r, /pointer-events: none/, 'non ruba la presa al divisore');
  assert.match(r, /left: 50%/, 'al centro');
  assert.doesNotMatch(r, /opacity: 0|display: none|visibility: hidden/, 'sempre visibile, non solo al passaggio');
});
test('0074 F10 CSS: lo stesso chip verde sul divisore verticale della Fonte, solo sotto la veste e solo a Fonte aperta (chiusa resta la linguetta)', () => {
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8');
  const m = css.match(/#mappai-teacher-review\.mrv-veste \.mrv-colonne:not\(\.is-fonte-chiusa\) \.mrv-divisore::after \{([^}]*)\}/);
  assert.ok(m, 'la regola c’è, sotto .mrv-veste e fuori dalla linguetta');
  const r = m[1];
  assert.match(r, /var\(--mm-ok, #059669\)/, 'verde come quello orizzontale');
  assert.match(r, /width: 10px; height: 40px/, 'lo stesso chip, girato');
  assert.match(r, /linear-gradient\(#fff, #fff\)[^,]*, linear-gradient\(#fff, #fff\)/, 'le due righe bianche');
  assert.doesNotMatch(r, /animation: none/, 'la scossa del 17/9 resta');
  const base = fs.readFileSync(require.resolve('../public/css/style.css'), 'utf8');
  assert.match(base, /\.mrv-colonne\.is-fonte-chiusa \.mrv-divisore::after \{ display: none; \}/, 'chiusa la Fonte il chip non c’è');
});
test('0074 F10 CSS: la scossa del chip verde è più piccola (±2 px invece di ±4), due volte come prima, e ferma con «riduci movimento»', () => {
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8');
  assert.match(css, /@keyframes mrv-chip-scossa \{ 0%, 100% \{ translate: 0 0; \} 25% \{ translate: -2px 0; \} 75% \{ translate: 2px 0; \} \}/, 'ampiezza 2 px');
  const m = css.match(/#mappai-teacher-review\.mrv-veste \.mrv-colonne:not\(\.is-fonte-chiusa\) \.mrv-divisore::after \{([^}]*)\}/);
  assert.ok(m && /animation: mrv-chip-scossa \.45s ease-in-out \.8s 2;/.test(m[1]), 'il chip verde usa la scossa piccola, coi tempi di prima');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.mrv-veste \.mrv-colonne:not\(\.is-fonte-chiusa\) \.mrv-divisore::after \{ animation: none; \}/, 'con «riduci movimento» non si scuote');
});

/* ═══ 0075, punto 12: la nota del controllo va a capo (Giacomo, gate 3 dello 0080) ═══════════════════════════════ */
test('0075 p12 CSS: lo stile del contatore «N note» della barra (una riga, grassetto) non tocca il contenitore delle note sopra il campo, che ha la stessa classe', () => {
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8');
  const regole = css.split('\n').filter(r => /\.mrv-veste-note(?![-\w])/.test(r) && !/^\s*(\/\*|\*)/.test(r));
  assert.ok(regole.length >= 1, 'la regola del contatore c’è');
  for (const r of regole) {
    const selettore = r.slice(0, r.indexOf('{'));
    assert.match(selettore, /span\.mrv-veste-note(?![-\w])/, 'solo lo span del contatore: ' + selettore.trim());
  }
  const veste = fs.readFileSync(require.resolve('../public/js/mappai-banco-veste.js'), 'utf8');
  assert.match(veste, /<span class="mrv-veste-note">/, 'il contatore è uno span');
  assert.match(veste, /<div class="mrv-veste-note" data-veste-note-di=/, 'il contenitore delle note è un div');
});

/* ═══ 0075 — LA VESTE IN G1 (ADR 0012 rev. 3 p. 5-6, rev. 4 A e B, rev. 5 B e C, rev. 6 A, B e D; ADR 0010 rev. 1; Q1-Q6) ═══
   La «Revisione pre-materiali» con la veste di G2: una barra per nodo, una scheda per nodo con le note sopra il campo,
   il salvataggio automatico, ⌘Z del Banco, la Fonte che segue la riga, la chiusura nel piede. La mappa della prova ha
   un nodo con tre note (una con passo individuato dalla proposta, una in modo 'nodo', una seconda proposta su un'altra
   frase), un nodo con una nota sola, un collegamento con la nota «togli il collegamento» ($link), un nodo e un
   collegamento non letti dal controllo. */
const G1_A = 'Lo Stato svizzero fu accusato di aver accettato oro. Le banche custodivano i depositi.';
const G1_A1 = 'Le banche svizzere furono accusate di aver accettato oro. Le banche custodivano i depositi.';
const G1_A3 = 'Lo Stato svizzero fu accusato di aver accettato oro. Le banche nascondevano i depositi.';
const DB1 = { nodes: [
  { id: 'R', label: 'Svizzera', desc: 'La Svizzera nella guerra.', level: 0, group: 0 },
  { id: 'A', label: 'Accuse', desc: G1_A, level: 1, group: 1 },
  { id: 'B', label: 'Banche', desc: 'Le banche custodivano oro tedesco.', level: 2, group: 1 },
  { id: 'C', label: 'Commercio', desc: 'Il commercio continuò.', level: 1, group: 2 },
  { id: 'D', label: 'Dogane', desc: 'Le dogane controllavano i treni.', level: 2, group: 2 },
  { id: 'E', label: 'Esercito', desc: 'L’esercito si ritirò nel Ridotto.', level: 1, group: 3 }],
  links: [{ source: 'R', target: 'A', rel: 'include' }, { source: 'A', target: 'B', rel: 'causa' }, { source: 'C', target: 'D', rel: 'precede' }, { source: 'R', target: 'E', rel: 'include' }],
  sourcesDict: {} };
// la terza frase non sta nella mappa: lo strato (0041) la dà vicina al nodo E, che nessuna nota segnala («Correggi il nodo vicino»)
const SOURCES1 = [{ nome: 'Libro.pdf', pages: [{ n: 4, text: 'Le banche svizzere furono accusate di aver accettato oro. Le banche custodivano i depositi. Nel 1940 l’esercito svizzero si ritirò nel Ridotto alpino con il generale Guisan.' }] }];
const LINK_AB = JSON.stringify(['A', 'B', 'causa']), LINK_CD = JSON.stringify(['C', 'D', 'precede']);
function rapportoG1(extra) {
  const nota = (id, x) => Object.assign({ target: { kind: 'node', id: 'A', field: 'desc' } }, x, { id });
  return Object.assign({ contratto: 'mappai-giudice@2', stato: 'parziale', issues: [
    nota('a1', { after: G1_A1, problem: 'Non fu lo Stato: furono le banche.', quote: 'furono accusate di aver accettato oro',
      evidence: [{ source: 'Libro.pdf', page: 4, text: 'Le banche svizzere furono accusate di aver accettato oro.' }, { source: 'Libro.pdf', page: 4, text: 'Le banche custodivano i depositi.' }] }),
    nota('a2', { problem: 'Il nodo semplifica troppo' }),
    nota('a3', { after: G1_A3, problem: 'Il verbo non è quello della fonte.' }),
    { id: 'b1', target: { kind: 'node', id: 'B', field: 'desc' }, problem: 'Frase dubbia.' },
    { id: 'l1', target: { kind: 'link', source: 'A', target: 'B', rel: 'causa', field: '$link' }, after: null, problem: 'Nesso non sostenuto dalla fonte.' }],
    copertura: { nodiEsaminati: ['R', 'A', 'B', 'D', 'E'], linkEsaminati: [{ source: 'A', target: 'B', rel: 'causa' }],
      nodiSaltati: [{ id: 'C', label: 'Commercio', motivo: 'risposta interrotta prima di questo nodo' }],
      linkSaltati: [{ source: 'C', target: 'D', rel: 'precede', motivo: 'risposta interrotta' }] } }, extra || {});
}
function g1Manifest(report, config) {
  const m = Pipeline.createManifest(config || {}, { vaultPath: '/vault' }); m.steps.A.status = 'done';
  m.review = Core.createReview({ db: DB1, sources: SOURCES1, report: report || rapportoG1() });
  return m;
}
function runtime1(opts = {}) {
  const h = runtime(Object.assign({ db: DB1 }, opts, { manifest: opts.manifest || g1Manifest(opts.report, opts.config) }));
  h.window.MappAIRelations = require('../public/js/mappai-relations.js');   // la fonte unica dei verbi (regola 12)
  // l'editor dei collegamenti della mappa (packet 0022), come in index.html; `opts.senzaEditorCollegamenti` lo toglie
  if (!opts.senzaEditorCollegamenti) h.window.MappAILinkEditorCore = require('../public/js/mappai-link-editor-core.js');
  h.rev = () => h.m.review; h.apri1 = () => h.apri({});
  return h;
}
const righe1 = h => qa(h, '[data-veste-riga]');
const rigaG1 = (h, id) => righe1(h).find(b => b.getAttribute('data-veste-riga') === id) || null;
async function vaiA1(h, id) { await rigaG1(h, id).click(); await tick(); }
const dec1 = (h, id) => (h.rev().initial.decisions[id] || {}).choice || 'pending';
const esito1 = (h, id) => Core.decisionOutcome(h.rev().initial.issues.find(i => i.id === id), h.rev().initial.decisions[id]);
const docenti1 = h => h.rev().initial.issues.filter(i => i.origin === 'teacher');
const campiScheda = h => qa(h, '[data-veste-scheda] [data-veste-input]').map(x => x.getAttribute('data-veste-input'));
function decidiTutto(m) {
  m.review = Core.setDecision(m.review, 'a1', 'accept');
  ['a2', 'a3', 'b1', 'l1'].forEach(id => { m.review = Core.setDecision(m.review, id, 'reject'); });
  return m;
}
// lo strato delle affermazioni vero (packet 0042), caricato nel contesto del Banco come in tests/review-controller.test.js
function conStrato1(h) {
  h.window.MappAIAffermazioniCore = require('../public/js/mappai-affermazioni-core');
  for (const f of ['mappai-affermazioni.js', 'mappai-affermazioni-ui.js']) vm.runInContext(fs.readFileSync(require.resolve('../public/js/' + f), 'utf8'), h.ctx);
  return h;
}
const STRATO = { mappai_affermazioni: '1', mappai_quarantena: '1' };

/* ── gruppo «veste G1»: interruttore, barra, scheda, salvataggio, regola per passo, ⌘Z ── */
test('0075 p1: con l’interruttore la veste vive anche in G1; spento (o senza il Banco) G1 è quella di oggi, byte per byte', () => {
  const html = o => { const h = runtime1(o); h.apri1(); return h.dom.html(); };
  const oggi = html({ senzaVeste: true });
  // packet 0089 (ADR 0020): l'interruttore assente vale acceso; spento solo col '0' (inv. 1)
  assert.notEqual(html({ flag: null }), oggi, 'l’interruttore assente accende la veste');
  assert.equal(html({ flag: null }), html({}), 'l’interruttore assente è come \'1\'');
  assert.equal(html({ flag: '0' }), oggi);
  assert.ok(oggi.includes('mrv-other-nodes') && oggi.includes('data-review-filter'), 'G1 di oggi: «Correggi anche un nodo non segnalato» e i filtri delle segnalazioni');
  const h = runtime1(); h.apri1();
  assert.ok(h.modal.className.includes('mrv-veste'));
  assert.ok(h.modal.className.includes('mrv-veste-g1'), 'il regime si legge sul modale');
  assert.ok(!h.dom.html().includes('data-review-filter'));
  assert.ok(!q(h, '#mrv-other-nodes'), 'con la veste «Correggi anche un nodo non segnalato» non c’è (rev. 4, B.2)');
  assert.equal(qa(h, '.mrv-card').length, 0);
  assert.equal(h.calls.manifest, 0, 'aprire non scrive niente');
  const spento = runtime1({ storage: { mappai_revisione_banco: '0' } }); spento.apri1();
  assert.ok(!spento.modal.className.includes('mrv-veste'));
});

test('0075 p2: la barra per nodo in tre gruppi coi conteggi — Nodi, Collegamenti, «Non letti dal controllo» in fondo col cerchio vuoto; ogni riga stato, numero, titolo, note', () => {
  const h = runtime1(); h.apri1();
  // sesto giro, Q11: i non letti in due gruppi, nodi e collegamenti
  assert.deepEqual(qa(h, '[data-veste-gruppo]').map(g => g.textContent), ['Nodi segnalati · 2 di 2', 'Collegamenti segnalati · 1 di 1', 'Nodi non letti dal controllo · 1', 'Collegamenti non letti dal controllo · 1']);
  assert.deepEqual(righe1(h).map(b => b.getAttribute('data-veste-riga') + '=' + b.getAttribute('data-stato')),
    ['A=da-rivedere', 'B=da-rivedere', LINK_AB + '=da-rivedere', 'C=non-letto', LINK_CD + '=non-letto']);
  assert.deepEqual(righe1(h).map(b => b.querySelector('.mrv-veste-num').textContent), ['1', '2', '3', '4', '5']);
  assert.deepEqual(righe1(h).map(b => b.querySelector('.mrv-veste-titolo').textContent), ['Accuse', 'Banche', 'Accuse → Banche', 'Commercio', 'Commercio → Dogane']);
  assert.equal(rigaG1(h, 'A').querySelector('span.mrv-veste-note').textContent, '3 note');
  assert.equal(rigaG1(h, 'B').querySelector('span.mrv-veste-note').textContent, '1 nota');
  assert.ok(!!rigaG1(h, 'A').querySelector('.mrv-pallino'));
  assert.ok(!!rigaG1(h, 'C').querySelector('.mrv-veste-cerchio'), 'il non letto ha il cerchio vuoto');
  assert.ok(!rigaG1(h, 'C').querySelector('.mrv-pallino'));
  assert.equal(scheda(h), 'A', 'si apre sulla prima da decidere');
  assert.equal(rigaG1(h, 'A').getAttribute('aria-current'), 'true');
  assert.deepEqual(qa(h, '#mrv-filters button').map(b => b.textContent), ['Da rivedere 3', 'Fatti 0', 'Tutti 5']);
  assert.equal(q(h, '#mrv-progress-label').textContent, '0 / 3 decisi');
  assert.equal(q(h, '#mrv-veste-riepilogo').textContent, '6 nodi · 3 segnalati · 2 parti non lette dal controllo');
  // filtri, ricerca e Macroarea come in G2
  q(h, '[data-veste-filtro="fatti"]').onclick();
  assert.equal(righe1(h).length, 0);
  q(h, '[data-veste-filtro="tutti"]').onclick();
  assert.equal(righe1(h).length, 5);
  const cerca = q(h, '#mrv-search'); cerca.value = 'dogane'; cerca.oninput();
  assert.deepEqual(righe1(h).map(b => b.getAttribute('data-veste-riga')), [LINK_CD]);
  cerca.value = ''; cerca.oninput();
  const area = q(h, '#mrv-area');
  assert.ok(area.querySelectorAll('option').map(o => o.textContent).includes('Accuse'));
  area.value = '1'; area.onchange();
  assert.deepEqual(righe1(h).map(b => b.getAttribute('data-veste-riga')), ['A', 'B', LINK_AB]);
  assert.equal(scheda(h), 'A', 'i filtri non toccano la scheda');
});

test('0075 p3: la scheda per nodo — titolo e descrizione col testo come risulta dalle decisioni (testoAdesso), le note SOPRA il campo, la decisa ridotta all’esito; «Prima / Proposta» come in G2', () => {
  const m = g1Manifest(); m.review = Core.setDecision(m.review, 'a1', 'accept');
  const h = runtime1({ manifest: m }); h.apri1();
  assert.equal(scheda(h), 'A');
  assert.equal(q(h, '#mrv-current-title').textContent, '1 · Nodo · Accuse');
  assert.deepEqual(campiScheda(h), ['label', 'desc']);
  assert.equal(q(h, '[data-veste-campo="label"] .mrv-veste-etichetta').textContent, 'Titolo');
  assert.equal(q(h, '[data-veste-campo="desc"] .mrv-veste-etichetta').textContent, 'Descrizione');
  assert.equal(campo(h, 'label').value, 'Accuse');
  assert.equal(campo(h, 'desc').value, G1_A1, 'il testo con la proposta già scelta');
  for (const id of ['a1', 'a2', 'a3']) assert.ok(!!q(h, '[data-veste-campo="desc"] [data-veste-nota="' + id + '"]'), id + ' sopra la descrizione');
  const html = h.dom.html();
  assert.ok(html.indexOf('data-veste-nota="a3"') < html.indexOf('data-veste-input="desc"'), 'le note stanno sopra il campo');
  const a1 = q(h, '[data-veste-nota="a1"]');
  assert.equal(a1.getAttribute('data-esito'), 'applied');
  assert.equal(a1.querySelector('[data-veste-esito]').textContent, 'Proposta scelta');
  /* 0086, giro 3b (D36): le note del controllo non hanno più gesti — la decisa è la riga con l'esito, senza spunta; le
     aperte hanno la spunta (a2 contesta la descrizione intera: vuota, D39) e la proposta di a3 nella sua area. Il testo è
     la proposta scelta di a1: il campo si chiama «Proposta» (D37.6, la regola unica dei nomi). Prima: i bottoni di a2 e a3
     e l'area di sotto «Tua versione». */
  assert.equal(a1.querySelectorAll('button').length, 0, 'la decisa non ha gesti');
  assert.equal(!!a1.querySelector('[data-veste-spunta]') && !a1.querySelector('[data-veste-spunta-etichetta]').hidden, false, 'né la spunta');
  assert.equal(q(h, '[data-veste-spunta-etichetta="a2"]').hidden, false);
  assert.equal(q(h, '[data-veste-spunta="a2"]').checked, false);
  assert.equal(q(h, '[data-veste-spunta-etichetta="a3"] [data-veste-spunta-nome]').textContent, 'Tieni la frase');
  assert.equal(q(h, '[data-veste-nota="a3"] [data-veste-nota-proposta]').hidden, false);
  assert.equal(qa(h, '[data-veste-nota] button').length, 0, 'nessun bottone nelle note');
  assert.equal(q(h, '[data-veste-campo="desc"] [data-veste-seg]').hidden, false, 'il selettore «Differenze / Testi»');
  assert.equal(q(h, '[data-veste-campo="desc"] [data-veste-prima-nome]').textContent, 'Originale');
  assert.equal(q(h, '[data-veste-campo="desc"] [data-veste-proposta-nome]').textContent, 'Proposta');
  // la scheda non porta i pezzi di prima: niente «Fonte e motivo», «Leggi il testo completo», «Passaggio da confrontare» (B.6)
  for (const s of ['[data-evidence-excerpt]', '[data-full-change]', '[data-review-choice]', '.mrv-evidence-preview']) assert.ok(!q(h, s), s);
  assert.ok(!html.includes('Fonte e motivo della segnalazione'));
});

test('0075 p4/p5 (0086 g3b, D37.1; g3d, D41): niente si scrive a battuta né all’uscita — il campo è una bozza fino al bottone in fondo; nessuna nota si chiude, nemmeno quella col passo cambiato', async () => {
  const h = runtime1(); h.apri1();
  const F = 'Le banche furono accusate. Le banche custodivano i depositi.';
  const el = entra(campo(h, 'desc'));
  el.onblur(); await tick();
  assert.equal(h.calls.manifest, 0, 'entrare e uscire senza cambiare non decide');
  entra(el); el.value = F; el.oninput(); el.value = F + ' '; el.oninput(); el.value = F; el.oninput();
  await tick(); await tick();
  assert.equal(h.calls.manifest, 0, 'mai a battuta');
  assert.equal(dec1(h, 'a1'), 'pending');
  el.onblur(); await tick();
  // 0086, giro 3d (D41): prima una scrittura all'uscita (la correzione del docente, giro 3b); ora la bozza resta nel campo
  assert.equal(h.calls.manifest, 0, 'niente all’uscita');
  assert.equal(campo(h, 'desc').value, F, 'la bozza resta nel campo');
  assert.deepEqual(['a1', 'a2', 'a3'].map(id => esito1(h, id)), ['pending', 'pending', 'pending']);
  assert.equal(docenti1(h).length, 0, 'nessuna correzione prima del bottone');
  assert.equal(!!q(h, '[data-veste-chiuse]'), false, 'nessuna nota chiusa da dire');
  assert.equal(rigaG1(h, 'A').querySelector('span.mrv-veste-note').textContent, '3 note');
});

test('0075 p4 (0086 g3b, D37.1; g3d, D41): nemmeno la nota sola si chiude prima del bottone, e la correzione resta una bozza della seduta; «Proposta scelta» ritoccata → «Testo modificato da te» al bottone', async () => {
  const h = runtime1(); h.apri1();
  await vaiA1(h, 'B');
  await scrivi(h, 'desc', 'Le banche custodivano oro.');
  // 0086, giro 3b: prima la nota sola si chiudeva con la correzione; giro 3d (D41): la correzione non si salva più all'uscita
  assert.equal(esito1(h, 'b1'), 'pending', 'la nota sola resta aperta');
  assert.equal(rigaG1(h, 'B').getAttribute('data-stato'), 'da-rivedere');
  assert.equal(docenti1(h).length, 0, 'niente salvato');
  await vaiA1(h, 'A');
  // il campo parte dall'«Originale» (§4.3): la proposta di a1 non è più scritta nel campo
  assert.equal(campo(h, 'desc').value, G1_A);
  await scrivi(h, 'desc', G1_A + ' Le accuse arrivarono dopo la guerra.');
  assert.deepEqual(['a1', 'a2', 'a3'].map(id => esito1(h, id)), ['pending', 'pending', 'pending']);
  assert.equal(docenti1(h).length, 0);
  await vaiA1(h, 'B');
  assert.equal(campo(h, 'desc').value, 'Le banche custodivano oro.', 'la bozza di B è ancora lì');
  // con le due proposte tenute (seduta di prima)
  const mk = g1Manifest(); ['a1', 'a3'].forEach(id => { mk.review = Core.setDecision(mk.review, id, 'reject'); });
  const k = runtime1({ manifest: mk }); k.apri1(); await vaiA1(k, 'A');
  assert.equal(campo(k, 'desc').value, G1_A);
  await scrivi(k, 'desc', G1_A + ' Le accuse arrivarono dopo la guerra.');
  assert.deepEqual(['a1', 'a2', 'a3'].map(id => esito1(k, id)), ['kept', 'pending', 'kept']);
  assert.equal(docenti1(k).length, 0);
  assert.equal(!!q(k, '[data-veste-chiuse]'), false, 'nessuna frase sulle note chiuse');
  // «Proposta scelta» ritoccata: il bottone (messa la spunta della descrizione intera, a2) registra il ritocco
  const m = g1Manifest(); m.review = Core.setDecision(m.review, 'a1', 'accept');
  const g = runtime1({ manifest: m }); g.apri1();
  await scrivi(g, 'desc', G1_A1.replace('accettato oro', 'accettato oro tedesco'));
  assert.equal(esito1(g, 'a1'), 'applied', 'prima del bottone niente cambia');
  await cambiaG(g, 'a2', true); await premiG(g);
  assert.equal(g.calls.manifest, 1);
  assert.equal(esito1(g, 'a1'), 'edited');
  await vaiA1(g, 'A');
  assert.equal(q(g, '[data-veste-nota="a1"] [data-veste-esito]').textContent, 'Testo modificato da te');
  assert.equal(esito1(g, 'a3'), 'kept', 'a3, con la spunta piena, entra com’è');
});

test('0075 p4 (0086 g3b, D19): il bottone in fondo decide le note del nodo — il nodo non ha più note aperte e la scheda passa al successivo', async () => {
  const h = runtime1(); h.apri1();
  await vaiA1(h, 'B');
  // 0086, giro 3b: prima il gesto era il bottone della nota; b1 contesta tutta la descrizione, quindi la sua spunta parte
  // vuota (D39) e il bottone in fondo si accende quando la si mette
  const casella = q(h, '[data-veste-spunta="b1"]'); casella.checked = true; casella.onchange();
  await bottone(h).click(); await tick(); await tick();
  assert.equal(dec1(h, 'b1'), 'reject');
  assert.equal(scheda(h), LINK_AB, 'B non ha più note aperte: si apre la riga dopo da decidere');
});

test('0075 p5: ⌘Z del Banco annulla l’ultima azione salvata e NON la mappa sotto il Banco (mappai-undo.js vero); con battitura non salvata la scarta come Esc', async () => {
  // 0086 g3d (D41): le note di A già decise, perché il campo si salvi all'uscita (con note aperte è una bozza fino al bottone)
  const h = runtime1({ manifest: decidiTutto(g1Manifest()) }); h.apri1();
  q(h, '[data-veste-filtro="tutti"]').onclick(); await vaiA1(h, 'A');
  await scrivi(h, 'desc', 'Le banche furono accusate. Le banche custodivano i depositi.');
  // 0086, giro 3b (D37.1): la scrittura è la correzione del docente (prima chiudeva a1, «manual»)
  assert.equal(docenti1(h).length, 1);
  const mappa = mappaConUndo();
  const ev = fuoriDalModale(h, CMD_Z, { documento: mappa.documento }); await tick(); await tick();
  assert.equal(ev.prevented, true); assert.equal(ev.stopped, true, 'il tasto è del Banco');
  assert.equal(docenti1(h).length, 0, 'la scrittura del Banco è tolta');
  assert.equal(mappa.ctx.undoStack.length, 1, 'la pila della mappa è intatta: undoLastAction non è partito');
  assert.equal(mappa.ctx.appState.db.nodes.length, 0, 'la mappa non è tornata indietro');
  assert.match(q(h, '#mrv-status').textContent, /Annullato: la correzione di «Descrizione» su Accuse/);
  // ⇧⌘Z la rimette
  fuoriDalModale(h, CMD_SHIFT_Z, { documento: mappa.documento }); await tick(); await tick();
  assert.equal(docenti1(h).length, 1);
  // una battitura non salvata: il bottone «⌘+Z» la scarta, come Esc, senza scrivere
  const scritte = h.calls.manifest;
  const el = entra(campo(h, 'label')); el.value = 'Accuse alle banche'; el.oninput();
  await q(h, '#mrv-veste-annulla').click(); await tick();
  assert.equal(campo(h, 'label').value, 'Accuse');
  assert.equal(h.calls.manifest, scritte);
  // Esc dentro un campo rimette il salvato
  entra(campo(h, 'label')); campo(h, 'label').value = 'Accuse!'; campo(h, 'label').oninput();
  assert.equal(tasto(h, { key: 'Escape' }), true);
  assert.equal(campo(h, 'label').value, 'Accuse');
  assert.equal(h.calls.manifest, scritte);
});

/* ── gruppo «non letti e fuori elenco» ── */
test('0075 p6: un non letto — una scheda con un campo solo e la riga «Il controllo non ha letto…»; la segnalazione del docente nasce al salvataggio di un testo cambiato', async () => {
  const h = runtime1(); h.apri1();
  await vaiA1(h, 'C');
  assert.equal(scheda(h), 'C');
  assert.equal(q(h, '#mrv-current-title').textContent, '4 · Nodo non letto dal controllo · Commercio');
  assert.deepEqual(campiScheda(h), ['desc']);
  assert.match(q(h, '[data-veste-non-letto]').textContent, /^Il controllo non ha letto questa descrizione/);
  const el = entra(campo(h, 'desc')); el.onblur(); await tick();
  assert.equal(h.calls.manifest, 0);
  await scrivi(h, 'desc', 'Il commercio con la Germania continuò.');
  const doc = docenti1(h);
  assert.equal(doc.length, 1); assert.equal(doc[0].target.id, 'C'); assert.equal(esito1(h, doc[0].id), 'edited');
  assert.equal(rigaG1(h, 'C').getAttribute('data-stato'), 'fatto', 'resta nel suo gruppo, corretto');
  assert.deepEqual(qa(h, '[data-veste-gruppo]').map(g => g.textContent)[2], 'Nodi non letti dal controllo · 1');
  await vaiA1(h, LINK_CD);
  assert.deepEqual(campiScheda(h), ['rel']);
  assert.match(q(h, '[data-veste-non-letto]').textContent, /^Il controllo non ha letto questo collegamento/);
});

test('0075 p7: «Correggi il nodo vicino» dello strato apre la scheda del nodo anche fuori elenco (Q1); la correzione salvata fa nascere la segnalazione del docente e la riga', async () => {
  const h = conStrato1(runtime1({ storage: Object.assign({ mappai_frasi_orfane: '1' }, STRATO) })); h.apri1();
  const correggi = () => q(h, '#mrv-coverage-options [data-aff-orf-correggi="E"]');
  assert.ok(!!correggi(), '«Correggi il nodo vicino» per la frase della fonte vicina a E');
  await correggi().click(); await tick(); await tick();
  assert.equal(scheda(h), 'E');
  assert.ok(!rigaG1(h, 'E'), 'nessuna riga in barra: è fuori elenco');
  assert.match(q(h, '#mrv-current-title').textContent, /Esercito/);
  assert.deepEqual(campiScheda(h), ['label', 'desc']);
  await scrivi(h, 'desc', 'L’esercito si ritirò nel Ridotto alpino.');
  const doc = docenti1(h);
  assert.equal(doc.length, 1); assert.equal(doc[0].target.id, 'E');
  assert.ok(!!rigaG1(h, 'E'), 'ora il nodo ha la sua riga');
  assert.equal(rigaG1(h, 'E').getAttribute('data-stato'), 'fatto');
  assert.ok(!q(h, '#mrv-other-nodes'), 'il riquadro di prima non c’è e non serve');
});

/* ── gruppo «collegamenti» ── */
test('0075 p8: il collegamento — «Dal concetto → Al concetto» come testo; il campo delle parole coi suggerimenti della famiglia e «Nessuna» per prima; la nota $link con la spunta «Tieni il collegamento» (0086 g3c)', async () => {
  const h = runtime1(); h.apri1();
  await vaiA1(h, LINK_AB);
  assert.equal(q(h, '#mrv-current-title').textContent, '3 · Collegamento · Accuse');
  assert.equal(q(h, '[data-veste-collegamento]').textContent, 'Accuse → Banche');
  assert.deepEqual(campiScheda(h), ['rel'], 'solo le parole: estremi alla mappa («Cambia Link»)');
  assert.equal(q(h, '[data-veste-campo="rel"] .mrv-veste-etichetta').textContent, 'Parole del collegamento');
  assert.equal(campo(h, 'rel').value, 'causa');
  const Rel = require('../public/js/mappai-relations.js');
  const parole = qa(h, '[data-veste-suggerimenti] button').map(b => b.textContent);
  assert.equal(parole[0], 'Nessuna');
  assert.deepEqual(parole.slice(1), Rel.EDGE_FAMILIES[Rel.getEdgeFamilyKey('causa')].keywords);
  const nota = q(h, '[data-veste-campo="rel"] [data-veste-nota="l1"]');
  assert.ok(!!nota, 'la nota del giudice sopra il campo');
  // 0086 g3c: la nota sul collegamento ha la spunta «Tieni il collegamento» al posto dei gesti (Q20 cade anche qui)
  assert.equal(nomeSpuntaG(h, 'l1'), 'Tieni il collegamento');
  assert.deepEqual(bottoniNotaG(h, 'l1'), []);
  assert.equal(q(h, '#mrv-veste-risposta').hidden, true);
  // cambia famiglia: i suggerimenti seguono
  const fam = q(h, '[data-veste-famiglia]'); fam.value = 'opposizione'; fam.onchange();
  assert.deepEqual(qa(h, '[data-veste-suggerimenti] button').map(b => b.textContent).slice(1), Rel.EDGE_FAMILIES.opposizione.keywords);
  assert.equal(h.calls.manifest, 0, 'cambiare famiglia non scrive');
});

test('0075 p8 (0086 g3d, D41): le parole sono una bozza fino al bottone in fondo, che le registra come correzione del docente (la nota dell’editor della mappa, D4) e decide la nota «togli il collegamento»; il campo vuoto senza «Nessuna» lo dice e non si registra; «Nessuna» sì', async () => {
  const h = runtime1(); h.apri1();
  await vaiA1(h, LINK_AB);
  await scrivi(h, 'rel', 'genera');
  // 0086 g3d (D41): prima la correzione si salvava all'uscita e la nota l1 restava aperta (Q3); ora niente si salva prima del bottone
  assert.equal(h.calls.manifest, 0);
  assert.equal(docenti1(h).length, 0);
  assert.equal(dec1(h, 'l1'), 'pending');
  assert.equal(rigaG1(h, LINK_AB).getAttribute('data-stato'), 'da-rivedere');
  // vuoto senza «Nessuna»: lo dice all'uscita, niente si scrive, e il bottone non lo registra
  const el = entra(campo(h, 'rel')); el.value = '   '; el.oninput(); el.onblur(); await tick();
  assert.equal(h.calls.manifest, 0);
  assert.match(q(h, '#mrv-status').textContent, /Nessuna/);
  await premiG(h);
  assert.equal(h.calls.manifest, 0, 'il bottone non registra parole vuote');
  assert.equal(tasto(h, { key: 'Escape' }), true);
  assert.equal(campo(h, 'rel').value, 'causa', 'Esc: l’ultimo testo registrato');
  // un suggerimento e «Nessuna»: gesti nel campo, restano nella bozza
  const produce = qa(h, '[data-veste-suggerimenti] button').find(b => b.textContent === 'produce');
  await produce.click(); await tick();
  assert.equal(campo(h, 'rel').value, 'produce');
  await qa(h, '[data-veste-suggerimenti] button')[0].click(); await tick();
  assert.equal(campo(h, 'rel').value, '');
  assert.equal(h.calls.manifest, 0);
  await premiG(h);
  assert.equal(h.calls.manifest, 1, 'una scrittura');
  const doc = docenti1(h);
  assert.equal(doc.length, 1);
  assert.ok(doc[0].id.startsWith('teacher-link-label-'), 'la nota dell’editor della mappa (D4): ' + doc[0].id);
  const d = h.rev().initial.decisions[doc[0].id];
  assert.equal(d.text, ''); assert.equal(d.relNone, true);
  assert.equal(dec1(h, 'l1'), 'reject');
  assert.equal(rigaG1(h, LINK_AB).getAttribute('data-stato'), 'fatto');
});

test('0075 p8 (0086 g3c): la spunta «Tieni il collegamento» tolta e il bottone in fondo tolgono il collegamento; la scheda lo dice e il campo si legge e basta; ⌘Z lo rimette', async () => {
  const h = runtime1(); h.apri1();
  await vaiA1(h, LINK_AB);
  await cambiaG(h, 'l1', false); await premiG(h);
  assert.equal(esito1(h, 'l1'), 'excluded');
  // il nodo dopo da decidere si apre (si passa al successivo); si torna sul collegamento
  await vaiA1(h, LINK_AB);
  assert.match(q(h, '[data-veste-avvisi]').textContent, /Hai scelto di togliere questo collegamento/);
  assert.equal(campo(h, 'rel').disabled, true);
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(dec1(h, 'l1'), 'pending');
  assert.equal(scheda(h), LINK_AB);
});

/* ── gruppo «piede, sezione Il controllo, strato» ── */
test('0075 p9: a decisioni finite il piede ha la casella con la frase di chiusura() (parziale, coi numeri), «Riprova il controllo automatico» nella stessa riga e il bottone «…e chiudi»; senza la casella non si chiude', async () => {
  const h = runtime1({ manifest: decidiTutto(g1Manifest()) }); h.apri1();
  const piede = q(h, '#mrv-next-step');
  const casella = piede.querySelector('#mrv-veste-conferma');
  assert.ok(!!casella, 'la casella nel piede');
  // giro 2, Q8: lo stesso conto e le stesse parole della testata («2 parti non lette dal controllo»)
  assert.equal(piede.querySelector('label.mrv-veste-conferma').textContent.trim(),
    'Ho verificato personalmente anche le 2 parti non lette dal controllo (1 nodo, 1 collegamento) e approvo i contenuti.');
  assert.ok(!!piede.querySelector('#mrv-retry-judge'), '«Riprova il controllo automatico» nella stessa riga');
  assert.equal(piede.querySelector('#mrv-retry-judge').textContent, 'Riprova il controllo automatico');
  assert.equal(q(h, '#mrv-continue').hidden, true, 'senza la casella non si chiude');
  assert.equal(q(h, '#mrv-continue').textContent, 'Salva le decisioni e chiudi', 'strada «solo mappa»');
  casella.checked = true; casella.onchange();
  assert.equal(q(h, '#mrv-continue').hidden, false);
  await q(h, '#mrv-continue').click(); await tick(); await tick();
  assert.equal(h.rev().initial.status, 'approved');
  assert.equal(h.rev().initial.manualReview, true);
  // con qualcosa da continuare (materiali chiesti) «…e continua»
  const g = runtime1({ manifest: decidiTutto(g1Manifest(null, { quiz: true })) }); g.apri1();
  assert.equal(q(g, '#mrv-continue').textContent, 'Salva le decisioni e continua');
});

test('0075 p9: prima delle decisioni finite niente casella né «Riprova»; il piede dice quante righe restano; le altre due frasi di chiusura(); con riprovaPuoRiuscire falso «Riprova» e «Nuovo controllo» non ci sono', async () => {
  const h = runtime1(); h.apri1();
  assert.ok(!q(h, '#mrv-veste-conferma')); assert.ok(!q(h, '#mrv-next-step #mrv-retry-judge'));
  assert.match(q(h, '#mrv-next-step').textContent, /Restano 3 fra nodi e collegamenti con note aperte\./);
  // niente letto: saltato prima delle prove (chiave mancante) → Riprova sì
  const niente = runtime1({ report: { contratto: 'mappai-giudice@2', stato: 'saltato', issues: [], motivoSkip: 'nessuna chiave' } }); niente.apri1();
  assert.equal(q(niente, 'label.mrv-veste-conferma').textContent.trim(), 'Il controllo automatico non ha letto la mappa: ho verificato personalmente nodi e collegamenti e approvo i contenuti.');
  assert.ok(!!q(niente, '#mrv-next-step #mrv-retry-judge'));
  assert.ok(!!q(niente, '#mrv-setup-judge'));
  // saltato DOPO aver costruito le prove (oltre il tetto della fonte): riprovare non può riuscire
  const tetto = runtime1({ report: { contratto: 'mappai-giudice@2', stato: 'saltato', issues: [], fonte: { fornita: false } } }); tetto.apri1();
  assert.ok(!!q(tetto, '#mrv-veste-conferma'));
  assert.ok(!q(tetto, '#mrv-retry-judge'), 'niente «Riprova»');
  assert.ok(!q(tetto, '#mrv-setup-judge'), 'niente «Nuovo controllo»');
  // limiti del testo: nessuna parte non letta, pagine vuote nella fonte
  const limiti = runtime1({ report: { contratto: 'mappai-giudice@2', stato: 'parziale', issues: [], fonte: { fornita: true, copertura: { pagineVuote: 2 } },
    copertura: { nodiEsaminati: ['R', 'A', 'B', 'C', 'D', 'E'], linkEsaminati: [], nodiSaltati: [], linkSaltati: [] } } }); limiti.apri1();
  assert.equal(q(limiti, 'label.mrv-veste-conferma').textContent.trim(), 'Ho verificato personalmente i contenuti nei punti in cui il testo estratto dalla fonte ha dei limiti (pagine vuote o ordine incerto) e li approvo.');
});

test('0075 p9: «Riprova il controllo automatico» del piede riprova il controllo della MAPPA (retryJudge): salva prima il campo aperto, svuota le pile di ⌘Z, toglie la spunta e lo dice', async () => {
  const h = runtime1({ manifest: decidiTutto(g1Manifest()) });
  let chiamate = 0;
  h.R.retryJudge = async () => { chiamate++; const r = clone(h.rev()); r.initial.report = Object.assign({}, r.initial.report, { quando: '2026-10-06T22:00:00.000Z' }); h.m.review = r; };
  h.R.retryMaterialJudge = async () => { throw new Error('in G1 non si riprovano i materiali'); };
  h.apri1();
  const casella = q(h, '#mrv-veste-conferma'); casella.checked = true; casella.onchange();
  const el = entra(campo(h, 'label')); el.value = 'Accuse alle banche'; el.oninput();
  await q(h, '#mrv-next-step #mrv-retry-judge').click(); await tick(); await tick();
  assert.equal(chiamate, 1);
  assert.equal(docenti1(h).length, 1, 'la battitura si è salvata prima del controllo');
  assert.equal(q(h, '#mrv-veste-annulla').disabled, true, 'dopo il controllo nuovo la pila riparte vuota');
  assert.equal(q(h, '#mrv-veste-conferma').checked, false);
  assert.match(q(h, '#mrv-status').textContent, /va rimessa la spunta «Ho verificato personalmente…»/);
});

test('0075 p11: «Mostra nella fonte» dello strato riapre la Fonte che si era chiusa da sola (F1) e le passa la frase', async () => {
  const h = conStrato1(runtime1({ storage: STRATO })); const f = fonteContata(h); h.apri1();
  await vaiA1(h, 'B');
  assert.equal(fonteChiusa(h), true, 'B non ha prove: la Fonte si chiude da sola');
  const mostra = q(h, '#mrv-coverage-options [data-aff-fonte]');
  assert.ok(!!mostra, '«Mostra nella fonte» di una frase vicina');
  await mostra.click(); await tick();
  assert.deepEqual(f.chiamate[f.chiamate.length - 1].prove.map(p => p.text), ['Nel 1940 l’esercito svizzero si ritirò nel Ridotto alpino con il generale Guisan.']);
  assert.equal(fonteChiusa(h), false, 'la Fonte si riapre su quella frase');
  await vaiA1(h, LINK_AB); await vaiA1(h, 'B');
  assert.equal(fonteChiusa(h), true, 'alla scheda dopo senza prove torna a chiudersi da sola');
});

test('0075 p10: la sezione «Il controllo» in fondo alla barra, chiusa: traccia e storia del giudice, «Nuovo controllo con i modelli del Setup», il recupero della bozza', () => {
  const m = g1Manifest(rapportoG1({ quando: '2026-10-06T10:00:00.000Z' }));
  m.review.initial.previousReports = [rapportoG1({ quando: '2026-10-05T10:00:00.000Z' })];
  const h = runtime1({ manifest: m });
  h.st._reviewLocalDraft = { vaultPath: '/vault', db: clone(DB1) };
  h.apri1();
  const sez = q(h, '#mrv-coverage-options');
  assert.ok(!!sez && !!q(h, '#mrv-sidebar #mrv-coverage-options'), 'in fondo alla barra');
  assert.equal(sez.getAttribute('open'), undefined, 'chiusa all’apertura');
  assert.match(sez.querySelector('summary').textContent, /^Il controllo · Parziale/);
  for (const s of ['#mrv-judge-model-result', '#mrv-judge-history', '#mrv-setup-judge']) assert.ok(!!sez.querySelector(s), s);
  assert.ok(sez.querySelectorAll('button').some(b => b.textContent === 'Apri la bozza locale conservata'));
  assert.ok(!sez.querySelector('#mrv-manual-confirm'), 'la conferma non è più qui: sta nel piede');
  assert.ok(!sez.querySelector('#mrv-retry-judge'), '«Riprova» sta nel piede');
});

test('0075 p10: lo strato delle affermazioni dentro la veste — il blocco nella sezione «Il controllo», la frase nel piede, lo stato sulla nota in quarantena, «Vai alla segnalazione» apre la riga', async () => {
  const h = conStrato1(runtime1({ storage: STRATO })); h.apri1();
  const blocco = q(h, '#mrv-coverage-options [data-aff-blocco]');
  assert.ok(!!blocco, 'il blocco «Affermazioni delle descrizioni»');
  assert.match(q(h, '#mrv-next-step').textContent, /Non serve decidere tutto per creare i materiali/);
  // giro 2, Q8: nel titolo della sezione il conto della barra, non quello dello strato («descrizioni esaminate…»)
  assert.match(q(h, '#mrv-coverage-options summary').textContent, /Parziale · 2 parti non lette dal controllo/);
  assert.ok(!/descrizioni esaminate in almeno un giro/.test(q(h, '#mrv-coverage-options summary').textContent));
  const stato = q(h, '[data-veste-nota="a1"] [data-veste-quarantena]');
  assert.ok(!!stato && /materiali/.test(stato.textContent), 'lo stato di quarantena sulla nota aperta');
  // la frase di B esce dai materiali per a3 (il suo passo «Le banche custodivano i depositi.» la contiene): «Vai alla
  // segnalazione» porta alla riga che CONTIENE a3, cioè A, non alla riga della frase
  await vaiA1(h, 'C');
  const vai = q(h, '#mrv-coverage-options [data-aff-vai="a3"]');
  assert.ok(!!vai, '«Vai alla segnalazione» per a3');
  await vai.click(); await tick();
  assert.equal(scheda(h), 'A', 'si apre la riga che contiene la segnalazione');
  assert.ok(q(h, '[data-veste-nota="a3"]').classList.contains('mrv-veste-evidenza'), 'la nota si vede subito');
});

/* ── gruppo «Fonte» ── */
test('0075 p11: la Fonte segue la riga aperta; prima la frase citata dalla nota (quote), poi le altre prove della nota; una riga senza prove chiude la Fonte da sola (F1); il colore dell’area (F6)', async () => {
  const h = runtime1(); h.st.db.customColors = { 1: '#f59e0b' };
  const f = fonteContata(h, prove => prove.length); h.apri1();
  assert.equal(f.opzioni.soloCitazioni, true); assert.equal(f.opzioni.testoAperto, true);
  const ultima = () => f.chiamate[f.chiamate.length - 1];
  assert.deepEqual(ultima().prove.map(p => p.text), ['furono accusate di aver accettato oro', 'Le banche svizzere furono accusate di aver accettato oro.', 'Le banche custodivano i depositi.']);
  assert.equal(ultima().x.colore, '#f59e0b');
  await vaiA1(h, 'B');
  assert.deepEqual(ultima().prove, [], 'B non ha prove');
  assert.equal(fonteChiusa(h), true, 'F1: si chiude da sola senza passi');
  await vaiA1(h, 'A');
  assert.equal(fonteChiusa(h), false);
});

test('0075 p11: le prove dello strato (le frasi vicine nella fonte del nodo) vengono dopo quelle delle note; col vero strato un nodo senza note mostra la sua frase vicina', async () => {
  // lo strato finto: dice solo le sue prove, per vedere l'ordine
  const h = runtime1(); const f = fonteContata(h);
  h.window.MappAIAffermazioniUI = { per: () => ({ stato: () => null, piede: () => '', suffissoCopertura: () => '', blocco: () => null, prove: id => [{ text: 'vicina di ' + id }] }) };
  h.apri1();
  assert.deepEqual(f.chiamate[f.chiamate.length - 1].prove.map(p => p.text),
    ['furono accusate di aver accettato oro', 'Le banche svizzere furono accusate di aver accettato oro.', 'Le banche custodivano i depositi.', 'vicina di A']);
  await vaiA1(h, LINK_AB);
  assert.deepEqual(f.chiamate[f.chiamate.length - 1].prove, [], 'un collegamento non ha frasi vicine dello strato');
  // lo strato vero: E non ha note, la sua affermazione ha una frase vicina nella fonte
  const g = conStrato1(runtime1({ storage: Object.assign({ mappai_frasi_orfane: '1' }, STRATO) })); const fg = fonteContata(g); g.apri1();
  await q(g, '#mrv-coverage-options [data-aff-orf-correggi="E"]').click(); await tick(); await tick();
  assert.equal(scheda(g), 'E');
  assert.deepEqual(fg.chiamate[fg.chiamate.length - 1].prove.map(p => p.text), ['Nel 1940 l’esercito svizzero si ritirò nel Ridotto alpino con il generale Guisan.']);
});

test('0075 CSS: le regole della veste in G1 — il cerchio vuoto dei non letti, la nota decisa ridotta a una riga, i suggerimenti; nessuna nuova regola tocca il contenitore delle note (p12)', () => {
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8');
  assert.match(css, /\.mrv-veste-cerchio\s*\{/);
  assert.match(css, /\.mrv-veste-g1 \.mrv-veste-nota:not\(\[data-esito="pending"\]\):not\(\[data-esito="conflitto"\]\) \.mrv-veste-nota-testo\s*\{[^}]*text-overflow: ellipsis/);
  assert.match(css, /\.mrv-veste-scelte\s*\{/);
  assert.ok(!/var\(--ui-/.test(css.slice(css.indexOf('0075'))), 'token --mm-*, non --ui-*');
  const html = fs.readFileSync(require.resolve('../public/index.html'), 'utf8');
  assert.match(html, /mappai-review-dashboard\.css\?v=[^"']+/);   // il marcatore c'è, non quale (09/10, Giacomo via ADMIN)
});

/* ═══ 0075, giro di correzione (07/10): D2-D5, Q7-Q8, N6 (revisione avversaria) ═══ */
// tutte le note decise tranne «togli il collegamento» (l1): resta da fare solo il collegamento A → B
function quasiTutto(m) {
  m.review = Core.setDecision(m.review, 'a1', 'accept');
  ['a2', 'a3', 'b1'].forEach(id => { m.review = Core.setDecision(m.review, id, 'reject'); });
  return m;
}
test('D2 (0086 g3c, D37.7): parole scritte e «Togli il collegamento» salvati in una seduta di prima si contraddicono — la riga resta «da rivedere» e lo dice; niente casella né «Riprova» finché il conflitto c’è; il bottone in fondo lo sostituisce, la riga è decisa e la casella compare', async () => {
  const { h } = conflittoLinkPrima(); h.apri1();
  assert.equal(Core.preview(h.rev(), h.st.db).conflicts.map(c => c.code).join(), 'conflicting_decisions', 'le due scelte si contraddicono');
  q(h, '[data-veste-filtro="da-rivedere"]').onclick();
  const ab = rigaG1(h, LINK_AB);
  assert.ok(!!ab, 'con «Da rivedere» la riga in conflitto si vede');
  assert.equal(ab.getAttribute('data-stato'), 'da-rivedere');
  assert.match(ab.textContent, /Scelte in conflitto/, 'e dice perché');
  assert.equal(q(h, '[data-veste-filtro="da-rivedere"]').textContent, 'Da rivedere 1');
  assert.equal(q(h, '#mrv-progress-label').textContent, '2 / 3 decisi');
  assert.ok(!q(h, '#mrv-veste-conferma'), 'niente casella con le scelte in conflitto');
  assert.ok(!q(h, '#mrv-next-step #mrv-retry-judge'), 'niente «Riprova»');
  assert.match(q(h, '#mrv-next-step').textContent, /Resta 1 fra nodi e collegamenti con note aperte o scelte in conflitto\./);
  assert.equal(q(h, '#mrv-continue').hidden, true);
  await vaiA1(h, LINK_AB);
  assert.match(q(h, '[data-veste-avvisi]').textContent, /il bottone in fondo le sostituisce/);
  assert.equal(bottone(h).disabled, false);
  await premiG(h);
  q(h, '[data-veste-filtro="tutti"]').onclick();
  assert.equal(rigaG1(h, LINK_AB).getAttribute('data-stato'), 'fatto');
  assert.ok(!/Scelte in conflitto/.test(rigaG1(h, LINK_AB).textContent));
  assert.ok(!!q(h, '#mrv-veste-conferma'));
  assert.ok(!!q(h, '#mrv-next-step #mrv-retry-judge'));
});

test('D3 «Riprova il controllo automatico» sta nella riga della casella: sotto .mrv-veste-g1 width:auto con specificità ≥ di «#mappai-teacher-review #mrv-retry-judge» (width: 100%), e la casella cede spazio', () => {
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const regole = css.split('}').map(r => r.split('{')).filter(r => r.length === 2).map(([sel, corpo]) => ({ sel: sel.trim(), corpo }));
  const peso = s => [(s.match(/#[\w-]+/g) || []).length, (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) || []).length, (s.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|:[\w-]+(\([^)]*\))?/g, ' ').match(/[a-z][\w-]*/gi) || []).length];
  const piuForte = (a, b) => a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] >= b[2];
  const base = regole.find(r => r.sel === '#mappai-teacher-review #mrv-retry-judge');
  assert.ok(base && /width:\s*100%/.test(base.corpo), 'la regola di prima resta (veste spenta e G2)');
  const auto = regole.filter(r => r.sel.split(',').some(s => /\.mrv-veste-g1/.test(s) && /(\.mrv-veste-riprova|#mrv-retry-judge)\b/.test(s) && piuForte(peso(s.trim()), peso(base.sel))) && /width:\s*auto/.test(r.corpo));
  assert.equal(auto.length, 1, 'una regola width:auto sotto .mrv-veste-g1, più forte di quella dell’id');
  const casella = regole.find(r => /\.mrv-veste-g1/.test(r.sel) && /#mrv-next-step \.mrv-veste-conferma$/.test(r.sel));
  assert.ok(casella && /flex:\s*1 1 [^;]+/.test(casella.corpo) && /min-width:\s*0/.test(casella.corpo), 'la casella si stringe e va a capo: «Riprova» resta nella sua riga');
});

test('D4 le parole scritte nel Banco nascono come quelle dell’editor dei collegamenti della mappa: la stessa nota «teacher-link-label-…»; poi la mappa le riscrive e la nota resta una, senza conflitto (0022)', async () => {
  const h = runtime1(); h.apri1();
  const LE = h.window.MappAILinkEditorCore;
  await vaiA1(h, LINK_AB);
  await scrivi(h, 'rel', 'genera');
  await premiG(h);   // 0086 g3d (D41): le parole si registrano col bottone in fondo (prima all'uscita dal campo)
  const ref = LE.reference(h.st.db.links[1]);
  assert.equal(LE.draft(h.rev(), ref), 'genera', 'l’editor della mappa legge la correzione del Banco');
  let doc = docenti1(h);
  assert.equal(doc.length, 1);
  assert.ok(doc[0].id.startsWith('teacher-link-label-'), doc[0].id);
  assert.equal(doc[0].problem, 'Parole del collegamento modificate dal docente.');
  assert.equal(dec1(h, 'l1'), 'reject', 'la nota «togli il collegamento» con la spunta piena: tenuto');
  // «Nessuna» passa dalla stessa strada (relNone): la riga, decisa, ora si salva all'uscita
  await vaiA1(h, LINK_AB);
  await qa(h, '[data-veste-suggerimenti] button')[0].click(); await tick();
  assert.equal(LE.draftNone(h.rev(), ref), true);
  // chiuso il Banco, la mappa riscrive le parole con R.editLinkLabel (la revisione è ancora aperta)
  await q(h, '#mrv-later').click(); await tick(); await tick();
  await h.R.editLinkLabel(ref, 'produce');
  const rv = h.st._pipelineManifest.review;
  doc = rv.initial.issues.filter(i => i.origin === 'teacher');
  assert.equal(doc.length, 1, 'una nota sola');
  assert.equal(rv.initial.decisions[doc[0].id].text, 'produce');
  assert.deepEqual(Core.preview(rv, h.st.db).conflicts, [], 'niente conflitto: G1 non si blocca');
});

test('D4 senza l’editor dei collegamenti della mappa le parole non si salvano per un’altra strada (nessun secondo editor): niente scrittura, lo dice', async () => {
  const h = runtime1({ senzaEditorCollegamenti: true }); h.apri1();
  await vaiA1(h, LINK_AB);
  await scrivi(h, 'rel', 'genera');
  await premiG(h);   // 0086 g3d (D41): le parole si registrano col bottone in fondo
  assert.equal(h.calls.manifest, 0);
  assert.equal(docenti1(h).length, 0);
  assert.match(q(h, '#mrv-status').textContent, /non è stata salvata/);
});

// aggiunti dopo le mutazioni del giro 2: il collegamento giusto fra due con gli stessi estremi; l'anteprima che non riesce
test('D4 due collegamenti fra gli stessi concetti: le parole vanno su quello della riga (riconosciuto dalle sue parole), con la nota dell’editor della mappa per quel collegamento', async () => {
  const DB2 = clone(DB1); DB2.links.push({ source: 'A', target: 'B', rel: 'precede' });
  const m = Pipeline.createManifest({}, { vaultPath: '/vault' }); m.steps.A.status = 'done';
  m.review = Core.createReview({ db: DB2, sources: SOURCES1, report: rapportoG1() });
  const h = runtime1({ db: DB2, manifest: m }); h.apri1();
  await vaiA1(h, LINK_AB);
  await scrivi(h, 'rel', 'genera');
  await premiG(h);   // 0086 g3d (D41): le parole si registrano col bottone in fondo
  const LE = h.window.MappAILinkEditorCore;
  assert.equal(docenti1(h).length, 1);
  assert.equal(LE.draft(h.rev(), LE.reference(DB2.links[1])), 'genera', 'il collegamento «causa», quello della riga');
  assert.equal(LE.draft(h.rev(), LE.reference(DB2.links[4])), 'precede', 'l’altro non si tocca');
});

test('D4 «Nessuna» come prima correzione delle parole: nasce la nota dell’editor della mappa con relNone (il collegamento senza parole)', async () => {
  const h = runtime1(); h.apri1();
  await vaiA1(h, LINK_AB);
  await qa(h, '[data-veste-suggerimenti] button')[0].click(); await tick();
  assert.equal(campo(h, 'rel').value, '');
  await premiG(h);   // 0086 g3d (D41): «Nessuna» resta nella bozza, la registra il bottone in fondo
  const LE = h.window.MappAILinkEditorCore, ref = LE.reference(h.st.db.links[1]);
  const doc = docenti1(h);
  assert.equal(doc.length, 1);
  assert.ok(doc[0].id.startsWith('teacher-link-label-'));
  assert.equal(LE.draft(h.rev(), ref), ''); assert.equal(LE.draftNone(h.rev(), ref), true);
  await vaiA1(h, LINK_AB);
  assert.equal(campo(h, 'rel').value, '');
});

test('D2 l’anteprima della mappa che non riesce senza che una riga lo dica: niente casella né «Riprova», il piede dice che cosa fare (terzo giro, punto 4: prima mandava a «cercare le righe con le note», che non c’erano)', () => {
  const h = runtime1({ manifest: decidiTutto(g1Manifest()) });
  h.window.MappAIReviewCore.preview = () => ({ ok: false, conflicts: [{ issueId: null, code: 'invalid_review' }], unresolved: [] });
  h.apri1();
  assert.equal(q(h, '[data-veste-filtro="da-rivedere"]').textContent, 'Da rivedere 0');
  assert.ok(!q(h, '#mrv-veste-conferma'), 'una casella che non porterebbe a niente: il bottone resterebbe nascosto');
  assert.ok(!q(h, '#mrv-next-step #mrv-retry-judge'));
  assert.match(q(h, '#mrv-next-step').textContent, /^Le decisioni non si possono ancora applicare alla mappa, ma nessuna riga dell’elenco ne è la causa/);
  assert.equal(q(h, '#mrv-continue').hidden, true);
});

test('D5 «Mostra nella fonte» dello strato su una frase che la Fonte non trova (nessun passo) non chiude la Fonte aperta', async () => {
  const h = conStrato1(runtime1({ storage: STRATO }));
  const f = fonteContata(h, prove => prove.filter(p => !/Ridotto alpino/.test(p.text)).length);
  h.apri1();
  assert.equal(fonteChiusa(h), false, 'A ha le sue prove: la Fonte è aperta');
  const mostra = q(h, '#mrv-coverage-options [data-aff-fonte]');
  assert.ok(!!mostra);
  await mostra.click(); await tick();
  assert.match(f.chiamate[f.chiamate.length - 1].prove[0].text, /Ridotto alpino/, 'la frase è passata alla Fonte, che non la trova');
  assert.equal(fonteChiusa(h), false, 'la Fonte resta aperta');
});

test('Q8 i non letti: casella, testata e sezione «Il controllo» dicono lo stesso conto (quello della barra) con le stesse parole, e una riga dice che cosa vuol dire «non letto»', () => {
  // A non letto dall'ultimo controllo ma segnalato (ha la sua riga fra i nodi): il rapporto conta 3 parti, la barra 2
  const r = rapportoG1(); r.copertura.nodiSaltati = [{ id: 'A', label: 'Accuse', motivo: 'lotto rifiutato' }].concat(r.copertura.nodiSaltati);
  const h = runtime1({ manifest: decidiTutto(g1Manifest(r)) }); h.apri1();
  assert.equal(q(h, '#mrv-veste-riepilogo').textContent, '6 nodi · 3 segnalati · 2 parti non lette dal controllo');
  assert.deepEqual(qa(h, '[data-veste-gruppo]').filter(g => /^non-letti/.test(g.getAttribute('data-veste-gruppo'))).map(g => g.textContent), ['Nodi non letti dal controllo · 1', 'Collegamenti non letti dal controllo · 1']);
  assert.equal(q(h, 'label.mrv-veste-conferma').textContent.trim(), 'Ho verificato personalmente anche le 2 parti non lette dal controllo (1 nodo, 1 collegamento) e approvo i contenuti.');
  assert.equal(q(h, '#mrv-coverage-options summary').textContent, 'Il controllo · Parziale · 2 parti non lette dal controllo');
  const def = q(h, '#mrv-coverage-options [data-veste-non-letto-def]');
  assert.ok(!!def, 'la riga che dice che cosa vuol dire «non letto»');
  assert.equal(def.textContent, 'Non letto: l’ultimo controllo automatico non ha esaminato questa parte, anche se un controllo precedente l’aveva esaminata. Le parti non lette che hanno una nota del controllo stanno fra i segnalati.');
  // una parte sola
  const r1 = rapportoG1(); r1.copertura.linkSaltati = [];
  const g = runtime1({ manifest: decidiTutto(g1Manifest(r1)) }); g.apri1();
  assert.equal(q(g, 'label.mrv-veste-conferma').textContent.trim(), 'Ho verificato personalmente anche la parte non letta dal controllo (1 nodo) e approvo i contenuti.');
  assert.equal(q(g, '#mrv-coverage-options summary').textContent, 'Il controllo · Parziale · 1 parte non letta dal controllo');
});

test('N6 una nota decisa, ridotta a una riga con «…», porta il testo intero in `title`; aperta no', async () => {
  const h = runtime1(); h.apri1();
  const testo = () => q(h, '[data-veste-nota="a2"] .mrv-veste-nota-testo');
  assert.equal(testo().getAttribute('title'), undefined);
  // 0086, giro 3b: la nota si decide col bottone in fondo (prima col suo), che passa alla riga dopo; si torna su A
  const casella = q(h, '[data-veste-spunta="a2"]'); casella.checked = true; casella.onchange();
  await bottone(h).click(); await tick(); await tick();
  await vaiA1(h, 'A');
  assert.equal(testo().getAttribute('title'), 'Il nodo semplifica troppo');
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(testo().getAttribute('title'), undefined, 'riaperta con ⌘Z, il testo si legge intero e il title non serve');
});

/* ═══ Verifica indipendente delle mutazioni 0075 (06/10), portata il 07/10 col prefisso K5: test che uccidono mutazioni
   sopravvissute della veste G1. Sono quelli del verificatore, invariati: la frase della casella senza parti non lette
   (K5-V15) resta quella di prima; le altre frasi della casella si leggono coi numeri (K5-V13/V14). ═══ */
test('K5-V02/V03 conteggi dopo una decisione: il gruppo dice quante restano da fare, la testata quanti sono decisi', async () => {
  const h = runtime1(); h.apri1();
  await vaiA1(h, 'B');
  // 0086, giro 3b: la decisione è il bottone in fondo, con la spunta di b1 (descrizione intera, D39) messa
  const casella = q(h, '[data-veste-spunta="b1"]'); casella.checked = true; casella.onchange();
  await bottone(h).click(); await tick(); await tick();
  assert.equal(qa(h, '[data-veste-gruppo]')[0].textContent, 'Nodi segnalati · 1 di 2');
  assert.equal(q(h, '#mrv-progress-label').textContent, '1 / 3 decisi');
  assert.match(q(h, '#mrv-filter-count').textContent, /1 decisi/);
});

test('K5-V10 un non letto corretto: la scheda dice che la correzione diventa una segnalazione del docente', async () => {
  const h = runtime1(); h.apri1();
  await vaiA1(h, 'C');
  await scrivi(h, 'desc', 'Il commercio con la Germania continuò.');
  assert.match((q(h, '[data-veste-chiuse]') || { textContent: '' }).textContent, /diventa una tua segnalazione/);
});

test('K5-V13/V14 la frase della casella nomina nodi e collegamenti non letti coi loro numeri, e dopo «Riprova» segue il rapporto nuovo', async () => {
  const h = runtime1({ manifest: decidiTutto(g1Manifest()) });
  h.R.retryJudge = async () => {
    const r = clone(h.rev());
    r.initial.report = Object.assign({}, r.initial.report, { quando: '2026-10-06T22:00:00.000Z',
      copertura: Object.assign({}, r.initial.report.copertura, { nodiSaltati: [{ id: 'C', label: 'Commercio' }, { id: 'D', label: 'Dogane' }] }) });
    h.m.review = r;
  };
  h.apri1();
  const frase = () => q(h, 'label.mrv-veste-conferma').textContent.trim();
  assert.match(frase(), /\(1 nodo, 1 collegamento\)/);
  await q(h, '#mrv-next-step #mrv-retry-judge').click(); await tick(); await tick();
  assert.match(frase(), /\(2 nodi, 1 collegamento\)/, 'dopo «Riprova» la frase dice il rapporto nuovo');
});

test('K5-V15 controllo parziale senza parti saltate (né limiti del testo): la frase della casella non ha parentesi vuote', () => {
  const h = runtime1({ manifest: decidiTutto(g1Manifest(rapportoG1({ copertura: { nodiEsaminati: ['R', 'A', 'B', 'C', 'D', 'E'], linkEsaminati: [], nodiSaltati: [], linkSaltati: [] } }))) });
  h.apri1();
  assert.equal(q(h, 'label.mrv-veste-conferma').textContent.trim(), 'Ho verificato personalmente anche le parti che il controllo automatico non ha letto e approvo i contenuti.');
});

test('K5-V18/V19 lo strato dentro la veste: dopo una decisione il blocco si ricalcola e resta uno solo', async () => {
  const h = conStrato1(runtime1({ storage: STRATO })); h.apri1();
  const blocchi = () => qa(h, '#mrv-coverage-options [data-aff-blocco]');
  assert.equal(blocchi().length, 1);
  const prima = blocchi()[0].textContent;
  // 0086, giro 3b: le decisioni sono il bottone in fondo (prima i bottoni di a1 e a3): la spunta di a2 messa, poi il bottone
  const casella = q(h, '[data-veste-spunta="a2"]'); casella.checked = true; casella.onchange();
  await bottone(h).click(); await tick(); await tick();
  assert.equal(blocchi().length, 1, 'un blocco solo, non uno per scrittura');
  assert.notEqual(blocchi()[0].textContent, prima, 'le corsie cambiano con le decisioni: il blocco si ridisegna');
});

test('K5-V21 la Fonte: la citata della nota APERTA viene prima delle prove di una nota già decisa', () => {
  const r = rapportoG1();
  r.issues[0] = Object.assign({}, r.issues[0], { quote: 'furono accusate di aver accettato oro' });
  r.issues[2] = Object.assign({}, r.issues[2], { quote: 'Le banche custodivano i depositi', evidence: [{ source: 'Libro.pdf', page: 4, text: 'Le banche custodivano i depositi.' }] });
  const m = g1Manifest(r); m.review = Core.setDecision(m.review, 'a1', 'accept');
  const h = runtime1({ manifest: m }); const f = fonteContata(h); h.apri1();
  assert.equal(f.chiamate[f.chiamate.length - 1].prove[0].text, 'Le banche custodivano i depositi', 'prima la citata della nota da decidere (a3)');
});

test('K5-V22 la Fonte: la frase citata porta la pagina della prova che la contiene', () => {
  const h = runtime1(); const f = fonteContata(h); h.apri1();
  const prima = f.chiamate[f.chiamate.length - 1].prove[0];
  assert.equal(prima.text, 'furono accusate di aver accettato oro');
  assert.equal(prima.page, 4);
});

test('K5-V25 un collegamento tolto: anche i suggerimenti e la famiglia si leggono e basta', async () => {
  const h = runtime1(); h.apri1();
  await vaiA1(h, LINK_AB);
  await cambiaG(h, 'l1', false); await premiG(h);   // 0086 g3c: la spunta tolta e il bottone in fondo
  await vaiA1(h, LINK_AB);
  assert.equal(campo(h, 'rel').disabled, true);
  assert.equal(q(h, '[data-veste-famiglia]').disabled, true);
  assert.ok(qa(h, '[data-veste-suggerimenti] button').every(b => b.disabled === true));
});

test('K5-V28 le parole di un collegamento non si salvano a battuta', async () => {
  const h = runtime1(); h.apri1();
  await vaiA1(h, LINK_AB);
  const el = entra(campo(h, 'rel')); el.value = 'gen'; el.oninput(); el.value = 'genera'; el.oninput(); await tick();
  assert.equal(h.calls.manifest, 0, 'mai a battuta');
  el.onblur(); await tick();
  // 0086 g3d (D41): con la nota del controllo nemmeno all'uscita; una scrittura col bottone in fondo
  assert.equal(h.calls.manifest, 0, 'niente all’uscita');
  await premiG(h);
  assert.equal(h.calls.manifest, 1, 'una scrittura col bottone');
});

test('K5-V31 i suggerimenti seguono la lingua delle mappe: in inglese le parole inglesi della famiglia', async () => {
  const h = runtime1(); h.window.currentLanguage = 'en'; h.apri1();
  await vaiA1(h, LINK_AB);
  const Rel = require('../public/js/mappai-relations.js');
  assert.deepEqual(qa(h, '[data-veste-suggerimenti] button').map(b => b.textContent).slice(1), Rel.EDGE_FAMILIES[Rel.getEdgeFamilyKey('causa')].keywordsEn);
});

test('K5-V32 «Vai alla segnalazione» con un filtro che nasconde la riga: si allargano i filtri e la riga si vede', async () => {
  const h = conStrato1(runtime1({ storage: STRATO })); h.apri1();
  q(h, '[data-veste-filtro="fatti"]').onclick();
  assert.equal(righe1(h).length, 0);
  await q(h, '#mrv-coverage-options [data-aff-vai="a3"]').click(); await tick();
  assert.equal(scheda(h), 'A');
  assert.ok(!!rigaG1(h, 'A'), 'la riga aperta si vede in barra');
  assert.equal(q(h, '[data-veste-filtro="tutti"]').getAttribute('aria-pressed'), 'true');
});

test('K5-V38 la ricerca della barra G1 trova anche nella descrizione del nodo', () => {
  const h = runtime1(); h.apri1();
  const cerca = q(h, '#mrv-search'); cerca.value = 'oro tedesco'; cerca.oninput();
  q(h, '[data-veste-filtro="tutti"]').onclick();
  assert.deepEqual(righe1(h).map(b => b.getAttribute('data-veste-riga')), ['B']);
});

test('K5-X03 «Nuovo controllo con i modelli del Setup» con la veste: toglie la spunta della casella del piede e lo dice', async () => {
  const h = runtime1({ manifest: decidiTutto(g1Manifest()) });
  h.R.prepareSetupJudge = () => ({ provider: 'prova', model: 'giudice', run: async () => {
    const r = clone(h.rev()); r.initial.report = Object.assign({}, r.initial.report, { quando: '2026-10-06T23:00:00.000Z' }); h.m.review = r; } });
  h.apri1();
  const casella = q(h, '#mrv-veste-conferma'); casella.checked = true; casella.onchange();
  await q(h, '#mrv-setup-judge').click(); await tick();
  await q(h, '#mrv-setup-start').click(); await tick(); await tick();
  assert.equal(q(h, '#mrv-veste-conferma').checked, false);
  assert.match(q(h, '#mrv-status').textContent, /va rimessa la spunta «Ho verificato personalmente…»/);
});

test('K5-Y02/Y03 le prove dello strato sono quelle del nodo aperto, con la loro pagina', async () => {
  const h = conStrato1(runtime1({ storage: Object.assign({ mappai_frasi_orfane: '1' }, STRATO) })); const f = fonteContata(h); h.apri1();
  const testi = () => f.chiamate[f.chiamate.length - 1].prove.map(p => p.text);
  assert.ok(!testi().includes('Nel 1940 l’esercito svizzero si ritirò nel Ridotto alpino con il generale Guisan.'), 'la frase vicina di E non va alla scheda di A');
  await q(h, '#mrv-coverage-options [data-aff-orf-correggi="E"]').click(); await tick(); await tick();
  const p = f.chiamate[f.chiamate.length - 1].prove[0];
  assert.equal(p.text, 'Nel 1940 l’esercito svizzero si ritirò nel Ridotto alpino con il generale Guisan.');
  assert.equal(p.page, 4);
});

test('K5-Z CSS: ogni regola nuova della veste in G1 vale solo sotto la veste; il nowrap del contatore solo sullo span', () => {
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8');
  const blocco = css.slice(css.indexOf('── LA VESTE IN G1'));
  const regole = blocco.split('\n').filter(r => r.includes('{') && !/^\s*(\/\*|\*)/.test(r));
  assert.ok(regole.length >= 10);
  for (const r of regole) for (const sel of r.slice(0, r.indexOf('{')).split(','))
    assert.match(sel.trim(), /^#mappai-teacher-review\.mrv-veste(-g1)?[\s.:[]/, 'fuori dalla veste: ' + sel.trim());
  for (const r of css.split('\n').filter(r => /\.mrv-veste-note(?![-\w])/.test(r) && r.includes('{') && !/^\s*(\/\*|\*)/.test(r)))
    for (const sel of r.slice(0, r.indexOf('{')).split(','))
      assert.match(sel, /span\.mrv-veste-note(?![-\w])/, 'il contenitore div delle note non prende lo stile del contatore: ' + sel.trim());
});

test('K5-X06 la veste G1 legge la mappa VIVA: cambiata fuori dal Banco, la revisione è vecchia — lo dicono piede e scheda, e i campi non si scrivono', () => {
  const h = runtime1(); h.st.db.nodes[1].desc = 'Cambiata fuori dal Banco.'; h.apri1();
  assert.match(q(h, '#mrv-next-step').textContent, /non corrispondono alla versione di questa revisione/);
  assert.match(q(h, '[data-veste-avvisi]').textContent, /non corrispondono alla versione di questa revisione/);
  assert.equal(campo(h, 'desc').disabled, true);
});

test('K5-V17 controllo completo e tutto deciso: niente casella, il piede dice «Hai deciso tutto» e il bottone si vede', () => {
  const tutto = { nodiEsaminati: ['R', 'A', 'B', 'C', 'D', 'E'], linkEsaminati: DB1.links.map(l => ({ source: l.source, target: l.target, rel: l.rel })), nodiSaltati: [], linkSaltati: [] };
  const h = runtime1({ manifest: decidiTutto(g1Manifest(rapportoG1({ stato: 'completo', copertura: tutto }))) }); h.apri1();
  assert.equal(h.rev().initial.checkStatus, 'completed');
  assert.ok(!q(h, '#mrv-veste-conferma'));
  assert.match(q(h, '#mrv-next-step').textContent, /Hai deciso tutto/);
  assert.equal(q(h, '#mrv-continue').hidden, false);
});

test('K5-V37 una revisione G1 approvata si riapre in sola lettura: niente casella né «Riprova» nel piede', async () => {
  const h = runtime1({ manifest: decidiTutto(g1Manifest()) }); h.apri1();
  const casella = q(h, '#mrv-veste-conferma'); casella.checked = true; casella.onchange();
  await q(h, '#mrv-continue').click(); await tick(); await tick();
  assert.equal(h.rev().initial.status, 'approved');
  h.apri1();
  assert.ok(h.modal.className.includes('mrv-veste-g1'));
  assert.ok(!q(h, '#mrv-veste-conferma'), 'la conferma era della revisione da chiudere');
  assert.ok(!q(h, '#mrv-next-step #mrv-retry-judge'));
  assert.match(q(h, '#mrv-next-step').textContent, /La revisione è approvata/);
});

test('K5-V36 «Correggi il nodo vicino»: aperta la scheda, il fuoco è sulla descrizione', async () => {
  const h = conStrato1(runtime1({ storage: Object.assign({ mappai_frasi_orfane: '1' }, STRATO) })); h.apri1();
  await q(h, '#mrv-coverage-options [data-aff-orf-correggi="E"]').click(); await tick(); await tick();
  assert.equal(scheda(h), 'E');
  assert.equal(h.dom.document.activeElement, campo(h, 'desc'));
});

test('K5-V34/V35 la nota sul collegamento decisa si riduce al suo esito con le parole del collegamento: «Collegamento tenuto», «Collegamento tolto»', async () => {
  const h = runtime1(); h.apri1();
  await vaiA1(h, LINK_AB);
  await premiG(h);   // 0086 g3c: la spunta piena e il bottone in fondo
  await vaiA1(h, LINK_AB);
  assert.equal(q(h, '[data-veste-nota="l1"] [data-veste-esito]').textContent, 'Collegamento tenuto');
  const g = runtime1(); g.apri1();
  await vaiA1(g, LINK_AB);
  await cambiaG(g, 'l1', false); await premiG(g);   // la spunta tolta e il bottone in fondo
  await vaiA1(g, LINK_AB);
  assert.equal(q(g, '[data-veste-nota="l1"] [data-veste-esito]').textContent, 'Collegamento tolto');
});

/* ═══ Verifica indipendente delle mutazioni del giro di correzione 0075 (07/10), portata nel terzo giro col prefisso K6:
   test che uccidono mutazioni sopravvissute della veste G1 (numeri del verificatore). ═══ */
test('K6-D2 un conflitto dell’anteprima su UNA nota (senza otherIssueId) rende «da rivedere» la sua riga e lo dice, anche se la riga ha ancora note aperte', () => {
  const m = g1Manifest();
  m.review = Core.setDecision(m.review, 'a1', 'accept');   // A: a1 decisa, a2 e a3 aperte
  m.review = Core.setDecision(m.review, 'b1', 'reject');   // B: tutte decise
  const h = runtime1({ manifest: m });
  const vera = h.window.MappAIReviewCore.preview;
  h.window.MappAIReviewCore.preview = (...a) => Object.assign({}, vera(...a), { ok: false,
    conflicts: [{ issueId: 'b1', code: 'invalid_replacement' }, { issueId: 'a1', code: 'before_mismatch' }] });
  h.apri1();
  const b = rigaG1(h, 'B');
  assert.equal(b.getAttribute('data-stato'), 'da-rivedere', 'B ha le note tutte decise ma una è in conflitto');
  assert.match(b.textContent, /Scelte in conflitto/);
  assert.match(rigaG1(h, 'A').textContent, /Scelte in conflitto/, 'A ha note aperte e una nota in conflitto: lo dice lo stesso');
  assert.ok(!/Scelte in conflitto/.test(rigaG1(h, LINK_AB).textContent), 'il collegamento non è in conflitto');
});

test('K6-D3 «Riprova» nel piede porta la classe a cui si aggancia la regola D3, e la casella cede spazio con una base in rem/px (non l’intera riga)', () => {
  const h = runtime1({ manifest: decidiTutto(g1Manifest()) }); h.apri1();
  const b = q(h, '#mrv-next-step #mrv-retry-judge');
  assert.ok(!!b, '«Riprova» c’è (controllo parziale, a decisioni finite)');
  assert.match(String(b.className), /(^|\s)mrv-veste-riprova(\s|$)/, 'senza la classe la regola width:auto non lo prende e torna largo quanto la riga');
  assert.ok(!!q(h, '#mrv-next-step label.mrv-veste-conferma'), 'la casella porta la classe della sua regola');
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const casella = css.split('}').map(r => r.split('{')).find(r => r.length === 2 && /\.mrv-veste-g1/.test(r[0]) && /#mrv-next-step \.mrv-veste-conferma\s*$/.test(r[0]));
  const base = casella && /flex:\s*1 1 ([^;]+)/.exec(casella[1]);
  assert.ok(base && /^\d+(\.\d+)?(rem|px)$/.test(base[1].trim()), 'la base della casella è una misura, non 100%: ' + (base && base[1]));
});

test('K6-Q8 corretto dal docente un nodo non letto, i tre conti restano uguali a quello della barra (il non letto resta non letto, con la spunta)', async () => {
  const h = runtime1({ manifest: decidiTutto(g1Manifest()) }); h.apri1();
  await vaiA1(h, 'C');
  await scrivi(h, 'desc', 'Il commercio continuò fino al 1944.');
  assert.equal(rigaG1(h, 'C').getAttribute('data-stato'), 'fatto', 'il non letto corretto prende la spunta');
  assert.deepEqual(qa(h, '[data-veste-gruppo]').filter(g => /^non-letti/.test(g.getAttribute('data-veste-gruppo'))).map(g => g.textContent), ['Nodi non letti dal controllo · 1', 'Collegamenti non letti dal controllo · 1']);
  assert.match(q(h, '#mrv-veste-riepilogo').textContent, /· 2 parti non lette dal controllo$/);
  assert.equal(q(h, '#mrv-coverage-options summary').textContent, 'Il controllo · Parziale · 2 parti non lette dal controllo');
  assert.equal(q(h, 'label.mrv-veste-conferma').textContent.trim(), 'Ho verificato personalmente anche le 2 parti non lette dal controllo (1 nodo, 1 collegamento) e approvo i contenuti.');
});

test('K6-N6 il `title` porta il testo INTERO della nota decisa anche oltre gli 80 caratteri; una nota in conflitto si legge intera e non ha `title`', async () => {
  const lungo = 'Il nodo semplifica troppo: la fonte distingue fra le accuse alle banche e quelle al governo federale, e la descrizione le fonde in una sola.';
  const r = rapportoG1(); r.issues.find(i => i.id === 'a2').problem = lungo;
  const h = runtime1({ report: r }); h.apri1();
  // 0086, giro 3b: decisa col bottone in fondo (la spunta di a2 messa), che passa alla riga dopo; si torna su A
  const casella = q(h, '[data-veste-spunta="a2"]'); casella.checked = true; casella.onchange();
  await bottone(h).click(); await tick(); await tick();
  await vaiA1(h, 'A');
  assert.equal(q(h, '[data-veste-nota="a2"] .mrv-veste-nota-testo').getAttribute('title'), lungo);
  // in conflitto: le parole scritte e «Togli il collegamento» salvati in una seduta di prima (come D2; 0086 g3c)
  const { h: g } = conflittoLinkPrima(); g.apri1();
  await vaiA1(g, LINK_AB);
  const l1 = q(g, '[data-veste-nota="l1"]');
  assert.equal(l1.getAttribute('data-esito'), 'conflitto');
  assert.equal(q(g, '[data-veste-nota="l1"] .mrv-veste-nota-testo').getAttribute('title'), undefined, 'in conflitto la nota si legge intera');
});

test('K6-D2 un non letto corretto dal docente con la correzione in conflitto nell’anteprima è «da rivedere» (non «non letto») e lo dice', () => {
  const m = decidiTutto(g1Manifest());
  m.review = Core.addIssue(m.review, { target: { kind: 'node', id: 'C', field: 'desc' }, origin: 'teacher', blocking: true, problem: 'Modifica del docente' });
  const tid = m.review.initial.issues[m.review.initial.issues.length - 1].id;
  m.review = Core.setDecision(m.review, tid, 'manual', { text: 'Il commercio continuò fino al 1944.' });
  const h = runtime1({ manifest: m });
  const vera = h.window.MappAIReviewCore.preview;
  h.window.MappAIReviewCore.preview = (...a) => Object.assign({}, vera(...a), { ok: false, conflicts: [{ issueId: tid, code: 'invalid_replacement' }] });
  h.apri1();
  const c = rigaG1(h, 'C');
  assert.equal(c.getAttribute('data-stato'), 'da-rivedere');
  assert.match(c.textContent, /Scelte in conflitto/);
  assert.equal(q(h, '[data-veste-filtro="da-rivedere"]').textContent, 'Da rivedere 1');
});

test('K6-D4 (0086 g3c, D37.1): scritte nel Banco le parole PROPOSTE da una nota sul collegamento, il salvataggio non chiude le note; il bottone in fondo dice «Usa Proposta» e la nota è «Proposta scelta», senza conflitto con la correzione salvata', async () => {
  const r = rapportoG1();
  r.issues.push({ id: 'l2', target: { kind: 'link', source: 'A', target: 'B', rel: 'causa', field: 'rel' }, after: 'provoca', problem: 'Verbo impreciso.' });
  const h = runtime1({ report: r }); h.apri1();
  await vaiA1(h, LINK_AB);
  await scrivi(h, 'rel', 'provoca');
  assert.deepEqual([dec1(h, 'l2'), dec1(h, 'l1')], ['pending', 'pending'], 'il salvataggio non chiude le note');
  assert.equal(bottone(h).textContent, 'Usa Proposta');
  await premiG(h);
  assert.equal(dec1(h, 'l2'), 'accept', 'la proposta di l2 è scelta');
  assert.equal(dec1(h, 'l1'), 'reject', 'il collegamento resta');
  assert.equal(Core.preview(h.rev(), h.st.db).conflicts.filter(c => c.code === 'conflicting_decisions').length, 0);
});

test('K6-D4 le parole di un collegamento che parte da un nodo con altri collegamenti con le stesse parole (R → A e R → E, «include»): vanno su quello della riga, con la nota dell’editor della mappa', async () => {
  const r = rapportoG1();
  // una nota «togli il collegamento» (come l1): le parole scritte sono una correzione NUOVA, per la strada dell'editor della mappa
  r.issues.push({ id: 'l3', target: { kind: 'link', source: 'R', target: 'A', rel: 'include', field: '$link' }, after: null, problem: 'Nesso generico.' });
  const h = runtime1({ report: r }); h.apri1();
  const LINK_RA = JSON.stringify(['R', 'A', 'include']);
  await vaiA1(h, LINK_RA);
  await scrivi(h, 'rel', 'comprende');
  await premiG(h);   // 0086 g3d (D41): le parole si registrano col bottone in fondo
  const LE = h.window.MappAILinkEditorCore;
  assert.equal(docenti1(h).length, 1, 'la correzione è salvata');
  assert.equal(dec1(h, 'l3'), 'reject', 'la nota «togli il collegamento» con la spunta piena: tenuto');
  assert.ok(docenti1(h)[0].id.startsWith('teacher-link-label-'));
  assert.equal(LE.draft(h.rev(), LE.reference(DB1.links[0])), 'comprende', 'R → A');
  assert.equal(LE.draft(h.rev(), LE.reference(DB1.links[3])), 'include', 'R → E non si tocca');
});

test('K6-Q8 senza parti non lette il titolo della sezione non porta il conto («Completo» — settimo giro, Q14: era «Completa» —, «Parziale»: niente «0 parti»)', () => {
  const cop = { nodiEsaminati: ['R', 'A', 'B', 'C', 'D', 'E'], linkEsaminati: DB1.links.map(l => ({ source: l.source, target: l.target, rel: l.rel })), nodiSaltati: [], linkSaltati: [] };
  const h = runtime1({ manifest: decidiTutto(g1Manifest(rapportoG1({ stato: 'completo', copertura: cop }))) }); h.apri1();
  assert.equal(h.rev().initial.checkStatus, 'completed');
  assert.equal(q(h, '#mrv-coverage-options summary').textContent, 'Il controllo · Completo');
  // la legenda porta sempre il cerchio «Non letto dal controllo»: la riga che lo spiega c'è anche senza non letti (V66)
  assert.ok(!!q(h, '#mrv-coverage-options [data-veste-non-letto-def]'));
  const r = rapportoG1(); r.copertura.nodiSaltati = []; r.copertura.linkSaltati = [];
  const g = runtime1({ manifest: decidiTutto(g1Manifest(r)) }); g.apri1();
  assert.equal(q(g, '#mrv-coverage-options summary').textContent, 'Il controllo · Parziale');
});

test('K6-N6 solo G1: in G2 la nota decisa non si riduce (la regola del foglio di stile è sotto .mrv-veste-g1) e non prende il `title`', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc2');
  await premiG(h); await vaiA(h, 'mc2');   // 0086 g3c: decisa col bottone del materiale, che passa oltre
  assert.equal(decisione(h, 'n-mc2-e'), 'reject');
  assert.equal(q(h, '[data-veste-nota="n-mc2-e"] .mrv-veste-nota-testo').getAttribute('title'), undefined);
});

/* ═══ 0075, terzo giro (07/10), sulla seconda revisione avversaria ═══ */
/* Un editor dei collegamenti che rifiuta la scrittura con un codice (come fa `MappAILinkEditorCore.decision`): il codice non
   arriva al docente, arriva una frase che dice che cosa è successo e che cosa fare. */
function conEditorCheRifiuta(codice) {
  const h = runtime1();
  h.window.MappAILinkEditorCore = Object.assign({}, h.window.MappAILinkEditorCore, { decision: () => { throw new Error(codice); } });
  h.apri1();
  return h;
}
test('G3-3 i codici d’errore delle parole di un collegamento diventano frasi: ambiguous_label, link_changed, stale_revision, l’editor che manca e un ripiego per tutto il resto; niente scrittura, niente codice a schermo', async () => {
  const PIU_TARDI = '«Salva e continua più tardi»';
  const attese = {
    ambiguous_label: 'Fra questi due concetti c’è già un collegamento con queste parole e lo stesso verso: la correzione non è stata salvata. Scegli parole diverse.',
    link_changed: 'Questo collegamento non si ritrova in un punto solo della mappa (fra gli stessi due concetti ce n’è più d’uno, o non c’è più): la correzione non è stata salvata. Chiudi con ' + PIU_TARDI + ' e correggi le parole sulla mappa, dal collegamento.',
    stale_revision: 'La mappa o le fonti non corrispondono più alla versione di questa revisione: la correzione non è stata salvata. Le decisioni già prese restano; prima di continuare occorre riaprire la revisione sulla versione corretta del progetto.',
    errore_imprevisto_di_prova: 'La correzione non è stata salvata per un errore imprevisto; il testo resta nel campo. Riprova; se non si salva, chiudi con ' + PIU_TARDI + ' e riapri la revisione.'
  };
  for (const [codice, frase] of Object.entries(attese)) {
    const h = conEditorCheRifiuta(codice);
    await vaiA1(h, LINK_AB);
    const scritte = h.calls.manifest;
    const el = await scrivi(h, 'rel', 'genera');
    await premiG(h);   // 0086 g3d (D41): le parole si registrano col bottone in fondo, che dice anche che non ha scritto
    assert.equal(q(h, '#mrv-status').textContent.startsWith(frase), true, codice + ': ' + q(h, '#mrv-status').textContent);
    assert.ok(!q(h, '#mrv-status').textContent.includes(codice), 'niente codice a schermo: ' + codice);
    assert.equal(h.calls.manifest, scritte, 'niente scrittura: ' + codice);
    assert.equal(docenti1(h).length, 0);
    assert.equal(el.value, 'genera', 'il testo resta nel campo: ' + codice);
  }
  const s = runtime1({ senzaEditorCollegamenti: true }); s.apri1();
  await vaiA1(s, LINK_AB);
  await scrivi(s, 'rel', 'genera');
  await premiG(s);
  assert.equal(q(s, '#mrv-status').textContent.startsWith('L’editor dei collegamenti della mappa non è caricato, e senza di lui qui non si salvano le parole di un collegamento: la correzione non è stata salvata. Riavvia MappAI e riapri la revisione.'), true);
});

test('G3-4 una segnalazione del docente APERTA su un non letto (nata da «Aggiungi alla revisione» del Banco di prima) non è un vicolo cieco: la riga è da rivedere, il piede lo conta, la scheda la mostra col suo gesto; decisa, tornano la casella e il bottone', async () => {
  const m = decidiTutto(g1Manifest());
  m.review = Core.addIssue(m.review, { target: { kind: 'node', id: 'C', field: 'desc' }, problem: 'Modifica del docente: Commercio', origin: 'teacher', blocking: true });
  const tid = m.review.initial.issues[m.review.initial.issues.length - 1].id;
  const h = runtime1({ manifest: m }); h.apri1();
  const c = rigaG1(h, 'C');
  assert.equal(c.getAttribute('data-stato'), 'da-rivedere');
  assert.match(c.textContent, /1 nota/);
  assert.equal(q(h, '[data-veste-filtro="da-rivedere"]').textContent, 'Da rivedere 1');
  assert.deepEqual(qa(h, '[data-veste-gruppo]').filter(g => /^non-letti/.test(g.getAttribute('data-veste-gruppo'))).map(g => g.textContent), ['Nodi non letti dal controllo · 1', 'Collegamenti non letti dal controllo · 1'], 'resta fra i non letti: il conto di Q8 non cambia');
  assert.match(q(h, '#mrv-next-step').textContent, /^Resta 1 fra nodi e collegamenti con note aperte\./);
  assert.ok(!/cerca le righe/.test(q(h, '#mrv-next-step').textContent));
  assert.ok(!q(h, '#mrv-veste-conferma'));
  assert.equal(q(h, '#mrv-continue').hidden, true);
  await vaiA1(h, 'C');
  await q(h, '[data-veste-azioni-di="' + tid + '"] [data-veste-tieni]').click(); await tick(); await tick();
  assert.equal(esito1(h, tid), 'kept');
  assert.equal(q(h, '[data-veste-filtro="da-rivedere"]').textContent, 'Da rivedere 0');
  assert.ok(!!q(h, '#mrv-veste-conferma'), 'decisa la segnalazione, la casella torna');
});

test('G3-4 un conflitto senza nota (o una nota sospesa senza riga) non fa cercare righe che non ci sono: il piede dice che cosa fare', () => {
  const casi = [
    { ok: false, conflicts: [{ issueId: null, code: 'invalid_review' }], unresolved: [] },
    { ok: false, conflicts: [], unresolved: ['nota-che-non-ha-una-riga'] }];
  for (const finto of casi) {
    const h = runtime1({ manifest: decidiTutto(g1Manifest()) });
    const vera = h.window.MappAIReviewCore.preview;
    h.window.MappAIReviewCore.preview = (...a) => Object.assign({}, vera(...a), finto);
    h.apri1();
    const piede = q(h, '#mrv-next-step').textContent;
    assert.equal(q(h, '[data-veste-filtro="da-rivedere"]').textContent, 'Da rivedere 0');
    assert.ok(!/cerca le righe/.test(piede), piede);
    assert.match(piede, /^Le decisioni non si possono ancora applicare alla mappa, ma nessuna riga dell’elenco ne è la causa: chiudi con «Salva e continua più tardi» e riapri la revisione\. Le decisioni prese restano salvate\./);
  }
});

test('G3-5 (Q8) con la veste il blocco dello strato non dà un secondo conto dei non letti («collegamenti che il controllo non ha esaminato», l’unione dei giri) accanto a quello della barra, e dice «1 collegamento da decidere» al singolare; a veste spenta cambia solo quel singolare', () => {
  const h = conStrato1(runtime1({ storage: STRATO })); h.apri1();
  const conti = q(h, '#mrv-coverage-options [data-aff-conteggi]').textContent;
  assert.ok(!/non ha esaminato/.test(conti), conti);
  assert.match(conti, / · 1 collegamento da decidere$/);
  assert.equal(q(h, '#mrv-coverage-options summary').textContent, 'Il controllo · Parziale · 2 parti non lette dal controllo');
  // a veste spenta il blocco è quello del Banco di prima: «1 collegamenti che il controllo non ha esaminato» lo fissa
  // tests/review-controller.test.js (fuori dal perimetro), quindi resta al plurale
  const s = conStrato1(runtime1({ storage: Object.assign({ mappai_banco_veste: '0' }, STRATO) })); s.apri1();
  assert.ok(!s.modal.className.includes('mrv-veste'));
  assert.match(q(s, '[data-aff-conteggi]').textContent, / · 1 collegamento da decidere · 1 collegamenti che il controllo non ha esaminato$/);
});

/* ═══ 0075, quarto giro (07/10), sulla terza revisione avversaria ═══
   K7-D1 (Q9 com'è decisa): quando il campo mostra la proposta aperta di una nota (rev. 4, A.5), il salvataggio vale «Usa
   la proposta» di quella nota più il ritocco; la veste passa al core quale nota è nel campo. Stesso esito con e senza il
   bottone. K7-R2: un errore imprevisto su un gesto senza campo ha la sua frase. K7-R3: la frase delle note rimaste
   aperte dice anche il caso di Q9. K7-V7, K7-V9, K7-V10: test minimi del revisore, portati. */
test('K7-R2 un errore imprevisto su un gesto senza campo («Tieni il testo», «Usa la proposta», «Escludi», «Ripristina») ha la sua frase, non «il testo resta nel campo»; il codice resta nella console; niente scrittura', async () => {
  const GESTO = 'La scelta non è stata salvata per un errore imprevisto. Riprova; se non si salva, chiudi con «Salva e continua più tardi» e riapri la revisione.';
  const prova = async (h, gesti) => {
    const W = h.window.MappAIReviewCore, o1 = W.setDecision, o2 = W.setItemExcluded, warn = console.warn, avvisi = [];
    const boom = () => { throw Object.assign(new Error('boom_di_prova'), { code: 'boom_di_prova' }); };
    for (const [nome, fn] of gesti) {
      W.setDecision = boom; W.setItemExcluded = boom; avvisi.length = 0;
      console.warn = (...a) => avvisi.push(a.join(' '));
      const scritte = h.calls.manifest;
      try { await fn(); } finally { W.setDecision = o1; W.setItemExcluded = o2; console.warn = warn; }
      assert.equal(q(h, '#mrv-status').textContent, GESTO, nome);
      assert.ok(avvisi.some(a => a.includes('boom_di_prova')), nome + ': ' + JSON.stringify(avvisi));
      assert.equal(h.calls.manifest, scritte, nome + ': niente scrittura');
    }
  };
  const h = runtime(); h.apri(); await vaiA(h, 'mc1');
  await prova(h, [
    // 0086 g3c: in G2 le note non hanno più gesti; il gesto senza campo è il bottone del materiale con le spunte
    ['G2 il bottone del materiale', async () => { await bottone(h).click(); await tick(); await tick(); }],
    ['G2 «Escludi»', async () => { await vaiA(h, 'ca1'); await q(h, '#mrv-veste-escludi').click(); await tick(); await tick(); }]]);
  await q(h, '#mrv-veste-escludi').click(); await tick(); await tick();
  assert.equal(statoRiga(h, 'ca1'), 'escluso');
  await prova(h, [['G2 «Ripristina»', async () => { await q(h, '#mrv-veste-escludi').click(); await tick(); await tick(); }]]);
  assert.equal(statoRiga(h, 'ca1'), 'escluso');
  // 0086, giro 3b: in G1 le note dei nodi non hanno più gesti (prima «Tieni il testo» / «Usa la proposta» di a1): il gesto
  // senza campo è il bottone in fondo (la spunta di a2, descrizione intera, messa)
  const g = runtime1(); g.apri1(); await vaiA1(g, 'A');
  const casella = q(g, '[data-veste-spunta="a2"]'); casella.checked = true; casella.onchange();
  await prova(g, [['G1 il bottone in fondo', async () => { await bottone(g).click(); await tick(); }]]);
  assert.equal(dec1(g, 'a1'), 'pending');
});

/* ═══ test minimi del revisore (terzo giro), portati ═══ */
test('K7-V7 il ripiego dei codici d’errore lascia il codice nella console (console.warn), non a schermo', async () => {
  const h = conEditorCheRifiuta('errore_imprevisto_di_prova');
  await vaiA1(h, LINK_AB);
  const warn = console.warn, avvisi = [];
  console.warn = (...a) => avvisi.push(a.join(' '));
  try { await scrivi(h, 'rel', 'genera'); await premiG(h); } finally { console.warn = warn; }   // 0086 g3d (D41): registrate col bottone
  assert.ok(!q(h, '#mrv-status').textContent.includes('errore_imprevisto_di_prova'));
  assert.ok(avvisi.some(a => a.includes('errore_imprevisto_di_prova')), JSON.stringify(avvisi));
});
test('K7-V9 «1 collegamento da decidere» usa la chiave del singolare (in inglese non diventa «1 links»)', () => {
  const h = conStrato1(runtime1({ storage: STRATO }));
  h.window.t = (k, f) => '[' + k + ']' + f;
  h.apri1();
  const conti = q(h, '#mrv-coverage-options [data-aff-conteggi]').textContent;
  assert.match(conti, / · 1 \[aff_count_link\]collegamento da decidere$/, conti);
});
test('K7-V10 un non letto corretto dal docente con una seconda segnalazione del docente ancora aperta è da rivedere e NON conta fra i «Fatti»', async () => {
  const fatti = h => q(h, '[data-veste-filtro="fatti"]').textContent;
  const conUna = () => {
    const m = decidiTutto(g1Manifest());
    m.review = Core.addIssue(m.review, { target: { kind: 'node', id: 'C', field: 'desc' }, problem: 'Modifica del docente: Commercio', origin: 'teacher', blocking: true });
    const t1 = m.review.initial.issues[m.review.initial.issues.length - 1].id;
    m.review = Core.setDecision(m.review, t1, 'manual', { text: 'Il commercio continuò con la Germania.' });
    return m;
  };
  const a = runtime1({ manifest: conUna() }); a.apri1();
  assert.equal(rigaG1(a, 'C').getAttribute('data-stato'), 'fatto');
  const prima = fatti(a);
  const m = conUna();
  m.review = Core.addIssue(m.review, { target: { kind: 'node', id: 'C', field: 'desc' }, problem: 'Aggiunta alla revisione: Commercio', origin: 'teacher', blocking: true });
  const h = runtime1({ manifest: m }); h.apri1();
  assert.equal(rigaG1(h, 'C').getAttribute('data-stato'), 'da-rivedere');
  const n = s => Number((/(\d+)\s*$/.exec(s) || [])[1]);
  assert.equal(n(fatti(h)), n(prima) - 1, prima + ' → ' + fatti(h));
});

/* ═══ 0075, quinto giro (07/10), sulla quarta revisione avversaria: i test minimi del revisore ═══ */
// K8-VG4-D1 dalla scheda: conflitto già presente sulla desc (a3 e a6 scelte, si scontrano), a4 aperta con proposta (scritta nel campo)
// K8-VG4-D2: la bozza ricostruita (`costruisciSchedaG1(bozzeDi())`) prendeva la proposta della nota aperta ADESSO, non di quella
// su cui è stata scritta: due gesti «sospesi» (R6, conflitto sul titolo con una correzione del docente) e a3 si chiudeva da sola
// K8-VG4-R9: il testo inglese delle due frasi cambiate nel quarto giro
test('K8-VG4-R9 in inglese le note rimaste aperte dicono anche il caso di Q9', () => {
  const en = fs.readFileSync(require.resolve('../public/traduzioni/en_translations.js'), 'utf8');
  for (const k of ['rv_veste_g1_restano_aperte', 'rv_veste_g1_nessuna_chiusa']) {
    const riga = en.split('\n').find(r => r.trim().startsWith(k + ':')) || '';
    assert.match(riga, /had already been changed by another choice/, k);
  }
});
// K8-VG4-D2 controprova (guardia delle mutazioni, verde anche prima): ricostruita la scheda con la STESSA nota ancora aperta, la
// bozza vale ancora «Usa la proposta» più il ritocco: q, la cui frase la proposta a schermo aveva già cambiato, resta aperta (Q9)
/* ═══ 0075, sesto giro (07/10): i rilievi del gate 3 di Giacomo ═══════════════════════════════════════════════
   Q10 «Va bene così» sui non letti; il difetto del cambio e ritorno (un testo rimesso com'era non lascia una correzione
   del docente); Q11 i due gruppi dei non letti; Q12 i bottoni della nota con «Prima / Dopo». Scritti prima del codice. */
const vaBene = h => q(h, '#mrv-veste-bottone');
const checks1 = h => h.rev().initial.manualChecks || {};
const K_C = 'g1:nodo:C', K_CD = 'g1:link:' + LINK_CD;
const DESC_C = 'Il commercio continuò.';
const gruppi1 = h => qa(h, '[data-veste-gruppo]').map(g => g.getAttribute('data-veste-gruppo') + '=' + g.textContent);
const chip1 = (h, p) => qa(h, '[data-veste-suggerimenti] button').find(b => b.getAttribute('data-veste-parola') === p);
const haChiave = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);

/* ── Q11: due gruppi ── */
test('G6-Q11 due gruppi in barra: «Nodi non letti dal controllo · N» e «Collegamenti non letti dal controllo · M» al posto di quello unico; righe e numeri restano', () => {
  const h = runtime1(); h.apri1();
  assert.deepEqual(gruppi1(h), ['nodi=Nodi segnalati · 2 di 2', 'collegamenti=Collegamenti segnalati · 1 di 1',
    'non-letti-nodi=Nodi non letti dal controllo · 1', 'non-letti-collegamenti=Collegamenti non letti dal controllo · 1']);
  assert.deepEqual(righe1(h).map(b => b.getAttribute('data-veste-riga')), ['A', 'B', LINK_AB, 'C', LINK_CD]);
  assert.deepEqual(righe1(h).map(b => b.querySelector('.mrv-veste-num').textContent), ['1', '2', '3', '4', '5']);
});
test('G6-Q11 un gruppo vuoto non si mostra; i conti di Q8 (testata, casella, «Il controllo») restano la somma dei due', () => {
  const soloNodi = rapportoG1(); soloNodi.copertura.linkSaltati = [];
  const a = runtime1({ manifest: decidiTutto(g1Manifest(soloNodi)) }); a.apri1();
  assert.deepEqual(gruppi1(a).filter(g => g.startsWith('non-letti')), ['non-letti-nodi=Nodi non letti dal controllo · 1']);
  const soloLink = rapportoG1(); soloLink.copertura.nodiSaltati = [];
  const b = runtime1({ manifest: decidiTutto(g1Manifest(soloLink)) }); b.apri1();
  assert.deepEqual(gruppi1(b).filter(g => g.startsWith('non-letti')), ['non-letti-collegamenti=Collegamenti non letti dal controllo · 1']);
  const tre = rapportoG1(); tre.copertura.nodiSaltati.push({ id: 'E', label: 'Esercito', motivo: 'risposta interrotta' });
  const h = runtime1({ manifest: decidiTutto(g1Manifest(tre)) }); h.apri1();
  assert.deepEqual(gruppi1(h).filter(g => g.startsWith('non-letti')),
    ['non-letti-nodi=Nodi non letti dal controllo · 2', 'non-letti-collegamenti=Collegamenti non letti dal controllo · 1']);
  assert.equal(q(h, '#mrv-veste-riepilogo').textContent, '6 nodi · 3 segnalati · 3 parti non lette dal controllo');
  assert.equal(q(h, 'label.mrv-veste-conferma').textContent.trim(), 'Ho verificato personalmente anche le 3 parti non lette dal controllo (2 nodi, 1 collegamento) e approvo i contenuti.');
  assert.equal(q(h, '#mrv-coverage-options summary').textContent, 'Il controllo · Parziale · 3 parti non lette dal controllo');
});

/* ── il difetto del cambio e ritorno ── */
test('G6-D cambio e ritorno su un nodo non letto: rimesso il testo di partenza, la correzione del docente si toglie (nota e decisione) e la riga torna «non letta»; ⌘Z la rimette, ⇧⌘Z la toglie', async () => {
  const h = runtime1(); h.apri1(); await vaiA1(h, 'C');
  const fatti = () => q(h, '[data-veste-filtro="fatti"]').textContent, prima = fatti();
  await scrivi(h, 'desc', 'Il commercio con la Germania continuò.');
  assert.equal(docenti1(h).length, 1);
  assert.equal(rigaG1(h, 'C').getAttribute('data-stato'), 'fatto');
  const tid = docenti1(h)[0].id;
  await scrivi(h, 'desc', DESC_C);
  assert.equal(docenti1(h).length, 0, 'nessuna segnalazione del docente');
  assert.ok(!haChiave(h.rev().initial.decisions, tid), 'e nessuna decisione rimasta senza la sua nota');
  assert.equal(rigaG1(h, 'C').getAttribute('data-stato'), 'non-letto');
  assert.ok(!!rigaG1(h, 'C').querySelector('.mrv-veste-cerchio'));
  assert.equal(fatti(), prima);
  assert.match((q(h, '[data-veste-chiuse]') || { textContent: '' }).textContent, /tolta/);
  assert.equal(h.saved.manifest.review.initial.issues.filter(i => i.origin === 'teacher').length, 0, 'nemmeno nei dati salvati');
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(docenti1(h).length, 1, '⌘Z rimette la correzione');
  assert.equal(esito1(h, tid), 'edited');
  fuoriDalModale(h, CMD_SHIFT_Z); await tick(); await tick();
  assert.equal(docenti1(h).length, 0, '⇧⌘Z la toglie di nuovo');
});
test('G6-D cambio e ritorno sulle parole di un collegamento non letto: un suggerimento e poi quello di partenza (la strada di MappAILinkEditorCore), «Nessuna» e poi le parole, e a mano — nessuna correzione resta', async () => {
  const h = runtime1(); h.apri1(); await vaiA1(h, LINK_CD);
  await chip1(h, 'segue').click(); await tick();
  assert.equal(docenti1(h).length, 1);
  assert.match(docenti1(h)[0].id, /^teacher-link-label-/, 'la correzione è nata dalla strada dell’editor della mappa');
  assert.equal(rigaG1(h, LINK_CD).getAttribute('data-stato'), 'fatto');
  await chip1(h, 'precede').click(); await tick();
  assert.equal(docenti1(h).length, 0);
  assert.deepEqual(Object.keys(h.rev().initial.decisions).filter(k => /^teacher-/.test(k)), []);
  assert.equal(rigaG1(h, LINK_CD).getAttribute('data-stato'), 'non-letto');
  assert.equal(campo(h, 'rel').value, 'precede');
  await qa(h, '[data-veste-suggerimenti] button')[0].click(); await tick();
  assert.equal(docenti1(h).length, 1, '«Nessuna» è una correzione');
  await chip1(h, 'precede').click(); await tick();
  assert.equal(docenti1(h).length, 0);
  await scrivi(h, 'rel', 'segue');
  assert.equal(docenti1(h).length, 1);
  await scrivi(h, 'rel', 'precede');
  assert.equal(docenti1(h).length, 0);
  assert.equal(rigaG1(h, LINK_CD).getAttribute('data-stato'), 'non-letto');
});
test('G6-D le parole corrette prima dalla MAPPA (editor dei collegamenti, nota «teacher-link-label-…»): rimesse nel Banco quelle di partenza, la correzione si toglie', async () => {
  const LE = require('../public/js/mappai-link-editor-core.js');
  const m = g1Manifest();
  m.review = LE.decision(m.review, DB1, LE.reference(DB1.links[2]), 'segue', { problem: 'Parole del collegamento modificate dal docente.' });
  const h = runtime1({ manifest: m }); h.apri1();
  assert.equal(rigaG1(h, LINK_CD).getAttribute('data-stato'), 'fatto');
  await vaiA1(h, LINK_CD);
  assert.equal(campo(h, 'rel').value, 'segue');
  await chip1(h, 'precede').click(); await tick();
  assert.equal(docenti1(h).length, 0);
  assert.equal(rigaG1(h, LINK_CD).getAttribute('data-stato'), 'non-letto');
});
test('G6-D su ogni campo di G1: il titolo di un nodo segnalato cambiato e rimesso com’era non lascia la correzione del docente; la nota del controllo resta com’era', async () => {
  // 0086 g3d (D41): b1 decisa in una seduta di prima, perché il campo si salvi all'uscita (con la nota aperta è una bozza fino al bottone)
  const m = g1Manifest(); m.review = Core.setDecision(m.review, 'b1', 'reject');
  const h = runtime1({ manifest: m }); h.apri1(); q(h, '[data-veste-filtro="tutti"]').onclick(); await vaiA1(h, 'B');
  await scrivi(h, 'label', 'Banche svizzere');
  assert.equal(docenti1(h).length, 1);
  assert.equal(docenti1(h)[0].target.field, 'label');
  await scrivi(h, 'label', 'Banche');
  assert.equal(docenti1(h).length, 0);
  assert.equal(dec1(h, 'b1'), 'reject');
});
// guardia delle mutazioni (D4): si tolgono solo le note DEL DOCENTE; una nota del controllo chiusa dalla correzione e poi
// riportata al testo di partenza resta, decisa come la legge il core («Testo mantenuto senza modifiche»)
test('G6-D controprova (0086 g3b, D37.1; g3d, D41): la nota del controllo non si toglie — corretto e rimesso com’era, la nota sola di B resta com’era; la correzione del docente si toglie', async () => {
  // 0086 g3d (D41): b1 decisa in una seduta di prima, perché il campo si salvi all'uscita (con la nota aperta è una bozza fino al bottone)
  const m = g1Manifest(); m.review = Core.setDecision(m.review, 'b1', 'reject');
  const h = runtime1({ manifest: m }); h.apri1(); q(h, '[data-veste-filtro="tutti"]').onclick(); await vaiA1(h, 'B');
  await scrivi(h, 'desc', 'Le banche custodivano oro tedesco e italiano.');
  assert.equal(esito1(h, 'b1'), 'kept', 'la correzione non tocca la nota «tenuta»');
  assert.equal(docenti1(h).length, 1);
  await scrivi(h, 'desc', 'Le banche custodivano oro tedesco.');
  assert.ok(h.rev().initial.issues.some(i => i.id === 'b1'), 'la nota del controllo resta fra le segnalazioni');
  assert.equal(esito1(h, 'b1'), 'kept');
  assert.equal(docenti1(h).length, 0);
});
test('G6-D controprova: un testo diverso da quello di partenza resta la correzione del docente (la si toglie solo quando il testo torna com’era)', async () => {
  const h = runtime1(); h.apri1(); await vaiA1(h, 'C');
  await scrivi(h, 'desc', 'Il commercio con la Germania continuò.');
  await scrivi(h, 'desc', 'Il commercio continuò fino al 1944.');
  assert.equal(docenti1(h).length, 1);
  assert.equal(h.rev().initial.decisions[docenti1(h)[0].id].text, 'Il commercio continuò fino al 1944.');
});

/* ── Q10: «Va bene così» ── */
test('G6-Q10 «Va bene così» su un nodo non letto: la riga è fatta con la spunta e nessuna segnalazione nasce; si registra in manualChecks (g1:nodo:<id>) con l’impronta del testo mostrato; poi il non letto dopo', async () => {
  const h = runtime1(); h.apri1(); await vaiA1(h, 'C');
  const b = vaBene(h);
  assert.equal(b.hidden, false); assert.equal(b.textContent, 'Va bene così'); assert.equal(b.disabled, false);
  assert.equal(b.getAttribute('aria-pressed'), 'false');
  assert.equal(q(h, '#mrv-veste-attesa').textContent, 'Se il testo va bene premi «Va bene così»; se lo correggi, la correzione si salva da sé.');
  const issues = clone(h.rev().initial.issues), decisions = clone(h.rev().initial.decisions), gruppi = gruppi1(h), testata = q(h, '#mrv-veste-riepilogo').textContent;
  await b.click(); await tick(); await tick();
  assert.deepEqual(Object.keys(checks1(h)), [K_C]);
  assert.equal(checks1(h)[K_C].impronta, impronta(JSON.stringify(DESC_C)));
  assert.deepEqual(h.rev().initial.issues, issues, 'nessuna segnalazione');
  assert.deepEqual(h.rev().initial.decisions, decisions);
  const c = rigaG1(h, 'C');
  assert.equal(c.getAttribute('data-stato'), 'fatto');
  assert.equal(c.querySelector('.mrv-teacher-approved').getAttribute('aria-label'), 'Va bene così');
  assert.deepEqual(gruppi1(h), gruppi, 'i conti dei gruppi non cambiano');
  assert.equal(q(h, '#mrv-veste-riepilogo').textContent, testata);
  assert.equal(q(h, '[data-veste-filtro="fatti"]').textContent, 'Fatti 1');
  assert.equal(h.saved.manifest.review.initial.manualChecks[K_C].impronta, checks1(h)[K_C].impronta, 'salvata nel progetto');
  assert.equal(scheda(h), LINK_CD, 'si passa al non letto dopo');
  await vaiA1(h, 'C');
  assert.equal(vaBene(h).getAttribute('aria-pressed'), 'true');
  assert.match(q(h, '#mrv-veste-attesa').textContent, /Va bene così/);
  const scritte = h.calls.manifest;
  await vaBene(h).click(); await tick();
  assert.equal(h.calls.manifest, scritte, 'un secondo clic non scrive');
});
test('G6-Q10 «Va bene così» su un collegamento non letto: chiave g1:link:[source,target,parole di partenza], impronta delle parole mostrate, la spunta', async () => {
  const h = runtime1(); h.apri1(); await vaiA1(h, LINK_CD);
  await vaBene(h).click(); await tick(); await tick();
  assert.deepEqual(Object.keys(checks1(h)), [K_CD]);
  assert.equal(K_CD, 'g1:link:["C","D","precede"]');
  assert.equal(checks1(h)[K_CD].impronta, impronta(JSON.stringify('precede')));
  assert.equal(rigaG1(h, LINK_CD).getAttribute('data-stato'), 'fatto');
  assert.equal(docenti1(h).length, 0);
});
// controprova (verde anche prima del codice della spunta, guardia delle mutazioni): una spunta con un'impronta che non è
// quella del testo mostrato non conta — la riga resta «non letta» e il bottone non è premuto
test('G6-Q10 controprova: una spunta salvata con un’impronta diversa da quella del testo mostrato non conta', async () => {
  const m = g1Manifest();
  m.review = Core.setManualCheck(Core.setManualCheck(m.review, K_C, impronta(JSON.stringify('Il commercio finì.'))), K_CD, impronta(JSON.stringify('segue')));
  const h = runtime1({ manifest: m }); h.apri1();
  assert.equal(rigaG1(h, 'C').getAttribute('data-stato'), 'non-letto');
  assert.equal(rigaG1(h, LINK_CD).getAttribute('data-stato'), 'non-letto');
  await vaiA1(h, 'C');
  assert.equal(vaBene(h).getAttribute('aria-pressed'), 'false');
});
test('G6-Q10 ⌘Z toglie «Va bene così» e lo dice, ⇧⌘Z lo rimette: un’azione della pila della veste', async () => {
  const h = runtime1(); h.apri1(); await vaiA1(h, 'C');
  await vaBene(h).click(); await tick(); await tick();
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.ok(!haChiave(checks1(h), K_C));
  assert.equal(rigaG1(h, 'C').getAttribute('data-stato'), 'non-letto');
  assert.equal(scheda(h), 'C', '⌘Z riapre la riga che ha toccato');
  assert.match(q(h, '#mrv-status').textContent, /Annullato: «Va bene così» su Commercio/);
  fuoriDalModale(h, CMD_SHIFT_Z); await tick(); await tick();
  assert.ok(haChiave(checks1(h), K_C));
  assert.equal(rigaG1(h, 'C').getAttribute('data-stato'), 'fatto');
});
test('G6-Q10 corretto dopo «Va bene così»: vale la correzione (segnalazione del docente) e la spunta della vecchia impronta non conta; rimesso il testo letto, torna «Va bene così»', async () => {
  const h = runtime1(); h.apri1(); await vaiA1(h, 'C');
  await vaBene(h).click(); await tick(); await tick();
  await vaiA1(h, 'C');
  await scrivi(h, 'desc', 'Il commercio con la Germania continuò.');
  assert.equal(docenti1(h).length, 1);
  assert.equal(esito1(h, docenti1(h)[0].id), 'edited');
  assert.equal(rigaG1(h, 'C').getAttribute('data-stato'), 'fatto');
  assert.equal(rigaG1(h, 'C').querySelector('.mrv-teacher-approved').getAttribute('aria-label'), 'Deciso', 'fatta per la correzione, non per «Va bene così»');
  assert.notEqual(checks1(h)[K_C].impronta, impronta(JSON.stringify('Il commercio con la Germania continuò.')));
  assert.equal(vaBene(h).hidden, true, 'la correzione decide: «Va bene così» non si offre');
  await scrivi(h, 'desc', DESC_C);
  assert.equal(docenti1(h).length, 0);
  assert.equal(rigaG1(h, 'C').querySelector('.mrv-teacher-approved').getAttribute('aria-label'), 'Va bene così', 'il testo è di nuovo quello letto');
});
test('G6-Q10 «Va bene così» c’è solo sui non letti: non sui segnalati, non con una segnalazione del docente aperta, non a revisione approvata; con un campo non valido è spento; la battitura si salva prima', async () => {
  const h = runtime1(); h.apri1();
  // 0086, giro 3b: su un nodo segnalato il bottone della barra c'è, ma è il bottone in fondo (D37.6), non «Va bene così»
  assert.equal(scheda(h), 'A'); assert.notEqual(vaBene(h).textContent, 'Va bene così');
  // 0086 g3c: anche sul collegamento il bottone della barra è il bottone in fondo, non «Va bene così»
  await vaiA1(h, LINK_AB); assert.notEqual(vaBene(h).textContent, 'Va bene così');
  // un nodo segnalato con le note tutte decise (guardia delle mutazioni, Q10f): niente note aperte, e il bottone non c'è
  const deciso = runtime1({ manifest: decidiTutto(g1Manifest()) }); deciso.apri1();
  q(deciso, '[data-veste-filtro="tutti"]').onclick(); await vaiA1(deciso, 'B');
  assert.equal(rigaG1(deciso, 'B').getAttribute('data-stato'), 'fatto');
  assert.equal(vaBene(deciso).hidden, true, 'non sui segnalati, nemmeno decisi');
  await vaiA1(h, LINK_CD);
  const el = entra(campo(h, 'rel')); el.value = '  '; el.oninput(); el.onblur(); await tick();
  // 0086, giro 2 bis (difetto 7 del revisore): con una battitura in sospeso «Va bene così» non c'è (era spento): le parole
  // vuote senza «Nessuna» sono una battitura in sospeso, e la frase accanto dice che cosa manca
  assert.equal(vaBene(h).hidden, true, 'le parole vuote senza «Nessuna» fermano il bottone');
  assert.match(q(h, '#mrv-veste-attesa').textContent, /Scrivi le parole del collegamento/);
  assert.equal(tasto(h, { key: 'Escape' }), true);
  assert.equal(vaBene(h).hidden, false, 'Esc rimette le parole: il bottone torna');
  // la battitura non salvata si salva all'uscita: diventa la correzione, e la spunta non serve (giro 2 bis: col campo in
  // sospeso il bottone non c'è, quindi non si preme; era «la battitura si salva prima» del clic)
  await vaiA1(h, 'C');
  const d = entra(campo(h, 'desc')); d.value = 'Il commercio continuò a lungo.'; d.oninput();
  assert.equal(vaBene(h).hidden, true);
  d.onblur(); await tick();
  assert.equal(docenti1(h).length, 1);
  assert.ok(!haChiave(checks1(h), K_C));
  const m = decidiTutto(g1Manifest());
  m.review = Core.addIssue(m.review, { target: { kind: 'node', id: 'C', field: 'desc' }, problem: 'Modifica del docente: Commercio', origin: 'teacher', blocking: true });
  const g = runtime1({ manifest: m }); g.apri1(); await vaiA1(g, 'C');
  assert.equal(vaBene(g).hidden, true, 'la nota aperta del docente decide col suo gesto');
  const a = runtime1({ manifest: decidiTutto(g1Manifest()) }); a.apri1();
  q(a, '#mrv-veste-conferma').checked = true; q(a, '#mrv-veste-conferma').onchange();
  await q(a, '#mrv-continue').click(); await tick(); await tick();
  const ap = runtime1({ manifest: a.m }); ap.apri1(); await vaiA1(ap, 'C');
  assert.equal(vaBene(ap).hidden, true, 'approvata: sola lettura');
});
test('G6-Q10 le chiavi di «Va bene così» non disturbano niente: righeMappa, approvazione e cancello di G1, quarantena (corsie, firma), G2 con la veste accesa e spenta', () => {
  const Aff = require('../public/js/mappai-affermazioni-core');
  const senza = decidiTutto(g1Manifest()).review;
  const con = Core.setManualCheck(Core.setManualCheck(senza, K_C, impronta(JSON.stringify(DESC_C))), K_CD, impronta(JSON.stringify('precede')));
  assert.deepEqual(BancoCore.righeMappa(con, DB1), BancoCore.righeMappa(senza, DB1), 'righeMappa le ignora: le legge la veste');
  const a = Core.beginApproval(con, DB1, { manualReview: true }), b = Core.beginApproval(senza, DB1, { manualReview: true });
  assert.equal(a.ok, true);
  assert.equal(a.revision, b.revision); assert.deepEqual(a.db, b.db); assert.deepEqual(a.overrides, b.overrides);
  assert.deepEqual(Core.gate(Core.completeApproval(a.review, a.revision), DB1), Core.gate(Core.completeApproval(b.review, b.revision), DB1));
  assert.deepEqual(Aff.corsie({ review: con, db: DB1, sources: SOURCES1 }), Aff.corsie({ review: senza, db: DB1, sources: SOURCES1 }));
  assert.equal(Aff.firma(con, DB1), Aff.firma(senza, DB1));
  // G2: le stesse chiavi nella revisione dei materiali (la stessa struttura delle sue approvazioni) non cambiano niente
  const html = (chiavi, flag) => {
    const m = finalManifest(ITEMS, rapporto());
    if (chiavi) m.review.final.review = Core.setManualCheck(Core.setManualCheck(m.review.final.review, K_C, 'x'), K_CD, 'y');
    const h = runtime({ manifest: m, flag }); h.apri(); return h.dom.html();
  };
  assert.equal(html(true, '1'), html(false, '1'));
  assert.equal(html(true, '0'), html(false, '0'));
});
test('G6-Q10 a decisioni finite, con «Va bene così» sui due non letti: la casella «Ho verificato personalmente…» serve come oggi, e la chiusura approva la stessa mappa che senza spunte', async () => {
  const chiudi = async conSpunte => {
    const h = runtime1({ manifest: decidiTutto(g1Manifest()) }); h.apri1();
    if (conSpunte) {
      await vaiA1(h, 'C'); await vaBene(h).click(); await tick(); await tick();
      await vaiA1(h, LINK_CD); await vaBene(h).click(); await tick(); await tick();
    }
    const casella = q(h, '#mrv-veste-conferma');
    assert.ok(!!casella, 'la casella resta');
    assert.equal(q(h, '#mrv-continue').hidden, true);
    casella.checked = true; casella.onchange();
    await q(h, '#mrv-continue').click(); await tick(); await tick();
    assert.equal(h.rev().initial.status, 'approved');
    return h;
  };
  const con = await chiudi(true), senza = await chiudi(false);
  assert.equal(con.rev().approvedRevision, senza.rev().approvedRevision);
  assert.deepEqual(con.rev().approvedSnapshot, senza.rev().approvedSnapshot);
  assert.deepEqual(Object.keys(con.rev().initial.manualChecks).sort(), [K_C, K_CD].sort());
  assert.equal(Core.gate(con.rev(), con.st.db).allowed, Core.gate(senza.rev(), senza.st.db).allowed);
});

/* ── Q12: «Usa Dopo», l'area «Dopo»; settimo giro, Q13: il primo bottone è «Va bene così» (era «Tieni Prima»).
   Undicesimo giro, Q18: i nomi diventano «Usa Proposta», «Tieni Originale», aree «Originale» / «Proposta» senza qualificatori ── */
test('G6-Q12 G2 (0086 g3c): niente bottoni nelle note — la proposta letta nella nota si chiama «Proposta» e la sua area la copia nel campo; «Proposta», poi «Tua versione» scrivendo; esclusione con la spunta; esiti come prima', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc1');
  assert.deepEqual(bottoniNotaG(h, 'n-mc1-q'), []);
  assert.equal(q(h, '[data-veste-nota="n-mc1-q"] [data-veste-nota-proposta] .mrv-veste-sotto').textContent, 'Proposta');
  const c = () => q(h, '[data-veste-campo="question"]');
  areaG(h, 'n-mc1-q').onclick(); await tick();
  assert.equal(c().querySelector('[data-veste-prima-nome]').textContent, 'Originale');
  assert.equal(c().querySelector('[data-veste-proposta-nome]').textContent, 'Proposta');
  await premiG(h); await vaiA(h, 'mc1');
  assert.equal(q(h, '[data-veste-nota="n-mc1-q"] [data-veste-esito]').textContent, 'Proposta scelta', 'le frasi d’esito non cambiano');
  await vaiA(h, 'mc2');
  assert.deepEqual(bottoniNotaG(h, 'n-mc2-e'), []);
  const el = entra(campo(h, 'explanation')); el.value = 'Furono le banche.'; el.oninput();
  assert.equal(q(h, '[data-veste-campo="explanation"] [data-veste-proposta-nome]').textContent, 'Tua versione', 'Q18: niente «· testo tuo»; 0086: «Tua versione»');
  tasto(h, { key: 'Escape' });
  await vaiA(h, 'ca1');
  assert.deepEqual(bottoniNotaG(h, 'n-ca1'), []);
  assert.equal(nomeSpuntaG(h, 'n-ca1'), 'Tieni il materiale');
});
test('G6-Q12 G1 (0086 g3b, g3c): niente bottoni nelle note — la proposta letta nella nota si chiama «Proposta» e la sua area la copia nel campo; sul collegamento la spunta «Tieni il collegamento»', async () => {
  const h = runtime1(); h.apri1(); await vaiA1(h, 'A');
  /* 0086, giro 3b (D36): sui nodi le note non hanno più bottoni — la proposta sta nell'area «Proposta» della nota, che la
     copia nel campo, e il campo parte dall'«Originale». Prima: «Usa Proposta» / «Tieni Originale» su a1, «Tieni Originale»
     su a2, il campo con la proposta di a1 («Proposta»). */
  assert.equal(qa(h, '[data-veste-nota] button').length, 0);
  assert.equal(q(h, '[data-veste-nota="a1"] [data-veste-nota-proposta] .mrv-veste-sotto').textContent, 'Proposta');
  assert.equal(q(h, '[data-veste-nota="a3"] [data-veste-nota-proposta] .mrv-veste-sotto').textContent, 'Proposta');
  assert.equal(q(h, '[data-veste-campo="desc"] [data-veste-proposta-nome]').textContent, 'Originale');
  // 0086 g3d (D43): con la spunta vuota di a2 (descrizione intera) il bottone direbbe «Tieni la tua versione»: la si mette
  await cambiaG(h, 'a2', true);
  q(h, '[data-veste-nota="a1"] [data-veste-nota-proposta]').onclick();
  assert.equal(q(h, '[data-veste-campo="desc"] [data-veste-proposta-nome]').textContent, 'Proposta');
  assert.equal(vaBene(h).textContent, 'Usa Proposta');
  await tasto(h, { key: 'Escape' });
  await vaiA1(h, LINK_AB);
  // 0086 g3c: sul collegamento la spunta «Tieni il collegamento», niente gesti nella nota né in fondo
  assert.equal(nomeSpuntaG(h, 'l1'), 'Tieni il collegamento');
  assert.deepEqual(bottoniNotaG(h, 'l1'), []);
});
test('G6-Q12 il nome dell’area è UNA chiave (rv_veste_proposta dal giro 11, un solo t()): cambiata quella, l’area e la proposta nella nota dicono l’altro nome, anche dopo «Usa Proposta»; i bottoni restano «Usa Proposta» / «Va bene così»', async () => {
  const src = fs.readFileSync(require.resolve('../public/js/mappai-banco-veste.js'), 'utf8');
  assert.equal((src.match(/'rv_veste_proposta'/g) || []).length, 1, 'un solo t() col suo ripiego');
  const h = runtime1(); h.window.t = (k, f) => k === 'rv_veste_proposta' ? 'Dopo' : f; h.apri1(); await vaiA1(h, 'A');
  // 0086, giro 3b: la proposta non è più scritta nel campo da `carica`; ci arriva col clic sull'area della nota
  await cambiaG(h, 'a2', true);   // 0086 g3d (D43): con la spunta vuota di a2 il bottone direbbe «Tieni la tua versione»
  q(h, '[data-veste-nota="a1"] [data-veste-nota-proposta]').onclick();
  assert.equal(q(h, '[data-veste-campo="desc"] [data-veste-proposta-nome]').textContent, 'Dopo');
  assert.equal(q(h, '[data-veste-nota="a3"] [data-veste-nota-proposta] .mrv-veste-sotto').textContent, 'Dopo');
  assert.equal(q(h, '[data-veste-nota="a1"] [data-veste-nota-proposta] .mrv-veste-sotto').textContent, 'Dopo');
  assert.equal(vaBene(h).textContent, 'Usa Proposta', 'il bottone ha la sua chiave');
  campo(h, 'desc').onblur(); await tick();
  await vaiA1(h, 'B'); await vaiA1(h, 'A');
  assert.equal(q(h, '[data-veste-campo="desc"] [data-veste-proposta-nome]').textContent, 'Dopo', '0086 g3d (D41): la bozza torna con la scheda ricostruita');
  assert.equal(q(h, '[data-veste-nota="a3"] [data-veste-nota-proposta] .mrv-veste-sotto').textContent, 'Dopo');
});
test('G6-Q12 in inglese «Fine as it is» (Q13, la chiave di «Va bene così») / «Use Proposal» e l’area «Proposal» (Q18); le frasi del conflitto che nominavano i gesti delle note sono tolte (0086 g3c)', () => {
  const en = fs.readFileSync(require.resolve('../public/traduzioni/en_translations.js'), 'utf8');
  const val = k => { const r = en.split('\n').find(x => x.trim().startsWith(k + ':')) || ''; return r; };
  assert.match(val('rv_veste_usa_proposta'), /"Use Proposal"/);
  assert.equal(val('rv_veste_tieni'), '', 'settimo giro, Q13: «Keep Before» non c’è più');
  assert.match(val('rv_veste_g1_va_bene'), /"Fine as it is"/);
  assert.match(val('rv_veste_proposta'), /"Proposal"/);
  for (const k of ['rv_veste_conflitto_note', 'rv_veste_conflitto_scheda_note', 'rv_veste_conflitto_note_come', 'rv_veste_conflitto_scheda_come', 'rv_veste_conflitto_scheda_annulla_come']) assert.equal(val(k), '', k + ' tolta');
  const src = fs.readFileSync(require.resolve('../public/js/mappai-banco-veste.js'), 'utf8');
  assert.doesNotMatch(src, /t\('rv_veste_conflitto(_scheda)?(_annulla)?(_note)?(_come)?', /);
});

/* ═══ 0075, settimo giro (07/10): Q13, D-a, D-b, l'inglese dei gruppi, Q14; in coda i test minimi del verificatore (K9-) ═══ */
const LINK_RE7 = JSON.stringify(['R', 'E', 'include']);
// i bottoni «Va bene così» che si vedono: quello della barra (se offerto) e quelli delle note con i gesti in vista (dal
// tredicesimo giro, Q20, anche in fondo: la scatola dei gesti di una nota porta il suo nome ovunque stia)
function vaBeneVisibili(h) {
  const note = qa(h, '[data-veste-azioni-di]').filter(a => !!a && !a.hidden)
    .map(a => a.querySelector('[data-veste-tieni]')).filter(b => !!b && b.textContent === 'Va bene così');
  return { barra: !!vaBene(h) && !vaBene(h).hidden && vaBene(h).textContent === 'Va bene così', note: note.length };
}

/* ── Q13: il bottone che chiude la nota senza cambiare il testo si chiama «Va bene così» (la chiave di Q10) ── */
test('G7-Q13 «Va bene così» è UNA chiave (rv_veste_g1_va_bene, un solo t()): cambiata quella, cambiano insieme il bottone delle note (G1 e G2) e quello dei non letti; «rv_veste_tieni» non c’è più', async () => {
  const src = fs.readFileSync(require.resolve('../public/js/mappai-banco-veste.js'), 'utf8');
  assert.equal((src.match(/'rv_veste_g1_va_bene'/g) || []).length, 1, 'un solo t() col suo ripiego');
  assert.doesNotMatch(src, /'rv_veste_tieni'/);
  const altro = (k, f) => k === 'rv_veste_g1_va_bene' ? 'Giusto così' : f;
  const h = runtime1(); h.window.t = altro; h.apri1(); await vaiA1(h, 'A');
  // 0086 (D25: «Va bene così resta solo sulle righe non lette»): la chiave non vale per il bottone in fondo dei nodi (e dal
  // giro 3b le note dei nodi non hanno bottoni)
  assert.equal(qa(h, '[data-veste-nota] button').length, 0);
  await cambiaG(h, 'a2', true);   // 0086 g3d (D43): con la spunta vuota di a2 il bottone direbbe «Tieni la tua versione»
  assert.equal(vaBene(h).textContent, 'Tieni Originale');
  await vaiA1(h, 'C');
  assert.equal(vaBene(h).textContent, 'Giusto così', 'il bottone dei non letti segue la chiave');
  const g = runtime(); g.window.t = altro; g.apri(); await vaiA(g, 'mc2');
  // 0086 g3c: in G2 le note non hanno più bottoni; il bottone del materiale non usa la chiave dei non letti
  assert.deepEqual(bottoniNotaG(g, 'n-mc2-e'), []);
  assert.equal(bottone(g).textContent, 'Approvato');
  // i messaggi coi gesti delle note nominano i bottoni delle note, non quello dei non letti. Giro 2 bis (D30): sul conflitto
  // non nominano più nessun bottone (era ««Tieni Originale» o «Usa Proposta»»); il bottone dei non letti resta fuori
  const c = conflittoSalvato(); c.window.t = altro; c.apri();
  assert.doesNotMatch(q(c, '[data-veste-avvisi]').textContent, /Giusto così|Tieni Originale/);
  assert.match(q(c, '[data-veste-avvisi]').textContent, /il bottone in fondo le sostituisce/);
});
test('G7-Q13 nella stessa schermata non ci sono due «Va bene così» con sensi diversi: su un non letto c’è quello della barra e nessuna nota con i gesti; dove una nota aspetta, c’è quello della nota e la barra non lo offre', async () => {
  const h = runtime1(); h.apri1();
  await vaiA1(h, 'A');
  // ottavo giro, Q15: a1, con la proposta in «Proposta», dice «Tieni Originale» (Q18); a2 e a3 «Va bene così» (erano tre).
  // 0086 (D25): nessuna nota dice più «Va bene così» (il testo è l'Originale: «Tieni Originale»)
  assert.deepEqual(vaBeneVisibili(h), { barra: false, note: 0 }, 'nodo segnalato: nessun «Va bene così», né nelle note né nella barra');
  await vaiA1(h, 'C');
  assert.deepEqual(vaBeneVisibili(h), { barra: true, note: 0 }, 'non letto: la barra, nessuna nota');
  await vaiA1(h, LINK_CD);
  assert.deepEqual(vaBeneVisibili(h), { barra: true, note: 0 });
  // un non letto con una segnalazione del docente ancora aperta (Banco di prima): la nota, non la barra
  const m = g1Manifest();
  m.review = Core.addIssue(m.review, { target: { kind: 'node', id: 'C', field: 'desc' }, problem: 'Modifica del docente: Commercio', origin: 'teacher', blocking: true }, DB1);
  const g = runtime1({ manifest: m }); g.apri1(); await vaiA1(g, 'C');
  // 0086 (caso 15 della tabella dei nomi): la richiesta del docente segue la regola, mai «Va bene così»
  assert.deepEqual(vaBeneVisibili(g), { barra: false, note: 0 });
  assert.equal(q(g, '[data-veste-azioni-di] [data-veste-tieni]').textContent, 'Tieni Originale');
});

/* ── D-a: la riga e la scheda non spariscono sotto il dito; «Aggiungi alla revisione» torna da decidere ── */
test('G7-D-a una segnalazione APERTA da «Aggiungi alla revisione» (Banco di prima): cambio e ritorno la rimettono «da decidere» — la nota resta, la riga resta, la scheda dice che la correzione è tolta', async () => {
  const m = g1Manifest();
  m.review = Core.addIssue(m.review, { target: { kind: 'node', id: 'E', field: 'desc' }, problem: 'Modifica del docente: Esercito', origin: 'teacher', blocking: true }, DB1);
  const id = m.review.initial.issues[m.review.initial.issues.length - 1].id;
  const h = runtime1({ manifest: m }); h.apri1();
  assert.equal(rigaG1(h, 'E').getAttribute('data-stato'), 'da-rivedere');
  await vaiA1(h, 'E');
  await scrivi(h, 'desc', 'L’esercito si ritirò nel Ridotto alpino.');
  assert.equal(esito1(h, id), 'edited');
  await scrivi(h, 'desc', 'L’esercito si ritirò nel Ridotto.');
  assert.deepEqual(docenti1(h).map(i => i.id), [id], 'la segnalazione del docente resta');
  assert.equal(dec1(h, id), 'pending', 'torna da decidere');
  assert.ok(Core.preview(h.rev(), DB1).unresolved.includes(id), 'e tiene ferma la chiusura, come all’apertura');
  assert.equal(rigaG1(h, 'E').getAttribute('data-stato'), 'da-rivedere');
  assert.equal(scheda(h), 'E');
  assert.match(q(h, '[data-veste-chiuse]').textContent, /tolta/);
  assert.equal(q(h, '[data-veste-azioni-di="' + id + '"]').hidden, false, 'la nota chiede di nuovo il suo gesto');
  // ⌘Z rimette la correzione
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(esito1(h, id), 'edited');
});
test('G7-D-a la richiesta chiusa con «Va bene così», poi corretta e rimessa com’era: la segnalazione non si perde, torna da decidere', async () => {
  const m = g1Manifest();
  m.review = Core.addIssue(m.review, { target: { kind: 'node', id: 'E', field: 'desc' }, problem: 'Modifica del docente: Esercito', origin: 'teacher', blocking: true }, DB1);
  const id = m.review.initial.issues[m.review.initial.issues.length - 1].id;
  const h = runtime1({ manifest: m }); h.apri1(); await vaiA1(h, 'E');
  await q(h, '[data-veste-azioni-di="' + id + '"] [data-veste-tieni]').click(); await tick(); await tick();
  assert.equal(dec1(h, id), 'reject');
  await vaiA1(h, 'E');
  await scrivi(h, 'desc', 'L’esercito si ritirò nel Ridotto alpino.');
  assert.equal(esito1(h, id), 'edited');
  await scrivi(h, 'desc', 'L’esercito si ritirò nel Ridotto.');
  assert.deepEqual(docenti1(h).map(i => i.id), [id], 'la segnalazione resta');
  assert.equal(dec1(h, id), 'pending');
});
test('G7-D-a un nodo con la sola correzione del docente (seduta di prima), rimesso com’era: la riga esce, la scheda resta «fuori elenco» e dice che la correzione è tolta; ⌘Z la rimette', async () => {
  const m = g1Manifest();
  m.review = Core.addIssue(m.review, { id: 'td', target: { kind: 'node', id: 'D', field: 'desc' }, problem: 'Modifica del docente: Descrizione · Dogane', origin: 'teacher', blocking: true }, DB1);
  m.review = Core.setDecision(m.review, 'td', 'manual', { text: 'Le dogane controllavano i treni e le merci.' });
  const h = runtime1({ manifest: m }); h.apri1();
  await q(h, '[data-veste-filtro="tutti"]').click(); await tick();
  await vaiA1(h, 'D');
  await scrivi(h, 'desc', 'Le dogane controllavano i treni.');
  assert.equal(docenti1(h).length, 0);
  assert.equal(rigaG1(h, 'D'), null, 'la riga esce dalla barra');
  assert.equal(scheda(h), 'D', 'la scheda resta');
  assert.equal(q(h, '[data-veste-scheda]').getAttribute('data-veste-tipo'), 'fuori');
  assert.match(q(h, '#mrv-current-title').textContent, /Nodo senza segnalazioni/);
  assert.match(q(h, '[data-veste-chiuse]').textContent, /tolta/);
  assert.equal(campo(h, 'desc').value, 'Le dogane controllavano i treni.');
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.deepEqual(docenti1(h).map(i => i.id), ['td']);
  assert.ok(!!rigaG1(h, 'D'), '⌘Z le ridà la riga');
});
test('G7-D-a il collegamento corretto solo dalla mappa, rimesso com’era: fuori elenco COME collegamento (titolo, estremi, riga, le parole); una correzione nuova gli ridà la riga', async () => {
  const LE = require('../public/js/mappai-link-editor-core.js');
  const m = g1Manifest();
  m.review = LE.decision(m.review, DB1, LE.reference(DB1.links[3]), 'causa', { problem: 'Parole del collegamento modificate dal docente.' });
  const h = runtime1({ manifest: m }); h.apri1();
  await q(h, '[data-veste-filtro="tutti"]').click(); await tick();
  await vaiA1(h, LINK_RE7);
  await scrivi(h, 'rel', 'include'); await tick();
  assert.equal(docenti1(h).length, 0);
  assert.equal(rigaG1(h, LINK_RE7), null);
  assert.equal(scheda(h), LINK_RE7);
  assert.equal(q(h, '[data-veste-scheda]').getAttribute('data-veste-tipo'), 'fuori');
  assert.match(q(h, '#mrv-current-title').textContent, /Collegamento senza segnalazioni/);
  assert.equal(q(h, '[data-veste-collegamento]').textContent, 'Svizzera → Esercito');
  assert.match(q(h, '[data-veste-fuori]').textContent, /questo collegamento/);
  assert.equal(campo(h, 'rel').value, 'include');
  await scrivi(h, 'rel', 'comprende'); await tick();
  assert.equal(docenti1(h).length, 1);
  assert.ok(docenti1(h)[0].id.startsWith('teacher-link-label-'), 'nasce come dall’editor della mappa');
  assert.ok(!!rigaG1(h, LINK_RE7), 'la correzione gli ridà la riga');
  assert.equal(scheda(h), LINK_RE7);
});

/* ── D-b: «uguale» come la regola 1 (`piano`); alla mappa arriva il testo di partenza ── */
test('G7-D-b rimesso a meno di spazi: la correzione si toglie e il campo mostra il testo di partenza, senza lo spazio in fondo; una segnalazione aperta da «Aggiungi alla revisione» torna da decidere', async () => {
  const h = runtime1(); h.apri1(); await vaiA1(h, 'C');
  await scrivi(h, 'desc', 'Il commercio con la Germania continuò.');
  await scrivi(h, 'desc', DESC_C + ' ');
  assert.equal(docenti1(h).length, 0);
  assert.equal(campo(h, 'desc').value, DESC_C);
  assert.equal(BancoCore.testoAdesso(null, h.rev(), { db: DB1, bersaglio: { kind: 'node', id: 'C', field: 'desc' }, sources: SOURCES1 }).adesso, DESC_C);
  const m = g1Manifest();
  m.review = Core.addIssue(m.review, { target: { kind: 'node', id: 'E', field: 'desc' }, problem: 'Modifica del docente: Esercito', origin: 'teacher', blocking: true }, DB1);
  const id = m.review.initial.issues[m.review.initial.issues.length - 1].id;
  const g = runtime1({ manifest: m }); g.apri1(); await vaiA1(g, 'E');
  await scrivi(g, 'desc', 'L’esercito si ritirò nel Ridotto alpino.');
  await scrivi(g, 'desc', 'L’esercito si ritirò  nel Ridotto.\n');
  assert.deepEqual(docenti1(g).map(i => i.id), [id]);
  assert.equal(dec1(g, id), 'pending');
});

/* ── l'inglese dei gruppi: una parola sola, quella della barra di G1 («concepts») ── */
test('G7 l’inglese dei gruppi dice «concepts» come il resto della barra di G1: «Concepts not read by the check»; nessuna chiave della veste di G1 dice «node»', () => {
  const en = fs.readFileSync(require.resolve('../public/traduzioni/en_translations.js'), 'utf8');
  const val = k => en.split('\n').find(x => x.trim().startsWith(k + ':')) || '';
  assert.match(val('rv_veste_g1_gruppo_nodi_non_letti'), /"Concepts not read by the check"/);
  assert.match(val('rv_veste_g1_gruppo_nodi'), /"Flagged concepts"/);
  assert.deepEqual(en.split('\n').filter(x => /^\s*rv_veste_g1_\w+:/.test(x) && /\bnodes?\b/i.test(x)), []);
});

/* ── Q14: la sezione «Il controllo» di G1 in parti chiuse ── */
test('G7-Q14 «Il controllo» in G1: sempre visibile una riga con l’esito e «Nuovo controllo» (ottavo giro: l’esito è il messaggio del controllo, il conto di Q8 sta nel titolo); poi, chiuse e in quest’ordine, «Frasi tenute fuori dai materiali», «Bozza conservata», «Dettagli tecnici del controllo»; niente si perde', () => {
  const m = g1Manifest(rapportoG1({ quando: '2026-10-06T10:00:00.000Z' }));
  m.review.initial.previousReports = [rapportoG1({ quando: '2026-10-05T10:00:00.000Z' })];
  const h = conStrato1(runtime1({ manifest: m, storage: STRATO }));
  h.st._reviewLocalDraft = { vaultPath: '/vault', db: clone(DB1) };
  h.apri1();
  const sez = q(h, '#mrv-coverage-options');
  assert.equal(sez.getAttribute('open'), undefined, 'la sezione nasce chiusa');
  const esito = sez.querySelector('[data-veste-controllo-esito]');
  assert.ok(!!esito, 'la riga dell’esito');
  // ottavo giro, Q14 (b): la riga non ripete il titolo parola per parola (era «Parziale · 2 parti non lette dal controllo»)
  assert.equal(esito.querySelector('[data-veste-controllo-stato]').textContent, 'Controllo automatico eseguito: alcune parti restano da verificare.');
  assert.equal(q(h, '#mrv-coverage-label').textContent, 'Parziale · 2 parti non lette dal controllo', 'il conto nel titolo');
  assert.ok(!!esito.querySelector('#mrv-setup-judge'), '«Nuovo controllo» nella stessa riga');
  const parti = qa(h, '#mrv-coverage-options [data-veste-controllo-parte]');
  assert.deepEqual(parti.map(p => p.getAttribute('data-veste-controllo-parte')), ['fuori', 'bozza', 'tecnici'], 'l’ordine');
  assert.deepEqual(parti.map(p => p.tagName), ['DETAILS', 'DETAILS', 'DETAILS']);
  // ottavo giro, Q14 (a): la parte è «Frasi tenute fuori dai materiali» (era «Frasi della fonte rimaste fuori»)
  assert.deepEqual(parti.map(p => p.querySelector('summary').textContent), ['Frasi tenute fuori dai materiali', 'Bozza conservata', 'Dettagli tecnici del controllo']);
  assert.deepEqual(parti.map(p => p.getAttribute('open')), [undefined, undefined, undefined], 'chiuse all’apertura');
  assert.deepEqual(parti.map(p => !!p.hidden), [false, false, false]);
  const parte = k => parti.find(p => p.getAttribute('data-veste-controllo-parte') === k);
  assert.ok(!!parte('fuori').querySelector('[data-aff-blocco]'), 'il blocco dello strato');
  assert.equal(qa(h, '#mrv-coverage-options [data-aff-blocco]').length, 1);
  assert.ok(parte('bozza').querySelectorAll('button').some(b => b.textContent === 'Apri la bozza locale conservata'));
  for (const s of ['[data-veste-controllo-messaggio]', '[data-veste-legenda]', '[data-veste-non-letto-def]', '#mrv-judge-model-result', '#mrv-judge-history']) assert.ok(!!parte('tecnici').querySelector(s), s);
  assert.equal(parte('tecnici').querySelector('[data-veste-controllo-messaggio]').textContent, 'Controllo automatico eseguito: alcune parti restano da verificare.');
  // fuori dalle parti chiuse resta solo la riga dell'esito: il messaggio, la bozza e la traccia non stanno più sciolti
  assert.equal(q(h, '#mrv-coverage-status').textContent, '');
  assert.equal(q(h, '#mrv-manual').textContent, '');
  assert.ok(!esito.querySelector('[data-veste-controllo-parte]'));
});
test('G7-Q14 una parte senza contenuto non si mostra (niente strato, niente bozza: solo «Dettagli tecnici»); con riprovaPuoRiuscire falso la riga dell’esito non ha «Nuovo controllo»; controllo completo: «Completo»', () => {
  const h = runtime1(); h.apri1();
  const visibili = k => qa(k, '#mrv-coverage-options [data-veste-controllo-parte]').filter(p => !p.hidden).map(p => p.getAttribute('data-veste-controllo-parte'));
  assert.deepEqual(visibili(h), ['tecnici']);
  assert.ok(!!q(h, '[data-veste-controllo-esito] #mrv-setup-judge'));
  const tetto = runtime1({ report: { contratto: 'mappai-giudice@2', stato: 'saltato', issues: [], fonte: { fornita: false } } }); tetto.apri1();
  assert.ok(!!q(tetto, '[data-veste-controllo-esito]'));
  assert.ok(!q(tetto, '#mrv-setup-judge'), 'niente «Nuovo controllo»');
  const cop = { nodiEsaminati: ['R', 'A', 'B', 'C', 'D', 'E'], linkEsaminati: DB1.links.map(l => ({ source: l.source, target: l.target, rel: l.rel })), nodiSaltati: [], linkSaltati: [] };
  const c = runtime1({ manifest: decidiTutto(g1Manifest(rapportoG1({ stato: 'completo', copertura: cop }))) }); c.apri1();
  // ottavo giro, Q14 (b): nella riga il messaggio del controllo, «Completo» resta nel titolo
  assert.equal(q(c, '[data-veste-controllo-stato]').textContent, 'Controllo automatico completato.');
  assert.equal(q(c, '#mrv-coverage-options summary').textContent, 'Il controllo · Completo');
});
test('G7-Q14 dopo una decisione il blocco dello strato si ricalcola DENTRO la sua parte (ottavo giro: «Frasi tenute fuori dai materiali»), uno solo, e la parte aperta dal docente resta aperta', async () => {
  const h = conStrato1(runtime1({ storage: STRATO })); h.apri1();
  const fuori = () => q(h, '[data-veste-controllo-parte="fuori"]');
  fuori().setAttribute('open', '');
  const prima = fuori().querySelector('[data-aff-blocco]').textContent;
  // 0086, giro 3b: la decisione è il bottone in fondo, con la spunta di a2 messa (prima i bottoni di a1 e a3)
  const casella = q(h, '[data-veste-spunta="a2"]'); casella.checked = true; casella.onchange();
  await bottone(h).click(); await tick(); await tick();
  assert.equal(qa(h, '#mrv-coverage-options [data-aff-blocco]').length, 1);
  assert.notEqual(fuori().querySelector('[data-aff-blocco]').textContent, prima, 'ricalcolato');
  assert.notEqual(fuori().getAttribute('open'), undefined, 'resta aperta');
  assert.deepEqual(qa(h, '#mrv-coverage-options [data-veste-controllo-parte]').map(p => p.getAttribute('data-veste-controllo-parte')), ['fuori', 'tecnici']);
});
test('G7-Q14 CSS: la riga dell’esito sta su una riga (flex, a capo solo se manca spazio) col bottone stretto sul suo testo e senza margine in alto; le parti chiuse col filo; tutto sotto .mrv-veste-g1, coi token --mm-*', () => {
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8');
  const regola = sel => { const k = css.indexOf(sel + ' {'); return k < 0 ? '' : css.slice(k, css.indexOf('}', k)); };
  assert.match(regola('#mappai-teacher-review.mrv-veste-g1 .mrv-veste-controllo-esito'), /display: flex;.*flex-wrap: wrap;.*align-items: center;/);
  assert.match(regola('#mappai-teacher-review.mrv-veste-g1 .mrv-veste-controllo-esito #mrv-setup-judge'), /flex: 0 0 auto;.*width: auto;.*margin-top: 0;/);
  assert.match(regola('#mappai-teacher-review.mrv-veste-g1 .mrv-veste-controllo-parte'), /border-top: 1px solid var\(--mm-bordo/);
  assert.match(regola('#mappai-teacher-review.mrv-veste-g1 .mrv-veste-controllo-parte > summary'), /font-weight: 700;/);
});
test('G7-Q14 in G2 e a veste spenta la sezione non cambia', () => {
  const g = runtime(); g.apri();
  assert.ok(!q(g, '[data-veste-controllo-esito]')); assert.ok(!q(g, '[data-veste-controllo-parte]'));
  const s = runtime1({ senzaVeste: true }); s.apri1();
  assert.ok(!q(s, '[data-veste-controllo-esito]')); assert.ok(!q(s, '[data-veste-controllo-parte]'));
});

/* ═══ K9: i test minimi del verificatore del sesto giro (scratchpad verifica-0075-giro6/test-minimi.js), portati com'erano
   col prefisso; D-a e D-b erano rossi sul codice del giro 6, gli altri sono guardie verdi (mutazioni sopravvissute V1, V2,
   V7, V11, V12). Nel titolo di V7 «Tieni Prima» diventa «Va bene così» (Q13). ═══ */
const K_LINK_RE = JSON.stringify(['R', 'E', 'include']);
// DIFETTO a — la cura toglie l'unica nota di una riga che non è fra i non letti: la riga e la scheda spariscono sotto il dito
test('K9- verifica-g6 D-a: un collegamento corretto solo dalla MAPPA (non fra i non letti), rimesso com’era nel Banco: la scheda resta e dice che la correzione è tolta', async () => {
  const LE = require('../public/js/mappai-link-editor-core.js');
  const m = g1Manifest();
  m.review = LE.decision(m.review, DB1, LE.reference(DB1.links[3]), 'causa', { problem: 'Parole del collegamento modificate dal docente.' });
  const h = runtime1({ manifest: m }); h.apri1();
  await q(h, '[data-veste-filtro="tutti"]').click(); await tick();
  await vaiA1(h, K_LINK_RE);
  await scrivi(h, 'rel', 'include'); await tick();
  assert.equal(docenti1(h).length, 0, 'la correzione è tolta');
  assert.equal(scheda(h), K_LINK_RE, 'la scheda resta aperta sul collegamento');
  assert.match((q(h, '[data-veste-chiuse]') || { textContent: '' }).textContent, /tolta/);
});
// DIFETTO b — «uguale» per la regola 1 del core è a meno di spazi (`piano`), per la cura è carattere per carattere
test('K9- verifica-g6 D-b: cambio e ritorno a meno di spazi (spazio in fondo, spazio doppio, a capo in fondo): nessuna correzione resta', async () => {
  for (const ritorno of [DESC_C + ' ', 'Il commercio  continuò.', DESC_C + '\n']) {
    const h = runtime1(); h.apri1(); await vaiA1(h, 'C');
    await scrivi(h, 'desc', 'Il commercio con la Germania continuò.');
    await scrivi(h, 'desc', ritorno);
    assert.equal(docenti1(h).length, 0, JSON.stringify(ritorno));
    assert.equal(rigaG1(h, 'C').getAttribute('data-stato'), 'non-letto');
  }
});
// guardia V1: la cura tocca solo la riga salvata
test('K9- verifica-g6 V1: una correzione del docente «uguale alla partenza» su un ALTRO nodo (seduta di prima) resta', async () => {
  const m = g1Manifest();
  m.review = Core.addIssue(m.review, { id: 'td', target: { kind: 'node', id: 'D', field: 'desc' }, problem: 'Modifica del docente: Dogane', origin: 'teacher', blocking: true }, DB1);
  m.review = Core.setDecision(m.review, 'td', 'manual', { text: 'Le dogane controllavano i treni.' });
  const h = runtime1({ manifest: m }); h.apri1(); await vaiA1(h, 'C');
  await scrivi(h, 'desc', 'Il commercio con la Germania continuò.');
  await scrivi(h, 'desc', DESC_C);
  assert.deepEqual(docenti1(h).map(i => i.id), ['td']);
});
// guardia V2: la cura tocca solo il campo salvato
test('K9- verifica-g6 V2: una correzione del docente «uguale alla partenza» sul TITOLO (seduta di prima) resta quando si rimette la descrizione', async () => {
  const m = g1Manifest();
  m.review = Core.addIssue(m.review, { id: 'tl', target: { kind: 'node', id: 'B', field: 'label' }, problem: 'Modifica del docente: Banche', origin: 'teacher', blocking: true }, DB1);
  m.review = Core.setDecision(m.review, 'tl', 'manual', { text: 'Banche' });
  // ottavo giro (D-a dai dati): la correzione di una seduta di prima porta il segno della veste (« · »); senza, è una
  // richiesta di «Aggiungi alla revisione» e torna da decidere (K10-S1b) — fixture adattata, la guardia è la stessa
  m.review = Core.addIssue(m.review, { id: 'td', target: { kind: 'node', id: 'B', field: 'desc' }, problem: 'Modifica del docente: Descrizione · Banche', origin: 'teacher', blocking: true }, DB1);
  m.review = Core.setDecision(m.review, 'td', 'manual', { text: 'Le banche custodivano oro tedesco e italiano.' });
  m.review = Core.setDecision(m.review, 'b1', 'reject');   // 0086 g3d (D41): b1 decisa, perché la descrizione si salvi all'uscita
  const h = runtime1({ manifest: m }); h.apri1();
  await q(h, '[data-veste-filtro="tutti"]').click(); await tick();
  await vaiA1(h, 'B');
  await scrivi(h, 'desc', 'Le banche custodivano oro tedesco.');
  assert.ok(docenti1(h).some(i => i.id === 'tl'), 'il titolo non si tocca');
  assert.ok(!docenti1(h).some(i => i.id === 'td'), 'la descrizione rimessa com’era sì');
});
// guardia V11: tolta la correzione, la scheda dice anche che le note del campo restano aperte
test('K9- verifica-g6 V11 (0086 g3b; g3d, D41): tolta la correzione del docente su A, la scheda dice che è tolta; le note restano com’erano', async () => {
  const m = g1Manifest();
  // ottavo giro (D-a dai dati): la correzione della veste di una seduta di prima, col suo « · » (fixture adattata)
  m.review = Core.addIssue(m.review, { id: 'ta', target: { kind: 'node', id: 'A', field: 'desc' }, problem: 'Modifica del docente: Descrizione · Accuse', origin: 'teacher', blocking: true }, DB1);
  m.review = Core.setDecision(m.review, 'ta', 'manual', { text: G1_A + ' Aggiunta del docente.' });
  // 0086 g3d (D41): le note di A tenute in una seduta di prima, perché il campo si salvi all'uscita (con note aperte è una
  // bozza fino al bottone, e la correzione si toglie solo lì)
  ['a1', 'a2', 'a3'].forEach(id => { m.review = Core.setDecision(m.review, id, 'reject'); });
  const h = runtime1({ manifest: m }); h.apri1(); q(h, '[data-veste-filtro="tutti"]').onclick(); await vaiA1(h, 'A');
  await scrivi(h, 'desc', G1_A);
  assert.equal(docenti1(h).length, 0);
  // 0086, giro 3b: «Restano aperte le note… decidile col loro gesto» non c'è più (le note non hanno gesti: hanno le spunte)
  assert.equal(q(h, '[data-veste-chiuse]').textContent, 'Il testo è di nuovo quello di partenza: la tua correzione è tolta.');
  assert.deepEqual(['a1', 'a2', 'a3'].map(id => esito1(h, id)), ['kept', 'kept', 'kept']);
});
// guardia V12: le decisioni ricopiate dalla cura non perdono un id «__proto__»
test('K9- verifica-g6 V12: la cura ricopia le decisioni con defineProperty — una nota «__proto__» decisa resta decisa', async () => {
  const rep = rapportoG1(); rep.issues.push({ id: '__proto__', target: { kind: 'node', id: 'D', field: 'desc' }, problem: 'Frase dubbia.' });
  const m = g1Manifest(rep);
  m.review = Core.setDecision(m.review, '__proto__', 'reject');
  const h = runtime1({ manifest: m }); h.apri1(); await vaiA1(h, 'C');
  await scrivi(h, 'desc', 'Il commercio con la Germania continuò.');
  await scrivi(h, 'desc', DESC_C);
  assert.ok(Object.prototype.hasOwnProperty.call(h.rev().initial.decisions, '__proto__'));
  assert.equal(h.rev().initial.decisions['__proto__'].choice, 'reject');
});
// guardia V7: su un non letto già deciso da una nota del docente la spunta dice «Deciso», anche con una vecchia «Va bene così»
test('K9- verifica-g6 V7: un non letto deciso da una nota del docente («Va bene così» sulla sua segnalazione) dice «Deciso», non «Va bene così»', async () => {
  const m = g1Manifest();
  m.review = Core.setManualCheck(m.review, K_C, impronta(JSON.stringify(DESC_C)));
  m.review = Core.addIssue(m.review, { id: 'tc', target: { kind: 'node', id: 'C', field: 'desc' }, problem: 'Modifica del docente: Commercio', origin: 'teacher', blocking: true }, DB1);
  m.review = Core.setDecision(m.review, 'tc', 'reject');
  const h = runtime1({ manifest: m }); h.apri1();
  await q(h, '[data-veste-filtro="tutti"]').click(); await tick();
  assert.equal(rigaG1(h, 'C').getAttribute('data-stato'), 'fatto');
  assert.equal(rigaG1(h, 'C').querySelector('.mrv-teacher-approved').getAttribute('aria-label'), 'Deciso');
});

/* ═══ 0075, ottavo giro (07/10): Q15 (il nome del bottone segue il caso), D-a dai dati, D-b sulle note del controllo,
   Q14 ritocchi; in coda i test minimi del verificatore del settimo giro (K10-) ═══ */
const adessoDi = (h, id) => BancoCore.testoAdesso(null, h.rev(), { db: DB1, bersaglio: { kind: 'node', id, field: 'desc' }, sources: SOURCES1 }).adesso;

/* ── Q15: «Tieni Prima» quando «Dopo» mostra la proposta di quella nota (A.5), «Va bene così» in ogni altro caso.
   Undicesimo giro, Q18: «Tieni Originale» quando «Proposta» mostra la proposta di quella nota; la regola non cambia ── */
test('G8-Q15 «Tieni Originale» è UNA chiave sua (rv_veste_tieni_originale dal giro 11, un solo t(); in inglese «Keep Original»): cambiata quella cambia il bottone in G1 e in G2, «Va bene così» no; i messaggi con {gesti} nominano i gesti delle note in conflitto, che lì dicono «Va bene così»', async () => {
  const src = fs.readFileSync(require.resolve('../public/js/mappai-banco-veste.js'), 'utf8');
  assert.equal((src.match(/'rv_veste_tieni_originale'/g) || []).length, 1, 'un solo t() col suo ripiego');
  const en = fs.readFileSync(require.resolve('../public/traduzioni/en_translations.js'), 'utf8');
  assert.ok(en.split('\n').some(x => /^\s*rv_veste_tieni_originale: "Keep Original",\s*$/.test(x)));
  const altro = (k, f) => k === 'rv_veste_tieni_originale' ? 'Tieni il testo di prima' : f;
  const h = runtime1(); h.window.t = altro; h.apri1(); await vaiA1(h, 'A');
  await cambiaG(h, 'a2', true);   // 0086 g3d (D43): con la spunta vuota di a2 il bottone direbbe «Tieni la tua versione»
  // 0086, giro 3b: in G1 i nodi non hanno più i bottoni delle note (prima a1 e a2): la chiave è quella del bottone in fondo
  assert.equal(bottone(h).textContent, 'Tieni il testo di prima');
  const g = runtime(); g.window.t = altro; g.apri(); await vaiA(g, 'mc1');
  // 0086 g3c: in G2 la nota non ha più bottoni, e il bottone del materiale è «Approvato» / «Rivisto»
  assert.deepEqual(bottoniNotaG(g, 'n-mc1-q'), []);
  // giro 2 bis (D30): le note in conflitto non hanno «Tieni…», e il messaggio non lo nomina (la chiave non c'entra più)
  const c = conflittoSalvato(); c.apri();
  assert.doesNotMatch(q(c, '[data-veste-avvisi]').textContent, /Tieni/);
  // 0086 g3c (D37.7): le note in conflitto hanno la spunta, nessun bottone
  assert.deepEqual(['nA', 'nC'].map(id => bottoniNellaNota(c, id)), [[], []], 'le note in conflitto non hanno bottoni');
});

/* ── D-a dai dati: la richiesta di «Aggiungi alla revisione» si riconosce dalla nota, non dall'averla vista aperta ── */
test('G8-D-a la richiesta CORRETTA in una seduta e rimessa com’era in un’altra non si perde: torna da decidere', async () => {
  const m = g1Manifest();
  m.review = Core.addIssue(m.review, { target: { kind: 'node', id: 'E', field: 'desc' }, problem: 'Modifica del docente: Esercito', origin: 'teacher', blocking: true }, DB1);
  const id = m.review.initial.issues[m.review.initial.issues.length - 1].id;
  const h = runtime1({ manifest: m }); h.apri1(); await vaiA1(h, 'E');
  await scrivi(h, 'desc', 'L’esercito si ritirò nel Ridotto alpino.');
  assert.equal(esito1(h, id), 'edited');
  const g = runtime1({ manifest: clone(h.m) }); g.apri1();
  await q(g, '[data-veste-filtro="tutti"]').click(); await tick(); await vaiA1(g, 'E');
  await scrivi(g, 'desc', 'L’esercito si ritirò nel Ridotto.');
  assert.deepEqual(docenti1(g).map(i => i.id), [id], 'la richiesta resta');
  assert.equal(dec1(g, id), 'pending', 'torna da decidere');
  assert.ok(!!rigaG1(g, 'E'));
  assert.match(q(g, '[data-veste-chiuse]').textContent, /tolta/);
});
test('G8-D-a il criterio sta nei dati: una nota del docente sul nodo SENZA il « · » della veste è una richiesta, in qualunque lingua (torna da decidere); CON il « · » è una correzione della veste (si toglie)', async () => {
  const m = g1Manifest();
  m.review = Core.addIssue(m.review, { id: 'te', target: { kind: 'node', id: 'E', field: 'desc' }, problem: 'Teacher edit: Esercito', origin: 'teacher', blocking: true }, DB1);
  m.review = Core.setDecision(m.review, 'te', 'manual', { text: 'L’esercito si ritirò nel Ridotto alpino.' });
  m.review = Core.addIssue(m.review, { id: 'td', target: { kind: 'node', id: 'D', field: 'desc' }, problem: 'Modifica del docente: Descrizione · Dogane', origin: 'teacher', blocking: true }, DB1);
  m.review = Core.setDecision(m.review, 'td', 'manual', { text: 'Le dogane controllavano i treni e le merci.' });
  const h = runtime1({ manifest: m }); h.apri1();
  await q(h, '[data-veste-filtro="tutti"]').click(); await tick();
  await vaiA1(h, 'E'); await scrivi(h, 'desc', 'L’esercito si ritirò nel Ridotto.');
  assert.equal(dec1(h, 'te'), 'pending', 'la richiesta scritta in inglese torna da decidere');
  await vaiA1(h, 'D'); await scrivi(h, 'desc', 'Le dogane controllavano i treni.');
  assert.deepEqual(docenti1(h).map(i => i.id), ['te'], 'la correzione della veste si toglie');
});

/* ── D-b anche per le note del controllo: rimesso a meno di spazi vale «rimesso esatto» (regola 1-ter del core) ── */
test('G8-D-b (0086 g3b; g3d, D41) una nota del controllo sola, decisa: corretto e rimesso com’era a meno di spazi (spazio in fondo, spazio doppio, a capo in fondo) → la correzione del docente si toglie, la nota resta com’era, alla mappa il testo di partenza, come rimesso esatto', async () => {
  const orig = DB1.nodes.find(n => n.id === 'B').desc;
  for (const ritorno of [orig, orig + ' ', orig.replace(' ', '  '), orig + '\n']) {
    // 0086 g3d (D41): b1 tenuta in una seduta di prima, perché il campo si salvi all'uscita (con la nota aperta è una bozza)
    const m = g1Manifest(); m.review = Core.setDecision(m.review, 'b1', 'reject');
    const h = runtime1({ manifest: m }); h.apri1(); q(h, '[data-veste-filtro="tutti"]').onclick(); await vaiA1(h, 'B');
    await scrivi(h, 'desc', 'Le banche custodivano oro tedesco e svizzero.');
    assert.equal(esito1(h, 'b1'), 'kept');
    assert.equal(docenti1(h).length, 1);
    await scrivi(h, 'desc', ritorno);
    const k = JSON.stringify(ritorno);
    assert.equal(esito1(h, 'b1'), 'kept', k);
    assert.equal(docenti1(h).length, 0, k);
    assert.equal(adessoDi(h, 'B'), orig, k);
    assert.equal(campo(h, 'desc').value, orig, k);
  }
});

/* ── Q14, ritocchi: il nome della parte dello strato, la riga che non ripete il titolo, il messaggio sempre in vista ── */
test('G8-Q14 (a) la parte dello strato si chiama «Frasi tenute fuori dai materiali»; con lo 0041 acceso il suo gruppo dentro tiene il suo titolo e niente dentro ripete quello della parte', () => {
  const h = conStrato1(runtime1({ storage: Object.assign({ mappai_frasi_orfane: '1' }, STRATO) })); h.apri1();
  const fuori = q(h, '[data-veste-controllo-parte="fuori"]');
  assert.equal(!!fuori.hidden, false);
  assert.equal(fuori.querySelector('summary').textContent, 'Frasi tenute fuori dai materiali');
  const orfane = fuori.querySelector('[data-aff-orfane]');
  assert.ok(!!orfane, 'il gruppo dello 0041 sta nella parte');
  assert.match(orfane.querySelector('summary').textContent, /^Frasi della fonte rimaste fuori/);
  const sommari = fuori.querySelectorAll('summary').map(s => s.textContent);
  assert.equal(sommari.filter(s => s.indexOf('Frasi tenute fuori dai materiali') >= 0).length, 1, 'il titolo della parte una volta sola');
  assert.equal(sommari.filter(s => s.indexOf('Frasi della fonte rimaste fuori') >= 0).length, 1, 'quello dello 0041 una volta sola');
  // anche in inglese i due titoli sono diversi
  const en = fs.readFileSync(require.resolve('../public/traduzioni/en_translations.js'), 'utf8');
  const val = k => (en.split('\n').find(x => x.trim().startsWith(k + ':')) || '').trim();
  assert.equal(val('rv_veste_g1_controllo_fuori'), 'rv_veste_g1_controllo_fuori: "Sentences kept out of the materials",');
  assert.equal(val('aff_orf_title'), 'aff_orf_title: "Source sentences left out",');
});
test('G8-Q14 (b) la riga in vista non ripete il titolo della sezione: dice il messaggio del controllo, e il conto resta nel titolo', () => {
  const h = runtime1(); h.apri1();
  const riga = q(h, '[data-veste-controllo-esito] [data-veste-controllo-stato]').textContent, etichetta = q(h, '#mrv-coverage-label').textContent;
  assert.equal(riga, 'Controllo automatico eseguito: alcune parti restano da verificare.');
  assert.equal(etichetta, 'Parziale · 2 parti non lette dal controllo');
  assert.ok(riga.indexOf(etichetta) < 0 && etichetta.indexOf(riga) < 0, 'nessuna delle due contiene l’altra');
});
test('G8-Q14 (c) a revisione completata dal docente «La revisione è stata completata dal docente.» e il messaggio del controllo si leggono nella riga in vista, fuori dalle parti chiuse; nei «Dettagli tecnici» restano', () => {
  const m = decidiTutto(g1Manifest());
  const res = Core.beginApproval(m.review, DB1, { manualReview: true });
  m.review = Core.completeApproval(res.review, res.revision);
  const h = runtime1({ manifest: m }); h.apri1();
  const riga = q(h, '[data-veste-controllo-esito] [data-veste-controllo-stato]');
  assert.equal(riga.textContent, 'Controllo automatico eseguito: alcune parti restano da verificare. La revisione è stata completata dal docente.');
  assert.equal(q(h, '[data-veste-controllo-esito] [data-veste-controllo-parte]'), null);
  assert.match(q(h, '[data-veste-controllo-parte="tecnici"] [data-veste-controllo-messaggio]').textContent, /completata dal docente/);
});

/* ═══ K10: i test minimi del verificatore del settimo giro (scratchpad verifica-0075-giro7/test-minimi.js), portati
   com'erano col prefisso; VER7-D1 era rosso sul codice del giro 7, M2, M3, M5 e M8 sono guardie verdi. ═══ */
const VER7_RICH = (m, nodo, label) => { m.review = Core.addIssue(m.review, { target: { kind: 'node', id: nodo, field: 'desc' }, problem: 'Modifica del docente: ' + label, origin: 'teacher', blocking: true }, DB1); return m.review.initial.issues[m.review.initial.issues.length - 1].id; };
const VER7_NUOVO_E = 'L’esercito si ritirò nel Ridotto alpino.', VER7_VECCHIO_E = 'L’esercito si ritirò nel Ridotto.';
const ver7Tutti = async h => { await q(h, '[data-veste-filtro="tutti"]').click(); await tick(); };

test('K10-VER7-D1 D-a fra due sedute: la richiesta di «Aggiungi alla revisione» chiusa con «Va bene così» nella seduta di prima, corretta e rimessa com’era in questa, non si perde (torna da decidere)', async () => {
  const m = g1Manifest(); const id = VER7_RICH(m, 'E', 'Esercito');
  const h = runtime1({ manifest: m }); h.apri1(); await vaiA1(h, 'E');
  await q(h, '[data-veste-azioni-di="' + id + '"] [data-veste-tieni]').click(); await tick(); await tick();
  const g = runtime1({ manifest: clone(h.m) }); g.apri1(); await ver7Tutti(g); await vaiA1(g, 'E');
  await scrivi(g, 'desc', VER7_NUOVO_E);
  await scrivi(g, 'desc', VER7_VECCHIO_E);
  assert.deepEqual(docenti1(g).map(i => i.id), [id], 'la richiesta resta, come nella stessa seduta');
  assert.equal(dec1(g, id), 'pending');
  assert.ok(!!rigaG1(g, 'E'));
});
test('K10-VER7-M2 D-a: due collegamenti fra gli stessi concetti; quello corretto dalla mappa, rimesso com’era, resta apribile fuori elenco COI SUOI estremi e parole: la correzione nuova va a lui', async () => {
  const LE = require('../public/js/mappai-link-editor-core.js');
  const db = clone(DB1); db.links.push({ source: 'R', target: 'E', rel: 'comprende' });
  const m = Pipeline.createManifest({}, { vaultPath: '/vault' }); m.steps.A.status = 'done';
  m.review = Core.createReview({ db, sources: SOURCES1, report: rapportoG1() });
  m.review = LE.decision(m.review, db, LE.reference(db.links[3]), 'causa', { problem: 'Parole del collegamento modificate dal docente.' });
  const h = runtime1({ manifest: m, db }); h.apri1(); await ver7Tutti(h);
  const id = JSON.stringify(['R', 'E', 'include']);
  await vaiA1(h, id);
  await scrivi(h, 'rel', 'include'); await tick();
  assert.equal(docenti1(h).length, 0); assert.equal(scheda(h), id);
  assert.equal(campo(h, 'rel').value, 'include');
  await scrivi(h, 'rel', 'precede'); await tick();
  assert.equal(docenti1(h).length, 1, 'la correzione nuova si salva');
  assert.equal(docenti1(h)[0].target.rel, 'include', 'sul collegamento giusto');
});
test('K10-VER7-M3 Q14: l’anteprima del nuovo controllo non sta nella riga dell’esito (lì solo l’esito e il bottone)', () => {
  const h = runtime1(); h.apri1();
  assert.ok(!!q(h, '#mrv-setup-preview'));
  assert.equal(q(h, '[data-veste-controllo-esito] #mrv-setup-preview'), null);
  assert.ok(!!q(h, '[data-veste-controllo-esito] #mrv-setup-judge'));
});
test('K10-VER7-M5 Q14, niente si perde: a revisione approvata dal docente «Dettagli tecnici» dice ancora «La revisione è stata completata dal docente.»', () => {
  const m = decidiTutto(g1Manifest());
  const res = Core.beginApproval(m.review, DB1, { manualReview: true });
  m.review = Core.completeApproval(res.review, res.revision);
  const h = runtime1({ manifest: m }); h.apri1();
  const msg = q(h, '[data-veste-controllo-parte="tecnici"] [data-veste-controllo-messaggio]');
  assert.ok(!!msg);
  assert.match(msg.textContent, /completata dal docente/);
});
test('K10-VER7-M8 D-a: dopo «Riprova il controllo automatico» la richiesta vista aperta all’apertura, già corretta, rimessa com’era resta (da decidere)', async () => {
  const m = decidiTutto(g1Manifest()); const id = VER7_RICH(m, 'E', 'Esercito');
  const h = runtime1({ manifest: m });
  h.R.retryJudge = async () => { const r = clone(h.rev()); r.initial.report = Object.assign({}, r.initial.report, { quando: '2026-10-06T22:00:00.000Z' }); h.m.review = r; };
  h.apri1(); await vaiA1(h, 'E');
  await scrivi(h, 'desc', VER7_NUOVO_E);
  assert.equal(esito1(h, id), 'edited');
  const riprova = q(h, '#mrv-next-step #mrv-retry-judge');
  assert.ok(!!riprova, '«Riprova» nel piede: tutto deciso');
  await riprova.click(); await tick(); await tick();
  await ver7Tutti(h); await vaiA1(h, 'E');
  await scrivi(h, 'desc', VER7_VECCHIO_E);
  assert.deepEqual(docenti1(h).map(i => i.id), [id]);
  assert.equal(dec1(h, id), 'pending');
});

/* ═══ 0075, nono giro (07/10): una battitura non salvata e il bottone che chiude la nota senza cambiare il testo.
   D1 (Q13): «Va bene così» tiene il testo com'è ADESSO nel campo — se la battitura salvata ha già chiuso la nota, il gesto
   non scrive altro; se la nota è ancora aperta, «Va bene così» sul testo salvato. D2 (Q15): «Tieni Prima» tiene Prima — con
   una battitura in sospeso il gesto parte dallo stato di prima della battitura, che resta nella pila di ⌘Z. In coda i test
   minimi del verificatore dell'ottavo giro (K11-) ═══ */
const bottoneTieni = (h, id) => q(h, '[data-veste-azioni-di="' + id + '"] [data-veste-tieni]');
// il clic col mouse: il mousedown sul bottone non toglie il fuoco al campo (R6), quindi la battitura è ancora in sospeso
const adessoG2 = (h, id, field) => BancoCore.testoAdesso(null, h.final(), { db: { items: h.m.review.final.items }, bersaglio: { kind: 'item', id, field } }).adesso;
test('K11-VER8b-V4 D-a: una richiesta di «Aggiungi alla revisione» sul TITOLO, corretta e rimessa com’era, torna da decidere', async () => {
  const m = g1Manifest();
  m.review = Core.addIssue(m.review, { id: 'rq', target: { kind: 'node', id: 'E', field: 'label' }, problem: 'Modifica del docente: Esercito', origin: 'teacher', blocking: true }, DB1);
  m.review = Core.setDecision(m.review, 'rq', 'manual', { text: 'Esercito svizzero' });
  const h = runtime1({ manifest: m }); h.apri1();
  await q(h, '[data-veste-filtro="tutti"]').click(); await tick(); await vaiA1(h, 'E');
  await scrivi(h, 'label', 'Esercito');
  assert.deepEqual(docenti1(h).map(i => i.id), ['rq']);
  assert.equal(dec1(h, 'rq'), 'pending');
});
test('K11-VER8b-V10 Q14: senza blocco dello strato la parte «Frasi tenute fuori dai materiali» non si vede', () => {
  const h = conStrato1(runtime1({ storage: STRATO }));
  const UI = h.window.MappAIAffermazioniUI; assert.ok(!!UI, 'lo strato c’è');
  // lo strato c'è ma il suo blocco è vuoto (null): così fa `blocco` quando l'analisi non si calcola
  const per = UI.per; UI.per = (...a) => { const s = per(...a); if (s) s.blocco = () => null; return s; };
  h.apri1();
  const fuori = q(h, '[data-veste-controllo-parte="fuori"]');
  assert.equal(!!fuori.querySelector('[data-aff-blocco]'), false);
  assert.equal(!!fuori.hidden, true);
});

/* ═══ 0075, decimo giro (07/10): Q16, «Testo salvato». Giacomo al gate 3: «Sarebbe buono annotare con un testo piccolo
   verde 'Testo salvato' sotto la casella di testo dove è stata fatta una modifica»; «Penso sia meglio solo 'Testo
   salvato'». Sotto il campo, dopo un salvataggio che ha CAMBIATO il testo di quel campo (uscita, cambio di riga, bottone
   della nota con la battitura in sospeso, parole e chip di un collegamento), una riga piccola verde scuro, annunciata;
   niente mentre si scrive, niente se il salvataggio non cambia niente (o rimette il testo di partenza), niente su ⌘Z;
   sparisce quando si riprende a scrivere. In G1 e in G2, solo con la veste. ═══ */
const rigaSalvata = (h, f) => q(h, '[data-veste-scheda] [data-veste-campo="' + f + '"] [data-veste-salvato]');
const salvata = (h, f) => { const p = rigaSalvata(h, f); return p ? p.textContent : null; };
const DESC_B = 'Le banche custodivano oro tedesco.', F_B = 'Le banche custodivano oro tedesco e svizzero.';
/* 0086, giro 3b (§4.9): sulla descrizione di B, con la nota aperta, dopo il salvataggio il bottone in fondo dice «Tieni la
   tua versione» e la riga non c'è (il test di questa regola è «0086 g3b §4.9 …»). Le regole della riga si provano sul TITOLO
   di B, che non ha note (prima sulla descrizione): stessi asserti, campo diverso. */
const L_B = 'Banche svizzere';
const titoloAdesso = (h, id) => BancoCore.testoAdesso(null, h.rev(), { db: DB1, bersaglio: { kind: 'node', id, field: 'label' }, sources: SOURCES1 }).adesso;
/* 0086 g3d (D41): «Testo salvato» non c'è più sulle schede con note del controllo aperte (il campo è una bozza fino al bottone):
   le regole della riga si provano su B con la sua nota già decisa, dove il campo si salva all'uscita come prima */
function conB1Decisa() {
  const m = g1Manifest(); m.review = Core.setDecision(m.review, 'b1', 'reject');
  const h = runtime1({ manifest: m }); h.apri1(); q(h, '[data-veste-filtro="tutti"]').onclick();
  return h;
}
test('G10-Q16 G1: dopo un salvataggio che cambia il testo, sotto il campo «Testo salvato» (regione annunciata, polite); non mentre si scrive, non sugli altri campi; mai «Non ancora salvato»', async () => {
  const h = conB1Decisa(); await vaiA1(h, 'B');   // 0086 g3d (D41): b1 decisa, il campo si salva all'uscita
  assert.equal(salvata(h, 'label'), '', 'aprendo la scheda la riga è vuota');
  const el = await scrivi(h, 'label', L_B, false);
  assert.equal(salvata(h, 'label'), '', 'mentre si scrive niente');
  assert.doesNotMatch(h.dom.text(), /Non ancora salvat/);
  el.onblur(); await tick();
  assert.equal(salvata(h, 'label'), 'Testo salvato');
  const p = rigaSalvata(h, 'label');
  assert.equal(p.getAttribute('aria-live'), 'polite');
  assert.equal(p.getAttribute('role'), 'status');
  assert.equal(p.tagName, 'P');
  const html = q(h, '[data-veste-scheda] [data-veste-campo="label"]').innerHTML;
  assert.ok(html.indexOf('data-veste-salvato') > html.indexOf('<textarea'), 'sotto il campo di testo');
  assert.equal(salvata(h, 'desc'), '', 'la descrizione non è stata toccata');
});
test('G10-Q16 G1: il cambio di riga salva il campo aperto; tornando sulla riga, «Testo salvato» è ancora sotto quel campo', async () => {
  const h = conB1Decisa(); await vaiA1(h, 'B');   // 0086 g3d (D41): b1 decisa, il campo si salva all'uscita
  await scrivi(h, 'label', L_B, false);
  await vaiA1(h, 'A');
  assert.equal(titoloAdesso(h, 'B'), L_B);
  assert.equal(salvata(h, 'label'), '', 'sulla scheda di A niente');
  await vaiA1(h, 'B');
  assert.equal(salvata(h, 'label'), 'Testo salvato');
});
test('G10-Q16 G1: niente «Testo salvato» se il salvataggio non cambia niente — entrare e uscire, scrivere e tornare com’era, uno spazio in fondo, il testo di partenza rimesso (nota del controllo o correzione tolta)', async () => {
  const h = conB1Decisa(); await vaiA1(h, 'B');   // 0086 g3d (D41): b1 decisa, il campo si salva all'uscita
  const el = entra(campo(h, 'label')); el.onblur(); await tick();
  assert.equal(salvata(h, 'label'), '', 'entrare e uscire');
  await scrivi(h, 'label', 'Banche x', false); await scrivi(h, 'label', 'Banche');
  assert.equal(salvata(h, 'label'), '', 'scrivere e tornare com’era prima di uscire');
  await scrivi(h, 'label', L_B);
  assert.equal(salvata(h, 'label'), 'Testo salvato');
  await scrivi(h, 'label', L_B + ' ');
  assert.equal(titoloAdesso(h, 'B'), L_B, 'uno spazio in fondo non è un cambio');
  assert.equal(salvata(h, 'label'), '', 'uno spazio in fondo: niente da salvare, niente riga');
  await scrivi(h, 'label', L_B + ' Ancora');
  assert.equal(salvata(h, 'label'), 'Testo salvato');
  await scrivi(h, 'label', 'Banche');
  assert.equal(titoloAdesso(h, 'B'), 'Banche');
  assert.equal(salvata(h, 'label'), '', 'il testo di partenza rimesso');
  const k = runtime1(); k.apri1(); await vaiA1(k, 'C');
  await scrivi(k, 'desc', 'Il commercio con la Germania continuò.');
  assert.equal(salvata(k, 'desc'), 'Testo salvato');
  await scrivi(k, 'desc', DESC_C);
  assert.match(q(k, '[data-veste-chiuse]').textContent, /la tua correzione è tolta/, 'la scheda dice già che la correzione è tolta');
  assert.equal(salvata(k, 'desc'), '');
});
test('G10-Q16 G1: «Testo salvato» sparisce appena si riprende a scrivere in quel campo, e torna al salvataggio successivo che cambia il testo', async () => {
  const h = conB1Decisa(); await vaiA1(h, 'B');   // 0086 g3d (D41): b1 decisa, il campo si salva all'uscita
  const el = await scrivi(h, 'label', L_B);
  assert.equal(salvata(h, 'label'), 'Testo salvato');
  entra(el); el.value = L_B + ' A'; el.oninput();
  assert.equal(salvata(h, 'label'), '', 'si riprende a scrivere');
  el.onblur(); await tick();
  assert.equal(salvata(h, 'label'), 'Testo salvato');
});
test('G10-Q16 G1: su ⌘Z (e poi ⇧⌘Z) niente «Testo salvato»: basta la riga di stato «Annullato: …»', async () => {
  const h = conB1Decisa(); await vaiA1(h, 'B');   // 0086 g3d (D41): b1 decisa, il campo si salva all'uscita
  await scrivi(h, 'label', L_B);
  assert.equal(salvata(h, 'label'), 'Testo salvato');
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(titoloAdesso(h, 'B'), 'Banche');
  assert.match(q(h, '#mrv-status').textContent, /^Annullato: /);
  assert.equal(salvata(h, 'label'), '');
  fuoriDalModale(h, CMD_SHIFT_Z); await tick(); await tick();
  assert.equal(titoloAdesso(h, 'B'), L_B, '⇧⌘Z rimette la correzione');
  assert.equal(salvata(h, 'label'), '', 'e la riga non torna');
});
test('G10-Q16 G1: le parole di un collegamento — scritte e uscite, poi coi chip dei suggerimenti: «Testo salvato» sotto il campo delle parole; il chip delle parole di partenza no', async () => {
  const h = runtime1(); h.apri1(); await vaiA1(h, LINK_CD);
  assert.equal(salvata(h, 'rel'), '');
  const html = q(h, '[data-veste-scheda] [data-veste-campo="rel"]').innerHTML;
  assert.ok(html.indexOf('data-veste-salvato') > html.indexOf('data-veste-input="rel"'), 'sotto il campo delle parole');
  const el = await scrivi(h, 'rel', 'segue', false);
  assert.equal(salvata(h, 'rel'), '', 'mentre si scrive niente');
  el.onblur(); await tick();
  assert.equal(salvata(h, 'rel'), 'Testo salvato');
  await chip1(h, 'precede').click(); await tick();
  assert.equal(campo(h, 'rel').value, 'precede');
  assert.equal(salvata(h, 'rel'), '', 'le parole di partenza: la correzione è tolta');
  await chip1(h, 'segue').click(); await tick();
  assert.equal(salvata(h, 'rel'), 'Testo salvato', 'un chip è un salvataggio');
  entra(campo(h, 'rel')).value = 'segue poi'; campo(h, 'rel').oninput();
  assert.equal(salvata(h, 'rel'), '', 'si riprende a scrivere');
});
test('G10-Q16 G2: «Testo salvato» sotto il campo dopo l’uscita; non mentre si scrive, non entrando e uscendo (0086 g3c: la metà su «Va bene così» della nota è tolta)', async () => {
  const h = runtime({ report: senzaNotaMc1() }); h.apri(); await vaiA(h, 'mc1');   // 0086 g3d (D41): un materiale senza note
  const domanda = entra(campo(h, 'question')); domanda.onblur(); await tick();
  assert.equal(salvata(h, 'question'), '', 'entrare e uscire');
  const el = await scrivi(h, 'explanation', 'Furono proprio le banche.', false);
  assert.equal(salvata(h, 'explanation'), '', 'mentre si scrive niente');
  el.onblur(); await tick();
  assert.equal(adessoG2(h, 'mc1', 'explanation'), 'Furono proprio le banche.');
  assert.equal(salvata(h, 'explanation'), 'Testo salvato');
  assert.equal(rigaSalvata(h, 'explanation').getAttribute('aria-live'), 'polite');
  assert.equal(salvata(h, 'question'), '');
});
test('G10-Q16 CSS: la riga «Testo salvato» è del foglio della veste (sotto .mrv-veste), piccola, nel verde della spunta (#166534) con contrasto ≥ 4,5:1 sul fondo della scheda (#fff)', () => {
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const regole = css.match(/[^{}]*\.mrv-veste-salvato[^{}]*\{[^}]*\}/g) || [];
  assert.ok(regole.length >= 1, 'una regola');
  for (const r of regole) for (const s of r.slice(0, r.indexOf('{')).split(',')) assert.match(s.trim(), /^#mappai-teacher-review\.mrv-veste /, 'solo sotto la veste: ' + s.trim());
  const colori = regole.join('').match(/(?:^|[;{\s])color:\s*(#[0-9a-fA-F]{6})/g) || [];
  assert.equal(colori.length, 1);
  const colore = colori[0].match(/#[0-9a-fA-F]{6}/)[0].toLowerCase();
  assert.equal(colore, '#166534', 'il verde della spunta (.mrv-teacher-approved)');
  assert.ok(css.indexOf('.mrv-teacher-approved { display: inline-flex; position: relative; vertical-align: middle; padding: 3px; border-radius: 50%; color: #166534;') >= 0);
  const lum = x => { const v = [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const contrasto = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  assert.ok(contrasto(colore, '#ffffff') >= 4.5, 'contrasto ' + contrasto(colore, '#ffffff').toFixed(2));
  assert.match(css, /#mappai-teacher-review\.mrv-veste \.mrv-detail \{ background: #fff; \}/, 'il fondo che si vede sotto la veste è il bianco');
  assert.match(regole.join(''), /font-size:\s*\.75rem/, 'piccola come le righe d’aiuto sotto il campo');
});
test('G10-Q16 la frase è UNA chiave (rv_veste_testo_salvato, un solo t()); in inglese «Text saved»', () => {
  const src = fs.readFileSync(require.resolve('../public/js/mappai-banco-veste.js'), 'utf8');
  assert.equal((src.match(/t\('rv_veste_testo_salvato', 'Testo salvato'\)/g) || []).length, 1);
  const en = fs.readFileSync(require.resolve('../public/traduzioni/en_translations.js'), 'utf8');
  const righe = en.split('\n').filter(x => x.trim().startsWith('rv_veste_testo_salvato:'));
  assert.equal(righe.length, 1);
  assert.match(righe[0], /"Text saved"/);
});

/* ═══ 0075, undicesimo giro (07/10), Q18 (rev. 9 dell'ADR 0012, B): le due aree accanto al campo si chiamano «Originale» e
   «Proposta» (erano «Prima» e «Dopo»), senza qualificatori; i bottoni della nota «Tieni Originale» (la proposta di quella
   nota in «Proposta», niente ancora toccato) e «Usa Proposta»; «Va bene così» in ogni altro caso (la regola di Q15). Le frasi
   che nominano un'area la compongono dalla sua chiave. ═══ */
const nomeArea = (h, f, quale) => q(h, '[data-veste-campo="' + f + '"] [data-veste-' + quale + '-nome]').textContent;
test('G11-Q18 G2 (0086 g3c): aree «Originale» / «Proposta» con la proposta copiata dall’area della nota, «Originale» / «Tua versione» scrivendo e dopo il salvataggio, senza «· scelta tua» / «· testo tuo»; niente bottoni nelle note', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc1');
  areaG(h, 'n-mc1-q').onclick(); await tick();
  assert.deepEqual([nomeArea(h, 'question', 'prima'), nomeArea(h, 'question', 'proposta')], ['Originale', 'Proposta']);
  assert.deepEqual(bottoniNotaG(h, 'n-mc1-q'), []);
  tasto(h, { key: 'Escape' });
  await vaiA(h, 'mc2');
  assert.deepEqual(bottoniNotaG(h, 'n-mc2-e'), []);
  const el = entra(campo(h, 'explanation')); el.value = 'Furono le banche.'; el.oninput();
  assert.deepEqual([nomeArea(h, 'explanation', 'prima'), nomeArea(h, 'explanation', 'proposta')], ['Originale', 'Tua versione'], 'niente «· testo tuo»');
  el.onblur(); await tick();
  assert.equal(nomeArea(h, 'explanation', 'proposta'), 'Tua versione', 'salvato: niente «· testo tuo»');
});
test('G11-Q18 G1 (0086 g3b, g3c): aree «Originale» / «Proposta» quando la proposta è copiata nel campo dall’area della nota, «Originale» / «Tua versione» scrivendo; la proposta letta nella nota si chiama «Proposta»; sul collegamento la spunta', async () => {
  const h = runtime1(); h.apri1(); await vaiA1(h, 'A');
  // 0086, giro 3b: il campo parte dall'«Originale» (prima la proposta di a1 era nel campo) e le note non hanno bottoni
  assert.equal(nomeArea(h, 'desc', 'proposta'), 'Originale', 'il campo solo, con la riga «Originale» (D21)');
  assert.equal(q(h, '[data-veste-nota="a3"] [data-veste-nota-proposta] .mrv-veste-sotto').textContent, 'Proposta');
  q(h, '[data-veste-nota="a1"] [data-veste-nota-proposta]').onclick();
  assert.deepEqual([nomeArea(h, 'desc', 'prima'), nomeArea(h, 'desc', 'proposta')], ['Originale', 'Proposta']);
  const el = campo(h, 'desc'); el.value = G1_A1 + ' Ritocco.'; el.oninput();
  assert.deepEqual([nomeArea(h, 'desc', 'prima'), nomeArea(h, 'desc', 'proposta')], ['Originale', 'Tua versione'], 'niente «· scelta tua»');
  el.onblur(); await tick();
  assert.deepEqual([nomeArea(h, 'desc', 'prima'), nomeArea(h, 'desc', 'proposta')], ['Originale', 'Tua versione'], 'salvata');
  await vaiA1(h, LINK_AB);
  // 0086 g3c: sul collegamento la spunta «Tieni il collegamento», niente gesti nella nota né in fondo
  assert.equal(nomeSpuntaG(h, 'l1'), 'Tieni il collegamento');
  assert.deepEqual(bottoniNotaG(h, 'l1'), []);
});
test('G11-Q18 dopo una proposta copiata, corretta e salvata le aree restano «Originale» / «Tua versione», senza qualificatori (rev. 9, B.1); niente scambio e niente «Testo di partenza»; la nota resta aperta (0086 g3c, D37.1)', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc1');
  const c = () => q(h, '[data-veste-campo="question"]');
  areaG(h, 'n-mc1-q').onclick(); await tick();
  const el = campo(h, 'question'); el.value = 'Chi venne mai accusato?'; el.oninput();
  el.onblur(); await tick();
  assert.equal(decisione(h, 'n-mc1-q'), 'pending', 'il salvataggio non chiude la nota (D37.1)');
  assert.equal(c().querySelector('[data-veste-prima-testo]').textContent, 'Chi fu accusato?', 'Q19: «Originale» è il testo generato');
  assert.deepEqual([nomeArea(h, 'question', 'prima'), nomeArea(h, 'question', 'proposta')], ['Originale', 'Tua versione']);
  assert.equal(!!c().querySelector('[data-veste-partenza]'), false);
});
test('G11-Q18 testi lunghi: «Mostra «Originale»» / «Nascondi «Originale»»', async () => {
  const frase = n => 'Frase numero ' + n + ' della sintesi sulle banche svizzere e il loro ruolo nella guerra.';
  const testo = Array.from({ length: 12 }, (_, i) => frase(i + 1)).join(' ');
  const report = { checkStatus: 'incomplete', coverage: { checkedIds: [] }, issues: [
    { id: 'L1', target: { kind: 'item', id: 'syL', field: 'text' }, after: testo.replace('Frase numero 5 della', 'Frase numero 5, rivista, della'), problem: 'Una frase da rivedere.' }] };
  const h = runtime({ items: [{ id: 'syL', kind: 'synthesis', title: 'Lunga', text: testo }], report }); h.apri();
  const c = () => q(h, '[data-veste-campo="text"]');
  await c().querySelector('[data-veste-vista="testi"]').onclick();
  assert.equal(c().querySelector('[data-veste-mostra-prima]').textContent, 'Mostra «Originale»');
  await c().querySelector('[data-veste-mostra-prima]').onclick();
  assert.equal(c().querySelector('[data-veste-prima-testo]').hidden, false);
  assert.equal(c().querySelector('[data-veste-mostra-prima]').textContent, 'Nascondi «Originale»');
});
test('G11-Q18 (0086 g3c, D37.7): i messaggi del conflitto salvato prima non nominano i gesti delle note — la riga dice che il bottone in fondo lo sostituisce, la battitura respinta dice di premere Esc e il bottone', async () => {
  const h = conflittoSalvato(); h.apri();
  assert.doesNotMatch(q(h, '[data-veste-avvisi]').textContent, /Tieni|Usa Proposta|Togli questa scelta/);
  assert.match(q(h, '[data-veste-avvisi]').textContent, /il bottone in fondo le sostituisce/);
  const el = entra(campo(h, 'explanation')); el.value = 'Furono proprio le banche.'; el.oninput(); el.onblur(); await tick();
  await premiG(h);   // 0086 g3d (D41): la battitura è una bozza, la respinge il bottone
  assert.doesNotMatch(q(h, '#mrv-status').textContent, /Tieni|Togli questa scelta/);
  assert.match(q(h, '#mrv-status').textContent, /premi Esc per lasciare il campo com’era, poi il bottone in fondo/);
});
test('G11-Q18 le chiavi: una per area («rv_veste_originale», «rv_veste_proposta») e una per bottone («rv_veste_tieni_originale», «rv_veste_usa_proposta»), un solo t() ciascuna; le chiavi di «Prima» / «Dopo» e dei qualificatori non ci sono più, né nel modulo né in inglese', () => {
  const src = fs.readFileSync(require.resolve('../public/js/mappai-banco-veste.js'), 'utf8');
  for (const [k, f] of [['rv_veste_originale', 'Originale'], ['rv_veste_proposta', 'Proposta'], ['rv_veste_tieni_originale', 'Tieni Originale'], ['rv_veste_usa_proposta', 'Usa Proposta']]) {
    assert.equal((src.match(new RegExp("'" + k + "'", 'g')) || []).length, 1, k + ': un solo t()');
    assert.ok(src.includes("t('" + k + "', '" + f + "')"), k + ' col ripiego «' + f + '»');
  }
  const vecchie = ['rv_veste_prima', 'rv_veste_prima_controllo', 'rv_veste_dopo', 'rv_veste_dopo_tuo', 'rv_veste_dopo_scelta', 'rv_veste_usa', 'rv_veste_tieni_prima', 'rv_veste_tieni_prima_battitura', 'rv_veste_mostra_prima', 'rv_veste_nascondi_prima'];
  const en = fs.readFileSync(require.resolve('../public/traduzioni/en_translations.js'), 'utf8');
  for (const k of vecchie) {
    assert.ok(!src.includes("'" + k + "'"), k + ' nel modulo');
    assert.ok(!en.split('\n').some(x => x.trim().startsWith(k + ':')), k + ' in inglese');
  }
  // nessun ripiego italiano nomina più «Prima» / «Dopo» come area o bottone, né i qualificatori
  assert.doesNotMatch(src, /t\('[a-z0-9_]+', '(Prima|Dopo)'\)/);
  assert.doesNotMatch(src, /t\('[a-z0-9_]+', '[^']*(«Prima»|«Dopo»|Tieni Prima|Usa Dopo|· scelta tua|· testo tuo|Prima ·|Dopo ·)[^']*'\)/);
});
test('G11-Q18 in inglese «Original» / «Proposal», «Keep Original» / «Use Proposal»; le frasi sull’area la compongono ({area}); nessuna voce della veste dice più «Before» / «After»', () => {
  const en = fs.readFileSync(require.resolve('../public/traduzioni/en_translations.js'), 'utf8');
  const val = k => (en.split('\n').filter(x => x.trim().startsWith(k + ':')));
  for (const [k, v] of [['rv_veste_originale', 'Original'], ['rv_veste_proposta', 'Proposal'], ['rv_veste_tieni_originale', 'Keep Original'], ['rv_veste_usa_proposta', 'Use Proposal']]) {
    assert.equal(val(k).length, 1, k);
    assert.match(val(k)[0], new RegExp(': "' + v + '",\\s*$'), k);
  }
  for (const k of ['rv_veste_mostra_area', 'rv_veste_nascondi_area', 'rv_veste_tenuto_battitura']) {
    assert.equal(val(k).length, 1, k);
    assert.match(val(k)[0], /\{area\}/, k);
  }
  assert.match(val('rv_veste_tenuto_battitura')[0], /\{annulla\}/);
  const veste = en.split('\n').filter(x => /^\s*rv_veste_/.test(x)).join('\n');
  assert.doesNotMatch(veste, /“Before”|“After”|«Before»|«After»|"Before"|"After"|Keep Before|Use After/);
  // a veste spenta non cambia niente: «Proposta» del Banco di prima ha la sua chiave, intatta
  const review = fs.readFileSync(require.resolve('../public/js/mappai-review.js'), 'utf8');
  assert.equal((review.match(/t\('rv_proposal', 'Proposta'\)/g) || []).length, 2);
  assert.match(val('rv_proposal')[0], /: "Proposal",\s*$/);
});
test('G11-Q18 il nome di un’area è UNA chiave: cambiata quella, cambiano l’area, la proposta letta nella nota e le frasi che la nominano («Mostra / Nascondi»); i bottoni hanno la loro chiave e non cambiano (0086 g3c: «Tenuto «…»» tolto con il ramo D2 della nota)', async () => {
  const altro = (k, f) => k === 'rv_veste_originale' ? 'Testo AI' : k === 'rv_veste_proposta' ? 'Nuovo testo' : f;
  const h = runtime1(); h.window.t = altro; h.apri1(); await vaiA1(h, 'A');
  await cambiaG(h, 'a2', true);   // 0086 g3d (D43): con la spunta vuota di a2 il bottone direbbe «Tieni la tua versione»
  // 0086, giro 3b: la proposta arriva nel campo col clic sull'area della nota (prima la scriveva `carica`); in G1 le note dei
  // nodi non hanno bottoni, e «Tenuto «…»» si prova in G2
  assert.equal(nomeArea(h, 'desc', 'proposta'), 'Testo AI', 'la riga del campo solo');
  q(h, '[data-veste-nota="a1"] [data-veste-nota-proposta]').onclick();
  assert.deepEqual([nomeArea(h, 'desc', 'prima'), nomeArea(h, 'desc', 'proposta')], ['Testo AI', 'Nuovo testo']);
  assert.equal(q(h, '[data-veste-nota="a3"] [data-veste-nota-proposta] .mrv-veste-sotto').textContent, 'Nuovo testo');
  assert.equal(bottone(h).textContent, 'Usa Proposta');
  const frase = n => 'Frase numero ' + n + ' della sintesi sulle banche svizzere e il loro ruolo nella guerra.';
  const testo = Array.from({ length: 12 }, (_, i) => frase(i + 1)).join(' ');
  const report = { checkStatus: 'incomplete', coverage: { checkedIds: [] }, issues: [
    { id: 'L1', target: { kind: 'item', id: 'syL', field: 'text' }, after: testo.replace('Frase numero 5 della', 'Frase numero 5, rivista, della'), problem: 'Una frase da rivedere.' }] };
  const g = runtime({ items: [{ id: 'syL', kind: 'synthesis', title: 'Lunga', text: testo }], report }); g.window.t = altro; g.apri();
  areaG(g, 'L1').onclick(); await tick();   // 0086 g3c: la proposta copiata dall'area della nota
  await q(g, '[data-veste-campo="text"] [data-veste-vista="testi"]').onclick();
  assert.equal(q(g, '[data-veste-campo="text"] [data-veste-mostra-prima]').textContent, 'Mostra «Testo AI»');
  const bottoni = (k, f) => k === 'rv_veste_tieni_originale' ? 'Tieni il generato' : k === 'rv_veste_usa_proposta' ? 'Prendi la proposta' : f;
  const b = runtime1(); b.window.t = bottoni; b.apri1(); await vaiA1(b, 'A');
  await cambiaG(b, 'a2', true);   // 0086 g3d (D43)
  // 0086, giro 3b: in G1 le chiavi dei bottoni sono quelle del bottone in fondo (D37.6)
  assert.equal(bottone(b).textContent, 'Tieni il generato');
  q(b, '[data-veste-nota="a1"] [data-veste-nota-proposta]').onclick();
  assert.equal(bottone(b).textContent, 'Prendi la proposta');
  assert.deepEqual([nomeArea(b, 'desc', 'prima'), nomeArea(b, 'desc', 'proposta')], ['Originale', 'Proposta']);
  // giro 2 bis (D30): il messaggio sul conflitto non nomina più i bottoni delle note (era ««Tieni il generato» o «Prendi la
  // proposta»»): niente «Tieni…» in conflitto, e «Usa Proposta» lì non scioglie niente
  const c = conflittoSalvato(); c.window.t = bottoni; c.apri();
  assert.doesNotMatch(q(c, '[data-veste-avvisi]').textContent, /Tieni il generato|Prendi la proposta/);
});

/* ═══ 0075, dodicesimo giro (07/10): Q19 — niente scambio delle aree ═══
   Giacomo, alla domanda «Dopo che hai ritoccato e salvato una proposta, che cosa mostra l'area di SOPRA?»: «Sempre
   l'Originale». Cambia la rev. 4, A.5 dell'ADR 0012: l'area di sopra («Originale») mostra sempre il testo generato,
   quella di sotto («Proposta») il testo che resta; «Differenze» confronta questi due; la proposta del controllo si rilegge
   nella nota (prima, nota decisa, era nascosta: si leggeva solo nell'area scambiata). Il bottone «Testo di partenza» non
   serve più: il testo di partenza è l'area di sopra. G1 e G2 con la veste. */
const testiDi = (h, s) => qa(h, s).map(x => x.textContent);
test('G12-Q19 G2 (0086 g3c): proposta copiata, corretta e salvata — «Originale» resta il testo generato, «Tua versione» è il testo che resta, «Differenze» confronta questi due; la proposta del controllo si rilegge nella nota; niente «Testo di partenza»', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc1');
  const c = () => q(h, '[data-veste-campo="question"]');
  assert.equal(q(h, '[data-veste-nota="n-mc1-q"] [data-veste-nota-proposta]').hidden, false, 'la proposta sta nella nota, con la sua area');
  areaG(h, 'n-mc1-q').onclick(); await tick();
  await scrivi(h, 'question', 'Chi venne mai accusato?');
  assert.equal(decisione(h, 'n-mc1-q'), 'pending', 'il salvataggio non chiude la nota (D37.1)');
  assert.equal(c().querySelector('[data-veste-prima-testo]').textContent, 'Chi fu accusato?', '«Originale» è il testo generato');
  assert.equal(campo(h, 'question').value, 'Chi venne mai accusato?', 'l’area di sotto è il testo che resta');
  assert.deepEqual([nomeArea(h, 'question', 'prima'), nomeArea(h, 'question', 'proposta')], ['Originale', 'Tua versione']);
  await c().querySelector('[data-veste-vista="differenze"]').onclick();
  assert.deepEqual(testiDi(h, '[data-veste-campo="question"] [data-veste-prima-testo] del'), ['fu'], 'tolto rispetto all’Originale');
  assert.deepEqual(testiDi(h, '[data-veste-campo="question"] [data-veste-diff] ins'), ['venne mai'], 'aggiunto rispetto all’Originale');
  assert.equal(c().querySelector('[data-veste-diff]').textContent, 'Chi venne mai accusato?');
  const p = q(h, '[data-veste-nota="n-mc1-q"] [data-veste-nota-proposta]');
  assert.equal(p.hidden, false, 'la proposta del controllo si rilegge nella nota');
  assert.equal(p.textContent, 'Proposta Chi venne accusato?');
  assert.equal(!!c().querySelector('[data-veste-partenza]'), false, 'niente bottone «Testo di partenza»');
  assert.equal(!!c().querySelector('[data-veste-partenza-testo]'), false);
});
test('G12-Q19 G2 (0086 g3c): col bottone del materiale — la proposta copiata e scelta resta nel campo e non si ripete nella nota; tenuto l’Originale la nota non la mostra', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc1');
  areaG(h, 'n-mc1-q').onclick(); await premiG(h);
  await vaiA(h, 'mc1');
  assert.equal(decisione(h, 'n-mc1-q'), 'accept');
  assert.equal(q(h, '[data-veste-campo="question"] [data-veste-prima-testo]').textContent, 'Chi fu accusato?');
  assert.equal(campo(h, 'question').value, 'Chi venne accusato?');
  assert.equal(q(h, '[data-veste-nota="n-mc1-q"] [data-veste-nota-proposta]').hidden, true);
  const g = runtime(); g.apri(); await vaiA(g, 'mc1');
  await premiG(g); await vaiA(g, 'mc1');
  assert.equal(decisione(g, 'n-mc1-q'), 'reject');
  assert.equal(campo(g, 'question').value, 'Chi fu accusato?');
  assert.equal(q(g, '[data-veste-nota="n-mc1-q"] [data-veste-nota-proposta]').hidden, true);
});
test('G12-Q19 G1 (0086 g3b): nota sola, proposta copiata, ritoccata e salvata — «Originale» è la descrizione generata, «Tua versione» il testo che resta; la proposta di a1 si rilegge nella nota, che resta aperta', async () => {
  const h = runtime1({ report: rapportoG1({ issues: [rapportoG1().issues[0]] }) }); h.apri1(); await vaiA1(h, 'A');
  const F = G1_A1.replace('accettato oro', 'accettato oro tedesco');
  // 0086, giro 3b: il campo parte dall'«Originale»; la proposta ci arriva dall'area della nota, e il salvataggio non decide
  // la nota (D37.1). Prima: la proposta già nel campo e a1 «Testo modificato da te».
  assert.equal(campo(h, 'desc').value, G1_A);
  q(h, '[data-veste-nota="a1"] [data-veste-nota-proposta]').onclick();
  assert.equal(campo(h, 'desc').value, G1_A1);
  await scrivi(h, 'desc', F);
  await vaiA1(h, 'A');
  assert.equal(esito1(h, 'a1'), 'pending');
  assert.equal(nomeArea(h, 'desc', 'proposta'), 'Tua versione');
  const c = () => q(h, '[data-veste-campo="desc"]');
  assert.equal(c().querySelector('[data-veste-prima-testo]').textContent, G1_A, '«Originale» è il testo generato');
  assert.equal(campo(h, 'desc').value, F);
  await c().querySelector('[data-veste-vista="differenze"]').onclick();
  assert.match(testiDi(h, '[data-veste-campo="desc"] [data-veste-prima-testo] del').join(' '), /Stato/, 'Differenze contro l’Originale');
  assert.match(testiDi(h, '[data-veste-campo="desc"] [data-veste-diff] ins').join(' '), /tedesco/);
  const p = q(h, '[data-veste-nota="a1"] [data-veste-nota-proposta]');
  assert.equal(p.hidden, false, 'la proposta del controllo si rilegge nella nota');
  assert.equal(p.textContent, 'Proposta ' + G1_A1);
  assert.equal(!!c().querySelector('[data-veste-partenza]'), false);
});
test('G12-Q19 G1 (0086 g3d, D41): «Proposta scelta» poi ritoccata e registrata col bottone (diventa «Testo modificato da te») — «Originale» resta la descrizione generata e la proposta torna leggibile nella nota', async () => {
  const m = g1Manifest(); m.review = Core.setDecision(m.review, 'a1', 'accept');
  const g = runtime1({ manifest: m }); g.apri1(); await vaiA1(g, 'A');
  assert.equal(q(g, '[data-veste-campo="desc"] [data-veste-prima-testo]').textContent, G1_A);
  assert.equal(q(g, '[data-veste-nota="a1"] [data-veste-nota-proposta]').hidden, true, '«Proposta scelta»: la proposta è il testo che resta');
  await scrivi(g, 'desc', G1_A1.replace('accettato oro', 'accettato oro tedesco'));
  // 0086 g3d (D41): il ritocco è una bozza; lo registra il bottone (messa la spunta della descrizione intera, a2), che decide
  // anche a3 (prima a3 restava aperta: il ritocco si salvava da sé all'uscita)
  await cambiaG(g, 'a2', true); await premiG(g);
  await vaiA1(g, 'A');
  assert.deepEqual(['a1', 'a3'].map(id => esito1(g, id)), ['edited', 'kept']);
  assert.equal(q(g, '[data-veste-campo="desc"] [data-veste-prima-testo]').textContent, G1_A, 'niente scambio');
  assert.equal(q(g, '[data-veste-nota="a1"] [data-veste-nota-proposta]').hidden, false);
});

/* ═══ 0075, tredicesimo giro (07/10): Q20 — i bottoni in fondo con una nota sola ═══
   Giacomo: «potresti spostare il bottone 'Va bene così' dalla sezione gialla della nota alla barra in fondo dopo il testo
   'La nota aspetta la sua risposta.'?»; «chiudilo col ritocco piccolo, le spunte vanno nello 0086». Con UNA sola nota
   aperta i suoi bottoni stanno nella barra in fondo, dopo la frase della barra; con due o più restano nelle note. Sono gli
   STESSI bottoni (la stessa scatola `[data-veste-azioni-di]`, con i suoi ascolti): stessa funzione, stessa battitura in
   sospeso, stesso ⌘Z, stesso nome che segue lo stato. G1 e G2 con la veste. */
const barraAzioni = h => q(h, '#mrv-veste-azioni');
// i bottoni di una nota che si vedono nella barra in fondo, coi loro nomi
const bottoniInFondo = h => qa(h, '#mrv-veste-azioni [data-veste-azioni-di] button').filter(b => b.getClientRects().length > 0).map(b => b.textContent);
const notaInFondo = h => { const a = q(h, '#mrv-veste-azioni [data-veste-azioni-di]'); return a ? a.getAttribute('data-veste-azioni-di') : null; };
const bottoniNellaNota = (h, id) => qa(h, '[data-veste-nota="' + id + '"] button').filter(b => b.getClientRects().length > 0).map(b => b.textContent);
const rigaInFondo = (h, id) => { const p = q(h, '[data-veste-nota="' + id + '"] [data-veste-in-fondo]'); return !!p && p.getClientRects().length > 0 ? p.textContent : null; };
// tutti i bottoni in vista della scheda e della barra, col loro nome (il testo, o aria-label per i bottoni a icona)
const nomiInVista = h => qa(h, '[data-veste-scheda] button, #mrv-veste-azioni button').filter(b => b.getClientRects().length > 0)
  .map(b => String(b.textContent || '').trim() || String(b.getAttribute('aria-label') || '').trim());
const dopoLaFrase = h => {
  const html = barraAzioni(h).innerHTML, frase = html.indexOf('id="mrv-veste-attesa"'), gesto = html.indexOf('data-veste-azioni-di='), bottoneDopo = html.indexOf('id="mrv-veste-bottone"');
  return frase >= 0 && frase < gesto && gesto < bottoneDopo;
};
async function clicInFondo(h, quale) {
  const b = q(h, '#mrv-veste-azioni [data-veste-' + quale + ']'); b.onmousedown({ preventDefault() {} });
  await b.click(); await tick(); await tick();
}
const IN_FONDO = 'Rispondi coi bottoni in fondo alla scheda.';
test('G13-Q20 G1 (0086 g3b, g3c): una nota sola su un nodo (B) o sul collegamento — niente gesti della nota in fondo (Q20 cade): la spunta nella nota e il bottone in fondo della scheda', async () => {
  const h = runtime1(); h.apri1(); await vaiA1(h, 'B');
  // 0086, giro 3b: prima i bottoni della nota sola stavano in fondo, dopo «La nota aspetta la sua risposta.»
  assert.deepEqual(bottoniInFondo(h), []);
  assert.equal(notaInFondo(h), null);
  assert.deepEqual(bottoniNellaNota(h, 'b1'), [], 'la nota gialla non ha bottoni');
  assert.equal(rigaInFondo(h, 'b1'), null, 'e non manda in fondo');
  assert.equal(q(h, '[data-veste-spunta-etichetta="b1"]').hidden, false, 'ha la spunta');
  assert.equal(bottone(h).hidden, false, 'il bottone in fondo della scheda');
  const nomi = nomiInVista(h);
  assert.equal(new Set(nomi).size, nomi.length, 'nessun nome due volte: ' + nomi.join(' | '));
  // 0086 g3c: anche sul collegamento Q20 cade — la spunta, niente gesti in fondo
  await vaiA1(h, LINK_AB);
  assert.deepEqual(bottoniInFondo(h), []);
  assert.deepEqual(bottoniNellaNota(h, 'l1'), []);
  assert.equal(nomeSpuntaG(h, 'l1'), 'Tieni il collegamento');
  // a veste spenta niente cambia: nessuna barra della veste, nessun posto in fondo
  const s = runtime1({ flag: '0' }); s.apri1();
  assert.equal(!!q(s, '#mrv-veste-azioni'), false);
  assert.equal(!!q(s, '[data-veste-in-fondo]'), false);
});
test('G13-Q20 G1 (0086 g3b): due o più note aperte (A) — niente gesti in fondo né nelle note: le spunte; la barra non ha gesti di note', async () => {
  const h = runtime1(); h.apri1(); await vaiA1(h, 'A');
  // 0086, giro 3b: prima i bottoni nelle note e «Ogni nota aspetta la sua risposta: ne restano 3.»; ora la riga accanto al
  // bottone in fondo dice che cosa lo tiene spento (a2 contesta tutta la descrizione: la sua spunta parte vuota, D39)
  assert.match(q(h, '#mrv-veste-attesa').textContent, /metti la spunta/);
  assert.deepEqual(bottoniInFondo(h), []);
  assert.equal(notaInFondo(h), null);
  assert.deepEqual(['a1', 'a2', 'a3'].map(id => bottoniNellaNota(h, id)), [[], [], []]);
  assert.deepEqual(['a1', 'a2', 'a3'].map(id => rigaInFondo(h, id)), [null, null, null]);
  assert.equal(q(h, '#mrv-veste-azioni [data-veste-risposta]').hidden, true, 'il posto in fondo, vuoto, non si vede (niente gap)');
  // G2, due note sullo stesso campo: lo stesso
  const g = runtime({ report: { checkStatus: 'completed', issues: dueNote() } }); g.apri(); await vaiA(g, 'mc1');
  assert.deepEqual(bottoniInFondo(g), []);
  assert.deepEqual(['nA', 'nB'].map(id => bottoniNellaNota(g, id).length), [0, 0], '0086 g3c: anche in G2 niente bottoni nelle note');
});
test('G13-Q20 la riga «rispondi in fondo» è UNA chiave (rv_veste_nota_risposta_in_fondo, un solo t()), con l’inglese; il foglio la fa piccola; i bottoni piccoli restano solo dentro la nota', () => {
  const src = fs.readFileSync(require.resolve('../public/js/mappai-banco-veste.js'), 'utf8');
  assert.equal((src.match(/'rv_veste_nota_risposta_in_fondo'/g) || []).length, 1);
  const en = fs.readFileSync(require.resolve('../public/traduzioni/en_translations.js'), 'utf8');
  assert.match(en, /rv_veste_nota_risposta_in_fondo:\s*['"]Answer with the buttons at the bottom of the card\.['"]/);
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8');
  assert.match(css, /\.mrv-veste-nota-in-fondo\s*\{[^}]*font-size:\s*\.75rem/);
  assert.match(css, /\.mrv-veste-nota \.mrv-veste-nota-azioni \.pm-btn-cancel\s*\{/);
  assert.match(css, /\.mrv-veste-azioni \.mrv-veste-risposta\s*\{[^}]*flex:\s*none/);
  const html = fs.readFileSync(require.resolve('../public/index.html'), 'utf8');
  // il marcatore c'è, non quale: lo cambia ogni lavoro che tocca il file (regola dei ritocchi, 0087) e al merge lo
  // sceglie chi risolve il conflitto (Giacomo, via ADMIN, 09/10: «allentare il test del Banco che blocca il marcatore di
  // cache del dizionario inglese»)
  assert.match(html, /mappai-banco-veste\.js\?v=[^"']+/);
  assert.match(html, /en_translations\.js\?v=[^"']+/);
  assert.match(html, /mappai-review-dashboard\.css\?v=[^"']+/);
});

/* ═══ 0086, giro 2 (08/10): I NOMI E LE AREE — una regola sola (D25-D29; ADR 0012 rev. 11) ═══
   Giacomo (D25: «accetto questa soluzione»): «Una regola sola: il bottone dice sempre il nome dell'area che tieni, e le
   aree hanno tre nomi fissi che non cambiano mai significato. «Originale»: il testo generato. «Proposta»: solo la proposta
   del controllo. «Tua versione»: il testo che hai scritto tu.» In G1 e in G2 con la veste (D26), in fondo e nelle note
   gialle; il nome cambia mentre si scrive. I «casi» sono le righe della tabella dei nomi
   (~/Claude/Coordinamento chat/0086-tabella-nomi.md). Le spunte, il bottone di gruppo, D19 e D23 sono del giro 3. ═══ */
// il nome dell'area di sotto (o la riga «Originale» del campo solo, D21), se si vede
const n6Sotto = (h, f) => { const p = q(h, '[data-veste-campo="' + f + '"] [data-veste-proposta-nome]'); return !!p && !p.hidden ? p.textContent : null; };
const n6Prima = (h, f) => { const p = q(h, '[data-veste-campo="' + f + '"] [data-veste-prima]'); return !!p && !p.hidden; };
const n6Etichetta = (h, f) => q(h, '[data-veste-campo="' + f + '"] .mrv-veste-etichetta').textContent;
const n6PropostaInNota = (h, id) => { const p = q(h, '[data-veste-nota="' + id + '"] [data-veste-nota-proposta]'); return !!p && !p.hidden; };
const n6Esito = (h, id) => q(h, '[data-veste-nota="' + id + '"] [data-veste-esito]').textContent;
// giro 2 bis (D31): la riga col nome del valore di un campo senza aree, o del materiale intero ('$item')
const r2bNome = (h, f) => { const p = f === '$item' ? q(h, '[data-veste-scheda] [data-veste-nome-materiale]') : q(h, '[data-veste-campo="' + f + '"] [data-veste-proposta-nome]'); return !!p && !p.hidden ? p.textContent : null; };
const n6Esc = h => tasto(h, { key: 'Escape' });
const N6_SOLO_A1 = () => rapportoG1({ issues: [rapportoG1().issues[0]] });
const N6_B2 = { id: 'b2', target: { kind: 'node', id: 'B', field: 'desc' }, problem: 'Manca la fonte.' };

test('0086-N1 caso 1 (G1, nota sola senza proposta): il campo solo tiene la sua etichetta e porta la riga «Originale» (D21); in fondo «Tieni Originale»; scrivendo «Originale» sopra e «Tua versione» sotto, in fondo «Tieni la tua versione»; Esc, lo scarto della barra, il testo rimesso com’era (anche solo spazi, `piano`) riportano «Tieni Originale»', async () => {
  const h = runtime1(); h.apri1(); await vaiA1(h, 'B');
  await cambiaG(h, 'b1', true);   // 0086 g3d (D43): con la spunta vuota di b1 (descrizione intera) il bottone direbbe «Tieni la tua versione»
  // 0086, giro 3b: «in fondo» è il bottone in fondo della scheda (prima i bottoni della nota sola, Q20); i nomi e la regola
  // che li cambia mentre si scrive sono gli stessi (D37.6)
  const fondo = () => bottone(h).hidden ? [] : [bottone(h).textContent];
  assert.equal(n6Etichetta(h, 'desc'), 'Descrizione', 'l’etichetta del campo resta: è il suo nome accessibile');
  assert.equal(n6Sotto(h, 'desc'), 'Originale', 'D21: la riga «Originale»');
  assert.equal(n6Prima(h, 'desc'), false, 'un campo solo');
  assert.equal(n6Sotto(h, 'label'), null, 'il titolo non ha note: niente riga');
  assert.deepEqual(fondo(), ['Tieni Originale']);
  const el = await scrivi(h, 'desc', F_B, false);
  assert.equal(n6Prima(h, 'desc'), true, '«Originale» sopra');
  assert.deepEqual([nomeArea(h, 'desc', 'prima'), n6Sotto(h, 'desc')], ['Originale', 'Tua versione']);
  assert.deepEqual(fondo(), ['Tieni la tua versione'], 'il nome cambia mentre si scrive');
  n6Esc(h);
  assert.equal(campo(h, 'desc').value, DESC_B);
  assert.deepEqual([n6Prima(h, 'desc'), n6Sotto(h, 'desc')], [false, 'Originale'], 'dopo Esc');
  assert.deepEqual(fondo(), ['Tieni Originale'], 'dopo Esc');
  await scrivi(h, 'desc', DESC_B + '   ', false);
  assert.deepEqual(fondo(), ['Tieni Originale'], 'solo spazi: è ancora l’Originale (piano)');
  assert.deepEqual([n6Prima(h, 'desc'), n6Sotto(h, 'desc')], [false, 'Originale']);
  await scrivi(h, 'desc', F_B, false);
  assert.deepEqual(fondo(), ['Tieni la tua versione']);
  await q(h, '#mrv-veste-annulla').click(); await tick();
  assert.equal(campo(h, 'desc').value, DESC_B, 'lo scarto della barra');
  assert.deepEqual(fondo(), ['Tieni Originale']);
  await scrivi(h, 'desc', F_B, false);
  el.value = DESC_B; el.oninput();
  assert.deepEqual(fondo(), ['Tieni Originale'], 'il testo rimesso com’era scrivendo');
  assert.equal(h.calls.manifest, 0, 'niente è stato scritto');
});
test('0086-N1b caso 1 (0086 g3b; g3d, D41): il ritocco è una bozza e non chiude la nota sola — «Originale» / «Tua versione», il bottone in fondo «Tieni la tua versione» e niente «Testo salvato»; ⌘Z scarta la bozza: «Tieni Originale» e la riga «Originale»', async () => {
  const h = runtime1(); h.apri1(); await vaiA1(h, 'B');
  await cambiaG(h, 'b1', true);   // 0086 g3d (D43): con la spunta vuota di b1 il bottone direbbe sempre «Tieni la tua versione»
  await scrivi(h, 'desc', F_B);
  assert.equal(esito1(h, 'b1'), 'pending');
  assert.equal(h.calls.manifest, 0, 'niente salvato (D41)');
  assert.equal(bottone(h).textContent, 'Tieni la tua versione');
  assert.deepEqual([nomeArea(h, 'desc', 'prima'), n6Sotto(h, 'desc')], ['Originale', 'Tua versione']);
  assert.equal(salvata(h, 'desc'), '', 'niente «Testo salvato»: niente è salvato');
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(dec1(h, 'b1'), 'pending');
  assert.equal(bottone(h).textContent, 'Tieni Originale');
  assert.deepEqual([n6Prima(h, 'desc'), n6Sotto(h, 'desc')], [false, 'Originale']);
});
test('0086-N2 caso 2 (la nota sola contesta tutta la descrizione) e D28: con la spunta vuota «Tieni la tua versione» (D43), messa la spunta «Tieni Originale» → «Tieni la tua versione» scrivendo; tenuta col testo cambiato la nota dice «Tenuta la tua versione», col testo dell’Originale «Testo mantenuto senza modifiche»', async () => {
  const m = g1Manifest(); ['a1', 'a3'].forEach(id => { m.review = Core.setDecision(m.review, id, 'reject'); });
  const h = runtime1({ manifest: m }); h.apri1(); await vaiA1(h, 'A');
  assert.equal(campo(h, 'desc').value, G1_A);
  assert.deepEqual([n6Prima(h, 'desc'), n6Sotto(h, 'desc')], [false, 'Originale']);
  // 0086, giro 3b: il bottone in fondo della scheda (prima i bottoni di a2 in fondo, Q20); la spunta di a2, sulla descrizione
  // intera, parte vuota (D39). Giro 3d (D43): con la spunta vuota il bottone dice «Tieni la tua versione»
  assert.equal(bottone(h).textContent, 'Tieni la tua versione');
  const casella = q(h, '[data-veste-spunta="a2"]'); casella.checked = true; casella.onchange();
  assert.equal(bottone(h).textContent, 'Tieni Originale');
  assert.equal(n6Esito(h, 'a1'), 'Testo mantenuto senza modifiche', 'D28: tenuta col testo dell’Originale');
  await scrivi(h, 'desc', G1_A + ' Aggiunta.', false);
  assert.equal(bottone(h).textContent, 'Tieni la tua versione');
  const w = h.calls.manifest;
  await bottone(h).click(); await tick(); await tick();
  assert.equal(dec1(h, 'a2'), 'reject', 'il bottone chiude la nota intera sul testo del campo');
  assert.equal(adessoDi(h, 'A'), G1_A + ' Aggiunta.');
  assert.equal(h.calls.manifest - w, 1, '0086 g3d (D41): la bozza e il gesto in una scrittura (prima due)');
  await vaiA1(h, 'A');
  assert.equal(n6Esito(h, 'a2'), 'Tenuta la tua versione', 'D28');
});
test('0086-N10 caso 10 (più note) (0086 g3b): il campo con la riga «Originale» e la spunta su ciascuna nota (nessun bottone nelle note); scrivendo il bottone in fondo diventa «Tieni la tua versione»; salvato, le note restano aperte, «Originale» / «Tua versione», e «Testo salvato» non c’è (lo dice il bottone in fondo)', async () => {
  const h = runtime1({ report: rapportoG1({ issues: rapportoG1().issues.concat([N6_B2]) }) }); h.apri1(); await vaiA1(h, 'B');
  await cambiaG(h, 'b1', true);   // 0086 g3d (D43): con la spunta vuota di b1 (descrizione intera) il bottone direbbe «Tieni la tua versione»
  // 0086, giro 3b: prima «Tieni Originale» / «Tieni la tua versione» su ciascuna nota, niente bottone in fondo (D16, caduta)
  assert.equal(n6Sotto(h, 'desc'), 'Originale');
  assert.deepEqual(['b1', 'b2'].map(id => bottoniNellaNota(h, id)), [[], []]);
  assert.deepEqual(['b1', 'b2'].map(id => q(h, '[data-veste-spunta-etichetta="' + id + '"]').hidden), [false, false]);
  assert.equal(bottone(h).textContent, 'Tieni Originale');
  await scrivi(h, 'desc', F_B, false);
  assert.equal(bottone(h).textContent, 'Tieni la tua versione');
  campo(h, 'desc').onblur(); await tick();
  assert.deepEqual(['b1', 'b2'].map(id => dec1(h, id)), ['pending', 'pending'], 'restano aperte (D37.1)');
  assert.deepEqual([nomeArea(h, 'desc', 'prima'), n6Sotto(h, 'desc')], ['Originale', 'Tua versione']);
  assert.equal(salvata(h, 'desc'), '');
});
test('0086-N12 caso 12 e 16: sul non letto «Va bene così» resta (unico posto), il campo solo non porta la riga «Originale»; dopo un ritocco «Originale» / «Tua versione»; lo stesso fuori elenco', async () => {
  const h = runtime1(); h.apri1(); await vaiA1(h, 'C');
  assert.equal(bottone(h).textContent, 'Va bene così');
  assert.equal(n6Sotto(h, 'desc'), null, 'D21 non vale sui non letti');
  await scrivi(h, 'desc', 'Il commercio con la Germania continuò.', false);
  assert.deepEqual([nomeArea(h, 'desc', 'prima'), n6Sotto(h, 'desc')], ['Originale', 'Tua versione']);
  // anche con una segnalazione del docente rimasta aperta sul non letto (Banco di prima): il bottone segue la regola.
  // Giro 2 bis (difetto 5 del revisore): e la riga «Originale» c'è anche qui, perché in fondo c'è «Tieni Originale» (era null)
  const m = g1Manifest();
  m.review = Core.addIssue(m.review, { target: { kind: 'node', id: 'C', field: 'desc' }, problem: 'Modifica del docente: Commercio', origin: 'teacher', blocking: true }, DB1);
  const k = runtime1({ manifest: m }); k.apri1(); await vaiA1(k, 'C');
  assert.deepEqual(bottoniInFondo(k), ['Tieni Originale']);
  assert.equal(n6Sotto(k, 'desc'), 'Originale');
  assert.equal(n6Prima(k, 'desc'), false, 'un campo solo');
  const g = conStrato1(runtime1({ storage: Object.assign({ mappai_frasi_orfane: '1' }, STRATO) })); g.apri1();
  await q(g, '#mrv-coverage-options [data-aff-orf-correggi="E"]').click(); await tick(); await tick();
  assert.equal(scheda(g), 'E');
  assert.equal(n6Sotto(g, 'desc'), null, 'né fuori elenco');
  await scrivi(g, 'desc', 'L’esercito si ritirò nel Ridotto alpino.', false);
  assert.equal(n6Sotto(g, 'desc'), 'Tua versione');
});
test('0086-N13 caso 13 (collegamento; 0086 g3c): sulle parole proposte la spunta «Tieni il collegamento» e l’area «Proposta», niente bottoni (via «Tieni le parole», D29); niente riga «Originale» sulle parole; il bottone in fondo con le parole di partenza rifiuta la proposta', async () => {
  const r1 = { id: 'r1', target: { kind: 'link', source: 'A', target: 'B', rel: 'causa', field: 'rel' }, after: 'favorisce', problem: 'Il verbo è troppo forte.' };
  const h = runtime1({ report: rapportoG1({ issues: rapportoG1().issues.concat([r1]) }) }); h.apri1(); await vaiA1(h, LINK_AB);
  assert.deepEqual(bottoniNellaNota(h, 'l1'), []);
  assert.deepEqual(bottoniNellaNota(h, 'r1'), []);
  assert.deepEqual(['l1', 'r1'].map(id => nomeSpuntaG(h, id)), ['Tieni il collegamento', 'Tieni il collegamento']);
  assert.equal(areaG(h, 'r1').hidden, false);
  assert.equal(!!q(h, '[data-veste-campo="rel"] [data-veste-proposta-nome]'), false);
  assert.equal(nomiInVista(h).includes('Va bene così'), false);
  assert.equal(nomiInVista(h).includes('Tieni le parole'), false);
  assert.equal(bottone(h).textContent, 'Tieni Originale');
  await premiG(h);
  assert.equal(dec1(h, 'r1'), 'reject');
});
test('0086-N15 caso 15 (una richiesta del docente aperta sulla descrizione): «Tieni Originale» → «Tieni la tua versione», mai «Va bene così»; il campo porta la riga «Originale»', async () => {
  const m = g1Manifest();
  m.review = Core.addIssue(m.review, { target: { kind: 'node', id: 'E', field: 'desc' }, problem: 'Modifica del docente: Esercito', origin: 'teacher', blocking: true }, DB1);
  const h = runtime1({ manifest: m }); h.apri1(); await vaiA1(h, 'E');
  assert.deepEqual(bottoniInFondo(h), ['Tieni Originale']);
  assert.equal(n6Sotto(h, 'desc'), 'Originale');
  await scrivi(h, 'desc', 'L’esercito si ritirò nel Ridotto alpino.', false);
  assert.deepEqual(bottoniInFondo(h), ['Tieni la tua versione']);
  assert.equal(nomiInVista(h).includes('Va bene così'), false);
});
test('0086-N-titolo (0086 g3b; g3d, D41) il nome in fondo segue il campo con la nota: la proposta sul TITOLO, sola — «Tieni Originale», «Usa Proposta» copiata la proposta, e scrivere nella descrizione non lo cambia; la descrizione scritta resta una bozza (niente «Testo salvato»)', async () => {
  const bt = { id: 'bt', target: { kind: 'node', id: 'B', field: 'label' }, after: 'Banche svizzere', problem: 'Titolo vago.' };
  const m = g1Manifest(rapportoG1({ issues: rapportoG1().issues.concat([bt]) }));
  m.review = Core.setDecision(m.review, 'b1', 'reject');
  const h = runtime1({ manifest: m }); h.apri1(); await vaiA1(h, 'B');
  // 0086, giro 3b: prima la proposta del titolo era scritta nel campo e i bottoni di bt stavano in fondo (Q20)
  assert.equal(notaInFondo(h), null);
  assert.equal(n6Sotto(h, 'label'), 'Originale');
  assert.equal(bottone(h).textContent, 'Tieni Originale');
  q(h, '[data-veste-nota="bt"] [data-veste-nota-proposta]').onclick();
  assert.deepEqual([nomeArea(h, 'label', 'prima'), n6Sotto(h, 'label')], ['Originale', 'Proposta']);
  assert.equal(bottone(h).textContent, 'Usa Proposta');
  await scrivi(h, 'desc', F_B, false);
  assert.equal(bottone(h).textContent, 'Usa Proposta', 'la descrizione non è il campo di una nota aperta');
  campo(h, 'desc').onblur(); await tick();
  assert.equal(dec1(h, 'bt'), 'pending');
  // 0086 g3d (D41): con la nota aperta sul titolo la scheda tiene i campi come bozza: niente salvato, niente «Testo salvato»
  assert.equal(h.calls.manifest, 0);
  assert.equal(salvata(h, 'desc'), '');
});
test('0086-N21 D21 sul titolo e sulla descrizione: ogni campo solo con una nota tiene la sua etichetta («Titolo», «Descrizione») e porta la riga «Originale»; scrivendo nel titolo, il titolo ha «Originale» / «Tua versione» e la descrizione resta col campo solo', async () => {
  const bl = { id: 'bl', target: { kind: 'node', id: 'B', field: 'label' }, problem: 'Titolo vago.' };
  const h = runtime1({ report: rapportoG1({ issues: rapportoG1().issues.concat([bl]) }) }); h.apri1(); await vaiA1(h, 'B');
  await cambiaG(h, 'b1', true);   // 0086 g3d (D43): con la spunta vuota di b1 il bottone direbbe «Tieni la tua versione»
  assert.deepEqual(['label', 'desc'].map(f => n6Etichetta(h, f)), ['Titolo', 'Descrizione']);
  assert.deepEqual(['label', 'desc'].map(f => n6Sotto(h, f)), ['Originale', 'Originale']);
  // 0086, giro 3b: le note non hanno bottoni (prima «Tieni Originale» su ciascuna); il bottone in fondo dice il campo che
  // non è più l'Originale, fra quelli con note aperte (D37.6)
  assert.deepEqual(['bl', 'b1'].map(id => bottoniNellaNota(h, id)), [[], []]);
  assert.equal(bottone(h).textContent, 'Tieni Originale');
  await scrivi(h, 'label', 'Banche svizzere', false);
  assert.deepEqual([n6Prima(h, 'label'), n6Sotto(h, 'label')], [true, 'Tua versione']);
  assert.deepEqual([n6Prima(h, 'desc'), n6Sotto(h, 'desc')], [false, 'Originale']);
  assert.equal(bottone(h).textContent, 'Tieni la tua versione', 'il titolo ha la nota bl: il suo testo conta per il nome');
});
test('0086-N8 (0086 g3d, D41) «Testo salvato» in G1 non c’è sulle schede con note del controllo aperte: il campo è una bozza fino al bottone in fondo, che dice «Tieni la tua versione» o «Usa Proposta»', async () => {
  const m = g1Manifest(); ['a1', 'a3'].forEach(id => { m.review = Core.setDecision(m.review, id, 'reject'); });
  const h = runtime1({ manifest: m }); h.apri1(); await vaiA1(h, 'A');
  await scrivi(h, 'desc', G1_A + ' Aggiunta.');
  assert.equal(dec1(h, 'a2'), 'pending', 'la nota intera resta aperta');
  // 0086, giro 3b: il bottone in fondo della scheda (prima i bottoni della nota sola in fondo, Q20)
  assert.equal(bottone(h).textContent, 'Tieni la tua versione');
  assert.equal(salvata(h, 'desc'), '', '0086 g3d (D41): niente è salvato prima del bottone');
  assert.equal(h.calls.manifest, 0);
  // la nota sola non si chiude più col ritocco (D37.1); 0086 g3d (D41): la proposta copiata è una bozza, e «Testo salvato» non c'è
  const k = runtime1({ report: N6_SOLO_A1() }); k.apri1(); await vaiA1(k, 'A');
  q(k, '[data-veste-nota="a1"] [data-veste-nota-proposta]').onclick(); campo(k, 'desc').onblur(); await tick();
  assert.equal(bottone(k).textContent, 'Usa Proposta');
  assert.equal(salvata(k, 'desc'), '');
  assert.equal(k.calls.manifest, 0);
});
test('0086-N-sospesa (0086 g3c) il bottone in fondo «Tieni la tua versione» con la battitura del titolo respinta (scelte salvate prima in conflitto sul nodo): nessuna scrittura, la nota resta com’era, la riga di stato dice che cosa premere e che il bottone non ha scritto niente', async () => {
  const at = { id: 'at', target: { kind: 'node', id: 'A', field: 'label' }, problem: 'Titolo vago.' };
  const m = g1Manifest(rapportoG1({ issues: rapportoG1().issues.concat([at]) }));
  m.review = Core.setDecision(m.review, 'a1', 'accept');
  m.review = Core.setDecision(m.review, 'a2', 'manual', { text: 'Lo Stato fu accusato. Le banche custodivano i depositi.' });
  const h = runtime1({ manifest: m }); h.apri1(); await vaiA1(h, 'A');
  await cambia3(h, 'a2', true);   // a2, in conflitto, contesta la descrizione intera: la sua spunta parte vuota (D39)
  await scrivi(h, 'label', 'Accuse gravi', false);
  assert.equal(bottone(h).textContent, 'Tieni la tua versione');
  const w = h.calls.manifest;
  bottone(h).onmousedown({ preventDefault() {} }); await premiG(h);
  assert.equal(h.calls.manifest - w, 0, 'nessuna scrittura');
  assert.equal(dec1(h, 'at'), 'pending');
  assert.match(q(h, '#mrv-status').textContent, /premi Esc per lasciare il campo com’era, poi il bottone in fondo/);
  assert.match(q(h, '#mrv-status').textContent, /«Tieni la tua versione» non ha scritto niente/);
  assert.equal(campo(h, 'label').value, 'Accuse gravi', 'la battitura resta nel campo');
});
test('0086-N17b G2, una nota sulle alternative (senza aree; 0086 g3c): la riga del campo «Originale» finché sono quelle generate, «Tua versione» appena se ne scrive una, Esc riporta «Originale»; niente bottoni nella nota né in fondo', async () => {
  const report = { checkStatus: 'completed', issues: [{ id: 'nO', target: { kind: 'item', id: 'mc1', field: 'options' }, problem: 'Alternative da rivedere.' }] };
  const h = runtime({ report }); h.apri(); await vaiA(h, 'mc1');
  assert.deepEqual(bottoniInFondo(h), []);
  assert.deepEqual(bottoniNotaG(h, 'nO'), []);
  assert.equal(r2bNome(h, 'options'), 'Originale');
  const a = entra(alternativa(h, 0)); a.value = 'Lo Stato federale'; a.oninput();
  assert.equal(r2bNome(h, 'options'), 'Tua versione');
  assert.equal(bottone(h).textContent, 'Rivisto');
  n6Esc(h);
  assert.equal(r2bNome(h, 'options'), 'Originale');
  assert.equal(bottone(h).textContent, 'Approvato');
});
test('0086-N-escludi G2 (§4.9, D8): con la nota sola d’esclusione e nessun’altra decisione «Escludi» della barra decide la nota (accept, nessuna esclusione del docente) e «Escludi il materiale» non c’è; ⌘Z la riapre; «Ripristina» la chiude come «Materiale tenuto»', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'ca1');
  // 0086 g3c: la nota ha la spunta «Tieni il materiale», niente bottoni
  assert.deepEqual(bottoniInFondo(h), []);
  assert.equal(nomeSpuntaG(h, 'n-ca1'), 'Tieni il materiale');
  await q(h, '#mrv-veste-escludi').click(); await tick(); await tick();
  assert.equal(decisione(h, 'n-ca1'), 'accept');
  assert.equal(h.final().initial.issues.some(i => i.id === 'teacher-exclude-ca1'), false, 'nessuna esclusione del docente');
  assert.equal(q(h, '#mrv-veste-escludi').textContent, 'Ripristina');
  fuoriDalModale(h, CMD_Z); await tick(); await tick();
  assert.equal(decisione(h, 'n-ca1'), 'pending');
  assert.equal(vistaG(h, 'n-ca1'), true, 'riaperta, torna la sua spunta');
  await q(h, '#mrv-veste-escludi').click(); await tick(); await tick();
  assert.equal(decisione(h, 'n-ca1'), 'accept');
  await q(h, '#mrv-veste-escludi').click(); await tick(); await tick();
  assert.equal(decisione(h, 'n-ca1'), 'reject', '«Ripristina» com’è');
  assert.equal(n6Esito(h, 'n-ca1'), 'Materiale tenuto');
});
test('0086-N-escludi G2 con un’altra decisione attiva (una proposta scelta) o una battitura in sospeso: la strada di oggi — «Escludi» della barra aggiunge l’esclusione del docente, nessun conflitto (0086 g3c: la nota d’esclusione ha la spunta)', async () => {
  const altra = { id: 'n-ca1-q', target: { kind: 'item', id: 'ca1', field: 'question' }, after: 'Pressioni alleate', problem: 'Domanda vaga.' };
  const m = finalManifest(ITEMS, rapporto({ issues: clone(NOTE).concat([altra]) }));
  m.review.final.review = Core.setDecision(m.review.final.review, 'n-ca1-q', 'accept');
  const h = runtime({ manifest: m }); h.apri(); await vaiA(h, 'ca1');
  assert.equal(vistaG(h, 'n-ca1'), true, '0086 g3c: la spunta, niente bottoni');
  await q(h, '#mrv-veste-escludi').click(); await tick(); await tick();
  assert.equal(h.final().initial.issues.some(i => i.id === 'teacher-exclude-ca1'), true);
  assert.equal(decisione(h, 'n-ca1'), 'pending');
  const k = runtime(); k.apri(); await vaiA(k, 'ca1');
  await scrivi(k, 'question', 'Pressioni degli Alleati', false);
  assert.deepEqual(bottoniNotaG(k, 'n-ca1'), [], '0086 g3c: niente bottoni nella nota');
  await q(k, '#mrv-veste-escludi').click(); await tick(); await tick();
  assert.equal(k.final().initial.issues.some(i => i.id === 'teacher-exclude-ca1'), true);
  assert.equal(decisione(k, 'n-ca1'), 'pending');
  assert.equal(conflittiScelte(k, 'ca1'), 0);
});
test('0086-N-va-bene «Va bene così» resta solo sulle righe non lette: nessuna nota lo dice, in G1 e in G2', async () => {
  const h = runtime1(); h.apri1();
  for (const id of ['A', 'B', LINK_AB]) { await vaiA1(h, id); assert.equal(nomiInVista(h).includes('Va bene così'), false, id); }
  await vaiA1(h, 'C');
  assert.equal(nomiInVista(h).includes('Va bene così'), true, 'il non letto');
  const g = runtime(); g.apri();
  for (const id of ['mc1', 'mc2', 'ca1']) { await vaiA(g, id); assert.equal(nomiInVista(g).includes('Va bene così'), false, id); }
});
test('0086-N-chiavi le parole nuove sono UNA chiave ciascuna (un solo t() col ripiego), in inglese nel blocco «0086» subito dopo le chiavi rv_veste_g1_* dello 0075, non in italiano (invariante 14)', () => {
  const src = fs.readFileSync(require.resolve('../public/js/mappai-banco-veste.js'), 'utf8');
  const en = fs.readFileSync(require.resolve('../public/traduzioni/en_translations.js'), 'utf8').split('\n');
  const it = fs.readFileSync(require.resolve('../public/traduzioni/it_translations.js'), 'utf8');
  const nuove = [['rv_veste_tua_versione', 'Tua versione', 'Your version'], ['rv_veste_tieni_tua', 'Tieni la tua versione', 'Keep your version'],
    ['rv_veste_tenuta_tua', 'Tenuta la tua versione', 'Your version kept']];   // 0086 g3c: «Tieni le parole» tolta (D29 cade)
  const ultimaG1 = en.reduce((u, x, k) => (/^\s*rv_veste_g1_[a-z0-9_]+:/.test(x) ? k : u), -1);
  for (const [k, f, e] of nuove) {
    assert.equal((src.match(new RegExp("'" + k + "'", 'g')) || []).length, 1, k + ': un solo t()');
    assert.ok(src.includes("t('" + k + "', '" + f + "')"), k + ' col ripiego «' + f + '»');
    const righe = en.map((x, n) => [x, n]).filter(([x]) => x.trim().startsWith(k + ':'));
    assert.equal(righe.length, 1, k + ' in inglese');
    assert.match(righe[0][0], new RegExp(': "' + e + '",\\s*$'), k);
    assert.ok(righe[0][1] > ultimaG1, k + ' dopo le chiavi rv_veste_g1_* dello 0075');
    assert.ok(!it.includes(k), k + ' non in italiano');
  }
  assert.match(en[ultimaG1 + 1], /0086/, 'il blocco «0086» comincia subito dopo');
});
test('0086-N-spenta a veste spenta niente dei nomi nuovi: G1 e G2 sono quelli di prima', () => {
  for (const flag of ['0']) {   // 0089: senza chiave la veste è accesa
    const h = runtime1({ flag }); h.apri1();
    assert.equal(/Tua versione|Tieni la tua versione|Tieni le parole|Tenuta la tua versione/.test(h.dom.html()), false);
    const g = runtime({ flag }); g.apri();
    assert.equal(/Tua versione|Tieni la tua versione/.test(g.dom.html()), false);
  }
});

/* ═══ 0086, giro 2 bis (08/10): LE CORREZIONI DEI NOMI dopo le due verifiche indipendenti del giro 2 ═══
   Un revisore avversario e un verificatore di mutazioni, in sola lettura. Le regole sono nel packet: §0 «Durante
   l'esecuzione» (D30, D31 e le regole applicate senza decisioni nuove) e §4.5 «I nomi». Scritti prima del codice
   (rossi sul codice del giro 2: scratchpad, rosso-0086-giro2bis.txt). I test GAP- sono quelli che il verificatore ha
   proposto per le mutazioni rimaste verdi, portati qui coi helper del file. */

test('0086-R3a D31 G2, una nota sulle alternative (senza aree): sul campo la riga «Originale» finché sono quelle generate, «Tua versione» appena se ne scrive una (o si cambia la corretta); Esc riporta «Originale»', async () => {
  const report = { checkStatus: 'completed', issues: [{ id: 'nO', target: { kind: 'item', id: 'mc1', field: 'options' }, problem: 'Alternative da rivedere.' }] };
  const h = runtime({ report }); h.apri(); await vaiA(h, 'mc1');
  assert.equal(r2bNome(h, 'options'), 'Originale');
  assert.equal(q(h, '[data-veste-campo="options"] [data-veste-proposta-nome]').getAttribute('class'), 'mrv-veste-sotto', 'lo stile della riga D21');
  const a = entra(alternativa(h, 0)); a.value = 'Lo Stato federale'; a.oninput();
  assert.equal(r2bNome(h, 'options'), 'Tua versione');
  n6Esc(h);
  assert.equal(r2bNome(h, 'options'), 'Originale');
  assert.equal(r2bNome(h, 'explanation'), null, 'un campo senza note non porta la riga');
});
test('0086-R3b D31 G2, criteri e righe (la nota «criteri» sul campo «criteria»; 0086 g3c): la riga segue il valore di ciascun campo; niente bottoni nelle note', async () => {
  const report = { checkStatus: 'completed', issues: [{ id: 'nK', target: { kind: 'item', id: 'op1', field: 'criteri' }, problem: 'Criteri vaghi.' },
    { id: 'nL', target: { kind: 'item', id: 'op1', field: 'lines' }, problem: 'Poche righe.' }] };
  const h = runtime({ report }); h.apri(); await vaiA(h, 'op1');
  assert.deepEqual(['criteria', 'lines'].map(f => r2bNome(h, f)), ['Originale', 'Originale']);
  assert.deepEqual(['nK', 'nL'].map(id => bottoniNellaNota(h, id)), [[], []]);
  const el = entra(q(h, '[data-veste-scheda] [data-veste-input="criteria"]')); el.value = 'Cita le banche e lo Stato.'; el.oninput();
  assert.deepEqual(['criteria', 'lines'].map(f => r2bNome(h, f)), ['Tua versione', 'Originale']);
  const n = entra(campo(h, 'lines')); n.value = '8'; n.oninput();
  assert.equal(r2bNome(h, 'lines'), 'Tua versione');
});
test('0086-R3c D31 G2, una nota su tutto il materiale (senza proposta): la riga del materiale dice «Originale», «Tua versione» appena si scrive un campo', async () => {
  const report = { checkStatus: 'completed', issues: [{ id: 'nI', target: { kind: 'item', id: 'mc2', field: '$item' }, problem: 'Il materiale è confuso.' }] };
  const h = runtime({ report }); h.apri(); await vaiA(h, 'mc2');
  assert.equal(r2bNome(h, '$item'), 'Originale');
  await scrivi(h, 'question', 'Che cosa custodivano le banche?', false);
  assert.equal(r2bNome(h, '$item'), 'Tua versione');
  n6Esc(h);
  assert.equal(r2bNome(h, '$item'), 'Originale');
  // la nota d'esclusione (fuori dalla regola: «Escludi il materiale» / «Tieni il materiale») non porta la riga
  const g = runtime(); g.apri(); await vaiA(g, 'ca1');
  assert.equal(r2bNome(g, '$item'), null);
});
test('0086-R3d D31: la riga col nome è quella della riga D21 (.mrv-veste-sotto), nel token --mm-testo-2 con contrasto ≥ 4,5:1 sul fondo della scheda (#fff)', () => {
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8');
  const regola = (css.match(/#mappai-teacher-review\.mrv-veste \.mrv-veste-sotto \{[^}]*\}/) || [''])[0];
  assert.match(regola, /color: var\(--mm-testo-2, #475569\)/);
  const token = fs.readFileSync(require.resolve('../public/css/mappai-modal-tokens.css'), 'utf8').match(/--mm-testo-2:\s*(#[0-9a-fA-F]{6})/)[1];
  const lum = x => { const v = [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const contrasto = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  assert.ok(contrasto(token, '#ffffff') >= 4.5, 'contrasto ' + contrasto(token, '#ffffff').toFixed(2));
  const src = fs.readFileSync(require.resolve('../public/js/mappai-banco-veste.js'), 'utf8');
  assert.equal((src.match(/<p class="mrv-veste-sotto" data-veste-proposta-nome hidden><\/p>/g) || []).length, 3, 'testo, voci e numero: la stessa riga');
  assert.equal((src.match(/<p class="mrv-veste-sotto" data-veste-nome-materiale hidden><\/p>/g) || []).length, 1, 'il materiale intero');
});
test('0086-R7 «Va bene così» su un non letto non c’è mentre una battitura è in sospeso (dopo un ritocco nasce una segnalazione, non un testo da confermare); Esc lo rimette', async () => {
  const h = runtime1(); h.apri1(); await vaiA1(h, 'C');
  assert.equal(vaBene(h).hidden, false);
  await scrivi(h, 'desc', DESC_C + '  ', false);
  assert.equal(vaBene(h).hidden, false, 'soli spazi: salvati non cambiano niente, il testo da confermare è quello');
  await scrivi(h, 'desc', 'Il commercio con la Germania continuò.', false);
  assert.equal(vaBene(h).hidden, true);
  assert.equal(nomiInVista(h).includes('Va bene così'), false);
  n6Esc(h);
  assert.equal(vaBene(h).hidden, false);
  assert.equal(vaBene(h).textContent, 'Va bene così');
});

/* ── GAP: i test del verificatore di mutazioni del giro 2 (GAP-G14 adattato al punto 4) ── */
test('0086-GAP-G20 G2, una nota su tutto il materiale senza proposta (0086 g3c; g3d, D41): la riga del materiale «Originale», «Tua versione» appena si scrive un campo; uscendo, la nota resta aperta, il bottone del materiale «Rivisto», e niente è salvato', async () => {
  const report = { checkStatus: 'completed', issues: [{ id: 'nI', target: { kind: 'item', id: 'mc2', field: '$item' }, problem: 'Il materiale è confuso.' }] };
  const h = runtime({ report }); h.apri(); await vaiA(h, 'mc2');
  assert.equal(r2bNome(h, '$item'), 'Originale');
  assert.deepEqual(bottoniInFondo(h), []);
  await scrivi(h, 'question', 'Che cosa custodivano le banche?', false);
  assert.equal(r2bNome(h, '$item'), 'Tua versione');
  campo(h, 'question').onblur(); await tick();
  assert.equal(decisione(h, 'nI'), 'pending');
  assert.equal(bottone(h).textContent, 'Rivisto');
  // 0086 g3d (D41): anche in G2, con una nota del controllo il campo è una bozza fino al bottone: niente «Testo salvato»
  assert.equal(h.calls.manifest, 0);
  assert.equal(salvata(h, 'question'), '');
});
test('0086-GAP-G21 G2, nota sulle alternative (0086 g3c): cambiata solo la risposta corretta la riga dice «Tua versione» (alternative e corretta si confrontano insieme); la nota resta aperta', async () => {
  const report = { checkStatus: 'completed', issues: [{ id: 'nO', target: { kind: 'item', id: 'mc1', field: 'options' }, problem: 'Alternative da rivedere.' }] };
  const h = runtime({ report }); h.apri(); await vaiA(h, 'mc1');
  assert.equal(r2bNome(h, 'options'), 'Originale');
  const radio = q(h, '[data-veste-scheda] [data-veste-corretta="2"]'); radio.checked = true; await radio.onchange(); await tick();
  assert.equal(decisione(h, 'nO'), 'pending');
  assert.equal(r2bNome(h, 'options'), 'Tua versione');
});
test('0086-GAP-G22 G2, D28 a meno di spazi: una nota tenuta su un campo il cui testo salvato è l’Originale con soli spazi in più dice «Testo mantenuto senza modifiche»', async () => {
  const report = { checkStatus: 'completed', issues: [
    { id: 'nP', target: { kind: 'item', id: 'mc2', field: 'explanation' }, after: 'I depositi d’oro.', problem: 'Spiegazione vaga.' },
    { id: 'nK', target: { kind: 'item', id: 'mc2', field: 'explanation' }, problem: 'Manca la fonte.' }] };
  const m = finalManifest(ITEMS, report);
  m.review.final.review = Core.setDecision(m.review.final.review, 'nP', 'accept');
  m.review.final.review = Core.setDecision(m.review.final.review, 'nK', 'reject');
  const h = runtime({ manifest: m }); h.apri(); await vaiA(h, 'mc2');
  await scrivi(h, 'explanation', 'I depositi.  ');
  assert.equal(adessoG2(h, 'mc2', 'explanation').trim(), 'I depositi.');
  assert.equal(n6Esito(h, 'nK'), 'Testo mantenuto senza modifiche');
});
test('0086-GAP-G40 D28 sul testo SALVATO (0086 g3c): una nota già tenuta sul titolo, con una battitura nel titolo rimasta in sospeso (salvataggio respinto per le scelte in conflitto) e il bottone in fondo che non scrive, dice ancora «Testo mantenuto senza modifiche»', async () => {
  const at = { id: 'at', target: { kind: 'node', id: 'A', field: 'label' }, problem: 'Titolo vago.' };
  const m = g1Manifest(rapportoG1({ issues: rapportoG1().issues.concat([at]) }));
  m.review = Core.setDecision(m.review, 'at', 'reject');
  m.review = Core.setDecision(m.review, 'a1', 'accept');
  m.review = Core.setDecision(m.review, 'a2', 'manual', { text: 'Lo Stato fu accusato. Le banche custodivano i depositi.' });
  const h = runtime1({ manifest: m }); h.apri1(); await vaiA1(h, 'A');
  assert.equal(n6Esito(h, 'at'), 'Testo mantenuto senza modifiche');
  await scrivi(h, 'label', 'Accuse gravi', false);
  await premiG(h);
  assert.equal(campo(h, 'label').value, 'Accuse gravi', 'la battitura è ancora nel campo');
  assert.equal(n6Esito(h, 'at'), 'Testo mantenuto senza modifiche');
});
test('0086-R-chiavi (0086 g3c): le frasi del conflitto dei giri 2 bis e 2 ter (D30, D32) sono tolte dalla veste e dall’inglese, con quelle che avevano già sostituito; GESTI_NOTA non c’è', () => {
  const src = fs.readFileSync(require.resolve('../public/js/mappai-banco-veste.js'), 'utf8');
  const en = fs.readFileSync(require.resolve('../public/traduzioni/en_translations.js'), 'utf8').split('\n');
  for (const k of ['rv_veste_conflitto_scheda_come', 'rv_veste_conflitto_scheda_annulla_come', 'rv_veste_conflitto_qui_scheda_come', 'rv_veste_conflitto_qui_scheda_annulla_come',
    'rv_veste_conflitto_note_come', 'rv_veste_conflitto_qui_note_come', 'rv_veste_gia_scelta_conflitto_come', 'rv_veste_scelte_conflitto_come',
    'rv_veste_conflitto_note', 'rv_veste_g1_conflitto_note', 'rv_veste_conflitto_scheda_note', 'rv_veste_g1_conflitto_scheda_note',
    'rv_veste_conflitto_scheda', 'rv_veste_g1_conflitto_scheda', 'rv_veste_scelte_conflitto_note', 'rv_veste_gia_scelta_conflitto', 'rv_veste_conflitto', 'rv_veste_g1_conflitto', 'rv_veste_scelte_conflitto']) {
    assert.equal(en.filter(x => x.trim().startsWith(k + ':')).length, 0, k + ': tolta da en_translations.js');
    assert.equal((src.match(new RegExp("'" + k + "'", 'g')) || []).length, 0, k + ': nessun t()');
  }
  assert.doesNotMatch(src, /const GESTI_NOTA|GESTI_NOTA\(\)/);
});

/* ═══ 0086, giro 2 ter (08/10): i difetti confermati dalla verifica indipendente del giro 2 bis ═══
   Revisore avversario (rapporto del giro 2 bis, difetti 1, 2, 4b, 5, 6) e verificatore di mutazioni. Scritti prima del
   codice (rossi sul codice del giro 2 bis: scratchpad, rosso-0086-giro2ter.txt). Il difetto 3 (D30 in G2 senza strada) e
   il 4a («Tieni la tua versione» calcolato dal reject) aspettano una decisione di Giacomo: qui non si toccano. */
// «Usa Proposta» col mouse (il mousedown non toglie il fuoco al campo, R6)
/* D1 (difetto 1 del revisore, ALTA): «Tieni Originale» c'è solo se dopo il clic il testo resterebbe «Originale» (§4.5), e il
   clic fa quello che il nome dice. Il ramo D2 (il gesto parte da prima della battitura) vale solo per una battitura in
   sospeso al momento del gesto, che il gesto stesso salva (R6, col mouse); mai per una battitura salvata prima — uscendo
   dal campo, o col Tab, dove conta lo stato a schermo al momento del tasto (§4.4). */
// il ramo D2 resta per la battitura in sospeso al clic col mouse (0075, nono giro): la controprova sullo stesso nodo

/* D2 (difetto 2 del revisore; chiarimento dell'§4.8 approvato da Giacomo): «Testo salvato» manca solo se, dopo il
   salvataggio, il bottone in fondo dice «Tieni la tua versione» E la nota in fondo è sul campo appena salvato. */
test('0086-T2a (0086 g3d, D41): su una scheda con note del controllo anche il campo senza note (il titolo, con le note sulla descrizione) è una bozza: niente scrittura all’uscita, niente «Testo salvato»; il bottone in fondo lo registra', async () => {
  // 0086, giro 2 ter (D2): prima il titolo si salvava all'uscita e sotto c'era «Testo salvato»
  const h = runtime1(); h.apri1(); await vaiA1(h, 'A');
  await scrivi(h, 'desc', G1_A1 + ' Ritocco.');
  assert.equal(bottone(h).textContent, 'Tieni la tua versione');
  await scrivi(h, 'label', 'Accuse alle banche');
  assert.equal(h.calls.manifest, 0);
  assert.equal(salvata(h, 'label'), '');
  await cambiaG(h, 'a2', true); await premiG(h);
  assert.equal(h.calls.manifest, 1, 'titolo, descrizione e spunte in una scrittura');
  assert.equal(titoloAdesso(h, 'A'), 'Accuse alle banche');
});
/* D5 (difetto 5 del revisore): le parole di un collegamento seguono la regola «soli spazi non contano» — il salvataggio
   taglia gli spazi e non scrive niente. */
test('0086-T5 D5: sulle parole di un collegamento non letto i soli spazi non contano — «Va bene così» resta mentre si scrivono, il salvataggio non scrive; una parola vera lo toglie', async () => {
  const h = runtime1(); h.apri1(); await vaiA1(h, LINK_CD);
  assert.equal(vaBene(h).hidden, false);
  const el = entra(campo(h, 'rel')); el.value = el.value + '  '; el.oninput();
  assert.equal(vaBene(h).hidden, false, 'soli spazi in sospeso: il bottone resta');
  const w = h.calls.manifest; el.onblur(); await tick();
  assert.equal(h.calls.manifest, w, 'il salvataggio taglia gli spazi: nessuna scrittura');
  assert.equal(vaBene(h).hidden, false);
  const k = entra(campo(h, 'rel')); k.value = 'segue'; k.oninput();
  assert.equal(vaBene(h).hidden, true, 'una parola vera: dopo un ritocco non c’è un testo da confermare');
  const src = fs.readFileSync(require.resolve('../public/js/mappai-banco-veste.js'), 'utf8');
  assert.doesNotMatch(src, /le parole non hanno la regola degli spazi/, 'il commento falso è tolto');
});

/* ═══ 0086-M2B: i test del verificatore di mutazioni del giro 2 bis, portati al giro 2 ter ═══
   Giro 3c: tolti quelli di D30–D35 (le frasi «come sciogliere», «Togli questa scelta», i gesti delle note in G2); restano
   quelli di D31 (la riga col nome dei campi di G2 senza aree) e quelli che valgono ancora con le spunte. */
// ── D31 (C03, C08, C21, C22) ──
const M2B_RAPPORTO_OP1_CRITERI = { checkStatus: 'completed', issues: [{ id: 'nK', target: { kind: 'item', id: 'op1', field: 'criteri' }, problem: 'Criteri vaghi.' }] };
test('0086-M2B-C03 D31: la riga col nome compare solo sui campi che hanno una nota della scheda — nota sui criteri: «lines» e il materiale non la portano; nota sulla domanda di mc1: le alternative non la portano', async () => {
  const h = runtime({ report: M2B_RAPPORTO_OP1_CRITERI }); h.apri(); await vaiA(h, 'op1');
  assert.equal(r2bNome(h, 'criteria'), 'Originale');
  assert.equal(r2bNome(h, 'lines'), null, 'il campo «lines» non ha note');
  assert.equal(r2bNome(h, '$item'), null, 'il materiale non ha note sul tutto');
  const k = runtime(); k.apri(); await vaiA(k, 'mc1');   // la nota di mc1 è sulla domanda (testo): alternative senza riga
  assert.equal(r2bNome(k, 'options'), null);
});
test('0086-M2B-C08 D31: la riga del materiale compare solo con una nota SU TUTTO il materiale — una nota sulla spiegazione non la accende', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc2');       // n-mc2-e è sulla spiegazione
  assert.equal(r2bNome(h, '$item'), null);
  await scrivi(h, 'question', 'Che cosa custodivano le banche?', false);
  assert.equal(r2bNome(h, '$item'), null, 'nemmeno dopo una modifica');
});
test('0086-M2B-C21 D31: una modifica di soli spazi a un’alternativa non conta — la riga resta «Originale», il bottone del materiale «Approvato» (0086 g3c)', async () => {
  const report = { checkStatus: 'completed', issues: [{ id: 'nO', target: { kind: 'item', id: 'mc1', field: 'options' }, problem: 'Alternative da rivedere.' }] };
  const h = runtime({ report }); h.apri(); await vaiA(h, 'mc1');
  const a = entra(alternativa(h, 0)); a.value = 'Lo   Stato  '; a.oninput();
  assert.equal(r2bNome(h, 'options'), 'Originale');
  assert.equal(bottone(h).textContent, 'Approvato', '0086 g3c: il bottone del materiale, non un bottone della nota');
});

// ── nomi (E27, E13), non letti (G09), conflitto (A09), fuoco (D33, H16), Testo salvato (H05), criteri (F06/F07) ──
test('0086-M2B-A09 G2, nota in conflitto: la sua proposta resta letta nella nota anche mentre si scrive in un altro campo (si rifanno solo i nomi)', async () => {
  const h = conflittoSalvato(); h.apri();
  assert.equal(n6PropostaInNota(h, 'nA'), true);
  assert.equal(n6PropostaInNota(h, 'nC'), true);
  const el = entra(campo(h, 'explanation')); el.value = 'Furono proprio le banche.'; el.oninput();
  assert.equal(n6PropostaInNota(h, 'nA'), true);
  assert.equal(n6PropostaInNota(h, 'nC'), true);
});
test('0086-M2B-F06-F07 G2, la nota sui criteri sta nel campo «criteria», non in cima al materiale', async () => {
  const h = runtime({ report: M2B_RAPPORTO_OP1_CRITERI }); h.apri(); await vaiA(h, 'op1');
  assert.ok(q(h, '[data-veste-campo="criteria"] [data-veste-nota="nK"]'), 'dentro il campo dei criteri');
  assert.equal(q(h, '[data-veste-note-di="$item"] [data-veste-nota="nK"]'), null, 'non fra le note del materiale intero');
  assert.equal(q(h, '[data-veste-nota="nK"] .mrv-veste-nota-testo').textContent, 'Criteri vaghi.', 'senza il prefisso «campo ·» delle note senza riquadro');
});

test('0086-M2B-H12 G1 (0086 g3b), tre note aperte e un ritocco: «Testo salvato» si decide sullo stato DOPO il salvataggio — il bottone in fondo passa a «Tieni la tua versione», quindi la riga non c’è', async () => {
  // 0086, giro 3b (D37.1): il ritocco non chiude più note e niente va in fondo (Q20); il nome è quello del bottone in fondo
  const h = runtime1(); h.apri1(); await vaiA1(h, 'A');
  await cambiaG(h, 'a2', true);   // 0086 g3d (D43): con la spunta vuota di a2 il bottone direbbe sempre «Tieni la tua versione»
  assert.equal(bottone(h).textContent, 'Tieni Originale');
  await scrivi(h, 'desc', 'Il commercio con la Germania continuò.');
  assert.deepEqual(['a1', 'a2', 'a3'].map(i => esito1(h, i)), ['pending', 'pending', 'pending']);
  assert.equal(notaInFondo(h), null);
  assert.equal(bottone(h).textContent, 'Tieni la tua versione');
  assert.equal(salvata(h, 'desc'), '', '0086 g3d (D41): niente è salvato prima del bottone');
});

/* ═══ 0086, giro 3b (09/10): LA VESTE SULLE RIGHE DEI NODI DI G1 — la regola unica delle spunte (ADR 0012 rev. 12,
   ADR 0010 rev. 4; D36–D40). Ogni nota del controllo sulla descrizione ha una spunta al posto dei bottoni (piena; vuota
   sulla descrizione intera, D39); il campo parte dall'«Originale» e l'area «Proposta» della nota lo riempie con un clic;
   il salvataggio del campo non decide le note (D37.1); il bottone in fondo registra campo e spunte in una scrittura e una
   voce di ⌘Z, poi passa alla riga dopo; spento quando una spunta tolta svuoterebbe un nodo non riscritto in questa
   seduta (D38.1, D40). I collegamenti, G2, i conflitti salvati prima (D37.7) e «Escludi» della barra sono del giro 3c.
   La mappa della prova: N con quattro frasi (note che citano una frase, una proposta sull'ultima, una sul titolo), Q con
   una quasi-copia della terza frase di N, U con una frase sola e la sua nota, M e R senza note. ═══ */
const S3 = ['Il confine fu chiuso nel 1942.', 'Le banche custodivano oro tedesco.', 'Il commercio con la Germania continuò fino al 1944.', 'I profughi furono respinti alla frontiera.'];
const T3 = S3.join(' ');
const P3 = T3.replace(S3[3], 'I profughi furono accolti solo in parte.');
const Q3 = 'Il commercio con la Germania continuò fino al 1944. Le esportazioni crebbero.';
const DB3 = { nodes: [
  { id: 'R', label: 'Svizzera', desc: 'La Svizzera nella guerra.', level: 0, group: 0 },
  { id: 'N', label: 'Neutralità', desc: T3, level: 1, group: 1 },
  { id: 'Q', label: 'Commercio', desc: Q3, level: 1, group: 2 },
  { id: 'U', label: 'Unica', desc: 'La frontiera restò aperta ai mercanti.', level: 1, group: 3 },
  { id: 'M', label: 'Memoria', desc: 'Il resto è storia.', level: 1, group: 4 }],
  links: [{ source: 'R', target: 'N', rel: 'include' }, { source: 'R', target: 'Q', rel: 'include' }, { source: 'R', target: 'U', rel: 'include' }, { source: 'R', target: 'M', rel: 'include' }],
  sourcesDict: {} };
const SOURCES3 = [{ nome: 'Libro.pdf', pages: [{ n: 4, text: 'Il confine restò aperto. Le banche custodivano depositi. Il commercio crebbe.' }] }];
const cita3 = (id, frammento, nodo) => ({ id, target: { kind: 'node', id: nodo || 'N', field: 'desc' }, problem: 'La frase «' + frammento + '» non è nella fonte.' });
const nota3 = (id, nodo, problem, extra) => Object.assign({ id, target: { kind: 'node', id: nodo, field: 'desc' }, problem }, extra);
const titolo3 = (id, nodo, extra) => Object.assign({ id, target: { kind: 'node', id: nodo || 'N', field: 'label' }, problem: 'Il titolo è vago.' }, extra);
const NOTE3 = [cita3('s1', 'Il confine fu chiuso nel 1942'), cita3('s3', 'Il commercio con la Germania continuò'),
  nota3('p', 'N', 'Respingimenti solo in parte.', { after: P3 }), titolo3('tt', 'N', { after: 'Neutralità svizzera' }),
  cita3('u1', 'La frontiera restò aperta ai mercanti', 'U')];
const INTERA3 = () => nota3('n0', 'N', 'Il nodo semplifica troppo');
// una richiesta di «Aggiungi alla revisione» del Banco di prima (senza il « · » della veste)
const conRichiesta3 = (nodo = 'N') => r => Core.addIssue(r, { target: { kind: 'node', id: nodo, field: 'desc' }, origin: 'teacher', blocking: true, problem: 'Modifica del docente: ' + nodo });
function manifest3(issues, opts = {}) {
  const m = Pipeline.createManifest({}, { vaultPath: '/vault' }); m.steps.A.status = 'done';
  const db = opts.db || DB3;
  m.review = Core.createReview({ db, sources: SOURCES3, report: { contratto: 'mappai-giudice@2', stato: 'parziale', issues: clone(issues),
    copertura: { nodiEsaminati: db.nodes.map(n => n.id), nodiSaltati: [] } } });
  if (opts.prima) m.review = opts.prima(m.review);
  return m;
}
function runtime3(issues, opts = {}) {
  const h = runtime(Object.assign({ db: opts.db || DB3 }, opts, { manifest: opts.manifest || manifest3(issues, opts) }));
  h.window.MappAIRelations = require('../public/js/mappai-relations.js');
  h.window.MappAILinkEditorCore = require('../public/js/mappai-link-editor-core.js');
  h.rev = () => h.m.review; h.apri3 = () => h.apri({});
  return h;
}
const spunta3 = (h, id) => q(h, '[data-veste-spunta="' + id + '"]');
const etichetta3 = (h, id) => q(h, '[data-veste-spunta-etichetta="' + id + '"]');
const vista3 = (h, id) => { const e = etichetta3(h, id); return !!e && !e.hidden; };
const piena3 = (h, id) => !!spunta3(h, id).checked;
async function cambia3(h, id, valore) { const el = spunta3(h, id); el.checked = valore; el.onchange(); await tick(); }
const nomeSpunta3 = (h, id) => q(h, '[data-veste-spunta-etichetta="' + id + '"] [data-veste-spunta-nome]').textContent;
const costo3 = h => { const el = q(h, '#mrv-veste-costo'); return el && !el.hidden ? el.textContent : ''; };
const attesa3 = h => q(h, '#mrv-veste-attesa').textContent;
const nomeCampo3 = (h, f = 'desc') => { const el = q(h, '[data-veste-campo="' + f + '"] [data-veste-proposta-nome]'); return el && !el.hidden ? el.textContent : ''; };
const salvato3 = (h, f) => q(h, '[data-veste-campo="' + f + '"] [data-veste-salvato]').textContent;
const esito3 = (h, id) => Core.decisionOutcome(h.rev().initial.issues.find(i => i.id === id), h.rev().initial.decisions[id]);
const esiti3 = (h, ids) => ids.map(id => esito3(h, id));
const adesso3 = (h, id) => BancoCore.testoAdesso(null, h.rev(), { db: h.st.db, bersaglio: { kind: 'node', id, field: 'desc' } }).adesso;
const areaProposta3 = (h, id) => q(h, '[data-veste-nota="' + id + '"] [data-veste-nota-proposta]');
const bottoniNota3 = (h, id) => qa(h, '[data-veste-nota="' + id + '"] button').map(b => b.textContent);
async function premi3(h) { await bottone(h).click(); await tick(); await tick(); }
// ⌘Z / ⇧⌘Z col fuoco su body, come nel browser quando la scheda col fuoco si è ricostruita (il DOM finto tiene il fuoco vecchio)
async function z3(h, e) { fuoriDalModale(h, e); await tick(); await tick(); }
const pausa3 = () => new Promise(fatto => setTimeout(fatto, 420));

/* ── §4.2 la spunta nella nota gialla ── */
test('0086 g3b §4.2 la spunta sta su ogni nota del controllo della descrizione, anche con una nota sola, al posto dei bottoni; non sul titolo né sulla richiesta del docente; i nomi per tipo; niente gesti in fondo (cade Q20)', async () => {
  const h = runtime3(NOTE3.concat([cita3('d2', 'chiuso nel 1942. Le banche custodivano'), INTERA3()]), { prima: conRichiesta3() }); h.apri3();
  assert.equal(scheda(h), 'N');
  for (const id of ['s1', 's3', 'p', 'd2', 'n0']) assert.equal(vista3(h, id), true, id + ' ha la spunta');
  assert.equal(!!spunta3(h, 'tt'), false, 'niente spunta sul titolo (D37.4)');
  const rq = h.rev().initial.issues.find(i => i.origin === 'teacher');
  assert.equal(!!spunta3(h, rq.id), false, 'niente spunta sulla richiesta del docente');
  for (const id of ['s1', 's3', 'p', 'd2', 'n0', 'tt']) assert.deepEqual(bottoniNota3(h, id), [], id + ': nessun bottone nella nota');
  assert.equal(nomeSpunta3(h, 's1'), 'Tieni la frase');
  assert.equal(nomeSpunta3(h, 'p'), 'Tieni la frase', 'anche con una proposta');
  assert.equal(nomeSpunta3(h, 'd2'), 'Tieni le 2 frasi', 'un passo di due frasi (D12)');
  assert.equal(nomeSpunta3(h, 'n0'), 'Tieni tutto il testo', 'la descrizione intera');
  assert.equal(spunta3(h, 's1').getAttribute('type'), 'checkbox', 'una casella nativa');
  assert.deepEqual(bottoniNota3(h, rq.id), [], '0086 g3c, L6: la richiesta del docente mostra solo il suo testo (la chiude il bottone in fondo)');
  assert.equal(q(h, '#mrv-veste-risposta').hidden, true, 'nemmeno la richiesta, sola coi bottoni, va in fondo (Q20 cade sui nodi)');
  await vaiA1(h, 'U');
  assert.equal(vista3(h, 'u1'), true, 'una nota sola: la spunta c’è (cade B3)');
  assert.deepEqual(bottoniNota3(h, 'u1'), []);
  assert.equal(q(h, '#mrv-veste-risposta').hidden, true, 'i gesti della nota sola non vanno in fondo (cade Q20)');
  assert.equal(bottone(h).hidden, false, 'il bottone in fondo c’è anche con una nota sola');
  assert.equal(bottone(h).textContent, 'Tieni Originale');
});

test('0086 g3b §4.2 D39 la spunta parte piena, vuota sulla descrizione intera: il bottone in fondo è spento e la riga dice di mettere la spunta o di scrivere la descrizione; messa la spunta si accende e l’avviso dice «Confermi tutto il testo»', async () => {
  const h = runtime3(NOTE3.concat([INTERA3()])); h.apri3();
  assert.deepEqual(['s1', 's3', 'p'].map(id => piena3(h, id)), [true, true, true]);
  assert.equal(piena3(h, 'n0'), false, 'la descrizione intera parte vuota (D39)');
  assert.equal(bottone(h).hidden, false);
  assert.equal(bottone(h).disabled, true);
  assert.match(attesa3(h), /metti la spunta/);
  assert.match(attesa3(h), /«Neutralità»/);
  assert.equal(costo3(h), '', 'col bottone spento niente avviso');
  await cambia3(h, 'n0', true);
  assert.equal(bottone(h).disabled, false);
  assert.equal(attesa3(h), '');
  assert.equal(costo3(h), 'Confermi tutto il testo');
  assert.equal(h.calls.manifest, 0, 'la spunta non scrive');
});

test('0086 g3b §4.2 togliere e rimettere una spunta non scrive e non è una voce di ⌘Z; preventDefault al mousedown su casella ed etichetta, e la battitura in sospeso resta nel campo', async () => {
  const h = runtime3(NOTE3); h.apri3();
  let fermati = 0;
  const giu = () => ({ preventDefault() { fermati++; } });
  spunta3(h, 's1').onmousedown(giu()); etichetta3(h, 's1').onmousedown(giu());
  assert.equal(fermati, 2, 'il campo non perde il fuoco');
  const el = await scrivi(h, 'desc', T3 + ' Aggiunta.', false);
  await cambia3(h, 's1', false); await cambia3(h, 's1', true); await cambia3(h, 's1', false);
  assert.equal(h.calls.manifest, 0, 'la spunta non scrive');
  assert.equal(el.value, T3 + ' Aggiunta.', 'la battitura resta nel campo');
  assert.equal(piena3(h, 's1'), false);
  el.onblur(); await tick();
  // 0086 g3d (D41): l'uscita non salva (prima: una scrittura); ⌘Z scarta la bozza, e le spunte restano come sono
  assert.equal(h.calls.manifest, 0, 'l’uscita non scrive: il campo è una bozza');
  assert.equal(piena3(h, 's1'), false, 'la spunta resta tolta');
  await cambia3(h, 's3', false); await cambia3(h, 's3', true);
  assert.equal(h.calls.manifest, 0);
  await z3(h, CMD_Z);
  assert.equal(campo(h, 'desc').value, T3, '⌘Z scarta la bozza del campo, non le spunte');
  assert.equal(adesso3(h, 'N'), T3);
  assert.equal(piena3(h, 's1'), false, '⌘Z non tocca la spunta');
  assert.equal(esito3(h, 's1'), 'pending');
});

test('0086 g3b §4.2 D38.2 le spunte restano cambiando riga e tornando (la scheda ricostruita); chiuso e riaperto il Banco tornano come all’inizio, piene e vuote sulla descrizione intera', async () => {
  const h = runtime3(NOTE3.concat([INTERA3()])); h.apri3();
  await cambia3(h, 's1', false); await cambia3(h, 'n0', true);
  await vaiA1(h, 'U'); await vaiA1(h, 'N');
  assert.equal(piena3(h, 's1'), false);
  assert.equal(piena3(h, 'n0'), true);
  assert.equal(piena3(h, 's3'), true);
  const k = runtime3(null, { manifest: h.m }); k.apri3();
  assert.equal(piena3(k, 's1'), true, 'riaperto il Banco: piena');
  assert.equal(piena3(k, 'n0'), false, 'riaperto il Banco: vuota sulla descrizione intera');
});

test('0086 g3b §4.2 D37.3 le spunte legate: due note sullo stesso passo si tolgono e si rimettono insieme; le altre non si muovono', async () => {
  const h = runtime3(NOTE3.concat([cita3('s2', 'Le banche custodivano oro tedesco'), nota3('s2b', 'N', '«Le banche custodivano oro tedesco»: la fonte non lo dice.')])); h.apri3();
  await cambia3(h, 's2', false);
  assert.equal(piena3(h, 's2b'), false, 'tolte insieme');
  assert.equal(piena3(h, 's1'), true);
  await cambia3(h, 's2b', true);
  assert.equal(piena3(h, 's2'), true, 'rimesse insieme');
  assert.equal(h.calls.manifest, 0);
});

/* ── §4.3 il campo e l'area «Proposta» ── */
test('0086 g3b §4.3 il campo parte dall’«Originale» anche con una proposta aperta; il clic (o Invio) sull’area «Proposta» della nota la copia nel campo; il nome del campo «Originale» / «Proposta» / «Tua versione» segue il testo mentre si scrive, gli spazi non contano', async () => {
  const h = runtime3(NOTE3); h.apri3();
  assert.equal(campo(h, 'desc').value, T3, 'la proposta di p non è scritta nel campo');
  assert.equal(nomeCampo3(h), 'Originale');
  const area = areaProposta3(h, 'p');
  assert.equal(area.hidden, false);
  assert.equal(area.getAttribute('role'), 'button');
  assert.equal(area.getAttribute('tabindex'), '0');
  assert.match(area.textContent, /I profughi furono accolti solo in parte\./);
  area.onclick(); await tick();
  assert.equal(campo(h, 'desc').value, P3, 'il clic copia la proposta nel campo');
  assert.equal(nomeCampo3(h), 'Proposta');
  assert.equal(bottone(h).textContent, 'Usa Proposta');
  assert.equal(h.calls.manifest, 0, 'copiare non scrive');
  const el = campo(h, 'desc');
  el.value = P3 + '  '; el.oninput();
  assert.equal(nomeCampo3(h), 'Proposta', 'soli spazi: come prima');
  el.value = P3 + ' Ritocco.'; el.oninput();
  assert.equal(nomeCampo3(h), 'Tua versione', 'mentre si scrive');
  assert.equal(bottone(h).textContent, 'Tieni la tua versione');
  el.value = T3 + ' '; el.oninput();
  assert.equal(nomeCampo3(h), 'Originale');
  assert.equal(bottone(h).textContent, 'Tieni Originale');
  let fermato = false;
  area.onkeydown({ key: 'Enter', preventDefault() { fermato = true; } });
  assert.equal(campo(h, 'desc').value, P3, 'Invio sull’area la copia');
  assert.equal(fermato, true);
  campo(h, 'desc').onblur(); await tick();
  assert.equal(h.calls.manifest, 0, '0086 g3d (D41): nemmeno all’uscita (prima: una scrittura)');
  assert.equal(esito3(h, 'p'), 'pending', 'il salvataggio non decide la nota');
  assert.equal(nomeCampo3(h), 'Proposta');
});

test('0086 g3b §4.3 D37.1 (g3d, D41): l’uscita dal campo non scrive e non chiude niente — né le note del controllo né la richiesta del docente; il bottone registra il ritocco, le note e la richiesta (L6) in una scrittura; tornato all’Originale prima del bottone non resta niente', async () => {
  const h = runtime3(NOTE3, { prima: conRichiesta3() }); h.apri3();
  const rq = h.rev().initial.issues.find(i => i.origin === 'teacher');
  await scrivi(h, 'desc', T3.replace('fino al 1944', 'fino al 1945'));
  // 0086 g3d (D41): prima una scrittura all'uscita, la richiesta del docente chiusa e il ritocco tenuto fuori dalla quarantena
  assert.equal(h.calls.manifest, 0);
  assert.deepEqual(esiti3(h, ['s1', 's3', 'p', 'tt']), ['pending', 'pending', 'pending', 'pending'], 'restano aperte fino al bottone');
  assert.equal(esito3(h, rq.id), 'pending', 'anche la richiesta del docente, fino al bottone');
  assert.equal(adesso3(h, 'N'), T3, 'la revisione non cambia');
  assert.equal(!!q(h, '[data-veste-chiuse]'), false, 'la scheda non dice che una correzione chiude note');
  assert.equal(rigaG1(h, 'N').getAttribute('data-stato'), 'da-rivedere');
  await premi3(h);
  assert.equal(h.calls.manifest, 1, 'una scrittura');
  assert.equal(adesso3(h, 'N'), T3.replace('fino al 1944', 'fino al 1945'));
  assert.deepEqual(esiti3(h, ['s1', 's3', 'p', 'tt']), ['kept', 'kept', 'kept', 'kept']);
  assert.equal(esito3(h, rq.id), 'edited', 'L6: il bottone chiude la richiesta col testo che resta');
  const k = runtime3(NOTE3, { prima: conRichiesta3() }); k.apri3();
  await scrivi(k, 'desc', T3.replace('fino al 1944', 'fino al 1945'));
  await scrivi(k, 'desc', T3);
  await vaiA1(k, 'U'); await vaiA1(k, 'N');
  assert.equal(campo(k, 'desc').value, T3, 'tornato all’Originale: nessuna bozza');
  assert.equal(k.calls.manifest, 0);
});

/* ── §4.4 il bottone in fondo, §4.5 le uscite, §4.7 ⌘Z ── */
test('0086 g3b §4.4 il bottone in fondo: una scrittura e una voce di ⌘Z; le note con la spunta piena «Testo mantenuto senza modifiche»; poi la riga dopo (D19); ⌘Z riapre tutte le note, ⇧⌘Z rifà', async () => {
  const h = runtime3(NOTE3); h.apri3();
  assert.equal(bottone(h).textContent, 'Tieni Originale');
  assert.equal(costo3(h), 'Confermi 3 frasi contestate');
  await premi3(h);
  assert.equal(h.calls.manifest, 1, 'una scrittura');
  assert.deepEqual(esiti3(h, ['s1', 's3', 'p', 'tt']), ['kept', 'kept', 'kept', 'kept']);
  assert.equal(adesso3(h, 'N'), T3);
  assert.equal(scheda(h), 'U', 'la riga dopo (D19)');
  assert.equal(rigaG1(h, 'N').getAttribute('data-stato'), 'fatto');
  await z3(h, CMD_Z);
  assert.deepEqual(esiti3(h, ['s1', 's3', 'p', 'tt']), ['pending', 'pending', 'pending', 'pending'], 'una voce sola: ⌘Z riapre tutte le note');
  assert.equal(scheda(h), 'N');
  assert.match(q(h, '#mrv-status').textContent, /Annullato: «Tieni Originale» su Neutralità/);
  await z3(h, CMD_SHIFT_Z);
  assert.deepEqual(esiti3(h, ['s1', 's3', 'p', 'tt']), ['kept', 'kept', 'kept', 'kept'], '⇧⌘Z rifà');
  assert.equal(q(h, '[data-veste-nota="s1"] [data-veste-esito]').textContent, 'Testo mantenuto senza modifiche');
  assert.equal(vista3(h, 's1'), false, 'la nota decisa resta una riga con l’esito, senza spunta');
});

test('0086 g3b §4.4 «Usa Proposta»: accept («Proposta scelta») sulla nota della proposta copiata, reject sulle altre; «Tieni la tua versione»: «Tenuta la tua versione» (D28)', async () => {
  const h = runtime3(NOTE3); h.apri3();
  areaProposta3(h, 'p').onclick();
  assert.equal(bottone(h).textContent, 'Usa Proposta');
  await premi3(h);
  assert.equal(h.calls.manifest, 1, '0086 g3d (D41): la proposta copiata e il bottone in una scrittura (prima due, R6)');
  assert.deepEqual(esiti3(h, ['s1', 's3', 'p', 'tt']), ['kept', 'kept', 'applied', 'kept']);
  assert.equal(adesso3(h, 'N'), P3);
  await vaiA1(h, 'N');
  assert.equal(q(h, '[data-veste-nota="p"] [data-veste-esito]').textContent, 'Proposta scelta');
  const k = runtime3(NOTE3); k.apri3();
  await scrivi(k, 'desc', T3 + ' Aggiunta del docente.');
  assert.equal(bottone(k).textContent, 'Tieni la tua versione');
  await premi3(k);
  assert.deepEqual(esiti3(k, ['s1', 's3', 'p']), ['kept', 'kept', 'kept']);
  assert.equal(adesso3(k, 'N'), T3 + ' Aggiunta del docente.');
  await vaiA1(k, 'N');
  assert.equal(q(k, '[data-veste-nota="s1"] [data-veste-esito]').textContent, 'Tenuta la tua versione');
});

test('0086 g3b §4.5 la spunta tolta: al bottone la frase esce dal nodo e dalla quasi-copia in un altro nodo, in una scrittura; ⌘Z rimette i testi di tutti i nodi e la spunta resta com’era al clic; ⇧⌘Z rifà', async () => {
  const h = runtime3(NOTE3); h.apri3();
  await cambia3(h, 's3', false);
  assert.equal(costo3(h), 'Confermi 2 frasi contestate');
  await premi3(h);
  assert.equal(h.calls.manifest, 1, 'una scrittura per tutti i nodi');
  assert.equal(adesso3(h, 'N'), [S3[0], S3[1], S3[3]].join(' '));
  assert.equal(adesso3(h, 'Q'), 'Le esportazioni crebbero.', 'la quasi-copia esce anche dall’altro nodo');
  assert.deepEqual(esiti3(h, ['s1', 's3', 'p', 'tt']), ['kept', 'edited', 'kept', 'kept']);
  await z3(h, CMD_Z);
  assert.equal(adesso3(h, 'N'), T3);
  assert.equal(adesso3(h, 'Q'), Q3, '⌘Z rimette anche l’altro nodo');
  assert.deepEqual(esiti3(h, ['s1', 's3', 'p', 'tt']), ['pending', 'pending', 'pending', 'pending']);
  assert.equal(piena3(h, 's3'), false, 'la spunta resta tolta');
  assert.equal(piena3(h, 's1'), true);
  await z3(h, CMD_SHIFT_Z);
  assert.equal(adesso3(h, 'Q'), 'Le esportazioni crebbero.');
});

test('0086 g3b §4.4 D38.1 una spunta tolta che svuoterebbe il nodo spegne il bottone e la riga dice quale descrizione scrivere; riscritta nel campo, dopo la pausa si accende; premuto, resta il testo scritto e la nota si chiude «Testo modificato da te»; la quasi-copia che è l’unica frase di un altro nodo dice quale', async () => {
  const h = runtime3(NOTE3); h.apri3(); await vaiA1(h, 'U');
  await cambia3(h, 'u1', false);
  assert.equal(bottone(h).disabled, true);
  assert.match(attesa3(h), /Con la spunta tolta sulla nota «La frase «La frontiera restò aperta ai mercanti» non è nella fonte\.» esce tutta la descrizione di «Unica»: rimetti la spunta, o scrivi nel campo la descrizione che vuoi tenere/);
  const el = entra(campo(h, 'desc')); el.value = 'La frontiera fu sorvegliata.'; el.oninput();
  assert.equal(bottone(h).disabled, true, 'mentre il ricalcolo aspetta la pausa resta lo stato di prima (D23)');
  await pausa3();
  assert.equal(bottone(h).disabled, false, 'riscritta in questa seduta: si accende');
  await premi3(h);
  assert.equal(h.calls.manifest, 1, '0086 g3d (D41): la battitura e il bottone in una scrittura (prima due, R6)');
  assert.equal(adesso3(h, 'U'), 'La frontiera fu sorvegliata.');
  assert.equal(esito3(h, 'u1'), 'edited');
  const DBV = clone(DB3); DBV.nodes.push({ id: 'V', label: 'Scambi', desc: S3[2], level: 2, group: 2 }); DBV.links.push({ source: 'N', target: 'V', rel: 'include' });
  const k = runtime3(NOTE3, { db: DBV }); k.apri3();
  await cambia3(k, 's3', false);
  assert.equal(bottone(k).disabled, true);
  assert.match(attesa3(k), /«Scambi»/, 'la riga dice quale nodo resterebbe vuoto');
  await cambia3(k, 's3', true);
  assert.equal(bottone(k).disabled, false);
});

test('0086 g3b §4.4 D40 una riscrittura salvata prima dell’apertura del Banco non accende il bottone; riscritta in questa seduta sì', async () => {
  const PRIMA = 'La frontiera fu sorvegliata dai soldati.';
  const h = runtime3(NOTE3, { prima: r => {
    const a = Core.addIssue(r, { target: { kind: 'node', id: 'U', field: 'desc' }, origin: 'teacher', blocking: true, problem: 'Modifica del docente: Descrizione · Unica' });
    return Core.setDecision(a, a.initial.issues.find(i => i.origin === 'teacher').id, 'manual', { text: PRIMA });
  } });
  h.apri3(); await vaiA1(h, 'U');
  assert.equal(campo(h, 'desc').value, PRIMA);
  assert.equal(esito3(h, 'u1'), 'pending');
  await cambia3(h, 'u1', false);
  assert.equal(bottone(h).disabled, true, 'la riscrittura di una seduta di prima non basta');
  assert.match(attesa3(h), /«Unica»/);
  await scrivi(h, 'desc', 'La frontiera restò chiusa ai profughi.');
  assert.equal(bottone(h).disabled, false, 'riscritta in questa seduta: si accende');
});

test('0086 g3b §4.4 R6 (g3d, D41): la battitura in sospeso al clic entra nella stessa scrittura e nella stessa voce di ⌘Z del bottone — col mouse (preventDefault al mousedown, niente blur) e da tastiera (blur verso il bottone, poi Invio); respinta, il bottone non scrive e la riga lo dice', async () => {
  const h = runtime3(NOTE3); h.apri3();
  let fermato = false; bottone(h).onmousedown({ preventDefault() { fermato = true; } });
  assert.equal(fermato, true, 'il bottone in fondo non toglie il fuoco al campo');
  await scrivi(h, 'desc', T3 + ' Aggiunta.', false);
  await premi3(h);
  // 0086 g3d (D41): prima due scritture e due voci di ⌘Z (la battitura salvata prima, R6)
  assert.equal(h.calls.manifest, 1, 'la battitura e il bottone: una scrittura');
  assert.equal(adesso3(h, 'N'), T3 + ' Aggiunta.');
  assert.deepEqual(esiti3(h, ['s1', 's3', 'p', 'tt']), ['kept', 'kept', 'kept', 'kept']);
  await z3(h, CMD_Z);
  assert.deepEqual(esiti3(h, ['s1', 's3', 'p', 'tt']), ['pending', 'pending', 'pending', 'pending'], 'un ⌘Z toglie il bottone');
  assert.equal(adesso3(h, 'N'), T3, 'e la battitura con lui: una voce sola');
  const k = runtime3(NOTE3); k.apri3();
  const el = await scrivi(k, 'desc', T3 + ' Aggiunta.', false);
  el.onblur({ relatedTarget: bottone(k) }); await tick();
  assert.equal(k.calls.manifest, 0, 'l’uscita dal campo verso il bottone non salva');
  await premi3(k);
  assert.equal(k.calls.manifest, 1);
  assert.equal(adesso3(k, 'N'), T3 + ' Aggiunta.');
  assert.deepEqual(esiti3(k, ['s1', 's3', 'p', 'tt']), ['kept', 'kept', 'kept', 'kept']);
  const g = runtime3(NOTE3); g.apri3();
  await scrivi(g, 'desc', '', false);
  await premi3(g);
  assert.equal(g.calls.manifest, 0, 'la battitura respinta: nessuna scrittura');
  assert.deepEqual(esiti3(g, ['s1', 's3', 'p', 'tt']), ['pending', 'pending', 'pending', 'pending']);
  assert.match(q(g, '#mrv-status').textContent, /«Tieni la tua versione» non ha scritto niente/);
  assert.equal(scheda(g), 'N');
});

test('0086 g3b §4.4 doppio clic e tasto tenuto non ripetono il bottone in fondo; due clic di fila fanno un gesto solo', async () => {
  const h = runtime3(NOTE3); h.apri3();
  assert.equal(bottone(h).hidden, false);
  await bottone(h).onclick({ detail: 2 }); await tick();
  assert.equal(h.calls.manifest, 0, 'il secondo clic di un doppio clic non conta');
  let fermato = false;
  bottone(h).onkeydown({ key: 'Enter', repeat: true, preventDefault() { fermato = true; } });
  assert.equal(fermato, true, 'Invio tenuto non ripete');
  const uno = bottone(h).click(), due = bottone(h).click();
  await uno; await due; await tick(); await tick();
  assert.equal(h.calls.manifest, 1, 'un gesto solo');
  assert.deepEqual(esiti3(h, ['s1', 's3', 'p', 'tt']), ['kept', 'kept', 'kept', 'kept']);
});

test('0086 g3b §4.5 un punto che non si ritrova (la frase fusa con un’altra nel campo) spegne il bottone e la riga lo dice; rimessa la spunta si riaccende', async () => {
  const h = runtime3(NOTE3); h.apri3();
  await scrivi(h, 'desc', 'Il confine e le banche restarono aperti. ' + S3[2] + ' ' + S3[3]);
  assert.equal(bottone(h).disabled, false);
  await cambia3(h, 's1', false);
  assert.equal(bottone(h).disabled, true);
  assert.match(attesa3(h), /Non ritrovo nel campo la frase della nota «La frase «Il confine fu chiuso nel 1942» non è nella fonte\.», che la spunta tolta farebbe uscire: rimetti la spunta e, se la frase non deve entrare, toglila tu dal campo/);
  await cambia3(h, 's1', true);
  assert.equal(bottone(h).disabled, false);
  assert.equal(attesa3(h), '');
});

test('0086 g3b §4.4 D37.4 il titolo: niente spunta; la sua proposta si copia nel campo dall’area della nota e il bottone la chiude («Proposta scelta»); una riga con la sola nota sul titolo ha il bottone, senza avviso', async () => {
  const h = runtime3(NOTE3); h.apri3();
  assert.equal(!!spunta3(h, 'tt'), false);
  areaProposta3(h, 'tt').onclick();
  assert.equal(campo(h, 'label').value, 'Neutralità svizzera');
  assert.equal(nomeCampo3(h, 'label'), 'Proposta');
  assert.equal(bottone(h).textContent, 'Usa Proposta');
  await premi3(h);
  assert.equal(esito3(h, 'tt'), 'applied');
  assert.deepEqual(esiti3(h, ['s1', 's3', 'p']), ['kept', 'kept', 'kept']);
  const k = runtime3([titolo3('mt', 'M')]); k.apri3();
  assert.equal(scheda(k), 'M');
  assert.equal(bottone(k).hidden, false);
  assert.equal(bottone(k).textContent, 'Tieni Originale');
  assert.equal(costo3(k), '', 'sul titolo niente avviso');
  await premi3(k);
  assert.equal(esito3(k, 'mt'), 'kept');
});

/* ── §4.6 l'avviso ── */
test('0086 g3b §4.6 l’avviso accanto al bottone: singolare, plurale, due note sulla stessa frase = 1, un passo di due frasi = 2, con le note con proposta, «Confermi tutto il testo»; assente sul titolo, sul collegamento e in G2', async () => {
  const h = runtime3(NOTE3.concat([cita3('s2', 'Le banche custodivano oro tedesco'), nota3('s2b', 'N', '«Le banche custodivano oro tedesco»: la fonte non lo dice.')])); h.apri3();
  assert.equal(costo3(h), 'Confermi 4 frasi contestate', 's1, s2 (con s2b), s3, p: quattro frasi distinte');
  for (const id of ['s3', 'p', 's2']) await cambia3(h, id, false);
  assert.equal(costo3(h), 'Confermi 1 frase contestata');
  await cambia3(h, 's1', false); await cambia3(h, 's2', true);
  assert.equal(costo3(h), 'Confermi 1 frase contestata', 'due note sulla stessa frase contano una');
  await cambia3(h, 's2', false); await cambia3(h, 'p', true);
  assert.equal(costo3(h), 'Confermi 1 frase contestata', 'anche una nota con una proposta non copiata');
  const d = runtime3([cita3('d2', 'chiuso nel 1942. Le banche custodivano'), cita3('s3', 'Il commercio con la Germania continuò')]); d.apri3();
  await cambia3(d, 's3', false);
  assert.equal(costo3(d), 'Confermi 2 frasi contestate', 'un passo di due frasi conta due');
  const n = runtime3(NOTE3.concat([INTERA3()])); n.apri3();
  await cambia3(n, 'n0', true);
  assert.equal(costo3(n), 'Confermi tutto il testo');
  const l = runtime1(); l.apri1(); await vaiA1(l, LINK_AB);
  assert.equal(costo3(l), '', 'sul collegamento niente avviso');
  const g = runtime(); g.apri();
  assert.equal(costo3(g), '', 'in G2 niente avviso');
});

/* ── §4.9 «Testo salvato» ── */
test('0086 g3b §4.9 (g3d, D41) «Testo salvato» in G1 non c’è sulle schede con note del controllo: né sotto la descrizione, né sotto il titolo senza note, né con la proposta copiata — niente è salvato prima del bottone', async () => {
  const h = runtime3(NOTE3.filter(i => i.id !== 'tt')); h.apri3();
  await scrivi(h, 'desc', T3 + ' Aggiunta.');
  assert.equal(bottone(h).textContent, 'Tieni la tua versione');
  assert.equal(salvato3(h, 'desc'), '');
  await scrivi(h, 'label', 'Neutralità armata');
  assert.equal(salvato3(h, 'label'), '', 'prima il titolo senza note si salvava e la riga c’era');
  areaProposta3(h, 'p').onclick(); campo(h, 'desc').onblur(); await tick();
  assert.equal(bottone(h).textContent, 'Usa Proposta');
  assert.equal(salvato3(h, 'desc'), '');
  assert.equal(h.calls.manifest, 0);
});

/* ── il foglio di stile e le chiavi ── */
test('0086 g3b CSS: la spunta, l’area «Proposta» che si copia e l’avviso stanno sotto la veste, coi colori dai token (--mm-* e le variabili della veste) e contrasto ≥ 4,5:1; nessuna icona nuova', () => {
  const css = fs.readFileSync(require.resolve('../public/css/mappai-review-dashboard.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const lum = x => { const v = [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const contrasto = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const variabile = nome => { const m = css.match(new RegExp(nome + ':\\s*(#[0-9a-fA-F]{6})')); return m ? m[1] : null; };
  const colore = v => { const m = /var\((--[a-z0-9-]+)(?:,\s*(#[0-9a-fA-F]{6}))?\)/.exec(v); return m ? (variabile(m[1]) || m[2]) : v; };
  const regole = cls => css.match(new RegExp('[^{}]*\\.' + cls + '[^{}]*\\{[^}]*\\}', 'g')) || [];
  for (const cls of ['mrv-veste-spunta', 'mrv-veste-copia', 'mrv-veste-costo']) {
    const r = regole(cls);
    assert.ok(r.length >= 1, cls + ': una regola');
    for (const x of r) for (const s of x.slice(0, x.indexOf('{')).split(',')) assert.match(s.trim(), /^#mappai-teacher-review\.mrv-veste /, cls + ' solo sotto la veste: ' + s.trim());
    // un esadecimale vale solo come ripiego dentro var(--token, #…)
    assert.equal(/(?:color|background|border|outline)[a-z-]*:[^;}]*#[0-9a-fA-F]{3}/.test(r.join('').replace(/var\([^)]*\)/g, 'VAR')), false, cls + ': i colori dai token');
  }
  const testoDi = cls => { const m = regole(cls).join('').match(/(?:^|[;{\s])color:\s*([^;}]+)/); return m ? colore(m[1].trim()) : null; };
  assert.ok(contrasto(testoDi('mrv-veste-spunta'), variabile('--mrv-veste-nota-fondo')) >= 4.5, 'la spunta sul giallo della nota');
  assert.ok(contrasto(testoDi('mrv-veste-costo'), '#ffffff') >= 4.5, 'l’avviso sul bianco della barra');
  assert.ok(contrasto(testoDi('mrv-veste-copia'), '#ffffff') >= 4.5, 'l’area «Proposta» sul bianco');
  const src = fs.readFileSync(require.resolve('../public/js/mappai-banco-veste.js'), 'utf8');
  assert.deepEqual((src.match(/const SVG_[A-Z_]+/g) || []).sort(), ['const SVG_ESCLUSO', 'const SVG_SPUNTA', 'const SVG_TOGLI'], 'nessuna icona nuova: la spunta è una casella nativa');
});

test('0086 g3b le chiavi nuove della veste stanno in en_translations.js, nel blocco dello 0086, col ripiego italiano nel t(); nessuna in it_translations.js', () => {
  const src = fs.readFileSync(require.resolve('../public/js/mappai-banco-veste.js'), 'utf8');
  const en = fs.readFileSync(require.resolve('../public/traduzioni/en_translations.js'), 'utf8');
  const it = fs.readFileSync(require.resolve('../public/traduzioni/it_translations.js'), 'utf8');
  const chiavi = ['rv_veste_tieni_frase', 'rv_veste_tieni_frasi', 'rv_veste_tieni_tutto', 'rv_veste_copia_proposta', 'rv_veste_confermi_una', 'rv_veste_confermi_frasi',
    'rv_veste_confermi_tutto', 'rv_veste_fondo_intera', 'rv_veste_fondo_svuota', 'rv_veste_fondo_quasi_copia', 'rv_veste_fondo_non_ritrovato', 'rv_veste_fondo_niente'];
  const blocco = en.indexOf('// packet 0086 (D25-D29)'), fine = en.indexOf('sdoc_oltre_tetto');
  for (const k of chiavi) {
    assert.ok(new RegExp("t\\('" + k + "', '[^']+'").test(src), k + ': t() col ripiego italiano');
    const riga = en.indexOf('    ' + k + ':');
    assert.ok(riga > blocco && riga < fine, k + ' nel blocco dello 0086');
    assert.equal(it.includes(k), false, k + ' non in it_translations.js');
  }
});

/* ═══ 0086, giro 3c (ADR 0012 rev. 12, ADR 0010 rev. 4; D36–D40, letture L3 e L6): l'ultimo pezzo della veste ═══
   La regola unica delle spunte sulle righe dei collegamenti («Tieni il collegamento»), sui materiali di G2 («Tieni il
   materiale», il bottone del materiale che registra campi, spunte e visto), sulle righe con scelte salvate prima in conflitto
   (D37.7, L3) e la richiesta del docente senza bottoni sulla scheda delle spunte (L6); le righe che dicono che cosa premere
   o scrivere quando il bottone in fondo è spento. «Togli questa scelta» e i rami del conflitto (D30–D35) non ci sono più. */
const L2_3C = { id: 'l2', target: { kind: 'link', source: 'A', target: 'B', rel: 'causa', field: 'rel' }, after: 'determina', problem: 'Il verbo non è quello della fonte.' };
const runtimeLink3c = (opts = {}) => { const h = runtime1(Object.assign({ report: rapportoG1({ issues: rapportoG1().issues.concat([clone(L2_3C)]) }) }, opts)); h.apri1(); return h; };
// G1 / G2: un conflitto salvato in una seduta di prima (la pila di ⌘Z vuota)
function conflittoA3c(extra) {
  const rep = rapportoG1(); rep.issues.push({ id: 'a4', target: { kind: 'node', id: 'A', field: 'desc' }, after: 'Il governo svizzero fu accusato di aver accettato oro. Le banche custodivano i depositi.', problem: 'Fu il governo.' });
  const m = g1Manifest(rep);
  m.review = Core.setDecision(Core.setDecision(m.review, 'a1', 'accept'), 'a4', 'accept');
  if (extra) m.review = extra(m.review);
  const h = runtime1({ manifest: m }); h.apri1(); return h;
}
// G1: le parole scritte dal docente e «Togli il collegamento» salvati in una seduta di prima, che si contraddicono
function conflittoLinkPrima() {
  const m = quasiTutto(g1Manifest());
  let r = Core.addIssue(m.review, { target: { kind: 'link', source: 'A', target: 'B', rel: 'causa', field: 'rel' }, origin: 'teacher', blocking: true, problem: 'Parole del collegamento modificate dal docente.' });
  const t = r.initial.issues[r.initial.issues.length - 1].id;
  m.review = Core.setDecision(Core.setDecision(r, t, 'manual', { text: 'genera' }), 'l1', 'accept');
  return { h: runtime1({ manifest: m }), t };
}
function conflittoFc3c(rep) {
  const report = rep || { checkStatus: 'completed', issues: [] }, m = finalManifest(ITEMS, report), fc1 = ITEMS.find(i => i.id === 'fc1');
  let r = m.review.final.review;
  r = Core.addIssue(r, { target: { kind: 'item', id: 'fc1', field: 'answer' }, origin: 'teacher', blocking: true, problem: 'Modifica del docente: Risposta' });
  const a = r.initial.issues[r.initial.issues.length - 1].id;
  r = Core.setDecision(r, a, 'manual', { text: 'Non partecipare alla guerra.' });
  r = Core.addIssue(r, { target: { kind: 'item', id: 'fc1', field: '$item' }, origin: 'teacher', blocking: true, problem: 'Modifica del docente: materiale' });
  const b = r.initial.issues[r.initial.issues.length - 1].id;
  r = Core.setDecision(r, b, 'manual', { text: Object.assign({}, fc1, { question: 'La neutralità?' }) });
  m.review.final.review = r;
  const h = runtime({ manifest: m, report }); h.apri();
  return { h, a, b };
}

/* ── punto 1: il collegamento ── */
test('0086 g3c §4.2 il collegamento: «Tieni il collegamento» su ogni nota (quella che propone di toglierlo e quella delle parole), niente bottoni nelle note; il bottone in fondo coi nomi della regola unica sul campo delle parole, senza avviso; premuto, le note restano col collegamento e si passa oltre', async () => {
  const h = runtimeLink3c(); await vaiA1(h, LINK_AB);
  for (const id of ['l1', 'l2']) {
    assert.equal(vistaG(h, id), true, id + ' ha la spunta');
    assert.equal(nomeSpuntaG(h, id), 'Tieni il collegamento');
    assert.equal(spuntaG(h, id).checked, true, 'piena');
    assert.deepEqual(bottoniNotaG(h, id), [], id + ': nessun bottone nella nota');
  }
  assert.equal(nomiInVista(h).some(n => /Togli il collegamento|Tieni le parole/.test(n)), false, 'via «Togli il collegamento» e «Tieni le parole»');
  assert.equal(areaG(h, 'l1'), null, 'la nota che propone di togliere il collegamento non ha una proposta da copiare');
  assert.equal(bottone(h).hidden, false);
  assert.equal(bottone(h).textContent, 'Tieni Originale');
  assert.equal(costoG(h), '', 'sul collegamento niente avviso');
  const w = h.calls.manifest;
  await premiG(h);
  assert.equal(h.calls.manifest - w, 1, 'una scrittura');
  assert.deepEqual(['l1', 'l2'].map(id => esito1(h, id)), ['kept', 'kept']);
  assert.notEqual(scheda(h), LINK_AB, 'la riga dopo (D19)');
  await vaiA1(h, LINK_AB);
  assert.equal(esitoG(h, 'l1'), 'Collegamento tenuto');
});

test('0086 g3c §4.3 le parole proposte si copiano con un clic sull’area «Proposta» della nota: il bottone dice «Usa Proposta» e la nota è «Proposta scelta»; le parole scritte nel campo si salvano senza chiudere le note e il bottone dice «Tieni la tua versione»', async () => {
  const h = runtimeLink3c(); await vaiA1(h, LINK_AB);
  const area = areaG(h, 'l2');
  assert.equal(area.hidden, false);
  assert.equal(area.getAttribute('role'), 'button');
  area.onclick(); await tick();
  assert.equal(campo(h, 'rel').value, 'determina');
  assert.equal(bottone(h).textContent, 'Usa Proposta');
  assert.equal(h.calls.manifest, 0, 'copiare non scrive');
  await premiG(h);
  assert.equal(esito1(h, 'l2'), 'applied');
  assert.equal(esito1(h, 'l1'), 'kept');
  assert.equal(BancoCore.testoAdesso(null, h.rev(), { db: DB1, bersaglio: { kind: 'link', source: 'A', target: 'B', rel: 'causa', field: 'rel' } }).adesso, 'determina');
  const k = runtimeLink3c(); await vaiA1(k, LINK_AB);
  await scrivi(k, 'rel', 'provoca');
  assert.deepEqual(['l1', 'l2'].map(id => esito1(k, id)), ['pending', 'pending'], 'il salvataggio delle parole non chiude le note (D37.1)');
  assert.equal(bottone(k).textContent, 'Tieni la tua versione');
  await premiG(k);
  assert.deepEqual(['l1', 'l2'].map(id => esito1(k, id)), ['kept', 'kept']);
  assert.equal(BancoCore.testoAdesso(null, k.rev(), { db: DB1, bersaglio: { kind: 'link', source: 'A', target: 'B', rel: 'causa', field: 'rel' } }).adesso, 'provoca');
});

test('0086 g3c §4.5 la spunta tolta sul collegamento: la riga accanto al bottone dice che il collegamento esce; premuto, il collegamento è tolto e la correzione delle parole non vale più, senza conflitto; ⌘Z rimette tutto; la spunta non scrive', async () => {
  const h = runtimeLink3c(); await vaiA1(h, LINK_AB);
  await scrivi(h, 'rel', 'provoca');   // 0086 g3d (D41): le parole sono una bozza fino al bottone
  const w = h.calls.manifest;
  await cambiaG(h, 'l2', false);
  assert.equal(h.calls.manifest, w, 'la spunta non scrive');
  assert.equal(spuntaG(h, 'l1').checked, true, 'le spunte del collegamento non sono legate');
  assert.equal(bottone(h).disabled, false);
  assert.equal(attesaG(h), 'Esce il collegamento «Accuse → Banche»: le parole nel campo non contano più.', '0086 g3d (D43)');
  assert.equal(bottone(h).textContent, 'Tieni la tua versione', '0086 g3d (D43): con una spunta tolta');
  await premiG(h);
  assert.equal(h.calls.manifest - w, 1, 'una scrittura');
  const LR = { kind: 'link', source: 'A', target: 'B', rel: 'causa', field: 'rel' };
  const s = BancoCore.testoAdesso(null, h.rev(), { db: DB1, bersaglio: LR });
  assert.equal(s.ok, true, 'nessun conflitto');
  assert.equal(s.escluso, true, 'il collegamento è tolto');
  assert.equal(docenti1(h).some(i => i.target.field === 'rel'), false, 'la correzione delle parole non c’è più');
  await z3(h, CMD_Z);
  // 0086 g3d (D41): le parole erano una bozza registrata col bottone, nella stessa voce: ⌘Z rimette il collegamento con le parole di prima
  assert.equal(BancoCore.testoAdesso(null, h.rev(), { db: DB1, bersaglio: LR }).adesso, 'causa', '⌘Z rimette il collegamento');
  assert.deepEqual(['l1', 'l2'].map(id => esito1(h, id)), ['pending', 'pending']);
});

/* ── punto 2: G2 ── */
test('0086 g3c §4.2 G2: «Tieni il materiale» su ogni nota del controllo (campi ed esclusione), niente bottoni nelle note né in fondo; il bottone del materiale non è spento per una nota aperta, senza avviso; premuto, la nota è «tenuta», il materiale ha il visto e si passa oltre', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc2');
  assert.equal(vistaG(h, 'n-mc2-e'), true);
  assert.equal(nomeSpuntaG(h, 'n-mc2-e'), 'Tieni il materiale');
  assert.deepEqual(bottoniNotaG(h, 'n-mc2-e'), []);
  assert.equal(q(h, '#mrv-veste-risposta').hidden, true, 'niente gesti della nota in fondo (Q20)');
  assert.equal(bottone(h).disabled, false, 'non è spento per una nota aperta');
  assert.equal(bottone(h).textContent, 'Approvato');
  assert.equal(attesaG(h), '');
  assert.equal(costoG(h), '', 'in G2 niente avviso');
  await vaiA(h, 'ca1');
  assert.equal(nomeSpuntaG(h, 'n-ca1'), 'Tieni il materiale');
  assert.deepEqual(bottoniNotaG(h, 'n-ca1'), [], 'via «Escludi il materiale» / «Tieni il materiale» come bottoni');
  await vaiA(h, 'mc2');
  const w = h.calls.manifest;
  await premiG(h);
  assert.equal(h.calls.manifest - w, 1, 'una scrittura: la nota e il visto');
  assert.equal(decisione(h, 'n-mc2-e'), 'reject');
  assert.equal(statoRiga(h, 'mc2'), 'approvato');
  assert.notEqual(scheda(h), 'mc2', 'la riga dopo');
  await z3(h, CMD_Z);
  assert.equal(decisione(h, 'n-mc2-e'), 'pending', 'una voce sola: ⌘Z riapre la nota e toglie il visto');
  assert.equal(statoRiga(h, 'mc2'), 'da-rivedere');
});

test('0086 g3c §4.3 G2: la proposta si copia con un clic sull’area della nota; il materiale diventa «Rivisto»; premuto, «Proposta scelta» e il visto in una scrittura (più quella della battitura, R6); il salvataggio del campo non chiude la nota (D37.1)', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc1');
  assert.equal(campo(h, 'question').value, 'Chi fu accusato?', 'il campo parte dall’Originale');
  areaG(h, 'n-mc1-q').onclick(); await tick();
  assert.equal(campo(h, 'question').value, 'Chi venne accusato?');
  assert.equal(nomeCampo3(h, 'question'), 'Proposta');
  assert.equal(bottone(h).textContent, 'Rivisto');
  await premiG(h);
  assert.equal(h.calls.manifest, 1, '0086 g3d (D41): la proposta copiata e il bottone in una scrittura (prima due, R6)');
  assert.equal(decisione(h, 'n-mc1-q'), 'accept');
  assert.equal(statoRiga(h, 'mc1'), 'rivisto');
  const k = runtime(); k.apri(); await vaiA(k, 'mc2');
  await scrivi(k, 'explanation', 'I depositi d’oro tedesco.');
  assert.equal(decisione(k, 'n-mc2-e'), 'pending', 'l’uscita non chiude la nota (e non scrive: D41)');
  assert.equal(k.calls.manifest, 0);
  assert.equal(statoRiga(k, 'mc2'), 'da-rivedere');
  await premiG(k);
  assert.equal(decisione(k, 'n-mc2-e'), 'reject');
  await vaiA(k, 'mc2');
  assert.equal(esitoG(k, 'n-mc2-e'), 'Tenuta la tua versione');
  assert.equal(statoRiga(k, 'mc2'), 'rivisto');
});

test('0086 g3c §4.5 G2: spunta tolta su una nota di un campo = il materiale è escluso (D37.5), e la riga accanto al bottone lo dice; spunta tolta sull’esclusione proposta, sola = «Esclusione scelta»; «Escludi» della barra con la nota d’esclusione aperta vale come la sua spunta tolta, anche con un’altra nota aperta', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc2');
  await cambiaG(h, 'n-mc2-e', false);
  assert.equal(h.calls.manifest, 0);
  assert.equal(attesaG(h), 'Il materiale sarà escluso e non arriverà all’allievo.', '0086 g3d (D43)');
  assert.equal(bottone(h).textContent, 'Approvato', 'in G2 il bottone del materiale resta «Approvato» / «Rivisto» (D43)');
  await premiG(h);
  assert.equal(statoRiga(h, 'mc2'), 'escluso');
  await vaiA(h, 'ca1');
  await cambiaG(h, 'n-ca1', false);
  await premiG(h);
  assert.equal(decisione(h, 'n-ca1'), 'accept', 'la proposta di esclusione della nota');
  assert.equal(statoRiga(h, 'ca1'), 'escluso');
  const report = rapporto({ issues: clone(NOTE).concat([{ id: 'n-ca1-q', target: { kind: 'item', id: 'ca1', field: 'question' }, problem: 'Domanda vaga.' }]) });
  const k = runtime({ report }); k.apri(); await vaiA(k, 'ca1');
  await q(k, '#mrv-veste-escludi').click(); await tick(); await tick();
  assert.equal(decisione(k, 'n-ca1'), 'accept', '«Escludi» decide la nota d’esclusione');
  assert.equal(decisione(k, 'n-ca1-q'), 'pending', 'l’altra nota resta com’era, sospesa dall’esclusione');
  assert.equal(k.final().initial.issues.some(i => i.origin === 'teacher'), false, 'nessuna esclusione del docente');
  assert.equal(statoRiga(k, 'ca1'), 'escluso');
});

test('0086 g3c §4.3 G2, un campo senza aree (D31): la proposta delle alternative si legge nella nota e il clic la copia nelle alternative; la riga del campo dice «Proposta»; premuto, «Proposta scelta»', async () => {
  const report = rapporto({ issues: [{ id: 'nO', target: { kind: 'item', id: 'mc2', field: 'options' }, after: ['Oro', 'Argento'], problem: 'La seconda alternativa è implausibile.' }] });
  const h = runtime({ report }); h.apri(); await vaiA(h, 'mc2');
  assert.equal(vistaG(h, 'nO'), true);
  assert.match(areaG(h, 'nO').textContent, /Argento/);
  areaG(h, 'nO').onclick(); await tick();
  assert.equal(alternativa(h, 1).value, 'Argento');
  assert.equal(q(h, '[data-veste-campo="options"] [data-veste-proposta-nome]').textContent, 'Proposta');
  assert.equal(bottone(h).textContent, 'Rivisto');
  await premiG(h);
  assert.equal(decisione(h, 'nO'), 'accept');
  assert.equal(statoRiga(h, 'mc2'), 'rivisto');
});

/* ── punto 3: i conflitti salvati prima (D37.7, L3) ── */
test('0086 g3c D37.7 G1: due proposte scelte in una seduta di prima che si contraddicono — la riga prende le spunte (piene; vuota la descrizione intera), il campo riparte dal testo senza le scelte in conflitto, la riga dice che il bottone le sostituisce; niente «Togli questa scelta»; premuto, nessun conflitto', async () => {
  const h = conflittoA3c(); await vaiA1(h, 'A');
  assert.equal(campo(h, 'desc').value, G1_A, 'il campo riparte dal testo senza le due scelte');
  for (const id of ['a1', 'a3', 'a4']) assert.equal(spunta3(h, id).checked, true, id + ' piena');
  assert.equal(spunta3(h, 'a2').checked, false, 'la descrizione intera parte vuota (D39)');
  assert.match(q(h, '[data-veste-avvisi]').textContent, /Le scelte salvate prima su questa scheda si contraddicono: il campo riparte dal testo delle scelte che non si contraddicono, e il bottone in fondo le sostituisce/);
  assert.equal(nomiInVista(h).some(n => /Togli questa scelta/.test(n)), false);
  assert.deepEqual(bottoniNotaG(h, 'a1'), []);
  await cambia3(h, 'a2', true);
  assert.equal(bottone(h).disabled, false);
  await premiG(h);
  const s = BancoCore.testoAdesso(null, h.rev(), { db: DB1, bersaglio: { kind: 'node', id: 'A', field: 'desc' } });
  assert.equal(s.ok, true, 'il conflitto è sostituito');
  assert.equal(s.adesso, G1_A);
  assert.deepEqual(['a1', 'a2', 'a3', 'a4'].map(id => esito1(h, id)), ['kept', 'kept', 'kept', 'kept']);
});

test('0086 g3c D37.7 L3: con un’altra scelta salvata che non confligge (a3, sulla seconda frase), il campo riparte dal testo che quella dà e la scelta resta; il titolo scritto su una riga in conflitto non si salva, e la riga dice che cosa premere', async () => {
  const h = conflittoA3c(r => Core.setDecision(r, 'a3', 'accept'));
  await vaiA1(h, 'A');
  assert.equal(campo(h, 'desc').value, G1_A3, 'il campo riparte dal testo della scelta che non confligge');
  assert.equal(bottone(h).textContent, 'Tieni la tua versione', '0086 g3d (D43): la spunta vuota di a2');
  await cambia3(h, 'a2', true);
  assert.equal(bottone(h).textContent, 'Usa Proposta');
  await premiG(h);
  assert.equal(esito1(h, 'a3'), 'applied', 'la scelta che non confliggeva resta');
  assert.deepEqual(['a1', 'a4'].map(id => esito1(h, id)), ['kept', 'kept']);
  const s = BancoCore.testoAdesso(null, h.rev(), { db: DB1, bersaglio: { kind: 'node', id: 'A', field: 'desc' } });
  assert.equal(s.ok, true);
  assert.equal(s.adesso, G1_A3);
  const k = conflittoA3c(); await vaiA1(k, 'A');
  await scrivi(k, 'label', 'Accuse gravi');
  // 0086 g3d (D41): il titolo è una bozza; lo respinge il bottone, al clic (prima l'uscita dal campo)
  await cambia3(k, 'a2', true); await premiG(k);
  assert.equal(k.calls.manifest, 0, 'il titolo non si salva finché le scelte in conflitto restano');
  assert.match(q(k, '#mrv-status').textContent, /si scontra con le scelte salvate prima su questa scheda, che si contraddicono, e non è stata salvata: premi Esc per lasciare il campo com’era, poi il bottone in fondo, che le sostituisce; poi correggi di nuovo il campo\./);
  assert.equal(campo(k, 'label').value, 'Accuse gravi', 'niente si perde: la battitura resta nel campo');
});

test('0086 g3c D37.7 G2: due correzioni del docente salvate prima che si contraddicono (la risposta e tutto il materiale) — niente «Togli questa scelta», la riga lo dice e il bottone del materiale le sostituisce; premuto, nessun conflitto e il visto', async () => {
  const { h, a, b } = conflittoFc3c();
  await vaiA(h, 'fc1');
  assert.equal(nomiInVista(h).some(n => /Togli questa scelta/.test(n)), false);
  assert.deepEqual([a, b].map(id => bottoniNotaG(h, id)), [[], []], 'le correzioni in conflitto non hanno bottoni');
  assert.match(q(h, '[data-veste-avvisi]').textContent, /il bottone in fondo le sostituisce/);
  assert.equal(bottone(h).hidden, false);
  assert.equal(bottone(h).disabled, false);
  await premiG(h);
  assert.equal(confDi(h, 'fc1').length, 0, 'il conflitto è sostituito');
  assert.ok(!!h.final().initial.manualChecks.fc1, 'il visto');
  assert.equal(statoRiga(h, 'fc1'), 'approvato');
});

/* ── punto 4: la richiesta del docente (L6) ── */
test('0086 g3c L6 una richiesta del docente aperta sulla scheda delle spunte mostra solo il suo testo, senza bottoni né spunta; il bottone in fondo la chiude insieme alle note col testo che resta nel campo; mai due «Tieni…» nella stessa scheda', async () => {
  const h = runtime3(NOTE3, { prima: conRichiesta3() }); h.apri3();
  const rq = h.rev().initial.issues.find(i => i.origin === 'teacher').id;
  assert.deepEqual(bottoniNota3(h, rq), [], 'nessun bottone sulla richiesta');
  assert.equal(!!spunta3(h, rq), false, 'nessuna spunta');
  assert.equal(nomiInVista(h).filter(n => /^Tieni/.test(n)).length, 1, 'un solo «Tieni…»: il bottone in fondo');
  await premi3(h);
  assert.equal(esito3(h, rq), 'kept', 'col testo di partenza');
  const k = runtime3(NOTE3, { prima: conRichiesta3() }); k.apri3();
  const rk = k.rev().initial.issues.find(i => i.origin === 'teacher').id;
  await cambia3(k, 's3', false);
  await premi3(k);
  assert.equal(esito3(k, rk), 'edited', 'col testo che resta dopo il taglio');
  assert.equal(k.rev().initial.decisions[rk].text, [S3[0], S3[1], S3[3]].join(' '));
  // una riga con la sola richiesta: il bottone in fondo ha i nomi della regola unica, come prima (Q20)
  const r = runtime3([], { prima: conRichiesta3('M') }); r.apri3();
  assert.equal(scheda(r), 'M');
  assert.deepEqual(bottoniInFondo(r), ['Tieni Originale']);
});

/* ── punto 5: le righe del bottone spento ── */
test('0086 g3c punto 5 le righe del bottone spento dicono che cosa premere o scrivere: la descrizione intera con la spunta vuota (la nota e il nodo), il campo vuoto (anche con le spunte piene), il passo che svuota il nodo, la frase che non si ritrova, la quasi-copia che svuota un altro nodo', async () => {
  const h = runtime3(NOTE3.concat([INTERA3()])); h.apri3();
  assert.match(attesa3(h), /Con la spunta vuota sulla nota «Il nodo semplifica troppo» esce tutta la descrizione di «Neutralità»: metti la spunta per tenerla, o scrivi nel campo la descrizione che vuoi tenere\./);
  await cambia3(h, 'n0', true);
  const el = entra(campo(h, 'desc')); el.value = '   '; el.oninput();
  await pausa3();
  assert.equal(bottone(h).disabled, true);
  assert.match(attesa3(h), /La descrizione di «Neutralità» è vuota: scrivi nel campo la descrizione da tenere, oppure premi Esc per rimettere quella di prima\./);
  assert.doesNotMatch(attesa3(h), /Togliendo la spunta/, 'le spunte sono piene: niente «Togliendo la spunta…»');
  tasto(h, { key: 'Escape' }); await tick();
  assert.equal(bottone(h).disabled, false, 'Esc rimette la descrizione e riaccende il bottone');
  const u = runtime3(NOTE3); u.apri3(); await vaiA1(u, 'U');
  await cambia3(u, 'u1', false);
  assert.match(attesa3(u), /Con la spunta tolta sulla nota «La frase «La frontiera restò aperta ai mercanti» non è nella fonte\.» esce tutta la descrizione di «Unica»: rimetti la spunta, o scrivi nel campo la descrizione che vuoi tenere\./);
  const f = runtime3(NOTE3); f.apri3();
  await scrivi(f, 'desc', 'Il confine e le banche restarono aperti. ' + S3[2] + ' ' + S3[3]);
  await cambia3(f, 's1', false);
  assert.match(attesa3(f), /Non ritrovo nel campo la frase della nota «La frase «Il confine fu chiuso nel 1942» non è nella fonte\.», che la spunta tolta farebbe uscire: rimetti la spunta e, se la frase non deve entrare, toglila tu dal campo\./);
  const DBV = clone(DB3); DBV.nodes.push({ id: 'V', label: 'Scambi', desc: S3[2], level: 2, group: 2 }); DBV.links.push({ source: 'N', target: 'V', rel: 'include' });
  const v = runtime3(NOTE3, { db: DBV }); v.apri3();
  await cambia3(v, 's3', false);
  assert.match(attesa3(v), /resterebbe vuota la descrizione di «Scambi», che ripete la stessa frase: rimetti la spunta, oppure riscrivi prima la descrizione di «Scambi»\./);
});

/* ── punto 6: chiavi e marcatori ── */
test('0086 g3c le chiavi nuove stanno in en_translations.js, nel blocco dello 0086, col ripiego italiano nel t(); nessuna in it_translations.js; quelle dei rami tolti (D30–D35, i bottoni delle note) non ci sono più', () => {
  const src = fs.readFileSync(require.resolve('../public/js/mappai-banco-veste.js'), 'utf8');
  const en = fs.readFileSync(require.resolve('../public/traduzioni/en_translations.js'), 'utf8');
  const it = fs.readFileSync(require.resolve('../public/traduzioni/it_translations.js'), 'utf8');
  const nuove = ['rv_veste_conflitto_prima', 'rv_veste_conflitto_prima_campo', 'rv_veste_fondo_vuoto', 'rv_veste_fondo_non_ritrovato_altrove',
    'rv_veste_fondo_toglie_collegamento', 'rv_veste_fondo_esclude'];
  const blocco = en.indexOf('// packet 0086 (D25-D29)'), fine = en.indexOf('sdoc_oltre_tetto');
  for (const k of nuove) {
    assert.ok(new RegExp("t\\('" + k + "', '[^']+'").test(src), k + ': t() col ripiego italiano');
    const riga = en.indexOf('    ' + k + ':');
    assert.ok(riga > blocco && riga < fine, k + ' nel blocco dello 0086');
    assert.equal(it.includes(k), false, k + ' non in it_translations.js');
  }
  for (const k of ['rv_veste_togli_scelta', 'rv_veste_come_togli', 'rv_veste_come_togli_campo', 'rv_veste_bottoni_o', 'rv_veste_togli_niente', 'rv_veste_togli_gia',
    'rv_veste_tua_conflitto_come', 'rv_veste_gia_scelta_conflitto_come', 'rv_veste_scelte_conflitto_come', 'rv_veste_conflitto_scheda_come', 'rv_veste_tieni_parole']) {
    assert.equal(new RegExp('\\b' + k + '\\b').test(src), false, k + ' tolta dalla veste');
    assert.equal(new RegExp('\\b' + k + '\\b').test(en), false, k + ' tolta da en_translations.js');
  }
  assert.equal(/TOGLI_SCELTA|comeSciogliere|togliUnaVolta|data-veste-togli-scelta/.test(src), false, '«Togli questa scelta» e i suoi rami non ci sono più');
});

/* ── aggiunti dopo le mutazioni del giro 3c (m3b, m4d, m7b vive) ── */
test('0086 g3c D37.7 L3 G2: con una proposta scelta che non confligge (la spiegazione di mc1), il campo riparte dal testo che quella dà; il bottone sostituisce solo le scelte in conflitto (la domanda)', async () => {
  const issues = [
    { id: 'nA', target: { kind: 'item', id: 'mc1', field: 'question' }, after: 'Chi venne accusato?', problem: 'Riformula.' },
    { id: 'nC', target: { kind: 'item', id: 'mc1', field: 'question' }, after: 'Chi è stato accusato?', problem: 'Tempo verbale.' },
    { id: 'nE', target: { kind: 'item', id: 'mc1', field: 'explanation' }, after: 'Furono proprio le banche.', problem: 'Più preciso.' }];
  const m = finalManifest(ITEMS, { checkStatus: 'completed', issues });
  m.review.final.review = Core.setDecision(Core.setDecision(Core.setDecision(m.review.final.review, 'nA', 'accept'), 'nC', 'accept'), 'nE', 'accept');
  const h = runtime({ manifest: m }); h.apri(); await vaiA(h, 'mc1');
  assert.equal(campo(h, 'explanation').value, 'Furono proprio le banche.', 'il campo riparte dalla scelta che non confligge');
  assert.equal(campo(h, 'question').value, 'Chi fu accusato?', 'il campo in conflitto riparte dal testo senza le due scelte');
  await premiG(h);
  assert.equal(decisione(h, 'nE'), 'accept', 'la scelta che non confliggeva resta');
  assert.equal(confDi(h, 'mc1').length, 0);
  assert.equal(itemG2(h, 'mc1').explanation, 'Furono proprio le banche.');
});

test('0086 g3c L6 una richiesta del docente aperta su una scheda con le note del controllo già decise: il bottone in fondo c’è e la chiude (niente vicolo cieco)', async () => {
  const h = runtime3(NOTE3, { prima: r => conRichiesta3('U')(Core.setDecision(r, 'u1', 'reject')) }); h.apri3();
  await vaiA1(h, 'U');
  const rq = h.rev().initial.issues.find(i => i.origin === 'teacher').id;
  assert.deepEqual(bottoniNota3(h, rq), [], 'la richiesta mostra solo il suo testo');
  assert.equal(bottone(h).hidden, false, 'il bottone in fondo c’è');
  assert.equal(bottone(h).disabled, false);
  await premi3(h);
  assert.equal(esito3(h, rq), 'kept');
});

test('0086 g3c §4.3 su un materiale escluso il clic sulla proposta nella nota non copia niente: i campi sono fermi', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc1');
  await q(h, '#mrv-veste-escludi').click(); await tick(); await tick();
  assert.equal(statoRiga(h, 'mc1'), 'escluso');
  areaG(h, 'n-mc1-q').onclick(); await tick();
  assert.equal(campo(h, 'question').value, 'Chi fu accusato?');
  assert.equal(campo(h, 'question').disabled, true);
});

/* ═══ 0086, giro 3d (09/10, dopo la verifica unica del giro 3; D41, D42, D43 e la chiarezza della riga) ═══
   D41 «Il campo si salva col bottone»: su una scheda con note del controllo il campo è una bozza fino al bottone in fondo.
   D42 «Il bottone prova prima e avvisa»: un nodo che resterebbe vuoto nei materiali, o con frasi in meno, lo spegne.
   D43 «Tieni la tua versione» con una spunta tolta, e accanto che cosa esce e da quali nodi.
   La mappa «Opere Difensive» ha i testi veri della seduta del 27/09 (`rev0086-g3fin`, sonde `vrefuso`, `vopere`). ═══ */
const DBO = { nodes: [
  { id: 'L1_1_L2_C', label: 'Opere Difensive', desc: 'Per evitare l\'invasione, la Svizzera creò il Ridotto nazionale nelle Alpi. Il Ridotto nazionale era un sistema di difesa basato su fortezze sotterranee camuffate da case o fienili. Questo piano serviva a organizzare una resistenza in un luogo impenetraibile se i nazisti avessero occupato il resto del territorio. La Svizzera mise anche esplosivi sotto ponti e gallerie.', level: 1, group: 1 },
  { id: 'L1_0_L2_A_D4', label: 'Minaccia degli ordigni', desc: 'La Svizzera mise grandi quantità di esplosivo sotto i ponti e nelle gallerie di strade e ferrovie. Questa misura serviva a difendere l\'inviolabilità del territorio svizzero. Se le potenze dell\'Asse avessero provato a invadere il Paese, l\'esercito avrebbe fatto detonare gli ordigni. L\'esplosione degli ordigni avrebbe distrutto i passaggi per bloccare l\'avanzata dei nemici verso l\'interno della Svizzera.', level: 2, group: 1 },
  { id: 'L1_2_C1', label: 'Commercio con i belligeranti', desc: 'La convenzione dell’Aia è un accordo internazionale. Questo accordo permette agli stati neutrali di commerciare liberamente con i paesi in guerra. Grazie a questa regola, la Svizzera ha potuto vendere merci e armamenti agli stati che combattevano.', level: 1, group: 2 }],
  links: [{ source: 'L1_1_L2_C', target: 'L1_0_L2_A_D4', rel: 'include' }], sourcesDict: {} };
const CCE_O = 'issue-r1-cce1b818b4cdfeb6-2731', C39_O = 'issue-r1-3926cc0a4129d0c4-2007';
const NOTE_O = [
  nota3(CCE_O, 'L1_1_L2_C', 'Le opere di sbarramento non erano solo distese di blocchi di cemento triangolari. La Svizzera ha anche fatto depositare esplosivi in gallerie, ponti e strade, e costruito fortezze camuffate come case coloniche o fienili.'),
  nota3(C39_O, 'L1_1_L2_C', 'Il testo non sostiene che il Ridotto Nazionale sia stato creato per proteggere solo le montagne e le fortezze. Il Ridotto Nazionale è un piano che prevedeva una resistenza in caso di invasione, organizzando fortezze nel sottosuolo e camuff'),
  nota3('issue-r1-fd1e85e62967f2e0-1831', 'L1_2_C1', 'La convenzione dell’Aia permette agli stati neutrali il libero commercio con i paesi in guerra, inclusa la vendita di armamenti. Tuttavia, la Svizzera non ha venduto armamenti agli Alleati')];
// una fonte con l'id, perché la quarantena la legga (`frasiFonte`): senza, `record` non è completo e non c'è niente da provare
const SOURCES_O = [{ id: 'pdf-1', title: 'Svizzera', pages: [{ n: 1, text: 'Le banche svizzere furono accusate di aver accettato oro.' }] }];
function manifestO() {
  const m = Pipeline.createManifest({}, { vaultPath: '/vault' }); m.steps.A.status = 'done';
  m.review = Core.createReview({ db: DBO, sources: SOURCES_O, report: { contratto: 'mappai-giudice@2', stato: 'parziale', issues: clone(NOTE_O),
    copertura: { nodiEsaminati: DBO.nodes.map(n => n.id), nodiSaltati: [] } } });
  return m;
}
const operaO = () => { const h = runtime3(null, { db: DBO, manifest: manifestO() }); h.apri3(); return h; };
// i materiali come li dà la quarantena (`record`, letto): le frasi tenute fuori, nodo per nodo
const fuoriO = h => { const rec = require('../public/js/mappai-affermazioni-core').record(h.rev(), h.st.db, {}); assert.equal(rec.completo, true, rec.motivo); return rec.escluse.map(e => e.nodeId + '|' + e.testo).sort(); };

test('0086 g3d D41 il campo di una scheda con note del controllo è una bozza fino al bottone in fondo: l’uscita non scrive (niente «Testo salvato»), la bozza resta cambiando riga e tornando, il bottone la registra con le spunte in UNA scrittura e UNA voce di ⌘Z', async () => {
  const h = runtime3(NOTE3); h.apri3();
  await scrivi(h, 'desc', T3 + ' Aggiunta.');
  assert.equal(h.calls.manifest, 0, 'l’uscita dal campo non scrive');
  assert.equal(adesso3(h, 'N'), T3, 'la revisione non cambia');
  assert.equal(campo(h, 'desc').value, T3 + ' Aggiunta.', 'la bozza resta nel campo');
  assert.equal(salvato3(h, 'desc'), '', 'niente «Testo salvato»: niente è salvato');
  assert.equal(bottone(h).textContent, 'Tieni la tua versione');
  await vaiA1(h, 'U');
  assert.equal(h.calls.manifest, 0, 'nemmeno il cambio di riga');
  await vaiA1(h, 'N');
  assert.equal(campo(h, 'desc').value, T3 + ' Aggiunta.', 'tornando sulla riga la bozza c’è');
  assert.equal(nomeCampo3(h), 'Tua versione');
  await premi3(h);
  assert.equal(h.calls.manifest, 1, 'una scrittura: la bozza e le spunte');
  assert.equal(adesso3(h, 'N'), T3 + ' Aggiunta.');
  assert.deepEqual(esiti3(h, ['s1', 's3', 'p', 'tt']), ['kept', 'kept', 'kept', 'kept']);
  assert.equal(scheda(h), 'U', 'la riga dopo');
  await z3(h, CMD_Z);
  assert.equal(adesso3(h, 'N'), T3, 'una voce sola: ⌘Z toglie il testo e riapre le note');
  assert.deepEqual(esiti3(h, ['s1', 's3', 'p', 'tt']), ['pending', 'pending', 'pending', 'pending']);
  // una riga senza note del controllo (un non letto) si salva all'uscita come prima
  const c = runtime1(); c.apri1(); await vaiA1(c, 'C');
  await scrivi(c, 'desc', 'Il commercio con la Germania continuò.');
  assert.equal(c.calls.manifest, 1);
});

test('0086 g3d D41 Esc riporta il campo all’ultimo testo registrato e la bozza non torna; chiuso il Banco senza premere il bottone, la bozza si perde', async () => {
  const h = runtime3(NOTE3); h.apri3();
  await scrivi(h, 'desc', T3 + ' Aggiunta.');
  await vaiA1(h, 'U'); await vaiA1(h, 'N');
  entra(campo(h, 'desc'));
  assert.equal(tasto(h, { key: 'Escape' }), true);
  assert.equal(campo(h, 'desc').value, T3);
  await vaiA1(h, 'U'); await vaiA1(h, 'N');
  assert.equal(campo(h, 'desc').value, T3, 'la bozza scartata non torna');
  assert.equal(h.calls.manifest, 0);
  const g = runtime3(NOTE3); g.apri3();
  await scrivi(g, 'desc', T3 + ' Aggiunta.', false);
  await q(g, '#mrv-later').click(); await tick();
  assert.equal(g.calls.manifest, 0, 'la chiusura non salva la bozza');
  const k = runtime3(null, { manifest: g.m }); k.apri3();
  assert.equal(campo(k, 'desc').value, T3, 'riaperto il Banco la bozza non c’è');
});

test('0086 g3d D41 la sonda della verifica (vrefuso): il refuso corretto su «Opere Difensive», con la nota sulla descrizione intera a spunta vuota, e l’uscita dal campo non cambiano i materiali; messa la spunta, il bottone registra il ritocco e le note in una scrittura', async () => {
  const h = operaO();
  assert.equal(scheda(h), 'L1_1_L2_C');
  const prima = fuoriO(h);
  await scrivi(h, 'desc', campo(h, 'desc').value.replace('impenetraibile', 'impenetrabile'));
  assert.equal(h.calls.manifest, 0);
  assert.deepEqual(fuoriO(h), prima, 'nei materiali niente cambia prima del bottone');
  await cambia3(h, C39_O, true);
  assert.equal(bottone(h).disabled, false);
  await premi3(h);
  assert.equal(h.calls.manifest, 1, 'una scrittura');
  assert.match(adesso3(h, 'L1_1_L2_C'), /luogo impenetrabile se i nazisti/);
  assert.deepEqual(esiti3(h, [CCE_O, C39_O]), ['kept', 'kept']);
});

test('0086 g3d D41 G2: il campo di un materiale con una nota del controllo è una bozza; «Rivisto» registra il campo, la nota e il visto in una scrittura e una voce di ⌘Z', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc2');
  await scrivi(h, 'explanation', 'I depositi d’oro.');
  assert.equal(h.calls.manifest, 0);
  assert.equal(itemG2(h, 'mc2').explanation, 'I depositi.');
  assert.equal(bottone(h).textContent, 'Rivisto');
  await premiG(h);
  assert.equal(h.calls.manifest, 1);
  assert.equal(itemG2(h, 'mc2').explanation, 'I depositi d’oro.');
  assert.equal(decisione(h, 'n-mc2-e'), 'reject');
  assert.ok(!!h.final().initial.manualChecks.mc2, 'il visto');
  await q(h, '#mrv-veste-annulla').click(); await tick(); await tick();
  assert.equal(itemG2(h, 'mc2').explanation, 'I depositi.', 'un ⌘Z toglie tutto');
  assert.equal(decisione(h, 'n-mc2-e'), 'pending');
  assert.ok(!(h.final().initial.manualChecks || {}).mc2);
});

test('0086 g3d D42 la sonda della verifica (vopere, scena 2): tolta la spunta di cce1b e messa quella della descrizione intera, «Minaccia degli ordigni» resterebbe vuota nei materiali — il bottone è spento e la riga lo dice per nome; premuto non scrive; rimessa la spunta si accende', async () => {
  const h = operaO();
  await cambia3(h, CCE_O, false); await cambia3(h, C39_O, true);
  assert.equal(bottone(h).disabled, true);
  assert.match(attesa3(h), /^Togliendo la spunta sulla nota «Le opere di sbarramento[^»]*», «Minaccia degli ordigni» resta vuota nei materiali: rimetti la spunta o correggi quel nodo\.$/);
  const prima = fuoriO(h);
  await bottone(h).onclick({}); await tick(); await tick();
  assert.equal(h.calls.manifest, 0, 'nessuna scrittura');
  assert.deepEqual(fuoriO(h), prima);
  await cambia3(h, CCE_O, true);
  assert.equal(bottone(h).disabled, false);
  assert.equal(attesa3(h), '');
});

test('0086 g3d D43 con una spunta tolta il bottone dice «Tieni la tua versione» e la riga dice che cosa esce e da quali nodi; sul collegamento «Esce il collegamento …»; in G2 il bottone resta «Approvato» e la riga dice che il materiale sarà escluso', async () => {
  const h = runtime3(NOTE3); h.apri3();
  assert.equal(bottone(h).textContent, 'Tieni Originale');
  await cambia3(h, 's3', false);
  assert.equal(bottone(h).textContent, 'Tieni la tua versione', 'il campo ha l’Originale, ma il clic toglie una frase');
  assert.equal(attesa3(h), 'Escono: «Il commercio con la Germania…» da «Neutralità» e «Commercio».');
  assert.equal(costo3(h), 'Confermi 2 frasi contestate');
  await cambia3(h, 's1', false);
  assert.equal(attesa3(h), 'Escono: «Il confine fu chiuso nel 1942.» e «Il commercio con la Germania…» da «Neutralità»; «Il commercio con la Germania…» da «Commercio».');
  await cambia3(h, 's1', true); await cambia3(h, 's3', true);
  assert.equal(bottone(h).textContent, 'Tieni Originale');
  assert.equal(attesa3(h), '');
  const o = operaO();
  await cambia3(o, CCE_O, false);
  assert.equal(bottone(o).textContent, 'Tieni la tua versione', 'anche spento');
  const l = runtime1(); l.apri1(); await vaiA1(l, LINK_AB);
  await cambiaG(l, 'l1', false);
  assert.equal(bottone(l).textContent, 'Tieni la tua versione');
  assert.equal(attesaG(l), 'Esce il collegamento «Accuse → Banche»: le parole nel campo non contano più.');
  const g = runtime(); g.apri(); await vaiA(g, 'mc1');
  await cambiaG(g, 'n-mc1-q', false);
  assert.equal(bottone(g).textContent, 'Approvato');
  assert.equal(attesaG(g), 'Il materiale sarà escluso e non arriverà all’allievo.');
});

test('0086 g3d punto 4 la riga del bottone spento nomina la nota giusta (la nota sulla descrizione intera, anche se una nota localizzata tolta viene prima) e, se la riscrittura riprende ancora una frase generata, dice quale invece di «scrivi la descrizione»', async () => {
  const h = runtime3(NOTE3.concat([INTERA3()])); h.apri3();
  await cambia3(h, 's1', false);
  assert.match(attesa3(h), /^Con la spunta vuota sulla nota «Il nodo semplifica troppo» esce tutta la descrizione di «Neutralità»/);
  const o = operaO();
  await cambia3(o, CCE_O, false);
  assert.match(attesa3(o), /^Con la spunta vuota sulla nota «Il testo non sostiene che il Ridotto Nazionale/, 'la riga nomina 3926c, non cce1b (la sonda vopere)');
  const k = runtime3(NOTE3.concat([INTERA3()])); k.apri3();
  const el = entra(campo(k, 'desc')); el.value = S3[0] + ' Il docente scrive una frase nuova.'; el.oninput();
  await pausa3();
  assert.equal(bottone(k).disabled, true);
  assert.equal(attesa3(k), 'La tua descrizione contiene ancora «Il confine fu chiuso nel 1942.»: cambiala, o metti la spunta.');
  el.value = 'Le dogane restarono aperte. I mercati ripresero.'; el.oninput();
  await pausa3();
  assert.equal(bottone(k).disabled, false, 'riscritta davvero');
  const r = operaO();
  const er = entra(campo(r, 'desc')); er.value = 'Per difendersi la Svizzera costruì il Ridotto nazionale, un insieme di fortezze nascoste nelle Alpi.'; er.oninput();
  await pausa3();
  // ADR 0012 rev. 15 (packet 0089): la soglia di contenimento è spenta — la riscrittura del revisore non viene più fermata
  // (prima: «La tua descrizione contiene ancora «Per difendersi la Svizzera costruì…»», la sonda vriscrivi)
  assert.equal(bottone(r).disabled, false, 'rev. 15: la riscrittura del revisore accende il bottone');
  assert.doesNotMatch(attesa3(r), /contiene ancora/);
});

test('0086 g3d D41 G2, le alternative: con la nota del controllo «×» e il pallino restano nella bozza (niente scrittura), la bozza torna cambiando materiale, e il bottone del materiale la registra in una scrittura', async () => {
  const h = runtime(); h.apri(); await vaiA(h, 'mc1');
  await q(h, '[data-veste-scheda] [data-veste-togli="0"]').click(); await tick();
  const radio = q(h, '[data-veste-scheda] [data-veste-corretta="1"]'); radio.checked = true; await radio.onchange(); await tick();
  assert.equal(h.calls.manifest, 0, '«×» e il pallino non scrivono');
  assert.equal(bottone(h).textContent, 'Rivisto', 'il nome segue la bozza');
  await vaiA(h, 'mc2'); await vaiA(h, 'mc1');
  assert.deepEqual([alternativa(h, 0).value, alternativa(h, 1).value], ['Le banche', 'I cantoni'], 'la bozza torna');
  assert.equal(q(h, '[data-veste-scheda] [data-veste-corretta="1"]').checked, true);
  await premiG(h);
  assert.equal(h.calls.manifest, 1);
  const it = itemG2(h, 'mc1');
  assert.deepEqual([it.options, it.correctIndex], [['Le banche', 'I cantoni'], 1]);
  assert.equal(decisione(h, 'n-mc1-q'), 'reject');
});

test('0086 g3d D42 anche il nodo della riga: una frase che il taglio non toglie uscirebbe dai materiali (la copia di una frase che un’altra nota contesta) — il bottone è spento e la riga dice il nodo, la nota e la frase', async () => {
  const S = ['Il confine fu chiuso nel 1942.', 'Le banche custodivano oro tedesco.', 'Il commercio con la Germania continuò fino al 1944.'];
  const db = { nodes: [{ id: 'N', label: 'Neutralità', desc: S.join(' '), level: 1, group: 1 }, { id: 'X', label: 'Banche', desc: S[1] + ' I depositi crebbero in fretta.', level: 1, group: 1 }], links: [], sourcesDict: {} };
  const issues = [cita3('s1', 'Il confine fu chiuso nel 1942'), nota3('x0', 'X', 'Il nodo semplifica troppo')];
  const m = Pipeline.createManifest({}, { vaultPath: '/vault' }); m.steps.A.status = 'done';
  m.review = Core.createReview({ db, sources: SOURCES_O, report: { contratto: 'mappai-giudice@2', stato: 'parziale', issues, copertura: { nodiEsaminati: ['N', 'X'], nodiSaltati: [] } } });
  const h = runtime3(null, { db, manifest: m }); h.apri3();
  assert.equal(scheda(h), 'N');
  await cambia3(h, 's1', false);
  assert.equal(bottone(h).disabled, true);
  assert.equal(attesa3(h), 'Togliendo la spunta sulla nota «La frase «Il confine fu chiuso nel 1942» non è nella fonte.», «Neutralità» perde nei materiali la frase «Le banche custodivano oro tedesco.»: rimetti la spunta o correggi quel nodo.');
});

test('0086 g3d le chiavi nuove stanno in en_translations.js, nel blocco dello 0086, col ripiego italiano nel t(); nessuna in it_translations.js', () => {
  const src = fs.readFileSync(require.resolve('../public/js/mappai-banco-veste.js'), 'utf8');
  const en = fs.readFileSync(require.resolve('../public/traduzioni/en_translations.js'), 'utf8');
  const it = fs.readFileSync(require.resolve('../public/traduzioni/it_translations.js'), 'utf8');
  const chiavi = ['rv_veste_fondo_escono', 'rv_veste_fondo_esce_da', 'rv_veste_fondo_e', 'rv_veste_fondo_altre', 'rv_veste_fondo_resta', 'rv_veste_fondo_resta_altrove',
    'rv_veste_fondo_colpito_vuoto', 'rv_veste_fondo_colpito_frase'];
  const blocco = en.indexOf('// packet 0086 (D25-D29)'), fine = en.indexOf('sdoc_oltre_tetto');
  for (const k of chiavi) {
    assert.ok(new RegExp("t\\('" + k + "', '[^']+'").test(src), k + ': t() col ripiego italiano');
    const riga = en.indexOf('    ' + k + ':');
    assert.ok(riga > blocco && riga < fine, k + ' nel blocco dello 0086');
    assert.equal(it.includes(k), false, k + ' non in it_translations.js');
  }
});

/* ── 0097, allargamento del 15/10: il piè di una revisione APPROVATA e poi superata ──
   Al gate (copia del 4B col titolo di un nodo cambiato) la testa diceva «La mappa o le fonti non corrispondono…» e il piè
   «La revisione è approvata e le decisioni sono salvate nel progetto.». Ora il piè dice la frase che il piè di una revisione
   in attesa usa già nello stesso caso; approvata e non superata, «approvata» come prima. */
test('0097: G1 approvata e poi superata — il piè dice che cosa fare e il bottone «Ricontrolla la mappa adesso» lo fa, non «approvata»', async () => {
  const report = { checkStatus: 'completed', issues: [] };
  const approvata = () => {
    const m = g1Manifest(report), begun = Core.beginApproval(m.review, DB1, { sources: SOURCES1 });
    m.review = Core.completeApproval(begun.review, begun.revision); return m;
  };
  const buona = runtime1({ manifest: approvata() }); buona.apri1();
  assert.match(q(buona, '#mrv-next-step').textContent, /La revisione è approvata/);
  assert.equal(q(buona, '#mrv-continue').textContent, 'Chiudi', 'approvata e non superata: il bottone di prima');
  const cambiata = clone(DB1); cambiata.nodes.find(n => n.id === 'B').label = 'Banche svizzere';
  const h = runtime1({ manifest: approvata(), db: cambiata }); h.apri1();
  const piede = q(h, '#mrv-next-step').textContent;
  // seconda decisione di Giacomo (15/10 sera): il piè dice che cosa fare, e il bottone lo fa
  assert.equal(piede, 'La mappa è cambiata, per continuare premi «Ricontrolla la mappa adesso». Le decisioni approvate restano salvate.');
  assert.equal(/La revisione è approvata/.test(piede), false, 'niente «approvata» sotto l’avviso');
  const bottone = q(h, '#mrv-continue');
  assert.equal(bottone.hidden, false);
  assert.equal(bottone.textContent, 'Ricontrolla la mappa adesso');
  const approvataPrima = clone(h.rev());
  await bottone.click(); await tick(); await tick(); await tick();
  assert.equal(h.rev().initial.status, 'awaiting_review', 'il controllo nuovo sulla mappa di adesso');
  assert.equal(h.rev().previous.approvedRevision, approvataPrima.approvedRevision, 'la revisione approvata resta in previous');
  assert.equal(Core.coincide(cambiata, h.rev().sources, h.rev(), 'base'), true, 'la revisione nuova fotografa la mappa di adesso');
  assert.ok(h.calls.manifest >= 1, 'scritta sul disco');
});

test('0097: G2 approvata e poi superata — il piè dice la frase dell’avviso, non «approvata»', async () => {
  const report = { checkStatus: 'completed', issues: [] }, m = finalManifest(ITEMS, report), fr = m.review.final;
  const prima = Core.beginApproval(fr.review, { items: fr.items }, { sources: fr.review.sources });
  fr.review = Core.completeApproval(prima.review, Core.revision({ items: fr.items }, fr.review.sources)); fr.stage = 'approved';
  fr.items.find(i => i.id === 'fc1').answer = 'Cambiata altrove.';
  const h = runtime({ manifest: m, report }); h.apri();
  const piede = q(h, '#mrv-next-step').textContent;
  assert.match(piede, /non corrispondono alla versione di questa revisione/);
  assert.equal(/La revisione è approvata/.test(piede), false, 'niente «approvata» sotto l’avviso');
});

test('0097: «Ricontrolla la mappa adesso» senza chiave — l’errore arriva al docente come avviso, la revisione approvata resta', async () => {
  const report = { checkStatus: 'completed', issues: [] };
  const m = g1Manifest(report), begun = Core.beginApproval(m.review, DB1, { sources: SOURCES1 });
  m.review = Core.completeApproval(begun.review, begun.revision);
  const cambiata = clone(DB1); cambiata.nodes.find(n => n.id === 'B').label = 'Banche svizzere';
  const h = runtime1({ manifest: m, db: cambiata }), avvisi = [];
  h.window.executeJudgePass = async () => { throw new Error('Chiave del provider mancante.'); };
  h.window.showToast = (testo, tipo) => avvisi.push([testo, tipo]);
  h.apri1();
  await q(h, '#mrv-continue').click(); await tick(); await tick(); await tick();
  assert.deepEqual(avvisi, [['Chiave del provider mancante.', 'error']]);
  assert.equal(h.rev().initial.status, 'approved', 'niente revisione nuova senza il controllo');
  assert.equal(h.calls.manifest, 0, 'niente scritto sul disco');
});

/* 0097 riaperto (Giacomo, 15/10 sera: «Banco: allineare il riquadro giallo della riga al piè»): con la G1 APPROVATA e poi superata il
   riquadro giallo della riga dice la frase del piè; con la revisione in attesa e la mappa cambiata, quella di prima. */
test('0097: G1 approvata e superata — il riquadro giallo della riga dice la frase del piè; in attesa quella di prima', async () => {
  const cambiata = clone(DB1); cambiata.nodes.find(n => n.id === 'E').label = 'Esercito svizzero';
  const m = decidiTutto(g1Manifest()), begun = Core.beginApproval(m.review, DB1, { sources: SOURCES1, manualReview: true });
  assert.equal(begun.ok, true, JSON.stringify(begun.conflicts));
  m.review = Core.completeApproval(begun.review, begun.revision);
  const h = runtime1({ manifest: m, db: cambiata }); h.apri1();
  await vaiA(h, rigaG1(h, 'A') ? 'A' : righe1(h)[0].getAttribute('data-veste-riga'));
  const FRASE = 'La mappa è cambiata, per continuare premi «Ricontrolla la mappa adesso». Le decisioni approvate restano salvate.';
  const box = q(h, '[data-veste-avvisi]').textContent;
  assert.equal(box.includes(FRASE), true, 'il riquadro: ' + box);
  assert.equal(/riaprire la revisione sulla versione corretta/.test(box), false);
  assert.equal(q(h, '#mrv-next-step').textContent, FRASE, 'riquadro e piè dicono la stessa cosa');
  // in attesa, mappa cambiata: la frase di prima, nel riquadro come nel piè
  const a = runtime1({ manifest: g1Manifest(), db: cambiata }); a.apri1();
  await vaiA(a, rigaG1(a, 'A') ? 'A' : righe1(a)[0].getAttribute('data-veste-riga'));
  assert.match(q(a, '[data-veste-avvisi]').textContent, /La mappa o le fonti non corrispondono alla versione di questa revisione/);
});
