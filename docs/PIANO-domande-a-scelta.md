# Piano — «Domande a scelta» (Live + Studio attivo), il box «Più set per angolo» nel bento, e lo Studio attivo rifatto sui materiali del vault

> Piano da `/architetto` (19/8/26, seconda stesura).
> **Stato al 20/8/26: TUTTE E SEI LE FASI SPEDITE (A · B · C · D · E · F).**
> La **F** ha cancellato le sette modalità del canvas e il Cloze: `mappai-active-study.js`
> da **1832 a 190 righe** (resta il launcher), via `session`/`emergencyExit`/lo snapshot del
> grafo e le **nove guardie** in sei moduli, via il genere `kind:'cloze'` del player Live
> (con 20 test) e 52 chiavi i18n orfane. **−2315 righe** in tutto.
> ⚠️ Il punto 16 (Palazzo nel guscio comune) **non è stato fatto**: rifà la UI di una
> superficie che funziona e ha un core già puro e testato. Il Palazzo resta col suo modale.
>
> (Prima: fasi A · B · C · D · E SPEDITE, restava la FASE F.)
> La D (Live: `mode:'scelta'` nel server, `/api/stato`, `public/live/scelta.html`,
> `buildSceltaReportHtml`, `mappai-scelta.js`, card nel hub) e la E (il guscio in-app e le
> due attività nel launcher) sono passate da una revisione avversaria a sei agenti: **21
> difetti corretti**, fra cui tre che sarebbero costati dati — la consegna annullata a ogni
> tasto premuto nel «perché no?», la soluzione della domanda evitata mandata al telefono, e
> una ripresa senza `questions.json` che **cancellava le risposte già su disco**. Il difetto
> più insidioso non l'ha trovato nessun test: il passo ① delle AREE era irraggiungibile
> perché `normalizzaStato` riempiva `fase`, e quel valore di ripiego rendeva morto il ramo
> che lo sceglie.
> Banchi: `public/dev/scelta-harness.html` (superficie) e `public/dev/scelta-inapp-harness.html`
> (guscio in-app, NUOVO) · banco Node `tools/smoke/scelta-materiali.js`.
>
> (Stato precedente al 19/8/26 sera: fasi A · B · C SPEDITE.) Commit: `256648f` `9b0ff4f` `416a003`
> (A, il bento e la generazione per angolo) · `5f09145` (B, il core) · `9707bd0` + `322d65f`
> (C, la superficie, poi rifatta a **tre passi**). **Si riprende dalla FASE D**, riscritta
> qui sotto con quello che le fasi B/C hanno cambiato sotto di lei.
> ⚠️ Leggere prima [`PIANO-scelta-a-tre-passi.md`](PIANO-scelta-a-tre-passi.md): la forma
> dell'attività non è più quella descritta nel §2 di questo documento. Guida letta per intera; stato da `docs/HANDOFF.md` §0-§4; codice dell'area letto
> (`mappai-active-study.js`, `mappai-live-*.js`, `live-server.js`, `public/live/student.html`,
> `mappai-quiz-print.js`, `mappai-material-pipeline.js`, `mappai-pipeline-core.js`,
> `mappai-bento-composizione.js`, `mappai-crea-quiz.js`, `mappai-cloze.js`).

**Braindump tradotto**
1. **Bento di CREA**: un box **nascondibile** (vista estesa, fondo scuro) nuovo, **span 4**, nella
   riga SOTTO `Preset · Quiz · Fogli nodi · Fonte & Sintesi`, con una spunta «genera più set,
   uno per angolo» e due spunte figlie «Domande aperte» / «Scelta multipla» che dicono a quali
   generi si applica. La pipeline «Genera materiali» produce quindi **un foglio/set per ogni
   angolo** invece di uno solo con l'angolo della tendina.
2. **«Domande a scelta»**: attività in cui lo studente riceve TUTTE le domande aperte di una
   mappa (i fogli per angolo fusi in un pool), **angolo nascosto**, **gruppi per macro-area**, e
   sceglie a quali rispondere; scrive, chip «perché questa?», Osservazioni, consegna. Default:
   reveal del profilo per angolo · per ramo · la stessa superficie **in-app** come modalità di
   Studio attivo. Attivabili dal docente: «perché no?» · autovalutazione a 3 livelli · secondo
   giro. Nasce come attività **Live** (QR, classe, report).
3. **Studio attivo rifatto**: via **tutte** le sette modalità storiche e il Cloze
   (pensione definitiva, codice tolto). Resta **solo il Palazzo della Memoria**, adattato alla
   superficie nuova. Al loro posto le attività che consumano i **materiali già nel vault**:
   **Domande a scelta** (i fogli «Domande aperte») e **Quiz a scelta** (i set MC per angolo che
   la Fase A produce) — stessa view, stesso esito, stesso registro.

