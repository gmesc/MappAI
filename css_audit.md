# 🎨 CSS Audit Completo — MappAI
> Analisi di `public/css/style.css` (2.723 righe, 75 KB) e `public/index.html` (3.245 righe).  
> Nessuna modifica effettuata. Solo analisi.  
> Data: 29 maggio 2026.

---

## 8. RIEPILOGO PROBLEMI (anticipato per visibilità)

| Tipo di problema | Occorrenze | Gravità |
|---|---|---|
| `!important` nel CSS | **703** | 🔴 Alta |
| Selettori ad alta specificità (3+ token o ID+classe) | **274** | 🔴 Alta |
| Classi ridefinite in style.css | **66** | 🟡 Media |
| Elementi con 6+ classi (conflitti specificità) | **374** | 🟡 Media |
| Classi definite in CSS ma non usate in HTML | **72** | 🟡 Media |
| Classi in HTML non in CSS (non Tailwind) | **23** | 🟡 Media |
| Conflitti Tailwind vs CSS (stessa proprietà) | **4 diretti + pattern sistemici** | 🔴 Alta |
| Stili inline (`style=""`) | **17** | 🟢 Bassa |
| Classi Tailwind in HTML | **497** distinte | — (informativo) |

> **Sintesi medica:** Il file `style.css` è affetto da **dipendenza cronica da `!important`** — 703 occorrenze su 2.723 righe significano che ogni 4 righe ce n'è una. Questo è il sintomo classico di CSS scritto "per forza bruta" per vincere conflitti con Tailwind. Il sistema è funzionante ma fragile: ogni modifica richiede un nuovo `!important` per avere effetto.

---

## 1. INVENTARIO CLASSI IN style.css

**Totale classi uniche definite:** 116  
**Totale definizioni (regole) che le coinvolgono:** 457 ← media 3,9 regole per classe  

### Classi con definizione singola (normale)

| Classe | Riga principale | Proprietà chiave |
|--------|----------------|-----------------|
| `.a11y-panel` | L115 | `position`, `left`, `top`, `z-index`, `background` |
| `.a11y-panel.hidden-panel` | L115 | `left: -999px` |
| `.animate-fade-in` | ~L10 | `animation: fadeIn` |
| `.animate-slideIn` | ~L10 | `animation: slideIn` |
| `.app-toast` | ~L1050 | `position: fixed`, `bottom`, `z-index`, `padding` |
| `.btn_a11y_tool` | L115 | `display: flex`, `gap`, `padding`, `font-size` |
| `.btn-landing-secondary` | ~L1000 | `background`, `border`, `color` |
| `.dossier-section-title` | ~L1400 | `font-size`, `margin`, `color` |
| `.flashcard-item` | ~L1470 | `border`, `padding`, `border-radius` |
| `.focus_ring_standard` | ~L1100 | `outline-offset`, `ring` composto |
| `.glass-card` | ~L450 | `background`, `backdrop-filter`, `border`, `border-radius` |
| `.glow` | ~L10 | `box-shadow: 0 0 20px rgba(99,102,241,0.3)` |
| `.hidden-panel` | L115 | (sotto-selector di `.a11y-panel`) |
| `.loading-spinner` | ~L1600 | `border`, `border-top-color`, `animation: spin` |
| `.markdown-body` | ~L950 | `line-height`, `font-size`, `color` |
| `.modal-scroll` | ~L30 | `scrollbar-width`, `overflow-y: auto` |
| `.modal_field_title` | ~L1390 | `font-size`, `font-weight`, `color` |
| `.modal_title` | ~L1380 | `font-size: 28px`, `font-weight: 700` |
| `.node-tooltip` | ~L1300 | `position: absolute`, `background`, `z-index` |
| `.pomodoro-ring` | ~L1840 | `stroke-dasharray`, `stroke-dashoffset`, `transition` |
| `.reading-ruler-mode` | ~L500 | modifica cursore |
| `.source-entry` | ~L1550 | `display: flex`, `align-items`, `gap` |
| `.spinner-arc` | ~L1640 | `stroke`, `stroke-width`, `animation` |
| `.study-score-bar` | ~L1850 | `height`, `background`, `border-radius` |
| `.treeview-children-container` | L1871 | `display: block`, `padding-left` |
| `.treeview-parent` | L1871 | `cursor: pointer`, `display: flex` |

