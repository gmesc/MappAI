(async () => {
/* Smoke: `_materiali()` di ELABORA dopo il riordino dell'11/8.
   Esegue i moduli VERI in vm (trappola §7.8: eseguire, non parsare) e verifica
   che ogni genere dichiari la sua sorgente. Dati calcati sullo screenshot di
   Giacomo: progetto «La Politica Svizzera». */
const fs = require('fs'), vm = require('vm'), path = require('path');
const JS = path.join(__dirname, '..', '..', 'public', 'js');
let ko = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  KO  ') + m); if (!c) ko++; };

const MAPPA = 'La Politica Svizzera';
const sb = {
    console, JSON, Math, Date, Array, Object, String, Number, Boolean, RegExp, Error,
    Promise, parseInt, parseFloat, isNaN, setTimeout, clearTimeout, Set, Map,
    localStorage: { getItem: () => null, setItem() { }, removeItem() { } },
    appState: {
        rootNodeLabel: MAPPA, extractionMode: 'mindmap', activeVaultPath: '/v',
        sources: [],
        db: {
            rootNodeLabel: MAPPA,
            nodes: [{ id: 'n0', label: MAPPA, level: 0 }, { id: 'n1', label: 'Consiglio federale', level: 1, desc: 'x' }],
            links: [{ source: 'n0', target: 'n1', rel: 'causa' }],
            nodeSheet: { fmt: '3x4', cards: [{ id: 'n1' }] },
            nodeSheetCloni: { 'verifica ottobre': { fmt: '2x2', cards: [{ id: 'n1' }], clone: 'verifica ottobre' } },
            causalDocCloni: { 'recupero': { rows: [1], clone: 'recupero' } },
            studySets: [
                { id: 's1', title: MAPPA + ' — Scelta Multipla', type: 'Scelta Multipla', mode: 'quiz', date: '2026-08-11', items: [{ q: 'a', a1: 'x', a2: 'y', a3: 'z', correct: 1 }] },
                // il set V/F della pipeline: risposta in `correct`, NESSUNA opzione
                { id: 's2', title: MAPPA + ' — Vero o Falso', type: 'Vero o Falso', mode: 'quiz', date: '2026-08-11', items: [{ q: 'afferm', correct: 'Vero' }] },
                // un CLONE: stesso genere dell'originale, con un nome suo
                { id: 's3', title: 'Scelta Multipla - verifica ottobre', type: 'Scelta Multipla', mode: 'quiz', clone: 'verifica ottobre', date: '2026-08-11', items: [{ q: 'b', a1: 'x', a2: 'y', a3: 'z', correct: 2 }] }
            ]
        }
    }
};
sb.window = sb; sb.self = sb; sb.globalThis = sb;
sb.window.localStorage = sb.localStorage;
sb.t = (k, f) => f;
sb.showToast = () => { };
sb.currentLanguage = 'it';
sb.document = { getElementById: () => null, querySelector: () => null, createElement: () => ({ style: {}, classList: { add() { }, toggle() { } }, appendChild() { } }), addEventListener() { } };
sb.MappAIClasses = { getActive: () => null, activeStudentName: () => '', effectiveDiscipline: () => '' };
// l'archivio: la voce delle DOMANDE APERTE che la pipeline salva accanto al PDF
sb.MappAIStudyDocs = {
    list: () => [
        { id: 'd1', kind: 'quizpaper', title: MAPPA + ' — Domande aperte', mapName: MAPPA, hasHtml: true },
        { id: 'd2', kind: 'quizpaper', title: 'Domande Aperte - recupero', mapName: MAPPA, hasHtml: true }
    ],
    get: (id) => ({ id, html: '<html></html>' }), save: () => {}, remove: () => {}
};
vm.createContext(sb);
const carica = f => vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), sb, { filename: f });

['mappai-print-layout.js', 'mappai-docedit-core.js', 'mappai-pipeline-core.js',
    'mappai-causal-core.js', 'mappai-doc-head.js', 'mappai-clona-core.js', 'mappai-doc-bar.js',
    'mappai-quiz-print.js', 'mappai-landing-teach.js', 'mappai-elabora-console.js'].forEach(carica);

// l'editor documenti: qui basta che i due ingressi ESISTANO (la console li interroga)
sb.MappAIDocEditor = { openNodeSheet() { }, openCausal() { }, openSynthesisFromVault() { }, openOpenQuestions() { } };

