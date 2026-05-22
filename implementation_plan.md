# Piano di Implementazione - Correzione Zoom Control Card, Menu Uscita e Restrizioni Studente Unificate su iPad

Questo piano descrive le modifiche per risolvere i problemi di layout su iPadOS e unificare la gestione della modalità studente tramite lo stato dinamico `appState.studentMode`.

## Note del Docente e Decisioni di Design

1. **Unificazione del Codice**: Invece di mantenere due rami con strutture HTML e JS divergenti, utilizzeremo una base di codice unificata in cui lo stato `appState.studentMode` controlla dinamicamente la visibilità e le interazioni di tutti gli elementi AI e di caricamento.
   - Il branch studente (`MappAI_iPad_studente`) inizializzerà `studentMode: true`.
   - Il branch docente (`MappAI_iPad`) inizializzerà `studentMode: false`.
   - La combinazione speciale di tasti `CTRL + SHIFT + L + K + J + H` consentirà di attivare/disattivare dinamicamente lo stato della modalità (con feedback tramite toast).
2. **Landing Page per Studente**:
   - Vengono nascosti tutti i moduli di upload di fonti e generazione automatica tramite AI (il form `#setup-form`).
   - Restano visibili e perfettamente funzionanti le azioni veloci per creare un "Nuovo Progetto" manuale, "Apri Vault (Second Brain)" e "Importa JSON" per caricare mappe condivise dal docente.
   - Il bottone "Setup" (`#btn-config-ai`) rimarrà visibile, ma se cliccato in modalità studente mostrerà un toast indicando che la configurazione AI non è disponibile.
3. **Funzioni AI all'interno dell'app (Nascoste in Modalità Studente)**:
   - Il pannello e il tab del **Tutor AI Globale** in sidebar (`#sidebar-tab-tutor`).
   - La sezione **Tutor AI del Nodo** all'interno del visualizzatore dettagli nodo (modale `openSourceModal`).
   - I bottoni per la generazione automatica di materiale di studio ("Genera Flashcard Mappa", "Genera Quiz Mappa").
   - Le opzioni relative all'AI nel menu contestuale dei nodi ("Espandi con IA", "Flashcard Nodo/Ramo", "Quiz Nodo/Ramo").
4. **Layout Menu Uscita (`#floating-actions-menu`)**:
   - Nessun uso di parentesi quadre `[]` nel testo visibile dei pulsanti.
   - Layout orizzontale pulito e standardizzato `ICONA TESTO` (es. `<i data-lucide="file-text" class="w-4 h-4"></i> Esporta Appunti`).
   - Utilizzo di colori pastello solidi per facilitare l'individuazione:
     - **Esporta Appunti**: Verde pastello (`bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200`)
     - **Esporta nel Vault**: Viola scuro solido (`bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-700`)
     - **Importa dal Vault**: Azzurro pastello (`bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200`)
     - **Sincronizza Vault**: Celeste pastello (`bg-cyan-100 text-cyan-800 border-cyan-300 hover:bg-cyan-200`)
     - **Salva Layout Snapshot**: Grigio pastello (`bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200`)
     - **Unisci Mappe**: Giallo pastello (`bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200`)
     - **Torna alla Home**: Rosa/Rosso pastello (`bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200`)

---

## Proposed Changes

### [Componente Web UI - Codice Unificato]

#### [MODIFY] [index.html](file:///Users/giacomomeschini/Antigravity/MappAI/public/index.html)
- Rimuovere la classe `hidden` e l'attributo `style="display: none !important;"` impostati staticamente su `#btn-config-ai`, `#sidebar-tab-tutor`, `#sidebar-tab-study` (pulsanti di generazione). Sarà la funzione `applyStudentModeUI()` a gestirne dinamicamente la visibilità.
- Assegnare IDs ai bottoni di generazione in modo da poterne controllare la visibilità:
  - Bottone "Genera Flashcard Mappa" -> `id="btn-generate-flashcards"`
  - Bottone "Genera Quiz Mappa" -> `id="btn-generate-quiz"`
- Riorganizzare i pulsanti all'interno di `#floating-actions-menu`:
  - Rimuovere l'SVG inline di "Esporta Appunti" e rimpiazzarlo con `<i data-lucide="file-text" class="w-4 h-4"></i>`.
  - Impostare i testi corretti (es. `Esporta Appunti`, `Esporta nel Vault`, `Importa dal Vault`, `Sincronizza Vault`, `Salva Layout Snapshot`, `Unisci Mappe`, `Torna alla Home`) senza parentesi quadre.
  - Applicare le classi CSS pastello definite sopra a ciascun bottone.

