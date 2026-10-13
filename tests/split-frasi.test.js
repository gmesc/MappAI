'use strict';
/*
 * split-frasi.test.js — lo splitter delle frasi (packet 0030).
 *
 * `splitSentences` di mappai-deepen-core.js decide dove finisce una frase per
 * l'àncora (frasiDaPagine → citazioni), per le evidenze (lexical → idUnita), per
 * enrich-core e per ELABORA. La V1 spezzava dopo ogni punto seguito da spazio;
 * la diagnosi del 25/09/2026 ha contato 16 errori su 20 casi di italiano
 * realistico. I 20 casi della diagnosi non stavano nel repo: sono ricostruiti qui
 * dal packet (§«Serve davvero?» e §4) — 16 abbreviazioni su cui la V1 sbaglia, 4
 * casi su cui la V1 aveva già ragione e che la V2 non deve rompere.
 *
 * Le 3 trappole vere (§4 del packet):
 *   · «pag.» sempre abbreviazione rompe 2 test di anchor-core: «pag.» davanti a
 *     una maiuscola è l'intestazione di pagina, e lì si spezza;
 *   · «formula E. Il team» deve spezzare (un'iniziale seguita da un articolo);
 *   · «conflitto. a. Quale…?» deve spezzare (un marcatore d'elenco minuscolo).
 *
 * E la garanzia sugli id (invariante 22): la V2 TOGLIE soltanto confini alla
 * V1, non ne aggiunge mai, quindi un testo senza abbreviazioni dà lo stesso
 * identico risultato della V1.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const DC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-deepen-core.js'));

const V2 = DC.splitSentences;
const V1 = DC.splitSentencesV1;

// [nome, testo, frasi attese dalla V2]
const CASI_ABBREVIAZIONI = [
    ['Fig. 1', 'Come mostra la Fig. 1 il circuito resta chiuso.',
        ['Come mostra la Fig. 1 il circuito resta chiuso.']],
    ['ecc. (segue minuscola)', 'La Svizzera esportava armi, munizioni, orologi ecc. verso la Germania.',
        ['La Svizzera esportava armi, munizioni, orologi ecc. verso la Germania.']],
    ['es.', 'Alcuni metalli, per es. Rame e argento, conducono bene la corrente.',
        ['Alcuni metalli, per es. Rame e argento, conducono bene la corrente.']],
    ['p. 12', 'Il grafico a p. 12 mostra la crescita della produzione.',
        ['Il grafico a p. 12 mostra la crescita della produzione.']],
    ['art. 5', "Secondo l'art. 5 della Costituzione la Confederazione rispetta il diritto.",
        ["Secondo l'art. 5 della Costituzione la Confederazione rispetta il diritto."]],
    ['S. Gottardo', 'Il ridotto nazionale comprendeva il S. Gottardo e le Alpi centrali.',
        ['Il ridotto nazionale comprendeva il S. Gottardo e le Alpi centrali.']],
    ['G. Guisan', 'Il generale G. Guisan riunì gli ufficiali sul Rütli nel 1940.',
        ['Il generale G. Guisan riunì gli ufficiali sul Rütli nel 1940.']],
    ['1. settembre', "La guerra cominciò il 1. settembre 1939 con l'invasione della Polonia.",
        ["La guerra cominciò il 1. settembre 1939 con l'invasione della Polonia."]],
    ['a.C.', 'Nel 44 a.C. Cesare fu ucciso a Roma.',
        ['Nel 44 a.C. Cesare fu ucciso a Roma.']],
    ['U.S.A.', 'Negli U.S.A. Roosevelt promosse il New Deal.',
        ['Negli U.S.A. Roosevelt promosse il New Deal.']],
    ['cfr. e Doc. 3', 'La neutralità era armata (cfr. Doc. 3) e riconosciuta dalle potenze.',
        ['La neutralità era armata (cfr. Doc. 3) e riconosciuta dalle potenze.']],
    ['ca. 4', 'La popolazione contava ca. 4 milioni di abitanti.',
        ['La popolazione contava ca. 4 milioni di abitanti.']],
    ['Gen. (titolo)', 'Il Gen. Guisan parlò agli ufficiali riuniti.',
        ['Il Gen. Guisan parlò agli ufficiali riuniti.']],
    ['Tab. II (romano)', 'I dati della Tab. II riportano le importazioni di carbone.',
        ['I dati della Tab. II riportano le importazioni di carbone.']],
    ['N.B.', 'N.B. Il circuito va aperto prima di toccare i fili.',
        ['N.B. Il circuito va aperto prima di toccare i fili.']],
    ['E. coli', "Il batterio E. coli vive nell'intestino umano.",
        ["Il batterio E. coli vive nell'intestino umano."]],
];

const CASI_GIA_GIUSTI = [
    ['decimali e migliaia', 'La resistenza vale 3.5 ohm e il rame costava 1.200 franchi.',
        ['La resistenza vale 3.5 ohm e il rame costava 1.200 franchi.']],
    ['fine vera dopo un anno', 'La guerra finì nel 1945. La Svizzera restò neutrale.',
        ['La guerra finì nel 1945.', 'La Svizzera restò neutrale.']],
    ['«ecc.» che chiude davvero la frase', 'Si vendevano mele, pere ecc. Il mercato chiuse presto.',
        ['Si vendevano mele, pere ecc.', 'Il mercato chiuse presto.']],
    ['! ? ; : spezzano come prima', 'Attenzione! Perché si scalda? Perché la resistenza è bassa; il filo: rame.',
        ['Attenzione!', 'Perché si scalda?', 'Perché la resistenza è bassa;', 'il filo:', 'rame.']],
];

const TRAPPOLE = [
    ['«pag.» davanti a una maiuscola è un\'intestazione (anchor-core)',
        'Storia IV Media La Seconda Guerra Mondiale pag. Il contenuto vero della pagina numero 1 con abbastanza parole per restare.',
        ['Storia IV Media La Seconda Guerra Mondiale pag.', 'Il contenuto vero della pagina numero 1 con abbastanza parole per restare.']],
    ['«formula E. Il team»: iniziale seguita da un articolo',
        'Il campionato si chiama formula E. Il team svizzero ha vinto due gare.',
        ['Il campionato si chiama formula E.', 'Il team svizzero ha vinto due gare.']],
    ['«conflitto. a. Quale…?»: marcatore d\'elenco minuscolo',
        'Rispondi alle domande sul conflitto. a. Quale paese invase la Polonia?',
        ['Rispondi alle domande sul conflitto.', 'a.', 'Quale paese invase la Polonia?']],
];

/* Giro di correzione 1 (revisione avversaria del 26/09/2026, 71 casi): la prima
   stesura della V2 fondeva 24 coppie di frasi che la V1 spezzava giusto, e
   nell'àncora una fusione che finisce con «?» o apre con una consegna fa
   PERDERE la frase buona. Qui la V2 deve dare esattamente ciò che dava la V1. */
