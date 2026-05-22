# Piano di Implementazione - Aggiustamenti UI Landing Page per iPad (Docente/Studente)

Questo piano descrive le modifiche per ottimizzare l'interfaccia utente (UI) della landing page su iPadOS, con particolare attenzione alla visualizzazione per tutti i fattori di ingrandimento (zoom x1.5 e x2).

## Modifiche Proposte

### [Landing UI - Header e Elementi Fissi]

L'header deve rimanere uguale (non scalato e con layout orizzontale fisso) per tutti i livelli di ingrandimento. I 4 bottoni dei setting verranno ridisegnati con layout verticale (icona sopra, testo sotto) e con un font più grande e fisso. I label "insegnai.ch" e "mostra progetti" verranno ingranditi del 10% e rimarranno anch'essi a dimensione fissa.

#### [MODIFY] [style.css](file:///Users/giacomomeschini/Antigravity/MappAI/public/css/style.css)

1. **Header Layout Fisso**:
   - Neutralizzare le regole all'interno delle classi `body.a11y-zoom-x15` e `body.a11y-zoom-x2` che modificano il flex layout dell'header a `flex-direction: column`.
   - Garantire che l'header mantenga sempre il layout orizzontale (`flex-direction: row !important; justify-content: space-between !important; align-items: center !important; gap: 24px !important;`).
   - Assicurare che il titolo `h1` e il sottotitolo `#landing-subtitle` non scalino con `var(--landing-zoom)` ma abbiano una dimensione fissa (`40px` e `12px` rispettivamente).

2. **Riorganizzazione Verticale e Ingrandimento 4 Bottoni Settings**:
   - I 4 bottoni della landing header (`.btn-landing-secondary`) saranno disposti su un'unica riga orizzontale, senza andare a capo (`flex-wrap: nowrap !important;`).
   - Ciascun bottone utilizzerà un layout verticale: `flex-direction: column !important; align-items: center !important; justify-content: center !important; gap: 6px !important;`.
   - Aumentare la dimensione del font a `13px !important` e mantenerla fissa per tutti i livelli di zoom.
   - Definire dimensioni fisse per i bottoni (es. `width: 96px !important; height: 80px !important;`) per mantenere consistenza, permettendo al testo di andare a capo su due righe (`white-space: normal !important`).
   - Ingrandire l'icona interna (`svg` e `i`) a `22px !important; height: 22px !important;` per farla risaltare al centro dell'area del bottone.

3. **Ingrandimento del 10% di "insegnai.ch" e "mostra progetti"**:
   - Ingrandire il testo della linguetta del drawer `#insegnai-drawer-tab button` del 10% (da `14px` a `15.5px !important`).
   - Ingrandire il bottone `#projects-bar button.absolute` e `#projects-bar #toggle-bar-text` del 10% (da `12px` a `13.5px !important`).
   - Ingrandire l'icona del pulsante di toggle `#projects-bar #toggle-bar-icon` a `15.5px !important; height: 15.5px !important;`.

4. **Allineamento Orizzontale Permanente per Sezione 1 e Sezione 2 (Versione Docente/AI)**:
   - Forzare i contenitori dei bottoni di caricamento fonti (Sezione 1) e di modalità di estrazione (Sezione 2) a rimanere disposti orizzontalmente senza wrapping sotto zoom x1.5 e x2.
   - Configurare `flex-wrap: nowrap !important; overflow-x: auto !important;` per consentire lo scroll orizzontale se necessario, nascondendo le scrollbar per pulizia estetica.
   - Impostare `flex: 0 0 calc(105px * var(--landing-zoom)) !important` per i bottoni `.source-type-btn` per evitare il restringimento.
   - Impostare `flex: 0 0 calc(200px * var(--landing-zoom)) !important` per i bottoni `.mode-btn` per preservarne la dimensione anche in layout orizzontale nowrap.

---

## Piano di Verifica

### Verifica Manuale
1. **Verifica Layout Header**:
   - Cambiare la modalità di zoom su x1.5 e x2.
   - Verificare che il logo, il titolo "MappAI" e il sottotitolo "Visualizzatore di conoscenza" non cambino dimensione e rimangano allineati a sinistra in orizzontale.
2. **Verifica Bottoni Settings**:
   - Verificare che i 4 bottoni (`Setup`, `Guida App`, `Studio Attivo`, `Chi sei`) siano allineati in una sola riga orizzontale a destra.
   - Verificare che per ciascun bottone l'icona sia posizionata sopra il rispettivo testo.
   - Verificare che il font size sia aumentato a `13px` e rimanga invariato a zoom x1.5 e x2.
   - Verificare che l'icona occupi bene l'area.
3. **Verifica Linguetta "insegnai.ch"**:
   - Verificare che il testo della linguetta sia ingrandito a `15.5px` e sia stabile.
4. **Verifica Pulsante "Mostra Progetti"**:
   - Verificare che il pulsante in basso a destra sia ingrandito a `13.5px` e sia stabile.
5. **Verifica Sezioni 1 e 2 (Versione Docente/AI)**:
   - Attivare la modalità Docente (se disattivata, premendo `CTRL + SHIFT + L + K + J + H`).
   - Verificare che i bottoni di caricamento fonti (Sezione 1) e di modalità (Sezione 2) siano disposti orizzontalmente.
   - Attivare zoom x1.5 e x2 e verificare che rimangano in riga orizzontale, scorrendo eventualmente da destra a sinistra senza spezzare il layout verticalmente.
