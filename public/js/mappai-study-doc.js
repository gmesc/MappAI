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
        // Pannello Leggibilità (OpenDyslexic + Bionic, ognuno coi propri settaggi).
        // Escludibile con o.readability === false.
        const readBtn = (o.readability === false) ? '' :
            '<button id="sd-readbtn" type="button" class="sd-btn sd-btn-ghost">' + _esc(_t('sd_readability', 'Leggibilità')) + '</button>';
        const readPanel = (o.readability === false) ? '' :
            '<div id="sd-read-panel" class="sd-read-panel no-print">' +
            '<div class="sd-read-h">' + _esc(_t('sd_read_title', 'Leggibilità')) + '</div>' +
            '<label class="sd-read-row"><span>' + _esc(_t('sd_odys', 'Font OpenDyslexic')) + '</span><input type="checkbox" id="sd-odys"></label>' +
            '<label class="sd-read-row"><span>' + _esc(_t('sd_letter', 'Spazio lettere')) + '</span><input type="range" id="sd-ls" min="0" max="0.3" step="0.01" value="0"></label>' +
            '<label class="sd-read-row"><span>' + _esc(_t('sd_word', 'Spazio parole')) + '</span><input type="range" id="sd-ws" min="0" max="0.6" step="0.02" value="0"></label>' +
            '<div class="sd-read-sep"></div>' +
            '<label class="sd-read-row"><span>' + _esc(_t('sd_bionic', 'Lettura bionica')) + '</span><input type="checkbox" id="sd-bio"></label>' +
            '<label class="sd-read-row"><span>' + _esc(_t('sd_fixation', 'Fissazione')) + '</span><input type="range" id="sd-fix" min="1" max="5" step="1" value="3"></label>' +
            '</div>';

        return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital@0;1&display=swap" rel="stylesheet">
