# Handoff — Co-docente AI / tab ELABORA + Triage adattivo

**Data:** 2026-07-22 · **Branch:** `fix/deepening-residuo` · **Suite:** 666/666
**Memoria (~/.claude):** [[codocente-project]] · [[mm-triage-adaptive-depth]] · [[piano-studio-taxonomy]] · [[audit-deepening-dnodes]]

> ⚠️ **TUTTO è DA TESTARE IN ELECTRON VIVO.** Il preview browser di questo ambiente è
> agganciato all'`index.html` col licensing (schermata sblocco) e NON renderizza il codice.
> Verifica = `npm start` sull'app reale. Le suite Node (666/666) coprono solo la logica pura.

---

## 1. Dove siamo (commit già fatti)

Branch `fix/deepening-residuo`, due commit puliti:
- **`f309bc8`** `feat(codocente): tassonomia Piano di studio ticinese + spec-kit ELABORA (012)`
- **`7718fca`** `feat(codocente): triage profondità adattiva + tab ELABORA`

**Non committati (di proposito):** `Piano-di-studio-perfezionato.pdf` (2.7M, copyright) +
`public/data/piano-studio-ticino.json.bak-pre-portale` (backup). Decidere se vanno in repo.

Il branch NON è mergiato in main. Prima del merge: test Electron vivo (§4).

---

## 2. Cosa è stato costruito

### A) Triage adattivo — profondità del deepening dal TIPO di scheda
Toggle **"Adattiva"** nella landing (riusa il morto ex-BERT). Origine: misure CoreCov@Lk
(harness `corecov*.js`) → il contenuto essenziale vive a profondità diversa secondo il tipo
epistemico (tassonomico front-loaded a L≤2 vs procedurale/causale che sfonda a L3), NON la
materia; un contatore deterministico non lo predice (r≈0.17) → serve un lettore semantico.

- `public/js/mappai-mm-triage.js` — 1 chiamata AI pre-Fase-1 (solo MM), gated
  `mappai_mm_triage_enabled`. Ritorna `{contentType, essentialDepth(2|3), hasOrderedChains,
  coverageTarget, rationale}` o `null` (mai blocca). **temp 0 + cache per-fonte** (djb2 del
  corpus → verdetto deterministico + zero costo su rigenerazione).
- `app.js`: `setMMLogic/getMMLogic` guidano il flag; pre-pass in `startGeneration` (~L1391)
  stasha `appState.mmTriage`.
- `mappai-mm-extraction.js` (~L1183): `essentialDepth` cappa il TARGET del deepening (Fase 3.7)
  = `min(maxMapLevel, essentialDepth)`. Tassonomico(2) → deepening spento; procedurale(3) → scava
  solo foglie sotto L3.
- Console: `MappAIMetrics.enable/disableMMTriage()`. Sottovoce consumi `map/triage`.

**Audit reale:** Guerra Fredda(5700w)→ed=3, cap confermato. Genetica(schede corte 307-651w)→
segnale differenzia (Divisioni Cell. 3 vs Gruppi 2) ma rumoroso su schede corte.

### B) Co-docente — tab ELABORA (analisi + arricchimento copertura-FONTE)
Ambiente DOCENTE post-generazione. Split-screen: fonte a sx, analisi+card a dx.

- **Motore puro** `public/js/mappai-enrich-core.js` (UMD, +8 test `tests/enrich-core.test.js`,
  zero AI, zero mutazione): `analyzeTextSignals` (nessi logici per tipo/densità/frasi lunghe/
  ridondanza=salienza, ogni segnale con AZIONE), `analyzeCoverage` (nodi poveri → card con
  frasi-fonte **VERBATIM** via `assignResidues` globale), `analyzeEnrichment(state, {extraCorpus})`.
  Compone `deepen-core` + `desc-fidelity`; delega gli structural gap a `structure-analyzer`.