**Stato rilevante** (misurato nel codice)
- Il bento è un DATO (`mappai-bento-composizione.js`): i box della vista estesa sono quelli col
  fondo scuro (`nascondibile()` legge lo stile, non un flag); la riga nascosta oggi è
  `preset(1)·quiz(1)·ns(1)·src(1)`, poi `modalita(1)·focus(3)`, poi `macroaree(4)`…; ogni
  voce porta l'**id vero** che `MappAIPipeline._readConfig()` legge (inv. 6); `valida()`
  controlla che ogni riga chiuda 4 colonne; test in `tests/bento-composizione.test.js`.
- La pipeline ha **un solo angolo** (`config.quiz.angle`, `material-pipeline.js:474/1319`);
  l'angolo per MC e per aperte è già assoluto nel prompt (`quizAngleBlock`,
  `openQuestionsAngleBlock`, stessa `QUIZ_ANGLES`). Le **varianti per angolo** esistono SOLO nel
  percorso manuale «Crea un documento» (`_generaVarianti`, `mappai-crea-quiz.js:282`), con
  nome-file = chiave dell'angolo (`Domande-aperte-<Mappa>-causa`, `auto`→`misto`).
  `estimateCalls` conta `rami × generi` (`pipeline-core.js:276`); i preset portano `quiz.angle`
  (`presetFromConfig/presetNormalize`).
- Le domande aperte sono **documenti** (`_QT.open.documento`): HTML con `qp-set` incorporato,
  item `{domanda, livello}`; l'embed **non porta l'angolo** (solo nel nome file) e gli item
  **non sanno il ramo** (`material-pipeline.js:509` accoda `raw` per ramo).
- Live: `kind:'open'` c'è (`live-core.js:289`, `cleanAnswer` tiene solo `text`), textarea +
  Consegna (`student.html:502-571`), `/api/answer` sovrascrivibile, `/api/finish` con reveal
  (`live-server.js:458`); `publicQuestions` è una **whitelist** (`idx, kind, text, topic`):
  l'angolo non esce per costruzione, `topic` = `l1Label` è già il posto della macro-area.
  Pagine Live dedicate: pattern `timeline-build.html` + `MappAILive.launchExternal` + `mode`
  pass-through in `main.js:2338`; il redirect `/` va sempre a `student.html`, la pagina sta
  nell'URL del QR.
- Studio attivo: `MODES` 1-7 (Costruisci mappa · Ricostruisci le gerarchie · Richiamo · Riempi
  le descrizioni · Trova l'intruso · Verbi · Ordina la sequenza) + Cloze (nascosto,
  `mappai_cloze_enabled`) + Palazzo; launcher `mappai-active-study.js:1582` (1809 righe in
  tutto); risultati via `MappAIStudyBus`. **Tutte e sette lavorano sul CANVAS**: smontano il
  grafo, tengono uno `snapshot`, e da lì viene la macchina di sicurezza (`emergencyExit`,
  `session.active`) chiamata da sei moduli — `ui-canvas` (×2 + `handleNodeClick`), `vault-io`,
  `vault-manager`, `storage-lang` (×2), `mastery-view`, `effort-view`.
  **Palazzo** (`mappai-palace.js`, 229 righe) invece è già **modale**: non tocca il canvas, ha un
  core puro (`buildRooms`/`isMatch`) e scrive sullo StudyBus; la sua UI è un modale suo con
  `z-index: 10000` scritto a mano (inv. 11).
  **Cloze**: `mappai-cloze.js` + script in `index.html:3409` + `tests/cloze.test.js`,
  `tests/cloze-live-parity.test.js` + una riga in `mappai-dev-selftest.js` + un commento in
  `live-teacher.js`; il `kind:'cloze'` del player Live è un'altra cosa (vedi Fase F 16-bis).
- **I materiali stanno nel vault e si rileggono**: i fogli «Domande aperte» sono file in
  `Materiale Studio/` (HTML con `qp-set` incorporato, `setFromHtml` li riapre) e i set di quiz
  sono `set-*.json` scritti e riletti col vault (`FilesCore.setsDelVault`, `main.js:1577/1817`)
  → in memoria stanno in `appState.db.studySets`. Le attività nuove non generano niente: leggono.
- Relay web parcheggiato (memoria): conosce i `mode` per il 302 → non-obiettivo.
- HANDOFF §4 debito 7: «Studio attivo» senza destinazione: qui si aggiunge una card al launcher
  che c'è, non si decide la sua casa.

## Che cosa si fa

**Fase A — il box «Più set per angolo» nel bento, e la pipeline che lo onora**
1. `public/js/mappai-bento-composizione.js`: tre VOCI nuove, id veri della pipeline:
   `mp-multi-on` (spunta, `chiave: 'quiz.multi'`, `master: true`, NON derivata: è la scelta
   esplicita), `mp-multi-open` e `mp-multi-mc` (spunte, `figlioDi: 'mp-multi-on'`, default
   **accese**), ognuna con `aiuto` e `seFuori`. Un MODULO nuovo `{ id: 'multi', titolo: 'Più set
   per angolo', icona: 'layers', span: 4, altezza: 130, voci: [...] }` inserito **dopo `src` e
   prima di `modalita`**: fondo scuro → nascondibile; span 4 → la riga chiude da sola; resta DOPO
   il mega-bento (il test «extra dopo il mega-bento» tiene). Aiuto della spunta madre: «un
   foglio/set per ognuno dei sette angoli, invece di uno solo; la tendina Angolo non conta».
   Test in `tests/bento-composizione.test.js`: il modulo esiste, sta in una riga sua da 4,
   le tre voci sono nel dato, `valida()` su `MODULI` = 0 errori.
