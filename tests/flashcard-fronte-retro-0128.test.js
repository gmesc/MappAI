'use strict';
/*
 * Packet 0128 (lotto A) — il foglio delle flashcard: il pieghevole che non cambia,
 * il fronte/retro rifinito, il foglio di prova; e (allargamento 1) l'interlinea e
 * lo spazio fra le parole di flashcard e descrizioni del foglio dei nodi.
 *
 * I generatori VERI (`printFlashcardSheet`, `printAllNodeLabels` di
 * mappai-print-dossier.js, con la geometria di mappai-print-layout.js e il core
 * del foglio dei nodi) girano in un contesto `vm` con un jsPDF finto che registra
 * ogni operazione: testo e posizione, corpo, colori, rettangoli, linee. `toDisk`
 * restituisce il registro al posto del PDF.
 *
 * L'IMPRONTA è lo sha256 del registro, presa il 26/10/2026 sul codice di main
 * (`1a2942de`) prima di ogni modifica. Con la tipografia di allora fissata a mano
 * (interlinea 1,35, nessuno spazio in più fra le parole, il passo fisso di 6,35 mm
 * delle descrizioni) e l'interruttore del fronte/retro spento, i fogli devono
 * uscire identici: le parti nuove si aggiungono, non spostano niente.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

/* `MAPPAI_IMPRONTA_ROOT`: solo per rifare le impronte di MAIN su una copia di main (`git archive 1a2942de public/js`) */
const ROOT = process.env.MAPPAI_IMPRONTA_ROOT || path.join(__dirname, '..');
const JS = (f) => fs.readFileSync(path.join(ROOT, 'public/js', f), 'utf8');

/* ── il jsPDF finto: registra CIÒ CHE SI DISEGNA, e misura come Courier (0,6 em) ─────────────
   Ogni testo, linea o rettangolo entra nel registro con lo stato in vigore in quel momento (carattere,
   corpo, colori, spessore, tratteggio, spaziatura, matrice); i cambi di stato da soli no: una misura fatta
   cambiando carattere non sposta l'impronta, un testo disegnato in un altro corpo sì.
   `o.grassetto`: la larghezza del grassetto in em (di serie 0,6, come il tondo: Space Mono e Courier
   hanno le due forme larghe uguali; un carattere proporzionale come Atkinson no) */
function r3(v) { return typeof v === 'number' ? Math.round(v * 1000) / 1000 : v; }
const r3a = (a) => Array.from(a || []).map((x) => (Array.isArray(x) ? x.map(r3) : r3(x)));
function jsPDFFinto(o) {
    const PT2MM = 25.4 / 72, GRASSETTO = (o && o.grassetto) || 0.6;
    class Doc {
        constructor(opz) {
            this.ops = [['new', opz && opz.orientation, opz && opz.format]];
            this.st = { font: '', stile: '', fs: 16, testo: [], tratto: [], fondo: [], spessore: 0, dash: [], cs: 0, ctm: null, gs: '' };
            this.pila = []; this.pages = 1;
            const self = this;
            this.internal = { scaleFactor: 72 / 25.4, pageSize: { getWidth() { return 210; }, getHeight() { return 297; } } };
            this.Matrix = function (a, b, c, d, e, f) { this.m = [a, b, c, d, e, f].map(r3); };
            this.GState = function (g) { this.o = g; };
            /* un metodo che il registro non conosce si registra col suo nome: il foglio non cade */
            return new Proxy(this, {
                get(t, k) {
                    if (k in t || typeof k === 'symbol') return t[k];
                    return (...a) => { t.ops.push([k].concat(r3a(a))); return self; };
                }
            });
        }
        get stile() { return this.st.stile; }
        segno() { const s = this.st; return [s.tratto, s.spessore, s.dash, s.fondo, s.gs]; }
        setFont(n, st) { this.st.font = n; this.st.stile = st || 'normal'; return this; }
        setFontSize(pt) { this.st.fs = pt; return this; }
        getFontSize() { return this.st.fs; }
        setCharSpace(v) { this.st.cs = r3(v); return this; }
        setTextColor() { this.st.testo = r3a(arguments); return this; }
        setDrawColor() { this.st.tratto = r3a(arguments); return this; }
        setFillColor() { this.st.fondo = r3a(arguments); return this; }
        setLineWidth(w) { this.st.spessore = r3(w); return this; }
        setLineDashPattern(d, f) { this.st.dash = [r3a(d), r3(f)]; return this; }
        line() { this.ops.push(['line'].concat(r3a(arguments), [this.segno()])); return this; }
        rect() { this.ops.push(['rect'].concat(r3a(arguments), [this.segno()])); return this; }
        roundedRect() { this.ops.push(['roundedRect'].concat(r3a(arguments), [this.segno()])); return this; }
        text(t, x, y, opz) {
            const s = this.st;
            this.ops.push(['text', Array.isArray(t) ? t.join('\n') : t, r3(x), r3(y), opz ? JSON.stringify(opz) : '', [s.font, s.stile, s.fs, s.testo, s.cs, s.ctm, s.gs]]);
            return this;
        }
        addPage() { this.pages++; this.ops.push(['addPage'].concat(r3a(arguments))); return this; }
        getNumberOfPages() { return this.pages; }
        getTextWidth(t) { return String(t).length * (this.st.stile === 'bold' ? GRASSETTO : 0.6) * this.st.fs * PT2MM; }
        splitTextToSize(text, w) {
            const out = []; let cur = '';
            String(text).split(/\s+/).filter(Boolean).forEach((wd) => {
                const n = cur ? cur + ' ' + wd : wd;
                if (this.getTextWidth(n) <= w || !cur) cur = n; else { out.push(cur); cur = wd; }
            });
            if (cur) out.push(cur);
            return out;
        }
        saveGraphicsState() { this.pila.push(this.st.ctm); return this; }
        restoreGraphicsState() { this.st.ctm = this.pila.length ? this.pila.pop() : null; return this; }
        setCurrentTransformationMatrix(m) { this.st.ctm = m.m || null; return this; }
        setGState(g) { this.st.gs = JSON.stringify(g.o); return this; }
        addFileToVFS() { return this; }
        addFont() { return this; }
        output() { return 'data:application/pdf;base64,' + Buffer.from(JSON.stringify(this.ops)).toString('base64'); }
        save(n) { this.ops.push(['save-file', n]); return this; }
    }
    return Doc;
}

/* ── il contesto: i moduli veri, gli stub del minimo indispensabile ─────────── */
function contesto(store, doc) {
    const mem = new Map(Object.entries(store || {}));
    const ctx = {
        console: { log() { }, warn() { }, error() { } },
        localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) },
        showToast() { }, showAlert() { },
        t: (k, f) => f,
        cleanLabel: (s) => String(s || '').replace(/[*_#]/g, '').trim(),
        document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
        jspdf: { jsPDF: jsPDFFinto(doc) },
        appState: { db: { nodes: [], links: [] }, rootNodeLabel: '' },
        setTimeout, clearTimeout
    };
    ctx.window = ctx; ctx.self = ctx;
    vm.createContext(ctx);
    ['mappai-print-layout.js', 'mappai-docedit-core.js', 'mappai-nodesheet-core.js', 'mappai-quiz-print.js', 'mappai-print-dossier.js']
        .forEach((f) => vm.runInContext(JS(f), ctx, { filename: f }));
    return ctx;
}
/* la tipografia di main, fissata a mano: le impronte valgono a token fermi */
function tipografiaDiMain(ctx) {
    ctx.MappAIPrintLayout.setModel({ flash: { type: { lineH: 1.35, wordSpace: 0 } } }, false);
    const NS = ctx.MappAINodeSheet;
    if (typeof NS.descPasso === 'function') NS.descPasso = () => 6.35;
    if ('DESC_WORD_EM' in NS) NS.DESC_WORD_EM = 0;
    /* i corpi delle schede di main (0128 li alza: 13/15 nel 2×2, 16/18 nel 2×1); FMT è l'oggetto del core */
    Object.assign(NS.FMT['2x2'], { descPt: 11, kwPt: 13 });
    Object.assign(NS.FMT['2x1'], { descPt: 13, kwPt: 15 });
}
function registro(r) {
    assert.ok(r && r.ok && r.base64, 'il foglio esce: ' + JSON.stringify(r && { ok: r.ok, error: r.error }));
    return JSON.parse(Buffer.from(String(r.base64).replace(/^data:[^,]*,/, ''), 'base64').toString('utf8'));
}
const impronta = (ops) => crypto.createHash('sha256').update(JSON.stringify(ops)).digest('hex').slice(0, 16);

/* ── i contenuti: il caso peggiore, gli stessi per ogni foglio ─────────────── */
const CORTE = [
    { question: 'Che cos\'è la fotosintesi?', answer: 'Il modo in cui le piante fanno gli zuccheri con la luce.' },
    { question: 'Dove avviene?', answer: 'Nei cloroplasti delle foglie.' },
    { front: 'Che cosa assorbe la clorofilla?', back: 'La luce rossa e la luce blu.' },
    { question: 'Che gas esce dalle foglie?', answer: 'L\'ossigeno.' }
];
const LUNGHE = [
    {
        question: 'Perché la Svizzera, pur essendo circondata da Stati in guerra fra il 1939 e il 1945, riuscì a mantenere formalmente la propria neutralità armata?',
        answer: 'La neutralità fu mantenuta grazie a una combinazione di deterrenza militare e di concessioni economiche. Il generale Guisan concentrò l\'esercito nel Réduit alpino, rendendo un\'eventuale invasione lunga e costosa per chiunque.',
        explanation: 'Il prezzo furono le forniture industriali e i transiti ferroviari concessi all\'Asse attraverso il Gottardo e il Sempione, che la storiografia ha discusso a lungo.'
    },
    { question: 'Che cosa fu il Réduit alpino?', answer: 'La fortificazione delle Alpi in cui Guisan concentrò l\'esercito nel luglio del 1940, dopo la caduta della Francia.', explanation: 'Fu annunciato al Rütli il 25 luglio 1940.' },
    { question: 'Chi guidò l\'esercito svizzero?', answer: 'Il generale Henri Guisan.', explanation: '' },
    { question: 'Che cosa significa «neutralità perpetua»?', answer: 'L\'impegno a non partecipare a nessuna guerra fra altri Stati, riconosciuto dal Congresso di Vienna nel 1815.', explanation: 'Non è disarmo: la Svizzera deve difendersi da sola.' },
    { question: 'Precipitevolissimevolmente è una parola lunghissima: dove va a capo?', answer: 'Nessunissimamente-spezzabile senza trattini, perché il motore la deve spezzare da sé.', explanation: '' },
    { question: 'Una domanda breve?', answer: 'Sì.', explanation: 'Mostra lo spazio che resta vuoto.' }
];
const UNA = [{ question: 'Una carta sola: che cosa resta sulla pagina?', answer: 'Tre posti vuoti, senza linee di taglio.', explanation: '' }];
const NOVE = LUNGHE.concat(CORTE.slice(0, 3));

