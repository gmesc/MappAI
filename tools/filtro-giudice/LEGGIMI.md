# Filtro delle segnalazioni del Giudice e strato delle affermazioni — prova fuori dall'app

Strumento del 26/09/2026 (ADR 0010, packet 0042 e 0041). Non tocca l'app, non usa la rete, non usa chiavi.
Legge in SOLA LETTURA una COPIA del `pipeline.json` di un progetto revisionato: le decisioni del docente nel
Banco sono l'etichetta.

## Che cosa misura

1. **Idea A — il filtro sulla pertinenza della prova.** Per ogni segnalazione del Giudice decisa dal docente:
   la separazione fra quelle che hanno cambiato il testo («cambia») e quelle chiuse senza cambiare niente
   («invariato»), con nove segnali (reranker, parole in comune, NLI), AUC con intervallo bootstrap, e la regola
   «abbassa sotto soglia» con stima lascia-uno-fuori.
2. **Strato delle affermazioni** — ogni frase delle desc della mappa come generata (`review.baseSnapshot`), le 3
   frasi della fonte più pertinenti (reranker) e un verdetto NLI: corsie verde / grigia / rossa / organizzativa,
   confrontate con le decisioni del docente; prima e dopo ogni correzione.
3. **Frasi orfane** — ogni frase di contenuto della fonte contro le affermazioni: coperta / solo argomento / orfana.

## Come si lancia (dal worktree o dal repo)

```bash
S=<cartella di lavoro nello scratchpad>; R=<radice del repo>
cp "<vault>/pipeline.json" $S/progetto-pipeline.json          # sempre una copia
PY_RER="$HOME/Library/Application Support/MappAI/local-ai/runtime/bin/python3"   # runtime del reranker locale
PY_NLI="$R/tools/nli/.venv/bin/python"                                            # venv del banco NLI (packet 0016)
export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1

# 1 · filtro sulla prova
node $R/tools/filtro-giudice/prepara.mjs $S/progetto-pipeline.json $R $S/prova
"$PY_RER" $R/tools/disaccordi-ancora/rerank-locale.py $S/prova/richieste-reranker.json $S/prova/voti-reranker.json 2>$S/prova/rerank.err
node $R/tools/filtro-giudice/prepara-nli.mjs $S/prova
"$PY_NLI" $R/tools/filtro-giudice/nli.py $S/prova/coppie-nli.json $S/prova/nli.json $R/tools/nli/cache 2>$S/prova/nli.err
node $R/tools/filtro-giudice/risultato.mjs $S/prova          # → RAPPORTO.md, misure.json

# 2 e 3 · corsie e frasi orfane
node $R/tools/filtro-giudice/affermazioni-prepara.mjs $S/progetto-pipeline.json $R $S/aff
"$PY_RER" $R/tools/disaccordi-ancora/rerank-locale.py $S/aff/richieste-reranker.json $S/aff/voti-reranker.json 2>$S/aff/rerank.err
node $R/tools/filtro-giudice/affermazioni-nli-prepara.mjs $S/aff
"$PY_NLI" $R/tools/filtro-giudice/nli.py $S/aff/coppie-nli.json $S/aff/nli.json $R/tools/nli/cache 2>$S/aff/nli.err
node $R/tools/filtro-giudice/affermazioni-risultato.mjs $S/aff   # → RAPPORTO-affermazioni.md
```

Il reranker impiega circa 5-8 minuti per progetto su un MacBook Air M5 (processore grafico); l'NLI meno di un minuto.
I modelli si caricano per percorso dalla cache locale (`local_files_only`): niente download, niente lock nella cache.

## Esito del 26/09/2026 su «Svizzera e 2a GM» (46 frasi, 56 segnalazioni del Giudice, 42 decise)

- **Filtro sulla prova**: il segnale migliore del reranker (la prova citata parla dell'obiezione) ha AUC 0,64
  (0,44–0,82); le parole in comune 0,73 (0,55–0,89); l'NLI «la prova implica l'obiezione» 0,69. Con la soglia scelta
  senza vedere il caso giudicato: circa 6 falsi allarmi su 18 abbassati, 1 segnalazione vera su 24 abbassata.
  Nessun segnale singolo basta a chiudere una segnalazione.
- **Corsie (τ 0,2)**: 110 affermazioni → 46 verdi, 60 grigie, 1 rossa, 3 organizzative. Delle 21 frasi contestate e
  poi corrette dal docente, 9 verdi e 11 grigie, 0 rosse: il verdetto piccolo NON riconosce gli errori veri. Tolte
  le rosse resta il 99% del testo; tolte anche le grigie il 41%. Frasi scritte dal docente: 11 verdi, 24 grigie.
- **Frasi orfane (τ 0,2)**: 17 coperte nel fatto, 27 «solo argomento» (per lo più parafrasi fedeli: il criterio NLI
  è troppo severo), 2 orfane, di cui una è un fatto perso davvero.

Conseguenze scritte nell'ADR 0010: la quarantena non usa verdetti automatici; le frasi orfane si calcolano con un
criterio deterministico (numeri, date, nomi propri) invece che con l'NLI.

## Limiti

Una fonte, un docente, poche decine di casi; l'etichetta ha rumore (il docente ha cambiato idea 13 volte su 53 sulle
frasi dei disaccordi); «invariato» mescola obiezioni sbagliate e obiezioni giuste non seguite; la frase contestata è
un'approssimazione (il Giudice indica il nodo, non la frase); il reranker misura la pertinenza, non la verità.
