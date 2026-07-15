/*
 * mappai-live-core.js — logica PURA di MappAI Live (testabile in Node)
 * ---------------------------------------------------------------------
 * Nessun accesso a DOM/localStorage/rete: funzioni deterministiche condivise
 * tra pagina studente (public/live/student.html), server (live-server.js) e
 * lato docente (mappai-live-teacher.js / mappai-live-classes.js).
 *
 *  - EMOJI_SET / LIMITS            → costanti condivise (identità, cap)
 *  - buildCredentials              → coppie uniche emoji+numero (00..10) per classe
 *  - normalizeClassName / identityKey / displayName
 *  - validateQuestion / publicQuestions (strippa le SOLUZIONI lato server)
 *  - mcFromItem / tfFromMc         → item dei generatori esistenti → domande live
 *  - buildL1Resolver               → nodo → macro-area L1 (replica pura di
 *                                    mappai-entity-backbone.js:_buildL1Resolver)
 *  - cleanAnswer / gradeAnswer     → sanificazione input studente + correzione
 *                                    (tf/mc esatti, cloze fuzzy, open fuzzy)
 *  - rateFromMs                    → fluenza per-item (item/min, cap 30)
 *  - computeResults                → modello dati unico dei due report
 *                                    (heatmap domande + schede individuali)
 *
 * Le metriche per-studente usano le STESSE formule pure di mappai-mastery.js
 * (EWMA α=0.35) e mappai-active-study-core.js (rateFromSeconds), ma su store
 * in memoria: MAI scritte nel mastery store localStorage del docente.
 *
 * Modulo UMD (pattern di mappai-collab-core.js): module.exports per
 * `node --test`, window.MappAILiveCore per il browser.
 */
