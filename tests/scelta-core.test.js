/* Il core delle attività «a scelta»: che cosa entra nel mucchio, in che ordine
   lo vede uno studente, quando si consegna, che profilo ne esce.
   Le prove sono scritte sui casi VERI del vault: fogli generati uno per angolo,
   fogli vecchi che l'angolo ce l'hanno solo nel nome, e la stessa domanda uscita
   in due tagli diversi. */
const test = require('node:test');
const assert = require('node:assert');
const S = require('../public/js/mappai-scelta-core.js');

/* Due fogli sulla stessa mappa: la seconda domanda è la STESSA, scritta in due
   modi (l'apostrofo). È il caso che la dedup deve prendere. */
const FOGLI = [
    {
        titolo: 'Domande-aperte-Il Clima-causa', angle: 'causa', tipo: 'open', items: [
            { question: 'Perché la pressione fa muovere l\'aria?', ramo: 'Atmosfera', livello: 'base' },
            { question: 'Che cos\'è il clima?', ramo: 'Basi', livello: 'base' }
        ]
    },
    {
        titolo: 'Domande-aperte-Il Clima-definizione', angle: 'definizione', tipo: 'open', items: [
            { question: 'Che cos è il clima?', ramo: 'Basi' },
            { question: 'Definisci il monsone', ramo: 'Venti', livello: 'ponte' }
        ]
    },
    {
        /* un foglio VECCHIO: l'angolo non è nella sorgente, sta nel nome; e gli
           item non dichiarano il ramo (la pipeline lo scrive solo dal 19/8) */
        titolo: 'Domande-aperte-Il Clima-eccezione', tipo: 'open', items: [
            { question: 'Quando la regola del vento non vale?' }
        ]
    }
];

test('poolDaFogli: una voce per domanda, con angolo · ramo · livello', () => {
    const pool = S.poolDaFogli(FOGLI);
    assert.strictEqual(pool.length, 4, 'cinque domande meno il doppione');
    assert.deepStrictEqual(pool.map(v => v.angle), ['causa', 'causa', 'definizione', 'eccezione']);
    assert.strictEqual(pool[2].ramo, 'Venti');
    assert.strictEqual(pool[3].ramo, '', 'il foglio vecchio non sa il ramo, e lo dice');
    assert.strictEqual(pool[3].angle, 'eccezione', 'l\'angolo del foglio vecchio viene dal NOME');
    assert.strictEqual(pool[2].livello, 'ponte');
    assert.strictEqual(pool[3].livello, 'ponte', 'senza livello dichiarato vale il caso prudente');
});

test('poolDaFogli: la stessa domanda in due angoli entra UNA volta, e ricorda l\'altro', () => {
    const pool = S.poolDaFogli(FOGLI);
    const clima = pool.filter(v => /cos.*il clima/i.test(v.testo));
    assert.strictEqual(clima.length, 1, 'l\'apostrofo non fa due domande diverse');
    assert.strictEqual(clima[0].angle, 'causa', 'vince il primo foglio');
    assert.deepStrictEqual(clima[0].anche, ['definizione'], 'l\'altro taglio non si perde');
});

test('poolDaFogli: gli id sono stabili — è quello che fa ritrovare le risposte al rientro', () => {
    const a = S.poolDaFogli(FOGLI).map(v => v.id);
    const b = S.poolDaFogli(FOGLI).map(v => v.id);
    assert.deepStrictEqual(a, b);
    assert.strictEqual(new Set(a).size, a.length, 'e sono distinti');
});

test('angoloDalTitolo: dal nome del file, «misto» vale auto, e niente non si inventa', () => {
    assert.strictEqual(S.angoloDalTitolo('Domande-aperte-Il Clima-causa'), 'causa');
    assert.strictEqual(S.angoloDalTitolo('Quiz-MC-Il Clima-eccezione'), 'eccezione');
    assert.strictEqual(S.angoloDalTitolo('Domande aperte · misto'), 'auto');
    assert.strictEqual(S.angoloDalTitolo('Verifica di ottobre'), '', 'un titolo senza angolo non ne prende uno a caso');
    assert.strictEqual(S.angoloDalTitolo('Domande-aperte-Clima-causa-verifica ottobre'), 'causa',
        'il nome della copia sta in coda: si legge l\'ultimo angolo riconosciuto');
});

