'use strict';
// Packet 0119: due aggiunte facoltative a una sezione del motore dei modali.
//  · `rimandi` — testi cliccabili accanto al titolo della sezione («Come si fa?»,
//    «2B · n. 7» accanto a «Consegna una prova» sull'iPad);
//  · `figura.larga` — una schermata a tutta larghezza sopra il testo (le slide
//    della guida), dove la figura di prima è un quadratino da 112 px.
// Il motore AGGIUNGE e basta: uno schema che non le usa esce identico a prima.
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../public/js/mappai-modal-core.js');

/* un DOM finto quanto basta: ogni elemento ricorda i suoi ascoltatori */
const elementi = [];
/* la parte di schermo visibile: sull'iPad la tastiera la accorcia */
const vv = { height: 1000, offsetTop: 0, ascolta: {},
    addEventListener(n, f) { (this.ascolta[n] = this.ascolta[n] || []).push(f); },
    removeEventListener(n, f) { this.ascolta[n] = (this.ascolta[n] || []).filter(x => x !== f); },
    cambia(h, top) { this.height = h; this.offsetTop = top; (this.ascolta.resize || []).forEach(f => f()); } };
global.window = { visualViewport: vv, innerHeight: 1000 };
global.requestAnimationFrame = f => f();
global.document = {
    body: { style: {}, appendChild() {} },
    activeElement: null,
    addEventListener() {}, removeEventListener() {},
    createElement: tag => {
        if (tag === 'canvas') return { getContext: () => ({ measureText: s => ({ width: s.length * 10 }) }) };
        const e = {
            tag, className: '', innerHTML: '', style: {}, attrs: {}, ascolta: {},
            setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; }, removeAttribute(k) { delete this.attrs[k]; },
            addEventListener(n, f) { (this.ascolta[n] = this.ascolta[n] || []).push(f); },
            appendChild() {}, replaceChild() {}, remove() {}, focus() {},
            querySelector: () => null, querySelectorAll: () => []
        };
        elementi.push(e);
        return e;
    }
};
const Modal = require('../public/js/mappai-modal.js');

const conRimandi = () => ({
    titolo: 'Il tuo docente',
    sezioni: [{
        id: 'sc-invia', titolo: 'Consegna una prova',
        rimandi: [{ id: 'guida', etichetta: 'Come si fa?' }, { id: 'identita', etichetta: '2B · n. 7' }],
        voci: [{ id: 'invia:a', etichetta: 'Quiz' }]
    }],
    azioni: [{ id: 'chiudi', etichetta: 'Chiudi', ruolo: 'quieto' }]
});

test('normalizzaSezione: i rimandi diventano bottoni testuali che concludono, salvo chiude:false', () => {
    const s = Core.normalizzaSchema({
        titolo: 'X', sezioni: [{ titolo: 'T', rimandi: [{ id: 'a', etichetta: ' A ' }, { id: 'b', etichetta: 'B', chiude: false }, 'C'] }]
    }).sezioni[0];
    assert.deepEqual(s.rimandi.map(r => [r.id, r.etichetta, r.chiude]), [['a', 'A', true], ['b', 'B', false], ['rim-3', 'C', true]]);
});

test('normalizzaSezione: senza le chiavi nuove i rimandi sono vuoti e la figura resta quella di prima', () => {
    const s = Core.normalizzaSchema({ titolo: 'X', sezioni: [{ titolo: 'T', figura: { src: 'a.png', alt: 'a', tonda: true } }] }).sezioni[0];
    assert.deepEqual(s.rimandi, []);
    assert.deepEqual(s.figura, { src: 'a.png', alt: 'a', tonda: true, larga: false });
});

test('validaSchema: rimando senza etichetta o su una sezione senza titolo è un errore; più di due, un avviso', () => {
    const muto = Core.validaSchema({ titolo: 'X', sezioni: [{ titolo: 'T', rimandi: [{ id: 'a' }] }] });
    assert.equal(muto.ok, false);
    assert.ok(muto.errori.some(e => /rimando a senza etichetta/.test(e)), muto.errori.join(' | '));
    const orfano = Core.validaSchema({ titolo: 'X', sezioni: [{ testo: 't', rimandi: [{ id: 'a', etichetta: 'A' }] }] });
    assert.equal(orfano.ok, false);
    assert.ok(orfano.errori.some(e => /senza titolo/.test(e)), orfano.errori.join(' | '));
    const tre = Core.validaSchema({ titolo: 'X', sezioni: [{ titolo: 'T', rimandi: ['A', 'B', 'C'] }] });
    assert.equal(tre.ok, true);
    assert.ok(tre.avvisi.some(a => /3 rimandi/.test(a)), tre.avvisi.join(' | '));
    const id = Core.validaSchema({ titolo: 'X', sezioni: [{ titolo: 'T', rimandi: [{ id: 'z', etichetta: 'Z' }], voci: [{ id: 'z', etichetta: 'V' }] }] });
    assert.ok(id.errori.some(e => /id ripetuto: z/.test(e)), id.errori.join(' | '));
});

