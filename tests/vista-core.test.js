// tests/vista-core.test.js — la vista che viaggia col vault (15/8/26)
const test = require('node:test');
const assert = require('node:assert');
const VC = require('../public/js/mappai-vista-core.js');

test('raccogli: prende SOLO le quattro cose che il vault non ha', () => {
    const stato = {
        rootNodeLabel: 'Project E', aiProvider: 'google',
        studioProfile: { gapLayer: 156, focus: { w: 210 } },
        focusTopic: 'solo i circuiti',
        db: {
            nodes: [{ id: 'a' }], links: [{ source: 'a', target: 'b' }],
            timelineEvents: [{ anno: 1800, evento: 'La pila' }],
            timelineAI: [], nodeSheet: { cards: [{ id: 'a', layout: '2x2' }] }
        }
    };
    const v = VC.raccogli(stato);
    assert.strictEqual(v.schema, 'mappai-vista@1');
    assert.deepStrictEqual(Object.keys(v).sort(),
        ['focusTopic', 'nodeSheet', 'salvato', 'schema', 'studioProfile', 'timelineEvents']);
    assert.strictEqual(v.nodes, undefined, 'i nodi restano nel vault, non qui');
});

test('raccogli: tutto vuoto → null, nessun file da scrivere', () => {
    assert.strictEqual(VC.raccogli({ db: { nodes: [], timelineEvents: [] }, focusTopic: '  ' }), null);
    assert.strictEqual(VC.raccogli(null), null);
});

test('applica: riporta la vista e DICE che cosa ha applicato', () => {
    const stato = { db: { nodes: [] } };
    const fatti = VC.applica(stato, {
        schema: 'mappai-vista@1',
        studioProfile: { gapLayer: 96 }, timelineEvents: [{ anno: 1799 }]
    });
    assert.deepStrictEqual(fatti.sort(), ['studioProfile', 'timelineEvents']);
    assert.strictEqual(stato.studioProfile.gapLayer, 96);
    assert.strictEqual(stato.db.timelineEvents.length, 1);
});

test('applica: un campo assente NON azzera quello che lo stato ha già', () => {
    const stato = { focusTopic: 'costruito ora', db: { timelineEvents: [{ anno: 1 }] } };
    VC.applica(stato, { schema: 'mappai-vista@1', studioProfile: { w: 118 } });
    assert.strictEqual(stato.focusTopic, 'costruito ora');
    assert.strictEqual(stato.db.timelineEvents.length, 1);
});

test('applica: uno schema sconosciuto non applica NIENTE (meglio di metà)', () => {
    const stato = { db: {} };
    const fatti = VC.applica(stato, { schema: 'mappai-vista@2', studioProfile: { x: 1 } });
    assert.deepStrictEqual(fatti, []);
    assert.strictEqual(stato.studioProfile, undefined);
});

test('statoSnello: i link tornano coppie di id (era il 48% del foglio)', () => {
    const na = { id: 'a', label: 'A', desc: 'x'.repeat(500) };
    const nb = { id: 'b', label: 'B', desc: 'y'.repeat(500) };
    const stato = { db: { nodes: [na, nb], links: [{ source: na, target: nb, rel: 'causa', index: 0 }] } };
    const s = VC.statoSnello(stato);
    assert.strictEqual(s.db.links[0].source, 'a');
    assert.strictEqual(s.db.links[0].target, 'b');
    assert.strictEqual(s.db.links[0].rel, 'causa');
    assert.strictEqual(s.db.links[0].index, undefined);
    // lo stato VIVO non è stato toccato: D3 ci lavora ancora sopra
    assert.strictEqual(stato.db.links[0].source, na);
    // e il peso scende davvero
    assert.ok(JSON.stringify(s.db.links).length < JSON.stringify(stato.db.links).length / 5);
});

test('statoSnello: link già a id passano invariati (vault appena caricato)', () => {
    const stato = { db: { links: [{ source: 'a', target: 'b', rel: 'include' }] }, rootNodeLabel: 'X' };
    const s = VC.statoSnello(stato);
    assert.deepStrictEqual(s.db.links, [{ source: 'a', target: 'b', rel: 'include' }]);
    assert.strictEqual(s.rootNodeLabel, 'X');
});

// ════════════════════════════════════════════════════════════════════════════
// 0076 (ADR 0018, punto 1) — il cassetto tiene solo ciò che non è già sul disco.
// A interruttore acceso (`{ snello: true }`, lo passa saveCurrentProject quando
// `mappai_cassetto_snello` = '1'). Senza opzioni: la copia di oggi, intera.
// La regola della fonte-foto è «fuori se già partita» (Giacomo, 05/10).
// ════════════════════════════════════════════════════════════════════════════
const RAPPORTI = ['_judgeReport', '_giudiceReport', '_coverageReport', '_qualityReport', '_rerankerReport'];
const FOTO = 'F'.repeat(300 * 1024);   // la foto da 900 px della scheda, in base64
function scheda(over) {
    return Object.assign({ titolo: 'La carta di Peutinger', nomeFile: 'peutinger.jpg', mime: 'image/jpeg', fotoB64: FOTO,
        identita: { autore: 'ignoto' }, osservazione: { testo: 'Una carta stradale romana.' } }, over);
}
function fonteFoto(sch, id) {
    return { id: id || 'source_foto', type: 'doc', content: '', file: {}, path: '/Users/x/Desktop/peutinger.jpg', mimeType: 'image/jpeg', _scheda: sch };
}
function manifesto(dossier) {
    return { schema: 'mappai-pipeline@1', config: { dossier: dossier, quiz: { n: 5 } }, steps: { A: { status: 'done', files: [] } },
        review: { initial: { status: 'approved' }, baseRevision: 'rev-base', approvedRevision: 'rev-ok',
            config: { dossier: dossier }, drafts: { D: { data: { foto: { b64: dossier && dossier.fotoB64 } } } } } };
}
// lo stato di un dossier col suo dossier già partito: la scheda della fonte È quella del manifesto
function dossierPartito() {
    const sch = scheda();
    const st = {
        rootNodeLabel: 'La carta di Peutinger', extractionMode: 'mindmap',
        activeVaultPath: '/Users/x/Documents/MappAI - file/Mappe/2A/Storia/La carta di Peutinger',
        db: { nodes: [{ id: 'fonte_0', label: 'La carta di Peutinger', desc: 'x' }], links: [] },
        sources: [fonteFoto(sch), { id: 'source_txt', type: 'text', content: 'appunti', file: null }],
        _pipelineManifest: manifesto(sch),
        _evidenze: { frasi: [{ id: 'e1', t: 'una frase' }] },
        _reviewRevision: 'rev-ok', _reviewCommit: 'rev-ok'
    };
    RAPPORTI.forEach(k => { st[k] = { rami: [{ esito: 'ok' }] }; });
    return st;
}
const ACCESO = { snello: true };

