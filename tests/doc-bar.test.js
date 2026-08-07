/* La barra del documento: una sola, con i token --mm-doc-*.
 * Prima era copiata in sei file con tre glifi stampante diversi e le emoji nei
 * bottoni. I test guardano proprio quello: che i comandi ci siano, che le icone
 * siano SVG e che stampando la barra sparisca. */
const test = require('node:test');
const assert = require('node:assert');
const DB = require('../public/js/mappai-doc-bar.js');

test('i comandi predefiniti si nominano, non si riscrivono', () => {
    const h = DB.html({ titolo: 'Sintesi', azioni: ['salva', 'stampa', 'qr', 'chiudi'] });
    ['salva', 'stampa', 'qr', 'chiudi'].forEach(id => {
        assert.ok(h.includes('data-doc-azione="' + id + '"'), 'manca il comando ' + id);
    });
    assert.ok(h.includes('Sintesi'));
    assert.ok(/mm-doc-btn--primario/.test(h), 'Stampa è l’azione primaria');
});

test('nessuna emoji nei bottoni: le icone sono SVG (regola del progetto)', () => {
    const h = DB.html({ titolo: 'x', azioni: ['salva', 'stampa', 'qr', 'chiudi'] });
    assert.strictEqual((h.match(/<svg/g) || []).length, 4, 'un’icona per bottone');
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u.test(h),
        'niente emoji né frecce tipografiche nella barra');
    // ✕ e 🖨 erano i glifi delle sei copie
    assert.ok(!h.includes('✕') && !h.includes('🖨'));
});

test('default = stampa + chiudi, coi comandi che il browser conosce già', () => {
    const h = DB.html({});
    assert.ok(h.includes('window.print()'));
    assert.ok(h.includes('window.close()'));
});

test('i token vivono QUI, non nel foglio dell’app: una finestra staccata non lo carica', () => {
    const css = DB.stile();
    ['--mm-doc-h', '--mm-doc-fondo', '--mm-doc-bordo', '--mm-doc-accento', '--mm-doc-fs', '--mm-doc-r']
        .forEach(t => assert.ok(css.includes(t), 'manca il token ' + t));
    assert.ok(/@mediaprint\{[^}]*display:none/.test(css.replace(/\s/g, '')),
        'stampando la barra sparisce: è un comando, non il documento');
    assert.ok(/min-height:44px/.test(css.replace(/\s/g, '')), 'bersaglio da 44 anche qui');
});

test('un comando su misura convive con quelli predefiniti', () => {
    const h = DB.html({ azioni: ['stampa', { id: 'esci', icona: 'arrow-left', etichetta: 'Torna all’elenco' }] });
    assert.ok(h.includes('data-doc-azione="esci"'));
    assert.ok(h.includes('Torna all’elenco'));
});

test('il titolo si scrive escapato: un nome di mappa può contenere < o "', () => {
    const h = DB.html({ titolo: 'Mappa "1" <script>' });
    assert.ok(!h.includes('<script>'));
    assert.ok(h.includes('&lt;script&gt;'));
});
