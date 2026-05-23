# Risoluzione della Logica di Zoom su iPadOS

Questo piano risolve i problemi di zoom e posizionamento riscontrati su iPadOS relativi alla barra dei progetti recenti, al drawer laterale di insegnai.ch, alla sua linguetta/label e alla card principale della landing page.

## User Review Required

> [!NOTE]
> Per superare i bug noti di Safari/WebKit con la proprietà `zoom` (specie quando combinata con trasformazioni/translate CSS), adotteremo un approccio combinato:
> 1. **Blocco in Pixel Assoluti (`px`)**: Tutti gli elementi del drawer laterale (`#insegnai-drawer`), della sua linguetta (`#insegnai-drawer-tab`), e del pannello strumenti compensativi (`#a11y-panel`, `#a11y-panel-toggle`) verranno bloccati a dimensioni e font fissi in pixel (`px`) nel CSS, bypassando interamente l'ingrandimento basato su `rem` e `zoom`.
> 2. **Zoom Testo Landing Card**: Rimuoveremo lo zoom distruttivo `transform: scale(z)` dalla landing card principale (`.glass-card.max-w-3xl`) in JavaScript. Al suo posto, faremo scalare i testi, i badge e i bottoni interni tramite variabili CSS dinamiche (`--app-zoom`), permettendo al browser di eseguire il reflow naturale senza produrre overflow orizzontali o tagli dell'interfaccia.
> 3. **Barra Progetti Recenti**: Calcoleremo un fattore di zoom dedicato `--projects-zoom = 1 + (zoom - 1) * 0.5` per ridimensionare proporzionalmente testi, icone e larghezze delle card dei progetti recenti in Safari senza alterare la larghezza (100%) della barra fissa in fondo.

## Proposed Changes

### Stili di Layout (`public/css/style.css`)

#### [MODIFY] [style.css](file:///Users/giacomomeschini/Antigravity/MappAI/public/css/style.css)
- Rimuovere la proprietà non-standard `zoom` per `#insegnai-drawer`, `#insegnai-drawer-tab`, `#a11y-panel-toggle`, e `#a11y-panel`.
- Introdurre la variabile CSS `--projects-zoom` calcolata come `calc(1 + (var(--app-zoom, 1) - 1) * 0.5)`.
- Scrivere regole specifiche per `#projects-bar` per ridimensionare i testi (h3, h4, span, p, button), le larghezze delle card (`width: calc(12rem * var(--projects-zoom) / var(--app-zoom))`) e le dimensioni delle icone SVG in base al rapporto delle due variabili, ottenendo un fattore di zoom netto pari a 0.5.
- Bloccare esplicitamente le dimensioni, le spaziature e i font di `#insegnai-drawer`, `#insegnai-drawer-tab`, `#a11y-panel-toggle`, `#a11y-panel` in pixel (`px !important`), in modo che restino costanti a qualsiasi livello di zoom selezionato.
- Aggiungere regole CSS per scalare il testo della card principale nella landing page (`#landing-view .glass-card.max-w-3xl`) usando la variabile `--app-zoom`, includendo il titolo principale (`h1`), i bottoni setup/guida/studio (`.btn-landing-secondary`), le scritte dei tasti rapidi, i badge numerati (`.step-badge`), e i campi di input (`.landing-input` / `textarea`).

### Logica Applicazione (`public/js/app.js`)

#### [MODIFY] [app.js](file:///Users/giacomomeschini/Antigravity/MappAI/public/js/app.js)
- Rimuovere all'interno di `window.applyTextZoom` e `window.resetA11yTools` il blocco di codice che applica `mainCard.style.transform = scale(z)`. Ciò eviterà che l'intero container della card venga deformato via GPU, lasciando il compito di ridimensionare i testi alle regole CSS basate su reflow.

---

## Verification Plan

### Test Manuali (iPad Simulator / Dispositivo)
1. Eseguire `npx cap sync ios` per caricare le modifiche del frontend nell'ambiente nativo iOS.
2. In Xcode, eseguire un Clean Build (`Cmd + Shift + K`) e avviare il simulatore iPad.
3. **Verifica Drawer e Label**: Aprire e chiudere il drawer di insegnai.ch a diversi livelli di zoom (x1, x1.5, x2). Assicurarsi che la larghezza e la linguetta rimangano costanti, e che il drawer quando è chiuso sia completamente nascosto (senza sporgere a sinistra).
4. **Verifica Pulsante A11y**: Verificare che il pulsante con l'occhio e il pannello a discesa rimangano della stessa dimensione e non subiscano variazioni di scala.
5. **Verifica Landing Card**: Selezionare lo zoom x1.5 e x2 e verificare che il testo all'interno della card principale si ingrandisca correttamente senza deformazioni e senza sbordare ai lati.
6. **Verifica Barra Progetti**: Verificare che la barra dei progetti recenti scali con fattore dimezzato (1.25x a zoom 1.5x e 1.5x a zoom 2x) e rimanga adagiata a tutta larghezza sul fondo dello schermo.
