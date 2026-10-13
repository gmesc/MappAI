/* Prove dello 0079, lotto A — la scheda di un dossier si costruisce come la
   Sintesi. `buildAnalisiFonteHtml` (mappai-quiz-print.js) chiama il costruttore
   della sintesi (mappai-branch-synthesis.js) col testo di
   `MappAIVisioneCore.markdownDaScheda`, e ci cuce la sorgente `qp-scheda`
   (invariante 18): andata e ritorno con `schedaFromAnalisiHtml`, sia del
   documento nuovo sia del foglio di prima, che resta come ripiego.
   I due moduli girano nella STESSA sandbox, come nell'app (stesso `window`). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { load } = require('cheerio');

const VC = require('../public/js/mappai-visione-core.js');
const JS = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');

/* `ls`: il localStorage finto (l'interruttore); `sintesi`: false = il costruttore
   della sintesi non è caricato, una funzione = un costruttore finto al suo posto. */
function sandbox({ ls = {}, sintesi = true } = {}) {
    const win = { MappAIVisioneCore: VC, t: (_, f) => f };
    const box = {
        window: win, console: { log() {}, warn() {}, error() {} },
        appState: { db: { nodes: [], studySets: [] }, rootNodeLabel: 'Mappa di prova' },
        showToast() {}, cleanLabel: s => s,
        localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem() {} }
    };
    vm.createContext(box);
    vm.runInContext(JS('mappai-quiz-print.js'), box);
    if (sintesi === true) vm.runInContext(JS('mappai-branch-synthesis.js'), box);
    else if (typeof sintesi === 'function') win.MappAISynthesis = { buildHtml: sintesi };
    return win;
}

const SCHEDA = {
    titolo: 'Sottoscrivete al prestito', mime: 'image/jpeg', fotoB64: 'QUJDRA==',
    identita: { genere: 'Manifesto', data: '1917' },
    osservazione: { descrizione: 'Un soldato indica chi guarda.' },
    interpretazione: { finalita: 'Raccogliere denaro [1] per la *guerra*.' },
    critica: {}
};
/* La scheda riletta nasce nella sandbox (altri prototipi): si confronta dal JSON. */
const rilegge = (W, html) => JSON.parse(JSON.stringify(W.schedaFromAnalisiHtml(html)));
const OPTS = { mapName: 'Grande guerra', includeBar: false, classe: '3A', materia: 'Storia' };

// ── il documento nuovo ────────────────────────────────────────────────────────
test('acceso: la scheda esce dal costruttore della sintesi, col nome «Analisi della fonte»', () => {
    const W = sandbox();
    const html = W.buildAnalisiFonteHtml(SCHEDA, OPTS);
    const $ = load(html);
    assert.equal($('#ap-topbar').length, 1, 'la barra di lettura della sintesi');
    assert.equal($('.bs-body').length, 1);
    assert.equal($('title').text(), 'Analisi della fonte — Sottoscrivete al prestito');
    assert.equal($('#ap-doc-brand').text().trim(), 'MappAI · Analisi della fonte');
    assert.ok(!html.includes('Sintesi di ramo'), 'nessun «Sintesi di ramo»');
    assert.equal($('.bs-body h3').length, 3, 'tre blocchi pieni, il quarto vuoto non si stampa');
    assert.ok($('.bs-body h3').eq(2).text().includes('(interpretazione)'));
    assert.ok(html.includes('<strong>Finalità:</strong>'), 'un paragrafo «Etichetta: valore» per campo');
    assert.ok(html.includes('(1)') && html.includes('∗guerra∗'), '[n] e * neutralizzati');
    assert.equal($('.bs-fonte img').attr('src'), 'data:image/jpeg;base64,QUJDRA==', 'la foto in testa');
    assert.ok(/@media print\{\.ap-sec\{display:none !important\}\}/.test(html), 'i ▶ non vanno nel PDF');
    assert.ok(!/\.bs-fonte\{display:none\}/.test(html), 'senza fotoAccanto la foto si vede');
});

