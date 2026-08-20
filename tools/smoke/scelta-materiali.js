#!/usr/bin/env node
/* BANCO — le attività «a scelta» leggono davvero i materiali (19/8).
   Fa girare il MODULO VERO (mappai-scelta.js) con un finto `window`: archivio
   dei documenti, `studySets` del vault e i due core veri. È il punto in cui
   l'attività «sembra rotta» senza esserlo — se il nome della mappa non combacia
   con quello con cui la pipeline ha archiviato, il pool esce VUOTO e la card
   resta disabilitata senza che nessuno capisca perché.

   ⚠️ Che cosa NON prova: la superficie (è DOM — quella sta nel banco
   `public/dev/scelta-harness.html`), il modale del docente, la Live.
   Uso: node tools/smoke/scelta-materiali.js                                  */
'use strict';
const path = require('path');
const RADICE = path.join(__dirname, '..', '..');
let ko = 0;
function ok(cond, msg) { console.log((cond ? '  ok  ' : '  KO  ') + msg); if (!cond) ko++; }

/* ── il minimo perché i moduli si carichino ───────────────────────────────── */
const nulla = { classList: { add() { }, remove() { } }, style: {}, appendChild() { }, addEventListener() { } };
global.window = {};
global.document = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => Object.assign({ set textContent(v) { this.innerHTML = String(v); } }, nulla),
    addEventListener() { }, body: nulla
};
global.localStorage = { _d: {}, getItem(k) { return this._d[k] == null ? null : this._d[k]; }, setItem(k, v) { this._d[k] = String(v); } };
window.localStorage = global.localStorage;

require(path.join(RADICE, 'public', 'js', 'mappai-scelta-core.js'));
window.MappAIScelta = require(path.join(RADICE, 'public', 'js', 'mappai-scelta-core.js'));

/* ── il vault finto, con la forma VERA ────────────────────────────────────── */
const MAPPA = 'Il Clima';                    // come lo archivia la pipeline: rootNodeLabel GREZZO
window.appState = {
    rootNodeLabel: MAPPA,
    db: {
        nodes: [{ id: 'n0', level: 0, label: 'Il Clima' }, { id: 'n1', level: 1, label: 'Oceani' }],
        studySets: [
            // set a scelta multipla come li scrive la pipeline: `correct` è una STRINGA
            { id: 's1', title: 'Il Clima — Scelta multipla · causa', mode: 'quiz', angle: 'causa',
              items: [{ q: 'Perché piove?', options: ['evaporazione', 'vento', 'sole'], correct: 'evaporazione', ramo: 'Oceani' }] },
            // un Vero/Falso (2 opzioni) NON è un richiamo da riconoscere: va scartato
            { id: 's2', title: 'Il Clima — Vero o Falso', mode: 'quiz',
              items: [{ q: 'Il mare è salato', options: ['Vero', 'Falso'], correct: 'Vero' }] },
            // un set di flashcard non è un quiz
            { id: 's3', title: 'Flashcard', mode: 'flashcards', items: [{ front: 'a', back: 'b' }] }
        ]
    }
};
const HTML_FOGLIO = '<html><script type="application/json" id="qp-set">' +
    JSON.stringify({ id: 'o1', title: 'Il Clima — Domande aperte · causa', angle: 'causa',
        items: [{ domanda: 'Perché il mare mitiga il clima?', ramo: 'Oceani', livello: 'base' }] }) +
    '<\/script></html>';
window.MappAIStudyDocs = {
    list: () => [
        { id: 'd1', kind: 'quizpaper', title: 'Il Clima — Domande aperte · causa', mapName: MAPPA, hasHtml: true },
        { id: 'd2', kind: 'quizpaper', title: 'Il Clima — Quiz MC', mapName: MAPPA, hasHtml: true },   // non è «domande aperte»
        { id: 'd3', kind: 'quizpaper', title: 'Altra mappa — Domande aperte', mapName: 'Altra', hasHtml: true }
    ],
    get: (id) => (id === 'd1' ? { html: HTML_FOGLIO } : { html: '' })
};
window.MappAIQuizPrint = {
    setFromHtml(html) {
        const m = /<script type="application\/json" id="qp-set">([\s\S]*?)<\/script>/i.exec(String(html || ''));
        if (!m) return null;
        try { const o = JSON.parse(m[1]); return (o && o.items && o.items.length) ? o : null; } catch (e) { return null; }
    }
};

require(path.join(RADICE, 'public', 'js', 'mappai-scelta.js'));
const SA = window.MappAISceltaAttivita;

/* ── le prove ─────────────────────────────────────────────────────────────── */
const l = SA.leggiFogli();
ok(l.mappa === MAPPA, 'il nome della mappa è quello con cui la pipeline archivia (rootNodeLabel grezzo)');
ok(l.quanti.archivio === 1, 'un solo foglio «Domande aperte» dall\'archivio (l\'altra mappa e il quiz MC restano fuori) — ' + l.quanti.archivio);
ok(l.quanti.set === 1, 'un solo set a scelta multipla (Vero/Falso e flashcard scartati) — ' + l.quanti.set);

const aperte = SA.poolPer('open');
ok(aperte.length === 1, 'il pool delle aperte ha una domanda');
ok(aperte[0].angle === 'causa', 'l\'angolo arriva dall\'embed, non dal nome del file');
ok(aperte[0].ramo === 'Oceani', 'il ramo dichiarato sull\'item diventa la macro-area');

const mc = SA.poolPer('mc');
ok(mc.length === 1, 'il pool a scelta multipla ha una domanda');
ok(mc[0].giusta === 0, '`correct` è una STRINGA nei set veri e viene risolta a indice — giusta=' + mc[0].giusta);
ok(mc[0].opzioni.length === 3, 'le tre opzioni ci sono');

/* il pool intero, quello che va alla Live: aperte + scelta multipla insieme */
const tutto = SA.pool();
ok(tutto.pool.length === 2, 'il pool della Live impila i due generi — ' + tutto.pool.length);

/* la card si spegne quando il materiale non c'è, e non deve MAI lanciare */
window.appState.db.studySets = [];
window.MappAIStudyDocs.list = () => [];
ok(SA.poolPer('open').length === 0 && SA.poolPer('mc').length === 0, 'senza materiali il pool è vuoto (card disabilitata, nessun errore)');

/* un nome di mappa che diverge (il caso che faceva «sembrare rotta» l'attività) */
window.appState.rootNodeLabel = 'Il Clima ';
ok(SA.leggiFogli().mappa.trim() === MAPPA, 'il nome resta quello di rootNodeLabel');

console.log(ko ? '\n' + ko + ' PROVE FALLITE' : '\nTUTTO OK');
process.exit(ko ? 1 : 0);