const FINE_VERA = [
    // A. sigla puntata in coda di frase
    ['A1 a.C. + «Secondo»', 'Roma fu fondata nel 753 a.C. Secondo la leggenda il fondatore fu Romolo.',
        ['Roma fu fondata nel 753 a.C.', 'Secondo la leggenda il fondatore fu Romolo.']],
    ['A2 d.C. in coda + nome', "L'Impero romano d'Occidente cadde nel 476 d.C. Odoacre depose l'ultimo imperatore.",
        ["L'Impero romano d'Occidente cadde nel 476 d.C.", "Odoacre depose l'ultimo imperatore."]],
    ['A3 a.C. + «Da»', 'Le prime Olimpiadi si tennero nel 776 a.C. Da allora i Greci contavano gli anni a partire da quella data.',
        ['Le prime Olimpiadi si tennero nel 776 a.C.', 'Da allora i Greci contavano gli anni a partire da quella data.']],
    ['A5 O.N.U.', "Nel 1945 nacque l'O.N.U. Il suo scopo era mantenere la pace nel mondo.",
        ["Nel 1945 nacque l'O.N.U.", 'Il suo scopo era mantenere la pace nel mondo.']],
    ['A6 U.S.A. in coda', 'Nel dicembre 1941 entrarono in guerra anche gli U.S.A. Il Giappone aveva attaccato Pearl Harbor.',
        ['Nel dicembre 1941 entrarono in guerra anche gli U.S.A.', 'Il Giappone aveva attaccato Pearl Harbor.']],
    ['A8 s.l.m.', 'Il Monte Rosa è alto 4634 m s.l.m. Il Cervino è più basso di circa 150 metri.',
        ['Il Monte Rosa è alto 4634 m s.l.m.', 'Il Cervino è più basso di circa 150 metri.']],
    ['A10 S.p.A.', 'La turbina fu costruita dalla Brown Boveri S.p.A. La ditta aveva sede a Baden.',
        ['La turbina fu costruita dalla Brown Boveri S.p.A.', 'La ditta aveva sede a Baden.']],
    // B. lettera maiuscola singola in coda di frase
    ['B1 «in A.» + consegna', "Sia ABC un triangolo rettangolo in A. Traccia l'altezza relativa all'ipotenusa.",
        ['Sia ABC un triangolo rettangolo in A.', "Traccia l'altezza relativa all'ipotenusa."]],
    ['B2 «punto B.»', "Il segmento AB termina nel punto B. Successivamente si traccia la bisettrice dell'angolo.",
        ['Il segmento AB termina nel punto B.', "Successivamente si traccia la bisettrice dell'angolo."]],
    ['B3 «vitamina C.» + «È»', 'Gli agrumi sono ricchi di vitamina C. È importante mangiarne ogni giorno.',
        ['Gli agrumi sono ricchi di vitamina C.', 'È importante mangiarne ogni giorno.']],
    ['B4 «lettera I.» + «Ogni»', 'La corrente si indica con la lettera I. Ogni amperometro va collegato in serie.',
        ['La corrente si indica con la lettera I.', 'Ogni amperometro va collegato in serie.']],
    ['B5 «resistenza R.» + consegna', 'Nel circuito è inserita una resistenza R. Misura la tensione ai suoi capi con il voltmetro.',
        ['Nel circuito è inserita una resistenza R.', 'Misura la tensione ai suoi capi con il voltmetro.']],
    ['B6 formula «R · I.»', 'La legge di Ohm si scrive V = R · I. Misurando V e I si ricava la resistenza.',
        ['La legge di Ohm si scrive V = R · I.', 'Misurando V e I si ricava la resistenza.']],
    ['B7 simbolo non latino «Ω.»', "L'unità della resistenza è l'ohm Ω. Ohm pubblicò la sua legge nel 1827.",
        ["L'unità della resistenza è l'ohm Ω.", 'Ohm pubblicò la sua legge nel 1827.']],
    ['B8 «è C.» + «Tutti»', 'Il simbolo del carbonio è C. Tutti i composti organici contengono carbonio.',
        ['Il simbolo del carbonio è C.', 'Tutti i composti organici contengono carbonio.']],
    ['B9 «Carlo V.» + «Durante»', "Il sovrano più potente d'Europa era Carlo V. Durante il suo regno l'impero si estese.",
        ["Il sovrano più potente d'Europa era Carlo V.", "Durante il suo regno l'impero si estese."]],
    ['B10 «piano B.» + nome', 'La Germania aveva preparato un piano B. Hitler però scelse di attaccare a est.',
        ['La Germania aveva preparato un piano B.', 'Hitler però scelse di attaccare a est.']],
    ['B15 «tipo G.» + «Altre»', 'Il Sole è una stella di tipo G. Altre stelle sono molto più calde.',
        ['Il Sole è una stella di tipo G.', 'Altre stelle sono molto più calde.']],
    ['B16 «formula E. Sviluppa» (Officina p.2)', 'Il campionato elettrico si chiama formula E. Sviluppa competenze da meccanico.',
        ['Il campionato elettrico si chiama formula E.', 'Sviluppa competenze da meccanico.']],
    // C. «Ca» e «VS» maiuscoli sono il calcio e il Vallese, non «circa» e «versus»
    ['C1 Ca (calcio)', 'Il simbolo chimico del calcio è Ca. Si trova nelle ossa e nei denti.',
        ['Il simbolo chimico del calcio è Ca.', 'Si trova nelle ossa e nei denti.']],
    ['C2 VS (Vallese)', 'Il Cantone Vallese ha la sigla VS. Il suo capoluogo è Sion.',
        ['Il Cantone Vallese ha la sigla VS.', 'Il suo capoluogo è Sion.']],
    ['C3 elenco di sigle cantonali', 'Le targhe dei cantoni alpini sono UR, GR, TI e VS. Ogni cantone ha il suo stemma.',
        ['Le targhe dei cantoni alpini sono UR, GR, TI e VS.', 'Ogni cantone ha il suo stemma.']],
    // D. dopo «p.» e «n.» la «I» è l'articolo, non un romano
    ['D1 «tipo p. I»', 'Un semiconduttore può essere drogato di tipo p. I portatori di carica sono allora le lacune.',
        ['Un semiconduttore può essere drogato di tipo p.', 'I portatori di carica sono allora le lacune.']],
    ['D2 «è n. I»', 'Il numero dei lati del poligono è n. I vertici sono altrettanti.',
        ['Il numero dei lati del poligono è n.', 'I vertici sono altrettanti.']],
];