<style>
@font-face { font-family:'OpenDyslexic'; font-weight:400; font-display:swap; src:url('https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/woff/OpenDyslexic-Regular.woff') format('woff'); }
@font-face { font-family:'OpenDyslexic'; font-weight:700; font-display:swap; src:url('https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/woff/OpenDyslexic-Bold.woff') format('woff'); }
* { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
body { font-family:'Space Mono',monospace; font-size:12px; color:#1e293b; margin:0 auto; padding:24px 32px; max-width:900px; background:#f8fafc; --sd-ls:0em; --sd-ws:0em; }
.sd-header { text-align:center; padding:26px 16px 20px; background:#fff; border-radius:16px; margin-bottom:24px; border-bottom:2px solid ${accent}; }
.sd-title { font-size:22px; font-weight:900; color:#1e293b; }
.sd-sub { font-size:10px; color:#64748b; margin-top:5px; }
.sd-body { background:#fff; border-radius:16px; padding:24px 28px; }
.sd-sec { margin:0 0 22px; break-inside:avoid; }
.sd-sec-h { display:flex; align-items:center; gap:8px; font-size:15px; font-weight:900; margin:0 0 12px; padding-bottom:6px; border-bottom:2px solid; }
.sd-dot { width:12px; height:12px; border-radius:50%; flex:0 0 auto; }
.sd-count { margin-left:auto; font-size:10px; font-weight:700; color:#94a3b8; background:#f1f5f9; border-radius:999px; padding:1px 9px; }
.sd-item { font-size:12px; line-height:1.7; color:#334155; padding:8px 12px; margin:0 0 7px; border-radius:0 6px 6px 0; letter-spacing:var(--sd-ls); word-spacing:var(--sd-ws); }
.sd-body p { font-size:12px; line-height:1.85; color:#334155; margin:0 0 12px; letter-spacing:var(--sd-ls); word-spacing:var(--sd-ws); }
.sd-source span { border-radius:3px; }
.sd-empty { font-size:11px; color:#94a3b8; font-style:italic; }
.sd-footer { text-align:center; margin-top:22px; font-size:9px; color:#94a3b8; }
b.sd-bio { font-weight:700; color:inherit; }
/* OpenDyslexic (toggle nel pannello Leggibilità) */
body.sd-odys { background:#f6efdd; }
body.sd-odys .sd-body { background:#fffdf6; max-width:none; }
body.sd-odys .sd-body p, body.sd-odys .sd-item { font-family:'OpenDyslexic',Verdana,'Trebuchet MS',sans-serif; font-size:15px; line-height:2.05; color:#33312e; }
body.sd-odys .sd-sec-h { font-family:'OpenDyslexic',Verdana,sans-serif; }
.sd-topbar { position:fixed; top:0; left:0; right:0; background:#fff; border-bottom:1px solid #e2e8f0; padding:10px 24px; display:flex; align-items:center; justify-content:space-between; z-index:100; font-size:12px; }
.sd-brand { font-weight:bold; color:${accent}; white-space:nowrap; }
.sd-btn { border:none; border-radius:8px; padding:6px 14px; cursor:pointer; font:bold 11px 'Space Mono',monospace; }
.sd-btn-primary { background:${accent}; color:#fff; }
.sd-btn-ghost { background:#fff; color:${accent}; border:1px solid #e2e8f0; }
.sd-btn-ghost.on { background:#eef2ff; }
.sd-btn-close { background:#f1f5f9; color:#475569; }
.sd-read-panel { position:fixed; top:54px; right:14px; background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:12px 16px; z-index:101; box-shadow:0 12px 34px rgba(15,23,42,.14); display:none; min-width:236px; }
.sd-read-panel.open { display:block; }
.sd-read-h { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#94a3b8; margin-bottom:8px; }
.sd-read-row { display:flex; align-items:center; justify-content:space-between; gap:14px; margin:9px 0; font-size:11px; font-weight:700; color:#475569; cursor:pointer; }
.sd-read-row input[type=range] { width:112px; accent-color:${accent}; }
.sd-read-row input[type=checkbox] { width:16px; height:16px; accent-color:${accent}; }
.sd-read-sep { height:1px; background:#eef2f6; margin:10px 0; }
.no-print { display:block; }
@media print { .no-print { display:none !important; } body { background:#fff; padding:10px; } .sd-body { padding:0; } }
</style>
</head>
<body>
<div class="sd-topbar no-print">
<span class="sd-brand">MappAI · ${title}</span>
<div style="display:flex;gap:8px;flex:0 0 auto;">${readBtn}<button onclick="window.print()" type="button" class="sd-btn sd-btn-primary">${_esc(_t('sd_print', 'Stampa / PDF'))}</button><button onclick="window.close()" type="button" class="sd-btn sd-btn-close">${_esc(_t('sd_close', 'Chiudi'))}</button></div>
</div>
${readPanel}
<div style="height:52px" class="no-print"></div>
<div class="sd-header"><div class="sd-title">${title}</div><div class="sd-sub">${sub}</div></div>
<div class="sd-body">${body}</div>
<div class="sd-footer">${footer}</div>
<script>
(function(){
  var $=function(id){return document.getElementById(id);};
  var body=document.body, panel=$('sd-read-panel'), btn=$('sd-readbtn');
  if(btn&&panel){ btn.addEventListener('click',function(){ panel.classList.toggle('open'); btn.classList.toggle('on'); }); }
  var odys=$('sd-odys'), ls=$('sd-ls'), ws=$('sd-ws'), bio=$('sd-bio'), fix=$('sd-fix');
  if(odys) odys.addEventListener('change',function(){ body.classList.toggle('sd-odys', odys.checked); });
  function sp(){ body.style.setProperty('--sd-ls',((ls&&ls.value)||0)+'em'); body.style.setProperty('--sd-ws',((ws&&ws.value)||0)+'em'); }
  if(ls) ls.addEventListener('input',sp); if(ws) ws.addEventListener('input',sp);
  var bodyEl=document.querySelector('.sd-body'), saved=bodyEl?bodyEl.innerHTML:null;
  function frac(){ return 0.2 + (parseInt((fix&&fix.value)||3,10)||3)*0.1; }
  function bionify(){
    if(!bodyEl||saved==null) return; bodyEl.innerHTML=saved; var f=frac();
    var w=document.createTreeWalker(bodyEl,NodeFilter.SHOW_TEXT,{acceptNode:function(n){var p=n.parentNode; if(!p) return NodeFilter.FILTER_REJECT; var tg=p.tagName?p.tagName.toLowerCase():''; if(tg==='b'||tg==='style'||tg==='script'||tg==='button') return NodeFilter.FILTER_REJECT; return NodeFilter.FILTER_ACCEPT;}});
    var arr=[],n; while((n=w.nextNode())) arr.push(n);
    arr.forEach(function(tn){
      var parts=tn.nodeValue.split(/(\\s+)/), frag=document.createDocumentFragment();
      parts.forEach(function(tok){ if(!tok) return; if(/^\\s+$/.test(tok)){ frag.appendChild(document.createTextNode(tok)); return; } var k=Math.max(1,Math.round(tok.length*f)); var b=document.createElement('b'); b.className='sd-bio'; b.textContent=tok.slice(0,k); frag.appendChild(b); frag.appendChild(document.createTextNode(tok.slice(k))); });
      if(tn.parentNode) tn.parentNode.replaceChild(frag,tn);
    });
  }
  function updateBio(){ if(!bodyEl||saved==null) return; if(bio&&bio.checked){ bionify(); } else { bodyEl.innerHTML=saved; } }
  if(bio) bio.addEventListener('change',updateBio);
  if(fix) fix.addEventListener('input',function(){ if(bio&&bio.checked) bionify(); });
})();
<\/script>
</body>
</html>`;
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
