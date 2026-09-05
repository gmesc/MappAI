# PIANO — Audit di distribuzione ai tester

> Scritto il **30 agosto 2026**. La distribuzione ai tester parte attorno al
> **9 settembre 2026**: dieci giorni. Questo documento È il punto d'ingresso della
> fase: una chat nuova lo legge dall'alto e sa che cosa fare, in che ordine, e con
> quali prove. Chi lo aggiorna: spunta le caselle e annota le misure, come
> in `HANDOFF.md`.
>
> **Obiettivo in una riga:** installer puliti e precisi per macOS (arm64 + Intel)
> e Windows, un'app che non crasha al primo avvio su una macchina che non è
> quella di Giacomo, e una rete che raccoglie gli errori quando succedono lo stesso.

---

## 0. Le piattaforme dei tester

| Piattaforma | Chi | Come si prova |
|---|---|---|
| macOS arm64 | tester + Giacomo | il Mac di sviluppo (utente PULITO, non quello di lavoro) |
| macOS Intel | forse alcuni tester | build x64 da provare almeno all'avvio (Rosetta sul Mac arm64 non basta come prova piena, ma è meglio di niente) |
| Windows | **il PC Windows di Giacomo** | build NSIS installata lì — è l'unica macchina Windows disponibile |

---

## 1. I tre allarmi GIÀ TROVATI (30/8, ricognizione)

Questi non sono ipotesi: sono stati misurati sulla cartella del progetto.

- **a) Manca la whitelist `files` nel blocco `build` di `package.json`.**
  electron-builder impacchetta TUTTO il repo tranne le devDependencies: `ios/`
  (349 MB), `PITCH/` (65 MB), `tools/` (14 MB), `graphify-out/` (8 MB), `docs/`,
  `tests/`, `specs/`, `Inkscape/`, `game graphic cassets/`. Un installer da
  centinaia di MB che consegna ai tester documenti interni, piani di lavoro e
  materiale pitch. **È il primo intervento della fase.**
- **b) `power _keys.rtf` sta nella RADICE del progetto.** Non tracciato, non in
  `.gitignore`: senza whitelist finirebbe dentro l'app. Dal nome è un file di
  chiavi/password: **va spostato FUORI dalla cartella del progetto** (gesto di
  Giacomo, non dell'agente — il file non si apre e non si committa).
- **c) `node-llama-cpp` pesa ~51 MB** (più `asarUnpack` dedicato) ed è richiesto
  da `main.js:11` solo per gli NPC narranti del Dungeon — che dal 24/8 non ha
  più ingressi UI (resta `MappAIGames.enable()` da console). Candidato a uscire
  dalle `dependencies` per questa distribuzione; il require in `main.js` è già
  «sicuro» (non esplode se il modulo manca) — **verificarlo davvero** prima di
  toglierlo.

---

## 2. Le cinque fasi

### FASE 1 — Igiene del pacchetto (giorni 1-2)
Obiettivo: dentro l'app solo ciò che le serve per girare.

- [ ] `power _keys.rtf` fuori dal progetto (Giacomo). ⚠️ 30/8: sta in `docs/`
      (non più in radice); la whitelist ora esclude `docs/` quindi NON finisce
      nell'app, ma va comunque spostato fuori dal repo.
- [x] Whitelist `files` in `package.json → build` (30/8). Whitelist POSITIVA:
      `main.js` + i 6 file server di root (`main_npc_llm`, `garden-server`,
      `live-server`, `tutor-server`, `collab-server`, `relay-client` — tutti
      `require`-ati da `main.js`), `prompts_config.json`, `public/**`.
      Esclusi dentro public: `dev/` (solo commenti lo citano), `*.bak*`,
      `*.code-workspace`, `index_classi_nuove_modifiche_manual.html`,
      `map_font_config.html` (zero riferimenti runtime). Tutto il resto del
      repo è fuori per costruzione (whitelist, non blacklist).
- [x] **`node-llama-cpp` rimosso dalle `dependencies`** + `asarUnpack` tolto
      (30/8): verificato che `main_npc_llm.js` fa dynamic `import()` lazy solo
      in `ensureLoaded` — il `require` di main.js non esplode senza il modulo.
      −51 MB. Reversibile: ripristinare la riga in package.json + `npm install`.
- [x] Versione → `1.0.0-beta.1` (30/8).
- [x] `npm run pack` + ispezione asar (30/8): radice asar = solo i file della
      whitelist; zero `ios/PITCH/tools/docs/tests/dev`; zero llama; nessun
      `app.asar.unpacked`.
