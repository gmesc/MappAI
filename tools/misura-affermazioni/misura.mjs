/* Misura offline della quarantena (packet 0042, ADR 0010) — 26/9/2026.
 *
 * Legge in SOLA LETTURA una COPIA del `pipeline.json` di un progetto con la
 * revisione dei contenuti in attesa e dice che cosa arriverebbe ai materiali
 * con la quarantena accesa. Niente rete, niente chiavi, niente AI: usa il core
 * vero (public/js/mappai-affermazioni-core.js) sulla mappa della revisione
 * (`review.baseSnapshot`, la mappa come l'ha vista il Giudice).
 *
 * Due stati:
 *   · «decisioni di oggi»  — la revisione com'è salvata;
 *   · «Banco mai aperto»   — tutte le segnalazioni del GIUDICE tornate da
 *                            decidere. Le decisioni di origine docente (le
 *                            parole dei collegamenti cambiate dall'editor)
 *                            restano: non nascono dal Banco.
 *
 * Per ogni stato: affermazioni per corsia; quota di testo che resta ai
 * materiali (caratteri delle frasi tenute / caratteri di tutte le frasi del
 * db corretto); nodi svuotati (su tutti i nodi della mappa, e perché); modi
 * del passo contestato (quanti 'nodo', quanti passi non ritrovati nel testo
 * corretto, quante segnalazioni superate dalla correzione); esclusioni per
 * coesione; nodi esaminati solo in giri precedenti del Giudice.
 * Poi le segnalazioni del Giudice già decise:
 *   · oggi — quante cadono su frasi escluse: per una correzione, le frasi che
 *     il docente ha scritto; per una conferma, le frasi del nodo che il
 *     problema tocca (il passo scelto, OPPURE una sovrapposizione di almeno
 *     0,5 in uno dei due sensi: il passo scelto alla cieca da solo sottostimava
 *     — giro 1 del 26/09, L1_1_L2_B_D2 confermata tre volte);
 *   · le frasi escluse oggi che il docente aveva davanti in una decisione sullo
 *     stesso nodo: tenute parola per parola nel testo di una correzione, o
 *     toccate da una conferma (ADR 0010: da far decidere a Giacomo se una
 *     decisione presa debba proteggerle);
 *   · Banco mai aperto — delle correzioni vere, quante hanno le frasi che il
 *     docente ha poi cambiato tutte fuori, in parte fuori, o dentro i
 *     materiali (la prova della localizzazione, ADR 0010 «riapertura»; la
 *     localizzazione nei due sensi si adotta solo se nessuna resta dentro);
 *   · la localizzazione alla cieca, modo per modo: la verità è la frase che
 *     il docente ha cambiato (RC.textChange fra `before` e il testo della
 *     decisione, allargato alle frasi intere); il passo scelto senza la
 *     decisione è «giusto» se la contiene tutta, «parziale» se ne contiene
 *     una parte, «perso» se non la tocca; «in più» conta le frasi escluse
 *     che la verità non chiedeva. Nella tabella dell'esattezza stanno solo i
 *     casi INFORMATIVI: fuori 'nodo' (giusto per costruzione), 'proposta' con
 *     la proposta accettata (verità e previsione vengono dallo stesso testo) e
 *     le desc di una frase sola; si contano a parte.
 * E le segnalazioni aperte in modo 'nodo': quante parlano con ogni
 * probabilità del testo di un ALTRO nodo (una sua frase sta nel problema per
 * almeno 0,5 e supera di almeno 0,2 la frase migliore del bersaglio) — il
 * 'nodo' toglie allora frasi giuste dal bersaglio e lascia dentro quella
 * contestata. Si misura e basta: la regola la decide Giacomo.
 * Giro 2 del 26/09: i casi «altrove» si separano in due — su testo del
 * docente o già deciso (la frase dell'altro nodo è della corsia del docente,
 * oppure il problema cita un testo di quel nodo che nel db corretto non c'è
 * più: una decisione l'ha già cambiato) e su testo non deciso; solo i secondi
 * sono frasi che una regola «altro nodo» potrebbe ancora togliere. E le frasi
 * escluse in modo 'nodo', una per una, con due indizi che si calcolano:
 *   · il problema non la tocca: meno di 0,3 di parole piene in comune nei due
 *     sensi, e nessun numero, data o nome della frase ripetuto nel problema;
 *   · il docente l'ha avuta davanti in una decisione sullo stesso nodo e l'ha
 *     tenuta parola per parola, o l'ha confermata.
 * «Innocente» resta una lettura di chi legge i problemi: gli indizi dicono dove
 * guardare, l'elenco serve a farla.
 * Giro 4 del 26/09 (E1): per ogni stato, le quasi-copie del passo contestato
 * escluse e le frasi del docente che escono perché lo ripetono; fra le
 * correzioni già decise, ogni frase del docente che esce, con la segnalazione
 * aperta che la toglie, il suo passo e il problema — si accetta solo se la
 * frase del docente ripete davvero un passo ancora contestato.
 * Giro 5 del 26/09 (F5): la ricerca del passo contestato per CONTENIMENTO
 * (passo→frase, soglia A.CONTENIMENTO, da sola o in coppia) nel bersaglio e nei
 * nodi cambiati da una decisione, e del frammento citato su tutta la mappa. Per
 * ogni stato: le esclusioni per contenimento e per frammento citato, riga per
 * riga, con il passo che la frase riprende e la quota; fra le correzioni già
 * decise, ogni frase del docente che esce, con la segnalazione aperta che la
 * toglie e il passo che riprende.
 * Giro 6 del 26/09 (G1): le esclusioni per modo, con quante sono frasi scritte
 * o ritoccate dal docente (in modo 'nodo' restano, quindi zero).
 * Giro 7 del 26/09: la versione delle regole (A.REGOLE); le misure sulle forme
 * normalizzate del core (NFKC, senza caratteri di formato, H2); fra le
 * esclusioni anche quelle prese soltanto dentro una finestra di due o tre
 * frasi (H1), quelle degli altri nodi di cui parla il problema di una 'nodo'
 * (H5, via 'problema') e le frasi del docente escluse in modo 'nodo' perché
 * contengono parola per parola una frase base del nodo segnalato (H6); le
 * segnalazioni «docente-in-parte» (H10).
 * Infine le soglie del packet: almeno il 70% del testo con le decisioni di
 * oggi, al più il 10% di nodi svuotati.
 *
 * Uso:
 *   node tools/misura-affermazioni/misura.mjs --pipeline <copia di pipeline.json> [--json <file di uscita>]
 *   node tools/misura-affermazioni/misura.mjs --orfane --pipeline <copia di pipeline.json> [--json <file di uscita>]
 * Il file di uscita va in una cartella di lavoro, mai nel vault né nel repo.
 *
 * `--orfane` (packet 0041, 27/9/2026): al posto della quarantena, le frasi della
 * FONTE rimaste fuori dalla mappa — coperte / con elementi mancanti / orfane —
 * con `A.frasiOrfane` (regola v2 del 27/09) sulle frasi di
 * `A.frasiFonte(review.sources)` e sulle affermazioni e i titoli della mappa della
 * revisione (`review.baseSnapshot`: finché la revisione è allineata è la mappa
 * viva). Senza il tetto di 12 per gruppo dell'interfaccia: ogni riga, con
 * pagina, frase, contenimento, nodo vicino ed elementi mancanti. E la soglia
 * del packet: più di 24 righe fra orfane e con elementi
 * mancanti = condizione di stop (la soglia o gli elementi chiave vanno rivisti).
 * Giro di correzione del 27/09: le frasi con `minParole: A.MIN_PAROLE_ORFANE`
 * (le voci d'elenco corte), la frase corta confrontata con UNA affermazione e il
 * nodo vicino solo con almeno due parole piene non generiche in comune; la
 * misura conta anche le frasi in più rispetto a `frasiFonte` di sempre.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const A = require(path.join(RADICE, 'public/js/mappai-affermazioni-core.js'));
const RC = require(path.join(RADICE, 'public/js/mappai-review-core.js'));
const DC = require(path.join(RADICE, 'public/js/mappai-deepen-core.js'));
/* quota delle parole piene di `a` che stanno in `b` (la misura della sovrapposizione del core, sulle
   forme normalizzate come nel core dal giro 7, H2) */