test('pubblico: al telefono non arrivano né l\'angolo né la soluzione', () => {
    const pool = S.poolDaFogli([{
        titolo: 'Quiz-MC-Clima-causa', angle: 'causa', tipo: 'mc',
        items: [{ q: 'Perché piove?', options: ['A', 'B', 'C'], correctIndex: 1, ramo: 'Atmosfera' }]
    }]);
    assert.strictEqual(pool[0].giusta, 1, 'in locale la soluzione c\'è: l\'app corregge da sé');
    const p = S.pubblico(pool)[0];
    assert.ok(!('angle' in p) && !('giusta' in p) && !('foglio' in p),
        'nel pacchetto pubblico l\'angolo non c\'è per costruzione, come le soluzioni in Live');
    assert.deepStrictEqual(p.opzioni, ['A', 'B', 'C'], 'le opzioni sì: servono a rispondere');
});

test('mescola: stesso seme = stesso ordine, semi diversi = ordini diversi', () => {
    const pool = S.poolDaFogli(FOGLI);
    const a = S.mescola(pool, 'volpe-03').map(v => v.id);
    const b = S.mescola(pool, 'volpe-03').map(v => v.id);
    const c = S.mescola(pool, 'riccio-07').map(v => v.id);
    assert.deepStrictEqual(a, b, 'al rientro la domanda che stavo scrivendo è dov\'era');
    assert.notDeepStrictEqual(a, c, 'due studenti non vedono lo stesso ordine');
    assert.deepStrictEqual(a.slice().sort(), pool.map(v => v.id).sort(), 'non si perde né si duplica niente');
});

test('perRamo: i gruppi nell\'ordine della mappa, e quello senza nome IN CODA', () => {
    const g = S.perRamo(S.poolDaFogli(FOGLI));
    assert.deepStrictEqual(g.map(x => x.ramo), ['Atmosfera', 'Basi', 'Venti', '']);
    assert.strictEqual(g[3].domande.length, 1, 'le domande dei fogli vecchi stanno insieme, in fondo');
});

/* Uno studente che ha preso tre domande: due scritte, una lasciata a metà. */
const STATO = {
    risposte: {},
    note: 'ho preso quelle di cui mi ricordavo qualcosa'
};

test('conteggio e consegna: scelte ≠ scritte, e il minimo si dice invece di vietare', () => {
    const pool = S.poolDaFogli(FOGLI);
    const st = { risposte: {} };
    st.risposte[pool[0].id] = { testo: 'Perché l\'aria va dove la pressione è minore' };
    st.risposte[pool[1].id] = { testo: '' };      /* presa e lasciata */
    const n = S.conteggio(pool, st);
    assert.deepStrictEqual(n, { scelte: 2, scritte: 1, totale: 4, lette: 0, spente: 0 },
        'nessun giudizio di richiamo dato: le due colonne nuove restano a zero');

    const v = S.validaConsegna(pool, st, { minimo: 3 });
    assert.strictEqual(v.ok, false);
    assert.deepStrictEqual(v.motivi.map(m => m.id), ['sotto_minimo', 'scelte_vuote']);
    assert.strictEqual(v.motivi[0].quante, 2, 'ne mancano due, e lo dice in numeri');

    st.risposte[pool[1].id].testo = 'Il tempo che fa di solito';
    st.risposte[pool[2].id] = { testo: 'Un vento che cambia con le stagioni' };
    assert.strictEqual(S.validaConsegna(pool, st, { minimo: 3 }).ok, true);
});

test('validaConsegna: una risposta a scelta multipla conta come scritta', () => {
    const pool = S.poolDaFogli([{
        titolo: 'Quiz-MC-Clima-causa', tipo: 'mc',
        items: [{ q: 'Perché piove?', options: ['A', 'B'], correctIndex: 0 }]
    }]);
    const st = { risposte: {} };
    st.risposte[pool[0].id] = { scelta: 0 };
    assert.strictEqual(S.conteggio(pool, st).scritte, 1, 'la scelta 0 è una risposta, non un campo vuoto');
});

