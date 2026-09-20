'use strict';
/*
 * evidence-core.test.js — il core delle evidenze (passo 1 del piano Evidence).
 * Copre: i sei generi e il loro ordine, il tetto del pacchetto con gli scarti
 * contati, gli id stabili, i voti esterni, il filtro dell'àncora che regge
 * attraverso `lexical`, i casi vuoti, il blocco per il prompt, e il contratto
 * di local-search-core che qui si USA e non si tocca. Poi l'indice (passo 2)
 * e il materiale di un ramo per la pipeline (passo 3, §10).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');
const E = require(path.join(__dirname, '..', 'public', 'js', 'mappai-evidence-core.js'));
const LS = require(path.join(__dirname, '..', 'public', 'js', 'mappai-local-search-core.js'));

/* Copia di `statoBase()` di tests/local-search-core.test.js:20-33, arricchita
   di una riga-domanda e di una riga-didascalia, come chiede il packet.
   ⚠️ La didascalia è «Figura 1», non «Fig. 1»: lo splitter dell'àncora
   (mappai-deepen-core.js, splitSentences) spezza dopo ogni punto, quindi
   «Fig. 1 Il circuito…» diventa «Fig.» + «1 Il circuito…» e la coda passa il
   filtro come frase normale. La regola C di isStructuralLine è la stessa per
   le due forme; il limite sull'abbreviazione è documentato dal test `todo` più
   sotto. */
const DOMANDA = 'Perche la batteria si scalda a circuito chiuso?';
const DIDASCALIA = 'Figura 1 Il circuito chiuso con la batteria e la lampadina.';
const FRASI_BASE = [
    'Un circuito e chiuso quando la corrente puo percorrere tutto il tragitto dal ' +
    'generatore al ricevitore e tornare indietro senza interruzioni.',
    'Puo anche capitare che un circuito sia perfettamente chiuso e collegato a dovere, ' +
    'e tuttavia la batteria cominci a riscaldarsi in modo anomalo.',
    'La resistenza di un conduttore si misura in ohm e cresce con la lunghezza del filo.',
    DOMANDA,
    DIDASCALIA,
];
const FONTE = FRASI_BASE.join(' ');

const statoBase = (fonte = FONTE) => ({
    sources: [{ id: 'src-1', title: 'Elettricita.pdf', pages: [{ n: 4, text: fonte }] }],
    db: {
        nodes: [{ id: 'n1', label: 'Corto circuito', desc: 'La batteria si scalda quando la resistenza e troppo bassa.' }],
        links: [],
    },
});

/* Una fonte più lunga, per il tetto e per l'ordine: sei frasi in più che
   parlano tutte di «circuito», di lunghezza e genere diversi. */
const FRASI_EXTRA = [
    'Un circuito aperto interrompe il passaggio della corrente.',
    'Il circuito elettrico è un percorso chiuso di conduttori.',
    'Nel 1827 Ohm descrisse il circuito con la sua legge.',
    'Un fusibile protegge il circuito dal sovraccarico.',
    'La lampadina del circuito si accende quando la corrente passa nel filamento.',
    'Nel circuito in serie la stessa corrente attraversa ogni componente uno dopo l altro.',
];
const FONTE_LUNGA = FRASI_BASE.concat(FRASI_EXTRA).join(' ');
const statoLungo = (fonte = FONTE_LUNGA) => statoBase(fonte);
const records = stato => LS.snapshot(stato).records;

// ── 1. tipizza ─────────────────────────────────────────────────────────────

test('tipizza: un esempio per ciascuno dei sei generi', () => {
    const casi = {
        domanda: DOMANDA,
        consegna: 'Completa la tabella con i valori misurati.',
        didascalia: 'Fig. 1 Il circuito chiuso con la batteria e la lampadina.',
        definizione: 'La corrente elettrica è un flusso ordinato di cariche.',
        dato: 'Nel 1827 Ohm formulo la sua legge.',
        concetto: 'Un fusibile protegge il circuito dal sovraccarico.',
    };
    for (const [genere, text] of Object.entries(casi)) {
        assert.strictEqual(E.tipizza(text).genere, genere, `«${text}» doveva essere ${genere}`);
    }
});

test('tipizza: le forme alternative di ogni regola', () => {
    const casi = [
        ['1) Che cosa succede nel circuito', 'domanda'],          // stem numerato (regola B copiata)
        ['..........', 'consegna'],                                // riga di soli puntini (regola A copiata)
        ['completa la tabella dopo il due punti.', 'consegna'],   // minuscola, come dopo «Attività 3:»
        ['IL CIRCUITO ELETTRICO', 'didascalia'],                   // titolo tutto maiuscolo (regola D)
        ['Doc. 2 La lettera di Volta a Banks.', 'didascalia'],      // riferimento a documento (regola C)
        ['Figura 1 Il circuito chiuso.', 'didascalia'],
        ['La batteria si chiama anche pila.', 'definizione'],
        ['Le resistenze in serie sono attraversate dalla stessa corrente.', 'definizione'],
        ['Il 20% degli alunni ha sbagliato la misura.', 'dato'],   // «%» senza confine di parola dopo
        ['Il filo misura 2,5 m di lunghezza.', 'dato'],            // numero con unità
        ['La misura del 12/05/2026 dava tre ohm.', 'dato'],        // data
        ['Lo studente non sa perché il filo scalda.', 'concetto'], // «perché» non è « è »
        ['Il generatore spinge le cariche lungo il filo.', 'concetto'],
    ];
    for (const [text, genere] of casi) {
        assert.strictEqual(E.tipizza(text).genere, genere, `«${text}» doveva essere ${genere}`);
    }
});

test('tipizza: quando valgono due regole vince la prima (l ordine è documentato)', () => {
    // definizione (4) prima di dato (5): un anno dentro una definizione non la cambia
    assert.strictEqual(E.tipizza('La pila di Volta è una batteria inventata nel 1800.').genere, 'definizione');
    // domanda (1) prima di definizione (4)
    assert.strictEqual(E.tipizza('Che cosa è la corrente elettrica?').genere, 'domanda');
    // domanda (1) prima di consegna (2): lo stem numerato vince sul verbo
    assert.strictEqual(E.tipizza('2. Calcola la resistenza totale').genere, 'domanda');
    // consegna (2) prima di dato (5)
    assert.strictEqual(E.tipizza('Osserva la figura del 1800.').genere, 'consegna');
    // didascalia (3) prima di dato (5)
    assert.strictEqual(E.tipizza('Tab. 3 Le misure del 1827.').genere, 'didascalia');
});

