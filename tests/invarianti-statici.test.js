'use strict';
/*
 * invarianti-statici.test.js — due invarianti letti nel TESTO dei sorgenti (25/9/26).
 *
 * PERCHÉ esiste questo file. Un audit ha trovato una dozzina di siti che violavano
 * gli invarianti 2 e 3 della GUIDA-ARCHITETTO (§3), e nessuno lanciava un errore:
 * si vedevano solo come dati che mancavano.
 *   - Invariante 2: i nodi stanno in `appState.db.nodes`. `appState.nodes` non
 *     esiste, e il foglio quiz stampato dalla sidebar si intitolava sempre «MappAI».
 *   - Invariante 3: `appState` (let) e `StorageManager` (const) sono lessicali, NON
 *     stanno su `window`. `window.appState` è sempre undefined: il grado non entrava
 *     nel prompt disciplinare, il registro degli errori perdeva la mappa, la
 *     migrazione delle cartelle lasciava la mappa aperta sul percorso vecchio.
 *     `window.StorageManager` è peggio, perché in Chromium ESISTE: è la classe
 *     nativa del browser (quella di navigator.storage). `window.StorageManager
 *     .currentProjectId` è undefined — ogni record di consumo usciva con projectId
 *     null — e le guardie `window.StorageManager && …` risultano vere per caso.
 * Un errore che non lancia non lo trova nessuna prova di comportamento scritta
 * prima di sapere dove cercarlo. Per questo qui si legge il testo.
 *
 * Le regole, commenti esclusi:
 *   - `window.StorageManager`: mai, salvo un'assegnazione esplicita;
 *   - `window.appState`: solo un'assegnazione esplicita, oppure il RIPIEGO dopo
 *     `typeof appState` — il pattern di `_getAppState` in dev-console-metrics.js,
 *     compresa la riga `catch` che lo chiude;
 *   - `appState.nodes`: mai (`appState.db.nodes` è un'altra cosa, e passa).
 *
 * ECCEZIONI è il debito dichiarato: i file che violano ancora e che non si possono
 * correggere nel ramo che ha scritto questa prova. L'elenco deve solo accorciarsi —
 * un file che smette di violare fa fallire la prova finché la sua riga non si toglie.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RADICE = path.join(__dirname, '..');

const ECCEZIONI = {
    'public/js/app.js': 'vietato fuori da un packet dedicato (divieto fisso di Giacomo)',
    'public/js/mappai-review.js': 'lavoro in volo di un altro packet (il ripiego su window.StorageManager)'
};

/* I sorgenti dell'app: public/js senza le librerie di terzi (vendor/, *.min.js,
   tailwind.js) e senza le copie di sicurezza (*.bak*). */
function sorgenti() {
    const out = [];
    (function giro(dir) {
        for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
            const pieno = path.join(dir, d.name);
            if (d.isDirectory()) { if (d.name !== 'vendor') giro(pieno); continue; }
            if (!d.name.endsWith('.js') || d.name.endsWith('.min.js') ||
                d.name === 'tailwind.js' || d.name.includes('.bak')) continue;
            out.push(path.relative(RADICE, pieno).split(path.sep).join('/'));
        }
    })(path.join(RADICE, 'public', 'js'));
    return out.sort();
}

/* ── Lo spogliatore di commenti ──────────────────────────────────────────────
   Al posto di ogni commento lascia spazi, e gli a-capo dove stavano: righe e
   colonne restano quelle del file. Stringhe, template (con i `${…}` annidati) e
   regex letterali si attraversano senza toccarli — dentro, `//` e `/*` non sono
   commenti. Regex o divisione si decide dall'ultimo pezzo di codice, come fa chi
   legge JavaScript a mano: dopo un valore è una divisione, altrimenti una regex. */
const PRIMA_DI_REGEX = '(,=:[!&|?{};+-*%<>~^}';
const PAROLE_PRIMA_DI_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new',
    'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

