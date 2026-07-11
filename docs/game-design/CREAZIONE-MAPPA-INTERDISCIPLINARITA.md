# Creare la propria mappa come atto di studio — analisi critica

> Documento di analisi pedagogica per MappAI / Memory Dungeon.
> Autore: Giacomo Meschini — giacomo@insegnai.ch
> Stato: analisi critica, design-first. Nessuna implementazione discussa qui — si valuta
> se e a quali condizioni l'**autoria** dell'ambiente (mappa, asset voxel, asset 2D) rinforzi
> l'apprendimento dei contenuti della mappa, e se possa costituire un'attività interdisciplinare.
> Ultimo aggiornamento: 7 luglio 2026.

---

## 0. La tesi, in una riga

Costruire la propria mappa può essere lo studio più profondo che MappAI offra, oppure
la sua distrazione più elegante: la differenza non sta nell'editor, sta in **un vincolo**.
Finché ogni decisione costruttiva costringe lo studente a interrogare la fonte, il fare è
studio; nel momento in cui la costruzione può procedere senza tornare al contenuto, il fare
diventa un gioco parallelo che consuma il budget cognitivo senza restituire conoscenza.
Tutto il resto di questo documento argomenta e mette alla prova questa frase.

---

## 1. Che cosa permette oggi l'editor (inventario dell'atto creativo)

Prima di teorizzare conviene guardare cosa lo studente può materialmente fare. Lo Studio
Memory Dungeon (`tools/voxel-proto`) e la filiera del contratto vault mettono in mano allo
studente — o al docente, o a entrambi in cooperazione — una catena di atti autoriali:

| Atto creativo | Strumento | Materia implicata (oltre al contenuto) |
|---|---|---|
| Disegnare la **pianta** della mappa (blockout 2D → 3D) | `pianta.html` | ragionamento spaziale, topologia, simmetria |
| Modellare il **rilievo** del terreno (colline, valli, dislivelli §21) | pennello ⛰ Rilievo | geometria delle quote, gradiente, pendenza |
| Comporre **materiali e texture** (ricette a 6 facce, tag deterministici) | scheda MATERIALI | teoria del colore, superficie, luce |
| Disegnare **asset 2D** (sprite, item, personaggi) col pixel editor | scheda Pixel | disegno, doppia codifica, fedeltà iconica |
| Costruire **volumi voxel** (sculture 3D, cubo per cubo, import `.vox`) | costruttore voxel | scultura, proporzione, struttura |
| Collocare **memorie e personaggi** negli slot | editor + auto-slot | metodo dei loci, gerarchia dei contenuti |
| Definire **zone-mondo** e **gate** con requisito (§20) | contratto `mondo.json` | classificazione, confini semantici |
| Impacchettare e **condividere** con la classe | bundle `mappai-dungeon-bundle@1` | comunicazione, artefatto pubblico |

Due esempi concreti, quelli che hai citato, sono i casi limite che fanno da banco di prova
all'intera analisi:

- **la scultura voxel ispirata a un contenuto** — lo studente costruisce, cubo per cubo, un
  cloroplasto, un castello medievale, la struttura di una cellula, e la pianta come landmark
  in una stanza;
- **l'asset 2D fedele alla fonte** — lo studente non usa l'icona generica «libro», ma disegna
  l'item in modo che *dica* ciò che la fonte afferma: la foglia con le nervature giuste, lo
  strumento storico nella forma corretta, il grafico con l'andamento reale.

Sono due gesti diversi — uno tridimensionale e strutturale, l'altro grafico e iconico — ma
condividono la stessa domanda pedagogica: **rappresentare fedelmente qualcosa costringe a
conoscerlo?** La risposta della ricerca è: sì, a condizioni precise.

---

## 2. Perché costruire rinforza — le leve cognitive

### 2.1 Costruzionismo: la teoria portante

Il riferimento inevitabile è Seymour Papert. Il **costruzionismo** (*Mindstorms*, 1980;
Papert & Harel, *Constructionism*, 1991) sostiene che si apprende meglio quando si costruisce
un **artefatto pubblico e condivisibile** — un oggetto che esce dalla testa e sta nel mondo,
dove può essere guardato, criticato, mostrato. La conoscenza non viene versata nello studente:
viene *costruita* mentre lui costruisce qualcosa. Modellare un cloroplasto in voxel è un caso
da manuale: per posare i cubi lo studente deve decidere quante membrane, dove i tilacoidi, che
forma i grana — e ogni decisione è una domanda alla fonte a cui non può sottrarsi.

