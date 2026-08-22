# i — BUCO «Costi, quota e tempi» (cap. 5 CREA · 7 ELABORA · 10 Cabina › Consumi AI)

Lettura del 22/8/26, sola lettura. Integra (non ripete) a-landing §3/§6.1, c-elabora 1.4/§4.11,
e-cabina §3/§6, f-visione §3, g-disco §2. Le misure «reali» vengono dal registro
`~/Documents/MappAI - file/Registro consumi AI/consumi-ai.jsonl` (2123 righe, 24/7→21/8) e dal
`pipeline.json` del vault vero `~/Documents/MappAI - file/Mappe/4R/Scienze/Elettricità - MM/`
(il laboratorio `lab/casa/` ne è una copia del 22/8 22:59 e NON ha la cartella «Registro consumi AI»).

## 0. La risposta in una tabella

Prezzi = tabella dell'app (`MODEL_KB`, `mappai-ui-modals.js:950`: gemini-2.5-flash **0,15 $ input / 0,60 $ output per
milione di token**) × tasso 0,90 (`usage-dashboard.js:29-30`). ⚠️ Google oggi (pagina pricing, agg. 13/8/26) chiede
**0,30 $ / 2,50 $** per lo stesso modello: la colonna «CHF (Google oggi)» è ricalcolata con quei prezzi.
Con chiave del piano gratuito il costo in franchi è **0** (pricing Google: «Free of charge» per 2.5 Flash, Flash-Lite,
2.5 Pro, 3 Flash Preview e 2.5 Flash Preview TTS).

| Gesto (caso reale) | Chiamate | Token in / out | Minuti | CHF (tabella app) | CHF (Google oggi) | Quota gratuita |
|---|---|---|---|---|---|---|
| **Mappa «Elettricità»** (valore salvato in `index.yaml`: la generazione che ha prodotto il vault) | non registrato | 129 341 / 54 916 (tot 287 024) | — | 0,047 | 0,158 | 0 CHF, ma consuma richieste: vedi §3.3 |
| **Mappa «Elettricità»** (registro 30/7 10:24:43→10:26:07, con 7 chiamate di flag NON di default) | 19 (di default ≈ **11-12**) | 74 580 / 11 217 | **1,4** | 0,016 | 0,045 | ≈ 12-19 richieste |
| **Materiali di base** (30/7: MC + V/F + flashcard, 6 per ramo, 5 rami; fogli nodi; sintesi senza voce) | **24** (B 15 · C 3 · D 6) | 26 913 / 14 709 | **3,3** (10:26:07→10:29:26) | 0,012 | 0,040 | ≈ 24 richieste |
| **Materiali con 7 angoli** («Rete alimentare Ceresio», 21/8, 5 rami: 35 MC + 35 aperte + 5 fc + 2 fogli + 1 sintesi) | **78** | 106 381 / 57 508 | **16,5** | 0,045 | 0,158 | ≈ 78 richieste |
| (variante grande: «Il Nazismo» 19/8, 6 rami + voce) | 117 | 185 959 / 85 988 | 25,8 | 0,074 | 0,244 | ≈ 117 |
| **Dossier da foto** (f-visione §3) | 1 lettura + «circa 9» (4 + 4 + 1) | unica misura: lettura 900 / 1 288 (20/8) | — | ≈ 0,001 (sola lettura) | — | ≈ 10 |
| **Voce naturale** su una sintesi (Elettricità 18/8, modello `gemini-2.5-flash-preview-tts`) | **49** (1 per blocco) | 2 713 / 19 864 | **8,2** | 0,011 ⚠️ prezzo sbagliato (§3.2) | 0,180 (0,50 $ / 10 $ audio) | ≈ 49, con tetto **10/min** |
| Voce naturale, storyboard c-elabora §4.11 (78 blocchi) | 79 ≈ 78 + titoli di una parola | — | **12** (formula `stimaTts`, §3.4) | — | — | ≈ 79 |

