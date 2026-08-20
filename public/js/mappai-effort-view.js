/*
 * mappai-effort-view.js — Overlay "Lavoro" (effort) sul grafo D3
 * -------------------------------------------------------------
 * Tinge i nodi secondo il LAVORO svolto (indipendente dalla padronanza):
 * tentativi di studio (MappAIMastery) + turni chat sul nodo + parole desc.
 * Intensità indaco ∝ effort. Serve al docente (su un vault studente aperto) e
 * allo studente per vedere "dove ho lavorato di più" — distingue chi FATICA
 * (molto lavoro, bassa mastery) da chi NON lavora (effort ~0).
 *
 * Reversibile come l'overlay padronanza: avvolge window.renderGraph e ri-applica
 * la tinta solo quando attivo; allo spegnimento renderGraph() ripristina i colori.
 * Non scrive nulla. Caricare DOPO mappai-mastery-view.js.
 */
(function () {
  'use strict';

  const EV = window.MappAIEffortView = { active: false, _wrapped: false };

  function _tutorState() {
    try { return (typeof tutorState !== 'undefined') ? tutorState : window.tutorState; }
    catch (e) { return window.tutorState; }
  }

  // Effort di un nodo: tentativi ×2 + turni chat ×3 + parole desc/20. Uguale al modello meta-analisi.
  function effortOf(id, node) {
    let attempts = 0;
    const MM = window.MappAIMastery;
    if (MM && typeof MM.node === 'function') { const agg = MM.node(id); attempts = agg ? (agg.attempts || 0) : 0; }
    let turns = 0;
    const ts = _tutorState();
    if (ts && ts.nodes && ts.nodes[id]) turns = (ts.nodes[id].history || []).filter(e => e && e.role === 'user').length;
    const descW = String((node && (node.desc || node.content)) || '').split(/\s+/).filter(Boolean).length;
    return attempts * 2 + turns * 3 + Math.min(descW, 120) / 20;
  }

  function applyTint() {
    if (typeof d3 === 'undefined') return;
    const svg = d3.select('#map-svg');
    if (svg.empty()) return;
    let max = 1;
    svg.selectAll('circle.node-circle').each(function (d) { if (d && d.level !== 0) { const e = effortOf(d.id, d); if (e > max) max = e; } });
    svg.selectAll('circle.node-circle').each(function (d) {
      if (!d || d.level === 0) return; // root invariato
      const e = effortOf(d.id, d);
      const t = Math.min(1, e / max);
      const fill = e <= 0 ? '#eef2f7' : 'rgba(99,102,241,' + (0.15 + 0.8 * t).toFixed(2) + ')';
      d3.select(this).attr('fill', fill).attr('stroke', e <= 0 ? '#cbd5e1' : '#4f46e5').append('title').text('Lavoro: ' + Math.round(e * 10) / 10);
    });
  }

  function wrapRender() {
    if (EV._wrapped || typeof window.renderGraph !== 'function') return;
    const orig = window.renderGraph;
    window.renderGraph = function () {
      orig.apply(this, arguments);
      if (EV.active) { try { applyTint(); } catch (e) { console.warn('[EffortView]', e); } }
    };
    EV._wrapped = true;
  }

  EV.enable = function () {
    // Mutuamente esclusivo con l'overlay padronanza (colori diversi sullo stesso grafo).
    if (window.MappAIMasteryView && window.MappAIMasteryView.active) window.MappAIMasteryView.disable();
    EV.active = true;
    wrapRender();
    if (typeof window.renderGraph === 'function') window.renderGraph();
    showLegend();
    updateBtn();
  };
  EV.disable = function () {
    EV.active = false;
    const l = document.getElementById('ev-legend'); if (l) l.remove();
    if (typeof window.renderGraph === 'function') window.renderGraph();
    updateBtn();
  };
  EV.toggle = function () { EV.active ? EV.disable() : EV.enable(); };

  function showLegend() {
    document.getElementById('ev-legend')?.remove();
    const box = document.createElement('div');
    box.id = 'ev-legend';
    box.style.cssText = 'position:fixed;bottom:20px;left:150px;z-index:9996;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.12);padding:10px 12px;font-family:system-ui,sans-serif;font-size:12px;color:#334155';
    box.innerHTML = '<div style="font-weight:700;color:#0f172a;margin-bottom:5px">Lavoro svolto</div>' +
      '<div style="height:12px;width:150px;border-radius:6px;background:linear-gradient(90deg,#eef2f7,#6366f1);border:1px solid #e2e8f0"></div>' +
      '<div style="display:flex;justify-content:space-between;margin-top:3px;color:#94a3b8"><span>poco</span><span>molto</span></div>' +
      '<div style="margin-top:5px;color:#94a3b8;max-width:170px">Indipendente dalla padronanza</div>';
    document.body.appendChild(box);
  }

  function updateBtn() {
    const b = document.getElementById('ev-btn');
    if (b) { b.style.background = EV.active ? 'linear-gradient(135deg,#4f46e5,#6366f1)' : '#fff'; b.style.color = EV.active ? '#fff' : '#4f46e5'; }
  }

  function injectBtn() {
    // Spostato nel launcher Studio attivo: il flottante torna solo in modalità legacy.
    if (localStorage.getItem('mappai_legacy_float_btns') !== '1') return;
    if (document.getElementById('ev-btn')) return;
    const b = document.createElement('button');
    b.id = 'ev-btn';
    b.title = 'Mostra il lavoro svolto sul grafo (effort)';
    b.innerHTML = '<i data-lucide="flame" style="width:20px;height:20px"></i>';
    // Colonna flottante destra — SOLO modalità legacy (mappai_legacy_float_btns='1').
    // Ordine legacy: 20 cloze · 84 mastery · 148 celeration · 212 study-path ·
    //   276 palazzo · 340 games · 404 effort.
    // Default (senza flag): colonna vuota — tutto vive nel launcher Studio attivo
    //   (viste, esercizi, strumenti); Memory Dungeon passerà dall'hub Knowledge Garden.
    b.style.cssText = 'position:fixed;bottom:404px;right:20px;z-index:9996;width:48px;height:48px;border-radius:50%;border:1.5px solid #4f46e5;background:#fff;color:#4f46e5;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 6px 18px -6px rgba(79,70,229,.5)';
    b.onclick = () => EV.toggle();
    document.body.appendChild(b);
    if (window.safeCreateIcons) window.safeCreateIcons();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectBtn);
  else injectBtn();

  console.log('[EffortView] overlay lavoro caricato');
})();
