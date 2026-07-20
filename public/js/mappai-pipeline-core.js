/*
 * mappai-pipeline-core.js — logica PURA della pipeline «Genera materiali» (011)
 * -----------------------------------------------------------------------
 * Nessun accesso a fs/DOM/rete: solo funzioni deterministiche condivise tra
 * l'orchestratore UI (mappai-material-pipeline.js) e i test Node. Il manifest
 * entra ed esce come oggetto; le scritture su disco le fa l'orchestratore via IPC.
 *
 *  - createManifest / stepTransition / normalizeOnLoad → schema + macchina a stati
 *  - validateMapResult / validateQuizItems / validatePdfB64 / validateSynthesis
 *  - estimateCalls                → stima chiamate AI per la config
 *  - buildFileName                → nomi file canonici (con marcatore -VERDE)
 *  - presetNormalize / presetFromConfig → preset riusabili (US3)
 *
 * UMD: module.exports per Node, window.MappAIPipelineCore per il browser.
 * Constitution VI: logica pura testata (tests/pipeline-core.test.js).
 */
(function () {
  'use strict';

  // Riempito in Phase 2 (T005 / T030). Scheletro di partenza.
  var CORE = {};

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;
  window.MappAIPipelineCore = CORE;
  console.log('[MappAIPipelineCore] logica pura pipeline materiali caricata (scheletro)');
})();
