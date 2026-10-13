'use strict';
/*
 * pdf-testo-core.test.js — il testo delle pagine PDF senza spazi inventati
 * (packet 0044, docs/tasks/0044-pdf-spazi-inventati.md §6).
 *
 * Gira in Node, senza pdf.js e senza rete: i pezzi di pdf.js sono fixture.
 *  - tests/fixtures/pdf-item/*.json: pagine VERE di testi liberi (art. 5 LDA),
 *    rigenerabili con tests/fixtures/pdf-item/estrai.js;
 *  - qui sotto, fixture SINTETICHE che riproducono una geometria misurata, col
 *    PDF d'origine nel commento (il repo è pubblico: niente righe di dossier).
 *
 * Il criterio di ogni gruppo:
 *  - i casi che CORREGGONO diventano rossi se testoPagina torna a unisciVecchio
 *    (e ogni caso lo dimostra da sé: l'unione vecchia dà un testo diverso);
 *  - i casi di GUARDIA danno lo stesso testo di oggi, e diventano rossi se in
 *    unisciRete si toglie lo spazio aggiunto per il loro motivo;
 *  - le proprietà valgono su OGNI fixture, senza eccezioni.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const T = require('../public/js/mappai-pdf-testo-core.js');

const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures', 'pdf-item');
const leggi = nome => JSON.parse(fs.readFileSync(path.join(FIX, nome), 'utf8')).items;

const senzaSpazi = s => String(s).replace(/\s+/g, '');
const compatta = s => String(s).replace(/\s+/g, ' ').trim();

// Un pezzo come lo dà pdf.js: matrice [h,0,0,h,x,y] (riga orizzontale), larghezza, altezza.
function P(str, x, y, w, h = 10, eol = false) {
    return { str, hasEOL: eol, width: w, height: h, transform: [h, 0, 0, h, x, y] };
}
// Lo spazio che pdf.js codifica come pezzo a sé: altezza 0, larghezza dello spazio.
function SP(x, y, w, h = 10) {
    return { str: ' ', hasEOL: false, width: w, height: 0, transform: [h, 0, 0, h, x, y] };
}
// Il pezzo vuoto di fine riga.
function EOL(x, y, h = 10) {
    return { str: '', hasEOL: true, width: 0, height: 0, transform: [h, 0, 0, h, x, y] };
}
function motivi(items) {
    const c = {};
    T.unisciRete(items, {}, m => { c[m] = (c[m] || 0) + 1; });
    return c;
}

// ── Le fixture sintetiche ────────────────────────────────────────────────────

/* Svizzera, SINTETICA. Geometria dei confini misurata il 26-28/09 sul dossier «La
   Svizzera nella seconda guerra mondiale» (~/Documents/Fonti PDF originali/Storia
   IV media, 6 pagine): corpo 11,49, stessa riga, vuoto fra 0 e 0,0175·corpo, nessun
   motivo della rete. Le parole sono pezzi brevi dei 12 frammenti del packet §7, non
   frasi del dossier (Giacomo, 28/09: niente righe del dossier nel repo). */
function svizzeraSintetica() {
    const h = 11.49, y = 700, sp = 0.25 * h;
    const out = [];
    let x = 72;
    const pezzo = (s, w, vuoto = 0) => { x += vuoto * h; out.push(P(s, x, y, w, h)); x += w; };
    const spazio = () => { out.push(SP(x, y, sp, h)); x += sp; };
    pezzo('L', 7.0); pezzo('a Svizzera', 52.0, 0.001); spazio();
    pezzo('Henr', 24.9); pezzo('i', 3.22, 0); spazio();
    pezzo('Guisan', 36.4); spazio();
    pezzo('neutrali', 40.1); pezzo('tà', 11.79, 0.0097); pezzo(',', 2.87, 0); spazio();
    pezzo('1940', 25.6); pezzo('-', 4.79, 0.0047); pezzo('1944', 25.6, 0.0047); spazio();
    pezzo('Consiglio', 47.3); spazio();
    pezzo('Federale', 45.2); pezzo(',', 2.87, 0.0175);
    out.push(EOL(x, y, h));
    return out;
}

/* Stampa jsPDF di MappAI, SINTETICA. La stampa vera «fatta da una legge, un
   carattere per pezzo» chiesta dal packet §6 non c'è sul disco (cercata il 28/09 in
   Mappe/, Analisi/ e nel Vault, per nome e md5): questa ne riproduce la geometria.
   - un carattere per pezzo, contigui (vuoto 0); gli spazi come pezzi " " larghi
     quanto lo spazio del carattere (0,278·corpo, Helvetica);
   - «[1] .»: dopo «]» un pezzo " " largo 0 e il punto nello stesso punto (§4,
     motivo 'finto');
   - il titolo ridisegnato (alone jsPDF): stesso str, stessa matrice, stessa
     larghezza, consecutivo, senza hasEOL. Misurato il 28/09 su due stampe jsPDF
     2.5.1 di mappe nei vault: 93 pezzi ridisegnati, tutti così. Non si salta.
   Il testo viene dalla Legge edilizia cantonale ticinese (RL 705.100, art. 14),
   testo libero. */
function stampaMappaiSintetica() {
    const out = [];
    const titolo = 'Durata della licenza';
    out.push(P(titolo, 72, 760, 128.6, 14), P(titolo, 72, 760, 128.6, 14), EOL(200.6, 760, 14));
    const h = 10, larg = ch => (ch === ' ' ? 2.78 : /[.,\[\]]/.test(ch) ? 2.78 : /\d/.test(ch) ? 5.56 : 5.0);
    const riga = (testo, y, conNota) => {
        let x = 72;
        for (const ch of testo) {
            const w = larg(ch);
            out.push(ch === ' ' ? SP(x, y, w, h) : P(ch, x, y, w, h));
            x += w;
        }
        if (conNota) {                                   // «[1] .»: " " largo 0, poi il punto lì
            for (const ch of '[1]') { const w = larg(ch); out.push(P(ch, x, y, w, h)); x += w; }
            out.push(SP(x, y, 0, h));
            out.push(P('.', x, y, 2.78, h)); x += 2.78;
        }
        out.push(EOL(x, y, h));
    };
    riga('La licenza edilizia decade se i lavori non vengono', 736, false);
    riga('iniziati entro due anni ', 722, true);
    return out;
}

/* Marked content: pezzi senza `str` (beginMarkedContent…/endMarkedContent), che
   pdf.js dà con includeMarkedContent. L'unione vecchia li rende '' (join),
   la rete li salta. Sintetica. */
function conMarkedContent() {
    return [
        { type: 'beginMarkedContentProps', tag: 'P', id: 'p0' },
        P('Gui', 72, 700, 16.2), { type: 'beginMarkedContentProps', tag: 'Span', id: 'mc1' },
        P('san', 88.2, 700, 17.1), { type: 'endMarkedContent' },
        SP(105.3, 700, 2.5), P('generale', 107.8, 700, 40.0), EOL(147.8, 700),
        { type: 'endMarkedContent' }
    ];
}

