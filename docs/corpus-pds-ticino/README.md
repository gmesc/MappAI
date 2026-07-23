# Corpus — Traguardi di apprendimento (Piano di studio della scuola dell'obbligo ticinese)

Corpus dei **traguardi di apprendimento** declinati per ogni traguardo di competenza,
raccolti dal portale ufficiale <https://pianodistudio.edu.ti.ch> il **2026-07-21**.

## Perché esiste

Il PDF `Piano-di-studio-perfezionato.pdf` (fonte di `public/data/piano-studio-ticino.json`)
contiene solo la **descrizione** di ogni traguardo di competenza (campo `description`).
La declinazione fine — *obiettivi di conoscenza, abilità, processi/strategie, atteggiamenti*,
ovvero i **traguardi specifici di apprendimento** — vive solo sul portale web, pagina
«Traguardi di competenza» di ciascuna disciplina. Questo corpus la recupera e la usa per
popolare il campo `traguardi[]` (prima quasi ovunque vuoto).

## Struttura

```
docs/corpus-pds-ticino/
├── README.md                 ← questo file
├── _inventario-fonti.md      ← URL sorgente per disciplina
├── testo-pagine/             ← testo pulito verbatim, una .md per disciplina (provenance in header)
└── estratti-json/            ← estratto strutturato per-codice, una .json per disciplina
```

## Copertura

| Prefix | Disciplina | File corpus | Traguardi di competenza | Stringhe traguardi | Declinato per categoria |
|---|---|---|---:|---:|---|
| ITA | Italiano | 01-italiano.md | 47 | 247 | sì |
| L2 | Lingue seconde | 03-lingue-seconde.md | 38 | 129 | sì |
| LAT | Latino | 04-latino.md | 9 | 140 | sì |
| MAT | Matematica | 02-matematica.md | 45 | 0 | no (solo descrizioni) |
| GEO | Geografia | 05-geografia.md | 8 | 0 | no (solo descrizioni) |
| STO | Storia | 06-storia.md | 15 | 100 | sì |
| ECCD | Ed. civica (ECCD) | 07-educazione-civica.md | 4 | 36 | sì |
| SN | Scienze naturali | 08-scienze-naturali.md | 14 | 96 | sì |
| EAL | Ed. alimentare | 09-educazione-alimentare.md | 33 | 79 | sì |
| SRE | Storia religioni | 10-storia-religioni.md | 5 | 0 | no (solo descrizioni) |
| EV | Ed. visiva | 11-educazione-visiva.md | 11 | 0 | no (solo descrizioni) |
| EM | Ed. musicale | 13-educazione-musicale.md | 11 | 0 | no (solo descrizioni) |
| EAP | Arti plastiche | 12-arti-plastiche.md | 11 | 0 | no (solo descrizioni) |
| EF | Ed. fisica | 14-educazione-fisica.md | 24 | 0 | no (solo descrizioni) |
| IRC | Ins. religioso (IRC/IRE) | 15-insegnamento-religioso.md | 7 | 0 | no (solo descrizioni) |

**Non raccolte:** *Studio d'ambiente* (AMB) e *Opzioni di orientamento IV media* (AMM) —
il loro `traguardi[]` era già completo nel JSON e non hanno pagina «traguardi» separata sul portale.

**«Declinato per categoria = no»** significa che il portale, per quella disciplina, pubblica
il traguardo come sola descrizione (già presente nel JSON come `description`): non c'è dettaglio
aggiuntivo da estrarre. Nessuna categoria è stata inventata. Motivi noti dalla fonte:
- **Matematica / Educazione fisica**: il portale dichiara che i traguardi generali non fanno
  riferimento alle dimensioni della personalità → nessuna declinazione (catturato l'*ambito*
  tematico nel campo extra `ambito` dell'estratto).
- **Geografia, Storia delle religioni, Arti (EV/EM/EAP), Ins. religioso**: pagine con sola descrizione.

## Come è stato integrato in `piano-studio-ticino.json`

Merge deterministico (script `merge_traguardi.py`, in scratchpad): per ogni traguardo estratto
il codice del portale (zero-padded, es. `STO.III.01`) è stato normalizzato al codice JSON
(`STO.III.1`) e il suo array di traguardi accumulato nel campo `traguardi[]` della competenza
corrispondente. Formato di ogni stringa: `«<Categoria>: <testo verbatim>»` con categorie
canoniche `Conoscenza:` / `Abilità:` / `Processo:` / `Atteggiamento:` (coerenti con lo
schema preesistente di AMB/EAL).

Risultato: **115 competenze** popolate (ITA +44, L2 +23, LAT +9, STO +15, ECCD +4, SN +14),
906 stringhe di traguardi totali nel JSON. Backup pre-merge:
`public/data/piano-studio-ticino.json.bak-pre-portale`.

### Correzione dato applicata
`SN.III.2.SPI` era **duplicato** nel JSON (il PDF aveva ripetuto il codice); il portale
ufficiale codifica il secondo traguardo — «trasferimenti conduttivi tra sistemi» — come
`SN.III.3.SPI`. Il codice è stato corretto in fase di merge, confermato dalla fonte.

## Licenza / attribuzione

© **Divisione della scuola – Repubblica e Cantone Ticino** (DECS).
Da `pianodistudio.edu.ti.ch/informazioni-legali/`: contenuti di proprietà esclusiva dello
Stato; **uso didattico consentito**; riproduzione/distribuzione **non commerciale** con
**citazione della fonte**. Il testo è riprodotto verbatim (refusi della fonte inclusi) per
fedeltà; usare solo in contesti educativi con attribuzione.

## Note tecniche (per rigenerare)

Il portale è WordPress + Elementor. I traguardi di molte discipline (ITA, MAT, L2, Arti…)
sono *custom post type* `traguardo_di_compete` caricati client-side (Ajax Search Pro): il
fetch statico HTML vede solo il 1° ciclo. Percorsi affidabili usati:
- pagine di dettaglio `/traguardo-di-competenza/<slug>/` (HTML server-side) per il testo verbatim;
- REST WordPress `wp/v2/traguardo_di_compete?tags=<id>` per l'elenco completo di codici e cicli;
- accordion Elementor server-side (Latino, Storia, Ed. civica) letti direttamente dall'HTML.

`WebFetch` da solo non basta: il suo riassuntore rifiuta la riproduzione verbatim e non vede
i contenuti AJAX. Rifare l'estrazione con fetch diretto dell'HTML/REST, non con riassunto.
