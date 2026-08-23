# La guida per i docenti — come si rifà

La **guida illustrata** che i docenti-tester tengono aperta accanto all'app vive **fuori dal
repo**, in `~/Claude/MappAI - guida docenti/` (95 immagini a 2× pesano 22 MB: in git non ci
vanno). Qui dentro c'è solo ciò che la **rigenera**, e va rilanciato quando l'app cambia.

```
~/Claude/MappAI - guida docenti/
├── index.html          ← LA GUIDA (13 capitoli + appendice QR). Doppio clic e si legge.
├── assets/             ← stile-guida.css · guida.js · i caratteri · il logo
├── img/                ← gli scatti (li scrive la campagna) + _provini*.jpg
└── lab/                ← L'ISTANZA DI PROVA: userData/ · casa/MappAI - file/ · i log
```

## Rifare gli scatti, in tre comandi

```bash
# 1. l'app di prova (MAI i dati veri: userData e cartella madre sono nel lab)
./node_modules/.bin/electron . --remote-debugging-port=9333 \
  --user-data-dir="$HOME/Claude/MappAI - guida docenti/lab/userData" \
  --disable-renderer-backgrounding --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows

# 2. la campagna (--da-zero ricopia i vault e svuota localStorage; --solo 07 fa un capitolo)
node tools/guida-docenti/campagna.js --da-zero
python3 tools/guida-docenti/provini.py          # img/_provini*.jpg: si rivede tutto in un colpo

# 3. la guida si VERIFICA, non si guarda
node tools/guida-docenti/verifica.js            # 0 difetti = si consegna
```

⚠️ **I tre flag di Chromium non sono cosmesi.** Con la finestra coperta da un'altra,
`requestAnimationFrame` si ferma (misurato il 23/8: 0 fotogrammi in 500 ms,
`visibilityState: hidden`): la fisica di D3 non fa un tick e la mappa libera si fotografa con
tutti i cerchi ammucchiati sotto la radice. È la trappola 2 della `GUIDA-ARCHITETTO`, sull'app
vera invece che nel pannello browser.

## I pezzi

| file | che cos'è |
|---|---|
| `lab.js` | il ponte CDP verso l'app viva (porta 9333): `clicca/scrivi/tasto`, `scatta(nome,{sel\|clip})`, `numeri/cornice/puntatore/banda`, `tendinaFinta` (i `<select>` nativi non si fotografano aperti), `fileIn` (il Finder non si pilota: si mette il file nell'`<input>` e si scatena `change`), `ls` (localStorage), `metrica` (1470×956 @2×, il MacBook Air del lettore) |
| `campagna.js` | l'esecutore: `passo(nome, fn)` cattura l'errore e continua, `--da-zero` · `--solo NN` · `--elenco`, e scrive `fatti/esiti-electron.md` |
| `passi.js` | **i passi veri**, in ordine di guida. Ogni trappola pagata è un commento lì |
| `telefono.js` | il telefono dell'allievo per l'appendice QR: Chrome **headless** con la sua porta (9444) |
| `provini.py` | il foglio dei provini (PIL): tutte le immagini in una griglia col nome sotto |
| `verifica.js` | immagini integre (`naturalWidth`), indice completo, lightbox, contrasti ≥ 4,5:1, niente scorrimento a 1280 e 390 px, e ogni etichetta «…» del testo cercata nei `fatti/` |
| `fatti/` | **la mappa dei fatti**: 8 aree + 4 buchi, ~430 KB letti dal codice con `file:riga`, più `esiti-electron.md` (che cosa la campagna ha visto girare davvero) |

ℹ️ In `img/` restano una trentina di scatti **non citati** dalla pagina: sono le varianti
(la stessa schermata senza i numeri cerchiati, un ritaglio più stretto, la versione intera di
un riquadro). Non sono scarti: servono se una figura va cambiata senza rifare la campagna.
`verifica.js` le elenca come «non usate», e va bene così.

## Che cosa questi strumenti NON provano

- **La generazione.** Nell'istanza di prova non è mai stata incollata la chiave Gemini: la
  mappa da un PDF, «Genera materiali», il dossier da una foto e la voce naturale sono
  raccontati a parole, non fotografati. Con la chiave, i passi mancanti sono al punto 6 del
  piano.
- **Windows.** Tutto è macOS: il Finder, `sips` per le foto HEIC, il menu di sistema.
- **La resa a occhio.** `verifica.js` misura; il giudizio sulle immagini lo dà il foglio dei
  provini, e su quello decide una persona.
- **Che la guida sia VERA.** Lo hanno fatto sei verificatori scettici (Workflow, 23/8): 526
  affermazioni rette, 51 smentite e corrette. Se cambi il testo, rifallo.

## Trappole pagate (il riassunto; il dettaglio nei commenti di `passi.js`)

1. I `confirm()` nativi bloccano il renderer: `window.confirm = () => true` **prima** del clic.
2. «Documenti» apre il Finder nativo: si spegne `HTMLInputElement.prototype.click` per la
   durata di `addSource`, poi `DOM.setFileInputFiles`.
3. Il menu della briciola porta la stessa classe su «4R» e «Scienze»: si clicca il **più a
   sinistra** fra i visibili.
4. I filtri «Classe?»/«Materia?» sopravvivono al cambio di console: `mostraTutti()` prima di
   cercare una mappa.
5. Una seconda finestra di Electron, se coperta, non produce fotogrammi e la cattura resta
   appesa; `Target.createTarget` in Electron non esiste. Per questo il telefono è Chrome
   headless — e una **seconda** connessione CDP alla stessa pagina headless si appende: un
   processo solo, sincronizzato con semafori su file (`lab/tel-*`).
6. Un PDF dentro un iframe si fotografa **nero**: per l'anteprima si sceglie una riga `.html`.
7. Il velo di blocco beta resta finché non si **ricarica** la pagina.
8. `pipeline.json` in un vault copiato fa comparire «Riprendi» a ogni apertura, e il dossier
   copiato dice `dossier: false` (`buildVaultMapData` guarda `nodes[0].id === 'fonte_0'`, ma
   i file di `Nodi/` si rileggono in ordine alfabetico): `--da-zero` corregge entrambi.
9. Un commento `//` a fine riga dentro una riga lunga si è mangiato il codice che seguiva:
   `node --check` dopo ogni modifica a `passi.js`.

Il piano, con il punto di ripresa e i difetti dell'app trovati strada facendo, è in
[`docs/PIANO-guida-docenti.md`](../../docs/PIANO-guida-docenti.md).
