'use strict';
/*
 * 0069 — La scheda validata in CREA è la fonte del dossier (ADR 0016, rev. 1).
 * Si prova il core puro `mappai-dossier-fonte-core.js`, con le funzioni VERE dei
 * moduli che lo circondano caricate in Node: il cancello di `mappai-review-core.js`,
 * le pagine di `mappai-grounding-core.js`, l'indice di `mappai-evidence-core.js`.
 * Nessuno di quei file si tocca: la scheda deve passare per le loro strade.
 *
 * Le mutazioni del §6 del packet: ogni test dice quale lo protegge.
 *   M1 i blocchi vuoti diventano pagine · M2 l'identità cambia a ogni chiamata ·
 *   M3 il testo viene troncato · M4 la fonte-scheda si accende a interruttore spento ·
 *   M5 la review nasce approvata senza snapshot (il cancello non si richiude) ·
 *   M6 un dossier da fonte testuale salta G1.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const JS = p => path.join(__dirname, '..', 'public', 'js', p);
const DF = require(JS('mappai-dossier-fonte-core.js'));
const VC = require(JS('mappai-visione-core.js'));
const RC = require(JS('mappai-review-core.js'));
const G = require(JS('mappai-grounding-core.js'));
const EC = require(JS('mappai-evidence-core.js'));
const IC = require(JS('mappai-crea-iconografica-core.js'));
const RF = require(JS('mappai-review-fonte.js'));

function scheda(over) {
    return Object.assign({
        titolo: 'Manifesto elettorale tedesco post 2a GM',
        nomeFile: 'manifesto_1949.jpg', fotoB64: 'AAAA', mime: 'image/jpeg',
        identita: { genere: 'Manifesto elettorale', titolo: 'Deutschland wählt', autore: 'CDU', data: '1949',
            luogo: 'Germania occidentale, tedesco', tecnica: 'Litografia a colori' },
        osservazione: { descrizione: 'Un uomo anziano guarda verso destra; sullo sfondo le rovine di una città.',
            testo: 'Wählt CDU! Für Freiheit und Frieden', iconografia: 'Rovine, bandiera, colomba',
            linguaggioVisivo: 'Contrasto fra il grigio delle rovine e i colori', tipografia: 'Bastoni maiuscoli' },
        interpretazione: { corrente: '', committente: 'Il partito CDU — il simbolo in basso',
            destinatario: 'Gli elettori della Repubblica federale — lo slogan', finalita: 'Convincere a votare CDU — lo slogan',
            strategie: 'Contrapporre rovine e futuro — la colomba', diffusione: '' },
        critica: { prova: 'La propaganda politica del primo dopoguerra', tace: 'Non mostra le altre forze politiche' }
    }, over || {});
}
const copia = x => JSON.parse(JSON.stringify(x));
const conferma = (sch, now) => DF.registraConferma(sch, { conFoto: true, now: now || '2026-10-02T10:00:00.000Z' });
const storage = v => ({ getItem: k => (k === DF.CHIAVE ? v : null) });

/* ── l'interruttore ───────────────────────────────────────────────────────── */

test('M4 · l’interruttore si chiama mappai_dossier_fonte_scheda e parte ACCESO: solo «0» lo spegne (0088, decisione di Giacomo del 09/10)', () => {
    assert.equal(DF.CHIAVE, 'mappai_dossier_fonte_scheda');
    assert.equal(DF.acceso(storage('0')), false);
    /* chiave assente, vuota o qualunque altro valore: acceso */
    [null, '', '1', 'true', 'acceso', undefined].forEach(v => assert.equal(DF.acceso(storage(v)), true, String(v)));
    /* nessun archivio, un archivio senza getItem o che lancia: SPENTO — la strada di prima è quella sicura (B9),
       e i chiamanti (che avvolgono la chiamata in un try/catch) rispondono lo stesso */
    assert.equal(DF.acceso(null), false);
    assert.equal(DF.acceso(undefined), false);
    assert.equal(DF.acceso({}), false);
    assert.equal(DF.acceso({ getItem() { throw new Error('quota'); } }), false);
});

/* ── le pagine della scheda ───────────────────────────────────────────────── */

test('una scheda piena → quattro pagine, una per blocco, nell’ordine della griglia, titolo e testo giusti', () => {
    const sch = scheda();
    const f = DF.fontiDaScheda(sch);
    assert.equal(f.length, 4);
    assert.deepEqual(f.map(x => x.title), VC.BLOCCHI.map(b => b.titolo));
    f.forEach((x, i) => {
        const bl = VC.BLOCCHI[i];
        assert.equal(x.type, 'scheda');
        assert.equal(x.id, x.docId);
        assert.equal(x.pages.length, 1);
        assert.equal(x.pages[0].n, 0);
        /* il testo è quello dei campi pieni come li scrive `testoBlocco`: il titolo
           del blocco sta in `title`, non nel testo (giro 2: la ricerca per parole
           non c'è più, e la pagina coincide con la `desc` del ramo) */
        assert.equal(x.pages[0].text, VC.testoBlocco(sch, bl.id));
        assert.ok(!x.pages[0].text.startsWith(bl.titolo));
    });
    /* il testo della pagina È la `desc` del nodo del ramo: una scheda, una verità */
    const nodi = VC.nodiDaScheda(sch).nodes.filter(n => n.level === 1);
    nodi.forEach((n, i) => assert.equal(f[i].pages[0].text, n.desc));
});

test('M1 · un blocco vuoto (o di soli spazi) non diventa una pagina vuota', () => {
    const vuoto = DF.fontiDaScheda(scheda({ critica: {} }));
    assert.equal(vuoto.length, 3);
    assert.ok(!vuoto.some(x => x.title === 'Che cosa prova questa fonte'));
    const spazi = DF.fontiDaScheda(scheda({ critica: { prova: '   ', tace: '\n\t' }, interpretazione: {} }));
    assert.equal(spazi.length, 2);
    spazi.forEach(x => assert.ok(x.pages[0].text.trim().length > 0));
    /* le pagine sono tante quante i rami del dossier */
    const sch = scheda({ critica: {} });
    assert.equal(DF.fontiDaScheda(sch).length, VC.nodiDaScheda(sch).nodes.length - 1);
});

test('M3 · apostrofi, accenti, virgolette e un campo lungo arrivano interi', () => {
    const lungo = 'Un’iscrizione è «così» — perché l\'età dell\'oro?'.repeat(80);
    const sch = scheda({ osservazione: { descrizione: lungo, testo: 'L\'Italia è unita: «Avanti!»' } });
    const t = DF.fontiDaScheda(sch)[1].pages[0].text;
    assert.ok(t.includes('Descrizione: ' + lungo));
    assert.ok(t.includes('Testo trascritto: L\'Italia è unita: «Avanti!»'));
    assert.equal(t, VC.testoBlocco(sch, 'osservazione'));
    assert.ok(t.length > lungo.length);
});

test('M2 · l’identità di una pagina è stabile fra due chiamate e cambia solo se cambia il suo testo', () => {
    const a = DF.fontiDaScheda(scheda()), b = DF.fontiDaScheda(scheda());
    assert.deepEqual(a.map(x => x.id), b.map(x => x.id));
    a.forEach(x => assert.match(x.id, /^scheda-\d-[a-z]+-[0-9a-f]+$/));
    const sch = scheda();
    sch.osservazione.descrizione += ' Una donna con un bambino.';
    const c = DF.fontiDaScheda(sch);
    assert.notEqual(c[1].id, a[1].id);
    assert.equal(c[0].id, a[0].id);
    assert.equal(c[2].id, a[2].id);
    assert.equal(c[3].id, a[3].id);
    assert.equal(new Set(a.map(x => x.id)).size, 4);
});

test('una scheda assente o non valida → nessuna fonte e nessun errore', () => {
    [undefined, null, {}, 'scheda', 42, [], { titolo: 'solo il titolo' }].forEach(x => {
        assert.deepEqual(DF.fontiDaScheda(x), [], JSON.stringify(x));
    });
    assert.equal(DF.registraConferma(undefined, { conFoto: true }), null);
    assert.equal(DF.registraConferma({}, { conFoto: true }), null);
});

test('le pagine attraversano la revisione: lo snapshot delle fonti tiene id, titolo, tipo e testo', () => {
    const f = DF.fontiDaScheda(scheda());
    const snap = RC.sourceSnapshot(f);
    assert.equal(snap.length, 4);
    /* l'ordine dello snapshot (ordinato da review-core) resta quello della griglia */
    assert.deepEqual(snap.map(x => x.title), VC.BLOCCHI.map(b => b.titolo));
    snap.forEach((x, i) => {
        assert.equal(x.id, f[i].id); assert.equal(x.type, 'scheda');
        assert.equal(x.pages[0].text, f[i].pages[0].text);
    });
    assert.equal(DF.eFonteScheda(f), true);
    assert.equal(DF.eFonteScheda(snap), true);
    assert.equal(DF.eFonteScheda([]), false);
    assert.equal(DF.eFonteScheda(undefined), false);
    assert.equal(DF.eFonteScheda([{ type: 'doc', content: '' }]), false);
    assert.equal(DF.eFonteScheda(snap.concat([{ type: 'doc', title: 'x.pdf', pages: [{ n: 1, text: 'x' }] }])), false);
});

test('le evidenze nascono per la strada di sempre: un record per blocco, nessun empty_page', () => {
    const sch = scheda();
    const idx = EC.costruisciIndice(RC.sourceSnapshot(DF.fontiDaScheda(sch)), { adesso: '2026-10-02T10:00:00.000Z' });
    assert.equal(idx.records.length, 4);
    assert.equal(idx.fonti.length, 4);
    assert.ok(!idx.diagnostica.some(d => d.code === 'empty_page' || d.code === 'no_source_text'), JSON.stringify(idx.diagnostica));
});

/* ── la pagina del ramo (giro 2: la cucitura di `MappAIEvidence.materialeRamo`) ── */

const indiceDi = sch => EC.costruisciIndice(RC.sourceSnapshot(DF.fontiDaScheda(sch)), { adesso: '2026-10-02T10:00:00.000Z' });
const pacchettoDi = (p, query) => ({ unita: p.unita.map(u => EC.tipizza(u)), query: query || '', punteggi: { lessicali: 0, esterni: 0 }, scartate: 0 });

test('pagina del ramo: ogni ramo del dossier riceve PER INTERO la pagina del suo blocco, riga per riga, senza ricerca', () => {
    const sch = scheda(), idx = indiceDi(sch);
    VC.nodiDaScheda(sch).nodes.filter(n => n.level === 1).forEach(n => {
        const bl = VC.BLOCCHI.find(b => 'fonte_' + b.id === n.id);
        const p = DF.paginaDelRamo({ nodi: [n], records: idx.records });
        assert.ok(p, n.id);
        assert.equal(p.blocco, bl.id);
        const righe = VC.testoBlocco(sch, bl.id).split('\n');
        assert.deepEqual(p.unita.map(u => u.text), righe, 'tutte le righe, nell’ordine, verbatim');
        p.unita.forEach(u => {
            assert.match(u.id, /^ev-[0-9a-f]{16}-\d+$/);
            assert.equal(u.title, bl.titolo);
            assert.equal(u.origin, 'original');
            assert.ok(idx.records.some(r => r.sourceId === u.sourceId && r.text.includes(u.text)));
        });
        const mat = EC.materialeRamo({ area: n.label, nodi: [n], pacchetto: pacchettoDi(p, n.label) }).materiale;
        p.unita.forEach(u => assert.ok(mat.includes('[[' + u.id + ']]') && mat.includes(u.text)));
    });
    /* i fatti della scheda arrivano al materiale: con la ricerca per parole non arrivavano */
    const tutto = VC.nodiDaScheda(sch).nodes.filter(n => n.level === 1)
        .map(n => EC.formattaPerPrompt(pacchettoDi(DF.paginaDelRamo({ nodi: [n], records: idx.records })))).join('\n');
    ['CDU', '1949', 'rovine', 'colomba', 'Litografia a colori', 'Non mostra le altre forze politiche'].forEach(w => assert.ok(tutto.includes(w), w));
});

test('pagina del ramo: gli id sono quelli che costruisciPacchetto darebbe alla stessa frase (stessa formula di idUnita)', () => {
    const rec = { recordId: 'source:scheda-4-critica-0:0', origin: 'original', sourceId: 'scheda-4-critica-0123456789abcdef', page: 0,
        title: 'Che cosa prova questa fonte', text: 'La propaganda politica del primo dopoguerra tedesco' };
    const daEvidence = EC.costruisciPacchetto({ records: [rec], query: 'propaganda dopoguerra' }).unita;
    const daScheda = DF.paginaDelRamo({ nodi: [{ id: 'fonte_critica', label: 'Che cosa prova questa fonte' }], records: [rec] }).unita;
    assert.equal(daEvidence.length, 1);
    assert.equal(daScheda.length, 1);
    assert.equal(daScheda[0].id, daEvidence[0].id);
});

test('pagina del ramo: il ramo si riconosce dall’id `fonte_<blocco>`, poi dal titolo; altrimenti null (strada di prima)', () => {
    const sch = scheda(), idx = indiceDi(sch);
    /* l'etichetta rinominata sulla tela non conta: decide l'id */
    assert.equal(DF.paginaDelRamo({ nodi: [{ id: 'fonte_osservazione', label: 'Rinominato' }], records: idx.records }).blocco, 'osservazione');
    /* un nodo senza l'id del dossier ma col titolo del blocco */
    assert.equal(DF.paginaDelRamo({ nodi: [{ id: 'n7', label: ' Che cosa si vede ' }], records: idx.records }).blocco, 'osservazione');
    /* la radice, un nodo aggiunto, un blocco senza pagina, nessun record, record non della scheda */
    assert.equal(DF.paginaDelRamo({ nodi: [{ id: 'fonte_0', label: sch.titolo }], records: idx.records }), null);
    assert.equal(DF.paginaDelRamo({ nodi: [{ id: 'nuovo', label: 'Un concetto' }], records: idx.records }), null);
    assert.equal(DF.paginaDelRamo({ nodi: [{ id: 'fonte_critica', label: 'x' }], records: indiceDi(scheda({ critica: {} })).records }), null);
    assert.equal(DF.paginaDelRamo({ nodi: [{ id: 'fonte_identita' }], records: [] }), null);
    assert.equal(DF.paginaDelRamo({}), null);
    const pdf = EC.costruisciIndice([{ id: 'lezione', title: 'Lezione.pdf', pdfHash: 'h', pages: [{ n: 1, text: 'Carta d\'identità del documento.' }] }]);
    assert.equal(DF.paginaDelRamo({ nodi: [{ id: 'fonte_identita', label: 'Carta d\'identità' }], records: pdf.records }), null);
});

