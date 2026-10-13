'use strict';
/*
 * 0093, lotto I — difetto 41 della guida: Cabina › «Privacy» diceva «non c'è un server di MappAI»,
 * falso con le attività via QR in modalità «Internet» (la sessione passa da live.insegnai.ch);
 * e per la classe non citava la disciplina, che alla taratura arriva (`buildTuningBlock`).
 * Decisione di Giacomo (13/10): solo le due frasi «Dove vivono i dati» e «I profili degli allievi».
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const CAB = read('public/js/mappai-cabina.js');
const EN = read('public/traduzioni/en_translations.js');

test('41: «Dove vivono i dati» non nega più il server, e dice che cosa fa', () => {
    assert.equal(CAB.includes('non c’è un server di MappAI'), false);
    assert.ok(CAB.includes('L’unico server di MappAI serve alle attività via QR in modalità «Internet» (live.insegnai.ch, presso Infomaniak): fa passare la sessione e non la conserva.'));
    assert.equal(EN.includes('no MappAI server'), false);
    assert.ok(/cb_pv_dove_d: "[^"]*The only MappAI server is for QR activities in «Internet» mode \(live\.insegnai\.ch/.test(EN));
});

test('41: per la classe la taratura cita anche la disciplina, che arriva davvero al prompt', () => {
    assert.ok(CAB.includes('(per una classe: grado, disciplina, registro e note)'));
    assert.ok(EN.includes('(for a class: grade, subject, register and notes)'));
    assert.ok(read('public/js/mappai-live-classes.js').includes("lines.push(t('cls_tune_disc', 'Disciplina: ') + disc + '.')"), 'la disciplina entra nel blocco della classe');
});

test('41: «Le attività in classe» resta com\'era (Giacomo: solo le due frasi di ADMIN)', () => {
    assert.ok(CAB.includes('Mappa LIVE, quiz LIVE e Chiedi e Rispondi restano sulla rete locale'));
});