const quota = (a, b) => DC.lexicalOverlap(A.normalizza(a), A.normalizza(b)).containment;

function argomento(nome) {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : null;
}
const PIPE = argomento('--pipeline'), USCITA = argomento('--json'), ORFANE = process.argv.includes('--orfane');
if (!PIPE) {
  console.error('Uso: node tools/misura-affermazioni/misura.mjs [--orfane] --pipeline <copia di pipeline.json> [--json <file di uscita>]');
  process.exit(2);
}
if (USCITA && path.resolve(USCITA).startsWith(RADICE + path.sep)) {
  console.error('Il file di uscita non va nel repo: scegli una cartella di lavoro.');
  process.exit(2);
}

const manifest = JSON.parse(fs.readFileSync(PIPE, 'utf8'));
const review = manifest.review;
if (!review || review.schema !== RC.SCHEMA || !review.initial) { console.error('Nessuna revisione valida nel manifesto.'); process.exit(1); }
if (review.initial.status !== 'awaiting_review') console.warn('⚠️ La revisione è «' + review.initial.status + '»: la quarantena vale solo in attesa.');
const db = review.baseSnapshot;
const dec = review.initial.decisions || {};
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '—';
const etichetta = id => (db.nodes.find(n => n.id === id) || {}).label || id;

/* ── --orfane (packet 0041): le frasi della fonte rimaste fuori dalla mappa ── */
if (ORFANE) {
  const t0 = process.hrtime.bigint();
  const frasi = A.frasiFonte(review.sources, { minParole: A.MIN_PAROLE_ORFANE });
  const base = new Set(A.frasiFonte(review.sources).map(f => f.id));
  const affs = A.affermazioniDb(db);
  const o = A.frasiOrfane({ frasi, affs, etichette: db.nodes.map(n => n.label), max: Infinity });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const righe = o.totali.mancanti + o.totali.orfane;
  console.log('# Frasi della fonte rimaste fuori dalla mappa — misura offline su ' + path.basename(PIPE) + ' · regola v2 (unione delle ' +
    A.VICINE_ORFANE + ' affermazioni più vicine, contenimento ≥ ' + A.SOGLIA_ORFANE + '; con al più ' + A.CORTA_ORFANE +
    ' parole piene una sola affermazione; nodo vicino con almeno ' + A.COMUNI_NODO + ' parole piene non generiche in comune)');
  const inPiu = frasi.filter(f => !base.has(f.id));
  console.log('Frasi della fonte: ' + frasi.length + ' (almeno ' + A.MIN_PAROLE_ORFANE + ' parole piene; ' + inPiu.length + ' in più delle ' + base.size +
    ' di `frasiFonte`) · affermazioni della mappa: ' + affs.length + ' (nodi ' + db.nodes.length + ') · calcolo ' + ms.toFixed(0) + ' ms');
  inPiu.forEach(f => console.log('  + p. ' + f.page + ' — «' + f.text + '»'));
  console.log('Coperte ' + o.coperte + ' · con elementi mancanti ' + o.totali.mancanti + ' · orfane ' + o.totali.orfane);
  const nodo = id => id == null ? '—' : id + ' «' + etichetta(id) + '»';
  const manca = r => r.elementi.length ? r.elementiTesto.join(', ') + '  [' + r.elementi.join(', ') + ']' : '—';
  console.log('\n## Con elementi mancanti (' + o.totali.mancanti + ')');
  o.mancanti.forEach(r => console.log('  · p. ' + r.page + ' — «' + r.text + '» (contenimento ' + r.contenimento.toFixed(2) + ')\n      nodo vicino: ' + nodo(r.nodoVicino) +
    '\n      affermazione vicina: «' + r.affermazioneVicina + '»\n      nella mappa manca: ' + manca(r)));
  console.log('\n## Orfane (' + o.totali.orfane + ')');
  o.orfane.forEach(r => console.log('  · p. ' + r.page + ' — «' + r.text + '» (contenimento ' + r.contenimento.toFixed(2) + ')\n      nodo vicino: ' + nodo(r.nodoVicino) +
    '\n      nella mappa manca: ' + manca(r)));
  console.log('\n## Soglia del packet');
  console.log('Righe fra orfane e con elementi mancanti: ' + righe + ' → ' + (righe > 24 ? 'NON regge (> 24): condizione di stop' : 'regge (≤ 24)'));
  if (USCITA) {
    fs.writeFileSync(USCITA, JSON.stringify({ pipeline: path.basename(PIPE), regole: A.REGOLE, frasi: frasi.map(f => ({ id: f.id, page: f.page, text: f.text })), risultato: o }, null, 1));
    console.log('\nDettaglio: ' + USCITA);
  }
  process.exit(0);
}

