# Piano di Implementazione - Risoluzione Bug Layout Navigazione e Controllo su iPad

Questo piano descrive le modifiche per risolvere i problemi di visualizzazione del grafo su iPad sia nella versione `MappAI_iPad` che `MappAI_iPad_studente`:
1. **Navigazione/Navbar troppo grande a zoom x2**: La control card fluttuante (`#map-control-card`) esce dallo schermo. Ridurremo e stabilizzeremo le sue dimensioni tramite CSS dedicato.
2. **Sostituzione etichette con pittogrammi**: Le etichette di testo "Testo" e "Distanza" all'interno della control card sono troppo piccole e verranno rimpiazzate con icone Lucide (`type` e `arrow-left-right`) dotate di tooltip accessibile.
3. **Pulsanti circolari a dimensione fissa**: I pulsanti per mostrare/nascondere la sidebar (`#sidebar-toggle-btn`), uscire (`#floating-actions-toggle`) ed accedere agli strumenti compensativi (`#a11y-panel-toggle`) devono mantenere dimensioni costanti indipendentemente dallo zoom del testo.
4. **Offset superiore sidebar (Status Bar iOS)**: L'header della sidebar in modalità x1 è troppo compresso e vicino all'orologio di iOS. Aggiungeremo un padding superiore dinamico che rispetta la safe-area.

---

## 1. Dettagli delle Soluzioni Proposte

1. **Sostituzione Testo con Icone (Punto 2)**
   - In `public/index.html`, all'interno di `#map-control-card`:
     - Rimpiazzare `<span ...>Distanza</span>` con `<i data-lucide="arrow-left-right" class="w-5 h-5 text-slate-500 mb-1" title="Distanza nodi"></i>`.
     - Rimpiazzare `<span ... data-i18n="lbl_size_text">Testo</span>` con `<i data-lucide="type" class="w-5 h-5 text-slate-500 mb-1" title="Dimensione testo"></i>`.
     - Rimuovere gli attributi `data-i18n` da questi elementi per evitare che la traduzione dinamica sovrascriva le icone.

2. **Controllo Dimensioni e Layout `#map-control-card` sotto Zoom (Punto 1)**
   - Introduzione di regole CSS specifiche per `body.a11y-zoom-x15` e `body.a11y-zoom-x2` per forzare l'uso di dimensioni in `px` stabili, evitando che la barra fluttuante raddoppi di dimensione e vada off-screen.
   - Riduzione del padding e dei gap interni.
   - Limitazione della larghezza massima al 90% della viewport per garantire la visibilità su iPad.

3. **Blocco Dimensioni Pulsanti Circolari Fluttuanti (Punto 3)**
   - Assegnare l'id `sidebar-toggle-btn` al pulsante della sidebar in `public/index.html`.
   - Nel CSS, forzare dimensioni fisse in `px` (`width: 48px !important`, `height: 48px !important`) e icone a `24px` per `#sidebar-toggle-btn`, `#floating-actions-toggle` e `#a11y-panel-toggle`.
   - Mantenere stabili le loro coordinate di ancoraggio assoluto sullo schermo.

4. **Offset Header Sidebar per Orologio OS (Punto 4)**
   - Aggiungere una regola CSS per tablet/desktop (`@media (min-width: 768px)`) che inserisce un padding-top nell'header della sidebar utilizando la safe-area di Capacitor/iOS (`env(safe-area-inset-top, 24px)`).

---

## 2. Proposta Modifiche File

### [Componente Web UI]

#### [MODIFY] [index.html](file:///Users/giacomomeschini/Antigravity/MappAI/public/index.html)
- Aggiungere `id="sidebar-toggle-btn"` alla riga 1075.
- Sostituire l'etichetta "Distanza" alla riga 1207 con l'icona `arrow-left-right`.
- Sostituire l'etichetta "Testo" alle righe 1221-1222 con l'icona `type`.

#### [MODIFY] [style.css](file:///Users/giacomomeschini/Antigravity/MappAI/public/css/style.css)
- Aggiungere le regole CSS a fine file per:
  - Offset della barra di stato iOS sulla sidebar in modalità tablet.
  - Blocco dimensioni dei tre pulsanti circolari.
  - Override px-based della control card `#map-control-card` sotto zoom `x15` e `x2`.

---

## 3. Piano di Verifica

### Verifica Manuale (su iPadOS Simulator o tramite visualizzazione web)
1. Avviare l'applicazione.
2. **Verifica Sidebar Header (x1)**: Controllare che l'header della sidebar non sia sovrapposto all'orologio del simulatore iPad.
3. **Verifica Dimensione Pulsanti Circolari**: Cambiare lo zoom a `Testo x1.5` e `Testo x2` e assicurarsi che i pulsanti di chiusura sidebar e di logout mantengano esattamente la stessa dimensione.
4. **Verifica Control Card a Zoom x2**:
   - Assicurarsi che la barra fluttuante rimanga centrata in basso e completamente visibile sullo schermo.
   - Verificare che le parole "Distanza" e "Testo" siano sostituite dalle icone e che il layout sia pulito e compatto.
