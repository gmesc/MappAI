# Quickstart di verifica — Riorganizzazione Menu (001-menu-reorg)

Guida di validazione end-to-end. Prerequisito: una mappa di prova
(es. `public/esempi/formato-esempio-claude.json` importabile da "Apri JSON").

## Setup

```bash
cd "/Users/giacomomeschini/Claude/MappAI re"
npm test        # suite Node: deve restare verde (nessun test nuovo atteso)
npm start       # avvia Electron
```

## Scenari di verifica

### US1 — Launcher Studio attivo (P1)

1. Apri una mappa → guarda il bordo destro: i bottoni 📝 (Cloze), 🎯
   (padronanza), 🔥 (lavoro) NON devono esserci; i flottanti restanti
   (celeration, percorso, palazzo, giochi) sono compattati verso l'angolo.
2. Menu azioni rapide (basso-sinistra) → "Studio attivo" → nel launcher,
   sotto le 7 modalità, compare la sezione con Cloze + Heat map + Mappa lavoro.
3. Avvia Cloze dalla card → l'esercizio parte identico a prima (item, verifica,
   punteggio a fine sessione).
4. Riapri il launcher → attiva "Heat map" → il grafo si tinge
   grigio/ambra/verde; la card (riaprendo) mostra stato attivo.
5. Attiva "Mappa lavoro" → tinta indaco; la vista padronanza si spegne da sola
   (mutua esclusione preservata).
6. Disattiva la vista dalla stessa card → colori originali.

### US2 — Sezione Output Materiali di Studio (P2)

1. Apri il menu azioni rapide → sezione etichettata "Output Materiali di
   Studio" con: Foglio nodi, Sintesi di ramo, Stampa dossier, Crea Timeline,
   Esporta JIGSAW, Ricomponi copie, Revisione lacune.
2. Clicca ogni voce → ciascuna apre lo stesso modale/flusso di prima.
3. Le azioni file/vault (Importa JSON, Esporta Vault, Unisci mappe…) restano
   sopra, visivamente separate.

### US3 — i18n (P3)

1. Cambia lingua in EN → header sezione, card launcher e voci menu in inglese.
2. Torna a IT → tutto torna in italiano (nessuna etichetta resta in EN).
3. Check statico chiavi:

```bash
# ui_output_materials deve esistere in ENTRAMBI i dizionari
grep -c "ui_output_materials" public/traduzioni/it_translations.js public/traduzioni/en_translations.js
# chiavi as_* nuove devono esistere in en_translations.js
grep -c -E "as_views_header|as_cloze_title|as_heatmap_title|as_effort_title" public/traduzioni/en_translations.js
```

### Reversibilità (FR-009)

1. DevTools console: `localStorage.setItem('mappai_legacy_float_btns','1')` →
   ricarica → i 3 bottoni flottanti tornano alle posizioni storiche e i 4
   restanti tornano alle posizioni storiche (nessuna sovrapposizione).
2. `localStorage.removeItem('mappai_legacy_float_btns')` → ricarica → nuovo
   layout.

### Regressioni da escludere

- Sessione di Studio attivo in corso: le viste non si applicano durante la
  sessione (comportamento invariato).
- Mappa KG senza root: launcher mostra il banner esistente; le 3 nuove card
  restano disponibili (nessuna dipende dalla gerarchia).
- Mappa mai studiata: Heat map/Mappa lavoro mostrano tutto neutro senza errori.

## Esito atteso

Tutti gli scenari passano + suite Node verde + zero errori console in Electron.
