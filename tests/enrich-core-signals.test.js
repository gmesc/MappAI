// Test dei segnali di "imparabilità" aggiunti a analyzeTextSignals
// (mappai-enrich-core.js): Gulpease per paragrafo, densità nessi per famiglia,
// esempi/analogie, termini-prima-della-definizione, candidati glossario.
// Verifiche deterministiche + invarianti + retrocompatibilità dei campi esistenti.
const { test } = require('node:test');
const assert = require('node:assert');
const EC = require('../public/js/mappai-enrich-core.js');
const Relations = require('../public/js/mappai-relations.js');

// Corpus di CONTROLLO identico a enrich-core.test.js (retrocompatibilità).
const CONTROL = [
  'La clorofilla cattura la luce solare nei cloroplasti delle foglie verdi.',
  'Durante la fotosintesi le piante trasformano anidride carbonica e acqua in glucosio.',
  'Il glucosio prodotto fornisce energia chimica immagazzinata dalla pianta.',
  'Le radici assorbono acqua e sali minerali dal terreno umido.',
  'Gli stomi delle foglie regolano lo scambio dei gas con l’atmosfera esterna.',
  'La respirazione cellulare libera l’energia contenuta nel glucosio durante la notte.'
].join('\n');

// Ripete una frase con un termine per raggiungere una freq nota, senza definirlo.
function repeatTerm(term, n) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push('La ' + term + ' entra qui nel test ' + i + ' con cura.');
  return out.join(' ');
}

// ── 1. Gulpease: paragrafo con conteggi noti → score = formula (±1) ──
test('Gulpease: score di un paragrafo = 89 + (300×frasi − 10×lettere)/parole (±1)', () => {
  // Paragrafo ASCII (una sola frase): conteggi verificabili indipendentemente.
  const para = 'il gatto nero dorme sul divano rosso mentre la pioggia batte forte contro la finestra della vecchia casa.';
  const t = EC.analyzeTextSignals(para);
  const p = t.gulpease.perParagraph[0];
  assert.ok(p, 'un paragrafo misurato');
  // conteggi indipendenti (ASCII → /[a-z]/ ≡ regex del modulo)
  const words = (para.match(/\S+/g) || []).length;
  const letters = (para.match(/[a-z]/gi) || []).length;
  assert.strictEqual(p.words, words, 'parole raw');
  assert.strictEqual(p.sentences, 1, 'una frase');
  assert.strictEqual(p.letters, letters, 'lettere raw');
  const expected = Math.round(Math.max(0, Math.min(100, 89 + (300 * 1 - 10 * letters) / words)));
  assert.ok(Math.abs(p.score - expected) <= 1, 'score ' + p.score + ' ~ atteso ' + expected);
  assert.strictEqual(t.gulpease.avg, p.score, 'avg = unico score');
});

// ── 2. Gulpease: media su più paragrafi + worstParagraphs ordinati ──
test('Gulpease: avg su più paragrafi e worstParagraphs (index+score, i peggiori)', () => {
  const paras = [
    'la neve cade lieve sopra i tetti bianchi del piccolo paese addormentato tra le colline gelate.',
    'lorganizzazione amministrativa territoriale rappresentava uninterdipendenza istituzionale profondamente complessa strutturata gerarchicamente attraverso procedimenti burocratici particolarmente farraginosi.',
    'il cane corre felice lungo la riva del fiume mentre il sole tramonta dietro le montagne lontane.'
  ].join('\n\n');
  const t = EC.analyzeTextSignals(paras);
  assert.strictEqual(t.gulpease.perParagraph.length, 3, 'tre paragrafi misurati');
  assert.strictEqual(typeof t.gulpease.avg, 'number', 'avg numerico');
  assert.ok(t.gulpease.worstParagraphs.length >= 1 && t.gulpease.worstParagraphs.length <= 3);
  // worstParagraphs ordinati per score crescente e con index+score
  const w = t.gulpease.worstParagraphs;
  for (const item of w) {
    assert.ok(Number.isInteger(item.index) && typeof item.score === 'number', 'index+score');
  }
  for (let i = 1; i < w.length; i++) assert.ok(w[i - 1].score <= w[i].score, 'ordine crescente');
  // il paragrafo 1 (denso di parole lunghe, una frase) è il più difficile
  assert.strictEqual(w[0].index, 1, 'il paragrafo denso è il peggiore');
});