function senzaDecisioniDelGiudice(r) {
  const c = JSON.parse(JSON.stringify(r));
  delete c.quarantena;
  c.initial.issues.forEach(i => { if (i.origin !== 'teacher') delete c.initial.decisions[i.id]; });
  return c;
}

function misura(nome, rev) {
  const adesso = new Date().toISOString();
  const rec = A.record(rev, db, { adesso });
  const c = A.corsie({ review: rev, db });
  const nodiConTesto = db.nodes.filter(n => String(n.desc || n.content || '').trim()).length;
  const nonEs = new Set(c.nonEsaminati);
  const svuotati = (rec.svuotati || []).map(id => {
    const righe = c.righe.filter(r => r.nodeId === id);
    const perche = nonEs.has(id) ? 'non esaminato' : [...new Set(righe.map(r => r.corsia + (r.issueId ? ' ' + r.issueId.slice(0, 14) : '')))].join(', ');
    return { id, label: etichetta(id), perche };
  });
  return { nome, rev, rec, c, nodiConTesto, svuotati };
}

const oggi = misura('decisioni di oggi', review);
const mai = misura('Banco mai aperto', senzaDecisioniDelGiudice(review));

/* ── le segnalazioni del Giudice già decise ── */
const decise = review.initial.issues.filter(i => i.origin !== 'teacher' && i.target.kind === 'node' && i.target.field === 'desc' &&
  RC.decisionOutcome(i, dec[i.id]) !== 'pending');
const fuori = (st, nodeId, impronte) => {
  const righe = st.c.righe.filter(r => r.nodeId === nodeId && impronte.has(r.impronta));
  return { righe: righe.length, fuori: righe.filter(r => A.FUORI.includes(r.corsia)).length };
};
const frasiToccate = (before, passo) => new Set(A.affermazioni(before)
  .filter(a => passo.passi.some(p => p.start === p.end ? p.start >= a.start && p.start <= a.end : p.start < a.end && p.end > a.start))
  .map(a => a.impronta));
/* le frasi di `before` che il problema tocca: quelle del passo, e quelle con una sovrapposizione di almeno
   0,5 in uno dei due sensi (frase nel problema, problema nella frase) */
const frasiDelProblema = (i, passo) => {
  const before = typeof i.before === 'string' ? i.before : '', problema = String(i.problem || '');
  const out = frasiToccate(before, passo);
  if (problema.trim()) A.affermazioni(before).forEach(a => {
    if (quota(a.testo, problema) >= 0.5 || quota(problema, a.testo) >= 0.5) out.add(a.impronta);
  });
  return out;
};
/* il passo che una riga esclusa riprende (giro 5): il frammento citato, oppure la frase base con il
   contenimento più alto (passo→frase, la misura del core) fra quelle che il record le attribuisce */
function ripreso(r, passo) {
  if (r.via === 'frammento' && passo && passo.frammenti && passo.frammenti.length) {
    const f = passo.frammenti.find(x => A.normalizza(r.testo).toLowerCase().replace(/[’]/g, "'").includes(A.normalizza(x).toLowerCase().replace(/[’]/g, "'"))) || passo.frammenti[0];
    return { passo: '«' + f + '» (frammento citato)', q: 1 };
  }
  const basi = (r.passi && r.passi.length) ? r.passi : r.via === 'frase' ? [r.testo]
    : passo ? (passo.modo === 'nodo' ? A.affermazioni(passo.passi[0].testo).map(a => a.testo) : passo.passi.flatMap(p => A.affermazioni(p.testo).map(a => a.testo))) : [];
  // presa solo in coppia con la frase accanto (la frase spezzata in due): il contenimento è della coppia
  const testo = r.coppia ? r.testo + ' ' + r.coppia : r.testo;
  const m = basi.map(t => ({ t, q: A.contenimento(t, testo) })).sort((x, y) => y.q - x.q)[0];
  return m ? { passo: m.t, q: Math.round(m.q * 100) / 100, coppia: r.coppia || null } : { passo: null, q: null, coppia: null };
}
const esitoDecise = { oggi: { cambiate: 0, cambiateFuori: 0, cambiateTutteFuori: 0, confermate: 0, confermateFuori: 0, confermateFuoriPasso: 0, nonRitrovate: 0, docenteFuori: [] },
  mai: { cambiate: 0, tutteFuori: 0, inParte: 0, dentro: 0, nonRitrovate: 0, modoCieco: {} } };
