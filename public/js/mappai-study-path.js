/*
 * mappai-study-path.js — "Cosa studiare ora" (Precursor + Mastery-rimedio)
 * ------------------------------------------------------------------------
 * Un solo pannello che risponde a "da dove parto / cosa ripasso", unendo due principi:
 *   • PRECURSOR/PREREQUISITO  → "Pronti": concetti nuovi il cui prerequisito
 *     (il genitore nell'albero) è già padroneggiato. Gating SOFT: consiglia, non blocca.
 *   • MASTERY-RIMEDIO         → "Da rivedere": concetti studiati ma deboli (in-corso)
 *     o padroneggiati ma stantii (non ripassati da N giorni → decadimento).
 *   • "Padroneggiati"         → già acquisiti/fluenti e recenti.
 *
 * Legge la padronanza da MappAIMastery. CORE puro (buildParentMap, classify)
 * testabile in Node. Caricare DOPO mappai-mastery.js.
 */
(function () {
  'use strict';

  // ───────────────────────────── CORE PURO ─────────────────────────────
  const lid = (x) => (x && typeof x === 'object') ? x.id : x;
  const isMastered = (lvl) => lvl === 'acquisito' || lvl === 'fluente';

  // Genitore = estremo dell'arco col livello inferiore (albero gerarchico).
  function buildParentMap(nodes, links) {
    const lvl = {};
    (nodes || []).forEach(n => { lvl[n.id] = n.level; });
    const parentOf = {};
    (links || []).forEach(l => {
      const s = lid(l.source), t = lid(l.target);
      if (lvl[s] != null && lvl[t] != null && lvl[s] < lvl[t]) parentOf[t] = s;
    });
    return parentOf;
  }

  // Classifica i nodi. masteryFn(id) → { level, attempts, lastTs }.
  function classify(ids, parentOf, masteryFn, opts) {
    const now = (opts && opts.now) || Date.now();
    const staleMs = ((opts && opts.staleDays != null) ? opts.staleDays : 7) * 86400000;
    const out = { ready: [], review: [], mastered: [], locked: [] };
    (ids || []).forEach(id => {
      const m = masteryFn(id) || { level: 'nuovo', attempts: 0, lastTs: 0 };
      if (isMastered(m.level)) {
        if (m.lastTs && (now - m.lastTs) > staleMs) out.review.push({ id, reason: 'stale', level: m.level });
        else out.mastered.push({ id, level: m.level });
      } else if (m.attempts > 0) {
        out.review.push({ id, reason: 'weak', level: m.level });      // in-corso
      } else {
        const p = parentOf[id];
        const parentMastered = !p || isMastered((masteryFn(p) || {}).level);
        if (parentMastered) out.ready.push({ id, level: 'nuovo' });
        else out.locked.push({ id, parent: p });
      }
    });
    return out;
  }

  const CORE = { buildParentMap, classify };
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;

  // ─────────────────────────── LAYER BROWSER ───────────────────────────
  function S() { try { return (typeof appState !== 'undefined') ? appState : window.appState; } catch (e) { return window.appState; } }
  function clean(s) { return window.cleanLabel ? window.cleanLabel(s) : String(s || '').trim(); }
  function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function toast(m) { try { if (window.showToast) return window.showToast(m, 'info'); } catch (e) {} }

  function masteryFn(id) {
    const MM = window.MappAIMastery;
    const agg = (MM && typeof MM.node === 'function') ? MM.node(id) : null;
    if (!agg || !agg.attempts) return { level: 'nuovo', attempts: 0, lastTs: 0 };
    const level = (typeof MM.masteryLevel === 'function')
      ? MM.masteryLevel({ attempts: agg.attempts, accuracy: agg.accuracy, rate: agg.rate })
      : (agg.accuracy >= 0.8 ? 'acquisito' : 'in-corso');
    const lastTs = agg.byActivity.reduce((m, r) => Math.max(m, r.lastTs || 0), 0);
    return { level, attempts: agg.attempts, lastTs };
  }

  function studiableNodes() {
    const nodes = (S() && S().db && S().db.nodes) || [];
    return nodes.filter(n => n.level !== 0); // escludi il root
  }

  function focusNode(id) {
    const node = ((S() && S().db && S().db.nodes) || []).find(n => n.id === id);
    try {
      if (node && typeof window.simulateNodeClick === 'function') return window.simulateNodeClick(node);
      if (typeof window.zoomToNode === 'function') return window.zoomToNode(id);
    } catch (e) { console.warn('[StudyPath] focus', e); }
  }

  const DOT = { 'nuovo': '#9ca3af', 'in-corso': '#d97706', 'acquisito': '#16a34a', 'fluente': '#2563eb' };
  const REASON = { weak: 'debole', stale: 'da ripassare' };

  const SP = window.MappAIStudyPath = Object.assign({}, CORE);

  SP.open = function () {
    if (!(S() && S().db && S().db.nodes && S().db.nodes.length)) { toast('Apri una mappa.'); return; }
    const nodes = studiableNodes();
    const parentOf = buildParentMap((S().db.nodes || []), (S().db.links || []));
    const res = classify(nodes.map(n => n.id), parentOf, masteryFn, { staleDays: 7 });
    const labelOf = {}; nodes.forEach(n => { labelOf[n.id] = clean(n.label); });

    const list = (arr, extra) => {
      if (!arr.length) return '<div style="color:#94a3b8;font-size:12px;padding:2px 0">—</div>';
      return arr.slice(0, 25).map(it => {
        const color = DOT[it.level] || '#9ca3af';
        const tag = extra && it.reason ? ` <span style="color:#94a3b8">· ${REASON[it.reason] || it.reason}</span>` : '';
        return `<div class="sp-item" data-id="${esc(it.id)}" style="display:flex;align-items:center;gap:8px;padding:5px 7px;border-radius:8px;cursor:pointer;font-size:13px;color:#334155">
            <span style="width:10px;height:10px;border-radius:50%;background:${color};flex:0 0 auto"></span>
            <span>${esc(labelOf[it.id] || it.id)}${tag}</span></div>`;
      }).join('') + (arr.length > 25 ? `<div style="color:#94a3b8;font-size:11px;padding:2px 7px">+${arr.length - 25} altri…</div>` : '');
    };
    const section = (title, sub, arr, extra) =>
      `<div style="margin-bottom:12px"><div style="font-weight:700;color:#0f172a;font-size:13px">${title} <span style="color:#94a3b8;font-weight:400">(${arr.length})</span></div>
       <div style="font-size:11px;color:#94a3b8;margin-bottom:4px">${sub}</div>${list(arr, extra)}</div>`;

    document.getElementById('sp-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'sp-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;padding:16px';
    modal.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:460px;width:100%;max-height:86vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);padding:20px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px"><i data-lucide="compass" style="width:20px;height:20px;color:#7c3aed"></i><b style="color:#0f172a;font-size:16px">Cosa studiare ora</b>
          <button id="sp-x" style="margin-left:auto;background:none;border:0;cursor:pointer;color:#94a3b8;font-size:22px;line-height:1">×</button></div>
        ${section('<i data-lucide="play" style="width:14px;height:14px;vertical-align:-2px"></i> Pronti', 'Prerequisito padroneggiato — inizia da qui', res.ready, false)}
        ${section('<i data-lucide="rotate-cw" style="width:14px;height:14px;vertical-align:-2px"></i> Da rivedere', 'Deboli o non ripassati da una settimana', res.review, true)}
        ${section('<i data-lucide="circle-check" style="width:14px;height:14px;vertical-align:-2px"></i> Padroneggiati', 'Acquisiti e recenti', res.mastered, false)}
        ${res.locked.length ? `<div style="font-size:11px;color:#94a3b8"><i data-lucide="lock" style="width:12px;height:12px;vertical-align:-1px"></i> ${res.locked.length} bloccati (studia prima il loro prerequisito)</div>` : ''}
      </div>`;
    document.body.appendChild(modal);
    if (window.safeCreateIcons) window.safeCreateIcons();
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#sp-x').onclick = () => modal.remove();
    modal.querySelectorAll('.sp-item').forEach(el => el.onclick = () => { modal.remove(); focusNode(el.getAttribute('data-id')); });
  };

  console.log('[StudyPath] pannello "cosa studiare ora" caricato');
})();
