'use strict';
/*
 * Packet 0126 (lotto A) — due opzioni nuove della view «a scelta», spente di serie.
 *
 * `criteri: 'leggi'`: le aperte coi criteri, dopo «Ho risposto: mostra i criteri»,
 * bloccano la risposta e mostrano i criteri da LEGGERE (niente spunte, niente
 * punteggio: segno `criteriLetti`, non `criteriVisti`). `contatore`: un elemento di
 * chi monta dove si disegna il contatore; la riga in testa, rimasta vuota, si
 * nasconde. Le usa MappAI Studente sull'iPad.
 *
 * La view è montata in tre posti (il LIVE dei telefoni, lo «Studio attivo» del
 * docente, l'iPad): l'IMPRONTA qui sotto è l'HTML dei loro montaggi preso dalla
 * view di main (d191cb01) prima della modifica, e deve restare uguale.
 *
 * DOM finto su cheerio, come `dom()` di review-controller.test.js. ⚠️ Si asserisce
 * solo su booleani e stringhe: un assert fallito su un nodo cheerio fa girare
 * Node all'infinito mentre prova a stamparlo.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const cheerio = require('cheerio');

const ROOT = path.join(__dirname, '..');
const leggi = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function dom() {
  const $ = cheerio.load('<html><head></head><body></body></html>');
  const wrappers = new WeakMap();
  function wrap(n) {
    if (!n) return null;
    if (wrappers.has(n)) return wrappers.get(n);
    const e = {
      n, style: {},
      setAttribute(k, v) { $(n).attr(k, String(v)); },
      getAttribute(k) { const v = $(n).attr(k); return v === undefined ? null : v; },
      hasAttribute(k) { return $(n).attr(k) !== undefined; },
      removeAttribute(k) { $(n).removeAttr(k); },
      appendChild(c) { $(n).append(c.n); return c; },
      remove() { $(n).remove(); },
      querySelector(s) { return wrap($(n).find(s).get(0)); },
      querySelectorAll(s) { return $(n).find(s).toArray().map(wrap); },
      addEventListener() { },
      classList: {
        add(...c) { c.forEach(x => $(n).addClass(x)); },
        remove(...c) { c.forEach(x => $(n).removeClass(x)); },
        toggle(c, on) { const v = on === undefined ? !$(n).hasClass(c) : !!on; $(n).toggleClass(c, v); return v; },
        contains(c) { return $(n).hasClass(c); }
      },
      get children() { return $(n).children().toArray().map(wrap); },
      get firstChild() { return wrap($(n).contents().get(0)); },
      get childNodes() { return $(n).contents().toArray().map(wrap); },
      get isConnected() { return $(n).parents('html').length > 0; },
      /* una larghezza misurabile: 0,6 em per carattere, come un carattere monospazio */
      get scrollWidth() { return Math.round($(n).text().length * (parseFloat(this.style.fontSize) || 16) * 0.6); }
    };
    for (const name of ['id', 'className', 'type', 'rows', 'title']) Object.defineProperty(e, name, {
      get() { return $(n).attr(name === 'className' ? 'class' : name) || ''; },
      set(v) { $(n).attr(name === 'className' ? 'class' : name, String(v)); }
    });
    for (const [name, attr] of [['disabled', 'disabled'], ['hidden', 'hidden'], ['readOnly', 'readonly']]) Object.defineProperty(e, name, {
      get() { return $(n).attr(attr) !== undefined; },
      set(v) { if (v) $(n).attr(attr, ''); else $(n).removeAttr(attr); }
    });
    Object.defineProperties(e, {
      innerHTML: { get() { return $(n).html(); }, set(v) { $(n).html(String(v)); } },
      textContent: { get() { return $(n).text(); }, set(v) { $(n).text(v == null ? '' : String(v)); } },
      value: { get() { return this._value !== undefined ? this._value : ($(n).val() || ''); }, set(v) { this._value = String(v == null ? '' : v); } }
    });
    wrappers.set(n, e);
    return e;
  }
  const document = {
    head: wrap($('head')[0]), body: wrap($('body')[0]),
    createElement: tag => wrap($('<' + tag + '>')[0]),
    getElementById: id => wrap($('#' + id)[0])
  };
  return { document };
}

/* la view, il suo core e il modulo della scelta multipla, nel loro ordine di index.html */
function carica(sorgenteView) {
  const d = dom();
  const ctx = { console, document: d.document, setTimeout: () => 0, clearTimeout: () => { }, addEventListener() { }, removeEventListener() { } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(leggi('public/js/mappai-scelta-core.js'), ctx);
  vm.runInContext(leggi('public/js/mappai-quiz-mc-view.js'), ctx);
  vm.runInContext(sorgenteView || leggi('public/js/mappai-scelta-view.js'), ctx);
  return { SV: ctx.MappAISceltaView, SC: ctx.MappAIScelta, document: d.document };
}

function aperte() {
  return [
    { id: 'a1', tipo: 'aperta', testo: 'Perché il ghiaccio galleggia?', ramo: 'Acqua', angle: 'causa', criteri: ['densità minore', 'struttura del cristallo'], traccia: 'Parla della densità.' },
    { id: 'a2', tipo: 'aperta', testo: 'Che cosa succede a 100 °C?', ramo: 'Acqua', angle: 'processo', criteri: [], traccia: 'Ebollizione.' },
    { id: 'a3', tipo: 'aperta', testo: 'Confronta acqua e olio.', ramo: 'Miscugli', angle: 'confronto', criteri: ['non si mescolano'], traccia: '' }
  ];
}
function quiz() {
  return [
    { id: 'm1', tipo: 'mc', testo: 'Quanto fa 2 + 2?', ramo: 'Numeri', opzioni: ['3', '4', '5'] },
    { id: 'm2', tipo: 'mc', testo: 'Di che colore è il cielo?', ramo: 'Natura', opzioni: ['Blu', 'Verde'] }
  ];
}
function testi(host, sel) { return host.querySelectorAll(sel).map(b => b.textContent); }
function bottone(host, testo) { return host.querySelectorAll('button').filter(b => b.textContent === testo)[0] || null; }
function sha(s) { return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16); }

