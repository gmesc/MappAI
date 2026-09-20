#!/usr/bin/env node
/* BANCO — l'indice delle evidenze da un vault VERO (20/9, ADR 0002, passo 2).
   Fa girare il CORE VERO (mappai-evidence-core.js) sulle pagine che la revisione
   conserva in pipeline.json — le stesse che `MappAIReview.sources()` dà alla
   cucitura alla riapertura — e stampa che cosa ne esce: per ogni fonte titolo,
   sourceId, pagine, revisione e generi; se nella cartella c'è già un
   evidenze.json, se è stantio; con una query, il pacchetto come lo leggerebbe
   un generatore, con gli scarti contati.

   ⚠️ Non scrive NIENTE: né evidenze.json né altro. Che cosa NON può provare: la
   cucitura (interruttore, IPC, stato in memoria) — quella si guarda in Electron.
   Uso: node tools/smoke/evidenze-da-pipeline.js "<cartella del vault>" [query]   */
'use strict';
const fs = require('fs');
const path = require('path');
const RADICE = path.join(__dirname, '..', '..');
const E = require(path.join(RADICE, 'public', 'js', 'mappai-evidence-core.js'));

const cartella = process.argv[2];
const query = process.argv.slice(3).join(' ').trim();
if (!cartella) { console.error('Uso: node tools/smoke/evidenze-da-pipeline.js "<cartella del vault>" [query]'); process.exit(1); }
const filePipeline = path.join(cartella, 'pipeline.json');
if (!fs.existsSync(filePipeline)) { console.error('Nessun pipeline.json in ' + cartella); process.exit(1); }

let manifest;
try { manifest = JSON.parse(fs.readFileSync(filePipeline, 'utf8')); }
catch (e) { console.error('pipeline.json illeggibile: ' + e.message); process.exit(1); }
/* Le stesse fonti che `R.sources()` restituisce alla riapertura (mappai-review.js:18):
   con una revisione salvata sono `review.sources`, e senza revisione `restore`
   non chiama la cucitura — quindi qui, senza `review.sources`, l'indice è vuoto. */
const fonti = manifest && manifest.review && Array.isArray(manifest.review.sources) ? manifest.review.sources : [];

const indice = E.costruisciIndice(fonti);
console.log('Vault: ' + cartella);
console.log('Fonti in pipeline.json: ' + fonti.length + ' · record (pagine): ' + indice.records.length + ' · schema ' + indice.schema);
indice.fonti.forEach(function (f, i) {
    console.log('  ' + (i + 1) + '. ' + f.title);
    console.log('     sourceId ' + f.sourceId + ' · pagine ' + f.pagine + ' · revisione ' + f.sourceRevision + (f.pdfHash ? ' · pdfHash ' + f.pdfHash : ''));
    console.log('     generi: ' + Object.keys(f.generi).map(function (g) { return g + ' ' + f.generi[g]; }).join(' · '));
});
if (indice.diagnostica.length) {
    console.log('  diagnostica: ' + indice.diagnostica.map(function (d) { return d.code + (d.page ? ' p.' + d.page : ''); }).join(' · '));
}

/* Se c'è già un indice sul disco, il banco dice che cosa farebbe la cucitura:
   rileggerlo o rifarlo. Un JSON illeggibile è stantio, non un errore. */
const fileIndice = path.join(cartella, 'evidenze.json');
if (fs.existsSync(fileIndice)) {
    let salvato = null;
    try { salvato = JSON.parse(fs.readFileSync(fileIndice, 'utf8')); } catch (e) { salvato = null; }
    console.log('evidenze.json: ' + (E.indiceStantio(salvato, fonti)
        ? 'presente e STANTIO — alla riapertura si rifà'
        : 'presente e aggiornato — alla riapertura si rilegge'));
} else {
    console.log('evidenze.json: assente — alla riapertura, con mappai_evidence acceso, si costruisce');
}

if (query) {
    const p = E.costruisciPacchetto({ records: indice.records, query: query });
    console.log('');
    console.log('Pacchetto per «' + query + '»: ' + p.unita.length + ' unità (lessicali ' + p.punteggi.lessicali + ', esterne ' + p.punteggi.esterni + '), scartate ' + p.scartate);
    console.log(E.formattaPerPrompt(p) || '  (vuoto: nessuna frase della fonte risponde alla query)');
}
