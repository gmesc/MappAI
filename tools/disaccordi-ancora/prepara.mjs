#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LA PAGINA DEI DISACCORDI, per un progetto MappAI qualunque (16/9/26).

   Per ogni nodo, tre modi di scegliere le due frasi della fonte che lo provano:
     · àncora      — `ancoraNodi`, quello che MappAI usa senza reranker;
     · BM25        — `cercaBM25` sul titolo del nodo;
     · reranker    — BAAI/bge-reranker-v2-m3 con `queryReranker` e
                     `candidatiReranker`, cioè ESATTAMENTE ciò che fa l'app.
   Nei nodi dove i tre scelgono una prima frase diversa, il docente segna alla
   cieca quali frasi dicono un fatto della descrizione. `risultato.mjs` conta.

   Uso:
     node tools/disaccordi-ancora/prepara.mjs "<cartella del progetto>" [--reranker infomaniak|locale]

   Il progetto deve avere `pipeline.json` (generato con la revisione docente): da
   lì vengono le pagine della fonte e i nodi. L'uscita va in
   local-ai-data/review/disaccordi-<progetto>/ — fuori da git, perché contiene il
   testo della fonte.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import * as Info from './infomaniak.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(QUI, '..', '..');
const A = createRequire(import.meta.url)(join(REPO, 'public/js/mappai-anchor-core.js'));
const esci = m => { console.error('\n✗ ' + Info.pulisci(m)); process.exit(1); };

const argomenti = process.argv.slice(2);
const cartella = argomenti.find(a => !a.startsWith('--'));
const iR = argomenti.indexOf('--reranker');
const fonteReranker = iR >= 0 ? argomenti[iR + 1] : 'infomaniak';
if (!cartella) esci('Indica la cartella del progetto. Esempio:\n  node tools/disaccordi-ancora/prepara.mjs "~/Documents/MappAI - file/Mappe/4R/Storia/Svizzera e 2a GM"');
if (!['infomaniak', 'locale'].includes(fonteReranker)) esci('--reranker vale infomaniak oppure locale.');

// ── il progetto ────────────────────────────────────────────────────────────
let manifest;
try { manifest = JSON.parse(readFileSync(join(cartella, 'pipeline.json'), 'utf8')); }
catch (e) { esci('Non leggo pipeline.json in «' + cartella + '»: ' + e.message); }
const review = manifest.review || {};
const snap = review.approvedSnapshot || review.baseSnapshot || {};
const fonti = Array.isArray(review.sources) ? review.sources : [];
const pagine = [];
fonti.forEach(d => (d.pages || []).forEach(p => pagine.push({ n: p.n || p.page || 0, text: p.text || p.content || '' })));
if (!pagine.length) esci('pipeline.json non contiene le pagine della fonte (review.sources).');
const nodi = (snap.nodes || []).filter(n => n && n.id && String(n.desc || n.content || '').trim());
if (!nodi.length) esci('pipeline.json non contiene nodi con descrizione.');
const progetto = basename(resolve(cartella));
const slug = progetto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const titoloFonte = fonti.map(d => d.title || d.nome || d.name).filter(Boolean).join(' · ') || 'Fonte';

// Il ramo di ogni nodo: l'antenato che sta subito sotto la radice.
const padre = new Map();
(snap.links || []).forEach(l => { if (!l.isCross && !padre.has(l.target)) padre.set(l.target, l.source); });
const perId = new Map((snap.nodes || []).map(n => [n.id, n]));
function ramo(id) {
    let x = id, visti = new Set();
    while (padre.has(x) && padre.has(padre.get(x)) && !visti.has(x)) { visti.add(x); x = padre.get(x); }
    return padre.has(x) ? (perId.get(x) || {}).label || '' : '';
}

// ── i tre metodi ───────────────────────────────────────────────────────────
const frasi = A.frasiDaPagine(pagine);
if (!frasi.length) esci('Nessuna frase di contenuto nella fonte.');
const anc = A.ancoraNodi(nodi, frasi);
const perTesto = new Map(frasi.map(f => [f.text, f.idx]));
const scelte = nodi.map(n => ({
    n,
    ancora: (anc.perNodo[n.id] || []).map(x => ({ i: perTesto.get(x.text), s: x.score })).filter(x => x.i != null),
    bm25: A.cercaBM25(frasi, n.label, { max: 2 }).map(h => ({ i: h.idx, s: h.score })),
    indici: A.candidatiReranker(frasi, n),
    query: A.queryReranker(n)
}));

