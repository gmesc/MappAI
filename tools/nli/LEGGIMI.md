# Banco NLI separato

Packet 0016. Esperimento locale, nessuna integrazione nell'app. Il progetto originale non viene scritto. Il campione iniziale contiene i nessi saltati della revisione iniziale, non necessariamente errori.

## Uso del docente

1. Apri con doppio clic **Apri banco NLI.command**. Si apre il browser; conserva il Terminale aperto. Se macOS non permette il doppio clic, dal tuo Terminale esegui `zsh "/Users/giacomomeschini/Claude/MappAI re/tools/nli/Apri banco NLI.command"`.
2. Apri il collegamento: la scheda unica mostra i passaggi recuperati da Evidence. Premi **Togli dalla selezione** per quelli non pertinenti; **Ripristina** li reinserisce. L’originale rimane conservato.
3. Le scelte sono separate: **Va bene / Da migliorare / Escludi dalla prova** descrive la qualità della frase; **Sostiene / Contraddice / Non permette di stabilirlo** descrive il rapporto con il solo passaggio mostrato. «Da migliorare» non assegna un giudizio NLI: scrivi la correzione nella nota, poi valuta la frase originale oppure escludila motivando. La nota non modifica la frase che leggerà il modello. I casi esclusi non entrano nei punteggi, anche se conservano un giudizio precedente.
4. Per aggiungere fonti, scegli documento e pagina, seleziona le parole e premi **Aggiungi il testo selezionato**, oppure incollale in **Citazione dalla pagina aperta** e premi **Aggiungi citazione**. Puoi unire estratti di pagine diverse. Il banco verifica la provenienza (tollera differenze negli spazi, non parafrasi). Se hai incollato un testo sbagliato, usa **Elimina citazione aggiunta** e aggiungilo nuovamente dalla pagina giusta. Dati oltre il limite del modello sono segnalati, mai tagliati in silenzio.
5. Dopo aver annotato il campione senza guardare previsioni, premi **Prova i casi annotati**. Per provare soltanto il funzionamento bastano pochi casi: non chiamare quel risultato una misura generale di precisione. Il primo avvio può richiedere tempo per scaricare i pesi. Non usa il token Infomaniak.
6. Leggi risultati e matrice di confronto. **Scarica campione e risultati** conserva anche i riferimenti e gli hash. Per chiudere il server: Ctrl+C nel Terminale.

## Cosa misuriamo

### Confrontare originale e proposta

Apri **Proponi un collegamento alternativo (facoltativo)**, scrivi la frase e assegna il suo giudizio rispetto al passaggio mostrato. Il giudizio dell’originale rimane separato. Premi **Salva**, poi **Prova i casi annotati**: nella sezione **Confronta con il modello dopo il tuo giudizio** trovi i due risultati.

Originale e proposta usano esattamente gli stessi passaggi e riferimenti, senza ripetere il recupero. Puoi cambiare verbo, direzione o precisare i concetti; non è necessariamente una parafrasi equivalente. Una nota preesistente non diventa automaticamente una proposta né un giudizio: copiala nel nuovo campo quando vuoi provarla. La proposta è facoltativa e può essere salvata come bozza. Modificare il testo della proposta nell’interfaccia azzera il suo giudizio, che va riassegnato; l’originale resta intatto.

L’esclusione riguarda l’originale: puoi comunque provare una proposta con il suo giudizio. Senza due giudizi e due risultati validi non c’è un confronto completo. Metriche originali e proposte sono separate; i gruppi possono contenere casi diversi, quindi non interpretare la differenza complessiva come un miglioramento misurato sugli stessi casi. I risultati storici conservano entrambe le versioni; modificare la proposta invalida solo il suo risultato, modificare il passaggio comune invalida entrambi.

### Riprendere senza rifare il lavoro

Le note precedenti sono conservate. «Nota salvata · manca giudizio sulla fonte» indica che manca solo la scelta sostenuta/contraddetta/non determinabile: una nota non viene trasformata automaticamente in un giudizio. Il vecchio «Da preparare» non compare più.

Usa **Mostra → Senza giudizio sulla fonte**, oppure **Da migliorare**, **Esclusi**, **Con una nota**. **Salva e successivo** salva anche una semplice nota e passa al caso seguente; la numerazione resta quella originale. Filtro e caso vengono ricordati in questo browser. I salvataggi sono espliciti; cambiando scheda con modifiche non salvate compare un avviso. Una pagina rimasta aperta con dati vecchi non può sovrascrivere una modifica più recente: copia il testo non salvato e ricarica.

Quando cambi i passaggi vengono azzerati i due giudizi della selezione: devi riassegnarli rispetto al nuovo contesto. Note, qualità della frase e proposta restano. Anche dopo aver ripristinato un passaggio la selezione resta un lavoro del docente. Puoi salvare una selezione vuota come bozza, ma non assegnare giudizi senza fonti.

**Recupero automatico iniziale e prove precedenti** conserva passaggi, giudizi, note e risultati del recupero automatico, le vecchie prove manuali e le selezioni salvate precedentemente. I dati preesistenti non sono migrati né sovrascritti. I risultati storici restano anche nei file dei giri. Una nuova inferenza considera tutti i casi annotati, mantenendo separati i risultati del recupero automatico, della selezione del docente e delle vecchie prove manuali. Il confronto del modello si apre a richiesta, per assegnare prima il tuo giudizio.

### Indicatori

