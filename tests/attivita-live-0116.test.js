'use strict';
/*
 * attivita-live-0116.test.js — i bottoni e i menu che lanciano le attività LIVE
 * (packet 0116). Giacomo, 20/10/2026: «il bottone 'Domande a scelta'
 * rinominalo 'Domande aperte' e spostalo in seconda posizione».
 *
 * Gli elenchi si disegnano dentro il DOM vero (barra laterale, console di
 * INSEGNA, finestra «MappAI Live»): qui si legge il sorgente, nell'ordine in
 * cui le card vengono scritte, che è l'ordine a schermo.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const leggi = (f) => fs.readFileSync(path.join(root, f), 'utf8');

/* le posizioni dei pezzi nel testo, nell'ordine dato: -1 se manca */
function ordine(testo, pezzi) {
  return pezzi.map(p => testo.indexOf(p));
}
function inOrdine(pos) {
  return pos.every((p, i) => p >= 0 && (i === 0 || p > pos[i - 1]));
}

/* gate del 21/10 (Giacomo): dalla barra della mappa escono il titoletto «Attività da
   LIM», «Domande aperte» (i fogli partono da «Studio attivo live»), «Timeline» e la
   sezione CLASSI coi suoi due bottoni */
test('0116: barra laterale › «Attività live» — Studio attivo live, Mappa LIVE, Chiedi e Rispondi; niente classi né timeline', () => {
  const s = leggi('public/js/mappai-collab-teacher.js');
  const i = s.indexOf('CT.renderLimSidebarTab');
  const corpo = s.slice(i, s.indexOf('\n    };\n', i));
  const pos = ordine(corpo, ["limCard('live'", "limCard('board'", "limCard('tutor'", "limCard('materials'"]);
  assert.ok(inOrdine(pos), 'ordine atteso: live, board, tutor, materials — trovato ' + pos.join(','));
  ["limCard('scelta'", "limCard('timeline'", "limCard('class-switch'", "limCard('class-accounts'", "'lim_title'", "'lim_intro'", "'lim_sec_classes'"].forEach(k => {
    assert.ok(!corpo.includes(k), 'non c\'è più ' + k);
  });
});

/* lotto 4 (Giacomo, 21/10: «eliminali»): in INSEGNA › «Attività LIVE» non c'è una
   mappa scelta, quindi «Quiz a distanza» e «Domande aperte» escono; partono dalla mappa */
test('0116: INSEGNA › «Attività LIVE» — niente «Quiz a distanza» né «Domande aperte»', () => {
  const s = leggi('public/js/mappai-landing-teach.js');
  ["id: 'live-quiz'", "id: 'live-scelta'", "id === 'live-quiz'", "id === 'live-scelta'"].forEach(k => {
    assert.ok(!s.includes(k), 'non c\'è più ' + k);
  });
  const pos = ordine(s, ["id: 'live-tutor'", "id: 'live-mappa'"]);
  assert.ok(inOrdine(pos), 'restano «Chiedi e Rispondi» e «Mappa LIVE» — trovato ' + pos.join(','));
  assert.ok(s.includes('premi «Studio attivo»'), 'la riga dice da dove partono quiz e domande aperte');
});

test('0116: finestra «MappAI Live» — niente «Domande aperte» né «Timeline», clic agganciati per data-act', () => {
  const s = leggi('public/js/mappai-live-teacher.js');
  const i = s.indexOf('function openHubMenu()');
  const corpo = s.slice(i, s.indexOf('\n  }\n', i));
  const pos = ordine(corpo, ["'quiz')", "'board')", "'materials')", "'tutor')"]);
  assert.ok(inOrdine(pos), 'ordine atteso: quiz, board, materials, tutor — trovato ' + pos.join(','));
  assert.ok(!corpo.includes("'scelta')") && !corpo.includes("'timeline')"), 'via «Domande aperte» e «Timeline»');
  assert.ok(!/cards\[\d\]\.onclick/.test(corpo), 'nessun clic agganciato per posizione');
});

