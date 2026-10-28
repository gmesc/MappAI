/*
 * mappai-affermazioni-ui.js — le superfici dello strato delle affermazioni e
 * della quarantena (packet 0042, ADR 0010). Tre pezzi, tutti muti con gli
 * interruttori spenti:
 *   1. il RIQUADRO nel Setup AI, accanto a «Evidenze dalla fonte nei quiz»: le
 *      due spunte `mappai_affermazioni` e `mappai_quarantena`. Si ricostruisce
 *      a ogni apertura (il Setup vive nella Cabina, che sposta i suoi pezzi:
 *      si ridisegna quando torna VISIBILE), così un cambio di lingua lo
 *      ritraduce — senza toccare mappai-storage-lang.js;
 *   2. lo STRATO del Banco dei contenuti (G1): lo stato delle segnalazioni che
 *      la quarantena tiene fuori, una riga nel piede, il suffisso della
 *      copertura e il blocco «Affermazioni delle descrizioni», IN SOLA LETTURA
 *      (si decide sulle segnalazioni, non sulle frasi). `per()` → null quando è
 *      spento o in G2: allora il Banco è identico a oggi;
 *   3. la RIGA del riepilogo di «Genera materiali»: che cosa è rimasto fuori,
 *      che la mappa non è cambiata, e «Rivedi i contenuti».
 * Il packet 0041 aggiunge, con `mappai_frasi_orfane` (spento di default): la
 * sotto-spunta nel riquadro del Setup, il gruppo «Frasi della fonte rimaste
 * fuori» in coda al blocco del Banco (2-bis) e una riga nel riepilogo.
 *
 * ⚠️ Le parole non affermano la verità (inv. 22): una frase «con una frase
 * vicina nella fonte» è NON ESCLUSA, mai «verificata».
 * Testi con t('aff_…', 'ripiego italiano'): le chiavi solo in en_translations.js.
 * Ogni lettura di window.MappAIAffermazioni* sta dentro una funzione.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.MappAIAffermazioniUI) return;   // trappola 22

  const aff = () => window.MappAIAffermazioni;
  const core = () => window.MappAIAffermazioniCore;
  const reviewCore = () => window.MappAIReviewCore;
  const state = () => (typeof appState !== 'undefined' ? appState : null);
  const t = (k, f) => (window.t ? window.t(k, f) : f);
  const esc = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const etichetta = s => (window.cleanLabel ? window.cleanLabel(s) : String(s == null ? '' : s));
  function leggi(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function scrivi(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* resta com'era */ } }

  /* ── 1. IL RIQUADRO DEL SETUP ─────────────────────────────────────────────── */
  function disegnaSetup(host) {
    if (!host) return host;
    // packet 0089 (ADR 0020): le spunte leggono le chiavi come il motore — accese se mancano, spente solo con '0'
    const acceso = leggi('mappai_affermazioni') !== '0';
    const revisioneSpenta = leggi('mappai_review_enabled') === '0';
    const quarantena = leggi('mappai_quarantena') !== '0';
    const motivo = !acceso ? t('aff_setup_need_layer', 'Accendi prima lo strato delle affermazioni.')
      : revisioneSpenta ? t('aff_setup_review_off', 'La revisione dei contenuti è spenta: non c’è niente da mettere in quarantena.') : '';
    host.innerHTML = '<div class="bg-indigo-50 border border-indigo-200 rounded-xl p-3" data-aff-setup>' +
      '<label class="flex items-start gap-3 cursor-pointer">' +
        '<input type="checkbox" id="aff-layer-toggle" class="mt-0.5 accent-indigo-600 w-4 h-4">' +
        '<div><span class="text-xs font-bold text-indigo-700">' + esc(t('aff_setup_layer', 'Strato delle affermazioni (prova)')) + '</span>' +
        '<p class="text-xs text-indigo-700 mt-0.5 leading-relaxed">' + esc(t('aff_setup_layer_desc', 'Divide le descrizioni della mappa in frasi e mostra nella revisione dei contenuti quali restano fuori dai materiali, quali hai cambiato con una tua decisione e quali hanno una frase vicina nella fonte. Nessuna chiamata all’AI.')) + '</p></div>' +
      '</label>' +
      '<label class="flex items-start gap-3 cursor-pointer mt-2 ml-7">' +
        '<input type="checkbox" id="aff-quarantine-toggle" class="mt-0.5 accent-indigo-600 w-4 h-4">' +
        '<div><span class="text-xs font-bold text-indigo-700">' + esc(t('aff_setup_quarantine', 'Quarantena al posto del blocco')) + '</span>' +
        '<p class="text-xs text-indigo-700 mt-0.5 leading-relaxed">' + esc(t('aff_setup_quarantine_desc', 'Quando il confronto riesce, «Genera materiali» non aspetta la revisione dei contenuti: usa le decisioni che hai già preso e lascia fuori le frasi contestate da segnalazioni aperte e quelle dei nodi che il controllo non ha esaminato (tranne il testo che hai scritto o ritoccato tu). Quando la frase contestata è individuata, resta fuori ogni frase della mappa che la riprende. Quando una segnalazione non permette di individuare la frase, resta fuori tutto il nodo, ma il testo che hai scritto o ritoccato con una tua decisione resta nei materiali, se non ripete parola per parola una frase del nodo. In quel caso, se la segnalazione viene dal controllo, possono restare fuori anche frasi di altri nodi che ripete. La revisione dei materiali si apre sempre. La mappa non cambia.')) + '</p>' +
        (motivo ? '<p class="text-xs text-indigo-700 mt-0.5 font-bold" data-aff-setup-reason>' + esc(motivo) + '</p>' : '') + '</div>' +
      '</label>' +
      /* packet 0041: la sotto-spunta delle frasi rimaste fuori. Compare solo con lo
         strato acceso, perché senza non fa niente (inv. 21: un comando inerte non si
         mostra); con la revisione spenta non c'è il Banco dove l'elenco vive. */
      (acceso ? '<label class="flex items-start gap-3 cursor-pointer mt-2 ml-7">' +
        '<input type="checkbox" id="aff-orphans-toggle" class="mt-0.5 accent-indigo-600 w-4 h-4">' +
        '<div><span class="text-xs font-bold text-indigo-700">' + esc(t('aff_orf_setup', 'Frasi della fonte rimaste fuori dalla mappa')) + '</span>' +
        '<p class="text-xs text-indigo-700 mt-0.5 leading-relaxed">' + esc(t('aff_orf_setup_desc', 'Nella revisione dei contenuti, sotto «Copertura del controllo», elenca le frasi della fonte che la mappa riprende poco o per niente, o a cui mancano numeri, date o nomi. Indica dove guardare, non garantisce che la mappa riprenda tutto: la mappa non cambia. Nessuna chiamata all’AI.')) + '</p>' +
        (revisioneSpenta ? '<p class="text-xs text-indigo-700 mt-0.5 font-bold" data-aff-setup-reason>' + esc(t('aff_orf_setup_review_off', 'La revisione dei contenuti è spenta: l’elenco si vede solo lì.')) + '</p>' : '') + '</div>' +
      '</label>' : '') +
      '</div>';
    const strato = host.querySelector('#aff-layer-toggle'), q = host.querySelector('#aff-quarantine-toggle');
    const orf = host.querySelector('#aff-orphans-toggle');
    // trappola 10: prima i gestori, poi le spunte (`.checked` da JS non scatena onchange)
    if (strato) {
      strato.onchange = () => { scrivi('mappai_affermazioni', strato.checked ? '1' : '0'); disegnaSetup(host); };
      strato.checked = acceso;
    }
    if (q) {
      q.onchange = () => { scrivi('mappai_quarantena', q.checked ? '1' : '0'); disegnaSetup(host); };
      q.checked = quarantena;
      q.disabled = !!motivo;
    }
    if (orf) {
      orf.onchange = () => { scrivi('mappai_frasi_orfane', orf.checked ? '1' : '0'); disegnaSetup(host); };
      orf.checked = leggi('mappai_frasi_orfane') === '1';
      orf.disabled = revisioneSpenta;
    }
    return host;
  }
  /* Il posto: accanto a «Evidenze dalla fonte nei quiz» (#evidence-toggle), ma
     FUORI dal contenitore di Infomaniak che lo ospita: quello si nasconde col
     provider Google, e la quarantena non chiama nessun modello — vale per tutti
     e due i fornitori. Sta nello stesso elenco dei comandi del Setup, quindi
     quando la Cabina li sposta il riquadro va con loro. Si ridisegna ogni volta
     che torna visibile (IntersectionObserver: il gesto che apre il Setup non
     passa da una funzione che si possa avvolgere) e dopo i bottoni della lingua. */
  let osservato = null;
  function montaSetup() {
    const toggle = document.getElementById && document.getElementById('evidence-toggle');
    if (!toggle) return null;
    const casa = document.getElementById('infomaniak-api-key-container') || (toggle.closest ? toggle.closest('.bg-indigo-50') : null);
    if (!casa || !casa.parentNode) return null;
    let host = document.getElementById('aff-setup');
    if (!host) {
      host = document.createElement('div'); host.id = 'aff-setup';
      casa.parentNode.insertBefore(host, casa.nextSibling);
    }
    disegnaSetup(host);
    if (osservato !== host && typeof IntersectionObserver === 'function') {
      osservato = host;
      new IntersectionObserver(voci => { if (voci.some(v => v.isIntersecting)) disegnaSetup(host); }).observe(host);
    }
    ['lang-btn-it', 'lang-btn-en'].forEach(id => {
      const b = document.getElementById(id);
      if (b && b.addEventListener && !b.__affSetup) {
        b.__affSetup = true;
        b.addEventListener('click', () => setTimeout(() => disegnaSetup(document.getElementById('aff-setup')), 60));
      }
    });
    return host;
  }

  /* ── 2. LO STRATO DEL BANCO ─────────────────────────────────────────────────
     opts: { manifest, isFinal, getReview?, db?, vaiA?(issueId), mostraFonte?(prove), correggiNodo?(nodeId) }.
     `correggiNodo` (0075, Q1): con la veste del Banco «Correggi il nodo vicino» apre la scheda del nodo e risponde con
     una Promise, che è sempre vera: il ripiego qui sotto non scatta, e non servirebbe, perché con la veste il riquadro
     #mrv-other-nodes non c'è (giro di correzione del 07/10, N4: il commento di prima prometteva un ripiego che non c'era).
     Senza la veste (o senza `correggiNodo`) la risposta è falsa e vale il riquadro «Correggi anche un nodo non
     segnalato», come prima.
     Le corsie si calcolano sulla revisione e sulla mappa DI ADESSO (le
     decisioni cambiano mentre il Banco è aperto), una volta per firma. */
  /* Le parole dicono solo ciò che il sistema sa (giro 1 del 26/09): una frase
     tolta perché il controllo ha segnalato il NODO senza indicare la frase
     (modo 'nodo') non è «contestata»; una segnalazione il cui passo non c'è più
     non è «già corretta», il passo è cambiato con una decisione; le frasi della
     corsia del docente comprendono le proposte accettate, quindi «cambiate con
     una tua decisione», non «scritte da te». */
  const TITOLI_CORSIA = () => ({
    'fuori-non-esaminata': t('aff_why_unchecked', 'nodo che il controllo non ha esaminato'),
    'fuori-contestata-giudice': t('aff_why_judge', 'contestata dal controllo, da decidere'),
    'fuori-contestata-giudice-nodo': t('aff_why_judge_node', 'il controllo ha segnalato il nodo senza dire quale frase, da decidere'),
    'fuori-contestata-docente': t('aff_why_teacher', 'aperta da te, da decidere'),
    /* giro 5 (F3): la frase che il docente ha ritoccato RIPRENDE ancora il passo
       contestato — per contenimento di parole piene, non parola per parola:
       «somiglia», mai «contiene» */
    'fuori-contestata-ritoccata': t('aff_why_touched', 'l’hai ritoccata, ma somiglia ancora al passo contestato: da decidere'),
    // giro 5 (F1): una frase (anche di un altro nodo) che somiglia al passo contestato da una segnalazione aperta
    'fuori-contestata-simile': t('aff_why_similar', 'somiglia a un passo contestato, da decidere'),
    /* giro 7 (H10): in modo 'nodo' la frase di un ALTRO nodo esce perché somiglia a
       una frase del nodo segnalato (o la ripete), non perché qualcuno l'abbia contestata */
    'fuori-contestata-nodo-altrove': t('aff_why_node_elsewhere', 'somiglia a una frase di un nodo che il controllo ha segnalato senza dire quale frase contesta, da decidere'),
    // giro 7 (H5): il controllo ha segnalato un altro nodo, ma il suo problema parla di questa frase
    'fuori-contestata-nodo-problema': t('aff_why_node_problem', 'il controllo ha segnalato un altro nodo, ma il problema che descrive parla di questa frase: da decidere'),
    'fuori-coesione': t('aff_why_cohesion', 'riprende una frase esclusa')
  });
  /* Il documento dei nessi che non va ai materiali, col motivo VERO (giro 4,
     E3): `motivoDocumentoNessi` del core. Le parole valgono sia prima sia dopo
     la generazione: dicono che cosa fa la quarantena, non che cosa è successo. */
  function motivoNessi(m) {
    if (m === 'frase_esclusa') return t('aff_causal_why_sentence', 'contiene una frase che la quarantena tiene fuori dai materiali');
    // giro 5 (F3): la riga viene da un nodo con frasi escluse, ma non ne contiene nessuna
    if (m === 'nodo_con_esclusioni') return t('aff_causal_why_node', 'tocca un nodo con frasi che la quarantena tiene fuori');
    if (m === 'collegamento_escluso') return t('aff_causal_why_link', 'contiene un collegamento che la quarantena tiene fuori dai materiali');
    if (m === 'decisione_descrizione' || m === 'decisione_collegamento') return t('aff_causal_why_decision', 'una tua decisione ha cambiato un nodo o un collegamento che vi compare');
    return t('aff_causal_why_unknown', 'non si può confrontare con il testo usato per i materiali');
  }
  function per(opts) {
    const o = opts || {};
    if (o.isFinal) return null;
    const A = aff();
    if (!A || !A.acceso() || !core()) return null;
    const getReview = typeof o.getReview === 'function' ? o.getReview : () => o.manifest && o.manifest.review;
    const getDb = typeof o.db === 'function' ? o.db : () => { const s = state(); return s && s.db; };
    let cache = null;
    function analisi() {
      const rv = getReview(), db = getDb(), AC = core(), RC = reviewCore();
      if (!rv || !rv.initial || rv.initial.status !== 'awaiting_review' || !db || !Array.isArray(db.nodes) || !AC || !RC) return null;
      /* La coda chiede lo stato voce per voce: con la stessa revisione e la stessa
         mappa (ogni decisione crea una revisione nuova) non si ricalcola niente. */
      if (cache && cache.rv === rv && cache.db === db) return cache.valore;
      let chiave, valore;
      /* La copertura del Giudice sta nella chiave (giro 2 del 26/09): un
         «Ricontrolla» che non trova segnalazioni nuove lascia uguali issues e
         decisioni, quindi la firma, ma allarga i nodi e i collegamenti
         esaminati — e le corsie ne dipendono. */
      try {
        const ini = rv.initial || {}, copertura = rep => (rep && typeof rep === 'object' ? rep.copertura || null : null);
        chiave = AC.firma(rv, db, db.causalDoc) + '|' + RC.revision(db, rv.sources) + '|' +
          RC.revision({ items: [{ id: 'cop', value: [copertura(ini.report), (ini.previousReports || []).map(copertura)] }] }, []);
      } catch (e) { return { errore: e }; }
      if (cache && cache.chiave === chiave) { cache.rv = rv; cache.db = db; return cache.valore; }
      try {
        if (!RC.coincide(db, rv.sources, rv, 'base')) valore = { cambiata: true };   // 0097: in forma canonica
        else {
          const c = AC.corsie({ review: rv, db });
          const FUORI = AC.FUORI, fuori = new Set(), etichette = new Set(), senzaEffetto = new Map(), ritoccate = new Set();
          c.righe.forEach(r => { if (FUORI.indexOf(r.corsia) >= 0 && r.issueId) fuori.add(r.issueId); });
          c.linkEsclusi.forEach(l => { if (l.issueId) fuori.add(l.issueId); });
          /* che cosa fa ai materiali ogni segnalazione aperta sulla desc (giro 2):
             'fuori' anche quando la sua frase è uscita per un'altra segnalazione */
          const esiti = c.esitiSegnalazioni || {};
          Object.keys(esiti).forEach(id => {
            if (esiti[id] === 'ritoccata') { ritoccate.add(id); fuori.add(id); }
            if (esiti[id] === 'fuori') fuori.add(id);
            else if (esiti[id] === 'docente' || esiti[id] === 'docente-in-parte' || esiti[id] === 'vuoto') senzaEffetto.set(id, esiti[id]);
          });
          const dec = rv.initial.decisions || {};
          (rv.initial.issues || []).forEach(i => {
            if (RC.decisionOutcome(i, dec[i.id]) !== 'pending') return;
            if (i.target.kind === 'node' && i.target.field === 'label') etichette.add(i.id);
          });
          let causalMotivo = '';
          try { causalMotivo = db.causalDoc && AC.motivoDocumentoNessi ? AC.motivoDocumentoNessi(c, db) : ''; }
          catch (e) { causalMotivo = db.causalDoc ? 'vista_non_calcolabile' : ''; }
          valore = { c, fuori, etichette, ritoccate, superate: new Set(c.superate), senzaEffetto, causalScartato: !!causalMotivo, causalMotivo, FUORI };
        }
      } catch (e) {
        console.warn('[Affermazioni] strato non calcolabile:', e && e.message);
        valore = { errore: e };
      }
      cache = { chiave, valore, rv, db };
      return valore;
    }
    const inAttesa = () => { const rv = getReview(); return !!(rv && rv.initial && rv.initial.status === 'awaiting_review'); };
    return {
      /* lo stato di una voce DA DECIDERE nella coda: null = quello di oggi */
      stato(group) {
        if (!A.facoltativa(getReview())) return null;
        const a = analisi();
        if (!a || !a.c) return null;
        const ids = (group || []).map(i => i.id);
        if (ids.some(id => a.etichette.has(id))) return t('aff_state_label', 'Da decidere · ferma i materiali');
        /* giro 4 (E1): la frase che il docente ha ritoccato e che riprende ancora il
           passo contestato esce — e lo stato lo dice, invece di «superata».
           Giro 5 (F3): la riprende per contenimento, quindi «somiglia», non «contiene» */
        if (ids.some(id => a.ritoccate.has(id))) return t('aff_state_touched', 'Da decidere · una frase che hai ritoccato somiglia ancora al passo contestato: resta fuori dai materiali finché non decidi');
        if (ids.some(id => a.fuori.has(id))) return t('aff_state_out', 'Fuori dai materiali finché non decidi');
        /* giro 3 (D4a): non si afferma a quale frase si riferisse — lo si è
           dedotto, e dopo la correzione non si può più mostrare */
        if (ids.some(id => a.superate.has(id))) return t('aff_state_superseded', 'Da decidere · il passo contestato non si ritrova più nel testo che hai corretto: per ora non toglie niente dai materiali');
        const nessuno = ids.map(id => a.senzaEffetto.get(id)).filter(Boolean);
        /* giro 4 (E1): come per «superata», non si afferma a quali frasi si
           riferisca la segnalazione — il controllo ha indicato il nodo, e il
           testo del nodo è tutto cambiato da decisioni del docente.
           Giro 6 (G1): quel testo resta nei materiali, e lo si dice */
        /* Giro 7 (H10): «resta nei materiali» solo se nessuna riga del nodo è fuori
           a fine calcolo; se un'altra segnalazione aperta ne toglie una parte, lo si dice */
        if (nessuno.indexOf('docente-in-parte') >= 0) return t('aff_state_teacher_part', 'Da decidere · da sola non toglie niente dai materiali: il testo del nodo l’hai scritto o ritoccato tu, ma una sua parte resta fuori per un’altra segnalazione aperta');
        if (nessuno.length) return nessuno.indexOf('docente') >= 0
          ? t('aff_state_teacher_text', 'Da decidere · per ora non toglie niente dai materiali: il testo del nodo l’hai scritto o ritoccato tu con le tue decisioni, e resta nei materiali')
          : t('aff_state_no_text', 'Da decidere · non toglie niente dai materiali: il nodo non ha testo');
        return null;
      },
      /* una frase in più nel piede: '' = il piede di oggi. 0123, lotto 3b: `breve` quando il piede della veste dice già
         che la mappa è cambiata dopo il controllo (non si ripetono le stesse parole) */
      piede(opts) {
        if (!inAttesa() || !A.facoltativa(getReview())) return '';
        const a = analisi();
        if (a && a.cambiata) return opts && opts.breve
          ? t('aff_footer_changed_breve', 'Per creare i materiali vale di nuovo la revisione completa.')
          : t('aff_footer_changed', 'La mappa è cambiata dopo il controllo: per creare i materiali vale di nuovo la revisione completa.');
        if (a && a.c && a.c.etichetteSegnalate > 0) return t('aff_footer_labels', 'Per creare i materiali prima di aver deciso tutto, decidi le segnalazioni sui titoli dei nodi.');
        /* giro 3 (D4c): quando la frase non si individua esce tutto il nodo, e lo si dice;
           giro 6 (G1): tranne il testo scritto o ritoccato dal docente, che resta nei materiali;
           giro 7 (H6): se non ripete parola per parola una frase del nodo;
           giro 8 (I4): con la frase individuata esce ogni frase della mappa che la riprende (H3); senza,
           per le segnalazioni del controllo, anche le frasi di altri nodi che la segnalazione ripete (H5, I3) */
        return t('aff_footer', 'Non serve decidere tutto per creare i materiali: «Genera materiali» usa le decisioni già prese e lascia fuori le frasi indicate dalle segnalazioni aperte, con ogni frase della mappa che le riprende; quando una segnalazione non permette di individuare la frase, lascia fuori tutto il nodo, ma il testo che hai scritto o ritoccato con una tua decisione resta nei materiali, se non ripete parola per parola una frase del nodo. In quel caso, se la segnalazione viene dal controllo, possono restare fuori anche frasi di altri nodi che ripete. I materiali passano comunque dalla tua revisione.');
      },
      /* la copertura come unione dei giri del Giudice: '' se non si sa */
      suffissoCopertura() {
        const a = analisi();
        if (!a || !a.c || !a.c.rapporto) return '';
        const totale = a.c.esaminati.length + a.c.nonEsaminati.length;
        return ' · ' + t('aff_coverage_rounds', 'descrizioni esaminate in almeno un giro:') + ' ' + a.c.esaminati.length + ' / ' + totale;
      },
      /* le frasi vicine nella fonte delle affermazioni di un nodo (quelle che «Mostra nella fonte» mostra): la veste del
         Banco (0075, §4.11) le passa alla Fonte dopo le prove delle note. [] se lo strato non si calcola */
      prove(nodeId) {
        const a = analisi();
        if (!a || !a.c || !Array.isArray(a.c.righe)) return [];
        return a.c.righe.filter(r => r && String(r.nodeId) === String(nodeId) && r.vicina && r.vicina.testo)
          .map(r => ({ text: r.vicina.testo, page: r.vicina.page }));
      },
      /* `come.veste` (0075, terzo giro): il blocco dentro la sezione «Il controllo» della veste del Banco, senza il conto
         dei collegamenti mai esaminati (vedi `blocco` qui sotto). Senza argomento è il blocco del Banco di prima. */
      blocco(come) {
        const rv = getReview();
        /* gate 3 del 27/09: quarantena accesa su un progetto dove non si può
           calcolare (niente rapporto del controllo, niente fonti) — lo si dice,
           invece di contare come fuori dai materiali ogni frase non esaminata */
        const manca = A.quarantenaAccesa() && inAttesa() && typeof A.nonCalcolabile === 'function' ? A.nonCalcolabile(rv) : '';
        const box = manca ? bloccoNonVale(manca, rv) : blocco(analisi(), rv, getDb(), A.facoltativa(rv), o, come);
        // packet 0041: in coda, e solo con `mappai_frasi_orfane` acceso (spento: il blocco del 0042 com'era)
        const orfane = box ? bloccoOrfane(getReview(), getDb(), o) : null;
        if (orfane) box.appendChild(orfane);
        return box;
      }
    };
  }

  /* ── 2-bis. LE FRASI DELLA FONTE RIMASTE FUORI (packet 0041) ────────────────
     Un gruppo in coda al blocco del Banco (G1, revisione in attesa): le frasi
     della fonte che nella mappa viva non hanno affermazioni vicine, e quelle a
     cui mancano numeri, date, nomi propri o sigle. Al più 12 per gruppo, in
     ordine di pagina (il core). Per ogni riga «Mostra nella fonte» e, se c'è un
     nodo vicino, «Correggi il nodo vicino»: apre il riquadro «Correggi anche un
     nodo non segnalato» (#mrv-other-nodes, che il Banco disegna in G1 quando la
     revisione è modificabile), sceglie il nodo e ne lancia l'`onchange` — la
     scelta di `.value` da JS non lo scatena (trappola 10). mappai-review.js non
     cambia. Le parole dicono solo «vicina», «manca», «rimasta fuori» (inv. 22).
     Null con l'interruttore spento: il blocco del 0042 resta com'era (inv. 1).
     Giro di correzione del 27/09: il nodo c'è solo quando un'affermazione ha
     in comune con la frase almeno due parole piene non generiche (lo decide il
     core); il gruppo si chiama «Riprese poco o per niente dalla mappa», perché
     «senza affermazioni vicine» era falso per le frasi riprese in parte; la
     nota dice quante frasi si sono confrontate e che cosa il confronto non
     vede. Il blocco sta dentro «Copertura del controllo» (il posto del blocco
     del 0042 in mappai-review.js, che qui non si tocca): il riepilogo e il
     Setup lo dicono. */
  function _correggiNodo(nodeId) {
    const box = document.getElementById && document.getElementById('mrv-other-nodes');
    const sel = box && box.querySelector('label select');
    if (!sel) return false;
    box.setAttribute('open', '');
    sel.value = String(nodeId);
    if (typeof sel.onchange === 'function') sel.onchange();
    if (typeof sel.focus === 'function') sel.focus();
    if (typeof box.scrollIntoView === 'function') box.scrollIntoView({ block: 'nearest' });
    return true;
  }
  function bloccoOrfane(rv, db, o) {
    const A = aff();
    if (!A || typeof A.orfaneAccese !== 'function' || !A.orfaneAccese()) return null;
    let r = null, errore = false;
    try { r = A.frasiOrfane(rv, db); } catch (e) { errore = true; console.warn('[Affermazioni] frasi rimaste fuori non calcolabili:', e && e.message); }
    if (!r && !errore) return null;
    const nomi = new Map(((db && db.nodes) || []).map(n => [String(n.id), etichetta(n.label || n.id)]));
    const tot = r ? r.totali.orfane + r.totali.mancanti : 0;
    const det = document.createElement('details');
    det.setAttribute('data-aff-orfane', ''); det.setAttribute('open', '');
    /* Gate 3 del 27/09 (Giacomo: niente sovraccarico, il docente non deve sentirsi travolto): a schermo una
       riga sola; le avvertenze sui limiti del confronto (inv. 22: l'elenco non certifica niente) stanno nel
       suggerimento del titolo, dove restano leggibili senza occupare la scheda. */
    const limiti = t('aff_orf_why', 'Il confronto è fra parole: indica dove guardare, non dice che la mappa sia sbagliata.') + ' ' +
      t('aff_orf_limit', 'Le frasi molto brevi e quelle che finiscono in un vuoto da riempire non si confrontano, e una frase che qui non compare può aver perso una parte delle sue parole: l’elenco non garantisce che la mappa riprenda tutto.');
    det.innerHTML = '<summary title="' + esc(limiti) + '">' + esc(t('aff_orf_title', 'Frasi della fonte rimaste fuori')) + (r ? ' (' + tot + ')' : '') + '</summary>' +
      '<p class="text-sm" data-aff-orf-nota>' + esc(errore ? t('aff_orf_error', 'Le frasi della fonte non si possono confrontare con la mappa.')
        : !r.frasi ? t('aff_orf_no_source', 'La fonte di questa revisione non ha frasi da confrontare.')
        : !tot ? t('aff_orf_none', 'Nessuna frase rimasta fuori.')
        : t('aff_orf_note', 'Da rileggere nella fonte: la mappa non le riprende, o le riprende senza un numero, una data o un nome.')) + '</p>';
    if (!r || !tot) return det;
    [
      { id: 'orfane', titolo: t('aff_orf_group_orphan', 'Riprese poco o per niente dalla mappa'), righe: r.orfane, totale: r.totali.orfane },
      { id: 'mancanti', titolo: t('aff_orf_group_missing', 'Con elementi che nella mappa mancano'), righe: r.mancanti, totale: r.totali.mancanti }
    ].forEach(g => {
      if (!g.righe.length) return;
      const gruppo = document.createElement('div');
      gruppo.setAttribute('data-aff-orf-gruppo', g.id);
      gruppo.innerHTML = '<p class="mrv-field-label">' + esc(g.titolo) + ' (' + g.totale + ')</p>';
      g.righe.forEach(x => {
        const riga = document.createElement('div');
        riga.className = 'mrv-aff-riga'; riga.setAttribute('data-aff-orf-riga', g.id);
        const nodo = x.nodoVicino != null && nomi.has(String(x.nodoVicino)) ? String(x.nodoVicino) : null;
        const dove = [x.page ? t('rv_page', 'Pagina') + ' ' + x.page : '', nodo ? t('aff_orf_near_node', 'nodo più simile per parole') + ': ' + nomi.get(nodo) : ''].filter(Boolean);
        riga.innerHTML = (dove.length ? '<p class="mrv-aff-nodo">' + esc(dove.join(' · ')) + '</p>' : '') +
          '<p class="mrv-aff-testo">' + esc(x.text) + '</p>' +
          (x.elementiTesto && x.elementiTesto.length ? '<p class="mrv-aff-fonte" data-aff-orf-manca>' + esc(t('aff_orf_missing', 'Nella mappa manca') + ': ' + x.elementiTesto.join(', ')) + '</p>' : '');
        if (typeof o.mostraFonte === 'function') {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'pm-btn-cancel';
          b.setAttribute('data-aff-orf-fonte', '');
          b.textContent = t('aff_show_source', 'Mostra nella fonte');
          b.onclick = () => o.mostraFonte([{ text: x.text, page: x.page }]);
          riga.appendChild(b);
        }
        if (nodo) {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'pm-btn-cancel';
          b.setAttribute('data-aff-orf-correggi', nodo);
          b.textContent = t('aff_orf_fix_node', 'Correggi il nodo vicino');
          b.onclick = () => (typeof o.correggiNodo === 'function' && o.correggiNodo(nodo)) || _correggiNodo(nodo);
          riga.appendChild(b);
        }
        gruppo.appendChild(riga);
      });
      if (g.totale > g.righe.length) {
        const altre = document.createElement('p'); altre.className = 'text-sm'; altre.setAttribute('data-aff-orf-altre', g.id);
        altre.textContent = t('aff_orf_more', 'Altre frasi non mostrate:') + ' ' + (g.totale - g.righe.length);
        gruppo.appendChild(altre);
      }
      det.appendChild(gruppo);
    });
    return det;
  }

  /* Gate 3 del 27/09: la quarantena è accesa ma su questo progetto non si può
     calcolare. Senza fonti nella revisione non c'è controllo che la rimetta in
     piedi, e lo si dice per primo; senza rapporto, riprovare il controllo sì. */
  function bloccoNonVale(motivo, rv) {
    const box = document.createElement('section');
    box.className = 'mrv-aff'; box.setAttribute('data-aff-blocco', ''); box.setAttribute('data-aff-non-vale', motivo);
    const senzaFonti = motivo === 'fonte_vuota' || !(rv && Array.isArray(rv.sources) && rv.sources.length);
    const perche = senzaFonti
      ? t('aff_na_no_sources', 'la revisione di questa mappa non ha le fonti, quindi le descrizioni non si possono confrontare con la fonte. Per usare la quarantena serve una mappa generata di nuovo dalla fonte.')
      : motivo === 'rapporto_assente'
        ? t('aff_na_no_report', 'il controllo automatico dei contenuti non ha un rapporto su questa mappa, quindi non sa quali frasi sono contestate. Se riprovi il controllo e va a buon fine, la quarantena torna a valere.')
        : motivo === 'controllo_non_disponibile'
          ? t('aff_na_unchecked', 'il controllo automatico dei contenuti non ha esaminato nessuna descrizione di questa mappa. Se riprovi il controllo e va a buon fine, la quarantena torna a valere.')
          : t('aff_na_error', 'non si può calcolare su questa mappa.');
    box.innerHTML = '<p class="mrv-field-label">' + esc(t('aff_block_title', 'Affermazioni delle descrizioni')) + '</p>' +
      '<p class="text-sm">' + esc(t('aff_na_lead', 'La quarantena non vale per questo progetto:') + ' ' + perche + ' ' +
        t('aff_na_tail', 'Per creare i materiali vale la revisione completa, come a quarantena spenta.')) + '</p>';
    return box;
  }

  function blocco(a, rv, db, quarantena, o, come) {
    if (!a) return null;
    const veste = !!(come && come.veste);
    const box = document.createElement('section');
    box.className = 'mrv-aff'; box.setAttribute('data-aff-blocco', '');
    const titolo = '<p class="mrv-field-label">' + esc(t('aff_block_title', 'Affermazioni delle descrizioni')) + '</p>';
    if (a.errore || a.cambiata) {
      box.innerHTML = titolo + '<p class="text-sm">' + esc(a.cambiata
        ? t('aff_block_changed', 'La mappa è cambiata dopo il controllo: le affermazioni si ricalcolano quando la revisione è di nuovo allineata.')
        : t('aff_block_error', 'Le affermazioni di questa mappa non si possono calcolare: i materiali seguono la revisione completa.')) + '</p>';
      return box;
    }
    const c = a.c, FUORI = a.FUORI;
    const nomi = new Map(((db && db.nodes) || []).map(n => [String(n.id), etichetta(n.label || n.id)]));
    const gruppi = [
      { id: 'fuori', aperto: true, titolo: quarantena ? t('aff_group_out', 'Fuori dai materiali finché non decidi')
        : t('aff_group_out_if', 'Resterebbero fuori dai materiali con la quarantena'), righe: c.righe.filter(r => FUORI.indexOf(r.corsia) >= 0) },
      { id: 'docente', titolo: t('aff_group_teacher', 'Cambiate con una tua decisione'), righe: c.righe.filter(r => r.corsia === 'docente') },
      { id: 'vicina', titolo: t('aff_group_near', 'Con una frase vicina nella fonte'), righe: c.righe.filter(r => r.corsia === 'vicina') },
      { id: 'senza', titolo: t('aff_group_none', 'Senza frase vicina'), righe: c.righe.filter(r => r.corsia === 'senza') },
      { id: 'servizio', titolo: t('aff_group_service', 'Di servizio'), righe: c.righe.filter(r => r.corsia === 'servizio') }
    ];
    const conta = id => gruppi.find(g => g.id === id).righe.length;
    const linkDaDecidere = c.linkEsclusi.filter(l => l.issueId).length, linkNonEsaminati = c.linkEsclusi.length - linkDaDecidere;
    /* 0075, terzo giro (punto 5, Q8): nella veste del Banco i non letti si contano in un posto solo, coi «Non letti dal
       controllo» della barra (l'ultimo rapporto). Il conto qui sotto è un'altra cosa — i collegamenti che nessun giro del
       controllo ha esaminato, che la quarantena tiene fuori dai materiali — e accanto a «19 parti non lette (18
       collegamenti)» diceva «1 collegamenti che il controllo non ha esaminato»: con la veste non si mette. Su «Svizzera»
       quell'1 è fra i 18 non letti della barra; che lo sia sempre non è dimostrato (limite dichiarato del terzo giro).
       Senza la veste resta, al plurale com'era: lo fissa tests/review-controller.test.js.
       «1 collegamento da decidere» al singolare, con e senza la veste (cambia solo quella parola). */
    box.innerHTML = titolo +
      '<p data-aff-conteggi>' + esc([
        conta('vicina') + ' ' + t('aff_count_near', 'con una frase vicina nella fonte'),
        conta('senza') + ' ' + t('aff_count_none', 'senza frase vicina'),
        conta('fuori') + ' ' + (quarantena ? t('aff_count_out', 'fuori dai materiali') : t('aff_count_out_if', 'da tenere fuori con la quarantena')),
        conta('servizio') + ' ' + t('aff_count_service', 'di servizio'),
        conta('docente') + ' ' + t('aff_count_teacher', 'cambiate con una tua decisione')
      ].join(' · ')) + (linkDaDecidere ? ' · ' + esc(linkDaDecidere + ' ' + (linkDaDecidere === 1 ? t('aff_count_link', 'collegamento da decidere') : t('aff_count_links', 'collegamenti da decidere'))) : '') +
      (linkNonEsaminati && !veste ? ' · ' + esc(linkNonEsaminati + ' ' + t('aff_count_links_unchecked', 'collegamenti che il controllo non ha esaminato')) : '') + '</p>' +
      '<p class="text-sm" data-aff-nota>' + esc(t('aff_block_note', 'Una frase vicina nella fonte non è una frase verificata: indica soltanto dove guardare. Qui si legge e basta: si decide sulle segnalazioni.')) + '</p>' +
      /* giro 4 (E3): nel Banco non c'è ancora nessun materiale — si dice che
         cosa succederà con «Genera materiali», e perché */
      (a.causalScartato ? '<p class="text-sm" data-aff-causal>' + esc(quarantena
        ? t('aff_causal_will_drop', 'Con «Genera materiali» la catena dei perché che hai rivisto non verrà usata') + ': ' + motivoNessi(a.causalMotivo) + '. ' +
          t('aff_causal_will_rebuild', 'Se chiedi la catena, sarà ricavata dal testo usato per i materiali, senza le tue modifiche.')
        : t('aff_causal_dropped_if', 'Con la quarantena la catena dei perché che hai rivisto non andrebbe ai materiali') + ': ' + motivoNessi(a.causalMotivo) + '.') + '</p>' : '');
    const titoli = TITOLI_CORSIA();
    gruppi.forEach(g => {
      if (!g.righe.length) return;
      const det = document.createElement('details');
      det.setAttribute('data-aff-gruppo', g.id);
      if (g.aperto) det.setAttribute('open', '');
      det.innerHTML = '<summary>' + esc(g.titolo) + ' (' + g.righe.length + ')</summary>';
      g.righe.forEach(r => {
        const riga = document.createElement('div');
        riga.className = 'mrv-aff-riga';
        riga.setAttribute('data-corsia', r.corsia);
        /* Giro 7 (H10): il modo 'nodo' si guarda PRIMA della via e del ritocco. Una
           frase uscita perché il controllo ha segnalato il nodo senza dire quale
           frase non «somiglia al passo contestato»: un passo non c'è. Nel nodo
           segnalato lo dice il testo del nodo; in un altro nodo, se il problema
           parla di lei (H5) o se somiglia a una frase del nodo segnalato. */
        const altroNodo = r.bersaglio != null && String(r.bersaglio) !== String(r.nodeId);
        const perche = r.corsia !== 'fuori-contestata' ? titoli[r.corsia]
          : r.modo === 'nodo' ? (r.via === 'problema' ? titoli['fuori-contestata-nodo-problema']
            : altroNodo ? titoli['fuori-contestata-nodo-altrove']
            : r.origine === 'docente' ? titoli['fuori-contestata-docente'] : titoli['fuori-contestata-giudice-nodo'])
          : r.ritoccata ? titoli['fuori-contestata-ritoccata']
          : r.via === 'contenimento' ? titoli['fuori-contestata-simile']
          : r.origine === 'docente' ? titoli['fuori-contestata-docente']
            : titoli['fuori-contestata-giudice'];
        riga.innerHTML = '<p class="mrv-aff-nodo">' + esc(nomi.get(String(r.nodeId)) || r.nodeId) + (perche ? ' · ' + esc(perche) : '') + '</p>' +
          '<p class="mrv-aff-testo">' + esc(r.testo) + '</p>' +
          (r.vicina ? '<p class="mrv-aff-fonte">' + esc(t('aff_near_source', 'Nella fonte') + (r.vicina.page ? ' · ' + t('rv_page', 'Pagina') + ' ' + r.vicina.page : '') + ': ') + '«' + esc(r.vicina.testo) + '»</p>' : '');
        if (r.issueId && typeof o.vaiA === 'function') {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'pm-btn-cancel';
          b.setAttribute('data-aff-vai', r.issueId);
          b.textContent = t('aff_go_issue', 'Vai alla segnalazione');
          b.onclick = () => o.vaiA(r.issueId);
          riga.appendChild(b);
        }
        if (r.vicina && typeof o.mostraFonte === 'function') {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'pm-btn-cancel';
          b.setAttribute('data-aff-fonte', '');
          b.textContent = t('aff_show_source', 'Mostra nella fonte');
          b.onclick = () => o.mostraFonte([{ text: r.vicina.testo, page: r.vicina.page }]);
          riga.appendChild(b);
        }
        det.appendChild(riga);
      });
      box.appendChild(det);
    });
    return box;
  }

  /* ── 3. LA RIGA DEL RIEPILOGO ───────────────────────────────────────────────
     La ricevuta dei materiali di questo giro (`final`, altrimenti le bozze).
     '' quando il giro non è nato sotto quarantena: il riepilogo resta com'era.
     Il bottone `#mps-rivedi` lo aggancia il riepilogo, che sa dove aprire. */
  function rigaRiepilogo(manifest, db) {
    const rv = manifest && manifest.review, A = aff();
    if (!rv || !A) return '';
    let ric = rv.final && rv.final.quarantena;
    if (!ric) { try { ric = A.ricevutaDelleBozze(rv.drafts); } catch (e) { ric = null; } }
    if (!ric || !ric.conteggi) return '';
    const f = ric.conteggi.fuori || {}, perSegnalazioni = (f.giudice || 0) + (f.docente || 0);
    const nomi = new Map((((db || {}).nodes) || []).map(n => [String(n.id), etichetta(n.label || n.id)]));
    const svuotati = (ric.svuotati || []).map(id => nomi.get(String(id)) || id);
    const dettagli = [perSegnalazioni + ' ' + t('aff_sum_undecided', 'per segnalazioni che non hai deciso'),
      (f.nonEsaminate || 0) + ' ' + t('aff_sum_unchecked', 'di nodi che il controllo non ha esaminato')];
    if (f.coesione) dettagli.push(f.coesione + ' ' + t('aff_sum_cohesion', 'che riprendevano una frase esclusa'));
    /* Ciò che il conto delle frasi non dice (giro 2 del 26/09): le segnalazioni
       aperte che non tolgono niente, i collegamenti tolti, il documento dei
       nessi rivisto dal docente che non è arrivato ai materiali. */
    const k = ric.conteggi, aperte = (k.superate || 0) + (k.senzaEffetto || 0);
    /* giro 3 (D4b): la frase sulla catena dei perché compare solo se la catena
       è nata davvero in questo giro — passo E concluso e la sua bozza con la
       stessa firma della ricevuta. Senza catena (non chiesta, o nessun nesso
       nella mappa) il documento scartato non ha tolto niente a nessuno.
       Giro 4 (E3): e solo se è stata PUBBLICATA — dopo G2 la bozza porta
       `published` e ha ancora almeno un nesso (G2 può escluderli tutti, e
       allora la catena non si consegna). */
    const bozzaE = rv.drafts && rv.drafts.E, passoE = manifest.steps && manifest.steps.E;
    const catenaDelGiro = !!(bozzaE && bozzaE.published === true && bozzaE.chains && bozzaE.chains.total > 0 &&
      passoE && passoE.status === 'done' && bozzaE.quarantena && bozzaE.quarantena.firma === ric.firma);
    const link = k.linkEsclusi || 0, linkNonEsaminati = k.linkNonEsaminati || 0;
    const altro = [];
    if (aperte) altro.push(aperte + ' ' + (aperte === 1 ? t('aff_sum_open_nothing_one', 'segnalazione aperta non toglie niente dai materiali')
      : t('aff_sum_open_nothing', 'segnalazioni aperte non tolgono niente dai materiali')));
    if (link) altro.push(link + ' ' + (link === 1 ? t('aff_sum_links_one', 'collegamento fuori dai materiali') : t('aff_sum_links', 'collegamenti fuori dai materiali')) +
      (linkNonEsaminati ? ' (' + linkNonEsaminati + ' ' + t('aff_sum_links_unchecked', 'mai esaminati dal controllo') + ')' : ''));
    /* packet 0041: quante frasi della fonte sono rimaste fuori dalla mappa, con
       l'interruttore acceso e G1 ancora in attesa — l'elenco vive nel Banco di
       G1, dove porta «Rivedi i contenuti». Spento o a zero: nessuna riga. */
    let orf = null;
    if (rv.initial && rv.initial.status === 'awaiting_review' && typeof A.frasiOrfane === 'function') {
      try { orf = A.frasiOrfane(rv, db); } catch (e) { orf = null; }
    }
    const nOrf = orf ? orf.totali.orfane + orf.totali.mancanti : 0;
    const rigaOrfane = nOrf ? '<div class="pm-option-desc" data-aff-orfane>' + esc(t('aff_orf_sum', 'Frasi della fonte rimaste fuori dalla mappa') + ': ' + nOrf +
      ' (' + orf.totali.orfane + ' ' + t('aff_orf_sum_orphan', 'che la mappa riprende poco o per niente') + ', ' + orf.totali.mancanti + ' ' + t('aff_orf_sum_missing', 'con elementi mancanti') + '). ' +
      t('aff_orf_sum_where', 'L’elenco è in «Rivedi i contenuti», sotto «Copertura del controllo».')) + '</div>' : '';
    return '<div id="mps-aff" style="padding:10px 0;border-bottom:1px solid #f1f5f9">' +
      '<div style="font-weight:800;color:#334155;font-size:13px">' + esc(t('aff_sum_title', 'Contenuti usati per i materiali')) + '</div>' +
      '<div class="pm-option-desc">' + esc((f.totale || 0) + ' ' + (f.totale === 1 ? t('aff_sum_out_one', 'frase fuori dai materiali') : t('aff_sum_out', 'frasi fuori dai materiali')) +
        ' (' + dettagli.join(', ') + ')') + '</div>' +
      (altro.length ? '<div class="pm-option-desc" data-aff-altro>' + esc(altro.join(' · ')) + '</div>' : '') +
      (ric.causalDocScartato && catenaDelGiro ? '<div class="pm-option-desc" data-aff-causal style="color:#b45309">' +
        esc(t('aff_causal_dropped', 'La catena dei perché che hai rivisto non è stata usata') + ': ' + motivoNessi(ric.causalDocMotivo) + '. ' +
          t('aff_causal_rebuilt', 'Nei materiali c’è la catena ricavata dal testo usato per i materiali, senza le tue modifiche.')) + '</div>' : '') +
      '<div class="pm-option-desc">' + esc(t('aff_sum_map', 'La mappa non è cambiata: la quarantena riguarda solo i materiali. Agli allievi arriva la mappa non rivista.')) + '</div>' +
      (svuotati.length ? '<div class="pm-option-desc" style="color:#b45309">' + esc(t('aff_sum_emptied', 'Nodi senza testo nei materiali:') + ' ' + svuotati.join(', ')) + '</div>' : '') +
      rigaOrfane +
      '<button type="button" id="mps-rivedi" class="pm-btn-cancel" style="margin-top:6px">' + esc(t('aff_sum_review', 'Rivedi i contenuti')) + '</button></div>';
  }

  window.MappAIAffermazioniUI = { per, rigaRiepilogo, montaSetup, disegnaSetup };
  try { montaSetup(); } catch (e) { console.warn('[Affermazioni] riquadro del Setup non montato:', e && e.message); }
}());