const NODI = {
    db: {
        rootNodeLabel: 'Sistema Albero',
        nodes: [
            { id: 'r', label: 'Sistema Albero', level: 0, desc: 'L\'albero è una pianta legnosa perenne con un fusto principale, il tronco, che si ramifica in alto.' },
            { id: 'a', label: 'Radici', level: 1, desc: 'Le radici ancorano la pianta al terreno e assorbono acqua e sali minerali dal suolo; attraverso i peli radicali la superficie di assorbimento cresce di molte volte, e la linfa grezza sale poi nel fusto fino alle foglie.' },
            { id: 'b', label: 'Fusto', level: 1, desc: 'Il fusto sostiene la chioma e trasporta la linfa: nello xilema sale quella grezza, nel floema scende quella elaborata. Gli anelli di accrescimento raccontano l\'età dell\'albero.' },
            { id: 'c', label: 'Foglie', level: 1, desc: 'Nelle foglie avviene la fotosintesi clorofilliana: la clorofilla dei cloroplasti cattura la luce e, con acqua e anidride carbonica, produce zuccheri e libera ossigeno attraverso gli stomi.' },
            { id: 'd', label: 'Fotosintesi', level: 2, desc: 'Precipitevolissimevolmente: una parola che non entra nella riga e va sillabata.' },
            { id: 'e', label: 'Stomi', level: 2, desc: 'Aperture.' }
        ],
        links: [{ source: 'r', target: 'a' }, { source: 'r', target: 'b' }, { source: 'r', target: 'c' }, { source: 'c', target: 'd' }, { source: 'c', target: 'e' }]
    },
    rootNodeLabel: 'Sistema Albero'
};

async function flash(ctx, items, extra) {
    return registro(await ctx.printFlashcardSheet(Object.assign({ items, title: 'Prova 0128', mapName: 'Sistema Albero', toDisk: {} }, extra || {})));
}
async function nodi(ctx, fmt, layout) {
    ctx.appState = JSON.parse(JSON.stringify(NODI));
    return registro(await ctx.printAllNodeLabels({ depth: 'all', fmt, layout, bg: 'none', tuned: false, causal: false, toDisk: { vaultPath: '' } }));
}

/* Le impronte di main (1a2942de), prese il 27/10/2026 con questo stesso banco sul codice di main estratto da git
   (`git archive 1a2942de public/js`, poi `MAPPAI_IMPRONTA_ROOT=<copia>`): 13 su 13 uguali a quelle del ramo a
   tipografia di main. */
const MAIN = {
    'piega 2x2v corte': '933e5aa83be67769',
    'piega 2x2v lunghe': 'c653d8df8f77c5a7',
    'piega 2x2v una': '972114886a84bbc9',
    'piega 2x2v nove': 'c3e000bdf0190640',
    'piega 2x1 lunghe': '864e1f011bf619d0',
    'piega 4x3 nove': 'a5d8680bc8238aa5',
    'piega 2x2 lunghe': '6576d80c1ccf8174',
    'retro-di-prima 2x2v lunghe': '59d35b6e07235422',
    'retro-di-prima 2x2v nove': '45c8a4e8d51021d6',
    'nodi 2x2 card': '0db278593c346cfe',
    'nodi 2x1 card': 'd675b93f6952a959',
    'nodi 3x4 title': '92453c78c02db9b2',
    'nodi 2x2 summary': 'f595e780ebdc8045'
};
/* Allargamento 6 (Giacomo, 27/10: «il colore della quadrettatura e delle linee il 10% più saturo»): le righe guida
   del foglio dei nodi passano dal grigio #d2d2d2 al blu-grigio #c7d5e5 SEMPRE, senza interruttore. Per l'impronta si
   rimette il colore di main: tutto il resto del foglio deve restare identico. */
function righeDiMain(ops) {
    let n = 0;
    const out = ops.map((o) => {
        if (o[0] !== 'line' || JSON.stringify(o[o.length - 1][0]) !== '[199,213,229]') return o;
        n++;
        const s = o[o.length - 1].slice(); s[0] = [210, 210, 210];
        return o.slice(0, -1).concat([s]);
    });
    assert.ok(n > 0, 'le righe guida ci sono, col colore nuovo');
    return out;
}
async function tutte(store) {
    const ctx = contesto(store);
    tipografiaDiMain(ctx);
    return {
        'piega 2x2v corte': impronta(await flash(ctx, CORTE)),
        'piega 2x2v lunghe': impronta(await flash(ctx, LUNGHE)),
        'piega 2x2v una': impronta(await flash(ctx, UNA)),
        'piega 2x2v nove': impronta(await flash(ctx, NOVE)),
        'piega 2x1 lunghe': impronta(await flash(ctx, LUNGHE, { fmt: '2x1' })),
        'piega 4x3 nove': impronta(await flash(ctx, NOVE, { fmt: '4x3' })),
        'piega 2x2 lunghe': impronta(await flash(ctx, LUNGHE, { fmt: '2x2' })),
        'retro-di-prima 2x2v lunghe': impronta(await flash(ctx, LUNGHE, { backside: true })),
        'retro-di-prima 2x2v nove': impronta(await flash(ctx, NOVE, { backside: true })),
        'nodi 2x2 card': impronta(await nodi(ctx, '2x2', 'card')),
        'nodi 2x1 card': impronta(await nodi(ctx, '2x1', 'card')),
        'nodi 3x4 title': impronta(await nodi(ctx, '3x4', 'title')),
        'nodi 2x2 summary': impronta(righeDiMain(await nodi(ctx, '2x2', 'summary')))
    };
}

test('impronta: a tipografia di main e col fronte/retro rifinito spento, i fogli escono identici a main', async () => {
    const ora = await tutte({ mappai_fronte_retro_rifinito: '0', mappai_stampa_senza_tagli: '0' });
    assert.deepStrictEqual(ora, MAIN);
});

/* ── allargamento 1: l'interlinea e lo spazio fra le parole (variante C, 27/10) ─────────────── */
const PT2MM = 25.4 / 72;
test('flashcard PDF: con lo spazio in più la riga si disegna parola per parola, con lo stesso metro dell\'a-capo', async () => {
    const ctx = contesto();
    const ops = await flash(ctx, CORTE);
    const testi = ops.filter((o) => o[0] === 'text');
    const i = testi.findIndex((o) => o[1] === 'Il');
    assert.ok(i >= 0, 'la risposta «Il modo in cui…» comincia con una parola da sola: ' + JSON.stringify(testi.slice(0, 8).map((o) => o[1])));
    assert.strictEqual(testi[i + 1][1], 'modo');
    const corpo = testi[i][5][2];   // lo stato del registro: [carattere, stile, corpo, …]
    const atteso = 2 * 0.6 * corpo * PT2MM + 0.6 * corpo * PT2MM + 0.25 * corpo * PT2MM;   // «Il» + lo spazio + 0,25 em
    assert.ok(Math.abs((testi[i + 1][2] - testi[i][2]) - atteso) < 0.01, 'da «Il» a «modo»: ' + (testi[i + 1][2] - testi[i][2]) + ' mm, attesi ' + atteso);
    assert.ok(testi.some((o) => o[1] === 'SISTEMA ALBERO' || /SISTEMA/.test(o[1])), 'la testata resta una riga intera');
});

test('flashcard HTML: lo stesso spazio fra le parole del PDF (domanda, risposta, spiegazione), dalla geometria comune', () => {
    const ctx = contesto();
    const html = ctx.buildFlashcardSetHtml({ title: 'Prova', mode: 'flashcard', items: CORTE });
    ['.fc-q', '.fc-a', '.fc-e'].forEach((sel) => {
        const i = html.indexOf(sel + ' {');
        assert.ok(i >= 0, sel);
        const regola = html.slice(i, html.indexOf('}', i));
        assert.ok(regola.includes('line-height:1.6'), sel + ': interlinea 1,6');
        assert.ok(regola.includes('word-spacing:0.25em'), sel + ': spazio +0,25 em');
    });
});

test('foglio dei nodi: la scheda si misura con gli stessi grassetti con cui si disegna (un grassetto più largo non taglia più)', async () => {
    const ctx = contesto({}, { grassetto: 0.75 });
    ctx.appState = {
        db: {
            rootNodeLabel: 'Albero',
            nodes: [
                /* tre frasi fitte di nomi dei figli (grassetto); tagliate sul codice di main (misurate senza grassetti),
                   e la scheda 2×1 ha posto per molte di più */
                { id: 'r', label: 'Albero', level: 0, desc: Array(3).fill('Le radici, il fusto, le foglie e la chioma: radici fusto foglie chioma.').join(' ') },
                { id: 'a', label: 'Radici', level: 1, desc: 'Ancorano.' }, { id: 'b', label: 'Fusto', level: 1, desc: 'Sostiene.' },
                { id: 'c', label: 'Foglie', level: 1, desc: 'Respirano.' }, { id: 'd', label: 'Chioma', level: 1, desc: 'Ripara.' }
            ],
            links: [{ source: 'r', target: 'a' }, { source: 'r', target: 'b' }, { source: 'r', target: 'c' }, { source: 'r', target: 'd' }]
        },
        rootNodeLabel: 'Albero'
    };
    const ops = registro(await ctx.printAllNodeLabels({ depth: 'all', fmt: '2x1', layout: 'card', bg: 'none', tuned: false, causal: false, toDisk: { vaultPath: '' } }));
    const testi = ops.filter((o) => o[0] === 'text').map((o) => o[1]);
    assert.ok(testi.some((t) => t === 'radici,' || t === 'Radici' || t === 'radici'), 'la descrizione c\'è');
    assert.ok(!testi.some((t) => /\.\.\.$/.test(t)), 'nessuna parola chiusa con «...»: ' + testi.filter((t) => /\.\.\.$/.test(t)).join(' | '));
    assert.strictEqual(testi.filter((t) => t === 'chioma.').length, 3, 'le tre frasi intere, fino all\'ultima parola');
});

/* ── il fronte/retro rifinito (Giacomo, 26/10: «Riapro e si rifinisce») ─────────────────────── */
function pagine(ops) {
    const out = [[]];
    ops.forEach((o) => { if (o[0] === 'addPage') out.push([]); else out[out.length - 1].push(o); });
    return out;
}
function posto(boxes, x, y) { return boxes.findIndex((b) => x >= b.x - 0.01 && x <= b.x + b.w + 0.01 && y >= b.y - 0.01 && y <= b.y + b.h + 0.01); }
const largo = (o) => String(o[1]).length * (o[5][1] === 'bold' ? 0.6 : 0.6) * o[5][2] * PT2MM;