- Accordo complessivo: predizioni corrette / casi valutati.
- Precisione delle risposte «sostenuta»: quanti casi indicati come sostenuti lo sono per il docente.
- Contraddizioni individuate: contraddizioni rilevate / contraddizioni annotate.
- Falsi allarmi: casi sostenuti classificati contraddetti.
- Esclusioni, errori, casi non annotati e previsioni obsolete restano visibili fuori dai denominatori.

Argmax delle tre classi, nessuna soglia calibrata; nessun punteggio è una probabilità certificata di verità. I casi delle due condizioni sono correlati e non vanno sommati come campione indipendente. Dopo aver visto una risposta, correggere il gold rende la prova esplorativa: usare un campione nuovo per confermare le decisioni. Le varianti sintetiche sono rimandate; quando aggiunte andranno riportate separatamente e mantenute nello stesso gruppo dell'originale per evitare contaminazioni tra taratura e verifica.

## Dati e riproducibilità

`runs/svizzera/campione.json` è la copia annotabile; ogni giro conserva input, gold, previsioni, hash, revision del modello e versioni del runtime. `ultimo-risultato.json` serve solo alla vista corrente. Modificare input o gold invalida la previsione corrente; lo storico rimane. Non usare due server contemporaneamente sullo stesso campione.

Il server accetta solo localhost, protegge le scritture con token per sessione e non offre accesso generico ai file. Pesi, ambiente, campioni e risultati sono ignorati da Git. La rete serve al download di software e pesi; i testi sono elaborati localmente sulla CPU. Non servono credenziali Hugging Face. Non eseguire Electron da questo banco.

Modello: [mDeBERTa NLI 2mil7](https://huggingface.co/MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7), licenza MIT. Caricamento con codice remoto disabilitato; tokenizer della stessa revisione dei pesi. Input oltre max_position_embeddings viene rifiutato. La prova non certifica accuratezza sui materiali italiani prima dell'annotazione.

## Consolidamento del 23 settembre 2026

Packet 0016: prova del docente svolta, gate concluso con la richiesta di Giacomo
«ok procediamo con il punto 1 della tua lista: consolidare 0016». Banco separato
consegnato; nessuna adozione di NLI o Zelph nella pipeline e nessun commit/push.

Le esportazioni (3), (4), (5) sono conservate anche in
`runs/consolidamento-20260923/esportazione-{3,4,5}.json`, con provenienza e SHA-256
in `manifest.json`. Sono copie locali ignorate da Git: per un backup esterno
conservare quella cartella insieme a `runs/svizzera/`. Il campione operativo e
i giudizi del docente non sono stati modificati durante il consolidamento.

Ultimo giro: `giro-20260923T115928889008Z.json`, modello
`MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7`, revisione
`b5113eb38ab63efdd7f280f8c144ea8b13f978ce`. 46 valutazioni tentate, 44 eseguite;
le due versioni del caso 1 superano il limite di 512 token (660 e 662).

| Condizione | Originali: accordo docente/modello | Proposte: accordo docente/modello |
|---|---:|---:|
| Evidence automatico | 16/18 | 8/11 |
| Selezione del docente | 3/7 | 6/7 |
| Vecchia prova manuale separata | 0/1 | Nessuna |

Gruppi diversi, giudizi in parte rivisti, proposte modificate dopo aver visto
risultati: è un esperimento esplorativo, non una misura su un campione indipendente.
Nel giro precedente le proposte selezionate erano in accordo per 4/7:

- Caso 4: passaggi identici, relazione riscritta da «sostengono» a «riguardano»
  con accuse esplicite; risposta da non determinabile a sostenuta. Cambia il
  significato della relazione, non soltanto lo stile della frase.
- Caso 5: cambiano sia soggetto/proposta sia i passaggi; risposta da contraddetta
  a sostenuta. Non si può attribuire il risultato alla sola formulazione.
  Il giudizio dell'originale resta vuoto: per questo il denominatore è 7 invece di 8.
- Caso 6: resta disaccordo sulla proposta «Restrizioni all'asilo nonostante
  Politica dei Profughi»: docente sostenuta, modello contraddetta.
- Caso 28: il modello considera sostenuti sia l'originale con «richiede» sia
  la proposta con «indaga», mentre il docente distingue i due rapporti.

Conclusione operativa: il controllo dipende da passaggi, soggetti e relazione
espressa; queste prove non giustificano approvazioni o bocciature automatiche.
Un'eventuale adozione richiede una decisione distinta e una verifica su casi nuovi.

Restano facoltativi per una nuova sessione di ricerca, non bloccanti per consegnare
il banco: accorciare il caso 1, riassegnare il giudizio originale del caso 5,
esaminare il disaccordo del caso 6 e completare le annotazioni mancanti.

## Comandi per manutenzione

```sh
python3 -m venv --system-site-packages tools/nli/.venv
tools/nli/.venv/bin/python -m pip install -r tools/nli/requirements.txt
python3 tools/nli/banco.py --prepare "/percorso/progetto" --data tools/nli/runs/nuova-prova/campione.json
tools/nli/.venv/bin/python tools/nli/banco.py --data tools/nli/runs/nuova-prova/campione.json
python3 -m unittest discover -s tools/nli -p 'test_*.py'
node --test tools/nli/esporta.test.js
npm test
```

L'esportatore riusa direttamente il core Evidence installato nel checkout: conservare la provenienza prodotta con il campione. Rifiuta indici non allineati alle fonti dello snapshot e campioni già presenti. Legge solo pipeline.json ed evidenze.json. Il server successivamente lavora solo sulla copia.
