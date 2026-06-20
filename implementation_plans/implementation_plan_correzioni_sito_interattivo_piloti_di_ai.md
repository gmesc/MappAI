# Correzioni Sito Interattivo "Piloti di AI"

## Panoramica
Il progetto è un sito interattivo con mappa isometrica dove un personaggio si muove tra edifici che rappresentano i 4 capitoli del workshop. Il compito richiede 4 correzioni principali.

## Modifiche Proposte

### 1. Sfondo Isometrico (`iso_bg.png`)

#### a) Rimuovere le auto dalla strada
L'immagine attuale mostra una scena isometrica con edifici, alberi e **piccole auto blu** visibili sulle strade. Genererò una nuova immagine senza le auto.

#### b) Adattare gli edifici come 4 luoghi da visitare
Gli edifici dovranno essere visivamente distinti e rappresentare i 4 capitoli:
1. 🚀 **"Perché questo workshop?"** — Edificio con tema spaziale/lancio
2. 📚 **"Cosa si impara?"** — Edificio con tema biblioteca/studio
3. 🌍 **"Futuro & Digital Citizenship"** — Edificio con tema globale/futuristico
4. 🧩 **"AI per tutti — DSA & BES"** — Edificio con tema inclusivo/puzzle

> [!IMPORTANT]
> L'immagine verrà rigenerata con generate_image. Il risultato potrebbe necessitare di un'iterazione. L'immagine è usata come sfondo semi-trasparente (opacity 0.18), quindi è più un elemento decorativo che funzionale.

---

### 2. Sprite del Personaggio

#### a) Rimuovere lo sfondo bianco
L'immagine `character_guide.png` ha sfondo bianco. Genererò una versione con sfondo trasparente (PNG).

#### b) Creare sprite per animazione
Creerò un **sprite sheet** con 4 frame per animazione di camminata, e modificherò `game.js` per:
- Caricare lo sprite sheet
- Animare il personaggio con frame alternati durante il movimento
- Idle animation quando fermo

> [!IMPORTANT]
> La generate_image crea immagini singole. Creerò un singolo sprite sheet come immagine e poi animerò frame per frame nel codice JS. Il personaggio sarà lo stesso ragazzino con casco da astronauta e giacca viola, senza sfondo.

---

### 3. Migliorare la Sintesi Vocale

Attualmente il codice usa la Web Speech API di base. Miglioramenti:

#### [MODIFY] [game.js](file:///Users/giacomomeschini/Downloads/Piloti%20di%20AI%20—%20Workshop%20Interattivo/game.js)
- **Preferenza voce italiana di qualità**: Selezionare voci come "Google italiano" o "Alice" (su macOS) piuttosto che la prima voce italiana trovata
- **Pre-processamento del testo**: Pulire emoji e simboli prima della lettura (le emoji interrompono il flusso vocale)
- **Suddivisione in frasi**: Spezzare testi lunghi in frasi separate per evitare il troncamento (bug noto di speechSynthesis con testi lunghi)
- **Velocità e pitch ottimizzati**: rate 0.9, pitch 1.0 per una voce più naturale
- **Pausa tra frasi**: Aggiungere piccole pause tra le frasi per una lettura più naturale
- **Resume workaround**: Implementare il workaround per il bug di Chrome che interrompe la sintesi dopo ~15 secondi

---

### 4. Font Space Mono

#### [MODIFY] [index.html](file:///Users/giacomomeschini/Downloads/Piloti%20di%20AI%20—%20Workshop%20Interattivo/index.html)
- Cambiare il link Google Fonts da `Nunito` + `Space Grotesk` a `Space Mono` (400, 400italic, 700)

#### [MODIFY] [style.css](file:///Users/giacomomeschini/Downloads/Piloti%20di%20AI%20—%20Workshop%20Interattivo/style.css)
- Aggiornare le variabili CSS `--font-display` e `--font-body` per usare `'Space Mono'`
- Aggiornare i riferimenti font inline nel CSS

#### [MODIFY] [game.js](file:///Users/giacomomeschini/Downloads/Piloti%20di%20AI%20—%20Workshop%20Interattivo/game.js)
- Aggiornare il font usato nel canvas per le etichette degli edifici

---

## Piano di Verifica

### Test automatici
- Aprire il sito nel browser e verificare:
  - Lo sfondo senza auto
  - Il personaggio senza sfondo bianco e con animazione di camminata
  - La sintesi vocale migliorata
  - Il font Space Mono applicato ovunque

### Verifica visiva
- Screenshot del sito per confermare le modifiche visive
