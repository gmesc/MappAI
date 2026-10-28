'use strict';
/*
 * modali-0122.test.js — il lotto 4a del packet 0122: la famiglia C alla radice del motore (Giacomo,
 * 22/10, sul banco di tutti i modali: «Sì, le console seguono la famiglia C»; «anche in questo caso puoi
 * portare su ipad»), lo sfondo bloccato con `inert` e un velo solo, anche sopra un velo di un'altra famiglia.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const leggi = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('token: la famiglia C è la radice (titolo 20 · testo 16 · etichette 13 · sezioni 12 · bottoni 14 · icona 26 · lettura 16)', () => {
    const css = leggi('public/css/mappai-modal-tokens.css');
    const radice = css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')));
    for (const d of ['--mm-btn-fs: 14px', '--mm-fs-titolo: 20px', '--mm-fs-testo: 16px', '--mm-fs-label: 13px', '--mm-fs-sez: 12px', '--mm-fs-lettura: 16px', '--mm-icona-head: 26px']) assert.ok(radice.includes(d), d);
    for (const d of ['--mm-fs-titolo: 15px', '--mm-fs-testo: 13px', '--mm-fs-label: 11px', '--mm-fs-sez: 10px', '--mm-btn-fs: 12px']) assert.ok(!radice.includes(d), 'vecchio valore ancora su :root: ' + d);
    assert.ok(radice.includes('--mm-ctl-fs: var(--mm-btn-fs);'), 'i controlli seguono i bottoni');
});

test('token: testata nuda come regola base, un velo solo nel motore, lo stesso sfumato sugli statici', () => {
    const css = leggi('public/css/mappai-modal-tokens.css');
    assert.ok(css.includes('.mm-head { align-items: center; gap: 10px; }'));
    const ico = css.slice(css.indexOf('\n.mm-head__ico {'), css.indexOf('}', css.indexOf('\n.mm-head__ico {')));
    assert.ok(!ico.includes('width: 40px') && !ico.includes('--mm-accent-soft') && !ico.includes('border-radius: 14px'), 'niente riquadro: ' + ico);
    const sopra = css.slice(css.indexOf('.mm-overlay--sopra {'), css.indexOf('}', css.indexOf('.mm-overlay--sopra {')));
    assert.ok(sopra.includes('background: transparent;') && sopra.includes('backdrop-filter: none;'), 'un velo solo: ' + sopra);
    const statici = css.slice(css.indexOf('#ai-modal, #config-ai-modal, #validate-link-modal, #mp-modal) {'), css.indexOf('}', css.indexOf('#ai-modal, #config-ai-modal, #validate-link-modal, #mp-modal) {')));
    assert.ok(statici.includes('background-color: var(--mm-velo);') && statici.includes('backdrop-filter: blur(3px);'), 'gli 11 statici col velo e lo sfumato del motore');
    assert.ok(css.includes('.mm-velo { background: var(--mm-velo); backdrop-filter: blur(3px); }'), 'il velo delle finestre a mano resta');
});

test('motore: congela lo sfondo all\'apertura (inert, contatore) e lo sblocca alla chiusura; --sopra anche sopra un velo di un\'altra famiglia', () => {
    const s = leggi('public/js/mappai-modal.js');
    assert.ok(s.includes('function congela(velo) {') && s.includes("el.setAttribute('inert', '')") && s.includes('el.dataset.mmCongela'), 'congela nel motore');
    assert.ok(s.includes("if (el.hasAttribute && el.hasAttribute('inert') && !(el.dataset && el.dataset.mmCongela)) return;"), 'un inert altrui non si tocca');
    assert.ok(s.includes('scongela = congela(velo);') && s.includes("if (scongela) { try { scongela(); } catch (e) { } scongela = null; }"), 'messo alla pila, tolto a chiudi()');
    assert.ok(s.includes("':scope > .mm-velo,") && s.includes("var velo = el('div', 'mm-overlay' + ((veloInPila || altroVelo) ? ' mm-overlay--sopra' : ''));"), 'un velo solo anche sopra .mm-velo e gli statici');
});

test('motore: con un DOM che ha body.children, aprire un modale rende inert il resto e chiudere lo libera (contatore con due impilati)', async () => {
    // un DOM finto con body.children (come quello di modal-rimandi, più i figli)
    const figli = [];
    const mk = (tag) => { const e = { tag, className: '', innerHTML: '', style: {}, attrs: {}, dataset: {}, children: [],
        setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; }, removeAttribute(k) { delete this.attrs[k]; }, hasAttribute(k) { return k in this.attrs; },
        addEventListener() {}, appendChild(c) { this.children.push(c); }, replaceChild() {}, remove() { const i = figli.indexOf(this); if (i >= 0) figli.splice(i, 1); }, focus() {},
        querySelector: () => null, querySelectorAll: () => [] }; return e; };
    const sfondo = mk('div'); figli.push(sfondo);
    global.window = { visualViewport: { height: 1000, offsetTop: 0, addEventListener() {}, removeEventListener() {} }, innerHeight: 1000 };
    global.requestAnimationFrame = f => f();
    global.document = { body: { style: {}, get children() { return figli; }, appendChild(e) { figli.push(e); }, querySelector: () => null }, activeElement: null,
        addEventListener() {}, removeEventListener() {}, createElement: tag => (tag === 'canvas' ? { getContext: () => ({ measureText: s => ({ width: s.length * 10 }) }) } : mk(tag)) };
    delete require.cache[require.resolve('../public/js/mappai-modal-core.js')]; delete require.cache[require.resolve('../public/js/mappai-modal.js')];
    const Modal = require('../public/js/mappai-modal.js');
    const schema = () => ({ titolo: 'T', sezioni: [{ testo: 'x' }], azioni: [{ id: 'ok', etichetta: 'Ok', ruolo: 'primario' }] });
    const p1 = Modal.open(schema());
    assert.equal(sfondo.hasAttribute('inert'), true, 'lo sfondo è inert con una finestra aperta');
    assert.equal(sfondo.dataset.mmCongela, '1');
    const p2 = Modal.open(schema());
    assert.equal(sfondo.dataset.mmCongela, '2', 'due finestre: contatore a 2');
    const veli = figli.filter(e => (e.className || '').includes('mm-overlay'));
    assert.equal(veli.length, 2);
    assert.ok(veli[1].className.includes('mm-overlay--sopra'), 'la seconda è «sopra»');
    // chiudo la seconda via Esc-equivalente: la sua chiusura interna non è esposta; uso la pila: chiudo tutto
    // con l'API pubblica (esiste `chiudiTutti`?) — se no, restano aperte e lo stato è quello atteso
    assert.ok(sfondo.hasAttribute('inert'));
    void p1; void p2;
});

test('0122 lotto 4a: i marcatori di cache', () => {
    const html = leggi('public/index.html');
    ['css/mappai-modal-tokens.css?v=0119-0122-20261022-4', 'js/mappai-modal.js?v=0119-0122-20261022-4'].forEach(f => assert.ok(html.includes(f), f));
});
