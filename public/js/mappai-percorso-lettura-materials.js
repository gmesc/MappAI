/* 0070: catalogo derivato dal canonico e metadati dei documenti su disco. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mappai-percorso-lettura-core'));
  else root.MappAIPercorsoLetturaMaterials = factory(root.MappAIPercorsoLetturaCore);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  const copy = x => JSON.parse(JSON.stringify(x));
  function fileName(title) {
    const value = String(title || '').normalize('NFC').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[. ]+|[. ]+$/g, '');
    const points = Array.from(value).slice(0, 90);
    // Lascia spazio ai suffissi e all'estensione anche con nomi Unicode.
    while (new TextEncoder().encode(points.join('')).length > 160) points.pop();
    return points.join('').trim() || 'Lettura';
  }
  function list(draft, reading, t = (_, fallback) => fallback) {
    C.validateDraft(draft);
    const records = reading.documents || {}, present = new Set(draft.activities.map(a => a.id));
    const title = draft.title.replace(/\.(pdf|docx|txt)$/i, '').trim();
    const groups = { source: t('pl_documents_source', 'Testo originale'), open: t('pl_documents_open', 'Domande aperte'), mc: t('pl_documents_mc', 'Scelta multipla') };
    const rows = [{ key: 'source', audience: 'source', format: 'source', group: groups.source, title: title + ' — ' + groups.source, activityIds: [] }];
    const claimed = new Set();
    Object.values(records).filter(r => r?.copy === true).forEach(r => (r.activityIds || []).forEach(id => claimed.add(id)));
    const batches = [], seen = new Set();
    for (let g = reading.generation; g && !seen.has(g); g = g.previous) { seen.add(g); batches.unshift(g.selection?.items || []); }
    Object.values(records).filter(r => !r.copy && Array.isArray(r.activityIds)).forEach(r => batches.push(r.activityIds.map(id => ({ id, format: r.format }))));
    batches.push(draft.activities);
    const counts = { open: 0, mc: 0 };
    for (const batch of batches) {
      const ids = new Set(batch.map(item => item.id).filter(id => present.has(id) && !claimed.has(id)));
      for (const format of C.FORMATS) {
        const activityIds = draft.activities.filter(a => ids.has(a.id) && a.format === format).map(a => a.id);
        if (!activityIds.length) continue;
        activityIds.forEach(id => claimed.add(id)); counts[format]++;
        const base = title + ' — ' + groups[format] + (counts[format] > 1 ? ' ' + counts[format] : '');
        const originalIds = batch.filter(item => item.format === format || activityIds.includes(item.id)).map(item => item.id);
        for (const audience of ['student', 'teacher']) {
          const anchor = originalIds.find(id => records[audience + '-' + id]) || originalIds[0] || activityIds[0];
          rows.push({ key: audience + '-' + anchor, audience, format,
            group: groups[format], activityIds, title: base + (audience === 'teacher' ? ' — ' + t('pl_documents_guide', 'Guida docente') : '') });
        }
      }
    }
    Object.entries(records).filter(([, r]) => r?.copy === true).forEach(([key, r]) => {
      if (!/^[A-Za-z0-9_-]+$/.test(key) || !C.FORMATS.includes(r.format) || !['student', 'teacher'].includes(r.audience) ||
        !Array.isArray(r.activityIds)) return;
      const activityIds = r.activityIds.filter(id => present.has(id));
      if (!activityIds.length) return;
      rows.push({ key, audience: r.audience, format: r.format, group: groups[r.format], activityIds, title: r.title, copy: true });
    });
    const names = new Set();
    return rows.map(row => {
      const saved = records[row.key] || {};
      if (typeof saved.title === 'string' && saved.title.trim()) row.title = saved.title.trim();
      const stem = fileName(row.title); let unique = stem, count = 1;
      while (names.has(unique.toLocaleLowerCase())) unique = stem + ' — ' + (++count);
      names.add(unique.toLocaleLowerCase());
      return { ...row, id: 'lettura:' + row.key, hidden: saved.hidden === true,
        relPath: saved.preview?.title === row.title && /^Documenti\/[^/\\]+\.html$/.test(saved.preview.path) ? saved.preview.path : 'Documenti/' + unique + '.html', options: copy(saved.options || {}) };
    }).filter(r => !r.hidden);
  }
  function subset(draft, row) {
    const result = copy(draft), ids = new Set(row.activityIds);
    result.activities = result.activities.filter(a => ids.has(a.id));
    result.sequence = result.sequence.filter(b => b.kind === 'paragraph' || ids.has(b.activityId));
    result.title = row.title; C.validateDraft(result); return result;
  }
  function duplicate(draft, row, newId) {
    if (!row.activityIds.length || row.audience === 'source') throw Error('Materiale non copiabile');
    const result = copy(draft), activityIds = [];
    for (const id of row.activityIds) {
      const item = copy(draft.activities.find(a => a.id === id));
      item.id = newId(); item.revision = 1; activityIds.push(item.id);
      result.activities.push(item); result.sequence.push({ kind: 'activity', activityId: item.id });
    }
    C.validateDraft(result); return { draft: result, activityIds };
  }
  function move(draft, index, direction, ids) {
    if (!ids) return C.moveBlock(draft, index, direction);
    const allowed = new Set(ids), positions = draft.sequence.flatMap((b, i) => b.kind === 'activity' && allowed.has(b.activityId) ? [i] : []);
    const next = positions[positions.indexOf(index) + direction];
    const result = copy(draft);
    if (next !== undefined && positions.includes(index)) [result.sequence[index], result.sequence[next]] = [result.sequence[next], result.sequence[index]];
    C.validateDraft(result); return result;
  }
  return Object.freeze({ list, subset, duplicate, fileName, move });
}));
