/**
 * IL TEST CHE VALE SC-001.
 *
 * Confronta ciò che il misuratore calcola con le cifre pubblicate
 * nell'assessment del 24/07/2026 (assessment-funzioni-urbane-1A-1B.html),
 * sui DUE VAULT REALI.
 *
 * Se questo test diventa rosso, una definizione operativa è stata cambiata
 * senza rifare la calibrazione di research.md R1 — e tutto ciò che il
 * misuratore produce poggia su basi diverse da quelle verificate.
 *
 * ⚠️ COSA QUESTO TEST NON VERIFICA, e perché.
 * Nominalizzazioni, connettivi subordinanti e causali, passive, marcatori di
 * esempio e l'intero corpus della sintesi NON sono confrontabili con il 2026:
 * le liste e i confini usati allora non furono scritti da nessuna parte. Gli
 * scarti misurati in calibrazione sono di 3,5× sui subordinanti e 4× sui
 * causali — non rumore, definizioni diverse. Il misuratore adotta liste
 * proprie, dichiarate nel profilo. Non provare a «far tornare» quei numeri:
 * si otterrebbero liste scelte per adattarsi a un campione di due.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const T = require('../public/js/core/mis-text-core.js');
const S = require('../public/js/core/mis-struct-core.js');

const PROFILO = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'public', 'profili', 'predefinito.json'), 'utf8'));
const REALI = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'vault-reali.json'), 'utf8'));

// Cifre pubblicate il 24/07/2026. Non toccare senza una fonte.
const PUBBLICATO = {
    '1A': {
        nodiTotali: 32, macroAree: 6, L2: 10, L3: 15, profonditaMax: 3,
        links: 46, relDistinte: 13, relRicchi: 21, genericiPct: 54.3,
        wL1: { n: 6, media: 53.0, min: 36, max: 74 },
        wL2: { n: 10, media: 41.9, min: 38, max: 48 },
        wL3: { n: 15, media: 39.7, min: 35, max: 51 },
        wTutti: { n: 32, media: 42.4, min: 24, max: 74 }, devStd: 9.7,
        parole: 1357, frasi: 98, paroleFrase: 13.85, gulpease: 56.6, lunghePct: 26.2,
    },
    '1B': {
        nodiTotali: 43, macroAree: 7, L2: 15, L3: 20, profonditaMax: 3,
        links: 58, relDistinte: 18, relRicchi: 21, genericiPct: 63.8,
        wL1: { n: 7, media: 53.3, min: 39, max: 61 },
        wL2: { n: 15, media: 38.6, min: 35, max: 45 },
        wL3: { n: 20, media: 38.5, min: 32, max: 50 },
        wTutti: { n: 43, media: 40.6, min: 24, max: 61 }, devStd: 7.8,
        parole: 1745, frasi: 133, paroleFrase: 13.12, gulpease: 56.8, lunghePct: 28.3,
    },
};

// Scarti ammessi, documentati in research.md R1: su 1B un token di differenza
// in un nodo propaga a media, dev.std e conteggio parole del corpus.
const TOLL = { media: 0.15, devStd: 0.15, parole: 5, frasi: 2, paroleFrase: 0.05, gulpease: 0.2, pct: 0.05 };

function vicino(ottenuto, atteso, tolleranza, nome) {
    // Confronto sul valore arrotondato al decimo: evita che 57,0 contro 56,8
    // fallisca per l'errore di virgola mobile (0,20000000000000284 > 0,2).
    const scarto = Math.round(Math.abs(ottenuto - atteso) * 1000) / 1000;
    assert.ok(scarto <= tolleranza + 1e-9,
        `${nome}: ottenuto ${ottenuto}, pubblicato ${atteso}, scarto ${scarto} > ${tolleranza}`);
}

function caricaVault(percorso) {
    const dirNodi = path.join(percorso, 'Nodi');
    const nodi = fs.readdirSync(dirNodi).filter(f => f.endsWith('.md'))
        .sort()
        .map(f => S.parseNode(fs.readFileSync(path.join(dirNodi, f), 'utf8'), f));
    const links = JSON.parse(fs.readFileSync(path.join(percorso, 'links.json'), 'utf8'));
    return { nodi, links };
}

const disponibili = ['1A', '1B'].every(c => REALI[c] && fs.existsSync(path.join(REALI[c], 'Nodi')));

describe('SC-001 — riproduzione dell’assessment del 24/07/2026', { skip: disponibili ? false : 'vault reali non presenti su questa macchina' }, () => {

    for (const cls of ['1A', '1B']) {
        const atteso = PUBBLICATO[cls];

        test(`${cls} — le 9 metriche strutturali`, () => {
            const { nodi, links } = caricaVault(REALI[cls]);
            const g = S.graphMetrics(nodi, links);
            assert.strictEqual(g.nodiTotali, atteso.nodiTotali, 'nodi totali');
            assert.strictEqual(g.macroAree, atteso.macroAree, 'macro-aree L1');
            assert.strictEqual(g.perLivello[2], atteso.L2, 'nodi L2');
            assert.strictEqual(g.perLivello[3], atteso.L3, 'nodi L3');
            assert.strictEqual(g.profonditaMax, atteso.profonditaMax, 'profondità massima');
            assert.strictEqual(g.links, atteso.links, 'legami');
            assert.strictEqual(g.relDistinte, atteso.relDistinte, 'verbi di relazione distinti');
            assert.strictEqual(g.relRicchi, atteso.relRicchi, 'legami semanticamente ricchi');
            vicino(g.genericiPct, atteso.genericiPct, TOLL.pct, 'quota di generici');
        });

        test(`${cls} — parole per nodo, per livello e complessive`, () => {
            const { nodi } = caricaVault(REALI[cls]);
            const w = S.wordsPerNode(nodi, T.tokenize);
            [['1', atteso.wL1], ['2', atteso.wL2], ['3', atteso.wL3]].forEach(([lv, a]) => {
                const s = w.perLivello[lv];
                assert.strictEqual(s.n, a.n, `L${lv} numero di nodi`);
                vicino(s.media, a.media, TOLL.media, `L${lv} media`);
                assert.strictEqual(s.min, a.min, `L${lv} minimo`);
            });
            assert.strictEqual(w.tutti.n, atteso.wTutti.n, 'nodi totali');
            vicino(w.tutti.media, atteso.wTutti.media, TOLL.media, 'media complessiva');
            assert.strictEqual(w.tutti.min, atteso.wTutti.min, 'minimo complessivo');
            assert.strictEqual(w.tutti.max, atteso.wTutti.max, 'massimo complessivo');
        });

        test(`${cls} — deviazione standard DI POPOLAZIONE`, () => {
            // È la formula ÷n, non ÷(n−1). Con quella campionaria 1A darebbe
            // 9,9 invece di 9,7 e il confronto col 2026 salterebbe.
            const { nodi } = caricaVault(REALI[cls]);
            const w = S.wordsPerNode(nodi, T.tokenize);
            vicino(w.tutti.devStd, atteso.devStd, TOLL.devStd, 'deviazione standard');
        });

        test(`${cls} — corpus dei nodi: parole, frasi, leggibilità`, () => {
            const { nodi } = caricaVault(REALI[cls]);
            const blocchi = nodi.map(n => ({ tipo: 'nodo', testo: n.corpo }));
            const lp = T.lexicalProfile(blocchi, PROFILO);
            vicino(lp.paroleTotali, atteso.parole, TOLL.parole, 'parole del corpus');
            vicino(lp.frasi, atteso.frasi, TOLL.frasi, 'frasi');
            vicino(lp.paroleFrase, atteso.paroleFrase, TOLL.paroleFrase, 'parole per frase');
            vicino(lp.gulpease, atteso.gulpease, TOLL.gulpease, 'Gulpease');
            vicino(lp.parolLunghePct, atteso.lunghePct, TOLL.pct, 'parole lunghe');
        });
    }

    test('la differenza fra le due classi va nella direzione osservata nel 2026', () => {
        // Non un confronto con una cifra pubblicata ma con la CONCLUSIONE:
        // 1B decompone di più e in modo più uniforme.
        const a = caricaVault(REALI['1A']);
        const b = caricaVault(REALI['1B']);
        const wa = S.wordsPerNode(a.nodi, T.tokenize);
        const wb = S.wordsPerNode(b.nodi, T.tokenize);
        assert.ok(b.nodi.length > a.nodi.length, '1B deve avere più nodi');
        assert.ok(wb.tutti.devStd < wa.tutti.devStd, '1B deve essere più uniforme');
        assert.ok(wb.tutti.max < wa.tutti.max, '1B non deve avere l’outlier da 74 parole');
    });

    test('includere la riga del titolo markdown romperebbe tutto', () => {
        // Prova che la definizione calibrata del corpo del nodo è quella giusta:
        // col titolo dentro, 1A passa da 42,4 a circa 44,9 parole medie.
        const dirNodi = path.join(REALI['1A'], 'Nodi');
        const conTitolo = fs.readdirSync(dirNodi).filter(f => f.endsWith('.md')).map(f => {
            const raw = fs.readFileSync(path.join(dirNodi, f), 'utf8');
            const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
            return { corpo: (m ? m[1] : raw).trim(), level: 1 };
        });
        const w = S.wordsPerNode(conTitolo, T.tokenize);
        assert.ok(Math.abs(w.tutti.media - 42.4) > 1.5,
            'col titolo incluso la media dovrebbe allontanarsi da 42,4, invece è ' + w.tutti.media);
    });
});
