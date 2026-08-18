/**
 * mappai-glossary.js
 * Glossario termini disciplinari per MappAI
 * Dipende da: app.js (appState, getNodeColor, showToast)
 */

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


// ── GLOSSARY VIEW ─────────────────────────────────────────────────────────────
// ── La CORNICE condivisa (mappai-doc-head.js, 11/8/26) ───────────────────────
function _glDH() { return (typeof window !== 'undefined' && window.MappAIDocHead) || null; }
function _glCornice(mapName) {
    var DH = _glDH();
    return DH ? DH.stile({ accento: '#4f46e5', mappa: mapName }) : '';
}
function _glTestata(mapName, now, nTermini) {
    var DH = _glDH();
    if (!DH) return '';
    return DH.testata(DH.conContesto({
        titolo: 'Glossario · ' + mapName, tipo: 'Termini disciplinari',
        data: now, badge: nTermini + ' termini'
    }));
}
function _glPie(mapName) {
    var DH = _glDH();
    return DH ? DH.pieSchermo({ mappa: mapName }) : '';
}

window.openGlossaryView = function () {
    const nodes = appState.db.nodes || [];
    if (nodes.length === 0) {
        window.showToast('Genera prima una mappa', 'warning');
        return;
    }

    // 1. Raccoglie termini dai nodi
    const terms = new Map();

    function escHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    nodes.forEach(function (node) {
        if (node.level === 0) return;

        const label = node.label || '';
        const def = node.desc || node.content || '';
        if (!label || !def) return;

        const macroNode = node.level === 1
            ? node
            : nodes.find(function (n) { return n.level === 1 && n.group === node.group; });
        const macroLabel = macroNode ? (macroNode.label || '') : '';
        const macroColor = macroNode && window.getNodeColor ? window.getNodeColor(macroNode) : '#6366f1';

        const key = label.toLowerCase();
        if (!terms.has(key)) {
            terms.set(key, {
                term: label,
                def: def,
                macro: macroLabel,
                color: macroColor,
                level: node.level,
                nodeId: node.id
            });
        }

        // Cerca termini tecnici nelle descrizioni (maiuscola non a inizio stringa)
        const combined = [node.content, node.desc].filter(Boolean).join(' ');
        const techTermRe = /[.!?;]\s+([A-Z\u00C0-\u00DC][a-z\u00E0-\u00FC]{3,}(?:\s+[A-Z\u00C0-\u00DC][a-z\u00E0-\u00FC]{2,})?)/g;
        var tm;
        const stopwords = new Set(['Questo','Questa','Questi','Queste','Sono','Essere','Avere','Fare','Dire','Come','Quando','Dove','Dopo','Prima','Durante','Mentre','Invece']);
        while ((tm = techTermRe.exec(combined)) !== null) {
            const tk = tm[1].toLowerCase();
            if (!stopwords.has(tm[1]) && !terms.has(tk)) {
                terms.set(tk, {
                    term: tm[1],
                    def: combined.slice(Math.max(0, tm.index - 20), Math.min(combined.length, tm.index + 120)).trim(),
                    macro: macroLabel,
                    color: macroColor,
                    level: node.level,
                    nodeId: node.id
                });
            }
        }
    });

    if (terms.size === 0) {
        window.showToast('Nessun termine trovato — le descrizioni dei nodi potrebbero essere vuote', 'warning');
        return;
    }

    // 2. Ordina alfabeticamente
    const sortedTerms = Array.from(terms.values()).sort(function (a, b) {
        return a.term.localeCompare(b.term, 'it');
    });

    // 3. Raggruppa per lettera iniziale
    const byLetter = new Map();
    sortedTerms.forEach(function (t) {
        const letter = t.term[0].toUpperCase();
        if (!byLetter.has(letter)) byLetter.set(letter, []);
        byLetter.get(letter).push(t);
    });

    // 4. Metadati documento
    const rootNode = nodes.find(function (n) { return n.level === 0; });
    const mapName = rootNode ? (rootNode.label || 'MappAI') : 'MappAI';
    /* Data del documento: GG/MM/AAAA senza ora — la scrive la cornice
       (mappai-doc-head.js), una regola per tutti i fogli. */
    const now = _glDH() ? _glDH().data(new Date()) : new Date().toLocaleDateString('it-IT');

    // Indice lettere
    let letterIndex = '';
    byLetter.forEach(function (_, letter) {
        letterIndex += '<a href="#gl-' + letter + '" class="gl-idx-letter">' + letter + '</a>';
    });

    // Voci glossario
    let glossHtml = '';
    byLetter.forEach(function (termList, letter) {
        glossHtml += '<div class="gl-section" id="gl-' + letter + '">';
        glossHtml += '<div class="gl-letter-header">' + letter + '</div>';
        termList.forEach(function (t) {
            glossHtml += '<div class="gl-entry">' +
                '<div class="gl-term-row">' +
                  '<span class="gl-dot" style="background:' + t.color + ';"></span>' +
                  '<span class="gl-term">' + escHtml(t.term) + '</span>' +
                  '<span class="gl-macro" style="color:' + t.color + ';">' + escHtml(t.macro) + '</span>' +
                '</div>' +
                '<div class="gl-def">' + escHtml(t.def) + '</div>' +
                '</div>';
        });
        glossHtml += '</div>';
    });

    // 5. CSS
    const glStyles = [
        '* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }',
        'body { font-family: var(--doc-font, "Space Mono", monospace); font-size: 11px; color: #1e293b; margin: 0 auto; padding: 24px 32px; max-width: 800px; }',
        // Testata e piè: cornice condivisa (mappai-doc-head.js). Erano quattro
        // regole copiate dal foglio quiz — e senza fondo bianco, unica delle
        // nove testate a non averlo: una divergenza che nessuno aveva deciso.
        _glCornice(mapName),
        '.gl-index { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 24px; padding: 12px; background: #f8fafc; border-radius: 10px; page-break-after: avoid; }',
        '.gl-idx-letter { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; background: white; border: 1px solid #e2e8f0; border-radius: 6px; font-weight: bold; font-size: 11px; color: #4f46e5; text-decoration: none; }',
        '.gl-section { margin-bottom: 20px; page-break-inside: avoid; }',
        '.gl-letter-header { font-size: 18px; font-weight: 900; color: #4f46e5; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 10px; }',
        '.gl-entry { margin-bottom: 12px; padding: 10px 12px; background: #f8fafc; border-radius: 8px; border-left: 3px solid #e2e8f0; page-break-inside: avoid; }',
        '.gl-term-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }',
        '.gl-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }',
        '.gl-term { font-weight: bold; font-size: 12px; color: #1e293b; }',
        '.gl-macro { font-size: 9px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.8; margin-left: auto; }',
        '.gl-def { font-size: 10px; color: #475569; line-height: 1.6; padding-left: 16px; }',
        // (il piè a schermo lo disegna .mm-dh-pie della cornice)
        '@media print { body { padding: 10px; } .gl-index a { color: #4f46e5 !important; } .no-print { display: none !important; } }'
    ].join('\n');

    // 6. Barra stampa
    const printBarHtml = '<div class="no-print" style="position:fixed;top:0;left:0;right:0;background:white;border-bottom:1px solid #e2e8f0;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;z-index:100;font-family:monospace;font-size:12px;">' +
        '<span style="font-weight:bold;color:#059669;">MappAI &middot; Glossario</span>' +
        '<div style="display:flex;gap:8px;">' +
          '<button onclick="window.print()" style="background:#059669;color:white;border:none;border-radius:8px;padding:6px 16px;cursor:pointer;font-size:11px;font-weight:bold;">\uD83D\uDDB8 Stampa / Esporta PDF</button>' +
          '<button onclick="window.close()" style="background:#f1f5f9;color:#475569;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px;">\u2715 Chiudi</button>' +
        '</div></div>' +
        '<div style="height:52px;" class="no-print"></div>';

    // 7. Documento finale
    const fullHtml = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Glossario \u2014 ' + escHtml(mapName) + '</title>' +
        '<style>' + _fontDoc() + glStyles + '</style></head><body>' +
        printBarHtml +
        _glTestata(mapName, now, sortedTerms.length) +
        '<div class="gl-index">' + letterIndex + '</div>' +
        glossHtml +
        _glPie(mapName) +
        '</body></html>';

    // 8. Apri finestra
    const glWin = window.open('', '_blank');
    if (!glWin) {
        window.showToast('Popup bloccato — abilita i popup per questo sito', 'warning');
        return;
    }
    glWin.document.write(fullHtml);
    glWin.document.close();
    window.showToast('\u2713 Glossario aperto \u2014 ' + sortedTerms.length + ' termini', 'success');
};

console.log('[MappAI] mappai-glossary.js caricato ✓');