- **Guscio** `public/js/mappai-elabora.js` (`window.MappAIElabora`): render split-screen, emoji
  **Noto/Android** (`var(--emoji-font)`), CSS scoped `.elab-*` iniettato once, light MappAI
  adattivo 13"↔4K. Azioni via dispatcher:
  - `addCitation` → `openEditModal(node, appendText)` (edit-modal esteso col 2° param; la
    citazione va in coda alla desc, **non-mutante fino al salvataggio** — percorso scrittura UNICO).
  - `addTextPrompt`/`onPdf` → `_persistSource` (push in `appState.sources` + `saveCurrentProject`
    → PERSISTITO; `corpusFromState` lo include → nuove card dal materiale aggiunto = chiusura gap
    senza fabbricazione).
  - `ignore` (sessione) · `openFromMap`/`backToMap`/`openProject`.
- **DUE ingressi** (importante — vedi Gotcha §3.1):
  1. **Menu azioni della mappa** → "Co-docente (Elabora)" (`openFromMap`, sulla mappa corrente).
  2. **Toggle landing "Elabora"** → empty-state con **picker mappe salvate** (tabella stile
     Insegna) → click riga `openProject` = carica + elabora.
- Landing: seg button `landing-mode-elabora` + `#elabora-content`; `landing-teach.js` a 3 modalità
  (`readMode/applyMode/setMode`); `renderElaboraProjects()` (tabella Insegna, no Riprendi/QR).

### C) Riorg UI (richiesta utente 22/7)
- **Menu azioni mappa** riordinato: Materiali · Live · Studio · Garden · Graph · SincronizzaVault ·
  **Revisione** · **Co-docente**.
- **Revisione** (tool `MappAICorrection`, correzioni annotate) TOLTO dalla landing header
  (`mountButton` → no-op), messo nel menu (chiama `MappAICorrection.start/review`).
- Filtro Insegna rinominato "Mostra tutto/Solo classe attiva" → **"Tutti/Classe"**; toggle
  **Tutti/Classe** aggiunto anche a Costruisci ("Progetti salvati") e ELABORA, filtro condiviso
  (`allowedProjectIds`, `LS_FILTER='mappai_teach_class_filter'`).

### D) Fondazione (commit f309bc8)
`public/data/piano-studio-ticino.json` (287 competenze/17 discipline, +traguardi da portale) +
`specs/012-co-docente/` (spec-kit, 5 US a layer) + `docs/corpus-pds-ticino/`.

---

## 3. Gotchas critici (trappole — leggere prima di toccare)

1. **`window.StorageManager` NON ESISTE.** `StorageManager` è un `const` lessicale (come
   `appState` che è `let`), MAI messo su `window`. Da moduli esterni: usare **bare `StorageManager`
   con `typeof`-guard**, oppure i wrapper globali (`window.loadSavedProject` È su window). Questo
   era il bug "lista ELABORA vuota" (le mie `window.StorageManager.*` erano undefined → return
   anticipato). Corretta anche la stessa guardia rotta preesistente in `renderBuildProjects`.
2. **`appState` è `let`, non su window** → `_getAppState()` pattern (già in elabora.js).
3. **Emoji ELABORA = Noto/Android** (unicode + `var(--emoji-font)`), scelta utente per QUESTO
   tab. Altrove la regola è Lucide nei modali. Nel MOCKUP artifact le emoji erano SVG inline
   (CSP blocca i font-CDN); nell'app reale il webfont Noto è già caricato.
4. **Navigazione landing↔mappa**: `switchToMapLayout` nasconde `#landing-view`, mostra
   `#map-view.active`. `backToLanding` fa `location.reload()` → landing SEMPRE fresca senza mappa
   → ELABORA NON può avere una mappa dal toggle landing a meno di caricarne una col picker.
5. **`renderRecentProjects` (Costruisci) vs `renderElaboraProjects` (Insegna-style)**: due
   renderer di progetti diversi. ELABORA usa il secondo (layout Tipo/Titolo/Classe/Data).
6. **Timing `openProject`**: `loadProject`+`setTimeout(openFromMap, 350)`. Se una mappa grande
   tarda >350ms → openFromMap parte prima che `appState.db` sia popolato → empty-state. Se capita,
   sostituire il timeout fisso con un poll su `hasMap()`.
7. **i18n regola 13**: chiavi `data-i18n` in ENTRAMBI i dizionari; chiavi `t('k','fallback IT')`
   → solo EN in `en_translations.js`. Audit ELABORA: 0 mancanti.