// i file sul disco, come nello screenshot
const DISCO = [
    { name: 'Foglio-nodi-' + MAPPA + '-card.pdf', relPath: 'Materiale Studio/Foglio-nodi-' + MAPPA + '-card.pdf', mtime: 1 },
    { name: 'Foglio-nodi-' + MAPPA + '-keywords.pdf', relPath: 'Materiale Studio/Foglio-nodi-' + MAPPA + '-keywords.pdf', mtime: 1 },
    { name: 'Catena-dei-perche-' + MAPPA + '.pdf', relPath: 'Materiale Studio/Catena-dei-perche-' + MAPPA + '.pdf', mtime: 1 },
    { name: 'Quiz-VF-' + MAPPA + '.pdf', relPath: 'Materiale Studio/Quiz-VF-' + MAPPA + '.pdf', mtime: 1 },
    { name: 'Domande-aperte-' + MAPPA + '.pdf', relPath: 'Materiale Studio/Domande-aperte-' + MAPPA + '.pdf', mtime: 1 },
    { name: 'Flashcard-' + MAPPA + '.pdf', relPath: 'Materiale Studio/Flashcard-' + MAPPA + '.pdf', mtime: 1 },
    { name: 'Quiz-MC-' + MAPPA + '-verifica ottobre.pdf', relPath: 'Materiale Studio/Quiz-MC-' + MAPPA + '-verifica ottobre.pdf', mtime: 2 },
    { name: 'Foglio-nodi-' + MAPPA + '-card-verifica ottobre.pdf', relPath: 'Materiale Studio/Foglio-nodi-' + MAPPA + '-card-verifica ottobre.pdf', mtime: 3 },
    { name: 'Domande-aperte-' + MAPPA + '-recupero.pdf', relPath: 'Materiale Studio/Domande-aperte-' + MAPPA + '-recupero.pdf', mtime: 3 },
    { name: 'set-quiz-mc-' + MAPPA + '.json', relPath: 'Materiale Studio/set-quiz-mc-' + MAPPA + '.json', mtime: 1 },
    { name: 'Sintesi-' + MAPPA + '.html', relPath: 'Materiale Studio/Sintesi-' + MAPPA + '.html', mtime: 1 }
];
const EC = sb.MappAIElaboraConsole;
if (!EC || !EC.materiali) { console.log('hook materiali() assente'); process.exit(1); }
/* ⚠️ `_disco` è PRIVATO (il modulo è una IIFE): non si inietta dall'esterno.
   Si stubba l'IPC da cui il modulo lo legge davvero, e si aspetta un giro. */
sb.electronAPI = { vaultMaterialsList: () => Promise.resolve({ files: DISCO }) };
/* La catena dei perché: la console chiede al motore quanti nessi ci sono. */
sb.MappAICausal = { buildForCurrentMap: () => ({ total: 4, rootItems: [{ a: 1 }], branches: [], cross: [] }) };

EC.materiali();                       // primo giro: avvia la lettura del disco
await new Promise(r => setTimeout(r, 30));
const M = EC.materiali().filter(m => m.tipo !== 'Fonte');
console.log('— righe di ELABORA (' + M.length + ')');
M.forEach(m => console.log('    ' + (m.modificabile ? '[EDIT] ' : '[    ] ') +
    m.titolo + '   ·   tipo=' + m.tipo + (m.relPath ? '   → ' + m.relPath.split('/').pop() : '')));

const per = n => M.filter(m => m.titolo === n)[0];
console.log('— che cosa deve esserci');
ok(!!per('Scelta Multipla'), 'la riga si chiama «Scelta Multipla», non «<Mappa> — Scelta Multipla»');
ok(!!per('Vero o Falso'), 'la riga si chiama «Vero o Falso»');
ok(per('Vero o Falso') && per('Vero o Falso').tipo === 'Quiz V/F',
    '🐛 il set V/F non è più classificato MC (la pipeline lo DICHIARA)');
ok(per('Vero o Falso') && /Quiz-VF/.test(per('Vero o Falso').relPath || ''),
    '…e quindi si fonde col SUO pdf: niente più riga doppia');
ok(per('Domande Aperte') && per('Domande Aperte').modificabile, 'Domande Aperte: modificabile');
ok(per('Sintesi') && per('Sintesi').modificabile, 'Sintesi: modificabile');
ok(per('Foglio dei nodi') && per('Foglio dei nodi').modificabile, 'Foglio dei nodi: modificabile (era il difetto segnalato)');
ok(per('Catena dei perché') && per('Catena dei perché').modificabile, 'Catena dei perché: modificabile');
ok(M.every(m => m.modificabile), 'in ELABORA ci sono SOLO sorgenti: nessun file in sola lettura');
ok(!M.some(m => /\.pdf$|\.html$/i.test(m.titolo)), 'nessun nome di file nelle righe');
ok(!M.some(m => m.titolo.indexOf(MAPPA) >= 0), 'nessuna riga ripete il nome della mappa');
ok(M.filter(m => m.tipo === 'Foglio nodi' && !m.clone).length === 1,
    'un solo foglio dei nodi ORIGINALE, benché sul disco ci siano due PDF (card + parole chiave)');

