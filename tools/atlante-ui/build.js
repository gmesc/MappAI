/* Atlante UI — generatore
 *
 *   node tools/atlante-ui/build.js   →   public/dev/atlante-ui.html
 *
 * Che cos'è: uno strumento per IMPARARE IL VOCABOLARIO dell'interfaccia. Scegli
 * una superficie dal menu, la vedi renderizzata col CSS vero, ogni pezzo porta
 * un cartellino numerato e la tabella sotto dice come si chiama, che classe ha e
 * da quale campo dello schema nasce. Passando sopra una riga si accende il pezzo
 * nel disegno, e viceversa.
 *
 * Da dove vengono le superfici (nessuna è ridisegnata a mano — sarebbero subito
 * divergenti dal prodotto):
 *   A. console      → public/dev/console-mockup-*.html, da cui si legge lo SCHEMA
 *                     e lo si ridà a MappAIModal.render() nella pagina
 *   B. modali statici → blocchi <div id="*modal*"> di public/index.html, neutralizzati
 *   C. overlay dinamici → tools/campionario-modali/samples-dinamici.js
 *
 * L'annotazione NON è scritta a mano superficie per superficie: la pagina cammina
 * il DOM renderizzato e riconosce i pezzi col glossario (tools/atlante-ui/glossario.js).
 * Aggiungere una voce al glossario annota di colpo tutte le superfici che la contengono.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const INDEX = path.join(ROOT, 'public/index.html');
const DEV = path.join(ROOT, 'public/dev');
const OUT = path.join(DEV, 'atlante-ui.html');

const { GLOSSARIO, FAMIGLIE } = require('./glossario.js');

const vCss = ['public/css/style.css', 'public/css/mappai-modal-tokens.css',
    'public/js/mappai-modal.js']
    .map(f => { try { return Math.round(fs.statSync(path.join(ROOT, f)).mtimeMs); } catch (e) { return 0; } })
    .join('-');

/* ── A. console: leggo lo SCHEMA dalle pagine-mockup ───────────────────── */
const NOMI_CONSOLE = {
    'a-unica': ['Console unica «Gestione»', 'console', 'La variante che raccoglie TUTTO in 16 voci divise per entità.'],
    'b-registro': ['Registro — Classi', 'console', 'La console della CLASSE: classi, allievi, materie, attività.'],
    'b-documenti': ['Registro — Documenti', 'console', 'Stessa console, vista sui documenti prodotti.'],
    'b-accessi': ['Registro — Accessi allievi', 'console', 'Le identità emoji+numero del QR (non le chiavi API).'],
    'd1-mappa': ['Mappa — tutte le azioni', 'console', 'Sostituisce il menu radiale: 22 azioni in riquadri, la navigazione filtra per dominio.'],
    'd2-mappa': ['Mappa — dominio Materiali', 'console', 'Azioni su due colonne + contesto mappa nella colonna laterale.'],
    'e1-cabina': ['Cabina — Profilo insegnante', 'console', 'Chi sei: sedi e materie come elenchi, ruolo come gate dei profili allievo.'],
    'e2-cabina': ['Cabina — Impostazioni AI', 'console', 'Provider, lingua, profondità e consumi.'],
    'f1-doc': ['Documento — elenco', 'console', 'Il guscio di ELABORA: navigazione per tipo, tabella dei documenti.'],
    'f2-doc': ['Documento — aperto nella tela', 'console', 'Il documento entra nella TELA; la navigazione si richiude per dare spazio.'],
    'chip': ['Chip di contesto (tutte le forme)', 'pezzo', 'Il chip da solo, nei suoi stati: vuoto, pieno, misto, allievo.']
};

function raccogliConsole() {
    const out = [];
    for (const f of fs.readdirSync(DEV).sort()) {
        const m = f.match(/^console-mockup-(.+)\.html$/);
        if (!m) continue;
        const src = fs.readFileSync(path.join(DEV, f), 'utf8');
        const s = src.match(/var SCHEMA\s*=\s*(\{[\s\S]*?\});\s*\n/);
        if (!s) continue;                       // la pagina indice non ha SCHEMA
        let schema;
        try { schema = JSON.parse(s[1]); } catch (e) { continue; }
        const meta = NOMI_CONSOLE[m[1]] || [m[1], 'console', ''];
        out.push({
            id: 'console-' + m[1], nome: meta[0], gruppo: 'Console',
            nota: meta[2], src: 'public/dev/' + f, tipo: 'schema', schema
        });
    }
    return out;
}

/* ── B. modali statici di index.html ───────────────────────────────────── */
const NON_MODALI = new Set([
    'source-modal-header', 'source-modal-icon', 'source-modal-kinship',
    'modal-a11y-toolbar', 'study-modal-content', 'guide-modal-content',
    'merge-modal-description', 'source-modal-content-box', 'ai-modal-content-box',
    'quiz-modal-content'
]);
const NOMI_STATICI = {
    'alert-modal': 'Avviso', 'confirm-modal': 'Conferma', 'prompt-modal': 'Richiesta di un dato',
    'source-modal': 'Scheda Focus del nodo', 'edit-node-modal': 'Modifica nodo',
    'link-family-modal': 'Famiglia del collegamento', 'study-config-modal': 'Configura lo studio',
    'user-profile-modal': 'Profilo studente', 'vault-manager-modal': 'Gestione vault',
    'layout-manager-modal': 'Disposizioni salvate', 'dossier-print-modal': 'Stampa dossier',
    'contextual-ai-extension-modal': 'Espandi con AI', 'study-player-modal': 'Player di studio',
    'quiz-modal': 'Quiz', 'config-ai-modal': 'Configurazione AI', 'api-tutorial-modal': 'Guida alle chiavi API',
    'app-tutorial-modal': 'Tutorial', 'app-guide-modal': 'Guida', 'feedback-modal': 'Feedback',
    'merge-confirm-modal': 'Conferma unione', 'validate-link-modal': 'Validazione dei link',
    'edit-project-title-modal': 'Rinomina progetto', 'layout-exit-confirm-modal': 'Uscita dalla disposizione',
    'ai-modal': 'Risposta AI', 'loading-overlay': 'Velo di caricamento'
};

/* estrae il blocco che comincia alla riga `i`, chiudendolo sull'indentazione:
   è la stessa regola per un <div> e per un <form>, e non serve un parser. */
function bloccoDa(lines, i) {
    const indent = lines[i].match(/^\s*/)[0].length;
    for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        if (!l.trim()) continue;
        const ind = l.match(/^\s*/)[0].length;
        if (ind === indent && /^\s*<\/(div|form|aside|section)>/.test(l)) return j;
        if (ind <= indent && /<(div|form|aside|section)\s+id="/.test(l)) return j - 1;
    }
    return lines.length - 1;
}

function raccogliStatici() {
    const lines = fs.readFileSync(INDEX, 'utf8').split('\n');
    const out = [];
    lines.forEach((ln, i) => {
        const m = ln.match(/<div\s+id="([a-zA-Z0-9_-]*(?:modal|overlay)[a-zA-Z0-9_-]*)"/);
        if (!m || NON_MODALI.has(m[1])) return;
        const end = bloccoDa(lines, i);
        out.push({
            id: 'st-' + m[1], nome: NOMI_STATICI[m[1]] || m[1], gruppo: 'Modali statici',
            nota: 'Blocco reale di index.html, neutralizzato per stare in pagina.',
            src: 'public/index.html:' + (i + 1), tipo: 'html',
            html: neutralizza(lines.slice(i, end + 1).join('\n'))
        });
    });
    return out;
}

