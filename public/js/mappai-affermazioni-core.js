/*
 * mappai-affermazioni-core.js — lo strato delle affermazioni e la quarantena
 * (packet 0042, ADR 0010). Logica PURA: niente DOM, niente disco, niente AI.
 *
 * Una `desc` fa due mestieri: è il testo della mappa ed è l'ingresso dei
 * generatori dei materiali. Finché la revisione dei contenuti (G1) non è
 * approvata, «Genera materiali» si ferma al Banco. La quarantena cambia il
 * patto: ogni desc si spezza in AFFERMAZIONI (le sue frasi), e ai generatori
 * arriva una VISTA della mappa in cui
 *   · le correzioni che il docente ha già deciso entrano come rettifiche
 *     (RC.preview su una revisione ristretta alle decisioni prese);
 *   · restano fuori le frasi contestate da una segnalazione ANCORA DA DECIDERE
 *     e quelle dei nodi che il Giudice non ha esaminato;
 *   · con loro esce la frase che le riprende con un'anafora («Questo piano…»).
 * La mappa non cambia mai: la vista è una copia.
 *
 * ⚠️ NESSUN VERDETTO AUTOMATICO (ADR 0010, alternativa 5 rinviata). Il rosso
 * viene dal Giudice e dal docente. La frase «con una frase vicina nella fonte»
 * è NON ESCLUSA, mai «verificata» (invariante 22): `vicina` dice che nella
 * fonte c'è una frase che parla della stessa cosa con gli stessi numeri, date
 * e nomi, non che l'affermazione sia vera.
 *
 * LE CORSIE, calcolate sul db corretto. Vince la prima che scatta:
 *   1. frase scritta dal docente in una decisione    → del docente   (resta,
 *      tranne quando riprende il passo contestato da una segnalazione
 *      aperta: vedi la 3)
 *   2. nodo che il Giudice non ha esaminato in
 *      NESSUN giro di questa revisione               → fuori (non esaminata)
 *      (e il collegamento con un verbo che nessun giro ha esaminato esce dai
 *      `links` della vista, come un `rel` da decidere)
 *   3. segnalazione pending sulla desc, ogni origine → fuori (giudice | docente):
 *      con un passo INDIVIDUATO ('citato', 'sovrapposizione', 'proposta',
 *      'manuale') esce ogni frase che lo RIPRENDE, di qualunque autore e in
 *      QUALUNQUE nodo della mappa corretta (giro 7, H3): la frase base per
 *      CONTENIMENTO su finestre di 1, 2 o 3 frasi consecutive (H1), e il
 *      frammento citato — fuori dal bersaglio e dai nodi cambiati solo se
 *      copre metà della sua frase base o la riga la riprende (H7). Con
 *      'nodo' (il controllo ha segnalato il nodo senza dire quale frase)
 *      esce tutto il nodo, ciò che riprende una sua frase nei nodi cambiati
 *      e le frasi di ALTRI nodi di cui il problema parla (H5); il testo del
 *      docente resta, se non contiene parola per parola una frase del nodo
 *      (H6). La quarantena è severa quando sa che cosa è contestato; quando
 *      non lo sa, si fida del testo che il docente ha davvero scritto.
 *      «Superata dalla correzione» se il passo non si ritrova da nessuna
 *      parte e una decisione presa ha cambiato la desc del nodo (anche solo
 *      togliendo): allora non esclude niente
 *   4. frase organizzativa («Questa categoria…»)     → di servizio   (resta)
 *   5. frase con una frase vicina nella fonte        → vicina        (resta)
 *   6. altrimenti                                    → senza         (resta)
 * poi la COESIONE: la frase tenuta che segue un'esclusione e comincia con
 * un'anafora esce anch'essa — mai quella del docente.
 * (Correzione del 26/09 dopo la prima misura su Svizzera: il testo del docente
 * finiva in quarantena, e la copertura letta dal solo ultimo giro dava «non
 * esaminati» sette nodi che dieci giri precedenti avevano esaminato.)
 *
 * DIPENDENZE risolte al momento della chiamata, mai al caricamento (inv. 4/5):
 * MappAIReviewCore, MappAIDeepenCore, MappAIAnchorCore, MappAIEvidenceCore,
 * MappAIGroundingCore, MappAIPipelineCore. In Node con `require`, nel
 * renderer dagli oggetti globali. Una regola, un posto (inv. 6):
 * `passoContestato` ed `elementiChiave` si scrivono qui una volta sola; il
 * 0041 e il 0035 v2 li importano. Il 0041 (`frasiOrfane`, le frasi della
 * fonte rimaste fuori dalla mappa) sta qui accanto a `vicina`: ne riusa
 * l'ordine BM25, `contenimento` ed `elementiChiave`.
 *
 * UMD: module.exports in Node, window.MappAIAffermazioniCore nel renderer.
 * Test: tests/affermazioni-core.test.js. Misura: tools/misura-affermazioni/.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(root, true);
  else root.MappAIAffermazioniCore = factory(root, false);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root, inNode) {
  'use strict';

  var SCHEMA = 'mappai-quarantena@1';
  /* LA VERSIONE DELLE REGOLE (giro 7, H8). Sta nel valore firmato da `firma`,
     nel record e nella ricevuta: un record scritto con regole diverse — altre
     corsie, altre soglie, un'altra normalizzazione — ha un'altra firma e non
     consente più, e le bozze nate da lui si rigenerano. Ogni cambio di
     corsie, soglie, normalizzazione o calcolo della firma la ALZA. */
  var REGOLE = 'mappai-quarantena-regole@9';   // 28/09 (0060): la firma non dipende più dall'ordine dei nodi; un record @8 non consente e si riscrive al giro dopo. @8, 27/09: H5 solo per le segnalazioni del Giudice (I3). Le finestre I1 e la punteggiatura I2 del giro 8 sono state provate e scartate: rompevano le soglie (66,9% di testo, 7 nodi svuotati); restano residui dichiarati nel packet.
  var CORSIE = {
    NON_ESAMINATA: 'fuori-non-esaminata',
    CONTESTATA: 'fuori-contestata',
    COESIONE: 'fuori-coesione',
    DOCENTE: 'docente',
    SERVIZIO: 'servizio',
    VICINA: 'vicina',
    SENZA: 'senza'
  };
  var FUORI = [CORSIE.NON_ESAMINATA, CORSIE.CONTESTATA, CORSIE.COESIONE];

  /* ── dipendenze, lette a ogni chiamata ─────────────────────────────────── */
  function _dep(globale, file) {
    if (inNode) return require(file);
    return root && root[globale];
  }
  function RC() { return _dep('MappAIReviewCore', './mappai-review-core.js'); }
  function DC() { return _dep('MappAIDeepenCore', './mappai-deepen-core.js'); }
  function AC() { return _dep('MappAIAnchorCore', './mappai-anchor-core.js'); }
  function EC() { return _dep('MappAIEvidenceCore', './mappai-evidence-core.js'); }
  function GC() { return _dep('MappAIGroundingCore', './mappai-grounding-core.js'); }
  function PC() { return _dep('MappAIPipelineCore', './mappai-pipeline-core.js'); }

  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o || {}, k); };
  var eid = function (x) { return String(x && typeof x === 'object' ? x.id : x == null ? '' : x); };
  var clone = function (x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); };
  function fail(code) { var e = new Error(code); e.code = code; throw e; }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* ── IMPRONTE ──────────────────────────────────────────────────────────────
     Lo stesso accento può arrivare composto (NFC) o scomposto (NFD), e gli
     spazi variano (trappola 25): si normalizza prima di confrontare. L'impronta
     è l'hash di review-core, intero, senza tagli.
     Giro 5 del 26/09 (F1): si tolgono anche i caratteri che a schermo non si
     vedono — il trattino morbido (U+00AD, lo lasciano i PDF che vanno a capo
     a metà parola) e quelli a larghezza zero (U+200B–U+200D, U+FEFF). Con un
     trattino morbido «inca­rico» era un'altra parola, per l'impronta e per le
     parole piene («inca» e «rico»): la stessa frase, copiata da un PDF, non
     riprendeva più il passo contestato. La stessa forma vale per impronte,
     passi e sovrapposizioni.
     Giro 7 del 26/09 (H2): non un elenco fisso ma TUTTI i caratteri di
     formato (categoria Unicode Cf: il trattino morbido, gli spazi a
     larghezza zero, il word joiner U+2060, i segni di direzione…) e U+034F,
     e la forma NFKC al posto della NFC: le legature dei PDF («ﬁ», «ﬃ») e gli
     spazi speciali diventano le lettere e gli spazi di tutti i giorni. Vale
     per impronte, passi, frammenti e contenimento; la versione delle regole
     (REGOLE) si è alzata con lei. */
  var RE_FORMATO = /[\p{Cf}\u034F]/gu;
  function normalizza(t) {
    var s = String(t == null ? '' : t).replace(RE_FORMATO, '');
    try { s = s.normalize('NFKC'); } catch (e) { /* runtime senza normalize */ }
    return s.replace(RE_FORMATO, '').replace(/\s+/g, ' ').trim();
  }
  /* La forma in cui si CERCA un frammento dentro una frase: normalizzata, in
     minuscolo, con un solo apostrofo e una sola virgoletta («dall’Assemblea»
     e «dall'Assemblea» sono la stessa parola). Un carattere per un carattere:
     le posizioni restano quelle della forma normalizzata. */
  function _forma(t) {
    return normalizza(t).toLowerCase().replace(/[’‘´`ʼ]/g, '\'').replace(/[«»“”„]/g, '"');
  }
  /* La forma di `_forma` con, per ogni suo carattere, l'intervallo del testo
     ORIGINALE da cui viene: così un frammento cercato nella forma normalizzata
     si ritrova nel testo com'è, anche con una legatura, un accento scomposto o
     un carattere di formato in mezzo. Si normalizza un pezzo alla volta: un
     carattere con i segni combinanti e i caratteri di formato che lo seguono.
     Per i testi di tutti i giorni la stringa è quella di `_forma` (le due
     differiscono solo dove NFKC compone attraverso due pezzi, per esempio
     negli jamo coreani: lì il frammento non si ritrova e il passo si cerca
     negli altri modi, che escludono di più). */
  var RE_ATTACCATO = /^[\p{M}\p{Cf}\u034F]$/u;
  function _formaConPosizioni(raw) {
    var s = String(raw == null ? '' : raw), out = '', da = [], a = [], i = 0, spazio = -1;
    while (i < s.length) {
      var j = i + (s.codePointAt(i) > 0xFFFF ? 2 : 1);
      while (j < s.length) {
        var ch = String.fromCodePoint(s.codePointAt(j));
        if (!RE_ATTACCATO.test(ch)) break;
        j += ch.length;
      }
      var p = /^\s/.test(s[i]) ? ' ' : _forma(s.slice(i, j));
      for (var k = 0; k < p.length; k++) {
        if (/\s/.test(p[k])) { if (out && spazio < 0) spazio = i; continue; }
        if (spazio >= 0) { out += ' '; da.push(spazio); a.push(i); spazio = -1; }
        out += p[k]; da.push(i); a.push(j);
      }
      i = j;
    }
    return { s: out, da: da, a: a };
  }
  /* Le occorrenze del frammento `q` nel testo `raw`, sulle coordinate di `raw`. */
  function _occorrenze(q, raw) {
    var cq = _forma(q), out = [];
    if (!cq) return out;
    var m = _formaConPosizioni(raw), k = m.s.indexOf(cq);
    while (k >= 0) { out.push({ start: m.da[k], end: m.a[k + cq.length - 1] }); k = m.s.indexOf(cq, k + 1); }
    return out;
  }
  function impronta(t) {
    return RC().revision({ items: [{ id: 'a', t: normalizza(t) }] }, []);
  }

  /* ── AFFERMAZIONI ──────────────────────────────────────────────────────────
     Le frasi di un testo, con lo splitter UNICO del progetto
     (DeepenCore.splitSentences, packet 0030). Due cose in più:
     · ogni affermazione porta il suo intervallo nel testo ORIGINALE, perché la
       vista la toglie per sottostringa e lo splitter comprime gli spazi;
     · un frammento che finisce con «:» si unisce alla frase che segue — lo
       splitter spezza sui due punti, e «Il valore era basso:» da solo non
       afferma niente. */
  function affermazioni(testo) {
    var orig = String(testo == null ? '' : testo);
    var parti = DC().splitSentences(orig), pos = [], cur = 0;
    parti.forEach(function (p) {
      var re = new RegExp(p.split(' ').map(escRe).join('\\s+'));
      var m = re.exec(orig.slice(cur));
      if (!m) fail('affermazione_non_trovata');
      var start = cur + m.index;
      pos.push({ start: start, end: start + m[0].length });
      cur = start + m[0].length;
    });
    var unite = [];
    pos.forEach(function (x) {
      var ultima = unite[unite.length - 1];
      if (ultima && /:$/.test(orig.slice(ultima.start, ultima.end))) ultima.end = x.end;
      else unite.push({ start: x.start, end: x.end });
    });
    return unite.map(function (x, i) {
      var t = orig.slice(x.start, x.end);
      return { indice: i, testo: t, start: x.start, end: x.end, impronta: impronta(t) };
    });
  }
  function testoNodo(n) { return String((n && (n.desc || n.content)) || ''); }
  /* Le affermazioni di tutta la mappa, nodo per nodo: il testo di un nodo è
     `desc || content`, come in RC.semanticSnapshot e nei generatori. */
  function affermazioniDb(db) {
    var out = [];
    ((db && db.nodes) || []).forEach(function (n) {
      var id = eid(n.id);
      affermazioni(testoNodo(n)).forEach(function (a) { out.push(Object.assign({ nodeId: id }, a)); });
    });
    return out;
  }
  /* L'elenco delle impronte della mappa, nell'ordine di `db.nodes`. Nella
     firma entra in forma canonica (`_improntePerFirma`, packet 0060): un cambio
     di splitter cambia la firma e invalida il record, l'ordine dei nodi no. */
  function impronte(db) {
    return affermazioniDb(db).map(function (a) { return [a.nodeId, a.impronta]; });
  }

  /* ── LE FRASI DELLA FONTE ──────────────────────────────────────────────────
     Le pagine (con la loro identità di fonte) da EvidenceCore.costruisciIndice,
     le frasi da AnchorCore.frasiDaPagine (intestazioni ricorrenti, consegne e
     righe strutturali già tolte), l'id come le evidenze dei materiali.
     La pagina passata all'àncora è la posizione del record (+1), come fa
     local-search `lexical`: così ogni frase sa da quale fonte viene e la regola
     delle intestazioni ricorrenti non confonde due fonti con la stessa pagina.
     `maxSentenceChars` alto come in `lexical`: una frase troncata avrebbe un
     testo, quindi un id, diverso da quello delle evidenze.
     `opts.minParole` (packet 0041, giro di correzione del 27/09) abbassa il
     minimo di parole piene dello splitter dell'àncora (5 di default,
     `minSentenceWords`) SOLO per chi lo chiede: l'elenco delle frasi rimaste
     fuori usa 3 (`MIN_PAROLE_ORFANE`), perché le voci d'elenco corte di una
     scheda — «- aumentò i finanziamenti alla difesa;», tre parole piene — sono
     fatti, e con 5 non venivano mai confrontate. Senza l'opzione le frasi sono
     quelle di sempre (0042): stesso splitter, stessi id. */
  function idFrase(sourceId, page, text) {
    var ec = EC();
    if (ec && typeof ec.idUnita === 'function') return ec.idUnita(sourceId, page, text);
    /* ⚠️ `idUnita` (mappai-evidence-core.js:86) non è esportata, e quel file
       qui non si tocca (packet 0030). Stessa formula, una riga; la guardia è
       tests/affermazioni-core.test.js, che confronta questi id con quelli che
       EvidenceCore.costruisciPacchetto mette davvero nelle evidenze. */
    return 'ev-' + String(RC().revision({ items: [{ id: 'ev', value: [sourceId, page, text] }] }, [])).slice(3);
  }
  function frasiFonte(sources, opts) {
    var indice = EC().costruisciIndice(Array.isArray(sources) ? sources : [], { adesso: 'affermazioni' });
    var records = indice.records || [];
    if (!records.length) return [];
    var taglio = { maxSentenceChars: 500000 };
    if (opts && typeof opts.minParole === 'number' && opts.minParole >= 1) taglio.minSentenceWords = Math.floor(opts.minParole);
    var frasi = AC().frasiDaPagine(records.map(function (r, i) { return { n: i + 1, text: r.text }; }), taglio);
    return frasi.map(function (f, i) {
      var r = records[f.page - 1], text = String(f.text).trim();
      return { idx: i, id: idFrase(r.sourceId, r.page, text), text: text, page: r.page, sourceId: r.sourceId };
    });
  }

  /* ── ELEMENTI CHIAVE ───────────────────────────────────────────────────────
     Ciò che una frase vicina deve contenere perché la si possa dire vicina:
     numeri (anni compresi, separatori delle migliaia tolti: «300.000» e
     «300'000» sono lo stesso numero), percentuali, date (giorno + mese), nomi
     propri non a inizio frase, sigle. Tutto in minuscolo e senza diacritici.
     Un frammento d'elenco si normalizza prima: il trattino o la lettera
     iniziale non sono una parola, e la parola dopo è l'inizio della frase. */
  var MESI = 'gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|' +
    'january|february|march|april|may|june|july|august|september|october|november|december';
  var RE_DATA = new RegExp('\\b(\\d{1,2})\\s*(?:°|º|\\.)?\\s+(' + MESI + ')\\b', 'gi');
  var RE_PERCENTO = /(\d+(?:[.,]\d+)?)\s*(?:%|per\s?cento\b|percent\b)/gi;
  function _piatto(t) {
    return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  /* Il marcatore d'elenco: un trattino o un pallino, oppure «a)» «b.» «1)» «2.»
     — ma non «1. settembre» (la data svizzera) né «E. coli» (maiuscola). */
  var RE_MARCATORE = new RegExp('^(?:[-–—•·*▪►]+|\\(?(?:\\d{1,2}|[a-z])[.)](?!\\s+(?:' + MESI + ')\\b))\\s+', 'u');
  function _frammento(t) {
    return normalizza(t).replace(RE_MARCATORE, '').replace(/^[«"“‘'(\[]+/, '');
  }
  function _migliaia(s) {
    var prima;
    do { prima = s; s = s.replace(/(\d)[.'’  ](?=\d{3}(?!\d))/g, '$1'); } while (s !== prima);
    return s;
  }
  function _numero(n) { return n.replace(',', '.'); }
  /* Tutto ciò che una frase contiene, nella forma degli elementi chiave: serve
     a dire se un elemento è PRESENTE, a prescindere da dove sta nella frase. */
  function _presenze(t) {
    var s = _migliaia(_piatto(normalizza(t))), set = new Set(), m;
    RE_DATA.lastIndex = 0;
    while ((m = RE_DATA.exec(s))) set.add(Number(m[1]) + ' ' + m[2]);
    RE_PERCENTO.lastIndex = 0;
    while ((m = RE_PERCENTO.exec(s))) set.add(_numero(m[1]) + '%');
    (s.match(/\d+(?:[.,]\d+)?/g) || []).forEach(function (n) { set.add(_numero(n)); });
    s.split(/[^a-z0-9]+/).forEach(function (w) { if (w) set.add(w); });
    return set;
  }
  function elementiChiave(t) {
    var f = _frammento(t), out = [], visti = {};
    function add(x) { if (x && !visti[x]) { visti[x] = 1; out.push(x); } }
    var s = _migliaia(_piatto(f)), m;
    RE_DATA.lastIndex = 0;
    while ((m = RE_DATA.exec(s))) add(Number(m[1]) + ' ' + m[2]);
    RE_PERCENTO.lastIndex = 0;
    while ((m = RE_PERCENTO.exec(s))) add(_numero(m[1]) + '%');
    s.replace(RE_PERCENTO, ' ').replace(RE_DATA, ' $2 ').replace(/\d+(?:[.,]\d+)?/g, function (n) { add(_numero(n)); return ' '; });
    // nomi propri e sigle, sul testo con le maiuscole
    f.split(/\s+/).forEach(function (parola, i) {
      parola.split(/['’]/).forEach(function (pezzo) {
        var w = pezzo.replace(/^[^\p{L}]+|[^\p{L}.]+$/gu, '').replace(/\.$/, '');
        if (!w) return;
        var lettere = w.replace(/\./g, '');
        if (lettere.length >= 2 && /^\p{Lu}+$/u.test(lettere) && (/\./.test(w) || /^\p{Lu}+$/u.test(w))) {
          add(_piatto(lettere)); return;                                  // sigla, anche in testa
        }
        if (i === 0) return;                                              // inizio frase: non si sa
        if (/^\p{Lu}\p{Ll}/u.test(w) && !/\./.test(w)) add(_piatto(w));   // nome proprio
      });
    });
    return out;
  }

  /* ── ORGANIZZATIVA ─────────────────────────────────────────────────────────
     La frase che parla della MAPPA invece che del contenuto. Due famiglie:
     · «Questa categoria spiega…», «Questo ramo descrive…» — il nome della
       parte di mappa E un verbo che la presenta, entro tre parole: «Questo
       gruppo ha studiato i documenti» (gli storici) e «Questa area fu
       occupata» parlano del contenuto; poi «In questo ramo…», «Qui si…»;
     · il verbo di contenitore in testa, col soggetto sottinteso o generico
       («Include…», «Comprende…», «Il tema riguarda…», «Covers…»). La seconda
       vale SOLO senza numeri né nomi propri: «Include i trattati con l'Italia
       e la Germania» afferma dei fatti. */
  var ORG_IT = /^(?:(?:questa|questo|queste|questi|la presente|il presente)\s+(?:categoria|sezione|area|ramo|parte|nodo|capitolo|macro-?area|gruppo|voce|mappa|scheda)(?:\s+\S+){0,3}?\s+(?:spiega|descrive|presenta|raccoglie|riguarda|tratta|illustra|mostra|analizza|approfondisce|elenca|include|comprende|contiene|introduce|riassume|affronta|esplora|si\s+occupa|parla)\b|in\s+quest[oa]\s+(?:ramo|sezione|categoria|parte|area|nodo|capitolo|mappa|scheda)\s+(?:si|vengono|sono|trovi|troviamo|vediamo)\b|(?:qui|di seguito)\s+(?:si|vengono|sono|trovi|troviamo|vediamo)\b)/i;
  var ORG_EN = /^(?:(?:this|the present)\s+(?:category|section|area|branch|part|node|chapter|group|map)(?:\s+\S+){0,3}?\s+(?:explains|describes|presents|collects|covers|deals|illustrates|shows|lists|includes|introduces|summarizes|summarises|explores)\b|in\s+this\s+(?:branch|section|category|part|area|node|chapter|map)\s+(?:we|you|are|is)\b|(?:here|below)\s+(?:we|you|are|is)\b)/i;
  var ORG2_IT = /^(?:(?:il|l['’]|lo|la|questo|questa)\s*(?:tema|argomento|ramo|sezione|area|categoria|capitolo|nodo|parte)\s+)?(?:include|includono|comprende|comprendono|raccoglie|raccolgono|riguarda|riguardano)\b/i;
  var ORG2_EN = /^(?:(?:it|this|the)\s*(?:topic|branch|section|area|category|chapter|node|part)?\s+)?(?:includes|include|covers|cover)\b/i;
  function organizzativa(t, lingua) {
    var f = _frammento(t);
    var it = lingua !== 'en', en = lingua !== 'it';
    if ((it && ORG_IT.test(f)) || (en && ORG_EN.test(f))) return true;
    if (!((it && ORG2_IT.test(f)) || (en && ORG2_EN.test(f)))) return false;
    return !elementiChiave(f).length;
  }

  /* ── ANAFORA (per la coesione) ─────────────────────────────────────────────
     La frase che non si regge senza la precedente: «Questo piano…», «Tale
     misura…», «Grazie a queste misure…», «Per questo…», «In questo modo…». */
  var ANAFORA_IT = /^(?:quest[oaie]|tal[ei]|ciò|grazie\s+a\s+(?:quest[oaie]|ciò|tal[ei])|per\s+(?:quest[oaie]|ciò)|in\s+quest[oa]\s+(?:modo|caso|fase|senso|contesto|periodo|situazione|maniera)|da\s+quest[oaie])(?![\p{L}])/iu;
  var ANAFORA_EN = /^(?:this|these|such|for\s+this|because\s+of\s+this|thanks\s+to\s+this|in\s+this\s+way)\b/i;
  function anafora(t, lingua) {
    var f = _frammento(t);
    return (lingua !== 'en' && ANAFORA_IT.test(f)) || (lingua !== 'it' && ANAFORA_EN.test(f));
  }

  /* ── VICINA ────────────────────────────────────────────────────────────────
     La prima frase della fonte, in ordine BM25 (lo stesso dell'àncora e della
     ricerca), che ha almeno metà delle parole piene dell'affermazione
     (DeepenCore.lexicalOverlap, con le radici) e TUTTI i suoi elementi chiave.
     Null se nessuna. Una frase vicina NON prova niente (inv. 22). */
  function vicina(testo, frasi, opts) {
    var o = Object.assign({ minParole: 0.5, max: 20 }, opts || {});
    var lista = frasi || [];
    if (!lista.length) return null;
    var chiave = elementiChiave(testo), dc = DC();
    var hits = AC().cercaBM25(lista, normalizza(testo), { max: o.max });
    for (var h = 0; h < hits.length; h++) {
      var f = lista[hits[h].idx];
      var ov = dc.lexicalOverlap(testo, f.text).containment;
      if (ov < o.minParole) continue;
      var pres = _presenze(f.text);
      if (chiave.some(function (e) { return !pres.has(e); })) continue;
      return { idx: hits[h].idx, id: f.id, testo: f.text, page: f.page, sourceId: f.sourceId,
        parole: Math.round(ov * 100) / 100, score: hits[h].score };
    }
    return null;
  }

  /* ── LE FRASI DELLA FONTE RIMASTE FUORI (packet 0041, regola v2 del 27/09) ─
     Il verso opposto di `vicina`: per ogni frase della FONTE (`frasiFonte`) si
     guarda che cosa ne è rimasto nelle affermazioni della mappa. Una frase della
     fonte la mappa la spezza spesso in più affermazioni brevi, anche in nodi
     diversi: confrontata con UNA affermazione risultava orfana (prima misura su
     Svizzera: 30 righe, contenimento 0,14–0,46 per tutte le 26 orfane). Per
     questo non si usa `vicina`, che chiede a UNA frase metà delle parole e tutti
     gli elementi, ma l'UNIONE delle `vicine` affermazioni più vicine per BM25 in
     tutta la mappa — lo stesso ordine di `vicina` (`cercaBM25` dell'àncora sul
     testo normalizzato):
       · contenimento — la quota delle parole piene della frase (senza il segno
                    d'elenco iniziale: `_frammento`) presenti nell'unione
                    (`contenimento`, lo stesso della quarantena); soglia 0,4;
       · elementi mancanti — gli `elementiChiave` della frase, di almeno 3
                    caratteri, che non stanno né fra gli elementi chiave della
                    mappa (titoli e descrizioni, frase per frase) né nel testo
                    della mappa, nella stessa forma degli elementi (minuscolo,
                    senza diacritici, migliaia unite);
       · orfana   — contenimento sotto la soglia (la riga porta anche gli
                    elementi mancanti, se ce ne sono);
       · mancanti — contenimento alla soglia, ma almeno un elemento mancante;
       · coperta  — il resto.
     LA FRASE CORTA (giro di correzione del 27/09). Con al più `CORTA_ORFANE`
     (5) parole piene l'unione non vale: bastano due parole prese a caso da
     due nodi diversi per arrivare a 0,4. «- aumentò i finanziamenti alla
     difesa;» (tre parole piene, un fatto perso: la mappa non parla di
     finanziamenti) risultava ripresa da «l'aumento delle zone coltivate» del
     piano Wahlen più «difesa» del Ridotto. Per la frase corta il contenimento
     è quello della MIGLIORE affermazione da sola, fra le stesse `vicine` —
     come `vicina`, che chiede tutto a una frase.
     IL NODO VICINO (stesso giro). È il nodo della prima affermazione, in
     ordine BM25 fra le stesse `vicine`, che ha in comune con la frase almeno
     `COMUNI_NODO` (2) parole piene NON GENERICHE; generica è la parola che
     compare in più di un quarto delle affermazioni della mappa, e in almeno
     tre (su Svizzera: «svizzera», 43 affermazioni su 108). Se nessuna, niente
     nodo (`nodoVicino` e `affermazioneVicina` null): prima il nodo era il
     primo per BM25 senza minimo, e per il raid aereo era «Fortezze Camuffate»
     solo per «caso» — il bottone mandava a correggere il nodo sbagliato. Il
     nodo resta il posto più probabile dove aggiungere il fatto, non una
     prova. Il testo mostrato resta quello della fonte. Nessuna parola qui
     afferma la verità (inv. 22): «coperta» vuol dire che le parole e gli
     elementi della frase si ritrovano nella mappa, non che la mappa dica il
     vero, né che la mappa riprenda la frase intera (la soglia lascia passare
     frasi che hanno perso fino al 60% delle parole piene).
     opts: { frasi (da `frasiFonte`, per l'elenco con `minParole:
     MIN_PAROLE_ORFANE`), affs (da `affermazioniDb`), etichette (i titoli dei
     nodi: servono solo agli elementi), soglia (0,4), vicine (3), max (per
     gruppo, 12; Infinity per la misura) }.
     → { coperte, mancanti:[riga], orfane:[riga], totali:{mancanti, orfane} },
       riga = { fid, page, text, nodoVicino, affermazioneVicina, elementi,
       elementiTesto, contenimento } — ogni gruppo in ordine di fonte e di
       pagina, tagliato a `max`; `totali` conta prima del taglio. `elementi`
       sono le chiavi normalizzate, `elementiTesto` le stesse come le scrive la
       frase della fonte (per mostrarle). */
  var MAX_ORFANE = 12, SOGLIA_ORFANE = 0.4, VICINE_ORFANE = 3, MIN_ELEMENTO = 3;
  var MIN_PAROLE_ORFANE = 3, CORTA_ORFANE = 5, COMUNI_NODO = 2, GENERICA = 0.25, GENERICA_MIN = 3;
  function _elementiNelTesto(elementi, testo) {
    var parole = _frammento(testo).split(/\s+/);
    return elementi.map(function (e) {
      if (/[^a-z]/.test(e)) return e;                         // numeri, date, percentuali: la forma normalizzata
      for (var i = 0; i < parole.length; i++) {
        var pezzi = parole[i].split(/['’]/);
        for (var j = 0; j < pezzi.length; j++) {
          var w = pezzi[j].replace(/^[^\p{L}]+|[^\p{L}.]+$/gu, '').replace(/\.$/, '');
          if (w && _piatto(w.replace(/\./g, '')) === e) return w;
        }
      }
      return e;
    });
  }
  function frasiOrfane(opts) {
    var o = opts || {};
    var frasi = Array.isArray(o.frasi) ? o.frasi : [];
    var lista = (Array.isArray(o.affs) ? o.affs : []).filter(function (a) { return a && String(a.testo == null ? '' : a.testo).trim(); })
      .map(function (a) { return { text: String(a.testo), nodeId: a.nodeId == null ? null : String(a.nodeId) }; });
    var etichette = (Array.isArray(o.etichette) ? o.etichette : []).map(function (x) { return String(x == null ? '' : x); })
      .filter(function (x) { return x.trim(); });
    var soglia = typeof o.soglia === 'number' ? o.soglia : SOGLIA_ORFANE;
    var quante = typeof o.vicine === 'number' && o.vicine >= 1 ? Math.floor(o.vicine) : VICINE_ORFANE;
    var max = o.max == null ? MAX_ORFANE : o.max;
    /* gli elementi della mappa, frase per frase (i titoli sono frasi a sé), e
       il testo della mappa nella forma degli elementi */
    var testiMappa = etichette.concat(lista.map(function (a) { return a.text; }));
    var elMappa = new Set();
    testiMappa.forEach(function (t) { elementiChiave(t).forEach(function (e) { elMappa.add(e); }); });
    var testoMappa = _migliaia(_piatto(normalizza(testiMappa.join(' \n '))));
    var presente = function (e) { return elMappa.has(e) || testoMappa.indexOf(e) >= 0; };
    /* le parole di ogni affermazione (con le radici, come `contenimento`), e
       quante affermazioni contengono una parola: servono alla frase corta e al
       nodo vicino, si calcolano una volta sola e solo se servono */
    var dc = DC(), indici = null, df = {};
    var indice = function (i) {
      if (!indici) indici = lista.map(function (a) { return dc.buildCoverageIndex(normalizza(a.text)); });
      return indici[i];
    };
    var generica = function (w) {
      if (!own(df, w)) {
        var n = 0;
        for (var i = 0; i < lista.length; i++) if (dc.lexicalOverlap(w, indice(i)).covered) n++;
        df[w] = n;
      }
      return df[w] >= GENERICA_MIN && df[w] > GENERICA * lista.length;
    };
    var comuni = function (parole, ov) {
      var visti = {};
      return parole.filter(function (w) {
        if (visti[w] || ov.newWords.indexOf(w) >= 0) return false;
        visti[w] = 1;
        return !generica(w);
      }).length;
    };
    var fonti = [], coperte = 0, mancanti = [], orfane = [];
    frasi.forEach(function (f, k) {
      var sid = f && f.sourceId != null ? String(f.sourceId) : '';
      if (fonti.indexOf(sid) < 0) fonti.push(sid);
      var testo = _frammento(f && f.text), q = normalizza(testo);
      var hits = lista.length ? AC().cercaBM25(lista, q, { max: quante }) : [];
      var parole = dc.contentWords(q), singole = null;
      var una = function () {   // ogni affermazione vicina da sola, in ordine BM25
        return singole || (singole = hits.map(function (h) { return { i: h.idx, ov: dc.lexicalOverlap(q, indice(h.idx)) }; }));
      };
      var cont = !hits.length ? 0
        : parole.length <= CORTA_ORFANE ? Math.max.apply(null, una().map(function (s) { return s.ov.containment; }))
        : contenimento(testo, hits.map(function (h) { return lista[h.idx].text; }).join(' '));
      var manca = elementiChiave(testo).filter(function (e) { return e.length >= MIN_ELEMENTO && !presente(e); });
      var orfana = cont < soglia;
      if (!orfana && !manca.length) { coperte++; return; }
      var scelta = una().find(function (s) { return comuni(parole, s.ov) >= COMUNI_NODO; });
      var top = scelta ? lista[scelta.i] : null;
      (orfana ? orfane : mancanti).push({
        fid: f && f.id != null ? f.id : null, page: f && f.page != null ? f.page : null, text: String((f && f.text) || ''),
        nodoVicino: top ? top.nodeId : null, affermazioneVicina: top ? top.text : null,
        elementi: manca, elementiTesto: _elementiNelTesto(manca, testo), contenimento: Math.round(cont * 100) / 100,
        _ord: { fonte: fonti.indexOf(sid), page: Number(f && f.page) || 0, k: k }
      });
    });
    var inOrdine = function (xs) {
      return xs.sort(function (a, b) { return (a._ord.fonte - b._ord.fonte) || (a._ord.page - b._ord.page) || (a._ord.k - b._ord.k); })
        .slice(0, Math.max(0, max)).map(function (x) { delete x._ord; return x; });
    };
    return { coperte: coperte, mancanti: inOrdine(mancanti), orfane: inOrdine(orfane),
      totali: { mancanti: mancanti.length, orfane: orfane.length } };
  }

  /* ── IL PASSO CONTESTATO ───────────────────────────────────────────────────
     Il Giudice indica il NODO, non la frase. Dove sta ciò che contesta, in
     cinque modi, dal più certo al meno certo:
       'manuale'         la decisione 'manual' del docente: dove ha cambiato;
       'proposta'        la proposta del Giudice: dove cambierebbe;
       'citato'          i passi di almeno 20 caratteri che il problema cita
                         fra virgolette e che stanno davvero nel testo;
       'sovrapposizione' misurata nei due sensi, in quest'ordine:
                         · verso 'frase': l'UNICA frase con almeno metà delle
                           sue parole piene nel testo del problema;
                         · verso 'problema': la frase che contiene la quota più
                           alta delle parole piene del PROBLEMA, se ne contiene
                           almeno 0,4 e supera la seconda frase di almeno 0,2
                           (il margine: con due frasi alla pari non si sceglie);
       'nodo'            non si sa: tutto il nodo, tranne il testo che il
                         docente ha scritto o ritoccato (giro 6, G1).
     La sovrapposizione vale solo su un problema INTERO. Un problema che non
     finisce con una punteggiatura di chiusura è stato troncato (su Svizzera 21
     problemi su 55 delle desc, tagliati a 220-240 caratteri dal vecchio
     maxLength del Giudice): la parte caduta col taglio può contestare
     un'altra frase, e la misura vedrebbe solo ciò che resta. Allora 'nodo'.
     Correzione del 26/09, giro 1: con la sovrapposizione anche sui problemi
     troncati, a Banco mai aperto 3 correzioni su 24 lasciavano nei materiali
     una frase che il docente ha poi cambiato («Dopo il 1940, le autorità
     posero restrizioni…»); con questa regola nessuna (tools/misura-affermazioni).
     Il verso 'problema' resta adottato su pochi casi (sulle 24 correzioni di
     Svizzera scatta al più una volta): la misura lo riporta a ogni giro.
     Il passo si allarga sempre alle frasi intere che tocca: la differenza
     carattere per carattere («militar» → «industrial») non si ritroverebbe
     con sicurezza nel testo corretto, la frase sì.
     Correzione del 26/09, giro 2: un problema INTERO può contestare più di
     una frase («… il 30 agosto 1939 … Inoltre …»), e 'citato' e
     'sovrapposizione' ne trovano una sola: la data contestata andava ai
     materiali. Con questi due modi al passo si AGGIUNGONO le frasi del nodo con
     almeno metà delle parole piene nel problema (tutte, non solo l'unica) e
     quelle con un numero, una data o una percentuale che il problema ripete
     (`_estendi`). Si aggiunge e basta: esce di più, mai di meno. Su Svizzera
     costa zero (tools/misura-affermazioni: 88,8% e 2 nodi svuotati su 38 con
     le decisioni di oggi, 33,7% e 23 su 38 a Banco mai aperto, come prima).
     Giro 7 del 26/09 (H4): anche 'proposta' si allarga come 'citato' — la
     proposta corregge UNA frase, ma il problema può contestarne due (la
     seconda fra virgolette, o con un numero che il problema ripete): al
     passo si aggiungono i frammenti citati e le frasi di `_estendi`, e il
     record porta i frammenti come per 'citato'.
     Tutte le misure si fanno sulle forme normalizzate (giro 7, H2).
     → { modo, passi: [{ start, end, testo }] } sulle coordinate di `before`;
       con 'sovrapposizione' anche `verso`; con 'citato' e 'proposta' i
       `frammenti` ritrovati; `aggiunte` = le frasi aggiunte al passo. */
  var SOVRAPPOSIZIONE = { frase: 0.5, problema: 0.4, margine: 0.2 };
  /* Troncato: non chiude con . ! ? né con una virgoletta o una parentesi di
     chiusura, oppure chiude con dei puntini di sospensione. Nel dubbio è
     troncato: si ricade su 'nodo', che esclude di più (fallisce chiuso).
     Sulla forma normalizzata (giro 7, H2): un carattere di formato in coda
     non fa troncato un problema intero. */
  function troncato(problema) {
    var s = normalizza(problema);
    if (!s) return false;
    if (/(?:\.\.\.|…)$/.test(s)) return true;
    return !/[.!?»"”’')\]]$/.test(s);
  }
  function _virgolettati(problema) {
    var p = String(problema || ''), out = [], m;
    var re = /«([^»]{20,})»|“([^”]{20,})”|"([^"]{20,})"/g;
    while ((m = re.exec(p))) out.push(m[1] || m[2] || m[3]);
    // apici singoli: si apre dopo un non-lettera, si chiude prima di un non-lettera
    // («l'oro» ha un apostrofo fra due lettere, e non è una virgoletta)
    var apre = -1;
    for (var i = 0; i < p.length; i++) {
      if (p[i] !== "'" && p[i] !== '‘' && p[i] !== '’') continue;
      var prima = i ? p[i - 1] : ' ', dopo = i + 1 < p.length ? p[i + 1] : ' ';
      var lPrima = /[\p{L}\p{N}]/u.test(prima), lDopo = /[\p{L}\p{N}]/u.test(dopo);
      if (apre < 0 && !lPrima && lDopo) apre = i;
      else if (apre >= 0 && !lDopo) {
        if (i - apre - 1 >= 20) out.push(p.slice(apre + 1, i));
        apre = -1;
      }
    }
    return out.map(function (s) { return s.trim().replace(/[.,;:]+$/, ''); }).filter(function (s) { return s.length >= 20; });
  }
  var _tocca = function (a, x) { return x.start === x.end ? x.start >= a.start && x.start <= a.end : x.start < a.end && x.end > a.start; };
  function _allarga(before, frasi, modo, intervalli) {
    var prese = frasi.filter(function (a) { return intervalli.some(function (x) { return _tocca(a, x); }); });
    if (!prese.length) return { modo: 'nodo', passi: [{ start: 0, end: before.length, testo: before }] };
    var passi = [];
    prese.forEach(function (a) {
      var ultimo = passi[passi.length - 1];
      if (ultimo && ultimo.indice === a.indice - 1) { ultimo.end = a.end; ultimo.indice = a.indice; }
      else passi.push({ start: a.start, end: a.end, indice: a.indice });
    });
    return { modo: modo, passi: passi.map(function (x) { return { start: x.start, end: x.end, testo: before.slice(x.start, x.end) }; }) };
  }
  /* Aggiunge al passo le frasi che toccano `intervalli` e che non ci sono già.
     Le frasi aggiunte si dichiarano (`aggiunte`): se una decisione presa le ha
     già tolte dal testo, non sono un passo «non ritrovato» (vedi `corsie`). */
  function _aggiungi(before, frasi, esito, intervalli) {
    if (esito.modo === 'nodo') return esito;
    var gia = function (a) { return esito.passi.some(function (x) { return x.start < a.end && x.end > a.start; }); };
    var nuove = frasi.filter(function (a) { return !gia(a) && intervalli.some(function (x) { return _tocca(a, x); }); });
    if (!nuove.length) return esito;
    var r = _allarga(before, frasi, esito.modo, esito.passi.concat(nuove));
    ['verso', 'frammenti'].forEach(function (k) { if (esito[k]) r[k] = esito[k]; });
    r.aggiunte = (esito.aggiunte || []).concat(nuove.map(function (a) { return { start: a.start, end: a.end, testo: a.testo }; }));
    return r;
  }
  function _estendi(before, frasi, problema, esito) {
    var p = normalizza(problema);
    if (!p) return esito;
    var dc = DC(), idx = dc.buildCoverageIndex(p), pres = _presenze(p);
    var extra = frasi.filter(function (a) {
      if (dc.lexicalOverlap(normalizza(a.testo), idx).containment >= SOVRAPPOSIZIONE.frase) return true;
      return elementiChiave(a.testo).some(function (e) { return /\d/.test(e) && pres.has(e); });
    });
    return _aggiungi(before, frasi, esito, extra);
  }
  /* I frammenti fra virgolette del problema che stanno davvero in `before`
     (nella forma di `_forma`: con le legature, gli accenti scomposti, gli
     apostrofi e i caratteri invisibili di un PDF), con le loro posizioni. */
  function _citati(problema, before) {
    var citati = [], frammenti = [];
    _virgolettati(problema).forEach(function (q) {
      var occ = _occorrenze(q, before);
      if (!occ.length) return;
      citati = citati.concat(occ);
      if (frammenti.indexOf(q) < 0) frammenti.push(q);
    });
    return { citati: citati, frammenti: frammenti };
  }
  function passoContestato(issue, decision) {
    var i = issue || {}, d = decision || {};
    var before = typeof i.before === 'string' ? i.before : '';
    var tutto = { modo: 'nodo', passi: [{ start: 0, end: before.length, testo: before }] };
    if (!before.trim()) return tutto;
    var frasi = affermazioni(before), rc = RC(), c;
    if (d.choice === 'manual' && typeof d.text === 'string' && (c = rc.textChange(before, d.text))) {
      return _allarga(before, frasi, 'manuale', [c]);
    }
    var cit = _citati(i.problem, before);
    if (i.hasProposal && typeof i.after === 'string' && (c = rc.textChange(before, i.after))) {
      /* giro 7 (H4): i frammenti citati e le frasi di `_estendi` si aggiungono
         alla frase che la proposta corregge */
      var prop = _allarga(before, frasi, 'proposta', [c]);
      if (prop.modo === 'nodo') return prop;
      prop = _estendi(before, frasi, i.problem, _aggiungi(before, frasi, prop, cit.citati));
      return cit.frammenti.length ? Object.assign(prop, { frammenti: cit.frammenti }) : prop;
    }
    /* Giro 5 (F1): con 'citato' il passo è il FRAMMENTO fra virgolette, e il
       record lo porta con sé (`frammenti`): `corsie` lo cerca su tutta la mappa. */
    if (cit.citati.length) return Object.assign(_estendi(before, frasi, i.problem, _allarga(before, frasi, 'citato', cit.citati)), { frammenti: cit.frammenti });
    var problema = normalizza(i.problem);
    if (problema && !troncato(problema)) {
      var dc = DC(), idx = dc.buildCoverageIndex(problema), S = SOVRAPPOSIZIONE;
      var sopra = frasi.filter(function (a) { return dc.lexicalOverlap(normalizza(a.testo), idx).containment >= S.frase; });
      if (sopra.length === 1) return _estendi(before, frasi, problema, Object.assign(_allarga(before, frasi, 'sovrapposizione', [sopra[0]]), { verso: 'frase' }));
      var punti = frasi.map(function (a) { return { a: a, q: dc.lexicalOverlap(problema, normalizza(a.testo)).containment }; })
        .sort(function (x, y) { return y.q - x.q; });
      var primo = punti[0], secondo = punti.length > 1 ? punti[1].q : 0;
      if (primo && primo.q >= S.problema && primo.q - secondo >= S.margine - 1e-9) {
        return _estendi(before, frasi, problema, Object.assign(_allarga(before, frasi, 'sovrapposizione', [primo.a]), { verso: 'problema' }));
      }
    }
    return tutto;
  }

  /* ── DOVE STA IL PASSO NELLA MAPPA CORRETTA ────────────────────────────────
     Giro 5 del 26/09 (F1). Il giro 4 cercava il passo contestato nel solo nodo
     bersaglio, parola per parola oppure come QUASI-COPIA (0,8 di parole piene
     nei due sensi), e due revisori hanno mostrato che non basta: la frase
     contestata ACCORCIATA, ALLUNGATA, FUSA con la precedente, SPEZZATA in due,
     preceduta da una premessa lunga o riscritta tutta tranne la clausola
     contestata, oppure SPOSTATA in un altro nodo con una decisione, arrivava
     ai materiali, e la segnalazione risultava «superata». La quarantena deve
     fallire CHIUSA: nel dubbio una frase che riprende un passo contestato
     resta fuori. Le regole:
       · modo 'citato': il passo è il FRAMMENTO fra virgolette. Esce ogni frase
         della mappa corretta, di qualunque nodo e di qualunque autore, che lo
         contiene nella forma di `_forma` (normalizzata, minuscola, apostrofi
         unificati);
       · gli altri modi: il passo è la frase base contestata (con 'nodo', ogni
         frase della desc base). Si misura il CONTENIMENTO passo→frase — la
         quota delle parole piene del passo, con le radici di DeepenCore, che
         stanno nella frase — su ogni frase e su ogni coppia di frasi
         consecutive (la frase spezzata in due), nel nodo bersaglio e in ogni
         nodo la cui desc è stata cambiata da una decisione presa (il passo
         spostato). Esce ciò che arriva a CONTENIMENTO, di qualunque autore —
         TRANNE con 'nodo', dove il testo scritto o ritoccato dal docente
         resta (giro 6, G1; vedi `corsie`);
       · «superata» solo se niente arriva alla soglia in quei nodi, il
         frammento (se c'è) non compare da nessuna parte, e una decisione
         presa ha cambiato la desc del bersaglio.
     Giro 7 del 26/09, le regole di oggi:
       · H3: con un passo INDIVIDUATO ('citato', 'sovrapposizione',
         'proposta', 'manuale') le frasi base si cercano in TUTTI i nodi della
         mappa corretta — la copia identica nel figlio _D che nessuna
         decisione ha toccato restava nei materiali. Con 'nodo' la ricerca
         resta sul bersaglio e sui nodi cambiati;
       · H1: con un passo individuato il contenimento si misura su FINESTRE di
         1, 2 e 3 frasi consecutive dello stesso nodo; una finestra conta se
         il contenimento dell'unione arriva a τc e ogni sua frase porta
         almeno una parola piena del passo che le altre non hanno (la frase
         contestata spezzata in tre frasi brevi, 0,43 + 0,21 + 0,21, arrivava
         ai materiali: la coppia chiedeva un quarto delle parole a ciascuna).
         Il prezzo: la frase accanto a una ripresa parziale che ripete una
         parola del passo mancante alla ripresa esce con lei (la misura lo
         conta). Con 'nodo' resta la coppia del giro 5;
       · H7: il frammento citato toglie una riga fuori dal bersaglio e dai
         nodi cambiati solo se copre almeno metà delle parole piene della
         sua frase base, oppure se la riga riprende quella frase base (τc):
         un frammento breve e comune («l'organo che rappresenta…») non
         svuota le frasi di un nodo che parla d'altro.
     Nel verso passo→frase perché una frase che CONTIENE il passo con altro
     intorno (allungata, fusa, con la premessa) lo riprende tutto: il verso
     opposto la darebbe per nuova.

     LA SOGLIA (τc), misurata sui casi veri (tools/misura-affermazioni; le due
     riscritture di Svizzera nel verso passo→frase) e su quelli dei revisori
     del giro 4 (la frase «Questo mandato è un incarico ufficiale dato
     dall'Assemblea Federale, l'organo che rappresenta il popolo e i cantoni,
     per gestire la situazione di guerra.», 14 parole piene):
        riscritture vere, da NON escludere:  L1_4 0,73 · L1_3_L2_A 0,67
        casi dei revisori, da escludere:     resto riscritto con la clausola
                                             intatta 0,50 · accorciata 0,57 ·
                                             spezzata in due 0,50 + 0,36 da
                                             sole, 0,79 in coppia · allungata,
                                             fusa, premessa lunga 1,00
     Un valore che tenga dentro le due riscritture (sopra 0,73) e prenda i
     casi dei revisori (fino a 0,50) NON esiste. Vale la regola del giro 5:
     fallire chiusa prevale, e la soglia è la più alta che prende tutti i casi
     dei revisori, 0,50 (la stessa di `vicina`: una frase con metà delle parole
     piene del passo parla della stessa cosa). Le due riscritture vere si
     perdono: restano fuori finché il docente non decide la segnalazione
     aperta, e il Banco lo dice («somiglia ancora al passo contestato»).
     Si perde anche la correzione più naturale, la stessa frase senza la
     clausola contestata (0,71): fuori finché la segnalazione resta aperta. */
  var CONTENIMENTO = 0.5;
  /* la quota delle parole piene di `passo` che stanno in `frase`, sulle forme normalizzate */
  function contenimento(passo, frase) {
    return DC().lexicalOverlap(normalizza(passo), normalizza(frase)).containment;
  }
  /* Le righe di un nodo che toccano ogni occorrenza di `frase` nel testo del
     nodo, nella forma `forma` (di norma `normalizza`). Il testo del nodo in
     quella forma è l'unione delle sue righe (lo splitter non toglie caratteri,
     solo spazi); se una riga non si ritrova in ordine, si ripiega sul
     contenimento riga per riga — nel dubbio si prende di più. */
  function _righeConIlPasso(frase, righe, forma) {
    var f = forma || normalizza, nf = f(frase);
    if (!nf) return [];
    var nt = righe.map(function (r) { return f(r.testo); }).join(' ');
    var cur = 0, pos = [], ok = true;
    righe.forEach(function (r) {
      var nr = f(r.testo), k = nt.indexOf(nr, cur);
      if (k < 0) { ok = false; return; }
      pos.push({ r: r, start: k, end: k + nr.length }); cur = k + nr.length;
    });
    if (!ok) return righe.filter(function (r) { var nr = f(r.testo); return nr && (nr.indexOf(nf) >= 0 || nf.indexOf(nr) >= 0); });
    var out = [], k = nt.indexOf(nf);
    while (k >= 0) {
      pos.forEach(function (p) { if (p.start < k + nf.length && p.end > k && out.indexOf(p.r) < 0) out.push(p.r); });
      k = nt.indexOf(nf, k + 1);
    }
    return out;
  }
  /* Le righe di un nodo (in ordine) che riprendono la frase base `passo`:
     la frase stessa, anche spezzata in un altro modo; ogni frase con
     contenimento ≥ CONTENIMENTO; e le frasi spezzate:
       · con `finestre` (un passo INDIVIDUATO, giro 7, H1): ogni FINESTRA di
         2 o 3 frasi consecutive il cui contenimento d'insieme arriva a τc,
         quando ogni frase della finestra porta almeno una parola piena del
         passo che le altre non hanno. Anche se una delle frasi arriva alla
         soglia da sola: «Questo mandato è un incarico ufficiale dato
         dall'Assemblea Federale.» (0,50) + «L'Assemblea è l'organo che
         rappresenta il popolo e i cantoni.» (0,36) — la seconda porta la
         clausola contestata. E la frase spezzata in tre frasi brevi (0,43 +
         0,21 + 0,21), che la coppia del giro 5 non vedeva.
         ⚠️ In più della regola scritta nel giro 7: ogni frase della finestra
         porta da sola almeno τc/n delle parole piene del passo (un quarto in
         due, un sesto in tre). Senza, una ripresa PARZIALE che arriva da sola
         a τc si porta dietro la frase accanto che ha una sola parola del
         passo che a lei manca: su L1_0_L2_A_D3 la frase non contestata «Il
         Consiglio Federale ha scritto la dichiarazione di neutralità grazie
         a un mandato speciale.» (0,14, porta «mandato») usciva col resto
         riscritto (0,50); su L1_4 la frase che ripete solo «Svizzera» (0,09)
         usciva con la riscrittura (0,73). I pezzi della frase spezzata in
         tre (0,21) stanno sopra il sesto, le due frasi accanto sotto;
       · senza (modo 'nodo'): ogni COPPIA di frasi consecutive che ci arriva
         insieme, quando ognuna porta almeno metà della soglia (un quarto
         delle parole piene del passo) e parole del passo che l'altra non ha.
     → [{ r, via: 'frase'|'contenimento', coppia? }], 'frase' se la riga È il
     passo nella forma normalizzata; `coppia` = il testo delle frasi accanto
     quando la riga è presa SOLO dentro una finestra (la misura la mostra). */
  function _riprese(passo, righeNodo, finestre) {
    var np = normalizza(passo), out = [], soglia = CONTENIMENTO - 1e-9, meta = CONTENIMENTO / 2 - 1e-9;
    if (!np || !righeNodo || !righeNodo.length) return out;
    var add = function (r, accanto) {
      var x = out.find(function (o) { return o.r === r; });
      if (!x) out.push(x = { r: r, via: normalizza(r.testo) === np ? 'frase' : 'contenimento', sola: false, coppia: null });
      if (accanto == null) { x.sola = true; x.coppia = null; }
      else if (!x.sola && !x.coppia) x.coppia = accanto;
    };
    _righeConIlPasso(np, righeNodo).forEach(function (r) { add(r); });
    var dc = DC(), parole = dc.contentWords(np);
    if (!parole.length) return out.map(_esce);   // senza parole piene la misura non dice niente
    var q = righeNodo.map(function (r) { return contenimento(np, r.testo); });
    righeNodo.forEach(function (r, k) { if (q[k] >= soglia) add(r); });
    var prendiFinestra = function (k, n) {
      for (var j = 0; j < n; j++) {
        if (q[k + j] >= soglia) continue;
        add(righeNodo[k + j], righeNodo.slice(k, k + n).filter(function (x, h) { return h !== j; }).map(function (x) { return x.testo; }).join(' '));
      }
    };
    if (finestre) {
      // le parole piene del passo che ogni riga riprende (con le radici di DeepenCore)
      var coperte = righeNodo.map(function (r) {
        var nuove = new Set(dc.lexicalOverlap(np, normalizza(r.testo)).newWords);
        return new Set(parole.filter(function (w) { return !nuove.has(w); }));
      });
      for (var k = 0; k < righeNodo.length; k++) {
        for (var n = 2; n <= 3 && k + n <= righeNodo.length; n++) {
          var cop = coperte.slice(k, k + n), minimo = CONTENIMENTO / n - 1e-9;
          if (q.slice(k, k + n).some(function (x) { return x < minimo; })) continue;
          var ogniUna = cop.every(function (s, j) {
            return Array.from(s).some(function (w) { return !cop.some(function (t, h) { return h !== j && t.has(w); }); });
          });
          if (!ogniUna) continue;
          var qc = contenimento(np, righeNodo.slice(k, k + n).map(function (r) { return r.testo; }).join(' '));
          if (qc >= soglia) prendiFinestra(k, n);
        }
      }
      return out.map(_esce);
    }
    for (var c = 0; c + 1 < righeNodo.length; c++) {
      if (q[c] < meta || q[c + 1] < meta) continue;
      var qp = contenimento(np, righeNodo[c].testo + ' ' + righeNodo[c + 1].testo);
      if (qp < soglia || qp - q[c] < 1e-9 || qp - q[c + 1] < 1e-9) continue;
      prendiFinestra(c, 2);
    }
    return out.map(_esce);
  }
  function _esce(x) { return { r: x.r, via: x.via, coppia: x.sola ? null : x.coppia }; }

  /* ── CONFERMATA ────────────────────────────────────────────────────────────
     Una decisione che NON ha cambiato il testo: «Mantieni», oppure «Modifica»
     o «Applica» con un testo uguale a quello di prima. La regola è quella di
     GroundingCore.isTeacherAmendment (inv. 6): è una rettifica se e solo se
     prima e dopo differiscono. Una rimozione (dopo = null) non è una conferma. */
  function confermata(issue, decision) {
    var i = issue || {}, d = decision || {};
    if (d.choice === 'reject') return true;
    if (d.choice !== 'manual' && d.choice !== 'accept') return false;
    if (d.choice === 'manual' && !own(d, 'text')) return false;
    if (d.choice === 'accept' && !i.hasProposal) return false;
    var dopo = d.choice === 'manual' ? d.text : i.after;
    if (dopo == null || !own(i, 'before')) return false;
    return !GC().isTeacherAmendment({ origin: 'teacher', choice: d.choice, before: i.before, after: dopo });
  }

  /* ── LA REVISIONE RISTRETTA ALLE DECISIONI PRESE ───────────────────────────
     Come fa RC.previewItem: una copia con le sole segnalazioni decise. Così
     `preview` applica le correzioni del docente anche se altre segnalazioni
     sono ancora da decidere (con quelle dentro, `preview` non applica niente). */
  function _pending(rc, i, decisions) { return rc.decisionOutcome(i, (decisions || {})[i.id]) === 'pending'; }
  function reviewDecise(review) {
    var rc = RC(), dec = (review && review.initial && review.initial.decisions) || {};
    return Object.assign({}, review, { initial: Object.assign({}, review.initial, {
      issues: (review.initial.issues || []).filter(function (i) { return !_pending(rc, i, dec); })
    }) });
  }
  /* Il db corretto dalle decisioni prese. `ok` false con i conflitti di
     `preview`: allora il db resta quello di partenza e la quarantena non consente. */
  function correggi(review, db, sources) {
    var p = RC().preview(reviewDecise(review), db, sources === undefined ? undefined : { sources: sources });
    return { ok: !p.conflicts.length, db: p.db, overrides: p.overrides || [], conflitti: p.conflicts || [] };
  }

  /* ── LA COPERTURA DEL GIUDICE ──────────────────────────────────────────────
     Un nodo è esaminato se il Giudice l'ha letto in ALMENO UN giro di questa
     revisione: l'ultimo (`initial.report`) o uno dei precedenti
     (`initial.previousReports`, che `RC.mergeRetry` accetta solo sulla stessa
     base e sulle stesse fonti). In un giro, esaminato = in
     `copertura.nodiEsaminati` (entrambi i contratti lo scrivono) e non in
     `copertura.nodiSaltati`; un giro vecchio senza `nodiEsaminati` conta chi
     non è fra i saltati, tranne con il contratto mappai-giudice@2. Un giro
     senza `copertura` non dice che cosa ha letto: non esamina niente.
     `daGiriPrecedenti`: i nodi che l'ultimo giro non ha esaminato e un giro
     precedente sì (la ricevuta li conta). Senza rapporti nessun nodo è
     esaminato.
     I COLLEGAMENTI allo stesso modo (correzione del 26/09, giro 1): il Giudice
     esamina solo quelli con un verbo (i neutri — «include», «approfondisce»… —
     non li chiede mai) e ogni giro li mette tutti in `copertura.linkEsaminati`
     o in `copertura.linkSaltati`. Un collegamento che sta negli elenchi di
     qualche giro ma non è mai fra gli esaminati è `linkNonEsaminati`: il suo
     verbo arriverebbe ai materiali (triple della sintesi, catena dei perché)
     senza che nessuno l'abbia letto. La chiave è sorgente, destinazione e
     verbo sul db CORRETTO: un verbo riscritto dal docente non sta negli elenchi
     del Giudice, quindi non esce (il suo testo non va in quarantena). La lista
     dei neutri non si ricopia qui (inv. 6): chi è da esaminare lo dicono gli
     elenchi del Giudice. Un giro senza elenchi dei collegamenti non ne dice
     niente. */
  function _chiaveLink(l) {
    return JSON.stringify([eid(l && l.source), eid(l && l.target), l && l.rel != null ? String(l.rel) : '']);
  }
  function _linkGiro(rep) {
    var cop = rep && typeof rep === 'object' ? rep.copertura : null;
    if (!cop || typeof cop !== 'object') return null;
    var es = Array.isArray(cop.linkEsaminati) ? cop.linkEsaminati : null, sa = Array.isArray(cop.linkSaltati) ? cop.linkSaltati : null;
    if (!es && !sa) return null;
    return { esaminati: (es || []).map(_chiaveLink), elencati: (es || []).concat(sa || []).map(_chiaveLink) };
  }
  function _linkNonEsaminati(ini, db) {
    var esaminati = new Set(), elencati = new Set();
    [ini.report].concat(Array.isArray(ini.previousReports) ? ini.previousReports : []).forEach(function (rep) {
      var g = _linkGiro(rep);
      if (!g) return;
      g.esaminati.forEach(function (k) { esaminati.add(k); });
      g.elencati.forEach(function (k) { elencati.add(k); });
    });
    var visti = new Set();
    return ((db && db.links) || []).filter(function (l) {
      var k = _chiaveLink(l);
      if (visti.has(k) || !elencati.has(k) || esaminati.has(k)) return false;
      visti.add(k); return true;
    }).map(function (l) { return { source: eid(l.source), target: eid(l.target), rel: own(l, 'rel') && l.rel != null ? l.rel : null }; });
  }
  function _esaminatiGiro(rep, ids) {
    if (!rep || typeof rep !== 'object' || !Object.keys(rep).length) return null;
    var cop = rep.copertura;
    if (!cop || typeof cop !== 'object') return new Set();
    var saltati = new Set((Array.isArray(cop.nodiSaltati) ? cop.nodiSaltati : []).map(eid));
    var letti = Array.isArray(cop.nodiEsaminati) ? new Set(cop.nodiEsaminati.map(eid))
      : rep.contratto === 'mappai-giudice@2' ? new Set() : null;
    return new Set(ids.filter(function (id) { return !saltati.has(id) && (!letti || letti.has(id)); }));
  }
  function copertura(review, db) {
    var ids = ((db && db.nodes) || []).map(function (n) { return eid(n.id); });
    var ini = (review && review.initial) || {};
    var ultimo = _esaminatiGiro(ini.report, ids);
    var giri = (Array.isArray(ini.previousReports) ? ini.previousReports : [])
      .map(function (rep) { return _esaminatiGiro(rep, ids); }).filter(Boolean);
    if (!ultimo && !giri.length) return { rapporto: false, esaminati: [], nonEsaminati: ids.slice(), daGiriPrecedenti: [], giri: 0, linkNonEsaminati: [] };
    var visto = function (id) { return (ultimo && ultimo.has(id)) || giri.some(function (g) { return g.has(id); }); };
    return { rapporto: true, esaminati: ids.filter(visto),
      nonEsaminati: ids.filter(function (id) { return !visto(id); }),
      daGiriPrecedenti: ids.filter(function (id) { return !(ultimo && ultimo.has(id)) && visto(id); }),
      giri: giri.length + (ultimo ? 1 : 0), linkNonEsaminati: _linkNonEsaminati(ini, db) };
  }

  /* ── LE CORSIE ─────────────────────────────────────────────────────────────
     opts: { review, db, sources?, frasi? }. `db` è la mappa VIVA; le corsie si
     calcolano sul db corretto dalle decisioni prese. Restituisce le righe (una
     per affermazione, con corsia, origine, issueId e la frase vicina), i
     collegamenti esclusi, le etichette segnalate e i modi del passo contestato. */
  function _righeNodo(righe) {
    var per = {};
    righe.forEach(function (r) { (per[r.nodeId] = per[r.nodeId] || []).push(r); });
    return per;
  }
  /* Giro 7 (H5). Le righe di ALTRI nodi di cui il problema di una
     segnalazione 'nodo' parla con ogni probabilità: almeno 0,5 delle parole
     piene della riga stanno nel problema, e almeno 0,2 in più della migliore
     riga del bersaglio (le soglie della sovrapposizione nel verso 'frase').
     `righe` = le affermazioni della mappa corretta, con `nodeId`. */
  function altroveNelProblema(problema, righe, bersaglio) {
    var p = normalizza(problema), b = eid(bersaglio);
    if (!p || !righe || !righe.length) return [];
    var dc = DC(), idx = dc.buildCoverageIndex(p), S = SOVRAPPOSIZIONE;
    var q = function (r) { return dc.lexicalOverlap(normalizza(r.testo), idx).containment; };
    var suo = righe.reduce(function (m, r) { return r.nodeId === b ? Math.max(m, q(r)) : m; }, 0);
    return righe.filter(function (r) {
      if (r.nodeId === b) return false;
      var x = q(r);
      return x >= S.frase - 1e-9 && x - suo >= S.margine - 1e-9;
    });
  }
  /* `modo`: come la segnalazione è stata localizzata sulla frase. 'nodo' vuol
     dire che la frase esce perché il controllo ha segnalato il NODO senza dire
     quale frase: l'interfaccia non deve chiamarla «contestata». */
  function _fuori(r, corsia, origine, issueId, modo) {
    r.corsia = corsia; r.origine = origine; r.issueId = issueId || null; r.modo = modo || null;
  }
  /* La frase del docente non esce mai, nemmeno per coesione, e interrompe la
     catena: la frase che la segue non riprende più un'esclusione. */
  function coesione(righe) {
    var n = 0, per = _righeNodo(righe);
    Object.keys(per).forEach(function (id) {
      var prec = null;
      per[id].forEach(function (r) {
        if (FUORI.indexOf(r.corsia) >= 0) { prec = r; return; }
        if (prec && r.corsia !== CORSIE.DOCENTE && anafora(r.testo)) {
          _fuori(r, CORSIE.COESIONE, prec.origine, prec.issueId); n++; prec = r; return;
        }
        prec = null;
      });
    });
    return n;
  }
  function corsie(opts) {
    var o = opts || {}, review = o.review, rc = RC();
    var sources = own(o, 'sources') ? o.sources : review.sources;
    var frasi = o.frasi || frasiFonte(sources);
    var cor = correggi(review, o.db, own(o, 'sources') ? o.sources : undefined);
    var dbc = cor.db, dec = review.initial.decisions || {}, issues = review.initial.issues || [];
    var cop = copertura(review, dbc), nonEs = new Set(cop.nonEsaminati);

    // le frasi scritte dal docente: quelle del testo di una decisione che ha cambiato la desc, e che prima non c'erano;
    // e i nodi la cui desc è stata CAMBIATA da una decisione presa, anche solo togliendo (giro 3, D1)
    var delDocente = {}, nodiCambiati = new Set();
    issues.forEach(function (i) {
      if (i.target.kind !== 'node' || i.target.field !== 'desc') return;
      var d = dec[i.id], esito = rc.decisionOutcome(i, d);
      if (esito !== 'edited' && esito !== 'applied') return;
      nodiCambiati.add(eid(i.target.id));
      var dopo = d.choice === 'manual' ? d.text : i.after;
      if (typeof dopo !== 'string') return;
      var prima = new Set(affermazioni(typeof i.before === 'string' ? i.before : '').map(function (a) { return a.impronta; }));
      affermazioni(dopo).forEach(function (a) {
        if (!prima.has(a.impronta)) (delDocente[i.target.id] = delDocente[i.target.id] || new Set()).add(a.impronta);
      });
    });
    // i collegamenti che una decisione presa ha cambiato: verbo nuovo, «nessuna parola», collegamento tolto (giro 3, D2)
    var linkCambiati = [];
    issues.forEach(function (i) {
      var tg = i.target;
      if (tg.kind !== 'link' || (tg.field !== 'rel' && tg.field !== '$link')) return;
      var esito = rc.decisionOutcome(i, dec[i.id]);
      if (esito !== 'edited' && esito !== 'applied' && esito !== 'excluded') return;
      linkCambiati.push({ source: eid(tg.source), target: eid(tg.target), rel: own(tg, 'rel') ? tg.rel : null, issueId: i.id });
    });

    var righe = affermazioniDb(dbc);
    righe.forEach(function (r) { r.corsia = null; r.origine = null; r.issueId = null; r.modo = null; r.via = null; r.vicina = null; r.bersaglio = null; });
    var per = _righeNodo(righe);

    // 1 · le frasi scritte dal docente: restano, sempre (il suo testo non va mai in quarantena)
    righe.forEach(function (r) {
      if (delDocente[r.nodeId] && delDocente[r.nodeId].has(r.impronta)) { r.corsia = CORSIE.DOCENTE; r.origine = 'docente'; }
    });

    // 2 · nodi che nessun giro del Giudice ha esaminato
    righe.forEach(function (r) { if (!r.corsia && nonEs.has(r.nodeId)) _fuori(r, CORSIE.NON_ESAMINATA, 'copertura', null); });

    // 3 · segnalazioni pending sulla desc
    var modi = { manuale: 0, proposta: 0, citato: 0, sovrapposizione: 0, nodo: 0 }, nonRitrovati = 0, superate = [];
    var linkEsclusi = [], etichette = 0, pendentiDesc = [], colpiteDi = {}, ritoccateDi = {};
    var delDocenteRiga = function (r) { return !!(delDocente[r.nodeId] && delDocente[r.nodeId].has(r.impronta)); };
    var tuttiNodi = Object.keys(per);
    issues.forEach(function (i) {
      if (!_pending(rc, i, dec)) return;
      var t = i.target;
      if (t.kind === 'link' && (t.field === 'rel' || t.field === '$link')) {
        linkEsclusi.push({ source: eid(t.source), target: eid(t.target), rel: own(t, 'rel') ? t.rel : (typeof i.before === 'string' ? i.before : null), issueId: i.id });
        return;
      }
      if (t.kind === 'node' && t.field === 'label') { etichette++; return; }
      if (t.kind !== 'node' || t.field !== 'desc') return;
      pendentiDesc.push(i);
      var bersaglio = eid(t.id);
      if (nonEs.has(bersaglio) || !per[bersaglio]) { colpiteDi[i.id] = per[bersaglio] || []; return; }
      var origine = i.origin === 'teacher' ? 'docente' : 'giudice';
      var passo = passoContestato(i, dec[i.id]);
      modi[passo.modo]++;
      var righeNodo = per[bersaglio], ambito = passo.modo, nodo = passo.modo === 'nodo';
      var cambiato = nodiCambiati.has(bersaglio);
      /* dove si cerca il passo: il bersaglio e i nodi la cui desc è stata
         cambiata da una decisione presa (il passo spostato, giro 5, F1); con
         un passo INDIVIDUATO tutta la mappa (giro 7, H3) */
      var vicini = [bersaglio].concat(Array.from(nodiCambiati).filter(function (id) { return id !== bersaglio && per[id]; }));
      var dove = nodo ? vicini : [bersaglio].concat(tuttiNodi.filter(function (id) { return id !== bersaglio; }));
      /* Giro 7 (H6): il testo del docente che resta con 'nodo' è quello che il
         docente ha davvero scritto. Una riga della sua corsia che contiene
         PAROLA PER PAROLA (nella forma di `_forma`) una frase base del
         bersaglio non lo è: è una frase base spostata in un altro nodo, o una
         frase originale «promossa» dall'unione col frammento che finisce con
         «:» e che il docente ha cambiato. La riscrittura vera resta. */
      var basiBersaglio = affermazioni(typeof i.before === 'string' ? i.before : '').map(function (a) { return a.testo; });
      var formeBase = basiBersaglio.map(_forma).filter(Boolean);
      var fidata = function (r) {
        if (!delDocenteRiga(r)) return false;
        var fr = _forma(r.testo);
        return !formeBase.some(function (b) { return fr.indexOf(b) >= 0; });
      };
      var prese = [], mancanti = 0;
      var prendi = function (r, via, base, coppia) {
        var x = prese.find(function (p) { return p.r === r; });
        if (!x) prese.push(x = { r: r, via: via, passi: [], coppia: coppia || null });
        else {
          if (via === 'frammento' || (via === 'frase' && x.via === 'contenimento')) x.via = via;
          if (!coppia) x.coppia = null;   // presa anche da sola: non è solo un pezzo di una finestra
        }
        if (base && normalizza(base) !== normalizza(r.testo) && x.passi.indexOf(base) < 0) x.passi.push(base);
      };
      /* le frasi base contestate: con 'nodo' tutta la desc base; con gli
         altri modi le frasi del passo, comprese quelle AGGIUNTE (`_estendi`,
         i frammenti di 'proposta'). Anche con 'citato': la frase che
         conteneva il frammento resta un passo contestato. Col solo frammento,
         su L1_3_L2_B di Svizzera la proposta accettata cambia il soggetto
         («lo Stato svizzero» → «le banche svizzere») e il frammento citato
         non si ritrova più parola per parola, mentre l'accusa contestata
         («di aver rifiutato di restituire i soldi…») resta intatta nella
         frase: sarebbe andata ai materiali come «superata». Il frammento si
         AGGIUNGE alla ricerca, non la sostituisce. */
      var aggiunte = new Set((passo.aggiunte || []).map(function (x) { return x.testo; }));
      var base = nodo ? basiBersaglio
        : [].concat.apply([], passo.passi.map(function (p) { return affermazioni(p.testo).map(function (a) { return a.testo; }); }));
      base.forEach(function (b) {
        var trovate = 0;
        dove.forEach(function (id) { _riprese(b, per[id], !nodo).forEach(function (x) { prendi(x.r, x.via, b, x.coppia); trovate++; }); });
        // una frase AGGIUNTA che non si ritrova più è già fuori dalla vista: non manca niente
        if (!trovate && !nodo && !aggiunte.has(b)) mancanti++;
      });
      /* Il frammento fra virgolette ('citato', 'proposta'), su TUTTA la mappa
         corretta; la riga porta con sé le frasi base che lo contenevano, per
         le rettifiche. Giro 7 (H7): fuori dal bersaglio e dai nodi cambiati
         toglie una riga solo se il frammento copre almeno metà delle parole
         piene della sua frase base, oppure se la riga riprende quella frase
         base (τc); altrimenti vale solo nel bersaglio e nei nodi cambiati. */
      var inVicini = new Set(vicini);
      (passo.frammenti || []).forEach(function (f) {
        var trovate = 0, cf = _forma(f);
        var basi = base.filter(function (b) { return _forma(b).indexOf(cf) >= 0; });
        var copre = basi.some(function (b) { return contenimento(b, f) >= CONTENIMENTO - 1e-9; });
        tuttiNodi.forEach(function (id) {
          _righeConIlPasso(f, per[id], _forma).forEach(function (r) {
            var riprende = basi.some(function (b) { return contenimento(b, r.testo) >= CONTENIMENTO - 1e-9; });
            if (!inVicini.has(id) && !copre && !riprende) return;
            prendi(r, 'frammento', null); basi.forEach(function (b) { prendi(r, 'frammento', b); }); trovate++;
          });
        });
        if (!trovate) mancanti++;
      });
      var colpite, perProblema = [];
      if (nodo) {
        /* Giro 6 (G1), giro 7 (H5, H6). Il Giudice ha indicato il nodo senza
           la frase: esce tutto il nodo, e nei nodi cambiati ciò che riprende
           una sua frase base; il testo che il docente ha davvero scritto
           (`fidata`) RESTA. E se il problema parla con ogni probabilità di
           un ALTRO nodo — una frase di un altro nodo sta nel problema per
           almeno 0,5 delle sue parole piene e supera di almeno 0,2 la
           migliore del bersaglio (la regola che la misura calcolava dal giro
           2) — esce anche quella: su Svizzera 899d5 segnala «Economia di
           Guerra» e parla del commercio con i belligeranti. */
        colpite = righeNodo.filter(function (r) { return !fidata(r); });
        prese.forEach(function (x) { if (colpite.indexOf(x.r) < 0 && !fidata(x.r)) colpite.push(x.r); });
        (i.origin === 'teacher' ? [] : altroveNelProblema(i.problem, righe, bersaglio)).forEach(function (r) {
          if (colpite.indexOf(r) >= 0 || fidata(r)) return;
          colpite.push(r); perProblema.push(r);
        });
      } else if (prese.length) {
        colpite = prese.map(function (x) { return x.r; });
        if (mancanti) {
          nonRitrovati++;
          /* una parte del passo non si ritrova e nessuna decisione presa ha
             cambiato il nodo: non si sa dove sia finita, ed esce tutto il nodo */
          if (!cambiato) {
            ambito = 'nodo';
            righeNodo.forEach(function (r) { if (!fidata(r) && colpite.indexOf(r) < 0) colpite.push(r); });
          }
        }
      } else {
        nonRitrovati++;
        /* Il passo non c'è più da nessuna parte: né la frase, né una
           finestra che arrivi alla soglia su tutta la mappa, né il frammento
           citato. Se una decisione PRESA ha cambiato la desc del bersaglio —
           con un testo nuovo, con una proposta accettata, oppure togliendo la
           frase — è stata lei a toglierlo: la segnalazione è superata e non
           esclude niente (giro 3, D1; giro 5, F1). Altrimenti non si sa dove
           sia finito, ed esce tutto il nodo. */
        if (cambiato) { superate.push(i.id); return; }
        ambito = 'nodo';
        colpite = righeNodo.filter(function (r) { return !fidata(r); });
      }
      colpiteDi[i.id] = colpite;
      /* Giro 5 (F1): con un passo individuato la frase del docente esce quando
         lo riprende, in qualunque nodo; resta solo quando non lo riprende. La
         frase contestata resta fuori dai materiali anche se il docente l'ha
         ritoccata o spostata. Con 'nodo' esce soltanto il testo del docente
         che contiene parola per parola una frase del nodo (H6): non è una
         frase «ritoccata che somiglia al passo», e l'esito resta 'fuori'. */
      ritoccateDi[i.id] = ambito === 'nodo' ? [] : colpite.filter(delDocenteRiga);
      colpite.forEach(function (r) {
        if (r.corsia && r.corsia !== CORSIE.DOCENTE) return;   // già fuori per un'altra ragione
        var x = prese.find(function (p) { return p.r === r; });
        if (r.corsia === CORSIE.DOCENTE) r.ritoccata = true;
        _fuori(r, CORSIE.CONTESTATA, origine, i.id, ambito);
        r.bersaglio = bersaglio;
        r.via = x ? x.via : perProblema.indexOf(r) >= 0 ? 'problema' : null;
        if (x && x.coppia) r.coppia = x.coppia;
        // il passo che la riga riprende, com'era prima: le rettifiche lo tolgono dal loro `before`
        if (x && x.passi.length) r.passi = x.passi.slice();
      });
    });

    // 2 · anche per i collegamenti: quelli che nessun giro del Giudice ha esaminato escono dai `links`
    // della vista come un `rel` da decidere (se una segnalazione aperta non li ha già tolti)
    var linkNonEsaminati = 0;
    (cop.linkNonEsaminati || []).forEach(function (l) {
      var gia = linkEsclusi.some(function (x) { return x.source === l.source && x.target === l.target && (x.rel == null || x.rel === l.rel); });
      if (gia) return;
      linkEsclusi.push({ source: l.source, target: l.target, rel: l.rel, issueId: null, origine: 'copertura' });
      linkNonEsaminati++;
    });

    // 4-6 · ciò che resta
    righe.forEach(function (r) {
      if (r.corsia) return;
      if (organizzativa(r.testo)) { r.corsia = CORSIE.SERVIZIO; return; }
      var v = vicina(r.testo, frasi);
      if (v) { r.corsia = CORSIE.VICINA; r.vicina = v; return; }
      r.corsia = CORSIE.SENZA;
    });
    var perCoesione = coesione(righe);

    /* Che cosa fa ai materiali ogni segnalazione aperta sulla desc (giro 2 del
       26/09: il piede del Banco prometteva «lascia fuori le frasi ancora da
       decidere», e per sei segnalazioni di Svizzera non era vero):
         'ritoccata'        fuori una frase che il docente ha cambiato con una
                            sua decisione e che ripete ancora il suo passo
                            individuato (giro 4, E1);
         'fuori'            almeno una delle frasi a cui si riferisce è fuori;
         'superata'         il suo passo non c'è più e una decisione presa ha
                            cambiato la desc;
         'docente'          da sola non toglie niente: il testo del nodo è
                            tutto del docente, e NESSUNA riga del nodo è fuori
                            a fine calcolo (giro 6, G1; giro 7, H10);
         'docente-in-parte' da sola non toglie niente, il testo del nodo è
                            del docente, ma una sua parte è fuori per
                            un'altra segnalazione aperta (giro 7, H10);
         'vuoto'            il nodo non ha testo. */
    var esitiSegnalazioni = {}, senzaEffetto = [];
    var fuoriOra = function (r) { return FUORI.indexOf(r.corsia) >= 0; };
    pendentiDesc.forEach(function (i) {
      if (superate.indexOf(i.id) >= 0) { esitiSegnalazioni[i.id] = 'superata'; return; }
      var col = colpiteDi[i.id] || [], righeB = per[eid(i.target.id)] || [];
      if ((ritoccateDi[i.id] || []).some(fuoriOra)) { esitiSegnalazioni[i.id] = 'ritoccata'; return; }
      if (col.some(fuoriOra)) { esitiSegnalazioni[i.id] = 'fuori'; return; }
      esitiSegnalazioni[i.id] = !(col.length || righeB.length) ? 'vuoto' : righeB.some(fuoriOra) ? 'docente-in-parte' : 'docente';
      senzaEffetto.push(i.id);
    });

    return { db: dbc, overrides: cor.overrides, conflitti: cor.conflitti, frasi: frasi, righe: righe,
      linkEsclusi: linkEsclusi, linkNonEsaminati: linkNonEsaminati, etichetteSegnalate: etichette, rapporto: cop.rapporto,
      esaminati: cop.esaminati, nonEsaminati: cop.nonEsaminati, daGiriPrecedenti: cop.daGiriPrecedenti,
      modi: modi, passiNonRitrovati: nonRitrovati, superate: superate,
      esitiSegnalazioni: esitiSegnalazioni, senzaEffetto: senzaEffetto,
      coesione: perCoesione, pendentiDesc: pendentiDesc.length,
      decisioniPrese: { nodi: Array.from(nodiCambiati), link: linkCambiati } };
  }

  /* ── LA FIRMA ──────────────────────────────────────────────────────────────
     Lega il record alle segnalazioni, alle decisioni, alla mappa (l'elenco
     delle impronte delle sue affermazioni), al documento dei nessi e alla
     COPERTURA del Giudice: se uno di questi cambia, il record non vale più.
     La copertura (giro 3 del 26/09, D6) è l'unione dei nodi esaminati in
     tutti i giri, con i collegamenti che nessun giro ha esaminato: un
     «Riprova il controllo» che non trova segnalazioni nuove lascia uguali
     issues e decisioni, ma allarga ciò che è stato letto — e le corsie ne
     dipendono. Senza la copertura nella firma, le bozze nate prima del
     ricontrollo sopravvivevano con dentro l'esclusione di nodi ormai esaminati.
     Giro 7 (H8): e alle REGOLE con cui le corsie sono state calcolate. Un
     record nato con regole diverse ha un'altra firma: non consente, e le
     bozze che porta si rigenerano. `regole` si passa solo per provarlo.
     Packet 0060: la firma NON dipende dall'ordine di `db.nodes` e `db.links`
     (alla riapertura è l'ordine dei file di Nodi/); l'ordine delle
     segnalazioni e quello delle frasi dentro un nodo sì, perché sono contenuto. */
  function _firmaCopertura(review, db) {
    var cop = copertura(review, db);
    return { nodi: cop.esaminati.slice().sort(),
      link: (cop.linkNonEsaminati || []).map(_chiaveLink).sort() };
  }
  /* Le impronte come entrano nella FIRMA (packet 0060): per nodo, con dentro
     l'ordine delle frasi del testo (è contenuto); l'ordine dei nodi no — alla
     riapertura è l'ordine dei file di Nodi/ (main.js:1422, :1923). La forma
     canonica la dà RC.revision({items}), come ogni altra impronta (inv. 6).
     Una Map, non un oggetto con gli id per chiave (`__proto__`). */
  function _improntePerFirma(db) {
    var per = new Map(), items = [];
    affermazioniDb(db).forEach(function (a) {
      if (!per.has(a.nodeId)) per.set(a.nodeId, []);
      per.get(a.nodeId).push(a.impronta);
    });
    per.forEach(function (h, id) { items.push({ id: id, impronte: h }); });
    return RC().revision({ items: items }, []);
  }
  function firma(review, db, causalDoc, regole) {
    var rc = RC(), i = (review && review.initial) || {};
    var causal = rc.revision({ items: [{ id: 'causal', value: causalDoc == null ? null : causalDoc }] }, []);
    return rc.revision({ items: [{ id: 'quarantena', value: { schema: SCHEMA, regole: regole === undefined ? REGOLE : regole,
      issues: i.issues || [], decisions: i.decisions || {}, impronte: _improntePerFirma(db), causal: causal,
      copertura: _firmaCopertura(review, db) } }] }, []);
  }

  /* ── LA VISTA ──────────────────────────────────────────────────────────────
     Dal db corretto al db dei materiali: le frasi escluse si tolgono per
     sottostringa dal testo ORIGINALE, senza ricomporlo, da `desc` e da
     `content` insieme; i collegamenti esclusi escono da `links`; il documento
     dei nessi esce se il record lo dice. Senza esclusioni: lo STESSO
     riferimento. Una frase esclusa che non si ritrova fa lanciare: meglio
     nessun materiale che uno con la frase dentro. */
  /* Toglie da `testo` le `frasi` (i testi verbatim delle affermazioni escluse).
     Una frase vale solo se è un'affermazione INTERA del testo: «circuito.» non
     si toglie da «Premessa del circuito.». Le posizioni si prendono una volta
     sul testo originale e si tolgono da destra, così le altre non si spostano.
     → { testo, mancanti: [frasi non ritrovate] }
     Fra ciò che resta a sinistra e ciò che resta a destra di un taglio va un
     A CAPO, mai uno spazio (in testa e in coda, niente). Chi rilegge la vista
     spezza sull'a capo e non sul punto e virgola: Intl.Segmenter (le
     rettifiche) e l'estrattore dei nessi (CausalCore.extractDescTriples, la
     catena dei perché e le triple della sintesi). «A; B; C.» senza «B;»
     diventava «A; C.», UNA frase nuova che nessuno ha scritto — e, se C
     comincia con «quindi», una tripla nuova «A → C». Con l'a capo resta
     «A;\nC.»: due pezzi, nessuna giunzione. L'a capo spezza per ogni
     segmentatore (UAX #29, SB4), e il testo resta parola per parola. Tagli
     contigui si tolgono insieme, con un a capo solo.
     (Giro 3 del 26/09, D3: solo per le rettifiche; giro 4, E2: anche per la
     vista, che prima lasciava uno spazio.) */
  function _togli(testo, frasi) {
    var affs = affermazioni(testo), usate = {}, tagli = [], mancanti = [];
    frasi.forEach(function (f) {
      var a = affs.find(function (x) { return !usate[x.indice] && x.testo === f; });
      if (!a) { mancanti.push(f); return; }
      usate[a.indice] = 1; tagli.push(a);
    });
    var blocchi = [];
    tagli.sort(function (x, y) { return x.start - y.start; }).forEach(function (a) {
      var ultimo = blocchi[blocchi.length - 1];
      if (ultimo && !testo.slice(ultimo.end, a.start).trim()) ultimo.end = a.end;
      else blocchi.push({ start: a.start, end: a.end });
    });
    blocchi.reverse().forEach(function (b) {
      var prima = b.start, dopo = b.end;
      while (prima > 0 && /\s/.test(testo[prima - 1])) prima--;
      while (dopo < testo.length && /\s/.test(testo[dopo])) dopo++;
      var sx = testo.slice(0, prima), dx = testo.slice(dopo);
      testo = sx + (sx && dx ? '\n' : '') + dx;
    });
    return { testo: testo, mancanti: mancanti };
  }
  function vistaDb(db, record) {
    var r = record || {}, escluse = r.escluse || [], link = r.linkEsclusi || [];
    if (!escluse.length && !link.length && !r.causalDocScartato) return db;
    var out = Object.assign({}, db), per = {};
    escluse.forEach(function (e) { (per[eid(e.nodeId)] = per[eid(e.nodeId)] || []).push(e.testo); });
    if (Object.keys(per).length) {
      var visti = {};
      out.nodes = (db.nodes || []).map(function (n) {
        var id = eid(n.id), frasi = per[id];
        if (!frasi) return n;
        visti[id] = 1;
        var copia = Object.assign({}, n), campo = n.desc ? 'desc' : 'content';
        var tolto = _togli(String(n[campo] || ''), frasi), testo = tolto.testo;
        if (tolto.mancanti.length) fail('frase_esclusa_non_trovata');
        copia[campo] = testo;
        // `content` è spesso la stessa desc (le decisioni la tengono in pari): lì si tolgono le stesse frasi
        if (campo === 'desc' && typeof n.content === 'string' && n.content) copia.content = _togli(n.content, frasi).testo;
        if (!testo.trim()) { copia.desc = ''; if (own(n, 'content')) copia.content = ''; }
        return copia;
      });
      Object.keys(per).forEach(function (id) { if (!visti[id]) fail('frase_esclusa_non_trovata'); });
    }
    if (link.length) {
      out.links = (db.links || []).filter(function (l) {
        return !link.some(function (x) {
          if (eid(l.source) !== x.source || eid(l.target) !== x.target) return false;
          if (x.rel == null) return true;
          var esatto = (db.links || []).some(function (m) { return eid(m.source) === x.source && eid(m.target) === x.target && (m.rel || 'include') === x.rel; });
          return !esatto || (l.rel || 'include') === x.rel;
        });
      });
    }
    if (r.causalDocScartato) delete out.causalDoc;
    return out;
  }
  /* LE RETTIFICHE DELLA VISTA (correzione del 26/09, giro 2). I materiali
     ricevono le correzioni decise due volte: dentro le desc della vista e nel
     blocco «RETTIFICHE DEL DOCENTE — prevalgono sul testo della fonte», che
     GroundingCore.buildInput costruisce dalle `overrides` spezzando il testo
     con Intl.Segmenter. Il Segmenter non spezza sul punto e virgola, lo
     splitter delle affermazioni sì: una correzione sulla prima metà di una
     frase con «;» riportava nelle rettifiche anche la seconda metà, contestata
     da una segnalazione aperta e tolta dalla vista. Qui le rettifiche si
     riportano alla vista:
       · da una rettifica su un nodo si tolgono le frasi escluse di quel nodo,
         per sottostringa come in `vistaDb`; se una frase esclusa resta
         comunque dentro (il testo della decisione e quello corretto si
         spezzano in modo diverso), la rettifica prende il testo del nodo
         nella VISTA, che non la contiene per costruzione;
       · una rettifica su un collegamento che la vista ha tolto non entra
         (stessi capi: nel dubbio fuori).
     Una rettifica senza esclusioni resta lo STESSO oggetto, e così una
     decisione che non ha cambiato il testo («Mantieni», o «Modifica» col testo
     di prima): non è una rettifica (GroundingCore.isTeacherAmendment), e
     togliendole una frase lo diventerebbe, vuota.
     Correzione del 26/09, giro 3 (D3): il taglio lascia un A CAPO fra ciò che
     resta (`_togli`), così il Segmenter non incolla la frase che finisce con
     «;» a quella che seguiva la frase tolta. Anche il ripiego segue la regola:
     con `corretto` (il db corretto dalle decisioni, da cui vengono le frasi
     escluse) si toglie dal SUO testo, con gli a capo; senza, o se lì non si
     ritrovano, il testo del nodo nella vista, come prima.
     Correzione del 26/09, giro 4 (E2): il blocco mostra le frasi del Segmenter
     che stanno in `after` e non in `before` (GroundingCore.amendmentText).
     Tagliando solo `after`, «A; B; C.» senza «B;» dava «A;» e «C.» come due
     frasi nuove, cioè «promuoveva» a testo del docente due pezzi che il docente
     non ha scritto. Ora `after` e `before` si tagliano nello STESSO modo: le
     stesse frasi (le escluse del nodo e, per quelle che ripetono un passo
     contestato senza esserlo parola per parola, il passo com'era: `passi` nel
     record), lo stesso a capo, su ciascun lato dove ci sono. Ciò che resta
     uguale sui due lati non è una rettifica. */
  function rettifiche(overrides, record, vista, corretto) {
    var r = record || {}, per = {}, escluse = {}, link = r.linkEsclusi || [], nodi = {}, base = {}, gc = GC();
    var emenda = function (o) { return gc && typeof gc.isTeacherAmendment === 'function' ? gc.isTeacherAmendment(o) : !!o && o.after !== o.before; };
    (r.escluse || []).forEach(function (e) {
      var k = eid(e.nodeId);
      (escluse[k] = escluse[k] || []).push(e.testo);
      var lista = per[k] = per[k] || [];
      lista.push(e.testo);
      (Array.isArray(e.passi) ? e.passi : []).forEach(function (t) { if (typeof t === 'string' && lista.indexOf(t) < 0) lista.push(t); });
    });
    ((vista && vista.nodes) || []).forEach(function (n) { nodi[eid(n.id)] = n; });
    ((corretto && corretto.nodes) || []).forEach(function (n) { base[eid(n.id)] = n; });
    return (overrides || []).filter(function (o) {
      var tg = (o && o.target) || {};
      if (tg.kind !== 'link') return true;
      return !link.some(function (x) { return eid(tg.source) === eid(x.source) && eid(tg.target) === eid(x.target); });
    }).map(function (o) {
      var tg = (o && o.target) || {}, frasi = per[eid(tg.id)];
      if (tg.kind !== 'node' || (tg.field !== 'desc' && tg.field !== 'content') || typeof o.after !== 'string' || !frasi || !emenda(o)) return o;
      var dentro = function (t) {
        var p = normalizza(t);
        return frasi.some(function (f) { var x = normalizza(f); return x && p.indexOf(x) >= 0; });
      };
      // il taglio: le frasi dell'elenco che in `t` sono affermazioni intere, con l'a capo
      var taglia = function (t) {
        var affs = affermazioni(t);
        return _togli(t, frasi.filter(function (f) { return affs.some(function (a) { return a.testo === f; }); })).testo;
      };
      var dopo = taglia(o.after), prima = typeof o.before === 'string' ? taglia(o.before) : o.before;
      if (dentro(dopo)) {
        var nb = base[eid(tg.id)], tolto = nb ? taglia(testoNodo(nb)) : null;
        var tutte = nb && (escluse[eid(tg.id)] || []).every(function (f) { return affermazioni(testoNodo(nb)).some(function (a) { return a.testo === f; }); });
        dopo = tutte && !dentro(tolto) ? tolto : testoNodo(nodi[eid(tg.id)]);
      }
      return dopo === o.after && prima === o.before ? o : Object.assign({}, o, { after: dopo, before: prima });
    });
  }
  /* Il documento dei nessi (ELABORA) si tiene solo se non contiene frasi né
     collegamenti esclusi: una riga di nesso nasce da una frase della desc (i
     due capi della frase) o da un collegamento (etichetta → etichetta).
     Una riga con origine 'desc' (correzione del 26/09, giro 1: «La guerra
     provocò la fame.» ha due capi brevi, e la soglia dei 12 caratteri la
     lasciava passare) è colpita se i suoi due capi stanno nella stessa frase
     esclusa, a qualunque lunghezza; oppure se viene da un nodo che ha frasi
     escluse, o da un nodo che non si riconosce più (l'estrattore dei nessi
     spezza le frasi a modo suo e accorcia i capi lunghi: nel dubbio il
     documento esce, e i materiali ricostruiscono i nessi dalla vista).
     Correzione del 26/09, giro 2: una riga 'desc' nata da una frase che una
     DECISIONE PRESA ha cambiato è vecchia anche se niente è escluso (sotto
     quarantena la mappa aperta non riceve le correzioni, quindi un documento
     salvato in ELABORA mentre G1 aspetta nasce dal testo non corretto). La
     riga è colpita se un suo capo sta nel testo del suo nodo nella mappa
     (`db`) e non più in quello della VISTA (`vista`): viene da testo che ai
     materiali non arriva. (Un capo che non sta nemmeno nella mappa l'ha
     scritto il docente in ELABORA: da solo non scarta niente, ma dal giro 3
     la regola qui sotto guarda il NODO, e se una decisione presa l'ha
     cambiato il documento esce comunque, con le modifiche fatte in ELABORA.) */
  /* Correzione del 26/09, giro 3 (D2): il documento esce anche quando una
     DECISIONE PRESA tocca un nodo o un collegamento che vi compare — una desc
     cambiata (testo nuovo, proposta accettata, frase tolta) di un nodo che ha
     righe nel documento, oppure un collegamento col verbo cambiato, tolto
     («nessuna parola») o eliminato fra due nodi che una riga collega. Prima
     guardava solo i capi delle righe: una correzione che toglieva il «quindi»
     lasciava i due capi nel testo, e il nesso che il docente aveva tolto
     arrivava ai materiali. Una riga 'desc' di un nodo che non si riconosce, o
     una riga 'link' fra etichette che non si riconoscono, con decisioni prese
     dello stesso tipo: nel dubbio esce anche lei.
     → '' se il documento resta; altrimenti il motivo, in quest'ordine:
       'frase_esclusa', 'nodo_con_esclusioni', 'nodo_non_riconosciuto',
       'collegamento_escluso', 'decisione_descrizione', 'decisione_collegamento'.
     Giro 5 del 26/09 (F3): 'frase_esclusa' solo quando una riga CONTIENE una
     frase esclusa (o ne viene: i due capi nella stessa frase); la riga che
     viene soltanto da un nodo con frasi escluse è 'nodo_con_esclusioni', e
     quella di un nodo che non si riconosce è 'nodo_non_riconosciuto'. Prima
     tutte e tre dicevano «contiene una frase che la quarantena tiene fuori»,
     e per le ultime due non era vero. */
  var MOTIVI_NESSI = ['frase_esclusa', 'nodo_con_esclusioni', 'nodo_non_riconosciuto', 'collegamento_escluso', 'decisione_descrizione', 'decisione_collegamento'];
  function _motivoNessi(doc, escluse, linkEsclusi, vista, db, prese) {
    if (!doc) return '';
    var testi = escluse.map(function (e) { return normalizza(e.testo).toLowerCase(); });
    var etichette = {}, note = {}, conEsclusioni = {}, idDi = {}, testoMappa = {}, testoVista = {};
    var piatto = function (s) { return normalizza(s).toLowerCase(); };
    // l'etichetta come la scrive l'estrattore dei nessi (CausalCore._clean): senza punteggiatura ai bordi
    var nome = function (s) { return piatto(s).replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, ''); };
    var nomiDi = {}, nomiNoti = new Set();
    var nomina = function (n) {
      var id = eid(n.id), k = nome(n.label);
      (nomiDi[id] = nomiDi[id] || new Set()).add(k); nomiNoti.add(k);
    };
    ((vista && vista.nodes) || []).forEach(function (n) {
      var lab = piatto(n.label);
      etichette[eid(n.id)] = lab; note[lab] = 1;
      if (!own(idDi, lab)) idDi[lab] = eid(n.id);
      testoVista[eid(n.id)] = piatto(testoNodo(n));
      nomina(n);
    });
    ((db && db.nodes) || []).forEach(function (n) {
      var lab = piatto(n.label);
      if (!own(idDi, lab)) idDi[lab] = eid(n.id);
      testoMappa[eid(n.id)] = piatto(testoNodo(n));
      nomina(n);
    });
    escluse.forEach(function (e) { var lab = etichette[eid(e.nodeId)]; if (lab != null) conEsclusioni[lab] = 1; });
    var p = prese || {}, nodiDecisi = (p.nodi || []).map(eid), linkDecisi = p.link || [], nomiDecisi = new Set();
    nodiDecisi.forEach(function (id) { (nomiDi[id] || new Set()).forEach(function (k) { nomiDecisi.add(k); }); });
    var fra = function (a, b, x) {
      var s = nomiDi[eid(x.source)], t = nomiDi[eid(x.target)];
      return !!(s && t && ((s.has(a) && t.has(b)) || (s.has(b) && t.has(a))));
    };
    var capo = function (s) { return normalizza(s).toLowerCase().replace(/(?:\.\.\.|…)$/, '').trim(); };
    var motivi = {};
    var colpisci = function (m) { motivi[m] = 1; };
    ((doc.sections) || []).forEach(function (s) {
      (s.rows || []).forEach(function (row) {
        var l = normalizza(row.left).toLowerCase(), rr = normalizza(row.right).toLowerCase();
        if (row.origin === 'desc') {
          var nodo = normalizza(row.nodeLabel).toLowerCase(), cl = capo(row.left), cr = capo(row.right), k = nome(row.nodeLabel);
          if (testi.length && nodo && conEsclusioni[nodo]) colpisci('nodo_con_esclusioni');
          else if (testi.length && (!nodo || !note[nodo])) colpisci('nodo_non_riconosciuto');
          testi.forEach(function (t) { if (cl && cr && t.indexOf(cl) >= 0 && t.indexOf(cr) >= 0) colpisci('frase_esclusa'); });
          var id = own(idDi, nodo) ? idDi[nodo] : null;
          if (id != null) [cl, cr].forEach(function (c) {
            if (c && (testoMappa[id] || '').indexOf(c) >= 0 && (testoVista[id] || '').indexOf(c) < 0) colpisci('decisione_descrizione');
          });
          if (nodiDecisi.length && (!k || !nomiNoti.has(k) || nomiDecisi.has(k))) colpisci('decisione_descrizione');
        }
        if (row.origin === 'link' && linkDecisi.length) {
          var a = nome(row.left), b = nome(row.right);
          if (!nomiNoti.has(a) || !nomiNoti.has(b) || linkDecisi.some(function (x) { return fra(a, b, x); })) colpisci('decisione_collegamento');
        }
        testi.forEach(function (t) {
          if ((l.length >= 12 && t.indexOf(l) >= 0) || (rr.length >= 12 && t.indexOf(rr) >= 0) ||
              (t && (l + ' ' + rr).indexOf(t) >= 0)) colpisci('frase_esclusa');
        });
        linkEsclusi.forEach(function (x) {
          var a = etichette[x.source], b = etichette[x.target];
          if (a && b && ((l === a && rr === b) || (l === b && rr === a))) colpisci('collegamento_escluso');
        });
      });
    });
    if (!motivi.frase_esclusa && testi.length) {
      var tutto = normalizza(JSON.stringify(doc)).toLowerCase();
      if (testi.some(function (t) { return t && tutto.indexOf(t) >= 0; })) colpisci('frase_esclusa');
    }
    return MOTIVI_NESSI.find(function (m) { return motivi[m]; }) || '';
  }

  /* ── IL RECORD ─────────────────────────────────────────────────────────────
     Ciò che `aggiorna` (la cucitura) scrive in `review.quarantena`. Pura:
     `opts.adesso` fissa la data nei test. Un record incompleto porta il motivo
     e non consente mai. */
  function invalido(motivo, review, opts) {
    var o = opts || {};
    return { schema: SCHEMA, regole: REGOLE, baseRevision: (review && review.baseRevision) || null, firma: null,
      completo: false, motivo: String(motivo || 'sconosciuto'), etichetteSegnalate: 0, frasiFonte: 0,
      escluse: [], linkEsclusi: [], conteggi: null, svuotati: [], nonEsaminati: [], superate: [], segnalazioniSenzaEffetto: [],
      causalDocScartato: false, causalDocMotivo: null, data: o.adesso || new Date().toISOString() };
  }
  function _conteggi(c) {
    var n = { affermazioni: c.righe.length, vicine: 0, senza: 0, servizio: 0, docente: 0,
      fuori: { nonEsaminate: 0, giudice: 0, docente: 0, coesione: 0, totale: 0 },
      caratteri: { totali: 0, tenuti: 0 }, linkEsclusi: c.linkEsclusi.length, linkNonEsaminati: c.linkNonEsaminati || 0, coesione: c.coesione,
      modi: clone(c.modi), passiNonRitrovati: c.passiNonRitrovati, superate: c.superate.length,
      senzaEffetto: (c.senzaEffetto || []).length, esaminatiDaGiriPrecedenti: c.daGiriPrecedenti.length,
      perContenimento: 0, perFrammento: 0, perProblema: 0, perFinestra: 0, ritoccate: 0 };
    c.righe.forEach(function (r) {
      var len = normalizza(r.testo).length;
      n.caratteri.totali += len;
      if (FUORI.indexOf(r.corsia) >= 0) {
        n.fuori.totale++;
        // giro 5 (F1): le frasi che riprendono il passo senza esserlo parola per parola, quelle col
        // frammento citato, e le frasi del docente che escono perché lo riprendono
        if (r.via === 'contenimento') n.perContenimento++;
        if (r.via === 'frammento') n.perFrammento++;
        // giro 7: le righe di altri nodi di cui parla il problema di una 'nodo' (H5), e quelle prese
        // soltanto dentro una finestra di due o tre frasi (H1)
        if (r.via === 'problema') n.perProblema++;
        if (r.coppia) n.perFinestra++;
        if (r.ritoccata) n.ritoccate++;
        if (r.corsia === CORSIE.NON_ESAMINATA) n.fuori.nonEsaminate++;
        else if (r.corsia === CORSIE.COESIONE) n.fuori.coesione++;
        else n.fuori[r.origine === 'docente' ? 'docente' : 'giudice']++;
        return;
      }
      n.caratteri.tenuti += len;
      if (r.corsia === CORSIE.VICINA) n.vicine++;
      else if (r.corsia === CORSIE.SENZA) n.senza++;
      else if (r.corsia === CORSIE.SERVIZIO) n.servizio++;
      else if (r.corsia === CORSIE.DOCENTE) n.docente++;
    });
    return n;
  }
  var ESITI_SENZA_EFFETTO = ['superata', 'docente', 'docente-in-parte', 'vuoto'];
  /* Gate 3 del 27/09: la quarantena si può calcolare su questa revisione? ''
     se sì, altrimenti il motivo — gli stessi di `record`, nello stesso ordine.
     Sono i motivi che il giro della pipeline NON cambia (manca il rapporto del
     controllo, il controllo non ha esaminato niente, la revisione non ha
     fonti): su un progetto nato senza il controllo G1 la revisione non può
     diventare facoltativa. Le fonti qui si contano soltanto; le frasi le conta
     `record`. */
  function nonCalcolabile(review, db, sources, cop) {
    var ini = (review && review.initial) || {};
    cop = cop || copertura(review, db);
    if (!cop.rapporto) return 'rapporto_assente';
    if (ini.checkStatus === 'unavailable' || !cop.esaminati.length) return 'controllo_non_disponibile';
    if (!Array.isArray(sources) || !sources.length) return 'fonte_vuota';
    return '';
  }
  function record(review, db, opts) {
    var o = opts || {}, rc = RC();
    var no = function (m) { return invalido(m, review, o); };
    if (!review || review.schema !== rc.SCHEMA || !review.initial) return no('revisione_non_valida');
    if (review.initial.status !== 'awaiting_review') return no('revisione_non_in_attesa');
    if (!db || !Array.isArray(db.nodes)) return no('mappa_non_valida');
    var sources = own(o, 'sources') ? o.sources : review.sources;
    if (rc.revision(db, sources) !== review.baseRevision) return no('mappa_cambiata');
    var cop = copertura(review, db), manca = nonCalcolabile(review, db, sources, cop);
    if (manca) return no(manca);
    var frasi = frasiFonte(sources);
    if (!frasi.length) return no('fonte_vuota');
    var c;
    try { c = corsie({ review: review, db: db, sources: sources, frasi: frasi }); }
    catch (e) { return no('errore:' + (e && (e.code || e.message))); }
    if (c.conflitti.length) return no('conflitti');
    var escluse = c.righe.filter(function (r) { return FUORI.indexOf(r.corsia) >= 0; }).map(function (r) {
      var e = { nodeId: r.nodeId, testo: r.testo, corsia: r.corsia, origine: r.origine, issueId: r.issueId, modo: r.modo || null, via: r.via || null };
      // giro 4 (E1), giro 5 (F1): una frase che riprende il passo contestato senza esserlo parola per parola porta il passo con sé
      if (r.passi && r.passi.length) e.passi = r.passi.slice();
      if (r.ritoccata) e.ritoccata = true;
      return e;
    });
    var per = _righeNodo(c.righe), svuotati = Object.keys(per).filter(function (id) {
      return per[id].every(function (r) { return FUORI.indexOf(r.corsia) >= 0; });
    });
    /* giro 7 (H9): le segnalazioni aperte che non tolgono niente dai materiali, con il perché */
    var esiti = c.esitiSegnalazioni || {};
    var senzaEffetto = Object.keys(esiti).filter(function (id) { return ESITI_SENZA_EFFETTO.indexOf(esiti[id]) >= 0; })
      .map(function (id) { return { issueId: id, esito: esiti[id] }; });
    var rec = { schema: SCHEMA, regole: REGOLE, baseRevision: review.baseRevision, firma: firma(review, db, db.causalDoc),
      completo: true, motivo: '', etichetteSegnalate: c.etichetteSegnalate, frasiFonte: frasi.length,
      escluse: escluse, linkEsclusi: c.linkEsclusi, conteggi: _conteggi(c), svuotati: svuotati,
      nonEsaminati: c.nonEsaminati.slice(), superate: c.superate.slice(), segnalazioniSenzaEffetto: senzaEffetto,
      causalDocScartato: false, causalDocMotivo: null,
      data: o.adesso || new Date().toISOString() };
    try { vistaDb(c.db, rec); } catch (e) { return no('frase_esclusa_non_trovata'); }
    rec.causalDocMotivo = motivoDocumentoNessi(c, db) || null;
    rec.causalDocScartato = !!rec.causalDocMotivo;
    return rec;
  }
  /* Il documento dei nessi resta fuori dai materiali? Sulle corsie `c` e sulla
     mappa `db` da cui sono nate. Lo usano il record e il blocco del Banco, che
     lo dice al docente (giro 2: prima nessuna superficie lo diceva, e le sue
     modifiche in ELABORA si perdevano in silenzio). */
  /* Il motivo ('' se il documento resta): va nel record e nella ricevuta
     (`causalDocMotivo`), così chi legge i materiali sa perché la catena che
     il docente ha rivisto non c'è. */
  function motivoDocumentoNessi(c, db) {
    var doc = c && c.db && c.db.causalDoc;
    if (!doc) return '';
    var escluse = (c.righe || []).filter(function (r) { return FUORI.indexOf(r.corsia) >= 0; })
      .map(function (r) { return { nodeId: r.nodeId, testo: r.testo }; });
    var link = c.linkEsclusi || [], vista;
    try { vista = vistaDb(c.db, { escluse: escluse, linkEsclusi: link }); } catch (e) { return 'vista_non_calcolabile'; }
    return _motivoNessi(doc, escluse, link, vista, db, c.decisioniPrese);
  }
  function documentoNessiScartato(c, db) { return !!motivoDocumentoNessi(c, db); }

  /* ── IL CANCELLO ───────────────────────────────────────────────────────────
     Consente SOLO se tutto regge; altrimenti null, e vale il gate di oggi
     (fallisce chiuso). G2 passa `{items}`: niente `db.nodes`, niente quarantena. */
  function consente(review, db, sources) {
    try {
      var rc = RC();
      if (!review || review.schema !== rc.SCHEMA || !review.initial) return null;
      if (review.initial.status !== 'awaiting_review') return null;
      if (!db || !Array.isArray(db.nodes)) return null;
      var src = sources === undefined ? review.sources : sources;
      if (rc.revision(db, src) !== review.baseRevision) return null;
      if (review.initial.checkStatus === 'unavailable') return null;
      var cop = copertura(review, db);
      if (!cop.rapporto || !cop.esaminati.length) return null;
      if (!correggi(review, db, sources).ok) return null;
      var q = review.quarantena;
      if (!q || q.schema !== SCHEMA || q.regole !== REGOLE || q.baseRevision !== review.baseRevision) return null;
      if (q.completo !== true || q.etichetteSegnalate !== 0 || !(q.frasiFonte > 0)) return null;
      if (q.firma !== firma(review, db, db.causalDoc)) return null;
      return { allowed: true, reason: 'quarantine', quarantine: true };
    } catch (e) { return null; }
  }

  /* La pipeline è completa come la conterebbe oggi, ma con G1 facoltativo:
     una revisione in attesa si conta come approvata, il resto (passi, G2)
     lo decide PipelineCore.isComplete. */
  function completo(manifest) {
    var m = manifest;
    if (m && m.review && m.review.initial && m.review.initial.status === 'awaiting_review') {
      m = Object.assign({}, m, { review: Object.assign({}, m.review, {
        initial: Object.assign({}, m.review.initial, { status: 'approved' }) }) });
    }
    return PC().isComplete(m);
  }

  /* La ricevuta che le bozze e i materiali si portano dietro: che cosa è
     passato e perché. Null senza un record completo: allora non si scrive.
     Giro 7 (H8, H9): con la versione delle regole; per ogni frase esclusa
     anche la segnalazione, il modo, la via e se era testo del docente; e le
     segnalazioni aperte che non tolgono niente, con l'esito. */
  function ricevuta(rec) {
    if (!rec || rec.schema !== SCHEMA || rec.completo !== true) return null;
    return { schema: SCHEMA, regole: rec.regole || null, revision: rec.baseRevision, firma: rec.firma, conteggi: clone(rec.conteggi),
      escluse: (rec.escluse || []).map(function (e) {
        return { nodeId: e.nodeId, testo: e.testo, corsia: e.corsia, origine: e.origine, issueId: e.issueId == null ? null : e.issueId,
          modo: e.modo || null, via: e.via || null, ritoccata: !!e.ritoccata };
      }),
      segnalazioniSenzaEffetto: (rec.segnalazioniSenzaEffetto || []).map(function (x) { return { issueId: x.issueId, esito: x.esito }; }),
      linkEsclusi: clone(rec.linkEsclusi || []), svuotati: (rec.svuotati || []).slice(),
      nonEsaminati: (rec.nonEsaminati || []).slice(), causalDocScartato: !!rec.causalDocScartato,
      causalDocMotivo: rec.causalDocMotivo || null, data: rec.data || null };
  }

  /* LA RICEVUTA BREVE (27/09): quella che viaggia coi SET PUBBLICATI. I set (set-*.json in «Materiale Studio»)
     arrivano interi sull'iPad dell'allievo: non devono portare i testi delle frasi escluse, cioè proprio le
     affermazioni contestate. Solo firma, regole, conteggi e data; il dettaglio resta in pipeline.json
     (review.quarantena e le bozze), che all'allievo non arriva. */
  function ricevutaBreve(r) {
    if (!r || r.schema !== SCHEMA) return null;
    return { schema: SCHEMA, regole: r.regole || null, revision: r.revision == null ? null : r.revision, firma: r.firma,
      conteggi: clone(r.conteggi || {}), data: r.data || null, dettaglio: 'pipeline.json' };
  }

  return {
    SCHEMA: SCHEMA, REGOLE: REGOLE, CORSIE: CORSIE, FUORI: FUORI.slice(), ricevutaBreve: ricevutaBreve,
    normalizza: normalizza, impronta: impronta, impronte: impronte,
    affermazioni: affermazioni, affermazioniDb: affermazioniDb,
    idFrase: idFrase, frasiFonte: frasiFonte,
    elementiChiave: elementiChiave, organizzativa: organizzativa, anafora: anafora,
    vicina: vicina, frasiOrfane: frasiOrfane, MAX_ORFANE: MAX_ORFANE, SOGLIA_ORFANE: SOGLIA_ORFANE, VICINE_ORFANE: VICINE_ORFANE,
    MIN_PAROLE_ORFANE: MIN_PAROLE_ORFANE, CORTA_ORFANE: CORTA_ORFANE, COMUNI_NODO: COMUNI_NODO,
    passoContestato: passoContestato, troncato: troncato, confermata: confermata,
    CONTENIMENTO: CONTENIMENTO, contenimento: contenimento,
    reviewDecise: reviewDecise, correggi: correggi, copertura: copertura,
    corsie: corsie, coesione: coesione, firma: firma, altroveNelProblema: altroveNelProblema,
    vistaDb: vistaDb, rettifiche: rettifiche, documentoNessiScartato: documentoNessiScartato,
    motivoDocumentoNessi: motivoDocumentoNessi,
    record: record, invalido: invalido, nonCalcolabile: nonCalcolabile,
    consente: consente, completo: completo, ricevuta: ricevuta
  };
}));