test('acceso: andata e ritorno della sorgente — la stessa scheda', () => {
    const W = sandbox();
    assert.deepEqual(rilegge(W, W.buildAnalisiFonteHtml(SCHEDA, OPTS)), SCHEDA);
});

test('acceso: valori con $\', $&, $$ e </script> tornano identici, e il documento esce senza KaTeX', () => {
    const W = sandbox();
    const sch = Object.assign({}, SCHEDA, {
        identita: { genere: 'Manifesto', titolo: 'Costa 5$ — prima $\' poi $& e $$ </script><b>' }
    });
    const html = W.buildAnalisiFonteHtml(sch, OPTS);
    assert.ok(html.includes('#ap-topbar') || load(html)('#ap-topbar').length === 1, 'strada nuova, non il ripiego');
    assert.deepEqual(rilegge(W, html), sch);
    assert.equal((html.match(/<\/body>/g) || []).length, 1, 'il </script> del valore non apre un body nuovo');
});

test('fotoAccanto: la foto si nasconde solo a schermo', () => {
    const W = sandbox();
    const html = W.buildAnalisiFonteHtml(SCHEDA, Object.assign({ fotoAccanto: true }, OPTS));
    assert.ok(/@media screen\{\.bs-fonte\{display:none\}\}/.test(html));
    assert.equal(load(html)('.bs-fonte img').length, 1, 'la foto resta nel documento: la stampa la porta');
});

test('sorgente e stile vanno prima dell\'ULTIMO </body> e dell\'ULTIMO </head>, anche se il documento ne ha due', () => {
    const W = sandbox({ sintesi: () => '<html><head><p>x</head> nel titolo</p></head><body><p>x</body> nel testo</p></body></html>' });
    const html = W.buildAnalisiFonteHtml(SCHEDA, OPTS);
    assert.ok(html.lastIndexOf('id="qp-scheda"') > html.indexOf('</body>'), 'dopo il primo </body>');
    assert.ok(html.indexOf('id="qp-scheda"') < html.lastIndexOf('</body>'), 'prima dell\'ultimo');
    assert.ok(html.indexOf('id="qp-scheda-stile"') > html.indexOf('</head>'), 'lo stile dopo il primo </head>');
    assert.ok(html.indexOf('id="qp-scheda-stile"') < html.lastIndexOf('</head>'), 'e prima dell\'ultimo');
    assert.deepEqual(rilegge(W, html), SCHEDA);
});

test('il nome del documento passa dal dizionario (in inglese «Source analysis»)', () => {
    const W = sandbox();
    W.t = (k, f) => (k === 'qp_tipo_analisi' ? 'Source analysis' : f);
    const $ = load(W.buildAnalisiFonteHtml(SCHEDA, OPTS));
    assert.equal($('title').text(), 'Source analysis — Sottoscrivete al prestito');
    assert.equal($('#ap-doc-brand').text().trim(), 'MappAI · Source analysis');
});

// ── il ripiego: il foglio di prima ───────────────────────────────────────────
function eFoglio(html) {
    return html.includes('#7c3aed') && !load(html)('#ap-topbar').length && !html.includes('class="bs-body"');
}
test('spento (mappai_scheda_sintesi = \'0\'): il foglio di prima, e la sorgente torna uguale', () => {
    const W = sandbox({ ls: { mappai_scheda_sintesi: '0' } });
    const html = W.buildAnalisiFonteHtml(SCHEDA, OPTS);
    assert.ok(eFoglio(html), 'foglio viola');
    assert.deepEqual(rilegge(W, html), SCHEDA);
});

