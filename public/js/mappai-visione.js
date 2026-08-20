/* =========================================================================
   mappai-visione.js — LEGGERE UN'IMMAGINE, il gesto (20/8/26)

   Sceglie una fotografia, la fa leggere al motore locale (Ollama + un modello
   VL) e apre la SCHEDA DELLA FONTE: titolo · contesto · descrizione, tutti e
   tre modificabili. Da lì il materiale va a `Pipeline.generaSet` come sorgente
   esplicita, e ne escono le domande aperte per angolo o le flashcard.

   ⚠️ LA SCHEDA NON È UN PASSAGGIO BUROCRATICO. Un modello di visione descrive
   bene e contestualizza male: su una miniatura può inventare una data, e quella
   data diventa la premessa di sette verifiche. Il campo «contesto» esiste
   perché il docente di storia lo riscriva — è lui a saperlo. Vedi la testata di
   `mappai-visione-core.js`.

   ⚠️ UNA LETTURA, PIÙ GENERI. La scheda confermata resta qui finché non si
   cambia immagine: chi genera prima le domande aperte e poi le flashcard dalla
   stessa foto non paga due letture né corregge due volte il contesto.

   Le regole (formati, misure, prompt, diagnosi) stanno nel core; l'I/O negli
   IPC di main.js. Qui c'è il gesto e basta.
   ========================================================================= */