// ── Casi che CORREGGONO l'unione di oggi ─────────────────────────────────────
// Ognuno: il testo nuovo è quello atteso, e l'unione vecchia (nativa:false) NO.

function corregge(items, atteso) {
    assert.equal(T.testoPagina(items), atteso);
    assert.notEqual(T.testoPagina(items, { nativa: false }), atteso, 'il caso deve distinguere dall\'unione vecchia');
}

test('CORREGGE: frammenti a metà parola con vuoto ~0 («Henr»+«i» → «Henri»)', () => {
    corregge([P('Henr', 100, 700, 24.9, 11.49), P('i', 124.9, 700, 3.22, 11.49), SP(128.12, 700, 2.87, 11.49), P('Guisan', 130.99, 700, 36.4, 11.49)],
        'Henri Guisan');
});

test('CORREGGE: maiuscoletto con pezzo-spazio largo 0 («I»+« »+«TALIA» → «ITALIA»)', () => {
    const items = [P('I', 72, 600, 4.4, 12), { str: ' ', hasEOL: false, width: 0, height: 0, transform: [9.6, 0, 0, 9.6, 76.4, 600] }, P('TALIA', 76.4, 600, 33.1, 9.6)];
    corregge(items, 'ITALIA');
    assert.deepEqual(motivi(items), { finto: 1 });
});

test('CORREGGE: pedice chimico («H»+«2»+«O» → «H2O»)', () => {
    corregge([P('H', 50, 500, 8.0, 10), P('2', 58.0, 497, 4.0, 6), P('O', 62.0, 500, 7.8, 10)], 'H2O');
});

test('CORREGGE: virgola staccata («Federale»+«,» → «Federale,»)', () => {
    corregge([P('Federale', 200, 650, 45.2, 11.49), P(',', 245.4, 650, 2.87, 11.49)], 'Federale,');
});

test('CORREGGE: pezzo vuoto con hasEOL (uno spazio solo, mai \\n, niente bordo in coda)', () => {
    const items = [P('fine', 72, 700, 20), EOL(92, 700), P('riga', 72, 686, 20), EOL(92, 686)];
    corregge(items, 'fine riga');
    assert.ok(!/\n/.test(T.unisciRete(items)), 'nemmeno prima della compattazione');
});

test('CORREGGE: marked content senza str (saltato, non diventa uno spazio)', () => {
    corregge(conMarkedContent(), 'Guisan generale');
});

test('CORREGGE: la Svizzera sintetica — i frammenti dell\'unione vecchia spariscono', () => {
    const items = svizzeraSintetica();
    const vecchio = compatta(T.unisciVecchio(items));
    ['L a Svizzera', 'Henr i', 'neutrali tà', 'Federale ,', '1940 - 1944'].forEach(f => assert.ok(vecchio.includes(f), 'la fixture riproduce «' + f + '»'));
    corregge(items, 'La Svizzera Henri Guisan neutralità, 1940-1944 Consiglio Federale,');
    assert.deepEqual(motivi(items), {}, 'come sul PDF vero: nessun motivo della rete, bastano gli spazi di pdf.js');
});

// ── Casi di GUARDIA: lo stesso testo di oggi, grazie allo spazio del loro motivo ──

function guardia(items, atteso, motivo) {
    assert.equal(T.testoPagina(items), atteso);
    assert.equal(compatta(T.unisciVecchio(items)), atteso, 'lo stesso testo dell\'unione di oggi');
    assert.ok(motivi(items)[motivo] >= 1, 'lo spazio viene dal motivo ' + motivo);
}

test('GUARDIA avanti: «10»+«a)» con vuoto di 0,5·altezza → «10 a)»', () => {
    guardia([P('10', 72, 700, 10, 10), P('a)', 87, 700, 8.3, 10)], '10 a)', 'avanti');
});

test('GUARDIA riga: cambio di riga senza hasEOL → spazio', () => {
    guardia([P('fine', 300, 700, 20, 10), P('Inizio', 72, 686, 28, 10)], 'fine Inizio', 'riga');
});

test('GUARDIA indietro: ritorno indietro → spazio; dopo un\'apertura e prima di una chiusura no', () => {
    guardia([P('parola', 100, 700, 30, 10), P('altra', 127, 700, 24, 10)], 'parola altra', 'indietro');
    // le due eccezioni: la punteggiatura dopo il corsivo torna indietro fino a −0,29
    assert.equal(T.testoPagina([P('(', 100, 700, 3.3, 10), P('nota', 101, 700, 18, 10)]), '(nota');
    assert.equal(T.testoPagina([P('nota', 100, 700, 20, 10), P(')', 117, 700, 3.3, 10)]), 'nota)');
});

test('GUARDIA apice: «2002 1» (OFPr p1) e «1 La licenza» (legge edilizia) restano staccati', () => {
    const ofpr = leggi('ofpr-p1.json'), le = leggi('le-legge-edilizia.json');
    assert.ok(T.testoPagina(ofpr).includes('del 13 dicembre 2002 1 sulla formazione'));
    assert.ok(compatta(T.unisciVecchio(ofpr)).includes('del 13 dicembre 2002 1 sulla formazione'));
    assert.ok(motivi(ofpr).apice >= 1);
    assert.ok(T.testoPagina(le).includes('Art. 2 1 La licenza edilizia'));
    assert.ok(compatta(T.unisciVecchio(le)).includes('Art. 2 1 La licenza edilizia'));
    assert.ok(motivi(le).apice >= 1);
});

// ── La stampa di MappAI e i limiti ───────────────────────────────────────────

test('stampa jsPDF sintetica: un carattere per pezzo, «[1].», titolo ridisegnato che resta', () => {
    const items = stampaMappaiSintetica();
    assert.equal(T.testoPagina(items),
        'Durata della licenza Durata della licenza La licenza edilizia decade se i lavori non vengono iniziati entro due anni [1].');
    assert.ok(compatta(T.unisciVecchio(items)).startsWith('Durata della licenza Durata della licenza L a l i c e n z a'));
    assert.equal(motivi(items).finto, 1);
});

test('limite dichiarato: testo spaziato dentro un solo str resta com\'è («S I N T E S I»)', () => {
    assert.equal(T.testoPagina([P('S I N T E S I', 72, 800, 90, 14)]), 'S I N T E S I');
});

// ── Proprietà su OGNI fixture ────────────────────────────────────────────────

const FIXTURE = {
    'ofpr-p1.json': () => leggi('ofpr-p1.json'),
    'le-legge-edilizia.json': () => leggi('le-legge-edilizia.json'),
    'svizzera sintetica': svizzeraSintetica,
    'stampa jsPDF sintetica': stampaMappaiSintetica,
    'marked content': conMarkedContent
};

test('le fixture JSON sono pagine vere e piene (non un file vuoto che fa passare tutto)', () => {
    ['ofpr-p1.json', 'le-legge-edilizia.json'].forEach(f => {
        const items = leggi(f);
        assert.ok(items.length > 100, f);
        assert.ok(T.testoPagina(items).length > 1500, f);
    });
});

