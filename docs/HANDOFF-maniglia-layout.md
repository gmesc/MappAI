# HANDOFF — la maniglia e il bordo dell'area (CHIUSO, 14 agosto 2026)

> ⚠️ **Diario di un problema risolto**, non lo stato del repo.
> Lo stato sta in **[`HANDOFF.md`](HANDOFF.md)**; le regole di costruzione in
> **[`../GUIDA-ARCHITETTO.md`](../GUIDA-ARCHITETTO.md)** (la trappola è la §8.19).
> Aperto il 14/8 dopo la seconda sovrapposizione in due giorni, chiuso lo stesso
> giorno con la strada **A** scelta da Giacomo: **margini nell'area**.

---

## 0. Il fatto, in una riga

**La maniglia della colonna occupa l'angolo in alto a sinistra dell'area della
console — 34×34, sopra qualunque cosa ci sia — e nessuna regola lo dichiarava.**
Ogni comando messo lì dentro finiva sotto la maniglia; è successo due volte in
due giorni, con due pezze diverse. Ora il posto è **riservato una volta per
tutte le console**, e il numero è derivato dalla taglia della maniglia.

---

## 1. La cura, in tre righe di CSS

| dove | che cosa |
|---|---|
| `public/css/mappai-console-manifesto.css` (~568) | `.mm-console__area` prende `padding-left: max(--mnc-area-pad-x, --mnc-man-x + --mnc-man-size)` |
| `public/js/mappai-doc-editor.js` (~3123) | la barra dell'editor passa da `46px` scritti a mano a `calc(var(--mnc-man-size, 34px) + 12px)` |
| `GUIDA-ARCHITETTO.md` §8 | trappola 19: «l'area della console non comincia al suo bordo sinistro» |

Tre scelte dentro la cura, e sono il motivo per cui non è una terza pezza:

1. **Una regola per TUTTE le console**, non due eccezioni per ELABORA e Cabina.
   Due eccezioni lasciano pagare il conto alla terza console — che è esattamente
   la malattia da cui si veniva.
2. **Il numero è derivato, non scritto**: la taglia e la posizione della maniglia
   sono leve dell'officina (`--mnc-man-size`, `--mnc-man-x`). Se domani la
   maniglia cresce, il margine la segue da sé.
3. **Costo reale 10px**, non 34: l'area ne pagava già 24 di suo. Il `max()` prende
   il maggiore fra il respiro dell'area e l'ingombro della maniglia.

**L'unica eccezione dichiarata** è la console-EDITOR (`:has(.mm-tela)`, selettore
più specifico): lì l'area sta a `padding:0` perché il foglio è a filo, e il posto
lo riserva la barra del documento — con lo stesso token, così il numero resta uno.

---

## 2. Il censimento, dopo (14/8, finestra 1280×768, colonna aperta e chiusa)

Script: `scratchpad/censimento.js` della sessione (CDP: rettangoli che si
intersecano + `elementFromPoint` nel punto di contatto, che è la verità su chi
sta sopra). Va rifatto dopo ogni intervento sulla maniglia o sull'area.

| console · vista | primo contenuto (aperta / chiusa) | esito |
|---|---|---|
| **ELABORA · elenco documenti** | «Crea nuovo» a x=**306** / x=**34** | ✅ (prima 296 / 24 → 10px coperti) |
| ELABORA · documento aperto | barra a x=272 / x=17, testo +46 | ✅ |
| INSEGNA | nessun elemento a quella quota | ✅ |
| CABINA · profilo | primo campo a x=322 / x=50 | ✅ (prima 312 / 40) |

**Zero elementi dell'area sotto la maniglia, in tutte e quattro le console e in
entrambi gli stati.** In ogni riga il primo contenuto comincia **esattamente** al
bordo destro della maniglia (306 e 34): è il segno che il posto riservato è
tarato, non abbondante. Suite **1075 pass / 0 fail / 2 skip**.

---

## 3. Due trappole pagate strada facendo

1. **La maniglia sembrava non muoversi a colonna chiusa** — misurata ferma a
   x=272 con l'area già a x=0, cioè a mezz'aria in mezzo al contenuto. Non era
   vero: la finestra Electron stava in secondo piano e **le transizioni CSS
   restano congelate sul frame di partenza** (trappola §8.1 della guida, terza
   volta). `getComputedStyle` serviva il valore di partenza. Spente le
   transizioni (`* { transition: none !important }` iniettato dopo ogni reload),
   la maniglia è a x=**0** da chiusa, come il foglio dice. **Un censimento che
   misura una geometria animata a finestra nascosta scrive numeri falsi.**
2. **Un apice inverso in un commento dentro il template literal** del CSS di
   `mappai-doc-editor.js` ha chiuso la stringa: `window.MappAIDocEditor` non
   nasceva più, e la console ELABORA ripiegava in silenzio sul workspace v1
   (`open()` esce subito se l'editor non c'è). Ottava volta nel progetto; il
   commento ora lo dichiara sul posto. `node --check` sul file prima di provare.

---

## 4. Dove guardare

| | |
|---|---|
| la maniglia (markup) | `consoleHtml` in `public/js/mappai-modal.js` (~559) |
| la maniglia (stile base) | `.mm-console__man` in `public/css/mappai-modal-tokens.css` (~1512) |
| la maniglia (veste manifesto, angolo in alto a sinistra) | `public/css/mappai-console-manifesto.css` (~285) |
| **il posto riservato** | `.mm-console__area` in `public/css/mappai-console-manifesto.css` (~568) |
| l'eccezione della console-EDITOR | `.mm-console__area .de-bar` in `public/js/mappai-doc-editor.js` (~3123) |
| le leve dell'officina | `t.maniglia` in `public/js/mappai-console-bento.js` (~535) |
