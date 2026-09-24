# MappAI — storico della pipeline per fase

Aggiornato il 22 settembre 2026. Ogni diagramma è una fotografia: una proposta non è
un’implementazione e una prova di instradamento non è una misura della qualità didattica.

| Tappa | Stato verificato | Diagramma |
|---|---|---|
| A + B1 · 22/09/2026 | Magazzino e contratto per fase chiusi; commit c23f282, gate 3 riferiti da Giacomo. Pulsanti ancora sul percorso storico. | [PDF → Evidence, fotografia B1](pipeline-b1-20260922.html) |
| B2 · proposta 22/09/2026 | Fotografia precedente all’approvazione, conservata. | [Collegamento dei pulsanti ai modelli per fase](pipeline-b2-proposta-20260922.html) |
| B2 · implementato 22/09/2026 | 1841 pass, 0 fail, 2 skip; tre banchi verdi. Gate 3 in attesa; modifiche locali, nessun commit B2. | [B2 collegato: fotografia dell’implementazione](pipeline-b2-implementato-20260922.html) |

## Come leggere le fotografie

**B1** documenta il percorso già presente e il contratto provato separatamente. La freccia
verso «Indice fonti» è una relazione funzionale: non significa che ogni nuova generazione
prepari già automaticamente l’indice. Evidence richiede il suo interruttore acceso e fonti
disponibili. Il disegno precedente è copiato senza modifiche, compresi JSON e ricevuta;
gli hash coincidono con l’originale nella cartella visualizzazioni Codex.

**B2 proposto** mostra le implementazioni previste dal [packet 0013](../tasks/0013-modelli-per-fase-nei-flussi.md):

1. Scelta esplicita dei modelli nel Setup, accessibile anche dal progetto aperto.
2. Avvio dai pulsanti con profilo e credenziali catturati, riusando B1.
3. Mappa e materiali chiamano i rispettivi modelli; il giudice ha la propria assegnazione
   solo quando è abilitato. La mappa resta JSON e il testo del PDF si estrae localmente.
4. Associazione al vault corretto e preparazione dell’indice Evidence prima dei materiali,
   compresi progetto nuovo, documento singolo e ripresa. Con Evidence spento resta il percorso storico.
5. Profilo pubblico e provenienza salvati; ripresa con nuove credenziali catturate per il
   provider salvato. L’apertura di un vecchio vault non cambia il Setup delle nuove azioni.

Le frecce senza etichetta indicano la successione già espressa dai nodi. Il disegno è una
vista principale, non l’elenco di ogni chiamata opzionale: controlli locali e giudice possono
ricorrere in più punti; le pause della revisione rimangono quelle attuali.

Gli embeddings restano un ramo su richiesta dei consumatori esistenti: dopo l’associazione
al vault usano vettori.json se la cache è accesa. Non sono una tappa obbligatoria fra PDF e
materiali. Evidence continua con BM25: reranking Evidence e banco denso sono C e D.
La misura Infomaniak è E, ancora da fare.

Nella fotografia proposta il preflight era previsto per le opzioni ancora esterne al contesto:
reranker delle citazioni della mappa e, su Infomaniak, sintesi con audio Google. Il packet
propone di chiedere di deselezionarle prima dell’avvio, senza disattivarle automaticamente
né usare un altro provider. La visione resta un seguito separato.

**B2 implementato** conserva la stessa topologia della proposta per rendere confrontabile
lo storico. I pulsanti ora sono collegati e la preparazione Evidence viene attesa nei
percorsi testuali coperti. Le prove automatiche usano moduli reali con IPC, PDF estratto
e disco simulati; il browser del Setup è una fixture isolata. Il gate 3 di Giacomo e la
misura Evidence su Infomaniak restano aperti. Il modello effettivo non dichiarato dal
servizio è indicato come mancante. Un documento singolo registra la propria provenienza
senza creare una falsa pipeline pendente.

La [ricevuta dell’implementazione](pipeline-b2-implementato-20260922.ricevuta.json)
lega specifica, HTML e verifiche visuali. Nessun commit B2: baseline applicativa c23f282.

## Regola per le prossime fotografie

Alla conferma del gate 3 aggiungere una nuova fotografia con prova riferita e commit,
senza riscrivere queste tre. Fare lo stesso
per C, D ed E; non cambiare uno stato in «chiuso» perché il diagramma è stato disegnato.

Fonti: [piano](../PIANO-multimodello.md), [HANDOFF](../HANDOFF.md),
[ADR 0004](../adr/0004-multimodello-infomaniak.md), packet
[0010](../tasks/0010-vettori-magazzino.md), [0012](../tasks/0012-profilo-e-contesto-per-fase.md)
e [0013](../tasks/0013-modelli-per-fase-nei-flussi.md).

Diagrammi interattivi Archify, contenuti in italiano; comandi fissi del visualizzatore e
attributo HTML della lingua in inglese, limite del visualizzatore. La
[ricevuta B1](pipeline-b1-20260922.ricevuta.json) conserva i riferimenti all’originale;
la [ricevuta della proposta B2](pipeline-b2-proposta-20260922.ricevuta.json) documenta le verifiche di quella fotografia.
La fotografia B2 implementato supera 9/9 controlli, senza errori/avvisi; verifica browser
verde a 1440×900, 1600×1000, 1920×1080 e 2048×1320; ispezione delle immagini in chiaro/scuro
senza tagli o sovrapposizioni rilevati.
