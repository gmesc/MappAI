/* =========================================================================
   mappai-visione.js — ANALIZZARE UNA FONTE ICONOGRAFICA, il gesto (20/8/26)

   Sceglie una fotografia, la fa analizzare a GEMINI (via `fetchModelAPI`: la
   stessa chiave, la stessa taratura, gli stessi consumi del resto dell'app) e
   apre la SCHEDA DI ANALISI a quattro blocchi — carta d'identità · che cosa si
   vede · che cosa vuole ottenere · che cosa prova — tutta modificabile.
   Da lì il dossier e i materiali (vedi `mappai-material-pipeline.js`).

   (20/8 sera: il motore locale Ollama della prima stesura è stato TOLTO —
   restava un programma da installare e accendere a mano, e Gemini è già
   configurato e legge meglio. Con lui sono usciti i due IPC e la riga della
   Cabina. Resta `immagine-prepara`: l'HEIC Gemini lo accetta, ma Chromium non
   lo decodifica, e la foto va mostrata e incorporata.)

   ⚠️ LA SCHEDA NON È UN PASSAGGIO BUROCRATICO. Un modello di visione descrive
   bene e contestualizza male: i blocchi interpretativi sono ipotesi da
   correggere, e la regola dell'appiglio (core) scarta le affermazioni non
   ancorate a un elemento visibile. Vedi la testata di `mappai-visione-core.js`.

   ⚠️ Invariante 9, dichiarato: la lettura passa SOLO da Google. Su Infomaniak
   la visione non è documentata per i modelli in listino: il gesto lo dice
   («scegli il provider Google»), non fallisce a metà.
   ========================================================================= */