// …e le abbreviazioni vere restano intere (la V1 le spezzava a torto).
const RESTANO_INTERE = [
    ['A4 data in testa', 'Nel 476 d.C. Odoacre depose Romolo Augustolo.', ['Nel 476 d.C. Odoacre depose Romolo Augustolo.']],
    ['A9 s.l.m. + minuscola', 'Lugano si trova a 273 m s.l.m. ed è la città più grande del Ticino.',
        ['Lugano si trova a 273 m s.l.m. ed è la città più grande del Ticino.']],
    ['A11 N.B. apre la nota', 'N.B. Il multimetro va impostato prima della misura.', ['N.B. Il multimetro va impostato prima della misura.']],
    ['A12 a.C. in mezzo e in coda', 'Il I sec. a.C. fu segnato dalle guerre civili. Cesare attraversò il Rubicone nel 49 a.C. Il Senato lo dichiarò nemico pubblico.',
        ['Il I sec. a.C. fu segnato dalle guerre civili.', 'Cesare attraversò il Rubicone nel 49 a.C.', 'Il Senato lo dichiarò nemico pubblico.']],
    ['B11 iniziale di un nome', 'Il generale H. Guisan convocò gli ufficiali sul Rütli.', ['Il generale H. Guisan convocò gli ufficiali sul Rütli.']],
    ['B12 iniziale + fine vera', 'La pila fu inventata da A. Volta. Galvani aveva studiato le rane.',
        ['La pila fu inventata da A. Volta.', 'Galvani aveva studiato le rane.']],
    ['B13 due iniziali', 'Il filosofo J. J. Rousseau nacque a Ginevra nel 1712.', ['Il filosofo J. J. Rousseau nacque a Ginevra nel 1712.']],
    ['C4 vs. minuscolo', 'La partita fu Svizzera vs. Germania.', ['La partita fu Svizzera vs. Germania.']],
    ['C5 ca. minuscolo', 'Il lago Ceresio misura ca. 49 km².', ['Il lago Ceresio misura ca. 49 km².']],
    ['D3 vol. II', 'I dati sono nel vol. II della raccolta.', ['I dati sono nel vol. II della raccolta.']],
    ['p. XII (romano di più lettere dopo «p.»)', 'La prefazione a p. XII spiega il metodo.', ['La prefazione a p. XII spiega il metodo.']],
    ['G12 iniziale fra parentesi', 'Il generale (H. Guisan) parlò agli ufficiali sul Rütli.', ['Il generale (H. Guisan) parlò agli ufficiali sul Rütli.']],
];

