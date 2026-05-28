# Piano di Implementazione: Build Desktop, Sincronizzazione Frontend e Build iPad

Questo piano descrive i passi per salvare le modifiche correnti del frontend, creare gli installer desktop per Windows, macOS (Intel e Apple Silicon) e Linux, distribuire il nuovo frontend su tutti i branch del repository (`MappAI_main`, `MappAI_studente`, `MappAI_iPad`, `MappAI_iPad_studente`, `global`), compilare le applicazioni per iPad e pubblicare tutti gli aggiornamenti su Origin.

## User Review Required

> [!IMPORTANT]
> - La creazione dell'installer Windows (`nsis`) su macOS tramite `electron-builder` potrebbe richiedere la presenza di `wine` sul sistema. Se non è installato, tenteremo la compilazione o verificheremo la disponibilità.
> - Prima di effettuare i merge, verificheremo le differenze chiave tra i branch per non sovrascrivere configurazioni specifiche (come `studentMode` in `app.js`).
> - La build per iPad richiede il dispositivo sbloccato e collegato al Mac.

## Proposed Changes

### 1. Salvataggio e Preparazione Frontend
- Commit delle modifiche locali correnti sul branch `MappAI_iPad_studente`.
- Porting temporaneo delle modifiche sul branch desktop principale (`MappAI_main`) per garantire che gli installer desktop abbiano l'ultimo frontend.

### 2. Creazione Installer Desktop
- Esecuzione di `electron-builder` per compilare gli installer locali:
  - macOS (Universal o dmg per arm64 e x64)
  - Windows (nsis exe)
  - Linux (AppImage, deb)
- Gli installer verranno generati nella cartella [dist](file:///Users/giacomomeschini/Antigravity/MappAI/dist).

### 3. Sincronizzazione Git su tutti i branch
- Sincronizzazione ordinata del nuovo frontend (`index.html`, `style.css`, `app.js`, `it_translations.js`) sui seguenti rami:
  - `MappAI_main` (Docente Desktop)
  - `MappAI_studente` (Studente Desktop)
  - `MappAI_iPad` (Docente iPad)
  - `MappAI_iPad_studente` (Studente iPad)
  - `global` (Global)
- Push di tutti i branch su GitHub.

### 4. Compilazione e Installazione App iPad
- Esecuzione dello script `build_apps.py` per installare le app Docente e Studente sull'iPad target (`00008027-00112588012B002E`).

## Verification Plan

### Automated Tests
- Verifica della presenza dei file di installazione compilati nella cartella `dist/`.
- Esecuzione di `build_apps.py` e verifica del file `build_result.json`.

### Manual Verification
- Avvio degli installer desktop compilati per testarne il funzionamento con il nuovo frontend.
- Verifica visiva delle app sul dispositivo iPad.
