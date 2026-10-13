'use strict';
/*
 * consegne-anteprima.test.js — l'anteprima di una CONSEGNA nella console INSEGNA (25/9)
 * Una consegna la scrive un allievo col solo token del QR. Il suo HTML entrava in
 * un `srcdoc` senza sandbox, cioè con l'origine dell'app: `top.electronAPI` a un
 * clic del docente. Ora va in un iframe con sandbox VUOTA. I pezzi si prendono dal
 * sorgente di mappai-landing-teach.js, come fa teach-core.test.js con `_chiaveDoc`:
 * il modulo è un IIFE del renderer, non un core UMD.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mappai-landing-teach.js'), 'utf8');
function pezzo(da, a) {
    const i = src.indexOf(da), j = src.indexOf(a, i);
    assert.ok(i >= 0 && j > i, 'non trovo ' + da + ' … ' + a);
    return src.slice(i, j);
}
const FC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-files-core.js'));
const _daAllievo = new Function('FCore',
    pezzo('function _daAllievo', 'function _consCaricaConsegne') + '; return _daAllievo;')(() => FC);

test('_daAllievo: è di un allievo tutto ciò che sta sotto Consegne/, e nient\'altro', () => {
    assert.equal(_daAllievo('Consegne/3C-7/Prova - report.html'), true);
    assert.equal(_daAllievo('consegne/3C-7/x.html'), true, 'il disco del Mac non distingue le maiuscole');
    assert.equal(_daAllievo('Consegne\\3C-7\\x.html'), true);
    assert.equal(_daAllievo('Materiale Studio/Sintesi-voce-Clima.html'), false);
    assert.equal(_daAllievo('Materiale Studio/Consegne.html'), false);
    assert.equal(_daAllievo(''), false);
    assert.equal(_daAllievo(null), false);
});

/* un iframe finto che ricorda in che ORDINE gli si fanno le cose: la sandbox
   deve esserci prima che il documento arrivi */
function ambiente() {
    const log = [];
    const tela = { innerHTML: 'vecchio', figli: [], appendChild(f) { log.push('append'); this.figli.push(f); } };
    const documento = {
        createElement() {
            const f = { style: {}, attr: {}, ascolti: [],
                setAttribute(k, v) { log.push('attr:' + k); this.attr[k] = String(v); },
                hasAttribute(k) { return k in this.attr; },
                addEventListener(tipo) { this.ascolti.push(tipo); } };
            Object.defineProperty(f, 'srcdoc', { set(v) { log.push('srcdoc'); f._srcdoc = v; }, get() { return f._srcdoc; } });
            Object.defineProperty(f, 'src', { set(v) { log.push('src'); f._src = v; }, get() { return f._src; } });
            return f;
        }
    };
    const fn = new Function('document', 'window', '_consTela', '_audioIncorporato',
        pezzo('function _senzaBarra', 'function _consApriMateriale') + '; return { _consMostra, _senzaBarra };')(
        documento, {}, () => tela, () => false);
    return Object.assign({ log, tela }, fn);
}

const COMPITO = '<!DOCTYPE html><html><head><title>Compito</title></head><body>' +
    '<div class="no-print"><button onclick="window.print()">Stampa</button></div>' +
    '<script>top.electronAPI.saveVaultFile({ relPath: "x", text: "y" })</script></body></html>';

test('_consMostra: una consegna entra in una sandbox VUOTA, messa prima del contenuto', () => {
    const a = ambiente();
    a._consMostra(COMPITO, null, true);
    const f = a.tela.figli[0];
    assert.equal(f.attr.sandbox, '', 'niente allow-scripts, niente allow-same-origin');
    assert.deepEqual(a.log, ['attr:sandbox', 'srcdoc', 'append']);
    assert.deepEqual(f.ascolti, [], 'nessun gancio che tocchi il documento da fuori');
    assert.match(f.srcdoc, /<style id="mm-doc-in-casa">\.no-print[^<]*<\/style><\/head>/,
        'la barra del foglio (bottoni inerti senza script) si spegne nel testo');
});

test('_consMostra: un materiale del docente resta fuori dalla sandbox', () => {
    const a = ambiente();
    a._consMostra('<!DOCTYPE html><html><head></head><body class="bs-body"></body></html>');
    const f = a.tela.figli[0];
    assert.equal(f.hasAttribute('sandbox'), false, 'la sintesi con la voce suona coi suoi script');
    assert.deepEqual(f.ascolti, ['load'], 'scalaTesto e nascondiInIframe lo raggiungono da fuori');
});

test('_senzaBarra: in coda al <head> quando c\'è, altrimenti in testa', () => {
    const a = ambiente();
    assert.match(a._senzaBarra('<HEAD><title>x</title></HEAD><body>'), /<title>x<\/title><style id="mm-doc-in-casa">[^<]*<\/style><\/HEAD><body>$/);
    assert.match(a._senzaBarra('<p>solo un frammento</p>'), /^<style id="mm-doc-in-casa">[^<]*<\/style><p>/);
    assert.equal(a._senzaBarra(null), '<style id="mm-doc-in-casa">.no-print,.mm-doc-bar,.mm-doc-spazio{display:none !important}</style>');
});
