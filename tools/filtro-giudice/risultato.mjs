/* Filtro delle segnalazioni del Giudice — passo 5: il risultato (26/9/26).
 *
 * Domanda: un calcolo senza giudizio umano sa separare le segnalazioni che il docente
 * ha trasformato in una correzione ('cambia') da quelle chiuse senza cambiare niente
 * ('invariato')? Le decisioni del docente sono l'etichetta; nessuna soglia è decisa prima.
 *
 * Uso: node risultato.mjs <cartella>   (legge casi.json, indice-richieste.json,
 *      voti-reranker.json, coppie-nli.json, nli.json; scrive misure.json e RAPPORTO.md)
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2];
const leggi = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const { frasi, casi, progetto } = leggi('casi.json');
const indice = leggi('indice-richieste.json');
const rer = leggi('voti-reranker.json');
const { coppie } = leggi('coppie-nli.json');
const nli = leggi('nli.json');
if (nli.prob.length !== coppie.length) throw new Error('nli e coppie non combaciano');

/* ── le caratteristiche di ogni caso ───────────────────────────────────── */
const PAROLE_VUOTE = new Set('della delle dello degli nella nelle negli sono stata stato stati come anche dopo prima questa questo quella quello essere aveva hanno fonte descrizione frase frasi menziona afferma attribuisce riporta indica dice solo però invece mentre'.split(' '));
const parole = s => new Set(String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !PAROLE_VUOTE.has(w)));
const sovrapposizione = (a, b) => { const A = parole(a), B = parole(b); if (!A.size) return 0; let k = 0; for (const w of A) if (B.has(w)) k++; return k / A.size; };
const max = (arr, da, a) => { let v = -Infinity; for (let i = da; i < a; i++) v = Math.max(v, arr[i]); return v === -Infinity ? 0 : v; };

const perCaso = {};
indice.forEach((r, i) => { (perCaso[r.caso] = perCaso[r.caso] || {})[r.famiglia] = { voti: rer.voti[i], nProve: r.nProve }; });
const nliPer = {};
coppie.forEach((c, i) => { (nliPer[c.caso] = nliPer[c.caso] || {})[c.tipo] = nli.prob[i]; });

const righe = casi.map(c => {
    const A = perCaso[c.id].A, B = perCaso[c.id].B, C = perCaso[c.id].C;
    const n = c.prove.length, N = n + frasi.length;
    const P = nliPer[c.id] || {};
    return {
        id: c.id, tipo: c.tipo, esito: c.esito, scelta: c.scelta, haProposta: c.haProposta,
        nProve: n,
        rA_prova: max(A.voti, 0, n),            // la prova citata parla dell'obiezione?
        rA_fonte: max(A.voti, n, N),            // nella fonte c'è qualcosa sull'obiezione?
        rB_desc: max(B.voti, 0, frasi.length),   // la desc intera ha una frase che la sostiene?
        rC_fonte: max(C.voti, n, N),            // la frase contestata ha una frase che la sostiene?
        lex: n ? Math.max(...c.prove.map(p => sovrapposizione(c.problema, p))) : 0,
        P1_ent: P.P1 ? P.P1.entailment : 0,      // la prova implica l'obiezione
        P2_ent: P.P2 ? P.P2.entailment : 0,      // la fonte implica la frase contestata
        P2_con: P.P2 ? P.P2.contradiction : 0,   // la fonte contraddice la frase contestata
        P3_con: P.P3 ? P.P3.contradiction : 0,   // la prova contraddice la frase contestata
        problema: c.problema, contestata: c.contestata,
    };
});

/* ── misure ────────────────────────────────────────────────────────────── */
const etichettati = righe.filter(r => r.esito !== 'pending');
const POS = etichettati.filter(r => r.esito === 'cambia'), NEG = etichettati.filter(r => r.esito === 'invariato');

