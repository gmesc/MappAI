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

- [ ] `power _keys.rtf` fuori dal progetto (Giacomo).
- [ ] Whitelist `files` in `package.json → build`. Prima bozza ragionata:
      `main.js`, `garden-server.js`, `preload` (sta in `public/js/`), `public/**`
      (⚠️ contiene anche `public/dev/` — valutare se escluderlo), `prompts_config.json`,
      i `node_modules` di produzione (li gestisce electron-builder da solo).
      **Esclusi espliciti**: `ios/`, `PITCH/`, `tools/`, `docs/`, `tests/`, `specs/`,
      `graphify-out/`, `Inkscape/`, `game graphic cassets/`, `implementation_plans/`,
      `relay/`, `scripts/`, `*.bak*`, `.claude/`, `.specify/`.
- [ ] Versione vera al posto di `1.0.0` (proposta: `1.0.0-beta.1` — i tester la
      leggeranno nelle segnalazioni).
- [ ] `npm run pack` (build senza installer) e **ispezione dell'asar**:
      `npx asar list dist/mac-arm64/MappAI.app/Contents/Resources/app.asar | head -100`
      — dentro non deve comparire nulla della lista esclusi.
- [ ] Peso finale annotato qui: ______ MB (atteso: decine, non centinaia).

### FASE 2 — Prima esecuzione da zero (giorni 2-4)
Obiettivo: l'app in un mondo che non ha mai visto MappAI. È il mondo dei tester,
e l'app non ci gira MAI durante lo sviluppo.

- [ ] **Utente macOS pulito** sul Mac di sviluppo (Sistema → Utenti): installare
      il .dmg lì. Niente localStorage, niente vault, niente chiave API.
- [ ] Percorso completo: primo avvio → schermo di sblocco (machine-id,
      `main.js:3540`) → onboarding lingua → CREA senza chiave API (l'errore è
      parlante?) → inserimento chiave → prima generazione → primo vault.
- [ ] **Senza rete**: l'app si apre? I messaggi dicono la verità?
- [ ] **Gatekeeper (macOS)**: il .dmg NON è firmato/notarizzato. Su un Mac
      vergine arm64 l'app verrà **bloccata** («danneggiata» o «sviluppatore non
      verificato»). Decidere la strada e SCRIVERLA nella mail ai tester:
      1. Apple Developer ID + notarizzazione (pulita, costa l'iscrizione Apple), o
      2. istruzione `xattr -cr /Applications/MappAI.app` / clic destro → Apri
         (gratis, ma è un passo in più che i tester possono sbagliare).
- [ ] **SmartScreen (Windows)**: NSIS non firmato → avviso blu. Stessa scelta:
      firmare o istruire. Provare l'installer sul PC Windows di Giacomo,
      percorso completo come sopra. ⚠️ Su Windows i percorsi cambiano
      (`%APPDATA%` vs `~/Library`): i punti che toccano il filesystem
      (vault, registro errori, cache TTS, `visione-tmp`) vanno guardati lì.

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
