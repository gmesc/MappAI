# Handoff → «Pipeline ADATTIVA»

> **Scopo**: consolidare in un unico posto il lavoro fatto in una sessione parallela
> (tetto di profondità + tool correzioni + diagnosi Guerra Fredda L3/L5) così che la
> chat «Pipeline ADATTIVA» possa proseguire TUTTI i fili da qui, senza pestarsi sui
> file del triage/GAP.
> **Data**: 21/7/26 · **Branch**: `fix/deepening-residuo` · **Worktree**: condiviso
> (stesso `MappAI re`) con la sessione ADATTIVA.

---

## 0. TL;DR — cosa fare adesso

1. **Verifica in Electron vivo** la rigenerazione Guerra Fredda a L5 (l'utente la sta rifacendo): serve a separare *sfortuna Fase 1* da *difetto sistematico* (vedi §3).
2. **I due fili sono complementari, non doppioni** (§4): triage `essentialDepth` cappa il *deepening*; il tetto `applyDepthCeiling` pota i *dati*. Già in AND nel codice (mm-extraction.js:1188-1205).
3. **Il lavoro rimasto (A/B/C, §5) va costruito DENTRO il triage/GAP, non in parallelo** — toccano gli stessi file (mm-extraction, app.js, structure-analyzer). Un solo filo alla volta sul worktree condiviso.
4. **Ordine di commit consigliato** (§6): prima il triage (ADATTIVA), poi A/B/C sopra.

---

## 1. Stato COMMITTATO (branch `fix/deepening-residuo`)

Catena commit (dal più vecchio):

| commit | cosa |
|---|---|
| `9c48dbe` | **Deepening P1+P2** — materiale = residuo dalla fonte (non più desc del padre) + verdetto anti-parafrasi (`maxContainment` 0.60). |
| `18a8a56` | **Deepening P1-bis+P3** — `assignResidues` (argmax globale frase→foglia; assorbitori con `absorberClaimMin` 0.5 + ripiego su eligible), coperto esteso agli antenati, `isNearDuplicate` gate globale (Jaccard 0.55 / containment 0.75). |
| `be0d5ad` | rimozione template morto `MIND_MAP_BRANCH` dall'admin (altra sessione). |
| `a3f08c4` | **Tetto di profondità** — `foldBeyondDepth` (ripiega L>tetto nella desc del cap), prompt Fase 3 dinamici (no più `(L2,L3,L4,L5)` fisso), `applyDepthCeiling`, `getGenDepth/setGenDepth`, UI `#gen-depth-select`. |
| `3b12a55` | **Tool «Revisione mappa»** — `mappai-correction-core.js` (diffMaps) + `mappai-correction-mode.js` (snapshot→annota→salva). |
| `9a49855` | spostamento `#gen-depth-select` nel form principale (era nascosto nel modale AI). |

**Core deterministici** (tutti in `mappai-deepen-core.js`, UMD, testati):
`residueSentences`, `assignResidues`, `paraphraseVerdict`, `filterProposedChildren`,
`isNearDuplicate`, **`foldBeyondDepth`**. Suite **658/658**.

**Flag disponibili** (localStorage):
- `mappai_gen_depth` — profondità di GENERAZIONE (≠ slider vista). Default = slider→5.
- `mappai_depth_ceiling` — kill-switch tetto (`'0'` = off). Default ON.
- `mappai_deepening_enabled` / `mappai_deepen_residue` — kill-switch deepening (esistenti).
- `mappai_mm_triage_enabled` — kill-switch triage (ADATTIVA).
- `mappai_correction_mode` — `'1'` monta il bottone «Revisione» in header.

**Due controlli di profondità separati** (decisione utente):
- «**Genera fino a**» (`#gen-depth-select` nel form, box «Generazione HD») → dati.
- «**Mostra fino a**» (slider toolbar `#level-slider`) → solo filtro vista.

---

## 2. WIP NON committato nel worktree (triage ADATTIVA)

`git status` mostra, non committati (di proprietà della sessione ADATTIVA):
`?? mappai-mm-triage.js` + M su `app.js`, `mm-extraction.js`, `index.html`,
`dev-console-metrics.js`, `usage-core.js`, `en/it_translations.js`.

⚠️ **I commit del tetto/correzioni NON li contengono** (verificato: `git show a3f08c4
--stat` senza triage/app.js). Il triage siede PULITO sopra il tetto:
`mm-extraction.js:1188-1193` calcola `deepTarget = min(maxMapLevel, essentialDepth)`
e lo passa a `executeDeepeningPass`; subito dopo (1203) il mio `applyDepthCeiling`.

---

## 3. Findings empirici — Guerra Fredda L3 vs L5 (evidenza)

Due mappe reali, stessa fonte, tetti diversi. **L5 «terribile», L3 pulita** — e il
tetto NON è la causa.

| | L3 | L5 |
|---|---|---|
| Nodi | 27 | 19 |
| Macro-aree L1 | **3** (bilanciate) | **2**, una MORTA (0 figli) |
| Profondità max | 3 (tetto ok) | 4 |
| Distribuzione | larga: {L2:6, L3:16} | **spike invertito**: {L3:4, L4:9} |
| D-parafrasi | 0/16 | 0/5 |
| Coppie quasi-dup | 0 | 2 |

**Alberi** (il difetto si vede a occhio):
```
L5:  • Superpotenze Post-Belliche → USA/URSS → Sistema Politico/Economico → giù
          • "Rivoluzione comunista cinese" [D]  ← sotto "sistema politico USA" (!!)
          • eventi blocco Est [D]               ← sotto "sistema politico URSS" (!!)
     • Rottura e Bipolarismo   ← ZERO figli, macro-area morta
L3:  • Due Superpotenze · • Differenze Ideologiche · • Bipolarismo
        (3 rami bilanciati, D-node in tema: NATO, Piano Marshall, Ungheria, 1989)
```

**Diagnosi — 3 cause, tutte a monte del tetto:**
1. **Fase 1 partizione rotta**: 2 L1, una un dead-stub senza figli → mappa a un solo
   ramo di un tema enorme. Parte sfortuna del run (non-determinismo), parte bug reale
   (un L1 senza figli non viene segnalato/ritentato).
2. **Collasso depth-first**: tetto alto → l'unico ramo vivo tunnella profondo invece
   di allargarsi. Per questo L5 ha *meno* nodi di L3 (19<27).
3. **Deepening sbaglia casa**: senza ramo giusto, `assignResidues` mette la frase nella
   foglia meno-peggio → «rivoluzione cinese» sotto «sistema USA». Manca un **pavimento
   assoluto di pertinenza** (sotto il quale scartare invece di collocare male).

**Lettura per il prodotto**: L5 non è «più/meglio», è **più rischioso** — amplifica una
partizione Fase 1 scarsa. Per BES/DSA una **L3 larga batte una L5 stretta**.
→ Questo è esattamente ciò che il **triage `essentialDepth`** previene per costruzione.

Harness usati (scratchpad, rigenerabili): `cmp_gf.js`, `tree_gf.js`.

---

## 4. Come i fili si saldano (la sintesi che conta)

**Triage ⊗ tetto = complementari, già in AND nel codice:**
- Triage `essentialDepth` (per TIPO EPISTEMICO: tassonomico L≤2 / procedurale L3) →
  cappa il **target del deepening**. Automatico, content-aware.
- Il mio `applyDepthCeiling(maxMapLevel)` → **pota i dati** oltre il tetto (manuale/utente),
  ripiegando il dettaglio nelle desc.
- `deepTarget = min(maxMapLevel, essentialDepth)` li unisce. Il tetto utente è il
  massimo; il triage può solo abbassare. **La L5 «terribile» col triage attivo sarebbe
  stata cappata.**

**La diagnosi L5 valida l'impianto ADATTIVA** e le 3 proposte A/B/C (§5) mappano 1:1
sulla roadmap di quella sessione:
- **A** (floor ampiezza / L1 senza figli) ≈ pre-flight «profilo scheda» + GAP.
- **B** (pavimento pertinenza nel deepening) ≈ principio anti-fabbricazione («non
  fabbricare struttura assente»).
- **C** (rilevatore spike) ≈ «la mappa degenere È già feedback» + structure-analyzer.

**Framework «tre povertà»** (dalla chat ADATTIVA, da tenere presente): *informativa*
(poco testo), *strutturale* (lista piatta), *ridondante* (gonfia) → non degradare un
output unico, **instradare** verso ciò che la scheda regge (lista→glossario/flashcard,
catene causali→mappa). Il loop di arricchimento (GAP: «5 concetti, 0 nessi — aggiungi
X,Y?») rende MappAI **co-autore**, non solo generatore. MappAI ha già i **ponti**
(structure-analyzer: Tarjan+Brandes); il **GAP** no.

---

## 5. Lavoro rimasto — integrato, non parallelo

Da costruire DENTRO triage/GAP (stessi file → un filo alla volta):

- **A — Fase 1: floor di ampiezza + guardia «L1 senza figli»**. Nessuna macro-area può
  restare a 0 figli (ritenta/segnala); floor sul numero di L1 per fonti ricche.
  *Attacca la causa dominante di L5.* File: `mm-extraction.js` (Fase 1 + adozione),
  eventualmente `structure-analyzer.js` per la metrica.
- **B — Deepening: pavimento assoluto di pertinenza**. In `assignResidues`
  (`mappai-deepen-core.js`): se la miglior foglia ha pertinenza < soglia assoluta,
  **scarta** invece di collocare male → niente «rivoluzione cinese sotto sistema USA».
  Estende P1-bis; puramente nel core + soglia in `executeDeepeningPass`.
- **C — structure-analyzer: rilevatore di spike/sbilanciamento**. Badge advisory (mai
  gate): «mappa sbilanciata — poche macro-aree, un ramo domina — rigenera». Riusa
  god-node/topology già presenti. È il primo mattone del **pre-flight advisory** della
  chat ADATTIVA (profilo, non voto; deterministico dove possibile).

**Ordine consigliato**: stabilizza triage (temp 0 + cache per-fonte + abstain sulle
schede corte) → A → B → C → pre-flight che RIUSA il verdetto triage per il routing
output → guidelines map-ready come sottoprodotto.

---

## 6. Coordinamento worktree (rischio concreto)

Worktree UNICO condiviso, due sessioni attive. **Regola**: un filo alla volta.
- Il tetto + correzioni sono **committati e stabili**.
- Il triage è **WIP non committato** in ADATTIVA.
- **Prossimo commit consigliato**: chiudere/committare il triage da ADATTIVA PRIMA di
  toccare A/B/C (che rientrano negli stessi file). Poi A/B/C sopra.
- Non far girare due sessioni che editano `mm-extraction.js` / `app.js` /
  `structure-analyzer.js` insieme.

---

## 7. Mappa file (chi tocca cosa)

| Concern | File | Stato |
|---|---|---|
| Deepening residuo/verdetto/fold | `public/js/mappai-deepen-core.js` | committato |
| Wiring deepening + tetto + prompt | `public/js/mappai-generation-support.js`, `public/js/mappai-mm-extraction.js` | committato (+ triage WIP sopra) |
| UI profondità generazione | `public/index.html`, `public/js/mappai-ui-modals.js` | committato |
| Tool correzioni | `public/js/mappai-correction-{core,mode}.js` | committato |
| Triage adattivo | `public/js/mappai-mm-triage.js` + app.js/mm-extraction/… | **WIP ADATTIVA, non committato** |
| Ampiezza/spike (A, C) | `mm-extraction.js`, `mappai-structure-analyzer.js` | da fare |
| Pertinenza deepening (B) | `mappai-deepen-core.js` | da fare |

---

## 8. Verifiche pendenti in Electron vivo

- Generazione MM reale a **L3** → zero nodi L4/L5 nel vault, log `[Tetto L3]` +
  `[Deepening] … parafrasi (P2) … duplicati globali (P3)`.
- Rigenerazione **L5** Guerra Fredda (in corso) → contare L1, cercare dead-stub, log
  `[MMTriage]`/`[Tetto]`; A/B col triage ON/OFF.
- Tool correzioni: bottone «Revisione» (flag `mappai_correction_mode='1'`) →
  snapshot → edita → «Rivedi correzioni» → `correzioni.json` nel vault.
- Triage: scheda tassonomica (attesi 0 `_D`) vs procedurale (attesi `_D` solo sotto L3),
  consumi categoria `map/triage`.

---

## 9. Memorie collegate

`audit-deepening-dnodes.md` (cause per fase + P1-P7) · `mm-triage-adaptive-depth.md`
(MVP triage) · `correction-tool.md` (tool revisione). Questo handoff le lega.
