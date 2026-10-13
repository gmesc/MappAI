'use strict';
// La fonte accanto alla scheda (16/9/26): la parte pura del pannello.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../public/js/mappai-review-fonte.js');
const G = require('../public/js/mappai-grounding-core.js');

const PAG1 = 'Il 30 agosto 1939 l’Assemblea Federale elesse   Henr i   Guisan Comandante in Capo.';
const PAG2 = 'La Banca Nazionale acquistò oro dalla Germania durante la guerra.';
const FONTI = [{ nome: 'La Svizzera nella seconda guerra mondiale.pdf', pages: [{ n: 1, text: PAG1 }, { n: 2, text: PAG2 }] },
    { nome: 'Appunti del docente.pdf', pages: [{ n: 1, text: 'Una pagina 1 di un altro documento.' }] }];

test('fonte: l’indice delle pagine usa gli stessi docId delle citazioni di buildInput', () => {
    const indice = F.indicePagine(FONTI);
    assert.equal(indice.length, 3);
    const citazione = G.buildInput({ nodes: [{ id: 'n', desc: 'x' }], sourcesDict: { n: [{ title: FONTI[0].nome, source: 'pagina 2', text: PAG2 }] } }, [{ id: 'n' }], FONTI).sourcesArr[0];
    assert.equal(F.paginaPer(citazione, indice).text, PAG2);
    assert.equal(F.paginaPer(citazione, indice).docId, citazione.docId);
});

test('fonte: la pagina di una prova — testo contenuto, poi documento e numero; due pagine 1 non si confondono', () => {
    const indice = F.indicePagine(FONTI);
    // prova ripulita dal modello: combacia lo stesso con la pagina che contiene la frase
    assert.equal(F.paginaPer({ text: "l'Assemblea Federale elesse Henri Guisan Comandante in Capo", source: FONTI[0].nome, page: 1 }, indice).text, PAG1);
    // chunk dell'àncora: «pagina 2» nel campo source
    assert.equal(F.paginaPer({ source: 'pagina 2', text: PAG2 }, indice).page, 2);
    // stesso numero di pagina, documento diverso
    assert.equal(F.paginaPer({ title: 'Appunti del docente.pdf', page: 1 }, indice).title, 'Appunti del docente.pdf');
    // una prova che viene dal materiale stesso, senza pagina né documento: nessuna pagina
    assert.equal(F.paginaPer({ text: 'Testo della domanda che non sta nella fonte.' }, indice), null);
    assert.equal(F.paginaPer(null, indice), null);
});

test('fonte: il PDF in Allegati si trova per nome identico o equivalente, mai per un PDF qualunque', () => {
    const nomi = ['foto-dossier.jpg', 'la svizzera nella seconda guerra MONDIALE.pdf', 'Altro.pdf'];
    assert.equal(F.trovaPdf('La Svizzera nella seconda guerra mondiale.pdf', ['La Svizzera nella seconda guerra mondiale.pdf', ...nomi]), 'La Svizzera nella seconda guerra mondiale.pdf');
    assert.equal(F.trovaPdf('La Svizzera nella seconda guerra mondiale.pdf', nomi), 'la svizzera nella seconda guerra MONDIALE.pdf');
    assert.equal(F.trovaPdf('Dossier sconosciuto.pdf', nomi), null);
    assert.equal(F.trovaPdf('', nomi), null);
});

test('fonte: la citazione si evidenzia nel punto vero della pagina, anche copiata «in bella»', () => {
    const pezzi = F.segmenti(PAG1, "l'Assemblea Federale elesse Henri Guisan");
    assert.deepEqual(pezzi.map(p => p.segnato), [false, true, false]);
    assert.equal(pezzi[1].t, 'l’Assemblea Federale elesse   Henr i   Guisan');
    assert.equal(pezzi.map(p => p.t).join(''), PAG1, 'nessun carattere della pagina si perde');
    assert.deepEqual(F.segmenti(PAG1, 'una frase che non c’è affatto'), [{ t: PAG1, segnato: false }]);
});

