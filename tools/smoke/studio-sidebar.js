#!/usr/bin/env node
/* BANCO — la sidebar della Vista studio (12/8).
   Fa girare il MODULO VERO (mappai-studio-view.js) con un DOM finto ridotto
   all'osso e legge l'HTML che il pannello produce: quali leve restano a vista,
   quali finiscono nel pieghevole, e su che valore si apre ogni segmento.

   ⚠️ Che cosa NON può provare: il disegno (serve il renderer SVG e d3), il
   PDF, e che la focus-map si ritagli davvero — qui si prova che il PANNELLO
   sia lo stesso dentro e fuori dal focus e che le leve finiscano sul profilo
   giusto. Il resto va guardato in Electron.
   Uso: node tools/smoke/studio-sidebar.js                                    */
'use strict';
const path = require('path');
const RADICE = path.join(__dirname, '..', '..');

let ko = 0;
function ok(cond, msg) {
    console.log((cond ? '  ok  ' : '  KO  ') + msg);
    if (!cond) ko++;
}

/* ── DOM finto: solo ciò che il modulo tocca ─────────────────────────────── */
const pannello = { innerHTML: '', _svBound: false, addEventListener() { }, querySelector() { return null; } };
const nulla = { classList: { add() { }, remove() { } }, addEventListener() { }, style: {}, appendChild() { } };
const elementi = { 'sidebar-panel-vista': pannello };
const store = {};

global.document = {
    getElementById: id => elementi[id] || null,
    addEventListener() { },
    createElement: () => Object.assign({ style: {}, classList: { add() { }, remove() { } }, appendChild() { }, querySelector: () => nulla, addEventListener() { }, remove() { } }),
    body: nulla
};
global.window = {
    addEventListener() { },
    localStorage: null,
    d3: null,
    MappAIStudioLayouts: require(path.join(RADICE, 'public/js/mappai-studio-layouts.js')),
    /* Il renderer è un FINTO: qui non si prova che cosa si vede (serve un SVG
       vero), si prova che le strade lo raggiungano — e con quali opzioni. */
    MappAIStudioDraw: { draw: (el, res, nodi, opt) => { global.__ultimoDraw = opt; return { fit() { }, bbox: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, stats: { labelConflitti: 0 } }; } },
    t: (k, f) => f
};
global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
};
global.window.localStorage = global.localStorage;

/* mappa finta: due livelli e un cross-link, così «Archi usati» ha due scelte */
global.appState = {
    rootNodeLabel: 'Prova',
    db: {
        nodes: [{ id: 'r', label: 'Radice', level: 0 }, { id: 'a', label: 'A', level: 1 },
                { id: 'b', label: 'B', level: 1 }, { id: 'c', label: 'C', level: 2 }],
        links: [{ source: 'r', target: 'a' }, { source: 'r', target: 'b' },
                { source: 'a', target: 'c' }, { source: 'a', target: 'b', isCross: true }],
        customColors: {}
    }
};

require(path.join(RADICE, 'public/js/mappai-studio-view.js'));
const V = global.window.MappAIStudioView;

/* ── 1. i default nuovi, uno per MOTORE (16/8) ───────────────────────────── */
console.log('\n· i default che vede un docente alla prima apertura (Albero)');
const p = V.profile();
const ALBERO = {
    mode: 'td', orient: 'td', hier: 'no', hl: 'parenti', labels: 'full', set: 'hier',
    routing: 'curva', ports: true, bands: false, hops: false,
    gapLayer: 260, gapNode: 28, w: 176, h: 120, fsNode: 22, fsRel: 9
};
Object.keys(ALBERO).forEach(k => ok(p[k] === ALBERO[k], k + ' = ' + JSON.stringify(p[k]) + ' (atteso ' + JSON.stringify(ALBERO[k]) + ')'));
ok(V.focusProfile().orient === 'td', 'anche il focus parte «dall\'alto»');

