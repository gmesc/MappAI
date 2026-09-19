'use strict';
/*
 * evidence-core.test.js — il core delle evidenze (passo 1 del piano Evidence).
 * Copre: i sei generi e il loro ordine, il tetto del pacchetto con gli scarti
 * contati, gli id stabili, i voti esterni, il filtro dell'àncora che regge
 * attraverso `lexical`, i casi vuoti, il blocco per il prompt, e il contratto
 * di local-search-core che qui si USA e non si tocca.
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
