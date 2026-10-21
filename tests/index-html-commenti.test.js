'use strict';
/*
 * index-html-commenti.test.js — i commenti HTML di public/index.html non devono
 * inghiottire codice (packet 0111, voce 3).
 *
 * Guasto d'origine (merge dello 0100, commit b5c673a7, 16/10/2026): cambiando il
 * `?v=` di una riga di COMMENTO vicino a `mappai-modal-tokens.css`, il ` -->` finale
 * è andato perso. Il commento si è allungato fino al `-->` successivo e si è
 * mangiato `mappai-modal-core.js` e `mappai-modal.js` (righe 2801-2802 di allora):
 * il motore dei modali non si caricava più. La suite era verde, perché
 * `tests/ordine-script.test.js` toglie i commenti prima di contare gli script — per
 * lui uno script dentro un commento «non è caricato» e basta. Corretto con b75a071e.
 *
 * La regola (decisa da Giacomo il 19/10: «guardia su tutti gli script e i link»):
 *   - ogni `<!--` ha il suo `-->`, e fra i due non c'è un altro `<!--`;
 *   - nessun `<script … src=` e nessun `<link … href=` sta dentro un commento.
 * Se un giorno uno script va commentato DI PROPOSITO, questa guardia lo dirà: si
 * scrive l'eccezione qui, col perché, invece di farla passare in silenzio.
 *
 * Il file si legge come testo e si scorre un commento alla volta, come fa il parser
 * del browser: dal `<!--` al PRIMO `-->` che segue. Nessun DOM, nessun git.
 * `MAPPAI_INDEX_HTML=<percorso>` fa girare la guardia su un altro file (la prova
 * rossa a mano sulla versione di b5c673a7, §7 del packet).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FILE = process.env.MAPPAI_INDEX_HTML || path.join(__dirname, '..', 'public', 'index.html');

function riga(testo, pos) {
    let n = 1;
    for (let i = 0; i < pos; i++) if (testo.charCodeAt(i) === 10) n++;
    return n;
}

// Scorre i commenti come il browser e dice che cosa c'è di storto, con le righe.
function commenti(html) {
    const esito = { commenti: 0, annidati: [], nonChiuso: null, dentro: [] };
    let i = 0;
    for (;;) {
        const a = html.indexOf('<!--', i);
        if (a < 0) break;
        const b = html.indexOf('-->', a + 4);
        if (b < 0) { esito.nonChiuso = riga(html, a); break; }
        esito.commenti++;
        const inizio = a + 4, corpo = html.slice(inizio, b);
        const n = corpo.indexOf('<!--');
        if (n >= 0) esito.annidati.push(riga(html, inizio + n));
        for (const m of corpo.matchAll(/<script\b[^>]*\bsrc\s*=|<link\b[^>]*\bhref\s*=/gi)) {
            esito.dentro.push({ riga: riga(html, inizio + m.index), testo: corpo.slice(m.index, m.index + 90).split('\n')[0] });
        }
        i = b + 3;
    }
    return esito;
}

const conta = (html, s) => html.split(s).length - 1;

function rosso(esito) {
    return esito.annidati.length > 0 || esito.nonChiuso !== null || esito.dentro.length > 0;
}

test('index.html: ogni <!-- ha il suo -->, e nessun commento ne contiene un altro', () => {
    const html = fs.readFileSync(FILE, 'utf8');
    const e = commenti(html);
    assert.ok(e.commenti > 0, 'nessun commento trovato: il file letto è quello giusto? ' + FILE);
    assert.equal(e.nonChiuso, null, '<!-- senza --> alla riga ' + e.nonChiuso);
    assert.deepEqual(e.annidati, [], '<!-- dentro un commento ancora aperto (manca un --> poco sopra), righe: ' + e.annidati.join(', '));
    assert.equal(conta(html, '<!--'), conta(html, '-->'), 'numero di <!-- e di --> diverso');
});

test('index.html: nessuno script e nessun foglio di stile dentro un commento', () => {
    const html = fs.readFileSync(FILE, 'utf8');
    const e = commenti(html);
    assert.deepEqual(e.dentro.map(d => d.riga + ': ' + d.testo), [], 'script o link inghiottiti da un commento');
    // e lo script del motore dei modali, quello del guasto, è davvero caricato
    const fuori = html.replace(/<!--[\s\S]*?-->/g, '');
    for (const f of ['js/mappai-modal-core.js', 'js/mappai-modal.js']) {
        assert.equal(new RegExp('<script\\b[^>]*\\bsrc="' + f.replace(/\./g, '\\.') + '(\\?[^"]*)?"').test(fuori), true, f + ' fuori dai commenti');
    }
});

test('controprova: la guardia vede il guasto dello 0100 (un --> perso inghiotte i due script del motore)', () => {
    // la forma di b5c673a7, in piccolo: il primo commento ha perso il suo -->
    const rotto = [
        '<link rel="stylesheet" href="css/mappai-modal-tokens.css?v=0100-1">',
        '<!-- il foglio dei token si carica sopra, qui solo il promemoria: css/mappai-modal-tokens.css?v=0100-1',
        '<script src="js/mappai-modal-core.js?v=0100-1"></script>',
        '<script src="js/mappai-modal.js?v=0100-1"></script>',
        '<!-- motore dei modali -->',
        '<script src="js/mappai-dopo.js"></script>'
    ].join('\n');
    const e = commenti(rotto);
    assert.equal(rosso(e), true);
    assert.deepEqual(e.annidati, [5]);
    assert.deepEqual(e.dentro.map(d => d.riga), [3, 4]);
    assert.notEqual(conta(rotto, '<!--'), conta(rotto, '-->'));
    // con il --> rimesso al suo posto (b75a071e) è pulito
    const giusto = rotto.replace('?v=0100-1\n<script src="js/mappai-modal-core', '?v=0100-1 -->\n<script src="js/mappai-modal-core');
    assert.equal(rosso(commenti(giusto)), false);
    assert.equal(conta(giusto, '<!--'), conta(giusto, '-->'));
});

test('controprova: un commento mai chiuso e un <link> commentato si vedono', () => {
    assert.equal(commenti('<p>a</p>\n<!-- aperto\n<script src="x.js"></script>').nonChiuso, 2);
    const e = commenti('<!--\n<link rel="stylesheet" href="css/vecchio.css">\n-->');
    assert.deepEqual(e.dentro.map(d => d.riga), [2]);
    // un commento di sole parole, anche con «script» o «link» nel testo, è innocuo
    assert.equal(rosso(commenti('<!-- lo script dei modali e il link ai token stanno sotto -->')), false);
});