test('senza il costruttore della sintesi, o se lancia: il foglio di prima', () => {
    const senza = sandbox({ sintesi: false });
    assert.ok(eFoglio(senza.buildAnalisiFonteHtml(SCHEDA, OPTS)));
    const lancia = sandbox({ sintesi: () => { throw new Error('KaTeX assente'); } });
    const html = lancia.buildAnalisiFonteHtml(SCHEDA, OPTS);
    assert.ok(eFoglio(html), 'un errore nella resa non perde il documento');
    assert.deepEqual(rilegge(lancia, html), SCHEDA);
});

test('un documento VECCHIO (il foglio di prima) si rilegge uguale con l\'interruttore acceso', () => {
    const vecchio = sandbox({ ls: { mappai_scheda_sintesi: '0' } }).buildAnalisiFonteHtml(SCHEDA, OPTS);
    assert.deepEqual(rilegge(sandbox(), vecchio), SCHEDA);
});

// ── il costruttore della sintesi: tipo, foto.src, «Aa» ────────────────────────
const SINTESI = { branchLabel: 'Il clima', mapName: 'Geografia', rawText: '## Uno\n\nTesto.', sourcesArr: [] };

test('senza tipo la sintesi si chiama come sempre', () => {
    const W = sandbox();
    const $ = load(W.MappAISynthesis.buildHtml(SINTESI));
    assert.equal($('title').text(), 'Sintesi — Il clima');
    assert.equal($('#ap-doc-brand').text().trim(), 'MappAI · Sintesi di ramo');
    const intera = load(W.MappAISynthesis.buildHtml(Object.assign({ whole: true }, SINTESI)));
    assert.equal(intera('#ap-doc-brand').text().trim(), 'MappAI · Sintesi della mappa');
    const vuoto = load(W.MappAISynthesis.buildHtml(Object.assign({ tipo: '   ' }, SINTESI)));
    assert.equal(vuoto('title').text(), 'Sintesi — Il clima', 'un tipo vuoto non conta');
});

test('foto.src: entra per indirizzo, javascript: no (anche mascherato), b64 vince', () => {
    const W = sandbox();
    const img = foto => load(W.MappAISynthesis.buildHtml(Object.assign({ foto }, SINTESI)))('.bs-fonte img').attr('src') || null;
    assert.equal(img({ src: '../Allegati/foto "1".jpg' }), '../Allegati/foto "1".jpg');
    assert.equal(img({ src: 'javascript:alert(1)' }), null);
    assert.equal(img({ src: ' JavaScript:alert(1)' }), null);
    assert.equal(img({ src: 'java\nscript:alert(1)' }), null);
    assert.equal(img({ src: '\tjava\u0000script:alert(1)' }), null);
    assert.equal(img({ src: '   ' }), null);
    assert.equal(img({ b64: 'QUJD', src: 'blob:x' }), 'data:image/jpeg;base64,QUJD');
});

test('«Aa»: a schermo solo «Aa», la taglia nell\'aria-label e nel suggerimento, aggiornati al clic', () => {
    const W = sandbox();
    const html = W.MappAISynthesis.buildHtml(SINTESI);
    const b = load(html)('#ap-dys-btn');
    assert.equal(b.text(), 'Aa');
    assert.equal(b.attr('aria-label'), 'Grandezza del testo: ×1');
    assert.ok(b.attr('title').startsWith('Grandezza del testo: ×1 — '));
    assert.ok(html.includes('["Grandezza del testo: ×1","Grandezza del testo: ×1,5","Grandezza del testo: ×2"]'), 'il ciclo ×1 · ×1,5 · ×2');
    assert.ok(/dysBtn\.setAttribute\('aria-label',DYS\[dysStep\]\); dysBtn\.title=DYS\[dysStep\]/.test(html), 'il clic aggiorna aria-label e title');
    assert.ok(!/dysBtn\.(textContent|innerText|innerHTML)\s*=/.test(html), 'il testo del bottone non cambia mai');
    assert.ok(!/Aa x1/.test(html), 'nessun «Aa x1»');
});