console.log('— le tabelle');
const tabs = sb.MappAITeach.tabelleMateriali(M, false, 'elabora');
tabs.forEach(x => console.log('    ' + x.titolo + ' (' + x.righe.length + ')'));
const quiz = tabs.filter(x => /quiz/i.test(x.titolo))[0];
ok(tabs.length && !!quiz, 'esiste un elenco «Quiz»');
ok(quiz && quiz.righe.length === 5, 'i quiz stanno in UN elenco solo: MC + copia + V/F + aperte + copia → ' + (quiz ? quiz.righe.length : 0));
const tipoDi = (tab, i) => tab.righe[i].celle[1];
ok(tabs.every(x => x.righe.every((r, i) => tipoDi(x, i) === 'Modificabile')),
    'la colonna Tipo dice «Modificabile» su tutte le righe');
const cestini = tabs.reduce((n, x) => n + x.righe.filter(r =>
    (r.celle[r.celle.length - 1].azioni || []).some(a => /^del:/.test(a.id))).length, 0);
ok(cestini === 4, 'un cestino per COPIA, nessuno sugli originali → ' + cestini);

console.log('— il CLONE');
const cl = per('Scelta Multipla - verifica ottobre');
ok(!!cl, 'la riga si chiama «Scelta Multipla - verifica ottobre»');
ok(cl && /verifica ottobre\.pdf$/.test(cl.relPath || ''),
    'si aggancia al SUO file, non a quello dell originale → ' + (cl && cl.relPath || '-'));
ok(per('Scelta Multipla') && per('Scelta Multipla').relPath === undefined,
    'e l originale resta agganciato al suo (qui assente): nessuno ruba il file dell altro');
const rgQuiz = sb.MappAITeach.tabelleMateriali(M, false, 'elabora')
    .filter(x => /quiz/i.test(x.titolo))[0].righe;
const azDi = r => (r.celle[r.celle.length - 1].azioni || []).map(a => a.id.split(':')[0]);
const rClone = rgQuiz.filter(r => r.id === 'm:set:s3')[0];
const rOrig = rgQuiz.filter(r => r.id === 'm:set:s1')[0];
ok(rClone && azDi(rClone).indexOf('del') >= 0, 'il CLONE ha il cestino');
ok(rOrig && azDi(rOrig).indexOf('del') < 0, 'l ORIGINALE non ce l ha');
ok(rOrig && azDi(rOrig).indexOf('clona') >= 0, 'l originale ha «Clona»');
// in INSEGNA ora c'è UN elenco solo: le righe si prendono da lì
const inInsegna = sb.MappAITeach.tabelleMateriali(M, false, 'insegna')[0].righe;
ok(inInsegna.every(r => azDi(r).indexOf('clona') < 0), 'in INSEGNA «Clona» non c e: la si corregge in ELABORA');

console.log('— 🐛 il file di una COPIA non è quello dell originale');
const fileDi = n => (per(n) || {}).relPath || '';
ok(/-verifica ottobre\.pdf$/.test(fileDi('Foglio dei nodi - verifica ottobre')),
    'la copia del foglio nodi trova il SUO file → ' + (fileDi('Foglio dei nodi - verifica ottobre').split('/').pop() || '-'));
ok(!/verifica ottobre/.test(fileDi('Foglio dei nodi')),
    'e l originale NON se lo prende → ' + (fileDi('Foglio dei nodi').split('/').pop() || '-'));
ok(/-recupero\.pdf$/.test(fileDi('Domande Aperte - recupero')),
    'idem per le domande aperte → ' + (fileDi('Domande Aperte - recupero').split('/').pop() || '-'));
ok(!/recupero/.test(fileDi('Domande Aperte')), 'e il suo originale resta col proprio');

console.log('— i tre rilievi dell 11/8 sera');
const azTutte = t2 => t2.reduce((a, x) => a.concat(x.righe.map(r => ({
    n: r.celle[0], az: (r.celle[r.celle.length - 1].azioni || []).map(a => a.id.split(':')[0])
}))), []);
const inEl = azTutte(tabs);
inEl.forEach(r => console.log('    ' + r.n.padEnd(38) + ' [' + r.az.join(' ') + ']'));
ok(inEl.every(r => r.az.indexOf('clona') >= 0),
    '1) TUTTE le righe hanno il clona — sintesi, foglio nodi, catena, domande aperte comprese');