2. `public/js/mappai-material-pipeline.js` `_readConfig` (~1319): `cfg.quiz.multi =
   ['open','mc'] ∩ spuntate` quando `mp-multi-on` è spuntata (array vuoto = spenta); guardia su
   `g(id) == null` (il modale storico, veste spenta, non ha i campi: lì la feature non c'è —
   inv. 1, la strada vecchia resta com'è). `_applyPreset` (~1113) rimette le tre spunte.
   ⚠️ Con `multi` accesa la tendina `mp-angle` è **inerte** → si disabilita e l'aiuto lo dice
   (inv. 21: un comando inerte è peggio che assente).
3. `public/js/mappai-pipeline-core.js`: `presetFromConfig/presetNormalize` portano `quiz.multi`
   (whitelist `['open','mc']`); `estimateCalls` B = `rami × (generi_singoli + Σ generi_multi × 7)`;
   `MULTI_ANGOLI` = le 7 chiavi vere di `QUIZ_ANGLES` senza `auto` — nel core solo le chiavi,
   lette da `window.QUIZ_ANGLES` quando c'è (inv. 6; «misto» non entra: un foglio misto nel pool
   di «Domande a scelta» confonderebbe il profilo per angolo). Test in `tests/pipeline-core.test.js`
   (stima con/senza multi; preset round-trip; valori sporchi scartati).
4. `public/js/mappai-material-pipeline.js` step B (~470-560): per ogni genere in `quiz.multi` il
   ciclo sui rami gira **una volta per angolo**: aperte → un documento per angolo con
   `nome = chiave angolo` (stessa convenzione delle varianti manuali → `Domande-aperte-<Mappa>-causa`,
   via `_titoloDoc`/`buildFileName`, unico compositore di nomi, inv. 6); MC → un `studySet` per
   angolo (`title: <Mappa> — Scelta multipla · <Angolo>`, `angle: chiave`). Un angolo che fallisce
   **non ferma gli altri** (trappola 36): si raccoglie e si dice alla fine. Sorgente prima della
   resa come oggi (inv. 18). Lo spinner dice «Domande aperte · causa (3/7)» (trappola 40).
   Su ogni item delle aperte `it.ramo = _clean(b.label)` (il ramo dichiarato alla nascita, inv.
   20-bis) — vale anche per `generaSet` (~1679).
5. `public/js/mappai-quiz-print.js:540` (`buildOpenQuestionsHtml`): l'embed `qp-set` porta anche
   `angle: set.angle || ''`; i chiamanti passano `angle` nel set (in scope a `:523` e `:1712`).
   I fogli già generati restano senza: il pool (Fase B) ricava l'angolo dal **titolo** e senza
   ramo va in un gruppo unico.