Object.entries(FIXTURE).forEach(([nome, crea]) => {
    test('proprietà su «' + nome + '»: una riga, niente spazi doppi né bordi; cambiano solo gli spazi; nativa:false = join', () => {
        const items = crea();
        const nuovo = T.testoPagina(items);
        assert.ok(nuovo.length > 0);
        assert.ok(!/\n/.test(nuovo), 'nessun a capo');
        assert.ok(!/\s{2}/.test(nuovo), 'nessuno spazio doppio');
        assert.equal(nuovo, nuovo.trim(), 'niente bordi');
        assert.ok(!/[^\S ]/.test(nuovo), 'l\'unico spazio è " "');
        assert.equal(senzaSpazi(nuovo), senzaSpazi(T.unisciVecchio(items)), 'la sequenza dei non-spazi è identica');
        assert.equal(T.testoPagina(items, { nativa: false }), items.map(i => i.str).join(' '), 'byte per byte');
        assert.equal(T.unisciVecchio(items), items.map(i => i.str).join(' '));
    });
});

test('testoPagina: default acceso, bordi e vuoti', () => {
    const items = [P('a', 0, 0, 5), P('b', 20, 0, 5)];
    assert.equal(T.testoPagina(items), T.testoPagina(items, {}));
    assert.equal(T.testoPagina(items), T.testoPagina(items, { nativa: true }));
    assert.equal(T.testoPagina([]), '');
    assert.equal(T.testoPagina(null), '');
    assert.equal(T.testoPagina([], { nativa: false }), '');
    assert.equal(T.unisciVecchio(null), '');
});

// ── ELABORA: indice e chiave senza spazi ─────────────────────────────────────

function pezziDi(indice, chiave) {
    const pos = indice.testo.indexOf(chiave);
    return pos < 0 ? null : [...new Set(indice.pezzo.slice(pos, pos + chiave.length))];
}

test('ELABORA: la chiave di «Henr i Guisan» e quella di «Henri Guisan» ritrovano gli stessi pezzi', () => {
    const items = [P('Henr', 100, 700, 24.9), P('i', 124.9, 700, 3.22), SP(128.12, 700, 2.87), P('Guisan', 130.99, 700, 36.4)];
    const I = T.indiceSenzaSpazi(items);
    assert.equal(I.testo, 'henriguisan');
    assert.equal(I.pezzo.length, I.testo.length);
    assert.deepEqual(pezziDi(I, T.chiaveSenzaSpazi('Henr i Guisan')), [0, 1, 3]);
    assert.deepEqual(pezziDi(I, T.chiaveSenzaSpazi('Henri Guisan')), [0, 1, 3]);
    // e lo stesso vale per i pezzi dell'estrazione vecchia (la pagina è la stessa)
    assert.equal(T.chiaveSenzaSpazi('henr i  guisan'), T.chiaveSenzaSpazi('Henri Guisan'));
});

test('ELABORA: con «İ» l\'indice ha una voce per unità di codice', () => {
    assert.equal('İ'.toLowerCase().length, 2, 'premessa: toLowerCase allunga');
    const I = T.indiceSenzaSpazi([P('İ', 0, 0, 5), P('zmir', 5, 0, 20)]);
    assert.equal(I.testo, 'i̇zmir');
    assert.equal(I.testo.length, 6);
    assert.deepEqual(I.pezzo, [0, 0, 1, 1, 1, 1]);
    assert.equal(T.chiaveSenzaSpazi('İzmir'), I.testo);
});

test('ELABORA: una frase greca in maiuscolo con sigma finale si ritrova', () => {
    const frase = 'ΟΔΟΣ ΚΑΙ ΛΟΓΟΣ';
    // premessa: abbassare la stringa intera (come _normKey) e carattere per carattere divergono
    assert.notEqual(frase.toLowerCase(), [...frase].map(c => c.toLowerCase()).join(''));
    const items = [P('ΟΔΟΣ', 0, 0, 30), SP(30, 0, 2.5), P('ΚΑΙ', 32.5, 0, 22), SP(54.5, 0, 2.5), P('ΛΟΓΟΣ', 57, 0, 38)];
    const I = T.indiceSenzaSpazi(items);
    assert.deepEqual(pezziDi(I, T.chiaveSenzaSpazi(frase)), [0, 2, 4]);
    // la chiave di ELABORA parte da _normKey(frase), abbassata per intero: «…λογος»
    assert.deepEqual(pezziDi(I, T.chiaveSenzaSpazi(frase.replace(/\s+/g, ' ').trim().toLowerCase())), [0, 2, 4]);
    // e dal PDF in minuscolo, col ς vero
    assert.deepEqual(pezziDi(T.indiceSenzaSpazi([P('οδος και λογος', 0, 0, 90)]), T.chiaveSenzaSpazi(frase)), [0]);
});

test('ELABORA: indice senza marked content né spazi, allineato alle unità di codice', () => {
    const items = conMarkedContent();
    const I = T.indiceSenzaSpazi(items);
    assert.equal(I.testo, 'guisangenerale');
    assert.equal(I.pezzo.length, I.testo.length);
    assert.deepEqual([...new Set(I.pezzo)], [1, 3, 6]);          // gli indici restano quelli di `items`
    assert.deepEqual(T.indiceSenzaSpazi(null), { testo: '', pezzo: [] });
    assert.equal(T.chiaveSenzaSpazi(undefined), '');
});

/* _matchColoredItems vive dentro l'IIFE di mappai-elabora.js: si estrae dal
   sorgente e si esegue con un `window` finto. È la funzione vera, non una copia. */
function matchColoredItems(finestra) {
    const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'mappai-elabora.js'), 'utf8');
    const i = src.indexOf('function _matchColoredItems(');
    const j = src.indexOf('function _paintPdfHighlights(', i);
    assert.ok(i >= 0 && j > i, '_matchColoredItems trovata nel sorgente');
    return new Function('window', src.slice(i, j) + '\nreturn _matchColoredItems;')(finestra);
}
const normKey = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();   // = _normKey di ELABORA

