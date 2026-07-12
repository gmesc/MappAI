'use strict';
/*
 * tutor-core.test.js — logica pura "Chatta e Scrivi" (007), headless (node --test)
 * Copre: cap scambi, validazione messaggi, publicState (whitelist: mai segreti),
 * buildChatPayload (google/infomaniak), extractText, computeTutorResults.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const TC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-tutor-core.js'));

// ── canSpend ────────────────────────────────────────────────────────────────
test('canSpend: cap rispettato, default su cap invalido', () => {
  assert.strictEqual(TC.canSpend({ used: 0 }, 10), true);
  assert.strictEqual(TC.canSpend({ used: 9 }, 10), true);
  assert.strictEqual(TC.canSpend({ used: 10 }, 10), false);
  assert.strictEqual(TC.canSpend({ used: 11 }, 10), false);
  // cap invalido → default (10): used 5 passa, used 10 no
  assert.strictEqual(TC.canSpend({ used: 5 }, 0), true);
  assert.strictEqual(TC.canSpend({ used: TC.LIMITS.capDefault }, NaN), false);
  // studente nuovo (used assente)
  assert.strictEqual(TC.canSpend({}, 3), true);
});

// ── validateMessage ─────────────────────────────────────────────────────────
test('validateMessage: vuoto/troppo lungo rifiutati, trim applicato', () => {
  assert.strictEqual(TC.validateMessage('', 100).ok, false);
  assert.strictEqual(TC.validateMessage('   ', 100).ok, false);
  assert.strictEqual(TC.validateMessage(null, 100).ok, false);
  assert.strictEqual(TC.validateMessage('x'.repeat(101), 100).ok, false);
  assert.strictEqual(TC.validateMessage('x'.repeat(101), 100).reason, 'too-long');
  const ok = TC.validateMessage('  ciao tutor  ', 100);
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.clean, 'ciao tutor');
  // default msgMax
  assert.strictEqual(TC.validateMessage('x'.repeat(TC.LIMITS.msgMax + 1)).ok, false);
});

// ── publicState: WHITELIST, mai segreti ─────────────────────────────────────
test('publicState: non espone adminToken/apiKey/systemInstruction/provider', () => {
  const session = {
    name: 'Fotosintesi', className: '1A',
    topic: { kind: 'branch', id: 'n9', label: 'Opere difensive' },
    mode: 'socratic', cap: 8, writingBrief: 'Scrivi 10 righe',
    adminToken: 'SEGRETO', apiKey: 'CHIAVE', provider: 'google',
    systemInstruction: 'ISTRUZIONI', model: 'gemini-2.5-flash', phase: 'running'
  };
  const pub = TC.publicState(session);
  const flat = JSON.stringify(pub);
  assert.ok(!flat.includes('SEGRETO'));
  assert.ok(!flat.includes('CHIAVE'));
  assert.ok(!flat.includes('ISTRUZIONI'));
  assert.ok(!flat.includes('google'));
  assert.ok(!flat.includes('gemini'));
  // il topic espone solo kind/label, non l'id interno
  assert.deepStrictEqual(pub.topic, { kind: 'branch', label: 'Opere difensive' });
  assert.strictEqual(pub.cap, 8);
  assert.strictEqual(pub.writingBrief, 'Scrivi 10 righe');
});

// ── buildChatPayload ────────────────────────────────────────────────────────
test('buildChatPayload google: systemInstruction + history + turno nuovo', () => {
  const p = TC.buildChatPayload({
    provider: 'google', systemInstruction: 'SEI IL TUTOR',
    transcript: [{ role: 'user', text: 'ciao' }, { role: 'tutor', text: 'benvenuto' }],
    userText: 'spiegami', maxTokens: 300
  });
  assert.strictEqual(p.systemInstruction.parts[0].text, 'SEI IL TUTOR');
  assert.strictEqual(p.contents.length, 3);
  assert.strictEqual(p.contents[1].role, 'model');   // tutor → model
  assert.strictEqual(p.contents[2].parts[0].text, 'spiegami');
  assert.strictEqual(p.generationConfig.maxOutputTokens, 300);
  // MAI responseMimeType (regola 6 CLAUDE.md non serve qui, ma verifichiamo l'assenza)
  assert.strictEqual(p.generationConfig.responseMimeType, undefined);
});

test('buildChatPayload infomaniak: messages OpenAI, niente responseMimeType', () => {
  const p = TC.buildChatPayload({
    provider: 'infomaniak', model: 'kimi', systemInstruction: 'SEI IL TUTOR',
    transcript: [{ role: 'tutor', text: 'benvenuto' }],
    userText: 'spiegami'
  });
  assert.strictEqual(p.model, 'kimi');
  assert.strictEqual(p.messages[0].role, 'system');
  assert.strictEqual(p.messages[1].role, 'assistant'); // tutor → assistant
  assert.strictEqual(p.messages[2].content, 'spiegami');
  assert.strictEqual(p.max_tokens, TC.LIMITS.maxTokens);
  assert.strictEqual(JSON.stringify(p).includes('responseMimeType'), false);
});

// ── extractText ─────────────────────────────────────────────────────────────
test('extractText: google e infomaniak, robusto su risposte rotte', () => {
  assert.strictEqual(TC.extractText('google',
    { candidates: [{ content: { parts: [{ text: 'risposta' }] } }] }), 'risposta');
  assert.strictEqual(TC.extractText('infomaniak',
    { choices: [{ message: { content: 'risposta' } }] }), 'risposta');
  assert.strictEqual(TC.extractText('google', null), '');
  assert.strictEqual(TC.extractText('infomaniak', { choices: [] }), '');
});

// ── computeTutorResults ─────────────────────────────────────────────────────
test('computeTutorResults: testo+trascrizione, mai-chattato segnalato, ordinati', () => {
  const session = { name: 'Foto', className: '1A', cap: 10, mode: 'socratic', topic: { label: 'Radici' } };
  const students = [
    {
      id: 'volpe-03', identity: { emojiKey: 'volpe', num: '03' }, phase: 'submitted', used: 4,
      transcript: [{ role: 'user', text: 'ciao', at: 'T1' }, { role: 'tutor', text: 'ehilà', at: 'T2' }],
      submission: { text: 'Il mio testo.', at: 'T3' }
    },
    {
      id: 'gufo-01', identity: { emojiKey: 'gufo', num: '01' }, phase: 'submitted', used: 0,
      transcript: [], submission: { text: 'Copiato?', at: 'T4' }
    }
  ];
  const r = TC.computeTutorResults(session, students);
  assert.strictEqual(r.students.length, 2);
  // ordinati per identità: gufo prima di volpe
  assert.strictEqual(r.students[0].identity.emojiKey, 'gufo');
  // mai chattato → flag
  assert.strictEqual(r.students[0].neverChatted, true);
  assert.strictEqual(r.students[1].neverChatted, false);
  assert.strictEqual(r.students[1].submissionText, 'Il mio testo.');
  assert.strictEqual(r.students[1].transcript.length, 2);
  assert.strictEqual(r.session.cap, 10);
});