test('retro rifinito: testata su ogni retro, testo dentro il margine di 3 mm, fondo che deborda, niente taglio né piega', async () => {
    const ctx = contesto();
    const G = ctx.MappAIPrintLayout.flashGeom('2x2v'), boxes = ctx.MappAIPrintLayout.cardBoxes(G), S = G.safe;
    const pp = pagine(await flash(ctx, LUNGHE, { backside: true }));
    assert.strictEqual(pp.length, 4, 'sei carte: due fronti e due retri');
    const retro = pp[1];
    assert.ok(!retro.some((o) => o[0] === 'line' || o[0] === 'roundedRect'), 'sul retro niente linee di taglio, bordi o piega');
    const fondi = retro.filter((o) => o[0] === 'rect');
    assert.strictEqual(fondi.length, 4, 'un fondo per carta');
    fondi.forEach((f) => {
        const b = boxes.find((bb) => Math.abs(bb.x - S - f[1]) < 0.01 && Math.abs(bb.y - S - f[2]) < 0.01);
        assert.ok(b, 'il fondo parte 3 mm prima della carta: ' + f.slice(1, 5));
        assert.ok(Math.abs(f[3] - (b.w + 2 * S)) < 0.01 && Math.abs(f[4] - (b.h + 2 * S)) < 0.01, 'e finisce 3 mm dopo');
    });
    const testi = retro.filter((o) => o[0] === 'text');
    assert.strictEqual(testi.filter((o) => /SISTEMA/.test(o[1])).length, 4, 'la testata su ogni retro');
    testi.forEach((o) => {
        const b = boxes[posto(boxes, o[2], o[3])];
        assert.ok(b, 'testo dentro una carta: ' + o[1]);
        assert.ok(o[2] >= b.x + G.card.padX + S - 0.01, 'a sinistra dentro il margine: ' + o[1]);
        assert.ok(o[2] + largo(o) <= b.x + b.w - G.card.padX - S + 0.05, 'a destra dentro il margine: ' + o[1]);
        assert.ok(o[3] <= b.y + b.h - S, 'in basso dentro il margine: ' + o[1]);
        assert.ok(o[3] - o[5][2] * PT2MM >= b.y + S - 0.01, 'in alto dentro il margine: ' + o[1]);
    });
});

test('retro rifinito: il lato di ribaltamento decide dove cade ogni risposta', async () => {
    for (const lato of ['lungo', 'corto']) {
        const ctx = contesto();
        const PL = ctx.MappAIPrintLayout, G = PL.flashGeom('2x2v'), boxes = PL.cardBoxes(G);
        const quattro = [0, 1, 2, 3].map((i) => ({ question: 'Domanda ' + i, answer: 'Risposta' + i }));
        const pp = pagine(await flash(ctx, quattro, { backside: true, lato }));
        const ord = PL.backOrder(4, G, lato);
        [0, 1, 2, 3].forEach((i) => {
            const o = pp[1].find((x) => x[0] === 'text' && x[1] === 'Risposta' + i);
            assert.ok(o, lato + ': la risposta ' + i);
            assert.strictEqual(posto(boxes, o[2], o[3]), ord.indexOf(i), lato + ': la risposta ' + i + ' dietro la sua domanda');
        });
    }
});

test('retro rifinito: il corpo cresce sulla carta intera; spento l\'interruttore resta a 13 pt', async () => {
    const corte = [{ question: 'Che cos\'è il Réduit?', answer: 'Le Alpi fortificate.' }];
    const corpo = (ops) => ops.filter((o) => o[0] === 'text' && o[1] === 'Che').map((o) => o[5][2])[0];
    assert.strictEqual(corpo(await flash(contesto(), corte, { backside: true })), 20.8);
    assert.strictEqual(corpo(await flash(contesto({ mappai_fronte_retro_rifinito: '0' }), corte, { backside: true })), 13);
    assert.strictEqual(corpo(await flash(contesto(), corte)), 13, 'il pieghevole non cresce');
});

test('foglio di prova: fronte coi numeri e le croci, retro coi numeri dove cadono per il lato scelto, il margine tratteggiato', async () => {
    const ctx = contesto();
    const PL = ctx.MappAIPrintLayout, G = PL.flashGeom('2x2v'), boxes = PL.cardBoxes(G);
    assert.strictEqual(typeof ctx.printFlashcardTestSheet, 'function');
    for (const lato of ['lungo', 'corto']) {
        const pp = pagine(registro(await ctx.printFlashcardTestSheet({ fmt: '2x2v', lato, toDisk: {} })));
        assert.strictEqual(pp.length, 2, lato + ': fronte e retro');
        const [f, r] = pp;
        const num = (pg, k) => pg.find((o) => o[0] === 'text' && o[1] === String(k));
        const ord = PL.backOrder(4, G, lato);
        [1, 2, 3, 4].forEach((k) => {
            assert.strictEqual(posto(boxes, num(f, k)[2], num(f, k)[3]), k - 1, 'sul fronte il ' + k + ' nella sua carta');
            assert.strictEqual(posto(boxes, num(r, k)[2], num(r, k)[3]), ord.indexOf(k - 1), 'sul retro il ' + k + ' dietro il suo');
        });
        const croci = (pg) => pg.filter((o) => o[0] === 'line').length;
        assert.ok(croci(f) >= 4 * 22 && croci(r) >= 4 * 22, 'una croce con le tacche per carta, sui due lati');
        assert.ok(f.some((o) => o[0] === 'text' && new RegExp('lato ' + lato).test(o[1])), 'l\'istruzione dice il lato scelto');
        assert.strictEqual(r.filter((o) => o[0] === 'rect').length, 4, 'sul retro il riquadro del margine di ogni carta');
    }
});

/* ── allargamento 2 (Giacomo, 27/10): «non troncare il testo»; «fino a 11pt»; «Più piccola solo lei, e avviso» ── */
const SPIEGAZIONE_LUNGA = 'Una spiegazione più lunga di duecentoventi caratteri, che fino a oggi il foglio tagliava con i puntini: '.repeat(3).trim() + ' FINE.';
const MOSTRO = { question: 'Una domanda volutamente lunghissima. '.repeat(14).trim(), answer: 'Una risposta altrettanto lunga, che nel pieghevole non può stare a nessun corpo leggibile. '.repeat(3).trim(), explanation: '' };

test('senza tagli, PDF delle flashcard: testi interi (anche la spiegazione oltre i 220 caratteri), la carta lunga da sola più piccola, e l\'avviso', async () => {
    const ctx = contesto();
    const carte = [CORTE[0], { question: 'Perché?', answer: 'Perché sì.', explanation: SPIEGAZIONE_LUNGA }, MOSTRO];
    const r = await ctx.printFlashcardSheet({ items: carte, title: 'Prova', mapName: 'Sistema Albero', toDisk: {} });
    const ops = registro(r), testi = ops.filter((o) => o[0] === 'text');
    assert.ok(!testi.some((o) => /…$|\.\.\.$/.test(o[1])), 'nessun «…»');
    assert.ok(testi.some((o) => o[1] === 'FINE.'), 'la spiegazione arriva fino in fondo');
    const corpo = (parola) => testi.filter((o) => o[1] === parola).map((o) => o[5][2]);
    assert.ok(corpo('volutamente')[0] < 11, 'la carta lunga scende sotto gli 11: ' + corpo('volutamente')[0]);
    assert.ok(corpo('fotosintesi?')[0] >= 11, 'le altre no: ' + corpo('fotosintesi?')[0]);
    assert.ok(r.avvisi && r.avvisi.sotto.indexOf(2) >= 0 && r.avvisi.sotto.indexOf(0) < 0, 'l\'avviso dice quali carte (la lunga sì, la corta no): ' + JSON.stringify(r.avvisi));
    assert.ok(/carte? stampat[ae] più piccol[ae]/.test(r.avvisi.messaggio), r.avvisi.messaggio);
    assert.ok(/fronte e retro/i.test(r.avvisi.consiglio), 'e propone il fronte/retro: ' + r.avvisi.consiglio);
});

test('senza tagli, foglio HTML delle flashcard: la spiegazione intera e la carta lunga col suo corpo, come il PDF', () => {
    const ctx = contesto();
    const html = ctx.buildFlashcardSetHtml({ title: 'Prova', mode: 'flashcard', items: [CORTE[0], { question: 'Perché?', answer: 'Perché sì.', explanation: SPIEGAZIONE_LUNGA }, MOSTRO] });
    assert.ok(html.includes('FINE.'), 'la spiegazione intera');
    assert.ok(!/[^.]…</.test(html), 'nessun «…» chiude un testo');
    const PL = ctx.MappAIPrintLayout;
    const fit = PL.fitFlash([CORTE[0], { question: 'Perché?', answer: 'Perché sì.', explanation: SPIEGAZIONE_LUNGA }, MOSTRO].map((c) => ({ question: c.question, answer: c.answer, explanation: c.explanation || '' })),
        PL.flashGeom(), { lines: ['', ''] }, { senzaTagli: true });
    assert.ok(html.includes('--fs:' + fit.perCard[2].q + 'pt'), 'la carta lunga porta il suo corpo (' + fit.perCard[2].q + ' pt)');
});

test('senza tagli, foglio dei nodi: la descrizione lunga scende da sola, intera; le altre al corpo pieno; l\'avviso consiglia 2 per foglio', async () => {
    const ctx = contesto();
    const lunga = 'Una descrizione lunghissima che nella scheda del due per due non sta al corpo pieno. '.repeat(9).trim() + ' FINE.';
    ctx.appState = { db: { rootNodeLabel: 'Albero', nodes: [
        { id: 'r', label: 'Albero', level: 0, desc: 'Breve.' },
        { id: 'a', label: 'Lunga', level: 1, desc: lunga },
        { id: 'b', label: 'Corta', level: 1, desc: 'Una descrizione corta.' }
    ], links: [{ source: 'r', target: 'a' }, { source: 'r', target: 'b' }] }, rootNodeLabel: 'Albero' };
    const r = await ctx.printAllNodeLabels({ depth: 'all', fmt: '2x2', layout: 'card', bg: 'none', tuned: false, causal: false, toDisk: { vaultPath: '' } });
    const testi = registro(r).filter((o) => o[0] === 'text');
    assert.ok(!testi.some((o) => /\.\.\.$|…$/.test(o[1])), 'nessun «...»');
    assert.ok(testi.some((o) => o[1] === 'FINE.'), 'la descrizione arriva in fondo');
    const pt = (parola) => testi.filter((o) => o[1] === parola).map((o) => o[5][2])[0];
    assert.ok(pt('lunghissima') < 11, 'la lunga sotto gli 11: ' + pt('lunghissima'));
    assert.strictEqual(pt('corta.'), 13, 'le altre al corpo pieno del 2×2');
    assert.ok(r.avvisi && r.avvisi.sotto.indexOf('Lunga') >= 0, 'l\'avviso nomina la scheda: ' + JSON.stringify(r.avvisi));
    assert.ok(/2 per foglio/.test(r.avvisi.consiglio), 'e consiglia le carte grandi: ' + r.avvisi.consiglio);
});

test('senza tagli, foglio dei nodi: tutte le parole chiave entrano (il corpo scende), nessuna resta fuori', async () => {
    const ctx = contesto();
    const kw = ['fotosintesi clorofilliana', 'stabilità del territorio', 'corteccia protettiva', 'apparato radicale profondo', 'linfa grezza ed elaborata', 'anelli di accrescimento', 'riposo vegetativo invernale'];
    const r = await ctx.printAllNodeLabels({ fmt: '2x2', layout: 'keywords', bg: 'none', tuned: false, causal: false, toDisk: { vaultPath: '' },
        cards: [{ id: 'k', label: 'Un titolo abbastanza lungo da occupare tre righe della scheda', layout: 'keywords', keywords: kw, desc: '' }] });
    const scritto = registro(r).filter((o) => o[0] === 'text').map((o) => o[1]).join(' ');
    kw.forEach((k) => k.split(' ').forEach((p) => assert.ok(scritto.includes(p), 'la parola chiave «' + k + '» c\'è')));
});