test('gli id [[src-…]] che il generatore vede sono quelli che la revisione risolve: niente «Fonte da verificare»', () => {
    const sch = scheda();
    const r = conferma(sch);
    const db = VC.nodiDaScheda(sch);
    /* il generatore (passo B, Evidence spento) e la revisione (G2) leggono le fonti salvate nella review */
    const gen = G.buildInput(db, db.nodes.slice(1, 2), r.sources, r);
    const g2 = G.buildInput(copia(db), copia(db).nodes, copia(r.sources), copia(r), { includeOriginalPages: true });
    assert.ok(gen.sourcesArr.length >= 4);
    gen.sourcesArr.forEach(s => {
        assert.ok(gen.material.includes('[[' + s.id + ']]'));
        assert.ok(g2.sourcesArr.some(x => x.id === s.id && x.title === s.title && x.text === s.text), s.id);
    });
    /* una sintesi che cita due blocchi: il registro della bozza risolve entrambi */
    const testo = 'Il manifesto è della CDU [[' + gen.sourcesArr[0].id + ']] e mostra rovine [[' + gen.sourcesArr[1].id + ']].';
    const reg = G.citationRegistry(testo, gen.sourcesArr);
    const vista = G.referenceView(testo, reg, { sourceLabel: 'Scheda', unknownLabel: 'Scheda da verificare' });
    assert.deepEqual(vista.unknownIds, []);
    assert.match(vista.text, /\[Scheda 1\].*\[Scheda 2\]/);
    assert.equal(vista.mapping[0].source.title, gen.sourcesArr[0].title);
});

/* ── la conferma in CREA, attraverso il cancello ─────────────────────────── */

test('la conferma registra una review APPROVATA che passa il cancello di review-core', () => {
    const sch = scheda();
    const prima = copia(sch);
    const r = conferma(sch);
    assert.deepEqual(sch, prima, 'la scheda non si tocca');
    assert.equal(r.schema, RC.SCHEMA);
    assert.equal(r.initial.status, 'approved');
    assert.equal(r.initial.manualReview, true);
    assert.deepEqual(r.initial.issues, []);
    assert.equal(r.fonteScheda.conFoto, true);
    assert.equal(r.fonteScheda.confermataIl, '2026-10-02T10:00:00.000Z');
    assert.deepEqual(r.sources, RC.sourceSnapshot(DF.fontiDaScheda(sch)));
    assert.deepEqual(r.approvedSnapshot, RC.semanticSnapshot(VC.nodiDaScheda(sch)));
    assert.equal(r.approvedRevision, RC.revision(VC.nodiDaScheda(sch), DF.fontiDaScheda(sch)));
    const g = RC.gate(r, VC.nodiDaScheda(sch), r.sources);
    assert.deepEqual(g, { allowed: true, reason: 'approved', legacy: false });
    /* anche dopo il viaggio nel JSON di pipeline.json */
    assert.equal(RC.gate(copia(r), copia(VC.nodiDaScheda(sch)), copia(r.sources)).allowed, true);
});

test('M5 · se un campo, il titolo o un blocco cambiano dopo la conferma il cancello si richiude: stale_revision', () => {
    const sch = scheda();
    const r = conferma(sch);
    const campo = copia(sch); campo.identita.data = '1953';
    assert.deepEqual(RC.gate(r, VC.nodiDaScheda(campo), r.sources), { allowed: false, reason: 'stale_revision' });
    const titolo = copia(sch); titolo.titolo = 'Un altro titolo';
    assert.equal(RC.gate(r, VC.nodiDaScheda(titolo), r.sources).reason, 'stale_revision');
    const blocco = copia(sch); blocco.critica = {};
    assert.equal(RC.gate(r, VC.nodiDaScheda(blocco), r.sources).reason, 'stale_revision');
    /* e con le fonti nuove della scheda cambiata (l'indice si rifà, inv. 6) */
    assert.equal(RC.gate(r, VC.nodiDaScheda(sch), DF.fontiDaScheda(campo)).reason, 'stale_revision');
    assert.equal(DF.statoConferma(sch, r), 'confermata');
    assert.equal(DF.statoConferma(campo, r), 'stale_revision');
    assert.equal(DF.statoConferma(titolo, r), 'stale_revision');
    assert.equal(DF.statoConferma(sch, null), 'da_confermare');
    assert.equal(DF.statoConferma(sch, { initial: { status: 'awaiting_review' } }), 'da_confermare');
});

test('senza la foto accanto ai campi la conferma non si registra (ADR 0016: sono un pezzo solo)', () => {
    assert.equal(DF.registraConferma(scheda(), {}), null);
    assert.equal(DF.registraConferma(scheda(), { conFoto: false }), null);
    assert.equal(DF.registraConferma(scheda()), null);
    assert.equal(DF.registraConferma(scheda({ identita: {}, osservazione: {}, interpretazione: {}, critica: {} }), { conFoto: true }), null);
});

/* ── la decisione al checkpoint: G1 o niente G1 ───────────────────────────── */

test('M4 · M6 · decidi: la conferma vale solo a interruttore acceso, per un dossier da immagine, se il cancello passa', () => {
    const sch = scheda(), r = conferma(sch), db = VC.nodiDaScheda(sch);
    const si = DF.decidi({ acceso: true, dossier: copia(sch), conferma: r, db: copia(db) });
    assert.equal(si.usa, true);
    assert.equal(si.motivo, 'approved');
    assert.equal(RC.gate(si.review, db, si.review.sources).allowed, true);
    assert.notEqual(si.review, r, 'una copia, non la conferma tenuta in CREA');
    /* M4: spento → la strada di prima, anche con una conferma valida */
    assert.deepEqual(DF.decidi({ acceso: false, dossier: sch, conferma: r, db }), { usa: false, motivo: 'spento' });
    assert.equal(DF.decidi({ dossier: sch, conferma: r, db }).usa, false);
    /* M6: una mappa da fonte testuale non ha `config.dossier` → G1 come sempre,
       anche se in memoria c'è una conferma il cui contenuto combacia col db */
    assert.deepEqual(DF.decidi({ acceso: true, dossier: null, conferma: r, db }), { usa: false, motivo: 'non_dossier' });
    assert.deepEqual(DF.decidi({ acceso: true, dossier: undefined, conferma: r, db }), { usa: false, motivo: 'non_dossier' });
    assert.deepEqual(DF.decidi({ acceso: true, dossier: { titolo: 'mappa' }, conferma: r, db }), { usa: false, motivo: 'non_dossier' });
    /* foto mai confermata nel riquadro → la strada di prima (G1) */
    assert.deepEqual(DF.decidi({ acceso: true, dossier: sch, conferma: null, db }), { usa: false, motivo: 'non_confermata' });
    const inAttesa = RC.createReview({ db, sources: DF.fontiDaScheda(sch) });
    assert.equal(DF.decidi({ acceso: true, dossier: sch, conferma: inAttesa, db }).motivo, 'non_confermata');
});

test('M5 · decidi: una scheda corretta dopo la conferma, o un db diverso, richiude il cancello (stale_revision)', () => {
    const sch = scheda(), r = conferma(sch);
    const dopo = copia(sch); dopo.osservazione.descrizione = 'Una folla in piazza.';
    assert.deepEqual(DF.decidi({ acceso: true, dossier: dopo, conferma: r, db: VC.nodiDaScheda(dopo) }), { usa: false, motivo: 'stale_revision' });
    /* il db vivo non è più quello confermato (un nodo toccato sulla tela) */
    const db = VC.nodiDaScheda(sch); db.nodes[1].desc += ' (aggiunta)';
    assert.deepEqual(DF.decidi({ acceso: true, dossier: sch, conferma: r, db }), { usa: false, motivo: 'stale_revision' });
});

test('M5 · decidi: il primo cancello è sulla SCHEDA del giro — basta che lei sia cambiata, anche se la mappa viva è ancora quella confermata', () => {
    const sch = scheda(), r = conferma(sch);
    const dopo = copia(sch); dopo.critica.tace = 'Non mostra chi pagò la stampa';
    /* il db è quello confermato: senza il cancello sulla scheda si passerebbe */
    assert.equal(RC.gate(r, VC.nodiDaScheda(sch), r.sources).allowed, true);
    assert.deepEqual(DF.decidi({ acceso: true, dossier: dopo, conferma: r, db: VC.nodiDaScheda(sch) }), { usa: false, motivo: 'stale_revision' });
    /* e senza db, la scheda decide da sola */
    assert.deepEqual(DF.decidi({ acceso: true, dossier: dopo, conferma: r }), { usa: false, motivo: 'stale_revision' });
});

test('perIlGiro: la review del giro porta cartella, progetto e config, e passa ancora il cancello', () => {
    const sch = scheda(), r = conferma(sch), db = VC.nodiDaScheda(sch);
    const prima = copia(r);
    const g = DF.perIlGiro(r, { vaultPath: '/V/Mappe/4R/Storia/Manifesto', projectId: 'p-1', config: { dossier: sch, quiz: null }, now: '2026-10-02T11:00:00.000Z' });
    assert.deepEqual(r, prima, 'la conferma non si tocca');
    assert.equal(g.vaultPath, '/V/Mappe/4R/Storia/Manifesto');
    assert.equal(g.projectId, 'p-1');
    assert.equal(g.config.dossier.titolo, sch.titolo);
    assert.equal(g.updatedAt, '2026-10-02T11:00:00.000Z');
    assert.equal(g.initial.status, 'approved');
    assert.equal(RC.gate(g, db, g.sources).allowed, true);
    assert.equal(DF.perIlGiro(null, {}), null);
});

/* ── il pannello della fonte in G2 ────────────────────────────────────────── */

test('il pannello: scheda come fonte → le sue pagine e l’immagine; dossier di prima → la scheda senza agganci; spento → come prima', () => {
    const sch = scheda(), r = conferma(sch);
    const nuovo = DF.fontiDelPannello({ sources: r.sources, dossier: sch, acceso: true });
    assert.equal(nuovo.immagine, true); assert.equal(nuovo.agganciate, true);
    assert.deepEqual(nuovo.sources, r.sources);
    /* un dossier generato prima dell'interruttore: fonti vuote → la scheda, non un pannello vuoto */
    const vecchie = [{ type: 'doc', title: 'manifesto_1949.jpg', content: '' }];
    const vecchio = DF.fontiDelPannello({ sources: vecchie, dossier: sch, acceso: true });
    assert.equal(vecchio.immagine, true); assert.equal(vecchio.agganciate, false);
    assert.equal(vecchio.sources.length, 4);
    assert.equal(RF.indicePagine(vecchio.sources).length, 4);
    /* spento, dossier di prima: le fonti di prima, niente immagine */
    const spento = DF.fontiDelPannello({ sources: vecchie, dossier: sch, acceso: false });
    assert.deepEqual(spento, { sources: vecchie, immagine: false, agganciate: false });
    /* nato acceso e riaperto a spento: decide il DATO, come per le etichette (nota 7) */
    const riaperto = DF.fontiDelPannello({ sources: r.sources, dossier: sch, acceso: false });
    assert.deepEqual(riaperto, { sources: r.sources, immagine: true, agganciate: true });
    assert.equal(DF.fontiDelPannello({ sources: r.sources, dossier: undefined, acceso: false }).agganciate, true);
    /* una mappa normale: niente cambia */
    const pdf = [{ type: 'doc', title: 'Lezione.pdf', pages: [{ n: 1, text: 'testo' }] }];
    assert.deepEqual(DF.fontiDelPannello({ sources: pdf, dossier: null, acceso: true }), { sources: pdf, immagine: false, agganciate: false });
    assert.deepEqual(DF.fontiDelPannello({}), { sources: [], immagine: false, agganciate: false });
});

test('il pannello, con la scheda: un rimando che non combacia non si aggancia a «Carta d’identità» (nota 4)', () => {
    const sch = scheda(), indice = RF.indicePagine(DF.fontiDaScheda(sch));
    const ignoto = { docId: 'doc-che-non-c-e', title: 'Fonte', page: 0, text: 'una frase che nella scheda non c’è' };
    assert.equal(RF.paginaPer(ignoto, indice, true), null);
    assert.equal(RF.paginaPer({ title: 'Fonte', text: 'niente' }, indice, true), null);
    /* il testo trovato aggancia il blocco giusto, anche con un documento ignoto */
    assert.equal(RF.paginaPer({ docId: 'doc-x', text: 'Wählt CDU! Für Freiheit und Frieden' }, indice, true).title, 'Che cosa si vede');
    /* il blocco nominato per documento o per titolo si apre anche se il testo è cambiato */
    const f = DF.fontiDaScheda(sch);
    assert.equal(RF.paginaPer({ docId: f[2].docId, text: 'parafrasi' }, indice, true).title, 'Che cosa vuole ottenere');
    assert.equal(RF.paginaPer({ title: 'Che cosa prova questa fonte', text: 'parafrasi' }, indice, true).title, 'Che cosa prova questa fonte');
    /* senza `rigorosa` (un PDF) il ripiego di sempre resta */
    assert.ok(RF.paginaPer(ignoto, indice));
});

