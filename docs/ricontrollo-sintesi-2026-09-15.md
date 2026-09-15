# Correzioni di sintesi e ricontrollo — 15 settembre 2026

Intervento sulle logiche di MappAI richiesto dopo l’analisi di **Officina Elettrica**. I 69 file del progetto sono rimasti invariati. Non sono state cambiate le regole di impaginazione dei PDF: nelle MC e nelle aperte le soluzioni continuano a iniziare su una nuova pagina. La priorità 1 del rapporto resta fuori da questo intervento.

## Correzioni implementate

| Problema | Comportamento introdotto | Codice |
|---|---|---|
| LaTeX letterale nella sintesi | Le formule vengono protette prima della conversione Markdown e trasformate in MathML, leggibile anche nell’HTML offline. Il passaggio nell’editor conserva il TeX originale per la successiva esportazione; la lettura audio esclude l’annotazione tecnica duplicata. | `public/js/mappai-branch-synthesis.js`, `mappai-docedit-core.js`, `mappai-tts-reader.js` |
| Riferimenti come `[src-1hqpso6]` | Riconoscimento delle parentesi singole e doppie nelle funzioni comuni di citazione, revisione e registrazione. Gli ID noti diventano richiami leggibili; quelli sconosciuti restano segnalati, senza inventare fonti. | `public/js/mappai-grounding-core.js`, `mappai-material-review.js` |
| Relazione `synthesis-causal-0-0` | L’estrattore non inverte più automaticamente le dipendenze espresse con “grazie a”/“thanks to”. Quella trasformazione produceva “energia elettrica → permette → L’auto elettrica è un veicolo che funziona”. Queste frasi restano nella prosa: ricavarne una relazione corretta richiederebbe una riscrittura grammaticale. Restano attive le altre forme già gestite, comprese quelle esplicite con “permette di”. | `public/js/mappai-causal-core.js` |
| Radice e quattro collegamenti esclusi dal controllo | Un passaggio dedicato esamina descrizione e collegamenti della radice, con le fonti dei due estremi. I rami vengono controllati una sola volta. Mancanza di evidenze, errori del servizio o verdetti assenti mantengono il controllo parziale. | `public/js/mappai-generation-support.js` |
| Introduzione editoriale che bloccava `synthesis-3` | “Ecco come funziona il movimento delle cariche:” può ricevere l’esito `instruction`. L’accettazione è limitata a introduzioni riconoscibili, senza segnalazioni fattuali associate; le frasi dichiarative e le premesse fattuali restano soggette a verifica. | `public/js/mappai-material-review.js` |

KaTeX resta alla versione 0.16.9 già usata dall’app, ora disponibile anche come script locale con relativa licenza MIT. L’HTML della sintesi contiene già il risultato matematico e non deve scaricare KaTeX per mostrarlo.

Il contratto del controllo passa a `material-check@2`. Al primo ricontrollo un vecchio checkpoint comporta un controllo completo; i passaggi successivi riutilizzano nuovamente gli esiti completi ancora validi. Il passaggio sulla radice richiede una richiesta al modello aggiuntiva quando esistono descrizione ed evidenze.

Le modifiche sono nel codice locale: occorre ricaricare MappAI per usarle. Non è stata avviata una generazione AI né riscritto un materiale del progetto. Gli HTML già salvati conservano il contenuto e il codice incorporati al momento della loro creazione.

## Chiarimento sulla relazione corretta a mano

Il rilievo del rapporto riguardava il residuo **“con facendo girare”** nella frase composta dell’analogia idraulica. La modifica del docente era stata salvata ed esportata correttamente. Il problema segnalato era di rilettura grammaticale della frase risultante; il titolo “relazione corretta a mano” era poco preciso. Un eventuale aiuto dell’editor dovrebbe mostrare la frase completa e proporre un miglioramento, lasciando al docente la scelta. Questa funzionalità non è stata aggiunta ora.

## Significato delle priorità 3, 4 e 5

**3 — Verifica scientifica indipendente.** Il controllo di fedeltà stabilisce se un materiale rispetta la fonte. Se la fonte contiene un errore, può confermare anche la sua riproduzione. Un controllo aggiuntivo di Scienze dovrebbe verificare unità, formule e condizioni dei modelli, usando regole controllabili e riferimenti disciplinari affidabili. In caso di conflitto dovrebbe mostrare il passaggio della fonte, la ragione del dubbio e la prova a sostegno, per consentire una decisione informata del docente. Questa priorità non equivale alla correzione dei materiali esistenti prevista dalla priorità 1.

**4 — Obiettivi prima delle domande.** Prima di scrivere il lotto, assegnare a ogni domanda un obiettivo e una funzione. Gli MC distinguono concetti e idee sbagliate; le aperte richiedono spiegazioni, procedure o interpretazioni dei risultati. Confrontare questi obiettivi permette di riconoscere duplicazioni come quelle rilevate fra le aperte 1/6 e 2/4, e di rendere visibili gli obiettivi ancora scoperti. Le quantità restano quelle scelte nel preset; eventuali lotti aggiuntivi rispondono a un bisogno specifico.

**5 — Controllo dell’output finale.** Dopo le decisioni del docente, verificare che il documento effettivamente esportato contenga il testo approvato, mantenga esclusioni e correzioni e presenti formule e citazioni leggibili. La frase composta va riletta nel suo insieme. Il riepilogo dovrebbe distinguere una decisione del docente da una verifica scientifica superata. Questo controllo conserva la separazione fra domande e soluzioni nei PDF.

Le priorità 3, 4 e 5 sono chiarimenti e proposte per gli interventi successivi, non nuove funzionalità implementate in questa modifica.

## Verifica

- 355 test mirati superati: estrazione delle relazioni, citazioni, revisione, editor, pipeline ed esportazione, comprese le regole dei fogli stampati.
- Suite completa: 1.550 test superati e 2 saltati. I 73 test dei server erano impediti dalla sandbox nell’apertura delle porte locali; rieseguiti con tale permesso, sono tutti passati.
- Electron senza accesso HTTP/HTTPS: formula chimica renderizzata, pedice presente, annotazione tecnica nascosta, nessun ID grezzo visibile; formula identica dopo il passaggio nell’editor.
- Riproduzione in memoria dei dati di Officina Elettrica: 53 nodi assegnati una sola volta, quattro collegamenti della radice inclusi, 29 frammenti di `synthesis-3` completabili, compresa l’introduzione editoriale `claim-1du8o6s`.
- Le risposte del modello nei test sono simulate: verificano il protocollo e la copertura, senza costituire una nuova validazione scientifica dei materiali. Nessuna chiamata AI a pagamento.
- Impronte dei 69 file del progetto confrontate prima e dopo la verifica visiva: nessuna modifica.
