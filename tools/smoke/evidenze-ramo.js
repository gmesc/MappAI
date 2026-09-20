#!/usr/bin/env node
/* BANCO — il pacchetto di evidenze arriva al generatore (20/9, ADR 0002, passo 3).
   Fa girare i MODULI VERI — mappai-evidence-core.js, mappai-evidence.js,
   mappai-material-pipeline.js — con un `window` finto e prova il bivio in testa
   a `_branchMaterial`: spento, o senza indice, il materiale di un ramo è quello
   di oggi (`label: desc`); acceso con un indice in memoria è il pacchetto di
   frasi VERE della fonte, con gli id `[[ev-…]]` e SENZA le desc; un ramo di cui
   la fonte non parla resta senza materiale (il giro lo salta) e la console lo
   dice; ogni chiamata lascia una traccia in `ultimeTracce()`; il materiale
   custom (`_materiale`) è intatto; e il banco del lucchetto resta a 0 KO.

   ⚠️ `MappAIGroundingCore` è ASSENTE di proposito: così la strada vecchia è il
   ripiego `label: desc`, leggibile a occhio. Che cosa NON può provare: il
   materiale che `buildInput` costruisce davvero (le desc coi passaggi
   dell'àncora), la generazione, la console di Electron. Quelli si guardano
   nell'app (docs/tasks/0003-evidence-materiale-ramo.md, §7).
   Uso: node tools/smoke/evidenze-ramo.js                                       */
'use strict';
const path = require('path');
const vm = require('vm');
const fs = require('fs');
const { spawnSync } = require('child_process');
const RADICE = path.join(__dirname, '..', '..');

let ko = 0;
function ok(cond, msg) { console.log((cond ? '  ok  ' : '  KO  ') + msg); if (!cond) ko++; }
const rientra = (s) => String(s).split('\n').map(l => '      ' + l).join('\n');

/* ── il minimo indispensabile perché i moduli si carichino (pipeline-lucchetto.js:19-34) ── */
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
/* un localStorage che RICORDA: l'interruttore si accende e si spegne davvero */
const cassetto = new Map();
global.localStorage = {
    getItem: (k) => (cassetto.has(k) ? cassetto.get(k) : null),
    setItem: (k, v) => { cassetto.set(k, String(v)); },
    removeItem: (k) => { cassetto.delete(k); }
};
global.window.localStorage = global.localStorage;
global.appState = { rootNodeLabel: 'Svizzera e 2a GM', activeVaultPath: '/vault/Svizzera e 2a GM', db: { nodes: [], links: [] }, sources: [] };

/* ── il ramo di prova e la fonte ─────────────────────────────────────────── */
const RAMO = { id: 'r1', label: 'Neutralità armata', level: 1, desc: 'La Svizzera resta fuori dal conflitto ma si arma.' };
const FIGLI = [
    { id: 'r2', label: 'Mobilitazione generale', level: 2, desc: 'Centinaia di migliaia di soldati vengono chiamati.' },
    { id: 'r3', label: 'Ridotto nazionale', level: 2, desc: 'Le truppe si ritirano nelle Alpi.' }
];
const ESTRANEO = { id: 'z1', label: 'Fotosintesi clorofilliana', level: 1, desc: 'Le piante trasformano la luce in zuccheri.' };
const FRASI = [
    'La Svizzera proclama la neutralità armata il 31 agosto 1939.',
    'La mobilitazione generale chiama alle armi 430 mila soldati in pochi giorni.',
    'Il generale Guisan riunisce gli ufficiali sul prato del Grütli nel 1940.',
    'Il Ridotto nazionale concentra le truppe nelle fortificazioni delle Alpi.',
    'La convenzione dell Aia consente agli stati neutrali il libero commercio.'
];
const FONTE = { id: 'src-1', title: 'Svizzera.pdf', pages: [{ n: 3, text: FRASI.join(' ') }] };
/* la strada di oggi senza MappAIGroundingCore: mappai-material-pipeline.js, ultima riga di _branchMaterial */
const vecchiaStrada = (ramo) => [ramo].concat(ramo.id === 'r1' ? FIGLI : []).map(n => n.label + ': ' + (n.desc || n.content || '')).join('\n');

global.window.cleanLabel = (s) => String(s || '').trim();
global.window.getDescendants = (id) => (id === 'r1' ? FIGLI : []);
global.window.MappAIReview = { sources: () => [], current: () => null };
/* MappAIGroundingCore ASSENTE: la strada vecchia è il ripiego `label: desc` */

/* ── i moduli VERI, nell'ordine di index.html ─────────────────────────────── */
const C = require(path.join(RADICE, 'public/js/mappai-evidence-core.js'));
global.window.MappAIEvidenceCore = C;
vm.runInThisContext(fs.readFileSync(path.join(RADICE, 'public/js/mappai-evidence.js'), 'utf8'), { filename: 'mappai-evidence.js' });
require(path.join(RADICE, 'public/js/mappai-material-pipeline.js'));
const EV = global.window.MappAIEvidence;
const P = global.window.MappAIPipeline;