/* ── L'IMPRONTA: i montaggi di oggi, prima e dopo ─────────────────────────
   Ogni scenario dà la sequenza degli HTML che la view disegna; l'impronta è lo
   sha di quella sequenza. I valori vengono dalla view di main d191cb01. */
function scenari(sorgenteView) {
  const out = {};
  function fresco() { const r = carica(sorgenteView); const host = r.document.createElement('div'); r.document.body.appendChild(host); return Object.assign(r, { host }); }

  /* il LIVE dei telefoni, domande aperte semplici (live/scelta.html:189: niente `t`, niente `criteri`) */
  (function () {
    const { SV, host } = fresco(); const html = [];
    SV.monta(host, { pool: aperte(), cfg: { semplice: true }, stato: {}, verdetti: {}, onCambia() { }, onConsegna() { } });
    html.push(host.innerHTML);
    bottone(host, '›').onclick(); html.push(host.innerHTML);
    bottone(host, '›').onclick(); html.push(host.innerHTML);
    out.liveAperte = sha(html.join('\n§\n'));
  }());
  /* il LIVE, scelta multipla semplice con un verdetto già arrivato */
  (function () {
    const { SV, host } = fresco(); const html = [];
    SV.monta(host, { pool: quiz(), cfg: { semplice: true }, stato: {}, verdetti: { m1: { esito: 'right', giusta: '4', spiegazione: 'Due più due.' } }, onCambia() { }, onConsegna() { } });
    html.push(host.innerHTML);
    bottone(host, '›').onclick(); html.push(host.innerHTML);
    out.liveQuiz = sha(html.join('\n§\n'));
  }());
  /* il LIVE con la configurazione piena del docente (aree, scelta, osservazioni) */
  (function () {
    const { SV, host } = fresco(); const html = [];
    SV.monta(host, { pool: aperte(), cfg: {}, stato: {}, verdetti: {}, onCambia() { }, onConsegna() { } });
    html.push(host.innerHTML);
    SV.monta(host, { pool: aperte(), cfg: {}, stato: { fase: 'rispondi', risposte: { a1: {}, a3: {} } }, verdetti: {}, onCambia() { }, onConsegna() { } });
    html.push(host.innerHTML);
    out.livePieno = sha(html.join('\n§\n'));
  }());
  /* le due chiusure del LIVE */
  (function () {
    const { SV, host } = fresco(); const html = [];
    SV.mostraEsito(host, { cfg: { semplice: true }, profilo: { righe: [], conteggio: { scritte: 2, totale: 3 } }, onSalva() { } });
    html.push(host.innerHTML);
    SV.mostraEsito(host, { cfg: {}, profilo: { righe: [{ angle: 'causa', scelte: 1, totale: 2 }], conteggio: { scritte: 1, totale: 3 }, maiPresi: ['confronto'] } });
    html.push(host.innerHTML);
    out.liveEsito = sha(html.join('\n§\n'));
  }());
  /* lo «Studio attivo» del docente (mappai-scelta.js:352): `t` e `chiedi` suoi */
  (function () {
    const { SV, host } = fresco(); const html = [];
    SV.monta(host, { pool: aperte(), cfg: { semplice: true }, stato: {}, t: (k, f) => f, chiedi: () => Promise.resolve(true), onCambia() { }, onConsegna() { } });
    html.push(host.innerHTML);
    out.studioAttivo = sha(html.join('\n§\n'));
  }());
  /* l'iPad di oggi (autotest.js:142-164): criteri con le spunte, autovalutazione, senza aree */
  (function () {
    const { SV, host } = fresco(); const html = [];
    const stato = { fase: 'rispondi', risposte: { a1: { testo: 'Perché è meno denso.' }, a2: {} } };
    SV.monta(host, { pool: aperte(), cfg: { minimo: 1, minimoAree: 1, perRamo: true, autovalutazione: true }, stato, t: (k, f) => f, verdetti: {},
      mostraAngolo: false, senzaAree: true, criteri: true, chip: [], chipPrende: '', raggruppa: '', hint: '',
      chiedi: () => Promise.resolve(true), onCambia() { }, onConsegna() { } });
    html.push(host.innerHTML);
    bottone(host, 'Ho risposto: controlla coi criteri').onclick(); html.push(host.innerHTML);
    bottone(host, '›').onclick(); html.push(host.innerHTML);
    out.ipadMeta = sha(html.join('\n§\n'));
  }());
  return out;
}

const IMPRONTA = {
  liveAperte: '3a5c0d24af2ee3fd',
  liveQuiz: '99bbe85f0a42d81c',
  livePieno: 'fbd7ef7c61579c49',
  liveEsito: '05ac62f5583e9437',
  studioAttivo: '4b8fbad46603ed36',
  ipadMeta: 'f697e367e49c99ea'
};

test('0126: i montaggi di oggi (LIVE, Studio attivo, iPad meta) escono identici', () => {
  const ora = scenari();
  for (const k of Object.keys(IMPRONTA)) assert.equal(ora[k], IMPRONTA[k], 'scenario ' + k + ': l\'HTML disegnato è cambiato');
});

