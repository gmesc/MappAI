# Refactoring Architettura CSS e Nomenclatura Classi

Il CSS attuale di MappAI presenta classi ridondanti, tag sovrapposti per le aree di testo, e una nomenclatura non sempre logica. L'obiettivo di questo piano è districare questa matassa creando un sistema logico, semantico e scalabile.

## User Review Required

Questo è un piano in più step. Il passo più importante richiede il tuo intervento sul documento di mappatura che andremo a creare. Solo quando sarai soddisfatto dei "nuovi nomi" proposti, procederemo con l'aggiornamento simultaneo dei file HTML e CSS.

## Proposed Changes

### 1. Estrazione e Mappatura (Fase Analitica)
Creerò un nuovo artefatto chiamato `css_mapping.md`. Analizzando il file `index.html` e `style.css` estrarremo:
- I gruppi logici dell'interfaccia (es. Sidebar, Form, Modali, Mappa).
- Le classi CSS attualmente assegnate a ciascun testo o componente.
- Una proposta per il **Nuovo Nome Classe Logico** (es. da un generico `.text-sm .font-bold` a un più semantico `.sidebar-action-text` oppure da `.text-[40px]` a `.landing-hero-title`).

### 2. Revisione Condivisa (Fase Interattiva)
Potrai leggere il file `css_mapping.md` direttamente negli artefatti della chat. Insieme potremo:
- Discutere e approvare i nuovi nomi.
- Suggerire modifiche (es. "Chiamiamo questo `.sidebar-title` invece di `.nav-header`").
- Sfoltire la lista accorpando più elementi sotto una singola classe logica (es. `.app-subtitle`).

### 3. Allineamento HTML e CSS (Fase di Esecuzione)
Una volta approvata la mappa delle classi:
- **[MODIFY]** `public/index.html`: Sostituirò i vecchi nomi delle classi disordinati con i nuovi nomi logici.
- **[MODIFY]** `public/css/style.css`: Aggiornerò tutti i selettori CSS per farli corrispondere ai nuovi nomi, ripulendo eventuali classi duplicate o regole orfane.

## Verification Plan

### Automated Tests
- Verifica integrità CSS.
- I configuratori tipografici (`index_font_style_config.html` e `map_font_config.html`) verranno aggiornati con le nuove classi pulite per continuare a fare i test.

### Manual Verification
- Test visivo completo dell'applicazione per assicurarsi che i font, le dimensioni, i margini e i colori siano rimasti identici (nessuna regressione visiva), ma con un codice sorgente profondamente ristrutturato.
