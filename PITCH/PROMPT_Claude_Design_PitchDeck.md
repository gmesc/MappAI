# Prompt per Claude Design — Nuovo Pitch Deck MappAI

> Copia/incolla tutto ciò che segue in Claude Design (in una sessione con accesso alla cartella `PITCH`).

---

## Ruolo e obiettivo

Sei un art director + designer di presentazioni. Devi generare **un nuovo pitch deck MappAI** in un singolo file HTML, con un look **più professionale** e un'**impaginazione dei testi rigorosa, allineata e curata**, mantenendo in modo fedele l'identità visiva della landing page del prodotto.

Il deck è rivolto a **investitori** (Canton Ticino / Svizzera) sul tema MappAI per la neurodiversità (BES/DSA).

## PASSO 0 — Obbligatorio prima di disegnare

Prima di scrivere qualsiasi slide, **leggi questi due file** nella cartella di progetto e ricava da lì il sistema di design (colori, font, raggi, ombre, spaziature, componenti):

- `index.html` — markup e classi/componenti della landing (blocco `<style type="text/tailwindcss">`, classi come `.step_badge`, `.hero_title`, `.mode_btn`, `.btn_generate`, `.landing_label_primary`, `.form_input`).
- `style.css` — variabili, font, regole globali.

Guarda anche, come riferimento di contenuto (NON di stile), il deck esistente `mappai_pitch_deck_finale.html` per riusare la struttura delle 12 slide. Lo stile va **migliorato**, non copiato.

Asset disponibili nella cartella: `MappAI_icon.png` (logo "atomo"), `immagine_profilo.jpg` (founder), cartella `assets/`.

## Sistema di design da rispettare (sintesi della landing)

Usa questi token come ground truth; verifica/affina leggendo i file.

**Font**
- Unico font: **Space Mono** (Google Fonts), pesi 400/700, anche per i titoli (look monospace = firma del brand). Carica via `<link>` Google Fonts.
- Niente font alternativi nei titoli. Per i numeri grandi usa Space Mono 700.

**Colori**
- Sfondo app: `#f0f4ff` (azzurro chiarissimo) / superfici card: `#ffffff`.
- Testo primario: `#1e293b` (slate-800), testo secondario: `#64748b` (slate-500).
- Bordi: `#e2e8f0`. 
- Primario / CTA: indigo `#6366f1`–`#4f46e5`.
- Verde brand (accento "Mappa Mentale" / successo): `#34d399` / `#4ade80`.
- Palette nodi logo (usa con parsimonia per accenti e dataviz): blu `#3b82f6`, giallo `#facc15`, arancio `#f97316`, rosa `#f43f5e`, viola `#8b5cf6`, teal `#2dd4bf`.
- Evita gradienti "neon" pesanti: il tono deve restare **sobrio e professionale**.

**Forme & superfici**
- Card e bottoni con angoli morbidi: `rounded-2xl` (16px) per le card, `rounded-xl` (12px) per input/chip, `rounded-full` per badge numerici.
- Ombre leggere e diffuse (soft shadow), niente bordi spessi o effetti 3D.
- Badge step numerati a cerchio pieno colorato (come `.step_badge` nella landing), uno per macro-sezione.

## Requisiti di impaginazione (la parte più importante)

L'utente vuole **testi più rigorosi e curati**. Applica regole tipografiche da agenzia:

1. **Griglia e formato.** Ogni slide è un riquadro **16:9** a dimensione fissa (es. 1280×720, `aspect-ratio: 16/9`), centrato. Imposta una **griglia a 12 colonne** con gutter costante e margini esterni uguali su tutti i lati (safe area). Niente elementi che toccano i bordi.
2. **Scala spaziale coerente.** Usa una scala di spaziatura a multipli di 4/8px (8, 16, 24, 32, 48, 64). Stessi padding interni delle card su tutto il deck.
3. **Gerarchia tipografica fissa e riusata** su ogni slide:
   - Kicker/eyebrow (uppercase, tracking ampio, slate-500, piccolo).
   - Titolo slide (H2, grande, slate-800, peso 700, `leading-tight`).
   - Corpo (slate-600, misura leggibile, `line-height` ~1.5).
   - Caption/fonte (piccolo, slate-400).
   Definisci queste classi una volta e riusale identiche ovunque.