ok(inEl.filter(r => / - /.test(r.n)).every(r => r.az.indexOf('del') >= 0),
    '1b) e ogni COPIA ha il cestino');
ok(inEl.filter(r => !/ - /.test(r.n)).every(r => r.az.indexOf('del') < 0),
    '1c) nessun cestino sugli originali');
ok(inEl.every(r => r.az.indexOf('dl') < 0 && r.az.indexOf('fnd') < 0),
    '1c) in ELABORA niente comandi del FILE: la riga è la sorgente');
const ns = M.filter(m => m.tipo === 'Foglio nodi')[0];
ok(ns && ns.relPath, '2) il foglio dei nodi si aggancia al suo PDF → anteprima, non editor diretto');
ok(M.filter(m => m.tipo === 'Catena dei perché')[0].relPath, '2b) e la catena idem');
const largh = t2 => t2.map(x => x.colonne[x.colonne.length - 1].larghezza);
console.log('    larghezza ultima colonna, ELABORA: ' + largh(tabs).join(' · '));
const tIns = sb.MappAITeach.tabelleMateriali(M, false, 'insegna');
console.log('    larghezza ultima colonna, INSEGNA: ' + largh(tIns).join(' · '));
const maxAz = t2 => Math.max.apply(null, azTutte(t2).map(r => r.az.length));
ok(tIns.every(x => {
    const n = Math.max(1, Math.max.apply(null, x.righe.map(r => (r.celle[r.celle.length - 1].azioni || []).length)));
    return parseInt(x.colonne[x.colonne.length - 1].larghezza, 10) >= n * 34 + (n - 1) * 4 + 24;
}), '3) la colonna dei comandi ci sta: nessun bottone tagliato (max ' + maxAz(tIns) + ' comandi)');

console.log('— INSEGNA: gli elenchi per genere, e le larghezze');
/* ⚠️ `_diskCache` è PRIVATA (IIFE) e la popola `_consCaricaMateriali`, cioè il
   caricamento di INSEGNA — che qui non gira. Quindi i comandi del FILE (stampa,
   scarica, cartella) non si possono esercitare da questo banco: si verifica la
   STRUTTURA della tabella, e la presenza dei bottoni si guarda nell'app. */
const tIns2 = sb.MappAITeach.tabelleMateriali(M, false, 'insegna');
tIns2.forEach(x => console.log('    ' + x.titolo + ' (' + x.righe.length + ')  colonne: ' +
    x.colonne.map(c => (c.etichetta || '·') + (c.larghezza ? ' ' + c.larghezza : ' elastica')).join(' | ')));
ok(tIns2.length > 1, 'in INSEGNA gli elenchi per GENERE sono tornati (' + tIns2.length + ')');
/* il difetto dello screenshot: tabelle impilate con colonne a x diverse */
const larghezze = tIns2.map(x => x.colonne[x.colonne.length - 1].larghezza);
ok(new Set(larghezze).size === 1,
    'tutte le tabelle hanno la STESSA ultima colonna → le colonne si allineano fra loro (' + larghezze[0] + ')');
ok(new Set(tIns2.map(x => x.colonne.map(c => c.larghezza).join('|'))).size === 1,
    '…e con essa tutte le altre');
/* L'unica riga che INSEGNA lascia fuori è la sintesi EDITABILE: là si mostra
   quella con la voce (filtro D8, deciso il 10/8). Tutto il resto passa. */
const attese = M.filter(m => m.tipo !== 'Sintesi').length;
const inTutte = tIns2.reduce((n, x) => n + x.righe.length, 0);
ok(inTutte === attese, 'nessun materiale perso nel raggruppamento (' + inTutte + '/' + attese + ')');
const col = tIns2[0].colonne;
ok(col.filter(c => !c.larghezza).length === 1, 'una sola colonna elastica: il NOME');
/* ⚠️ Il .json va messo in una lista in FORMA INSEGNA: la lista di ELABORA lo
   toglie già da sé (là restano solo le sorgenti), quindi provarlo su quella
   sarebbe passato per il motivo sbagliato. */
const conJson = M.concat([{ id: 'disk:x.json', titolo: 'set-quiz-mc.json', tipo: 'Dati',
    dati: true, archivio: false, data: 1, cls: '', disc: '' }]);
const tJson = sb.MappAITeach.tabelleMateriali(conJson, false, 'insegna');
ok(!tJson.some(x => x.righe.some(r => /\.json$/i.test(String(r.celle[0])))),
    'nessun .json in INSEGNA: sono lo stato interno dell app, non documenti');