console.log('\n· e i default degli altri due motori');
const DAG = V._defaultsDi('dag'), FASCI = V._defaultsDi('fasci');
ok(DAG.set === 'all' && DAG.labels === 'full' && DAG.w === 176 && DAG.h === 120 && DAG.gapLayer === 260 && DAG.fsNode === 22,
    'DAG: come l\'albero ma con i cross-link');
ok(V._defaultsDi('td').set === 'hier',
    'e l\'unica differenza fra i due è QUALI archi si disegnano');
ok(FASCI.set === 'all' && FASCI.labels === 'off' && FASCI.w === 80 && FASCI.h === 30 && FASCI.gapLayer === 50 && FASCI.gapNode === 30 && FASCI.fsNode === 11,
    'Fasci: card minime, livelli stretti, niente parole sugli archi');
ok(['td', 'dag', 'fasci'].every(k => V._defaultsDi(k).hl === 'parenti' && V._defaultsDi(k).fsRel === 9 && V._defaultsDi(k).depth === 999),
    'e le tre cose che non cambiano fra i motori: parentela, testo dei legami, tutti i livelli');
ok(JSON.stringify(V._defaultsDi('anelli')) === JSON.stringify(V._defaultsDi('td')),
    'un motore senza taratura sua eredita quella dell\'albero, non quella dei fasci');

/* ── 2. ogni motore ricorda la SUA taratura ──────────────────────────────── */
console.log('\n· cambiando motore la taratura non resta addosso');
global.appState.studioProfile = null;
const q = V.profile();
q.gapLayer = 111;                       // l'utente ritocca l'albero
V.setMotore('fasci');
ok(q.gapLayer === 50 && q.w === 80, 'passando ai Fasci arrivano le misure dei Fasci');
q.w = 99;                               // e ritocca i fasci
V.setMotore('td');
ok(q.gapLayer === 111, 'tornando all\'Albero si ritrova il 111 di prima');
ok(q.w === 176, 'e la larghezza dell\'albero, non il 99 dei fasci');
V.setMotore('fasci');
ok(q.w === 99, 'e i Fasci ricordano il loro 99');

console.log('\n· «Mappa» è l\'uscita, non un motore');
V._state.active = true;
global.appState.layoutMode = 'studio';
const primaDelloUscita = V.profile().mode;
V.tornaAllaMappa();
ok(global.appState.layoutMode === 'default', 'riporta al layout libero');
ok(V.profile().mode === primaDelloUscita, 'e NON scrive «__mappa» come motore nel profilo');
ok(V._state.active === false, 'la vista si smonta');
ok(store['mappai_studio_attivo'] === '0', 'ed è un\'uscita VOLONTARIA: l\'app non ci rientra da sola');
/* ⚠️ si torna a «non attiva»: con la vista attiva `setMotore` DISEGNA, e qui
   d3 non c'è (il motore Albero chiede `d3.hierarchy`). È la stessa ragione per
   cui più sotto il ricordo del ciclo si prova col DAG. */
V._state.active = false;
delete store['mappai_studio_attivo'];

console.log('\n· «Ripristina default» vale per la vista ATTIVA');
V.ripristina();
ok(q.w === 80 && q.mode === 'fasci', 'i Fasci tornano a 80px');
V.setMotore('td');
ok(q.gapLayer === 111, 'e l\'Albero NON è stato toccato: il suo 111 è ancora lì');

/* ── 3. un profilo vecchio viene riportato ai default nuovi, UNA volta ───── */
console.log('\n· un profilo salvato con la taratura vecchia');
global.appState.studioProfile = { mode: 'dag', orient: 'lr', hier: 'foglie', hl: 'vicini', labels: 'short', set: 'all', routing: 'orto', ports: true, bands: true, hops: true, gapLayer: 200, depth: 999, fsNode: 12, fsRel: 10, w: 118, h: 54, gapNode: 30, centerId: null, defv: 2 };
const m = V.profile();
ok(m.hier === 'no' && m.labels === 'full' && m.hl === 'parenti', 'le leve di resa tornano ai default nuovi');
/* ⚠️ Cambio rispetto al 12/8: ora si azzera anche la GEOMETRIA. I default
   nuovi SONO misure (260/28/176/120/22): tenere quelle dell'utente vorrebbe
   dire che chi ha aperto la vista prima d'oggi non li vede mai. */
