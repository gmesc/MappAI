# Piano di Implementazione - Skill check-ipad-compatibility

Questo piano descrive come creare la nuova skill agente `check-ipad-compatibility` per analizzare il work tree git locale e identificare problemi di compatibilità con iPadOS (Capacitor/iOS).

## User Review Required

> [!IMPORTANT]
> La skill sarà installata come parte del plugin `modern-web-guidance-plugin` sul sistema. Richiederà i permessi di scrittura nella cartella del plugin (`/Users/giacomomeschini/.gemini/config/plugins/modern-web-guidance-plugin`).
> Lo script eseguirà `git diff` nella cartella di lavoro corrente per determinare quali file sono stati modificati e scansionarli.

## Proposed Changes

### [Plugin: modern-web-guidance-plugin]

#### [NEW] [SKILL.md](file:///Users/giacomomeschini/.gemini/config/plugins/modern-web-guidance-plugin/skills/check-ipad-compatibility/SKILL.md)
Definizione formale della skill con metadati YAML, modalità d'uso, limitazioni note di iPadOS documentate per l'agente e istruzioni per l'integrazione del tool.

#### [NEW] [check_compatibility.py](file:///Users/giacomomeschini/.gemini/config/plugins/modern-web-guidance-plugin/skills/check-ipad-compatibility/scripts/check_compatibility.py)
Script Python che automatizza la scansione delle modifiche nel work tree git. Cerca incompatibilità note di iPadOS come:
1. Utilizzo di API di Electron (`window.electronAPI`, `ipcRenderer`, ecc.)
2. Importazione di moduli Node.js nativi (`fs`, `path`, `child_process`, ecc.)
3. Chiamate sincrone del file system (`fs.readFileSync`, `fs.writeFileSync`)
4. Percorsi assoluti o specifici per desktop (es. `/Users/`, `C:\\`)
5. Eventi mouse-only senza controparte touch (es. `contextmenu`, `dblclick`, `mouseover` senza gestori touch/gesture)
6. Mancanza di controlli preventivi sulla piattaforma prima di usare funzioni desktop

Lo script genererà un report dettagliato in formato Markdown chiamato `ipad_compatibility_report.md` nella root del workspace dell'utente.

## Verification Plan

### Automated Tests
- Esecuzione dello script `check_compatibility.py` su un set di modifiche di prova.
- Validazione che lo script generi correttamente il report `ipad_compatibility_report.md` con l'elenco dei file modificati e le violazioni riscontrate.

### Manual Verification
- Invocazione della skill chiedendo all'agente: `"Esegui check-ipad-compatibility"`.
- Controllo del report Markdown risultante.
