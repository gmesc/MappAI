# ASSISTENZA REMOTA — comandi da far eseguire a un beta tester

> Foglio operativo: un tester scrive «non funziona», e da qui si arriva a sapere *che
> cosa* non funziona senza avere il suo computer davanti.
> Scritto il **16 agosto 2026**. Ogni comando qui dentro è stato provato sull'app vera.

---

## 0. Le tre regole, prima dei comandi

1. **Non chiedere mai una chiave API.** Nessun comando di questo foglio la mostra: la
   diagnosi dice se una chiave *c'è* (`google=sì`), mai qual è. Se un tester te ne manda
   una spontaneamente, dille di rigenerarla — da quel momento è compromessa.
2. **Prima di tutto: `MappAIErrori.diagnosi()`.** Un comando solo, un blocco solo da
   rimandare. Gli altri comandi servono a scavare *dopo* aver letto quel blocco, non
   prima: partire da un comando mirato significa aver già indovinato il guasto.
3. **I comandi che SCRIVONO sono marcati ⚠️.** Tutti gli altri leggono e basta. Non far
   incollare un comando che scrive finché non hai letto la diagnosi — e digli sempre che
   cosa cambierà prima che prema Invio.

### Come si apre la console

| | |
|---|---|
| macOS | `⌥` + `⌘` + `I` — oppure menu **Visualizza › Attiva/Disattiva strumenti di sviluppo** |
| Windows / Linux | `Ctrl` + `Shift` + `I` |

Si apre un pannello: la scheda da usare è **Console**. Si incolla il comando accanto al
segno `>`, si preme Invio, si seleziona il risultato e lo si copia.
⚠️ Chrome chiede di scrivere `allow pasting` la prima volta che si incolla nella console:
è una difesa contro le truffe, e va detto al tester **prima**, o si spaventa (giustamente).

---

## 1. Il comando da mandare per primo, sempre

```js
MappAIErrori.diagnosi().then(t => { console.log(t); copy(t); })
```

Stampa il blocco **e lo copia negli appunti** (`copy()` esiste solo nella console degli
strumenti di sviluppo). Il tester incolla in un'email e la diagnosi è fatta.

Il blocco contiene: data · piattaforma e versione di Electron · **il marcatore di cache
del JS** · quali chiavi AI sono presenti (sì/no) e quale provider è attivo · **lo stato
del cassetto** · gli interruttori diversi dal default · **gli ultimi errori registrati**.
Non contiene: testo delle fonti, descrizioni dei nodi, profili di classi o allievi, nomi
di allievi, chiavi.

**Come si legge, riga per riga:**

- `build del JS (marcatore di cache): dh23` — se non è quello che ti aspetti, **sta
  girando codice vecchio** e qualunque altra deduzione è sospetta. È il guasto più
  frequente di questo repo: si corregge un difetto, il browser serve il file dalla cache,
  e il difetto «non è stato corretto». Rimedio per il tester: `⌘⇧R` (ricarica forzata).
- `cassetto: 17.4 MB su ~48 (36%) — ok` — vedi §2.
- `interruttori:` — se compare qualcosa che non ti aspetti, il tester ha (o ha ereditato)
  una feature spenta. `mappai_stile_manifesto=0` spiega da solo «l'interfaccia è diversa
  dalla tua».
- `ULTIMI ERRORI REGISTRATI` — le righe `[chiusura-improvvisa]` non sono errori di per
  sé: dicono che l'app è stata uccisa (uscita forzata, blocco, spegnimento). Tre di fila
  in un'ora sono un sintomo; una dopo un riavvio del computer no.

---

## 2. «Non mi salva più» / «ho perso una mappa» — il cassetto

