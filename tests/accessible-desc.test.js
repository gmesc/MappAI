'use strict';
/*
 * accessible-desc.test.js — regole di accessibilità delle descrizioni, headless.
 * Copre: window.accessibleDescRules (estratta da app.js e valutata in sandbox
 * — tecnica sorgente→sandbox, unica nel repo perché la funzione vive in app.js
 * e non in un modulo UMD; fallimento rumoroso via assert se il refactor la sposta)
 * — default medio senza classe, intensità piena su registro 'semplice',
 * '' su 'ricco', kill-switch mappai_accessible_descs='0', variante EN —
 * e il CABLAGGIO: iniezione dentro buildSystemInstruction (fasi prosa),
 * blocco PRIMA della direttiva di formato JSON negli enrich (regola
 * Focus+Lenses), lingua enrich = lingua mappe (regola 14), assenza nelle
 * fasi strutturali (Fase 4/5, KG multi-pass).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'public', 'js');
const appSrc = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const genSrc = fs.readFileSync(path.join(PUB, 'mappai-generation-support.js'), 'utf8');
const kgSrc = fs.readFileSync(path.join(PUB, 'mappai-kg-extraction.js'), 'utf8');

// ── Estrazione della funzione da app.js (sorgente → sandbox) ────────────
const m = appSrc.match(/window\.accessibleDescRules = function \(\) \{[\s\S]*?\n\};/);
assert.ok(m, 'accessibleDescRules non trovata in app.js');

function makeFn({ register, flagOff, lang } = {}) {
    const window = {
        MappAIClasses: register === undefined ? null : {
            getActive: () => (register === null ? null : { register })
        },
        getPromptLanguage: () => (lang || 'it')
    };
    const localStorage = {
        getItem: (k) => (flagOff && k === 'mappai_accessible_descs') ? '0' : null
    };
    return new Function('window', 'localStorage', m[0] + '\nreturn window.accessibleDescRules;')(window, localStorage);
}

// ── Comportamento ───────────────────────────────────────────────────────
test('default (nessuna classe attiva): regola leggera, niente blocco pieno', () => {
    const out = makeFn({})();
    assert.ok(out.includes('ACCESSIBILITÀ DESCRIZIONI'));
    assert.ok(out.includes('causa-effetto'));
    assert.ok(out.includes('termine tecnico'));
    assert.ok(!out.includes('dettagli concreti'), 'medio non deve avere la parte piena');
    assert.ok(out.includes('fedele ai fatti'), 'clausola di fedeltà sempre presente');
    assert.ok(out.includes('limite di parole'), 'anti-runaway sempre presente');
});

test('classe attiva con getActive() → null: come default medio', () => {
    const out = makeFn({ register: null })();
    assert.ok(out.includes('ACCESSIBILITÀ DESCRIZIONI'));
    assert.ok(!out.includes('dettagli concreti'));
});

test('registro semplice: regola piena (dettagli concreti + frasi brevi)', () => {
    const out = makeFn({ register: 'semplice' })();
    assert.ok(out.includes('dettagli concreti'));
    assert.ok(out.includes('Frasi brevi'));
    assert.ok(out.includes('fedele ai fatti'));
    // niente "immagini": ambiguo per modelli deboli (Infomaniak/GEMMA)
    assert.ok(!out.includes('immagini'));
});

test('registro medio: regola leggera', () => {
    const out = makeFn({ register: 'medio' })();
    assert.ok(out.includes('causa-effetto'));
    assert.ok(!out.includes('dettagli concreti'));
});

test('registro ricco: nessuna regola', () => {
    assert.strictEqual(makeFn({ register: 'ricco' })(), '');
});

test('kill-switch mappai_accessible_descs=0: nessuna regola anche con semplice', () => {
    assert.strictEqual(makeFn({ register: 'semplice', flagOff: true })(), '');
});

test('lingua mappe EN: blocco inglese', () => {
    const out = makeFn({ register: 'semplice', lang: 'en' })();
    assert.ok(out.includes('DESCRIPTION ACCESSIBILITY'));
    assert.ok(out.includes('cause-effect'));
    assert.ok(out.includes('concrete actions and details'));
    assert.ok(!out.includes('ACCESSIBILITÀ'));
});

test('getPromptLanguage assente: fallback italiano senza errori', () => {
    const window = { MappAIClasses: null };
    const localStorage = { getItem: () => null };
    const fn = new Function('window', 'localStorage', m[0] + '\nreturn window.accessibleDescRules;')(window, localStorage);
    assert.ok(fn().includes('ACCESSIBILITÀ DESCRIZIONI'));
});

// ── Cablaggio: SOLO fasi prosa ──────────────────────────────────────────
test('buildSystemInstruction inietta le regole (choke point prosa)', () => {
    const bsi = appSrc.match(/function buildSystemInstruction\(base\) \{[\s\S]*?\n\}/);
    assert.ok(bsi, 'buildSystemInstruction non trovata');
    assert.ok(bsi[0].includes('accessibleDescRules'), 'iniezione mancante nel choke point');
});

test('enrich: blocco PRIMA della direttiva di formato JSON (regola Focus+Lenses)', () => {
    // enrichL1Descs — IT e EN: il placeholder deve stare prima di "Restituisci SOLO"/"Return ONLY"
    assert.ok(genSrc.includes('della lista.${_adrL1}\\n\\nRestituisci SOLO un Array JSON'),
        'enrichL1 IT: blocco non inserito prima della direttiva');
    assert.ok(genSrc.includes('in the list.${_adrL1}\\n\\nReturn ONLY a JSON Array'),
        'enrichL1 EN: blocco non inserito prima della direttiva');
    // enrichThinDescs — idem
    assert.ok(genSrc.includes('${listStr}${_adr}\\n\\nRestituisci SOLO un array JSON'),
        'enrichThin IT: blocco non inserito prima della direttiva');
    assert.ok(genSrc.includes('${listStr}${_adr}\\n\\nReturn ONLY a JSON array'),
        'enrichThin EN: blocco non inserito prima della direttiva');
    // nessun residuo di append in coda al prompt
    assert.ok(!genSrc.includes('prompt + _adr'), 'residuo append in coda al prompt');
});

test('enrich: lingua del prompt = lingua mappe (regola 14), non documentElement.lang', () => {
    assert.ok(!genSrc.includes("const isIT = document.documentElement.lang"),
        'enrich ancora su documentElement.lang (lingua UI, sempre it)');
    const occ = (genSrc.match(/getPromptLanguage\(\) === 'en'/g) || []).length;
    assert.ok(occ >= 2, `attesi >=2 selettori lingua-mappe negli enrich, trovati ${occ}`);
});

test('KG Community accoda le regole al systemPrompt', () => {
    assert.ok(kgSrc.includes('systemPrompt + (window.accessibleDescRules'), 'Community senza regole');
});

test('fasi strutturali intatte: Phase 4/5/validate e KG multi-pass non toccati', () => {
    // i systemInstruction propri delle fasi strutturali restano stringhe pure:
    // controlla una finestra di ±300 caratteri attorno a ogni frase sentinella
    const structural = [
        'Sei un validatore di classificazione',
        'Sei un consulente di organizzazione concettuale',
        'Sei un consolidatore semantico di grafi',
        'Sei un analizzatore di testi accademico',
        'Sei un cartografo di concetti'
    ];
    for (const s of structural) {
        const src = genSrc.includes(s) ? genSrc : kgSrc;
        const idx = src.indexOf(s);
        assert.ok(idx > -1, `frase strutturale non trovata: ${s}`);
        const win = src.slice(Math.max(0, idx - 300), idx + s.length + 300);
        assert.ok(!win.includes('accessibleDescRules'), `fase strutturale contaminata: ${s}`);
    }
});