test('render: titolo e rimandi stanno nella stessa testata, i rimandi sono <button type="button"> con data-azione', () => {
    const html = Modal.render(conRimandi()).innerHTML;
    assert.ok(html.includes(
        '<div class="mm-sez__testa"><span class="mm-sez__t">Consegna una prova</span>' +
        '<span class="mm-sez__rimandi">' +
        '<button type="button" class="mm-rimando" data-azione="guida">Come si fa?</button>' +
        '<button type="button" class="mm-rimando" data-azione="identita">2B · n. 7</button>' +
        '</span></div>'), html);
});

test('render: la figura larga apre la sezione a tutta larghezza, col suo alt', () => {
    const html = Modal.render({ titolo: 'Guida', sezioni: [{ titolo: 'Scrivi chi sei', testo: 'Una volta sola.', figura: { src: 'img/scambio/1.png', alt: 'Il modale Chi sei', larga: true } }] }).innerHTML;
    assert.ok(html.includes('<img class="mm-fig mm-fig--larga" src="img/scambio/1.png" alt="Il modale Chi sei"><p class="mm-testo">Una volta sola.</p>'), html);
});

test('clic su un rimando: conclude con la sua azione, come una voce', async () => {
    elementi.length = 0;
    const p = Modal.open(conRimandi());
    const box = elementi.find(e => e.attrs.role === 'dialog');
    assert.ok(box, 'il modale si è disegnato');
    const btn = { getAttribute: k => (k === 'data-azione' ? 'guida' : null) };
    const ev = { target: { closest: sel => (sel === '[data-azione]' ? btn : null) }, preventDefault() {}, stopPropagation() {} };
    box.ascolta.click.forEach(f => f(ev));
    /* se il clic non conclude, la promessa resta aperta: scade dopo un secondo
       invece di tenere ferma la suite */
    let timer;
    const r = await Promise.race([p, new Promise(ok => { timer = setTimeout(() => ok('scaduto'), 1000); })]);
    clearTimeout(timer);
    assert.equal(r && r.azione, 'guida');
});

const IMPRONTA = '<div class="mm-sez" data-sez="sc-ricevi"><span class="mm-sez__t">Ricevi una mappa</span><div class="mm-sez__c"><div class="mm-voci"><button type="button" class="mm-voce" data-azione="scrivi"><span class="mm-voce__i"><i data-lucide="keyboard"></i></span><span class="mm-voce__t"><span class="mm-voce__n">Scrivi il codice</span><span class="mm-voce__s">Copia le lettere</span></span></button></div></div></div><div class="mm-sez" data-sez="sc-chi"><span class="mm-sez__t">Chi sei</span><div class="mm-sez__c"><img class="mm-fig mm-fig--tonda" src="a.png" alt="a"><p class="mm-testo">Classe 2B</p><div class="mm-sez__azioni"><button type="button" class="mm-btn mm-btn--secondario" data-azione="z"><span>Z</span></button></div><p class="mm-sez__esito">esito</p></div></div><div class="mm-sez is-chiusa" data-sez="sc-pieg"><button type="button" class="mm-sez__t mm-sez__t--tog" data-piega="sc-pieg" aria-expanded="false"><i data-lucide="chevron-down"></i><span>Piega</span></button><div class="mm-sez__c"><p class="mm-testo">t</p></div></div><div class="mm-sez" data-sez="sc-nuda"><div class="mm-sez__c"><p class="mm-testo">senza titolo</p></div></div></div>';

/* L'IMPRONTA: il motore di `main` (4e12352b) disegna questi schemi così. Senza
   rimandi né figura larga, il motore nuovo deve disegnare la stessa stringa. */
test('senza le chiavi nuove l\'HTML è identico a quello del motore di prima', () => {
    const schema = {
        titolo: 'Il tuo docente', sottotitolo: 'Ricevi le mappe e consegna le prove', icona: 'qr-code', taglia: 'm',
        sezioni: [
            { id: 'sc-ricevi', titolo: 'Ricevi una mappa', voci: [{ id: 'scrivi', etichetta: 'Scrivi il codice', sotto: 'Copia le lettere', icona: 'keyboard' }] },
            { id: 'sc-chi', titolo: 'Chi sei', figura: { src: 'a.png', alt: 'a', tonda: true }, testo: 'Classe 2B', sotto: 'esito', azioni: [{ id: 'z', etichetta: 'Z' }] },
            { id: 'sc-pieg', titolo: 'Piega', collassabile: true, chiusa: true, testo: 't' },
            { id: 'sc-nuda', testo: 'senza titolo' }
        ],
        azioni: [{ id: 'chiudi', etichetta: 'Chiudi', ruolo: 'quieto' }]
    };
    const html = Modal.render(schema).innerHTML;
    const corpo = html.slice(html.indexOf('<div class="mm-sez"'), html.indexOf('<div class="mm-foot'));
    assert.equal(corpo, IMPRONTA);
});

/* La tastiera a schermo dell'iPad (gate dello 0119, 21/10: «muovi la finestra di
   inserimento dei dati adattandola in base spazio visibile quando è aperta anche la
   tastiera a schermo, sia in portrait che in landscape»). Il velo segue la parte
   visibile: la finestra ci si centra dentro e non va sotto la tastiera. */