- [x] Peso (30/8): **app.asar 55 MB** · `MappAI.app` totale 310 MB, di cui
      254 MB è il framework Electron (incomprimibile, uguale per tutti);
      il .dmg comprimerà. Peso .dmg da annotare in Fase 2 al primo `npm run dist`.

#### Aggiornamento Fase 1 dopo l'audit di Fase 2 (30/8, sera) — whitelist v2
L'audit multi-agente (23 rilievi confermati, verifica avversaria ciascuno) e la
prova di avvio della build hanno CORRETTO la whitelist v1:
- [x] **`relay/relay-core.js` AGGIUNTO** — la v1 lo escludeva e l'app impacchettata
      **crashava all'avvio** (require dinamico `path.join(__dirname,'relay',...)` in
      relay-client.js:23, invisibile al grep su `require('./`). Il sintomo: NSAlert
      nativo muto prima della finestra. Trovato rieseguendo l'asar con l'electron di
      dev (`npx electron <app.asar>` → stderr parla).
- [x] **`tools/voxel-proto/**` AGGIUNTO** (428 KB) — il bottone «Knowledge Garden»
      della landing carica `tools/voxel-proto/studio.html` (main.js:60) e il
      garden-server reindirizza gli studenti su `/tools/voxel-proto/garden.html`:
      senza, finestra vuota + 404. Verificato nella build: la finestra Studio si
      apre e renderizza.
- [x] **Potati (tutti a zero riferimenti runtime, verificati due volte):**
      `public/esempi/` (16,3 MB — «esempi» nei js era la parola italiana, non il path),
      `public/MappAI_logo.svg` (324 KB), `public/data/piano-studio-ticino.json`
      (232 KB — la lente curricolare non è mai stata cablata), legendoflua
      sounds/fonts/_edit/_shelf/effects/ui + sorgenti .aseprite/.xcf (~3 MB),
      spacebears tutto tranne i 2 font DejaVu woff/woff2 (unico uso:
      mappai-games.js:799), fantasticdungeons js+css, rogue8x8, roguedb32.
- [x] **`docx` rimosso dalle dependencies** (−8 MB di asar: mai `require`-ato da
      nessun file); **`jszip` dichiarato esplicito** `^3.10.1` (main.js:3222 lo
      richiede direttamente: prima funzionava solo perché transitivo di docx/mammoth).
- [x] **Peso finale v2: app.asar 31 MB** (da 55). `.dmg` costruiti il 30/8:
      **arm64 114 MB**, **x64 (Intel) 128 MB** — il grosso è il framework
      Electron, uguale per qualsiasi app. Asar x64 verificato identico
      (relay-core + voxel-proto dentro).
- [x] **Installer Windows costruito** (30/8, cross-build NSIS dal Mac):
      `MappAI Setup 1.0.0-beta.1.exe`, **98 MB, x64** (⚠️ il default di
      electron-builder su Apple Silicon è win-arm64: serve sempre
      `npx electron-builder --win --x64`). Asar verificato. Da provare sul
      PC Windows di Giacomo (Fase 2).
- [x] **electron-builder 24 → 26.15.3** (4/9, branch `chore/electron-builder-26`):
      chiude 8 degli 11 avvisi Dependabot (restano `extract-zip` di Electron e
      `xmldom` di mammoth). Verificato costruendo DUE volte lo stesso codice
      (24 → `dist-eb24`, 26 → `dist-eb26`) e confrontando: **file dell'app
      nell'asar identici** (0 mancanti, 0 aggiunti, 0 di peso diverso) su mac
      arm64, mac x64 e win; `Info.plist` uguale salvo l'hash d'integrità;
      `codesign --verify --deep --strict` OK per tutte e quattro le app; le
      quattro app partono e restano vive 12 s con log identico. Due differenze di
      forma: il 26 mette `jszip` in `app.asar.unpacked/` (51 file, l'asar
      scende da 30,7 a 29,9 MB; `require` lo trova lo stesso) e l'exe NSIS pesa
      94,6 MB invece di 103,7 (compressione diversa, contenuto uguale). Windows
      resta da provare sul PC (⚠️ costruito arm64 per il confronto).
