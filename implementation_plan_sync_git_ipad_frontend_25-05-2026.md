# Piano di Implementazione: Sincronizzazione Frontend e Build iPad

Questo piano descrive i passi per salvare le modifiche correnti del frontend sul branch `MappAI_iPad_studente`, portarle sugli altri branch del repository (`MappAI_iPad`, `MappAI_main`, `MappAI_studente`, `global`), compilare le applicazioni per iPad e pubblicare tutti gli aggiornamenti su Origin.

## User Review Required

> [!IMPORTANT]
> - Prima di unire i rami, identificheremo le differenze chiave tra le versioni Docente e Studente (come la variabile `studentMode` in `app.js` e la visibilità del pannello di sblocco nell'HTML) per assicurarci di non sovrascriverle.
> - La build per iPad richiede che il dispositivo sia sbloccato e collegato fisicamente al Mac.

## Proposed Changes

### Sincronizzazione Git

#### [MODIFY] [MappAI_iPad_studente](file:///Users/giacomomeschini/Antigravity/MappAI)
- Commit delle modifiche locali correnti su `MappAI_iPad_studente`.

#### [MODIFY] [MappAI_iPad](file:///Users/giacomomeschini/Antigravity/MappAI)
- Checkout su `MappAI_iPad`.
- Unione delle modifiche di frontend salvaguardando le configurazioni specifiche per il Docente (`studentMode: false`).

#### [MODIFY] [MappAI_studente](file:///Users/giacomomeschini/Antigravity/MappAI)
- Checkout su `MappAI_studente`.
- Unione delle modifiche di frontend salvaguardando le configurazioni specifiche dello Studente.

#### [MODIFY] [MappAI_main](file:///Users/giacomomeschini/Antigravity/MappAI)
- Checkout su `MappAI_main`.
- Unione delle modifiche di frontend salvaguardando le configurazioni Docente Desktop.

#### [MODIFY] [global](file:///Users/giacomomeschini/Antigravity/MappAI)
- Allineamento del branch `global` con le ultime novità stabili del frontend.

### Compilazione App iPad (Docente & Studente)

#### [BUILD] [iPad Build Script](file:///Users/giacomomeschini/Antigravity/MappAI)
- Esecuzione dello script di build della skill `build-mappai-apps` per compilare e installare le app Docente e Studente sull'iPad target (`00008027-00112588012B002E`).

### Push dei Repository

#### [PUSH] [Git Push all branches](file:///Users/giacomomeschini/Antigravity/MappAI)
- Push di tutti i branch aggiornati (`MappAI_iPad_studente`, `MappAI_iPad`, `MappAI_main`, `MappAI_studente`, `global`) su GitHub.

## Verification Plan

### Automated Tests
- Esecuzione dello script `build_apps.py` e verifica del file di output `build_result.json`.

### Manual Verification
- Controllo visivo dell'avvio delle applicazioni Docente e Studente sull'iPad collegato.
