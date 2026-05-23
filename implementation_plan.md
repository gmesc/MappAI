# Piano di Implementazione - Progettazione della Skill build-mappai-apps

Questo piano descrive la progettazione e la struttura della nuova skill **build-mappai-apps**, progettata per automatizzare il checkout dei branch git, la sincronizzazione degli asset e la compilazione/installazione delle applicazioni MappAI Studente e Docente su iPadOS.

## Proposta di Design della Skill

### 1. Nome e Descrizione (YAML Frontmatter)
* **Name**: `build-mappai-apps`
* **Description**: "Automates checkouts, synchronization, and Xcode builds for MappAI Student and Teacher apps on connected iPad targets, logging errors to Xcode reports."

### 2. Struttura delle Cartelle
I file della skill saranno organizzati come segue:
* **Directory principale**: `/Users/giacomomeschini/.gemini/config/plugins/modern-web-guidance-plugin/skills/build-mappai-apps/`
* **File principali**:
  - `SKILL.md`: Documento di istruzioni per l'agente che descrive quando e come invocare la skill.
  - `scripts/build_apps.py`: Script Python che gestisce l'intero workflow di build e la cattura degli errori.

---

### 3. Modifiche Proposte

#### [NEW] [SKILL.md](file:///Users/giacomomeschini/.gemini/config/plugins/modern-web-guidance-plugin/skills/build-mappai-apps/SKILL.md)
Documento markdown che definisce i trigger della skill (es. quando l'utente scrive "lancia le build") e istruisce l'agente a eseguire lo script di automazione.

#### [NEW] [build_apps.py](file:///Users/giacomomeschini/.gemini/config/plugins/modern-web-guidance-plugin/skills/build-mappai-apps/scripts/build_apps.py)
Script Python che automatizza la build in modo sicuro:
1. **Preservazione dello Stato**: Rileva il branch corrente ed esegue `git stash` se ci sono modifiche locali non committate.
2. **Build Studente (ramo `MappAI_iPad_studente`)**:
   - Sposta il workspace sul branch `MappAI_iPad_studente`.
   - Esegue la build/run sul target iPad: `npx cap run ios --target <device-id> --scheme "MappAI Studente"`.
   - In caso di errore, cattura l'output della console, crea il file `Xcode report GG-MM-AAAA.md` nella root del progetto, ripristina il branch originario, esegue `git stash pop` ed esce con codice d'errore.
3. **Build Docente (ramo `MappAI_iPad`)**:
   - Sposta il workspace sul branch `MappAI_iPad`.
   - Esegue la build/run sul target iPad: `npx cap run ios --target <device-id> --scheme MappAI`.
   - In caso di errore, cattura l'output, genera il report `Xcode report GG-MM-AAAA.md`, ripristina il branch originario, esegue `git stash pop` ed esce.
4. **Finalizzazione**: Ripristina il branch di partenza ed esegue `git stash pop` per ripristinare lo stato esatto del workspace.

---

### 4. Strategia di Gestione degli Errori e Rate Limiting
- **Rate Limiting**: Non applicabile (nessuna chiamata API esterna).
- **Error Handling**: In caso di errore di `xcodebuild` o di Capacitor, lo stderr/stdout viene catturato e riversato nel file `Xcode report GG-MM-AAAA.md` con l'ora esatta e i dettagli del compiler, garantendo che lo stato di git non rimanga corrotto.

---

## Piano di Verifica

### Test della Skill
1. Invocare l'agente scrivendo "lancia le build".
2. Verificare che l'agente esegua correttamente la build per entrambe le app.
3. Simulare un errore di build (es. introducendo una sintassi errata nel Podfile o in un file nativo) e verificar la generazione del file `Xcode report GG-MM-AAAA.md` nella root.