test('profilo: che cosa ho scelto senza saperlo — per angolo, coi chip', () => {
    const pool = S.poolDaFogli(FOGLI);
    const st = { risposte: {}, letture: {} };
    st.risposte[pool[0].id] = { testo: 'x' };                      /* causa */
    st.letture[pool[0].id] = { chip: 'subito' };
    st.risposte[pool[1].id] = { testo: 'y' };                      /* causa */
    st.letture[pool[1].id] = { chip: 'subito' };
    st.risposte[pool[2].id] = { testo: '' };                       /* definizione, non scritta */
    st.letture[pool[2].id] = { chip: 'partenza' };
    const p = S.profilo(pool, st);

    const causa = p.righe.filter(r => r.angle === 'causa')[0];
    assert.deepStrictEqual(
        { totale: causa.totale, scelte: causa.scelte, scritte: causa.scritte, evitate: causa.evitate },
        { totale: 2, scelte: 2, scritte: 2, evitate: 0 });
    assert.strictEqual(causa.chip.subito, 2, 'i chip si contano per angolo');
    assert.strictEqual(p.preferito, 'causa');
    assert.deepStrictEqual(p.maiPresi, ['eccezione'], 'l\'angolo che non ha voluto: è la frase che si dice');
    const def = p.righe.filter(r => r.angle === 'definizione')[0];
    assert.strictEqual(def.scelte, 1);
    assert.strictEqual(def.scritte, 0, 'presa non vuol dire risposta');
});

test('profilo: le domande senza angolo noto restano una voce a sé', () => {
    const pool = S.poolDaFogli([{ titolo: 'Verifica di ottobre', tipo: 'open', items: [{ question: 'Domanda' }] }]);
    const p = S.profilo(pool, { risposte: {} });
    assert.deepStrictEqual(p.righe.map(r => r.angle), [''],
        'meglio dire «non lo so» che spalmarle su un angolo indovinato');
});

test('evitata: si pesca dall\'angolo meno scelto, e null se ha preso tutto', () => {
    const pool = S.poolDaFogli(FOGLI);
    const st = { risposte: {} };
    st.risposte[pool[0].id] = { testo: 'x' };
    st.risposte[pool[1].id] = { testo: 'y' };   /* causa: 2 scelte */
    const e = S.evitata(pool, st, 'volpe-03');
    assert.ok(e && ['definizione', 'eccezione'].indexOf(e.angle) >= 0,
        'non pesca fra le causa, che sono l\'angolo già scelto');
    const e2 = S.evitata(pool, st, 'volpe-03');
    assert.strictEqual(e.id, e2.id, 'a parità decide il seme: la stessa domanda al rientro');

    const tutto = { risposte: {} };
    pool.forEach(v => { tutto.risposte[v.id] = { testo: 'x' }; });
    assert.strictEqual(S.evitata(pool, tutto, 'volpe-03'), null, 'chi ha preso tutto non ha evitato niente');
});

test('calorClasse: quanti allievi hanno evitato del tutto un angolo', () => {
    const pool = S.poolDaFogli(FOGLI);
    const a = { risposte: {} }; a.risposte[pool[0].id] = { testo: 'x' };   /* solo causa */
    const b = { risposte: {} }; b.risposte[pool[1].id] = { testo: 'y' };   /* solo causa */
    const c = { risposte: {} }; c.risposte[pool[2].id] = { testo: 'z' };   /* definizione */
    const cal = S.calorClasse(pool, [a, b, c]);
    const per = {}; cal.forEach(r => { per[r.angle] = r; });
    assert.strictEqual(per['eccezione'].evitatoDa, 3, 'nessuno ha voluto le eccezioni: è la riga che parla al docente');
    assert.strictEqual(per['causa'].evitatoDa, 1);
    assert.strictEqual(cal[0].angle, 'eccezione', 'in cima quello evitato da più allievi');
});

test('normalizzaCfg: i default sono quelli, e i valori sporchi non passano', () => {
    assert.deepStrictEqual(S.normalizzaCfg(), S.CFG_DEFAULT);
    const c = S.normalizzaCfg({ minimo: '7', perche_no: 1, reveal: 0, secondo_giro: 'sì' });
    assert.strictEqual(c.minimo, 7);
    assert.strictEqual(c.perche_no, true);
    assert.strictEqual(c.reveal, false);
    assert.strictEqual(c.secondo_giro, true);
    assert.strictEqual(S.normalizzaCfg({ minimo: 999 }).minimo, 50, 'un minimo più alto di ogni pool sarebbe un blocco');
    assert.strictEqual(S.normalizzaCfg({ minimo: -3 }).minimo, 0);
});

