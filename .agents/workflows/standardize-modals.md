---
description: 
---

# Standardize Modals Layout
description: This workflow standardizes the UI layout of modals in MappAI to match the "Edit Contenuto" modal style.

## Introduzione
Questo workflow serve per standardizzare la grafica e la struttura HTML di tutti i modali del progetto MappAI, in modo da avere un'interfaccia utente coesa e professionale, basata sull'ottimo design del modale "Edit Contenuto".

## Quando usare questo workflow
- Quando il file `/Users/giacomomeschini/Antigravity/MappAI/public/index.html` viene modificato per aggiungere o alterare un modale.
- Quando l'utente chiede di "standardizzare un modale", "sistemare la grafica di un popup", o "uniformare il layout al modale Edit Contenuto".

## Regole di Struttura e Classi Tailwind

Per ogni modale (popup) nel progetto, assicurati che la struttura HTML rispetti questi esatti parametri:

### 1. Sfondo (Backdrop)
Il contenitore principale che oscura lo schermo deve avere queste classi:
```html
<div id="ID-DEL-MODALE" class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[1000] hidden items-center justify-center p-4 opacity-0 transition-opacity duration-200">
```
*(Nota: la presenza di `hidden` e `opacity-0` è gestita dai Javascript per le animazioni di apertura/chiusura)*.

### 2. Contenitore Principale (Box)
Il pannello bianco centrale del modale deve avere un layout arrotondato e con ombra marcata. Le dimensioni possono variare (es. `max-w-[1200px]` per modali grandi o `w-dvw max-w-[75dvw]` per modali più piccoli come l'edit del titolo), ma lo stile di base deve essere:
```html
<div class="bg-white rounded-2xl shadow-2xl p-8 transform scale-95 transition-transform duration-200 relative" id="ID-DEL-BOX">
```

### 3. Pulsante di Chiusura (In alto a destra)
Devesi usare l'icona Lucide `x` posizionata in assoluto in alto a destra:
```html
<button onclick="FUNZIONE_CHIUSURA()" class="absolute top-8 right-8 text-slate-400 hover:text-slate-600 transition-colors">
    <i data-lucide="x" class="w-6 h-6"></i>
</button>
```

### 4. Icona e Titolo del Modale (In alto a sinistra)
Tutti i modali devono avere un'icona tematica (es. `edit-3`, `settings`, `image`, ecc.) gigante in alto a sinistra, usando la classe `modal_title` o formattata come segue:
```html
<h3 class="modal_title"><i data-lucide="NOME-ICONA" class="w-16 h-16 pl-4"></i></h3>
```

### 5. Contenitore dei Campi (Scrollable)
Il blocco che contiene i form e i contenuti deve avere un layout verticale spaziato (`space-y-6`), e se il contenuto è lungo deve supportare lo scroll (`max-h-[70vh] overflow-y-auto modal-scroll`). Anche se non serve lo scroll, mantieni il padding interno:
```html
<div class="space-y-6 max-h-[70vh] overflow-y-auto pl-4 pr-4 modal-scroll">
    <!-- CONTENUTI QUI -->
</div>
```

### 6. Stile dei Campi e dei Titoli Interni
Per raggruppare i titoli dei campi, usa la classe `modal_field_title`. Per gli input o le textarea, usa le utility di bordo arrotondato e il custom focus ring (`focus_ring_standard` se definito, o le utility per ring indigo):
```html
<div>
    <div class="flex justify-between items-center mb-1">
        <label class="modal_field_title" data-i18n="chiave_traduzione">Nome del campo</label>
    </div>
    <input type="text" class="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus_ring_standard">
</div>
```

### 7. Pulsanti Annulla e Salva (In basso)
In fondo al `<div>` dei contenuti (o come ultimo elemento del `space-y-6`), inserisci la barra delle azioni alignata a destra (`justify-end`), alta 11px o standard (`h-11`), usando sempre le classi del design system `btn_annulla_action` e `btn_salva_action`:
```html
<div class="mt-8 flex gap-3 justify-end h-11">
    <button onclick="FUNZIONE_ANNULLA()" class="btn_annulla_action"><span data-i18n="btn_cancel">Annulla</span></button>
    <button onclick="FUNZIONE_SALVA()" class="btn_salva_action"><span data-i18n="btn_salva">Salva</span></button>
</div>
```

## Come eseguire il workflow
1. Apri `/Users/giacomomeschini/Antigravity/MappAI/public/index.html`.
2. Trova il modale che necessita di essere standardizzato.
3. Applica tutte le 7 regole sopra riportate aggiornando le classi Tailwind e la struttura dei `<div>`.
4. Controlla che le animazioni e i comportamenti Javascript (es. rimozione di `hidden` e interpolazione di `opacity-100` / `scale-100`) non vengano intaccati dalla modifica delle classi HTML (questo richiede di preservare gli `id` e di non rimuovere le transition base come `transition-opacity` o `duration-200`).
