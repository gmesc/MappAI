/*
 * mappai-timeline-core.js — logica PURA della Timeline (testabile in Node)
 * ----------------------------------------------------------------------------
 * Nessun accesso a DOM/localStorage/rete. Condiviso tra:
 *   - mappai-timeline.js        (date manuali, merge, esercizio in-app)
 *   - mappai-timeline-teacher.js (wizard Live, dashboard, proiezione LIM)
 *   - live-server.js            (validazione proposte modalità Costruisci)
 *   - public/live/timeline-build.html (pagina studente Costruisci)
 *
 * Feature 008-timeline-live. Modulo UMD (pattern di mappai-live-core.js):
 * module.exports per `node --test`, window.MappAITimelineCore per il browser.
 */
(function () {
  'use strict';

  // i18n-safe: in Node window non esiste → usa sempre il fallback italiano.
  function _tSafe(k, fallback) {
    try { if (typeof window !== 'undefined' && window.t) return window.t(k, fallback); }
    catch (e) { /* no-op */ }
    return fallback;
  }

  // ── Categorie evento (stessi hex del colorMap di mappai-timeline.js) ────────
  var CATEGORIES = [
    { key: 'Politica',    color: '#4f46e5' },
    { key: 'Economia',    color: '#059669' },
    { key: 'Militare',    color: '#dc2626' },
    { key: 'Diplomatica', color: '#d97706' },
    { key: 'Sociale',     color: '#7c3aed' },
    { key: 'Cultura',     color: '#0891b2' }
  ];
  var CATEGORY_KEYS = CATEGORIES.map(function (c) { return c.key; });
  var DEFAULT_COLOR = '#6366f1';

  function categoryColor(key) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].key === key) return CATEGORIES[i].color;
    return DEFAULT_COLOR;
  }

  var YEAR_MIN = 1000, YEAR_MAX = 2100;
  var EVENT_MAX = 120, CTX_MAX = 400, LABEL_MAX = 40, AUTHOR_MAX = 80;

  // ── Normalizzazione ─────────────────────────────────────────────────────────
  // Chiave di dedup: minuscole, accenti piatti, solo alfanumerico, cap 40.
  function normalizeLabel(s) {
    return String(s || '').toLowerCase()
      .replace(/[àáâã]/g, 'a').replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i').replace(/[òóôõ]/g, 'o').replace(/[ùúûü]/g, 'u')
      .replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  }

  function _cap(s, n) { return String(s == null ? '' : s).trim().slice(0, n); }

  // Valida/normalizza un evento della timeline. → { ok, clean | errors }.
  function normalizeEvent(raw) {
    if (!raw || typeof raw !== 'object') return { ok: false, errors: ['not-an-object'], clean: null };
    var errors = [];
    var anno = parseInt(raw.anno, 10);
    if (!Number.isInteger(anno) || anno < YEAR_MIN || anno > YEAR_MAX) errors.push('bad-year');
    var evento = _cap(raw.evento, EVENT_MAX);
    if (!evento) errors.push('empty-event');

    var annoFine = null;
    if (raw.annoFine != null && raw.annoFine !== '') {
      var af = parseInt(raw.annoFine, 10);
      if (Number.isInteger(af) && af >= anno && af <= YEAR_MAX) annoFine = af;
    }
    var macroArea = CATEGORY_KEYS.indexOf(raw.macroArea) >= 0 ? raw.macroArea : '';
    var origin = (raw.origin === 'ai' || raw.origin === 'student') ? raw.origin : 'manual';
    var clean = {
      id:        raw.id || null,
      anno:      anno,
      annoFine:  annoFine,
      dataLabel: _cap(raw.dataLabel || (Number.isInteger(anno) ? String(anno) : ''), LABEL_MAX),
      evento:    evento,
      contesto:  _cap(raw.contesto, CTX_MAX),
      macroArea: macroArea,
      origin:    origin,
      author:    raw.author ? _cap(raw.author, AUTHOR_MAX) : null
    };
    return { ok: errors.length === 0, errors: errors, clean: errors.length === 0 ? clean : null };
  }

  function eventKey(ev) {
    var anno = ev && ev.anno != null ? parseInt(ev.anno, 10) : 0;
    return (anno || 0) + '|' + normalizeLabel(ev && ev.evento);
  }

  // Pool attività = date manuali/studente (priorità: correzione docente vince) +
  // date dell'ultima generazione AI, deduplicato per eventKey, ordine cronologico.
  function buildPool(timelineAI, timelineEvents) {
    var out = [], seen = {};
    function push(list, forcedOrigin) {
      (Array.isArray(list) ? list : []).forEach(function (raw) {
        var src = raw;
        if (forcedOrigin && (!raw || !raw.origin)) {
          src = {}; for (var k in raw) if (Object.prototype.hasOwnProperty.call(raw, k)) src[k] = raw[k];
          src.origin = forcedOrigin;
        }
        var n = normalizeEvent(src);
        if (!n.ok) return;
        var key = eventKey(n.clean);
        if (seen[key]) return;
        seen[key] = true;
        out.push(n.clean);
      });
    }
    push(timelineEvents, null);   // manuali/studente prima → vincono in caso di collisione
    push(timelineAI, 'ai');
    out.sort(function (a, b) { return (a.anno - b.anno) || ((a.annoFine || a.anno) - (b.annoFine || b.anno)); });
    return out;
  }

  // ── Estrazione anni (port puro di window._extractYearsWithContext) ──────────
  function extractYears(text) {
    if (!text) return [];
    var out = [], seen = {}, m;
    function ctx(txt, idx, len) {
      var W = 120, s = Math.max(0, idx - W), e = Math.min(txt.length, idx + len + W);
      var c = txt.slice(s, e).trim();
      if (s > 0) c = '…' + c;
      if (e < txt.length) c = c + '…';
      return c;
    }
    var rangeRe = /\b(\d{4})\s*[-–]\s*(\d{4})\b/g;
    while ((m = rangeRe.exec(text)) !== null) {
      var y = parseInt(m[1], 10);
      if (!seen[y]) { seen[y] = true; out.push({ year: y, yearEnd: parseInt(m[2], 10), raw: m[0], context: ctx(text, m.index, m[0].length) }); }
    }
    var yearRe = /\b(1[0-9]{3}|20[0-2][0-9])\b/g;
    while ((m = yearRe.exec(text)) !== null) {
      var yy = parseInt(m[1], 10);
      if (!seen[yy]) { seen[yy] = true; out.push({ year: yy, yearEnd: null, raw: m[1], context: ctx(text, m.index, m[1].length) }); }
    }
    return out;
  }

  // Buchi dell'esercizio: anni citati dalla fonte NON presenti nel pool.
  function buildGaps(sourceText, pool) {
    var have = {};
    (Array.isArray(pool) ? pool : []).forEach(function (e) { have[e.anno] = true; });
    return extractYears(sourceText)
      .filter(function (ry) { return !have[ry.year]; })
      .map(function (ry) { return { year: ry.year, hint: ry.context || '' }; });
  }

  // ── RNG deterministico (per shuffle e distrattori MC stabili) ───────────────
  function seedFrom(str) {
    var h = 2166136261 >>> 0; str = String(str);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function seededShuffle(arr, seed) {
    var a = arr.slice(), rnd = mulberry32(seed >>> 0);
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ── Generazione domande (modalità Completa, zero AI) ────────────────────────
  // opts: { direction:'toEvent'|'toYear'|'mixed', format:'open'|'mc',
  //         hintMode:'always'|'onrequest'|'never', yearTolerance:0|2|5,
  //         order:'chrono'|'shuffle', count:int, seed?:string }
  function buildQuestions(pool, opts) {
    opts = opts || {};
    var dir = opts.direction || 'mixed';
    var format = opts.format === 'mc' ? 'mc' : 'open';
    var tol = [0, 2, 5].indexOf(opts.yearTolerance) >= 0 ? opts.yearTolerance : 2;
    var hintMode = opts.hintMode || 'onrequest';
    var seed = seedFrom(opts.seed || 'timeline');

    var cand = (Array.isArray(pool) ? pool : []).filter(function (e) { return e && e.anno && e.evento; });
    // eventi per anno → any-match nelle domande anno→evento (più eventi stesso anno)
    var byYear = {};
    cand.forEach(function (e) { (byYear[e.anno] = byYear[e.anno] || []).push(e.evento); });

    var ordered = opts.order === 'chrono'
      ? cand.slice().sort(function (a, b) { return a.anno - b.anno; })
      : seededShuffle(cand, seed);
    var count = opts.count > 0 ? Math.min(opts.count, ordered.length) : ordered.length;
    var selected = ordered.slice(0, count);

    var degraded = false;
    var questions = selected.map(function (e, i) {
      var direction = dir === 'mixed' ? (i % 2 === 0 ? 'toEvent' : 'toYear') : dir;
      var hint = hintMode === 'never' ? null : (e.contesto || null);
      var base = { idx: i, tlYear: e.anno, hint: hint, source: 'timeline', nodeId: null, macroArea: e.macroArea || '' };

      if (direction === 'toYear') {
        base.text = _tSafe('tlq_ask_year', 'In che anno: {ev}?').replace('{ev}', e.evento);
        base.expects = 'year';
        base.answerYear = e.anno;
        base.answerYearEnd = e.annoFine || null;
        base.yearTolerance = tol;
        if (format === 'mc') {
          var mcy = _mcYear(e, cand, tol, seed + i);
          if (mcy) { base.kind = 'mc'; base.options = mcy.options; base.correct = mcy.correct; return base; }
          degraded = true;
        }
        base.kind = 'open';
        return base;
      }

      // toEvent
      base.text = _tSafe('tlq_ask_event', 'Nel {d}: quale evento accadde?').replace('{d}', e.dataLabel || String(e.anno));
      base.answerText = e.evento;
      base.answerTexts = (byYear[e.anno] || [e.evento]).slice();
      if (format === 'mc') {
        var mce = _mcEvent(e, cand, seed + i);
        if (mce) { base.kind = 'mc'; base.options = mce.options; base.correct = mce.correct; return base; }
        degraded = true;
      }
      base.kind = 'open';
      return base;
    });

    return { questions: questions, degraded: degraded, poolSize: cand.length };
  }

  // Distrattori evento: altri eventi (preferenza stessa macroArea, poi vicinanza).
  function _mcEvent(correct, cand, seed) {
    var others = cand.filter(function (e) { return eventKey(e) !== eventKey(correct); });
    if (others.length < 1) return null;
    others.sort(function (a, b) {
      var sa = (a.macroArea && a.macroArea === correct.macroArea) ? 0 : 1;
      var sb = (b.macroArea && b.macroArea === correct.macroArea) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return Math.abs(a.anno - correct.anno) - Math.abs(b.anno - correct.anno);
    });
    var picks = [];
    for (var i = 0; i < others.length && picks.length < 3; i++) {
      if (picks.indexOf(others[i].evento) < 0 && others[i].evento !== correct.evento) picks.push(others[i].evento);
    }
    if (picks.length < 1) return null;
    return _assembleMc(correct.evento, picks, seed);
  }

  // Distrattori anno: altri anni MAI dentro la tolleranza dell'anno corretto.
  function _mcYear(correct, cand, tol, seed) {
    var lo = correct.anno - tol, hi = (correct.annoFine || correct.anno) + tol;
    var yearsSet = {}, years = [];
    cand.forEach(function (e) {
      if (e.anno >= lo && e.anno <= hi) return;
      if (!yearsSet[e.anno]) { yearsSet[e.anno] = true; years.push(e.anno); }
    });
    years.sort(function (a, b) { return Math.abs(a - correct.anno) - Math.abs(b - correct.anno); });
    var picks = years.slice(0, 3).map(String);
    if (picks.length < 1) return null;
    return _assembleMc(String(correct.anno), picks, seed);
  }

  function _assembleMc(correct, distractors, seed) {
    var options = seededShuffle([correct].concat(distractors), seed);
    return { options: options, correct: options.indexOf(correct) };
  }

  // ── Proposte (modalità Costruisci) ──────────────────────────────────────────
  function validateProposal(raw) {
    if (!raw || typeof raw !== 'object') return { ok: false, errors: ['not-an-object'], clean: null };
    var errors = [];
    var anno = parseInt(raw.anno, 10);
    if (!Number.isInteger(anno) || anno < YEAR_MIN || anno > YEAR_MAX) errors.push('bad-year');
    var evento = _cap(raw.evento, EVENT_MAX);
    if (!evento) errors.push('empty-event');
    var clean = {
      anno: anno,
      evento: evento,
      contesto: _cap(raw.contesto, CTX_MAX),
      gapYear: (raw.gapYear != null && raw.gapYear !== '') ? parseInt(raw.gapYear, 10) : null
    };
    return { ok: errors.length === 0, errors: errors, clean: errors.length === 0 ? clean : null };
  }

  // Flag calcolati lato server: duplicato (pool o proposte non-bocciate),
  // anno non citato dalle fonti.
  function proposalFlags(clean, pool, proposals, sourceYears) {
    var flags = {};
    var key = eventKey(clean);
    var dup = (Array.isArray(pool) ? pool : []).some(function (e) { return eventKey(e) === key; });
    if (!dup) dup = (Array.isArray(proposals) ? proposals : []).some(function (p) {
      return p.status !== 'rejected' && eventKey(p) === key;
    });
    if (dup) flags.duplicate = true;
    if (Array.isArray(sourceYears) && sourceYears.indexOf(clean.anno) < 0) flags.yearNotInSources = true;
    return flags;
  }

  // Proposte "attive" (non bocciate) di un'identità → per il cap.
  function countActive(proposals, identity) {
    return (Array.isArray(proposals) ? proposals : []).filter(function (p) {
      return p.author === identity && p.status !== 'rejected';
    }).length;
  }

  var CORE = {
    CATEGORIES: CATEGORIES,
    CATEGORY_KEYS: CATEGORY_KEYS,
    categoryColor: categoryColor,
    normalizeLabel: normalizeLabel,
    normalizeEvent: normalizeEvent,
    eventKey: eventKey,
    buildPool: buildPool,
    extractYears: extractYears,
    buildGaps: buildGaps,
    seedFrom: seedFrom,
    seededShuffle: seededShuffle,
    buildQuestions: buildQuestions,
    validateProposal: validateProposal,
    proposalFlags: proposalFlags,
    countActive: countActive
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;
  window.MappAITimelineCore = CORE;
  console.log('[MappAITimelineCore] logica pura Timeline caricata ✓');
})();