/* Giro di correzione 2 (revisione avversaria del 26/09/2026, 70 casi): il giro 1
   aveva chiuso gli esempi, non la classe. Dopo un'iniziale o una sigla, una
   DOMANDA («Quanto», «Che cosa», «Qual è», «Chi»), una consegna che mancava agli
   elenchi («Costruisci», «Sapendo», «Unisci») o una parola come «Suo», «Tale»,
   «Pochi» veniva incollata alla frase prima; e se la seconda è una domanda,
   l'àncora scarta la fusione intera. La regola «al più 4 parole prima di a.C.»
   fondeva le frasi corte della lingua semplificata («Roma nasce nel 753 a.C.»):
   ora conta che la frase cominci con una preposizione di tempo o una cifra. */
const FINE_VERA_GIRO2 = [
    // H. domande dopo una lettera o una sigla
    ['H1 «in A.» + «Quanto»', "Il triangolo ABC è rettangolo in A. Quanto misura l'ipotenusa BC?",
        ['Il triangolo ABC è rettangolo in A.', "Quanto misura l'ipotenusa BC?"]],
    ['H2 «in O.» + «Quale»', 'Le due rette si incontrano in O. Quale angolo formano?',
        ['Le due rette si incontrano in O.', 'Quale angolo formano?']],
    ['H3 «morsetto B.» + «Che cosa»', "Nel circuito la lampadina è collegata al morsetto B. Che cosa succede se apri l'interruttore?",
        ['Nel circuito la lampadina è collegata al morsetto B.', "Che cosa succede se apri l'interruttore?"]],
    ['H4 «con U.» + «Quanti»', 'La tensione ai capi della pila si indica con U. Quanti volt misura il voltmetro?',
        ['La tensione ai capi della pila si indica con U.', 'Quanti volt misura il voltmetro?']],
    ['H5 «è O.» + «Qual è»', "Il simbolo dell'ossigeno è O. Qual è il simbolo dell'idrogeno?",
        ["Il simbolo dell'ossigeno è O.", "Qual è il simbolo dell'idrogeno?"]],
    ['H6 frase corta con a.C. + «Chi»', 'Roma nasce nel 753 a.C. Chi è il primo re di Roma?',
        ['Roma nasce nel 753 a.C.', 'Chi è il primo re di Roma?']],
    ['H7 frase corta con a.C. + «Chi»', 'Cesare muore nel 44 a.C. Chi prende il suo posto?',
        ['Cesare muore nel 44 a.C.', 'Chi prende il suo posto?']],
    ['H8 frase corta con d.C. + «Quale»', "L'impero cade nel 476 d.C. Quale popolo invade l'Italia?",
        ["L'impero cade nel 476 d.C.", "Quale popolo invade l'Italia?"]],
    ['H9 «Carlo V.» + «Chi»', 'Nel 1519 diventa imperatore Carlo V. Chi era suo nonno?',
        ['Nel 1519 diventa imperatore Carlo V.', 'Chi era suo nonno?']],
    ['H10 «punto esterno P.» + «Quante»', 'Traccia le tangenti alla circonferenza dal punto esterno P. Quante tangenti puoi tracciare?',
        ['Traccia le tangenti alla circonferenza dal punto esterno P.', 'Quante tangenti puoi tracciare?']],
    ['H11 «gruppo sanguigno A.» + «Chi»', 'Luca ha il gruppo sanguigno A. Chi può donargli il sangue?',
        ['Luca ha il gruppo sanguigno A.', 'Chi può donargli il sangue?']],
    ['H12 «O.N.U.» + «Quale»', "Nel 1945 nasce l'O.N.U. Quale scopo ha questa organizzazione?",
        ["Nel 1945 nasce l'O.N.U.", 'Quale scopo ha questa organizzazione?']],
    ['H13 «s.l.m.» + «Quale»', 'Il Cervino è alto 4478 m s.l.m. Quale vetta svizzera è più alta?',
        ['Il Cervino è alto 4478 m s.l.m.', 'Quale vetta svizzera è più alta?']],
    ['«è C.» + «Cos\'è» (forma elisa)', "Il simbolo del carbonio è C. Cos'è un isotopo?",
        ['Il simbolo del carbonio è C.', "Cos'è un isotopo?"]],
    // I. consegne che mancavano agli elenchi
    ['I1 «Costruisci»', 'Il quadrilatero ha i vertici A, B, C e D. Costruisci le diagonali AC e BD.',
        ['Il quadrilatero ha i vertici A, B, C e D.', 'Costruisci le diagonali AC e BD.']],
    ['I2 «Chiudi»', "La lampadina è collegata tra i morsetti A e B. Chiudi l'interruttore e osserva la lampadina.",
        ['La lampadina è collegata tra i morsetti A e B.', "Chiudi l'interruttore e osserva la lampadina."]],
    ['I3 «centro O.» + «Sapendo»', "Il cerchio ha centro O. Sapendo che il raggio misura 3 cm, calcola l'area.",
        ['Il cerchio ha centro O.', "Sapendo che il raggio misura 3 cm, calcola l'area."]],
    ['I4 «Considera»', 'Il triangolo ABC è rettangolo in C. Considera il cateto AC lungo 6 cm.',
        ['Il triangolo ABC è rettangolo in C.', 'Considera il cateto AC lungo 6 cm.']],
    ['I5 «Rappresenta»', "L'interruttore si trova in posizione A. Rappresenta il circuito con i simboli.",
        ["L'interruttore si trova in posizione A.", 'Rappresenta il circuito con i simboli.']],
    ['I7 «Unisci»', 'Sono dati i punti A e B. Unisci A con B con un segmento.',
        ['Sono dati i punti A e B.', 'Unisci A con B con un segmento.']],
    // J. a.C. e d.C. in coda di una frase corta
    ['J1 «nel 753 a.C.» in coda', 'Roma nasce nel 753 a.C. Romolo è il primo re.',
        ['Roma nasce nel 753 a.C.', 'Romolo è il primo re.']],
    ['J2 «nel 44 a.C.» in coda', 'Cesare muore nel 44 a.C. Ottaviano prende il potere.',
        ['Cesare muore nel 44 a.C.', 'Ottaviano prende il potere.']],
    ['J3 «nel 14 d.C.» in coda', 'Augusto muore nel 14 d.C. Tiberio diventa imperatore.',
        ['Augusto muore nel 14 d.C.', 'Tiberio diventa imperatore.']],
    ['«Traiano» non è la preposizione «Tra»', 'Traiano muore nel 117 d.C. Adriano diventa imperatore.',
        ['Traiano muore nel 117 d.C.', 'Adriano diventa imperatore.']],
    ['«Francesco» non è la preposizione «Fra»', 'Francesco muore nel 1226 d.C. Bonaventura scrive la sua vita.',
        ['Francesco muore nel 1226 d.C.', 'Bonaventura scrive la sua vita.']],
    // K, P, S. ordinali, simboli e sigle in coda
    ['K1 «Carlo V.» + «Suo»', "Nel 1519 fu eletto imperatore Carlo V. Suo nonno era Massimiliano d'Asburgo.",
        ['Nel 1519 fu eletto imperatore Carlo V.', "Suo nonno era Massimiliano d'Asburgo."]],
    ['K3 «Napoleone I.» + «Pochi»', 'Nel 1804 si incoronò imperatore Napoleone I. Pochi anni dopo invase la Russia.',
        ['Nel 1804 si incoronò imperatore Napoleone I.', 'Pochi anni dopo invase la Russia.']],
    ['P2 «è M.» + «Tale»', 'La massa del corpo è M. Tale massa resta costante.',
        ['La massa del corpo è M.', 'Tale massa resta costante.']],
    ['S1 «s.l.m.» + nome di luogo', 'Lugano si trova a 273 m s.l.m. Locarno è ancora più in basso.',
        ['Lugano si trova a 273 m s.l.m.', 'Locarno è ancora più in basso.']],
];