È il guasto che è già successo. `localStorage` ha una quota (**~48 MB, misurata**: non
esiste un'API che la dichiari) e quando finisce il salvataggio non entra più.

```js
MappAIErrori.cassetto()
```

| campo | che cosa dice |
|---|---|
| `pct` | quanto è pieno. **Sotto 60 sta bene**, 60-79 avviso, 80-89 alto, **90+ critico** |
| `progetti` / `mappe` | se `progetti` è molto maggiore di `mappe`, ci sono copie in eccesso |
| `copie` / `copieMB` | quante si liberano senza perdere nulla |
| `top` | le cinque chiavi più pesanti: dice *chi* occupa lo spazio |

**Rimedio, in ordine.** Il primo è nell'interfaccia e non richiede la console — è quello
da far fare al tester:

> **Cabina › Profilo insegnante › Gestione cartelle › «Libera spazio»**

Mostra un'anteprima (che cosa va via, quanto si libera) e tocca **solo** le copie non più
recenti delle voci di progetto: di ogni mappa resta l'ultima, ed è quella che l'app apre
comunque. **Le cartelle dei vault su disco non vengono toccate.**

⚠️ Se il tester non arriva alla Cabina (interfaccia bloccata), lo stesso dalla console:

```js
// ⚠️ SCRIVE — toglie le copie in eccesso. Le mappe su disco restano intatte.
(function(){
  var P = JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]');
  var a = MappAITeachCore.anteprimaPotatura(P, 1, function(id){ var v=localStorage.getItem(id); return v?(id.length+v.length):0; });
  if (!a.via.length) return 'niente da liberare';
  var s = {}; a.via.forEach(function(id){ s[id]=1; localStorage.removeItem(id); });
  localStorage.setItem('tutor_ai_projects', JSON.stringify(P.filter(function(p){ return !s[p.id]; })));
  return 'liberate ' + a.via.length + ' copie (' + (a.byte/1048576).toFixed(1) + ' MB)';
})()
```

**Se il cassetto è pieno ma le copie sono zero**, il problema è altrove: guarda `top`. Su
un'installazione carica la chiave più pesante è `mappai_saved_documents` (l'archivio dei
documenti), che **nessuna potatura tocca** — lì si interviene eliminando documenti
dall'archivio, non con un comando.

**Perché dovrebbe arrivarti da solo:** dal 16/8 la saturazione si scrive nel registro
degli errori quando supera una soglia — quindi compare in fondo alla segnalazione senza
che il tester sappia di doverla guardare. Si scrive **una volta per livello e solo quando
peggiora** (altrimenti ogni salvataggio ne aggiungerebbe una).

Per forzare una misura subito, senza aspettare il salvataggio:

```js
MappAIErrori.controllaCassetto('assistenza', true)
```

---

## 3. «L'app è lenta» / «si blocca» / «si chiude da sola»

```js
MappAIErrori.ultimi(20).then(r => { console.log(r.records); console.log('file:', r.file); })
```

`r.file` è il percorso di `Diagnostica/errori.jsonl` sul suo computer: se serve tutto, è
il file da farsi mandare. Per aprirgli direttamente la cartella:

```js
MappAIErrori.apriCartella()
```

Se il registro è **vuoto** ma i problemi ci sono, controlla che non sia spento:

```js
MappAIErrori.attivo()   // false = qualcuno l'ha spento con mappai_error_log='0'
```

---

## 4. «Non trovo le mie mappe» / gli elenchi sono vuoti

Le mappe vivono **su disco**, gli elenchi le leggono da lì. Nell'ordine:

```js
// (1) dove sta la cartella madre, e se esiste davvero
electronAPI.filesRootGet().then(r => console.log(r))
```

```js
// (2) quanti vault vede il disco, e come sono annidati
// ⚠️ il campo del nome è `folderName` (è il nome della CARTELLA), non `name`
electronAPI.getAllVaults().then(v => console.table(
  v.map(x => ({ cartella: x.folderName, classe: x.classDir||'—', materia: x.discDir||'—', allievo: x.studentDir||'—' }))
))
```

```js
// (3) l'indice in memoria: se qui ci sono voci che il disco non ha, sono orfane
JSON.parse(localStorage.getItem('tutor_ai_projects')||'[]')
  .map(p => ({ nome: p.name, vault: p.vault||'—', classe: p.cls||'—', data: new Date(p.date).toLocaleString() }))
```

**Come si legge lo scarto fra (2) e (3):** il disco è la fonte di verità. Un vault che sta
in (2) e non in (3) si apre lo stesso (gli elenchi leggono il disco). Una voce che sta in
(3) e non in (2) è una scheda che punta a una cartella spostata o cancellata a mano.

⚠️ **Trappola degli accenti**: `Elettricità` può esistere in **due forme diverse** che si
vedono uguali (NFC e NFD). Se una mappa «c'è ma non si aggancia», è quasi sempre questo:

```js
(function(){
  var P = JSON.parse(localStorage.getItem('tutor_ai_projects')||'[]');
  return P.filter(p => p.vault && p.vault !== p.vault.normalize('NFC'))
          .map(p => p.vault);   // se non è vuoto: nomi in forma scomposta
})()
```

