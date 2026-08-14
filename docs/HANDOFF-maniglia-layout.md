# HANDOFF — la maniglia e il bordo dell'area (aperto)

> ⚠️ **Piano di lavoro su un problema aperto**, non lo stato del repo.
> Lo stato sta in **[`HANDOFF.md`](HANDOFF.md)**; le regole di costruzione in
> **[`../GUIDA-ARCHITETTO.md`](../GUIDA-ARCHITETTO.md)**.
> Scritto il **14 agosto 2026** dopo la seconda sovrapposizione in due giorni.
> Si chiude quando la fascia della maniglia è una regola sola, misurata, e il
> censimento qui sotto torna pulito su tutte le console.

---

## 0. Il fatto, in una riga

**La maniglia della colonna sconfina di 34px dentro l'area della console, in
ogni vista e in tutti e due gli stati** — e nessuna superficie lo sa. Ogni volta
che qualcuno mette un comando in alto a sinistra nell'area, quel comando finisce
sotto la maniglia. È già successo due volte in due giorni, con due rimedi
diversi: la seconda volta l'ho corretta con un `padding-left` sulla barra
dell'editor (commit `293fa6b`), cioè **un'altra pezza**, non la regola.

---

## 1. Il censimento, misurato (14/8, finestra 1280×768)

`node tools/smoke/…` non arriva qui: serve l'app vera. Lo script usato sta in
`scratchpad/cdp-censimento-maniglia.js` della sessione (CDP: rettangoli che si
intersecano + `elementFromPoint` nel punto di contatto, che è la verità su chi
sta sopra). Va **rifatto dopo ogni intervento** — è la prova che il difetto non
torna.

| console · vista | colonna | esito |
|---|---|---|
| **ELABORA · elenco documenti** | aperta | 🔴 **«Crea nuovo» coperto per 10px** |
| **ELABORA · elenco documenti** | chiusa | 🔴 **«Crea nuovo» coperto per 10px** |
| ELABORA · documento aperto | aperta/chiusa | ✅ (dal `padding-left:46px` di `293fa6b`) |
| INSEGNA | aperta/chiusa | ✅ nessun elemento sotto |
| CABINA · profilo | aperta/chiusa | ✅ (il primo campo comincia a x=312 / x=40) |

Costanti in ogni riga: maniglia `34×34` a `y 65-99`, **sconfino nell'area: 34px**
sempre; `--mm-console-side: 272px`.

⚠️ **Il difetto vivo è uno: «Crea nuovo» di ELABORA.** In entrambi gli stati la
maniglia gli sta sopra per 10px — il bottone parte a x=296 (colonna aperta) e a
x=24 (chiusa), la maniglia arriva a 306 e a 34.

⚠️ **Trappola del censimento, pagata**: il primo giro diceva «Crea nuovo» anche
in INSEGNA e nella Cabina. Non era vero — quelle console non si erano aperte e
si stava rimisurando ELABORA. Le console **non si aprono una sopra l'altra**: fra
una misura e l'altra ci vuole `Page.reload`, e la sonda deve dichiarare CHI sta
misurando (identità della vista), o si scrive un censimento falso.

---

## 2. Perché ricapita (la causa, non il sintomo)

La maniglia è **`position:absolute` sul confine, con `transform:translateX(-50%)`**:
sta a cavallo fra colonna e area per scelta di disegno (Giacomo, 2/8: «il comando
è dove l'occhio cerca il pannello»). Quindi metà del suo corpo è **dentro**
l'area, sopra qualunque cosa ci sia — e chi disegna una vista non ha modo di
saperlo: nel CSS dell'area non c'è **niente** che dica «i primi 34px in alto a
sinistra sono occupati».

Ogni superficie nuova che mette un comando lì dentro ripaga lo stesso prezzo, e
lo scopre solo chi misura (o Giacomo, provando). Le due pezze finora:
`padding-left:46px` sulla barra dell'editor (`.mm-console__area .de-bar`) — e
prima ancora, nel disegno originale, il fatto che le viste avessero contenuto
più in basso.

---

## 3. Le strade, con quello che costano

Nessuna è stata scelta: **è una decisione di layout, e la prende Giacomo.**

**A. Una fascia riservata, dichiarata nei token** *(la mia raccomandazione)*
`--mm-console-man-gutter: 34px` in `mappai-modal-tokens.css`, e
`.mm-console__area { padding-left: var(--mm-console-man-gutter); }` — o meglio
solo sulla prima riga di contenuto, per non spostare tabelle e bento interi.
· *pro*: una leva sola, vale per costruzione anche per le viste di domani;
il censimento torna pulito ovunque senza toccare le singole superfici.
· *contro*: 34px in meno di larghezza utile a sinistra in TUTTE le viste, anche
dove non serve; da verificare su bento e tabelle (che oggi partono dal bordo).

**B. La maniglia esce dall'area**
Vive tutta dentro la colonna quando è aperta, e in una fascia sua quando è
chiusa (niente `translateX(-50%)`).
· *pro*: zero sovrapposizioni per costruzione, nessuno spazio perso nell'area.
· *contro*: cambia il disegno approvato il 2/8 — la maniglia non è più «sul
filo»; e a colonna chiusa un posto glielo si deve dare comunque.

**C. La maniglia sale nella testata della console**
Accanto al titolo, come un comando qualunque.
· *pro*: il problema sparisce del tutto e la testata è già una riga di comandi.
· *contro*: perde il legame visivo col pannello che apre e chiude — era il punto
del disegno originale.

**D. Solo la pezza puntuale** (padding su «Crea nuovo» come per la barra)
· *pro*: cinque minuti.
· *contro*: è la terza pezza; alla quarta superficie si ripaga di nuovo.

---

## 4. Il primo gesto della prossima sessione

1. Rifare il censimento (§1) per confermare che il quadro non è cambiato.
2. Chiedere a Giacomo A/B/C (§3) — con lo screenshot dei due stati sotto gli
   occhi, perché è una scelta che si vede.
3. Applicare, poi **rifare il censimento**: pulito su tutte le console e in
   entrambi gli stati, altrimenti non è finita.
4. Se si sceglie A, aggiungere il token alla tabella dei token della console e
   scrivere in `GUIDA-ARCHITETTO.md` §8 la trappola: *«l'area della console non
   comincia al suo bordo sinistro»*.

## 5. Dove guardare

| | |
|---|---|
| la maniglia (markup) | `consoleHtml` in `public/js/mappai-modal.js` (~riga 559) |
| la maniglia (stile, posizione, stati) | `.mm-console__man` in `public/css/mappai-modal-tokens.css` (~1512) |
| l'animazione di scivolamento e flip | stesso blocco, `transition` + `@keyframes mm-man-flip` (14/8) |
| la veste manifesto (sostituisce l'icona a ogni toggle) | `vestiManiglia` in `public/js/mappai-console-manifesto.js` |
| la pezza già in casa | `.mm-console__area .de-bar` in `public/js/mappai-doc-editor.js` |
| il bottone che oggi sta sotto | «Crea nuovo» di ELABORA — `_schemaV2` in `public/js/mappai-elabora-console.js` |