test('Evidenzia e Riga con l\'icona, la stampa dice «PDF»; lo stato nell\'aria-label, aggiornato al clic', () => {
    const W = sandbox();
    const html = W.MappAISynthesis.buildHtml(SINTESI);
    const $ = load(html);
    const hl = $('#ap-hl-btn'), riga = $('#ap-riga-btn'), pdf = $('.ap-print-btn');
    assert.equal(hl.text().trim(), '', 'Evidenzia: nessuna parola a schermo');
    assert.equal(riga.text().trim(), '', 'Riga: nessuna parola a schermo');
    assert.ok(hl.find('svg path').length === 2 && hl.html().includes('m9 11-6 6v3h9l3-3'), 'l\'icona highlighter');
    assert.ok(riga.find('svg path').length === 5 && riga.html().includes('M7 12h10'), 'l\'icona scan-line');
    assert.equal(hl.attr('aria-label'), 'Evidenzia: sì');
    assert.equal(riga.attr('aria-label'), 'Riga: no');
    assert.ok(hl.attr('title').startsWith('Evidenzia: sì — '));
    assert.equal(pdf.text().trim(), 'PDF');
    assert.equal(pdf.attr('title'), 'Stampa o salva in PDF');
    assert.ok(!/Stampa \/ PDF/.test($('#ap-topbar').text()), 'nessun «Stampa / PDF» nella barra (i commenti del foglio di stile non contano)');
    assert.ok(/hlBtn\.setAttribute\('aria-label',HLB\[hlOn\?1:0\]\)/.test(html), 'Evidenzia: il clic aggiorna l\'aria-label');
    assert.ok(/btn\.setAttribute\('aria-label',ETI\[passo\]\)/.test(html), 'Riga: il clic aggiorna l\'aria-label');
    assert.ok(!/(hlBtn|btn)\.(textContent|innerText|innerHTML)\s*=\s*(HLB|ETI)/.test(html), 'il clic non sostituisce l\'icona con una parola');
    assert.ok(/#ap-riga-btn\.on\s*[,{]/.test(html), 'Riga accesa ha il fondo pieno, per tutti e tre gli spessori');
});

test('il lettore del documento come quello dell\'app: icone Lucide per play e pausa, chip a 40 × la scala', () => {
    const W = sandbox();
    const html = W.MappAISynthesis.buildHtml(SINTESI);
    // nello script il carattere viaggiava come escape: '\u23F8' (⏸), '\u21BA10' (↺10), '5\u21BB' (5↻)
    for (const vecchio of ['\\u23F8', '\\u21BA10', '5\\u21BB', '\\u25B6\'']) assert.ok(!html.includes(vecchio), 'nessun ' + vecchio + ' nel lettore');
    const ico = JSON.parse(/var ICO=(\{.*?\});/.exec(html)[1]);
    assert.ok(ico.play.includes('<svg') && ico.pause.includes('<rect') && ico.back.includes('<span>10</span>') && ico.fwd.includes('<span>5</span>'));
    assert.ok(/bPlay\.innerHTML=p\?ICO\.pause:ICO\.play/.test(html), 'play e pausa: la stessa forma, solo l\'icona cambia');
    assert.ok(/\.ap-chip \{[^}]*height:calc\(40px \* var\(--ap-ui-k\)\)/.test(html), 'alto come il chip dell\'app (40) per la scala');
    assert.ok(/\.ap-play \{ min-width:calc\(52px/.test(html) && /\.ap-seg \{[^}]*min-width:calc\(46px/.test(html));
});

test('«Aa» in inglese: punto decimale (aa_sep) e «Text size»', () => {
    const W = sandbox();
    W.t = (k, f) => ({ aa_sep: '.', tts_scale: 'Text size' }[k] || f);
    const b = load(W.MappAISynthesis.buildHtml(SINTESI))('#ap-dys-btn');
    assert.equal(b.attr('aria-label'), 'Text size: ×1');
    assert.ok(W.MappAISynthesis.buildHtml(SINTESI).includes('"Text size: ×1.5"'));
});