test('tipizza: restituisce una copia con `genere` e non tocca l unità che entra', () => {
    const unita = { id: 'x', text: 'La corrente elettrica è un flusso di cariche.', page: 4 };
    const out = E.tipizza(unita);
    assert.notStrictEqual(out, unita);
    assert.deepStrictEqual(out, { ...unita, genere: 'definizione' });
    assert.strictEqual(unita.genere, undefined, 'l unità originale non deve cambiare');
    assert.deepStrictEqual(E.tipizza('Un fusibile protegge il circuito.'), { text: 'Un fusibile protegge il circuito.', genere: 'concetto' });
});

// ── 2. il tetto ────────────────────────────────────────────────────────────

test('costruisciPacchetto: il tetto per unità viene rispettato e `scartate` conta il resto', () => {
    const r = records(statoLungo());
    const tutte = E.costruisciPacchetto({ records: r, query: 'circuito', tetto: { unita: 20, caratteri: 100000 } });
    assert.ok(tutte.unita.length >= 5, `servono almeno 5 candidati per provare il tetto, trovati ${tutte.unita.length}`);
    assert.strictEqual(tutte.scartate, 0);

    const p = E.costruisciPacchetto({ records: r, query: 'circuito', tetto: { unita: 2, caratteri: 100000 } });
    assert.strictEqual(p.unita.length, 2);
    assert.strictEqual(p.scartate, tutte.unita.length - 2);
    assert.notStrictEqual(p.scartate, 0);
    assert.deepStrictEqual(p.unita.map(u => u.text), tutte.unita.slice(0, 2).map(u => u.text), 'le prime due nell ordine, non due a caso');
});

test('costruisciPacchetto: il tetto per caratteri viene rispettato, entrambi i limiti devono reggere', () => {
    const r = records(statoLungo());
    const tutte = E.costruisciPacchetto({ records: r, query: 'circuito', tetto: { unita: 20, caratteri: 100000 } });
    const caratteri = tutte.unita[0].text.length + tutte.unita[1].text.length;   // esattamente le prime due
    const p = E.costruisciPacchetto({ records: r, query: 'circuito', tetto: { unita: 20, caratteri } });
    assert.strictEqual(p.unita.length, 2);
    assert.strictEqual(p.unita.reduce((n, u) => n + u.text.length, 0), caratteri);
    assert.strictEqual(p.scartate, tutte.unita.length - 2);
    assert.notStrictEqual(p.scartate, 0);
    assert.strictEqual(p.punteggi.lessicali + p.punteggi.esterni, p.unita.length, 'i conteggi descrivono le unità tenute');
});

test('costruisciPacchetto: il tetto di default è 8 unità e 1600 caratteri', () => {
    const p = E.costruisciPacchetto({ records: records(statoLungo()), query: 'circuito' });
    assert.ok(p.unita.length <= 8);
    assert.ok(p.unita.reduce((n, u) => n + u.text.length, 0) <= 1600);
});

// ── 3. id stabili ──────────────────────────────────────────────────────────

test('id stabili: stessi record e stessa query danno gli stessi id in due costruzioni', () => {
    const a = E.costruisciPacchetto({ records: records(statoLungo()), query: 'circuito' });
    const b = E.costruisciPacchetto({ records: records(statoLungo()), query: 'circuito' });
    assert.ok(a.unita.length > 1);
    assert.deepStrictEqual(a.unita.map(u => u.id), b.unita.map(u => u.id));
    for (const u of a.unita) assert.match(u.id, /^ev-[0-9a-f]{16}-\d+$/, `forma dell id inattesa: ${u.id}`);
    assert.strictEqual(new Set(a.unita.map(u => u.id)).size, a.unita.length, 'due unità diverse non possono avere lo stesso id');
});

test('id stabili: una lettera cambiata in una frase cambia il suo id e solo il suo', () => {
    const prima = E.costruisciPacchetto({ records: records(statoLungo()), query: 'circuito', tetto: { unita: 20, caratteri: 100000 } });
    const bersaglio = 'Un fusibile protegge il circuito dal sovraccarico.';
    const modificata = 'Un fusibile protegge il circuito dal sovraccarica.';
    assert.ok(prima.unita.some(u => u.text === bersaglio), 'la frase bersaglio deve stare nel pacchetto');
    const dopo = E.costruisciPacchetto({ records: records(statoLungo(FONTE_LUNGA.replace(bersaglio, modificata))), query: 'circuito', tetto: { unita: 20, caratteri: 100000 } });
    const idPrima = new Map(prima.unita.map(u => [u.text, u.id]));
    const idDopo = new Map(dopo.unita.map(u => [u.text, u.id]));
    assert.ok(idDopo.has(modificata) && !idDopo.has(bersaglio));
    assert.notStrictEqual(idDopo.get(modificata), idPrima.get(bersaglio), 'testo diverso, id diverso');
    let confrontate = 0;
    for (const [text, id] of idPrima) {
        if (text === bersaglio) continue;
        assert.strictEqual(idDopo.get(text), id, `l id di «${text}» non doveva cambiare`);
        confrontate++;
    }
    assert.ok(confrontate >= 3, 'il confronto deve toccare le altre frasi, non essere vuoto');
});

// ── 4. punteggi esterni ────────────────────────────────────────────────────

test('punteggi: senza mappa l ordine è quello di BM25 e `punteggio` è scores.lexical', () => {
    const r = records(statoLungo());
    const attese = LS.lexical(r, 'circuito', 'evidence');
    const p = E.costruisciPacchetto({ records: r, query: 'circuito', tetto: { unita: 20, caratteri: 100000 } });
    assert.deepStrictEqual(p.unita.map(u => u.text), attese.map(h => h.text.trim()));
    assert.deepStrictEqual(p.unita.map(u => u.punteggio), attese.map(h => h.scores.lexical));
    assert.deepStrictEqual(p.punteggi, { lessicali: attese.length, esterni: 0 });
});

