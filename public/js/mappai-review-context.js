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
    return { createIndex };
}));