test('fonte: la citazione SUL PDF — pezzi spezzati, prova ripulita, taglio a metà pezzo, niente se non combacia', () => {
    // Tre pezzi come li dà pdf.js: due righe, e «Henr i» spezzato. Testo orizzontale, corpo 10, 5 pt per carattere.
    const pezzo = (str, x, y) => ({ str, transform: [10, 0, 0, 10, x, y], width: str.length * 5, height: 10 });
    const items = [pezzo('Il 30 agosto 1939 l’Assemblea Federale elesse Henr', 50, 700), pezzo('i Guisan Comandante in Capo', 50, 686), pezzo('dell’Esercito Svizzero.', 50, 672)];
    const vt = [1, 0, 0, -1, 0, 792];   // viewport pdf.js a scala 1: y capovolta, origine in alto
    const r = F.rettangoli(items, "l'Assemblea Federale elesse Henri Guisan", vt);
    assert.equal(r.length, 2);
    // prima riga: comincia a «l’Assemblea» (carattere 18 di 50), finisce in fondo al pezzo
    assert.equal(r[0].x, 50 + 18 * 5); assert.equal(r[0].w, (50 - 18) * 5);
    assert.ok(Math.abs(r[0].y - (792 - 700 - 9)) < 1e-9);
    // seconda riga: solo «i Guisan» (8 caratteri)
    assert.equal(r[1].x, 50); assert.equal(r[1].w, 8 * 5);
    assert.ok(r[1].y > r[0].y, 'la seconda riga sta sotto la prima');
    // un pezzo per parola sulla stessa riga → una striscia sola, dal primo carattere all'ultimo
    const parole = [pezzo('Queste', 50, 600), pezzo('accuse', 85, 600), pezzo('sono', 120, 600), pezzo('esaminate.', 145, 600)];
    assert.deepEqual(F.rettangoli(parole, 'Queste accuse sono esaminate', vt).map(x => [x.x, x.w]), [[50, 145 + 9 * 5 - 50]]);
    assert.deepEqual(F.rettangoli(items, 'Il Consiglio federale nominò il generale', vt), []);
    assert.deepEqual(F.rettangoli(items, '', vt), []);
    assert.deepEqual(F.rettangoli([], 'Henri Guisan Comandante', vt), []);
});

/* ═══ Packet 0074: la Fonte a destra nella veste di G2 (ADR 0012 rev. 3, p. 5; decisioni F1–F4 del 06/10) ══════
   Il pannello vero, montato su un DOM finto (cheerio) come quello dei test del Banco, con `append`,
   `insertBefore` e `contains` in più (il pannello li usa). Gli assert sugli elementi si fanno su booleani,
   testo e attributi: un assert fallito su un elemento fa girare Node all'infinito. */
