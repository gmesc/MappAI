/*
 * mappai-dungeon-core.js — logica PURA del Memory Dungeon (testabile in Node)
 * ---------------------------------------------------------------------------
 * Nessun accesso a DOM/localStorage/appState: solo funzioni deterministiche
 * usate da mappai-games.js per il loop di apprendimento robusto:
 *  - capEvents      → cap dell'event-log unificato (telemetria ECD, c20/c21)
 *  - strHash        → hash contenuto per invalidare la cache quiz (desc cambiata)
 *  - validQuizItem  → validazione item quiz AI (indispensabile per il tier locale 4B)
 *  - zpdFormat      → difficoltà domanda adattiva per mastery (ZPD/fading, c10)
 *  - stratifiedPick → campionatore boss per macro-area (copertura, no blind spot)
 *  - pickTier       → scelta del tier AI: cloud → locale → deterministico
 *
 * Modulo UMD (pattern di mappai-mastery.js): module.exports per `node --test`,
 * window.MappAIDungeonCore per il browser. Caricare in index.html PRIMA di
 * mappai-games.js. mappai-games.js ha fallback inline se il file manca.
 */
(function () {
  'use strict';

  // ── Event-log: cap append-only. Oltre max → butta il 25% più vecchio (le voci sono in ordine di inserimento).
  function capEvents(arr, max) {
    if (!Array.isArray(arr)) return [];
    var m = (max > 0) ? max : 2000;
    if (arr.length <= m) return arr;
    return arr.slice(arr.length - Math.floor(m * 0.75));
  }

  // ── Hash contenuto (imul, stesso schema di _mapSig in games.js) → base36. '' per input vuoto.
  function strHash(s) {
    s = String(s || '');
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function _wc(s) { s = String(s || '').trim(); return s ? s.split(/\s+/).length : 0; }
  function _norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  // ── Validazione item quiz {stem|q, a1, a2, a3?, correct 1-based}.
  // Il tier locale (4B) produce JSON ben formato (grammatica GBNF) ma non garantisce
  // item SENSATI: qui il filtro deterministico. Regole:
  //  stem ≥ 4 parole · ≥ 2 opzioni distinte non vuote · correct valido e nel set ·
  //  lo stem non contiene la risposta corretta verbatim · opzioni ≤ 12 parole.
  function validQuizItem(it, label) {
    if (!it) return false;
    var stem = String(it.stem || it.q || '').trim();
    if (_wc(stem) < 4) return false;
    var opts = [it.a1, it.a2, it.a3].filter(function (o) { return o != null && String(o).trim() !== ''; }).map(function (o) { return String(o).trim(); });
    if (opts.length < 2) return false;
    var seen = {}, distinct = 0;
    for (var i = 0; i < opts.length; i++) {
      if (_wc(opts[i]) > 12) return false;
      var k = _norm(opts[i]);
      if (!seen[k]) { seen[k] = 1; distinct++; }
    }
    if (distinct < 2) return false;
    var ci = parseInt(it.correct, 10);
    if (!(ci >= 1 && ci <= 3)) return false;
    var corr = it['a' + ci];
    if (corr == null || String(corr).trim() === '') return false;
    if (_norm(stem).indexOf(_norm(corr)) >= 0) return false;   // lo stem regala la risposta
    return true;
  }

  // ── Difficoltà adattiva (ZPD + fading, c10): formato domanda dal livello mastery.
  //  nuovo → 'tf' (scelta binaria: carico minimo) · in-corso → 'mc' · acquisito/fluente → 'open'.
  // CAP sui tentativi: con EWMA la prima misura È il valore → un TF indovinato (50% caso)
  // manderebbe subito a 'acquisito'. Con attempts < 3 non si sale mai oltre 'in-corso'.
  function zpdFormat(level, attempts) {
    var a = attempts || 0;
    var lv = level || 'nuovo';
    if (a < 3 && (lv === 'acquisito' || lv === 'fluente')) lv = 'in-corso';
    if (lv === 'nuovo') return 'tf';
    if (lv === 'in-corso') return 'mc';
    return 'open';
  }

  // ── Campionatore stratificato per il boss (copertura macro-aree, B18).
  // entries: [{id, macro, attempts, need}] — round-robin fra i gruppi macro;
  // dentro ogni gruppo: prima i mai testati (attempts 0), poi need decrescente.
  // Garantisce: se count ≥ #gruppi, ogni gruppo è rappresentato almeno una volta.
  function stratifiedPick(entries, count) {
    if (!Array.isArray(entries) || !entries.length || !(count > 0)) return [];
    var groups = {}, order = [];
    entries.forEach(function (e) {
      var g = (e && e.macro != null) ? String(e.macro) : '?';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(e);
    });
    order.forEach(function (g) {
      groups[g].sort(function (a, b) {
        var ua = (a.attempts || 0) === 0 ? 0 : 1, ub = (b.attempts || 0) === 0 ? 0 : 1;
        if (ua !== ub) return ua - ub;                       // mai testati prima
        return (b.need || 0) - (a.need || 0);                // poi più bisognosi
      });
    });
    var pick = [], gi = 0, done = false;
    while (pick.length < count && !done) {
      done = true;
      for (var i = 0; i < order.length && pick.length < count; i++) {
        var lst = groups[order[i]];
        if (gi < lst.length) { pick.push(lst[gi]); done = false; }
      }
      gi++;
    }
    return pick;
  }

  // ── Tier AI: 'cloud' (API key presente) → 'local' (modello locale configurato,
  // flag non spento) → 'off' (deterministico). localDisabled = flag utente '0'.
  function pickTier(hasKey, hasModel, localDisabled) {
    if (hasKey) return 'cloud';
    if (hasModel && !localDisabled) return 'local';
    return 'off';
  }

  var CORE = {
    capEvents: capEvents,
    strHash: strHash,
    validQuizItem: validQuizItem,
    zpdFormat: zpdFormat,
    stratifiedPick: stratifiedPick,
    pickTier: pickTier
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;
  window.MappAIDungeonCore = CORE;
  console.log('[MappAIDungeonCore] logica pura Memory Dungeon caricata');
})();
