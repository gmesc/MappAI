/*
 * IL BANCO NUOVO, la logica pura (packet 0072; ADR 0012 revisioni 3 e 4, ADR 0010 revisione 1).
 * Gli elenchi della barra (per materiale in G2, per nodo in G1), il testo di un campo come risulta dalle
 * decisioni già prese, il passaggio dalla scheda alle registrazioni, i segni delle differenze, la riga
 * successiva e la frase di chiusura. Niente interfaccia, niente scritture, niente rete, niente date: chi
 * chiama passa i dati e riceve oggetti nuovi; gli errori si restituiscono come { errore }, non si lanciano.
 * Usa `mappai-review-core.js` e `mappai-review-context.js` e NON li modifica (ADR 0010): le decisioni restano
 * pending · accept · reject · manual, e ogni verifica passa da `preview`.
 * Nessuna funzione qui approva un materiale: l'approvazione resta un gesto per materiale (ADR 0012 rev. 3).
 * Decisioni di Giacomo del 02/10 durante l'esecuzione (registrate nel packet): «Tieni il testo» resta tale
 * anche se poi il testo cambia, in G1 e in G2; in G1 contano le note del NODO; i non letti dal controllo
 * stanno fuori dal da fare; un salvataggio che cambia solo gli spazi non decide, ma gli a capo interni sì.
 * Del 03/10: tre stati del materiale (da rivedere · rivisto · approvato) più l'esclusione, e `esitoBottone`.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    // il core delle affermazioni si carica al primo uso: serve solo alla regola per passo di G1 (0075, Q6)
    module.exports = factory(root, require('./mappai-review-core'), require('./mappai-review-context'),
      function () { return require('./mappai-affermazioni-core'); });
  } else root.MappAIBancoCore = factory(root, null, null, null);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root, coreNode, contestoNode, affermazioniNode) {
  'use strict';

  // In Node i due core arrivano da require; nel browser si leggono al momento dell'uso, così l'ordine di
  // caricamento degli script non conta.
  function rc() {
    var c = coreNode || root.MappAIReviewCore;
    if (!c) throw new Error('review_core_mancante');
    return c;
  }
  function ctx() {
    var c = contestoNode || root.MappAIReviewContext;
    if (!c) throw new Error('review_context_mancante');
    return c;
  }
  /* Il core delle affermazioni (`passoContestato`, packet 0042), letto e mai modificato. Se nel browser lo script
     non c'è, la regola per passo non può individuare nessun passo e non chiude niente: resta la regola prudente
     di prima (fallisce chiusa, come la quarantena). */
  function aff() {
    var a = null;
    try { a = affermazioniNode ? affermazioniNode() : root.MappAIAffermazioniCore; } catch (e) { a = null; }
    return a && typeof a.passoContestato === 'function' ? a : null;
  }

  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o || {}, k); };
  var clone = function (x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); };
  var eid = function (x) { return String(x && typeof x === 'object' ? x.id : x == null ? '' : x); };
  var lista = function (x) { return Array.isArray(x) ? x : []; };
  // Stessa forma canonica del core: l'ordine delle chiavi non conta.
  function stable(x) {
    if (Array.isArray(x)) return '[' + x.map(stable).join(',') + ']';
    if (x && typeof x === 'object') return '{' + Object.keys(x).sort().filter(function (k) {
      return x[k] !== undefined;
    }).map(function (k) { return JSON.stringify(k) + ':' + stable(x[k]); }).join(',') + '}';
    return JSON.stringify(x === undefined ? null : x);
  }
  function uguali(a, b) { return stable(a) === stable(b); }
  // Il testo come lo legge chi rilegge (decisioni A.4 e A.5, e C3 del 03/10): spazi doppi e tab valgono uno
  // spazio, spazi e tab attaccati a un a capo e le righe di soli spazi non contano, spazi e a capo ai BORDI del
  // testo non contano, «\r\n» è un a capo. Il NUMERO degli a capo interni conta sempre: una sintesi è
  // markdown, e un «## » o un elenco rimessi a capo sono una modifica vera.
  function piano(x) {
    if (typeof x === 'string') return x.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').trim();
    if (Array.isArray(x)) return x.map(piano);
    if (x && typeof x === 'object') {
      var r = {};
      Object.keys(x).forEach(function (k) { r[k] = piano(x[k]); });
      return r;
    }
    return x;
  }
  function insieme(x) {
    var valori = x instanceof Set ? Array.from(x) : Array.isArray(x) ? x : [];
    return new Set(valori.map(eid));
  }
  function decisione(review, issue) {
    var d = (review.initial && review.initial.decisions) || {};
    return own(d, issue.id) ? d[issue.id] : undefined;
  }
  function esito(review, issue) { return rc().decisionOutcome(issue, decisione(review, issue)); }
  function aperta(review, issue) { return esito(review, issue) === 'pending'; }
  function delControllo(i) { return i.origin !== 'teacher'; }

  /* ── BERSAGLI E VALORI ─────────────────────────────────────────────────────
     Un bersaglio è quello delle segnalazioni: { kind: node|link|item, id, field } (per i collegamenti senza
     id: source, target, rel). Il campo mancante vale come nel core: desc · rel · $item. */
  function campo(t) { return t.field || (t.kind === 'node' ? 'desc' : t.kind === 'link' ? 'rel' : '$item'); }
  function chiaveDi(t) { return t.kind === 'node' ? 'nodes' : t.kind === 'link' ? 'links' : 'items'; }
  function normalizza(t) {
    if (!t || ['node', 'link', 'item'].indexOf(t.kind) < 0) return null;
    var r = clone(t);
    if (r.id != null) r.id = eid(r.id);
    if (r.source != null) r.source = eid(r.source);
    if (r.target != null) r.target = eid(r.target);
    r.field = campo(r);
    return r;
  }
  function stessaRiga(a, b) {
    if (!a || !b || a.kind !== b.kind) return false;
    if (a.kind !== 'link') return eid(a.id) === eid(b.id);
    if (a.id != null || b.id != null) return a.id != null && b.id != null && eid(a.id) === eid(b.id);
    return eid(a.source) === eid(b.source) && eid(a.target) === eid(b.target) &&
      (a.rel == null || b.rel == null || String(a.rel) === String(b.rel));
  }
  function stessoCampo(a, b) { return stessaRiga(a, b) && campo(a) === campo(b); }
  function trovate(db, t) {
    var trovati = [];
    lista(db && db[chiaveDi(t)]).forEach(function (r, k) {
      if (!r) return;
      var si = t.kind !== 'link' || t.id != null ? eid(r.id) === eid(t.id) :
        eid(r.source) === eid(t.source) && eid(r.target) === eid(t.target) && (t.rel == null || r.rel === t.rel);
      if (si) trovati.push(k);
    });
    return trovati;
  }
  function indice(db, t) { var k = trovate(db, t); return k.length === 1 ? k[0] : -1; }
  function riga(db, t) { var k = indice(db, t); return k < 0 ? null : db[chiaveDi(t)][k]; }
  // Il valore di un campo letto come lo legge il core (`locate`): la desc ripiega su content, la relazione
  // vuota è «include» salvo «Nessuna» scelta dal docente.
  function valoreDi(r, t) {
    var f = campo(t);
    if (!r) return undefined;
    if (f === '$item' || f === '$link') return clone(r);
    if (t.kind === 'node' && f === 'desc') return String(r.desc || r.content || '');
    if (t.kind === 'link' && f === 'rel') return r.relNone === true && r.rel === '' ? '' : (r.rel || 'include');
    return clone(r[f]);
  }
  /* La riga DOPO le decisioni. Un nodo o un materiale si ritrovano per id. Un collegamento no: le sue parole
     possono essere proprio ciò che è cambiato. `preview` lavora su una copia nello stesso ordine e cambia le
     parole sul posto, quindi la riga si ritrova per posizione; se il numero dei collegamenti è cambiato (uno
     è stato tolto) si cerca di nuovo per estremi e parole, e se non c'è più il collegamento è stato tolto. */
  function rigaDopo(prima, dopo, t) {
    if (t.kind !== 'link') return riga(dopo, t);
    var k = indice(prima, t), A = lista(prima && prima.links), Bd = lista(dopo && dopo.links);
    if (k >= 0 && A.length === Bd.length && Bd[k] && eid(Bd[k].source) === eid(A[k].source) && eid(Bd[k].target) === eid(A[k].target)) return Bd[k];
    return riga(dopo, t);
  }

  /* ── IL TESTO «ADESSO» ─────────────────────────────────────────────────────
     `preview` non applica niente finché resta una nota aperta (trappola 1 del packet). Si lavora quindi su
     una copia con le sole note DECISE, come `reviewDecise` della quarantena, e in più ristretta alla riga
     del bersaglio (nodo, collegamento o materiale), come fa `previewItem` per i materiali: un conflitto su
     un'altra riga è affare della sua scheda, non di questa. Con un conflitto `ok` è falso, `adesso` è il testo
     di partenza (è ciò che `preview` restituisce) e `conflitti` dice perché. */
  function anteprima(review, db, t, sources) {
    var C = rc();
    var copia = Object.assign({}, review, { initial: Object.assign({}, review.initial, {
      issues: lista(review.initial.issues).filter(function (i) {
        return stessaRiga(i.target, t) && C.decisionOutcome(i, decisione(review, i)) !== 'pending';
      })
    }) });
    return C.preview(copia, db, sources === undefined ? undefined : { sources: sources });
  }
  function bersaglio(note, opzioni) {
    if (opzioni && opzioni.bersaglio) return normalizza(opzioni.bersaglio);
    var prima = Array.isArray(note) ? note[0] : note;
    return prima && prima.target ? normalizza(prima.target) : null;
  }
  /* Il testo di partenza e quello «adesso», più la riga intera come risulta (`riga`, solo per uso interno).
     Un bersaglio che nella mappa di partenza corrisponde a più righe (due collegamenti con gli stessi estremi e
     senza parole indicate) è `bersaglio_ambiguo`; uno che non c'è è `bersaglio_assente`. */
  function leggi(review, db, t, sources) {
    var inBase = trovate(review.baseSnapshot, t);
    if (inBase.length > 1) return { errore: 'bersaglio_ambiguo' };
    if (!inBase.length) return { errore: 'bersaglio_assente' };
    var partenza = valoreDi(review.baseSnapshot[chiaveDi(t)][inBase[0]], t);
    var p = anteprima(review, db, t, sources);
    var r = { partenza: partenza, adesso: partenza, ok: !!p.ok, conflitti: clone(p.conflicts || []), escluso: false, riga: null };
    if (!p.ok) return r;
    var dopo = rigaDopo(db, p.db, t);
    if (!dopo) { r.escluso = true; r.adesso = null; return r; }
    r.adesso = valoreDi(dopo, t); r.riga = clone(dopo);
    return r;
  }
  /* Gli id delle segnalazioni le cui scelte salvate si contraddicono (`conflicting_decisions`, tutte e due le parti). */
  function idsInConflitto(conflitti) {
    var ids = new Set();
    lista(conflitti).forEach(function (c) {
      if (!c || c.code !== 'conflicting_decisions') return;
      if (c.issueId != null) ids.add(String(c.issueId));
      if (c.otherIssueId != null) ids.add(String(c.otherIssueId));
    });
    return ids;
  }
  // una copia della revisione senza le decisioni di `ids` (le parti nuove sono oggetti nuovi; la revisione vera non cambia)
  function senzaDecisioni(review, ids) {
    var dec = {}, prima = review.initial.decisions || {};
    Object.keys(prima).forEach(function (k) {
      if (!ids.has(String(k))) Object.defineProperty(dec, k, { value: prima[k], enumerable: true, configurable: true, writable: true });
    });
    return Object.assign({}, review, { initial: Object.assign({}, review.initial, { decisions: dec }) });
  }
  /* L3 del packet 0086 (giro 3a bis, revisore D4): D37.7 tocca solo le scelte salvate che si contraddicono. Con un
     conflitto salvato sul campo, il testo «adesso» è quello che danno le ALTRE decisioni salvate della riga — non
     l'Originale nudo —: da lì riparte il campo, e le scelte che non confliggono restano. Senza conflitti è `leggi`; con un
     difetto che non è un conflitto fra scelte, o se anche senza le scelte in conflitto la riga non si legge, resta `leggi`
     (il testo di partenza, `ok` falso). `base: true` dice che `adesso` viene dalle sole scelte senza conflitto. */
  function leggiBase(review, db, t, sources) {
    var s = leggi(review, db, t, sources);
    if (s.errore || s.ok) return s;
    var ids = idsInConflitto(s.conflitti);
    if (!ids.size || lista(s.conflitti).some(function (c) { return !c || c.code !== 'conflicting_decisions'; })) return s;
    var b = leggi(senzaDecisioni(review, ids), db, t, sources);
    if (b.errore || !b.ok) return s;
    return Object.assign({}, b, { ok: false, conflitti: s.conflitti, base: true });
  }
  /* `opzioni.senzaConflitti` (packet 0086, giro 3a bis, L3; facoltativa, spenta di partenza: il comportamento di oggi, che la
     veste spenta usa): con scelte salvate in conflitto sul campo, `adesso` è il testo che danno le altre decisioni salvate
     (`leggiBase`), quello da cui riparte il campo (D37.7); `ok` resta falso e `conflitti` dice quali. */
  function testoAdesso(note, review, opzioni) {
    opzioni = opzioni || {};
    if (!review || !review.initial || !review.baseSnapshot) return { errore: 'invalid_review' };
    var db = opzioni.db || review.baseSnapshot;
    var t = bersaglio(note, opzioni);
    if (!t) return { errore: 'bersaglio_mancante' };
    try {
      var r = (opzioni.senzaConflitti ? leggiBase : leggi)(review, db, t, opzioni.sources);
      if (!r.errore) { delete r.riga; delete r.base; }
      return r;
    } catch (e) {
      return { errore: (e && (e.code || e.message)) || 'errore' };
    }
  }

  /* ── DALLA SCHEDA ALLE DECISIONI ───────────────────────────────────────────
     Restituisce le chiamate al core da fare, nell'ordine, oppure { errore }. Le regole (ADR 0012 rev. 4, A.8,
     B.4 e B.5; ADR 0010 rev. 1; decisioni di Giacomo del 02/10):
     0. la scheda deve essere attuale: un «adesso» passato da chi chiama diverso da quello calcolato dà
        `adesso_superato`, mai una decisione;
     1. salvato uguale al testo che la scheda MOSTRA («adesso»; con un conflitto già presente, il testo di
        partenza, che è ciò che `testoAdesso` restituisce), a meno di spazi doppi, tab e bordi (A.4, A.5) →
        nessuna decisione: entrare nel campo non decide, e non si conferma mai una nota non toccata (N1);
     1-bis. G1: se il campo mostra la proposta aperta di una nota (A.5, `propostaMostrata`), il salvataggio vale «Usa la
        proposta» di quella nota e poi le regole qui sotto sul testo della proposta (`propostaNelCampo`, quarto giro, Q9);
     1-ter. G1: un testo salvato uguale a quello di partenza a meno di spazi (come la regola 1) si salva come il testo di
        partenza, esatto: vale «rimesso com'era» (ottavo giro, D-b);
     2. salvato identico alla proposta di una nota → accept su quella nota (e su ogni nota con la stessa
        proposta: è lo stesso confronto);
     3. G2: le decisioni $item attive (che cambiano il materiale) prendono la correzione, tutte, col materiale
        intero com'è adesso; se il materiale è in conflitto non si sa che cosa sia «adesso» e la correzione
        non si compone: `conflitto_da_sciogliere` (N2). Altrimenti una manual per campo: sulle note già decise
        del campo; se non ce ne sono, sull'unica nota APERTA del campo; con più note aperte non se ne chiude
        nessuna e nasce la correzione del docente (A.6). Le reject non si toccano;
     4. G1, regola prudente PER PASSO (0075, Q6; Giacomo, 06/10: «per passo, prudente»; ADR 0012 revisione 7 e
        ADR 0010 revisione 2, accettate il 06/10, al posto della rev. 4, B.4 dello 0012 e del secondo punto della
        rev. 1 dello 0010): la correzione chiude una nota se è l'unica
        nota del controllo sul NODO (o sul collegamento), aperta e su questo campo, come prima; con più note, sulla
        DESCRIZIONE, chiude ogni nota APERTA del controllo sulla descrizione del nodo il cui passo contestato, presente
        nel testo che la scheda mostrava, non compare più nel testo salvato, cercato come lo cerca la quarantena
        (`passoCambiato`, giro di correzione e terzo giro del 07/10, Q9). Una
        nota il cui passo non si individua (modo 'nodo') non si chiude così: chiede il suo gesto. Se non se ne
        chiude nessuna, il testo va nella correzione del docente, già decisa. Titoli e collegamenti come prima
        (rev. 7). Limiti dichiarati: il passo è una frase intera (basta una parola cambiata in quella frase); con
        una nota sola la chiude anche se è stata corretta un'altra frase; una correzione chiude solo note del suo
        nodo; sui collegamenti non c'è passo;
     5. una nota già «Proposta scelta» (o già corretta a mano) sullo stesso campo prende il testo salvato e
        diventa manual: due decisioni diverse sullo stesso campo confliggono, lo stesso testo no (trappola 2);
     6. «Tieni il testo» (reject) resta com'è anche se il testo poi cambia, in G1 e in G2 (ADR 0010 rev. 1);
     7. la correzione del docente nasce già decisa, mai «da decidere» (trappola 3);
     8. «Nessuna» sulle parole di un collegamento: testo vuoto con `relNone`, come accetta il core (B.5);
     9. il giudizio è sul RISULTATO: le chiamate si applicano a una copia e si verificano con `preview`. Un
        conflitto già presente che le chiamate risolvono non blocca; uno che resta è `conflitto_da_sciogliere`
        (lo scioglie la veste con «Annulla»); uno creato dalle chiamate è l'errore del core. Una correzione su
        un campo non cambia mai gli altri campi della riga rispetto a come erano decisi (N2). Mai una lista a
        metà. */
  function errore(conflitti) {
    conflitti = lista(conflitti);
    var codice = conflitti.some(function (c) { return c && c.code === 'conflicting_decisions'; }) ? 'conflicting_decisions' :
      conflitti.length && conflitti[0] && conflitti[0].code ? conflitti[0].code : 'anteprima_non_valida';
    return { errore: codice, conflitti: clone(conflitti) };
  }
  function applica(review, chiamate) {
    var C = rc();
    return chiamate.reduce(function (r, c) {
      return c.chiamata === 'addIssue' ? C.addIssue(r, c.issue) : C.setDecision(r, c.issueId, c.choice, c.opts);
    }, review);
  }
  // La riga senza il campo che si corregge e senza ciò che `preview` ne deriva (content e aiDesc dalla desc,
  // hasCustomText, relNone, le citazioni estese di una sintesi): ciò che resta non deve cambiare (N2).
  function altriCampi(r, t) {
    if (!r) return r;
    var c = clone(r);
    delete c[campo(t)];
    ['content', 'aiDesc', 'hasCustomText', 'relNone', 'citations'].forEach(function (k) { delete c[k]; });
    return c;
  }
  function verifica(review, chiamate, t, db, salvato, sources, prima) {
    var r = applica(review, chiamate);
    var s = leggi(r, db, t, sources);
    if (s.errore) return { errore: s.errore };
    if (!s.ok) return prima.ok ? errore(s.conflitti) : { errore: 'conflitto_da_sciogliere', conflitti: clone(s.conflitti) };
    var sospese = lista(r.initial.issues).filter(function (i) {
      return i.origin === 'teacher' && stessoCampo(i.target, t) && aperta(r, i);
    });
    if (sospese.length) return { errore: 'correzione_da_decidere' };
    if (s.escluso || !uguali(s.adesso, salvato)) return { errore: 'testo_diverso' };
    if (prima.ok && !uguali(altriCampi(prima.riga, t), altriCampi(s.riga, t))) return { errore: 'conflitto_da_sciogliere' };
    return null;
  }
  /* Il passo contestato di una nota NON compare più nel testo salvato (0075, Q6). Il passo è quello della quarantena,
     `passoContestato` del core delle affermazioni calcolato SENZA la decisione: la differenza della proposta, poi i
     frammenti fra virgolette del motivo (modo 'citato': il passo è il frammento), poi la frase che si sovrappone al
     motivo. In modo 'nodo' (passo non individuato, la descrizione intera) falso: la nota chiede il suo gesto.
     Giro di correzione del 07/10 (D1, «la quarantena fallisce aperta»): il pezzo si cerca come lo cerca la quarantena,
     nella forma di `_forma` (`formaQuarantena`), non lettera per lettera — «'Lo Stato…» del giudice e «lo Stato…» del
     testo sono lo stesso passo, e la quarantena lo terrebbe fuori dai materiali. Contano solo i pezzi che in quella
     forma si ritrovano nel testo MOSTRATO un attimo prima del salvataggio (`mostrato`: l'«adesso» della scheda, come lo
     dà `testoAdesso`); se nessuno si ritrova, falso: nel dubbio la nota resta aperta (fallisce chiusa, come la
     quarantena). Basta un pezzo che non c'è più.
     Terzo giro (07/10, Q9; Giacomo: «sì, correggi»): prima i pezzi si cercavano nel testo di PARTENZA (`before`). Se
     un'altra nota aveva già cambiato quella frase («Usa la proposta»), il pezzo c'era all'inizio e non c'era più nel
     testo salvato: un ritocco qualunque altrove chiudeva la nota con la sua obiezione mai guardata (Svizzera, nodo
     L1_3_L2_B: «accuse molto gravi» nella prima frase chiudeva fc6d3, che contesta la seconda). Ora un passo che il
     docente non ha più sotto gli occhi non chiude niente. Il passo stesso resta quello della quarantena, calcolato sul
     testo di partenza (`passoContestato(issue)`). */
  /* La forma in cui la quarantena CERCA un frammento: `_forma` di mappai-affermazioni-core.js, che non è esportata e
     non si modifica (§3). È `normalizza` (esportata: NFKC, caratteri di formato tolti, spazi ridotti a uno, bordi
     tolti) in minuscolo, con un solo apostrofo e una sola virgoletta. La tiene allineata alla quarantena il test «G3-2»
     di tests/banco-core.test.js, che confronta il testo delle due catene dopo `normalizza` (una modifica a una sola delle
     due lo fa rosso) e prova ogni apostrofo e ogni virgoletta contro la quarantena. */
  function formaQuarantena(A, x) {
    return A.normalizza(x).toLowerCase().replace(/[’‘´`ʼ]/g, '\'').replace(/[«»“”„]/g, '"');
  }
  /* L2 del packet 0086 (giro 3a bis, revisore D3): la forma della quarantena senza la punteggiatura — lettere e cifre, una
     parola dopo l'altra. Due frasi con la stessa forma «nuda» sono la stessa frase ritoccata (un punto tolto, «.» → «!», una
     virgola, le maiuscole): per D40 un ritocco così non è una riscrittura. Una parola aggiunta, tolta o cambiata, in questa
     forma, sì (D40.2: «nessuna frase generata tale e quale»). Anche per la nota sulla descrizione intera: la soglia di
     contenimento che valeva lì (`stretto`) è spenta dall'ADR 0012 rev. 15 (packet 0089), l'ultima parola è del docente. */
  function formaNuda(A, x) {
    return formaQuarantena(A, x).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }
  function passoCambiato(issue, salvato, mostrato) {
    var A = aff();
    if (!A || typeof A.normalizza !== 'function' || typeof salvato !== 'string' || typeof mostrato !== 'string' || !issue) return false;
    var p;
    try { p = A.passoContestato(issue); } catch (e) { return false; }
    if (!p || p.modo === 'nodo') return false;
    var pezzi = p.modo === 'citato' ? lista(p.frammenti) : lista(p.passi).map(function (x) { return x && x.testo; });
    var prima = formaQuarantena(A, mostrato);
    pezzi = pezzi.filter(function (x) { return typeof x === 'string'; }).map(function (x) { return formaQuarantena(A, x); })
      .filter(function (x) { return x !== '' && prima.indexOf(x) >= 0; });
    if (!pezzi.length) return false;
    var F = formaQuarantena(A, salvato);
    return pezzi.some(function (x) { return F.indexOf(x) < 0; });
  }
  /* Quarto giro (07/10, D1; Q9 com'è decisa: «si confronta col testo che il docente aveva davanti»). Finché il campo è il
     testo di partenza, la veste vi scrive la proposta della prima nota aperta (ADR 0012 rev. 4, A.1 e A.5), ma l'«adesso»
     resta il testo di partenza: i passi delle altre note si cercavano lì, e un ritocco nella prima frase chiudeva una nota
     la cui frase la proposta a schermo aveva già cambiato (Svizzera, L1_3_L2_B: fc6d3). Ora la veste dice quale nota è nel
     campo (`propostaMostrata`, il suo id) e il salvataggio vale «Usa la proposta» di quella nota più il ritocco: la nota è
     una «Proposta scelta» ritoccata («Testo modificato da te», B.4) e i passi delle altre si cercano nel testo della
     proposta. Stesso esito con e senza il bottone. Conta solo se è davvero ciò che la veste scrive nel campo — G1, una
     nota del controllo, aperta, con una proposta di testo, sullo stesso campo, e il testo mostrato è quello di partenza —;
     altrimenti la si ignora e vale la regola di sempre. In G2 resta A.6.
     Quinto giro (07/10, N1): «è davvero ciò che la veste scrive» vuol dire la PRIMA nota aperta del controllo con una
     proposta su quel campo, nell'ordine della revisione — quella che `carica` sceglie —, non una qualunque. */
  function propostaNelCampo(dati, review, t, stato) {
    if (dati.regime !== 'g1' || !own(dati, 'propostaMostrata') || dati.propostaMostrata == null) return null;
    var id = String(dati.propostaMostrata);
    var i = lista(review.initial.issues).find(function (x) {
      return x && x.target && delControllo(x) && stessoCampo(x.target, t) && x.hasProposal && typeof x.after === 'string' && aperta(review, x);
    });
    if (!i || String(i.id) !== id || !uguali(stato.adesso, stato.partenza)) return null;
    return i;
  }
  function decisioniDaCampo(dati) {
    dati = dati || {};
    var review = dati.review;
    if (!review || !review.initial || !review.baseSnapshot) return { errore: 'invalid_review' };
    if (dati.regime !== 'g1' && dati.regime !== 'g2') return { errore: 'regime_sconosciuto' };
    var t = bersaglio(dati.note, dati);
    if (!t) return { errore: 'bersaglio_mancante' };
    var f = campo(t);
    if (f === '$item' || f === '$link') return { errore: 'campo_non_valido' };
    if (!own(dati, 'salvato') || dati.salvato === undefined) return { errore: 'testo_mancante' };
    try {
      return calcola(dati, review, t, f);
    } catch (e) {
      return { errore: (e && (e.code || e.message)) || 'errore' };
    }
  }
  /* `proposta` (solo dalla regola 1-bis): il testo che il campo mostrava, la proposta scritta dalla veste. Quinto giro
     (07/10, D1): col conflitto già presente `leggi(presa0)` dà ancora il testo di partenza, non la proposta a schermo;
     rimesso il testo di partenza, la regola 1 non vedeva il cambio («Proposta scelta» senza verifica) e i passi si
     cercavano nel testo sbagliato (Q9). Il testo mostrato è la proposta, per la regola 1 e per `passoCambiato`. */
  function calcola(dati, review, t, f, proposta) {
    var C = rc(), db = dati.db || review.baseSnapshot, sources = dati.sources, salvato = dati.salvato;
    var stato = leggi(review, db, t, sources);
    if (stato.errore) return { errore: stato.errore };
    if (stato.ok && stato.escluso) return { errore: t.kind === 'item' ? 'materiale_escluso' : 'elemento_tolto' };
    // Regole 0 e 1 sul testo MOSTRATO, anche in conflitto (N1).
    if (own(dati, 'adesso') && !uguali(dati.adesso, stato.adesso)) return { errore: 'adesso_superato' };
    /* Regola 1-ter (G1; 0075, ottavo giro, D-b): il testo di partenza rimesso a meno di spazi (`piano`, la forma della
       regola 1) È il testo di partenza, e si salva com'è nella partenza. Prima la decisione portava gli spazi: una nota del
       controllo corretta e rimessa con uno spazio in fondo era «Testo modificato da te» e lo spazio arrivava alla mappa,
       rimessa esatta era «Testo mantenuto». Solo in G1 (G2 resta com'era: fuori da questo packet) e mai verso un testo
       vuoto (le parole «Nessuna» di un collegamento restano un gesto a parte).
       Nono giro (scenario S1 del verificatore): una proposta che cambia SOLO spazi ha la stessa forma del testo di partenza;
       il docente che la scrive esatta la riportava al testo di partenza e la nota restava aperta. Un testo salvato
       identico, carattere per carattere, alla proposta di una nota APERTA sul campo è quella proposta (regola 2): la 1-ter
       non si applica. */
    var propostaEsatta = function () {
      return lista(review.initial.issues).some(function (i) {
        return i && i.target && stessoCampo(i.target, t) && i.hasProposal && uguali(i.after, salvato) && aperta(review, i);
      });
    };
    if (dati.regime === 'g1' && typeof salvato === 'string' && typeof stato.partenza === 'string' && piano(stato.partenza) !== '' &&
        salvato !== stato.partenza && piano(salvato) === piano(stato.partenza) && !propostaEsatta()) salvato = stato.partenza;
    // Regola 1-bis (G1): la proposta aperta scritta nel campo vale «Usa la proposta», poi il ritocco.
    var mostrata = propostaNelCampo(dati, review, t, stato);
    if (mostrata) {
      var presa0 = rc().setDecision(review, mostrata.id, 'accept', own(dati, 'now') ? { now: dati.now } : {});
      var ritocco = Object.assign({}, dati);
      delete ritocco.adesso; delete ritocco.propostaMostrata;   // l'«adesso» di presa0 lo calcola `leggi`; il mostrato è la proposta
      var dopo = calcola(ritocco, presa0, t, f, mostrata.after);
      if (dopo.errore) return dopo;
      // l'accept di passaggio serve solo se il ritocco non riscrive la nota (la proposta salvata com'è, regola 1 su presa0:
      // nessuna chiamata e niente da verificare oltre, come per il bottone)
      var riscritta = dopo.chiamate.some(function (c) { return c.chiamata === 'setDecision' && c.issueId === mostrata.id; });
      var tutto = (riscritta ? [] : [{ chiamata: 'setDecision', issueId: mostrata.id, choice: 'accept', opts: own(dati, 'now') ? { now: dati.now } : {} }]).concat(dopo.chiamate);
      return dopo.chiamate.length ? verifica(review, tutto, t, db, salvato, sources, stato) || { chiamate: tutto } : { chiamate: tutto };
    }
    var mostrato = proposta === undefined ? stato.adesso : proposta;
    if (uguali(piano(salvato), piano(mostrato))) return { chiamate: [] };

    var tutte = lista(review.initial.issues);
    var delCampo = tutte.filter(function (i) { return stessoCampo(i.target, t); });
    var scelta = function (i) { var d = decisione(review, i); return d ? d.choice : 'pending'; };
    var presa = function (i) { return !aperta(review, i) && (scelta(i) === 'accept' || scelta(i) === 'manual'); };
    var opts = function (extra) { return Object.assign(own(dati, 'now') ? { now: dati.now } : {}, extra); };
    var nessuna = t.kind === 'link' && f === 'rel' && salvato === '';
    var aMano = function (i, valore) {
      var testo = valore === undefined ? salvato : valore, d = decisione(review, i);
      if (d && d.choice === 'manual' && uguali(d.text, testo) && (!nessuna || d.relNone === true)) return [];
      return [{ chiamata: 'setDecision', issueId: i.id, choice: 'manual', opts: opts(nessuna ? { text: '', relNone: true } : { text: clone(testo) }) }];
    };
    var piatta = function (gruppi) { return [].concat.apply([], gruppi); };
    var tutteAMano = function (note) { return piatta(note.map(function (i) { return aMano(i); })); };
    function correzioneDocente() {
      var esistente = delCampo.find(function (i) { return i.origin === 'teacher' && !i.hasProposal; });
      if (esistente) return aMano(esistente);
      var issue = { target: clone(t), origin: 'teacher', blocking: true, problem: String(dati.problema || '') };
      var prova = C.addIssue(review, issue);
      issue.id = prova.initial.issues[prova.initial.issues.length - 1].id;
      return [{ chiamata: 'addIssue', issue: issue }].concat(aMano({ id: issue.id }));
    }

    // Regola 2: il testo salvato è la proposta di una nota.
    var proposte = delCampo.filter(function (i) { return i.hasProposal && uguali(i.after, salvato); });
    if (proposte.length) {
      var conAccept = proposte.filter(function (i) { return scelta(i) !== 'accept'; }).map(function (i) {
        return { chiamata: 'setDecision', issueId: i.id, choice: 'accept', opts: opts({}) };
      }).concat(tutteAMano(delCampo.filter(function (i) { return proposte.indexOf(i) < 0 && presa(i); })));
      if (!verifica(review, conAccept, t, db, salvato, sources, stato)) return { chiamate: conAccept };
    }

    var chiamate;
    if (dati.regime === 'g2') {
      // Regola 3: le decisioni $item che cambiano davvero il materiale (esito applicato o modificato).
      var attive = t.kind !== 'item' ? [] : tutte.filter(function (i) {
        return i.target.kind === 'item' && eid(i.target.id) === eid(t.id) && i.target.field === '$item' &&
          ['applied', 'edited'].indexOf(esito(review, i)) >= 0;
      });
      if (attive.length) {
        // Il materiale com'è adesso. In conflitto non lo si sa: comporre vorrebbe dire toccare gli altri campi (N2).
        if (!stato.ok) return { errore: 'conflitto_da_sciogliere', conflitti: clone(stato.conflitti) };
        var intero = clone(stato.riga);
        intero[f] = clone(salvato);
        chiamate = piatta(attive.map(function (i) { return aMano(i, intero); }));
      } else {
        // Regole 3, 5, 6 e A.6: le note già decise del campo; se non ce ne sono, l'unica aperta; con più note
        // aperte nessuna. Le correzioni del docente rimaste aperte (Banco di prima) si chiudono. Reject intatte.
        var preseG2 = delCampo.filter(presa);
        var aperteG2 = delCampo.filter(function (i) { return delControllo(i) && aperta(review, i); });
        var sola = !preseG2.length && aperteG2.length === 1 ? [aperteG2[0]] : [];
        var portatori = preseG2.concat(sola, delCampo.filter(function (i) { return i.origin === 'teacher' && aperta(review, i); }));
        chiamate = portatori.length ? tutteAMano(portatori) : correzioneDocente();
      }
    } else {
      // Regola 4, prudente: contano le note del controllo sul NODO (o sul collegamento), su ogni campo.
      var delNodo = tutte.filter(function (i) { return stessaRiga(i.target, t) && delControllo(i); });
      var unica = delNodo.length === 1 && stessoCampo(delNodo[0].target, t) && aperta(review, delNodo[0]) ? delNodo[0] : null;
      var prese = delCampo.filter(presa);
      var docenteAperte = delCampo.filter(function (i) { return i.origin === 'teacher' && aperta(review, i); });
      /* Q6: con più note, le note aperte del controllo sul campo il cui passo, presente nel testo mostrato
         (`mostrato`: l'«adesso» della scheda o la proposta nel campo, Q9), non c'è più nel testo salvato. Solo sulla
         descrizione: titoli e collegamenti come prima (ADR 0012 rev. 7; giro di correzione, terzo e quinto giro del 07/10) */
      var perPasso = unica || t.kind !== 'node' || f !== 'desc' ? [] : delCampo.filter(function (i) {
        return delControllo(i) && aperta(review, i) && passoCambiato(i, salvato, mostrato);
      });
      chiamate = tutteAMano(prese.concat(docenteAperte, unica ? [unica] : [], perPasso));
      if (!prese.length && !docenteAperte.length && !unica && !perPasso.length) chiamate = correzioneDocente();
    }
    return verifica(review, chiamate, t, db, salvato, sources, stato) || { chiamate: chiamate };
  }

  /* ── I SEGNI DELLE DIFFERENZE ──────────────────────────────────────────────
     Parola per parola, sulle parole esatte (punteggiatura attaccata compresa), con la sottosequenza comune
     più lunga. Uno spazio fra due parole cambiate è cambiato anche lui (il barrato resta continuo). Fra due
     parole uguali lo spazio è segnato solo se cambia il NUMERO degli a capo (C2, coerente con A.5): spazi
     doppi, tab, spazi attaccati a un a capo e righe di soli spazi no (C3); i bordi del testo mai. I pezzi di
     ciascun lato, rimessi in fila, ridanno il testo TALE E QUALE, spazi doppi e a capo compresi: lo strato
     colorato sta dietro il campo in cui si scrive e deve combaciare (rev. 4, A.3).
     `MappAIConfrontoCore.inline` normalizza gli spazi: qui non si usa. */
  function frammenti(s) { return s.match(/\s+|\S+/g) || []; }
  function aCapo(x) { return (String(x).replace(/\r\n?/g, '\n').match(/\n/g) || []).length; }
  // lo spazio che segue la parola w, se dopo c'è un'altra parola
  function spaziFra(T) {
    var fra = [], w = -1;
    T.forEach(function (x, k) { if (/\S/.test(x)) w++; else if (w >= 0 && k < T.length - 1) fra[w] = x; });
    return fra;
  }
  function segni(prima, testo) {
    prima = prima == null ? '' : String(prima); testo = testo == null ? '' : String(testo);
    var A = frammenti(prima), Bt = frammenti(testo);
    var pa = A.filter(function (x) { return /\S/.test(x); }), pb = Bt.filter(function (x) { return /\S/.test(x); });
    var n = pa.length, m = pb.length, coppia = new Array(n).fill(-1);
    var s = 0, e = 0, i, j;
    while (s < n && s < m && pa[s] === pb[s]) { coppia[s] = s; s++; }
    while (e < n - s && e < m - s && pa[n - 1 - e] === pb[m - 1 - e]) { coppia[n - 1 - e] = m - 1 - e; e++; }
    var N = n - s - e, M = m - s - e;
    if (N && M) {
      var L = [];
      for (i = 0; i <= N; i++) L.push(new Uint32Array(M + 1));
      for (i = N - 1; i >= 0; i--) for (j = M - 1; j >= 0; j--) {
        L[i][j] = pa[s + i] === pb[s + j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      }
      i = 0; j = 0;
      while (i < N && j < M) {
        if (pa[s + i] === pb[s + j]) { coppia[s + i] = s + j; i++; j++; }
        else if (L[i + 1][j] >= L[i][j + 1]) i++;
        else j++;
      }
    }
    var ua = coppia.map(function (c) { return c >= 0; }), ub = new Array(m).fill(false);
    coppia.forEach(function (c) { if (c >= 0) ub[c] = true; });
    // C2: fra due parole uguali e consecutive da entrambe le parti, un numero diverso di a capo si segna
    var fraA = spaziFra(A), fraB = spaziFra(Bt), cambiA = new Set(), cambiB = new Set();
    for (i = 0; i < n - 1; i++) {
      if (coppia[i] >= 0 && coppia[i + 1] === coppia[i] + 1 && aCapo(fraA[i] || '') !== aCapo(fraB[coppia[i]] || '')) {
        cambiA.add(i); cambiB.add(coppia[i]);
      }
    }
    return { prima: cuci(A, ua, 'tolto', cambiA), testo: cuci(Bt, ub, 'aggiunto', cambiB) };
  }
  function cuci(T, uguale, segno, cambiati) {
    var tipi = [], dopo = [], w = 0, out = [];
    T.forEach(function (x, k) {
      if (/\S/.test(x)) { tipi[k] = uguale[w] ? 'uguale' : segno; w++; } else { tipi[k] = null; dopo[k] = w - 1; }
    });
    T.forEach(function (x, k) {
      if (tipi[k] !== null) return;
      // `cambiati` contiene solo spazi fra due parole: i bordi del testo non ci finiscono mai
      tipi[k] = tipi[k - 1] === segno && tipi[k + 1] === segno || cambiati.has(dopo[k]) ? segno : 'uguale';
    });
    T.forEach(function (x, k) {
      var ultimo = out[out.length - 1];
      if (ultimo && ultimo.tipo === tipi[k]) ultimo.t += x;
      else out.push({ tipo: tipi[k], t: x });
    });
    return out;
  }

  /* ── G2: L'ELENCO PER MATERIALE ────────────────────────────────────────────
     Una riga per materiale segnalato DAL CONTROLLO o senza esito del controllo (una sola se è le due cose):
     le note del docente (esclusione, correzione) non rendono segnalato un materiale. Dal giro 2 dello 0073 ha una
     riga anche ogni materiale con una nota APERTA (del docente compresa, anche una scheda dei nodi, che resta
     senza numero) e ogni materiale che chi chiama passa in `bloccati` (un conflitto nel `preview`): altrimenti
     tiene ferma la chiusura e nessun elenco lo mostra. Gli insiemi `approvati`
     ed `esclusi` li calcola chi chiama (`statoApprovazioni`): qui niente `preview`, una volta per riga
     costerebbe ~10 ms a materiale. Come `statoApprovazioni`, con il controllo completo non ci sono residui.
     - `stato` (decisioni di Giacomo A.7 e A.8, 03/10), uno solo per riga, nell'ordine:
       'escluso' — negli esclusi passati da chi chiama, oppure con l'esclusione decisa nella revisione (il gesto
         «Escludi il materiale» sulla nota): resta fuori dai tre stati del bottone e non conta fra i da fare;
       'rivisto' / 'approvato' — il docente ha premuto il bottone (il materiale è negli `approvati` passati da
         chi chiama): 'rivisto' se il testo che arriva all'allievo differisce dal testo generato oltre spazi e
         punteggiatura (`esitoBottone`), anche per una proposta del controllo accettata; 'approvato' altrimenti;
       'da-rivedere' — tutto il resto, anche con tutte le note decise: senza il bottone resta da fare.
       `fatto` = rivisto, approvato o escluso; `daFare` è il contrario. Il riepilogo conta ogni riga in uno
       stato solo: daRivedere + rivisti + approvati + esclusi = righe. Gli «approvati da te» del riepilogo della
       revisione 2 ora si dividono in rivisti + approvati.
     - Rivisto o approvato si decide SENZA `preview` (§5), dalle decisioni prese: si confronta il testo di
       partenza di ogni decisione che cambia il materiale con quello che la decisione mette (la proposta
       accettata o il testo della correzione), con `esitoBottone`. Basta guardarle una per una perché un
       materiale approvato non ha conflitti (la veste approva solo un'anteprima riuscita) e le modifiche che il
       core compone toccano parti diverse del testo: nessuna può annullare un'altra. Limite trovato nello 0072:
       due proposte che da sole ritoccano la punteggiatura, composte, possono saldare due parole. Per questo la
       veste (0073) passa `rivisti`, calcolato sull'anteprima intera: se c'è, decide lui (R3).
     - L'esclusione decisa nella revisione si riconosce come la riconosce il core: quella del docente sospende
       le altre decisioni del materiale; quella proposta dal controllo vale solo se nessun'altra decisione
       cambia il materiale (altrimenti il core segnala un conflitto e non la applica).
     «Verificati» si conta solo dal rapporto (`coverage.checkedIds`, meno i residui), mai dall'uguaglianza
     fra bozza e anteprima. Le schede dei nodi sono esenti e restano fuori. */
  function modifiche(review, sue) {
    return sue.filter(function (i) { return ['applied', 'edited', 'excluded'].indexOf(esito(review, i)) >= 0; });
  }
  function esclusoInRevisione(review, sue) {
    var mod = modifiche(review, sue);
    if (mod.some(function (i) { return i.origin === 'teacher' && i.id === 'teacher-exclude-' + eid(i.target.id) && esito(review, i) === 'excluded'; })) return true;
    return mod.length > 0 && mod.every(function (i) { return esito(review, i) === 'excluded'; });
  }
  function cambiatoDalDocente(review, sue) {
    return modifiche(review, sue).some(function (i) {
      var d = decisione(review, i);
      return esitoBottone(i.before, d.choice === 'manual' ? d.text : i.after) === 'rivisto';
    });
  }

  /* ── L'ESITO DEL BOTTONE (decisioni A.7 e A.10 di Giacomo, 03/10) ──────────
     Funzione pura in più rispetto al §4 del packet, per la veste (invariante 4): dice che cosa diventa un
     materiale quando il docente preme il bottone, 'approvato' se ha cambiato «solo spazi e punteggiatura»,
     'rivisto' altrimenti. Una sola definizione: la usa anche `righeMateriali`.
     Che cosa vuol dire «solo spazi e punteggiatura» (quinto e sesto giro; ADR 0012 revisione 5, punto A.2):
     - si confrontano sequenze di PAROLE, riga per riga: unire o dividere parole («per ché» / «perché») è una
       modifica; gli a capo interni contano (A.10), con le stesse normalizzazioni di `piano` (C3: righe di soli
       spazi = righe vuote, «\r\n» = a capo, spazi doppi, tab, spazi speciali come NBSP, spazi attaccati agli a
       capo e ai bordi ignorati);
     - da ogni parola si tolgono SOLO ai bordi i segni tipografici . , ; : ! ? … « » " “ ” „ ' ’ ‘ ( ) [ ],
       dopo aver reso ’ ‘ come ' e “ ” « » „ come " (così l’oro = l'oro); fa eccezione il punto o la virgola in
       testa a una parola davanti a una cifra, che è un decimale senza zero (.5 / 5); in coda il punto si toglie
       («5.» = «5»);
     - le lineette – — (e ‐ ‑ ‒ ―) non contano solo quando sono ISOLATE: una parola fatta per intero di lineette
       sparisce; attaccate a una parola o a un numero contano (il meno tipografico: –12 °C / 12 °C);
     - una parola fatta solo di segni tipografici sparisce;
     - restano modifiche tutto ciò che sta DENTRO una parola (l'oro / loro, 3.5 / 35, 2/3 / 23, x_1 / x1), il
       trattino-meno «-» e il meno «−», che restano anche diversi dalle lineette (–430 / -430), i simboli non
       elencati (% # * & + = / _ ° …), e le maiuscole.
     - R3 (packet 0073, Giacomo 04/10): l'apostrofo in FONDO a una parola conta («un po'» / «un po», «E' vero» /
       «E vero»: parole diverse, o un accento scritto a mano). Resta un ritocco solo quando chiude una virgoletta
       semplice aperta in testa a una parola sulla stessa riga («'tempo'» / «tempo», «'il tempo'» / «il tempo»).
       Un apostrofo davanti a una cifra («'45») è un anno abbreviato e non apre niente (giro 2). Limite: un'elisione
       in testa davanti a una lettera («'sto») passa per una virgoletta aperta, e l'apostrofo in fondo alla parola
       che segue sulla riga torna un ritocco.
     Accetta stringhe e materiali interi, confrontati campo per campo (un indice o un'alternativa in più contano). */
  var IN_CODA = /[.,;:!?…«»"“”„()[\]]+$/, IN_TESTA = /^[.,;:!?…«»"“”„'’‘()[\]]+/, LINEETTE = /^[–—‐‑‒―]+$/;
  // `p` arriva con ’ ‘ già resi come '; `aperte` conta le virgolette semplici aperte prima, sulla riga
  function senzaBordi(p, aperte) {
    var inTesta = p.match(IN_TESTA), lunghezzaTesta = inTesta ? inTesta[0].length : 0;
    var apertura = inTesta ? (inTesta[0].match(/'/g) || []).length : 0;
    // un apostrofo davanti a una cifra è l'elisione di un anno («'45», «'68»), non una virgoletta che si apre
    if (apertura && inTesta[0].charAt(lunghezzaTesta - 1) === "'" && /\d/.test(p.charAt(lunghezzaTesta))) apertura--;
    aperte += apertura;
    for (var prima = null; prima !== p;) {
      prima = p;
      p = p.replace(IN_CODA, '');
      if (aperte > 0 && p.length > lunghezzaTesta && p.charAt(p.length - 1) === "'") { p = p.slice(0, -1); aperte--; }
    }
    var testa = p.match(IN_TESTA), k = testa ? testa[0].length : 0;
    // un punto o una virgola davanti a una cifra è un decimale senza zero: resta
    while (k > 0 && /[.,]/.test(p.charAt(k - 1)) && /\d/.test(p.charAt(k))) k--;
    p = p.slice(k);
    return { parola: LINEETTE.test(p) ? '' : p, aperte: aperte };
  }
  function parole(s) {
    return piano(s).split('\n').map(function (riga) {
      var aperte = 0;
      return riga.split(' ').map(function (p) {
        var r = senzaBordi(p.replace(/[’‘]/g, "'").replace(/[“”«»„]/g, '"'), aperte);
        aperte = r.aperte;
        return r.parola;
      }).filter(Boolean).join(' ');
    });
  }
  function nudo(x) {
    if (typeof x === 'string') return parole(x);
    if (Array.isArray(x)) return x.map(nudo);
    if (x && typeof x === 'object') {
      var r = {};
      Object.keys(x).forEach(function (k) { r[k] = nudo(x[k]); });
      return r;
    }
    return x;
  }
  function esitoBottone(generato, testo) { return uguali(nudo(generato), nudo(testo)) ? 'approvato' : 'rivisto'; }
  var ORDINE = ['mc', 'open', 'flashcard', 'causal', 'synthesis'];
  function titoloMateriale(it) {
    if (it.kind === 'causal') return [it.question, it.answer].filter(function (x) { return x != null && x !== ''; }).join(' → ');
    return String(it.title || it.question || it.text || '');
  }
  function righeMateriali(review, opzioni) {
    opzioni = opzioni || {};
    var I = review.initial || {}, report = I.report || {};
    var tutti = lista(review.baseSnapshot && review.baseSnapshot.items).filter(Boolean);
    var nonEsenti = tutti.filter(function (it) { return it.kind !== 'nodesheet'; });
    var approvati = insieme(opzioni.approvati), esclusi = insieme(opzioni.esclusi);
    // R3 (packet 0073): la veste sa che testo arriva all'allievo (l'anteprima intera, con le decisioni composte) e
    // passa i «rivisti»; se l'insieme c'è decide lui, anche vuoto. Senza, si guarda una decisione alla volta.
    var rivisti = own(opzioni, 'rivisti') && opzioni.rivisti != null ? insieme(opzioni.rivisti) : null;
    var cambiato = function (id, sue) { return rivisti ? rivisti.has(id) : cambiatoDalDocente(review, sue); };
    var residui = new Set(I.checkStatus === 'completed' ? [] : ctx().incompleteMaterials(report, tutti).map(function (r) { return eid(r.id); }));
    var perMateriale = new Map();
    lista(I.issues).forEach(function (i) {
      if (!i || !i.target || i.target.kind !== 'item') return;
      var k = eid(i.target.id);
      perMateriale.set(k, (perMateriale.get(k) || []).concat([i]));
    });
    // giro 2 dello 0073 (niente vicoli ciechi): ogni materiale che tiene ferma la chiusura ha una riga — oltre alle
    // segnalazioni (sotto), un conflitto o una struttura non valida che la veste ha trovato nel `preview` (`bloccati`)
    var bloccati = insieme(opzioni.bloccati);
    var numerate = [], k = 0;
    tutti.forEach(function (it) {
      var esente = it.kind === 'nodesheet', n = esente ? null : ++k;
      var id = eid(it.id), sue = perMateriale.get(id) || [], controllo = sue.filter(delControllo);
      var residuo = !esente && residui.has(id);
      var noteAperte = sue.filter(function (i) { return aperta(review, i); }).length;
      /* R7 e R9 (Giacomo, 05/10: «restano fino al clic», «dedotto dai dati»): un materiale su cui esiste una
         segnalazione — del controllo o del docente, aperta o decisa: nota, correzione salvata (anche da «Cerca altre
         occorrenze»), esclusione, ripristino — ha una riga, da rivedere finché non c'è il clic. Le segnalazioni
         restano nella revisione anche dopo decise, quindi la riga regge alla riapertura del Banco. Vale anche per una
         Scheda nodi (quinto giro, punto 4: prima una nota del controllo decisa la faceva uscire). Le segnalazioni del
         docente non fanno «segnalato» e non contano fra le `note`; `noteAperte` conta le aperte di chiunque. */
      if (!residuo && !sue.length && !bloccati.has(id)) return;
      var stato = esclusi.has(id) || esclusoInRevisione(review, sue) ? 'escluso' :
        approvati.has(id) ? (cambiato(id, sue) ? 'rivisto' : 'approvato') : 'da-rivedere';
      numerate.push({ id: id, n: n, tipo: it.kind, titolo: titoloMateriale(it), note: controllo.length, noteAperte: noteAperte,
        residuo: residuo, segnalato: controllo.length > 0, stato: stato,
        fatto: stato !== 'da-rivedere', daFare: stato === 'da-rivedere' });
    });
    var tipi = ORDINE.concat(nonEsenti.map(function (it) { return it.kind; }).filter(function (t, i, a) {
      return ORDINE.indexOf(t) < 0 && a.indexOf(t) === i;
    }), ['nodesheet']);
    var gruppi = tipi.map(function (tipo) {
      var sue = numerate.filter(function (r) { return r.tipo === tipo; });
      return sue.length ? { tipo: tipo, daRivedere: sue.filter(function (r) { return r.daFare; }).length,
        totale: tutti.filter(function (it) { return it.kind === tipo; }).length, righe: sue } : null;
    }).filter(Boolean);
    var righe = [].concat.apply([], gruppi.map(function (g) { return g.righe; }));
    var controllati = new Set(lista((report.coverage || {}).checkedIds).map(eid));
    var conta = function (stato) { return righe.filter(function (r) { return r.stato === stato; }).length; };
    return { righe: righe, gruppi: gruppi, riepilogo: {
      generati: nonEsenti.length,
      verificati: nonEsenti.filter(function (it) { return controllati.has(eid(it.id)) && !residui.has(eid(it.id)); }).length,
      daRivedere: conta('da-rivedere'), rivisti: conta('rivisto'), approvati: conta('approvato'), esclusi: conta('escluso'),
      esenti: tutti.length - nonEsenti.length } };
  }

  /* ── G1: L'ELENCO PER NODO ─────────────────────────────────────────────────
     Tre gruppi: i nodi segnalati (UNA riga per nodo, tutte le sue note), i collegamenti segnalati (una riga
     per collegamento), le parti non lette dal controllo (`copertura.nodiSaltati` e `linkSaltati` dell'ultimo
     rapporto, senza le parti che hanno già una riga). Un collegamento si riconosce da estremi e parole, con le
     parole lette dalla riga della mappa come fa il core (vuote = «include»), anche quando la segnalazione non
     le porta. I non letti restano in elenco ma stanno FUORI dal da fare (decisione di Giacomo del 02/10): la
     chiusura chiede per loro la conferma esplicita. Un non letto che il docente ha corretto resta nel suo
     gruppo, `corretto`: la sua correzione non lo trasforma in un nodo segnalato. `note` conta solo le note del
     controllo; `noteAperte` ogni nota aperta. Niente `preview`. */
  function chiaveLink(t, base) {
    if (t.id != null && t.id !== '') return 'id:' + eid(t.id);
    var r = riga(base, { kind: 'link', source: eid(t.source), target: eid(t.target), rel: t.rel == null ? undefined : t.rel });
    var rel = r ? r.rel : t.rel;
    return JSON.stringify([eid(t.source), eid(t.target), rel == null || rel === '' ? 'include' : String(rel)]);
  }
  function righeMappa(review, db) {
    var I = review.initial || {}, base = review.baseSnapshot || {};
    var etichette = new Map();
    lista(base.nodes).concat(lista(db && db.nodes)).forEach(function (n) {
      if (n && n.label != null && String(n.label) !== '') etichette.set(eid(n.id), String(n.label));
    });
    var nome = function (id, ripiego) { return etichette.get(eid(id)) || ripiego || eid(id); };
    var conta = function (sue) {
      var noteAperte = sue.filter(function (i) { return aperta(review, i); }).length;
      // `note` conta le note del controllo, come in righeMateriali (N4); `noteAperte` ogni nota ancora aperta.
      return { note: sue.filter(delControllo).length, noteAperte: noteAperte, issueIds: sue.map(function (i) { return i.id; }) };
    };
    var soloDocente = function (sue) { return sue.every(function (i) { return i.origin === 'teacher'; }); };
    var corretto = function (sue) { return sue.some(function (i) { return i.origin === 'teacher' && !aperta(review, i); }); };
    var perNodo = new Map(), perLink = new Map();
    lista(I.issues).forEach(function (i) {
      if (!i || !i.target) return;
      var mappaDi = i.target.kind === 'node' ? perNodo : i.target.kind === 'link' ? perLink : null;
      if (!mappaDi) return;
      var k = i.target.kind === 'node' ? eid(i.target.id) : chiaveLink(i.target, base);
      mappaDi.set(k, (mappaDi.get(k) || []).concat([i]));
    });
    var cop = (I.report && I.report.copertura) || {};
    var nodiSaltati = new Map(), linkSaltati = new Map();
    lista(cop.nodiSaltati).forEach(function (n) { var k = eid(n); if (k && !nodiSaltati.has(k)) nodiSaltati.set(k, n); });
    lista(cop.linkSaltati).forEach(function (l) {
      if (!l) return;
      var k = JSON.stringify([eid(l.source), eid(l.target), l.rel == null || l.rel === '' ? 'include' : String(l.rel)]);
      if (!linkSaltati.has(k)) linkSaltati.set(k, l);
    });

    var nodi = [], collegamenti = [], nonLetti = [];
    perNodo.forEach(function (sue, id) {
      if (soloDocente(sue) && nodiSaltati.has(id)) return;
      var c = conta(sue);
      nodi.push(Object.assign({ tipo: 'nodo', id: id, titolo: nome(id) }, c, { fatto: c.noteAperte === 0, daFare: c.noteAperte > 0 }));
    });
    perLink.forEach(function (sue, k) {
      if (soloDocente(sue) && linkSaltati.has(k)) return;
      var t = sue[0].target, c = conta(sue);
      collegamenti.push(Object.assign({ tipo: 'collegamento', id: k, source: eid(t.source), target: eid(t.target), rel: t.rel == null ? '' : String(t.rel),
        titolo: nome(t.source) + ' → ' + nome(t.target) }, c, { fatto: c.noteAperte === 0, daFare: c.noteAperte > 0 }));
    });
    var giaNodi = new Set(nodi.map(function (r) { return r.id; })), giaLink = new Set(collegamenti.map(function (r) { return r.id; }));
    nodiSaltati.forEach(function (n, id) {
      if (giaNodi.has(id)) return;
      var sue = perNodo.get(id) || [], c = conta(sue), fatto = corretto(sue);
      nonLetti.push(Object.assign({ tipo: 'non-letto', oggetto: 'nodo', id: id, titolo: nome(id, n && n.label), motivo: String((n && n.motivo) || '') },
        c, { corretto: fatto, fatto: fatto, daFare: false }));
    });
    linkSaltati.forEach(function (l, k) {
      if (giaLink.has(k)) return;
      var sue = perLink.get(k) || [], c = conta(sue), fatto = corretto(sue);
      nonLetti.push(Object.assign({ tipo: 'non-letto', oggetto: 'collegamento', id: k, source: eid(l.source), target: eid(l.target),
        rel: l.rel == null ? '' : String(l.rel), titolo: nome(l.source) + ' → ' + nome(l.target), motivo: String(l.motivo || '') },
        c, { corretto: fatto, fatto: fatto, daFare: false }));
    });
    var righe = nodi.concat(collegamenti, nonLetti);
    righe.forEach(function (r, k) { r.n = k + 1; });
    return { nodi: nodi, collegamenti: collegamenti, nonLetti: nonLetti, righe: righe };
  }

  /* ── LA RIGA SUCCESSIVA ────────────────────────────────────────────────────
     Dopo quella attiva, nell'ordine dell'elenco, la prima da fare; `null` alla fine (niente giro da capo).
     «Da fare» è `daFare` quando la riga lo porta (le righe di questo modulo lo portano sempre), altrimenti
     «non fatta». Senza riga attiva (o con un id che non c'è più) la prima da fare. */
  function daFare(r) { return !!r && (r.daFare != null ? !!r.daFare : !r.fatto); }
  /* La prossima riga da fare dopo quella attiva. Gate 3 di Giacomo (05/10, G5): finita la lista si riparte dall'inizio
     e si prende la prima ancora da fare (prima di quella attiva, che non è mai «la prossima»); null solo se non ne
     resta nessuna. */
  function successiva(righe, idAttiva) {
    righe = lista(righe);
    var k = idAttiva == null ? -1 : righe.findIndex(function (r) { return r && eid(r.id) === eid(idAttiva); });
    for (var j = k + 1; j < righe.length; j++) if (daFare(righe[j])) return righe[j];
    for (var i = 0; i < k; i++) if (daFare(righe[i])) return righe[i];
    return null;
  }

  /* ── LA CHIUSURA DI G1 ─────────────────────────────────────────────────────
     Che cosa dire nel piede a decisioni finite (rev. 4, B.1 e B.6).
     - `serveConferma`: il controllo non è completo, quindi serve «Ho verificato personalmente…» (è la regola
       con cui il core chiede la conferma esplicita all'approvazione). Lo stato del controllo è quello del core:
       lo passa chi chiama (`review.initial.checkStatus`) oppure si ricava dal core stesso, senza ricopiarne la
       regola.
     - `forma`: 'niente' (il controllo non ha letto niente: saltato, in errore, senza copertura o con zero parti
       esaminate) · 'parziale' (con `parti`, nodi e collegamenti non letti; anche con zero parti quando il
       controllo è parziale per un'altra ragione, per esempio prove scartate) · 'limiti-testo' (nessuna parte
       non letta, e la fonte ha pagine vuote o un ordine di estrazione incerto: la regola che l'app usa già per
       «limiti del testo estratto»).
     - `riprovaPuoRiuscire`: falso quando il controllo è stato saltato DOPO aver costruito le prove della fonte
       senza fornirle (`fonte.fornita === false`): tetto della fonte, fonte non verificabile, nessun testo o
       passaggio citabile — ragioni che un nuovo tentativo sulla stessa fonte non cambia. Vero quando il
       salto viene prima (chiave mancante, trasporto non disponibile). La soglia dei caratteri non si ricopia. */
  function statoControllo(report) {
    try { return rc().createReview({ report: report || null }).initial.checkStatus; } catch (e) { return 'incomplete'; }
  }
  function limitiDelTesto(report) {
    var fonte = (report && report.fonte) || {};
    return Number((fonte.copertura || {}).pagineVuote) > 0 ||
      lista(fonte.diagnostica).some(function (d) { return d && d.code === 'extraction_order'; });
  }
  function chiusura(report, checkStatus) {
    var stato = checkStatus || statoControllo(report);
    var cop = (report && report.copertura) || {};
    var parti = lista(cop.nodiSaltati).length + lista(cop.linkSaltati).length;
    var riprova = !(report && report.stato === 'saltato' && report.fonte && report.fonte.fornita === false);
    if (stato === 'completed') return { serveConferma: false, forma: null, parti: 0, riprovaPuoRiuscire: riprova };
    var esaminati = lista(cop.nodiEsaminati).length + lista(cop.linkEsaminati).length;
    var niente = !report || ['saltato', 'errore', 'in-corso'].indexOf(report.stato) >= 0 || !report.copertura ||
      (Array.isArray(cop.nodiEsaminati) && !esaminati);
    var forma = niente ? 'niente' : parti ? 'parziale' : limitiDelTesto(report) ? 'limiti-testo' : 'parziale';
    return { serveConferma: true, forma: forma, parti: parti, riprovaPuoRiuscire: riprova };
  }

  /* ── LE SPUNTE SU TUTTE LE NOTE (packet 0086, giro 3; ADR 0012 rev. 12, ADR 0010 rev. 4) ──────────────────────────
     La regola unica (D36, firmata il 09/10): il campo tiene un testo solo, e lo sceglie il docente; ogni nota del
     controllo ha una spunta che dice una cosa sola — piena, la sua frase entra nei materiali così com'è nel campo; tolta,
     esce dovunque la nota la teneva fuori —; il bottone in fondo registra tutto insieme. Qui la logica pura:
       §4.1 `spunteDellaRiga`    quali note hanno la spunta, come parte (D39), le spunte legate (D37.3), i conflitti
                                 salvati prima (D37.7);
       §4.5 `usciteSpunteTolte`  che cosa esce con le spunte tolte, nodo per nodo, e quale nodo va riscritto (D37.2,
                                 D38.1);
       §4.4 `chiamateBottone`    le chiamate del bottone in fondo, da applicare in UNA scrittura (D36.3, D37.4-7, D8);
       §4.3 `correzioneDelCampo` il salvataggio del campo, che non decide le note del controllo (D37.1);
       §4.6 `frasiContestate`    il conto delle frasi per l'avviso (invariato).
     Cade il calcolo del giro 1 (`noteConSpunta` con D10, D11, D14 come condizione, B3 e la prova a secco contro il
     contagio; `testoSenzaPasso`; il bottone che registrava solo le spunte piene). Il core delle affermazioni si legge e
     non si modifica (`passoContestato`, `affermazioni`, `corsie`, `copertura`, `normalizza`, `frasiFonte`);
     `mappai-review-core.js` si usa e non si modifica: le chiamate restano addIssue / setDecision, e ogni risultato si
     verifica con `preview` (sul testo della riga, `leggi`) prima di restituirlo. */

  /* Gli spazi si ricuciono solo nel punto del taglio: lo spazio a sinistra del pezzo tolto, quello a destra e quelli
     DENTRO il pezzo (giro 1 bis: un passo di due frasi in due capoversi) diventano uno solo, quello con più a capo (a
     parità il primo da sinistra: un capoverso resta capoverso); uno spazio se nessuno porta un a capo; in testa e in coda
     al testo non resta niente. Il resto del testo, a capo e spazi doppi compresi, resta tale e quale. */
  function ricuci(sx, dx, tolto) {
    var ws = /\s*$/.exec(sx)[0], wd = /^\s*/.exec(dx)[0];
    var a = sx.slice(0, sx.length - ws.length), b = dx.slice(wd.length);
    if (!a) return b;
    if (!b) return a;
    var scelta = ' ', n = 0;
    [ws].concat(String(tolto || '').match(/\s+/g) || [], [wd]).forEach(function (s) {
      var k = aCapo(s);
      if (k > n) { scelta = s; n = k; }
    });
    return a + scelta + b;
  }
  // I pezzi del passo contestato SENZA la decisione (`passi[].testo`, le aggiunte di `_estendi` comprese); null se il
  // passo non si localizza (modo 'nodo': la nota contesta la descrizione intera).
  function pezziDelPasso(A, nota) {
    var p;
    try { p = A.passoContestato(nota); } catch (e) { return null; }
    if (!p || p.modo === 'nodo') return null;
    var pezzi = lista(p.passi).map(function (x) { return x && x.testo; }).filter(function (x) { return typeof x === 'string' && x.trim() !== ''; });
    return pezzi.length ? pezzi : null;
  }
  /* Le frasi dei pezzi come le conta la quarantena: `affermazioni` di ogni pezzo (un pezzo può unire più frasi
     consecutive, `_allarga`), distinte nella forma in cui la quarantena cerca (`formaQuarantena`). */
  function formeDelle(A, pezzi) {
    var forme = [];
    pezzi.forEach(function (x) {
      var frasi;
      try { frasi = A.affermazioni(x).map(function (a) { return a.testo; }); } catch (e) { frasi = [x]; }
      frasi.forEach(function (f) { var k = formaQuarantena(A, f); if (k && forme.indexOf(k) < 0) forme.push(k); });
    });
    return forme;
  }
  /* Il testo senza gli intervalli [inizio, fine) dati (frasi intere di `affermazioni`). Due intervalli separati solo da
     spazi diventano un taglio solo, così lo spazio che resta si sceglie fra tutti quelli del taglio (`ricuci`: un
     capoverso dentro un passo di due frasi resta capoverso); si taglia da destra, e le posizioni a sinistra non cambiano.
     Fuori dai tagli il testo resta tale e quale, a capo e spazi doppi compresi (§4.5: «gli spazi si ricuciono solo nel
     punto del taglio»). */
  function taglia(testo, intervalli) {
    var uniti = [];
    intervalli.slice().sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; }).forEach(function (x) {
      var u = uniti[uniti.length - 1];
      if (u && (x[0] <= u[1] || !/\S/.test(testo.slice(u[1], x[0])))) { u[1] = Math.max(u[1], x[1]); return; }
      uniti.push([x[0], x[1]]);
    });
    var t = testo;
    uniti.reverse().forEach(function (x) { t = ricuci(t.slice(0, x[0]), t.slice(x[1]), testo.slice(x[0], x[1])); });
    return t;
  }
  // La sottosequenza comune più lunga fra due elenchi di stringhe: le coppie [i, j] in ordine crescente.
  function allinea(x, y) {
    var n = x.length, m = y.length, L = [], i, j;
    for (i = 0; i <= n; i++) L.push(new Array(m + 1).fill(0));
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    var coppie = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (x[i] === y[j]) { coppie.push([i, j]); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) i++;
      else j++;
    }
    return coppie;
  }
  /* §4.5 (D37.2; revisione 8, punto 3): dove sta ADESSO, nel testo del campo, il passo contestato di una nota. Il passo è
     quello della quarantena (`passoContestato` senza la decisione: le frasi intere di `issue.before`, le aggiunte di
     `_estendi` comprese, D12). Le frasi del testo di partenza e quelle del campo si allineano (la sottosequenza comune più
     lunga, confrontate nella forma della quarantena, `formaQuarantena`): una frase del passo ancora nel campo esce lei.
     Una frase del passo che nel campo non c'è più tale e quale sta in un tratto fra due frasi rimaste uguali: se il tratto
     nel campo è vuoto la frase è già stata tolta e non esce niente. Giro 3a bis (revisore D1; Giacomo: nel dubbio non esce
     niente, «mai un taglio largo»): esce solo ciò che corrisponde al passo —
       · le frasi del tratto che la quarantena tiene fuori per questa nota nel campo (`trovate`, le righe di `fuoriPer` nel
         suo nodo, nella forma della quarantena: la frase ritoccata, o riscritta con le parole del passo), se sono almeno
         quante le frasi del passo nel tratto;
       · altrimenti, se il tratto era tutto passo e ha tante frasi quante ne aveva, quella allo stesso posto (riscritta da
         capo, o cambiata da una proposta: D37.2); se il passo era tutta la descrizione e non ne resta niente tale e quale,
         tutto il campo (il nodo resterebbe vuoto: decide D38.1, che tiene il testo scritto o chiede di scriverlo);
       · altrimenti il punto non si ritrova e non esce niente (`punto_non_ritrovato`, §4.5: «il bottone non scrive e la riga
         lo dice»): una frase tolta e una aggiunta accanto, o una frase nuova del docente accanto al passo riscritto da
         capo, non si distinguono dal passo riscritto, e prima uscivano (la data corretta in una frase non contestata, la
         frase nuova).
     Restituisce { intervalli } sulle posizioni del campo, { intero: true } se il passo non si localizza (la nota contesta
     la descrizione intera, D39), o { errore }. */
  function puntiDelPasso(A, nota, testo, trovate) {
    var p;
    try { p = A.passoContestato(nota); } catch (e) { return { errore: 'passo_non_calcolabile' }; }
    if (!p || p.modo === 'nodo') return { intero: true };
    var fb = A.affermazioni(typeof nota.before === 'string' ? nota.before : ''), fc = A.affermazioni(testo);
    var nelPasso = fb.map(function (a) {
      return lista(p.passi).some(function (x) { return !!x && a.start >= x.start && a.end <= x.end; });
    });
    if (!nelPasso.some(Boolean)) return { errore: 'punto_non_ritrovato' };
    var forma = function (a) { return formaQuarantena(A, a.testo); };
    var ancore = [[-1, -1]].concat(allinea(fb.map(forma), fc.map(forma)), [[fb.length, fc.length]]);
    var intervalli = [], fuori = function (j) { intervalli.push([fc[j].start, fc[j].end]); };
    var tenuta = function (j) { return trovate instanceof Set && trovate.has(forma(fc[j])); };
    for (var g = 0; g + 1 < ancore.length; g++) {
      var a = ancore[g], b = ancore[g + 1], prima = [], ora = [], i, j;
      for (i = a[0] + 1; i < b[0]; i++) prima.push(i);
      for (j = a[1] + 1; j < b[1]; j++) ora.push(j);
      var delPasso = prima.filter(function (k) { return nelPasso[k]; });
      if (delPasso.length && ora.length) {
        var prese = ora.filter(tenuta);
        // il passo era tutta la descrizione e non ne resta niente tale e quale: tutto il campo è il passo com'è adesso, e
        // il nodo che resterebbe vuoto lo decide D38.1 (resta il testo scritto, o va riscritto): nessun testo si perde
        var tutto = delPasso.length === fb.length && ora.length === fc.length;
        if (prese.length >= delPasso.length) prese.forEach(fuori);
        else if (delPasso.length === prima.length && (prima.length === ora.length || tutto)) ora.forEach(fuori);
        else return { errore: 'punto_non_ritrovato' };
      }
      if (b[0] < fb.length && nelPasso[b[0]]) fuori(b[1]);
    }
    return { intervalli: intervalli };
  }
  /* §4.2 e §4.6 Il conto delle frasi di un insieme di note: le frasi distinte dei loro passi (`n`), e `intero` se una
     nota contesta la descrizione intera (passo non localizzato: «Confermi tutto il testo»). */
  function frasiContestate(note) {
    var A = aff(), forme = [], intero = false;
    (Array.isArray(note) ? note : [note]).forEach(function (i) {
      if (!i) return;
      var pezzi = A && typeof A.affermazioni === 'function' ? pezziDelPasso(A, i) : null;
      if (!pezzi) { intero = true; return; }
      formeDelle(A, pezzi).forEach(function (f) { if (forme.indexOf(f) < 0) forme.push(f); });
    });
    return { n: forme.length, intero: intero };
  }
  /* La riga della barra come bersaglio: un id (un nodo, come prima), una riga di `righeMappa` (nodo, collegamento o non
     letto), una riga di `righeMateriali` (un materiale: porta `stato`), o un bersaglio { kind: 'node'|'link'|'item' }.
     Un collegamento si dice per id ('id:…' nella riga della barra) o per estremi, con le parole quando la riga le porta.
     null se la riga non si riconosce. */
  function collegamentoDi(r) {
    if (r.kind === 'link' && r.id != null && r.id !== '') return { kind: 'link', id: eid(r.id) };
    if (typeof r.id === 'string' && r.id.indexOf('id:') === 0) return { kind: 'link', id: r.id.slice(3) };
    if (r.source == null || r.target == null) return null;
    var l = { kind: 'link', source: eid(r.source), target: eid(r.target) };
    if (r.rel != null && r.rel !== '') l.rel = String(r.rel);
    return l;
  }
  function bersaglioDellaRiga(r) {
    if (r == null || r === '') return null;
    if (typeof r !== 'object') return { kind: 'node', id: eid(r) };
    if (r.kind === 'node' || r.kind === 'item') return r.id == null || r.id === '' ? null : { kind: r.kind, id: eid(r.id) };
    if (r.kind === 'link') return collegamentoDi(r);
    var tipo = r.tipo === 'non-letto' ? (r.oggetto === 'nodo' ? 'nodo' : 'collegamento') : r.tipo;
    if (tipo === 'nodo') return r.id == null || r.id === '' ? null : { kind: 'node', id: eid(r.id) };
    if (tipo === 'collegamento') return collegamentoDi(r);
    if (r.tipo != null && r.id != null && own(r, 'stato')) return { kind: 'item', id: eid(r.id) };
    return null;
  }
  // una segnalazione sta sulla riga: lo stesso nodo, lo stesso collegamento (`stessaRiga`), lo stesso materiale
  function sullaRiga(target, t) {
    if (!target || target.kind !== t.kind) return false;
    return t.kind === 'link' ? stessaRiga(target, t) : eid(target.id) === eid(t.id);
  }
  // il bersaglio di un campo della riga
  function campoDellaRiga(t, field) { return Object.assign({}, t, { field: field }); }
  // le chiamate applicate a una revisione, e le decisioni in `togli` tolte (come farà la veste con le segnalazioni)
  function applicaEsito(review, esito) {
    var r = applica(review, lista(esito.chiamate)), via = lista(esito.togli).map(String);
    if (!via.length) return r;
    var dec = {}, prima = r.initial.decisions || {};
    Object.keys(prima).forEach(function (k) {
      if (via.indexOf(k) < 0) Object.defineProperty(dec, k, { value: prima[k], enumerable: true, configurable: true, writable: true });
    });
    return Object.assign({}, r, { initial: Object.assign({}, r.initial, { decisions: dec }) });
  }
  /* D14 sui nodi non esaminati (quinta verifica dello 0086, ADR 0010 rev. 4): una COPIA della revisione in cui l'ultimo
     rapporto del controllo dà tutti i nodi del db come esaminati (`copertura` li unisce a quelli dei giri precedenti),
     con il rapporto e la copertura creati se mancano: così una frase che la nota tiene fuori in un nodo che il controllo
     non ha letto esce anche lì, e non entra al prossimo giro. null se sulla copia resta un nodo non esaminato. La
     revisione vera non cambia: le parti nuove sono oggetti nuovi, il resto è condiviso e non si scrive. */
  function copiaEsaminata(A, review, db) {
    var ini = review.initial, ids = lista(db && db.nodes).filter(Boolean).map(function (n) { return eid(n.id); });
    var rep = ini.report && typeof ini.report === 'object' ? ini.report : {};
    var cop = rep.copertura && typeof rep.copertura === 'object' ? rep.copertura : {};
    var nuovo = Object.assign({}, ini, { report: Object.assign({}, rep, { copertura: Object.assign({}, cop, { nodiEsaminati: ids.slice(), nodiSaltati: [] }) }) });
    var copia = Object.assign({}, review, { initial: nuovo });
    return lista(A.copertura(copia, db).nonEsaminati).length ? null : copia;
  }
  /* D14 nota per nota (terza, quarta e quinta verifica dello 0086): le righe che la quarantena tiene fuori per UNA nota,
     in qualunque nodo — le frasi del passo, le quasi-copie negli altri nodi, la coesione e le riprese nel suo —, con
     `corsie` sulla copia esaminata con QUELLA nota messa per prima fra le segnalazioni (`corsie` dà ogni riga alla prima
     nota che la prende) e in sospeso (una nota in conflitto salvata prima, D37.7, è decisa: la quarantena non la
     vedrebbe). `corsie` che lancia: lancia, e chi chiama lo dice. */
  function fuoriPer(A, copia, nota, db, opzioni) {
    var dec = {}, prima = copia.initial.decisions || {};
    Object.keys(prima).forEach(function (k) {
      if (k !== String(nota.id)) Object.defineProperty(dec, k, { value: prima[k], enumerable: true, configurable: true, writable: true });
    });
    var sua = lista(copia.initial.issues).find(function (x) { return x && x.id === nota.id; }) || nota;
    var r = Object.assign({}, copia, { initial: Object.assign({}, copia.initial, { decisions: dec,
      issues: [sua].concat(lista(copia.initial.issues).filter(function (x) { return !x || x.id !== nota.id; })) }) });
    var c = A.corsie(Object.assign({ review: r, db: db }, opzioni)), fuori = lista(A.FUORI);
    return lista(c && c.righe).filter(function (x) { return !!x && x.issueId === nota.id && fuori.indexOf(x.corsia) >= 0; });
  }
  /* I conflitti salvati prima sulla riga (D37.7): gli id delle segnalazioni che `preview`, ristretto alle decisioni
     della riga (`anteprima`), dà in `conflicting_decisions`, tutte e due le parti. Un altro difetto della riga (la
     revisione superata, un bersaglio sparito, una sostituzione non valida) è un errore: la scheda non è quella di adesso. */
  function conflittiDellaRiga(review, db, t, sources) {
    var p = anteprima(review, db, t, sources), ids = new Set();
    var altri = lista(p.conflicts).filter(function (c) { return !c || c.code !== 'conflicting_decisions'; });
    if (altri.length) return { errore: (altri[0] && altri[0].code) || 'anteprima_non_valida' };
    lista(p.conflicts).forEach(function (c) {
      if (c.issueId != null) ids.add(String(c.issueId));
      if (c.otherIssueId != null) ids.add(String(c.otherIssueId));
    });
    return { ids: ids };
  }
  /* §4.1 Le spunte della riga (D36.2, D37.3, D37.4, D37.7, D39; ADR 0012 rev. 12, punto 2; ADR 0010 rev. 4). Hanno la
     spunta tutte le note del controllo della riga ancora aperte — o in conflitto fra loro, salvate prima (D37.7) —, anche
     una sola (cade B3): sulla descrizione (col passo localizzato o no, con o senza proposta, con o senza quasi-copie
     altrove: D14 non è più una condizione), sul collegamento (`$link`) e sulle sue parole (`rel`), in G2 sui campi e
     sull'esclusione (`$item`). Non l'hanno le richieste del docente (non contestano) né le note sul titolo (la quarantena
     non tiene mai fuori un titolo, D37.4), né le note già decise.
     Ogni nota: { id, campo, piena, intero, frasi, conflitto, gruppo }. `piena` è lo stato di PARTENZA della spunta: vuota
     sulle note che contestano la descrizione intera (`intero`: il passo non si localizza, D39), piena sulle altre.
     `frasi`: le frasi distinte del passo, come le conta la quarantena (per «Tieni la frase» / «Tieni le {n} frasi»).
     Le spunte legate (D37.3): le note della descrizione i cui passi hanno lo stesso insieme di frasi, nella forma della
     quarantena (`formeDelle` dei pezzi; per una nota intera tutte le frasi del testo di partenza), formano un gruppo con
     una spunta sola: `gruppo` è l'id della prima nota del gruppo, `gruppi` gli elenchi dei gruppi di due o più note, e un
     gruppo con una nota intera parte vuoto. Passi che si sovrappongono solo in parte (A su S2, B su S1 S2) non sono
     legati (revisione 12, punto 6). Senza il core delle affermazioni le note della descrizione non si possono misurare:
     `affermazioni_mancanti`. Dati: { review, db?, sources?, riga } (la riga come in `bersaglioDellaRiga`). Restituisce
     { note, gruppi } o { errore }. */
  function spunteDellaRiga(dati) {
    try {
      var s = spunte(dati || {});
      if (!s.errore) { delete s.riga; delete s.conflitti; }
      return s;
    } catch (e) { return { errore: (e && (e.code || e.message)) || 'errore' }; }
  }
  function spunte(dati) {
    var review = dati.review;
    if (!review || !review.initial || !review.baseSnapshot) return { errore: 'invalid_review' };
    var tr = bersaglioDellaRiga(dati.riga);
    if (!tr) return { errore: 'riga_mancante' };
    var db = dati.db || review.baseSnapshot;
    var cf = conflittiDellaRiga(review, db, campoDellaRiga(tr, tr.kind === 'node' ? 'desc' : tr.kind === 'link' ? 'rel' : '$item'), dati.sources);
    if (cf.errore) return { errore: cf.errore };
    var A = aff(), note = [], chiavi = new Map();
    var sue = lista(review.initial.issues).filter(function (i) {
      if (!i || !i.target || !sullaRiga(i.target, tr) || !delControllo(i)) return false;
      if (i.target.kind === 'node' && campo(i.target) === 'label') return false;
      return aperta(review, i) || cf.ids.has(String(i.id));
    });
    for (var k = 0; k < sue.length; k++) {
      var i = sue[k], f = campo(i.target);
      var n = { id: i.id, campo: f, piena: true, intero: false, frasi: 0, conflitto: cf.ids.has(String(i.id)), gruppo: i.id };
      if (i.target.kind === 'node' && f === 'desc') {
        if (!A || typeof A.affermazioni !== 'function') return { errore: 'affermazioni_mancanti' };
        var pezzi = pezziDelPasso(A, i);
        var forme = formeDelle(A, pezzi || [typeof i.before === 'string' ? i.before : '']);
        n.intero = !pezzi; n.piena = !!pezzi; n.frasi = pezzi ? forme.length : 0;
        chiavi.set(n, forme.slice().sort().join('\u0000'));
      }
      note.push(n);
    }
    var perChiave = new Map(), gruppi = [];
    chiavi.forEach(function (c, n) { if (!perChiave.has(c)) perChiave.set(c, []); perChiave.get(c).push(n); });
    perChiave.forEach(function (g) {
      if (g.length < 2) return;
      var piena = g.every(function (n) { return !n.intero; });
      g.forEach(function (n) { n.gruppo = g[0].id; n.piena = piena; });
      gruppi.push(g.map(function (n) { return n.id; }));
    });
    return { riga: tr, note: note, gruppi: gruppi, conflitti: cf.ids };
  }
  /* D38.1 e D40: la descrizione di un nodo l'ha riscritta il docente IN QUESTA SEDUTA («finché quel campo non cambia»)?
     Sì se (D40.1, Giacomo: «Conta solo la riscrittura di adesso») è diversa, a meno di spazi (`piano`), dal testo che
     aveva all'apertura del Banco (`apertura`, che passa la veste: una riscrittura salvata in una seduta di prima non basta,
     e un nodo senza testo d'apertura non conta mai come riscritto — fallisce chiusa) E (D40.2, «Sì, nessuna frase
     generata») del testo generato non resta nessuna frase tale e quale, nella forma della quarantena; e il testo non è la
     proposta di una nota del controllo sul nodo né quello che danno le sole proposte del controllo già scelte (una
     proposta copiata nel campo, o scelta prima, non è un testo scritto). Una correzione di UN'altra frase non basta: la
     descrizione contestata entrerebbe senza un gesto sulla sua nota (D39). Misurato sulla seduta del 27/09 (giro 3a): con
     «diverso dall'Originale» 8 righe su 11 col bottone spento passavano; con le sole frasi generate ne passavano 3
     (riscritte il 27/09), e le loro note intere toglievano frasi da altri nodi senza una spunta toccata (76,9% e 4/38).
     Giro 3a bis (L2, revisore D3): nel campo non deve restare nessuna frase generata NÉ nessuna frase del testo
     all'apertura, nella forma «nuda» (`formaNuda`: un punto tolto, «.» → «!» non fanno una riscrittura); un campo vuoto o di
     soli spazi non arriva qui (`uscite` e `bottone` lo mandano prima in «da riscrivere», D38.1). ADR 0012 rev. 15 (packet
     0089): con `stretto` (la nota sulla descrizione intera, D39) valeva in più la soglia di contenimento (≥ `CONTENIMENTO`);
     è spenta, perché è il docente ad avere l'ultima parola. `stretto` resta nella firma e non cambia più l'esito. */
  function testoDApertura(apertura, id) {
    if (apertura instanceof Map) return apertura.has(id) ? apertura.get(id) : null;
    return apertura && typeof apertura === 'object' && own(apertura, id) ? apertura[id] : null;
  }
  function scrittoDalDocente(review, db, id, testo, sources, apertura, stretto) {
    return riscrittura(review, db, id, testo, sources, apertura, stretto).si;
  }
  /* Giro 3d, punto 4 (difetto 4 della verifica unica): lo stesso giudizio di `scrittoDalDocente`, col perché. `resta` è la
     frase del campo (com'è scritta lì) che riprende ancora una frase generata o dell'apertura — tale e quale nella forma
     «nuda» —, solo quando il docente ha cambiato il campo in questa seduta (diverso
     dall'apertura e dal testo generato): la riga del bottone spento dice quella frase («La tua descrizione contiene ancora
     «…»»), non di scrivere la descrizione. In ogni altro caso `resta` è null. */
  function riscrittura(review, db, id, testo, sources, apertura, stretto) {
    var no = { si: false, resta: null };
    var t = { kind: 'node', id: id, field: 'desc' }, base = trovate(review.baseSnapshot, t);
    if (base.length !== 1) return no;
    var p = piano(String(testo)), generato = valoreDi(review.baseSnapshot.nodes[base[0]], t), ap = testoDApertura(apertura, id);
    if (ap == null || p === piano(String(ap))) return no;
    if (p === piano(generato)) return no;
    var A = aff();
    if (!A || typeof A.affermazioni !== 'function') return no;
    var date = new Set(), prime = A.affermazioni(generato).concat(A.affermazioni(String(ap)));
    prime.forEach(function (a) { var k = formaNuda(A, a.testo); if (k) date.add(k); });
    var mie = A.affermazioni(String(testo));
    var uguale = mie.find(function (a) { return date.has(formaNuda(A, a.testo)); });
    if (uguale) return { si: false, resta: uguale.testo };
    var sue = lista(review.initial.issues).filter(function (i) { return i && i.target && stessoCampo(i.target, t) && delControllo(i); });
    if (sue.some(function (i) { return i.hasProposal && typeof i.after === 'string' && piano(i.after) === p; })) return no;
    var scelte = sue.filter(function (i) { var d = decisione(review, i); return !!d && d.choice === 'accept' && i.hasProposal; });
    if (scelte.length) {
      var pv = rc().preview(Object.assign({}, review, { initial: Object.assign({}, review.initial, { issues: scelte }) }), db,
        sources === undefined ? undefined : { sources: sources });
      var r = pv.ok ? riga(pv.db, t) : null;
      if (r && piano(valoreDi(r, t)) === p) return no;
    }
    return { si: true, resta: null };
  }
  /* §4.5 Che cosa esce con le spunte tolte (D2, D12, D14, D36.2, D37.2, D38.1; ADR 0012 rev. 12, punto 3; ADR 0010 rev. 4).
     Per ogni nota della descrizione della riga con la spunta tolta escono: le frasi del suo passo nel campo, dove stanno
     adesso (`puntiDelPasso`: riscritte o ritoccate escono come sono adesso, D37.2), e tutto ciò che la quarantena tiene
     fuori per lei, in qualunque nodo — le quasi-copie negli altri nodi, la coesione e le riprese nel suo — con `corsie`
     nota per nota sulla copia della revisione in cui tutti i nodi risultano esaminati (`fuoriPer`, `copiaEsaminata`).
     La quarantena guarda la revisione col testo del campo registrato (`registraCampo`, anche quello in sospeso, e un
     conflitto salvato prima sul campo sostituito): vede le frasi come sono adesso. Una riga che la quarantena tiene fuori
     si ritrova nel testo del suo nodo per frase intera, nella forma della quarantena (anche ripetuta: escono tutte). Gli
     spazi si ricuciono solo nel punto del taglio (`taglia`).
     Un nodo che resterebbe vuoto — la nota contesta la descrizione intera (D39), il passo e ciò che la quarantena tiene
     fuori con lui sono tutta la descrizione, la quasi-copia è l'unica frase di un altro nodo — va riscritto (D38.1:
     `mappai-review-core.js` non accetta una descrizione vuota): va in `daRiscrivere` con le note che lo svuotano e il
     motivo ('descrizione_intera', 'nodo_svuotato', 'quasi_copia'). Se invece il docente ha già scritto lui quel testo
     (`scrittoDalDocente`), la descrizione generata esce intera e resta il testo scritto: il nodo tiene il suo testo.
     Dati: { review, db?, sources?, riga, tolte: [id], testo?, apertura? } — `apertura` (D40): { idNodo: testo della
     descrizione all'apertura del Banco } (oggetto o Map), per i nodi che la veste conosce; senza, nessun nodo conta come
     riscritto in questa seduta. `testo` è il campo della descrizione della riga (salvato
     o in sospeso; senza, il testo di adesso); le note di `tolte` che non sono note del controllo sulla descrizione della
     riga si ignorano. Restituisce { nodi: [{ id, prima, dopo, issueIds }], daRiscrivere: [{ id, issueIds, motivo }] }:
     il nodo della riga c'è sempre (se non va riscritto), gli altri solo se cambiano. Errori dichiarati, senza uscite:
     { errore: 'punto_non_ritrovato', issueId, nodo } (il passo, o una riga della quarantena, non si ritrova nel testo di
     adesso), { errore: 'corsie', issueId } (la quarantena ha lanciato un errore), e quelli della revisione.
     Giro 3a bis:
     - L1 (revisore D2): «dovunque quella nota la teneva fuori» negli ALTRI nodi si calcola sullo stato all'apertura della
       seduta (`allApertura`: il campo della riga, e ogni nodo cambiato in questa seduta, col testo che avevano
       all'apertura, `apertura`; senza, il testo salvato), non sul testo riscritto: una riscrittura non allarga mai ciò che
       la spunta fa uscire. Nel suo nodo le righe restano quelle di adesso (D37.2: la frase com'è adesso). E non esce mai
       una frase che un'altra decisione del docente ha confermato (`confermateIn`: «Tieni il testo», o una scelta che non
       ha cambiato il testo — `confermata` della quarantena — sul passo della sua nota), tranne il passo stesso di questa
       nota nel suo campo (la spunta tolta è il gesto su quella frase). Una riga dell'apertura che nel testo di adesso di
       un altro nodo non c'è più (il docente l'ha tolta o ritoccata in questa seduta) non esce.
     - D37.7 vale solo per la riga del bottone (revisore D8): un altro nodo con scelte salvate in conflitto non si legge, e
       la sua quasi-copia è `punto_non_ritrovato` con quel nodo (le sue scelte non tornano in sospeso).
     - D38.1 (verificatore §4.3): un campo vuoto o di soli spazi va scritto: `daRiscrivere` col nodo della riga.
     - L3 (revisore D4): senza `testo`, il campo è quello che danno le scelte salvate senza conflitto (`leggiBase`). */
  function usciteSpunteTolte(dati) {
    try { return uscite(dati || {}); } catch (e) { return { errore: (e && (e.code || e.message)) || 'errore' }; }
  }
  /* L1: la copia esaminata della revisione con il campo della riga e i nodi cambiati in questa seduta riportati al testo
     dell'apertura. null se non si costruisce (chi chiama lo dice: la spunta tolta non sa che cosa farebbe uscire). */
  function allApertura(A, ctxU, t, testoCampo, stato, apertura, reg, copia) {
    var review = ctxU.review, db = ctxU.db, mioId = eid(t.id);
    var mio = testoDApertura(apertura, mioId);
    if (typeof mio !== 'string') mio = typeof stato.adesso === 'string' ? stato.adesso : testoCampo;
    var esiti = [];
    if (piano(mio) === piano(testoCampo)) esiti.push(reg);
    else {
      var r0 = registraCampo(ctxU, t, mio, {}, { minimo: true });
      if (r0.errore) return null;
      esiti.push(r0);
    }
    if (apertura && typeof apertura === 'object') lista(db && db.nodes).forEach(function (n) {
      var id = n ? eid(n.id) : '', a = id ? testoDApertura(apertura, id) : null;
      if (!id || id === mioId || typeof a !== 'string') return;
      var tx = { kind: 'node', id: id, field: 'desc' }, s = leggi(review, db, tx, ctxU.sources);
      if (s.errore || !s.ok || s.escluso || typeof s.adesso !== 'string' || piano(s.adesso) === piano(a)) return;
      var rx = registraCampo(ctxU, tx, a, {}, { minimo: true });
      if (!rx.errore) esiti.push(rx);
    });
    if (esiti.length === 1 && esiti[0] === reg) return copia;
    var tutto = { chiamate: [], togli: [] };
    esiti.forEach(function (e) { tutto.chiamate = tutto.chiamate.concat(e.chiamate); tutto.togli = tutto.togli.concat(e.togli); });
    try { return copiaEsaminata(A, applicaEsito(review, tutto), db); } catch (e) { return null; }
  }
  /* L1: le frasi del nodo `id` che un'altra decisione salvata del docente ha confermato (`confermata` della quarantena:
     «Tieni il testo», o «Usa la proposta» / una correzione che non hanno cambiato il testo): le frasi del passo della sua
     nota, nella forma della quarantena; tutte quelle della descrizione se la nota la contesta intera. Le scelte in
     conflitto (`via`) non confermano niente: le sostituisce il bottone (D37.7). */
  function confermateIn(A, review, id, via) {
    var forme = new Set();
    lista(review.initial.issues).forEach(function (j) {
      if (!j || !j.target || j.target.kind !== 'node' || eid(j.target.id) !== id || campo(j.target) !== 'desc' || via.has(String(j.id))) return;
      var d = decisione(review, j), si = false;
      if (!d) return;
      try { si = typeof A.confermata === 'function' ? A.confermata(j, d) : d.choice === 'reject'; } catch (e) { si = d.choice === 'reject'; }
      if (!si) return;
      formeDelle(A, pezziDelPasso(A, j) || [typeof j.before === 'string' ? j.before : '']).forEach(function (f) { forme.add(f); });
    });
    return forme;
  }
  function uscite(dati) {
    var review = dati.review;
    if (!review || !review.initial || !review.baseSnapshot) return { errore: 'invalid_review' };
    var tr = bersaglioDellaRiga(dati.riga);
    if (!tr) return { errore: 'riga_mancante' };
    var tolte = insieme(dati.tolte), db = dati.db || review.baseSnapshot;
    var note = tr.kind !== 'node' ? [] : lista(review.initial.issues).filter(function (i) {
      return i && i.target && sullaRiga(i.target, tr) && campo(i.target) === 'desc' && delControllo(i) && tolte.has(eid(i.id));
    });
    if (!note.length) return { nodi: [], daRiscrivere: [] };
    var A = aff();
    if (!A || typeof A.corsie !== 'function' || typeof A.copertura !== 'function' || typeof A.affermazioni !== 'function') return { errore: 'affermazioni_mancanti' };
    var t = campoDellaRiga(tr, 'desc'), stato = leggiBase(review, db, t, dati.sources), mioId = eid(tr.id);
    if (stato.errore) return { errore: stato.errore };
    if (stato.escluso) return { errore: 'elemento_tolto' };
    var testoCampo = own(dati, 'testo') && dati.testo != null ? String(dati.testo) : String(stato.adesso);
    // D38.1: un campo vuoto o di soli spazi non è una descrizione da tenere (`mappai-review-core.js` la rifiuta)
    if (!testoCampo.trim()) {
      // giro 3d, punto 4: con una nota sulla descrizione intera la riga nomina lei (era la prima delle tolte)
      var intere = note.filter(function (n) { return !pezziDelPasso(A, n); });
      return { nodi: [], daRiscrivere: [{ id: mioId, issueIds: (intere.length ? intere : note).map(function (n) { return n.id; }), motivo: intere.length ? 'descrizione_intera' : 'nodo_svuotato' }] };
    }
    var ctxU = { review: review, db: db, sources: dati.sources };
    var reg = registraCampo(ctxU, t, testoCampo, {}, { minimo: true });
    if (reg.errore) return { errore: reg.errore };
    var copia = copiaEsaminata(A, applicaEsito(review, reg), db);
    if (!copia) return { errore: 'copertura_non_calcolabile' };
    var copiaAp = allApertura(A, ctxU, t, testoCampo, stato, dati.apertura, reg, copia);
    if (!copiaAp) return { errore: 'corsie', issueId: note[0].id };
    var opzioni = own(dati, 'sources') ? { sources: dati.sources } : {};
    // le frasi della fonte non cambiano da una nota all'altra: `corsie` le ricalcolerebbe ogni volta
    opzioni.frasi = A.frasiFonte(own(dati, 'sources') ? dati.sources : review.sources);
    var nodi = new Map(), conferme = new Map(), via = idsInConflitto(stato.conflitti);
    var nodo = function (id) {
      if (!nodi.has(id)) {
        var testo = testoCampo;
        if (id !== mioId) {
          // un altro nodo si legge com'è salvato; con scelte in conflitto non si legge (D37.7 vale solo per questa riga)
          var s = leggi(review, db, { kind: 'node', id: id, field: 'desc' }, dati.sources);
          if (s.errore || !s.ok || s.escluso || typeof s.adesso !== 'string') return null;
          testo = s.adesso;
        }
        nodi.set(id, { id: id, prima: testo, frasi: A.affermazioni(testo), intervalli: [], issueIds: [], intero: false, interi: [] });
      }
      return nodi.get(id);
    };
    var confermate = function (id) {
      if (!conferme.has(id)) conferme.set(id, confermateIn(A, review, id, id === mioId ? via : new Set()));
      return conferme.get(id);
    };
    for (var k = 0; k < note.length; k++) {
      var n = note[k], mio = nodo(mioId);
      mio.issueIds.push(n.id);
      var adesso, prima;
      try {
        adesso = fuoriPer(A, copia, n, db, opzioni);
        prima = copiaAp === copia ? adesso : fuoriPer(A, copiaAp, n, db, opzioni);
      } catch (e) { return { errore: 'corsie', issueId: n.id }; }
      // le frasi che la quarantena tiene fuori per la nota nel campo di adesso: dove sta il passo, D37.2
      var trovate = new Set(adesso.filter(function (r) { return eid(r.nodeId) === mioId; }).map(function (r) { return formaQuarantena(A, r.testo); }));
      var punti = puntiDelPasso(A, n, testoCampo, trovate), passo = [];
      if (punti.errore) return { errore: punti.errore, issueId: n.id, nodo: mioId };
      if (punti.intero) { mio.intero = true; mio.interi.push(n.id); }
      else { passo = punti.intervalli; mio.intervalli = mio.intervalli.concat(passo); }
      // nel suo nodo le righe di adesso (una nota sulla descrizione intera lo tiene fuori tutto: lì decide D38.1, sotto);
      // negli altri le righe dell'apertura (L1)
      var righe = (punti.intero ? [] : adesso.filter(function (r) { return eid(r.nodeId) === mioId; }))
        .concat(prima.filter(function (r) { return eid(r.nodeId) !== mioId; }));
      for (var j = 0; j < righe.length; j++) {
        var idN = eid(righe[j].nodeId), suo = idN === mioId;
        var x = nodo(idN);
        if (!x) return { errore: 'punto_non_ritrovato', issueId: n.id, nodo: idN };
        var forma = formaQuarantena(A, righe[j].testo);
        var stesse = x.frasi.filter(function (fr) { return formaQuarantena(A, fr.testo) === forma; });
        if (!stesse.length) {
          if (suo) return { errore: 'punto_non_ritrovato', issueId: n.id, nodo: x.id };
          continue;
        }
        // L1: una frase confermata da un'altra decisione del docente resta (non il passo di questa nota nel suo campo)
        if (confermate(idN).has(forma)) {
          stesse = stesse.filter(function (fr) { return suo && passo.some(function (p) { return p[0] === fr.start && p[1] === fr.end; }); });
          if (!stesse.length) continue;
        }
        if (x.issueIds.indexOf(n.id) < 0) x.issueIds.push(n.id);
        stesse.forEach(function (fr) { x.intervalli.push([fr.start, fr.end]); });
      }
    }
    /* D38.1. Una nota sulla descrizione intera, col campo che è ancora il testo generato: va riscritto. Col campo scritto
       dal docente la descrizione generata esce intera e resta il testo scritto, tolte le frasi delle ALTRE note della
       riga con la spunta tolta. Un nodo che i tagli svuoterebbero: va riscritto, o — scritto dal docente — tiene il suo. */
    /* Giro 3a bis (revisore D3; D40.2: «una correzione su una frase sola non basta»): per la nota sulla descrizione intera,
       la cui spunta parte vuota senza un gesto del docente (D39), il campo conta come scritto se non vi resta nessuna frase
       generata o dell'apertura tale e quale (ADR 0012 rev. 15, packet 0089: la soglia di contenimento di `stretto` è spenta). */
    /* Giro 3d, punto 4 (difetti 3 e 4 della verifica unica): la riga del bottone spento nomina la nota giusta — per la
       descrizione intera la nota sulla descrizione intera (`interi`), non la prima delle tolte —, e quando il docente ha
       riscritto il campo in questa seduta ma una frase riprende ancora quella generata, `resta` dice quale. */
    var esito = { nodi: [], daRiscrivere: [] };
    nodi.forEach(function (x) {
      var suo = x.id === mioId, dopo = taglia(x.prima, x.intervalli), scritto = {};
      var delDocente = function (stretto) {
        var k = stretto ? 's' : 'n';
        if (!own(scritto, k)) scritto[k] = riscrittura(review, db, x.id, x.prima, dati.sources, dati.apertura, stretto);
        return scritto[k].si;
      };
      var conResta = function (r, stretto) { var q = scritto[stretto ? 's' : 'n']; if (q && q.resta) r.resta = q.resta; return r; };
      if (x.intero && !delDocente(true)) {
        esito.daRiscrivere.push(conResta({ id: x.id, issueIds: (x.interi.length ? x.interi : x.issueIds).slice(), motivo: 'descrizione_intera' }, true));
        return;
      }
      if (!dopo.trim()) {
        if (!delDocente(false)) {
          esito.daRiscrivere.push(conResta({ id: x.id, issueIds: x.issueIds.slice(), motivo: suo ? 'nodo_svuotato' : 'quasi_copia' }, false));
          return;
        }
        dopo = x.prima;
      }
      if (suo || dopo !== x.prima) esito.nodi.push({ id: x.id, prima: x.prima, dopo: dopo, issueIds: x.issueIds.slice() });
    });
    return esito;
  }
  /* Il testo finale di un campo nella forma in cui si registra (regola 1-ter e regola 2 di `calcola`): identico alla
     proposta di una nota del campo resta com'è; uguale a meno di spazi (`piano`) al testo di partenza È il testo di
     partenza (mai verso un testo vuoto); uguale a meno di spazi alla proposta di una nota È quella proposta (la prima). */
  function canonico(T, partenza, delCampo) {
    var proposte = delCampo.filter(function (i) { return i.hasProposal && i.after !== null && i.after !== undefined; });
    if (proposte.some(function (i) { return uguali(i.after, T); })) return T;
    if (!uguali(T, partenza) && uguali(piano(T), piano(partenza)) && !(typeof partenza === 'string' && piano(partenza) === '')) return clone(partenza);
    var simile = proposte.find(function (i) { return uguali(piano(i.after), piano(T)); });
    return simile ? clone(simile.after) : T;
  }
  function delCampoDi(review, t) { return lista(review.initial.issues).filter(function (i) { return i && i.target && stessoCampo(i.target, t); }); }
  function nellaForma(review, db, t, T, sources) {
    var s = leggi(review, db, t, sources);
    return s.errore ? T : canonico(T, s.partenza, delCampoDi(review, t));
  }
  function contesto(review, db, dati) {
    var c = { review: review, db: db, sources: dati.sources, problema: dati.problema };
    if (own(dati, 'now')) c.now = dati.now;
    return c;
  }
  /* La registrazione di UN campo col suo testo finale `T` (§4.3 e §4.4): le chiamate perché, applicate, il campo valga
     `T`, senza decidere le note aperte del controllo che non stanno in `scelte` (D37.1).
     - `T` nella forma che lo registra (`canonico`); «Nessuna» sulle parole di un collegamento è il testo vuoto con relNone;
     - le note in `scelte` ({ id: 'accept' | 'reject' | 'manual' }) prendono quella decisione: 'manual' col testo `T`, e
       con `T` uguale al testo di partenza 'reject' (nessun 'manual' uguale all'Originale);
     - le note del controllo già decise con 'accept' o 'manual' che non danno `T` lo seguono ('manual' col testo `T`, o
       'reject' con `T` di partenza): altrimenti `preview` le comporrebbe col testo nuovo e darebbe
       `conflicting_decisions` o un testo diverso dal campo (è la regola 5 di `calcola`). Quelle in conflitto, salvate
       prima (D37.7), tornano invece in sospeso: riprendono la spunta (§4.1) e le decide il bottone in fondo. Le note
       aperte e le 'reject' non si toccano;
     - le segnalazioni del docente sul campo: le decise prendono `T` ('manual'), o — con `T` di partenza — vanno in `togli`
       (`mappai-review-core.js` non ha la chiamata che toglie una segnalazione: la toglie chi applica, come fa oggi la
       veste); le aperte (le richieste) si chiudono con `T`, ma restano aperte con `T` di partenza e quando registra il
       bottone (`bottone`: le richieste non ricevono chiamate dal bottone in fondo, §4.4);
     - se alla fine nessuna decisione del campo porta `T` (e `T` non è il testo di partenza), o con `forzaDocente` se non
       ce n'è una del docente, nasce la correzione del docente (`addIssue` + 'manual'), già decisa, motivo `problema`;
     - G2, la regola 3 di `calcola`: con decisioni $item attive sul materiale la correzione va in loro, col materiale
       intero (in conflitto non si compone: `conflitto_da_sciogliere`);
     - `minimo` (il bottone): se il campo vale già `T` le decisioni già prese non si toccano.
     Giro 3a bis: con scelte salvate in conflitto «il campo vale già `T`» si legge sul testo che danno le ALTRE scelte salvate
     (`leggiBase`, L3: le scelte che non confliggono restano); le scelte in conflitto tornano in sospeso comunque (D37.7).
     Un altro nodo (una quasi-copia) con scelte in conflitto non arriva qui: `uscite` non lo legge e lo dice (revisore D8).
     `decise` (il bottone): le note che il gesto decide; non contano fra le decisioni $item «attive» della regola 3
     (verificatore §4.1: in G2 le $item in conflitto hanno la spunta).
     Giro 3c:
     - L6 (Giacomo: ««Un solo bottone in fondo»»): col bottone (`opz.bottone`) una richiesta del docente aperta sul campo si
       chiude col testo che resta (`manual` con `T`, o `reject` con `T` di partenza), insieme alle note; con la correzione
       che va nel materiale intero (regola 3) si chiude con `reject` (il testo lo porta la decisione $item);
     - D37.7 in G2 (`opz.via`): le correzioni del docente in conflitto sul materiale, che il bottone toglie (`bottone`), qui
       non si toccano e non contano: né fra le «attive» della regola 3 né fra le decisioni che portano `T`.
     Restituisce { chiamate, togli, T } o { errore }. La verifica la fa chi chiama, sul risultato (`verificaCampi`). */
  function registraCampo(ctx, t, T, scelte, opz) {
    opz = opz || {}; scelte = scelte || {};
    var review = ctx.review, f = campo(t), stato = leggi(review, ctx.db, t, ctx.sources);
    if (stato.errore) return { errore: stato.errore };
    var delCampo = delCampoDi(review, t);
    T = canonico(T, stato.partenza, delCampo);
    var allaPartenza = uguali(T, stato.partenza), nessuna = t.kind === 'link' && f === 'rel' && T === '';
    var inConflitto = idsInConflitto(stato.conflitti);
    var base = stato.ok ? stato : leggiBase(review, ctx.db, t, ctx.sources);
    var giaDecisa = function (i) { return !!(opz.decise && opz.decise.has(String(i.id))); };
    var via = function (i) { return !!(opz.via && opz.via.has(String(i.id))); };
    // L6: col bottone la richiesta del docente aperta prende il testo che resta nel campo
    var richiestaAperta = function (i) { return !!opz.bottone && i.origin === 'teacher' && aperta(review, i); };
    var opts = function (extra) { return Object.assign(own(ctx, 'now') ? { now: ctx.now } : {}, extra || {}); };
    var testo = function () { return opts(nessuna ? { text: '', relNone: true } : { text: clone(T) }); };
    var chiamate = [], togli = [];
    var scelta = function (i) { return own(scelte, i.id) ? scelte[i.id] : undefined; };
    var decidi = function (i, choice) {
      var d = decisione(review, i);
      if (choice === 'manual' && allaPartenza) choice = 'reject';
      if (choice === 'manual') {
        if (!(d && d.choice === 'manual' && uguali(d.text, T) && (!nessuna || d.relNone === true))) chiamate.push({ chiamata: 'setDecision', issueId: i.id, choice: 'manual', opts: testo() });
        return;
      }
      if (d ? d.choice !== choice : choice !== 'pending') chiamate.push({ chiamata: 'setDecision', issueId: i.id, choice: choice, opts: opts() });
    };
    if (t.kind === 'item' && f !== '$item') {
      var attive = lista(review.initial.issues).filter(function (i) {
        return i && i.target && i.target.kind === 'item' && eid(i.target.id) === eid(t.id) && campo(i.target) === '$item' &&
          scelta(i) === undefined && !giaDecisa(i) && !via(i) && ['applied', 'edited'].indexOf(esito(review, i)) >= 0;
      });
      if (attive.length) {
        // con le correzioni in conflitto che il bottone toglie (`via`) il materiale si legge senza di loro (L3)
        var riga0 = stato.ok ? stato.riga : opz.via && base.base === true ? base.riga : null;
        if (!riga0) return { errore: 'conflitto_da_sciogliere', conflitti: clone(stato.conflitti) };
        var intero = clone(riga0);
        intero[f] = clone(T);
        attive.forEach(function (i) {
          var d = decisione(review, i);
          if (!(d && d.choice === 'manual' && uguali(d.text, intero))) chiamate.push({ chiamata: 'setDecision', issueId: i.id, choice: 'manual', opts: opts({ text: intero }) });
        });
        delCampo.forEach(function (i) {
          if (scelta(i) !== undefined) decidi(i, scelta(i));
          else if (richiestaAperta(i)) decidi(i, 'reject');
        });
        return { chiamate: chiamate, togli: togli, T: T };
      }
    }
    var gia = !!opz.minimo && (stato.ok || base.base === true) && !base.escluso && uguali(base.adesso, T);
    delCampo.forEach(function (i) {
      if (scelta(i) !== undefined) return decidi(i, scelta(i));
      if (via(i)) return;
      var d = decisione(review, i);
      // D37.7: le scelte del controllo che si contraddicono tornano in sospeso (riprendono la spunta, le decide il bottone)
      if (d && i.origin !== 'teacher' && !aperta(review, i) && inConflitto.has(String(i.id))) return decidi(i, 'pending');
      if (richiestaAperta(i)) return decidi(i, 'manual');
      if (gia) return;
      if (aperta(review, i)) {
        // una richiesta del docente si chiude con qualunque correzione del campo, ma non col bottone (`bottone`: il taglio
        // di una spunta non è la risposta del docente alla sua richiesta); una nota del controllo aperta non si decide
        if (i.origin === 'teacher' && !allaPartenza && !opz.bottone) decidi(i, 'manual');
        return;
      }
      if (!d || d.choice === 'reject') return;
      if (i.origin === 'teacher') {
        if (allaPartenza) togli.push(i.id); else decidi(i, 'manual');
        return;
      }
      if (!uguali(d.choice === 'manual' ? d.text : i.after, T)) decidi(i, allaPartenza ? 'reject' : 'manual');
    });
    if (!allaPartenza && !gia) {
      var finale = function (i) {
        if (togli.indexOf(i.id) >= 0 || via(i)) return null;
        var x = null;
        chiamate.forEach(function (c) { if (c.chiamata === 'setDecision' && c.issueId === i.id) x = { choice: c.choice, text: c.opts && c.opts.text }; });
        return x || decisione(review, i) || null;
      };
      var porta = delCampo.some(function (i) {
        var x = finale(i);
        if (!x) return false;
        return x.choice === 'manual' ? uguali(x.text, T) : x.choice === 'accept' && i.hasProposal && uguali(i.after, T);
      });
      var delDocente = delCampo.some(function (i) { var x = finale(i); return i.origin === 'teacher' && !!x && x.choice === 'manual'; });
      if (!porta || (opz.forzaDocente && !delDocente)) {
        var issue = { target: clone(t), origin: 'teacher', blocking: true, problem: String(ctx.problema || '') };
        var noti = new Set(lista(review.initial.issues).map(function (x) { return x && x.id; }));
        var nuova = lista(rc().addIssue(review, issue).initial.issues).find(function (x) { return !noti.has(x.id); });
        if (!nuova) return { errore: 'duplicate_issue_id' };
        issue.id = nuova.id;
        chiamate.push({ chiamata: 'addIssue', issue: issue }, { chiamata: 'setDecision', issueId: issue.id, choice: 'manual', opts: testo() });
      }
    }
    return { chiamate: chiamate, togli: togli, T: T };
  }
  /* Il giudizio sul risultato (regola 9 di `calcola`): le chiamate applicate a una copia, le decisioni in `togli` tolte;
     ogni campo atteso, riletto con `leggi`, deve valere il suo testo (o essere tolto: `escluso`) senza conflitti; e
     nessuna nota del controllo aperta prima deve risultare decisa, salvo quelle in `decise` (le spunte della scheda). */
  function verificaCampi(review, esitoR, db, sources, attesi, decise) {
    var r = applicaEsito(review, esitoR);
    for (var k = 0; k < attesi.length; k++) {
      var a = attesi[k], s = leggi(r, db, a.t, sources);
      if (s.errore) return { errore: s.errore };
      if (!s.ok) return errore(s.conflitti);
      if (a.escluso ? !s.escluso : (s.escluso || !uguali(s.adesso, a.T))) return { errore: 'testo_diverso' };
    }
    var ammesse = decise || new Set();
    var decisa = lista(review.initial.issues).find(function (i) {
      return i && i.target && delControllo(i) && aperta(review, i) && !ammesse.has(String(i.id)) && !aperta(r, i);
    });
    return decisa ? { errore: 'nota_decisa', issueId: decisa.id } : null;
  }
  /* Le parti di un gesto (un campo ciascuna) registrate insieme, più le chiamate e le attese in `extra`; verificate sul
     risultato. Prima senza toccare le decisioni già prese quando il campo vale già il suo testo (`minimo`), poi, se il
     risultato non regge, con la regola 5 (le decisioni già prese seguono il testo). */
  function componi(ctx, parti, extra, decise) {
    extra = extra || {};
    var ultimo = null;
    for (var giro = 0; giro < 2; giro++) {
      var esitoR = { chiamate: [], togli: [] }, attesi = [];
      for (var k = 0; k < parti.length; k++) {
        var p = parti[k], opz = Object.assign({}, p.opz, { bottone: true, decise: decise });
        if (giro) delete opz.minimo;
        var reg = registraCampo(ctx, p.t, p.T, p.scelte, opz);
        if (reg.errore) return { errore: reg.errore };
        esitoR.chiamate = esitoR.chiamate.concat(reg.chiamate);
        esitoR.togli = esitoR.togli.concat(reg.togli);
        attesi.push({ t: p.t, T: reg.T });
      }
      esitoR.chiamate = esitoR.chiamate.concat(lista(extra.chiamate));
      esitoR.togli = esitoR.togli.concat(lista(extra.togli));
      ultimo = verificaCampi(ctx.review, esitoR, ctx.db, ctx.sources, attesi.concat(lista(extra.attesi)), decise);
      if (!ultimo) return esitoR;
    }
    return ultimo;
  }
  /* Giro 3d, D42 (Giacomo, 09/10: ««Il bottone prova prima e avvisa» (Raccomandato)»). Una spunta tolta taglia la frase
     anche nelle quasi-copie (D36.2): quel nodo diventa «cambiato» per la quarantena, e un'altra nota aperta che lo teneva
     tutto fuori può tenerne fuori anche il resto («Minaccia degli ordigni»: due frasi nella mappa, vuoto nei materiali). Prima
     di registrare, il bottone prova l'effetto sui materiali con la quarantena vera (`record` di `mappai-affermazioni-core.js`,
     letto e mai modificato): la revisione con le chiamate del bottone contro quella con le STESSE chiamate e le spunte tolte
     rimesse piene (la sola differenza è l'effetto delle spunte tolte: rimettere la spunta è la via d'uscita che la riga
     indica). Un nodo è colpito se una sua frase, ancora nella mappa, esce dai materiali senza che il taglio la tolga (fra
     le `escluse` e non fra quelle del riferimento; le frasi tagliate non sono più nella mappa, quindi non contano): 'vuoto'
     se così resta vuoto nei materiali (`svuotati`, e col riferimento non lo era), 'frasi' altrimenti. Lettura prudente
     (congelato a D40: «nel dubbio la frase contestata resta fuori»): un nodo che resta vuoto nei materiali SOLO per il
     taglio — la sua unica frase nei materiali era quella tolta, il resto era già fuori col riferimento — non spegne il
     bottone: nessuna frase oltre il taglio esce, e la riga di D43 dice che cosa esce. Vale per ogni nodo, anche il
     suo (sulla seduta del 27/09, 3 dei 4 nodi vuoti sono il nodo della riga). `issueIds`: le note la cui spunta tolta lo
     colpisce — per un altro nodo quelle il cui taglio lo tocca, per il suo le tolte della riga, prima quelle col passo
     localizzato. Restituisce [{ id, motivo, frasi, issueIds }] (prima i vuoti), [] se niente è colpito o se la quarantena non
     si calcola (`completo` falso: senza quarantena non c'è nessun nodo che essa svuoti — dichiarato). Costa due `record`. */
  function provaMateriali(dati, sp, esitoN, u, tolte) {
    var A = aff();
    if (!A || typeof A.record !== 'function') return [];
    var review = dati.review, db = dati.db || review.baseSnapshot, mioId = eid(sp.riga.id);
    var tutte = {};
    sp.note.forEach(function (n) { tutte[n.id] = true; });
    var rif = bottone(Object.assign({}, dati, { spunte: tutte }));
    var rifR = rif && !rif.errore && !(rif.daRiscrivere && rif.daRiscrivere.length) ? applicaEsito(review, rif) : review;
    var opz = own(dati, 'sources') ? { sources: dati.sources } : {};
    if (own(dati, 'now')) opz.adesso = dati.now;
    var dopo, prima;
    try { dopo = A.record(applicaEsito(review, esitoN), db, opz); prima = A.record(rifR, db, opz); } catch (e) { return []; }
    if (!dopo || !prima || !dopo.completo || !prima.completo) return [];
    var chiave = function (e) { return eid(e.nodeId) + '\u0000' + formaQuarantena(A, e.testo); };
    var gia = new Set(lista(prima.escluse).map(chiave)), vuotiPrima = new Set(lista(prima.svuotati).map(eid));
    var perse = new Map();
    lista(dopo.escluse).forEach(function (e) {
      if (gia.has(chiave(e))) return;
      var id = eid(e.nodeId);
      if (!perse.has(id)) perse.set(id, []);
      if (perse.get(id).indexOf(e.testo) < 0) perse.get(id).push(e.testo);
    });
    // un nodo vuoto conta se si è svuotato per una frase che il taglio non toglie: se a svuotarlo è solo il taglio (la sua
    // unica frase nei materiali era la frase tolta, il resto era già fuori) nessuna frase oltre il taglio esce, e non lo spegne
    var vuoti = lista(dopo.svuotati).map(eid).filter(function (id) { return !vuotiPrima.has(id) && perse.has(id); });
    var intere = new Set(sp.note.filter(function (n) { return n.intero; }).map(function (n) { return String(n.id); }));
    var suoi = tolte.filter(function (id) { return !intere.has(String(id)); }).concat(tolte.filter(function (id) { return intere.has(String(id)); }));
    var di = function (id) {
      var x = id === mioId ? null : lista(u.nodi).find(function (y) { return y.id === id; });
      return (x && x.issueIds.length ? x.issueIds : suoi).slice();
    };
    var ordine = lista(db.nodes).map(function (n) { return eid(n && n.id); });
    var perOrdine = function (a, b) { return (a === mioId ? -1 : ordine.indexOf(a)) - (b === mioId ? -1 : ordine.indexOf(b)); };
    var out = vuoti.slice().sort(perOrdine).map(function (id) { return { id: id, motivo: 'vuoto', frasi: (perse.get(id) || []).slice(), issueIds: di(id) }; });
    Array.from(perse.keys()).filter(function (id) { return vuoti.indexOf(id) < 0; }).sort(perOrdine).forEach(function (id) {
      out.push({ id: id, motivo: 'frasi', frasi: perse.get(id).slice(), issueIds: di(id) });
    });
    return out;
  }
  /* Giro 3d, D43: che cosa esce con le spunte tolte, nodo per nodo (il suo per primo): le frasi del testo di prima che nel
     testo di dopo non ci sono più, com'erano scritte (distinte nella forma della quarantena). Un nodo che tiene il suo
     testo (la descrizione riscritta) non ha frasi che escono e non c'è. */
  function esconoDa(u) {
    var A = aff();
    if (!A || typeof A.affermazioni !== 'function') return [];
    return lista(u && u.nodi).map(function (x) {
      var resta = new Set(A.affermazioni(x.dopo).map(function (a) { return formaQuarantena(A, a.testo); })), frasi = [], viste = new Set();
      A.affermazioni(x.prima).forEach(function (a) {
        var k = formaQuarantena(A, a.testo);
        if (resta.has(k) || viste.has(k)) return;
        viste.add(k); frasi.push(a.testo);
      });
      return { id: x.id, frasi: frasi };
    }).filter(function (x) { return x.frasi.length > 0; });
  }
  /* §4.4 Le chiamate del bottone in fondo (D36.3, D37.4-7, D38.1, D8; ADR 0012 rev. 12, punti 3-5 e 9): il testo del campo
     e tutte le spunte della scheda in UNA scrittura (la veste le applica in ordine, una voce di ⌘Z, poi la riga dopo).
     Lo stato a schermo è `spunte` ({ id: true piena / false tolta }, o una Map); una nota non elencata vale come parte
     (`spunteDellaRiga`); un gruppo legato con una spunta tolta è tolto tutto (D37.3).
     - Nodo: per ogni nota della descrizione con la spunta piena `accept` se il campo, dopo i tagli, è esattamente la sua
       proposta («Proposta scelta»), altrimenti `reject` («la frase entra così com'è nel campo»: «Testo mantenuto senza
       modifiche» o «Tenuta la tua versione», D28); con la spunta tolta `manual` col testo che resta («Testo modificato
       da te»), e nei nodi delle quasi-copie una correzione del docente (§4.5, `usciteSpunteTolte`). Se un nodo va
       riscritto (D38.1) nessuna chiamata: { chiamate: [], togli: [], daRiscrivere } e il bottone resta spento. Le note
       sul titolo si chiudono secondo il testo del campo (D37.4): `accept` se è la loro proposta, altrimenti `reject`.
     - Collegamento: tutte piene, le parole come sono nel campo (`accept` sulla nota delle parole se il campo è la sua
       proposta, gli altri `reject`); una tolta, il collegamento è tolto — `accept` sulle note che propongono di
       toglierlo o, se non ce n'è, un'esclusione del docente — e le parole non valgono più: `reject` sulle altre note e
       sulle scelte prese, e le correzioni del docente sulla riga in `togli` (niente conflitto, dichiarato nel §4.5).
     - Materiale (G2): tutte piene, come nel campo (`accept` se il campo è la proposta della nota, salvo con una decisione
       $item che porta il materiale intero; sulle note $item `reject`, o `accept` se il materiale è la loro proposta);
       una tolta, su un campo o sull'esclusione (D37.5), il materiale è escluso: con la sola nota d'esclusione, tolta, e
       nessun'altra decisione attiva, `accept` su di lei (D8); altrimenti l'esclusione del docente
       (`teacher-exclude-<id>`, come `setItemExcluded`) e le note piene ricevono la loro decisione; le note tolte
       restano come sono, sospese dall'esclusione (come oggi).
     - Le richieste del docente non ricevono chiamate; le note in conflitto salvate prima (D37.7) hanno la spunta e
       prendono la decisione nuova; la correzione del docente salvata dal campo segue il testo finale (o va in `togli`).
     Il risultato si verifica sul testo (`componi`): nessun conflitto, ogni campo col suo testo. Dati: { review, db?,
     sources?, riga, campi?: { campo: testo } (senza, il testo di adesso), spunte?, apertura? (D40, come in
     `usciteSpunteTolte`), problema?, now? }. Restituisce
     { chiamate, togli }, oppure { chiamate: [], togli: [], daRiscrivere }, o { errore }.
     Giro 3d, su un nodo con almeno una spunta tolta della descrizione: prima di restituire le chiamate il bottone prova
     l'effetto sui materiali (D42, `provaMateriali`): con un nodo colpito { chiamate: [], togli: [], colpiti } e il bottone
     resta spento; altrimenti il risultato porta `escono` (D43, `esconoDa`): [{ id, frasi }], che cosa esce e da quali nodi. */
  function chiamateBottone(dati) {
    try { return bottone(dati || {}); } catch (e) { return { errore: (e && (e.code || e.message)) || 'errore' }; }
  }
  function bottone(dati) {
    var sp = spunte(dati);
    if (sp.errore) return { errore: sp.errore };
    var review = dati.review, tr = sp.riga, db = dati.db || review.baseSnapshot, ctx = contesto(review, db, dati);
    var schermo = dati.spunte instanceof Map ? function (id) { return dati.spunte.get(id); } :
      function (id) { return dati.spunte && own(dati.spunte, id) ? dati.spunte[id] : undefined; };
    var piena = {};
    sp.note.forEach(function (n) { var v = schermo(n.id); piena[n.id] = v === undefined ? n.piena : !!v; });
    sp.gruppi.forEach(function (g) { if (g.some(function (id) { return !piena[id]; })) g.forEach(function (id) { piena[id] = false; }); });
    var issueDi = function (id) { return lista(review.initial.issues).find(function (i) { return i && i.id === id; }); };
    var note = sp.note.map(function (n) { return issueDi(n.id); });
    var decise = new Set(sp.note.map(function (n) { return String(n.id); }));
    var campi = dati.campi || {};
    // senza `campi`, il testo di adesso; con scelte salvate in conflitto, quello delle altre scelte salvate (L3, D37.7)
    var testoDi = function (t) {
      if (own(campi, t.field) && campi[t.field] !== undefined) return { T: campi[t.field] };
      var s = leggiBase(review, db, t, dati.sources);
      return s.errore ? { errore: s.errore } : { T: s.adesso };
    };
    var opts = function () { return own(dati, 'now') ? { now: dati.now } : {}; };
    var decisa = function (i, choice) {
      var d = decisione(review, i);
      return d && d.choice === choice ? [] : [{ chiamata: 'setDecision', issueId: i.id, choice: choice, opts: opts() }];
    };
    var tolto = sp.note.some(function (n) { return !piena[n.id]; });
    // giro 3c, L6: le richieste del docente aperte sulla riga, su un campo (le chiude `registraCampo` col testo che resta)
    var richiesteSu = function (f) {
      return lista(review.initial.issues).filter(function (i) {
        return i && i.target && sullaRiga(i.target, tr) && i.origin === 'teacher' && aperta(review, i) && (f === undefined ? campo(i.target) !== '$item' && campo(i.target) !== '$link' : campo(i.target) === f);
      });
    };

    if (tr.kind === 'node') {
      var tD = campoDellaRiga(tr, 'desc'), d0 = testoDi(tD);
      if (d0.errore) return d0;
      var tolte = sp.note.filter(function (n) { return n.campo === 'desc' && !piena[n.id]; }).map(function (n) { return n.id; });
      // D38.1 (verificatore §4.3): un campo vuoto o di soli spazi va scritto, mai una descrizione vuota registrata
      if (typeof d0.T === 'string' && !d0.T.trim()) {
        // giro 3d, punto 4: con una nota sulla descrizione intera tolta, la riga nomina lei
        var intereTolte = sp.note.filter(function (n) { return n.campo === 'desc' && n.intero && !piena[n.id]; }).map(function (n) { return n.id; });
        return { chiamate: [], togli: [], daRiscrivere: [{ id: eid(tr.id), issueIds: intereTolte.length ? intereTolte : tolte.slice(), motivo: intereTolte.length ? 'descrizione_intera' : 'nodo_svuotato' }] };
      }
      var du = { review: review, db: db, riga: tr, tolte: tolte, testo: d0.T, apertura: dati.apertura };
      if (own(dati, 'sources')) du.sources = dati.sources;
      var u = tolte.length ? uscite(du) : { nodi: [], daRiscrivere: [] };
      if (u.errore) return u;
      if (u.daRiscrivere.length) return { chiamate: [], togli: [], daRiscrivere: u.daRiscrivere };
      var mio = u.nodi.find(function (x) { return x.id === eid(tr.id); });
      var T = mio ? mio.dopo : d0.T, Tc = nellaForma(review, db, tD, T, dati.sources), scelteD = {};
      note.forEach(function (i) {
        if (campo(i.target) !== 'desc') return;
        scelteD[i.id] = !piena[i.id] ? 'manual' : i.hasProposal && uguali(i.after, Tc) ? 'accept' : 'reject';
      });
      var parti = [{ t: tD, T: T, scelte: scelteD, opz: { minimo: true } }];
      u.nodi.forEach(function (x) {
        if (x.id !== eid(tr.id)) parti.push({ t: { kind: 'node', id: x.id, field: 'desc' }, T: x.dopo, scelte: {}, opz: { forzaDocente: true } });
      });
      // il titolo (D37.4): le sue note del controllo, aperte o in conflitto, si chiudono secondo il testo del campo
      var tL = campoDellaRiga(tr, 'label');
      var titolo = lista(review.initial.issues).filter(function (i) {
        return i && i.target && sullaRiga(i.target, tr) && campo(i.target) === 'label' && delControllo(i) && (aperta(review, i) || sp.conflitti.has(String(i.id)));
      });
      // giro 3c, L6: una richiesta del docente aperta sul titolo si chiude col titolo del campo (`registraCampo`)
      if (titolo.length || richiesteSu('label').length || (own(campi, 'label') && campi.label !== undefined)) {
        var l0 = testoDi(tL);
        if (l0.errore) return l0;
        var TLc = nellaForma(review, db, tL, l0.T, dati.sources), scelteL = {};
        titolo.forEach(function (i) { scelteL[i.id] = i.hasProposal && uguali(i.after, TLc) ? 'accept' : 'reject'; decise.add(String(i.id)); });
        parti.push({ t: tL, T: l0.T, scelte: scelteL, opz: { minimo: true } });
      }
      var esitoN = componi(ctx, parti, null, decise);
      if (esitoN.errore || !tolte.length) return esitoN;
      // giro 3d, D42: il bottone prova prima l'effetto sui materiali; un altro nodo (o il suo) vuoto o con frasi in meno lo spegne
      var colpiti = provaMateriali(dati, sp, esitoN, u, tolte);
      if (colpiti.length) return { chiamate: [], togli: [], colpiti: colpiti };
      // giro 3d, D43: che cosa esce e da quali nodi, per la riga accanto al bottone
      esitoN.escono = esconoDa(u);
      return esitoN;
    }

    if (tr.kind === 'link') {
      var tR = campoDellaRiga(tr, 'rel'), l0 = leggiBase(review, db, tR, dati.sources);
      if (l0.errore) return { errore: l0.errore };
      // revisore D7: il collegamento già tolto da una scelta salvata del docente resta tolto, senza errori
      var giaTolto = !!l0.escluso;
      if (!tolto && !giaTolto) {
        var r0 = testoDi(tR);
        if (r0.errore) return r0;
        var TRc = nellaForma(review, db, tR, r0.T, dati.sources), scelteR = {}, altre = [];
        note.forEach(function (i) {
          if (campo(i.target) === 'rel') scelteR[i.id] = i.hasProposal && uguali(i.after, TRc) ? 'accept' : 'reject';
          else altre = altre.concat(decisa(i, 'reject'));
        });
        return componi(ctx, [{ t: tR, T: r0.T, scelte: scelteR, opz: { minimo: true } }], { chiamate: altre }, decise);
      }
      /* via il collegamento: le note che propongono di toglierlo CON LA SPUNTA TOLTA (revisore D6: una spunta piena vuol dire
         «tieni», e non riceve mai `accept`; prende `reject` come le altre piene, come in G2), o un'esclusione del docente.
         Già tolto (D7): niente esclusione nuova, e le scelte prese sulla riga restano come sono. */
      var chiamate = [], togli = [];
      var via = note.filter(function (i) { return campo(i.target) === '$link' && i.hasProposal && i.after === null && !piena[i.id]; });
      var esclusione = lista(review.initial.issues).find(function (i) {
        return i && i.target && sullaRiga(i.target, tr) && i.origin === 'teacher' && campo(i.target) === '$link' && i.hasProposal && i.after === null;
      });
      if (via.length || giaTolto) via.forEach(function (i) { chiamate = chiamate.concat(decisa(i, 'accept')); });
      else if (esclusione) chiamate = chiamate.concat(decisa(esclusione, 'accept'));
      else {
        var base = tr.id != null ? null : riga(db, tr);
        var target = tr.id != null ? { kind: 'link', id: tr.id, field: '$link' } : { kind: 'link', source: tr.source, target: tr.target, field: '$link' };
        if (base && typeof base.rel === 'string') target.rel = base.rel;
        var issue = { target: target, after: null, origin: 'teacher', blocking: true, problem: String(dati.problema || '') };
        var noti = new Set(lista(review.initial.issues).map(function (x) { return x && x.id; }));
        var nuova = lista(rc().addIssue(review, issue).initial.issues).find(function (x) { return !noti.has(x.id); });
        if (!nuova) return { errore: 'duplicate_issue_id' };
        issue.id = nuova.id;
        chiamate.push({ chiamata: 'addIssue', issue: issue }, { chiamata: 'setDecision', issueId: issue.id, choice: 'accept', opts: opts() });
      }
      note.forEach(function (i) { if (via.indexOf(i) < 0) chiamate = chiamate.concat(decisa(i, 'reject')); });
      // giro 3c, L6: tolto il collegamento, una richiesta del docente aperta sulle sue parole si chiude (non resta niente da tenere)
      richiesteSu().forEach(function (i) { chiamate = chiamate.concat(decisa(i, 'reject')); });
      // le parole non valgono più: le scelte prese sulla riga non cambiano più niente (né le correzioni del docente)
      if (!giaTolto) lista(review.initial.issues).forEach(function (i) {
        if (!i || !i.target || !sullaRiga(i.target, tr) || decise.has(String(i.id)) || i === esclusione || aperta(review, i)) return;
        var d = decisione(review, i);
        if (!d || (d.choice !== 'accept' && d.choice !== 'manual')) return;
        if (i.origin === 'teacher') togli.push(i.id); else chiamate = chiamate.concat(decisa(i, 'reject'));
      });
      return componi(ctx, [], { chiamate: chiamate, togli: togli, attesi: [{ t: tR, escluso: true }] }, decise);
    }

    // G2, il materiale
    var tI = campoDellaRiga(tr, '$item'), mat = leggiBase(review, db, tI, dati.sources);
    if (mat.errore) return { errore: mat.errore };
    // revisore D7: il materiale già escluso da una scelta salvata del docente resta escluso, senza errori
    var giaEscluso = !!mat.escluso;
    /* Giro 3c, D37.7 in G2 (L3): le correzioni del docente salvate prima che si contraddicono sul materiale non hanno spunta
       (§4.1) e il campo riparte senza di loro (`leggiBase`): il bottone le sostituisce col materiale come sta nei campi —
       vanno in `togli` e non contano fra le decisioni attive (`registraCampo`, `opz.via`). È quello che fa `registraCampo` in
       G1 con le correzioni del docente in conflitto sullo stesso campo; qui la regola 3 non le componeva e il bottone dava
       `conflicting_decisions`. */
    var inConflittoG2 = idsInConflitto(mat.conflitti);
    var viaG2 = new Set(lista(review.initial.issues).filter(function (i) {
      return i && i.target && sullaRiga(i.target, tr) && i.origin === 'teacher' && !aperta(review, i) && inConflittoG2.has(String(i.id));
    }).map(function (i) { return String(i.id); }));
    var fuoriViaG2 = function (i) { return !viaG2.has(String(i.id)); };
    var interoAttivo = lista(review.initial.issues).some(function (i) {
      return i && i.target && sullaRiga(i.target, tr) && campo(i.target) === '$item' && !decise.has(String(i.id)) && fuoriViaG2(i) && ['applied', 'edited'].indexOf(esito(review, i)) >= 0;
    });
    /* Verificatore §4.2: una nota $item con la spunta piena la cui proposta è il materiale com'è adesso (la proposta copiata
       nei campi) è «Proposta scelta» (`accept`); le correzioni del docente sui campi del materiale, che la copia ha fatto
       nascere, non servono più e vanno in `togli` (`mappai-review-core.js` non compone il materiale intero con la correzione
       di un campo: `conflicting_decisions`). Con una scelta salvata del controllo su un campo la nota $item resta «tenuta»
       (`reject`): il materiale è quello dei campi e la scelta salvata non cambia. Le note dei campi, con la proposta intera
       scelta, prendono `reject`: il loro campo lo porta la proposta. */
    var intere = tolto || giaEscluso || !(mat.ok || mat.base === true) ? [] : note.filter(function (i) {
      return campo(i.target) === '$item' && piena[i.id] && i.hasProposal && i.after !== null && uguali(piano(mat.adesso), piano(i.after));
    });
    var suiCampi = lista(review.initial.issues).filter(function (i) {
      return i && i.target && sullaRiga(i.target, tr) && campo(i.target) !== '$item' && !decise.has(String(i.id)) && fuoriViaG2(i) && ['applied', 'edited'].indexOf(esito(review, i)) >= 0;
    });
    if (suiCampi.some(function (i) { return i.origin !== 'teacher'; })) intere = [];
    var togliG2 = (intere.length ? suiCampi.map(function (i) { return i.id; }) : []).concat(Array.from(viaG2));
    var pienaG2 = function (i, valore) {
      if (campo(i.target) === '$item') return intere.indexOf(i) >= 0 ? 'accept' : 'reject';
      return !interoAttivo && !intere.length && i.hasProposal && uguali(i.after, valore) ? 'accept' : 'reject';
    };
    if (!tolto && !giaEscluso) {
      var campiG2 = [], partiG2 = [], extraG2 = [];
      note.forEach(function (i) { var f = campo(i.target); if (f !== '$item' && campiG2.indexOf(f) < 0) campiG2.push(f); });
      // giro 3c, L6: anche i campi con una richiesta del docente aperta, che il bottone chiude
      richiesteSu().forEach(function (i) { var f = campo(i.target); if (campiG2.indexOf(f) < 0) campiG2.push(f); });
      Object.keys(campi).forEach(function (f) { if (f !== '$item' && campiG2.indexOf(f) < 0 && campi[f] !== undefined) campiG2.push(f); });
      for (var k = 0; k < campiG2.length; k++) {
        var tF = campoDellaRiga(tr, campiG2[k]), f0 = testoDi(tF);
        if (f0.errore) return f0;
        var Fc = nellaForma(review, db, tF, f0.T, dati.sources), scelteF = {};
        note.forEach(function (i) { if (stessoCampo(i.target, tF)) scelteF[i.id] = pienaG2(i, Fc); });
        partiG2.push({ t: tF, T: f0.T, scelte: scelteF, opz: { minimo: true, via: viaG2 } });
      }
      note.forEach(function (i) { if (campo(i.target) === '$item') extraG2 = extraG2.concat(decisa(i, pienaG2(i))); });
      // senza campi da registrare, si verifica il materiale intero (la proposta scelta, o com'è adesso)
      var attesiG2 = partiG2.length ? [] : [{ t: tI, T: intere.length ? clone(intere[0].after) : mat.adesso }];
      return componi(ctx, partiG2, { chiamate: extraG2, togli: togliG2, attesi: attesiG2 }, decise);
    }
    var proposte = note.filter(function (i) { return campo(i.target) === '$item' && i.hasProposal && i.after === null; });
    var altraAttiva = lista(review.initial.issues).some(function (i) {
      return i && i.target && sullaRiga(i.target, tr) && proposte.indexOf(i) < 0 && fuoriViaG2(i) && ['applied', 'edited', 'excluded'].indexOf(esito(review, i)) >= 0;
    });
    var esclusioneG2 = [];
    if (giaEscluso) esclusioneG2 = [];   // l'esclusione salvata resta quella: nessuna esclusione nuova
    else if (note.length === 1 && proposte.length === 1 && !piena[proposte[0].id] && !altraAttiva) esclusioneG2 = decisa(proposte[0], 'accept');
    else {
      var idEx = 'teacher-exclude-' + eid(tr.id), ex = issueDi(idEx), bI = riga(review.baseSnapshot, tI);
      if (ex) {
        if (!(ex.origin === 'teacher' && ex.target.kind === 'item' && campo(ex.target) === '$item' && ex.hasProposal && ex.after === null && uguali(ex.before, valoreDi(bI, tI)))) return { errore: 'duplicate_issue_id' };
        esclusioneG2 = decisa(ex, 'accept');
      } else {
        esclusioneG2 = [{ chiamata: 'addIssue', issue: { id: idEx, target: { kind: 'item', id: eid(tr.id), field: '$item' }, after: null, origin: 'teacher', problem: String(dati.problema || '') } },
          { chiamata: 'setDecision', issueId: idEx, choice: 'accept', opts: opts() }];
      }
    }
    // le note con la spunta piena ricevono la loro decisione; le tolte restano sospese dall'esclusione (come oggi)
    note.forEach(function (i) {
      if (!piena[i.id]) return;
      var tF2 = campoDellaRiga(tr, campo(i.target)), v = campo(i.target) === '$item' ? null : testoDi(tF2);
      if (v && v.errore) return;
      esclusioneG2 = esclusioneG2.concat(decisa(i, pienaG2(i, v ? nellaForma(review, db, tF2, v.T, dati.sources) : undefined)));
    });
    return componi(ctx, [], { chiamate: esclusioneG2, togli: giaEscluso ? [] : Array.from(viaG2), attesi: [{ t: tI, escluso: true }] }, decise);
  }
  /* §4.3 Il salvataggio del campo (D37.1; revisione 5, B; R6): il testo che il docente lascia nel campo si registra come
     correzione del docente sul campo — nasce o si aggiorna la segnalazione `origin: 'teacher'` del campo, già decisa
     ('manual') — e NON decide nessuna nota aperta del controllo: restano aperte con le loro spunte, e la quarantena
     continua a tenere fuori le loro frasi (anche ritoccate, per contenimento) finché non si preme il bottone in fondo.
     Limite dichiarato (§4.3): una frase riscritta da capo non si ritrova più, ed entra prima del bottone. Le regole sono
     quelle di `registraCampo` con `forzaDocente`, più:
     - regola 0: un `adesso` passato da chi chiama diverso da quello calcolato dà `adesso_superato`;
     - regola 1: un testo uguale a quello che il campo mostra a meno di spazi (`piano`) non scrive niente;
     - il testo tornato all'Originale toglie la correzione del docente (`togli`): nessun 'manual' uguale all'Originale;
     - le richieste del docente aperte si chiudono con la correzione, come oggi; le scelte già prese sul campo seguono il
       testo (regola 5), e quelle in conflitto salvate prima tornano in sospeso (D37.7).
     I regimi 'g1' e 'g2' di `decisioniDaCampo` restano com'erano: la veste li usa finché il giro 3b non la cambia.
     Dati: { review, db?, sources?, bersaglio, salvato, adesso?, problema?, now? }. Restituisce { chiamate, togli } (le
     chiamate in ordine, poi le segnalazioni in `togli` tolte) o { errore }. */
  function correzioneDelCampo(dati) {
    dati = dati || {};
    var review = dati.review;
    if (!review || !review.initial || !review.baseSnapshot) return { errore: 'invalid_review' };
    var t = bersaglio(null, dati);
    if (!t) return { errore: 'bersaglio_mancante' };
    var f = campo(t);
    if (f === '$item' || f === '$link') return { errore: 'campo_non_valido' };
    if (!own(dati, 'salvato') || dati.salvato === undefined) return { errore: 'testo_mancante' };
    try {
      var db = dati.db || review.baseSnapshot, stato = leggi(review, db, t, dati.sources);
      if (stato.errore) return { errore: stato.errore };
      if (stato.ok && stato.escluso) return { errore: t.kind === 'item' ? 'materiale_escluso' : 'elemento_tolto' };
      if (own(dati, 'adesso') && !uguali(dati.adesso, stato.adesso)) return { errore: 'adesso_superato' };
      if (uguali(piano(dati.salvato), piano(stato.adesso))) return { chiamate: [], togli: [] };
      var reg = registraCampo(contesto(review, db, dati), t, dati.salvato, {}, { forzaDocente: true });
      if (reg.errore) return { errore: reg.errore };
      var esitoR = { chiamate: reg.chiamate, togli: reg.togli };
      return verificaCampi(review, esitoR, db, dati.sources, [{ t: t, T: reg.T }]) || esitoR;
    } catch (e) {
      return { errore: (e && (e.code || e.message)) || 'errore' };
    }
  }

  // `piano` (0075, settimo giro, D-b): la veste giudica «di nuovo il testo di partenza» con la stessa forma della regola 1
  return { righeMateriali: righeMateriali, righeMappa: righeMappa, testoAdesso: testoAdesso,
    decisioniDaCampo: decisioniDaCampo, segni: segni, successiva: successiva, chiusura: chiusura, esitoBottone: esitoBottone, piano: piano,
    spunteDellaRiga: spunteDellaRiga, usciteSpunteTolte: usciteSpunteTolte, chiamateBottone: chiamateBottone,
    correzioneDelCampo: correzioneDelCampo, frasiContestate: frasiContestate };
}));
