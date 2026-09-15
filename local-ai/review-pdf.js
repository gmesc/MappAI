/* The bank uses Proietta's pointer-zoom geometry; PDF bytes are never changed. */
(function () {
  'use strict';
  const C = window.MappAIProiezioneCore;
  const viewer = document.getElementById('pdf-viewer'), canvas = document.getElementById('pdf-canvas');
  const status = document.getElementById('pdf-status'), reset = document.getElementById('pdf-fit');
  let page, width = 1, height = 1, state = { z: 1, x: 0, y: 0 }, fitted = true, drag;
  let renderTask, renderVersion = 0, timer, rasterScale = 0;

  function apply() {
    state = C.clampPan(state, width, height, viewer.clientWidth, viewer.clientHeight);
    canvas.style.transform = `translate(${state.x}px,${state.y}px) scale(${state.z})`;
    reset.title = `Adatta alla larghezza (0) · Zoom ${Math.round(state.z * 100)}%`;
  }
  function failed(error) {
    canvas.hidden = true; status.hidden = false; status.textContent = error.message;
    viewer.setAttribute('aria-busy', 'false');
  }
  async function render() {
    if (!page || !viewer.clientWidth) return;
    // Cap the backing bitmap at 16 MP / 8192 px per side, even on Retina at 8×.
    const scale = Math.min(state.z * (window.devicePixelRatio || 1), Math.sqrt(16000000 / (width * height)), 8192 / Math.max(width, height));
    if (scale === rasterScale && !canvas.hidden) {
      if (renderTask) { renderVersion++; renderTask.cancel(); renderTask = null; }
      return;
    }
    const version = ++renderVersion, target = page;
    if (renderTask) renderTask.cancel();
    let task;
    try {
      const buffer = document.createElement('canvas'), viewport = target.getViewport({ scale });
      buffer.width = Math.max(1, Math.floor(viewport.width)); buffer.height = Math.max(1, Math.floor(viewport.height));
      task = target.render({ canvasContext: buffer.getContext('2d'), viewport }); renderTask = task;
      await task.promise;
      if (version !== renderVersion || target !== page) return;
      canvas.width = buffer.width; canvas.height = buffer.height;
      canvas.getContext('2d').drawImage(buffer, 0, 0);
      rasterScale = scale; canvas.hidden = false; status.hidden = true;
      viewer.setAttribute('aria-busy', 'false');
    } catch (error) {
      if (version === renderVersion && error.name !== 'RenderingCancelledException') failed(error);
    } finally { if (renderTask === task) renderTask = null; }
  }
  function scheduleRender() { clearTimeout(timer); timer = setTimeout(render, 120); }
  function fit() {
    if (!page) return;
    fitted = true;
    const z = C.clampZ(viewer.clientWidth / width);
    state = { z, x: (viewer.clientWidth - width * z) / 2, y: 0 };
    apply(); scheduleRender();
  }
  function zoom(x, y, factor) {
    if (!page || canvas.hidden) return;
    fitted = false; state = C.zoomAlPunto(state, x, y, factor); apply(); scheduleRender();
  }
  function endDrag() {
    if (drag && viewer.hasPointerCapture(drag.id)) viewer.releasePointerCapture(drag.id);
    drag = null; delete viewer.dataset.dragging;
  }
  viewer.addEventListener('wheel', event => {
    if (!page || canvas.hidden || !event.deltaY) return;
    event.preventDefault(); endDrag();
    const bounds = viewer.getBoundingClientRect();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewer.clientHeight : 1);
    zoom(event.clientX - bounds.left, event.clientY - bounds.top, Math.exp(-Math.max(-200, Math.min(200, delta)) * .002));
  }, { passive: false });
  viewer.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary || !page || canvas.hidden) return;
    event.preventDefault(); viewer.focus({ preventScroll: true });
    fitted = false; drag = { id: event.pointerId, x: event.clientX, y: event.clientY, sx: state.x, sy: state.y };
    viewer.setPointerCapture(event.pointerId); viewer.dataset.dragging = 'true';
  });
  viewer.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    state.x = drag.sx + event.clientX - drag.x; state.y = drag.sy + event.clientY - drag.y; apply();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) viewer.addEventListener(name, endDrag);
  window.addEventListener('blur', endDrag);
  viewer.addEventListener('keydown', event => {
    if (!page || canvas.hidden || event.metaKey || event.ctrlKey || event.altKey) return;
    if (!['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === '0') fit();
    else if (['+', '=', '-'].includes(event.key)) zoom(viewer.clientWidth / 2, viewer.clientHeight / 2, event.key === '-' ? 1 / 1.2 : 1.2);
    else {
      fitted = false;
      state.x += ({ ArrowLeft: 48, ArrowRight: -48 }[event.key] || 0);
      state.y += ({ ArrowUp: 48, ArrowDown: -48 }[event.key] || 0); apply();
    }
  });
  reset.addEventListener('click', fit);
  new ResizeObserver(() => { if (page) { if (fitted) fit(); else apply(); } }).observe(viewer);
  window.MappAIReviewPdf = {
    loading() {
      endDrag(); clearTimeout(timer); renderVersion++;
      if (renderTask) renderTask.cancel();
      page = null; rasterScale = 0; canvas.hidden = true; status.hidden = false;
      status.textContent = 'Caricamento della copia del PDF originale…'; viewer.setAttribute('aria-busy', 'true');
    },
    async show(nextPage) {
      page = nextPage;
      const base = page.getViewport({ scale: 1 }); width = base.width; height = base.height;
      canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
      fit(); clearTimeout(timer); await render();
    },
    failed
  };
}());
