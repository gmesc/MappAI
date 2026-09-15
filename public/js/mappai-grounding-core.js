/* Shared input for derivatives: approved facts, archived source excerpts and
   explicit teacher amendments. No DOM, network, or model-declared verbatim. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIGroundingCore = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const text = value => String(value == null ? '' : value);
    const flat = value => text(value).replace(/\s+/g, ' ').trim();
    const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
    const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
        : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}' : JSON.stringify(value);
    function isTeacherAmendment(value) {
        return !!value && value.origin === 'teacher' && ['accept', 'manual'].includes(value.choice) &&
            own(value, 'before') && own(value, 'after') && value.after != null && canonical(value.before) !== canonical(value.after);
    }
    function hash(value) {
        let n = 2166136261;
        for (const c of text(value)) n = Math.imul(n ^ c.codePointAt(0), 16777619);
        return (n >>> 0).toString(36);
    }
    function amendmentText(value) {
        if (!isTeacherAmendment(value)) return [];
        const parts = input => {
            if (Array.isArray(input)) return input.flatMap(parts);
            if (input && typeof input === 'object') return Object.values(input).flatMap(parts);
            if (typeof input !== 'string') return [];
            return typeof Intl.Segmenter === 'function' ? Array.from(new Intl.Segmenter('it', { granularity: 'sentence' }).segment(input), s => s.segment.trim()).filter(Boolean) : [input];
        };
        const before = new Set(parts(value.before).map(flat));
        return parts(value.after).filter(part => !before.has(flat(part)));
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

    function buildInput(db, nodes, sources, approvedReview, options) {
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
        if (!sourcesArr.length || options && options.includeOriginalPages) originals.forEach(p => add(p, p.text));
        const sourceCoverage = { originalPagesAvailable: originals.length,
            fullPagesIncluded: originals.filter(p => sourcesArr.some(s => s.docId === p.docId && s.page === p.page && s.text === p.text)).length };
        const overrides = (review.overrides || []).filter(o => {
            const target = o.target || {};
            return isTeacherAmendment(o) && (target.kind === 'node' ? ids.has(target.id)
                : target.kind === 'link' ? ids.has(target.source) || ids.has(target.target) : false);
        });
        const overrideText = overrides.map(o => {
            const target = o.target || {};
            const after = amendmentText(o).join('\n');
            return '[Rettifica del docente: ' + text(target.id || target.source + ' → ' + target.target) +
                ', ' + text(target.field || 'testo') + ']\n' + after + (o.reason ? '\nNota: ' + text(o.reason) : '');
        }).join('\n\n');
        const nodesListText = nodeBlocks.join('\n\n');
        const sourcesListText = sourcesArr.map(s => '[[' + s.id + ']] ' + s.title +
            (s.page ? ' — pagina ' + s.page : '') + '\n' + s.text).join('\n\n');
        const instructions = 'I contenuti approvati organizzano la lezione; verifica le loro affermazioni con le fonti originali. ' +
            'Le fonti originali sono il riferimento fattuale. Soltanto le rettifiche esplicite qui riportate possono correggerle e non vanno presentate come citazioni. ' +
            'Conserva soggetti, negazioni, quantità, tempi e la distinzione tra fatti, accuse e ipotesi. ' +
            'Non usare altre sintesi generate come fonte. Per citare proponi soltanto gli ID [[src-...]] disponibili: il programma inserisce il testo archiviato.';
        const material = instructions + '\n\nCONTENUTI APPROVATI\n' + nodesListText +
            '\n\nPASSAGGI ORIGINALI\n' + (sourcesListText || '(Testo originale non disponibile: non inventare citazioni.)') +
            (overrideText ? '\n\nRETTIFICHE DEL DOCENTE — prevalgono sul testo della fonte\n' + overrideText : '');
        return { material, nodesListText, sourcesListText, sourcesArr, overrides, unverified, sourceCoverage };
    }

    function resolveCitations(value, sourcesArr) {
        const entries = new Map((sourcesArr || []).map(s => [s.id, s]));
        const unknownIds = [];
        const resolved = text(value).replace(/\[{1,2}(src-[\w-]+)\]{1,2}/g, (all, id) => {
            const entry = entries.get(id);
            if (entry && Number.isInteger(entry.idx) && entry.idx > 0) return '[' + entry.idx + ']';
            if (!unknownIds.includes(id)) unknownIds.push(id);
            return all; // Keep unresolved anchors in the model; renderers show a warning.
        });
        return { text: resolved, unknownIds };
    }

    // A reversible view for plain-text editors. Existing numbered references
    // belong to their section and are deliberately not interpreted here.
    function referenceView(value, sourcesArr, options) {
        options = options || {};
        const original = text(value), entries = new Map((sourcesArr || []).filter(Boolean).map(s => [s.id, s]));
        const mapping = [], unknownIds = [], labels = new Map();
        let next = 1;
        const result = original.replace(/\[{1,2}(src-[\w-]+)\]{1,2}/g, (_, id) => {
            if (labels.has(id)) return labels.get(id);
            const source = entries.get(id), prefix = source ? options.sourceLabel || 'Fonte' : options.unknownLabel || 'Fonte da verificare';
            let label;
            do { label = '[' + prefix + ' ' + next++ + ']'; } while (original.includes(label));
            labels.set(id, label);
            mapping.push({ label, id, source: source ? JSON.parse(JSON.stringify(source)) : null });
            if (!source) unknownIds.push(id);
            return label;
        });
        return { text: result, mapping, unknownIds };
    }
    function restoreReferenceIds(value, mapping) {
        let result = text(value);
        (mapping || []).forEach(entry => {
            if (entry && entry.label && /^src-[\w-]+$/.test(entry.id)) result = result.split(entry.label).join('[[' + entry.id + ']]');
        });
        return result;
    }

    // A local registry for raw anchors, independent of other sections' numbers.
    // Existing [n] references reserve their number but never acquire a new meaning.
    function citationRegistry(value, sourcesArr) {
        const byId = new Map((sourcesArr || []).filter(Boolean).map(s => [s.id, s]));
        const used = new Set(), occupied = new Set(Array.from(text(value).matchAll(/\[(\d+)\]/g), m => Number(m[1])));
        const out = []; let idx = 1;
        for (const match of text(value).matchAll(/\[{1,2}(src-[\w-]+)\]{1,2}/g)) {
            const source = byId.get(match[1]);
            if (!source || used.has(source.id)) continue;
            while (occupied.has(idx)) idx++;
            out.push(Object.assign({}, source, { idx: idx++ })); used.add(source.id);
        }
        return out;
    }

    // Append only referenced entries; old numbers and archived wording never change.
    // At approval originals are required to recheck the persisted proposal.
    function extendCitations(item, value, candidates, originals) {
        if (item.kind !== 'synthesis' || typeof value !== 'string' || item.citations != null && !Array.isArray(item.citations)) return null;
        const registry = JSON.parse(JSON.stringify(item.citations || [])), additions = [];
        const pages = originals === undefined ? null : sourcePages(originals);
        const occupied = new Set(registry.map(s => Number(s.idx)));
        for (const m of value.matchAll(/\[(\d+)\]/g)) occupied.add(Number(m[1]));
        for (const m of value.matchAll(/\[{1,2}(src-[\w-]+)\]{1,2}/g)) {
            if (registry.some(s => s.id === m[1])) continue;
            const matches = (candidates || []).filter(s => s && s.id === m[1]);
            if (matches.length !== 1 || !flat(matches[0].text)) return null;
            const entry = matches[0];
            if (pages) {
                const matches = pages.filter(p => (entry.docId ? p.docId === entry.docId : p.title === entry.title) &&
                    p.page === Number(entry.page || 0) && originalExcerpt(p.text, entry.text) === entry.text);
                if (matches.length !== 1) return null;
            }
            let idx = 1; while (occupied.has(idx)) idx++;
            occupied.add(idx);
            const added = { id: entry.id, idx, title: entry.title, page: Number(entry.page || 0),
                source: entry.page ? 'pagina ' + entry.page : 'fonte', text: entry.text,
                verbatim: true, verifiedAgainst: 'archived-source-text' };
            if (entry.docId) added.docId = entry.docId;
            registry.push(added); additions.push(added);
        }
        return { citations: registry, additions };
    }

    return { sourcePages, originalExcerpt, buildInput, resolveCitations, referenceView, restoreReferenceIds, citationRegistry, isTeacherAmendment, amendmentText, extendCitations,
        materialForNodes: (db, nodes, sources, approvedReview) => buildInput(db, nodes, sources, approvedReview).material };
}));