const RESTANO_INTERE_GIRO2 = [
    ['J4 data in testa', 'Nel 44 a.C. Cesare viene ucciso.', ['Nel 44 a.C. Cesare viene ucciso.']],
    ['J5 data in testa di 5 parole', 'Il 15 marzo del 44 a.C. Cesare viene ucciso in Senato.',
        ['Il 15 marzo del 44 a.C. Cesare viene ucciso in Senato.']],
    ['J6 «Verso il 3000 a.C.»', 'Verso il 3000 a.C. Sumeri ed Egizi inventano la scrittura.',
        ['Verso il 3000 a.C. Sumeri ed Egizi inventano la scrittura.']],
    ['J8 cronologia che comincia con l\'anno', '753 a.C. Fondazione di Roma. 509 a.C. Nasce la Repubblica.',
        ['753 a.C. Fondazione di Roma.', '509 a.C. Nasce la Repubblica.']],
    ['«Nella primavera del 44 a.C.»', 'Nella primavera del 44 a.C. Cesare fu ucciso.', ['Nella primavera del 44 a.C. Cesare fu ucciso.']],
    ['«Nell\'anno 44 a.C.»', "Nell'anno 44 a.C. Cesare fu ucciso.", ["Nell'anno 44 a.C. Cesare fu ucciso."]],
    ['«Dopo il 476 d.C.»', "Dopo il 476 d.C. Odoacre governò l'Italia.", ["Dopo il 476 d.C. Odoacre governò l'Italia."]],
    ['O4 «S.p.A.» + minuscola', "La ditta Rossi S.p.A. produceva munizioni per l'esercito.",
        ["La ditta Rossi S.p.A. produceva munizioni per l'esercito."]],
];