ok(tJson.reduce((n, x) => n + x.righe.length, 0) === inTutte,
    '…e nient altro è cambiato: solo quella riga in meno');
ok(col.filter(c => /tipo/i.test(c.etichetta))[0].larghezza === '130px', 'TIPO 130 (ci sta «Modificabile» + la freccia)');
ok(col.filter(c => /data/i.test(c.etichetta))[0].larghezza === '116px', 'DATA 116 (ci sta «11/08/2026» + la freccia)');
/* il conto della colonna comandi, verificato sulla formula: 4 bottoni = 172 */
ok(4 * 34 + 3 * 4 + 24 === 172, 'con stampa+scarica+cartella+cestino servono 172px');
/* in ELABORA i generi restano */
ok(sb.MappAITeach.tabelleMateriali(M, false, 'elabora').length > 1, 'in ELABORA i generi restano separati');

console.log('— 3.4 (13/8): le voci d\'archivio dei fogli cartacei NON si mostrano in INSEGNA');
/* Righe nella FORMA di `_consCaricaMateriali` (le voci d'archivio della console
   portano `kind`): in INSEGNA le `quizpaper`/`flashsheet` spariscono — la loro
   sorgente vive in ELABORA — mentre timeline e compagnia restano (una sorgente
   in ELABORA non ce l'hanno: nascoste qui sarebbero irraggiungibili). */
const listaIns = [
    { id: 'arc:d1', archivio: true, docId: 'd1', kind: 'quizpaper', titolo: MAPPA + ' — Domande aperte', tipo: 'Quiz', formato: 'HTML', data: 5, cls: '', disc: '' },
    { id: 'arc:d2', archivio: true, docId: 'd2', kind: 'flashsheet', titolo: 'Foglio flashcard — ' + MAPPA, tipo: 'Flashcard', formato: 'HTML', data: 5, cls: '', disc: '' },
    { id: 'arc:d3', archivio: true, docId: 'd3', kind: 'timeline', titolo: 'Timeline — ' + MAPPA, tipo: 'Timeline', formato: 'HTML', data: 5, cls: '', disc: '' },
    /* il foglio flashcard archiviato come PDF proprio (data-URI): un file nel
       vault non l'ha mai avuto — si apre dall'archivio, quindi RESTA */
    { id: 'arc:d4', archivio: true, docId: 'd4', kind: 'flashsheet', titolo: 'Foglio flashcard PDF — ' + MAPPA, tipo: 'Flashcard', formato: 'PDF', data: 5, cls: '', disc: '' },
    { id: 'disk:q', archivio: false, titolo: 'Quiz-MC-' + MAPPA + '.pdf', tipo: 'Quiz MC', data: 6, cls: '', disc: '' }
];
const righeDi = t2 => t2.reduce((a, x) => a.concat(x.righe.map(r => r.id)), []);
const insFiltro = righeDi(sb.MappAITeach.tabelleMateriali(listaIns, false, 'insegna'));
ok(insFiltro.indexOf('m:arc:d1') < 0, 'la voce quizpaper (il quiz cancellato dal Finder) NON compare in INSEGNA');
ok(insFiltro.indexOf('m:arc:d2') < 0, 'idem la flashsheet HTML');
ok(insFiltro.indexOf('m:arc:d3') >= 0, 'la timeline d\'archivio RESTA: la sua sorgente non vive in ELABORA');
ok(insFiltro.indexOf('m:arc:d4') >= 0, 'la voce con un PDF PROPRIO resta: si apre dall\'archivio, un file nel vault non l\'ha mai avuto');
ok(insFiltro.indexOf('m:disk:q') >= 0, 'e i FILE restano: INSEGNA elenca i file');
const elFiltro = righeDi(sb.MappAITeach.tabelleMateriali(listaIns, false, 'elabora'));
ok(elFiltro.indexOf('m:arc:d1') >= 0, 'in ELABORA la stessa voce si vede: là è la sorgente, col cestino e il clona');
/* il kill-switch riporta il comportamento storico */
const getV = sb.localStorage.getItem;
sb.localStorage.getItem = (k) => k === 'mappai_archivio_insegna' ? '1' : null;
const insStorico = righeDi(sb.MappAITeach.tabelleMateriali(listaIns, false, 'insegna'));
ok(insStorico.indexOf('m:arc:d1') >= 0, 'kill-switch mappai_archivio_insegna=1 → le voci tornano (strada storica)');
sb.localStorage.getItem = getV;

console.log(ko ? '\nFALLITI: ' + ko : '\nTUTTO OK');
process.exit(ko ? 1 : 0);

})();