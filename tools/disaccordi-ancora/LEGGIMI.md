# La pagina dei disaccordi

Misura **quale metodo sceglie meglio le frasi della fonte che provano un nodo**:
l'àncora (quello che MappAI usa senza reranker), BM25 sul titolo del nodo, e il
reranker `BAAI/bge-reranker-v2-m3` con la stessa domanda e le stesse frasi candidate
dell'app (`queryReranker`, `candidatiReranker` in `public/js/mappai-anchor-core.js`).

Si giudicano solo i nodi dove i tre scelgono una prima frase diversa. Le frasi sono
mescolate e non dicono chi le ha proposte.

## Il criterio di giudizio

Segna una frase se, letta da sola, dice **almeno un fatto preciso della descrizione**
(chi, che cosa, quando, quanto), anche con altre parole, **per confermarlo o smentirlo**.
Basta un fatto. Non segnare le frasi che nominano solo lo stesso argomento o annunciano
ciò che segue senza dirlo. Ignora le parti della descrizione che parlano del documento
o della mappa. Se qualcosa non torna, anche nel titolo, scrivilo nella nota.

La tabella misura le **citazioni** del nodo (quelle che l'app mostra come Fonti), non i
passaggi per scrivere le domande: lì una frase sullo stesso argomento con un fatto nuovo
è utile, qui conta come non segnata.

## I passi

Dalla cartella del repository. Il progetto deve avere `pipeline.json`, cioè essere stato
generato con la revisione docente.

1. **Preparare la pagina.** Con il reranker di questo Mac (gratis, senza rete, serve il
   runtime del banco in `~/Library/Application Support/MappAI/local-ai`):

   ```bash
   node tools/disaccordi-ancora/prepara.mjs "<cartella del progetto>" --reranker locale
   ```

   Oppure con quello di Infomaniak, cioè quello che usa l'app (circa CHF 0,003 per 50 nodi;
   serve il token, vedi sotto): `--reranker infomaniak`.

2. **Aprire la pagina** e giudicare:

   ```bash
   python3 -m http.server 8147
   ```

   poi `http://localhost:8147/local-ai-data/review/disaccordi-<progetto>/`. Le scelte restano
   nel browser (una chiave per progetto); alla fine **Esporta le scelte** scarica il file.

3. **Contare:**

   ```bash
   node tools/disaccordi-ancora/risultato.mjs local-ai-data/review/disaccordi-<progetto> "<scelte esportate.json>"
   ```

4. **Facoltativo — il reranker di Infomaniak ordina come quello locale?** Dopo il passo 1
   con `--reranker locale`:

   ```bash
   node tools/disaccordi-ancora/verifica-infomaniak.mjs local-ai-data/review/disaccordi-<progetto>
   ```

   Il verdetto dice che cosa cambierebbe **nella pagina**. `--prova` mostra che cosa verrebbe
   mandato, senza rete e senza chiave.

## Il token Infomaniak

È il token del campo «INFOMANIAK API TOKEN» in Configurazione AI (non la chiave Gemini). Il
Product ID non serve: lo si chiede all'API. Si inserisce **solo** nel terminale, senza che si
veda, e non va mai scritto in un file o incollato altrove:

```bash
unset INFOMANIAK_API_KEY; while [ -z "$INFOMANIAK_API_KEY" ]; do printf 'Token Infomaniak (non si vede mentre scrivi): '; read -rs INFOMANIAK_API_KEY || break; echo; done; export INFOMANIAK_API_KEY; echo "Token ricevuto: ${#INFOMANIAK_API_KEY} caratteri"
```

A fine lavoro: `unset INFOMANIAK_API_KEY INFOMANIAK_PRODUCT_ID`. Se in terminale compare
`command not found:` seguito dal token, è finito nella cronologia: revocalo nel Manager Infomaniak.

## Dove vanno i dati

In `local-ai-data/review/disaccordi-<progetto>/`, fuori da git perché contengono il testo della
fonte: `casi.json`, `index.html`, `voti-reranker-<fonte>.json`, e dopo la verifica
`verifica-infomaniak-risultato.json` (senza chiave).

## Il primo risultato (16/9/26)

«10 Svizzera e 2a GM», 35 nodi giudicati da Giacomo, reranker locale:

| metodo | prima frase giusta | frasi proposte giuste |
|---|---:|---:|
| àncora | 28/35 | 48/67 (72%) |
| BM25 sul titolo | 22/35 | 36/64 (56%) |
| reranker | 32/35 | 60/70 (86%) |

Sulla prima frase il reranker batte BM25 12 a 2 (p = 0,013) e l'àncora 6 a 2 (p = 0,289: non
ancora solido). Un dossier e un docente: è un indizio, non una prova.
