# I — INSTALLAZIONE E REQUISITI: Mac/Windows, download, offline, prima apertura

> Area: capitolo 2 «Cosa serve per iniziare» e capitolo 3 «La prima apertura».
> Letto dal codice il 22/8/26. Ciò che è già scritto altrove (lo schermo di sblocco in
> `e-cabina.md` §ID Macchina, le cartelle su disco in `g-disco.md`, la prima mappa in
> `a-landing-crea.md`) NON è ripetuto: qui c'è solo quello che mancava.

## 0. Il fatto che cambia il capitolo: NON c'è un file da scaricare

- **`https://www.insegnai.ch/mappai.html` non offre nessun download** (letto il 22/8/26): nessun
  link a DMG/EXE, nessun numero di versione, nessun prezzo. L'unica azione è
  «Scrivimi per una demo» (`mailto:giacomo@insegnai.ch`). La pagina dice: per il docente
  «un computer (macOS, Windows o Linux) con MappAI installato e una chiave API»; per gli
  allievi «qualunque dispositivo con un browser… nessuna installazione, nessuna registrazione».
- **Non esiste un aggiornamento automatico**: `grep autoUpdater main.js` → vuoto; nessuna
  dipendenza `electron-updater` in `package.json`. Ogni versione nuova è un nuovo file da
  passare a mano.
- **Gli installer in `dist/` oggi NON ci sono**: `ls dist/` → solo `builder-debug.yml` e
  `builder-effective-config.yaml` (20/7/26); `dist/` è in `.gitignore:8`. L'ultima nota
  che elenca installer pronti è `docs/NEXT_SESSION_PROMPT.md:56-63` (scritta il 21/6/26,
  era Electron 30): «MappAI-1.0.0-arm64.dmg (258 MB, Mac Apple Silicon…)»,
  «MappAI-1.0.0.dmg (Mac Intel x64) — DA RIFARE», «"MappAI Setup 1.0.0.exe" (Windows) —
  DA RIFARE». **Quei file sono di due mesi e un Electron fa**: la guida non deve citare
  pesi o nomi come se fossero attuali.
- Conseguenza per la guida: il capitolo 2 deve dire «**Giacomo ti manda il file**
  (un `.dmg` per Mac, un `.exe` per Windows) **e poi ti manda il codice di sblocco**», non
  «vai sul sito e scarica».

## 1. Etichette ESATTE a schermo (quelle di quest'area)

