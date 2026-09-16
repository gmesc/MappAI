'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Il worker di pdf.js è vendorizzato dal 16/9/2026. Prima arrivava da cdnjs: in
// aula senza rete il PDF della revisione, di Elabora e l'estrazione potevano non
// aprirsi. Il worker deve avere la STESSA versione di pdf.min.js, o pdf.js rifiuta.

const ROOT = path.join(__dirname, '..');
const leggi = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const versione = (src) => (src.match(/"(\d+\.\d+\.\d+)"/) || [])[1];

test('il worker di pdf.js è locale, esiste e ha la versione della libreria', () => {
    const m = leggi('public/js/app.js').match(/workerSrc\s*=\s*['"]([^'"]+)['"]/);
    assert.ok(m, 'workerSrc non trovato in app.js');
    assert.equal(/^https?:/i.test(m[1]), false, `worker remoto: ${m[1]}`);
    const worker = path.join(ROOT, 'public', m[1]);
    assert.ok(fs.existsSync(worker), `manca il file ${m[1]}`);
    const vLib = versione(leggi('public/js/pdf.min.js'));
    assert.ok(vLib, 'versione di pdf.min.js non trovata');
    assert.equal(versione(fs.readFileSync(worker, 'utf8')), vLib);
});