/* ── LA FORMA DA LEGGERE ──────────────────────────────────────────────── */
test('0126: `criteri: \'leggi\'` — dopo «Ho risposto» la risposta si blocca e i criteri si leggono, senza spunte', () => {
  const { SV, SC, document } = carica();
  const host = document.createElement('div'); document.body.appendChild(host);
  const cambi = [];
  const api = SV.monta(host, { pool: aperte(), cfg: { semplice: true }, stato: {}, criteri: 'leggi', onCambia(id) { cambi.push(id); }, onConsegna() { } });
  const vedi = bottone(host, 'Ho risposto: mostra i criteri');
  assert.equal(!!vedi, true, 'il bottone «Ho risposto: mostra i criteri» c\'è');
  assert.equal(vedi.disabled, true, 'spento finché la casella è vuota');
  assert.equal(!!bottone(host, 'Ho risposto: controlla coi criteri'), false, 'non quello delle spunte');
  const ta = host.querySelector('textarea');
  ta.value = 'Perché è meno denso.'; ta.oninput();
  assert.equal(vedi.disabled, false, 'con una risposta si accende');
  vedi.onclick();
  const ta2 = host.querySelector('textarea');
  assert.equal(ta2.readOnly, true, 'la risposta non si modifica più');
  assert.deepEqual(testi(host, '.sc-lbl').filter(x => x === 'I criteri della risposta'), ['I criteri della risposta']);
  assert.deepEqual(testi(host, 'ul.sc-crit li'), ['densità minore', 'struttura del cristallo']);
  /* gate del 25/10, Giacomo: «per i criteri usa una dimensione di font uguale a quella della text input area» */
  assert.equal(host.querySelectorAll('ul.sc-crit.sc-crit--live').length, 1, 'in semplice i criteri hanno il corpo della casella del LIVE');
  const corpo = (sel) => { const m = SV.CSS.match(new RegExp(sel.replace(/[.-]/g, '\\$&') + '\\{[^}]*font-size:(\\d+px)')); return m ? m[1] : null; };
  assert.equal(corpo('.sc-crit--live'), corpo('.sc-ta--live'), 'stesso corpo della casella');
  assert.equal(host.querySelectorAll('[role="checkbox"]').length, 0, 'niente spunte');
  assert.equal(!!bottone(host, 'Ho risposto: mostra i criteri'), false, 'il bottone se ne va');
  const r = api.stato.risposte.a1;
  assert.equal(r.criteriLetti, true);
  assert.equal(r.criteriVisti, undefined, 'non il segno delle spunte');
  assert.equal(r.spunte, undefined);
  assert.equal(SC.punteggioCriteri(aperte()[0], r), null, 'nessun punteggio: le risposte non si analizzano');
  assert.ok(cambi.indexOf('a1') >= 0, 'la lettura dei criteri si salva subito');
});

test('0126: `criteri: \'leggi\'` — una domanda senza criteri non ha il bottone; il quiz nemmeno', () => {
  const { SV, document } = carica();
  const host = document.createElement('div'); document.body.appendChild(host);
  SV.monta(host, { pool: aperte(), cfg: { semplice: true }, stato: {}, criteri: 'leggi', onCambia() { }, onConsegna() { } });
  bottone(host, '›').onclick();                       /* a2: criteri vuoti */
  assert.equal(!!bottone(host, 'Ho risposto: mostra i criteri'), false);
  const h2 = document.createElement('div'); document.body.appendChild(h2);
  SV.monta(h2, { pool: quiz(), cfg: { semplice: true }, stato: {}, criteri: 'leggi', onCambia() { }, onConsegna() { } });
  assert.equal(!!bottone(h2, 'Ho risposto: mostra i criteri'), false);
});

/* ── IL CONTATORE FUORI ───────────────────────────────────────────────── */
test('0126: `contatore` — «Domanda 1 di 3» nell\'elemento di chi monta, la riga in testa vuota si nasconde', () => {
  const { SV, document } = carica();
  const host = document.createElement('div'), conta = document.createElement('span');
  document.body.appendChild(conta); document.body.appendChild(host);
  SV.monta(host, { pool: aperte(), cfg: { semplice: true }, stato: {}, contatore: conta, onCambia() { }, onConsegna() { } });
  assert.equal(conta.textContent, 'Domanda 1 di 3');
  assert.equal(host.querySelectorAll('.sc-cnt').length, 0, 'nella prova non c\'è un secondo contatore');
  assert.equal(host.querySelector('.sc-top').hidden, true, 'la riga in testa, vuota, non si vede');
  /* gate del 25/10 nel simulatore: `.sc-top{display:flex}` vince sul [hidden] del browser, e
     la riga vuota restava una fascia di 25-40 px. Serve la regola che la spegne davvero. */
  assert.ok(/\.sc-top\[hidden\]\{display:none\}/.test(SV.CSS), 'la regola che spegne la riga nascosta');
  bottone(host, '›').onclick();
  assert.equal(conta.textContent, 'Domanda 2 di 3');
  assert.equal(conta.querySelectorAll('.sc-cnt').length, 1, 'uno solo: il disegno nuovo sostituisce il vecchio');
});

test('0126: `contatore` — con la scelta delle domande la riga in testa resta (porta il suggerimento)', () => {
  const { SV, document } = carica();
  const host = document.createElement('div'), conta = document.createElement('span');
  document.body.appendChild(conta); document.body.appendChild(host);
  SV.monta(host, { pool: aperte(), cfg: { minimo: 1, perRamo: true }, stato: {}, senzaAree: true, contatore: conta, onCambia() { }, onConsegna() { } });
  assert.equal(conta.querySelectorAll('.sc-cnt').length, 1, 'il contatore delle prese sta fuori');
  assert.equal(host.querySelector('.sc-top').hidden, false, 'il suggerimento resta in testa');
});

/* ── «CONSEGNA» ALLA FINE ANCHE FUORI DALLA SEMPLICE (allargamento 3, Giacomo al gate, in Meta:
   «il bottone consegna deve apparire solo dopo che sono arrivato all'ultima domanda selezionata») ── */
test('0126: `consegnaAllaFine` — fuori dalla semplice «Consegna» c\'è solo all\'ultima domanda presa', () => {
  const { SV, document } = carica();
  const host = document.createElement('div'); document.body.appendChild(host);
  SV.monta(host, { pool: aperte(), cfg: { minimo: 1 }, stato: { fase: 'rispondi', risposte: { a1: {}, a3: {} } }, senzaAree: true,
    consegnaAllaFine: true, onCambia() { }, onConsegna() { } });
  assert.equal(bottone(host, 'Consegna'), null, 'alla prima delle due prese non c\'è');
  bottone(host, '›').onclick();
  assert.ok(bottone(host, 'Consegna'), 'all\'ultima sì');
  bottone(host, '‹').onclick();
  assert.equal(bottone(host, 'Consegna'), null, 'tornando indietro sparisce di nuovo');
});

