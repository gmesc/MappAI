'use strict';
/*
 * 0065 (ADR 0004 rev. 3) — nei giri per fase Infomaniak la voce va a Google con la
 * chiave Google, e solo lei; senza chiave Google la voce si spegne con un avviso
 * rosso e il giro continua. Il dossier delle foto si genera con le fasi accese.
 *
 * Moduli veri in una vm (`tools/smoke/modelli-nei-flussi.js`: pipeline, giro,
 * trasporto Infomaniak e `electronAPI` finto che registra ogni `generateGemini` e
 * ogni `generateInfomaniak`). CREA è il bento vero (`mappai-costruisci-manifesto.js`
 * + `mappai-bento-composizione.js`) su un DOM cheerio.
 * ⚠️ Con cheerio si asserisce solo su booleani, testi e attributi: un `assert` che
 * fallisce su un elemento del DOM finto fa girare Node all'infinito.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');
const { runtime, B1, GOLD, graph } = require('../tools/smoke/modelli-nei-flussi.js');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const TOKEN_INFO = 'secret-info-a';            // il token Infomaniak di prova del banco
const CHIAVE_GOOGLE = 'AIza-prova-google-0065';
const TESTO_AVVISO = 'La voce naturale usa Google: manca la chiave Google. La sintesi uscirà senza voce. Inseriscila in Impostazioni AI › Google Gemini.';
const TESTO_RIGA = 'La voce si fa con Google: il testo della sintesi esce dalla Svizzera.';

/* ── Il giro: mappa e materiali su Infomaniak; Google risponde solo come voce ── */
function chatGiro(c) {
    if (c.provider === 'google') {
        return B1.reply(c, { candidates: [{ content: { parts: [{ inlineData: {
            mimeType: 'audio/L16;codec=pcm;rate=24000', data: Buffer.alloc(4800).toString('base64') } }] }, finishReason: 'STOP' }] });
    }
    const text = c.payload.messages.map(m => m.content).join('\n');
    const value = c.payload.model === 'mappa-test'
        ? (/Analizza le fonti testuali/.test(text) ? GOLD
            : JSON.stringify({ ...graph(), enrichedNodes: graph().nodes, communities: [{ id: 1, name: 'Resistenza', summary: GOLD }] }))
        : /"front"|FLASHCARD_GENERATOR/.test(text) ? JSON.stringify([{ front: 'In quale unità si misura la resistenza?', back: 'In ohm.' }]) : GOLD;
    return B1.reply(c, { choices: [{ message: { content: value }, finish_reason: 'stop' }] });
}
function giro(values = {}) {
    const h = runtime({ chat: chatGiro, values });
    /* la sintesi divide il documento in blocchi con DOMParser, e la voce passa da
       Blob e FileReader: nel browser ci sono, nella vm si danno i minimi */
    h.window.DOMParser = function () {
        this.parseFromString = () => ({ querySelector: sel => sel === '.bs-body'
            ? { querySelectorAll: q => /h3/.test(q) ? [{ textContent: GOLD }] : [] } : null });
    };
    h.window.Blob = Blob;
    h.window.FileReader = function () {
        this.readAsDataURL = blob => { blob.arrayBuffer().then(b => {
            this.result = 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + Buffer.from(b).toString('base64');
            if (this.onload) this.onload(); if (this.onloadend) this.onloadend();
        }, e => { if (this.onerror) this.onerror(e); }); };
    };
    h.load('public/js/mappai-branch-synthesis.js'); h.load('public/js/mappai-print-dossier.js');
    return h;
}
const google = h => h.calls.filter(c => c.provider === 'google');

test('voce, fasi accese, profilo Infomaniak: avvia non rifiuta più la voce', () => {
    const h = giro();
    let errore = '';
    try { h.window.MappAIModelli.avvia({ nuovo: true, config: { synthesis: { audio: true } } }); }
    catch (e) { errore = String(e && e.message); }
    assert.equal(errore, '', 'avvia ha rifiutato la voce: ' + errore);
});

