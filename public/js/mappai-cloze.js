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

  // Costruisce un cloze: oscura fino a `max` termini (interi, con confini di parola).
  // Ritorna { segments:[{text}|{blank}], blanks:[termine...] }.
  function makeCloze(desc, terms, opts) {
    const max = (opts && opts.max) || 3;
    const text = String(desc || '');
    const sorted = [...new Set(terms.map(t => String(t || '').trim()).filter(t => t.length >= 4))]
      .sort((a, b) => b.length - a.length); // specifici prima
    const matches = [];
    for (const term of sorted) {
      let re;
      try { re = new RegExp('(?<![\\p{L}\\p{N}])' + escapeRegex(term) + '(?![\\p{L}\\p{N}])', 'iu'); }
      catch (e) { re = new RegExp('\\b' + escapeRegex(term) + '\\b', 'i'); }
      const m = re.exec(text);
      if (!m) continue;
      const start = m.index, end = start + m[0].length;
      if (matches.some(x => start < x.end && end > x.start)) continue; // niente sovrapposizioni
      matches.push({ start, end, term: text.slice(start, end) });
      if (matches.length >= max) break;
    }
    matches.sort((a, b) => a.start - b.start);
    const segments = [];
    let pos = 0;
    for (const mm of matches) {
      if (mm.start > pos) segments.push({ text: text.slice(pos, mm.start) });
      segments.push({ blank: mm.term });
      pos = mm.end;
    }
    if (pos < text.length) segments.push({ text: text.slice(pos) });
    return { segments, blanks: matches.map(m => m.term) };
  }

  const CORE = { normalize, levenshtein, isCloseMatch, makeCloze };
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;

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
    const items = [];
    nodes.forEach(n => {
      if (n.level === 0) return;
      const desc = (n.desc || n.content || '').trim();
      if (desc.length < 40) return;
      const others = labels.filter(x => x.id !== n.id).map(x => x.label);
      const cz = makeCloze(desc, others, { max: 3 });
      if (cz.blanks.length >= 1) items.push({ nodeId: n.id, label: clean(n.label), cloze: cz });
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
    item.cloze.segments.forEach(seg => {
      if (seg.text != null) body += esc(seg.text);
      else {
        const w = Math.max(60, seg.blank.length * 11);
        body += `<input class="cz-blank" data-bi="${bi}" autocomplete="off" spellcheck="false" style="width:${w}px;display:inline-block;border:none;border-bottom:2px solid #6366f1;background:#eef2ff;border-radius:4px;padding:1px 6px;font:inherit;color:#3730a3;margin:0 2px">`;
        bi++;
      }
    });

    const modal = document.createElement('div');
    modal.id = 'cz-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;padding:16px';
    modal.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:620px;width:100%;max-height:88vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);padding:22px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:20px">📝</span><b style="color:#0f172a;font-size:16px">Cloze — completa</b><span style="margin-left:auto;color:#94a3b8;font-size:13px">${CZ._i + 1} / ${total}</span></div>
        <div style="font-weight:700;color:#4f46e5;font-size:14px;margin-bottom:10px">${esc(item.label)}</div>
        <div style="font-size:15px;color:#1e293b;line-height:2">${body}</div>
        <div id="cz-fb" style="display:none;margin-top:12px;font-size:13.5px"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">
          <button id="cz-exit" style="background:#f1f5f9;color:#334155;border:0;border-radius:10px;padding:9px 14px;cursor:pointer;font-weight:600">Esci</button>
          <button id="cz-check" style="background:#4f46e5;color:#fff;border:0;border-radius:10px;padding:9px 16px;cursor:pointer;font-weight:600">Verifica</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#cz-exit').onclick = () => {
      modal.remove();
      if (window.MappAIStudyBus) window.MappAIStudyBus.end(); // salva la sessione parziale (se ha risultati)
    };
    modal.querySelector('#cz-check').onclick = () => checkItem(modal, item);
    const first = modal.querySelector('.cz-blank'); if (first) first.focus();
  }

  function checkItem(modal, item) {
    const inputs = [...modal.querySelectorAll('.cz-blank')];
    let ok = 0;
    inputs.forEach((inp, i) => {
      const expected = item.cloze.blanks[i];
      const correct = isCloseMatch(inp.value, expected);
      if (correct) ok++;
      inp.style.borderBottomColor = correct ? '#16a34a' : '#dc2626';
      inp.style.background = correct ? '#dcfce7' : '#fee2e2';
      inp.style.color = correct ? '#166534' : '#991b1b';
      if (!correct) inp.value = inp.value ? inp.value + ' → ' + expected : expected;
      inp.disabled = true;
    });
    const total = inputs.length;
    const score = total ? ok / total : 0;
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
    fb.innerHTML = `<b style="color:${ok === total ? '#15803d' : '#b45309'}">${ok}/${total} corretti</b> ${ok === total ? '🎉' : '— in rosso la risposta giusta.'}`;
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
    if (document.getElementById('cz-btn')) return;
    const b = document.createElement('button');
    b.id = 'cz-btn';
    b.title = 'Cloze — completa le definizioni';
    b.textContent = '📝';
    b.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9996;width:48px;height:48px;border-radius:50%;border:1.5px solid #4f46e5;background:#fff;color:#4f46e5;font-size:20px;cursor:pointer;box-shadow:0 6px 18px -6px rgba(79,70,229,.5)';
    b.onclick = () => CZ.start();
    document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectBtn);
  else injectBtn();

  console.log('[Cloze] modo cloze (graph-aware) caricato');
})();
