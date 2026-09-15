#!/usr/bin/env node
/* ══ ANATOMIA — l'inventario delle SUPERFICI dell'app, preso dal codice ═════
   Zero AI, ~1 s. Risponde a «che cosa esiste, oggi, in questa interfaccia, e
   chi lo disegna»: console a schermo pieno, finestre del motore, modali
   statici rimasti, overlay costruiti a mano, documenti stampabili.

       npm run ui                 # l'inventario
       npm run ui -- --elenco     # anche ogni singolo punto, con file:riga

   È la fonte dei numeri di docs/rules/11-anatomia-ui.md: quando quel documento
   dice «sei console», il numero viene da qui e si ricontrolla in un secondo.
   ⚠️ Conta le CHIAMATE nel sorgente, non le schermate che un utente vede: una
   funzione chiamata da due posti resta una riga sola, e un modale dietro un
   flag è contato anche se oggi non si apre. */
'use strict';
const fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const ELENCO = process.argv.includes('--elenco');

/* i commenti si tolgono PRIMA di contare (le righe restano al loro posto, si
   sostituisce con spazi): in questo progetto i commenti spiegano il codice
   CITANDOLO, quindi «<html>» e «position:fixed» compaiono a decine dentro le
   spiegazioni. Contarli voleva dire pubblicare numeri gonfiati in un documento
   di riferimento — capitato al primo giro: 2 documenti stampabili fantasma nel
   foglio delle console. */
const senzaCommenti = t => t
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, m => ' '.repeat(m.length));
const JS = fs.readdirSync(path.join(ROOT, 'public/js'))
    .filter(f => /^mappai-.*\.js$|^app\.js$/.test(f) && !/\.min\./.test(f))
    .map(f => ({ nome: 'public/js/' + f, testo: senzaCommenti(fs.readFileSync(path.join(ROOT, 'public/js', f), 'utf8')) }));
const HTML = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
/* il motore si chiama anche per alias: `var MM = window.MappAIModal` in dieci moduli.
   Cercare solo il nome intero avrebbe contato 10 finestre su 21. */
const ALIAS = [...new Set(
    JS.flatMap(s => [...s.testo.matchAll(/(?:var|const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:window\.)?MappAIModal\b/g)].map(m => m[1]))
)].filter(Boolean);

const riga = (t, i) => t.slice(0, i).split('\n').length;
/* la funzione che contiene una riga: è il nome che il grafo conosce e che si
   cerca in un file (stessa idea di tools/dove.js) */
function funzioneDi(testo, i) {
    const prima = testo.slice(0, i);
    const m = [...prima.matchAll(/(?:function\s+([A-Za-z_$][\w$]*)|(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*function|([A-Za-z_$][\w$]*)\s*:\s*function)/g)].pop();
    return m ? (m[1] || m[2] || m[3]) : '—';
}

function cerca(re, dove = JS) {
    const out = [];
    for (const s of dove) {
        /* i flag dell'originale vanno tenuti: ricostruendo con 'gm' e basta si perde
           la i, e `<!DOCTYPE` maiuscolo (cioè come lo scrivono tutti) non veniva
           trovato — 3 documenti contati invece di 12. */
        const g = new RegExp(re.source, [...new Set(re.flags + 'gm')].join('')); let m;
        while ((m = g.exec(s.testo))) out.push({ file: s.nome, riga: riga(s.testo, m.index), fn: funzioneDi(s.testo, m.index), testo: m[0].slice(0, 60) });
    }
    return out;
}

const GRUPPI = [
    {
        nome: 'CONSOLE a schermo pieno',
        cosa: "layout:'console' + piena:true — la superficie che SOSTITUISCE la schermata",
        trovati: cerca(/layout: *'console'/),
    },
    {
        nome: 'FINESTRE del motore',
        cosa: 'MappAIModal.open / conferma / avviso / chiedi — lo standard per tutto ciò che è nuovo',
        trovati: cerca(new RegExp('\\b(?:MappAIModal|' + ALIAS.join('|') + ')\\.(?:open|conferma|avviso|chiedi)\\s*\\(')),
    },
    {
        nome: 'MODALI statici in index.html',
        cosa: 'blocchi <div id="…modal…"> scritti nel markup, dell\'era pre-motore',
        /* Criterio: l'id FINISCE per "-modal". Il resto ("source-modal-header",
           "modal-setup-title", "btn-text-zoom-modal") sono pezzi dentro un modale o
           bottoni che lo aprono, non finestre: contarli gonfiava 21 in 43. */
        trovati: [...HTML.matchAll(/id="([a-z0-9-]+-modal)"/g)]
            .map(m => ({ file: 'public/index.html', riga: riga(HTML, m.index), fn: m[1], testo: m[1] })),
    },
    {
        nome: 'OVERLAY costruiti a mano',
        cosa: 'un velo a tutto schermo scritto nel JS invece che chiesto al motore: il debito che resta',
        trovati: cerca(/fixed inset-0|position: *fixed[^;]*;\s*(inset|top: *0)/),
    },
    {
        nome: 'DOCUMENTI stampabili',
        cosa: 'pagine complete generate dal JS (stampa, dossier, report): NON caricano style.css',
        /* dentro una STRINGA, non in un commento: `'<!doctype html'`, `\`<html lang=…\`` */
        trovati: cerca(/['"`]\s*<!doctype html|['"`]\s*<html[ >]/i),
    },
];

console.log('\n══ ANATOMIA DELLA UI — ' + new Date().toISOString().slice(0, 10) + ' ══\n');
for (const g of GRUPPI) {
    const perFile = {};
    for (const t of g.trovati) perFile[t.file] = (perFile[t.file] || 0) + 1;
    console.log(String(g.trovati.length).padStart(4) + '  ' + g.nome + '   (' + Object.keys(perFile).length + ' file)');
    console.log('      ' + g.cosa);
    const top = Object.entries(perFile).sort((a, b) => b[1] - a[1]).slice(0, ELENCO ? 99 : 6);
    for (const [f, n] of top) console.log('        ' + String(n).padStart(3) + '  ' + f.replace('public/js/', ''));
    if (!ELENCO && Object.keys(perFile).length > 6) console.log('        … --elenco per il resto');
    if (ELENCO) for (const t of g.trovati) console.log('          · ' + t.file.replace('public/js/', '') + ':' + t.riga + '  ' + t.fn);
    console.log('');
}

/* il vocabolario: quante voci ha il glossario dell'Atlante (i nomi condivisi) */
try {
    const { GLOSSARIO: gl } = require(path.join(ROOT, 'tools/atlante-ui/glossario.js'));
    const fam = {};
    for (const v of gl) fam[v.fam] = (fam[v.fam] || 0) + 1;
    console.log(String(gl.length).padStart(4) + '  NOMI nel glossario dell\'Atlante   (' +
        Object.entries(fam).map(([k, n]) => k + ' ' + n).join(' · ') + ')');
    console.log('      il vocabolario condiviso: «superficie › pezzo» (node tools/atlante-ui/build.js)\n');
} catch (e) { console.log('  glossario dell\'Atlante non leggibile: ' + e.message + '\n'); }

console.log('La regola che questi numeri servono: docs/rules/11-anatomia-ui.md');
console.log('I valori (colori, raggi, corpi): docs/rules/09-stile-e-token.md · npm run stile\n');