La versione più vicina a MappAI è il **constructionist gaming** di Yasmin Kafai: costruire un
gioco (o un suo pezzo) insegna più che giocarlo (Kafai, *Minds in Play*, 1995; Kafai & Burke,
*Connected Gaming*, MIT Press, 2016). È esattamente il rovesciamento che il Memory Dungeon già
fa quando lascia lo studente diventare autore del livello invece che semplice esploratore.

### 2.2 L'effetto generazione

Produrre un'informazione invece di riceverla passivamente ne migliora la ritenzione: è
l'**effetto generazione** (Slamecka & Graf, 1978), uno dei risultati più robusti della
psicologia della memoria. Disegnare l'item «fotosintesi» fedele alla fonte è generazione allo
stato puro — lo studente deve *produrre* la forma, non riconoscerla in un menù. Il gesto lascia
una traccia mnestica più profonda della lettura della stessa `desc`.

### 2.3 Doppia codifica: il caso degli asset 2D fedeli

Qui entra in gioco la **teoria della doppia codifica** (Paivio, 1971, 1986): un contenuto
codificato *insieme* in forma verbale e visiva dispone di due vie di recupero indipendenti, e
si ricorda meglio. L'asset 2D fedele è il ponte materiale tra le due codifiche: la `desc` (verbale)
e lo sprite disegnato (visivo) descrivono lo stesso concetto e si ancorano a vicenda. Ma —
attenzione, è già la prima crepa — questo vale **solo se lo sprite è informativo**. Un'icona
decorativa non aggiunge una seconda codifica del contenuto: aggiunge rumore. Ne parla il §3.

### 2.4 Il metodo dei loci, potenziato dalla costruzione

Il design del dungeon poggia già sul **metodo dei loci** (l'arte della memoria classica; Yates,
*The Art of Memory*, 1966): §20 descrive le zone-mondo come «metodo dei loci reso giocabile»,
dove la geografia porta significato e la memoria spaziale scaffolda quella semantica. Ma esiste
una differenza pedagogica netta tra **abitare** un palazzo della memoria costruito da altri e
**costruirselo**. La mnemotecnica classica è sempre stata efficace proprio perché i *loci* sono
personali: funzionano se li hai disposti tu. Lasciare che lo studente autori le stanze, decida
dove sta la Fotosintesi e perché confina con la Respirazione, trasforma un espediente di
rendering in un vero atto mnemonico. Costruire la mappa *è* costruire il palazzo.

### 2.5 Difficoltà desiderabile

La fatica del costruire non è un difetto: è, potenzialmente, una **difficoltà desiderabile**
(Bjork, 1994) — uno sforzo che rallenta l'esecuzione ma migliora l'apprendimento a lungo termine.
Il condizionale è d'obbligo, e ci porta dritti alla parte critica: una difficoltà è desiderabile
solo se è **pertinente** al contenuto. Faticare a orientare la telecamera voxel non insegna la
fotosintesi; faticare a decidere *come si vede* un tilacoide sì.

---

## 3. La critica — dove il costruire non insegna

Un documento onesto deve dire con nettezza dove la promessa si rompe. Le leve del §2 hanno tutte
la stessa clausola nascosta — «purché il fare resti agganciato al contenuto» — e questa clausola
è tutt'altro che automatica.

### 3.1 La trappola decorativa (il rischio principale)

Il pericolo più grande ha un nome nella ricerca: **seductive details** (Garner, Gillingham &
White, 1989; ripreso in Mayer, *Multimedia Learning*, 2009). Dettagli interessanti ma
irrilevanti *peggiorano* l'apprendimento perché catturano l'attenzione e i canali della memoria
di lavoro, sottraendoli al materiale che conta. Una scultura voxel bellissima ma non-informativa
— il castello con le torri sbagliate ma con la texture perfetta, l'item «drago» carino ma
scollegato dal tema — è il seductive detail per eccellenza. Peggio: costa ore.