test('0126: senza `consegnaAllaFine` «Consegna» c\'è a ogni domanda (il LIVE pieno)', () => {
  const { SV, document } = carica();
  const host = document.createElement('div'); document.body.appendChild(host);
  SV.monta(host, { pool: aperte(), cfg: { minimo: 1 }, stato: { fase: 'rispondi', risposte: { a1: {}, a3: {} } }, senzaAree: true, onCambia() { }, onConsegna() { } });
  assert.ok(bottone(host, 'Consegna'), 'alla prima domanda');
});

test('0126: senza `contatore` il contatore resta nella riga in testa (il LIVE)', () => {
  const { SV, document } = carica();
  const host = document.createElement('div'); document.body.appendChild(host);
  SV.monta(host, { pool: aperte(), cfg: { semplice: true }, stato: {}, onCambia() { }, onConsegna() { } });
  assert.equal(host.querySelectorAll('.sc-top .sc-cnt').length, 1);
  assert.equal(host.querySelector('.sc-top').hidden, false);
});

/* ── LA CHIUSURA GRANDE (gate del 25/10, Giacomo: «'Hai finito!' grande come il 70% della
   larghezza della vista e aumenta proporzionalmente anche la dimensione dell'emoji») ── */
test('0126: `titoloLargo` — «Hai finito!» largo il 70% di chi monta, l\'emoji cresce con lui', () => {
  const { SV, document } = carica();
  const host = document.createElement('div'); document.body.appendChild(host);
  host.clientWidth = 800;
  SV.mostraEsito(host, { cfg: { semplice: true }, profilo: { righe: [], conteggio: { scritte: 1, totale: 12 } }, onSalva() { }, titoloLargo: 0.7 });
  const h2 = host.querySelector('h2'), big = host.querySelector('.sc-fine__big');
  assert.equal(h2.style.fontSize, '84px', '«Hai finito!» (11 caratteri) a 560 px su 800');
  assert.equal(h2.style.whiteSpace, 'nowrap', 'una riga sola, come nel quiz LIVE');
  assert.equal(big.style.fontSize, '244px', 'l\'emoji nella stessa proporzione di prima (64 su 22)');
});

/* gate del 25/10, Giacomo: «l'emoji ha bisogno di essere ridimensionato perché nella vista verticale
   occupa troppo spazio, nella vista orizzontale invece la dimensione attuale va bene». Misurato alle
   misure dell'iPad: in orizzontale il pannello è 495×759 e l'emoji 148 (il 19,5% dell'altezza); in
   verticale 813×532 e l'emoji 247, la schermata 709 px: «Risposte» e il 💾 andavano sotto. */
test('0126: `titoloLargo` — l\'emoji non supera un quinto dell\'altezza del pannello', () => {
  const { SV, document } = carica();
  const host = document.createElement('div'); document.body.appendChild(host);
  host.clientWidth = 800; host.clientHeight = 500;
  SV.mostraEsito(host, { cfg: { semplice: true }, profilo: { righe: [], conteggio: { scritte: 1, totale: 12 } }, onSalva() { }, titoloLargo: 0.7 });
  assert.equal(host.querySelector('h2').style.fontSize, '84px', 'il titolo resta al 70% della larghezza');
  assert.equal(host.querySelector('.sc-fine__big').style.fontSize, '100px', 'l\'emoji si ferma al 20% di 500');
});

test('0126: senza `titoloLargo` la chiusura ha le misure del LIVE (nessuno stile scritto)', () => {
  const { SV, document } = carica();
  const host = document.createElement('div'); document.body.appendChild(host);
  host.clientWidth = 800;
  SV.mostraEsito(host, { cfg: { semplice: true }, profilo: { righe: [], conteggio: { scritte: 1, totale: 12 } }, onSalva() { } });
  assert.equal(host.querySelector('h2').style.fontSize, undefined);
  assert.equal(host.querySelector('.sc-fine__big').style.fontSize, undefined);
});

