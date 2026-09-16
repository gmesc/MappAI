#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   VERIFICA: bge-reranker-v2-m3 su Infomaniak ordina le frasi come la copia
   locale? (16/9/26, rivista da quattro revisori)

   La pagina dei disaccordi preparata con `--reranker locale` misura il reranker
   di questo Mac; l'app usa quello di Infomaniak, che potrebbe essere una versione
   compressa. Qui si mandano a Infomaniak le stesse domande e le stesse frasi e si
   dice che cosa cambierebbe NELLA PAGINA.

   Uso:
     node tools/disaccordi-ancora/verifica-infomaniak.mjs <cartella dei casi> [--prova]
   La cartella deve contenere casi.json e voti-reranker-locale.json (oppure il
   vecchio riferimento-locale.json). La chiave: vedi infomaniak.mjs e il LEGGIMI.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as Info from './infomaniak.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const A = createRequire(import.meta.url)(join(REPO, 'public/js/mappai-anchor-core.js'));
const argomenti = process.argv.slice(2);
const PROVA = argomenti.includes('--prova');
const CARTELLA = argomenti.find(a => !a.startsWith('--'));
const FILE_OUT = CARTELLA && join(CARTELLA, 'verifica-infomaniak-risultato.json');
const SOGLIA_VOTI = 0.05;

const it = (n, dec = 0) => Number(n).toLocaleString('it-IT', { useGrouping: true, minimumFractionDigits: dec, maximumFractionDigits: dec });
const taglia = (s, n = 90) => (s.length > n ? s.slice(0, n) + '…' : s);
let risultato = null;
function salva() { if (risultato && risultato.nodi.length) { try { writeFileSync(FILE_OUT, JSON.stringify(risultato, null, 1)); } catch (e) { /* resta il riepilogo */ } } }
function esci(m) {
    salva();
    console.error('\n✗ ' + Info.pulisci(m));
    if (risultato && risultato.nodi.length) console.error('  (risultati parziali salvati in ' + FILE_OUT + ')');
    process.exit(1);
}

if (!CARTELLA) esci('Indica la cartella dei casi, per esempio local-ai-data/review/disaccordi-svizzera-e-2a-gm');
const fileRif = [join(CARTELLA, 'voti-reranker-locale.json'), join(CARTELLA, 'riferimento-locale.json')].find(existsSync);
if (!fileRif) esci('Nella cartella manca voti-reranker-locale.json: prepara la pagina con --reranker locale.');
let RIF, CASI;
try { RIF = JSON.parse(readFileSync(fileRif, 'utf8')); CASI = JSON.parse(readFileSync(join(CARTELLA, 'casi.json'), 'utf8')); }
catch (e) { esci('Non riesco a leggere i file della cartella: ' + e.message); }
const DOC = RIF.documenti;
if (!Array.isArray(DOC) || !DOC.length || !Array.isArray(RIF.nodi) || !RIF.nodi.length) esci(fileRif + ' non ha documenti o nodi.');
RIF.nodi.forEach(n => { n.indici = Array.isArray(n.indici) ? n.indici : DOC.map((_, i) => i); });
if (RIF.nodi.some(n => !Array.isArray(n.voti) || n.voti.length !== n.indici.length)) esci(fileRif + ': ogni nodo deve avere un voto per ciascuna frase inviata.');
const PAGINA = new Map((CASI.casi || []).map(c => [c.id, c]));
const primaDelMetodo = (c, m) => (c.frasi.find(f => f.da.some(x => x.m === m && x.rank === 1)) || {}).i;

// ── statistiche ────────────────────────────────────────────────────────────
function ranghi(v) {
    const ord = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]), r = new Array(v.length);
    for (let i = 0; i < ord.length;) { let j = i; while (j + 1 < ord.length && ord[j + 1][0] === ord[i][0]) j++; for (let k = i; k <= j; k++) r[ord[k][1]] = (i + j) / 2 + 1; i = j + 1; }
    return r;
}
function spearman(a, b) {
    const ra = ranghi(a), rb = ranghi(b), n = a.length, ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
    return da && db ? num / Math.sqrt(da * db) : (da === db ? 1 : 0);
}
const mediana = v => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN; };
const percentile = (v, p) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p / 100 * s.length) - 1)] : NaN; };
const sigmoide = x => 1 / (1 + Math.exp(-x));
// le prime due come le sceglie L'APP (citazioniDaVoti), non un ordinamento qualunque
const dueDellApp = (n, voti) => A.citazioniDaVoti(DOC.map((t, i) => ({ idx: i, text: t, page: 0 })), n.indici, voti).map(c => c.idx);