*(le restanti 90 classi sono tutte ridefinite — vedi §2)*

---

## 2. CLASSI DEFINITE PIÙ VOLTE — Conflitti

**66 classi su 116 sono ridefinite (57%).** Di seguito i casi più critici.

### 🔴 CRITICO — `.quiz-option` (9 definizioni)

| Definizione | Riga | Proprietà che cambia |
|---|---|---|
| `.quiz-option` (base) | L1518 | `padding`, `border`, `border-radius`, `margin-bottom` |
| `.quiz-option:hover` | L1530 | `border-color`, `background` |
| `.quiz-option.correct` | L1535 | `border-color: #22c55e`, `background: #dcfce7`, `color: #166534` |
| `.quiz-option.wrong` | L1541 | `border-color: #ef4444`, `background: #fee2e2`, `color: #991b1b` |
| `#study-quiz-options .quiz-option` | L1772 | `font-size: calc(0.8125rem * var(--app-zoom))` |
| `.quiz-option.tf-true` | L1914 | `background: #22c55e !important`, `color: white !important` |
| `.quiz-option.tf-true:hover` | L1922 | `background: #16a34a !important` |
| `.quiz-option.tf-false` | L1926 | `background: #ef4444 !important`, `color: white !important` |
| `.quiz-option.tf-false:hover` | L1934 | `background: #dc2626 !important` |

**Analisi:** Le 9 definizioni sono tecnicamente varianti valide (pseudo-classi e classi composte). Il problema è l'uso di `!important` sulle varianti `tf-true/tf-false` — suggerisce che senza `!important` le regole `.correct/.wrong` le vincevano.

---

### 🔴 CRITICO — `.source-type-btn` (12 definizioni)

La classe `.source-type-btn` è ridefinita 12 volte in contesti diversi. Il conflitto principale:

| Riga | Selettore | display impostato |
|---|---|---|
| L95 | `.source-type-btn` | `font-size: 13px !important` |
| L1113 | `.source-type-btn` | `display: flex`, `flex-direction: column` |
| L1977 | `#landing-view .glass-card .source-type-btn` | `background !important`, `border-color !important`, `color !important`, `box-shadow !important` |
| L2053 | `#landing-view .source-type-btn` | `white-space: nowrap !important` |

**Problema:** La definizione a L1977 usa **4 `!important`** per sovrascrivere le regole base. La catena L95 → L1113 → L1977 crea una cascata difficile da manutenere.

---

### 🔴 CRITICO — `.tts-button` (4 definizioni, conflitto display)

| Riga | Selettore | Proprietà |
|---|---|---|
| L48 | `.tts-button` | `display: flex`, `align-items: center`, `width: 48px`, `height: 48px` |
| L64 | `.tts-button:hover` | `background`, `transform: scale(1.05)` |
| L70 | `.tts-button i` | `width: 24px`, `height: 24px` |
| **L95** | **`.tts-button`** | **`font-size: 13px !important`** ← RIDEFINIZIONE PURA |

**Problema:** La riga L95 ridefinisce `.tts-button` una seconda volta con solo `font-size`. La proprietà `font-size` non era nella prima definizione → non c'è sovrascrittura, ma è comunque un caso di classe spezzata in due blocchi separati senza motivo.

---

### 🟡 SIGNIFICATIVO — `.pathfinder-active` (2 definizioni, colori diversi)

| Riga | Selettore | stroke |
|---|---|---|
| L1310 | `.link.pathfinder-active` | `stroke: #eab308 !important` (giallo) |
| L1340 | `.pathfinder-active` | `stroke: #f59e0b !important` (ambra) |

**Problema:** Due gialli diversi per lo stesso stato visivo. La seconda definizione (L1340) **vince** per specificità più bassa ma viene applicata a più elementi. Incoerenza cromatica.

---

### 🟡 SIGNIFICATIVO — `.visible` (2 definizioni, contesti diversi)

| Riga | Selettore | Effetto |
|---|---|---|
| L1588 | `#image-lightbox.visible` | `display: flex` |
| L1616 | `#loading-overlay.visible` | `display: flex` |

