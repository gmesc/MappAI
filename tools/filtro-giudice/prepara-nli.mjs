/* Filtro delle segnalazioni del Giudice — passo 3: le coppie per l'NLI (26/9/26).
 *
 * Dopo il reranker. Per ogni caso tre coppie premessa → ipotesi:
 *  P1 · la prova citata con il voto più alto per l'OBIEZIONE → l'obiezione.
 *       «La prova del Giudice sostiene davvero la sua obiezione?»
 *  P2 · la frase della FONTE (prove escluse) più pertinente per la frase contestata → la frase contestata.
 *       «La fonte sostiene o contraddice la desc, indipendentemente dal Giudice?»
 *  P3 · la prova CITATA più pertinente per la frase contestata → la frase contestata.
 *       «La prova del Giudice contraddice la desc?»
 *
 * Uso: node prepara-nli.mjs <cartella>   (legge casi.json, indice-richieste.json, voti-reranker.json)
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2];
const leggi = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const { frasi, casi } = leggi('casi.json');
const indice = leggi('indice-richieste.json');
const { voti } = leggi('voti-reranker.json');
if (voti.length !== indice.length) throw new Error(`voti ${voti.length} ≠ richieste ${indice.length}`);

const argmax = (arr, da, a) => {
    let k = -1, v = -Infinity;
    for (let i = da; i < a; i++) if (arr[i] > v) { v = arr[i]; k = i; }
    return { k, v };
};
const perCaso = {};
indice.forEach((r, i) => { (perCaso[r.caso] = perCaso[r.caso] || {})[r.famiglia] = { voti: voti[i], nProve: r.nProve }; });

const coppie = [];
casi.forEach(c => {
    const A = perCaso[c.id].A, C = perCaso[c.id].C;
    const docs = c.prove.concat(frasi.map(f => f.text));
    if (c.prove.length) {
        const p1 = argmax(A.voti, 0, c.prove.length);
        coppie.push({ caso: c.id, tipo: 'P1', premessa: docs[p1.k], ipotesi: c.problema });
        const p3 = argmax(C.voti, 0, c.prove.length);
        coppie.push({ caso: c.id, tipo: 'P3', premessa: docs[p3.k], ipotesi: c.contestata });
    }
    const p2 = argmax(C.voti, c.prove.length, docs.length);
    if (p2.k >= 0) coppie.push({ caso: c.id, tipo: 'P2', premessa: docs[p2.k], ipotesi: c.contestata });
});
fs.writeFileSync(path.join(DIR, 'coppie-nli.json'), JSON.stringify({ coppie }));
console.log(`coppie NLI: ${coppie.length}`);
