#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   AGGIUNGERE UN METODO a una pagina dei disaccordi già giudicata (17/9/26).

   Un reranker nuovo (es. bge-reranker-v2-gemma) propone le sue due frasi per nodo.
   Dove sono tutte fra quelle già giudicate non c'è niente da rileggere; dove ne
   propone una nuova, il nodo torna in una pagina, con TUTTE le sue frasi mescolate
   (le vecchie e le nuove, senza prefill: il giudizio resta alla cieca e il confronto
   con le scelte di prima misura anche la coerenza del giudice).

   Uso:
     node tools/disaccordi-ancora/aggiungi-metodo.mjs <cartella dei casi> <voti.json> <chiave> "<nome>" <scelte esportate.json>
       → <cartella>-<chiave>/casi.json (tutti i casi, con il metodo in più)
       → <cartella>-<chiave>/index.html (solo i nodi da rileggere)
     node tools/disaccordi-ancora/aggiungi-metodo.mjs --unisci <cartella>-<chiave> <scelte vecchie.json> <scelte nuove.json>
       → <cartella>-<chiave>/scelte-unite.json, da passare a risultato.mjs

   voti.json: { voti: { <id nodo>: [un voto per ogni frase di riferimento-locale.json → documenti] } }.
   Si tengono le prime due per voto, come citazioniDaVoti senza soglia (i voti di un
   reranker-LLM sono logit, non probabilità: una soglia fissa non avrebbe senso).
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const leggi = p => JSON.parse(readFileSync(p, 'utf8'));
const args = process.argv.slice(2);

if (args[0] === '--unisci') {
    const [, cartella, fileVecchie, fileNuove] = args;
    const C = leggi(join(cartella, 'casi.json')), vecchie = leggi(fileVecchie), nuove = leggi(fileNuove);
    const daRileggere = new Set(C.daRileggere), scelte = {};
    let cambiate = 0, confrontabili = 0;
    C.casi.forEach(c => {
        const v = (vecchie.scelte || {})[c.id], n = (nuove.scelte || {})[c.id];
        if (!daRileggere.has(c.id)) { if (v) scelte[c.id] = v; return; }
        if (!n) { console.warn('⚠ «' + c.label + '» non è stato riletto: resta fuori dal conto.'); return; }
        scelte[c.id] = n;
        if (v && v.prove) {   // coerenza del giudice sulle frasi che aveva già visto
            const viste = c.frasi.filter(f => !f.da.every(x => x.m === C.metodoNuovo)).map(f => f.i);
            viste.forEach(i => { confrontabili++; if ((v.prove || []).includes(i) !== (n.prove || []).includes(i)) cambiate++; });
        }
    });
    writeFileSync(join(cartella, 'scelte-unite.json'), JSON.stringify({ ...nuove, scelte }, null, 1));
    console.log('Scelte unite: ' + Object.keys(scelte).length + ' nodi → ' + join(cartella, 'scelte-unite.json'));
    console.log('Coerenza: sulle frasi già giudicate, ' + cambiate + ' giudizi cambiati su ' + confrontabili + '.');
    process.exit(0);
}

const [cartella, fileVoti, chiave, nome, fileScelte] = args;
if (!cartella || !fileVoti || !chiave || !nome || !fileScelte) {
    console.error('Uso: node tools/disaccordi-ancora/aggiungi-metodo.mjs <cartella dei casi> <voti.json> <chiave> "<nome>" <scelte esportate.json>');
    process.exit(1);
}
const C = leggi(join(cartella, 'casi.json'));
const rif = leggi(join(cartella, 'riferimento-locale.json'));
const V = leggi(fileVoti).voti;
leggi(fileScelte);   // solo per fallire subito se il file dei giudizi non c'è
if (C.metodi.some(([k]) => k === chiave)) { console.error('Il metodo «' + chiave + '» c\'è già.'); process.exit(1); }

const pagina = {};   // la pagina di una frase, da qualunque caso l'abbia già mostrata
C.casi.forEach(c => c.frasi.forEach(f => { pagina[f.i] = f.p; }));
const hash = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0), 16777619); return h >>> 0; };

const daRileggere = [];
const casi = C.casi.map(c => {
    const v = V[c.id];
    if (!v || v.length !== rif.documenti.length) { console.error('Voti mancanti o di lunghezza sbagliata per ' + c.id); process.exit(1); }
    const top = v.map((x, i) => [x, i]).sort((a, b) => (b[0] - a[0]) || (a[1] - b[1])).slice(0, 2);
    const frasi = c.frasi.map(f => ({ ...f, da: f.da.slice() }));
    let nuove = 0;
    top.forEach(([voto, i], r) => {
        let f = frasi.find(x => x.i === i);
        if (!f) { f = { i, p: pagina[i] || null, t: rif.documenti[i].replace(/\s+/g, ' ').trim(), da: [] }; frasi.push(f); nuove++; }
        f.da.push({ m: chiave, rank: r + 1, s: Number(voto.toFixed(4)) });
    });
    if (nuove) {
        daRileggere.push(c.id);
        frasi.sort((a, b) => hash(c.id + ':' + chiave + ':' + a.i) - hash(c.id + ':' + chiave + ':' + b.i));
    }
    return { ...c, frasi };
});

const slug = basename(cartella) + '-' + chiave;
const uscita = cartella.replace(/\/$/, '') + '-' + chiave;
mkdirSync(uscita, { recursive: true });
const dati = { ...C, slug, chiave: 'mappai_disaccordi_' + slug + '_v1', metodi: [...C.metodi, [chiave, nome]], metodoNuovo: chiave,
    daRileggere, casi, creato: new Date().toISOString().slice(0, 10) };
writeFileSync(join(uscita, 'casi.json'), JSON.stringify(dati, null, 1));
const perPagina = { ...dati, casi: casi.filter(c => daRileggere.includes(c.id)) };
writeFileSync(join(uscita, 'index.html'),
    readFileSync(join(QUI, 'pagina.html'), 'utf8').replace('__DATI__', JSON.stringify(perPagina).replace(/</g, '\\u003c')));

const frasiNuove = casi.reduce((a, c) => a + c.frasi.filter(f => f.da.every(x => x.m === chiave)).length, 0);
console.log(nome + ': ' + daRileggere.length + ' nodi da rileggere su ' + casi.length + ' · ' + frasiNuove + ' frasi mai giudicate · '
    + perPagina.casi.reduce((a, c) => a + c.frasi.length, 0) + ' frasi da leggere in tutto');
const nonGiudicati = rif.nodi.filter(n => !C.casi.some(c => c.id === n.id) && V[n.id]
    && V[n.id].indexOf(Math.max(...V[n.id])) !== n.voti.indexOf(Math.max(...n.voti)));
if (nonGiudicati.length) console.log('Fuori dal conto (i tre metodi erano d\'accordo, ' + nome + ' no): ' + nonGiudicati.map(n => n.label).join(' · '));
console.log('Pagina: ' + uscita + '/index.html');
console.log('Poi: aggiungi-metodo.mjs --unisci ' + uscita + ' <scelte vecchie> <scelte nuove esportate>, e risultato.mjs ' + uscita + ' ' + uscita + '/scelte-unite.json');
