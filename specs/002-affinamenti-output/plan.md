# Implementation Plan: Affinamenti Output (002-affinamenti-output)

**Branch**: `002-affinamenti-output` | **Date**: 2026-07-11 | **Spec**: [spec.md](spec.md)

## Summary

Tre affinamenti indipendenti alle funzioni di output: (1) export PDF vettoriale
via svg2pdf.js vendorizzato (fallback raster preservato), (2) sintesi AI
dell'intera mappa con strategia map-reduce per ramo (panoramica + sezioni con
citazioni per-sezione), (3) validazione qualità delle keyword sui nodi foglia
(concetti dalla desc, mai il titolo, vuoto se desc povera).

## Technical Context

**Language/Version**: JavaScript ES2020 (renderer Electron 30, vanilla)

**Primary Dependencies**: NUOVA vendored: `public/js/vendor/svg2pdf.umd.min.js`
v2.2.4 (MIT, yWorks — 84KB, compatibile jsPDF 2.5.1 già in uso; registra
`jsPDF.API.svg()`). Nessun'altra dipendenza.

**Storage**: N/A — nessuna persistenza toccata

**Testing**: suite Node esistente deve restare verde; verifica manuale Electron
(quickstart.md). Logica nuova = filtro keyword + composizione sintesi: vivono in
moduli DOM non testati in Node → giustificato in Complexity Tracking.

**Target Platform**: desktop Electron; iPad (Capacitor) mantiene i percorsi share esistenti

**Project Type**: desktop-app (renderer)

**Constraints**: offline-first (libreria vendorizzata, no CDN); dual-provider
(output testo/JSON con `salvageTruncatedJSON`, MAI `responseSchema`);
budget token per chiamata invariati (map-reduce, non chiamate giganti)

**Scale/Scope**: 4 file toccati + 1 vendor + i18n; ~250 righe

## Constitution Check

| Principio | Esito | Nota |
|---|---|---|
| I. Accessibilità | ✅ | PDF nitido in stampa/zoom = beneficio diretto ipovisione; keyword pulite = card di studio senza rumore |
| II. Reversibilità | ✅ | PDF: fallback raster automatico su errore (vecchio codice intatto); sintesi ramo singolo invariata; keyword: validazione additiva |
| III. Script globali | ✅ | Vendor UMD caricato da index.html; zero moduli ES |
| IV. Dual-provider | ✅ | Sintesi/keyword: testo + salvage, senza schema; PDF: nessuna AI |
| V. Vault | ✅ N/A | |
| VI. Logica pura testata | ⚠️ giustificato | Filtro keyword (~20 righe) e compose sintesi vivono nei moduli DOM: estrarli in UMD dedicato costa più del valore (vedi Complexity Tracking) |
| VII. i18n | ✅ | Nuove stringhe via `window.t` + chiavi EN |

## Project Structure

```text
public/
├── index.html                       # <script vendor/svg2pdf> dopo jspdf
├── js/
│   ├── vendor/svg2pdf.umd.min.js    # NUOVO vendor (MIT)
│   ├── mappai-d3-render.js          # exportPDF vettoriale + _exportPDFRaster fallback
│   ├── mappai-branch-synthesis.js   # opzione "Tutta la mappa" + map-reduce + render/print sezioni
│   └── mappai-print-dossier.js      # _cleanKeywords + prompt foglie + soglia desc
└── traduzioni/en_translations.js    # nuove chiavi bs_*/kw_*/pdf_*
```

## Decisioni

- **D1 PDF**: clona `#map-svg` con CSS inline (riuso pattern `exportSVG`),
  azzera la transform di zoom sul `<g>` clonato, viewBox = bbox del contenuto
  (`getBBox()` sull'originale) + margine; jsPDF formato = dimensioni bbox;
  `await pdf.svg(clone,…)`. Overlay UI esclusi PER COSTRUZIONE (non stanno
  nell'SVG). Vecchio percorso raster → `_exportPDFRaster()` come fallback
  automatico con toast dedicato.
- **D2 Sintesi intera**: opzione `__ALL__` nel select. Mappa ≤ 30 nodi → una
  chiamata sola (flusso esistente su tutti i nodi). Altrimenti per ogni ramo
  (L1/hub) chiamata col template `BRANCH_SYNTHESIS` esistente → sezioni; poi
  UNA chiamata di panoramica (prompt inline, lingua da `mapLangNote`) sulle
  sintesi accorciate. Citazioni numerate PER SEZIONE (rinumerazione globale =
  fonte di bug, evitata di proposito). Ramo fallito → segnaposto nella sezione.
- **D3 Keyword foglie**: item del batch marcati `leaf`; prompt esteso (concetti
  SOLO dalla desc; desc < 15 parole → array vuoto). `_cleanKeywords(node, arr)`
  unica per AI e fallback: trim, dedupe case-insensitive, via token del titolo,
  via token < 3 char, cap 7.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| VI: `_cleanKeywords` e compose-sintesi non in modulo UMD testato | Funzioni piccole (~20-40 righe) incollate ai moduli DOM che le usano | Estrarre un nuovo `mappai-output-core.js` UMD per 2 helper = file in più nel load order e attrito > valore; verifica in quickstart + console |