test('il pool vuoto non fa esplodere niente', () => {
    assert.deepStrictEqual(S.poolDaFogli(), []);
    assert.deepStrictEqual(S.perRamo([]), []);
    assert.deepStrictEqual(S.conteggio([], {}), { scelte: 0, scritte: 0, totale: 0, lette: 0, spente: 0 });
    assert.strictEqual(S.evitata([], {}, 's'), null);
    assert.deepStrictEqual(S.calorClasse([], []), []);
    assert.deepStrictEqual(S.calorAree([], []), []);
    assert.deepStrictEqual(S.aree([]), []);
    assert.strictEqual(S.passiUtili([]), false);
    assert.deepStrictEqual(S.unaPerAngolo([], 's'), []);
    assert.strictEqual(S.profilo([], {}).preferito, '');
});


/* ══ IL PERCORSO A TRE PASSI (19/8 sera) ═════════════════════════════════════
   L'attività non è «rispondi»: è leggere dei RICHIAMI e riconoscere quali
   riaccendono qualcosa. Da lì il campionamento (sette tagli, non trentacinque
   riscritture), le aree, e il giudizio che si dà anche a una domanda scartata. */

/* La forma VERA di un vault generato con «Più set per angolo»: sette angoli,
   tre rami, due varianti per coppia. */
const ANG = S.ANGOLI();
const RAMI = ['Atmosfera', 'Oceani', 'Basi'];
const GROSSO = S.poolDaFogli(ANG.map(a => ({
    titolo: 'Domande-aperte-Clima-' + a, angle: a, tipo: 'open',
    items: [].concat(...RAMI.map(r => [0, 1].map(k => ({
        question: '[' + a + '/' + r + '/' + k + '] domanda ' + k + ' su ' + r,
        ramo: r, livello: k ? 'ponte' : 'base'
    }))))
})));

test('la scala vera: sette angoli × tre rami × due varianti = 42 domande', () => {
    assert.strictEqual(GROSSO.length, 42, 'è la taglia che rende impossibile leggere tutto');
});

test('unaPerAngolo: una per (area × angolo) — 42 → 21', () => {
    const c = S.unaPerAngolo(GROSSO, 'volpe-03');
    assert.strictEqual(c.length, RAMI.length * ANG.length, '3 rami × 7 angoli');
    const coppie = new Set(c.map(v => v.ramo + '|' + v.angle));
    assert.strictEqual(coppie.size, c.length, 'nessuna coppia ripetuta: i sette TAGLI, non le riscritture');
    assert.deepStrictEqual(c.map(v => v.id), GROSSO.filter(v => c.indexOf(v) >= 0).map(v => v.id),
        'e resta l\'ordine del pool: i rami nell\'ordine della mappa');
});

test('unaPerAngolo: stesso studente = stesse domande, studenti diversi = varianti diverse', () => {
    const a = S.unaPerAngolo(GROSSO, 'volpe-03').map(v => v.id);
    const b = S.unaPerAngolo(GROSSO, 'volpe-03').map(v => v.id);
    const c = S.unaPerAngolo(GROSSO, 'riccio-07').map(v => v.id);
    assert.deepStrictEqual(a, b, 'al rientro ritrova le sue');
    assert.notDeepStrictEqual(a, c, 'due studenti leggono varianti diverse: la classe copre tutto');
});

test('aree: quante domande porta ognuna — si sceglie vedendo quanto costa', () => {
    const c = S.unaPerAngolo(GROSSO, 'volpe-03');
    const a = S.aree(c);
    assert.deepStrictEqual(a.map(x => x.ramo), RAMI);
    assert.ok(a.every(x => x.quante === ANG.length), 'sette per area, non trentacinque');
    assert.strictEqual(a[0].base + a[0].ponte, a[0].quante);
});

test('aree: il gruppo senza nome resta in coda e non è un\'area', () => {
    const conVecchi = S.poolDaFogli([
        { titolo: 'Domande-aperte-X-causa', angle: 'causa', tipo: 'open', items: [{ question: 'A', ramo: 'Uno' }] },
        { titolo: 'Verifica di ottobre', tipo: 'open', items: [{ question: 'B' }] }
    ]);
    const a = S.aree(conVecchi);
    assert.deepStrictEqual(a.map(x => x.ramo), ['Uno', '']);
    assert.strictEqual(S.calorAree(conVecchi, [{ aree: ['Uno'] }]).length, 1,
        'il gruppo senza nome non finisce fra le aree del report');
});

