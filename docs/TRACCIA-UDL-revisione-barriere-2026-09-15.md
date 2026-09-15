# Traccia futura — revisione delle barriere e differenziazione UDL

Data: 15 settembre 2026. Stato: promemoria di progettazione; non incluso nel lavoro di implementazione Sentence Transformers.

Documento tecnico collegato: [Piano Sentence Transformers locale](</Users/giacomomeschini/Claude/MappAI re/docs/PIANO-sentence-transformers-locale-2026-09-15.md>).

## Collegamento allo stato implementato

Aggiornamento documentale del 15 settembre 2026: il motore locale S0–S4 e la verifica tecnica S5 sono consegnati sul branch `codex/sentence-transformers-locale`; il Banco validazione è integrato nell’app e la revisione umana resta aperta. Vedere [rapporto di verifica](VERIFICA-sentence-transformers-locale-2026-09-15.md), [guida alla ricerca](GUIDA-ricerca-locale.md) e [guida del banco](GUIDA-banco-validazione-locale.md).

**Questa traccia rimane futura e non implementata.** Citazioni, giudizi di pertinenza e formulazioni conservate dal banco non costituiscono etichette di accessibilità, correttezza scientifica o efficacia didattica. L’aggiornamento dei collegamenti non amplia il perimetro del lavoro.

## Intenzione da conservare

Aiutare il docente a produrre materiali scientificamente precisi e a ridurre le barriere del curricolo. Offrire vie diverse per accedere ai contenuti, partecipare e dimostrare l'apprendimento, mantenendo riconoscibili gli obiettivi e l'azione richiesta allo studente.

Non equiparare UDL al numero di formati prodotti o alla brevità del testo. Non attribuire automaticamente un materiale a una diagnosi, a una categoria di studenti o a un presunto stile di apprendimento. I supporti devono essere selezionabili sulla base del contesto, dei bisogni e delle preferenze effettive.

