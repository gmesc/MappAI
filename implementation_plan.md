# Piano di Implementazione - Aggiustamenti Sizing Label e Font Drawer insegnai.ch (Docente/Studente)

Questo piano descrive le modifiche per allineare geometricamente e tipograficamente il label "insegnai.ch" con il pulsante "MOSTRA/NASCONDI RECENTI" (pulsante di toggle dei progetti), assicurando che:
1. La dimensione del font del label "insegnai.ch" sia identica al font del label dei progetti (`13.5px`).
2. La larghezza della linguetta del drawer "insegnai.ch" (`36px`) sia esattamente uguale all'altezza del pulsante dei progetti.
3. Il testo di "insegnai.ch" sia rigorosamente in minuscolo.
4. I font della descrizione e della sezione segnalazioni del drawer siano incrementati del 15% (applicando gli stili già definiti con incrementi mirati rispetto ai valori base).
5. Tali modifiche siano sincronizzate sia nell'app Studente (ramo `MappAI_iPad_studente`) sia nell'app Docente (ramo `MappAI_iPad`).

## Modifiche Proposte

### [Component: Web Assets - CSS / HTML]

#### [MODIFY] [style.css](file:///Users/giacomomeschini/Antigravity/MappAI/public/css/style.css)

1. **Allineamento Pulsante Progetti ("Mostra/Nascondi Progetti")**:
   - Impostare un'altezza esplicita di `36px !important` su `#projects-bar button.absolute`.
   - Aggiungere `box-sizing: border-box !important`, `display: flex !important`, `align-items: center !important`, e `justify-content: center !important` per centrare verticalmente l'icona e il testo all'interno dei 36px.
   - Assicurare che `font-size` sia `13.5px !important` (per il bottone e il testo interno `#toggle-bar-text`).

2. **Allineamento Linguetta Drawer ("insegnai.ch")**:
   - Assicurare che `#insegnai-drawer-tab` abbia larghezza fissa `width: 36px !important` e `box-sizing: border-box !important`.
   - Per `#insegnai-drawer-tab span`, garantire `font-size: 13.5px !important` e forzare il testo in minuscolo tramite `text-transform: none !important;`.

3. **Verifica Incrementi Font del Drawer (15%)**:
   - Assicurare che i testi descrittivi (`p`, `a`) abbiano `font-size: 15px !important;` (incremento da `13px`).
   - Assicurare che il titolo sezione segnalazioni (`h3`) abbia `font-size: 13px !important;` (incremento da `11px`).
   - Assicurare che le scritte nei bottoni interni abbiano `font-size: 14px !important;` (titolo) e `11.5px !important;` (descrizione), corrispondenti all'aumento del 15%.

---

## Piano di Verifica

### Sincronizzazione iOS (Capacitor)
Per ciascun ramo (`MappAI_iPad_studente` e `MappAI_iPad`):
1. Copiare i file modificati nella build iOS nativa usando:
   `npx cap copy ios`
2. Testare localmente su simulatore o dispositivo iPad per verificar che:
   - La linguetta `insegnai.ch` abbia la stessa larghezza dell'altezza del pulsante verde in basso a destra.
   - I font dei due label siano visivamente identici (`13.5px`).
   - La linguetta `insegnai.ch` rimanga in minuscolo.
   - Il testo della descrizione e dei pulsanti nel drawer sia nitido e proporzionato (+15%).
