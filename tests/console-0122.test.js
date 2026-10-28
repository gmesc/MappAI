'use strict';
/*
 * console-0122.test.js — il lotto 4c del packet 0122: le aree delle console (Cabina, INSEGNA, ELABORA)
 * sulla famiglia C. Giacomo, 22/10, al gate del 4a: «in cabina ci sono delle superfici non omogenee, e in
 * ELABORA e INSEGNA l'area della console non è ancora stata corretta»; sul banco: «si alla proposta di 4c»,
 * le etichette delle tessere di INSEGNA «a 18px», «'Vault su iPad'=icona QR e 'Invia file'= aeroplano di carta».
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const leggi = (f) => fs.readFileSync(path.join(root, f), 'utf8');
// il corpo di una regola: da «\n<selettore> {» alla graffa chiusa a inizio riga (i commenti ne contengono)
const regola = (css, sel) => {
    const i = css.indexOf('\n' + sel + ' {');
    assert.ok(i >= 0, 'regola assente: ' + sel);
    const riga = css.indexOf('\n', i + 1);
    const fine = css.slice(i + 1, riga).includes('}') ? riga : css.indexOf('\n}', i);
    return css.slice(i, fine);
};

test('motore: tabelle, dati, tela vuota e la voce «Segnalazione» leggono i token', () => {
    const css = leggi('public/css/mappai-modal-tokens.css');
    assert.match(regola(css, '.mm-tab'), /font-size: var\(--mm-ctl-fs\)/);
    assert.match(regola(css, '.mm-tab th'), /font-size: var\(--mm-fs-sez\)/, 'le testate restano sezioni');
    assert.match(regola(css, '.mm-dati'), /font-size: var\(--mm-ctl-fs\)/);
    assert.match(regola(css, '.mm-dati dt'), /font-size: var\(--mm-fs-label\)/);
    assert.match(regola(css, '.mm-tela__vuota'), /font-size: var\(--mm-fs-testo\)/);
    assert.match(regola(css, '.mm-nav__v--segnala .mm-nav__s'), /font-size: var\(--mm-fs-label\)/, 'a 13: a 14 con Space Mono si tronca (gate, 22/10)');
    for (const sel of ['.mm-tab', '.mm-dati', '.mm-tela__vuota']) assert.ok(!/font-size: 1[12]px/.test(regola(css, sel)), 'letterale rimasto in ' + sel);
});

test('veste delle console: conteggio, testata di «A chi?», vuoto dei materiali, etichette delle tessere a 18', () => {
    const css = leggi('public/css/mappai-console-manifesto.css');
    assert.match(regola(css, 'html.manifesto .mm-box--console .mn-filtri__conto'), /font-size: var\(--mm-fs-label\)/);
    assert.match(regola(css, 'html.manifesto .mn-bric-col__h'), /font-size: var\(--mm-fs-sez\)/);
    assert.match(regola(css, 'html.manifesto .mn-materiali .mn-materiali-vuoto'), /font-size: var\(--mm-fs-testo\)/);
    assert.ok(css.includes('--mnc-azione-fs: 18px;'), 'il token delle etichette delle tessere');
    assert.match(regola(css, 'html.manifesto .mn-bento-area .mn-cmd > span'), /font-size: var\(--mnc-azione-fs\) !important/);
    assert.match(regola(css, 'html.manifesto .mm-box--console > .mm-head .mm-title'), /--mn-tit-fs, 30px/, 'il titolo della console resta 30');
});

test('INSEGNA: «Vault su iPad» col QR, «Invia file» con l’aeroplano di carta', () => {
    const js = leggi('public/js/mappai-landing-teach.js');
    const f = js.slice(js.indexOf('function _consBentoMappa('), js.indexOf('s.bento = [', js.indexOf('function _consBentoMappa(')));
    assert.match(f, /id: 'invia-allievi', et: _t\('lt_cons_allievi', 'Vault su iPad'\), forma: 'azione', icona: 'qr-code'/);
    assert.match(f, /id: 'qr', et: _t\('lt_cons_qr_btn', 'Invia file'\), forma: 'azione', icona: 'send'/);
});

test('Consumi AI: il cruscotto disegnato usa solo i corpi della famiglia C', () => {
    const store = {};
    const win = { MappAIUsageCore: require(path.join(root, 'public/js/mappai-usage-core.js')) };
    const ctx = vm.createContext({ window: win, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } }, console });
    vm.runInContext(leggi('public/js/mappai-usage-dashboard.js'), ctx);
    const D = win.MappAIUsageDash;
    const cats = [['map', 'mm_phase1'], ['study', 'quiz'], ['tutor', 'sidebar'], ['other', 'misc']];
    const rec = [];
    for (let i = 0; i < 12; i++) rec.push({ ts: '2026-10-0' + (1 + i % 9) + 'T08:00:00Z', provider: i % 2 ? 'infomaniak' : 'google', model: i % 2 ? 'google/gemma-4-31B-it' : 'gemini-2.5-flash', inTok: 4000 + i, outTok: 900 + i, cat: cats[i % 4][0], sub: cats[i % 4][1], project: 'Le Disequazioni' });
    for (const html of [D.contentHtml(rec, {}), D.contentHtml(rec, { drillCat: 'map' }), D.contentHtml([], {})]) {
        assert.ok(!/\btext-(xs|sm|base)\b|text-\[(9|10|11)px\]|font-black/.test(html), 'resta un corpo Tailwind: ' + (html.match(/\btext-(xs|sm|base)\b|text-\[(9|10|11)px\]|font-black/) || [])[0]);
        assert.ok(!/font-size="(9|15)"/.test(html), 'resta un corpo in attributo SVG');
        const usati = new Set((html.match(/font-size:var\(--mm-[a-z-]+\)/g) || []));
        for (const u of usati) assert.ok(/--mm-(fs-titolo|fs-testo|ctl-fs|btn-fs|fs-label|fs-sez)\)/.test(u), 'token fuori dalla famiglia: ' + u);
        assert.ok(usati.size > 0);
    }
    const pieno = D.contentHtml(rec, {});
    assert.ok(pieno.includes('font-size:var(--mm-fs-titolo)'), 'i numeri delle tessere a 20');
    assert.ok(/<h3 class="uppercase font-bold mb-1" style="font-size:var\(--mm-fs-testo\);letter-spacing:\.06em/.test(pieno), 'i titoletti maiuscoli a 16 (Giacomo, 22/10: «come nella schermata del banco»)');
});

test('0122 lotto 4c: i marcatori di cache', () => {
    const html = leggi('public/index.html');
    ['css/mappai-modal-tokens.css?v=0119-0122-20261022-4c2-0122-4b2', 'css/mappai-console-manifesto.css?v=0087-0122-20261022-4c',
        'js/mappai-usage-dashboard.js?v=0108-0122-20261022-4c2', 'js/mappai-landing-teach.js?v=0116-0122-20261022-4c-0122-4b2-2'].forEach(f => assert.ok(html.includes(f), f));
});
