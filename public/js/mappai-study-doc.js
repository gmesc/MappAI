/*
 * mappai-study-doc.js — Costruttore documento di studio adattato (SHELL condiviso)
 * -------------------------------------------------------------------------
 * Pipeline UNICA di export HTML→PDF per le funzioni di ELABORA che producono un
 * "documento di studio": #5 raccolta per aree tematiche, #3 scheda evidenziata,
 * #4 versione col testo adattato (SlideFly, Fase A). Tutte sono "varianti di
 * corpo" dentro lo STESSO shell (header/footer/branding MappAI = la cornice #1).
 *
 * Riusa la lingua visiva di _buildSynthesisPrintHtml (Space Mono, header card,
 * toggle dislessia, stampa) e l'infra esistente: MappAIStudyExport.openPrintable,
 * electronAPI.htmlToPdf / saveVaultFile, MappAILive.shareDocQr.
 *
 * Caricato in index.html DOPO mappai-study-export-core.js. Classic script.
 * Piano: docs/slidefly-integration-plan.md.
 */
(function () {
    'use strict';

    function _t(k, f) { return window.t ? window.t(k, f) : f; }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

    // hex/rgb → rgba con alpha (tint per gli sfondi delle sezioni/frasi).
    function _rgba(color, a) {
        let c = String(color || '').trim();
        let m = /^#([0-9a-f]{3})$/i.exec(c);
        if (m) { const h = m[1]; c = '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
        m = /^#([0-9a-f]{6})$/i.exec(c);
        if (m) { const n = parseInt(m[1], 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
        m = /^rgb\(([^)]+)\)$/i.exec(c);
        if (m) return 'rgba(' + m[1].split(',').map(x => x.trim()).slice(0, 3).join(',') + ',' + a + ')';
        return c;
    }

    // Corpo "sezioni tematiche": ogni sezione = titolo colorato (macro-area) +
    // elenco di frasi/paragrafi, con banda colore a sinistra. `sections` =
    // [{ heading, color, items:[htmlEscapabile] }]. Usato da #5 (e riusabile #3/#4).
    function sectionsBody(sections) {
        return (sections || []).map(function (sec) {
            const col = sec.color || '#64748b';
            const items = (sec.items || []).map(function (it) {
                return '<div class="sd-item" style="border-left:4px solid ' + col + ';background:' + _rgba(col, 0.10) + '">' + it + '</div>';
            }).join('');
            const count = (sec.items || []).length;
            return '<section class="sd-sec">' +
                '<h3 class="sd-sec-h" style="color:' + col + ';border-bottom-color:' + _rgba(col, 0.5) + '">' +
                '<span class="sd-dot" style="background:' + col + '"></span>' + _esc(sec.heading) +
                '<span class="sd-count">' + count + '</span></h3>' +
                '<div class="sd-sec-body">' + (items || '<p class="sd-empty">' + _esc(_t('sd_sec_empty', 'Nessuna frase in questa area.')) + '</p>') + '</div>' +
                '</section>';
        }).join('');
    }

    /**
     * Costruisce il documento HTML stampabile completo.
     * @param {{title, subtitle?, mapName?, lang?, bodyHtml?, sections?, footer?,
     *          dyslexia?:boolean, accent?:string}} o
     *   - bodyHtml: HTML del corpo già pronto (ha precedenza su sections)
     *   - sections: scorciatoia per il corpo "per aree" (vedi sectionsBody)
     * @returns {string} documento HTML completo (<!DOCTYPE html>…)
     */
    function buildHtml(o) {
        o = o || {};
        const lang = (o.lang === 'en') ? 'en' : 'it';
        const accent = o.accent || '#4f46e5';
        const now = new Date().toLocaleString(lang === 'en' ? 'en-GB' : 'it-IT');
        const title = _esc(o.title || _t('sd_default_title', 'Documento di studio'));
        const sub = [o.mapName ? _esc(o.mapName) : '', o.subtitle ? _esc(o.subtitle) : '', now].filter(Boolean).join(' · ');
        const body = o.bodyHtml != null ? o.bodyHtml : sectionsBody(o.sections);
        const footer = o.footer != null ? _esc(o.footer) : ('MappAI · insegnai.ch · ' + now);
        const dysBtn = (o.dyslexia === false) ? '' :
            '<button id="sd-dys-btn" type="button" class="sd-btn sd-btn-ghost">Aa ' + _esc(_t('sd_dyslexia', 'Dislessia')) + '</button>';

        return '<!DOCTYPE html>\n<html lang="' + lang + '">\n<head>\n<meta charset="UTF-8">\n' +
            '<title>' + title + '</title>\n' +
            '<link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital@0;1&display=swap" rel="stylesheet">\n' +
            '<style>\n' +
            '* { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }\n' +
            'body { font-family:\'Space Mono\',monospace; font-size:12px; color:#1e293b; margin:0 auto; padding:24px 32px; max-width:900px; background:#f8fafc; }\n' +
            '.sd-header { text-align:center; padding:26px 16px 20px; background:#fff; border-radius:16px; margin-bottom:24px; border-bottom:2px solid ' + accent + '; }\n' +
            '.sd-title { font-size:22px; font-weight:900; color:#1e293b; }\n' +
            '.sd-sub { font-size:10px; color:#64748b; margin-top:5px; }\n' +
            '.sd-body { background:#fff; border-radius:16px; padding:24px 28px; }\n' +
            '.sd-sec { margin:0 0 22px; break-inside:avoid; }\n' +
            '.sd-sec-h { display:flex; align-items:center; gap:8px; font-size:15px; font-weight:900; margin:0 0 12px; padding-bottom:6px; border-bottom:2px solid; }\n' +
            '.sd-dot { width:12px; height:12px; border-radius:50%; flex:0 0 auto; }\n' +
            '.sd-count { margin-left:auto; font-size:10px; font-weight:700; color:#94a3b8; background:#f1f5f9; border-radius:999px; padding:1px 9px; }\n' +
            '.sd-item { font-size:12px; line-height:1.7; color:#334155; padding:8px 12px; margin:0 0 7px; border-radius:0 6px 6px 0; }\n' +
            '.sd-empty { font-size:11px; color:#94a3b8; font-style:italic; }\n' +
            '.sd-footer { text-align:center; margin-top:22px; font-size:9px; color:#94a3b8; }\n' +
            '.sd-topbar { position:fixed; top:0; left:0; right:0; background:#fff; border-bottom:1px solid #e2e8f0; padding:10px 24px; display:flex; align-items:center; justify-content:space-between; z-index:100; font-size:12px; }\n' +
            '.sd-brand { font-weight:bold; color:' + accent + '; white-space:nowrap; }\n' +
            '.sd-btn { border:none; border-radius:8px; padding:6px 14px; cursor:pointer; font:bold 11px \'Space Mono\',monospace; }\n' +
            '.sd-btn-primary { background:' + accent + '; color:#fff; }\n' +
            '.sd-btn-ghost { background:#fff; color:' + accent + '; border:1px solid #e2e8f0; }\n' +
            '.sd-btn-close { background:#f1f5f9; color:#475569; }\n' +
            /* Modalità dislessia (toggle nel documento) */
            'body.sd-dys { background:#f6efdd; }\n' +
            'body.sd-dys .sd-body { background:#fffdf6; max-width:none; }\n' +
            'body.sd-dys .sd-item { font-family:Verdana,\'Trebuchet MS\',sans-serif; font-size:15px; line-height:2.05; letter-spacing:.03em; word-spacing:.14em; color:#33312e; }\n' +
            'body.sd-dys .sd-sec-h { font-family:Verdana,sans-serif; }\n' +
            '.no-print { display:block; }\n' +
            '@media print { .no-print { display:none !important; } body { background:#fff; padding:10px; } .sd-body { padding:0; } }\n' +
            '</style>\n</head>\n<body>\n' +
            '<div class="sd-topbar no-print">' +
            '<span class="sd-brand">MappAI · ' + title + '</span>' +
            '<div style="display:flex;gap:8px;flex:0 0 auto;">' + dysBtn +
            '<button onclick="window.print()" type="button" class="sd-btn sd-btn-primary">' + _esc(_t('sd_print', 'Stampa / PDF')) + '</button>' +
            '<button onclick="window.close()" type="button" class="sd-btn sd-btn-close">' + _esc(_t('sd_close', 'Chiudi')) + '</button>' +
            '</div></div>\n' +
            '<div style="height:52px" class="no-print"></div>\n' +
            '<div class="sd-header"><div class="sd-title">' + title + '</div><div class="sd-sub">' + sub + '</div></div>\n' +
            '<div class="sd-body">' + body + '</div>\n' +
            '<div class="sd-footer">' + footer + '</div>\n' +
            '<script>(function(){var b=document.getElementById("sd-dys-btn");if(b)b.addEventListener("click",function(){document.body.classList.toggle("sd-dys");b.classList.toggle("on");});})();<\/script>\n' +
            '</body>\n</html>';
    }

    // Apre il documento in una finestra stampabile (in-app). Riusa openPrintable.
    function openDoc(html, opts) {
        opts = opts || {};
        if (window.MappAIStudyExport && window.MappAIStudyExport.openPrintable) {
            return window.MappAIStudyExport.openPrintable(html, { successMsg: opts.successMsg });
        }
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); }
        return w;
    }

    // Salva il documento come PDF su disco (IPC htmlToPdf → dialog di salvataggio,
    // gestito dal chiamante/main). Ritorna la Promise dell'IPC o null.
    function toPdf(html, fileName) {
        if (window.electronAPI && window.electronAPI.htmlToPdf) {
            return window.electronAPI.htmlToPdf({ html: html, fileName: fileName || 'documento-studio.pdf' });
        }
        // Fallback browser: apri e lascia stampare l'utente.
        openDoc(html);
        return null;
    }

    // Condivide il documento con la classe via QR (MappAI Live → Materiali).
    function shareQr(fileName, html) {
        if (window.MappAILive && window.MappAILive.shareDocQr) return window.MappAILive.shareDocQr(fileName, html);
        if (window.showToast) window.showToast(_t('lv_electron', 'Richiede l\'app desktop.'), 'warning');
        return null;
    }

    window.MappAIStudyDoc = {
        buildHtml: buildHtml,
        sectionsBody: sectionsBody,
        openDoc: openDoc,
        toPdf: toPdf,
        shareQr: shareQr,
        rgba: _rgba
    };
})();
