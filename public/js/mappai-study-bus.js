/*
 * mappai-study-bus.js — Punto UNICO di registrazione dei risultati di studio
 * --------------------------------------------------------------------------
 * Ogni attività (cloze, palazzo, quiz, dungeon, …) chiama il bus invece di
 * parlare direttamente con lo store di padronanza: il bus smista a
 *   1) MappAIMastery.record  → padronanza EWMA per pinpoint (sempre)
 *   2) sessioni.jsonl        → record di sessione per la meta-analisi docente
 *      (stesso formato di mappai-active-study.saveStudyScore → analyzeSessions)
 * Prima del bus solo lo Studio Attivo scriveva sessioni: Tier 6 (celeration)
 * e fluenza erano ciechi su cloze/palazzo/dungeon/quiz.
 *
 * Uso:  MappAIStudyBus.begin('cloze', 'Cloze — completa');
 *       MappAIStudyBus.record(nodeId, label, 'cloze', { score: 0..1, rate });
 *       MappAIStudyBus.end();            // scrive la sessione (se ha entries)
 *
 * Modulo UMD: CORE puro (buildSessionRecord) testabile in Node.
 * Caricare in index.html DOPO mappai-mastery.js e PRIMA delle attività.
 */
(function () {
  'use strict';

  const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));
  const pad2 = (n) => String(n).padStart(2, '0');

  // CORE puro: da una sessione accumulata → { dateStr, markdownLine, jsonRecord }.
  // cur = { activity, modeTitle, project, startedAt, entries:[{nodeId,label,score,rate}] }
  function buildSessionRecord(cur, nowTs) {
    const now = new Date(nowTs || Date.now());
    const dateStr = `${pad2(now.getDate())}-${pad2(now.getMonth() + 1)}-${now.getFullYear()}`;
    const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    const entries = (cur.entries || []).map(e => {
      const out = {
        nodeId: e.nodeId,
        label: e.label || '',
        accuracy: Math.round(100 * clamp01(e.score)),
        isCorrect: clamp01(e.score) >= 0.6
      };
      if (typeof e.rate === 'number' && isFinite(e.rate)) out.rate = Math.round(e.rate * 10) / 10;
      return out;
    });
    const total = entries.length;
    const ok = entries.filter(e => e.isCorrect).length;
    const accuracy = total ? Math.round(entries.reduce((s, e) => s + e.accuracy, 0) / total) : 0;
    const durationSec = cur.startedAt ? Math.max(1, Math.round((now.getTime() - cur.startedAt) / 1000)) : null;
    const project = cur.project || 'Mappa';
    const modeTitle = cur.modeTitle || cur.activity;
    let md = `- **${timeStr}** · ${modeTitle} · "${project}" · **${ok}/${total}** (${accuracy}%)\n`;
    const jsonRecord = {
      timestamp: now.toISOString(), date: dateStr, time: timeStr,
      mode: cur.activity, modeTitle: modeTitle, project: project,
      score: ok, total: total, accuracy: accuracy,
      durationSec: durationSec,
      entries: entries
    };
    return { dateStr, markdownLine: md, jsonRecord };
  }

  const CORE = { clamp01, buildSessionRecord };
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;

  // ─────────────────────────── LAYER BROWSER ───────────────────────────
  function S() { try { return (typeof appState !== 'undefined') ? appState : window.appState; } catch (e) { return window.appState; } }

  const BUS = window.MappAIStudyBus = Object.assign({}, CORE, {
    _cur: null,

    // Apre una sessione. Se ce n'è una aperta con risultati, la chiude prima
    // (nessun dato perso se un'attività dimentica end()).
    begin(activity, modeTitle) {
      if (this._cur && this._cur.entries.length) { try { this.end(); } catch (e) {} }
      this._cur = {
        activity: activity,
        modeTitle: modeTitle || activity,
        project: (S() && S().rootNodeLabel) || 'Mappa',
        startedAt: Date.now(),
        entries: []
      };
    },

    // Registra un risultato: SEMPRE nella padronanza; nella sessione corrente
    // se begin() è attivo (le sotto-attività — es. dungeon_gate dentro la sessione
    // 'dungeon' — confluiscono nella stessa sessione).
    record(nodeId, label, activity, opts) {
      const o = opts || {};
      try {
        if (window.MappAIMastery && window.MappAIMastery.record) {
          window.MappAIMastery.record(nodeId, label, activity, o);
        }
      } catch (e) { console.warn('[StudyBus] mastery', e); }
      if (this._cur) {
        this._cur.entries.push({ nodeId: nodeId, label: label, score: o.score, rate: o.rate });
      }
    },

    // Chiude la sessione e la scrive nel vault (Studio Attivo/sessioni.jsonl).
    // Senza electronAPI (iPad) la padronanza resta comunque registrata.
    async end() {
      const cur = this._cur; this._cur = null;
      if (!cur || !cur.entries.length) return null;
      const rec = buildSessionRecord(cur);
      try {
        if (window.electronAPI && window.electronAPI.saveStudyRecord) {
          const r = await window.electronAPI.saveStudyRecord({
            vaultPath: (S() && S().activeVaultPath) || null,
            dateStr: rec.dateStr, markdownLine: rec.markdownLine, jsonRecord: rec.jsonRecord
          });
          if (r && r.error) console.warn('[StudyBus] saveStudyRecord', r.error);
        }
      } catch (e) { console.warn('[StudyBus] end', e); }
      return rec.jsonRecord;
    },

    // Butta la sessione corrente senza scriverla (per gli annulla espliciti).
    abort() { this._cur = null; }
  });

  console.log('[StudyBus] bus risultati di studio caricato');
})();