Un filtro di classe rimasto acceso svuota gli elenchi senza dirlo:

```js
[localStorage.getItem('mappai_active_class'), localStorage.getItem('mappai_active_discipline')]
```

---

## 5. «La generazione non parte» / resta bloccata

```js
// il lucchetto: se `attiva` è true l'app crede di stare ancora generando
({ attiva: MappAIGen.attiva(), mappa: MappAIGen.nome() || '—', motivo: MappAIGen.motivo() })
```

⚠️ Non far usare `mappaiOccupato()` per guardare: **fa comparire un toast** (è la guardia
dei comandi, non una lettura). `MappAIGen.attiva()` legge e basta.

⚠️ Se il lucchetto è rimasto chiuso dopo una generazione finita male, **ricaricare la
finestra** (`⌘R`) è il rimedio giusto: lo stato di generazione non sopravvive al ricarico
e la mappa su disco non è toccata.

```js
// provider e modello attivi — metà delle segnalazioni «l'AI non risponde» sono qui
[localStorage.getItem('ai_provider'),
 document.getElementById('model-select') && document.getElementById('model-select').value,
 localStorage.getItem('gemini_api_key') ? 'chiave google presente' : 'NESSUNA chiave google',
 localStorage.getItem('infomaniak_api_key') ? 'chiave infomaniak presente' : 'nessuna chiave infomaniak']
```

Consumi e costi (dice anche se le chiamate stanno partendo davvero):

```js
electronAPI.usageLogRead(20).then(r => console.table(r.records))
```

---

## 6. «L'interfaccia è rotta» — spegnere un pezzo alla volta

Gli interruttori si spengono **uno per volta**, ricaricando fra l'uno e l'altro: spegnerli
tutti insieme dice che il guasto era «da qualche parte», che non è una diagnosi.
Sono in ordine: dal pezzo più esterno al più interno.

```js
localStorage.setItem('mappai_stile_manifesto','0'); location.reload()   // ⚠️ la veste nuova
localStorage.setItem('mappai_teach_console','0');  location.reload()   // ⚠️ la console INSEGNA
localStorage.setItem('mappai_studio_view','0');    location.reload()   // ⚠️ la Vista studio
localStorage.setItem('mappai_lavori_barra','0');   location.reload()   // ⚠️ l'indicatore in barra
```

Per rimettere tutto com'era:

```js
// ⚠️ SCRIVE — riporta gli interruttori al default. Non tocca mappe né documenti.
['mappai_stile_manifesto','mappai_teach_console','mappai_studio_view','mappai_lavori_barra',
 'mappai_vista_ridotta','mappai_teach_row_select']
  .forEach(k => localStorage.removeItem(k)); location.reload()
```

Lo stato completo degli interruttori, per confrontarlo col tuo:

```js
Object.keys(localStorage).filter(k => /^mappai_/.test(k) && localStorage.getItem(k).length < 60)
  .sort().map(k => k + ' = ' + localStorage.getItem(k))
```

---

## 7. L'ultima spiaggia, e che cosa costa davvero

⚠️ **Prima di qualunque comando di questa sezione**: fatti confermare che la cartella
`MappAI - file` è al suo posto (§4 comando 1). Lì stanno le mappe, i materiali e le
classi: finché c'è quella, `localStorage` è **un indice ricostruibile**, non un archivio.

```js
// ⚠️ SCRIVE — azzera l'indice locale. Le mappe su disco NON vengono toccate:
// si riaprono da ELABORA, che legge le cartelle.
// Si perdono: posizioni dei nodi non ancora scritte nel vault, l'elenco «recenti»,
// e l'archivio dei documenti (mappai_saved_documents).
localStorage.clear(); location.reload()
```

Se serve conservare i documenti archiviati, prima:

```js
copy(localStorage.getItem('mappai_saved_documents'))   // → incollare in un file di testo
```

---

## 8. Che cosa chiedere sempre, oltre ai comandi

I comandi dicono lo stato, non la storia. Le tre domande che risparmiano un giro:

1. **Che cosa stavi facendo quando è successo?** (non «che errore ti dà»)
2. **È la prima volta o succede sempre?** E se sempre: **da quando**?
3. **Succede anche su una mappa diversa?** Distingue un guasto dell'app da un dato rotto.

E se il tester non se la sente della console: **Cabina › Segnalazione** fa quasi tutto da
sola — categoria, testo, e in coda all'email gli ultimi errori registrati.
