'use strict';
// Packet 0126, allargamento 1 (Giacomo, 25/10: «l'interruttore dentro il riquadro delle
// tabelle, sopra la prima, con la prova che gli altri modali restano identici»).
// Una sezione con `colonna: 'materiali'` si disegna in cima alle tabelle: nel riquadro
// `materiali` del bento, o subito sopra `tabelle` in una console senza bento. La usa
// MappAI Studente per «Prove: Semplice / Meta». Il motore AGGIUNGE e basta: uno schema
// che non la usa esce identico a prima (l'impronta qui sotto, dal motore di d191cb01).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

/* un DOM finto quanto basta a `render`, come in modal-rimandi.test.js */
global.window = global.window || { innerHeight: 1000 };
global.requestAnimationFrame = global.requestAnimationFrame || (f => f());
global.document = global.document || {
    body: { style: {}, appendChild() {} },
    activeElement: null,
    addEventListener() {}, removeEventListener() {},
    createElement: tag => {
        if (tag === 'canvas') return { getContext: () => ({ measureText: s => ({ width: s.length * 10 }) }) };
        return {
            tag, className: '', innerHTML: '', style: {}, attrs: {}, ascolta: {},
            setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; }, removeAttribute(k) { delete this.attrs[k]; },
            addEventListener(n, f) { (this.ascolta[n] = this.ascolta[n] || []).push(f); },
            appendChild() {}, replaceChild() {}, remove() {}, focus() {},
            querySelector: () => null, querySelectorAll: () => []
        };
    }
};
const Modal = require('../public/js/mappai-modal.js');
const html = (s) => Modal.render(s).innerHTML;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

const TABELLE = [
    { id: 'prove-aperte', titolo: 'Domande aperte', colonne: [{ etichetta: 'Angolo' }, { etichetta: 'Domande', larghezza: '120px' }], righe: [{ id: 'aperte:0', celle: ['Causa', '8'] }] },
    { id: 'prove-mc', titolo: 'Scelta multipla', colonne: [{ etichetta: 'Angolo' }, { etichetta: 'Domande', larghezza: '120px' }], righe: [{ id: 'mc:s1', celle: ['Definizione', '10'] }] }
];
const MODO = {
    id: 'prove-modo', colonna: 'materiali', campi: [
        { id: 'modo-nota', tipo: 'nota', etichetta: 'Prove:' },
        { id: 'modo-semplice', tipo: 'radio', gruppo: 'prove-modo', etichetta: 'Semplice', valore: true },
        { id: 'modo-meta', tipo: 'radio', gruppo: 'prove-modo', etichetta: 'Meta', valore: false }
    ]
};
const NAV = [{ gruppo: 'Scienze', id: 'g:Scienze' }, { id: 'v:a', etichetta: 'Sistema Albero', icona: 'map', attiva: true, chiude: false }];
function consoleBento(sezioni) {
    return {
        id: 'studia', titolo: 'Studia', taglia: 'xl', layout: 'console', piena: true, invio: false, area: 'una', nav: NAV, sezioni: sezioni || [], azioni: [],
        bento: [
            { id: 'mappa-azioni', nuda: true, span: 4, altezza: 145, voci: [{ id: 'mappa', et: 'Mappa', forma: 'azione', icona: 'git-merge' }] },
            { id: 'mappa-materiali', nuda: true, span: 4, voci: [{ id: 'mat', et: 'Materiali', forma: 'materiali', vuoto: 'niente' }] }
        ],
        tabelle: TABELLE
    };
}
function consoleSemplice(sezioni) {
    return { id: 'c', titolo: 'Console', taglia: 'xl', layout: 'console', invio: false, nav: NAV, sezioni: sezioni || [], azioni: [], tabelle: TABELLE };
}

/* allargamento 2 (Giacomo, 25/10): «Sposta il botten per le opzioni 'Semplice' e 'Meta' di fianco al titolo della tabella
   'DOMANDE APERTE'». La sezione `materiali` entra nella riga del titolo della PRIMA tabella: bottone del titolo, la riga,
   il contatore, poi la tabella — figli diretti di `.mm-tabg`, così la freccia e la piega restano quelle di sempre. */
