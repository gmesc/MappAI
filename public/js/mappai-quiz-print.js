/**
 * mappai-quiz-print.js
 * Stampa quiz e flashcard come pagine HTML per MappAI
 * Dipende da: app.js (appState, cleanLabel, showToast), mappai-docedit-core.js
 *
 * I builder (buildQuizSetHtml / buildFlashcardSetHtml) sono PURI e sono l'unica
 * resa del foglio: li usano la stampa dalla sidebar, la pipeline materiali,
 * l'editor documenti di ELABORA e la condivisione QR di INSEGNA. Chi edita un
 * quiz edita gli item, mai questo HTML.
 */

/* Il CARATTERE di questo documento: le @font-face + la variabile --doc-font
   che la regola del `body` legge. Un documento in finestra propria non carica
   style.css, quindi `--app-font` lì non esiste: il blocco va scritto dentro.
   Argomento = la scelta fatta in ELABORA per QUESTO documento; senza, comanda
   il carattere dell'app (18/8/26).
   ⚠️ Sostituisce il <link> a fonts.googleapis.com che stava qui: un foglio
   stampato in aula senza rete perdeva il suo carattere, in silenzio. */
function _fontDoc(id) {
    try {
        return (typeof window !== 'undefined' && window.MappAIFont)
            ? window.MappAIFont.styleDocumento(id) : '';
    } catch (e) { return ''; }
}


