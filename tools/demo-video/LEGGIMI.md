# Il demo di 4 minuti — come si rifà

Il **video promozionale della formazione di mezza giornata** (240 s esatti, 2560×1440) si
monta da qui, girando l'**app vera** coi vault veri della 4R. L'uscita vive **fuori dal
repo**, in `~/Claude/MappAI - demo/`:

```
~/Claude/MappAI - demo/
├── demo-mappai-4min.mp4                     ← IL VIDEO: muto, con la voce vera della sintesi come
│                                               UNICO audio (scelta di Giacomo, 24/8). Un provino con la
│                                               voce sintetica si rifà con `monta.js --traccia`
├── copione-da-leggere.md                    ← il copione per la voce di Giacomo, coi minuti d'attacco
├── grezzi/<clip>/*.jpg + frames.json        ← i fotogrammi delle scene d'app (Page.startScreencast)
├── carte/                                   ← cartelli e slide comparative (PNG 2K + HTML)
├── clip/ · tmp/                             ← i pezzi del montaggio (si rigenerano)
└── giro.json                                ← che cosa è stato girato, quando, con che durate
```

## I tre comandi

```bash
# 1. l'app VERA (⚠️ i tre flag: senza, una finestra coperta non produce fotogrammi)
npx electron . --remote-debugging-port=9222 \
  --disable-renderer-backgrounding --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows

# 2. le scene (tutte, o --solo 02 / 04b / 08; --senza-chiave taglia la generazione)
node tools/demo-video/gira.js

# 3. il montaggio
node tools/demo-video/monta.js                    # il video muto (+ voce sintesi in scena 8)
node tools/demo-video/monta.js --traccia          # il provino con la voce sintetica
node tools/demo-video/monta.js --voce voce.m4a    # la voce VERA di Giacomo, senza rigirare nulla
```

Prova dell'aritmetica senza app: `node --test tests/demo-video-core.test.js` e
`node tools/demo-video/monta.js --secco`.

## I pezzi

| file | che cos'è |
|---|---|
| `copione.js` | **l'unica fonte dei tempi**: scene, durate (somma = 240, lo pretende il test), sfoglio, narrazioni |
| `montaggio-core.js` | aritmetica pura UMD: valida, budget parole, lista concat, velocità, copione generato |
| `domande-core.js` | legge le domande aperte dai **PDF veri** (pdftotext) per le slide comparative |
| `carte.js` | cartelli + slide degli angoli, resi in PNG 2K da Chrome headless coi .ttf dell'app |
| `scene.js` | i gesti delle scene sull'app viva (riusa `tools/guida-docenti/gesti.js`) |
| — scena 04a | NON si registra: è la sequenza `STUDIO` di `copione.js` — i PDF della Vista studio (td-00→03, fasci in zoom-out, DAG e mappa libera in pan), ritagliati dal bianco con PIL |
| `lab-video.js` | `registra()` = Page.startScreencast → fotogrammi + timestamp; `cliccaPiano/muoviPiano` |
| `sintesi.js` | la scena DSA: il file HTML vero del vault in Chrome headless, karaoke incluso |
| `gira.js` | l'esecutore: font TM Sans per il giro (e ripristino), 2K, giro.json |
| `monta.js` | ffmpeg: clip dai fotogrammi (accelerati sul tempo scena), sfoglio PDF via PIL, audio |
| `formazione.json` | i dati del cartello finale: data, sede, contatto — si cambiano e si rimonta |

## Che cosa scrive, e dove

- **Legge** i vault veri (`Mappe/4R/Scienze/Elettricità - MM`, `Mappe/4R/Storia/grind this
  heels`); l'unica scrittura di scena è il vault **«Elettricità - demo»** che la scena 3
  genera davvero (con la chiave Gemini; qualche centesimo). Si cestina quando si vuole.
- Il **font dell'app** viene messo a TM Sans per il giro e **ripristinato** a fine giro.
- La scena 7 apre l'editor di un quiz, scrive una correzione **e esce senza salvare**.

## Trappole pagate (24/8)

1. **`Page.screencastFrame` va confermato** (`screencastFrameAck`) o il flusso si ferma dopo
   pochi fotogrammi. E i fotogrammi arrivano solo quando la pagina ridisegna: nei fermi non
   ne arrivano, il montaggio tiene l'ultimo (le durate vere stanno in `frames.json`).
2. **La grandezza dei fotogrammi è quella della FINESTRA**, non del deviceScaleFactor: per il
   2K in headless servono `--window-size=2560,1440 --force-device-scale-factor=2` con
   l'emulazione a 1280×720 @2.
3. **Il concat di ffmpeg si fa col FILTRO, non col demuxer**: il demuxer si fida della durata
   scritta nel contenitore e su questi clip mente (misurato: 230 s totali, poi sfoglio
   schiacciato a 6 s). E serve `setsar=1`: i clip dell'app portano un SAR spurio
   (22016:22005) e il concat rifiuta stream con SAR diversi.
4. **L'ffmpeg di Homebrew è senza `drawtext`**: le etichette dello sfoglio le compone PIL.
5. **I PDF con i .ttf di TestMe usciti da jsPDF non si rendono con poppler** (si dichiarano
   OTTO, trappola 47 della GUIDA-ARCHITETTO): flashcard TestMe = pagine bianche. Lo sfoglio
   usa le versioni che rendono, misurate una per una (`copione.js`, commento su SFOGLIO).
6. **`dossier: false` nell'index.yaml del dossier vero** (trappola 8 della guida docenti, ma
   sul disco vero): senza la riparazione «Proietta» non compare. Riparato il 23/8 sera
   (backup in `/tmp/index.yaml.grind.bak`).
7. **Lo stato della proiezione PERSISTE fra un'apertura e l'altra**: un pannello «Affianca»
   lasciato aperto ricompare alla scena dopo, bianco finché la scheda non si carica. La
   scena lo chiude se lo trova aperto, e le schermate d'app sono FULL BLEED (24/8): la
   cornice grigia non esiste più.
8. **La Cabina aperta copre la briciola**: ogni scena che finisce in Cabina chiude la console
   (`cabinaChiudi`), o la scena dopo muore con «menu della briciola non visibile».

## Che cosa NON prova

- La resa a occhio del ritmo: la dà il PROVINO con la traccia guida, e decide una persona.
- La voce di Giacomo: si registra sul `copione-da-leggere.md` (Recordly o QuickTime) e si
  incolla con `--voce`.
- Windows, e qualunque cosa fuori da questo Mac.
