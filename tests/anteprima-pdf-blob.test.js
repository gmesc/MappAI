'use strict';
/* 0100 — un PDF oltre i 2 MB deve andare al visore come `blob:`, mai come `data:`
   (Chromium blocca gli indirizzi oltre 2 097 152 caratteri: about:blank#blocked). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JS = f => path.join(__dirname, '..', 'public', 'js', f);
const DF = require(JS('mappai-dossier-fonte-core.js'));

const pdf3mb = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(3 * 1024 * 1024, 7)]);

test('0100 · PDF e audio si mostrano come blob', () => {
    assert.equal(DF.anteprimaFile('Fonti/grande.pdf').modo, 'blob');
    assert.equal(DF.anteprimaFile('Fonti/grande.pdf').mime, 'application/pdf');
    assert.equal(DF.anteprimaFile('voce.mp3').modo, 'blob');
    assert.equal(DF.anteprimaFile('x.html').modo, 'srcdoc');
});

test('0100 · blobDaBase64: un PDF di 3 MB torna intatto, col tipo giusto', () => {
    const b = DF.blobDaBase64(pdf3mb.toString('base64'), 'application/pdf');
    assert.equal(b.type, 'application/pdf');
    assert.equal(b.size, pdf3mb.length);
});

test('0100 · blobDaDataUri: il data: di jsPDF diventa un blob; il resto è null', () => {
    const uri = 'data:application/pdf;filename=x.pdf;base64,' + pdf3mb.toString('base64');
    const b = DF.blobDaDataUri(uri);
    assert.equal(b.type, 'application/pdf');
    assert.equal(b.size, pdf3mb.length);
    assert.equal(DF.blobDaDataUri('blob:abc'), null);
    assert.equal(DF.blobDaDataUri(''), null);
});

test('0100 · i punti di montaggio non mettono più un data: di PDF in src o window.open', () => {
    const el = fs.readFileSync(JS('mappai-elabora-console.js'), 'utf8');
    const lt = fs.readFileSync(JS('mappai-landing-teach.js'), 'utf8');
    const mh = fs.readFileSync(JS('mappai-menu-hubs.js'), 'utf8');
    assert.doesNotMatch(el, /else fr\.src = 'data:'/);
    assert.match(el, /blobDaBase64/);
    assert.match(lt, /blobDaDataUri/);
    assert.match(lt, /function _consMostra[\s\S]{0,400}_blobDaDataUri\(src\)/);
    assert.doesNotMatch(lt, /window\.open\((doc|rec|d)\.pdf/);
    assert.match(mh, /_apriPdfInFinestra\(rec\.pdf\)/);
});