test('il pannello ritrova la foto in Allegati: prima il nome del titolo, poi l’unica immagine; mai un PDF', () => {
    assert.equal(RF.trovaFoto(['Manifesto elettorale tedesco post 2a GM.jpg', 'altra.png'], 'Manifesto elettorale tedesco post 2a GM'), 'Manifesto elettorale tedesco post 2a GM.jpg');
    assert.equal(RF.trovaFoto(['Manifesto_elettorale_tedesco_post_2a_GM.JPEG', 'x.png'], 'Manifesto elettorale tedesco post 2a GM'), 'Manifesto_elettorale_tedesco_post_2a_GM.JPEG');
    assert.equal(RF.trovaFoto(['fonte.png', 'lezione.pdf'], 'Titolo che non c’è'), 'fonte.png');
    assert.equal(RF.trovaFoto(['a.png', 'b.jpg'], 'Titolo che non c’è'), null, 'due immagini e nessun nome: meglio nessuna che quella sbagliata');
    assert.equal(RF.trovaFoto(['lezione.pdf'], 'lezione'), null);
    assert.equal(RF.trovaFoto([], 'x'), null);
    assert.equal(RF.trovaFoto(undefined, 'x'), null);
});

/* ── il riquadro di CREA (markup del core di CREA) ─────────────────────────── */

test('il riquadro: la foto SOPRA i campi (Giacomo, giro 4), un campo per voce della griglia, la conferma come bottone', () => {
    const sch = scheda({ osservazione: { descrizione: 'L\'uomo <guarda> "avanti"' } });
    const h = IC.htmlRiquadro(sch, { foto: 'data:image/jpeg;base64,AAAA', stato: 'da_confermare' });
    assert.match(h, /<img [^>]*class="ci-riquadro__img"[^>]*src="data:image\/jpeg;base64,AAAA"/);
    assert.ok(h.indexOf('ci-riquadro__foto') < h.indexOf('ci-riquadro__campi'), 'la foto sopra i campi');
    VC.BLOCCHI.forEach(bl => {
        assert.ok(h.includes('data-ci-blocco="' + bl.id + '"'), bl.id);
        bl.campi.forEach(c => assert.ok(h.includes('data-ci-campo="' + bl.id + '.' + c.id + '"'), bl.id + '.' + c.id));
    });
    assert.ok(h.includes('L&#39;uomo &lt;guarda&gt; &quot;avanti&quot;'));
    assert.ok(!h.includes('<guarda>'));
    const bottoni = h.match(/<button[^>]*>/g) || [];
    assert.ok(bottoni.length >= 1);
    bottoni.forEach(b => assert.match(b, /type="button"/));
    assert.match(h, /data-ci="conferma"(?![^>]*disabled)/);
    assert.match(h, /data-ci-stato="da_confermare"/);
    assert.match(IC.htmlRiquadro(sch, { foto: 'x.jpg', stato: 'confermata' }), /data-ci-stato="confermata"/);
    assert.match(IC.htmlRiquadro(sch, { foto: 'x.jpg', stato: 'stale_revision' }), /data-ci-stato="stale_revision"/);
});

test('il riquadro senza foto: nessuna immagine, la conferma è spenta e si dice perché', () => {
    const h = IC.htmlRiquadro(scheda(), { foto: null, stato: 'da_confermare' });
    assert.ok(!h.includes('<img'));
    assert.match(h, /<button[^>]*data-ci="conferma"[^>]*disabled/);
    assert.match(h, /ci-riquadro__senza/);
    assert.equal(IC.htmlRiquadro(null, { foto: 'x' }), '');
    ['da_confermare', 'confermata', 'stale_revision'].forEach(s => assert.ok(IC.testoStato(s).length > 10, s));
    assert.notEqual(IC.testoStato('confermata'), IC.testoStato('stale_revision'));
});

/* ── giro 3 (gate 3, «tutto nel riquadro»): la superficie dello 0067 non si apre
   in CREA, la scheda letta entra fra le fonti NON confermata, e titolo, campi,
   foto, materiali e conferma vivono nel riquadro ─────────────────────────── */

test('giro 3 · la superficie si salta SOLO con l’interruttore acceso, dalle fonti di CREA, col riquadro montabile', () => {
    assert.equal(DF.soloRiquadro({ acceso: true, daCrea: true, guscio: true }), true);
    /* spento: la superficie dello 0067, byte per byte */
    assert.equal(DF.soloRiquadro({ acceso: false, daCrea: true, guscio: true }), false);
    /* il wizard «Da che cosa» (nuovaScheda senza file) e l'editor di ELABORA tengono la superficie */
    assert.equal(DF.soloRiquadro({ acceso: true, daCrea: false, guscio: true }), false);
    /* senza il guscio la scheda non avrebbe un posto dove validarsi: superficie */
    assert.equal(DF.soloRiquadro({ acceso: true, daCrea: true, guscio: false }), false);
    assert.equal(DF.soloRiquadro({ acceso: 'true', daCrea: 1, guscio: true }), false);
    /* l'interruttore non letto, o letto come stringa, NON accende: solo `true` dal core (`acceso`) */
    [undefined, null, '1', 1].forEach(a => assert.equal(DF.soloRiquadro({ acceso: a, daCrea: true, guscio: true }), false, String(a)));
    assert.equal(DF.soloRiquadro(), false);
});

test('giro 3 · contenuto e opzione: solo titolo e campi della griglia sono contenuto; le scelte dei materiali sono opzioni', () => {
    assert.equal(DF.campoDelRiquadro('titolo'), 'contenuto');
    VC.BLOCCHI.forEach(bl => bl.campi.forEach(c => assert.equal(DF.campoDelRiquadro(bl.id + '.' + c.id), 'contenuto', bl.id + '.' + c.id)));
    ['oq.on', 'oq.n', 'fc.cat.identita', 'mc.ang.causa', 'mc.ang.conseguenza', 'syn.on', 'syn.audio'].forEach(k => assert.equal(DF.campoDelRiquadro(k), 'opzione', k));
    ['identita.inventato', 'oq.boh', 'xx.on', '', null, '__proto__', 'titolo.x'].forEach(k => assert.equal(DF.campoDelRiquadro(k), null, String(k)));
});

test('giro 3 · cambiare i materiali NON invalida la conferma; cambiare un campo sì', () => {
    const sch = scheda({ opzioni: { oq: { on: true, n: 3 }, fc: { on: true, n: 3 }, mc: { on: false }, syn: true, voce: false } });
    const r = conferma(sch);
    sch.opzioni.mc = { on: true, n: 5, cat: ['identita'], angoli: ['causa'] };
    sch.opzioni.voce = true; sch.opzioni.syn = false;
    assert.equal(DF.statoConferma(sch, r), 'confermata');
    assert.equal(DF.decidi({ acceso: true, dossier: copia(sch), conferma: r, db: VC.nodiDaScheda(sch) }).usa, true);
    /* e le opzioni arrivano alle uscite del dossier come dalla superficie */
    const u = IC.uscite({}, sch);
    assert.deepEqual(u.quiz.types, ['open', 'flashcards', 'mc']);
    assert.equal(u.synthesis, null);
    sch.osservazione.tipografia = 'Graziato';
    assert.equal(DF.statoConferma(sch, r), 'stale_revision');
});

test('giro 3 · si può confermare: foto vista E almeno le righe che la superficie chiedeva', () => {
    assert.deepEqual(DF.puoConfermare(scheda(), { fotoVista: true }), { ok: true, motivo: '' });
    assert.deepEqual(DF.puoConfermare(scheda(), { fotoVista: false }), { ok: false, motivo: 'foto' });
    assert.deepEqual(DF.puoConfermare(scheda(), {}), { ok: false, motivo: 'foto' });
    /* la soglia è quella di «Usa questa fonte» (`schedaPronta`, dieci parole) */
    const corta = scheda({ identita: { genere: 'Manifesto' }, osservazione: {}, interpretazione: {}, critica: {} });
    assert.equal(VC.schedaPronta(corta), false);
    assert.deepEqual(DF.puoConfermare(corta, { fotoVista: true }), { ok: false, motivo: 'poco' });
    assert.deepEqual(DF.puoConfermare(null, { fotoVista: true }), { ok: false, motivo: 'scheda' });
});

test('giro 3 · la card dello 0067 non contraddice il riquadro: niente «Rivedi», niente campo del titolo, lo stato vero', () => {
    const fonti = [{ id: 'f1', type: 'doc', file: { name: 'manifesto_1949.jpg' }, _scheda: scheda() }];
    const prima = IC.composizione(fonti);
    /* spento (nessuna opzione): quella di prima */
    assert.equal(prima.riquadro, undefined);
    assert.match(prima.statoParti, /^Scheda confermata — 4 parti su 4$/);
    assert.match(IC.htmlScheda(prima), /data-ci="rivedi"/);
    const letta = IC.composizione(fonti, { riquadro: true, statoConferma: 'da_confermare' });
    assert.equal(letta.riquadro, true);
    assert.ok(!/confermata/i.test(letta.statoParti), letta.statoParti);
    assert.match(letta.statoParti, /4 parti su 4/);
    const h = IC.htmlScheda(letta);
    assert.ok(!h.includes('data-ci="rivedi"'));
    assert.ok(!h.includes('data-ci="titolo"'));
    assert.ok(h.includes('Manifesto elettorale tedesco post 2a GM'));
    assert.match(IC.composizione(fonti, { riquadro: true, statoConferma: 'confermata' }).statoParti, /confermata/);
    assert.match(IC.composizione(fonti, { riquadro: true, statoConferma: 'stale_revision' }).statoParti, /cambiata/);
    /* la foto in lettura non rimanda a «Usa questa fonte», che non c'è più */
    const leggendo = IC.composizione([{ id: 'f2', type: 'doc', file: { name: 'b.jpg' } }], { inLettura: ['f2'], riquadro: true });
    assert.ok(!leggendo.mancano.includes('Usa questa fonte'), leggendo.mancano);
    assert.ok(IC.composizione([{ id: 'f2', type: 'doc', file: { name: 'b.jpg' } }], { inLettura: ['f2'] }).mancano.includes('Usa questa fonte'));
});

test('giro 3 · il riquadro porta il titolo, il posto dei materiali e la stima; la riga della fonte dice lo stato vero', () => {
    const sch = scheda({ titolo: 'L\'Europa «unita»' });
    const h = IC.htmlRiquadro(sch, { foto: 'x.jpg', stato: 'da_confermare' });
    assert.match(h, /<input[^>]*data-ci-campo="titolo"[^>]*value="L&#39;Europa «unita»"/);
    assert.match(h, /data-ci-materiali/);
    assert.ok(h.indexOf('data-ci-campo="titolo"') < h.indexOf('data-ci-blocco="identita"'));
    assert.ok(h.indexOf('data-ci-materiali') < h.indexOf('data-ci="conferma"'), 'i materiali prima della conferma');
    const a = IC.rigaFonte('da_confermare', 'm.jpg'), b = IC.rigaFonte('confermata', 'm.jpg'), c = IC.rigaFonte('stale_revision', 'm.jpg');
    assert.equal(a.tono, 'avviso'); assert.equal(b.tono, 'ok'); assert.equal(c.tono, 'avviso');
    [a, b, c].forEach(x => assert.ok(x.testo.startsWith('m.jpg — ')));
    assert.ok(!/confermata/.test(a.testo));
});

/* ── giro 4 (Giacomo, 03/10: le sette istruzioni del layout) ──────────────────
   Il riquadro prende il posto della riga 2: titolo + «Aa», poi la foto larga
   quanto il riquadro, poi i campi uno per riga, poi i materiali su due colonne,
   poi stato e conferma. Esiste già mentre la foto si legge. */

test('giro 4 · la fase del riquadro: letta, in lettura, da leggere (lettura fallita o annullata)', () => {
    assert.equal(IC.faseRiquadro({ scheda: scheda(), inLettura: true }), 'letta');
    assert.equal(IC.faseRiquadro({ scheda: null, inLettura: true }), 'in_lettura');
    assert.equal(IC.faseRiquadro({ scheda: null, inLettura: false }), 'da_leggere');
    assert.equal(IC.faseRiquadro({}), 'da_leggere');
    assert.equal(IC.faseRiquadro(), 'da_leggere');
});

test('giro 5 · «Aa» cicla ×1 → ×1,25 → ×1,5 → ×1 (+25% additivo), a schermo sempre e solo «Aa» (era «Aa+»: 0087 lotto 6)', () => {
    assert.equal(IC.zoomSuccessivo(1), 1.25);
    assert.equal(IC.zoomSuccessivo(1.25), 1.5);
    assert.equal(IC.zoomSuccessivo(1.5), 1);
    /* additivo, non composto: dopo 1,25 viene 1,5, non 1,5625 */
    assert.notEqual(IC.zoomSuccessivo(1.25), 1.5625);
    [undefined, null, 0, 2, 3, '1.25', NaN].forEach(z => assert.equal(IC.zoomSuccessivo(z), 1.25, String(z)));
    [1, 1.25, 1.5, 2, 7, undefined].forEach(z => assert.equal(IC.etichettaZoom(z), 'Aa', String(z)));
    /* lo stato per chi usa un lettore di schermo: il fattore nell'aria-label */
    assert.match(IC.ariaZoom(1), /×1$/);
    assert.match(IC.ariaZoom(1.25), /×1,25$/);
    assert.match(IC.ariaZoom(1.5), /×1,5$/);
    assert.match(IC.ariaZoom(9), /×1$/);
});

test('giro 4 · il titolo: il nome del file mentre si legge, poi quello dell’AI — ma mai sopra ciò che il docente ha scritto', () => {
    const prov = VC.titoloDaNome('manifesto_cdu_1949.jpg');
    assert.equal(prov, 'manifesto cdu 1949');
    /* il campo non è stato toccato: arriva il titolo dell'AI («Titolo o slogan») */
    assert.equal(IC.titoloDopoLettura({ provvisorio: prov, scritto: prov, dallAI: '  Deutschland   wählt ' }), 'Deutschland wählt');
    /* il docente ha già scritto durante la lettura: resta il suo */
    assert.equal(IC.titoloDopoLettura({ provvisorio: prov, scritto: 'Manifesto CDU 1949', dallAI: 'Deutschland wählt' }), 'Manifesto CDU 1949');
    /* l'AI non ha letto un titolo: resta il nome del file */
    assert.equal(IC.titoloDopoLettura({ provvisorio: prov, scritto: prov, dallAI: '' }), prov);
    /* il campo svuotato durante la lettura non conta come una scelta */
    assert.equal(IC.titoloDopoLettura({ provvisorio: prov, scritto: '   ', dallAI: 'Deutschland wählt' }), 'Deutschland wählt');
    assert.equal(IC.titoloDopoLettura({ provvisorio: prov, dallAI: 'X' }), 'X');
});