In termini di **carico cognitivo** (Sweller, 1988; Sweller, Ayres & Kalyuga, 2011), la
costruzione decorativa è **carico estraneo** (extraneous load): impegno mentale speso su qualcosa
che non costruisce lo schema del contenuto. Per uno studente BES/DSA, il cui budget di memoria di
lavoro è già scarso e va protetto (è un principio non negoziabile del progetto, §1 del design), il
carico estraneo non è un lusso costoso: è un danno.

Il **principio di coerenza** di Mayer è la formulazione operativa del rischio: rimuovere il
materiale interessante ma estraneo migliora l'apprendimento. Applicato a MappAI, suona quasi
paradossale — «meno libertà creativa, più studio» — e va maneggiato con cura, perché la libertà
creativa è anche ciò che motiva. Il §4 propone come tenere insieme le due cose.

### 3.2 Costo opportunità e budget cognitivo

Ogni ora sull'editor è un'ora non spesa sul contenuto in altra forma. La domanda critica non è
«costruire insegna?» ma «costruire insegna *più di ciò che avrei fatto in quell'ora*?». Per un
concetto semplice, disegnare tre sprite fedeli può valere più di rileggere il capitolo; per un
concetto che richiede molte relazioni astratte, le stesse tre ore di modellazione voxel possono
essere tempo sottratto al ragionamento. La creazione **non scala uniformemente**: rende su
contenuti che *hanno una forma* (strutture, oggetti, processi visualizzabili), rende molto meno
su contenuti puramente relazionali o astratti.

### 3.3 Il problema della prova (assessment)

Come si fa a sapere che il costruire ha rinforzato l'apprendimento, e non solo divertito? È la
domanda che Giacomo pone giustamente a ogni feature («pretende prova, non affermazioni»). Il
divertimento e l'engagement sono *proxy inaffidabili* dell'apprendimento — la ricerca sui giochi
educativi lo ripete da vent'anni (Plass, Mayer & Homer, *Handbook of Game-Based Learning*, MIT
Press, 2020). Se l'artefatto non lascia una traccia verificabile del ragionamento sul contenuto
— se non c'è modo di leggere *perché* lo studente ha costruito così — allora non abbiamo prova,
abbiamo un bell'oggetto. Il §5 propone la «scheda-artefatto» come soluzione minima.

### 3.4 Chi resta fuori: motricità, disgrafia, discalculia

L'inclusività BES/DSA taglia in due sensi. Costruire asset 2D richiede controllo fine e senso del
disegno che uno studente con **disgrafia** o difficoltà visuo-motorie può non avere; modellare in
voxel richiede orientamento spaziale che la **discalculia spaziale** rende faticoso. Se l'atto
creativo diventa il canale privilegiato di studio, esclude proprio una parte del target. La
risposta non è rinunciare, è **graduare l'autoria** (§4.3): dal riuso di preset, al ritocco, al
foglio bianco — così ognuno entra al livello che regge, e nessuno è costretto al foglio bianco
per accedere al contenuto.

---

## 4. Il criterio che separa: il vincolo semantico

Tutta l'analisi converge su un unico criterio operativo che distingue il fare-studio dal
fare-decorativo. Lo chiamo **vincolo semantico**, ed è la regola d'oro:

> **Ogni decisione costruttiva rilevante deve poter essere presa solo interrogando la fonte.**

Se lo studente può completare l'artefatto senza mai tornare al contenuto, la costruzione è
decorativa (carico estraneo). Se per completarlo deve rileggere, confrontare, decidere «la fonte
dice così, quindi disegno così», la costruzione è **germane**: carico pertinente, quello che
costruisce lo schema (Sweller). L'editor non produce da solo questa condizione; la produce il
*compito* che gli si mette attorno.

### 4.1 I due esempi, riletti col criterio

- **Scultura voxel del cloroplasto.** Germane se il compito chiede fedeltà strutturale verificabile
  («devono vedersi i tilacoidi impilati nei grana, e la membrana esterna»): per costruirla lo
  studente torna alla fonte a contare, distinguere, collocare. Decorativa se il compito è «costruisci
  qualcosa che ti ricordi la fotosintesi»: qualsiasi blob verde soddisfa la consegna.

- **Item 2D fedele.** Germane se la fedeltà è il punto e viene guardata («disegna la foglia in modo
  che si capisca dove avviene lo scambio gassoso»): lo sprite diventa una seconda codifica reale del
  contenuto (§2.3). Decorativo se serve solo a «fare più carino» l'item già etichettato dalla `desc`.

