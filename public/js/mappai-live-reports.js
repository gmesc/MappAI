/*
 * mappai-live-reports.js — generatori HTML dei report MappAI Live (PURI)
 * ---------------------------------------------------------------------
 * Funzioni pure che ritornano documenti HTML completi e stampabili:
 *   - buildQuestionsReportHtml  → Report A: heatmap domande (giusto/sbagliato/
 *                                 bianco, assoluti + %)
 *   - buildStudentsReportHtml   → Report B: una scheda per allievo (risultati
 *                                 per domanda, accuratezza, fluenza, forti/deboli)
 *   - buildCredentialCardsHtml  → foglio credenziali stampabile (classe)
 *
 * Consumano il modello dati di mappai-live-core.js:computeResults. Usati sia dal
 * server (live-server.js: scrive i file a chiusura) sia dal browser (docente:
 * anteprima via window.open). Dal packet 0132 i report hanno la veste del foglio
 * delle domande aperte, scritta una volta in mappai-doc-head.js (`stileReport`);
 * BASE_STYLES qui sotto resta per il foglio delle credenziali, che non è un report.
 *
 * Modulo UMD: module.exports (Node) + window.MappAILiveReports (browser).
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* LE EMOJI DEI REPORT E DELLE TESSERE (packet 0108, 16/10/2026).
     Fino al 16/10 arrivavano da fonts.googleapis.com: senza rete il PDF delle
     tessere usciva con le emoji Apple, cioè un'identità diversa da quella che
     l'allievo vede sul telefono. Ora i byte di 'MappAI Emoji' (le 27
     dell'identità + ⚠️, 💡 e le altre che questi documenti scrivono) stanno
     DENTRO il documento: il PDF nasce da un indirizzo `data:`, dove un percorso
     al font non arriva. Il file è public/js/vendor/mappai-emoji-incorpora.js,
     generato da tools/font/emoji-sottoinsieme.py. Se non c'è, lo stack ripiega
     sulle emoji di sistema: nessun guasto nuovo. */
  var EMOJI_STACK = "'MappAI Emoji','Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji'";

  function emojiIncorporate() {
    var api = null;
    if (typeof window !== 'undefined' && window.MappAIInc_emoji) {
      api = window.MappAIInc_emoji;
    } else if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      try { api = require('./vendor/mappai-emoji-incorpora.js'); } catch (e) { api = null; }
    }
    try { return api ? api.facce('MappAI Emoji') : ''; } catch (e) { return ''; }
  }

  /* 0127, gate del 27/10: aperto dal Finder, il report scritto su disco va in Safari, che il COLR v1
     lo disegna a quadratini (lo stesso guasto dell'iPhone, packet 0099). In Node, cioè quando il server
     scrive il file, l'emoji dell'allievo diventa l'immagine SVG estratta dallo stesso font
     (public/fonts/emoji/, tools/font/emoji-in-svg.py). Nel browser, o senza immagine, resta testo. */
  var immaginiEmoji = {};
  function emojiImmagine(e, classe) {
    if (typeof window !== 'undefined' || typeof require !== 'function' || typeof __dirname === 'undefined') return '';
    var cp = String(e || '').replace(/️/g, '');
    if (!cp || cp.codePointAt(0) < 0x2000 || String.fromCodePoint(cp.codePointAt(0)) !== cp) return '';
    var nome = cp.codePointAt(0).toString(16);
    if (!(nome in immaginiEmoji)) {
      try {
        var svg = require('fs').readFileSync(require('path').join(__dirname, '..', 'fonts', 'emoji', nome + '.svg'));
        immaginiEmoji[nome] = 'data:image/svg+xml;base64,' + svg.toString('base64');
      } catch (err) { immaginiEmoji[nome] = ''; }
    }
    return immaginiEmoji[nome] ? '<img class="' + (classe || 'lr-avatar-img') + '" alt="' + esc(e) + '" src="' + immaginiEmoji[nome] + '">' : '';
  }
  // il nome di un allievo nei report delle domande aperte e della timeline («🦉 03»): l'emoji in testa come immagine, il resto testo
  function nomeConImmagine(nome) {
    var m = /^(\S+?)(\uFE0F?)(\s.*)$/.exec(String(nome || ''));
    var img = m ? emojiImmagine(m[1], 'mm-rp-emoji') : '';
    return img ? img + esc(m[3]) : esc(nome);
  }

  /* Nel browser (anteprima del docente, PDF delle tessere) il file si carica da
     solo accanto a questo modulo: index.html non va toccato per un report. */
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.MappAIInc_emoji) {
    try {
      var mio = document.currentScript && document.currentScript.src;
      var s = document.createElement('script');
      s.src = (mio ? mio.replace(/[^/]*$/, '') : 'js/') + 'vendor/mappai-emoji-incorpora.js';
      s.async = true;
      (document.head || document.documentElement).appendChild(s);
    } catch (e) { /* le emoji ripiegano su quelle di sistema */ }
  }

  /* Dal packet 0132 questi stili servono solo al foglio delle credenziali (`docShell`), che esce identico a prima;
     i report hanno la veste comune (`reportShell`, sotto). */
  var BASE_STYLES = [
    "*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;box-sizing:border-box}",
    "body{font-family:'Space Mono'," + EMOJI_STACK + ",ui-monospace,monospace;font-size:12px;color:var(--mm-testo, #404040);margin:0 auto;padding:24px 28px;max-width:840px;background:#f8fafc}",
    ".lr-header{text-align:center;padding:24px 16px 18px;background:#fff;border-radius:16px;margin-bottom:22px;border-bottom:3px solid #4f46e5;page-break-after:avoid}",
    ".lr-title{font-size:20px;font-weight:900;color:var(--mm-testo, #404040)}",
    ".lr-sub{font-size:11px;color:#64748b;margin-top:6px;line-height:1.6}",
    ".lr-chips{margin-top:10px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap}",
    ".lr-chip{display:inline-block;background:#eef2ff;color:#4f46e5;border-radius:999px;padding:2px 12px;font-size:10px;font-weight:bold}",
    ".lr-q{background:#fff;border:1px solid var(--mm-bordo, #cbd5e1);border-radius:12px;padding:14px 16px;margin-bottom:12px;page-break-inside:avoid}",
    ".lr-q-head{display:flex;align-items:flex-start;gap:8px;margin-bottom:8px}",
    ".lr-q-n{flex-shrink:0;width:26px;height:26px;border-radius:8px;background:#4f46e5;color:#fff;font-weight:bold;display:flex;align-items:center;justify-content:center;font-size:12px}",
    ".lr-q-text{font-weight:700;color:var(--mm-testo, #404040);line-height:1.4}",
    ".lr-q-meta{font-size:10px;color:var(--mm-testo-3, #64748b);margin-top:2px}",
    ".lr-tag{display:inline-block;background:#f1f5f9;color:#475569;border-radius:6px;padding:1px 7px;font-size:9px;font-weight:bold;margin-left:4px}",
    ".lr-bar{display:flex;height:22px;border-radius:6px;overflow:hidden;border:1px solid var(--mm-bordo, #cbd5e1);margin-top:6px}",
    ".lr-seg{display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;color:#fff;min-width:0}",
    ".lr-seg-r{background:#16a34a}.lr-seg-w{background:#dc2626}.lr-seg-b{background:#94a3b8}.lr-seg-m{background:#7c3aed}",
    ".lr-legend{display:flex;gap:14px;font-size:10px;color:#64748b;margin-top:8px;flex-wrap:wrap}",
    ".lr-dot{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:middle}",
    ".lr-card{background:#fff;border:1px solid var(--mm-bordo, #cbd5e1);border-radius:14px;padding:16px 18px;margin-bottom:14px;page-break-inside:avoid}",
    ".lr-card-head{display:flex;align-items:center;gap:12px;margin-bottom:12px;border-bottom:1px solid #f1f5f9;padding-bottom:10px}",
    ".lr-avatar{font-size:34px;line-height:1}",
    ".lr-who{font-size:16px;font-weight:900;color:var(--mm-testo, #404040)}",
    ".lr-who-sub{font-size:10px;color:var(--mm-testo-3, #64748b);margin-top:2px}",
    ".lr-metrics{margin-left:auto;text-align:right}",
    ".lr-acc{font-size:22px;font-weight:900}",
    ".lr-acc-sub{font-size:9px;color:var(--mm-testo-3, #64748b)}",
    // 0127 (Giacomo, 27/10): la testata dell'allievo — un'icona sola, il numero alla stessa altezza, i dati sulla stessa riga un po' più piccoli
    ".lr-avatar-img{display:block;width:1em;height:1em}",
    ".lr-emoji-img{display:inline-block;width:1em;height:1em;vertical-align:-0.15em}",
    ".lr-testa-allievo .lr-who{font-size:34px;line-height:1}",
    ".lr-testa-allievo .lr-who-sub{font-size:16px;margin:0 0 0 6px}",
    ".lr-testa-allievo .lr-acc,.lr-testa-allievo .lr-acc-sub{font-size:inherit}",
    ".lr-strip{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0}",
    ".lr-pill{width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:#fff}",
    ".lr-pill-r{background:#16a34a}.lr-pill-w{background:#dc2626}.lr-pill-b{background:#cbd5e1;color:#475569}.lr-pill-m{background:#7c3aed}",
    ".lr-detail{margin:8px 0 4px;border-top:1px solid #f1f5f9;padding-top:8px}",
    ".lr-di-row{display:flex;gap:7px;align-items:baseline;padding:4px 0;border-bottom:1px dashed #f1f5f9}",
    ".lr-di-mark{flex:0 0 auto;width:16px;text-align:center;font-weight:bold}",
    ".lr-di-right{color:#16a34a}.lr-di-wrong{color:#dc2626}.lr-di-blank{color:var(--mm-testo-3, #64748b)}.lr-di-manual{color:#7c3aed}",
    ".lr-di-body{flex:1;min-width:0}",
    ".lr-di-q{font-size:11px;color:var(--mm-testo, #404040);line-height:1.5}",
    ".lr-di-your{font-size:11px;color:#475569;margin-top:1px}",
    ".lr-di-correct{font-size:11px;color:#15803d;margin-top:1px}",
    ".lr-topics{display:flex;gap:16px;flex-wrap:wrap;margin-top:8px}",
    ".lr-topic-col{flex:1;min-width:180px}",
    ".lr-topic-h{font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;color:var(--mm-testo-3, #64748b);margin-bottom:4px}",
    ".lr-topic-item{font-size:11px;padding:2px 0}",
    ".lr-good{color:#15803d}.lr-bad{color:#b45309}",
    ".lr-footer{text-align:center;margin-top:28px;font-size:9px;color:var(--mm-testo-3, #64748b);border-top:1px solid #f1f5f9;padding-top:12px}",
    ".cred-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}",
    ".cred{border:2px dashed #c7d2fe;border-radius:14px;padding:14px;text-align:center;page-break-inside:avoid}",
    /* L'emoji È l'identità dell'allievo: deve essere la STESSA figura che vede
       sul telefono (Android/Noto), non quella di sistema. Il font emoji va nello
       stack EFFETTIVO dell'elemento — dichiararlo in una variabile non basta:
       il glifo lo prende il primo font dello stack che ce l'ha, e su macOS
       sarebbe Apple Color Emoji (regola globale del progetto). */
    ".cred-emoji{font-size:40px;line-height:1;font-family:" + EMOJI_STACK + ",sans-serif}",
    ".cred-num{font-size:24px;font-weight:900;color:#4f46e5;margin-top:2px}",
    ".cred-class{font-size:11px;color:#64748b;margin-top:6px}",
    ".cred-name{font-size:10px;color:var(--mm-testo-3, #64748b);margin-top:8px;border-top:1px solid var(--mm-bordo, #cbd5e1);padding-top:6px;min-height:16px}",
    ".no-print{display:block}",
    "@media print{.no-print{display:none !important}body{background:#fff;padding:8px}.cred-grid{grid-template-columns:repeat(3,1fr)}}"
  ].join('');

  /* Il titolo dei report del LIVE (0127, Giacomo 25/10): «[Progetto] · [Materiale] · Report allievi» al docente,
     «… · Report allievo» nella scheda del 💾. Il materiale (genere e angolo) lo compone l'app quando la sessione
     nasce; una sessione nata prima non ce l'ha e porta l'attività. */
  function titoloLive(meta, coda) {
    var m = meta || {};
    return [m.mapTitle, m.materiale || m.activity, coda]
      .map(function (x) { return String(x == null ? '' : x).trim(); }).filter(Boolean).join(' · ');
  }

  /* ⚠️ Sull'iPad `vestiReport` (reader, 0126) nasconde questa barra trovandoci il bottone di stampa e mette il
     suo titolo nella barra della ×: il bottone resta dentro `.no-print`, o il titolo esce due volte. */
  function printBar(testo) {
    return '<div class="no-print" style="position:fixed;top:0;left:0;right:0;background:#fff;border-bottom:1px solid var(--mm-bordo, #cbd5e1);padding:10px 24px;display:flex;align-items:center;justify-content:space-between;z-index:100;font-family:monospace;font-size:12px">' +
      '<span style="font-weight:bold;color:#4f46e5">' + esc(testo) + '</span>' +
      '<div style="display:flex;gap:8px">' +
      '<button onclick="window.print()" style="background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:6px 16px;cursor:pointer;font-size:11px;font-weight:bold">Stampa / PDF</button>' +
      '<button onclick="window.close()" style="background:#f1f5f9;color:#475569;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px">Chiudi</button>' +
      '</div></div><div style="height:52px" class="no-print"></div>';
  }

  /* opts.perPdf: il foglio nasce già come PDF (stampa headless), quindi niente
     barra dei comandi — in un PDF non si clicca.
     ⚠️ I FONT restano anche nel PDF: le emoji delle tessere sono l'identità con
     cui l'allievo entra, e devono essere le stesse che vede sul telefono
     (Noto/Android). Senza il font il PDF le stamperebbe in stile Apple: per
     questo i byte sono incorporati (EMOJI_STACK, sopra), non chiesti alla rete.
     `html-to-pdf` attende `document.fonts.ready` prima di stampare. */
  /* `title` = il <title>, che in Electron dà il nome al PDF. 0128, allargamento 23 (Giacomo, 27/10, nella chat ADMIN: «Lo corregga lo
     0128 come allargamento: allarga il perimetro dello 0128 al titolo dei report LIVE in mappai-live-reports.js.»; il nome «Come la
     barra»): i report del Live lo prendono da `titoloLive`, come la barra — prima «<mappa> — domande» e il PDF si chiamava così */
  function docShell(title, barra, bodyHtml, opts) {
    var perPdf = !!(opts && opts.perPdf);
    return '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(title) + '</title>' +
      '<style>' + emojiIncorporate() + BASE_STYLES + '</style></head><body>' +
      (perPdf ? '' : printBar(barra)) + bodyHtml +
      '<div class="lr-footer">MappAI Live · generato il ' + esc(nowStr()) + '</div>' +
      '</body></html>';
  }

  function nowStr() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // meta = { mapTitle, activity, className, dateStr, durationStr }
  function headerBlock(meta, subtitleExtra) {
    var m = meta || {};
    var sub = [m.activity, m.className, m.dateStr, m.durationStr].filter(Boolean).map(esc).join(' · ');
    return '<div class="lr-header"><div class="lr-title">' + esc(m.mapTitle || 'MappAI Live') + '</div>' +
      '<div class="lr-sub">' + sub + (subtitleExtra ? '<br>' + subtitleExtra : '') + '</div></div>';
  }

  // ── LA VESTE COMUNE DEI REPORT (packet 0132) ─────────────────────────────
  /* Giacomo, 27/10: «Il foglio delle aperte ma con un corpo del titolo di 3pt più grandi»; «accetto tutte le proposte
     grafiche della versione 0132». Le misure e le classi `mm-rp-*` stanno in MappAIDocHead (`stileReport`, `REPORT`):
     qui solo che cosa va dove. Il foglio delle credenziali NON è un report e resta su `docShell`. */
  function _DH() {
    if (typeof window !== 'undefined' && window.MappAIDocHead) return window.MappAIDocHead;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      try { return require('./mappai-doc-head.js'); } catch (e) { return null; }
    }
    return null;
  }

  /* SPACE MONO DENTRO IL FILE, quando lo scrive il server (Node). Il report si apre nel pannello LIVE, ma anche da
     INSEGNA nel browser di sistema (`shell.openPath`) e su un Mac senza Space Mono installato: senza i byte cadeva sul
     monospazio di sistema. Il file dei byte è generato (tools/font/prepara-font.py) e parla solo a `window`: lo si legge
     in un contesto suo, senza toccarlo. Nel browser ci pensa chi scrive il file (l'iPad: `reportLeggibile`). */
  var spaceMono = null;
  function spaceMonoIncorporato() {
    if (spaceMono !== null) return spaceMono;
    spaceMono = '';
    if (typeof window !== 'undefined' || typeof require !== 'function' || typeof __dirname === 'undefined') return spaceMono;
    try {
      var finta = {};
      require('vm').runInNewContext(require('fs').readFileSync(require('path').join(__dirname, 'vendor', 'space-mono-incorpora.js'), 'utf8'), { window: finta });
      spaceMono = finta.MappAIInc_space_mono ? finta.MappAIInc_space_mono.facce('Space Mono') : '';
    } catch (e) { spaceMono = ''; }
    return spaceMono;
  }
  // i caratteri di un report: le emoji sempre (0108), Space Mono quando scrive il server. Li usa anche il Tutor.
  function caratteriReport() { return emojiIncorporate() + '\n' + spaceMonoIncorporato(); }

  /* L'accento per genere, quello dei fogli: scelta multipla e Live indaco, domande aperte teal, flashcard smeraldo scuro
     (lo #059669 del foglio delle flashcard sul bianco fa 3,77:1: come testo serve #047857, 5,48:1) */
  var VESTI = {
    quiz: { accento: '#4f46e5', fondo: '#eef2ff' },
    /* le aperte: il verde acqua del genere su titoli e schede; il filo dei riquadri delle risposte e le barre col verde dei
       report (MappAIDocHead.REPORT.verde; Giacomo, gate del 28/10: «alle linee verticali dei campi della risposta e a tutti i
       quadratini o le barre che usano il verde applica il verde chiaro») */
    aperte: { accento: '#0f766e', fondo: '#f0fdf4', filo: '#16a34a' },
    flash: { accento: '#047857', fondo: '#ecfdf5' }
  };
  function vesteDi(meta, results) {
    var r = results || {}, m = meta || {};
    if ((r.perStudent || []).some(function (s) { return s && s.flashcard; })) return VESTI.flash;
    if (r.mode === 'scelta' || /aperte/i.test(m.materiale || '')) return VESTI.aperte;
    return VESTI.quiz;
  }

  /* `titolo` è anche il <title>, che in Electron dà il nome al PDF (0128, allargamento 23: «Come la barra») */
  function reportShell(titolo, bodyHtml, veste) {
    var H = _DH(), v = veste || VESTI.quiz;
    var css = H ? H.stile({ accento: v.accento, report: true, brand: 'MappAI Live' }) + '\n' +
      H.stileReport({ accento: v.accento, fondoAccento: v.fondo, filoRisposta: v.filo }) : '';
    return '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(titolo) + '</title>' +
      '<style>' + caratteriReport() + '\n' + css + '</style></head><body>' +
      printBar(titolo) + '<main>' + bodyHtml + '</main>' +
      (H ? H.pieSchermo({ brand: 'MappAI Live · generato il ' + esc(nowStr()), data: false }) : '') +
      '</body></html>';
  }
  // meta = { mapTitle, materiale, activity, className, dateStr, durationStr }
  function testataReport(meta, coda, badge) {
    var H = _DH(), m = meta || {};
    var titolo = titoloLive(m, coda);
    if (!H) return '<h1>' + esc(titolo) + '</h1>';
    return H.testata({ titolo: titolo, tipo: m.durationStr || '', data: m.dateStr || false, classe: m.className || '', badge: badge || '' });
  }

  function chip(t) { return '<span class="mm-rp-chip">' + esc(t) + '</span>'; }
  function riquadro(esito, etichetta, testoHtml) {
    return '<div class="mm-rp-ris' + (esito ? ' mm-rp-ris--' + esito : '') + '">' +
      (etichetta ? '<span class="mm-rp-et">' + esc(etichetta) + '</span>' : '') + testoHtml + '</div>';
  }
  var DA_ESITO = { right: 'ok', wrong: 'ko', blank: 'vuota', manual: 'mano' };
  /* g = { fc, aperte }. 0128, allargamento 13: un mazzo di flashcard dice la scelta della carta a parole (niente emoji,
     che nella stampa dell'iPad non sono garantite). 0116: le aperte semplici non hanno correzione, e una risposta
     scritta si segna ● — mai ✎, che nessuno dei caratteri dell'app ha (l'anteprima di stampa dell'iPhone usciva bianca). */
  var ESITI = {
    quiz: { right: '✓ Corretta', wrong: '✗ Errata', blank: '· In bianco', manual: '● Da correggere' },
    fc: { right: '✓ Sapevo e ricordavo', wrong: '✗ Non conoscevo', manual: '? Non ricordavo', blank: '· Saltata' },
    aperte: { right: '✓ Corretta', wrong: '✗ Errata', blank: '· In bianco', manual: '' }
  };
  function esitoChip(outcome, g) {
    var et = ESITI[g.fc ? 'fc' : g.aperte ? 'aperte' : 'quiz'][outcome];
    if (et == null) et = ESITI.quiz.blank;
    return et ? '<span class="mm-rp-esito mm-rp-esito--' + (DA_ESITO[outcome] || 'vuota') + '">' + et + '</span>' : '';
  }
  /* UNA DOMANDA, come nel foglio delle aperte: occhiello «DOMANDA n» coi chip, la domanda, la risposta nel riquadro.
     `compatta`: dentro la scheda di un allievo (report di classe, D2), separata dalle altre da un filo.
     g.allievo: la scheda che l'allievo tiene (💾, iPad). 0127, gate del 27/10 (Giacomo): nel report del DOCENTE una domanda
     senza risposta dice solo «VUOTO», senza la correzione; la scheda dell'allievo no («Report del docente»): «— vuoto»
     e la risposta corretta. */
  function voceDomanda(it, i, g, compatta) {
    var vuota = it.outcome === 'blank' && !g.allievo;
    var chips = esitoChip(it.outcome, g) + ((it.label && !it.text) ? chip(it.label) : '');
    var tua = it.yourText ? esc(it.yourText) : (g.allievo ? '— vuoto' : '<b>VUOTO</b>');
    var out = '<div class="mm-rp-occ"><span>' + (g.fc ? 'Carta ' : 'Domanda ') + (i + 1) + '</span>' + chips + '</div>' +
      '<h3 class="mm-rp-dom">' + esc(it.text || it.label || '') + '</h3>' +
      riquadro(DA_ESITO[it.outcome] || '', g.fc ? 'La tua scelta' : 'Risposta', tua);
    if (it.outcome !== 'right' && !vuota && it.correctText) out += riquadro('ok', g.fc ? 'Risposta' : 'Risposta corretta', esc(it.correctText));
    if (it.missing && it.missing.length) out += riquadro('mano', 'Manca (½ punto)', esc(it.missing.join(', ')));
    if (it.explanation) out += '<div class="mm-rp-spieg">' + esc(it.explanation) + '</div>';
    return compatta ? '<div class="mm-rp-voce">' + out + '</div>' : '<section class="mm-rp-card">' + out + '</section>';
  }

  /* IL RIEPILOGO DI UN ALLIEVO. 0127 (Giacomo, 27/10): «basta un riferimento solo» — l'emoji, il numero alla stessa
     altezza (col soprannome, se c'è) e sulla stessa riga la percentuale e i dati; poi i quadratini delle domande.
     o.minimal: la scheda dell'allievo (💾, iPad) — senza fluenza, che è una misura per il docente. */
  function riepilogo(s, r, o) {
    o = o || {};
    var g = { fc: !!s.flashcard, aperte: !!s.soloAperte };
    var segni = { right: '✓', wrong: '✗', blank: '·', manual: g.aperte ? '●' : '?' };
    var colore = s.accuracyPct >= 80 ? '#16a34a' : s.accuracyPct >= 50 ? '#d97706' : '#dc2626';
    var soprannome = s.displayName && s.displayName !== (String(s.emoji || '') + ' ' + String(s.num || '')).trim() ? s.displayName : '';
    var chi = [esc(s.num), esc(soprannome)].filter(Boolean).join(' · ') || esc(s.displayName);
    var img = s.emoji ? (emojiImmagine(s.emoji, 'mm-rp-emoji') || esc(s.emoji)) : '';
    var dati = [(g.fc ? 'carte ' : 'risposte ') + s.answered + '/' + (r.questionCount || (s.items || []).length)];
    if (s.blankCount) dati.push(s.blankCount + ' in bianco');
    if (s.manualCount && !g.aperte && !g.fc) dati.push(s.manualCount + ' da correggere');
    if (s.hintsUsed) dati.push('💡 ' + s.hintsUsed + ' indizi');
    if (!g.aperte && !o.minimal) dati.push('fluenza ' + (s.medianRate != null ? s.medianRate.toFixed(1) + '/min' : '—'));
    var strip = (s.items || []).map(function (it, i) {
      return '<div class="mm-rp-pill mm-rp-pill--' + (DA_ESITO[it.outcome] || 'vuota') + '" title="' + (g.fc ? 'Carta ' : 'Domanda ') + (i + 1) + '">' +
        (segni[it.outcome] || '·') + '</div>';
    }).join('');
    return '<div class="mm-rp-riep"><div class="mm-rp-occ"><span>' + esc(o.occhiello || 'Allievo') + '</span></div>' +
      '<div class="mm-rp-riga"><span class="mm-rp-chi">' + (img ? img + ' ' : '') + chi + '</span>' +
      (g.aperte ? '' : '<span class="mm-rp-num" style="color:' + colore + '">' + s.accuracyPct + '%</span>') +
      '<span class="mm-rp-testo">' + (g.aperte ? '' : (g.fc ? 'sapevo e ricordavo' : 'accuratezza') + ' · ') + dati.join(' · ') + '</span></div>' +
      '<div class="mm-rp-strip">' + strip + '</div></div>';
  }
  // la scheda di UN allievo (D3: l'iPad; il 💾 del telefono): il riepilogo e una scheda per domanda
  function schedaAllievo(s, r, o) {
    var g = { fc: !!s.flashcard, aperte: !!s.soloAperte, allievo: true };
    return '<section class="mm-rp-card">' + riepilogo(s, r, o) + '</section>' +
      '<h2 class="mm-rp-sez">' + (g.fc ? 'Le carte' : 'Le domande') + '</h2>' +
      (s.items || []).map(function (it, i) { return voceDomanda(it, i, g, false); }).join('');
  }
  // la scheda di un allievo nel report di CLASSE (D2): le stesse parti in una scheda sola, coi punti di forza e deboli
  function studentCardHtml(s, r) {
    var g = { fc: !!s.flashcard, aperte: !!s.soloAperte };
    var lista = function (v) { return (v || []).length ? v.map(esc).join(' · ') : '—'; };
    return '<section class="mm-rp-card mm-rp-card--lunga">' + riepilogo(s, r) +
      (s.items || []).map(function (it, i) { return voceDomanda(it, i, g, true); }).join('') +
      '<div class="mm-rp-voce"><div class="mm-rp-occ"><span>Punti di forza</span></div><div class="mm-rp-testo">' + lista(s.strengths) + '</div>' +
      '<div class="mm-rp-occ" style="margin-top:10px"><span>Punti deboli</span></div><div class="mm-rp-testo">' + lista(s.weaknesses) + '</div></div>' +
      '</section>';
  }

  // ── Report A: una scheda per domanda, la barra di giuste/sbagliate/bianco ──
  function buildQuestionsReportHtml(meta, results) {
    var r = results || {};
    var badge = (r.joined || 0) + ' partecipanti' + (r.absent ? ' · ' + r.absent + ' assenti' : '');
    var body = testataReport(meta, 'Report domande', badge) +
      '<h2 class="mm-rp-sez">Le domande</h2>' +
      '<div class="mm-rp-leg"><span><span class="mm-rp-dot mm-rp-dot--ok"></span>Giuste</span>' +
      '<span><span class="mm-rp-dot mm-rp-dot--ko"></span>Sbagliate</span>' +
      '<span><span class="mm-rp-dot mm-rp-dot--vuota"></span>In bianco</span>' +
      '<span><span class="mm-rp-dot mm-rp-dot--mano"></span>Da correggere a mano</span></div>';

    // Timeline (008): se le domande hanno un anno (tlYear), ordinale
    // cronologicamente → la heatmap diventa la heatmap della timeline.
    var pq = (r.perQuestion || []);
    if (pq.length && pq.every(function (q) { return q.tlYear != null; })) {
      pq = pq.slice().sort(function (a, b) { return a.tlYear - b.tlYear; });
    }
    pq.forEach(function (q, i) {
      var seg = function (k, count, p) {
        if (!count) return '';
        return '<div class="mm-rp-seg mm-rp-seg--' + k + '" style="flex:' + count + '" title="' + count + '">' + (p >= 12 ? count : '') + '</div>';
      };
      var chips = [];
      if (q.l1Label) chips.push(chip(q.l1Label));
      if (q.source === 'custom') chips.push(chip('personalizzata'));
      if (q.hintCount) chips.push(chip('💡 ' + q.hintCount));
      body += '<section class="mm-rp-card"><div class="mm-rp-occ"><span>Domanda ' + (i + 1) + '</span>' + chips.join('') + '</div>' +
        '<h3 class="mm-rp-dom">' + esc(q.text || '') + '</h3>' +
        ((q.kind === 'tf' && q.proposed) ? riquadro('', 'Affermazione', esc(q.proposed)) : '') +
        '<div class="mm-rp-bar">' + seg('ok', q.right, q.pctRight) + seg('ko', q.wrong, q.pctWrong) +
        seg('vuota', q.blank, q.pctBlank) + seg('mano', q.manual, q.pctManual) + '</div>' +
        '<div class="mm-rp-tenue" style="margin-top:6px">Giuste ' + q.right + ' (' + q.pctRight + '%) · Sbagliate ' + q.wrong + ' (' + q.pctWrong + '%) · ' +
        'Bianco ' + q.blank + ' (' + q.pctBlank + '%)' + (q.manual ? ' · A mano ' + q.manual + ' (' + q.pctManual + '%)' : '') + '</div></section>';
    });
    return reportShell(titoloLive(meta, 'Report domande'), body, VESTI.quiz);
  }

  // ── Report B: una scheda per allievo (D2) ───────────────────────────────
  /* opts.unAllievo (D3, l'iPad): con un allievo solo, la sua scheda intera come il 💾 del telefono — «… · Report allievo»,
     il riepilogo, una scheda per domanda. Con più allievi il report di classe, come sempre. */
  function buildStudentsReportHtml(meta, results, opts) {
    var r = results || {}, v = vesteDi(meta, r);
    var lista = (r.perStudent || []).slice().sort(function (a, b) { return b.accuracyPct - a.accuracyPct; });
    if (opts && opts.unAllievo && lista.length === 1) {
      return reportShell(titoloLive(meta, 'Report allievo'),
        testataReport(meta, 'Report allievo') + schedaAllievo(lista[0], r, { occhiello: 'Riepilogo', minimal: true }), v);
    }
    var body = testataReport(meta, 'Report allievi', (r.joined || 0) + ' allievi') + '<h2 class="mm-rp-sez">Schede individuali</h2>';
    lista.forEach(function (s) { body += studentCardHtml(s, r); });
    if (!lista.length) body += '<section class="mm-rp-card"><div class="mm-rp-testo">Nessun allievo ha partecipato.</div></section>';
    return reportShell(titoloLive(meta, 'Report allievi'), body, v);
  }

  // ── Foglio credenziali stampabile ───────────────────────────────────────
  // klass = { name, year, students:[{emoji, emojiKey, num, name}] }
  function buildCredentialCardsHtml(klass, opts) {
    var k = klass || {};
    var meta = { mapTitle: 'Credenziali classe', className: k.name, dateStr: k.year };
    var body = headerBlock(meta, 'Ogni allievo entra con: nome classe + emoji + numero');
    body += '<div class="cred-grid">';
    (k.students || []).forEach(function (s) {
      body += '<div class="cred"><div class="cred-emoji">' + esc(s.emoji) + '</div>' +
        '<div class="cred-num">' + esc(s.num) + '</div>' +
        '<div class="cred-class">' + esc(k.name || '') + '</div>' +
        '<div class="cred-name">' + (s.name ? esc(s.name) : 'Nome: ____________') + '</div></div>';
    });
    body += '</div>';
    return docShell('Credenziali — ' + (k.name || 'classe'), 'MappAI Live · Credenziali', body, opts);
  }

  // ── Timeline Costruisci (008): report proposte + timeline finale di classe ──
  // results = { byAuthor:{id:{displayName,proposals:[{anno,evento,contesto,status,flags}]}},
  //             approved:[...], counts:{total,approved,rejected,pending}, joined }
  function buildTimelineWorkshopReportHtml(meta, results) {
    var r = results || {}, c = r.counts || {};
    var badge = (c.total || 0) + ' proposte · ' + (c.approved || 0) + ' approvate · ' + (c.rejected || 0) + ' bocciate · ' + (c.pending || 0) + ' in attesa';
    var body = testataReport(meta, 'Report costruzione', badge);

    // Timeline finale di classe (solo approvate, cronologiche)
    var approved = (r.approved || []).slice().sort(function (a, b) { return a.anno - b.anno; });
    body += '<h2 class="mm-rp-sez">Timeline finale della classe</h2><section class="mm-rp-card mm-rp-card--lunga">';
    if (!approved.length) body += '<div class="mm-rp-testo">Nessuna proposta approvata.</div>';
    approved.forEach(function (p) {
      body += '<div class="mm-rp-fila"><span class="mm-rp-anno">' + esc(p.anno) + '</span><div><b>' + esc(p.evento) + '</b>' +
        (p.contesto ? '<div class="mm-rp-testo">' + esc(p.contesto) + '</div>' : '') + '</div></div>';
    });
    body += '</section>';

    // Proposte per allievo
    body += '<h2 class="mm-rp-sez">Le proposte di ogni allievo</h2>';
    var stato = { approved: ['ok', '✓ approvata'], rejected: ['ko', '✗ bocciata'], pending: ['mano', '· in attesa'] };
    Object.keys(r.byAuthor || {}).forEach(function (id) {
      var a = r.byAuthor[id];
      body += '<section class="mm-rp-card mm-rp-card--lunga"><div class="mm-rp-occ"><span>Allievo</span>' + chip((a.proposals || []).length + ' proposte') + '</div>' +
        '<div class="mm-rp-chi" style="margin-bottom:8px">' + nomeConImmagine(a.displayName || id) + '</div>';
      if (!(a.proposals || []).length) body += '<div class="mm-rp-testo">—</div>';
      (a.proposals || []).forEach(function (p) {
        var s = stato[p.status] || stato.pending, flags = [];
        if (p.flags && p.flags.duplicate) flags.push(chip('duplicato'));
        if (p.flags && p.flags.yearNotInSources) flags.push(chip('anno non nelle fonti'));
        body += '<div class="mm-rp-fila"><span class="mm-rp-anno">' + esc(p.anno) + '</span><div style="flex:1"><b>' + esc(p.evento) + '</b> ' + flags.join(' ') +
          '</div><span class="mm-rp-esito mm-rp-esito--' + s[0] + '" style="font-size:11px">' + s[1] + '</span></div>';
      });
      body += '</section>';
    });

    return reportShell(titoloLive(meta, 'Report costruzione'), body, VESTI.quiz);
  }


  /* ── Report «Domande a scelta» ───────────────────────────────────────────
     Non è un voto: è il ritratto di come uno studente RICONOSCE i richiami.
     Per la classe due righe che valgono più delle risposte — quali tagli non
     accendono nessuno e su quali aree nessuno si sente sicuro: sono domande
     per il docente, non giudizi sugli allievi. */
  var ET_ANGOLO = {
    definizione: 'Definizione', causa: 'Causa', conseguenza: 'Conseguenza',
    esempio: 'Esempio', confronto: 'Confronto', eccezione: 'Eccezione',
    applicazione: 'Applicazione', auto: 'Misto', '': 'Taglio non noto'
  };
  var ET_CHIP = {
    subito: 'mi viene in mente subito', partenza: 'so da dove partire',
    vago: 'mi dice qualcosa, ma vago', niente: 'non mi accende niente'
  };
  function etAng(a) { return ET_ANGOLO[a || ''] || String(a); }

  function barra(quota, colore) {
    var w = Math.max(0, Math.min(100, Math.round((quota || 0) * 100)));
    return '<span style="display:inline-block;width:120px;height:12px;border-radius:999px;background:#f1f5f9;vertical-align:middle;overflow:hidden;flex:0 0 120px">' +
      '<span style="display:block;height:100%;width:' + w + '%;background:' + colore + '"></span></span>';
  }
  function filaBarra(etichetta, quota, colore, dopo) {
    return '<div class="mm-rp-fila" style="align-items:center"><span style="flex:0 0 16ch;font-weight:700">' + esc(etichetta) + '</span>' +
      barra(quota, colore) + '<span class="mm-rp-tenue" style="font-size:13px">' + dopo + '</span></div>';
  }

  function buildSceltaReportHtml(meta, results) {
    var r = results || {}, v = VESTI.aperte;
    var body = testataReport(meta, 'Report domande', (r.joined || 0) + ' allievi · ' + (r.consegnato || 0) + ' consegne');

    /* 0116: in modalità semplice l'allievo non sceglie niente — tutte le domande
       sono sue — quindi tagli evitati e aree scelte sarebbero zeri dappertutto */
    if (!r.semplice) {
      body += '<h2 class="mm-rp-sez">La classe</h2><section class="mm-rp-card"><div class="mm-rp-occ"><span>I tagli — chi li ha evitati del tutto</span></div>';
      var ang = Array.isArray(r.angoli) ? r.angoli : [];
      if (!ang.length) body += '<div class="mm-rp-testo">Nessun dato.</div>';
      ang.forEach(function (a) {
        body += filaBarra(etAng(a.angle), a.allievi ? (a.evitatoDa / a.allievi) : 0, '#b45309',
          'evitato da ' + (a.evitatoDa || 0) + '/' + (a.allievi || 0) + ' · scelte totali ' + (a.scelteTotali || 0));
      });
      body += '</section><section class="mm-rp-card"><div class="mm-rp-occ"><span>Le aree — dove la classe non si sente sicura</span></div>';
      var ar = Array.isArray(r.aree) ? r.aree : [];
      if (!ar.length) body += '<div class="mm-rp-testo">I fogli non dichiarano la macro-area.</div>';
      ar.forEach(function (a) {
        var tot = (a.sceltaDa || 0) + (a.evitataDa || 0);
        body += filaBarra(a.ramo, tot ? (a.sceltaDa / tot) : 0, v.filo, 'scelta da ' + (a.sceltaDa || 0) + '/' + tot);
      });
      body += '</section>';
    }

    // ── una scheda per allievo (D2) ──
    body += '<h2 class="mm-rp-sez">Gli allievi</h2>';
    (Array.isArray(r.byStudent) ? r.byStudent : []).forEach(function (a) {
      var n = (a.profilo && a.profilo.conteggio) || {};
      /* ⚠️ I due generi si contano SEPARATI: la scelta multipla si corregge da
         sé, la domanda aperta no. Una percentuale sola mescolerebbe una misura
         di conoscenza e una di lavoro svolto. */
      var mc = (a.risposte || []).filter(function (q) { return q.corretta !== null && q.corretta !== undefined; });
      var giuste = mc.filter(function (q) { return q.corretta === true; }).length;
      var scritte = (a.risposte || []).length - mc.length;
      body += '<section class="mm-rp-card mm-rp-card--lunga"><div class="mm-rp-riep"><div class="mm-rp-occ"><span>Allievo</span>' + chip(a.consegnato ? 'consegnato' : 'non consegnato') +
        (a.aree && a.aree.length ? chip('aree: ' + a.aree.join(', ')) : '') + '</div>' +
        '<div class="mm-rp-riga"><span class="mm-rp-chi">' + nomeConImmagine(a.displayName || a.id) + '</span>' +
        (mc.length
          ? '<span class="mm-rp-num" style="color:' + v.accento + '">' + giuste + '/' + mc.length + '</span><span class="mm-rp-testo">a scelta multipla' +
            (scritte ? ' · ' + scritte + ' scritte' : '') + ' · ' + (n.lette || 0) + ' lette</span>'
          : '<span class="mm-rp-num" style="color:' + v.accento + '">' + (n.scritte || 0) + '</span><span class="mm-rp-testo">risposte scritte · ' + (n.lette || 0) + ' lette</span>') +
        '</div></div>';

      var righe = ((a.profilo && a.profilo.righe) || []).filter(function (x) { return x.totale; });
      if (righe.length) {
        body += '<div class="mm-rp-voce">';
        righe.forEach(function (x) {
          body += filaBarra(etAng(x.angle), x.scelte / x.totale, v.filo, 'scelte ' + x.scelte + '/' + x.totale + (x.spenti ? ' · spente ' + x.spenti : ''));
        });
        body += '</div>';
      }

      if (!(a.risposte || []).length) body += '<div class="mm-rp-voce mm-rp-testo">Nessuna risposta.</div>';
      (a.risposte || []).forEach(function (q, i) {
        var chips = (q.corretta != null ? esitoChip(q.corretta ? 'right' : 'wrong', {}) : '') + chip(etAng(q.angle)) +
          (q.chip ? chip(ET_CHIP[q.chip] || q.chip) : '');
        body += '<div class="mm-rp-voce"><div class="mm-rp-occ"><span>Domanda ' + (i + 1) + '</span>' + chips + '</div>' +
          '<h3 class="mm-rp-dom">' + esc(q.testo) + '</h3>' +
          riquadro(q.corretta === false ? 'ko' : q.corretta === true ? 'ok' : '', 'Risposta', esc(q.risposta || '—')) +
          (q.corretta === false && q.giusta ? riquadro('ok', 'Risposta corretta', esc(q.giusta)) : '') + '</div>';
      });

      if ((a.spenti || []).length) {
        body += '<div class="mm-rp-voce"><div class="mm-rp-occ"><span>Richiami che non hanno acceso niente</span></div>' +
          a.spenti.map(function (x) { return '<div class="mm-rp-testo">' + esc(x.testo) + ' ' + chip(etAng(x.angle)) + '</div>'; }).join('') + '</div>';
      }
      if (a.evitata && (a.evitata.why || a.evitata.testo)) {
        body += '<div class="mm-rp-voce"><div class="mm-rp-occ"><span>Perché questa no</span>' + (a.evitata.angle ? chip(etAng(a.evitata.angle)) : '') + '</div>' +
          '<h3 class="mm-rp-dom">' + esc(a.evitata.testo) + '</h3>' + riquadro('', '', esc(a.evitata.why || '—')) + '</div>';
      }
      if (a.note) body += '<div class="mm-rp-voce"><div class="mm-rp-occ"><span>Osservazioni</span></div>' + riquadro('', '', esc(a.note)) + '</div>';
      body += '</section>';
    });

    // la barra prende il nome del bottone che apre il report nel pannello di gestione (0127, Giacomo 26/10)
    return reportShell(titoloLive(meta, 'Report domande'), body, v);
  }

  // ── La scheda che l'ALLIEVO salva dal telefono (packet 0112) ───────────────
  // Stesso disegno della card del report del docente (intestazione, quadratini,
  // righe D1…), senza fluenza né punti di forza e deboli. Il nome del file è
  // «CLASSE APE_10 nome-del-quiz GG-MM-AAAA».
  // Il nome (Giacomo, 20/10): «[classe] [nome emoji] [numero] [tipo e nome dei quiz]», per esempio
  // «2A Coccinella 08 Quiz 1a Guerra Mondiale». Senza data né estensione: l'estensione la mette il telefono.
  function studentSheetName(m) {
    m = m || {};
    function pulito(t) { return String(t == null ? '' : t).replace(/[\\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim(); }
    return [pulito(m.className), pulito(m.emojiLabel), pulito(m.num), pulito(m.activity), pulito(m.title)].filter(Boolean).join(' ');
  }

  // il carattere della pagina (il docente lo sceglie in MappAI; sul telefono arriva come --live-font), Space Mono se non c'è
  var STUDENT_SHEET_FONT = ".lr-root{font-family:var(--live-font,'Space Mono'),var(--emoji,'MappAI Emoji'),ui-monospace,monospace}";
  // student = { emoji, num, displayName, accuracyPct, answered, blankCount, manualCount, hintsUsed, items }
  // opts = { emojiLabel, date }. Restituisce i pezzi: la pagina del telefono li mette in una radice
  // propria (shadow DOM) e stampa SOLO quella; `css` non ha regole su `body`.
  function studentSheetParts(meta, student, opts) {
    opts = opts || {};
    var m = meta || {}, s = student || {}, H = _DH(), v = vesteDi(m, { perStudent: [s] });
    var items = s.items || [];
    var title = studentSheetName({ className: m.className, emojiLabel: s.emojiLabel, num: s.num, activity: m.activity, title: m.mapTitle });
    // 0127 (Giacomo, 26/10: «Al posto del titolo»): il titolo grande è «[progetto] · [materiale] · Report allievo»,
    // sotto classe e data — l'attività sta già nel titolo. 0132: la stessa scheda di un allievo dell'iPad (D3)
    var body = testataReport({ mapTitle: m.mapTitle, materiale: m.materiale, activity: m.activity, className: m.className, dateStr: m.dateStr }, 'Report allievo') +
      schedaAllievo(s, { questionCount: items.length }, { minimal: true, occhiello: 'Riepilogo' }) +
      (H ? H.pieSchermo({ brand: 'MappAI Live · generato il ' + esc(nowStr()), data: false }) : '');
    // senza @page: il telefono stampa la sua radice. Le regole del corpo vanno sulla radice, che un <body> suo non ha
    var css = H ? H.stile({ accento: v.accento, report: true, pagina: false }) + '\n' + H.stileReport({ accento: v.accento, fondoAccento: v.fondo, filoRisposta: v.filo }) : '';
    return { title: title, css: css.replace(/(^|[}\s])body\{/g, '$1.lr-root{') + STUDENT_SHEET_FONT, body: body };
  }

  // La scheda come PAGINA INTERA (la serve il server LAN: /api/my-sheet). Il titolo È il nome del file.
  // opts: { date, extraCss (le @font-face e le variabili del carattere), autoPrint (apre la stampa da sola) }
  function buildStudentSheetHtml(meta, student, opts) {
    opts = opts || {};
    var p = studentSheetParts(meta, student, opts);
    var vars = ":root{--emoji:'MappAI Emoji','Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif}";
    var stampa = opts.autoPrint
      ? '<script>window.addEventListener("load",function(){var f=(document.fonts&&document.fonts.ready)||Promise.resolve();' +
        'f.then(function(){setTimeout(function(){window.print()},900)})})</script>'
      : '';
    return '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(p.title) + '</title>' +
      // le emoji di identità sul telefono: immagini, non testo (iOS disegna male il font delle emoji: packet 0099)
      (opts.emojiProva ? '<script src="/public/js/mappai-emoji-prova.js?v=0108" defer></script>' : '') +
      '<style>' + emojiIncorporate() + vars + (opts.extraCss || '') + '\n' + p.css + '</style></head><body class="lr-root">' +
      p.body + stampa + '</body></html>';
  }

  var REPORTS = {
    escapeHtml: esc,
    titoloLive: titoloLive,
    buildQuestionsReportHtml: buildQuestionsReportHtml,
    buildStudentsReportHtml: buildStudentsReportHtml,
    buildCredentialCardsHtml: buildCredentialCardsHtml,
    buildTimelineWorkshopReportHtml: buildTimelineWorkshopReportHtml,
    buildSceltaReportHtml: buildSceltaReportHtml,
    studentSheetName: studentSheetName,
    studentSheetParts: studentSheetParts,
    buildStudentSheetHtml: buildStudentSheetHtml,
    /* 0132 (Giacomo, 27/10): il report del Tutor prende da qui la stessa barra, la stessa identità e gli stessi caratteri */
    barraReport: printBar,
    emojiImmagine: emojiImmagine,
    caratteriReport: caratteriReport
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = REPORTS;
  if (typeof window === 'undefined') return;
  window.MappAILiveReports = REPORTS;
  console.log('[MappAILiveReports] generatori report MappAI Live caricati');
})();