const cheerio = require('cheerio');
function dom() {
    const $ = cheerio.load('<html><body></body></html>');
    const wrappers = new WeakMap(), disegni = [];
    let active = null;
    // il contesto 2D di una tela: registra ogni rettangolo col colore e il modo di composizione del momento
    const contesto = () => ({ fillStyle: '', globalCompositeOperation: 'source-over', save() {}, restore() {}, drawImage() {},
        fillRect(x, y, w, h) { disegni.push({ x, y, w, h, colore: this.fillStyle, modo: this.globalCompositeOperation }); } });
    function wrap(n) {
        if (!n) return null;
        if (wrappers.has(n)) return wrappers.get(n);
        const e = { n, listeners: {}, dataset: {}, style: { setProperty(k, v) { this[k] = String(v); }, removeProperty(k) { delete this[k]; } },
            setAttribute(k, v) { $(n).attr(k, String(v)); }, getAttribute(k) { return $(n).attr(k); }, removeAttribute(k) { $(n).removeAttr(k); },
            appendChild(c) { $(n).append(c.n); return c; }, append(...cs) { cs.forEach(c => this.appendChild(c)); },
            insertBefore(c, ref) { if (ref) $(ref.n).before(c.n); else $(n).append(c.n); return c; },
            replaceChildren(...cs) { $(n).empty(); cs.forEach(c => this.appendChild(c)); },
            contains(o) { return !!o && !!o.n && (o.n === n || $(o.n).parents().toArray().indexOf(n) >= 0); },
            querySelector(s) { return wrap($(n).find(s).get(0)); }, querySelectorAll(s) { return $(n).find(s).toArray().map(wrap); },
            addEventListener(k, fn) { this.listeners[k] = fn; }, removeEventListener(k) { delete this.listeners[k]; },
            focus() { active = this; },
            classList: {
                toggle(c, on) { const v = on === undefined ? !$(n).hasClass(c) : !!on; $(n).toggleClass(c, v); return v; },
                add(...c) { c.forEach(x => $(n).addClass(x)); }, remove(...c) { c.forEach(x => $(n).removeClass(x)); }, contains(c) { return $(n).hasClass(c); }
            },
            async click() { if (this.onclick) return this.onclick(); }
        };
        if (n.name === 'canvas') e.getContext = () => contesto();
        for (const name of ['id', 'className', 'type', 'title']) Object.defineProperty(e, name, {
            get() { return $(n).attr(name === 'className' ? 'class' : name) || ''; }, set(v) { $(n).attr(name === 'className' ? 'class' : name, String(v)); } });
        Object.defineProperty(e, 'hidden', { get() { return $(n).attr('hidden') !== undefined; }, set(v) { if (v) $(n).attr('hidden', 'hidden'); else $(n).removeAttr('hidden'); } });
        Object.defineProperties(e, {
            textContent: { get() { return $(n).text(); }, set(v) { $(n).text(v == null ? '' : String(v)); } },
            innerHTML: { get() { return $(n).html(); }, set(v) { $(n).html(v); } },
            value: { get() { return this._value !== undefined ? this._value : $(n).val() || ''; }, set(v) { this._value = String(v == null ? '' : v); $(n).val(this._value); } }
        });
        wrappers.set(n, e); return e;
    }
    const document = { body: wrap($('body')[0]), createElement: tag => wrap($('<' + tag + '>')[0]), createTextNode: text => wrap({ type: 'text', data: text }),
        get activeElement() { return active; } };
    return { document, disegni, html: () => $.html() };
}
/* Un PDF finto per il visore: pagine da 600×800 punti, il testo come lo dà pdf.js (un pezzo per riga). */
function pdfFinto(righePerPagina) {
    const pagina = righe => ({
        getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale, transform: [scale, 0, 0, -scale, 0, 800 * scale] }),
        getTextContent: async () => ({ items: righe.map((str, i) => ({ str, transform: [10, 0, 0, 10, 50, 700 - i * 14], width: str.length * 5, height: 10 })) }),
        render: () => ({ promise: Promise.resolve(), cancel() {} })
    });
    return { getDocument: () => ({ promise: Promise.resolve({ numPages: righePerPagina.length, destroy() {}, getPage: async n => pagina(righePerPagina[n - 1] || []) }) }) };
}
const attesa = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const RAPPORTO = [{ nome: 'Rapporto.pdf', pages: [
    { n: 1, text: 'Nel 1945 le banche custodivano oro, con un calo del -1 per cento.' },
    { n: 2, text: 'La Banca Nazionale acquistò oro dalla Germania durante la guerra, in 2 fasi.' }] }];
const RIGHE_PDF = [['Nel 1945 le banche custodivano oro, con un calo del -1 per cento.'], ['La Banca Nazionale acquistò oro dalla Germania durante la guerra, in 2 fasi.']];
/* Monta il pannello vero: `pdf` = true per il visore (pdf.js finto + la geometria vera di Proietta). */
function pannello(opzioni = {}, pdf = false) {
    const d = dom();
    globalThis.document = d.document;
    if (pdf) { globalThis.pdfjsLib = pdfFinto(RIGHE_PDF); globalThis.MappAIProiezioneCore = require('../public/js/mappai-proiezione-core.js'); }
    else { delete globalThis.pdfjsLib; delete globalThis.MappAIProiezioneCore; }
    const host = d.document.createElement('section'); host.className = 'mrv-fonte'; d.document.body.appendChild(host);
    const p = F.monta(host, Object.assign({ sources: RAPPORTO, leggiPdf: async () => new Uint8Array([37, 80, 68, 70]) }, opzioni));
    const viewer = host.querySelector('.mrv-fonte-pdf');
    viewer.clientWidth = 600; viewer.clientHeight = 800;   // il visore disegna solo se ha una misura
    return { d, host, p, note: host.querySelector('.mrv-fonte-testo'), segno: () => host.querySelector('.mrv-fonte-righe mark') };
}