### 4.2 Come si costruisce il vincolo, in pratica

Il vincolo semantico non si impone con un divieto ma con il **design del compito**. Tre leve:

1. **Ancoraggio alla fonte**: l'artefatto è legato a un nodo e alla sua `sourcesDict`; costruirlo
   richiede di aprire quella citazione. (MappAI ha già il canale: `appState.db.sourcesDict[nodeId]`.)
2. **Criterio di fedeltà esplicito e verificabile**: la consegna nomina *cosa* deve risultare
   corretto — non «bello», ma «con queste tre caratteristiche giuste».
3. **Lettura pubblica dell'artefatto**: un compagno, il docente o l'OPI deve poter dire *guardando
   l'oggetto* se lo studente ha capito. Se l'oggetto non è leggibile in questo senso, il vincolo
   manca.

### 4.3 Il gradiente autoriale (per non escludere nessuno)

Contro il rischio §3.4, l'autoria va offerta come **rampa**, non come salto:

| Livello | Cosa fa lo studente | Carico creativo | Vincolo semantico possibile |
|---|---|---|---|
| 0 — Colloca | Piazza asset pronti negli slot giusti | minimo | «dove va, e perché lì» (metodo dei loci) |
| 1 — Ritocca | Cambia colore/variante/scala di un preset per aderire alla fonte | basso | «quale variante è fedele» |
| 2 — Compone | Assembla asset esistenti in una scena/scultura significativa | medio | «quali pezzi, in quale struttura» |
| 3 — Crea | Disegna/modella da zero un asset fedele | alto | «rappresenta esattamente ciò che la fonte dice» |

Il livello 0 è già pieno studio (è il metodo dei loci); il livello 3 è la costruzione più profonda
ma anche la più costosa e la meno accessibile. Nessuno studente dovrebbe essere costretto al
livello 3 per accedere al contenuto: il valore didattico si può cogliere a ogni gradino, e il
docente/OPI sceglie l'altezza in base allo studente.

---

## 5. È interdisciplinarità? Il framework alla prova

Arriviamo alla domanda esplicita. La creazione della mappa **può** diventare un'attività
interdisciplinare — ma «interdisciplinare» è una parola che la ricerca usa con più rigore di
quanto il senso comune suggerisca, e la risposta onesta è **sì, a condizioni**, non «sì» e basta.

### 5.1 Lo spettro: multi- / inter- / trans-disciplinare

La letteratura (Julie Thompson Klein, *Interdisciplinarity*, 1990; Nicolescu sulla
transdisciplinarità) distingue tre gradi che è facile confondere:

- **Multidisciplinare** = giustapposizione. Si fa arte *e* si fa scienze, affiancate, senza che si
  tocchino. Disegnare uno sprite carino accanto a un contenuto di scienze è, di default, solo questo.
- **Interdisciplinare** = **integrazione**. I metodi e i concetti di due discipline si combinano per
  produrre una comprensione che nessuna delle due, da sola, darebbe.
- **Transdisciplinare** = il problema reale detta le discipline, i confini si dissolvono attorno a
  un compito autentico.

Il punto critico: costruire asset **non è automaticamente interdisciplinare**. Lo è solo se scatta
l'integrazione. Senza vincolo semantico (§4), la creazione della mappa è al massimo
*multidisciplinare* — arte affiancata a scienze — cioè quella che Boix Mansilla chiama
**pseudo-interdisciplinarità**: l'apparenza dell'integrazione senza la sostanza.

### 5.2 Il metro di Boix Mansilla

Veronica Boix Mansilla (Project Zero, Harvard GSE) offre il criterio più operativo per la
**comprensione interdisciplinare**: c'è integrazione autentica quando lo studente

1. **fonda** il lavoro su conoscenze disciplinari solide (non abbraccia le discipline in modo vago),
2. **le integra** per fare un avanzamento cognitivo — spiegare, risolvere, creare qualcosa di nuovo — e
3. sa **rendere conto** di come l'integrazione produce la comprensione (riflessione critica sul metodo).

Applichiamolo alla scultura voxel del cloroplasto fatta *col vincolo semantico*:

