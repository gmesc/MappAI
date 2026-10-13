/* Strato delle affermazioni — misura offline, passo 5: corsie e frasi orfane (26/9/26).
 *
 * Corsie (packet 0040), per una soglia di pertinenza τ del reranker:
 *   organizzativa · la frase parla della mappa, non del contenuto
 *   rossa         · una frase pertinente (voto ≥ τ) la CONTRADDICE (NLI ≥ 0,5)
 *   verde         · una frase pertinente la SOSTIENE (NLI ≥ 0,5) e nessuna la contraddice
 *   grigia        · nessuna frase pertinente la sostiene né la contraddice (aggiunta del modello)
 * Orfane (packet 0041), per una soglia τo:
 *   coperta        · un'affermazione ne IMPLICA il fatto (NLI ≥ 0,5 fra le 3 più pertinenti)
 *   solo argomento · un'affermazione pertinente c'è (voto ≥ τo), ma non ne implica il fatto
 *   orfana         · nessuna affermazione pertinente
 * Uso: node affermazioni-risultato.mjs <cartella>
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2];
const leggi = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const { frasi, affermazioni } = leggi('affermazioni.json');
const { coppie } = leggi('coppie-nli.json');
const nli = leggi('nli.json');
const rer = leggi('voti-reranker.json');
if (nli.prob.length !== coppie.length) throw new Error('nli e coppie non combaciano');
coppie.forEach((c, i) => { c.p = nli.prob[i]; });

const V = {}, C = {};
coppie.forEach(c => { const m = c.tipo === 'V' ? V : C; (m[c.chiave] = m[c.chiave] || []).push(c); });

function corsia(a, tau) {
    if (a.organizzativa) return 'organizzativa';
    const pert = (V[a.id] || []).filter(c => c.voto >= tau);
    if (pert.some(c => c.p.contradiction >= 0.5)) return 'rossa';
    if (pert.some(c => c.p.entailment >= 0.5)) return 'verde';
    return 'grigia';
}
function copertura(f, tau) {
    const cc = C[f.id] || [];
    if (cc.some(c => c.p.entailment >= 0.5)) return 'coperta';
    if (cc.some(c => c.voto >= tau)) return 'solo argomento';
    return 'orfana';
}
const CORSIE = ['verde', 'grigia', 'rossa', 'organizzativa'];
const conta = (arr, f, chiavi) => { const o = Object.fromEntries(chiavi.map(k => [k, 0])); arr.forEach(x => { o[f(x)] = (o[f(x)] || 0) + 1; }); return o; };

const base = affermazioni.filter(a => a.versione === 'base');
const dopo = affermazioni.filter(a => a.versione === 'dopo');
const segnalate = esito => base.filter(a => a.segnalazioni.some(s => s.esito === esito));
const senzaSegnalazioni = base.filter(a => !a.segnalazioni.length);

const SOGLIE = [0.05, 0.2, 0.5];
const misure = SOGLIE.map(tau => {
    const c = a => corsia(a, tau);
    const fattuali = base.filter(a => !a.organizzativa);
    const car = arr => arr.reduce((s, a) => s + a.testo.length, 0);
    return {
        tau,
        tutte: conta(base, c, CORSIE),
        cambia: conta(segnalate('cambia'), c, CORSIE),
        invariato: conta(segnalate('invariato'), c, CORSIE),
        pending: conta(segnalate('pending'), c, CORSIE),
        senzaSegnalazioni: conta(senzaSegnalazioni, c, CORSIE),
        dopoCorrezione: conta(dopo, c, CORSIE),
        restaSeEscludoRosse: car(fattuali.filter(a => c(a) !== 'rossa')) / Math.max(1, car(fattuali)),
        restaSeEscludoRosseEGrigie: car(fattuali.filter(a => c(a) === 'verde')) / Math.max(1, car(fattuali)),
        orfane: conta(frasi, f => copertura(f, tau), ['coperta', 'solo argomento', 'orfana']),
    };
});

/* Il docente ha corretto: la frase contestata prima e le frasi scritte da lui dopo, sotto la soglia di mezzo */
const TAU = 0.2;
const transizioni = [];
segnalate('cambia').forEach(a => {
    a.segnalazioni.filter(s => s.esito === 'cambia').forEach(s => {
        const dd = dopo.filter(x => x.segnalazioni.some(y => y.id === s.id));
        transizioni.push({ prima: corsia(a, TAU), dopo: dd.map(x => corsia(x, TAU)), tipo: s.tipo, testoPrima: a.testo, testiDopo: dd.map(x => x.testo) });
    });
});

