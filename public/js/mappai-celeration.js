/*
 * mappai-celeration.js — Grafico dei progressi nel tempo (Precision Teaching)
 * --------------------------------------------------------------------------
 * Legge la `history` per-pinpoint dello store (MappAIMastery) e mostra la crescita
 * GIORNO PER GIORNO di accuratezza e fluenza (corrette/min) = celeration. Versione
 * "semplice" (scala lineare, leggibile da studenti); lo Standard Celeration Chart
 * vero (scala ×2) resta un'opzione futura.
 *
 * Modulo UMD: CORE puro (buildSeries, dayKey) testabile in Node; layer browser
 * (grafico SVG in un modale). Caricare DOPO mappai-mastery.js.
 */
(function () {
  'use strict';

  function dayKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // Aggrega tutte le history per giorno → { days[], acc[](0..1|null), rate[](num|null) }.
  function buildSeries(store) {
    const byDay = {};
    Object.keys(store || {}).forEach(k => {
      const row = store[k];
      (row && row.history || []).forEach(h => {
        const day = dayKey(h.ts);
        const b = byDay[day] || (byDay[day] = { accSum: 0, accN: 0, rateSum: 0, rateN: 0 });
        if (typeof h.acc === 'number') { b.accSum += h.acc; b.accN++; }
        if (h.rate != null) { b.rateSum += h.rate; b.rateN++; }
      });
    });
    const days = Object.keys(byDay).sort();
    return {
      days,
      acc: days.map(d => byDay[d].accN ? byDay[d].accSum / byDay[d].accN : null),
      rate: days.map(d => byDay[d].rateN ? byDay[d].rateSum / byDay[d].rateN : null)
    };
  }

  const CORE = { dayKey, buildSeries };
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;

  // ─────────────────────────── LAYER BROWSER ───────────────────────────
  function toast(m) { try { if (window.showToast) return window.showToast(m, 'info'); } catch (e) {} }

  const W = 560, H = 280, PADL = 44, PADR = 44, PADT = 22, PADB = 38;
  const ix = (i, n) => PADL + (n <= 1 ? (W - PADL - PADR) / 2 : (i / (n - 1)) * (W - PADL - PADR));
  const accY = (v) => PADT + (1 - v) * (H - PADT - PADB);           // accuratezza 0..1
  const rateY = (v, max) => PADT + (1 - (max ? v / max : 0)) * (H - PADT - PADB);

  function polyline(pts, color) {
    const valid = pts.filter(p => p.y != null);
    if (!valid.length) return '';
    const d = valid.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const dots = valid.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${color}"/>`).join('');
    return `<polyline points="${d}" fill="none" stroke="${color}" stroke-width="2.5"/>${dots}`;
  }

  function chartSVG(series) {
    const n = series.days.length;
    const maxRate = Math.max(1, ...series.rate.filter(r => r != null));
    const accPts = series.acc.map((v, i) => ({ x: ix(i, n), y: v == null ? null : accY(v) }));
    const ratePts = series.rate.map((v, i) => ({ x: ix(i, n), y: v == null ? null : rateY(v, maxRate) }));
    // griglia accuratezza 0/50/100%
    let grid = '';
    [0, 0.5, 1].forEach(v => {
      const y = accY(v);
      grid += `<line x1="${PADL}" y1="${y}" x2="${W - PADR}" y2="${y}" stroke="#e2e8f0"/>`;
      grid += `<text x="${PADL - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#16a34a">${Math.round(v * 100)}%</text>`;
    });
    grid += `<text x="${W - PADR + 6}" y="${PADT + 6}" font-size="10" fill="#2563eb">${maxRate.toFixed(0)}/min</text>`;
    // etichette x (prima/ultima)
    let xlab = '';
    if (n) {
      xlab += `<text x="${ix(0, n)}" y="${H - 12}" text-anchor="middle" font-size="10" fill="#64748b">${series.days[0].slice(5)}</text>`;
      if (n > 1) xlab += `<text x="${ix(n - 1, n)}" y="${H - 12}" text-anchor="middle" font-size="10" fill="#64748b">${series.days[n - 1].slice(5)}</text>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">${grid}
      ${polyline(accPts, '#16a34a')}${polyline(ratePts, '#2563eb')}${xlab}</svg>`;
  }

  const CEL = window.MappAICeleration = {};

  CEL.open = function () {
    const MM = window.MappAIMastery;
    const store = (MM && typeof MM.all === 'function') ? MM.all() : {};
    const series = buildSeries(store);

    document.getElementById('cel-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'cel-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;padding:16px';

    let inner;
    if (!series.days.length) {
      inner = '<p style="color:#64748b;margin:0">Nessun dato di studio ancora. Fai qualche esercizio (Cloze, Studio attivo) e torna qui per vedere la tua crescita. 📈</p>';
    } else {
      const oneDay = series.days.length === 1;
      inner = `<div style="display:flex;gap:14px;font-size:12px;margin-bottom:8px">
          <span style="color:#16a34a;font-weight:600">● Accuratezza</span>
          <span style="color:#2563eb;font-weight:600">● Fluenza (corrette/min)</span>
        </div>${chartSVG(series)}
        ${oneDay ? '<p style="color:#94a3b8;font-size:12px;margin:8px 0 0">Un solo giorno di dati: torna domani per vedere la <b>celeration</b> (la crescita nel tempo).</p>' : ''}`;
    }

    modal.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:620px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);padding:22px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px"><span style="font-size:20px">📈</span><b style="color:#0f172a;font-size:16px">I tuoi progressi</b>
          <button id="cel-x" style="margin-left:auto;background:none;border:0;cursor:pointer;color:#94a3b8;font-size:22px;line-height:1">×</button></div>
        ${inner}</div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#cel-x').onclick = () => modal.remove();
  };

  function injectBtn() {
    if (document.getElementById('cel-btn')) return;
    const b = document.createElement('button');
    b.id = 'cel-btn';
    b.title = 'I tuoi progressi nel tempo';
    b.textContent = '📈';
    // Colonna destra compattata dopo lo spostamento di cloze/mastery/effort nel
    // launcher Studio attivo: legacy 148 → default 20 (flag mappai_legacy_float_btns).
    const _legacy = localStorage.getItem('mappai_legacy_float_btns') === '1';
    b.style.cssText = `position:fixed;bottom:${_legacy ? 148 : 20}px;right:20px;z-index:9996;width:48px;height:48px;border-radius:50%;border:1.5px solid #2563eb;background:#fff;color:#2563eb;font-size:20px;cursor:pointer;box-shadow:0 6px 18px -6px rgba(37,99,235,.5)`;
    b.onclick = () => CEL.open();
    document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectBtn);
  else injectBtn();

  console.log('[Celeration] grafico progressi caricato');
})();
