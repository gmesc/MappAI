/* Pure annotation rules shared by the local bank and its tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BankReview = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clean = (value, max = 4000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const norm = value => value.replace(/\s+/g, ' ').trim();
  const slice = (text, start, end) => [...text].slice(start, end).join('');
  function locate(page, text, within) {
    text = clean(text, 500000);
    if (!text) throw Error('Seleziona un passaggio della fonte.');
    const base = within ? within.start : 0;
    const raw = within ? slice(page.text, within.start, within.end) : page.text;
    const at = raw.indexOf(text);
    if (at < 0) throw Error('Il passaggio deve essere copiato esattamente dal testo archiviato.');
    if (raw.indexOf(text, at + 1) >= 0) throw Error('Passaggio ripetuto: includi più contesto per identificarlo.');
    const start = base + [...raw.slice(0, at)].length;
    return { pageId: page.id, recordId: page.recordId, start, end: start + [...text].length, text };
  }
  function validate(test, pages, input) {
    if (!input || typeof input !== 'object') throw Error('Annotazione mancante.');
    const state = ['draft', 'reviewed', 'uncertain'].includes(input.status) ? input.status : 'draft';
    const reviewer = clean(input.reviewer, 120), notes = clean(input.notes);
    const judgments = Object.create(null);
    const expected = [], partial = [], issues = [];
    for (const [index, candidate] of test.candidates.entries()) {
      const value = input.judgments?.[candidate.id] || {};
      const grade = ['', 'relevant', 'partial', 'irrelevant'].includes(value.grade) ? value.grade : '';
      const quote = clean(value.quote, 500000);
      judgments[candidate.id] = { grade, quote, note: clean(value.note, 1000), formulation: clean(value.formulation, 500000) };
      if (!grade) issues.push({ candidateId: candidate.id, kind: "grade", message: "Passaggio " + (index + 1) + ": manca la valutazione." });
      if (grade === 'relevant' || grade === 'partial') {
        // Drafts may retain an unfinished excerpt; completed annotations cannot.
        try {
          const found = locate(pages.find(p => p.id === candidate.pageId), quote, candidate);
          (grade === 'relevant' ? expected : partial).push(found);
        } catch (error) { issues.push({ candidateId: candidate.id, kind: "quote", message: "Passaggio " + (index + 1) + ": collega una citazione esatta alla fonte." }); }
      }
    }
    if (!Array.isArray(input.additions || []) || (input.additions || []).length > 40) throw Error('Troppi passaggi aggiunti.');
    const additions = (input.additions || []).map(value => {
      const page = pages.find(p => p.id === value.pageId && p.project === test.project);
      if (!page) throw Error('Pagina estranea al dossier.');
      const found = locate(page, value.text);
      const grade = value.grade === 'partial' ? 'partial' : 'relevant';
      (grade === 'relevant' ? expected : partial).push(found);
      return { ...found, grade, note: clean(value.note, 1000) };
    });
    const sourceChecked = input.sourceChecked === true, noEvidence = input.noEvidence === true;
    if (!sourceChecked) issues.push({ field: 'source-checked', message: 'Conferma di avere consultato il PDF e il contesto necessario.' });
    if (noEvidence && (expected.length || partial.length)) issues.push({ field: 'no-evidence', message: 'Prova assente è incompatibile con passaggi pertinenti o parziali.' });
    if (noEvidence && !notes) issues.push({ field: 'notes', message: 'Descrivi il controllo svolto nel dossier per confermare l’assenza.' });
    if (!noEvidence && !expected.length && !issues.some(i => i.kind === 'quote')) issues.push({ field: 'manual-text', message: 'Aggiungi un passaggio pertinente, oppure lascia il caso da chiarire.' });
    if (state === 'reviewed' && issues.length) throw Object.assign(Error(issues[0].message), { issues });
    const unique = items => [...new Map(items.map(x => [x.pageId + ':' + x.start + ':' + x.end, x])).values()];
    const manualDraft = input.manualDraft && pages.some(p => p.id === input.manualDraft.pageId && p.project === test.project)
      ? { pageId: input.manualDraft.pageId, text: clean(input.manualDraft.text, 500000) } : null;
    return { status: state, reviewer, notes, judgments, additions, sourceChecked, noEvidence, manualDraft, expected: unique(expected), partial: unique(partial) };
  }
  function completionIssues(test, pages, input) {
    try { validate(test, pages, { ...input, status: 'reviewed' }); return []; }
    catch (error) { return error.issues || [{ message: error.message }]; }
  }
  function replaceQuote(page, candidate, judgment, quote) {
    const exact = locate(page, quote, candidate).text;
    let formulation = judgment.formulation || '';
    if (judgment.quote) {
      try { locate(page, judgment.quote, candidate); }
      catch (_) {
        if (formulation !== judgment.quote) formulation = [formulation, judgment.quote].filter(Boolean).join('\n\n');
      }
    }
    if (formulation.length > 500000) throw Error('Conserva la formulazione in una copia prima di sostituire la citazione: limite del campo raggiunto.');
    return { ...judgment, quote: exact, formulation };
  }
  function position(expected, ranking) {
    const at = ranking.findIndex(row => expected.some(e => row.pageId === e.pageId && row.start <= e.start && row.end >= e.end && norm(row.text).includes(norm(e.text))));
    return at < 0 ? null : at + 1;
  }
  function exportBank(packet, state) {
    const cases = [];
    for (const test of packet.cases) {
      const saved = state.annotations[test.id];
      if (saved?.status !== 'reviewed') continue;
      const a = validate(test, packet.pages, saved);
      cases.push({ id: test.id, project: test.project, query: test.query, split: test.split, category: test.category,
        expected: a.expected, partial: a.partial, baseline: test.runs.legacy,
        humanReview: { reviewer: a.reviewer, notes: a.notes, sourceChecked: true, noEvidence: a.noEvidence, updatedAt: saved.updatedAt } });
    }
    return { schema: 2, annotationStatus: 'human-reviewed subset; relevance only', packetId: packet.id,
      annotationRevision: state.version, corpusSha256: packet.corpusSha256, documents: packet.documents.map(d => ({ id: d.id, title: d.title, sha256: d.sha256 })),
      totalCases: packet.cases.length, excluded: packet.cases.filter(t => !cases.some(c => c.id === t.id)).map(t => ({ id: t.id, status: state.annotations[t.id]?.status || 'pending' })), cases };
  }
  function report(packet, state) {
    const bank = exportBank(packet, state);
    const cases = bank.cases.map(test => {
      const original = packet.cases.find(c => c.id === test.id);
      return { id: test.id, split: test.split, hasEvidence: !!test.expected.length,
        methods: Object.fromEntries(Object.entries(original.runs).map(([method, rows]) => [method, { position: position(test.expected, rows), returned: rows.length }])) };
    });
    const summary = {};
    for (const split of ['development', 'verification']) {
      summary[split] = {};
      const subset = cases.filter(c => c.split === split);
      for (const method of new Set(subset.flatMap(c => Object.keys(c.methods)))) {
        const available = subset.filter(c => c.methods[method]);
        const positive = available.filter(c => c.hasEvidence);
        const ranks = positive.map(c => c.methods[method].position);
        summary[split][method] = { n: positive.length, absent: available.length - positive.length,
          hit5: ranks.length ? ranks.filter(p => p && p <= 5).length / ranks.length : null,
          hit20: ranks.length ? ranks.filter(p => p && p <= 20).length / ranks.length : null,
          mrr20: ranks.length ? ranks.reduce((n, p) => n + (p && p <= 20 ? 1 / p : 0), 0) / ranks.length : null,
          misses: positive.filter(c => !c.methods[method].position || c.methods[method].position > 20).map(c => c.id),
          noEvidenceWithResults: available.filter(c => !c.hasEvidence && c.methods[method].returned).map(c => c.id) };
      }
    }
    return { packetId: packet.id, annotationRevision: state.version, reviewed: cases.length, total: packet.cases.length,
      note: 'Hit@k = quota di domande con almeno un passaggio pertinente completo nei primi k. Casi parziali/da chiarire esclusi; assenza rendicontata separatamente. Non misura correttezza scientifica. Corpus piccolo e annotazioni non esaustive limitano il confronto.', summary, cases };
  }
  return { validate, locate, completionIssues, replaceQuote, position, exportBank, report };
}));