(function () {
    'use strict';
    /* Trappola 22: un modulo caricato due volte tiene due copie del suo stato —
       qui vorrebbe dire due schede correnti, e la seconda generazione userebbe
       quella sbagliata. */
    if (window.MappAIVisione) return;

    var t = function (k, f) { return window.t ? window.t(k, f) : f; };
    function MM() { return window.MappAIModal; }
    function CORE() { return window.MappAIVisioneCore; }
    function API() { return window.electronAPI; }
    function toast(m, tipo) { if (window.showToast) window.showToast(m, tipo || 'info'); }

    var LS_MODELLO = 'mappai_visione_model';
    var LS_HOST = 'mappai_visione_host';
    var LS_ON = 'mappai_visione';

    function attivo() {
        try { return localStorage.getItem(LS_ON) !== '0'; } catch (e) { return true; }
    }
    function modello() {
        try { return localStorage.getItem(LS_MODELLO) || CORE().MODELLO_DEF; }
        catch (e) { return CORE().MODELLO_DEF; }
    }
    function host() {
        try { return localStorage.getItem(LS_HOST) || CORE().HOST_DEF; }
        catch (e) { return CORE().HOST_DEF; }
    }

    /* ── IL MOTORE RISPONDE? ──────────────────────────────────────────────────
       La risposta si tiene per mezzo minuto: serve a DECIDERE che cosa mostrare
       (un passo, un avviso), e chiederlo a ogni ridisegno farebbe pagare a ogni
       apertura di modale un giro di rete. */
    var _stato = null, _statoQuando = 0;
    var VITA_STATO = 30000;
    function disponibile(forza) {
        var ora = Date.now();
        if (!forza && _stato && (ora - _statoQuando) < VITA_STATO) return Promise.resolve(_stato);
        var api = API();
        if (!api || !api.visioneLocaleStato) {
            _stato = { acceso: false, modelli: [], senzaIpc: true }; _statoQuando = ora;
            return Promise.resolve(_stato);
        }
        return api.visioneLocaleStato({ host: host() }).then(function (r) {
            _stato = { acceso: !!(r && r.acceso), modelli: (r && r.modelli) || [], senzaIpc: false };
            _statoQuando = Date.now();
            return _stato;
        }, function () {
            _stato = { acceso: false, modelli: [], senzaIpc: false }; _statoQuando = Date.now();
            return _stato;
        });
    }
    /* Il modello scelto è fra quelli installati? La domanda si fa PRIMA di
       spendere una lettura: `ollama` risponde 404 dopo aver caricato l'immagine,
       e quel giro è tempo buttato. Il confronto ignora il `:latest` che Ollama
       aggiunge da sé ai nomi senza tag. */
    function modelloPresente(st) {
        var m = String(modello() || '').toLowerCase();
        var base = m.split(':')[0];
        return ((st && st.modelli) || []).some(function (x) {
            var n = String(x || '').toLowerCase();
            return n === m || n.split(':')[0] === base;
        });
    }

    /* ── LA SCELTA DEL FILE ───────────────────────────────────────────────────
       Un input nascosto, creato al volo e buttato via: non c'è una superficie
       dove tenerlo, e uno riusato conserva il file di prima (scegliere due volte
       la stessa foto non scatenerebbe `change`). */
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
               senza questa rete la Promise resterebbe appesa per sempre e il
               gesto successivo non partirebbe più. */
            window.addEventListener('focus', function riprendi() {
                window.removeEventListener('focus', riprendi);
                setTimeout(function () { if (!inp.files || !inp.files.length) fine(null); }, 700);
            });
            inp.click();
        });
    }

    /* ── LA LETTURA ───────────────────────────────────────────────────────────
       Due preparazioni della stessa foto, e non è uno spreco: quella per il
       MODELLO è grande e in PNG, quella per il FOGLIO è piccola e in JPEG —
       perché sette angoli portano sette copie della stessa immagine dentro
       l'archivio, che è `localStorage`. Le misure le dice il core. */
    function leggi(file, opts) {
        opts = opts || {};
        var C = CORE(), api = API();
        if (!C) return Promise.reject(new Error('core-mancante'));
        if (!api || !api.immaginePrepara || !api.visioneLocale) return Promise.reject(new Error('conversione-non-disponibile'));

        var percorso = (api.getPathForFile ? api.getPathForFile(file) : file.path) || '';
        if (!percorso) return Promise.reject(new Error('percorso-mancante'));

        var titolo = C.titoloDaNome(file.name);
        var scheda = { titolo: titolo, contesto: '', descrizione: '', fotoB64: '', mime: 'image/jpeg', nomeFile: file.name };

        return api.immaginePrepara({ path: percorso, quale: 'lettura' })
            .then(function (p) {
                if (!p || !p.ok) throw new Error((p && p.motivo) || 'preparazione-fallita');
                return api.visioneLocale({
                    base64: p.base64, prompt: C.promptLettura({ nome: file.name, notaDocente: opts.nota || '' }),
                    model: modello(), host: host(), timeoutMs: C.TIMEOUT_DEF
                });
            })
            .then(function (r) {
                if (!r || !r.ok) throw new Error((r && r.motivo) || 'lettura-fallita');
                var n = C.normalizzaLettura(r.testo, window.salvageTruncatedJSON);
                scheda.descrizione = n.descrizione;
                scheda.contesto = n.contesto;
                /* La copia per il foglio si prepara ORA, non al momento di
                   generare: lì saremmo dentro il lucchetto della pipeline, e un
                   secondo giro di conversione allungherebbe un'attesa che il
                   docente sta già guardando. */
                return api.immaginePrepara({ path: percorso, quale: 'foglio' });
            })
            .then(function (f) {
                if (f && f.ok) { scheda.fotoB64 = f.base64; scheda.mime = f.mime; }
                /* ⚠️ Una foto che non si lascia ridurre NON fa fallire la
                   lettura: resta un foglio col contesto e senza immagine, che è
                   meno buono ma non è niente. */
                return scheda;
            });
    }

    /* ── LA SCHEDA, DA CORREGGERE ─────────────────────────────────────────────
       Tre campi e un'immagine. L'anteprima si inietta in `suApertura` perché il
       motore ESCAPA il testo delle sezioni (trappola 23): un `<img>` scritto in
       `testo` si leggerebbe come tag a schermo. */
    function apriScheda(scheda) {
        var C = CORE(), M = MM();
        if (!M) { toast(t('cq_no_motore', 'Il motore dei modali non è caricato.'), 'warning'); return Promise.resolve(null); }
        var incerto = !String(scheda.contesto || '').trim();

        function schema(v) {
            return {
                titolo: t('vs_scheda_t', 'La fonte, prima di generare'), icona: 'image', taglia: 'l', invio: false,
                sezioni: [
                    {
                        id: 'chi', titolo: t('vs_g_chi', 'Che fonte è'),
                        testo: incerto
                            ? t('vs_nota_vuoto', 'Il modello non ha riconosciuto la fonte e ha lasciato il contesto in bianco: scrivilo tu. È quello che le domande daranno per vero.')
                            : t('vs_nota_ipotesi', 'Il contesto qui sotto è un\'IPOTESI del modello, non un fatto: correggilo. È quello che le domande daranno per vero.'),
                        campi: [
                            { id: 'titolo', etichetta: t('vs_titolo', 'Titolo della fonte'),
                              valore: (v && v.titolo != null) ? v.titolo : scheda.titolo },
                            { id: 'contesto', tipo: 'area', etichetta: t('vs_contesto', 'Contesto — epoca, luogo, avvenimento, genere della fonte'),
                              valore: (v && v.contesto != null) ? v.contesto : scheda.contesto }
                        ]
                    },
                    {
                        id: 'cosa', titolo: t('vs_g_cosa', 'Che cosa mostra'),
                        testo: t('vs_nota_desc', 'Quello che si vede nell\'immagine. Sul foglio degli allievi non compare — sarebbe la risposta a metà delle domande — ma finisce fra le tue tracce di correzione.'),
                        campi: [
                            { id: 'descrizione', tipo: 'area', etichetta: t('vs_desc', 'Descrizione'),
                              valore: (v && v.descrizione != null) ? v.descrizione : scheda.descrizione }
                        ]
                    }
                ],
                suApertura: function (box) { _mostraFoto(box, scheda); },
                azioni: [
                    { id: 'annulla', etichetta: t('mm_annulla', 'Annulla') },
                    { id: 'ok', etichetta: t('vs_usa', 'Usa questa fonte'), icona: 'check', ruolo: 'primario' }
                ]
            };
        }

        return M.open(schema(null)).then(function (r) {
            if (!r || r.azione !== 'ok') return null;
            var v = r.valori || {};
            var fatta = {
                titolo: String(v.titolo || scheda.titolo || '').trim(),
                contesto: String(v.contesto || '').trim(),
                descrizione: String(v.descrizione || '').trim(),
                fotoB64: scheda.fotoB64, mime: scheda.mime, nomeFile: scheda.nomeFile
            };
            if (!C.schedaPronta(fatta)) {
                toast(t('vs_troppo_poco', 'Serve almeno una riga di contesto o di descrizione: è il materiale da cui nascono le domande.'), 'warning');
                return apriScheda(fatta);
            }
            _scheda = fatta;
            return fatta;
        });
    }

    /* L'anteprima dentro il modale: prima della prima sezione, così si vede la
       foto mentre si scrive il contesto che la riguarda. */
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
       Scegli → leggi (col velo) → correggi → torna la scheda. `null` a ogni
       passo in cui l'utente si tira indietro. */
    var _scheda = null;
    function nuovaScheda() {
        var C = CORE();
        if (!attivo()) return Promise.resolve(null);
        if (!C) { toast(t('vs_no_core', 'Il lettore di immagini non è caricato.'), 'warning'); return Promise.resolve(null); }

        return disponibile().then(function (st) {
            if (!st.acceso) {
                var d = C.diagnosi('ECONNREFUSED');
                toast(d.messaggio + ' ' + d.rimedio, 'warning');
                return null;
            }
            if (st.modelli.length && !modelloPresente(st)) {
                var dm = C.diagnosi('no such model');
                toast(dm.messaggio + ' ' + dm.rimedio, 'warning');
                return null;
            }
            return scegli().then(function (file) {
                if (!file) return null;
                if (!C.accetta(file.name)) {
                    toast(t('vs_formato', 'Formato non gestito: servono JPG, PNG, HEIC o TIFF.'), 'warning');
                    return null;
                }
                var abbandonata = false;
                if (window.showLoadingOverlay) {
                    window.showLoadingOverlay(true,
                        t('vs_leggo', 'Leggo l\'immagine sul tuo computer… può volerci una ventina di secondi.'),
                        'default', '', function () { abbandonata = true; });
                }
                return leggi(file).then(function (scheda) {
                    if (window.showLoadingOverlay) window.showLoadingOverlay(false);
                    /* ⚠️ «Annulla» ABBANDONA L'ATTESA, non ferma il modello: una
                       richiesta già partita al motore locale non si richiama
                       indietro. Il risultato arriva e si butta — l'unica cosa
                       che conta è che il docente non resti bloccato a guardare
                       un velo. */
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
        });
    }

    function schedaCorrente() { return _scheda; }
    function scordaScheda() { _scheda = null; }

    window.MappAIVisione = {
        attivo: attivo,
        disponibile: disponibile,
        modello: modello,
        host: host,
        modelloPresente: modelloPresente,
        nuovaScheda: nuovaScheda,
        schedaCorrente: schedaCorrente,
        scordaScheda: scordaScheda,
        apriScheda: apriScheda,
        leggi: leggi
    };
    console.log('[MappAI] mappai-visione.js caricato ✓');
})();
