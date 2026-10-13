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
  /* ── RIMANDI A UN NODO (0093, C) ──────────────────────────────────────────
     Il modello che scrive la Panoramica riceve il materiale con le intestazioni
     `## label [nodo ID]` (grounding-core, buildInput) e a volte le imita: scrive
     `[[ROOT]]` o `[[src-1_0_L3_A2]]` dove andrebbe un rimando a una FONTE.
     Il primo resta letterale davanti al docente, il secondo ha la forma di una
     fonte e blocca «Approvato». Un rimando a un nodo non dice niente all'allievo:
     si toglie dal testo (con lo spazio prima) e resta nel registro tecnico.
     Il testo intorno non si tocca (memoria «citazioni verbatim»).
     Le fonti hanno la forma `src-` + base36 minuscolo (grounding-core, hash):
     non hanno mai `_` né maiuscole. Un nodo è un ID della mappa passato da chi
     chiama, oppure ha la forma dei nodi delle MindMap (`ROOT`, `1_0_L3_A2`).
     Un rimando che non è né fonte né nodo resta dov'è: lo segnala la revisione. */
  const SOURCE_ID = /^src-[0-9a-z]+$/;
  function nodeMarkers(text, nodeIds) {
    const ids = nodeIds ? new Set(Array.from(nodeIds, String)) : null, removed = [];
    const clean = String(text || '').replace(/[ \t]*\[\[([^\[\]\s]+)\]\]/g, (m, id) => {
      const bare = id.replace(/^src-/, '');
      const node = (ids && ids.has(bare)) ||
        (!SOURCE_ID.test(id) && (bare === 'ROOT' || /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+$/.test(bare)));
      if (!node) return m;
      removed.push(id);
      return '';
    });
    return { text: clean, removed };
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
        // 0093 (C): una Panoramica già fatta entra nella revisione senza i rimandi a nodi
        const intro = nodeMarkers(data.intro);
        const introSources = Array.isArray(data.introSources) ? data.introSources
          : G.citationRegistry(intro.text, (data.sections || []).flatMap(s => s.sourcesArr || []));
        if (data.intro) out.push(Object.assign({ id: 'synthesis-intro', kind: 'synthesis', text: intro.text, citations: clone(introSources), step: 'D', part: 'intro', title: 'Panoramica' },
          intro.removed.length ? { nodeMarkers: intro.removed } : {}));
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
        if (byId.get('synthesis-intro')?.citations) data.introSources = clone(byId.get('synthesis-intro').citations);
        // i rimandi a nodi tolti in `flatten` restano nel registro tecnico della Panoramica
        const tolti = byId.get('synthesis-intro')?.nodeMarkers;
        if (Array.isArray(tolti) && tolti.length) {
          const g = Object.assign({}, data.introGrounding);
          g.nodeMarkers = Array.from(new Set((Array.isArray(g.nodeMarkers) ? g.nodeMarkers : []).concat(tolti)));
          data.introGrounding = g;
        }
        data.sections = (data.sections || []).map((s, i) => {
          const it = byId.get('synthesis-' + i);
          if (!it) return null;
          applySynthesisTriples(s, i, byId);
          return Object.assign({}, s, { rawText: it.text, sourcesArr: clone(it.citations || s.sourcesArr || []), failed: false });
        }).filter(Boolean);
      } else if (byId.has('synthesis-whole')) {
        data.rawText = byId.get('synthesis-whole').text;
        if (byId.get('synthesis-whole').citations) data.sourcesArr = clone(byId.get('synthesis-whole').citations);
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
  return { normalize, flatten, apply, nodeMarkers };
}));