- (1) **fondazione disciplinare**: la biologia della fotosintesi (la fonte) *e* la grammatica visiva
  del voxel (proporzione, struttura, come un volume comunica una forma) — due basi disciplinari reali;
- (2) **integrazione**: per rendere leggibile in 3D la funzione dei tilacoidi, lo studente deve capire
  *insieme* la biologia (cosa fa quella struttura) e la rappresentazione (come farla vedere). L'atto di
  design lo costringe a una domanda che né la sola biologia né il solo disegno pongono: «quale forma
  rende visibile questa funzione?». Questo è l'avanzamento cognitivo;
- (3) **rendere conto**: se lo studente sa spiegare *perché* ha costruito così («ho impilato i
  tilacoidi perché la fonte dice che i grana sono pile di membrane, e la pila si vede meglio in verticale»),
  c'è la riflessione metacognitiva che chiude il cerchio.

Quando tutti e tre gli anelli tengono, la creazione della mappa **è** interdisciplinare nel senso
forte. Quando manca il primo (nessuna fondazione sul contenuto) o il secondo (nessuna integrazione, solo
decorazione), non lo è — per quanto colorata sia.

### 5.3 L'aggancio al curricolo svizzero

Nel contesto di Giacomo (scuola svizzera, insegnai.ch) la cornice istituzionale c'è già. Il **Piano di
studio 21** ticinese — come il *Lehrplan 21* svizzero-tedesco — prevede **competenze trasversali**
(pensiero creativo, strategie di apprendimento, collaborazione) e **Contesti di Formazione Generale**
pensati proprio per il lavoro che attraversa le discipline. Un compito «costruisci e giustifica un asset
fedele alla fonte» mobilita in un colpo solo la disciplina di contenuto, l'educazione visiva/tecnica e le
competenze trasversali di pensiero creativo e strategia di studio. È materiale spendibile davanti a un
docente o a un OPI, non solo teoria.

### 5.4 Verdetto critico

Sì, la creazione della mappa può essere interdisciplinare — ma è una **possibilità da progettare, non
una proprietà dell'editor**. L'editor voxel è una condizione necessaria e non sufficiente. Il fattore
decisivo è lo stesso vincolo semantico del §4: senza, si ottiene giustapposizione decorativa
(multidisciplinare debole, pseudo-interdisciplinare); con, si ottiene integrazione (interdisciplinare
forte). L'interdisciplinarità, qui, non è un bonus estetico: è il *nome pedagogico* della condizione che
rende lo studio efficace. È la stessa cosa detta da un'altra angolatura — il che è, di per sé, un buon
segno di solidità della tesi.

---

## 6. Implicazioni di design per MappAI

Se si accetta l'analisi, ne discendono scelte concrete e reversibili — nello spirito del progetto.

1. **Scheda-artefatto (aggancio asset ↔ nodo ↔ fonte).** Ogni asset creato dallo studente porta un
   micro-record: a quale nodo si riferisce, quale citazione della fonte lo giustifica, e una riga di
   *perché l'ho fatto così*. È la soluzione al problema della prova (§3.3) e insieme l'anello (3) di Boix
   Mansilla. Costo basso: un campo testuale legato all'istanza dell'asset.

2. **Consegne col criterio di fedeltà.** Quando il docente prepara la mappa-mondo (Studio), può allegare
   a una zona/nodo un criterio di fedeltà esplicito («si devono vedere X, Y, Z») che diventa la consegna
   dell'atto creativo. Trasforma il vincolo semantico da buona intenzione a campo del contratto.

3. **Rubrica di integrazione, non di bellezza.** Se si valuta l'artefatto, lo si valuta sui tre anelli
   (fondazione / integrazione / render-conto), mai sull'estetica. Una rubrica a tre voci, leggibile anche
   dallo studente, che dice a chiare lettere: *non conta se è bello, conta se è vero e se sai perché*.

4. **Gradiente autoriale esposto nell'UI.** Offrire i quattro livelli del §4.3 come modalità dichiarate,
   così il docente/OPI sceglie l'altezza per studente e nessun BES è costretto al foglio bianco.

5. **Costruzione come *momento*, non come sfondo.** La creazione va incorniciata come attività di studio
   attiva (parente delle 7 modalità §17), con inizio, criterio e chiusura riflessiva — non come editing
   libero perenne che deriva verso il gioco.