---

## 4. DA TESTARE IN ELECTRON VIVO (checklist prima del merge)

**Triage:**
- [ ] Toggle "Adattiva" ON → genera MM (multipass) da scheda tassonomica (es. Cromosomi) → 0 nodi
      `_D`; da procedurale (es. Storia Carta) → `_D` solo sotto L3. Log `[MMTriage]` in console.
- [ ] Rigenerazione stessa scheda → cache hit (verdetto identico, nessuna 2ª chiamata AI).
- [ ] Toggle OFF → comportamento identico a prima (byte-identical).

**ELABORA:**
- [ ] Menu azioni mappa → "Co-docente (Elabora)" apre lo split-screen sulla mappa; "‹ Torna alla
      mappa" rientra.
- [ ] Toggle landing "Elabora" → picker "MAPPE SALVATE" si popola (tabella Tipo/Titolo/Classe/
      Data, cartella+cestino, NO play/QR). Click riga → carica + elabora.
- [ ] Toggle Tutti/Classe filtra (Costruisci/Insegna/Elabora); classe senza mappe → mostra tutte.
- [ ] Card copertura → "+Aggiungi citazione" apre l'edit modal precompilato con la citazione;
      salvando, la desc del nodo la include.
- [ ] "Aggiungi testo/PDF" → materiale persistito nelle sources → nuove card dal materiale.
- [ ] Emoji Noto rese; impaginazione ok su 13" e 4K; "Ignora" nasconde la card.

**Riorg:**
- [ ] Revisione sparita dalla landing header; presente nel menu mappa (avvia/rivedi correzioni).
- [ ] Ordine menu corretto; Revisione/Co-docente sotto Sincronizza Vault.

---

## 5. Prossimi passi

1. Test Electron vivo (§4) → correggere quel che rompe → **merge in main**.
2. **US2** — riformula AI opzionale (CTA "✨ Riformula" vincolata alle frasi-residuo mostrate).
3. **US3** — domande co-generate per ramo (form-editor per tipo tf/mc/cloze/open; riusa
   `generateDynamicQuiz`; JSON grezzo = vista avanzata, mai UX primaria). Vedi anticipazioni in
   [[codocente-project]] (editor condiviso + percorso scrittura unico + oggetti validati).
4. **US4** — tag competenza descrittivo + lente curricolare (usa `piano-studio-ticino.json`;
   riusa `mappai-lenses.js`). Mai gap-checker prescrittivo (LLM-fuzzy/Goodhart).
5. **US5** — loop col dato-studente (gap-scheda × risultati Live) — il pezzo difendibile.
6. **Grassetto/rich-text** — task TRASVERSALE (markdown minimale + render sanitizzato ovunque
   compare `desc`). Giuntura pronta (editing passa dall'edit-modal). NON farlo nell'MVP.
7. **Fase "Architetta"** (pre-generazione, sola diagnosi descrittiva mai generativa) — feature
   separata futura.

---

## 6. Principi non negoziabili (governano tutto il co-docente)
1. **Descrittivo, MAI giudicante** — nessun voto/pagella del materiale del docente.
2. **Advisory, MAI gate** — card che il docente approva/modifica/ignora.
3. **Anti-fabbricazione** — fonte = ground truth, citazioni VERBATIM, "+Aggiungi" inserisce la
   citazione letterale, MAI testo AI. È l'OPPOSTO di `enrichThinDescs` (riscrive desc in silenzio).
4. **Attrito/fluency** — default frictionless, ragionamento a un colpo d'occhio; l'accetta/rifiuta
   È l'interazione che costruisce AI fluency nel docente.

## 7. Harness diagnostici (in scratchpad di sessione, throwaway)
`corecov.js`/`corecov3.js` (CoreCov@Lk = copertura-fonte per livello), `triage_baseline.js`
(baseline deterministico refutato, r≈0.17), `gf_analyze.js`/`gen_analyze.js` (audit ADATTIVA vs
NA su vault reali), `triage-test.js` (11 test gating), `gen_emoji_mockup.js` (mockup 3-set icone).
NON in repo — ricreabili dai memo se servono.
