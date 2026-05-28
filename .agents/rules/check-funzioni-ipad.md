---
trigger: always_on
---

Quando propongo una modifica, considera sempre il target iPadOS. Se una funzione (es. accesso al file system locale) non è supportata su iPadOS, proponi un'alternativa compatibile o usa la direttiva #if PLATFORM_DESKTOP nel codice.

## Linee Guida di Responsività e Layout (iPadOS & Schermi Grandi/4K)
1. **Dimensioni Adattive (iPadOS):** Evitare l'uso di altezze o larghezze fisse in pixel per le barre dei progetti o i pannelli. Usare unità relative (`vh`, `vw`, `%`) o funzioni come `clamp(min, val, max)` per far sì che il layout si adatti dinamicamente allo spazio verticale ridotto dell'iPad (sia in modalità portrait che landscape).
2. **Limitazione di Larghezza Sidebar (Monitor 4K vs iPad):** Per evitare che la sidebar diventi eccessivamente larga su schermi 4K/Ultra-Wide, impostare sempre una larghezza massima (es. `max-width: 450px !important;`) e una larghezza minima di sicurezza per garantire la leggibilità (es. `min-width: 320px !important;` per desktop, `280px` per iPad).
3. **Fattori di Ingrandimento e Zoom:** Per scalare gli elementi in modo proporzionale in base al livello di zoom impostato dall'accessibilità (`body.a11y-zoom-x15`, `body.a11y-zoom-x2`), regolare la larghezza e la spaziatura della sidebar e degli elementi di controllo moltiplicandole per i relativi fattori (es. `* 1.15` per x1.5, `* 1.15 * 1.15` per x2).