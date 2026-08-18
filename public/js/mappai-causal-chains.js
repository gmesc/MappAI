'use strict';

    /* Il CARATTERE di questo documento: le @font-face + la variabile --doc-font
       che la regola del `body` legge. Un documento in finestra propria non carica
       style.css, quindi `--app-font` lì non esiste: il blocco va scritto dentro.
       Argomento = la scelta fatta in ELABORA per QUESTO documento; senza, comanda
       il carattere dell'app (18/8/26). */
    function _fontDoc(id) {
        try {
            return (typeof window !== 'undefined' && window.MappAIFont)
                ? window.MappAIFont.styleDocumento(id) : '';
        } catch (e) { return ''; }
    }

/*
 * mappai-causal-chains.js — «Catena dei perché»: superfici UI sopra mappai-causal-core.js.
 *
 * 1. Documento stampabile indipendente (window.MappAICausal.openDoc): nessi
 *    causa-effetto per ramo + ponti tra rami, colori per famiglia (EDGE_FAMILIES),
 *    badge origine (mappa/testo), MODALITÀ ESERCIZIO (connettivi nascosti da
 *    completare a penna). Archiviato in MappAIStudyDocs (kind 'causal').
 * 2. Scaffold per la sintesi (triplesFor/promptBlockFromTriples/htmlBlock):
 *    usato da mappai-branch-synthesis.js — nessi nel prompt + box nel documento.
 * 3. Pagine PDF per il Foglio nodi (appendPdfPages): chiamato da
 *    mappai-print-dossier.js se la checkbox è attiva.
 *
 * Estrazione DETERMINISTICA: zero chiamate AI, zero token.
 * Caricato in index.html dopo mappai-causal-core.js.
 */