- [ ] **Electron 39.8.10 → 41.10.7** (4/9, branch `chore/electron-40`, NON in main):
      chiesto il 40, ma il 40 chiude `extract-zip` e apre un altro avviso alto sul
      motore (GHSA-9f4c-93c8-jc8g, sandboxed iframe → popup) corretto solo dalla
      41.10.3: la 41.10.7 chiude ENTRAMBI e lascia solo `xmldom` (mammoth, moderato).
      Provato nell'app viva via CDP (Chrome 146): vault caricato, mappa disegnata
      (43/43 nodi), 103 funzioni IPC, `htmlToPdf` ok, ELABORA/Cabina/INSEGNA aprono
      e chiudono, in console solo i quattro avvisi di sempre. DMG arm64 e x64 col
      builder 26 in `dist-e41/` (119,9 / 128,6 MB): l'app impacchettata parte e resta
      viva 12 s, `codesign --verify` OK. Da decidere il merge; poi una prova
      lunga a mano (generazione vera, stampa, QR) prima di darla ai tester.

### FASE 2 — Prima esecuzione da zero (giorni 2-4)
Obiettivo: l'app in un mondo che non ha mai visto MappAI. È il mondo dei tester,
e l'app non ci gira MAI durante lo sviluppo.

**Fatto in automatico (30/8, sulla build vera via CDP):**
- [x] La build impacchettata **si avvia e renderizza la landing**: 162 script
      caricati, **zero file mancanti** (Network.loadingFailed = 0), console pulita
      (3 warning innocui: CDN Tailwind, voci Bento non montate, DevSelfTest senza
      mappa). Schermo di sblocco presente nel DOM.
- [x] La finestra **Knowledge Garden Studio si apre e carica** (studio.html
      completo dalla build).
- [x] **Verdetto Gatekeeper misurato**: `spctl -a` → **rejected**. La firma è
      «Apple Development: giacomomeschini@gmail.com» — vale solo sui Mac di
      sviluppo, per i tester è come non firmata. La decisione (Developer ID +
      notarizzazione vs istruzione xattr/clic-destro-Apri) resta da prendere.
