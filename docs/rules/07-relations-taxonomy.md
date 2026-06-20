# Rule 07 — Tassonomia delle relazioni

## Regola
Le relazioni degli archi sono classificate in **famiglie** definite in `EDGE_FAMILIES`.
Il mapping verbo→famiglia passa **sempre** da `window.getEdgeFamilyKey(rel)` (normalizza e
applica fallback), mai con confronti ad-hoc sul verbo.

## Famiglie attuali (8)
`trasformazione` (Causa/Effetto), `dipendenza` (Dipendenza/Prerequisito), `sequenza`
(Sequenza/Processo), `appartenenza` (Gerarchia/Parte di), `regolazione` (Controllo/Regola),
`opposizione` (Contrasto/Opposto), `analogia` (Analogia/Similitudine), `altro` (Libero).

Ogni famiglia ha: `color`, `colorBtn`, `label`, `icon`, `keywords[]`.
`REL_FAMILY_MAP` mappa i verbi normalizzati (lowercase) → chiave famiglia;
`getEdgeFamilyKey` usa la mappa e, in fallback, il match sulla prima parola → altrimenti `altro`.

## Estensione pianificata (Precision Teaching → 10 famiglie)
Si aggiungono due categorie da CourseKG, **senza** sostituire le 8 esistenti:
- **`identity`** ("è lo stesso di") — per riconoscere/fondere concetti duplicati;
- **`fratello` / brother** ("è parallelo a") — concetti fratelli allo stesso livello.

La relazione **Precursor** (prerequisito) è già coperta da `dipendenza`; per la logica dei
**percorsi di studio** si considerano propedeutiche anche le relazioni `sequenza`.

> Motivazione del design: le 7 categorie CourseKG sono uno **strato logico** per i percorsi e la
> deduplicazione, **non** un sostituto del vocabolario espressivo (regolazione, opposizione,
> analogia non vanno collassate nel generico "correlato a", che il progetto vieta).

## Fai
```js
const fam = window.getEdgeFamilyKey(link.rel);   // sempre via helper
const meta = EDGE_FAMILIES[fam];                  // color/label/icon/keywords
```

## Non fare
- ❌ `if (link.rel === 'causa') ...` — usare la famiglia, non il verbo grezzo.
- ❌ Sostituire del tutto `EDGE_FAMILIES` con le 7 CourseKG (perdita di espressività).

## Riferimenti
- `EDGE_FAMILIES` — `public/js/app.js` (~riga 355)
- `REL_FAMILY_MAP` — `public/js/app.js` (~riga 391)
- `getEdgeFamilyKey` — `public/js/app.js` (~riga 409)

## Direzione (migrazione)
Candidato **Tier 1**: estrarre `EDGE_FAMILIES` + `REL_FAMILY_MAP` + `getEdgeFamilyKey` in
`mappai-relations.js`. Serve comunque per il Precision Teaching → doppio valore.
