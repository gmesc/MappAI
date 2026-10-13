/* Strato delle affermazioni — misura offline, passo 1 (26/9/26).
 *
 * Dalla mappa COME È STATA GENERATA (review.baseSnapshot) ricava le affermazioni:
 * ogni frase di ogni desc. Le frasi che parlano della mappa invece che del contenuto
 * («Questa categoria spiega…») sono 'organizzative'. Collega ogni segnalazione del
 * Giudice alla frase che contesta (approssimazione dichiarata: la frase della desc
 * con più parole piene in comune con l'obiezione). Aggiunge le affermazioni DOPO la
 * correzione del docente («Modifica il testo» con testo cambiato, «Applica la proposta»),
 * per vedere se il triage le giudica diversamente dal testo di prima.
 *
 * Richieste al reranker:
 *   R1 · query = affermazione, documenti = le frasi della fonte   (corsie, packet 0040)
 *   R2 · query = frase della fonte, documenti = tutte le affermazioni della mappa di base (orfane, packet 0041)
 *
 * Uso: node affermazioni-prepara.mjs <pipeline.json> <radice del repo> <cartella di uscita>
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const [, , PIPE, REPO, OUT] = process.argv;
const require = createRequire(import.meta.url);
const AC = require(path.join(REPO, 'public/js/mappai-anchor-core.js'));
const DC = require(path.join(REPO, 'public/js/mappai-deepen-core.js'));

const man = JSON.parse(fs.readFileSync(PIPE, 'utf8'));
const r = man.review;
const pagine = (r.sources || []).flatMap(s => (s.pages || []).map(p => ({ n: p.n, text: p.text })));
const frasi = AC.frasiDaPagine(pagine).map((f, i) => ({ id: 's' + i, page: f.page, text: f.text }));

const ORGANIZZATIVA = /^(questa|questo|queste|questi|la presente|il presente)\s+(categoria|sezione|area|ramo|parte|nodo|capitolo|macro-?area|gruppo|voce)\b|^(in questo|in questa)\s+(ramo|sezione|categoria|parte|area)\b|^(qui|di seguito)\s+(si|vengono|sono)\b/i;
const PAROLE_VUOTE = new Set('della delle dello degli nella nelle negli sono stata stato stati come anche dopo prima questa questo quella quello essere aveva hanno fonte descrizione frase frasi menziona afferma attribuisce riporta indica dice solo però invece mentre'.split(' '));
const parole = s => new Set(String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !PAROLE_VUOTE.has(w)));
const simile = (a, b) => { const A = parole(a), B = parole(b); let k = 0; for (const w of A) if (B.has(w)) k++; return A.size ? k / Math.sqrt(A.size) : 0; };

const nodi = r.baseSnapshot.nodes;
const affermazioni = [];
nodi.forEach(n => {
    DC.splitSentences(n.desc || '').forEach((t, i) => {
        const testo = String(t).trim();
        if (!testo) return;
        affermazioni.push({ id: n.id + '#' + i, nodo: n.id, livello: n.level, etichetta: n.label, testo,
            organizzativa: ORGANIZZATIVA.test(testo), versione: 'base', segnalazioni: [] });
    });
});

/* Le segnalazioni del Giudice sulle desc → la frase contestata */
const dec = r.initial.decisions || {};
const uguale = (a, b) => String(a || '').trim() === String(b || '').trim();
const dopo = [];
r.initial.issues.filter(x => x.origin === 'judge' && x.target && x.target.field === 'desc').forEach(x => {
    const d = dec[x.id];
    const esito = !d ? 'pending' : (d.choice === 'accept' || (d.choice === 'manual' && !uguale(d.text, x.before))) ? 'cambia' : 'invariato';
    const candidate = affermazioni.filter(a => a.nodo === x.target.id && a.versione === 'base');
    if (!candidate.length) return;
    let best = candidate[0], v = -1;
    candidate.forEach(a => { const s = simile(x.problem, a.testo); if (s > v) { v = s; best = a; } });
    best.segnalazioni.push({ id: x.id, tipo: x.type, esito, scelta: d ? d.choice : 'pending' });
    // il testo dopo la correzione del docente: le sue frasi diventano affermazioni «dopo»
    const testoDopo = !d ? null : d.choice === 'manual' && !uguale(d.text, x.before) ? d.text : d.choice === 'accept' ? x.after : null;
    if (testoDopo) DC.splitSentences(testoDopo).forEach((t, i) => {
        const testo = String(t).trim();
        if (testo && !candidate.some(a => uguale(a.testo, testo))) dopo.push({ id: x.id + '@dopo#' + i, nodo: x.target.id, livello: best.livello, etichetta: best.etichetta, testo, organizzativa: ORGANIZZATIVA.test(testo), versione: 'dopo', segnalazioni: [{ id: x.id, tipo: x.type, esito, scelta: d.choice }] });
    });
});
const tutte = affermazioni.concat(dopo);

const richieste = [];
tutte.forEach(a => richieste.push({ tipo: 'R1', chiave: a.id, query: a.testo, documenti: frasi.map(f => f.text) }));
frasi.forEach(f => richieste.push({ tipo: 'R2', chiave: f.id, query: f.text, documenti: affermazioni.map(a => a.testo) }));

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'affermazioni.json'), JSON.stringify({ frasi, affermazioni: tutte }, null, 1));
fs.writeFileSync(path.join(OUT, 'richieste-reranker.json'), JSON.stringify({ richieste: richieste.map(q => ({ query: q.query, documenti: q.documenti })) }));
fs.writeFileSync(path.join(OUT, 'indice-richieste.json'), JSON.stringify(richieste.map(q => ({ tipo: q.tipo, chiave: q.chiave }))));
console.log(`frasi ${frasi.length} · affermazioni di base ${affermazioni.length} (organizzative ${affermazioni.filter(a => a.organizzativa).length}) · dopo la correzione ${dopo.length} · con segnalazione ${affermazioni.filter(a => a.segnalazioni.length).length} · richieste ${richieste.length}`);