test('0076 M7: statoSnello SENZA interruttore è quello di oggi — manifesto, evidenze, rapporti e fonte-foto restano', () => {
    const st = dossierPartito();
    const s = VC.statoSnello(st);
    assert.strictEqual(s._pipelineManifest, st._pipelineManifest);
    assert.strictEqual(s._evidenze, st._evidenze);
    RAPPORTI.forEach(k => assert.strictEqual(s[k], st[k], k));
    assert.strictEqual(s.sources, st.sources, 'le fonti sono le stesse, foto compresa');
    assert.strictEqual(s._pipelineSegnale, undefined, 'nessun campo nuovo a interruttore spento');
    assert.strictEqual(VC.statoSnello(st, { snello: false })._pipelineManifest, st._pipelineManifest);
});

test('0076 M3: acceso, via il manifesto e _evidenze; restano _reviewRevision e _reviewCommit', () => {
    const s = VC.statoSnello(dossierPartito(), ACCESO);
    assert.ok(!('_pipelineManifest' in s), 'il manifesto non è nella copia (loadProject lo rilegge dal disco)');
    assert.ok(!('_evidenze' in s), '_evidenze è nella cartella, e si rilegge (mappai-evidence.js:97-101)');
    assert.strictEqual(s._reviewRevision, 'rev-ok', 'serve a R.restore e a checkMapWrite');
    assert.strictEqual(s._reviewCommit, 'rev-ok');
    assert.strictEqual(s.db.nodes.length, 1, 'il db resta');
    assert.strictEqual(s.activeVaultPath, dossierPartito().activeVaultPath, 'l\'identità resta');
});

test('0076 M11: acceso, i cinque rapporti del giudice RESTANO nel cassetto (qualita.json non si rilegge)', () => {
    const st = dossierPartito();
    const s = VC.statoSnello(st, ACCESO);
    RAPPORTI.forEach(k => assert.strictEqual(s[k], st[k], k + ' resta: senza, una riapertura lo perderebbe'));
});

test('0076 M2: il segnale della pipeline ha un nome suo, mai la chiave _pipelineManifest', () => {
    const s = VC.statoSnello(dossierPartito(), ACCESO);
    assert.deepStrictEqual(s._pipelineSegnale, { presente: true, revisione: 'rev-ok', stato: 'approved' });
    assert.ok(!('_pipelineManifest' in s), 'material-pipeline.js:2976 userebbe qualunque valore vero come manifesto');
    const senza = Object.assign(dossierPartito(), { _pipelineManifest: null });
    assert.deepStrictEqual(VC.statoSnello(senza, ACCESO)._pipelineSegnale, { presente: false, revisione: null, stato: null });
});

test('0076: acceso, la fonte-foto del dossier già PARTITO esce dalla copia (stesso oggetto della config)', () => {
    const s = VC.statoSnello(dossierPartito(), ACCESO);
    assert.deepStrictEqual(s.sources.map(x => x.id), ['source_txt'], 'resta solo la fonte di testo');
});

test('0076: acceso, partito anche per nomeFile e titolo — la config della pipeline è una copia JSON', () => {
    const st = dossierPartito();
    // Pipeline.run lavora su una copia: l'identità non regge, il contenuto sì (spazi normalizzati)
    st._pipelineManifest = JSON.parse(JSON.stringify(st._pipelineManifest));
    st._pipelineManifest.config.dossier.titolo = '  La carta   di Peutinger ';
    st._pipelineManifest.config.dossier.nomeFile = 'peutinger.jpg ';
    assert.deepStrictEqual(VC.statoSnello(st, ACCESO).sources.map(x => x.id), ['source_txt']);
    assert.strictEqual(VC.schedaPartita(st.sources[0]._scheda, st._pipelineManifest.config.dossier), true);
});

test('0076 M8: acceso, la fonte-foto IN ATTESA resta intera, foto compresa (il cassetto è l\'unica copia)', async (t) => {
    const casi = {
        'nessun manifesto': st => { st._pipelineManifest = null; },
        'manifesto senza config.dossier (una mappa)': st => { st._pipelineManifest = manifesto(undefined); },
        'il manifesto ha un\'altra scheda': st => { st._pipelineManifest = manifesto(scheda({ titolo: 'Un\'altra foto', nomeFile: 'altra.jpg' })); },
        'stesso titolo, altro file': st => { st._pipelineManifest = manifesto(scheda({ nomeFile: 'altra.jpg' })); },
        'stesso file, altro titolo (secondo dossier del lotto)': st => { st._pipelineManifest = manifesto(scheda({ titolo: 'Altro titolo' })); },
        'la scheda non ha nomeFile': st => {
            st.sources[0]._scheda = scheda({ nomeFile: '' });
            st._pipelineManifest = JSON.parse(JSON.stringify(manifesto(scheda({ nomeFile: '' }))));
        },
        'la scheda non ha titolo': st => {
            st.sources[0]._scheda = scheda({ titolo: '' });
            st._pipelineManifest = JSON.parse(JSON.stringify(manifesto(scheda({ titolo: '' }))));
        }
    };
    for (const [nome, prepara] of Object.entries(casi)) {
        await t.test(nome, () => {
            const st = dossierPartito();
            prepara(st);
            const s = VC.statoSnello(st, ACCESO);
            const f = s.sources.find(x => x.id === 'source_foto');
            assert.ok(f, 'la fonte-foto c\'è ancora');
            assert.strictEqual(f, st.sources[0], 'intera: lo stesso oggetto, niente tolto');
            assert.strictEqual(f._scheda.fotoB64, FOTO, 'con la foto');
            assert.ok(!('fotoNelDisco' in f._scheda), 'nessun marcatore inventato');
        });
    }
});

test('0076 M1: acceso, lo stato VIVO non si tocca — fonte-foto, foto, manifesto e rapporti restano in appState', () => {
    const st = dossierPartito();
    const prima = JSON.stringify(st);
    const fonti = st.sources, sch = st.sources[0]._scheda;
    VC.statoSnello(st, ACCESO);
    assert.strictEqual(JSON.stringify(st), prima, 'appState identico, byte per byte');
    assert.strictEqual(st.sources, fonti);
    assert.strictEqual(st.sources.length, 2, 'la fonte-foto resta in appState: i lettori della sessione la usano');
    assert.strictEqual(st.sources[0]._scheda, sch);
    assert.strictEqual(sch.fotoB64, FOTO);
    assert.ok(st._pipelineManifest && st._evidenze && st._judgeReport);
});

test('0076 M5: acceso, un progetto SENZA cartella non si snellisce (il cassetto è l\'unica copia)', () => {
    const st = Object.assign(dossierPartito(), { activeVaultPath: null });
    const s = VC.statoSnello(st, ACCESO);
    assert.strictEqual(s._pipelineManifest, st._pipelineManifest);
    assert.strictEqual(s._evidenze, st._evidenze);
    assert.strictEqual(s.sources, st.sources);
    RAPPORTI.forEach(k => assert.strictEqual(s[k], st[k], k));
});

