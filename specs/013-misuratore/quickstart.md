# Quickstart — validazione di MappAI - misuratore

**Spec**: [spec.md](./spec.md) · **Piano**: [plan.md](./plan.md) · **Contratti**: [contracts/](./contracts/)

Scenari eseguibili che dimostrano che la feature funziona. Ognuno è legato a una fase di consegna del piano: si esegue **quando quella fase è finita**, non alla fine di tutto.

## Prerequisiti

- Node 20+ e il repo `MappAI re` clonato.
- I due vault reali presenti: `~/Documents/MappAI - file/Mappe/{1A,1B}/Funzioni Urbane`. Sono il banco di prova di tutto: senza, gli scenari 2, 4 e 5 non si possono eseguire.
- `~/Documents/MappAI - file/Classi/classi.json` con 1A a registro `medio` e 1B a `semplice`.
- Nessuna chiave API necessaria salvo per lo scenario 8.

```bash
cd "MappAI - misuratore" && npm install
```

---

## Scenario 1 — L'app si apre e ricorda (fase 1 · US2)

```bash
cd "MappAI - misuratore" && npm start
```

Attesi: tre tab ANALIZZA · ANDAMENTO · METODO; `MappAI - misuratore - FILE/Upload/` e `/Report/` create se assenti; contenuto largo 1100px; nessun errore in console; nessuna richiesta di rete (verificare nel pannello network: zero chiamate esterne — FR-051).

Importare `Mappe/1A/Funzioni Urbane`, poi `Mappe/1B/Funzioni Urbane`.

Attesi: due elementi distinti, `1A · Funzioni Urbane` e `1B · Funzioni Urbane` — **non** due voci omonime né una sovrascritta (FR-003); ciascuna con classe, registro, data e conteggio nodi; due cartelle in `Upload/` con la copia integrale. Chiudere e riaprire l'app: gli elementi sono ancora lì (FR-005).

---

## Scenario 2 — I 30 valori del 2026 (fase 2 · US1 · SC-001)

**Lo scenario più importante.** Se fallisce, la calibrazione di [research.md](./research.md) è stata invalidata da una modifica alle definizioni.

```bash
cd "MappAI - misuratore" && npm test -- --test-name-pattern="riferimento-2026"
```

Attesi, esattamente:

| | 1A | 1B |
|---|---|---|
| Nodi · L1 · L2 · L3 · profondità | 32 · 6 · 10 · 15 · 3 | 43 · 7 · 15 · 20 · 3 |
| Link · verbi distinti · ricchi · generici | 46 · 13 · 21 · 54,3% | 58 · 18 · 21 · 63,8% |
| Parole/nodo L1 · L2 · L3 | 53,0 · 41,9 · 39,7 | 53,3 · 38,6 · 38,5 |
| Parole/nodo tutti · dev.std | 42,4 (24-74) · 9,7 | 40,6 (24-61) · 7,8 |
| Corpus nodi: parole · frasi · parole/frase | 1357 · 98 · 13,85 | ~1745 · 133 · ~13,1 |
| Gulpease nodi · parole lunghe | 56,6 ±0,2 · 26,2% | 56,8 ±0,2 · 28,3% |

Le due righe 1B con la tilde tollerano lo scarto di 3 parole documentato in R1. **Non** sono attesi i valori pubblicati di nominalizzazioni, connettivi, passive, marcatori e dell'intero corpus sintesi: R1 ha dimostrato che non sono riproducibili, e SC-001 li esclude.

Poi, da UI: selezionare i due elementi, «Avvia analisi».

Attesi: un file in `Report/` con nome `AAAA-MM-GG · …`; il report si apre nell'app; contiene le tabelle con colonna Δ, la scala Gulpease con le tacche 40/60/80, le coppie di nodi con etichetta identica a testo integrale, i nodi esclusivi, la sezione «limiti»; il corpo pagina non scorre in orizzontale.

---

## Scenario 3 — Il profilo governa davvero, e non si può rompere (fase 3 · US8)

Da METODO, cercare «parola lunga»: devono comparire valore, definizione, motivo e limite (FR-053).

Portare la velocità di lettura da 120 a 150 e salvare.

Attesi: nasce un profilo nuovo con identificativo proprio; il profilo predefinito è intatto; il report dello scenario 2 è invariato (FR-055).

Rigenerare l'analisi con il profilo nuovo: il tempo di lettura e il componente 7 cambiano; il nuovo report porta l'identificativo nuovo.

Poi tentare di rompere il profilo — portare un peso a 40 lasciando gli altri, e invertire due ancoraggi.

Attesi: salvataggio **rifiutato**, con il vincolo violato indicato per nome (FR-033-ter). Infine «Ripristina predefinito»: torna il predefinito, il profilo personalizzato **non** è cancellato (FR-056).

---

## Scenario 4 — Baseline e copertura, mai una senza l'altra (fase 4 · US3)

`1B/Funzioni Urbane` contiene `Fonti/09b_funzioni urbane.pdf` (1,9 MB). Analizzare quel solo elemento in modalità profilo.