test('giro 4 · quale foto: il file intero se il browser lo legge, altrimenti la copia della scheda', () => {
    assert.equal(IC.fotoDelRiquadro({ file: true, anteprima: true, fotoB64: true }), 'file');
    assert.equal(IC.fotoDelRiquadro({ file: true, anteprima: true, fotoB64: false }), 'file');
    /* HEIC: il file non si mostra, la scheda porta la copia convertita */
    assert.equal(IC.fotoDelRiquadro({ file: true, anteprima: false, fotoB64: true }), 'b64');
    assert.equal(IC.fotoDelRiquadro({ file: true, anteprima: false, fotoB64: false }), '');
    assert.equal(IC.fotoDelRiquadro({ file: false, anteprima: true, fotoB64: true }), 'b64');
    assert.equal(IC.fotoDelRiquadro({}), '');
});

test('giro 6 · un box per materiale, nell’ordine di Giacomo: Flashcard, Domande aperte, Scelta multipla, Sintesi', () => {
    /* le sezioni arrivano nell'ordine di `_sezioniOpzioni` (oq, fc, mc, syn): i box no */
    const ids = ['op-oq', 'op-oq-cat', 'op-oq-ang', 'op-fc', 'op-fc-cat', 'op-fc-ang', 'op-mc', 'op-mc-cat', 'op-mc-ang', 'op-syn'];
    assert.deepEqual(IC.gruppiOpzioni(ids), [
        { genere: 'fc', sezioni: ['op-fc', 'op-fc-cat', 'op-fc-ang'] },
        { genere: 'oq', sezioni: ['op-oq', 'op-oq-cat', 'op-oq-ang'] },
        { genere: 'mc', sezioni: ['op-mc', 'op-mc-cat', 'op-mc-ang'] },
        { genere: 'syn', sezioni: ['op-syn'] }]);
    /* dentro un box l'ordine resta testa, parti, angoli, anche se arrivano mescolati */
    assert.deepEqual(IC.gruppiOpzioni(['op-fc-ang', 'op-fc', 'op-fc-cat']), [{ genere: 'fc', sezioni: ['op-fc', 'op-fc-cat', 'op-fc-ang'] }]);
    /* senza angoli (QUIZ_ANGLES vuoto) e con una sezione sconosciuta: niente si perde */
    assert.deepEqual(IC.gruppiOpzioni(['op-oq', 'op-oq-cat', 'x', 'op-syn']),
        [{ genere: 'oq', sezioni: ['op-oq', 'op-oq-cat'] }, { genere: 'syn', sezioni: ['op-syn'] }, { genere: 'altro', sezioni: ['x'] }]);
    /* un genere nuovo (non nell'elenco) va dopo quelli noti, prima di «altro» */
    assert.deepEqual(IC.gruppiOpzioni(['op-zz', 'op-mc', 'x']).map(g => g.genere), ['mc', 'zz', 'altro']);
    assert.deepEqual(IC.gruppiOpzioni([]), []);
});

test('giro 4 · una frase di stato sola: lettura in corso, «Leggi prima la foto», o lo stato della conferma con le parti', () => {
    assert.match(IC.fraseStato({ fase: 'in_lettura', nome: 'b.jpg' }), /Sto leggendo/);
    assert.equal(IC.fraseStato({ fase: 'da_leggere', mancano: 'Leggi prima la foto «b.jpg»: …' }), 'Leggi prima la foto «b.jpg»: …');
    const f = IC.fraseStato({ fase: 'letta', stato: 'da_confermare', parti: 3, totali: 4 });
    assert.ok(f.startsWith(IC.testoStato('da_confermare')));
    assert.match(f, /3 parti su 4/);
    assert.ok(IC.fraseStato({ fase: 'letta', stato: 'stale_revision', parti: 4, totali: 4 }).startsWith(IC.testoStato('stale_revision')));
});

test('giro 4 · il riquadro dall’alto in basso: titolo con «Aa», foto, campi uno per riga, materiali, stato e conferma', () => {
    const h = IC.htmlRiquadro(scheda(), { foto: 'x.jpg', stato: 'da_confermare', zoom: 1.25 });
    const pos = s => { const i = h.indexOf(s); assert.ok(i >= 0, s); return i; };
    assert.ok(pos('data-ci-campo="titolo"') < pos('ci-riquadro__img'));
    assert.ok(pos('data-ci="zoom"') < pos('ci-riquadro__img'));
    assert.ok(pos('ci-riquadro__img') < pos('data-ci-blocco="identita"'));
    assert.ok(pos('data-ci-blocco="critica"') < pos('data-ci-materiali'));
    assert.ok(pos('data-ci-materiali') < pos('data-ci="conferma"'));
    /* «Aa»: un bottone con testo, nessuna icona, lo stato in aria-pressed */
    const zoom = h.match(/<button[^>]*data-ci="zoom"[^>]*>[^<]*<\/button>/);
    assert.ok(zoom, 'bottone Aa senza markup dentro (niente icone)');
    assert.match(zoom[0], /type="button"/);
    assert.match(zoom[0], /aria-pressed="true"/);
    assert.match(zoom[0], />Aa</);
    assert.match(zoom[0], /aria-label="[^"]*×1,25"/);
    assert.ok(!/×/.test(zoom[0].replace(/aria-label="[^"]*"/, '').replace(/title="[^"]*"/, '')), 'nessun fattore a schermo');
    assert.match(IC.htmlRiquadro(scheda(), { foto: 'x.jpg' }), /data-ci="zoom"[^>]*aria-pressed="false"/);
    /* le textarea partono da una riga: l'altezza la fa il contenuto */
    (h.match(/<textarea[^>]*>/g) || []).forEach(x => assert.match(x, /rows="1"/));
});

test('giro 4 · durante la lettura: titolo e foto ci sono, i campi no, la conferma è spenta', () => {
    const lett = IC.htmlRiquadroLettura({ fase: 'in_lettura', nome: 'b.jpg' });
    assert.match(lett, /Sto leggendo/);
    assert.ok(!lett.includes('<textarea'));
    const da = IC.htmlRiquadroLettura({ fase: 'da_leggere', mancano: 'Leggi prima la foto «b.jpg»', motivo: 'Manca il token.' });
    assert.match(da, /<button type="button"[^>]*data-ci="leggi"/);
    assert.ok(da.includes('Manca il token.'));
    const piede = IC.htmlRiquadroPiede({ fase: 'in_lettura', nome: 'b.jpg', foto: true });
    assert.match(piede, /<button[^>]*data-ci="conferma"[^>]*disabled/);
    assert.match(IC.htmlRiquadroPiede({ fase: 'letta', stato: 'da_confermare', parti: 4, totali: 4, foto: true }), /data-ci="conferma"(?![^>]*disabled)/);
    assert.match(IC.htmlRiquadroPiede({ fase: 'letta', stato: 'da_confermare', parti: 4, totali: 4, foto: false }), /data-ci="conferma"[^>]*disabled/);
    /* gli avvisi della composizione dello 0067 (altre foto, altre fonti) restano */
    assert.ok(IC.htmlRiquadroPiede({ fase: 'letta', stato: 'confermata', parti: 4, totali: 4, foto: true, avvisi: ['e altre 2: un dossier per ciascuna'] }).includes('e altre 2'));
    const testa = IC.htmlRiquadroTesta('L\'età «d\'oro»', 1.5);
    assert.match(testa, /value="L&#39;età «d&#39;oro»"/);
    assert.match(testa, />Aa<\/button>/);
    assert.match(testa, /aria-label="[^"]*×1,5"/);
});

/* ── giro 7: la lettura fallita (guasto visto in Electron il 03/10) ───────────
   Qwen3.5-397B ha risposto con un JSON rotto in due punti (la chiave «data»
   persa: `": "1917"`, e una graffa finale mancante). `normalizzaAnalisi` cade nel
   suo ripiego: TUTTA la risposta grezza in `osservazione.descrizione`, gli altri
   16 campi vuoti. La fixture ha la stessa forma della risposta vera, ridotta. */
const RISPOSTA_ROTTA = '{ "identita": { "genere": "manifesto di propaganda", "titolo": "LA GUERRE est l\'Industrie Nationale de la PRUSSE", ' +
    '"autore": "Maurice Neumont (firma visibile in basso a destra)", ": "1917", "luogo": "Parigi, Francia", "tecnica": "litografia a colori su carta" },' +
    '"osservazione": { "descrizione": "Una mappa dell\'Europa centrale e occidentale con la Germania e i territori annessi" },' +
    '"critica": { "prova": "La propaganda francese del 1917", "tace": "Non rappresenta le popolazioni civili tedesche." }';
const salvageNudo = s => JSON.parse(s);
function schedaRotta() {
    const a = VC.normalizzaAnalisi(RISPOSTA_ROTTA, salvageNudo);
    const s = { titolo: 'La Guerre', nomeFile: 'La_Guerre.jpg', fotoB64: 'AAAA', mime: 'image/jpeg' };
    VC.BLOCCHI.forEach(bl => { s[bl.id] = a[bl.id]; });
    return s;
}

test('giro 7 · la fixture riproduce il guasto: tutta la risposta in «Descrizione», gli altri campi vuoti', () => {
    const s = schedaRotta();
    assert.ok(s.osservazione.descrizione.startsWith('{ "identita": {'));
    let pieni = 0;
    VC.BLOCCHI.forEach(bl => bl.campi.forEach(c => { if (String(s[bl.id][c.id] || '').trim()) pieni++; }));
    assert.equal(pieni, 1);
});

test('giro 7 · letturaFallita: la risposta grezza E tutti gli altri campi vuoti, insieme', () => {
    assert.equal(DF.letturaFallita(schedaRotta()), true);
    /* le altre forme della risposta grezza: un recinto ```, una chiave della griglia fra virgolette */
    const conRecinto = scheda({ identita: {}, osservazione: { descrizione: '```json\n{ "identita": { "genere": "x" } }' }, interpretazione: {}, critica: {} });
    assert.equal(DF.letturaFallita(conRecinto), true);
    const conChiave = scheda({ identita: {}, osservazione: { descrizione: 'Ecco la scheda: "osservazione": { "descrizione": "una mappa" }' }, interpretazione: {}, critica: {} });
    assert.equal(DF.letturaFallita(conChiave), true);
    /* basta-la-descrizione: una scheda vera con la sola descrizione scritta dal docente NON è fallita */
    const soloDocente = scheda({ identita: {}, osservazione: { descrizione: 'Una mappa dell\'Europa con la Germania al centro, colorata di nero.' }, interpretazione: {}, critica: {} });
    assert.equal(DF.letturaFallita(soloDocente), false);
    /* basta-la-graffa: una descrizione che comincia con «{» ma i campi pieni NON è fallita */
    assert.equal(DF.letturaFallita(scheda({ osservazione: { descrizione: '{ "identita": tre parole }' } })), false);
    /* ignora-campi-pieni: basta UN campo pieno in un altro blocco */
    const unCampo = schedaRotta(); unCampo.identita.data = '1917';
    assert.equal(DF.letturaFallita(unCampo), false);
    const unaltro = schedaRotta(); unaltro.critica.tace = 'Non mostra i civili.';
    assert.equal(DF.letturaFallita(unaltro), false);
    [null, undefined, {}, 'x', scheda({ identita: {}, osservazione: {}, interpretazione: {}, critica: {} })].forEach(x => assert.equal(DF.letturaFallita(x), false));
});

test('giro 7 · una lettura fallita non si conferma, da nessuna strada', () => {
    const s = schedaRotta();
    assert.deepEqual(DF.puoConfermare(s, { fotoVista: true }), { ok: false, motivo: 'lettura' });
    assert.equal(DF.registraConferma(s, { conFoto: true, now: 'x' }), null);
    /* la stessa scheda, letta bene: si conferma */
    assert.equal(DF.puoConfermare(scheda(), { fotoVista: true }).ok, true);
});

test('giro 7 · il riquadro: la frase, «Leggi di nuovo», la risposta del modello chiusa, la conferma spenta', () => {
    assert.equal(IC.faseRiquadro({ scheda: schedaRotta(), fallita: true }), 'fallita');
    assert.equal(IC.faseRiquadro({ scheda: scheda(), fallita: false }), 'letta');
    assert.equal(IC.faseRiquadro({ scheda: null, fallita: true, inLettura: true }), 'in_lettura');
    const s = schedaRotta();
    const h = IC.htmlRiquadroLettura({ fase: 'fallita', grezzo: s.osservazione.descrizione });
    assert.ok(h.includes('La lettura della foto non è riuscita'));
    assert.match(h, /<button type="button"[^>]*data-ci="leggi"[^>]*>Leggi di nuovo<\/button>/);
    assert.ok(!h.includes('<textarea'));
    /* la risposta grezza: solo dentro un <details> chiuso, mai come campo da rivedere */
    assert.match(h, /<details class="ci-riquadro__grezzo">(?![^>]*open)/);
    assert.ok(h.includes('&quot;identita&quot;'));
    assert.ok(!h.includes('"identita"'));
    assert.match(IC.htmlRiquadroPiede({ fase: 'fallita', foto: true }), /data-ci="conferma"[^>]*disabled/);
});

test('giro 7 · la card, il verde e la riga: una lettura fallita vale come una foto da leggere', () => {
    const fonti = [{ id: 'f1', type: 'doc', file: { name: 'La_Guerre.jpg' }, _scheda: schedaRotta() }];
    /* senza l'elenco delle fallite (interruttore spento): come prima */
    const prima = IC.composizione(fonti);
    assert.equal(prima.attiva, true); assert.equal(prima.pronta, true);
    const c = IC.composizione(fonti, { riquadro: true, fallite: ['f1'] });
    assert.equal(c.attiva, false);
    assert.equal(c.pronta, false);
    assert.equal(c.daLeggere.length, 1);
    assert.equal(c.daLeggere[0].fallita, true);
    assert.match(c.mancano, /non è riuscita/);
    assert.equal(c.fonte.id, 'f1');
    const r = IC.rigaFonte('lettura_fallita', 'La_Guerre.jpg');
    assert.equal(r.tono, 'avviso');
    assert.match(r.testo, /^La_Guerre\.jpg — .*leggila di nuovo/);
});