#### [MODIFY] [app.js](file:///Users/giacomomeschini/Antigravity/MappAI/public/js/app.js)
- **Aggiornare `window.applyStudentModeUI()`**:
  - Nascondere/mostrare `#setup-form` in base ad `appState.studentMode`.
  - Configurare la visibilità di `#sidebar-tab-tutor`. Se il tab attivo è quello del tutor e passiamo a studentMode, forzare lo switch al tab `structure`.
  - Nascondere/mostrare i pulsanti `#btn-generate-flashcards` e `#btn-generate-quiz`.
  - Controllare che il pulsante `#btn-config-ai` sia sempre mostrato sulla landing page.
- **Aggiornare `window.showConfigAIModal()`**:
  - Aggiungere un controllo: se `appState.studentMode === true`, mostrare il toast di avviso `"Configurazione AI non disponibile nella versione studente"` ed uscire. Altrimenti, aprire regolarmente il modale.
- **Aggiornare `window.openSourceModal()` (Dettagli del Nodo)**:
  - Racchiudere la sezione HTML `<!-- --- SEZIONE TUTOR AI --- -->` in un controllo condizionale `if (!appState.studentMode) { ... }` in modo che il Tutor AI non venga renderizzato per gli studenti.
- **Aggiornare `window.handleNodeClick()`**:
  - Nascondere il bottone "Mettiti alla prova (Genera Quiz)" nella sidebar dei dettagli se `appState.studentMode === true`.
- **Aggiornare `window.showContextMenu()`**:
  - Filtrare dinamicamente le voci "Espandi con IA", "Flashcard Nodo/Ramo" e "Quiz Nodo/Ramo" nel menu contestuale dei nodi se `appState.studentMode === true`.

#### [MODIFY] [style.css](file:///Users/giacomomeschini/Antigravity/MappAI/public/css/style.css)
- **Zoom Map Control Card (`#map-control-card`)**:
  - Sotto `body.a11y-zoom-x15` e `body.a11y-zoom-x2`, aggiungere `flex-wrap: nowrap !important; overflow-x: auto !important;` per forzare lo scroll orizzontale e prevenire il wrap verticale.
  - Sotto le classi di zoom, includere selettori sia per `i` che per `svg` all'interno del `#map-control-card` per bloccare le icone a `18px` e i contenitori/pulsanti a dimensioni fisse in `px`.
- **Zoom Menu Uscita (`#floating-actions-menu`)**:
  - Sotto le classi di zoom (`a11y-zoom-x15`, `a11y-zoom-x2`), forzare `min-w-[280px] !important` (per x1.5) e `min-w-[340px] !important` (per x2).
  - Assicurarsi che i bottoni mantengano `white-space: nowrap !important` e il layout `flex flex-row items-center gap-3`.

---

## Verification Plan

### Manual Verification
1. **Student Mode Toggle**:
   - Utilizzare la combinazione di tasti `CTRL + SHIFT + L + K + J + H` per verificare che la modalità studente si attivi e disattivi correttamente con il toast di notifica.
2. **Landing Screen (Student Mode = true)**:
   - Verificare che il form `#setup-form` (caricamento file e setup AI) sia completamente nascosto.
   - Verificare che i pulsanti "Nuovo Progetto", "Apri Vault" e "Importa JSON" siano perfettamente visibili e cliccabili.
   - Verificare che il pulsante "Setup" (`#btn-config-ai`) sia visibile e che al click mostri il toast di avvertimento.
3. **In-App AI Features Restriction (Student Mode = true)**:
   - Aprire una mappa. Verificare che il tab della sidebar "Tutor AI" non sia visibile.
   - Selezionare un nodo. Verificare che non sia presente la sezione "Tutor AI del Nodo" e il bottone "Mettiti alla prova (Genera Quiz)".
   - Aprire la tab "Studio". Verificare che i bottoni di generazione flashcard e quiz mappa siano nascosti.
   - Fare click destro (o tap prolungato) su un nodo. Verificare che le voci "Espandi con IA", "Flashcard" e "Quiz" non appaiano nel menu contestuale.
4. **Zoom Map Control Card**:
   - Attivare lo zoom x1.5 e x2.
   - Verificare che la control card non vada a capo, ma resti orizzontale.
   - Verificare che le icone non si ingrandiscano in modo spropositato.
5. **Zoom Exit Menu**:
   - Aprire le azioni rapide (menu esci).
   - Verificare che ciascun bottone abbia un background pastello a tinta unita solida, layout orizzontale ICONA TESTO e nessun uso di parentesi quadre.
   - Attivare lo zoom x1.5 e x2 e verificare che il menu si allarghi correttamente in larghezza mantenendo i testi su un'unica riga leggibile.
