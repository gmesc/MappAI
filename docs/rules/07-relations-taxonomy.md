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

## Single source of truth delle linking words (6 lug 2026)
I `keywords` di `EDGE_FAMILIES` in `mappai-relations.js` sono l'**unico** elenco di verbi:
- `REL_FAMILY_MAP` è **generata** dai keywords (esclusa la famiglia `altro` e il verbo
  `include`, che resta `altro` per non colorare l'intero albero MM nella Lente Relazioni).
- `buildRelVocabularyBlock(style)` genera il blocco vocabolario per i prompt:
  `'perFamily'` (Fase 3 MM, righe per famiglia) e `'flat'` (KG Community, KG multi-pass,
  Fase 4, elenco quotato). I template JSON usano il placeholder `{{relVocabulary}}`,
  riempito automaticamente da `fillPromptTemplate` (`admin_prompts.js`).
- `getFamilyVerbs(key)` filtra i verbi proponibili (esclusi `include` e `come`).
- **Aggiungere un verbo = una riga nei keywords della famiglia giusta.** Appare in tutti i
  prompt E viene classificato col colore giusto. MAI hardcodare liste di verbi nei prompt.
- Test di guardia: `tests/relations.test.js` (classificazioni legacy congelate).

## Tassonomia bilingue (7 lug 2026)
Ogni famiglia ha anche `keywordsEn`, `labelEn`, `defaultRelEn`. `REL_FAMILY_MAP` è
generata dai keywords di ENTRAMBE le lingue (i verbi non collidono) → le frecce delle
mappe inglesi sono classificate e colorate. API con parametro lingua:
`getFamilyVerbs(key, lang)`, `getFamilyLabel(key, lang)`, `getFamilyDefaultRel(key, lang)`,
`buildRelVocabularyBlock(style, lang)` — default `'it'`, comportamento storico invariato.
`'includes'` escluso dalla mappa come `'include'`; `'like'` escluso dai prompt come `'come'`.
`KG_REL_ENUM` (app.js) è generato dalla tassonomia; lo schema JSON usa
`window.getKgRelEnum()` che segue la lingua mappe (`mappai_map_language`).
Verbo nuovo = 1 riga per lingua nella famiglia giusta.

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
- `EDGE_FAMILIES`, `REL_FAMILY_MAP`, `getEdgeFamilyKey`, `getFamilyVerbs`,
  `buildRelVocabularyBlock` — `public/js/mappai-relations.js` (modulo UMD, Tier 1)
- Binding legacy in `app.js` (~riga 374): `const EDGE_FAMILIES = window.MappAIRelations.EDGE_FAMILIES`

## Direzione (migrazione)
✅ Fatta: `EDGE_FAMILIES` + `REL_FAMILY_MAP` + `getEdgeFamilyKey` vivono in
`mappai-relations.js` (Tier 1). L'estensione a 10 famiglie va fatta lì.