test('punteggi: con la mappa l ordine segue il voto e `punteggi.esterni` conta', () => {
    const r = records(statoLungo());
    const base = E.costruisciPacchetto({ records: r, query: 'circuito', tetto: { unita: 20, caratteri: 100000 } });
    const ultima = base.unita[base.unita.length - 1].text, prima = base.unita[0].text;
    const punteggi = { [ultima]: 0.9, [prima]: 0.1 };
    const p = E.costruisciPacchetto({ records: r, query: 'circuito', tetto: { unita: 20, caratteri: 100000 }, punteggi });
    assert.strictEqual(p.unita[0].text, ultima, 'il voto più alto va in testa anche se BM25 lo metteva in coda');
    assert.strictEqual(p.unita[0].punteggio, 0.9);
    assert.strictEqual(p.unita[1].text, prima);
    assert.strictEqual(p.unita[1].punteggio, 0.1);
    assert.deepStrictEqual(p.punteggi, { lessicali: base.unita.length - 2, esterni: 2 });
    // chi non ha voto resta dietro, nell ordine di BM25
    assert.deepStrictEqual(p.unita.slice(2).map(u => u.text), base.unita.slice(1, -1).map(u => u.text));
    assert.deepStrictEqual(p.unita.slice(2).map(u => u.punteggio), base.unita.slice(1, -1).map(u => u.punteggio));
});

// ── 5. il filtro dell'àncora regge attraverso lexical ──────────────────────

test('la riga-domanda e la riga-didascalia della fonte NON entrano nel pacchetto', () => {
    const p = E.costruisciPacchetto({ records: records(statoBase()), query: 'batteria circuito chiuso lampadina', tetto: { unita: 20, caratteri: 100000 } });
    assert.ok(p.unita.length, 'la query deve trovare qualcosa, o il test non prova niente');
    for (const u of p.unita) {
        assert.notStrictEqual(u.text, DOMANDA, 'una consegna non è una prova');
        assert.notStrictEqual(u.text, DIDASCALIA, 'una didascalia non è una prova');
        assert.ok(['concetto', 'definizione', 'dato'].includes(u.genere), `genere inatteso nel pacchetto: ${u.genere}`);
    }
    // ma tipizza, da sola, le riconosce: servono all'indice del passo 2
    assert.strictEqual(E.tipizza(DOMANDA).genere, 'domanda');
    assert.strictEqual(E.tipizza(DIDASCALIA).genere, 'didascalia');
    assert.strictEqual(E.tipizza('Fig. 1 Il circuito chiuso con la batteria e la lampadina.').genere, 'didascalia');
});

/* LIMITE A MONTE, MISURATO (19/9/2026): lo splitter dell'àncora
   (mappai-deepen-core.js, splitSentences) spezza dopo OGNI punto, quindi la
   didascalia abbreviata «Fig. 1 Il circuito…» diventa «Fig.» (frammento che
   cade da sé) + «1 Il circuito…», e quella coda passa il filtro come una frase
   qualunque: nel pacchetto entra decapitata, e tipizzata `concetto` perché
   nulla la distingue più da un fatto. Non si corregge qui (deepen-core e
   anchor-core sono fuori perimetro, e il filtro delle frasi ha UNA fonte).
   Se questo test diventa rosso, lo splitter ha imparato le abbreviazioni:
   toglierlo e mettere «Fig. 1» al posto di «Figura 1» nella fixture in testa. */
test('limite a monte: la didascalia abbreviata «Fig. 1 …» entra nel pacchetto decapitata', () => {
    const coda = 'Il circuito chiuso con la batteria e la lampadina.';
    const fonte = FRASI_BASE.slice(0, 4).concat(['Fig. 1 ' + coda]).join(' ');
    assert.strictEqual(E.tipizza('Fig. 1 ' + coda).genere, 'didascalia', 'intera, tipizza la riconosce');
    const p = E.costruisciPacchetto({ records: records(statoBase(fonte)), query: 'batteria circuito chiuso lampadina', tetto: { unita: 20, caratteri: 100000 } });
    const decapitata = p.unita.find(u => u.text === '1 ' + coda);
    assert.ok(decapitata, 'se la coda «1 Il circuito…» non entra più, lo splitter è stato corretto: aggiornare fixture e test come dice il commento sopra');
    assert.strictEqual(decapitata.genere, 'concetto');
    assert.ok(!p.unita.some(u => /^Fig\./.test(u.text)), 'la testa «Fig.» non sopravvive da sola');
});

// ── 6. i casi vuoti ────────────────────────────────────────────────────────

test('pacchetto vuoto: nessuna fonte, query vuota o input assente → unita: [], mai un eccezione', () => {
    const vuoto = query => ({ unita: [], query, punteggi: { lessicali: 0, esterni: 0 }, scartate: 0 });
    assert.deepStrictEqual(E.costruisciPacchetto({ records: [], query: 'circuito' }), vuoto('circuito'));
    assert.deepStrictEqual(E.costruisciPacchetto({ records: records(statoBase()), query: '' }), vuoto(''));
    assert.deepStrictEqual(E.costruisciPacchetto({ records: records(statoBase()), query: '   ' }), vuoto('   '));
    assert.deepStrictEqual(E.costruisciPacchetto({}), vuoto(''));
    assert.deepStrictEqual(E.costruisciPacchetto(), vuoto(''));
    assert.deepStrictEqual(E.costruisciPacchetto(null), vuoto(''));
    assert.deepStrictEqual(E.costruisciPacchetto({ records: 'non una lista', query: 'circuito' }), vuoto('circuito'));
    // solo materiali generati, nessun original|reference: un generato non prova se stesso
    const soloMappa = records({ ...statoBase(), sources: [] });
    assert.ok(soloMappa.length, 'la mappa deve produrre record generated');
    assert.deepStrictEqual(E.costruisciPacchetto({ records: soloMappa, query: 'corto circuito' }), vuoto('corto circuito'));
    // una query che non trova niente
    assert.deepStrictEqual(E.costruisciPacchetto({ records: records(statoBase()), query: 'fotosintesi clorofilliana' }), vuoto('fotosintesi clorofilliana'));
    // e il blocco per il prompt di un pacchetto vuoto è la stringa vuota
    assert.strictEqual(E.formattaPerPrompt(vuoto('circuito')), '');
    assert.strictEqual(E.formattaPerPrompt(), '');
    assert.strictEqual(E.formattaPerPrompt(null), '');
    assert.strictEqual(E.formattaPerPrompt({}), '');
});

// ── 7. formattaPerPrompt ───────────────────────────────────────────────────

