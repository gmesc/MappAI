# Rule 04 — Accesso allo stato (`appState`)

## Regola
- I nodi sono **sempre** in `appState.db.nodes`, **mai** in `appState.nodes`.
- `appState` è dichiarato con **`let`** (non `var`) → **non è su `window`**. Dai moduli
  esterni va letto con il pattern `_getAppState()`.

## Perché
`appState.nodes` non esiste: usarlo restituisce `undefined` e rompe in silenzio.
Essendo `let`, `window.appState` può essere `undefined` in alcuni contesti di caricamento;
il pattern difensivo evita crash dai moduli `mappai-*.js`.

## Struttura di `appState`
```js
appState = {
    sources: [],
    db: {
        nodes: [],          // ← SEMPRE QUI
        links: [],          // { source, target, rel, bidirectional?, isCross? }
        sourcesDict: {},    // { [nodeId]: [{title, source, text}] }
        studySets: [],      // quiz e flashcard generati
        customColors: {},
    },
    aiProvider: 'google' | 'infomaniak',
    extractionMode: 'mindmap' | 'kg',
    rootNodeLabel: '',      // titolo progetto (può essere vuoto in KG — non bloccare)
    focusTopic: '',
}
```

## Pattern da moduli esterni
```js
function _getAppState() {
    try { return (typeof appState !== 'undefined') ? appState : window.appState; }
    catch (e) { return window.appState; }
}
const st = _getAppState();
const nodes = st.db.nodes || [];
```
Riferimento d'esempio: `public/js/dev-console-metrics.js`, `public/js/mappai-active-study.js`
(funzione `S()`).

## Riferimenti negli archi (link)
`link.source` / `link.target` possono essere **id (stringa)** oppure **oggetto nodo** (D3 li
rimpiazza con riferimenti dopo il rendering). Normalizzare sempre:
```js
function lid(x) { return (x && typeof x === 'object') ? x.id : x; }
```

## Non fare
- ❌ `appState.nodes` — non esiste.
- ❌ Assumere `window.appState` sempre definito da un modulo.
- ❌ Assumere che `link.source` sia sempre una stringa (o sempre un oggetto).
