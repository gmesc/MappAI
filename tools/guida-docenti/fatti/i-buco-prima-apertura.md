# i — La prima apertura: la sequenza VERA (blocco → lingue → cartella → landing vuota → chiave)

> Lettura del codice del 22/8/26, `main` (HEAD e35db8f). Risolve il buco del critico sul capitolo 3.
> Integra `e-cabina.md` §1.15 e §6, `g-disco.md` §4 e §7, `a-landing-crea.md` §1.2 e §5: qui solo ciò
> che là manca o è sbagliato. Nessun file eseguito in Electron: tutto letto dal codice.

## 0. Il verdetto sulle due contraddizioni

| Contesa | Chi ha ragione | Prova |
|---|---|---|
| «Organizza i documenti di MappAI» al primo avvio: esiste (g-disco) o nessuno la chiama (e-cabina §6)? | **g-disco**. `maybePromptFirstRun` si chiama DA SOLA 1,5 s dopo il caricamento, dentro la sua IIFE | `public/js/mappai-files-settings.js:144-145`: `setTimeout(maybePromptFirstRun, 1500)` su `DOMContentLoaded` (o subito se il DOM è già pronto). Il grep di e-cabina cercava un chiamante per nome in ALTRI file: non c'è, ma non serve. Script caricato in `index.html:3380` |
| Onboarding lingue «Benvenuto in MappAI!» al primo avvio (e-cabina §1.15) | **NON COMPARE MAI** su un'installazione fresca: è codice morto | `mappai-storage-lang.js:864` chiama `changeLanguage(currentLanguage, true)` che scrive `localStorage.mappai_language` (`:672`, incondizionato) PRIMA del controllo `:869` `getItem('mappai_language') === null` → sempre falso → ramo `:872` che marca `mappai_lang_onboarded='1'` «utente esistente». Unico punto di chiamata di `showLanguageOnboarding`: `:870` (grep su `public/`, `main.js`) |

Conseguenza per la guida: **niente screenshot dell'onboarding lingue**. La lingua si sceglie solo da
Cabina › Impostazioni AI › «Lingua:» 🇮🇹 🇬🇧 (e-cabina §1.6). Il default è l'italiano (`:668`).

## 1. Etichette ESATTE a schermo (solo quelle che mancano altrove)

### 1.1 Il velo di blocco `#beta-lock-screen` (`public/index.html:333-363`)
| Testo a schermo | Selettore | file:riga |
|---|---|---|
| «MappAI» (titolo) | `#beta-lock-box h2.hero_title` | index.html:339 |
| «Il software è bloccato e legato a questo dispositivo.» | `span[data-i18n="ui_locked"]` | index.html:340; it_translations.js:427 |
| **«Invia il seguente ID Macchina a [EMAIL_ADDRESS] per ricevere il tuo codice di sblocco univoco:»** — è QUESTO che si legge, non «a Giacomo» | `span[data-i18n="machine_id_desc"]` | markup index.html:341-342 dice «a Giacomo»; `changeLanguage` lo sovrascrive all'avvio (`storage-lang.js:864` → loop `:722-725`) con `it_translations.js:207` che contiene il segnaposto letterale `[EMAIL_ADDRESS]`. In inglese invece dice «…to Giacomo…» (`en_translations.js:671`). **BUG da correggere prima degli screenshot**: basta sostituire `[EMAIL_ADDRESS]` con `giacomo@insegnai.ch` (o «Giacomo») in `it_translations.js:207`. È l'unica occorrenza del segnaposto in tutto `public/` (grep) |
| «CARICAMENTO...» poi l'ID di 10 caratteri (es. `3F9A1C02BD`) | `#machine-id-display` | index.html:347; valore da `main.js:3540-3555` (SHA-256 di MAC+CPU, primi 10 caratteri, maiuscoli) |
| tooltip «Copia ID»; dopo il clic l'icona diventa una spunta verde per 2 s | `button[title="Copia ID"]` | index.html:348-352, 432-440 |
| placeholder «INSERISCI SBLOCCO» | `#beta-access-code` (campo password) | index.html:354-356 |
| «Sblocca Software» | `button[data-i18n="ui_unlock"]` | index.html:357-359; it_translations.js:428 |
| «Codice di sblocco errato per questo dispositivo.» (rosso, il riquadro fa un piccolo «rimbalzo» di 150 ms) | `#beta-error-msg` | index.html:360-361, 414-418 |

