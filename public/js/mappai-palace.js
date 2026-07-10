/*
 * mappai-palace.js — Palazzo della Memoria (Active Recall, Metodo dei Loci)
 * ------------------------------------------------------------------------
 * Trasforma la geografia del grafo in un "palazzo": ogni ramo principale (L1)
 * è una STANZA, i suoi concetti sono gli oggetti nella stanza. Lo studente fa un
 * viaggio: memorizza una stanza (encoding), poi la ricostruisce a memoria (recall).
 * È il Metodo dei Loci — e ricicla, di proposito, la logica geografica che la Fase 1
 * produceva per sbaglio (vedi docs: "Italian cities reframe"). Deterministico, no AI.
 * Alimenta lo store di padronanza (attività 'palazzo').
 *
 * Modulo UMD: CORE puro (buildRooms, matchRecall, normalize) testabile in Node.
 * Caricare DOPO mappai-mastery.js.
 */
(function () {
  'use strict';

  function _tSafe(k, f) { return (typeof window !== 'undefined' && typeof window.t === 'function') ? window.t(k, f) : f; }
  // ───────────────────────────── CORE PURO ─────────────────────────────
  const lid = (x) => (x && typeof x === 'object') ? x.id : x;

  function normalize(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function lev(a, b) {
    a = String(a); b = String(b);
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function isMatch(ans, exp) {
    const a = normalize(ans), e = normalize(exp);
    if (!a) return false;
    if (a === e) return true;
    if (e.includes(a) && a.length >= Math.max(4, e.length - 2)) return true;
    return lev(a, e) <= (e.length > 6 ? 2 : 1);
  }

  // Stanze = rami L1; oggetti = discendenti del ramo (cap 8, profondità 3).
  function buildRooms(nodes, links, opts) {
    const maxItems = (opts && opts.maxItems) || 8;
    const byId = {}; (nodes || []).forEach(n => { byId[n.id] = n; });
    const children = {};
    (links || []).forEach(l => {
      const s = lid(l.source), t = lid(l.target);
      if (byId[s] && byId[t] && byId[s].level < byId[t].level) (children[s] = children[s] || []).push(t);
    });
    const descend = (id, depth, acc) => {
      (children[id] || []).forEach(c => { acc.push(c); if (depth > 0) descend(c, depth - 1, acc); });
      return acc;
    };
    const rooms = [];
    (nodes || []).filter(n => n.level === 1).forEach(l1 => {
      const ids = descend(l1.id, 3, []).slice(0, maxItems);
      const items = ids.map(id => ({ id, label: (byId[id].label || '').trim(), desc: byId[id].desc || byId[id].content || '' }))
        .filter(it => it.label);
      if (items.length >= 2) rooms.push({ id: l1.id, label: (l1.label || '').trim(), items });
    });
    return rooms;
  }

  // Confronta il testo libero dello studente con le etichette attese.
  function matchRecall(expectedLabels, typed) {
    const lines = String(typed || '').split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    const result = (expectedLabels || []).map(lab => ({ label: lab, found: lines.some(ln => isMatch(ln, lab)) }));
    const matched = result.filter(r => r.found).length;
    const total = (expectedLabels || []).length;
    return { result, matched, total, score: total ? matched / total : 0 };
  }

  // rateFromSeconds condiviso con lo Studio Attivo (cap 30, arrotondamento 0.1):
  // require in Node, window nel browser (caricato prima in index.html).
  let _asc = null;
  try {
    _asc = (typeof module !== 'undefined' && module.exports)
      ? require('./mappai-active-study-core.js')
      : (typeof window !== 'undefined' ? window.MappAIActiveStudyCore : null);
  } catch (e) {}

  // Fluenza per-item della stanza — stesso difetto corretto in mappai-active-study
  // (fix T2, 6/7/2026): mai stampare la media di sessione su ogni entry, l'EWMA
  // per-pinpoint riceverebbe una media invece della fluenza dell'item.
  // Nel Palazzo il recall è un textarea unico per stanza: il tempo del singolo
  // item NON è osservabile. Approssimazione scelta: tempo di stanza ripartito
  // fra gli item TROVATI → rateFromSeconds(elapsedSec / matched). È lo stesso
  // valore di matched/min, ma passa dal helper condiviso (cap 30 + rounding).
  // Il rate va SOLO agli item found: un item non ricordato non testimonia
  // alcuna fluenza (applyResult in mappai-mastery ignora rate == null).
  function perItemRate(matched, elapsedSec) {
    const m = Number(matched), s = Number(elapsedSec);
    if (!isFinite(m) || m <= 0 || !isFinite(s) || s <= 0) return null;
    if (_asc && _asc.rateFromSeconds) return _asc.rateFromSeconds(s / m);
    return Math.round(Math.min(60 / (s / m), 30) * 10) / 10;
  }

  const CORE = { normalize, lev, isMatch, buildRooms, matchRecall, perItemRate };
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;

  // ─────────────────────────── LAYER BROWSER ───────────────────────────
  function S() { try { return (typeof appState !== 'undefined') ? appState : window.appState; } catch (e) { return window.appState; } }
  function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function toast(m) { try { if (window.showToast) return window.showToast(m, 'info'); } catch (e) {} }

  const PAL = window.MappAIPalace = Object.assign({}, CORE, { _rooms: null, _i: 0 });

  PAL.start = function () {
    if (!(S() && S().db && S().db.nodes && S().db.nodes.length)) { toast(_tSafe('tst_pal_open_map', 'Apri una mappa.')); return; }
    const rooms = buildRooms(S().db.nodes || [], S().db.links || []);
    if (!rooms.length) { toast(_tSafe('tst_pal_need_branches', 'Servono rami con almeno 2 concetti per il Palazzo.')); return; }
    PAL._rooms = rooms; PAL._i = 0;
    if (window.MappAIStudyBus) window.MappAIStudyBus.begin('palazzo', 'Palazzo della Memoria');
    encode();
  };

  function shellOpen(html) {
    document.getElementById('pal-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'pal-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;padding:16px';
    modal.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:88vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);padding:22px">${html}</div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    return modal;
  }
  function header(room) {
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:20px">🏛️</span><b style="color:#0f172a;font-size:16px">Palazzo della Memoria</b><span style="margin-left:auto;color:#94a3b8;font-size:13px">Stanza ${PAL._i + 1} / ${PAL._rooms.length}</span></div>
      <div style="font-weight:700;color:#7c3aed;font-size:15px;margin-bottom:10px">🚪 ${esc(room.label)}</div>`;
  }

  function encode() {
    const room = PAL._rooms[PAL._i];
    const items = room.items.map(it => {
      const d = String(it.desc || '').replace(/\s+/g, ' ').trim();
      const snip = d ? ' — <span style="color:#64748b">' + esc(d.slice(0, 90)) + (d.length > 90 ? '…' : '') + '</span>' : '';
      return `<li style="margin-bottom:6px"><b>${esc(it.label)}</b>${snip}</li>`;
    }).join('');
    const modal = shellOpen(`${header(room)}
      <p style="color:#64748b;font-size:13px;margin:0 0 8px">Memorizza i concetti di questa stanza, poi ricostruiscila a memoria.</p>
      <ol style="font-size:14px;color:#1e293b;line-height:1.5;padding-left:20px;margin:0 0 8px">${items}</ol>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
        <button id="pal-exit" style="background:#f1f5f9;color:#334155;border:0;border-radius:10px;padding:9px 14px;cursor:pointer;font-weight:600">Esci</button>
        <button id="pal-go" style="background:#7c3aed;color:#fff;border:0;border-radius:10px;padding:9px 16px;cursor:pointer;font-weight:600">Ho memorizzato →</button>
      </div>`);
    modal.querySelector('#pal-exit').onclick = () => {
      modal.remove();
      if (window.MappAIStudyBus) window.MappAIStudyBus.end(); // salva la sessione parziale (se ha risultati)
    };
    modal.querySelector('#pal-go').onclick = () => recall();
  }

  function recall() {
    const room = PAL._rooms[PAL._i];
    PAL._recallStart = Date.now(); // cronometro per la fluenza (ricordati/min)
    const modal = shellOpen(`${header(room)}
      <p style="color:#64748b;font-size:13px;margin:0 0 8px">Scrivi i concetti che ricordi di questa stanza, <b>uno per riga</b> (${room.items.length} in totale).</p>
      <textarea id="pal-ta" rows="6" style="width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font:inherit;resize:vertical"></textarea>
      <div id="pal-fb" style="display:none;margin-top:10px;font-size:13.5px"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
        <button id="pal-exit" style="background:#f1f5f9;color:#334155;border:0;border-radius:10px;padding:9px 14px;cursor:pointer;font-weight:600">Esci</button>
        <button id="pal-check" style="background:#22c55e;color:#fff;border:0;border-radius:10px;padding:9px 16px;cursor:pointer;font-weight:600">Verifica</button>
      </div>`);
    modal.querySelector('#pal-exit').onclick = () => {
      modal.remove();
      if (window.MappAIStudyBus) window.MappAIStudyBus.end(); // salva la sessione parziale (se ha risultati)
    };
    modal.querySelector('#pal-ta').focus();
    modal.querySelector('#pal-check').onclick = () => checkRoom(modal, room);
  }

  function checkRoom(modal, room) {
    const typed = modal.querySelector('#pal-ta').value;
    const res = matchRecall(room.items.map(it => it.label), typed);

    // registra la padronanza per ogni concetto della stanza; via StudyBus finisce
    // anche in sessioni.jsonl per la meta-analisi docente. Fluenza per-item via
    // perItemRate (vedi commento nel CORE): solo sugli item trovati, mai la media
    // di stanza stampata su ogni entry.
    const elapsedSec = Math.max((Date.now() - (PAL._recallStart || Date.now())) / 1000, 2);
    const rate = perItemRate(res.matched, elapsedSec); // null se nessun match
    room.items.forEach((it, idx) => {
      const found = res.result[idx] && res.result[idx].found;
      try {
        if (window.MappAIStudyBus) window.MappAIStudyBus.record(it.id, it.label, 'palazzo', found ? { score: 1, rate } : { score: 0 });
        else if (window.MappAIMastery && window.MappAIMastery.record) window.MappAIMastery.record(it.id, it.label, 'palazzo', found ? { score: 1, rate } : { score: 0 });
      } catch (e) {}
    });

    const lis = res.result.map(r => `<li style="color:${r.found ? '#15803d' : '#b91c1c'}">${r.found ? '✓' : '✗'} ${esc(r.label)}</li>`).join('');
    const fb = modal.querySelector('#pal-fb');
    fb.style.display = 'block';
    fb.innerHTML = `<b style="color:${res.matched === res.total ? '#15803d' : '#b45309'}">${res.matched}/${res.total} ricordati</b><ul style="margin:6px 0 0;padding-left:20px">${lis}</ul>`;
    modal.querySelector('#pal-ta').disabled = true;

    const last = PAL._i >= PAL._rooms.length - 1;
    const btn = modal.querySelector('#pal-check');
    btn.textContent = last ? 'Fine viaggio' : 'Prossima stanza →';
    btn.style.background = '#7c3aed';
    btn.onclick = () => {
      modal.remove();
      if (last) { if (window.MappAIStudyBus) window.MappAIStudyBus.end(); toast(_tSafe('tst_pal_done', 'Viaggio completato! Padronanza aggiornata.')); }
      else { PAL._i++; encode(); }
    };
  }

  function injectBtn() {
    if (document.getElementById('pal-btn')) return;
    const b = document.createElement('button');
    b.id = 'pal-btn';
    b.title = 'Palazzo della Memoria (viaggio per stanze)';
    b.textContent = '🏛️';
    // Colonna destra compattata (vedi celeration): legacy 276 → default 148.
    const _legacy = localStorage.getItem('mappai_legacy_float_btns') === '1';
    b.style.cssText = `position:fixed;bottom:${_legacy ? 276 : 148}px;right:20px;z-index:9996;width:48px;height:48px;border-radius:50%;border:1.5px solid #7c3aed;background:#fff;color:#7c3aed;font-size:20px;cursor:pointer;box-shadow:0 6px 18px -6px rgba(124,58,237,.5)`;
    b.onclick = () => PAL.start();
    document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectBtn);
  else injectBtn();

  console.log('[Palace] Palazzo della Memoria caricato');
})();
