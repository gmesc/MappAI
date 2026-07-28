# Contract — API dei core puri

**Regola che vale per tutti**: nessun accesso al DOM, nessun `require` di Electron, nessuna rete, nessun `Date.now()` implicito (le date arrivano come argomento). Esposti in UMD: `module.exports` in Node, `window.Mis<Nome>` nel renderer. Ogni funzione è pura — stessi argomenti, stesso risultato (FR-009).

---

## `mis-text-core` — metriche linguistiche

```js
tokenize(testo) → string[]
// /[A-Za-zÀ-ÿ0-9']+/g. Apostrofo DENTRO la parola, trattino SEPARA. Calibrato in R1: non cambiare senza rifare la calibrazione.

splitSentences(blocchi, opts) → [{ testo, blocco }]
// Segmenta PER BLOCCO (R9). Un blocco senza punteggiatura finale = 1 frase.
// opts.abbreviazioni dal profilo. Un punto seguito da minuscola non chiude.

countSyllables(parola) → number
// Gruppi vocalici con accorpamento di dittonghi e trittonghi (R2). Approssimato sugli iati.

gulpease(blocchi, opts) → { parole, frasi, lettere, paroleFrase, valore }
// 89 + (300×frasi − 10×lettere)/parole. lettere = /[A-Za-zÀ-ÿ]/g.

fleschVacca(blocchi, opts) → { sillabe, sillabe100, paroleFrase, valore }
// 206 − 0,65×S − P.

lexicalProfile(blocchi, profilo) → {
//   paroleTotali, frasi, paroleFrase, gulpease, fleschVacca,
//   parolLunghePct, nominalizzazioni100, connettiviSubordinanti100,
//   connettiviCausali100, passive100, marcatoriEsempio, marcatoriAnalogia,
//   catenecausali, tempoLetturaMin, tempoAscoltoMin,
//   definizioni: { <metrica>: <testo dal profilo> } }
// Le LISTE (suffissi, connettivi, marcatori) arrivano dal profilo, MAI costanti nel modulo:
// è la lezione di R1, dove le liste del 2026 andarono perdute.

formatDevices(blocchi) → { elenchi, sottotitoli, titoliDomanda, marcatori,
//                          parolePerElenco, parolePerSottotitolo }
// Le ultime due alimentano il fattore di sostanza del componente 6.

detectLanguage(blocchi) → 'it' | 'altro' | 'incerto'
// Se non 'it', chi chiama marca le metriche di leggibilità come di validità dubbia.
```

---

## `mis-struct-core` — metriche di grafo

```js
parseNode(rawMd) → { id, label, level, parent, group, corpo }
// corpo = dopo il frontmatter MENO la riga "# Titolo" (R1, calibrato).

graphMetrics(nodi, links) → {
//   nodiTotali, perLivello, macroAree, profonditaMax, links,
//   relDistinte, relRicchi, genericiPct, relElenco }
// links senza `rel` → 'include' (DAL Protocol, principio V).

wordsPerNode(nodi, tokenize) → { perLivello: {…}, tutti: {…} }
// Ogni voce: { n, media, min, max, devStd }. devStd DI POPOLAZIONE (÷n) — R1.

causalStructure(links, edgeFamilies) → { quotaCausale, perFamiglia }
// Piano strutturale del componente 8. edgeFamilies iniettato, non importato:
// rende testabile la divergenza dalla copia MappAI (R6).

siblingRedundancy(nodi, links, opts) → { mediaSovrapposizione, coppiePiuSimili }
// Sovrapposizione di n-grammi fra fratelli. Alimenta il fattore di sostanza.
```

---

## `mis-index-core` — indice composito