Lettura per il docente: **con la chiave gratuita tutto costa 0 franchi**; con una chiave a pagamento una mappa
come Elettricità costa **fra 5 e 16 centesimi**, i materiali di base 1-4 centesimi, i sette angoli 5-16 centesimi,
la voce naturale di una sintesi ~18 centesimi (è l'audio a costare). Un pomeriggio intero sta sotto il franco.

## 1. Etichette ESATTE a schermo

| Etichetta | Dove | file:riga |
|---|---|---|
| «🆓 Gratuito (con limiti)» (verde) / «💰 ~N cent/mappa» (viola) | badge sotto la tendina modello, Cabina › Impostazioni AI (`#model-caps`, via `onModelSelectChange`) | `mappai-ui-modals.js:1249-1252` |
| «gemini-2.5-flash — 🆓 Gratis» · «… — ~5¢/mappa» · «… — Costo Variabile» | testo delle voci della tendina `#model-select` | `:1082-1091` |
| tooltip della voce: «{note} \| Input: $0.15/1M tok \| Output: $0.6/1M tok⏎Formati: …» | `option.title` | `:1092` |
| «Include piano Gratuito (15 req/min) e Pay-as-you-go.» | riquadro provider Google (`#provider-info-content`) — ⚠️ stringa fissa dell'era Gemini 1.5, non letta da nessuna API | `app.js:495` |
| «Generazione completata! Token: 287.024 \| Costo: Gratuito (Piano Free)» | toast di fine mappa (`showGenerationReport`); per modelli `free:false`: «Costo: $0.0524» (Google) o «0.0524 CHF» (Infomaniak) | `app.js:1876` |
| «Mappa HD - Fase 1/3: Analisi introduttiva dell'argomento principale...» · «Mappa HD - Fase 2/3: Individuazione delle Macro-Categorie...» · «Mappa HD: espansione dei rami...» · «Mappa HD - Fase 3/3: Generazione Ramo "{label}" (Ramo {i}/{n})...» | velo di caricamento durante la generazione | `mappai-mm-extraction.js:548, 571, 668, 806` |
| «Errore Generazione Mappa HD» (titolo) + messaggio = testo dell'errore · bottone «Ho capito» | modale `#alert-modal` (`showAlert`) quando la Fase 1/2 fallisce | `mappai-mm-extraction.js:1233`; `index.html:465-467` |
| «Errore Generazione Mappa» | stesso modale, modalità iterativa | `mappai-mm-extraction.js:530` |
| «Sto generando «{nome}»: si riapre appena è pronta.» / «Generazione in corso: si riapre appena è pronta.» | toast dell'indicatore dei lavori se si prova a caricare un'altra mappa | `mappai-generazione.js:155-158` |
| «Stima chiamate AI: ~N (A x · B y · C z · D w)» · «Attiva almeno una sezione di output.» | `#mp-estimate` del modale «Genera materiali» — ⚠️ NON montato nel bento di default (a-landing §6.1) | `mappai-material-pipeline.js:1589-1594` |
| «Genero la mappa…» · «Genero i quiz… ({tipo} · {angolo} i/n)» · «Preparo i fogli nodi… ({layout})» · «Scrivo la sintesi…» · «Genero la voce naturale…» · «Preparo la catena dei perché…» · «Preparo il dossier della fonte…» | velo della pipeline materiali | `:1055, 523, 709, 754, 803, 888, 985` |
| «Pipeline interrotta: {errore}» (toast rosso) · «Pipeline occupata, riprova più tardi.» | `_toast` della pipeline | `:1128, 55` |
| riepilogo: passi «Mappa» «Quiz e flashcard» «Fogli nodi» «Sintesi» «Catena dei perché»; stati «fatto» «errore» «saltato» «in attesa» «in corso»; bottone «Riprova» sui passi in errore (mai su A); modale «Riprendi» con «Annulla» / «Riprendi» | `#mp-summary` | `:1699-1720, 1784-1787` |
| «{n} varianti non generate: le altre ci sono» (toast giallo) | quando un angolo fallisce e ce ne sono altri | `:677-678` |
| «Errore generazione sintesi: {errore}» · «Nessun ramo è stato sintetizzato — riprova» | toast della sintesi | `mappai-branch-synthesis.js:479, 573, 535` |
| «Il provider chiede di aspettare (quota).» | dossier da foto: unico messaggio di quota dedicato fuori dalla voce | `mappai-visione-core.js:361` |
| Cabina › Consumi AI: tessere «Chiamate AI» «Token input» «Token output» «Costo input» «Costo output» «Totale»; «Prezzo sconosciuto (costo 0) per: …» | cruscotto (già in e-cabina 1.7) | `mappai-usage-dashboard.js:109-125` |
| categorie del registro: «Generazione mappa» → «Triage struttura fonte», «MindMap — Fase 1 (macro-aree)», «MindMap — Fase 3 (rami)», «MindMap — Fase 4 (merge)», «MindMap — Fase 5 (riclassificazione)», «Validazione macro-aree», «Split macro-aree», «Arricchimento descrizioni», «Approfondimento foglie», «Knowledge Graph Community», «Espandi con AI»; «Materiali di studio» → «Sintesi di ramo/mappa», «Audio voce naturale», «Foglio nodi (keyword)», «Timeline»; «Pipeline materiali» → «Mappa», «Quiz a scelta multipla», «Quiz Vero/Falso», «Domande aperte», «Flashcard», «Foglio nodi», «Sintesi», «Voce naturale»; «Tutor AI» → «Chat dal nodo», «Chat dalla sidebar», «Quiz del tutor», «Tutor QR (Chatta e Scrivi)»; «Attività live» → «Quiz live»; «Altro» → «Test prompt (admin)», «Non classificato» | tendina/ciambelle «Per categoria» del cruscotto | `mappai-usage-core.js:18-92` |

**NON TROVATA**: nessuna etichetta con «quota», «richieste al giorno», «RPM/RPD» nella generazione mappe e nella
pipeline materiali (grep `429|RESOURCE_EXHAUSTED|quota` vuoto in `app.js`, `mappai-mm-extraction.js`,
`mappai-material-pipeline.js`, `mappai-study-session.js`).

## 2. Gesti → che cosa succede (il flusso dei soldi)

- **Ogni chiamata AI** passa da `window.fetchModelAPI` (`app.js:674`): sceglie il modello da `#model-select` o da
  `localStorage.gemini_selected_model` (ripiego `gemini-2.0-flash`, `:682`), somma i token in
  `appState.generationUsage` (`:751-755`) e scrive **una riga** `{ts, provider, model, inTok, outTok, cat, sub,
  project, projectId}` in `Registro consumi AI/consumi-ai.jsonl` (`MappAIUsage.record`, `:758-764` →
  `main.js:2626-2638`). Niente costi su disco: si calcolano a schermo (`usage-core.js:121-127`).
- **Fine mappa** → `showGenerationReport` (`app.js:1860`): toast coi token totali e «Gratuito (Piano Free)» se il
  modello ha `free:true` in `MODEL_KB` — ⚠️ l'app **non sa** se la chiave è gratuita o a pagamento: con
  gemini-2.5-flash dice sempre «Gratuito», anche a chi paga. Il riquadro «Costo grafico / Token Totali / Modello
  Usato» (`#total-cost-display`) esiste ma sta in un `div … hidden` (`index.html:1391-1404`): **non si vede**.
- I token restano nel vault: `index.yaml › generationUsage` (g-disco §2).
- **Cabina › Consumi AI** rilegge il JSONL e prezza ogni riga con `matchModelKB(model)` (`usage-dashboard.js:41-46`)
  × 0,90 USD→CHF: mostra un **costo in franchi anche per chi ha la chiave gratuita** (`costOf` non guarda
  `free`, `usage-core.js:121-127`). Va detto al docente: «è quanto AVRESTI pagato».

### 2.1 Quante chiamate fa una mappa (MindMap multi-pass, default di `main`)
Sequenziali, senza pause né tentativi ripetuti (nessun `retry`/`sleep` in `mappai-mm-extraction.js`):
1. Fase 1 — L0 (paragrafo introduttivo, `:554`) + L1 macro-aree (`:613`) = **2** (`sub: mm_phase1`).
2. Fase 3 — **una per ramo** (`:883`, loop su `branch`): 3-7 rami → 3-7 chiamate (`mm_phase3`).
3. Fase 3.7 deepening (ON di default, `generation-support.js:1744`): una chiamata ogni **4 foglie per ramo**
   (`MAX_CANDIDATES = 4`, `:1803`) → 2-6 chiamate (`deepen`). Salta se la fonte è < 200 caratteri (`:1797`).
4. Spente di default e quindi assenti: triage («Adattiva», `mappai_mm_triage_enabled==='1'`), validazione L1,
   split L1, arricchimento desc, Fase 4, Fase 5 (`generation-support.js:635, 645, 1181, 1507, 827`).
   ⚠️ Nel registro di Giacomo questi flag sono ACCESI (ogni mappa ha `triage`, `l1_validation`, `enrich`,
   `mm_phase4`, `mm_phase5`): le sue mappe fanno 12-24 chiamate; un'installazione fresca ne fa **≈ 2 + rami + deepen
   ≈ 8-14**. La stima «A = rami + 2» della pipeline (`pipeline-core.js:339`) è dichiarata «informativa, non vincolante».
5. Tempo reale (25 mappe nel registro, 1/8→21/8): **0,7-1,9 minuti**, gemini-2.5-flash, 18 000-196 000 token di input.

### 2.2 Quante chiamate fa «Genera materiali»
`B = rami × (tipi singoli + tipi per angolo × n. angoli)` (`pipeline-core.js:343-348`); una chiamata per ramo per tipo
per angolo (`material-pipeline.js:527-558`, `counter.calls++`); `C = ceil(nodi/12)` solo con fogli «keywords»/«card»;
D = sintesi: una per ramo + una panoramica (Elettricità: 6 con 5 rami); E (catena) = 0.
- 30/7 (prima degli angoli): B **15** = 5 rami × (MC + V/F + flashcard), 2,5 min (`pipeline.json` del vault vero,
  `steps.B.calls: 15`, `startedAt 10:26:07 → endedAt 10:28:37`); C 33 s; D 16 s. Totale passo B+C+D **3,3 min**.
- 21/8 con 7 angoli e 5 rami: 35 MC + 35 aperte + 5 flashcard + 2 fogli + 1 sintesi = **78 chiamate, 16,5 min**
  (registro, «Rete alimentare Ceresio»). Ritmo misurato: **~12-13 s per chiamata** (40 MC in 8,1 min il 17/8).
- Nel vault: `pipeline.json` salva `calls` solo per il passo B (`:685`).

### 2.3 Che cosa succede quando la quota finisce DURANTE una mappa (letto nel `catch`)
Google risponde 429; `main.js:330-337` trasforma il corpo in stringa (`JSON.stringify(error.response.data)`) e
l'IPC lo rilancia (`:361-363`); `fetchModelAPI` lo avvolge in «Errore Electron IPC API: …» (`app.js:785`).
Forma vera di un 429 catturata nei test (`tests/usage-core.test.js:160-163`, nato da un errore reale dell'11/8):
`Error invoking remote method 'generate-gemini': {"error":{"code":429,"message":"You exceeded your current quota.
Please retry in 59.724003872s.","status":"RESOURCE_EXHAUSTED","details":[…"retryDelay":"59s"]}}`.
Poi dipende da DOVE cade:
- **Fase 1 (L1)** → modale **«Errore Generazione Mappa HD»** col JSON inglese qui sopra come messaggio
  (`mm-extraction.js:1231-1233`), velo chiuso, nessun tentativo automatico, nessun bottone «Riprova»: si rifà
  «Genera» dall'inizio. L0 fallito invece è silenzioso (`:560`, `console.warn`).
- **Fase 3 (un ramo)** → il ramo è «curato» da solo: nasce un nodo L2 **«Approfondimento {ramo}»** (content «Sotto-ramo
  di {ramo}», rel «dettagli», `:1024-1038`), la generazione **continua** coi rami dopo (anch'essi 429 → altri
  stub) e alla fine il toast dice **«Generazione completata!»**. ⇒ quota finita a metà = mappa con macro-aree
  vuote e NESSUN avviso. Il registro consumi non lo vede (la riga si scrive solo a risposta arrivata).
- **Deepening** → `console.warn('[Deepening] errore non bloccante')` (`:1200-1202`): mappa meno profonda, zero avvisi.
- La mappa parziale resta in `appState.db` (nessun reset nel `catch`) ma dopo l'alert NON viene disegnata
  (`initD3Visualization` sta solo nel ramo buono, `:1226`); l'autosave ogni 2 min è sospeso durante la
  generazione (g-disco). Il lucchetto dei lavori si abbassa sempre (`finally`, `app.js:1544-1547`).
- **Infomaniak**: messaggio «Infomaniak Error (429): {corpo}» (`main.js:455`), stessi rami.

### 2.4 …e durante «Genera materiali»
- Passo B: `generateDynamicQuiz` **inghiotte l'errore e torna `[]`** (`study-session.js:238`): il ramo salta; se
  tutti i rami saltano «tipo senza risultati: salta, non fallisce lo step» (`material-pipeline.js:562`). Il
  riepilogo segna **«fatto»** con meno file. Con più angoli, un'eccezione successiva (PDF vuoto) dà «{n} varianti non
  generate: le altre ci sono» (`:672-678`); con un angolo solo lo step va in «errore» con «Riprova».
- Passi C/D/dossier: l'errore risale → passo «errore» + testo rosso dell'errore + «Riprova» (`:1715-1718`);
  a mappa chiusa, alla riapertura del vault il modale «Riprendi» (`:1784-1795`).
- Sintesi a mano: toast «Errore generazione sintesi: …» o «Nessun ramo è stato sintetizzato — riprova».
- Voce naturale: l'UNICA area che legge il 429, aspetta `retryDelay` e distingue «limite al minuto» da «quota
  GIORNALIERA» (e-cabina §3; `usage-core.js:231-270`, `branch-synthesis.js:1685-1708`).

## 3. Limiti numerici e default

### 3.1 Prezzi nella tabella dell'app (`MODEL_KB`, USD per 1M token; Infomaniak in CHF)
| modello | input | output | free | badge |
|---|---|---|---|---|
| gemini-2.5-flash (default visto nel registro: 1888 righe su 2123) | 0,15 | 0,60 | sì | «🆓 Gratuito (con limiti)» |
| gemini-2.5-flash-lite · gemini-3.1-flash-lite | 0,10 | 0,40 | sì | idem |
| gemini-3-flash · gemini-3.5-flash | 0,50 | 3,00 | sì | idem |
| gemini-2.5-pro | 1,25 | 10,00 | no | «💰 ~5 cent/mappa» |
| gemini-3-pro · gemini-3.1-pro | 2,00 | 12,00 | no | «💰 ~6 cent/mappa» |
| Infomaniak: mistral-small 0,10/0,30 · qwen/kimi 0,15/0,60 · gemma-4/apertus 0,20/0,40 | | | no | «~0 cent/mappa» (arrotonda a 0) |
| modello non in tabella con «flash» nel nome | 0,10 | 0,40 | sì | (ripiego dinamico `:1018-1028`) |

«~N cent/mappa» = (input × 5 000 + output × 4 000) / 1M × 100 (`:1087, 1252`): suppone una mappa da **5k in / 4k
out**, cioè **25-30 volte meno** di Elettricità (129k / 55k). Il badge sottostima di un ordine di grandezza.
Google oggi (pricing 13/8/26): 2.5 Flash **0,30 / 2,50**; Flash-Lite 0,10 / 0,40; 2.5 Pro 1,25 / 10; 3 Flash
Preview 0,50 / 3,00; 2.5 Flash Preview **TTS 0,50 / 10,00 (audio)**. La tabella dell'app è aggiornata solo per
Flash-Lite e Pro.

### 3.2 Il prezzo della voce è sbagliato nel cruscotto
`matchModelKB` fa prefix-match (`ui-modals.js:1005-1008`): `gemini-2.5-flash-preview-tts` inizia con
`gemini-2.5-flash` → prezzato 0,15 / 0,60 invece di 0,50 / 10,00. Nessun «Prezzo sconosciuto» compare.
Effetto: la voce di Elettricità (49 clip) appare come 0,011 CHF; a prezzo Google sono 0,18 CHF.

### 3.3 Quota del piano gratuito
- Verificato (docs Google «rate-limits», agg. 18/8/26): tre contatori **RPM, TPM (input), RPD**; superarne UNO dà
  `429 RESOURCE_EXHAUSTED`; **le richieste al giorno si azzerano a mezzanotte del Pacifico = le 9 del mattino in
  Svizzera**; i numeri per modello NON stanno più nella pagina («View your active rate limits in AI Studio»).
- Misurato in casa: il TTS gratuito ha **10 richieste al minuto** (commento del test: «limit: 10, model:
  gemini-2.5-flash-tts», `tests/usage-core.test.js:155-158`); da lì il default `mappai_tts_rpm = 10`.
- «15 req/min» a schermo (`app.js:495`) è una costante scritta a mano, non un dato.
- ⚠️ DA MEMORIA, NON VERIFICATO OGGI: a fine 2025 il piano gratuito di gemini-2.5-flash valeva ~10 RPM / ~250 RPD /
  250k TPM. Se fosse ancora così: una mappa (≈12) + materiali di base (24) ≈ 36 richieste → **≈ 6 «Elettricità»
  al giorno**; con i 7 angoli (78-117) → **2 al giorno**; una voce su una sintesi intera (79) ne mangia un terzo.
  La pipeline a ~12 s/chiamata sta sotto i 10 RPM; la Fase 3 delle mappe (5 chiamate in 20 s, registro 30/7
  10:25:05→10:25:25) li sfiora.

### 3.4 Tempi
- Mappa: 0,7-1,9 min (25 mappe); la sola Fase 3 di Elettricità 20 s per 5 rami.
- Materiali di base 3,3 min; 7 angoli 12,7-16,5 min (60-78 chiamate); «Il Nazismo» 25,8 min.
- Voce: `stimaTts` = chiamate × 4 s + (chiamate − 10) × 6 s (`usage-core.js:283-293`): 78 blocchi → 720 s =
  **12 min** (conferma lo storyboard c-elabora §4.11); 49 clip reali → 8,2 min (stima 7).
- Timeout di una chiamata Google: **10 minuti** (`main.js:327`).
- Tetto di profondità: tendina «Profondità» default **«L5 — massimo»** (`index.html:909`); il deepening parte solo
  con target ≥ 3 (`generation-support.js:1785`).

## 4. Percorso tipico del docente (storyboard «quanto mi costa»)
1. Cabina › Impostazioni AI → tendina `#model-select`: voce «gemini-2.5-flash — 🆓 Gratis»; sotto, badge
   «🆓 Gratuito (con limiti)» e la nota «Veloce con reasoning · da testare KG» (`ui-modals.js:1264`).
2. Passare col mouse sulla voce → tooltip «Input: $0.15/1M tok | Output: $0.6/1M tok».
3. CREA → «Genera» → velo «Mappa HD - Fase 1/3…», «Fase 2/3…», «Fase 3/3: Generazione Ramo "…" (Ramo 1/5)…»
   (≈ 1-2 min).
4. Toast verde «Generazione completata! Token: 287.024 | Costo: Gratuito (Piano Free)».
5. «Genera materiali» (bento) → velo «Genero i quiz… (Scelta multipla · causa 1/7)» … → riepilogo `#mp-summary`
   con «Quiz e flashcard — fatto», «Fogli nodi — fatto», «Sintesi — fatto» (≈ 15 min coi 7 angoli).
6. Cabina › Consumi AI → tabella «Mappe» riga «Elettricità» con «Chiamate AI»; cruscotto: tessere, ciambella
   «Per categoria» (Generazione mappa / Pipeline materiali / Materiali di studio), «Totale» in CHF.
7. Cambiare «Tasso USD→CHF» → i totali si ricalcolano; «Stampa» → finestra «MappAI — Consumi AI».
8. Icona «Apri la cartella del registro su disco» → Finder su `consumi-ai.jsonl`.
9. (Scena dell'errore, da provocare con una chiave esaurita) CREA → «Genera» → modale «Errore Generazione Mappa HD»
   con il JSON `"code":429 … "status":"RESOURCE_EXHAUSTED"` → «Ho capito».

## 5. Prerequisiti e stati
- Serve una chiave: senza, «Inserisci un'API Key per continuare» (`tst_need_key`). La chiave gratuita e quella a
  pagamento sono indistinguibili per l'app; «Gratuito» è una proprietà del MODELLO in tabella, non del piano.
- Il registro consumi nasce alla prima chiamata (`fs.mkdirSync … recursive`, `main.js:2632`); Cabina vuota:
  «Nessun consumo registrato» (e-cabina 1.7).
- Badge e stima del modello dipendono dalla lista modelli salvata (`gemini_available_models`) prima del
  prefix-match (`ui-modals.js:985-1000`).

## 6. NON ESISTE
- **Nessun contatore di quota** (richieste usate oggi / rimaste): grep `RPD|requests per day|quota giornaliera`
  vuoto fuori dalla voce naturale; l'unica fonte è AI Studio (docs Google).
- **Nessun tentativo automatico né attesa** nella generazione mappe e nella pipeline: grep `retry|sleep|attesa`
  vuoto in `mappai-mm-extraction.js`, `mappai-material-pipeline.js`, `app.js` (solo i «Tentativi» del parser JSON,
  `generation-support.js:362-377`). Il solo `retryDelayMs` vive in `usage-core.js` ed è usato dal TTS.
- **Nessun messaggio di quota in italiano** per mappe e materiali: il docente legge il JSON inglese di Google dentro
  «Errore Generazione Mappa HD», oppure NIENTE (stub «Approfondimento …», ramo saltato, passo «fatto»).
- **Nessun preventivo visibile in CREA** (`#mp-estimate` non montato, a-landing §6.1) e **nessun prezzo in CHF** prima
  di generare: il badge dice centesimi «per mappa» su un'ipotesi di 9k token.
- **Nessun riquadro costi sul canvas**: `#total-cost-display` è in un contenitore `hidden` (`index.html:1391`).
- **Nessuna registrazione della chiamata fallita**: il 429 non va né nel registro consumi (riga scritta solo con
  `usageMetadata`) né in Diagnostica (`errori.jsonl` intercetta solo `error`/`unhandledrejection`,
  `mappai-errori.js:325-345`; l'errore è già catturato dal `catch`). Nel registro di casa: 0 righe 429 su 8.
- **Nessun prezzo della voce**: il modello TTS non è in `MODEL_KB` (grep `tts` vuoto in `ui-modals.js:943-982`).
- **Nessun `pipeline.json` e nessun registro consumi nel laboratorio** `lab/casa/`: le misure vanno prese dal
  vault vero o rifatte con la campagna.

## 7. Parole da NON usare con i docenti
| gergo | nella guida |
|---|---|
| token | «pezzi di testo» / «quanto testo è passato» (a schermo resta «Token») |
| chiamata AI / request / RPM / RPD | «richiesta all'AI» · «richieste al minuto» · «richieste al giorno» |
| 429 / RESOURCE_EXHAUSTED / rate limit / quota | «Google ha detto di aspettare» · «per oggi il credito gratuito è finito» |
| free tier / Pay-as-you-go / Tier 1 | «chiave gratuita» · «chiave con carta» |
| input / output cost | «prezzo per quello che mandi» / «per quello che torna» |
| MODEL_KB / prefix-match | «la tabella dei prezzi dentro l'app» |
| fetchModelAPI / IPC / main process | (non nominare) «l'app chiede a Google» |
| Fase 1 / Fase 3 / deepening / L1 / ramo | «le macro-aree» · «un ramo alla volta» · «l'approfondimento delle foglie» |
| pipeline / step A-E / manifest | «Genera materiali» · «i passi: Mappa, Quiz e flashcard, Fogli nodi, Sintesi, Catena dei perché» |
| stub / fallback node | «un ramo rimasto vuoto con dentro solo "Approfondimento …"» |
| TTS / clip / blocco | «voce naturale» · «un pezzo di audio per ogni paragrafo» |
| JSONL / registro consumi | «il diario delle richieste» (a schermo: «Registro consumi AI») |
| USD→CHF rate | «il cambio dollaro-franco» |
| midnight Pacific | «le nove del mattino da noi» |

## 8. Dubbi
- **I numeri del piano gratuito** (RPM/RPD/TPM per modello) non sono più nella documentazione pubblica: vanno
  letti in AI Studio (`aistudio.google.com/rate-limit`) con una chiave vera, prima di scrivere «N mappe al giorno».
  I valori in §3.3 sono da memoria e marcati tali.
- **Prezzo Infomaniak**: `MODEL_KB` dice CHF, non ho verificato il listino reale.
- **Il prefisso esatto del messaggio d'errore** visto dal docente: il codice dà «Errore Electron IPC API: » +
  messaggio dell'IPC; Electron antepone «Error invoking remote method 'generate-gemini': » (così nel fixture) —
  se ci sia anche un «Error: » in mezzo non l'ho visto in un'alert reale.
- **Il mismatch dei token di Elettricità**: `index.yaml` dice 129 341 / 54 916, il registro del 30/7 per la stessa
  mappa dà 74 580 / 11 217 in 19 chiamate (più 26 913 / 14 709 di materiali). Forse `generationUsage` somma una
  sessione più lunga (tutor, rigenerazioni) o una generazione non registrata: da chiarire prima di citare «287 024».
- **Il dossier da foto**: le 9 chiamate stimate non hanno una misura reale nel registro (1 sola riga `visione`).
- **Se con un 429 in Fase 3 i rami DOPO falliscano davvero tutti** dipende da quanto dura il blocco Google
  (retryDelay 59 s vs 20 s di Fase 3): plausibile, non provato.
- Il ritmo «12-13 s a chiamata» della pipeline è latenza del modello, non una pausa dell'app (nessun `sleep`):
  con un modello più veloce il tempo cala e i 10 RPM possono essere superati.