/* ── la finestra «Foglio flashcard» del docente: lato di ribaltamento e foglio di prova ── */
test('editor del docente: «Foglio flashcard» ha il lato di ribaltamento e il foglio di prova, passati al generatore', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/js/mappai-doc-editor.js'), 'utf8');
    const i = src.indexOf('function openFlashModal(');
    const f = src.slice(i, src.indexOf('\n    }\n', i));
    assert.ok(/let _flashLato = 'lungo';/.test(src), 'il lato ricordato nel modulo, accanto a _flashBack');
    assert.ok(f.includes('name="de-lato" value="lungo"') && f.includes('name="de-lato" value="corto"'), 'i due lati');
    assert.ok(f.includes('id="de-prova"'), 'il bottone del foglio di prova');
    /* 0128, allargamento 12: le opzioni sono in `_flashOpzioni`, condivise con «PDF» */
    const o = src.slice(src.indexOf('function _flashOpzioni('), i);
    assert.ok(f.includes('printFlashcardSheet(_flashOpzioni(nome))') && o.includes('lato: _flashLato,'), 'il lato va al foglio');
    assert.ok(/printFlashcardTestSheet\(\{ fmt: _flashFmt, lato: /.test(f), 'e al foglio di prova');
});

/* ── allargamento 3 (Giacomo, 27/10): «nell'editor se serve inserisci la modifica della dimensione del font per aiutare
   il docente a ottimizzare dimensioni e testi per limitare le troncature» ── */
test('editor del docente: il corpo del testo si cambia dal foglio (flashcard; descrizioni e parole chiave delle schede)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/js/mappai-doc-editor.js'), 'utf8');
    assert.ok(/function corpoFlash\(d\)/.test(src) && /PL\.setCorpo\(/.test(src), 'flashcard: il corpo nel core della stampa');
    assert.ok(/function corpoNodi\(campo, d\)/.test(src) && /\.setCorpi\(/.test(src), 'schede: descrizioni e parole chiave nel core del foglio');
    assert.ok(/corpoFlash: corpoFlash, corpoNodi: corpoNodi/.test(src), 'esposti per i bottoni');
    /* dall'allargamento 9 il comando delle flashcard sta nel blocco delle impostazioni, con l'icona (prova più sotto) */
    assert.ok(/'MappAIDocEditor\.corpoFlash\(#\)'/.test(src), 'il comando nel foglio delle flashcard');
    /* dall'allargamento 7 le schede hanno un passo solo, che segue il tipo di card (prova più sotto) */
    assert.ok(/MappAIDocEditor\.corpoNodi\(\\'' \+ campo \+ '\\', #\)/.test(src), 'e nel foglio dei nodi');
    assert.ok(/de_ns_over_confirm2/.test(src) && /de_ns_lim_oltre2/.test(src), 'senza tagli le frasi non dicono più «tagliate»');
});

/* ── allargamento 5 (Giacomo, 27/10, al gate: «vedo i controlli per le impostazioni del carattere di keyword e
   descrizioni, aggiungi anche l'opzione per l'interlinea») ── */
test('editor del docente: l\'interlinea si cambia dal foglio (flashcard; descrizioni delle schede), accanto al corpo', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/js/mappai-doc-editor.js'), 'utf8');
    assert.ok(/function interlineaFlash\(d\)/.test(src) && /PL\.setInterlinea\(/.test(src), 'flashcard: nel core della stampa');
    assert.ok(/function interlineaNodi\(d\)/.test(src) && /N\.setInterlinea\(/.test(src), 'schede: nel core del foglio');
    assert.ok(/interlineaFlash: interlineaFlash, interlineaNodi: interlineaNodi/.test(src), 'esposti per i bottoni');
    const flash = src.indexOf("'MappAIDocEditor.corpoFlash(#)'"), fi = src.indexOf("'MappAIDocEditor.interlineaFlash(#)'");
    assert.ok(flash > 0 && fi > flash, 'nel foglio delle flashcard, dopo la dimensione');
    const corpo = src.indexOf("_passoIcona('a-large-small'"), ni = src.indexOf("_passoIcona('list-chevrons-up-down'");
    assert.ok(corpo > 0 && ni > corpo, 'nel foglio dei nodi, dopo la dimensione (allargamento 7: con le icone)');
    const en = fs.readFileSync(path.join(ROOT, 'public/traduzioni/en_translations.js'), 'utf8');
    ['de_interlinea', 'de_interl_meno', 'de_interl_piu'].forEach(k => assert.ok(new RegExp('\\b' + k + ':').test(en), k + ' in inglese'));
});

test('index.html: il segno 0128 nel ?v= dei sei file cambiati (come prefisso, senza la virgoletta)', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
    ['traduzioni/en_translations.js', 'js/mappai-print-layout.js', 'js/mappai-nodesheet-core.js', 'js/mappai-quiz-print.js',
        'js/mappai-doc-editor.js', 'js/mappai-print-dossier.js'].forEach((f) => {
        const re = new RegExp('src="' + f.replace(/[.]/g, '\\.') + '\\?v=[^"]*0128-1');
        assert.ok(re.test(html), f);
    });
});

/* ── allargamento 6 (Giacomo, 27/10, al gate): «dal bottone 3x4 elimina il testo 'solo titolo'»; «modifica il testo 'A tutte
   le card' in 'Tipo di card: TITOLO + [menu a tendina per opzioni]', i nomi delle opzioni sono 'SPAZIO VUOTO', 'PAROLE CHIAVE'
   e 'DESCRIZIONI'» (e «NIENTE» in cima, sua scelta); «Rendi il colore della quadrettatura e delle linee il 10% più saturo»
   (+10 punti, sua scelta) ── */
test('foglio dei nodi PDF: quadretti ciano al 20% e righe guida #c7d5e5 (saturazione +10 punti)', async () => {
    const ctx = contesto();
    ctx.appState = JSON.parse(JSON.stringify(NODI));
    const griglia = registro(await ctx.printAllNodeLabels({ depth: 'all', fmt: '2x2', layout: 'summary', bg: 'grid', tuned: false, causal: false, toDisk: { vaultPath: '' } }));
    const quadretti = griglia.filter((o) => o[0] === 'line' && JSON.stringify(o[o.length - 1][0]) === '[0,255,255]');
    assert.ok(quadretti.length > 50, 'i quadretti ci sono: ' + quadretti.length);
    assert.ok(quadretti.every((o) => /"stroke-opacity":0\.2\b/.test(o[o.length - 1][4])), 'al 20%');
    const righe = (await nodi(ctx, '2x2', 'summary')).filter((o) => o[0] === 'line');
    assert.ok(righe.length > 0 && righe.every((o) => JSON.stringify(o[o.length - 1][0]) === '[199,213,229]'), 'le righe guida nel blu-grigio');
    const src = fs.readFileSync(path.join(ROOT, 'public/js/mappai-print-dossier.js'), 'utf8');
    assert.ok(src.includes('doc.setDrawColor(204, 255, 255)'), 'senza GState: il ciano al 20% già miscelato col bianco');
});

test('editor del foglio dei nodi: 3 × 4 senza «solo titolo»; «Tipo di card» TITOLO + un menu; le righe dell\'anteprima derivate dal bordo', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/js/mappai-doc-editor.js'), 'utf8');
    assert.ok(src.includes("fmtBtn('3x4', '3 × 4', t('de_ns_fmt_12', '12 per foglio'))"), '3 × 4: «12 per foglio»');
    assert.ok(!/de_ns_apply_all|allBtn\(|\.de-ns-all/.test(src), 'i quattro bottoni di «A tutte le card» non ci sono più');
    assert.ok(src.includes("t('de_ns_tipo', 'Tipo di card')") && src.includes("t('de_ns_tipo_titolo', 'TITOLO +')"), 'l\'etichetta e TITOLO +');
    const ordine = ["'de_ns_o_title', 'NIENTE'", "'de_ns_o_summary', 'SPAZIO VUOTO'", "'de_ns_o_keywords', 'PAROLE CHIAVE'", "'de_ns_o_card', 'DESCRIZIONI'"].map((k) => src.indexOf(k));
    assert.ok(ordine.every((i, n) => i > 0 && (n === 0 || i > ordine[n - 1])), 'le quattro voci, in quest\'ordine: ' + ordine);
    assert.ok(/onchange="MappAIDocEditor\.nsSetAll\(this\.value\)"/.test(src), 'il menu applica il tipo a tutte le card');
    assert.ok(src.includes("const riga = 'hsl(from var(--mm-bordo, #cbd5e1) h calc(s + 10) l)';"), 'anteprima: il bordo +10 di saturazione');
    const en = fs.readFileSync(path.join(ROOT, 'public/traduzioni/en_translations.js'), 'utf8');
    ['de_ns_tipo', 'de_ns_tipo_titolo', 'de_ns_o_title', 'de_ns_o_summary', 'de_ns_o_keywords', 'de_ns_o_card', 'de_ns_o_misto'].forEach((k) => assert.ok(new RegExp('\\b' + k + ':').test(en), k + ' in inglese'));
    assert.ok(/de_ns_fmt_12: "12 per sheet",/.test(en));
});

/* ── allargamento 7 (Giacomo, 27/10, al gate): «Riorganizza le opzioni per la dimensione dei caratteri e dell'interlinea in modo
   da farle stare nel riquadro principale. Ingrandisci la dimensione dei bottoni […] Al posto del titolo dell'opzione usa due icone
   del set lucide»; «Accorcia il testo della descrizione dei limiti tipografici»; «Fondi l'opzione per la dimensione delle desc e
   delle keyword in modo che sia unica voce e che sia attiva sulla modalità applicata alla selezione fatta nel menu a tendina» ── */
test('foglio dei nodi: dimensione e interlinea nel riquadro, con due icone; un passo solo che segue il tipo di card; la regola corta', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/js/mappai-doc-editor.js'), 'utf8');
    /* dall'allargamento 9: i passi nella riga del testo del blocco delle impostazioni, sotto la riga del tipo di card */
    assert.ok(src.includes("_impostazioni({ righe: ctrl, testo: passi, vincoli: limNote,"), 'i passi stanno nel riquadro, nella riga del testo');
    assert.ok(!/class="de-limit/.test(src), 'il riquadro giallo non c\'è più');
    assert.ok(/_passoIcona\('a-large-small'/.test(src) && /_passoIcona\('list-chevrons-up-down'/.test(src), 'le due icone lucide');
    const lucide = fs.readFileSync(path.join(ROOT, 'public/js/lucide.min.js'), 'utf8');
    assert.ok(/\bALargeSmall\b/.test(lucide) && /\bListChevronsUpDown\b/.test(lucide), 'e il lucide dell\'app le ha');
    assert.ok(/campo === 'kw' \? g\.kwPt : g\.descPt/.test(src), 'un passo solo, sulle descrizioni o sulle parole chiave');
    assert.ok(/tipoComune === 'card' \? 'desc' : tipoComune === 'keywords' \? 'kw'/.test(src), 'segue il menu del tipo di card');
    assert.ok(/campo === 'desc' \? 'MappAIDocEditor\.interlineaNodi\(#\)' : ''/.test(src), 'l\'interlinea, solo con le descrizioni');
    assert.ok(/\.de-passo \{[^}]*height:calc\(var\(--mm-ctl-h, 40px\) \/ var\(--de-k\)\)/.test(src), 'alto come gli altri comandi (40, a ogni ingrandimento)');
    assert.ok(src.includes("t('de_ns_lim_card', 'Per card: titolo ~{t} caratteri, descrizione ~{d}.')"), 'la regola corta');
    assert.ok(!/de_ns_limit2|'de_ns_limit'|_passo\(t\('de_corpo_desc'|_passo\(t\('de_corpo_kw'/.test(src), 'via le frasi lunghe e i due passi separati');
    const en = fs.readFileSync(path.join(ROOT, 'public/traduzioni/en_translations.js'), 'utf8');
    ['de_passo_corpo_desc', 'de_passo_corpo_kw', 'de_passo_niente', 'de_interlinea_desc', 'de_passo_solo_desc', 'de_passo_serie',
        'de_ns_lim_card', 'de_ns_lim_kw', 'de_ns_lim_title', 'de_ns_lim_oltre2', 'de_ns_lim_oltre', 'de_set_over']
        .forEach((k) => assert.ok(new RegExp('\\b' + k + ':').test(en), k + ' in inglese'));
});

/* ── allargamento 8 (Giacomo, 27/10): «molti testi nell'editor dei fogli nodo hanno una dimensione troppo piccola»; «alcuni sono titoli di
   opzioni, altri sono sottotitoli della testata, altri sono indicazioni o riferimenti tecnici»; «alliena tutti gli editor affinché i testi
   abbiano gli stessi token di dimensione e stile»; «Il titolo 'Formato fogli' diventa 'Formato'» ── */
test('editor: i testi dell\'interfaccia per ruolo sulla famiglia C, fermi all\'ingrandimento del foglio; «Formato»', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/js/mappai-doc-editor.js'), 'utf8');
    const regola = (sel) => { const i = src.indexOf('\n' + sel + ' {'); assert.ok(i >= 0, sel); return src.slice(i, src.indexOf('}', i)); };
    const foglio = regola('.de-sheet');
    [['--de-fs-titolo', '--mm-fs-titolo'], ['--de-fs-parte', '--mm-fs-testo'], ['--de-fs-ctl', '--mm-ctl-fs'], ['--de-fs-label', '--mm-fs-label'], ['--de-fs-sez', '--mm-fs-sez']]
        .forEach(([r, tk]) => assert.ok(new RegExp(r + ':calc\\(var\\(' + tk + '[^)]*\\) / var\\(--de-k\\)\\)').test(foglio), r + ' = ' + tk + ' ÷ --de-k'));
    const ruoli = {
        '--de-fs-titolo': ['.de-sheet-title', '.de-list-h'],
        '--de-fs-label': ['.de-sheet-sub', '.de-ns-mix', '.de-note', '.de-set-info', '.de-count', '.de-ns-n', '.de-oq-noaree', '.de-cc-trunc', '.de-list-p', '.de-row-m'],
        '--de-fs-sez': ['.de-ns-lbl', '.de-lbl', '.de-modal-lbl', '.de-tts-lbl', '.de-qn', '.de-liv-b', '.de-cc-sec-tag', '.de-cc-badge'],
        '--de-fs-ctl': ['.de-ns-check', '.de-row-t', '.de-bar-t'],
        '--de-fs-parte': ['.de-sec-title', '.de-cc-sec-title']
    };
    Object.keys(ruoli).forEach((r) => ruoli[r].forEach((sel) => assert.ok(regola(sel).includes('font-size:var(' + r + ','), sel + ' → ' + r)));
    ['.de-ns-lbl', '.de-lbl', '.de-modal-lbl', '.de-tts-lbl'].forEach((sel) =>
        assert.ok(regola(sel).includes('font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--mm-testo-3, #64748b);'), sel + ': lo stile dei titoli di sezione del motore'));
    assert.ok(/\.de-ns-check input \{[^}]*width:calc\(16px \/ var\(--de-k, 1\)\)/.test(src), 'la casella dei quadretti come quelle del motore');
    assert.ok(src.includes("esc(t('de_ns_fmt', 'Formato'))"), '«Formato»');
    const en = fs.readFileSync(path.join(ROOT, 'public/traduzioni/en_translations.js'), 'utf8');
    assert.ok(/de_ns_fmt: "Format",/.test(en));
});

/* ── allargamento 9 (Giacomo, 27/10): «organizza meglio gli elementi per la gestione delle impostazioni di dimensione e interlinea
   affinche il loro blocco sia simile in tutti gli editor, e […] fai in modo che le descrizioni dei vincoli e gli avvisi degli
   eventuali errori siano riportati in maniera chiara e sintetica sotto i bottoni dei setting di layout» ── */
test('editor: lo stesso blocco delle impostazioni in tutti e sei gli editor, coi vincoli e gli avvisi in una riga sotto i passi', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/js/mappai-doc-editor.js'), 'utf8');
    const corpo = (nome) => { const i = src.indexOf('    function ' + nome + '('); assert.ok(i > 0, nome); return src.slice(i, src.indexOf('\n    function ', i + 10)); };
    ['_nodeSheet', '_quizSheet', '_openqSheet', '_causalSheet', '_synthSheet'].forEach((f) =>
        assert.ok(/_impostazioni\(\{/.test(corpo(f)), f + ' usa il blocco'));
    ['_quizSheet', '_openqSheet', '_causalSheet', '_synthSheet'].forEach((f) =>
        assert.ok(/testo: _bloccoTesto\(\)/.test(corpo(f)), f + ': la riga del testo comune'));
    const imp = corpo('_impostazioni');
    assert.ok(imp.indexOf('de-set-testo') < imp.indexOf('de-set-info'), 'la riga corta sta sotto i passi');
    assert.ok(/'<b>' \+ esc\(o\.avviso\)/.test(imp), 'l\'avviso in grassetto');
    const blocco = corpo('_bloccoTesto');
    assert.ok(blocco.indexOf("'a-large-small'") < blocco.indexOf("'list-chevrons-up-down'"), 'dimensione poi interlinea, sempre');
    assert.ok(/MappAIDocEditor\.tipoDoc\(\\'corpo\\', #\)/.test(blocco) && /PL\.tipografia\(_kind\)/.test(blocco), 'quiz, aperte, sintesi e catena dalla scelta per materiale');
    assert.ok(/function tipoDoc\(campo, d\)/.test(src) && /tipoDoc: tipoDoc/.test(src));
    assert.ok(!/function _passo\(/.test(src) && !/\.de-corpo \{/.test(src) && !/\.de-limit \{/.test(src), 'il passo vecchio e il riquadro giallo via');
    ["'de_set_flash2'", "'de_set_oq'", "'de_set_cc'", "'de_set_voce'", "'de_set_stampa'", "'de_set_over'"].forEach((k) => assert.ok(src.includes(k), k));
    const en = fs.readFileSync(path.join(ROOT, 'public/traduzioni/en_translations.js'), 'utf8');
    ['de_passo_corpo', 'de_set_over', 'de_set_stampa', 'de_set_flash2', 'de_set_flash', 'de_set_oq', 'de_set_cc', 'de_set_voce']
        .forEach((k) => assert.ok(new RegExp('\\b' + k + ':').test(en), k + ' in inglese'));
    ['de_limit_note', 'de_oq_note', 'de_cc_note', 'de_audio_stale', 'de_corpo_flash'].forEach((k) =>
        assert.ok(!new RegExp('\\b' + k + ':').test(en), k + ' tolta: non la legge più nessuno'));
});

/* ── allargamento 10 (Giacomo, 27/10): «l'editor delle flashcard deve mostrare un anteprima uguale a quella del layout di stampa e
   deve esserci l'opzione 1 faccia 2 faccie per formato pieghevole o formato fronte/retro. Quando lo user sceglie la modalità 2
   faccie allora fronte e retro della carta sono disposte una a fianco dell'altra e per ogni riga c'è una flashcard»; «nelle domande
   aperte e quiz a scelta multipla invece l'editor deve mostrare le domande in sequenza verticale e i campi delle domande e delle
   risposte devono adattarsi alla dimensione del font»; «Gli stili delle domande, risposte e spiegazioni devono rimanere uguali» ── */
test('editor delle flashcard: anteprima dalla geometria e dai corpi del foglio, 1 faccia o 2 facce (fronte e retro per riga)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/js/mappai-doc-editor.js'), 'utf8');
    /* dall'allargamento 19 il calcolo del foglio sta in `_flashFit`, subito prima dell'anteprima, che lo legge con il rosso */
    const i = src.indexOf('    function _flashFit('); assert.ok(i > 0 && i < src.indexOf('    function _flashPreview('));
    const f = src.slice(i, src.indexOf('\n    function setFacce(', i));
    assert.ok(/PL\.fitFlash\(carte, G, \{ lines: righeTesta \},\s*\{ policy: 'uniform', withExpl: true, duplex: due, retro: \(due && rifinito\) \? \{ safe: SAFE \} : null, senzaTagli: senzaTagli \}\)/.test(f),
        'gli stessi corpi del PDF: PL.fitFlash con le opzioni di printFlashcardSheet');
    assert.ok(f.includes("(mm / W * 100).toFixed(3) + 'cqw'") && f.includes("aspect-ratio:' + W + ' / ' + G.cardH + '"), 'misure in frazioni della carta, la carta nelle sue proporzioni');
    assert.ok(f.includes("flex:0 0 auto;min-height:' + c(G.cardH * split / 100)") && f.includes('G.fold.color'), '1 faccia: la piega dove la mette il foglio');
    assert.ok(/'<div class="de-fc-riga">' \+ testaCarta\(it, i\) \+\s*'<div class="de-fc-coppia">'/.test(f), '2 facce: una carta per riga, fronte e retro affiancati');
    assert.ok(/data-f="' \+ f \+ '"/.test(f) && /campo\(i, 'question'/.test(f) && /campo\(i, 'answer'/.test(f) && /campo\(i, 'explanation'/.test(f), 'i campi restano scrivibili');
    assert.ok(/\(isFlash \? '<div class="de-fc ' \+ \(_flashBack \? 'due' : 'una'\) \+ '">'/.test(src), 'le flashcard nell\'anteprima, gli altri nella lista');
    assert.ok(/onclick="MappAIDocEditor\.setFacce\(1\)"/.test(src) && /onclick="MappAIDocEditor\.setFacce\(2\)"/.test(src) && /setFacce: setFacce/.test(src), 'la scelta delle facce nel blocco delle impostazioni');
    /* tre: la scelta, la finestra «Foglio flashcard» e, dall'allargamento 18, l'apertura di un mazzo che ha le sue facce */
    assert.ok((src.match(/localStorage\.setItem\('mappai_flash_facce'/g) || []).length === 3, 'ricordata, dalla scelta, dalla finestra «Foglio flashcard» e dal mazzo');
    assert.ok(/host\.addEventListener\('focusout'/.test(src) && /_fcSporco = true/.test(src), 'lasciando un campo cambiato i corpi si ricalcolano');
    assert.ok(!/\.de-sheet\.flash \.de-items/.test(src), 'via le colonne della lista delle flashcard');
});

test('quiz e domande aperte: una colonna; i campi seguono il corpo e l\'interlinea scelti, con gli stili di sempre', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/js/mappai-doc-editor.js'), 'utf8');
    assert.ok(/\.de-items \{ display:grid; grid-template-columns:1fr;/.test(src), 'una colonna');
    assert.ok(src.includes(".tipografia('quiz')") && src.includes(".tipografia('openq')"), 'la scelta del materiale');
    assert.ok((src.match(/' style="--de-tk:' \+ T[QO]\.k \+ ';--de-tlk:' \+ T[QO]\.lk \+ '"'/g) || []).length === 2, 'sul foglio del quiz e delle aperte');
    [['.de-q', '15px', '1.55'], ['.de-opt-txt', '13px', '1.5'], ['.de-a', '13px', '1.5'], ['.de-expl', '11px', '1.5']].forEach(([sel, fs_, lh]) => {
        const j = src.indexOf('\n' + sel + ' {'); const r = src.slice(j, src.indexOf('}', j));
        assert.ok(r.includes('font-size:calc(' + fs_ + ' * var(--de-tk, 1))') && r.includes('line-height:calc(' + lh + ' * var(--de-tlk, 1))'), sel + ': stessi valori, moltiplicati');
    });
    assert.ok(/\.de-q \{[^}]*font-weight:bold; color:var\(--mm-testo, #404040\);/.test(src) && /\.de-a \{[^}]*color:#065f46; background:#f0fdf4;/.test(src) && /\.de-expl \{[^}]*color:#475569; font-style:italic;/.test(src), 'gli stili non cambiano');
});

test('allargamento 11: il bottone che conclude il «Foglio flashcard» è stampante + «PDF»; quiz e domande aperte restano «Continua»', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/js/mappai-doc-editor.js'), 'utf8');
    assert.ok(src.includes('function _modal(title, sub, bodyHtml, onOk, okTesto) {'), 'il nome del bottone si passa');
    assert.ok(src.includes(`<i data-lucide="printer" class="w-4 h-4"></i>' + esc(okTesto || t('de_ok', 'Continua')) + '</button>`), 'la stampante resta; senza nome, «Continua»');
    const i = src.indexOf('function openFlashModal(');
    const fn = src.slice(i, src.indexOf('\n    function ', i + 10));
    assert.ok(fn.includes("}, t('de_pdf', 'PDF'));"), 'il foglio flashcard dice «PDF»');
    ['function openAnswersModal(', 'function openOpenqModal('].forEach((f) => {
        const j = src.indexOf(f); const g = src.slice(j, src.indexOf('\n    function ', j + 10));
        assert.ok(g.includes('_openPrintable(') && !g.includes("t('de_pdf'"), f + ' apre il foglio da stampare: «Continua»');
    });
});

test('il foglio di stile dell\'editor si costruisce (un apice inverso in un commento lo spezzava: la barra della console nuda)', () => {
    /* 27/10, gate in Electron dopo un Cmd+R: «c'è un problema nella topbar della console». Un commento dell'allargamento
       10 dentro il CSS (template literal) aveva `.de-items` fra apici inversi: il template si chiudeva lì, `items` non
       esiste, `_injectStyles` lanciava dopo aver segnato «fatto» e nessun editor riceveva più le sue regole. */
    const vm = require('vm');
    const aggiunti = [];
    const el = () => ({ style: {}, setAttribute() { }, appendChild() { }, addEventListener() { }, classList: { add() { }, remove() { } } });
    const ctx = { console: { log() { }, warn() { }, error() { } }, localStorage: { getItem: () => null, setItem() { }, removeItem() { } },
        t: (k, f) => f, showToast() { }, navigator: { language: 'it' }, appState: { db: { nodes: [], links: [] } }, setTimeout, clearTimeout,
        document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => el(),
            addEventListener() { }, head: { appendChild: (n) => aggiunti.push(n) }, body: el(), documentElement: el() } };
    ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx);
    ['mappai-print-layout.js', 'mappai-nodesheet-core.js', 'mappai-doc-head.js', 'mappai-docedit-core.js', 'mappai-doc-editor.js']
        .forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/js', f), 'utf8'), ctx, { filename: f }));
    ctx.MappAIDocEditor.assicuraStili();
    assert.strictEqual(aggiunti.length, 1, 'un foglio');
    assert.strictEqual(aggiunti[0].id, 'de-styles');
    assert.ok(aggiunti[0].textContent.includes('.de-bar {') && aggiunti[0].textContent.includes('.de-fc'), 'con la barra e le carte');
    const src = fs.readFileSync(path.join(ROOT, 'public/js/mappai-doc-editor.js'), 'utf8');
    const i = src.indexOf('const css = `'), j = src.indexOf('\n`;', i);
    assert.ok(i > 0 && j > i && !src.slice(i + 13, j).includes('`'), 'nessun apice inverso dentro il CSS');
});

test('allargamento 12: «PDF» chiede sempre il nome (già scritto), il PDF delle flashcard è il foglio scelto, l\'uscita apre il file scritto, la stampa delle anteprime è un\'icona', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/js/mappai-doc-editor.js'), 'utf8');
    const fnDi = (nome) => { const i = src.indexOf('function ' + nome + '('); return src.slice(i, src.indexOf('\n    function ', i + 10)); };
    /* il modale del nome: sempre da «PDF», col nome che il documento ha già; il bottone dice «Salva» */
    assert.ok(fnDi('creaPdf').includes('await _salvaConNome({ chiedi: true });'), '«PDF» chiede il nome');
    const sv = fnDi('_salvaConNome');
    assert.ok(sv.includes('const chiedi = !!(o && o.chiedi) || !prima;') && sv.includes('await _chiediNomeFile(esistenti, prima)'), 'il campo già scritto');
    assert.ok(sv.includes('const suo = !!prima && chiedi && scelto === prima;') && sv.includes('if (!suo && _collide(nomeVero, esistenti)) {'), 'lasciato com\'è riscrive il file del materiale, senza il secondo modale');
    assert.ok(sv.includes('_componiNome(scelto, chiedi)') && sv.includes('_ultimoScritto = payload.relPath;'));
    const cn = fnDi('_chiediNomeFile');
    assert.ok(cn.includes("valore: proprio }") && cn.includes("t('de_nome_ok', 'Salva')") && !src.includes('Salva e stampa'), 'campo e bottone');
    assert.ok(cn.includes("t('de_nome_stesso', 'sostituisce il PDF di questo materiale')"));
    assert.ok(fnDi('_pezziNome').includes("nome: senzaCopia ? '' : _cloneCorrente()"), 'il nome della copia non si scrive due volte');
    /* il PDF delle flashcard nella cartella = il foglio della stampante, con facce e lato */
    const pf = fnDi('_payloadFile');
    assert.ok(pf.includes("_kind === 'flashcards' && typeof window.printFlashcardSheet === 'function'") && pf.includes('Object.assign(_flashOpzioni(fileName), { toDisk: { vaultPath: vaultPath } })'));
    assert.ok(pf.indexOf('printFlashcardSheet') < pf.indexOf('_quizHtml(true, false)'), 'prima del foglio HTML, che resta al quiz');
    const fo = fnDi('_flashOpzioni');
    assert.ok(fo.includes('backside: _flashBack,') && fo.includes('lato: _flashLato,') && fnDi('openFlashModal').includes('printFlashcardSheet(_flashOpzioni(nome))'), 'stampante e «PDF» con le stesse opzioni');
    /* l'uscita annuncia il file scritto e la console apre quello */
    const bl = fnDi('backToList');
    assert.ok(bl.includes('const scritto = _ultimoScritto, setNuovo = _ultimoSet; _ultimoScritto = null; _ultimoSet = null;') && bl.includes("new CustomEvent('mappai-doc-uscito', { detail: { scritto: scritto, set: setNuovo } })"));
    assert.ok(src.includes('reset: function () { _ultimoScritto = null; _ultimoSet = null;'));
    const ec = fs.readFileSync(path.join(ROOT, 'public/js/mappai-elabora-console.js'), 'utf8');
    assert.ok(ec.includes('if (_doc && _doc.editing) _tornaAnteprima(ev && ev.detail && ev.detail.scritto, ev && ev.detail && ev.detail.set);'));
    assert.ok(ec.includes("function _tornaAnteprima(scritto, setNuovo) {") && ec.includes("if (scritto && _doc.natura === 'disk') _doc.relPath = scritto;"));
    const k = ec.indexOf("if (scritto && _doc.natura === 'disk')"), h = ec.indexOf('if (!_haAnteprima())', k - 400);
    assert.ok(k > 0 && h > k, 'il file scritto prima di decidere se c\'è un\'anteprima');
    /* la stampa delle anteprime: l'icona, il nome nel title e nell'aria-label */
    assert.ok(ec.includes("icoStampa.setAttribute('data-lucide', 'printer');") && ec.includes("bStampa.textContent = '';") && ec.includes("bStampa.setAttribute('aria-label', t('de_print', 'Stampa'));"));
    assert.ok(ec.includes('host.appendChild(barra);\n            if (window.safeCreateIcons) window.safeCreateIcons();'));
    const en = fs.readFileSync(path.join(ROOT, 'public/traduzioni/en_translations.js'), 'utf8');
    assert.ok(en.includes('de_nome_ok: "Save",') && en.includes('de_nome_stesso:') && en.includes('de_fc_pdf_ko:'));
});

test('allargamento 13: la scheda dell\'allievo per un mazzo di flashcard dice la scelta della carta, non giusto o sbagliato', () => {
    const LR = require(path.join(ROOT, 'public/js/mappai-live-reports.js'));
    const items = [
        { outcome: 'right', text: 'Che cos\'è la tavoletta?', yourText: 'Sapevo e ricordavo', correctText: 'Argilla cotta' },
        { outcome: 'wrong', text: 'Chi scriveva?', yourText: 'Non conoscevo', correctText: 'Gli scribi' },
        { outcome: 'manual', text: 'Con che cosa?', yourText: 'Non ricordavo', correctText: 'Uno stilo' }
    ];
    const studente = (fc) => ({ joined: 1, questionCount: 3, perStudent: [{ displayName: 'Io', emoji: '', num: '', answered: 3, blankCount: 0, manualCount: 1,
        accuracyPct: 33, items: items, flashcard: fc }] });
    const meta = { mapTitle: 'Scrittura', activity: 'Flashcard — Scrittura', dateStr: '27/10/2026' };
    const h = LR.buildStudentsReportHtml(meta, studente(true));
    /* dal 0132 (veste comune dei report; Giacomo, 28/10: «Sì, allarga») la scelta e il retro stanno nei riquadri, con le loro etichette */
    const sc = (t) => '<span class="mm-rp-et">La tua scelta</span>' + t, re = (t) => '<span class="mm-rp-et">Risposta</span>' + t;
    assert.ok(h.includes(sc('Non conoscevo')) && h.includes(sc('Non ricordavo')) && h.includes(sc('Sapevo e ricordavo')), 'la scelta a parole');
    assert.ok(h.includes(re('Gli scribi')) && h.includes(re('Uno stilo')) && !h.includes(re('Argilla cotta')), 'il retro delle carte non sapute');
    /* dopo lo 0127 (testata dell'allievo su una riga) «carte 3/3» apre la riga dei dati, dopo «sapevo e ricordavo» */
    assert.ok(h.includes('<span class="mm-rp-testo">sapevo e ricordavo · carte 3/3') && !h.includes('accuratezza') && h.includes('title="Carta 1"'));
    assert.ok(!h.includes('Risposta corretta') && !/da correggere/i.test(h), 'niente correzione');
    const q = LR.buildStudentsReportHtml(meta, studente(false));
    assert.ok(q.includes('<span class="mm-rp-et">Risposta corretta</span>Gli scribi') && q.includes('accuratezza') && q.includes('title="Domanda 1"'), 'senza la bandierina, il report di sempre');
});

test('allargamento 14: il carattere scelto per il documento va nel nome del file, nel foglio delle flashcard e nel PDF del quiz', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/js/mappai-doc-editor.js'), 'utf8');
    const fnDi = (nome) => { const i = src.indexOf('function ' + nome + '('); return src.slice(i, src.indexOf('\n    function ', i + 10)); };
    const fn = fnDi('_fontNomeFile');
    assert.ok(fn.includes('const id = _fontCorrente();') && fn.includes('FC.font(id).etichetta : undefined'), 'l\'etichetta del carattere scelto, o niente');
    assert.ok(fnDi('_pezziNome').includes("nome: senzaCopia ? '' : _cloneCorrente(), font: _fontNomeFile() })"), 'nel nome del file');
    assert.ok(fnDi('_flashOpzioni').includes('font: _fontCorrente(),'), 'nel foglio delle flashcard (registraIn)');
    const pf = fnDi('_payloadFile');
    assert.ok(pf.indexOf('precaricaIncorporabile(_fontCorrente() || undefined)') > 0 && pf.indexOf('precaricaIncorporabile') < pf.indexOf('_quizHtml(true, false)'), 'i byte prima del foglio');
    /* il generatore delle flashcard registra il carattere che gli si passa */
    const pd = fs.readFileSync(path.join(ROOT, 'public/js/mappai-print-dossier.js'), 'utf8');
    assert.ok(pd.includes('fontName = (await window.MappAIFont.registraIn(doc, opts.font)) || fontName;'));
    /* buildFileName mette il carattere passato, e senza quello dell'app */
    const PC = require(path.join(ROOT, 'public/js/mappai-pipeline-core.js'));
    PC.setFontEtichetta('Space Mono');
    assert.strictEqual(PC.buildFileName('quiz_mc', null, false, { mappa: 'La Respirazione', font: 'TM Alt' }), 'Quiz-MC-La Respirazione - TM Alt.pdf');
    assert.strictEqual(PC.buildFileName('quiz_mc', null, false, { mappa: 'La Respirazione', font: undefined }), 'Quiz-MC-La Respirazione - Space Mono.pdf');
    PC.setFontEtichetta('');
});

test('allargamento 15: «PDF» scrive il nome della copia PRIMA del carattere, e riscrive il file del mazzo senza chiedere', async () => {
    /* Giacomo, 27/10: «se riapro le flashcard le vedo di nuovo con il vecchio layout e il font precedente, e il nome del vecchio
       file». Il nome usciva «Flashcard-Mappa - TM Alt-MINISTRAL.pdf»: la riga del mazzo cerca «-MINISTRAL» e non lo trovava. */
    const vm = require('vm');
    const el = () => ({ style: {}, setAttribute() { }, appendChild() { }, addEventListener() { }, classList: { add() { }, remove() { } }, querySelector: () => null, querySelectorAll: () => [] });
    const set = { id: 's1', title: 'La Respirazione — Flashcard · MINISTRAL', mode: 'flashcard', clone: 'MINISTRAL', font: 'testme-alt', items: [{ front: 'A?', back: 'a' }] };
    const prova = async (risposta, esistenti, altri) => {
        const ctx = { console: { log() { }, warn() { }, error() { } }, localStorage: { getItem: () => null, setItem() { }, removeItem() { } }, t: (k, f) => f, showToast() { },
            document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => el(), addEventListener() { }, dispatchEvent() { },
                head: { appendChild() { } }, body: el(), documentElement: el() },
            navigator: { language: 'it' }, setTimeout, clearTimeout, getComputedStyle: () => ({}), CustomEvent: function () { },
            appState: { db: { nodes: [{ id: 'r', level: 0, label: 'La Respirazione' }], links: [], studySets: [JSON.parse(JSON.stringify(set))].concat(altri || []) }, rootNodeLabel: 'La Respirazione', activeVaultPath: '/v' } };
        ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx);
        ['mappai-files-core.js', 'mappai-pipeline-core.js', 'mappai-font-core.js', 'mappai-clona-core.js', 'mappai-print-layout.js', 'mappai-nodesheet-core.js', 'mappai-doc-head.js',
            'mappai-docedit-core.js', 'mappai-doc-editor.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/js', f), 'utf8'), ctx, { filename: f }));
        ctx.MappAIPipelineCore.setFontEtichetta('Space Mono');
        const modali = [], scritti = [];
        ctx.MappAIModal = { open(sc) { modali.push(sc.titolo); const v = sc.sezioni[0].campi[0].valore; return Promise.resolve({ azione: 'si', valori: { nome: risposta == null ? v : risposta } }); } };
        ctx.electronAPI = { vaultMaterialsList: async () => ({ ok: true, files: esistenti.map((n) => ({ name: n })) }), saveVaultFile: async (o) => { scritti.push(o.relPath); return { ok: true }; } };
        ctx.printFlashcardSheet = async () => ({ ok: true, base64: 'data:x' });
        const avvisi = [];
        ctx.showToast = (m) => avvisi.push(m);
        ctx.MappAIDocEditor.openSet('s1');
        await ctx.MappAIDocEditor.creaPdf();
        return { modali, scritti, avvisi, sets: JSON.parse(JSON.stringify(ctx.appState.db.studySets)) };
    };
    let r = await prova(null, ['Flashcard-La Respirazione-MINISTRAL - Space Mono.pdf']);
    assert.deepStrictEqual(r.scritti, ['Materiale Studio/Flashcard-La Respirazione-MINISTRAL - TM Alt.pdf'], 'la copia, poi il carattere del documento');
    assert.deepStrictEqual(r.modali, ['Che nome dai a questo materiale?'], 'un modale solo');
    r = await prova(null, ['Flashcard-La Respirazione-MINISTRAL - TM Alt.pdf']);
    assert.deepStrictEqual(r.modali, ['Che nome dai a questo materiale?'], 'il file del mazzo c\'è già: si riscrive senza «c\'è già»');
    assert.deepStrictEqual(r.scritti, ['Materiale Studio/Flashcard-La Respirazione-MINISTRAL - TM Alt.pdf']);
    r = await prova('ripasso', []);
    assert.deepStrictEqual(r.scritti, ['Materiale Studio/Flashcard-La Respirazione-ripasso - TM Alt.pdf'], 'un nome nuovo prende il posto della copia, il carattere resta in fondo');
    /* allargamento 16 (Giacomo, 27/10: «Copia del mazzo»): il nome nuovo è una COPIA del mazzo, con la sua riga; il mazzo di partenza resta */
    assert.strictEqual(r.sets.length, 2, 'una copia in più');
    assert.deepStrictEqual([r.sets[0].id, r.sets[0].clone], ['s1', 'MINISTRAL'], 'il mazzo di partenza com\'era');
    assert.strictEqual(r.sets[1].clone, 'ripasso');
    assert.strictEqual(r.sets[1].title, 'Flashcard - ripasso', 'il titolo della copia, come «Fai una copia»');
    assert.strictEqual(r.sets[1].font, 'testme-alt', 'col carattere del documento');
    assert.notStrictEqual(r.sets[1].id, 's1');
    /* il nome di un'altra copia che c'è già: niente file, niente copia */
    const altra = { id: 's2', title: 'Flashcard - ripasso', mode: 'flashcard', clone: 'ripasso', items: [{ front: 'B?', back: 'b' }] };
    r = await prova('ripasso', [], [altra]);
    assert.deepStrictEqual(r.scritti, [], 'il nome di un\'altra copia non scrive');
    assert.strictEqual(r.sets.length, 2, 'e non copia');
    assert.ok(r.avvisi.some((m) => /Esiste già una copia/.test(m)), 'e lo dice');
    r = await prova('', []);
    assert.deepStrictEqual(r.scritti, [], 'il campo vuoto non scrive');
    assert.strictEqual(r.sets.length, 1, 'e non copia');
    assert.ok(r.avvisi.some((m) => /Serve un nome/.test(m)), 'e lo dice');
});

test('allargamento 16: una copia che c\'è già non si rifà, e la console segue la copia uscendo', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/js/mappai-doc-editor.js'), 'utf8');
    const fnDi = (nome) => { const i = src.indexOf('function ' + nome + '('); return src.slice(i, src.indexOf('\n    function ', i + 10)); };
    const en = fnDi('_esitoNome');
    assert.ok(en.includes("CL.valida(b, _genereCopia(), _cloniDelGenere())") && en.includes("{ tipo: 'duplicato', nome: b }"), 'il nome di un\'altra copia è un duplicato');
    assert.ok(fnDi('_salvaConNome').includes("if (e.tipo === 'duplicato') { toast(t('ec_clona_dup'"), 'e non si scrive');
    assert.ok(fnDi('backToList').includes("detail: { scritto: scritto, set: setNuovo }"));
    const ec = fs.readFileSync(path.join(ROOT, 'public/js/mappai-elabora-console.js'), 'utf8');
    assert.ok(ec.includes("if (setNuovo && _doc.setId) { _doc.setId = String(setNuovo); _doc.id = 'set:' + setNuovo; }"));
    assert.ok(ec.includes('_tornaAnteprima(ev && ev.detail && ev.detail.scritto, ev && ev.detail && ev.detail.set)'));
    const cn = fnDi('_chiediNomeFile');
    assert.ok(cn.includes("t('de_nome_copia', 'nome nuovo: nasce una copia, con la sua riga in ELABORA')") && cn.includes("t('de_nome_vuoto'"), 'la riga sotto il campo lo dice prima');
});

test('allargamento 17: in «2 facce» le soglie sono quelle della carta intera, col margine del retro; alla soglia la carta esce al corpo scelto', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/js/mappai-doc-editor.js'), 'utf8');
    const i = src.indexOf('function _flashLimits('), f = src.slice(i, src.indexOf('\n    function ', i + 10));
    assert.ok(f.includes('if (!_flashBack) return PL.charLimits(G, head);'), 'il pieghevole come prima');
    assert.ok(f.includes("PL.charLimits(Gs, head, { split: 100 })") && f.includes("PL.charLimits(Gs, head, { split: 0 })"), 'domanda e risposta sulla carta intera');
    assert.ok(f.includes('cardW: G.cardW - 2 * m, cardH: G.cardH - 2 * m'), 'col margine del fronte e retro rifinito');
    /* misura: una carta lunga quanto la soglia esce al corpo scelto, una più lunga del 30% esce più piccola */
    const vm = require('vm');
    const mem = new Map();
    const ctx = { console, localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) } };
    ctx.window = ctx; vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/js/mappai-print-layout.js'), 'utf8'), ctx);
    const PL = ctx.MappAIPrintLayout, h = ['LA RESPIRAZIONE', ''];
    const parole = 'La respirazione cellulare trasforma il glucosio in energia usando ossigeno e produce anidride carbonica e acqua come scarti'.split(' ');
    const testo = (n) => { let s = '', k = 0; while (s.length < n) s += (s ? ' ' : '') + parole[k++ % parole.length]; return s.slice(0, n); };
    for (const c of [13, 15, 16]) {
        PL.setCorpo(c);
        const G = PL.flashGeom(), Gs = Object.assign({}, G, { cardW: G.cardW - 2 * G.safe, cardH: G.cardH - 2 * G.safe });
        const q = PL.charLimits(Gs, h, { split: 100 }).question, a = PL.charLimits(Gs, h, { split: 0 }).answer;
        const fit = (n) => PL.fitFlash([{ question: testo(Math.round(q * n)), answer: testo(Math.round(a * n)), explanation: '' }], G, { lines: h },
            { policy: 'uniform', withExpl: true, duplex: true, retro: { safe: G.safe }, senzaTagli: true });
        assert.strictEqual(fit(1).q, c, c + ' pt: alla soglia esce al corpo scelto');
        assert.ok(fit(1.3).q < c, c + ' pt: oltre la soglia rimpicciolisce');
        assert.ok(q > PL.charLimits(G, h).question && a > PL.charLimits(G, h).answer, c + ' pt: più del pieghevole');
    }
    PL.setCorpo(null);
});

test('allargamento 18: corpo, interlinea e facce stanno nel mazzo; aprirlo li mette in vigore, un passo li riscrive, la copia li eredita', async () => {
    const vm = require('vm');
    const el = () => ({ style: {}, setAttribute() { }, appendChild() { }, addEventListener() { }, classList: { add() { }, remove() { } }, querySelector: () => null, querySelectorAll: () => [] });
    const mem = new Map([['mappai_flash_corpo', '15'], ['mappai_flash_facce', '1']]);
    const ctx = { console: { log() { }, warn() { }, error() { } }, localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) },
        t: (k, f) => f, showToast() { },
        document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => el(), addEventListener() { }, dispatchEvent() { },
            head: { appendChild() { } }, body: el(), documentElement: el() },
        navigator: { language: 'it' }, setTimeout, clearTimeout, getComputedStyle: () => ({}), CustomEvent: function () { },
        appState: { db: { nodes: [{ id: 'r', level: 0, label: 'La Respirazione' }], links: [], studySets: [
            { id: 'a', title: 'A', mode: 'flashcard', clone: 'MINISTRAL', items: [{ front: 'A?', back: 'a' }], tipografia: { corpo: 11, interlinea: 1.8, facce: 2 } },
            { id: 'b', title: 'B', mode: 'flashcard', clone: 'altro', items: [{ front: 'B?', back: 'b' }] }] }, rootNodeLabel: 'La Respirazione', activeVaultPath: '/v' } };
    ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx);
    ['mappai-files-core.js', 'mappai-pipeline-core.js', 'mappai-font-core.js', 'mappai-clona-core.js', 'mappai-print-layout.js', 'mappai-nodesheet-core.js', 'mappai-doc-head.js',
        'mappai-docedit-core.js', 'mappai-doc-editor.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/js', f), 'utf8'), ctx, { filename: f }));
    const PL = ctx.MappAIPrintLayout, D = ctx.MappAIDocEditor, sets = () => JSON.parse(JSON.stringify(ctx.appState.db.studySets));
    D.openSet('a');
    assert.deepStrictEqual([PL.corpo(), PL.interlinea(), mem.get('mappai_flash_facce')], [11, 1.8, '2'], 'il mazzo A mette in vigore i suoi');
    D.openSet('b');
    assert.deepStrictEqual([PL.corpo(), mem.get('mappai_flash_facce')], [11, '2'], 'B non ne ha: parte dall\'ultima scelta');
    D.openSet('a');
    D.corpoFlash(+1);
    assert.strictEqual(PL.corpo(), 12);
    await D.save();
    assert.deepStrictEqual(sets()[0].tipografia, { corpo: 12, interlinea: 1.8, facce: 2 }, 'il passo è salvato nel mazzo');
    D.setFacce(1);
    ctx.MappAIModal = { open() { return Promise.resolve({ azione: 'si', valori: { nome: '12 pt' } }); } };
    ctx.electronAPI = { vaultMaterialsList: async () => ({ ok: true, files: [] }), saveVaultFile: async () => ({ ok: true }) };
    ctx.printFlashcardSheet = async () => ({ ok: true, base64: 'data:x' });
    await D.creaPdf();
    const tutti = sets();
    assert.strictEqual(tutti.length, 3, 'la copia');
    assert.deepStrictEqual(tutti[2].tipografia, { corpo: 12, interlinea: 1.8, facce: 1 }, 'la copia parte dalla tipografia del mazzo, col passo appena fatto');
    assert.deepStrictEqual(tutti[0].tipografia, { corpo: 12, interlinea: 1.8, facce: 2 }, 'il mazzo di partenza resta com\'era salvato');
});

