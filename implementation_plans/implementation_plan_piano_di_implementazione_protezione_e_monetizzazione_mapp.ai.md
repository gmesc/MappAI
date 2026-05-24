# Piano di Implementazione: Protezione e Monetizzazione Mapp.AI

L'obiettivo è proteggere l'app dalla distribuzione gratuita non autorizzata e incoraggiare l'acquisto della licenza (10€), permettendo comunque agli utenti di provare il software (Versione Demo).

Essendo Mapp.AI un'app desktop basata su Electron, bisogna tenere a mente una regola d'oro: **nessuna protezione offline al 100% è inviolabile** (un programmatore esperto potrebbe scompattare l'app). Tuttavia, per un prodotto da 10€, un **"lucchetto onesto"** (che fermi il 99% degli utenti comuni) è la soluzione ideale per bilanciare sicurezza, costi e semplicità.

Ecco 3 diverse strategie. Leggile attentamente e dimmi quale preferisci adottare.

---

## Opzione 1: Il "Lucchetto Semplice" (Offline Key) - *Più facile e gratuita*

Questa soluzione non richiede alcun server o abbonamento a piattaforme terze. Creiamo un algoritmo segreto dentro l'app che verifica se un codice inserito è valido.

*   **Come funziona**:
    *   L'utente scarica l'app gratuitamente (Versione Demo).
    *   Può effettuare esattamente **3 generazioni AI** (teniamo il conto salvandolo nella memoria dell'app).
    *   Alla quarta generazione, compare un modale "Sblocca Mapp.AI PRO" che richiede un Codice di Accesso.
    *   Tu generi manualmente una lista di codici (es. `MAPP-2026-X7B9K`) seguendo una regola matematica segreta e li invii a chi ti paga (tramite PayPal, Satispay, ecc.).
    *   L'app verifica offline se il codice rispetta la regola matematica. Se sì, sblocca l'app per sempre.
*   **Pro**: 0 costi di gestione, nessuna connessione internet richiesta per l'attivazione, implementazione rapidissima.
*   **Contro**: Gestione manuale delle vendite (devi mandare tu i codici a mano quando ricevi un pagamento). Un utente furbo potrebbe disinstallare e reinstallare l'app per resettare il contatore delle 3 prove (ma è noioso da fare).

## Opzione 2: Piattaforma di Vendita Automatica (Es. Gumroad o LemonSqueezy) - *Professionale e Consigliata*

Ti affidi a una piattaforma specializzata nella vendita di software. Tu carichi l'app lì e decidi il prezzo (10€).

*   **Come funziona**:
    *   L'utente compra l'app su Gumroad.
    *   Gumroad gestisce il pagamento (carte, PayPal, Apple Pay), emette fattura, e genera automaticamente una **License Key unica** per quell'utente.
    *   L'app si avvia in versione Demo (3 generazioni). Per sbloccarla, l'utente inserisce la License Key fornita da Gumroad.
    *   Mapp.AI si connette *una sola volta* a internet, "chiede" ai server di Gumroad se la chiave è vera e non è stata usata da troppe persone, e se lo è, sblocca l'app.
*   **Pro**: Tutto 100% automatico. Non devi gestire pagamenti o invio codici. Gumroad previene che una singola chiave venga usata su 100 computer diversi (puoi impostare un limite di dispositivi per chiave).
*   **Contro**: Gumroad trattiene una piccola commissione sulle vendite (circa 10% + 30 cent). Richiede connessione a internet per il momento dell'attivazione.

## Opzione 3: Account e Server Proprietario (Online Mode) - *Massima Sicurezza*

Questa è la strada che avevi intrapreso con `Mappatore ONLINE v2`.

*   **Come funziona**:
    *   Mapp.AI all'avvio richiede una combinazione di Email e Password.
    *   Si collega a un tuo server backend (es. Python/FastAPI) che contiene un database degli utenti paganti.
*   **Pro**: Sicurezza assoluta, impossibile piratare l'app. Possibilità di gestire abbonamenti mensili anziché pagamento una-tantum.
*   **Contro**: Molto lavoro da fare (login, gestione password perse, database). Richiede di mantenere un server acceso H24 (che ha un costo mensile).

---

> [!IMPORTANT]
> **Modifiche Tecniche Condivise per l'Implementazione (Fase 1)**
> A prescindere dal metodo di validazione (Opzione 1 o 2), ecco i passaggi tecnici che faremo nel codice:
> 
> 1.  **Contatore Generazioni (`app.js`)**: Creeremo una variabile in `localStorage` (es. `mapp_demo_count`). Ogni chiamata a Gemini incrementerà il contatore.
> 2.  **Modale Paywall (`index.html`)**: Creeremo un bellissimo modale con animazioni che spiega i vantaggi della versione PRO e contiene il campo di input per la chiave di sblocco.
> 3.  **Blocco Logico**: Modificheremo le funzioni `generateGlobalFlashcards` e la creazione dei nodi per interrompersi e mostrare il modale se `mapp_demo_count >= 3` e la licenza non è attiva.

## Domande Aperte per l'Utente
1. Quale delle 3 Opzioni preferisci? (Per un'app desktop indipendente da 10€, ti **consiglio vivamente l'Opzione 2 con Gumroad** per automatizzare le vendite ed evitare mal di testa, oppure l'**Opzione 1** se vuoi gestire i pagamenti a mano e avere i soldi puliti subito).
2. Vuoi che il blocco (dopo 3 usi) avvenga *solo* per le generazioni AI (Lasciando l'app gratuita per disegnare mappe manualmente) o vuoi bloccare proprio tutto l'uso dell'app?