/* ── B-bis. la LANDING e il cromo della mappa ───────────────────────────
 * Mancava l'essenziale: la schermata su cui Giacomo lavora ogni giorno non era
 * nominabile, e nemmeno il menu radiale — che è proprio la superficie che la
 * console «Mappa» deve sostituire. Senza le due facce (quella che c'è e quella
 * proposta) nel MEDESIMO menu, la migrazione si discute a memoria.
 *
 * Neutralizzazione diversa da quella dei modali: qui `hidden` NON si toglie.
 * È stato vero — la landing si apre vuota, il filtro classe è chiuso, il menu
 * radiale è nascosto finché non lo si apre — e cancellarlo mostrerebbe una
 * schermata che non esiste in nessun momento. */
const REGIONI = [
    { id: 'landing-view', gruppo: 'Landing', nome: 'Landing — la schermata d\'ingresso',
      nota: 'Il markup intero. All\'avvio l\'app la mostra VUOTA (applyMode(\'\')): qui i tre contenuti si vedono come stanno nel file.' },
    { id: 'landing-mode-bar', gruppo: 'Landing', nome: 'Landing — selettore di modalità',
      nota: 'Costruisci · Elabora · Insegna, e il filtro classe (chiuso: lo apre solo INSEGNA).' },
    { id: 'setup-form', gruppo: 'Landing', nome: 'COSTRUISCI — il modulo di generazione',
      nota: 'La superficie più grande rimasta fuori standard: passi, riquadri, campi e bottoni tutti fuori dai token.' },
    { id: 'floating-actions-menu', gruppo: 'Cromo della mappa', nome: 'Menu delle azioni rapide (radiale)',
      nota: 'La superficie che la console Mappa (D1) sostituisce. Nel menu dell\'atlante stanno una accanto all\'altra: si confrontano, non si ricordano.' },
    { id: 'map-control-card', gruppo: 'Cromo della mappa', nome: 'Barra dei comandi della mappa',
      nota: 'Sta FUORI dal contenitore del canvas (z-30): resta sopra la vista studio e sopra il focus a tutta area.' }
];

function raccogliRegioni() {
    const lines = fs.readFileSync(INDEX, 'utf8').split('\n');
    const out = [];
    for (const r of REGIONI) {
        const i = lines.findIndex(l => new RegExp('<(?:div|form|aside|section)\\s+id="' + r.id + '"').test(l));
        if (i < 0) { console.warn('  ⚠ regione «' + r.id + '» non trovata in index.html'); continue; }
        const end = bloccoDa(lines, i);
        out.push({
            id: (r.gruppo === 'Landing' ? 'lnd-' : 'map-') + r.id, nome: r.nome, gruppo: r.gruppo,
            nota: r.nota, src: 'public/index.html:' + (i + 1), tipo: 'html',
            html: scopri(lines.slice(i, end + 1).join('\n'))
        });
    }
    return out;
}

/* come `neutralizza`, ma conserva gli stati interni: toglie solo ciò che
   ancorerebbe il blocco allo schermo, e apre il SOLO elemento di radice. */
function scopri(raw) {
    raw = senzaScript(raw);
    const nl = raw.indexOf('>');
    let head = raw.slice(0, nl + 1);
    const rest = raw.slice(nl + 1);
    head = head.replace(/class="([^"]*)"/, (_, c) => 'class="' + c.split(/\s+/).filter(x =>
        !/^(hidden|fixed|absolute|inset-0|z-\[|z-\d|min-h-screen|opacity-0)/.test(x)).join(' ') + '"')
        .replace(/style="[^"]*"/, 'style="position:relative;width:100%"');
    return (head + rest)
        .replace(/\bon(click|change|input|submit)="/g, ' data-on$1="')
        .replace(/\bid="/g, ' data-orig-id="');
}

/* Il comportamento non è una superficie: gli <script> inline che stanno dentro
   un blocco di index.html vanno tolti. ⚠️ E vanno tolti QUI, non solo per pulizia:
   il loro `</script>` chiude il tag della pagina in cui l'atlante inietta i dati,
   e da lì in poi il file diventa markup. (Visto: con la landing dentro, la pagina
   si apriva muta — nessun errore in console, perché non c'era più uno script.) */
function senzaScript(raw) {
    return raw.replace(/<script\b[\s\S]*?<\/script>/gi,
        '<!-- script inline rimosso dall\'atlante: è comportamento, non superficie -->');
}

/* toglie ciò che rende il blocco un overlay a schermo intero, così si vede in pagina */
function neutralizza(raw) {
    raw = senzaScript(raw);
    const nl = raw.indexOf('>');
    let head = raw.slice(0, nl + 1);
    const rest = raw.slice(nl + 1);
    head = head.replace(/class="([^"]*)"/, (_, c) => {
        const keep = c.split(/\s+/).filter(x =>
            !/^(hidden|fixed|inset-0|opacity-0|z-\[|z-\d|bg-black\/|bg-slate-900\/|backdrop-blur|transition-opacity|duration-\d+|p-4|p-6|min-h-screen)/.test(x));
        return 'class="' + keep.concat(['flex', 'items-center', 'justify-center', 'w-full']).join(' ') + '"';
    }).replace(/style="[^"]*"/, '');
    let out = head + rest;
    out = out.replace(/\bscale-95\b/g, '').replace(/\bopacity-0\b/g, '')
        .replace(/\bhidden\b/g, '').replace(/style="display:\s*none[^"]*"/g, '')
        .replace(/\bon(click|change|input|submit)="/g, ' data-on$1="')
        .replace(/\bid="/g, ' data-orig-id="');
    return out;
}

/* ── C. overlay dinamici già trascritti per il campionario ─────────────── */
function raccogliDinamici() {
    let campioni = [];
    try { campioni = require('../campionario-modali/samples-dinamici.js'); } catch (e) { return []; }
    return campioni.map(c => ({
        id: 'dyn-' + c.id, nome: c.nome, gruppo: 'Overlay dinamici',
        nota: (c.note || '') + ' Stile inline: fuori dai token, i nomi qui sono FUNZIONALI.',
        src: c.src, tipo: 'html', larghezza: c.larghezza,
        html: `<div style="width:100%;max-width:${(c.larghezza || '600px').replace(/[^0-9a-z%.]/g, '')}">${c.html}</div>`
    }));
}

/* ── C-bis. le console VERE dell'app ────────────────────────────────────
 * INSEGNA e Cabina non sono mockup: le costruiscono i moduli a runtime, da dati
 * che qui non ci sono. Gli schemi si catturano una volta (`node
 * tools/atlante-ui/cattura.js`, finestra Electron nascosta + dati finti) e si
 * congelano in superfici-app.json. Se il file manca, l'atlante si costruisce
 * lo stesso: mancheranno quelle superfici, e il generatore lo dice. */
function raccogliApp() {
    try {
        const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'superfici-app.json'), 'utf8'));
        return Array.isArray(j) ? j : [];
    } catch (e) {
        console.warn('  ⚠ superfici-app.json assente: le console vere (INSEGNA, Cabina) non entrano nel menu.\n' +
            '    Rigenerale con:  node tools/atlante-ui/cattura.js');
        return [];
    }
}