Nessun indirizzo email compare nel velo (è il segnaposto). L'indirizzo a cui il docente scrive davvero
NON è nel codice del velo: l'unico contatto scritto nell'app è `giacomo@insegnai.ch` nel cassetto
insegnai.ch della landing (a-landing §1.2, `index.html:481-560`) e nella Segnalazione della Cabina.
Il codice di sblocco = primi 10 caratteri maiuscoli di SHA-256(ID + sale segreto) (`index.html:392-400`):
lo calcola Giacomo a mano, nessuno script in `tools/` o `docs/` lo genera (grep del sale vuoto).
Quanto aspetta il docente: **non è nel codice** (dipende da Giacomo). Dubbio, v. §8.

### 1.2 La finestra «Organizza i documenti di MappAI» (`mappai-files-settings.js:126-141`)
Testi già trascritti in g-disco §4 (`:248`). Aggiunte: il bottone × ha `aria-label="Chiudi"` (`:31`);
ESC e il clic sul velo scuro la chiudono come «Più tardi» (`:34-37`); z-index **9994** (`:27`).

### 1.3 Il chip del contesto sulla landing vuota (`mappai-live-classes.js:1337-1363`)
Due metà, entrambe «vuote» al primo avvio: «Classe» (`cb_ctx_classe_vuota`, `:1345`) e «Materia»
(`cb_ctx_materia_vuota`, `:1349`); tooltip «Contesto attivo (classe o allievo, materia) — tara la
generazione e filtra la sezione Insegna.» (`:1351`). Sta in `#header-utils` (fisso in alto a sinistra,
`mappai-stile-manifesto.css:125-133`), dopo il pallino «Cabina» (`order: 2`, `:2102`).

### 1.4 Ciò che la landing vuota NON dice
Nessun testo «inserisci la chiave», nessun lucchetto, nessun toast all'avvio senza chiave: v. §6.

## 2. Gesti → che cosa succede

| Gesto | Funzione | Effetto visibile | Su disco / localStorage |
|---|---|---|---|
| Avvio dell'app (Electron) | `app.whenReady` (`main.js:291-295`) | — | `adottaRootEsistente()` adotta `~/Documents/MappAI - file` SOLO se esiste già con almeno una sottocartella nota (`:275-289`); `initDefaultVaultFolder()` crea `~/Documents/MappAI - Vault` se manca (`:131-141`, non organizzato) — **nessuna mappa demo**: `public/vault_demo` non esiste nel repo (ls vuoto), il ramo di copia `:143-153` non fa nulla |
| Pagina caricata, accesso non ancora concesso | script inline `index.html:366-380` | velo scuro `#beta-lock-screen` (z 10000) su tutto; l'ID compare in `#machine-id-display` | legge `mappai_beta_access_granted` |
| `DOMContentLoaded` | `storage-lang.js:853-873` | lingua applicata (italiano) — **l'onboarding lingue non parte** (§0) | scrive `mappai_language='it'` e `mappai_lang_onboarded='1'` |
| +1,5 s | `maybePromptFirstRun` (`files-settings.js:126-141, 144-145`) | finestra «Organizza i documenti di MappAI» montata a z 9994: **NASCOSTA dietro il velo di blocco** finché non si sblocca | scrive **subito** `mappai_files_prompted='1'` (`:130`), anche se il docente non la vede mai |
| «Copia ID» | `copyMachineId` (`index.html:432-440`) | spunta verde 2 s | clipboard |
| «Sblocca Software» / Invio nel campo | `checkBetaCode` (`:405-419`, Invio `:421-428`) | il velo sfuma in 0,5 s; sotto c'è la landing vuota e, se ancora montata, la finestra «Organizza i documenti…» | `mappai_beta_access_granted='true'` → ai riavvii il velo è nascosto già dal primo frame (`:371-375`) |
| «Più tardi» / × / ESC / clic sul velo | `ov.remove()` (`:35-37, 139`) | sparisce e **non torna più** (flag già scritto) | — |
| «Scegli la posizione» | `doChoose` → `filesRootChoose` (`:117-123`) | dialogo di sistema + conferma «Organizza i file di MappAI» (g-disco §4) | v. g-disco |
| Clic sulla metà «Classe» del chip | `_pickContesto` (`:1241-1275`) | picker «Contesto di lavoro» con la sola voce «Generico» + «Gestisci classi e allievi» | — |
| Clic sulla metà «Materia» del chip senza materie | `_pickMateria` | toast «Nessuna materia: aggiungile nel profilo insegnante.» (e-cabina §1.14) | — |
| «Genera Mappa» senza chiave | `startGeneration` (`app.js:1196`) | PRIMA il modale «Per chi è questa mappa?» (`ensureGenerationContext`), POI il toast rosso «Inserisci un'API Key AI per continuare.» (`app.js:1244-1246`) — l'ordine è: contesto → chiave → nome del nodo → fonti | — |
| «Genera» con «Generico (nessuna classe)» e «— nessuna materia —» | `_askGenerationContext` → `ctx(null,'')` (`live-classes.js:1146-1156`) | la generazione parte | a fine generazione `ensureProjectVault` → `FC.mapVaultParents(null,'')` = `['Generico']` (`files-core.js:165-170`) → cartella **`Mappe/Generico/<Titolo>/`** se organizzato, altrimenti **`~/Documents/MappAI - Vault/Generico/<Titolo>/`** (`main.js:237`; `vault-io.js:161-199`) |

