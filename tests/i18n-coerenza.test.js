'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/*
 * Coerenza delle traduzioni: la guardia dell'invariante 14 (GUIDA-ARCHITETTO.md).
 *
 * Il 25/9/2026 un audit ha trovato 84 chiavi t() assenti da en_translations.js:
 * con l'interfaccia in inglese una quarantina di punti dell'app parlavano ancora
 * italiano, e nessun test se ne accorgeva. Questi le trovano, con file e riga.
 *
 *  1. index.html: ogni data-i18n, -title, -placeholder, -tip fuori da commenti e
 *     <script> ha un testo in it E in en (o lo switch EN→IT non rimette
 *     l'italiano) e usa uno dei quattro attributi che changeLanguage traduce.
 *     Stessa regola per le letture dirette del dizionario, `t.chiave`: la mappa
 *     id→testo di changeLanguage e le poche funzioni che fanno come lei.
 *  2. Moduli public/js: ogni chiave LETTERALE passata a window.t, t, _t, tt, tr,
 *     _tSafe, agli alias di un file solo, a _qpText, o scritta in un ternario
 *     `cond ? 'a' : 'b'`, ha un testo in en_translations.js. In italiano basta il
 *     ripiego inline.
 *  3. Moduli UMD (quelli che i test caricano in Node): `window.t` solo dietro
 *     `typeof window`, sulla stessa riga; altrimenti un `_tSafe` locale.
 *  4. Ogni chiave di it_translations.js esiste anche in en_translations.js.
 *
 * NON si controllano le chiavi composte a runtime ('sp_kind_' + k,
 * 'lt_kind_' + d.kind, t(chiave, …) con la chiave in una variabile): dal testo del
 * codice non si leggono. Chi ne aggiunge una verifica a mano che ci sia in en.
 *
 * Solo espressioni regolari: acorn non è una dipendenza del repo. I commenti JS
 * restano dove sono, perché una regex che li toglie scambia `accept="image/*"` per
 * l'inizio di un commento e si mangia il codice che segue. Una chiamata t() citata
 * in un commento conta quindi come una vera.
 */

// Le eccezioni, ognuna col suo motivo. Un'eccezione che non serve più fa fallire
// il test: si toglie da qui.
const ECCEZIONI = {
    // chiavi che possono mancare in en, per prefisso
    prefissi: {
        onb_: 'onboarding delle lingue al primo avvio (mappai-storage-lang.js): compare prima che una lingua sia scelta, e il ripiego è bilingue «it · en» apposta',
    },
    // chiavi presenti in en con il testo vuoto
    vuote: {
        mp_budget_per: 'suffisso del numero nella riga del budget (mappai-material-pipeline.js): vuoto apposta, come il suo ripiego',
    },
};

// Alias di t() che valgono in un file solo: funzioni (chiave, ripiego).
const ALIAS = {
    'mappai-storage-lang.js': ['T'],
    'mappai-catalogo-core.js': ['translate'],
    'mappai-review-fonte.js': ['avvisa'],
    'mappai-landing-teach.js': ['fascia'],
};
const TRADUTTORI = ['window\\.t', 't', '_t', 'tt', 'tr', '_tSafe'];
const CHIAVE = '([a-z][a-z0-9_]*)';

const ROOT = path.join(__dirname, '..');
const JS = path.join(ROOT, 'public', 'js');
const leggi = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const own = (d, k) => Object.prototype.hasOwnProperty.call(d, k);
const pieno = (d, k) => own(d, k) && typeof d[k] === 'string' && d[k].trim() !== '';
const elenco = righe => '\n  ' + righe.join('\n  ');

// I dizionari sono `const` di primo livello: nel contesto vm non finiscono sul
// finto window, si leggono per nome.
function dizionari() {
    const finestra = { localStorage: { getItem: () => null } };
    finestra.window = finestra;
    const ctx = vm.createContext(finestra);
    for (const f of ['it_translations.js', 'en_translations.js']) {
        vm.runInContext(leggi('public', 'traduzioni', f), ctx, { filename: f });
    }
    return { it: vm.runInContext('it_translations', ctx), en: vm.runInContext('en_translations', ctx) };
}
const { it, en } = dizionari();

// I moduli dell'app: fuori le librerie minificate, tailwind e le copie .bak
// (public/js/vendor è una cartella, readdirSync non ci entra).
const sorgenti = new Map(fs.readdirSync(JS)
    .filter(f => f.endsWith('.js') && !f.endsWith('.min.js') && f !== 'tailwind.js' && !f.includes('.bak'))
    .sort()
    .map(f => [f, fs.readFileSync(path.join(JS, f), 'utf8')]));

// Da indice nel testo a numero di riga. Le corrispondenze di una regex arrivano
// in ordine; quando si ricomincia da capo, si riconta da capo.
function contaRighe(testo) {
    let pos = 0, riga = 1;
    return (indice) => {
        if (indice < pos) { pos = 0; riga = 1; }
        for (; pos < indice; pos++) if (testo.charCodeAt(pos) === 10) riga++;
        return riga;
    };
}

test('index.html: ogni data-i18n* ha un testo in it e in en, con un attributo che changeLanguage traduce', () => {
    // commenti e <script> diventano spazi: stessa lunghezza, righe al loro posto
    const spegni = m => m.replace(/[^\n]/g, ' ');
    const html = leggi('public', 'index.html')
        .replace(/<!--[\s\S]*?-->/g, spegni)
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, spegni);
    const riga = contaRighe(html);
    const usi = [...html.matchAll(/\s(data-i18n(?:-[a-z0-9]+)?)\s*=\s*(["'])(.*?)\2/g)]
        .map(m => ({ attr: m[1], chiave: m[3], dove: 'index.html:' + riga(m.index) }));
    assert.ok(usi.length > 200, `trovati solo ${usi.length} attributi data-i18n: la ricerca si è rotta`);

    const GESTITI = ['data-i18n', 'data-i18n-placeholder', 'data-i18n-title', 'data-i18n-tip'];
    const ignoti = usi.filter(u => !GESTITI.includes(u.attr)).map(u => `${u.attr}="${u.chiave}" ${u.dove}`);
    assert.deepEqual(ignoti, [], 'attributi che changeLanguage non traduce:' + elenco(ignoti));

    const rotti = usi.filter(u => !pieno(it, u.chiave) || !pieno(en, u.chiave))
        .map(u => `${u.chiave} ${u.dove} (senza testo in ${pieno(it, u.chiave) ? 'en' : pieno(en, u.chiave) ? 'it' : 'it ed en'})`);
    assert.deepEqual(rotti, [], 'chiavi del markup statico senza testo (chiave file:riga):' + elenco(rotti));
});

test('letture dirette del dizionario (t.chiave, come in changeLanguage): testo in it e in en', () => {
    // `const t = (lang === 'en' ? …en_translations… : …it_translations…)`: la
    // funzione si prende il dizionario intero e legge t.chiave, spesso con un
    // ripiego `||` in italiano. L'ambito finisce alla prima riga meno rientrata
    // della definizione.
    const DEF = /^(\s*)(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=(?=.*\ben_translations\b)(?=.*\bit_translations\b)/;
    const letture = [];
    for (const [f, src] of sorgenti) {
        const righe = src.split('\n');
        righe.forEach((l, i) => {
            const d = l.match(DEF);
            if (!d) return;
            const lettura = new RegExp(`(?<![\\w$.])${d[2].replace(/\$/g, '\\$')}\\.([A-Za-z_]\\w*)`, 'g');
            for (let j = i + 1; j < righe.length; j++) {
                if (righe[j].trim() && righe[j].match(/^\s*/)[0].length < d[1].length) break;
                for (const m of righe[j].matchAll(lettura)) letture.push({ chiave: m[1], dove: `${f}:${j + 1}` });
            }
        });
    }
    assert.ok(letture.filter(l => l.dove.startsWith('mappai-storage-lang.js:')).length > 20,
        'non trovo la mappa id→testo di changeLanguage: la ricerca si è rotta');

    const rotte = letture.filter(l => !pieno(it, l.chiave) || !pieno(en, l.chiave))
        .map(l => `${l.chiave} ${l.dove} (senza testo in ${pieno(it, l.chiave) ? 'en' : pieno(en, l.chiave) ? 'it' : 'it ed en'})`);
    assert.deepEqual(rotte, [], 'letture t.chiave senza testo (chiave file:riga):' + elenco(rotte));
});

test('moduli: ogni chiave letterale passata a t() ha un testo in en_translations.js', () => {
    const usi = [];
    for (const [f, src] of sorgenti) {
        const riga = contaRighe(src);
        const chiama = `(?<![\\w$.])(?:${[...TRADUTTORI, ...(ALIAS[f] || [])].join('|')})\\(\\s*`;
        const forme = [
            // t('chiave', …) e t('chiave')
            [new RegExp(chiama + `(['"\`])${CHIAVE}\\1\\s*[,)]`, 'g'), [2]],
            // _t(fn, 'chiave', 'ripiego'): il traduttore arriva come primo argomento (mappai-scelta-view.js)
            [new RegExp(chiama + `[A-Za-z_$][\\w$]*\\s*,\\s*(['"\`])${CHIAVE}\\1\\s*,`, 'g'), [2]],
            // t(cond ? 'a' : 'b', …)
            [new RegExp(chiama + `[^(),;]*?\\?\\s*(['"])${CHIAVE}\\1\\s*:\\s*(['"])${CHIAVE}\\3`, 'g'), [2, 4]],
            // _qpText('chiave', it, en) di mappai-quiz-print.js
            [new RegExp(`(?<![\\w$.])_qpText\\(\\s*'${CHIAVE}'`, 'g'), [1]],
        ];
        for (const [re, gruppi] of forme) {
            for (const m of src.matchAll(re)) for (const g of gruppi) usi.push({ chiave: m[g], dove: `${f}:${riga(m.index)}` });
        }
    }
    assert.ok(usi.length > 2000, `trovate solo ${usi.length} chiamate t(): la ricerca si è rotta`);

    const servite = new Set();
    const mancanti = usi.filter(u => {
        if (pieno(en, u.chiave)) return false;
        const prefisso = Object.keys(ECCEZIONI.prefissi).find(p => u.chiave.startsWith(p));
        if (prefisso) { servite.add(prefisso); return false; }
        if (own(ECCEZIONI.vuote, u.chiave) && own(en, u.chiave)) { servite.add(u.chiave); return false; }
        return true;
    }).map(u => `${u.chiave} ${u.dove}`);
    assert.deepEqual(mancanti, [], 'chiavi senza testo in en_translations.js (chiave file:riga):' + elenco(mancanti));

    const inutili = [...Object.keys(ECCEZIONI.prefissi), ...Object.keys(ECCEZIONI.vuote)].filter(e => !servite.has(e));
    assert.deepEqual(inutili, [], 'eccezioni che non servono più, toglile da ECCEZIONI: ' + inutili.join(', '));
});

test('moduli UMD: window.t solo dietro typeof window', () => {
    const umd = [...sorgenti].filter(([, src]) => /module\.exports/.test(src));
    assert.ok(umd.length > 20, `trovati solo ${umd.length} moduli UMD: la ricerca si è rotta`);
    const scoperti = [];
    for (const [f, src] of umd) {
        src.split('\n').forEach((l, i) => {
            if (/\bwindow\.t\s*(?:\(|\?|&&|\|\||===|!==)/.test(l) && !/\btypeof window\b/.test(l)) scoperti.push(`${f}:${i + 1}`);
        });
    }
    assert.deepEqual(scoperti, [], 'window.t senza `typeof window` in un modulo che gira anche in Node (usa _tSafe):' + elenco(scoperti));
});

test('ogni chiave di it_translations.js esiste anche in en_translations.js', () => {
    const righe = leggi('public', 'traduzioni', 'it_translations.js').split('\n');
    const soloIt = Object.keys(it).filter(k => !own(en, k))
        .map(k => `${k} it_translations.js:${righe.findIndex(l => new RegExp(`^\\s*${k}\\s*:`).test(l)) + 1}`);
    assert.deepEqual(soloIt, [], 'chiavi italiane senza la voce inglese (chiave file:riga):' + elenco(soloIt));
});