test('0076: snelloDaVoce — la stessa regola su una copia letta dal cassetto; una copia già snella non perde il segnale', () => {
    const voce = JSON.parse(JSON.stringify(dossierPartito()));   // com'è nel cassetto: una copia JSON
    const s = VC.snelloDaVoce(voce);
    assert.ok(!('_pipelineManifest' in s));
    assert.deepStrictEqual(s.sources.map(x => x.id), ['source_txt'], 'il manifesto della copia dice che il dossier è partito');
    assert.deepStrictEqual(s._pipelineSegnale, { presente: true, revisione: 'rev-ok', stato: 'approved' });
    // una seconda passata non cambia niente, e non azzera il segnale
    assert.deepStrictEqual(VC.snelloDaVoce(JSON.parse(JSON.stringify(s))), JSON.parse(JSON.stringify(s)));
    // la voce letta non è stata toccata
    assert.ok(voce._pipelineManifest && voce.sources.length === 2);
    // una copia in attesa (nessun manifesto) tiene la fonte-foto intera
    const attesa = Object.assign(JSON.parse(JSON.stringify(dossierPartito())), { _pipelineManifest: null });
    assert.strictEqual(VC.snelloDaVoce(attesa).sources[0]._scheda.fotoB64, FOTO);
    // una copia senza cartella esce identica
    const sola = Object.assign(JSON.parse(JSON.stringify(dossierPartito())), { activeVaultPath: null });
    assert.deepStrictEqual(VC.snelloDaVoce(sola), sola);
});

test('0076 M5: pianoLiberaSpazio — solo le copie dei progetti CON cartella, mai quelle senza', () => {
    const conCartella = JSON.stringify(dossierPartito());
    const senzaCartella = JSON.stringify(Object.assign(dossierPartito(), { activeVaultPath: null }));
    const indiceSenzaVault = JSON.stringify(dossierPartito());   // la voce d'indice non dichiara un vault
    const cassetto = { p1: conCartella, p2: senzaCartella, p3: indiceSenzaVault, p4: conCartella };
    const progetti = [
        { id: 'p1', name: 'Uno', vault: 'La carta di Peutinger' },
        { id: 'p2', name: 'Due', vault: 'La carta di Peutinger' },
        { id: 'p3', name: 'Tre', vault: null },
        { id: 'p4', name: 'Quattro', vault: 'La carta di Peutinger' },
        { id: 'p5', name: 'Cinque', vault: 'Senza copia' }
    ];
    const piano = VC.pianoLiberaSpazio(progetti, id => (id in cassetto ? cassetto[id] : null), { p4: 1 });
    assert.deepStrictEqual(piano.voci.map(v => v.id), ['p1'], 'p2 senza cartella, p3 senza vault, p4 già potato, p5 senza copia');
    const v = piano.voci[0];
    assert.strictEqual(v.prima, conCartella.length);
    assert.strictEqual(v.dopo, v.testo.length);
    assert.ok(v.dopo < v.prima / 10, 'la copia scende davvero');
    assert.strictEqual(piano.byte, v.prima - v.dopo);
    assert.ok(!('_pipelineManifest' in JSON.parse(v.testo)));
});

test('0076: pianoLiberaSpazio — con l\'elenco delle cartelle che esistono, solo quelle; un residuo non si tocca', () => {
    const conCartella = JSON.stringify(dossierPartito());
    const res = JSON.stringify(VC.residuo(VC.statoSnello(dossierPartito(), ACCESO), { cartella: '/C', quando: 'q' }));
    const cassetto = { p1: conCartella, p2: conCartella, p3: res };
    const progetti = [
        { id: 'p1', vault: 'La carta di Peutinger' },
        { id: 'p2', vault: 'Cartella cancellata' },
        { id: 'p3', vault: 'La carta di Peutinger' }
    ];
    const esiste = p => p.vault === 'La carta di Peutinger';
    const piano = VC.pianoLiberaSpazio(progetti, id => cassetto[id] || null, {}, esiste);
    assert.deepStrictEqual(piano.voci.map(v => v.id), ['p1'], 'p2: la sua cartella non c\'è più; p3: è già un residuo');
    // E5: una riga «superata» porta l'impronta della copia: riscriverla la romperebbe
    const conSegno = progetti.concat([{ id: 'p4', vault: 'La carta di Peutinger', superata: { cartella: '/C', quando: 'q', copia: conCartella.length } }]);
    cassetto.p4 = conCartella;
    assert.deepStrictEqual(VC.pianoLiberaSpazio(conSegno, id => cassetto[id] || null, {}, esiste).voci.map(v => v.id), ['p1'],
        'p4 ha la riga «superata»: resta com\'è');
    assert.strictEqual(VC.snelloDaVoce(JSON.parse(res)).db.links, undefined, 'snelloDaVoce lascia il residuo com\'è');
});

// ── 0076, B1 rivisto (Giacomo, 05/10: «1 · Residuo») ─────────────────────────
// A cassetto pieno, scritta la cartella, al posto della copia vecchia va un
// RESIDUO: la copia snella di adesso meno ciò che la cartella porta E il
// caricamento rilegge — nodi e collegamenti, nient'altro di provato.
test('0076 M9: residuo — via nodi e collegamenti, tutto il resto resta, col segno e il percorso esatto', () => {
    const st = dossierPartito();
    st._pipelineManifest = null;                 // la fonte-foto è IN ATTESA: unica copia
    st._pdfPagine = [{ nome: 'scheda.pdf', pages: [{ n: 1, text: 'pagina uno' }] }];
    st._generationSources = [{ id: 'text-0', type: 'text', content: 'testo incollato' }];
    st.db.sourcesDict = { fonte_0: [{ title: 'F', text: 'citazione' }] };
    st.db.studySets = [{ id: 'set1' }];
    st.db.links = [{ source: 'fonte_0', target: 'x', rel: 'include' }];
    const copia = VC.statoSnello(st, ACCESO);
    const r = VC.residuo(copia, { cartella: st.activeVaultPath, quando: '2026-10-05T10:00:00.000Z' });
    assert.deepStrictEqual(VC.CAMPI_DALLA_CARTELLA, ['nodes', 'links']);
    assert.ok(!('nodes' in r.db) && !('links' in r.db), 'nodi e collegamenti sono nella cartella');
    assert.deepStrictEqual(r._residuo, { cartella: st.activeVaultPath, quando: '2026-10-05T10:00:00.000Z' });
    assert.deepStrictEqual(r.sources.map(x => x.id), ['source_foto', 'source_txt'], 'le fonti restano');
    assert.strictEqual(r.sources[0]._scheda.fotoB64, FOTO, 'la fonte-foto in attesa resta intera');
    assert.strictEqual(r._pdfPagine, st._pdfPagine);
    assert.strictEqual(r._generationSources, st._generationSources);
    RAPPORTI.forEach(k => assert.strictEqual(r[k], st[k], k));
    assert.strictEqual(r.db.sourcesDict, st.db.sourcesDict, 'un campo di db non provato resta');
    assert.strictEqual(r.db.studySets, st.db.studySets);
    assert.strictEqual(r._reviewRevision, 'rev-ok');
    assert.strictEqual(copia.db.nodes.length, 1, 'la copia da cui nasce non è stata toccata');
    assert.strictEqual(st.db.nodes.length, 1, 'e nemmeno lo stato vivo');
});