/* il console.info della pipeline si INTERCETTA: è la riga che Giacomo cercherà in Electron */
const righeInfo = [];
const veroInfo = console.info;
let muto = false;
console.info = (...a) => { const s = a.join(' '); righeInfo.push(s); if (!muto) veroInfo('      ' + s); };

console.log('\n· i moduli');
ok(EV && typeof EV.materialeRamo === 'function' && typeof EV.ultimeTracce === 'function', 'la cucitura espone materialeRamo e ultimeTracce');
ok(EV && EV.TETTO_RAMO && EV.TETTO_RAMO.unita === 16 && EV.TETTO_RAMO.caratteri === 12000, 'TETTO_RAMO = 16 unità, 12.000 caratteri');
ok(P && typeof P._branchMaterial === 'function', '_branchMaterial è raggiungibile dal banco');
ok(typeof global.window.MappAIGroundingCore === 'undefined', 'MappAIGroundingCore assente: la strada vecchia è `label: desc`');

/* ── 1. interruttore spento → la strada di oggi ─────────────────────────── */
console.log('\n· 1. interruttore spento');
ok(EV.acceso() === false, 'di default mappai_evidence è spento');
let m = P._branchMaterial(RAMO);
ok(m === vecchiaStrada(RAMO), 'spento → `label: desc` come oggi:\n' + rientra(m));
ok(righeInfo.length === 0, 'e nessuna riga [Evidenze] in console');
ok(EV.ultimeTracce().length === 0, 'e nessuna traccia');

/* ── 2. acceso ma senza indice → ancora la strada di oggi ───────────────── */
console.log('\n· 2. acceso senza indice');
EV.accendi();
ok(EV.acceso() === true, 'acceso');
ok(EV.indice() === null, 'nessun indice in memoria');
m = P._branchMaterial(RAMO);
ok(m === vecchiaStrada(RAMO), 'acceso senza indice → `label: desc` come oggi');
ok(righeInfo.length === 0 && EV.ultimeTracce().length === 0, 'e ancora nessuna riga [Evidenze], nessuna traccia');

/* ── 3. acceso con indice: il pacchetto al posto delle desc ─────────────── */
console.log('\n· 3. acceso con l\'indice in memoria');
global.appState._evidenze = { vaultPath: global.appState.activeVaultPath, indice: C.costruisciIndice([FONTE]) };
ok(EV.indice() && EV.indice().records.length === 1, 'l\'indice del vault attivo è in memoria: ' + (EV.indice() ? EV.indice().records.length : 0) + ' pagina');
const m3 = P._branchMaterial(RAMO);
ok(typeof m3 === 'string' && m3.startsWith('AREA: Neutralità armata\n'), 'il materiale comincia con AREA:');
ok(/^CONCETTI DEL RAMO: Neutralità armata · Mobilitazione generale · Ridotto nazionale$/m.test(m3), 'la struttura sono le etichette del ramo, unite da « · »');
ok(m3.includes('\n\nEVIDENZE DALLA FONTE (frasi verbatim, con pagina e id):\n[[ev-'), 'poi l\'intestazione delle evidenze e gli id [[ev-…]]');
const trovate = FRASI.filter(f => m3.includes(f));
ok(trovate.length >= 3, 'contiene frasi della fonte IDENTICHE: ' + trovate.length + ' su ' + FRASI.length);
ok(!m3.includes(RAMO.desc) && !m3.includes(FIGLI[0].desc) && !m3.includes(FIGLI[1].desc), 'e NON contiene le desc dei nodi');
ok(/\(p\. 3, Svizzera\.pdf · (concetto|definizione|dato)\)/.test(m3), 'ogni riga porta pagina, titolo e genere');
ok(righeInfo.length === 1 && /^\[Evidenze\] Neutralità armata: [1-9]\d* unità, \d+ scartate, \d+ car$/.test(righeInfo[0]), 'la console lo dice: «' + righeInfo[0] + '»');
ok(m3.length === Number((righeInfo[0] || '').match(/(\d+) car$/)?.[1]), 'e i caratteri dichiarati sono quelli del materiale (' + m3.length + ')');
console.log(rientra(m3));

/* ── 4. un ramo di cui la fonte non parla → '' e il giro lo salta ─────────── */
console.log('\n· 4. ramo di cui la fonte non parla');
righeInfo.length = 0;
m = P._branchMaterial(ESTRANEO);
ok(m === '', 'materiale vuoto: il giro della pipeline lo salta (`if (!material.trim()) continue`)');
ok(righeInfo.length === 1 && /^\[Evidenze\] Fotosintesi clorofilliana: 0 unità, 0 scartate, 0 car · ramo senza evidenze: salta$/.test(righeInfo[0]), 'e la console dice che salta: «' + righeInfo[0] + '»');

