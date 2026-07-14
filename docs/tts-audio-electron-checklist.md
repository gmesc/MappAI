# Checklist — Lettore TTS + Voce naturale (Gemini) prima del merge

> Suite "lettura aumentata" per allievi BES/DSA, sviluppata su `008-timeline-live`
> (commit `e0c2e6d` + auto-save successivi). Tutto verificato in **browser harness**;
> questa checklist copre ciò che il browser statico NON può esercitare:
> `electronAPI` (Gemini TTS, live-materials), licensing, voce di sistema reale,
> LAN/telefono, encode MP3 su testo lungo.
>
> **Come**: `npm start` → apri una mappa reale (MindMap o KG) con descrizioni ricche.
> Provider consigliato per l'audio naturale: **Google (Gemini)** con chiave valida
> e modello TTS abilitato (`gemini-2.5-flash-preview-tts`).

## A. Smoke + i18n
- [ ] App parte senza errori console; `lame.min.js` caricato (`window.lamejs` definito).
- [ ] Menu "Materiali di studio" → card **"Sintesi materiale"** (non più "Sintesi di ramo (AI)").
- [ ] Switch lingua IT→EN→IT: card = "Study material synthesis" in EN, ripristina IT. Nessuna chiave grezza a schermo.

## B. Lettore TTS in-app (voce di sistema)
- [ ] Pannello **Strumenti Compensativi** (icona occhio) → **"Ascolto Testo"**: attiva.
- [ ] Con "Ascolto Testo" ON, il **chip a 4 segmenti** (↺10 · play/pausa · 5↻ · ×velocità) compare in: Sintesi materiale, dettaglio/fonti nodo, guida app, metodi di studio. OFF → sparisce.
- [ ] Play → la **voce di sistema** legge davvero (il preview non ha audio: qui sì).
- [ ] I numeri di nota `[1]`,`[2]` **non** vengono pronunciati; le Fonti a fondo pagina nemmeno.
- [ ] Karaoke: la frase in lettura si evidenzia e segue; scroll morbido.
- [ ] Barra di avanzamento: trascina a metà → riprende da lì (non da capo). ±sec funzionano. Ciclo velocità 0,75→1,5.
- [ ] Sintesi "Tutta la mappa": pulsante **▶ "Ascolta da qui"** su ogni titolo → parte da quella sezione.

## C. Card audio flottante dal nodo
- [ ] Click destro su un nodo → **"Leggi ad alta voce"** → compare la card in basso (titolo + testo + chip + barra).
- [ ] Voce di sistema legge; karaoke sulla frase; barra avanza.
- [ ] Ri-invocare dal menu = chiude la card (toggle). ✕ chiude.

## D. Sintesi esportata / richiamata (documento auto-contenuto)
- [ ] Genera una Sintesi materiale → viene **auto-archiviata**.
- [ ] "Documenti salvati" → riapri la sintesi: si apre in finestra con **lettore integrato** (chip + barra + karaoke) — l'audio NON manca più.
- [ ] Toggle **"Aa Dislessia"** nel documento: sfondo crema, font Verdana, interlinea ampia.
- [ ] **Stampa / PDF** invariato (il chip/barra sono `no-print`).
- [ ] ⚠️ Le sintesi archiviate PRIMA di questa feature non hanno il lettore → vanno rigenerate.

## E. Voce naturale Gemini → MP3 (chiave Google richiesta)
- [ ] Senza chiave Google → toast "Serve la chiave API Google (Gemini)". Con provider Infomaniak attivo ma chiave Google presente → funziona comunque (usa `gemini_api_key`).
- [ ] "Audio voce naturale" → overlay "Genero audio i/n" (una chiamata **per blocco**) poi "Comprimo l'audio…".
- [ ] Modello TTS non abilitato sulla chiave → toast "Risposta senza audio (modello TTS non disponibile…)". (Verificare che la chiave abbia accesso a `gemini-2.5-flash-preview-tts`.)
- [ ] Chooser: **Condividi + audio (QR)** · **Scarica HTML + audio** · **Scarica solo audio (MP3)**.
- [ ] "Scarica solo audio (MP3)" → file `.mp3` che si riproduce (peso ~1 MB per ~2 min, non ~6 MB).
- [ ] "Scarica HTML + audio" → aprendo il file, il chip suona la **voce naturale** (non quella di sistema); barra REALE.
- [ ] Karaoke **cue-synced**: la frase evidenziata corrisponde alla voce; ▶ sezione salta al punto giusto dell'audio.
- [ ] Testo lungo (mappa grande): encode MP3 non blocca; durata coerente.

## F. Condivisione LAN + offline (2 dispositivi reali)
- [ ] "Condividi + audio (QR)" → il server Materiali pubblica l'HTML (multi-MB) → QR.
- [ ] Telefono su stessa Wi-Fi inquadra il QR → pagina si apre (nessun login) → **voce naturale in streaming** + karaoke.
- [ ] Barra inferiore studente: **"Salva come PDF"** + **"Salva HTML"**.
- [ ] iPhone/Safari: "Salva HTML" → "Salva su File". Riaprire il file offline (Wi-Fi spento) → lettore + **audio naturale ancora funzionanti** + karaoke.
- [ ] Android/Chrome: stesso flusso.
- [ ] Server Materiali regge un HTML grande (audio incorporato) su LAN senza timeout.

## G. Regressioni da controllare
- [ ] TTS del **Tutor AI** (`#tts-button` nell'`ai-modal`) invariato (usa ancora `readModalAloud`/`toggleTTS`).
- [ ] Mappa in lingua EN (`mappai_map_language`): la voce usa `en-US`.
- [ ] Nessun errore console durante generazione audio / apertura documenti.
- [ ] Suite unit invariata (i core UMD non toccati dai file di questa feature).

## Note tecniche
- Sync karaoke = **per blocco esatta** (cue = durata reale PCM di ogni clip); sotto-frase per stima (Gemini non dà timestamp per-parola) → ~60 ms di encoder-delay MP3, impercettibile.
- Audio = **MP3 64 kbps mono** (lamejs, MIT, vendorizzato) con **fallback WAV** se la lib manca.
- Kill/config: `mappai_tts_tool_enabled`, `mappai_tts_rate_idx`, `mappai_tts_model`, `mappai_tts_voice`.
- Se il file HTML risulta pesante: possibile scendere a 48 kbps o downsample 16 kHz prima dell'encode (non ancora fatto).