test('0076: un dossier da foto snello pesa meno di 100 KB (ADR 0018, obiettivo misurabile)', () => {
    const st = dossierPartito();
    const prima = JSON.stringify(VC.statoSnello(st)).length;
    const dopo = JSON.stringify(VC.statoSnello(st, ACCESO)).length;
    assert.ok(prima > 900 * 1024, 'oggi la foto ci sta tre volte: ' + Math.round(prima / 1024) + ' KB');
    assert.ok(dopo < 100 * 1024, 'snello: ' + Math.round(dopo / 1024) + ' KB');
});

// ── 0078: la cartella ha tutto quello che ha la copia (ADR 0018, rev. 1, B2 e B5) ──
/* L'interruttore `mappai_cartella_completa` (acceso di default, '0' lo spegne) ha
   UN lettore, `cartellaCompleta()`, che legge `localStorage` del luogo in cui il
   core gira: qui lo si finge sul globale di Node (che non ne ha uno suo). */
function conInterruttore(valore, fn) {
    const prima = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true,
        value: { getItem: k => (k === 'mappai_cartella_completa' ? valore : null) } });
    try { return fn(); } finally {
        if (prima) Object.defineProperty(globalThis, 'localStorage', prima); else delete globalThis.localStorage;
    }
}
const SPENTO = fn => conInterruttore('0', fn);
const CATENA = { sezioni: [{ titolo: 'Perché la Svizzera restò neutrale', righe: ['riga rivista dal docente'] }] };
const CLONI_CATENA = { 'per la 2a': { sezioni: [{ titolo: 'Copia', righe: ['una'] }], clone: 'per la 2a' } };
const CLONI_FOGLIO = { 'versione breve': { cards: [{ id: 'a', layout: '1x1' }], clone: 'versione breve' } };
function statoCompleto() {
    return {
        focusTopic: 'solo i circuiti',
        db: {
            nodes: [{ id: 'root', pinned: false }, { id: 'a', pinned: true }, { id: 7, pinned: true }, { id: 'b' }, { id: 'c', pinned: 'true' }],
            links: [], causalDoc: CATENA, causalDocCloni: CLONI_CATENA, nodeSheetCloni: CLONI_FOGLIO
        }
    };
}

test('0078 cartellaCompleta: acceso di default (chiave assente, nessun localStorage, localStorage che lancia), spento solo con «0»', () => {
    assert.strictEqual(VC.cartellaCompleta(), true, 'Node non ha localStorage: acceso');
    assert.strictEqual(conInterruttore(null, () => VC.cartellaCompleta()), true);
    assert.strictEqual(conInterruttore('1', () => VC.cartellaCompleta()), true);
    assert.strictEqual(SPENTO(() => VC.cartellaCompleta()), false);
    const prima = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('accesso negato'); } });
    try { assert.strictEqual(VC.cartellaCompleta(), true, 'un localStorage che lancia non spegne'); }
    finally { if (prima) Object.defineProperty(globalThis, 'localStorage', prima); else delete globalThis.localStorage; }
});

test('0078 M1: raccogli porta la Catena dei perché rivista, le copie dei documenti e i nodi fissati (id come stringa)', () => {
    const v = VC.raccogli(statoCompleto());
    assert.strictEqual(v.schema, 'mappai-vista@1', 'lo schema resta @1 (B2 a)');
    assert.deepStrictEqual(v.causalDoc, CATENA);
    assert.deepStrictEqual(v.causalDocCloni, CLONI_CATENA);
    assert.deepStrictEqual(v.nodeSheetCloni, CLONI_FOGLIO);
    assert.deepStrictEqual(v.pinned, ['a', '7'], 'solo pinned === true, e gli id come stringa');
    assert.deepStrictEqual(Object.keys(v).sort(),
        ['causalDoc', 'causalDocCloni', 'focusTopic', 'nodeSheetCloni', 'pinned', 'salvato', 'schema']);
});

test('0078: raccogli — i campi nuovi entrano SOLO se pieni; tutto vuoto resta null', () => {
    const vuoto = { db: { nodes: [{ id: 'a' }, { id: 'b', pinned: false }], links: [], causalDoc: {}, causalDocCloni: {}, nodeSheetCloni: {} } };
    assert.strictEqual(VC.raccogli(vuoto), null, 'niente di pieno: nessun file');
    vuoto.focusTopic = 'x';
    assert.deepStrictEqual(Object.keys(VC.raccogli(vuoto)).sort(), ['focusTopic', 'salvato', 'schema']);
    const soloPin = { db: { nodes: [{ id: 'a', pinned: true }] } };
    assert.deepStrictEqual(VC.raccogli(soloPin).pinned, ['a'], 'i soli nodi fissati bastano a scrivere la vista');
    assert.deepStrictEqual(VC.raccogli({ db: { causalDoc: CATENA } }).causalDoc, CATENA, 'senza nodi: la catena c\'è lo stesso');
});

test('0078 M5: interruttore spento — raccogli è quello di oggi (sei campi), nessun campo nuovo', () => {
    const v = SPENTO(() => VC.raccogli(statoCompleto()));
    assert.deepStrictEqual(Object.keys(v).sort(), ['focusTopic', 'salvato', 'schema']);
    assert.strictEqual(SPENTO(() => VC.raccogli({ db: { nodes: [{ id: 'a', pinned: true }], causalDoc: CATENA } })), null,
        'spento, una mappa con soli nodi fissati e catena non scrive la vista (come oggi)');
});

test('0078: applica — catena, copie e nodi fissati tornano; un id che manca si ignora; i nodi non elencati restano come sono', () => {
    const st = { db: { nodes: [{ id: 'root' }, { id: 'a' }, { id: 7 }, { id: 'b', pinned: true }] } };
    const fatti = VC.applica(st, { schema: 'mappai-vista@1', causalDoc: CATENA, causalDocCloni: CLONI_CATENA,
        nodeSheetCloni: CLONI_FOGLIO, pinned: ['a', '7', 'non-c-e'] });
    assert.deepStrictEqual(fatti.slice().sort(), ['causalDoc', 'causalDocCloni', 'nodeSheetCloni', 'pinned']);
    assert.deepStrictEqual(st.db.causalDoc, CATENA);
    assert.deepStrictEqual(st.db.causalDocCloni, CLONI_CATENA);
    assert.deepStrictEqual(st.db.nodeSheetCloni, CLONI_FOGLIO);
    assert.deepStrictEqual(st.db.nodes.map(n => n.pinned), [undefined, true, true, true],
        'per String(id), come main.js; il nodo già fissato resta fissato, root resta com\'era');
    assert.strictEqual(st.db.nodes.length, 4, 'un id che manca non crea nodi');
});