decise.forEach(i => {
  const d = dec[i.id], before = typeof i.before === 'string' ? i.before : '';
  if (A.confermata(i, d)) {
    esitoDecise.oggi.confermate++;
    const passo = A.passoContestato(i, d);
    const f = fuori(oggi, i.target.id, frasiDelProblema(i, passo)), fp = fuori(oggi, i.target.id, frasiToccate(before, passo));
    if (!f.righe) esitoDecise.oggi.nonRitrovate++;
    else if (f.fuori) esitoDecise.oggi.confermateFuori++;
    if (fp.fuori) esitoDecise.oggi.confermateFuoriPasso++;
    return;
  }
  // una correzione: oggi contano le frasi che il docente ha scritto
  esitoDecise.oggi.cambiate++;
  const dopo = d.choice === 'manual' ? d.text : i.after;
  const prima = new Set(A.affermazioni(before).map(a => a.impronta));
  const scritte = new Set(A.affermazioni(dopo).map(a => a.impronta).filter(x => !prima.has(x)));
  const fo = fuori(oggi, i.target.id, scritte);
  if (!fo.righe) esitoDecise.oggi.nonRitrovate++;
  else { if (fo.fuori) esitoDecise.oggi.cambiateFuori++; if (fo.fuori === fo.righe) esitoDecise.oggi.cambiateTutteFuori++; }
  /* giro 4 (E1): le frasi del docente che escono, una per una, con la segnalazione aperta che le toglie e il
     suo passo — si accettano SOLO se la frase del docente ripete davvero un passo ancora contestato */
  oggi.c.righe.filter(r => r.nodeId === i.target.id && scritte.has(r.impronta) && A.FUORI.includes(r.corsia)).forEach(r => {
    const aperta = review.initial.issues.find(x => x.id === r.issueId);
    const passo = aperta ? A.passoContestato(aperta, dec[aperta.id]) : null;
    const rip = ripreso(r, passo);
    esitoDecise.oggi.docenteFuori.push({ correzione: i.id, nodeId: i.target.id, scelta: d.choice, frase: r.testo, corsia: r.corsia,
      via: r.via || null, apertaDa: r.issueId, modo: passo ? passo.modo : null, passo: rip.passo, contenimento: rip.q, coppia: rip.coppia,
      problema: aperta ? String(aperta.problem || '') : null });
  });
  // Banco mai aperto: le frasi che il docente ha poi cambiato, nella mappa non rivista
  esitoDecise.mai.cambiate++;
  const cieco = A.passoContestato(i).modo;
  esitoDecise.mai.modoCieco[cieco] = (esitoDecise.mai.modoCieco[cieco] || 0) + 1;
  const vere = frasiToccate(before, A.passoContestato(i, d));
  const fm = fuori(mai, i.target.id, vere);
  if (!fm.righe) esitoDecise.mai.nonRitrovate++;
  else if (fm.fuori === fm.righe) esitoDecise.mai.tutteFuori++;
  else if (fm.fuori) esitoDecise.mai.inParte++;
  else esitoDecise.mai.dentro++;
});

/* ── le frasi escluse oggi che il docente aveva davanti in una decisione sullo stesso nodo ── */
const davanti = { escluse: 0, tenute: 0, confermate: 0, almenoUna: 0, casi: [] };
oggi.c.righe.filter(r => A.FUORI.includes(r.corsia)).forEach(r => {
  davanti.escluse++;
  let tenuta = false, confermata = false;
  review.initial.issues.filter(i => i.target.kind === 'node' && i.target.field === 'desc' && i.target.id === r.nodeId &&
    RC.decisionOutcome(i, dec[i.id]) !== 'pending').forEach(i => {
    const d = dec[i.id];
    if (A.confermata(i, d)) { if (frasiDelProblema(i, A.passoContestato(i, d)).has(r.impronta)) confermata = true; return; }
    const dopo = d.choice === 'manual' ? d.text : i.after;
    if (typeof dopo === 'string' && A.affermazioni(dopo).some(a => a.impronta === r.impronta)) tenuta = true;
  });
  if (tenuta) davanti.tenute++;
  if (confermata) davanti.confermate++;
  if (tenuta || confermata) { davanti.almenoUna++; davanti.casi.push({ nodeId: r.nodeId, indice: r.indice, tenuta, confermata, testo: r.testo }); }
});

/* ── la localizzazione alla cieca, modo per modo, sulle correzioni vere ── */
const localizzazione = { righe: {}, casi: [], nonInformativi: { nodo: 0, nodoInPiu: 0, propostaAccettata: 0, unaFrase: 0 } };
decise.filter(i => !A.confermata(i, dec[i.id])).forEach(i => {
  const before = typeof i.before === 'string' ? i.before : '', d = dec[i.id];
  const vere = frasiToccate(before, A.passoContestato(i, d));
  const p = A.passoContestato(i), scelte = frasiToccate(before, p);
  const chiave = p.modo + (p.verso ? ' (verso ' + p.verso + ')' : '');
  const prese = [...vere].filter(x => scelte.has(x)).length, inPiu = [...scelte].filter(x => !vere.has(x)).length;
  const esito = prese === vere.size ? 'giuste' : prese ? 'parziali' : 'perse';
  const frasiNodo = A.affermazioni(before).length;
  // i casi giusti per costruzione non dicono niente sull'esattezza
  const perche = p.modo === 'nodo' ? 'nodo' : (p.modo === 'proposta' && d && d.choice === 'accept') ? 'propostaAccettata' : frasiNodo <= 1 ? 'unaFrase' : '';
  const indici = set => A.affermazioni(before).filter(a => set.has(a.impronta)).map(a => a.indice);
  localizzazione.casi.push({ issueId: i.id, nodeId: i.target.id, modo: p.modo, verso: p.verso || null, troncato: A.troncato(i.problem),
    frasiNodo, verita: indici(vere), passo: indici(scelte), inPiu, esito, informativo: !perche, nonInformativoPerche: perche || null });
  if (perche) {
    localizzazione.nonInformativi[perche]++;
    if (perche === 'nodo') localizzazione.nonInformativi.nodoInPiu += inPiu;
    return;
  }
  const t = localizzazione.righe[chiave] = localizzazione.righe[chiave] || { casi: 0, giuste: 0, parziali: 0, perse: 0, inPiu: 0 };
  t.casi++; t[esito]++; t.inPiu += inPiu;
});
const versoProblema = localizzazione.casi.filter(x => x.verso === 'problema');
localizzazione.versoProblema = { casi: versoProblema.length, nonGiusti: versoProblema.filter(x => x.esito !== 'giuste').length };