test('F4: una prova è una citazione solo con almeno tre parole fatte di lettere («-1», «2», una parola sola non lo sono)', () => {
    for (const no of ['-1', '2', 'Guisan', 'Henri Guisan', '1939 Guisan', '1, 2, 3', '', '   ', null, undefined, { text: 'Oro' }, { page: 2 }]) assert.equal(F.eCitazione(no), false, JSON.stringify(no));
    for (const si of ['elesse Henri Guisan', 'l’Assemblea Federale elesse', '1939: elesse il generale', { text: 'oro dalla Germania' }]) assert.equal(F.eCitazione(si), true, JSON.stringify(si));
});

test('F4 nel pannello: con `soloCitazioni` le prove corte non aprono pagine, non si segnano e non contano; senza l’opzione come oggi', () => {
    const corte = [{ text: '-1' }, { text: '2' }, { text: 'Germania' }];
    const oggi = pannello();
    assert.equal(oggi.p.mostra(corte), 3, 'oggi «-1», «2» e «Germania» trovano ciascuna una pagina');
    const veste = pannello({ soloCitazioni: true });
    assert.equal(veste.p.mostra(corte), 0);
    assert.equal(veste.host.querySelector('.mrv-fonte-vuoto').hidden, false, 'nessuna pagina: il pannello lo dice');
    assert.ok(!veste.segno(), 'niente segnato');
    assert.equal(veste.host.querySelectorAll('.mrv-fonte-prove button').length, 0, 'nessun bottone «Prova n» per le prove corte');
    assert.equal(veste.p.mostra(corte.concat([{ text: 'oro dalla Germania durante la guerra' }])), 1, 'conta solo la citazione');
    assert.equal(veste.segno().textContent, 'oro dalla Germania durante la guerra');
});

test('mostra dice quante prove hanno trovato una pagina (i doppioni una volta), anche ripetuta con le stesse prove', () => {
    const { p } = pannello();
    const prova = { text: 'oro dalla Germania durante la guerra' };
    assert.equal(p.mostra([prova, { ...prova }, { text: 'Una frase che non sta in nessuna pagina del rapporto.' }]), 1);
    assert.equal(p.mostra([prova, { ...prova }]), 1, 'le stesse prove: il pannello non si ridisegna, il conto resta');
    assert.equal(p.mostra([]), 0);
    assert.equal(p.mostra(prova), 1, 'una prova sola, fuori da un elenco');
});

test('F2: con `testoAperto` il testo della pagina parte aperto e col PDF resta aperto a ogni pagina; chiuso dal docente resta chiuso. Senza l’opzione come oggi', async () => {
    const oggi = pannello({}, true);
    oggi.p.mostra([{ text: 'oro dalla Germania durante la guerra' }]); await attesa();
    assert.equal(oggi.note.open, false, 'oggi, col PDF, il testo si richiude');
    const v = pannello({ testoAperto: true }, true);
    assert.equal(v.note.open, true, 'aperto all’apertura');
    v.p.mostra([{ text: 'oro dalla Germania durante la guerra' }]); await attesa();
    assert.equal(v.host.querySelector('canvas').hidden, false, 'il PDF è disegnato');
    assert.equal(v.note.open, true, 'col PDF il testo resta aperto');
    // cambio di pagina dalla tendina, poi un altro materiale (altra pagina)
    const scelta = v.host.querySelector('.mrv-fonte-pagina');
    scelta.value = 'p0'; scelta.listeners.change(); await attesa();
    assert.equal(v.note.open, true, 'cambio di pagina: resta aperto');
    v.p.mostra([{ text: 'le banche custodivano oro' }]); await attesa();
    assert.equal(v.note.open, true, 'cambio di materiale: resta aperto');
    // il docente lo chiude: resta chiuso a ogni cambio, anche senza PDF
    v.note.open = false; if (v.note.listeners.toggle) v.note.listeners.toggle();
    v.p.mostra([{ text: 'oro dalla Germania durante la guerra' }]); await attesa();
    assert.equal(v.note.open, false, 'chiuso dal docente: resta chiuso');
    scelta.value = 'p0'; scelta.listeners.change(); await attesa();
    assert.equal(v.note.open, false);
    const t = pannello({ testoAperto: true });
    t.note.open = false; if (t.note.listeners.toggle) t.note.listeners.toggle();
    t.p.mostra([{ text: 'oro dalla Germania durante la guerra' }]);
    assert.equal(t.note.open, false, 'senza PDF (solo testo) l’app non lo riapre');
});