test('0078: applica — campi nuovi assenti o vuoti non azzerano niente (regola di fusione)', () => {
    const st = { db: { nodes: [{ id: 'a', pinned: true }], causalDoc: CATENA, nodeSheetCloni: CLONI_FOGLIO } };
    const fatti = VC.applica(st, { schema: 'mappai-vista@1', causalDoc: {}, pinned: [], focusTopic: 'f' });
    assert.deepStrictEqual(fatti, ['focusTopic']);
    assert.deepStrictEqual(st.db.causalDoc, CATENA);
    assert.deepStrictEqual(st.db.nodeSheetCloni, CLONI_FOGLIO);
    assert.strictEqual(st.db.nodes[0].pinned, true);
    const nessuno = { db: { nodes: [{ id: 'x' }] } };
    assert.deepStrictEqual(VC.applica(nessuno, { schema: 'mappai-vista@1', pinned: ['y'] }), [],
        'nessun nodo combacia: «pinned» non è fra i campi applicati');
});

test('0078 M2: applica marca i nodi CHE CI SONO — prima dei nodi non marca niente', () => {
    const st = { db: {} };
    VC.applica(st, { schema: 'mappai-vista@1', pinned: ['a'] });
    st.db.nodes = [{ id: 'a' }];
    assert.strictEqual(st.db.nodes[0].pinned, undefined, 'i nodi arrivati dopo non sono marcati: va chiamata DOPO');
});

test('0078 M5: interruttore spento — applica ignora i campi nuovi e applica i sei di oggi', () => {
    const st = { db: { nodes: [{ id: 'a' }] } };
    const fatti = SPENTO(() => VC.applica(st, { schema: 'mappai-vista@1', causalDoc: CATENA, causalDocCloni: CLONI_CATENA,
        nodeSheetCloni: CLONI_FOGLIO, pinned: ['a'], focusTopic: 'f' }));
    assert.deepStrictEqual(fatti, ['focusTopic']);
    assert.strictEqual(st.db.causalDoc, undefined);
    assert.strictEqual(st.db.causalDocCloni, undefined);
    assert.strictEqual(st.db.nodeSheetCloni, undefined);
    assert.strictEqual(st.db.nodes[0].pinned, undefined);
});

test('0078: il giro intero — raccogli, JSON, applica su una mappa riaperta dalla cartella (nodi senza pinned)', () => {
    const file = JSON.parse(JSON.stringify(VC.raccogli(statoCompleto())));
    const riaperta = { db: { nodes: [{ id: 'root' }, { id: 'a' }, { id: '7' }, { id: 'b' }, { id: 'c' }] } };
    VC.applica(riaperta, file);
    assert.deepStrictEqual(riaperta.db.nodes.filter(n => n.pinned === true).map(n => n.id), ['a', '7']);
    assert.deepStrictEqual(riaperta.db.causalDoc, CATENA);
    assert.deepStrictEqual(VC.raccogli(riaperta).pinned, ['a', '7'], 'e al salvataggio dopo ci sono ancora');
});

/* ── azzeraGenerazione (§4.2): una lista sola, nel core ── */
const LISTA_GENERAZIONE = ['generationDiscipline', 'generationTuned', '_qualityReport', '_coverageReport', '_rerankerReport',
    '_judgeReport', '_giudiceReport', 'mmTriage', '_docOutline', 'semanticGuidance', 'layoutMode', '_pdfPagine',
    '_reviewLocalDraft', '_reviewDiskDraft', '_reviewRequested', '_generationId', 'generationUsage'];
function mappaDiPrima() {
    const db = { nodes: [{ id: 'a', pinned: true }], links: [], causalDoc: CATENA };
    return {
        db: db, activeVaultPath: '/M/4R/Storia/Mappa', rootNodeLabel: 'Mappa', vaultClasse: '4R', vaultMateria: 'Storia',
        sources: [{ id: 's1', content: 'testo' }], focusTopic: 'f', studioProfile: { w: 1 }, _pipelineManifest: { x: 1 },
        generationDiscipline: 'Storia', generationTuned: true, _qualityReport: { q: 1 }, _coverageReport: { c: 1 },
        _rerankerReport: { r: 1 }, _judgeReport: { j: 1 }, _giudiceReport: { g: 1 }, mmTriage: { tipo: 'scheda' },
        _docOutline: '\n\nINDICE…', semanticGuidance: 'guida della mappa di prima', layoutMode: 'radial',
        _pdfPagine: [{ pages: [1] }], _reviewLocalDraft: { d: 1 }, _reviewDiskDraft: { d: 2 }, _reviewRequested: true,
        _generationId: 'gen-prima', generationUsage: { usedModel: 'della mappa di prima' }
    };
}

test('0078: CAMPI_GENERAZIONE è la lista del §4.2, esportata (una sola fonte)', () => {
    assert.ok(Array.isArray(VC.CAMPI_GENERAZIONE));
    assert.deepStrictEqual(VC.CAMPI_GENERAZIONE.slice().sort(), LISTA_GENERAZIONE.slice().sort());
});

test('0078: azzeraGenerazione — la lista a valori vuoti o di base; db, identità, fonti e vista non si toccano', () => {
    const st = mappaDiPrima(), db = st.db, dbPrima = JSON.stringify(st.db);
    VC.azzeraGenerazione(st);
    for (const k of LISTA_GENERAZIONE) {
        if (k === 'layoutMode') continue;
        assert.ok(!st[k], k + ' azzerato: ' + JSON.stringify(st[k]));
    }
    assert.strictEqual(st.layoutMode, 'default');
    assert.strictEqual(st.generationUsage, null);
    assert.strictEqual(st.semanticGuidance, '');
    assert.strictEqual(st.generationDiscipline, '');
    assert.strictEqual(st.generationTuned, undefined,
        'non false: «tarata» si rilegge dalla riga d\'indice di QUESTO progetto (mappai-storage-lang.js:189-191)');
    assert.strictEqual(st.db, db, 'stesso db');
    assert.strictEqual(JSON.stringify(st.db), dbPrima, 'db intatto');
    assert.strictEqual(st.activeVaultPath, '/M/4R/Storia/Mappa');
    assert.strictEqual(st.rootNodeLabel, 'Mappa');
    assert.strictEqual(st.vaultMateria, 'Storia');
    assert.strictEqual(st.sources.length, 1);
    assert.strictEqual(st.focusTopic, 'f');
    assert.deepStrictEqual(st._pipelineManifest, { x: 1 }, 'il manifesto non è nella lista: lo decide chi apre');
    assert.doesNotThrow(() => VC.azzeraGenerazione(null));
});