4. **Allineamento.** Testo principalmente **allineato a sinistra** (no giustificato). Numeri/KPI allineati otticamente. Elementi su una stessa riga condividono baseline e altezza.
5. **Lunghezza riga.** Massimo ~60–75 caratteri per riga; usa colonne quando il testo è lungo.
6. **Densità.** Una idea-chiave per slide. Massimo ~6 punti elenco; ogni bullet 1–2 righe. Tanto respiro (whitespace).
7. **Consistenza.** Stessa posizione per titolo, numero slide e logo su tutte le slide. Header/footer ripetuti identici. Numerazione "NN / 12".
8. **Dataviz pulita.** Grafici/numeri con la palette brand, etichette dirette, nessuna decorazione superflua, fonte citata sotto.
9. **Icone.** Coerenti (Lucide, già usato nella landing), stesso peso/dimensione, colore allineato al testo.

## Struttura del deck (12 slide — riusa i contenuti del deck finale)

1. **Hook / Cover** — Logo MappAI + "Trasformare la conoscenza visuale per la neurodiversità".
2. **Il problema** — La crisi (invisibile) dell'apprendimento inclusivo.
3. **Evidenza scientifica** — 40 anni di ricerca: le mappe cambiano l'apprendimento.
4. **La soluzione** — Da qualsiasi fonte a mappa semantica, in 3 step.
5. **Prodotto** — L'intelligenza diventa visiva.
6. **Oltre lo schermo** — Documenti, vault, privacy.
7. **Competizione** — Nessuno fa quello che facciamo noi.
8. **Mercato** — Regolamentato, in crescita, sotto-servito.
9. **Business model & roadmap.**
10. **Trazione & utilizzo dei fondi.**
11. **Team / Founder** — Founder-product fit inimitabile (usa `immagine_profilo.jpg`).
12. **L'investimento / Ask + closing.**

Mantieni i dati numerici e i testi del deck esistente; riorganizzali secondo le regole di impaginazione sopra. Se mancano dati, lascia placeholder evidenti `[DA CONFERMARE]` invece di inventare cifre.

## Specifiche tecniche

- **Output:** un singolo file HTML autonomo, `mappai_pitch_deck_pro.html`, salvato nella cartella `PITCH`.
- **Tailwind** via CDN/locale come nella landing + un piccolo blocco `<style>` per i token e le classi tipografiche.
- **Navigazione:** scroll verticale tra slide + dot-nav laterale (come nel deck finale) e navigazione con frecce tastiera.
- **Stampa/PDF:** regole `@media print` perché ogni slide esca su una pagina A4 landscape pulita (page-break per slide), così l'export PDF resta impaginato bene.
- **Responsive:** la slide scala mantenendo il 16:9; leggibile anche a schermo intero (presentazione).
- **Accessibilità:** contrasto AA, ordine di lettura corretto, `alt` sulle immagini.
- Niente `localStorage`/storage del browser.

## Cosa evitare

- Stili che si discostano dalla landing (font diversi, palette neon, angoli vivi).
- Slide sovraccariche di testo o con allineamenti incoerenti.
- Cifre inventate.

## Verifica finale (fai questo prima di consegnare)

- Apri il file e controlla che: font Space Mono ovunque; titoli/kicker/corpo identici per stile su tutte le slide; margini e griglia rispettati; numerazione 1–12 presente; export PDF (print) con una slide per pagina; contrasto leggibile.
- Riassumi in 3 righe le scelte di impaginazione applicate.
