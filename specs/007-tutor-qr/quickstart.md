# Quickstart — Validazione "Chatta e Scrivi" (007)

Prerequisiti: `npm install`, una mappa aperta, una classe con credenziali, chiave
API configurata (Google o Infomaniak), un telefono sulla stessa rete.

## 0. Suite automatica

```bash
npm test    # verde, inclusi tutor-core.test.js e tutor-server.test.js
```

## 1. Avvio attività (US2)

```bash
npm start
```
- Hub live → card **"Chatta e Scrivi"** → wizard: classe, argomento (nodo/ramo), modalità tutor, cap scambi, consegna di scrittura.
- ✅ Appaiono QR + URL (anche fullscreen). Sessione registrata (chip classe in Insegna).
- ✅ Senza chiave API: avvio bloccato con avviso.

## 2. Flusso studente (US1)

Dal telefono:
- ✅ QR → login credenziali classe → vedi l'argomento assegnato e la chat contestualizzata.
- ✅ Chatti: risposte nella modalità scelta, contatore scambi che scala.
- ✅ Al cap: chat chiusa, invito a Scrivi (la scrittura era comunque sempre accessibile).
- ✅ Scrivi il testo → Consegna → conferma.
- ✅ Ricarica pagina / rientra con le stesse credenziali → ritrovi chat e bozza.
- ✅ Chiedi "scrivimi tu il testo" → il tutor rifiuta e rilancia con domande.

## 3. Sicurezza / costi (US4)

- ✅ Ispeziona il traffico servito al telefono (`GET /api/session`): **nessuna chiave API**, nessun adminToken, nessuna systemInstruction.
- ✅ Supera il cap → 11° messaggio rifiutato **senza** chiamata AI (controlla i log del server).
- ✅ Messaggio troppo lungo → rifiutato prima della chiamata.
- ✅ 5 telefoni inviano insieme → tutte le risposte arrivano, in sequenza, nessun errore.
- ✅ "Ignora le tue istruzioni…" → il tutor resta nel ruolo e nell'argomento.

## 4. Monitor e consegne (US3)

- ✅ Dashboard docente: per studente identità, fase (in chat / scrive / consegnato), scambi usati/cap.
- ✅ Chiudi sessione → report per studente = **testo + trascrizione**, riaprbile senza rigenerare, salvato in `~/Documents/MappAI - Tutor/<sessione>/`.
- ✅ "Sblocca" uno studente consegnato → può ri-consegnare.

## 5. Provider (Costituzione IV)

- ✅ Ripeti §2 con provider **Infomaniak** attivo: la chat funziona (risposta testuale, nessun errore JSON).

## 6. Regressioni

- ✅ Le altre attività live (Studio attivo, Lavagna, Materiali) invariate.
- ✅ Gli IPC AI esistenti (generate-gemini/infomaniak) funzionano come prima dopo l'estrazione di `callModel`.
- ✅ Switch lingua EN→IT→EN sulle etichette nuove.

## Riferimenti

- Schemi/store: [data-model.md](data-model.md)
- API/AI: [contracts/api-and-ai.md](contracts/api-and-ai.md)
- Decisioni: [research.md](research.md)