test('il segno col colore dell’area: sul PDF una sottolineatura al posto del rettangolo giallo, nel testo il colore sul pannello; senza colore il giallo di oggi', async () => {
    const v = pannello({ testoAperto: true }, true);
    const prova = [{ text: 'oro dalla Germania durante la guerra' }];
    v.p.mostra(prova, { colore: '#f59e0b' }); await attesa();
    const colore = F.coloreSegno('#f59e0b');
    assert.ok(colore && colore !== '#f59e0b', 'l’ambra della tavolozza (2,15:1 sul bianco) si scurisce');
    const tratti = v.d.disegni.slice();
    assert.ok(tratti.length >= 1, 'il PDF ha il suo segno');
    assert.ok(tratti.every(r => r.colore === colore && r.modo !== 'multiply'), 'il colore dell’area, pieno: ' + JSON.stringify(tratti));
    const r = F.rettangoli(RIGHE_PDF[1].map((str, i) => ({ str, transform: [10, 0, 0, 10, 50, 700 - i * 14], width: str.length * 5, height: 10 })), prova[0].text, [1, 0, 0, -1, 0, 800])[0];
    assert.ok(tratti.every(x => x.h < r.h * 0.5 && Math.abs((x.y + x.h) - (r.y + r.h)) < 1e-6), 'una sottolineatura in fondo al rigo, non il rettangolo intero');
    assert.equal(v.host.classList.contains('mrv-fonte--segno-area'), true);
    assert.equal(v.host.style['--mrv-fonte-segno'], colore, 'il testo della pagina prende lo stesso colore');
    assert.equal(v.segno().textContent, prova[0].text);
    // un altro materiale sulla stessa pagina, senza area: il giallo di oggi
    v.d.disegni.length = 0;
    v.p.mostra(prova); await new Promise(res => setTimeout(res, 160)); await attesa();
    assert.ok(v.d.disegni.length >= 1 && v.d.disegni.every(x => x.colore === '#fef08a' && x.modo === 'multiply'), 'senza colore il rettangolo giallo: ' + JSON.stringify(v.d.disegni));
    assert.equal(v.host.classList.contains('mrv-fonte--segno-area'), false);
    // a veste spenta (nessun secondo argomento) il segno di oggi
    const oggi = pannello({}, true);
    oggi.p.mostra(prova); await attesa();
    assert.ok(oggi.d.disegni.length >= 1 && oggi.d.disegni.every(x => x.colore === '#fef08a' && x.modo === 'multiply'));
    assert.equal(oggi.host.classList.contains('mrv-fonte--segno-area'), false);
    // un valore che non è un colore: il giallo
    const x = pannello({ testoAperto: true });
    x.p.mostra(prova, { colore: 'url(javascript:1)' });
    assert.equal(x.host.classList.contains('mrv-fonte--segno-area'), false);
});

