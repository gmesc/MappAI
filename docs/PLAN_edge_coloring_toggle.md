# Plan — Edge Coloring / Lente Relazioni per Knowledge Graph

> Report generato 2 giugno 2026 (sera) dal background agent durante l'implementazione
> di node-styling 1+2. Da implementare in una sessione successiva.
>
> ⚠️ **Le sezioni 1-7 descrivono l'approccio "toggle all-families" ORIGINALE, ora
> SUPERATO.** Il design definitivo è la sezione 0 qui sotto. Le sezioni 1-7 restano
> come riferimento per: file/linee coinvolti, palette colori famiglie (valida),
> mappatura rel→famiglia (valida), edge case.

## 0. DESIGN FINALIZZATO — "Lente Relazioni" (2 giugno 2026, sera)

Concetto: NON colorare tutte le famiglie insieme (sarebbe dispersivo, l'opposto
di ciò che vogliamo). Invece **focus su una famiglia per volta** = lente di
ragionamento. Coerente con la preferenza anti-dispersione già espressa per i nodi.

### Interazione
- **Bottone TESTO resta binario** (label on/off) — azione frequente intatta.
- **Caret ▾** piccolo nell'angolo del bottone TESTO. Apertura menu via **click
  DESTRO** sul bottone/caret.
- Il menu riusa il **layout dei pannelli flottanti esistenti** (menu esci/esporta,
  pannello strumenti inclusivi). Ogni voce = una famiglia di relazione.
- **Hover** su una voce → la voce si colora del colore della famiglia (preview).
- **Click** su una voce → seleziona la famiglia (focus mode).
- Voce **"TUTTI / azzera"** per tornare alla vista normale.

### Menu DINAMICO (chiave del design)
- Si scansionano i `rel` realmente presenti in `appState.db.links`, si normalizzano
  e si mappano a famiglia (vedi §2 e §4 per palette e mapping).
- Il menu mostra **SOLO le famiglie presenti** nella mappa corrente. Niente voci
  morte, niente gating KG/MM: in MM compaiono solo le famiglie i cui verbi esistono
  (es. "causa" → trasformazione; "include" → appartenenza).
- I `rel` non mappati a nessuna famiglia → famiglia "altro" (grigia), mostrata solo
  se presente.

### Effetto della selezione di una famiglia (focus mode)
- I **link** della famiglia → colore della famiglia + **label forzato visibile** +
  font **×2** (anche se i label globali sono OFF: altrimenti selezioni una famiglia
  e non vedi nulla).
- I **nodi coinvolti** (estremi di quei link) → **outline** (stroke) del colore
  della famiglia.
- Tutti gli **altri nodi e link** → **dim leggero** (opacity ~0.35, più chiaro del
  dim pathfinder a 0.15).
- Il **bottone TESTO assume il colore** della famiglia attiva (segnala stato attivo).
- La voce selezionata resta colorata nel menu (stato persistente, non solo hover).

### Sotto-feature separabile (4b) — dropdown categoria in creazione link
- Quando l'utente crea un link manualmente (flusso `showPrompt` ~app.js 5531),
  invece del solo testo libero: **tendina con le famiglie/relazioni note** +
  opzione "altro (testo libero)".
- Indipendente dal menu lente. Si può fare subito dopo o in mini-sessione a parte.

### Note di composizione con node-styling 1+2 (già implementato)
- L'outline famiglia è uno stroke TEMPORANEO sul `circle.node-circle`, da comporre
  con l'anello dei segmenti (`.node-segments`) senza conflitto: l'anello resta, si
  aggiunge solo un outline esterno colorato sui nodi coinvolti.
- Il dim leggero può riusare un meccanismo simile a `applyVisualFilters` / classe
  `.dimmed` ma con una classe dedicata (es. `.lens-dimmed`, opacity 0.35) per non
  collidere col dim pathfinder.
- Token: zero. Pura visualizzazione, legge `rel` già esistente.

---

## 1. File coinvolti (linee esatte)

**KG_REL_ENUM**: `public/js/app.js` linee **260–270** (32 verbi italiani).
Riferito anche L. 3499 (schema KG) e L. 3748 (suggestion AI).

**Rendering D3 dei link** (`app.js`):
- L. **4385–4402**: enter/merge `.link-group`, `<line class="link">` con `stroke="#94a3b8"` hardcoded (L. 4394). Qui va il colore dinamico.
- L. **4395 / 4398–4400**: label dei link (testo = `d.rel`).
- L. **4730–4732**: `tick()` aggiorna solo coordinate, non ricolora — non serve toccarlo.
- L. **12229**: stile inline `.link { stroke: #cbd5e1 }` usato in export SVG.

**CSS link**: `public/css/style.css` linee **1302–1364** (`.link`, `.link.cross-link`, `.link.pathfinder-active`, `.link-group.ai-suggested`).
Le regole `pathfinder-active` e `ai-suggested` usano `!important` su `stroke`: il nuovo coloring va applicato **inline su `<line>`** (override naturale).

**Persistenza**: i toggle grafici esistenti (`labelsHidden`, `pathfinderActive` — L. 4078) sono **solo in memoria**. Nuova chiave proposta: **`mappai_kg_edge_coloring`** (default `"off"`).

**Toolbar grafico**: `public/index.html` linee **1216–1296**. Inserire il toggle **dopo "TESTO" (L. 1287) e prima di "PATH" (L. 1290)**.

