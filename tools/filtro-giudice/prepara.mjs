/* Filtro delle segnalazioni del Giudice — passo 1: prepara i casi (26/9/26).
 *
 * Legge IN SOLA LETTURA il pipeline.json di un progetto revisionato e ricava:
 *  - i casi: ogni segnalazione del Giudice (origin 'judge') con l'esito della
 *    decisione del docente — 'cambia' (proposta accettata o testo riscritto),
 *    'invariato' («Mantieni» o «Modifica il testo» chiuso senza cambiare
 *    niente), 'pending' (non ancora decisa: entra nei punteggi, non nelle misure);
 *  - le frasi della fonte, con lo stesso estrattore dell'àncora (frasiDaPagine);
 *  - le richieste per il reranker locale (formato di tools/disaccordi-ancora/rerank-locale.py).
 *
 * Uso: node prepara.mjs <pipeline.json> <radice del repo> <cartella di uscita>
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const [, , PIPE, REPO, OUT] = process.argv;
if (!PIPE || !REPO || !OUT) {
    console.error('Uso: node prepara.mjs <pipeline.json> <radice del repo> <cartella di uscita>');
    process.exit(2);
}
const require = createRequire(import.meta.url);
const AC = require(path.join(REPO, 'public/js/mappai-anchor-core.js'));
const DC = require(path.join(REPO, 'public/js/mappai-deepen-core.js'));

/* La FRASE CONTESTATA: la frase della desc che ha più parole piene in comune con
   l'obiezione. È un'approssimazione dichiarata: il Giudice non dice quale frase
   contesta, dice solo il nodo e il campo. */
const PAROLE_VUOTE = new Set('della delle dello degli nella nelle negli sono stata stato stati come anche dopo prima questa questo quella quello essere aveva hanno fonte descrizione frase frasi menziona afferma attribuisce riporta indica dice solo però invece mentre'.split(' '));
const parole = s => new Set(String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !PAROLE_VUOTE.has(w)));
function fraseContestata(desc, problema) {
    const P = parole(problema);
    let migliore = '', punti = -1;
    for (const f of DC.splitSentences(desc)) {
        const F = parole(f);
        let k = 0; for (const w of F) if (P.has(w)) k++;
        const v = F.size ? k / Math.sqrt(F.size) : 0;
        if (v > punti) { punti = v; migliore = f; }
    }
    return migliore || String(desc || '').slice(0, 400);
}

const manifesto = JSON.parse(fs.readFileSync(PIPE, 'utf8'));
const review = manifesto.review;
if (!review || !review.initial || !Array.isArray(review.initial.issues)) {
    console.error('Il manifesto non contiene una revisione con segnalazioni.');
    process.exit(1);
}

const pagine = (review.sources || []).flatMap(s => (s.pages || []).map(p => ({ n: p.n, text: p.text })));
const frasi = AC.frasiDaPagine(pagine).map((f, i) => ({ id: 's' + i, page: f.page, text: f.text }));

const decisioni = review.initial.decisions || {};
const uguale = (a, b) => String(a || '').trim() === String(b || '').trim();
const casi = review.initial.issues.filter(x => x.origin === 'judge').map(x => {
    const d = decisioni[x.id];
    const esito = !d ? 'pending'
        : (d.choice === 'accept' || (d.choice === 'manual' && !uguale(d.text, x.before))) ? 'cambia' : 'invariato';
    const prove = (Array.isArray(x.evidence) ? x.evidence : []).map(e => String((e && e.text) || '')).filter(t => t.trim());
    return {
        id: x.id, tipo: x.type || '', bersaglio: x.target, esito, scelta: d ? d.choice : 'pending',
        haProposta: !!x.hasProposal, problema: String(x.problem || ''), prima: String(x.before || ''), prove,
        contestata: fraseContestata(x.before, x.problem),
    };
});

/* Due famiglie di richieste al reranker, nello stesso file:
 *  A · query = l'OBIEZIONE del Giudice; documenti = le prove che cita, poi tutte le frasi della fonte.
 *      Dice se la prova citata parla di ciò che l'obiezione contesta, e se nella fonte c'è di meglio.
 *  B · query = la DESCRIZIONE contestata; documenti = tutte le frasi della fonte.
 *      Dice quanto la desc è sostenuta dalla fonte, indipendentemente dal Giudice. */
const richieste = [];
/*  C · query = la FRASE CONTESTATA della desc; documenti = le prove citate, poi tutte le frasi.
 *      Serve a scegliere la premessa migliore per il confronto NLI con quella frase. */
casi.forEach(c => {
    richieste.push({ caso: c.id, famiglia: 'A', query: c.problema, documenti: c.prove.concat(frasi.map(f => f.text)), nProve: c.prove.length });
    richieste.push({ caso: c.id, famiglia: 'B', query: c.prima.slice(0, 1200), documenti: frasi.map(f => f.text), nProve: 0 });
    richieste.push({ caso: c.id, famiglia: 'C', query: c.contestata, documenti: c.prove.concat(frasi.map(f => f.text)), nProve: c.prove.length });
});

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'casi.json'), JSON.stringify({ progetto: manifesto.review.vaultPath ? path.basename(manifesto.review.vaultPath) : '', frasi, casi }, null, 1));
fs.writeFileSync(path.join(OUT, 'richieste-reranker.json'), JSON.stringify({ richieste: richieste.map(r => ({ query: r.query, documenti: r.documenti })) }));
fs.writeFileSync(path.join(OUT, 'indice-richieste.json'), JSON.stringify(richieste.map(r => ({ caso: r.caso, famiglia: r.famiglia, nProve: r.nProve }))));

const conta = k => casi.filter(c => c.esito === k).length;
console.log(`frasi della fonte: ${frasi.length} · casi del Giudice: ${casi.length} (cambia ${conta('cambia')}, invariato ${conta('invariato')}, pending ${conta('pending')}) · richieste al reranker: ${richieste.length}`);