// ── prova a secco ──────────────────────────────────────────────────────────
if (PROVA) {
    const car = RIF.nodi.reduce((s, n) => s + n.query.length + n.indici.reduce((a, i) => a + DOC[i].length, 0), 0);
    const inviate = RIF.nodi.reduce((s, n) => s + n.indici.length, 0);
    console.log('PROVA A SECCO — nessuna chiamata, nessuna chiave letta\n');
    console.log('Indirizzo:        ' + Info.indirizzo());
    console.log('Modello:          ' + Info.MODELLO);
    console.log('Progetto:         ' + (CASI.progetto || RIF.progetto || '?') + ' — ' + (CASI.fonte || ''));
    console.log('Chiamate:         ' + RIF.nodi.length + ' (una per nodo, una ogni 1,1 s → circa ' + it(Math.ceil(RIF.nodi.length * 2.1 / 60)) + ' minuti)');
    console.log('Frasi inviate:    ' + it(inviate) + ' in tutto · circa ' + it(car) + ' caratteri');
    console.log('Esempio di domanda: «' + taglia(RIF.nodi[0].query, 140) + '»');
    console.log('\nChiave impostata in questo terminale: ' + (Info.CHIAVE ? 'sì' : 'no') + ' (non viene usata in prova)');
    process.exit(0);
}

try { Info.controllaAmbiente(); } catch (e) { esci(e.message); }
let pid;
try { pid = await Info.productId(); } catch (e) { esci(e.message); }
risultato = { quando: new Date().toISOString(), modello: Info.MODELLO, productId: pid, progetto: CASI.progetto || RIF.progetto, nodi: [] };
console.log('Verifica di ' + Info.MODELLO + ' — Infomaniak contro la copia locale');
console.log(risultato.progetto + ' · ' + RIF.nodi.length + ' nodi · prodotto AI Tools ' + pid + '\n');

let scalaDiversa = false;
for (let k = 0; k < RIF.nodi.length; k++) {
    const n = RIF.nodi[k];
    let r;
    try { r = await Info.rerank(n.query, n.indici.map(i => DOC[i])); } catch (e) { esci('Nodo «' + n.label + '»: ' + e.message); }
    const fuoriScala = r.voti.some(v => v < 0 || v > 1);
    if (fuoriScala) scalaDiversa = true;
    const api = fuoriScala ? r.voti.map(sigmoide) : r.voti, loc = n.voti;
    const delta = loc.map((v, i) => Math.abs(v - api[i]));
    const dueLoc = dueDellApp(n, loc), dueApi = dueDellApp(n, api);
    const riga = { id: n.id, label: n.label, ms: Math.round(r.ms), tentativi: r.tentativi, modelloRisposto: r.modello, token: r.token,
        primaLocale: dueLoc[0], primaApi: dueApi[0], dueLocali: dueLoc.slice().sort((a, b) => a - b), dueApi: dueApi.slice().sort((a, b) => a - b),
        spearman: Number(spearman(loc, api).toFixed(6)), deltaMax: Number(Math.max(...delta).toFixed(6)), fuoriScala, votiApi: r.voti };
    riga.stessaPrima = riga.primaLocale === riga.primaApi;
    riga.stesseDue = riga.dueLocali.join(',') === riga.dueApi.join(',');
    const caso = PAGINA.get(n.id);
    riga.inPagina = !!caso;
    riga.nonGiudicate = caso ? riga.dueApi.filter(i => !caso.frasi.some(f => f.i === i)) : [];
    if (caso) riga.esceDallaPagina = primaDelMetodo(caso, 'ancora') === riga.primaApi && primaDelMetodo(caso, 'bm25') === riga.primaApi;
    else riga.nuovoCaso = !riga.stessaPrima;
    risultato.nodi.push(riga);
    process.stdout.write('\r  ' + (k + 1) + ' / ' + RIF.nodi.length + ' nodi   ');
}
process.stdout.write('\n\n');

const R = risultato.nodi, N = R.length;
const prime = R.filter(r => r.stessaPrima).length, due = R.filter(r => r.stesseDue).length;
const rho = R.map(r => r.spearman), dmax = R.map(r => r.deltaMax), tempi = R.map(r => r.ms);
const tokenNoti = R.filter(r => r.token != null), token = tokenNoti.reduce((s, r) => s + r.token, 0);
const ritentati = R.filter(r => r.tentativi > 1).length;
const inPag = R.filter(r => r.inPagina), pagPrima = inPag.filter(r => !r.stessaPrima), pagInsieme = inPag.filter(r => !r.stesseDue);
const nonGiudicate = inPag.reduce((s, r) => s + r.nonGiudicate.length, 0), nuoviCasi = R.filter(r => r.nuovoCaso), escono = inPag.filter(r => r.esceDallaPagina);
const tocca = pagPrima.length + pagInsieme.length + nonGiudicate + nuoviCasi.length + escono.length, deltaPeggiore = Math.max(...dmax);
const nodi = n => n + (n === 1 ? ' nodo' : ' nodi');
risultato.riepilogo = { nodi: N, stessaPrima: prime, stesseDue: due, spearmanMediano: mediana(rho), deltaMaxMassimo: deltaPeggiore,
    msMediano: mediana(tempi), ms95: percentile(tempi, 95), token, chf: token * Info.CHF_PER_TOKEN, scalaDiversa, chiamateRitentate: ritentati,
    pagina: { nodiInPagina: inPag.length, altraPrima: pagPrima.length, altroInsieme: pagInsieme.length, frasiNonGiudicate: nonGiudicate, nuoviCasi: nuoviCasi.length, esconoDallaPagina: escono.length } };