/* ── le segnalazioni aperte in modo 'nodo': parlano del testo di un altro nodo? ── */
function nodoAltrove(st) {
  const rev = st.rev, decisioni = rev.initial.decisions || {};
  const perNodo = {};
  st.c.righe.forEach(r => { (perNodo[r.nodeId] = perNodo[r.nodeId] || []).push(r); });
  // anche le 'nodo' che non tolgono niente (il nodo ha solo frasi del docente): la frase contestata altrove resta dentro lo stesso
  const nonEs = new Set(st.c.nonEsaminati), superate = new Set(st.c.superate);
  const ids = new Set(st.c.righe.filter(r => r.modo === 'nodo' && r.issueId).map(r => r.issueId));
  rev.initial.issues.forEach(i => {
    if (i.target.kind !== 'node' || i.target.field !== 'desc' || nonEs.has(String(i.target.id)) || superate.has(i.id)) return;
    if (RC.decisionOutcome(i, decisioni[i.id]) === 'pending' && A.passoContestato(i, decisioni[i.id]).modo === 'nodo') ids.add(i.id);
  });
  const casi = rev.initial.issues.filter(i => ids.has(i.id) && RC.decisionOutcome(i, decisioni[i.id]) === 'pending').map(i => {
    const problema = String(i.problem || ''), bersaglio = String(i.target.id);
    const migliore = righe => righe.reduce((m, r) => { const q = quota(r.testo, problema); return q > m.q ? { q, r } : m; }, { q: 0, r: null });
    const suo = migliore(perNodo[bersaglio] || []);
    const altro = Object.keys(perNodo).filter(id => id !== bersaglio)
      .reduce((m, id) => { const x = migliore(perNodo[id]); return x.q > m.q ? Object.assign(x, { nodeId: id }) : m; }, { q: 0, r: null, nodeId: null });
    const escluseQui = (perNodo[bersaglio] || []).filter(r => A.FUORI.includes(r.corsia) && r.issueId === i.id);
    /* il problema cita un testo di un altro nodo che una decisione ha già cambiato? la frase migliore
       fra quelle della mappa di BASE che nel db corretto di quel nodo non ci sono più */
    const corrette = new Set(st.c.righe.map(r => r.nodeId + '|' + r.impronta));
    const giaDeciso = db.nodes.filter(n => String(n.id) !== bersaglio).reduce((m, n) => {
      A.affermazioni(String(n.desc || n.content || '')).forEach(a => {
        if (corrette.has(String(n.id) + '|' + a.impronta)) return;
        const q = quota(a.testo, problema);
        if (q > m.q) m = { q, nodeId: String(n.id), testo: a.testo };
      });
      return m;
    }, { q: 0, nodeId: null, testo: null });
    const altrove = altro.q >= 0.5 && altro.q - suo.q >= 0.2 - 1e-9;
    const giaDecisoAltrove = giaDeciso.q >= 0.5 && giaDeciso.q - suo.q >= 0.2 - 1e-9;
    const suTestoDecisoODelDocente = (altrove && altro.r && altro.r.corsia === 'docente') || giaDecisoAltrove;
    return { issueId: i.id, bersaglio, quotaBersaglio: Math.round(suo.q * 100) / 100, altroNodo: altro.nodeId,
      quotaAltro: Math.round(altro.q * 100) / 100, fraseAltro: altro.r ? altro.r.testo : null,
      fraseAltroFuori: !!(altro.r && A.FUORI.includes(altro.r.corsia)), fraseAltroCorsia: altro.r ? altro.r.corsia : null,
      giaDeciso: giaDecisoAltrove ? { nodeId: giaDeciso.nodeId, quota: Math.round(giaDeciso.q * 100) / 100, testo: giaDeciso.testo } : null,
      frasiEscluseQui: escluseQui.length, caratteriEsclusiQui: escluseQui.reduce((s, r) => s + A.normalizza(r.testo).length, 0),
      altrove: altrove || giaDecisoAltrove, altroveNelTestoCorretto: altrove,
      tipo: !(altrove || giaDecisoAltrove) ? null : suTestoDecisoODelDocente ? 'docente-o-deciso' : 'non-deciso' };
  });
  return { casi, altrove: casi.filter(x => x.altrove).length,
    docenteODeciso: casi.filter(x => x.tipo === 'docente-o-deciso').length, nonDeciso: casi.filter(x => x.tipo === 'non-deciso').length };
}

