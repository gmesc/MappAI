'use strict';
/*
 * mappai-usage-dashboard.js — dashboard "Consumi AI" (vista in-app + stampa).
 * Apertura: window.MappAIUsageDash.open() dal bottone in fondo alla landing.
 *
 * Dati: registro JSONL su disco (via MappAIUsage.readAll), aggregati con
 * MappAIUsageCore. I costi si calcolano QUI a display-time: prezzi per 1M
 * token da MODEL_KB (matchModelKB), Google in USD convertito in CHF col
 * tasso configurabile (localStorage 'mappai_usd_chf_rate'), Infomaniak già CHF.
 *
 * Ciambelle: SVG puro (niente dipendenze), drill-down categoria → sottovoci.
 */
(function () {
    const Core = () => window.MappAIUsageCore;
    const t = (k, f) => (window.t ? window.t(k, f) : f);
    const RATE_KEY = 'mappai_usd_chf_rate';
    const RATE_DEFAULT = 0.90;

    const PALETTE = ['#6366f1', '#0ea5e9', '#f59e0b', '#10b981', '#ef4444',
        '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b'];

    const S = { records: [], selKey: null, drillCat: null };

    function _rate() {
        const v = parseFloat(localStorage.getItem(RATE_KEY));
        return (isFinite(v) && v > 0) ? v : RATE_DEFAULT;
    }
    function _kbLookup(model) {
        try { if (typeof matchModelKB === 'function') return matchModelKB(model); } catch (e) { /* noop */ }
        return null;
    }
    function _agg(records) {
        return Core().aggregate(records, { kbLookup: _kbLookup, usdChf: _rate() });
    }
    function _selRecords() {
        return S.selKey ? Core().filterByProject(S.records, S.selKey) : S.records;
    }

    // ── SVG ciambella (senza librerie: funziona anche nel report stampato) ──
    function _polar(cx, cy, r, a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
    function _arcPath(cx, cy, rOut, rIn, a0, a1) {
        const large = (a1 - a0) > Math.PI ? 1 : 0;
        const [x0, y0] = _polar(cx, cy, rOut, a0), [x1, y1] = _polar(cx, cy, rOut, a1);
        const [x2, y2] = _polar(cx, cy, rIn, a1), [x3, y3] = _polar(cx, cy, rIn, a0);
        return `M ${x0} ${y0} A ${rOut} ${rOut} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${rIn} ${rIn} 0 ${large} 0 ${x3} ${y3} Z`;
    }
    // data: [{key,label,value}] → { svg, colorOf } — slice cliccabili se clickable
    function _donutSvg(data, opts) {
        const o = opts || {};
        const size = o.size || 230, thick = o.thick || 44;
        const cx = size / 2, cy = size / 2, rOut = size / 2 - 4, rIn = rOut - thick;
        const total = data.reduce((s, d) => s + d.value, 0);
        const colorOf = {};
        let a = -Math.PI / 2, paths = '';
        data.forEach((d, i) => {
            const col = PALETTE[i % PALETTE.length];
            colorOf[d.key] = col;
            const frac = total > 0 ? d.value / total : 0;
            // slice unica a 360°: epsilon per non degenerare il path
            const a1 = a + Math.max(0.004, frac * 2 * Math.PI - 0.004);
            paths += `<path d="${_arcPath(cx, cy, rOut, rIn, a, a1)}" fill="${col}"` +
                (o.clickable ? ` data-donut-slice="${d.key}" style="cursor:pointer" ` : ' ') +
                `><title>${_esc(d.label)} — ${Core().fmtChf(d.value)}</title></path>`;
            a = a1 + 0.004;
        });
        const center = `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="15" font-weight="700" fill="#0f172a" font-family="'Space Mono',monospace">${_esc(o.centerValue || '')}</text>` +
            `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="9" fill="#64748b">${_esc(o.centerTitle || '')}</text>`;
        return {
            svg: `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${paths}${center}</svg>`,
            colorOf, total
        };
    }
    function _legend(data, colorOf, total, clickable) {
        return data.map(d => {
            const pct = total > 0 ? Math.round(d.value / total * 100) : 0;
            return `<button type="button" ${clickable ? `data-donut-slice="${d.key}"` : 'disabled'} ` +
                `class="flex items-center gap-2 w-full text-left px-2 py-1 rounded-lg ${clickable ? 'hover:bg-slate-100 cursor-pointer' : 'cursor-default'}">` +
                `<span class="w-3 h-3 rounded-full shrink-0" style="background:${colorOf[d.key]}"></span>` +
                `<span class="text-xs text-slate-700 flex-1 truncate">${_esc(d.label)}</span>` +
                `<span class="text-xs font-bold text-slate-900 whitespace-nowrap">${Core().fmtChf(d.value)}</span>` +
                `<span class="text-[10px] text-slate-400 w-8 text-right">${pct}%</span></button>`;
        }).join('');
    }
    function _esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── Tiles riepilogo ──────────────────────────────────────────────────────
    function _tile(label, value, sub) {
        return `<div class="bg-slate-50 border border-slate-200 rounded-xl p-3">` +
            `<div class="text-[10px] uppercase tracking-wide text-slate-400 font-bold">${_esc(label)}</div>` +
            `<div class="text-base font-black text-slate-900 mt-0.5" style="font-family:'Space Mono',monospace">${_esc(value)}</div>` +
            (sub ? `<div class="text-[10px] text-slate-400 mt-0.5">${_esc(sub)}</div>` : '') + `</div>`;
    }

    function _statsHtml(agg) {
        const C = Core();
        const tt = agg.totals;
        const provs = Object.keys(agg.byProvider).map(k => agg.byProvider[k].label).join(' · ') || '—';
        const models = Object.keys(agg.byModel).join(', ') || '—';
        return `<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">` +
            _tile(t('ud_calls', 'Chiamate AI'), C.fmtTok(tt.calls)) +
            _tile(t('ud_tok_in', 'Token input'), C.fmtTok(tt.inTok)) +
            _tile(t('ud_tok_out', 'Token output'), C.fmtTok(tt.outTok)) +
            _tile(t('ud_cost_in', 'Costo input'), C.fmtChf(tt.inCost)) +
            _tile(t('ud_cost_out', 'Costo output'), C.fmtChf(tt.outCost)) +
            _tile(t('ud_cost_total', 'Totale'), C.fmtChf(tt.total)) +
            `</div>` +
            `<div class="mt-3 text-xs text-slate-500"><span class="font-bold text-slate-600">${t('ud_providers', 'Provider')}:</span> ${_esc(provs)}` +
            ` &nbsp;·&nbsp; <span class="font-bold text-slate-600">${t('ud_models', 'Modelli')}:</span> <span style="font-family:'Space Mono',monospace">${_esc(models)}</span></div>` +
            (agg.unknownModels.length ? `<div class="mt-2 text-xs text-amber-600 flex items-center gap-1.5"><i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i> ${t('ud_unknown_kb', 'Prezzo sconosciuto (costo 0) per:')} ${_esc(agg.unknownModels.join(', '))}</div>` : '');
    }

    // ── Grafici ──────────────────────────────────────────────────────────────
    function _chartsHtml(agg) {
        const C = Core();
        let catData, catTitle, crumbs = '';
        if (S.drillCat && agg.byCat[S.drillCat]) {
            catData = C.donutBySub(agg, S.drillCat);
            catTitle = agg.byCat[S.drillCat].label;
            crumbs = `<button type="button" id="ud-drill-back" class="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 mb-1">` +
                `<i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> ${t('ud_back_cats', 'Tutte le categorie')}</button>`;
        } else {
            S.drillCat = null;
            catData = C.donutByCat(agg);
            catTitle = t('ud_by_category', 'Per categoria');
        }
        const catTotal = catData.reduce((s, d) => s + d.value, 0);
        const dc = _donutSvg(catData, { clickable: !S.drillCat, centerValue: C.fmtChf(catTotal), centerTitle: t('ud_total', 'totale') });
        const modData = C.donutByModel(agg);
        const dm = _donutSvg(modData, { centerValue: C.fmtChf(agg.totals.total), centerTitle: t('ud_total', 'totale') });

        const empty = `<div class="text-sm text-slate-400 italic p-6">${t('ud_no_cost', 'Nessun costo da mostrare (tutti i valori a zero).')}</div>`;
        return `<div class="flex flex-wrap gap-5 mt-5">` +
            `<div class="flex-1 min-w-[300px] bg-white border border-slate-200 rounded-2xl p-4" id="ud-chart-cat">` +
            `${crumbs}<h3 class="text-sm font-black text-slate-800 mb-1">${_esc(catTitle)}</h3>` +
            `<p class="text-[11px] text-slate-400 mb-2">${S.drillCat ? t('ud_hint_sub', 'Dettaglio della categoria selezionata') : t('ud_hint_click', 'Clicca una fetta per il dettaglio')}</p>` +
            (catData.length ? `<div class="flex flex-wrap items-center gap-4"><div>${dc.svg}</div><div class="flex-1 min-w-[200px]">${_legend(catData, dc.colorOf, dc.total, !S.drillCat)}</div></div>` : empty) +
            `</div>` +
            `<div class="flex-1 min-w-[300px] bg-white border border-slate-200 rounded-2xl p-4">` +
            `<h3 class="text-sm font-black text-slate-800 mb-1">${t('ud_by_model', 'Per modello')}</h3>` +
            `<p class="text-[11px] text-slate-400 mb-2">${t('ud_hint_model', 'Costo per ciascun modello usato')}</p>` +
            (modData.length ? `<div class="flex flex-wrap items-center gap-4"><div>${dm.svg}</div><div class="flex-1 min-w-[200px]">${_legend(modData, dm.colorOf, dm.total, false)}</div></div>` : empty) +
            `</div></div>`;
    }

    // ── Tabella dettaglio (alternativa accessibile ai grafici) ──────────────
    function _tableHtml(agg) {
        const C = Core();
        let rows = '';
        Object.keys(agg.byCat).forEach(cat => {
            const c = agg.byCat[cat];
            rows += `<tr class="bg-slate-50 font-bold"><td class="px-3 py-1.5">${_esc(c.label)}</td>` +
                `<td class="px-3 py-1.5 text-right">${C.fmtTok(c.calls)}</td>` +
                `<td class="px-3 py-1.5 text-right">${C.fmtTok(c.inTok)}</td>` +
                `<td class="px-3 py-1.5 text-right">${C.fmtTok(c.outTok)}</td>` +
                `<td class="px-3 py-1.5 text-right">${C.fmtChf(c.inCost)}</td>` +
                `<td class="px-3 py-1.5 text-right">${C.fmtChf(c.outCost)}</td>` +
                `<td class="px-3 py-1.5 text-right">${C.fmtChf(c.total)}</td></tr>`;
            Object.keys(c.bySub).forEach(sub => {
                const s = c.bySub[sub];
                rows += `<tr class="text-slate-600"><td class="px-3 py-1 pl-7">${_esc(s.label)}</td>` +
                    `<td class="px-3 py-1 text-right">${C.fmtTok(s.calls)}</td>` +
                    `<td class="px-3 py-1 text-right">${C.fmtTok(s.inTok)}</td>` +
                    `<td class="px-3 py-1 text-right">${C.fmtTok(s.outTok)}</td>` +
                    `<td class="px-3 py-1 text-right">${C.fmtChf(s.inCost)}</td>` +
                    `<td class="px-3 py-1 text-right">${C.fmtChf(s.outCost)}</td>` +
                    `<td class="px-3 py-1 text-right">${C.fmtChf(s.total)}</td></tr>`;
            });
        });
        if (!rows) return '';
        return `<div class="mt-5 bg-white border border-slate-200 rounded-2xl overflow-hidden">` +
            `<h3 class="text-sm font-black text-slate-800 px-4 pt-4">${t('ud_table_title', 'Dettaglio voci')}</h3>` +
            `<div class="overflow-x-auto mt-2"><table class="w-full text-xs">` +
            `<thead><tr class="text-slate-400 uppercase text-[10px] tracking-wide border-b border-slate-200">` +
            `<th class="px-3 py-2 text-left">${t('ud_col_item', 'Voce')}</th><th class="px-3 py-2 text-right">${t('ud_calls', 'Chiamate AI')}</th>` +
            `<th class="px-3 py-2 text-right">${t('ud_tok_in', 'Token input')}</th><th class="px-3 py-2 text-right">${t('ud_tok_out', 'Token output')}</th>` +
            `<th class="px-3 py-2 text-right">${t('ud_cost_in', 'Costo input')}</th><th class="px-3 py-2 text-right">${t('ud_cost_out', 'Costo output')}</th>` +
            `<th class="px-3 py-2 text-right">${t('ud_cost_total', 'Totale')}</th></tr></thead>` +
            `<tbody class="divide-y divide-slate-100">${rows}</tbody></table></div></div>`;
    }

    // ── Lista documenti (progetti/mappe) ─────────────────────────────────────
    function _docsHtml() {
        const C = Core();
        const projects = C.listProjects(S.records);
        const btn = (key, label, meta, active) =>
            `<button type="button" data-ud-doc="${_esc(key || '')}" class="w-full text-left px-3 py-2 rounded-xl mb-1 border ${active ? 'border-indigo-300 bg-indigo-50' : 'border-transparent hover:bg-slate-100'}">` +
            `<div class="text-xs font-bold ${active ? 'text-indigo-700' : 'text-slate-700'} truncate">${_esc(label)}</div>` +
            (meta ? `<div class="text-[10px] text-slate-400 mt-0.5">${_esc(meta)}</div>` : '') + `</button>`;
        let html = `<div class="text-[10px] uppercase tracking-wide text-slate-400 font-bold px-2 pb-2">${t('ud_docs', 'Documenti')}</div>`;
        html += btn('', t('ud_all_maps', 'Tutte le mappe'), S.records.length + ' record', !S.selKey);
        projects.forEach(p => {
            const agg = _agg(C.filterByProject(S.records, p.key));
            html += btn(p.key, p.label, C.fmtChf(agg.totals.total) + ' · ' + p.calls + ' ' + t('ud_calls_short', 'chiamate'), S.selKey === p.key);
        });
        return html;
    }

    // ── Report stampabile ────────────────────────────────────────────────────
    function _printReport() {
        const C = Core();
        const recs = _selRecords();
        const agg = _agg(recs);
        const catData = C.donutByCat(agg);
        const dc = _donutSvg(catData, { clickable: false, centerValue: C.fmtChf(agg.totals.total), centerTitle: 'totale' });
        const docLabel = S.selKey ? (C.listProjects(recs)[0] || {}).label || '' : t('ud_all_maps', 'Tutte le mappe');
        const today = new Date().toLocaleDateString('it-CH');
        let subTables = '';
        Object.keys(agg.byCat).forEach(cat => {
            const c = agg.byCat[cat];
            const subData = C.donutBySub(agg, cat);
            const ds = subData.length > 1 ? _donutSvg(subData, { size: 170, thick: 34, centerValue: C.fmtChf(c.total), centerTitle: '' }) : null;
            subTables += `<div class="cat-block"><h3>${_esc(c.label)} — ${C.fmtChf(c.total)}</h3><div class="cat-flex">` +
                (ds ? `<div>${ds.svg}</div>` : '') +
                `<table><thead><tr><th>Voce</th><th>Chiamate</th><th>Tok in</th><th>Tok out</th><th>Costo</th></tr></thead><tbody>` +
                Object.keys(c.bySub).map(sub => {
                    const s = c.bySub[sub];
                    return `<tr><td>${_esc(s.label)}</td><td>${C.fmtTok(s.calls)}</td><td>${C.fmtTok(s.inTok)}</td><td>${C.fmtTok(s.outTok)}</td><td>${C.fmtChf(s.total)}</td></tr>`;
                }).join('') + `</tbody></table></div></div>`;
        });
        const modelRows = Object.keys(agg.byModel).map(m => {
            const b = agg.byModel[m];
            return `<tr><td>${_esc(m)}</td><td>${b.provider === 'infomaniak' ? 'Infomaniak' : 'Google'}</td><td>${C.fmtTok(b.inTok)}</td><td>${C.fmtTok(b.outTok)}</td><td>${C.fmtChf(b.total)}</td></tr>`;
        }).join('');
        const html = `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">
<title>Consumi AI — ${_esc(docLabel)}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Noto+Color+Emoji&display=swap" rel="stylesheet">
<style>
 body{font-family:'Space Mono',monospace;color:#0f172a;margin:0;background:#fff}
 .topbar{position:sticky;top:0;background:#eef2ff;border-bottom:2px solid #6366f1;padding:10px 24px;display:flex;align-items:center;gap:12px}
 .topbar h1{font-size:15px;margin:0;flex:1}
 .topbar button{font-family:'Space Mono',monospace;font-weight:700;font-size:12px;padding:6px 14px;border:2px solid #6366f1;border-radius:8px;background:#6366f1;color:#fff;cursor:pointer}
 main{max-width:820px;margin:0 auto;padding:24px}
 .meta{font-size:11px;color:#64748b;margin-bottom:16px}
 table{border-collapse:collapse;width:100%;font-size:11px;margin:8px 0 20px}
 th,td{border:1px solid #cbd5e1;padding:4px 8px;text-align:left}
 th{background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
 td:nth-child(n+2),th:nth-child(n+2){text-align:right}
 h2{font-size:14px;border-bottom:2px solid #6366f1;padding-bottom:4px;margin-top:28px}
 h3{font-size:12px;margin:14px 0 4px}
 .cat-flex{display:flex;gap:16px;align-items:flex-start}
 .cat-flex table{flex:1}
 .cat-block{page-break-inside:avoid}
 .donut-wrap{text-align:center;margin:12px 0}
 @media print {.topbar{display:none}}
</style></head><body>
<div class="topbar"><h1>MappAI — ${t('ud_title', 'Consumi AI')}</h1><button onclick="window.print()">${t('ud_print', 'Stampa')}</button></div>
<main>
 <div class="meta">${t('ud_doc', 'Documento')}: <b>${_esc(docLabel)}</b> · ${t('ud_generated', 'Generato il')} ${today} · ${t('ud_rate', 'Tasso USD→CHF')}: ${_rate()}</div>
 <h2>${t('ud_summary', 'Riepilogo')}</h2>
 <table><tbody>
  <tr><td>${t('ud_calls', 'Chiamate AI')}</td><td>${C.fmtTok(agg.totals.calls)}</td></tr>
  <tr><td>${t('ud_tok_in', 'Token input')}</td><td>${C.fmtTok(agg.totals.inTok)}</td></tr>
  <tr><td>${t('ud_tok_out', 'Token output')}</td><td>${C.fmtTok(agg.totals.outTok)}</td></tr>
  <tr><td>${t('ud_cost_in', 'Costo input')}</td><td>${C.fmtChf(agg.totals.inCost)}</td></tr>
  <tr><td>${t('ud_cost_out', 'Costo output')}</td><td>${C.fmtChf(agg.totals.outCost)}</td></tr>
  <tr><td><b>${t('ud_cost_total', 'Totale')}</b></td><td><b>${C.fmtChf(agg.totals.total)}</b></td></tr>
 </tbody></table>
 ${catData.length ? `<div class="donut-wrap">${dc.svg}</div>` : ''}
 <h2>${t('ud_by_category', 'Per categoria')}</h2>
 ${subTables || '<p>—</p>'}
 <h2>${t('ud_by_model', 'Per modello')}</h2>
 <table><thead><tr><th>${t('ud_models', 'Modelli')}</th><th>Provider</th><th>Tok in</th><th>Tok out</th><th>Costo</th></tr></thead><tbody>${modelRows || ''}</tbody></table>
</main></body></html>`;
        const w = window.open('', '_blank');
        if (!w) { window.showToast && window.showToast(t('ud_popup_blocked', 'Popup bloccato dal browser'), 'error'); return; }
        w.document.write(html);
        w.document.close();
    }

    // ── Render principale ────────────────────────────────────────────────────
    function _render() {
        const overlay = document.getElementById('usage-dash-overlay');
        if (!overlay) return;
        const agg = _agg(_selRecords());
        overlay.querySelector('#ud-docs').innerHTML = _docsHtml();
        const main = overlay.querySelector('#ud-main');
        if (!S.records.length) {
            main.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-center p-10">` +
                `<i data-lucide="pie-chart" class="w-12 h-12 text-slate-300 mb-3"></i>` +
                `<p class="text-sm font-bold text-slate-500">${t('ud_empty_title', 'Nessun consumo registrato')}</p>` +
                `<p class="text-xs text-slate-400 mt-1 max-w-sm">${t('ud_empty_hint', 'Il registro parte da adesso: genera una mappa o un materiale di studio e qui compariranno token e costi di ogni operazione AI.')}</p></div>`;
        } else {
            main.innerHTML = _statsHtml(agg) + _chartsHtml(agg) + _tableHtml(agg);
        }
        // interazioni drill-down + selezione documento
        main.querySelectorAll('[data-donut-slice]').forEach(el => {
            el.addEventListener('click', () => { S.drillCat = el.getAttribute('data-donut-slice'); _render(); });
        });
        const back = main.querySelector('#ud-drill-back');
        if (back) back.addEventListener('click', () => { S.drillCat = null; _render(); });
        overlay.querySelectorAll('[data-ud-doc]').forEach(el => {
            el.addEventListener('click', () => {
                const k = el.getAttribute('data-ud-doc') || null;
                S.selKey = k || null; S.drillCat = null; _render();
            });
        });
        window.safeCreateIcons && window.safeCreateIcons();
    }

    function _close() {
        const el = document.getElementById('usage-dash-overlay');
        if (el) el.remove();
        document.removeEventListener('keydown', _escHandler);
    }
    function _escHandler(e) { if (e.key === 'Escape') _close(); }

    async function open() {
        if (!Core()) { console.error('[usage-dash] MappAIUsageCore mancante'); return; }
        _close();
        S.selKey = null; S.drillCat = null;
        S.records = window.MappAIUsage ? await window.MappAIUsage.readAll() : [];

        const overlay = document.createElement('div');
        overlay.id = 'usage-dash-overlay';
        overlay.className = 'fixed inset-0 z-[1200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4';
        overlay.innerHTML =
            `<div class="bg-white rounded-2xl shadow-2xl w-full max-w-[1160px] h-[88vh] flex flex-col overflow-hidden" role="dialog" aria-modal="true" aria-label="${t('ud_title', 'Consumi AI')}">` +
            `<div class="px-6 py-4 border-b border-slate-200 flex items-center gap-3 flex-wrap">` +
            `<div class="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0"><i data-lucide="coins" class="w-5 h-5"></i></div>` +
            `<div class="min-w-0"><h2 class="text-base font-black text-slate-900 leading-tight">${t('ud_title', 'Consumi AI')}</h2>` +
            `<p class="text-[11px] text-slate-400">${t('ud_subtitle', 'Registro locale di token e costi delle generazioni AI')}</p></div>` +
            `<div class="flex-1"></div>` +
            `<label class="flex items-center gap-1.5 text-[11px] text-slate-500 font-bold">${t('ud_rate', 'Tasso USD→CHF')}` +
            `<input type="number" id="ud-rate" step="0.01" min="0.1" max="3" value="${_rate()}" class="w-20 border border-slate-300 rounded-lg px-2 py-1 text-xs text-right"></label>` +
            (window.electronAPI && window.electronAPI.usageOpenFolder
                ? `<button type="button" id="ud-folder" data-tip="${t('ud_tip_folder', 'Apri la cartella del registro su disco')}" class="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300"><i data-lucide="folder-open" class="w-4 h-4"></i></button>` : '') +
            `<button type="button" id="ud-print" data-tip="${t('ud_tip_print', 'Genera il report stampabile')}" class="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300"><i data-lucide="printer" class="w-4 h-4"></i></button>` +
            `<button type="button" id="ud-close" class="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-300"><i data-lucide="x" class="w-4 h-4"></i></button>` +
            `</div>` +
            `<div class="flex-1 flex min-h-0">` +
            `<aside id="ud-docs" class="w-60 shrink-0 border-r border-slate-200 overflow-y-auto p-3 bg-slate-50/50"></aside>` +
            `<main id="ud-main" class="flex-1 overflow-y-auto p-5 bg-slate-50/30"></main>` +
            `</div></div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) _close(); });
        overlay.querySelector('#ud-close').addEventListener('click', _close);
        overlay.querySelector('#ud-print').addEventListener('click', _printReport);
        const folderBtn = overlay.querySelector('#ud-folder');
        if (folderBtn) folderBtn.addEventListener('click', () => window.electronAPI.usageOpenFolder());
        overlay.querySelector('#ud-rate').addEventListener('change', (e) => {
            const v = parseFloat(e.target.value);
            if (isFinite(v) && v > 0) localStorage.setItem(RATE_KEY, String(v));
            _render();
        });
        document.addEventListener('keydown', _escHandler);
        _render();
        window.safeCreateIcons && window.safeCreateIcons();
    }

    window.MappAIUsageDash = { open };
})();
