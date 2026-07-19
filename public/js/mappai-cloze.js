/*
 * mappai-cloze.js — Modo CLOZE (Active Recall) graph-aware
 * --------------------------------------------------------
 * Nella descrizione di un nodo oscura le ETICHETTE DI ALTRI NODI che vi compaiono;
 * lo studente completa il concetto mancante leggendo il contesto. Deterministico,
 * zero AI, e usa la struttura del grafo: testa la conoscenza dei concetti collegati
 * dentro un contesto reale. Alimenta lo store di padronanza (attività 'cloze').
 *
 * Modulo UMD: CORE puro (makeCloze, normalize, levenshtein, isCloseMatch) testabile
 * in Node; layer browser (player modale + record su MappAIMastery).
 * Caricare DOPO mappai-mastery.js.
 */
(function () {
  'use strict';

  // ───────────────────────────── CORE PURO ─────────────────────────────
  function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function normalize(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function levenshtein(a, b) {
    a = String(a); b = String(b);
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
    return d[m][n];
  }

  // Tollerante per BES/DSA: accenti/maiuscole ignorati, plurale e refuso piccolo ok.
  function isCloseMatch(answer, expected) {
    const a = normalize(answer), e = normalize(expected);
    if (!a) return false;
    if (a === e) return true;
    if (e.startsWith(a) && a.length >= Math.max(4, e.length - 2)) return true; // plurale/troncamento
    return levenshtein(a, e) <= (e.length > 6 ? 2 : 1);                          // refuso
  }

  // ── Buchi-connettivo (19/7/26): oscurare «perché/quindi/invece di» testa la
  // RELAZIONE tra i concetti, non il lessico — Bloom su, memorizzazione giù.
  // Fonte unica dei pattern: MappAICausalCore.CONNECTIVES (risolto LAZY, così
  // l'ordine di caricamento degli script non conta; in Node via require).
  function _causal() {
    try {
      if (typeof window !== 'undefined' && window.MappAICausalCore) return window.MappAICausalCore;
      if (typeof module !== 'undefined' && module.exports) return require('./mappai-causal-core.js');
    } catch (e) { }
    return null;
  }

  // Gruppo di equivalenza di un connettivo — FONTE UNICA in mappai-causal-core.js
  // (connGroup), riusata anche dal grading server di MappAI Live via connEquivalents.
  function _connGroupOf(s) {
    const C = _causal();
    return (C && C.connGroup) ? C.connGroup(s) : null;
  }

  // Match per i buchi: connettivo → stesso gruppo di equivalenza (o refuso del
  // connettivo atteso); concetto → isCloseMatch storico. Drop-in per isCloseMatch.
  function isConnMatch(answer, expected) {
    const ge = _connGroupOf(expected);
    if (ge) {
      if (isCloseMatch(answer, expected)) return true;
      return _connGroupOf(answer) === ge;
    }
    return isCloseMatch(answer, expected);
  }

  // Hash deterministico di una stringa → intero non negativo (per shuffle seedati).
  function _hash(s) {
    let h = 0; s = String(s);
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  // Shuffle deterministico (Fisher-Yates guidato da un PRNG seedato) → stessa
  // disposizione a parità di seed, ma la soluzione non è mai in posizione fissa.
  function _seededShuffle(arr, seed) {
    const a = arr.slice(); let s = _hash(seed) || 1;
    const rnd = () => { s = (Math.imul(1103515245, s) + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  // Distrattori per un buco-CONCETTO: altre etichette-nodo, escluse quelle uguali
  // o già presenti nel testo (sarebbero visibili come indizio). Preferisce lunghezza
  // simile; rotazione seedata per varietà fra somministrazioni.
  function _conceptDistractors(correct, pool, text, n, seed) {
    const cN = normalize(correct), tN = normalize(text);
    const seen = {};
    const cand = [];
    for (const p of (pool || [])) {
      const s = String(p || '').trim();
      const nn = normalize(s);
      if (!s || nn === cN || seen[nn]) continue;
      if (tN.indexOf(nn) >= 0) continue;            // già nella frase → no
      seen[nn] = 1; cand.push(s);
    }
    cand.sort((a, b) => Math.abs(a.length - correct.length) - Math.abs(b.length - correct.length));
    const top = cand.slice(0, Math.max(n * 3, 6));  // rosa dei più simili
    const off = top.length ? _hash(seed) % top.length : 0;
    const out = [];
    for (let i = 0; i < top.length && out.length < n; i++) out.push(top[(off + i) % top.length]);
    return out;
  }
  // Distrattori per un buco-RELAZIONE: connettivi della STESSA CLASSE grammaticale
  // (stanno nello stesso slot sintattico → non risolvibili per pura sintassi) ma di
  // FAMIGLIE diverse (relazioni distinte). Se la classe non ha ≥2 alternative di altra
  // famiglia (es. le congiunzioni causali sono tutte trasformazione) → [] e il buco
  // viene scartato in modalità scelta: meglio nessuna scelta che una banale.
  function _connDistractors(correct, n, seed) {
    const C = _causal();
    if (!C || !C.CONNECTIVES || !C.connGroup) return [];
    const cg = (C.connGroup(correct) || '').split('|');
    const correctFam = cg[1], correctCls = cg[2] || '';
    const seenFam = {}; if (correctFam) seenFam[correctFam] = 1;
    const seen = {}; seen[normalize(correct)] = 1;
    const cand = [];
    for (const c of C.CONNECTIVES) {
      if (c.answerOnly) continue;
      if ((c.cls || '') !== correctCls) continue;   // STESSA classe → grammaticalmente plausibile
      if (seenFam[c.family]) continue;              // una voce per FAMIGLIA diversa
      const nn = normalize(c.conn);
      if (seen[nn]) continue;
      seenFam[c.family] = 1; seen[nn] = 1; cand.push(c.conn);
    }
    const off = cand.length ? _hash(seed) % cand.length : 0;
    const out = [];
    for (let i = 0; i < cand.length && out.length < n; i++) out.push(cand[(off + i) % cand.length]);
    return out;
  }

  // Uniforma la CASE delle opzioni (Title Case): la soluzione è la superficie nel
  // testo (spesso minuscola a metà frase), i distrattori sono etichette-nodo (Title
  // Case) → senza uniformare, l'opzione minuscola tradiva la soluzione. Il grading
  // è case-insensitive (normalize) quindi non cambia. Preposizioni/articoli interni
  // restano minuscoli per leggibilità.
  const _TITLE_LOWER = { di: 1, del: 1, dello: 1, della: 1, dei: 1, degli: 1, delle: 1, da: 1, a: 1, e: 1, ed: 1, o: 1, il: 1, lo: 1, la: 1, i: 1, gli: 1, le: 1, in: 1, con: 1, su: 1, per: 1, tra: 1, fra: 1, of: 1, the: 1, and: 1, to: 1 };
  function _titleCase(s) {
    const w = String(s || '').trim().split(/\s+/);
    return w.map((word, i) => {
      const lw = word.toLowerCase();
      if (i > 0 && _TITLE_LOWER[lw]) return lw;
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  }

  // Costruisce un cloze: oscura fino a `max` termini (interi, con confini di parola).
  // Ritorna { segments:[{text}|{blank}], blanks:[termine...] }.
  // opts.seed (numero o stringa) → VARIA quali termini vengono oscurati tra somministrazioni,
  // restando deterministico a parità di seed (riproducibile per il ripasso). Senza seed:
  // comportamento storico (i termini più lunghi/specifici, primi `max`).
  // opts.connectives → aggiunge AL MASSIMO UN buco-connettivo per item (1 relazione
  // + concetti): i blanks restano stringhe → consumer esistenti intatti; la
  // correzione va fatta con isConnMatch (accetta gli equivalenti).
  function makeCloze(desc, terms, opts) {
    const max = (opts && opts.max) || 3;
    const text = String(desc || '');
    const sorted = [...new Set(terms.map(t => String(t || '').trim()).filter(t => t.length >= 4))]
      .sort((a, b) => b.length - a.length); // specifici prima
    // Raccogli TUTTI i candidati non sovrapposti (non solo i primi `max`): sono mutuamente
    // disgiunti per costruzione greedy → qualunque loro sottoinsieme è valido.
    const cap = Math.max(max, 12);
    const cands = [];

    // Concetti PRIMA: sono i blank primari, e il connettivo non deve ritagliarsi
    // uno spezzone DENTRO l'occorrenza di un'etichetta (label tipo «Portò alla
    // caduta» citata nella desc → il concetto resta intero, il connettivo cede).
    for (const term of sorted) {
      if (cands.length >= cap) break;
      let re;
      try { re = new RegExp('(?<![\\p{L}\\p{N}])' + escapeRegex(term) + '(?![\\p{L}\\p{N}])', 'iu'); }
      catch (e) { re = new RegExp('\\b' + escapeRegex(term) + '\\b', 'i'); }
      const m = re.exec(text);
      if (!m) continue;
      const start = m.index, end = start + m[0].length;
      if (cands.some(x => start < x.end && end > x.start)) continue; // niente sovrapposizioni
      cands.push({ start, end, term: text.slice(start, end) });
    }

    // Candidato connettivo (al massimo uno, il primo nel testo che non tocca
    // un concetto). Rifilo con [\s,]: la virgola consumata da «quindi,» non
    // deve finire dentro il buco. answerOnly = solo grading, mai candidato.
    let connCand = null;
    if (opts && opts.connectives) {
      const C = _causal();
      if (C && C.CONNECTIVES) {
        for (const c of C.CONNECTIVES) {
          if (c.answerOnly) continue;
          const m = c.re.exec(text);
          if (!m) continue;
          const lead = /^[\s,]*/.exec(m[0])[0].length;
          const trail = /[\s,]*$/.exec(m[0])[0].length;
          const start = m.index + lead, end = m.index + m[0].length - trail;
          if (end - start < 4) continue;   // superfici rifilate troppo corte: mai
          if (cands.some(x => start < x.end && end > x.start)) continue;
          if (!connCand || start < connCand.start) connCand = { start, end, term: text.slice(start, end), isConn: true };
        }
      }
    }

    // Selezione dei `max` da oscurare: il buco-connettivo (se c'è) è SEMPRE dentro;
    // sul resto, rotazione seedata (default = primi `max`), come da storico.
    const connPick = connCand ? [connCand] : [];
    const concept = cands;
    const room = Math.max(0, max - connPick.length);
    let picked;
    if (opts && opts.seed != null && concept.length > room) {
      let h = 0; const s = String(opts.seed);
      for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
      const off = ((h % concept.length) + concept.length) % concept.length;
      picked = [];
      for (let i = 0; i < room; i++) picked.push(concept[(off + i) % concept.length]);
    } else {
      picked = concept.slice(0, room);
    }
    // Spaziatura minima fra buchi: due blank separati da pochissimo testo (una
    // lista «A, B, C» tutta oscurata) sono impossibili da completare senza contesto.
    // I CONCETTI sono primari (mai sacrificati): li spazia fra loro. Il buco-
    // relazione è opportunistico — aggiunto SOLO se non fiancheggia (entro MIN_GAP)
    // un concetto tenuto. Così «concetto CONN concetto» conserva i due concetti e
    // scarta il connettivo, invece di collassare al solo connettivo (→ item perso).
    const MIN_GAP = 6;
    const keptConcepts = [];
    let lastEnd = -Infinity;
    for (const mm of picked.slice().sort((a, b) => a.start - b.start)) {
      if (mm.start - lastEnd >= MIN_GAP) { keptConcepts.push(mm); lastEnd = mm.end; }
    }
    let kept = keptConcepts;
    const conn = connPick[0];
    if (conn) {
      const clash = keptConcepts.some(c => (conn.end + MIN_GAP > c.start) && (c.end + MIN_GAP > conn.start));
      if (!clash) kept = keptConcepts.concat([conn]);
    }
    let matches = kept.slice().sort((a, b) => a.start - b.start);
    // Modalità A SCELTA (issue: stress tastiera + sinonimi): per ogni buco 3 opzioni
    // (soluzione + 2 distrattori) da toccare. Concetti → altre etichette-nodo;
    // connettivi → connettivi di ALTRE famiglie (testa il tipo di relazione).
    // Se un buco non trova 2 distrattori → scartato in modalità scelta (niente
    // campo digitato misto). Deterministico e seedato.
    if (opts && opts.choices) {
      matches = matches.map(mm => {
        const distr = mm.isConn
          ? _connDistractors(mm.term, 2, (opts.seed || '') + ':' + mm.start)
          : _conceptDistractors(mm.term, terms, text, 2, (opts.seed || '') + ':' + mm.start);
        if (distr.length < 2) return null;
        // Title Case uniforme su TUTTE le opzioni (soluzione compresa) → niente tell
        // di maiuscola/minuscola. Grading resta case-insensitive.
        mm.choices = _seededShuffle([mm.term].concat(distr).map(_titleCase), (opts.seed || '') + ':opt:' + mm.start);
        return mm;
      }).filter(Boolean);
    }
    const segments = [];
    let pos = 0;
    for (const mm of matches) {
      if (mm.start > pos) segments.push({ text: text.slice(pos, mm.start) });
      const seg = mm.isConn ? { blank: mm.term, isConn: true } : { blank: mm.term };
      if (mm.choices) seg.choices = mm.choices;
      segments.push(seg);
      pos = mm.end;
    }
    if (pos < text.length) segments.push({ text: text.slice(pos) });
    // connCount: il player distingue i buchi-relazione (gate, larghezza, hint)
    return { segments, blanks: matches.map(m => m.term), connCount: matches.filter(m => m.isConn).length };
  }

  // Punteggio di UN buco cloze: 1 (match), 0.5 (prefisso di un termine multi-parola:
  // «pianta» per «pianta acquatica» → manca «acquatica»), 0 altrimenti. Il buco-
  // relazione (isConn/accept) non ha credito parziale (è una parola sola). Ritorna
  // { score, missing } — `missing` = complemento mancante (parole originali).
  function clozeBlankScore(given, expected, opts) {
    // modalità A SCELTA: match ESATTO normalizzato, niente fuzzy/equivalenti/½
    if (opts && opts.choices) return { score: normalize(given) === normalize(expected) ? 1 : 0, missing: '' };
    const full = (opts && opts.conn) ? isConnMatch(given, expected) : isCloseMatch(given, expected);
    if (full) return { score: 1, missing: '' };
    if (opts && opts.conn) return { score: 0, missing: '' }; // niente parziale sui connettivi
    // parziale: prefisso allineato a confine di parola su termine multi-parola
    const eWords = String(expected || '').trim().split(/\s+/);
    if (eWords.length < 2) return { score: 0, missing: '' };
    const gNorm = normalize(given);
    if (!gNorm) return { score: 0, missing: '' };
    // il prefisso deve contenere ALMENO una parola di contenuto (non solo articoli/
    // preposizioni): scrivere «il» per «Il Rinascimento» non è mezzo concetto.
    if (gNorm.split(' ').every(w => CLOZE_STOPWORDS[w])) return { score: 0, missing: '' };
    for (let k = 1; k < eWords.length; k++) {
      if (normalize(eWords.slice(0, k).join(' ')) === gNorm) {
        return { score: 0.5, missing: eWords.slice(k).join(' ') };
      }
    }
    return { score: 0, missing: '' };
  }
  // Parole-funzione (IT/EN) — un prefisso fatto solo di queste non vale mezzo punto.
  const CLOZE_STOPWORDS = {
    il: 1, lo: 1, la: 1, i: 1, gli: 1, le: 1, un: 1, uno: 1, una: 1, l: 1,
    di: 1, del: 1, dello: 1, della: 1, dei: 1, degli: 1, delle: 1,
    a: 1, al: 1, allo: 1, alla: 1, ai: 1, agli: 1, alle: 1, e: 1, ed: 1, o: 1,
    the: 1, an: 1, of: 1, and: 1, or: 1, to: 1
  };

  const CORE = { normalize, levenshtein, isCloseMatch, isConnMatch, clozeBlankScore, makeCloze };
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;
  window.MappAIClozeCore = CORE; // MappAI Live riusa makeCloze per generare cloze scoped

  // ─────────────────────────── LAYER BROWSER ───────────────────────────
  function S() { try { return (typeof appState !== 'undefined') ? appState : window.appState; } catch (e) { return window.appState; } }
  function clean(s) { return window.cleanLabel ? window.cleanLabel(s) : String(s || '').trim(); }
  function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function toast(m) { try { if (window.showToast) return window.showToast(m, 'info'); } catch (e) {} }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  const CZ = window.MappAICloze = { _items: null, _i: 0 };

  function buildSession() {
    const nodes = (S() && S().db && S().db.nodes) || [];
    const labels = nodes.map(n => ({ id: n.id, label: clean(n.label) })).filter(x => x.label.length >= 4);
    // Seed per-sessione → buchi diversi a ogni ripasso in-app (stabili entro la sessione)
    const seed = (typeof window !== 'undefined' && window.quizNonce) ? window.quizNonce() : String(Date.now());
    const items = [];
    const seenBlanks = new Set();   // dedup: due nodi che oscurano gli STESSI termini → 1 sola volta
    nodes.forEach(n => {
      if (n.level === 0) return;
      const desc = (n.desc || n.content || '').trim();
      if (desc.length < 40) return;
      const others = labels.filter(x => x.id !== n.id).map(x => x.label);
      // connectives: true → max 1 buco-relazione («perché/quindi/invece di») per
      // item, corretto con isConnMatch (gli equivalenti valgono). Con le regole di
      // accessibilità desc i connettivi sono sempre più presenti → più buchi utili.
      const cz = makeCloze(desc, others, { max: 3, seed: seed + ':' + n.id, connectives: true });
      // Gate: almeno UN buco-concetto — un item col solo connettivo registrerebbe
      // padronanza 0/1 secca sul nodo basata su una parola-funzione.
      if ((cz.blanks.length - (cz.connCount || 0)) < 1) return;
      const sig = cz.blanks.map(b => normalize(b)).sort().join('|');
      if (seenBlanks.has(sig)) return;   // stesso set di buchi già presente → salta il doppione
      seenBlanks.add(sig);
      items.push({ nodeId: n.id, label: clean(n.label), cloze: cz });
    });
    return shuffle(items).slice(0, 12);
  }

  CZ.start = function () {
    if (!S() || !(S().db && S().db.nodes && S().db.nodes.length)) { toast('Apri una mappa per il Cloze.'); return; }
    const items = buildSession();
    if (!items.length) { toast('Nessuna descrizione con concetti collegati da oscurare in questa mappa.'); return; }
    CZ._items = items; CZ._i = 0;
    if (window.MappAIStudyBus) window.MappAIStudyBus.begin('cloze', 'Cloze — completa');
    renderItem();
  };

  function renderItem() {
    document.getElementById('cz-modal')?.remove();
    const item = CZ._items[CZ._i];
    const total = CZ._items.length;
    CZ._nodeStart = Date.now(); // cronometro per la fluenza (corrette/min)

    let body = '';
    let bi = 0;
    const ariaLbl = window.t ? window.t('cz_blank_aria', 'Spazio da completare') : 'Spazio da completare';
    item.cloze.segments.forEach(seg => {
      if (seg.text != null) body += esc(seg.text);
      else {
        // buco-relazione: più largo (gli equivalenti validi arrivano a ~14 char,
        // es. «di conseguenza» per «quindi») e bordo ambra per distinguerlo
        const w = seg.isConn ? Math.max(150, seg.blank.length * 11) : Math.max(60, seg.blank.length * 11);
        const border = seg.isConn ? '#d97706' : '#6366f1';
        const bg = seg.isConn ? '#fef3c7' : '#eef2ff';
        body += `<input class="cz-blank" data-bi="${bi}"${seg.isConn ? ' data-conn="1"' : ''} aria-label="${esc(ariaLbl)} ${bi + 1}" autocomplete="off" spellcheck="false" style="width:${w}px;display:inline-block;border:none;border-bottom:2px solid ${border};background:${bg};border-radius:4px;padding:1px 6px;font:inherit;color:#3730a3;margin:0 2px">`;
        bi++;
      }
    });
    // hint: nel buco-relazione valgono anche i sinonimi della stessa relazione
    const connHint = item.cloze.connCount
      ? `<div style="font-size:12px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:6px 10px;margin-bottom:8px">${esc(window.t ? window.t('cz_conn_hint', 'Nel riquadro ambra va la PAROLA-LEGAME: valgono anche i sinonimi (es. «poiché» per «perché»).') : 'Nel riquadro ambra va la PAROLA-LEGAME: valgono anche i sinonimi (es. «poiché» per «perché»).')}</div>`
      : '';

    const modal = document.createElement('div');
    modal.id = 'cz-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;padding:16px';
    modal.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:620px;width:100%;max-height:88vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);padding:22px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i data-lucide="pencil-line" style="width:20px;height:20px;color:#4f46e5"></i><b style="color:#0f172a;font-size:16px">Cloze — completa</b><span style="margin-left:auto;color:#94a3b8;font-size:13px">${CZ._i + 1} / ${total}</span></div>
        <div style="font-weight:700;color:#4f46e5;font-size:14px;margin-bottom:10px">${esc(item.label)}</div>
        ${connHint}
        <div style="font-size:15px;color:#1e293b;line-height:2">${body}</div>
        <div id="cz-fb" style="display:none;margin-top:12px;font-size:13.5px"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">
          <button id="cz-exit" style="background:#f1f5f9;color:#334155;border:0;border-radius:10px;padding:9px 14px;cursor:pointer;font-weight:600">Esci</button>
          <button id="cz-check" style="background:#4f46e5;color:#fff;border:0;border-radius:10px;padding:9px 16px;cursor:pointer;font-weight:600">Verifica</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    if (window.safeCreateIcons) window.safeCreateIcons();
    modal.querySelector('#cz-exit').onclick = () => {
      modal.remove();
      if (window.MappAIStudyBus) window.MappAIStudyBus.end(); // salva la sessione parziale (se ha risultati)
    };
    modal.querySelector('#cz-check').onclick = () => checkItem(modal, item);
    const first = modal.querySelector('.cz-blank'); if (first) first.focus();
  }

  function checkItem(modal, item) {
    const inputs = [...modal.querySelectorAll('.cz-blank')];
    let scoreSum = 0, fullOk = 0;
    inputs.forEach((inp, i) => {
      const expected = item.cloze.blanks[i];
      const isConn = !!inp.dataset.conn;
      const r = clozeBlankScore(inp.value, expected, { conn: isConn }); // 1 | 0.5 (prefisso) | 0
      scoreSum += r.score;
      if (r.score === 1) fullOk++;
      // colore: verde pieno / ambra parziale / rosso
      const col = r.score === 1 ? ['#16a34a', '#dcfce7', '#166534']
        : r.score === 0.5 ? ['#d97706', '#fef3c7', '#92400e']
          : ['#dc2626', '#fee2e2', '#991b1b'];
      inp.style.borderBottomColor = col[0]; inp.style.background = col[1]; inp.style.color = col[2];
      inp.disabled = true;
      // Annotazione FUORI dall'input (l'input tiene solo ciò che ha scritto lo
      // studente): niente troncamento nel campo a larghezza fissa, e testo-mio vs
      // sistema restano distinti.
      let note = '';
      if (r.score === 0.5) note = '<span style="color:#92400e"> ✎ manca: <b>' + esc(r.missing) + '</b></span>';
      else if (r.score === 0) note = '<span style="color:#991b1b"> ✗ giusto: <b>' + esc(expected) + '</b></span>';
      else if (isConn && !isCloseMatch(inp.value, expected)) note = '<span style="color:#166534"> ✓ (= ' + esc(expected) + ')</span>';
      if (note) {
        const span = document.createElement('span');
        span.style.cssText = 'font-size:12px;white-space:nowrap';
        span.innerHTML = note;
        inp.insertAdjacentElement('afterend', span);
      }
    });
    const total = inputs.length;
    const score = total ? scoreSum / total : 0;
    const ok = fullOk;   // per la fluenza conta solo il pieno
    // fluenza: corrette/min su questo nodo (minimo 2s per non gonfiare il rate)
    const elapsedMin = Math.max((Date.now() - (CZ._nodeStart || Date.now())) / 60000, 2 / 60);
    const rate = ok / elapsedMin;

    // registra la padronanza (attività 'cloze') con accuratezza + fluenza;
    // via StudyBus finisce anche in sessioni.jsonl per la meta-analisi docente
    try {
      if (window.MappAIStudyBus) {
        window.MappAIStudyBus.record(item.nodeId, item.label, 'cloze', { score, rate });
      } else if (window.MappAIMastery && window.MappAIMastery.record) {
        window.MappAIMastery.record(item.nodeId, item.label, 'cloze', { score, rate });
      }
    } catch (e) { console.warn('[Cloze] record', e); }

    const fb = modal.querySelector('#cz-fb');
    fb.style.display = 'block';
    const scoreLbl = Number.isInteger(scoreSum) ? String(scoreSum) : scoreSum.toFixed(1);
    fb.innerHTML = `<b style="color:${score === 1 ? '#15803d' : '#b45309'}">${scoreLbl}/${total} punti</b>${score === 1 ? '' : ' — in ambra il mezzo punto (concetto incompleto), in rosso la risposta giusta.'}`;
    const isLast = CZ._i >= CZ._items.length - 1;
    const btn = modal.querySelector('#cz-check');
    btn.textContent = isLast ? 'Fine' : 'Avanti →';
    btn.onclick = () => {
      modal.remove();
      if (isLast) { if (window.MappAIStudyBus) window.MappAIStudyBus.end(); toast('Cloze completato! Padronanza aggiornata.'); }
      else { CZ._i++; renderItem(); }
    };
  }

  // Bottone fluttuante di avvio
  function injectBtn() {
    // Spostato nel launcher Studio attivo: il flottante torna solo in modalità legacy.
    if (localStorage.getItem('mappai_legacy_float_btns') !== '1') return;
    if (document.getElementById('cz-btn')) return;
    const b = document.createElement('button');
    b.id = 'cz-btn';
    b.title = 'Cloze — completa le definizioni';
    b.innerHTML = '<i data-lucide="pencil-line" style="width:20px;height:20px"></i>';
    b.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9996;width:48px;height:48px;border-radius:50%;border:1.5px solid #4f46e5;background:#fff;color:#4f46e5;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 6px 18px -6px rgba(79,70,229,.5)';
    b.onclick = () => CZ.start();
    document.body.appendChild(b);
    if (window.safeCreateIcons) window.safeCreateIcons();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectBtn);
  else injectBtn();

  console.log('[Cloze] modo cloze (graph-aware) caricato');
})();
