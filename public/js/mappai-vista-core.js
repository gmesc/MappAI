/*
 * mappai-vista-core.js — la VISTA di una mappa viaggia col suo vault (15/8/26)
 * ---------------------------------------------------------------------------
 * Quattro cose vivevano SOLO nello snapshot in localStorage: il profilo della
 * Vista studio, il focus/lenti, la timeline e il foglio dei nodi rivisto.
 * Misurato su un foglio vero (Project E, 251 KB): il 99% del foglio è una
 * fotocopia di ciò che il vault ha già — e il pezzo insostituibile pesa
 * QUALCHE KB. Conseguenza: aprire lo stesso vault su un altro computer (o dopo
 * una pulizia del browser interno) perdeva quelle quattro cose in silenzio.
 *
 * Questo core dice CHE COSA entra in `vista.json` e come si riapplica:
 *   - `raccogli(stato)`  → l'oggetto da scrivere nel vault (o null se vuoto);
 *   - `applica(stato, vista)` → riporta la vista dentro lo stato caricato.
 * L'I/O non sta qui (invariante 19): scrive main.js, monta vault-io.
 *
 * Regola di fusione, ed è la parte che conta: `applica` NON azzera mai ciò che
 * lo stato ha già quando la vista non porta quel campo — un vault vecchio
 * senza vista.json non deve cancellare la timeline appena costruita in
 * memoria. E `raccogli` non scrive un file per dire «tutto vuoto»: null.
 *
 * Dal packet 0078 (ADR 0018 rev. 1, B2) la vista porta anche quello che
 * viveva solo nella copia del cassetto: la Catena dei perché rivista
 * (`db.causalDoc`), le copie dei documenti (`db.causalDocCloni`,
 * `db.nodeSheetCloni`) e i nodi fissati (`pinned`, un elenco di id: `save-vault`
 * non scrive il segno, e `load-vault` fissa ogni nodo che ha x/y). Lo
 * governa l'interruttore `mappai_cartella_completa` (acceso di default, '0' lo
 * spegne), col suo lettore unico `cartellaCompleta()`: spento, i due elenchi
 * sono quelli di prima. Lo schema resta `@1` (B2 a): un codice vecchio ignora
 * i campi che non conosce.
 * E qui sta anche la lista dello STATO DI GENERAZIONE che un'apertura da
 * cartella azzera prima di leggere la cartella (`azzeraGenerazione`): una
 * lista sola, inv. 6.
 *
 * UMD puro, testato in Node (tests/vista-core.test.js). Schema versionato:
 * `mappai-vista@1` — chi leggerà una v2 saprà di doverla capire prima.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIVistaCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var SCHEMA = 'mappai-vista@1';

    function _pieno(v) {
        if (v == null) return false;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object') return Object.keys(v).length > 0;
        return String(v).trim() !== '';
    }

    /* L'interruttore `mappai_cartella_completa` (0078, B1 a): acceso di
       default, spento solo con '0'. UNICO lettore della chiave (inv. 6): lo
       chiedono anche le aperture da cartella e «Riprendi». Legge il
       `localStorage` del luogo in cui il core gira; dove non c'è (Node) o
       lancia, vale acceso — un difetto di lettura non deve spegnere niente. */
    var CHIAVE_CARTELLA_COMPLETA = 'mappai_cartella_completa';
    function cartellaCompleta() {
        var v = null;
        try {
            if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') {
                v = localStorage.getItem(CHIAVE_CARTELLA_COMPLETA);
            }
        } catch (e) { v = null; }
        return v !== '0';
    }

    /* I campi di `db` che la vista porta dallo 0078: oggetti di solo testo
       (sezioni e righe, carte), scritti dall'editor dei documenti attraverso
       `MappAIClona`. Un valore che non è un oggetto non entra e non si applica:
       chi li legge si aspetta quella forma. */
    var CAMPI_DB_COMPLETA = ['causalDoc', 'causalDocCloni', 'nodeSheetCloni'];
    function _oggettoPieno(v) { return _oggetto(v) && _pieno(v); }
    /* Gli id dei nodi fissati, come stringa (il confronto di main.js è per
       `String(id)`). Solo `pinned === true`: il segno lo mette «Salva layout». */
    function _fissati(nodi) {
        var out = [];
        (Array.isArray(nodi) ? nodi : []).forEach(function (n) {
            if (n && n.pinned === true && n.id != null) out.push(String(n.id));
        });
        return out;
    }

    /* Dallo stato dell'app all'oggetto per vista.json. `stato` è appState (o
       un suo pari di prova); si legge, mai si modifica. */
    function raccogli(stato) {
        if (!stato) return null;
        var db = stato.db || {};
        var out = { schema: SCHEMA, salvato: null };
        var qualcosa = false;
        if (_pieno(stato.studioProfile)) { out.studioProfile = stato.studioProfile; qualcosa = true; }
        if (_pieno(stato.focusTopic)) { out.focusTopic = String(stato.focusTopic); qualcosa = true; }
        if (_pieno(stato.semanticGuidance)) { out.semanticGuidance = String(stato.semanticGuidance); qualcosa = true; }
        if (_pieno(db.timelineEvents)) { out.timelineEvents = db.timelineEvents; qualcosa = true; }
        if (_pieno(db.timelineAI)) { out.timelineAI = db.timelineAI; qualcosa = true; }
        if (_pieno(db.nodeSheet)) { out.nodeSheet = db.nodeSheet; qualcosa = true; }
        /* 0078: catena, copie e nodi fissati, solo se pieni — una mappa che
           non li ha non scrive un file per dirlo */
        if (cartellaCompleta()) {
            CAMPI_DB_COMPLETA.forEach(function (k) {
                if (_oggettoPieno(db[k])) { out[k] = db[k]; qualcosa = true; }
            });
            var fissati = _fissati(db.nodes);
            if (fissati.length) { out.pinned = fissati; qualcosa = true; }
        }
        return qualcosa ? out : null;
    }

    /* Dalla vista letta dal vault allo stato appena caricato. Ritorna l'elenco
       dei campi applicati (serve ai log e ai test, non alla UI). */
    function applica(stato, vista) {
        var applicati = [];
        if (!stato || !vista || typeof vista !== 'object') return applicati;
        /* schema sconosciuto = scritto da una MappAI più nuova: meglio non
           applicare niente che applicare a metà */
        if (vista.schema && vista.schema !== SCHEMA) return applicati;
        if (!stato.db || typeof stato.db !== 'object') stato.db = {};
        if (_pieno(vista.studioProfile)) { stato.studioProfile = vista.studioProfile; applicati.push('studioProfile'); }
        if (_pieno(vista.focusTopic)) { stato.focusTopic = String(vista.focusTopic); applicati.push('focusTopic'); }
        if (_pieno(vista.semanticGuidance)) { stato.semanticGuidance = String(vista.semanticGuidance); applicati.push('semanticGuidance'); }
        if (_pieno(vista.timelineEvents)) { stato.db.timelineEvents = vista.timelineEvents; applicati.push('timelineEvents'); }
        if (_pieno(vista.timelineAI)) { stato.db.timelineAI = vista.timelineAI; applicati.push('timelineAI'); }
        if (_pieno(vista.nodeSheet)) { stato.db.nodeSheet = vista.nodeSheet; applicati.push('nodeSheet'); }
        /* 0078: la stessa regola di fusione. `pinned` marca i nodi CHE CI SONO
           (per `String(id)`): va chiamata dopo che i nodi della cartella sono
           in `db`. Un id che non c'è si ignora, un nodo non elencato resta
           com'è; «pinned» è fra gli applicati solo se ha marcato qualcuno. */
        if (cartellaCompleta()) {
            CAMPI_DB_COMPLETA.forEach(function (k) {
                if (_oggettoPieno(vista[k])) { stato.db[k] = vista[k]; applicati.push(k); }
            });
            if (Array.isArray(vista.pinned) && vista.pinned.length) {
                var ids = Object.create(null);
                vista.pinned.forEach(function (id) { if (id != null) ids[String(id)] = true; });
                var marcati = 0;
                (Array.isArray(stato.db.nodes) ? stato.db.nodes : []).forEach(function (n) {
                    if (n && n.id != null && ids[String(n.id)] === true) { n.pinned = true; marcati++; }
                });
                if (marcati) applicati.push('pinned');
            }
        }
        return applicati;
    }

    /* ── LO STATO DI GENERAZIONE NON PASSA DA UNA MAPPA ALL'ALTRA (0078, §4.2) ──
       «Apri cartella» e le aperture da INSEGNA rifanno il `db` ma lasciavano in
       `appState` ciò che la generazione della mappa di PRIMA aveva scritto: la
       disciplina (che vince sulla materia del vault e finiva nell'`index.yaml`
       di questa mappa), il bollino «tarata», le pagine del PDF nelle citazioni,
       i rapporti, la guida semantica, le bozze della revisione, i consumi.
       `loadProject` non ha il problema: sostituisce tutto `appState`.
       La lista è UNA (inv. 6); chi apre da cartella chiama `azzeraGenerazione`
       PRIMA di leggere ciò che la cartella porta (consumi, vista, revisione),
       così quello vince. Valori di base dove chi legge li vuole così
       (`layoutMode`, `generationUsage`, `semanticGuidance`,
       `generationDiscipline`); gli altri campi si TOLGONO — e `generationTuned`
       con loro: con `false` la riga d'indice di questo progetto perderebbe il
       suo bollino, assente la si rilegge (mappai-storage-lang.js, `tuned`).
       Non tocca `db`, l'identità, le fonti, `focusTopic`, `studioProfile` né
       il manifesto: quelli li decide chi apre. Pura: l'interruttore lo
       controlla chi la chiama. */
    var CAMPI_GENERAZIONE = ['generationDiscipline', 'generationTuned', '_qualityReport', '_coverageReport',
        '_rerankerReport', '_judgeReport', '_giudiceReport', 'mmTriage', '_docOutline', 'semanticGuidance',
        'layoutMode', '_pdfPagine', '_reviewLocalDraft', '_reviewDiskDraft', '_reviewRequested', '_generationId',
        'generationUsage'];
    var BASE_GENERAZIONE = { layoutMode: 'default', generationUsage: null, semanticGuidance: '', generationDiscipline: '' };
    function azzeraGenerazione(stato) {
        if (!stato || typeof stato !== 'object') return stato;
        CAMPI_GENERAZIONE.forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(BASE_GENERAZIONE, k)) stato[k] = BASE_GENERAZIONE[k];
            else delete stato[k];
        });
        return stato;
    }

    /* ── IL CASSETTO TIENE SOLO CIÒ CHE NON È GIÀ SUL DISCO (0076, ADR 0018) ──
       Il progetto si salvava intero: dentro la copia di localStorage c'erano il
       manifesto della pipeline (la copia di `pipeline.json`), l'indice delle
       evidenze, i rapporti del giudice e la foto del dossier — misurato sui
       dossier veri del gate 0069: 650-1650 KB ciascuno, e il cassetto pieno.
       A interruttore acceso (`opts.snello`, lo passa `saveCurrentProject` con
       `mappai_cassetto_snello` = '1') e SOLO per un progetto con una cartella
       (senza cartella il cassetto è l'unica copia) la copia perde:
         · `_pipelineManifest`: lo rilegge dal disco `loadProject`, che lo
           sostituisce sempre. Al suo posto `_pipelineSegnale`
           { presente, revisione, stato } — MAI sotto la chiave del manifesto:
           la pipeline userebbe qualunque valore vero come manifesto;
         · `_evidenze`: nella cartella, e si rilegge (mappai-evidence.js);
         · la FONTE-FOTO il cui dossier è già PARTITO («fuori se già partita»,
           Giacomo, 05/10): scheda e foto sono in `pipeline.json` e in
           `Allegati/`. Una foto il cui dossier non è partito resta INTERA:
           nessun altro posto la tiene, e una scheda senza foto sarebbe «pronta»
           in CREA e farebbe un dossier senza foto.
       La regola: esce solo ciò che è sul disco E viene riletto. Restano quindi
       `_reviewRevision`, `_reviewCommit`, `db`, l'identità, i cinque rapporti
       del giudice (`qualita.json` si scrive e basta: nessuno lo rilegge —
       scelta di Giacomo, 05/10, «Restano») e il testo delle fonti
       (`sources[].content`, `_pdfPagine`, `_generationSources`: il §4.3 del
       packet non lo prova sul disco per ogni tipo di fonte).
       Lo stato vivo non si tocca mai: si cambia la copia, e solo nei rami che
       cambiano (l'oggetto in cima, l'elenco delle fonti). */
    function _riga(x) { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim(); }
    function _oggetto(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }

    /* La scheda di una fonte è quella del dossier partito? Stesso oggetto, oppure
       stessi `nomeFile` e `titolo`, tutti e due non vuoti, a spazi normalizzati —
       come `fontePerScheda` di CREA (mappai-crea-iconografica-core.js), che qui
       non si carica: la config di `Pipeline.run` è una copia JSON, l'identità da
       sola non regge. Più stretta di quella: niente ripiego sul solo nome del
       file. Nel dubbio la fonte resta. */
    function schedaPartita(scheda, dossier) {
        if (!_oggetto(scheda) || !_oggetto(dossier)) return false;
        if (scheda === dossier) return true;
        var nome = _riga(dossier.nomeFile), titolo = _riga(dossier.titolo);
        if (!nome || !titolo) return false;
        return _riga(scheda.nomeFile) === nome && _riga(scheda.titolo) === titolo;
    }

    function _segnale(m) {
        if (!_oggetto(m)) return { presente: false, revisione: null, stato: null };
        var r = _oggetto(m.review) ? m.review : null;
        return {
            presente: true,
            revisione: r ? (r.approvedRevision || r.baseRevision || null) : null,
            stato: (r && _oggetto(r.initial) && r.initial.status) || null
        };
    }

    /* Lo SNAPSHOT SNELLO (parte del medesimo lavoro): dopo il disegno D3 ogni
       arco porta dentro l'INTERO nodo di partenza e di arrivo, e il foglio in
       localStorage si gonfia (misurato: 120 KB di link per 8,8 KB di dati).
       Qui i link tornano coppie di id. Copia superficiale: lo stato vivo non
       si tocca. `opts.snello`: la regola del cassetto qui sopra (0076). */
    function statoSnello(stato, opts) {
        if (!stato) return stato;
        var db = stato.db || {};
        var links = (db.links || []).map(function (l) {
            var s = Object.assign({}, l);
            if (s.source && typeof s.source === 'object') s.source = s.source.id;
            if (s.target && typeof s.target === 'object') s.target = s.target.id;
            /* i campi che D3 rimette da sé a ogni disegno */
            delete s.index;
            return s;
        });
        /* anche i nodi si portano dietro le coordinate di lavoro di D3 (vx/vy,
           fx/fy null espliciti): innocue ma inutili — restano, toglierle
           cambierebbe il comportamento del pin. Si tolgono solo i link. */
        var out = Object.assign({}, stato, { db: Object.assign({}, db, { links: links }) });
        if (!(opts && opts.snello === true) || !stato.activeVaultPath) return out;

        var m = stato._pipelineManifest;
        /* una copia già snella (letta dal cassetto, senza la chiave del
           manifesto) tiene il segnale che ha; altrimenti il segnale lo dice il
           manifesto, anche quando è null («nessuna pipeline») */
        if (!('_pipelineManifest' in stato) && _oggetto(stato._pipelineSegnale)) out._pipelineSegnale = stato._pipelineSegnale;
        else out._pipelineSegnale = _segnale(m);
        delete out._pipelineManifest;
        delete out._evidenze;

        var dossier = _oggetto(m) && _oggetto(m.config) ? m.config.dossier : null;
        if (dossier && Array.isArray(stato.sources)) {
            out.sources = stato.sources.filter(function (x) {
                return !(x && _oggetto(x._scheda) && schedaPartita(x._scheda, dossier));
            });
        }
        return out;
    }

    /* La stessa regola su una copia GIÀ nel cassetto (letta e parsata da chi
       chiama): lì il manifesto è nella copia stessa. Per «Libera spazio». Un
       residuo (qui sotto) è già il minimo: si lascia com'è. */
    function snelloDaVoce(voce) {
        if (_oggetto(voce) && _oggetto(voce._residuo)) return voce;
        return statoSnello(voce, { snello: true });
    }

    /* ── IL RESIDUO (0076, B1 rivisto: Giacomo, 05/10, «1 · Residuo») ──────────
       A cassetto pieno, appena la cartella è stata scritta, al posto della copia
       vecchia va il residuo: la copia snella di ADESSO meno ciò che la cartella
       porta E il caricamento rilegge. Provati: i nodi e i collegamenti (la
       cartella è la verità della mappa, inv. 7; `load-vault` li restituisce, e
       `loadProject` li rimette a posto dal percorso esatto). Ogni altro campo di
       `db` (sourcesDict, studySets, colori, timeline…) resta: non è provato
       campo per campo che faccia il giro intero. Il segno `_residuo` dice da
       quale cartella ripescare la mappa, col percorso ESATTO (una cartella può
       stare fuori da `Mappe/`), e quando. Senza `opts.cartella` vale il
       percorso della copia. Non si modifica la copia ricevuta. */
    var CAMPI_DALLA_CARTELLA = ['nodes', 'links'];
    function residuo(copia, opts) {
        if (!_oggetto(copia)) return copia;
        var o = opts || {};
        var db = Object.assign({}, copia.db || {});
        CAMPI_DALLA_CARTELLA.forEach(function (k) { delete db[k]; });
        return Object.assign({}, copia, {
            db: db,
            _residuo: { cartella: o.cartella || copia.activeVaultPath || null, quando: o.quando || null }
        });
    }

    /* Il piano di «Libera spazio» (Cabina › Gestione cartelle): quali copie si
       snelliscono e quanto si libera, PRIMA di farlo. Solo i progetti la cui
       riga d'indice dichiara una cartella (`vault`) e non porta il segno
       «superata», e, se chi chiama sa quali cartelle esistono, solo quelle:
       `esiste(p, voce)` riceve la riga E la copia letta, così chi chiama decide
       sul PERCORSO della copia (`voce.activeVaultPath`), non su un nome (gate 3,
       05/10: un elenco di nomi di primo livello erano le classi). La copia senza
       `activeVaultPath` la lascia com'è `statoSnello`. `leggi(id)` = il testo
       nel cassetto (o null); `salta` = { id: 1 } delle copie che la potatura
       toglie comunque. Pesi in caratteri, come il conto della Cabina.
       → { voci: [{ id, nome, prima, dopo, testo }], byte } */
    function pianoLiberaSpazio(progetti, leggi, salta, esiste) {
        var voci = [], byte = 0;
        (Array.isArray(progetti) ? progetti : []).forEach(function (p) {
            if (!p || !p.id || !p.vault || (salta && salta[p.id])) return;
            /* una riga «superata» porta l'impronta della copia (la sua lunghezza):
               riscritta, la riapertura non la riconoscerebbe più — resta com'è */
            if (p.superata) return;
            var testo = null, voce = null;
            try { testo = leggi(p.id); voce = testo ? JSON.parse(testo) : null; } catch (e) { voce = null; }
            if (!_oggetto(voce)) return;
            if (typeof esiste === 'function' && !esiste(p, voce)) return;
            var nuovo = JSON.stringify(snelloDaVoce(voce));
            if (nuovo.length >= testo.length) return;
            voci.push({ id: p.id, nome: p.name || '', prima: testo.length, dopo: nuovo.length, testo: nuovo });
            byte += testo.length - nuovo.length;
        });
        return { voci: voci, byte: byte };
    }

    /* ── 0082 (ADR 0018, revisione 2): IL CASSETTO TIENE SOLO L'INDICE ──────────
       Con `mappai_cassetto_solo_indice` = '1' il salvataggio automatico scrive la
       cartella del progetto aperto e poi toglie la copia dal cassetto; «Riprendi»
       senza copia ritrova la cartella per id, per percorso, per posizione. Qui le
       regole pure; le monta `StorageManager` (mappai-storage-lang.js), che fa l'I/O.

       Il lettore UNICO dell'interruttore (inv. 6): spento di default (solo '1'
       accende), vale solo con `mappai_cartella_completa` acceso (la cartella deve
       saper ridare chat, Catena dei perché e copie dei documenti, 0078) e mai nel
       reader (`electronAPI.__studente`: lì la `saveVault` scrive solo la vista e
       non deve mai togliere una copia). Legge il `localStorage` e il `window` del
       luogo in cui gira; dove mancano (Node) o lanciano, vale spento: un difetto
       di lettura non deve togliere niente dal cassetto. */
    var CHIAVE_SOLO_INDICE = 'mappai_cassetto_solo_indice';
    function cassettoSoloIndice() {
        var v = null;
        try {
            if (typeof localStorage === 'undefined' || !localStorage || typeof localStorage.getItem !== 'function') return false;
            v = localStorage.getItem(CHIAVE_SOLO_INDICE);
        } catch (e) { return false; }
        if (v !== '1') return false;
        if (!cartellaCompleta()) return false;
        try {
            if (typeof window !== 'undefined' && window && window.electronAPI && window.electronAPI.__studente) return false;
        } catch (e) { return false; }
        return true;
    }

    /* La FIRMA delle chat del Tutor (B6 (a)): un testo corto che cambia a ogni modo
       in cui il Tutor cambia le sue chat — un messaggio nuovo (anche la risposta del
       modello, che allunga l'ultimo), un reset (storia vuotata, chat di nodo tolta),
       un cambio di modalità, una chat di nodo nuova anche vuota. Serve solo a
       SVEGLIARE il salvataggio della cartella prima del giro di 120 s: chi decide se
       la cartella è indietro confronta il testo intero (`cartellaIndietro`). Per la
       barra laterale e per ogni nodo (id in ordine, così l'ordine delle chiavi non
       conta): numero di messaggi, lunghezza del testo dell'ultimo, modalità. Niente
       `JSON.stringify` della storia: la si legge ogni 5 s. Il composto passa da due
       FNV-1a a 32 bit, così la firma resta corta anche con cento chat di nodo; una
       collisione ritarda la scrittura al giro di 120 s, non la perde. Uno stato
       assente o malformato dà la firma del vuoto. */
    function _lunghezzaMessaggio(m) {
        if (!m || typeof m !== 'object') return 0;
        if (Array.isArray(m.parts)) {
            var n = 0;
            for (var i = 0; i < m.parts.length; i++) {
                var p = m.parts[i];
                if (p && typeof p.text === 'string') n += p.text.length;
            }
            return n;
        }
        return typeof m.text === 'string' ? m.text.length : 0;
    }
    function _firmaDiUnaChat(c) {
        var h = (c && typeof c === 'object' && Array.isArray(c.history)) ? c.history : [];
        var modo = (c && typeof c === 'object' && c.mode != null) ? String(c.mode) : '';
        return h.length + '.' + (h.length ? _lunghezzaMessaggio(h[h.length - 1]) : 0) + '.' + modo;
    }
    function _fnv(s, seme) {
        var h = seme >>> 0;
        for (var i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return ('0000000' + h.toString(16)).slice(-8);
    }
    function firmaChat(stato) {
        var st = _oggetto(stato) ? stato : {};
        var parti = ['S' + _firmaDiUnaChat(_oggetto(st.sidebar) ? st.sidebar : null)];
        var nodi = _oggetto(st.nodes) ? st.nodes : {};
        var ids = Object.keys(nodi).sort();
        for (var i = 0; i < ids.length; i++) parti.push(ids[i] + '=' + _firmaDiUnaChat(nodi[ids[i]]));
        var tutto = parti.join('|');
        return ids.length + ':' + _fnv(tutto, 2166136261) + _fnv(tutto, 0x811c9dc5 ^ 0x5bd1e995);
    }

    /* La cartella è INDIETRO rispetto allo stato vivo? Sul TESTO della copia e su
       quello delle chat dell'ultima scrittura riuscita (l'impronta), mai sulla
       presenza della copia nel cassetto: una copia rimasta non deve far riscrivere
       la cartella a ogni giro. Senza impronta (dopo un riavvio, o un altro
       progetto) è indietro: la prima scrittura si fa comunque. */
    function cartellaIndietro(impronta, id, testoCopia, testoChat) {
        if (!_oggetto(impronta) || impronta.id !== id) return true;
        return testoCopia !== impronta.copia || testoChat !== impronta.chat;
    }

    /* `_scrivi` può NON rimettere la copia nel cassetto solo se la copia lì non c'è
       (è uscita dopo una scrittura della cartella), l'impronta è di questo progetto
       e il testo è proprio quello scritto nella cartella. Una copia vecchia rimasta
       nel cassetto si riscrive sempre: altrimenti «Riprendi» riaprirebbe quella. */
    function saltaCopia(impronta, id, testo, copiaNelCassetto) {
        return copiaNelCassetto === null && _oggetto(impronta) && impronta.id === id && testo === impronta.copia;
    }

    /* Il salvataggio automatico scrive solo una cartella che ha `index.yaml` (la
       `saveVault` creerebbe la cartella che manca: una riga rovinata scriverebbe la
       mappa dentro la cartella di una classe) e che non dichiara un altro progetto
       (inv. 20, ADR 0013). `idLetto` = l'id valido della riga `projectId:` in
       colonna 0, o '' (`MappAIDocumentiCore.idDaIndice`). */
    function cartellaScrivibile(esiste, idLetto, id) {
        return !!esiste && (!idLetto || idLetto === id);
    }

    /* La copia si toglie dal cassetto solo se la cartella sa ridare tutto quello
       che la copia porta (inv. 13: niente si perde per strada). Le condizioni, nel
       loro ordine, ognuna col suo motivo (per il registro):
         progetto       — il progetto aperto e il suo percorso sono quelli scritti;
         nessuna-copia  — non c'era una copia quando la scrittura è partita;
         copia-cambiata — la copia di adesso non è quella di T0 (più nuova, o tolta);
         id             — la cartella dichiara l'id (letto o appena scritto);
         fonti          — `Fonti/fonti.json` c'è, o non ci sono fonti in memoria;
         set            — nessun set della mappa resta fuori dalla cartella;
         bozze          — nessuna bozza della revisione docente.
       → { togli, motivo } */
    function copiaDaTogliere(o) {
        var x = _oggetto(o) ? o : {};
        if (!x.stessoProgetto) return { togli: false, motivo: 'progetto' };
        if (x.copiaT0 == null) return { togli: false, motivo: 'nessuna-copia' };
        if (x.copiaOra !== x.copiaT0) return { togli: false, motivo: 'copia-cambiata' };
        if (!x.idConfermato) return { togli: false, motivo: 'id' };
        if (!x.fontiOk) return { togli: false, motivo: 'fonti' };
        if (x.setsFuori === true || Number(x.setsFuori) > 0) return { togli: false, motivo: 'set' };
        if (x.bozze) return { togli: false, motivo: 'bozze' };
        return { togli: true, motivo: null };
    }

    /* Il campo `cartella` della riga d'indice: il percorso della cartella del
       progetto RELATIVO alla radice dei file quando ci sta dentro (DAL Protocol,
       inv. 7), intero quando sta fuori (Analisi, Scrivania) o la radice è ignota.
       I confronti sulla stessa forma (trappola 50): `\` diventa `/` sui due lati, e
       la radice vale solo come cartella intera (un prefisso «…fileX» non è dentro
       «…file»). */
    function _barre(s) { return String(s).replace(/\\/g, '/'); }
    function percorsoRiga(full, rootDir) {
        if (full == null || String(full) === '') return null;
        if (rootDir == null || String(rootDir) === '') return String(full);
        var f = _barre(full), r = _barre(rootDir).replace(/\/+$/, '');
        if (r && f.indexOf(r + '/') === 0) {
            var rel = f.slice(r.length + 1).replace(/^\/+|\/+$/g, '');
            if (rel) return rel;
        }
        return String(full);
    }
    /* Il ritorno: un percorso intero (che comincia con `/`, `\` o una lettera di
       unità) resta com'è; uno relativo si appoggia alla radice. Un relativo senza
       radice, o che risale (`..`), non porta da nessuna parte: null. */
    function percorsoDaRiga(cartella, rootDir) {
        if (cartella == null) return null;
        var c = String(cartella);
        if (!c) return null;
        if (/^[\\/]/.test(c) || /^[A-Za-z]:[\\/]/.test(c)) return c;
        var segs = _barre(c).split('/').filter(Boolean);
        if (!segs.length || segs.some(function (s) { return s === '..'; })) return null;
        if (rootDir == null || String(rootDir) === '') return null;
        var r = String(rootDir).replace(/[\\/]+$/, '');
        return r + '/' + segs.join('/');
    }

    /* §4.9 — `qualita.json` non si svuota. `R.persistQuality` riscrive il file coi
       rapporti in memoria; dopo un'apertura dalla cartella sono azzerati
       (`azzeraGenerazione`) e il file perdeva ancora, copertura, giudice e reranker.
       Un rapporto che in memoria è null o assente prende il valore del file, solo
       se il file è un oggetto JSON con lo stesso `schema`; uno presente in memoria
       vince sempre. Un file che manca, illeggibile o di un altro schema non aggiunge
       niente (e non blocca la scrittura: chi chiama scrive comunque). Non muta
       `dati`: restituisce una copia. Vale sempre, anche a interruttore spento
       (decisione di Giacomo, 07/10). */
    var RAPPORTI_QUALITA = ['ancora', 'copertura', 'giudice', 'reranker'];
    function unisciQualita(testoFile, dati) {
        if (!_oggetto(dati)) return dati;
        var out = Object.assign({}, dati);
        var f = null;
        try { f = (typeof testoFile === 'string' && testoFile) ? JSON.parse(testoFile) : null; } catch (e) { f = null; }
        if (!_oggetto(f) || !dati.schema || f.schema !== dati.schema) return out;
        /* i rapporti appartengono a una GENERAZIONE: quelli di un'altra non entrano
           (revisione avversaria, 07/10). Senza generazione in memoria (dopo
           un'apertura dalla cartella `_generationId` è azzerato) si tengono quella
           del file e il suo modello, così i rapporti non restano senza la loro. */
        if (f.generationId != null && out.generationId != null && f.generationId !== out.generationId) return out;
        if (out.generationId == null && f.generationId != null) out.generationId = f.generationId;
        if (!out.modello && f.modello) out.modello = f.modello;
        RAPPORTI_QUALITA.forEach(function (k) {
            if (out[k] == null && f[k] != null) out[k] = f[k];
        });
        return out;
    }

    /* Le FONTI che la cartella sa ridare (revisione avversaria, 07/10): non basta che
       `Fonti/fonti.json` esista. Ogni fonte in memoria (chi chiama passa solo quelle
       che l'indice scrive: `MappAIFontiCore.vociScrivibili`, fuori quelle di
       `Allegati/`) deve starci per `id`, e una fonte col testo — più di 40 caratteri,
       la soglia oltre cui `salvaIndiceFonti` scrive il `.txt` — col suo `testoRel`.
       Un «Aggiungi PDF» il cui indice non si è riscritto lascerebbe la fonte solo
       nella copia. Senza fonti in memoria è vero; senza indice, o illeggibile, falso. */
    function fontiCoperte(testoIndice, fonti) {
        var lista = Array.isArray(fonti) ? fonti.filter(Boolean) : [];
        if (!lista.length) return true;
        var idx = null;
        try { idx = (typeof testoIndice === 'string' && testoIndice) ? JSON.parse(testoIndice) : null; } catch (e) { idx = null; }
        if (!_oggetto(idx) || !Array.isArray(idx.fonti)) return false;
        var perId = {};
        idx.fonti.forEach(function (v) { if (_oggetto(v) && v.id != null && String(v.id) !== '') perId[String(v.id)] = v; });
        return lista.every(function (s) {
            if (s.id == null || String(s.id) === '') return false;
            var v = perId[String(s.id)];
            if (!v) return false;
            if (String(s.content == null ? '' : s.content).length > 40 && !v.testoRel) return false;
            return true;
        });
    }

    return {
        SCHEMA: SCHEMA, raccogli: raccogli, applica: applica, statoSnello: statoSnello,
        snelloDaVoce: snelloDaVoce, schedaPartita: schedaPartita, pianoLiberaSpazio: pianoLiberaSpazio,
        residuo: residuo, CAMPI_DALLA_CARTELLA: CAMPI_DALLA_CARTELLA,
        cartellaCompleta: cartellaCompleta, azzeraGenerazione: azzeraGenerazione, CAMPI_GENERAZIONE: CAMPI_GENERAZIONE,
        cassettoSoloIndice: cassettoSoloIndice, firmaChat: firmaChat, cartellaIndietro: cartellaIndietro,
        saltaCopia: saltaCopia, cartellaScrivibile: cartellaScrivibile, copiaDaTogliere: copiaDaTogliere,
        percorsoRiga: percorsoRiga, percorsoDaRiga: percorsoDaRiga, unisciQualita: unisciQualita,
        fontiCoperte: fontiCoperte
    };
}));