test('filtraPerAree: due aree = quattordici domande; nessuna area = tutto', () => {
    const c = S.unaPerAngolo(GROSSO, 'volpe-03');
    assert.strictEqual(S.filtraPerAree(c, ['Oceani', 'Basi']).length, 14);
    assert.strictEqual(S.filtraPerAree(c, []).length, c.length,
        'un filtro che non filtra è più prudente di un elenco vuoto');
});

test('passiUtili: il percorso serve solo dove ci sono aree da scegliere', () => {
    const c = S.unaPerAngolo(GROSSO, 'volpe-03');
    assert.strictEqual(S.passiUtili(c), true);
    assert.strictEqual(S.passiUtili(S.filtraPerAree(c, ['Oceani'])), false, 'un ramo solo: niente da chiedere');
    const vecchi = S.poolDaFogli([{ titolo: 'Verifica', tipo: 'open', items: [{ question: 'A' }, { question: 'B' }] }]);
    assert.strictEqual(S.passiUtili(vecchi), false, 'i fogli vecchi non portano il ramo: le aree non esistono');
});

test('validaAree: sotto il minimo si DICE, non si vieta', () => {
    const c = S.unaPerAngolo(GROSSO, 'volpe-03');
    const v = S.validaAree(c, { aree: ['Oceani'] }, {});
    assert.strictEqual(v.ok, false);
    assert.strictEqual(v.motivi[0].id, 'sotto_minimo_aree');
    assert.strictEqual(v.motivi[0].quante, 1, 'ne manca una, e lo dice in numeri');
    assert.strictEqual(S.validaAree(c, { aree: ['Oceani', 'Basi'] }, {}).ok, true);
    assert.strictEqual(S.validaAree(c, { aree: ['Sparita'] }, { minimoAree: 1 }).motivi[0].id, 'nessuna_domanda',
        'un\'area rimasta in uno stato vecchio, che il vault non ha più');
});

test('il giudizio di RICHIAMO si dà anche a una domanda NON scelta', () => {
    const c = S.unaPerAngolo(GROSSO, 'volpe-03');
    const oceani = S.filtraPerAree(c, ['Oceani']);
    const st = { risposte: {}, letture: {} };
    st.letture[oceani[0].id] = { chip: 'subito' };
    st.risposte[oceani[0].id] = { testo: 'la so' };
    st.letture[oceani[1].id] = { chip: 'niente' };      /* letta, giudicata, NON presa */
    const n = S.conteggio(oceani, st);
    assert.strictEqual(n.scelte, 1, 'una sola presa');
    assert.strictEqual(n.lette, 2, 'ma due giudicate: leggere è già esercizio');
    assert.strictEqual(n.spente, 1, 'e una non ha acceso niente — è il dato che prima si perdeva');
    const p = S.profilo(oceani, st);
    const spento = p.righe.filter(r => r.angle === oceani[1].angle)[0];
    assert.strictEqual(spento.spenti, 1);
    assert.ok(p.spenti.indexOf(oceani[1].angle) >= 0, 'il taglio che non lo accende finisce nel profilo');
});

test('profilo: porta anche le aree dichiarate al primo passo', () => {
    const c = S.unaPerAngolo(GROSSO, 'volpe-03');
    const p = S.profilo(c, { aree: ['Oceani', 'Basi'], risposte: {}, letture: {} });
    assert.deepStrictEqual(p.aree, ['Oceani', 'Basi'],
        '«mi sento sicuro su Oceani e Basi» è una risposta, e va nel report');
});

test('calorAree: su quali rami la classe non si sente', () => {
    const c = S.unaPerAngolo(GROSSO, 'volpe-03');
    const cal = S.calorAree(c, [{ aree: ['Oceani', 'Basi'] }, { aree: ['Oceani'] }, { aree: ['Oceani', 'Basi'] }]);
    const per = {}; cal.forEach(r => { per[r.ramo] = r; });
    assert.strictEqual(per['Atmosfera'].evitataDa, 3, 'nessuno si sente sicuro sull\'Atmosfera');
    assert.strictEqual(per['Oceani'].sceltaDa, 3);
    assert.strictEqual(cal[0].ramo, 'Atmosfera', 'in cima quella evitata da più allievi');
});

