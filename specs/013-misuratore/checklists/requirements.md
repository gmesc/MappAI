# Specification Quality Checklist: MappAI - misuratore

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-28
**Aggiornato**: 2026-07-28 dopo la revisione dell'Allegato A e delle deroghe di costituzione
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — Allegato A rivisto e chiuso il 28/07/2026
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded (sezione «Fuori perimetro»)
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Constitution Check

- [x] **I — Accessibilità BES/DSA**: la feature esiste per misurare l'accessibilità. Nessuna informazione veicolata dal solo colore (FR-052). Il componente 8 dell'indice nasce da un vincolo pedagogico esplicito (i nessi causali lasciati impliciti costano inferenza).
- [x] **II — Reversibilità**: gli snapshot non vengono mai riscritti; modificare un parametro crea un profilo nuovo e lascia intatte le analisi esistenti (FR-055); il profilo predefinito è sempre ripristinabile (FR-056); il ricalcolo dell'archivio crea, non distrugge (FR-058).
- [x] **III — Script globali, no build step**: assunto per la nuova app, coerente con MappAI. Da confermare in plan.md.
- [x] **IV — Dual-provider AI — DEROGA CONSAPEVOLE (28/07/2026)**: solo Google. Il principio esiste per il GDPR sui dati educativi; qui all'AI arrivano solo numeri aggregati e metadati di classe, mai testi di studenti né di schede né nominativi, e lo strumento è interno. La deroga è circoscritta a questa app ed è annotata in Assumptions e in «Fuori perimetro»: va riaperta se all'AI dovessero mai arrivare testi.
- [x] **V — Integrità del vault**: il misuratore non scrive mai dentro `Mappe/` (Assumptions); legge secondo il DAL Protocol (Edge Cases).
- [x] **VI — Logica pura testata**: FR-008, FR-009, SC-010.
- [x] **VII — i18n bilingue — DEROGA CONSAPEVOLE (28/07/2026)**: solo italiano. Strumento interno, un solo utilizzatore. Mitigazione: le stringhe restano centralizzate in un dizionario, così che l'inglese si possa aggiungere senza ripassare il codice.

## Rischi da tenere d'occhio in plan.md

1. **Riuso per copia, non per riferimento** — tokenizzazione e stemming italiano, normalizzazione degli item di quiz, `EDGE_FAMILIES`, formattazione date e sanificazione nomi file vengono copiati da MappAI. Il rischio è la divergenza silenziosa: se `EDGE_FAMILIES` cresce in MappAI, il componente 8 del misuratore smette di riconoscere i verbi nuovi. Il piano deve dire come questa divergenza viene resa visibile (annotazione del file d'origine e della data di copia, test che confronta le due liste).
2. **Abbinamento dei consumi AI approssimato** — le righe di `consumi-ai.jsonl` non portano la classe, solo il nome progetto e l'orario. Sui due vault `Funzioni Urbane` di 1A e 1B l'abbinamento per finestra temporale funziona perché le generazioni non si sovrappongono, ma è una fortuna, non una garanzia (FR-030).
3. **Cartella dati dentro il progetto** — funziona in sviluppo, è in sola lettura in un'app impacchettata (Assumptions). Non blocca, va deciso prima della distribuzione.
4. **Documentazione generata dalla configurazione** (FR-054) — è il requisito che più facilmente viene aggirato scrivendo «solo per questa volta» un testo a mano nel builder. Il piano deve rendere la scorciatoia impossibile, non sconsigliata.
