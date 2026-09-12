/* One normalized representation for the final judge, editor and exporters. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mappai-pipeline-core'), require('./mappai-grounding-core'));
  else root.MappAIMaterialDrafts = factory(root.MappAIPipelineCore, root.MappAIGroundingCore);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (PC, G) {
  'use strict';
  const clone = x => JSON.parse(JSON.stringify(x));
  function correctIndex(it) {
    if (Number.isInteger(it.correctIndex)) return it.correctIndex;
    const options = it.options || [];
    const i = options.findIndex(x => String(x).trim().toLowerCase() === String(it.correct).trim().toLowerCase());
    if (i >= 0) return i;
    const n = Number(it.correct);
    return Number.isInteger(n) && n > 0 && n <= options.length ? n - 1 : -1;
  }
  function normalize(it, type, id) {
    const result = Object.assign({}, it, { id, kind: type === 'flashcards' ? 'flashcard' : type === 'open' ? 'open' : 'mc',
      question: String(it.question || it.q || it.front || '') });
    if (result.kind === 'mc') {
      result.options = (it.options || []).map(String); result.correctIndex = correctIndex(it);
      result.explanation = String(it.explanation || '');
    } else if (result.kind === 'flashcard') result.answer = String(it.answer || it.back || it.correct || '');
    else {
      result.guide = String(it.guide || it.traccia || '');
      result.criteria = PC.criteriDaItem(it);
      const n = Number(it.lines);
      result.lines = Number.isInteger(n) && n >= 3 && n <= 12 ? n : 4;
    }
    return result;
  }
  function chainGroups(chains) {
    if (!chains) return [];
    return [{ key: 'root', items: chains.rootItems || [] }, { key: 'cross', items: chains.cross || [] }]
      .concat((chains.branches || []).map((b, i) => ({ key: 'branch-' + i, items: b.items || [] })));
  }
  const synthesisTripleId = (part, index) => 'synthesis-causal-' + part + '-' + index;
  function synthesisTriples(data, part) {
    return (data.causalTriples || []).map((x, index) => ({
      id: synthesisTripleId(part, index), kind: 'causal', step: 'D', part, rowIndex: index,
      title: data.branchLabel || '', relationType: x.type || 'causal', family: x.family, origin: x.origin,
      sourceId: x.sourceId, targetId: x.targetId,
      question: String((x.type === 'contrast' ? x.a : x.cause) ?? ''),
      answer: String((x.type === 'contrast' ? x.b : x.effect) ?? ''),
      // Match htmlBlock: contrasts use conn, other relations prefer connShow.
      text: String((x.type === 'contrast' ? x.conn : (x.connShow || x.conn)) ?? '')
    }));
  }
  function applySynthesisTriples(data, part, byId) {
    if (!Array.isArray(data.causalTriples)) return;
    data.causalTriples = data.causalTriples.map((x, index) => {
      const item = byId.get(synthesisTripleId(part, index));
      if (!item) return null;
      if (x.type === 'contrast') { x.a = item.question; x.b = item.answer; }
      else { x.cause = item.question; x.effect = item.answer; }
      x.conn = x.connShow = item.text;
      return x;
    }).filter(Boolean);
  }
  function synthesisContent(data) {
    const part = s => ({ rawText: s.rawText, failed: !!s.failed,
      triples: synthesisTriples(s, '').map(x => [x.question, x.text, x.answer]) });
    return JSON.stringify({ intro: data.intro, body: part(data), sections: (data.sections || []).map(part) });
  }
  function flatten(drafts) {
    const out = [];
    Object.entries(drafts.B || {}).forEach(([key, set]) => {
      set.items.forEach((it, i) => out.push(Object.assign(normalize(it, set.type, it.id || set.id + '-' + i), { draftKey: key, step: 'B' })));
    });
    const data = drafts.D && drafts.D.data;
    if (data) {
      if (data.whole) {
        // Project legacy raw IDs into a local registry without mutating drafts
        // or borrowing the meaning of another section's numbered references.
        const introSources = Array.isArray(data.introSources) ? data.introSources
          : G.citationRegistry(data.intro, (data.sections || []).flatMap(s => s.sourcesArr || []));
        if (data.intro) out.push({ id: 'synthesis-intro', kind: 'synthesis', text: data.intro, citations: clone(introSources), step: 'D', part: 'intro', title: 'Panoramica' });
        (data.sections || []).forEach((s, i) => {
          out.push({ id: 'synthesis-' + i, kind: 'synthesis', text: s.rawText || '', citations: clone(s.sourcesArr || []), step: 'D', part: i, title: s.branchLabel });
          out.push(...synthesisTriples(s, i));
        });
      } else {
        out.push({ id: 'synthesis-whole', kind: 'synthesis', text: data.rawText || '', citations: clone(data.sourcesArr || []), step: 'D', part: 'whole', title: data.branchLabel });
        out.push(...synthesisTriples(data, 'whole'));
      }
    }
    Object.entries(drafts.C || {}).forEach(([key, set]) => {
      set.cards.forEach((c, i) => out.push({ id: 'nodesheet-' + key + '-' + i, kind: 'nodesheet', step: 'C', draftKey: key, cardIndex: i,
        layout: c.layout, question: c.label, text: c.layout === 'keywords' ? (c.keywords || []).join('; ') : c.layout === 'title' ? '' : c.desc || '' }));
    });
    chainGroups(drafts.E && drafts.E.chains).forEach(g => g.items.forEach((x, i) => out.push({
      id: 'causal-' + g.key + '-' + i, kind: 'causal', step: 'E', draftKey: g.key, rowIndex: i,
      question: String(x.type === 'contrast' ? x.a : x.cause), answer: String(x.type === 'contrast' ? x.b : x.effect), text: String(x.connShow || x.conn || '')
    })));
    return out;
  }
  function apply(drafts, items) {
    const out = clone(drafts), byId = new Map(items.map(it => [it.id, it]));
    Object.entries(out.B || {}).forEach(([key, set]) => {
      set.items = set.items.map((raw, i) => {
        const it = byId.get(raw.id || set.id + '-' + i);
        if (!it) return null;
        const n = Object.assign({}, raw, it, { q: it.question, question: it.question });
        if (it.kind === 'mc') {
          n.correct = it.options[it.correctIndex]; n.options = it.options.slice();
        } else if (it.kind === 'flashcard') { n.front = it.question; n.back = it.answer; n.correct = it.answer; }
        else { n.criteri = (it.criteria || []).slice(); n.guide = it.guide; n.lines = it.lines; }
        return n;
      }).filter(Boolean);
    });
    if (out.D) {
      const data = out.D.data;
      const before = synthesisContent(data);
      if (data.whole) {
        data.intro = byId.has('synthesis-intro') ? byId.get('synthesis-intro').text : '';
        data.sections = (data.sections || []).map((s, i) => {
          const it = byId.get('synthesis-' + i);
          if (!it) return null;
          applySynthesisTriples(s, i, byId);
          return Object.assign({}, s, { rawText: it.text, failed: false });
        }).filter(Boolean);
      } else if (byId.has('synthesis-whole')) {
        data.rawText = byId.get('synthesis-whole').text;
        applySynthesisTriples(data, 'whole', byId);
      }
      else { delete out.D; }
      // The renderer gives editedBlocks precedence over rawText and, for a
      // whole synthesis, embeds old citations/triples inside those HTML blocks.
      // A G2 correction invalidates that rendered cache, never the source registry.
      if (out.D && before !== synthesisContent(data)) delete data.editedBlocks;
    }
    Object.entries(out.C || {}).forEach(([key, set]) => {
      set.cards = set.cards.map((c, i) => {
        const it = byId.get('nodesheet-' + key + '-' + i);
        if (!it) return null;
        c.label = it.question;
        if (c.layout === 'keywords') c.keywords = String(it.text || '').split(';').map(s => s.trim()).filter(Boolean);
        else if (c.layout !== 'title') c.desc = it.text;
        return c;
      }).filter(Boolean);
    });
    if (out.E) {
      const chains = out.E.chains;
      let total = 0;
      chainGroups(chains).forEach(g => {
        const rows = g.items.map((x, i) => {
          const it = byId.get('causal-' + g.key + '-' + i);
          if (!it) return null;
          if (x.type === 'contrast') { x.a = it.question; x.b = it.answer; }
          else { x.cause = it.question; x.effect = it.answer; }
          x.conn = x.connShow = it.text; return x;
        }).filter(Boolean);
        total += rows.length;
        if (g.key === 'root') chains.rootItems = rows;
        else if (g.key === 'cross') chains.cross = rows;
        else chains.branches[Number(g.key.slice(7))].items = rows;
      });
      chains.total = total;
    }
    return out;
  }
  return { normalize, flatten, apply };
}));