// AUC = probabilità che un caso 'cambia' abbia un valore più alto di un caso 'invariato' (pareggi a metà).
function auc(pos, neg, f) {
    if (!pos.length || !neg.length) return NaN;
    let s = 0;
    for (const p of pos) for (const q of neg) s += f(p) > f(q) ? 1 : f(p) === f(q) ? 0.5 : 0;
    return s / (pos.length * neg.length);
}
// Bootstrap deterministico (generatore lineare congruenziale con seme fisso: ripetibile).
function bootstrap(pos, neg, f, giri = 2000) {
    let seme = 20260926;
    const rnd = () => ((seme = (seme * 1664525 + 1013904223) >>> 0) / 4294967296);
    const pesca = arr => arr.map(() => arr[Math.floor(rnd() * arr.length)]);
    const v = [];
    for (let g = 0; g < giri; g++) v.push(auc(pesca(pos), pesca(neg), f));
    v.sort((a, b) => a - b);
    return [v[Math.floor(0.025 * giri)], v[Math.floor(0.975 * giri)]];
}
const CARATTERISTICHE = [
    ['rA_prova', 'reranker: la prova citata parla dell\'obiezione'],
    ['rA_fonte', 'reranker: la fonte ha qualcosa sull\'obiezione'],
    ['rB_desc', 'reranker: la desc intera trova una frase della fonte'],
    ['rC_fonte', 'reranker: la frase contestata trova una frase della fonte'],
    ['lex', 'parole in comune obiezione ↔ prova (l\'indizio di ieri)'],
    ['P1_ent', 'NLI: la prova implica l\'obiezione'],
    ['P2_ent', 'NLI: la fonte implica la frase contestata'],
    ['P2_con', 'NLI: la fonte contraddice la frase contestata'],
    ['P3_con', 'NLI: la prova contraddice la frase contestata'],
];
const tabellaAuc = CARATTERISTICHE.map(([k, nome]) => {
    const a = auc(POS, NEG, r => r[k]);
    const [lo, hi] = bootstrap(POS, NEG, r => r[k]);
    return { k, nome, auc: a, lo, hi };
});

/* La regola candidata: ABBASSARE (non cancellare) le segnalazioni con la caratteristica
   sotto una soglia. Per ogni soglia: quante 'invariato' scendono (bene) e quante 'cambia'
   scendono (male: un errore vero finisce in fondo alla lista). */
function curva(k) {
    const valori = [...new Set(etichettati.map(r => r[k]))].sort((a, b) => a - b);
    const soglie = [0].concat(valori.map((v, i) => i + 1 < valori.length ? (v + valori[i + 1]) / 2 : v + 1e-9));
    return soglie.map(t => ({
        t,
        invariatoGiu: NEG.filter(r => r[k] < t).length,
        cambiaGiu: POS.filter(r => r[k] < t).length,
        pendingGiu: righe.filter(r => r.esito === 'pending' && r[k] < t).length,
    }));
}
function miglioreConPerdite(k, perditeMax) {
    return curva(k).filter(p => p.cambiaGiu <= perditeMax).sort((a, b) => b.invariatoGiu - a.invariatoGiu || a.t - b.t)[0];
}
/* Stima onesta con N piccolo: si lascia fuori un caso, si sceglie la soglia sugli altri
   (massimo di 'invariato' abbassate con al più `perditeMax` 'cambia' abbassate), la si applica
   al caso lasciato fuori. */
function lasciaUnoFuori(k, perditeMax) {
    let invGiu = 0, camGiu = 0;
    etichettati.forEach((fuori, i) => {
        const resto = etichettati.filter((_, j) => j !== i);
        const P = resto.filter(r => r.esito === 'cambia'), Q = resto.filter(r => r.esito === 'invariato');
        const valori = [...new Set(resto.map(r => r[k]))].sort((a, b) => a - b);
        const soglie = [0].concat(valori.map((v, j) => j + 1 < valori.length ? (v + valori[j + 1]) / 2 : v + 1e-9));
        let best = { t: 0, inv: -1 };
        for (const t of soglie) {
            const cam = P.filter(r => r[k] < t).length, inv = Q.filter(r => r[k] < t).length;
            if (cam <= perditeMax && (inv > best.inv || (inv === best.inv && t < best.t))) best = { t, inv };
        }
        if (fuori[k] < best.t) { if (fuori.esito === 'cambia') camGiu++; else invGiu++; }
    });
    return { invGiu, camGiu };
}

const soglieTab = [];
for (const [k] of CARATTERISTICHE) for (const perdite of [0, 1, 2]) {
    const m = miglioreConPerdite(k, perdite);
    const loo = lasciaUnoFuori(k, perdite);
    soglieTab.push({ k, perdite, soglia: m ? m.t : null, invariatoGiu: m ? m.invariatoGiu : 0, cambiaGiu: m ? m.cambiaGiu : 0, pendingGiu: m ? m.pendingGiu : 0, loo });
}

/* Per tipo di segnalazione */
const tipi = [...new Set(righe.map(r => r.tipo))];
const perTipo = tipi.map(t => ({
    tipo: t || '(senza tipo)',
    cambia: righe.filter(r => r.tipo === t && r.esito === 'cambia').length,
    invariato: righe.filter(r => r.tipo === t && r.esito === 'invariato').length,
    pending: righe.filter(r => r.tipo === t && r.esito === 'pending').length,
}));

fs.writeFileSync(path.join(DIR, 'misure.json'), JSON.stringify({
    progetto, frasi: frasi.length, casi: righe.length, cambia: POS.length, invariato: NEG.length,
    reranker: { modello: rer.modello, revisione: rer.revisione, dispositivo: rer.dispositivo },
    nli: { modello: nli.modello, revisione: nli.revisione },
    auc: tabellaAuc, soglie: soglieTab, perTipo, righe,
}, null, 1));

