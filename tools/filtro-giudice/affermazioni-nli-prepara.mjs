/* Strato delle affermazioni — misura offline, passo 3: coppie NLI (26/9/26).
 *   V · per ogni affermazione, le 3 frasi della fonte più pertinenti (R1) → premessa = frase, ipotesi = affermazione.
 *       «La fonte sostiene / contraddice l'affermazione?» (corsie)
 *   C · per ogni frase della fonte, le 3 affermazioni più pertinenti (R2) → premessa = affermazione, ipotesi = frase.
 *       «La mappa contiene il FATTO di questa frase, non solo l'argomento?» (orfane)
 * Uso: node affermazioni-nli-prepara.mjs <cartella>
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2];
const leggi = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const { frasi, affermazioni } = leggi('affermazioni.json');
const indice = leggi('indice-richieste.json');
const { voti } = leggi('voti-reranker.json');
if (voti.length !== indice.length) throw new Error('voti e richieste non combaciano');
const base = affermazioni.filter(a => a.versione === 'base');
const top = (arr, k) => arr.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, k);

const coppie = [];
indice.forEach((q, i) => {
    if (q.tipo === 'R1') {
        const a = affermazioni.find(x => x.id === q.chiave);
        top(voti[i], 3).forEach(([v, j], rango) => coppie.push({ tipo: 'V', chiave: q.chiave, rango, voto: v, frase: frasi[j].id, premessa: frasi[j].text, ipotesi: a.testo }));
    } else {
        const f = frasi.find(x => x.id === q.chiave);
        top(voti[i], 3).forEach(([v, j], rango) => coppie.push({ tipo: 'C', chiave: q.chiave, rango, voto: v, affermazione: base[j].id, premessa: base[j].testo, ipotesi: f.text }));
    }
});
fs.writeFileSync(path.join(DIR, 'coppie-nli.json'), JSON.stringify({ coppie }));
console.log(`coppie NLI: ${coppie.length}`);
