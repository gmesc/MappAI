# Data Model — 008-timeline-live (Fase 1)

Convenzione: campi `?` = opzionali. Tutte le stringhe passano da
`sanitizeText` (live-core) o equivalente con cap espliciti.

## 1. TimelineEvent — la data della timeline (pool)

Vive in due store del progetto (serializzati con `appState`):

| Store | Contenuto | Scrittura |
|---|---|---|
| `appState.db.timelineAI` | eventi dell'ULTIMA generazione AI (sovrascritto) | `generateTimelineWithAI` dopo dedup |
| `appState.db.timelineEvents` | date manuali docente + approvate studente | `MappAITimeline.add/remove` |

```
TimelineEvent {
  id:        string   // 'tlm_' + ts + rand (solo store manuale)
  anno:      int      // obbligatorio
  annoFine:  int?     // periodi (1939-1945)
  dataLabel: string   // etichetta visibile, default String(anno), cap 40
  evento:    string   // obbligatorio, cap 120
  contesto:  string?  // estratto/spiegazione, cap 400
  macroArea: string?  // Politica|Economia|Militare|Diplomatica|Sociale|Cultura
  origin:    'ai' | 'manual' | 'student'
  author:    string?  // identità studente (solo origin 'student' da sessione build)
}
```

**Regole**:
- Pool attività = `timelineAI ∪ timelineEvents`, dedup per chiave
  `anno + normalize(evento)` (normalize = lowercase, accenti piatti, alfanumerico,
  cap 40 — stessa regola del dedup timeline esistente).
- `loadProject`: init robusto → array vuoti se assenti (progetti legacy, FR-063).
- Le card con origin ≠ 'ai' sono marcate visivamente e riportano l'origine (FR-006).

## 2. TimelineQuestion — estensione dello schema domanda live

Base: schema `mappai-live-question@1` (kinds `tf|mc|cloze|open`). La feature usa
`open` e `mc` con campi ADDITIVI (le domande esistenti restano valide):

```
Question(open, direzione anno→evento) {
  kind: 'open', text: "Nel 1947: quale evento accadde?",
  answerText:  string        // evento principale
  answerTexts: string[]?     // TUTTI gli eventi del pool in quell'anno (any-match)
  hint:        string?       // contesto della fonte (NON è la soluzione)
  tlYear:      int           // per ordinamento cronologico nei report
}

Question(open, direzione evento→anno) {
  kind: 'open', text: "In che anno: Piano Marshall?",
  answerYear:    int
  answerYearEnd: int?        // periodi
  yearTolerance: 0 | 2 | 5   // dal wizard
  hint:          string?
  tlYear:        int
}

Question(mc) { come sopra ma kind:'mc', options[2..5], correct:int }
```

**Grading (estensione `gradeAnswer`, ramo `open`)**:
- `answerYear` presente → parse int della risposta; non numerica → wrong;
  corretto se dentro `[answerYear − tol, (answerYearEnd||answerYear) + tol]`.
- altrimenti `answerTexts` presente → right se `answerMatches` su UNO qualsiasi.
- altrimenti comportamento attuale (answerText singolo / manual).

**publicQuestions**: passa anche `hint` (whitelist estesa); continua a strippare
`answerText`, `answerTexts`, `answerYear`, `answerYearEnd`, `correct`.

## 3. Answer — tracking indizio

```
Answer { ...esistente, hintUsed: bool? }   // settato dal player al reveal 💡
```
- `cleanAnswer` preserva `hintUsed` (default false).
- `computeResults` aggrega: per studente `hintsUsed` (count), per domanda
  `hintCount`; esposti nei report (FR-014/015).

## 4. Proposal — candidato-data (modalità Costruisci)

```
Proposal {
  id:        string            // 'pr_' + ts + rand (server)
  anno:      int               // obbligatorio, 1000..2100
  evento:    string            // obbligatorio, cap 120
  contesto:  string?           // cap 400
  gapYear:   int?              // se risponde a un buco proposto dal server
  author:    string            // identityKey (individuale) o slug gruppo
  status:    'pending' | 'approved' | 'rejected'
  flags:     { duplicate?: true, yearNotInSources?: true }  // calcolati server-side
  ts:        int
}
```

**Regole**:
- Cap proposte per identità = `maxProposals` di sessione (default 3, FR-021):
  contano le NON-rejected (una bocciata libera lo slot).
- `duplicate`: stesso `anno + normalize(evento)` di pool o altra proposta
  non-rejected (FR-023). `yearNotInSources`: anno assente dagli anni citati
  dalle fonti (FR-025) — la lista anni-fonte è calcolata dal docente al setup
  e passata al server (il server non vede le fonti).
- Approvazione (renderer docente): `MappAITimeline.add({origin:'student',
  author})` con dedup → il progetto è la fonte di verità; il server marca solo
  lo status.
- Alla chiusura le pending restano nel report, non entrano nel progetto (FR-024).

## 5. Session config — estensioni

`createLiveServer({ session })` guadagna:

```
session {
  ...esistente (name, activity, className, durationMin),
  activity:  'timeline'                        // per il registro sessioni
  mode:      'quiz' | 'build'                  // default 'quiz' (= comportamento storico)
  loginMode: 'individual' | 'group'            // default 'individual'
  build?: {                                    // solo mode 'build'
    gaps:        [{ year, hint? }],            // buchi dalle fonti (impostazione)
    freeAllowed: bool,                         // proposta libera ammessa
    maxProposals:int,                          // default 3
    sourceYears: int[]                         // per il flag yearNotInSources
  }
}
```

`createCollabServer({ ... })` guadagna: `loginMode: 'group'|'individual'`
(default 'group') + `roster` (stesso formato live). Con 'individual' il join è
`{emojiKey, num, deviceId}` validato sul roster; identità = `identityKey`,
displayName dal roster.

**Wizard Completa** (mappa 1:1 sui campi domanda): direzione
(`anno→evento|evento→anno|mista`, default mista), formato (`open|mc`, default
open), indizio (`always|onrequest|never`, default onrequest), tolleranza
(`0|2|5`, default 2), ordine (`chrono|shuffle`, default shuffle), N domande,
timer, loginMode.

## 6. Stato per-identità su disco (server)

`students/<id>.json` (autosave esistente) — in build contiene anche:

```
{ ...esistente, proposals: Proposal[] }
```

`results.json` alla chiusura (build): proposte per identità con status finale +
pool finale approvato. Nessun segreto in nessun file (già garantito dal pattern).

## 7. Report

- **Completa**: `computeResults` esistente + `hintsUsed`/`hintCount`; domande
  ordinate per `tlYear` nei 2 report HTML (heatmap = heatmap della timeline).
- **Costruisci**: `buildTimelineWorkshopReportHtml(results)` (live-reports):
  sezione per identità (proposte con status, flag duplicati/anno-non-in-fonte)
  + timeline finale di classe stampabile (riuso card dossier timeline).

## 8. Transizioni di stato

```
Sessione:  lobby → running → closed          (invariato)
Proposal:  pending → approved | rejected     (solo admin; pending a chiusura → resta pending nel report)
TimelineEvent(student): nasce SOLO da approvazione; rimovibile dal docente come le manuali (US1)
```