console.log('Stessa prima frase:          ' + prime + ' / ' + N);
console.log('Stesse prime due frasi:      ' + due + ' / ' + N);
console.log('Ordine di tutte le frasi:    Spearman mediano ' + it(mediana(rho), 4) + ' · minimo ' + it(Math.min(...rho), 4) + '  (1 = ordine identico)');
console.log('Differenza dei voti:         la più grande ' + it(deltaPeggiore, 4) + (scalaDiversa ? '  ⚠ voti Infomaniak su scala diversa, riportati fra 0 e 1' : ''));
console.log('Tempo per chiamata:          mediana ' + it(mediana(tempi)) + ' ms · 95° percentile ' + it(percentile(tempi, 95)) + ' ms' + (ritentati ? '  (' + ritentati + (ritentati === 1 ? ' chiamata ritentata)' : ' chiamate ritentate)') : ''));
console.log('Token fatturati:             ' + (tokenNoti.length ? it(token) + ' → CHF ' + it(token * Info.CHF_PER_TOKEN, 4) + ' (IVA esclusa)' : 'non riportati dalla risposta'));
console.log('\nEffetto sulla pagina dei disaccordi (' + inPag.length + ' nodi):');
console.log('  altra prima frase del reranker:        ' + nodi(pagPrima.length) + '  (può cambiare «Prima frase giusta»)');
console.log('  altre prime due del reranker:          ' + nodi(pagInsieme.length) + '  (può cambiare le altre colonne)');
console.log('  frasi in cima mai viste nella pagina:  ' + nonGiudicate);
console.log('  nodi concordi che diventerebbero casi: ' + nuoviCasi.length);
console.log('  nodi che uscirebbero dalla pagina:     ' + escono.length);
let verdetto;
if (!tocca && deltaPeggiore <= SOGLIA_VOTI) verdetto = 'STESSO COMPORTAMENTO: la pagina dei disaccordi resterebbe identica e i voti sono quasi uguali. Quello che misuri nella pagina vale anche per il reranker di Infomaniak.';
else if (!tocca) verdetto = 'STESSO ORDINE, VOTI DIVERSI: la pagina resterebbe identica, ma i voti cambiano fino a ' + it(deltaPeggiore, 2) + '. Quello che misuri vale; una soglia sui voti andrebbe tarata su Infomaniak.';
else if (prime >= Math.ceil(N * 0.9) && due >= Math.ceil(N * 0.9)) verdetto = 'QUASI UGUALE: la pagina cambierebbe in pochi punti (vedi sopra e l\'elenco sotto). Il risultato del reranker vale per Infomaniak solo dopo aver giudicato quei punti.';
else verdetto = 'DIVERSO: su Infomaniak il modello non ordina le frasi come la copia locale (forse una versione compressa). La pagina dei disaccordi NON vale per Infomaniak.';
risultato.verdetto = verdetto;
console.log('\n' + verdetto);
const diversi = R.filter(r => !r.stessaPrima || !r.stesseDue);
if (diversi.length) {
    console.log('\nNodi dove cambia la prima frase o le prime due:');
    diversi.forEach(r => {
        console.log('  · ' + r.label + '  (' + (r.inPagina ? 'nella pagina' : 'concorde, fuori dalla pagina') + ')');
        if (!r.stessaPrima) console.log('      prima frase: locale «' + taglia(DOC[r.primaLocale], 70) + '» → Infomaniak «' + taglia(DOC[r.primaApi], 70) + '»');
        r.dueLocali.filter(i => !r.dueApi.includes(i)).forEach(i => console.log('      esce dalle prime due:  «' + taglia(DOC[i]) + '»'));
        r.dueApi.filter(i => !r.dueLocali.includes(i)).forEach(i => console.log('      entra nelle prime due: «' + taglia(DOC[i]) + '»' + (r.nonGiudicate.includes(i) ? '  (mai vista nella pagina)' : '')));
    });
}
salva();
console.log('\nDettagli salvati in ' + FILE_OUT + ' (nessuna chiave dentro).');