ok(m.gapLayer === 260 && m.w === 176, 'e con esse la geometria, perché i default nuovi sono misure');
ok(m.mode === 'dag', 'il MOTORE scelto resta: si ritara la sua vista, non si cambia vista');
m.gapLayer = 200;
ok(V.profile().gapLayer === 200, 'e la seconda volta non si riscrive più: la scelta dell\'utente vince');

/* ── 3. il pannello: che cosa è a vista e che cosa no ───────────────────── */
console.log('\n· il pannello della mappa intera');
global.appState.studioProfile = null;
V._state.active = true;
V._state.avanzate = false;
V.buildControls();
const html = pannello.innerHTML;
const seg = k => (html.match(new RegExp('data-sv-seg="' + k + '"', 'g')) || []).length;
ok(seg('mode') === 1, 'un solo blocco «Motore» col pieghevole chiuso');
['Mappa', 'Albero', 'DAG', 'Fasci'].forEach(x => ok(html.indexOf('>' + x + '<') >= 0, 'a vista: ' + x));
ok(html.indexOf('data-v="__mappa"') < html.indexOf('data-v="td"'), '«Mappa» viene PRIMA di «Albero»');
['Anelli', 'Colonne', 'Percorso', 'Matrice'].forEach(x => ok(html.indexOf('>' + x + '<') < 0, 'nascosto: ' + x));
ok(html.indexOf('data-sv-seg="routing"') < 0, 'nascosto: instradamento archi');
ok(html.indexOf('data-sv-chk="hops"') < 0, 'nascosto: ponticelli');
ok(html.indexOf('data-sv-chk="ports"') >= 0 && html.indexOf('data-sv-chk="bands"') >= 0, 'a vista: frecce separate e bande');
ok(html.indexOf('data-sv-preset') < 0, 'i preset non ci sono più');
ok(html.indexOf('sv-adv-t') >= 0, 'c\'è il pieghevole «Altre opzioni»');
const iPdf = html.indexOf('id="sv-pdf"'), iAdv = html.indexOf('sv-adv-t');
ok(iPdf >= 0 && iAdv > iPdf, 'e sta DOPO «Esporta PDF»');

console.log('\n· col pieghevole aperto');
V._state.avanzate = true;
V.buildControls();
const h2 = pannello.innerHTML;
ok((h2.match(/data-sv-seg="mode"/g) || []).length === 2, 'i due blocchi del motore usano la STESSA chiave');
['Anelli', 'Colonne', 'Percorso', 'Matrice'].forEach(x => ok(h2.indexOf('>' + x + '<') >= 0, 'ora c\'è: ' + x));
ok(h2.indexOf('data-sv-seg="routing"') >= 0 && h2.indexOf('data-sv-chk="hops"') >= 0, 'e con loro instradamento e ponticelli');

/* ── 4. il pannello NON cambia entrando nel focus ────────────────────────── */
console.log('\n· lo stesso pannello, col focus aperto');
V._state.avanzate = false;
V.buildControls();
const senzaFocus = pannello.innerHTML;
V._state.focus = { id: 'a', mode: 'vicini', nodes: [], links: [], centro: { id: 'a', label: 'A' } };
V.buildControls();
const conFocus = pannello.innerHTML;
V._state.focus = null;
const leve = s => (s.match(/data-sv-(seg|sl|chk)="[a-zA-Z]+"/g) || []).sort().join(' ');
ok(leve(senzaFocus) === leve(conFocus), 'stesse leve, nello stesso ordine');
ok(conFocus.indexOf('sv-focus-exit') >= 0, 'in più: il comando per chiudere il focus');
ok(conFocus.indexOf('Esporta PDF del Focus') >= 0, 'e il PDF diventa quello del focus');