function senzaCommenti(src) {
    const c = src.split('');
    const n = src.length;
    const sbianca = (a, b) => { for (let k = a; k < b; k++) if (c[k] !== '\n') c[k] = ' '; };
    const fineStringa = (j, q) => {         // j = l'apice di apertura
        for (j++; j < n; j++) {
            if (src[j] === '\\') { j++; continue; }
            if (src[j] === q || src[j] === '\n') return j + 1;   // a-capo: stringa rotta, si riparte
        }
        return n;
    };
    const corpoTemplate = j => {            // j = primo carattere dopo il backtick o dopo `}`
        for (; j < n; j++) {
            if (src[j] === '\\') { j++; continue; }
            if (src[j] === '`') return { i: j + 1, espr: false };
            if (src[j] === '$' && src[j + 1] === '{') return { i: j + 2, espr: true };
        }
        return { i: n, espr: false };
    };
    const fineRegex = j => {                // j = la barra di apertura
        let classe = false;
        for (j++; j < n; j++) {
            const ch = src[j];
            if (ch === '\\') { j++; continue; }
            if (ch === '\n') return j;      // non era una regex: ci si ferma all'a-capo
            if (classe) { if (ch === ']') classe = false; }
            else if (ch === '[') classe = true;
            else if (ch === '/') { j++; while (j < n && /[a-z]/i.test(src[j])) j++; return j; }
        }
        return n;
    };

    const graffe = [];      // un contatore per ogni `${` aperto
    let prima = '';         // ultimo segno significativo ('a' = un valore: nome, numero, stringa…)
    let parola = '';        // l'ultimo nome, quando `prima` è 'a'
    let i = 0;
    while (i < n) {
        const ch = src[i], dopo = src[i + 1];
        if (ch === '/' && dopo === '/') {
            const e = src.indexOf('\n', i); const fine = e === -1 ? n : e;
            sbianca(i, fine); i = fine; continue;
        }
        if (ch === '/' && dopo === '*') {
            const e = src.indexOf('*/', i + 2); const fine = e === -1 ? n : e + 2;
            sbianca(i, fine); i = fine; continue;
        }
        if (ch === '"' || ch === "'") { i = fineStringa(i, ch); prima = 'a'; parola = ''; continue; }
        if (ch === '`') {
            const r = corpoTemplate(i + 1); i = r.i;
            if (r.espr) { graffe.push(0); prima = '{'; } else { prima = 'a'; parola = ''; }
            continue;
        }
        if (ch === '{') { if (graffe.length) graffe[graffe.length - 1]++; prima = '{'; i++; continue; }
        if (ch === '}') {
            if (graffe.length && graffe[graffe.length - 1] === 0) {   // chiude un `${…}`
                graffe.pop();
                const r = corpoTemplate(i + 1); i = r.i;
                if (r.espr) { graffe.push(0); prima = '{'; } else { prima = 'a'; parola = ''; }
                continue;
            }
            if (graffe.length) graffe[graffe.length - 1]--;
            prima = '}'; i++; continue;
        }
        if (ch === '/') {
            const regex = prima === '' || PRIMA_DI_REGEX.includes(prima) ||
                (prima === 'a' && PAROLE_PRIMA_DI_REGEX.has(parola));
            if (regex) { i = fineRegex(i); prima = 'a'; parola = ''; }
            else { prima = '/'; i++; }
            continue;
        }
        if (/[A-Za-z_$]/.test(ch)) {
            let j = i + 1; while (j < n && /[\w$]/.test(src[j])) j++;
            parola = src.slice(i, j); prima = 'a'; i = j; continue;
        }
        if (/[0-9]/.test(ch)) {
            let j = i + 1; while (j < n && /[\w.]/.test(src[j])) j++;
            parola = ''; prima = 'a'; i = j; continue;
        }
        if (!/\s/.test(ch)) { prima = ch === ')' || ch === ']' ? 'a' : ch; parola = ''; }
        i++;
    }
    return c.join('');
}