/* ── 5. le tracce ───────────────────────────────────────────────────────── */
console.log('\n· 5. ultimeTracce()');
const tr = EV.ultimeTracce();
ok(Array.isArray(tr) && tr.length === 2, 'una voce per chiamata con l\'indice: ' + tr.length);
ok(tr[0] && tr[0].area === 'Neutralità armata' && tr[0].query === 'Neutralità armata Mobilitazione generale Ridotto nazionale', 'la traccia porta area e query (le etichette unite da uno spazio, come _passaggiDelRamo)');
ok(tr[0] && Array.isArray(tr[0].ids) && tr[0].ids.length > 0 && tr[0].ids.every(x => /^ev-[0-9a-f]{16}-\d+$/.test(x)), 'con gli id delle unità entrate: ' + (tr[0] ? tr[0].ids.length : 0));
ok(tr[0] && tr[0].ids.every(id => m3.includes('[[' + id + ']]')), 'gli id della traccia sono quelli nel materiale');
ok(tr[0] && typeof tr[0].scartate === 'number' && typeof tr[0].caratteri === 'number' && tr[0].caratteri === m3.length && typeof tr[0].quando === 'string', 'scartate, caratteri (= materiale) e quando');
ok(tr[1] && tr[1].area === 'Fotosintesi clorofilliana' && tr[1].ids.length === 0 && tr[1].caratteri === 0, 'anche il ramo saltato lascia traccia, con zero id');
ok(EV.ultimeTracce() !== EV.ultimeTracce() && EV.ultimeTracce().length === 2, 'ultimeTracce() dà una copia: chi la legge non tocca la memoria');
/* il tetto: 50 voci, le più vecchie escono */
muto = true;
for (let i = 0; i < 60; i++) P._branchMaterial(RAMO);
muto = false;
ok(EV.ultimeTracce().length === 50, 'al massimo 50 tracce: ' + EV.ultimeTracce().length);
ok(!EV.ultimeTracce().some(t => t.area === 'Fotosintesi clorofilliana'), 'le più vecchie sono uscite');

/* ── 6. il materiale custom resta intatto ───────────────────────────────── */
console.log('\n· 6. _materiale custom (la fotografia letta dal motore locale)');
righeInfo.length = 0;
const tracceprima = EV.ultimeTracce().length;
const lungo = 'x'.repeat(13000);
const custom = P._branchMaterial({ id: 'foto', label: 'Scheda', _materiale: lungo });
ok(custom === lungo.slice(0, 12000) && custom.length === 12000, 'tagliato a 12.000 come oggi: ' + custom.length);
ok(P._branchMaterial({ id: 'foto', label: 'Scheda', _materiale: 'breve' }) === 'breve', 'e uno breve passa intero');
ok(righeInfo.length === 0 && EV.ultimeTracce().length === tracceprima, 'senza passare dalle evidenze: nessuna riga [Evidenze], nessuna traccia');

/* ── 7. spento di nuovo → la strada di oggi, con l'indice ancora in memoria ── */
console.log('\n· 7. spento di nuovo');
EV.spegni();
righeInfo.length = 0;
ok(P._branchMaterial(RAMO) === vecchiaStrada(RAMO), 'spento → `label: desc`, anche con l\'indice in memoria');
ok(righeInfo.length === 0, 'e nessuna riga [Evidenze]');

/* ── 8. il progetto cambia: l'indice non è del vault attivo (invariante 20-bis) ── */
console.log('\n· 8. un altro vault attivo');
EV.accendi();
global.appState.activeVaultPath = '/vault/Altro';
ok(EV.indice() === null, 'l\'indice in memoria è di un altro vault: indice() è null');
ok(P._branchMaterial(RAMO) === vecchiaStrada(RAMO), 'e il materiale è quello di oggi');
global.appState.activeVaultPath = '/vault/Svizzera e 2a GM';
ok(P._branchMaterial(RAMO) === m3, 'tornati al vault giusto, lo stesso materiale di prima (stessi id)');

/* ── 9. il banco del lucchetto resta a 0 KO ─────────────────────────────── */
console.log('\n· 9. pipeline-lucchetto.js in sottoprocesso');
const esito = spawnSync(process.execPath, [path.join(__dirname, 'pipeline-lucchetto.js')], { encoding: 'utf8' });
ok(esito.status === 0 && /TUTTO OK/.test(esito.stdout || ''), 'pipeline-lucchetto.js: ' + (esito.status === 0 ? 'TUTTO OK' : 'status ' + esito.status + '\n' + (esito.stdout || '') + (esito.stderr || '')));

console.info = veroInfo;
console.log('\n' + (ko ? ko + ' PROVE FALLITE' : 'TUTTO OK'));
process.exit(ko ? 1 : 0);
