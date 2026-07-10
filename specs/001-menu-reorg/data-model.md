# Data Model — Riorganizzazione Menu (001-menu-reorg)

Nessuna entità dati. La feature riorganizza punti d'ingresso UI: non tocca
`appState`, il formato mappa/vault, né i dati di studio (mastery, effort,
punteggi Cloze restano letti/scritti dagli stessi moduli con gli stessi store).

Unico stato nuovo:

| Chiave | Dove | Valori | Significato |
|---|---|---|---|
| `mappai_legacy_float_btns` | localStorage | assente (default) · `'1'` | `'1'` = ripristina i 3 bottoni flottanti storici (Cloze 📝, Padronanza 🎯, Lavoro 🔥) e le posizioni storiche dei 4 flottanti restanti |

Il flag è di sola configurazione locale: non viene mai salvato nel vault né
esportato, e la sua assenza produce il nuovo comportamento di default.