// ── 0082: il cassetto tiene solo l'indice (ADR 0018, revisione 2) ──────────────
/* Le regole pure del packet 0082. L'interruttore `mappai_cassetto_solo_indice` è
   spento di default ('1' accende), vale solo con `mappai_cartella_completa` acceso,
   e mai nel reader (`electronAPI.__studente`). Qui il `localStorage` e il `window`
   si fingono sul globale di Node, come per `cartellaCompleta`. */
function conChiavi(chiavi, fn, win) {
    const primaLS = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const primaW = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true,
        value: { getItem: k => (Object.prototype.hasOwnProperty.call(chiavi, k) ? chiavi[k] : null) } });
    if (win !== undefined) Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: win });
    try { return fn(); } finally {
        if (primaLS) Object.defineProperty(globalThis, 'localStorage', primaLS); else delete globalThis.localStorage;
        if (win !== undefined) { if (primaW) Object.defineProperty(globalThis, 'window', primaW); else delete globalThis.window; }
    }
}
const K82 = 'mappai_cassetto_solo_indice';

test('0082 cassettoSoloIndice: spento di default, acceso solo con «1»', () => {
    assert.strictEqual(VC.cassettoSoloIndice(), false, 'Node senza localStorage: spento');
    assert.strictEqual(conChiavi({}, () => VC.cassettoSoloIndice()), false, 'chiave assente: spento');
    assert.strictEqual(conChiavi({ [K82]: '0' }, () => VC.cassettoSoloIndice()), false);
    assert.strictEqual(conChiavi({ [K82]: 'true' }, () => VC.cassettoSoloIndice()), false, 'solo «1» accende');
    assert.strictEqual(conChiavi({ [K82]: '1' }, () => VC.cassettoSoloIndice()), true);
});

test('0082 M8: acceso vale solo con mappai_cartella_completa acceso', () => {
    assert.strictEqual(conChiavi({ [K82]: '1', mappai_cartella_completa: '0' }, () => VC.cassettoSoloIndice()), false);
    assert.strictEqual(conChiavi({ [K82]: '1', mappai_cartella_completa: '1' }, () => VC.cassettoSoloIndice()), true);
});

test('0082 M7: nel reader (electronAPI.__studente) vale sempre spento', () => {
    assert.strictEqual(conChiavi({ [K82]: '1' }, () => VC.cassettoSoloIndice(), { electronAPI: { __studente: true } }), false);
    assert.strictEqual(conChiavi({ [K82]: '1' }, () => VC.cassettoSoloIndice(), { electronAPI: {} }), true);
    assert.strictEqual(conChiavi({ [K82]: '1' }, () => VC.cassettoSoloIndice(), {}), true, 'senza electronAPI non è il reader');
});

test('0082: un localStorage che lancia vale spento', () => {
    const prima = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true,
        value: { getItem: () => { throw new Error('bloccato'); } } });
    try { assert.strictEqual(VC.cassettoSoloIndice(), false); } finally {
        if (prima) Object.defineProperty(globalThis, 'localStorage', prima); else delete globalThis.localStorage;
    }
});

// ── la firma delle chat (B6 (a)) ──
const chat = () => ({
    sidebar: { history: [{ role: 'user', parts: [{ text: 'ciao' }] }, { role: 'model', parts: [{ text: 'Ciao! Come posso aiutarti?' }] }], mode: 'socratic' },
    nodes: { a: { phase: null, mode: 'socratic', turns: 1, history: [{ role: 'user', parts: [{ text: 'perché?' }] }] } }
});

test('0082 firmaChat: stessa chat, stessa firma; è un testo corto, non la storia', () => {
    const f = VC.firmaChat(chat());
    assert.strictEqual(typeof f, 'string');
    assert.strictEqual(f, VC.firmaChat(chat()));
    assert.ok(!/Come posso aiutarti|perché\?/.test(f), 'la firma non porta il testo dei messaggi');
    const lunga = chat(); lunga.sidebar.history[1].parts[0].text = 'x'.repeat(50000);
    assert.ok(VC.firmaChat(lunga).length < 500, 'corta anche con un messaggio lungo');
});

test('0082 firmaChat: cambia con un messaggio nuovo (anche la risposta del modello)', () => {
    const a = chat(), b = chat();
    b.sidebar.history.push({ role: 'user', parts: [{ text: 'altro' }] });
    assert.notStrictEqual(VC.firmaChat(a), VC.firmaChat(b));
    const c = chat(); c.nodes.a.history.push({ role: 'model', parts: [{ text: 'perché sì' }] });
    assert.notStrictEqual(VC.firmaChat(a), VC.firmaChat(c), 'messaggio nella chat di un nodo');
});

test('0082 firmaChat: cambia con un ultimo messaggio di lunghezza diversa', () => {
    const a = chat(), b = chat();
    b.sidebar.history[1].parts[0].text += ' Sono qui.';
    assert.notStrictEqual(VC.firmaChat(a), VC.firmaChat(b));
});

test('0082 M28: firmaChat cambia con un reset (storia svuotata, chat di nodo tolta)', () => {
    const a = chat(), b = chat();
    b.sidebar.history = [];
    assert.notStrictEqual(VC.firmaChat(a), VC.firmaChat(b));
    const c = chat(); delete c.nodes.a;
    assert.notStrictEqual(VC.firmaChat(a), VC.firmaChat(c));
});

test('0082 M29: firmaChat cambia con una modalità diversa o una chat di nodo nuova', () => {
    const a = chat(), b = chat();
    b.nodes.a.mode = 'spiega';
    assert.notStrictEqual(VC.firmaChat(a), VC.firmaChat(b), 'modalità del nodo');
    const c = chat(); c.sidebar.mode = 'quiz';
    assert.notStrictEqual(VC.firmaChat(a), VC.firmaChat(c), 'modalità della barra laterale');
    const d = chat(); d.nodes.b = { mode: 'socratic', turns: 0, history: [] };
    assert.notStrictEqual(VC.firmaChat(a), VC.firmaChat(d), 'una chat di nodo nuova, anche vuota');
});

test('0082 firmaChat: l\'ordine delle chiavi dei nodi non conta', () => {
    const a = chat(); a.nodes.b = { mode: 'socratic', history: [] };
    const b = { sidebar: a.sidebar, nodes: { b: a.nodes.b, a: a.nodes.a } };
    assert.strictEqual(VC.firmaChat(a), VC.firmaChat(b));
});