- [x] ⚠️ Scoperto in corsa: **`--enable-logging` sulla build impacchettata non
      stampa nulla e l'errore fatale del main process appare solo come NSAlert
      muto**. Per diagnosticare un crash di avvio del pacchetto:
      `npx electron dist/mac-arm64/MappAI.app/Contents/Resources/app.asar` —
      lì stderr parla. (Trucco da ricordare per l'assistenza remota.)
- [x] ⚠️ **Tailwind è via CDN a runtime**: senza rete la veste grafica degrada.
      Da scrivere nella mail ai tester: serve la connessione (comunque necessaria
      per l'AI).

**Restano gesti di Giacomo (macchine/utenti che l'agente non ha):**
- [ ] **Utente macOS pulito** sul Mac di sviluppo (Sistema → Utenti): installare
      il .dmg lì. Niente localStorage, niente vault, niente chiave API.
      (Il tentativo con `HOME` finto non vale: macOS ignora `$HOME` per
      Application Support — serve l'utente vero.)
- [ ] Percorso completo: primo avvio → schermo di sblocco (machine-id,
      `main.js:3540`) → onboarding lingua → CREA senza chiave API (l'errore è
      parlante?) → inserimento chiave → prima generazione → primo vault.
- [ ] **Senza rete**: l'app si apre? I messaggi dicono la verità? (vedi nota
      Tailwind CDN qui sopra)
- [ ] **Gatekeeper (macOS)**: decidere la strada e SCRIVERLA nella mail ai tester:
      1. Apple Developer ID + notarizzazione (pulita, costa l'iscrizione Apple), o
      2. istruzione `xattr -cr /Applications/MappAI.app` / clic destro → Apri
         (gratis, ma è un passo in più che i tester possono sbagliare).
- [ ] **SmartScreen (Windows)**: NSIS non firmato → avviso blu. Stessa scelta:
      firmare o istruire. Provare l'installer sul PC Windows di Giacomo,
      percorso completo come sopra. ⚠️ Su Windows i percorsi cambiano
      (`%APPDATA%` vs `~/Library`): i punti che toccano il filesystem
      (vault, registro errori, cache TTS, `visione-tmp`) vanno guardati lì.

**Rilievi minori dall'audit (non bloccanti, da triage in Fase 3):**
- `public/vault_demo/` non esiste (né nel repo root né nel pacchetto): il seeding
  del vault demo in `initDefaultVaultFolder` (main.js:143) è codice morto
  silenzioso — nessun demo arriva al tester. O si aggiunge la cartella, o si
  toglie il codice + `vault_demo_manifest.json`.
- `.gemini_status.json` viene scritto in `__dirname` (main.js:348): dentro l'asar
  è read-only → write fallisce sempre in silenzio. Solo debug, ma se serve va
  spostato in `userData`.
- La feature NPC-LLM on-device è **morta nella build distribuita** (node-llama-cpp
  non più impacchettato — scelta deliberata di Fase 1, −51 MB; il Dungeon non ha
  ingressi UI dal 24/8).

### FASE 3 — Gli undici difetti censiti (giorni 4-6)
La lista **a-k** con `file:riga` sta in [`PIANO-guida-docenti.md`](PIANO-guida-docenti.md)
§«I difetti VERI dell'app» (uno, lo schermo di sblocco, è già corretto: `88c686c`).

- [ ] Triage in tre ceste: **bloccante** (crasha o inganna il tester) ·
      **da avvisare** (si documenta nella mail ai tester) · **rinviabile**.
- [ ] Fix dei soli bloccanti, un commit per difetto, prova in Electron per ognuno.

### FASE 4 — La rete di sicurezza (giorni 6-7)
Quando l'app sbaglia a casa di un tester, deve raccontarlo lei.

- [ ] Registro errori (`mappai_error_log`, acceso di default) **nell'app
      impacchettata**: il file finisce nel posto giusto anche da asar? E su Windows?
- [ ] `MappAIErrori.diagnosi()` + il protocollo di
      [`ASSISTENZA-REMOTA.md`](ASSISTENZA-REMOTA.md) provati sulla build, non sul repo.
- [ ] Gli allarmi di saturazione del cassetto (localStorage pieno) scattano?
- [ ] La pagina/percorso «Segnalazione» dice al tester COME mandarti il registro.

### FASE 5 — Campagna fumo sul pacchetto (giorni 7-9)
Le campagne CDP esistono già (`tools/guida-docenti/`, `tools/demo-video/`) ma
girano su `npx electron .`. La build impacchettata si avvia con
`open dist/mac-arm64/MappAI.app --args --remote-debugging-port=9222` (oppure
lanciando il binario diretto con l'argomento) e si pilota uguale.

- [ ] Generazione mappa da PDF (la 4R di prova) · dossier da foto · quiz via QR
      con telefono · proiezione · stampa/PDF dei materiali · ELABORA → editor.
- [ ] ⚠️ **userData**: l'app impacchettata usa `~/Library/Application Support/MappAI`
      (productName), NON `mappai/dev` della modalità sviluppo — quindi niente
      override congelati dei prompt (trappola nota: il `dev/prompts_config.json`
      di Giacomo congela 50 template, ma solo in sviluppo). È un bene: la build
      è pulita per costruzione. Non «ripulire» il dev per sbaglio.

### Giorno 10 — margine, e la mail ai tester
Con dentro: requisiti, il passo Gatekeeper/SmartScreen scelto in Fase 2, dove
si mette la chiave API, come si manda una segnalazione.

---

## 3. Che cosa NON si tocca in questa fase

- **Il licensing** (machine-id, schermo di sblocco): funziona, ed è ciò che
  regola l'accesso dei tester. Solo prova, niente ritocchi.
- **`ios/`** e i branch Capacitor.
- **Le superfici dietro kill-switch** (HANDOFF §2): sono il paracadute
  dell'assistenza remota proprio durante il beta — restano.
- **Refactoring di qualunque tipo**: in dieci giorni si stabilizza, non si
  migliora. Ogni fix è il più piccolo che chiude il difetto.

## 4. Dove stanno i fatti

| Serve | Documento |
|---|---|
| Stato di `main`, interruttori | [`HANDOFF.md`](HANDOFF.md) §2 |
| Difetti a-k con file:riga | [`PIANO-guida-docenti.md`](PIANO-guida-docenti.md) |
| Protocollo assistenza + diagnosi | [`ASSISTENZA-REMOTA.md`](ASSISTENZA-REMOTA.md) |
| Come pilotare l'app via CDP | memoria `electron-debug-remoto` + `tools/guida-docenti/LEGGIMI.md` |
| Config build attuale | `package.json` → blocco `build` (asar on, unpack per llama) |

## 5. La prima mossa della chat nuova

Leggere questo documento dall'alto, poi **Fase 1**: chiedere a Giacomo di
spostare `power _keys.rtf`, scrivere la whitelist `files`, `npm run pack`,
ispezionare l'asar, annotare il peso. Solo a pacchetto pulito si passa alla
Fase 2.
