/*
 * Revisione docente: proposte, decisioni e commit recuperabile, senza DOM/IO/AI.
 * Il chiamante persiste `applying`, salva il risultato e SOLO dopo chiama
 * completeApproval con la revisione riletta dal disco. Una decisione non è
 * una dimostrazione: prove e rettifiche del docente restano distinguibili.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mappai-grounding-core'));
  else root.MappAIReviewCore = factory(root.MappAIGroundingCore);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Grounding) {
  'use strict';

  var SCHEMA = 'mappai-review@1';
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o || {}, k); };
  var clone = function (x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); };
  var eid = function (x) { return String(x && typeof x === 'object' ? x.id : x == null ? '' : x); };
  function fail(code) { var e = new Error(code); e.code = code; throw e; }
  function stable(x) {
    if (Array.isArray(x)) return '[' + x.map(stable).join(',') + ']';
    if (x && typeof x === 'object') return '{' + Object.keys(x).sort().filter(function (k) {
      return x[k] !== undefined;
    }).map(function (k) { return JSON.stringify(k) + ':' + stable(x[k]); }).join(',') + '}';
    return JSON.stringify(x === undefined ? null : x);
  }
  function hash(x) {
    var s = stable(x), a = 2166136261, b = 3339675911;
    for (var i = 0; i < s.length; i++) {
      a = Math.imul(a ^ s.charCodeAt(i), 16777619);
      b = Math.imul(b ^ s.charCodeAt(i), 2246822519);
    }
    // Impronta di versione, non firma di sicurezza. I confronti di snapshot
    // sotto verificano anche il contenuto canonico, non soltanto l'impronta.
    return 'r1-' + (a >>> 0).toString(16).padStart(8, '0') +
      (b >>> 0).toString(16).padStart(8, '0') + '-' + s.length;
  }
  function pick(o, keys) {
    var r = {};
    keys.forEach(function (k) { if (own(o, k) && o[k] !== undefined) r[k] = clone(o[k]); });
    return r;
  }
  function sorted(a) { return a.sort(function (x, y) { var a = stable(x), b = stable(y); return a < b ? -1 : a > b ? 1 : 0; }); }
  function citations(a) {
    return sorted((Array.isArray(a) ? a : []).map(function (c) {
      return typeof c === 'string' ? { text: c } : pick(c, ['id', 'sourceId', 'title', 'source', 'page', 'text', 'verbatim']);
    }));
  }
  function sourceSnapshot(sources) {
    return sorted((Array.isArray(sources) ? sources : []).map(function (s) {
      if (typeof s === 'string') return { text: s };
      var r = pick(s, ['id', 'docId', 'documentId', 'sourceId', 'title', 'name', 'nome', 'type', 'url', 'source', 'page', 'n', 'content', 'text', 'hash', 'verbatim']);
      if (Array.isArray(s && s.pages)) r.pages = s.pages.map(function (p) { return pick(p, ['id', 'n', 'page', 'text']); });
      return r;
    }));
  }
  function linkSnapshot(l) {
    var r = pick(l, ['id', 'bidirectional']);
    if (r.id != null) r.id = eid(r.id);
    r.source = eid(l.source); r.target = eid(l.target);
    r.rel = l.rel || 'include'; r.isCross = !!l.isCross;
    return r;
  }
  function uniqueIds(rows) {
    var seen = new Set();
    rows.forEach(function (r) {
      if (!r.id || seen.has(r.id)) fail('invalid_or_duplicate_id');
      seen.add(r.id);
    });
  }
  function semanticSnapshot(db) {
    db = db || {};
    if (Array.isArray(db.items)) {
      var items = clone(db.items).map(function (item) { item.id = eid(item.id); return item; });
      uniqueIds(items);
      return { items: sorted(items) };
    }
    var nodes = (db.nodes || []).map(function (n) {
      var r = pick(n, ['ambito', 'confini', 'rel']);
      r.id = eid(n.id); r.label = String(n.label || '').trim(); r.desc = String(n.desc || n.content || '').trim();
      if (n.level != null) r.level = Number(n.level);
      if (n.group != null) r.group = eid(n.group);
      if (n.parent != null) r.parent = eid(n.parent);
      if (n.parentId != null) r.parentId = eid(n.parentId);
      if (Array.isArray(n.chunks) && n.chunks.length) r.chunks = citations(n.chunks);
      return r;
    });
    uniqueIds(nodes);
    var dict = {}, raw = db.sourcesDict || db.fontiDict || {};
    Object.keys(raw).sort().forEach(function (id) {
      Object.defineProperty(dict, id, { value: citations(raw[id]), enumerable: true, configurable: true, writable: true });
    });
    return { nodes: sorted(nodes), links: sorted((db.links || []).map(linkSnapshot)), sourcesDict: dict };
  }
  function revision(db, sources) { return hash({ db: semanticSnapshot(db), sources: sourceSnapshot(sources) }); }
  function copyDb(db) {
    // D3 sostituisce source/target con oggetti nodo: niente riferimenti vivi
    // nella copia o nel JSON da persistere.
    var r = Object.assign({}, db || {});
    if (r.links) r.links = r.links.map(function (l) { return Object.assign({}, l, { source: eid(l.source), target: eid(l.target) }); });
    return clone(r);
  }
  function targetOf(t) {
    t = clone(t || {});
    if (t.item) { t.kind = 'item'; t.id = eid(t.item.id); delete t.item; }
    if (t.node) { t.kind = 'node'; t.id = eid(t.node.id); delete t.node; }
    if (['node', 'link', 'item'].indexOf(t.kind) < 0) fail('invalid_target');
    if (t.id != null) t.id = eid(t.id);
    if (t.source != null) t.source = eid(t.source);
    if (t.target != null) t.target = eid(t.target);
    t.field = t.field || (t.kind === 'node' ? 'desc' : t.kind === 'link' ? 'rel' : '$item');
    if (['__proto__', 'prototype', 'constructor'].indexOf(t.field) >= 0 || !/^[\w$]+$/.test(t.field)) fail('invalid_field');
    if (t.kind === 'node' && ['desc', 'label'].indexOf(t.field) < 0) fail('invalid_field');
    if (t.kind === 'link' && ['rel', '$link'].indexOf(t.field) < 0) fail('invalid_field');
    return t;
  }
  function locate(db, t) {
    var key = t.kind === 'node' ? 'nodes' : t.kind === 'link' ? 'links' : 'items';
    var matches = (db[key] || []).filter(function (r) {
      if (t.id != null) return eid(r.id) === t.id;
      return t.kind === 'link' && eid(r.source) === t.source && eid(r.target) === t.target && (!own(t, 'rel') || r.rel === t.rel);
    });
    if (matches.length !== 1) return { error: matches.length ? 'ambiguous_target' : 'missing_target' };
    var row = matches[0], whole = t.field === '$item' || t.field === '$link';
    var value = whole ? (t.kind === 'link' ? linkSnapshot(row) : clone(row)) :
      t.kind === 'node' && t.field === 'desc' ? String(row.desc || row.content || '') :
        t.kind === 'link' ? row.rel || 'include' : row[t.field];
    return { key: key, row: row, value: value, whole: whole };
  }
  function normalizeIssue(raw, db) {
    var t = targetOf(raw.target), current = locate(db, t);
    var before = own(raw, 'before') ? clone(raw.before) : clone(current.value);
    var hasProposal = own(raw, 'hasProposal') ? !!raw.hasProposal : own(raw, 'after');
    var issue = {
      target: t, before: before === undefined ? null : before,
      after: hasProposal ? clone(raw.after) : null, hasProposal: hasProposal,
      problem: String(raw.problem || raw.problema || ''), evidence: clone(raw.evidence || raw.evidenze || raw.prova || ''),
      blocking: raw.blocking !== false, origin: raw.origin === 'teacher' ? 'teacher' : 'judge'
    };
    if (raw.type || raw.tipo) issue.type = raw.type || raw.tipo;
    if (own(raw, 'citationAdditions')) issue.citationAdditions = clone(raw.citationAdditions);
    issue.id = String(raw.id || 'issue-' + hash(issue));
    // Keep legacy IDs so saved decisions still resolve. The selected quote
    // distinguishes new evidence from the surrounding source context.
    if (typeof raw.quote === 'string' && raw.quote.trim()) issue.quote = raw.quote;
    return issue;
  }
  function reportIssues(report, db) {
    report = report || {};
    var rows = (report.issues || []).slice();
    (report.correzioni || []).concat(report.segnalati || []).forEach(function (r) {
      var n = (db.nodes || []).find(function (n) { return eid(n.id) === eid(r.id); });
      var before = own(r, 'prima') ? r.prima : n && String(n.desc || n.content || '');
      var row = { target: { kind: 'node', id: eid(r.id), field: 'desc' }, before: before,
        problem: r.problema, evidence: r.evidenze || r.prova, quote: r.prova, type: r.tipo };
      if (own(r, 'dopo')) row.after = r.dopo;
      else {
        var from = r.brano || r.brano_errato;
        if (typeof before === 'string' && typeof from === 'string' && from && typeof r.con === 'string' &&
            before.indexOf(from) >= 0 && before.indexOf(from) === before.lastIndexOf(from)) row.after = before.replace(from, r.con);
      }
      rows.push(row);
    });
    (report.linkTolti || []).forEach(function (r) {
      rows.push({ target: { kind: 'link', source: eid(r.source), target: eid(r.target), rel: r.rel, field: '$link' },
        after: null, problem: r.problema, evidence: r.evidenze || r.prova, type: 'unsupported-link' });
    });
    var seen = new Map();
    return rows.map(function (r) { return normalizeIssue(r, db); }).filter(function (r) {
      if (seen.has(r.id)) {
        if (seen.get(r.id) !== stable(r)) fail('duplicate_issue_id');
        return false;
      }
      seen.set(r.id, stable(r)); return true;
    });
  }
  function count(x) { return Array.isArray(x) ? x.length : typeof x === 'number' ? x : 0; }
  function checkStatus(report, requested) {
    report = report || {};
    var status = requested || report.checkStatus || report.stato || '';
    var skipped = false;
    function scan(x) {
      if (!x || typeof x !== 'object') return;
      Object.keys(x).forEach(function (k) {
        if (/^(saltati|skipped|failed|falliti|nonControllati)$/i.test(k) && count(x[k])) skipped = true;
        if (typeof x[k] === 'object') scan(x[k]);
      });
    }
    scan(report.copertura);
    (Array.isArray(report.esitiRami) ? report.esitiRami : []).forEach(function (r) {
      if (/skip|salt|error|fail|incomplet|non.dispon/i.test(String(r.stato || r.status || ''))) skipped = true;
    });
    if (skipped) return 'incomplete';
    if (/^(completed|complete|completato|completo|ok)$/.test(status)) return 'completed';
    if (/^(unavailable|non-disponibile|disabled|disabilitato)$/.test(status)) return 'unavailable';
    return Object.keys(report).length || status ? 'incomplete' : 'unavailable';
  }
  function createReview(opts) {
    opts = opts || {};
    var sources = sourceSnapshot(opts.sources), snapshot = semanticSnapshot(opts.db);
    var base = revision(snapshot, sources);
    return {
      schema: SCHEMA, generationId: String(opts.generationId || 'generation-' + base),
      projectId: opts.projectId || null, vaultPath: opts.vaultPath || '',
      createdAt: opts.now || null, updatedAt: opts.now || null, config: clone(opts.config || {}),
      sourceHash: hash(sources), sources: sources, baseRevision: base, baseSnapshot: snapshot,
      initial: { status: 'awaiting_review', checkStatus: checkStatus(opts.report, opts.checkStatus),
        report: clone(opts.report || null), issues: reportIssues(opts.report, snapshot), decisions: {} },
      approvedRevision: null, approvedSnapshot: null, overrides: []
    };
  }
  function editable(review) {
    if (!review || review.schema !== SCHEMA || !review.initial) fail('invalid_review');
    if (review.initial.status !== 'awaiting_review') fail('review_not_editable');
  }
  function mergeRetry(previous, next) {
    editable(previous); editable(next);
    if (previous.baseRevision !== next.baseRevision || stable(previous.baseSnapshot) !== stable(next.baseSnapshot) ||
        stable(previous.sources) !== stable(next.sources)) fail('stale_revision');
    // Older saved issues did not retain the selected quote. Recover it from
    // the original reports without changing their IDs or the teacher's choices.
    var archived = new Map();
    (previous.initial.previousReports || []).concat([previous.initial.report]).forEach(function (report) {
      reportIssues(report, previous.baseSnapshot).forEach(function (i) { archived.set(i.id, i); });
    });
    function identity(issue) {
      var data = pick(issue, ['target', 'before', 'after', 'hasProposal', 'evidence', 'type', 'blocking', 'origin', 'citationAdditions']);
      data.quote = issue.quote || (archived.get(issue.id) || {}).quote || '';
      // A reworded explanation is not new evidence. Retain it in the full
      // report, while preserving the original issue and its decision.
      if (!issue.hasProposal && !data.quote && (!data.evidence || !Object.keys(data.evidence).length)) data.problem = issue.problem;
      return stable(data);
    }
    var r = clone(next), issues = clone(previous.initial.issues), known = new Set(issues.map(identity));
    r.initial.decisions = clone(previous.initial.decisions);
    next.initial.issues.forEach(function (issue) {
      var key = identity(issue);
      if (known.has(key)) return;
      var added = clone(issue);
      // Even an explicit/reused model ID cannot transfer approval to a
      // different proposal or different evidence.
      if (issues.some(function (i) { return i.id === added.id; })) {
        added.id = 'issue-' + hash({ originalId: issue.id, identity: key });
        while (issues.some(function (i) { return i.id === added.id; })) added.id += '-new';
      }
      issues.push(added); known.add(key);
    });
    r.initial.issues = issues;
    r.initial.previousReports = clone((previous.initial.previousReports || []).concat([previous.initial.report]));
    if (previous.previous) r.previous = clone(previous.previous);
    return r;
  }
  function addIssue(review, issue, db) {
    editable(review);
    var r = clone(review), normalized = normalizeIssue(issue, db || r.baseSnapshot);
    var existing = r.initial.issues.find(function (i) { return i.id === normalized.id; });
    if (existing && stable(existing) !== stable(normalized)) fail('duplicate_issue_id');
    if (!existing) r.initial.issues.push(normalized);
    return r;
  }
  function setDecision(review, issueId, choice, opts) {
    editable(review); opts = opts || {};
    if (!review.initial.issues.some(function (i) { return i.id === issueId; })) fail('unknown_issue');
    if (['pending', 'accept', 'reject', 'manual'].indexOf(choice) < 0) fail('invalid_decision');
    if (choice === 'manual' && !own(opts, 'text')) fail('manual_text_required');
    var r = clone(review), d = { choice: choice, reason: String(opts.reason || ''), updatedAt: opts.now || null };
    if (choice === 'manual') d.text = clone(opts.text);
    Object.defineProperty(r.initial.decisions, issueId, { value: d, enumerable: true, configurable: true, writable: true });
    r.updatedAt = opts.now || r.updatedAt;
    return r;
  }
  function decisionOutcome(issue, decision) {
    var d = decision || {}, value;
    if (!issue || ['accept', 'reject', 'manual'].indexOf(d.choice) < 0) return 'pending';
    if (d.choice === 'reject') return 'kept';
    if (d.choice === 'accept' && !issue.hasProposal || d.choice === 'manual' && !own(d, 'text')) return 'pending';
    value = d.choice === 'manual' ? d.text : issue.after;
    if (value === null && ['$item', '$link'].indexOf(issue.target.field) >= 0) return 'excluded';
    if (stable(value) === stable(issue.before)) return 'kept';
    return d.choice === 'manual' ? 'edited' : 'applied';
  }
  function matchesSnapshot(db, sources, snapshot, expected, expectedSources) {
    return revision(db, sources) === expected && stable(semanticSnapshot(db)) === stable(snapshot) &&
      stable(sourceSnapshot(sources)) === stable(expectedSources);
  }
  function replacementValid(found, t, value) {
    if (!found.whole) return t.kind === 'item' ? value !== undefined : typeof value === 'string' && value.trim().length > 0;
    if (value === null) return true;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return t.kind === 'item' ? eid(value.id) === eid(found.row.id) : !!(eid(value.source) && eid(value.target));
  }
  function textChange(before, after) {
    if (typeof before !== 'string' || typeof after !== 'string' || before === after) return null;
    var start = 0, end = before.length, tail = after.length;
    while (start < end && start < tail && before[start] === after[start]) start++;
    while (end > start && tail > start && before[end - 1] === after[tail - 1]) { end--; tail--; }
    return { start: start, end: end, before: before.slice(start, end), after: after.slice(start, tail) };
  }
  function preview(review, db, opts) {
    opts = opts || {};
    if (!review || review.schema !== SCHEMA || !review.initial) fail('invalid_review');
    if (['awaiting_review', 'applying', 'approved'].indexOf(review.initial.status) < 0) fail('invalid_review_status');
    var sources = own(opts, 'sources') ? opts.sources : review.sources;
    var conflicts = [], unresolved = [], work = copyDb(db), patches = [], overrides = [];
    function conflict(issueId, code) { conflicts.push({ issueId: issueId || null, code: code }); }
    if (review.initial.status === 'approved' || review.initial.status === 'applying') {
      if (matchesSnapshot(db, sources, review.approvedSnapshot, review.approvedRevision, review.sources)) {
        return { ok: true, db: work, conflicts: [], unresolved: [], revision: review.approvedRevision,
          overrides: clone(review.overrides), alreadyApplied: true };
      }
      if (review.initial.status === 'approved') conflict(null, 'stale_revision');
    }
    if (!matchesSnapshot(db, sources, review.baseSnapshot, review.baseRevision, review.sources)) conflict(null, 'stale_revision');
    review.initial.issues.forEach(function (i) {
      var d = review.initial.decisions[i.id] || { choice: 'pending' };
      if (d.choice === 'pending') { if (i.blocking) unresolved.push(i.id); return; }
      if (['accept', 'reject', 'manual'].indexOf(d.choice) < 0) return conflict(i.id, 'invalid_decision');
      var found = locate(db, i.target);
      if (found.error) return conflict(i.id, found.error);
      if (stable(found.value) !== stable(i.before)) return conflict(i.id, 'before_mismatch');
      if (d.choice === 'accept' && !i.hasProposal) return conflict(i.id, 'proposal_missing');
      var value = d.choice === 'manual' ? d.text : d.choice === 'accept' ? i.after : i.before;
      if (!replacementValid(found, i.target, value)) return conflict(i.id, 'invalid_replacement');
      if (i.target.field === '$link' && value !== null && !(db.nodes || []).some(function (n) { return eid(n.id) === eid(value.source); })) return conflict(i.id, 'missing_link_endpoint');
      if (i.target.field === '$link' && value !== null && !(db.nodes || []).some(function (n) { return eid(n.id) === eid(value.target); })) return conflict(i.id, 'missing_link_endpoint');
      overrides.push({ issueId: i.id, target: clone(i.target), before: clone(i.before), after: clone(value),
        choice: d.choice, reason: d.reason || '', evidence: clone(i.evidence), baseRevision: review.baseRevision, origin: 'teacher' });
      // Un rifiuto conserva il contenuto; non è una patch e non impedisce una
      // modifica indipendente. Modifiche testuali disgiunte si possono comporre.
      if (d.choice === 'reject') return;
      if (stable(value) === stable(i.before)) return;
      var additions = i.citationAdditions || [];
      if (!Array.isArray(additions)) return conflict(i.id, 'invalid_citations');
      if (additions.length && (i.target.kind !== 'item' || i.target.field !== 'text' || found.row.kind !== 'synthesis')) return conflict(i.id, 'invalid_citations');
      if (additions.length && (!Grounding || !Grounding.extendCitations(found.row, value, additions, sources))) return conflict(i.id, 'invalid_citations');
      var other = patches.find(function (p) { return p.row === found.row && (p.whole || found.whole || p.target.field === i.target.field); });
      if (other) {
        if (stable(other.value) === stable(value) && other.target.field === i.target.field) return;
        var change = textChange(i.before, value);
        if (!other.whole && !found.whole && other.target.field === i.target.field && change && other.edits &&
            other.edits.every(function (e) { return change.start > e.end || change.end < e.start; })) {
          other.edits.push(change); other.additions = other.additions.concat(additions);
        } else conflict(i.id, 'conflicting_decisions');
        return;
      }
      var edit = textChange(i.before, value);
      patches.push({ row: found.row, target: i.target, value: value, whole: found.whole, issueId: i.id,
        edits: edit ? [edit] : null, additions: additions });
    });
    if (!conflicts.length && !unresolved.length) patches.forEach(function (p) {
      var f = locate(work, p.target);
      if (p.whole) {
        var index = work[f.key].indexOf(f.row);
        if (p.value === null) work[f.key].splice(index, 1);
        else work[f.key][index] = clone(p.value);
      } else {
        var value = p.edits ? p.edits.slice().sort(function (a, b) { return b.start - a.start; }).reduce(function (text, e) {
          return text.slice(0, e.start) + e.after + text.slice(e.end);
        }, f.value) : clone(p.value);
        if (p.additions.length) {
          var unique = p.additions.filter(function (s, n, all) { return all.findIndex(function (x) { return x.id === s.id; }) === n; });
          var extended = Grounding.extendCitations(f.row, value, unique, sources);
          if (!extended) { conflict(p.issueId, 'invalid_citations'); return; }
          f.row.citations = extended.citations;
        }
        f.row[p.target.field] = value;
        if (p.target.kind === 'node') {
          f.row.hasCustomText = true;
          if (p.target.field === 'desc') { f.row.content = value; if (!own(f.row, 'aiDesc')) f.row.aiDesc = p.row.desc || p.row.content || ''; }
        }
      }
    });
    if (conflicts.length) work = copyDb(db);
    return { ok: !conflicts.length && !unresolved.length, db: work, conflicts: conflicts,
      unresolved: unresolved, revision: revision(work, sources), overrides: overrides, alreadyApplied: false };
  }
  function beginApproval(review, db, opts) {
    opts = opts || {};
    var result = preview(review, db, opts), r = clone(review);
    if (!result.ok) return Object.assign(result, { review: r });
    if (result.alreadyApplied) return Object.assign(result, { review: r });
    if (r.initial.status === 'applying') {
      // La conferma docente è già sul disco: il retry non richiede una nuova
      // autorizzazione, ma deve ricostruire esattamente il commit deciso.
      if (result.revision !== r.approvedRevision || stable(semanticSnapshot(result.db)) !== stable(r.approvedSnapshot)) {
        result.ok = false; result.conflicts.push({ issueId: null, code: 'applying_snapshot_mismatch' });
        result.db = copyDb(db);
      }
      return Object.assign(result, { review: r });
    }
    if (r.initial.checkStatus !== 'completed' && opts.manualReview !== true) {
      result.ok = false; result.conflicts.push({ issueId: null, code: 'manual_review_required' });
      return Object.assign(result, { review: r, db: copyDb(db) });
    }
    r.initial.status = 'applying'; r.initial.manualReview = opts.manualReview === true;
    r.approvedSnapshot = semanticSnapshot(result.db); r.approvedRevision = result.revision;
    r.overrides = result.overrides; r.updatedAt = opts.now || r.updatedAt;
    return Object.assign(result, { review: r });
  }
  function completeApproval(review, persistedRevision) {
    if (!review || review.schema !== SCHEMA || !review.initial ||
        ['applying', 'approved'].indexOf(review.initial.status) < 0) fail('review_not_applying');
    if (!persistedRevision || persistedRevision !== review.approvedRevision ||
        revision(review.approvedSnapshot, review.sources) !== review.approvedRevision) fail('persisted_revision_mismatch');
    var r = clone(review); r.initial.status = 'approved'; return r;
  }
  function gate(review, db, sources) {
    if (!review) return { allowed: true, reason: 'legacy', legacy: true };
    if (review.schema !== SCHEMA || !review.initial) return { allowed: false, reason: 'invalid_review' };
    if (review.initial.status !== 'approved') return { allowed: false, reason: review.initial.status || 'invalid_review' };
    sources = sources === undefined ? review.sources : sources;
    return matchesSnapshot(db, sources, review.approvedSnapshot, review.approvedRevision, review.sources)
      ? { allowed: true, reason: 'approved', legacy: false } : { allowed: false, reason: 'stale_revision' };
  }

  return { SCHEMA: SCHEMA, semanticSnapshot: semanticSnapshot, sourceSnapshot: sourceSnapshot,
    revision: revision, createReview: createReview, mergeRetry: mergeRetry, addIssue: addIssue, setDecision: setDecision, decisionOutcome: decisionOutcome, textChange: textChange,
    preview: preview, beginApproval: beginApproval, completeApproval: completeApproval, gate: gate };
}));
