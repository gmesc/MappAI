/*
 * mappai-study-export-core.js — infrastruttura condivisa fra i due export di
 * studio "Sintesi di ramo" (mappai-branch-synthesis.js, motore AI) e "Stampa
 * dossier" (mappai-print-dossier.js, motore deterministico). (11/7/26)
 * -------------------------------------------------------------------------
 * I due moduli hanno funzione OPPOSTA (la Sintesi riscrive in prosa con l'AI,
 * il Dossier ripete le descrizioni verbatim) ma condividono l'IMPALCATURA:
 * raccolta dei nodi del ramo + apertura della finestra di stampa. Qui vive
 * quel poco che era davvero duplicato; CSS, struttura pagina e citazioni
 * restano nei rispettivi moduli perché sono due linguaggi visivi distinti.
 *
 * Caricato PRIMA dei due consumatori in index.html. Usa il binding globale
 * `appState` (classic script post-app.js, come i moduli fratelli) e il
 * canonico `window.getDescendants` (mappai-flashcards-sr.js).
 */
(function () {
    'use strict';

    function _t(k, f) { return window.t ? window.t(k, f) : f; }

    /**
     * Nodi di un ramo, con la stessa semantica usata storicamente da Sintesi e
     * Dossier: in MindMap = tutti i nodi del gruppo (root incluso); in KG =
     * root + discendenti (cross-link inclusi, ciclo-safe via getDescendants).
     * Ordinati per livello di default (L0→L…): il root resta sempre in testa
     * (ha il livello minimo del proprio sottoalbero).
     *
     * @param {string} rootId
     * @param {{sortByLevel?: boolean}} [opts]  sortByLevel:false preserva
     *        l'ordine di raccolta (usato da chi vuole l'ordine "grezzo").
     * @returns {Array} nodi (riferimenti a appState.db.nodes)
     */
    function collectBranchNodes(rootId, opts) {
        opts = opts || {};
        const db = (typeof appState !== 'undefined' ? appState : window.appState).db;
        const root = db.nodes.find(function (n) { return n.id === rootId; });
        if (!root) return [];

        const byLevel = function (a, b) { return (a.level || 0) - (b.level || 0); };

        // MindMap: il ramo È il gruppo (colore/macro-area). Root incluso.
        if ((typeof appState !== 'undefined' ? appState : window.appState).extractionMode === 'mindmap') {
            return db.nodes.filter(function (n) { return n.group === root.group; }).sort(byLevel);
        }

        // KG: root + discendenti (BFS ciclo-safe), deduplicati.
        const seen = new Set([root.id]);
        const list = [root];
        (window.getDescendants ? window.getDescendants(rootId) : []).forEach(function (n) {
            if (!seen.has(n.id)) { seen.add(n.id); list.push(n); }
        });
        return opts.sortByLevel === false ? list : list.sort(byLevel);
    }

    /**
     * Apre una finestra di stampa con l'HTML dato. Centralizza la gestione del
     * popup bloccato e (opzionale) la stampa automatica / il toast di successo.
     *
     * @param {string} fullHtml  documento HTML completo (<!DOCTYPE html>…)
     * @param {{blockedMsg?:string, blockedLevel?:string, successMsg?:string,
     *          autoPrint?:boolean, autoPrintDelay?:number}} [opts]
     * @returns {Window|null}  la finestra aperta, o null se popup bloccato.
     */
    function openPrintable(fullHtml, opts) {
        opts = opts || {};
        const win = window.open('', '_blank');
        if (!win) {
            window.showToast(
                opts.blockedMsg || _t('tst_popup_blocked', 'Popup bloccato — abilita i popup'),
                opts.blockedLevel || 'warning'
            );
            return null;
        }
        win.document.write(fullHtml);
        win.document.close();
        if (opts.autoPrint) {
            setTimeout(function () {
                try { win.focus(); win.print(); } catch (e) { /* utente ha già chiuso */ }
            }, opts.autoPrintDelay || 800);
        }
        if (opts.successMsg) window.showToast(opts.successMsg, 'success');
        return win;
    }

    window.MappAIStudyExport = { collectBranchNodes: collectBranchNodes, openPrintable: openPrintable };

    /* ── Archivio documenti di studio (Sintesi + Dossier) ─────────────────────
     * Un docente genera una volta e riapre/condivide senza rigenerare. Lo store
     * vive in localStorage: metadati + HTML stampabile completo. I dossier sono
     * grossi → cap a DOCS_CAP voci e quota-guard (scarta i più vecchi se pieno).
     * (Migrazione futura su disco via IPC se serve capienza — vedi CLAUDE.md.) */
    const DOCS_KEY = 'mappai_saved_documents';
    const DOCS_CAP = 30; // 005-landing-insegna: era 12; la landing Insegna ci vive sopra
    // Tipi di documento archiviabili (005): synthesis/dossier storici + fogli nodi/timeline
    // + 'causal' (Catena dei perché, deterministico — 19/7/26)
    // 'quizpaper' e 'flashsheet' = fogli cartacei generati dall'editor documenti di
    // ELABORA (quiz stampabile, foglio flashcard) → richiamabili da INSEGNA.
    const DOC_KINDS = ['synthesis', 'dossier', 'nodesheet', 'timeline', 'map', 'causal', 'quizpaper', 'flashsheet'];

    function _docsRead() {
        try { return JSON.parse(localStorage.getItem(DOCS_KEY) || '[]'); }
        catch (e) { return []; }
    }
    function _docsWrite(arr) {
        // Se l'array non entra nella quota, scarta i più vecchi (in coda) finché
        // entra. Un singolo doc troppo grande → warning, nessun crash.
        const list = arr.slice();
        while (list.length) {
            try { localStorage.setItem(DOCS_KEY, JSON.stringify(list)); return list.length; }
            catch (e) {
                if (list.length <= 1) { console.warn('[StudyDocs] quota superata: documento troppo grande, non salvato'); try { localStorage.setItem(DOCS_KEY, '[]'); } catch (_) { } return 0; }
                list.pop();
            }
        }
        try { localStorage.setItem(DOCS_KEY, '[]'); } catch (e) { }
        return 0;
    }
    function _activeClassName() {
        try {
            const c = window.MappAIClasses && window.MappAIClasses.getActive && window.MappAIClasses.getActive();
            return (c && c.name) || null;
        } catch (e) { return null; }
    }

    // save({kind,title,mapName,cls?,html?,pdf?}) → id. Dedup per (kind|title|mapName):
    // rigenerare lo stesso ramo AGGIORNA la voce invece di duplicare.
    // pdf = data-URI (Foglio nodi = jsPDF, non HTML): riaperto con window.open.
    function saveDoc(rec) {
        const arr = _docsRead();
        const entry = {
            id: rec.id || ('doc_' + Date.now()),
            kind: DOC_KINDS.indexOf(rec.kind) >= 0 ? rec.kind : 'dossier',
            title: rec.title || 'Documento',
            mapName: rec.mapName || '',
            cls: rec.cls !== undefined ? rec.cls : _activeClassName(),
            date: Date.now(),
            html: rec.html || '',
            // n. di carte oltre la soglia di caratteri: INSEGNA ci mette il badge
            // «da rivedere» sulla riga del foglio flashcard.
            overLimit: parseInt(rec.overLimit, 10) || 0,
            pdf: rec.pdf || ''
        };
        const key = entry.kind + '|' + entry.title + '|' + entry.mapName;
        const idx = arr.findIndex(d => (d.kind + '|' + d.title + '|' + d.mapName) === key);
        if (idx >= 0) { entry.id = arr[idx].id; arr.splice(idx, 1); }
        arr.unshift(entry);
        if (arr.length > DOCS_CAP) arr.length = DOCS_CAP;
        _docsWrite(arr);
        return entry.id;
    }
    // list() → SOLO metadati (niente html: array leggero per il rendering).
    function listDocs() { return _docsRead().map(d => ({ id: d.id, kind: d.kind, title: d.title, mapName: d.mapName, cls: d.cls, date: d.date, overLimit: d.overLimit || 0 })); }
    function getDoc(id) { return _docsRead().find(d => d.id === id) || null; }
    function removeDoc(id) { _docsWrite(_docsRead().filter(d => d.id !== id)); }

    window.MappAIStudyDocs = { save: saveDoc, list: listDocs, get: getDoc, remove: removeDoc };

    console.log('[MappAI] mappai-study-export-core.js caricato ✓');
})();
