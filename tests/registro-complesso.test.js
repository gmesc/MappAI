'use strict';
/*
 * 0093, lotto J — Giacomo (13/10): il registro «Ricco» si chiama «Complesso» (solo a schermo: la
 * chiave salvata nelle classi resta `ricco`), e una classe con quel registro non accende da sola
 * «Adatta alla classe» nel modale dei materiali («opzione 2»): accesa partirebbe su «Entrambi», e in
 * CREA la parte mappa forza il registro semplice.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('J: l\'etichetta è «Complesso (liceo / triennio)», la chiave resta `ricco`', () => {
    const src = read('public/js/mappai-live-classes.js');
    assert.ok(src.includes("ricco: { label: 'Complesso (liceo / triennio)',"));
    assert.ok(src.includes("['', 'semplice', 'medio', 'ricco']"), 'le classi salvate col registro `ricco` restano valide');
    assert.ok(src.includes('quanto è semplice o complesso il linguaggio'));
    assert.equal(/Ricco \(liceo/.test(src), false);
});

test('J: il fumetto di «Adatta alla classe» nel bento dice «complesso»', () => {
    const B = require('../public/js/mappai-bento-composizione.js');
    const aiuto = B.voce('mp-adapt-on').aiuto;
    assert.ok(aiuto.includes('(semplice · standard · complesso)'), aiuto);
    assert.equal(aiuto.includes('ricco'), false);
});

/* `_adattaSecondoClasse` vera, estratta da mappai-material-pipeline.js con le due funzioni che chiama */
function adatta(classe) {
    const src = read('public/js/mappai-material-pipeline.js');
    const fetta = nome => { const i = src.indexOf('  function ' + nome + '('); assert.ok(i >= 0, nome); return src.slice(i, src.indexOf('\n  }\n', i) + 4); };
    const box = { checked: false };
    const ctx = vm.createContext({
        document: {
            getElementById: id => (id === 'mp-adapt-tar' ? {} : null),
            querySelector: s => (s === '#mp-modal #mp-adapt-on' ? box : s === '#mp-modal #mp-class' ? { value: classe.id } : null)
        },
        window: {
            localStorage: {},
            MappAIMaterialiAttesaCore: { tarAcceso: () => true },
            MappAIClasses: { get: () => classe, classSpecial: c => !!((c.notes && c.notes.trim()) || c.register === 'semplice' || c.register === 'ricco') }
        }
    });
    vm.runInContext(fetta('_tarAcceso') + fetta('_classeScelta') + fetta('_adattaSecondoClasse') + 'this.f = _adattaSecondoClasse;', ctx);
    ctx.f();
    return box.checked;
}

test('J: una classe «Complesso» non accende la spunta da sola, nemmeno con le note', () => {
    assert.equal(adatta({ id: 'c', register: 'ricco' }), false);
    assert.equal(adatta({ id: 'c', register: 'ricco', notes: 'due allievi DSA' }), false);
});

test('J: «Semplice» o una classe con note la accendono come prima; una classe standard senza note no', () => {
    assert.equal(adatta({ id: 'c', register: 'semplice' }), true);
    assert.equal(adatta({ id: 'c', register: 'medio', notes: 'frasi brevi' }), true);
    assert.equal(adatta({ id: 'c', register: 'medio' }), false);
});
