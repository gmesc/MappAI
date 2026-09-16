#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   IL RISULTATO della pagina dei disaccordi (16/9/26).

   Uso:
     node tools/disaccordi-ancora/risultato.mjs <cartella dei casi> <scelte esportate.json>

   Per metodo: prima frase giusta, giusta fra le prime due, frasi proposte giuste
   (la misura che conta: l'app mostra come «Fonti» TUTTE e due le frasi), frasi
   segnate trovate, trovate solo da lui. Poi il confronto appaiato sulla prima
   frase con il test binomiale esatto: con 35 nodi una differenza di 6 a 2 può
   ancora essere il caso, e va detto.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [cartella, fileScelte] = process.argv.slice(2);
if (!cartella || !fileScelte) { console.error('Uso: node tools/disaccordi-ancora/risultato.mjs <cartella dei casi> <scelte esportate.json>'); process.exit(1); }
const C = JSON.parse(readFileSync(join(cartella, 'casi.json'), 'utf8'));
const esportate = JSON.parse(readFileSync(fileScelte, 'utf8'));
const S = esportate.scelte || {};
if (esportate.progetto && C.progetto && esportate.progetto !== C.progetto) console.warn('⚠ Le scelte sono di «' + esportate.progetto + '», i casi di «' + C.progetto + '».');

const M = C.metodi.map(m => m[0]), nome = Object.fromEntries(C.metodi);
const r = Object.fromEntries(M.map(m => [m, { p1: 0, p2: 0, giuste: 0, proposte: 0, trovate: 0, solo: 0 }]));
const primaGiusta = Object.fromEntries(M.map(m => [m, {}]));
let conProva = 0, segnate = 0, nessuna = 0, mancanti = 0;
C.casi.forEach(c => {
    const s = S[c.id];
    if (!s) { mancanti++; return; }
    if (s.nessuna) { nessuna++; return; }
    if (!s.prove || !s.prove.length) { mancanti++; return; }
    conProva++; segnate += s.prove.length;
    M.forEach(m => {
        const sue = c.frasi.filter(f => f.da.some(x => x.m === m)), R = r[m];
        const ok = sue.some(f => f.da.find(x => x.m === m).rank === 1 && s.prove.includes(f.i));
        primaGiusta[m][c.id] = ok; if (ok) R.p1++;
        if (sue.some(f => s.prove.includes(f.i))) R.p2++;
        R.giuste += sue.filter(f => s.prove.includes(f.i)).length; R.proposte += sue.length;
        R.trovate += s.prove.filter(i => sue.some(f => f.i === i)).length;
        R.solo += c.frasi.filter(f => s.prove.includes(f.i) && f.da.every(x => x.m === m)).length;
    });
});
const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
console.log('Progetto: ' + C.progetto + ' · reranker ' + ((C.reranker && C.reranker.fonte) || 'locale') + ' · ' + conProva + ' nodi con almeno una frase segnata, ' + segnate + ' frasi segnate'
    + (nessuna ? ' · ' + nessuna + ' «nessuna»' : '') + (mancanti ? ' · ⚠ ' + mancanti + ' nodi non ancora giudicati' : ''));
console.log('\nmetodo                                | prima giusta | fra le prime due | frasi proposte giuste | segnate trovate | solo lui');
M.forEach(m => {
    const R = r[m];
    console.log(nome[m].padEnd(37) + ' | ' + (R.p1 + '/' + conProva).padEnd(12) + ' | ' + (R.p2 + '/' + conProva).padEnd(16) + ' | ' +
        (R.giuste + '/' + R.proposte + ' (' + pct(R.giuste, R.proposte) + ')').padEnd(21) + ' | ' + (R.trovate + '/' + segnate).padEnd(15) + ' | ' + R.solo);
});
// binomiale bilaterale esatto sui nodi in cui uno solo dei due ha la prima frase giusta
function binomiale(k, n) {
    let p = 0, c = 1;
    for (let i = 0; i <= Math.min(k, n - k); i++) { if (i) c = c * (n - i + 1) / i; p += c; }
    return n ? Math.min(1, 2 * p / Math.pow(2, n)) : 1;
}
console.log('\nPrima frase, nodo per nodo (conta solo dove uno dei due ha ragione e l\'altro no):');
M.flatMap((a, k) => M.slice(k + 1).map(b => [a, b])).forEach(([a, b]) => {
    let va = 0, vb = 0;
    Object.keys(primaGiusta[a]).forEach(id => { if (primaGiusta[a][id] && !primaGiusta[b][id]) va++; if (!primaGiusta[a][id] && primaGiusta[b][id]) vb++; });
    const p = binomiale(Math.min(va, vb), va + vb);
    console.log('  ' + nome[a] + ' contro ' + nome[b] + ': ' + va + ' a ' + vb + ' · p = ' + p.toFixed(3).replace('.', ',') + (p < 0.05 ? '' : '  (non ancora solido)'));
});
const tutti = C.casi.filter(c => S[c.id] && (S[c.id].prove || []).length && M.every(m => !primaGiusta[m][c.id])).map(c => c.label);
if (tutti.length) console.log('\nNodi dove nessun metodo ha la prima frase giusta: ' + tutti.join(' · '));
const note = C.casi.filter(c => S[c.id] && String(S[c.id].nota || '').trim());
if (note.length) { console.log('\nNote del docente:'); note.forEach(c => console.log('  «' + c.label + '»: ' + S[c.id].nota)); }