// ── 3. Gulpease: paragrafi troppo corti = rumore, esclusi ──
test('Gulpease: paragrafi sotto la soglia parole vengono ignorati', () => {
  const t = EC.analyzeTextSignals('riga corta.\n' + 'questo paragrafo invece contiene abbastanza parole per essere misurato senza problemi dal calcolo della leggibilita complessiva.');
  assert.strictEqual(t.gulpease.perParagraph.length, 1, 'solo il paragrafo lungo è misurato');
});

// ── 4. Segnale gulpease_low su testo denso ──
test('Segnale gulpease_low quando la media scende sotto la soglia', () => {
  const dense = 'Lamministrazione territoriale comunale rappresentava uninterdipendenza istituzionale complessa caratterizzata dallinterconnessione strutturale profonda delle amministrazioni provinciali regionali reciprocamente influenzate vicendevolmente attraverso procedimenti burocratici farraginosi.';
  const t = EC.analyzeTextSignals(dense);
  assert.ok(t.gulpease.avg != null && t.gulpease.avg < EC.DEFAULTS.gulpeaseFloor, 'avg sotto soglia');
  const sig = t.signals.find(s => s.key === 'gulpease_low');
  assert.ok(sig, 'segnale presente');
  assert.ok(sig.observation && sig.suggestion, 'osservazione + azione');
});

// ── 5. connectivesByFamily: verbi ESATTI presi da EDGE_FAMILIES a runtime ──
test('connectivesByFamily: conta i verbi della famiglia (dalla tassonomia, non hardcoded)', () => {
  const vTrasf = Relations.getFamilyVerbs('trasformazione', 'it'); // es. causa, genera, produce…
  const vDip = Relations.getFamilyVerbs('dipendenza', 'it');       // es. richiede, dipende da…
  assert.ok(vTrasf.length >= 2 && vDip.length >= 1, 'la tassonomia espone i verbi');
  const corpus = [
    'Il calore ' + vTrasf[0] + ' una reazione visibile nel campione osservato.',
    'La luce ' + vTrasf[1] + ' un effetto misurabile sul sensore collegato.',
    'Il risultato ' + vDip[0] + ' condizioni ambientali costanti e controllate.'
  ].join('\n');
  const t = EC.analyzeTextSignals(corpus);
  const fam = t.connectivesByFamily;
  assert.ok(fam.trasformazione.count >= 2, 'due verbi di trasformazione contati');
  assert.ok(fam.trasformazione.found.includes(vTrasf[0]) && fam.trasformazione.found.includes(vTrasf[1]), 'found elenca i verbi trovati');
  assert.ok(fam.dipendenza.count >= 1, 'un verbo di dipendenza contato');
  assert.ok(!('altro' in fam), 'la famiglia altro (generici) è esclusa');
  assert.strictEqual(typeof fam.trasformazione.per1000, 'number', 'per1000 presente');
});

// ── 6. Segnale connectives_monotone: nessi di poche famiglie su testo lungo ──
test('Segnale connectives_monotone su testo lungo con una sola famiglia di nessi', () => {
  const v = Relations.getFamilyVerbs('trasformazione', 'it')[2]; // 'produce'
  const sents = [];
  for (let i = 0; i < 40; i++) {
    sents.push('La reazione numero ' + i + ' ' + v + ' calore diffuso energia luminosa vapore acqueo residuo minerale nella camera sperimentale controllata attentamente.');
  }
  const t = EC.analyzeTextSignals(sents.join('\n\n'));
  assert.ok(t.words > 300, 'testo lungo');
  const present = Object.keys(t.connectivesByFamily).filter(k => t.connectivesByFamily[k].count > 0);
  assert.ok(present.length <= EC.DEFAULTS.familySignalMaxFamilies, 'poche famiglie presenti');
  const sig = t.signals.find(s => s.key === 'connectives_monotone');
  assert.ok(sig && sig.observation && sig.suggestion, 'segnale con osservazione + azione');
});

// ── 7. markers.examples: marcatori didattici + soppressione di examples_none ──
test('markers.examples conta i marcatori didattici e sopprime examples_none', () => {
  const c = 'Il concetto resta astratto per molti studenti. Per esempio la mela cade a terra. Immagina una scena quotidiana molto concreta.';
  const t = EC.analyzeTextSignals(c);
  assert.ok(t.markers.examples.count >= 2, 'conta "per esempio" + "immagina"');
  assert.ok(!t.signals.some(s => s.key === 'examples_none'), 'examples_none NON scatta se ci sono esempi');
  assert.strictEqual(typeof t.markers.examples.per1000, 'number');
});