test('0116: le domande aperte partono con la classe del progetto aperto', () => {
  const s = leggi('public/js/mappai-live-teacher.js');
  assert.ok(/st\.vaultClasse \|\| st\.activeVaultClassDir/.test(s), 'la classe viene da index.yaml o dalla cartella');
  const av = s.slice(s.indexOf('function _avviaAperte('), s.indexOf('function _nomeClasseDelProgetto('));
  assert.ok(av.includes('_classeDelProgetto()') && !av.includes('getActive()'), '_avviaAperte usa la classe del progetto');
  assert.ok(s.includes('var delProgetto = _classeDelProgetto();'), 'la tendina del quiz MC parte sulla classe del progetto');
});

test('0116: le sessioni nuove si chiamano «Domande aperte» sul disco e nel registro', () => {
  const s = leggi('public/js/mappai-scelta.js');
  const i = s.indexOf('function avvia(');
  const corpo = s.slice(i, s.indexOf('\n    }\n', i));
  assert.ok(!corpo.includes("'Domande a scelta'"), 'nessun «Domande a scelta» nel nome dell\'attività');
  assert.ok(corpo.includes("t('ds_attivita', 'Domande aperte')"));
});

test('0116: in inglese gli stessi nomi', () => {
  const en = leggi('public/traduzioni/en_translations.js');
  ['lv_card_scelta', 'ds_attivita'].forEach(k => {
    const m = en.match(new RegExp('\\b' + k + ': "([^"]*)"'));
    assert.ok(m, 'manca ' + k);
    assert.strictEqual(m[1], 'Open questions', k);
  });
});

/* ── lotto 3: le domande aperte semplici ─────────────────────────────────── */
function corpoDi(s, firma) {
  const i = s.indexOf(firma);
  if (i < 0) return '';
  return s.slice(i, s.indexOf('\n    }\n', i));
}

test('0116: il modale «Domande aperte» ha solo la tendina dei fogli aperti', () => {
  const s = leggi('public/js/mappai-scelta.js');
  const corpo = corpoDi(s, 'function apriLive(');
  assert.ok(corpo.length > 0, 'apriLive esiste');
  ['minimoAree', "id: 'minimo'", 'reveal', 'osservazioni', 'perche_no', 'autovalutazione', 'secondo_giro', 'feedback', 'gen_open', 'gen_mc'].forEach(k => {
    assert.ok(!corpo.includes(k), 'nel modale non c\'è più ' + k);
  });
  assert.ok(corpo.includes("id: 'foglio', tipo: 'scelta'"), 'la tendina dei fogli');
  assert.ok(corpo.includes("t('ds_titolo', 'Domande aperte')"), 'il titolo è «Domande aperte»');
  const fa = corpoDi(s, 'function fogliAperti(');
  assert.ok(fa.includes("f.tipo === 'open'"), 'solo i fogli di domande aperte');
  const af = corpoDi(s, 'function avviaFoglio(');
  assert.ok(af.includes('normalizzaCfg({ semplice: true })'), 'parte in modalità semplice');
});

test('0116: in app le domande aperte partono semplici, la scelta multipla no', () => {
  const s = leggi('public/js/mappai-scelta.js');
  const corpo = corpoDi(s, 'function apriInApp(');
  assert.ok(/normalizzaCfg\(aperte \? \{ semplice: true \} : \{\}\)/.test(corpo), 'semplice solo per le aperte');
  assert.ok(s.includes("open: { tipo: 'open', titolo: 'Domande aperte'"));
  const a = leggi('public/js/mappai-active-study.js');
  assert.ok(a.includes("_t('as_scelta_open_title', 'Domande aperte')"), 'la card in app si chiama «Domande aperte»');
});