test('allargamento 19: il rosso e «Fuori soglia» seguono il foglio — una carta è segnata solo se farebbe uscire il mazzo sotto il corpo scelto', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/js/mappai-doc-editor.js'), 'utf8');
    assert.ok(src.includes('if (pc.q < F.G.q - 0.001) out.push(i);'), 'colpevole = da sola, con la piega del mazzo, sotto il corpo scelto');
    assert.ok(src.includes("return _colpevoli(_flashFit()).map(function (i) { return { i: i }; });"), '«Fuori soglia» e il badge dell\'archivio');
    assert.ok(src.includes('const over = LIM && colpa.indexOf(i) >= 0;'), 'il contatore dell\'anteprima');
    const vm = require('vm');
    const fuori = { innerHTML: '', _deChi: null, querySelector: () => null, querySelectorAll: () => [], addEventListener() { }, setAttribute() { }, classList: { add() { }, remove() { }, toggle() { } }, style: {} };
    const el = () => ({ style: {}, setAttribute() { }, appendChild() { }, addEventListener() { }, classList: { add() { }, remove() { } }, querySelector: () => null, querySelectorAll: () => [] });
    const mem = new Map();
    /* la carta 9 del mazzo vero di Giacomo (209 caratteri di risposta: oltre la soglia di 200 a 16 pt, ma il foglio la stampa a 16) */
    const nove = { front: 'Cosa sono gli alveoli e quale funzione svolgono nella respirazione?', back: 'Gli alveoli sono piccoli sacchetti nei polmoni dove avviene lo scambio dei gas. L\'ossigeno passa dall\'aria inspirata al sangue, mentre l\'anidride carbonica esce dal sangue verso gli alveoli per essere espulsa.' };
    const lunga = { front: 'Che cosa succede?', back: (nove.back + ' ').repeat(2).slice(0, 330) };
    const ctx = { console: { log() { }, warn() { }, error() { } }, localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) },
        t: (k, f) => f, showToast() { },
        document: { getElementById: (id) => (id === 'elab-doc-host' ? fuori : null), querySelector: () => null, querySelectorAll: () => [], createElement: () => el(), addEventListener() { }, dispatchEvent() { },
            head: { appendChild() { } }, body: el(), documentElement: el() },
        navigator: { language: 'it' }, setTimeout, clearTimeout, getComputedStyle: () => ({}), CustomEvent: function () { },
        appState: { db: { nodes: [{ id: 'r', level: 0, label: 'La Respirazione' }], links: [], studySets: [
            { id: 'm', title: 'La Respirazione — Flashcard', mode: 'flashcard', items: [nove, { front: 'Breve?', back: 'Breve.' }, lunga], tipografia: { corpo: 16, interlinea: 1.6, facce: 2 } }] },
            rootNodeLabel: 'La Respirazione', activeVaultPath: '/v' } };
    ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx);
    ['mappai-files-core.js', 'mappai-pipeline-core.js', 'mappai-font-core.js', 'mappai-clona-core.js', 'mappai-print-layout.js', 'mappai-nodesheet-core.js', 'mappai-doc-head.js',
        'mappai-docedit-core.js', 'mappai-quiz-print.js', 'mappai-doc-editor.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/js', f), 'utf8'), ctx, { filename: f }));
    ctx.MappAIDocEditor.openSet('m');
    const html = fuori.innerHTML;
    const contatore = (i) => { const m = html.match(new RegExp('<span class="de-count( over)?" data-count="' + i + '"[^>]*>([^<]*)</span>')); return m ? { rosso: !!m[1], testo: m[2] } : null; };
    assert.ok(contatore(0) && /209\/200$/.test(contatore(0).testo), 'la carta 9: 209 su una soglia di 200 — ' + JSON.stringify(contatore(0)));
    assert.strictEqual(contatore(0).rosso, false, 'ma non è rossa: il foglio la stampa a 16 pt');
    assert.strictEqual(contatore(1).rosso, false);
    assert.strictEqual(contatore(2).rosso, true, 'la carta lunga farebbe uscire il mazzo più piccolo');
    assert.ok(html.includes('Fuori soglia: #3.'), '«Fuori soglia» nomina solo lei');
    /* la stessa misura col foglio: il mazzo senza la carta lunga esce a 16, con lei sotto */
    const PL = ctx.MappAIPrintLayout, G = PL.flashGeom(), h = { lines: ['LA RESPIRAZIONE', ''] };
    const opz = { policy: 'uniform', withExpl: true, duplex: true, retro: { safe: G.safe }, senzaTagli: true };
    const carta = (c) => ({ question: c.front, answer: c.back, explanation: '' });
    assert.strictEqual(PL.fitFlash([carta(nove)], G, h, opz).q, 16);
    assert.ok(PL.fitFlash([carta(nove), carta(lunga)], G, h, opz).q < 16);
});