function primaTabella(h) {
  const i = h.indexOf('<div class="mm-tabg'), j = h.indexOf('<div class="mm-tabg', i + 5);
  return h.slice(i, j < 0 ? h.length : j);
}
test('0126: con il bento, la sezione `materiali` sta sulla riga del titolo della prima tabella', () => {
  const h = html(consoleBento([MODO]));
  const t = primaTabella(h);
  assert.equal(t.startsWith('<div class="mm-tabg mm-tabg--testa"'), true, 'la prima tabella lo sa');
  const tit = t.indexOf('<button type="button" class="mm-tabg__t'), riga = t.indexOf('<div class="mm-filtri mm-filtri--tabelle">'), n = t.indexOf('<span class="mm-tabg__n">'), corpo = t.indexOf('<div class="mm-sez__c">');
  assert.equal(tit >= 0 && tit < riga && riga < n && n < corpo, true, 'titolo, interruttore, contatore, tabella');
  assert.equal(t.slice(tit, riga).indexOf('mm-tabg__n'), -1, 'il contatore non è più dentro il bottone del titolo');
  assert.equal(h.indexOf('<div class="mm-filtri">'), -1, 'non anche nella riga in cima all\'area');
  assert.equal((h.match(/data-campo="modo-/g) || []).length, 2, 'una volta sola');
  assert.equal(primaTabella(h.slice(h.indexOf(t) + t.length)).indexOf('mm-tabg--testa'), -1, 'solo la prima tabella');
});

test('0126: senza bento, la sezione `materiali` sta sulla riga del titolo della prima tabella, non fra le sezioni', () => {
  const h = html(consoleSemplice([{ id: 'x', testo: 'una sezione' }, MODO]));
  const t = primaTabella(h);
  assert.equal(t.startsWith('<div class="mm-tabg mm-tabg--testa"'), true);
  assert.equal(t.indexOf('<div class="mm-filtri mm-filtri--tabelle">') > 0, true);
  assert.equal(h.indexOf('data-sez="prove-modo"'), -1, 'non disegnata anche come sezione dell\'area');
});

/* L'IMPRONTA: questi schemi non usano la chiave nuova; il motore di main d191cb01 li
   disegna così. Sono le forme che la riga tocca: console con e senza bento, filtri,
   barra, lato, sezioni dell'area, tabella singola e tabelle; e un modale semplice. */
function corpus() {
    const filtri = { id: 'f', colonna: 'filtri', campi: [{ id: 'v', tipo: 'scelta', etichetta: 'Mostra', valore: 'a', opzioni: [{ valore: 'a', etichetta: 'A' }, { valore: 'b', etichetta: 'B' }] }] };
    return [
        consoleBento([]),
        consoleBento([filtri]),
        consoleBento([Object.assign({}, MODO, { colonna: 'filtri' })]),
        consoleSemplice([]),
        consoleSemplice([filtri, { id: 'b', colonna: 'barra', azioni: [{ id: 'z', etichetta: 'Z' }] }, { id: 'l', colonna: 'lato', testo: 'lato' }, { id: 's1', titolo: 'Sezione', testo: 't' }]),
        Object.assign(consoleSemplice([{ id: 's', testo: 'x' }]), { tabelle: [], tabella: { colonne: ['A', 'B'], righe: [['1', '2']] } }),
        { titolo: 'Modale', icona: 'info', sezioni: [{ titolo: 'Uno', campi: [{ id: 'r1', tipo: 'radio', gruppo: 'g', etichetta: 'Sì', valore: true }, { id: 'r2', tipo: 'radio', gruppo: 'g', etichetta: 'No' }] }, { testo: 'testo' }], azioni: [{ id: 'ok', etichetta: 'OK', ruolo: 'primario' }] },
        { titolo: 'Cruscotto', layout: 'cruscotto', sezioni: [{ id: 'p', colonna: 'principale', testo: 'p' }, { id: 'q', colonna: 'lato', testo: 'q' }] }
    ];
}
const IMPRONTA = 'e22baffde54eb78b';

test('0126: gli schemi senza la sezione `materiali` escono identici (impronta del motore di main)', () => {
    assert.equal(sha(corpus().map(html).join('\n§\n')), IMPRONTA);
});

module.exports = { corpus, html };
