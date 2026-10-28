'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// CVE-2024-4367: pdf.js fino alla 4.1 compila i glifi dei font con `new Function`
// quando `isEvalSupported` è vero (il default), e un PDF costruito ad arte esegue
// JavaScript con l'origine dell'app. L'app ha la 3.4.120: ogni `getDocument` lo
// spegne. app.js era DEBITO DICHIARATO dal 25/9/2026 (fuori dal perimetro di chi ha
// scritto questa guardia): corretto dal packet 0123, lotto 1 (22/10/2026). L'elenco
// resta per il prossimo file che dovesse entrarci con un motivo scritto.

const ROOT = path.join(__dirname, '..');
const DEBITO = [];

function chiamate() {
    const dir = path.join(ROOT, 'public', 'js');
    const out = [];
    fs.readdirSync(dir).filter(f => f.endsWith('.js') && !f.endsWith('.min.js')).forEach(f => {
        const rel = 'public/js/' + f;
        const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        const re = /getDocument\(([^)]*)\)/g;
        let m;
        while ((m = re.exec(src))) out.push({ rel, testo: m[0], spento: /isEvalSupported\s*:\s*false/.test(m[1]) });
    });
    return out;
}

test('ogni getDocument di pdf.js passa isEvalSupported: false (CVE-2024-4367)', () => {
    const tutte = chiamate();
    assert.ok(tutte.length >= 3, 'nessuna chiamata a getDocument: la guardia guarda nel posto sbagliato');
    assert.deepEqual(tutte.filter(c => !c.spento && !DEBITO.includes(c.rel)).map(c => c.rel + ': ' + c.testo), []);
});

test('il debito resta vero: un file corretto esce dall\'elenco', () => {
    const tutte = chiamate();
    DEBITO.forEach(rel => {
        const sue = tutte.filter(c => c.rel === rel);
        assert.ok(sue.some(c => !c.spento), rel + ' è già corretto: toglilo da DEBITO');
    });
});
