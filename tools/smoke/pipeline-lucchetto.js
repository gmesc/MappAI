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

console.log('\n' + (ko ? ko + ' PROVE FALLITE' : 'TUTTO OK'));
process.exit(ko ? 1 : 0);
