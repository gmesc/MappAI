'use strict';
/*
 * Le immagini delle emoji locali (packet 0099, 16/10/2026; dal packet 0108 non solo
 * le 27 dell'identità ma tutte quelle del font, decorative comprese) —
 * `public/fonts/emoji/<codepoint>.svg`, estratte dal font da `tools/font/emoji-in-svg.py`.
 *
 * Sui motori WebKit (iPhone, iPad, Safari) il font locale non disegna nel testo:
 * `public/js/mappai-emoji-prova.js` mette al posto del carattere queste immagini.
 * Il guasto da prevenire è lo stesso di `emoji-sottoinsieme.test.js`: qualcuno
 * aggiunge un'emoji a `EMOJI_SET` o a `GROUP_EMOJI` e non rilancia gli script; a
 * lezione iniziata, sull'iPhone, ci sarebbe una casella vuota.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CARTELLA = path.join(ROOT, 'public/fonts/emoji');
global.window = {};
const LIVE = require(path.join(ROOT, 'public/js/mappai-live-core.js')) || global.window.MappAILiveCore;
const COLLAB = require(path.join(ROOT, 'public/js/mappai-collab-core.js')) || global.window.MappAICollabCore;
const PROVA = require(path.join(ROOT, 'public/js/mappai-emoji-prova.js'));

const cp = (s) => s.codePointAt(0);
const dellApp = () => {
    const s = new Set();
    for (const e of LIVE.EMOJI_SET) s.add(cp(e.emoji));
    for (const g of COLLAB.GROUP_EMOJI) for (const it of g.items) s.add(cp(it.emoji));
    return s;
};
/* Il set del font (packet 0108): le 27 + ogni pittogramma Unicode scritto nei file
   di SORGENTI_ALLIEVI, letti dallo script stesso (invariante 6: un elenco solo).
   `Extended_Pictographic` coincide con il filtro «Noto lo possiede» dello script:
   misurato il 16/10, 48 su 48. */
const delSet = () => {
    const py = fs.readFileSync(path.join(ROOT, 'tools/font/emoji-sottoinsieme.py'), 'utf8');
    const blocco = py.match(/SORGENTI_ALLIEVI = \[([\s\S]*?)\]/);
    assert.ok(blocco, 'SORGENTI_ALLIEVI non trovato nello script');
    const s = dellApp();
    for (const m of blocco[1].matchAll(/'([^']+)'/g)) {
        for (const c of fs.readFileSync(path.join(ROOT, m[1]), 'utf8')) {
            if (c.codePointAt(0) >= 0x2000 && /\p{Extended_Pictographic}/u.test(c)) s.add(c.codePointAt(0));
        }
    }
    return s;
};
const suDisco = () => fs.readdirSync(CARTELLA).filter(f => f.endsWith('.svg')).map(f => parseInt(f.slice(0, -4), 16));

test('ogni emoji del set (le 27 + quelle delle pagine degli allievi e dei report) ha la sua immagine, e non ce ne sono di più', () => {
    const attese = [...delSet()].sort((a, b) => a - b);
    assert.deepEqual(suDisco().sort((a, b) => a - b), attese,
        'cartella e codice divergono: rilanciare python3 tools/font/emoji-in-svg.py (e tools/font/emoji-sottoinsieme.py)');
});

test("l'elenco del file della prova è lo stesso del set", () => {
    assert.deepEqual([...PROVA.CODEPOINTS].sort((a, b) => a - b), [...delSet()].sort((a, b) => a - b),
        'CODEPOINTS in mappai-emoji-prova.js diverge dal set del font');
});

test('le 27 dell\'identità sono tutte nel set della prova', () => {
    for (const c of dellApp()) assert.ok(PROVA.CODEPOINTS.includes(c), String.fromCodePoint(c));
});

test('le emoji provate dal canvas sono fra le 27', () => {
    for (const c of PROVA.PROVE) assert.ok(PROVA.CODEPOINTS.includes(cp(c)), c);
});

test('ogni immagine è un SVG con viewBox, un gruppo e niente script né riferimenti esterni', () => {
    for (const c of suDisco()) {
        const s = fs.readFileSync(path.join(CARTELLA, c.toString(16) + '.svg'), 'utf8');
        assert.match(s, /^<svg [^>]*viewBox="0 -\d+ \d+ \d+"/, c.toString(16));
        assert.match(s, /<g id="glyph\d+"/, c.toString(16));
        assert.ok(!/<script|href="http|url\(http|<image/.test(s), 'riferimento esterno in ' + c.toString(16));
        assert.ok(s.length > 500 && s.length < 20000, c.toString(16) + ' peso fuori misura: ' + s.length);
        // ogni href interno punta a qualcosa che c'è
        for (const m of s.matchAll(/href="#([^"]+)"/g)) assert.ok(s.includes('id="' + m[1] + '"'), c.toString(16) + ' href #' + m[1]);
    }
});

test('la cartella pesa poco (viaggia sulla LAN della classe): meno di 400 KB', () => {
    // 0099: 27 immagini, 182 KB. 0108: 48 immagini, 265 KB (16/10/2026).
    const tot = suDisco().reduce((n, c) => n + fs.statSync(path.join(CARTELLA, c.toString(16) + '.svg')).size, 0);
    assert.ok(tot < 400 * 1024, tot + ' byte');
});

test('lo script di estrazione c\'è e dichiara da dove prende le emoji', () => {
    const s = fs.readFileSync(path.join(ROOT, 'tools/font/emoji-in-svg.py'), 'utf8');
    assert.match(s, /MappAIEmoji\.ttf/);
    assert.match(s, /public', 'fonts', 'emoji'/);
});
