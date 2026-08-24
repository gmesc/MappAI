# i-cofano — la pipeline di generazione, per il capitolo «Sotto il cofano»

> Scritto il 24/8/26 per il capitolo 13 della guida. Ogni claim è stato riletto nel codice
> quel giorno (file:riga qui sotto). Configurazione di riferimento: installazione FRESCA
> (l'istanza di prova dei tester: `mappai_branch_boundaries_enabled` **nullo → OFF**,
> `mappai_deepening_enabled` **ON di default**). Le chiamate e i tempi vengono da
> i-buco-costi §2.1-2.2, che resta la fonte per i numeri.

## 1. Dalla scheda al contesto (prima di qualunque AI)

| fatto | fonte |
|---|---|
| Il testo del PDF si estrae SUL COMPUTER con PDF.js, tutte le pagine, prima di ogni chiamata | `app.js:535`, `app.js:1077-1082`; già in a-landing:184 |
| Intestazioni/piè di pagina ricorrenti vengono TOLTI prima dell'invio (default ON) | `app.js:1473-1493`; già in i-buco-privacy §76 |
| Al testo si aggiungono: titolo mappa (`{{rootNodeLabel}}`), focus/lenti sanitizzati, blocco disciplina, taratura classe, regole accessibilità. MAI nomi di docente/classe/allievo | i-buco-privacy §76 e §2.2 |

## 2. Fase 1 — lettura globale e macro-aree (2 chiamate)

| fatto | fonte |
|---|---|
| Chiamata L0: «scrivi un chiaro ed esaustivo paragrafo introduttivo … (max 40 parole)» sul tema, dalle prime 3 fonti; diventa la descrizione del nodo centrale | `mappai-mm-extraction.js:551-560` |
| Velo: «Mappa HD - Fase 1/3: Analisi introduttiva dell'argomento principale...» | `mappai-mm-extraction.js:548` |
| Chiamata L1: «Identifica da 3 a 7 argomenti o macro-categorie fondamentali»; velo «Mappa HD - Fase 2/3: Individuazione delle Macro-Categorie...» | template `L1_MACRO_CATEGORIES_IT` in `prompts_config.json`; `mappai-mm-extraction.js:571` |
| Ogni macro-area nasce con CINQUE campi: `label`, `rel`, `ambito` (3-5 parole-chiave), `desc` (40-60 parole: che cosa copre e perché esiste), `confini` («cosa NON va in questo ramo») | template `L1_MACRO_CATEGORIES_IT`, elenco «CINQUE chiavi» |
| REGOLA DI ATOMICITÀ: un'area che unisce due concetti («Neutralità e Difesa») va SPEZZATA in due aree atomiche | idem, blocco «REGOLA DI ATOMICITÀ (FONDAMENTALE)» |
| Il docente può imporre le proprie macro-aree (campi L1 in CREA): il prompt dice «Devi ASSOLUTAMENTE includere le seguenti categorie richieste dall'utente» | `mappai-mm-extraction.js:565-575` |

## 3. Fase 3 — un ramo alla volta (una chiamata per ramo)