(function () {
    'use strict';
    /* Trappola 22: un modulo caricato due volte tiene due copie del suo stato —
       qui vorrebbe dire due schede correnti, e la generazione userebbe quella
       sbagliata. */
    if (window.MappAIVisione) return;

    var t = function (k, f) { return window.t ? window.t(k, f) : f; };
    function MM() { return window.MappAIModal; }
    function CORE() { return window.MappAIVisioneCore; }
    function API() { return window.electronAPI; }
    function toast(m, tipo) { if (window.showToast) window.showToast(m, tipo || 'info'); }
    function _st() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }

    var LS_ON = 'mappai_visione';
    function attivo() {
        try { return localStorage.getItem(LS_ON) !== '0'; } catch (e) { return true; }
    }
    /* Solo Google: la visione su Infomaniak non è documentata, e promettere una
       strada non misurata è il modo di scoprirla rotta in classe. */
    function provaProvider() {
        var s = _st() || {};
        if ((s.aiProvider || 'google') !== 'google') return 'provider infomaniak non supportato';
        if (window.getSystemKey && !window.getSystemKey()) return 'api key mancante';
        return '';
    }

    /* ── LA SCELTA DEL FILE ───────────────────────────────────────────────────
       Un input nascosto, creato al volo e buttato via: uno riusato conserva il
       file di prima, e scegliere due volte la stessa foto non scatenerebbe
       `change`. */
    function scegli() {
        return new Promise(function (risolvi) {
            var C = CORE();
            var inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = C.ESTENSIONI.join(',');
            inp.style.display = 'none';
            document.body.appendChild(inp);
            var chiuso = false;
            function fine(f) {
                if (chiuso) return; chiuso = true;
                try { document.body.removeChild(inp); } catch (e) { /* già via */ }
                risolvi(f || null);
            }
            inp.addEventListener('change', function () { fine(inp.files && inp.files[0]); });
            /* Se l'utente annulla il dialogo nativo, `change` non scatta mai:
               senza questa rete la Promise resterebbe appesa per sempre. */
            window.addEventListener('focus', function riprendi() {
                window.removeEventListener('focus', riprendi);
                setTimeout(function () { if (!inp.files || !inp.files.length) fine(null); }, 700);
            });
            inp.click();
        });
    }

    /* ── LA PREPARAZIONE ──────────────────────────────────────────────────────
       Due copie della stessa foto, e non è uno spreco: quella per il MODELLO è
       grande e in PNG, quella per i DOCUMENTI è piccola e in JPEG — perché il
       documento incorporato vive anche in `localStorage`, che ha una quota.
       Le misure le dice il core. Senza Electron (`immagine-prepara` assente)
       jpg e png si leggono dal File stesso; l'HEIC dice perché no. */
    function _prepara(file, percorso, quale) {
        var C = CORE(), api = API();
        if (api && api.immaginePrepara && percorso) {
            return api.immaginePrepara({ path: percorso, quale: quale }).then(function (p) {
                if (!p || !p.ok) throw new Error((p && p.motivo) || 'preparazione-fallita');
                return { base64: p.base64, mime: p.mime };
            });
        }
        if (C.serveConversione(file.name)) return Promise.reject(new Error('conversione-non-disponibile'));
        return file.arrayBuffer().then(function (buf) {
            var bytes = new Uint8Array(buf), bin = '';
            for (var i = 0; i < bytes.length; i += 0x8000) {
                bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
            }
            return { base64: btoa(bin), mime: C.mimeDi(file.name) };
        });
    }

    /* ── LA LETTURA: una chiamata a Gemini ────────────────────────────────────
       `inlineData` accanto al prompt è la forma nativa che `fetchModelAPI` già
       manda. Passare dal choke point dà gratis tre cose: i consumi nel
       registro, la taratura della classe, il backoff del provider.
       ⚠️ NIENTE responseSchema: la griglia è annidata e i guasti degli schema
       sui modelli sono già costati (risposta vuota su Kimi, §CLAUDE.md). La
       forma la impone `normalizzaAnalisi`, che sa anche perdonare. */
    function leggi(file, opts) {
        opts = opts || {};
        var C = CORE();
        if (!C) return Promise.reject(new Error('core-mancante'));
        var male = provaProvider();
        if (male) return Promise.reject(new Error(male));
        if (!window.fetchModelAPI || !window.getSystemKey) return Promise.reject(new Error('rete'));

        var api = API();
        var percorso = (api && api.getPathForFile ? api.getPathForFile(file) : file.path) || '';
        var scheda = { titolo: C.titoloDaNome(file.name), nomeFile: file.name, fotoB64: '', mime: 'image/jpeg' };

        if (window.MappAIUsage && window.MappAIUsage.setContext) {
            window.MappAIUsage.setContext('pipeline', 'visione');
        }
        return _prepara(file, percorso, 'lettura')
            .then(function (p) {
                var payload = {
                    contents: [{ parts: [
                        { inlineData: { mimeType: p.mime, data: p.base64 } },
                        { text: C.promptAnalisi({ nome: file.name, notaDocente: opts.nota || '' }) }
                    ] }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: C.MAX_TOKEN_ANALISI }
                };
                if (window.injectClassTuning) payload = window.injectClassTuning(payload);
                return window.fetchModelAPI(payload, window.getSystemKey());
            })
            .then(function (resp) {
                var raw = resp && resp.candidates && resp.candidates[0] &&
                    resp.candidates[0].content && resp.candidates[0].content.parts &&
                    resp.candidates[0].content.parts[0] && resp.candidates[0].content.parts[0].text || '';
                if (!raw.trim()) throw new Error('risposta vuota, finishReason ' +
                    ((resp && resp.candidates && resp.candidates[0] && resp.candidates[0].finishReason) || '?'));
                var a = C.normalizzaAnalisi(raw, window.salvageTruncatedJSON);
                C.BLOCCHI.forEach(function (bl) { scheda[bl.id] = a[bl.id]; });
                /* La copia per i documenti si prepara ORA, non al momento di
                   generare: lì saremmo dentro il lucchetto della pipeline. */
                return _prepara(file, percorso, 'foglio').then(function (f) {
                    scheda.fotoB64 = f.base64; scheda.mime = f.mime;
                    return scheda;
                }, function () {
                    /* una foto che non si riduce non fa fallire l'analisi:
                       resta una scheda senza immagine, meno buona ma non niente */
                    return scheda;
                });
            });
    }

    /* ── LA SCHEDA, DA CORREGGERE ─────────────────────────────────────────────
       Quattro sezioni, una per blocco, coi campi della GRIGLIA (fonte unica:
       `BLOCCHI` del core). L'anteprima si inietta in `suApertura` perché il
       motore ESCAPA il testo delle sezioni (trappola 23). */
    function apriScheda(scheda) {
        var C = CORE(), M = MM();
        if (!M) { toast(t('cq_no_motore', 'Il motore dei modali non è caricato.'), 'warning'); return Promise.resolve(null); }

        var NOTE = {
            identita: t('vs_b_id_d', 'Che cos\'è, materialmente. Correggi quello che il modello ha sbagliato o non ha visto.'),
            osservazione: t('vs_b_oss_d', 'Solo ciò che si VEDE. Sui fogli degli allievi non compare: sarebbe la risposta a metà delle domande — va nelle tue tracce.'),
            interpretazione: t('vs_b_int_d', 'IPOTESI del modello, non fatti: ogni riga deve citare l\'elemento visivo che la giustifica («— lo dice…»). Le righe senza appiglio sono state scartate. Correggi: è quello che le domande daranno per vero.'),
            critica: t('vs_b_cri_d', 'Che cosa questa fonte DIMOSTRA (le intenzioni di chi l\'ha fatta) e che cosa tace. È la parte che trasforma un\'immagine in una fonte.')
        };

        function sezioni(v) {
            return C.BLOCCHI.map(function (bl) {
                return {
                    id: bl.id, titolo: bl.titolo, testo: NOTE[bl.id] || '',
                    collassabile: true, chiusa: bl.id === 'osservazione',
                    campi: bl.campi.map(function (c) {
                        var chiave = bl.id + '.' + c.id;
                        var val = (v && v[chiave] != null) ? v[chiave]
                            : ((scheda[bl.id] || {})[c.id] || '');
                        /* i campi lunghi respirano in un'area; i corti restano campi */
                        var lungo = ['descrizione', 'testo', 'iconografia', 'linguaggioVisivo',
                            'strategie', 'prova', 'tace', 'linguaggio'].indexOf(c.id) >= 0;
                        return { id: chiave, tipo: lungo ? 'area' : undefined, etichetta: c.et, valore: val };
                    })
                };
            });
        }

        return M.open({
            titolo: t('vs_scheda_t', 'La fonte, prima di generare'), icona: 'image', taglia: 'l', invio: false,
            sezioni: [{
                id: 'chi', titolo: '', nuda: true,
                campi: [{ id: 'titolo', etichetta: t('vs_titolo', 'Titolo della fonte'), valore: scheda.titolo || '' }]
            }].concat(sezioni(null)),
            suApertura: function (box) { _mostraFoto(box, scheda); },
            azioni: [
                { id: 'annulla', etichetta: t('mm_annulla', 'Annulla') },
                { id: 'ok', etichetta: t('vs_usa', 'Usa questa fonte'), icona: 'check', ruolo: 'primario' }
            ]
        }).then(function (r) {
            if (!r || r.azione !== 'ok') return null;
            var v = r.valori || {};
            var fatta = { titolo: String(v.titolo || scheda.titolo || '').trim(),
                nomeFile: scheda.nomeFile, fotoB64: scheda.fotoB64, mime: scheda.mime };
            C.BLOCCHI.forEach(function (bl) {
                fatta[bl.id] = {};
                bl.campi.forEach(function (c) {
                    fatta[bl.id][c.id] = String(v[bl.id + '.' + c.id] || '').trim();
                });
            });
            if (!C.schedaPronta(fatta)) {
                toast(t('vs_troppo_poco', 'Serve almeno qualche riga di analisi: è il materiale da cui nascono i documenti.'), 'warning');
                return apriScheda(fatta);
            }
            /* La scheda confermata resta in mano al modulo: chi genera prima le
               domande aperte e poi le flashcard dalla stessa foto non paga due
               letture né corregge due volte («Dalla stessa immagine»). */
            _scheda = fatta;
            return fatta;
        });
    }
    var _scheda = null;
    function schedaCorrente() { return _scheda; }
    function scordaScheda() { _scheda = null; }

    /* ── MM/KG E IL TEMA SI SPENGONO CON UNA FOTO FRA LE FONTI (20/8) ─────────
       Con una fonte iconografica non c'è una mappa da impostare: il prodotto è
       il DOSSIER, e il suo titolo viene dalla SCHEDA. Lasciare vivi il
       selettore del genere e il campo del tema prometterebbe una scelta che la
       generazione poi ignora — comandi inerti, peggio che assenti (inv. 21).
       Si ricalcola DAI DATI a ogni chiamata (fonti aggiunte e tolte), come i
       passi della vista ridotta: niente stato da tenere allineato. */
    function _fotoPresente() {
        var s = _st() || {};
        return ((s.sources) || []).some(function (x) { return x && x._scheda; });
    }
    function sincronizzaGenere() {
        var giu = _fotoPresente();
        var perche = t('vs_mappa_no', 'Con una fonte iconografica si genera il DOSSIER: la mappa e il tema non servono — il titolo viene dalla scheda.');
        ['mode-mindmap', 'mode-kg'].forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.style.pointerEvents = giu ? 'none' : '';
            el.style.opacity = giu ? '0.4' : '';
            el.setAttribute('aria-disabled', giu ? 'true' : 'false');
            if (giu) el.setAttribute('title', perche); else el.removeAttribute('title');
        });
        var root = document.getElementById('root-node-name');
        if (root) {
            root.disabled = giu;
            root.style.opacity = giu ? '0.4' : '';
            if (giu) root.setAttribute('title', perche); else root.removeAttribute('title');
        }
    }

    /* L'anteprima dentro il modale: prima della prima sezione, così la foto si
       guarda mentre si correggono i campi che la riguardano. */
    function _mostraFoto(box, scheda) {
        if (!scheda || !scheda.fotoB64) return;
        try {
            var corpo = box.querySelector('.mm-body');
            if (!corpo) return;
            var w = document.createElement('div');
            w.style.cssText = 'text-align:center; margin-bottom:14px;';
            var img = document.createElement('img');
            img.src = 'data:' + (scheda.mime || 'image/jpeg') + ';base64,' + scheda.fotoB64;
            img.alt = scheda.titolo || '';
            img.style.cssText = 'max-width:100%; max-height:260px; border-radius:10px; display:inline-block;';
            w.appendChild(img);
            corpo.insertBefore(w, corpo.firstChild);
        } catch (e) { /* senza anteprima la scheda funziona lo stesso */ }
    }

    /* ── IL GESTO INTERO ──────────────────────────────────────────────────────
       Scegli → analizza (col velo) → correggi → torna la scheda. `null` a ogni
       passo in cui l'utente si tira indietro. Con un `file` già in mano (le
       fonti di CREA) il picker si salta. */
    function nuovaScheda(fileGia) {
        var C = CORE();
        if (!attivo()) return Promise.resolve(null);
        if (!C) { toast(t('vs_no_core', 'Il lettore di immagini non è caricato.'), 'warning'); return Promise.resolve(null); }
        var male = provaProvider();
        if (male) {
            var d0 = C.diagnosi(male);
            toast(d0.messaggio + ' ' + d0.rimedio, 'warning');
            return Promise.resolve(null);
        }
        var presa = fileGia ? Promise.resolve(fileGia) : scegli();
        return presa.then(function (file) {
            if (!file) return null;
            if (!C.accetta(file.name)) {
                toast(t('vs_formato', 'Formato non gestito: servono JPG, PNG o HEIC.'), 'warning');
                return null;
            }
            var abbandonata = false;
            if (window.showLoadingOverlay) {
                window.showLoadingOverlay(true,
                    t('vs_leggo', 'Analizzo la fonte con l\'AI… qualche secondo.'),
                    'default', '', function () { abbandonata = true; });
            }
            return leggi(file).then(function (scheda) {
                if (window.showLoadingOverlay) window.showLoadingOverlay(false);
                /* «Annulla» abbandona l'ATTESA: una richiesta già partita non si
                   richiama indietro — il risultato arriva e si butta. */
                if (abbandonata) return null;
                return apriScheda(scheda);
            }, function (err) {
                if (window.showLoadingOverlay) window.showLoadingOverlay(false);
                if (abbandonata) return null;
                var d = C.diagnosi(err);
                toast(d.messaggio + ' ' + d.rimedio, 'error');
                return null;
            });
        });
    }

    window.MappAIVisione = {
        attivo: attivo,
        provaProvider: provaProvider,
        nuovaScheda: nuovaScheda,
        apriScheda: apriScheda,
        schedaCorrente: schedaCorrente,
        scordaScheda: scordaScheda,
        sincronizzaGenere: sincronizzaGenere,
        leggi: leggi
    };
    console.log('[MappAI] mappai-visione.js caricato ✓');
})();