test('voce con chiave Google: la sola richiesta a Google è la voce, con la chiave Google e senza il token Infomaniak', async () => {
    const h = giro({ gemini_api_key: CHIAVE_GOOGLE });
    await h.window.MappAIPipeline.run({ synthesis: { audio: true } });
    const m = h.manifest();
    assert.equal(!!m, true, h.logs.join('\n'));
    assert.equal(m.steps.D.status, 'done', h.logs.join('\n'));
    assert.equal(m.config.synthesis.audio, true);
    assert.equal(m.steps.D.audioNote === undefined, true, String(m.steps.D.audioNote));
    const g = google(h);
    assert.equal(g.length > 0, true, 'nessuna richiesta di voce');
    assert.equal(g.every(c => /tts/.test(c.model) && c.apiKey === CHIAVE_GOOGLE), true);
    const inviato = JSON.stringify(g);
    assert.equal(inviato.includes(TOKEN_INFO), false);
    assert.equal(inviato.includes(TOKEN_INFO.slice(0, 6)), false);
    // mappa e materiali restano sul giro svizzero
    assert.equal(h.calls.filter(c => c.provider === 'infomaniak').length > 0, true);
    assert.equal(h.calls.filter(c => c.provider === 'infomaniak').every(c => c.apiKey === TOKEN_INFO), true);
    // ADR 0014: nessun valore di chiave in messaggi e log
    assert.equal(h.logs.join('\n').includes(CHIAVE_GOOGLE), false);
});

/* Il via di CREA: `_startFromModal` legge il bento (gli stessi id) e passa a `run`. */
function via(h) {
    const el = (checked, value = '') => ({ checked, value, disabled: false, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        querySelector: () => null, querySelectorAll: () => [], getAttribute: () => null, setAttribute() {}, addEventListener() {} });
    Object.assign(h.elements, { 'mn-bento': el(false), 'mp-syn-on': el(true), 'mp-syn-audio': el(true) });
    const toast = [], partiti = [];
    h.window.showToast = (m, tipo) => { toast.push({ m: String(m), tipo }); h.logs.push(String(m)); };
    h.window.MappAIPipeline.run = (cfg, o) => { partiti.push(JSON.parse(JSON.stringify(cfg))); return Promise.resolve(o); };
    h.window.MappAIPipeline._startFromModal();
    return { toast, partiti };
}

test('voce senza chiave Google, fasi accese: voce spenta, toast rosso, nessuna generateGemini, il giro parte', () => {
    const h = giro();
    const { toast, partiti } = via(h);
    assert.equal(partiti.length, 1, JSON.stringify(toast));
    assert.equal(partiti[0].synthesis.audio, false);
    assert.equal(toast.some(x => x.tipo === 'error' && x.m === TESTO_AVVISO), true, JSON.stringify(toast));
    assert.equal(google(h).length, 0);
});

test('voce con chiave Google, fasi accese: il via tiene la voce, niente avviso', () => {
    const h = giro({ gemini_api_key: CHIAVE_GOOGLE });
    const { toast, partiti } = via(h);
    assert.equal(partiti.length, 1, JSON.stringify(toast));
    assert.equal(partiti[0].synthesis.audio, true);
    assert.equal(toast.some(x => x.tipo === 'error'), false, JSON.stringify(toast));
});

test('voce senza chiave Google, fasi spente: lo stesso avviso rosso', () => {
    const h = giro({ mappai_multimodello: '0' });
    const { toast, partiti } = via(h);
    assert.equal(partiti.length, 1, JSON.stringify(toast));
    assert.equal(partiti[0].synthesis.audio, false);
    assert.equal(toast.some(x => x.tipo === 'error' && x.m === TESTO_AVVISO), true, JSON.stringify(toast));
});

test('voce senza chiave Google, dal giro fino in fondo: la sintesi esce senza voce e Google non riceve niente', async () => {
    const h = giro();
    const { partiti } = via(h);
    const h2 = giro();
    await h2.window.MappAIPipeline.run(partiti[0]);
    const m = h2.manifest();
    assert.equal(!!m, true, h2.logs.join('\n'));
    assert.equal(m.steps.D.status, 'done', h2.logs.join('\n'));
    assert.equal(google(h2).length, 0);
});

/* ── Il dossier delle foto ──────────────────────────────────────────────────── */
const SCHEDA = { titolo: 'Manifesto del 1914', identita: { genere: 'Manifesto', autore: 'Anonimo' }, osservazione: { descrizione: GOLD } };

test('dossier, fasi accese: avvia non lancia modelli_text_only', () => {
    const h = giro();
    let errore = '';
    try { h.window.MappAIModelli.avvia({ nuovo: true, config: { dossier: SCHEDA } }); }
    catch (e) { errore = String(e && e.message); }
    assert.equal(errore, '', 'avvia ha rifiutato il dossier: ' + errore);
});

