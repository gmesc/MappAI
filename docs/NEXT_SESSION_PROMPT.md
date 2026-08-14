# Prompt per la prossima sessione MappAI

> ⚠️ **FERMO AL 3 GIUGNO 2026 — non usarlo.** Cita un branch che non è più attivo
> (`feat/structural-suggestions`; si committa su `main` dal luglio) e un contesto di sessione
> vecchio di due mesi. Il punto di ripresa vero è **[`HANDOFF.md`](HANDOFF.md)**, e come si
> costruisce lo dice **[`../GUIDA-ARCHITETTO.md`](../GUIDA-ARCHITETTO.md)**. Resta qui come
> storia.


```
Progetto: MappAI (~/Claude/MappAI) — Electron app per mappe mentali / Knowledge
Graph da fonti PDF/URL. Leggi CLAUDE.md prima di iniziare (vanilla JS + window
globals, no bundler, no ES modules, appState.db.nodes mai appState.nodes,
nuovi file in public/js/ caricati DOPO app.js).

Branch attivo: feat/structural-suggestions
Working tree: pulito (auto-save hook attivo).

--- CONTESTO SESSIONE PRECEDENTE (3 giugno 2026) ---

FEATURE IMPLEMENTATE E TESTATE:
- mappai-node-styling.js: classificazione ruolo strutturale (l1/keystone/
  ordinary/leaf) + bridge marking (mono/bridge/mixed) basato su grafo
  diretto 1-hop. Sostituisce il vecchio BFS 3-hop. Anelli colorati attorno
  ai nodi L2+ massimo 2 colori, opacity ridotta per leaves, outline
  più spesso per keystone. Solo KG mode.
- Lente Relazioni: caret ▾ dentro bottone TESTO apre menu dinamico con
  SOLO le famiglie di rel presenti nella mappa. 6 famiglie + altro
  (vedi EDGE_FAMILIES in app.js ~L.278). Selezione famiglia →
  link+freccia colorati, label con outline NERO (stroke 1px) + font
  ×1.5, nodi coinvolti con outline famiglia, resto in dim 0.2.
  Bottone TESTO assume il colore della famiglia attiva.
- Edge coloring marker SVG: 7 marker arrowhead-{famiglia} in <defs>,
  uno per ogni famiglia + default grigio. Frecce colorate insieme ai link.
- Link visibility cycle: bottone "LINK" in toolbar (tra TESTO e PATH).
  3 stati: all → hierarchy → cross. Icona dinamica (network/git-fork/
  shuffle) + label dinamico (LINK/TREE/CROSS) + colore. Persistito su
  localStorage chiave mappai_link_vis_mode. markMmCrossLinks() nuova:
  link gerarchico ⇔ |levelDiff|===1 E stesso group.
- Fix PATH cliccabilità: circle.node-hitbox trasparente con
  r = getNodeRadius(d) + 10 come PRIMO figlio del node-group.
  Cattura click anche fuori dal cerchio visibile. handleBackgroundClick
  in modalità pathfinder NON resetta più source/target (era distruttivo
  ai miss-click). Per uscire si ri-clicca il bottone PATH.

FIX DISTRIBUZIONE:
- package.json: aggiunta js-yaml ^4.1.1 a dependencies (era transitiva,
  faceva crashare il .app installato con "Cannot find module 'js-yaml'").
- main.js: in dev mode (!app.isPackaged) il userData path è spostato in
  sottocartella dev/. Significa che `npm start` ora scrive in
  ~/Library/Application Support/MappAI/dev/ mentre l'app .app installata
  scrive in ~/Library/Application Support/MappAI/. Il contenuto dev/
  è stato pre-popolato con un rsync del path produzione, così non si parte
  vergini al primo npm start.

INSTALLER PRONTI IN dist/:
- ✅ MappAI-1.0.0-arm64.dmg (258 MB, Mac Apple Silicon, RIFATTO con
  fix js-yaml, testato funzionante)
- ⚠️ MappAI-1.0.0.dmg (Mac Intel x64) — DA RIFARE (fatto prima del fix
  js-yaml, crasha al primo avvio)
- ⚠️ MappAI-1.0.0.AppImage (Linux x64) — DA RIFARE (idem)
- ⚠️ MappAI-1.0.0-arm64.AppImage (Linux ARM64) — DA RIFARE (idem)
- ⚠️ "MappAI Setup 1.0.0.exe" (Windows) — DA RIFARE (idem)

Comando per rifarli tutti:
  npx electron-builder --mac --linux --linux --x64 --win

Tempo stimato: 15 minuti. I file .deb generati su macOS sono 96-byte
stub vuoti (manca dpkg/fakeroot), gli AppImage funzionano bene.

BRANCH STATUS:
- ✅ main, MappAI_main, dev allineati a feat/structural-suggestions
- ✅ global allineato (UI EN preservata, nuovi CSS+bottoni aggiunti)
- ⏸️ MappAI_studente — 17 commit di divergenza, non sincronizzato
  (è la variante con feature nascoste, da sincronizzare in sessione
  dedicata caso-per-caso)

--- DECISIONI DI DESIGN APERTE (priorità prossima sessione) ---

1. SOVRAPPOSIZIONE LENTI vs DISCIPLINE (alta priorità)
   Ci sono due moduli con overlap concettuale:
   - mappai-lenses.js: 13 lenti + window.MAPPAI_PRESETS disciplinari
   - mappai-disciplines.js: profili disciplinari dedicati
   Entrambi propongono "Storia", "Scienze", ecc.

   Raccomandazione proposta nella sessione precedente:
   - Tenere mappai-disciplines.js come "cosa studi" (Storia, Scienze,
     Liceo, Media) — scelta primaria nel form di creazione
   - Ridurre mappai-lenses.js a filtri semantici PURI non disciplinari
     (Date, Personaggi, Cause-Effetti, Definizioni, Esempi, ecc.) —
     pannello collassabile di "tuning fine"
   - Eliminare i preset disciplinari dalle lenti

   Da decidere col user prima di refactorare.

2. INSTALLER DA RIFARE (low effort, 15 min build)
   Vedi lista ⚠️ sopra. Solo lanciare il comando.

3. MAPPAI_STUDENTE SYNC (medium effort)
   Branch divergente da analizzare per propagare le nuove feature
   (lente, link visibility, node styling, fix PATH) mantenendo le
   feature nascoste per il profilo studente.

4. EDGE COLORING TOGGLE — sezione 1-7 del piano originale è SUPERATA,
   l'abbiamo già implementato come "Lente Relazioni" nel design
   definitivo (sezione 0 di docs/PLAN_edge_coloring_toggle.md).
   Il doc può essere archiviato o aggiornato per riflettere lo stato
   "implementato".

5. SOTTO-FEATURE 4b (separabile): dropdown categoria famiglia nel
   flusso di creazione manuale di un link (showPrompt ~app.js 5531).
   Dare tendina con le famiglie note + opzione "altro (testo libero)".
   Quick win.

BENCHMARK DI RIFERIMENTO (3 giugno):
- gemini-2.5-flash-lite + lenti AREA DISCIPLINARE: density 1.65,
  61.5% cross-link (test fotosintesi 4aMEDIA). Confermato che le
  lenti aumentano misurabilmente la qualità del KG su Gemini.

--- COSA NON RIPETERE ---
- Vincoli aggiuntivi in Fase 2 multipass KG → density crolla
- Hub-pass 4 fasi → non migliora GEMMA (gap modello-strutturale)
- responseMimeType:"application/json" su Infomaniak → spezza il bridge
```
