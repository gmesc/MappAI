/*
 * mappai-mastery-view.js — Overlay "Padronanza" sul grafo
 * -------------------------------------------------------
 * Tinge i nodi secondo la padronanza per concetto (MappAIMastery): lo studente
 * VEDE cosa padroneggia. È il payoff visivo dello store keystone + supporto al
 * Mastery Learning (sapere cosa è acquisito e cosa va ripassato).
 *
 *   nuovo      → grigio   (mai studiato)
 *   in-corso   → ambra    (accuracy < soglia)
 *   acquisito  → verde    (accuracy >= soglia)
 *   (fluente   → arriverà con la dimensione rate/tempo)
 *
 * Reversibile: avvolge window.renderGraph e ri-applica la tinta dopo ogni render
 * SOLO quando attivo; allo spegnimento richiama renderGraph() → colori originali.
 * Non scrive nulla, non tocca i dati. Caricare DOPO mappai-active-study.js.
 */
(function () {
  'use strict';

  const ACC_THR = 0.8;
  const COLORS = {
    'nuovo':     { fill: '#e5e7eb', stroke: '#9ca3af' }, // slate-200 / slate-400
    'in-corso':  { fill: '#fcd34d', stroke: '#d97706' }, // amber-300 / amber-600
    'acquisito': { fill: '#86efac', stroke: '#16a34a' }, // green-300 / green-600
    'fluente':   { fill: '#93c5fd', stroke: '#2563eb' }  // blue-300 / blue-600 (accurato + rapido)
  };

  const MV = window.MappAIMasteryView = { active: false, _wrapped: false };

  function levelOfNode(id) {
    const MM = window.MappAIMastery;
    if (!MM || typeof MM.node !== 'function') return 'nuovo';
    const agg = MM.node(id);
    if (!agg || !agg.attempts) return 'nuovo';
    // usa la classificazione a 2 fasi dello store (accuratezza → fluenza via rate)
    if (typeof MM.masteryLevel === 'function') {
      return MM.masteryLevel({ attempts: agg.attempts, accuracy: agg.accuracy, rate: agg.rate });
    }
    return agg.accuracy >= ACC_THR ? 'acquisito' : 'in-corso';
  }

  // accuracy delle sintesi scritte nel Memory Dungeon (scritte da mappai-games.js). Nodi ≥60% → anello dorato.
  // FIX: il gioco salva su chiave PER-MAPPA (mappai_dungeon_synthesis__<mapSig>) → leggere via API
  // MappAIGames.synthScores() (chiave giusta per la mappa corrente); la chiave nuda resta come fallback legacy.
  const SYNTH_KEY = 'mappai_dungeon_synthesis';
  function synthScores() {
    try { if (window.MappAIGames && typeof window.MappAIGames.synthScores === 'function') return window.MappAIGames.synthScores() || {}; } catch (e) {}
    try { return JSON.parse(localStorage.getItem(SYNTH_KEY) || '{}'); } catch (e) { return {}; }
  }

  // legge extractionMode senza dipendere da window.appState (appState è `let`)
  function _mode() {
    try { return (typeof appState !== 'undefined' ? appState : window.appState)?.extractionMode; }
    catch (e) { return window.appState?.extractionMode; }
  }

  function applyTint() {
    if (typeof d3 === 'undefined') return;
    // non litigare con lo studio attivo (che ricolora per esercizio)
    if (window.ActiveStudy && window.ActiveStudy.session && window.ActiveStudy.session.active) return;
    const svg = d3.select('#map-svg');
    if (svg.empty()) return;
    const isKG = _mode() === 'kg';
    svg.selectAll('circle.node-circle').each(function (d) {
      if (!d || d.level === 0) return; // root invariato
      const c = COLORS[levelOfNode(d.id)];
      const sel = d3.select(this).attr('fill', c.fill).attr('stroke', c.stroke);
      // KG: il node-circle ha stroke-width 0 (l'outline è l'anello parentela). In heatmap
      // diamo spessore così l'unico bordo visibile è quello della padronanza.
      if (isKG && d.level > 1) sel.attr('stroke-width', 2.5);
    });
    // KG: nascondi gli anelli colorati di parentela con gli hub → restano solo i colori heatmap
    if (isKG) svg.selectAll('g.node-segments').style('display', 'none');
    applySynthRings(svg);
  }

  // Feedback visivo dinamico: anello dorato tratteggiato sui nodi per cui lo studente ha scritto una sintesi con accuracy ≥60%.
  function applySynthRings(svg) {
    svg.selectAll('circle.mv-synth-ring').remove();   // idempotente: ridisegna da zero a ogni render
    const sc = synthScores();
    svg.selectAll('circle.node-circle').each(function (d) {
      if (!d) return;
      const acc = sc[String(d.id)];
      if (!(acc >= 60)) return;
      const sel = d3.select(this), r = (+sel.attr('r') || 12) + 4;
      d3.select(this.parentNode).append('circle')   // stesso spazio coordinate del cerchio nodo
        .attr('class', 'mv-synth-ring')
        .attr('cx', sel.attr('cx') || 0).attr('cy', sel.attr('cy') || 0).attr('r', r)
        .attr('fill', 'none').attr('stroke', '#f5c542').attr('stroke-width', 2.5)
        .attr('stroke-dasharray', '3 3').attr('pointer-events', 'none')
        .append('title').text('Sintesi scritta · ' + acc + '%');
    });
  }

  function wrapRender() {
    if (MV._wrapped || typeof window.renderGraph !== 'function') return;
    const orig = window.renderGraph;
    window.renderGraph = function () {
      orig.apply(this, arguments);
      if (MV.active) { try { applyTint(); } catch (e) { console.warn('[MasteryView]', e); } }
    };
    MV._wrapped = true;
  }

  MV.enable = function () {
    MV.active = true;
    wrapRender();
    if (typeof window.renderGraph === 'function') window.renderGraph();
    showLegend();
    updateBtn();
  };
  MV.disable = function () {
    MV.active = false;
    const l = document.getElementById('mv-legend'); if (l) l.remove();
    if (typeof d3 !== 'undefined') {
      const svg = d3.select('#map-svg');
      svg.selectAll('circle.mv-synth-ring').remove();           // togli gli anelli sintesi
      svg.selectAll('g.node-segments').style('display', null);  // ripristina anelli parentela KG nascosti in heatmap
    }
    if (typeof window.renderGraph === 'function') window.renderGraph(); // ripristina i colori
    updateBtn();
  };
  MV.toggle = function () { MV.active ? MV.disable() : MV.enable(); };

  // ─────────────────────────────── UI ───────────────────────────────
  function showLegend() {
    document.getElementById('mv-legend')?.remove();
    const box = document.createElement('div');
    box.id = 'mv-legend';
    box.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:9996;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.12);padding:10px 12px;font-family:system-ui,sans-serif;font-size:12px;color:#334155';
    const row = (c, t) => `<div style="display:flex;align-items:center;gap:8px;margin:3px 0"><span style="width:13px;height:13px;border-radius:50%;background:${c.fill};border:2px solid ${c.stroke};display:inline-block"></span>${t}</div>`;
    box.innerHTML = '<div style="font-weight:700;color:#0f172a;margin-bottom:5px">Padronanza</div>' +
      row(COLORS['fluente'], 'Fluente') + row(COLORS['acquisito'], 'Acquisito') +
      row(COLORS['in-corso'], 'In corso') + row(COLORS['nuovo'], 'Da studiare') +
      '<div style="display:flex;align-items:center;gap:8px;margin:6px 0 0;padding-top:5px;border-top:1px solid #e2e8f0"><span style="width:13px;height:13px;border-radius:50%;background:transparent;border:2px dashed #f5c542;display:inline-block"></span>Sintesi scritta ≥60%</div>';
    document.body.appendChild(box);
  }

  function updateBtn() {
    const b = document.getElementById('mv-btn');
    if (b) { b.style.background = MV.active ? 'linear-gradient(135deg,#16a34a,#22c55e)' : '#fff'; b.style.color = MV.active ? '#fff' : '#16a34a'; }
  }

  function injectBtn() {
    // Spostato nel launcher Studio attivo: il flottante torna solo in modalità legacy.
    if (localStorage.getItem('mappai_legacy_float_btns') !== '1') return;
    if (document.getElementById('mv-btn')) return;
    const b = document.createElement('button');
    b.id = 'mv-btn';
    b.title = 'Mostra padronanza sul grafo';
    b.innerHTML = '<i data-lucide="target" style="width:20px;height:20px"></i>';
    b.style.cssText = 'position:fixed;bottom:84px;right:20px;z-index:9996;width:48px;height:48px;border-radius:50%;border:1.5px solid #16a34a;background:#fff;color:#16a34a;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 6px 18px -6px rgba(22,163,74,.5)';
    b.onclick = () => MV.toggle();
    document.body.appendChild(b);
    if (window.safeCreateIcons) window.safeCreateIcons();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectBtn);
  else injectBtn();

  console.log('[MasteryView] overlay padronanza caricato');
})();