/* ── le frasi escluse in modo 'nodo', con gli indizi di innocenza ── */
const piatto = t => String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/(\d)[.'’  ](?=\d{3}(?!\d))/g, '$1');
function frasiNodo(st) {
  const rev = st.rev, decisioni = rev.initial.decisions || {};
  const perId = new Map(rev.initial.issues.map(i => [i.id, i]));
  const righe = st.c.righe.filter(r => A.FUORI.includes(r.corsia) && r.modo === 'nodo' && r.issueId);
  const casi = righe.map(r => {
    const i = perId.get(r.issueId) || {}, problema = String(i.problem || '');
    const fp = quota(r.testo, problema), pf = quota(problema, r.testo);
    const pp = piatto(problema);
    const ripetuti = A.elementiChiave(r.testo).filter(e => new RegExp('(^|[^a-z0-9])' + e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])').test(pp));
    const nonToccata = fp < 0.3 && pf < 0.3 && !ripetuti.length;
    let tenuta = false, confermata = false;
    rev.initial.issues.filter(x => x.target.kind === 'node' && x.target.field === 'desc' && String(x.target.id) === r.nodeId &&
      RC.decisionOutcome(x, decisioni[x.id]) !== 'pending').forEach(x => {
      const d = decisioni[x.id];
      if (A.confermata(x, d)) { if (frasiDelProblema(x, A.passoContestato(x, d)).has(r.impronta)) confermata = true; return; }
      const dopo = d.choice === 'manual' ? d.text : x.after;
      if (typeof dopo === 'string' && A.affermazioni(dopo).some(a => a.impronta === r.impronta)) tenuta = true;
    });
    return { nodeId: r.nodeId, indice: r.indice, issueId: r.issueId, troncato: A.troncato(problema), testo: r.testo,
      caratteri: A.normalizza(r.testo).length, frasePb: Math.round(fp * 100) / 100, pbFrase: Math.round(pf * 100) / 100,
      elementiRipetuti: ripetuti, nonToccata, tenutaODocente: tenuta || confermata };
  });
  const somma = xs => xs.reduce((s, x) => s + x.caratteri, 0);
  return { casi, frasi: casi.length, caratteri: somma(casi),
    nonToccate: casi.filter(x => x.nonToccata).length, caratteriNonToccate: somma(casi.filter(x => x.nonToccata)),
    tenute: casi.filter(x => x.tenutaODocente).length,
    almenoUnIndizio: casi.filter(x => x.nonToccata || x.tenutaODocente).length, caratteriAlmenoUnIndizio: somma(casi.filter(x => x.nonToccata || x.tenutaODocente)),
    daProblemaTroncato: casi.filter(x => x.troncato).length };
}
const nodoOggi = nodoAltrove(oggi), nodoMai = nodoAltrove(mai);

/* ── il rapporto ── */
function stampa(st) {
  const k = st.rec.conteggi;
  console.log('\n## ' + st.nome + (st.rec.completo ? '' : '  ⚠️ record incompleto: ' + st.rec.motivo));
  if (!k) return;
  console.log('Affermazioni: ' + k.affermazioni);
  console.log('  restano — con una frase vicina ' + k.vicine + ' · senza frase vicina ' + k.senza + ' · di servizio ' + k.servizio + ' · cambiate con una decisione del docente ' + k.docente);
  console.log('  fuori   — non esaminate ' + k.fuori.nonEsaminate + ' · segnalazioni del Giudice ' + k.fuori.giudice + ' · segnalazioni del docente ' + k.fuori.docente + ' · per coesione ' + k.fuori.coesione + '  (totale ' + k.fuori.totale + ')');
  console.log('Testo ai materiali: ' + k.caratteri.tenuti + ' / ' + k.caratteri.totali + ' caratteri = ' + pct(k.caratteri.tenuti, k.caratteri.totali));
  const perNonEs = st.svuotati.filter(s => s.perche === 'non esaminato').length;
  console.log('Nodi svuotati: ' + st.svuotati.length + ' su ' + db.nodes.length + ' = ' + pct(st.svuotati.length, db.nodes.length) +
    ' (' + perNonEs + ' non esaminati, ' + (st.svuotati.length - perNonEs) + ' per segnalazioni aperte; nodi con testo: ' + st.nodiConTesto + ')');
  st.svuotati.forEach(s => console.log('  · ' + s.id + ' «' + s.label + '» — ' + s.perche));
  console.log('Segnalazioni aperte sulle desc: ' + st.c.pendentiDesc + '; modi del passo contestato (nodi esaminati): ' +
    Object.entries(k.modi).map(([m, n]) => m + ' ' + n).join(' · ') + '; passi non ritrovati nel testo corretto: ' + k.passiNonRitrovati +
    ', di cui superati dalla correzione del docente: ' + k.superate + (st.c.superate.length ? ' (' + st.c.superate.map(id => {
      const i = review.initial.issues.find(x => x.id === id); return i ? i.target.id : id;
    }).join(', ') + ')' : ''));
  const esiti = Object.values(st.c.esitiSegnalazioni || {}), quanti = e => esiti.filter(x => x === e).length;
  console.log('Segnalazioni aperte sulle desc che non tolgono niente dai materiali: ' + (quanti('superata') + quanti('docente') + quanti('docente-in-parte') + quanti('vuoto')) +
    ' (superate dalla correzione ' + quanti('superata') + ' · su un nodo in modo \'nodo\' col testo tutto del docente ' + quanti('docente') +
    ' · come sopra, ma con una parte del nodo fuori per un\'altra segnalazione ' + quanti('docente-in-parte') + ' · su un nodo senza testo ' + quanti('vuoto') +
    '); tolgono almeno una frase: ' + (quanti('fuori') + quanti('ritoccata')) + ' (di cui con una frase ritoccata dal docente che ripete ancora il passo: ' + quanti('ritoccata') + ')');
  console.log('Esclusioni per contenimento (soglia ' + A.CONTENIMENTO + ', passo→frase, da sola o in una finestra di 2-3 frasi): ' + (k.perContenimento || 0) +
    ' (di cui prese solo dentro una finestra: ' + (k.perFinestra || 0) + ') · per frammento citato: ' + (k.perFrammento || 0) +
    ' · in un altro nodo di cui parla il problema di una \'nodo\' (H5): ' + (k.perProblema || 0) +
    ' · frasi del docente escluse (riprendono il passo, o in \'nodo\' contengono una frase base): ' + (k.ritoccate || 0));
  /* giro 6 (G1): le esclusioni per modo — per le frasi contestate l'ambito con cui sono uscite, per le altre
     la corsia — e fra queste quelle scritte o ritoccate dal docente: con 'nodo' devono essere zero */
  const perModo = {};
  st.c.righe.filter(r => A.FUORI.includes(r.corsia)).forEach(r => {
    const m = r.corsia === A.CORSIE.CONTESTATA ? (r.modo || '?') : r.corsia.replace(/^fuori-/, '');
    const x = perModo[m] = perModo[m] || { frasi: 0, docente: 0 };
    x.frasi++; if (r.ritoccata) x.docente++;
  });
  console.log('Esclusioni per modo: ' + Object.entries(perModo).map(([m, x]) => m + ' ' + x.frasi + ' (del docente ' + x.docente + ')').join(' · '));
  const perId = new Map(st.rev.initial.issues.map(i => [i.id, i]));
  st.c.righe.filter(r => A.FUORI.includes(r.corsia) && (r.via === 'contenimento' || r.via === 'frammento' || r.via === 'problema' || r.ritoccata)).forEach(r => {
    const i = perId.get(r.issueId), passo = i ? A.passoContestato(i, (st.rev.initial.decisions || {})[i.id]) : null, rip = ripreso(r, passo);
    console.log('  · ' + r.nodeId + ' ' + (r.issueId || '').slice(0, 14) + (i && String(i.target.id) !== r.nodeId ? ' (su ' + i.target.id + ')' : '') +
      ' ' + (r.via || 'nodo') + (r.modo === 'nodo' ? ' (modo nodo)' : '') + (r.ritoccata ? ', del docente' : '') + (rip.q != null && r.via !== 'frammento' && r.via !== 'problema' ? ' ' + rip.q.toFixed(2) : '') +
      (r.via === 'problema' && i ? ' ' + quota(r.testo, i.problem).toFixed(2) + ' delle sue parole piene nel problema' : '') +
      (rip.coppia ? ' IN COPPIA con «' + rip.coppia + '»' : '') +
      '\n      frase: «' + r.testo + '»\n      ' + (r.via === 'problema' && i ? 'problema: «' + String(i.problem || '') + '»' : 'passo: ' + (rip.passo && r.via !== 'frammento' ? '«' + rip.passo + '»' : rip.passo || '—')));
  });
  console.log('Esclusioni per coesione: ' + k.coesione + ' · collegamenti esclusi: ' + k.linkEsclusi + ' (di cui mai esaminati dal Giudice: ' + (k.linkNonEsaminati || 0) +
    (st.rec.linkEsclusi || []).filter(l => l.origine === 'copertura').map(l => ' ' + l.source + ' —' + l.rel + '→ ' + l.target).join(',') + ')' +
    ' · documento dei nessi scartato: ' + (st.rec.causalDocScartato ? 'sì (' + (st.rec.causalDocMotivo || '?') + ')' : 'no') + ' · etichette segnalate: ' + st.rec.etichetteSegnalate + ' · frasi della fonte: ' + st.rec.frasiFonte);
  const nd = st.nodo;
  console.log('Segnalazioni aperte in modo \'nodo\': ' + nd.casi.length + '; con ogni probabilità sul testo di un ALTRO nodo (una sua frase sta nel problema per ≥0,5 e ≥0,2 sopra il bersaglio): ' + nd.altrove +
    ' — su testo del docente o già deciso: ' + nd.docenteODeciso + ' · su testo non deciso: ' + nd.nonDeciso +
    ' — frasi escluse dal bersaglio per queste: ' + nd.casi.filter(x => x.altrove).reduce((s, x) => s + x.frasiEscluseQui, 0) +
    ' (' + nd.casi.filter(x => x.altrove).reduce((s, x) => s + x.caratteriEsclusiQui, 0) + ' caratteri), frasi dell\'altro nodo che restano dentro: ' +
    nd.casi.filter(x => x.altroveNelTestoCorretto && !x.fraseAltroFuori).length + ' (di cui su testo non deciso: ' + nd.casi.filter(x => x.tipo === 'non-deciso' && !x.fraseAltroFuori).length + ')');
  nd.casi.forEach(x => console.log('  · ' + x.issueId.slice(0, 14) + ' su ' + x.bersaglio + ' ' + x.quotaBersaglio.toFixed(2) + ' · migliore altrove ' + x.altroNodo + ' ' + x.quotaAltro.toFixed(2) +
    (x.altrove ? ' → ALTROVE ' + (x.tipo === 'docente-o-deciso' ? '[testo del docente o già deciso' + (x.giaDeciso ? ': cita «' + String(x.giaDeciso.testo).slice(0, 50) + '…» di ' + x.giaDeciso.nodeId + ', che non c\'è più' : ', corsia ' + x.fraseAltroCorsia) + ']'
      : '[testo non deciso]') + (x.fraseAltroFuori || !x.altroveNelTestoCorretto ? '' : ' (dentro): «' + String(x.fraseAltro).slice(0, 70) + '…»') : '')));
  const fn = st.frasiNodo;
  console.log('Frasi escluse in modo \'nodo\': ' + fn.frasi + ' (' + fn.caratteri + ' caratteri, ' + pct(fn.caratteri, st.rec.conteggi.caratteri.totali) + ' del testo; ' + fn.daProblemaTroncato + ' da un problema troncato)' +
    ' — che il problema non tocca: ' + fn.nonToccate + ' (' + fn.caratteriNonToccate + ' car) · tenute o confermate dal docente sullo stesso nodo: ' + fn.tenute +
    ' · con almeno un indizio di innocenza: ' + fn.almenoUnIndizio + ' (' + fn.caratteriAlmenoUnIndizio + ' car). «Innocente» è una lettura: l\'elenco serve a farla.');
  fn.casi.forEach(x => console.log('  · ' + x.nodeId + '[' + x.indice + '] ' + x.issueId.slice(0, 14) + (x.troncato ? ' (troncato)' : '') +
    ' f→p ' + x.frasePb.toFixed(2) + ' p→f ' + x.pbFrase.toFixed(2) + (x.elementiRipetuti.length ? ' ripete ' + x.elementiRipetuti.join(',') : '') +
    (x.nonToccata ? ' · NON TOCCATA' : '') + (x.tenutaODocente ? ' · TENUTA DAL DOCENTE' : '') + ' — ' + x.testo.slice(0, 80)));
}
oggi.nodo = nodoOggi; mai.nodo = nodoMai;
oggi.frasiNodo = frasiNodo(oggi); mai.frasiNodo = frasiNodo(mai);
const giri = 1 + (review.initial.previousReports || []).length;
console.log('# Quarantena — misura offline su ' + path.basename(PIPE) + ' · regole ' + A.REGOLE);
console.log('Nodi ' + db.nodes.length + ' · segnalazioni ' + review.initial.issues.length + ' · decisioni ' + Object.keys(dec).length +
  ' · controllo ' + review.initial.checkStatus + ' · giri del Giudice ' + giri + ' · esaminati ' + oggi.c.esaminati.length +
  ' (di cui solo in giri precedenti ' + oggi.c.daGiriPrecedenti.length + ') · non esaminati in nessun giro ' + oggi.c.nonEsaminati.length);
stampa(oggi);
stampa(mai);
const o = esitoDecise.oggi, m = esitoDecise.mai;
console.log('\n## Le ' + decise.length + ' segnalazioni del Giudice già decise');
console.log('Oggi, su frasi escluse: ' + (o.cambiateFuori + o.confermateFuori) + ' su ' + decise.length +
  ' — correzioni ' + o.cambiateFuori + ' su ' + o.cambiate + ' (tutte le frasi del docente fuori: ' + o.cambiateTutteFuori + '), conferme ' + o.confermateFuori + ' su ' + o.confermate +
  ' (frasi toccate dal problema con sovrapposizione ≥0,5 in un verso o nel passo; col solo passo scelto alla cieca: ' + o.confermateFuoriPasso + ')' +
  (o.nonRitrovate ? '; non ritrovate nel testo corretto: ' + o.nonRitrovate : ''));
const correzioniConFrasiFuori = new Set(o.docenteFuori.map(x => x.correzione));
console.log('Correzioni del docente con almeno una sua frase esclusa (giro 5, F5): ' + correzioniConFrasiFuori.size + ' su ' + o.cambiate +
  ' · frasi del docente escluse, diverse: ' + new Set(o.docenteFuori.map(x => x.nodeId + '|' + x.frase)).size +
  ' (' + o.docenteFuori.length + ' righe: due correzioni sullo stesso nodo con lo stesso testo contano due volte)');
o.docenteFuori.forEach(x => console.log('  · correzione ' + x.correzione.slice(0, 14) + ' (' + x.scelta + ') su ' + x.nodeId + ' — esce per ' + String(x.apertaDa).slice(0, 14) +
  ' (modo ' + x.modo + ', ' + (x.via || 'nodo') + (x.contenimento != null && x.via !== 'frammento' ? ', contenimento ' + x.contenimento.toFixed(2) : '') +
  (x.coppia ? ', in coppia con «' + x.coppia + '»' : '') + ')\n      frase del docente: «' + x.frase +
  '»\n      passo che riprende: ' + (x.passo && x.via !== 'frammento' ? '«' + x.passo + '»' : x.passo || '—') + '\n      problema:          «' + x.problema + '»'));
console.log('Frasi escluse oggi che il docente aveva davanti in una decisione sullo stesso nodo: ' + davanti.almenoUna + ' su ' + davanti.escluse +
  ' (tenute parola per parola nel testo di una correzione ' + davanti.tenute + ' · toccate da una conferma ' + davanti.confermate + ')');
const perdite = m.inParte + m.dentro;
console.log('Banco mai aperto, le ' + m.cambiate + ' correzioni vere: frasi poi cambiate tutte fuori ' + m.tutteFuori + ' · in parte ' + m.inParte +
  ' · dentro i materiali ' + m.dentro + (m.nonRitrovate ? ' · non ritrovate ' + m.nonRitrovate : '') +
  ' (localizzazione alla cieca: ' + Object.entries(m.modoCieco).map(([k, n]) => k + ' ' + n).join(' · ') + ')');
console.log('Condizione del packet sulla localizzazione nei due sensi (nessuna frase poi cambiata resta nei materiali): ' +
  (perdite ? 'NON regge — ' + perdite + ' correzioni lasciano dentro una frase cambiata' : 'regge — 0 su ' + m.cambiate));
const ni = localizzazione.nonInformativi, informativi = localizzazione.casi.filter(x => x.informativo);
console.log('\n## Localizzazione alla cieca sulle ' + localizzazione.casi.length + ' correzioni (verità: la frase cambiata dal docente, via textChange)');
console.log('Casi informativi: ' + informativi.length + '. Fuori dalla tabella, giusti per costruzione: nodo ' + ni.nodo + ' (frasi escluse in più: ' + ni.nodoInPiu + ')' +
  ' · proposta accettata ' + ni.propostaAccettata + ' · desc di una frase ' + ni.unaFrase);
console.log('modo                                casi  giuste  parziali  perse  in più');
Object.entries(localizzazione.righe).sort().forEach(([k, t]) =>
  console.log(k.padEnd(36) + String(t.casi).padStart(4) + String(t.giuste).padStart(8) + String(t.parziali).padStart(10) + String(t.perse).padStart(7) + String(t.inPiu).padStart(7)));
informativi.filter(x => x.esito !== 'giuste').forEach(x =>
  console.log('  · ' + x.nodeId + ' — ' + x.modo + (x.verso ? ' (verso ' + x.verso + ')' : '') + ': passo ' + JSON.stringify(x.passo) + ', frasi cambiate ' + JSON.stringify(x.verita) + ' su ' + x.frasiNodo + ' → ' + x.esito));
console.log('Problemi troncati fra le correzioni: ' + localizzazione.casi.filter(x => x.troncato).length + ' (vanno a \'nodo\' se non c\'è manuale, proposta o citazione)');
console.log('Verso problema→frase: scatta in ' + localizzazione.versoProblema.casi + ' casi (n=' + localizzazione.versoProblema.casi + '), non giusti ' + localizzazione.versoProblema.nonGiusti +
  ' → ' + (localizzazione.versoProblema.nonGiusti ? 'NON adottabile' : localizzazione.versoProblema.casi ? 'nessuna perdita, ma su ' + localizzazione.versoProblema.casi + ' casi soltanto' : 'non scatta mai: nessuna prova in un senso o nell\'altro'));
const q =oggi.rec.conteggi ? oggi.rec.conteggi.caratteri.tenuti / oggi.rec.conteggi.caratteri.totali : 0;
const sv = oggi.svuotati.length / db.nodes.length;
console.log('\n## Soglie del packet (decisioni di oggi)');
console.log('Testo ≥ 70%: ' + pct(q, 1) + ' → ' + (q >= 0.7 ? 'regge' : 'NON regge'));
console.log('Nodi svuotati ≤ 10%: ' + pct(sv, 1) + ' → ' + (sv <= 0.1 ? 'regge' : 'NON regge'));

if (USCITA) {
  const righe = st => st.c.righe.map(r => ({ nodeId: r.nodeId, testo: r.testo, corsia: r.corsia, origine: r.origine, issueId: r.issueId, modo: r.modo, vicina: r.vicina && r.vicina.id }));
  fs.writeFileSync(USCITA, JSON.stringify({ pipeline: path.basename(PIPE), oggi: { record: oggi.rec, righe: righe(oggi), svuotati: oggi.svuotati, nodo: nodoOggi, frasiNodo: oggi.frasiNodo },
    mai: { record: mai.rec, righe: righe(mai), svuotati: mai.svuotati, nodo: nodoMai, frasiNodo: mai.frasiNodo }, decise: esitoDecise, davanti, localizzazione }, null, 1));
  console.log('\nDettaglio: ' + USCITA);
}