test('formattaPerPrompt: una riga per unità, id [[ev-…]], pagina, titolo, genere e testo identico', () => {
    const p = E.costruisciPacchetto({ records: records(statoLungo()), query: 'corto circuito' });
    assert.ok(p.unita.length >= 2);
    const righe = E.formattaPerPrompt(p).split('\n');
    assert.strictEqual(righe.length, p.unita.length);
    righe.forEach((riga, i) => {
        const u = p.unita[i];
        const m = riga.match(/^\[\[(ev-[0-9a-f]{16}-\d+)\]\] \(p\. (\d+), (.+?) · (concetto|definizione|dato)\) (.*)$/);
        assert.ok(m, `riga fuori forma: ${riga}`);
        assert.strictEqual(m[1], u.id);
        assert.strictEqual(Number(m[2]), 4, 'la pagina è quella della fonte');
        assert.strictEqual(m[3], 'Elettricita.pdf');
        assert.strictEqual(m[4], u.genere);
        assert.strictEqual(m[5], u.text, 'il testo nel prompt è identico a quello dell unità');
        assert.ok(FONTE_LUNGA.includes(u.text), 'il testo viene dalla fonte, verbatim');
    });
});

test('formattaPerPrompt: con una fonte senza pagine la riga non inventa «p. 0»', () => {
    const r = records({ ...statoBase(), sources: [{ id: 'src-2', title: 'Appunti incollati', text: FONTE }] });
    const p = E.costruisciPacchetto({ records: r, query: 'corto circuito' });
    assert.ok(p.unita.length, 'la fonte senza pagine deve dare unità');
    for (const u of p.unita) assert.strictEqual(u.page, 0);
    for (const riga of E.formattaPerPrompt(p).split('\n')) {
        assert.match(riga, /^\[\[ev-[0-9a-f]{16}-\d+\]\] \(Appunti incollati · (concetto|definizione|dato)\) /);
        assert.ok(!riga.includes('p. 0'));
    }
});

test('le unità del pacchetto hanno i campi promessi e il testo è verbatim dalla fonte', () => {
    const p = E.costruisciPacchetto({ records: records(statoLungo()), query: 'circuito' });
    for (const u of p.unita) {
        assert.deepStrictEqual(Object.keys(u).sort(), ['genere', 'id', 'origin', 'page', 'punteggio', 'sourceId', 'text', 'title']);
        assert.strictEqual(u.origin, 'original');
        assert.strictEqual(u.sourceId, 'src-1');
        assert.strictEqual(u.title, 'Elettricita.pdf');
        assert.strictEqual(typeof u.punteggio, 'number');
        assert.ok(FONTE_LUNGA.includes(u.text), `testo ricomposto, non verbatim: «${u.text}»`);
        assert.strictEqual(u.text, u.text.trim());
    }
});

// ── 8. la suite di local-search-core: si lancia, non si tocca ──────────────