/* ── il rapporto ───────────────────────────────────────────────────────── */
const f2 = x => (x == null || Number.isNaN(x)) ? '–' : x.toFixed(2);
const f3 = x => (x == null || Number.isNaN(x)) ? '–' : x.toFixed(3);
const L = [];
L.push(`# Filtro delle segnalazioni del Giudice — prova fuori dall'app`, '');
L.push(`Progetto: **${progetto || '(senza nome)'}** · frasi della fonte: ${frasi.length} · segnalazioni del Giudice: ${righe.length} ` +
    `(**cambia ${POS.length}** · **invariato ${NEG.length}** · non decise ${righe.length - POS.length - NEG.length}).`, '');
L.push(`Reranker: ${rer.modello} (${rer.dispositivo}), locale. NLI: ${nli.modello}, locale. Nessuna chiamata di rete.`, '');
L.push('## Quanto separa ciascun segnale', '');
L.push('AUC = probabilità che una segnalazione che ha portato a una correzione abbia il valore più alto di una chiusa senza cambiare niente. 0,5 = a caso; 1 = separazione perfetta; sotto 0,5 = il segnale va letto al contrario. Fra parentesi l\'intervallo al 95% (bootstrap, 2000 giri).', '');
L.push('| segnale | AUC | intervallo |', '|---|---:|---|');
tabellaAuc.forEach(r => L.push(`| ${r.nome} | ${f2(r.auc)} | ${f2(r.lo)}–${f2(r.hi)} |`));
L.push('', '## Regola candidata: abbassare (non cancellare) sotto una soglia', '');
L.push('Per ogni segnale e per ogni perdita ammessa (quante segnalazioni che hanno portato a una correzione finirebbero in fondo alla lista), la soglia che abbassa più segnalazioni chiuse senza cambiare niente. «Lascia-uno-fuori» = la stessa regola scelta senza vedere il caso che si giudica: è la stima onesta.', '');
L.push('| segnale | perdite ammesse | soglia | invariate abbassate | corrette abbassate | non decise abbassate | lascia-uno-fuori: invariate / corrette |', '|---|---:|---:|---:|---:|---:|---|');
soglieTab.forEach(s => L.push(`| ${s.k} | ${s.perdite} | ${f3(s.soglia)} | ${s.invariatoGiu}/${NEG.length} | ${s.cambiaGiu}/${POS.length} | ${s.pendingGiu} | ${s.loo.invGiu} / ${s.loo.camGiu} |`));
L.push('', '## Per tipo di segnalazione', '', '| tipo | cambia | invariato | non decise |', '|---|---:|---:|---:|');
perTipo.forEach(t => L.push(`| ${t.tipo} | ${t.cambia} | ${t.invariato} | ${t.pending} |`));
L.push('', '## Caso per caso', '', '| esito | tipo | prove | rA_prova | rA_fonte | rC_fonte | lex | P1 impl. | P2 impl. | P2 contr. | P3 contr. | obiezione (inizio) |', '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|');
righe.slice().sort((a, b) => a.esito.localeCompare(b.esito) || a.rA_prova - b.rA_prova).forEach(r =>
    L.push(`| ${r.esito} | ${r.tipo} | ${r.nProve} | ${f2(r.rA_prova)} | ${f2(r.rA_fonte)} | ${f2(r.rC_fonte)} | ${f2(r.lex)} | ${f2(r.P1_ent)} | ${f2(r.P2_ent)} | ${f2(r.P2_con)} | ${f2(r.P3_con)} | ${r.problema.replace(/\|/g, '/').slice(0, 110)} |`));
L.push('', '## Limiti dichiarati', '',
    '- Una fonte sola, un docente solo, poche decine di casi: gli intervalli sono larghi, e una soglia scelta qui non vale per un\'altra fonte senza una seconda misura.',
    '- L\'etichetta è la decisione del docente, che a settembre ha cambiato idea 13 volte su 53 sulle frasi dei disaccordi: anche l\'etichetta ha rumore.',
    '- «invariato» mescola due cose: un\'obiezione sbagliata, e un\'obiezione giusta che il docente ha scelto di non seguire (per esempio una spiegazione aggiunta che vuole tenere).',
    '- La frase contestata è un\'approssimazione: il Giudice indica il nodo, non la frase.',
    '- Il reranker misura la pertinenza, non la verità: nessuna regola qui APPROVA una desc; al massimo abbassa una segnalazione.');
fs.writeFileSync(path.join(DIR, 'RAPPORTO.md'), L.join('\n') + '\n');
console.log(`AUC: ${tabellaAuc.map(r => r.k + ' ' + f2(r.auc)).join(' · ')}`);