## 3. Limiti numerici e default

- ID Macchina: **10 caratteri** esadecimali maiuscoli (`main.js:3555`); codice di sblocco: 10 caratteri, confrontato in maiuscolo (`index.html:406, 400`).
- Velo di blocco: z 10000; onboarding lingue (morto): z 9999; finestra cartella: z 9994; header della landing: z 60 (`stile-manifesto.css:128`).
- Dissolvenza del velo: 500 ms (`index.html:410-411`); «rimbalzo» errore: 150 ms (`:417`).
- Finestra cartella: 1500 ms dopo il caricamento (`files-settings.js:144-145`), larghezza 500 px (`:137`); una sola volta per installazione (`mappai_files_prompted`).
- Velo di avvio della veste (`html.mn-boot`): al massimo 1500 ms (`index.html:86`), poi la landing appare.
- Modelli AI: caricati 1 s dopo l'avvio SOLO se c'è già una chiave (`app.js:2081-2085`).
- Provider di default: **Google** (`app.js:38`, chiave `ai_provider`). Lingua di default: **italiano** (`storage-lang.js:668`).
- Destinatario: si chiede **sempre** (`mappai_gen_ctx_sempre` ≠ '0', `live-classes.js:1126`).

## 4. Percorso tipico del docente — storyboard della prima apertura

1. **Doppio clic sull'app** → schermo scuro con il riquadro bianco: icona, «MappAI», «Il software è bloccato e legato a questo dispositivo.», «Invia il seguente ID Macchina a [EMAIL_ADDRESS]…» (⚠️ correggere prima), il riquadro indaco con l'ID (`#machine-id-display`), «Copia ID», campo «INSERISCI SBLOCCO», «Sblocca Software».
2. **Clic «Copia ID»** → spunta verde; il docente incolla l'ID in un'email a Giacomo (indirizzo da scrivere nella guida: `giacomo@insegnai.ch`, non è a schermo) e **chiude l'app** in attesa del codice.
   ⚠️ In questo scenario la finestra «Organizza i documenti di MappAI» è già nata dietro il velo e il flag è bruciato: **alla riapertura non la vedrà mai**. La cartella si sceglie poi da Cabina › Profilo insegnante › «Gestione cartelle» › «Scegli la posizione» (g-disco §4).
3. **Riapertura con il codice** → stesso velo; digitare il codice in `#beta-access-code` → «Sblocca Software» (o Invio) → il velo sfuma.
   Se invece il docente riceve il codice SENZA chiudere l'app, dopo lo sblocco trova la finestra «Organizza i documenti di MappAI» · «Più tardi» · «Scegli la posizione» (§1.2): è il terzo passo solo in questo caso.