console.log('Progetto: ' + progetto + ' · ' + nodi.length + ' nodi · ' + frasi.length + ' frasi della fonte · reranker ' + fonteReranker);
const provenienza = { fonte: fonteReranker, modello: Info.MODELLO };
if (fonteReranker === 'infomaniak') {
    try {
        Info.controllaAmbiente();
        let token = 0;
        for (let k = 0; k < scelte.length; k++) {
            const r = await Info.rerank(scelte[k].query, scelte[k].indici.map(i => frasi[i].text));
            scelte[k].voti = r.voti; token += r.token || 0;
            process.stdout.write('\r  reranker Infomaniak: ' + (k + 1) + ' / ' + scelte.length + ' nodi   ');
        }
        process.stdout.write('\n');
        Object.assign(provenienza, { productId: await Info.productId(), token, chf: token * Info.CHF_PER_TOKEN });
    } catch (e) { esci(e.message); }
} else {
    const runtime = join(homedir(), 'Library/Application Support/MappAI/local-ai/runtime/bin/python');
    const tmp = mkdtempSync(join(tmpdir(), 'disaccordi-'));
    try {
        writeFileSync(join(tmp, 'in.json'), JSON.stringify({ richieste: scelte.map(s => ({ query: s.query, documenti: s.indici.map(i => frasi[i].text) })) }));
        const r = spawnSync(runtime, [join(QUI, 'rerank-locale.py'), join(tmp, 'in.json'), join(tmp, 'out.json')],
            { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' } });
        if (r.error || r.status !== 0) esci('Il reranker locale non è partito' + (r.error ? ': ' + r.error.message : ' (codice ' + r.status + ')') + '. Serve il runtime del banco in ' + runtime);
        const out = JSON.parse(readFileSync(join(tmp, 'out.json'), 'utf8'));
        out.voti.forEach((v, k) => { scelte[k].voti = v; });
        Object.assign(provenienza, { revisione: out.revisione, dispositivo: out.dispositivo });
    } finally { rmSync(tmp, { recursive: true, force: true }); }
}
scelte.forEach(s => { s.rerank = A.citazioniDaVoti(frasi, s.indici, s.voti).map(c => ({ i: c.idx, s: c.score })); });

// ── i casi: solo dove la prima frase non è la stessa per tutti e tre ─────────
const hash = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0), 16777619); return h >>> 0; };
const metodi = [['ancora', 'àncora'], ['bm25', 'BM25 (etichetta)'], ['rerank', 'reranker (etichetta + descrizione)']];
const casi = [];
let concordi = 0;
scelte.forEach(s => {
    const primi = metodi.map(([k]) => s[k][0] && s[k][0].i);
    if (primi[0] != null && primi[0] === primi[1] && primi[1] === primi[2]) { concordi++; return; }
    const cand = new Map();
    metodi.forEach(([k]) => s[k].forEach((x, r) => { if (!cand.has(x.i)) cand.set(x.i, []); cand.get(x.i).push({ m: k, rank: r + 1, s: x.s }); }));
    const lista = [...cand.keys()].sort((a, b) => hash(s.n.id + ':' + a) - hash(s.n.id + ':' + b))
        .map(i => ({ i, p: frasi[i].page, t: frasi[i].text.replace(/\s+/g, ' ').trim(), da: cand.get(i) }));
    casi.push({ id: s.n.id, label: s.n.label, ramo: ramo(s.n.id), desc: s.n.desc || s.n.content, frasi: lista });
});
const ordineRami = [...new Set(nodi.map(n => ramo(n.id)))];
casi.sort((a, b) => ordineRami.indexOf(a.ramo) - ordineRami.indexOf(b.ramo));

const uscita = join(REPO, 'local-ai-data', 'review', 'disaccordi-' + slug);
mkdirSync(uscita, { recursive: true });
const dati = { progetto, slug, chiave: 'mappai_disaccordi_' + slug + '_v1', fonte: titoloFonte, nodiTotali: nodi.length, concordi,
    metodi, casi, reranker: provenienza, creato: new Date().toISOString().slice(0, 10) };
writeFileSync(join(uscita, 'casi.json'), JSON.stringify(dati, null, 1));
writeFileSync(join(uscita, 'voti-reranker-' + fonteReranker + '.json'), JSON.stringify({
    ...provenienza, progetto, documenti: frasi.map(f => f.text),
    nodi: scelte.map(s => ({ id: s.n.id, label: s.n.label, query: s.query, indici: s.indici, voti: s.voti })) }));
const html = readFileSync(join(QUI, 'pagina.html'), 'utf8').replace('__DATI__', JSON.stringify(dati).replace(/</g, '\\u003c'));
writeFileSync(join(uscita, 'index.html'), html);

console.log('\n' + casi.length + ' nodi da giudicare su ' + nodi.length + ' (concordi ' + concordi + ') · ' + casi.reduce((a, c) => a + c.frasi.length, 0) + ' frasi da leggere');
if (provenienza.token != null) console.log('Reranker Infomaniak: ' + provenienza.token + ' token → CHF ' + (provenienza.chf || 0).toFixed(4));
console.log('Pagina: ' + uscita + '/index.html');
console.log('Per aprirla (dalla cartella del repository):\n  python3 -m http.server 8147\n  poi http://localhost:8147/local-ai-data/review/disaccordi-' + slug + '/');
