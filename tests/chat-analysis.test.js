// tests/chat-analysis.test.js — metriche deterministiche di mappai-chat-analysis.js
const test = require('node:test');
const assert = require('node:assert');
const CA = require('../public/js/mappai-chat-analysis.js');

test('_questionType: classificazione domande italiane', () => {
  assert.strictEqual(CA._questionType('perché la clorofilla è verde?'), 'causale');
  assert.strictEqual(CA._questionType('come funziona la fotosintesi?'), 'procedurale');
  assert.strictEqual(CA._questionType('cosa succede se manca la luce?'), 'ipotetica');
  assert.strictEqual(CA._questionType('e se non ci fosse ossigeno?'), 'ipotetica');
  assert.strictEqual(CA._questionType('quando è avvenuta la scoperta?'), 'fattuale');
  // il vecchio / se / marcava come ipotetica qualsiasi frase con "se"
  assert.strictEqual(CA._questionType('non so se ho capito, quando avviene?'), 'fattuale');
  assert.strictEqual(CA._questionType('anche se difficile, chi lo ha scoperto?'), 'fattuale');
});

test('analyzeChat: volume, stile e byMode dai turni taggati', () => {
  const tutorState = {
    sidebar: { history: [
      { role: 'user', parts: [{ text: 'Perché le piante sono verdi?' }], mode: 'socratic' },
      { role: 'model', parts: [{ text: 'Ottima domanda...' }] },
      { role: 'user', parts: [{ text: 'Quindi la clorofilla assorbe la luce rossa.' }], mode: 'socratic' }
    ] },
    nodes: {
      n1: { history: [
        { role: 'user', parts: [{ text: 'Cosa succede se manca la luce?' }], mode: 'devil' }
      ] }
    }
  };
  const res = CA.analyzeChat(tutorState, ['Clorofilla', 'Fotosintesi']);
  assert.strictEqual(res.volume.userTurns, 3);
  assert.strictEqual(res.volume.questions, 2);
  assert.strictEqual(res.volume.nodesWithChat, 1);
  assert.strictEqual(res.questionStyle.types.causale, 1);
  assert.strictEqual(res.questionStyle.types.ipotetica, 1);
  assert.strictEqual(res.questionStyle.reformulations, 1); // "Quindi..."
  assert.strictEqual(res.byMode.socratic.turns, 2);
  assert.strictEqual(res.byMode.devil.turns, 1);
  assert.strictEqual(res.confidence, 'media');
  assert.ok(res.language.disciplinaryAdoption > 0); // "clorofilla" usata in chat
});

test('analyzeChat: tutorState vuoto/assente non crasha', () => {
  const res = CA.analyzeChat(null, []);
  assert.strictEqual(res.volume.userTurns, 0);
  assert.strictEqual(res.confidence, 'bassa');
});
