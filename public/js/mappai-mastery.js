/*
 * mappai-mastery.js — Store di PADRONANZA per pinpoint (keystone Precision Teaching)
 * ---------------------------------------------------------------------------------
 * Pinpoint = nodo × tipo-attività. Per ognuno tiene una padronanza come media
 * mobile esponenziale (EWMA) dell'accuratezza (+ rate opzionale per la fluenza).
 * È la base su cui poggiano Mastery-gating, Precursor-path e Precision Teaching:
 * senza uno stato per-concetto persistente, quelle attività non hanno cosa misurare.
 *
 * Modulo UMD: il CORE è puro (EWMA, chiavi, aggregazione) → testabile in Node.
 * Il layer browser (window.MappAIMastery) aggiunge persistenza localStorage +
 * ingest dei record di sessione prodotti da mappai-active-study.js (saveStudyScore).
 *
 * Caricare in index.html DOPO app.js e PRIMA di mappai-active-study.js.
 */
(function () {
  'use strict';

  // ───────────────────────────── CORE PURO ─────────────────────────────
  const ALPHA = 0.35; // reattività EWMA (stesso valore del tutor Grillo di Cervellone)
  const FLUENCY_AIM = 8; // corrette/min di default: soglia della fase FLUENZA (configurabile)

  const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));

  // EWMA per l'ACCURATEZZA (clampata 0..1): prima misura = il valore stesso.
  function ewma(prev, x, alpha) {
    const a = (alpha == null) ? ALPHA : alpha;
    const v = clamp01(x);
    if (prev == null) return v;
    return clamp01(prev * (1 - a) + v * a);
  }

  // EWMA per il RATE/fluenza (corrette/min): NON clampata — è una frequenza, non una probabilità.
  function ewmaRaw(prev, x, alpha) {
    const a = (alpha == null) ? ALPHA : alpha;
    const v = Number(x) || 0;
    if (prev == null) return v;
    return prev * (1 - a) + v * a;
  }

  function pinpointKey(nodeId, activity) {
    return String(nodeId) + '::' + String(activity);
  }

  // Applica un risultato a uno store semplice (oggetto). Ritorna la riga aggiornata.
  // result = { nodeId, label?, activity, score(0..1), rate?(num/min), ts? }
  function applyResult(store, result) {
    const ts = result.ts || Date.now();
    const key = pinpointKey(result.nodeId, result.activity);
    const prev = store[key] || null;
    const accuracy = ewma(prev ? prev.accuracy : null, clamp01(result.score));
    const rate = (result.rate != null)
      ? ewmaRaw(prev && prev.rate != null ? prev.rate : null, result.rate, ALPHA)
      : (prev ? prev.rate : null);
    const row = {
      nodeId: result.nodeId,
      activity: result.activity,
      label: result.label || (prev && prev.label) || '',
      accuracy,
      rate,
      attempts: (prev ? prev.attempts : 0) + 1,
      lastTs: ts,
      history: (prev ? prev.history : []).concat([{ ts, acc: accuracy, rate }])
    };
    store[key] = row;
    return row;
  }

  // Aggrega tutte le attività di un nodo → padronanza del concetto.
  // rate = media dei rate disponibili (null se nessuna attività cronometrata).
  function aggregateNode(store, nodeId) {
    const rows = Object.keys(store).map(k => store[k]).filter(r => String(r.nodeId) === String(nodeId));
    if (!rows.length) return null;
    const accSum = rows.reduce((s, r) => s + r.accuracy, 0);
    const rated = rows.filter(r => r.rate != null);
    return {
      nodeId,
      accuracy: accSum / rows.length,
      rate: rated.length ? rated.reduce((s, r) => s + r.rate, 0) / rated.length : null,
      attempts: rows.reduce((s, r) => s + r.attempts, 0),
      byActivity: rows
    };
  }

  // Padronanza a 2 FASI (Precision Teaching):
  //   'nuovo'     = mai provato
  //   'in-corso'  = acquisizione incompleta (accuracy < soglia)
  //   'acquisito' = accurato ma non (ancora) fluente
  //   'fluente'   = accurato E rate >= fluency aim
  function masteryLevel(row, opts) {
    const accThr = (opts && opts.accThr != null) ? opts.accThr : 0.8;
    const aim = (opts && opts.fluencyAim != null) ? opts.fluencyAim : FLUENCY_AIM;
    if (!row || !row.attempts) return 'nuovo';
    if (row.accuracy < accThr) return 'in-corso';
    if (row.rate != null && row.rate >= aim) return 'fluente';
    return 'acquisito';
  }

  const CORE = { ALPHA, FLUENCY_AIM, clamp01, ewma, ewmaRaw, pinpointKey, applyResult, aggregateNode, masteryLevel };

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;

  // ─────────────────────────── LAYER BROWSER ───────────────────────────
  if (typeof window === 'undefined') return;

  // Attività per numero di modo (mappai-active-study.js)
  const ACTIVITY_BY_MODE = {
    1: 'costruisci', 2: 'gerarchia', 3: 'richiamo', 4: 'spiega',
    5: 'intruso', 6: 'verbi', 7: 'sequenza'
  };

  function _getAppState() {
    try { return (typeof appState !== 'undefined') ? appState : window.appState; }
    catch (e) { return window.appState; }
  }
  function _vaultKey() {
    const st = _getAppState();
    const v = (st && (st.activeVaultPath || st.rootNodeLabel)) || 'default';
    return 'mappai_mastery::' + String(v);
  }
  function _load(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function _persist(key, store) {
    try { localStorage.setItem(key, JSON.stringify(store)); } catch (e) { /* quota/SSR */ }
  }
  // Risolve un id-nodo da un'etichetta (per gli entry che salvano solo la label).
  function _defaultResolve(label) {
    const st = _getAppState();
    const nodes = (st && st.db && st.db.nodes) || [];
    const clean = window.cleanLabel ? window.cleanLabel : (s) => String(s || '').trim();
    const target = clean(label).toLowerCase();
    const hit = nodes.find(n => clean(n.label).toLowerCase() === target);
    return hit ? hit.id : null;
  }

  let _key = null, _store = null;
  function _ensure() {
    const k = _vaultKey();
    if (k !== _key) { _key = k; _store = _load(k); }
    return _store;
  }

  window.MappAIMastery = Object.assign({}, CORE, {
    // Registra un singolo risultato (usato dalle attività di studio).
    record(nodeId, label, activity, opts) {
      const store = _ensure();
      const o = opts || {};
      CORE.applyResult(store, { nodeId, label, activity, score: o.score, rate: o.rate, ts: o.ts });
      _persist(_key, store);
    },
    // Padronanza aggregata di un nodo, e per (nodo,attività).
    node(nodeId) { return CORE.aggregateNode(_ensure(), nodeId); },
    pinpoint(nodeId, activity) { return _ensure()[CORE.pinpointKey(nodeId, activity)] || null; },
    level(nodeId, activity, opts) { return CORE.masteryLevel(this.pinpoint(nodeId, activity), opts); },

    // Ingest di un record di sessione (jsonRecord di saveStudyScore): estrae i
    // risultati per-nodo dai vari formati di entry e li registra. Ritorna #registrati.
    ingestSession(rec, resolveNodeId) {
      if (!rec || !Array.isArray(rec.entries) || !rec.entries.length) return 0;
      const activity = ACTIVITY_BY_MODE[rec.mode] || ('modo' + rec.mode);
      const resolve = resolveNodeId || _defaultResolve;
      const ts = rec.timestamp ? Date.parse(rec.timestamp) : Date.now();
      let n = 0;
      rec.entries.forEach(e => {
        let nodeId = (e.nodeId != null) ? e.nodeId : null;
        const label = e.label || e.correct || e.target || null;   // mode3:correct, mode6:target
        if (nodeId == null && label) nodeId = resolve(label);
        if (nodeId == null) return;
        let score;
        if (typeof e.accuracy === 'number') score = e.accuracy > 1 ? e.accuracy / 100 : e.accuracy;
        else if (typeof e.isCorrect === 'boolean') score = e.isCorrect ? 1 : 0;
        else return;
        this.record(nodeId, label || '', activity, { score, ts });
        n++;
      });
      return n;
    },

    all() { return _ensure(); },
    clear() { const k = _vaultKey(); _key = k; _store = {}; _persist(k, _store); }
  });

  console.log('[MappAIMastery] store padronanza per pinpoint caricato');
})();