test('la suite di local-search-core continua a passare', () => {
    /* ⚠️ Il runner padre passa NODE_TEST_CONTEXT=child-v8 ai figli, e con quella
       variabile un `node --test` annidato non scrive NIENTE su stdout: lo status
       resterebbe 0 anche a suite muta. Si toglie, e si pretende il riepilogo. */
    const env = Object.assign({}, process.env);
    delete env.NODE_TEST_CONTEXT;
    const esito = spawnSync(process.execPath, ['--test', path.join(__dirname, 'local-search-core.test.js')], { encoding: 'utf8', env });
    assert.strictEqual(esito.status, 0, `local-search-core rossa:\n${esito.stdout}\n${esito.stderr}`);
    assert.match(esito.stdout, /^(ℹ|#) fail 0$/m, 'senza riepilogo non si sa se la suite ha girato davvero');
    assert.match(esito.stdout, /^(ℹ|#) pass [1-9]\d*$/m, 'la suite deve aver eseguito almeno un test');
});

// ── 9. l'indice delle evidenze (passo 2, docs/tasks/0002-evidence-indice.md) ──

/* Due fonti SENZA id, nella forma in cui pipeline.json le conserva (`nome` o
   `title` + `pages`): è il caso in cui il sourceId va derivato. `statoBase`
   ha invece `id: 'src-1'`, e serve al round-trip con snapshot() diretto. */
const fontiSenzaId = () => ([
    { nome: 'Elettricita.pdf', pages: [{ n: 4, text: FONTE }, { n: 5, text: FRASI_EXTRA.join(' ') }] },
    { title: 'Appunti.pdf', pages: [{ n: 1, text: 'Un fusibile protegge il circuito dal sovraccarico.' }] },
]);
const ID_FONTE = /^fonte-[0-9a-f]{16}-\d+$/;
const ID_EV = /^ev-[0-9a-f]{16}-\d+$/;
const LARGO = { unita: 20, caratteri: 100000 };

test('il core esporta le sei funzioni, nell ordine dei packet: materialeRamo ultima (passo 3)', () => {
    assert.deepStrictEqual(Object.keys(E), ['tipizza', 'costruisciPacchetto', 'formattaPerPrompt', 'costruisciIndice', 'indiceStantio', 'materialeRamo']);
});

test('indice 1: due fonti con pages → due fonti, record solo original|reference, sourceId derivato e uguale in due costruzioni', () => {
    const a = E.costruisciIndice(fontiSenzaId()), b = E.costruisciIndice(fontiSenzaId());
    assert.strictEqual(a.schema, 'mappai-evidenze@1');
    assert.strictEqual(a.fonti.length, 2);
    assert.strictEqual(a.records.length, 3, 'un record per pagina');
    for (const r of a.records) assert.ok(['original', 'reference'].includes(r.origin), `origin inatteso: ${r.origin}`);
    for (const f of a.fonti) assert.match(f.sourceId, ID_FONTE);
    assert.deepStrictEqual(a.fonti.map(f => f.sourceId), b.fonti.map(f => f.sourceId));
    assert.notStrictEqual(a.fonti[0].sourceId, a.fonti[1].sourceId);
    // la testa di ogni fonte descrive i suoi record
    a.fonti.forEach(f => {
        const suoi = a.records.filter(r => r.sourceId === f.sourceId);
        assert.strictEqual(f.pagine, suoi.length);
        assert.strictEqual(f.title, suoi[0].title);
        assert.ok(suoi.every(r => r.sourceRevision === f.sourceRevision));
        assert.match(f.sourceRevision, /^r1-[0-9a-f]{16}-\d+$/, 'la revisione è quella di snapshot()');
        assert.strictEqual(f.pdfHash, '');
    });
    assert.deepStrictEqual(a.fonti.map(f => f.title), ['Elettricita.pdf', 'Appunti.pdf']);
    assert.deepStrictEqual(a.records.map(r => r.page), [4, 5, 1]);
    for (const r of a.records) {
        assert.strictEqual(typeof r.text, 'string');
        assert.ok(r.textHash && r.sourceRevision && r.title && r.sourceId, 'i campi che costruisciPacchetto consuma');
    }
    // la diagnostica di snapshot() è riportata, non scartata: due PDF senza impronta
    assert.strictEqual(a.diagnostica.filter(d => d.code === 'legacy_pdf_identity_unverified').length, 2);
});

test('indice 2: il sourceId non dipende dalla posizione, e il pacchetto dai records dà gli stessi id ev-…', () => {
    const dritte = fontiSenzaId(), inverse = fontiSenzaId().reverse();
    const a = E.costruisciIndice(dritte), b = E.costruisciIndice(inverse);
    assert.deepStrictEqual(a.fonti.map(f => f.sourceId), b.fonti.map(f => f.sourceId).reverse(), 'le fonti seguono l ordine di ingresso, gli id no');
    const pa = E.costruisciPacchetto({ records: a.records, query: 'circuito', tetto: LARGO });
    const pb = E.costruisciPacchetto({ records: b.records, query: 'circuito', tetto: LARGO });
    assert.ok(pa.unita.length >= 3, `servono candidati da entrambe le fonti, trovati ${pa.unita.length}`);
    assert.deepStrictEqual(pa.unita.map(u => u.id).sort(), pb.unita.map(u => u.id).sort());
    for (const u of pa.unita) assert.match(u.id, ID_EV);
    // per contrasto: snapshot() diretto dà source-<posizione>, e gli id cambiano — è il motivo del passo 2
    const diretto = fonti => E.costruisciPacchetto({ records: LS.snapshot({ db: { nodes: [], links: [] }, sources: fonti }).records, query: 'circuito', tetto: LARGO });
    assert.notDeepStrictEqual(diretto(dritte).unita.map(u => u.id).sort(), diretto(inverse).unita.map(u => u.id).sort());
});

test('indice 3: sourceId dalla fonte se c è (sourceId, docId, id), altrimenti derivato; con pdfHash la base è l hash, non il testo', () => {
    const pagine = [{ n: 1, text: FONTE }];
    const i = E.costruisciIndice([
        { id: 'src-1', title: 'A', pages: pagine },
        { docId: 'doc-2', title: 'B', pages: pagine },
        { sourceId: 'S-3', id: 'ignorato', title: 'C', pages: pagine },
        { title: 'D', pages: pagine },
        'testo incollato senza niente',
    ]);
    assert.deepStrictEqual(i.fonti.slice(0, 3).map(f => f.sourceId), ['src-1', 'doc-2', 'S-3'], 'la stessa precedenza di snapshot()');
    assert.match(i.fonti[3].sourceId, ID_FONTE);
    assert.match(i.fonti[4].sourceId, ID_FONTE);
    assert.strictEqual(i.fonti[4].title, 'Documento');
    assert.strictEqual(i.records.find(r => r.sourceId === i.fonti[4].sourceId).page, 0, 'una stringa nuda è pagina 0, come per snapshot()');
    assert.strictEqual(new Set(i.fonti.map(f => f.sourceId)).size, 5);
    // con pdfHash: stesso hash e testo diverso → stesso id; la revisione invece segue le pagine
    const conHash = t => E.costruisciIndice([{ title: 'X.pdf', pdfHash: 'abc123', pages: [{ n: 1, text: t }] }]).fonti[0];
    assert.strictEqual(conHash(FONTE).sourceId, conHash(FONTE_LUNGA).sourceId);
    assert.notStrictEqual(conHash(FONTE).sourceRevision, conHash(FONTE_LUNGA).sourceRevision);
    assert.strictEqual(conHash(FONTE).pdfHash, 'abc123');
    // `hash` (la chiave che sourceSnapshot conserva) vale come `pdfHash`
    assert.strictEqual(E.costruisciIndice([{ title: 'X.pdf', hash: 'abc123', pages: [{ n: 1, text: FONTE }] }]).fonti[0].sourceId, conHash(FONTE).sourceId);
    // senza impronta: testo diverso → id diverso; titolo diverso → id diverso; e la base non è quella dell impronta
    const senza = (titolo, t) => E.costruisciIndice([{ title: titolo, pages: [{ n: 1, text: t }] }]).fonti[0].sourceId;
    assert.notStrictEqual(senza('X.pdf', FONTE), senza('X.pdf', FONTE_LUNGA));
    assert.notStrictEqual(senza('X.pdf', FONTE), senza('Y.pdf', FONTE));
    assert.notStrictEqual(senza('X.pdf', FONTE), conHash(FONTE).sourceId);
});

test('indice 4: generi conta le righe per genere, righe vuote saltate', () => {
    const testo = [
        'Perche la batteria si scalda a circuito chiuso?',         // domanda
        '',                                                        // saltata
        'Completa la tabella con i valori misurati.',             // consegna
        '   ',                                                     // saltata
        'Fig. 1 Il circuito chiuso con la batteria.',             // didascalia
        'La corrente elettrica è un flusso ordinato di cariche.', // definizione
        'Nel 1827 Ohm formulo la sua legge.',                     // dato
        'Un fusibile protegge il circuito dal sovraccarico.',     // concetto
        'Il generatore spinge le cariche lungo il filo.',         // concetto
    ].join('\n');
    const i = E.costruisciIndice([{ id: 'g', title: 'Scheda', pages: [{ n: 1, text: testo }] }]);
    assert.deepStrictEqual(i.fonti[0].generi, { domanda: 1, consegna: 1, didascalia: 1, definizione: 1, dato: 1, concetto: 2 });
    assert.strictEqual(Object.values(i.fonti[0].generi).reduce((a, b) => a + b, 0), 7, 'sette righe piene, due vuote');
    // una fonte senza pagine (testo incollato) si conta lo stesso, e i sei generi ci sono sempre
    assert.deepStrictEqual(E.costruisciIndice([{ id: 't', text: 'Completa.\n\nPerche?' }]).fonti[0].generi,
        { domanda: 1, consegna: 1, didascalia: 0, definizione: 0, dato: 0, concetto: 0 });
});

test('indice 5: indiceStantio — falso su fonti identiche; vero se cambia una lettera, una fonte in più o in meno, schema sconosciuto, null, stringa', () => {
    const fonti = fontiSenzaId();
    const indice = E.costruisciIndice(fonti);
    assert.strictEqual(E.indiceStantio(indice, fonti), false);
    assert.strictEqual(E.indiceStantio(JSON.parse(JSON.stringify(indice)), fontiSenzaId()), false, 'riletto dal disco, su fonti ricaricate');
    assert.strictEqual(E.indiceStantio(indice, fontiSenzaId().reverse()), false, 'l ordine delle fonti non conta');
    // una lettera cambiata in una pagina
    const toccate = fontiSenzaId();
    toccate[1].pages[0].text = toccate[1].pages[0].text.replace('fusibile', 'fusibila');
    assert.strictEqual(E.indiceStantio(indice, toccate), true);
    // una fonte in più / in meno
    assert.strictEqual(E.indiceStantio(indice, fontiSenzaId().concat([{ title: 'Terza', pages: [{ n: 1, text: 'Altro testo.' }] }])), true);
    assert.strictEqual(E.indiceStantio(indice, fontiSenzaId().slice(0, 1)), true);
    // schema sconosciuto, null, stringa, undefined, oggetto vuoto, senza record
    assert.strictEqual(E.indiceStantio({ ...indice, schema: 'mappai-evidenze@0' }, fonti), true);
    assert.strictEqual(E.indiceStantio(null, fonti), true);
    assert.strictEqual(E.indiceStantio('{"schema":"mappai-evidenze@1"}', fonti), true);
    assert.strictEqual(E.indiceStantio(undefined, fonti), true);
    assert.strictEqual(E.indiceStantio({}, fonti), true);
    assert.strictEqual(E.indiceStantio({ ...indice, records: undefined }, fonti), true, 'senza record non c è niente da leggere');
    // con un id proprio la firma segue la revisione delle pagine
    const conId = [{ id: 'src-1', title: 'A', pages: [{ n: 1, text: FONTE }] }];
    const ic = E.costruisciIndice(conId);
    assert.strictEqual(E.indiceStantio(ic, conId), false);
    assert.strictEqual(E.indiceStantio(ic, [{ id: 'src-1', title: 'A', pages: [{ n: 1, text: FONTE + ' Altro.' }] }]), true);
});

test('indice 6: le fonti passate non vengono mutate', () => {
    const fonti = fontiSenzaId().concat(['testo nudo'], [{ id: 'src-1', title: 'A', pages: [{ n: 1, text: FONTE }] }]);
    const prima = JSON.parse(JSON.stringify(fonti));
    const i = E.costruisciIndice(fonti);
    E.indiceStantio(i, fonti);
    E.costruisciPacchetto({ records: i.records, query: 'circuito' });
    assert.deepStrictEqual(fonti, prima);
    assert.strictEqual(fonti[0].sourceId, undefined, 'il sourceId derivato sta sulla copia, non sulla fonte');
    assert.ok(i.records.every(r => !fonti.some(f => f && f.pages && f.pages.includes(r))), 'nessun record è un oggetto della fonte');
});

test('indice 7: creato iniettabile con opts.adesso; JSON.stringify/parse restituisce un indice identico', () => {
    const i = E.costruisciIndice(fontiSenzaId(), { adesso: '2026-09-20T10:00:00.000Z' });
    assert.strictEqual(i.creato, '2026-09-20T10:00:00.000Z');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(i)), i, 'niente undefined, NaN o funzioni dentro');
    assert.deepStrictEqual(Object.keys(i), ['schema', 'creato', 'fonti', 'records', 'diagnostica']);
    assert.deepStrictEqual(Object.keys(i.fonti[0]), ['sourceId', 'title', 'sourceRevision', 'pdfHash', 'pagine', 'generi']);
    const senza = E.costruisciIndice(fontiSenzaId());
    assert.strictEqual(new Date(senza.creato).toISOString(), senza.creato, 'senza opts, creato è una data ISO');
    // due costruzioni con lo stesso `adesso` sono identiche: nulla dipende dal caso
    assert.deepStrictEqual(E.costruisciIndice(fontiSenzaId(), { adesso: 'x' }), E.costruisciIndice(fontiSenzaId(), { adesso: 'x' }));
});

test('indice 8: fonti vuote, undefined, null, stringa nuda → fonti: [] e records: [], mai un eccezione', () => {
    for (const x of [[], undefined, null, 'testo nudo fuori da una lista', {}, 42]) {
        const i = E.costruisciIndice(x, { adesso: 'x' });
        assert.deepStrictEqual({ schema: i.schema, fonti: i.fonti, records: i.records }, { schema: 'mappai-evidenze@1', fonti: [], records: [] }, `input ${JSON.stringify(x)}`);
        assert.ok(Array.isArray(i.diagnostica));
        assert.strictEqual(E.indiceStantio(i, x), false, 'un indice vuoto su fonti vuote non è stantio');
    }
    // elementi non validi dentro la lista: saltati e dichiarati, gli altri restano
    const i = E.costruisciIndice([null, undefined, 42, { id: 'src-1', title: 'A', pages: [{ n: 1, text: FONTE }] }]);
    assert.strictEqual(i.fonti.length, 1);
    assert.strictEqual(i.records.length, 1);
    assert.deepStrictEqual(i.diagnostica.filter(d => d.code === 'fonte_non_valida').map(d => d.posizione), [0, 1, 2]);
    // pagine senza testo: nessun record, ma la fonte resta in testa con 0 pagine
    const v = E.costruisciIndice([{ id: 'v', title: 'Vuota.pdf', pages: [{ n: 1, text: '' }] }]);
    assert.strictEqual(v.fonti[0].pagine, 0);
    assert.strictEqual(v.fonti[0].sourceRevision, '');
    assert.strictEqual(v.fonti[0].title, 'Vuota.pdf');
    assert.strictEqual(v.records.length, 0);
    assert.ok(v.diagnostica.some(d => d.code === 'empty_page'));
});

test('indice 9: round-trip — il pacchetto dai records dell indice ha gli stessi id di quello dai record di snapshot() diretti', () => {
    const stato = statoLungo();   // la fonte ha `id: 'src-1'`: snapshot() e indice concordano sul sourceId
    const dallIndice = E.costruisciPacchetto({ records: E.costruisciIndice(stato.sources).records, query: 'circuito' });
    const diretto = E.costruisciPacchetto({ records: records(stato), query: 'circuito' });
    assert.ok(dallIndice.unita.length >= 2);
    assert.deepStrictEqual(dallIndice.unita.map(u => u.id), diretto.unita.map(u => u.id));
    assert.deepStrictEqual(dallIndice, diretto, 'stesse unità, stesso ordine, stessi campi');
    // e attraverso il disco: dal JSON riletto, gli stessi id
    const riletto = JSON.parse(JSON.stringify(E.costruisciIndice(stato.sources)));
    assert.deepStrictEqual(E.costruisciPacchetto({ records: riletto.records, query: 'circuito' }), diretto);
});

// ── 10. il materiale di un ramo (passo 3, docs/tasks/0003-evidence-materiale-ramo.md) ──

/* Il pacchetto come lo costruisce la cucitura per un ramo: il tetto di
   TETTO_RAMO (16 unità, 12.000 caratteri), nessun voto esterno. */
const pacchettoRamo = () => E.costruisciPacchetto({ records: records(statoLungo()), query: 'circuito', tetto: { unita: 16, caratteri: 12000 } });
const NODI = [
    { label: 'Il circuito', desc: 'Un percorso chiuso per la corrente.' },
    { label: 'Fusibile', desc: '' },
    { label: 'Legge di Ohm', desc: 'La resistenza lega tensione e corrente.' },
];
const INTESTAZIONE = 'EVIDENZE DALLA FONTE (frasi verbatim, con pagina e id):';

test('materialeRamo 1: formato — AREA, CONCETTI DEL RAMO con « · », l intestazione, poi le righe di formattaPerPrompt identiche', () => {
    const p = pacchettoRamo();
    assert.ok(p.unita.length >= 3, `servono unità per provare il formato, trovate ${p.unita.length}`);
    const r = E.materialeRamo({ area: 'Il circuito', nodi: NODI, pacchetto: p });
    const righe = r.materiale.split('\n');
    assert.strictEqual(righe[0], 'AREA: Il circuito');
    assert.strictEqual(righe[1], 'CONCETTI DEL RAMO: Il circuito · Fusibile · Legge di Ohm');
    assert.strictEqual(righe[2], '', 'una riga vuota separa la struttura dalle evidenze');
    assert.strictEqual(righe[3], INTESTAZIONE);
    assert.deepStrictEqual(righe.slice(4), E.formattaPerPrompt(p).split('\n'), 'l ultimo blocco è formattaPerPrompt, riga per riga');
    assert.strictEqual(r.materiale, ['AREA: Il circuito', 'CONCETTI DEL RAMO: Il circuito · Fusibile · Legge di Ohm', '', INTESTAZIONE, E.formattaPerPrompt(p)].join('\n'));
    assert.ok(!/istruzion|rispondi|genera/i.test(r.materiale.split('\n').slice(0, 4).join('\n')), 'nessuna istruzione al modello dentro il materiale');
});

test('materialeRamo 2: conDesc → una riga `label: desc` per nodo, desc vuota → sola etichetta; di default nessuna desc nel testo', () => {
    const p = pacchettoRamo();
    const senza = E.materialeRamo({ area: 'Il circuito', nodi: NODI, pacchetto: p });
    assert.ok(!senza.materiale.includes('Un percorso chiuso per la corrente.'), 'di default la desc NON entra (invariante 22)');
    assert.ok(!senza.materiale.includes('La resistenza lega tensione e corrente.'));
    const con = E.materialeRamo({ area: 'Il circuito', nodi: NODI, pacchetto: p, conDesc: true });
    const righe = con.materiale.split('\n');
    assert.strictEqual(righe[0], 'AREA: Il circuito');
    assert.strictEqual(righe[1], 'CONCETTI DEL RAMO:');
    assert.strictEqual(righe[2], 'Il circuito: Un percorso chiuso per la corrente.');
    assert.strictEqual(righe[3], 'Fusibile', 'desc vuota → sola etichetta, senza i due punti');
    assert.strictEqual(righe[4], 'Legge di Ohm: La resistenza lega tensione e corrente.');
    assert.strictEqual(righe[5], '');
    assert.strictEqual(righe[6], INTESTAZIONE);
    assert.deepStrictEqual(righe.slice(7), E.formattaPerPrompt(p).split('\n'));
    assert.strictEqual(E.materialeRamo({ area: 'Il circuito', nodi: NODI, pacchetto: p, conDesc: false }).materiale, senza.materiale, 'conDesc falso esplicito = default');
    // la desc è una riga sola anche con spazi attorno: si toglie il contorno, non il contenuto
    const spazi = E.materialeRamo({ area: 'A', nodi: [{ label: '  Fusibile  ', desc: '  protegge  ' }], pacchetto: p, conDesc: true });
    assert.strictEqual(spazi.materiale.split('\n')[2], 'Fusibile: protegge');
});

test('materialeRamo 3: etichette vuote saltate (vuota, spazi, null, nodo non oggetto); senza etichette la riga dei concetti manca', () => {
    const p = pacchettoRamo();
    const nodi = [{ label: 'Il circuito', desc: 'x' }, { label: '', desc: 'y' }, { label: '   ' }, { label: null }, null, 'stringa', 42, { label: 'Fusibile' }];
    const r = E.materialeRamo({ area: 'Il circuito', nodi, pacchetto: p });
    assert.strictEqual(r.materiale.split('\n')[1], 'CONCETTI DEL RAMO: Il circuito · Fusibile');
    const con = E.materialeRamo({ area: 'Il circuito', nodi, pacchetto: p, conDesc: true });
    assert.deepStrictEqual(con.materiale.split('\n').slice(1, 5), ['CONCETTI DEL RAMO:', 'Il circuito: x', 'Fusibile', ''], 'la desc «y» di un nodo senza etichetta non entra');
    assert.ok(!con.materiale.includes('y'), 'nemmeno altrove');
    // nessuna etichetta → niente riga dei concetti, il resto uguale
    const nessuna = E.materialeRamo({ area: 'Il circuito', nodi: [{ label: '' }, null], pacchetto: p });
    assert.deepStrictEqual(nessuna.materiale.split('\n').slice(0, 3), ['AREA: Il circuito', '', INTESTAZIONE]);
    assert.strictEqual(E.materialeRamo({ area: 'Il circuito', pacchetto: p }).materiale, nessuna.materiale, 'nodi assenti = nessuna etichetta');
    assert.strictEqual(E.materialeRamo({ area: 'Il circuito', nodi: 'non una lista', pacchetto: p }).materiale, nessuna.materiale);
    // l area si ripulisce del contorno; area assente → «AREA: » e basta, mai un eccezione
    assert.strictEqual(E.materialeRamo({ area: '  Il circuito ', nodi: NODI, pacchetto: p }).materiale.split('\n')[0], 'AREA: Il circuito');
    assert.strictEqual(E.materialeRamo({ nodi: NODI, pacchetto: p }).materiale.split('\n')[0], 'AREA: ');
});

test('materialeRamo 4: pacchetto vuoto o assente → materiale vuoto, unita 0, scartate riportate, mai un eccezione', () => {
    const vuoto = { materiale: '', unita: 0, scartate: 0, caratteri: 0 };
    assert.deepStrictEqual(E.materialeRamo({ area: 'x', nodi: NODI, pacchetto: E.costruisciPacchetto({ records: [], query: 'circuito' }) }), vuoto);
    assert.deepStrictEqual(E.materialeRamo({ area: 'x', nodi: NODI, pacchetto: { unita: [] } }), vuoto);
    assert.deepStrictEqual(E.materialeRamo({ area: 'x', nodi: NODI, pacchetto: { unita: [], scartate: 5 } }), { ...vuoto, scartate: 5 }, 'gli scarti si riportano anche a pacchetto vuoto');
    assert.deepStrictEqual(E.materialeRamo({ area: 'x', nodi: NODI }), vuoto);
    assert.deepStrictEqual(E.materialeRamo({ area: 'x', nodi: NODI, pacchetto: null }), vuoto);
    assert.deepStrictEqual(E.materialeRamo({ area: 'x', nodi: NODI, pacchetto: 'non un pacchetto' }), vuoto);
    assert.deepStrictEqual(E.materialeRamo({ area: 'x', nodi: NODI, pacchetto: { unita: 'non una lista', scartate: 2 } }), { ...vuoto, scartate: 2 });
    assert.deepStrictEqual(E.materialeRamo({ area: 'x', nodi: NODI, pacchetto: { unita: [], scartate: 'tre' } }), vuoto, 'scarti non numerici → 0');
    assert.deepStrictEqual(E.materialeRamo({}), vuoto);
    assert.deepStrictEqual(E.materialeRamo(), vuoto);
    assert.deepStrictEqual(E.materialeRamo(null), vuoto);
    assert.deepStrictEqual(E.materialeRamo('x'), vuoto);
    // un tetto che non lascia entrare nulla: pacchetto vuoto CON scarti, e il materiale li riporta
    const p0 = E.costruisciPacchetto({ records: records(statoLungo()), query: 'circuito', tetto: { unita: 20, caratteri: 1 } });
    assert.strictEqual(p0.unita.length, 0);
    assert.ok(p0.scartate > 0, 'il tetto deve aver scartato qualcosa, o il caso non prova niente');
    assert.deepStrictEqual(E.materialeRamo({ area: 'x', nodi: NODI, pacchetto: p0 }), { ...vuoto, scartate: p0.scartate });
});

test('materialeRamo 5: unita, scartate e caratteri coerenti col pacchetto e col testo', () => {
    const r = records(statoLungo());
    const tutte = E.costruisciPacchetto({ records: r, query: 'circuito', tetto: { unita: 20, caratteri: 100000 } });
    const p = E.costruisciPacchetto({ records: r, query: 'circuito', tetto: { unita: 3, caratteri: 100000 } });
    assert.strictEqual(p.unita.length, 3);
    assert.strictEqual(p.scartate, tutte.unita.length - 3);
    assert.ok(p.scartate > 0);
    const m = E.materialeRamo({ area: 'Il circuito', nodi: NODI, pacchetto: p });
    assert.deepStrictEqual(Object.keys(m), ['materiale', 'unita', 'scartate', 'caratteri']);
    assert.strictEqual(m.unita, 3, 'unita = pacchetto.unita.length');
    assert.strictEqual(m.scartate, p.scartate, 'scartate = pacchetto.scartate');
    assert.strictEqual(m.caratteri, m.materiale.length, 'caratteri = materiale.length');
    assert.strictEqual(m.materiale.split('\n').length, 4 + 3, 'tre righe di evidenze dopo le quattro di testa');
    // conDesc allunga il testo e `caratteri` lo segue; le unità no
    const c = E.materialeRamo({ area: 'Il circuito', nodi: NODI, pacchetto: p, conDesc: true });
    assert.ok(c.caratteri > m.caratteri);
    assert.strictEqual(c.caratteri, c.materiale.length);
    assert.strictEqual(c.unita, m.unita);
    assert.strictEqual(c.scartate, m.scartate);
    // col tetto della cucitura (16 / 12.000) su questa fonte nulla si scarta
    const largo = E.materialeRamo({ area: 'Il circuito', nodi: NODI, pacchetto: pacchettoRamo() });
    assert.strictEqual(largo.unita, tutte.unita.length);
    assert.strictEqual(largo.scartate, 0);
});

test('materialeRamo 6: il testo di ogni unità compare identico, con il suo [[ev-…]]; il pacchetto che entra non si tocca', () => {
    const p = pacchettoRamo();
    const m = E.materialeRamo({ area: 'Il circuito', nodi: NODI, pacchetto: p });
    const righe = m.materiale.split('\n');
    for (const u of p.unita) {
        assert.match(u.id, ID_EV);
        const riga = righe.find(x => x.startsWith('[[' + u.id + ']] '));
        assert.ok(riga, `manca la riga di ${u.id}`);
        assert.ok(riga.endsWith(') ' + u.text), `il testo di ${u.id} non è identico: «${riga}»`);
        assert.ok(FONTE_LUNGA.includes(u.text), 'e viene dalla fonte, verbatim');
        assert.ok(riga.includes('(p. 4, Elettricita.pdf · ' + u.genere + ')'), 'pagina, titolo e genere come in formattaPerPrompt');
    }
    assert.strictEqual((m.materiale.match(/\[\[ev-/g) || []).length, p.unita.length, 'un id per unità, né più né meno');
    const prima = JSON.parse(JSON.stringify(p));
    E.materialeRamo({ area: 'Il circuito', nodi: NODI, pacchetto: p, conDesc: true });
    assert.deepStrictEqual(p, prima, 'materialeRamo legge il pacchetto, non lo modifica');
});