/* ── D. STATI di una console ────────────────────────────────────────────
 * Una console non ha una faccia sola: la navigazione si chiude, la scheda
 * cambia, l'elenco resta vuoto. È lì che nascono i malintesi («non lo vedo» —
 * certo, in quello stato non c'è), quindi gli stati entrano nel menu come
 * superfici a sé. Si ottengono MUTANDO lo schema vero, non riscrivendolo. */
const STATI = [
    { suff: 'nav-chiusa', nome: 'navigazione chiusa', quando: s => s.layout === 'console' && !s.navChiusa,
      muta: s => ({ ...s, navChiusa: true, navChiudibile: true }),
      nota: 'La colonna è nel markup ma non si vede: i suoi pezzi restano in tabella, marcati.' },
    { suff: 'elenco-vuoto', nome: 'elenco vuoto', quando: s => s.tabella && (s.tabella.righe || []).length,
      muta: s => ({ ...s, tabella: { ...s.tabella, righe: [] } }),
      nota: 'Lo stato che nessuno disegna e tutti incontrano: quello che resta quando non c\'è niente da mostrare.' },
    { suff: 'scheda-2', nome: 'seconda scheda attiva', quando: s => (s.schede || []).length > 1,
      muta: s => ({ ...s, schede: s.schede.map((x, i) => ({ ...x, attiva: i === 1 })) }),
      nota: 'Cambia la scheda, non la vista: serve a vedere quale pezzo dipende dalla scheda e quale no.' },
    /* uno stato volutamente ROTTO, e uno solo: serve a far vedere come parla il
       validatore — se tutte le superfici sono valide, quel riquadro non lo si
       vede mai e non si impara la lingua con cui il motore contesta. */
    { suff: 'rotta', nome: 'ROTTA di proposito (senza navigazione)', unaSola: true,
      quando: s => s.layout === 'console' && (s.nav || []).length,
      muta: s => ({ ...s, nav: [] }),
      nota: 'Senza la colonna, una console è solo un elenco: il validatore lo dice, e i nomi che cita sono cliccabili.' }
];

function generaStati(consoli) {
    const out = [], fatte = new Set();
    for (const c of consoli) {
        for (const st of STATI) {
            let ok = false;
            try { ok = st.quando(c.schema); } catch (e) { }
            if (!ok) continue;
            if (st.unaSola) { if (fatte.has(st.suff)) continue; fatte.add(st.suff); }
            out.push({
                id: c.id + '--' + st.suff, nome: c.nome + ' — ' + st.nome, gruppo: 'Stati',
                nota: st.nota, src: c.src + ' (stato: ' + st.nome + ')',
                tipo: 'schema', schema: st.muta(c.schema)
            });
        }
    }
    return out;
}

/* ── verdetto del validatore, alla fonte ────────────────────────────────
 * Il validatore del motore parla già la lingua del glossario («voce», «tela»,
 * «titolo di sezione»): mostrarlo QUI accanto al disegno chiude il cerchio —
 * la stessa parola nomina il pezzo, lo valida e lo si usa parlando. */
let CORE = null;
try { CORE = require(path.join(ROOT, 'public/js/mappai-modal-core.js')); } catch (e) { }
function verdetto(s) {
    if (!CORE || s.tipo !== 'schema') return null;
    try { const v = CORE.validaSchema(s.schema); return { errori: v.errori, avvisi: v.avvisi }; }
    catch (e) { return { errori: ['il validatore non ha potuto leggere lo schema: ' + e.message], avvisi: [] }; }
}

/* ── E. CANTIERE: dove va ogni superficie, e quanto costa ───────────────
 * La destinazione è una decisione (sta in cantiere.js, scritta a mano). Il
 * COSTO no: si legge dal sorgente. Le due cose insieme fanno una coda di
 * lavoro; da sola, la destinazione è un elenco di buoni propositi.
 *
 * Prove che si contano: classi `.pm-*` (il modale scritto a mano), overlay
 * `fixed inset-0` costruiti in JS, e se il file chiama già il motore. */
const { STATI: ST_CANT, DESTINAZIONI, FUORI_ATLANTE } = require('./cantiere.js');
const _cacheFile = new Map();
function leggi(f) {
    if (!_cacheFile.has(f)) {
        try { _cacheFile.set(f, fs.readFileSync(path.join(ROOT, f), 'utf8')); }
        catch (e) { _cacheFile.set(f, ''); }
    }
    return _cacheFile.get(f);
}
function conta(txt, re) { return (txt.match(re) || []).length; }