test('0082 firmaChat: stato assente o malformato = firma del vuoto, mai un errore', () => {
    const vuoto = VC.firmaChat({ sidebar: { history: [] }, nodes: {} });
    for (const x of [null, undefined, 3, 'x', {}, { sidebar: null }, { sidebar: { history: 'no' }, nodes: [] }]) {
        assert.doesNotThrow(() => VC.firmaChat(x));
        assert.strictEqual(VC.firmaChat(x), vuoto, JSON.stringify(x));
    }
});

// ── la cartella indietro, la copia da riscrivere ──
const IMP = { id: 'proj_1', copia: '{"a":1}', chat: '{"c":1}', firma: 'f' };

test('0082 cartellaIndietro: impronta assente o di un altro progetto → indietro', () => {
    assert.strictEqual(VC.cartellaIndietro(null, 'proj_1', '{"a":1}', '{"c":1}'), true);
    assert.strictEqual(VC.cartellaIndietro(Object.assign({}, IMP, { id: 'proj_2' }), 'proj_1', '{"a":1}', '{"c":1}'), true);
});

test('0082 M21: cartellaIndietro decide sul TESTO (copia e chat), non sulla presenza della copia', () => {
    assert.strictEqual(VC.cartellaIndietro(IMP, 'proj_1', '{"a":1}', '{"c":1}'), false, 'tutto uguale: pari');
    assert.strictEqual(VC.cartellaIndietro(IMP, 'proj_1', '{"a":2}', '{"c":1}'), true, 'copia diversa');
    assert.strictEqual(VC.cartellaIndietro(IMP, 'proj_1', '{"a":1}', '{"c":2}'), true, 'M5: solo le chat diverse');
});

test('0082 M4/M15 saltaCopia: si salta SOLO se nel cassetto non c\'è la copia e il testo è quello dell\'impronta', () => {
    assert.strictEqual(VC.saltaCopia(IMP, 'proj_1', '{"a":1}', null), true);
    assert.strictEqual(VC.saltaCopia(IMP, 'proj_1', '{"a":2}', null), false, 'M4: testo diverso si scrive');
    assert.strictEqual(VC.saltaCopia(IMP, 'proj_1', '{"a":1}', '{"vecchia":1}'), false, 'M15: c\'è una copia vecchia: si riscrive');
    assert.strictEqual(VC.saltaCopia(IMP, 'proj_1', '{"a":1}', '{"a":1}'), false, 'la copia c\'è: si scrive come oggi');
    assert.strictEqual(VC.saltaCopia(null, 'proj_1', '{"a":1}', null), false, 'senza impronta si scrive');
    assert.strictEqual(VC.saltaCopia(Object.assign({}, IMP, { id: 'proj_2' }), 'proj_1', '{"a":1}', null), false);
});

// ── la cartella scrivibile, l'identità ──
test('0082 M1 cartellaScrivibile: solo una cartella con index.yaml che non dichiara un altro id', () => {
    assert.strictEqual(VC.cartellaScrivibile(false, '', 'proj_1'), false, 'senza index.yaml mai');
    assert.strictEqual(VC.cartellaScrivibile(true, '', 'proj_1'), true, 'senza id dichiarato');
    assert.strictEqual(VC.cartellaScrivibile(true, 'proj_1', 'proj_1'), true);
    assert.strictEqual(VC.cartellaScrivibile(true, 'proj_2', 'proj_1'), false, 'un altro progetto');
});

// ── la copia da togliere ──
const OK = { stessoProgetto: true, copiaOra: '{"a":1}', copiaT0: '{"a":1}', idConfermato: true, fontiOk: true,
    setsFuori: 0, bozze: false };
const togli = o => VC.copiaDaTogliere(Object.assign({}, OK, o));

test('0082 copiaDaTogliere: tutte le condizioni → si toglie', () => {
    assert.deepStrictEqual(VC.copiaDaTogliere(OK), { togli: true, motivo: null });
});

test('0082 M2/M13/M17/M20 copiaDaTogliere: ogni condizione mancante tiene la copia, col suo motivo', () => {
    assert.deepStrictEqual(togli({ stessoProgetto: false }), { togli: false, motivo: 'progetto' });
    assert.deepStrictEqual(togli({ copiaOra: '{"a":2}' }), { togli: false, motivo: 'copia-cambiata' }, 'M2');
    assert.deepStrictEqual(togli({ copiaOra: null }), { togli: false, motivo: 'copia-cambiata' }, 'tolta da altri intanto');
    assert.deepStrictEqual(togli({ copiaT0: null, copiaOra: null }), { togli: false, motivo: 'nessuna-copia' });
    assert.deepStrictEqual(togli({ idConfermato: false }), { togli: false, motivo: 'id' }, 'M17');
    assert.deepStrictEqual(togli({ fontiOk: false }), { togli: false, motivo: 'fonti' }, 'M13');
    assert.deepStrictEqual(togli({ setsFuori: 2 }), { togli: false, motivo: 'set' }, 'M20');
    assert.deepStrictEqual(togli({ bozze: true }), { togli: false, motivo: 'bozze' }, 'M20');
    assert.doesNotThrow(() => VC.copiaDaTogliere(null));
    assert.strictEqual(VC.copiaDaTogliere(null).togli, false);
});

// ── il percorso della riga ──
test('0082 percorsoRiga: relativo alla radice dei file quando ci sta dentro, intero fuori', () => {
    const R = '/Users/g/Documents/MappAI - file';
    assert.strictEqual(VC.percorsoRiga(R + '/Mappe/4R/Storia/La Carta', R), 'Mappe/4R/Storia/La Carta');
    assert.strictEqual(VC.percorsoRiga(R + '/Mappe/4R/Storia/La Carta', R + '/'), 'Mappe/4R/Storia/La Carta', 'barra finale sulla radice');
    assert.strictEqual(VC.percorsoRiga('/Users/g/Desktop/Analisi/X', R), '/Users/g/Desktop/Analisi/X', 'fuori: intero');
    assert.strictEqual(VC.percorsoRiga(R + 'X/Mappe/Y', R), R + 'X/Mappe/Y', 'un prefisso che non è una cartella non vale');
    assert.strictEqual(VC.percorsoRiga('C:\\Docs\\MappAI - file\\Mappe\\4R\\X', 'C:\\Docs\\MappAI - file'), 'Mappe/4R/X', 'Windows');
    assert.strictEqual(VC.percorsoRiga(null, R), null);
    assert.strictEqual(VC.percorsoRiga('', R), null);
    assert.strictEqual(VC.percorsoRiga('/a/b', null), '/a/b', 'radice ignota: intero');
});