/* ── IL RESTO ─────────────────────────────────────────────────────────── */
test('0126: la regola dell\'elenco dei criteri da leggere sta nel CSS della view', () => {
  const { SV } = carica();
  assert.ok(/\.sc-crit\{/.test(SV.CSS), 'manca .sc-crit');
});

test('0126: le due stringhe nuove in inglese', () => {
  const en = leggi('public/traduzioni/en_translations.js');
  assert.ok(/\bsc_crit_mostra:\s*"/.test(en), 'manca sc_crit_mostra');
  assert.ok(/\bsc_crit_leggi:\s*"/.test(en), 'manca sc_crit_leggi');
});

test('0126: `?v=` della view e del dizionario inglese col segno dello 0126 (come prefisso)', () => {
  const h = leggi('public/index.html');
  assert.ok(/js\/mappai-scelta-view\.js\?v=0126-/.test(h), 'view');
  assert.ok(/traduzioni\/en_translations\.js\?v=[^"]*0126-/.test(h), 'dizionario inglese');
});

module.exports = { scenari };

/* ── LA SCELTA SU MISURA PER L'IPAD (allargamento 4, Giacomo al gate del 26/10: «ridurre il carico
   cognitivo di fronte alla schermata di scelta delle domande su misura, rendere più leggibili i testi»).
   Cinque opzioni, tutte spente di serie: senza, le impronte qui sopra restano le stesse. ── */
const CHIPS = [{ k: 'capito', et: 'la so', colore: '#15803d' }, { k: 'nonso', et: 'non la so', colore: '#b45309' }, { k: 'noncapita', et: 'non ho capito', colore: '#1d4ed8' }];
function tagli() {
  return [
    { id: 'a1', tipo: 'aperta', testo: 'Acqua uno causa', ramo: 'Acqua', angle: 'causa', idx: 0 },
    { id: 'a2', tipo: 'aperta', testo: 'Acqua due causa', ramo: 'Acqua', angle: 'causa', idx: 1 },
    { id: 'd1', tipo: 'aperta', testo: 'Acqua uno definizione', ramo: 'Acqua', angle: 'definizione', idx: 0 },
    { id: 'd2', tipo: 'aperta', testo: 'Acqua due definizione', ramo: 'Acqua', angle: 'definizione', idx: 1 },
    { id: 'm1', tipo: 'aperta', testo: 'Miscugli uno causa', ramo: 'Miscugli', angle: 'causa', idx: 0 }
  ];
}
function caricaConVoce() {
  const detti = [];
  const d = dom();
  const ctx = { console, document: d.document, setTimeout: () => 0, clearTimeout: () => { }, addEventListener() { }, removeEventListener() { },
    speechSynthesis: { cancel() { }, speak(u) { detti.push(u.text); } }, SpeechSynthesisUtterance: function (x) { this.text = x; } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(leggi('public/js/mappai-scelta-core.js'), ctx);
  vm.runInContext(leggi('public/js/mappai-quiz-mc-view.js'), ctx);
  vm.runInContext(leggi('public/js/mappai-scelta-view.js'), ctx);
  return { SV: ctx.MappAISceltaView, document: d.document, detti };
}
function montaIpad(extra) {
  const { SV, document, detti } = caricaConVoce();
  const host = document.createElement('div'), conta = document.createElement('span');
  document.body.appendChild(conta); document.body.appendChild(host);
  const stato = {}, fasi = [];
  SV.monta(host, Object.assign({ pool: tagli(), cfg: { minimo: 1, perRamo: true }, stato, senzaAree: true, raggruppa: 'domanda-per-angoli',
    chip: CHIPS, chipPrende: 'capito', contatore: conta, aPagine: true, chipVelo: true, leggiDomande: true, senzaTorna: true,
    onFase(f) { fasi.push(f); }, chiedi: () => Promise.resolve(true), onCambia() { }, onConsegna() { } }, extra || {}));
  return { host, stato, fasi, detti, conta };
}
const domande = (host) => host.querySelectorAll('.sc-q .sc-txt').map(x => x.textContent);

test('0126 `aPagine`: una serie di tagli alla volta, il ramo in testa, «‹ n / N ›» per ramo', () => {
  const { host } = montaIpad();
  assert.equal(host.querySelector('.sc-ramo--titolo').textContent, 'Acqua');
  assert.deepEqual(domande(host).sort(), ['Acqua uno causa', 'Acqua uno definizione']);
  assert.equal(host.querySelectorAll('.sc-riga').length, 0, 'la riga «Domanda n · k tagli» la dice il numeratore');
  assert.equal(host.querySelector('.sc-nav__n').textContent, '1 / 2');
  assert.ok(bottone(host, '‹').disabled, 'alla prima serie non si torna indietro');
  assert.ok(bottone(host, 'Comincia a rispondere'), 'il bottone resta, accanto alle frecce');
  bottone(host, '›').onclick();
  assert.deepEqual(domande(host).sort(), ['Acqua due causa', 'Acqua due definizione']);
  assert.equal(host.querySelector('.sc-nav__n').textContent, '2 / 2');
  bottone(host, '›').onclick();
  assert.equal(host.querySelector('.sc-ramo--titolo').textContent, 'Miscugli', 'dopo l\'ultima serie del ramo, il ramo dopo');
  assert.equal(host.querySelector('.sc-nav__n').textContent, '1 / 1', 'il numeratore riparte nel ramo');
  assert.ok(bottone(host, '›').disabled, 'all\'ultima serie non si va avanti');
  bottone(host, '‹').onclick();
  assert.equal(host.querySelector('.sc-nav__n').textContent, '2 / 2');
  assert.ok(host.querySelector('.sc-wrap').classList.contains('sc--pagine'), 'la classe che porta le domande a 19 px');
});

test('0126 `chipVelo`: il tocco su una domanda apre un velo coi tre chip; scelto un chip si chiude', () => {
  const { host, stato } = montaIpad();
  const q = host.querySelectorAll('.sc-q').filter(x => x.querySelector('.sc-txt').textContent === 'Acqua uno causa')[0];
  q.querySelector('.sc-take').onclick();
  assert.equal(q.querySelector('.sc-body').hidden, true, 'la domanda non si apre sotto');
  const velo = host.querySelector('.sc-giudizio');
  assert.ok(velo, 'il velo');
  assert.deepEqual(velo.querySelectorAll('.sc-chip').map(c => c.textContent), ['la so', 'non la so', 'non ho capito']);
  assert.equal(velo.querySelectorAll('.sc-nota').length, 0, 'nel velo la domanda e i chip, nient\'altro');
  /* gate del 26/10 (Giacomo): «appare il velo con in cima la domanda» */
  assert.equal(velo.querySelector('.sc-giudizio__q').textContent, 'Acqua uno causa', 'la domanda in cima al velo');
  velo.querySelectorAll('.sc-chip')[0].onclick();
  assert.equal(host.querySelectorAll('.sc-giudizio').length, 0, 'scelto un chip il velo si chiude');
  assert.equal(stato.letture.a1.chip, 'capito');
  assert.ok(stato.risposte.a1, '«la so» prende la domanda, come prima');
  assert.ok(q.classList.contains('on'));
  q.querySelector('.sc-take').onclick();
  assert.equal(host.querySelector('.sc-giudizio').querySelectorAll('.sc-chip')[0].getAttribute('aria-pressed'), 'true', 'il velo mostra il chip già scelto');
  host.querySelector('.sc-giudizio__fondo').onclick();
  assert.equal(host.querySelectorAll('.sc-giudizio').length, 0, 'il tocco fuori chiude senza cambiare');
  assert.equal(stato.letture.a1.chip, 'capito');
});

test('0126 `leggiDomande`: il 🔊 su ogni domanda da scegliere la legge, senza aprirla', () => {
  const { host, detti } = montaIpad();
  const tts = host.querySelectorAll('.sc-q .sc-tts');
  assert.equal(tts.length, 2);
  assert.equal(tts[0].textContent, '🔊');
  tts[0].onclick({ stopPropagation() { } });
  assert.equal(detti.length, 1);
  assert.ok(/^Acqua uno /.test(detti[0]));
  assert.equal(host.querySelectorAll('.sc-giudizio').length, 0, 'ascoltare non apre il velo');
});

test('0126 `senzaTorna` e `onFase`: dalla scelta alla risposta senza «‹ Torna alle domande»; chi monta sa il passo', () => {
  const { host, fasi, conta } = montaIpad();
  assert.deepEqual(fasi.slice(-1), ['scegli']);
  const q = host.querySelectorAll('.sc-q')[0];
  q.querySelector('.sc-take').onclick();
  host.querySelector('.sc-giudizio').querySelectorAll('.sc-chip')[0].onclick();
  bottone(host, 'Comincia a rispondere').onclick();
  assert.deepEqual(fasi.slice(-1), ['rispondi']);
  assert.equal(bottone(host, '‹ Torna alle domande'), null, 'niente ritorno alla scelta');
  assert.equal(host.querySelector('.sc-top').hidden, true, 'e la riga che lo conteneva non si vede');
  assert.ok(/Domanda/.test(conta.textContent));
});

test('0126: senza le opzioni dell\'iPad la scelta per angoli resta quella di prima (righe «Domanda n», tutto in una lista)', () => {
  const { host } = montaIpad({ aPagine: false, chipVelo: false, leggiDomande: false, senzaTorna: false, onFase: undefined });
  assert.equal(host.querySelectorAll('.sc-ramo--titolo').length, 0);
  assert.equal(host.querySelectorAll('.sc-riga').length, 3);
  assert.equal(domande(host).length, 5);
  assert.equal(host.querySelectorAll('.sc-tts').length, 0);
  host.querySelectorAll('.sc-q')[0].querySelector('.sc-take').onclick();
  assert.equal(host.querySelectorAll('.sc-giudizio').length, 0);
  assert.equal(host.querySelectorAll('.sc-q')[0].querySelector('.sc-body').hidden, false, 'la domanda si apre sotto, come prima');
});

test('0126: le regole dell\'iPad nel CSS della view — domande e chip a 19, ramo a 25, il velo al centro', () => {
  const { SV } = carica();
  assert.ok(/\.sc--pagine \.sc-txt\{[^}]*font-size:19px/.test(SV.CSS), 'domande a 19');
  assert.ok(/\.sc-ramo--titolo\{[^}]*font-size:25px/.test(SV.CSS), 'ramo a 25');
  assert.ok(/\.sc-giudizio\{[^}]*position:fixed/.test(SV.CSS), 'il velo copre lo schermo');
  assert.ok(/\.sc-giudizio__box\{[^}]*flex-direction:column/.test(SV.CSS), 'i chip uno sopra l\'altro');
  assert.ok(/\.sc-giudizio \.sc-chip\{[^}]*font-size:19px/.test(SV.CSS), 'chip a 19');
  assert.ok(!/\.sc-velo/.test(SV.CSS), 'non si chiama come il velo dello scambio del reader (`#sc-velo .sc-velo__box`)');
});

test('0126: le frecce delle serie in inglese', () => {
  const en = leggi('public/traduzioni/en_translations.js');
  assert.ok(/sc_serie_prec:/.test(en) && /sc_serie_succ:/.test(en));
});

/* gate dell'allargamento 4 (Giacomo, 26/10): «togli il box per la spunta: l'allievo tocca la domanda, appare il
   velo con in cima la domanda e sceglie un opzione, dopo aver scelto l'opzione la domanda avrà il frame con il
   colore dell'opzione scelta». */
test('0126 `chipVelo`: niente casella della spunta; la cornice della domanda prende il colore del chip scelto', () => {
  const { host } = montaIpad();
  assert.equal(host.querySelectorAll('.sc-q .sc-mark').length, 0, 'niente casella');
  const q = () => host.querySelectorAll('.sc-q').filter(x => x.querySelector('.sc-txt').textContent === 'Acqua uno causa')[0];
  assert.equal(q().style.borderColor || '', '', 'prima del giudizio la cornice di sempre');
  q().querySelector('.sc-take').onclick();
  host.querySelector('.sc-giudizio').querySelectorAll('.sc-chip')[1].onclick();
  assert.equal(q().style.borderColor, '#b45309', '«non la so»: la cornice arancione');
  /* gate del 26/10 (Giacomo): «il BG del frame della risposta ha anche lui il colore dell'opzione ma con opacity 15%» */
  assert.equal(q().style.background, 'color-mix(in srgb, #b45309 15%, transparent)', 'e lo sfondo dello stesso colore al 15%');
  bottone(host, '›').onclick(); bottone(host, '‹').onclick();
  assert.equal(q().style.borderColor, '#b45309', 'tornando alla serie il colore resta');
  q().querySelector('.sc-take').onclick();
  host.querySelector('.sc-giudizio').querySelectorAll('.sc-chip')[1].onclick();
  assert.equal(q().style.borderColor || '', '', 'il secondo tocco sullo stesso chip lo toglie, e il colore con lui');
  assert.equal(q().style.background || '', '', 'anche lo sfondo');
});

test('0126: senza `chipVelo` la casella della spunta resta (il LIVE)', () => {
  const { host } = montaIpad({ aPagine: false, chipVelo: false });
  assert.equal(host.querySelectorAll('.sc-q .sc-mark').length, 5);
});

test('0126: la domanda in cima al velo a 19 px', () => {
  const { SV } = carica();
  assert.ok(/\.sc-giudizio__q\{[^}]*font-size:19px/.test(SV.CSS));
});

/* gate dell'allargamento 4 (Giacomo, 26/10): «Modifica tutti i bottoni sotto le text input area da 'Ho risposto:
   controlla i criteri' in 'Confermo', i criteri appaiono indipendentemente dal testo del bottone.» */
test('0126 `confermo`: sotto la casella «Confermo», con i criteri da leggere e con quelli da spuntare', () => {
  const { SV, document } = carica();
  const h1 = document.createElement('div'); document.body.appendChild(h1);
  const s1 = { risposte: { a1: { testo: 'Perché è meno denso' } } };
  SV.monta(h1, { pool: aperte(), cfg: { semplice: true }, stato: s1, criteri: 'leggi', confermo: true, onCambia() { }, onConsegna() { } });
  assert.equal(bottone(h1, 'Ho risposto: mostra i criteri'), null);
  bottone(h1, 'Confermo').onclick();
  assert.equal(h1.querySelectorAll('.sc-crit li').length, 2, 'i criteri appaiono lo stesso');
  const h2 = document.createElement('div'); document.body.appendChild(h2);
  const s2 = { fase: 'rispondi', risposte: { a1: { testo: 'Perché è meno denso' } } };
  SV.monta(h2, { pool: aperte(), cfg: { minimo: 1 }, stato: s2, senzaAree: true, criteri: true, confermo: true, onCambia() { }, onConsegna() { } });
  assert.equal(bottone(h2, 'Ho risposto: controlla coi criteri'), null);
  bottone(h2, 'Confermo').onclick();
  assert.equal(s2.risposte.a1.criteriVisti, true, 'e quelli da spuntare, come prima');
});

test('0126: senza `confermo` le due etichette di prima (il LIVE e lo «Studio attivo»)', () => {
  const { SV, document } = carica();
  const h = document.createElement('div'); document.body.appendChild(h);
  SV.monta(h, { pool: aperte(), cfg: { minimo: 1 }, stato: { fase: 'rispondi', risposte: { a1: { testo: 'x' } } }, senzaAree: true, criteri: true, onCambia() { }, onConsegna() { } });
  assert.ok(bottone(h, 'Ho risposto: controlla coi criteri'));
  bottone(h, 'Ho risposto: controlla coi criteri').onclick();
  assert.ok(h.querySelectorAll('.sc-lbl').map(x => x.textContent).includes('Che cosa c\'è nella tua risposta? Spunta ciò che hai scritto.'), 'e l\'invito di prima');
});

test('0126: «Confermo» e il nuovo invito dei criteri in inglese', () => {
  assert.ok(/sc_confermo:/.test(leggi('public/traduzioni/en_translations.js')));
  assert.ok(/sc_crit_concetti:/.test(leggi('public/traduzioni/en_translations.js')));
});

/* gate dell'allargamento 4 (Giacomo, 26/10): «Nel contatore scrivi «Lette: n/36 · la so: n» e togli «su 1».» */
test('0126 `chipVelo`: il contatore dice «Lette: n/N · la so: n», senza il minimo', () => {
  const { host, conta } = montaIpad();
  assert.equal(conta.textContent, 'Lette: 0/5 · la so: 0');
  host.querySelectorAll('.sc-q')[0].querySelector('.sc-take').onclick();
  host.querySelector('.sc-giudizio').querySelectorAll('.sc-chip')[0].onclick();
  assert.equal(conta.textContent, 'Lette: 1/5 · la so: 1');
  host.querySelectorAll('.sc-q')[1].querySelector('.sc-take').onclick();
  host.querySelector('.sc-giudizio').querySelectorAll('.sc-chip')[1].onclick();
  assert.equal(conta.textContent, 'Lette: 2/5 · la so: 1', '«non la so» si legge ma non si prende');
});

test('0126: senza `chipVelo` il contatore di prima, «scelte: n su m» (il LIVE)', () => {
  const { conta } = montaIpad({ aPagine: false, chipVelo: false });
  assert.equal(conta.textContent, 'Lette: 0/5 · scelte: 0 su 1');
});

/* gate dell'allargamento 4 (Giacomo, 26/10): «per il 'la so' usa il verde dei bottoni di MappAI, per il 'non la so'
   usa l'arancione acceso». I due colori sono troppo chiari per un testo sul bianco: un chip può portare `testo`,
   il colore leggibile della stessa famiglia; cornice e sfondo restano del colore pieno. */
test('0126: un chip con `testo` scrive in quel colore, la cornice resta del colore pieno; senza, come prima', () => {
  const chip = [{ k: 'capito', et: 'la so', colore: 'var(--man-verde, #41e6aa)', testo: 'var(--mm-ok, #059669)' }, { k: 'nonso', et: 'non la so', colore: '#b45309' }];
  const { host } = montaIpad({ chip });
  host.querySelectorAll('.sc-q')[0].querySelector('.sc-take').onclick();
  const c = host.querySelector('.sc-giudizio').querySelectorAll('.sc-chip');
  assert.equal(c[0].style.borderColor, 'var(--man-verde, #41e6aa)');
  assert.equal(c[0].style.color, 'var(--mm-ok, #059669)', 'il testo nel colore leggibile');
  assert.equal(c[1].style.color, '#b45309', 'senza `testo`, il colore del chip (il LIVE)');
  c[0].onclick();
  assert.equal(host.querySelectorAll('.sc-q')[0].style.borderColor, 'var(--man-verde, #41e6aa)', 'la cornice della domanda del colore pieno');
});

/* gate dell'allargamento 4 (Giacomo, 26/10): «A destra del titolo del ramo, allineato al margine destro, inserisci il
   contatore n/N per aiutare a capire lo stato di avanzamento» — alla domanda: i rami («2/6») */
test('0126 `aPagine`: accanto al titolo del ramo il contatore dei rami, «n/N»', () => {
  const { host } = montaIpad();
  const testa = host.querySelector('.sc-ramo-testa');
  assert.ok(testa, 'titolo e contatore sulla stessa riga');
  assert.equal(testa.querySelector('.sc-ramo--titolo').textContent, 'Acqua');
  assert.equal(testa.querySelector('.sc-ramo-n').textContent, '1/2');
  bottone(host, '›').onclick();
  assert.equal(host.querySelector('.sc-ramo-n').textContent, '1/2', 'dentro lo stesso ramo non cambia');
  bottone(host, '›').onclick();
  assert.equal(host.querySelector('.sc-ramo-n').textContent, '2/2');
  const { SV } = carica();
  assert.ok(/\.sc-ramo-testa\{[^}]*justify-content:space-between/.test(SV.CSS), 'il contatore al margine destro');
});

/* gate dell'allargamento 4 (Giacomo, 26/10): «La domanda principale, l'area la text input area della risposta e i
   criteri devono tutti avere il bottone per avviare la lettura con il TTS.» */
test('0126 `leggiRisposta`: il 🔊 accanto alla domanda, alla risposta e a ogni criterio (Meta)', () => {
  const { SV, document, detti } = caricaConVoce();
  const h = document.createElement('div'); document.body.appendChild(h);
  const st = { fase: 'rispondi', risposte: { a1: { testo: 'Perché è meno denso' } } };
  SV.monta(h, { pool: aperte(), cfg: { minimo: 1 }, stato: st, senzaAree: true, criteri: true, confermo: true, leggiRisposta: true, onCambia() { }, onConsegna() { } });
  const tts = () => h.querySelectorAll('.tts');
  assert.equal(tts().length, 2, 'domanda e risposta');
  /* gate del 26/10 (Giacomo): «Il testo della domande della modalità 'meta' deve avere la stessa dimensione dei testi
     delle domande della modalità semplice» — la stessa veste (`MappAIQuizMcView.domanda`), col suo 🔊 */
  assert.ok(h.querySelector('.q-head .q-testo'), 'la domanda nella veste di Semplice');
  assert.equal(h.querySelectorAll('.sc-dom').length, 0);
  /* «i bottoni per il TTS devono avere un frame uguale a quello che hanno nella modalià semplice e che è uguale anche
     a quello dei quiz a risposta multipla» — la classe `tts` dentro un `.qmc` */
  assert.ok(h.querySelector('.sc-voce-riga.qmc > .tts'), 'il 🔊 della risposta con la cornice del quiz');
  tts()[0].onclick({ stopPropagation() { } });
  tts()[1].onclick({ stopPropagation() { } });
  assert.deepEqual(detti, ['Perché il ghiaccio galleggia?', 'Perché è meno denso'], 'la risposta si legge com\'è scritta');
  bottone(h, 'Confermo').onclick();
  assert.equal(tts().length, 4, 'più uno per criterio');
  /* gate del 26/10 (Giacomo): «modifca la frase 'Che cosa c'è nella tua riposta? Spunta ciò che hai scritto' in 'Clicca sui
     concetti importanti che hai usato anche tu.'» — con `confermo` */
  assert.ok(h.querySelectorAll('.sc-lbl').map(x => x.textContent).includes('Clicca sui concetti importanti che hai usato anche tu.'));
  tts()[2].onclick({ stopPropagation() { } });
  assert.equal(detti[2], 'densità minore');
});

test('0126 `leggiRisposta`: in Semplice la domanda ha già il suo 🔊; risposta e criteri da leggere lo prendono', () => {
  const { SV, document, detti } = caricaConVoce();
  const h = document.createElement('div'); document.body.appendChild(h);
  SV.monta(h, { pool: aperte(), cfg: { semplice: true }, stato: { risposte: { a1: { testo: 'Galleggia', criteriLetti: true } } }, criteri: 'leggi', confermo: true, leggiRisposta: true, onCambia() { }, onConsegna() { } });
  assert.equal(h.querySelectorAll('.q-head .tts').length, 1, 'il 🔊 della domanda, quello del quiz LIVE');
  assert.equal(h.querySelectorAll('.sc-tts').length, 3, 'la risposta e i due criteri');
  assert.equal(h.querySelectorAll('.qmc > .sc-tts.tts').length, 3, 'con la stessa cornice');
  assert.equal(h.querySelectorAll('.sc-crit li').length, 2);
  h.querySelectorAll('.sc-crit .sc-tts')[1].onclick({ stopPropagation() { } });
  assert.deepEqual(detti, ['struttura del cristallo']);
});

test('0126: senza `leggiRisposta` nessun 🔊 in più nella risposta (il LIVE)', () => {
  const { SV, document } = carica();
  const h = document.createElement('div'); document.body.appendChild(h);
  SV.monta(h, { pool: aperte(), cfg: { minimo: 1 }, stato: { fase: 'rispondi', risposte: { a1: { testo: 'x', criteriVisti: true } } }, senzaAree: true, criteri: true, onCambia() { }, onConsegna() { } });
  assert.equal(h.querySelectorAll('.sc-tts').length, 0);
  assert.equal(h.querySelectorAll('.sc-voce-riga').length, 0);
});

test('0126: le due etichette nuove del 🔊 in inglese', () => {
  const en = leggi('public/traduzioni/en_translations.js');
  assert.ok(/sc_ascolta_risposta:/.test(en) && /sc_ascolta_criterio:/.test(en));
});

/* gate del 26/10 (Giacomo): «il bottone 'Confermo' ha un problema di spaziatura verticale perché non ha più il padding
   dalla text input area. Il bottone confermo deve avere un padding rispetto alla text input area anche nella UI per le
   risposte della modalità 'semplice'.» */
test('0126 `leggiRisposta`: «Confermo» staccato dalla riga della casella; i 🔊 delle domande da scegliere con la cornice', () => {
  const { SV } = carica();
  assert.ok(/\.sc-voce-riga \+ \.sc-go\{[^}]*margin-top:12px/.test(SV.CSS), 'lo spazio fra la casella e il bottone');
  const { host } = montaIpad();
  assert.equal(host.querySelectorAll('.sc-q.qmc > .tts.sc-tts').length, 2, 'le domande da scegliere: la cornice del quiz');
});