Usare come riferimento le linee guida CAST 3.0: [coinvolgimento](https://udlguidelines.cast.org/engagement/), [rappresentazione](https://udlguidelines.cast.org/representation/), [azione ed espressione](https://udlguidelines.cast.org/action-expression/). Il dossier interno [Architettura e fondamenti UDL](</Users/giacomomeschini/Claude/MappAI re/revisione UDL/MappAI_ Architettura Funzionale e Fondamenti UDL.md>) conserva il contesto progettuale, ma contiene riferimenti alle versioni precedenti: ricontrollare i rimandi prima di riusarli. Non riprendere come fatto dimostrato l'affermazione che una pipeline vincolata alle fonti azzeri le allucinazioni.

## Prima idea di esperienza per il docente

Prima delle domande l'AI propone pochi obiettivi osservabili per ramo. Il docente può approvare, correggere, escludere o indicare priorità. Dopo la generazione, un pannello «Obiettivi e accessibilità» mostra possibili barriere e supporti, con proposte applicabili agli editor esistenti.

Evitare un lungo questionario obbligatorio. Il docente dovrebbe poter iniziare da una proposta già compilata, vedere pochi problemi concreti e approfondire soltanto dove serve.

La scheda di ogni attività potrebbe conservare:

| Informazione | Domanda guida |
|---|---|
| Obiettivo e priorità | Che cosa deve imparare a fare lo studente? |
| Evidenza attesa | Che cosa, nella risposta, permette di osservarlo? |
| Prerequisiti e fonti | Sono disponibili i concetti, i dati e gli strumenti necessari? |
| Nucleo da conservare | Quali fatti, condizioni e passaggi non possono sparire? |
| Possibile barriera | Che cosa rende difficile accedere o rispondere, oltre alla sfida prevista? |
| Supporti disponibili | Che aiuto si può attivare senza svolgere il ragionamento al posto dello studente? |
| Modalità di risposta | Quali modi di rispondere consentono di osservare l'obiettivo? |
| Decisione del docente | Quale proposta è stata adottata e per quale versione? |

Questi campi sono una traccia: definire lo schema soltanto quando inizia l'implementazione. L'indice delle fonti non deve dipendere oggi dalla loro esistenza.

## Idee da riprendere

### A. Obiettivi prima delle domande

- Proporre un piano breve collegato ai passaggi della fonte; segnalare dati o prerequisiti mancanti.
- Conservare il ruolo distinto degli MC (discriminazione e idee sbagliate) e delle aperte (ragionamento, procedure e risultati).
- Associare ciascuna domanda a un obiettivo persistente. Riprendere lo stesso tema può essere utile; ripetere la medesima operazione va reso visibile.
- Mostrare obiettivi scoperti e domande che non verificano quello dichiarato. La copertura delle domande non è una misura dell'apprendimento degli studenti.
- Mantenere le quantità del preset: se non bastano, mostrare le alternative al docente, senza espandere automaticamente il lotto.

### B. Revisione delle barriere

- Linguaggio: termini non spiegati, frasi interrotte o troppo dense, riferimenti ambigui, istruzioni con operazioni nascoste.
- Simboli e rappresentazioni: legenda assente, formule non leggibili con gli strumenti disponibili, schema che trasmette informazioni solo tramite colore.
- Organizzazione: prerequisiti impliciti, consegne poco segmentate, disallineamento fra domanda e criteri.
- Espressione: una modalità di risposta può introdurre una richiesta ulteriore rispetto all'obiettivo.
- Coinvolgimento: scopo poco chiaro, assenza di scelta pertinente, supporti non graduati, feedback che non indica come proseguire.

Queste sono categorie di possibili barriere da contestualizzare, non regole che dichiarano automaticamente difettosa un'attività.

### C. Varianti e supporti progressivi

Proporre, quando pertinenti, glossario, spiegazione dei simboli, testo segmentato, lettura vocale, rappresentazione alternativa accessibile, richiamo dei prerequisiti e suggerimenti progressivi. Rendere evidente quali supporti sono attivi e permettere di ridurli gradualmente.

Esempio di obiettivo: spiegare una relazione causale. Una risposta orale o uno schema commentato possono essere opzioni se rendono osservabile lo stesso ragionamento. Se l'obiettivo è costruire un testo argomentativo scritto, cambiare modalità modifica ciò che viene valutato e richiede una scelta didattica esplicita.

Controllare che una variante non elimini una condizione scientifica, non introduca una risposta già pronta e non trasformi la spiegazione in semplice riconoscimento. Se si intende cambiare anche l'obiettivo, registrarlo chiaramente.

### D. Glossario e correzione delle occorrenze

Proporre un glossario di progetto con termine preferito, sinonimi ammessi e termini non equivalenti. Il docente conserva il controllo. Una ricerca semantica propone altre occorrenze; l'anteprima deve mostrare ogni contesto prima di una modifica collettiva.

### E. Assistente conversazionale

Domande utili: «Quale barriera vedi qui?», «Come posso offrire un aiuto senza dare la risposta?», «Questa variante mantiene l'obiettivo?», «Queste due domande richiedono davvero azioni diverse?».

Le risposte dovrebbero produrre una scheda con problema, motivo, proposta, effetto su obiettivo/contenuto e riferimenti consultati. Applicare attraverso il registro decisioni esistente, con differenze visibili. Evitare una chat che richieda di copiare e incollare manualmente tutte le correzioni.

## Rapporto con Sentence Transformers

Gli embedding recuperano concetti, fonti, varianti e possibili doppioni. Il reranker migliora la scelta dei passaggi. Non decidono l'equivalenza didattica e non certificano accessibilità o correttezza.

La revisione futura deve combinare obiettivi espliciti, prove delle fonti, controlli strutturali, analisi LLM e decisione del docente. Formule, grafici e accessibilità del file finale richiedono verifiche proprie. Non usare la sola similarità fra testi come criterio per approvare una variante.

## Banco futuro da preparare

Raccogliere attività reali con: obiettivo, barriera osservata, supporto proposto, versione adottata, verifica disciplinare e riscontro del docente/studenti. Confrontare almeno una variante riuscita e una che perde contenuto o cambia il compito.

Valutare separatamente:

- conservazione di fatti, condizioni e ragionamento;
- allineamento fra domanda, obiettivo e criteri;
- utilità e gradualità dei supporti;
- accessibilità effettiva con tastiera, lettura vocale e strumenti pertinenti;
- autonomia e comprensione osservate nell'uso;
- tempo del docente e proposte inutili.

Un elenco CAST spuntato automaticamente non dimostra efficacia didattica. Le prove con studenti vanno progettate con il docente, senza inferire diagnosi dai comportamenti registrati.

## Ordine indicativo, da decidere più avanti

1. Piano di obiettivi essenziale e collegamento alle domande.
2. Revisione delle barriere linguistiche e organizzative nel modale.
3. Supporti selezionabili e controllo del contenuto conservato nelle varianti.
4. Modalità di risposta alternative compatibili con gli obiettivi.
5. Assistente conversazionale e sperimentazione con riscontri d'uso.

Questioni da riprendere: granularità degli obiettivi, priorità del docente, numero di proposte visibili, quali supporti sono già presenti, accessibilità delle rappresentazioni, criteri di equivalenza e modo leggero di raccogliere riscontri. Non risolverle tutte durante il lavoro sul motore locale.
