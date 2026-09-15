'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// KaTeX è vendorizzato dal 15/9/2026. Prima foglio ed estensione auto-render
// venivano da cdnjs: in aula senza rete le formule perdevano lo stile e
// `renderMathInElement` non esisteva proprio, quindi mappai-latex.js:26 usciva in
// silenzio e a schermo restava il TeX grezzo. Questi test sono la guardia perché
// non ci torni: chi rimette un URL di rete, o sposta un font, li fa diventare rossi.

const ROOT = path.join(__dirname, '..');
const VENDOR = path.join(ROOT, 'public/js/vendor');
const leggi = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('index.html non carica KaTeX dalla rete', () => {
    const html = leggi('public/index.html');
    const rete = html.match(/<(?:link|script)[^>]*\bhttps?:\/\/[^>]*katex[^>]*>/gi) || [];
    assert.deepEqual(rete, [], 'trovato un KaTeX remoto in index.html');
});

test('index.html carica i tre pezzi locali di KaTeX', () => {
    const html = leggi('public/index.html');
    for (const f of ['js/vendor/katex-0.16.9.min.css',
                     'js/vendor/katex-0.16.9.min.js',
                     'js/vendor/katex-auto-render-0.16.9.min.js']) {
        assert.ok(html.includes(f), `manca il riferimento a ${f}`);
        assert.ok(fs.existsSync(path.join(ROOT, 'public', f)), `manca il file ${f}`);
    }
});

test('il foglio KaTeX non chiama la rete e i suoi font esistono tutti', () => {
    const css = leggi('public/js/vendor/katex-0.16.9.min.css');
    assert.equal(/url\(\s*['"]?https?:/i.test(css), false, 'url remoto nel foglio KaTeX');

    const url = [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map(m => m[1]);
    assert.ok(url.length >= 20, `attesi almeno 20 font, trovati ${url.length}`);
    for (const u of url) {
        // Il foglio sta in js/vendor/: i percorsi sono relativi a QUELLA cartella.
        assert.ok(fs.existsSync(path.join(VENDOR, u)), `font mancante: ${u}`);
    }
});

test('caricati come <script>, katex e renderMathInElement finiscono su window', () => {
    // Percorso BROWSER: niente module/exports/define, o la UMD prende il ramo
    // CommonJS e cerca un pacchetto npm «katex» che questo repo non ha.
    const win = {}; win.window = win; win.self = win; win.document = {};
    const ctx = vm.createContext(win);
    vm.runInContext(leggi('public/js/vendor/katex-0.16.9.min.js'), ctx, { filename: 'katex.js' });
    vm.runInContext(leggi('public/js/vendor/katex-auto-render-0.16.9.min.js'), ctx, { filename: 'auto-render.js' });

    assert.equal(typeof win.katex, 'object');
    assert.equal(typeof win.renderMathInElement, 'function');

    // La resa usa le classi che il foglio locale stila, e la via MathML della
    // sintesi (mappai-branch-synthesis.js:174) risponde senza foglio né font.
    assert.match(win.katex.renderToString('E = mc^2'), /class="katex"/);
    assert.match(win.katex.renderToString('E = mc^2', { output: 'mathml' }), /<math/);
});