(function () {
  'use strict';

  // ── Costanti condivise ──────────────────────────────────────────────────
  // Identità = coppia (emoji, numero 00..10). Il matching usa SEMPRE la chiave
  // ascii `key`, mai il glifo: zero problemi di codepoint iOS/Android.
  var EMOJI_SET = [
    { key: 'volpe', emoji: '🦊', label: 'Volpe' },
    { key: 'panda', emoji: '🐼', label: 'Panda' },
    { key: 'rana', emoji: '🐸', label: 'Rana' },
    { key: 'leone', emoji: '🦁', label: 'Leone' },
    { key: 'polpo', emoji: '🐙', label: 'Polpo' },
    { key: 'gufo', emoji: '🦉', label: 'Gufo' },
    { key: 'tartaruga', emoji: '🐢', label: 'Tartaruga' },
    { key: 'ape', emoji: '🐝', label: 'Ape' },
    { key: 'farfalla', emoji: '🦋', label: 'Farfalla' },
    { key: 'delfino', emoji: '🐬', label: 'Delfino' },
    { key: 'unicorno', emoji: '🦄', label: 'Unicorno' },
    { key: 'coccinella', emoji: '🐞', label: 'Coccinella' }
  ];
  var NUM_MAX = 10;                                   // numeri personali 00..10
  var MAX_IDENTITIES = EMOJI_SET.length * (NUM_MAX + 1);   // 132

  var LIMITS = {
    textMax: 400,            // caratteri testo domanda
    optionMax: 160,          // caratteri per opzione
    optionsMin: 2,
    optionsMax: 5,
    answerMax: 600,          // caratteri risposta aperta studente
    questionsMax: 60,        // domande per sessione
    msMax: 2 * 60 * 60 * 1000, // cap tempo per-item (2h: anti-timestamp rotti)
    nameMax: 40,             // nome allievo opzionale
    classMax: 40             // nome classe
  };

  // Soglie pedagogiche dei topic (report individuale)
  var TOPIC_STRONG = 0.8;    // forte: accuratezza EWMA ≥ 0.8 con ≥ 2 item
  var TOPIC_STRONG_MIN_ITEMS = 2;
  var TOPIC_WEAK = 0.5;      // debole: accuratezza < 0.5 oppure ≥ 50% bianchi
  var TOPIC_WEAK_BLANKS = 0.5;
  var ALPHA = 0.35;          // stessa reattività EWMA di mappai-mastery.js

  // ── Testo / identità ────────────────────────────────────────────────────
  function sanitizeText(raw, max) {
    return String(raw == null ? '' : raw)
      .replace(/[<>`\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max || LIMITS.textMax);
  }

  function slugify(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
  }

  // Nome classe: minuscole, senza accenti/ordinali, spazi collassati.
  // NFKD (non NFD) così "2ª" → "2a" e "2a" combaciano: il docente scrive
  // "2ª A", lo studente digita "2a A" e il login funziona lo stesso.
  function normalizeClassName(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function emojiByKey(key) {
    for (var i = 0; i < EMOJI_SET.length; i++) if (EMOJI_SET[i].key === key) return EMOJI_SET[i];
    return null;
  }

  // Credenziali per una classe di `count` allievi: coppie UNICHE (emoji, numero).
  // Allievo i → emoji i%12, numero i/12 → con ≤12 allievi tutte le emoji diverse.
  function buildCredentials(count) {
    var n = Math.max(0, Math.min(Number(count) || 0, MAX_IDENTITIES));
    var out = [];
    for (var i = 0; i < n; i++) {
      var e = EMOJI_SET[i % EMOJI_SET.length];
      out.push({ emojiKey: e.key, emoji: e.emoji, num: pad2(Math.floor(i / EMOJI_SET.length)), name: '' });
    }
    return out;
  }

  function identityKey(emojiKey, num) {
    return slugify(emojiKey) + '-' + pad2(String(num || '').replace(/\D/g, '').slice(0, 2) || '0');
  }

  // Nome mostrato nei report: nome se presente, altrimenti "🦊 07".
  function displayName(student) {
    if (student && student.name && String(student.name).trim()) return sanitizeText(student.name, LIMITS.nameMax);
    var e = student && emojiByKey(student.emojiKey);
    return ((e && e.emoji) || '?') + ' ' + pad2((student && student.num) || '0');
  }

  // ── Matching risposte (copie autoconsistenti: il server non ha window) ──
  // normalize/levenshtein/isCloseMatch → stesse regole di mappai-cloze.js
  // answerMatches → stessa regola di mappai-active-study-core.js:111
  function normalize(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function levenshtein(a, b) {
    a = String(a); b = String(b);
    var m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur[0] = i;
      for (j = 1; j <= n; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      var tmp = prev; prev = cur; cur = tmp;
    }
    return prev[n];
  }

  // Tollerante per BES/DSA: accenti/maiuscole ignorati, plurale e refuso piccolo ok.
  function isCloseMatch(answer, expected) {
    var a = normalize(answer), e = normalize(expected);
    if (!a) return false;
    if (a === e) return true;
    if (e.indexOf(a) === 0 && a.length >= Math.max(4, e.length - 2)) return true;
    return levenshtein(a, e) <= (e.length > 6 ? 2 : 1);
  }

  // "roma" NON matcha "romania" (ratio 4/7 < 0.7).
  function answerMatches(selected, correct) {
    var ns = normalize(selected), nc = normalize(correct);
    if (!ns || !nc) return false;
    if (ns === nc) return true;
    if (ns.length >= 4 && nc.length >= 4 && (ns.indexOf(nc) >= 0 || nc.indexOf(ns) >= 0)) {
      return Math.min(ns.length, nc.length) / Math.max(ns.length, nc.length) >= 0.7;
    }
    return false;
  }

  // ── Domande ─────────────────────────────────────────────────────────────
  // Schema mappai-live-question@1:
  //   { idx, kind:'tf'|'mc'|'cloze'|'open', text, options?, correct?,
  //     proposed?, statementTrue?, segments?, answerText?,
  //     nodeId, nodeLabel, l1Id, l1Label, source:'map'|'custom' }
  //   - tf: text = domanda, proposed = risposta proposta, statementTrue = bool
  //   - cloze: segments = [{text}|{blank:'termine'}]
  //   - open: answerText opzionale → senza, la correzione è manuale
  function validateQuestion(q) {
    var errors = [];
    if (!q || typeof q !== 'object') return { ok: false, errors: ['not-an-object'], clean: null };
    var kind = q.kind;
    if (['tf', 'mc', 'cloze', 'open'].indexOf(kind) < 0) errors.push('bad-kind');
    var text = sanitizeText(q.text, LIMITS.textMax);
    if (!text && kind !== 'cloze') errors.push('empty-text');
    var clean = {
      kind: kind, text: text,
      nodeId: q.nodeId != null ? String(q.nodeId) : null,
      nodeLabel: sanitizeText(q.nodeLabel, 120) || null,
      l1Id: q.l1Id != null ? String(q.l1Id) : null,
      l1Label: sanitizeText(q.l1Label, 120) || null,
      source: q.source === 'custom' ? 'custom' : 'map'
    };
    if (kind === 'mc') {
      var opts = Array.isArray(q.options) ? q.options.map(function (o) { return sanitizeText(o, LIMITS.optionMax); }).filter(Boolean) : [];
      if (opts.length < LIMITS.optionsMin || opts.length > LIMITS.optionsMax) errors.push('bad-options');
      var c = Number(q.correct);
      if (!Number.isInteger(c) || c < 0 || c >= opts.length) errors.push('bad-correct');
      clean.options = opts; clean.correct = c;
    } else if (kind === 'tf') {
      if (typeof q.statementTrue !== 'boolean') errors.push('bad-statement');
      clean.proposed = sanitizeText(q.proposed, LIMITS.optionMax) || null;
      clean.statementTrue = !!q.statementTrue;
    } else if (kind === 'cloze') {
      var segs = Array.isArray(q.segments) ? q.segments : [];
      var blanks = segs.filter(function (s) { return s && s.blank; });
      if (!blanks.length) errors.push('no-blanks');
      clean.segments = segs.map(function (s) {
        return (s && s.blank) ? { blank: sanitizeText(s.blank, LIMITS.optionMax) } : { text: String((s && s.text) || '') };
      });
    } else if (kind === 'open') {
      clean.answerText = sanitizeText(q.answerText, LIMITS.answerMax) || null;
      // Timeline Live (008): campi opzionali per l'autovalutazione avanzata.
      // Domande senza questi campi → comportamento invariato.
      if (Array.isArray(q.answerTexts)) {
        clean.answerTexts = q.answerTexts.map(function (t) { return sanitizeText(t, LIMITS.answerMax); }).filter(Boolean);
      }
      if (q.answerYear != null && Number.isInteger(Number(q.answerYear))) {
        clean.answerYear = Number(q.answerYear);
        if (q.answerYearEnd != null && Number.isInteger(Number(q.answerYearEnd))) clean.answerYearEnd = Number(q.answerYearEnd);
        clean.yearTolerance = [0, 2, 5].indexOf(Number(q.yearTolerance)) >= 0 ? Number(q.yearTolerance) : 0;
      }
      if (q.expects === 'year') clean.expects = 'year';
    }
    // Timeline: metadati non-soluzione (visibili anche al pubblico).
    if (q.hint != null) clean.hint = sanitizeText(q.hint, LIMITS.textMax) || null;
    if (q.tlYear != null && Number.isInteger(Number(q.tlYear))) clean.tlYear = Number(q.tlYear);
    return { ok: errors.length === 0, errors: errors, clean: errors.length === 0 ? clean : null };
  }

  // Set completo → set PUBBLICO per gli studenti: soluzioni strippate.
  function publicQuestions(questions) {
    return (Array.isArray(questions) ? questions : []).map(function (q, i) {
      var pub = {
        idx: (q.idx != null ? q.idx : i), kind: q.kind, text: q.text,
        nodeLabel: q.nodeLabel || null
      };
      // Timeline (008): l'indizio è CONTESTO della fonte, non la soluzione → può
      // viaggiare; expects guida l'input numerico degli anni. answerYear/answerText(s)
      // restano strippati (non copiati qui).
      if (q.hint != null) pub.hint = q.hint;
      if (q.expects === 'year') pub.expects = 'year';
      if (q.tlYear != null) pub.tlYear = q.tlYear;
      if (q.kind === 'mc') pub.options = (q.options || []).slice();
      if (q.kind === 'tf') pub.proposed = q.proposed || null;
      if (q.kind === 'cloze') {
        pub.segments = (q.segments || []).map(function (s) {
          return s.blank ? { blank: { len: String(s.blank).length } } : { text: s.text };
        });
      }
      return pub;
    });
  }

  // Item dei generatori esistenti ({stem|q, a1..a3, correct 1-based}) → MC live.
  function mcFromItem(item) {
    if (!item) return null;
    var text = sanitizeText(item.stem || item.q, LIMITS.textMax);
    var options = [item.a1, item.a2, item.a3]
      .map(function (o) { return sanitizeText(o, LIMITS.optionMax); }).filter(Boolean);
    if (!text || options.length < 2) return null;
    var c = Number(item.correct);
    var correct = (Number.isInteger(c) && c >= 1 && c <= options.length) ? c - 1
      : (Number.isInteger(c) && c >= 0 && c < options.length) ? c : -1;
    if (correct < 0) return null;
    return { kind: 'mc', text: text, options: options, correct: correct };
  }

  // Domanda MC → Vero/Falso deterministico: pick ∈ [0,1) sceglie se proporre
  // la risposta giusta (statement VERO) o un distrattore (statement FALSO).
  function tfFromMc(mcQuestion, pick) {
    if (!mcQuestion || mcQuestion.kind !== 'mc') return null;
    var p = (typeof pick === 'number' && isFinite(pick)) ? Math.abs(pick) % 1 : 0.5;
    var useTrue = p < 0.5;
    var idx;
    if (useTrue) idx = mcQuestion.correct;
    else {
      var wrong = [];
      for (var i = 0; i < mcQuestion.options.length; i++) if (i !== mcQuestion.correct) wrong.push(i);
      idx = wrong.length ? wrong[Math.floor(p * 2 * wrong.length) % wrong.length] : mcQuestion.correct;
    }
    return {
      kind: 'tf', text: mcQuestion.text,
      proposed: mcQuestion.options[idx],
      statementTrue: idx === mcQuestion.correct
    };
  }

  // ── Nodo → macro-area L1 (replica pura di mappai-entity-backbone.js) ────
  // Segue solo i link gerarchici (isCross esclusi); primo genitore vince.
  function buildL1Resolver(nodes, links) {
    var parentOf = {};
    (Array.isArray(links) ? links : []).forEach(function (l) {
      if (!l || l.isCross) return;
      var src = (typeof l.source === 'object' && l.source) ? l.source.id : l.source;
      var tgt = (typeof l.target === 'object' && l.target) ? l.target.id : l.target;
      if (tgt != null && parentOf[tgt] == null) parentOf[tgt] = src;
    });
    var byId = {};
    (Array.isArray(nodes) ? nodes : []).forEach(function (n) { if (n && n.id != null) byId[n.id] = n; });
    return function l1Of(nodeId) {
      var cur = nodeId, hops = 0;
      while (cur != null && hops < 12) {
        var n = byId[cur];
        if (!n) return null;
        if (n.level === 1) return { id: n.id, label: String(n.label || '') };
        if (n.level === 0) return null;
        cur = parentOf[cur];
        hops++;
      }
      return null;
    };
  }

  // ── Risposte studente ───────────────────────────────────────────────────
  // Sanifica il payload grezzo del client per il tipo di domanda.
  // Ritorna { skipped, choice?, text?, blanks?, ms } o null se non interpretabile.
  function cleanAnswer(question, raw) {
    if (!question || !raw || typeof raw !== 'object') return null;
    var ms = Math.max(0, Math.min(Number(raw.ms) || 0, LIMITS.msMax));
    // Timeline (008): traccia l'uso dell'indizio SOLO se presente (shape legacy invariata).
    if (raw.skipped === true) { var s = { skipped: true, ms: ms }; if (raw.hintUsed === true) s.hintUsed = true; return s; }
    var a = { ms: ms };
    if (raw.hintUsed === true) a.hintUsed = true;
    if (question.kind === 'tf') {
      if (typeof raw.choice !== 'boolean') return null;
      a.choice = raw.choice;
    } else if (question.kind === 'mc') {
      var c = Number(raw.choice);
      if (!Number.isInteger(c) || c < 0 || c >= (question.options || []).length) return null;
      a.choice = c;
    } else if (question.kind === 'cloze') {
      var expected = (question.segments || []).filter(function (s) { return s.blank; }).length;
      var blanks = Array.isArray(raw.blanks) ? raw.blanks : [];
      a.blanks = [];
      for (var i = 0; i < expected; i++) a.blanks.push(sanitizeText(blanks[i], LIMITS.optionMax));
    } else if (question.kind === 'open') {
      a.text = sanitizeText(raw.text, LIMITS.answerMax);
    } else return null;
    return a;
  }

  // Corregge una risposta. outcome: 'right'|'wrong'|'blank'|'manual'.
  //  - blank  = nessuna risposta / Salta / contenuto vuoto
  //  - manual = domanda aperta senza answerText → la corregge il docente
  //  - cloze: score = frazione di blank corretti; right solo se tutti
  function gradeAnswer(question, answer) {
    if (!answer || answer.skipped) return { score: 0, outcome: 'blank' };
    if (question.kind === 'tf') {
      if (typeof answer.choice !== 'boolean') return { score: 0, outcome: 'blank' };
      var okTf = answer.choice === question.statementTrue;
      return { score: okTf ? 1 : 0, outcome: okTf ? 'right' : 'wrong' };
    }
    if (question.kind === 'mc') {
      if (!Number.isInteger(answer.choice)) return { score: 0, outcome: 'blank' };
      var okMc = answer.choice === question.correct;
      return { score: okMc ? 1 : 0, outcome: okMc ? 'right' : 'wrong' };
    }
    if (question.kind === 'cloze') {
      var terms = (question.segments || []).filter(function (s) { return s.blank; }).map(function (s) { return s.blank; });
      var given = Array.isArray(answer.blanks) ? answer.blanks : [];
      if (!terms.length) return { score: 0, outcome: 'blank' };
      if (given.every(function (g) { return !String(g || '').trim(); })) return { score: 0, outcome: 'blank' };
      var ok = 0;
      terms.forEach(function (t, i) { if (isCloseMatch(given[i], t)) ok++; });
      var score = ok / terms.length;
      return { score: score, outcome: score === 1 ? 'right' : 'wrong' };
    }
    if (question.kind === 'open') {
      var txt = String(answer.text || '').trim();
      if (!txt) return { score: 0, outcome: 'blank' };
      // Timeline (008): domanda evento→anno → confronto numerico con tolleranza.
      if (question.answerYear != null) {
        var guess = parseInt(txt.replace(/[^0-9-]/g, ''), 10);
        if (!Number.isInteger(guess)) return { score: 0, outcome: 'wrong' };
        var tol = [0, 2, 5].indexOf(question.yearTolerance) >= 0 ? question.yearTolerance : 0;
        var lo = question.answerYear - tol;
        var hi = (question.answerYearEnd || question.answerYear) + tol;
        var okY = guess >= lo && guess <= hi;
        return { score: okY ? 1 : 0, outcome: okY ? 'right' : 'wrong' };
      }
      // Timeline: più eventi per lo stesso anno → corretto se ne indovina UNO.
      if (Array.isArray(question.answerTexts) && question.answerTexts.length) {
        var okAny = question.answerTexts.some(function (a) { return answerMatches(txt, a); });
        return { score: okAny ? 1 : 0, outcome: okAny ? 'right' : 'wrong' };
      }
      if (!question.answerText) return { score: null, outcome: 'manual' };
      var okOpen = answerMatches(txt, question.answerText);
      return { score: okOpen ? 1 : 0, outcome: okOpen ? 'right' : 'wrong' };
    }
    return { score: 0, outcome: 'blank' };
  }

  // Fluenza per-item: ms → item/min, cap 30, 1 decimale (regola di
  // mappai-active-study-core.js:rateFromSeconds — qui il tempo arriva in ms).
  function rateFromMs(ms) {
    var s = Number(ms) / 1000;
    if (!isFinite(s) || s <= 0) return null;
    return Math.round(Math.min(60 / s, 30) * 10) / 10;
  }

  function median(arr) {
    var a = arr.filter(function (x) { return x != null && isFinite(x); }).sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : Math.round(((a[mid - 1] + a[mid]) / 2) * 10) / 10;
  }

  function pct(count, total) { return total > 0 ? Math.round(100 * count / total) : 0; }

  // EWMA accuratezza (stessa formula di mappai-mastery.js:ewma).
  function ewmaAcc(prev, x) {
    var v = Math.max(0, Math.min(1, Number(x) || 0));
    if (prev == null) return v;
    return Math.max(0, Math.min(1, prev * (1 - ALPHA) + v * ALPHA));
  }

  // ── Risultati → modello dati dei due report ─────────────────────────────
  // questions: set COMPLETO (con soluzioni); students: array dei file studente
  //   { emojiKey, num, name, joinedAt, finishedAt, answers:{ [idx]: {...} } };
  // roster: credenziali della classe (per il conteggio assenti).
  // Le domande 'manual' (aperte senza soluzione) contano nel heatmap come
  // colonna a sé e NON entrano in accuratezza/topic.
  function computeResults(questions, students, roster) {
    var qs = Array.isArray(questions) ? questions : [];
    var sts = Array.isArray(students) ? students : [];
    var joined = sts.length;
    var rosterN = Array.isArray(roster) ? roster.length : joined;

    // nodo → L1 (dalle domande stesse: l1 risolto a build-time)
    var perQuestion = qs.map(function (q, i) {
      return {
        idx: (q.idx != null ? q.idx : i), kind: q.kind, text: q.text,
        proposed: q.proposed || null,
        nodeLabel: q.nodeLabel || null, l1Label: q.l1Label || null,
        source: q.source || 'map',
        tlYear: (q.tlYear != null ? q.tlYear : null),   // Timeline (008): ordine cronologico report
        right: 0, wrong: 0, blank: 0, manual: 0, hintCount: 0,
        scoreSum: 0, scoreN: 0
      };
    });

    var perStudent = sts.map(function (st) {
      var answers = st.answers || {};
      var items = [];
      var rightCount = 0, wrongCount = 0, blankCount = 0, manualCount = 0, hintsUsed = 0;
      var scoreSum = 0, attemptedN = 0;   // accuratezza SOLO su right+wrong (attempted)
      var rates = [];
      // nodeId → EWMA su attempted + conteggi; blank tracciati a parte (non abbassano l'acc)
      var nodeStore = {};

      qs.forEach(function (q, i) {
        var idx = (q.idx != null ? q.idx : i);
        var g = gradeAnswer(q, answers[idx]);
        var ms = answers[idx] ? (Number(answers[idx].ms) || 0) : 0;
        var attempted = (g.outcome === 'right' || g.outcome === 'wrong');
        var rate = attempted ? rateFromMs(ms) : null;
        items.push({ idx: idx, outcome: g.outcome, score: g.score, ms: ms, rate: rate });

        if (answers[idx] && answers[idx].hintUsed) { hintsUsed++; perQuestion[i].hintCount++; }

        var pq = perQuestion[i];
        if (g.outcome === 'right') { rightCount++; pq.right++; }
        else if (g.outcome === 'wrong') { wrongCount++; pq.wrong++; }
        else if (g.outcome === 'manual') { manualCount++; pq.manual++; }
        else { blankCount++; pq.blank++; }

        if (attempted) {
          scoreSum += (g.score || 0); attemptedN++;
          pq.scoreSum += (g.score || 0); pq.scoreN++;
          if (rate != null) rates.push(rate);
        }

        // topic: solo domande ancorate a un nodo; blank contati ma non nell'EWMA
        if (q.nodeId && g.outcome !== 'manual') {
          var row = nodeStore[q.nodeId] || (nodeStore[q.nodeId] = {
            nodeId: q.nodeId, nodeLabel: q.nodeLabel || '', acc: null,
            attempted: 0, blanks: 0, l1Id: q.l1Id || null, l1Label: q.l1Label || null
          });
          if (attempted) { row.acc = ewmaAcc(row.acc, g.score || 0); row.attempted++; }
          else row.blanks++;
        }
      });

      // aggregazione topic: media delle accuratezze EWMA dei nodi con item tentati
      var topicMap = {};
      Object.keys(nodeStore).forEach(function (nid) {
        var row = nodeStore[nid];
        var tKey = row.l1Id || '(senza-area)';
        var t = topicMap[tKey] || (topicMap[tKey] = {
          l1Id: row.l1Id, l1Label: row.l1Label || row.nodeLabel || '—',
          accSum: 0, accNodes: 0, attempted: 0, blanks: 0
        });
        if (row.acc != null) { t.accSum += row.acc; t.accNodes++; }
        t.attempted += row.attempted; t.blanks += row.blanks;
      });
      var topics = Object.keys(topicMap).map(function (k) {
        var t = topicMap[k];
        return {
          l1Id: t.l1Id, l1Label: t.l1Label,
          accuracy: t.accNodes ? Math.round((t.accSum / t.accNodes) * 100) / 100 : 0,
          attempted: t.attempted, blanks: t.blanks, total: t.attempted + t.blanks
        };
      }).sort(function (a, b) { return b.accuracy - a.accuracy; });

      var strengths = topics.filter(function (t) {
        return t.attempted >= TOPIC_STRONG_MIN_ITEMS && t.accuracy >= TOPIC_STRONG;
      }).map(function (t) { return t.l1Label; });
      var weaknesses = topics.filter(function (t) {
        return (t.attempted > 0 && t.accuracy < TOPIC_WEAK) ||
          (t.total > 0 && t.blanks / t.total >= TOPIC_WEAK_BLANKS);
      }).map(function (t) { return t.l1Label; });

      return {
        emojiKey: st.emojiKey, emoji: (emojiByKey(st.emojiKey) || {}).emoji || '?',
        num: st.num, name: st.name || '',
        displayName: displayName(st),
        joinedAt: st.joinedAt || null, finishedAt: st.finishedAt || null,
        items: items,
        answered: rightCount + wrongCount + manualCount,
        rightCount: rightCount, wrongCount: wrongCount,
        blankCount: blankCount, manualCount: manualCount, hintsUsed: hintsUsed,
        accuracyPct: attemptedN ? Math.round(100 * scoreSum / attemptedN) : 0,
        medianRate: median(rates),
        topics: topics, strengths: strengths, weaknesses: weaknesses
      };
    });

    perQuestion.forEach(function (pq) {
      pq.pctRight = pct(pq.right, joined);
      pq.pctWrong = pct(pq.wrong, joined);
      pq.pctBlank = pct(pq.blank, joined);
      pq.pctManual = pct(pq.manual, joined);
      pq.avgScore = pq.scoreN ? Math.round(100 * pq.scoreSum / pq.scoreN) / 100 : null;
      delete pq.scoreSum; delete pq.scoreN;
    });

    return {
      perQuestion: perQuestion,
      perStudent: perStudent,
      joined: joined,
      absent: Math.max(0, rosterN - joined),
      questionCount: qs.length
    };
  }

  var CORE = {
    EMOJI_SET: EMOJI_SET,
    NUM_MAX: NUM_MAX,
    MAX_IDENTITIES: MAX_IDENTITIES,
    LIMITS: LIMITS,
    TOPIC_STRONG: TOPIC_STRONG,
    TOPIC_WEAK: TOPIC_WEAK,
    ALPHA: ALPHA,
    sanitizeText: sanitizeText,
    slugify: slugify,
    normalizeClassName: normalizeClassName,
    pad2: pad2,
    emojiByKey: emojiByKey,
    buildCredentials: buildCredentials,
    identityKey: identityKey,
    displayName: displayName,
    normalize: normalize,
    levenshtein: levenshtein,
    isCloseMatch: isCloseMatch,
    answerMatches: answerMatches,
    validateQuestion: validateQuestion,
    publicQuestions: publicQuestions,
    mcFromItem: mcFromItem,
    tfFromMc: tfFromMc,
    buildL1Resolver: buildL1Resolver,
    cleanAnswer: cleanAnswer,
    gradeAnswer: gradeAnswer,
    rateFromMs: rateFromMs,
    median: median,
    computeResults: computeResults
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;
  window.MappAILiveCore = CORE;
  console.log('[MappAILiveCore] logica pura MappAI Live caricata');
})();