/* ── giro 8: il nome della cartella del dossier (guasto al gate 3, 03/10) ─────
   Il titolo dell'AI «LA GUERRE est l'Industrie Nationale de la PRUSSE» risultava
   libero contro «La Guerre est l'industrie Nationale de la Prusse» (01/10): il
   confronto teneva conto delle maiuscole, il disco del Mac no. La scrittura
   cadeva nella cartella vecchia. La funzione è quella VERA della pipeline,
   caricata in una `vm` come fa tests/prove-aperte-flashcard.test.js. */
const fs = require('node:fs');
const vm = require('node:vm');
const FILES = require(JS('mappai-files-core.js'));
function pipelineVera() {
    const win = { t: (k, f) => f, showToast() {}, showLoadingOverlay() {} };
    const sandbox = {
        window: win,
        appState: { rootNodeLabel: '', db: { nodes: [], links: [], studySets: [] }, sources: [] },
        document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
        console: { log() {}, info() {}, warn() {}, error() {} },
        setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
    };
    vm.runInNewContext(fs.readFileSync(JS('mappai-material-pipeline.js'), 'utf8'), sandbox);
    return win.MappAIPipeline;
}

test('giro 8 · il nome della cartella: maiuscole e forme Unicode non lo rendono «libero»', () => {
    const libero = pipelineVera()._nomeCartellaLibero;
    assert.equal(typeof libero, 'function');
    const seq = FILES.sessionSeq;
    const titolo = 'LA GUERRE est l\'Industrie Nationale de la PRUSSE';
    /* il caso di Giacomo: la cartella vecchia e tre seguiti, con un'altra grafia */
    const fratelli = ['La Guerre est l\'industrie Nationale de la Prusse', 'La Guerre est l\'industrie Nationale de la Prusse · 02',
        'La Guerre est l\'industrie Nationale de la Prusse · 03', 'La Guerre est l\'industrie Nationale de la Prusse · 04', 'Altra mappa'];
    assert.equal(libero(titolo, fratelli, seq), titolo + ' · 05');
    /* maiuscole diverse, nessun seguito → · 02, con la grafia del titolo */
    assert.equal(libero('Elettricità', ['ELETTRICITÀ'], seq), 'Elettricità · 02');
    /* NFC contro NFD: «è» composto e «e» + accento */
    const nfc = 'Perchè il cielo', nfd = 'Perchè il cielo';
    assert.notEqual(nfc, nfd);
    assert.equal(libero(nfc, [nfd], seq), nfc + ' · 02');
    assert.equal(libero(nfd, [nfc.toUpperCase()], seq), nfd + ' · 02');
    /* un nome davvero libero resta com'è */
    assert.equal(libero(titolo, ['Altra mappa', 'Altra mappa · 02'], seq), titolo);
    assert.equal(libero(titolo, [], seq), titolo);
    assert.equal(libero(titolo, undefined, seq), titolo);
    /* stessa grafia, come prima del giro: · 02, poi dopo il massimo */
    assert.equal(libero('Mappa', ['Mappa'], seq), 'Mappa · 02');
    assert.equal(libero('Mappa', ['Mappa', 'Mappa · 02', 'mappa · 07'], seq), 'Mappa · 08');
});

/* ── giro 9: in G2 le prove sulla scheda dicono la PARTE, non «Prova n» ─────── */
test('giro 9 · le prove sulla scheda si chiamano come la parte citata; due nella stessa parte: «(2)»', () => {
    const pag = RF.indicePagine(DF.fontiDaScheda(scheda()));
    assert.deepEqual(DF.etichetteProve([pag[0], pag[1], pag[1], pag[3]]),
        ['Carta d\'identità', 'Che cosa si vede', 'Che cosa si vede (2)', 'Che cosa prova questa fonte']);
    assert.deepEqual(DF.etichetteProve([pag[2], pag[2], pag[2]]),
        ['Che cosa vuole ottenere', 'Che cosa vuole ottenere (2)', 'Che cosa vuole ottenere (3)']);
    /* anche una pagina di una scheda nata prima del giro 2 si riconosce dall'id */
    assert.deepEqual(DF.etichetteProve([{ docId: 'scheda-2-osservazione-0a1b', title: 'X' }]), ['Che cosa si vede']);
    /* un PDF, o una lista mista: niente nomi, resta «Prova n» */
    const pdf = RF.indicePagine([{ id: 'lez', title: 'Lezione.pdf', pages: [{ n: 1, text: 'a' }, { n: 2, text: 'b' }] }]);
    assert.equal(DF.etichetteProve(pdf), null);
    assert.equal(DF.etichetteProve([pag[0], pdf[0]]), null);
    assert.deepEqual(DF.etichetteProve([]), []);
    assert.equal(DF.etichetteProve(undefined), null);
});

/* ── giro 10: nella sintesi il NOME del blocco al posto del numero; lo split senza
   tendina, con «×» per la scheda intera ───────────────────────────────────── */
const ETICHETTE_SCHEDA = { sourceLabel: 'Scheda', unknownLabel: 'Scheda da verificare' };
test('giro 10 · i rimandi sulla scheda dicono il blocco: «[Che cosa si vede]», e tornano agli id intatti', () => {
    const sch = scheda(), r = conferma(sch), db = VC.nodiDaScheda(sch);
    const reg = G.buildInput(db, db.nodes, r.sources, r, { includeOriginalPages: true }).sourcesArr;
    const testo = 'Chi l\'ha fatto [[' + reg[0].id + ']], che cosa mostra [[' + reg[1].id + ']] e ancora [[' + reg[0].id + ']], poi [[src-ignoto]].';
    const vista = G.referenceView(testo, G.citationRegistry(testo, reg), ETICHETTE_SCHEDA);
    assert.match(vista.text, /\[Scheda 1\]/);
    const nomi = DF.rimandiConNome(vista);
    assert.equal(nomi.text, 'Chi l\'ha fatto [Carta d\'identità], che cosa mostra [Che cosa si vede] e ancora [Carta d\'identità], poi [Scheda da verificare 3].');
    /* l'editor rimette gli id veri dove c'erano: il nome è solo la resa */
    assert.equal(G.restoreReferenceIds(nomi.text, nomi.mapping), testo);
    assert.notEqual(nomi, vista, 'una copia: la vista del grounding non si tocca');
    assert.match(vista.text, /\[Scheda 1\]/);
    /* giro 10b: due id DIVERSI dello stesso blocco (due righe-campo, due unità) hanno
       nomi distinti, come i bottoni del giro 9 — e ognuno torna al SUO id */
    const docId = DF.fontiDaScheda(sch)[1].id;
    const testoDue = 'a [[src-a]] b [[src-b]] c [[src-a]]';
    const due = G.referenceView(testoDue, [
        { id: 'src-a', idx: 1, docId, title: 'Che cosa si vede', page: 0, text: 'Descrizione: Un uomo anziano' },
        { id: 'src-b', idx: 2, docId, title: 'Che cosa si vede', page: 0, text: 'Tipografia: Bastoni maiuscoli' }], ETICHETTE_SCHEDA);
    const nomiDue = DF.rimandiConNome(due);
    assert.equal(nomiDue.text, 'a [Che cosa si vede] b [Che cosa si vede (2)] c [Che cosa si vede]');
    assert.equal(G.restoreReferenceIds(nomiDue.text, nomiDue.mapping), testoDue);
    /* il docente modifica il testo: ogni rimando torna al suo id, non al primo */
    const modificato = nomiDue.text.replace('b [Che cosa si vede (2)]', 'nuova frase [Che cosa si vede (2)]').replace(' c [Che cosa si vede]', '');
    assert.equal(G.restoreReferenceIds(modificato, nomiDue.mapping), 'a [[src-a]] nuova frase [[src-b]]');
});

test('giro 10 · PDF e dossier di prima: i rimandi restano come oggi, byte per byte', () => {
    const pdf = [{ id: 'lez', title: 'Lezione.pdf', pdfHash: 'h', pages: [{ n: 1, text: 'La corrente scorre nel circuito.' }] }];
    const reg = G.buildInput({ nodes: [] }, [], pdf, { sources: pdf }, { includeOriginalPages: true }).sourcesArr;
    const testo = 'Vedi [[' + reg[0].id + ']] e [[src-ignoto]].';
    const vista = G.referenceView(testo, G.citationRegistry(testo, reg), { sourceLabel: 'Fonte', unknownLabel: 'Fonte da verificare' });
    assert.deepEqual(DF.rimandiConNome(vista), vista);
    /* un dossier di prima: nessun rimando risolvibile */
    const vecchio = G.referenceView('x [[src-a]] y', [], ETICHETTE_SCHEDA);
    assert.deepEqual(DF.rimandiConNome(vecchio), vecchio);
    assert.deepEqual(DF.rimandiConNome(null), null);
});

test('giro 10 · lo split con la foto: niente tendina, «×» per la scheda intera; il PDF tiene la tendina', () => {
    assert.deepEqual(RF.barraFonte({ immagine: true, prove: 3 }), { tendina: false, chiudi: true });
    assert.deepEqual(RF.barraFonte({ immagine: true, prove: 1 }), { tendina: false, chiudi: true });
    assert.deepEqual(RF.barraFonte({ immagine: true, prove: 0 }), { tendina: false, chiudi: false });
    assert.deepEqual(RF.barraFonte({ immagine: false, prove: 3 }), { tendina: true, chiudi: false });
    assert.deepEqual(RF.barraFonte({}), { tendina: true, chiudi: false });
    /* la vista «nessuna selezione»: tutte e quattro le parti, coi loro titoli */
    const indice = RF.indicePagine(DF.fontiDaScheda(scheda()));
    const tutto = RF.testoIntero(indice);
    VC.BLOCCHI.forEach(bl => assert.ok(tutto.includes(bl.titolo + '\n' + VC.testoBlocco(scheda(), bl.id)), bl.id));
    assert.equal(tutto.split('\n\n').length, 4);
    assert.equal(RF.testoIntero([]), '');
});

/* ── giro 11: ELABORA — i link interni dell'anteprima e la home di un dossier ── */
test('giro 11 · la home di un dossier da foto: in «Fonte» la scheda e l’immagine, «Analisi della fonte» esce da «Altri»', () => {
    const materiali = [
        { id: 'src:text', titolo: 'Testo', tipo: 'Fonte' },
        { id: 'an:doc1', titolo: 'Analisi della fonte', tipo: 'Analisi della fonte' },
        { id: 'set:q1', titolo: 'Quiz', tipo: 'Quiz' },
        { id: 'syn:s1', titolo: 'Sintesi', tipo: 'Sintesi' }];
    const d = DF.fonteDellaHome({ acceso: true, dossier: true, materiali, foto: 'Allegati/La Guerre.jpg' });
    assert.deepEqual(d.fonte.map(m => m.id), ['an:doc1', 'disk:Allegati/La Guerre.jpg']);
    assert.equal(d.fonte[1].titolo, 'La Guerre.jpg');
    assert.equal(d.fonte[1].tipo, 'Fonte');
    assert.deepEqual(d.resto.map(m => m.id), ['set:q1', 'syn:s1'], 'niente doppioni, niente «Testo» vuoto');
    /* un dossier senza la foto in Allegati/ (i vecchi del 01/10): solo la scheda, nessuna riga vuota */
    const senza = DF.fonteDellaHome({ acceso: true, dossier: true, materiali, foto: '' });
    assert.deepEqual(senza.fonte.map(m => m.id), ['an:doc1']);
    assert.ok(senza.fonte.every(m => m.titolo));
    /* un progetto da PDF, o l'interruttore spento: il gruppo di sempre */
    const pdf = [{ id: 'src:text', titolo: 'Testo', tipo: 'Fonte' }, { id: 'src:pdf:0', titolo: 'Lezione.pdf', tipo: 'Fonte' }, materiali[2]];
    assert.deepEqual(DF.fonteDellaHome({ acceso: true, dossier: false, materiali: pdf, foto: 'Allegati/x.jpg' }),
        { fonte: pdf.slice(0, 2), resto: [materiali[2]] });
    assert.deepEqual(DF.fonteDellaHome({ acceso: false, dossier: true, materiali, foto: 'Allegati/x.jpg' }),
        { fonte: [materiali[0]], resto: materiali.slice(1) });
    assert.deepEqual(DF.fonteDellaHome({}), { fonte: [], resto: [] });
});

/* ── giro 12: l'immagine dell'anteprima di ELABORA — un <img> con blob, non un
   iframe `data:` (l'originale è 8,6 MB: l'indirizzo `data:` supera il limite di
   Chromium e l'iframe resta bianco) ───────────────────────────────────────── */
test('giro 12 · come si mostra un file: immagine → <img> (blob); HTML, PDF, audio e il resto come prima', () => {
    assert.deepEqual(DF.anteprimaFile('Allegati/LA GUERRE.jpg'), { modo: 'img', mime: 'image/jpeg' });
    assert.deepEqual(DF.anteprimaFile('Allegati/foto.JPEG'), { modo: 'img', mime: 'image/jpeg' });
    assert.deepEqual(DF.anteprimaFile('Allegati/foto.png'), { modo: 'img', mime: 'image/png' });
    assert.deepEqual(DF.anteprimaFile('x.webp'), { modo: 'img', mime: 'image/webp' });
    assert.deepEqual(DF.anteprimaFile('x.gif'), { modo: 'img', mime: 'image/gif' });
    /* il resto: gli stessi tipi dell'espressione di `_montaFile` prima del giro */
    assert.deepEqual(DF.anteprimaFile('Materiale Studio/Sintesi-x.html'), { modo: 'srcdoc', mime: 'text/html' });
    assert.deepEqual(DF.anteprimaFile('a.htm'), { modo: 'srcdoc', mime: 'text/html' });
    assert.deepEqual(DF.anteprimaFile('Materiale Studio/Quiz.pdf'), { modo: 'data', mime: 'application/pdf' });
    assert.deepEqual(DF.anteprimaFile('voce.mp3'), { modo: 'data', mime: 'audio/mpeg' });
    assert.deepEqual(DF.anteprimaFile('voce.wav'), { modo: 'data', mime: 'audio/mpeg' });
    assert.deepEqual(DF.anteprimaFile('note.txt'), { modo: 'data', mime: 'application/octet-stream' });
    assert.deepEqual(DF.anteprimaFile(''), { modo: 'data', mime: 'application/octet-stream' });
});

