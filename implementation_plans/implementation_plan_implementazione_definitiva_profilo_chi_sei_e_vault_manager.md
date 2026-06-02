# Implementazione Definitiva: Profilo "Chi Sei" e Vault Manager

Questo piano recepisce i tuoi ultimi feedback, espandendo l'architettura per includere la gestione avanzata dei Vault e definendo la strategia per mantenere allineato il Fork internazionale.

## Risposte alle tue domande strategiche

> [!TIP]
> **Come aggiornare l'architettura di entrambe le versioni contemporaneamente?**
> Non c'è bisogno di gestire due progetti fisicamente separati che diventerebbero un incubo da mantenere! Useremo la potenza di **Git Branches**. 
> - Lavoreremo sempre sul ramo principale (`main`) in Italiano.
> - Creeremo un ramo parallelo chiamato `global` per la versione USA/UK.
> - Quando svilupperemo una nuova funzione fantastica su `main`, basterà lanciare un comando (es: `git checkout global` e `git merge main`) e l'architettura della versione Global si aggiornerà istantaneamente importando le novità, mantenendo però le sue traduzioni e i suoi prompt intatti!

## Proposed Changes

### 1. Il Profilo Studente "Chi Sei"
#### [MODIFY] `public/index.html`
- Aggiunta del quarto bottone **"Chi sei"** nella card di avvio. Impaginazione a griglia 2x2 compatta, stile sfondo bianco con testo viola, hover a colori invertiti (sfondo viola, testo bianco).
- Creazione della Modale "Chi Sei". Campi:
  - **Nickname** (Testo)
  - **Età** (Numero)
  - **Classe Frequentata** (Testo)
  - **Sistema Scolastico** (Select: "Scuola dell'obbligo del Canton Ticino", "Scuola dell'obbligo Italiana"). *(Niente USA per questa versione).*
- Pulsante di Reset con validazione di sicurezza (richiede di scrivere "elimina il mio profilo").

#### [MODIFY] `public/js/app.js` e `main.js`
- Salvataggio del profilo globale in `localStorage`.
- Quando viene generata o unita una mappa, il profilo viene salvato all'interno del Vault in `index.yaml` (es. `nickname: Giacomino`, `age: 10`, `system: Ticino`).
- Iniezione dinamica del profilo nel System Prompt di Gemini in fase di scraping, generazione e tutoraggio.

### 2. Esploratore Vault Intelligente (Nuova Funzione)
Invece di usare la noiosa finestra del sistema operativo che costringe a cercare a caso tra le cartelle, creeremo un **Vault Manager Interno**.

#### [MODIFY] `main.js` (Backend)
- Nuovo handler IPC `get-all-vaults` che legge automaticamente la cartella `Documenti/Salvataggi MappAI`.
- Scansionerà ogni sottocartella, leggerà al volo il file `index.yaml` ed estrarrà: Nome cartella, Etichetta radice, Nickname dell'allievo, Età, e Data di salvataggio.

#### [MODIFY] `public/index.html` e `public/js/app.js` (Frontend)
- Modifica del bottone "Progetti Recenti" sulla Landing Page: invece di mostrare una lista semplice, aprirà la **Modale Esplora Vault**.
- La modale mostrerà una griglia/lista elegante e ordinata dove ogni Vault salvato apparirà come una "Card" contenente:
  - 📂 **Titolo del Progetto**
  - 👤 **Allievo:** Nickname (Età, Classe)
  - 📅 **Data ultimo salvataggio**
- Basterà cliccare su una card per ricaricare istantaneamente quel Vault, ricalibrando MappAI per quello specifico allievo!

---

## Verification Plan
1. **Configurazione "Chi Sei":** Inserire un Nickname, Età e Sistema. Verificare l'inversione cromatica dei 4 bottoni.
2. **Persistenza Vault:** Salvare una mappa e ispezionare il file `index.yaml` su disco per accertarsi che i campi (nickname, age) siano salvati.
3. **Esplora Vault:** Cliccare su "Progetti Recenti" e verificare che la modale mostri i Vault esistenti con i relativi nomi utente e date. Cliccare per aprire la mappa con successo.
