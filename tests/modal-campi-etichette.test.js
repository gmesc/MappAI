// tests/modal-campi-etichette.test.js — il nome del campo quando il segnaposto
// non può dirlo (16/8/26)
//
// Difetto segnalato da Giacomo sul modale «Genera con l'AI» delle domande
// aperte: si leggevano un «5» e un «40» senza sapere che cosa fossero, e due
// tendine senza nome. La decisione 4 (31/7) — «solo segnaposto, niente
// etichetta sopra il campo» — regge per un campo di testo VUOTO, dove il nome
// si legge finché non si scrive; non regge dove il segnaposto non compare mai:
// un select mostra sempre un'opzione, un campo con un valore di partenza mostra
// sempre quel valore.
const test = require('node:test');
const assert = require('node:assert');

global.window = {};
/* DOM finto ridotto all'osso: `render()` crea UN elemento e gli assegna
   `innerHTML`. Non serve un DOM vero — qui si legge il MARKUP che il motore
   produce, che è esattamente ciò che questa prova deve tenere fermo. */
global.document = {
    createElement: () => ({
        className: '', innerHTML: '', _attr: {},
        setAttribute(k, v) { this._attr[k] = v; },
        appendChild() { }, addEventListener() { }, removeEventListener() { },
        querySelector: () => null, querySelectorAll: () => []
    }),
    // il modulo aggancia il trascinamento delle colonne al caricamento
    addEventListener() { }, removeEventListener() { }
};
const M = require('../public/js/mappai-modal.js');

function html(campi) {
    return M.render({ titolo: 'Prova', sezioni: [{ campi: campi }] }).innerHTML;
}
/* ⚠️ Il motore ESCAPA il testo: un'etichetta con l'apostrofo esce come
   `d&#39;avvio`. Cercare la stringa nuda faceva fallire la prova su un codice
   giusto — errore mio, non del motore. */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const haLabel = (h, testo) => h.indexOf('class="mm-label"') >= 0 && h.indexOf('>' + esc(testo) + '<') >= 0;

test('un campo di testo VUOTO resta col solo segnaposto (decisione 4)', () => {
    const h = html([{ id: 'nome', etichetta: 'Nome (facoltativo)' }]);
    assert.match(h, /placeholder="Nome \(facoltativo\)"/, 'il nome si legge nel segnaposto');
    assert.strictEqual(h.indexOf('class="mm-label"'), -1, 'e non si ripete sopra il campo');
});

test('una TENDINA porta sempre il nome: il segnaposto non compare mai', () => {
    const h = html([{ id: 'area', tipo: 'scelta', etichetta: 'Su quale area', valore: 'all',
        opzioni: [{ valore: 'all', etichetta: 'Tutta la mappa' }] }]);
    assert.ok(haLabel(h, 'Su quale area'), 'l\'etichetta è visibile');
    assert.match(h, /<label class="mm-label" for="mmf-area"/, 'ed è legata al campo (cliccabile, e per lo screen reader)');
});

test('un campo con un VALORE di partenza porta il nome', () => {
    const h = html([{ id: 'quante', tipo: 'numero', etichetta: 'Quante domande per area', valore: 5 }]);
    assert.ok(haLabel(h, 'Quante domande per area'),
        'senza, a schermo resta un «5» che non dice niente — il difetto segnalato');
});

test('valore 0 conta come valore: anche lì il segnaposto non si vedrebbe', () => {
    const h = html([{ id: 'base', tipo: 'numero', etichetta: 'Domande d\'avvio (%)', valore: 0 }]);
    assert.ok(haLabel(h, 'Domande d\'avvio (%)'), '0 è un valore, non un campo vuoto');
});

test('un campo COLORE porta il nome (mostra sempre un colore)', () => {
    const h = html([{ id: 'c', tipo: 'colore', etichetta: 'Colore del ramo', valore: '#4f46e5' }]);
    assert.ok(haLabel(h, 'Colore del ramo'));
});

test('spunte e radio non cambiano: il nome ce l\'hanno già accanto', () => {
    const h = html([{ id: 's', tipo: 'spunta', etichetta: 'Adatta alla classe', valore: true }]);
    assert.strictEqual(h.indexOf('class="mm-label"'), -1, 'niente etichetta doppia');
    assert.match(h, /mm-opz__t">Adatta alla classe/);
});

test('metà larghezza CON spiegazione: la riga non si stringe, il controllo sì', () => {
    const h = html([{ id: 'base', tipo: 'numero', etichetta: 'Domande d\'avvio (%)', valore: 40,
        larghezza: 'meta', aiuto: 'Una spiegazione lunga che a metà riga si incolonnerebbe.' }]);
    assert.match(h, /mm-campo-riga--meta mm-campo-riga--spiegato/,
        'la riga si marca, e il CSS le ridà larghezza piena');
});

test('metà larghezza SENZA spiegazione: resta affiancabile', () => {
    const h = html([{ id: 'q', tipo: 'numero', etichetta: 'Quante', valore: 5, larghezza: 'meta' }]);
    assert.match(h, /mm-campo-riga--meta/);
    assert.strictEqual(h.indexOf('mm-campo-riga--spiegato'), -1,
        'le coppie di campi affiancati non devono cambiare');
});

/* ── campi su più colonne (16/8) ───────────────────────────────────────────
   Nato dalle otto angolazioni delle domande aperte: in colonna fanno scorrere
   il modale. Il contenitore avvolge SOLO i campi — testo e riga di esito
   restano a tutta larghezza, o si leggerebbero in due strisce strette. */
function sezione(s) {
    return M.render({ titolo: 'Prova', sezioni: [s] }).innerHTML;
}

test('colonne: 2 avvolge i campi in un contenitore a griglia', () => {
    const h = sezione({ titolo: 'Angolazioni', colonne: 2, campi: [
        { id: 'a', tipo: 'spunta', etichetta: 'Causa' },
        { id: 'b', tipo: 'spunta', etichetta: 'Conseguenza' }
    ] });
    assert.match(h, /<div class="mm-campi mm-campi--2">/);
    assert.match(h, /mm-campi--2">\s*<label class="mm-opz"/, 'e i campi ci stanno dentro');
});

test('colonne: il testo e la riga di esito NON entrano nella griglia', () => {
    const h = sezione({ titolo: 'A', colonne: 2, testo: 'Una spiegazione.', sotto: 'Un foglio.',
        campi: [{ id: 'a', tipo: 'spunta', etichetta: 'Causa' }] });
    const iTesto = h.indexOf('Una spiegazione.');
    const iGriglia = h.indexOf('mm-campi--2');
    const iSotto = h.indexOf('Un foglio.');
    assert.ok(iTesto < iGriglia, 'la spiegazione sta PRIMA della griglia');
    assert.ok(iSotto > iGriglia, 'e l\'esito DOPO');
});

test('senza `colonne` il markup non cambia (nessun contenitore in più)', () => {
    const h = sezione({ titolo: 'A', campi: [{ id: 'a', tipo: 'spunta', etichetta: 'Causa' }] });
    assert.strictEqual(h.indexOf('mm-campi'), -1,
        'le sezioni che non le chiedono non devono guadagnare un div');
});

test('colonne: un valore non previsto viene ignorato, non emesso', () => {
    [1, 4, 'due', null].forEach(v => {
        const h = sezione({ titolo: 'A', colonne: v, campi: [{ id: 'a', tipo: 'spunta', etichetta: 'X' }] });
        assert.strictEqual(h.indexOf('mm-campi'), -1, 'colonne=' + JSON.stringify(v) + ' non produce griglia');
    });
});