test('coloreSegno: un colore d’area chiaro si scurisce fino a 3:1 sul bianco (contrasto per elementi non testuali); uno già scuro resta; un non colore dà null', () => {
    assert.equal(Math.round(F.contrasto('#ffffff', '#000000') * 100) / 100, 21);
    assert.equal(Math.round(F.contrasto('#fff', '#fff') * 100) / 100, 1);
    // la tavolozza delle macroaree (mappai-d3-render.js `colorScale`), il grigio di ripiego delle aree e il bianco
    for (const c of ['#0f172a', '#ef4444', '#f59e0b', '#10b981', '#0ea5e9', '#6366f1', '#d946ef', '#8b5cf6', '#64748b', '#ffffff', '#fef08a', 'rgb(16, 185, 129)', 'rgba(14,165,233,0.5)', '#10b98180', 'hsl(160, 84%, 39%)']) {
        const s = F.coloreSegno(c);
        assert.match(s, /^#[0-9a-f]{6}$/, c);
        assert.ok(F.contrasto(s, '#ffffff') >= 3, c + ' → ' + s + ': ' + F.contrasto(s, '#ffffff'));
    }
    // quelli troppo chiari si scuriscono quanto basta, non di più
    for (const c of ['#f59e0b', '#10b981', '#0ea5e9', '#ffffff', '#fef08a']) {
        assert.ok(F.contrasto(c, '#ffffff') < 3, c + ' parte sotto 3:1');
        assert.ok(F.contrasto(F.coloreSegno(c), '#ffffff') < 3.15, c + ' → ' + F.coloreSegno(c) + ' non si scurisce più del necessario');
    }
    for (const c of ['#0f172a', '#ef4444', '#6366f1', '#64748b']) assert.equal(F.coloreSegno(c), c, c + ' basta già: resta com’è');
    // un colore trasparente si vede sul fondo: il blu notte a metà si legge grigio, e conta quello
    assert.equal(F.coloreSegno('#0f172a80'), '#878b94', 'composto sul bianco: 3,41 e non 17,85');
    assert.equal(F.coloreSegno('rgba(15, 23, 42, 0.5)'), F.coloreSegno('#878b95'));
    assert.equal(F.coloreSegno('#F59E0B'), F.coloreSegno('#f59e0b'));
    // la tinta resta quella: si scurisce, non si cambia colore
    const [r, g, b] = [1, 3, 5].map(i => parseInt(F.coloreSegno('#f59e0b').slice(i, i + 2), 16));
    assert.ok(r > g && g > b, 'l’ambra resta ambra');
    // giro 2 (4b): «rgb(1,2)» passa da `safeColor` (mappai-review-context.js) e ripiega al grigio neutro: è in un test suo
    for (const no of [null, '', 'giallo', 'url(x)', '#12', 'var(--x)', 42]) assert.equal(F.coloreSegno(no), null, String(no));
});

test('la frase al posto della pagina: con l’opzione `vuoto` il pannello dice che il materiale non ha passi; senza, la frase di oggi', () => {
    const v = pannello({ vuoto: 'Nessun passo nella fonte per questo materiale.' });
    assert.equal(v.p.mostra([]), 0);
    assert.equal(v.host.querySelector('.mrv-fonte-vuoto').textContent, 'Nessun passo nella fonte per questo materiale.');
    assert.equal(v.host.querySelector('.mrv-fonte-vuoto').hidden, false);
    const oggi = pannello();
    oggi.p.mostra([]);
    assert.match(oggi.host.querySelector('.mrv-fonte-vuoto').textContent, /non indica una pagina della fonte/);
});

test('dossier da foto (0069) con le opzioni della veste: foto in alto, scheda intera all’apertura, i nomi dei blocchi, «×»; nessun blocco perso', async () => {
    const DF = require('../public/js/mappai-dossier-fonte-core.js');
    globalThis.MappAIDossierFonteCore = DF;
    const scheda = { titolo: 'Manifesto', identita: { genere: 'Manifesto elettorale', titolo: 'Deutschland wählt', autore: 'CDU', data: '1949' },
        osservazione: { descrizione: 'Un uomo anziano guarda verso destra.', testo: 'Wählt CDU!' }, critica: { prova: 'La propaganda del dopoguerra' } };
    const sources = DF.fontiDaScheda(scheda);
    const cit = sources.map(s => ({ docId: s.id, title: s.title, page: 0, text: s.pages[0].text }));
    const monta = opzioni => {
        const v = pannello(Object.assign({ sources, immagine: async () => ({ src: 'data:image/jpeg;base64,AAAA' }), etichette: { titolo: 'Immagine e scheda', testo: 'Testo della scheda' } }, opzioni));
        return v;
    };
    const [oggi, veste] = [monta({}), monta({ testoAperto: true, soloCitazioni: true, vuoto: 'Nessun passo nella fonte per questo materiale.' })];
    await attesa();
    for (const v of [oggi, veste]) {
        assert.equal(!!v.host.querySelector('figure.mrv-fonte-foto img'), true, 'la foto');
        assert.ok(v.d.html().indexOf('mrv-fonte-foto') < v.d.html().indexOf('mrv-fonte-testo'), 'la foto sta sopra il testo');
        assert.match(v.host.querySelector('.mrv-fonte-righe').textContent, /Carta d'identità[\s\S]*Che cosa si vede/, 'all’apertura la scheda intera');
    }
    const nomi = v => v.host.querySelectorAll('.mrv-fonte-prove button').map(b => b.textContent);
    assert.equal(oggi.p.mostra(cit), 3);
    assert.equal(veste.p.mostra(cit), 3, 'i blocchi della scheda sono citazioni: nessuno si perde');
    assert.deepEqual(nomi(veste), nomi(oggi), 'gli stessi bottoni coi nomi dei blocchi, e «×»');
    assert.ok(nomi(veste).includes('×'));
    await veste.host.querySelector('.mrv-fonte-chiudi').click();
    assert.match(veste.host.querySelector('.mrv-fonte-righe').textContent, /Carta d'identità[\s\S]*Che cosa prova questa fonte/, '«×» mostra la scheda intera');
    assert.equal(veste.p.mostra([]), 0);
    assert.match(veste.host.querySelector('.mrv-fonte-righe').textContent, /Carta d'identità/, 'senza prove la scheda intera, mai la frase dei passi');
    delete globalThis.MappAIDossierFonteCore;
});

/* ═══ 0074, giro di correzione (06/10) dopo le due verifiche indipendenti ═══════════════════════════════════════════
   Ogni test qui sotto è scritto PRIMA del codice; i «K-F…» sono i test minimi del verificatore, portati qui. */
test('0074 giro 2, «F4 non vale per la foto»: col dossier da foto una citazione corta di un blocco («Wählt CDU!») ha il suo bottone col nome del blocco e il segno', async () => {
    const DF = require('../public/js/mappai-dossier-fonte-core.js');
    globalThis.MappAIDossierFonteCore = DF;
    try {
        const scheda = { titolo: 'Manifesto', identita: { genere: 'Manifesto elettorale', titolo: 'Deutschland wählt' },
            osservazione: { descrizione: 'Un uomo anziano guarda verso destra.', testo: 'Wählt CDU!' } };
        const sources = DF.fontiDaScheda(scheda), blocco = sources[1];
        const v = pannello({ sources, immagine: async () => ({ src: 'data:image/jpeg;base64,AAAA' }), testoAperto: true, soloCitazioni: true });
        await attesa();
        assert.equal(v.p.mostra([{ docId: blocco.id, title: blocco.title, page: 0, text: 'Wählt CDU!' }]), 1, 'la ricerca dei blocchi è già rigorosa: F4 non si applica');
        assert.deepEqual(v.host.querySelectorAll('.mrv-fonte-prove button').map(b => b.textContent), ['Che cosa si vede', '×']);
        assert.equal(v.segno().textContent, 'Wählt CDU!');
        // con un PDF (o il testo) F4 resta: la stessa prova corta non si cerca
        const pdf = pannello({ testoAperto: true, soloCitazioni: true });
        assert.equal(pdf.p.mostra([{ text: 'Germania' }]), 0);
    } finally { delete globalThis.MappAIDossierFonteCore; }
});

test('0074 giro 2 (4a): con la veste i doppioni si riconoscono anche con spazi in testa e in coda; a veste spenta la chiave di oggi', () => {
    const due = [{ text: ' oro dalla Germania durante la guerra' }, { text: 'oro dalla Germania durante la guerra  ' }];
    assert.equal(pannello({ testoAperto: true, soloCitazioni: true }).p.mostra(due), 1);
    assert.equal(pannello().p.mostra(due), 2, 'a veste spenta il pannello di oggi');
});

test('0074 giro 2 (4b): i colori si leggono come `safeColor` — canali in percentuale, tinta negativa, sintassi a spazi; un colore che il pallino accetta ma qui non si legge ripiega al grigio neutro, mai al giallo', () => {
    assert.equal(F.coloreSegno('rgb(50% 50% 50%)'), F.coloreSegno('#808080'), 'il 50% è metà di 255, non 50');
    assert.equal(F.coloreSegno('rgb(50%, 0%, 0%)'), F.coloreSegno('#800000'));
    assert.equal(F.coloreSegno('hsl(-30, 50%, 50%)'), F.coloreSegno('hsl(330, 50%, 50%)'), 'una tinta negativa gira sul cerchio');
    assert.equal(F.coloreSegno('hsl(330 50% 50%)'), F.coloreSegno('hsl(330, 50%, 50%)'));
    assert.equal(F.coloreSegno('hsl(390deg, 50%, 50%)'), F.coloreSegno('hsl(30, 50%, 50%)'));
    assert.equal(F.coloreSegno('rgb(128 128 128 / 50%)'), F.coloreSegno('rgba(128, 128, 128, 0.5)'));
    assert.ok(F.coloreSegno('hsl(330, 50%, 50%)') !== '#64748b');
    for (const strano of ['rgb(1,2)', 'rgba(1,2,3,4,5)', 'hsl(1)']) assert.equal(F.coloreSegno(strano), '#64748b', strano + ': il pallino lo accetta, il segno ripiega al grigio neutro delle aree');
    for (const no of ['giallo', 'url(x)', 'var(--x)', 'expression(1)', '', null]) assert.equal(F.coloreSegno(no), null, String(no));
});

test('0074 giro 2 (4c): sul PDF la sottolineatura è almeno 2 px CSS alla larghezza adatta, anche su uno schermo a densità doppia', async () => {
    globalThis.devicePixelRatio = 2;
    try {
        for (const largo of [600, 300, 1200]) {
            const v = pannello({ testoAperto: true }, true);
            v.host.querySelector('.mrv-fonte-pdf').clientWidth = largo;
            v.p.mostra([{ text: 'oro dalla Germania durante la guerra' }], { colore: '#ef4444' }); await attesa();
            // adatta alla larghezza: z = largo / 600 (la pagina finta è larga 600 punti); la tela si disegna a z × densità
            const z = largo / 600, scala = z * 2;
            assert.ok(v.d.disegni.length >= 1, String(largo));
            for (const x of v.d.disegni) assert.ok(x.h * z / scala >= 2 - 1e-9, largo + ' px: la sottolineatura fa ' + (x.h * z / scala).toFixed(2) + ' px CSS');
        }
    } finally { delete globalThis.devicePixelRatio; }
});

test('K-F09 F2: un PDF che non si disegna non riapre il testo che il docente ha chiuso', async () => {
    const v = pannello({ testoAperto: true }, true);
    v.note.open = false; if (v.note.listeners.toggle) v.note.listeners.toggle();
    const vero = globalThis.pdfjsLib;
    globalThis.pdfjsLib = { getDocument: () => ({ promise: Promise.resolve({ numPages: 2, destroy() {}, getPage: async () => { throw new Error('pagina illeggibile'); } }) }) };
    try {
        v.p.mostra([{ text: 'oro dalla Germania durante la guerra' }]); await attesa();
        assert.equal(v.note.open, false, 'chiuso dal docente: resta chiuso anche se il PDF fallisce');
    } finally { globalThis.pdfjsLib = vero; }
});

test('K-F15 colore: #rgba a quattro cifre vale come #rrggbbaa', () => {
    assert.ok(F.coloreSegno('#ef4f'), 'un colore valido');
    assert.equal(F.coloreSegno('#ef4f'), F.coloreSegno('#eeff44ff'));
    assert.equal(F.coloreSegno('#0e98'), F.coloreSegno('#00ee9988'));
});

test('K-F22 segno: la stessa pagina mostrata prima senza area e poi con l’area prende il colore (non il giallo)', async () => {
    const v = pannello({ testoAperto: true }, true);
    const prova = [{ text: 'oro dalla Germania durante la guerra' }];
    v.p.mostra(prova); await attesa();
    assert.ok(v.d.disegni.length >= 1 && v.d.disegni.every(x => x.colore === '#fef08a'), 'prima il giallo');
    v.d.disegni.length = 0;
    v.p.mostra(prova, { colore: '#f59e0b' }); await new Promise(res => setTimeout(res, 160)); await attesa();
    const colore = F.coloreSegno('#f59e0b');
    assert.ok(v.d.disegni.length >= 1 && v.d.disegni.every(x => x.colore === colore && x.modo !== 'multiply'), 'poi il colore dell’area: ' + JSON.stringify(v.d.disegni));
});