/* ── 5. il ricordo del passo del ciclo ───────────────────────────────────── */
console.log('\n· «ci ero dentro quando ho chiuso»');
elementi['card-btn-layout'] = { classList: { add() { }, remove() { } } };
elementi['layout-label-text'] = { innerText: '' };
global.window.updateLayoutButtonLabel = () => {
    elementi['layout-label-text'].innerText = (global.appState.layoutMode === 'studio') ? 'STUDIO' : 'LAYOUT';
};
V._state.active = false; V._state.focus = null;
/* ⚠️ `enter()` disegna, e il motore «Albero» chiede `d3.hierarchy`, che qui non
   c'è. Il DAG non usa d3: si prova la strada vera (entra → esce → rientra) col
   motore che il DOM finto sa reggere. Che l'albero disegni lo dicono i test di
   `mappai-studio-layouts.js`, che d3 ce l'hanno. */
V.profile().mode = 'dag';
global.appState.layoutMode = 'default';
delete store['mappai_studio_attivo'];
ok(V.riprendi() === false, 'senza ricordo non rientra da solo');

V.enter(true);
ok(store['mappai_studio_attivo'] === '1', 'entrando, il ricordo si accende');

// uscita di SERVIZIO (cambio mappa): il ricordo resta
V.exit();
ok(store['mappai_studio_attivo'] === '1', 'cambiando mappa il ricordo NON si perde');
V._state.active = false;
global.appState.layoutMode = 'default';
ok(V.riprendi() === true, 'e alla mappa dopo rientra da solo');
ok(global.appState.layoutMode === 'studio', 'col passo del ciclo su STUDIO');
ok(elementi['layout-label-text'].innerText === 'STUDIO', 'e il bottone che lo dice');

// uscita VOLONTARIA (bottone LAYOUT): il ricordo si spegne
V.exit(true);
ok(store['mappai_studio_attivo'] === '0', 'uscendo col bottone LAYOUT il ricordo si spegne');
V._state.active = false;
global.appState.layoutMode = 'default';
ok(V.riprendi() === false, 'e da lì in poi non rientra più');

// kill-switch
store['mappai_studio_attivo'] = '1';
store['mappai_studio_view'] = '0';
ok(V.riprendi() === false, 'col kill-switch della vista non rientra comunque');
delete store['mappai_studio_view'];

/* ── 6. la focus-map OBBEDISCE alle leve del pannello ────────────────────── */
console.log('\n· le leve arrivano davvero alla focus-map');
elementi['sv-focus-svg'] = { style: {} };
elementi['sv-focus-sub'] = {};
elementi['sv-metrics'] = {};
const pf = V.profile();
pf.mode = 'dag'; pf.labels = 'full'; pf.hier = 'livello'; pf.hl = 'parenti'; pf.bands = true;
V._state.focus = {
    id: 'a', mode: 'vicini', centro: { id: 'a', label: 'A' },
    nodes: [{ id: 'a', label: 'A', level: 1 }, { id: 'c', label: 'C', level: 2 }],
    links: [{ source: 'a', target: 'c', rel: 'porta a' }]
};
V.renderFocus();
const o = global.__ultimoDraw || {};
ok(o.labels === 'full', 'linking words: ' + o.labels + ' (prima era sempre «full» per forza)');
ok(o.hier === 'livello', 'gerarchia visiva: ' + o.hier + ' (prima sempre «no»)');
ok(o.hover === 'parenti', 'evidenzia al passaggio: ' + o.hover + ' (prima non arrivava)');
ok(o.bands === true, 'bande delle macro-aree: ' + o.bands);
ok(o.evidenzia === 'a', 'e il nodo del focus resta segnato');
V._state.focus = null;

console.log('\n' + (ko ? ko + ' PROVE FALLITE' : 'TUTTO OK'));
process.exit(ko ? 1 : 0);