Attesi: sezione «da dove si parte» con le metriche della fonte; Δ per componente e complessivo; il numero di componenti comuni dichiarato accanto al Δ (FR-021); la copertura della fonte **nello stesso blocco visivo** (FR-023); estrazione PDF sotto i 10 secondi; nessuna parola spezzata a fine riga fra le parole lunghe (R3).

Prova negativa: importare un PDF scansionato senza layer testo. Attesi: elemento marcato non misurabile con il motivo, nessun Δ calcolato su testo spazzatura, gli altri elementi analizzabili lo stesso.

Prova di codice: verificare che `buildBaseline` **lanci** se chiamata senza copertura. È il punto in cui FR-023 smette di essere una promessa.

---

## Scenario 5 — I conti dei costi tornano (fase 5 · US7)

Attesi nel report: 1A ≈ 106.672 token, 1B ≈ 125.335 — gli stessi di `index.yaml → generationUsage` (SC-001 non li copre, ma sono verificabili); righe di consumo abbinate dentro le finestre di `pipeline.json` (1A 06:52-06:56, 1B 07:04-07:09); l'abbinamento dichiarato come approssimato con la finestra esposta (FR-030); nessuna riga contesa fra i due, perché le finestre non si sovrappongono.

Prova negativa: allargare il margine della finestra nel profilo fino a farle sovrapporre. Attese: righe contese segnalate e **non attribuite né divise**.

---

## Scenario 6 — Il report non degenera all'aumentare di N (fase 6 · US6)

Importare i vault disponibili (`4R/Riproduzione Sessuata`, `1B/09b funzioni urbane`, più copie) e lanciare tre analisi da 2, 4 e 9 elementi.

Attesi: a 2 le viste appaiate integrali; da 3 a 6 tabelle a N colonne più la matrice dei concetti; a 7+ distribuzioni con mediana, quartili ed estremi, ciascun estremo attribuito all'elemento che lo tocca; in tutti e tre i casi il corpo pagina **non** scorre in orizzontale su 1280px (SC-009), mentre le tabelle larghe scorrono nel proprio contenitore.

Con elementi da fonti diverse, il report deve dichiarare che il confronto non è omogeneo — altrimenti confronterebbe il lessico della geografia con quello della biologia fingendo che sia la stessa cosa.

---

## Scenario 7 — L'ANDAMENTO dice la verità sui campioni piccoli (fase 7 · US5)

Con almeno tre analisi in archivio, aprire ANDAMENTO.

Attesi: curva nel tempo; i quattro assi commutabili senza rigenerare; ogni punto apre il report da cui proviene (FR-046); ogni cella con meno di 3 analisi porta l'avviso di campione insufficiente (FR-044); accanto a ogni grafico la tabella equivalente (principio I).

Prova decisiva: rigenerare un'analisi con un profilo diverso e riaprire. Le due analisi devono finire in **serie separate** con avviso, mai fuse (FR-045). È il collaudo del vincolo che rende sicura la modificabilità dei parametri.

Prova di robustezza: cancellare `Report/_dati/` e riaprire ANDAMENTO. I punti restano, ricostruiti dal JSON incorporato nei report (FR-040).

Archivio vuoto: spiegazione di cosa serve e collegamento ad ANALIZZA, non una pagina bianca.

---

## Scenario 8 — La prosa non tocca i numeri (fase 8 · US4)

Richiede una chiave Google configurata da METODO.

Salvare una copia del report deterministico, poi lanciare «Scrivi le sezioni interpretative» e confrontare.

Attesi: **tutte le celle numeriche identiche** prima e dopo (SC-007); sezioni AI visivamente distinte da quelle di misura (FR-035); nel prompt inviato non compare nessun testo dei corpi (FR-034) — verificabile ispezionando l'argomento di `buildPrompt`.

Prova negativa: forzare una risposta AI che cita una cifra inventata. Attesi: discrepanza segnalata **prima** del salvataggio (FR-036).

Senza chiave: spiegazione di come configurarla, report deterministico pienamente utilizzabile (FR-037).

---

## Verifiche trasversali, a ogni fase

```bash
npm test                                       # suite verde (principio VI)
npm test -- --test-name-pattern="divergenza"   # EDGE_FAMILIES allineata a MappAI (R6)
```

- **Determinismo** (FR-009, SC-003): eseguire due volte la stessa analisi e confrontare i due JSON. Devono differire solo per `id` e `creataIl`.
- **Offline** (SC-008): spegnere la rete, ripetere lo scenario 2 per intero.
- **Vault intatti** (principio V): confrontare `Mappe/` prima e dopo una sessione completa. Nessuna modifica, nemmeno alle date.
- **Nessun testo duplicato** (SC-013): cambiare la definizione di «parola lunga» nel profilo e verificare che cambi sia in METODO sia nella sezione «limiti» del report. Se cambia in uno solo, FR-054 è stato aggirato.