const f2 = x => x.toFixed(2);
const pc = x => Math.round(100 * x) + '%';
const riga = o => CORSIE.map(k => o[k] || 0).join(' / ');
const L = [];
L.push('# Strato delle affermazioni e frasi orfane — misura offline', '');
L.push(`Fonte: ${frasi.length} frasi di contenuto. Mappa come generata: ${base.length} affermazioni (le frasi delle desc), di cui ${base.filter(a => a.organizzativa).length} organizzative. ` +
    `Affermazioni scritte dal docente nelle correzioni: ${dopo.length}.`, '');
L.push(`Reranker ${rer.modello} (${rer.dispositivo}) e NLI ${nli.modello}, entrambi locali. Nessuna soglia è tarata: si mostrano tre valori di pertinenza τ.`, '');
L.push('## Corsie (verde / grigia / rossa / organizzativa)', '');
L.push('| τ | tutte | frasi contestate, poi corrette | contestate, lasciate così | contestate, non decise | mai contestate | frasi scritte dal docente | resta ai materiali escludendo le rosse | … e le grigie |', '|---:|---|---|---|---|---|---|---:|---:|');
misure.forEach(m => L.push(`| ${m.tau} | ${riga(m.tutte)} | ${riga(m.cambia)} | ${riga(m.invariato)} | ${riga(m.pending)} | ${riga(m.senzaSegnalazioni)} | ${riga(m.dopoCorrezione)} | ${pc(m.restaSeEscludoRosse)} | ${pc(m.restaSeEscludoRosseEGrigie)} |`));
L.push('', `## Prima e dopo la correzione del docente (τ = ${TAU})`, '', 'La frase che il Giudice contestava, e le frasi che il docente ha scritto al suo posto. Se il triage lavora bene, «prima» è spesso grigia o rossa e «dopo» verde.', '');
L.push('| tipo | prima | dopo | frase di prima | frase del docente |', '|---|---|---|---|---|');
transizioni.forEach(t => L.push(`| ${t.tipo} | ${t.prima} | ${t.dopo.join(', ') || '–'} | ${t.testoPrima.replace(/\|/g, '/').slice(0, 120)} | ${(t.testiDopo[0] || '').replace(/\|/g, '/').slice(0, 120)} |`));
L.push('', '## Frasi orfane (coperta / solo argomento / orfana)', '');
L.push('| τo | coperta | solo argomento | orfana |', '|---:|---:|---:|---:|');
misure.forEach(m => L.push(`| ${m.tau} | ${m.orfane.coperta} | ${m.orfane['solo argomento']} | ${m.orfane.orfana} |`));
L.push('', `### Le frasi non coperte nel fatto (τo = ${TAU})`, '', '| stato | pagina | frase | affermazione più vicina | voto |', '|---|---:|---|---|---:|');
frasi.forEach(f => {
    const s = copertura(f, TAU);
    if (s === 'coperta') return;
    const best = (C[f.id] || []).slice().sort((a, b) => b.voto - a.voto)[0];
    L.push(`| ${s} | ${f.page} | ${f.text.replace(/\|/g, '/').slice(0, 160)} | ${best ? best.premessa.replace(/\|/g, '/').slice(0, 100) : '–'} | ${best ? f2(best.voto) : '–'} |`);
});
L.push('', '## Limiti dichiarati', '',
    '- NLI piccolo (mDeBERTa base) al posto del verdetto di un modello linguistico: nell\'app il verdetto lo darebbe un modello del Setup. Qui fa da stima per difetto.',
    '- Le corsie non sono tarate: nessun numero qui va preso come soglia di prodotto.',
    '- La frase contestata è un\'approssimazione (il Giudice indica il nodo, non la frase).',
    '- Una fonte sola.');
fs.writeFileSync(path.join(DIR, 'RAPPORTO-affermazioni.md'), L.join('\n') + '\n');
fs.writeFileSync(path.join(DIR, 'misure-affermazioni.json'), JSON.stringify({ misure, transizioni }, null, 1));
misure.forEach(m => console.log(`τ ${m.tau}: tutte ${riga(m.tutte)} · corrette ${riga(m.cambia)} · lasciate ${riga(m.invariato)} · docente ${riga(m.dopoCorrezione)} · orfane ${JSON.stringify(m.orfane)}`));
