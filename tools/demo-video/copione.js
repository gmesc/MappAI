/* tools/demo-video/copione.js — IL COPIONE del demo di 4 minuti (23/8/26).
 *
 * Questo file è l'unica fonte dei TEMPI e dell'ordine (inv. 6): il montaggio legge di qui le
 * durate, `copione-da-leggere.md` nasce di qui, e il video dura 240 s perché la somma fa 240 —
 * il test lo pretende, non lo spera.
 *
 * Il video è MUTO per costruzione: la voce è di Giacomo e si incolla dopo
 * (`monta.js --voce voce.m4a`). `narrazione` è la BOZZA che lui leggerà, tagliata sul budget
 * di parole della scena (≈2,5 parole al secondo, italiano parlato con calma).
 *
 * Materiale: i due vault VERI della 4R — `Scienze/Elettricità - MM` (mappa, materiali, sintesi
 * con voce già registrata) e `Storia/grind this heels` (il dossier che si proietta).
 */
'use strict';

/* le parole al secondo di un parlato calmo: serve a dire a Giacomo quanto può scrivere */
const PAROLE_AL_SECONDO = 2.5;

/* la 4R è la classe del video: le due materie sono quelle dei vault veri */
const CLASSE = '4R';
const MAPPA = { materia: 'Scienze', vault: 'Elettricità - MM', titolo: 'Elettricità' };
const DOSSIER = { materia: 'Storia', vault: 'grind this heels' };
/* il vault che la scena 3 genera davvero, e che Giacomo cestina quando vuole */
const DEMO = { materia: 'Scienze', titolo: 'Elettricità - demo' };

/* I materiali che si sfogliano (scena 5), nell'ordine in cui compaiono.
   ⚠️ Niente «Vero o Falso»: scelta di Giacomo (23/8). Le flashcard si sfogliano davvero
   (pagina per pagina), gli altri passano a due o tre fermi. */
/* ⚠️ Alcuni PDF del vault NON si rendono con poppler: i .ttf di TestMe usciti da jsPDF si
   dichiarano OTTO (trappola 47) e pdftoppm risponde «Embedded font file may be invalid» —
   le flashcard TestMe escono BIANCHE, solo linee di taglio. Si sfogliano quindi le versioni
   che rendono, misurate una per una il 23/8: le flashcard Space Mono, il quiz TestMe (esce
   da Chromium, font sani), e la mappa «-4ª-03» (la vista libera intera, 1814×1297). */
const SFOGLIO = [
  { file: 'Flashcard-Elettricità.pdf', pagine: [1, 2, 3, 4], secondi: 10, et: 'Flashcard da ritagliare' },
  { file: 'Quiz-MC-Elettricità - TestMe Sans.pdf', pagine: [1, 2], secondi: 6, et: 'Quiz a scelta multipla' },
  { file: 'Foglio-nodi-Elettricità-title.pdf', pagine: [1], secondi: 3, et: 'Foglio dei nodi — solo i titoli' },
  { file: 'Foglio-nodi-Elettricità-card.pdf', pagine: [1], secondi: 3, et: 'Lo stesso foglio, con la spiegazione intera' },
  { file: 'MM-Elettricità - TestMe Sans-4ª-03.pdf', pagine: [1], secondi: 2, et: 'La mappa, da appendere o proiettare' },
  { file: 'Domande-aperte-Elettricità-causa.pdf', pagine: [1, 2], secondi: 6, et: 'Domande aperte' },
];

/* La sequenza delle VISTE (scena 04a): i PDF veri della Vista studio, nell'ordine e col
   movimento chiesti da Giacomo (24/8). `effetto`: fermo | zoomout | pan (orizzontale). */
const STUDIO = [
  { file: 'Studio-Elettricità-td-00.pdf', secondi: 2, effetto: 'fermo' },
  { file: 'Studio-Elettricità-td-01.pdf', secondi: 2, effetto: 'fermo' },
  { file: 'Studio-Elettricità-td-02.pdf', secondi: 2, effetto: 'fermo' },
  { file: 'Studio-Elettricità-td-03.pdf', secondi: 3, effetto: 'fermo' },
  { file: 'Studio-Elettricità-fasci.pdf', secondi: 5, effetto: 'zoomout' },
  { file: 'Studio-Elettricità-dag.pdf', secondi: 5, effetto: 'pan' },
  { file: 'MM-Elettricità - TestMe Sans-4ª-03.pdf', secondi: 6, effetto: 'pan' },
];

/* Le slide comparative: la STESSA area, letta dai sette angoli. I testi non si scrivono qui —
   si estraggono dai PDF veri delle domande aperte (`domande-core.js`), o la slide direbbe cose
   che nel materiale del docente non ci sono. */
const ANGOLI = ['definizione', 'causa', 'conseguenza', 'esempio', 'confronto', 'eccezione', 'applicazione'];

/* ── LE SCENE ────────────────────────────────────────────────────────────────
   `tipo` dice da dove nasce il clip:
     app     → si registra l'app viva (CDP + Page.screencastFrame)
     carta   → un cartello HTML reso in PNG
     sfoglio → i PDF veri del vault, resi con pdftoppm
     slide   → le slide comparative degli angoli
   `gesto` è il nome della funzione in `scene.js`. */