test('dossier, fasi accese: giro.iniziaMappa() prima di _creaLaCartella e di ogni giro.verifica()', async () => {
    const h = giro();
    h.window.MappAIVisioneCore = require('../public/js/mappai-visione-core.js');
    /* spia sull'ordine: `MappAIModelli` è congelato, ma `window.MappAIModelli` si
       sostituisce; il giro spiato delega al giro vero */
    const vero = h.window.MappAIModelli, ordine = h.ordine = [];
    h.window.MappAIModelli = Object.assign({}, vero, { avvia(o) {
        const g = vero.avvia(o); if (!g) return g;
        return Object.assign({}, g, {
            iniziaMappa() { ordine.push({ evento: 'iniziaMappa', dossier: h.state.db.nodes.some(n => n.id === 'fonte_0') }); return g.iniziaMappa(); },
            verifica() { ordine.push({ evento: 'verifica' }); return g.verifica(); }
        });
    } });
    await h.window.MappAIPipeline.run({ dossier: SCHEDA, quiz: { types: ['flashcards'], perBranch: 1 } });
    const eventi = ordine.map(o => o.evento);
    assert.equal(h.logs.some(l => /progetto aperto è cambiato|non appartiene al giro|accetta fonti testuali/.test(l)), false, h.logs.join('\n'));
    const m = h.manifest();
    assert.equal(!!m, true, h.logs.join('\n'));
    assert.equal(m.steps.A.status, 'done', h.logs.join('\n'));
    assert.equal(m.steps.B.status, 'done', h.logs.join('\n'));
    assert.equal(eventi[0], 'iniziaMappa', eventi.join(' > '));
    assert.equal(ordine[0].dossier, true, 'iniziaMappa prima della sostituzione di st.db');
    assert.equal(eventi.indexOf('verifica') > 0, true, eventi.join(' > '));
    assert.equal(eventi.indexOf('iniziaMappa') < eventi.indexOf('adotta'), true, eventi.join(' > '));
    assert.equal(eventi.indexOf('iniziaMappa') < eventi.indexOf('saveVault'), true, eventi.join(' > '));
    // tutto il giro resta su Infomaniak
    assert.equal(h.calls.length > 0 && h.calls.every(c => c.provider === 'infomaniak'), true);
});

/* ── L'avviso in CREA: il bento vero su un DOM cheerio ─────────────────────── */
function crea(chiaveGoogle) {
    const $ = cheerio.load('<html><head></head><body><div id="generation-details-card"></div></body></html>');
    const cache = new WeakMap(), ascolti = [];
    const bool = (n, k) => ({ get() { return n.attribs[k] !== undefined; }, set(v) { if (v) $(n).attr(k, ''); else $(n).removeAttr(k); } });
    function wrap(n) {
        if (!n) return null;
        if (cache.has(n)) return cache.get(n);
        const e = {
            node: n, style: {}, dataset: {},
            classList: {
                add: (...c) => { $(n).addClass(c.join(' ')); },
                remove: (...c) => { c.forEach(x => $(n).removeClass(x)); },
                toggle: (c, force) => { const on = force === undefined ? !$(n).hasClass(c) : !!force; if (on) $(n).addClass(c); else $(n).removeClass(c); return on; },
                contains: c => $(n).hasClass(c)
            },
            get innerHTML() { return $(n).html(); }, set innerHTML(v) { $(n).html(String(v)); },
            get textContent() { return $(n).text(); }, set textContent(v) { $(n).text(String(v)); },
            get id() { return $(n).attr('id') || ''; }, set id(v) { $(n).attr('id', String(v)); },
            get value() { return $(n).attr('value') || ''; }, set value(v) { $(n).attr('value', String(v)); },
            get type() { return $(n).attr('type') || ''; },
            get title() { return $(n).attr('title') || ''; }, set title(v) { $(n).attr('title', String(v)); },
            getAttribute: k => { const v = $(n).attr(k); return v === undefined ? null : v; },
            setAttribute: (k, v) => { $(n).attr(k, String(v)); },
            removeAttribute: k => { $(n).removeAttr(k); },
            querySelector: s => wrap($(n).find(s)[0]),
            querySelectorAll: s => $(n).find(s).toArray().map(wrap),
            contains: c => !!c && (c.node === n || $(n).find(c.node).length > 0),
            closest: s => wrap($(n).closest(s)[0]),
            appendChild: c => { $(n).append(c.node); return c; },
            addEventListener: (tipo, fn) => { ascolti.push({ n, tipo, fn }); }, remove: () => { $(n).remove(); }
        };
        for (const k of ['hidden', 'checked', 'disabled']) Object.defineProperty(e, k, bool(n, k));
        cache.set(n, e);
        return e;
    }
    const documentElement = wrap($('html')[0]);
    const document = {
        readyState: 'complete', documentElement, body: wrap($('body')[0]),
        getElementById: id => wrap($('[id]').toArray().find(el => el.attribs.id === id)),
        createElement: tag => wrap($('<' + tag + '></' + tag + '>')[0]),
        querySelector: s => wrap($(s)[0]), querySelectorAll: s => $(s).toArray().map(wrap),
        addEventListener() {}, removeEventListener() {}
    };
    const storage = new Map(Object.entries(chiaveGoogle ? { gemini_api_key: chiaveGoogle, mappai_bento_default_v1: '1' } : { mappai_bento_default_v1: '1' }));
    const w = {
        console: { log() {}, warn() {}, error() {}, info() {} }, document,
        setTimeout: () => 0, clearTimeout() {},
        localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
        t: (_k, f) => f, safeCreateIcons() {}, showToast() {}
    };
    w.window = w;
    vm.createContext(w);
    w.MappAIBento = require('../public/js/mappai-bento-composizione.js');
    vm.runInContext(read('public/js/mappai-costruisci-manifesto.js'), w, { filename: 'mappai-costruisci-manifesto.js' });
    w.MappAICostruisci.montaBento();
    const riga = () => {
        const r = document.getElementById('mn-voce-riga');
        return r ? { c: true, hidden: !!r.hidden, rosso: r.classList.contains('mn-voce-avviso'), testo: String(r.textContent) } : { c: false };
    };
    /* spuntare a mano: il DOM cambia e il bento riceve `change` (il gesto vero) */
    const spunta = (id, on) => {
        document.getElementById(id).checked = on;
        const target = document.getElementById(id);
        ascolti.filter(a => a.tipo === 'change').forEach(a => a.fn({ target }));
    };
    return { riga, spunta, esiste: id => !!document.getElementById(id), storage };
}