| Etichetta | Dove / selettore | file:riga |
|---|---|---|
| «MappAI» (titolo finestra) | `new BrowserWindow({ title: "MappAI" })` | `main.js:81-84` |
| «MappAI — Generatore AI di mappe e grafici di conoscenza» (`<title>`, `data-i18n="app_title"`) | scheda/finestra prima che il titolo venga impostato | `public/index.html:7` |
| «Il software è bloccato e legato a questo dispositivo.» | `#beta-lock-screen` (`data-i18n="ui_locked"`) | `index.html:341`, `it_translations.js:427` |
| «Invia il seguente **ID Macchina** a Giacomo per ricevere il tuo codice di sblocco univoco:» — ⚠️ a runtime `changeLanguage` lo sostituisce con «…a [EMAIL_ADDRESS]…» (già segnalato in e-cabina §ID Macchina) | `data-i18n="machine_id_desc"` | `index.html:342`, `it_translations.js:207` |
| «CARICAMENTO...» poi l'ID (10 caratteri maiuscoli) | `#machine-id-display` | `index.html:348`, `main.js:3540-3554` |
| «Copia ID» (tooltip `title`) | bottone accanto all'ID, `onclick="window.copyMachineId()"` | `index.html:349-351` |
| «INSERISCI SBLOCCO» (placeholder, campo password) | `#beta-access-code` | `index.html:356-358` |
| «Sblocca Software» | bottone `onclick="window.checkBetaCode()"` (`data-i18n="ui_unlock"`) | `index.html:359-361` |
| «Codice di sblocco errato per questo dispositivo.» | `#beta-error-msg` (rosso, compare al codice sbagliato) | `index.html:362` |
| «Benvenuto in MappAI! · Welcome!» (titolo) · «Scegli le lingue · Choose your languages» | modale `#lang-onboarding-modal` | `mappai-storage-lang.js:804-822` |
| «🖥 Lingua dell'interfaccia · Interface language» → «Italiano 🇮🇹» / «English 🇬🇧» | radio `onb-ui-lang` | `:826-829` |
| «🗺 Lingua delle mappe · Map language» → «Come l'interfaccia · Same as interface» / «Italiano» / «English» / «Lingua delle fonti · Language of the sources» (desc «Le mappe nascono nella lingua dei documenti caricati · Maps follow the language of your documents») | radio `onb-map-lang` | `:831-836` |
| «Inizia · Start» | `#lang-onb-ok` | `:839` |
| «Organizza i documenti di MappAI» (titolo) | overlay primo avvio, `z-index:9994` | `mappai-files-settings.js:137`, `:27` |
| «Vuoi che MappAI raccolga tutti i suoi documenti (mappe, report, file condivisi, classi) in una sola cartella a tua scelta? Potrai spostare anche quelli già esistenti.» | corpo | `:132` |
| «Più tardi» · «Scegli la posizione» | `.fx-later` · `.fx-now` | `:134-135` |
| «Scarica una copia» (titolo dialogo di sistema) · «Scarica» (bottone) | `dialog.showSaveDialog`, parte da `~/Downloads` | `main.js:1046-1050` |
| «Questo formato si converte solo su macOS.» · rimedio «Salva la foto come JPG o PNG e ricaricala.» | diagnosi foto HEIC/TIFF fuori da macOS | `mappai-visione-core.js:347-349` |
| «Apri nel Finder» · «Nessuna cartella vault su disco» · «Apre la cartella del vault nel Finder.» | icone cartella in INSEGNA/ELABORA — **identiche su Windows** (vedi §5) | `mappai-landing-teach.js:261, 476, 2437`, `mappai-elabora-console.js:1571` |
| Menu dell'app (barra in alto su Mac / nessuna su Windows) | **NON TROVATA** come etichetta del repo: `grep Menu main.js` → vuoto → resta il menu di default di Electron, **in inglese** («File», «Edit», «View», «Window», «Help») | `main.js:1` (import senza `Menu`) |

Etichette contate: 22.

## 2. Gesti → che cosa succede → che cosa finisce su disco

### Avvio dell'app (ogni volta)
`app.whenReady()` (`main.js:291-304`) esegue in ordine:
1. `adottaRootEsistente()` (`:263-289`): se in `Documenti/` esiste già «MappAI - file» con
   almeno una sottocartella nota, scrive `filesOrganized:true` in
   `<userData>/mappai-settings.json` — **sopravvive alla reinstallazione** (è pensato proprio
   per quello, commento `:251-262`).
2. `apriSessione()` (`:2835-2850`): scrive un segnaposto di sessione in `Diagnostica/`
   (`MappAI - file/Diagnostica/` oppure `Documenti/MappAI - Diagnostica/`, `:2773-2777`);
   se il segnaposto della volta prima c'è ancora, registra in `errori.jsonl` «La sessione
   aperta il … non si è chiusa: uscita forzata, blocco o spegnimento…».
3. `initDefaultVaultFolder()` (`:132-157`): crea `Documenti/MappAI - Vault/` (o
   `MappAI - file/Mappe/`) se manca. Copierebbe una mappa demo da `public/vault_demo/`, **ma
   la cartella non esiste** (`ls public/vault_demo` → no such file; tolta nel commit
   `ff1e497`) → **al primo avvio la cartella è vuota, nessuna mappa di esempio**.
4. `bootPrimaryWindow()` → `createWindow()` (`:80-92`): finestra 1280×800, carica
   `public/index.html`. Il launcher storico «MappAI / Studio» è spento (`legacyLauncher`
   solo da `mappai-settings.json`, `:166-172`).
- Chiusura: su Mac chiudere la finestra NON chiude l'app (resta nel Dock; `window-all-closed`
  esce solo se `process.platform !== 'darwin'`, `:305-309`); su Windows chiudere la finestra
  = uscire. `⌘Q` / uscita pulita cancella il segnaposto (`will-quit`, `:2858`).