const SCENE = [
  {
    id: '01-gancio', tipo: 'carta', secondi: 16, titolo: 'Una scheda, una classe, venti ritmi',
    carta: {
      occhiello: 'MappAI · formazione di mezza giornata',
      titolo: 'Dalla tua scheda,\nventi modi di studiarla',
      sotto: 'Mappe, quiz, flashcard, fogli da ricostruire, sintesi da ascoltare.\nDallo stesso PDF che useresti comunque.',
    },
    narrazione: 'Una scheda di quattro pagine, e davanti una quarta media: chi la legge in dieci minuti, chi si ferma alla seconda pagina. MappAI parte da quella scheda e ne ricava materiali che dicono le stesse cose per strade diverse.',
  },
  {
    id: '02-classe', tipo: 'app', gesto: 'scenaClasse', secondi: 28, titolo: 'La classe',
    narrazione: 'Tutto comincia dalla classe. Grado e sezione fanno il nome; la taratura dice all\'AI con che lingua parlare a quegli allievi: registro semplice, e le note che scrivi tu. La 4R ha Scienze e Storia, e da qui in poi ogni materiale che genero finisce nella sua cartella.',
  },
  {
    id: '03-progetto', tipo: 'app', gesto: 'scenaProgetto', secondi: 45, titolo: 'Il progetto',
    narrazione: 'Carico il PDF della scheda. Scelgo la mappa mentale, do il tema, dico per chi è: la 4R, Scienze. Poi il bottone verde. Da qui l\'app lavora da sola: legge la scheda, individua le macro-aree, apre un ramo alla volta. Un paio di minuti — qui accelerati — e la mappa è sullo schermo, con la sua cartella già scritta sul disco.',
  },
  {
    /* due clip: le VISTE della mappa dai PDF veri della Vista studio (scelta di Giacomo,
       24/8: niente registrazione d'app qui — la sequenza td-00→03 è l'albero che si
       approfondisce, poi fasci, DAG e mappa libera coi pan), e la proiezione del dossier. */
    id: '04-mappa', tipo: 'app', secondi: 36, titolo: 'La mappa in classe',
    parti: [
      { id: '04a-viste', tipo: 'studio', secondi: 25 },
      { id: '04b-proietta', tipo: 'app', gesto: 'scenaProietta', secondi: 11 },
    ],
    narrazione: 'In classe la mappa si mostra così: prima il solo tema, poi i rami, poi l\'albero intero — lo stesso foglio, a profondità crescenti, per scoprire un livello alla volta. La vista a fasci la raccoglie attorno al centro, il DAG fa vedere anche i ponti fra rami diversi, e la mappa libera dà un colore a ogni ramo. E una fonte iconografica si proietta a tutto schermo, con la scheda di analisi accanto.',
  },
  {
    id: '05-materiali', tipo: 'sfoglio', secondi: 30, titolo: 'I materiali cartacei',
    narrazione: 'Dalla stessa mappa escono i materiali da stampare: flashcard già impaginate da ritagliare, quiz a scelta multipla, i fogli dei nodi — solo i titoli per ricostruire a memoria, oppure con la spiegazione intera per chi ha bisogno di appoggio — la mappa in A4, e le domande aperte.',
  },
  {
    id: '06-angoli', tipo: 'slide', secondi: 16, titolo: 'Sette angolazioni sullo stesso nodo',
    narrazione: 'E qui sta il cuore: sullo stesso argomento le domande cambiano taglio. Definizione, causa, conseguenza, esempio, confronto, eccezione, applicazione. Sette modi di chiedere la stessa cosa: chi non risponde alla prima entra dalla terza.',
  },
  {
    id: '07-correggere', tipo: 'app', gesto: 'scenaCorreggere', secondi: 22, titolo: 'Correggere',
    narrazione: 'Niente esce dall\'app senza il tuo occhio. In ELABORA ogni documento si apre, si riscrive, si riordina: correggo una domanda, segno la risposta giusta, e creo il PDF. L\'autorità sui contenuti resta tua.',
  },
  {
    id: '08-sintesi', tipo: 'app', gesto: 'scenaSintesi', secondi: 30, titolo: 'La sintesi che si ascolta',
    narrazione: 'Per chi legge a fatica c\'è la sintesi: frasi brevi, un carattere ad alta leggibilità, e la voce naturale che legge mentre il testo si evidenzia. È un file solo, che l\'allievo apre sul telefono e ascolta a casa, anche senza rete.',
  },
  {
    id: '09-invito', tipo: 'carta', secondi: 17, titolo: 'La formazione',
    carta: { daFormazione: true },
    narrazione: 'In mezza giornata lo vediamo insieme: dalla tua scheda alla classe, con i tuoi materiali, sul tuo computer. Porta una scheda che usi davvero — usciamo con i materiali pronti.',
  },
];

module.exports = { SCENE, SFOGLIO, STUDIO, ANGOLI, PAROLE_AL_SECONDO, CLASSE, MAPPA, DOSSIER, DEMO };
