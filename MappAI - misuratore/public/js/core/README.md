# Core puri — convenzione

Ciò che sta in questa cartella è **l'unica parte del misuratore coperta da test**, e l'unica di cui si possa dire con certezza che produce sempre gli stessi numeri.

## Regole, tutte e cinque non negoziabili

1. **Nessun DOM.** Niente `document`, niente `window` se non per l'esportazione UMD in fondo al file.
2. **Nessuna rete.** L'unica eccezione dell'intera applicazione è `public/js/ai/mis-ai-prose.js`, che infatti non sta qui.
3. **Nessun `require` di Electron.** Un core che importi `electron` smette di essere eseguibile da `node --test`, cioè smette di essere verificabile.
4. **Nessuna data implicita.** Niente `Date.now()`, niente `new Date()` senza argomenti. La data arriva come parametro. Una funzione che legge l'orologio non è riproducibile, e la riproducibilità è il secondo principio di questa feature.
5. **Nessuna sorgente di casualità.** Nessun `Math.random()`, nessuna iterazione su un `Set` o un oggetto il cui ordine dipenda dall'inserimento quando quell'ordine influenza il risultato.

## Forma UMD

```js
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MisNome = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    // …
    return { /* API pubblica */ };
}));
```

Stessa forma dei core di MappAI: `require` in Node per i test, `window.MisNome` nel renderer.

## Dipendenze fra core

Un core può richiamarne un altro **solo per iniezione**, mai per `require` diretto. Esempio: `mis-struct-core.causalStructure(links, edgeFamilies)` riceve la tassonomia invece di importarla. Non è pedanteria: è ciò che rende possibile a `tests/riuso-divergenza.test.js` passare due tassonomie diverse e accorgersi che la copia da MappAI è invecchiata.

## Le liste non stanno nel codice

Suffissi di nominalizzazione, connettivi, marcatori, soglie, velocità di lettura: **tutto arriva dal profilo di parametri**, niente è una costante di modulo.

È la lezione della calibrazione documentata in `research.md` R1. L'assessment del 24 luglio 2026 fu scritto con liste che nessuno mise per iscritto, e oggi metà delle sue cifre non è riproducibile: sui connettivi subordinanti lo scarto è di tre volte e mezzo, sui causali di quattro. Una costante in cima a un file sarebbe già un mezzo passo verso lo stesso esito, perché nessun report la mostrerebbe al lettore.
