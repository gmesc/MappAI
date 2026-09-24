#!/usr/bin/env node
'use strict';
// Sola lettura: riusa lo stesso recupero lessicale di MappAI, senza avviare l'app.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const E = require('../../public/js/mappai-evidence-core');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const id = value => value && typeof value === 'object' ? value.id : value;

function esporta(project) {
  const pipelineBytes = fs.readFileSync(path.join(project, 'pipeline.json'));
  const evidenceBytes = fs.readFileSync(path.join(project, 'evidenze.json'));
  const p = JSON.parse(pipelineBytes), evidence = JSON.parse(evidenceBytes);
  const snapshot = p.review?.baseSnapshot;
  if (!snapshot?.nodes || !snapshot.links || !Array.isArray(evidence.records)) throw Error('Snapshot o Evidence mancanti.');
  if (E.indiceStantio(evidence, p.review.sources)) throw Error('Evidence non corrisponde alle fonti della revisione: non mescolare versioni.');
  const skipped = p.review.initial?.report?.copertura?.linkSaltati || [];
  if (!skipped.length) throw Error('Nessun nesso saltato nel rapporto iniziale: scegliere esplicitamente un altro campione.');
  const nodes = new Map(snapshot.nodes.map(n => [n.id, n]));
  const rows = [];
  snapshot.links.forEach((link, index) => {
    const source = id(link.source), target = id(link.target);
    if (!skipped.some(s => id(s.source) === source && id(s.target) === target && s.rel === link.rel)) return;
    if (!nodes.has(source) || !nodes.has(target)) throw Error('Collegamento con nodo mancante.');
    const hypothesis = [nodes.get(source).label, link.rel, nodes.get(target).label].map(x => String(x || '').trim()).join(' ');
    const group = hash(JSON.stringify([source, link.rel, target, index])).slice(0, 16);
    const packet = E.costruisciPacchetto({records: evidence.records, query: hypothesis, tetto: {unita: 3, caratteri: 1200}});
    const base = {group, link: {source, target, rel: link.rel}, originalHypothesis: hypothesis, hypothesis, expected: '', note: ''};
    rows.push({...base, id: group + '-manuale', mode: 'manuale', premise: '', references: []});
    rows.push({...base, id: group + '-evidence', mode: 'evidence', premise: packet.unita.map(u => u.text).join('\n\n'),
      references: packet.unita.map(u => ({id: u.id, sourceId: u.sourceId, title: u.title, page: u.page, text: u.text}))});
  });
  if (!rows.length) throw Error('Nessun nesso del rapporto corrisponde allo snapshot.');
  return {schema: 'mappai-banco-nli@1', createdAt: new Date().toISOString(), project: path.basename(project),
    provenance: {pipelineSha256: hash(pipelineBytes), evidenceSha256: hash(evidenceBytes), snapshot: 'review.baseSnapshot',
      retrieval: 'MappAIEvidenceCore.costruisciPacchetto; query=etichette+relazione; 3 unità / 1200 caratteri; senza reranker',
      coreSha256: hash(fs.readFileSync(require.resolve('../../public/js/mappai-evidence-core')))},
    pages: evidence.records.filter(r => r.origin === 'original').map(r => ({sourceId: r.sourceId, title: r.title, page: r.page, text: r.text})), rows};
}
if (require.main === module) {
  try {
    if (!process.argv[2]) throw Error('Uso: node tools/nli/esporta.js CARTELLA_PROGETTO');
    process.stdout.write(JSON.stringify(esporta(path.resolve(process.argv[2])), null, 2));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = {esporta};
