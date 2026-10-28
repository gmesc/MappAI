/* ═══════════════════════════════════════════════════════════════════════════
   LA VESTE DI G2 — il Banco dei materiali per materiale (packet 0073)

   PERCHÉ. Nel Banco dei materiali il docente scorreva segnalazioni, non
   materiali: per correggere una scelta multipla aveva davanti quattro
   «Modifica originale · campo», poi «Approva invariato», e dopo un salvataggio
   doveva ricliccare e riapprovare (Giacomo, 02/10: «troppi bottoni, e troppi
   passaggi»). La revisione 3 dell'ADR 0012 rovescia la vista: nella barra i
   MATERIALI divisi per tipo, al centro UNA scheda coi campi scrivibili sul
   posto, la nota del controllo sopra il campo che riguarda, un bottone solo.
   La revisione 4 dice come si leggono «Prima / Proposta»; la revisione 5 i tre
   stati (da rivedere · rivisto · approvato), il salvataggio automatico e ⌘Z.

   CHE COSA FA. Prende in mano barra, scheda e piede quando `R.open` glielo
   chiede (interruttore `mappai_banco_veste` = '1', solo nel Banco e solo in
   G2). Non scrive niente su disco da sé: legge e cambia la revisione con le
   funzioni che `R.open` le passa (`getReview`, `setReview`, `save`, …) e coi
   core che già esistono — `mappai-review-core.js` per le decisioni (si usa,
   non si modifica: ADR 0010), `mappai-banco-core.js` per gli elenchi, il testo
   «adesso», dalla scheda alle decisioni e i segni delle differenze.

   LE REGOLE DEI GESTI (decisioni di Giacomo del 04/10, R1-R4):
   · R1 — si salva all'uscita dal campo, al cambio di materiale (riga,
     «successivo»), al clic su un bottone e alla chiusura; mai a battuta né con
     un timer. Un campo non cambiato non scrive niente.
   · R2 — ⌘Z / Ctrl+Z toglie l'ultima scrittura registrata (un campo salvato,
     un gesto su una nota, il clic su «Rivisto»/«Approvato», un'esclusione o un
     ripristino); dentro un campo con battitura non salvata resta quello nativo.
     La pila vive nella seduta e si azzera a «Riprova il controllo». Gate 3
     (G6): ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y rifà l'ultima azione annullata, e ⌘Z
     porta sul materiale e dice che cosa ha annullato. Cmd/Ctrl+Invio e
     Alt+↑/↓ non ci sono più (G7, G8).
   · R3 — il nome del bottone è `esitoBottone(generato, testo a schermo)`, e la
     veste passa a `righeMateriali` l'insieme dei «rivisti».
   · R4 — niente spunta «Scelgo di completare io il controllo»: G2 si chiude
     quando ogni riga è fatta.

   COSTO (§4.3 del packet). Le anteprime (`previewItem`, ~10 ms l'una) si
   calcolano una volta e si tengono per materiale: un gesto su un materiale
   ricalcola solo quello, più il `preview` globale per la chiusura.

   G1, LA REVISIONE DELLA MAPPA (packet 0075; ADR 0012 rev. 3 p. 5-6, rev. 4
   A e B, rev. 5 B e C, rev. 6 A, B e D; ADR 0010 rev. 1). Con `E.regime` =
   'g1' la stessa veste rivede la mappa: la barra per nodo (`righeMappa`: nodi
   segnalati, collegamenti segnalati, non letti dal controllo), una scheda per
   nodo (titolo e descrizione) o per collegamento (le parole, coi suggerimenti
   della famiglia), le note sopra il campo, il salvataggio all'uscita, ⌘Z del
   Banco, la chiusura nel piede con la casella e «Riprova il controllo
   automatico», la sezione «Il controllo» in fondo alla barra. Le scritture
   vanno a `decisioniDaCampo` col regime 'g1' (la regola prudente per passo,
   Q6) sui bersagli della mappa, mai sui materiali. Non c'è il bottone del
   materiale: la nota decide, e quando il nodo non ha più note aperte si passa
   al successivo (rev. 3, p. 6). I non letti si correggono e basta; un nodo
   senza riga si apre da «Correggi il nodo vicino» dello strato (Q1).

   0086, giro 3b (ADR 0012 rev. 12, ADR 0010 rev. 4; D36–D40): sulle schede dei
   NODI con note del controllo la regola unica delle spunte — una spunta per
   nota al posto dei bottoni, il campo che parte dall'«Originale» e l'area
   «Proposta» che lo riempie con un clic, il salvataggio del campo che non
   decide le note (`correzioneDelCampo`), il bottone in fondo che registra
   campo e spunte in una scrittura (`chiamateBottone`) e passa alla riga dopo.
   Giro 3c: la stessa regola sulle righe dei collegamenti («Tieni il
   collegamento»), sui materiali di G2 («Tieni il materiale»; il bottone del
   materiale registra campi, spunte e approvazione) e sulle righe con scelte
   salvate prima in conflitto (D37.7: il campo riparte dalle scelte senza
   conflitto, il bottone le sostituisce); la richiesta del docente su una
   scheda con le spunte non ha bottoni e la chiude il bottone in fondo (L6).
   Restano coi bottoni della nota solo le righe con le sole richieste del
   docente (Q20, come prima); «Togli questa scelta» e i rami del conflitto
   (D30–D35) non ci sono più. Vedi «LA REGOLA UNICA DELLE SPUNTE» più sotto.
   Giro 3d (D41–D43, dopo la verifica unica del giro 3): su quelle schede R1 non
   vale più — il campo è una bozza fino al bottone in fondo, che la registra con
   le spunte in una scrittura sola; il bottone prova prima l'effetto sui
   materiali e, se un nodo ne uscirebbe vuoto o con frasi in meno, resta spento e
   lo dice; con una spunta tolta dice «Tieni la tua versione» e accanto che cosa
   esce, e da quali nodi.

   Il DOM arriva da chi chiama (`document`): in Node i test montano la veste
   sul DOM finto del controller (tests/banco-veste.test.js).
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mappai-banco-core.js'));
  else root.MappAIBancoVeste = factory(root.MappAIBancoCore);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (BancoCore) {
  'use strict';

  const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
  const esc = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
  const uguali = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  const testo = v => String(v == null ? '' : v);
  // Oltre questa misura un testo è «lungo» (rev. 4, A.6): in «Differenze» solo le frasi cambiate, in «Testi» «Prima» chiusa.
  const LUNGO = 600;
  // 0075 (G1): i campi della scheda della mappa — titolo e descrizione del nodo, parole del collegamento
  const NOMI_G1 = { label: ['rv_label', 'Titolo'], desc: ['rv_veste_descrizione', 'Descrizione'], rel: ['le_words', 'Parole del collegamento'] };
  // Le scritture che ⌘Z può togliere. Ogni voce tiene solo note, decisioni e approvazioni (pochi KB), non la revisione intera.
  const PILA_MAX = 500;
  /* Icone in linea: la barra si ridisegna a ogni gesto (invariante 15). La spunta è quella dello 0053;
     l'escluso è «ban» di Lucide, «togli» è «x» di Lucide. */
  const SVG_SPUNTA = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m5 12 4 4L19 6"/></svg>';
  const SVG_ESCLUSO = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/></svg>';
  const SVG_TOGLI = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

  // ── parte pura ─────────────────────────────────────────────────────────────
  // Le prove di una segnalazione o di un materiale, nella stessa forma di `evidenceRows` (mappai-review.js).
  function righeProva(v) {
    if (typeof v === 'string') return v ? [{ text: v }] : [];
    if (Array.isArray(v)) return v.flatMap(righeProva);
    if (!v || typeof v !== 'object') return [];
    if (typeof v.text === 'string') return [v];
    return Object.values(v).filter(x => x && typeof x === 'object').flatMap(righeProva);
  }
  // I pezzi di `segni` o di `confronta` in HTML: il pezzo segnato nel suo tag, il resto tale e quale.
  function pezziHtml(pezzi, segno, tag) {
    return (pezzi || []).map(p => p.tipo === segno ? '<' + tag + '>' + esc(p.t) + '</' + tag + '>' : esc(p.t)).join('');
  }
  // L'etichetta del bottone «annulla» (rev. 5, C): «⌘+Z» su macOS, «CTRL+Z» altrove.
  function etichettaAnnulla(mac) { return mac ? '⌘+Z' : 'CTRL+Z'; }

  // ── la veste ───────────────────────────────────────────────────────────────
  function monta(E) {
    const doc = E.document, t = E.t, core = E.core, BC = E.bancoCore || BancoCore, modal = E.modal;
    const content = modal.querySelector('#mrv-content');
    // 0075: G1 (la mappa, `E.db`) o G2 (i materiali, `E.items`); G2 di predefinito, come prima dello 0075
    const G1 = E.regime === 'g1', regime = G1 ? 'g1' : 'g2';
    const st = {
      montata: false, attiva: null, filtro: 'da-rivedere', cerca: '', area: '',
      pila: [], rifare: [], cache: new Map(), prev: new Map(), globale: null, ultimaReview: null, out: null,
      campi: [], noteEl: new Map(), info: null, itemAdesso: null, forma: '',
      viste: new Map(), primaAperta: new Set(), bar: null, riepilogo: null, visti: null, barra: null,
      entrate: new Set(), fuocoInArrivo: null, inCorso: null,
      // quarto giro: l'ultima battitura salvata (punto 2), le note da cui ripetere un gesto respinto (punto 4)
      ultimaBattitura: null, daRipetere: new Set(), schedaDi: null,
      // tredicesimo giro, Q20: la nota i cui bottoni stanno nella barra in fondo, con la loro scatola (`piazzaRisposta`)
      inFondo: null,
      // 0075 (G1): i nodi aperti fuori elenco (Q1), che cosa ha chiuso l'ultima correzione, la famiglia dei suggerimenti
      fuori: new Set(), chiuseOra: null, famiglia: new Map(),
      /* settimo giro (D-a): i collegamenti rimasti senza riga dopo che la cura ha tolto la loro unica nota (id della riga →
         estremi, parole e titolo, per riaprirli fuori elenco). Le richieste di «Aggiungi alla revisione» non stanno più
         qui: dall'ottavo giro si riconoscono dai dati (`richiesta`), non dall'averle viste aperte in questa seduta. */
      fuoriLink: new Map(),
      // decimo giro, Q16: i campi il cui testo un salvataggio ha cambiato (riga + campo → il testo salvato), per «Testo salvato»
      salvati: new Map(),
      /* 0086, giro 3b (§4.2-§4.4): la scheda di un nodo con la regola unica delle spunte (`modo` 'spunte'), le spunte della
         riga come le dà il core (`sp`), lo stato a schermo di ogni spunta per la seduta del Banco (`spunte`, id della nota →
         piena; D38.2: non si salva, alla riapertura riparte dal core), il bottone in fondo calcolato (`fondo`: spento, la
         riga, l'avviso) e il suo ricalcolo in attesa (`timerFondo`, D23), la descrizione di ogni nodo all'apertura (D40) */
      modo: '', sp: null, spunte: new Map(), fondo: null, timerFondo: null, apertura: null,
      /* 0086, giro 3d (D41): le bozze dei campi delle schede con note del controllo, per la seduta del Banco (id della riga →
         campo → bozza): l'uscita dal campo non scrive, la bozza resta cambiando riga e tornando, la registra il bottone in
         fondo; alla chiusura del Banco si perde (dichiarato da Giacomo) */
      bozze: new Map()
    };
    const ANNULLA = etichettaAnnulla(!!E.mac);
    // terzo giro (07/10): il nome del bottone che chiude il Banco tenendo le decisioni (R.open, #mrv-later), fra caporali,
    // per le frasi che lo indicano come via d'uscita
    const PIU_TARDI = () => '«' + t('rv_later', 'Salva e continua più tardi') + '»';
    /* Sesto giro, Q10: il bottone dei non letti in G1. Settimo giro, Q13 (Giacomo al gate 3, 07/10: «Va bene così»): è anche
       il nome del bottone della nota che la chiude senza cambiare il testo, in G1 e in G2 — stesse parole e stesso senso
       («il testo com'è adesso è giusto»), quindi la stessa chiave: una sola, qui. Prima era «Tieni Prima», che dopo un
       ritocco diceva il contrario di quello che fa (tiene il testo com'è ADESSO nel campo, non quello di «Prima»).
       0086 (D25): dalla regola unica dei nomi «Va bene così» resta SOLO sul bottone dei non letti, dove non c'è un testo da
       scegliere; i bottoni delle note dicono l'area che tengono (`scelteNota`). */
    const VA_BENE = () => t('rv_veste_g1_va_bene', 'Va bene così');
    /* Sesto giro, Q12: i gesti della nota e le due aree accanto al campo. Undicesimo giro, Q18 (rev. 9 dell'ADR 0012, B):
       le aree si chiamano «Originale» e «Proposta» (erano «Prima» e «Dopo»), senza qualificatori («· scelta tua»,
       «· testo tuo» tolti: Giacomo, «No, toglierli»). Il nome di ogni area è UNA chiave, qui sola: la proposta letta nella
       nota e le frasi che nominano un'area («Mostra / Nascondi», «Tenuto») lo compongono, così passare a un altro nome è il
       cambio di quella chiave. «Usa Proposta» ha la sua chiave; il primo bottone è «Va bene così» (Q13) o «Tieni
       Originale» (Q15). */
    const ORIGINALE = () => t('rv_veste_originale', 'Originale');
    const PROPOSTA = () => t('rv_veste_proposta', 'Proposta');
    const USA = () => t('rv_veste_usa_proposta', 'Usa Proposta');
    /* Ottavo giro, Q15 (Giacomo, dalla verifica del giro 7: «Sì, nome che cambia»): il bottone che chiude la nota senza
       cambiare il testo registra sempre la stessa scelta (reject: la nota non cambia niente). Che cosa resta dipende da che
       cosa mostra la scheda: con la proposta di QUELLA nota scritta in «Dopo» (A.5: il campo al testo di partenza, «Prima»
       sopra) resta «Prima», e il bottone si chiama «Tieni Prima»; in ogni altro caso (un testo solo a schermo: un ritocco,
       una proposta già scelta, nessuna proposta) resta il testo com'è, e il bottone è «Va bene così». Il nome lo mette
       `aggiornaNote`, dopo ogni `carica` (ritocco salvato, ⌘Z, scheda ricostruita); una battitura non salvata non cambia lo
       stato del campo, quindi il nome resta quello letto dal docente. Nono giro (D1 e D2): il clic con una battitura in
       sospeso fa quello che il nome dice — «Tieni Prima» tiene Prima (il gesto parte da prima della battitura, che resta
       nella pila di ⌘Z); «Va bene così» tiene il testo del campo (se la battitura salvata ha chiuso la nota, non scrive
       altro). Vedi `decidiUnaVolta`. Una chiave sua, qui sola. Undicesimo giro, Q18: «Tieni Prima» diventa «Tieni
       Originale», «Prima» e «Dopo» diventano «Originale» e «Proposta»; la regola non cambia. 0086: la regola dei nomi è
       quella unica qui sotto (D25), e il nome cambia mentre si scrive. */
    const TIENI_ORIGINALE = () => t('rv_veste_tieni_originale', 'Tieni Originale');
    /* 0086 — UNA REGOLA SOLA PER I NOMI (D25, Giacomo: «accetto questa soluzione»; D26-D29; ADR 0012 rev. 11). «Il bottone
       dice sempre il nome dell'area che tieni, e le aree hanno tre nomi fissi che non cambiano mai significato.
       «Originale»: il testo generato. «Proposta»: solo la proposta del controllo. «Tua versione»: il testo che hai scritto
       tu.» In G1 e in G2 (D26), in fondo e nelle note gialle. Le aree le nomina `widgetTesto` (`c.aree`), i bottoni
       `scelteNota`; «Tieni le parole» sta sulle note delle parole di un collegamento, che non hanno aree (D29); «Tenuta la
       tua versione» è l'esito di una nota tenuta col testo diverso dall'«Originale» (D28). Una chiave ciascuna, qui sola. */
    const TUA_VERSIONE = () => t('rv_veste_tua_versione', 'Tua versione');
    const TIENI_TUA = () => t('rv_veste_tieni_tua', 'Tieni la tua versione');
    const TENUTA_TUA = () => t('rv_veste_tenuta_tua', 'Tenuta la tua versione');
    /* 0086, giro 3c: i nomi della spunta sulle note del collegamento e dei materiali (ADR 0012 rev. 12, punto 2), fuori dalla
       regola dei nomi delle aree. Erano i bottoni della nota (D34), che non ci sono più. Una chiave ciascuno, qui sola. */
    const TIENI_COLLEGAMENTO = () => t('rv_veste_g1_tieni_collegamento', 'Tieni il collegamento');
    const TIENI_MATERIALE = () => t('rv_veste_tieni_materiale', 'Tieni il materiale');
    /* 0086, giro 3b — i nomi della spunta (B1, D12; ADR 0012 rev. 12, punto 2), fuori dalla regola dei nomi delle aree: dicono
       che cosa resta. Sulla descrizione col passo localizzato «Tieni la frase» / «Tieni le {n} frasi» (le frasi distinte del
       passo, come le conta la quarantena), sulla descrizione intera «Tieni tutto il testo». Una chiave ciascuno, qui sola. */
    const TIENI_FRASE = () => t('rv_veste_tieni_frase', 'Tieni la frase');
    const TIENI_FRASI = n => t('rv_veste_tieni_frasi', 'Tieni le {n} frasi').replace('{n}', n);
    const TIENI_TUTTO = () => t('rv_veste_tieni_tutto', 'Tieni tutto il testo');
    // D23: il bottone in fondo e l'avviso si ricalcolano sul testo in sospeso dopo questa pausa (ms) dall'ultimo tasto
    const PAUSA_FONDO = 300;
    /* 0086, giro 3c — D37.7 (L3): una scheda con scelte salvate prima che si contraddicono (veste spenta, sedute di prima)
       prende le spunte; il campo riparte dal testo delle scelte senza conflitto e il bottone in fondo le sostituisce. La
       riga lo dice; i rami e le frasi del conflitto dei giri 2 bis e 2 ter (D30–D35: «Niente «Tieni» in conflitto»,
       «Togli questa scelta», «come sciogliere») non ci sono più: la veste non crea conflitti, e quelli di prima li sostituisce
       il bottone. Una chiave sola, qui. */
    const CONFLITTO_PRIMA = () => t('rv_veste_conflitto_prima', 'Le scelte salvate prima su questa scheda si contraddicono: il campo riparte dal testo delle scelte che non si contraddicono, e il bottone in fondo le sostituisce con il testo che lasci nel campo e con le spunte.');

    /* ── i dati ────────────────────────────────────────────────────────────── */
    const review = () => E.getReview();
    const dbItems = () => ({ items: E.items() });
    // 0075 (G1): la mappa viva, la stessa che R.open passa a `preview`
    const dbMappa = () => (E.db && E.db()) || { nodes: [], links: [] };
    const fonti = () => review().sources;
    const editabile = () => review().initial.status === 'awaiting_review';
    const occupato = () => { const s = E.stato(); return !!(s.busy || s.committing || s.closed); };
    const nodoBase = id => (review().baseSnapshot.nodes || []).find(n => n && String(n.id) === String(id)) || null;
    const base = id => G1 ? nodoBase(id) : (review().baseSnapshot.items || []).find(i => i && String(i.id) === String(id)) || null;
    const decisioneDi = i => { const d = review().initial.decisions || {}; return own(d, i.id) ? d[i.id] : undefined; };
    const esito = i => core.decisionOutcome(i, decisioneDi(i));
    const noteDi = id => G1 ? noteDellaRiga(id) : (review().initial.issues || []).filter(i => i && i.target && i.target.kind === 'item' && String(i.target.id) === String(id));
    /* G1: le note di una riga sono quelle che `righeMappa` le dà (`issueIds`), del controllo e del docente; un nodo aperto
       fuori elenco (Q1) ha le note del suo nodo, cioè nessuna finché non si salva una correzione. */
    function noteDellaRiga(id) {
      const x = rigaDi(id), tutte = review().initial.issues || [];
      if (!x) return [];
      if (x.issueIds && x.issueIds.length) { const ids = new Set(x.issueIds.map(String)); return tutte.filter(i => i && ids.has(String(i.id))); }
      if (x.source != null) return [];
      return tutte.filter(i => i && i.target && i.target.kind === 'node' && String(i.target.id) === String(x.id));
    }
    // G1: i nomi dei campi della scheda per nodo e per collegamento; G2: quelli di R.open
    const nomeCampo = (f, it) => G1 && own(NOMI_G1, f) ? t(NOMI_G1[f][0], NOMI_G1[f][1]) : E.fieldName(f, it);
    // G1: i nodi non hanno richiami ai materiali, quindi la vista dei richiami si chiede senza materiale
    const vista = (v, it) => E.referenceView(testo(v), G1 ? null : it);
    /* Le note che la scheda mostra: tutte quelle del controllo; del docente solo le aperte (le sue correzioni non sono
       note) e quelle in conflitto, perché il conflitto si scioglie con un gesto sulla nota (giro 2, difetto 5). */
    const mostrabili = (id, info) => { const fra = conflittiDi(info); return noteDi(id).filter(i => i.origin !== 'teacher' || esito(i) === 'pending' || fra.has(i.id)); };
    const mostra = (v, item) => vista(v, item).text;

    // `previewItem` di un materiale (le sue sole decisioni), senza il controllo strutturale: lo usano `anteprima` e le
    // sezioni delle sintesi (sesto giro, punto 5)
    function previewDi(id) {
      id = String(id);
      if (!st.prev.has(id)) {
        let p;
        try { p = core.previewItem(review(), dbItems(), id, { sources: fonti() }); }
        catch (e) { p = { ok: false, db: { items: [] }, conflicts: [{ issueId: null, code: (e && e.code) || 'missing_item' }], unresolved: [] }; }
        const item = p.ok ? (p.db.items || []).find(x => String(x.id) === id) || null : null;
        st.prev.set(id, { p, item, escluso: !!(p.ok && !item) });
      }
      return st.prev.get(id);
    }
    function anteprima(id) {
      id = String(id);
      if (!st.cache.has(id)) {
        const { p, item, escluso } = previewDi(id);
        const voce = { ok: !!p.ok, escluso, item, impronta: item ? E.improntaTesto(JSON.stringify(item)) : '',
          conflitti: p.conflicts || [], aperte: p.unresolved || [] };
        voce.rivisto = !!item && BC.esitoBottone(base(id), item) === 'rivisto';
        // giro 2, difetto 3: il controllo strutturale sull'anteprima, come `decisionState` del modale di prima
        voce.invalido = item ? strutturali([item], id) : [];
        st.cache.set(id, voce);
      }
      return st.cache.get(id);
    }
    /* Le sezioni come arriveranno all'allievo, per i richiami di una sintesi (sesto giro, punto 5): ogni sintesi della
       bozza con le sue decisioni, senza quelle escluse; `item` prende il posto del materiale `id`. Le altre schede
       restano come nella bozza: i registri dei richiami stanno solo nelle sintesi. */
    function sezioniInAnteprima(id, item) {
      return (E.items() || []).map(x => {
        if (!x) return null;
        if (id != null && String(x.id) === id) return item;
        if (x.kind !== 'synthesis') return x;
        const a = previewDi(x.id);
        return a.escluso ? null : (a.item || x);
      }).filter(Boolean);
    }
    /* I problemi strutturali di un materiale (MappAIMaterialReview.validate): alternative mancanti o uguali,
       corretta che non indica un'alternativa, righe fuori da 3–12, campi vuoti. Una sintesi si controlla insieme
       alle altre, perché i richiami possono stare nel registro di un'altra sezione: insieme alle sezioni
       dell'ANTEPRIMA, non della bozza (la regola del difetto 3, come `decisionState`), cioè senza le sezioni escluse.
       Con `id` nullo si valida la lista com'è (l'anteprima intera, in `bloccati`). */
    function strutturali(lista, id) {
      const V = E.validatore;
      if (!V || typeof V.validate !== 'function') return [];
      const tutti = id != null && lista.length === 1 && lista[0].kind === 'synthesis' ? sezioniInAnteprima(String(id), lista[0]) : lista;
      let esito;
      try { esito = V.validate(tutti); } catch (e) { return []; }
      return (esito && Array.isArray(esito.issues) ? esito.issues : [])
        .filter(i => i && (id == null || (i.target && String(i.target.id) === String(id))))
        .map(i => id == null ? String(i.target && i.target.id) : String(i.problem || '')).filter(Boolean);
    }
    function globale() {
      if (!st.globale) {
        try { st.globale = core.preview(review(), G1 ? dbMappa() : dbItems(), { sources: fonti() }); }
        catch (e) { st.globale = { ok: false, conflicts: [{ issueId: null, code: (e && e.code) || 'invalid_review' }], unresolved: [] }; }
        st.bloccati = null;
      }
      return st.globale;
    }
    /* I materiali che tengono ferma la chiusura senza una segnalazione: una struttura non valida (sull'anteprima intera
       se riesce, altrimenti sulla bozza con le sezioni dell'anteprima). Ricevono una riga (difetto 3 del giro 2):
       niente vicoli ciechi. Un conflitto fra scelte salvate non passa più di qui (quinto giro): nasce da segnalazioni
       decise sul materiale, e con R7/R9 ogni segnalazione, aperta o decisa, dà già la sua riga. */
    function bloccati() {
      const g = globale();
      if (!st.bloccati) st.bloccati = new Set(strutturali(g.ok ? (g.db.items || []) : sezioniInAnteprima(null, null), null));
      return st.bloccati;
    }
    const stantia = () => (globale().conflicts || []).some(c => c && c.code === 'stale_revision');
    /* Una scrittura della veste: la revisione nuova, e le anteprime dei soli materiali toccati. Una sezione toccata
       cambia i registri delle altre: si rivalidano tutte le sintesi (sesto giro, punto 5). */
    function imposta(r, ids) {
      E.setReview(r); st.ultimaReview = r;
      // G1: niente anteprime per riga da tenere; l'elenco e la chiusura si rileggono dalla revisione nuova
      if (G1) { st.globale = null; st.out = null; return; }
      if (ids && ids.length) {
        const sezione = ids.some(id => (base(id) || {}).kind === 'synthesis');
        ids.forEach(id => { st.cache.delete(String(id)); st.prev.delete(String(id)); });
        if (sezione) Array.from(st.cache.keys()).forEach(k => { if ((base(k) || {}).kind === 'synthesis') st.cache.delete(k); });
        st.globale = null;
      }
    }

    /* L'elenco della barra: `righeMateriali` del core con gli insiemi che la veste calcola sulle anteprime
       (rev. 5, D: il clic è un dato per OGNI riga, anche segnalata e con il controllo completo). */
    function elenco() {
      if (G1) return elencoG1();
      /* R7 (Giacomo, 05/10: «restano fino al clic»): una riga entrata in elenco in questa seduta resta, «da rivedere»
         finché non si preme il suo bottone. Le righe che i dati tengono (segnalazioni aperte o decise, residui, R9) le
         dà il core da sé, anche riaprendo; `st.entrate` serve solo a ciò che i dati non dicono più — una correzione o
         un'esclusione del docente tolte con ⌘Z, una struttura non valida sciolta — e si passa al core insieme ai
         `bloccati`. Riaprendo il Banco, o con un nuovo controllo (la revisione cambia da fuori), l'insieme riparte
         vuoto: si riparte dalle righe che i dati tengono. */
      const r = review(), fatte = r.initial.manualChecks || {}, fermi = new Set(Array.from(bloccati()).concat(Array.from(st.entrate)));
      const approvati = new Set(), esclusi = new Set(), rivisti = new Set();
      BC.righeMateriali(r, { bloccati: fermi }).righe.forEach(x => {
        const a = anteprima(x.id);
        if (a.escluso) { esclusi.add(x.id); return; }
        if (a.rivisto) rivisti.add(x.id);
        // un materiale non valido non è approvato, anche se un'impronta vecchia combacia
        if (a.impronta && !a.invalido.length && own(fatte, x.id) && fatte[x.id] && fatte[x.id].impronta === a.impronta) approvati.add(x.id);
      });
      const out = BC.righeMateriali(r, { approvati, esclusi, rivisti, bloccati: fermi });
      out.righe.forEach(x => st.entrate.add(x.id));
      /* Un materiale che il rapporto nomina e che la bozza non ha: la riga con la frase di oggi, nessun
         bottone. Non c'è niente da consegnare, quindi resta fuori dal da fare (non blocca la chiusura). */
      out.assenti = [];
      residui().righe.filter(x => !x.item).forEach(x => {
        out.assenti.push({ id: String(x.id), n: null, tipo: '', titolo: String(x.id), note: 0, noteAperte: 0, stato: 'assente', fatto: false, daFare: false, assente: true });
      });
      out.tutte = out.righe.concat(out.assenti);
      st.out = out;
      return out;
    }
    const righe = () => st.out || elenco();
    /* G1 (0075, rev. 3 p. 6 e rev. 4 B.2): l'elenco per nodo di `righeMappa`, nella forma che la barra già legge — tre
       gruppi coi conteggi, i non letti in fondo e fuori dal da fare. Lo stato di una riga: 'da-rivedere' (note aperte),
       'fatto' (note decise; un non letto corretto dal docente), 'non-letto'. «Decisi» conta i nodi e i collegamenti
       segnalati senza più note aperte. */
    function elencoG1() {
      const m = BC.righeMappa(review(), dbMappa());
      /* D2 (giro del 07/10): una riga con una nota fra i conflitti dell'anteprima della mappa (le parole riscritte e poi
         «Togli il collegamento», che il core non compone) è da rivedere anche con le note tutte decise, e lo dice: senza,
         prendeva la spunta, usciva da «Da rivedere» e la chiusura restava ferma senza una riga che dicesse perché. */
      const inConflitto = new Set();
      (globale().conflicts || []).forEach(c => {
        if (c && c.issueId != null) inConflitto.add(String(c.issueId));
        if (c && c.otherIssueId != null) inConflitto.add(String(c.otherIssueId));
      });
      const conflitto = x => (x.issueIds || []).some(i => inConflitto.has(String(i)));
      /* Terzo giro (07/10, punto 4): le note che tengono ferma la chiusura (`unresolved` dell'anteprima: aperte e bloccanti)
         valgono come i conflitti. Una segnalazione del docente rimasta aperta su un non letto (nata da «Aggiungi alla
         revisione» del Banco di prima) lasciava la riga col cerchio vuoto e fuori dal da fare: «Da rivedere 0», niente
         casella, bottone nascosto — un vicolo cieco. Ora quella riga è da rivedere (il pallino e «1 nota»). Per i nodi e i
         collegamenti segnalati non cambia niente: una nota aperta li tiene già da rivedere. */
      const ferme = new Set((globale().unresolved || []).map(String));   // (non `sospese`, che qui fuori è la battitura)
      const sospesa = x => (x.issueIds || []).some(i => ferme.has(String(i)));
      const stato = x => x.conflitto || x.sospesa ? 'da-rivedere' : x.tipo === 'non-letto' ? (x.fatto ? 'fatto' : 'non-letto') : x.daFare ? 'da-rivedere' : 'fatto';
      /* Sesto giro, Q10 (gate 3 di Giacomo, 07/10: «Bottone «Va bene così»»): un non letto segnato «Va bene così» è fatto, con
         la spunta, senza nessuna segnalazione. La spunta sta in `manualChecks` (`chiaveVaBene`) con l'impronta del testo
         mostrato: se il testo cambia per un'altra strada non combacia più e non conta, come le approvazioni per materiale
         di G2. `righeMappa` non la legge (il core non cambia): la legge qui la veste. Una correzione del docente decide già
         (`corretto`), una nota aperta o in conflitto chiede il suo gesto: lì la spunta non si guarda. */
      const fatte = review().initial.manualChecks || {};
      const vaBene = x => {
        if (x.tipo !== 'non-letto' || x.fatto || x.conflitto || x.sospesa) return false;
        const k = chiaveVaBene(x), s = own(fatte, k) ? fatte[k] : null;
        return !!(s && s.impronta) && s.impronta === improntaVaBene(x);
      };
      const vesti = lista => lista.map(x => {
        const y = Object.assign({}, x, conflitto(x) ? { conflitto: true, daFare: true, fatto: false } : {},
          sospesa(x) ? { sospesa: true, daFare: true, fatto: false } : {});
        if (vaBene(y)) { y.bene = true; y.fatto = true; }
        y.stato = stato(y);
        return y;
      });
      const nodi = vesti(m.nodi), collegamenti = vesti(m.collegamenti), nonLetti = vesti(m.nonLetti);
      const daFare = l => l.filter(x => x.daFare).length;
      const di = (nome, l) => nome + ' · ' + daFare(l) + ' ' + t('rv_veste_di', 'di') + ' ' + l.length;
      /* Sesto giro, Q11 (gate 3 di Giacomo, 07/10: «Due gruppi separati»): i non letti in due gruppi, nodi e collegamenti,
         ciascuno col suo conteggio; un gruppo vuoto non si mostra. L'ordine delle righe è quello di `righeMappa` (prima i
         nodi, poi i collegamenti), quindi numeri e conti di Q8 (la somma dei due) non cambiano. */
      const nonLettiNodi = nonLetti.filter(x => x.oggetto !== 'collegamento'), nonLettiCollegamenti = nonLetti.filter(x => x.oggetto === 'collegamento');
      const gruppi = [
        nodi.length ? { tipo: 'nodi', testo: di(t('rv_veste_g1_gruppo_nodi', 'Nodi segnalati'), nodi), righe: nodi } : null,
        collegamenti.length ? { tipo: 'collegamenti', testo: di(t('rv_veste_g1_gruppo_collegamenti', 'Collegamenti segnalati'), collegamenti), righe: collegamenti } : null,
        nonLettiNodi.length ? { tipo: 'non-letti-nodi', testo: t('rv_veste_g1_gruppo_nodi_non_letti', 'Nodi non letti dal controllo') + ' · ' + nonLettiNodi.length, righe: nonLettiNodi } : null,
        nonLettiCollegamenti.length ? { tipo: 'non-letti-collegamenti', testo: t('rv_veste_g1_gruppo_collegamenti_non_letti', 'Collegamenti non letti dal controllo') + ' · ' + nonLettiCollegamenti.length, righe: nonLettiCollegamenti } : null
      ].filter(Boolean);
      const tutte = nodi.concat(collegamenti, nonLetti), segnalate = nodi.concat(collegamenti);
      st.out = { righe: tutte, gruppi, assenti: [], tutte, riepilogo: { daRivedere: daFare(tutte), segnalati: segnalate.length,
        decisi: segnalate.filter(x => x.fatto).length, nonLetti: nonLetti.length } };
      return st.out;
    }
    /* Le righe del rapporto senza esito (`incompleteMaterials`, passate da R.open): i materiali assenti dalla bozza e
       le frasi che il controllo non ha verificato (punto 13). Cambiano solo con un rapporto nuovo, quindi si leggono
       alla prima apertura e quando la revisione cambia da fuori (`render`), mai a ogni gesto. */
    function residui() {
      if (!st.residui) {
        let lista = [];
        try { lista = (E.residuiDelRapporto && E.residuiDelRapporto()) || []; } catch (e) { lista = []; }
        st.residui = { righe: lista, perId: new Map(lista.map(x => [String(x.id), x])) };
      }
      return st.residui;
    }
    function rigaDi(id) {
      const x = righe().tutte.find(r => r.id === String(id));
      if (x) return x;
      /* G1, Q1 (Giacomo, 06/10: «Si apre fuori elenco»): un nodo senza riga aperto da «Correggi il nodo vicino» si legge
         e si corregge come una riga «fuori» di G2; la correzione salvata gli dà la sua riga (la segnalazione del docente) */
      if (G1) {
        // settimo giro, D-a: un collegamento rimasto senza riga dopo la cura (`senzaCorrezioniVuote`) resta apribile così
        const l = st.fuoriLink.get(String(id));
        if (l) return { tipo: 'collegamento', id: String(id), n: null, source: l.source, target: l.target, rel: l.rel, titolo: l.titolo,
          note: 0, noteAperte: 0, issueIds: [], stato: 'fuori', fatto: false, daFare: false, fuori: true };
        const n = st.fuori.has(String(id)) ? nodoBase(id) : null;
        return n ? { tipo: 'nodo', id: String(id), n: null, titolo: String(n.label || id), note: 0, noteAperte: 0, issueIds: [],
          stato: 'fuori', fatto: false, daFare: false, fuori: true } : null;
      }
      // un materiale fuori elenco aperto dalle occorrenze, anche una Scheda nodi (difetto 10): la scheda si legge e
      // si corregge lo stesso; il numero è quello fra i materiali non esenti
      const it = base(id);
      if (!it) return null;
      const tutti = (review().baseSnapshot.items || []).filter(i => i && i.kind !== 'nodesheet');
      const k = tutti.findIndex(i => String(i.id) === String(id));
      return { id: String(id), n: k < 0 ? null : k + 1, tipo: it.kind, titolo: '', noteAperte: 0, stato: 'fuori', fatto: false, daFare: false, fuori: true };
    }
    // G1: R.open riceve anche la riga, per sapere se è un nodo o un collegamento (le macroaree dei suoi estremi)
    const areeDi = id => { try { return (E.areeDi && (G1 ? E.areeDi(id, rigaDi(id)) : E.areeDi(id))) || []; } catch (e) { return []; } };
    function testoRicerca(x) {
      if (G1) {
        const n = x.source != null ? null : nodoBase(x.id);
        return [x.titolo, n ? n.label : '', n ? (n.desc || n.content || '') : x.rel, ...noteDi(x.id).map(i => i.problem)].join(' ').toLocaleLowerCase();
      }
      const it = base(x.id);
      return [x.titolo, it ? E.displayValue(it, { field: '$item' }, it) : '', ...noteDi(x.id).map(i => i.problem)].join(' ').toLocaleLowerCase();
    }
    // Ricerca e Macroarea: valgono anche per «successivo»; il filtro di stato solo per la vista.
    const trovata = x => (!st.area || areeDi(x.id).some(a => a.id === st.area)) && (!st.cerca || testoRicerca(x).includes(st.cerca));
    /* Con «Da rivedere» una riga appena fatta resta in elenco con la sua spunta (le schermate approvate
       del 02/10): sparire sotto il dito farebbe perdere il segno e il posto. Esce al prossimo cambio di
       filtro, ricerca o Macroarea (`st.visti` si azzera). */
    // un materiale assente dalla bozza non è da fare, ma con «Da rivedere» si vede: è un'anomalia da sapere
    /* G1: con «Da rivedere» si vedono anche i non letti (in fondo, fuori dal da fare: ci si scrive sul posto, B.2) e la riga
       aperta, anche nata da una correzione fuori elenco (Q1) già decisa: la scheda in vista ha sempre la sua riga. */
    const visibile = x => trovata(x) && (st.filtro === 'tutti' || (st.filtro === 'fatti' ? x.fatto : (x.daFare || x.assente ||
      (G1 && (x.tipo === 'non-letto' || x.id === st.attiva)) || (!!st.visti && st.visti.has(x.id)))));
    const azzeraVisti = () => { st.visti = null; };
    const navigabili = () => righe().righe.filter(trovata);
    function primaDaFare() {
      const lista = navigabili(), prima = BC.successiva(lista, null) || lista[0] || righe().righe[0];
      return prima ? prima.id : null;
    }

    const tipoUno = k => ({ mc: t('rv_veste_tipo_mc', 'Scelta multipla'), open: t('rv_veste_tipo_open', 'Domanda aperta'),
      flashcard: t('rv_veste_tipo_flashcard', 'Flashcard'), causal: t('rv_veste_tipo_causal', 'Catena causale'),
      synthesis: t('rv_veste_tipo_synthesis', 'Sintesi'), nodesheet: t('rv_veste_tipo_nodesheet', 'Scheda nodi') })[k] || t('rv_material', 'Materiale');
    const tipoGruppo = k => ({ mc: t('rv_veste_gruppo_mc', 'Scelta multipla'), open: t('rv_veste_gruppo_open', 'Domande aperte'),
      flashcard: t('rv_veste_gruppo_flashcard', 'Flashcard'), causal: t('rv_veste_gruppo_causal', 'Catene causali'),
      synthesis: t('rv_veste_gruppo_synthesis', 'Sintesi'), nodesheet: t('rv_veste_gruppo_nodesheet', 'Schede dei nodi') })[k] || t('rv_material', 'Materiale');
    const contaNote = n => n === 1 ? t('rv_veste_una_nota', '1 nota') : t('rv_veste_note', '{n} note').replace('{n}', n);
    const avvisa = msg => { E.status.textContent = msg; };
    /* Settimo giro, punto 1: ⌘Z si indica solo se la voce in cima alla pila riguarda il materiale aperto E toglierla
       scioglie il suo conflitto (si prova sullo stato che la voce rimetterebbe, come il criterio di D). Altrimenti —
       pila vuota, voce di un altro materiale, voce che non c'entra — si indicano i gesti sulle note in conflitto. La
       prova costa un previewItem e si fa solo quando il materiale è in conflitto; il controllo sul materiale della voce
       viene prima e la risparmia quando la voce è d'altro. */
    function annullaScioglie() {
      const id = st.attiva, voce = st.pila[st.pila.length - 1];
      return !!voce && !!id && (voce.ids || []).indexOf(String(id)) >= 0 && !conflittiScelte(statoDi(voce, review()), id).length;
    }
    /* `gesto` (quarto giro, punto 2): l'errore viene da un gesto senza campo — «Tieni il testo», «Usa la proposta»,
       «Escludi», «Ripristina» —, dove nessun testo resta nel campo da salvare: il ripiego ha una frase sua. */
    function messaggioErrore(codice, gesto) {
      if (gesto) {
        try { console.warn('[Banco] scelta non salvata:', codice); } catch (e) { /* senza console */ }
        return t('rv_veste_scelta_non_salvata_imprevisto', 'La scelta non è stata salvata per un errore imprevisto. Riprova; se non si salva, chiudi con {piu_tardi} e riapri la revisione.').replace('{piu_tardi}', () => PIU_TARDI());
      }
      /* 0086, giro 3c (D37.7): una correzione respinta perché la scheda ha scelte salvate prima che si contraddicono (in G2 la
         regola 3 non compone il materiale intero con il campo). La veste non crea conflitti (le strade di ⌘Z e dei gesti sulle
         note del giro 2 bis e 2 ter non ci sono più): li sostituisce il bottone in fondo, coi campi come sono. */
      if (codice === 'conflitto_da_sciogliere' || (codice === 'conflicting_decisions' && st.modo === 'spunte' && conflittiDi(st.info).size > 0)) return t('rv_veste_conflitto_prima_campo', 'Questa correzione si scontra con le scelte salvate prima su questa scheda, che si contraddicono, e non è stata salvata: premi Esc per lasciare il campo com’era, poi il bottone in fondo, che le sostituisce; poi correggi di nuovo il campo.');
      if (G1) {
        // 0075: le stesse regole di G2, con le parole della mappa (un nodo o un collegamento, non un materiale)
        if (codice === 'adesso_superato') return t('rv_veste_g1_superato', 'La scheda non era aggiornata: la correzione non è stata salvata. Riapri la riga e ripetila.');
        if (codice === 'elemento_tolto') return t('rv_veste_g1_tolto_correggi', 'Hai tolto questo collegamento: per correggerne le parole rimettilo con {annulla}.').replace('{annulla}', ANNULLA);
        if (codice === 'conflicting_decisions') return t('rv_veste_g1_conflitto_nuovo', 'La correzione contraddice un’altra scelta salvata qui, e non è stata salvata.');
        /* Terzo giro (07/10, punto 3): le parole di un collegamento passano dall'editor della mappa (`paroleComeLaMappa`), e
           i suoi rifiuti arrivavano al docente come codici («…non è stata salvata (ambiguous_label).»). Ora una frase: che
           cosa è successo e che cosa fare. */
        if (codice === 'ambiguous_label') return t('rv_veste_g1_parole_doppie', 'Fra questi due concetti c’è già un collegamento con queste parole e lo stesso verso: la correzione non è stata salvata. Scegli parole diverse.');
        if (codice === 'link_changed') return t('rv_veste_g1_collegamento_non_ritrovato', 'Questo collegamento non si ritrova in un punto solo della mappa (fra gli stessi due concetti ce n’è più d’uno, o non c’è più): la correzione non è stata salvata. Chiudi con {piu_tardi} e correggi le parole sulla mappa, dal collegamento.').replace('{piu_tardi}', () => PIU_TARDI());
        if (codice === 'stale_revision') return t('rv_veste_g1_stantia_correzione', 'La mappa o le fonti non corrispondono più alla versione di questa revisione: la correzione non è stata salvata. Le decisioni già prese restano; prima di continuare occorre riaprire la revisione sulla versione corretta del progetto.');
        if (codice === 'editor_collegamenti_mancante') return t('rv_veste_g1_editor_mancante', 'L’editor dei collegamenti della mappa non è caricato, e senza di lui qui non si salvano le parole di un collegamento: la correzione non è stata salvata. Riavvia MappAI e riapri la revisione.');
      }
      if (codice === 'adesso_superato') return t('rv_veste_superato', 'La scheda non era aggiornata: la correzione non è stata salvata. Riapri il materiale e ripetila.');
      if (codice === 'materiale_escluso') return t('rv_veste_escluso_correggi', 'Il materiale è escluso: ripristinalo per correggerlo.');
      if (codice === 'conflicting_decisions') return t('rv_veste_conflitto_nuovo', 'La correzione contraddice un’altra scelta sullo stesso materiale, e non è stata salvata.');
      // terzo giro, punto 3: il ripiego non mostra il codice al docente; il codice resta nella console, per l'assistenza
      try { console.warn('[Banco] correzione non salvata:', codice); } catch (e) { /* senza console */ }
      return t('rv_veste_non_salvata_imprevisto', 'La correzione non è stata salvata per un errore imprevisto; il testo resta nel campo. Riprova; se non si salva, chiudi con {piu_tardi} e riapri la revisione.').replace('{piu_tardi}', () => PIU_TARDI());
    }
    // l'esclusione proposta di un materiale: una nota su tutto il materiale, senza un materiale nuovo (la riga D31 non c'è)
    const esclusioneProposta = i => i.target.field === '$item' && i.hasProposal && i.after === null;

    /* ── la pila di ⌘Z (R2) ─────────────────────────────────────────────────── */
    /* Gate 3, G6: ogni voce ricorda che cosa è (`cosa`: il bottone, la correzione di un campo, la scelta su una nota,
       l'esclusione o il ripristino), per dirlo e per ritrovarlo. Ogni scrittura nuova svuota la pila del ripristino;
       il ripristino stesso no (`mantieni`), e si registra sul materiale che rifà (`id`). */
    function voceDi(r, ids, id, cosa) {
      const I = r.initial;
      return { issues: I.issues, decisions: I.decisions, conChecks: own(I, 'manualChecks'), manualChecks: I.manualChecks,
        updatedAt: r.updatedAt, ids: (ids || []).map(String), id, cosa: cosa || null };
    }
    function registra(prima, ids, cosa, mantieni, id) {
      st.pila.push(voceDi(prima, ids, id === undefined ? st.attiva : id, cosa));
      if (st.pila.length > PILA_MAX) st.pila.shift();
      if (!mantieni) st.rifare = [];
    }
    // la revisione com'era prima della scrittura registrata in `voce` (note, decisioni, approvazioni; il resto non cambia)
    function statoDi(voce, cur) {
      const initial = Object.assign({}, cur.initial, { issues: voce.issues, decisions: voce.decisions });
      if (voce.conChecks) initial.manualChecks = voce.manualChecks; else delete initial.manualChecks;
      return Object.assign({}, cur, { initial, updatedAt: voce.updatedAt });
    }
    // le modifiche non salvate della scheda aperta: battitura non uscita dal campo, campo non valido, «×», «Aggiungi»
    // (un campo non valido è sempre anche `dirty`: chi lo rimette com'era ne toglie il segno)
    const sospese = () => st.campi.filter(c => c.dirty);
    /* A.9 resta: una correzione respinta perché si scontra con una scelta salvata non è una modifica da scartare — la
       riga di stato ha appena detto di premere ⌘Z per togliere quella scelta, e la correzione resta nel campo per
       salvarla dopo. Vale finché il conflitto c'è e togliere l'ultima voce lo scioglie (`annullaScioglie`). G14 (c):
       in questo stato è della veste anche il tasto ⌘Z col fuoco nel campo (`tasto`). */
    const sciogliConflitto = () => st.erroreScrittura === 'conflitto_da_sciogliere' && conflittiScelte(review(), st.attiva).length > 0 && annullaScioglie();
    async function annulla() {
      if (!editabile() || occupato()) return;
      /* Gate breve, G10 (05/10): una modifica non salvata della scheda aperta (battitura, campo non valido, «×»,
         «Aggiungi», pallino) si scarta per prima, come Esc, e lo si dice; solo se non c'è niente di non salvato si toglie
         l'ultima azione salvata. Rovescia la regola del difetto 12 (prima ⌘Z si fermava). */
      const campi = sciogliConflitto() ? [] : sospese();
      if (campi.length) {
        const nomi = campi.map(c => '«' + nomeCampo(c.field, base(st.attiva)) + '»').join(', ');
        campi.forEach(c => c.ripristina());   // ognuno riaggiorna i bottoni
        memorizzaBozze();   // giro 3d (D41): la bozza scartata non torna cambiando riga
        // G14 (b): lo scarto è un'azione nuova e svuota la pila del ripristino (prima ⇧⌘Z rifaceva una scelta vecchia)
        st.rifare = [];
        const x = (campi.length > 1 ? t('rv_veste_cosa_non_salvate', 'le modifiche non salvate di {campi}') : t('rv_veste_cosa_non_salvata', 'la modifica non salvata di {campi}')).replace('{campi}', () => nomi);
        avvisa(t('rv_veste_annullato', 'Annullato: {x}.').replace('{x}', () => x));
        return;
      }
      if (!st.pila.length) return;
      const voce = st.pila[st.pila.length - 1];
      st.pila.pop();
      // G6 (c): lo stato di adesso va nella pila del ripristino, con la stessa descrizione
      st.rifare.push(voceDi(review(), voce.ids, voce.id, voce.cosa));
      await rimetti(statoDi(voce, review()), voce, t('rv_veste_annullato', 'Annullato: {x}.'));
    }
    /* G6 (c): ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y rifanno l'ultima azione annullata; il ripristino è a sua volta una voce di ⌘Z. */
    async function ripristina() {
      if (!editabile() || occupato() || !st.rifare.length) return;
      const nonValido = st.campi.find(c => c.invalido || (c.dirty && c.valida()));
      if (nonValido) {
        avvisa(t('rv_veste_annulla_fermo', 'Prima completa il campo, oppure premi Esc per lasciarlo com’era:') + ' ' + (nonValido.invalido || nonValido.valida()));
        return;
      }
      const voce = st.rifare[st.rifare.length - 1];
      if (voce.id !== st.attiva && st.campi.some(c => c.dirty)) {
        // giro 3d (D41): su una scheda con note del controllo il campo non si salva: la bozza resta per la seduta, e si va
        if (inBozza()) memorizzaBozze();
        else {
          avvisa(t('rv_veste_prima_campo', 'Prima salva il campo che stai scrivendo, oppure premi Esc per lasciarlo com’era.'));
          return;
        }
      }
      st.rifare.pop();
      registra(review(), voce.ids, voce.cosa, true, voce.id);
      await rimetti(statoDi(voce, review()), voce, t('rv_veste_ripristinato', 'Ripristinato: {x}.'));
    }
    /* G6 (a) e (b): rimette una revisione della pila, apre la scheda del materiale a cui appartiene la voce, lo seleziona
       in barra, porta in vista e evidenzia ciò che ha toccato, e dice per esteso che cosa ha fatto. */
    async function rimetti(r, voce, frase) {
      st.chiuseOra = null;   // G1: che cosa ha chiuso la correzione vale finché non si torna indietro
      st.salvati.clear();    // decimo giro, Q16: su ⌘Z e ⇧⌘Z niente «Testo salvato», basta la riga di stato
      imposta(r, voce.ids.length ? voce.ids : []);
      const salvato = E.save();
      elenco();
      if (voce.id && voce.id !== st.attiva) { st.attiva = voce.id; costruisciScheda(); } else aggiornaScheda();
      aggiornaContorno();
      evidenzia(voce);
      await salvato;
      if (E.stato().saveError) return;
      // niente punto doppio: se la descrizione finisce già con un segno di fine frase (anche dentro «…»), la cornice
      // non aggiunge il suo
      const x = descrivi(voce.cosa, voce.id);
      avvisa((/[.!?…][»"”’']*$/.test(x) ? frase.replace('{x}.', '{x}') : frase).replace('{x}', () => x));
    }
    // «6 · Sintesi»: il numero della riga e il tipo, come nella scheda
    function nomeMateriale(id) {
      if (G1) { const x = rigaDi(id); return x ? x.titolo : String(id); }   // «Accuse», «Accuse → Banche»
      const x = rigaDi(id), it = base(id);
      return [x && x.n != null ? String(x.n) : '', tipoUno(it && it.kind)].filter(Boolean).join(' · ');
    }
    const accorcia = s => { s = String(s || '').trim(); return s.length > 80 ? s.slice(0, 79).trimEnd() + '…' : s; };
    function descrivi(cosa, id) {
      const m = nomeMateriale(id), con = (k, f, valori) => Object.keys(valori).reduce((s, chiave) => s.replace('{' + chiave + '}', () => valori[chiave]), t(k, f));
      if (cosa && cosa.tipo === 'bottone') return con('rv_veste_cosa_bottone', '«{nome}» su {m}', { nome: cosa.nome, m });
      if (cosa && cosa.tipo === 'campo') return con('rv_veste_cosa_campo', 'la correzione di «{campo}» su {m}', { campo: nomeCampo(cosa.campo, base(id)), m });
      if (cosa && cosa.tipo === 'nota') return con('rv_veste_cosa_nota', 'la tua scelta sulla nota «{nota}»', { nota: accorcia(cosa.nota) });
      if (cosa && cosa.tipo === 'esclusione') return con('rv_veste_cosa_esclusione', 'l’esclusione di {m}', { m });
      if (cosa && cosa.tipo === 'ripristino') return con('rv_veste_cosa_ripristino', 'il ripristino di {m}', { m });
      return con('rv_veste_cosa_azione', 'l’ultima azione su {m}', { m });
    }
    /* L'evidenza di ciò che ⌘Z o il ripristino hanno toccato: una classe (l'animazione è del foglio di stile), tolta al
       gesto successivo. Niente timer. */
    function spegniEvidenza() { content.querySelectorAll('.mrv-veste-evidenza').forEach(x => x.classList.remove('mrv-veste-evidenza')); }
    function evidenzia(voce) {
      spegniEvidenza();
      const cosa = voce && voce.cosa;
      let el = null;
      if (cosa && cosa.tipo === 'nota') el = st.noteEl.get(cosa.notaId) || null;
      else if (cosa && cosa.tipo === 'campo') el = content.querySelector('[data-veste-scheda] [data-veste-campo="' + (cosa.campo === 'correctIndex' ? 'options' : cosa.campo) + '"]');
      if (!el) el = content.querySelector('#mrv-current-title');
      if (!el) return;
      el.classList.add('mrv-veste-evidenza');
      if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
    }

    /* ── scrivere ─────────────────────────────────────────────────────────── */
    function applica(r, chiamate) {
      return chiamate.reduce((x, c) => c.chiamata === 'addIssue' ? core.addIssue(x, c.issue) : core.setDecision(x, c.issueId, c.choice, c.opts), r);
    }
    /* Una scrittura = `decisioniDaCampo` (regime g2) → le chiamate nell'ordine in cui escono → `save()`.
       Più campi dello stesso gesto (le alternative e la corretta) fanno UNA scrittura e una voce di ⌘Z.
       `{ errore }` = nessuna scrittura, il motivo nella riga di stato. */
    function scrivi(campi) {
      const id = st.attiva, prima = review();
      const m = campiInMemoria(prima, campi, false);
      if (m.errore) { if (!m.eccezione) st.erroreScrittura = m.errore; avvisa(messaggioErrore(m.errore)); return false; }
      const r = m.r, tolte = m.tolte, voci = m.voci;
      if (r !== prima) {
        spegniEvidenza();
        // una voce sola per tutte le chiamate della scrittura (gate 3, G2 b): un ⌘Z le toglie tutte
        registra(prima, [id], { tipo: 'campo', campo: String(voci[0].field) }); imposta(r, [id]); E.save();
        // punto 2: la battitura salvata, col suo materiale e i suoi campi (vale finché è in cima alla pila)
        st.ultimaBattitura = { voce: st.pila[st.pila.length - 1], id, campi: new Set(voci.map(v => String(v.field))) };
        // G1, §4.4: la scheda dice quali note la correzione ha chiuso (e quali restano); con le spunte (0086, giro 3b) una
        // correzione non chiude note del controllo, e la frase non c'è
        if (G1) st.chiuseOra = st.modo !== 'spunte' ? { id, testo: fraseChiuse(prima, r, id, voci.map(v => String(v.field)), tolte) }
          : tolte ? { id, testo: CORREZIONE_TOLTA() } : null;
      }
      // salvati (o uguali ad «adesso»): i campi si ricaricano dalle decisioni, senza battitura in sospeso
      campi.forEach(c => { c.dirty = false; c.sporcheVoci = false; c.invalido = ''; });
      aggiornaTutto();
      /* decimo giro, Q16: «Testo salvato» sotto i campi il cui testo questa scrittura ha cambiato. 0086 (§4.8; D7, D16,
         D17): in G1 si decide sullo stato DOPO il salvataggio — se il bottone in fondo c'è e dice «Tieni la tua versione»,
         è il suo nome a dire che il ritocco è salvato, e la riga non c'è; altrove (nessun bottone in fondo, o un nome che
         non lo dice) resta. In G2 com'è.
         Giro 2 ter (D2, difetto 2 del revisore; il chiarimento dell'§4.8 approvato da Giacomo): il nome in fondo segnala il
         ritocco solo per il campo della SUA nota. La riga manca solo sotto quel campo, se è fra quelli appena salvati; sotto
         gli altri campi salvati resta (la nota in fondo sulla descrizione e una correzione del titolo, e viceversa).
         Giro 3d (D41): sulle schede con note del controllo il campo non si salva più prima del bottone (è una bozza), quindi
         qui non si arriva e «Testo salvato» non c'è; si arriva dalle righe senza note del controllo e dalle schede le cui
         note sono già tutte decise (senza bottone in fondo il campo si salva all'uscita, come prima). */
      const tua = G1 ? tuaInFondo() : new Set();
      segnaSalvati(id, new Map(voci.filter(v => !tua.has(String(v.field))).map(v => [String(v.field), v.adesso])));
      return true;
    }
    /* Giro 3d (D41): le voci dei campi applicate a una revisione nello stesso modo dell'uscita dal campo (`scrivi`: la
       correzione del docente, le parole di un collegamento come l'editor della mappa, D4, le correzioni tornate al testo di
       partenza tolte), ma in memoria: niente pila, niente salvataggio. La usa `scrivi`, e il bottone in fondo per registrare
       la bozza del campo nella STESSA scrittura e nella stessa voce di ⌘Z delle spunte. `prova`: senza effetti sulla
       seduta (le righe che escono dalla barra non si segnano fuori elenco). Restituisce { r, tolte, voci } o { errore,
       eccezione? } (`eccezione`: l'errore è venuto da un'eccezione, e `scrivi` non lo segna come respinto). */
    function campiInMemoria(prima, campi, prova) {
      const id = st.attiva, voci = campi.flatMap(c => c.voci());
      let r = prima, tolte = 0;
      for (const v of voci) {
        // 0075: in G1 il bersaglio è della mappa (il nodo, o il collegamento coi suoi estremi), il regime 'g1' (Q6)
        const bersaglio = G1 ? bersaglioDi(id, v.field) : { kind: 'item', id, field: v.field };
        const dati = { review: r, regime, bersaglio, salvato: v.valore,
          adesso: v.adesso, db: G1 ? dbMappa() : dbItems(), sources: fonti(),
          problema: t('rv_teacher_edit', 'Modifica del docente') + ': ' + nomeCampo(v.field, base(id)) + (G1 ? ' · ' + nomeMateriale(id) : '') };
        // quarto giro, D1 (Q9): in G1 il core sa quale proposta aperta era scritta nel campo (A.5): il salvataggio vale
        // «Usa la proposta» di quella nota più il ritocco, come col bottone. In G2 resta A.6.
        if (G1 && v.proposta != null) dati.propostaMostrata = v.proposta;
        /* 0086, giro 3b (§4.3, D37.1): sulla scheda di un nodo con le spunte il testo si salva come correzione del docente e
           non decide nessuna nota del controllo (`correzioneDelCampo`); restano aperte con le loro spunte fino al bottone in
           fondo. Le correzioni del docente da togliere (`togli`: il testo tornato all'Originale) le toglie la veste.
           Giro 3c: anche sulle parole di un collegamento e sui campi di G2. Con scelte salvate in conflitto il campo è
           ripartito dalle scelte senza conflitto (L3), che non è l'«adesso» del core (il testo di partenza): la regola 0
           (`adesso_superato`) lì non si passa. */
        const conSpunte = st.modo === 'spunte';
        const datiCampo = { review: r, db: G1 ? dbMappa() : dbItems(), sources: fonti(), bersaglio, salvato: v.valore, problema: dati.problema };
        if (!conflittiDi(st.info).size) datiCampo.adesso = v.adesso;
        const ris = conSpunte ? BC.correzioneDelCampo(datiCampo) : BC.decisioniDaCampo(dati);
        if (ris.errore) return { errore: ris.errore };
        try {
          // D4: una correzione NUOVA delle parole di un collegamento nasce come quella dell'editor della mappa
          r = G1 && bersaglio.kind === 'link' && ris.chiamate.some(c => c.chiamata === 'addIssue') ? paroleComeLaMappa(r, id, v) : togliSegnalazioni(applica(r, ris.chiamate), ris.togli);
        } catch (e) { return { errore: (e && (e.code || e.message)) || 'errore', eccezione: true }; }
        if (conSpunte) tolte += (ris.togli || []).length;
        // sesto giro, il cambio e ritorno: una correzione del docente rimasta uguale al testo di partenza si toglie
        if (G1) { const n = senzaCorrezioniVuote(r, id, String(v.field), prova); r = n.r; tolte += n.tolte; }
      }
      return { r, tolte, voci };
    }
    /* 0086 (§4.8): il bottone in fondo (la risposta della nota sola, Q20) c'è e dice «Tieni la tua versione».
       Giro 2 ter (D2): restituisce il campo della nota in fondo (quello del suo riquadro, `campoDellaNota`), o null.
       Giro 3b (§4.9): l'insieme dei campi di cui il bottone in fondo dice «Tieni la tua versione» — con le spunte, i campi
       con note aperte del controllo (`campiFondo`), quando il nome in fondo è quello; vuoto altrove. */
    function tuaInFondo() {
      if (st.modo === 'spunte') return G1 && fondoAttivo() && nomeFondo() === TIENI_TUA() ? new Set(campiFondo().map(c => String(c.field))) : new Set();
      const f = tuaInFondoQ20();
      return new Set(f ? [f] : []);
    }
    function tuaInFondoQ20() {
      const posto = st.bar && st.bar.risposta;
      if (!st.inFondo || !posto || posto.hidden || st.inFondo.azioni.hidden) return null;
      /* giro 2 bis (difetto 8 del revisore): conta solo se la nota in fondo è ancora aperta. Col Tab dal campo al bottone in
         fondo il salvataggio chiude la nota sola e i suoi bottoni restano lì per il fuoco (`trattenuta`): non dicono più
         niente del testo salvato, e senza «Testo salvato» il ritocco salvato non avrebbe segno */
      const nota = (review().initial.issues || []).find(x => x.id === st.inFondo.id);
      if (!nota || esito(nota) !== 'pending') return null;
      if (!Array.from(st.inFondo.azioni.querySelectorAll('button')).some(b => !b.hidden && b.textContent === TIENI_TUA())) return null;
      const c = campoDellaNota(nota);
      return c ? String(c.field) : null;
    }
    /* Decimo giro, Q16 (Giacomo al gate 3, 07/10: «annotare con un testo piccolo verde 'Testo salvato' sotto la casella di
       testo dove è stata fatta una modifica»; dei due stati proposti, «solo 'Testo salvato'», perché «Non ancora salvato»
       farebbe cercare un bottone «Salva testo»). Dopo una scrittura (`scrivi`: l'uscita dal campo, il cambio di riga, un
       bottone della nota o della barra con la battitura in sospeso, un chip delle parole), sotto ogni campo di testo il cui
       testo è CAMBIATO — l'«adesso» di prima diverso da quello di dopo — e non è tornato quello di partenza (la scheda dice
       già che la correzione è tolta, o la nota «Testo mantenuto senza modifiche») compare la riga, in una regione annunciata
       (`role="status"`, polite). Il segno vale per riga e campo finché il campo mostra quel testo: lo toglie la battitura nel
       campo (si riprende a scrivere) e ⌘Z/⇧⌘Z (`rimetti`: lì parla la riga di stato «Annullato: …»); un gesto che cambia il
       testo dopo (Tieni Prima, Usa Dopo) lo spegne perché il testo non è più quello salvato. Mentre si scrive non c'è
       niente. Solo i campi di testo (`widgetTesto`, in G1 e G2) e le parole di un collegamento (`widgetParole`); le
       alternative, le liste e le righe per rispondere di G2 no. */
    const TESTO_SALVATO = () => t('rv_veste_testo_salvato', 'Testo salvato');
    const chiaveSalvato = (id, field) => String(id) + '\u0000' + String(field);
    const RIGA_SALVATO = '<p class="mrv-veste-salvato" data-veste-salvato role="status" aria-live="polite"></p>';
    function segnaSalvati(id, prima) {
      st.campi.forEach(c => {
        const f = String(c.field);
        if (!c.salvatoEl || !prima.has(f) || uguali(c.adesso, prima.get(f)) || uguali(c.adesso, (c.it || {})[f])) return;
        st.salvati.set(chiaveSalvato(id, f), clone(c.adesso));
        dipingiSalvato(c);
      });
    }
    function dipingiSalvato(c) {
      if (!c.salvatoEl) return;
      const v = st.salvati.get(chiaveSalvato(st.attiva, c.field));
      const frase = v !== undefined && uguali(v, c.adesso) ? TESTO_SALVATO() : '';
      if (c.salvatoEl.textContent !== frase) c.salvatoEl.textContent = frase;
    }
    // si riprende a scrivere nel campo: la riga sparisce
    function riprende(c) { if (st.salvati.delete(chiaveSalvato(st.attiva, c.field))) dipingiSalvato(c); }
    /* G1: il bersaglio di un campo della riga — il nodo col suo campo, o il collegamento coi suoi estremi e le sue parole
       (`decisioniDaCampo` lo ritrova come la riga della barra; senza parole note, per estremi). */
    function bersaglioDi(id, field) { return bersaglioRiga(rigaDi(id), id, field); }
    // lo stesso, dalla riga già in mano (sesto giro: `elencoG1` non può chiedere `rigaDi`, che rilegge l'elenco)
    function bersaglioRiga(x, id, field) {
      if (x && x.source != null) {
        const b = { kind: 'link', source: x.source, target: x.target, field: 'rel' };
        if (x.rel != null && x.rel !== '') b.rel = x.rel;
        return b;
      }
      return { kind: 'node', id: String(id), field };
    }
    /* Sesto giro, Q10: «Va bene così» si registra con `setManualCheck` del core (riusato, non modificato), in
       `review.initial.manualChecks`, la struttura delle approvazioni per materiale di G2. La chiave non può coincidere con
       l'id di un materiale: `g1:nodo:<id del nodo>` per un nodo, `g1:link:<id della riga>` per un collegamento, dove l'id
       della riga è quello di `righeMappa` per un non letto — `["source","target","parole di partenza"]` in JSON, con
       «include» per le parole vuote —, così due collegamenti fra gli stessi concetti non si confondono. L'impronta è
       quella del testo mostrato (la descrizione o le parole, `testoAdesso`), con `improntaTesto` di R.open come in G2. */
    const campoNonLetto = x => x.source != null ? 'rel' : 'desc';
    const chiaveVaBene = x => (x.source != null ? 'g1:link:' : 'g1:nodo:') + x.id;
    function improntaVaBene(x) {
      const s = BC.testoAdesso(null, review(), { db: dbMappa(), bersaglio: bersaglioRiga(x, x.id, campoNonLetto(x)), sources: fonti() });
      return s.errore || !s.ok || s.escluso ? '' : E.improntaTesto(JSON.stringify(s.adesso));
    }
    /* Sesto giro, il difetto visto al gate 3 (07/10): cambiare un testo e poi rimetterlo com'era (una parola, un chip delle
       parole di un collegamento) lasciava una correzione del docente uguale al testo di partenza — esito «kept» — e la riga
       restava «corretta», con la spunta. Rev. 5, B: entrare nel campo senza cambiare il testo resta nessuna decisione.
       Dopo il salvataggio di un campo, le note DEL DOCENTE della riga su quel campo che non cambiano più niente — una
       correzione a mano (`manual`) col testo di partenza (`before`), cioè esito «kept» — si tolgono insieme alla loro
       decisione. Il core non ha un «togli la nota» e non si modifica: si riscrivono `issues` e `decisions` della revisione
       come fa ⌘Z (`statoDi`), e il core la accetta come accetta lo stato che ⌘Z rimette (le note del docente non vengono
       dal rapporto). Vale per ogni strada da cui la nota è nata: la correzione della veste, quella dell'editor dei
       collegamenti della mappa («teacher-link-label-…», packet 0022), «Aggiungi alla revisione» del Banco di prima. Le
       note del controllo non si toccano: per loro una «manual» col testo di partenza resta «Testo mantenuto senza
       modifiche», come la legge il core. Le note della riga sono quelle che `righeMappa` le dà sulla revisione NUOVA: la
       stessa identità di riga del core, anche per un collegamento. La scrittura resta una voce sola di ⌘Z.
       Settimo giro:
       - D-b: «di nuovo il testo di partenza» si giudica come la regola 1 di `decisioniDaCampo`, a meno di spazi (`piano`
         del core), non carattere per carattere: rimesso il testo con uno spazio in fondo, la correzione si toglie e alla
         mappa arriva il testo di partenza, senza lo spazio.
       - D-a, il criterio: la richiesta di «Aggiungi alla revisione» del Banco di prima non si toglie: perde la decisione
         e torna da decidere, com'era prima di ogni scelta. Ottavo giro: la si riconosce dai DATI della nota (`richiesta`),
         non dall'averla vista aperta in questa seduta — chiusa con «Va bene così» o corretta in una seduta di prima, e
         rimessa com'era in questa, prima si perdeva (VER7-D1). Le altre si tolgono: la correzione della veste
         (`decisioniDaCampo`, `correzioneDocente`, con il « · » che la veste mette nel motivo), quella dell'editor della
         mappa («teacher-link-label-…»), di questa seduta o di una di prima.
       - D-a, la scheda: se la nota tolta era l'unica della riga e la riga non è un non letto, la riga esce dalla barra; la
         scheda resta aperta «fuori elenco», come Q1 (`st.fuori` per un nodo, `st.fuoriLink` per un collegamento coi suoi
         estremi), e dice che la correzione è tolta. ⌘Z rimette nota e riga. */
    // giro 3d: `prova` (il conto del bottone in fondo, in memoria) non segna le righe fuori elenco
    function senzaCorrezioniVuote(r, id, field, prova) {
      const x = BC.righeMappa(r, dbMappa()).righe.find(y => y.id === String(id));
      if (!x) return { r, tolte: 0 };
      const sue = new Set((x.issueIds || []).map(String)), d = r.initial.decisions || {};
      const diPartenza = (i, dec) => core.decisionOutcome(i, dec) === 'kept' ||
        (typeof dec.text === 'string' && typeof i.before === 'string' && BC.piano(dec.text) === BC.piano(i.before));
      const vuote = (r.initial.issues || []).filter(i => i && i.target && sue.has(String(i.id)) && i.origin === 'teacher' && !i.hasProposal &&
        String(i.target.field) === field && own(d, i.id) && !!d[i.id] && d[i.id].choice === 'manual' && diPartenza(i, d[i.id]));
      if (!vuote.length) return { r, tolte: 0 };
      const senzaDecisione = new Set(vuote.map(i => String(i.id)));
      const togli = new Set(vuote.filter(i => !richiesta(i)).map(i => String(i.id)));
      // le decisioni si riscrivono con defineProperty, come fa il core: un id «__proto__» non cambia il prototipo
      const decisions = {};
      Object.keys(d).forEach(k => { if (!senzaDecisione.has(k)) Object.defineProperty(decisions, k, { value: d[k], enumerable: true, configurable: true, writable: true }); });
      const initial = Object.assign({}, r.initial, { issues: r.initial.issues.filter(i => !togli.has(String(i && i.id))), decisions });
      const nuova = Object.assign({}, r, { initial });
      if (!prova && togli.size && !BC.righeMappa(nuova, dbMappa()).righe.some(y => y.id === String(id))) {
        if (x.source != null) st.fuoriLink.set(String(id), { source: x.source, target: x.target, rel: x.rel, titolo: x.titolo });
        else st.fuori.add(String(id));
      }
      return { r: nuova, tolte: vuote.length };
    }
    /* Ottavo giro, D-a dai dati: la richiesta di «Aggiungi alla revisione» (mappai-review.js, `#mrv-add-node`) è una nota
       del docente su un NODO, senza proposta, col motivo «Modifica del docente: <titolo del nodo>». Le altre note del
       docente su un nodo o un collegamento in G1 vengono da due strade sole: la correzione della veste (`correzioneDocente`
       di `decisioniDaCampo`, motivo «Modifica del docente: <campo> · <titolo>», col « · » che solo la veste mette) e
       l'editor dei collegamenti della mappa (id «teacher-link-label-…», motivo senza « · », ma sempre su un collegamento:
       `kind === 'node'` la esclude già). Il motivo non si confronta con le parole di «Modifica del docente»: è scritto
       nella lingua del momento in cui la nota è nata, e una richiesta nata in inglese («Teacher edit: …») va riconosciuta
       anche in italiano. Limite dichiarato: un titolo di nodo che contiene « · » fa sembrare la richiesta una correzione
       della veste, che si toglie (com'era prima di questo giro). */
    function richiesta(i) {
      return !!(i && i.target) && i.origin === 'teacher' && !i.hasProposal && i.target.kind === 'node' &&
        String(i.problem || '').indexOf(' · ') < 0;
    }
    /* 0086, giro 3b (§4.3, §4.4): le segnalazioni del docente che il core manda via (`togli` di `correzioneDelCampo` e di
       `chiamateBottone`: una correzione tornata uguale al testo di partenza). `mappai-review-core.js` non ha la chiamata che
       toglie una segnalazione e non si modifica: si riscrivono `issues` e `decisions` come fa `senzaCorrezioniVuote`, con la
       stessa regola D-a — la richiesta di «Aggiungi alla revisione» (`richiesta`) perde solo la decisione e torna da
       decidere, le altre si tolgono con la loro decisione. La scrittura resta una voce sola di ⌘Z (chi chiama registra). */
    function togliSegnalazioni(r, ids) {
      const via = new Set((ids || []).map(String));
      if (!via.size) return r;
      const d = r.initial.decisions || {}, decisions = {};
      Object.keys(d).forEach(k => { if (!via.has(k)) Object.defineProperty(decisions, k, { value: d[k], enumerable: true, configurable: true, writable: true }); });
      const fuori = new Set((r.initial.issues || []).filter(i => i && via.has(String(i.id)) && !richiesta(i)).map(i => String(i.id)));
      const initial = Object.assign({}, r.initial, { issues: (r.initial.issues || []).filter(i => !fuori.has(String(i && i.id))), decisions });
      return Object.assign({}, r, { initial });
    }
    /* D4 (giro del 07/10; packet 0022, «nessun secondo editor»). Si arriva qui SOLO quando `decisioniDaCampo` chiede una
       correzione NUOVA del docente sulle parole del collegamento (una chiamata `addIssue`): allora la correzione nasce come
       dall'editor dei collegamenti della mappa (`R.editLinkLabel`), con `MappAILinkEditorCore.decision` riusato e non
       modificato, lo stesso motivo e la stessa nota («teacher-link-label-…»). In quel caso una correzione fatta qui e una
       fatta poi dalla mappa (o viceversa) sono una nota sola e non si contraddicono — prima la veste ne creava una sua (id
       di `addIssue`) e la mappa una seconda, e G1 si fermava su `conflicting_decisions`.
       Negli altri casi il core scrive su una nota che c'è già, e questa funzione non c'entra: le parole uguali alla
       proposta di una nota («Proposta scelta»), una nota già decisa sulle parole, e UNA sola nota del giudice sul
       collegamento, aperta e sulle parole (la regola prudente: la correzione la chiude). Lì il Banco scrive su quella
       nota, come il Banco di prima. Limite
       dichiarato (terzo giro, punto 6): l'editor della mappa legge solo la sua nota «teacher-link-label-…», quindi non
       vede quella correzione, e una correzione fatta dopo dalla mappa sulle stesse parole confligge
       (`conflicting_decisions`); riaprendo, il Banco segna la riga «Scelte in conflitto» (D2). Fatta prima dalla mappa e
       poi qui, niente conflitto.
       «Nessuna» è `relNone`; il vuoto senza «Nessuna» non arriva qui (`valida`). Gli errori e chi corregge quando una
       correzione del docente c'è già (la stessa nota) restano del core. La nota del giudice «togli il collegamento» resta
       aperta (Q3). Senza l'editor della mappa non si scrive (fallisce chiusa): niente seconda strada. */
    function paroleComeLaMappa(r, id, v) {
      const LE = E.linkEditor, x = rigaDi(id), fallisci = codice => { throw Object.assign(new Error(codice), { code: codice }); };
      if (!LE || typeof LE.decision !== 'function' || typeof LE.reference !== 'function' || !x || x.source == null) fallisci('editor_collegamenti_mancante');
      const db = dbMappa(), eidDi = n => String(n && typeof n === 'object' ? n.id : n);
      const relDi = l => (l.rel == null || l.rel === '' ? 'include' : String(l.rel));
      let link = (db.links || []).filter(l => l && eidDi(l.source) === String(x.source) && eidDi(l.target) === String(x.target));
      if (link.length > 1 && x.rel !== '') link = link.filter(l => relDi(l) === x.rel);
      if (link.length !== 1) fallisci('link_changed');
      const nuova = LE.decision(r, db, LE.reference(link[0]), v.valore, {
        problem: t('le_manual_change', 'Parole del collegamento modificate dal docente.'), now: new Date().toISOString(), relNone: v.valore === '' });
      // il giudizio sul risultato, come per `decisioniDaCampo` (regola 9): le parole salvate in vista, nessun conflitto
      const s = BC.testoAdesso(null, nuova, { db, bersaglio: bersaglioDi(id, 'rel'), sources: fonti() });
      if (s.errore) fallisci(s.errore);
      if (!s.ok) fallisci('conflicting_decisions');
      if (s.escluso || !uguali(s.adesso, v.valore)) fallisci('testo_diverso');
      return nuova;
    }
    // sesto giro: il testo rimesso com'era ha tolto la correzione del docente (anche con le spunte, 0086 giro 3b); una chiave, qui
    const CORREZIONE_TOLTA = () => t('rv_veste_g1_correzione_tolta', 'Il testo è di nuovo quello di partenza: la tua correzione è tolta.');
    /* G1 (§4.4, «La scheda dice quali note la correzione ha chiuso»): le note del controllo della riga aperte prima e
       decise dopo la scrittura; quelle rimaste aperte sui campi salvati; e se non se ne è chiusa nessuna, che la
       correzione è del docente. */
    function fraseChiuse(prima, dopo, id, campi, tolte) {
      const aperta = (rv, i) => core.decisionOutcome(i, (rv.initial.decisions || {})[i.id]) === 'pending';
      const sue = noteDi(id).filter(i => i.origin !== 'teacher');
      const chiuse = sue.filter(i => aperta(prima, i) && !aperta(dopo, i));
      const restano = sue.filter(i => aperta(dopo, i) && campi.indexOf(String(i.target.field === '$link' ? 'rel' : i.target.field)) >= 0);
      // sesto giro: il testo rimesso com'era ha tolto la correzione del docente (`senzaCorrezioniVuote`)
      if (tolte && !chiuse.length) {
        const tolta = CORREZIONE_TOLTA();
        return restano.length ? tolta + ' ' + t('rv_veste_g1_restano_aperte', 'Restano aperte le note il cui passo è ancora nel testo, era già cambiato da un’altra scelta o non si può individuare: decidile col loro gesto.') : tolta;
      }
      const nomi = chiuse.map(i => '«' + accorcia(i.problem) + '»').join('; ');
      const frase = chiuse.length === 1 ? t('rv_veste_g1_chiude_una', 'La correzione chiude la nota {x}.').replace('{x}', () => nomi)
        : chiuse.length ? t('rv_veste_g1_chiude_note', 'La correzione chiude {n} note: {x}.').replace('{n}', chiuse.length).replace('{x}', () => nomi)
          : restano.length ? t('rv_veste_g1_nessuna_chiusa', 'La correzione è salvata come tua: nessuna nota si chiude, perché il passo che contestano è ancora nel testo, era già cambiato da un’altra scelta o non si può individuare. Decidile col loro gesto.')
            : !sue.length ? t('rv_veste_g1_segnalazione', 'La correzione è salvata: diventa una tua segnalazione.') : '';
      // quarto giro, punto 3 (Q9): un passo che un'altra scelta aveva già cambiato non chiude la sua nota
      return chiuse.length && restano.length ? frase + ' ' + t('rv_veste_g1_restano_aperte', 'Restano aperte le note il cui passo è ancora nel testo, era già cambiato da un’altra scelta o non si può individuare: decidile col loro gesto.') : frase;
    }
    /* L'uscita da un campo (R1). `e.relatedTarget` dice dove va il fuoco: se è un gesto di una nota della scheda (R6
       da tastiera, Shift+Tab), il salvataggio non deve nascondere quei bottoni prima che il fuoco ci arrivi. */
    function esci(c, e) {
      // giro 3d (D41): su una scheda con note del controllo l'uscita dal campo non scrive niente: il testo resta una bozza; il
      // bottone in fondo, se aspettava la pausa (D23), si ricalcola subito (come quando l'uscita salvava)
      if (inBozza()) {
        // un campo non valido lo dice all'uscita, come quando l'uscita salvava (e il bottone resta spento con la sua riga)
        const msg = c.dirty && c.valida ? c.valida() : '';
        if (msg) { c.invalido = msg; avvisa(msg); }
        memorizzaBozze();
        if (st.timerFondo) ricalcolaFondo(); else if (msg) aggiornaAzioni();
        return;
      }
      if (!c.dirty) return;
      st.fuocoInArrivo = (e && e.relatedTarget) || null;
      try { salvaAperto(); } finally { st.fuocoInArrivo = null; }
    }
    /* R1: il campo aperto si salva prima di ogni cambio di materiale, bottone o chiusura. Falso = si resta qui.
       0086, giro 3d (D41, Giacomo: «Il campo si salva col bottone»): su una scheda con note del controllo e il bottone in
       fondo (`inBozza`) il campo non si salva: resta una BOZZA nella veste (`st.bozze`, per la seduta del Banco: torna
       cambiando riga e tornando), finché il bottone in fondo non la registra insieme alle spunte, in una scrittura e una voce
       di ⌘Z. Prima la quarantena trattava come «fidata» una frase toccata dal docente, e un ritocco salvato all'uscita faceva
       entrare nei materiali una frase contestata mentre la nota diceva «Fuori dai materiali finché non decidi». Un campo non
       valido ferma la navigazione come prima; alla chiusura del Banco («Salva e continua più tardi») la bozza si perde
       (dichiarato da Giacomo). Le righe senza note del controllo (non lette, fuori elenco, con le sole richieste del docente)
       e le schede le cui note sono già tutte decise (niente bottone in fondo) si salvano all'uscita come prima. */
    function salvaAperto(scrivendo) {
      st.erroreScrittura = '';
      if (!editabile()) return true;
      const sporchi = st.campi.filter(c => c.dirty);
      if (!sporchi.length) { if (inBozza()) memorizzaBozze(); return true; }
      for (const c of sporchi) {
        const msg = c.valida();
        if (msg) { c.invalido = msg; avvisa(msg); aggiornaAzioni(); return false; }
      }
      // il bottone in fondo segue la bozza dopo la pausa (D23): un cambio di riga ricostruisce la scheda, che lo ricalcola
      if (inBozza() && !scrivendo) { memorizzaBozze(); aggiornaAzioni(); programmaFondo(); return true; }
      const ok = scrivi(sporchi);
      if (ok) memorizzaBozze();
      return ok;
    }
    // giro 3d (D41): la scheda tiene il campo come bozza — note del controllo e il bottone in fondo che le registra
    function inBozza() { return st.modo === 'spunte' && editabile() && fondoAttivo(); }
    /* giro 3d (D41): un gesto dentro un campo che prima si salvava subito (il pallino della corretta, «×» di una voce, un
       suggerimento delle parole): con le note del controllo resta nella bozza e il bottone in fondo si ricalcola subito */
    function gestoCampo() {
      if (!inBozza()) return salvaAperto();
      const ok = salvaAperto();
      if (ok) ricalcolaFondo();
      return ok;
    }
    // la bozza della riga aperta per la seduta: i campi con una battitura (o una scelta) non registrata; nessuna = via
    function memorizzaBozze() {
      if (st.attiva == null) return;
      const k = String(st.attiva), b = inBozza() ? bozzeDi() : new Map();
      if (b.size) st.bozze.set(k, b); else st.bozze.delete(k);
    }

    /* ── i gesti ──────────────────────────────────────────────────────────── */
    async function attendi() {
      await E.attendi();
      const s = E.stato();
      return !(s.saveError || s.closed);
    }
    async function vaiA(id) {
      id = String(id);
      if (occupato()) return false;
      if (id === st.attiva) return true;
      if (!salvaAperto()) return false;
      if (!(await attendi())) return false;
      if (!rigaDi(id)) return false;
      st.attiva = id;
      costruisciScheda(); aggiornaContorno();
      const titolo = content.querySelector('#mrv-current-title');
      if (titolo && titolo.focus) titolo.focus();
      return true;
    }
    /* Un gesto alla volta (terzo giro, difetto F): un secondo gesto mentre il primo è in corso non parte; il doppio
       clic (detail > 1) e il tasto tenuto premuto li scartano già i bottoni (`gesto`, `senzaRipetizione`).
       Quarto giro, punto 4: il gesto respinto non sparisce in silenzio e non va in coda (nessun gesto parte da solo).
       I gesti della sua nota restano in vista (`st.daRipetere`) per ripeterlo, e la riga di stato lo dice quando il
       gesto in corso e il suo salvataggio sono finiti: prima, «Salvataggio…» e «Decisioni salvate» la coprirebbero.
       Se quel salvataggio non è riuscito, la frase si aggiunge all'errore. `st.inCorso` è il gesto che sta andando. */
    async function unoAllaVolta(fn, nota) {
      if (st.inCorso) {
        if (nota) { st.daRipetere.add(String(nota)); aggiornaNote(); }
        try { await st.inCorso; await E.attendi(); } catch (e) { /* il gesto e il salvataggio dicono da sé come è andata */ }
        avvisa(E.stato().saveError ? E.status.textContent + ' · ' + NON_PARTITO() : NON_PARTITO());
        return;
      }
      if (nota) st.daRipetere.delete(String(nota));
      spegniEvidenza();   // gate 3, G6: l'evidenza di ⌘Z si toglie al gesto successivo
      let finito;
      st.inCorso = new Promise(fatto => { finito = fatto; });
      try { await fn(); } finally { st.inCorso = null; finito(); }
    }
    const NON_PARTITO = () => t('rv_veste_gesto_non_partito', 'Il gesto non è partito: era in corso un salvataggio. Ripetilo.');
    // settimo giro, punto 2: la frase nomina la casella della veste (R4/R10), non quella del Banco di oggi
    const SPUNTA_TOLTA = () => t('rv_veste_spunta_tolta', 'Le tue decisioni restano; va rimessa la spunta «Ho verificato personalmente…», perché il controllo è cambiato.');
    // 0086: `modo` 'tua' è «Tieni la tua versione» (§4.4); gli altri bottoni non lo passano
    const decidiNota = (issueId, choice, modo) => unoAllaVolta(() => decidiUnaVolta(issueId, choice, modo), issueId);
    // 0086 (§4.4): «Tieni la tua versione» che non scrive niente lo dice nella riga di stato
    const TUA_NIENTE = () => t('rv_veste_tua_niente', '«{tua}» non ha scritto niente.').replace('{tua}', () => TIENI_TUA());
    /* Le scelte che si contraddicono nell'anteprima del materiale (conflicting_decisions), ognuna con le due
       segnalazioni coinvolte (`issueId`, `otherIssueId`). */
    function conflittiScelte(r, id) {
      // G1: i conflitti fra scelte salvate sui campi della riga (`testoAdesso` guarda solo le decisioni della riga)
      if (G1) {
        const x = rigaDi(id), visti = new Set();
        if (!x) return [];
        return campiG1(x).flatMap(f => {
          const s = BC.testoAdesso(null, r, { db: dbMappa(), bersaglio: bersaglioDi(x.id, f), sources: fonti() });
          return (s.conflitti || []).filter(c => c && c.code === 'conflicting_decisions');
        }).filter(c => { const k = c.issueId + '|' + c.otherIssueId; if (visti.has(k)) return false; visti.add(k); return true; });
      }
      try { return (core.previewItem(r, dbItems(), id, { sources: fonti() }).conflicts || []).filter(c => c && c.code === 'conflicting_decisions'); }
      catch (e) { return []; }
    }
    /* Punto 2 (D da tastiera): con Shift+Tab la battitura si salva all'uscita dal campo, prima del gesto. Conta come
       la battitura del gesto se è l'ultima scrittura (nessun'altra in mezzo), sullo stesso materiale, e riguarda lo
       stesso campo della nota. Una nota su tutto il materiale ($item) non è di un campo: dopo una battitura salvata
       prima, il suo gesto resta quello di sempre (A.9: il conflitto si vede e ⌘Z lo scioglie).
       Giro 2 ter (D1): vale per il ramo D1 (la nota chiusa dalla battitura) e per il difetto D, non per il ramo D2
       (`scartata`), che chiede la battitura salvata dal gesto stesso. */
    function battituraAppena(issueId) {
      const b = st.ultimaBattitura;
      if (!b || !st.pila.length || st.pila[st.pila.length - 1] !== b.voce || b.id !== st.attiva) return null;
      const i = (review().initial.issues || []).find(x => x.id === issueId);
      return i && i.target && b.campi.has(String(i.target.field)) ? b.voce : null;
    }
    async function decidiUnaVolta(issueId, choice, modo) {
      if (!editabile() || occupato()) return;
      const lunga = st.pila.length;
      /* 0086 (§4.4, D25): «Tieni la tua versione» prende la strada di «Va bene così» (D1 qui sotto) con `tieniPrima`
         forzato a falso: tiene il testo com'è nel campo, battitura compresa, anche sulla nota la cui proposta è nel campo. */
      const tua = choice === 'reject' && modo === 'tua';
      /* Nono giro, D2 (Q15): il nome che il docente ha letto al clic, prima che il salvataggio della battitura ridisegni
         la scheda. «Tieni Prima» c'è quando «Dopo» mostra la proposta di QUESTA nota; una battitura non salvata non lo
         cambia (`aggiornaNote`). 0086: è «Tieni Originale» sulla nota la cui proposta `carica` ha scritto nel campo.
         Giro 2 bis (difetto 4 del revisore): anche su un'altra nota del campo quando la battitura in sospeso è la proposta
         mostrata con soli spazi in più (`soloSpaziSullaProposta`): i nomi sono quelli dello stato senza modifiche, quindi
         il gesto parte da prima della battitura, che si salva com'è (R6 dello 0075: vale «Usa Proposta») e resta nella
         pila di ⌘Z. */
      const cliccata = (review().initial.issues || []).find(x => x.id === issueId);
      const tieniPrima = choice === 'reject' && !tua && (propostaInDopo(cliccata) || soloSpaziSullaProposta(cliccata));
      let sospesa = false;
      if (!salvaAperto()) {   // R6: la battitura si salva prima (scrittura 1)
        /* Sesto giro, punto 2 (R6, «vince il clic, niente si perde»): la battitura non si salva perché il materiale ha
           già scelte in conflitto, salvate prima di lei. Il gesto sulla nota parte lo stesso — può essere proprio quello
           che scioglie il conflitto — e la battitura resta nel campo, da salvare: si salva al prossimo salvataggio
           (uscita dal campo, cambio di materiale, bottone, chiusura), quando le scelte non si contraddicono più. */
        if (st.erroreScrittura !== 'conflitto_da_sciogliere' || !conflittiScelte(review(), st.attiva).length) return;
        /* 0086 (§4.4): «Tieni la tua versione» tiene la battitura, che non si è salvata: il gesto non scrive niente, e la
           riga di stato (che dice già perché la battitura non si salva) lo aggiunge */
        if (tua) { avvisa(E.status.textContent + ' ' + TUA_NIENTE()); return; }
        sospesa = true;
      }
      if (!(await attendi())) return;
      // giro 2 ter (D1): la battitura che il gesto stesso ha appena salvato — quella in sospeso al clic (R6, col mouse)
      const salvataDalGesto = st.pila.length > lunga;
      const battitura = salvataDalGesto ? st.pila[st.pila.length - 1] : battituraAppena(issueId);
      const prima = review(), id = st.attiva;
      const laNota = (prima.initial.issues || []).find(i => i.id === issueId);
      const primaDellaBattitura = battitura && !sospesa && laNota ? statoDi(battitura, prima) : null;
      /* Nono giro, D2 (Q15: «Tieni Prima» tiene Prima). «Dopo» mostrava la proposta di questa nota e il docente ci ha
         scritto sopra: la battitura si è salvata (R6, come «Usa la proposta» più il ritocco, quarto giro) e il «reject»
         su quello stato terrebbe la proposta ritoccata. Il gesto parte dallo stato di PRIMA della battitura, come la
         scrittura 2 del difetto D (`statoDi`): la battitura resta nella pila di ⌘Z, sotto il gesto, e la scheda dice che
         la si riprende con ⌘Z. Si resta sulla scheda. Solo una battitura sul campo della nota: una correzione salvata su un
         altro campo (il titolo) non c'entra con «Prima» di questo e resta.
         Giro 2 ter (D1, difetto 1 del revisore): solo la battitura che il gesto stesso ha salvato, cioè in sospeso al
         momento del clic (§4.4). Una battitura salvata PRIMA del gesto — uscendo dal campo, o col Tab, dove conta lo stato
         a schermo al momento del tasto — non è «la battitura del gesto»: ripartire da prima di lei rifaceva una scelta che
         il docente aveva già annullato (l'Originale riscritto sopra una proposta scelta, poi «Tieni Originale» su un'altra
         nota: il testo tornava la proposta). Lì il nome «Tieni Originale» vale perché il testo salvato è l'Originale, e il
         gesto è un reject su quello stato. */
      const ub = st.ultimaBattitura;
      const scartata = !!(salvataDalGesto && primaDellaBattitura && tieniPrima && ub && ub.voce === battitura && ub.campi.has(String(laNota.target.field)));
      /* Settimo giro, punto 3: un gesto che non cambia la decisione della nota (la nota ha già quella scelta) non scrive
         e non entra nella pila. La battitura, se c'era, si è già salvata come sempre (R6): il no-op è solo del gesto.
         La riga di stato lo dice e, se il materiale è in conflitto, dice che lo si scioglie decidendo l'altra nota.
         Giro 2 ter (D4b, difetto 4b del revisore): non quando la battitura salvata dal clic si scarta (`scartata`, il nome
         era «Tieni Originale»): allora il gesto riporta lo stato di prima di lei, anche se la nota ha già quella scelta. */
      const gia = (prima.initial.decisions || {})[issueId];
      if (gia && gia.choice === choice && !scartata) {
        const nota = st.noteEl.get(issueId);
        if (nota && nota.focus) nota.focus();
        aggiornaNote();
        // ottavo giro: se prima del gesto si è salvata una battitura (R6), «niente da salvare» sarebbe falso
        const salvata = battitura ? t('rv_veste_correzione_salvata', 'La correzione nel campo è salvata.') + ' ' : '';
        // 0086, giro 3c: le note coi bottoni stanno solo sulle righe delle richieste del docente, dove la veste non trova
        // scelte in conflitto (D37.7: quelle righe prendono le spunte): la frase del conflitto (D30) non c'è più
        avvisa(battitura ? salvata + t('rv_veste_aveva_gia_scelta', 'La nota aveva già questa scelta.')
          : t('rv_veste_gia_scelta', 'Questa nota ha già questa scelta: non c’è niente da salvare.'));
        return;
      }
      /* Nono giro, D1 (Q13: «Va bene così» tiene il testo com'è ADESSO nel campo). Il docente ha scritto nel campo e ha
         premuto «Va bene così» senza uscirne: la battitura si è appena salvata (R6) e, con una nota sola, l'ha già chiusa
         come sua correzione. Il gesto non scrive altro: un «reject» la sovrascriverebbe, rimettendo il testo di partenza
         e perdendo la correzione. La scheda lo dice. Vale quando è stata la battitura a decidere la nota (la sua decisione
         è cambiata col salvataggio: aperta prima, o una proposta scelta che ha preso il ritocco) e non la lascia in
         conflitto; una battitura su un altro campo non la tocca, e il gesto resta quello di sempre. Se la nota è ancora
         aperta (più note: il suo passo è ancora nel testo, o non si individua), il gesto si scrive come sempre, sul testo
         salvato. Solo per «Va bene così»: «Tieni Prima» (D2), «Tieni il collegamento» e «Tieni il materiale» hanno il
         loro senso. */
      const vaBene = choice === 'reject' && !tieniPrima && !!laNota && !(laNota.target.field === '$item' && laNota.hasProposal && laNota.after === null) &&
        !(G1 && laNota.target.field === '$link');
      const decisaIn = r => own(r.initial.decisions || {}, issueId) ? r.initial.decisions[issueId] : undefined;
      const ridecisa = !!primaDellaBattitura && !uguali(decisaIn(primaDellaBattitura), decisaIn(prima));
      const chiusaDallaBattitura = ridecisa && vaBene && esito(laNota) !== 'pending';
      const notaInConflitto = chiusaDallaBattitura &&
        conflittiScelte(prima, id).some(c => String(c.issueId) === String(issueId) || String(c.otherIssueId) === String(issueId));
      if (chiusaDallaBattitura && !notaInConflitto) {
        const nota = st.noteEl.get(issueId);
        if (nota && nota.focus) nota.focus();
        aggiornaNote();
        avvisa(t('rv_veste_correzione_chiude_nota', 'La correzione nel campo è salvata e chiude questa nota: il testo resta com’è.'));
        return;
      }
      /* 0086, giro 3c: il ramo difensivo di «Tieni la tua versione» con la nota in conflitto (giro 2 bis, irraggiungibile) è
         tolto con le frasi del conflitto (D30–D35): con D37.7 una riga con scelte in conflitto prende le spunte. */
      // il ramo D2 (`scartata`, sopra): il gesto parte dallo stato di prima della battitura salvata dal clic
      let r;
      try {
        r = core.setDecision(scartata ? primaDellaBattitura : prima, issueId, choice, {});
        /* Terzo giro, difetto D (R6 con due note aperte sul campo, A.6): la battitura è diventata la correzione del
           docente, e il gesto su una nota la contraddirebbe. Il gesto è l'ultima parola: la scrittura 2 parte dallo
           stato di PRIMA della scrittura 1 e applica il gesto; la scrittura 1 resta nella pila, ⌘Z riporta lì.
           Quarto e quinto giro (punti 3 e 2; R6, «vince il clic, niente si perde»): si riparte da prima della battitura
           SOLO se così il gesto non lascia nessun conflitto sul materiale. Si prova rifacendolo, non leggendo
           `issueId`/`otherIssueId` del conflitto. Se il conflitto resta comunque — c'era già prima della battitura, o il
           gesto si scontra con un'altra scelta — ripartire toglierebbe la battitura senza guadagno: la battitura resta,
           il gesto si scrive com'è e il conflitto si vede come gli altri (⌘Z lo scioglie). */
        if (battitura && !scartata && conflittiScelte(r, id).length) {
          const rifatto = core.setDecision(statoDi(battitura, prima), issueId, choice, {});
          if (!conflittiScelte(rifatto, id).length) r = rifatto;
        }
      } catch (e) { avvisa(messaggioErrore((e && (e.code || e.message)) || 'errore', true)); return; }
      // difetto E: il fuoco passa alla nota PRIMA di ridisegnare, così i gesti della nota decisa non restano in vista
      const nota = st.noteEl.get(issueId);
      if (nota && nota.focus) nota.focus();
      if (G1) st.chiuseOra = null;
      registra(prima, [id], { tipo: 'nota', notaId: issueId, nota: laNota ? laNota.problem : '' }); imposta(r, [id]); E.save();
      aggiornaTutto();
      const el = st.noteEl.get(issueId);
      if (el && el.focus) el.focus();
      // la riga di stato dice che la battitura è ancora da salvare, dopo «Decisioni salvate» del gesto
      if (sospesa && (await attendi())) avvisa(t('rv_veste_battitura_da_salvare', 'La correzione nel campo non è ancora salvata: si salva quando esci dal campo, se le scelte del materiale non si contraddicono più.'));
      // nono giro, D2: dopo «Decisioni salvate» del gesto, la riga di stato dice dove è andata la battitura
      // undicesimo giro, Q18: l'area si nomina con la sua chiave («Originale»)
      if (scartata && (await attendi())) avvisa(t('rv_veste_tenuto_battitura', 'Tenuto «{area}»: la correzione scritta nel campo non vale. Premi {annulla} per riprenderla.').replace('{area}', () => ORIGINALE()).replace('{annulla}', ANNULLA));
      /* G1, rev. 3 p. 6: «la nota decide e si passa al successivo». Quando il nodo (o il collegamento) non ha più note
         aperte si apre la prossima riga da decidere; con una battitura ancora nel campo si resta, dopo «Tieni Prima» che ha
         lasciato una battitura nella pila (nono giro, D2: la scheda lo dice) si resta, e si resta se il gesto
         lascia due scelte in conflitto sulla riga (le parole riscritte e poi «Togli il collegamento», che il core non
         compone): la scheda dice il conflitto e i gesti per scioglierlo, la barra non lo saprebbe dire. */
      if (G1 && !sospesa && !scartata && st.attiva === id) {
        const x = rigaDi(id);
        const prossima = x && !x.daFare && !conflittiScelte(review(), id).length ? BC.successiva(navigabili(), id) : null;
        if (prossima) await vaiA(prossima.id);
      }
    }
    const escludi = () => unoAllaVolta(escludiUnaVolta);
    async function escludiUnaVolta() {
      const id = st.attiva;
      if (!id || !editabile() || occupato() || stantia()) return;
      /* giro 3d (D41): «Escludi» / «Ripristina» è un gesto sul materiale intero (D8) e registra prima la bozza del campo,
         come prima: escluso, il materiale non arriva all'allievo e la bozza non resterebbe ferma in un campo spento */
      if (!salvaAperto(true)) return;
      if (!(await attendi())) return;
      const fuori = anteprima(id).escluso, prima = review();
      // 0086 (§4.9, D8): con la nota sola d'esclusione e nessun'altra decisione attiva, «Escludi» decide la nota (dopo il
      // salvataggio qui sopra, quindi contando la battitura che si è appena salvata)
      const nota = fuori ? null : notaDaEscludere();
      let r;
      try {
        r = nota ? core.setDecision(prima, nota.id, 'accept', {})
          : core.setItemExcluded(prima, id, !fuori, { problem: t('rv_teacher_exclusion', 'Esclusione decisa dal docente') });
      }
      catch (e) { avvisa(messaggioErrore((e && (e.code || e.message)) || 'errore', true)); return; }
      registra(prima, [id], { tipo: fuori ? 'ripristino' : 'esclusione' }); imposta(r, [id]); E.save();
      aggiornaTutto();
      if (st.bar && st.bar.escludi.focus) st.bar.escludi.focus();
    }
    /* 0086 (§4.9, D8, Giacomo: «Sì, qui», «Quello della barra»): il doppione «Escludi» / «Escludi il materiale» di G2.
       Giro 3c (§4.10; ADR 0012 rev. 12, punto 9): le note non hanno più bottoni, e «Escludi» della barra, con una nota
       d'esclusione del controllo aperta e nessun'altra decisione attiva sul materiale — nessuna correzione salvata, nessuna
       proposta scelta, nessuna esclusione, nessuna scelta in conflitto, nessuna battitura in sospeso —, vale come la sua
       spunta tolta, registrato subito perché è un gesto suo: decide la nota (accept, «Esclusione scelta»), senza
       un'esclusione del docente. Le altre note aperte restano com'erano, sospese dall'esclusione (prima con un'altra nota
       aperta si prendeva la strada di oggi). Altrimenti la strada di oggi (`setItemExcluded`, che mette in sospeso le altre
       decisioni invece di farle confliggere). La nota, o null. */
    function notaDaEscludere() {
      if (G1 || !st.attiva || sospese().length || conflittiDi(st.info).size) return null;
      const id = st.attiva;
      const sue = noteDi(id).filter(i => i.origin !== 'teacher' && esclusioneProposta(i) && esito(i) === 'pending');
      const n = sue.length === 1 ? sue[0] : null;
      if (!n) return null;
      return noteDi(id).some(i => i.id !== n.id && ['applied', 'edited', 'excluded'].indexOf(esito(i)) >= 0) ? null : n;
    }
    // Il perché il bottone del materiale è spento; null se si può premere.
    function motivoBottone(id) {
      const x = rigaDi(id);
      if (!x || x.assente || !editabile() || stantia()) return '';
      const a = anteprima(id);
      if (a.escluso) return '';
      const invalido = st.campi.find(c => c.invalido);
      if (invalido) return invalido.invalido;
      const aperte = noteDi(id).filter(i => esito(i) === 'pending').length;
      if (aperte) return aperte === 1 ? t('rv_veste_decidi_nota', 'Prima decidi la nota') : t('rv_veste_decidi_note', 'Prima decidi le {n} note').replace('{n}', aperte);
      // 0086, giro 3c: un materiale con scelte salvate in conflitto prende le spunte e il bottone le sostituisce (D37.7,
      // `fondoAttivo`): qui ci arriva solo un'anteprima che non si legge per un'altra ragione
      if (!a.ok) return t('rv_coverage_approve_blocked', 'Risolvi prima le decisioni in conflitto: serve l’anteprima del materiale.');
      // giro 2, difetto 3: un materiale strutturalmente non valido non diventa «Rivisto» né «Approvato»
      if (a.invalido.length) return a.invalido[0];
      return null;
    }
    // «Rivisto» se il testo che arriverà all'allievo differisce da quello generato, «Approvato» altrimenti (rev. 5, A.2).
    function itemASchermo() {
      const a = anteprima(st.attiva), it = clone((a && a.item) || st.itemAdesso || base(st.attiva)) || {};
      st.campi.forEach(c => { if (c.dirty) c.voci().forEach(v => { it[v.field] = clone(v.valore); }); });
      return it;
    }
    const nomeBottone = () => BC.esitoBottone(base(st.attiva), itemASchermo()) === 'rivisto' ? t('rv_veste_rivisto', 'Rivisto') : t('rv_veste_approvato', 'Approvato');
    /* Giro 2, difetto 2: un gesto per pressione. Un secondo `premi` mentre il primo è in corso non parte; il
       doppio clic e il tasto tenuto premuto li scartano già `bottone.onclick` (detail > 1) e `tasto` (repeat). */
    // 0086, giro 3b: in G1 il bottone della barra è il bottone in fondo della scheda con le spunte (`fondoUnaVolta`) o, su un
    // non letto, «Va bene così» (Q10); si sceglie al clic. Giro 3c: anche in G2, dove è il bottone del materiale
    const premi = () => unoAllaVolta(() => (fondoAttivo() ? fondoUnaVolta() : G1 ? vaBeneUnaVolta() : premiUnaVolta()));
    /* Sesto giro, Q10 (gate 3 di Giacomo, 07/10: un collegamento non letto con le parole giuste diventava verde solo
       cambiando il chip e rimettendolo): «Va bene così» su un non letto. Salva prima la battitura (R1: se c'era, la riga è
       decisa dalla correzione e la spunta non serve); poi registra la spunta con `setManualCheck` del core, legata
       all'impronta del testo mostrato, e nessuna segnalazione. È una voce della pila (⌘Z la toglie, ⇧⌘Z la rimette). Poi,
       come «Rivisto»/«Approvato» di G2 e come la nota che decide, si passa alla riga dopo: la prima da decidere o non letta
       ancora senza spunta. Un secondo clic su una riga già segnata non scrive. */
    async function vaBeneUnaVolta() {
      const id = st.attiva;
      if (!id || !editabile() || occupato() || stantia()) return;
      if (!salvaAperto()) return;
      if (!(await attendi())) return;
      const x = rigaDi(id);
      if (!x || x.tipo !== 'non-letto' || x.conflitto || x.sospesa) return;
      if (!x.fatto) {
        const prima = review(), impronta = improntaVaBene(x);
        if (!impronta) return;
        let r;
        try { r = core.setManualCheck(prima, chiaveVaBene(x), impronta); }
        catch (e) { avvisa(messaggioErrore((e && (e.code || e.message)) || 'errore', true)); return; }
        spegniEvidenza(); st.chiuseOra = null;
        registra(prima, [id], { tipo: 'bottone', nome: VA_BENE() }); imposta(r, [id]); E.save();
        aggiornaTutto();
        if (!(await attendi())) return;
      }
      const lista = navigabili().map(y => y.tipo === 'non-letto' ? Object.assign({}, y, { daFare: !y.fatto }) : y);
      const prossima = BC.successiva(lista, id);
      if (prossima) await vaiA(prossima.id);
      else aggiornaAzioni();
    }
    async function premiUnaVolta() {
      const id = st.attiva;
      if (!id || !editabile() || occupato()) return;
      if (!salvaAperto()) return;
      if (!(await attendi())) return;
      const motivo = motivoBottone(id);
      if (motivo !== null) { if (motivo) avvisa(motivo); return; }
      const a = anteprima(id), prima = review(), fatte = prima.initial.manualChecks || {};
      if (!(own(fatte, id) && fatte[id] && fatte[id].impronta === a.impronta)) {
        // l'impronta del testo salvato, come `statoApprovazioni`: decade da sé se il testo cambia per un'altra strada
        registra(prima, [], { tipo: 'bottone', nome: nomeBottone() }); imposta(core.setManualCheck(prima, id, a.impronta), []); E.save();
        elenco(); aggiornaContorno(); aggiornaAzioni();
        if (!(await attendi())) return;
      }
      const prossima = BC.successiva(navigabili(), id);
      if (prossima) await vaiA(prossima.id);
      else aggiornaAzioni();
    }

    /* ── la barra ─────────────────────────────────────────────────────────── */
    function segnoRiga(x) {
      // G1: deciso (la spunta dello 0053), da decidere (il pallino), non letto dal controllo (il cerchio vuoto, B.2)
      // sesto giro, Q10: la spunta di «Va bene così» dice da dove viene
      if (G1 && x.stato === 'fatto') return '<span class="mrv-teacher-approved" role="img" aria-label="' + esc(x.bene ? VA_BENE() : t('rv_veste_g1_deciso', 'Deciso')) + '">' + SVG_SPUNTA + '</span>';
      if (G1 && x.stato === 'non-letto') return '<span class="mrv-veste-cerchio" role="img" aria-label="' + esc(t('rv_veste_g1_non_letto', 'Non letto dal controllo')) + '"></span>';
      if (G1 && x.stato === 'fuori') return '';
      if (x.stato === 'escluso') return '<span class="mrv-veste-escluso" role="img" aria-label="' + esc(t('rv_material_excluded', 'Escluso')) + '">' + SVG_ESCLUSO + '</span>';
      if (x.stato === 'rivisto' || x.stato === 'approvato') return '<span class="mrv-teacher-approved" role="img" aria-label="' +
        esc(x.stato === 'rivisto' ? t('rv_veste_rivisto', 'Rivisto') : t('rv_veste_approvato', 'Approvato')) + '">' + SVG_SPUNTA + '</span>';
      if (x.stato === 'assente') return '';
      return '<span class="mrv-pallino" role="img" aria-label="' + esc(t('rv_review_needed', 'Revisione necessaria')) + '"></span>';
    }
    function vestiRiga(b, x) {
      const it = G1 ? null : base(x.id);
      const titolo = G1 ? String(x.titolo || x.id) : x.assente ? x.id + ' · ' + t('rv_veste_assente_breve', 'non nella bozza') : mostra(x.titolo || (it && (it.title || it.question || it.text)) || '', it);
      // giro 2, difetto 3: la riga di un materiale strutturalmente non valido è segnata, e lo dice (in G1 non c'è)
      const invalido = !G1 && !x.assente && x.stato !== 'escluso' && anteprima(x.id).invalido.length > 0;
      const html = '<span class="mrv-veste-segno">' + segnoRiga(x) + '</span><span class="mrv-veste-num">' + esc(x.n == null ? '' : x.n) + '</span>' +
        '<span class="mrv-veste-titolo">' + esc(titolo) + '</span>' + (x.noteAperte ? '<span class="mrv-veste-note">' + esc(contaNote(x.noteAperte)) + '</span>' : '') +
        (invalido ? '<span class="mrv-veste-note mrv-veste-errore">' + esc(t('rv_veste_da_correggere', 'da correggere')) + '</span>' : '') +
        // G1, D2: la riga in conflitto dice perché è ancora da rivedere
        (G1 && x.conflitto ? '<span class="mrv-veste-note mrv-veste-errore">' + esc(t('rv_decision_conflict', 'Scelte in conflitto')) + '</span>' : '');
      if (b.getAttribute('data-invalido') !== String(invalido)) b.setAttribute('data-invalido', String(invalido));
      if (b.getAttribute('data-stato') !== x.stato) b.setAttribute('data-stato', x.stato);
      if (b.getAttribute('aria-current') !== String(x.id === st.attiva)) b.setAttribute('aria-current', String(x.id === st.attiva));
      if (b.getAttribute('title') !== titolo) b.setAttribute('title', titolo);
      if (b.vesteHtml !== html) { b.innerHTML = html; b.vesteHtml = html; }
    }
    function bottoneRiga(x) {
      const b = doc.createElement('button');
      b.type = 'button'; b.className = 'mrv-queue-item mrv-veste-riga';
      b.setAttribute('data-veste-riga', x.id);
      vestiRiga(b, x);
      b.onclick = () => vaiA(x.id);
      return b;
    }
    /* L'elenco si aggiorna SUL POSTO quando le righe in vista sono le stesse: uscire da un campo salva, e
       un clic su un'altra riga parte proprio da quell'uscita — se la riga sotto il dito venisse ricostruita
       fra la pressione e il rilascio, il clic andrebbe perso. Si ricostruisce solo quando cambia la forma. */
    function disegnaBarra() {
      const out = righe(), coda = modal.querySelector('#mrv-queue');
      const piano = [];
      const gruppo = (chiave, testoGruppo, lista) => {
        if (!lista.length) return;
        piano.push({ chiave: 'g:' + chiave, gruppo: chiave, testo: testoGruppo });
        lista.forEach(x => piano.push({ chiave: 'r:' + x.id, riga: x }));
      };
      out.gruppi.forEach(g => gruppo(g.tipo, g.testo || tipoGruppo(g.tipo) + ' · ' + g.daRivedere + ' ' + t('rv_veste_di', 'di') + ' ' + g.totale, g.righe.filter(visibile)));
      gruppo('assenti', t('rv_veste_gruppo_assenti', 'Non nella bozza') + ' · ' + out.assenti.length, out.assenti.filter(visibile));
      if (!piano.length) piano.push({ chiave: 'vuoto:' + st.filtro + (st.cerca || st.area ? ':filtrato' : ''), vuoto: true });
      const stessa = st.barra && st.barra.length === piano.length && st.barra.every((v, k) => v.chiave === piano[k].chiave);
      if (stessa) {
        piano.forEach((p, k) => {
          const el = st.barra[k].el;
          if (p.riga) vestiRiga(el, p.riga);
          else if (p.gruppo && el.textContent !== p.testo) el.textContent = p.testo;
        });
      } else {
        const fuoco = doc.activeElement && doc.activeElement.getAttribute ? doc.activeElement.getAttribute('data-veste-riga') : null;
        const scorri = coda.scrollTop;
        coda.replaceChildren();
        st.barra = piano.map(p => {
          let el;
          if (p.riga) el = bottoneRiga(p.riga);
          else if (p.gruppo) { el = doc.createElement('p'); el.className = 'mrv-veste-gruppo'; el.setAttribute('data-veste-gruppo', p.gruppo); el.textContent = p.testo; }
          else {
            el = doc.createElement('p'); el.className = 'mrv-veste-vuoto';
            el.textContent = G1 ? (st.filtro === 'fatti' && !st.cerca && !st.area ? t('rv_veste_g1_niente_fatto', 'Nessun nodo o collegamento ancora deciso.') :
              st.filtro === 'da-rivedere' && !st.cerca && !st.area ? t('rv_veste_g1_niente_da_rivedere', 'Nessun nodo o collegamento da decidere.') : t('rv_veste_g1_niente_trovato', 'Nessuna riga corrisponde.'))
              : st.filtro === 'fatti' && !st.cerca && !st.area ? t('rv_veste_niente_fatto', 'Nessun materiale ancora fatto.') :
                st.filtro === 'da-rivedere' && !st.cerca && !st.area ? t('rv_veste_niente_da_rivedere', 'Nessun materiale da rivedere.') : t('rv_veste_niente_trovato', 'Nessun materiale corrisponde.');
          }
          coda.appendChild(el);
          return { chiave: p.chiave, el };
        });
        coda.scrollTop = scorri;
        const b = fuoco ? st.barra.find(v => v.chiave === 'r:' + fuoco) : null;
        if (b && b.el.focus) b.el.focus();
      }
      if (st.filtro === 'da-rivedere') st.visti = new Set(piano.filter(p => p.riga).map(p => p.riga.id));
      const conta = { 'da-rivedere': out.riepilogo.daRivedere, fatti: out.righe.filter(x => x.fatto).length, tutti: out.righe.length };
      const nomi = { 'da-rivedere': t('rv_filter_pending', 'Da rivedere'), fatti: t('rv_veste_filtro_fatti', 'Fatti'), tutti: t('rv_veste_filtro_tutti', 'Tutti') };
      modal.querySelectorAll('[data-veste-filtro]').forEach(b => {
        const k = b.getAttribute('data-veste-filtro');
        b.textContent = nomi[k] + ' ' + conta[k];
        b.setAttribute('aria-pressed', String(st.filtro === k));
        b.className = st.filtro === k ? 'pm-btn-primary' : 'pm-btn-cancel';
      });
    }
    function disegnaAree() {
      const sel = modal.querySelector('#mrv-area');
      if (!sel) return;
      const aree = new Map();
      righe().tutte.forEach(x => areeDi(x.id).forEach(a => { if (a && a.id != null) aree.set(String(a.id), a.label); }));
      sel.innerHTML = '<option value="">' + esc(t('rv_context_all_areas', 'Tutte le macroaree')) + '</option>' +
        Array.from(aree).sort((a, b) => String(a[1]).localeCompare(String(b[1]))).map(([id, label]) => '<option value="' + esc(id) + '">' + esc(label) + '</option>').join('');
      sel.value = st.area;
    }
    // Testata (riepilogo della revisione 2 letto con la revisione 5, A.3) e piede.
    function aggiornaContorno() {
      if (G1) return contornoG1();
      const out = righe(), q = out.riepilogo, fatti = q.rivisti + q.approvati + q.esclusi, tot = out.righe.length;
      disegnaBarra();
      const etichetta = modal.querySelector('#mrv-progress-label');
      if (etichetta) etichetta.textContent = fatti + ' / ' + tot + ' ' + t('rv_veste_fatti', 'fatti');
      const barra = modal.querySelector('#mrv-progress');
      if (barra) barra.setAttribute('value', tot ? Math.round(fatti / tot * 100) : 100);
      /* Quinto giro, punto 3: la testata conta sugli stessi materiali di «generati»; le Schede nodi, esenti, si nominano
         a parte quando ce n'è da rivedere. Il piede («Restano N…»), i filtri e l'avanzamento contano tutto ciò che
         ferma la chiusura, Schede nodi comprese. */
      const generati = out.righe.filter(x => x.tipo !== 'nodesheet'), schede = out.righe.filter(x => x.tipo === 'nodesheet' && x.daFare).length;
      if (st.riepilogo) st.riepilogo.textContent = q.generati + ' ' + t('rv_veste_generati', 'generati') + ' · ' + q.verificati + ' ' + t('rv_veste_verificati', 'verificati dal controllo') +
        ' · ' + generati.filter(x => x.daFare).length + ' ' + t('rv_veste_da_rivedere', 'da rivedere') +
        ' · ' + generati.filter(x => x.stato === 'rivisto' || x.stato === 'approvato').length + ' ' + t('rv_veste_rivisti_approvati', 'rivisti e approvati') +
        (schede ? ' · ' + (schede === 1 ? t('rv_veste_scheda_da_rivedere', '1 scheda dei nodi da rivedere') : t('rv_veste_schede_da_rivedere', '{n} schede dei nodi da rivedere').replace('{n}', schede)) : '');
      const voce = modal.querySelector('#mrv-filter-count');
      if (voce) voce.textContent = q.daRivedere + ' ' + t('rv_veste_da_rivedere', 'da rivedere') + ' · ' + fatti + ' ' + t('rv_veste_fatti', 'fatti');
      const r = review();
      let frase;
      if (!editabile()) {
        /* 0097 (gate del 15/10): approvata ma superata, la testa diceva «non corrispondono» e il piè «approvata». Il piè
           dice la frase che usa già, nello stesso caso, per una revisione in attesa. */
        frase = r.initial.status === 'approved' && stantia() ? t('rv_coverage_preview_global', 'I materiali o le fonti non corrispondono alla versione di questa revisione. Le approvazioni restano salvate, ma prima di continuare occorre riaprire la revisione sulla versione corretta del progetto.')
          : r.initial.status === 'approved' ? t('rv_dashboard_approved', 'La revisione è approvata e le decisioni sono salvate nel progetto.')
          : t('rv_veste_in_corso', 'Le decisioni si stanno salvando nel progetto: la revisione si legge e non si modifica.');
      } else {
        const g = globale(), n = out.assenti.length;
        /* Che cosa copre la casella (R5, R10). Con righe in barra la frase dice quale parte scoperta nessuna riga
           rappresenta; senza righe restano le frasi di R5 («qui non c'è niente da decidere materiale per materiale»). */
        const copre = !serveConferma() ? '' : out.righe.length
          ? (n === 1 ? t('rv_veste_r10_assente', '1 materiale che il rapporto attendeva non è nella bozza salvata e nessuna riga lo rappresenta: per completare i materiali conferma di averlo verificato.')
            : n ? t('rv_veste_r10_assenti', '{n} materiali che il rapporto attendeva non sono nella bozza salvata e nessuna riga li rappresenta: per completare i materiali conferma di averli verificati.').replace('{n}', n)
              : t('rv_veste_r10_parziale', 'Il controllo automatico è parziale e nessuna riga rappresenta la parte non controllata: per completare i materiali conferma di averla verificata.'))
          : n === 1 ? t('rv_veste_r5_assente', 'Il controllo automatico è parziale: 1 materiale che il rapporto attendeva non è nella bozza salvata, e qui non c’è niente da decidere materiale per materiale. Per completare i materiali conferma di averli verificati.')
            : n ? t('rv_veste_r5_assenti', 'Il controllo automatico è parziale: {n} materiali che il rapporto attendeva non sono nella bozza salvata, e qui non c’è niente da decidere materiale per materiale. Per completare i materiali conferma di averli verificati.').replace('{n}', n)
              : t('rv_veste_r5_niente', 'Il controllo automatico è parziale, e qui non c’è niente da decidere materiale per materiale. Per completare i materiali conferma di averli verificati.');
        /* Sesto giro, punto 4: il piede conta tutto ciò che ferma la chiusura e nomina a parte le Schede nodi (le stesse
           chiavi della testata): «Resta 1 materiale da rivedere. Resta 1 scheda dei nodi da rivedere.» */
        const m = generati.filter(x => x.daFare).length;
        const restanoMateriali = m === 1 ? t('rv_veste_resta_uno', 'Resta 1 materiale da rivedere.') : m ? t('rv_veste_restano', 'Restano {n} materiali da rivedere.').replace('{n}', m) : '';
        const restanoSchede = !schede ? '' : (schede === 1 ? t('rv_veste_resta_x', 'Resta {x}.') : t('rv_veste_restano_x', 'Restano {x}.'))
          .replace('{x}', schede === 1 ? t('rv_veste_scheda_da_rivedere', '1 scheda dei nodi da rivedere') : t('rv_veste_schede_da_rivedere', '{n} schede dei nodi da rivedere').replace('{n}', schede));
        const avanzamento = stantia() ? t('rv_coverage_preview_global', 'I materiali o le fonti non corrispondono alla versione di questa revisione. Le approvazioni restano salvate, ma prima di continuare occorre riaprire la revisione sulla versione corretta del progetto.')
          : q.daRivedere ? [restanoMateriali, restanoSchede].filter(Boolean).join(' ')
            : !g.ok ? t('rv_veste_sospese', 'Restano note da decidere o scelte in conflitto: cerca le righe con le note.')
              : copre ? '' : t('rv_veste_fine', 'Hai rivisto tutti i materiali: completali col bottone in fondo.');
        frase = [avanzamento, copre].filter(Boolean).join(' ');
      }
      piede(frase);
      E.proceed.hidden = !puoChiudere();
      E.proceed.textContent = E.testoChiusura();
    }
    /* R5 e R10 (Giacomo, 05/10): col controllo parziale, una parte scoperta che nessuna riga rappresenta — materiali
       che il rapporto attendeva e la bozza non ha, oppure nessun materiale residuo in barra — chiede la casella «Ho
       verificato personalmente…» nel piede, come G1 (rev. 4, B.1), anche se in barra ci sono altre righe (correzioni
       del docente, segnalazioni): le righe si cliccano una per una, la casella copre solo ciò che nessuna riga
       rappresenta. Con le parti scoperte tutte in barra non c'è (R4). Senza la casella spuntata G2 non si chiude, e
       `manualReview` si registra solo con la casella o coi residui tutti cliccati. */
    function serveConferma() {
      // G1 (rev. 4, B.1): a decisioni finite, se il controllo non è completo (`chiusura` del core)
      // D2: e solo se l'anteprima della mappa riesce (scelte in conflitto: prima si sciolgono)
      if (G1) return editabile() && !stantia() && chiusuraG1().serveConferma && righe().riepilogo.daRivedere === 0 && !!globale().ok;
      if (!editabile() || review().initial.checkStatus === 'completed' || stantia()) return false;
      const out = righe();
      return out.assenti.length > 0 || !out.righe.some(x => x.residuo);
    }
    function piede(frase) {
      const passo = modal.querySelector('#mrv-next-step');
      if (!passo) return;
      if (!st.passo) { passo.replaceChildren(); st.passo = doc.createElement('span'); st.passo.setAttribute('data-veste-passo', ''); passo.appendChild(st.passo); }
      st.passo.textContent = frase;
      const frase1 = G1 ? testoConferma() : t('rv_manual_confirm', 'Ho verificato personalmente anche le parti non coperte dal controllo automatico e approvo i contenuti.');
      if (serveConferma() && !st.conferma) {
        const label = doc.createElement('label'); label.className = 'mrv-veste-conferma';
        label.innerHTML = '<input type="checkbox" id="mrv-veste-conferma"> <span>' + esc(frase1) + '</span>';
        const casella = label.querySelector('#mrv-veste-conferma');
        casella.onchange = () => { st.confermato = !!casella.checked; E.proceed.hidden = !puoChiudere(); };
        passo.appendChild(label); st.conferma = label; st.confermato = false;
      } else if (!serveConferma() && st.conferma) { st.conferma.remove(); st.conferma = null; st.confermato = false; }
      // G1: la frase segue il rapporto (dopo «Riprova» le parti non lette cambiano)
      if (G1 && st.conferma) { const sp = st.conferma.querySelector('span'); if (sp && sp.textContent !== frase1) sp.textContent = frase1; }
      if (G1) riprovaNelPiede(passo);
    }
    /* G1, rev. 4 B.1 e B.6 (Giacomo: «rendi il comando meno nascosto»): «Riprova il controllo automatico» nella stessa riga
       della casella, un gesto distinto dal bottone finale; non si offre quando il controllo non può riuscire
       (`riprovaPuoRiuscire` falso: la fonte oltre il tetto). Salva prima il campo aperto; dopo, la pila riparte vuota. */
    function riprovaNelPiede(passo) {
      const serve = serveConferma() && chiusuraG1().riprovaPuoRiuscire;
      if (serve && !st.riprova) {
        const b = doc.createElement('button'); b.type = 'button'; b.id = 'mrv-retry-judge'; b.className = 'pm-btn-cancel mrv-veste-riprova';
        b.textContent = t('rv_retry_judge', 'Riprova il controllo automatico');
        b.onclick = async () => {
          if (occupato()) return;
          if (!salvaAperto()) return;
          const ok = await E.riprova();
          if (ok) { st.pila = []; st.rifare = []; }
          aggiornaAzioni();
        };
        passo.appendChild(b); st.riprova = b;
      } else if (!serve && st.riprova) { st.riprova.remove(); st.riprova = null; }
    }
    const chiusuraG1 = () => BC.chiusura(review().initial.report, review().initial.checkStatus);
    const plurale = (n, uno, molti) => n === 1 ? uno : molti.replace('{n}', n);
    /* G1: la frase della casella secondo `chiusura().forma` (tre frasi). 'parziale' nomina quante parti il controllo non ha
       letto, nodi e collegamenti; 'niente' e 'limiti-testo' dicono il caso.
       Q8 (giro del 07/10, Giacomo: «Allinearli qui»): il conto è quello della barra — i «Non letti dal controllo» di
       `righeMappa`, cioè le parti che l'ultimo rapporto dice saltate (`copertura.nodiSaltati`, `linkSaltati`) senza
       doppioni e senza quelle che hanno già una riga fra i segnalati — con le stesse parole della testata. Prima la
       casella contava il rapporto grezzo («7 nodi, 18 collegamenti» contro «19 parti non lette» in testata). */
    const nonLette = () => righe().righe.filter(x => x.tipo === 'non-letto');
    const quanteNonLette = n => plurale(n, t('rv_veste_g1_una_parte', '1 parte non letta dal controllo'), t('rv_veste_g1_n_parti', '{n} parti non lette dal controllo'));
    function testoConferma() {
      const c = chiusuraG1();
      if (c.forma === 'niente') return t('rv_veste_g1_conferma_niente', 'Il controllo automatico non ha letto la mappa: ho verificato personalmente nodi e collegamenti e approvo i contenuti.');
      if (c.forma === 'limiti-testo') return t('rv_veste_g1_conferma_limiti', 'Ho verificato personalmente i contenuti nei punti in cui il testo estratto dalla fonte ha dei limiti (pagine vuote o ordine incerto) e li approvo.');
      const saltate = nonLette(), n = saltate.filter(x => x.oggetto !== 'collegamento').length, l = saltate.length - n;
      if (!saltate.length) return t('rv_veste_g1_conferma_parziale', 'Ho verificato personalmente anche le parti che il controllo automatico non ha letto e approvo i contenuti.');
      const dettaglio = [n ? plurale(n, t('rv_veste_g1_un_nodo', '1 nodo'), t('rv_veste_g1_n_nodi', '{n} nodi')) : '',
        l ? plurale(l, t('rv_veste_g1_un_collegamento', '1 collegamento'), t('rv_veste_g1_n_collegamenti', '{n} collegamenti')) : ''].filter(Boolean).join(', ');
      const parti = plurale(saltate.length, t('rv_veste_g1_la_parte', 'la parte non letta dal controllo'), t('rv_veste_g1_le_parti', 'le {n} parti non lette dal controllo'));
      return t('rv_veste_g1_conferma_non_lette', 'Ho verificato personalmente anche {parti} ({dettaglio}) e approvo i contenuti.')
        .replace('{parti}', () => parti).replace('{dettaglio}', () => dettaglio);
    }
    /* G1: testata (decisi su segnalati, il riepilogo della mappa) e piede. Il piede conta le righe con note aperte; a
       decisioni finite la casella (se il controllo non è completo) o «Hai deciso tutto»; in coda la frase dello strato. */
    function contornoG1() {
      const out = righe(), q = out.riepilogo;
      disegnaBarra();
      const etichetta = modal.querySelector('#mrv-progress-label');
      if (etichetta) etichetta.textContent = q.decisi + ' / ' + q.segnalati + ' ' + t('rv_veste_g1_decisi', 'decisi');
      const barra = modal.querySelector('#mrv-progress');
      if (barra) barra.setAttribute('value', q.segnalati ? Math.round(q.decisi / q.segnalati * 100) : 100);
      const nodi = (dbMappa().nodes || []).length;
      if (st.riepilogo) st.riepilogo.textContent = [plurale(nodi, t('rv_veste_g1_un_nodo', '1 nodo'), t('rv_veste_g1_n_nodi', '{n} nodi')),
        plurale(q.segnalati, t('rv_veste_g1_un_segnalato', '1 segnalato'), t('rv_veste_g1_n_segnalati', '{n} segnalati')),
        q.nonLetti ? quanteNonLette(q.nonLetti) : ''].filter(Boolean).join(' · ');
      const voce = modal.querySelector('#mrv-filter-count');
      if (voce) voce.textContent = q.daRivedere + ' ' + t('rv_veste_da_rivedere', 'da rivedere') + ' · ' + q.decisi + ' ' + t('rv_veste_g1_decisi', 'decisi');
      const r = review();
      let frase;
      if (!editabile()) {
        /* 0097 (gate del 15/10, seconda decisione di Giacomo): approvata ma superata, il piè dice che cosa fare — il bottone
           accanto è «Ricontrolla la mappa adesso» (`testoChiusura` in mappai-review.js) — e non «approvata» */
        frase = r.initial.status === 'approved' && stantia() ? t('rv_veste_g1_approvata_cambiata', 'La mappa è cambiata, per continuare premi «Ricontrolla la mappa adesso». Le decisioni approvate restano salvate.')
          : r.initial.status === 'approved' ? t('rv_dashboard_approved', 'La revisione è approvata e le decisioni sono salvate nel progetto.')
          : t('rv_veste_in_corso', 'Le decisioni si stanno salvando nel progetto: la revisione si legge e non si modifica.');
      } else {
        const g = globale(), n = q.daRivedere, inConflitto = out.righe.some(x => x.conflitto);
        /* 0123, lotto 3 (0056): in attesa e la mappa cambiata, il bottone accanto è «Ricontrolla la mappa adesso»
           (`testoChiusura` in mappai-review.js): il piè dice che cosa fa, e che le scelte restano nella revisione di prima */
        const avanzamento = stantia() ? t('rv_veste_g1_attesa_cambiata', 'La mappa è cambiata dopo il controllo. Per continuare premi «Ricontrolla la mappa adesso»: il controllo riparte sulla mappa di adesso, e le scelte fatte fin qui restano nella revisione di prima.')
          // D2: fra le righe da rivedere ce n'è una con le scelte in conflitto
          : n && inConflitto ? plurale(n, t('rv_veste_g1_resta_conflitto', 'Resta 1 fra nodi e collegamenti con note aperte o scelte in conflitto.'), t('rv_veste_g1_restano_conflitto', 'Restano {n} fra nodi e collegamenti con note aperte o scelte in conflitto.'))
          : n ? plurale(n, t('rv_veste_g1_resta_una', 'Resta 1 fra nodi e collegamenti con note aperte.'), t('rv_veste_g1_restano_righe', 'Restano {n} fra nodi e collegamenti con note aperte.'))
            /* terzo giro, punto 4: con l'anteprima che non riesce e nessuna riga da rivedere, nessuna riga è segnata (un
               conflitto senza nota, una nota sospesa senza riga): non si manda a cercare righe che non ci sono, si dice
               che cosa fare */
            : !g.ok ? t('rv_veste_g1_sospese_senza_riga', 'Le decisioni non si possono ancora applicare alla mappa, ma nessuna riga dell’elenco ne è la causa: chiudi con {piu_tardi} e riapri la revisione. Le decisioni prese restano salvate.').replace('{piu_tardi}', () => PIU_TARDI())
              : serveConferma() ? '' : t('rv_dashboard_can_finish', 'Hai deciso tutto: puoi concludere col bottone in fondo.');
        let piedeStrato = '';
        // 0123, lotto 3b: con la mappa cambiata il piè lo ha già detto, lo strato dice solo che cosa vale per i materiali
        try { piedeStrato = E.strato ? E.strato.piede({ breve: stantia() }) : ''; } catch (e) { piedeStrato = ''; }
        frase = [avanzamento, piedeStrato].filter(Boolean).join(' ');
      }
      piede(frase);
      E.proceed.hidden = !puoChiudere();
      E.proceed.textContent = E.testoChiusura();
      aggiornaStrato();
    }
    // «Salva le decisioni e completa i materiali»: nessuna riga da rivedere e `preview` globale riuscito (§4.10); con R5 la casella.
    function puoChiudere() {
      if (!editabile()) return true;
      // 0123, lotto 3: G1 in attesa e la mappa cambiata — il bottone è «Ricontrolla la mappa adesso», sempre premibile
      if (G1 && stantia()) return true;
      if (serveConferma() && !st.confermato) return false;
      return righe().riepilogo.daRivedere === 0 && !!globale().ok;
    }

    /* ── G1, la sezione «Il controllo» (Q2: «Sezione chiusa in barra») ─────────
       In fondo alla barra, chiusa all'apertura (è il riquadro «Copertura del controllo» di prima, rinominato): lo stato
       del controllo, la legenda, la traccia e la storia del giudice, il blocco dello strato delle affermazioni (0042 e
       «Frasi della fonte rimaste fuori» dello 0041), «Nuovo controllo con i modelli del Setup» (solo se il controllo
       può riuscire) e il recupero della bozza. I pezzi li costruisce R.open (`E.controllo`), come nel Banco di prima.
       Settimo giro, Q14 (Giacomo al gate 3, 07/10: «alcuni item devono essere inseriti in sezioni collassabili altrimenti il
       docente si spaventa»): in vista resta UNA riga — l'esito del controllo e «Nuovo controllo con i modelli del Setup»
       (solo se può riuscire); il resto sta in tre parti chiuse, in quest'ordine: «Frasi tenute fuori dai materiali» (il
       blocco dello strato, solo se c'è; ottavo giro, Q14 a: era «Frasi della fonte rimaste fuori»), «Bozza conservata»
       (solo se c'è una bozza), «Dettagli tecnici del controllo» (il messaggio del controllo, la legenda, che cosa vuol dire
       «non letto», la traccia e la storia del giudice). Niente si perde: cambia solo il posto. Ottavo giro, Q14 (b) e (c):
       l'esito nella riga è il messaggio del controllo (con «La revisione è stata completata dal docente.» quando c'è), non
       più «Parziale · N parti non lette», che ripeteva il titolo della sezione parola per parola; il conto resta nel titolo.
       `#mrv-coverage-status` e `#mrv-manual` (del markup di R.open, condiviso col Banco di prima) qui restano vuoti. */
    function coperturaG1() {
      const r = review(), C = E.controllo || {};
      const pezzi = f => { try { return (typeof f === 'function' && f()) || []; } catch (e) { return []; } };
      const stato = modal.querySelector('#mrv-coverage-status');
      if (stato) { stato.textContent = ''; stato.hidden = true; }
      const manuale = modal.querySelector('#mrv-manual');
      if (manuale) { manuale.replaceChildren(); manuale.hidden = true; }
      const dettagli = modal.querySelector('#mrv-coverage-details');
      st.bloccoStrato = null; st.parteFuori = null;
      if (!dettagli) return aggiornaStrato();
      dettagli.replaceChildren();
      // la riga sempre in vista: l'esito (lo scrive `aggiornaStrato`) e il bottone; l'anteprima del nuovo controllo sotto
      const esito = doc.createElement('div'); esito.className = 'mrv-veste-controllo-esito'; esito.setAttribute('data-veste-controllo-esito', '');
      const testo = doc.createElement('span'); testo.className = 'mrv-veste-controllo-stato'; testo.setAttribute('data-veste-controllo-stato', '');
      esito.appendChild(testo); dettagli.appendChild(esito);
      if (editabile() && chiusuraG1().riprovaPuoRiuscire) pezzi(C.nuovo).forEach(el => (String(el.tagName || '').toUpperCase() === 'BUTTON' ? esito : dettagli).appendChild(el));
      const parte = (k, titolo) => {
        const d = doc.createElement('details'); d.className = 'mrv-veste-controllo-parte'; d.setAttribute('data-veste-controllo-parte', k);
        d.innerHTML = '<summary>' + esc(titolo) + '</summary>';
        dettagli.appendChild(d);
        return d;
      };
      /* 1. lo strato delle affermazioni: lo riempie `aggiornaStrato`, che la nasconde quando non c'è un blocco. Ottavo giro,
         Q14 (a): «Frasi tenute fuori dai materiali» (era «Frasi della fonte rimaste fuori»): la parte contiene soprattutto il
         blocco dello 0042, le frasi della MAPPA che la quarantena tiene fuori dai materiali; il gruppo dello 0041, quando
         c'è, tiene il suo titolo («Frasi della fonte rimaste fuori») e non ripete quello della parte. */
      const fuori = parte('fuori', t('rv_veste_g1_controllo_fuori', 'Frasi tenute fuori dai materiali'));
      fuori.hidden = true; st.parteFuori = fuori;
      // 2. la bozza conservata, solo se c'è
      const bozze = pezzi(C.bozze);
      if (bozze.length) { const b = parte('bozza', t('rv_veste_g1_controllo_bozza', 'Bozza conservata')); bozze.forEach(el => b.appendChild(el)); }
      // 3. i dettagli tecnici, sempre, per ultimi
      const tecnici = parte('tecnici', t('rv_veste_g1_controllo_tecnici', 'Dettagli tecnici del controllo'));
      const messaggio = doc.createElement('p'); messaggio.className = 'text-sm'; messaggio.setAttribute('data-veste-controllo-messaggio', '');
      messaggio.textContent = messaggioControllo(r);
      tecnici.appendChild(messaggio);
      const legenda = doc.createElement('p'); legenda.className = 'mrv-coverage-legenda'; legenda.setAttribute('data-veste-legenda', '');
      legenda.innerHTML = '<span class="mrv-legenda-voce"><span class="mrv-pallino" aria-hidden="true"></span>' + esc(t('rv_veste_g1_da_decidere', 'Note da decidere')) + '</span>' +
        '<span class="mrv-legenda-voce"><span class="mrv-teacher-approved" aria-hidden="true">' + SVG_SPUNTA + '</span>' + esc(t('rv_veste_g1_deciso', 'Deciso')) + '</span>' +
        '<span class="mrv-legenda-voce"><span class="mrv-veste-cerchio" aria-hidden="true"></span>' + esc(t('rv_veste_g1_non_letto', 'Non letto dal controllo')) + '</span>';
      tecnici.appendChild(legenda);
      /* Q8: che cosa vuol dire «non letto» (`righeMappa`: le parti che l'ULTIMO rapporto dice saltate, senza quelle che
         hanno già una riga fra i segnalati). Spiega anche perché la traccia del controllo, qui sotto, conta di più. */
      const def = doc.createElement('p'); def.className = 'text-sm'; def.setAttribute('data-veste-non-letto-def', '');
      def.textContent = t('rv_veste_g1_non_letto_vuol_dire', 'Non letto: l’ultimo controllo automatico non ha esaminato questa parte, anche se un controllo precedente l’aveva esaminata. Le parti non lette che hanno una nota del controllo stanno fra i segnalati.');
      tecnici.appendChild(def);
      pezzi(C.traccia).forEach(el => tecnici.appendChild(el));
      aggiornaStrato();
    }
    /* Il titolo della sezione e lo strato delle affermazioni dentro la veste (0042): il blocco in sola lettura, ricalcolato
       dopo ogni scrittura (le corsie cambiano con le decisioni, come nel Banco di prima). Q8 (giro del 07/10): nel titolo
       il conto dei non letti della barra, con le sue parole; il suffisso dello strato («descrizioni esaminate in almeno un
       giro: 38 / 38», l'unione dei giri che usa la quarantena) qui non si mette più: accanto a «19 parti non lette» diceva
       una cosa diversa con un numero diverso. A veste spenta il Banco di prima lo tiene. Terzo giro (punto 5): per la stessa
       ragione il blocco dello strato, qui, non porta «N collegamenti che il controllo non ha esaminato» (`{ veste: true }`).
       Settimo giro, Q14: lo stesso esito nel titolo e nella riga in vista della sezione («Completo», al maschile come «Il
       controllo»; era «Completa», la parola della «Copertura del controllo» di prima); il blocco va nella parte chiusa «Frasi
       della fonte rimaste fuori», che si vede solo se il blocco c'è e, ridisegnato dopo una scrittura, resta com'era
       (aperta o chiusa). */
    /* Ottavo giro, Q14 (b) e (c): il messaggio essenziale del controllo (`checkMessage` di R.open) e, a revisione chiusa dal
       docente, «La revisione è stata completata dal docente.». Sta nella riga sempre in vista (al posto dell'esito, che
       ripeteva il titolo parola per parola) e resta anche nei «Dettagli tecnici». */
    function messaggioControllo(r) {
      return E.checkMessage() + (r.initial.status === 'approved' && r.initial.manualReview ? ' ' + t('rv_dashboard_teacher_checked', 'La revisione è stata completata dal docente.') : '');
    }
    function aggiornaStrato() {
      if (!G1) return;
      const n = nonLette().length;
      const esito = (review().initial.checkStatus === 'completed' ? t('rv_veste_g1_controllo_completo', 'Completo') : t('rv_dashboard_partial', 'Parziale')) +
        (n ? ' · ' + quanteNonLette(n) : '');
      const etichetta = modal.querySelector('#mrv-coverage-label');
      if (etichetta) etichetta.textContent = esito;
      // ottavo giro, Q14 (b): nella riga il messaggio del controllo; l'esito col conto di Q8 resta nel titolo
      const riga = modal.querySelector('[data-veste-controllo-stato]');
      if (riga) riga.textContent = messaggioControllo(review());
      const fuori = st.parteFuori;
      if (!fuori || !E.strato) return;
      let blocco = null;
      // terzo giro, punto 5: il blocco «nella veste», senza un secondo conto dei collegamenti non esaminati (Q8)
      try { blocco = E.strato.blocco({ veste: true }); } catch (e) { blocco = null; }
      if (st.bloccoStrato) { st.bloccoStrato.remove(); st.bloccoStrato = null; }
      if (blocco) { fuori.appendChild(blocco); st.bloccoStrato = blocco; }
      fuori.hidden = !blocco;
    }

    /* ── la Copertura del controllo ───────────────────────────────────────── */
    function disegnaCopertura() {
      if (G1) return coperturaG1();
      const r = review(), parziale = r.initial.checkStatus !== 'completed';
      const etichetta = modal.querySelector('#mrv-coverage-label');
      if (etichetta) etichetta.textContent = parziale ? t('rv_dashboard_partial', 'Parziale') : t('rv_dashboard_complete', 'Completa');
      const stato = modal.querySelector('#mrv-coverage-status');
      if (stato) stato.textContent = E.checkMessage() + (r.initial.status === 'approved' && r.initial.manualReview ? ' ' + t('rv_dashboard_teacher_checked', 'La revisione è stata completata dal docente.') : '');
      const dettagli = modal.querySelector('#mrv-coverage-details');
      if (dettagli) {
        dettagli.replaceChildren();
        const legenda = doc.createElement('p'); legenda.className = 'mrv-coverage-legenda'; legenda.setAttribute('data-veste-legenda', '');
        legenda.innerHTML = '<span class="mrv-legenda-voce"><span class="mrv-pallino" aria-hidden="true"></span>' + esc(t('rv_review_needed', 'Revisione necessaria')) + '</span>' +
          '<span class="mrv-legenda-voce"><span class="mrv-teacher-approved" aria-hidden="true">' + SVG_SPUNTA + '</span>' + esc(t('rv_veste_legenda_fatto', 'Rivisto o approvato da te')) + '</span>' +
          '<span class="mrv-legenda-voce"><span class="mrv-veste-escluso" aria-hidden="true">' + SVG_ESCLUSO + '</span>' + esc(t('rv_material_excluded', 'Escluso')) + '</span>';
        dettagli.appendChild(legenda);
      }
      const manuale = modal.querySelector('#mrv-manual');
      if (!manuale) return;
      manuale.replaceChildren();
      if (!parziale || !editabile()) return;
      // R4: niente spunta; resta «Riprova il controllo automatico dei residui», che salva prima il campo aperto
      const riprova = doc.createElement('button'); riprova.type = 'button'; riprova.id = 'mrv-retry-judge'; riprova.className = 'pm-btn-cancel';
      riprova.textContent = t('rv_context_retry_missing', 'Riprova il controllo automatico dei residui');
      riprova.onclick = async () => {
        if (occupato()) return;
        if (!salvaAperto()) return;
        const ok = await E.riprova();
        if (ok) st.pila = [];
        aggiornaAzioni();
      };
      manuale.appendChild(riprova);
      const ambito = doc.createElement('p'); ambito.className = 'text-sm';
      ambito.textContent = r.initial.report && r.initial.report.checkpoint ? t('rv_context_retry_scope', 'Ricontrolla le bozze originali, prima delle tue correzioni. Riusa i controlli validi; le decisioni sono conservate. Il tentativo può restare incompleto.')
        : t('rv_context_retry_legacy', 'Questo progetto usa un controllo precedente: il primo ricontrollo riesamina le bozze per poter riutilizzare in seguito le verifiche complete. Le tue decisioni restano conservate.');
      manuale.appendChild(ambito);
    }

    /* ── la scheda ────────────────────────────────────────────────────────── */
    /* 0086, giro 3c (D37.7, L3): con scelte salvate in conflitto il materiale riparte dal testo che danno le altre scelte
       (`senzaConflitti`), non dal testo generato nudo; `ok` resta falso e `conflitti` dice quali (la scheda prende le spunte) */
    function leggiAdesso(id) {
      return BC.testoAdesso(null, review(), { db: dbItems(), bersaglio: { kind: 'item', id: String(id), field: '$item' }, sources: fonti(), senzaConflitti: true });
    }
    // I campi della scheda, guidati da `canonicalFields` (§4.4): la corretta vive con le alternative.
    function campiDi(item) {
      if (!item) return [];
      if (item.kind === 'causal') return ['question', 'text', 'answer'].filter(f => own(item, f));
      const lista = E.canonicalFields(item);
      return Array.isArray(item.options) ? lista.filter(f => f !== 'correctIndex') : lista;
    }
    const forma = (escluso, vecchia, campi, note) => JSON.stringify([!!escluso, !!vecchia, campi, note.map(i => i.id)]);
    function conflittiDi(info) {
      const ids = new Set();
      if (info && !info.ok) (info.conflitti || []).forEach(c => { if (c && c.code === 'conflicting_decisions') { if (c.issueId) ids.add(c.issueId); if (c.otherIssueId) ids.add(c.otherIssueId); } });
      return ids;
    }
    function dove(x, it) {
      const area = areeDi(x.id).find(a => a && a.id != null && String(a.id).charAt(0) !== '_');
      return [x.n == null ? '' : String(x.n), tipoUno(it && it.kind), area ? area.label : ''].filter(Boolean).join(' · ');
    }
    function bozzeDi() {
      const b = new Map();
      st.campi.forEach(c => { if (c.dirty && c.bozza) b.set(c.field, c.bozza()); });
      return b;
    }
    /* Giro 3d (D41): le bozze con cui si costruisce la scheda. Ricostruita sul posto (`aggiornaScheda`) porta quelle a schermo
       (`bozzeDi`); aperta di nuovo (cambio di riga, ⌘Z su un'altra riga, il ridisegno), quelle della seduta (`st.bozze`). */
    function bozzeDellaRiga(bozze, id) { return bozze instanceof Map ? bozze : st.bozze.get(String(id)) || null; }
    /* 0074 — LA FONTE SEGUE LA SCHEDA (ADR 0012 rev. 3, p. 5): a ogni scheda le prove del materiale vanno alla Fonte
       col colore della sua prima macroarea (lo stesso dei pallini delle aree; senza area nessun colore, e il segno resta
       il giallo di oggi). La Fonte dice quante hanno trovato una pagina, e quel numero va a R.open, che apre o chiude
       la colonna (F1). Anche una scheda senza materiale (assente dalla bozza, o nessuno da aprire) passa zero prove:
       la Fonte non resta sulla pagina del materiale di prima. */
    function fonteSegue(id, prove) {
      if (!E.fonte) return;
      const area = id ? areeDi(id).find(a => a && a.color && a.id != null && String(a.id).charAt(0) !== '_') : null;
      let passi = null;
      try { passi = E.fonte.mostra(prove, { colore: area ? area.color : null }); } catch (e) { /* la Fonte resta com'era */ }
      if (typeof passi === 'number' && typeof E.passiNellaFonte === 'function') {
        try { E.passiNellaFonte(id || null, passi); } catch (e) { /* la colonna resta com'era */ }
      }
    }
    function costruisciScheda(bozze) {
      if (G1) return costruisciSchedaG1(bozze);
      content.replaceChildren(); st.campi = []; st.noteEl = new Map(); st.info = null; st.itemAdesso = null; st.forma = ''; svuotaFondo();
      st.modo = ''; st.sp = null; calcolaFondo();   // giro 3c: la scheda di prima non lascia spunte né bottone in fondo
      // punto 4: i gesti da ripetere valgono per la scheda dove sono stati respinti
      if (st.schedaDi !== st.attiva) st.daRipetere.clear();
      st.schedaDi = st.attiva;
      const sez = doc.createElement('section'); sez.className = 'mrv-veste-scheda';
      const id = st.attiva, x = id ? rigaDi(id) : null, it = id ? base(id) : null;
      if (!x) {
        // R5: col controllo parziale «non ha lasciato niente in sospeso» sarebbe falso
        sez.innerHTML = '<p class="mrv-veste-vuoto">' + esc(righe().righe.length ? t('rv_veste_scegli', 'Scegli un materiale nell’elenco.')
          : review().initial.checkStatus !== 'completed' ? t('rv_veste_niente_parziale', 'Il controllo automatico è parziale, ma nessun materiale ha una segnalazione da decidere: la conferma è in fondo.')
            : t('rv_veste_niente', 'Nessun materiale da rivedere: il controllo non ha lasciato niente in sospeso.')) + '</p>';
        content.appendChild(sez); fonteSegue(null, []); aggiornaAzioni(); return;
      }
      sez.setAttribute('data-veste-scheda', x.id);
      const titolo = '<h3 id="mrv-current-title" class="mrv-veste-dove" tabindex="-1">' + esc(dove(x, it)) + '</h3>';
      const info = it && !x.assente ? leggiAdesso(x.id) : { errore: 'assente' };
      if (info.errore) {
        sez.innerHTML = titolo + '<p class="mrv-veste-avviso" role="status">' + esc(t('rv_coverage_item_missing', 'Il materiale indicato dal rapporto non è disponibile nella bozza salvata.')) + '</p>';
        content.appendChild(sez); fonteSegue(x.id, []); aggiornaAzioni(); return;
      }
      const escluso = !!info.escluso || anteprima(x.id).escluso, vecchia = stantia();
      const adesso = escluso ? it : (info.adesso || it), note = mostrabili(x.id, info), campi = campiDi(adesso);
      // 0086, giro 3c: la regola unica delle spunte anche sui materiali (fa parte della forma: cambiando si ricostruisce)
      st.modo = modoSpunte(x, info) ? 'spunte' : '';
      st.info = info; st.itemAdesso = adesso; st.forma = forma(escluso, vecchia, campi, note) + '|' + st.modo;
      // giro 2 bis (D31): sotto le note di tutto il materiale, la riga col nome del materiale a schermo (`nomiValori`)
      sez.innerHTML = titolo + '<div class="mrv-veste-avvisi" data-veste-avvisi></div>' + frasiSenzaEsito(x.id, it) + '<div class="mrv-veste-note" data-veste-note-di="$item"></div>' +
        '<p class="mrv-veste-sotto" data-veste-nome-materiale hidden></p>' +
        (adesso.kind === 'synthesis' && adesso.title ? '<p class="mrv-veste-fisso">' + esc(mostra(adesso.title, it)) + '</p>' : '');
      const corpo = adesso.kind === 'causal' ? doc.createElement('div') : sez;
      if (adesso.kind === 'causal') { corpo.className = 'mrv-veste-catena'; sez.appendChild(corpo); }
      campi.forEach(f => {
        const valore = adesso[f];
        const c = f === 'options' ? widgetOpzioni(it) : (Array.isArray(valore) || f === 'criteria' || f === 'criteri') ? widgetLista(f, it)
          : f === 'lines' ? widgetNumero(f, it) : widgetTesto(f, it, f === 'question');
        st.campi.push(c); corpo.appendChild(c.el);
      });
      if (adesso.kind === 'causal') {
        const frase = doc.createElement('p'); frase.className = 'mrv-veste-aiuto mrv-veste-frase'; frase.setAttribute('data-veste-frase', '');
        sez.appendChild(frase);
      }
      // le note, ognuna sopra il campo che riguarda; quelle del materiale intero (o di un campo senza riquadro) in cima
      const contenitore = f => {
        const c = st.campi.find(w => w.field === f || (f === 'correctIndex' && w.field === 'options') || (f === 'criteri' && w.field === 'criteria'));
        return c ? c.note : sez.querySelector('[data-veste-note-di="$item"]');
      };
      note.forEach(i => {
        const senzaCampo = !st.campi.some(w => w.field === i.target.field || (i.target.field === 'correctIndex' && w.field === 'options') || (i.target.field === 'criteri' && w.field === 'criteria'));
        const el = notaEl(i, it, senzaCampo);
        st.noteEl.set(i.id, el); contenitore(i.target.field).appendChild(el);
      });
      content.appendChild(sez);
      st.campi.forEach(c => c.carica(adesso, note));
      bozze = bozzeDellaRiga(bozze, x.id);
      if (bozze && bozze.size) st.campi.forEach(c => { if (bozze.has(c.field) && c.ripristinaBozza) c.ripristinaBozza(bozze.get(c.field)); });
      if (st.modo === 'spunte') aggiornaSpunte(x); else st.sp = null;
      aggiornaNote(); aggiornaAvvisi(escluso, vecchia); aggiornaFrase(); blocca(escluso, vecchia);
      st.campi.forEach(c => c.dipingi());
      calcolaFondo();
      if (E.fonte) {
        const prove = [], visti = new Set();
        note.filter(i => esito(i) === 'pending').concat(note).forEach(i => righeProva(i.evidence).forEach(p => { if (!visti.has(p.text)) { visti.add(p.text); prove.push(p); } }));
        righeProva(it && it.citations).concat(righeProva(it && it.evidenza)).forEach(p => { if (!visti.has(p.text)) { visti.add(p.text); prove.push(p); } });
        fonteSegue(x.id, prove);
      }
      aggiornaAzioni();
    }
    /* ── G1, la scheda per nodo o per collegamento (0075, rev. 4 B.4 e A) ──────
       Un nodo: titolo e descrizione, col testo come risulta dalle decisioni già prese (`testoAdesso`, campo per campo);
       un non letto dal controllo: la sola descrizione, con la riga che lo dice (B.2); un collegamento: «Dal concetto → Al
       concetto» come testo (gli estremi restano alla mappa, «Cambia Link») e le parole, coi suggerimenti (B.5). Le note
       del controllo stanno sopra il campo che riguardano (la nota sul collegamento intero, $link, sopra le parole). */
    const collegamento = x => !!x && x.source != null;
    function campiG1(x) {
      if (collegamento(x)) return ['rel'];
      return x.tipo === 'non-letto' ? ['desc'] : ['label', 'desc'];
    }
    function leggiAdessoG1(x) {
      const partenza = {}, adesso = {}, conflitti = [];
      let ok = true, escluso = false;
      for (const f of campiG1(x)) {
        // 0086, giro 3c (D37.7, L3): con scelte salvate in conflitto il campo riparte dal testo delle altre scelte
        const s = BC.testoAdesso(null, review(), { db: dbMappa(), bersaglio: bersaglioDi(x.id, f), sources: fonti(), senzaConflitti: true });
        if (s.errore) return { errore: s.errore };
        partenza[f] = s.partenza; adesso[f] = s.adesso; ok = ok && !!s.ok;
        if (s.escluso) escluso = true;
        (s.conflitti || []).forEach(c => conflitti.push(c));
      }
      return { ok, conflitti, escluso, partenza, adesso: escluso ? null : adesso };
    }
    function doveG1(x) {
      const area = areeDi(x.id).find(a => a && a.id != null && String(a.id).charAt(0) !== '_');
      const tipo = x.fuori ? (collegamento(x) ? t('rv_veste_g1_collegamento_fuori', 'Collegamento senza segnalazioni') : t('rv_veste_g1_nodo_fuori', 'Nodo senza segnalazioni'))
        : x.tipo === 'non-letto' ? (collegamento(x) ? t('rv_veste_g1_collegamento_non_letto', 'Collegamento non letto dal controllo') : t('rv_veste_g1_nodo_non_letto', 'Nodo non letto dal controllo'))
          : collegamento(x) ? t('rv_veste_g1_collegamento', 'Collegamento') : t('rv_veste_g1_nodo', 'Nodo');
      return [x.n == null ? '' : String(x.n), tipo, area ? area.label : ''].filter(Boolean).join(' · ');
    }
    /* §4.11 (rev. 3 p. 5-6; 0074): le prove che la Fonte cerca, in quest'ordine — per ogni nota (prima le aperte) la frase
       citata (`quote`) e poi le altre sue prove; in coda le frasi vicine nella fonte che lo strato delle affermazioni trova
       per il nodo (`prove` dello strato, quelle che «Mostra nella fonte» mostrerebbe). Niente doppioni. */
    function proveG1(x, note) {
      const prove = [], visti = new Set();
      const metti = p => { if (p && typeof p.text === 'string' && p.text && !visti.has(p.text)) { visti.add(p.text); prove.push(p); } };
      note.filter(i => esito(i) === 'pending').concat(note).forEach(i => {
        const sue = righeProva(i.evidence), citata = typeof i.quote === 'string' ? i.quote.trim() : '';
        if (citata) metti(Object.assign({}, sue.find(p => typeof p.text === 'string' && p.text.indexOf(citata) >= 0) || {}, { text: citata }));
        sue.forEach(metti);
      });
      if (E.strato && typeof E.strato.prove === 'function' && !collegamento(x)) {
        try { (E.strato.prove(x.id) || []).forEach(metti); } catch (e) { /* senza lo strato, le prove delle note */ }
      }
      return prove;
    }
    function costruisciSchedaG1(bozze) {
      content.replaceChildren(); st.campi = []; st.noteEl = new Map(); st.info = null; st.itemAdesso = null; st.forma = ''; svuotaFondo();
      st.modo = ''; st.sp = null; calcolaFondo();   // giro 3b: la scheda di prima non lascia spunte né bottone in fondo
      if (st.schedaDi !== st.attiva) { st.daRipetere.clear(); st.chiuseOra = null; }
      st.schedaDi = st.attiva;
      const sez = doc.createElement('section'); sez.className = 'mrv-veste-scheda';
      const id = st.attiva, x = id ? rigaDi(id) : null;
      if (!x) {
        sez.innerHTML = '<p class="mrv-veste-vuoto">' + esc(righe().righe.length ? t('rv_veste_g1_scegli', 'Scegli un nodo o un collegamento nell’elenco.')
          : review().initial.checkStatus !== 'completed' ? t('rv_veste_g1_niente_parziale', 'Il controllo automatico è parziale, ma nessun nodo o collegamento ha una nota da decidere: la conferma è in fondo.')
            : t('rv_veste_g1_niente', 'Nessuna nota da decidere: il controllo non ha lasciato niente in sospeso.')) + '</p>';
        content.appendChild(sez); fonteSegue(null, []); aggiornaAzioni(); return;
      }
      sez.setAttribute('data-veste-scheda', x.id);
      sez.setAttribute('data-veste-tipo', x.fuori ? 'fuori' : x.tipo);
      const titolo = '<h3 id="mrv-current-title" class="mrv-veste-dove" tabindex="-1">' + esc(doveG1(x)) + '</h3>';
      const info = leggiAdessoG1(x);
      if (info.errore) {
        sez.innerHTML = titolo + '<p class="mrv-veste-avviso" role="status">' + esc(t('rv_veste_g1_assente', 'Questo elemento non si ritrova nella mappa della revisione: correggilo dalla mappa.')) + '</p>';
        content.appendChild(sez); fonteSegue(x.id, []); aggiornaAzioni(); return;
      }
      const escluso = !!info.escluso, vecchia = stantia(), adesso = escluso ? info.partenza : info.adesso;
      const note = mostrabili(x.id, info), campi = campiG1(x);
      // 0086, giro 3b: la regola unica delle spunte sulle righe dei nodi (fa parte della forma: cambiando si ricostruisce)
      st.modo = modoSpunte(x, info) ? 'spunte' : '';
      st.info = info; st.itemAdesso = adesso; st.forma = forma(escluso, vecchia, campi, note) + '|' + st.modo;
      const riga = x.tipo === 'non-letto' ? (collegamento(x) ? t('rv_veste_g1_non_letto_collegamento', 'Il controllo non ha letto questo collegamento: confrontalo con la fonte qui accanto.')
        : t('rv_veste_g1_non_letto_descrizione', 'Il controllo non ha letto questa descrizione: confrontala con la fonte qui accanto.'))
        : x.fuori ? (collegamento(x) ? t('rv_veste_g1_fuori_collegamento', 'Nessuna nota del controllo su questo collegamento: se lo correggi, la correzione diventa una tua segnalazione.')
          : t('rv_veste_g1_fuori', 'Nessuna nota del controllo su questo nodo: se lo correggi, la correzione diventa una tua segnalazione.')) : '';
      sez.innerHTML = titolo + (collegamento(x) ? '<p class="mrv-veste-fisso" data-veste-collegamento>' + esc(x.titolo) + '</p>' : '') +
        '<div class="mrv-veste-avvisi" data-veste-avvisi></div>' +
        (riga ? '<p class="mrv-veste-aiuto" data-veste-' + (x.fuori ? 'fuori' : 'non-letto') + '>' + esc(riga) + '</p>' : '') +
        '<div class="mrv-veste-note" data-veste-note-di="$item"></div>';
      const it = Object.assign({ kind: collegamento(x) ? 'link' : 'node' }, info.partenza);
      campi.forEach(f => {
        const c = f === 'rel' ? widgetParole(it) : widgetTesto(f, it, f === 'label');
        st.campi.push(c); sez.appendChild(c.el);
      });
      // le note sopra il campo che riguardano; quella su tutto il collegamento ($link) sopra le parole
      const campoNota = f => f === '$link' ? 'rel' : f;
      note.forEach(i => {
        const c = st.campi.find(w => w.field === campoNota(i.target.field));
        const el = notaEl(i, it, !c);
        st.noteEl.set(i.id, el); (c ? c.note : sez.querySelector('[data-veste-note-di="$item"]')).appendChild(el);
      });
      content.appendChild(sez);
      st.campi.forEach(c => c.carica(adesso, note));
      bozze = bozzeDellaRiga(bozze, x.id);
      if (bozze && bozze.size) st.campi.forEach(c => { if (bozze.has(c.field) && c.ripristinaBozza) c.ripristinaBozza(bozze.get(c.field)); });
      if (st.modo === 'spunte') aggiornaSpunte(x); else st.sp = null;
      aggiornaNote(); aggiornaAvvisi(escluso, vecchia); blocca(escluso, vecchia);
      st.campi.forEach(c => c.dipingi());
      fonteSegue(x.id, proveG1(x, note));
      calcolaFondo();
      aggiornaAzioni();
    }
    function aggiornaSchedaG1() {
      const id = st.attiva, x = id ? rigaDi(id) : null;
      if (!x) return costruisciSchedaG1();
      const info = leggiAdessoG1(x);
      if (info.errore) return costruisciSchedaG1();
      const escluso = !!info.escluso, vecchia = stantia(), adesso = escluso ? info.partenza : info.adesso, note = mostrabili(id, info);
      // settimo giro, D-a: la riga che esce dalla barra (o che ci rientra) cambia il titolo e la riga d'aiuto della scheda
      const sez = content.querySelector('[data-veste-scheda]');
      const tipoCambiato = !sez || sez.getAttribute('data-veste-tipo') !== (x.fuori ? 'fuori' : x.tipo);
      const modo = modoSpunte(x, info) ? 'spunte' : '';
      if (tipoCambiato || forma(escluso, vecchia, campiG1(x), note) + '|' + modo !== st.forma) return costruisciSchedaG1(bozzeDi());
      st.info = info; st.itemAdesso = adesso;
      st.campi.forEach(c => c.carica(adesso, note));
      // giro 3b: le spunte si rileggono dal core dopo ogni scrittura (⌘Z riapre le note, il bottone le chiude)
      if (st.modo === 'spunte') aggiornaSpunte(x);
      aggiornaNote(); aggiornaAvvisi(escluso, vecchia); blocca(escluso, vecchia);
      st.campi.forEach(c => c.dipingi());
      calcolaFondo();
      aggiornaAzioni();
    }
    /* Punto 13 (§4.6, Giacomo 05/10: «questo elenco deve essere collassabile e di default deve sempre essere
       collassato»): le frasi del materiale che il controllo non ha verificato, in una sezione apribile col numero nel
       titolo. Nasce chiusa a ogni costruzione della scheda, quindi si richiude ogni volta che la scheda si apre o si
       ricostruisce; gli aggiornamenti sul posto (§4.11) non la toccano. Le etichette sono quelle del modale di prima. */
    function frasiSenzaEsito(id, it) {
      const riga = residui().perId.get(String(id)), frasi = riga && Array.isArray(riga.claims) ? riga.claims : [];
      if (!frasi.length) return '';
      const motivo = s => s === 'uncertain' ? (E.fonteScheda ? t('rv_scheda_uncertain', 'Riscontro nella scheda non confermato') : t('rv_coverage_uncertain', 'Riscontro nella fonte non confermato'))
        : s === 'missing' ? t('rv_coverage_missing', 'Il modello non ha restituito un esito') : t('rv_coverage_unverified', 'Esito non validato');
      return '<details class="mrv-veste-frasi" data-veste-frasi><summary>' + esc(t('rv_veste_frasi_senza_esito', 'Frasi che il controllo non ha verificato')) + ' (' + frasi.length + ')</summary>' +
        '<ul class="mrv-coverage-claims">' + frasi.map(f => '<li><strong>' + esc(E.fieldName(f.field, it)) + ' · ' + esc(motivo(f.status)) + '</strong>' +
          '<p class="mrv-coverage-text">' + esc(mostra(f.text, it)) + '</p></li>').join('') + '</ul></details>';
    }
    // Dopo un salvataggio la scheda resta dov'è (§4.11): si aggiornano sul posto note, campi e bottone.
    function aggiornaScheda() {
      if (G1) return aggiornaSchedaG1();
      const id = st.attiva;
      if (!id) return costruisciScheda();
      const x = rigaDi(id), it = base(id);
      if (!x || !it || x.assente) return costruisciScheda();
      const info = leggiAdesso(id);
      if (info.errore) return costruisciScheda();
      const escluso = !!info.escluso || anteprima(id).escluso, vecchia = stantia();
      const adesso = escluso ? it : (info.adesso || it), note = mostrabili(id, info);
      const modo = modoSpunte(x, info) ? 'spunte' : '';
      if (forma(escluso, vecchia, campiDi(adesso), note) + '|' + modo !== st.forma) return costruisciScheda(bozzeDi());
      st.info = info; st.itemAdesso = adesso;
      st.campi.forEach(c => c.carica(adesso, note));
      // giro 3c: le spunte si rileggono dal core dopo ogni scrittura
      if (st.modo === 'spunte') aggiornaSpunte(x);
      aggiornaNote(); aggiornaAvvisi(escluso, vecchia); aggiornaFrase(); blocca(escluso, vecchia);
      st.campi.forEach(c => c.dipingi());
      calcolaFondo();
      aggiornaAzioni();
    }
    // Sola lettura: revisione approvata o in salvataggio, materiale escluso (in G1 il collegamento tolto), revisione non più
    // della versione del progetto. In G1 anche i suggerimenti e la famiglia delle parole di un collegamento.
    function blocca(escluso, vecchia) {
      if (!editabile() || escluso || vecchia) content.querySelectorAll('[data-veste-scheda] textarea, [data-veste-scheda] input, [data-veste-togli], [data-veste-aggiungi], [data-veste-parola], [data-veste-famiglia]').forEach(el => { el.disabled = true; });
    }
    function aggiornaTutto() { elenco(); aggiornaScheda(); aggiornaContorno(); }
    function aggiornaAvvisi(escluso, vecchia) {
      const box = content.querySelector('[data-veste-avvisi]');
      if (!box) return;
      if (G1) return avvisiG1(escluso, vecchia);
      const conflitto = conflittiDi(st.info).size > 0;
      const righeAvviso = [];
      if (vecchia) righeAvviso.push(t('rv_coverage_preview_global', 'I materiali o le fonti non corrispondono alla versione di questa revisione. Le approvazioni restano salvate, ma prima di continuare occorre riaprire la revisione sulla versione corretta del progetto.'));
      else if (escluso) righeAvviso.push(t('rv_coverage_excluded', 'Hai scelto di escludere questo materiale.'));
      // 0086, giro 3c (D37.7): le scelte salvate prima che si contraddicono le sostituisce il bottone in fondo
      else if (conflitto) righeAvviso.push(CONFLITTO_PRIMA());
      st.righeStato = righeAvviso.map(m => '<p class="mrv-veste-avviso" role="status">' + esc(m) + '</p>').join('');
      dipingiAvvisi();
    }
    /* G1: le righe di stato della scheda — la revisione vecchia, il collegamento tolto, le scelte in conflitto — e, dopo
       una correzione, quali note ha chiuso (§4.4). */
    function avvisiG1(escluso, vecchia) {
      const righeAvviso = [];
      // 0097 riaperto: approvata e superata, il riquadro dice la frase del piè (e il bottone «Ricontrolla la mappa adesso»);
      // 0123, lotto 3b (Giacomo, 23/10): in attesa e superata anche, non più «…riaprire la revisione…»
      if (vecchia) righeAvviso.push(review().initial.status === 'approved'
        ? t('rv_veste_g1_approvata_cambiata', 'La mappa è cambiata, per continuare premi «Ricontrolla la mappa adesso». Le decisioni approvate restano salvate.')
        : t('rv_veste_g1_attesa_cambiata', 'La mappa è cambiata dopo il controllo. Per continuare premi «Ricontrolla la mappa adesso»: il controllo riparte sulla mappa di adesso, e le scelte fatte fin qui restano nella revisione di prima.'));
      else if (escluso) righeAvviso.push(t('rv_veste_g1_tolto', 'Hai scelto di togliere questo collegamento: non arriverà ai materiali. Per rimetterlo premi {annulla}.').replace('{annulla}', ANNULLA));
      // 0086, giro 3c (D37.7): le scelte salvate prima che si contraddicono le sostituisce il bottone in fondo
      else if (conflittiDi(st.info).size > 0) righeAvviso.push(CONFLITTO_PRIMA());
      const chiuse = st.chiuseOra && st.chiuseOra.id === st.attiva && st.chiuseOra.testo
        ? '<p class="mrv-veste-avviso" role="status" data-veste-chiuse>' + esc(st.chiuseOra.testo) + '</p>' : '';
      st.righeStato = righeAvviso.map(m => '<p class="mrv-veste-avviso" role="status">' + esc(m) + '</p>').join('') + chiuse;
      dipingiAvvisi();
    }
    /* G11: i richiami rotti restano detti nella scheda, in grassetto come nella riga di stato (G9), dopo il salvataggio,
       cambiando materiale e riaprendo il Banco. È un avviso, non un blocco (0069). G14 (d): l'avviso segue la battitura
       del docente (il testo che si salverà); senza battitura dice il testo SALVATO, anche quando il campo mostra una
       proposta aperta del controllo (K-H20). Si riscrive solo se cambia: una regione «status» riscritta si rilegge. */
    function dipingiAvvisi() {
      const box = content.querySelector('[data-veste-avvisi]');
      if (!box) return;
      const frasi = [].concat(...st.campi.filter(c => c.tipo === 'testo').map(c => frasiRichiami(c, c.dirty ? c.valore() : testo(c.adesso))));
      const html = (st.righeStato || '') + frasi.map(f => '<p class="mrv-veste-avviso" role="status"><strong>' + esc(f) + '</strong></p>').join('');
      if (box._avvisi === html) return;
      box.innerHTML = html; box._avvisi = html;
    }
    function aggiornaFrase() {
      const p = content.querySelector('[data-veste-frase]');
      if (!p) return;
      const parte = f => { const c = st.campi.find(w => w.field === f); return c ? c.testoMostrato() : ''; };
      p.textContent = t('rv_veste_si_legge', 'Si legge:') + ' ' + ['question', 'text', 'answer'].map(parte).filter(Boolean).join(' ');
    }

    /* ── le note del controllo (rev. 3, 4; rev. 4, A.7): sopra il campo, ognuna col suo gesto ── */
    /* 0086, giro 3c: i bottoni della nota restano solo sulle righe senza le spunte, cioè con le sole richieste del docente
       (L6: «Su una riga con la sola richiesta il bottone in fondo ha i nomi della regola unica, come prima», Q20). Lì non
       ci sono note del controllo (`modoSpunte`): via i nomi dei bottoni del collegamento e dell'esclusione («Togli / Tieni il
       collegamento», «Escludi / Tieni il materiale») e «Togli questa scelta» (D32), che stavano solo sulle note del
       controllo o in conflitto. */
    function notaEl(i, it, senzaCampo) {
      const el = doc.createElement('div'); el.className = 'mrv-veste-nota';
      el.setAttribute('data-veste-nota', i.id); el.setAttribute('role', 'note'); el.setAttribute('tabindex', '-1');
      el.setAttribute('aria-label', t('rv_veste_nota', 'Nota del controllo'));
      // 0086, giro 3b (§4.2, §4.3): sulla scheda con le spunte una nota del controllo non ha bottoni; giro 3c (L6): nemmeno
      // la richiesta del docente, che chiude il bottone in fondo
      if (st.modo === 'spunte') return notaSpunta(el, i, it, senzaCampo);
      // la proposta si legge qui quando il campo non la mostra già in «Originale / Proposta» (aggiornaNote decide)
      // sesto giro, Q12: la proposta letta nella nota porta il nome dell'area accanto al campo («Proposta», Q18), quello di «Usa Proposta»
      const proposta = i.hasProposal && i.after !== null
        ? '<p class="mrv-veste-nota-proposta" data-veste-nota-proposta hidden><span class="mrv-veste-sotto">' + esc(PROPOSTA()) + '</span> ' + esc(E.displayValue(i.after, i.target, G1 ? null : it)) + '</p>' : '';
      el.innerHTML = '<p class="mrv-veste-nota-testo">' + (senzaCampo && i.target.field !== '$item' && i.target.field !== '$link' ? '<strong>' + esc(nomeCampo(i.target.field, it)) + ' · </strong>' : '') + esc(i.problem || '') + '</p>' + proposta +
        // G1: lo stato della nota in quarantena (0042: che cosa toglie dai materiali finché è aperta), solo con lo strato
        (G1 && E.strato ? '<p class="mrv-veste-nota-quarantena" data-veste-quarantena hidden></p>' : '') +
        '<p class="mrv-veste-nota-esito" data-veste-esito hidden></p>' +
        // tredicesimo giro, Q20: quando i bottoni stanno in fondo (`piazzaRisposta`), la nota lo dice in piccolo
        '<p class="mrv-veste-nota-in-fondo" data-veste-in-fondo hidden>' + esc(t('rv_veste_nota_risposta_in_fondo', 'Rispondi coi bottoni in fondo alla scheda.')) + '</p>' +
        '<div class="mrv-veste-nota-azioni" data-veste-azioni data-veste-azioni-di="' + esc(i.id) + '">' +
        (i.hasProposal && i.after !== null ? '<button type="button" class="pm-btn-cancel" data-veste-usa>' + esc(USA()) + '</button>' : '') +
        // ottavo giro, Q15: il nome lo decide `aggiornaNote`, quando il campo è caricato; 0086: la regola unica (`nomiNota`)
        '<button type="button" class="pm-btn-cancel" data-veste-tieni>' + esc(TIENI_ORIGINALE()) + '</button></div>';
      const usa = el.querySelector('[data-veste-usa]'), tieni = el.querySelector('[data-veste-tieni]');
      /* R6 (Giacomo, 05/10): «vince il clic, niente si perde». Il bottone della nota non toglie il fuoco al campo
         (mousedown), così il campo non si salva da sé fra pressione e rilascio; al clic `decidiNota` salva prima la
         battitura (una scrittura) e poi registra il gesto (la seconda, l'ultima parola). ⌘Z riporta alla battitura. */
      [usa, tieni].forEach(b => { if (b) b.onmousedown = e => { if (e && e.preventDefault) e.preventDefault(); }; });
      if (usa) gesto(usa, () => decidiNota(i.id, 'accept'));
      // 0086: il clic fa quello che il nome dice al momento del clic (`data-veste-modo`, messo da `nomiNota` col nome)
      gesto(tieni, () => decidiNota(i.id, 'reject', tieni.getAttribute('data-veste-modo') || ''));
      return el;
    }
    /* 0086, giro 3b (§4.2, §4.3): la nota del controllo su una scheda con le spunte. Sopra il campo che riguarda: il testo, la
       proposta in un'area «Proposta» che con un clic (o Invio col fuoco sull'area) la copia nel campo — l'unico bottone
       dell'area —, lo stato in quarantena (0042), l'esito quando è decisa e, sulla descrizione, la spunta: una casella
       nativa con il suo nome (`nomeSpunta`). Niente bottoni. Sul titolo niente spunta (D37.4). Casella ed etichetta non
       tolgono il fuoco al campo (`preventDefault` al `mousedown`); l'area sì, perché la battitura in sospeso si salvi
       prima di essere sostituita (R6: niente si perde). Ciò che si vede lo decide `spuntaNota`.
       Giro 3c: anche sul collegamento («Tieni il collegamento», sulla nota che propone di toglierlo e su quella delle parole)
       e in G2 («Tieni il materiale», sui campi e sull'esclusione). La proposta che si copia può essere un valore senza aree
       (D31: alternative, elenchi, numeri, il materiale intero): si legge nella nota, e il clic sulla proposta la copia nei
       campi. La richiesta del docente (L6) ha solo il suo testo e, chiusa, l'esito: niente spunta e niente bottoni. */
    function notaSpunta(el, i, it, senzaCampo) {
      const richiestaDocente = i.origin === 'teacher';
      const proposta = !richiestaDocente && i.hasProposal && i.after !== null && i.after !== undefined
        ? '<div class="mrv-veste-nota-proposta mrv-veste-copia" data-veste-nota-proposta role="button" tabindex="0" title="' + esc(t('rv_veste_copia_proposta', 'Fai clic per copiarla nel campo')) + '" hidden>' +
          '<span class="mrv-veste-sotto">' + esc(PROPOSTA()) + '</span> ' + esc(E.displayValue(i.after, i.target, G1 ? null : it)) + '</div>' : '';
      const spunta = !richiestaDocente && !(G1 && i.target.kind === 'node' && i.target.field === 'label') ? '<label class="mrv-veste-spunta" data-veste-spunta-etichetta="' + esc(i.id) + '" hidden>' +
        '<input type="checkbox" data-veste-spunta="' + esc(i.id) + '"> <span data-veste-spunta-nome></span></label>' : '';
      el.innerHTML = '<p class="mrv-veste-nota-testo">' + (senzaCampo && i.target.field !== '$item' && i.target.field !== '$link' ? '<strong>' + esc(nomeCampo(i.target.field, it)) + ' · </strong>' : '') + esc(i.problem || '') + '</p>' + proposta +
        (E.strato && G1 ? '<p class="mrv-veste-nota-quarantena" data-veste-quarantena hidden></p>' : '') +
        '<p class="mrv-veste-nota-esito" data-veste-esito hidden></p>' + spunta;
      const area = el.querySelector('[data-veste-nota-proposta]');
      if (area) {
        area.onclick = () => copiaProposta(i.id);
        area.onkeydown = e => { if (e && (e.key === 'Enter' || e.key === ' ')) { if (e.preventDefault) e.preventDefault(); if (!e.repeat) copiaProposta(i.id); } };
      }
      const casella = el.querySelector('[data-veste-spunta]'), etichetta = el.querySelector('[data-veste-spunta-etichetta]');
      if (casella) {
        const fermo = e => { if (e && e.preventDefault) e.preventDefault(); };
        casella.onmousedown = fermo; etichetta.onmousedown = fermo;
        casella.onchange = () => cambiaSpunta(i.id, !!casella.checked);
      }
      return el;
    }
    // la spunta e l'area «Proposta» di una nota con le spunte, secondo lo stato: aperta la spunta col suo nome e il suo stato
    // per la seduta; decisa nessuna spunta, e la proposta si rilegge solo se la nota è «Testo modificato da te» (come Q19)
    function spuntaNota(el, i, e, aperta, sola) {
      const area = el.querySelector('[data-veste-nota-proposta]');
      if (area) { const via = !(aperta || e === 'edited'); if (area.hidden !== via) area.hidden = via; }
      const etichetta = el.querySelector('[data-veste-spunta-etichetta]');
      if (!etichetta) return;
      const n = aperta ? spuntaDi(i.id) : null, casella = etichetta.querySelector('[data-veste-spunta]');
      if (etichetta.hidden !== !n) etichetta.hidden = !n;
      if (!n) return;
      const nome = nomeSpunta(n), nomeEl = etichetta.querySelector('[data-veste-spunta-nome]');
      if (nomeEl.textContent !== nome) nomeEl.textContent = nome;
      const v = spuntaPiena(n);
      // trappola 10: `.checked` da JS non scatena `onchange`
      if (casella.checked !== v) casella.checked = v;
      if (casella.disabled !== !!sola) casella.disabled = !!sola;
    }
    /* 0086 (§4.4, §4.5): il terzo bottone, «Tieni la tua versione», sulla nota la cui proposta `carica` ha scritto nel
       campo, quando il docente ci ha scritto sopra (caso 4 della tabella dei nomi). Lo crea e lo toglie `nomiNota`. Come gli
       altri bottoni della nota non toglie il fuoco al campo (mousedown, R6) e passa da `gesto`. */
    function terzoBottone(id) {
      const b = doc.createElement('button');
      b.type = 'button'; b.className = 'pm-btn-cancel';
      b.setAttribute('data-veste-tua', '');
      b.textContent = TIENI_TUA();
      b.onmousedown = e => { if (e && e.preventDefault) e.preventDefault(); };
      gesto(b, () => decidiNota(id, 'reject', 'tua'));
      return b;
    }
    /* Un bottone che fa un gesto (terzo giro, difetto F): il secondo clic di un doppio clic (detail > 1) non conta, e un
       Invio o uno Spazio tenuti premuti (keydown ripetuto) non diventano altri clic. Un gesto in corso ferma gli altri
       (`unoAllaVolta`). Da tastiera il clic arriva con detail 0 e passa. */
    function gesto(b, fn) {
      if (!b) return;
      b.onclick = e => { if (e && e.detail > 1) return; return fn(); };
      senzaRipetizione(b);
    }
    function senzaRipetizione(b) {
      b.onkeydown = e => { if (e && e.repeat && (e.key === 'Enter' || e.key === ' ') && e.preventDefault) e.preventDefault(); };
    }
    /* La proposta di questa nota è quella scritta in «Dopo» (A.5); due note con la stessa proposta sullo stesso campo = un
       confronto solo (rev. 4, A.8). Dà il nome del bottone (Q15, `aggiornaNote`) e il senso del clic (nono giro, D2,
       `decidiUnaVolta`): una regola sola per tutti e due. */
    function propostaInDopo(i) {
      const campo = i && i.hasProposal ? st.campi.find(c => c.field === i.target.field && c.tipo === 'testo') : null;
      return !!(campo && campo.stato && campo.stato.proposta && uguali(campo.stato.proposta.after, i.after));
    }
    /* Giro 2 bis (difetto 4 del revisore; la regola applicata: «una modifica di soli spazi non conta per i nomi»): nel
       campo della nota c'è la proposta che `carica` vi ha scritto con soli spazi in più. I nomi delle note del campo sono
       quelli dello stato senza modifiche, quindi anche su un'altra nota «Tieni Originale» deve tenere l'Originale: il
       salvataggio della battitura resta com'è (R6 dello 0075: in G1 vale «Usa Proposta»; una scrittura, una voce di ⌘Z) e
       il gesto parte da prima, come il ramo D2 (`decidiUnaVolta`). */
    function soloSpaziSullaProposta(i) {
      const c = i ? campoDellaNota(i) : null;
      return !!(c && c.tipo === 'testo' && c.dirty && c.stato && c.stato.proposta && !c.modificato());
    }
    /* 0086 (§4.5, «I bottoni»; D25-D27, D29): che cosa può tenere il bottone di una nota, secondo il testo a schermo del
       SUO campo («i nomi di una nota seguono il campo della nota»).
       · «Tieni Originale» solo se dopo il clic il testo resterebbe l'«Originale»: sulla nota la cui proposta `carica` ha
         scritto nel campo sempre (il ramo D2 scarta la battitura in sospeso, e il testo salvato è quello di partenza);
         sulle altre conta il testo che il clic terrebbe — la battitura in sospeso, che il clic salva prima (R6), o il
         testo salvato. Con il testo già cambiato da una scelta salvata non c'è: per tornare indietro c'è ⌘Z.
       · «Tieni la tua versione» quando c'è l'area «Tua versione» (`c.aree`).
       Una nota senza proposta ha così UN bottone, che cambia nome; il terzo bottone c'è solo sulla nota la cui proposta è
       nel campo, quando ci si è scritto sopra (caso 4). Senza aree (G2: alternative, elenchi, righe, il materiale intero)
       lo stesso confronto sul valore a schermo. I confronti come la regola 1 di `calcola` (`piano`). Restituisce
       { tieni: 'originale' | 'tua' | null, terzo, inArea }:
       `inArea` vuol dire che l'area «Proposta» mostra proprio la proposta di questa nota (non si ripete nella nota).
       Giro 2 bis (dopo le due verifiche del giro 2):
       · Difetto 1 del revisore: una nota GIÀ DECISA coi gesti ancora in vista (un gesto respinto da ripetere, il fuoco sui
         suoi bottoni) — il clic è un reject sul testo salvato, quindi il nome si calcola su una prova a secco
         (`dopoReject`: `setDecision` su una copia e `testoAdesso`). Con una battitura vera in sospeso nel suo campo il
         clic la salva prima e la tiene (ramo D1, o la nota ha già il reject), quindi vale la regola di sopra. La prova si
         fa solo coi gesti in vista (`inVista`): altrove il nome non si legge.
       · Difetto 4 del revisore: una modifica di soli spazi non conta per i nomi (`c.testoTenuto`, `c.modificato`). */
    function scelteNota(i, inVista) {
      // 0086, giro 3c: le note coi bottoni sono solo le richieste del docente (righe senza spunte): via «Tieni le parole» (D29)
      // e la nota in conflitto (D30), che lì non arrivano più
      const niente = { tieni: null, terzo: false, inArea: false };
      const c = campoDellaNota(i);
      if (esito(i) !== 'pending' && !(c && c.modificato())) {
        if (!inVista) return { tieni: 'originale', terzo: false, inArea: false };
        /* il ramo D1 di `decidiUnaVolta`: la nota l'ha chiusa l'ultima battitura salvata (Tab dal campo ai suoi bottoni) e il
           clic non salva altro — il gesto non scrive, il testo resta quello salvato */
        if (!scriveraIlClic() && chiusaDallaBattitura(i)) return { tieni: cambiatoDaOriginale(i, false) ? 'tua' : 'originale', terzo: false, inArea: false };
        const dopo = dopoReject(i);
        if (dopo === undefined) return niente;
        /* giro 2 ter — D33 (Giacomo: «Niente «Tieni…» (Raccomandato)»; difetto 4a del revisore): «Tieni Originale» solo se
           il reject lascia l'«Originale», «Tieni la tua versione» solo se lascia il testo a schermo (`comeASchermo`); in
           ogni altro caso nessun «Tieni…» — con due proposte scelte, a1 e a3, il reject di a1 lascia il testo della sola
           a3: né l'Originale né quello che si vede. Restano «Usa Proposta» e ⌘Z. */
        return { tieni: !diversoDaGenerato(i, dopo) ? 'originale' : comeASchermo(i, dopo) ? 'tua' : null, terzo: false, inArea: false };
      }
      if (c && c.tipo === 'testo') {
        const a = c.aree(), qui = propostaInDopo(i);
        const originale = qui || BC.piano(c.testoTenuto()) === BC.piano(c.riferimento);
        return { tieni: originale ? 'originale' : a.tua ? 'tua' : null, terzo: qui && a.tua, inArea: qui && a.proposta };
      }
      return { tieni: cambiatoDaOriginale(i, true) ? 'tua' : 'originale', terzo: false, inArea: false };
    }
    /* Giro 2 bis: il clic su un bottone salverebbe prima una battitura (R6) — un campo con una modifica vera, o la proposta
       mostrata con soli spazi in più (in G1 vale «Usa Proposta», in G2 una correzione). Soli spazi su un altro testo non
       scrivono niente (regola 1). */
    const scriveraIlClic = () => st.campi.some(c => c.dirty && (c.modificato() || (c.tipo === 'testo' && !!(c.stato && c.stato.proposta))));
    /* Giro 2 bis: il ramo D1 di `decidiUnaVolta` visto prima del clic, quando il clic non salva niente: l'ultima battitura
       salvata (`battituraAppena`: in cima alla pila, su questa riga, sul campo della nota) ha cambiato la decisione della
       nota e l'ha chiusa; il gesto allora non scrive. */
    function chiusaDallaBattitura(i) {
      const b = battituraAppena(i.id);
      if (!b || esito(i) === 'pending') return false;
      const r = review(), dec = rv => own(rv.initial.decisions || {}, i.id) ? rv.initial.decisions[i.id] : undefined;
      return !uguali(dec(statoDi(b, r)), dec(r));
    }
    // il widget del campo di una nota (come `contenitore` della scheda: la corretta vive con le alternative)
    function campoDellaNota(i) {
      const f = i.target.field;
      return st.campi.find(w => w.field === f || (G1 && f === '$link' && w.field === 'rel') || (f === 'correctIndex' && w.field === 'options') ||
        (f === 'criteri' && w.field === 'criteria')) || null;
    }
    /* Giro 2 bis, la prova a secco del difetto 1: il valore dopo un reject della nota, su una copia (la revisione vera non
       cambia) — in G1 il campo della nota, in G2 il materiale intero. `undefined` se non si legge o se la riga resterebbe
       in conflitto (allora nessun «Tieni…»: il testo che resta non si sa). */
    function dopoReject(i) {
      let r;
      try { r = core.setDecision(review(), i.id, 'reject', {}); } catch (e) { return undefined; }
      const bersaglio = G1 ? bersaglioDi(st.attiva, i.target.field) : { kind: 'item', id: String(st.attiva), field: '$item' };
      const s = BC.testoAdesso(null, r, { db: G1 ? dbMappa() : dbItems(), bersaglio, sources: fonti() });
      return s.errore || !s.ok || s.escluso ? undefined : s.adesso;
    }
    /* Il valore del campo della nota in `ora` è diverso dall'«Originale», il testo generato (confronti come la regola 1,
       `piano`). `ora` è il campo (G1) o il materiale (G2). Il campo è quello del widget della nota: una nota «criteri» vive
       nel campo «criteria» (giro 2 bis, difetto 6: prima si leggeva `ora.criteri`, che non c'è, e il nome restava
       «Tieni Originale» anche coi criteri cambiati); la corretta si confronta insieme alle alternative. */
    function diversoDaGenerato(i, ora) {
      const c = campoDellaNota(i);
      if (G1) return BC.piano(c && c.tipo === 'testo' ? mostra(ora, c.it) : testo(ora)) !== BC.piano(c && c.tipo === 'testo' ? c.riferimento : testo((nodoBase(st.attiva) || {})[i.target.field]));
      const gen = base(st.attiva);
      if (!gen || !ora) return false;
      if (i.target.field === '$item') return BC.esitoBottone(gen, ora) === 'rivisto';
      if (c && c.tipo === 'testo') return BC.piano(mostra(ora[c.field], c.it)) !== BC.piano(c.riferimento);
      return valoreCambiato(c ? c.field : i.target.field, ora, gen);
    }
    /* Giro 2 ter — D33: il valore del campo della nota in `ora` (come `diversoDaGenerato`: il campo in G1, il materiale in
       G2) è quello a schermo, a meno di spazi (`piano`). Per un campo di testo conta il testo del riquadro, e l'area di
       sotto deve essere «Tua versione» (il bottone nomina un'area che c'è); senza aree il valore a schermo
       (`itemASchermo`), per tutto il materiale il testo che arriverà all'allievo (`esitoBottone`). */
    function comeASchermo(i, ora) {
      const c = campoDellaNota(i);
      if (c && c.tipo === 'testo') return c.aree().tua && BC.piano(mostra(G1 ? ora : (ora || {})[c.field], c.it)) === BC.piano(c.testoMostrato());
      if (G1 || !ora || !st.attiva) return false;
      const vista = itemASchermo();
      if (i.target.field === '$item') return BC.esitoBottone(vista, ora) === 'approvato';
      return !valoreCambiato(c ? c.field : i.target.field, ora, vista);
    }
    function valoreCambiato(f, ora, gen) {
      const campi = f === 'options' || f === 'correctIndex' ? ['options', 'correctIndex'] : [f];
      return !uguali(BC.piano(campi.map(k => ora[k])), BC.piano(campi.map(k => gen[k])));
    }
    /* Il valore del campo della nota è diverso dall'«Originale», il testo generato: a schermo (`aSchermo`, con la battitura
       in sospeso: per i nomi) o salvato (per l'esito, D28). In G1 un campo senza widget di testo non ha aree: no. */
    function cambiatoDaOriginale(i, aSchermo) {
      const c = campoDellaNota(i);
      if (c && c.tipo === 'testo') return BC.piano(aSchermo ? c.testoTenuto() : c.salvatoMostrato) !== BC.piano(c.riferimento);
      if (G1 || !st.attiva) return false;
      const gen = base(st.attiva);
      if (!gen) return false;
      return diversoDaGenerato(i, aSchermo ? itemASchermo() : (anteprima(st.attiva).item || gen));
    }
    /* Giro 2 bis — D31 (Giacomo: «Riga col nome sul campo»): i campi di G2 senza aree (alternative, elenchi, criteri,
       righe) e il materiale intero portano una riga piccola col nome del valore a schermo, come il campo solo (D21):
       «Originale» finché è quello generato, «Tua versione» dopo una modifica, anche in sospeso. C'è dove i bottoni di una
       nota nominano quelle aree («Tieni Originale» / «Tieni la tua versione»): un campo con una nota della scheda, il
       materiale con una nota su tutto il materiale che non propone di escluderlo (quella dice «Escludi / Tieni il
       materiale», fuori dalla regola). Stesso pezzo e stessa classe della riga D21 (`.mrv-veste-sotto`). */
    function nomiValori() {
      if (G1 || !st.attiva) return;
      const gen = base(st.attiva), r = review();
      const sue = Array.from(st.noteEl.keys()).map(id => (r.initial.issues || []).find(x => x.id === id)).filter(i => i && i.target);
      let ora = null;
      /* 0086, giro 3c (§4.3, D37.6): con le spunte, «Proposta» quando il valore a schermo è esattamente la proposta copiata di
         una nota del controllo (sul campo: le alternative, la corretta, un elenco, le righe; sul materiale: il materiale
         intero), a meno di spazi */
      const proposte = st.modo === 'spunte' ? sue.filter(i => i.origin !== 'teacher' && i.hasProposal && i.after !== null && i.after !== undefined) : [];
      const nome = (cambiato, proposta) => {
        if (!ora) ora = itemASchermo();
        return proposta && proposta() ? PROPOSTA() : cambiato() ? TUA_VERSIONE() : ORIGINALE();
      };
      const dipingi = (p, frase) => { if (!p) return; if (p.hidden !== !frase) p.hidden = !frase; if (p.textContent !== frase) p.textContent = frase; };
      st.campi.forEach(c => {
        if (c.tipo === 'testo' || !c.nomeEl) return;
        const sueQui = proposte.filter(i => i.target.field !== '$item' && campoDellaNota(i) === c);
        dipingi(c.nomeEl, gen && sue.some(i => campoDellaNota(i) === c) ? nome(() => valoreCambiato(c.field, ora, gen),
          () => sueQui.some(i => uguali(BC.piano(i.after), BC.piano(i.target.field === 'correctIndex' ? ora.correctIndex : ora[c.field])))) : '');
      });
      const materiale = sue.some(i => i.target.field === '$item' && !esclusioneProposta(i));
      dipingi(content.querySelector('[data-veste-scheda] [data-veste-nome-materiale]'), gen && materiale ? nome(() => BC.esitoBottone(gen, ora) === 'rivisto',
        () => proposte.some(i => i.target.field === '$item' && typeof i.after === 'object' && BC.esitoBottone(i.after, ora) === 'approvato')) : '');
    }
    /* 0086: la parte di una nota che segue il testo a schermo — la proposta letta nella nota, il nome e il senso del bottone
       «tieni» (`data-veste-modo`, che il clic legge), il terzo bottone, «Escludi il materiale» di G2 (§4.9). La chiamano
       `aggiornaNote` e, mentre si scrive o dopo uno scarto, `aggiornaNomi` (§4.5, «Quando si ridisegnano»). */
    /* `inVista` (giro 2 bis): i gesti della nota si vedono — lo calcola chi chiama: `aggiornaNote` con la sua regola (aperta,
       un gesto da ripetere, il fuoco sui bottoni), `aggiornaNomi` anche coi gesti ancora in vista dall'ultimo ridisegno
       (il fuoco se n'è andato, ma `aggiornaNote` non è ancora passato: mentre si scrive in un altro campo si rifanno solo i
       nomi). Su una nota decisa il nome costa una prova a secco, che si fa solo così. */
    function nomiNota(i, el, azioni, e, aperta, inVista) {
      const s = scelteNota(i, inVista);
      /* Dodicesimo giro, Q19: una nota la cui proposta è stata corretta a mano («Testo modificato da te») mostra la sua
         proposta. 0086 (D24 nei nomi, D25): la proposta del controllo sta nell'area «Proposta» solo finché l'area la
         contiene esattamente; appena ci si scrive sopra, o l'area mostra un'altra cosa, si legge qui. Scelta o tenuta, la
         proposta non si ripete (com'era). */
      const propostaEl = el.querySelector('[data-veste-nota-proposta]');
      if (propostaEl) { const via = !(aperta || e === 'edited') || !!(s && s.inArea); if (propostaEl.hidden !== via) propostaEl.hidden = via; }
      const tieni = azioni.querySelector('[data-veste-tieni]');
      if (!tieni) return;
      const nome = s.tieni === 'tua' ? TIENI_TUA() : TIENI_ORIGINALE();
      if (tieni.textContent !== nome) tieni.textContent = nome;
      if (tieni.getAttribute('data-veste-modo') !== (s.tieni || '')) tieni.setAttribute('data-veste-modo', s.tieni || '');
      let terzo = azioni.querySelector('[data-veste-tua]');
      /* Il terzo bottone che deve sparire mentre il fuoco ci sta, o ci sta arrivando (Tab dal campo: l'uscita ha appena
         salvato il ritocco e chiuso la nota), resta finché il fuoco non se ne va: fa la stessa cosa del primo, che intanto
         non si mostra (nessun nome due volte). Togliere un elemento gli toglierebbe il fuoco. */
      const trattenuto = !s.terzo && !!terzo && s.tieni === 'tua' && (doc.activeElement === terzo || st.fuocoInArrivo === terzo);
      const via = !s.tieni || trattenuto;
      if (tieni.hidden !== via) tieni.hidden = via;
      if (s.terzo && !terzo) {
        terzo = terzoBottone(i.id);
        // in fondo (Q20) i bottoni nominano la nota a cui rispondono, come in `piazzaRisposta`
        if (st.inFondo && st.inFondo.id === i.id) terzo.setAttribute('aria-describedby', TESTO_IN_FONDO);
        azioni.appendChild(terzo);
      } else if (!s.terzo && terzo && !trattenuto) terzo.remove();
    }
    // 0086 (§4.5, «Quando si ridisegnano»): nomi, aree della nota e terzo bottone mentre si scrive e dopo uno scarto
    function aggiornaNomi() {
      nomiValori();   // giro 2 bis, D31: la riga col nome sui campi di G2 senza aree
      if (!st.noteEl.size) return;
      const conflitti = conflittiDi(st.info), r = review();
      st.noteEl.forEach((el, id) => {
        const i = (r.initial.issues || []).find(x => x.id === id);
        if (!i) return;
        const e = esito(i), azioni = st.inFondo && st.inFondo.id === id ? st.inFondo.azioni : el.querySelector('[data-veste-azioni]');
        const aperta = e === 'pending' || conflitti.has(id);
        if (azioni) nomiNota(i, el, azioni, e, aperta, aperta || st.daRipetere.has(id) || fuocoSuiGesti(id, azioni) || !azioni.hidden);
      });
    }
    function aggiornaNote() {
      // G1: nessuna anteprima per materiale; un collegamento tolto non spegne le note (la sua nota è già decisa)
      const conflitti = conflittiDi(st.info), r = review(), sola = !editabile() || stantia() || (!G1 && !!st.attiva && anteprima(st.attiva).escluso);
      const vive = [];
      st.noteEl.forEach((el, id) => {
        const i = (r.initial.issues || []).find(x => x.id === id);
        if (!i) return;
        const e = esito(i), inConflitto = conflitti.has(id), aperta = e === 'pending' || inConflitto;
        el.setAttribute('data-esito', inConflitto ? 'conflitto' : e);
        // Q20: i bottoni di una nota stanno nella nota o, se è la nota sola, nella barra in fondo (`piazzaRisposta`)
        const esitoEl = el.querySelector('[data-veste-esito]'), azioni = st.inFondo && st.inFondo.id === id ? st.inFondo.azioni : el.querySelector('[data-veste-azioni]');
        // la proposta letta nella nota, il nome dei bottoni e il terzo bottone (0086: `nomiNota`, la regola unica dei nomi);
        // giro 2 bis: coi gesti in vista secondo la regola qui sotto (il fuoco si guarda di nuovo dopo: il terzo bottone cambia)
        // giro 3b: una nota con la spunta non ha gesti — la spunta e l'area «Proposta» (`spuntaNota`)
        if (azioni) nomiNota(i, el, azioni, e, aperta, aperta || st.daRipetere.has(id) || fuocoSuiGesti(id, azioni));
        else spuntaNota(el, i, e, aperta, sola);
        const esclusione = i.target.field === '$item' && i.hasProposal && i.after === null, sulCollegamento = G1 && i.target.field === '$link';
        /* 0086 (D28, Giacomo: ««Tenuta la tua versione»»): una nota tenuta (reject) col testo diverso dall'«Originale» dice
           «Tenuta la tua versione», non «Testo mantenuto senza modifiche». Le parole di un collegamento, il collegamento
           intero e il materiale escluso o tenuto hanno le loro frasi, fuori dalla regola. */
        const tenuta = e !== 'kept' || sulCollegamento || esclusione ? '' : !(G1 && i.target.field === 'rel') && cambiatoDaOriginale(i, false)
          ? TENUTA_TUA() : t('rv_outcome_kept', 'Testo mantenuto senza modifiche');
        const nomi = { applied: t('rv_outcome_applied', 'Proposta scelta'),
          kept: sulCollegamento ? t('rv_veste_g1_collegamento_tenuto', 'Collegamento tenuto') : esclusione ? t('rv_veste_materiale_tenuto', 'Materiale tenuto') : tenuta,
          edited: t('rv_outcome_edited', 'Testo modificato da te'), excluded: sulCollegamento ? t('rv_veste_g1_collegamento_tolto', 'Collegamento tolto') : t('rv_outcome_excluded', 'Esclusione scelta') };
        const quarantena = el.querySelector('[data-veste-quarantena]');
        if (quarantena) {
          let frase = null;
          try { frase = e === 'pending' && E.strato ? E.strato.stato([i]) : null; } catch (x) { frase = null; }
          quarantena.hidden = !frase; if (quarantena.textContent !== (frase || '')) quarantena.textContent = frase || '';
        }
        esitoEl.hidden = !inConflitto && e === 'pending';
        esitoEl.textContent = inConflitto ? t('rv_decision_conflict', 'Scelte in conflitto') : (nomi[e] || '');
        /* G1, N6 (giro del 07/10): la nota decisa si riduce a una riga con «…» (foglio di stile): il testo intero resta nel
           `title`. Aperta (o in conflitto) si legge intera e il `title` non c'è. */
        const testoNota = G1 ? el.querySelector('.mrv-veste-nota-testo') : null;
        if (testoNota) {
          const ridotta = !aperta, intero = String(i.problem || '');
          if (ridotta && testoNota.getAttribute('title') !== intero) testoNota.setAttribute('title', intero);
          else if (!ridotta && testoNota.getAttribute('title') != null) testoNota.removeAttribute('title');
        }
        // giro 3b: le note con la spunta non hanno gesti da tenere in vista né da spostare in fondo (cade Q20 sui nodi)
        if (!azioni) return;
        // R6 da tastiera: arrivati sul bottone con Shift+Tab, l'uscita dal campo salva e chiude la nota — ma i suoi
        // gesti restano finché il fuoco sta lì, così Invio registra il gesto scelto
        // terzo giro, difetto A: nel browser il blur del campo arriva PRIMA del focus sul bottone, e durante il blur
        // il fuoco è su body: conta anche dove il fuoco sta andando (`relatedTarget` del blur, in `st.fuocoInArrivo`)
        const fuocoQui = fuocoSuiGesti(id, azioni);
        // quarto giro, punto 4: un gesto respinto su questa nota si ripete dai suoi bottoni, anche se ora è decisa
        azioni.hidden = !(aperta || fuocoQui || st.daRipetere.has(id)) || sola;
        vive.push({ id, el, azioni, aperta, inAttesa: e === 'pending' && !inConflitto, trattenuta: fuocoQui || st.daRipetere.has(id) });
      });
      // giro 3b: sulla scheda con le spunte nessuna nota manda i suoi bottoni in fondo (Q20 cade sui nodi)
      piazzaRisposta(vive, sola || st.modo === 'spunte');
    }
    /* Il fuoco sta sui gesti di una nota, o ci sta arrivando (`st.fuocoInArrivo`, il `relatedTarget` del blur del campo).
       Tredicesimo giro, Q20: i bottoni della nota sola stanno in fondo, e col Tab dal campo il fuoco passa prima da «⌘+Z»
       della barra: per la nota in fondo conta il fuoco dentro la barra, così i suoi gesti si raggiungono ancora da tastiera
       dopo che l'uscita dal campo ha salvato (R6, come Shift+Tab verso la nota sopra il campo). Una regola sola per
       `aggiornaNote` (i gesti restano in vista) e `nomiNota` (giro 2 bis: il nome di una nota decisa si calcola solo coi
       gesti in vista). */
    function fuocoSuiGesti(id, azioni) {
      const bottoni = Array.from(azioni.querySelectorAll('button'));
      const barra = st.inFondo && st.inFondo.id === id && st.bar && st.bar.el && typeof st.bar.el.contains === 'function' ? st.bar.el : null;
      const qui = x => !!x && (bottoni.indexOf(x) >= 0 || (!!barra && barra.contains(x)));
      return qui(doc.activeElement) || qui(st.fuocoInArrivo);
    }
    /* Tredicesimo giro, Q20 (Giacomo, 07/10: «potresti spostare il bottone 'Va bene così' dalla sezione gialla della nota
       alla barra in fondo dopo il testo 'La nota aspetta la sua risposta.'?»; «chiudilo col ritocco piccolo, le spunte
       vanno nello 0086»). Con UNA sola nota aperta sulla scheda i suoi bottoni vanno nella barra in fondo, nel posto dopo
       la frase della barra; con due o più restano nelle note. Si sposta la scatola dei bottoni stessa, coi suoi ascolti:
       il gesto, la battitura in sospeso (R6, D1, D2), ⌘Z e il nome che segue lo stato (Q15) sono quelli di prima. La nota
       resta sopra il campo e dice in piccolo dove rispondere; i bottoni in fondo la nominano (aria-describedby verso il
       suo testo: una nota sola alla volta sta in fondo, quindi l'id è uno). Chiusa la nota sola, i bottoni tornano nella
       nota (nascosti), salvo finché il fuoco è su di loro o ci sta arrivando, o un gesto respinto va ripetuto
       (`trattenuta`): restano in fondo, perché spostare un elemento gli toglie il fuoco. Se un bottone col fuoco si
       sposta lo stesso (un'altra nota riaperta), il fuoco gli torna. */
    const TESTO_IN_FONDO = 'mrv-veste-nota-in-fondo';
    function piazzaRisposta(vive, sola) {
      const posto = st.bar && st.bar.risposta;
      if (!posto) return;
      const aperte = vive.filter(v => v.aperta), ora = st.inFondo ? vive.find(v => v.id === st.inFondo.id) : null;
      const scelta = sola ? null : aperte.length === 1 ? (aperte[0].inAttesa ? aperte[0] : null) : !aperte.length && ora && ora.trattenuta ? ora : null;
      vive.forEach(v => {
        const qui = !!scelta && scelta.id === v.id, era = !!ora && ora.id === v.id;
        if (qui !== era) {
          const bottoni = Array.from(v.azioni.querySelectorAll('button')), fuoco = bottoni.indexOf(doc.activeElement) >= 0 ? doc.activeElement : null;
          const testoNota = v.el.querySelector('.mrv-veste-nota-testo');
          if (qui) {
            if (testoNota) testoNota.id = TESTO_IN_FONDO;
            bottoni.forEach(b => b.setAttribute('aria-describedby', TESTO_IN_FONDO));
            posto.replaceChildren(v.azioni);
          } else {
            if (testoNota) testoNota.removeAttribute('id');
            bottoni.forEach(b => b.removeAttribute('aria-describedby'));
            v.el.appendChild(v.azioni);
          }
          if (fuoco && fuoco.focus) fuoco.focus();
        }
        const riga = v.el.querySelector('[data-veste-in-fondo]');
        if (riga) riga.hidden = !qui || v.azioni.hidden;
      });
      st.inFondo = scelta ? { id: scelta.id, azioni: scelta.azioni } : null;
      if (!scelta) posto.replaceChildren();
      posto.hidden = !scelta || scelta.azioni.hidden;
    }
    // la scheda si ricostruisce: il posto in fondo si svuota (le note di prima non ci sono più)
    function svuotaFondo() {
      st.inFondo = null;
      const posto = st.bar && st.bar.risposta;
      if (posto) { posto.replaceChildren(); posto.hidden = true; }
    }

    /* ── 0086, giri 3b e 3c: LA REGOLA UNICA DELLE SPUNTE ───────────────────────────────────────────────────────────────
       D36 (Giacomo, 09/10: «sì alla regola unica delle spunte»), D37 («sì a tutte»), D38 («si per tutte e due»), D39, D40;
       ADR 0012 rev. 12 e ADR 0010 rev. 4, firmate il 09/10. Su una scheda con note del controllo (un nodo, un collegamento,
       un materiale di G2) o con scelte salvate prima in conflitto (D37.7):
       · ogni nota del controllo ha una spunta nativa al posto dei bottoni (§4.2): sulla descrizione «Tieni la frase» / «Tieni
         le {n} frasi» / «Tieni tutto il testo», piena all'apertura e vuota sulle note che contestano la descrizione intera
         (D39), con le spunte legate di due note sullo stesso passo (D37.3); sul collegamento «Tieni il collegamento»; in G2
         «Tieni il materiale». Lo stato è della seduta del Banco (`st.spunte`): resta cambiando riga, riparte dal core alla
         riapertura (D38.2). Togliere o rimettere una spunta non scrive e non è una voce di ⌘Z; casella ed etichetta non
         tolgono il fuoco al campo (`preventDefault` al `mousedown`). Le note sul titolo (D37.4) e le richieste del docente
         (L6) non hanno spunta né bottoni: il titolo si corregge nel campo, e il bottone in fondo chiude le une e le altre;
       · il campo parte dall'«Originale» (niente proposta scritta da `carica`, niente regola 1-bis), o — con scelte salvate in
         conflitto — dal testo delle scelte che non si contraddicono (L3); l'area «Proposta» di ogni nota con proposta la
         copia nel campo con un clic o con Invio (§4.3; nei campi di G2 senza aree, D31, la proposta letta nella nota); il
         nome del campo e quello del bottone seguono il testo mentre si scrive (`c.aree`); giro 3d (D41): il campo è una
         BOZZA fino al bottone in fondo — l'uscita non scrive niente, la bozza resta per la seduta (`st.bozze`), Esc la scarta;
         senza bottone in fondo (le note già tutte decise) il campo si salva all'uscita come correzione del docente, senza
         decidere le note (`correzioneDelCampo`, D37.1);
       · il bottone in fondo (§4.4) registra campi e spunte in UNA scrittura e UNA voce di ⌘Z (`chiamateBottone`; in G2 col
         visto del materiale, «Approvato» / «Rivisto»), poi passa alla riga dopo (D19); giro 3d (D41): la bozza del campo
         entra nella stessa scrittura e nella stessa voce (prima si salvava in una voce sua, R6). È spento, con la riga che
         dice che cosa premere o scrivere, quando una spunta tolta svuoterebbe un nodo non riscritto in questa seduta (D38.1,
         D39, D40: la veste passa al core le descrizioni all'apertura, `st.apertura`; se il campo riscritto riprende ancora
         una frase generata, la riga dice quale), il campo è vuoto, il punto della frase non si ritrova, o (giro 3d, D42) la
         prova sui materiali colpisce un nodo; acceso, accanto l'avviso del costo (§4.6, D13, D18: solo sulla descrizione) e,
         con una spunta tolta, che cosa esce (D43: dalla descrizione, e da quali nodi; il collegamento; il materiale escluso),
         e in G1 il bottone dice «Tieni la tua versione». Spento e avviso si ricalcolano sul testo in sospeso dopo una pausa
         (D23). */
    function modoSpunte(x, info) {
      if (!x || x.fuori || x.assente) return false;
      if (G1 && x.tipo !== 'nodo' && x.tipo !== 'collegamento' && x.tipo !== 'non-letto') return false;
      return conflittiDi(info).size > 0 || noteDi(x.id).some(i => i && i.target && i.origin !== 'teacher');
    }
    // D40: la descrizione di ogni nodo all'apertura del Banco, come risulta dalle decisioni salvate (una volta sola)
    function fotografaApertura() {
      if (!G1 || st.apertura) return;
      const m = new Map(), r = review(), db = dbMappa();
      ((r.baseSnapshot && r.baseSnapshot.nodes) || []).forEach(n => {
        if (!n || n.id == null) return;
        let s;
        try { s = BC.testoAdesso(null, r, { db, bersaglio: { kind: 'node', id: String(n.id), field: 'desc' }, sources: fonti() }); } catch (e) { s = null; }
        if (s && !s.errore && s.ok && !s.escluso && typeof s.adesso === 'string') m.set(String(n.id), s.adesso);
      });
      st.apertura = m;
    }
    // la riga come la legge il core (`bersaglioDellaRiga`): in G1 la riga della barra (nodo, collegamento, non letto), in G2 il materiale
    const rigaCore = x => G1 ? x : { kind: 'item', id: String(x.id) };
    // le spunte della riga dal core (§4.1); una nota nuova per la seduta parte com'è nel core; un gruppo legato con una
    // spunta tolta è tolto tutto (D37.3: la seduta non lascia mai un gruppo a metà)
    function aggiornaSpunte(x) {
      let sp = null;
      try { sp = BC.spunteDellaRiga({ review: review(), db: G1 ? dbMappa() : dbItems(), sources: fonti(), riga: rigaCore(x) }); } catch (e) { sp = null; }
      st.sp = sp && !sp.errore && Array.isArray(sp.note) ? sp : { note: [], gruppi: [] };
      st.sp.note.forEach(n => { if (!st.spunte.has(String(n.id))) st.spunte.set(String(n.id), !!n.piena); });
      (st.sp.gruppi || []).forEach(g => { if (g.some(id => st.spunte.get(String(id)) === false)) g.forEach(id => st.spunte.set(String(id), false)); });
    }
    const spuntaDi = id => (st.sp && st.sp.note.find(n => String(n.id) === String(id))) || null;
    const spuntaPiena = n => st.spunte.has(String(n.id)) ? !!st.spunte.get(String(n.id)) : !!n.piena;
    const nomeSpunta = n => n.campo !== 'desc' ? (G1 ? TIENI_COLLEGAMENTO() : TIENI_MATERIALE())
      : n.intero ? TIENI_TUTTO() : n.frasi > 1 ? TIENI_FRASI(n.frasi) : TIENI_FRASE();
    // le note aperte della riga, che il bottone in fondo chiude: quelle del controllo e le richieste del docente (L6)
    function noteFondo() {
      if (st.modo !== 'spunte' || !st.attiva) return [];
      return noteDi(st.attiva).filter(i => i && i.target && esito(i) === 'pending');
    }
    // il bottone in fondo c'è: note aperte, o scelte salvate in conflitto da sostituire (D37.7); non su un materiale escluso
    function fondoAttivo() {
      if (st.modo !== 'spunte' || !st.attiva) return false;
      if (!G1 && anteprima(st.attiva).escluso) return false;
      return noteFondo().length > 0 || conflittiDi(st.info).size > 0;
    }
    // i campi che il bottone in fondo registra con le loro note: quelli delle note aperte e delle note in conflitto
    function campiFondo() {
      const conflitti = conflittiDi(st.info), campi = [];
      if (st.modo !== 'spunte' || !st.attiva) return campi;
      noteDi(st.attiva).filter(i => i && i.target && (esito(i) === 'pending' || conflitti.has(i.id))).forEach(i => {
        const c = campoDellaNota(i);
        if (c && c.aree && campi.indexOf(c) < 0) campi.push(c);
      });
      return campi;
    }
    /* D37.6 (regola unica dei nomi, D25): «Tieni Originale» se il campo ha l'Originale, «Usa Proposta» se ha esattamente una
       proposta, «Tieni la tua versione» altrimenti; sui campi con note aperte (la descrizione, il titolo, le parole di un
       collegamento), col testo a schermo, battitura compresa, e gli spazi che non contano (`c.aree`). Con due campi vince
       «Tua versione», poi «Proposta»: il nome dice che cosa resta di diverso dall'Originale (scelta dichiarata, il packet
       parla di un campo). In G2 il bottone del materiale, «Approvato» / «Rivisto» (revisione 5, A). */
    function nomeFondo() {
      if (!G1) return nomeBottone();
      /* giro 3d, D43 (Giacomo: ««Tieni la tua versione» e la riga (Raccomandato)»): con almeno una spunta tolta — anche la
         spunta vuota di una nota sulla descrizione intera (D39), che vale «la frase esce» — il bottone dice «Tieni la tua
         versione», qualunque testo ci sia nel campo: il clic toglie delle frasi, e la riga accanto dice quali (`effettoTolta`).
         Prima diceva «Tieni Originale» e al clic toglieva frasi, anche da altri nodi, senza dirlo. Cambia D37.6 per questo caso. */
      if (st.sp && st.sp.note.some(n => !spuntaPiena(n))) return TIENI_TUA();
      const stati = campiFondo().map(c => { const a = c.aree(); return a.proposta ? 'proposta' : a.tua ? 'tua' : 'originale'; });
      return stati.indexOf('tua') >= 0 ? TIENI_TUA() : stati.indexOf('proposta') >= 0 ? USA() : TIENI_ORIGINALE();
    }
    const spunteDaPassare = () => new Map(st.sp ? st.sp.note.map(n => [n.id, spuntaPiena(n)]) : []);
    // il motivo delle correzioni del docente che il bottone fa nascere: sulle descrizioni delle quasi-copie col « · » della
    // veste (`richiesta`); sul collegamento tolto e sul materiale escluso, quello dell'esclusione del docente di oggi
    const problemaFondo = id => G1 && !collegamento(rigaDi(id)) ? t('rv_teacher_edit', 'Modifica del docente') + ': ' + nomeCampo('desc') + ' · ' + nomeMateriale(id)
      : t('rv_teacher_exclusion', 'Esclusione decisa dal docente');
    // giro 3d (D41): `rev` è la revisione su cui si calcola (al clic, quella con la bozza del campo già registrata in memoria)
    function chiamateFondo(spunte, campi, rev) {
      const id = st.attiva, x = rigaDi(id);
      if (!x) return { errore: 'riga_mancante' };
      try {
        return BC.chiamateBottone({ review: rev || review(), db: G1 ? dbMappa() : dbItems(), sources: fonti(), riga: rigaCore(x), campi: campi || {},
          spunte, apertura: st.apertura || new Map(), problema: problemaFondo(id) });
      } catch (e) { return { errore: (e && (e.code || e.message)) || 'errore' }; }
    }
    /* La riga accanto al bottone spento (giro 3c, punto 5): per ogni motivo che cosa premere o scrivere per riaccenderlo,
       con la nota la cui spunta lo spegne (il suo testo, accorciato) e il nodo che resterebbe vuoto (D38.1, D39, D40; il
       campo vuoto; il punto non ritrovato). */
    const FONDO_NIENTE = nome => t('rv_veste_fondo_niente', '«{nome}» non ha scritto niente.').replace('{nome}', () => nome);
    function rigaFondo(e) {
      const nome = id => '«' + String((nodoBase(id) || {}).label || id) + '»';
      const nota = id => { const i = id == null ? null : (review().initial.issues || []).find(x => x && String(x.id) === String(id)); return '«' + accorcia(i ? i.problem : '') + '»'; };
      // ogni segnaposto, anche ripetuto («{nodo}» due volte), col suo valore; in un passaggio solo (il testo di una nota
      // che contenesse «{nodo}» resta com'è)
      const con = (frase, valori) => frase.replace(/\{(nodo|nota)\}/g, (m, k) => own(valori, k) ? valori[k] : m);
      const r = e && e.daRiscrivere && e.daRiscrivere[0];
      if (r) {
        const desc = st.campi.find(c => c.field === 'desc');
        const vuoto = String(r.id) === String(st.attiva) && !!desc && !BC.piano(String(desc.dirty ? desc.valore() : desc.adesso == null ? '' : desc.adesso));
        // il campo vuoto: «Togliendo la spunta…» qui non sarebbe vero (le spunte possono essere tutte piene)
        if (vuoto) return con(t('rv_veste_fondo_vuoto', 'La descrizione di {nodo} è vuota: scrivi nel campo la descrizione da tenere, oppure premi Esc per rimettere quella di prima.'), { nodo: nome(r.id) });
        /* giro 3d, punto 4 (difetto 4 della verifica unica): il docente ha riscritto la descrizione in questa seduta, ma una
           frase riprende ancora quella generata (D40, L2): la riga dice quale, invece di ripetere «scrivi nel campo la
           descrizione» (il core la dà in `resta`, com'è scritta nel campo) */
        if (r.resta) return String(r.id) === String(st.attiva)
          ? t('rv_veste_fondo_resta', 'La tua descrizione contiene ancora «{frase}»: cambiala, o metti la spunta.').replace('{frase}', () => breve(r.resta))
          : con(t('rv_veste_fondo_resta_altrove', 'La descrizione di {nodo} contiene ancora «{frase}»: cambiala, o metti la spunta.'), { nodo: nome(r.id) }).replace('{frase}', () => breve(r.resta));
        // giro 3d, punto 4 (difetto 3): la nota è quella che il core mette per prima — per la descrizione intera la nota intera
        const valori = { nodo: nome(r.id), nota: nota((r.issueIds || [])[0]) };
        return r.motivo === 'descrizione_intera' ? con(t('rv_veste_fondo_intera', 'Con la spunta vuota sulla nota {nota} esce tutta la descrizione di {nodo}: metti la spunta per tenerla, o scrivi nel campo la descrizione che vuoi tenere.'), valori)
          : r.motivo === 'quasi_copia' ? con(t('rv_veste_fondo_quasi_copia', 'Con la spunta tolta sulla nota {nota} resterebbe vuota la descrizione di {nodo}, che ripete la stessa frase: rimetti la spunta, oppure riscrivi prima la descrizione di {nodo}.'), valori)
            : con(t('rv_veste_fondo_svuota', 'Con la spunta tolta sulla nota {nota} esce tutta la descrizione di {nodo}: rimetti la spunta, o scrivi nel campo la descrizione che vuoi tenere.'), valori);
      }
      /* giro 3d, D42 (Giacomo: ««Il bottone prova prima e avvisa» (Raccomandato)»): la prova sui materiali colpisce un nodo — un
         altro, o il suo — che resterebbe vuoto nei materiali, o perderebbe una frase che il taglio non toglie. La riga dice il
         nodo per nome, la nota la cui spunta lo colpisce e che cosa fare. */
      const k = e && e.colpiti && e.colpiti[0];
      if (k) {
        const valori = { nodo: nome(k.id), nota: nota((k.issueIds || [])[0]) };
        return k.motivo === 'vuoto'
          ? con(t('rv_veste_fondo_colpito_vuoto', 'Togliendo la spunta sulla nota {nota}, {nodo} resta vuota nei materiali: rimetti la spunta o correggi quel nodo.'), valori)
          : con(t('rv_veste_fondo_colpito_frase', 'Togliendo la spunta sulla nota {nota}, {nodo} perde nei materiali la frase «{frase}»: rimetti la spunta o correggi quel nodo.'), valori).replace('{frase}', () => breve((k.frasi || [])[0]));
      }
      if (e && e.errore === 'punto_non_ritrovato') return e.nodo != null && String(e.nodo) !== String(st.attiva)
        ? con(t('rv_veste_fondo_non_ritrovato_altrove', 'Non ritrovo nella descrizione di {nodo} la frase che la spunta tolta sulla nota {nota} farebbe uscire: rimetti la spunta.'), { nodo: nome(e.nodo), nota: nota(e.issueId) })
        : con(t('rv_veste_fondo_non_ritrovato', 'Non ritrovo nel campo la frase della nota {nota}, che la spunta tolta farebbe uscire: rimetti la spunta e, se la frase non deve entrare, toglila tu dal campo.'), { nota: nota(e.issueId) });
      if (e && e.errore === 'corsie') return con(t('rv_veste_fondo_corsie', 'Non riesco a calcolare che cosa esce con la spunta tolta sulla nota {nota}: rimetti la spunta e, se la frase non deve entrare, toglila tu dal campo.'), { nota: nota(e.issueId) });
      try { console.warn('[Banco] bottone in fondo spento:', e && e.errore); } catch (x) { /* senza console */ }
      return t('rv_veste_fondo_errore', 'Le scelte di questa scheda non si possono registrare ora: chiudi con {piu_tardi} e riapri la revisione.').replace('{piu_tardi}', () => PIU_TARDI());
    }
    // §4.6 (D1, D12, D13, D18): le frasi distinte delle note sulla descrizione con la spunta piena, come le conta la quarantena
    function avvisoFondo() {
      const piene = st.sp ? st.sp.note.filter(n => n.campo === 'desc' && spuntaPiena(n)) : [];
      if (!piene.length) return '';
      const issues = review().initial.issues || [];
      let c;
      try { c = BC.frasiContestate(piene.map(n => issues.find(i => i && i.id === n.id)).filter(Boolean)); } catch (e) { return ''; }
      return c.intero ? t('rv_veste_confermi_tutto', 'Confermi tutto il testo')
        : c.n === 1 ? t('rv_veste_confermi_una', 'Confermi 1 frase contestata')
          : c.n > 1 ? t('rv_veste_confermi_frasi', 'Confermi {n} frasi contestate').replace('{n}', c.n) : '';
    }
    /* Giro 3c: col bottone acceso, che cosa fa una spunta tolta dove il nome del bottone non lo dice — sul collegamento esce il
       collegamento (§4.5), in G2 il materiale è escluso (D37.5).
       Giro 3d, D43 (Giacomo: ««Tieni la tua versione» e la riga (Raccomandato)»): anche sulla descrizione la riga elenca che
       cosa esce e da quali nodi (prima «lo dicevano l'avviso e il campo», e non era vero: l'avviso conta le spunte piene e il
       campo mostra l'Originale intero). Le frasi vengono dal core (`escono` di `chiamateBottone`), accorciate con «…»; le
       stesse frasi in più nodi si dicono una volta, coi nodi insieme; oltre quattro frasi, quante ne restano. */
    const toltaFuoriDescrizione = () => !!st.sp && st.sp.note.some(n => n.campo !== 'desc' && !spuntaPiena(n));
    const MAX_ESCONO = 4;
    const breve = s => {
      s = String(s == null ? '' : s).trim();
      if (s.length <= 40) return s;
      const c = s.slice(0, 35), k = c.lastIndexOf(' ');
      return (k > 10 ? c.slice(0, k) : c).trimEnd() + '…';
    };
    const ESCONO = elenco => t('rv_veste_fondo_escono', 'Escono: {elenco}.').replace('{elenco}', () => elenco);
    const ESCE_DA = (frasi, nodi) => t('rv_veste_fondo_esce_da', '{frasi} da {nodi}').replace('{frasi}', () => frasi).replace('{nodi}', () => nodi);
    const E_ANCHE = () => t('rv_veste_fondo_e', 'e');
    const ALTRE = n => t('rv_veste_fondo_altre', 'e altre {n}').replace('{n}', n);
    const insieme = x => x.length < 2 ? (x[0] || '') : x.slice(0, -1).join(', ') + ' ' + E_ANCHE() + ' ' + x[x.length - 1];
    function effettoTolta(e) {
      if (toltaFuoriDescrizione()) {
        if (!G1) return t('rv_veste_fondo_esclude', 'Il materiale sarà escluso e non arriverà all’allievo.');
        const x = rigaDi(st.attiva);
        return t('rv_veste_fondo_toglie_collegamento', 'Esce il collegamento {collegamento}: le parole nel campo non contano più.').replace('{collegamento}', () => '«' + String((x && x.titolo) || '') + '»');
      }
      if (!G1 || !e || !Array.isArray(e.escono) || !e.escono.length) return '';
      const nome = id => '«' + String((nodoBase(id) || {}).label || id) + '»';
      const gruppi = [];
      e.escono.forEach(x => {
        const k = x.frasi.map(f => BC.piano(f)).join('\u0000'), g = gruppi.find(y => y.k === k);
        if (g) g.nodi.push(x.id); else gruppi.push({ k, frasi: x.frasi, nodi: [x.id] });
      });
      let resto = MAX_ESCONO, nascoste = 0;
      const pezzi = [];
      gruppi.forEach(g => {
        const qui = g.frasi.slice(0, Math.max(0, resto));
        nascoste += g.frasi.length - qui.length; resto -= qui.length;
        if (qui.length) pezzi.push(ESCE_DA(insieme(qui.map(f => '«' + breve(f) + '»')), insieme(g.nodi.map(nome))));
      });
      return ESCONO(pezzi.join('; ') + (nascoste ? ' ' + ALTRE(nascoste) : ''));
    }
    /* Il bottone in fondo calcolato col core sul testo a schermo (la battitura in sospeso compresa) e sulle spunte di adesso:
       spento con la sua riga, o acceso con l'avviso. Costa (`corsie` per ogni spunta tolta): si calcola alla scheda, al
       salvataggio, alla spunta, alla proposta copiata, allo scarto, e mentre si scrive solo dopo la pausa (D23). I campi in
       sospeso si passano come sono (un campo non valido no: lo dice già la sua riga). */
    function calcolaFondo() {
      if (st.timerFondo) { clearTimeout(st.timerFondo); st.timerFondo = null; }
      st.fondo = null;
      if (!fondoAttivo() || !editabile() || stantia()) return;
      const campi = {};
      st.campi.forEach(c => { if (c.dirty && !c.valida()) c.voci().forEach(v => { campi[v.field] = v.valore; }); });
      const e = chiamateFondo(spunteDaPassare(), campi);
      // giro 3d, D42: spento anche quando la prova sui materiali colpisce un nodo (`colpiti`)
      const spento = !!e.errore || !!(e.daRiscrivere && e.daRiscrivere.length) || !!(e.colpiti && e.colpiti.length);
      st.fondo = { spento, riga: spento ? rigaFondo(e) : effettoTolta(e), avviso: spento ? '' : avvisoFondo() };
      /* G2 (giro 2, difetto 3, com'era in `motivoBottone`): un materiale strutturalmente non valido, come sta a schermo, non
         diventa «Rivisto» né «Approvato» — salvo che una spunta tolta lo escluda */
      if (!G1 && !spento && !toltaFuoriDescrizione()) {
        const invalido = strutturali([itemASchermo()], st.attiva);
        if (invalido.length) st.fondo = { spento: true, riga: invalido[0], avviso: '' };
      }
    }
    function ricalcolaFondo() { if (st.modo !== 'spunte') return; calcolaFondo(); aggiornaAzioni(); }
    // D23: mentre si scrive resta lo stato di prima; il ricalcolo parte dopo la pausa dall'ultimo tasto
    function programmaFondo() {
      if (st.modo !== 'spunte') return;
      if (st.timerFondo) clearTimeout(st.timerFondo);
      st.timerFondo = setTimeout(() => { st.timerFondo = null; if (modal.isConnected === false) return; ricalcolaFondo(); }, PAUSA_FONDO);
    }
    // §4.2: la spunta cambiata (D37.3: con le legate). Non scrive, non entra nella pila di ⌘Z.
    function cambiaSpunta(id, valore) {
      const n = spuntaDi(id);
      if (n && editabile() && !occupato() && !stantia()) st.sp.note.filter(x => x.gruppo === n.gruppo).forEach(x => st.spunte.set(String(x.id), !!valore));
      aggiornaNote();
      ricalcolaFondo();
    }
    /* §4.3: l'area «Proposta» della nota copia la proposta nel campo (come una battitura: si salva all'uscita, o col bottone
       in fondo, R6). Giro 3c: nei campi di G2 senza aree (D31) il valore va nel suo campo — le alternative (con la corretta),
       un elenco, le righe; una nota sulla corretta la sceglie; la proposta di un materiale intero va in ogni campo. Sul
       collegamento le parole proposte vanno nel campo delle parole. */
    function copiaIn(c, valore, intero) {
      if (!c || !c.copia || valore === undefined) return;
      if (c.tipo === 'testo') { if (typeof valore === 'string') c.copia(mostra(valore, c.it)); return; }
      if (c.tipo === 'parole') { if (typeof valore === 'string') c.copia(valore); return; }
      if (c.tipo === 'opzioni') { c.copia(Array.isArray(valore) ? valore : null, intero ? intero.correctIndex : undefined); return; }
      if (c.tipo === 'lista') { if (Array.isArray(valore)) c.copia(valore); return; }
      if (valore !== null) c.copia(valore);
    }
    function copiaProposta(issueId) {
      const i = (review().initial.issues || []).find(x => x && x.id === issueId);
      if (!i || !editabile() || occupato() || stantia() || esito(i) !== 'pending' || !i.hasProposal || i.after === null || i.after === undefined) return;
      if (st.info && st.info.escluso) return;   // un collegamento tolto, un materiale escluso: i campi sono fermi (`blocca`)
      if (!G1 && i.target.field === '$item') {
        if (typeof i.after !== 'object') return;
        st.campi.forEach(c => { if (own(i.after, c.field)) copiaIn(c, i.after[c.field], i.after); });
        return;
      }
      const c = campoDellaNota(i);
      if (i.target.field === 'correctIndex') { if (c && c.copia) c.copia(null, i.after); return; }
      copiaIn(c, i.after, null);
    }
    /* §4.4 Il clic sul bottone in fondo. Le spunte e il nome che contano sono quelli al gesto (si fotografano al clic: il
       bottone non toglie il fuoco al campo). R6: la battitura in sospeso si salva prima, voce sua; respinta, il gesto non
       scrive e la riga lo dice. Poi le chiamate del core in UNA scrittura e UNA voce di ⌘Z (««nome» su Nodo»: ⌘Z riapre
       insieme tutte le note e rimette i testi di tutti i nodi toccati, quasi-copie comprese; le spunte restano come al
       clic), e la riga dopo (D19). Giro 3c, G2: nella stessa scrittura il visto del materiale («Approvato» / «Rivisto»,
       `setManualCheck` con l'impronta del materiale che ne esce, come `premiUnaVolta`), salvo che il materiale esca escluso;
       un materiale che ne uscirebbe non valido non si scrive, e la riga dice perché. */
    function vistoDopo(r, id) {
      let p;
      try { p = core.previewItem(r, dbItems(), id, { sources: fonti() }); } catch (e) { return { errore: messaggioErrore((e && e.code) || 'errore', true) }; }
      if (!p.ok) return { errore: t('rv_coverage_approve_blocked', 'Risolvi prima le decisioni in conflitto: serve l’anteprima del materiale.') };
      const item = (p.db.items || []).find(x => String(x.id) === String(id)) || null;
      if (!item) return { r };   // escluso: niente visto, la riga è «Escluso»
      const invalido = strutturali([item], id);
      if (invalido.length) return { errore: invalido[0] };
      return { r: core.setManualCheck(r, id, E.improntaTesto(JSON.stringify(item))) };
    }
    /* Giro 3d (D41, Giacomo: «Il campo si salva col bottone»): il campo della scheda è una bozza fino a qui, e il clic la
       registra insieme alle spunte in UNA scrittura e UNA voce di ⌘Z (prima la battitura si salvava in una voce sua, R6). La
       bozza si registra come la registrava l'uscita dal campo (`campiInMemoria`: la correzione del docente, le parole come
       l'editor della mappa), in memoria; sopra di lei le chiamate del bottone. Un campo non valido ferma il gesto e lo dice;
       una bozza respinta anche. D42: il core prova l'effetto sui materiali e, con un nodo colpito, non dà chiamate. */
    async function fondoUnaVolta() {
      const id = st.attiva;
      if (!id || !editabile() || occupato() || stantia() || !fondoAttivo()) return;
      const nome = nomeFondo(), spunte = spunteDaPassare();
      st.erroreScrittura = '';
      const sporchi = st.campi.filter(c => c.dirty);
      for (const c of sporchi) {
        const msg = c.valida();
        if (msg) { c.invalido = msg; avvisa(msg + ' ' + FONDO_NIENTE(nome)); aggiornaAzioni(); return; }
      }
      if (!(await attendi()) || st.attiva !== id) return;
      const prima = review();
      let base = prima;
      if (sporchi.length) {
        const m = campiInMemoria(prima, sporchi, false);
        if (m.errore) {
          if (!m.eccezione) st.erroreScrittura = m.errore;
          avvisa(messaggioErrore(m.errore) + ' ' + FONDO_NIENTE(nome));
          return;
        }
        base = m.r;
      }
      const e = chiamateFondo(spunte, {}, base);
      if (e.errore || (e.daRiscrivere && e.daRiscrivere.length) || (e.colpiti && e.colpiti.length)) {
        calcolaFondo(); aggiornaAzioni();
        avvisa(rigaFondo(e) + ' ' + FONDO_NIENTE(nome));
        return;
      }
      let r;
      try { r = togliSegnalazioni(applica(base, e.chiamate || []), e.togli); }
      catch (x) { avvisa(messaggioErrore((x && (x.code || x.message)) || 'errore', true)); return; }
      if (!G1) {
        const v = vistoDopo(r, id);
        if (v.errore) { avvisa(v.errore + ' ' + FONDO_NIENTE(nome)); return; }
        r = v.r;
      }
      // la bozza è registrata (o non cambiava niente): i campi si ricaricano dalle decisioni e la seduta la dimentica
      st.bozze.delete(String(id));
      sporchi.forEach(c => { c.dirty = false; c.sporcheVoci = false; c.invalido = ''; });
      if (r !== prima) {
        spegniEvidenza(); st.chiuseOra = null;
        registra(prima, [id], { tipo: 'bottone', nome }); imposta(r, [id]); E.save();
        aggiornaTutto();
        if (!(await attendi())) return;
      } else if (sporchi.length) aggiornaTutto();
      if (st.attiva === id) {
        const x = rigaDi(id);
        const prossima = x && !x.daFare ? BC.successiva(navigabili(), id) : null;
        if (prossima) await vaiA(prossima.id);
        else aggiornaAzioni();
      }
    }

    /* ── i campi ──────────────────────────────────────────────────────────── */
    function cresci(el) {
      if (E.fieldSizing || !el || !el.style || !el.scrollHeight) return;
      el.style.setProperty('height', 'auto');
      el.style.setProperty('height', el.scrollHeight + 'px');
    }
    // il richiamo alla scheda corretto a mano non si ricollega: si dice nella riga di stato (0069, giro 16)
    // i nomi fra parentesi quadre che non sono più un richiamo alla scheda (0069), solo col dossier da foto
    /* Gate breve, G11 (05/10: il rosso spariva dopo il salvataggio): `prima` è il testo GENERATO del campo
       (baseSnapshot), non l'ultimo salvato. Un nome rotto e salvato resta rotto, e resta segnato finché lo è. */
    function rottiDi(c, valore) {
      const DF = E.dossierFonte;
      if (!E.fonteScheda || !DF || typeof DF.richiamiRotti !== 'function' || !c.refs) return [];
      return DF.richiamiRotti(valore, { prima: testo(c.it[c.field]), etichette: (c.refs.mapping || []).map(m => m.label).concat((c.refs.note || []).map(n => n.label)) });
    }
    /* Gate 3, G9 (Giacomo: «fai diventare BOLD la riga di avviso in questo caso»): l'avviso dei richiami rotti va nella
       riga di stato in grassetto. Un `<strong>` dentro la riga: chi la riscrive dopo (un salvataggio) lo toglie da sé. */
    /* G14 (a): un nome ESATTO di un richiamo del testo generato, rimasto testo (salvato così in una seduta di prima),
       non è rotto ma scollegato: la frase dice la cosa vera. Aprire non lo ricollega (aprire non scrive); lo ricollega
       il primo salvataggio dopo una battitura nel campo (G12). */
    function frasiRichiami(c, valore) {
      const rotti = rottiDi(c, valore), giusti = rotti.filter(r => c.ricollegabile(r)), altri = rotti.filter(r => giusti.indexOf(r) < 0);
      const frasi = [];
      if (altri.length) frasi.push(t('rv_scheda_richiamo_rotto', '{x} non è più un richiamo alla scheda: arriverà all’allievo come testo. Rimetti il nome com’era.').replace('{x}', () => altri.join(', ')));
      if (giusti.length) frasi.push(t('rv_veste_richiamo_scollegato', '{x} è scritto giusto ma non è collegato alla scheda: arriverà all’allievo come testo. Per ricollegarlo modifica il campo e salva.').replace('{x}', () => giusti.join(', ')));
      return frasi;
    }
    function avvisaRichiami(c, valore) {
      if (!E.fonteScheda) return;
      const avviso = frasiRichiami(c, valore).join(' ');
      if (avviso) {
        const forte = doc.createElement('strong'); forte.textContent = avviso;
        E.status.replaceChildren(forte);
      } else if (c.avviso && E.status.textContent === c.avviso) avvisa('');
      c.avviso = avviso;
    }
    /* Lo strato dietro l'area di testo: lo STESSO testo del campo, carattere per carattere, con le parti aggiunte in verde
       (A.3) e i nomi fra parentesi quadre rotti in rosso (gate 3, G9: «colora la citazione corrotta di rosso»). I segni
       si mettono sulle POSIZIONI nel testo, non cercando il nome nell'HTML: un nome ritoccato può stare a cavallo fra
       una parte uguale e una aggiunta («[Carta d'identitàx]»), e allora verde e rosso si sovrappongono. Si costruisce a
       tratti di segni costanti; dove ci sono tutti e due il rosso sta dentro il verde, senza rompere i tag.
       `pezzi` = i pezzi del testo nuovo (`segni`) o null; `rotti` = i nomi da segnare. */
    function stratoHtml(pezzi, valore, rotti) {
      const n = valore.length, verde = new Array(n).fill(false), rosso = new Array(n).fill(false);
      if (pezzi) {
        let k = 0;
        pezzi.forEach(p => { const l = String(p.t).length; if (p.tipo === 'aggiunto') verde.fill(true, k, k + l); k += l; });
      }
      (rotti || []).forEach(r => {
        for (let i = valore.indexOf(r); i >= 0 && r; i = valore.indexOf(r, i + r.length)) rosso.fill(true, i, i + r.length);
      });
      let html = '';
      for (let i = 0; i < n;) {
        let j = i + 1;
        while (j < n && verde[j] === verde[i] && rosso[j] === rosso[i]) j++;
        let tratto = esc(valore.slice(i, j));
        if (rosso[i]) tratto = '<span class="mrv-veste-rotto">' + tratto + '</span>';
        if (verde[i]) tratto = '<ins>' + tratto + '</ins>';
        html += tratto; i = j;
      }
      return html;
    }
    function aiutoRichiami(refs) {
      if (!refs || !((refs.mapping || []).length || (refs.note || []).length)) return '';
      return E.fonteScheda ? t('rv_scheda_edit_help', 'Non modificare i nomi fra parentesi quadre: sono i richiami alla scheda.')
        : t('rv_reference_edit_help', 'I richiami alle fonti restano collegati quando modifichi il testo.');
    }

    /* Un campo di testo con «Prima / Proposta» (rev. 4, A.1-A.6). Lo stato si ricava dalle decisioni:
       · nota aperta con proposta → «Prima» = il testo adesso, «Proposta» = la proposta (si scrive in «Testi»);
       · testo cambiato da una decisione (anche una proposta corretta a mano e salvata) → «Prima» = il testo di partenza;
       · altrimenti un campo solo; appena si scrive compaiono «Prima» colorata e il selettore (A.4).
       Dal giro 11 dello 0075 (Q18) a schermo «Prima» si chiama «Originale», in ogni stato. Dal giro 12 (Q19, Giacomo:
       «Sempre l'Originale») niente scambio della rev. 4, A.5: con una proposta corretta e salvata «Prima» restava la
       proposta del controllo, «Proposta» la versione del docente e il testo di partenza era a un clic («Testo di
       partenza»). Ora sopra c'è sempre il testo generato, quindi quel bottone non serve più ed è tolto; la proposta del
       controllo si rilegge nella sua nota (`aggiornaNote`).
       0086 (D25, D21, D27; §4.5, «Le aree»): l'area di sopra è sempre «Originale» (il testo generato); quella di sotto si
       chiama «Proposta» solo finché contiene la proposta che `carica` ha scritto nel campo, «Tua versione» quando il testo
       (salvato o in sospeso) è diverso dall'«Originale» e non è quella proposta — un ritocco, o un testo cambiato dalle
       tue scelte su altre note. Senza nessuna delle due il campo è solo: tiene la sua etichetta e, dove il bottone di una
       nota può dire «Tieni Originale», porta la riga «Originale» nel posto del nome dell'area di sotto (D21). Il nome
       segue la battitura (`c.aree`, a ogni `dipingi`). */
    function widgetTesto(field, it, forte) {
      const el = doc.createElement('div'); el.className = 'mrv-veste-campo'; el.setAttribute('data-veste-campo', field);
      const idInput = 'mrv-veste-f-' + field, cls = forte ? ' mrv-veste-forte' : '';
      el.innerHTML = '<div class="mrv-veste-testa"><label class="mrv-veste-etichetta" for="' + esc(idInput) + '">' + esc(nomeCampo(field, it)) + '</label>' +
        '<span class="mrv-veste-seg" role="group" aria-label="' + esc(t('rv_veste_come_confrontare', 'Come confrontare i due testi')) + '" data-veste-seg hidden>' +
        '<button type="button" data-veste-vista="differenze">' + esc(t('rv_veste_differenze', 'Differenze')) + '</button>' +
        '<button type="button" data-veste-vista="testi">' + esc(t('rv_veste_testi', 'Testi')) + '</button></span></div>' +
        '<div class="mrv-veste-note" data-veste-note-di="' + esc(field) + '"></div>' +
        '<div class="mrv-veste-prima" data-veste-prima hidden><p class="mrv-veste-sotto" data-veste-prima-nome></p>' +
        '<button type="button" class="mrv-veste-link" data-veste-mostra-prima hidden></button>' +
        '<div class="mrv-veste-testo mrv-veste-fermo" data-veste-prima-testo></div></div>' +
        '<p class="mrv-veste-sotto" data-veste-proposta-nome hidden></p>' +
        '<div class="mrv-veste-testo mrv-veste-lettura' + cls + '" data-veste-diff role="button" tabindex="0" hidden title="' + esc(t('rv_veste_clic_scrivi', 'Fai clic per scrivere')) + '"></div>' +
        '<div class="mrv-veste-vivo" data-veste-vivo><div class="mrv-veste-testo mrv-veste-sfondo' + cls + '" data-veste-sfondo aria-hidden="true"></div>' +
        '<textarea id="' + esc(idInput) + '" class="mrv-veste-testo' + cls + '" data-veste-input="' + esc(field) + '" rows="1"></textarea></div>' +
        RIGA_SALVATO +
        '<p class="mrv-veste-aiuto" data-veste-richiami hidden></p>';
      const $ = s => el.querySelector(s);
      const input = $('[data-veste-input]'), diff = $('[data-veste-diff]');
      const c = { field, tipo: 'testo', el, it, input, inputs: [input], note: $('[data-veste-note-di]'), dirty: false, scrive: false, invalido: '',
        stato: null, refs: null, baseline: '', adesso: undefined, valoreCaricato: '', riferimento: '', salvatoEl: $('[data-veste-salvato]') };
      const chiave = () => st.attiva + '\u0000' + field;
      c.valida = () => '';
      /* G12 (05/10, Giacomo: «Sì, si ricollega»; cambia nella veste la scelta dello 0069, giro 16). Con la scheda come
         fonte, un nome ESATTO di un blocco fra parentesi quadre rimasto testo dopo `restoreReferences` (il nome rotto e
         salvato non è più nella vista del testo salvato) torna richiamo vero: quello che il testo GENERATO del campo ha
         per quel nome, con la stessa vista (note `[n]` e rimandi `[[id]]`). Un blocco che il testo generato non richiama
         resta testo. Si ricollega solo ciò che si salva: un campo non toccato mostra i dati come sono (rosso compreso). */
      let vistaGenerata = null;
      const ricollega = v => {
        if (!E.fonteScheda) return v;
        vistaGenerata = vistaGenerata || vista(it[field], it);
        return E.restoreReferences(v, vistaGenerata);
      };
      // G14 (a): un nome che il salvataggio ricollegherebbe è «scritto giusto», non rotto
      c.ricollegabile = nome => ricollega(nome) !== nome;
      const grezzo = () => E.restoreReferences(input.value, c.refs);
      // toccato: il testo è cambiato, oppure c'è un nome giusto da ricollegare (anche se il testo a schermo è lo stesso)
      const sporco = () => input.value !== c.baseline || ricollega(grezzo()) !== grezzo();
      c.valore = () => c.dirty ? ricollega(grezzo()) : grezzo();
      // `proposta`: la nota la cui proposta aperta `carica` ha scritto nel campo (A.5), se c'è (quarto giro, D1)
      c.voci = () => [{ field, valore: c.valore(), adesso: c.adesso, proposta: c.stato && c.stato.proposta ? c.stato.proposta.id : null }];
      c.testoMostrato = () => input.value;
      /* Quinto giro (07/10, D2): la bozza porta l'id della proposta su cui è stata scritta. Ricostruita la scheda
         (`costruisciSchedaG1(bozzeDi())`), `carica` mette in `c.stato` la nota aperta ADESSO: se è un'altra (la prima è
         stata decisa intanto), in G1 il campo non mostra più la sua proposta e il salvataggio non la passa al core. */
      c.bozza = () => ({ testo: input.value, proposta: c.stato && c.stato.proposta ? c.stato.proposta.id : null });
      c.ripristinaBozza = b => {
        if (G1 && c.stato && c.stato.proposta && c.stato.proposta.id !== b.proposta) c.stato = Object.assign({}, c.stato, { proposta: null });
        input.value = b.testo; c.dirty = b.testo !== c.baseline; c.scrive = c.dirty; if (c.dirty && !c.stato.proposta) st.viste.set(chiave(), 'testi');
      };
      c.carica = (adesso, note) => {
        const partenza = it[field], ora = adesso ? adesso[field] : partenza;
        c.adesso = clone(ora);
        // 0086: il testo salvato com'è a schermo, per i nomi (`c.testoTenuto`) e per l'esito «Tenuta la tua versione» (D28)
        c.salvatoMostrato = mostra(ora, it);
        /* 0086 (D21): la riga «Originale» del campo solo sta dove il bottone di una nota può dire «Tieni Originale» — un campo
           con una nota della scheda; in G1 sulla riga di un nodo, non fuori elenco (i collegamenti non hanno campi di testo).
           Giro 2 bis (difetto 5 del revisore): anche su un non letto con una richiesta del docente aperta, dove in fondo c'è
           «Tieni Originale» (prima la riga mancava); un non letto senza note non la porta, perché la nota non c'è */
        c.rigaOriginale = (note || []).some(i => i && i.target && i.target.field === field) &&
          (!G1 || (x => !!x && x.source == null && !x.fuori)(rigaDi(st.attiva)));
        if (c.dirty) return;   // una correzione non salvata resta nel campo; cambia solo l'«adesso» con cui si salverà
        const sue = note.filter(i => i.target.field === field && typeof i.after === 'string' && i.hasProposal);
        /* Giro 2, difetto 6 (rev. 4 A.5): una proposta aperta si scrive nel campo solo finché il campo è il testo di
           partenza. Se una decisione l'ha già cambiato (la correzione del docente con due note aperte, A.6, o un'altra
           proposta scelta) il campo mostra il testo come risulta dalle decisioni, e le proposte si leggono nelle note. */
        /* 0086, giro 3b (§4.3, D36.1): con le spunte il campo parte sempre dall'«Originale» — la proposta non si scrive più
           nel campo (e cade la regola 1-bis: uscire dal campo con la proposta non la sceglie); la si copia dall'area
           «Proposta» della nota (`c.copia`) */
        const aperta = st.modo !== 'spunte' && uguali(testo(ora), testo(partenza)) ? sue.find(i => i.origin !== 'teacher' && esito(i) === 'pending') : null;
        /* Undicesimo giro, Q18 (rev. 9, B.1: «nessun qualificatore dopo il salvataggio»): le aree si chiamano sempre
           «Originale» e «Proposta», una chiave ciascuna; via «· scelta tua», «· testo tuo» e «· proposta del controllo». */
        const nomi = [ORIGINALE(), PROPOSTA()];
        // dodicesimo giro, Q19: niente scambio dopo una proposta corretta e salvata — «Originale» è il testo di partenza
        c.stato = aperta ? { riferimento: ora, valore: aperta.after, proposta: aperta, nomi }
          : !uguali(testo(ora), testo(partenza)) ? { riferimento: partenza, valore: ora, nomi }
            : { riferimento: ora, valore: ora, nomi };
        c.valoreCaricato = testo(c.stato.valore);
        c.refs = vista(c.valoreCaricato, it);
        c.baseline = c.refs.text;
        c.riferimento = mostra(c.stato.riferimento, it);
        c.scrive = false; c.invalido = '';
        if (input.value !== c.baseline) input.value = c.baseline;
        const aiuto = $('[data-veste-richiami]'), frase = aiutoRichiami(c.refs);
        aiuto.hidden = !frase; aiuto.textContent = frase;
        // 0069, giro 17: sulla scheda l'avviso dei richiami è arancione (#b45309, 5,02:1 sul bianco)
        aiuto.className = 'mrv-veste-aiuto' + (E.fonteScheda ? ' mrv-veste-aiuto--scheda' : '');
      };
      /* 0086 (D25; §4.5, «Le aree»): il nome dell'area di sotto. «Proposta» finché il campo contiene la proposta che `carica`
         ha scritto (a meno di spazi: salvata così, vale «Usa Proposta»); «Tua versione» quando il testo a schermo (in
         sospeso o salvato) è diverso dall'«Originale» e non è quella proposta; nessuno dei due = il campo solo. Le
         differenze di soli spazi non contano, come per la regola 1 di `calcola` (`piano`). */
      c.aree = () => {
        const v = BC.piano(input.value);
        /* 0086, giro 3b (D37.6, §4.3): con le spunte il campo si chiama «Proposta» quando contiene esattamente (a meno di
           spazi) la proposta di una nota del controllo su questo campo — copiata, o scelta prima —, «Tua versione» quando è
           diverso dall'«Originale» e da ogni proposta, «Originale» altrimenti */
        if (st.modo === 'spunte') {
          const proposta = noteDi(st.attiva).some(i => i && i.target && i.origin !== 'teacher' && i.target.field === field && i.hasProposal &&
            typeof i.after === 'string' && BC.piano(mostra(i.after, it)) === v);
          return { proposta, tua: !proposta && v !== BC.piano(c.riferimento) };
        }
        const proposta = !!(c.stato && c.stato.proposta) && v === BC.piano(c.baseline);
        return { proposta, tua: !proposta && v !== BC.piano(c.riferimento) };
      };
      // 0086, giro 3b (§4.3): la proposta copiata dall'area della nota, come una battitura: si salva all'uscita (R1)
      c.copia = valore => {
        riprende(c);
        input.value = valore; c.dirty = sporco(); c.scrive = true; st.viste.set(chiave(), 'testi');
        c.dipingi(); aggiornaFrase(); avvisaRichiami(c, c.valore());
        ricalcolaFondo();
        if (input.focus) input.focus();
      };
      /* il testo che un «tieni» terrebbe al clic: la battitura in sospeso (il clic la salva prima, R6) o quello salvato.
         Giro 2 bis (difetto 4 del revisore): una battitura di soli spazi rispetto al testo caricato non conta per i nomi —
         sulla proposta mostrata il clic su un'altra nota parte da prima di lei (`soloSpaziSullaProposta`), altrove il suo
         salvataggio non cambia niente (regola 1) */
      c.modificato = () => c.dirty && BC.piano(input.value) !== BC.piano(c.baseline);
      c.testoTenuto = () => c.modificato() ? input.value : c.salvatoMostrato;
      c.dipingi = () => {
        const valore = input.value, rif = c.riferimento;
        // 0086: due aree solo se quella di sotto ha un nome (prima: anche appena si scriveva, `c.scrive`, o con la proposta
        // nel campo ritoccata fino a tornare l'Originale)
        const aree = c.aree(), confronto = aree.proposta || aree.tua;
        const vista = confronto ? (st.viste.get(chiave()) || (c.scrive ? 'testi' : 'differenze')) : 'testi';
        const lungo = Math.max(rif.length, valore.length) > LUNGO;
        $('[data-veste-seg]').hidden = !confronto;
        el.querySelectorAll('[data-veste-vista]').forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-veste-vista') === vista)));
        const s = BC.segni(rif, valore);
        let prima = pezziHtml(s.prima, 'tolto', 'del'), dopo = pezziHtml(s.testo, 'aggiunto', 'ins');
        if (vista === 'differenze' && lungo && E.confronto && E.confronto.confronta) {
          const cambiate = E.confronto.confronta(rif, valore).righe.filter(r => r.tipo === 'cambiata');
          prima = cambiate.map(r => '<p>' + pezziHtml(r.a, 'tolto', 'del') + '</p>').join('');
          dopo = cambiate.map(r => '<p>' + pezziHtml(r.b, 'aggiunto', 'ins') + '</p>').join('');
        }
        $('[data-veste-prima]').hidden = !confronto;
        $('[data-veste-prima-nome]').textContent = c.stato ? c.stato.nomi[0] + (vista === 'differenze' && lungo ? ' · ' + t('rv_veste_solo_cambiate', 'solo le frasi cambiate') : '') : '';
        const primaTesto = $('[data-veste-prima-testo]'), primaChiusa = vista === 'testi' && lungo && !st.primaAperta.has(chiave());
        primaTesto.innerHTML = prima; primaTesto.hidden = primaChiusa;
        const mostraPrima = $('[data-veste-mostra-prima]');
        mostraPrima.hidden = !(vista === 'testi' && lungo);
        // undicesimo giro, Q18: l'area si nomina con la sua chiave («Originale»)
        mostraPrima.textContent = (primaChiusa ? t('rv_veste_mostra_area', 'Mostra «{area}»') : t('rv_veste_nascondi_area', 'Nascondi «{area}»')).replace('{area}', () => ORIGINALE());
        // 0086: «Proposta» o «Tua versione»; col campo solo, dove una nota può dire «Tieni Originale», la riga «Originale» (D21)
        const nomeProposta = $('[data-veste-proposta-nome]');
        const nomi = c.stato ? c.stato.nomi : [ORIGINALE(), PROPOSTA()];
        const sotto = confronto ? (aree.proposta ? nomi[1] : TUA_VERSIONE()) : c.rigaOriginale ? nomi[0] : '';
        nomeProposta.hidden = !sotto;
        if (nomeProposta.textContent !== sotto) nomeProposta.textContent = sotto;
        diff.innerHTML = dopo; diff.hidden = !(confronto && vista === 'differenze');
        $('[data-veste-vivo]').hidden = confronto && vista === 'differenze';
        // lo strato dietro l'area di testo: lo STESSO testo, con le parole aggiunte segnate (A.3) e i richiami rotti (G9)
        $('[data-veste-sfondo]').innerHTML = stratoHtml(confronto ? (s.testo || []) : null, valore, rottiDi(c, c.valore())) + (/\n$/.test(valore) ? '<br>' : '');
        cresci(input);
        dipingiAvvisi();   // G14 (d): l'avviso della scheda segue il campo (battitura, scarto, Esc)
        dipingiSalvato(c);   // decimo giro, Q16
      };
      /* G10: lo scarto (⌘Z o Esc) ricarica dal salvato di ADESSO. Con la battitura nel campo `carica` non tocca la
         `baseline`: se intanto una scelta salvata è cambiata (⌘Z della veste, A.9), la baseline sarebbe vecchia. */
      // giro 3b: lo scarto rimette il testo salvato, e il bottone in fondo si ricalcola subito su quello
      c.ripristina = () => { c.dirty = false; c.carica(st.itemAdesso, mostrabili(st.attiva, st.info)); c.dipingi(); aggiornaFrase(); if (st.modo === 'spunte') calcolaFondo(); aggiornaAzioni(); };
      input.oninput = () => {
        riprende(c);   // decimo giro, Q16: si riprende a scrivere, «Testo salvato» sparisce
        c.dirty = sporco();
        if (c.dirty && !c.scrive && !(c.stato && c.stato.proposta)) { c.scrive = true; st.viste.set(chiave(), 'testi'); }
        c.dipingi(); aggiornaFrase(); avvisaRichiami(c, c.valore()); aggiornaAzioni();
        programmaFondo();   // giro 3b, D23: il bottone in fondo segue il testo in sospeso dopo la pausa
      };
      input.onfocus = () => { cresci(input); };
      input.onblur = e => esci(c, e);
      el.querySelectorAll('[data-veste-vista]').forEach(b => {
        b.onclick = () => {
          const v = b.getAttribute('data-veste-vista');
          st.viste.set(chiave(), v); c.dipingi();
          if (v === 'testi' && input.focus) input.focus();
        };
      });
      // A.2: un clic su «Proposta» porta a «Testi», dove si scrive
      diff.onclick = () => { st.viste.set(chiave(), 'testi'); c.dipingi(); if (input.focus) input.focus(); };
      diff.onkeydown = e => { if (e && (e.key === 'Enter' || e.key === ' ')) { if (e.preventDefault) e.preventDefault(); diff.onclick(); } };
      $('[data-veste-mostra-prima]').onclick = () => { if (st.primaAperta.has(chiave())) st.primaAperta.delete(chiave()); else st.primaAperta.add(chiave()); c.dipingi(); };
      return c;
    }

    /* G1, le parole di un collegamento (rev. 4 B.5; Giacomo, 02/10: «sì ai tuoi consigli»). Un campo d'una riga e, sotto,
       i suggerimenti: «Nessuna» per prima, poi i verbi della famiglia — la famiglia delle parole di adesso, che si cambia
       dalla tendina — presi da `EDGE_FAMILIES` (la fonte unica dei verbi, regola 12; mai una lista qui). Un suggerimento è
       un gesto e si salva subito, come il pallino della corretta; la battitura si salva all'uscita (R1). Il campo vuoto
       senza «Nessuna» scelta non si salva (packet 0022): il core trasformerebbe '' in «Nessuna», quindi il blocco sta qui. */
    function widgetParole(it) {
      const field = 'rel', REL = E.relazioni, lingua = E.lingua === 'en' ? 'en' : 'it';
      const el = doc.createElement('div'); el.className = 'mrv-veste-campo'; el.setAttribute('data-veste-campo', field);
      el.innerHTML = '<div class="mrv-veste-testa"><label class="mrv-veste-etichetta" for="mrv-veste-f-rel">' + esc(nomeCampo(field, it)) + '</label></div>' +
        '<div class="mrv-veste-note" data-veste-note-di="rel"></div>' +
        '<input id="mrv-veste-f-rel" class="mrv-veste-testo mrv-veste-parole" type="text" data-veste-input="rel">' + RIGA_SALVATO +
        '<p class="mrv-veste-sotto mrv-veste-famiglie"><label for="mrv-veste-famiglia">' + esc(t('rv_veste_g1_suggerimenti', 'Suggerimenti')) + '</label> ' +
        '<select id="mrv-veste-famiglia" data-veste-famiglia></select></p>' +
        '<div class="mrv-veste-scelte" data-veste-suggerimenti role="group" aria-label="' + esc(t('rv_veste_g1_suggerimenti', 'Suggerimenti')) + '"></div>';
      const input = el.querySelector('[data-veste-input]'), scelta = el.querySelector('[data-veste-famiglia]'), scelte = el.querySelector('[data-veste-suggerimenti]');
      const c = { field, tipo: 'parole', el, it, input, inputs: [input, scelta], note: el.querySelector('[data-veste-note-di]'), dirty: false, invalido: '',
        nessuna: false, salvato: '', adesso: undefined, salvatoEl: el.querySelector('[data-veste-salvato]') };
      const famiglie = REL && REL.EDGE_FAMILIES ? Object.keys(REL.EDGE_FAMILIES) : [];
      const chiave = () => st.attiva;
      const famigliaDi = v => REL && typeof REL.getEdgeFamilyKey === 'function' ? REL.getEdgeFamilyKey(v) : famiglie[famiglie.length - 1];
      scelta.innerHTML = famiglie.map(k => '<option value="' + esc(k) + '">' + esc(typeof REL.getFamilyLabel === 'function' ? REL.getFamilyLabel(k, lingua) : k) + '</option>').join('');
      // un suggerimento (o «Nessuna») scritto nel campo: un gesto, si salva subito
      const scegli = (parola, nessuna) => {
        if (!editabile() || occupato()) return;
        input.value = parola; c.nessuna = !!nessuna; c.invalido = '';
        c.dirty = parola !== c.salvato || (!!nessuna && c.adesso !== '');
        const ok = gestoCampo();
        // giro 3d (D41): con le note del controllo il suggerimento resta nella bozza (niente scrittura): i suggerimenti si ridisegnano qui
        if (ok && c.dirty) disegnaScelte();
        return ok;
      };
      function disegnaScelte() {
        const fam = REL && REL.EDGE_FAMILIES ? REL.EDGE_FAMILIES[st.famiglia.get(chiave())] || REL.EDGE_FAMILIES.altro : null;
        const parole = fam ? (lingua === 'en' ? fam.keywordsEn || [] : fam.keywords || []) : [];
        scelte.replaceChildren();
        [{ testo: t('le_none', 'Nessuna'), nessuna: true }].concat(parole.map(p => ({ testo: p }))).forEach(v => {
          const b = doc.createElement('button'); b.type = 'button'; b.className = 'pm-btn-cancel mrv-veste-parola'; b.setAttribute('data-veste-parola', v.nessuna ? '' : v.testo);
          if (v.nessuna) b.setAttribute('data-veste-nessuna', '');
          b.textContent = v.testo;
          b.setAttribute('aria-pressed', String(v.nessuna ? c.nessuna && !input.value.trim() : input.value.trim() === v.testo));
          // come i gesti delle note (R6): il fuoco non lascia il campo fra pressione e rilascio
          b.onmousedown = e => { if (e && e.preventDefault) e.preventDefault(); };
          gesto(b, () => scegli(v.nessuna ? '' : v.testo, v.nessuna));
          scelte.appendChild(b);
        });
        if (!editabile()) scelte.querySelectorAll('button').forEach(b => { b.disabled = true; });
      }
      c.valida = () => !input.value.trim() && !c.nessuna ? t('rv_veste_g1_parole_vuote', 'Scrivi le parole del collegamento, oppure scegli «Nessuna» fra i suggerimenti.') : '';
      /* giro 2 ter (D5, difetto 5 del revisore): le parole seguono la regola dei testi, «soli spazi non contano» (`piano`,
         la regola 1 di `calcola`): il salvataggio taglia gli spazi e non scrive niente, quindi «Va bene così» e i nomi non
         cambiano per loro (il commento del giro 2 bis diceva il contrario) */
      c.modificato = () => c.dirty && BC.piano(input.value) !== BC.piano(c.salvato);
      c.voci = () => [{ field, valore: c.nessuna && !input.value.trim() ? '' : input.value.trim(), adesso: c.adesso }];
      c.testoMostrato = () => input.value;
      // giro 3d (D41): la bozza delle parole resta per la seduta del Banco, cambiando riga e tornando
      c.bozza = () => ({ testo: input.value, nessuna: c.nessuna });
      c.ripristinaBozza = b => {
        input.value = b.testo; c.nessuna = !!b.nessuna; c.invalido = '';
        c.dirty = input.value !== c.salvato || (c.nessuna && c.adesso !== '');
        disegnaScelte();
      };
      c.carica = adesso => {
        const ora = adesso ? adesso[field] : it[field];
        c.adesso = clone(ora);
        if (c.dirty) return;
        c.salvato = testo(ora); c.nessuna = ora === ''; c.invalido = '';
        if (input.value !== c.salvato) input.value = c.salvato;
        // la famiglia segue le parole salvate; senza parole resta quella di prima (o quella delle parole generate)
        if (c.salvato.trim() || !st.famiglia.has(chiave())) st.famiglia.set(chiave(), famigliaDi(c.salvato.trim() || testo(it[field])));
        scelta.value = st.famiglia.get(chiave());
        disegnaScelte();
      };
      c.dipingi = () => dipingiSalvato(c);   // decimo giro, Q16
      /* 0086, giro 3c (§4.4): il nome del bottone in fondo sulla riga di un collegamento segue le parole del campo, con la
         regola unica (D37.6): «Proposta» quando sono esattamente le parole proposte da una nota del controllo, «Tua versione»
         quando sono diverse da quelle generate e da ogni proposta, «Originale» altrimenti; gli spazi non contano (`piano`) */
      c.aree = () => {
        const v = BC.piano(c.nessuna && !input.value.trim() ? '' : input.value);
        const proposta = noteDi(st.attiva).some(i => i && i.target && i.origin !== 'teacher' && i.target.field === field && i.hasProposal &&
          typeof i.after === 'string' && BC.piano(i.after) === v);
        return { proposta, tua: !proposta && v !== BC.piano(testo(it[field])) };
      };
      // giro 3c (§4.3): le parole proposte copiate dall'area della nota, come una battitura: si salvano all'uscita o col bottone
      c.copia = valore => {
        if (!editabile() || occupato()) return;
        riprende(c);
        input.value = valore; c.nessuna = false; c.invalido = ''; c.dirty = input.value !== c.salvato;
        disegnaScelte(); ricalcolaFondo(); aggiornaAzioni();
        if (input.focus) input.focus();
      };
      c.ripristina = () => { input.value = c.salvato; c.nessuna = c.salvato === ''; c.dirty = false; c.invalido = ''; disegnaScelte(); if (st.modo === 'spunte') calcolaFondo(); aggiornaAzioni(); };
      // G10: c'è battitura nel campo se il testo è diverso dal salvato (allora ⌘Z resta nativo)
      c.battitura = x => x === input && input.value !== c.salvato;
      input.oninput = () => { riprende(c); c.nessuna = false; c.dirty = input.value !== c.salvato; c.invalido = ''; aggiornaAzioni(); programmaFondo(); };
      input.onblur = e => esci(c, e);
      scelta.onchange = () => { st.famiglia.set(chiave(), scelta.value); disegnaScelte(); };
      return c;
    }

    /* Le alternative di una scelta multipla (§4.4): un pallino per alternativa segna la risposta corretta, le
       lettere A, B, C. Togliere un'alternativa sposta la corretta se serve; togliere la corretta lascia il
       campo non valido finché non se ne sceglie un'altra. Alternative e corretta si salvano insieme. */
    function widgetOpzioni(it) { return widgetVoci('options', it, true); }
    function widgetLista(field, it) { return widgetVoci(field, it, false); }
    function widgetVoci(field, it, opzioni) {
      const el = doc.createElement('div'); el.className = 'mrv-veste-campo'; el.setAttribute('data-veste-campo', field);
      // giro 2 bis (D31): la riga col nome del valore («Originale» / «Tua versione»), lo stesso pezzo della riga D21; `nomiValori`
      el.innerHTML = '<p class="mrv-veste-etichetta">' + esc(E.fieldName(field, it)) + (opzioni ? ' · ' + esc(t('rv_veste_pallino_corretta', 'il pallino segna la risposta corretta')) : '') + '</p>' +
        '<div class="mrv-veste-note" data-veste-note-di="' + esc(field) + '"></div>' +
        '<p class="mrv-veste-sotto" data-veste-proposta-nome hidden></p>' +
        '<div class="mrv-veste-voci" data-veste-voci></div>' +
        '<button type="button" class="mrv-veste-link" data-veste-aggiungi="' + esc(field) + '">' + esc(opzioni ? t('rv_veste_aggiungi_alternativa', 'Aggiungi un’alternativa') : t('rv_add_entry', 'Aggiungi una voce')) + '</button>';
      const box = el.querySelector('[data-veste-voci]');
      const c = { field, tipo: opzioni ? 'opzioni' : 'lista', el, it, note: el.querySelector('[data-veste-note-di]'), inputs: [], dirty: false, invalido: '',
        voci: null, salvate: [], corretta: null, salvataCorretta: null, adesso: undefined, adessoCorretta: undefined, refs: [],
        nomeEl: el.querySelector('[data-veste-proposta-nome]') };
      c.modificato = () => c.dirty;
      const lettera = k => String.fromCharCode(65 + k);
      const valori = () => c.testi.slice();
      const segna = () => {
        const sporcheVoci = !uguali(c.testi, c.salvate);
        c.dirty = sporcheVoci || (opzioni && c.corretta !== c.salvataCorretta);
        c.sporcheVoci = sporcheVoci;
      };
      c.valida = () => {
        if (c.testi.some(x => !String(x).trim())) return opzioni ? t('rv_veste_alternativa_vuota', 'Scrivi il testo dell’alternativa o toglila.') : t('rv_veste_voce_vuota', 'Scrivi il testo della voce o toglila.');
        // giro 2, difetto 3: una scelta multipla con meno di due alternative non è un esercizio (MappAIMaterialReview)
        if (opzioni && c.testi.length < 2) return t('rv_veste_due_alternative', 'Servono almeno due alternative: aggiungine una prima di togliere questa.');
        if (opzioni && !(Number.isInteger(c.corretta) && c.corretta >= 0 && c.corretta < c.testi.length)) return t('rv_veste_scegli_corretta', 'Scegli la risposta corretta prima di continuare.');
        return '';
      };
      // giro 2, difetto 12: la bozza delle alternative sopravvive a una ricostruzione della scheda
      c.bozza = () => ({ testi: c.testi.slice(), mostrati: c.mostrati.slice(), refs: c.refs.slice(), corretta: c.corretta });
      c.ripristinaBozza = b => { c.testi = b.testi.slice(); c.mostrati = b.mostrati.slice(); c.refs = b.refs.slice(); c.corretta = b.corretta; segna(); disegna(); };
      c.voci = () => {
        const out = [];
        if (c.sporcheVoci) out.push({ field, valore: valori(), adesso: c.adesso });
        if (opzioni && c.corretta !== c.salvataCorretta) out.push({ field: 'correctIndex', valore: c.corretta, adesso: c.adessoCorretta });
        return out;
      };
      c.testoMostrato = () => c.testi.join(' ');
      function disegna() {
        box.replaceChildren(); c.inputs = [];
        c.testi.forEach((v, k) => {
          const riga = doc.createElement('div'); riga.className = opzioni ? 'mrv-veste-opzione' : 'mrv-veste-voce';
          riga.setAttribute('data-veste-opzione', String(k));
          if (opzioni && c.corretta === k) riga.classList.add('is-corretta');
          const nome = opzioni ? lettera(k) : String(k + 1);
          riga.innerHTML = (opzioni ? '<input type="radio" name="mrv-veste-corretta-' + esc(st.attiva) + '" data-veste-corretta="' + k + '"' + (c.corretta === k ? ' checked' : '') +
            ' aria-label="' + esc(t('rv_veste_corretta_e', '{x} è la risposta corretta').replace('{x}', nome)) + '"><span class="mrv-veste-lettera">' + esc(nome) + '</span>' : '') +
            '<textarea class="mrv-veste-testo" rows="1" data-veste-input="' + esc(field) + '" data-veste-indice="' + k + '" aria-label="' + esc(E.fieldName(field, it) + ' ' + nome) + '"></textarea>' +
            '<button type="button" class="mrv-veste-togli" data-veste-togli="' + k + '" aria-label="' + esc((opzioni ? t('rv_veste_togli_alternativa', 'Togli l’alternativa {x}') : t('rv_veste_togli_voce', 'Togli la voce {x}')).replace('{x}', nome)) + '">' + SVG_TOGLI + '</button>';
          const area = riga.querySelector('textarea');
          c.refs[k] = c.refs[k] || E.referenceView(testo(v), it);
          area.value = c.mostrati[k] != null ? c.mostrati[k] : c.refs[k].text;
          area.oninput = () => { c.mostrati[k] = area.value; c.testi[k] = E.restoreReferences(area.value, c.refs[k]); segna(); c.invalido = ''; aggiornaFrase(); aggiornaAzioni(); programmaFondo(); };
          area.onblur = e => esci(c, e);
          c.inputs.push(area);
          const radio = riga.querySelector('[data-veste-corretta]');
          if (radio) {
            // scegliere la corretta è un gesto: si salva subito, insieme alle alternative cambiate
            radio.onchange = () => {
              c.corretta = k; segna(); c.invalido = '';
              box.querySelectorAll('[data-veste-opzione]').forEach(r => r.classList.toggle('is-corretta', Number(r.getAttribute('data-veste-opzione')) === k));
              return gestoCampo();   // giro 3d (D41): con le note del controllo resta nella bozza
            };
            c.inputs.push(radio);
          }
          riga.querySelector('[data-veste-togli]').onclick = () => togli(k);
          box.appendChild(riga);
          cresci(area);
        });
        if (!editabile()) box.querySelectorAll('textarea,input,button').forEach(x => { x.disabled = true; });
      }
      function togli(k) {
        if (!editabile() || occupato()) return;
        c.testi.splice(k, 1); c.mostrati.splice(k, 1); c.refs.splice(k, 1);
        if (opzioni) c.corretta = c.corretta === k ? null : (Number.isInteger(c.corretta) && c.corretta > k ? c.corretta - 1 : c.corretta);
        segna(); disegna();
        const msg = c.valida();
        if (msg) { c.invalido = msg; avvisa(msg); aggiornaAzioni(); return; }
        c.invalido = '';
        gestoCampo();   // giro 3d (D41): con le note del controllo resta nella bozza
      }
      el.querySelector('[data-veste-aggiungi]').onclick = () => {
        if (!editabile() || occupato()) return;
        c.testi.push(''); c.mostrati.push(''); c.refs.push(E.referenceView('', it));
        segna(); disegna();
        const ultima = c.inputs.filter(x => x.getAttribute('data-veste-indice') != null).pop();
        if (ultima && ultima.focus) ultima.focus();
        aggiornaAzioni();
      };
      c.carica = adesso => {
        const ora = adesso ? adesso[field] : it[field];
        c.adesso = clone(ora); c.adessoCorretta = adesso ? clone(adesso.correctIndex) : it.correctIndex;
        if (c.dirty) return;
        const nuove = Array.isArray(ora) ? ora.map(testo) : [];
        const nuovaCorretta = opzioni && Number.isInteger(c.adessoCorretta) ? c.adessoCorretta : null;
        c.invalido = ''; c.sporcheVoci = false;
        // appena salvato quello che è a schermo: le righe restano quelle, col fuoco dove stava (§4.11)
        if (c.disegnato && uguali(nuove, c.testi) && nuovaCorretta === c.corretta) { c.salvate = nuove; c.salvataCorretta = nuovaCorretta; return; }
        c.salvate = nuove;
        c.testi = c.salvate.slice(); c.mostrati = c.testi.map(() => null); c.refs = c.testi.map(v => E.referenceView(v, it));
        c.corretta = nuovaCorretta; c.salvataCorretta = c.corretta;
        disegna(); c.disegnato = true;
      };
      c.dipingi = () => {};
      c.ripristina = () => { c.dirty = false; c.carica(st.itemAdesso); aggiornaFrase(); if (st.modo === 'spunte') calcolaFondo(); aggiornaAzioni(); };
      /* 0086, giro 3c (§4.3, D31): la proposta letta nella nota, copiata con un clic: le voci proposte (null: restano) e, per
         le alternative, la corretta proposta. Come una battitura: si salva all'uscita da una voce o col bottone (R6). */
      c.copia = (valori, corretta) => {
        if (!editabile() || occupato()) return;
        if (Array.isArray(valori)) { c.testi = valori.map(testo); c.mostrati = c.testi.map(() => null); c.refs = c.testi.map(v => E.referenceView(v, it)); }
        if (opzioni && Number.isInteger(corretta)) c.corretta = corretta;
        segna(); c.invalido = ''; disegna(); aggiornaFrase(); ricalcolaFondo(); aggiornaAzioni();
        const prima = c.inputs.find(x => x.getAttribute && x.getAttribute('data-veste-indice') != null);
        if (prima && prima.focus) prima.focus();
      };
      /* G10: c'è battitura in QUESTA area se il testo è diverso da quello con cui la riga è nata (`refs[k]` resta quello
         del caricamento, o '' per un'alternativa aggiunta, e segue la riga quando una «×» sposta gli indici).
         Il pallino e le righe senza battitura lasciano ⌘Z alla veste. */
      c.battitura = area => {
        const k = area && area.getAttribute ? area.getAttribute('data-veste-indice') : null;
        return k != null && !!c.refs[Number(k)] && area.value !== c.refs[Number(k)].text;
      };
      return c;
    }
    // «Righe per rispondere» (domande aperte): un numero intero; si salva all'uscita.
    function widgetNumero(field, it) {
      const el = doc.createElement('div'); el.className = 'mrv-veste-campo mrv-veste-campo--numero'; el.setAttribute('data-veste-campo', field);
      const idInput = 'mrv-veste-f-' + field;
      // giro 2 bis (D31): la riga col nome del valore, come nelle alternative e negli elenchi (`nomiValori`)
      el.innerHTML = '<div class="mrv-veste-note" data-veste-note-di="' + esc(field) + '"></div>' +
        '<p class="mrv-veste-sotto" data-veste-proposta-nome hidden></p>' +
        '<label class="mrv-veste-etichetta" for="' + esc(idInput) + '">' + esc(E.fieldName(field, it)) +
        ' <input id="' + esc(idInput) + '" class="mrv-veste-numero" type="number" min="3" max="12" step="1" data-veste-input="' + esc(field) + '"></label>';
      const input = el.querySelector('input');
      const c = { field, tipo: 'numero', el, it, input, inputs: [input], note: el.querySelector('[data-veste-note-di]'), dirty: false, invalido: '', salvato: undefined, adesso: undefined,
        nomeEl: el.querySelector('[data-veste-proposta-nome]') };
      c.modificato = () => c.dirty;
      // giro 2, difetto 3: le righe stampabili vanno da 3 a 12 (MappAIMaterialReview), il resto non si salva
      c.valida = () => input.value === '' || !Number.isInteger(Number(input.value)) ? t('rv_invalid_edit', 'Completa il campo della modifica prima di continuare.')
        : Number(input.value) < 3 || Number(input.value) > 12 ? t('rv_veste_righe_intervallo', 'Le righe per rispondere vanno da 3 a 12.') : '';
      c.voci = () => [{ field, valore: Number(input.value), adesso: c.adesso }];
      c.testoMostrato = () => input.value;
      // giro 3d (D41): la bozza del numero resta per la seduta del Banco, cambiando materiale e tornando
      c.bozza = () => ({ testo: input.value });
      c.ripristinaBozza = b => { input.value = b.testo; c.dirty = input.value !== c.salvato; c.invalido = ''; };
      c.carica = adesso => {
        const ora = adesso ? adesso[field] : it[field];
        c.adesso = clone(ora);
        if (c.dirty) return;
        c.salvato = testo(ora); c.invalido = '';
        if (input.value !== c.salvato) input.value = c.salvato;
      };
      c.dipingi = () => {};
      c.ripristina = () => { input.value = c.salvato; c.dirty = false; c.invalido = ''; if (st.modo === 'spunte') calcolaFondo(); aggiornaAzioni(); };
      // 0086, giro 3c (§4.3, D31): il numero proposto, copiato con un clic sulla proposta nella nota (si salva all'uscita o col bottone)
      c.copia = valore => {
        if (!editabile() || occupato()) return;
        input.value = testo(valore); c.dirty = input.value !== c.salvato; c.invalido = '';
        ricalcolaFondo(); aggiornaAzioni();
        if (input.focus) input.focus();
      };
      input.oninput = () => { c.dirty = input.value !== c.salvato; c.invalido = ''; aggiornaAzioni(); programmaFondo(); };
      /* Quarto giro, punto 5: si salva all'uscita (blur, con `relatedTarget` come i testi), al cambio di materiale, al
         bottone e alla chiusura — mai su `change`. Nel browser `change` arriva prima di `blur` e senza `relatedTarget`
         (chiuderebbe la nota prima che il fuoco arrivi sul suo gesto), e in un campo numerico arriva a ogni passo
         delle frecce ↑/↓ (si salverebbe a battuta, contro R1). */
      input.onblur = e => esci(c, e);
      return c;
    }

    /* ── il bottone e la pila, sotto la scheda ─────────────────────────────── */
    function aggiornaAzioni() {
      const bar = st.bar;
      if (!bar) return;
      /* 0086 (§4.5): i nomi seguono il testo a schermo — `aggiornaAzioni` è ciò che ogni campo chiama a ogni battuta (`input`)
         e a ogni scarto senza `input` (Esc, `c.ripristina`, lo scarto della barra), quindi i nomi si rifanno qui */
      aggiornaNomi();
      bar.annulla.textContent = ANNULLA;
      // G10: acceso anche quando c'è solo una modifica non salvata da scartare
      bar.annulla.disabled = !editabile() || (!st.pila.length && !sospese().length);
      if (G1) return azioniG1(bar);
      const id = st.attiva, x = id ? rigaDi(id) : null;
      if (!x || x.assente || !editabile() || stantia()) {
        bar.bottone.hidden = true; bar.escludi.hidden = true; bar.attesa.textContent = '';
        mostraFondo(bar, false, null);
        return;
      }
      const a = anteprima(id);
      bar.escludi.hidden = false;
      bar.escludi.textContent = a.escluso ? t('rv_material_restore', 'Ripristina') : t('rv_veste_escludi', 'Escludi');
      if (a.escluso) { bar.bottone.hidden = true; bar.attesa.textContent = ''; mostraFondo(bar, false, null); return; }
      /* 0086, giro 3c (§4.4): con note aperte (o scelte salvate in conflitto) il bottone del materiale è il bottone in fondo
         delle spunte — «Approvato» / «Rivisto» registra campi, spunte e visto in una scrittura; spento con la riga quando
         il core non registrerebbe o un campo non è valido; senza l'avviso del costo, che in G2 non c'è */
      if (mostraFondo(bar, fondoAttivo(), st.campi.find(c => c.invalido))) return;
      const motivo = motivoBottone(id);
      bar.bottone.hidden = false;
      bar.bottone.disabled = motivo !== null;
      bar.attesa.textContent = motivo || '';
      bar.bottone.textContent = nomeBottone();
      bar.bottone.setAttribute('aria-pressed', String(x.stato === 'rivisto' || x.stato === 'approvato'));
    }

    /* 0086, giri 3b e 3c (§4.4, §4.6): il bottone della barra come bottone in fondo della scheda con le spunte — il nome di
       D37.6 (in G2 «Approvato» / «Rivisto»), che cambia mentre si scrive; spento, con la riga che dice che cosa fare, quando
       il core non registrerebbe (D38.1, D39, D40, il campo vuoto, il punto non ritrovato) o un campo non è valido; acceso,
       accanto l'avviso del costo (solo sulla descrizione) e, con una spunta tolta sul collegamento o sul materiale, che
       cosa esce. Falso se la scheda non ha il bottone in fondo (l'avviso si spegne). */
    function mostraFondo(bar, fondo, invalido) {
      const avviso = fondo && !invalido && st.fondo && !st.fondo.spento ? st.fondo.avviso : '';
      if (bar.costo) { if (bar.costo.hidden !== !avviso) bar.costo.hidden = !avviso; if (bar.costo.textContent !== avviso) bar.costo.textContent = avviso; }
      if (!fondo) return false;
      bar.bottone.hidden = false;
      const nome = nomeFondo();
      if (bar.bottone.textContent !== nome) bar.bottone.textContent = nome;
      if (bar.bottone.getAttribute('aria-pressed') != null) bar.bottone.removeAttribute('aria-pressed');
      bar.bottone.disabled = !!invalido || !st.fondo || st.fondo.spento;
      const riga = invalido ? invalido.invalido : st.fondo ? st.fondo.riga : '';
      if (bar.attesa.textContent !== riga) bar.attesa.textContent = riga;
      return true;
    }
    /* G1: nessun «Escludi» (la nota decide); accanto a ⌘Z la riga dice che cosa aspetta la scheda — un campo da completare,
       le note da decidere, o che cosa fare di un non letto. Sesto giro, Q10 (Giacomo al gate 3: «Bottone «Va bene così»»):
       il bottone della barra, che in G2 è «Rivisto»/«Approvato», su un non letto è «Va bene così» — premuto se la riga è
       già segnata così. Non c'è dove la riga è già decisa da una correzione del docente, dove una nota aperta o in
       conflitto chiede il suo gesto, né fuori dai non letti; un campo non valido lo spegne. */
    function azioniG1(bar) {
      bar.escludi.hidden = true;
      const x = st.attiva ? rigaDi(st.attiva) : null;
      const invalido = st.campi.find(c => c.invalido);
      const vivo = !!x && editabile() && !stantia();
      /* 0086, giro 3b (§4.4, §4.6): sulla scheda di un nodo con le spunte e note del controllo aperte, il bottone della barra
         è il bottone in fondo — il nome di D37.6, che cambia mentre si scrive; spento, con la riga che dice che cosa fare,
         quando il core non registrerebbe (D38.1, D39, D40, il punto non ritrovato); accanto l'avviso del costo del clic. */
      // giro 3c: anche sui collegamenti e sulle righe con scelte salvate in conflitto (`fondoAttivo`)
      const fondo = vivo ? fondoAttivo() : false;
      if (mostraFondo(bar, fondo, invalido)) return;
      const aperte = x ? noteDi(x.id).filter(i => esito(i) === 'pending').length : 0;
      /* giro 2 bis (difetto 7 del revisore): «Va bene così» non c'è mentre un campo ha una battitura in sospeso — dopo un
         ritocco non c'è un testo da confermare, nasce una segnalazione (il clic salvava la correzione e passava oltre). Una
         battitura di soli spazi non conta (`c.modificato`, come per i nomi): salvata, non cambia niente */
      const scrive = st.campi.some(c => c.modificato ? c.modificato() : c.dirty);
      const offri = vivo && x.tipo === 'non-letto' && !x.corretto && !x.conflitto && !x.sospesa && !aperte && !scrive;
      bar.bottone.hidden = !offri;
      if (offri) {
        bar.bottone.textContent = VA_BENE();
        bar.bottone.disabled = !!invalido;
        bar.bottone.setAttribute('aria-pressed', String(!!x.bene));
      }
      bar.attesa.textContent = !vivo ? '' : invalido ? invalido.invalido
        : aperte ? plurale(aperte, t('rv_veste_g1_attesa_una', 'La nota aspetta la sua risposta.'), t('rv_veste_g1_attesa', 'Ogni nota aspetta la sua risposta: ne restano {n}.'))
          : !offri ? ''
            : x.bene ? t('rv_veste_g1_attesa_va_bene', 'Segnato {va_bene}: se correggi il testo, vale la correzione.').replace('{va_bene}', () => '«' + VA_BENE() + '»')
              : t('rv_veste_g1_attesa_non_letto_bottone', 'Se il testo va bene premi {va_bene}; se lo correggi, la correzione si salva da sé.').replace('{va_bene}', () => '«' + VA_BENE() + '»');
    }

    /* ── la tastiera (rev. 3, 7): nello stesso ascoltatore di R.open; vero = gestito qui ── */
    function campoDi(el) { return el ? st.campi.find(c => (c.inputs || []).indexOf(el) >= 0) || null : null; }
    /* Un campo dove si SCRIVE che non è della veste (la ricerca, le occorrenze): lì ⌘Z resta del campo (difetto 9).
       Una tendina, una casella, un pallino, un bottone non sono campi in cui si scrive: lì ⌘Z è della veste e
       l'evento si ferma (terzo giro, difetto B — mappai-undo.js esclude solo INPUT e TEXTAREA). */
    function scrivibile(el) {
      const tag = String((el && el.tagName) || '').toUpperCase();
      if (tag === 'TEXTAREA' || (el && el.isContentEditable)) return true;
      return tag === 'INPUT' && !/^(button|checkbox|radio|submit|reset|range|color|file|image|hidden)$/i.test(String(el.type || ''));
    }
    /* Gate 3, G1: il Banco è la finestra in cima quando il fuoco è dentro di lui o su nessun elemento (body: dopo un
       clic su un'area che non prende il fuoco, o dopo che la scheda si è ridisegnata). Con il fuoco in un'altra
       finestra aperta sopra di lui il tasto è di quella finestra. */
    function suoFuoco(el) {
      if (!el || el === doc.body || el === doc.documentElement) return true;
      return typeof modal.contains === 'function' ? modal.contains(el) : true;
    }
    /* Le scorciatoie della veste sono tre (gate 3, G7 e G8): ⌘Z / Ctrl+Z annulla, ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y ripristina
       (G6), Esc dentro un campo rimette l'ultimo salvato. Sono della veste ovunque sia il fuoco, finché il Banco è in
       cima, e non arrivano mai alla mappa (mappai-undo.js) né a una console sotto. Restano del campo ⌘Z e ⇧⌘Z in un
       campo della veste con battitura non salvata e in un campo di testo che non è della veste (ricerca, occorrenze).
       Cmd/Ctrl+Invio e Alt+↑/↓ non fanno più niente (Giacomo: «disattivala», «Toglilo»): si fermano qui, senza
       togliere al campo il suo comportamento (niente preventDefault), così non arrivano nemmeno loro alla mappa o alla
       console. */
    function tasto(e) {
      if (!e) return false;
      const k = e.key, mod = !!(e.metaKey || e.ctrlKey), el = doc.activeElement, c = campoDi(el);
      if (!suoFuoco(el)) return false;
      const zeta = k === 'z' || k === 'Z';
      const annullo = mod && !e.altKey && !e.shiftKey && zeta;
      const rifai = mod && !e.altKey && ((e.shiftKey && zeta) || (e.ctrlKey && !e.metaKey && !e.shiftKey && (k === 'y' || k === 'Y')));
      if ((mod && k === 'Enter') || (e.altKey && !mod && (k === 'ArrowDown' || k === 'ArrowUp'))) {
        if (e.stopPropagation) e.stopPropagation();
        return true;
      }
      if (!annullo && !rifai && !(k === 'Escape' && !!c)) return false;
      // R2: ⌘Z e ⇧⌘Z restano nativi in un campo della veste con battitura non salvata, e in ogni altro campo scrivibile
      // G10: nel campo «dove si scrive» conta la battitura di QUELL'area (un'alternativa tolta o aggiunta no: la scarta la veste)
      // G14 (c): nello stato di A.9 il tasto ⌘Z nel campo toglie la scelta, come promette la riga di stato
      if ((annullo || rifai) && (c ? !(annullo && sciogliConflitto()) && (c.battitura ? c.battitura(el) : c.dirty) : scrivibile(el))) return false;
      // gestita qui: non arriva all'annulla della mappa (mappai-undo.js, sul documento) né ad altri (difetto 1)
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      // un tasto tenuto premuto fa un gesto solo (difetto 2)
      if (e.repeat) return true;
      if (annullo) { annulla(); return true; }
      if (rifai) { ripristina(); return true; }
      // Esc dentro un campo rimette il testo dell'ultimo salvataggio senza scrivere; fuori fa quello di oggi. Giro 3d (D41):
      // sulle schede con note del controllo l'ultimo testo registrato (dal bottone in fondo), e la bozza della seduta si scarta
      const msg = c.invalido;
      c.ripristina(); c.invalido = '';
      memorizzaBozze();
      if (msg && E.status.textContent === msg) avvisa('');
      aggiornaAzioni();
      return true;
    }
    /* Giro 2, difetto 8: aperto con `alza` sopra una console MappAIModal, l'Esc arriverebbe prima alla console,
       che ascolta in cattura sul documento e lo ferma (mappai-modal.js). Si ascolta prima, in cattura su window.
       Gate 3, G1: con il fuoco su body il tasto non passa dal modale (non ne è un antenato), quindi la cattura vale
       ovunque sia il fuoco; `tasto` decide che cosa è della veste. L'ascolto si toglie alla chiusura. */
    function ascolta() {
      const W = E.finestra;
      if (!W || typeof W.addEventListener !== 'function' || st.cattura) return;
      st.cattura = e => {
        if (!modal.isConnected) { smonta(); return; }
        tasto(e);
      };
      W.addEventListener('keydown', st.cattura, true);
    }
    function smonta() {
      const W = E.finestra;
      if (st.cattura && W && typeof W.removeEventListener === 'function') W.removeEventListener('keydown', st.cattura, true);
      st.cattura = null;
      if (st.timerFondo) { clearTimeout(st.timerFondo); st.timerFondo = null; }   // giro 3b: niente ricalcolo a Banco chiuso
    }

    /* ── il montaggio, una volta ──────────────────────────────────────────── */
    function prepara() {
      modal.classList.add('mrv-veste');
      if (G1) modal.classList.add('mrv-veste-g1');
      ascolta();
      const elencoNome = G1 ? t('rv_veste_g1_elenco', 'Nodi e collegamenti da rivedere') : t('rv_veste_elenco', 'Materiali da rivedere');
      const sidebar = modal.querySelector('#mrv-sidebar');
      if (sidebar) sidebar.setAttribute('aria-label', elencoNome);
      const coda = modal.querySelector('#mrv-queue');
      if (coda) coda.setAttribute('aria-label', elencoNome);
      // G1, Q2: il riquadro della copertura in fondo alla barra diventa la sezione «Il controllo», chiusa
      const titoloControllo = G1 ? modal.querySelector('#mrv-coverage-options > summary') : null;
      if (titoloControllo) titoloControllo.innerHTML = esc(t('rv_veste_g1_controllo', 'Il controllo')) + ' · <span id="mrv-coverage-label"></span>';
      const filtri = modal.querySelector('#mrv-filters');
      if (filtri) {
        filtri.replaceChildren();
        ['da-rivedere', 'fatti', 'tutti'].forEach(k => {
          const b = doc.createElement('button'); b.type = 'button'; b.setAttribute('data-veste-filtro', k);
          b.onclick = () => { st.filtro = k; azzeraVisti(); disegnaBarra(); };
          filtri.appendChild(b);
        });
      }
      const cerca = modal.querySelector('#mrv-search');
      if (cerca) {
        cerca.setAttribute('placeholder', t('rv_veste_cerca', 'Cerca…'));
        cerca.oninput = () => { st.cerca = String(cerca.value || '').trim().toLocaleLowerCase(); azzeraVisti(); disegnaBarra(); };
      }
      const area = modal.querySelector('#mrv-area');
      if (area) area.onchange = () => { st.area = area.value; azzeraVisti(); disegnaBarra(); };
      // invariante 21: i comandi di prima che la veste sostituisce non si vedono
      ['label[for=mrv-kind]', 'label[for=mrv-reason]', '#mrv-clear-filters', '.mrv-search-label', '#mrv-queue-count', '#mrv-prev', '#mrv-next', '#mrv-position']
        .forEach(s => modal.querySelectorAll(s).forEach(el => { el.hidden = true; }));
      const intestazione = modal.querySelector('.mrv-overview > div');
      if (intestazione) {
        st.riepilogo = doc.createElement('span'); st.riepilogo.id = 'mrv-veste-riepilogo'; st.riepilogo.className = 'mrv-veste-riepilogo';
        intestazione.appendChild(st.riepilogo);
      }
      const posto = modal.querySelector('.mrv-carte') || modal.querySelector('.mrv-detail');
      const bar = doc.createElement('div'); bar.className = 'mrv-veste-azioni'; bar.id = 'mrv-veste-azioni';
      bar.innerHTML = '<button type="button" class="pm-btn-cancel mrv-veste-annulla" id="mrv-veste-annulla"></button>' +
        '<button type="button" class="pm-btn-cancel" id="mrv-veste-escludi"></button>' +
        '<span class="mrv-veste-attesa" id="mrv-veste-attesa" aria-live="polite"></span>' +
        // tredicesimo giro, Q20: il posto dei bottoni della nota sola, dopo la frase e prima del bottone della barra
        '<div class="mrv-veste-risposta" id="mrv-veste-risposta" data-veste-risposta hidden></div>' +
        // 0086, giro 3b (§4.6): l'avviso del costo del clic, accanto al bottone in fondo (solo in G1, sulle schede con le spunte)
        '<span class="mrv-veste-costo" id="mrv-veste-costo" data-veste-costo aria-live="polite" hidden></span>' +
        '<button type="button" class="pm-btn-primary" id="mrv-veste-bottone"></button>';
      posto.appendChild(bar);
      st.bar = { el: bar, annulla: bar.querySelector('#mrv-veste-annulla'), escludi: bar.querySelector('#mrv-veste-escludi'),
        attesa: bar.querySelector('#mrv-veste-attesa'), bottone: bar.querySelector('#mrv-veste-bottone'), risposta: bar.querySelector('#mrv-veste-risposta'),
        costo: bar.querySelector('#mrv-veste-costo') };
      st.bar.annulla.setAttribute('aria-label', t('rv_veste_annulla', 'Annulla l’ultima azione'));
      st.bar.annulla.setAttribute('title', t('rv_veste_annulla', 'Annulla l’ultima azione') + ' (' + ANNULLA + ')');
      // il secondo clic di un doppio clic (detail 2) e Invio tenuto premuto non fanno un secondo gesto (ADR 0012 rev. 3, p. 7)
      gesto(st.bar.annulla, () => annulla());
      // G10: il bottone «⌘+Z» non toglie il fuoco al campo (come i gesti delle note, R6): la battitura non si salva
      // uscendo, e il clic la scarta
      st.bar.annulla.onmousedown = e => { if (e && e.preventDefault) e.preventDefault(); };
      gesto(st.bar.escludi, () => escludi());
      gesto(st.bar.bottone, () => premi());
      // 0086, giro 3b (§4.4): in G1 il bottone in fondo non toglie il fuoco al campo — la battitura in sospeso la salva il
      // clic, in una voce sua (R6), e le spunte che contano sono quelle al gesto
      if (G1) st.bar.bottone.onmousedown = e => { if (e && e.preventDefault) e.preventDefault(); };
    }
    // Il ridisegno intero: all'apertura e quando la revisione cambia da fuori (un nuovo tentativo del controllo).
    function render() {
      if (!st.montata) { prepara(); st.montata = true; }
      if (review() !== st.ultimaReview) {
        st.cache.clear(); st.prev.clear(); st.globale = null; st.residui = null; st.entrate = new Set();
        if (st.ultimaReview) {
          st.pila = []; st.rifare = [];   // R2 e G6: dopo «Riprova il controllo» le due pile ripartono vuote
          /* Sesto giro, punto 1: la revisione è cambiata da fuori («Riprova», l'unica strada con la veste accesa) e la
             spunta della casella valeva per il controllo di prima: si toglie. Lo dice, solo se c'era, chi riscrive la riga
             di stato dopo «Riprova» (R.open), con la frase che gli dà `spuntaTolta()`. */
          if (st.confermato) {
            st.confermato = false; st.spuntaTolta = true;
            const casella = st.conferma && st.conferma.querySelector('#mrv-veste-conferma');
            if (casella) casella.checked = false;
          }
        }
        st.ultimaReview = review();
      }
      azzeraVisti(); st.barra = null;
      fotografaApertura();   // 0086, giro 3b (D40): le descrizioni all'apertura del Banco, una volta sola
      elenco();
      if (st.attiva != null && inBozza()) memorizzaBozze();   // giro 3d (D41): la bozza a schermo resta dopo il ridisegno
      if (!st.attiva || !rigaDi(st.attiva)) st.attiva = primaDaFare();
      disegnaAree(); costruisciScheda(); aggiornaContorno(); disegnaCopertura();
    }
    // Dalle occorrenze («Rivedi questo campo»): si apre il materiale e il fuoco va sul campo.
    async function apri(itemId, field) {
      if (!(await vaiA(itemId))) return;
      const c = st.campi.find(w => w.field === field || (field === 'correctIndex' && w.field === 'options'));
      const el = c && c.inputs && c.inputs[0];
      if (el && el.focus) el.focus();
    }

    // punto 1: chi rifà la riga di stato dopo «Riprova» (R.open) chiede se una spunta è stata tolta: riceve la frase da
    // dire (vuota se non c'era niente da togliere); la domanda la azzera, così si dice una volta sola
    function spuntaTolta() { const era = !!st.spuntaTolta; st.spuntaTolta = false; return era ? SPUNTA_TOLTA() : ''; }

    /* G1: «Vai alla segnalazione» dello strato (0042) passa l'id di una segnalazione: si apre la riga che la contiene
       (allargando i filtri se non si vede, come «Rivedi l’altra decisione» del Banco di prima) e la nota si evidenzia. */
    async function vaiANota(issueId) {
      const x = righe().tutte.find(r => (r.issueIds || []).map(String).indexOf(String(issueId)) >= 0);
      if (!x) return false;
      if (!visibile(x)) {
        st.filtro = 'tutti'; st.cerca = ''; st.area = ''; azzeraVisti();
        const cerca = modal.querySelector('#mrv-search'), area = modal.querySelector('#mrv-area');
        if (cerca) cerca.value = ''; if (area) area.value = '';
        disegnaBarra();
      }
      if (!(await vaiA(x.id))) return false;
      const el = st.noteEl.get(String(issueId));
      if (el) {
        spegniEvidenza(); el.classList.add('mrv-veste-evidenza');
        if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
        if (el.focus) el.focus();
      }
      return true;
    }
    /* G1, Q1 (Giacomo, 06/10: «Si apre fuori elenco»): «Correggi il nodo vicino» dello strato (0041) apre la scheda del
       nodo, sulla sua riga se ce l'ha, altrimenti fuori elenco; il fuoco va sulla descrizione. */
    async function correggiNodo(nodeId) {
      const id = String(nodeId);
      if (!G1 || !nodoBase(id)) return false;
      if (!righe().tutte.some(r => r.id === id && r.source == null)) st.fuori.add(id);
      if (!(await vaiA(id))) return false;
      const c = st.campi.find(w => w.field === 'desc'), el = c && c.inputs && c.inputs[0];
      if (el && el.focus) el.focus();
      return true;
    }

    return { render, tasto, salvaAperto, puoChiudere, apri, smonta, spuntaTolta, vaiANota, correggiNodo };
  }

  return { monta, righeProva, etichettaAnnulla };
}));