// ── 8. markers.analogies: verbi famiglia 'analogia' + frasi esplicite ──
test('markers.analogies conta analogie esplicite e verbi della famiglia analogia', () => {
  const c = 'Il cuore è come una pompa idraulica potente. Il neurone assomiglia a un filo elettrico sottile e lungo.';
  const t = EC.analyzeTextSignals(c);
  assert.ok(t.markers.analogies.count >= 2, '"è come" + "assomiglia a" contati');
});

// ── 9. Segnale analogies_none su materiale corposo senza analogie ──
test('Segnale analogies_none su testo lungo privo di analogie', () => {
  const sents = [];
  for (let i = 0; i < 45; i++) {
    sents.push('Il campione numero ' + i + ' contiene particelle minerali sospese disciolte separate filtrate raccolte analizzate misurate registrate archiviate catalogate.');
  }
  const t = EC.analyzeTextSignals(sents.join('\n\n'));
  assert.ok(t.words > 400, 'testo abbastanza lungo');
  assert.strictEqual(t.markers.analogies.count, 0, 'nessuna analogia');
  const sig = t.signals.find(s => s.key === 'analogies_none');
  assert.ok(sig && sig.observation && sig.suggestion);
});

// ── 10. termsBeforeDefinition: termine in frase 1, definizione in frase 5 ──
test('termsBeforeDefinition: «cloroplasto» usato alla frase 1, definito alla 5', () => {
  const corpus = [
    'Il cloroplasto lavora dentro la foglia verde.',
    'Le foglie contengono molti pigmenti diversi tra loro.',
    'Il cloroplasto assorbe la luce intensa del mattino.',
    'La pianta cresce lentamente verso la fonte luminosa.',
    'Il cloroplasto è lorganulo dove avviene la fotosintesi clorofilliana.'
  ].join('\n');
  const t = EC.analyzeTextSignals(corpus);
  const c = t.termsBeforeDefinition.find(x => x.term === 'cloroplasto');
  assert.ok(c, 'rileva il termine usato prima della definizione');
  assert.strictEqual(c.usedAtSentence, 1);
  assert.strictEqual(c.definedAtSentence, 5);
  // un termine definito SUBITO (stessa frase del primo uso) non è un caso
  const immediate = [
    'La clorofilla è il pigmento verde delle piante terrestri.',
    'La clorofilla cattura la luce per la fotosintesi vegetale.',
    'La clorofilla si trova nei cloroplasti delle cellule fogliari.'
  ].join('\n');
  const t2 = EC.analyzeTextSignals(immediate);
  assert.ok(!t2.termsBeforeDefinition.some(x => x.term === 'clorofilla'), 'definizione immediata → nessun caso');
});

// ── 11. Segnale terms_before_def con ≥2 casi ──
test('Segnale terms_before_def quando almeno due termini precedono la definizione', () => {
  const corpus = [
    'Il fotosistema cattura energia luminosa preziosa nelle piante.',
    'Il gradiente spinge i protoni verso il lato opposto.',
    'Il fotosistema trasferisce elettroni eccitati molto rapidamente.',
    'Il gradiente accumula cariche positive nello spazio ristretto.',
    'Il fotosistema resta stabile durante la fase luminosa intensa.',
    'Il gradiente cresce quando la pompa lavora senza sosta.',
    'Il fotosistema è un complesso proteico della membrana tilacoidale.',
    'Il gradiente è la differenza di concentrazione fra due lati.'
  ].join('\n');
  const t = EC.analyzeTextSignals(corpus);
  assert.ok(t.termsBeforeDefinition.length >= 2, 'due casi rilevati');
  const sig = t.signals.find(s => s.key === 'terms_before_def');
  assert.ok(sig && sig.observation && sig.suggestion, 'segnale con osservazione + azione');
  assert.ok(/frase/.test(sig.observation), 'osservazione ancora le frasi');
});

// ── 12. glossaryCandidates: termini ricorrenti mai definiti ──
test('glossaryCandidates: termini ≥ freq e ≥ lunghezza, mai definiti', () => {
  const corpus = [repeatTerm('mitocondrio', 4), repeatTerm('citoplasma', 4), repeatTerm('ribosoma7', 4)].join('\n');
  const t = EC.analyzeTextSignals(corpus);
  const terms = t.glossaryCandidates.map(c => c.term);
  assert.ok(terms.includes('mitocondrio') && terms.includes('citoplasma') && terms.includes('ribosoma7'), 'i tre termini sono candidati');
  for (const c of t.glossaryCandidates) {
    assert.ok(c.freq >= EC.DEFAULTS.glossaryMinFreq, 'freq sopra soglia');
    assert.ok(c.term.length >= EC.DEFAULTS.glossaryMinLen, 'lunghezza sopra soglia');
  }
  // ordinati per freq desc
  for (let i = 1; i < t.glossaryCandidates.length; i++) {
    assert.ok(t.glossaryCandidates[i - 1].freq >= t.glossaryCandidates[i].freq, 'ordine per freq');
  }
});

