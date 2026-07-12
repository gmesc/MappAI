/*
 * mappai-tutor-reports.js — report HTML "Chatta e Scrivi" (007, PURO)
 * --------------------------------------------------------------------
 * buildTutorReportHtml(results) → documento HTML completo e stampabile:
 * una scheda per studente con TESTO CONSEGNATO + TRASCRIZIONE CHAT affiancati
 * (il docente vede il processo, non solo il prodotto). Consuma il modello dati
 * di mappai-tutor-core.js:computeTutorResults. Usato dal server (scrive il file
 * a chiusura) e dal browser (anteprima docente).
 *
 * Modulo UMD: module.exports (Node) + window.MappAITutorReports (browser).
 * Stili modellati su mappai-live-reports.js (Space Mono, palette MappAI).
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var BASE_STYLES = [
    "*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;box-sizing:border-box}",
    "body{font-family:'Space Mono',ui-monospace,monospace;font-size:12px;color:#0f172a;margin:0 auto;padding:24px 28px;max-width:900px;background:#f8fafc}",
    ".tr-header{text-align:center;padding:24px 16px 18px;background:#fff;border-radius:16px;margin-bottom:22px;border-bottom:3px solid #4f46e5;page-break-after:avoid}",
    ".tr-title{font-size:20px;font-weight:900;color:#0f172a}",
    ".tr-sub{font-size:11px;color:#64748b;margin-top:6px;line-height:1.6}",
    ".tr-chips{margin-top:10px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap}",
    ".tr-chip{display:inline-block;background:#eef2ff;color:#4f46e5;border-radius:999px;padding:2px 12px;font-size:10px;font-weight:bold}",
    ".tr-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;margin-bottom:18px;page-break-inside:avoid}",
    ".tr-stud{display:flex;align-items:center;gap:10px;margin-bottom:10px;border-bottom:1px solid #f1f5f9;padding-bottom:8px}",
    ".tr-ident{font-size:15px;font-weight:900;color:#0f172a}",
    ".tr-meta{font-size:10px;color:#94a3b8}",
    ".tr-flag{display:inline-block;background:#fef3c7;color:#92400e;border-radius:6px;padding:1px 8px;font-size:9px;font-weight:bold;margin-left:6px}",
    ".tr-ok{display:inline-block;background:#dcfce7;color:#166534;border-radius:6px;padding:1px 8px;font-size:9px;font-weight:bold;margin-left:6px}",
    ".tr-cols{display:flex;gap:14px;align-items:flex-start}",
    ".tr-col{flex:1;min-width:0}",
    ".tr-col-title{font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:6px}",
    ".tr-text{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;white-space:pre-wrap;line-height:1.55;font-size:11.5px}",
    ".tr-empty{color:#94a3b8;font-style:italic}",
    ".tr-turn{margin-bottom:8px;padding:7px 10px;border-radius:10px;font-size:11px;line-height:1.5}",
    ".tr-turn.u{background:#ecfdf5;border:1px solid #bbf7d0}",
    ".tr-turn.t{background:#eef2ff;border:1px solid #e0e7ff}",
    ".tr-role{font-size:9px;font-weight:bold;text-transform:uppercase;color:#64748b;display:block;margin-bottom:2px}",
    "@media print{.tr-noprint{display:none !important}body{background:#fff}}",
    ".tr-noprint{position:sticky;top:0;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:8px 12px;margin-bottom:14px;text-align:center}",
    ".tr-noprint button{background:#4f46e5;color:#fff;border:0;border-radius:8px;padding:8px 18px;font:inherit;font-weight:bold;cursor:pointer}"
  ].join('\n');

  function turnHtml(t) {
    var cls = t.role === 'tutor' ? 't' : 'u';
    var label = t.role === 'tutor' ? 'Tutor' : 'Studente';
    return '<div class="tr-turn ' + cls + '"><span class="tr-role">' + label + '</span>' + esc(t.text) + '</div>';
  }

  function studentCard(st) {
    var badge = st.submitted
      ? '<span class="tr-ok">consegnato</span>'
      : '<span class="tr-flag">non consegnato</span>';
    var never = st.neverChatted ? '<span class="tr-flag">0 scambi col tutor</span>' : '';
    var ident = esc(st.identity.emojiKey + ' ' + st.identity.num) + (st.name ? ' · ' + esc(st.name) : '');
    var textCol = st.submissionText
      ? '<div class="tr-text">' + esc(st.submissionText) + '</div>'
      : '<div class="tr-text tr-empty">Nessun testo consegnato.</div>';
    var chatCol = st.transcript.length
      ? st.transcript.map(turnHtml).join('')
      : '<div class="tr-text tr-empty">Nessuna chat.</div>';
    return '<div class="tr-card">' +
      '<div class="tr-stud"><span class="tr-ident">' + ident + '</span>' + badge + never +
      '<span style="flex:1"></span><span class="tr-meta">' + st.used + '/' + st.cap + ' scambi</span></div>' +
      '<div class="tr-cols">' +
      '<div class="tr-col"><div class="tr-col-title">Testo consegnato</div>' + textCol + '</div>' +
      '<div class="tr-col"><div class="tr-col-title">Chat col tutor (processo)</div>' + chatCol + '</div>' +
      '</div></div>';
  }

  function buildTutorReportHtml(results) {
    var s = (results && results.session) || {};
    var students = (results && results.students) || [];
    var chips = [
      s.className, s.topic, 'Modalità: ' + (s.mode || ''), 'Cap ' + (s.cap || '') + ' scambi'
    ].filter(Boolean).map(function (c) { return '<span class="tr-chip">' + esc(c) + '</span>'; }).join('');
    return '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Chatta e Scrivi — ' + esc(s.name || '') + '</title>' +
      '<style>' + BASE_STYLES + '</style></head><body>' +
      '<div class="tr-noprint"><button onclick="window.print()">Stampa / Salva PDF</button></div>' +
      '<div class="tr-header"><div class="tr-title">Chatta e Scrivi — ' + esc(s.name || '') + '</div>' +
      '<div class="tr-sub">' + esc(s.writingBrief || '') + '</div>' +
      '<div class="tr-chips">' + chips + '</div></div>' +
      (students.length ? students.map(studentCard).join('') :
        '<div class="tr-card tr-empty">Nessuno studente ha partecipato.</div>') +
      '</body></html>';
  }

  var API = { buildTutorReportHtml: buildTutorReportHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window === 'undefined') return;
  window.MappAITutorReports = API;
  console.log('[MappAITutorReports] report Chatta-e-Scrivi caricato');
})();