function escHtmlQP(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── CSS comuni quiz e flashcard ──────────────────────────
//
// Il blocco è SPEZZATO IN DUE (11/8/26) perché i tre fogli che escono da questo
// file non appartengono più allo stesso mondo:
//  · QP_PAGE_STYLES — la pagina (corpo, colori di stampa, no-print). Serve a
//    tutti e tre.
//  · QP_HEAD_STYLES — la TESTATA a card (.qp-*). Serve solo a quiz e domande
//    aperte, che stanno nel riordino delle testate; il foglio FLASHCARD, che è
//    materiale da ritagliare e resta com'è, ha la sua copia congelata
//    (`.fc-screen-*`) dentro il proprio builder.
// Finché era un blocco solo, ritoccare la testata del quiz cambiava anche il
// foglio da ritagliare: è il motivo per cui le domande aperte hanno dovuto
// sovrascrivere il colore invece di correggerlo alla fonte.
// ⚠️ QP_HEAD_STYLES è destinato a MORIRE quando quiz e domande aperte passano
// alla testata condivisa: da quel momento nessuno lo includerà più.

const QP_PAGE_STYLES = `
* { -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important; }
body {
    font-family: var(--doc-font, 'Space Mono', monospace);
    font-size: 11px;
    color: #1e293b;
    margin: 0 auto;
    padding: 24px 32px;
    max-width: 800px;
    background: #f8fafc;
}
.no-print { display:block; }
@media print {
    .no-print { display:none !important; }
    body { background:white; padding:10px; }
}
`;

const QP_HEAD_STYLES = `
.qp-header {
    text-align: center;
    padding: 28px 16px 20px;
    background: white;
    border-radius: 16px;
    margin-bottom: 28px;
    border-bottom: 2px solid #4f46e5;
    page-break-after: avoid;
}
.qp-title { font-size:20px; font-weight:900; color:#1e293b; }
.qp-subtitle { font-size:10px; color:#64748b; margin-top:4px; }
.qp-badge {
    display:inline-block; margin-top:8px;
    background:#ede9fe; color:#4f46e5;
    border-radius:999px; padding:2px 12px;
    font-size:10px; font-weight:bold;
}
.qp-footer {
    text-align:center; margin-top:32px;
    font-size:9px; color:#94a3b8;
    border-top:1px solid #f1f5f9; padding-top:12px;
}
@media print {
    .qp-header { box-shadow:none; }
}
`;

// Compatibilità: il blocco intero, come era prima dello scorporo. Resta
// esportato (MappAIQuizPrint.STYLES) ma NON è più incluso in nessun foglio:
// quiz e domande aperte sono passati alla cornice condivisa.
const QP_BASE_STYLES = QP_PAGE_STYLES + QP_HEAD_STYLES;

/* La CORNICE condivisa (testata + piè coi numeri di pagina). Il ripiego serve
   ai consumatori headless che caricano questo file da solo: senza il modulo il
   foglio esce senza testata, ma esce — un quiz senza intestazione si legge,
   un'eccezione no. */
function _DH() {
    return (typeof window !== 'undefined' && window.MappAIDocHead) ||
        (typeof MappAIDocHead !== 'undefined' ? MappAIDocHead : null);
}
/* opts → dati della testata. Classe e materia dichiarate dal chiamante (la
   pipeline le sa: `config.className` / `config.disc`) vincono sul contesto
   attivo; il resto è ciò che i fogli già mostravano. */
function _qpTestata(o) {
    const DH = _DH();
    if (!DH) return '';
    return DH.testata(DH.conContesto(o));
}
/* La data del foglio: GG/MM/AAAA, SENZA ora (decisione di Giacomo, 11/8/26).
   I nove fogli ne usavano tre formati; `toLocaleString('it-IT')` scriveva
   «11/8/2026, 09:04» — giorno e mese senza lo zero, una virgola, e un minuto
   che su un foglio di studio non dice niente a nessuno. Il foglio FLASHCARD
   resta com'era: è fuori ambito. */
function _qpData() {
    const DH = _DH();
    return DH ? DH.data(new Date()) : new Date().toLocaleDateString('it-IT');
}
/* Il piè che si vede a SCHERMO: in stampa il suo mestiere lo fa il margin-box
   di @page (che a schermo non esiste). */
function _qpPie(o) {
    const DH = _DH();
    return DH ? DH.pieSchermo(o || {}) : '';
}
function _qpStileCornice(accento, o) {
    const DH = _DH();
    if (!DH) return '';
    o = o || {};
    return DH.stile({
        accento: accento, mappa: o.mappa || '', logo: o.logo || '',
        pagina: o.pagina
    });
}

/* La barra è UNA SOLA per tutti i documenti stampabili: `mappai-doc-bar.js`
   (token `--mm-doc-*`, icone SVG, niente emoji). Qui resta solo l'accento, che
   cambia col tipo di foglio. Il ripiego serve ai consumatori che caricano questo
   file senza la barra (nessuno oggi in index.html, ma i builder sono usati anche
   dalla pipeline in contesti headless, dove una barra non serve affatto). */
const QP_PRINT_BAR = (accentColor, label) => {
    const DB = (typeof window !== 'undefined' && window.MappAIDocBar) ||
        (typeof MappAIDocBar !== 'undefined' ? MappAIDocBar : null);
    if (!DB) return '';
    return DB.stile().replace('--mm-doc-accento:#4f46e5', '--mm-doc-accento:' + accentColor) +
        DB.html({ titolo: label, azioni: ['stampa', 'chiudi'] });
};

// ── STAMPA QUIZ ──────────────────────────────────────────

// Risoluzione nome mappa (comportamento storico preservato: legge appState.nodes,
// undefined → 'MappAI'; la pipeline passa opts.mapName esplicito).
function _qpMapName() {
    try {
        const rootNode = appState?.nodes?.find(n => n.level === 0);
        return rootNode ? cleanLabel(rootNode.label) : 'MappAI';
    } catch (e) { return 'MappAI'; }
}

// ── TESTATA DELLA CARTA (root + macro-area) ──────────────
// Una carta ritagliata perde il contesto del foglio: la testata porta con sé
// il titolo della mappa e il ramo di appartenenza. Risolutore condiviso fra il
// foglio HTML (qui) e il foglio PDF (mappai-print-dossier.js).

function _qpClean(s) {
    try { return (typeof cleanLabel === 'function') ? cleanLabel(s) : String(s || ''); }
    catch (e) { return String(s || ''); }
}

// Etichetta del nodo ROOT (L0). _qpMapName resta com'è: è storico e legge
// appState.nodes, che di norma è undefined → 'MappAI'.
function _qpRootLabel() {
    try {
        const st = (typeof appState !== 'undefined') ? appState : window.appState;
        const root = (st?.db?.nodes || []).find(n => (n.level || 0) === 0);
        return _qpClean(root?.label || st?.db?.rootNodeLabel || st?.rootNodeLabel || '') || '';
    } catch (e) { return ''; }
}

// «Nodo: X» · «Hub: X» · «Ramo: X» → «X» (i titoli dei set generati dall'app).
function _qpStripSetPrefix(title) {
    return String(title || '')
        .replace(/^\s*(nodo|hub|ramo|node|branch|quiz|flashcard)\s*:\s*/i, '')
        .trim();
}

function _qpFindNodeByLabel(label) {
    try {
        const st = (typeof appState !== 'undefined') ? appState : window.appState;
        const target = String(label || '').trim().toLowerCase();
        if (!target) return null;
        return (st?.db?.nodes || []).find(n => _qpClean(n.label).trim().toLowerCase() === target) || null;
    } catch (e) { return null; }
}

// Risale la gerarchia fino al nodo di livello 1 (macro-area). Null se il nodo
// è la radice o se la catena si interrompe (KG senza padri, link orfani).
function _qpMacroArea(node) {
    try {
        const st = (typeof appState !== 'undefined') ? appState : window.appState;
        const nodes = st?.db?.nodes || [];
        const links = st?.db?.links || [];
        let cur = node, seen = {}, hops = 0;
        while (cur && hops++ < 12) {
            if ((cur.level || 0) === 1) return cur;
            if ((cur.level || 0) === 0 || seen[cur.id]) return null;
            seen[cur.id] = 1;
            const up = links.find(l => ((l.target?.id ?? l.target) === cur.id));
            if (!up) return null;
            const pid = up.source?.id ?? up.source;
            cur = nodes.find(n => n.id === pid) || null;
        }
        return null;
    } catch (e) { return null; }
}

// { root, theme } per la testata della carta.
// opts.rootLabel / opts.theme forzano i due valori (pipeline, editor documenti).
function _qpCardHeader(set, opts) {
    opts = opts || {};
    const root = String(opts.rootLabel || _qpRootLabel() || opts.mapName || '').trim();
    let theme = String(opts.theme || '').trim();
    if (!theme) {
        const rawTitle = (set && set.title) || opts.title || '';
        // I set generati dall'app si chiamano «Nodo: X» · «Hub: X» · «Ramo: X»:
        // solo quelli nominano un pezzo di mappa. Un titolo libero («Domande
        // della scheda») non è un tema e non deve finire sulla carta.
        const tagged = /^\s*(nodo|hub|ramo|node|branch)\s*:/i.test(rawTitle);
        const cand = _qpStripSetPrefix(rawTitle);
        const l1 = cand ? _qpMacroArea(_qpFindNodeByLabel(cand)) : null;
        // Senza corrispondenza nella mappa (set d'archivio, mappa cambiata) resta
        // il titolo del set: è quasi sempre il ramo. Mai la radice ripetuta.
        theme = l1 ? _qpClean(l1.label)
            : (tagged && cand && cand.toLowerCase() !== root.toLowerCase() ? cand : '');
    }
    return { root: root, theme: theme.trim() };
}

// Normalizza gli item nella forma che il foglio si aspetta ({question, options,
// correctIndex}). In archivio convivono la forma di generateDynamicQuiz
// ({q, correct}) e quella delle flashcard ({front, back}): senza questo passaggio
// la stampa usciva con le domande vuote e la soluzione «—».
function _qpPrintItems(set) {
    const D = window.MappAIDocEdit;
    const items = (set && set.items) || [];
    if (!D) return items;                       // core assente → comportamento storico
    return D.normItems(items);
}

// Builder PURO: ritorna la stringa HTML del quiz (domande + foglio soluzioni).
// opts: { mapName?, now?, includeBar? (default true), includeAnswers? (default true) }.
// includeAnswers:false = copia per gli allievi, senza il foglio soluzioni in coda.
// Non tocca il DOM principale.
window.buildQuizSetHtml = function (set, opts) {
    opts = opts || {};
    const mapName = opts.mapName || _qpMapName();
    const now = opts.now || _qpData();
    const accentColor = '#4f46e5';
    const includeBar = opts.includeBar !== false;
    const includeAnswers = opts.includeAnswers !== false;
    set = Object.assign({}, set, { items: _qpPrintItems(set) });

    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

    // FOGLIO DOMANDE — versione distribuita agli allievi: NESSUNA risposta evidenziata.
    // Font ingranditi per accessibilità DSA. La spiegazione NON compare qui (svelerebbe
    // la soluzione): vive solo nel foglio soluzioni.
    let questionsHtml = '';
    set.items.forEach((item, idx) => {
        questionsHtml += `
        <div class="quiz-item" style="
            background:white; border-radius:12px;
            padding:18px 22px; margin-bottom:16px;
            border-left:4px solid ${accentColor};
            page-break-inside:avoid;">
            <div style="
                font-size:11px; font-weight:700;
                text-transform:uppercase; letter-spacing:0.06em;
                color:${accentColor}; margin-bottom:8px;">
                Domanda ${idx + 1}
            </div>
            <div style="
                font-size:15px; font-weight:bold;
                color:#1e293b; margin-bottom:14px;
                line-height:1.55;">
                ${escHtmlQP(item.question)}
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${(item.options || []).map((opt, oi) => `
                <div style="
                    display:flex; align-items:flex-start;
                    gap:10px; padding:9px 12px;
                    border-radius:8px;
                    background:#f8fafc; border:1px solid #e2e8f0;">
                    <span style="
                        flex-shrink:0; width:24px; height:24px;
                        border-radius:50%; background:#e2e8f0;
                        color:#475569; font-size:12px; font-weight:bold;
                        display:flex; align-items:center; justify-content:center;">
                        ${letters[oi] || (oi + 1)}
                    </span>
                    <span style="font-size:13px; color:#1e293b; line-height:1.5; padding-top:2px;">
                        ${escHtmlQP(opt)}
                    </span>
                </div>`).join('')}
            </div>
        </div>`;
    });

    // FOGLIO SOLUZIONI — in coda, su pagina NUOVA (page-break-before) e compatto in 2
    // colonne così sta su un solo A4: non finisce fotocopiato sulle schede degli allievi.
    let answerKeyHtml = '';
    set.items.forEach((item, idx) => {
        const ci = item.correctIndex;
        const opts = item.options || [];
        const corrText = (ci >= 0 && opts[ci] != null) ? opts[ci] : (item.answer != null ? item.answer : '—');
        const corrLetter = (ci >= 0 && ci < letters.length) ? letters[ci] + ') ' : '';
        answerKeyHtml += `
        <div style="break-inside:avoid; page-break-inside:avoid; margin-bottom:8px; line-height:1.4;">
            <span style="font-weight:900; color:${accentColor};">${idx + 1}.</span>
            <span style="font-weight:800; color:#0f172a;">${corrLetter}</span><span style="color:#1e293b;">${escHtmlQP(corrText)}</span>
        </div>`;
    });

    const fullHtml = `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>Quiz — ${escHtmlQP(set.title)}</title>
    <style>
        ${_fontDoc(opts.font)}
        ${QP_PAGE_STYLES}
        ${_qpStileCornice(accentColor, { mappa: mapName, logo: opts.logo })}
        body { font-size: 13px; }
        .quiz-section-title {
            font-size:15px; font-weight:900;
            color:#4f46e5; margin:20px 0 14px;
            padding-bottom:5px;
            border-bottom:2px solid #e2e8f0;
            page-break-after:avoid;
        }
        .answer-key-grid { column-count:2; column-gap:30px; font-size:13px; }
    </style>
</head>
<body>
    ${includeBar ? QP_PRINT_BAR(accentColor, 'Quiz') : ''}

    ${_qpTestata({
        titolo: set.title, tipo: 'Quiz', mappa: mapName,
        classe: opts.classe, materia: opts.materia, data: now,
        badge: set.items.length + ' domande'
    })}

    <div class="quiz-section-title">Domande</div>
    ${questionsHtml}

    ${includeAnswers ? `<div class="answer-key" style="page-break-before:always; page-break-inside:avoid;">
        <div class="quiz-section-title">Soluzioni</div>
        <div class="answer-key-grid">${answerKeyHtml}</div>
    </div>` : ''}

    <!-- Sorgente del quiz, incorporata nel foglio: permette di ristampare lo
         stesso documento con o senza soluzioni (INSEGNA → Quiz cartacei) senza
         ricorrere alla mappa che l'ha generato. Non viene mai renderizzata.
         SOLO nella copia del docente: nella copia per gli allievi — che viaggia
         via QR — le risposte non devono esistere nemmeno nel sorgente HTML. -->
    ${includeAnswers ? `<script type="application/json" id="qp-set">${JSON.stringify({
        id: set.id || '', title: set.title || '', type: set.type || '', mode: set.mode || 'quiz',
        items: set.items
    }).replace(/<\//g, '<\\/')}<\/script>` : ''}

    ${_qpPie({ mappa: mapName, data: now })}
</body>
</html>`;

    return fullHtml;
};

// ── DOMANDE APERTE (11/8/26) ─────────────────────────────
// Il genere che gli altri due non coprono: nessuna opzione da scegliere, lo
// studente SCRIVE — quindi la carta gli deve lasciare le righe per farlo, ed è
// il pezzo che questo foglio ha in più rispetto al quiz.
//
// Tre scelte, e i loro perché:
//  · le RIGHE sono vere righe (un bordo inferiore per riga), tante quante ne
//    dichiara la domanda: uno spazio bianco senza righe fa scrivere storto e
//    non dice quanto ci si aspetta;
//  · il KICKER dice la MACRO-AREA della domanda (il ramo da cui è stata
//    generata): su un foglio di 12 domande è ciò che permette allo studente di
//    ritrovare dove ripassare, ed è l'informazione che il quiz a scelta
//    multipla si può permettere di non dare perché lì le opzioni orientano;
//  · la TRACCIA di correzione vive SOLO nel foglio soluzioni, in coda e su
//    pagina nuova — stessa regola del quiz: la copia degli allievi non deve
//    portarsela dietro nemmeno nel sorgente HTML.
//
// Forma degli item: { question, guide?, lines?, l1? }.
// opts: { mapName?, now?, includeBar? (default true), includeAnswers? (default true) }.
//
// ── LA FONTE ICONOGRAFICA IN TESTA AL FOGLIO (20/8) ─────────────────────────
// `set.intro = { fotoB64, mime, titolo, contesto, descrizione }` — quando il
// foglio nasce da un'IMMAGINE, l'immagine sta sul foglio. Un foglio di domande
// su una fonte che l'allievo non vede non serve a niente.
// ⚠️ L'immagine è INCORPORATA, non referenziata: la finestra che stampa carica
//    l'HTML come `data:` (origine opaca) e da lì un `file://` è bloccato — è la
//    lezione dei caratteri del 19/8, «l'editor sì, il PDF no».
// ⚠️ Sul foglio degli allievi vanno TITOLO e CONTESTO, mai la DESCRIZIONE: la
//    descrizione dice che cosa si vede, cioè la risposta a metà delle domande.
//    Va in coda, sul foglio delle tracce, dove serve a chi corregge.
window.buildOpenQuestionsHtml = function (set, opts) {
    opts = opts || {};
    const mapName = opts.mapName || _qpMapName();
    const now = opts.now || _qpData();
    const accentColor = '#0f766e';   // teal: si distingue a colpo d'occhio dal quiz (indigo)
    const includeBar = opts.includeBar !== false;
    const includeAnswers = opts.includeAnswers !== false;
    const items = (set && set.items) || [];

    // Le righe su cui scrivere: 3 minimo (una risposta di una frase), 12 massimo
    // (oltre, la domanda non sta più in una pagina insieme alle altre).
    const _righe = (n) => {
        const v = parseInt(n, 10);
        return Math.max(3, Math.min(12, isNaN(v) ? 4 : v));
    };
    const rigaVuota = '<div style="border-bottom:1px solid #cbd5e1; height:26px;"></div>';

    /* Le AREE della domanda: una, o due quando la domanda le collega (11/8).
       `areas` è la forma nuova; `l1` resta letta per i fogli scritti prima —
       un documento già sul disco non si riscrive. */
    const areeDi = (item) => {
        const a = Array.isArray(item.areas) ? item.areas.filter(Boolean) : [];
        if (a.length) return a.slice(0, 2);
        return item.l1 ? [item.l1] : [];
    };

    /* Il blocco della fonte: si emette solo se c'è. `intro` senza foto resta
       valido (un contesto scritto a mano vale un foglio), ma senza NIENTE non
       si stampa una cornice vuota. */
    const intro = (set && set.intro) || null;
    const introTit = intro ? escHtmlQP(intro.titolo || '') : '';
    const introCtx = intro ? escHtmlQP(intro.contesto || '') : '';
    const introFoto = (intro && intro.fotoB64)
        ? `<img src="data:${intro.mime || 'image/jpeg'};base64,${intro.fotoB64}" alt="${introTit}" style="
              display:block; max-width:100%; max-height:340px;
              margin:0 auto 10px; border-radius:8px;">`
        : '';
    const introHtml = (intro && (introFoto || introCtx || introTit)) ? `
        <div style="
            background:white; border-radius:12px;
            padding:18px 22px; margin-bottom:18px;
            border-left:4px solid ${accentColor};
            page-break-inside:avoid;">
            ${introFoto}
            ${introTit ? `<div style="
                font-size:11px; font-weight:700; text-transform:uppercase;
                letter-spacing:0.06em; color:${accentColor}; margin-bottom:6px;
                text-align:center;">${introTit}</div>` : ''}
            ${introCtx ? `<div style="
                font-size:13px; color:#334155; line-height:1.6;">${introCtx}</div>` : ''}
        </div>` : '';

    let questionsHtml = '';
    items.forEach((item, idx) => {
        const aree = areeDi(item);
        questionsHtml += `
        <div class="oq-item" style="
            background:white; border-radius:12px;
            padding:18px 22px; margin-bottom:16px;
            border-left:4px solid ${accentColor};
            page-break-inside:avoid;">
            <div style="
                display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;
                font-size:11px; font-weight:700;
                text-transform:uppercase; letter-spacing:0.06em;
                color:${accentColor}; margin-bottom:8px;">
                <span style="margin-right:2px">Domanda ${idx + 1}</span>
                ${aree.map((a, ai) => `${ai ? '<span style="color:#94a3b8">+</span>' : ''}<span style="
                    font-weight:700; letter-spacing:0.04em;
                    color:#475569; background:#f1f5f9;
                    border-radius:999px; padding:2px 9px;
                    text-transform:none;">${escHtmlQP(a)}</span>`).join('')}
            </div>
            <div style="
                font-size:15px; font-weight:bold;
                color:#1e293b; margin-bottom:14px;
                line-height:1.55;">
                ${escHtmlQP(item.question)}
            </div>
            <div style="display:flex; flex-direction:column; gap:0;">
                ${new Array(_righe(item.lines)).fill(rigaVuota).join('')}
            </div>
        </div>`;
    });

    // FOGLIO SOLUZIONI: qui la «traccia» non è la risposta da copiare, è che
    // cosa deve contenere — quindi va per esteso, in UNA colonna (le due
    // colonne del quiz reggono una riga di risposta, non un paragrafo).
    /* ⚠️ IL LIVELLO SI VEDE SOLO QUI, sul foglio del docente (13/8).
       Sulla copia degli allievi NON compare, ed è una decisione: scrivere
       «facile» accanto a una domanda a cui uno studente non sa rispondere è
       un giudizio, non un aiuto — e in una classe di recupero è il modo più
       rapido per far smettere di provare. Al docente serve invece sapere da
       dove si comincia, per capire chi si è fermato al primo scalino. */
    let answerKeyHtml = '';
    items.forEach((item, idx) => {
        const g = item.guide || item.answer || '—';
        const avvio = String(item.livello || '').toLowerCase() === 'base';
        answerKeyHtml += `
        <div style="break-inside:avoid; page-break-inside:avoid; margin-bottom:12px; line-height:1.5;">
            <div style="font-weight:900; color:${accentColor}; font-size:12px;">${idx + 1}. ${escHtmlQP(item.question)}${avvio ? `<span style="
                margin-left:7px; font-size:9px; font-weight:700; letter-spacing:0.06em;
                color:#475569; background:#f1f5f9; border-radius:999px; padding:2px 7px;
                text-transform:uppercase;">avvio</span>` : ''}</div>
            <div style="color:#1e293b; font-size:13px; margin-top:3px;">${escHtmlQP(g)}</div>
        </div>`;
    });
    /* Il conto in testa al foglio soluzioni: dice com'è fatta la verifica —
       quante domande si possono affrontare sapendo una parte della scheda. */
    const _grad = items.reduce((a, it) => {
        if (String(it.livello || '').toLowerCase() === 'base') a.base++; else a.ponte++;
        return a;
    }, { base: 0, ponte: 0 });

    return `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>Domande aperte — ${escHtmlQP(set.title)}</title>
    <style>
        ${_fontDoc(opts.font)}
        ${QP_PAGE_STYLES}
        ${_qpStileCornice(accentColor, { mappa: mapName, logo: opts.logo })}
        body { font-size: 13px; }
        /* Il badge di QUESTO foglio è teal come il resto. La testata prende
           l'accento da sola (è un parametro della cornice): la deroga che c'era
           qui — «gli stili condivisi fissano la testata in indigo, si allinea
           SOLO questo foglio perché toccare il blocco comune cambierebbe due
           documenti in produzione» — non serve più, ed era il sintomo del
           problema che la cornice condivisa risolve. */
        .mm-dh__b { background:#ccfbf1; color:${accentColor}; }
        .oq-section-title {
            font-size:15px; font-weight:900;
            color:${accentColor}; margin:20px 0 14px;
            padding-bottom:5px;
            border-bottom:2px solid #e2e8f0;
            page-break-after:avoid;
        }
    </style>
</head>
<body>
    ${includeBar ? QP_PRINT_BAR(accentColor, 'Domande aperte') : ''}

    ${_qpTestata({
        titolo: set.title, tipo: 'Domande aperte', mappa: mapName,
        classe: opts.classe, materia: opts.materia, data: now,
        badge: items.length + ' domande'
    })}

    ${introHtml}

    <div class="oq-section-title">Domande</div>
    ${questionsHtml}

    ${includeAnswers ? `<div class="answer-key" style="page-break-before:always;">
        ${(intro && intro.descrizione) ? `<div style="
            background:#f8fafc; border-radius:10px; padding:14px 18px; margin-bottom:16px;
            font-size:12px; color:#334155; line-height:1.6;">
            <div style="font-weight:900; color:${accentColor}; font-size:11px;
                text-transform:uppercase; letter-spacing:0.06em; margin-bottom:5px;">Che cosa mostra la fonte</div>
            ${escHtmlQP(intro.descrizione)}
        </div>` : ''}
        <div class="oq-section-title">Tracce di correzione</div>
        ${_grad.base ? `<div style="font-size:11px; color:#475569; margin:-6px 0 14px;">
            ${_grad.base} domande di avvio (si rispondono con un concetto solo) · ${_grad.ponte} di ponte (ne collegano due o più).
        </div>` : ''}
        ${answerKeyHtml}
    </div>` : ''}

    ${includeAnswers ? `<script type="application/json" id="qp-set">${JSON.stringify({
        id: set.id || '', title: set.title || '', type: set.type || 'Domande aperte', mode: 'open',
        /* L'ANGOLO viaggia con la sorgente, non solo nel nome del file: chi
           riapre il foglio (l'editor, le attività di studio) deve sapere con
           che taglio è stato generato, e un nome di file si può rinominare. */
        angle: set.angle || '',
        /* ⚠️ L'INTRO STA NELLA SORGENTE, non solo nella resa (invariante 18).
           L'editor ricostruisce il foglio da questo JSON (`setFromHtml`): se la
           fonte iconografica vivesse solo negli `opts` di chi genera, al primo
           salvataggio dall'editor l'immagine sparirebbe dal foglio — e nessuno
           saprebbe perché. */
        intro: set.intro || null,
        items: items
    }).replace(/<\//g, '<\\/')}<\/script>` : ''}

    ${_qpPie({ mappa: mapName, data: now })}
</body>
</html>`;
};

// ══ ANALISI DELLA FONTE (20/8) ══════════════════════════════════════════════
// Il documento del DOSSIER: l'immagine in testa, poi i quattro blocchi della
// griglia (`MappAIVisioneCore.BLOCCHI` — fonte unica: il documento non elenca
// i campi per conto suo). I campi vuoti NON si stampano.
// La SORGENTE — la scheda intera — viaggia incorporata in `qp-scheda`
// (invariante 18): il documento si riapre e si ricorregge; da un PDF non si
// ricava più niente.
window.buildAnalisiFonteHtml = function (scheda, opts) {
    opts = opts || {};
    scheda = scheda || {};
    const VC = window.MappAIVisioneCore;
    const mapName = opts.mapName || scheda.titolo || _qpMapName();
    const now = opts.now || _qpData();
    const accentColor = '#7c3aed';   // violet: non è un quiz (indigo) né un foglio aperto (teal)
    const includeBar = opts.includeBar !== false;

    const foto = scheda.fotoB64
        ? `<img src="data:${scheda.mime || 'image/jpeg'};base64,${scheda.fotoB64}" alt="${escHtmlQP(scheda.titolo || '')}" style="
              display:block; max-width:100%; max-height:420px;
              margin:0 auto 16px; border-radius:8px;">`
        : '';

    let blocchiHtml = '';
    ((VC && VC.BLOCCHI) || []).forEach(bl => {
        const campi = bl.campi.filter(c => String(((scheda[bl.id] || {})[c.id]) || '').trim());
        if (!campi.length) return;
        blocchiHtml += `
        <div style="
            background:white; border-radius:12px;
            padding:18px 22px; margin-bottom:16px;
            border-left:4px solid ${accentColor};
            page-break-inside:avoid;">
            <div style="
                font-size:12px; font-weight:900; text-transform:uppercase;
                letter-spacing:0.06em; color:${accentColor}; margin-bottom:10px;">
                ${escHtmlQP(bl.titolo)}${bl.interpretativo ? `<span style="
                    margin-left:8px; font-size:9px; font-weight:700; letter-spacing:0.06em;
                    color:#475569; background:#f1f5f9; border-radius:999px; padding:2px 8px;
                    text-transform:uppercase;">interpretazione</span>` : ''}
            </div>
            ${campi.map(c => `
            <div style="margin-bottom:9px; line-height:1.55; page-break-inside:avoid;">
                <span style="font-size:11px; font-weight:700; color:#64748b;
                    text-transform:uppercase; letter-spacing:0.04em;">${escHtmlQP(c.et)}</span>
                <div style="font-size:13px; color:#1e293b;">${escHtmlQP((scheda[bl.id] || {})[c.id])}</div>
            </div>`).join('')}
        </div>`;
    });

    return `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>Analisi della fonte — ${escHtmlQP(scheda.titolo || mapName)}</title>
    <style>
        ${_fontDoc(opts.font)}
        ${QP_PAGE_STYLES}
        ${_qpStileCornice(accentColor, { mappa: mapName, logo: opts.logo })}
        body { font-size: 13px; }
        .mm-dh__b { background:#ede9fe; color:${accentColor}; }
    </style>
</head>
<body>
    ${includeBar ? QP_PRINT_BAR(accentColor, 'Analisi della fonte') : ''}

    ${_qpTestata({
        titolo: scheda.titolo || mapName, tipo: 'Analisi della fonte', mappa: mapName,
        classe: opts.classe, materia: opts.materia, data: now,
        badge: 'Fonte iconografica'
    })}

    ${foto}
    ${blocchiHtml}

    <script type="application/json" id="qp-scheda">${JSON.stringify({
        titolo: scheda.titolo || '', mime: scheda.mime || '', fotoB64: scheda.fotoB64 || '',
        identita: scheda.identita || {}, osservazione: scheda.osservazione || {},
        interpretazione: scheda.interpretazione || {}, critica: scheda.critica || {}
    }).replace(/<\//g, '<\\/')}<\/script>

    ${_qpPie({ mappa: mapName, data: now })}
</body>
</html>`;
};
// La scheda incorporata, riletta: è ciò che permette di riaprire il documento
// e ricorreggerlo (la strada di ELABORA › Modifica).
window.schedaFromAnalisiHtml = function (html) {
    try {
        const m = /<script type="application\/json" id="qp-scheda">([\s\S]*?)<\/script>/i.exec(String(html || ''));
        if (!m) return null;
        const o = JSON.parse(m[1].replace(/<\\\//g, '</'));
        return (o && typeof o === 'object') ? o : null;
    } catch (e) { return null; }
};

// Consumer: risolve il set e apre la finestra di stampa.
// opts: { includeAnswers? } — la scelta «con/senza soluzioni» arriva da INSEGNA.
window.printQuizSet = function (setId, opts) {
    const sets = appState?.db?.studySets || [];
    const set = setId ? sets.find(s => s.id === setId) : sets[sets.length - 1];
    if (!set || !set.items?.length) { showToast('Nessun quiz trovato', 'warning'); return; }
    const win = window.open('', '_blank');
    if (!win) { showToast('Popup bloccato — abilita i popup', 'warning'); return; }
    win.document.write(window.buildQuizSetHtml(set, opts || {}));
    win.document.close();
    showToast(`✓ Quiz stampabile aperto — ${set.items.length} domande`, 'success');
};

// ── STAMPA FLASHCARD ─────────────────────────────────────

// GEOMETRIA DEL FOGLIO — gemello del foglio dei nodi: A4 con margini 15/10 mm,
// carte affiancate SENZA spazi vuoti, tratteggio arancione = linea di taglio.
// I NUMERI non stanno qui: vivono in mappai-print-layout.js, che li condivide
// con il foglio PDF (mappai-print-dossier.js) — un solo posto da ritoccare, e
// i due motori non possono divergere.
function _PL() {
    const PL = (typeof window !== 'undefined' && window.MappAIPrintLayout)
        || (typeof MappAIPrintLayout !== 'undefined' ? MappAIPrintLayout : null);
    if (!PL) throw new Error('mappai-print-layout.js non caricato: il foglio non ha misure');
    return PL;
}
// Misure derivate di un foglio. Esposta come MappAIQuizPrint.flashSheet: chi
// converte l'HTML in PDF (editor documenti, pipeline) deve sapere l'orientamento.
function _fcGeom(key) { return _PL().flashGeom(key); }

// Builder PURO: ritorna la stringa HTML del foglio flashcard.
// opts: { mapName?, now?, includeBar? (default true), sheet? ('2x2' default,
//         '3x2' | '4x3' | '2x3' | '2x4'), rootLabel?, theme? }.
window.buildFlashcardSetHtml = function (set, opts) {
    opts = opts || {};
    const mapName = opts.mapName || _qpMapName();
    const now = opts.now || new Date().toLocaleString('it-IT');
    const accentColor = '#059669';
    const includeBar = opts.includeBar !== false;
    const G = _fcGeom(opts.sheet);
    set = Object.assign({}, set, { items: _qpPrintItems(set) });

    // Testata di ogni carta: mappa + macro-area, come sul foglio dei nodi.
    // Sostituisce il progressivo «01 · Domanda»: una carta ritagliata deve dire
    // da sola a quale mappa e a quale ramo appartiene.
    const head = _qpCardHeader(set, opts);
    // Etichette vuote per default: la seconda riga è la sola area tematica e la
    // risposta parte subito. Chi vuole «TEMA:»/«RISPOSTA» li rimette dai token.
    const themePrefix = String(G.labels.themePrefix || '');
    const answerLabel = String(G.labels.answer || '');
    // Le due righe della testata si risolvono UNA volta: le stesse stringhe
    // vanno nell'HTML e nel calcolo dello spazio. (Con il ripiego su mapName
    // dentro il template, il calcolo contava una riga in meno di quelle
    // stampate e l'ultima riga della domanda finiva tagliata.)
    const rootLine = String(head.root || mapName || '');
    const themeLine = head.theme ? (themePrefix ? themePrefix + ' ' + head.theme : head.theme) : '';
    const headHtml =
        `<div class="fc-head">
                    <div class="fc-root">${escHtmlQP(rootLine)}</div>` +
        (themeLine ? `
                    <div class="fc-theme">${escHtmlQP(themeLine)}</div>` : '') +
        `
                </div>`;

    // IMPAGINAZIONE DECISA QUI, non nel browser. Space Mono è monospazio: il
    // punto di a-capo si conta in caratteri, quindi il corpo del testo che fa
    // stare ogni carta nel suo spazio si calcola mentre si costruisce il foglio.
    // Conseguenza importante: la carta esce giusta anche dove JavaScript non
    // gira (anteprime, printToPDF che stampa subito, pagine servite via QR).
    const PL = _PL();
    const explCap = s => {
        const t = String(s || '');
        return t.length > G.explMax ? t.slice(0, G.explMax).replace(/[\s.,;:]+$/, '') + '…' : t;
    };
    const printItems = set.items.map(item => ({
        question: String(item.question || ''),
        answer: String(item.options?.[item.correctIndex] || item.answer || '—'),
        explanation: explCap(item.explanation)
    }));
    const fontMode = (opts.fontMode === 'card') ? 'card' : 'uniform';
    const fit = PL.fitFlash(printItems, G, { lines: [rootLine, themeLine] }, { policy: fontMode });
    // fit.items = i testi definitivi: senza le spiegazioni tolte alle carte che
    // non le reggevano, e già accorciati con «…» dove nemmeno il corpo minimo
    // bastava. Stessa cosa disegna il foglio PDF.
    const finali = fit.items;

    let cardsHtml = '';
    finali.forEach((item, i) => {
        // Carta fisica: metà superiore = domanda, metà inferiore = risposta,
        // piega tratteggiata sulla linea di divisione. Bordo arancione
        // tratteggiato = linea di taglio; le carte si toccano, senza spazi.
        const pc = (fontMode === 'card' && fit.perCard[i]) ? fit.perCard[i] : null;
        const fStyle = pc ? ` style="--fs:${pc.q}pt"` : '';
        const bStyle = pc ? ` style="--fs:${pc.a}pt"` : '';
        const eStyle = pc ? ` style="font-size:${pc.e}pt"` : '';
        cardsHtml += `
        <div class="fc-card">
            <div class="fc-front"${fStyle}>
                ${headHtml}
                <div class="fc-qbox"><div class="fc-q">${escHtmlQP(item.question)}</div></div>
            </div>
            <div class="fc-back"${bStyle}>
                ${answerLabel ? `<div class="fc-lbl">${escHtmlQP(answerLabel)}</div>` : ''}
                <div class="fc-a">${escHtmlQP(item.answer)}</div>
                ${item.explanation ? `<div class="fc-e"${eStyle}>${escHtmlQP(item.explanation)}</div>` : ''}
            </div>
        </div>`;
    });

    const fullHtml = `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>Flashcard — ${escHtmlQP(set.title)}</title>
    <style>
        ${_fontDoc(opts.font)}
        ${QP_PAGE_STYLES}
        /* ── CHROME DI SCHERMO DEL FOGLIO FLASHCARD (scorporato l'11/8/26) ──
           Testata, badge e piè di questo foglio vivono SOLO a schermo (stanno
           dentro no-print): il foglio che esce in stampa è la sola griglia di
           carte, come il foglio dei nodi. Le regole qui sotto sono una copia
           CONGELATA di quelle .qp-* che erano in QP_BASE_STYLES.

           ⚠️ Perché scorporate: il materiale da RITAGLIARE (flashcard, foglio
           dei nodi) resta com'è per decisione di Giacomo, fuori dal riordino
           delle testate. Finché condivideva .qp-header con quiz e domande
           aperte, ogni ritocco alla testata di quei due cambiava anche questo
           foglio — è già successo alle domande aperte, che hanno dovuto
           sovrascrivere il colore invece di correggere il blocco comune (vedi
           il commento in buildOpenQuestionsHtml). Ora i due mondi non si
           toccano più.
           (Niente apici inversi in questo commento: sta dentro un template
           literal e uno solo chiuderebbe la stringa. Sesta volta.) */
        .fc-screen-head { text-align:center; padding:28px 16px 20px; background:white;
                    border-radius:16px; margin-bottom:28px; border-bottom:2px solid ${accentColor}; }
        .fc-screen-title { font-size:20px; font-weight:900; color:#1e293b; }
        .fc-screen-sub { font-size:10px; color:#64748b; margin-top:4px; }
        .fc-screen-badge { display:inline-block; margin-top:8px; background:#dcfce7; color:${accentColor};
                    border-radius:999px; padding:2px 12px; font-size:10px; font-weight:bold; }
        .fc-screen-foot { text-align:center; margin-top:32px; font-size:9px; color:#94a3b8;
                    border-top:1px solid #f1f5f9; padding-top:12px; }
        /* Pagina: stesse misure del foglio dei nodi (A4, margini 15/10 mm). */
        @page { size: A4 ${G.landscape ? 'landscape' : 'portrait'}; margin: ${G.marginY}mm ${G.marginX}mm; }
        body { max-width:none; margin:0; padding:0; background:#eef2f7; }
        .fc-sheet { width:${G.gridW}mm; margin:0 auto; }
        /* Carte affiancate: nessun gutter. Ogni carta porta il proprio bordo
           tratteggiato, quindi la linea di taglio resta visibile fra due carte. */
        .fc-grid { display:grid; grid-template-columns:repeat(${G.cols}, ${G.cardW}mm); grid-auto-rows:${G.cardH}mm; gap:0; justify-content:center; }
        .fc-card { box-sizing:border-box; background:#fff;
                   border:${G.cut.width}mm dashed ${G.cut.color};
                   border-radius:${G.card.radius}mm; overflow:hidden; display:flex; flex-direction:column;
                   break-inside:avoid; page-break-inside:avoid; }
        /* Metà domanda e metà risposta. La piega non è per forza a metà: la
           quota la decide il testo (una domanda lunga si prende più spazio),
           uguale per tutte le carte del foglio → il foglio si piega dritto. */
        /* Il testo è centrato verticalmente nella sua metà: cresce verso l'alto e
           verso il basso secondo la lunghezza, invece di appoggiarsi al bordo.
           La testata resta ancorata in cima (è l'identità della carta). */
        .fc-front { box-sizing:border-box; flex:0 0 ${fit.split}%;
                    padding:${G.card.padTop}mm ${G.card.padX}mm ${G.card.padBottom}mm;
                    border-bottom:${G.fold.width}mm dashed ${G.fold.color};
                    overflow:hidden; display:flex; flex-direction:column; --fs:${fit.q}pt; }
        .fc-head { flex:0 0 auto; }
        .fc-qbox { flex:1 1 auto; display:flex; align-items:center; overflow:hidden; }
        .fc-back  { box-sizing:border-box; flex:1 1 ${100 - fit.split}%;
                    padding:${G.card.backPadTop}mm ${G.card.padX}mm ${G.card.padBottom}mm;
                    background:${G.colors.back}; overflow:hidden;
                    display:flex; flex-direction:column; justify-content:center; --fs:${fit.a}pt; }
        .fc-head { margin-bottom:${G.card.headGap}mm; flex:0 0 auto; }
        /* Termini lunghissimi (senza spazi dove andare a capo) vanno spezzati,
           altrimenti escono dalla carta e finiscono sopra quella accanto. */
        .fc-q, .fc-a, .fc-e, .fc-root, .fc-theme, .fc-lbl { overflow-wrap:anywhere; }
        .fc-root, .fc-theme, .fc-lbl { font-size:${G.head}pt; font-weight:700;
                    text-transform:uppercase; letter-spacing:0.06em; line-height:${G.headLineH}; }
        .fc-root { color:${G.colors.accent}; }
        .fc-theme, .fc-lbl { color:${G.colors.muted}; }
        .fc-lbl { margin-bottom:${G.card.lblGap}mm; }
        /* Testo a bandiera: spaziature regolari (leggibilità DSA) e resa
           identica nel PDF jsPDF, che non sa giustificare. */
        .fc-q { font-size:var(--fs); font-weight:bold; color:${G.colors.ink}; line-height:${G.lineH}; }
        .fc-a { font-size:var(--fs); color:${G.colors.ink}; line-height:${G.lineH};${G.justify ? ' text-align:justify; hyphens:auto;' : ''} }
        .fc-e { margin-top:${G.card.explGap}mm; font-size:${fit.e}pt; font-style:italic; color:${G.colors.expl}; line-height:${G.lineH};${G.justify ? ' text-align:justify; hyphens:auto;' : ''} }
        .fc-instructions { background:${G.colors.back}; border-radius:10px; padding:12px 16px;
                margin:0 auto 16px; max-width:${G.gridW}mm; font-size:10px; color:#374151;
                border-left:3px solid ${accentColor}; }
        /* A schermo il foglio si vede come una pagina; in stampa i margini li
           mette @page, quindi il contenitore non ne aggiunge altri. */
        @media screen {
            .fc-sheet { box-sizing:border-box; width:${G.pageW}mm;
                        padding:${G.marginY}mm ${G.marginX}mm;
                        background:#fff; box-shadow:0 2px 18px rgba(15,23,42,.14); margin:16px auto 32px; }
            .fc-sheet .fc-grid { margin:0 auto; }
            .fc-screen-head, .fc-instructions { margin-left:auto; margin-right:auto; max-width:${G.pageW}mm; }
        }
        @media print {
            body { background:#fff; padding:0; }
            .fc-sheet { width:auto; padding:0; margin:0; box-shadow:none; }
        }
    </style>
</head>
<body>
    ${includeBar ? QP_PRINT_BAR(accentColor, 'Flashcard') : ''}

    <!-- Intestazione e istruzioni: SOLO a schermo. Il foglio che esce in stampa
         è la sola griglia di carte, come il foglio dei nodi. -->
    <div class="no-print">
        <div class="fc-screen-head">
            <div class="fc-screen-title">${escHtmlQP(set.title)}</div>
            <div class="fc-screen-sub">
                ${escHtmlQP(mapName)} · Flashcard · ${now}
            </div>
            <div class="fc-screen-badge">
                ${set.items.length} carte · ${G.cols}×${G.rows} ${G.landscape ? 'orizzontale' : 'verticale'}
            </div>
        </div>

        <div class="fc-instructions">
            ✂️ <strong>Come usare:</strong>
            Ritaglia ogni carta lungo il bordo tratteggiato.
            La metà superiore è la domanda, quella inferiore la risposta.
            Piega lungo la linea a metà carta per nascondere la risposta
            durante il ripasso.
        </div>
    </div>

    <div class="fc-screen-foot no-print">MappAI by insegnai.ch · ${now}</div>

    <div class="fc-sheet">
        <div class="fc-grid">
            ${cardsHtml}
        </div>
    </div>

    <!-- Nessuno script: i corpi del testo sono già decisi (vedi fitFlash).
         Un foglio che dipendesse da JavaScript uscirebbe tagliato ovunque lo
         script non giri: anteprime, printToPDF, pagine aperte offline. -->
</body>
</html>`;

    return fullHtml;
};

// Consumer: risolve il set e apre la finestra di stampa (comportamento invariato).
window.printFlashcardSet = function (setId) {
    const sets = appState?.db?.studySets || [];
    const set = setId
        ? sets.find(s => s.id === setId)
        : sets.find(s => s.mode === 'flashcard') || sets[sets.length - 1];
    if (!set || !set.items?.length) { showToast('Nessuna flashcard trovata', 'warning'); return; }
    const win = window.open('', '_blank');
    if (!win) { showToast('Popup bloccato — abilita i popup', 'warning'); return; }
    win.document.write(window.buildFlashcardSetHtml(set));
    win.document.close();
    showToast(`✓ Flashcard stampabili aperte — ${set.items.length} carte`, 'success');
};

// ── STAMPA TUTTI I SET ───────────────────────────────────

window.printAllStudySets = function () {
    const sets = appState?.db?.studySets || [];
    if (sets.length === 0) {
        showToast('Nessun set di studio trovato', 'warning');
        return;
    }

    // Apri una finestra per ogni set
    sets.forEach((set, idx) => {
        setTimeout(() => {
            if (set.mode === 'flashcard' ||
                set.type === 'Flashcard') {
                window.printFlashcardSet(set.id);
            } else {
                window.printQuizSet(set.id);
            }
        }, idx * 300); // delay per non bloccare i popup
    });
};

// ── API riusabile ────────────────────────────────────────
// Gli stessi stili e builder usati dal foglio stampato servono all'editor di
// ELABORA: l'anteprima editabile deve essere il foglio, non una sua imitazione.
window.MappAIQuizPrint = {
    STYLES: QP_BASE_STYLES,
    printBar: QP_PRINT_BAR,
    accent: { quiz: '#4f46e5', flashcards: '#059669' },
    toPrintItems: _qpPrintItems,
    // Testata delle carte (root + macro-area) — condivisa col foglio PDF.
    cardHeader: _qpCardHeader,
    rootLabel: _qpRootLabel,
    // Geometria del foglio flashcard: chi manda l'HTML a printToPDF deve sapere
    // l'orientamento (landscape) e quante carte stanno in una pagina.
    flashSheet: _fcGeom,
    flashSheets: function () { return _PL().flashFormats(); },
    // Recupera il set incorporato in un foglio già generato (vedi <script id="qp-set">).
    setFromHtml: function (html) {
        try {
            const m = /<script type="application\/json" id="qp-set">([\s\S]*?)<\/script>/i.exec(String(html || ''));
            if (!m) return null;
            const obj = JSON.parse(m[1].replace(/<\\\//g, '</'));
            return (obj && Array.isArray(obj.items) && obj.items.length) ? obj : null;
        } catch (e) { return null; }
    },
    buildQuizSetHtml: function (set, opts) { return window.buildQuizSetHtml(set, opts); },
    buildFlashcardSetHtml: function (set, opts) { return window.buildFlashcardSetHtml(set, opts); },
    buildOpenQuestionsHtml: function (set, opts) { return window.buildOpenQuestionsHtml(set, opts); },
    mapName: _qpMapName
};

console.log('[MappAI] mappai-quiz-print.js caricato ✓');