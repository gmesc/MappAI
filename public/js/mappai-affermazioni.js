/*
 * mappai-affermazioni.js — la CUCITURA dello strato delle affermazioni e della
 * quarantena (packet 0042, ADR 0010). La logica sta nel core puro
 * (mappai-affermazioni-core.js, provato in Node); qui ci sono soltanto gli
 * interruttori, la scrittura del record in pipeline.json e il cancello avvolto.
 *
 * Due interruttori, ACCESI di default dal packet 0089 (ADR 0020); '0' li spegne (inv. 1):
 *   · `mappai_affermazioni` → a ogni «Genera materiali» con la revisione
 *     dei contenuti (G1) in attesa si calcola il record delle affermazioni e lo
 *     si scrive in `review.quarantena`. Il cancello non cambia.
 *   · `mappai_quarantena` (conta solo col primo acceso e con la
 *     revisione accesa) → un record completo e fresco apre il cancello di G1:
 *     i generatori ricevono una VISTA della mappa con le correzioni già decise e
 *     senza le frasi ancora contestate. G2 si apre sempre.
 * Tutto spento ('0'): il cancello avvolto restituisce lo STESSO oggetto
 * dell'originale, `perMateriali` → null, nessun campo nuovo si scrive.
 * Un terzo, `mappai_frasi_orfane` (packet 0041, spento): le frasi della fonte
 * rimaste fuori dalla mappa, calcolate a richiesta (vedi in fondo).
 *
 * ⚠️ NESSUNA CHIAMATA AI, nessun reranker: la quarantena usa ciò che il Giudice
 * e il docente hanno già prodotto (ADR 0010, alternativa 5 rinviata).
 * ⚠️ FALLISCE CHIUSA: senza un record completo, fresco e legato alla base del
 * Giudice e alle decisioni, vale il cancello di oggi.
 *
 * Ogni lettura di `window.MappAIAffermazioniCore`, `window.MappAIReviewCore` e
 * `window.MappAIReview` sta dentro una funzione, al momento della chiamata
 * (inv. 4/5): questo file può caricarsi prima o dopo chi lo usa.
 * Test: tests/affermazioni-motore.test.js.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.MappAIAffermazioni) return;   // trappola 22: un modulo caricato due volte

  const CHIAVE = 'mappai_affermazioni', CHIAVE_QUARANTENA = 'mappai_quarantena', CHIAVE_ORFANE = 'mappai_frasi_orfane';
  const core = () => window.MappAIAffermazioniCore;
  const reviewCore = () => window.MappAIReviewCore;
  const review = () => window.MappAIReview;
  // appState è `let`: non sta su window (inv. 3)
  const state = () => (typeof appState !== 'undefined' ? appState : null);
  const t = (k, f) => (window.t ? window.t(k, f) : f);
  const clone = x => JSON.parse(JSON.stringify(x));

  function leggi(chiave) { try { return localStorage.getItem(chiave); } catch (e) { return null; } }
  // packet 0089 (ADR 0020): accese se la chiave manca, spente solo con '0' (inv. 1)
  function acceso() { return leggi(CHIAVE) !== '0'; }
  function quarantenaAccesa() {
    if (!acceso() || leggi(CHIAVE_QUARANTENA) === '0') return false;
    const R = review();
    return !!(R && typeof R.enabled === 'function' && R.enabled());
  }
  /* Perché la quarantena NON si può calcolare su questa revisione, sulla mappa
     viva: '' se si può. Senza il core non si calcola niente (gate 3 del 27/09). */
  function nonCalcolabile(rv) {
    const AC = core(), s = state();
    if (!AC || typeof AC.nonCalcolabile !== 'function') return 'core_assente';
    try { return AC.nonCalcolabile(rv, s && s.db, rv && rv.sources); } catch (e) { return 'errore'; }
  }
  /* G1 diventa FACOLTATIVA: la quarantena è accesa, la revisione dei contenuti
     è ancora in attesa e il record si può calcolare. È la condizione con cui
     `requireApproved` lascia passare la ripresa della pipeline (con l'opzione)
     e `checkResume` non apre il Banco da solo.
     Gate 3 del 27/09: su un progetto nato senza il controllo G1 (niente
     rapporto, niente fonti nella revisione) la ripresa passava, il giro
     calcolava un record incompleto e il Banco di G1 compariva DOPO «Riprendi».
     Ora non è facoltativa: il Banco si apre subito, come a quarantena spenta. */
  function facoltativa(rv) {
    return quarantenaAccesa() && !!(rv && rv.initial && rv.initial.status === 'awaiting_review') && !nonCalcolabile(rv);
  }

  /* ── IL CANCELLO AVVOLTO ───────────────────────────────────────────────────
     Si sostituisce la PROPRIETÀ `gate` dell'oggetto MappAIReviewCore (trappola
     9: dentro review-core nessuno chiama `gate`, quindi chi lo legge
     dall'oggetto — pipeline, review.js, learning-path — riceve l'avvolto).
     Se l'originale consente, o la quarantena è spenta, si restituisce il SUO
     esito, lo stesso oggetto. Altrimenti decide `consente`: un esito
     `{allowed, reason:'quarantine', quarantine}` oppure null, e allora torna
     l'esito di oggi. Marcato `__quarantena`: non si avvolge due volte. */
  function avvolgiGate() {
    const RC = reviewCore();
    if (!RC || typeof RC.gate !== 'function') return false;
    if (RC.gate.__quarantena) return true;
    const originale = RC.gate;
    const avvolto = function (rv, db, sources) {
      const esito = originale.apply(this, arguments);
      if (!esito || esito.allowed || !quarantenaAccesa()) return esito;
      const AC = core();
      const q = AC && typeof AC.consente === 'function' ? AC.consente(rv, db, sources) : null;
      return q || esito;
    };
    Object.defineProperty(avvolto, '__quarantena', { value: true });
    Object.defineProperty(avvolto, '__originale', { value: originale });
    RC.gate = avvolto;
    return true;
  }

  /* ── IL RECORD ─────────────────────────────────────────────────────────────
     `aggiorna` gira a ogni «Genera materiali», fra la preparazione delle
     evidenze e il cancello. È DETERMINISTICO: nessuna chiamata a un modello.
     L'unico await è la scrittura del manifesto. Prima si fotografano la
     revisione della mappa e il progetto aperto; dopo si ricontrollano, e se
     qualcosa è cambiato mentre si scriveva il record si invalida (inv. 20/22).
     Ogni uscita senza un record nuovo INVALIDA quello vecchio, se c'era, con
     `completo:false` e il motivo: un record rimasto indietro non deve aprire
     il cancello. Senza un record precedente e con l'interruttore spento non si
     scrive niente (inv. 1). */
  async function scrivi(vaultPath, manifest) {
    const R = review();
    if (!R || typeof R.writeManifest !== 'function') throw new Error(t('aff_no_writer', 'La revisione non è caricata: il record della quarantena non è stato scritto.'));
    return R.writeManifest(vaultPath, manifest);
  }
  async function invalida(vaultPath, manifest, motivo) {
    const rv = manifest.review, AC = core(), vecchio = rv && rv.quarantena;
    if (!vecchio || !AC) return manifest;
    if (vecchio.completo === false && vecchio.motivo === motivo) return manifest;
    rv.quarantena = AC.invalido(motivo, rv);
    try { await scrivi(vaultPath, manifest); }
    catch (e) { console.warn('[Affermazioni] record invalidato solo in memoria:', e && e.message); }
    return manifest;
  }
  async function aggiorna(vaultPath, manifest) {
    const rv = manifest && manifest.review;
    if (!rv) return manifest;
    if (!acceso()) return invalida(vaultPath, manifest, 'spento');
    const AC = core(), RC = reviewCore(), s = state();
    if (!AC || !RC) return manifest;                       // senza il core: vale il cancello di oggi
    if (!rv.initial || rv.initial.status !== 'awaiting_review') return invalida(vaultPath, manifest, 'revisione_non_in_attesa');
    if (!s || !s.db || !Array.isArray(s.db.nodes)) return invalida(vaultPath, manifest, 'mappa_non_valida');
    if (s.activeVaultPath !== vaultPath) return invalida(vaultPath, manifest, 'progetto_cambiato');
    // la fotografia, PRIMA dell'unico await
    const db0 = s.db, progetto0 = s.activeVaultPath, revisione0 = RC.revision(s.db, rv.sources);
    let rec;
    try { rec = AC.record(rv, s.db); }
    catch (e) { rec = AC.invalido('errore:' + ((e && (e.code || e.message)) || 'sconosciuto'), rv); }
    rv.quarantena = rec;
    try { await scrivi(vaultPath, manifest); }
    catch (e) {
      // in memoria il record non vale: senza la copia sul disco il cancello resta quello di oggi
      rv.quarantena = AC.invalido('scrittura_non_riuscita', rv);
      throw e;
    }
    const cambiato = state() !== s || s.db !== db0 || s.activeVaultPath !== progetto0 ||
      manifest.review !== rv || RC.revision(s.db, rv.sources) !== revisione0;
    if (cambiato && rec.completo) {
      rv.quarantena = AC.invalido('cambiato_durante_la_scrittura', rv);
      try { await scrivi(vaultPath, manifest); }
      catch (e) { console.warn('[Affermazioni] record invalidato solo in memoria:', e && e.message); }
    }
    return manifest;
  }

  /* ── LA VISTA PER I MATERIALI ──────────────────────────────────────────────
     Null quando la quarantena non c'entra (spenta, G1 approvata, nessuna
     revisione): ogni punto della pipeline usa allora le sue variabili di oggi.
     Con la quarantena accesa e G1 in attesa, il record DEVE consentire: se non
     consente, si lancia — nessun materiale nasce da una vista non valida.
     → { db, review, nodiMateriali, firma, ricevuta }
       · db: la mappa corretta dalle decisioni prese, senza le frasi escluse
         (una copia: la mappa del docente non cambia mai);
       · review: una copia con `overrides` = le correzioni decise, così
         `buildInput` le scrive come «RETTIFICHE DEL DOCENTE»; riportate alla
         vista (`AC.rettifiche`, giro 2 del 26/09): senza le frasi escluse e
         senza i collegamenti tolti, perché quel blocco «prevale sul testo
         della fonte» e non deve rimettere ciò che la vista ha lasciato fuori
         (giro 3: al posto della frase tolta un a capo, mai una giunzione);
       · nodiMateriali: i nodi della vista senza quelli svuotati (il foglio dei
         nodi non stampa una card vuota). */
  function perMateriali(manifest) {
    const rv = manifest && manifest.review;
    if (!rv || !rv.initial || rv.initial.status !== 'awaiting_review') return null;
    if (!quarantenaAccesa()) return null;
    const AC = core(), s = state();
    if (!AC || !s || !s.db) return null;
    if (!AC.consente(rv, s.db, rv.sources)) {
      const e = new Error(t('aff_not_allowed', 'La quarantena non è valida per questa mappa: riapri la revisione dei contenuti.'));
      e.code = 'QUARANTENA_NON_VALIDA';
      throw e;
    }
    const q = rv.quarantena, corretto = AC.correggi(rv, s.db);
    const db = AC.vistaDb(corretto.db, q);
    const svuotati = new Set((q.svuotati || []).map(String));
    return {
      db,
      review: Object.assign({}, rv, { overrides: AC.rettifiche(corretto.overrides, q, db, corretto.db) }),
      nodiMateriali: (db.nodes || []).filter(n => !svuotati.has(String(n.id))),
      firma: q.firma,
      ricevuta: AC.ricevuta(q)
    };
  }

  /* ── LE BOZZE E I RICONTROLLI ──────────────────────────────────────────────
     Sotto quarantena le bozze dei materiali (B, C, D, E) nascono con G1 ancora
     in attesa, quindi un «Riprova il controllo» o un nuovo controllo dal Setup
     non deve buttarle via: `mergeRetry` costruisce una revisione nuova che non
     le porta. `conservaMateriali` le passa da `old` a `next` (con `final` e le
     consegne) e toglie il record, che dopo un ricontrollo non vale più.
     Senza niente da portare restituisce `next` così com'è. */
  function conservaMateriali(old, next) {
    if (!old || !next) return next;
    const campi = ['drafts', 'final', 'deliveries'].filter(k => old[k] !== undefined);
    if (!campi.length && next.quarantena === undefined) return next;
    const out = Object.assign({}, next);
    campi.forEach(k => { out[k] = clone(old[k]); });
    delete out.quarantena;
    return out;
  }

  /* La ricevuta porta la firma del record da cui la bozza è nata. Una bozza
     nata da un'altra firma — decisioni cambiate, un ricontrollo, la mappa
     modificata e poi rivista — non vale più: `invalidaBozze` la toglie e rimette
     il suo passo in attesa, PRIMA del cancello. `firma` omessa = quella del
     record che consente adesso; con G1 approvata = null (le bozze nate sotto
     quarantena non vengono dai contenuti approvati); con G1 in attesa e nessun
     record valido non si tocca niente: decide il cancello di oggi, e un lavoro
     pagato non si butta per un interruttore spento (trappola 41).
     Restituisce lo STESSO manifesto se non c'è niente da togliere; altrimenti
     una copia, che il chiamante scrive. Un giro già consegnato non si tocca. */
  function firmaDellaBozza(d) { return d && d.quarantena ? (d.quarantena.firma || null) : null; }
  function invalidaBozze(manifest, firma) {
    const rv = manifest && manifest.review;
    if (!rv || !rv.drafts || (rv.final && rv.final.stage === 'done')) return manifest;
    let corrente = firma;
    if (corrente === undefined) {
      const AC = core(), s = state();
      if (facoltativa(rv) && AC && s && s.db && AC.consente(rv, s.db, rv.sources)) corrente = rv.quarantena.firma;
      else if (rv.initial && rv.initial.status === 'approved') corrente = null;
      else return manifest;
    }
    const d = rv.drafts, via = { B: [], C: [], D: false, E: false };
    ['B', 'C'].forEach(k => Object.keys(d[k] || {}).forEach(chiave => {
      if (firmaDellaBozza(d[k][chiave]) !== corrente) via[k].push(chiave);
    }));
    ['D', 'E'].forEach(k => { if (d[k] && firmaDellaBozza(d[k]) !== corrente) via[k] = true; });
    const tocca = k => (k === 'B' || k === 'C') ? via[k].length > 0 : via[k];
    if (!['B', 'C', 'D', 'E'].some(tocca)) return manifest;
    const m = clone(manifest), bozze = m.review.drafts;
    via.B.forEach(k => { delete bozze.B[k]; });
    via.C.forEach(k => { delete bozze.C[k]; });
    if (via.D) delete bozze.D;
    if (via.E) delete bozze.E;
    ['B', 'C', 'D', 'E'].filter(tocca).forEach(k => {
      const passo = m.steps && m.steps[k];
      if (!passo || passo.status === 'skipped') return;
      passo.status = 'pending'; delete passo.error; delete passo.endedAt;
    });
    // `final` è l'appiattimento di TUTTE le bozze: con una sola bozza tolta non descrive più niente
    delete m.review.final;
    return m;
  }

  /* La ricevuta comune alle bozze, per `final`: null se nessuna ne porta una;
     lancia se vengono da firme diverse (una con e una senza conta come
     diversa) — `final` non mescola due stati della revisione. */
  function ricevutaDelleBozze(drafts) {
    const d = drafts || {}, tutte = [];
    ['B', 'C'].forEach(k => Object.keys(d[k] || {}).forEach(chiave => tutte.push(d[k][chiave])));
    ['D', 'E'].forEach(k => { if (d[k]) tutte.push(d[k]); });
    if (!tutte.length) return null;
    if (new Set(tutte.map(firmaDellaBozza)).size > 1) {
      const e = new Error(t('aff_drafts_mixed', 'Le bozze vengono da due stati diversi della revisione: riprendi la generazione dei materiali.'));
      e.code = 'QUARANTENA_BOZZE_MISTE';
      throw e;
    }
    const una = tutte.find(x => x && x.quarantena);
    return una ? clone(una.quarantena) : null;
  }

  /* La pipeline è completa come la conterebbe oggi, con G1 facoltativa
     (delegato al core, che delega a PipelineCore.isComplete). */
  function completo(manifest) {
    const AC = core(), PC = window.MappAIPipelineCore;
    if (AC) return AC.completo(manifest);
    return !!(PC && PC.isComplete(manifest));   // senza il core: il conto di oggi
  }

  /* ── LE FRASI DELLA FONTE RIMASTE FUORI (packet 0041) ──────────────────────
     Terzo interruttore, SPENTO di default (inv. 1): `mappai_frasi_orfane` = '1'
     conta solo con lo strato acceso. Si calcola A RICHIESTA — non si scrive
     niente sul disco: è deterministico e costa millisecondi — sulle frasi della
     fonte della revisione (`rv.sources`, le stesse delle evidenze) e sulla mappa
     VIVA (le affermazioni delle descrizioni e i titoli dei nodi). Nessuna
     chiamata AI, nessun reranker.
     → l'uscita di `frasiOrfane` del core, con `frasi` = quante frasi della
       fonte si sono confrontate; null se spento, senza core o senza mappa.
       Lancia se il calcolo non riesce: chi mostra lo dice.
     Le frasi della fonte si ricavano una volta per elenco di fonti; il
     risultato una volta per contenuto di mappa e fonti (`RC.revision`): il
     Banco si ridisegna a ogni decisione, la mappa no. */
  function orfaneAccese() { return acceso() && leggi(CHIAVE_ORFANE) === '1'; }
  const frasiPerFonti = new WeakMap();
  let ultimoOrfane = null;
  function frasiOrfane(rv, db) {
    if (!orfaneAccese()) return null;
    const AC = core(), RC = reviewCore();
    if (!AC || typeof AC.frasiOrfane !== 'function' || !rv || !db || !Array.isArray(db.nodes)) return null;
    const sources = Array.isArray(rv.sources) ? rv.sources : [];
    let chiave = null;
    try { chiave = RC && typeof RC.revision === 'function' ? RC.revision(db, sources) : null; } catch (e) { chiave = null; }
    if (chiave && ultimoOrfane && ultimoOrfane.chiave === chiave) return ultimoOrfane.valore;
    let frasi = frasiPerFonti.get(sources);
    // anche le voci d'elenco corte (giro di correzione del 27/09): `minParole` vale solo per questo elenco
    if (!frasi) { frasi = AC.frasiFonte(sources, { minParole: AC.MIN_PAROLE_ORFANE }); frasiPerFonti.set(sources, frasi); }
    const valore = AC.frasiOrfane({ frasi, affs: AC.affermazioniDb(db), etichette: db.nodes.map(n => (n && n.label) || '') });
    valore.frasi = frasi.length;
    ultimoOrfane = chiave ? { chiave, valore } : null;
    return valore;
  }

  window.MappAIAffermazioni = {
    acceso, quarantenaAccesa, facoltativa, nonCalcolabile,
    avvolgiGate, aggiorna, perMateriali,
    conservaMateriali, invalidaBozze, ricevutaDelleBozze, completo,
    orfaneAccese, frasiOrfane
  };
  avvolgiGate();
}());
