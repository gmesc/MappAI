# Codice riusato da MappAI

Il misuratore **non importa nulla da MappAI a runtime**. Un `require` che risalisse in `../../public/js/` legherebbe l'avvio di questa app alla struttura interna dell'app principale, che è in pieno refactoring (il monolite `app.js` è stato appena decomposto in una ventina di moduli). Quindi: **copia dichiarata**.

Il prezzo è la divergenza silenziosa. Questo file e il test `tests/riuso-divergenza.test.js` esistono per renderla rumorosa.

## Inventario

| Copia | Origine in MappAI | Commit | Data | Perché |
|---|---|---|---|---|
| `public/js/riuso/it-tokens.js` | `public/js/mappai-desc-fidelity.js` | `0751fa4` | 28/07/2026 | La copertura della fonte deve produrre numeri coerenti con la `groundedness` dell'app: stessa tokenizzazione, stesso stemming, stesse stopword |
| `public/js/riuso/edge-families.js` | `public/js/mappai-relations.js` | `0751fa4` | 28/07/2026 | Il componente 8 dell'indice classifica i verbi di relazione per famiglia e deve riconoscerli come l'app |
| `public/js/riuso/quiz-normalize.js` | `public/js/mappai-docedit-core.js` | `0751fa4` | 28/07/2026 | Gli studySet esistono in tre forme storiche: senza normalizzazione la lente di verifica legge domande vuote |
| `public/js/riuso/files-names.js` | `public/js/mappai-files-core.js` | `0751fa4` | 28/07/2026 | Nomi di file e cartelle con le stesse regole di MappAI |
| `public/js/vendor/pdf.min.js` | `public/js/pdf.min.js` | — | 28/07/2026 | PDF.js già in casa e già in produzione |
| `public/js/vendor/lucide.min.js` | `public/js/lucide.min.js` | — | 28/07/2026 | Icone, offline |
| `public/js/vendor/spacemono-font.js` | `public/js/vendor/spacemono-font.js` | — | 28/07/2026 | Space Mono incorporato: nessun font da CDN |

## Il rischio, per nome

La regola 12 di MappAI dice che un verbo di relazione nuovo si aggiunge **una volta sola** in `mappai-relations.js` e si propaga ovunque: prompt, classificazione, colori. **Qui non si propaga.** Se aggiungi «ostacola» alla famiglia `opposizione` in MappAI, il misuratore continuerà a classificarlo come `altro` e il componente 8 lo ignorerà, in silenzio, per sempre.

`tests/riuso-divergenza.test.js` confronta l'elenco dei verbi della copia con quello dell'originale, se MappAI è raggiungibile sul disco, e fallisce dicendo quali verbi mancano. Se MappAI non è raggiungibile — misuratore distribuito da solo — il test **si salta** invece di fallire: un test rosso per un file assente addestrerebbe a ignorare i rossi.

## Come si aggiorna una copia

1. Aprire l'originale in MappAI e rileggerlo per intero, non solo la parte che il test segnala.
2. Riportare le modifiche **nella copia**, conservando l'intestazione.
3. Aggiornare commit e data in quell'intestazione e nella tabella qui sopra.
4. Rieseguire la suite: il test di divergenza deve tornare verde.

**Mai il contrario.** Se il misuratore ha bisogno di un comportamento diverso, quel comportamento va in un modulo di `public/js/core/`, non in una modifica alla copia — altrimenti la copia smette di essere una copia e la divergenza diventa invisibile di nuovo.