/* ── giro 13: il verde è bloccato finché la scheda non è confermata ─────────── */
test('giro 13 · bloccoDelVerde: libero solo con la scheda confermata, e l’avviso dice che cosa fare', () => {
    assert.deepEqual(IC.bloccoDelVerde({ riquadro: true, stato: 'confermata' }), { bloccato: false, avviso: '' });
    const cambiata = IC.bloccoDelVerde({ riquadro: true, stato: 'stale_revision' });
    assert.equal(cambiata.bloccato, true);
    assert.equal(cambiata.avviso, 'La scheda è cambiata dopo la conferma: confermala di nuovo nel riquadro prima di generare.');
    const mai = IC.bloccoDelVerde({ riquadro: true, stato: 'da_confermare' });
    assert.equal(mai.bloccato, true);
    assert.equal(mai.avviso, 'Conferma la scheda della fonte nel riquadro prima di generare.');
    assert.equal(IC.bloccoDelVerde({ riquadro: true }).bloccato, true, 'uno stato che non si sa è «da confermare»');
    /* interruttore spento (nessun riquadro): il verde dello 0067, libero */
    assert.deepEqual(IC.bloccoDelVerde({ stato: 'da_confermare' }), { bloccato: false, avviso: '' });
    assert.deepEqual(IC.bloccoDelVerde(), { bloccato: false, avviso: '' });
});

test('giro 13 · composizione: col riquadro una scheda non confermata non è pronta; spento, come prima', () => {
    const fonti = [{ id: 'f1', type: 'doc', file: { name: 'm.jpg' }, _scheda: scheda() }];
    const c = IC.composizione(fonti, { riquadro: true, statoConferma: 'stale_revision' });
    assert.equal(c.attiva, true);
    assert.equal(c.pronta, false);
    assert.equal(c.bloccoConferma, true);
    assert.match(c.mancano, /^La scheda è cambiata dopo la conferma/);
    const d = IC.composizione(fonti, { riquadro: true, statoConferma: 'da_confermare' });
    assert.equal(d.pronta, false);
    assert.match(d.mancano, /^Conferma la scheda della fonte/);
    const ok = IC.composizione(fonti, { riquadro: true, statoConferma: 'confermata' });
    assert.equal(ok.pronta, true);
    assert.equal(ok.mancano, '');
    assert.ok(!ok.bloccoConferma);
    /* interruttore spento: lo 0067, pronta e senza blocco */
    const spento = IC.composizione(fonti);
    assert.equal(spento.pronta, true);
    assert.equal(spento.bloccoConferma, undefined);
    /* una foto ancora da leggere ha la precedenza: si legge prima, poi si conferma */
    const conFoto = fonti.concat([{ id: 'f2', type: 'doc', file: { name: 'b.jpg' } }]);
    assert.match(IC.composizione(conFoto, { riquadro: true, statoConferma: 'da_confermare' }).mancano, /^Leggi prima la foto/);
});

test('giro 13 · la frase di stato: sempre DUE righe — lo stato, poi che cosa succede — e «(n parti su 4)» in coda alla seconda', () => {
    const r = (stato) => IC.righeFrase({ fase: 'letta', stato, parti: 4, totali: 4 });
    assert.deepEqual(r('stale_revision'), ['La scheda è cambiata dopo la conferma: il cancello si è richiuso.',
        'Rileggila con la foto davanti e confermala di nuovo. (4 parti su 4)']);
    /* la seconda riga di «confermata» dice il VERO: G2 si apre solo se il controllo trova qualcosa */
    assert.deepEqual(r('confermata'), ['Scheda confermata con la foto davanti: è la fonte del dossier.',
        'Dopo la generazione non c\'è la revisione dei contenuti: si passa ai materiali. (4 parti su 4)']);
    assert.ok(!r('confermata').join(' ').includes('diretti alla revisione dei materiali'));
    const dc = r('da_confermare');
    assert.equal(dc.length, 2);
    assert.match(dc[0], /^Scheda da confermare/);
    assert.match(dc[1], /\(4 parti su 4\)$/);
    /* anche la lettura in corso e la lettura fallita: due righe */
    assert.equal(IC.righeFrase({ fase: 'in_lettura', nome: 'b.jpg' }).length, 2);
    assert.equal(IC.righeFrase({ fase: 'fallita' }).length, 2);
    /* il markup: due righe a blocco, e nessuna classe che cambi corpo o peso per stato */
    const piede = IC.htmlRiquadroPiede({ fase: 'letta', stato: 'stale_revision', parti: 4, totali: 4, foto: true });
    assert.equal((piede.match(/class="ci-riquadro__riga"/g) || []).length, 2);
    ['confermata', 'da_confermare'].forEach(s => {
        const h = IC.htmlRiquadroPiede({ fase: 'letta', stato: s, parti: 4, totali: 4, foto: true });
        assert.equal(h.replace(/data-ci-stato="[^"]*"/, '').replace(/<span class="ci-riquadro__riga">[^<]*<\/span>/g, '').replace(/>[^<]*</g, '><'),
            piede.replace(/data-ci-stato="[^"]*"/, '').replace(/<span class="ci-riquadro__riga">[^<]*<\/span>/g, '').replace(/>[^<]*</g, '><'), s);
    });
    const lett = IC.htmlRiquadroLettura({ fase: 'in_lettura', nome: 'b.jpg' });
    assert.equal((lett.match(/class="ci-riquadro__riga"/g) || []).length, 2);
    const fall = IC.htmlRiquadroLettura({ fase: 'fallita', grezzo: '{x' });
    assert.equal((fall.match(/class="ci-riquadro__riga"/g) || []).length, 2);
    /* e nessuna regola del foglio sceglie un corpo o un peso per STATO (al giro 4
       «cambiata» era `[data-ci-stato="stale_revision"]` grassetta e più grande) */
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'mappai-crea-iconografica.css'), 'utf8');
    assert.ok(!/\[data-ci-stato/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'una regola per stato nel foglio');
});

/* ── giro 15: in G2 le note numeriche della sintesi dicono il blocco ─────────── */
/* la forma vera di `item.citations` (pipeline.json del dossier · 08): un idx per
   pagina-scheda, nell'ordine dei blocchi; il `[n]` del testo è l'idx DELL'ITEM */
const citazioniDi = sch => DF.fontiDaScheda(sch).map((p, i) => ({ id: 'src-n' + i, idx: i + 1, docId: p.id, title: p.title, page: 0, source: 'fonte', text: p.text }));

