/* Shared input for derivatives: approved facts, archived source excerpts and
   explicit teacher amendments. No DOM, network, or model-declared verbatim. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIGroundingCore = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const text = value => String(value == null ? '' : value);
    const flat = value => text(value).replace(/\s+/g, ' ').trim();
    function hash(value) {
        let n = 2166136261;
        for (const c of text(value)) n = Math.imul(n ^ c.codePointAt(0), 16777619);
        return (n >>> 0).toString(36);
    }

    // Keep offsets into the original: matching ignores whitespace; display does not.
    function originalExcerpt(original, candidate) {
        const value = text(original), chars = [], offsets = [];
        let space = false;
        for (let i = 0; i < value.length; i++) {
            if (/\s/.test(value[i])) {
                if (chars.length && !space) { chars.push(' '); offsets.push(i); }
                space = true;
            } else { chars.push(value[i]); offsets.push(i); space = false; }
        }
        const needle = flat(candidate);
        if (!needle) return null;
        const start = chars.join('').indexOf(needle);
        return start < 0 ? null : value.slice(offsets[start], offsets[start + needle.length - 1] + 1);
    }

    function sourcePages(sources) {
        const out = [];
        (Array.isArray(sources) ? sources : []).forEach((doc, index) => {
            if (!doc) return;
            const title = text(doc.title || doc.nome || doc.name || doc.fileName || doc.file && doc.file.name || doc.url || 'Documento');
            const pages = Array.isArray(doc.pages) ? doc.pages : [{ n: doc.page || doc.n || 0, text: doc.content || doc.text || '' }];
            const docId = text(doc.documentId || doc.docId || doc.id || 'doc-' + hash(title + '\n' + pages.map(p => p.text || p.content || '').join('\n')) + '-' + index);
            pages.forEach(p => {
                const value = text(p.text || p.content);
                if (!value.trim()) return;
                out.push({ docId, title, page: Number(p.n || p.page || 0), text: value });
            });
        });
        return out;
    }

    function buildInput(db, nodes, sources, approvedReview) {
        db = db || {};
        const review = approvedReview || {};
        const originals = sourcePages(Array.isArray(review.sources) && review.sources.length ? review.sources : sources);
        const current = new Map((db.nodes || []).map(n => [n.id, n]));
        const selected = (nodes || []).map(n => current.get(n.id) || n);
        const ids = new Set(selected.map(n => n.id));
        const sourcesArr = [], byFragment = new Map(), unverified = [];
        function add(page, excerpt) {
            const key = JSON.stringify([page.docId, page.page, excerpt]);
            if (!byFragment.has(key)) {
                const entry = { id: 'src-' + hash(key), idx: sourcesArr.length + 1,
                    docId: page.docId, title: page.title, page: page.page,
                    source: page.page ? 'pagina ' + page.page : 'fonte', text: excerpt,
                    verbatim: true, verifiedAgainst: 'archived-source-text' };
                sourcesArr.push(entry); byFragment.set(key, entry);
            }
            return byFragment.get(key);
        }
        const nodeBlocks = selected.map(node => {
            const value = text(node.desc || node.content).trim();
            const refs = [];
            const chunks = (db.sourcesDict || {})[node.id] || node.chunks || [];
            (Array.isArray(chunks) ? chunks : []).forEach(c => {
                if (!c || typeof c !== 'object' || !c.text || c.parafrasi) return;
                let pool = originals;
                const docId = c.docId || c.documentId;
                const named = pool.filter(p => p.title === c.title);
                if (docId) pool = pool.filter(p => p.docId === text(docId));
                else if (named.length) pool = named;
                const matchPage = /(?:pag(?:ina|e)?\.?|p\.)\s*(\d+)/i.exec(text(c.source));
                const page = Number(c.page || matchPage && matchPage[1] || 0);
                if (page) pool = pool.filter(p => p.page === page);
                const matches = pool.map(p => ({ p, excerpt: originalExcerpt(p.text, c.text) })).filter(m => m.excerpt != null);
                if (matches.length !== 1) {
                    unverified.push({ nodeId: node.id, text: c.text, reason: matches.length ? 'ambiguous-source' : 'source-not-matched' });
                    return;
                }
                const entry = add(matches[0].p, matches[0].excerpt);
                if (!refs.includes(entry.id)) refs.push(entry.id);
            });
            return value ? '## ' + text(node.label) + ' [nodo ' + text(node.id) + ']\n' + value +
                (refs.length ? '\nPassaggi originali: ' + refs.map(id => '[[' + id + ']]').join(' ') : '') : '';
        }).filter(Boolean);

        // No matched node excerpts: provide the available original pages as context,
        // without pretending that the node's own paraphrase is a quotation.
        if (!sourcesArr.length) originals.forEach(p => add(p, p.text));
        const overrides = (review.overrides || []).filter(o => {
            const target = o.target || {};
            return o.origin === 'teacher' && (target.kind === 'node' ? ids.has(target.id)
                : target.kind === 'link' ? ids.has(target.source) || ids.has(target.target) : false);
        });
        const overrideText = overrides.map(o => {
            const target = o.target || {};
            const after = o.after === null ? '(Elemento escluso dal docente.)'
                : typeof o.after === 'object' ? JSON.stringify(o.after) : text(o.after);
            return '[Rettifica del docente: ' + text(target.id || target.source + ' → ' + target.target) +
                ', ' + text(target.field || 'testo') + ']\n' + after + (o.reason ? '\nNota: ' + text(o.reason) : '');
        }).join('\n\n');
        const nodesListText = nodeBlocks.join('\n\n');
        const sourcesListText = sourcesArr.map(s => '[[' + s.id + ']] ' + s.title +
            (s.page ? ' — pagina ' + s.page : '') + '\n' + s.text).join('\n\n');
        const instructions = 'I contenuti approvati e le rettifiche esplicite del docente definiscono i fatti da conservare. ' +
            'La fonte originale offre contesto e prove; una rettifica del docente può correggerla e non va presentata come citazione. ' +
            'Conserva soggetti, negazioni, quantità, tempi e la distinzione tra fatti, accuse e ipotesi. ' +
            'Non usare altre sintesi generate come fonte. Per citare proponi soltanto gli ID [[src-...]] disponibili: il programma inserisce il testo archiviato.';
        const material = instructions + '\n\nCONTENUTI APPROVATI\n' + nodesListText +
            '\n\nPASSAGGI ORIGINALI\n' + (sourcesListText || '(Testo originale non disponibile: non inventare citazioni.)') +
            (overrideText ? '\n\nRETTIFICHE DEL DOCENTE — prevalgono sul testo della fonte\n' + overrideText : '');
        return { material, nodesListText, sourcesListText, sourcesArr, overrides, unverified };
    }

    function resolveCitations(value, sourcesArr) {
        const entries = new Map((sourcesArr || []).map(s => [s.id, s]));
        const unknownIds = [];
        const resolved = text(value).replace(/\[\[(src-[\w-]+)\]\]/g, (all, id) => {
            const entry = entries.get(id);
            if (entry) return '[' + entry.idx + ']';
            if (!unknownIds.includes(id)) unknownIds.push(id);
            return '';
        });
        return { text: resolved, unknownIds };
    }

    return { sourcePages, originalExcerpt, buildInput, resolveCitations,
        materialForNodes: (db, nodes, sources, approvedReview) => buildInput(db, nodes, sources, approvedReview).material };
}));
