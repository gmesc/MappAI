/*
 * mappai-tutor-reports.js — report HTML «Chiedi e Rispondi» (007, PURO; fino al 26/9/2026 «Chatta e Scrivi»)
 * --------------------------------------------------------------------
 * buildTutorReportHtml(results) → documento HTML completo e stampabile:
 * una scheda per studente con TESTO CONSEGNATO + TRASCRIZIONE CHAT affiancati
 * (il docente vede il processo, non solo il prodotto). Consuma il modello dati
 * di mappai-tutor-core.js:computeTutorResults. Usato dal server (scrive il file
 * a chiusura) e dal browser (anteprima docente).
 *
 * Modulo UMD: module.exports (Node) + window.MappAITutorReports (browser).
 * Dal packet 0132 ha la veste di tutti i report (MappAIDocHead.stileReport) e,
 * come quelli del LIVE, la loro barra, il loro titolo e la loro identità
 * dell'allievo: li prende da mappai-live-reports.js e mappai-live-core.js.
 */
(function () {
  'use strict';

    /* Il CARATTERE di questo documento: le @font-face + la variabile --doc-font
       che la regola del `body` legge. Un documento in finestra propria non carica
       style.css, quindi `--app-font` lì non esiste: il blocco va scritto dentro.
       Argomento = la scelta fatta in ELABORA per QUESTO documento; senza, comanda
       il carattere dell'app (18/8/26). */
    function _fontDoc(id) {
        try {
            return (typeof window !== 'undefined' && window.MappAIFont)
                ? window.MappAIFont.styleDocumento(id) : '';
        } catch (e) { return ''; }
    }


  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* I moduli accanto: nel renderer sono già caricati (index.html, prima di questo), in Node (tutor-server.js) si
     richiedono dalla stessa cartella. Senza, il report esce lo stesso: con un <h1> nudo e senza barra. */
  function _vicino(globale, file) {
    if (typeof window !== 'undefined' && window[globale]) return window[globale];
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      try { return require(file); } catch (e) { return null; }
    }
    return null;
  }
  function _DH() { return _vicino('MappAIDocHead', './mappai-doc-head.js'); }
  function _LR() { return _vicino('MappAILiveReports', './mappai-live-reports.js'); }
  function _LC() { return _vicino('MappAILiveCore', './mappai-live-core.js'); }

  /* IL NOME (D4; Giacomo, 27/10: «inserisci il nome del report coerentemente a come è strutturato per tutti gli altri
     report»): «[Progetto] · [Attività] · Report …» come i titoli dello 0127. La coda è il nome che il registro di INSEGNA
     dà già a questo file (`report-tutor.html` → «Report tutor», mappai-files-core.js). */
  /* Il nome dell'attività, uno: la barra del report e la pagina d'accesso degli allievi (0134, riga 3: tutor-server.js
     lo manda in /api/session come `attivita`). */
  var NOME_ATTIVITA = 'Chiedi e Rispondi';
  function titoloTutor(s) {
    return [s.name, NOME_ATTIVITA, 'Report tutor']
      .map(function (x) { return String(x == null ? '' : x).trim(); }).filter(Boolean).join(' · ');
  }
  /* L'ALLIEVO come negli altri report: «🦄 02», non «unicorno 02» (al «vai», 28/10). Nel file scritto dal server
     l'emoji è l'immagine SVG (0127), nel browser è testo */
  function identita(st) {
    var id = st.identity || {}, LC = _LC(), LR = _LR();
    var e = (LC && LC.emojiByKey) ? (LC.emojiByKey(id.emojiKey) || {}).emoji : '';
    var img = e ? ((LR && LR.emojiImmagine && LR.emojiImmagine(e, 'mm-rp-emoji')) || esc(e)) : esc(id.emojiKey || '');
    return img + ' ' + esc(id.num) + (st.name ? ' · ' + esc(st.name) : '');
  }

  var ACCENTO = '#4f46e5', FONDO = '#eef2ff';
  function riquadro(esito, etichetta, testo) {
    return '<div class="mm-rp-ris' + (esito ? ' mm-rp-ris--' + esito : '') + '"><span class="mm-rp-et">' + esc(etichetta) + '</span>' + testo + '</div>';
  }
  /* UNA SCHEDA PER ALLIEVO, con l'impianto degli altri report (gate del 28/10, Giacomo: «Tutto il report deve avere l'impianto del
     layout come gli altri report»): il riepilogo, poi in colonna il prodotto e il processo, separati da un filo come le domande.
     Il testo consegnato sta nel riquadro verde delle risposte giuste («il colore dell'area del testo consegnato usando il verde, lo
     stesso che usi per le riposte giuste nei report di Scelta Multipla»). */
  function studentCard(st) {
    // «0 scambi col tutor» non serve più come chip: lo dice il riepilogo («0/10 scambi col tutor»)
    var chips = st.submitted ? '<span class="mm-rp-esito mm-rp-esito--ok">consegnato</span>' : '<span class="mm-rp-esito mm-rp-esito--mano">non consegnato</span>';
    var testo = st.submissionText ? riquadro('ok', 'Testo consegnato', esc(st.submissionText)) : riquadro('vuota', 'Testo consegnato', 'Nessun testo consegnato.');
    var chat = st.transcript.length ? st.transcript.map(function (t) {
      return t.role === 'tutor' ? riquadro('', 'Tutor', esc(t.text)) : riquadro('vuota', 'Allievo', esc(t.text));
    }).join('') : riquadro('vuota', 'Chat', 'Nessuna chat.');
    // la scheda di un allievo con la sua chat può superare la pagina: si spezza (`--lunga`, come nei report del LIVE), e la chat fra un turno e l'altro
    return '<section class="mm-rp-card mm-rp-card--lunga"><div class="mm-rp-riep"><div class="mm-rp-occ"><span>Allievo</span>' + chips + '</div>' +
      '<div class="mm-rp-riga"><span class="mm-rp-chi">' + identita(st) + '</span>' +
      '<span class="mm-rp-num" style="color:' + ACCENTO + '">' + st.used + '/' + st.cap + '</span><span class="mm-rp-testo">scambi col tutor</span></div></div>' +
      '<div class="mm-rp-voce"><div class="mm-rp-occ"><span>Il prodotto</span></div>' + testo + '</div>' +
      '<div class="mm-rp-voce tr-chat"><div class="mm-rp-occ"><span>Il processo: la chat col tutor</span></div>' + chat + '</div></section>';
  }

  /* LA CONSEGNA NELLA TESTATA (gate del 28/10, Giacomo: «la testata deve avere scritto in piccolo 'Consegna:' e poi il testo della
     consegna con il font con la dimensione dei titoli delle testate»): dentro la card `mm-dh`, sotto titolo, data e chip */
  function conConsegna(testata, consegna) {
    if (!consegna || testata.slice(-6) !== '</div>') return testata;
    return testata.slice(0, -6) + '<div class="tr-cons"><span class="tr-cons__et">Consegna:</span>' +
      '<span class="tr-cons__t">' + esc(consegna) + '</span></div></div>';
  }

  function buildTutorReportHtml(results) {
    var s = (results && results.session) || {};
    var students = (results && results.students) || [];
    var H = _DH(), LR = _LR(), titolo = titoloTutor(s), R = (H && H.REPORT) || {};
    var css = H ? H.stile({ accento: ACCENTO, report: true, brand: 'MappAI · Chiedi e Rispondi', mappa: s.name || '' }) + '\n' +
      H.stileReport({ accento: ACCENTO, fondoAccento: FONDO }) : '';
    var testata = H ? conConsegna(H.testata({ titolo: titolo, tipo: s.topic || '', data: s.startedAt ? H.data(new Date(s.startedAt)) : false,
      classe: s.className || '', badge: 'Modalità: ' + (s.mode || '') + ' · cap ' + (s.cap || '') + ' scambi' }), s.writingBrief)
      : '<h1>' + esc(titolo) + '</h1>' + (s.writingBrief ? '<p>Consegna: ' + esc(s.writingBrief) + '</p>' : '');
    return '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      // il <title> dà il nome al PDF e resta com'era (0132, fuori ambito)
      '<title>Chiedi e Rispondi — ' + esc(s.name || '') + '</title>' +
      '<style>' + _fontDoc() + (LR && LR.caratteriReport ? LR.caratteriReport() : '') + '\n' + css +
      '\n.tr-cons{margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0}' +
      '.tr-cons__et{display:block;font-size:' + (R.occhiello || 11) + 'px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b}' +
      '.tr-cons__t{display:block;font-size:' + (R.titolo || 24) + 'px;font-weight:700;line-height:1.3;color:#1e293b;margin-top:4px}' +
      '.mm-rp-voce.tr-chat{page-break-inside:auto;break-inside:auto}.tr-chat .mm-rp-ris{page-break-inside:avoid;break-inside:avoid}</style></head><body>' +
      // la barra dei report del LIVE, la stessa (D4): «Stampa / PDF» e «Chiudi», dentro .no-print
      (LR && LR.barraReport ? LR.barraReport(titolo) : '') + testata +
      '<h2 class="mm-rp-sez">Gli allievi</h2>' +
      (students.length ? students.map(studentCard).join('') : '<section class="mm-rp-card"><div class="mm-rp-testo">Nessuno studente ha partecipato.</div></section>') +
      (H ? H.pieSchermo({ brand: 'MappAI · Chiedi e Rispondi', mappa: s.name || '', data: false }) : '') +
      '</body></html>';
  }

  var API = { buildTutorReportHtml: buildTutorReportHtml, titoloTutor: titoloTutor, NOME_ATTIVITA: NOME_ATTIVITA };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window === 'undefined') return;
  window.MappAITutorReports = API;
  console.log('[MappAITutorReports] report Chatta-e-Scrivi caricato');
})();
