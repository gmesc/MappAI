/* 0131 — Timeline LIVE, «Costruisci»: «Chiudi e apri report» spegneva il server subito dopo `window.open`, e la finestra
   del report trovava la porta chiusa (ERR_CONNECTION_REFUSED, gate dello 0129). Giacomo, 27/10: «Sì, la (a): server acceso
   come il quiz, si spegne con «Chiudi pannello».» E al §9: «Sì a (b), (c) e (d) come raccomandato.» — il clic sullo sfondo non
   chiude più il pannello; dalla sidebar si torna al pannello della Timeline.
   I due moduli girano nel loro contesto, con un DOM finto che conosce solo quello che serve: gli elementi messi nel body,
   e dentro il loro HTML gli `id` e le classi (un elemento finto per ciascuno). */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const leggi = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const LC = require(path.join(ROOT, 'public/js/mappai-live-core.js'));
const attendi = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };

function domFinto() {
    const figli = [];
    function el(tag) {
        const e = {
            tag, id: '', className: '', style: {}, onclick: null, _html: '', _sub: {}, _asc: {},
            addEventListener(tipo, fn) { (e._asc[tipo] = e._asc[tipo] || []).push(fn); },
            removeEventListener() { },
            remove() { const i = figli.indexOf(e); if (i >= 0) figli.splice(i, 1); },
            appendChild() { },
            setAttribute() { }, getAttribute() { return null; },
            querySelectorAll() { return []; },
            querySelector(sel) {
                let m = /^#([\w-]+)$/.exec(sel), re;
                if (m) re = new RegExp('id="' + m[1] + '"');
                else if ((m = /^\.([\w-]+)$/.exec(sel))) re = new RegExp('class="[^"]*\\b' + m[1] + '\\b');
                if (!re || !re.test(e._html)) return null;
                return e._sub[sel] || (e._sub[sel] = el('x'));
            }
        };
        Object.defineProperty(e, 'innerHTML', { get() { return e._html; }, set(v) { e._html = String(v); e._sub = {}; } });
        Object.defineProperty(e, 'textContent', {
            get() { return e._html; },
            set(v) { e._html = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
        });
        return e;
    }
    const document = {
        createElement: el,
        getElementById(id) {
            for (const f of figli) { if (f.id === id) return f; const s = f.querySelector('#' + id); if (s) return s; }
            return null;
        },
        body: { appendChild(c) { figli.push(c); } },
        addEventListener() { }, removeEventListener() { }
    };
    return { document, figli };
}

const INFO = { success: true, port: 8767, token: 'T', adminToken: 'A', urls: ['http://192.168.1.2:8767'], name: 'Prova' };

/* il modulo della Timeline, con MappAILive finto: `launchExternal` fa partire subito la sessione «build» */
function caricaTimeline() {
    const { document, figli } = domFinto();
    const r = { finestre: [], richieste: [], spento: 0, aperti: [], chiudi: [], risposta: { x: new Promise(() => { }), chiudi: Promise.resolve(false) } };
    const w = {
        console: { log() { }, warn() { } },
        document,
        appState: { rootNodeLabel: 'Prova', db: { nodes: [{ id: 'r', level: 0, label: 'Prova' }], timelineAI: [] } },
        MappAITimelineCore: { extractYears: () => [], eventKey: (e) => String(e.anno), buildGaps: () => [] },
        MappAITimeline: { _sourceText: () => '' },
        MappAILive: {
            launchExternal(cls, act, q, timer, extra) { extra.onLaunched(INFO); return Promise.resolve(INFO); },
            chiudiPannello(o) { r.chiudi.push(o); return r.risposta.chiudi; }
        },
        MappAIModal: { open(s) { r.aperti.push(s); return r.risposta.x; } },
        electronAPI: { liveStopSession() { r.spento++; return Promise.resolve({ success: true }); }, liveOpenFolder() { } },
        open(url) { r.finestre.push(url); },
        fetch(url, o) {
            r.richieste.push([url.replace(/^http:\/\/127\.0\.0\.1:\d+/, ''), (o && o.method) || 'GET']);
            const corpo = url.includes('/api/status')
                ? { session: { phase: 'running', mode: 'build' }, proposals: [{ id: 'p1', anno: 1291, evento: 'Patto federale', status: 'approved' }] }
                : { ok: true };
            return Promise.resolve({ status: 200, json: () => Promise.resolve(corpo) });
        },
        setInterval: () => 1, clearInterval() { },
        showToast() { }
    };
    w.window = w;
    vm.runInNewContext(leggi('public/js/mappai-timeline-teacher.js'), w);
    const pannello = () => document.getElementById('tl-live-modal');
    const clic = (id) => { const b = pannello() && pannello().querySelector('#' + id); assert.ok(b && b.onclick, 'nel pannello c\'è #' + id); return b.onclick(); };
    const avvia = () => w.MappAITimelineLive._launchBuild({ name: '1A', students: [] }, [], { bsrc: 'free', timer: 0, maxProposals: 3 });
    return { w, r, figli, pannello, clic, avvia };
}

test('0131: «Chiudi e apri report» chiude la sessione, apre il report e NON spegne il server; il pannello resta', async () => {
    const T = caricaTimeline();
    T.avvia();
    T.clic('tl-close');
    await attendi();
    assert.ok(T.r.richieste.some(([u, m]) => u === '/api/close' && m === 'POST'), 'la sessione si chiude');
    assert.equal(T.r.finestre.length, 1, 'una finestra del report');
    assert.match(T.r.finestre[0], /\/api\/report\?which=workshop&admin=A$/);
    assert.equal(T.r.spento, 0, 'il server resta acceso: la finestra del report deve trovarlo');
    const p = T.pannello();
    assert.ok(p, 'il pannello della Timeline resta aperto');
    assert.ok(p.innerHTML.includes('Report costruzione'), 'c\'è «Report costruzione»');
    assert.ok(p.querySelector('#tl-openfolder'), 'c\'è «Apri cartella»');
    assert.ok(!p.innerHTML.includes('Chiudi e apri report'), 'via «Chiudi e apri report»');
    assert.ok(!p.innerHTML.includes('Proietta sulla LIM'), 'via «Proietta sulla LIM»');
    T.clic('tl-report');
    assert.deepEqual(T.r.finestre, [T.r.finestre[0], T.r.finestre[0]], '«Report costruzione» riapre lo stesso indirizzo');
});

test('0131: a sessione chiusa le proposte restano, senza ✓ e ✗', async () => {
    const T = caricaTimeline();
    T.avvia();
    T.clic('tl-close');
    await attendi();
    const lista = T.pannello().querySelector('#tl-proplist');
    assert.ok(lista && lista.innerHTML.includes('Patto federale'), 'la proposta della classe è ancora lì');
    assert.ok(!/data-approve|data-reject/.test(lista.innerHTML), 'niente ✓ né ✗');
});

test('0131: la × a sessione chiusa chiede «Chiudi pannello» al pannello del quiz; con un no il pannello resta', async () => {
    const T = caricaTimeline();
    T.avvia();
    T.clic('tl-close');
    await attendi();
    T.r.risposta.chiudi = Promise.resolve(false);
    T.clic('tl-x');
    await attendi();
    assert.deepEqual(T.r.chiudi.map(o => !!(o && o.chiusa)), [true], 'una chiamata a MappAILive.chiudiPannello, con la sessione già chiusa');
    assert.ok(T.pannello(), 'con un no il pannello resta');
    T.r.risposta.chiudi = Promise.resolve(true);
    T.clic('tl-x');
    await attendi();
    assert.equal(T.pannello(), null, 'con un sì il pannello sparisce');
    assert.equal(T.r.spento, 0, 'lo spegnimento è del pannello del quiz, non della Timeline');
});

test('0131: la × a sessione aperta offre «Annulla» o «Chiudi sessione», come il quiz', async () => {
    const T = caricaTimeline();
    T.avvia();
    T.r.risposta.x = Promise.resolve({ azione: 'annulla' });
    T.clic('tl-x');
    await attendi();
    assert.equal(T.r.aperti.length, 1);
    assert.deepEqual(T.r.aperti[0].azioni.map(a => a.id), ['annulla', 'chiudi']);
    assert.equal(T.r.aperti[0].titolo, 'La sessione è ancora attiva');
    assert.ok(!T.r.richieste.some(([u]) => u === '/api/close') && T.pannello(), '«Annulla» non chiude niente');
    T.r.risposta.x = Promise.resolve({ azione: 'chiudi' });
    T.clic('tl-x');
    await attendi();
    assert.ok(T.r.richieste.some(([u, m]) => u === '/api/close' && m === 'POST'), '«Chiudi sessione» chiude');
    assert.equal(T.r.finestre.length, 1, 'e apre il report');
    assert.equal(T.r.spento, 0, 'senza spegnere');
    assert.ok(T.pannello().innerHTML.includes('Report costruzione'));
});

test('0131: il clic sullo sfondo non chiude il pannello della Timeline (§9 b)', () => {
    const T = caricaTimeline();
    T.avvia();
    const p = T.pannello();
    (p._asc.click || []).forEach(fn => fn({ target: p }));
    assert.ok(T.pannello(), 'il pannello resta');
});

test('0131: MappAITimelineLive.riaggancia apre il pannello nello stato della sessione', async () => {
    const T = caricaTimeline();
    assert.equal(typeof T.w.MappAITimelineLive.riaggancia, 'function');
    T.w.MappAITimelineLive.riaggancia(INFO, 'running');
    assert.ok(T.pannello().innerHTML.includes('Chiudi e apri report'), 'aperta: «Chiudi e apri report»');
    T.w.MappAITimelineLive.riaggancia(INFO, 'closed');
    await attendi();
    assert.ok(T.pannello().innerHTML.includes('Report costruzione'), 'chiusa: «Report costruzione»');
    assert.ok(!T.pannello().innerHTML.includes('Chiudi e apri report'));
});

/* il modulo del quiz: `chiudiPannello` e il riaggancio dalla sidebar */
function caricaQuiz(modo) {
    const { document } = domFinto();
    const r = { spento: 0, conferme: [], riagganci: [], risposta: true };
    const w = {
        console: { log() { }, warn() { } },
        localStorage: { getItem() { return null; } },
        document,
        appState: { db: { studySets: [], nodes: [{ id: 'r', level: 0, label: 'Prova' }] } },
        MappAILiveCore: LC,
        MappAIModal: { conferma(o) { r.conferme.push(o); return Promise.resolve(r.risposta); }, open() { return new Promise(() => { }); } },
        MappAITimelineLive: { riaggancia(info, fase) { r.riagganci.push([info.port, fase]); } },
        electronAPI: {
            liveSessionInfo: () => Promise.resolve(Object.assign({}, INFO)),
            liveStopSession() { r.spento++; return Promise.resolve({ success: true }); }
        },
        fetch(url) {
            const corpo = url.includes('/api/status') ? { session: { phase: 'closed', mode: modo } } : { ok: true };
            return Promise.resolve({ status: 200, json: () => Promise.resolve(corpo) });
        },
        setTimeout: () => 1, clearTimeout() { }, setInterval: () => 1, clearInterval() { },
        showToast() { }
    };
    w.window = w;
    vm.runInNewContext(leggi('public/js/mappai-live-teacher.js'), w);
    return { w, r, document };
}

test('0131: MappAILive.chiudiPannello — la conferma del quiz; con un sì spegne e azzera, con un no niente', async () => {
    const Q = caricaQuiz('build');
    assert.equal(typeof Q.w.MappAILive.chiudiPannello, 'function');
    Q.w.MappAILiveTeacher.info = Object.assign({}, INFO);
    Q.r.risposta = false;
    assert.equal(await Q.w.MappAILive.chiudiPannello({ chiusa: true }), false);
    await attendi();
    assert.equal(Q.r.spento, 0, 'con un no il server resta');
    assert.ok(Q.w.MappAILiveTeacher.info, 'e la sessione pure');
    assert.equal(Q.r.conferme[0].titolo, 'Chiudere il pannello?');
    assert.equal(Q.r.conferme[0].conferma, 'Chiudi pannello');
    Q.r.risposta = true;
    assert.equal(await Q.w.MappAILive.chiudiPannello({ chiusa: true }), true);
    await attendi();
    assert.equal(Q.r.spento, 1, 'con un sì il server si spegne');
    assert.equal(Q.w.MappAILiveTeacher.info, null, 'e la sessione dopo parte da zero');
});

test('0131: dalla sidebar, una sessione «build» riapre il pannello della Timeline (§9 c)', async () => {
    const Q = caricaQuiz('build');
    await Q.w.openLiveHub();
    await attendi();
    assert.deepEqual(Q.r.riagganci, [[8767, 'closed']]);
    assert.equal(Q.document.getElementById('live-hub-modal'), null, 'non il pannello del quiz');
});

test('0131: dalla sidebar, una sessione quiz riapre il pannello del quiz come prima', async () => {
    const Q = caricaQuiz('quiz');
    await Q.w.openLiveHub();
    await attendi();
    assert.deepEqual(Q.r.riagganci, []);
    assert.ok(Q.document.getElementById('live-hub-modal'), 'il pannello del quiz');
});

test('0131: in inglese le due chiavi nuove; index.html porta il segno dello 0131', () => {
    const en = leggi('public/traduzioni/en_translations.js');
    assert.match(en, /tl_rep_build: "Construction report",/);
    assert.match(en, /tl_x: "Close",/);
    const h = leggi('public/index.html');
    for (const v of ['js/mappai-live-teacher.js?v=0119-0122-20261022-4b1-0122-4b2-0127-7-0131', 'js/mappai-timeline-teacher.js?v=ritocchi-0087-20261013-2-0122-4b2-0127-0131',
        // Giacomo, 28/10: «Sì: aggiungi -0131 al ?v= del dizionario» (invariante 5: il segno nello stesso giro del file)
        'traduzioni/en_translations.js?v=0122-20261021-1-0123-2-0122-4b2-2-0124-3-0126-1-0130-1-0128-1-0131']) {
        assert.ok(h.includes(v), v);
    }
});
