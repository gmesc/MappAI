#!/usr/bin/env node
/* BANCO — il lucchetto della pipeline e la sentinella d'identità (13/8).
   Fa girare il MODULO VERO (mappai-material-pipeline.js) con un DOM finto:
   prova che finché la pipeline lavora l'app rifiuta lavoro nuovo, che lo step A
   passa lo stesso (chiave interna), e che un cambio di mappa a metà corsa FERMA
   la pipeline invece di scrivere nella cartella sbagliata.

   ⚠️ Che cosa NON può provare: il velo dentro l'area di CREA (serve il layout
   vero), le chiamate all'AI, i file scritti su disco. Quelli si guardano in
   Electron.
   Uso: node tools/smoke/pipeline-lucchetto.js                                */
'use strict';
const path = require('path');
const RADICE = path.join(__dirname, '..', '..');

let ko = 0;
function ok(cond, msg) { console.log((cond ? '  ok  ' : '  KO  ') + msg); if (!cond) ko++; }

/* ── il minimo indispensabile perché il modulo si carichi ─────────────────── */
const avvisi = [];
const nulla = { classList: { add() { }, remove() { } }, style: {}, appendChild() { }, addEventListener() { } };
global.document = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => Object.assign({}, nulla), createComment: () => ({}),
    addEventListener() { }, body: nulla, documentElement: { dataset: {} }
};
global.window = {
    addEventListener() { }, t: (k, f) => f,
    showToast: (m) => avvisi.push(String(m)),
    showLoadingOverlay() { }
};
global.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
global.window.localStorage = global.localStorage;
global.appState = { rootNodeLabel: 'Elettricità', activeVaultPath: '/vault/Elettricità', db: { nodes: [{ id: 'a' }], links: [] } };

require(path.join(RADICE, 'public/js/mappai-material-pipeline.js'));
const P = global.window.MappAIPipeline;

/* ── 1. il lucchetto ─────────────────────────────────────────────────────── */
console.log('\n· il lucchetto');
ok(P.occupata() === false, 'a riposo l\'app accetta lavoro');
ok(global.window.mappaiOccupato() === false, 'e la guardia lascia passare');

P._running = true;
ok(P.occupata() === true, 'con la pipeline in corso l\'app è occupata');
avvisi.length = 0;
ok(global.window.mappaiOccupato() === true, 'la guardia BLOCCA');
ok(/occupata/i.test(avvisi[0] || ''), 'e lo DICE: «' + (avvisi[0] || '') + '»');

/* ⚠️ Senza la chiave interna la pipeline bloccherebbe sé stessa: lo step A
   chiama `startGeneration`, che passa dalla stessa guardia. */
P._interno = true;
ok(P.occupata() === false, 'con la chiave interna lo step A passa');
P._interno = false;
P._running = false;
ok(P.occupata() === false, 'finita la pipeline, l\'app riaccetta lavoro');

/* ── 2. la sentinella d'identità ─────────────────────────────────────────── */
console.log('\n· la sentinella: la mappa cambia a metà corsa');
const S = P._sentinella;   // esposta per il banco: identita() + controlla()
ok(typeof S === 'object' && S, 'la sentinella è raggiungibile dal banco');

P._identita = S.identita();
let esito = 'nessun errore';
try { S.controlla(); } catch (e) { esito = e.message; }
ok(esito === 'nessun errore', 'stessa mappa → la pipeline continua');

/* il docente apre un'altra mappa mentre i quiz si generano */
global.appState.rootNodeLabel = 'La Fotosintesi';
global.appState.activeVaultPath = '/vault/La Fotosintesi';
esito = 'nessun errore';
try { S.controlla(); } catch (e) { esito = e.message; }
ok(esito !== 'nessun errore', 'mappa diversa → la pipeline si FERMA');
ok(/cartella sbagliata|wrong folder/i.test(esito), 'e dice perché: «' + esito.slice(0, 60) + '…»');

/* ⚠️ Il numero dei nodi NON deve far scattare la sentinella: la pipeline stessa
   scrive in `db.studySets` e certi passi ritoccano il grafo. */