test('ELABORA _matchColoredItems (sorgente vero): stessi pezzi colorati col testo vecchio e col nuovo', () => {
    const match = matchColoredItems({ MappAIPdfTesto: T });
    const tc = { items: [P('Henr', 100, 700, 24.9), P('i', 124.9, 700, 3.22), SP(128.12, 700, 2.87), P('Guisan', 130.99, 700, 36.4)] };
    const vecchia = match(tc, [{ n: normKey('Henr i Guisan'), color: '#f00', strength: 'strong' }]);
    const nuova = match(tc, [{ n: normKey('Henri Guisan'), color: '#f00', strength: 'strong' }]);
    assert.deepEqual([...vecchia.keys()], [0, 1, 3]);
    assert.deepEqual([...nuova.keys()], [0, 1, 3]);
    assert.deepEqual(vecchia.get(1), { color: '#f00', strength: 'strong' });
    // greco maiuscolo con sigma finale, passando da _normKey
    const greco = { items: [P('ΟΔΟΣ', 0, 0, 30), SP(30, 0, 2.5), P('ΚΑΙ', 32.5, 0, 22), SP(54.5, 0, 2.5), P('ΛΟΓΟΣ', 57, 0, 38)] };
    assert.deepEqual([...match(greco, [{ n: normKey('ΟΔΟΣ ΚΑΙ ΛΟΓΟΣ'), color: '#0f0' }]).keys()], [0, 2, 4]);
    // la soglia vale sulla chiave senza spazi: 7 lettere si saltano anche se la frase ne ha 13 con gli spazi
    assert.equal(match({ items: [P('a b c d e f g', 0, 0, 60)] }, [{ n: 'a b c d e f g', color: '#00f' }]).size, 0);
    // forte batte debole, debole non scavalca forte
    const due = match(tc, [{ n: 'henri guisan', color: 'debole', strength: 'weak' }, { n: 'henriguisan', color: 'forte' }]);
    assert.equal(due.get(0).color, 'forte');
});

test('ELABORA _matchColoredItems: core assente → Map vuota, come senza testo', () => {
    const match = matchColoredItems({});
    const r = match({ items: [P('Henri Guisan', 0, 0, 60)] }, [{ n: 'henri guisan', color: '#f00' }]);
    assert.ok(r instanceof Map);
    assert.equal(r.size, 0);
    assert.equal(matchColoredItems({ MappAIPdfTesto: T })({ items: [] }, [{ n: 'henri guisan' }]).size, 0);
});

// ── Cablaggio (leggendo i sorgenti: senza Electron non c'è altra prova) ──────

function corpo(src, inizio, fine) {
    const i = src.indexOf(inizio);
    const j = src.indexOf(fine, i + inizio.length);
    assert.ok(i >= 0 && j > i, 'trovato: ' + inizio);
    return src.slice(i, j);
}

