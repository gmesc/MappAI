/*
 * mappai-live-reports.js — generatori HTML dei report MappAI Live (PURI)
 * ---------------------------------------------------------------------
 * Funzioni pure che ritornano documenti HTML completi e stampabili:
 *   - buildQuestionsReportHtml  → Report A: heatmap domande (giusto/sbagliato/
 *                                 bianco, assoluti + %)
 *   - buildStudentsReportHtml   → Report B: una scheda per allievo (risultati
 *                                 per domanda, accuratezza, fluenza, forti/deboli)
 *   - buildCredentialCardsHtml  → foglio credenziali stampabile (classe)
 *
 * Consumano il modello dati di mappai-live-core.js:computeResults. Usati sia dal
 * server (live-server.js: scrive i file a chiusura) sia dal browser (docente:
 * anteprima via window.open). Stili modellati su QP_BASE_STYLES/QP_PRINT_BAR di
 * mappai-quiz-print.js (quel file NON è UMD → qui duplicati, ~60 righe).
 *
 * Modulo UMD: module.exports (Node) + window.MappAILiveReports (browser).
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var BASE_STYLES = [
    "*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;box-sizing:border-box}",
    "body{font-family:'Space Mono',ui-monospace,monospace;font-size:12px;color:#0f172a;margin:0 auto;padding:24px 28px;max-width:840px;background:#f8fafc}",
    ".lr-header{text-align:center;padding:24px 16px 18px;background:#fff;border-radius:16px;margin-bottom:22px;border-bottom:3px solid #4f46e5;page-break-after:avoid}",
    ".lr-title{font-size:20px;font-weight:900;color:#0f172a}",
    ".lr-sub{font-size:11px;color:#64748b;margin-top:6px;line-height:1.6}",
    ".lr-chips{margin-top:10px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap}",
    ".lr-chip{display:inline-block;background:#eef2ff;color:#4f46e5;border-radius:999px;padding:2px 12px;font-size:10px;font-weight:bold}",
    ".lr-q{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin-bottom:12px;page-break-inside:avoid}",
    ".lr-q-head{display:flex;align-items:flex-start;gap:8px;margin-bottom:8px}",
    ".lr-q-n{flex-shrink:0;width:26px;height:26px;border-radius:8px;background:#4f46e5;color:#fff;font-weight:bold;display:flex;align-items:center;justify-content:center;font-size:12px}",
    ".lr-q-text{font-weight:700;color:#1e293b;line-height:1.4}",
    ".lr-q-meta{font-size:10px;color:#94a3b8;margin-top:2px}",
    ".lr-tag{display:inline-block;background:#f1f5f9;color:#475569;border-radius:6px;padding:1px 7px;font-size:9px;font-weight:bold;margin-left:4px}",
    ".lr-bar{display:flex;height:22px;border-radius:6px;overflow:hidden;border:1px solid #e2e8f0;margin-top:6px}",
    ".lr-seg{display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;color:#fff;min-width:0}",
    ".lr-seg-r{background:#16a34a}.lr-seg-w{background:#dc2626}.lr-seg-b{background:#94a3b8}.lr-seg-m{background:#7c3aed}",
    ".lr-legend{display:flex;gap:14px;font-size:10px;color:#64748b;margin-top:8px;flex-wrap:wrap}",
    ".lr-dot{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:middle}",
    ".lr-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;margin-bottom:14px;page-break-inside:avoid}",
    ".lr-card-head{display:flex;align-items:center;gap:12px;margin-bottom:12px;border-bottom:1px solid #f1f5f9;padding-bottom:10px}",
    ".lr-avatar{font-size:34px;line-height:1}",
    ".lr-who{font-size:16px;font-weight:900;color:#0f172a}",
    ".lr-who-sub{font-size:10px;color:#94a3b8;margin-top:2px}",
    ".lr-metrics{margin-left:auto;text-align:right}",
    ".lr-acc{font-size:22px;font-weight:900}",
    ".lr-acc-sub{font-size:9px;color:#94a3b8}",
    ".lr-strip{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0}",
    ".lr-pill{width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:#fff}",
    ".lr-pill-r{background:#16a34a}.lr-pill-w{background:#dc2626}.lr-pill-b{background:#cbd5e1;color:#475569}.lr-pill-m{background:#7c3aed}",
    ".lr-topics{display:flex;gap:16px;flex-wrap:wrap;margin-top:8px}",
    ".lr-topic-col{flex:1;min-width:180px}",
    ".lr-topic-h{font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:4px}",
    ".lr-topic-item{font-size:11px;padding:2px 0}",
    ".lr-good{color:#15803d}.lr-bad{color:#b45309}",
    ".lr-footer{text-align:center;margin-top:28px;font-size:9px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:12px}",
    ".cred-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}",
    ".cred{border:2px dashed #c7d2fe;border-radius:14px;padding:14px;text-align:center;page-break-inside:avoid}",
    ".cred-emoji{font-size:40px;line-height:1}",
    ".cred-num{font-size:24px;font-weight:900;color:#4f46e5;margin-top:2px}",
    ".cred-class{font-size:11px;color:#64748b;margin-top:6px}",
    ".cred-name{font-size:10px;color:#94a3b8;margin-top:8px;border-top:1px solid #e2e8f0;padding-top:6px;min-height:16px}",
    ".no-print{display:block}",
    "@media print{.no-print{display:none !important}body{background:#fff;padding:8px}.cred-grid{grid-template-columns:repeat(3,1fr)}}"
  ].join('');

  function printBar(label) {
    return '<div class="no-print" style="position:fixed;top:0;left:0;right:0;background:#fff;border-bottom:1px solid #e2e8f0;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;z-index:100;font-family:monospace;font-size:12px">' +
      '<span style="font-weight:bold;color:#4f46e5">MappAI Live · ' + esc(label) + '</span>' +
      '<div style="display:flex;gap:8px">' +
      '<button onclick="window.print()" style="background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:6px 16px;cursor:pointer;font-size:11px;font-weight:bold">Stampa / PDF</button>' +
      '<button onclick="window.close()" style="background:#f1f5f9;color:#475569;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px">Chiudi</button>' +
      '</div></div><div style="height:52px" class="no-print"></div>';
  }

  function docShell(title, label, bodyHtml) {
    return '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(title) + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Noto+Color+Emoji&display=swap" rel="stylesheet">' +
      '<style>' + BASE_STYLES + '</style></head><body>' +
      printBar(label) + bodyHtml +
      '<div class="lr-footer">MappAI Live · generato il ' + esc(nowStr()) + '</div>' +
      '</body></html>';
  }

  function nowStr() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // meta = { mapTitle, activity, className, dateStr, durationStr }
  function headerBlock(meta, subtitleExtra) {
    var m = meta || {};
    var sub = [m.activity, m.className, m.dateStr, m.durationStr].filter(Boolean).map(esc).join(' · ');
    return '<div class="lr-header"><div class="lr-title">' + esc(m.mapTitle || 'MappAI Live') + '</div>' +
      '<div class="lr-sub">' + sub + (subtitleExtra ? '<br>' + subtitleExtra : '') + '</div></div>';
  }

  // ── Report A: heatmap domande ───────────────────────────────────────────
  function buildQuestionsReportHtml(meta, results) {
    var r = results || {};
    var joined = r.joined || 0;
    var extra = 'Partecipanti: <b>' + joined + '</b>' + (r.absent ? ' · Assenti: ' + r.absent : '');
    var body = headerBlock(meta, extra);
    body += '<div class="lr-legend">' +
      '<span><span class="lr-dot lr-seg-r"></span>Giuste</span>' +
      '<span><span class="lr-dot lr-seg-w"></span>Sbagliate</span>' +
      '<span><span class="lr-dot lr-seg-b"></span>In bianco</span>' +
      '<span><span class="lr-dot lr-seg-m"></span>Da correggere a mano</span></div>';

    // Timeline (008): se le domande hanno un anno (tlYear), ordinale
    // cronologicamente → la heatmap diventa la heatmap della timeline.
    var pq = (r.perQuestion || []);
    if (pq.length && pq.every(function (q) { return q.tlYear != null; })) {
      pq = pq.slice().sort(function (a, b) { return a.tlYear - b.tlYear; });
    }
    pq.forEach(function (q, i) {
      var seg = function (cls, count, p) {
        if (!count) return '';
        return '<div class="lr-seg ' + cls + '" style="flex:' + count + '" title="' + count + '">' +
          (p >= 12 ? count : '') + '</div>';
      };
      var meta2 = [];
      if (q.l1Label) meta2.push('<span class="lr-tag">' + esc(q.l1Label) + '</span>');
      if (q.source === 'custom') meta2.push('<span class="lr-tag">personalizzata</span>');
      if (q.hintCount) meta2.push('<span class="lr-tag">💡 ' + q.hintCount + '</span>');
      var proposed = (q.kind === 'tf' && q.proposed) ? ('<div class="lr-q-meta">Affermazione: “' + esc(q.proposed) + '”</div>') : '';
      body += '<div class="lr-q"><div class="lr-q-head"><div class="lr-q-n">' + (i + 1) + '</div>' +
        '<div><div class="lr-q-text">' + esc(q.text || (q.kind === 'cloze' ? '(completamento)' : '')) + '</div>' +
        proposed + '<div class="lr-q-meta">' + meta2.join(' ') + '</div></div></div>' +
        '<div class="lr-bar">' +
        seg('lr-seg-r', q.right, q.pctRight) + seg('lr-seg-w', q.wrong, q.pctWrong) +
        seg('lr-seg-b', q.blank, q.pctBlank) + seg('lr-seg-m', q.manual, q.pctManual) +
        '</div>' +
        '<div class="lr-q-meta" style="margin-top:6px">' +
        'Giuste ' + q.right + ' (' + q.pctRight + '%) · Sbagliate ' + q.wrong + ' (' + q.pctWrong + '%) · ' +
        'Bianco ' + q.blank + ' (' + q.pctBlank + '%)' +
        (q.manual ? ' · A mano ' + q.manual + ' (' + q.pctManual + '%)' : '') +
        '</div></div>';
    });
    return docShell((meta && meta.mapTitle || 'Report') + ' — domande', 'Report domande', body);
  }

  // ── Report B: schede individuali ────────────────────────────────────────
  function buildStudentsReportHtml(meta, results) {
    var r = results || {};
    var body = headerBlock(meta, 'Schede individuali · ' + (r.joined || 0) + ' allievi');

    var accColor = function (p) { return p >= 80 ? '#16a34a' : p >= 50 ? '#d97706' : '#dc2626'; };
    var pillClass = { right: 'lr-pill-r', wrong: 'lr-pill-w', blank: 'lr-pill-b', manual: 'lr-pill-m' };
    var pillMark = { right: '✓', wrong: '✗', blank: '·', manual: '?' };

    (r.perStudent || []).slice().sort(function (a, b) { return b.accuracyPct - a.accuracyPct; }).forEach(function (s) {
      var strip = (s.items || []).map(function (it, i) {
        return '<div class="lr-pill ' + (pillClass[it.outcome] || 'lr-pill-b') + '" title="Domanda ' + (i + 1) + '">' +
          (pillMark[it.outcome] || '·') + '</div>';
      }).join('');
      var rate = s.medianRate != null ? (s.medianRate.toFixed(1) + '/min') : '—';
      var strengths = (s.strengths || []).length
        ? s.strengths.map(function (t) { return '<div class="lr-topic-item lr-good">▲ ' + esc(t) + '</div>'; }).join('')
        : '<div class="lr-topic-item" style="color:#cbd5e1">—</div>';
      var weaks = (s.weaknesses || []).length
        ? s.weaknesses.map(function (t) { return '<div class="lr-topic-item lr-bad">▼ ' + esc(t) + '</div>'; }).join('')
        : '<div class="lr-topic-item" style="color:#cbd5e1">—</div>';

      body += '<div class="lr-card"><div class="lr-card-head">' +
        '<div class="lr-avatar">' + esc(s.emoji) + '</div>' +
        '<div><div class="lr-who">' + esc(s.displayName) + '</div>' +
        '<div class="lr-who-sub">' + esc(s.emoji) + ' ' + esc(s.num) +
        ' · risposte ' + s.answered + '/' + (r.questionCount || (s.items || []).length) +
        (s.blankCount ? ' · ' + s.blankCount + ' in bianco' : '') +
        (s.manualCount ? ' · ' + s.manualCount + ' da correggere' : '') +
        (s.hintsUsed ? ' · 💡 ' + s.hintsUsed + ' indizi' : '') + '</div></div>' +
        '<div class="lr-metrics"><div class="lr-acc" style="color:' + accColor(s.accuracyPct) + '">' + s.accuracyPct + '%</div>' +
        '<div class="lr-acc-sub">accuratezza · fluenza ' + rate + '</div></div></div>' +
        '<div class="lr-strip">' + strip + '</div>' +
        '<div class="lr-topics"><div class="lr-topic-col"><div class="lr-topic-h">Punti di forza</div>' + strengths + '</div>' +
        '<div class="lr-topic-col"><div class="lr-topic-h">Punti deboli</div>' + weaks + '</div></div></div>';
    });

    if (!(r.perStudent || []).length) body += '<div class="lr-q" style="text-align:center;color:#94a3b8">Nessun allievo ha partecipato.</div>';
    return docShell((meta && meta.mapTitle || 'Report') + ' — allievi', 'Report allievi', body);
  }

  // ── Foglio credenziali stampabile ───────────────────────────────────────
  // klass = { name, year, students:[{emoji, emojiKey, num, name}] }
  function buildCredentialCardsHtml(klass) {
    var k = klass || {};
    var meta = { mapTitle: 'Credenziali classe', className: k.name, dateStr: k.year };
    var body = headerBlock(meta, 'Ogni allievo entra con: nome classe + emoji + numero');
    body += '<div class="cred-grid">';
    (k.students || []).forEach(function (s) {
      body += '<div class="cred"><div class="cred-emoji">' + esc(s.emoji) + '</div>' +
        '<div class="cred-num">' + esc(s.num) + '</div>' +
        '<div class="cred-class">' + esc(k.name || '') + '</div>' +
        '<div class="cred-name">' + (s.name ? esc(s.name) : 'Nome: ____________') + '</div></div>';
    });
    body += '</div>';
    return docShell('Credenziali — ' + (k.name || 'classe'), 'Credenziali', body);
  }

  var REPORTS = {
    escapeHtml: esc,
    buildQuestionsReportHtml: buildQuestionsReportHtml,
    buildStudentsReportHtml: buildStudentsReportHtml,
    buildCredentialCardsHtml: buildCredentialCardsHtml
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = REPORTS;
  if (typeof window === 'undefined') return;
  window.MappAILiveReports = REPORTS;
  console.log('[MappAILiveReports] generatori report MappAI Live caricati');
})();
