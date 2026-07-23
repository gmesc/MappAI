# Quickstart: validazione Pipeline «Genera materiali»

Guida di validazione per fase. Prerequisiti comuni: `npm test` verde, `npm start` (Electron), chiave Google configurata (per la voce), una fonte di prova (es. PDF «La Fotosintesi»), una classe negli Account classi.

## Fase 1 — Fondamenta headless (senza UI pipeline)

Tutto verificabile da suite + console DevTools, prima che il modale esista.

1. **Suite**: `npm test` → verde, inclusi `tests/pipeline-core.test.js` (manifest: transizioni, crash-detection, validatori step, stima) e `tests/files-core.test.js` esteso (`mapClassFolder`: con/senza sede, caratteri illegali, fallback).
2. **Builder quiz**: DevTools → `window.buildQuizSetHtml(appState.db.studySets[0])` ritorna una stringa HTML; il bottone stampa esistente sui Set di Studio apre la stessa pagina di prima (zero regressioni).
3. **PDF senza interazione**: `electronAPI.htmlToPdf({ html: window.buildQuizSetHtml(set) })` → `{ok:true, base64}` non vuoto; scrittura con `electronAPI.saveVaultFile({vaultPath, relPath:'Materiale Studio/test.pdf', base64})` → file apribile in Anteprima.
4. **Foglio nodi parametrico**: `printAllNodeLabels({ fmt:'2x2', layout:'title', toDisk:{vaultPath} })` → PDF su disco; il modale Foglio nodi manuale funziona come prima.
5. **Sintesi headless**: `MappAISynthesis.runWholeMap({ apiKey: getSystemKey(), silent:true })` → data; `buildHtml(data)` → stringa; nessun modale apparso.
6. **Vault a 2 livelli**: creare a mano `Mappe/TestClasse/vault-x/index.yaml` → `electronAPI.getAllVaults()` lo elenca con `classDir:'TestClasse'`; i vault flat restano elencati; aprire un progetto che referenzia un vault flat → si apre come prima.

## Fase 2 — Pipeline end-to-end

1. **Happy path**: fonte caricata → classe attiva → «Genera materiali» → selezionare quiz MC 2/ramo + foglio nodi title 2x2 + sintesi con voce → stima chiamate visibile → Avvia → avanzamento per step → riepilogo tutto verde. Verificare su disco: `Mappe/<classe>/<vault>/` con index.yaml, `Materiale Studio/` (PDF quiz, PDF foglio, Sintesi.html, Sintesi-audio.mp3), `pipeline.json` con 4 step `done`.
2. **Riuso in app**: i quiz generati appaiono nei Set di Studio e sono lanciabili in MappAI Live.
3. **Crash-safety** (US2): rilanciare una pipeline e uccidere l'app (⌘Q forzato) durante lo step C → riaprire → riprendere → step A e B saltati (verificare `calls` invariati nel manifest e zero chiamate nel registro consumi), C e D completano.
4. **Riprova step**: staccare la rete durante D → riepilogo con D `failed` → riattivare rete → «Riprova» su D → solo D rieseguito.
5. **Degrado voce**: rimuovere la chiave Google → pre-flight avvisa, audio deselezionato, pipeline completa con sintesi solo testo.
6. **Collisione**: rilanciare la pipeline sulla stessa fonte/classe → secondo vault con suffisso ` · 02`, il primo intatto.
7. **Preset** (US3): salvare preset, cambiare classe attiva, riaprire modale, applicare → opzioni identiche, classe = quella nuova.
8. **Sede** (US4): aggiungere nick sede nel profilo insegnante → form classe mostra la tendina → assegnare → pipeline crea `<sede>-<classe>/`.
9. **Taratura**: toggle VERDE attivo → file con ` -VERDE` nel nome e contenuti adattati; mappa standard salvo «Adatta al livello».
10. **Consumi**: dashboard Consumi AI → categoria «Pipeline materiali» con le sottovoci per step.

## Fase 3 — Insegna

1. **Selezione**: tab Insegna → click su una riga di Progetti esistenti → riga evidenziata, le 3 sezioni si filtrano sulla mappa; secondo click → deselezione, vista classe. «Riprendi» apre la mappa.
2. **Kill-switch**: `localStorage.setItem('mappai_teach_row_select','0')` + reload → click riga apre la mappa (comportamento storico).
3. **Materiali da disco**: i file della pipeline appaiono in «Materiali di studio» accanto a quelli storici; l'apertura funziona per entrambi (disco via shell / archivio via data-URI).
4. **File condivisi**: un file caricato dalla pipeline porta la mappa e sparisce/appare col filtro; un file storico appare solo senza selezione.
5. **Regressioni**: filtro classe «Solo classe attiva» invariato; modalità Costruisci (tabella progetti con menu grado) invariata.

## Post-fase (sempre)

- `npm test` verde; parse-check dei file toccati; debug-run Electron (`npm start`) senza errori console (constitution VI).
- i18n: switch EN→IT→EN sulle superfici nuove (regola 13).