```js
scoreComponent(componente, metriche) → { punteggio, calcolabile, motivo }
// Interpolazione lineare a tratti sugli ancoraggi. calcolabile=false se `richiede` non è soddisfatto.

substanceFactor(formatDevices, redundancy, profilo) → number   // [0,4 – 1,0]
// Minore fra densità-per-dispositivo e non-ridondanza. Modera SOLO il componente 6 (FR-033-bis).

computeIndex(metriche, profilo) → {
//   valore, componenti: [{ n, nome, peso, pesoRidistribuito, punteggio, calcolabile, motivo }],
//   componentiAttivi, componentiTotali, fattoreSostanza }
// Peso dei non calcolabili ridistribuito in proporzione (FR-033).

computeDelta(indiceFonte, indiceProdotto) → {
//   deltaIndice, componentiComuni, deltaPerComponente, nonCalcolabile }
// SOLO i componenti attivi da entrambi i lati (FR-021).

buildBaseline({ delta, copertura }) → Baseline | throw
// ⚠️ Lancia se `copertura` manca. È il punto in cui FR-023 diventa impossibile da violare:
// il costruttore del report non può ricevere un Δ senza la copertura, perché non esiste
// una funzione che gliene dia uno.
```

---

## `mis-profile-core` — profilo di parametri

```js
validate(profilo) → { ok, errori: [{ campo, vincolo, messaggio }] }
// Pesi=100 · ancoraggi monotòni · valori in range · definizione/motivo/limite non vuoti
// · fattore di sostanza in [0,4–1,0]. (FR-033-ter)

derive(profiloBase, modifiche) → profilo   // id nuovo, derivatoDa valorizzato (FR-055)
fingerprint(profilo) → string              // deterministico sui soli valori, non sui testi
describe(profilo) → [{ sezione, voci: [{ nome, valore, definizione, motivo, limite }] }]
// Unica fonte del tab METODO e della sezione «limiti» dei report (FR-054).
// Non esiste un secondo posto dove quei testi siano scritti.
```

---

## `mis-coverage-core` · `mis-quiz-core` · `mis-cost-core`

```js
// coverage
sourceCoverage(frasiFonte, nodi, opts) → { frasiFonte, frasiCoperte, quota, soglia, scoperte }
// Corrispondenza lessicale con tokenizzazione e stemming italiani copiati da MappAI (R6, FR-022).

// quiz
setMetrics(set, profilo) → { tipo, item, gulpease, paroleFrase, parolLunghePct }
distractorSimilarity(set) → { media, perItem }   // solo scelta multipla (FR-026)

// cost
matchUsage(righe, contesto, profilo) → {
//   abbinate, contese, token, chiamate, finestra, sospetto }
// sospetto=true se lo scarto da contesto.tokenDichiarati supera la tolleranza (R7).
// Le righe contese NON vengono attribuite né divise (FR-030).
costChf(token, modello, tasso) → number
```

---

## `mis-compare-core` · `mis-trend-core`

```js
// compare
renderStrategy(n) → 'appaiato' | 'colonne' | 'distribuzioni'   // 2 · 3-6 · 7+ (FR-018)
pairConcepts(misure) → { appaiati, esclusivi, matrice }
distributions(misure, metriche) → { mediana, q1, q3, min, max, elementoMin, elementoMax }
isHomogeneous(elementi) → boolean   // stessa fonte? se no, il confronto lessicale è confuso

// trend
aggregate(analisi[], asse) → { serie: [{ chiave, profiloId, punti[] }], avvisi[] }
// Mai fondere profiloId diversi nella stessa serie (FR-045).
// Avvisi: campione-insufficiente (<3), profili-diversi, componenti-diversi.
```

---

## `mis-ai-prose` — l'unico modulo che parla con la rete

```js
buildPrompt(analisi) → { system, user }
// ⚠️ Riceve l'Analisi e ne estrae SOLO numeri, viste già selezionate e metadati.
// Non deve esistere un percorso che infili `corpi[].blocchi[].testo` nel prompt
// quando la richiesta riguarda conteggi (FR-034). Fa eccezione la coerenza
// terminologica (FR-028), che riceve le sole ETICHETTE dei nodi, mai i corpi.

verifyFigures(prosa, numeriAmmessi) → { ok, sospette: [{ cifra, contesto }] }
// Ogni numero citato nella prosa deve esistere fra quelli passati (FR-036).
// Le sospette vengono mostrate PRIMA del salvataggio.
```