**Fase B — il core puro di «Domande a scelta»** (inv. 4)
6. NUOVO `public/js/mappai-scelta-core.js` (UMD, `window.MappAIScelta`, `require` da Node):
   `ANGOLI` (chiavi, da `QUIZ_ANGLES` se c'è) · `poolDaFogli([{title, set}])` →
   `[{id, text, angle, ramo, livello, foglio}]` con `id` stabile (hash `foglio|idx`), `angle` =
   `set.angle || angoloDalTitolo(title)`, dedup testuale fra fogli · `mescola(pool, seed)` (LCG:
   stesso studente = stesso ordine al rientro) · `perRamo(pool)` (gruppo «—» in coda) ·
   `CHIP = ['so','curioso','chiara','altre_oscure']` · `validaConsegna(stato, cfg)` →
   `{ok, motivi}` · `profilo(pool, stato)` → per angolo `{scelte, scritte, evitate}`, chip per
   angolo, base/ponte · `evitata(pool, stato, seed)` (angolo più evitato; serve a idea 2 e 5) ·
   `calorClasse(pools, stati)` · `CFG_DEFAULT = { minimo: 3, osservazioni: true, reveal: true,
   perRamo: true, perche_no: false, autovalutazione: false, secondo_giro: false }`.
   Test NUOVO `tests/scelta-core.test.js` (angolo dal titolo · dedup · mescola deterministica ·
   perRamo con item senza ramo · consegna sotto il minimo · profilo su 3 angoli · evitata
   sull'angolo più evitato · calorClasse).

**Fase C — la superficie condivisa** (una sola, Live e in-app: inv. 6)
7. NUOVO `public/js/mappai-scelta-view.js` (browser, zero fetch dentro):
   `MappAISceltaView.monta(host, {pool, cfg, stato, t, onCambia, onConsegna})` — `pool[].tipo`
   vale `'open'` o `'mc'`: cambia SOLO il campo della risposta (textarea · bottoni-opzione con
   `aria-checked`, come il player Live), tutto il resto — scelta, chip, contatore, Osservazioni,
   consegna, esito — è identico. È la ragione per cui la view è una sola. Elenco per
   ramo (angolo mai a schermo) · tap = «la prendo» → textarea sotto, autosave via `onCambia`
   (debounce 600ms) · chip «perché questa?» + testo libero · autovalutazione SOLO se
   `cfg.autovalutazione` · contatore fisso «scelte · scritte · minimo» · Osservazioni in fondo
   se `cfg.osservazioni` · Consegna sempre visibile (conferma se `validaConsegna` non passa) ·
   `mostraEsito(host, {profilo, evitata, cfg})` = reveal (idea 1), «perché no?» (idea 2), «prova
   una che hai evitato» (idea 5: riapre la sola domanda evitata). Icone SVG in linea (la pagina
   studente non ha Lucide, inv. 15); contrasti ≥ 4,5 coi token di `student.html` (inv. 16);
   bersagli ≥ 44px sui chip.
8. NUOVO `public/live/scelta.html` (self-contained, come `timeline-build.html`): carica
   `mappai-live-core.js` + i due file nuovi (→ `STATIC_ALLOW` di `live-server.js`); login
   emoji+numero riusato (`/api/join`); `onCambia` → `/api/answer` `{qIdx, text, chip, nota,
   auto}`; `onConsegna` → `/api/finish` `{notes}` → `mostraEsito`; «perché no?» → `/api/finish`
   con `{avoided:{idx, why}}`; secondo giro → `/api/answer` (azzera `finishedAt`, già così) +
   `/api/finish`. NUOVO harness `public/dev/scelta-harness.html` (pool finto, trasporto stub).

**Fase D — Live: server, pagina studente, report, docente** ✅ **SPEDITA (20/8)**

> Che cosa è cambiato sotto, rispetto a come questa fase era stata scritta il 19/8 mattina:
> il pool si **campiona** (`unaPerAngolo`), lo stato ha **tre campi nuovi** (`aree`, `fase`,
> `letture`) e i chip sono un **giudizio di richiamo** che si dà anche a una domanda non
> presa. Il server deve quindi persistere più di «risposte».

9. **`public/js/mappai-live-core.js`** — `cleanAnswer` (riga ~414) per `kind:'open'` tiene
   anche `chip` (∈ `MappAIScelta.CHIP`), `nota` (≤ 300), `auto` (1-3). Campi **opzionali**:
   una sessione quiz storica non cambia. ⚠️ `publicQuestions` (riga ~310) resta la whitelist
   che è: non deve mai lasciar passare `angle`. Test estesi in `tests/live-core.test.js`.
10. **`live-server.js`** — il grosso della fase.
    - `mode: 'scelta'` accanto a `quiz|build` (riga ~122) + `cfg.scelta` (la config
      normalizzata da `MappAIScelta.normalizzaCfg`) in `session.json`.
    - **Il campionamento è del SERVER, e per studente**: al `join` (riga ~347) si calcola
      `unaPerAngolo(pool, <chiave identità>)` e si serve `pubblico(...)` di quello. Servire
      175 domande per mostrarne 14 vorrebbe dire mandare al telefono proprio ciò che
      l'attività ha deciso di non fare — e l'angolo uscirebbe di casa.
      ⚠️ La scelta va **persistita** (`students/<id>.json`): al rientro deve ritrovare le
      SUE domande, e il seme da solo non basta se il pool cambia (un foglio in più nel
      vault sposterebbe tutto).
    - `/api/answer` (riga ~436) accetta anche `letture` e `aree`, oppure — più semplice —
      un `/api/stato` che salva `{aree, fase, letture}`: **decidere e dichiararlo**. La
      regola è che ciò che dura più di un istante si persiste (inv. 20-bis), e qui durano
      la fase e le aree.
    - `/api/finish` (riga ~458) calcola `profilo` + `evitata` sul pool campionato di
      QUELLO studente e li ritorna **solo se `cfg.reveal`** — l'angolo non viaggia prima
      della consegna, come le soluzioni.
    - `/api/close` (riga ~495) scrive il report.
    - `STATIC_ALLOW` (riga 41) deve includere `mappai-scelta-core.js` e
      `mappai-scelta-view.js` (oggi passa solo `mappai-live-core.js`).
    - Test in `tests/live-server.test.js` col server VERO (pattern esistente): join →
      pool campionato e senza angoli → salvataggio di aree/fase/letture → finish con e
      senza reveal → close → report.
11. **`public/live/scelta.html`** — self-contained, sul modello di `public/live/timeline-build.html`:
    login emoji+numero (lo stesso markup e la stessa `/api/join` di `student.html`),
    poi `MappAISceltaView.monta` con `onCambia`/`onConsegna` che parlano al server, e
    `mostraEsito` sulla risposta di `/api/finish`. Carica `mappai-live-core.js` +
    i due moduli nuovi. Il redirect `/` del server va a `student.html`: la pagina giusta
    sta nell'**URL del QR** (`buildStudentUrl` in `mappai-timeline-teacher.js` è il modello).
12. **`public/js/mappai-live-reports.js`** — `buildSceltaReportHtml(results)`:
    per allievo le risposte col loro **angolo** e il **chip di richiamo**, le **aree
    dichiarate**, le Osservazioni; per la classe il **calore degli angoli** (`calorClasse`)
    e quello delle **aree** (`calorAree`) — «nessuno si sente sicuro sugli Oceani» è una
    domanda per il docente, non un voto agli allievi. Stili dei report esistenti.
13. **`main.js`** (riga ~2338) — pass-through di `scelta` accanto a `build`: una riga, l'IPC
    resta sottile (inv. 19).
14. **`public/js/mappai-scelta.js`** (NUOVO, docente + in-app in un file solo):
    `leggiFogli(mappa)` raccoglie i fogli «Domande aperte» e i set MC dal **disco**
    (`vaultMaterialsList` + `readVaultFile` su `Domande-aperte-*.html`; `setsDelVault` per i
    `set-*.json`) e dall'archivio (`MappAIStudyDocs`), dedup per titolo, e dice quanti da
    dove (inv. 7, trappola 17). `apriLive()`: modale con «N domande da K fogli», le quattro
    spunte del docente + `minimo`/`minimoAree`, classe dal contesto attivo, poi
    `MappAILive.launchExternal(cls, 'Domande a scelta', questions, 0, {mode:'scelta',
    scelta: cfg, logActivity:'scelta'})` (`mappai-live-teacher.js` riga ~536) e QR alla
    pagina nuova. Card nel hub Live (riga ~79) + avvio in INSEGNA › Attività LIVE.
    Senza fogli → avviso con la strada (CREA col box «Più set per angolo»).
**Fase E — lo Studio attivo rifatto** ✅ **SPEDITA (20/8), tranne il punto 16**
⚠️ Il **Palazzo della Memoria non è stato portato nel guscio** (punto 16): è un rifacimento
della UI di una superficie che funziona, e il suo guadagno arriva solo con la fase F, quando
il launcher si riduce a tre card. Le sette modalità storiche sono ancora tutte lì.
14. `public/js/mappai-scelta.js` (lo stesso file della Fase D) — `apriInApp(tipo)`, il **guscio
    in-app** condiviso dalle attività nuove: `MappAIModal.open` taglia XL con `tela` dove si monta `MappAISceltaView`
    (inv. 10-11: piano dal motore, `chiude:false`, ESC chiede conferma se ci sono risposte);
    pieghevole «Opzioni» con le quattro leve (stessi nomi e ordine del modale docente, inv. 21);
    bozza in `localStorage mappai_scelta_bozza_<idProgetto>_<attività>`; alla consegna
    `MappAIStudyBus.begin(att)` · `record` per risposta · `end()` con `notes`.
    **Padronanza**: per `mc` si scrive sempre (la risposta è corretta dal dato); per `open` solo
    con l'autovalutazione accesa (score 1/0.5/0) — senza correzione non c'è misura, ma la
    sessione va comunque in `sessioni.jsonl`.
15. **Le due attività dai materiali** (nessuna generazione: leggono ciò che c'è, inv. 7):
    - **Domande a scelta** — pool da `leggiFogli(mappa)` (Fase D, esportata: una lettura sola,
      inv. 6) → `tipo:'open'`.
    - **Quiz a scelta** — pool dai **set MC del vault**: `FilesCore.setsDelVault(appState.db.
      studySets, rootNodeLabel)` filtrati a `mode:'quiz'`, angolo dal campo `angle` del set (che
      la Fase A scrive) o dal titolo; ogni item porta le sue opzioni → `tipo:'mc'`.
      Con la Fase A accesa i sette set per angolo ci sono già; con un set solo l'attività parte
      lo stesso (un angolo, il profilo lo dice).
    Se i materiali non ci sono, la card è **disabilitata col motivo** e la strada («CREA, box
    “Più set per angolo”», oppure «ELABORA › Crea un documento») — mai una card che apre il vuoto.
16. **Palazzo della Memoria adattato** (`public/js/mappai-palace.js`): il core resta
    (`buildRooms`, `isMatch`, i test), la **UI passa al guscio**: via `shellOpen` e il suo
    `z-index: 10000` scritto a mano (inv. 11), via il modale proprio; le stanze si montano nella
    stessa tela, con la stessa intestazione, lo stesso contatore, la stessa Consegna e lo stesso
    schermo di esito (per stanza invece che per angolo). Guadagna due cose dai materiali del
    vault: il testo di **encoding** di una stanza usa la **sintesi del ramo** se esiste in
    `Materiale Studio/` (altrimenti le `desc` dei nodi, come oggi), e le stanze si possono
    limitare ai rami che hanno materiali. Resta deterministico, zero AI.
17. `public/js/mappai-active-study.js` diventa **il launcher e basta** (~1400 righe via con la
    Fase F): tre card — **Domande a scelta · Quiz a scelta · Palazzo della Memoria** — più le due
    viste (Heat map · Mappa lavoro) e i due strumenti (Cosa studiare ora · Progressi), che
    restano: non sono modalità, sono letture dei dati che le attività scrivono.
18. `public/index.html`: `<script>` dei file nuovi dopo `mappai-active-study.js`, `?v=` bumpato
    DOPO l'ultima scrittura (inv. 5). Kill-switch `mappai_domande_scelta` (acceso; `'0'` → niente
    card nuove in hub Live, INSEGNA e launcher — il launcher resta col solo Palazzo).
    i18n: `_tSafe` nei moduli condivisi/UMD, `window.t` altrove, chiavi `ds_*` solo in
    `en_translations.js` (inv. 14).

**Fase F — pensione DEFINITIVA delle sette modalità e del Cloze** ✅ **SPEDITA (20/8)**
19. **Cloze in-app**: via `public/js/mappai-cloze.js`, lo `<script>` (`index.html:3409`), la card
    e il ramo `key === 'cloze'` nel launcher, il flag `mappai_cloze_enabled`, `tests/cloze.test.js`
    e `tests/cloze-live-parity.test.js`, la riga in `mappai-dev-selftest.js`, il commento in
    `live-teacher.js`.
20. **`kind:'cloze'` del player Live** — che cos'è: ogni domanda di una sessione Live ha un
    `kind` (`tf` · `mc` · `cloze` · `open`); `cloze` era la domanda a buchi servita al telefono,
    con la sua resa in `student.html` (30 righe), il suo grading in `live-core.js` (23) e due
    righe nei report. Dal taglio del wizard Live **nessuno la produce più** (misurato: 0
    occorrenze nei moduli docente e in `main.js`): è raggiungibile solo da una `session.json`
    scritta prima di quella potatura. Si pensiona **col Cloze**, stesso gesto: via i rami `cloze`
    in `live-core.js` (`validateQuestion`, `publicQuestions`, `cleanAnswer`, `gradeAnswer`,
    `answerText`), in `student.html`, in `live-reports.js`, e i 35 test che li coprono.
    ⚠️ Una `session.json` vecchia con domande cloze non si riapre più: `validateQuestion` la
    rifiuta con `bad-kind`, e lo dice.
21. **Le sette modalità del canvas** (1 · 2 · 3 · 4 · 5 · 6 · 7): via `MODES` e tutta la
    macchina che le serviva in `mappai-active-study.js` — `startSession`/`verify`/
    `finishSession`, lo `snapshot` del grafo e la patch di `renderGraph`, `HIERARCHICAL_MODES`,
    `SCOPABLE_MODES`, `_link1`/`_revealed`/`_wrong`/`_displaced`/`_seqBranch`, il confronto AI
    della 4, la scelta «Consigliato», il selettore di scope — e i pezzi di
    `mappai-active-study-core.js` che esistono solo per loro (sfumatura colori della 2, intrusi
    adattivi della 5) coi rispettivi test. Restano nel file il **launcher**, `buildModal` e la
    numerazione delle card.
22. **La macchina di sicurezza sparisce con loro, ed è neutra**: `emergencyExit` e
    `session.active` servivano perché una modalità smontava il grafo (guasto del 10/7: la
    gerarchia persa per sempre). Le attività nuove sono **modali**: non toccano il canvas, quindi
    non c'è niente da salvare o ripristinare. Via le chiamate in `ui-canvas` (×2 +
    `handleNodeClick`), `vault-io`, `vault-manager`, `storage-lang` (×2), `mastery-view`,
    `effort-view`. ⚠️ Trappola 32: ognuna di quelle guardie è un `if (…active) …` che con
    `active` sempre falso non scriveva più niente — si verifica ramo per ramo prima di
    cancellare, e si dichiara. Trappola 31: elenco delle funzioni del file prima e dopo
    (`git show HEAD:file | grep -oE "function [a-zA-Z_]+"`), perché qui si toglie il 75% di un
    file da 1809 righe.
23. **Chiavi e dati**: via le `as_m1_*…as_m7_*` e le `as_cloze_*` dai due dizionari (inv. 14).
    I record già in `sessioni.jsonl` e nello store di padronanza citano `mode: 1..7` e `cloze`:
    **restano leggibili**, Celeration e Heat map continuano a mostrarli — nessuna migrazione, un
    record di un'attività pensionata è storia, non un errore.

## Dove vive la logica nuova

- **Bento + pipeline** (Fase A): la scelta multi-angolo è un DATO della composizione con gli id
  che `_readConfig` legge (inv. 6); il ciclo per angolo sta nello step B accanto al ciclo per
  genere, non in un modulo nuovo; i nomi escono da `buildFileName` con la convenzione delle
  varianti manuali (un solo compositore, inv. 6); la stima sta in `pipeline-core` (inv. 4).
- **`mappai-scelta-core.js`**: pool, angolo dal titolo, mescola, gruppi, validazione, profilo,
  evitata, calore, `CFG_DEFAULT`. Lo caricano server (`require`), pagina studente, app: una
  regola in un posto (inv. 4, 6).
- **`mappai-scelta-view.js`**: DOM condiviso; la superficie È la stessa per scelta di prodotto,
  due copie divergerebbero (inv. 6); trasporto iniettato.
- **`live-server.js` / `live-core.js`**: ramo `scelta` accanto a `build`, campi opzionali, le
  sessioni storiche non cambiano (inv. 1); l'angolo resta sul server fino alla consegna.
- **`mappai-scelta.js`**: la lettura dei materiali (una sola), l'avvio Live e il guscio in-app
  (motore dei modali, StudyBus, bozza). Niente dominio: le regole stanno nel core, i materiali
  sul disco.
- **`mappai-palace.js`**: il core (`buildRooms`, `isMatch`) resta dov'è ed è già puro e testato
  (inv. 4); cambia solo il suo strato di UI, che passa al guscio comune — un `z-index` scritto a
  mano in un modulo è esattamente ciò che l'inv. 11 vieta.
- **`main.js`**: pass-through (inv. 19). Nessuna chiamata AI nuova in tutta la feature: le
  generazioni in più della Fase A passano dai generatori esistenti su entrambi i provider (inv. 9
  non cambia).

## Prove

```bash
node --test tests/bento-composizione.test.js   # +modulo «multi» in riga da 4, 0 errori di valida()
node --test tests/pipeline-core.test.js        # +stima con multi, preset round-trip
node --test tests/scelta-core.test.js          # nuovo
node --test tests/live-core.test.js            # +chip/nota/auto, publicQuestions senza angle
node --test tests/live-server.test.js          # +mode scelta: answer · finish/reveal · avoided · secondo giro · close→report
node --test tests/palace.test.js               # il core del Palazzo regge la potatura della UI
node --test tests/active-study-core.test.js    # ridotto a ciò che resta (il launcher)
node --test tests/                             # 0 fail
node tools/smoke/pipeline-lucchetto.js         # il lucchetto regge con 7 giri per angolo
node tools/officina/build.js && node tools/atlante-ui/build.js   # la composizione è cambiata
```
- Harness `public/dev/scelta-harness.html`: pool di 12 domande su 3 rami e 4 angoli → angolo
  assente dal DOM (il `textContent` della pagina non contiene le chiavi), chip ≥ 44px, contrasti,
  consegna bloccata sotto il minimo, reveal a 4 angoli, secondo giro che riapre UNA domanda.
- Live: `tests/live-server.test.js` col server VERO (pattern esistente): join → answer con chip →
  finish (profilo solo con reveal) → avoided → close → report con calore di classe.
- `node --check` e `file <percorso>` sui file nuovi prima del commit.

## Verifica a mano (Electron, Giacomo)

1. CREA, vista estesa (combo): sotto `Preset · Quiz · Fogli nodi · Fonte & Sintesi` c'è il box
   **«Più set per angolo»** a tutta riga; spunta madre + «Domande aperte» e «Scelta multipla»;
   la stima sale (es. «~45 (A 8 · B 35 …)»); la tendina Angolo si spegne; il preset salvato e
   riapplicato le rimette.
2. Genera → nel vault `Domande-aperte-<Mappa>-definizione.pdf … -applicazione.pdf` (7) e, se
   spuntata, 7 set MC nella sidebar col loro angolo nel titolo; un angolo che fallisce non ferma
   gli altri e viene detto alla fine.
3. Hub Live → **Domande a scelta** → «N domande da K fogli · angoli: …» con provenienza.
4. Avvia con la classe → QR dal telefono → elenco per macro-area, **nessun angolo visibile**,
   tap → textarea, chip, contatore; chiudi e riapri: ordine e risposte ritrovati.
5. Consegna sotto il minimo → fermata con motivo; sopra → reveal; con «perché no?» → una
   domanda evitata e la riga; con «secondo giro» → si riapre SOLO quella.
6. Chiudi → report (testi + angolo + chip, Osservazioni, calore di classe);
   `Attività di studio/<classe>/<…Domande a scelta…>/students/*.json` senza token a schermo.
7. Studio attivo → tre card: **Domande a scelta · Quiz a scelta · Palazzo**. La prima e la
   seconda partono dai materiali del vault (senza materiali: card disabilitata col motivo e la
   strada); consegna → riga in `sessioni.jsonl` con `userText` e `notes`; con autovalutazione
   accesa la Heat map si muove, spenta no; il Quiz a scelta la muove sempre.
8. `localStorage.mappai_domande_scelta='0'` → in hub Live e INSEGNA la card sparisce, e nel launcher restano solo Palazzo, viste e strumenti.
9. **Palazzo**: parte dalla stessa tela (non più da un modale suo), stanza per stanza, con
   l'esito in fondo; se il ramo ha la sua Sintesi in «Materiale Studio» l'encoding la usa.
   Nessun modale del Palazzo finisce sotto un altro (era `z-index` scritto a mano).
10. **La mappa non si smonta più**: apri una mappa, avvia un'attività, chiudila, cambia progetto,
    torna — la gerarchia è intatta e nessun `emergencyExit` viene invocato (non esiste più).
    Celeration e Heat map mostrano ancora le sessioni vecchie delle modalità pensionate.
11. Un foglio VECCHIO (senza ramo/angolo nell'embed) entra nel pool: angolo dal nome, gruppo «—».

## Non-obiettivi

- Correzione AI delle risposte aperte; timer.
- **«Quiz a scelta» via QR**: in Live parte solo «Domande a scelta» (`mode:'scelta'`, `open`).
  La versione MC a distanza è la stessa view e lo stesso mode con `tipo:'mc'`, ma vuole il
  trasporto delle opzioni e un giro di prova in classe: seguito dichiarato, non questo lavoro.
- Riscrivere le due viste (Heat map · Mappa lavoro) e i due strumenti (Cosa studiare ora ·
  Progressi): restano come sono.
- Il box «Più set per angolo» nel **modale storico** «Genera materiali» (veste spenta): la
  strada vecchia resta com'è.
- Il relay web (`mode` nel 302): parcheggiato col relay.
- Unificare il player quiz configurato (`mappai-study-session.js`, il quiz «classico» con
  punteggio) con quello Live: resta dov'è e come sta — «Quiz a scelta» è un'altra cosa (si
  sceglie a quali domande rispondere, non si risponde a tutte).
- La casa di «Studio attivo» (HANDOFF §4 debito 7): il launcher resta dov'è.
- Toccare i prompt delle domande (angoli, graduazione).
- Possibile seguito: «Domande a scelta» stampabile con le scelte dello studente, per chi lavora
  su carta.

## Decisioni prese (e revocabili)

- **Il box è solo nella vista estesa** (fondo scuro): è un'impostazione, come chiesto
  («impostazioni nascoste»); il default è **spento** → chi non apre la vista estesa genera come
  oggi (nessun default cambia: inv. 17 non scatta).
- **Sette angoli, senza «misto»**: un foglio misto nel pool confonderebbe il profilo per angolo.
- **Le due spunte figlie partono accese**; si applicano solo ai generi davvero spuntati nel box
  Quiz (`multi ∩ types`); la tendina Angolo si spegne con la madre accesa (inv. 21).
- **Nome della variante = chiave dell'angolo** (convenzione già di Giacomo, HANDOFF 16/8).
- **Minimo risposte default 3**; default reveal · per ramo · osservazioni ON; perché-no ·
  autovalutazione · secondo giro OFF; stessi nomi e ordine in Live e in-app.
- **L'angolo non lascia il server prima della consegna**; in-app lo calcola il core dopo.
- **In-app la padronanza si scrive solo con l'autovalutazione accesa**; la sessione si registra
  comunque.
- **Pagina studente separata** (`scelta.html`), non un ramo in `student.html` (742 righe di player
  a domanda singola).
- **Chip a quattro valori** + libero; Osservazioni una volta in fondo.
- **Dedup testuale fra fogli**; **fogli vecchi accettati** senza rigenerare.
- **Kill-switch unico** `mappai_domande_scelta` per le tre porte. La Fase F invece **non ha
  kill-switch**: è pensione definitiva, come chiesto — la storia resta in git.
- **Niente migrazione dei record** delle modalità pensionate in `sessioni.jsonl`/mastery.
- **Il Palazzo tiene il suo core e cambia pelle**: è l'unica modalità storica che non smonta il
  canvas e che ha già logica pura testata — riscriverlo sarebbe buttare via ciò che regge.
- **Le due viste e i due strumenti restano** (Heat map · Mappa lavoro · Cosa studiare ora ·
  Progressi): non sono modalità, sono letture dei dati che le attività scrivono. Revocabile.
- **«Quiz a scelta» entra ora**, non dopo: i set MC per angolo li produce la Fase A, e senza
  un'attività che li usi quella metà del box nel bento resterebbe senza destinazione.
- **Docente e in-app in UN file** (`mappai-scelta.js`): stessa lettura dei materiali, stessa
  configurazione; due file avrebbero una funzione esportata solo per il gemello.
- **Il file resta `mappai-active-study.js`** anche se diventa il solo launcher: rinominarlo
  toccherebbe `index.html`, sei moduli e la memoria dell'agente per zero guadagno.
- **Il `kind:'cloze'` del player Live va via col Cloze**: zero produttori dal taglio del wizard,
  quindi togliere resa e grading è neutro sul comportamento; una `session.json` pre-potatura
  con domande cloze verrebbe rifiutata con `bad-kind` (dichiarato nel codice).

## Bivi

Nessuno aperto. Deciso il 19/8: pensione di **tutte e sette** le modalità del canvas e del
Cloze; resta il **Palazzo**, adattato al guscio nuovo; al loro posto **Domande a scelta** e
**Quiz a scelta**, che leggono i materiali già nel vault. Fasi A→F in una consegna sola.