## 2. Famiglie di rel (6 cluster + altro, daltonismo-safe)

Tutti i 32 verbi mappati. Colori HSL — niente rosso/verde puri.

| Famiglia | Verbi | Colore HSL |
|---|---|---|
| **trasformazione** | causa, provoca, produce, genera, determina, trasforma in, porta a, alimenta, catalizza | `hsl(28 85% 52%)` ambra-arancio |
| **dipendenza** | richiede, dipende da, è condizione di, utilizza, permette | `hsl(265 70% 58%)` viola |
| **sequenza** | precede, segue, deriva da | `hsl(200 80% 48%)` ciano-blu |
| **appartenenza** | fa parte di, comprende, contiene, appartiene a, è esempio di, rappresenta, coinvolge | `hsl(220 65% 55%)` blu |
| **regolazione** | è regolato da, regola, governa, guida, sostiene, avviene in | `hsl(315 55% 52%)` magenta |
| **opposizione** | si oppone a, contrasta, ostacola | `hsl(15 75% 55%)` arancio caldo |
| _altro_ | rel sconosciuto | `hsl(220 10% 55%)` grigio neutro |

## 3. UI — Posizione del toggle

**Primaria**: nuovo bottone in toolbar grafico (`index.html` ~L. 1288, fra TESTO e PATH), pattern identico a `card-btn-labels` (L. 1281–1286):
```
id="card-btn-edge-color" onclick="window.toggleEdgeColoring()"
icona lucide="palette", label "COLORI", title "Colora archi per relazione semantica"
```
Stato attivo → switch da `bg-slate-100/text-slate-600` a `bg-indigo-50/text-indigo-600`.

**Alternativa A**: dentro pannello card layout (L. 1796) — meno scopribile.
**Alternativa B**: sotto-menù di "TESTO" — richiede ristrutturazione.

## 4. Algoritmo rel → famiglia

Lookup table **invertita verbo→famiglia** costruita una volta sola a init (`REL_FAMILY_MAP`), con:
1. **Normalizzazione**: `String(rel||'').trim().toLowerCase()`.
2. **Match esatto** sulla mappa → ritorna codice famiglia.
3. **Match per prefisso parola** come fallback morbido (es. "causano", "produrre" da AI libera): split su spazi, lookup della **prima parola lemma** in `LEMMA_TO_FAMILY` (es. `caus*` → trasformazione). Solo se step 2 fallisce.
4. Se ancora niente → famiglia `"altro"` (grigio).

Funzione `window.getEdgeFamilyColor(rel)` esposta su `window.*`.

## 5. Edge case

- **rel === ""** o `null`/`undefined` → famiglia neutra grigia.
- **rel non in nessuna famiglia** → "altro" grigio + flag debug in console.
- **Link senza campo rel** (mappe pre-KG, mind-map classiche) → fallback al default attuale `#94a3b8`. Il toggle deve essere **no-op in mindmap mode** — controllare `appState.extractionMode` prima di applicare.
- **Pathfinder attivo / AI suggested**: hanno `!important` su stroke (CSS 1313, 1349). Non sovrascrivere quando una di queste classi è presente sul `<line>` — verificare via `d3.select(this).classed('pathfinder-active')`.
- **Toggle OFF a runtime**: rimuovere attributo `stroke` inline (`.attr("stroke", null)`) per ripristinare il default CSS.

## 6. Step di implementazione

1. **[basso]** Aggiungere `EDGE_FAMILIES` (famiglia→colore HSL) e `REL_FAMILY_MAP` (verbo→famiglia) in `app.js` post-L. 270.
2. **[basso]** Definire `window.getEdgeFamilyColor(rel)` con normalizzazione + lookup + fallback.
3. **[basso]** Aggiungere stato `appState.edgeColoringActive` (boot da `localStorage`); init vicino L. 33.
4. **[medio]** Estendere rendering L. 4394–4401: `.attr("stroke", d => appState.edgeColoringActive && appState.extractionMode==='kg' ? getEdgeFamilyColor(d.rel) : null)`. Stesso pattern per label (L. 4398) con `lightness -10`.
5. **[basso]** Inserire bottone toolbar in `index.html` post-L. 1287 e `window.toggleEdgeColoring()` (modello `toggleLabels` L. 5219): toggle flag, persisti su localStorage, aggiorna classe, re-paint `g.selectAll('.link').attr('stroke', ...)`.
6. **[basso]** Stile CSS opzionale in `index.html` `@layer components` per classe `.edge-coloring-on`.
7. **[medio]** Test su 3 vault: KG completo, KG con rel custom AI, mind-map (no-op). Verificare export SVG.

## 7. Compatibilità con lavoro 1+2 (node-styling)

I lavori 1+2 (saturation by centrality + bridge marking) agiscono su **fill** dei nodi.
Edge coloring agisce su **stroke** dei `<line>` — assi visivi disgiunti, **nessun conflitto**.

Sinergia: con nodi pastello desaturati + archi colorati per famiglia, la lettura semantica della rete si rafforza.

**Future enhancement (non in questo step)**: in modalità "edge coloring ON" ridurre del 15–20% la saturazione dei nodi per evitare rumore cromatico.

**Cautela**: famiglia "opposizione" (arancio caldo) + nodi gruppo 1 spesso arancio/rosso → archi che si fondono sul nodo. Mitigazione: stroke più scuro (lightness 42%) per famiglia "opposizione" quando il nodo target è dello stesso hue.