/* allargamento 23 (Giacomo, 27/10, nella chat ADMIN: «Lo corregga lo 0128 come allargamento: allarga il perimetro dello 0128 al titolo dei
   report LIVE in mappai-live-reports.js.»; il nome: «Come la barra»). Guasto trovato al gate dello 0129: la barra diceva «Sistema Albero ·
   Scelta multipla · Esempio concreto · Report domande», il PDF si salvava «Sistema Albero — domande.pdf» (Electron prende il nome dal <title>). */
test('allargamento 23: il <title> dei report Live è il titolo della barra, quindi anche il nome del PDF', () => {
    const LR = require(path.join(ROOT, 'public/js/mappai-live-reports.js'));
    const meta = { mapTitle: 'Sistema Albero', materiale: 'Scelta multipla · Esempio concreto', activity: 'Quiz', dateStr: '27/10/2026' };
    const titolo = (h) => (/<title>([^<]*)<\/title>/.exec(h) || [])[1];
    const casi = [
        ['buildQuestionsReportHtml', 'Report domande', { joined: 0, questionCount: 0, perQuestion: [] }],
        ['buildStudentsReportHtml', 'Report allievi', { joined: 0, questionCount: 0, perStudent: [] }],
        ['buildTimelineWorkshopReportHtml', 'Report costruzione', {}],
        ['buildSceltaReportHtml', 'Report domande', {}]
    ];
    for (const [fn, coda, res] of casi) {
        const h = LR[fn](meta, res);
        const atteso = 'Sistema Albero · Scelta multipla · Esempio concreto · ' + coda;
        assert.strictEqual(titolo(h), atteso, fn + ': il <title>');
        assert.ok(h.includes('<span style="font-weight:bold;color:#4f46e5">' + atteso + '</span>'), fn + ': la barra dice lo stesso');
        assert.ok(!/<title>[^<]* — /.test(h), fn + ': niente più «<mappa> — …»');
    }
    assert.strictEqual(titolo(LR.buildStudentsReportHtml({ mapTitle: 'La carta' }, { perStudent: [] })), 'La carta · Report allievi', 'senza materiale: la mappa e il report');
});

module.exports = { contesto, registro, impronta, tutte, CORTE, LUNGHE, UNA, NOVE, NODI, flash, nodi };
