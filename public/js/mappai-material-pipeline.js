/*
 * mappai-material-pipeline.js — orchestratore UI della pipeline «Genera materiali» (011)
 * -----------------------------------------------------------------------
 * Modulo UI (script globale, caricato dopo mappai-landing-teach.js). Espone
 * window.MappAIPipeline: modale di configurazione, pre-flight/stima, orchestratore
 * a step (A mappa → B quiz → C fogli nodi → D sintesi+voce), riepilogo/riprova.
 *
 * La logica pura (naming, manifest, transizioni, stima, validazioni) vive in
 * mappai-pipeline-core.js. Questo modulo fa SOLO orchestrazione + I/O via IPC.
 * main.js resta un wrapper sottile: qui l'assemblaggio dati, lì solo fs/finestre.
 */
(function () {
  'use strict';

  // Riempito nelle fasi US1-US5. Scheletro di partenza.
  var Pipeline = {
    _running: false
  };

  if (typeof window === 'undefined') return;
  window.MappAIPipeline = Pipeline;
  console.log('[MappAIPipeline] orchestratore pipeline materiali caricato (scheletro)');
})();
