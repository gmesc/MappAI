/*
 * mappai-sidebar-resize.js — sidebar ridimensionabile a mano (006)
 * -----------------------------------------------------------------
 * Maniglia #sidebar-resizer sul bordo destro di #sidebar. Drag → larghezza
 * inline con !important (batte i !important di .app-sidebar in style.css senza
 * toccare style.css). Clamp: min 320px, max 50% della finestra. Persistita in
 * localStorage 'mappai_sidebar_width'; assente = comportamento CSS attuale.
 * Re-clamp su window.resize. Solo desktop (≥768px); su mobile la sidebar è w-full.
 */
(function () {
  'use strict';

  var KEY = 'mappai_sidebar_width';
  var MIN = 320;
  function maxW() { return Math.floor(0.5 * window.innerWidth); }

  function sidebar() { return document.getElementById('sidebar'); }

  function clamp(px) {
    var mx = maxW();
    if (mx < MIN) mx = MIN; // finestra strettissima: non andare sotto il min
    return Math.max(MIN, Math.min(mx, px));
  }

  function applyWidth(px, persist) {
    var sb = sidebar();
    if (!sb) return;
    var w = clamp(px);
    sb.style.setProperty('width', w + 'px', 'important');
    sb.style.setProperty('max-width', w + 'px', 'important');
    sb.style.setProperty('min-width', w + 'px', 'important');
    if (persist) { try { localStorage.setItem(KEY, String(w)); } catch (e) { } }
    return w;
  }

  function readSaved() {
    try { var v = parseInt(localStorage.getItem(KEY), 10); return isFinite(v) ? v : null; }
    catch (e) { return null; }
  }

  function isDesktop() { return window.innerWidth >= 768; }

  var dragging = false;

  function onDown(e) {
    if (!isDesktop()) return;
    dragging = true;
    var sb = sidebar();
    if (sb) sb.style.transition = 'none'; // niente animazione durante il drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (_) { }
    e.preventDefault();
  }
  function onMove(e) {
    if (!dragging) return;
    // la sidebar è ancorata a sinistra: la larghezza = posizione X del puntatore
    var sb = sidebar();
    if (!sb) return;
    var left = sb.getBoundingClientRect().left;
    applyWidth(e.clientX - left, false);
  }
  function onUp() {
    if (!dragging) return;
    dragging = false;
    var sb = sidebar();
    if (sb) {
      sb.style.transition = '';
      var w = parseInt(sb.style.width, 10);
      if (isFinite(w)) { try { localStorage.setItem(KEY, String(clamp(w))); } catch (e) { } }
    }
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }

  function init() {
    var handle = document.getElementById('sidebar-resizer');
    var sb = sidebar();
    if (!handle || !sb) return;
    // riapplica la larghezza salvata (solo desktop)
    var saved = readSaved();
    if (saved != null && isDesktop()) applyWidth(saved, false);

    handle.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    // finestra ridimensionata: re-clamp al 50% se avevamo una larghezza custom
    window.addEventListener('resize', function () {
      var cur = readSaved();
      if (cur == null) return;
      if (!isDesktop()) return;
      applyWidth(cur, false); // clamp interno taglia al nuovo 50%
    });
  }

  // Collapse della sidebar (toggleSidebar): l'inline width/min/max con !important
  // batterebbe la regola .sidebar-collapsed #sidebar {width:0!important}. Quindi
  // quando si collassa RIMUOVIAMO l'inline (lasciando vincere il CSS del collapse);
  // quando si riapre, riapplichiamo la larghezza salvata.
  function setCollapsed(collapsed) {
    var sb = sidebar();
    if (!sb) return;
    if (collapsed) {
      sb.style.removeProperty('width');
      sb.style.removeProperty('min-width');
      sb.style.removeProperty('max-width');
    } else {
      var saved = readSaved();
      if (saved != null && isDesktop()) applyWidth(saved, false);
    }
  }

  window.MappAISidebarResize = { init: init, applyWidth: applyWidth, setCollapsed: setCollapsed };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  console.log('[MappAISidebarResize] sidebar ridimensionabile caricata');
})();