### Prima apertura (solo installazione fresca) — tre veli, in quest'ordine
| Velo | Condizione | Gesto | Scrive |
|---|---|---|---|
| Schermo di sblocco `#beta-lock-screen` (z 10000, sopra tutto) | `localStorage.mappai_beta_access_granted !== 'true'` (`index.html:368-378`) | «Sblocca Software» o Invio → `checkBetaCode` (`:407-422`) | `localStorage.mappai_beta_access_granted='true'` |
| Modale lingue (z 9999, già renderizzato SOTTO lo sblocco) | `mappai_language === null` e `mappai_lang_onboarded` assente (`storage-lang.js:866-874`) | «Inizia · Start» | `mappai_language`, `mappai_map_language`, `mappai_lang_onboarded` |
| «Organizza i documenti di MappAI» (z 9994, 1,5 s dopo il caricamento) | app Electron, `mappai_files_prompted` assente, cartelle non organizzate (`files-settings.js:126-131, 145`) | «Più tardi» (sparisce, **non ritorna**: il flag si scrive comunque `:130`) · «Scegli la posizione» → `doChoose` | `localStorage.mappai_files_prompted='1'`; con «Scegli» anche `mappai-settings.json` + cartella «MappAI - file» (vedi g-disco) |

Nota per gli screenshot: i tre veli si sovrappongono; il docente li vede **uno alla volta**
togliendo il primo (sblocco) scopre il secondo (lingue) e, sotto, il terzo (cartelle).
Con la combinazione «Più tardi» il prompt cartelle **non si ripresenta mai più** su quella
installazione: si passa da Cabina › Gestione cartelle (e-cabina).

### Codice di sblocco
- ID = SHA-256(MAC address della prima scheda di rete non interna + modello CPU), primi 10
  caratteri maiuscoli (`main.js:3540-3554`). Codice atteso = SHA-256(ID + sale), primi 10
  (`index.html:397-405`). **Stessa macchina ⇒ stesso ID anche dopo reinstallazione**: il
  codice ricevuto vale per sempre su quel computer. Cambio di computer ⇒ nuovo ID ⇒ nuovo
  codice da chiedere.
- ⚠️ Windows/portatili con Wi-Fi: l'ID prende la **prima** interfaccia con MAC non nullo
  (`:3543-3549`); se l'ordine delle schede cambia (dock USB-ethernet attaccata/staccata)
  l'ID può cambiare. Non verificato, ma è nel codice: da dire al docente «sbloccalo con la
  stessa configurazione di rete con cui hai letto l'ID».

## 3. Limiti numerici, versioni, requisiti