Non è un conflitto (sono su elementi diversi), ma la classe `.visible` viene usata come utility duplicata di Tailwind. **Attenzione:** Tailwind ha `.visible` ma imposta `visibility: visible`, non `display: flex`. Se mai si usa `.visible` da Tailwind su questi elementi, il comportamento sarà sbagliato.

---

### 🟡 SIGNIFICATIVO — `.glass-card` (position: relative !important vs Tailwind .relative)

```css
/* style.css ~L450 */
.glass-card {
    position: relative !important;  /* ← !important */
    ...
}
```
In `index.html` L434:
```html
<div class="glass-card w-full max-w-3xl p-8 relative z-10 animate-fade-in mt-8">
```
**Conflitto:** `.glass-card` imposta `position: relative !important`, Tailwind `.relative` imposta `position: relative`. Stessa proprietà, stesso valore → il conflitto non cambia il rendering, ma l'`!important` è inutile.

---

### 🟡 — `.grid-cols-2` → display: flex !important (BUG REALE)

```css
/* style.css ~L448 (contesto landing-view) */
.grid-cols-2 { display: flex !important; }
```
In `index.html` L448:
```html
<div class="grid grid-cols-2 ...">
```
**BUG CONFERMATO:** Tailwind `.grid` imposta `display: grid`. La regola CSS imposta `display: flex !important`. L'`!important` **vince**, l'elemento viene renderizzato come `flex` invece che come `grid`. Questo probabilmente causa problemi di layout visivo.

---

### 🟡 — `.text-indigo-500` → display: block !important (BUG SOSPETTO)

```css
/* style.css ~L617 */
.text-indigo-500 { display: block !important; }
```
**BUG SOSPETTO:** `.text-indigo-500` è una classe Tailwind di colore (`color: rgb(99,102,241)`). Il file CSS la ridefinisce aggiungendo `display: block !important`. Qualsiasi elemento con `.text-indigo-500` che dovrebbe essere `inline`, `flex`, o `grid` viene forzato a `block`. Esempio trovato a L617.

---

## 3. CLASSI IN index.html NON PRESENTI IN style.css

### Classi non-Tailwind e non-CSS (23 classi orfane)

Queste sono classi usate in HTML ma non definite né in `style.css` né riconoscibili come Tailwind standard. **Candidati a errori o utility Tailwind non standard:**

| Classe | Tipo | Note |
|--------|------|------|
| `.-bottom-1` | Tailwind arbitrario | Variante negativa, rara |
| `.-right-1` | Tailwind arbitrario | Variante negativa |
| `.-translate-x-1/2` | Tailwind | Probabilmente mancante Tailwind CDN |
| `.-translate-x-[320px]` | Tailwind JIT | Richiede JIT compiler |
| `.-translate-y-1/2` | Tailwind | Idem |
| `.0` | ❌ ORFANA | Classe numerica — probabile errore di digitazione |
| `.accent-indigo-500` | Tailwind v3 | Stile per `<input>` e `<select>` |
| `.accent-indigo-600` | Tailwind v3 | Idem |
| `.admin-tab-btn` | ❌ ORFANA | Usata per le tab admin, non definita in CSS |
| `.after:absolute` | Tailwind JIT `after:` | Richiede Tailwind v3 JIT |
| `.after:bg-white` | Tailwind JIT | Idem |
| `.after:border` | Tailwind JIT | Idem |
| `.after:border-gray-300` | Tailwind JIT | Idem |
| `.after:border-slate-300` | Tailwind JIT | Idem |
| `.after:content-['']` | Tailwind JIT | Idem |
| `.after:h-4` | Tailwind JIT | Idem |
| `.after:left-[2px]` | Tailwind JIT | Idem |
| `.after:rounded-full` | Tailwind JIT | Idem |
| `.after:top-[2px]` | Tailwind JIT | Idem |
| `.after:transition-all` | Tailwind JIT | Idem |
| `.after:w-4` | Tailwind JIT | Idem |
| `.backdrop-blur-md` | Tailwind v3 | Potrebbe mancare dal CDN usato |
| `.backdrop-blur-sm` | Tailwind v3 | Idem |