/* ── Le regole ─────────────────────────────────────────────────────────────── */
const ASSEGNAZIONE = /^\s*(?:=(?![=>])|(?:\|\||&&|\?\?)=)/;
const TYPEOF_APPSTATE = /\btypeof\s*\(?\s*appState\b/;

function violazioni(rel, src) {
    const righe = senzaCommenti(src).split('\n');
    const out = [];
    righe.forEach((riga, k) => {
        const dove = rel + ':' + (k + 1);
        for (const m of riga.matchAll(/\bwindow\s*\??\.\s*StorageManager\b/g)) {
            if (ASSEGNAZIONE.test(riga.slice(m.index + m[0].length))) continue;
            out.push(dove + ' — window.StorageManager (è la classe nativa del browser: usa `typeof StorageManager`)');
        }
        for (const m of riga.matchAll(/\bwindow\s*\??\.\s*appState\b/g)) {
            if (ASSEGNAZIONE.test(riga.slice(m.index + m[0].length))) continue;
            const prima = riga.slice(0, m.index);
            if (TYPEOF_APPSTATE.test(prima)) continue;              // ripiego sulla stessa riga
            if (/\bcatch\b/.test(prima)) {                          // la riga `catch` del ripiego
                let p = k - 1; while (p >= 0 && !righe[p].trim()) p--;
                if (p >= 0 && TYPEOF_APPSTATE.test(righe[p])) continue;
            }
            out.push(dove + ' — window.appState fuori dal ripiego dopo `typeof appState`');
        }
        (riga.match(/\bappState\s*\??\.\s*nodes\b/g) || []).forEach(() =>
            out.push(dove + ' — appState.nodes (i nodi stanno in appState.db.nodes)'));
    });
    return out;
}

const leggi = rel => fs.readFileSync(path.join(RADICE, rel), 'utf8');

/* ── Le prove ──────────────────────────────────────────────────────────────── */

test('lo spogliatore toglie i commenti e lascia al loro posto stringhe, template e regex', () => {
    const righe = [
        "var a = '// non è un commento'; // window.StorageManager nel commento",
        'var b = /\\/\\/[/*]x/g.test(s) ? "/*" : `${ c /* dentro */ }//`;',
        '/* blocco',
        '   window.appState */ var d = x / 2 / y; // fine',
        'var e = `uno ${ `due ${ f({ g: 1 }) } //` } tre`; window.appState;'
    ];
    const bianco = (riga, pezzo) => riga.replace(pezzo, ' '.repeat(pezzo.length));
    assert.deepStrictEqual(senzaCommenti(righe.join('\n')).split('\n'), [
        bianco(righe[0], '// window.StorageManager nel commento'),
        bianco(righe[1], '/* dentro */'),
        ' '.repeat(righe[2].length),                        // righe e colonne restano quelle del file
        bianco(bianco(righe[3], '   window.appState */'), '// fine'),
        righe[4]                                            // `//` dentro un template annidato: non è un commento
    ]);
    assert.deepStrictEqual(violazioni('prova.js', righe.join('\n')),
        ['prova.js:5 — window.appState fuori dal ripiego dopo `typeof appState`']);
});

test('le regole: che cosa passa e che cosa no', () => {
    const ok = [
        "function S() { try { return (typeof appState !== 'undefined') ? appState : window.appState; }",
        '    catch (e) { return window.appState; } }',
        'window.appState = appState;',
        'var n = appState.db.nodes.length;',
        "var sm = typeof StorageManager !== 'undefined' ? StorageManager : null;"
    ].join('\n');
    assert.deepStrictEqual(violazioni('ok.js', ok), []);
    const ko = [
        'var up = window.appState && window.appState.userProfile;',
        'var id = window.StorageManager && window.StorageManager.currentProjectId;',
        "var sm = typeof StorageManager !== 'undefined' ? StorageManager : window.StorageManager;",
        'var root = appState?.nodes?.find(n => n.level === 0);',
        'try { x(); }',
        'catch (e) { return window.appState; }'
    ].join('\n');
    assert.deepStrictEqual(violazioni('ko.js', ko).map(v => v.split(' — ')[0]), [
        'ko.js:1', 'ko.js:1', 'ko.js:2', 'ko.js:2', 'ko.js:3', 'ko.js:4', 'ko.js:6'
    ]);
});

test('lo spogliatore non rompe nessun sorgente: chi compilava compila ancora', () => {
    /* Se lo spogliatore scambiasse un pezzo di codice per un commento, lo
       cancellerebbe — e una violazione sparirebbe con lui. Il codice cancellato a
       metà quasi mai compila: è la rete che si accorge dell'errore. */
    const rotti = [];
    for (const rel of sorgenti()) {
        const src = leggi(rel);
        const compila = s => { try { new vm.Script(s, { filename: rel }); return true; } catch (e) { return false; } };
        if (compila(src) && !compila(senzaCommenti(src))) rotti.push(rel);
    }
    assert.deepStrictEqual(rotti, [], 'lo spogliatore ha rotto: ' + rotti.join(', '));
});

test('invarianti 2 e 3: niente window.StorageManager, window.appState solo come ripiego, niente appState.nodes', () => {
    const tutte = [];
    for (const rel of sorgenti()) {
        if (Object.prototype.hasOwnProperty.call(ECCEZIONI, rel)) continue;
        tutte.push(...violazioni(rel, leggi(rel)));
    }
    assert.deepStrictEqual(tutte, [], '\n' + tutte.join('\n') +
        '\n\nGuardie giuste: `typeof StorageManager !== \'undefined\'` e il `_getAppState` di dev-console-metrics.js.');
});

test('ECCEZIONI: ogni file elencato esiste e viola ancora (quando smette, la sua riga si toglie)', () => {
    const tutti = new Set(sorgenti());
    const vecchie = Object.keys(ECCEZIONI).filter(rel => !tutti.has(rel) || !violazioni(rel, leggi(rel)).length);
    assert.deepStrictEqual(vecchie, [], 'eccezioni da togliere: ' + vecchie.join(', '));
});
