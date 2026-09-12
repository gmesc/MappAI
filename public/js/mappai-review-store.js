/* Persistence for teacher review. Main process only; no model calls. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ReviewCore = require('./mappai-review-core.js');
const META_FIELDS = ['level', 'group', 'parent', 'parentId', 'ambito', 'confini', 'rel', 'aiDesc'];
const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);

function readManifest(folder) {
  const file = path.join(folder, 'pipeline.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function atomicWrite(file, text) {
  const tmp = file + '.tmp-' + process.pid + '-' + Math.random().toString(36).slice(2);
  try {
    fs.writeFileSync(tmp, text, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(tmp, file);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp); // only this writer's temporary file
  }
}

function saveManifest(folder, manifest, expectedVersion) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('review-conflict: manifest non valido');
  const old = readManifest(folder);
  const version = (old && old._storageVersion) || 0;
  if ((old && old.review) || manifest.review) {
    if (Number(expectedVersion || 0) !== version) throw new Error('review-conflict: rapporto aggiornato da un altro salvataggio');
    if (old && old.review && !manifest.review) throw new Error('review-conflict: la rigenerazione non può cancellare le decisioni');
  }
  const next = Object.assign({}, manifest, { _storageVersion: version + 1 });
  atomicWrite(path.join(folder, 'pipeline.json'), JSON.stringify(next, null, 2));
  return next._storageVersion;
}

function checkMapWrite(folder, mapData) {
  const manifest = readManifest(folder);
  const review = manifest && manifest.review;
  if (!review) return;
  if (review.schema !== ReviewCore.SCHEMA || !review.initial ||
      !['awaiting_review', 'applying', 'approved'].includes(review.initial.status)) {
    throw new Error('review-conflict: revisione non riconosciuta');
  }
  const initial = review.initial;
  const expected = initial.status === 'approved' ? review.approvedRevision : review.baseRevision;
  if (!mapData || mapData.reviewRevision !== expected) {
    throw new Error('review-conflict: la mappa in memoria è precedente alla revisione salvata; riaprire il progetto');
  }
  if (initial.status === 'applying' && mapData.reviewCommit !== review.approvedRevision) {
    throw new Error('review-conflict: salvataggio delle decisioni in corso');
  }
  if (initial.status === 'applying' && (
      ReviewCore.revision(mapData, review.sources) !== review.approvedRevision ||
      JSON.stringify(ReviewCore.semanticSnapshot(mapData)) !== JSON.stringify(ReviewCore.semanticSnapshot(review.approvedSnapshot)))) {
    throw new Error('review-conflict: il contenuto non coincide con le decisioni confermate');
  }
}

// Il corpo Markdown resta la fonte di desc. Nel frontmatter viaggiano soltanto
// i campi che il formato storico perdeva e le prove originali con pagina/ID.
function nodeMetadata(node, sourcesDict) {
  const fields = {};
  META_FIELDS.forEach(k => { if (own(node, k)) fields[k] = node[k]; });
  const meta = { schema: 'mappai-node-meta@1', fields, chunks: node.chunks || [] };
  if (own(sourcesDict, node.id)) meta.sourceEntries = sourcesDict[node.id];
  return meta;
}

function restoreNodeMetadata(node, meta, mapData) {
  if (!meta || meta.schema !== 'mappai-node-meta@1') return false;
  META_FIELDS.forEach(k => { delete node[k]; if (own(meta.fields, k)) node[k] = meta.fields[k]; });
  node.chunks = Array.isArray(meta.chunks) ? meta.chunks : [];
  if (own(meta, 'sourceEntries')) {
    if (!mapData.sourcesDict) mapData.sourcesDict = {};
    Object.defineProperty(mapData.sourcesDict, node.id, { value: meta.sourceEntries, enumerable: true, writable: true, configurable: true });
  }
  return true;
}

module.exports = { readManifest, atomicWrite, saveManifest, checkMapWrite, nodeMetadata, restoreNodeMetadata };