function prove(s) {
    if (s.tipo === 'schema') return { pm: 0, inline: 0, motore: true, file: '' };
    const file = String(s.src || '').split(/[:\s]/)[0];
    /* per un blocco di index.html conta il blocco, non tutto il file: un
       modale non paga i .pm-* degli altri 24 */
    const txt = /index\.html/.test(file) ? (s.html || '') : leggi(file);
    return {
        file,
        pm: conta(txt, /\bpm-[a-z-]+/g),
        inline: conta(txt, /style\s*=\s*["'][^"']/g) + conta(txt, /fixed inset-0/g),
        motore: /MappAIModal/.test(leggi(file))
    };
}

function cantiere(superfici) {
    const perId = new Map(DESTINAZIONI.map(d => [d.id, d]));
    const noti = new Set(superfici.map(s => s.id));
    for (const d of DESTINAZIONI) {
        if (!noti.has(d.id)) console.warn('  ⚠ cantiere: la riga «' + d.id + '» non corrisponde a nessuna superficie.');
    }
    /* Gli stati generati e i mockup non sono lavoro: sono materiale di studio.
       Le console VERE invece entrano, marcate «al motore»: sono il traguardo, e
       un cantiere che mostra solo ciò che manca non fa vedere quanto è già in
       piedi. Le loro righe non si scrivono a mano — sono console per costruzione. */
    const DA_ASSEGNARE = new Set(['Modali statici', 'Overlay dinamici', 'Landing', 'Cromo della mappa']);
    const FATTE = new Set(['App (vere)']);
    return superfici
        .filter(s => perId.has(s.id) || DA_ASSEGNARE.has(s.gruppo) || FATTE.has(s.gruppo))
        .map(s => {
            const d = perId.get(s.id) ||
                (FATTE.has(s.gruppo) ? { dove: 'è già una console', stato: 'motore', nota: '' }
                    : { dove: '', stato: '', nota: '' });
            return { id: s.id, nome: s.nome, gruppo: s.gruppo, src: s.src, ...d, prove: prove(s) };
        });
}

/* ── montaggio ─────────────────────────────────────────────────────────── */
const APP = raccogliApp();               // le console vere, per prime: sono quelle che si usano
const CONSOLI = raccogliConsole();
const SUPERFICI = [...APP, ...CONSOLI, ...generaStati(CONSOLI.concat(APP)),
    ...raccogliRegioni(), ...raccogliStatici(), ...raccogliDinamici()]
    .map(s => ({ ...s, verdetto: verdetto(s) }));
const GRUPPI = [...new Set(SUPERFICI.map(s => s.gruppo))];
const CANTIERE = cantiere(SUPERFICI);

const opzioni = GRUPPI.map(g =>
    `<optgroup label="${g} (${SUPERFICI.filter(s => s.gruppo === g).length})">` +
    SUPERFICI.filter(s => s.gruppo === g)
        .map(s => `<option value="${s.id}">${s.nome.replace(/</g, '&lt;')}</option>`).join('') +
    '</optgroup>').join('\n');

/* ── la tabella del cantiere, scritta in fase di build ──────────────────
 * Non sta dietro un bottone come la copertura: quella deve ciclare il DOM, questa
 * si sa già. È la prima cosa da guardare aprendo la pagina. */
/* dati iniettati nello <script> della pagina: `<` va sempre neutralizzato.
   Le superfici PORTANO markup, e un solo `</script>` dentro un dato chiude il
   tag e trasforma il resto del file in testo. */
function dati(v) { return JSON.stringify(v).replace(/</g, '\\u003c'); }

const ORDINE = ['daFare', 'ponte', '', 'pensione', 'fuori', 'motore'];
const _hE = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function bollo(st) {
    const s = ST_CANT[st] || { nome: 'da assegnare', colore: '#4f46e5' };
    return `<span class="stato" style="background:${s.colore}">${_hE(s.nome)}</span>`;
}
const CONTI = ORDINE.map(st => ({
    st, n: CANTIERE.filter(c => (c.stato || '') === st).length,
    nome: (ST_CANT[st] || { nome: 'da assegnare' }).nome
})).filter(x => x.n);

const righeCantiere = CANTIERE.slice().sort((a, b) =>
    (ORDINE.indexOf(a.stato || '') - ORDINE.indexOf(b.stato || '')) ||
    (b.prove.pm + b.prove.inline) - (a.prove.pm + a.prove.inline) ||
    a.nome.localeCompare(b.nome)
).map(c => {
    const costo = c.prove.pm + c.prove.inline;
    const segni = [c.prove.pm ? `<code>.pm-*</code> ×${c.prove.pm}` : '',
    c.prove.inline ? `<span class="cnt">stile inline ×${c.prove.inline}</span>` : '',
    c.prove.motore ? '<span class="ok-s">il file chiama il motore</span>' : ''].filter(Boolean).join(' · ');
    return `<tr><td>${bollo(c.stato)}</td>` +
        `<td><a href="?s=${encodeURIComponent(c.id)}">${_hE(c.nome)}</a>` +
        `<div class="cnt">${_hE(c.src)}</div></td>` +
        `<td>${c.dove ? _hE(c.dove) : '<span class="cnt">— nessuna destinazione decisa</span>'}</td>` +
        `<td class="n">${costo || '<span class="cnt">0</span>'}</td>` +
        `<td>${segni}${c.nota ? `<div class="cnt" style="margin-top:3px">${_hE(c.nota)}</div>` : ''}</td></tr>`;
}).join('');

const righeFuori = FUORI_ATLANTE.map(f =>
    `<tr><td>${bollo(f.stato)}</td><td><b>${_hE(f.nome)}</b>` +
    `<div class="cnt">${_hE((f.file || []).join(' · '))}</div></td>` +
    `<td>${_hE(f.dove)}</td><td class="n"><span class="cnt">—</span></td>` +
    `<td><div class="cnt">${_hE(f.nota || '')}</div></td></tr>`).join('');

const page = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Atlante UI — MappAI</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap" rel="stylesheet">
<style>:root{--emoji-font:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif}</style>
<script src="../js/tailwind.js"></script>
<link rel="stylesheet" href="../css/style.css?v=${vCss}">
<link rel="stylesheet" href="../css/mappai-modal-tokens.css?v=${vCss}">
<script src="../js/lucide.min.js"></script>
<script src="../js/mappai-modal-core.js?v=${vCss}"></script>
<script src="../js/mappai-modal.js?v=${vCss}"></script>
<style>
  body{background:#eef1f6;color:#0f172a;margin:0;font-family:'Space Mono',var(--emoji-font),monospace}
  .wrap{max-width:1500px;margin:0 auto;padding:0 20px 80px}
  header.top{position:sticky;top:0;z-index:60;background:rgba(238,241,246,.96);backdrop-filter:blur(8px);
    border-bottom:1px solid #d7dde7;padding:12px 0}
  h1{font-size:20px;margin:0 0 2px;font-weight:700}
  .sub{font-size:12px;color:#64748b;margin:0}
  .barra{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px}
  select,input[type=search]{font-family:inherit;font-size:13px;padding:9px 11px;border:1px solid #cbd5e1;
    border-radius:10px;background:#fff;color:#0f172a}
  select#sup{min-width:340px;font-weight:700}
  .sw{display:flex;align-items:center;gap:6px;font-size:11.5px;color:#475569;background:#fff;
    border:1px solid #cbd5e1;border-radius:10px;padding:8px 11px;cursor:pointer;user-select:none}
  .meta{font-size:11px;color:#64748b;margin:10px 0 0;line-height:1.6}
  .meta code{background:#fff;border:1px solid #dbe1ea;border-radius:5px;padding:1px 6px;font-size:10.5px}

  /* palco */
  .palco{position:relative;background:#334155;background-image:radial-gradient(#475569 1px,transparent 1px);
    background-size:14px 14px;border-radius:16px;padding:34px;margin-top:16px;overflow:auto}
  #scena{position:relative;display:flex;justify-content:center;min-height:200px}
  #scena *{scroll-margin:60px}
  #cartellini{position:absolute;inset:0;pointer-events:none;z-index:40}
  .cart{position:absolute;transform:translateY(-50%);display:flex;align-items:center;gap:4px;
    pointer-events:auto;cursor:default}
  .cart b{width:21px;height:21px;border-radius:50%;color:#fff;font-size:11px;font-weight:700;
    display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px #fff,0 2px 5px rgba(0,0,0,.35)}
  .cart span{background:#0f172a;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:5px;
    white-space:nowrap;box-shadow:0 0 0 1.5px #fff;opacity:0;transition:opacity .12s}
  .cart:hover span,.cart.on span{opacity:1}
  body.nolabel .cart span{display:none}
  [data-atl-hl]{outline:2.5px solid #f59e0b !important;outline-offset:1px;
    box-shadow:0 0 0 6px rgba(245,158,11,.25) !important;border-radius:4px}

  /* tabella */
  h2{font-size:14px;margin:30px 0 8px;letter-spacing:.04em;color:#475569}
  table{border-collapse:collapse;width:100%;background:#fff;border-radius:12px;overflow:hidden;
    box-shadow:0 2px 10px rgba(15,23,42,.08);table-layout:fixed}
  col.c1{width:42px}col.c2{width:230px}col.c3{width:210px}col.c4{width:120px}col.c5{width:auto}
  th,td{text-align:left;padding:9px 11px;border-bottom:1px solid #e2e8f0;vertical-align:top;
    font-size:12px;line-height:1.5;word-break:break-word}
  th{background:#f8fafc;font-size:10px;letter-spacing:.1em;color:#94a3b8}
  tbody tr{cursor:pointer}
  tbody tr:hover,tbody tr.on{background:#fffbeb}
  tbody tr.on td:first-child{box-shadow:inset 3px 0 0 #f59e0b}
  tbody tr.sel{background:#fef3c7}
  tbody tr.sel td:first-child{box-shadow:inset 4px 0 0 #d97706}
  th.ord{cursor:pointer;user-select:none}
  th.ord:hover{color:#4f46e5}
  th .frec{display:inline-block;width:9px;color:#cbd5e1}
  th[aria-sort] .frec{color:#4f46e5}
  td.n{font-weight:700}
  /* selezione col clic: resta accesa finché non se ne sceglie un'altra (ESC la toglie) */
  [data-atl-sel]{outline:3px solid #d97706 !important;outline-offset:2px;
    box-shadow:0 0 0 7px rgba(217,119,6,.28) !important;border-radius:4px}
  .cart.sel b{box-shadow:0 0 0 3px #d97706,0 0 0 5px #fff}
  .cart.sel span{opacity:1}
  #scena{cursor:crosshair}
  .avvisi{background:#fff;border:1px solid #dbe1ea;border-radius:14px;padding:12px 15px;margin-top:14px;font-size:12px;line-height:1.6}
  .avvisi b{font-size:10px;letter-spacing:.1em;color:#94a3b8;display:block;margin-bottom:6px}
  .avvisi li{margin:2px 0}
  .avvisi .e{color:#b91c1c}.avvisi .a{color:#b45309}.avvisi .ok{color:#047857}
  .avvisi em{font-style:normal;background:#fef3c7;border-radius:4px;padding:0 4px;cursor:pointer}
  .toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#0f172a;color:#fff;
    font-size:12px;font-weight:700;padding:10px 16px;border-radius:10px;z-index:99;opacity:0;
    transition:opacity .15s;pointer-events:none}
  .toast.on{opacity:1}
  #cop td{font-size:11.5px}
  .barra-cop{height:7px;background:#e2e8f0;border-radius:99px;overflow:hidden}
  .barra-cop i{display:block;height:100%;background:#4f46e5}
  /* cantiere */
  .stato{display:inline-block;font-size:9.5px;font-weight:700;color:#fff;border-radius:999px;
    padding:3px 8px;letter-spacing:.04em;white-space:nowrap}
  .conti{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 4px}
  .conti .c{background:#fff;border:1px solid #dbe1ea;border-radius:10px;padding:7px 11px;font-size:11.5px;
    display:flex;align-items:center;gap:7px}
  .conti .c b{font-size:16px}
  #cant a,#cant2 a{color:#4f46e5;text-decoration:none;font-weight:700}
  #cant a:hover,#cant2 a:hover{text-decoration:underline}
  #cant td,#cant2 td{font-size:11.5px}
  .ok-s{color:#047857;font-weight:700;font-size:10.5px}
  .legenda{font-size:11px;color:#64748b;line-height:1.7;margin:8px 0 0}
  .legenda .stato{margin-right:5px}
  .fam{display:inline-block;font-size:9.5px;font-weight:700;color:#fff;border-radius:999px;padding:2px 7px;letter-spacing:.04em}
  code{background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:11px;color:#4f46e5}
  .cnt{font-size:10px;color:#94a3b8;font-weight:400}
  .vuoto{padding:16px;color:#94a3b8;font-size:12px}
  .gergo{background:#fff;border:1px solid #dbe1ea;border-radius:14px;padding:16px 18px;margin-top:26px;
    font-size:12.5px;line-height:1.7;color:#334155}
  .gergo b{color:#0f172a}
  .gergo .es{background:#f1f5f9;border-radius:6px;padding:2px 7px;color:#4f46e5;font-weight:700}
</style>
</head>
<body>

<header class="top"><div class="wrap">
  <h1>Atlante UI — MappAI</h1>
  <p class="sub">Il vocabolario dell'interfaccia. Passa sopra un pezzo per vederne il nome, <b>clicca per fissarlo</b> e portarti sulla sua riga. Clic sulla riga = nome copiato negli appunti.</p>
  <div class="barra">
    <select id="sup">${opzioni}</select>
    <select id="filtro" title="mostra nel menu solo le superfici in questo stato del cantiere">
      <option value="">tutte le superfici</option>
      ${CONTI.map(c => `<option value="${c.st}">${c.nome} (${c.n})</option>`).join('')}
    </select>
    <input type="search" id="cerca" placeholder="filtra la tabella (nome, classe, campo)…" style="min-width:230px">
    <label class="sw"><input type="checkbox" id="lab" checked> etichette sempre visibili</label>
    <label class="sw"><input type="checkbox" id="tutti"> un cartellino per OGNI occorrenza</label>
  </div>
  <p class="meta" id="meta"></p>
</div></header>

<div class="wrap">
  <div class="palco"><div id="scena"></div><div id="cartellini"></div></div>

  <div class="avvisi" id="verdetto"></div>

  <h2>PEZZI RICONOSCIUTI IN QUESTA SUPERFICIE — <span id="nsup" class="cnt"></span></h2>
  <table>
    <colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"><col class="c5"></colgroup>
    <thead><tr>
      <th class="ord" data-c="n">N <span class="frec"></span></th>
      <th class="ord" data-c="nome">NOME DA USARE <span class="frec"></span></th>
      <th class="ord" data-c="classe">CLASSE CSS <span class="frec"></span></th>
      <th class="ord" data-c="fam">FAMIGLIA <span class="frec"></span></th>
      <th>A CHE SERVE / CAMPO DELLO SCHEMA</th>
    </tr></thead>
    <tbody id="tb"></tbody>
  </table>

  <h2>CANTIERE — che cosa resta, e dove va</h2>
  <p class="meta">La destinazione è una decisione e sta scritta a mano in <code>tools/atlante-ui/cantiere.js</code>;
    il <b>costo</b> no, lo conta il codice: classi <code>.pm-*</code> + stili inline. Per un blocco di
    <code>index.html</code> è misurato sul blocco; per un overlay costruito in JS è misurato sull'INTERO file
    — che è la scala giusta, perché quel file si migra tutto insieme. Clicca il nome per aprire la superficie
    qui sopra. Le righe con «nessuna destinazione decisa» non sono lavoro: sono le <b>decisioni che mancano</b>,
    ed è quello che blocca il resto.</p>
  <div class="conti">
    ${CONTI.map(c => `<div class="c">${bollo(c.st)}<b>${c.n}</b></div>`).join('')}
  </div>
  <p class="legenda">${ORDINE.filter(st => ST_CANT[st]).map(st =>
    `${bollo(st)}${_hE(ST_CANT[st].spiega)}`).join('<br>')}</p>
  <table id="cant">
    <colgroup><col style="width:112px"><col style="width:260px"><col style="width:210px"><col style="width:58px"><col></colgroup>
    <thead><tr><th>STATO</th><th>SUPERFICIE</th><th>DOVE VA</th><th>COSTO</th><th>PROVE LETTE DAL CODICE</th></tr></thead>
    <tbody>${righeCantiere}</tbody>
  </table>

  <h2>CANTIERE — lavori senza una superficie qui dentro</h2>
  <p class="meta">Finestre-documento, contenitori mancanti, codice rimasto senza ingresso. Stanno nella stessa
    tabella del resto perché la coda di lavoro dev'essere una sola: se metà vive nell'handoff e metà qui, si
    lavora due volte sulla stessa cosa.</p>
  <table id="cant2" class="cant">
    <colgroup><col style="width:112px"><col style="width:260px"><col style="width:210px"><col style="width:58px"><col></colgroup>
    <thead><tr><th>STATO</th><th>LAVORO</th><th>DOVE VA</th><th></th><th>PERCHÉ</th></tr></thead>
    <tbody>${righeFuori}</tbody>
  </table>

  <h2>COPERTURA — quanto di ogni superficie è già standard</h2>
  <p class="meta">Due misure, e vanno lette insieme. <b>Al motore</b> = pezzi con una classe
    <code>.mm-*</code>: è la classifica di migrazione, e ordina la tabella. <b>Con un nome</b> = pezzi
    che il glossario sa nominare, standard o no — misura quanto di quella superficie si può indicare a
    parole. Una superficie può stare in alto nella seconda e a zero nella prima: vuol dire che sappiamo
    parlarne benissimo e che è tutta da rifare.
    <button id="calc" class="sw" style="margin-left:8px">Calcola (cicla tutte le superfici)</button></p>
  <table>
    <colgroup><col style="width:36px"><col style="width:140px"><col><col style="width:56px"><col style="width:150px"><col style="width:150px"></colgroup>
    <thead><tr><th>#</th><th>GRUPPO</th><th>SUPERFICIE</th><th>PEZZI</th><th>AL MOTORE</th><th>CON UN NOME</th></tr></thead>
    <tbody id="cop"><tr><td colspan="6" class="vuoto">Non ancora calcolata.</td></tr></tbody>
  </table>

  <div class="gergo">
    <b>Come parlarne in modo che io capisca al primo colpo.</b> La forma che non lascia ambiguità è
    <span class="es">superficie › pezzo</span>, e il pezzo è il NOME della seconda colonna (o la sua classe).
    Esempi: <span class="es">Registro › badge della voce</span> · <span class="es">Cabina E1 › elenco modificabile «Materie»</span> ·
    <span class="es">Documento F2 › maniglia della colonna</span>. Se il pezzo compare più volte, aggiungi
    l'ancora: <span class="es">la terza voce d'elenco</span>, <span class="es">il bollino della riga 4R</span>.<br>
    Quando il pezzo NON esiste ancora, dillo con la stessa lingua: «serve una <b>riga di esito</b> sotto le azioni»
    è un'istruzione eseguibile; «metti un messaggino sotto» no.
  </div>
</div>

<script>
const SUPERFICI = ${dati(SUPERFICI)};
const GLOSSARIO = ${dati(GLOSSARIO)};
const FAMIGLIE  = ${dati(FAMIGLIE)};
const CANTIERE  = ${dati(CANTIERE.map(c => ({ id: c.id, dove: c.dove, stato: c.stato, nota: c.nota })))};
const STATI     = ${dati(ST_CANT)};
const OPZIONI   = ${dati(opzioni)};

const scena = document.getElementById('scena');
const layer = document.getElementById('cartellini');
const tb = document.getElementById('tb');
let TROVATI = [];          // [{g, els:[], n}]
let elMap = [];            // [{el, i}] per la ricerca inversa
let SEL = null;            // pezzo FISSATO col clic (resta acceso)
let ORD = { c: 'n', dir: 1 };
let SUP = null;            // superficie corrente

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ── riconoscimento: il PRIMO selettore che combacia vince ─────────────── */
function riconosci(el){
  for (let i = 0; i < GLOSSARIO.length; i++) {
    try { if (el.matches(GLOSSARIO[i].sel)) return i; } catch(e){}
  }
  return -1;
}

function disegna(id){
  const s = SUPERFICI.find(x => x.id === id) || SUPERFICI[0];
  SUP = s; SEL = null;
  scena.innerHTML = ''; layer.innerHTML = ''; TROVATI = []; elMap = [];

  if (s.tipo === 'schema' && window.MappAIModal && MappAIModal.render) {
    try { scena.appendChild(MappAIModal.render(s.schema)); }
    catch(e){ scena.innerHTML = '<div style="color:#fca5a5">Il motore non ha potuto disegnare questo schema: ' + esc(e.message) + '</div>'; }
  } else {
    scena.innerHTML = s.html || '';
    // I modali storici non hanno classi semantiche: velo e riquadro si
    // riconoscono solo per POSIZIONE, e la posizione la sa solo chi ha appena
    // montato il blocco. Marcarli qui è più solido che indovinarli con un selettore.
    // ⚠️ Solo per i MODALI: la landing e il cromo della mappa non hanno un velo,
    // e marcarli così faceva chiamare «riquadro» il modulo di generazione.
    if (s.gruppo === 'Modali statici' || s.gruppo === 'Overlay dinamici') {
      const velo = scena.firstElementChild;
      if (velo) {
        velo.setAttribute('data-atl','velo');
        const box = velo.firstElementChild;
        if (box) box.setAttribute('data-atl','riquadro');
      }
    }
  }
  if (window.lucide) { try { lucide.createIcons(); } catch(e){} }

  /* lo stato del cantiere accanto alla superficie: guardandola si sa già se è
     roba fatta, un ponte da chiudere o una decisione che manca */
  const c = CANTIERE.find(x => x.id === s.id);
  let bollo = '';
  if (c) {
    const st = STATI[c.stato] || { nome: 'da assegnare', colore: '#4f46e5',
      spiega: 'Nessuna destinazione decisa: è una decisione che manca, non un lavoro da fare.' };
    bollo = '<span class="stato" style="background:' + st.colore + '">' + esc(st.nome) + '</span> ' +
      (c.dove ? '<b>→ ' + esc(c.dove) + '</b> · ' : '') + esc(c.nota || st.spiega) + '<br>';
  }
  document.getElementById('meta').innerHTML =
    bollo + '<code>' + esc(s.src) + '</code> · ' + esc(s.nota || '');

  // il motore può disegnare un overlay a schermo intero: qui va contenuto nel palco
  scena.querySelectorAll('.mm-overlay').forEach(o => {
    o.style.position = 'relative'; o.style.inset = 'auto';
    o.style.width = '100%'; o.style.minHeight = '520px';
  });

  // Annotazione SINCRONA: né requestAnimationFrame (a finestra nascosta i
  // fotogrammi non arrivano) né setTimeout (in secondo piano è strozzato a ~1/s).
  // getBoundingClientRect forza da sé il calcolo del layout: non serve aspettare.
  annota(); tabella(); verdetto(s);
}

/* ── il verdetto del validatore, accanto al disegno ─────────────────────
 * Stessa lingua in tre posti: il pezzo si chiama così nel disegno, così nella
 * tabella e così nel messaggio che lo contesta. I nomi citati nel messaggio
 * sono cliccabili e accendono la loro riga. */
function verdetto(s){
  const box = document.getElementById('verdetto');
  if (!s.verdetto) { box.style.display = 'none'; return; }
  box.style.display = '';
  const { errori, avvisi } = s.verdetto;
  if (!errori.length && !avvisi.length) {
    box.innerHTML = '<b>VERDETTO DEL VALIDATORE</b><span class="ok">Nessun errore, nessun avviso.</span>';
    return;
  }
  box.innerHTML = '<b>VERDETTO DEL VALIDATORE</b><ul style="margin:0;padding-left:18px">' +
    errori.map(e => '<li class="e">errore · ' + collega(e) + '</li>').join('') +
    avvisi.map(a => '<li class="a">avviso · ' + collega(a) + '</li>').join('') + '</ul>';
}

/* rende cliccabili, dentro un messaggio, i nomi dei pezzi presenti in tabella */
function collega(txt){
  let out = esc(txt);
  [...TROVATI].sort((a,b) => b.g.nome.length - a.g.nome.length).forEach(t => {
    const nome = t.g.nome.replace(/\\s*\\(.*/, '');
    if (nome.length < 5) return;
    const re = new RegExp('(?<![\\\\w>])(' + nome.replace(/[.*+?^\${}()|[\\]\\\\]/g,'\\\\$&') + ')(?![\\\\w<])', 'i');
    if (re.test(out)) out = out.replace(re, '<em data-n="'+t.n+'">$1</em>');
  });
  return out;
}

function annota(){
  // querySelectorAll restituisce già in ordine di documento: l'ordine di prima
  // comparsa si legge dalla passata stessa. (Cercarlo dopo con un TreeWalker per
  // elemento costa O(n²) e su una console piena blocca la pagina — visto.)
  const trovati = new Map();
  const ordine = [];
  scena.querySelectorAll('*').forEach(el => {
    if (el.closest('.mm-tip')) return;
    const i = riconosci(el);
    if (i < 0) return;
    if (!trovati.has(i)) { trovati.set(i, []); ordine.push(i); }
    trovati.get(i).push(el);
  });
  TROVATI = ordine.map((i, k) => ({ i, g: GLOSSARIO[i], els: trovati.get(i), n: k + 1 }));
  TROVATI.forEach(t => t.els.forEach(el => elMap.push({ el, t })));
  cartellini();
}

function cartellini(){
  layer.innerHTML = '';
  TROVATI.forEach(t => { t.visto = false; });
  const ogni = document.getElementById('tutti').checked;
  const base = layer.getBoundingClientRect();
  TROVATI.forEach(t => {
    const col = FAMIGLIE[t.g.fam] || '#475569';
    (ogni ? t.els : t.els.slice(0,1)).forEach(el => {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;          // pezzo presente ma non visibile in questo stato
      t.visto = true;
      const d = document.createElement('div');
      d.className = 'cart'; d.dataset.n = t.n;
      d.style.left = Math.max(0, r.left - base.left) + 'px';
      d.style.top  = (r.top - base.top) + 'px';
      d.innerHTML = '<b style="background:'+col+'">'+t.n+'</b><span>'+esc(t.g.nome)+'</span>';
      d.addEventListener('mouseenter', () => accendi(t.n, true));
      d.addEventListener('mouseleave', () => accendi(t.n, false));
      layer.appendChild(d);
    });
  });
}

/* chiave di ordinamento: la FAMIGLIA si ordina alfabeticamente ma, a parità,
   si torna all'ordine di comparsa — così dentro una famiglia si legge dall'alto
   della schermata, non a caso. */
function chiave(t, c){
  if (c === 'n') return t.n;
  if (c === 'fam') return t.g.fam;
  if (c === 'nome') return t.g.nome.toLowerCase();
  if (c === 'classe') return t.g.classe === '—' ? '\\uffff' : t.g.classe;   // i senza-classe in fondo
  return t.n;
}

function tabella(){
  const q = document.getElementById('cerca').value.trim().toLowerCase();
  const righe = TROVATI.filter(t => !q ||
    (t.g.nome + ' ' + t.g.classe + ' ' + t.g.fam + ' ' + t.g.schema + ' ' + t.g.spiega).toLowerCase().includes(q))
    .slice().sort((a,b) => {
      const ka = chiave(a, ORD.c), kb = chiave(b, ORD.c);
      if (ka < kb) return -ORD.dir;
      if (ka > kb) return  ORD.dir;
      return a.n - b.n;                       // stabile: a parità, ordine di comparsa
    });
  document.querySelectorAll('th.ord').forEach(th => {
    const attivo = th.dataset.c === ORD.c;
    if (attivo) th.setAttribute('aria-sort', ORD.dir > 0 ? 'ascending' : 'descending');
    else th.removeAttribute('aria-sort');
    th.querySelector('.frec').textContent = attivo ? (ORD.dir > 0 ? '▲' : '▼') : '▵';
  });
  document.getElementById('nsup').textContent =
    TROVATI.length + ' pezzi distinti' + (q ? ' · ' + righe.length + ' in elenco' : '');
  if (!righe.length) { tb.innerHTML = '<tr><td colspan="5" class="vuoto">Nessun pezzo corrisponde.</td></tr>'; return; }
  tb.innerHTML = righe.map(t => {
    const col = FAMIGLIE[t.g.fam] || '#475569';
    const molti = t.els.length > 1 ? ' <span class="cnt">×'+t.els.length+'</span>' : '';
    // c'è nel markup ma non si vede in questo stato (navigazione chiusa, scheda non attiva…):
    // dirlo evita la domanda «e allora dov'è il cartellino 19?»
    const nasc = t.visto ? '' : ' <span class="cnt">· nel markup, non visibile in questo stato</span>';
    return '<tr data-n="'+t.n+'"'+(t.visto?'':' style="opacity:.62"')+'>' +
      '<td class="n" style="color:'+col+'">'+t.n+'</td>' +
      '<td><b>'+esc(t.g.nome)+'</b>'+molti+nasc+'</td>' +
      '<td>'+(t.g.classe === '—' ? '<span class="cnt">senza classe</span>' : '<code>'+esc(t.g.classe)+'</code>')+'</td>' +
      '<td><span class="fam" style="background:'+col+'">'+esc(t.g.fam)+'</span></td>' +
      '<td>'+esc(t.g.spiega)+(t.g.schema && t.g.schema !== '—' ? ' <code>'+esc(t.g.schema)+'</code>' : '')+'</td></tr>';
  }).join('');
}

/* ── accensione: passaggio = provvisoria · clic = FISSATA ────────────────
 * Il passaggio non porta più la pagina sulla tabella: muovendo il mouse sul
 * disegno la vista scappava sotto le dita e nulla restava acceso. Ora il
 * passaggio illumina e basta; è il CLIC che sceglie, scorre e resta. */
function accendi(n, on){
  const sel = SEL;
  tb.querySelectorAll('tr').forEach(tr =>
    tr.classList.toggle('on', (on && tr.dataset.n == n) && tr.dataset.n != sel));
  layer.querySelectorAll('.cart').forEach(c =>
    c.classList.toggle('on', on && c.dataset.n == n));
  const t = TROVATI.find(x => x.n == n);
  if (!t || n == sel) return;                       // la selezione ha il suo segno, più forte
  t.els.forEach(el => on ? el.setAttribute('data-atl-hl','') : el.removeAttribute('data-atl-hl'));
}

function fissa(n){
  // via i segni precedenti (provvisori e fissati)
  scena.querySelectorAll('[data-atl-sel],[data-atl-hl]').forEach(el => {
    el.removeAttribute('data-atl-sel'); el.removeAttribute('data-atl-hl'); });
  tb.querySelectorAll('tr').forEach(tr => tr.classList.remove('sel','on'));
  layer.querySelectorAll('.cart').forEach(c => c.classList.remove('sel'));
  SEL = n || null;
  if (!SEL) return;
  const t = TROVATI.find(x => x.n == SEL);
  if (!t) { SEL = null; return; }
  t.els.forEach(el => el.setAttribute('data-atl-sel',''));
  layer.querySelectorAll('.cart[data-n="'+SEL+'"]').forEach(c => c.classList.add('sel'));
  const tr = tb.querySelector('tr[data-n="'+SEL+'"]');
  if (tr) { tr.classList.add('sel'); tr.scrollIntoView({block:'center', behavior:'smooth'}); }
}

/* il pezzo più INTERNO che ha un nome, a partire da un elemento del disegno */
function pezzoDi(target){
  let el = target;
  while (el && el !== scena) {
    const hit = elMap.find(m => m.el === el);
    if (hit) return hit.t.n;
    el = el.parentElement;
  }
  return null;
}

tb.addEventListener('mouseover', e => { const tr = e.target.closest('tr'); if (tr) accendi(tr.dataset.n, true); });
tb.addEventListener('mouseout',  e => { const tr = e.target.closest('tr'); if (tr) accendi(tr.dataset.n, false); });

/* clic sulla riga: fissa + copia «superficie › pezzo» — è la forma da incollarmi in chat */
tb.addEventListener('click', e => {
  const tr = e.target.closest('tr'); if (!tr || !tr.dataset.n) return;
  fissa(tr.dataset.n);
  const t = TROVATI.find(x => x.n == tr.dataset.n);
  if (t) copia(SUP.nome + ' › ' + t.g.nome + (t.g.classe !== '—' ? '  (' + t.g.classe + ')' : ''));
});

let ultimo = null;
scena.addEventListener('mouseover', e => {
  const n = pezzoDi(e.target);
  if (n === ultimo) return;
  if (ultimo) accendi(ultimo, false);
  ultimo = n;
  if (n) accendi(n, true);          // niente scrollIntoView: il passaggio non deve spostare la pagina
});
scena.addEventListener('mouseleave', () => { if (ultimo) accendi(ultimo, false); ultimo = null; });
scena.addEventListener('click', e => {
  e.preventDefault(); e.stopPropagation();      // i campioni contengono bottoni veri
  const n = pezzoDi(e.target);
  if (n) fissa(n);
}, true);
layer.addEventListener('click', e => { const c = e.target.closest('.cart'); if (c) fissa(c.dataset.n); });
addEventListener('keydown', e => { if (e.key === 'Escape') fissa(null); });

/* clic su un nome citato dal validatore → fissa quel pezzo */
document.getElementById('verdetto').addEventListener('click', e => {
  const em = e.target.closest('em[data-n]'); if (em) fissa(em.dataset.n);
});

/* ordinamento della tabella: clic sull'intestazione, secondo clic inverte */
document.querySelectorAll('th.ord').forEach(th => th.addEventListener('click', () => {
  const c = th.dataset.c;
  ORD = (ORD.c === c) ? { c, dir: -ORD.dir } : { c, dir: 1 };
  tabella();
  if (SEL) { const tr = tb.querySelector('tr[data-n="'+SEL+'"]'); if (tr) tr.classList.add('sel'); }
}));

function copia(txt){
  const dopo = () => toast('Copiato: ' + txt);
  if (navigator.clipboard) navigator.clipboard.writeText(txt).then(dopo, () => toast(txt));
  else toast(txt);
}
let tTimer = null;
function toast(txt){
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = txt; t.classList.add('on');
  clearTimeout(tTimer); tTimer = setTimeout(() => t.classList.remove('on'), 2200);
}

/* ── copertura: la classifica di migrazione ─────────────────────────────
 * Si calcola ciclando davvero tutte le superfici (~200ms): un numero stimato
 * non direbbe niente. Sta dietro un bottone per non pagarlo a ogni apertura. */
document.getElementById('calc').addEventListener('click', () => {
  const corrente = SUP.id, righe = [];
  SUPERFICI.forEach(s => {
    disegna(s.id);
    const conClasse = TROVATI.filter(t => t.g.classe !== '—').length;
    // ⚠️ due misure, non una: da quando anche i pezzi della landing hanno un
    // nome nel glossario, «con classe» dice che sappiamo NOMINARLA, non che sia
    // migrata (la landing è salita al 62% restando tutta fuori standard).
    // «Al motore» conta i soli pezzi .mm-*: quella è la classifica di migrazione.
    const alMotore = TROVATI.filter(t => /^\.mm-/.test(t.g.classe)).length;
    righe.push({ id: s.id, nome: s.nome, gruppo: s.gruppo, n: TROVATI.length,
                 pct: TROVATI.length ? Math.round(100 * conClasse / TROVATI.length) : 0,
                 mm:  TROVATI.length ? Math.round(100 * alMotore  / TROVATI.length) : 0 });
  });
  disegna(corrente);
  document.getElementById('sup').value = corrente;
  righe.sort((a,b) => a.mm - b.mm || a.pct - b.pct || a.n - b.n);
  document.getElementById('cop').innerHTML = righe.map((r,i) =>
    '<tr><td>'+(i+1)+'</td><td><span class="cnt">'+esc(r.gruppo)+'</span></td>' +
    '<td><a href="?s='+encodeURIComponent(r.id)+'" style="color:#4f46e5;text-decoration:none">'+esc(r.nome)+'</a></td>' +
    '<td>'+r.n+'</td>' +
    '<td><div class="barra-cop"><i style="width:'+r.mm+'%;background:#047857"></i></div>' +
      '<span class="cnt">'+r.mm+'%</span></td>' +
    '<td><div class="barra-cop"><i style="width:'+r.pct+'%"></i></div>' +
      '<span class="cnt">'+r.pct+'%</span></td></tr>').join('');
});

document.getElementById('sup').addEventListener('change', e => {
  disegna(e.target.value);
  history.replaceState(null, '', '?s=' + encodeURIComponent(e.target.value));
});

/* ── filtro del menu per stato del cantiere ─────────────────────────────
 * Scegliere «da migrare» riduce il menu a quello che resta: si passa da una
 * superficie all'altra della coda senza tornare alla tabella ogni volta. */
document.getElementById('filtro').addEventListener('change', e => {
  const st = e.target.value;
  const sup = document.getElementById('sup');
  const corrente = sup.value;
  if (!st) { sup.innerHTML = OPZIONI; sup.value = corrente; return; }
  const ammessi = new Set(CANTIERE.filter(c => (c.stato || '') === st).map(c => c.id));
  const gruppi = {};
  SUPERFICI.filter(s => ammessi.has(s.id)).forEach(s => (gruppi[s.gruppo] = gruppi[s.gruppo] || []).push(s));
  sup.innerHTML = Object.keys(gruppi).map(g =>
    '<optgroup label="' + esc(g) + ' (' + gruppi[g].length + ')">' +
    gruppi[g].map(s => '<option value="' + s.id + '">' + esc(s.nome) + '</option>').join('') +
    '</optgroup>').join('');
  // se la superficie a schermo non è in elenco, si apre la prima della coda
  if (ammessi.has(corrente)) sup.value = corrente;
  else if (sup.options.length) { sup.selectedIndex = 0; disegna(sup.value); }
});
document.getElementById('cerca').addEventListener('input', tabella);
document.getElementById('lab').addEventListener('change', e => document.body.classList.toggle('nolabel', !e.target.checked));
document.getElementById('tutti').addEventListener('change', () => { cartellini(); tabella(); if (SEL) fissa(SEL); });
addEventListener('resize', () => { cartellini(); if (SEL) fissa(SEL); });

/* ?s=<id> apre direttamente una superficie: così un link punta a un pezzo preciso */
const chiesta = new URLSearchParams(location.search).get('s');
const iniziale = SUPERFICI.some(x => x.id === chiesta) ? chiesta : SUPERFICI[0].id;
document.getElementById('sup').value = iniziale;
disegna(iniziale);
</script>
</body>
</html>`;

fs.writeFileSync(OUT, page, 'utf8');
console.log('Atlante UI scritto: ' + path.relative(ROOT, OUT));
console.log('  superfici: ' + SUPERFICI.length + '  (' + GRUPPI.map(g =>
    g + ' ' + SUPERFICI.filter(s => s.gruppo === g).length).join(' · ') + ')');
console.log('  voci di glossario: ' + GLOSSARIO.length);
