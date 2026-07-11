# Specification Quality Checklist: Esposizione orale → mappa ("Esponi l'argomento")

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-11
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Nomi propri di meccanismi interni (Studio attivo, percorso di studio,
  padronanza, classe attiva) usati come vocabolario di dominio del prodotto,
  non come dettagli implementativi: indicano DOVE la feature si aggancia,
  senza prescrivere COME.
- Scelte di default documentate in Assumptions (tetto 15 min, transcript
  conservato con la sessione, extra non penalizzanti, Live fuori scope) —
  nessuna clarification bloccante residua.
- SC-002 (ripetibilità ≥90%) è il criterio-chiave di design: guida la scelta
  (in fase di piano) di valutare contro i concetti della mappa invece di
  confrontare due mappe generate.