// PX1–PX8: con la V2 del giro 1 la frase di contenuto finiva incollata a una
// domanda e l'àncora la scartava; qui ciascuna deve restare citabile da sola.
const CITABILI_GIRO2 = [
    ['PX1', "Il triangolo rettangolo ABC possiede l'angolo retto situato esattamente nel vertice opposto A. Quanto misura l'ipotenusa se i cateti valgono 6 cm e 8 cm?",
        ["Il triangolo rettangolo ABC possiede l'angolo retto situato esattamente nel vertice opposto A."]],
    ['PX2', 'La città di Roma venne fondata secondo la tradizione leggendaria nel 753 a.C. Chi è il primo re di Roma secondo la leggenda?',
        ['La città di Roma venne fondata secondo la tradizione leggendaria nel 753 a.C.']],
    ['PX2b', 'Roma nasce nel 753 a.C. Romolo diventa il primo sovrano della città secondo la leggenda tramandata dagli storici.',
        ['Romolo diventa il primo sovrano della città secondo la leggenda tramandata dagli storici.']],
    ['PX3', "Nel circuito della figura la lampadina è collegata al morsetto B. Che cosa succede alla lampadina se apri l'interruttore?",
        ['Nel circuito della figura la lampadina è collegata al morsetto B.']],
    ['PX4', "La vetta del Cervino, montagna simbolo della Svizzera, raggiunge un'altezza di 4478 m s.l.m. Quale vetta svizzera supera i 4600 metri?",
        ["La vetta del Cervino, montagna simbolo della Svizzera, raggiunge un'altezza di 4478 m s.l.m."]],
    ['PX5', 'Luca possiede nel proprio sangue antigeni tipici del gruppo sanguigno A. Chi può donargli il sangue senza rischi?',
        ['Luca possiede nel proprio sangue antigeni tipici del gruppo sanguigno A.']],
    ['PX6', "Dopo la guerra mondiale, nel 1945, venne fondata a San Francisco l'O.N.U. Quale scopo principale ha questa organizzazione?",
        ["Dopo la guerra mondiale, nel 1945, venne fondata a San Francisco l'O.N.U."]],
    ['PX7', 'La differenza di potenziale misurata ai capi della pila elettrica viene indicata con U. Quanti volt misura il voltmetro collegato in parallelo?',
        ['La differenza di potenziale misurata ai capi della pila elettrica viene indicata con U.']],
    ['PX8', 'Nel circuito elettrico della scheda la corrente elettrica attraversa prima la lampadina L. Quale strumento misura la corrente?',
        ['Nel circuito elettrico della scheda la corrente elettrica attraversa prima la lampadina L.']],
];