(function () {
    const t = (k, f) => (window.t ? window.t(k, f) : f);

    function _getAppState() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }

    // Colore/etichetta famiglia dalla tassonomia unica (regola 12); fallback neutro.
    const _FAM_FALLBACK = {
        trasformazione: { color: 'hsl(28,85%,42%)', label: 'Causa / Effetto' },
        dipendenza: { color: 'hsl(265,70%,46%)', label: 'Dipendenza / Prerequisito' },
        sequenza: { color: 'hsl(200,80%,38%)', label: 'Sequenza / Processo' },
        opposizione: { color: 'hsl(15,75%,44%)', label: 'Contrasto / Opposto' }
    };
    function _famMeta(fam) {
        const R = window.MappAIRelations;
        const f = R && R.EDGE_FAMILIES && R.EDGE_FAMILIES[fam];
        const en = window.currentLanguage === 'en' || window.currentLanguage === 'en-US';
        if (f) return { color: f.colorBtn || f.color, label: (en && f.labelEn) ? f.labelEn : f.label };
        return _FAM_FALLBACK[fam] || { color: '#475569', label: fam };
    }
    function _familyMap() {
        const R = window.MappAIRelations;
        return (R && R.REL_FAMILY_MAP) || null;
    }
    /* La CORNICE condivisa (mappai-doc-head.js, 11/8/26): testata coi chip
       classe e materia, piè coi numeri di pagina nei margin-box di @page. */
    function _ccDH() { return (typeof window !== 'undefined' && window.MappAIDocHead) || null; }
    function _ccCornice(mapName) {
        var DH = _ccDH();
        return DH ? DH.stile({ accento: '#4f46e5', mappa: mapName }) : '';
    }
    function _ccTestata(mapName, now) {
        var DH = _ccDH();
        if (!DH) return '';
        return DH.testata(DH.conContesto({
            titolo: t('cc_doc_title', 'Catena dei perché'), mappa: mapName, data: now
        }));
    }
    function _ccPie(mapName) {
        var DH = _ccDH();
        if (!DH) return '';
        /* Il piè di QUESTO foglio dice anche come sono nati i nessi: sono
           estratti dalla mappa, senza AI, ed è un'informazione sul metodo che
           il documento deve portarsi dietro. */
        return DH.pieSchermo({
            mappa: mapName,
            brand: 'MappAI · ' + t('cc_footer', 'nessi estratti dalla mappa e dalle descrizioni — nessuna AI')
        });
    }

    function _esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── API per la sintesi ──────────────────────────────────────────────────
    function triplesFor(nodes) {
        const C = window.MappAICausalCore;
        const a = _getAppState();
        if (!C || !nodes || !nodes.length) return [];
        const links = (a && a.db && a.db.links) || [];
        const ids = new Set(nodes.map(n => n.id));
        const linkT = C.extractLinkTriples(nodes, links, _familyMap())
            .filter(x => ids.has(x.sourceId) && ids.has(x.targetId));
        let descT = [];
        for (const n of nodes) {
            const txt = n.desc || n.content || '';
            if (txt) descT = descT.concat(C.extractDescTriples(txt, n.id, window.cleanLabel ? window.cleanLabel(n.label) : n.label));
        }
        return C.dedupe(linkT.concat(descT)).slice(0, 20);
    }

    function promptBlockFromTriples(triples) {
        const C = window.MappAICausalCore;
        if (!triples || !triples.length || !C) return '';
        // header nella LINGUA DELLE MAPPE (regola 14): il template BRANCH_SYNTHESIS
        // _EN/_IT è già scelto da fillPromptTemplate con lo stesso criterio
        const lang = (typeof window.getPromptLanguage === 'function') ? window.getPromptLanguage() : 'it';
        return '\n\n' + C.promptHeader(lang) + '\n' + C.promptLines(triples).join('\n');
    }

    // Box autonomo (stili inline → funziona in qualunque documento HTML).
    function htmlBlock(triples) {
        if (!triples || !triples.length) return '';
        const rows = triples.map(x => {
            const fm = _famMeta(x.family);
            const arr = x.type === 'contrast' ? '↔' : '→';
            const a = x.type === 'contrast' ? x.a : x.cause;
            const b = x.type === 'contrast' ? x.b : x.effect;
            return '<div style="display:flex;align-items:baseline;gap:7px;padding:5px 0;border-bottom:1px dashed #e2e8f0;flex-wrap:wrap">' +
                '<span style="font-size:10.5px;color:#334155">' + _esc(a) + '</span>' +
                '<span style="font-size:10px;font-weight:700;color:' + fm.color + ';white-space:nowrap">' + arr + ' ' + _esc(x.type === 'contrast' ? x.conn : (x.connShow || x.conn)) + ' ' + arr + '</span>' +
                '<span style="font-size:10.5px;color:#334155">' + _esc(b) + '</span>' +
                '</div>';
        }).join('');
        return '<div style="margin:18px 0 6px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #4f46e5;border-radius:10px;page-break-inside:avoid">' +
            '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#4f46e5;margin-bottom:8px">' +
            _esc(t('cc_box_title', 'La catena dei perché')) + '</div>' + rows + '</div>';
    }

    // ── Catena dell'intera mappa ────────────────────────────────────────────
    function buildForCurrentMap() {
        const C = window.MappAICausalCore;
        const a = _getAppState();
        if (!C || !a || !a.db) return null;
        return C.buildChains({ nodes: a.db.nodes || [], links: a.db.links || [], familyMap: _familyMap() });
    }

    function _rowHtml(x) {
        const fm = _famMeta(x.family);
        const arr = x.type === 'contrast' ? '↔' : '→';
        const a = x.type === 'contrast' ? x.a : x.cause;
        const b = x.type === 'contrast' ? x.b : x.effect;
        const badge = x.origin === 'link'
            ? '<span class="cc-badge">' + _esc(t('cc_from_map', 'dalla mappa')) + '</span>'
            : '<span class="cc-badge cc-badge-txt">' + _esc(t('cc_from_text', 'dal testo')) + (x.nodeLabel ? ' · ' + _esc(x.nodeLabel) : '') + '</span>';
        return '<div class="cc-row">' +
            '<div class="cc-line"><span class="cc-side">' + _esc(a) + '</span>' +
            '<span class="cc-conn" style="border-color:' + fm.color + ';color:' + fm.color + '"><b class="cc-arr">' + arr + '</b><span class="cc-conn-txt">' + _esc(x.type === 'contrast' ? x.conn : (x.connShow || x.conn)) + '</span><b class="cc-arr">' + arr + '</b></span>' +
            '<span class="cc-side">' + _esc(b) + '</span></div>' + badge + '</div>';
    }

    function _docHtml(chains, mapName, fontId) {
        const fams = ['trasformazione', 'dipendenza', 'sequenza', 'opposizione'];
        const legend = fams.map(f => {
            const fm = _famMeta(f);
            return '<span class="cc-leg"><i style="background:' + fm.color + '"></i>' + _esc(fm.label) + '</span>';
        }).join('');
        let body = '';
        if (chains.rootItems && chains.rootItems.length) {
            body += '<div class="cc-sec"><h2 class="cc-sec-title">' + _esc(t('cc_general', 'In generale')) + '</h2>' +
                chains.rootItems.map(_rowHtml).join('') +
                (chains.rootTruncated ? '<div class="cc-trunc">+' + chains.rootTruncated + ' ' + _esc(t('cc_truncated', 'altri nessi non mostrati')) + '</div>' : '') +
                '</div>';
        }
        for (const br of chains.branches) {
            if (!br.items.length) continue;
            body += '<div class="cc-sec"><h2 class="cc-sec-title">' + _esc(br.label) + '</h2>' +
                br.items.map(_rowHtml).join('') +
                (br.truncated ? '<div class="cc-trunc">+' + br.truncated + ' ' + _esc(t('cc_truncated', 'altri nessi non mostrati')) + '</div>' : '') +
                '</div>';
        }
        if (chains.cross.length) {
            body += '<div class="cc-sec cc-sec-cross"><h2 class="cc-sec-title">' + _esc(t('cc_cross', 'Ponti tra i rami')) + '</h2>' +
                chains.cross.map(_rowHtml).join('') +
                (chains.crossTruncated ? '<div class="cc-trunc">+' + chains.crossTruncated + ' ' + _esc(t('cc_truncated', 'altri nessi non mostrati')) + '</div>' : '') +
                '</div>';
        }
    /* Data del documento: GG/MM/AAAA senza ora — la scrive la cornice
       (mappai-doc-head.js), una regola per tutti i fogli. */
        const now = _ccDH() ? _ccDH().data(new Date()) : new Date().toLocaleDateString('it-IT');
        return '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">' +
            '<title>' + _esc(t('cc_doc_title', 'Catena dei perché')) + ' — ' + _esc(mapName) + '</title>' +
            '<style>' + _fontDoc(fontId) +
            '*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}' +
            "body{font-family:var(--doc-font, 'Space Mono', monospace);font-size:12px;color:#1e293b;margin:0 auto;padding:24px 32px 40px;max-width:860px;background:#fafbff;background-image:radial-gradient(#ddd6fe 1px,transparent 1px);background-size:22px 22px}" +
            /* Testata e piè: cornice condivisa (mappai-doc-head.js). Erano due
               regole copiate dal foglio quiz, con misure loro. */
            _ccCornice(mapName) +
            '.cc-legend{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin:14px 0 20px;font-size:10px;color:#475569}' +
            '.cc-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}' +
            '.cc-sec{background:#fff;border-radius:14px;padding:16px 20px;margin-bottom:16px;page-break-inside:avoid}' +
            '.cc-sec-cross{border:2px dashed #a5b4fc}' +
            '.cc-sec-title{font-size:14px;font-weight:900;color:#4f46e5;margin:0 0 10px;padding-bottom:6px;border-bottom:1px solid #eef2ff}' +
            '.cc-row{padding:7px 0;border-bottom:1px dashed #e2e8f0}.cc-row:last-child{border-bottom:0}' +
            '.cc-line{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;line-height:1.7}' +
            '.cc-side{color:#334155}' +
            '.cc-conn{display:inline-flex;align-items:baseline;gap:5px;border:1.5px solid;border-radius:9999px;padding:1px 9px;font-size:11px;font-weight:700;white-space:nowrap}' +
            '.cc-badge{display:inline-block;margin-top:2px;font-size:8.5px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em}' +
            '.cc-badge-txt{color:#a8a29e}' +
            '.cc-trunc{margin-top:6px;font-size:10px;color:#94a3b8;font-style:italic}' +
            /* modalità esercizio: connettivo nascosto → casella da completare */
            'body.cc-ex .cc-conn-txt{color:transparent!important;border-bottom:1.5px dotted #94a3b8;min-width:64px;display:inline-block}' +
            'body.cc-ex .cc-badge{visibility:hidden}' +
            '.no-print{display:block}@media print{.no-print{display:none!important}body{background:#fff;padding:10px}}' +
            '</style></head><body>' +
            '<div class="no-print" style="position:fixed;top:0;left:0;right:0;background:#fff;border-bottom:1px solid #e2e8f0;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;z-index:100;font-family:\'Space Mono\',monospace;font-size:12px">' +
            '<b>' + _esc(t('cc_doc_title', 'Catena dei perché')) + '</b>' +
            '<span><button onclick="document.body.classList.toggle(\'cc-ex\')" style="font-family:inherit;margin-right:8px;padding:6px 14px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer">' + _esc(t('cc_exercise', 'Modalità esercizio')) + '</button>' +
            '<button onclick="window.print()" style="font-family:inherit;padding:6px 14px;border:0;background:#4f46e5;color:#fff;border-radius:8px;cursor:pointer;font-weight:700">' + _esc(t('cc_print', 'Stampa')) + '</button></span></div>' +
            '<div style="height:44px" class="no-print"></div>' +
            _ccTestata(mapName, now) +
            '<div class="cc-legend">' + legend + '</div>' + body +
            _ccPie(mapName) +
            '</body></html>';
    }

    /**
     * I nessi da mandare in uscita (documento, PDF, editor): se il docente ha
     * rivisto la catena in ELABORA vale la SUA versione, altrimenti si estrae
     * dalla mappa. Senza questo, la revisione si vedrebbe solo nell'editor e
     * stampa e PDF continuerebbero a mostrare l'estrazione grezza.
     */
    function chainsForOutput() {
        const a = _getAppState();
        const saved = a && a.db && a.db.causalDoc;
        const C = window.MappAICausalCore;
        if (saved && C && C.chainsFromDoc) {
            const revised = C.chainsFromDoc(saved);
            if (revised && revised.total) return revised;
        }
        return buildForCurrentMap();
    }

    function mapName() {
        const a = _getAppState();
        return (a && (a.rootNodeLabel || (a.db && a.db.rootNodeLabel))) || 'MappAI';
    }

    function openDoc(chainsOverride) {
        const chains = chainsOverride || chainsForOutput();
        if (!chains || !chains.total) {
            if (window.showToast) window.showToast(t('cc_empty', 'Nessun nesso causa-effetto trovato: servono verbi significativi sui link o connettivi (perché, quindi…) nelle descrizioni.'), 'warning');
            return;
        }
        const mName = mapName();
        const html = _docHtml(chains, mName);
        const w = window.open('', '_blank');
        if (!w) { if (window.showToast) window.showToast(t('cc_popup', 'Sblocca i popup per aprire il documento'), 'error'); return; }
        w.document.write(html);
        w.document.close();
        // Archivio documenti (005): riapribile da «Documenti salvati» senza rigenerare.
        try {
            if (window.MappAIStudyDocs && window.MappAIStudyDocs.save) {
                window.MappAIStudyDocs.save({ kind: 'causal', title: t('cc_doc_title', 'Catena dei perché'), mapName: mName, html: html });
            }
        } catch (e) { console.warn('[Causal] archivio non disponibile:', e); }
    }

    // ── Pagine PDF per il Foglio nodi (jsPDF landscape A4: 297×210 mm) ──────
    // Ritorna true se ha aggiunto almeno una pagina.
    function appendPdfPages(doc, fontName) {
        const chains = chainsForOutput();   // la revisione del docente, se c'è
        if (!chains || !chains.total) return false;
        const M = 14, W = 297 - M * 2, BOTTOM = 196;
        const font = fontName || 'courier';
        let y;
        const newPage = () => {
            doc.addPage();
            doc.setFont(font, 'bold'); doc.setFontSize(15); doc.setTextColor(30, 41, 59);
            doc.text(t('cc_doc_title', 'Catena dei perché'), M, 16);
            y = 26;
        };
        newPage();
        const sections = ((chains.rootItems && chains.rootItems.length) ? [{ label: t('cc_general', 'In generale'), items: chains.rootItems, truncated: chains.rootTruncated || 0 }] : [])
            .concat(chains.branches.filter(b => b.items.length))
            .concat(chains.cross.length ? [{ label: t('cc_cross', 'Ponti tra i rami'), items: chains.cross, truncated: chains.crossTruncated || 0 }] : []);
        for (const sec of sections) {
            if (y > BOTTOM - 18) newPage();
            doc.setFont(font, 'bold'); doc.setFontSize(12); doc.setTextColor(79, 70, 229);
            doc.text(String(sec.label), M, y); y += 7;
            doc.setFont(font, 'normal'); doc.setFontSize(9.5); doc.setTextColor(51, 65, 85);
            for (const x of sec.items) {
                const arr = x.type === 'contrast' ? '<->' : '->';
                const a = x.type === 'contrast' ? x.a : x.cause;
                const b = x.type === 'contrast' ? x.b : x.effect;
                const line = a + '  ' + arr + ' ' + (x.type === 'contrast' ? x.conn : (x.connShow || x.conn)) + ' ' + arr + '  ' + b;
                const wrapped = doc.splitTextToSize(line, W);
                if (y + wrapped.length * 4.6 > BOTTOM) { newPage(); doc.setFont(font, 'normal'); doc.setFontSize(9.5); doc.setTextColor(51, 65, 85); }
                doc.text(wrapped, M, y);
                y += wrapped.length * 4.6 + 2.6;
            }
            if (sec.truncated) {
                doc.setTextColor(148, 163, 184);
                doc.text('+' + sec.truncated + ' ' + t('cc_truncated', 'altri nessi non mostrati'), M, y);
                doc.setTextColor(51, 65, 85);
                y += 6;
            }
            y += 4;
        }
        return true;
    }

    window.MappAICausal = {
        openDoc, buildForCurrentMap, triplesFor, promptBlockFromTriples, htmlBlock, appendPdfPages,
        // usate dall'editor documenti di ELABORA: la resa è UNA (questo builder),
        // così quel che si rivede a schermo è quel che va in stampa e nel vault.
        chainsForOutput, buildDocHtml: _docHtml, mapName, famMeta: _famMeta
    };
})();