test('0116: la pagina dell\'allievo in modalità semplice salta la scelta', () => {
  const s = leggi('public/js/mappai-scelta-view.js');
  assert.ok(/var conPassi = !semplice && /.test(s), 'niente passo degli argomenti');
  assert.ok(s.includes('S().avvioSemplice(pool, stato)'), 'tutte le domande prese, si parte da «rispondi»');
  assert.ok(s.includes("if (stato.fase === 'rispondi' || semplice) return passoRispondi();"));
  const torna = s.match(/[^\n]*sc_torna_scegli[^\n]*/g) || [];
  assert.ok(torna.length >= 2 && torna.every(r => r.includes('!semplice')), '«Torna alle domande» nascosto in modalità semplice');
});

/* ── lotto 3b: la tendina anche in app (Giacomo, 21/10: «tendina anche in app») ── */
test('0116: in app le domande aperte fanno scegliere il foglio, e ogni foglio ha la sua bozza', () => {
  const s = leggi('public/js/mappai-scelta.js');
  const i = s.indexOf('function apriInApp(');
  const corpo = s.slice(i, s.indexOf('\n    window.MappAISceltaAttivita', i));
  assert.ok(corpo.startsWith('function apriInApp(tipo, foglioK)'), 'apriInApp riceve il foglio scelto');
  assert.ok(corpo.includes("id: 'foglio', tipo: 'scelta'"), 'la tendina dei fogli');
  assert.ok(corpo.includes('SC().poolDaFogli([foglio])'), 'si apre sul solo foglio scelto');
  assert.ok(corpo.includes("var chiave = foglio ? tipo + '_' + _impronta(foglio.titolo) : tipo;"), 'la bozza per foglio');
  assert.ok(!/_(leggi|scrivi|chiave)Bozza\(tipo/.test(corpo), 'nessuna bozza legata al solo genere');
});

/* ── lotto 5: il menu di «Studio attivo live» e l'avviso della classe ─────── */
test('0116: il menu di «Studio attivo live» elenca i fogli aperti e ha il campo per le domande del docente', () => {
  const s = leggi('public/js/mappai-live-teacher.js');
  const i = s.indexOf('async function openLiveSetup(');
  const corpo = s.slice(i, s.indexOf('\n  }\n', i));
  assert.ok(corpo.includes('SA.fogliAperti()'), 'legge i fogli di domande aperte');
  assert.ok(corpo.includes("id: 'foglio:' + k"), 'una voce per foglio');
  assert.ok(corpo.includes("id: 'mie', tipo: 'area'"), 'il campo per le domande del docente');
  assert.ok(corpo.includes('_avviaAperte('), 'le aperte partono come il bottone «Domande aperte»');
  assert.ok(!/if \(!sets\.length\) \{\s*MM\.avviso/.test(corpo), 'senza quiz il menu si apre lo stesso: si possono scrivere domande');
});

test('0116: le domande del docente, una per riga', () => {
  const s = leggi('public/js/mappai-live-teacher.js');
  const m = s.match(/function _righeDomande\(testo\) \{[\s\S]*?\n  \}/);
  assert.ok(m, '_righeDomande esiste');
  const righe = new Function(m[0] + '; return _righeDomande;')();
  assert.deepStrictEqual(righe('Che cos\'è la fotosintesi?\n\n   Dove avviene?  \r\n\tPerché serve la luce?\n'),
    ['Che cos\'è la fotosintesi?', 'Dove avviene?', 'Perché serve la luce?']);
  assert.deepStrictEqual(righe('   \n\n'), []);
  assert.deepStrictEqual(righe(undefined), []);
});

test('0116: «Correggi subito» nella finestra del quiz a scelta multipla, spenta di serie', () => {
  const s = leggi('public/js/mappai-live-teacher.js');
  const i = s.indexOf('function openLiveFromSet(');
  const corpo = s.slice(i, s.indexOf('\n  }\n', i));
  assert.ok(corpo.includes("_feedbackOn() && mode === 'mc'"), 'solo per la scelta multipla, con la sua leva');
  assert.ok(/<input type="checkbox" id="lvs-feedback" style/.test(corpo), 'la spunta, senza `checked`');
  assert.ok(corpo.includes('{ feedbackImmediato: true }'), 'la sessione parte con la correzione immediata');
});

test('0116: «Scegli prima una classe…» è un avviso, non un toast verde', () => {
  const s = leggi('public/js/mappai-scelta.js');
  assert.ok(!s.includes("toast(t('ds_no_class'"), 'niente toast per la classe mancante');
  const corpo = corpoDi(s, 'function apriLive(');
  assert.ok(corpo.includes("MM.avviso({ titolo: t('lv_classe_t', 'Manca la classe')"));
  const l = leggi('public/js/mappai-live-teacher.js');
  assert.ok(l.includes("MM.avviso({ titolo: t('lv_classe_t', 'Manca la classe')"), 'anche dal menu di «Studio attivo live»');
});

/* dal lotto 1 dello 0122 (21/10) la card della barra laterale ha un sottotitolo suo, e dal lotto 2
   (Giacomo, 22/10: «le card con i titoli e le desc uguali a quelle visibili nella sidebar») anche il
   menu di «MappAI Live» legge le stesse chiavi `lim_card_*` (test in finestre-live-0122.test.js);
   la chiave `lv_card_quiz_d` resta nel dizionario per chi la legge ancora */
test('0116: il sottotitolo di «Esercizi» è lo stesso nella sidebar e nel menu di «MappAI Live»', () => {
  ['public/js/mappai-live-teacher.js', 'public/js/mappai-collab-teacher.js'].forEach(f => {
    assert.ok(leggi(f).includes("t('lim_card_live_d', 'QuizMC, Domande aperte o Domande al volo.')"), f);
  });
});

/* ── gate del 21/10, gesto 4 (Giacomo): sul telefono le domande aperte semplici
   hanno la veste del quiz LIVE, il 🔊 e «Consegna» solo all'ultima domanda ── */
test('0116: telefono, modalità semplice — veste del quiz, voce, «Consegna» solo all\'ultima', () => {
  const s = leggi('public/js/mappai-scelta-view.js');
  assert.ok(s.includes("if (v.tipo === 'mc' || (semplice && QMC)) {"), 'la domanda aperta con QMC.domanda (24 px e 🔊)');
  assert.ok(s.includes("'sc-ta' + (semplice ? ' sc-ta--live' : '')"), 'la casella con le misure del quiz LIVE');
  assert.ok(/\.sc-ta--live\{min-height:130px;padding:14px 16px;font-size:19px\}/.test(s), '19 px come #qopen di student.html');
  assert.ok(/#qopen \{[^}]*font-size: 19px/.test(leggi('public/live/student.html')), 'la misura di riferimento è ancora quella');
  assert.ok(s.includes('if (semplice && iRisposta < mie.length - 1) return;'), '«Consegna» solo all\'ultima domanda');
});

test('0116 (gate 21/10): in modalità semplice la pagina non mostra la traccia di correzione', () => {
  const s = leggi('public/js/mappai-scelta-view.js');
  assert.ok(s.includes('if (v.traccia && !conCriteri && !semplice) {'));
});

test('0116 (gate 21/10): la chiusura delle aperte semplici è la schermata finale del quiz, col 💾', () => {
  const v = leggi('public/js/mappai-scelta-view.js');
  assert.ok(v.includes("if (cfg.semplice) {") && v.includes("'sc-fine'") && v.includes("_t(t, 'sc_finito', 'Hai finito!')"), 'la schermata finale');
  assert.ok(v.includes("if (typeof o.onSalva === 'function')"), 'il 💾 c\'è se chi monta sa salvare');
  const h = leggi('public/live/scelta.html');
  assert.ok(h.includes('onSalva: apriScheda'), 'scelta.html collega il 💾');
  assert.ok(/function apriScheda\(\)[\s\S]*?'\/api\/my-sheet\?s='/.test(h), 'la scheda è la pagina del server, come nel quiz');
});

/* gate del 21/10: la scheda delle domande aperte usciva BIANCA nell'anteprima di
   stampa dell'iPhone; l'unico segno diverso da quella del quiz era ✎, che nessun
   carattere dell'app ha. Ogni segno della scheda deve stare nei font. */
test('0116 (gate 21/10): la scheda delle domande aperte segna le risposte scritte con ●, non con ✎', () => {
  const LR = require(path.join(root, 'public', 'js', 'mappai-live-reports.js'));
  const html = LR.buildStudentSheetHtml({ mapTitle: 'Svizzera', activity: 'Domande aperte', className: '4R', dateStr: '21/10/2026' },
    { emoji: '🦊', emojiLabel: 'Volpe', num: '01', displayName: '🦊 01', accuracyPct: 0, answered: 1, blankCount: 1, manualCount: 0, soloAperte: true,
      items: [{ idx: 0, kind: 'open', outcome: 'manual', text: 'D uno', yourText: 'scritta' }, { idx: 1, kind: 'open', outcome: 'blank', text: 'D due', yourText: '' }] },
    { date: new Date() });
  assert.ok(!html.includes('✎'), 'niente ✎');
  assert.ok(html.includes('>●<'), 'la risposta scritta ha il pallino');
  // dal 0132 (veste comune dei report) la percentuale sta in mm-rp-num: «niente percentuale» si legge lì
  assert.ok(html.includes('class="mm-rp-riga"'), 'la riga del riepilogo c\'è');
  assert.ok(!html.includes('class="mm-rp-num"'), 'niente percentuale');
  assert.ok(!/da correggere/i.test(html), 'niente «da correggere»');
});

/* gate del 21/10, dopo il gesto 8: i pannelli di gestione uguali, «Ferma server» che chiude
   prima la sessione, la × che chiede, la riga di INSEGNA che apre il report */
test('0116 (gate 21/10): pannello di gestione — stessi report per quiz e domande aperte', () => {
  const s = leggi('public/js/mappai-live-teacher.js');
  const i = s.indexOf('function renderActions('); const corpo = s.slice(i, s.indexOf('\n  }\n', i));
  assert.ok(corpo.includes("LT._lastStatus.session.mode"), 'la modalità la dice il server');
  assert.ok(corpo.includes("[{ which: 'scelta', label: t('lv_rep_q', 'Report domande') }, { which: 'students', label: t('lv_rep_s', 'Report allievi') }]"), 'domande aperte: Report domande + Report allievi');
});

// dal 0127 (gate del 27/10) lo spegnimento sta in `_fermaServer`, dopo la conferma di `doStop`
test('0116 (gate 21/10): «Ferma server» chiude prima la sessione e azzera il pannello', () => {
  const s = leggi('public/js/mappai-live-teacher.js');
  const i = s.indexOf('function _fermaServer()'); const corpo = s.slice(i, s.indexOf('\n  }\n', i));
  assert.ok(corpo.includes("_fase() !== 'closed'") && corpo.includes('doClose(false)'), 'una sessione aperta si chiude, coi report');
  assert.ok(corpo.includes('LT._lastStatus = null') && corpo.includes('_curPhase = null'), 'la sessione dopo parte da zero');
  assert.ok(/LT\._reports = extra\.reports \|\| null;\n\s*LT\._lastStatus = null; _curPhase = null;/.test(s), 'anche a ogni lancio');
});

// dal 0127 (Giacomo, 27/10) la × non offre più «Ferma server»: a sessione chiusa chiude il pannello, con la sua conferma
test('0116 (gate 21/10): la × con una sessione attiva chiede «Chiudi sessione / Annulla»', () => {
  const s = leggi('public/js/mappai-live-teacher.js');
  assert.ok(s.includes("ov.querySelector('.lh-close').onclick = chiudiOChiedi;"), 'la ×');
  assert.ok(s.includes("if (e.target === ov) chiudiOChiedi();"), 'il clic sullo sfondo');
  const i = s.indexOf('function chiudiOChiedi()'); const corpo = s.slice(i, s.indexOf('\n  }\n', i));
  ['annulla', 'chiudi'].forEach(k => assert.ok(corpo.includes("id: '" + k + "'"), k));
  assert.ok(corpo.includes("if (r && r.azione === 'chiudi') doClose();") && corpo.includes("if (_fase() === 'closed') return doStop();"), 'e poi la conferma, in doClose e doStop');
});

test('0116 (gate 21/10): INSEGNA › «Attività già svolte» apre il report col percorso, non con un oggetto', () => {
  const s = leggi('public/js/mappai-landing-teach.js');
  assert.ok(!s.includes('studyReportOpen({ file: primo.file })'));
  assert.ok(s.includes('window.electronAPI.studyReportOpen(primo.file);'));
});

/* 0122, lotto 1 (Giacomo, 21/10, sul banco della sidebar): le quattro card della tab
   «Attività live» coi nomi e i sottotitoli nuovi, «Invia file» con l'icona del QR, titoli a 18 e
   sottotitoli a 14; il titoletto «Attività live» al posto della prima etichetta di sezione */
test('0122: barra laterale › «Attività live» — Esercizi, Mappa, Interroga, Invia file (QR), 18/14, titoletto senza doppione', () => {
  const s = leggi('public/js/mappai-collab-teacher.js');
  const i = s.indexOf('CT.renderLimSidebarTab');
  const corpo = s.slice(i, s.indexOf('\n    };\n', i));
  [
    "limCard('live', 'radio', t('lim_card_live', 'Esercizi'), t('lim_card_live_d', 'QuizMC, Domande aperte o Domande al volo.'))",
    "limCard('board', 'presentation', t('lim_card_board', 'Mappa'), t('lim_card_board_d', 'Mappe condivise'))",
    "limCard('tutor', 'message-circle', t('lim_card_tutor', 'Interroga'), t('lim_card_tutor_d', 'Domanda con risposta assistita'))",
    "limCard('materials', 'qr-code', t('lim_card_mat', 'Invia file'), t('lim_card_mat_d', 'Scegli dalle risorse salvate'))",
    "limTitoletto(t('sb_tit_live', 'Attività live'))",
    "limSection(t('lim_sec_share', 'Condivisione'))",
  ].forEach(k => assert.ok(corpo.includes(k), 'manca ' + k));
  assert.ok(!corpo.includes("limSection(t('lim_sec_live'"), 'la prima etichetta di sezione ripeteva il titoletto: via');
  ["'lv_card_quiz'", "'cl_title'", "'lv_card_tutor'", "'lv_card_mat'", "'folder-down'"].forEach(k => {
    assert.ok(!corpo.includes(k), 'non c\'è più ' + k + ' (le lv_card_* restano al menu di «MappAI Live»)');
  });
  // i corpi delle card (stili inline di limCard): titolo 18, sottotitolo 14
  const card = s.slice(s.indexOf('function limCard('), s.indexOf('function limTitoletto('));
  assert.ok(card.includes('font-weight:800;color:var(--mm-testo, #404040);font-size:18px'), 'titolo della card a 18');
  assert.ok(card.includes('font-size:14px;color:var(--mm-testo-3, #64748b)'), 'sottotitolo della card a 14');
  assert.ok(!card.includes('13.5px') && !card.includes('11.5px'), 'i mezzi punti di prima non ci sono più');
  // il titoletto: lo stile del titolo di «Vista studio», senza icona
  const tit = s.slice(s.indexOf('function limTitoletto('), s.indexOf('CT.renderLimSidebarTab'));
  assert.ok(tit.includes('class="text-sm font-bold text-slate-600 mb-3"') && !tit.includes('data-lucide'));
  // il menu di «MappAI Live»: dal 22/10 (Giacomo) le stesse card della sidebar (test in finestre-live-0122.test.js)
  const hub = leggi('public/js/mappai-live-teacher.js');
  assert.ok(hub.includes("'lim_card_live'") && hub.includes("'lim_card_mat'"), 'il menu di MappAI Live legge le lim_card_* della sidebar');
});