global.appState.rootNodeLabel = 'Elettricità';
global.appState.activeVaultPath = '/vault/Elettricità';
global.appState.db.nodes.push({ id: 'b' }, { id: 'c' });
esito = 'nessun errore';
try { S.controlla(); } catch (e) { esito = e.message; }
ok(esito === 'nessun errore', 'più nodi ma stessa mappa → continua (è la pipeline che li aggiunge)');

/* ── 3. il gesto singolo: la SORGENTE prima della RESA (13/8) ─────────────────
   `generaSet` col ramo documento (domande aperte). Era: html → PDF → (se
   fallisce ESCE) → vault → archivio — e un `htmlToPdf` muto buttava via minuti
   di generazione AI: il materiale «non compariva da nessuna parte». Qui si
   INCHIODA l'ordine nuovo (archivio → PDF → vault), il titolo in convenzione
   dei cloni (è ciò da cui ELABORA riconosce la copia) e l'annuncio sul bus.
   IPC finti: l'AI, il PDF e il disco sono stub che REGISTRANO l'ordine.       */
(async () => {
  console.log('\n· il gesto singolo: archivio PRIMA del PDF');
  global.appState.extractionMode = 'mindmap';
  Object.assign(global.appState.db.nodes[0], { label: 'Correnti', level: 1, desc: 'La corrente elettrica è un moto di cariche.' });

  global.window.MappAIPipelineCore = require(path.join(RADICE, 'public/js/mappai-pipeline-core.js'));
  global.window.MappAIClona = require(path.join(RADICE, 'public/js/mappai-clona-core.js'));
  global.window.getSystemKey = () => 'chiave-finta';
  global.window.getDescendants = () => [];
  global.window.salvageTruncatedJSON = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
  global.window.fetchModelAPI = async () => ({
    candidates: [{ content: { parts: [{ text: JSON.stringify([
      { domanda: 'Perché le cariche si muovono?', traccia: 'campo elettrico', righe: 5, aree: [] }
    ]) }] } }]
  });
  global.window.buildOpenQuestionsHtml = (set) => '<html>' + set.title + '</html>';

  const ordine = [], archiviati = [];
  global.window.MappAIStudyDocs = { save: (rec) => { ordine.push('archivio'); archiviati.push(rec); return 'doc_x'; } };
  global.window.MappAIVaults = { segnala: (ev) => ordine.push('segnala:' + ev) };
  global.window.electronAPI = {
    htmlToPdf: async () => { ordine.push('pdf'); return { ok: false, error: 'finestra offscreen muta' }; },
    saveVaultFile: async () => { ordine.push('scrivi'); return { ok: true }; }
  };

  const r1 = await P.generaSet({ tipo: 'open', nome: 'verifica di ottobre', quantita: 3, area: 'all', angolo: 'auto' });
  ok(r1 && r1.ok === true, 'PDF fallito → il gesto RIESCE lo stesso: la sorgente c\'è (' + JSON.stringify(r1 && r1.errore || '') + ')');
  ok(ordine.indexOf('archivio') >= 0 && ordine.indexOf('archivio') < ordine.indexOf('pdf'),
    'l\'archivio si scrive PRIMA di tentare il PDF → [' + ordine.join(' → ') + ']');
  ok(ordine.indexOf('scrivi') < 0, 'niente scrittura nel vault con un PDF fallito');
  ok(ordine.some(x => x === 'segnala:materiali-generati'), 'e il bus viene avvisato (gli elenchi aperti si ridisegnano)');
  ok(r1 && /offscreen muta/.test(r1.pdfErrore || ''), 'il motivo del PDF mancato arriva al chiamante: «' + (r1 && r1.pdfErrore) + '»');
  ok(r1 && r1.file === '', 'e `file` resta vuoto: nessun PDF promesso');
  const att = global.window.MappAIClona.etichetta('Domande aperte', 'verifica di ottobre');
  ok(archiviati[0] && archiviati[0].title === att,
    'il titolo segue la convenzione dei cloni → «' + (archiviati[0] && archiviati[0].title) + '»');
  ok(archiviati[0] && archiviati[0].kind === 'quizpaper', 'kind `quizpaper`: è ciò che ELABORA e INSEGNA sanno elencare');
  ok(P.occupata() === false, 'finito il gesto, il lucchetto è riaperto');

  /* col PDF che risponde: l'ordine intero, e il nome file dal SOLO buildFileName */
  ordine.length = 0; archiviati.length = 0;
  const B64 = Buffer.from('%PDF-1.4\n' + 'x'.repeat(200)).toString('base64');
  global.window.electronAPI.htmlToPdf = async () => { ordine.push('pdf'); return { ok: true, base64: B64 }; };
  const r2 = await P.generaSet({ tipo: 'open', nome: 'verifica di ottobre', quantita: 3, area: 'all', angolo: 'auto' });
  ok(r2 && r2.ok === true && !r2.pdfErrore, 'col PDF sano nessun avviso');
  ok(ordine.join(' → ').indexOf('archivio → pdf → scrivi') >= 0, 'ordine pieno: archivio → pdf → scrivi → [' + ordine.join(' → ') + ']');
  const nomeAtteso = global.window.MappAIPipelineCore.buildFileName('open_questions', null, false,
    { mappa: 'Elettricità', nome: 'verifica di ottobre' });
  ok(r2 && r2.file === nomeAtteso, 'il nome del file esce da buildFileName → «' + (r2 && r2.file) + '»');

  /* senza nome: resta la forma della pipeline, così rigenerare AGGIORNA la voce */
  archiviati.length = 0;
  const r3 = await P.generaSet({ tipo: 'open', nome: '', quantita: 3, area: 'all', angolo: 'auto' });
  ok(r3 && r3.ok && archiviati[0] && archiviati[0].title === 'Elettricità — Domande aperte',
    'senza nome il titolo è quello della pipeline → «' + (archiviati[0] && archiviati[0].title) + '»');

  /* nome già preso da una copia: rifiuto PRIMA di spendere token (la dedup
     dell'archivio avrebbe rimpiazzato in silenzio una copia corretta a mano) */
  let chiamateAI = 0;
  const veroFetch = global.window.fetchModelAPI;
  global.window.fetchModelAPI = async function () { chiamateAI++; return veroFetch.apply(null, arguments); };
  global.window.MappAIStudyDocs.list = () => [
    { id: 'doc_x', kind: 'quizpaper', title: 'Domande Aperte - verifica di ottobre', mapName: 'Elettricità', hasHtml: true }
  ];
  const r4 = await P.generaSet({ tipo: 'open', nome: 'Verifica di Ottobre', quantita: 3, area: 'all', angolo: 'auto' });
  ok(r4 && r4.ok === false && /già una copia/.test(r4.errore || ''),
    'nome già preso (pure con maiuscole diverse) → rifiuto: «' + (r4 && r4.errore) + '»');
  ok(chiamateAI === 0, 'e NESSUNA chiamata AI spesa');

  /* ── 4. il foglio di domande aperte SCRITTO A MANO (13/8 sera) ─────────────
     Era l'unico genere che non si poteva creare a mano. Qui si prova il giro
     intero col builder VERO (`mappai-quiz-print.js`): il foglio vuoto deve
     ri-attraversare `setFromHtml`, o l'editor lo riaprirebbe «senza domande».  */
  console.log('\n· il foglio di domande aperte scritto a mano');
  const vm = require('vm');
  const fs = require('fs');
  global.window.MappAIDocEdit = require(path.join(RADICE, 'public/js/mappai-docedit-core.js'));
  ['mappai-print-layout.js', 'mappai-doc-head.js', 'mappai-quiz-print.js'].forEach(f => {
    vm.runInThisContext(fs.readFileSync(path.join(RADICE, 'public/js', f), 'utf8'), { filename: f });
  });
  ok(typeof global.window.buildOpenQuestionsHtml === 'function', 'il builder VERO è caricato (niente stub)');

  const archivio = [];
  global.window.MappAIStudyDocs = {
    save: (rec) => { const id = 'doc_' + (archivio.length + 1); archivio.push(Object.assign({ id: id }, rec)); return id; },
    list: () => archivio.map(d => ({ id: d.id, kind: d.kind, title: d.title, mapName: d.mapName, hasHtml: !!d.html })),
    get: (id) => archivio.filter(d => d.id === id)[0] || null
  };
  const f1 = P.nuovoFoglioAperte({ nome: '' });
  ok(f1 && f1.ok === true, 'il foglio vuoto si crea: ' + JSON.stringify(f1 && f1.titolo));
  ok(f1 && f1.titolo === 'Elettricità — Domande aperte', 'senza nome, la forma della pipeline');
  const doc1 = global.window.MappAIStudyDocs.get(f1.docId);
  const riletto = global.window.MappAIQuizPrint.setFromHtml(doc1.html);
  ok(!!riletto && Array.isArray(riletto.items) && riletto.items.length === 1,
    '🔑 il foglio VUOTO sopravvive al giro archivio→editor: ' + (riletto ? riletto.items.length : 0) + ' domanda in bianco');
  ok(riletto && riletto.items[0].question === '', 'e la domanda è davvero vuota, pronta da scrivere');
  ok(/domande aperte/i.test(doc1.title), 'il titolo passa il filtro di ELABORA (/domande aperte/i)');
  ok(doc1.kind === 'quizpaper' && doc1.mapName === 'Elettricità', 'kind e mappa giusti: la riga comparirà nella mappa aperta');

  /* un secondo foglio SENZA nome sovrascriverebbe il primo: si chiede il nome */
  const f2 = P.nuovoFoglioAperte({ nome: '' });
  ok(f2 && f2.ok === false && /già un foglio/.test(f2.errore || ''),
    'il secondo foglio senza nome NON rimpiazza il primo: «' + (f2 && f2.errore) + '»');
  const f3 = P.nuovoFoglioAperte({ nome: 'recupero' });
  ok(f3 && f3.ok === true && f3.titolo === 'Domande Aperte - recupero', 'con un nome è una COPIA: «' + (f3 && f3.titolo) + '»');
  const f4 = P.nuovoFoglioAperte({ nome: 'RECUPERO' });
  ok(f4 && f4.ok === false && /già una copia/.test(f4.errore || ''), 'e lo stesso nome si rifiuta (anche con altre maiuscole)');
  ok(archivio.length === 2, 'in archivio ci sono i due fogli veri, nessun doppione → ' + archivio.length);

  /* ── 5. L'ANGOLO E LA GRADUAZIONE ARRIVANO DAVVERO NEL PROMPT (13/8 sera) ──
     Il difetto misurato sugli otto fogli di Giacomo: l'angolo scelto restava
     nel modale — «esempi concreti» senza un solo esempio, «definizioni» il set
     meno definitorio, la stessa domanda in quattro fogli. Qui si INTERCETTA il
     prompt che parte davvero: è l'unico modo di provare che un'istruzione è
     stata data, senza chiamare l'AI.                                          */
  console.log('\n· l\'angolo e le domande d\'avvio nel prompt');
  vm.runInThisContext(fs.readFileSync(path.join(RADICE, 'public/js/mappai-study-session.js'), 'utf8'), { filename: 'study-session.js' });
  ok(typeof global.window.openQuestionsAngleBlock === 'function', 'il blocco per le domande aperte esiste');

  const prompts = [];
  global.window.fetchModelAPI = async function (payload) {
    prompts.push(payload.contents[0].parts[0].text);
    return { candidates: [{ content: { parts: [{ text: JSON.stringify([
      { domanda: 'D1', traccia: 't', righe: 4, aree: [], livello: 'base' },
      { domanda: 'D2', traccia: 't', righe: 5, aree: [], livello: 'ponte' },
      { domanda: 'D3', traccia: 't', righe: 5, aree: [], livello: 'ponte' },
      { domanda: 'D4', traccia: 't', righe: 5, aree: [], livello: 'ponte' },
      { domanda: 'D5', traccia: 't', righe: 3, aree: [], livello: 'base' }
    ]) }] } }] };
  };
  /* il template vero, come lo legge l'app */
  const cfg = JSON.parse(fs.readFileSync(path.join(RADICE, 'prompts_config.json'), 'utf8'));
  global.window.fillPromptTemplate = function (nome, vars) {
    let t = cfg[nome + '_IT'] || '';
    Object.keys(vars || {}).forEach(k => { t = t.split('{{' + k + '}}').join(vars[k] == null ? '' : String(vars[k])); });
    return t;
  };
  global.window.MappAIStudyDocs.list = () => [];

  const rr = await P.generaSet({ tipo: 'open', nome: 'con-angolo', quantita: 5, area: 'all', angolo: 'confronto', base: 40 });
  ok(rr && rr.ok, 'generazione riuscita');
  const p = prompts[prompts.length - 1] || '';
  ok(/ANGOLO DI QUESTO FOGLIO \(obbligatorio/.test(p), '🔑 l\'angolo È nel prompt, ed è obbligatorio');
  ok(/CONFRONTO: differenze e somiglianze/.test(p), '…col testo dell\'angolo scelto, letto da QUIZ_ANGLES');
  ok(/PREVALE su ogni indicazione di varietà/.test(p), '…e dichiara di prevalere (rete per i template personali)');
  ok(!/VARIETÀ COGNITIVA/.test(p), 'la riga «varietà cognitiva» del template SPARISCE con un angolo scelto');
  ok(/esattamente 2 domande sulle 5 devono essere di AVVIO/.test(p),
    '🔑 la graduazione arriva come NUMERO, non come percentuale');
  ok(/"livello"/.test(p), 'e il campo `livello` è chiesto nello schema');

  prompts.length = 0;
  await P.generaSet({ tipo: 'open', nome: 'auto', quantita: 5, area: 'all', angolo: 'auto', base: 0 });
  const p2 = prompts[prompts.length - 1] || '';
  ok(/VARIETÀ COGNITIVA/.test(p2), 'con «Automatico» la varietà del template TORNA');
  ok(!/ANGOLO DI QUESTO FOGLIO/.test(p2), 'e nessun angolo obbligatorio');
  ok(/tutte le domande sono di PONTE/.test(p2), 'con 0% d\'avvio lo si dice, invece di tacere');

  /* l'ordine sul foglio: l'avvio in testa al suo ramo */
  const raccolti = [];
  global.window.MappAIStudyDocs.save = (rec) => { raccolti.push(rec); return 'doc_o'; };
  global.window.MappAIQuizPrint && (global.window.buildOpenQuestionsHtml = global.window.buildOpenQuestionsHtml);
  await P.generaSet({ tipo: 'open', nome: 'ordine', quantita: 5, area: 'all', angolo: 'cause', base: 40 });
  const html = (raccolti[raccolti.length - 1] || {}).html || '';
  const set = global.window.MappAIQuizPrint.setFromHtml(html);
  const liv = (set && set.items || []).map(x => x.livello);
  ok(liv.join(',') === 'base,base,ponte,ponte,ponte',
    '🔑 sul foglio le domande d\'avvio vengono PRIME → ' + liv.join(' · '));
  ok(/>avvio<\/span>/.test(html), 'il segno «avvio» c\'è nel foglio SOLUZIONI');
  const senzaSol = global.window.buildOpenQuestionsHtml(set, { mapName: 'x', includeBar: false, includeAnswers: false });
  ok(!/avvio/i.test(senzaSol), '…e NON nella copia degli allievi (dirlo sarebbe un giudizio, non un aiuto)');

  console.log('\n' + (ko ? ko + ' PROVE FALLITE' : 'TUTTO OK'));
  process.exit(ko ? 1 : 0);
})().catch(e => { console.log('  KO  eccezione fuori posto: ' + (e && e.message)); process.exit(1); });