test('cablaggio: extractPdfPages delega a MappAIPdfTesto.testoPagina, con l\'interruttore, senza copia dell\'unione vecchia', () => {
    const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
    const f = corpo(app, 'window.extractPdfPages = async function', 'window.extractTextFromPDF');
    assert.ok(f.includes('MappAIPdfTesto.testoPagina(content.items'), 'chiama il core');
    assert.ok(!/\.join\(\s*(["'])\s\1\s*\)/.test(f), 'nessun .join(" ")');
    assert.ok(!/\.str\)\s*\.join/.test(f), 'nessuna seconda unione dei pezzi');
    assert.ok(/localStorage\.getItem\('mappai_pdf_unione_nativa'\)\s*!==\s*'0'/.test(f), 'interruttore: \'0\' = unione vecchia, assente = acceso');
    assert.ok(/try\s*\{[^}]*mappai_pdf_unione_nativa/.test(f), 'letto dentro un try');
    assert.ok(/testoPagina\(content\.items,\s*\{\s*nativa\s*\}\s*\)/.test(f), 'l\'interruttore arriva al core (inv. 1)');
    assert.ok(/throw new Error\([^)]*MappAIPdfTesto/.test(f), 'core mancante → errore chiaro');
    // il core si legge solo DENTRO la funzione (il reader copia app.js e non ha il core);
    // i commenti non contano, sono le letture che contano
    const codice = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const letture = s => codice(s).split('MappAIPdfTesto').length - 1;
    assert.ok(letture(f) >= 2);
    assert.equal(letture(app), letture(f), 'nessuna lettura fuori da extractPdfPages');
});

test('cablaggio: _matchColoredItems usa indiceSenzaSpazi e chiaveSenzaSpazi', () => {
    const el = fs.readFileSync(path.join(ROOT, 'public', 'js', 'mappai-elabora.js'), 'utf8');
    const f = corpo(el, 'function _matchColoredItems(', 'function _paintPdfHighlights(');
    assert.ok(f.includes('.indiceSenzaSpazi(items)'));
    assert.ok(f.includes('.chiaveSenzaSpazi(cs && cs.n)'));
    assert.ok(!f.includes('indexOf(cs.n'), 'la chiave non è più cs.n così com\'è');
});

test('cablaggio: l\'unione vecchia vive solo in unisciVecchio (inv. 6)', () => {
    const dir = path.join(ROOT, 'public', 'js');
    const copie = fs.readdirSync(dir).filter(f => f.endsWith('.js') && !f.endsWith('.min.js'))
        .filter(f => /\.str\)\s*\.join\(/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
    assert.deepEqual(copie, ['mappai-pdf-testo-core.js']);
});

test('cablaggio: index.html carica il core dopo app.js e boilerplate-core, prima di admin_prompts.js', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const src = [...html.matchAll(/<script\b[^>]*\bsrc="([^"?#]+)[^"]*"/g)].map(m => m[1]);
    const pos = n => src.indexOf('js/' + n);
    assert.ok(pos('mappai-pdf-testo-core.js') >= 0, 'il core è caricato');
    assert.equal(src.filter(s => s === 'js/mappai-pdf-testo-core.js').length, 1, 'una volta sola');
    assert.ok(pos('app.js') < pos('mappai-pdf-testo-core.js'));
    assert.equal(pos('mappai-pdf-testo-core.js'), pos('mappai-boilerplate-core.js') + 1, 'subito dopo boilerplate-core');
    assert.ok(pos('mappai-pdf-testo-core.js') < pos('admin_prompts.js'));
    assert.ok(pos('mappai-pdf-testo-core.js') < pos('mappai-elabora.js'));
});

// ── Le intestazioni ripetute, dalla POSIZIONE (packet 0045) ──────────────────
/* docs/tasks/0045-intestazioni-dalla-posizione.md §6. Pagine SINTETICHE (parole
   inventate, niente righe di dossier) con un viewport finto che riproduce le
   formule di pdf.js 3.4.120, misurate il 28/09 con `page.getViewport({ scale: 1,
   rotation })` su una pagina A4 (595×842):
     rotazione 0  → punto(x, y) = [x, 842 − y], altezza 842;
     rotazione 90 → punto(x, y) = [y, x],       altezza 595.
   Fascia alta: y' < 84,2 (raw y > 757,8); fascia bassa: y' > 757,8 (raw y < 84,2). */
const A4 = { W: 595, H: 842 };
function VP(rot = 0) {
    return rot === 90 ? { height: A4.W, punto: (x, y) => [y, x] }
        : { height: A4.H, punto: (x, y) => [x, A4.H - y] };
}
// una riga orizzontale: pezzi-parola separati da pezzi-spazio, come li dà pdf.js
function riga(testo, x, y, h = 10, eol = true) {
    const out = [], parole = testo.split(' ');
    parole.forEach((p, k) => {
        const w = p.length * 0.5 * h;
        out.push(P(p, x, y, w, h)); x += w;
        if (k < parole.length - 1) { out.push(SP(x, y, 0.25 * h, h)); x += 0.25 * h; }
    });
    if (eol) out.push(EOL(x, y, h));
    return out;
}
// un pezzo su una pagina ruotata di 90°, dato nelle coordinate del VIEWPORT (xv, yv):
// nello spazio della pagina il testo corre lungo y, così a schermo si legge diritto
function PR(str, xv, yv, w, h = 10, eol = false) {
    return { str, hasEOL: eol, width: w, height: h, transform: [0, h, -h, 0, yv, xv] };
}
// = la composizione di extractPdfPages (app.js): `text` è quello del 0044,
// `testoPerModello` le pagine senza i pezzi esclusi, ciascuna con testoPagina
function estrai(pagine, vp = VP()) {
    const pages = pagine.map((items, i) => ({ n: i + 1, text: T.testoPagina(items) }));
    const text = pages.map(p => p.text).join('\n');
    const perPosizione = pagine.map(items => ({ items, vp }));
    const r = T.intestazioniRipetute(perPosizione);
    const testoPerModello = r.elenco.length
        ? perPosizione.map((pg, p) => r.escludi[p].size
            ? T.testoPagina(pg.items.filter((_, k) => !r.escludi[p].has(k))) : pages[p].text).join('\n')
        : text;
    return { text, pages, testoPerModello, intestazioni: r.elenco, escludi: r.escludi };
}

function paginaStoria(n) {
    return [
        ...riga('Storia IV Media', 72, 800, 10, false),              // testata a sinistra (y' = 42)
        P('pag. ' + n, 490, 800, 30, 10, true),                        // a destra, stessa riga, vuoto di 348 pt
        ...riga('Il corpo della pagina ' + n + ' parla di altro', 72, 600),
        ...riga('e continua sulla riga dopo', 72, 586)
    ];
}

test('0045 chiaveRipetuta: solo lettere e cifre, cifre rese uguali, minuscole', () => {
    assert.equal(T.chiaveRipetuta('pag. 3'), 'pag#');
    assert.equal(T.chiaveRipetuta('Pag 14'), T.chiaveRipetuta('pag. 3'));
    assert.equal(T.chiaveRipetuta('pagina 1 di 9'), 'pagina#di#');
    assert.equal(T.chiaveRipetuta('> Repubblica e Cantone Ticino'), 'repubblicaecantoneticino');
    assert.equal(T.chiaveRipetuta('© OECD 2026'), 'oecd#');
    assert.equal(T.chiaveRipetuta('Città – Società'), 'cittàsocietà');
    assert.equal(T.chiaveRipetuta('3'), '#');
});

test('0045 «Storia IV Media» a sinistra e «pag. N» a destra in alto, su 4 pagine: i due segmenti tolti da tutte e 4', () => {
    const pagine = [1, 2, 3, 4].map(paginaStoria);
    const e = estrai(pagine);
    assert.deepEqual(e.intestazioni, [
        { testo: 'Storia IV Media', fascia: 'alto', pagine: 4 },
        { testo: 'pag. 1', fascia: 'alto', pagine: 4 }
    ]);
    const perModello = e.testoPerModello.split('\n');
    assert.equal(perModello.length, 4, 'una riga per pagina');
    perModello.forEach((t, p) => {
        assert.equal(t, 'Il corpo della pagina ' + (p + 1) + ' parla di altro e continua sulla riga dopo');
        assert.ok(e.pages[p].text.startsWith('Storia IV Media pag. ' + (p + 1) + ' '), 'text resta intero');
        // tolti esattamente i quattro pezzi della testata: «Storia», «IV», «Media», «pag. N»
        assert.deepEqual([...e.escludi[p]].sort((a, b) => a - b), [0, 2, 4, 5]);
    });
});

test('0045 la stessa frase ripetuta a metà pagina su 4 pagine: NON tolta (è fuori dalle fasce)', () => {
    const pagine = [1, 2, 3, 4].map(n => [
        ...riga('Ripasso del capitolo precedente', 72, 421),          // y' = 421: metà pagina
        ...riga('Testo proprio della pagina ' + n, 72, 400)
    ]);
    const e = estrai(pagine);
    assert.deepEqual(e.intestazioni, []);
    assert.ok(e.escludi.every(s => s.size === 0));
    assert.equal(e.testoPerModello, e.text);
    // fuori dalle fasce anche a un passo dal bordo della fascia (y' = 85 e 757)
    const vicine = [1, 2, 3, 4].map(n => [...riga('Quasi in cima', 72, A4.H - 85), ...riga('Quasi in fondo', 72, A4.H - 757),
        ...riga('Corpo ' + n, 72, 400)]);
    assert.deepEqual(estrai(vicine).intestazioni, []);
});

test('0045 soglia = massimo fra 3 pagine e metà delle pagine', () => {
    const doc = (n, conTestata) => Array.from({ length: n }, (_, p) => [
        ...(conTestata.includes(p) ? riga('Scheda di laboratorio', 72, 800) : []),
        ...riga('Contenuto della pagina ' + (p + 1), 72, 500)
    ]);
    // su 2 pagine di 5: NON tolta (servono 3)
    const due = estrai(doc(5, [0, 1]));
    assert.deepEqual(due.intestazioni, []);
    assert.equal(due.testoPerModello, due.text);
    // su 3 di 5: tolta (3 = max(3, ⌈2,5⌉))
    assert.deepEqual(estrai(doc(5, [0, 1, 2])).intestazioni, [{ testo: 'Scheda di laboratorio', fascia: 'alto', pagine: 3 }]);
    // su 3 di 8: NON tolta (servono ⌈8·0,5⌉ = 4); su 4 di 8: tolta
    assert.deepEqual(estrai(doc(8, [0, 1, 2])).intestazioni, []);
    assert.deepEqual(estrai(doc(8, [0, 1, 2, 3])).intestazioni, [{ testo: 'Scheda di laboratorio', fascia: 'alto', pagine: 4 }]);
});

test('0045 un documento di 2 pagine: nessuna intestazione', () => {
    const e = estrai([paginaStoria(1), paginaStoria(2)]);
    assert.deepEqual(e.intestazioni, []);
    assert.equal(e.escludi.length, 2);
    assert.ok(e.escludi.every(s => s.size === 0));
    assert.equal(e.testoPerModello, e.text);
    assert.deepEqual(T.intestazioniRipetute([]), { escludi: [], elenco: [] });
});

test('0045 un numero di pagina nudo in basso («3», «- 3 -»): non tolto, servono due lettere', () => {
    const pagine = [1, 2, 3, 4].map(n => [
        ...riga('Testo della pagina ' + n + ' senza testatina', 72, 500),
        P(String(n), 290, 30, 5, 10, true),                             // y' = 812: fascia bassa
        P('- ' + n + ' -', 520, 812, 20, 10, true)                      // y' = 30: fascia alta
    ]);
    const e = estrai(pagine);
    assert.deepEqual(e.intestazioni, []);
    assert.equal(e.testoPerModello, e.text);
    assert.ok(e.text.split('\n').every((t, p) => t.includes(' ' + (p + 1) + ' - ' + (p + 1) + ' -')));
});

test('0045 una pagina ruotata di 90°: la fascia si calcola nelle coordinate del viewport', () => {
    // a schermo: «Atlante regionale» in cima (y' = 20), il paragrafo a metà (y' = 300)
    const pagine = [1, 2, 3, 4].map(n => [
        PR('Atlante regionale', 300, 20, 85, 10, true),
        PR('Paragrafo proprio della pagina ' + n, 72, 300, 150, 10, true)
    ]);
    const e = estrai(pagine, VP(90));
    assert.deepEqual(e.intestazioni, [{ testo: 'Atlante regionale', fascia: 'alto', pagine: 4 }]);
    assert.deepEqual(e.testoPerModello.split('\n'), [1, 2, 3, 4].map(n => 'Paragrafo proprio della pagina ' + n));
    // controprova: con le coordinate grezze della pagina (viewport non ruotato) la
    // testata starebbe a metà (raw y = 300) e il paragrafo in fondo (raw y = 72)
    const grezzo = estrai(pagine, VP(0));
    assert.deepEqual(grezzo.intestazioni.map(x => x.testo), ['Paragrafo proprio della pagina 1']);
});

test('0045 «…fine» e «Inizio…» separati da un piè di pagina tolto: restano separati da uno spazio', () => {
    const pagine = [1, 2, 3, 4].map(n => [
        P('la frase ' + n + ' arriva alla fine', 72, 420, 170),           // senza hasEOL
        P('Scheda di scienze', 72, 30, 85, 10, true),                      // piè di pagina in mezzo all'ordine di lettura
        P('Inizio della frase seguente', 72, 406, 130, 10, true)
    ]);
    const e = estrai(pagine);
    assert.deepEqual(e.intestazioni, [{ testo: 'Scheda di scienze', fascia: 'basso', pagine: 4 }]);
    e.testoPerModello.split('\n').forEach((t, p) => {
        assert.equal(t, 'la frase ' + (p + 1) + ' arriva alla fine Inizio della frase seguente');
        assert.ok(!t.includes('fineInizio'), 'nessuna parola incollata');
    });
    assert.ok(e.text.includes('fine Scheda di scienze Inizio'), 'text resta intero');
});

test('0045 `text` identico al 0044; i caratteri tolti sono solo quelli dei pezzi esclusi, tutti nelle fasce', () => {
    const pagine = [1, 2, 3, 4, 5].map(n => [
        ...paginaStoria(n),
        P('parte finale ' + n, 72, 420, 70),
        P('pagina ' + n + ' di 5', 480, 25, 45, 10, true),                // piè di pagina (y' = 817)
        P('ripresa', 72, 406, 35, 10, true)
    ]);
    const prima = JSON.stringify(pagine);
    const text0044 = pagine.map(items => T.testoPagina(items)).join('\n');   // = extractPdfPages del 0044
    const e = estrai(pagine);
    assert.equal(JSON.stringify(pagine), prima, 'il core non tocca i pezzi');
    assert.equal(e.text, text0044);
    assert.equal(e.pages.map(p => p.text).join('\n'), text0044);
    assert.deepEqual(e.intestazioni.map(x => [x.testo, x.fascia, x.pagine]),
        [['Storia IV Media', 'alto', 5], ['pag. 1', 'alto', 5], ['pagina 1 di 5', 'basso', 5]]);
    const perModello = e.testoPerModello.split('\n');
    assert.equal(perModello.length, pagine.length);
    pagine.forEach((items, p) => {
        const tolti = items.filter((_, k) => e.escludi[p].has(k));
        const restano = items.filter((_, k) => !e.escludi[p].has(k));
        assert.equal(senzaSpazi(perModello[p]), senzaSpazi(restano.map(i => i.str).join('')), 'restano tutti gli altri caratteri');
        assert.equal(senzaSpazi(e.pages[p].text).length - senzaSpazi(perModello[p]).length,
            senzaSpazi(tolti.map(i => i.str).join('')).length, 'mancano solo quelli dei pezzi esclusi');
        tolti.forEach(it => {
            const rel = VP().punto(it.transform[4], it.transform[5])[1] / A4.H;
            assert.ok(rel < 0.1 || rel > 0.9, 'pezzo tolto fuori dalle fasce: ' + it.str);
        });
        assert.ok(perModello[p].includes('finale ' + (p + 1) + ' ripresa'), 'corpo prima e dopo il piè separati');
    });
});

// ── 0045, riparazione del 28/09: i numeri che cambiano ───────────────────────
/* I verificatori, sul corpus di 743 PDF: con le cifre rese uguali nella chiave,
   finiva fra le intestazioni anche testo che CAMBIA da una pagina all'altra —
   «Art. 3/7/9» nella prima riga di un regolamento (rel 0,097), «Settimana N» e le
   date di un piano settimanale. Ora la chiave raggruppa e basta: i numeri o
   seguono la pagina (uno solo, su tutte le occorrenze, senza salti) o sono
   identici. Parole inventate; la geometria è quella dei casi veri. */

// una pagina con un pezzo nella fascia alta (y' = 80 → rel 0,095) e il corpo a metà
function paginaCon(testata, corpo, yv = 80) {
    return [...(testata ? riga(testata, 72, A4.H - yv) : []), ...riga(corpo, 72, 500)];
}

test('0045 riparazione: «Art. 3», «Art. 7», «Art. 9» in cima a tre pagine su quattro NON sono tolti (cambiano senza seguire la pagina)', () => {
    const pagine = [null, 'Art. 3', 'Art. 7', 'Art. 9'].map((t, p) => paginaCon(t, 'Testo del regolamento ' + (p + 1)));
    const e = estrai(pagine);
    assert.equal(T.chiaveRipetuta('Art. 3'), T.chiaveRipetuta('Art. 9'), 'la chiave li raggruppa: decide il gruppo');
    assert.deepEqual(e.intestazioni, []);
    assert.ok(e.escludi.every(s => s.size === 0));
    assert.equal(e.testoPerModello, e.text);
    // lo stesso per le etichette di un quiz stampato: «DOMANDA 3», «DOMANDA 6»…
    const quiz = [3, 6, 9, 12].map(d => paginaCon('DOMANDA ' + d, 'Testo della domanda ' + d, 67));
    assert.deepEqual(estrai(quiz).intestazioni, []);
});

test('0045 riparazione: il titolo di ogni pagina di un piano settimanale resta; il piè identico e «pagina N di 36» no', () => {
    const settimane = [6, 7, 8, 9, 11, 12, 13, 14];                         // la 10 manca: non è un numero di pagina
    const date = ['05.10', '12.10', '19.10', '26.10', '09.11', '16.11', '23.11', '30.11'];
    const pagine = settimane.map((s, p) => [
        ...riga('Settimana ' + s + ' fase prova', 72, A4.H - 56),
        ...riga('Borgo · ' + date[p] + '.2026', 400, A4.H - 56),          // stessa riga, segmento a sé
        ...riga('Attività della settimana ' + s, 72, 500),
        ...riga('Piano generato il 31.08.2026 alle 00:14', 72, 20),        // piè identico su tutte (y' = 822)
        P('pagina ' + (p + 1) + ' di 36', 480, 20, 45, 10, true)           // contatore di pagina
    ]);
    const e = estrai(pagine);
    assert.deepEqual(e.intestazioni, [
        { testo: 'Piano generato il 31.08.2026 alle 00:14', fascia: 'basso', pagine: 8 },
        { testo: 'pagina 1 di 36', fascia: 'basso', pagine: 8 }
    ]);
    e.testoPerModello.split('\n').forEach((t, p) => {
        assert.ok(t.includes('Settimana ' + settimane[p] + ' fase prova'), 'resta il titolo della pagina ' + (p + 1));
        assert.ok(t.includes(date[p] + '.2026'), 'restano le date della pagina ' + (p + 1));
        assert.ok(!t.includes('Piano generato') && !t.includes('di 36'));
    });
});

test('0045 riparazione: il numero di pagina con uno scarto («p. 47» sulla prima pagina), accanto a un numero fermo, è tolto', () => {
    const pagine = [1, 2, 3, 4, 5].map(n => [
        ...riga('Testo della pagina ' + n, 72, 500),
        ...riga('Rivista 2025 p. ' + (46 + n), 72, 20)
    ]);
    const e = estrai(pagine);
    assert.deepEqual(e.intestazioni, [{ testo: 'Rivista 2025 p. 47', fascia: 'basso', pagine: 5 }]);
    assert.deepEqual(e.testoPerModello.split('\n'), [1, 2, 3, 4, 5].map(n => 'Testo della pagina ' + n));
    // due numeri che seguono entrambi la pagina («Pagina 3 Pagina 3», misurato su un manuale): tolto
    const doppio = [1, 2, 3, 4].map(n => paginaCon('Pagina ' + n + ' Pagina ' + n, 'Corpo ' + n, 30));
    assert.deepEqual(estrai(doppio).intestazioni, [{ testo: 'Pagina 1 Pagina 1', fascia: 'alto', pagine: 4 }]);
});

test('0045 riparazione: un contatore che salta non è un numero di pagina; numeri identici si contano a parte', () => {
    // «Unità 1»…«Unità 5» sulle pagine 1-5 e «Unità 7» sulla 6: salta, quindi nessuna pagina la perde
    const salta = [1, 2, 3, 4, 5, 7].map((u, p) => paginaCon('Unità ' + u, 'Corpo ' + (p + 1)));
    assert.deepEqual(estrai(salta).intestazioni, []);
    // un numero segue la pagina ma un altro cambia (la data della lezione): è contenuto, resta
    const lezioni = ['05.10', '12.10', '19.10', '26.10'].map((d, p) => paginaCon('Lezione ' + (p + 1) + ' del ' + d, 'Corpo ' + (p + 1)));
    assert.deepEqual(estrai(lezioni).intestazioni, []);
    // «Scheda 1» su 2 pagine e «Scheda 2» su 4 di 6: tolta solo la seconda (4 ≥ 3)
    const e = estrai([1, 1, 2, 2, 2, 2].map((s, p) => paginaCon('Scheda ' + s, 'Corpo ' + (p + 1))));
    assert.deepEqual(e.intestazioni, [{ testo: 'Scheda 2', fascia: 'alto', pagine: 4 }]);
    const pm = e.testoPerModello.split('\n');
    assert.ok(pm[0].startsWith('Scheda 1') && pm[1].startsWith('Scheda 1'));
    assert.deepEqual(pm.slice(2), ['Corpo 3', 'Corpo 4', 'Corpo 5', 'Corpo 6']);
    // «© Ente 2026» identico su tutte: tolto
    const fermo = [1, 2, 3, 4].map(n => paginaCon('© Ente 2026', 'Corpo ' + n));
    assert.deepEqual(estrai(fermo).intestazioni, [{ testo: '© Ente 2026', fascia: 'alto', pagine: 4 }]);
});

/* Chiusura del 28/09: casi che separano il core dai mutanti sopravvissuti alla
   riverifica (un numero «fermo» a maggioranza, la soglia senza il minimo di 3,
   la riga di fascia tolta intera, le righe della fascia fuse, il limite delle 6
   cifre, l'indice dell'occorrenza al posto di quello della pagina). */

test('0045 riparazione: un numero è «fermo» solo se è identico in TUTTE le occorrenze («Settimana 6» ×3 poi «Settimana 7»)', () => {
    const pagine = [1, 2, 3, 4].map(n => paginaCon('Settimana ' + (n < 4 ? 6 : 7) + ' pagina ' + n, 'Corpo ' + n));
    const e = estrai(pagine);
    assert.deepEqual(e.intestazioni, []);
    assert.ok(e.escludi.every(s => s.size === 0));
    assert.equal(e.testoPerModello, e.text);
    assert.ok(e.testoPerModello.split('\n')[3].startsWith('Settimana 7 pagina 4'));
});

test('0045 riparazione: su 4 pagine servono comunque 3 pagine (minimo), non ⌈4·0,5⌉ = 2', () => {
    // una testata identica su 2 pagine di 4
    const due = estrai([0, 1, 2, 3].map(p => paginaCon(p < 2 ? 'Scheda di laboratorio' : null, 'Corpo ' + (p + 1))));
    assert.deepEqual(due.intestazioni, []);
    assert.equal(due.testoPerModello, due.text);
    // «Settimana 6» a p1 e «Settimana 7» a p2: seguono la pagina, ma sono 2 occorrenze
    const sett = estrai([paginaCon('Settimana 6', 'Corpo 1'), paginaCon('Settimana 7', 'Corpo 2'),
        paginaCon(null, 'Corpo 3'), paginaCon(null, 'Corpo 4')]);
    assert.deepEqual(sett.intestazioni, []);
    assert.equal(sett.testoPerModello, sett.text);
    // «Art. 3» a p1 e p2, «Art. 4» a p3: il gruppetto dei numeri identici ha 2 pagine
    const art = estrai([paginaCon('Art. 3', 'Corpo 1'), paginaCon('Art. 3', 'Corpo 2'),
        paginaCon('Art. 4', 'Corpo 3'), paginaCon(null, 'Corpo 4')]);
    assert.deepEqual(art.intestazioni, []);
    assert.equal(art.testoPerModello, art.text);
});

const TITOLI_0045 = ['La Riforma', 'Il Concilio', 'Lutero a Worms', 'La pace di Augusta'];

test('0045 riparazione: sulla stessa riga si toglie solo il segmento ripetuto, il titolo che cambia oltre il vuoto resta', () => {
    const pagine = TITOLI_0045.map((t, p) => [
        ...riga('Storia IV Media', 72, 800, 10, false),                  // a sinistra, ripetuta (y' = 42)
        ...riga(t, 400, 800),                                            // a destra, stessa riga, cambia
        ...riga('Corpo ' + (p + 1), 72, 500)
    ]);
    const e = estrai(pagine);
    assert.deepEqual(e.intestazioni, [{ testo: 'Storia IV Media', fascia: 'alto', pagine: 4 }]);
    assert.deepEqual(e.testoPerModello.split('\n'), TITOLI_0045.map((t, p) => t + ' Corpo ' + (p + 1)));
});

test('0045 riparazione: due righe diverse della stessa fascia non si fondono (testata a y\'=30, sottotitolo che cambia a y\'=60)', () => {
    const pagine = TITOLI_0045.map((t, p) => [
        ...riga('Storia IV Media', 72, A4.H - 30),
        ...riga(t, 72, A4.H - 60),
        ...riga('Corpo ' + (p + 1), 72, 500)
    ]);
    const e = estrai(pagine);
    assert.deepEqual(e.intestazioni, [{ testo: 'Storia IV Media', fascia: 'alto', pagine: 4 }]);
    assert.deepEqual(e.testoPerModello.split('\n'), TITOLI_0045.map((t, p) => t + ' Corpo ' + (p + 1)));
});

test('0045 riparazione: un numero di 7 cifre che cresce di uno con la pagina non è un contatore (6 cifre sì)', () => {
    const sette = estrai([0, 1, 2, 3].map(p => paginaCon('Protocollo ' + (1234567 + p), 'Corpo ' + (p + 1))));
    assert.deepEqual(sette.intestazioni, []);
    assert.equal(sette.testoPerModello, sette.text);
    const sei = estrai([0, 1, 2, 3].map(p => paginaCon('Protocollo ' + (123456 + p), 'Corpo ' + (p + 1))));
    assert.deepEqual(sei.intestazioni, [{ testo: 'Protocollo 123456', fascia: 'alto', pagine: 4 }]);
});

test('0045 riparazione: il contatore segue l\'indice di PAGINA, anche se in una pagina in mezzo la testata manca', () => {
    // p1 «pag. 1», p2 senza, p3 «pag. 3», p4 «pag. 4», p5 «pag. 5»
    const e = estrai([1, 2, 3, 4, 5].map(n => paginaCon(n === 2 ? null : 'pag. ' + n, 'Corpo ' + n)));
    assert.deepEqual(e.intestazioni, [{ testo: 'pag. 1', fascia: 'alto', pagine: 4 }]);
    assert.deepEqual(e.testoPerModello.split('\n'), [1, 2, 3, 4, 5].map(n => 'Corpo ' + n));
});

// ── Cablaggio del 0045 (leggendo i sorgenti) ─────────────────────────────────

test('cablaggio 0045: extractPdfPages tiene text/pages/titoli del 0044 e aggiunge testoPerModello e intestazioni', () => {
    const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
    const f = corpo(app, 'window.extractPdfPages = async function', 'window.extractTextFromPDF');
    const codice = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const c = codice(f);
    // il testo di sempre: stesse righe del 0044
    assert.ok(c.includes('pages.push({ n: i, text: window.MappAIPdfTesto.testoPagina(content.items, { nativa }) });'));
    assert.ok(c.includes("const text = pages.map(p => p.text).join('\\n');"));
    assert.ok(/return \{ text, pages, titoli, testoPerModello, intestazioni \};/.test(c));
    // la posizione: items e viewport a scala 1 per pagina, il core fa il resto
    assert.ok(c.includes('page.getViewport({ scale: 1 })'));
    assert.ok(c.includes('viewport.convertToViewportPoint(x, y)'));
    assert.ok(c.includes('MappAIPdfTesto.intestazioniRipetute(perPosizione)'));
    assert.ok(/testoPagina\(pg\.items\.filter\(\(_, k\) => !r\.escludi\[p\]\.has\(k\)\), \{ nativa \}\)/.test(c), 'ogni pagina con testoPagina, stessa unione');
    // interruttore: una volta per file, in un try; '0' o strip_boilerplate '0' → testoPerModello = text
    assert.ok(/try\s*\{[^}]*mappai_intestazioni_posizione'\)\s*!==\s*'0'[^}]*mappai_strip_boilerplate'\)\s*!==\s*'0'/.test(c));
    assert.ok(/let testoPerModello = text, intestazioni = \[\];/.test(c));
    assert.ok(/if \(senzaIntestazioni && /.test(c));
    // un'eccezione del core non rompe la lettura: calcolo e ricomposizione dentro un try,
    // e nel catch si torna al testo intero (fonti, ELABORA, «Espandi con AI» passano da qui)
    const prova = c.match(/try\s*\{\s*const r = window\.MappAIPdfTesto\.intestazioniRipetute\(perPosizione\);([\s\S]*?)\}\s*catch\s*\((\w+)\)\s*\{([^}]*)\}/);
    assert.ok(prova, 'intestazioniRipetute chiamata dentro un try');
    assert.ok(prova[1].includes('testoPerModello = perPosizione.map('), 'anche la ricomposizione sta nel try');
    assert.ok(/testoPerModello = text;\s*intestazioni = \[\];/.test(prova[3]), 'catch: testo intero e nessuna intestazione');
    assert.ok(prova[3].includes("console.warn('[Intestazioni] calcolo non riuscito: ' + (" + prova[2] + ' && ' + prova[2] + '.message));'), 'catch: una riga di avviso');
    assert.equal(c.split('intestazioniRipetute(').length - 1, 1, 'una sola chiamata al core, quella nel try');
    // la regola sta solo nel core (inv. 6): niente fasce, soglie o chiavi qui
    ['chiaveRipetuta', 'banda', 'quota', 'minPagine', "'alto'", "'basso'"].forEach(k =>
        assert.ok(!codice(app).includes(k), 'app.js non ricopia la regola: ' + k));
});

test('cablaggio 0045: startGeneration manda al modello testoPerModello nei due rami PDF; pagine e archivio restano interi', () => {
    const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
    const f = corpo(app, 'window.startGeneration = async function', '_reviewSourceSnapshot.push');
    const conta = (s, x) => s.split(x).length - 1;
    assert.equal(conta(f, 'let pdfText = _pdf.text;'), 2);
    assert.equal(conta(f, 'if (pdfText.trim()) {'), 2, 'il controllo resta sul testo intero');
    assert.equal(conta(f, 'textParts.push("[FONTE PDF " + src.file.name + "]:\\n" + (_pdf.testoPerModello || pdfText));'), 2);
    assert.equal(conta(f, '+ pdfText);'), 0, 'nessun ramo PDF manda ancora il testo intero al prompt');
    assert.equal(conta(f, '_pdfPagine.push({ nome: src.file.name, pages: _pdf.pages, titoli: _pdf.titoli });'), 2);
    assert.equal(conta(f, "console.log('[Intestazioni] tolte ' + _nIntest + ' righe ripetute (posizione) da ' + src.file.name);"), 2);
    assert.equal(conta(f, 'if (_nIntest) console.log('), 2, 'la riga solo se N > 0');
    // l'archivio della revisione nasce da _pdfPagine e salta le parti PDF del prompt
    assert.ok(f.includes('var _reviewSourceSnapshot = _pdfPagine.map(function (doc) {'));
    assert.ok(f.includes('if (/^\\[FONTE (?:PDF|YOUTUBE)\\b/.test(part)) return;'));
});