test('tastiera aperta: il velo si stringe alla parte visibile, e torna intero quando si chiude', async () => {
    elementi.length = 0;
    const p = Modal.open({ titolo: 'Chi sei', sezioni: [{ titolo: 'T', campi: [{ id: 'n', tipo: 'testo', etichetta: 'Numero' }] }], azioni: [{ id: 'ok', etichetta: 'Salva', ruolo: 'primario' }] });
    const velo = elementi.find(e => /mm-overlay/.test(e.className));
    assert.ok(velo, 'il velo esiste');
    assert.strictEqual(velo.attrs['data-tastiera'], undefined, 'senza tastiera il velo è quello di sempre');
    assert.strictEqual(velo.style.height || '', '');
    vv.cambia(560, 40);
    assert.strictEqual(velo.attrs['data-tastiera'], '1');
    assert.strictEqual(velo.style.top, '40px');
    assert.strictEqual(velo.style.height, '560px');
    vv.cambia(1000, 0);
    assert.strictEqual(velo.attrs['data-tastiera'], undefined, 'tastiera chiusa: di nuovo a tutto schermo');
    assert.strictEqual(velo.style.top, '');
    assert.strictEqual(velo.style.height, '');
    const box = elementi.find(e => e.attrs.role === 'dialog');
    const btn = { getAttribute: k => (k === 'data-azione' ? 'ok' : null) };
    box.ascolta.click.forEach(f => f({ target: { closest: sel => (sel === '[data-azione]' ? btn : null) }, preventDefault() {}, stopPropagation() {} }));
    let timer;
    await Promise.race([p, new Promise(ok => { timer = setTimeout(ok, 1000); })]);
    clearTimeout(timer);
    assert.strictEqual((vv.ascolta.resize || []).length, 0, 'chiusa la finestra, nessuno ascolta più la tastiera');
});


/* SENZA TESTATA (gate dello 0119, 21/10, Giacomo sul modale «Docente» dell'iPad:
   «elimina il titolo 'Il tuo docente' e anche il sottotitolo, elimina anche la 'x'
   perché c'è già il bottone 'Chiudi' a fondo pagina»). Il titolo resta: è il nome
   della finestra per chi legge con lo schermo. */
test('senzaTestata: niente titolo, sottotitolo né ×; il nome accessibile resta; senza un bottone per uscire è un errore', () => {
    const schema = { titolo: 'Il tuo docente', sottotitolo: 'Ricevi le mappe', senzaTestata: true,
        sezioni: [{ testo: 'x' }], azioni: [{ id: 'chiudi', etichetta: 'Chiudi', ruolo: 'quieto' }] };
    assert.strictEqual(Core.normalizzaSchema(schema).senzaTestata, true);
    const box = Modal.render(schema);
    assert.strictEqual(box.innerHTML.includes('mm-head'), false, 'nessuna testata');
    assert.strictEqual(box.innerHTML.includes('mm-close'), false, 'nessuna ×');
    assert.strictEqual(box.innerHTML.includes('Ricevi le mappe'), false, 'nessun sottotitolo');
    assert.strictEqual(box.attrs['aria-label'], 'Il tuo docente');
    assert.strictEqual(Core.validaSchema(schema).ok, true);
    const muto = Core.validaSchema({ titolo: 'X', senzaTestata: true, sezioni: [{ testo: 'x' }] });
    assert.strictEqual(muto.ok, false);
    assert.ok(muto.errori.some(e => /senza testata/.test(e)), muto.errori.join(' | '));
    assert.strictEqual(Modal.render({ titolo: 'Con', sezioni: [{ testo: 'x' }] }).innerHTML.includes('mm-close'), true, 'di norma la testata c\'è');
});

/* Il testo del docente sotto il QR «Vault su iPad» nomina i comandi che l'allievo
   vede sull'iPad (allargamento 1 dello 0119, 21/10: «allarga lo 0119 e correggi il
   testo del docente»). Prima diceva «Docente › Ricevi — inquadra il QR o scrivi
   questo indirizzo», e sull'iPad «Ricevi» e «scrivi» non ci sono più. */
test('QR «Vault su iPad»: il testo del docente dice «Ricevi un vault» e «Inserisci link», in italiano e in inglese', () => {
    const fs = require('fs'), path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mappai-live-teacher.js'), 'utf8');
    const it = /t\('sd_qr_studente', '((?:[^'\\]|\\.)*)'\)/.exec(src);
    assert.ok(it, 'la stringa c\'è');
    assert.strictEqual(/Ricevi un vault/.test(it[1]) && /Inserisci link/.test(it[1]), true, it[1]);
    const en = /sd_qr_studente:\s*"([^"]*)"/.exec(fs.readFileSync(path.join(__dirname, '..', 'public', 'traduzioni', 'en_translations.js'), 'utf8'));
    assert.ok(en, 'la chiave inglese c\'è');
    assert.strictEqual(/Receive a vault/.test(en[1]) && /Insert link/.test(en[1]), true, en[1]);
});