4. **Landing vuota** (a-landing §1.2): marchio «MappAI» al centro; in alto a sinistra il pallino «Cabina» (`#btn-cabina`, tooltip «Cabina — profilo, AI, consumi, guida») e il chip con le due metà vuote «Classe» · «Materia» (`#active-class-chip`); accanto la briciola «Cosa»; in basso a sinistra la linguetta viola del cassetto insegnai.ch. **Nessun avviso sulla chiave.**
5. **Clic sul pallino «Cabina»** → console sulla vista «Profilo insegnante»; nella colonna di sinistra «Impostazioni AI» (`mappai-cabina.js:44`).
6. **«Impostazioni AI»** → «Provider AI» con «✅ Google Gemini» già attivo; «Come ottenerla?» apre `aistudio.google.com/app/apikey` nel browser (e-cabina §1.6); incollare la chiave in «Inserisci chiave Google Gemini...» (`#gemini-api-key-input`) e uscire dal campo → la tendina «Modello AI» si riempie («N modelli compatibili trovati.»).
7. **Chiudere la Cabina** (× o ESC) → landing; la chiave resta in `localStorage.gemini_api_key` (`index.html:2921`).
8. **«Cosa» → «Crea»** → il bento di CREA (a-landing §1.3-1.8); il chip sparisce in questa sezione (`stile-manifesto.css:251-253`), il contesto si sceglie dalla cascata «A chi?».
9. **Titolo + una fonte + «Genera Mappa»** → modale «Per chi è questa mappa?»: tendina «Destinatario» con **una sola voce «Generico (nessuna classe)»** (nessuna classe creata, nessun allievo attivo: `live-classes.js:1184-1189`), tendina «Materia» con la sola voce «— nessuna materia —» (`:1195`, profilo senza materie → `_materiePer(null)` = `[]`, `:1165-1172`) → **«Genera»**.
10. Fine generazione → la mappa sul canvas; su disco `~/Documents/MappAI - Vault/Generico/<Titolo>/` (o `MappAI - file/Mappe/Generico/<Titolo>/` se ha organizzato la cartella) con `index.yaml`, `links.json`, `Nodi/*.md`.

**La via più corta «dal download alla prima mappa»**: codice di sblocco → Cabina › Impostazioni AI › chiave Google → Cosa › Crea → titolo + fonte → Genera Mappa → «Genera» nel modale con «Generico». Classi e materie NON sono un prerequisito.

## 5. Prerequisiti e stati

- **Velo di blocco**: a ogni avvio finché `mappai_beta_access_granted` ≠ 'true' (`index.html:367-380`). Non compare su Capacitor/iOS (`:369`). Nel browser (senza Electron) l'ID è `WEB-MODE-xxxxxxxx` casuale (`:387`): non sbloccabile se non con il bypass di sviluppo.
- **Finestra cartella**: solo in Electron (`api()` richiede `electronAPI.filesRootGet`, `files-settings.js:20`; preload `:15`); solo se `filesOrganized` è falso (`main.js:3258-3262`); solo la prima volta (`mappai_files_prompted`). Se Giacomo ha già una «MappAI - file» abitata in Documenti, l'adozione al boot la salta (`main.js:275-289`).
- **Onboarding lingue**: mai (§0).
- **Chip «Classe · Materia»**: visibile sulla landing vuota, in ELABORA e tornando dalla Cabina; **nascosto in CREA** (`html.manifesto.mn-costruisci`, css:251-253, classe messa da `mappai-stile-manifesto.js:240` quando la modalità è `build`); **assente nella testata della console INSEGNA** (`landing-teach.js:2504` `contesto: []` con il bento acceso — il contesto vive nella cascata «Cosa · A chi? · Materia»). I tre file (a-landing 1.1, d-insegna 1c, e-cabina 4.10) sono coerenti: parlano di tre schermate diverse.
- **Chiave AI**: nessun prerequisito per vedere la landing o aprire CREA; serve solo al clic «Genera Mappa» (`app.js:1244-1246`) e, in Cabina, per riempire la tendina dei modelli («Nessun modello (manca API Key)», `ui-modals.js:1117`).
- **Classi/materie**: nessun prerequisito per generare: «Generico» + «— nessuna materia —» sono valori validi (HANDOFF.md:1336-1341: «Generico deve restare valido (al primo avvio non esistono classi)»).

## 6. NON ESISTE

