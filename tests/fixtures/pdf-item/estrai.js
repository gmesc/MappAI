#!/usr/bin/env node
'use strict';
/*
 * estrai.js — le fixture di tests/pdf-testo-core.test.js, e la misura sul PDF vero
 * (packet 0044, docs/tasks/0044-pdf-spazi-inventati.md).
 *
 * NON è un test: `node --test` non lo raccoglie (il nome non combacia coi suoi
 * pattern, e `tests/` non è `test/`). Si lancia a mano, con pdf.js del repo
 * (public/js/pdf.min.js, 3.4.120): niente pdfjs-dist, niente rete.
 *
 *   node tests/fixtures/pdf-item/estrai.js --fixture ofpr-p1 <OFPr-412.101-it.pdf>
 *   node tests/fixtures/pdf-item/estrai.js --fixture le-legge-edilizia <le.pdf>
 *        → riscrive <nome>.json qui accanto: i `content.items` di UNA pagina
 *          (`str`, `hasEOL`, `width`, `height`, `transform`), come li dà
 *          `page.getTextContent()` in extractPdfPages.
 *   node tests/fixtures/pdf-item/estrai.js --misura <file.pdf>
 *        → confronto fra l'unione vecchia e quella nuova su tutte le pagine.
 *          Stampa SOLO numeri e sì/no: il PDF misurato può non essere un testo
 *          libero (il dossier di Svizzera non lo è), e il suo testo non va né
 *          nel repo né nei registri.
 *
 * ⚠️ Repo pubblico: le fixture escono su GitHub. Qui entrano solo testi liberi
 * (leggi federali e cantonali, art. 5 LDA). Per gli altri schemi le fixture sono
 * sintetiche e stanno dentro il test, col PDF d'origine in un commento.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const QUI = __dirname;

// Le fixture vere: testi liberi (art. 5 LDA). Il PDF si passa da riga di comando.
const FONTI = {
    'ofpr-p1': {
        pagina: 1,
        documento: 'Ordinanza sulla formazione professionale (OFPr) del 19 novembre 2003, RS 412.101 (stato 8 febbraio 2021), testo italiano',
        dove: 'fedlex.admin.ch (Raccolta sistematica del diritto federale)',
        perche: 'apice di nota con una cifra: «2002 1», non «20021»'
    },
    'le-legge-edilizia': {
        pagina: 1,
        documento: 'Legge edilizia cantonale del 13 marzo 1991, RL 705.100 (Canton Ticino, stato 1° gennaio 2024)',
        dove: 'Raccolta delle leggi del Cantone Ticino',
        perche: 'numero del capoverso in apice: «1 La licenza», non «1La»'
    }
};

// I 12 frammenti che l'unione vecchia inventa sul dossier «La Svizzera nella
// seconda guerra mondiale» (misurati il 26/09, elencati nel §7 del packet).
const FRAMMENTI_SVIZZERA = ['Henr i', 'neutrali tà', 'r iservisti', 'de lla', 'al le domande', 'impenetra bile',
    'accett are', 'vitt oria', 'L a Svizzera', 'Federale ,', 'Wahlen ,', '1940 - 1944'];

function uso(msg) {
    if (msg) console.error(msg);
    console.error('uso: estrai.js --fixture <' + Object.keys(FONTI).join('|') + '> <file.pdf>\n' +
        '     estrai.js --misura <file.pdf>');
    process.exit(2);
}

function caricaPdfjs() {
    globalThis.window = globalThis;
    globalThis.self = globalThis;
    const m = require(path.join(REPO, 'public', 'js', 'pdf.min.js'));
    const lib = m.getDocument ? m : globalThis.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = path.join(REPO, 'public', 'js', 'vendor', 'pdf.worker.min.js');
    return lib;
}

// → array di pagine, ognuna l'array dei `content.items`
async function pagine(file) {
    const lib = caricaPdfjs();
    const ow = console.warn, ol = console.log;
    console.warn = () => {}; console.log = () => {};                  // pdf.js parla sulla console
    try {
        const pdf = await lib.getDocument({ data: new Uint8Array(fs.readFileSync(file)), disableWorker: true, isEvalSupported: false, verbosity: 0 }).promise;
        const out = [];
        for (let p = 1; p <= pdf.numPages; p++) out.push((await (await pdf.getPage(p)).getTextContent()).items);
        await pdf.destroy();
        return out;
    } finally { console.warn = ow; console.log = ol; }
}

function soloCampi(it) {
    // i campi che il core legge; un pezzo senza `str` (marked content) resta com'è
    if (typeof it.str !== 'string') return Object.assign({}, it);
    return { str: it.str, hasEOL: !!it.hasEOL, width: it.width, height: it.height, transform: Array.from(it.transform || []) };
}

async function fixture(nome, file) {
    const f = FONTI[nome];
    if (!f) uso('fixture sconosciuta: ' + nome);
    if (!file || !fs.existsSync(file)) uso('PDF mancante: ' + file);
    const pg = await pagine(file);
    const items = pg[f.pagina - 1];
    if (!items) uso('il PDF non ha la pagina ' + f.pagina);
    const oggi = new Date(), due = n => String(n).padStart(2, '0');
    const origine = { documento: f.documento, dove: f.dove, pagina: f.pagina, perche: f.perche, pdfjs: '3.4.120',
        estratto: oggi.getFullYear() + '-' + due(oggi.getMonth() + 1) + '-' + due(oggi.getDate()) };
    const pezzi = items.map(soloCampi);
    // un pezzo per riga: la fixture si legge e si confronta con git diff
    const json = '{\n "origine": ' + JSON.stringify(origine) + ',\n "items": [\n' +
        pezzi.map(p => '  ' + JSON.stringify(p)).join(',\n') + '\n ]\n}\n';
    fs.writeFileSync(path.join(QUI, nome + '.json'), json);
    console.log(nome + '.json: ' + pezzi.length + ' pezzi (pagina ' + f.pagina + ')');
}

async function misura(file) {
    if (!file || !fs.existsSync(file)) uso('PDF mancante: ' + file);
    const T = require(path.join(REPO, 'public', 'js', 'mappai-pdf-testo-core.js'));
    const BP = require(path.join(REPO, 'public', 'js', 'mappai-boilerplate-core.js'));
    const pg = await pagine(file);
    const motivi = {};
    const nuove = pg.map(items => { T.unisciRete(items, {}, m => { motivi[m] = (motivi[m] || 0) + 1; }); return T.testoPagina(items); });
    const vecchie = pg.map(items => T.testoPagina(items, { nativa: false }));
    const senza = s => s.replace(/\s+/g, '');
    const testo = nuove.join('\n');                                     // = extractPdfPages().text
    const vecchio = vecchie.join('\n');
    const vecchioCompatto = vecchie.map(t => t.replace(/\s+/g, ' ').trim()).join('\n');
    const presenti = t => FRAMMENTI_SVIZZERA.filter(x => t.includes(x)).length;
    const nonSpaziUguali = pg.filter((_, i) => senza(nuove[i]) === senza(vecchie[i])).length;

    // intestazione: righe-pagina a cui stripBoilerplate (modo A) toglie il prefisso
    const bp = BP.stripBoilerplate(testo);
    const testa = (bp.removed || []).filter(r => r.type === 'header');
    const righeDopo = bp.text.split('\n');
    const tolta = righeDopo.length === nuove.length
        ? nuove.filter((t, i) => righeDopo[i] !== t && t.endsWith(righeDopo[i])).length
        : null;

    console.log('file:                         ' + path.basename(file));
    console.log('pagine:                       ' + pg.length);
    console.log('extractPdfPages().text:       ' + testo.length + ' caratteri (' + (testo.length - (pg.length - 1)) + ' di testo + ' + (pg.length - 1) + ' a capo)');
    console.log('unione vecchia:               ' + vecchio.length + ' caratteri grezzi, ' + vecchioCompatto.length + ' compattati');
    console.log('non-spazi identici:           ' + nonSpaziUguali + ' pagine su ' + pg.length);
    console.log('frammenti (12 di Svizzera):   vecchia ' + presenti(vecchioCompatto) + ', nuova ' + presenti(testo));
    console.log('«Henri Guisan»:               ' + (testo.includes('Henri Guisan') ? 'presente' : 'assente'));
    console.log('spazi doppi:                  ' + (testo.match(/ {2}/g) || []).length);
    console.log('a capo dentro una pagina:     ' + nuove.filter(t => /\n/.test(t)).length);
    console.log('intestazione (stripBoilerplate): ' + (testa.length ? 'trovata, tolta da ' + (tolta == null ? '?' : tolta) + ' pagine su ' + pg.length : 'non trovata'));
    console.log('motivi della rete:            ' + JSON.stringify(motivi));
}

(async () => {
    const [cmd, a, b] = process.argv.slice(2);
    if (cmd === '--fixture') await fixture(a, b);
    else if (cmd === '--misura') await misura(a);
    else uso();
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