| fatto | fonte |
|---|---|
| Loop sequenziale sui rami; velo «Mappa HD - Fase 3/3: Generazione Ramo "<ramo>" (Ramo i/N)...» | `mappai-mm-extraction.js:806, 883`; i-buco-costi §2.1 |
| Il prompt sviluppa SOLO quel ramo: «SEI UN MOTORE DI GENERAZIONE SOTTO-RAMI … sviluppare in profondità il sotto-ramo per la macro-area "X"» | `mappai-mm-extraction.js:835-838` |
| Albero rigoroso genitore-figlio, «Non creare mai connessioni trasversali»; profondità cappata dallo slider (`maxMapLevel`) | `mappai-mm-extraction.js:840, 848` |
| Ogni nodo: `label` max 3 parole, `desc` 30-50 parole «fedele alle fonti», e `chunks` = 1-2 citazioni «REALI, INTEGRALI e VERBATIM» copiate dalla scheda (sono i brani che poi si leggono nella voce della mappa) | `mappai-mm-extraction.js:842-847` |
| ⚠️ Il catalogo dei rami fratelli + «REGOLA ANTI-DUPLICATI» esistono nel codice ma sono GATED da `mappai_branch_boundaries_enabled==='1'` → **OFF di default, OFF nell'istanza dei tester**. La guida NON deve attribuirli all'app di settembre | `mappai-generation-support.js:661-664`; `mappai-mm-extraction.js:761-763` |
| Anti-doppioni ATTIVO di default: i confini dichiarati in Fase 1 (`ambito`/`confini`) + il perimetro «solo il ramo X» del prompt Fase 3 | v. sopra |
| Ogni risposta JSON passa da `salvageTruncatedJSON` (ripara risposte troncate/sporche), mai `JSON.parse` diretto | regola di progetto (CLAUDE.md §10.5); uso in `mappai-mm-extraction.js` |

## 4. Fase 3.7 — approfondimento (ON di default)

| fatto | fonte |
|---|---|
| Velo: «Mappa HD - Fase 3.7: approfondimento ramo "<ramo>"...» | `mappai-generation-support.js:1899`; a-landing:142 |
| Modalità RESIDUO: il materiale per approfondire una foglia sono le FRASI DELLA FONTE non ancora usate, non la descrizione del padre | `mappai-generation-support.js:1724-1740` (commento di testa), `:1788-1799` |
| VERDETTO anti-parafrasi: ogni sotto-concetto proposto che ripete il padre viene scartato | idem, «P2 VERDETTO — rete di sicurezza deterministica» |
| Se la fonte è assente o < 200 caratteri, il passo SI SALTA («niente parafrasi») | `mappai-generation-support.js:1795-1799` |
| Una chiamata ogni 4 foglie per ramo (`MAX_CANDIDATES = 4`) | `mappai-generation-support.js:1803`; i-buco-costi §2.1 |

## 5. Dalla mappa ai materiali

| fatto | fonte |
|---|---|
| La mappa su disco: un file per concetto (`Nodi/*.md`, titolo + descrizione + `## Fonti`) + `links.json` per i collegamenti | g-disco §«Nodi/*.md», main.js:1496-1613, 1446-1460 |
| Quiz/flashcard/domande/fogli: per ogni ramo escono etichette + `desc` del ramo e discendenti (tetto 12.000 caratteri) — la scheda originale NON viene riletta | `mappai-material-pipeline.js:123-128, 288, 430-431`; i-buco-privacy §80 |
| Una chiamata per ramo per tipo per angolazione | `pipeline-core.js:343-348`, `material-pipeline.js:527-558`; i-buco-costi §2.2 |
| La sintesi è l'eccezione: oltre alla mappa riprende gli ESTRATTI delle fonti collegati ai nodi (`sourcesDict`) + la catena causale deterministica | `mappai-branch-synthesis.js:396-430`; i-buco-privacy §81 |
| La voce naturale legge la sintesi a blocchi: una chiamata per blocco di testo | PIANO §«La generazione, fotografata davvero» (misurato: 18 blocchi → 18 chiamate) |
| La foto non fa una mappa: fa una SCHEDA confermata dal docente, e da quella il dossier | f-visione; `app.js:1104-1135` |

## Parole da NON usare nel capitolo (e la traduzione)

| gergo | nella guida |
|---|---|
| L0 / L1 / nodo | il paragrafo introduttivo / le macro-aree / la voce della mappa |
| Fase 3.7 / deepening / residuo | l'approfondimento; «le frasi della scheda rimaste fuori» |
| chunks / verbatim | «i brani copiati parola per parola dalla scheda» |
| prompt / payload / JSON | «le istruzioni che l'app dà all'AI» / «la risposta» |
| salvageTruncatedJSON | «l'app controlla e ripara ogni risposta» |
| taratura (da sola) | «il livello di lettura della classe» (come nel capitolo 2) |