- **L'onboarding lingue «Benvenuto in MappAI! · Welcome!»**: definito (`storage-lang.js:804-850`) ma irraggiungibile per l'ordine delle righe 864/869 (§0). Non descriverlo, non fotografarlo.
- **Un avviso proattivo «manca la chiave»** sulla landing o nel bento: grep `gemini_api_key|getSystemKey|API Key|api_key` in `mappai-stile-manifesto.js`, `mappai-costruisci-manifesto.js`, `mappai-console-bento.js`, `mappai-bento-composizione.js` = **vuoto**; in `index.html` l'unica occorrenza è l'`onblur` del campo chiave (`:2921`). All'avvio `refreshGeminiModels` (che farebbe il toast rosso) parte solo se la chiave c'è già (`app.js:2081-2085`). Il docente scopre la chiave mancante **solo** al primo «Genera Mappa», dopo aver già risposto a «Per chi è questa mappa?».
- **L'indirizzo email nel velo di blocco**: a schermo c'è il segnaposto `[EMAIL_ADDRESS]` (bug), non un indirizzo.
- **Mappe di esempio al primo avvio**: `public/vault_demo` non esiste; «Progetti esistenti» in ELABORA è vuoto.
- **Un selettore di classe all'avvio**: tolto il 2/8 (`live-classes.js:1366-1371`).
- **Una seconda occasione per la finestra «Organizza i documenti…»**: il flag si scrive alla creazione, non alla risposta (`files-settings.js:130`).
- **Uno strumento nel repo per generare il codice di sblocco**: grep del sale in `tools/` e `docs/` vuoto.

## 7. Parole da NON usare con i docenti

| Termine nel codice | Nella guida |
|---|---|
| beta lock / velo di blocco / `machine id` | «la schermata del codice di sblocco» · «il codice del tuo computer» |
| SHA-256 / hash / salt | non nominare: «Giacomo ti manda il codice che vale solo per il tuo computer» |
| onboarding | «la prima volta che apri MappAI» |
| landing (vuota) | «la prima pagina» / «la pagina d'ingresso» |
| chip classe·materia / contesto attivo | «le due etichette in alto a sinistra: Classe e Materia» |
| Cabina (console) | «Cabina» va bene: è l'etichetta a schermo (tooltip «Cabina — profilo, AI, consumi, guida») |
| bento / cascata / briciola «Cosa» | «la sezione Crea» · «il menu Cosa in alto» |
| API key / provider / Gemini | «la chiave di Google» · «il servizio AI» |
| vault / `MappAI - Vault` / `Mappe/Generico` | «la cartella della mappa» · «la cartella MappAI in Documenti» |
| `filesOrganized` / cartella madre / migrazione | «raccogliere tutti i documenti di MappAI in una sola cartella» |
| localStorage / flag / kill-switch | non nominare |
| Electron / Capacitor / IPC / preload | non nominare |
| toast | «un messaggio in basso che scompare da solo» |
| z-index / velo | «la finestra davanti» |

## 8. Dubbi (non verificati in Electron)

- **La finestra cartella dietro il velo**: dedotto dagli z-index (9994 < 10000) e dal timer; non visto. Se Electron è lento a caricare, i 1,5 s partono comunque dal `DOMContentLoaded`, quindi la finestra nasce quasi sempre mentre il velo è ancora su.
- **L'aspetto della metà «vuota» del chip** (testo «Classe»/«Materia» in grigio? tratteggio?): `MappAIModal.chipContesto` → `ctxHtml` (`mappai-modal.js:1090-1096`) non letto a fondo; i testi sono certi, lo stile no.
- **Tempo di attesa per il codice di sblocco** e **indirizzo a cui scrivere**: non sono nel codice; da chiedere a Giacomo. `giacomo@insegnai.ch` è il contatto scritto nel cassetto insegnai.ch e nella Segnalazione, quindi è la scelta coerente per la guida.
- **Il velo `mn-boot` e il velo di blocco insieme**: il primo nasconde la landing per ≤1,5 s; non verificato se il riquadro del blocco lampeggia durante quel tempo (è fuori da `#landing-view`, quindi dovrebbe essere stabile).
- **Nel dev mode (`npm start`)** `userData` è una sottocartella `dev/` (`main.js:159-161`): i flag di prima apertura che Giacomo vede in sviluppo non sono quelli di un'installazione del docente. Per gli screenshot della prima apertura serve una `userData` vergine (o cancellare `mappai_beta_access_granted`, `mappai_language`, `mappai_lang_onboarded`, `mappai_files_prompted`), e correggere `it_translations.js:207` prima.