| Voce | Valore | Prova |
|---|---|---|
| Versione dell'app | **1.0.0** (unica, mai incrementata) | `package.json:3`; hardcoded anche nel feedback `app.js:2039` |
| Nome prodotto / appId | «MappAI» / `com.mappai.generatore` | `package.json:23-24` |
| Runtime | **Electron 39.8.10** (Chromium 142.0.7444.265) — ⚠️ CLAUDE.md §2 dice «Electron 30»: **stantio** (aggiornato a 39 il 20/7/26, commit `d8f4e13`) | `package.json:55`, `node_modules/electron/package.json`, plist del framework |
| macOS minimo | **macOS 12 Monterey** (`LSMinimumSystemVersion = 12.0` nell'`Electron.app` usato per impacchettare; il README Electron v39.8.10 dice «macOS (Monterey and up)») | `node_modules/electron/dist/Electron.app/Contents/Info.plist` |
| Chip Mac | due DMG separati: `arm64` (Apple Silicon) e `x64` (Intel) — il docente deve sapere quale Mac ha (Mela › Informazioni su questo Mac) | `package.json:25-33` |
| Windows minimo | **Windows 10 o 11** (README Electron: «Windows 10 and up»); installer **NSIS** (`MappAI Setup 1.0.0.exe`) | `package.json:46-48` |
| Linux | AppImage + deb (i `.deb` fatti su Mac erano stub vuoti di 96 byte, `NEXT_SESSION_PROMPT.md:68-69`) | `package.json:34-42` |
| Spazio su disco | l'ultimo DMG noto pesava **258 MB** (giugno); `public/` = 40 MB, `node-llama-cpp` ≈ 51 MB incluso fuori dall'asar (`asarUnpack`, `package.json:18-21`) — stima onesta: **~300 MB installati**, più le mappe | `NEXT_SESSION_PROMPT.md:57`, `du -sh` |
| RAM / CPU | **NON TROVATA** nessuna soglia nel codice | — |
| Firma / notarizzazione Mac | **NESSUNA**: niente `build/` (`ls build/` → non esiste), niente `notarize`, `hardenedRuntime`, `identity`, entitlements in `package.json` | `grep notarize\|hardenedRuntime package.json` → vuoto |
| Icona dell'app | `public/MappAI_icon.png` esiste (228 KB) ma **non è dichiarata** in `build` (nessun `build/icon.icns`/`icon.ico`) → electron-builder usa l'**icona di default di Electron** nel Dock/Start | `package.json:16-48` |
| Menu di sistema | default Electron, in inglese | `main.js:1` |
| Finestra | 1280×800 all'apertura, nessun `minWidth` | `main.js:81-83` |
| Dove si salva (Mac) | `~/Library/Application Support/mappai/` (**minuscolo**: `app.name` = `name` di `package.json:2`; sul disco Mac, che non distingue le maiuscole, «MappAI» e «mappai» sono la stessa cartella — verificato: la cartella c'è e contiene `Local Storage/leveldb`, `prompts_config.json`, `dev/`) | `main.js:162-164`, `NEXT_SESSION_PROMPT.md:50-52` |
| Dove si salva (Windows) | per costruzione `C:\Users\<nome>\AppData\Roaming\mappai\` (stesso `app.getPath('userData')`) — **non verificato su Windows** | `main.js:173, 206` |
| Che cosa vive lì | `Local Storage/` (chiavi API, profili, flag, classi in localStorage), `mappai-settings.json`, `prompts_config.json` (override prompt), `tts-cache/` (7 giorni), `visione-tmp/`, `models/`, `MappAI-Pipeline/` | `main.js:173, 651, 740, 849, 2671, 3595` |
| Sviluppo vs installata | `npm start` scrive in `…/mappai/dev/`, l'app installata nella radice: due «utenti» diversi, due sblocchi, due set di chiavi | `main.js:159-164` |

### Internet: che cosa serve davvero
Letto in `public/index.html` (tutti gli `src`/`href` esterni):
- **LOCALI** (funzionano senza rete): Tailwind `js/tailwind.js` (`:22`, 407 KB — ⚠️ CLAUDE.md §2
  «Tailwind via CDN» è **stantio**), PDF.js `:25`, jsPDF `:28`, svg2pdf `:31`, D3 `:92`,
  Lucide `:95`, three/rot `:98-100`, tutti i `mappai-*.js`, i caratteri in `public/fonts/`
  (Space Mono, Atkinson, TestMe — commento `:9-15`: «I CARATTERI SONO LOCALI (18/8/26)»).
  La nota della Cabina «i caratteri funzionano anche senza collegamento» (e-cabina 1.5) **è vera**.
- **DALLA RETE** (solo due cose):
  1. **Noto Color Emoji** da `fonts.googleapis.com` (`:16-18`): senza rete le emoji escono
     nello stile del sistema (Apple/Segoe) — cosmetico, il commento `:14-15` lo dichiara.
  2. **KaTeX 0.16.9** da `cdnjs.cloudflare.com` (`:316-320`, css + js + auto-render):
     senza rete le **formule matematiche restano in LaTeX grezzo** (`$x^2$`) —
     `mappai-latex.js:26-29` fa `console.warn('[LaTeX] KaTeX auto-render non disponibile')` e
     ritorna; `:43` restituisce la formula così com'è. Nessun avviso a schermo.
- **L'AI** (Gemini/Infomaniak, voce naturale, lettura foto, URL/YouTube) richiede rete
  sempre: le chiamate partono dal main (`main.js:317`, `https://generativelanguage…`).
- **NON ESISTE** un rilevatore di «sei offline» (`grep navigator.onLine public/js` → vuoto):
  senza rete una generazione fallisce con l'errore della chiamata, non con un avviso
  «manca internet».
- Quindi: **l'interfaccia si disegna anche senza rete**; rete = AI, emoji a colori, formule.
  Il PDF via `html-to-pdf` aspetta i font al massimo 4 s e poi stampa comunque
  (`main.js:917-927`).

## 4. Percorso tipico del docente (storyboard)

1. **Email da Giacomo** con il file: `MappAI-1.0.0-arm64.dmg` (Mac M1/M2/M3/M4),
   `MappAI-1.0.0.dmg` (Mac Intel) o `MappAI Setup 1.0.0.exe` (Windows). ⚠️ nomi = convenzione
   electron-builder `${productName}-${version}-${arch}`; confermare col file vero.
2. **Mac**: doppio clic sul DMG → finestra con «MappAI» e il collegamento «Applications»
   (layout di default di electron-builder) → trascinare. **Windows**: doppio clic sull'`.exe` →
   l'installer NSIS di electron-builder è di default *one-click* per-utente (nessuna domanda,
   nessun amministratore), installa in `%LOCALAPPDATA%\Programs\MappAI\` e crea icona sul
   desktop e nel menu Start — **per documentazione electron-builder 24, non verificato**.
3. **Primo avvio Mac**: l'app **non è firmata né notarizzata** → Gatekeeper blocca
   («“MappAI” non può essere aperto perché non è possibile verificarne lo sviluppatore» o
   simile). Via d'uscita: Impostazioni di Sistema › Privacy e sicurezza › «Apri comunque»
   (su macOS 15 il tasto destro › Apri non basta più). **Windows**: SmartScreen «PC protetto
   da Windows» → «Ulteriori informazioni» › «Esegui comunque». Testi dei dialoghi di sistema
   = conoscenza generale, **non nel repo** (vedi §8).
4. Finestra «MappAI» 1280×800 con il **velo scuro dello sblocco**: icona, «MappAI», «Il
   software è bloccato e legato a questo dispositivo.», l'ID in grande (`#machine-id-display`).
5. Clic su **«Copia ID»** (icona copia, diventa una spunta verde per 2 s) → incollare nell'email
   a Giacomo.
6. Arriva il codice → incollarlo in **«INSERISCI SBLOCCO»** → **«Sblocca Software»** (o Invio).
   Sbagliato: «Codice di sblocco errato per questo dispositivo.» e la scatola «trema»
   (`scale-95` per 150 ms, `:419-421`). Giusto: il velo svanisce in 0,5 s.
7. Sotto c'è già **«Benvenuto in MappAI! · Welcome!»**: lasciare Italiano / «Come
   l'interfaccia» → **«Inizia · Start»**.
8. Dopo 1,5 s dal caricamento compare **«Organizza i documenti di MappAI»** → consigliare
   **«Scegli la posizione»** (altrimenti «Più tardi» e non torna più; si fa dalla Cabina).
9. Si vede la landing CREA (a-landing-crea). In `Documenti/` è già nata la cartella vuota
   (`MappAI - Vault` o `MappAI - file/Mappe`).
10. Prima di generare: la chiave Google → Cabina (e-cabina); senza chiave la generazione si
    ferma col toast (a-landing-crea).

## 5. Prerequisiti e stati — tabella Mac / Windows

| | Mac | Windows |
|---|---|---|
| File da installare | `.dmg` (due: Apple Silicon / Intel) | `.exe` NSIS |
| Sistema minimo | macOS 12 Monterey | Windows 10 |
| Avviso di sicurezza | Gatekeeper (app non firmata, non notarizzata) | SmartScreen (non firmata) |
| Chiudere la finestra | l'app resta aperta nel Dock (`main.js:305-309`) | l'app esce |
| Menu in alto | barra menu Electron in inglese | menu nella finestra (default Electron), inglese |
| Foto HEIC/TIFF da iPhone in «Documenti» | convertite con `/usr/bin/sips` (`main.js:686`) | **rifiutate**: «Questo formato si converte solo su macOS.» + «Salva la foto come JPG o PNG e ricaricala.» (`main.js:677-681`, `visione-core.js:347-349`); JPG/PNG passano senza ridimensionamento |
| «Apri nel Finder» (etichette, tooltip) | apre il Finder | **dice ancora «Finder»** ma apre Esplora file: nessun `process.platform` nel renderer (`grep` su `public/js/mappai-*.js` → solo `mappai-errori.js:283` per la diagnostica) e `preload.js` non espone la piattaforma; `shell.openPath` è multipiattaforma (`main.js:871, 994…`) |
| «Cestino» / eliminazioni | `shell.trashItem` → Cestino (`main.js:1016, 1126`) | stessa API → Cestino di Windows (API Electron multipiattaforma; **non provato**) |
| Stampa → PDF | `webContents.printToPDF` (`main.js:928`) — multipiattaforma | idem |
| Nomi di cartelle/file | `safeName` toglie `/ \ : * ? " < > \|` e punto/spazio finale — pensato «su macOS/Windows» (`files-core.js:55-62`) | idem; il separatore «·» nei nomi sessione è lecito su NTFS |
| Dati dell'app | `~/Library/Application Support/mappai/` | `%APPDATA%\mappai\` (non verificato) |
| Documenti | `~/Documents/MappAI - …` (`app.getPath('documents')`, `main.js:223`) | `C:\Users\<nome>\Documents\MappAI - …` |
| Reinstallazione / versione nuova | sostituire `MappAI.app`: Application Support **resta** → chiavi, sblocco, profili, classi in localStorage **sopravvivono**; in più `adottaRootEsistente` ritrova la cartella madre (`main.js:251-289`) | reinstallare sopra: electron-builder NSIS di default **non cancella** AppData alla disinstallazione (`deleteAppDataOnUninstall` = false) — per documentazione, non verificato |
| Linux | AppImage (funzionante a giugno) | — |

Stati «manca qualcosa»:
- Senza sblocco: tutto coperto dal velo scuro; nessun tooltip, nessun «perché» oltre al
  testo del velo.
- Senza rete: nessun messaggio all'avvio; emoji di sistema, formule grezze, AI fallisce alla
  chiamata.
- Nel browser (non Electron): l'ID diventa `WEB-MODE-xxxxxxxx` casuale (`index.html:387`) e
  lo sblocco non è raggiungibile con un codice «vero»; lo schermo si salta solo su Capacitor
  (`:366-372`).

## 6. NON ESISTE

| Atteso | Prova |
|---|---|
| Pagina di download sul sito | `insegnai.ch/mappai.html` letto il 22/8/26: «Coming soon», solo `mailto:` |
| Aggiornamento automatico / «Controlla aggiornamenti» | `grep -n autoUpdater main.js` → vuoto; nessuna dipendenza updater |
| Firma e notarizzazione Mac / firma Windows | nessun `build/`, nessun `notarize`/`identity`/`hardenedRuntime` in `package.json` |
| Icona personalizzata nel Dock/Start | nessun `icon` in `build`; `MappAI_icon.png` è usata solo dentro l'HTML (`index.html:337`) |
| Mappa dimostrativa al primo avvio | `public/vault_demo/` non esiste (`ls` → errore; tolta in `ff1e497`); `loadDemoGraph` (`vault-io.js:232`) non ha nessun chiamante (`grep "loadDemoGraph("` → solo la definizione) |
| Avviso «sei offline» | `grep navigator.onLine public/js/mappai-*.js app.js` → vuoto |
| Menu dell'app in italiano | nessun `Menu` importato (`main.js:1`) |
| Etichetta «Esplora file» su Windows | `grep -n "Esplora\|Explorer" public/js/mappai-*.js` → solo il gioco (`mappai-games.js`) e il titolo nascosto «Esplora i tuoi Vault» (`index.html:1963`) |
| Requisito di RAM/CPU dichiarato | nessuna stringa nel repo |
| Schermata «Benvenuto» con tour guidato | l'unico onboarding è il modale lingue (`storage-lang.js:804`) + il prompt cartelle (`files-settings.js:126`) |
| Launcher «MappAI / Studio» all'avvio | spento di default: `legacyLauncher` solo da `mappai-settings.json` (`main.js:166-172`) |
| Motore AI locale da installare (Ollama) | tolto il 20/8 (`main.js:640-642`, HANDOFF:137, 1955 «nessun programma da installare») |

## 7. Parole da NON usare con i docenti

| Gergo | Nella guida |
|---|---|
| Electron, Chromium, renderer/main | «l'app» (mai il motore) |
| DMG / NSIS / installer | «il file di installazione per Mac» / «per Windows» |
| arm64 / x64, Apple Silicon / Intel | «Mac con chip Apple (M1, M2, M3, M4)» / «Mac con chip Intel» — «lo leggi in Mela › Informazioni su questo Mac» |
| Gatekeeper / notarizzazione / firma | «l'avviso di sicurezza del Mac» — «è normale: l'app non è ancora registrata presso Apple» |
| SmartScreen | «l'avviso blu di Windows» |
| userData / Application Support / AppData / localStorage | «la memoria interna dell'app» (distinta da «le tue cartelle in Documenti») |
| ID Macchina / hash / sale | «il codice del tuo computer» (già in e-cabina) |
| CDN / webfont | «scaricato da internet al volo» |
| KaTeX / LaTeX | «le formule di matematica» |
| Noto Color Emoji | «le faccine a colori» |
| HEIC / TIFF / sips | «le foto dell'iPhone nel formato originale» — «su Windows salvale come JPG» |
| `shell.trashItem` | «va nel Cestino, non si cancella davvero» |
| vault | «la cartella della mappa» (g-disco) |
| first-run / onboarding | «la prima apertura» |
| kill-switch / flag | non nominarli: per il docente non esistono |
| Finder (su Windows) | «la cartella sul computer» — la guida deve avvertire che il bottone dice «Finder» anche su Windows |

## 8. Dubbi (non verificati)

1. **Testo esatto dei dialoghi di sistema** (Gatekeeper, SmartScreen, la finestra del DMG, le
   schermate NSIS): non sono nel repo; vanno fotografati su un Mac e un PC veri. Su macOS 15
   l'unica via per un'app non firmata è Impostazioni › Privacy e sicurezza › «Apri comunque».
2. **L'app non firmata su Apple Silicon si avvia davvero?** `NEXT_SESSION_PROMPT.md:57` dice
   «testato funzionante» per l'arm64 di giugno; con Electron 39 non è stato ricostruito nulla
   (`dist/` vuota). Prima della guida serve una build nuova e una prova su un Mac «pulito».
3. **Nome della cartella dati in produzione**: `mappai` (da `name`) o `MappAI` (se
   electron-builder riscrive `productName` nel `package.json` impacchettato)? Su Mac è
   indifferente (FS case-insensitive; la cartella esiste ed è condivisa con `dev/`); su
   Windows idem in pratica. Non ho un `MappAI.app` installato per leggerlo (`/Applications`
   → nessuno).
4. **Comportamento Windows** in toto (Cestino, Esplora file, stampa, percorsi AppData,
   disinstallazione che conserva i dati): tutto dedotto dalle API multipiattaforma e dalla
   documentazione electron-builder 24.13.3, mai eseguito su Windows.
5. **Stabilità dell'ID Macchina** su portatili con più schede di rete (ordine di
   `os.networkInterfaces()`): il codice prende la prima con MAC non nullo; un cambio di
   dock/adattatore potrebbe cambiarlo. Da provare.
6. **Peso reale** dell'installer attuale: 258 MB è di giugno; con `node-llama-cpp` fuori
   dall'asar e `three.js` potrebbe essere di più.
7. **Linux**: AppImage mai riprovato dopo giugno; i `.deb` erano vuoti. Non promettere Linux
   nella guida (il sito lo nomina).
8. **`[EMAIL_ADDRESS]`** nel testo italiano dello sblocco (`it_translations.js:207`): a
   schermo il docente legge letteralmente «a [EMAIL_ADDRESS]»? e-cabina lo segnala come
   sovrascrittura di `changeLanguage`; da confermare con uno screenshot e da correggere
   prima della guida.