test('0082 percorsoDaRiga: il ritorno, e i casi senza radice', () => {
    const R = '/Users/g/Documents/MappAI - file';
    assert.strictEqual(VC.percorsoDaRiga('Mappe/4R/Storia/La Carta', R), R + '/Mappe/4R/Storia/La Carta');
    assert.strictEqual(VC.percorsoDaRiga('Mappe/4R/Storia/La Carta', R + '/'), R + '/Mappe/4R/Storia/La Carta');
    assert.strictEqual(VC.percorsoDaRiga('/Users/g/Desktop/Analisi/X', R), '/Users/g/Desktop/Analisi/X', 'intero resta intero');
    assert.strictEqual(VC.percorsoDaRiga('C:/Docs/X', R), 'C:/Docs/X', 'intero su Windows');
    assert.strictEqual(VC.percorsoDaRiga('Mappe/X', null), null, 'relativo senza radice: niente');
    assert.strictEqual(VC.percorsoDaRiga(null, R), null);
    assert.strictEqual(VC.percorsoDaRiga('../fuori', R), null, 'un relativo che risale non vale');
    for (const p of ['/Users/g/Desktop/Analisi/X', R + '/Mappe/4R/X'])
        assert.strictEqual(VC.percorsoDaRiga(VC.percorsoRiga(p, R), R), p, 'andata e ritorno: ' + p);
});

// ── qualita.json non si svuota (§4.9) ──
const QUAL = { schema: 'mappai-qualita@2', quando: '2026-10-01T10:00:00Z', generationId: 'g1', modello: 'm',
    ancora: { a: 1 }, copertura: { c: 1 }, giudice: { g: 1 }, reranker: { r: 1 } };

test('0082 M35 unisciQualita: un rapporto che in memoria manca resta quello del file', () => {
    const nuovi = { schema: 'mappai-qualita@2', quando: '2026-10-07T10:00:00Z', generationId: undefined, modello: '',
        ancora: null, copertura: null, giudice: null, reranker: null };
    const u = VC.unisciQualita(JSON.stringify(QUAL), nuovi);
    assert.deepStrictEqual(u.reranker, { r: 1 });
    assert.deepStrictEqual(u.ancora, { a: 1 });
    assert.deepStrictEqual(u.copertura, { c: 1 });
    assert.deepStrictEqual(u.giudice, { g: 1 });
    assert.strictEqual(u.quando, '2026-10-07T10:00:00Z', 'l\'istante è quello nuovo');
    assert.strictEqual(nuovi.reranker, null, 'non tocca l\'oggetto ricevuto');
});

test('0082 unisciQualita: un rapporto presente in memoria vince sempre', () => {
    const nuovi = Object.assign({}, QUAL, { ancora: { a: 2 }, reranker: undefined });
    delete nuovi.reranker;
    const u = VC.unisciQualita(JSON.stringify(QUAL), nuovi);
    assert.deepStrictEqual(u.ancora, { a: 2 });
    assert.deepStrictEqual(u.reranker, { r: 1 }, 'assente = manca');
});

test('0082 M36 unisciQualita: file mancante, illeggibile o di un altro schema → i dati nuovi, intatti', () => {
    const nuovi = Object.assign({}, QUAL, { reranker: null });
    for (const t of [null, undefined, '', 'non json {', '[]', JSON.stringify({ schema: 'altro@1', reranker: { x: 1 } })]) {
        assert.doesNotThrow(() => VC.unisciQualita(t, nuovi));
        assert.deepStrictEqual(VC.unisciQualita(t, nuovi), nuovi, String(t));
    }
});

// ── 0082, revisione avversaria: le fonti coperte dall'indice, la generazione dei rapporti ──
const IDX = (voci) => JSON.stringify({ schema: 'mappai-fonti@1', fonti: voci });
const LUNGO = 'Un testo della fonte abbastanza lungo da avere il suo file di testo.';

test('0082 fontiCoperte: senza fonti in memoria è sempre vero', () => {
    assert.strictEqual(VC.fontiCoperte(null, []), true);
    assert.strictEqual(VC.fontiCoperte(null, null), true);
});

test('0082 M39 fontiCoperte: ogni fonte in memoria deve stare nell\'indice per id', () => {
    const fonti = [{ id: 's1', content: 'corto' }, { id: 's2', content: 'corto' }];
    assert.strictEqual(VC.fontiCoperte(IDX([{ id: 's1' }, { id: 's2' }]), fonti), true);
    assert.strictEqual(VC.fontiCoperte(IDX([{ id: 's1' }]), fonti), false, 's2 non c\'è: un «Aggiungi PDF» non scritto');
    assert.strictEqual(VC.fontiCoperte(IDX([]), fonti), false);
    assert.strictEqual(VC.fontiCoperte(null, fonti), false, 'nessun indice');
    assert.strictEqual(VC.fontiCoperte('non json', fonti), false);
    assert.strictEqual(VC.fontiCoperte(JSON.stringify({ fonti: 'x' }), fonti), false);
    assert.strictEqual(VC.fontiCoperte(IDX([{ id: '' }]), [{ content: 'senza id' }]), false, 'una fonte senza id non si può ritrovare');
});

test('0082 M40 fontiCoperte: una fonte col testo (oltre 40 caratteri) vuole il suo testoRel', () => {
    assert.strictEqual(VC.fontiCoperte(IDX([{ id: 's1', testoRel: '' }]), [{ id: 's1', content: LUNGO }]), false);
    assert.strictEqual(VC.fontiCoperte(IDX([{ id: 's1', testoRel: 'Fonti/s1.txt' }]), [{ id: 's1', content: LUNGO }]), true);
    assert.strictEqual(VC.fontiCoperte(IDX([{ id: 's1', testoRel: '' }]), [{ id: 's1', content: 'x'.repeat(40) }]), true, '40 o meno: il testo non si scrive');
});

test('0082 M41 unisciQualita: rapporti di un\'altra generazione non entrano', () => {
    const nuovi = { schema: 'mappai-qualita@2', quando: 'ora', generationId: 'g2', modello: 'm2', ancora: null, copertura: null, giudice: null, reranker: null };
    const u = VC.unisciQualita(JSON.stringify(QUAL), nuovi);
    assert.strictEqual(u.reranker, null);
    assert.strictEqual(u.ancora, null);
    assert.strictEqual(u.generationId, 'g2');
});

test('0082 M42 unisciQualita: senza generazione in memoria tiene quella (e il modello) del file', () => {
    const nuovi = { schema: 'mappai-qualita@2', quando: 'ora', generationId: undefined, modello: '', ancora: null, copertura: null, giudice: null, reranker: null };
    const u = VC.unisciQualita(JSON.stringify(QUAL), nuovi);
    assert.strictEqual(u.generationId, 'g1');
    assert.strictEqual(u.modello, 'm');
    assert.deepStrictEqual(u.reranker, { r: 1 });
    const stessa = VC.unisciQualita(JSON.stringify(QUAL), Object.assign({}, nuovi, { generationId: 'g1', modello: 'mio' }));
    assert.deepStrictEqual(stessa.reranker, { r: 1 }, 'stessa generazione: si uniscono');
    assert.strictEqual(stessa.modello, 'mio', 'il modello in memoria vince');
});