// ── normalizzaStato: la frontiera di fiducia ────────────────────────────────
// In Live lo stato lo manda il telefono, e finisce su disco e nel report: si
// tiene solo quello che il core riconosce.
test('normalizzaStato tiene solo ciò che riconosce', () => {
  const pool = [
    { id: 'a', tipo: 'open', ramo: 'R1' },
    { id: 'b', tipo: 'mc', ramo: 'R2', opzioni: ['x', 'y'] }
  ];
  const out = S.normalizzaStato(pool, {
    aree: ['R1', 'INVENTATA', 'R1'],
    fase: 'hackerata',
    letture: { a: { chip: 'subito', nota: 'ok' }, b: { chip: 'inventato' }, zzz: { chip: 'subito' } },
    risposte: { a: { testo: 'ciao', auto: 9 }, b: { scelta: '1', auto: 2 }, zzz: { testo: 'x' } },
    note: 'nota',
    evitata: { id: 'zzz', why: 'boh' }
  });
  assert.deepStrictEqual(out.aree, ['R1']);          // area inventata via, nessun doppione
  assert.strictEqual(out.fase, '');                  // fase sconosciuta → la decide la view
  assert.deepStrictEqual(Object.keys(out.letture), ['a']);   // chip fuori vocabolario e id finto via
  assert.strictEqual(out.letture.a.nota, 'ok');
  assert.deepStrictEqual(Object.keys(out.risposte).sort(), ['a', 'b']);
  assert.strictEqual(out.risposte.a.auto, undefined);        // fuori scala 1-3
  assert.strictEqual(out.risposte.b.scelta, 1);              // stringa → indice
  assert.strictEqual(out.risposte.b.auto, 2);
  assert.strictEqual(out.evitata, null);                     // puntava a una domanda che non ha
});

test('normalizzaStato capa i testi e tiene le domande prese ma vuote', () => {
  const pool = [{ id: 'a', tipo: 'open', ramo: 'R1' }];
  const out = S.normalizzaStato(pool, {
    risposte: { a: {} },                       // presa e lasciata a metà: è un dato
    note: 'n'.repeat(5000),
    letture: { a: { nota: 'x'.repeat(999) } }
  });
  assert.ok('a' in out.risposte);
  assert.strictEqual(S.conteggio(pool, out).scelte, 1);
  assert.strictEqual(S.conteggio(pool, out).scritte, 0);
  assert.strictEqual(out.note.length, 2000);
  assert.strictEqual(out.letture.a.nota.length, 300);
});

test('poolDaFogli: `correct` è una STRINGA nei set veri', () => {
  // lo schema di generateDynamicQuiz dichiara `correct: STRING`: senza il match
  // sul testo nessuna domanda a scelta multipla aveva una risposta esatta
  const p = S.poolDaFogli([{ titolo: 'Quiz - causa', angle: 'causa', tipo: 'mc',
    items: [{ q: 'Capitale?', options: ['Roma', 'Milano'], correct: 'Milano' }] }]);
  assert.strictEqual(p[0].giusta, 1);
  // e un indice numerico 1-based continua a funzionare
  const p2 = S.poolDaFogli([{ titolo: 'Quiz - causa', tipo: 'mc',
    items: [{ q: 'Q?', options: ['A', 'B'], correct: 2 }] }]);
  assert.strictEqual(p2[0].giusta, 1);
});

test('normalizzaStato: le bozze sopravvivono, le chiavi ereditate no', () => {
  const pool = [{ id: 'a', tipo: 'open', ramo: 'R' }, { id: 'b', tipo: 'mc', ramo: 'R' }];
  const out = S.normalizzaStato(pool, JSON.parse(
    '{"risposte":{"constructor":{"testo":"X"},"b":{"scelta":98}},"bozze":{"a":{"testo":"parcheggiata"}}}'));
  assert.deepStrictEqual(Object.keys(out.risposte), ['b']);   // `constructor` non è nel pool
  assert.strictEqual(out.risposte.b.scelta, undefined);       // mc senza opzioni: nessun indice valido
  assert.strictEqual(S.conteggio(pool, out).scritte, 0);      // e quindi non vale come risposta
  assert.strictEqual(out.bozze.a.testo, 'parcheggiata');      // la domanda lasciata non si butta
});