// ── 13. Segnale glossary_candidates con ≥3 candidati ──
test('Segnale glossary_candidates (info) con almeno tre termini non definiti', () => {
  const corpus = [repeatTerm('mitocondrio', 4), repeatTerm('citoplasma', 4), repeatTerm('ribosoma7', 4)].join('\n');
  const t = EC.analyzeTextSignals(corpus);
  const sig = t.signals.find(s => s.key === 'glossary_candidates');
  assert.ok(sig, 'segnale presente');
  assert.strictEqual(sig.level, 'info', 'è un info, non un notice');
  assert.ok(sig.observation && sig.suggestion, 'osservazione + azione');
});

// ── 14. INVARIANTE: ogni nuovo segnale ha key/value/level/observation/suggestion ──
test('Invariante: tutti i segnali (nuovi inclusi) sono ben formati su un corpus ricco', () => {
  // corpus che accende molti segnali contemporaneamente
  const dense = [];
  for (let i = 0; i < 40; i++) {
    dense.push('Lorganizzazione amministrativa numero ' + i + ' produce documentazione istituzionale complessa profondamente stratificata gerarchicamente attraverso procedimenti burocratici particolarmente farraginosi difficilmente comprensibili.');
  }
  const t = EC.analyzeTextSignals(dense.join('\n\n'));
  assert.ok(t.signals.length >= 3, 'diversi segnali attivi');
  for (const s of t.signals) {
    assert.ok(typeof s.key === 'string' && s.key, 'key');
    assert.ok(s.value !== undefined && s.value !== null, 'value');
    assert.ok(s.level === 'notice' || s.level === 'info', 'level valido');
    assert.ok(typeof s.observation === 'string' && s.observation.trim(), 'observation non vuota');
    assert.ok(typeof s.suggestion === 'string' && s.suggestion.trim(), 'suggestion non vuota');
  }
});

// ── 15. RETROCOMPATIBILITÀ: i campi esistenti non cambiano sul corpus di controllo ──
test('Retrocompatibilità: campi storici invariati + nuove chiavi additive', () => {
  const t = EC.analyzeTextSignals(CONTROL);
  // campi storici (valori dal corpus di controllo, invariati dalla modifica)
  assert.strictEqual(t.words, 65);
  assert.strictEqual(t.sentences, 6);
  assert.strictEqual(t.avgSentenceWords, 10.8);
  assert.strictEqual(t.lexicalDensity, 0.63);
  assert.strictEqual(t.typeTokenRatio, 0.88);
  assert.strictEqual(t.uniqueContentWords, 36);
  assert.strictEqual(t.redundancy, 0);
  assert.strictEqual(t.connectives.causale.count, 0);
  assert.strictEqual(t.connectives.esemplificativa.count, 0);
  // gli stessi segnali storici (nessuno dei nuovi scatta su un testo così breve)
  assert.deepStrictEqual(t.signals.map(s => s.key).sort(), ['causal_low', 'examples_none']);
  // nuove chiavi additive presenti
  for (const k of ['gulpease', 'connectivesByFamily', 'markers', 'termsBeforeDefinition', 'glossaryCandidates']) {
    assert.ok(k in t, 'chiave nuova ' + k + ' presente');
  }
  assert.ok(Array.isArray(t.termsBeforeDefinition) && Array.isArray(t.glossaryCandidates));
  assert.ok(t.gulpease && 'avg' in t.gulpease && Array.isArray(t.gulpease.perParagraph));
  assert.ok(t.markers.examples && t.markers.analogies, 'markers ha examples + analogies');
});

// ── 16. DEFAULTS: nuove soglie presenti e sensate ──
test('DEFAULTS: nuove soglie esposte e coerenti', () => {
  const d = EC.DEFAULTS;
  assert.strictEqual(d.gulpeaseFloor, 40);
  assert.strictEqual(d.gulpeaseMinParaWords, 15);
  assert.strictEqual(d.familySignalMaxFamilies, 2);
  assert.strictEqual(d.glossaryMinFreq, 4);
  assert.strictEqual(d.termDefLag, 2);
  assert.ok(d.glossaryMinLen >= 6 && d.termDefLen >= 6, 'lunghezze minime sensate');
  assert.ok(d.gulpeaseParaCharCap > 1000, 'cap paragrafo lungo');
});
