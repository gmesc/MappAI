/* Pure helpers for editing one existing relation. The taxonomy and review
 * decisions remain owned by their existing modules. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./mappai-review-core.js'));
    else root.MappAILinkEditorCore = factory(root.MappAIReviewCore);
}(typeof self !== 'undefined' ? self : this, function (Review) {
    'use strict';
    const id = x => String(x && typeof x === 'object' ? x.id : x ?? '');
    function reference(link) {
        const ref = { source: id(link.source), target: id(link.target), rel: String(link.rel || '') };
        if (link.id != null) ref.id = id(link.id);
        return ref;
    }
    function find(db, ref) {
        const matches = (db.links || []).filter(l =>
            (ref.id == null || id(l.id) === ref.id) && id(l.source) === ref.source &&
            id(l.target) === ref.target && String(l.rel || '') === ref.rel);
        if (matches.length !== 1) throw new Error('link_changed');
        return matches[0];
    }
    function labels(db, ref) {
        return [ref.source, ref.target].map(key => {
            const node = (db.nodes || []).find(n => id(n.id) === key);
            if (!node) throw new Error('link_changed');
            return String(node.label || key);
        });
    }
    function withLabel(db, ref, value) {
        const link = find(db, ref);
        const next = Object.assign({}, db, { links: db.links.map(l => Object.assign({}, l, {
            source: id(l.source), target: id(l.target), rel: l === link ? String(value).trim() : l.rel
        })) });
        try { find(next, Object.assign({}, ref, { rel: String(value).trim() })); }
        catch (_) { throw new Error('ambiguous_label'); }
        return next;
    }
    function issueId(ref) { return 'teacher-link-label-' + encodeURIComponent(JSON.stringify(ref)); }
    function draft(review, ref) {
        const decision = review && review.initial && review.initial.decisions[issueId(ref)];
        return decision && decision.choice === 'manual' ? decision.text : ref.rel;
    }
    function decision(review, db, ref, value, opts) {
        const link = find(db, ref);
        if (!String(value).trim()) throw new Error('empty_review_label');
        withLabel(db, ref, value);
        if (Review.revision(db, review.sources) !== review.baseRevision) throw new Error('stale_revision');
        const key = issueId(ref), target = Object.assign({ kind: 'link', field: 'rel' }, ref);
        if (link.rel == null) delete target.rel;
        const existing = review.initial.issues.find(i => i.id === key);
        const next = existing ? review : Review.addIssue(review, {
            id: key, target, origin: 'teacher', problem: opts.problem
        }, db);
        return Review.setDecision(next, key, 'manual', { text: String(value).trim(), now: opts.now });
    }
    return { reference, find, labels, withLabel, draft, decision };
}));