const TUTTI = CASI_ABBREVIAZIONI.concat(CASI_GIA_GIUSTI, TRAPPOLE, FINE_VERA, RESTANO_INTERE,
    FINE_VERA_GIRO2, RESTANO_INTERE_GIRO2, CITABILI_GIRO2);

test('i 20 casi della diagnosi: 16 abbreviazioni + 4 casi che la V1 faceva già giusti', () => {
    assert.strictEqual(CASI_ABBREVIAZIONI.length + CASI_GIA_GIUSTI.length, 20);
    for (const [nome, testo, attese] of CASI_ABBREVIAZIONI.concat(CASI_GIA_GIUSTI)) {
        assert.deepStrictEqual(V2(testo), attese, nome);
    }
});

test('la diagnosi era vera: sui 16 casi di abbreviazione la V1 sbaglia, sui 4 no', () => {
    const sbagliV1 = CASI_ABBREVIAZIONI.filter(([, testo, attese]) => JSON.stringify(V1(testo)) !== JSON.stringify(attese));
    assert.strictEqual(sbagliV1.length, 16, 'se la V1 azzecca un caso di abbreviazione, quel caso non prova niente');
    for (const [nome, testo, attese] of CASI_GIA_GIUSTI) assert.deepStrictEqual(V1(testo), attese, 'V1 · ' + nome);
});

test('le 3 trappole vere spezzano', () => {
    for (const [nome, testo, attese] of TRAPPOLE) assert.deepStrictEqual(V2(testo), attese, nome);
});

test('la V2 toglie confini alla V1 e non ne aggiunge mai: rimessa insieme, è lo stesso testo', () => {
    for (const [nome, testo] of TUTTI) {
        const a = V1(testo), b = V2(testo);
        assert.strictEqual(b.join(' '), a.join(' '), nome);
        assert.ok(b.length <= a.length, nome);
        // ogni frase della V2 è una concatenazione di frasi consecutive della V1
        let i = 0;
        for (const frase of b) {
            let acc = a[i++];
            while (acc !== frase && i < a.length) acc += ' ' + a[i++];
            assert.strictEqual(acc, frase, nome + ' · «' + frase + '»');
        }
        assert.strictEqual(i, a.length, nome);
    }
});

test('un testo senza abbreviazioni dà lo stesso risultato della V1', () => {
    const testi = [
        // prosa di una scheda, con a-capo, virgolette, parentesi, due punti e punto e virgola
        'La Svizzera durante la Seconda guerra mondiale\n' +
        'Nel settembre 1939 la Germania invase la Polonia. La Svizzera mobilitò l\'esercito: ' +
        '430 000 uomini furono chiamati alle armi; le frontiere vennero sorvegliate.\n\n' +
        'Il Consiglio federale proclamò la neutralità. «La Svizzera non entrerà in guerra», ' +
        'disse il governo (ma molti temevano un\'invasione). Nel 1940 la Francia cadde!\n' +
        'Che cosa fece allora il governo? Scelse la strada del ridotto nazionale.',
        // i vuoti da riempire e i puntini di sospensione spezzano come nella V1
        'La capitale è ..... e la città più grande è ..... secondo la tabella. E poi... niente.',
        'Un circuito è chiuso quando la corrente passa. Un fusibile protegge il circuito.   Fine.',
        '', '   ', '.', 'Senza punto finale',
    ];
    for (const t of testi) assert.deepStrictEqual(V2(t), V1(t), JSON.stringify(t.slice(0, 40)));
    assert.deepStrictEqual(V2(null), []);
    assert.deepStrictEqual(V2(undefined), []);
});

test('la frase che finisce in un vuoto resta separata: l\'àncora la scarta apposta (TRONCA_NEL_VUOTO)', () => {
    const t = 'Dopo il 1940 la Svizzera evitò conflitti con (..................... e i suoi alleati commerciarono.';
    assert.deepStrictEqual(V2(t), V1(t));
    assert.match(V2(t)[0], /\.{4,}$/);
});

test('decimali e migliaia non sono mai stati un confine, nemmeno in fondo alla frase', () => {
    assert.deepStrictEqual(V2('Il valore è 3.5. Il costo è 1.200.'), ['Il valore è 3.5.', 'Il costo è 1.200.']);
    assert.deepStrictEqual(V2('Il valore è 3.5. Il costo è 1.200.'), V1('Il valore è 3.5. Il costo è 1.200.'));
});

test('la V1 resta esportata, identica a quella di prima del packet 0030', () => {
    assert.strictEqual(typeof V1, 'function');
    assert.deepStrictEqual(V1('Fig. 1 Il circuito. Il filo: rame; fine? Sì!'), ['Fig.', '1 Il circuito.', 'Il filo:', 'rame;', 'fine?', 'Sì!']);
    // l'a-capo vale uno spazio: il `replace` viene prima dello split (difetto dichiarato, conservato)
    assert.deepStrictEqual(V1('Titolo senza punto\nLa frase che segue.'), ['Titolo senza punto La frase che segue.']);
    assert.deepStrictEqual(V2('Titolo senza punto\nLa frase che segue.'), V1('Titolo senza punto\nLa frase che segue.'));
});

