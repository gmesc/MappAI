/* Read-only context for the teacher's review. Labels are resolved from explicit
   provenance, never by guessing a topic from a question or source quotation. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIReviewContext = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const NEUTRAL = '#64748b';
    const list = value => Array.isArray(value) ? value : value == null ? [] : [value];
    const id = value => value && typeof value === 'object' ? String(value.id ?? '') : String(value ?? '');
    const labelKey = value => typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase() : '';
    const KINDS = { mc: 'Quiz MC', open: 'Domanda aperta', flashcard: 'Flashcard', synthesis: 'Sintesi', nodesheet: 'Scheda nodi', causal: 'Relazione' };
    // Colours come from the map's picker/palette. Reject CSS declarations or
    // URLs before the renderer uses them as a chip's colour custom property.
    const safeColor = value => typeof value === 'string' &&
        (/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value.trim()) ||
         /^(?:rgb|hsl)a?\([\d\s.,%+\-/]+\)$/i.test(value.trim())) ? value.trim() : '';

    function createIndex(db, drafts, palette) {
        db = db || {}; drafts = drafts || {}; palette = palette || {};
        const nodes = new Map(), areas = new Map(), areaLabels = new Map();
        const roots = new Set(), rootLabels = new Set();
        list(db.nodes).filter(Boolean).forEach(node => {
            nodes.set(id(node), node);
            if (node.level != null && Number(node.level) === 0) { roots.add(id(node)); rootLabels.add(labelKey(node.label)); }
            if (Number(node.level) !== 1 || node.group == null || !labelKey(node.label)) return;
            const key = String(node.group);
            const area = { id: key, label: node.label.trim(), color: safeColor((db.customColors || {})[key]) || safeColor(palette[key]) || NEUTRAL };
            // A malformed map with two different hubs in one group has no
            // trustworthy single area name. Leave it unassigned.
            if (areas.has(key) && (!areas.get(key) || areas.get(key).label !== area.label)) areas.set(key, null);
            else areas.set(key, area);
        });
        areas.forEach(area => {
            if (!area) return;
            const key = labelKey(area.label);
            areaLabels.set(key, areaLabels.has(key) ? null : area);
        });

        function describe(issue, review) {
            const target = issue && issue.target || {};
            const result = { areas: [], materialKind: null, materialLabelKey: null, materialLabel: '', relation: false, scope: 'unknown' };
            const found = new Map();
            let overview = false;
            const addArea = area => { if (area) found.set(area.id, area); };
            function fromNode(value) {
                const key = id(value), node = nodes.get(key);
                if (roots.has(key)) { overview = true; return; }
                if (node && node.group != null) addArea(areas.get(String(node.group)));
            }
            function fromArea(value) {
                if (value && typeof value === 'object') {
                    if (value.group != null) addArea(areas.get(String(value.group)));
                    if (value.id != null) { addArea(areas.get(id(value))); fromNode(value); }
                    if (value.label) addArea(areaLabels.get(labelKey(value.label)));
                    return;
                }
                addArea(areas.get(id(value)));
                fromNode(value);
                addArea(areaLabels.get(labelKey(value)));
                if (labelKey(value) && rootLabels.has(labelKey(value))) overview = true;
            }
            function metadata(value) {
                if (!value || typeof value !== 'object') return;
                ['areas', 'areaIds', 'areaId', 'group', 'areaGroup', 'ramo', 'l1', 'branchId', 'branchLabel'].forEach(key => list(value[key]).forEach(fromArea));
                ['sourceNodeIds', 'nodeIds', 'nodeId', 'fromNode', 'sourceId', 'targetId'].forEach(key => list(value[key]).forEach(fromNode));
            }
            if (target.kind === 'node') fromNode(target.id);
            else if (target.kind === 'link') {
                const matches = target.id != null ? list(db.links).filter(link => link && id(link) === id(target.id)) : [];
                const link = matches.length === 1 ? matches[0] : target;
                fromNode(link.source); fromNode(link.target);
            }
            else if (target.kind === 'item') {
                const item = list(review && review.baseSnapshot && review.baseSnapshot.items).find(row => row && id(row) === id(target.id));
                if (item) {
                    result.relation = item.kind === 'causal';
                    result.materialKind = item.kind === 'causal' && item.step === 'D' ? 'synthesis' : KINDS[item.kind] ? item.kind : null;
                    result.materialLabelKey = result.materialKind ? 'rv_material_' + result.materialKind : null;
                    result.materialLabel = KINDS[result.materialKind] || '';
                    metadata(item);
                    if (item.step === 'D' && item.part === 'intro') overview = true;
                    // `title` is the preserved branch label for synthesis,
                    // unlike question/text, which are unrestricted content.
                    if (item.kind === 'synthesis' || item.kind === 'causal' && item.step === 'D') fromArea(item.title);
                    if (!found.size && !overview) draftContext(item, metadata, fromNode, fromArea, () => { overview = true; });
                }
            }
            result.areas = Array.from(found.values(), area => ({ ...area }));
            result.scope = result.areas.length ? 'area' : overview ? 'overview' : 'unknown';
            return result;
        }

        function draftContext(item, metadata, fromNode, fromArea, markOverview) {
            if (item.step === 'B') {
                const set = (drafts.B || {})[item.draftKey];
                if (!set) return;
                const raw = list(set.items).find((row, index) => row && id(row.id || String(set.id) + '-' + index) === id(item));
                if (raw) metadata(raw);
                // A set can contain many areas: never borrow the set's full
                // node list for an individual question.
            } else if (item.step === 'C') {
                const set = (drafts.C || {})[item.draftKey];
                const card = set && list(set.cards)[item.cardIndex];
                // Applying exclusions can shift array positions in old
                // drafts. Only use this join while its label still agrees.
                if (card && card.label === item.question) { fromNode(card.id); metadata(card); }
            } else if (item.step === 'D') {
                const data = drafts.D && drafts.D.data;
                if (!data) return;
                if (item.part === 'intro') { markOverview(); return; }
                const section = item.part === 'whole' ? data : list(data.sections)[item.part];
                if (section && (!item.title || section.branchLabel === item.title)) {
                    metadata(section);
                    fromArea(section.branchLabel);
                    if (item.kind === 'causal') {
                        const row = list(section.causalTriples)[item.rowIndex];
                        if (sameRelation(item, row)) metadata(row);
                    }
                }
            } else if (item.step === 'E') {
                const chains = drafts.E && drafts.E.chains;
                if (!chains) return;
                const branch = /^branch-\d+$/.test(item.draftKey || '') ? list(chains.branches)[Number(item.draftKey.slice(7))] : null;
                const rows = branch ? branch.items : item.draftKey === 'cross' ? chains.cross : item.draftKey === 'root' ? chains.rootItems : [];
                const row = list(rows)[item.rowIndex];
                if (!sameRelation(item, row)) return;
                metadata(row);
                if (branch) { fromNode(branch.id); metadata(branch); }
                if (item.draftKey === 'root') markOverview();
            }
        }
        return { describe };
    }

    function sameRelation(item, row) {
        return !!row && item.question === String(row.type === 'contrast' ? row.a : row.cause) &&
            item.answer === String(row.type === 'contrast' ? row.b : row.effect) &&
            item.text === String(row.connShow || row.conn || '');
    }
    // Diagnostics describe the report's original drafts. Teacher corrections
    // and approval never turn an uncertain/missing model verdict into a pass.
    function incompleteMaterials(report, items) {
        report = report || {};
        const coverage = report.coverage || {}, byId = new Map(list(items).filter(Boolean).map(item => [id(item), item]));
        const checked = new Set(list(coverage.checkedIds).map(id)), rows = new Map();
        function add(value) {
            const key = id(value);
            if (key && !rows.has(key)) rows.set(key, { id: key, item: byId.get(key) || null, claims: [], reason: '', error: '' });
            return rows.get(key);
        }
        (Array.isArray(coverage.expectedIds) ? coverage.expectedIds : Array.from(byId.keys())).forEach(value => {
            if (!checked.has(id(value))) add(value);
        });
        list(coverage.skipped).filter(Boolean).forEach(row => { const entry = add(row); if (entry) entry.reason = String(row.reason || ''); });
        list(coverage.claims).filter(row => row && row.checked !== true).forEach(claim => {
            const entry = add(claim.itemId);
            if (!entry) return;
            // Deduplicate identical report rows, retaining occurrences in
            // different fields (e.g. an answer guide and its marking criteria).
            const value = { field: String(claim.field || ''), text: String(claim.text || ''),
                status: claim.status === 'uncertain' ? 'uncertain' : claim.status === 'missing' ? 'missing' : 'unverified' };
            if (!entry.claims.some(row => row.field === value.field && row.text === value.text && row.status === value.status)) entry.claims.push(value);
        });
        list(report.batches).filter(batch => batch && (batch.error || batch.reason)).forEach(batch => {
            list(batch.ids).forEach(value => { const entry = rows.get(id(value)); if (entry) entry.error = String(batch.error || batch.reason); });
        });
        return Array.from(rows.values(), row => ({ ...row, reason: row.reason || String(report.reason || ''),
            error: row.error || String(report.requestError?.message || '') }));
    }
    // Search the saved teacher choices even while unrelated issues are pending.
    // ReviewCore remains the sole patch/conflict authority. The temporary
    // rejects below mean “keep the original in this preview”, never a decision.
    function occurrenceSnapshot(review, currentItems, reviewCore) {
        const unavailable = (error, conflicts = []) => ({ ok: false, items: [], excludedIds: [], hasPending: false, conflicts, error });
        if (!review || !Array.isArray(currentItems) || typeof reviewCore?.preview !== 'function') return unavailable('invalid-review');
        try {
            const draft = JSON.parse(JSON.stringify(review));
            if (!draft.initial || !Array.isArray(draft.initial.issues)) return unavailable('invalid-review');
            draft.initial.decisions = draft.initial.decisions || {};
            let hasPending = false;
            draft.initial.issues.forEach(issue => {
                if (!Object.prototype.hasOwnProperty.call(draft.initial.decisions, issue.id) || draft.initial.decisions[issue.id]?.choice === 'pending') {
                    hasPending = true;
                    Object.defineProperty(draft.initial.decisions, issue.id, { value: { choice: 'reject' }, enumerable: true, configurable: true, writable: true });
                }
            });
            const preview = reviewCore.preview(draft, { items: currentItems }, { sources: draft.sources });
            if (!preview.ok) return { ...unavailable('conflicting-decisions', preview.conflicts), hasPending };
            const present = new Set(preview.db.items.map(id));
            return { ok: true, items: preview.db.items, excludedIds: list(review.baseSnapshot?.items).map(id).filter(key => !present.has(key)), hasPending, conflicts: [] };
        } catch (_) { return unavailable('invalid-review'); }
    }

    const SEARCH_FIELDS = ['question', 'options', 'answer', 'explanation', 'guide', 'criteria', 'text'];
    const searchText = value => value.normalize('NFC').toLocaleLowerCase('it').replace(/[’‘ʼ]/g, "'").replace(/\s+/gu, ' ');
    const wordTokens = value => Array.from(value.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu), match => ({
        value: searchText(match[0]), start: match.index, end: match.index + match[0].length
    }));
    function phraseRanges(text, query) {
        const normalized = searchText(text), found = [];
        let offset = normalized.indexOf(query);
        while (offset !== -1) {
            const before = Array.from(normalized.slice(0, offset)).pop() || '', after = Array.from(normalized.slice(offset + query.length))[0] || '';
            if (!(/[\p{L}\p{M}\p{N}]/u.test(Array.from(query)[0]) && /[\p{L}\p{M}\p{N}]/u.test(before)) &&
                !(/[\p{L}\p{M}\p{N}]/u.test(Array.from(query).pop()) && /[\p{L}\p{M}\p{N}]/u.test(after))) found.push([offset, offset + query.length]);
            offset = normalized.indexOf(query, offset + query.length);
        }
        if (!found.length) return [];
        // Grapheme offsets preserve highlighted accents and surrogate pairs
        // when NFC or case folding changes the normalized string's length.
        const positions = [];
        let previousSpace = false;
        for (const part of new Intl.Segmenter('it', { granularity: 'grapheme' }).segment(text)) {
            const normalizedPart = searchText(part.segment);
            for (let n = 0; n < normalizedPart.length; n++) {
                const space = normalizedPart[n] === ' ';
                // A Unicode Prepend character can share its grapheme with a
                // space. Collapse whitespace across that boundary as well.
                if (space && previousSpace) positions[positions.length - 1][1] = part.index + part.segment.length;
                else positions.push([part.index, part.index + part.segment.length]);
                previousSpace = space;
            }
        }
        return found.map(([start, end]) => [positions[start][0], positions[end - 1][1]]);
    }

    // ponytail: lexical candidates only; synonyms, paraphrases and scientific
    // equivalence need a separate judgement. A shared word never merges issues.
    // Return plain text and original offsets, not HTML; the view must escape it.
    function searchOccurrences(items, query, options = {}) {
        query = typeof query === 'string' ? query.trim() : '';
        const mode = options.mode === 'phrase' ? 'phrase' : 'words', words = new Set(wordTokens(query).map(token => token.value));
        const excluded = new Set(list(options.excludedIds).map(id));
        const active = list(items).filter(item => item && id(item) && !excluded.has(id(item)));
        const result = { query, mode, valid: words.size > 0, totalItems: active.length, matches: [] };
        if (!result.valid) return result;
        active.forEach(item => {
            const fields = [];
            SEARCH_FIELDS.forEach(field => {
                // Printed/imported MC items can retain an obsolete answer
                // alias after editing options. The canonical key is already
                // represented by options[correctIndex], not this alias.
                if (item.kind === 'mc' && field === 'answer') return;
                const value = item[field];
                (Array.isArray(value) ? value : [value]).forEach((text, index) => {
                    if (typeof text !== 'string') return;
                    let ranges;
                    if (mode === 'phrase') ranges = phraseRanges(text, searchText(query));
                    else {
                        const tokens = wordTokens(text), present = new Set(tokens.map(token => token.value));
                        ranges = Array.from(words).every(word => present.has(word)) ? tokens.filter(token => words.has(token.value)).map(token => [token.start, token.end]) : [];
                    }
                    if (ranges.length) fields.push({ field, index: Array.isArray(value) ? index : null, text, ranges });
                });
            });
            // Identical guide and marking criteria stay editable as distinct
            // fields while counting as one material in the results.
            if (fields.length) result.matches.push({ id: id(item), item, fields });
        });
        return result;
    }
    return { createIndex, incompleteMaterials, occurrenceSnapshot, searchOccurrences };
}));