> ⚠️ **Problema sistemico:** Le classi `after:*` (toggle switch a L627) richiedono **Tailwind v3 con JIT compiler**. Se il progetto usa il CDN classico di Tailwind v2/v3 senza JIT, queste classi non funzionano. L'elemento toggle switch (`<div class="w-9 h-5 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full ..."`) ha **20 classi** e dipende interamente da `after:*` e `peer-*` — funzionalità JIT.

---

## 4. CLASSI IN style.css MAI USATE IN index.html

72 classi definite in `style.css` non compaiono in `index.html`. Molte sono però **usate via JavaScript** (aggiunte dinamicamente a runtime). Classificate:

### Aggiute via JS a runtime (non dead code)

| Classe | Quando viene aggiunta |
|--------|-----------------------|
| `.font-dyslexic` | `toggleDyslexicFont()` → aggiunta a `<body>` |
| `.a11y-grayscale` | Pannello A11y → aggiunta a `<html>` |
| `.a11y-high-contrast` | Pannello A11y |
| `.a11y-invert` | Pannello A11y |
| `.a11y-low-contrast` | Pannello A11y |
| `.a11y-zoom-x15` | Sistema zoom accessibilità |
| `.a11y-zoom-x2` | Sistema zoom accessibilità |
| `.a11y-zoomed-modals` | Sistema zoom |
| `.a11y-zoom-x1` | Sistema zoom |
| `.highlighted` | Evidenziazione nodi nel grafo |
| `.dimmed` | Attenuazione nodi non selezionati |
| `.is-snapshotting` | Screenshot in corso |
| `.labels-hidden` | Nasconde label nodi |
| `.pathfinder-active` | Percorso attivo sul grafo |
| `.correct` / `.wrong` | Quiz: risposta corretta/errata |
| `.visible` | Overlay e lightbox |
| `.node-circle` | D3: cerchio del nodo |
| `.node-group` | D3: gruppo nodo |
| `.node-text` | D3: testo del nodo |
| `.link` | D3: linea di collegamento |
| `.link-label` | D3: etichetta del link |
| `.cross-link` | Link semantici tra vault |
| `.link-group` | D3: gruppo di link |
| `.loading-spinner` | Spinner di caricamento (JS) |
| `.ai-suggested` | Nodi suggeriti dall'AI |
| `.modal` | Aperto via JS (.classList.add) |

### ⚠️ Realmente orfane (probabili dead code)

| Classe | Nota |
|--------|------|
| `.a11y-btn` | Non trovata in HTML né in JS (rimpiazzata da `.btn_a11y_tool`?) |
| `.active-label` | Usata tramite JS `.sidebar-font-toggle` — verifica needed |
| `.animate-slideIn` | Definita ma non trovata in HTML (`.animate-fade-in` invece è usata) |
| `.btn-landing-secondary` | Non trovata in HTML |
| `.changeDistance` | Non trovata |
| `.changeFontScale` | Non trovata |
| `.ctx-item` | Context menu item — forse rimosso |
| `.danger` | Alert style — forse rimosso |
| `.desc-text` | Non trovata |
| `.floating-actions-container` | Non trovata |
| `.generate-btn` | Rimpiazzata da Tailwind? |
| `.grayscale-0` | Non trovata |
| `.hyphens-auto-force` | Non trovata in HTML |
| `.landing-font-toggle` | Non trovata |
| `.landing-input` | Non trovata |
| `.landing-textarea` | Non trovata |
| `.layout-card` | Non trovata (modal layout?) |
| `.layout-thumb` | Non trovata |
| `.level-btn` | Non trovata |
| `.lucide-play-circle` | Non trovata |
| `.lucide-trash` | Non trovata |
| `.minimized-layout-box` | Non trovata |
| `.mode-btn` | Non trovata |
| `.note-text` | Non trovata |
| `.sidebar-font-toggle` | Non trovata in HTML (il toggle è inline) |
| `.-translate-x-` / `.5` | Frammenti di parsing — non sono classi reali |

---

## 5. CONFLITTI TRA style.css E TAILWIND

### Conflitto 1 — `.grid-cols-2` → display: flex !important 🔴 BUG