test('giro 15 · ogni nota [n] di una pagina-scheda diventa il nome del blocco; quelle senza pagina restano', () => {
    const cit = citazioniDi(scheda());
    const testo = 'Creò un manifesto [1]. La frase significa [2]. Lo scopo [3]. Fu espansionista [4].\n\nAncora [4][4] e [4]. Fine [9].';
    const n = DF.noteConNome(testo, cit);
    assert.equal(n.text, 'Creò un manifesto [Carta d\'identità]. La frase significa [Che cosa si vede]. Lo scopo [Che cosa vuole ottenere]. ' +
        'Fu espansionista [Che cosa prova questa fonte].\n\nAncora [Che cosa prova questa fonte][Che cosa prova questa fonte] e [Che cosa prova questa fonte]. Fine [9].');
    assert.ok(!/\[[1-4]\]/.test(n.text), 'un numero rimasto sulla scheda');
    /* note uguali, anche attaccate: ognuna il suo nome, nessuna sparisce */
    assert.equal((n.text.match(/\[Che cosa prova questa fonte\]/g) || []).length, 4);
    assert.deepEqual(n.note.map(x => x.n), [1, 2, 3, 4], 'una voce per numero');
    /* è solo resa: il ritorno ridà il testo salvato, byte per byte */
    assert.equal(DF.ripristinaNote(n.text, n.note), testo);
    /* il docente modifica: ogni nome torna al SUO numero */
    const mod = n.text.replace('Lo scopo [Che cosa vuole ottenere]. ', '').replace('Fine [9].', 'Nuova frase [Che cosa si vede].');
    assert.equal(DF.ripristinaNote(mod, n.note), 'Creò un manifesto [1]. La frase significa [2]. Fu espansionista [4].\n\nAncora [4][4] e [4]. Nuova frase [2].');
    /* la sintesi intera del dossier di Giacomo: 23 note, 23 nomi, ritorno esatto */
    const vera = 'Neumont creò un manifesto [1]. Litografia [1]. Titolo [1]. Significa [2].\n\nPropaganda [3]. Governo [3]. Scopo [3]. Nemico [3]. ' +
        'Mappa [2]. Mostro [2]. Colori [2]. Scritte [2]. Corona [2]. Elmo [2]. Ombra [2]. Paura [3]. Città [2]. Fumo [2]. Fiamme [2]. ' +
        'Espansionista [4]. Prova [4]. Tace [4]. Insomma [4].';
    const nv = DF.noteConNome(vera, cit);
    assert.equal((nv.text.match(/\[\d+\]/g) || []).length, 0);
    assert.equal((nv.text.match(/\[(Carta d'identità|Che cosa si vede|Che cosa vuole ottenere|Che cosa prova questa fonte)\]/g) || []).length, 23);
    assert.equal(DF.ripristinaNote(nv.text, nv.note), vera);
});

test('giro 15 · il ritorno è biunivoco: due numeri dello stesso blocco hanno nomi distinti, e nessun nome si confonde', () => {
    const docId = DF.fontiDaScheda(scheda())[1].id;
    const cit = [{ id: 'src-a', idx: 1, docId, title: 'Che cosa si vede' }, { id: 'src-b', idx: 2, docId, title: 'Che cosa si vede' }];
    const testo = 'a [1] b [2] c [1] d [2][2]';
    const n = DF.noteConNome(testo, cit);
    assert.equal(n.text, 'a [Che cosa si vede] b [Che cosa si vede (2)] c [Che cosa si vede] d [Che cosa si vede (2)][Che cosa si vede (2)]');
    assert.equal(DF.ripristinaNote(n.text, n.note), testo);
    const scambio = 'x [Che cosa si vede (2)] y [Che cosa si vede]';
    assert.equal(DF.ripristinaNote(scambio, n.note), 'x [2] y [1]');
    /* un nome già preso da un rimando ([[src-…]] → nome del giro 10) o già scritto
       nel testo non si riusa: altrimenti al ritorno diventerebbe un numero */
    const cit1 = citazioniDi(scheda());
    const occ = DF.noteConNome('vedi [Carta d\'identità] e [1]', cit1, ['[Carta d\'identità]']);
    assert.notEqual(occ.note[0].label, '[Carta d\'identità]');
    assert.equal(occ.text, 'vedi [Carta d\'identità] e ' + occ.note[0].label);
    assert.equal(DF.ripristinaNote(occ.text, occ.note), 'vedi [Carta d\'identità] e [1]');
    const scritto = DF.noteConNome('il blocco [Che cosa si vede] e la nota [2]', cit1);
    assert.equal(DF.ripristinaNote(scritto.text, scritto.note), 'il blocco [Che cosa si vede] e la nota [2]');
    /* nomi tutti diversi fra loro */
    const lab = n.note.map(x => x.label);
    assert.equal(new Set(lab).size, lab.length);
});

test('giro 15 · PDF, dossier di prima e item senza citazioni: il testo resta com’è, byte per byte', () => {
    const testo = 'La corrente scorre [1]. Vedi [2] e [1].';
    const pdf = [{ id: 'src-p1', idx: 1, docId: 'lez', title: 'Lezione.pdf', page: 1, text: 'La corrente' },
        { id: 'src-p2', idx: 2, docId: 'lez', title: 'Lezione.pdf', page: 2, text: 'Il circuito' }];
    assert.deepEqual(DF.noteConNome(testo, pdf), { text: testo, note: [] });
    assert.deepEqual(DF.noteConNome(testo, []), { text: testo, note: [] });
    assert.deepEqual(DF.noteConNome(testo, undefined), { text: testo, note: [] });
    assert.deepEqual(DF.noteConNome(testo, null), { text: testo, note: [] });
    assert.equal(DF.ripristinaNote(testo, []), testo);
    assert.equal(DF.ripristinaNote(testo, undefined), testo);
    /* la revisione chiama i nomi delle note SOLO sulla scheda come fonte: per un PDF la vista è quella di prima */
    const src = fs.readFileSync(JS('mappai-review.js'), 'utf8');
    const righe = src.split('\n').filter(r => r.includes('noteConNome('));
    assert.ok(righe.length >= 1, 'la revisione non chiama noteConNome');
    righe.forEach(r => assert.match(r, /fonteScheda/, 'noteConNome fuori dalla guardia fonteScheda: ' + r.trim()));
    assert.ok(src.split('\n').some(r => r.includes('ripristinaNote(')), 'l’editor non rimette i numeri');
});

/* ── giro 16: la verifica avversaria del giro 15 ──────────────────────────────── */
/* le righe VERE della revisione (da `const DFc` a `displayValue`), coi core veri:
   la stessa strada del controllore, senza copiarne il testo */
function revisioneVera(sources, items) {
    const src = fs.readFileSync(JS('mappai-review.js'), 'utf8');
    const a = src.indexOf('    const DFc = window.MappAIDossierFonteCore;');
    const b = src.indexOf('\n', src.indexOf('    const displayValue = '));
    assert.ok(a > 0 && b > a, 'le righe della revisione non si trovano');
    const review = { sources, baseSnapshot: { items: items || [] }, initial: { issues: [] } };
    return new Function('window', 'manifest', 't', 'getReview', 'readable', src.slice(a, b) +
        '\nreturn { referenceView, restoreReferences, displayValue, fonteScheda };')(
        { MappAIGroundingCore: G, MappAIDossierFonteCore: DF }, { review }, (k, f) => f, () => review, v => typeof v === 'string' ? v : JSON.stringify(v));
}
const sintesiDi = sch => ({ id: 'synthesis-whole', kind: 'synthesis', text: '', citations: citazioniDi(sch) });

test('giro 16 · 1 · un rimando non prende un nome già scritto nel testo: il testo letterale torna intatto', () => {
    const sch = scheda(), cit = citazioniDi(sch);
    /* nel core: il rimando dello stesso blocco di un «[Che cosa vuole ottenere]» scritto a mano */
    const testo = 'parola: nel riquadro [Che cosa vuole ottenere] si legge X [[' + cit[2].id + ']].';
    const vista = DF.rimandiConNome(G.referenceView(testo, cit, ETICHETTE_SCHEDA));
    assert.notEqual(vista.mapping[0].label, '[Che cosa vuole ottenere]');
    assert.equal(vista.text, 'parola: nel riquadro [Che cosa vuole ottenere] si legge X ' + vista.mapping[0].label + '.');
    const mod = vista.text.replace(/^parola/, 'PAROLA');
    assert.equal(G.restoreReferenceIds(mod, vista.mapping), testo.replace(/^parola/, 'PAROLA'));
    /* nella revisione vera: con e senza item, al primo tasto il dato cambia SOLO dove si è scritto */
    const R = revisioneVera(RC.sourceSnapshot(DF.fontiDaScheda(sch)), [sintesiDi(sch)]);
    assert.equal(R.fonteScheda, true);
    [sintesiDi(sch), null].forEach(item => {
        const v = R.referenceView(testo, item);
        assert.equal(R.restoreReferences(v.text.replace(/^parola/, 'PAROLA'), v), testo.replace(/^parola/, 'PAROLA'), item ? 'con item' : 'senza item');
    });
});

test('giro 16 · 2 · le note prendono il nome PRIMA dei rimandi: un rimando aggiunto non rinomina le note che c’erano', () => {
    const sch = scheda(), item = sintesiDi(sch), cit = item.citations;
    const R = revisioneVera(RC.sourceSnapshot(DF.fontiDaScheda(sch)), [item]);
    const prima = 'La piovra [2]. Domina gli stati [2]. Fine [4].';
    const dopo = prima.replace('Domina gli stati [2].', 'Domina gli stati [2] [[' + cit[1].id + ']].');
    const vb = R.referenceView(prima, item), va = R.referenceView(dopo, item);
    assert.equal(vb.note.find(n => n.n === 2).label, va.note.find(n => n.n === 2).label, 'la nota [2] ha cambiato nome');
    assert.notEqual(va.mapping[0].label, va.note.find(n => n.n === 2).label);
    /* la vista «dopo» è quella di «prima» col solo rimando in più */
    assert.equal(va.text, vb.text.replace('Domina gli stati [Che cosa si vede].', 'Domina gli stati [Che cosa si vede] ' + va.mapping[0].label + '.'));
    assert.equal(R.restoreReferences(va.text, va), dopo);
    assert.equal(R.restoreReferences(vb.text, vb), prima);
});

test('giro 16 · 3 · le prove della segnalazione ricevono l’item: «Passaggio da confrontare» e «Fonte e motivo» coi nomi', () => {
    const src = fs.readFileSync(JS('mappai-review.js'), 'utf8');
    const chiamate = src.match(/evidence(Preview|Html)\(issue, r, [^)]*\)[^)]*\)/g) || [];
    assert.equal(chiamate.length, 2, chiamate.join(' | '));
    chiamate.forEach(c => assert.match(c, /referenceView\(value, item\)\.text/, c));
});

test('giro 16 · 4 · il nome di una nota non dipende dal pezzo di testo: il suffisso segue l’ordine degli idx dell’item', () => {
    const docId = DF.fontiDaScheda(scheda())[1].id;
    const cit = [{ id: 'src-aaa', idx: 2, docId }, { id: 'src-bbb', idx: 5, docId }];
    const intero = DF.noteConNome('La mappa [5] e la piovra [2] fine.', cit);
    assert.equal(intero.text, 'La mappa [Che cosa si vede (2)] e la piovra [Che cosa si vede] fine.');
    /* pezzo per pezzo (Occorrenze, fetta compatta, bozza/anteprima): stessi nomi */
    assert.equal(DF.noteConNome('La mappa [5] e', cit).text, 'La mappa [Che cosa si vede (2)] e');
    assert.equal(DF.noteConNome(' la piovra [2] fine.', cit).text, ' la piovra [Che cosa si vede] fine.');
    assert.equal(DF.noteConNome('La piovra stilizzata [2].', cit).text, 'La piovra stilizzata [Che cosa si vede].');
    assert.equal(DF.ripristinaNote(intero.text, intero.note), 'La mappa [5] e la piovra [2] fine.');
    /* la guardia resta: un nome già scritto si salta anche col rango */
    const g = DF.noteConNome('[Che cosa si vede] e [2]', cit);
    assert.notEqual(g.note[0].label, '[Che cosa si vede]');
    assert.equal(DF.ripristinaNote(g.text, g.note), '[Che cosa si vede] e [2]');
});

test('giro 16 · 5 · un nome corretto a mano si segnala (avviso, non blocco); il testo che c’era già no', () => {
    const prima = 'Manifesto [1]. Frase [2]. Fine [4].';
    assert.deepEqual(DF.richiamiRotti('Manifesto [1]. Frase [Che cosa si vedi]. Fine [4].', { prima }), ['[Che cosa si vedi]']);
    assert.deepEqual(DF.richiamiRotti('Manifesto [1]. Frase [2]. Fine [Che cosa prova fonte].', { prima }), ['[Che cosa prova fonte]']);
    assert.deepEqual(DF.richiamiRotti('Frase [Che cosa si vede (3)].', { prima }), ['[Che cosa si vede (3)]']);
    assert.deepEqual(DF.richiamiRotti('Vedi il riquadro [Che cosa vuole ottenere].', { prima }), ['[Che cosa vuole ottenere]']);
    assert.deepEqual(DF.richiamiRotti('Carta [carta d\'identita] qui.', { prima }), ['[carta d\'identita]']);
    /* niente avviso: numeri, rimandi, parentesi qualunque, testo già salvato, etichette della vista */
    assert.deepEqual(DF.richiamiRotti(prima + ' [[src-a]] [sic] [9]', { prima }), []);
    assert.deepEqual(DF.richiamiRotti('X [Che cosa vuole ottenere] Y [3]!', { prima: 'x [Che cosa vuole ottenere] y [3]' }), []);
    assert.deepEqual(DF.richiamiRotti('X [Che cosa si vede]', { prima: '', etichette: ['[Che cosa si vede]'] }), []);
    assert.deepEqual(DF.richiamiRotti('', {}), []);
    assert.deepEqual(DF.richiamiRotti(undefined), []);
    /* la revisione: sulla scheda la frase d'aiuto dice di non toccare i nomi, e l'avviso passa da richiamiRotti; per un PDF la frase di prima */
    const src = fs.readFileSync(JS('mappai-review.js'), 'utf8');
    assert.match(src, /fonteScheda \? t\('rv_scheda_edit_help', 'Non modificare i nomi fra parentesi quadre: sono i richiami alla scheda\.'\) : t\('rv_reference_edit_help', 'I richiami alle fonti restano collegati quando modifichi il testo\.'\)/);
    src.split('\n').filter(r => r.includes('richiamiRotti(')).forEach(r => assert.match(r, /fonteScheda/, r.trim()));
    assert.ok(src.includes('richiamiRotti('), 'la revisione non avvisa');
    const en = fs.readFileSync(path.join(__dirname, '..', 'public', 'traduzioni', 'en_translations.js'), 'utf8');
    ['rv_scheda_edit_help', 'rv_scheda_richiamo_rotto'].forEach(k => assert.match(en, new RegExp('[\'"]?' + k + '[\'"]?\\s*:'), k));
});

/* ── giro 17: la frase d'aiuto della scheda in arancione, quella del PDF no ──── */
test('giro 17 · «Non modificare i nomi…» è arancione (amber-700, ≥ 4,5:1 sul bianco della card); la frase del PDF resta com’era', () => {
    const src = fs.readFileSync(JS('mappai-review.js'), 'utf8');
    const riga = src.split('\n').filter(r => r.includes('rv_scheda_edit_help'));
    assert.equal(riga.length, 1, 'la riga della frase d’aiuto');
    /* la riga VERA, fatta girare con un DOM finto */
    const corre = new Function('refs', 'fonteScheda', 't', 'document', 'label', riga[0].trim());
    const prova = (fonteScheda, refs) => {
        const figli = [];
        corre(refs, fonteScheda, (k, f) => f, { createElement: tag => ({ tag, style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }) }, { appendChild: x => figli.push(x) });
        return figli[0];
    };
    const scheda1 = prova(true, { mapping: [], note: [{ label: '[Che cosa si vede]', n: 2 }] });
    assert.equal(scheda1.textContent, 'Non modificare i nomi fra parentesi quadre: sono i richiami alla scheda.');
    assert.equal(scheda1.style.color, '#b45309');
    assert.equal(scheda1.className, 'text-sm');
    const pdf = prova(false, { mapping: [{ label: '[Fonte 1]', id: 'src-a' }] });
    assert.equal(pdf.textContent, 'I richiami alle fonti restano collegati quando modifichi il testo.');
    assert.equal(pdf.className, 'text-sm');
    assert.deepEqual(pdf.style, {}, 'il PDF è diventato arancione');
    assert.deepEqual(pdf.attrs, {});
    assert.equal(prova(true, { mapping: [], note: [] }), undefined, 'niente richiami, niente frase');
    /* il contrasto vero: #b45309 sul fondo della card del Banco (#fff) */
    const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'mappai-review-dashboard.css'), 'utf8');
    const fondo = (css.match(/#mappai-teacher-review \.mrv-card \{[^}]*background: (#[0-9a-f]{3,6})/i) || [])[1];
    assert.equal(fondo, '#fff');
    assert.ok((1.05) / (lum('#b45309') + 0.05) >= 4.5);
});

/* ── giro 18: la verifica finale avversaria ──────────────────────────────────── */
/* 1 · un lotto di più foto: il riquadro mostra la prima scheda NON confermata, il
   verde si libera solo con tutte confermate. Le opzioni le fa il core
   (`opzioniRiquadro`), con le regole del core del dossier: le stesse del guscio. */
const fotoDi = (id, sch, conf) => ({ id, type: 'doc', file: { name: id + '.jpg' }, _scheda: sch, _confermaScheda: conf });
const opzLotto = (fonti, mostrata) => IC.opzioniRiquadro(fonti, { statoConferma: DF.statoConferma, letturaFallita: DF.letturaFallita, inLettura: [], mostrata });
const schedaA = () => scheda({ titolo: 'A', nomeFile: 'a.jpg' }), schedaB = () => scheda({ titolo: 'B', nomeFile: 'b.jpg' });
const piedeDi = (comp, fonti) => {
    const src = fonti.find(x => x.id === comp.fonte.id);
    return IC.htmlPiedeDelLotto(comp, { fase: 'letta', stato: DF.statoConferma(src._scheda, src._confermaScheda), nome: comp.fonte.nome, foto: true });
};

test('giro 18 · 1 · lotto [A, B] da confermare: il riquadro su A, il verde bloccato, la frase dice il lotto', () => {
    const fonti = [fotoDi('a', schedaA()), fotoDi('b', schedaB())];
    const c = IC.composizione(fonti, opzLotto(fonti));
    assert.equal(c.fonte.id, 'a');
    assert.equal(c.pronta, false);
    assert.equal(c.bloccoConferma, true);
    assert.equal(c.confermate, 0);
    assert.equal(c.mancano, 'Conferma tutte le schede nel riquadro prima di generare: 0 di 2 confermate.');
    assert.deepEqual(IC.righeFrase({ fase: 'letta', stato: 'da_confermare', parti: 4, totali: 4, confermate: 0, quante: 2 })[1],
        'Rileggila con la foto davanti, correggi ciò che il modello ha letto male e confermala: diventa la fonte del dossier. (4 parti su 4 · 0 di 2 schede confermate)');
    /* una foto sola: la frase di prima, senza il conto del lotto */
    assert.match(IC.righeFrase({ fase: 'letta', stato: 'da_confermare', parti: 4, totali: 4, confermate: 0, quante: 1 })[1], /\(4 parti su 4\)$/);
});

test('giro 18 · 1 · lotto [A confermata, B da confermare]: il riquadro passa a B, il verde resta bloccato', () => {
    const a = schedaA(), fonti = [fotoDi('a', a, conferma(a)), fotoDi('b', schedaB())];
    const c = IC.composizione(fonti, opzLotto(fonti, 'a'));
    assert.equal(c.fonte.id, 'b', 'il riquadro è fermo su A');
    assert.equal(c.titolo, 'B');
    assert.equal(c.statoConferma, 'da_confermare');
    assert.equal(c.pronta, false, 'il verde è libero con B non confermata');
    assert.equal(c.bloccoConferma, true);
    assert.equal(c.confermate, 1);
    assert.equal(c.mancano, 'Conferma tutte le schede nel riquadro prima di generare: 1 di 2 confermate.');
    const piede = piedeDi(c, fonti);
    assert.match(piede, /\(4 parti su 4 · 1 di 2 schede confermate\)/);
    assert.match(piede, />Confermo la scheda</);
    assert.ok(!piede.includes('data-ci="leggi"'), 'nessuna foto da leggere: niente «Leggi»');
    /* tutte e due confermate: il verde si libera, il riquadro resta dov'era */
    const b = fonti[1]._scheda; fonti[1]._confermaScheda = conferma(b);
    const ok = IC.composizione(fonti, opzLotto(fonti, 'b'));
    assert.equal(ok.pronta, true);
    assert.equal(ok.bloccoConferma, false);
    assert.equal(ok.fonte.id, 'b');
    assert.equal(ok.etichetta, 'Genera i 2 dossier delle fonti');
    assert.match(piedeDi(ok, fonti), /2 di 2 schede confermate/);
    /* B corretta dopo la conferma: torna la prima non confermata, e il verde si richiude */
    b.critica.tace = 'Corretto dal docente';
    const st = IC.composizione(fonti, opzLotto(fonti, 'b'));
    assert.equal(st.fonte.id, 'b');
    assert.equal(st.statoConferma, 'stale_revision');
    assert.equal(st.pronta, false);
    assert.match(st.mancano, /^La scheda è cambiata dopo la conferma/);
    assert.match(st.mancano, /1 di 2 schede confermate/);
});

test('giro 18 · 1 · lotto [A confermata, B annullata] e [A fallita, B letta]: «Leggi» nel piede, per la foto che manca', () => {
    const a = schedaA();
    const f1 = [fotoDi('a', a, conferma(a)), { id: 'b', type: 'doc', file: { name: 'b.jpg' }, _scheda: null }];
    const c1 = IC.composizione(f1, opzLotto(f1, 'a'));
    assert.equal(c1.fonte.id, 'a');
    assert.equal(c1.pronta, false);
    assert.match(c1.mancano, /^Leggi prima la foto «b\.jpg»/);
    const p1 = piedeDi(c1, f1);
    assert.match(p1, /<button type="button" class="mn-btn" data-ci="leggi">Leggi la foto «b\.jpg»<\/button>/);
    assert.ok(p1.includes('<p class="ci-avviso">' + IC.esc(c1.mancano) + '</p>'));
    /* A fallita, B letta: il riquadro su B (le fallite hanno il loro stato), «Leggi» per A */
    const fallita = { titolo: 'A', nomeFile: 'A.jpg', fotoB64: 'AAAA', identita: {}, osservazione: { descrizione: '{"identita": {"genere": "x"' }, interpretazione: {}, critica: {} };
    assert.equal(DF.letturaFallita(fallita), true);
    const f2 = [fotoDi('a', fallita), fotoDi('b', schedaB())];
    const o2 = opzLotto(f2);
    assert.deepEqual(o2.fallite, ['a']);
    const c2 = IC.composizione(f2, o2);
    assert.equal(c2.fonte.id, 'b');
    assert.equal(c2.pronta, false);
    assert.match(c2.mancano, /^La lettura della foto «a\.jpg» non è riuscita/);
    assert.match(piedeDi(c2, f2), /data-ci="leggi">Leggi la foto «a\.jpg»</);
    /* la foto in lettura non ha il bottone: lo si sta già facendo */
    const f3 = [fotoDi('a', a, conferma(a)), { id: 'b', type: 'doc', file: { name: 'b.jpg' }, _scheda: null }];
    const o3 = IC.opzioniRiquadro(f3, { statoConferma: DF.statoConferma, letturaFallita: DF.letturaFallita, inLettura: ['b'] });
    assert.ok(!piedeDi(IC.composizione(f3, o3), f3).includes('data-ci="leggi"'));
    /* il guscio prende le opzioni dal core e passa il piede dal core */
    const guscio = fs.readFileSync(JS('mappai-crea-iconografica.js'), 'utf8');
    assert.match(guscio, /IC\(\)\.opzioniRiquadro\(/);
    assert.match(guscio, /IC\(\)\.htmlPiedeDelLotto\(/);
});

/* 4 · lo scheletro del riquadro viene dal core: una sola fonte dell'ordine */
test('giro 18 · 4 · lo scheletro del riquadro è del core: titolo, foto SOPRA i campi, materiali, fondo', () => {
    const h = IC.scheletroRiquadro('Titolo', 1);
    const pos = s => { const i = h.indexOf(s); assert.ok(i >= 0, s); return i; };
    assert.ok(pos('class="ci-rq-testa"') < pos('class="ci-riquadro__foto"'));
    assert.ok(pos('class="ci-riquadro__foto"') < pos('class="ci-riquadro__campi"'));
    assert.ok(pos('class="ci-riquadro__campi"') < pos('data-ci-materiali'));
    assert.ok(pos('data-ci-materiali') < pos('class="ci-riquadro__fondo"'));
    assert.match(h, /data-ci-campo="titolo"[^>]*value="Titolo"/);
    /* lo stesso ordine nel riquadro pieno */
    const p = IC.htmlRiquadro(scheda(), { foto: 'x.jpg' });
    assert.ok(p.indexOf('ci-riquadro__foto') < p.indexOf('ci-riquadro__campi'));
    /* il guscio non scrive lo scheletro a mano */
    const guscio = fs.readFileSync(JS('mappai-crea-iconografica.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(guscio, /IC\(\)\.scheletroRiquadro\(/);
    assert.ok(!/['"]<div class="ci-riquadro__(foto|campi|fondo)"/.test(guscio), 'lo scheletro è scritto a mano nel guscio');
});

/* 2 · la stima dei materiali: --mm-testo-3 su --man-card fa 4,31:1 */
test('giro 18 · 2 · la stima dei materiali nel riquadro è --mm-testo-2 (6,87:1 su --man-card)', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'mappai-crea-iconografica.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const regola = css.match(/html\.manifesto #mn-bento \.ci-riquadro__materiali \[data-vs-stima\] \{([^}]*)\}/);
    assert.ok(regola, 'la regola della stima');
    assert.match(regola[1], /color:\s*var\(--mm-testo-2\)/);
});

/* 3 · il messaggio del salvataggio: a schermo quello della base, il motivo nel registro */
test('giro 18 · 3 · «Salvataggio vault fallito» come sulla base: il percorso non va a schermo, il motivo va nel registro', async () => {
    const src = fs.readFileSync(JS('mappai-material-pipeline.js'), 'utf8');
    const i = src.indexOf('async function _creaLaCartella');
    let d = 0, j = src.indexOf('{', i), corpo = '';
    for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) { corpo = src.slice(i, k + 1); break; } } }
    assert.ok(corpo, 'la funzione');
    const prova = async (sr, errori) => {
        const visti = [];
        const ctx = vm.createContext({ window: { electronAPI: { saveVault: async () => sr }, buildVaultMapData: () => ({}), MappAIErrori: errori ? { registra: x => visti.push(x) } : undefined },
            _resolveFolderPath: async () => '/x', _state: () => ({}), _adottaLaCartella: async () => {}, _t: (k, f) => f, StorageManager: undefined,
            console: { warn: (...a) => visti.push({ warn: a.join(' ') }), log() {}, info() {}, error() {} } });
        vm.runInContext(corpo + ';this.esito = _creaLaCartella(null, null).then(() => "ok", e => e.message);', ctx);
        return { msg: await ctx.esito, visti };
    };
    const percorso = "EACCES: permission denied, mkdir '/Users/docente/Documents/MappAI - file/Mappe/4R/Storia/X'";
    for (const sr of [{ success: false, error: percorso }, { success: false, error: 'review-conflict: la mappa in memoria è precedente' }, { success: false }, null]) {
        for (const errori of [true, false]) {
            const r = await prova(sr, errori);
            assert.equal(r.msg, 'Salvataggio vault fallito', JSON.stringify(sr));
            if (sr && sr.error) assert.ok(JSON.stringify(r.visti).includes(sr.error.slice(0, 20)), 'il motivo non arriva al registro');
        }
    }
});

/* 5 · la pagina del ramo non taglia un campo lungo */
test('giro 18 · 5 · pagina del ramo: un campo da ~800 caratteri arriva intero', () => {
    const lungo = ('Un uomo anziano guarda verso destra, sullo sfondo le rovine di una città bombardata; ').repeat(10).trim();
    assert.ok(lungo.length > 700);
    const sch = scheda({ osservazione: { descrizione: lungo, testo: 'Wählt CDU!' } });
    const idx = indiceDi(sch);
    const n = VC.nodiDaScheda(sch).nodes.find(x => x.id === 'fonte_osservazione');
    const p = DF.paginaDelRamo({ nodi: [n], records: idx.records });
    const riga = VC.testoBlocco(sch, 'osservazione').split('\n').find(r => r.includes(lungo.slice(0, 40)));
    assert.ok(riga && riga.length > 700);
    const u = p.unita.find(x => x.text.includes(lungo.slice(0, 40)));
    assert.equal(u.text, riga, 'la riga è stata tagliata');
});

/* 6 · la cucitura vera: `R.checkpoint` di mappai-review.js, con interruttore e cancello letti davvero */
test('giro 18 · 6 · il checkpoint vero: G1 salta solo con l’interruttore acceso (di default dal 0088) e la scheda confermata e intatta', async () => {
    const Pipeline = require(JS('mappai-pipeline-core.js'));
    const prova = async ({ acceso, valore, conf, cambia, testo, mappa }) => {
        const sch = scheda(), toast = [];
        const conferma1 = conf ? conferma(sch) : undefined;
        if (cambia) sch.critica.tace = 'Corretto dopo la conferma';
        const db = mappa ? { nodes: [{ id: 'r', label: 'Mappa', desc: 'x', level: 0 }], links: [], sourcesDict: {} } : VC.nodiDaScheda(sch);
        const sources = testo ? [{ id: 't', type: 'text', content: 'Un testo.' }] : mappa ? [] : [fotoDi('f', sch, conferma1)];
        const m = Pipeline.createManifest(testo || mappa ? {} : { dossier: sch }, { vaultPath: '/vault' }); m.steps.A.status = 'done';
        /* acceso = la chiave non c'è (il default) o vale `valore`; spento = '0' */
        const ls = { getItem: k => (k === DF.CHIAVE ? (acceso ? (valore === undefined ? null : valore) : '0') : null) };
        const window = { MappAIReviewCore: RC, MappAIPipelineCore: Pipeline, MappAIDossierFonteCore: DF, MappAICreaIconograficaCore: IC, MappAIVisioneCore: VC,
            MappAIGroundingCore: G, MappAIMaterialReview: require(JS('mappai-material-review.js')), t: (k, f) => f, localStorage: ls,
            showToast: (msg, tipo) => toast.push(tipo),
            electronAPI: { saveVaultFile: async () => ({ ok: true, version: 1 }) } };
        const ctx = vm.createContext({ window, appState: { activeVaultPath: '/vault', db: JSON.parse(JSON.stringify(db)), sources, _pdfPagine: [] },
            document: { getElementById: () => null }, console: { log() {}, info() {}, warn() {}, error() {} }, localStorage: ls,
            StorageManager: { currentProjectId: 'p', saveCurrentProject() {} }, TextDecoder, Uint8Array });
        vm.runInContext(fs.readFileSync(JS('mappai-review.js'), 'utf8'), ctx);
        const out = await window.MappAIReview.checkpoint('/vault', m);
        return { stato: out.review.initial.status, scheda: DF.eFonteScheda(out.review.sources), toast };
    };
    /* acceso, confermata e intatta: la revisione è la conferma (approvata), niente G1 */
    assert.deepEqual(await prova({ acceso: true, conf: true }), { stato: 'approved', scheda: true, toast: [] });
    assert.deepEqual(await prova({ acceso: true, valore: '1', conf: true }), { stato: 'approved', scheda: true, toast: [] });
    /* spento con «0»: come prima, la revisione nasce da rivedere */
    assert.notEqual((await prova({ acceso: false, conf: true })).stato, 'approved');
    /* cambiata dopo la conferma: il cancello si richiude, e lo si dice */
    const camb = await prova({ acceso: true, conf: true, cambia: true });
    assert.notEqual(camb.stato, 'approved');
    assert.deepEqual(camb.toast, ['warning']);
    /* mai confermata, una fonte testuale, una mappa: la strada di prima */
    for (const caso of [{ acceso: true, conf: false }, { acceso: true, testo: true }, { acceso: true, mappa: true }]) {
        const r = await prova(caso);
        assert.notEqual(r.stato, 'approved', JSON.stringify(caso));
        assert.deepEqual(r.toast, [], JSON.stringify(caso));
    }
});

/* 7 · 8 · 10 · i testi */
test('giro 18 · 7 · 8 · 10 · «nel riquadro della scheda», il fattore di «Aa» con il separatore della lingua, «Caricala di nuovo»', () => {
    const en = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'traduzioni', 'en_translations.js'), 'utf8') + ';en_translations');
    /* 7 · il riquadro sta SOPRA il verde: niente «qui sotto» */
    const leggendo = IC.composizione([{ id: 'b', type: 'doc', file: { name: 'b.jpg' } }], { riquadro: true, inLettura: ['b'] });
    assert.equal(leggendo.mancano, 'Sto leggendo la foto «b.jpg»: i campi compariranno nel riquadro della scheda, da confermare.');
    const core = fs.readFileSync(JS('mappai-crea-iconografica-core.js'), 'utf8');
    assert.ok(!/'[^'\n]*qui sotto[^'\n]*'/.test(core.replace(/\/\*[\s\S]*?\*\//g, '')), '«qui sotto» in un testo del core');
    ['ci_rq_in_lettura', 'ci_rq_parti_letta', 'ci_rq_parti_cambiata'].forEach(k => {
        assert.ok(en[k], k);
        assert.ok(!/\bbelow\b/.test(en[k]), k);
    });
    /* 8 · il fattore: virgola in italiano, punto in inglese */
    assert.match(IC.ariaZoom(1.25), /×1,25$/);
    assert.match(IC.ariaZoom(1.5), /×1,5$/);
    global.window = { t: (k, f) => (en[k] != null ? en[k] : f) };
    try {
        assert.match(IC.ariaZoom(1.25), /×1\.25$/);
        assert.match(IC.ariaZoom(1.5), /×1\.5$/);
        assert.match(IC.ariaZoom(1), /×1$/);
        assert.ok(!/,/.test(IC.ariaZoom(1.25)));
    } finally { delete global.window; }
    /* 10 · niente «Rileggi la foto»: il gesto non c'è, resta «caricala di nuovo» */
    const guscio = fs.readFileSync(JS('mappai-crea-iconografica.js'), 'utf8');
    assert.ok(guscio.includes("'La foto non si apre: senza la foto davanti la scheda non si conferma. Caricala di nuovo.'"));
    assert.ok(!guscio.includes('Rileggi la foto o caricala'));
    assert.equal(en.ci_rq_foto_rotta, 'The photo does not open: without the photo in front of you the grid cannot be confirmed. Upload it again.');
});