test('giro 1 · sigla, iniziale, «Ca»/«VS», «p. I» in coda di frase: la V2 spezza come la V1', () => {
    for (const [nome, testo, attese] of FINE_VERA) {
        assert.deepStrictEqual(V1(testo), attese, 'V1 · ' + nome + ' (se la V1 sbaglia, il caso non prova niente)');
        assert.deepStrictEqual(V2(testo), attese, nome);
    }
});

test('giro 1 · le abbreviazioni vere restano intere', () => {
    for (const [nome, testo, attese] of RESTANO_INTERE) assert.deepStrictEqual(V2(testo), attese, nome);
});

test('giro 1 · nell\'àncora la frase buona non si perde incollata a una domanda, e la consegna non diventa prova', () => {
    const AC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-anchor-core.js'));
    const citabili = t => AC.frasiDaPagine([{ n: 1, text: t }]).map(f => f.text);
    // P1, P3: con la prima stesura la fusione finiva con «?» e l'àncora scartava tutto
    assert.deepStrictEqual(citabili('Roma fu fondata dai gemelli Romolo e Remo nel 753 a.C. Chi era il primo re secondo la leggenda?'),
        ['Roma fu fondata dai gemelli Romolo e Remo nel 753 a.C.']);
    assert.deepStrictEqual(citabili("Nel triangolo ABC l'angolo retto si trova nel vertice C. Quanto misura l'ipotenusa se i cateti valgono 3 e 4?"),
        ["Nel triangolo ABC l'angolo retto si trova nel vertice C."]);
    // P4: la fusione apriva con «Leggi» e l'àncora la scartava come consegna
    assert.deepStrictEqual(citabili('Leggi con attenzione il documento A. Guisan riunì tutti gli ufficiali superiori sul Rütli il 25 luglio 1940.'),
        ['Guisan riunì tutti gli ufficiali superiori sul Rütli il 25 luglio 1940.']);
    // P5: la frase citabile resta sola, non incollata alla precedente
    assert.deepStrictEqual(citabili('Il semiconduttore della figura è drogato di tipo n. I portatori di carica maggioritari sono gli elettroni liberi.'),
        ['I portatori di carica maggioritari sono gli elettroni liberi.']);
    // P6: la consegna «Scrivi…» non entra fra le citazioni attaccata a un fatto
    assert.deepStrictEqual(citabili('Il carbonio ha come simbolo chimico la lettera C. Scrivi la formula del diossido di carbonio.'), []);
});

test('giro 2 · domande, consegne, «Suo/Tale/Pochi», s.l.m. e a.C. in coda di frase corta: la V2 spezza come la V1', () => {
    for (const [nome, testo, attese] of FINE_VERA_GIRO2) {
        assert.deepStrictEqual(V1(testo), attese, 'V1 · ' + nome + ' (se la V1 sbaglia, il caso non prova niente)');
        assert.deepStrictEqual(V2(testo), attese, nome);
    }
});

test('giro 2 · la data in testa resta intera, e anche «S.p.A.» davanti a una minuscola', () => {
    for (const [nome, testo, attese] of RESTANO_INTERE_GIRO2) assert.deepStrictEqual(V2(testo), attese, nome);
});

test('giro 2 · nell\'àncora la frase di contenuto non si perde incollata a una domanda (PX1–PX8)', () => {
    const AC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-anchor-core.js'));
    const citabili = t => AC.frasiDaPagine([{ n: 1, text: t }]).map(f => f.text);
    for (const [nome, testo, attese] of CITABILI_GIRO2) assert.deepStrictEqual(citabili(testo), attese, nome);
});

test('lo splitter è lineare: un milione di caratteri in meno di un secondo', () => {
    // Riceve anche il corpus INTERO (deepening, enrich-core, ELABORA), sul thread
    // dell'interfaccia. La prima stesura della V2 rileggeva il prefisso a ogni
    // punto (`/\S+$/`): 71 s su un milione di caratteri veri. Ora ~20 ms.
    const pezzo = TUTTI.map(c => c[1]).join(' ') + ' ';
    const testo = pezzo.repeat(Math.ceil(1e6 / pezzo.length)).slice(0, 1e6);
    const t0 = Date.now();
    const frasi = V2(testo);
    const ms = Date.now() - t0;
    assert.ok(frasi.length > 1000, 'frasi: ' + frasi.length);
    assert.ok(ms < 1000, '1 M caratteri in ' + ms + ' ms');
});
