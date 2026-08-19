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
    st.risposte[pool[0].id] = { testo: 'Perché l\'aria va dove la pressione è minore', chip: 'so' };
    st.risposte[pool[1].id] = { testo: '', chip: 'curioso' };      /* presa e lasciata */
    const n = S.conteggio(pool, st);
    assert.deepStrictEqual(n, { scelte: 2, scritte: 1, totale: 4 });

    const v = S.validaConsegna(pool, st, { minimo: 3 });
    assert.strictEqual(v.ok, false);
    assert.deepStrictEqual(v.motivi.map(m => m.id), ['sotto_minimo', 'scelte_vuote']);
    assert.strictEqual(v.motivi[0].quante, 2, 'ne mancano due, e lo dice in numeri');

    st.risposte[pool[1].id].testo = 'Il tempo che fa di solito';
    st.risposte[pool[2].id] = { testo: 'Un vento che cambia con le stagioni', chip: 'chiara' };
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
    const st = { risposte: {} };
    st.risposte[pool[0].id] = { testo: 'x', chip: 'so' };          /* causa */
    st.risposte[pool[1].id] = { testo: 'y', chip: 'so' };          /* causa */
    st.risposte[pool[2].id] = { testo: '', chip: 'curioso' };      /* definizione, non scritta */
    const p = S.profilo(pool, st);

    const causa = p.righe.filter(r => r.angle === 'causa')[0];
    assert.deepStrictEqual(
        { totale: causa.totale, scelte: causa.scelte, scritte: causa.scritte, evitate: causa.evitate },
        { totale: 2, scelte: 2, scritte: 2, evitate: 0 });
    assert.strictEqual(causa.chip.so, 2, 'i chip si contano per angolo');
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
    assert.deepStrictEqual(S.conteggio([], {}), { scelte: 0, scritte: 0, totale: 0 });
    assert.strictEqual(S.evitata([], {}, 's'), null);
    assert.deepStrictEqual(S.calorClasse([], []), []);
    assert.strictEqual(S.profilo([], {}).preferito, '');
});