---

## 7. Rischi residui e cosa non fare

- **Non** vendere la creatività come intrinsecamente formativa: senza vincolo semantico è carico estraneo
  (§3.1). La libertà creativa motiva, ma la motivazione non è apprendimento (§3.3).
- **Non** rendere l'autoria di alto livello (crea da zero) la *porta obbligata* al contenuto: esclude
  disgrafia/discalculia spaziale (§3.4). La porta è il livello 0-1; il 3 è un'opzione premiante.
- **Non** misurare il successo col tempo speso o col divertimento: sono proxy inaffidabili. Misurarlo con
  la leggibilità dell'artefatto (un terzo capisce, guardandolo, se lo studente ha capito).
- **Non** confondere «abbiamo fatto arte e scienze» con interdisciplinarità: è multidisciplinarità finché
  manca l'integrazione (§5.1). Il test è l'avanzamento cognitivo, non la compresenza.
- **Attenzione al costo opportunità** sui contenuti astratti/relazionali (§3.2): lì la mappa classica e le
  modalità di studio testuali rendono di più della modellazione.

---

## 8. Sintesi

Creare la propria mappa, le proprie sculture voxel, i propri asset 2D fedeli è, potenzialmente, la forma
di studio più profonda che MappAI possa offrire: attiva il costruzionismo, l'effetto generazione, la
doppia codifica e il metodo dei loci nella sua versione più autentica, quella in cui i *loci* li disponi
tu. Ma è una potenza condizionata. La condizione ha un nome unico che ricorre in tutte le sezioni — il
**vincolo semantico** — e sotto due vesti diverse dice la stessa cosa: didatticamente è la differenza tra
carico germane e carico estraneo; sul piano dell'interdisciplinarità è la differenza tra integrazione e
giustapposizione decorativa. Che i due criteri coincidano non è un caso: è il segno che l'attività, fatta
bene, è al tempo stesso studio efficace *e* interdisciplinarità autentica. Fatta male, non è né l'uno né
l'altra — solo un bell'oggetto costato molte ore.

Il compito di MappAI non è dare più strumenti creativi (ne ha già molti), ma **costruire attorno a quegli
strumenti il compito che tiene agganciata la creazione al contenuto** — e renderlo leggibile, graduato e
inclusivo. L'editor è pronto. Manca la cornice.

---

## Bibliografia essenziale

- Bjork, R. A. (1994). *Memory and metamemory considerations in the training of human beings.* (difficoltà desiderabili)
- Boix Mansilla, V. (2005). «Assessing Student Work at Disciplinary Crossroads», *Change*; e i lavori Project Zero sulla *interdisciplinary understanding*.
- Garner, R., Gillingham, M. G. & White, C. S. (1989). *Effects of seductive details on macroprocessing and microprocessing.*
- Kafai, Y. (1995). *Minds in Play*; Kafai, Y. & Burke, Q. (2016). *Connected Gaming*, MIT Press. (constructionist gaming)
- Klein, J. T. (1990). *Interdisciplinarity: History, Theory, and Practice.*
- Mayer, R. E. (2009). *Multimedia Learning*, 2ª ed. (principio di coerenza, seductive details)
- Paivio, A. (1971, 1986). *Dual Coding Theory.*
- Papert, S. (1980). *Mindstorms*; Papert, S. & Harel, I. (1991). *Constructionism.*
- Plass, J. L., Mayer, R. E. & Homer, B. D. (a cura di) (2020). *Handbook of Game-Based Learning*, MIT Press.
- Slamecka, N. J. & Graf, P. (1978). *The generation effect.*
- Sweller, J. (1988); Sweller, J., Ayres, P. & Kalyuga, S. (2011). *Cognitive Load Theory.*
- Yates, F. A. (1966). *The Art of Memory.* (metodo dei loci)
- *Piano di studio della scuola dell'obbligo ticinese* (2015) / *Lehrplan 21* — competenze trasversali e Contesti di Formazione Generale.

---

> **Nota di metodo.** Documento critico, non promozionale: la sua funzione è segnare il confine tra la
> versione della feature che insegna e quella che intrattiene. Ogni implementazione futura dell'autoria
> come studio va misurata contro il §4 (vincolo semantico) e il §5.2 (i tre anelli di Boix Mansilla).