test('CREA: la riga sotto «Voce naturale (audio)» — rossa senza chiave, normale con la chiave, assente a spunta spenta (o senza sintesi)', () => {
    const senza = crea('');
    assert.equal(senza.esiste('mp-syn-audio'), true, 'la spunta della voce non è montata');
    assert.equal(senza.riga().c, true, 'la riga della voce non è montata');
    // spunta spenta: nessuno dei due
    assert.equal(senza.riga().hidden, true);
    assert.equal(senza.riga().rosso, false);
    // voce spuntata ma sintesi spenta: la voce non si genera, niente riga
    senza.spunta('mp-syn-audio', true);
    assert.equal(senza.riga().hidden, true);
    assert.equal(senza.riga().rosso, false);
    // sintesi e voce accese, senza chiave: l'avviso rosso, col testo del toast
    senza.spunta('mp-syn-on', true);
    assert.equal(senza.riga().hidden, false);
    assert.equal(senza.riga().rosso, true);
    assert.equal(senza.riga().testo, TESTO_AVVISO);
    // spunta di nuovo spenta: sparisce
    senza.spunta('mp-syn-audio', false);
    assert.equal(senza.riga().hidden, true);
    assert.equal(senza.riga().rosso, false);

    const con = crea(CHIAVE_GOOGLE);
    con.spunta('mp-syn-on', true);
    con.spunta('mp-syn-audio', true);
    assert.equal(con.riga().hidden, false);
    assert.equal(con.riga().rosso, false);
    assert.equal(con.riga().testo, TESTO_RIGA);
    assert.equal(con.riga().testo.includes(CHIAVE_GOOGLE), false);
    con.spunta('mp-syn-audio', false);
    assert.equal(con.riga().hidden, true);
});

test('CREA: la chiave tolta si vede al ridisegno successivo', () => {
    const c = crea(CHIAVE_GOOGLE);
    c.spunta('mp-syn-on', true);
    c.spunta('mp-syn-audio', true);
    assert.equal(c.riga().hidden, false);
    assert.equal(c.riga().rosso, false);
    c.storage.delete('gemini_api_key');
    c.spunta('mp-qt-mc', true);            // un cambio qualunque nel bento ridisegna
    assert.equal(c.riga().rosso, true);
    assert.equal(c.riga().testo, TESTO_AVVISO);
});

test('CSS e i18n: la classe d\'avviso usa i token rossi; le due chiavi nuove solo in inglese', () => {
    const html = read('public/index.html');
    const layer = html.slice(html.indexOf('@layer components'));
    const regola = (layer.match(/\.mn-voce-avviso\s*\{[^}]*\}/) || [''])[0];
    assert.equal(/var\(--mm-danger\)/.test(regola) && /var\(--mm-danger-soft\)/.test(regola), true, regola);
    const en = read('public/traduzioni/en_translations.js'), it = read('public/traduzioni/it_translations.js');
    for (const k of ['mp_voce_no_google', 'mp_voce_google']) {
        assert.equal(new RegExp('\\b' + k + ':').test(en), true, k);
        assert.equal(new RegExp('\\b' + k + ':').test(it), false, k);
    }
});