```html
<!-- index.html L448 -->
<div class="grid grid-cols-2 ...">
```
```css
/* style.css */
.grid-cols-2 { display: flex !important; }  /* SOVRASCRIVE display:grid di Tailwind */
```
**Effetto:** L'elemento viene renderizzato come `flex` non come `grid`. Il layout a 2 colonne potrebbe non funzionare correttamente.

---

### Conflitto 2 — `.text-indigo-500` → display: block !important 🔴 BUG SOSPETTO

```html
<!-- index.html L617 -->
<div class="flex items-center ... text-indigo-500 ...">
```
```css
/* style.css */
.text-indigo-500 { display: block !important; }
```
**Effetto:** Qualsiasi elemento con `.flex` e `.text-indigo-500` viene forzato a `block`. Il `display: block !important` sovrascrive `display: flex` di Tailwind. **Questa è una classe di colore** che non dovrebbe mai impostare `display`.

---

### Conflitto 3 — `.glass-card` → position: relative !important vs `.relative` 🟡 Armonico

```html
<!-- index.html L434 -->
<div class="glass-card ... relative ...">
```
```css
.glass-card { position: relative !important; }
/* Tailwind .relative → position: relative; */
```
**Effetto:** Stesso valore, nessun danno visivo. Ma l'`!important` è inutile.

---

### Conflitto 4 — `.hidden` in CSS vs Tailwind 🟡 Intenzionale

```css
/* style.css */
.hidden { display: none !important; }
/* Tailwind .hidden → display: none; */
```
**Effetto:** Stessa proprietà, stesso valore. L'`!important` di CSS garantisce che `.hidden` vinca su qualsiasi altro `display` impostato inline o da altre regole. Probabile intenzionale — ma ridondante con Tailwind.

---

### Pattern sistemico: override Tailwind via ID+classe 🔴

Il pattern più pervasivo è usare selettori ID-specifici per forzare stili Tailwind:
```css
/* style.css — pattern ripetuto centinaia di volte */
#insegnai-drawer .gap-2 { gap: 8px !important; }
#insegnai-drawer .gap-3 { gap: 12px !important; }
#insegnai-drawer .mt-2  { margin-top: 8px !important; }
#projects-bar span.text-[8px] { font-size: 12px !important; }
```
Questo pattern sovrascrive Tailwind class per class, elemento per elemento, con `!important`. È il motivo dei 703 `!important`: ogni volta che Tailwind "vinceva", è stato aggiunto un `!important` al CSS custom.

---

## 6. ELEMENTI CON 6+ CLASSI

**374 elementi** con 6 o più classi. I casi estremi:

| Righe HTML | Tag | ID | N. classi | Classi notevoli |
|---|---|---|---|---|
| L627 | `<div>` | — | **20** | `after:*`, `peer-*` (toggle switch JIT) |
| L184 | `<div>` | — | **14** | `flex-grow bg-indigo-50 border font-mono font-bold tracking-widest` |
| L323 | `<div>` | — | **14** | `bg-white/95 backdrop-blur-md shadow-2xl border-y ... w-80` |
| L193 | `<input>` | — | **12** | `w-full px-4 py-3 ... font-mono text-lg focus_ring_standard` |
| L294 | `<div>` | — | **12** | `fixed inset-0 ... z-[2000] hidden items-center opacity-0` |
| L412 | `<div>` | — | **12** | `flex flex-col bg-indigo-600 rounded-r-2xl shadow-lg border-y` |
| L640 | `<div>` | — | **11** | `w-full bg-white border border-indigo-200 rounded-xl` |

**Elemento a 20 classi (L627)** — toggle switch:
```
w-9 h-5 bg-slate-600 peer-focus:outline-none rounded-full peer 
peer-checked:after:translate-x-full peer-checked:after:border-white 
after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
after:bg-white after:border-gray-300 after:border after:rounded-full 
after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500
```
Richiede Tailwind JIT. Senza JIT non funziona.

---

## 7. SPECIFICITÀ ANOMALA

### 7a. Uso di `!important` — 703 occorrenze

Le regole con `!important` si concentrano in 5 macro-aree del file:

| Area del CSS | Righe | !important stimati | Motivazione |
|---|---|---|---|
| `#insegnai-drawer` overrides | L95–290 | ~120 | Forzare font/layout nell'iframe |
| `#projects-bar` overrides | L620–680 | ~40 | Forzare font Tailwind nella barra |
| Landing view scaling | L700–850 | ~60 | Sistema zoom landing con `var(--landing-zoom)` |
| A11y panel + zoom system | L115–2530 | ~350 | Override di tutto per accessibilità |
| `.quiz-option` / `.source-type-btn` | L1914–2053 | ~50 | Vincere su regole meno specifiche |
| Altri | vari | ~83 | Sparsi |

### 7b. Selettori ad alta specificità — 274 occorrenze

I selettori con 3+ token o ID+classe includono:

```css
/* Alta specificità — esempi significativi */
body.font-dyslexic *:not(button):not(button *):not(.source-type-btn)  /* specificità max */
#insegnai-drawer > div:not(#insegnai-drawer-tab)                       /* ID + child + negation */
body.a11y-zoom-x15 #map-control-card .w-px                            /* body + ID + classe */
#landing-view .glass-card .source-type-btn                            /* ID + 2 classi */
#projects-bar span.text-\[8px\]                                       /* ID + tipo + classe */
#study-quiz-options .quiz-option                                       /* ID + classe */
```

**Il selettore più complesso trovato:**
```css
body.font-dyslexic *:not(button):not(button *):not(.source-type-btn):not(.source-type-btn *)
```
Questa regola applica il font OpenDyslexic a TUTTO tranne button e `.source-type-btn`. È funzionalmente corretta ma ha specificità altissima.

### 7c. Stili inline — 17 occorrenze

| Riga | Elemento | Stile | Note |
|------|----------|-------|------|
| L414 | `<div>` | `writing-mode: vertical-rl; text-orientation: mixed` | Testo verticale — OK come inline |
| L489 | `<span>` | `color: slate-900` | ⚠️ **ERRORE**: `slate-900` non è un valore CSS valido. Dovrebbe essere `#0f172a` o `color: rgb(15,23,42)` |
| L839 | `<div>` | `margin-top: 4px; line-height: 1.8em; font-size: 18px` | Potrebbe essere classe CSS |
| L1708 | `<input#mappai-ipad-vault-file-picker>` | `display: none` | OK — input nascosto |
| L1758 | `<div#layout-manager-box>` | `transform: scale(0.95); transition: transform 0.2s` | Gestito anche via JS |
| L2132–2165 | 12× `<button>` | `background: #00f2ff`, `#3b82f6`, ecc. | Palette colori per il color picker — necessari come inline |

> ⚠️ **Bug L489:** `color: slate-900` non è CSS valido. Il browser ignora questa dichiarazione. Il colore atteso non viene applicato.

---

## Priorità di intervento

### 🔴 Priorità Alta — Fix immediati

1. **`.grid-cols-2 { display: flex !important }`** → rimuovere o rinominare. Causa bug di layout.
2. **`.text-indigo-500 { display: block !important }`** → rimuovere. Classe di colore che non deve impostare display.
3. **`style="color: slate-900"` a L489** → cambiare in valore CSS valido (`#0f172a`).
4. **Classi `after:*` e `peer-*`** → verificare che il CDN Tailwind usato supporti JIT, altrimenti il toggle a 20 classi non funziona.

### 🟡 Priorità Media — Pulizia progressiva

5. **Rimuovere le 24 classi CSS realmente orfane** (`.a11y-btn`, `.btn-landing-secondary`, `.ctx-item`, ecc.)
6. **Separare le definizioni spezzate** (es. `.tts-button` definita in L48 e L95 — unificare in un blocco solo)
7. **Unificare i colori di `.pathfinder-active`** — `#eab308` vs `#f59e0b` — scegliere uno
8. **Ridurre l'`!important` nell'area `#insegnai-drawer`** — usare specificità tramite selettore invece

### 🟢 Priorità Bassa — Refactoring futuro

9. Estrarre le utility CSS duplicate da `style.css` in classi Tailwind per eliminare il conflitto strutturale
10. Considerare di spostare gli stili inline della palette colori (L2132–2165) in un CSS custom property system
