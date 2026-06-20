# Rule 08 — Modali, icone e form

## Regola
- I modali creati **via JavaScript** usano la gerarchia di classi `.pm-*` definita in
  `index.html`, e devono chiamare `window.safeCreateIcons()` **dopo** l'append al DOM.
- Ogni `<button>` dentro un `<form>` deve avere `type="button"` per evitare submit accidentali.

## Perché
- Le icone (Lucide) vengono renderizzate da `safeCreateIcons()` — hub globale chiamato da
  decine di funzioni. Se non la chiami dopo aver iniettato `<i data-lucide=...>`, le icone
  restano vuote.
- Un `<button>` senza `type` dentro un form fa **submit** di default → ricarica/reset
  imprevisto della UI.

## Gerarchia `.pm-*` (prompt-modal)
- Header: `pm-icon-wrap` + `pm-title` + `pm-subtitle`.
- Gruppi opzioni: `pm-section` + `pm-section-title`.
- Opzioni (radio/checkbox): `pm-option` + `pm-option-label` + `pm-option-desc`.
- Footer: `pm-btn-cancel` / `pm-btn-primary`.

## Fai
```js
const modal = document.createElement('div');
modal.innerHTML = `... <i data-lucide="puzzle"></i> ...`;
document.body.appendChild(modal);
window.safeCreateIcons();        // ← sempre dopo l'append
```
```html
<button type="button" onclick="window.doThing()">Azione</button>
```

## Rendering dopo modifica al DOM
- Dopo aver iniettato HTML con formule: `window.renderLatexInElement(el)` (KaTeX).
- Dopo aver iniettato icone Lucide: `window.safeCreateIcons()`.

## Non fare
- ❌ Bottoni in form senza `type="button"`.
- ❌ Dimenticare `safeCreateIcons()` dopo l'append → icone invisibili.
- ❌ Stili modale ad-hoc quando esiste già la gerarchia `.pm-*`.

## Riferimenti
- `safeCreateIcons` — `public/js/app.js` (~riga 3)
- Esempi modale dinamico corretto: `public/js/mappai-active-study.js` (`buildModal`),
  `public/js/mappai-timeline.js`.