test('normalizzaStato non decide la fase al posto della view', () => {
  // il passo delle AREE si sceglie in `passiUtili`: un ripiego scritto qui
  // rendeva quel ramo morto, e il primo passo irraggiungibile
  const pool = [{ id: 'a', tipo: 'open', ramo: 'R1' }, { id: 'b', tipo: 'open', ramo: 'R2' }];
  assert.strictEqual(S.normalizzaStato(pool, {}).fase, '');
  assert.strictEqual(S.normalizzaStato(pool, { fase: 'aree' }).fase, 'aree');
  assert.strictEqual(S.normalizzaStato(pool, { fase: 'scegli' }).fase, 'scegli');
  assert.strictEqual(S.normalizzaStato(pool, { fase: 'rispondi' }).fase, 'rispondi');
});

// ── Il pool MISTO (aperte + scelta multipla): il campionamento non deve togliere
// un modo di rispondere ────────────────────────────────────────────────────────
test('unaPerAngolo: su un pool misto sopravvivono ENTRAMBI i generi', () => {
  // stesso ramo, stesso angolo, due generi: con la chiave `ramo|angolo` si
  // escludevano a vicenda e un genere intero spariva dal campione
  const pool = S.poolDaFogli([
    { titolo: 'Domande-aperte-X-causa', angle: 'causa', tipo: 'open',
      items: [{ domanda: 'Perche il mare mitiga?', ramo: 'Oceani' }, { domanda: 'Perche le correnti?', ramo: 'Oceani' }] },
    { titolo: 'Quiz-X-causa', angle: 'causa', tipo: 'mc',
      items: [{ q: 'Quale causa?', options: ['a', 'b', 'c'], correct: 'a', ramo: 'Oceani' },
              { q: 'E quale altra?', options: ['d', 'e', 'f'], correct: 'd', ramo: 'Oceani' }] }
  ]);
  assert.strictEqual(pool.length, 4);
  const camp = S.unaPerAngolo(pool, 'volpe-00');
  assert.strictEqual(camp.length, 2, 'una per genere, non una in tutto');
  assert.deepStrictEqual(camp.map(v => v.tipo).sort(), ['mc', 'open']);
  // e dentro un genere il taglio continua a mordere: 2 varianti → 1
  const soloAperte = S.unaPerAngolo(pool.filter(v => v.tipo === 'open'), 'volpe-00');
  assert.strictEqual(soloAperte.length, 1);
});

test('conteggioPerTipo: quante domande per genere (la riga del modale docente)', () => {
  assert.deepStrictEqual(S.conteggioPerTipo([{ tipo: 'open' }, { tipo: 'mc' }, { tipo: 'mc' }]), { open: 1, mc: 2 });
  assert.deepStrictEqual(S.conteggioPerTipo([]), { open: 0, mc: 0 });
  assert.deepStrictEqual(S.conteggioPerTipo(null), { open: 0, mc: 0 });
});

test('normalizzaStato: la risposta deve avere la FORMA del suo genere', () => {
  // un client manomesso (o un bug) manda una scelta a una domanda aperta e un
  // testo a una a scelta multipla: entrambe restano prese ma VUOTE, e non
  // contano come risposte scritte
  const pool = [{ id: 'a', tipo: 'open', ramo: 'R' }, { id: 'b', tipo: 'mc', ramo: 'R', opzioni: ['x', 'y'] }];
  const out = S.normalizzaStato(pool, { risposte: { a: { scelta: 1 }, b: { testo: 'inventata' } } });
  assert.deepStrictEqual(out.risposte, { a: {}, b: {} });
  assert.strictEqual(S.conteggio(pool, out).scritte, 0);
});

test('la spiegazione sta nel pool ma NON viaggia col pubblico', () => {
  // esce solo dentro il verdetto, cioè dopo che si è risposto: è materiale
  // didattico, non una chiave per indovinare
  const p = S.poolDaFogli([{ titolo: 'Quiz - causa', tipo: 'mc', angle: 'causa',
    items: [{ q: 'Perché?', options: ['a', 'b'], correct: 'a', explanation: 'Perché sì.' }] }]);
  assert.strictEqual(p[0].spiegazione, 'Perché sì.');
  assert.strictEqual(S.pubblico(p)[0].spiegazione, undefined);
  assert.strictEqual(S.pubblico(p)[0].giusta, undefined);
});
