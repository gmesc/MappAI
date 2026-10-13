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

   Il fornitore (0066): con Google la lettura passa da `fetchModelAPI`; con
   Infomaniak attivo la foto resta in Svizzera e si legge col modello della
   tendina «Modello per le foto» (`mappai-visione-modello.js`), via ponte.
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
    /* Due strade (0066). Con Infomaniak attivo la foto resta in Svizzera: si
       legge col modello della tendina «Modello per le foto», mai con quello della
       tendina principale (di solito Gemma, che non legge immagini). Con Google
       come prima. Il messaggio 'provider infomaniak…' lo spiega il core. */
    function _fornitore() { return (_st() || {}).aiProvider || 'google'; }
    function _productId() {
        var el = document.getElementById('infomaniak-product-id');
        return (el && el.value) || (_st() || {}).infomaniakProductId || '';
    }
    function _modelloFoto() {
        var M = window.MappAIVisioneModello;
        return (M && typeof M.modello === 'function' && M.modello()) || '';
    }
    function provaProvider() {
        if (_fornitore() === 'infomaniak') {
            var k = window.getProviderKey ? window.getProviderKey('infomaniak') : '';
            if (!k || !_productId() || !_modelloFoto()) return 'provider infomaniak: mancano token, product id o modello';
            return '';
        }
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

    /* ── LA LETTURA SU INFOMANIAK (0066) ───────────────────────────────────────
       Il ponte traduce (l'immagine diventa `image_url`), l'IPC c'è già. Non si
       passa da `fetchModelAPI`: sceglierebbe il modello della tendina principale,
       e il contesto esplicito vuole una fase del profilo, che la visione non ha
       (ADR 0004). Conversione della risposta e riga del registro sono quelle di
       `fetchModelAPI` (app.js, ramo Infomaniak e «Tracking Usage»). Token e
       Product ID non escono mai in un messaggio (ADR 0014). */
    function _senzaSegreti(msg, segreti) {
        var out = String(msg || 'Richiesta AI non riuscita.');
        segreti.filter(Boolean).forEach(function (x) {
            [x, encodeURIComponent(x)].forEach(function (y) { out = out.split(y).join('«omesso»'); });
        });
        return out;
    }
    function _registra(raw, resp, modello, ctx, tetto) {
        var s = _st();
        if (!s) return;
        var u = s.generationUsage || (s.generationUsage = { promptTokens: 0, candidateTokens: 0, totalTokens: 0 });
        var md = resp && resp.usageMetadata;
        if (md) {
            u.promptTokens += (md.promptTokenCount || 0);
            u.candidateTokens += (md.candidatesTokenCount || 0);
            u.totalTokens += (md.totalTokenCount || 0);
        }
        var uso = (raw && raw.usage) || {};
        var inT = uso.prompt_tokens, outT = uso.completion_tokens;
        var noto = [inT, outT].every(function (n) { return typeof n === 'number' && isFinite(n) && n >= 0; });
        var effettivo = raw && typeof raw.model === 'string' && raw.model.trim() ? raw.model : null;
        var c = resp && resp.candidates && resp.candidates[0];
        var stop = (c && c.finishReason) || null;
        var riga = { provider: 'infomaniak', model: effettivo || modello, requestedModel: modello, actualModel: effettivo,
            usageKnown: noto, inTok: noto ? inT : null, outTok: noto ? outT : null, thoughts: 0,
            n: null, stop: stop, tetto: tetto, ctx: ctx };
        (u.costRecords || (u.costRecords = [])).push(riga);
        if (window.MappAIUsage && window.MappAIUsage.record) window.MappAIUsage.record(riga);
        if (window.updateCostDisplay) window.updateCostDisplay();
        if (window.MappAITruncationTracker && window.MappAITruncationTracker.record) {
            window.MappAITruncationTracker.record({ model: modello, provider: 'infomaniak', finishReason: stop,
                truncated: stop === 'MAX_TOKENS' || stop === 'length', requestedMax: tetto,
                promptTokens: (md && md.promptTokenCount) || 0, candidateTokens: (md && md.candidatesTokenCount) || 0 });
        }
    }
    function _chiediInfomaniak(payload) {
        var api = API(), B = window.InfomaniakBridge;
        if (!api || !api.generateInfomaniak || !B) return Promise.reject(new Error('rete'));
        var chiave = window.getProviderKey('infomaniak'), pid = _productId(), modello = _modelloFoto();
        // il contesto del registro si fotografa all'entrata, come in fetchModelAPI
        var ctx = (window.MappAIUsage && window.MappAIUsage.current && window.MappAIUsage.current()) || null;
        var tetto = (payload.generationConfig && payload.generationConfig.maxOutputTokens) || null;
        var tradotto;
        try { tradotto = B.translatePayload(payload, modello, { immagini: true }); }
        catch (e) { return Promise.reject(e); }
        return Promise.resolve(api.generateInfomaniak({ apiKey: chiave, payload: tradotto, productId: pid }))
            .then(function (raw) {
                var resp = B.translateResponse(raw || {});
                _registra(raw, resp, modello, ctx, tetto);
                return resp;
            }, function (e) {
                throw new Error(_senzaSegreti(e && e.message || e, [chiave, pid]));
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
        /* il fornitore si legge UNA volta: un cambio durante la preparazione della
           foto non deve mandarla altrove da quello che il riquadro ha detto */
        var forn = _fornitore();
        var male = provaProvider();
        if (male) return Promise.reject(new Error(male));
        if (forn !== 'infomaniak' && (!window.fetchModelAPI || !window.getSystemKey)) return Promise.reject(new Error('rete'));

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
                if (forn === 'infomaniak') return _chiediInfomaniak(payload);
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

    /* ── LA SUPERFICIE DI VALIDAZIONE (fase 3, 20/8 notte) ────────────────────
       Non più un modale: la scheda si monta NELL'AREA DI CREA (o nella tela di
       ELABORA come editor) con `MappAIModal.render` — lo schema è lo stesso,
       cambiano il posto e il piè. I campi crescono col loro testo
       (`cresce: true`): la validazione di una descrizione tagliata a metà
       frase non è una validazione.
       In fondo, in modo 'crea', i DUE BOX delle opzioni: Domande aperte e
       Flashcard (quante per categoria · quali categorie · quali angoli), più
       la sintesi senza opzioni. Le scelte finiscono in `fatta.opzioni` e la
       pipeline le legge per-tipo. */
    var NOTE = null;
    function _note() {
        if (NOTE) return NOTE;
        NOTE = {
            identita: t('vs_b_id_d', 'Che cos\'è, materialmente. Correggi quello che il modello ha sbagliato o non ha visto.'),
            osservazione: t('vs_b_oss_d', 'Solo ciò che si VEDE. Sui fogli degli allievi non compare: sarebbe la risposta a metà delle domande — va nelle tue tracce.'),
            interpretazione: t('vs_b_int_d', 'IPOTESI del modello, non fatti: ogni riga deve citare l\'elemento visivo che la giustifica («— lo dice…»). Le righe senza appiglio sono state scartate. Correggi: è quello che le domande daranno per vero.'),
            critica: t('vs_b_cri_d', 'Che cosa questa fonte DIMOSTRA (le intenzioni di chi l\'ha fatta) e che cosa tace. È la parte che trasforma un\'immagine in una fonte.')
        };
        return NOTE;
    }
    /* I campi che CRESCONO col loro testo (`mm-campo--cresce`, 3-18 righe).
       Sono tutti tranne i sei della carta d'identità, che sono dati di UNA riga
       (genere, titolo, autore, data, luogo, tecnica): farli crescere
       aggiungerebbe solo aria. ⚠️ Prima qui ce n'erano sette, e gli altri sei
       — «finalità», «tipografia», «diffusione», «corrente», «committente»,
       «destinatario» — erano campi a riga singola con dentro tre-cinque righe
       di testo: si correggevano leggendone un pezzo per volta. */
    var CAMPI_LUNGHI = ['descrizione', 'testo', 'iconografia', 'linguaggioVisivo',
        'tipografia', 'corrente', 'committente', 'destinatario', 'finalita',
        'strategie', 'diffusione', 'prova', 'tace'];

    function _sezioniBlocchi(scheda) {
        var C = CORE();
        return C.BLOCCHI.map(function (bl) {
            return {
                id: bl.id, titolo: bl.titolo, testo: _note()[bl.id] || '',
                collassabile: true, chiusa: false,
                campi: bl.campi.map(function (c) {
                    var lungo = CAMPI_LUNGHI.indexOf(c.id) >= 0;
                    return { id: bl.id + '.' + c.id, tipo: lungo ? 'area' : undefined,
                        cresce: lungo, etichetta: c.et,
                        valore: (scheda[bl.id] || {})[c.id] || '' };
                })
            };
        });
    }
    /* I TRE BOX (01/10: + «Scelta multipla»). Le spunte degli angoli vengono da
       `QUIZ_ANGLES` (mai una lista scritta qui); le categorie sono i BLOCCHI della
       griglia. I materiali di una foto si scelgono SOLO qui (Giacomo, 01/10): la
       scheda parte dalle ultime scelte confermate, o dai default di sempre — la
       regola «salvato o default» è del core (`opzioniIniziali`).
       Categorie e angoli stanno in GRIGLIA (`colonne` delle sezioni del motore):
       ogni genere è un riquadro con «Genera» e «quante», più due sottosezioni.
       ⚠️ I riquadri non si chiudono più: chiudendo il primo, le sue due
       sottosezioni resterebbero aperte da sole. */
    var LS_OPZIONI = 'mappai_dossier_opzioni';
    function _angoliValidi() {
        return (window.QUIZ_ANGLES || []).map(function (a) { return a.key; }).filter(function (k) { return k !== 'auto'; });
    }
    function _opzioniIniziali(op) {
        var IC = window.MappAICreaIconograficaCore;
        if (!IC || !IC.opzioniIniziali) return op || {};
        var fonte = op;
        if (!fonte) {
            try { fonte = JSON.parse(localStorage.getItem(LS_OPZIONI) || 'null'); } catch (e) { fonte = null; }
        }
        return IC.opzioniIniziali(fonte, _angoliValidi());
    }
    /* scritta dal guscio alla conferma (vedi `mappai-crea-iconografica.js`) */
    function ricordaOpzioni(op) {
        if (!op || typeof op !== 'object') return;
        try { localStorage.setItem(LS_OPZIONI, JSON.stringify(op)); } catch (e) { }
    }
    function _sezioniOpzioni(op) {
        var C = CORE();
        op = _opzioniIniziali(op);
        function box(pref, titolo, g) {
            g = g || {};
            var acceso = (pref === 'mc') ? g.on === true : g.on !== false;
            var cat = C.BLOCCHI.map(function (bl) {
                return { id: pref + '.cat.' + bl.id, tipo: 'spunta', etichetta: bl.titolo,
                    valore: !g.cat || g.cat.indexOf(bl.id) >= 0 };
            });
            var ang = [];
            (window.QUIZ_ANGLES || []).forEach(function (a) {
                if (a.key === 'auto') return;
                var et = window.quizAngleLabel ? window.quizAngleLabel(a.key) : a.key;
                ang.push({ id: pref + '.ang.' + a.key, tipo: 'spunta', etichetta: et,
                    valore: !!(g.angoli && g.angoli.indexOf(a.key) >= 0) });
            });
            var out = [{ id: 'op-' + pref, titolo: titolo,
                testo: t('vs_op_d', 'Le categorie dicono DA QUALI blocchi della scheda nascono; ogni angolo spuntato produce un set suo. Nessun angolo = un set misto.'),
                colonne: 2,
                campi: [
                    { id: pref + '.on', tipo: 'spunta', etichetta: t('vs_op_on', 'Genera'), valore: acceso },
                    { id: pref + '.n', tipo: 'numero', etichetta: t('vs_op_n', 'Quante per categoria'), valore: g.n || 3, min: 1, max: 30, larghezza: 'meta' }
                ] },
                { id: 'op-' + pref + '-cat', titolo: t('vs_op_cat', 'Da quali parti della scheda'), colonne: 2, campi: cat }];
            if (ang.length) out.push({ id: 'op-' + pref + '-ang', titolo: t('vs_op_ang', 'Angoli'), colonne: 3, campi: ang });
            return out;
        }
        return [].concat(
            box('oq', t('vs_op_oq', 'Domande aperte'), op.oq),
            box('fc', t('vs_op_fc', 'Flashcard'), op.fc),
            box('mc', t('vs_op_mc', 'Scelta multipla'), op.mc),
            /* la VOCE NATURALE si sceglie qui (decisione 9 del 01/10): la frase di prima
               («si aggiunge dopo, dall'editor») era falsa — il dossier la generava
               subito se nel bento erano spuntate «Sintesi» e «Voce naturale» */
            [{ id: 'op-syn', titolo: t('vs_op_syn', 'Sintesi'),
              testo: t('vs_op_syn_d2', 'Un testo continuo dalla scheda.') + ' ' +
                  t('mp_voce_google', 'La voce si fa con Google: il testo della sintesi esce dalla Svizzera.') + ' ' +
                  t('vs_op_voce_costo', 'Costa una chiamata all\'AI per ogni blocco della sintesi.'),
              colonne: 2,
              campi: [{ id: 'syn.on', tipo: 'spunta', etichetta: t('vs_op_on', 'Genera'), valore: op.syn !== false },
                  { id: 'syn.audio', tipo: 'spunta', etichetta: t('vs_op_voce', 'Voce naturale'), valore: op.voce === true }],
              sotto: '' }]
        );
    }
    function _leggiCampi(box) {
        var v = {};
        box.querySelectorAll('[data-campo]').forEach(function (el) {
            var k = el.getAttribute('data-campo');
            v[k] = (el.type === 'checkbox') ? el.checked : el.value;
        });
        return v;
    }
    function _fattaDaCampi(scheda, v) {
        var C = CORE();
        var fatta = { titolo: String(v.titolo || scheda.titolo || '').trim(),
            nomeFile: scheda.nomeFile, fotoB64: scheda.fotoB64, mime: scheda.mime };
        C.BLOCCHI.forEach(function (bl) {
            fatta[bl.id] = {};
            bl.campi.forEach(function (c) {
                fatta[bl.id][c.id] = String(v[bl.id + '.' + c.id] || '').trim();
            });
        });
        return fatta;
    }
    /* ── L'IMPRONTA DI UNA SCHEDA (21/8) ─────────────────────────────────────
       Serve a rispondere a «è stata toccata?», e la risposta va data sui CAMPI,
       non sulla forma dell'oggetto.
       ⚠️ Difetto trovato misurando: `sporco()` confrontava due `JSON.stringify`
       e diceva SEMPRE «sporca», anche su una scheda appena aperta e mai toccata
       — perché le due schede portano le stesse chiavi in ORDINE diverso
       (`schedaFromAnalisiHtml` dà titolo·mime·fotoB64…, `_fattaDaCampi` dà
       titolo·nomeFile·fotoB64·mime…) e `stringify` è sensibile all'ordine. Il
       costo: la conferma d'uscita usciva sempre, anche quando non c'era niente
       da salvare, e la console chiedeva a ogni cambio di riga.
       È la trappola 50 in forma nuova: due rappresentazioni della stessa cosa
       non sono due stringhe uguali. L'impronta le porta sulla STESSA forma,
       elencando i campi dalla griglia del core (inv. 6) e ignorando ciò che non
       si corregge (foto, nome del file, opzioni). */
    function _impronta(sch) {
        var C = CORE();
        sch = sch || {};
        var pezzi = [String(sch.titolo || '').trim()];
        C.BLOCCHI.forEach(function (bl) {
            var src = sch[bl.id] || {};
            bl.campi.forEach(function (c) { pezzi.push(String(src[c.id] || '').trim()); });
        });
        return pezzi.join('\u0001');
    }
    function _opzioniDaCampi(v) {
        var C = CORE();
        function genere(pref) {
            var cat = [], ang = [];
            C.BLOCCHI.forEach(function (bl) { if (v[pref + '.cat.' + bl.id]) cat.push(bl.id); });
            (window.QUIZ_ANGLES || []).forEach(function (a) {
                if (a.key !== 'auto' && v[pref + '.ang.' + a.key]) ang.push(a.key);
            });
            return { on: !!v[pref + '.on'], n: parseInt(v[pref + '.n'], 10) || 3,
                /* tutte spuntate = nessun filtro: la scheda può crescere di un
                   blocco senza che le opzioni salvate lo escludano */
                cat: cat.length >= C.BLOCCHI.length ? null : cat, angoli: ang };
        }
        return { oq: genere('oq'), fc: genere('fc'), mc: genere('mc'), syn: !!v['syn.on'], voce: !!v['syn.audio'] };
    }
    function _blocchiPieni(scheda) {
        var C = CORE(), n = 0;
        C.BLOCCHI.forEach(function (bl) { if (C.testoBlocco(scheda, bl.id)) n++; });
        return n;
    }
    function _aggiornaStima(box, scheda) {
        var el = box.querySelector('[data-vs-stima]');
        if (!el) return;
        var C = CORE(), IC = window.MappAICreaIconograficaCore;
        var op = _opzioniDaCampi(_leggiCampi(box));
        /* la scelta multipla si conta col core (01/10); senza, come prima */
        var st = (IC && IC.stima) ? IC.stima(op, _blocchiPieni(scheda)) : C.stimaDossier(op, _blocchiPieni(scheda));
        el.textContent = t('vs_stima', 'Questo dossier: circa {n} chiamate all\'AI')
            .replace('{n}', st.chiamate) +
            ' (' + st.oq + ' + ' + st.fc + (st.mc != null ? ' + ' + st.mc : '') + ' + ' + st.syn +
            (st.voce ? ' + ' + t('vs_stima_voce', 'voce ≥ {n}').replace('{n}', st.voce) : '') + ')';
    }

    /* ── IL MONTAGGIO ─────────────────────────────────────────────────────────
       modo 'crea'  : prende il posto dei passi di CREA (il form si spegne, non
                      si svuota — trappola 11) e risolve con la scheda
                      confermata, `{__scarta:true}`, o resta aperta.
       modo 'editor': si monta nell'`host` dato (la tela di ELABORA) col piè
                      degli editor — Salva · Annulla · Crea PDF · Esci — e
                      `opts.onSalva(fatta)` a ogni salvataggio. */
    var _pulisciSuperficie = null;
    /* lo sguardo di chi ospita: MappAIVisione.superficie.sporca() / .leggi() */
    var SUP = { sporca: null, leggi: null };
    /* smontaggio dall'esterno: toglie l'ascolto ESC della superficie quando la
       console chiude il documento SENZA rimontarne un'altra (③, 21/8) */
    function scordaSuperficie() {
        if (_pulisciSuperficie) { try { _pulisciSuperficie(); } catch (e) { } _pulisciSuperficie = null; }
        SUP.sporca = null; SUP.leggi = null;
    }
    /* ── LA BARRA DEI COMANDI, IN ALTO (21/8) ─────────────────────────────────
       La veste è quella dei quattro editor (`.de-bar` / `.de-btn`, foglio di
       `mappai-doc-editor.js`, che `assicuraStili` inietta anche per chi un
       editor non lo apre): la scheda della fonte È un editor, e non deve avere
       una sua grammatica di comandi.
       I bottoni portano gli STESSI `data-azione` del piè di prima → il gestore
       delegato sul box resta l'unico (inv. 6): nessun secondo ascolto, nessuna
       logica duplicata.
       Due vesti, un solo posto: cambia l'elenco dei comandi, non dove stanno. */
    function _barraComandi(box, editor, opts, scheda) {
        try { if (window.MappAIDocEditor && window.MappAIDocEditor.assicuraStili) window.MappAIDocEditor.assicuraStili(); } catch (e) { }
        var barra = document.createElement('div');
        barra.className = 'de-bar';

        var tit = document.createElement('div');
        tit.className = 'de-bar-t';
        tit.textContent = editor ? t('vs_ed_t', 'Analisi della fonte') : t('vs_scheda_t', 'La fonte, prima di generare');
        barra.appendChild(tit);
        var nome = String((scheda && scheda.nomeFile) || '').trim();
        if (nome) {
            var sub = document.createElement('div');
            sub.className = 'de-row-m';          /* il grigio 11px degli elenchi */
            sub.textContent = nome;
            barra.appendChild(sub);
        }
        var sp = document.createElement('div');
        sp.className = 'de-spacer';
        barra.appendChild(sp);

        function btn(azione, etichetta, icona, ruolo, titolo) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'de-btn' + (ruolo === 'primario' ? ' de-primary' : '') +
                (ruolo === 'distruttivo' ? ' de-btn--rosso' : '');
            b.setAttribute('data-azione', azione);
            if (titolo) b.title = titolo;
            b.innerHTML = '<i data-lucide="' + icona + '" class="w-4 h-4"></i> ' +
                String(etichetta).replace(/</g, '\u003c');
            barra.appendChild(b);
            return b;
        }

        if (editor) {
            btn('annulla', t('de_undo', 'Annulla'), 'undo-2');
            /* «Rigenera materiali» solo se chi ospita sa farlo (`opts.onRigenera`):
               la superficie non conosce la pipeline, chiede a chi la monta */
            if (opts && opts.onRigenera) {
                btn('rigenera', t('vs_rigenera', 'Rigenera materiali'), 'refresh-cw', null,
                    t('vs_rigenera_tip', 'Rifà domande aperte, flashcard e sintesi da questa scheda, sovrascrivendo i materiali attuali.'));
            }
            btn('pdf', t('de_pdf', 'Crea PDF'), 'file-down');
            btn('salva', t('de_save', 'Salva'), 'save', 'primario');
            btn('esci', t('de_exit', 'Esci'), 'log-out');
        } else {
            btn('scarta', t('vs_scarta', 'Non usare questa foto'), 'trash-2', 'distruttivo');
            btn('ok', t('vs_usa', 'Usa questa fonte'), 'check', 'primario');
        }
        box.insertBefore(barra, box.firstChild);
    }

    function montaSuperficie(scheda, opts) {
        opts = opts || {};
        var M = MM();
        if (!M || !M.render) { toast(t('cq_no_motore', 'Il motore dei modali non è caricato.'), 'warning'); return Promise.resolve(null); }
        /* una superficie per volta: l'ascolto di ESC sta sul documento, e un
           rimontaggio (ELABORA ridisegna la console) senza pulizia ne
           accumulerebbe due (trappola 22, forma da listener) */
        if (_pulisciSuperficie) { try { _pulisciSuperficie(); } catch (e) { } _pulisciSuperficie = null; }
        var editor = opts.modo === 'editor';
        var originale = JSON.stringify(scheda);

        var schema = {
            titolo: editor ? t('vs_ed_t', 'Analisi della fonte') : t('vs_scheda_t', 'La fonte, prima di generare'),
            sottotitolo: scheda.nomeFile || '', icona: 'image', taglia: 'l', invio: false,
            sezioni: [{
                id: 'chi', titolo: '', nuda: true,
                campi: [{ id: 'titolo', etichetta: t('vs_titolo', 'Titolo della fonte'), valore: scheda.titolo || '' }]
            }].concat(_sezioniBlocchi(scheda))
                .concat(editor ? [] : _sezioniOpzioni(scheda.opzioni)),
            /* NIENTE `azioni` (21/8): i comandi stanno nella BARRA IN ALTO,
               come in tutti gli altri editor — vedi `_barraComandi`. In un piè
               di pagina si raggiungevano solo scorrendo tredici campi. */
            azioni: []
        };

        var box = M.render(schema);
        box.classList.add('vs-superficie');
        if (!editor) box.classList.add('vs-superficie--crea');
        /* niente dialog: è una superficie della pagina, non una finestra */
        box.removeAttribute('aria-modal');
        var x = box.querySelector('.mm-close'); if (x) x.remove();
        /* la testata del motore se ne va: il titolo lo porta la barra, come in
           tutti gli altri editor — due titoli alla stessa quota sarebbero lo
           stesso nome scritto due volte */
        var head = box.querySelector('.mm-head'); if (head) head.remove();
        var piede = box.querySelector('.mm-foot'); if (piede) piede.remove();
        _barraComandi(box, editor, opts, scheda);
        _mostraFoto(box, scheda);
        if (!editor) {
            /* la STIMA resta in fondo al corpo, sotto i due box delle opzioni:
               è la conseguenza delle spunte e sta vicino a ciò che la muove
               (inv. 21), non fra i comandi in cima */
            var stima = document.createElement('p');
            stima.className = 'mm-piede-nota'; stima.setAttribute('data-vs-stima', '');
            var corpo = box.querySelector('.mm-body') || box;
            corpo.appendChild(stima);
        }

        /* dove sta: la tela dell'editor, o il posto del form di CREA */
        var form = null;
        if (editor) {
            if (!opts.host) return Promise.resolve(null);
            opts.host.innerHTML = '';
            opts.host.appendChild(box);
        } else {
            form = document.getElementById('setup-form');
            if (form) form.style.display = 'none';
            var casa = form ? form.parentNode : document.body;
            casa.insertBefore(box, form);
        }
        if (window.safeCreateIcons) window.safeCreateIcons();
        _aggiornaStima(box, scheda);

        return new Promise(function (risolvi) {
            var chiuso = false;
            function smonta(esito) {
                if (chiuso) return; chiuso = true;
                SUP.sporca = null; SUP.leggi = null;
                document.removeEventListener('keydown', suEsc, true);
                if (_pulisciSuperficie === pulisci) _pulisciSuperficie = null;
                try { box.remove(); } catch (e) { }
                if (form) form.style.display = '';
                risolvi(esito);
            }
            /* la pulizia per il PROSSIMO montaggio: toglie l'ascolto e basta —
               il box vecchio se n'è già andato col ridisegno */
            function pulisci() { document.removeEventListener('keydown', suEsc, true); chiuso = true; SUP.sporca = null; SUP.leggi = null; }
            _pulisciSuperficie = pulisci;
            /* La console che ospita l'editor deve poter chiedere «c'è lavoro
               non salvato?» prima di cambiare riga o progetto (③, 21/8): lo
               stato sporco vive in questa closure e da fuori non si vede.
               Si azzera allo smontaggio — un riferimento che sopravvive alla
               superficie mentirebbe sul documento successivo. */
            SUP.sporca = function () { try { return sporco(); } catch (e) { return false; } };
            SUP.leggi = function () { try { return fatta(); } catch (e) { return null; } };
            function fatta() { return _fattaDaCampi(scheda, _leggiCampi(box)); }
            function sporco() { return _impronta(fatta()) !== _impronta(JSON.parse(originale)); }
            function conferma(f) {
                var C = CORE();
                if (!C.schedaPronta(f)) {
                    toast(t('vs_troppo_poco', 'Serve almeno qualche riga di analisi: è il materiale da cui nascono i documenti.'), 'warning');
                    return false;
                }
                return true;
            }
            /* ESC: SEMPRE la conferma a tre vie (richiesta di Giacomo). In
               editor la via di mezzo è «Salva ed esci». */
            function suEsc(e) {
                if (e.key !== 'Escape') return;
                /* un modale del motore sopra la superficie ha la precedenza:
                   il suo ESC lo gestisce lui */
                if (document.querySelector('.mm-overlay')) return;
                e.stopPropagation(); e.preventDefault();
                chiediUscita();
            }
            function chiediUscita() {
                M.open({
                    titolo: t('vs_esc_t', 'Chiudere la scheda?'), icona: 'circle-help', taglia: 's', invio: false,
                    sezioni: [{ testo: editor
                        ? t('vs_esc_ed_d', 'Le correzioni non salvate andranno perse.')
                        : t('vs_esc_d', 'La scheda è il materiale da cui nascono i documenti del dossier.') }],
                    azioni: [
                        { id: 'riprendi', etichetta: t('vs_esc_riprendi', 'Riprendi') },
                        { id: 'scarta', etichetta: editor ? t('vs_esc_perdi', 'Esci senza salvare') : t('vs_scarta', 'Non usare questa foto'), ruolo: 'distruttivo' },
                        { id: 'salva', etichetta: editor ? t('vs_esc_salva_ed', 'Salva ed esci') : t('vs_esc_salva', 'Salva e chiudi'), ruolo: 'primario' }
                    ]
                }).then(function (r) {
                    var a = r && r.azione;
                    if (a === 'salva') {
                        var f = fatta(); f.opzioni = editor ? undefined : _opzioniDaCampi(_leggiCampi(box));
                        if (!conferma(f)) return;
                        if (editor && opts.onSalva) opts.onSalva(f);
                        smonta(editor ? { uscita: true } : f);
                    } else if (a === 'scarta') {
                        smonta(editor ? { uscita: true } : { __scarta: true });
                    }
                    /* riprendi / ESC sulla conferma: non si smonta niente */
                });
            }
            document.addEventListener('keydown', suEsc, true);

            box.addEventListener('click', function (e) {
                var b = e.target.closest && e.target.closest('[data-azione]');
                if (!b) return;
                var a = b.getAttribute('data-azione');
                if (a === 'ok') {
                    var f = fatta();
                    if (!conferma(f)) return;
                    f.opzioni = _opzioniDaCampi(_leggiCampi(box));
                    _scheda = f;
                    smonta(f);
                } else if (a === 'scarta') {
                    smonta({ __scarta: true });
                } else if (a === 'salva') {
                    var f2 = fatta();
                    if (!conferma(f2)) return;
                    originale = JSON.stringify(f2);
                    if (opts.onSalva) opts.onSalva(f2);
                } else if (a === 'annulla') {
                    /* torna alla scheda com'era all'apertura (o all'ultimo salvataggio) */
                    var base = JSON.parse(originale);
                    box.querySelectorAll('[data-campo]').forEach(function (el) {
                        var k = el.getAttribute('data-campo');
                        var val = (k === 'titolo') ? (base.titolo || '')
                            : (k.indexOf('.') > 0 ? ((base[k.split('.')[0]] || {})[k.split('.')[1]] || '') : '');
                        if (el.type === 'checkbox') return;
                        el.value = val;
                    });
                } else if (a === 'pdf') {
                    if (opts.onPdf) opts.onPdf(fatta());
                } else if (a === 'rigenera') {
                    /* prima si SALVA (stessa strada del bottone Salva: la
                       rigenerazione parte dall'ultimo stato scritto, mai da
                       una scheda a metà), poi si rigenera */
                    var f3 = fatta();
                    if (!conferma(f3)) return;
                    originale = JSON.stringify(f3);
                    if (opts.onSalva) opts.onSalva(f3);
                    if (opts.onRigenera) opts.onRigenera(f3);
                } else if (a === 'esci') {
                    if (!sporco()) { smonta({ uscita: true }); return; }
                    chiediUscita();   /* la stessa conferma a tre vie di ESC */
                }
            });
            /* il preventivo segue le spunte */
            if (!editor) {
                box.addEventListener('change', function () { _aggiornaStima(box, scheda); });
                box.addEventListener('input', function (e) {
                    if (e.target && e.target.type === 'number') _aggiornaStima(box, scheda);
                });
            }
        });
    }

    /* ── LA SCELTA DEI MATERIALI NEL RIQUADRO DI CREA (0069, giro 3) ───────────
       Le STESSE sezioni della superficie (`_sezioniOpzioni`, col motore), lette
       con le stesse funzioni (`_leggiCampi` → `_opzioniDaCampi`), con la stessa
       stima (`_aggiornaStima`) e la stessa memoria (`ricordaOpzioni`, chiave
       `mappai_dossier_opzioni`): qui cambia solo il posto. Ogni cambio scrive
       `scheda.opzioni`, che `IC.uscite` legge in `cfgDossier` come prima. Le
       opzioni non sono contenuto: non toccano la conferma della scheda.
       Gli eventi si fermano qui: non sono voci del bento. */
    function montaOpzioni(host, scheda, onCambio) {
        var M = MM();
        if (!host || !scheda || !M || !M.render) return null;
        var box = M.render({ titolo: t('vs_op_materiali', 'I materiali'), sezioni: _sezioniOpzioni(scheda.opzioni), azioni: [] });
        var corpo = box.querySelector('.mm-body') || box;
        /* `vs-superficie--crea`: le stesse regole della griglia di categorie e angoli
           (mappai-crea-iconografica.css), che è ciò che si sta riusando */
        corpo.classList.add('vs-opzioni', 'vs-superficie--crea');
        /* giro 4 (Giacomo, 03/10: «larghi 1/2 box … su due colonne»): ogni genere
           diventa un box con le sue parti e i suoi angoli dentro; giro 6 («vanno
           raggruppati per items»): la griglia a due colonne legge Flashcard |
           Domande aperte, poi Scelta multipla | Sintesi. Gruppi e ordine li decide
           il core (`gruppiOpzioni`); si SPOSTANO le sezioni già fatte dal motore,
           i campi restano quelli. */
        var ICg = window.MappAICreaIconograficaCore;
        if (ICg && typeof ICg.gruppiOpzioni === 'function') {
            var sezioni = Array.prototype.filter.call(corpo.children, function (el) { return el.hasAttribute && el.hasAttribute('data-sez'); });
            var perId = {};
            sezioni.forEach(function (el) { perId[el.getAttribute('data-sez')] = el; });
            ICg.gruppiOpzioni(sezioni.map(function (el) { return el.getAttribute('data-sez'); })).forEach(function (g) {
                var cella = document.createElement('div');
                cella.className = 'vs-opz-genere';
                cella.setAttribute('data-genere', g.genere);
                g.sezioni.forEach(function (id) { if (perId[id]) cella.appendChild(perId[id]); });
                corpo.appendChild(cella);
            });
        }
        var stima = document.createElement('p');
        stima.className = 'mm-piede-nota'; stima.setAttribute('data-vs-stima', '');
        corpo.appendChild(stima);
        host.innerHTML = '';
        host.appendChild(corpo);
        if (window.safeCreateIcons) window.safeCreateIcons();
        function cambia(e) {
            if (e) e.stopPropagation();
            var op = _opzioniDaCampi(_leggiCampi(corpo));
            scheda.opzioni = op;
            ricordaOpzioni(op);
            _aggiornaStima(corpo, scheda);
            if (onCambio) onCambio(op);
        }
        corpo.addEventListener('change', cambia);
        corpo.addEventListener('input', function (e) {
            e.stopPropagation();
            if (e.target && e.target.type === 'number') cambia();
        });
        /* lo stato iniziale delle spunte È la scelta di partenza: si scrive subito,
           così `scheda.opzioni` e lo schermo non divergono mai */
        scheda.opzioni = _opzioniDaCampi(_leggiCampi(corpo));
        _aggiornaStima(corpo, scheda);
        return corpo;
    }

    function apriScheda(scheda, opts) {
        return montaSuperficie(scheda, opts || { modo: 'crea' });
    }

    /* ⚠️ BLOCCO RIPRISTINATO (21/8): il terzo giro del 20/8 (ee42ca9) l'aveva
       cancellato riscrivendo la superficie, ma l'export in fondo lo cita —
       `schedaCorrente is not defined` al load e il MODULO INTERO moriva:
       niente scheda da CREA, niente «Modifica» in ELABORA. La lezione è la
       regola del 16/8: dopo aver sostituito un blocco, verificare che nessuna
       funzione del file sia sparita con lui. */
    var _scheda = null;
    function schedaCorrente() { return _scheda; }
    function scordaScheda() { _scheda = null; }

    /* MM/KG e il tema si spengono con una foto fra le fonti (inv. 21):
       si ricalcola DAI DATI a ogni chiamata, niente stato da tenere allineato. */
    function _fotoPresente() {
        var s = _st() || {};
        return ((s.sources) || []).some(function (x) { return x && x._scheda; });
    }
    function sincronizzaGenere() {
        /* 0067 (ADR 0015): con la modalità iconografica accesa il guscio NASCONDE
           MM/KG e il tema e mette al loro posto la foto e la scheda letta — qui non si
           sbiadisce né si disabilita nulla (e si ripulisce ciò che era rimasto). A
           interruttore spento, o se il guscio non ha potuto montare, come prima. */
        var G = window.MappAICreaIconografica;
        var guscio = false;
        try { guscio = !!(G && G.aggiorna && G.aggiorna()); } catch (e) { guscio = false; }
        var giu = !guscio && _fotoPresente();
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

    /* L'anteprima dentro la superficie: prima della prima sezione, così la foto
       si guarda mentre si correggono i campi che la riguardano. */
    function _mostraFoto(box, scheda) {
        if (!scheda || !scheda.fotoB64) return;
        try {
            var corpo = box.querySelector('.mm-body');
            if (!corpo) return;
            var w = document.createElement('div');
            /* 01/10 (Giacomo): larga quanto la colonna dei contenuti, altezza
               proporzionale — non più il tetto di 260px */
            w.style.cssText = 'margin-bottom:14px;';
            var img = document.createElement('img');
            img.src = 'data:' + (scheda.mime || 'image/jpeg') + ';base64,' + scheda.fotoB64;
            img.alt = scheda.titolo || '';
            img.style.cssText = 'width:100%; height:auto; border-radius:10px; display:block;';
            w.appendChild(img);
            corpo.insertBefore(w, corpo.firstChild);
        } catch (e) { /* senza anteprima la scheda funziona lo stesso */ }
    }

    /* ── IL GESTO INTERO    /* ── IL GESTO INTERO ──────────────────────────────────────────────────────
       Scegli → analizza (col velo) → correggi → torna la scheda. `null` a ogni
       passo in cui l'utente si tira indietro. Con un `file` già in mano (le
       fonti di CREA) il picker si salta. */
    /* ── IL CONTESTO DEL DOCENTE, PRIMA DELLA LETTURA (21/8) ─────────────────
       `promptAnalisi` ha da sempre il campo `notaDocente` («IL DOCENTE
       DICHIARA: questo è VERO») — ma nessuna superficie lo chiedeva: era un
       parametro senza ingresso. È la leva più forte contro le due classi di
       errore viste sul manifesto del '42 (figure non nominate, slang tradotto
       alla lettera): due righe del docente («manifesto USA 1942, i tre sono
       Hitler, Mussolini e l'imperatore giapponese») vincolano il modello dove
       da solo tira a indovinare.
       Facoltativo: campo vuoto = si analizza come prima. «Annulla» invece
       abbandona il gesto — chi chiude non voleva analizzare. Ripiego senza
       motore: si procede senza nota, mai bloccare la lettura per un extra. */
    function chiediNota(nomeFile) {
        if (!window.MappAIModal || !window.MappAIModal.open) return Promise.resolve({ ok: true, nota: '' });
        return window.MappAIModal.open({
            titolo: t('vs_nota_titolo', 'Che cosa sai di questa fonte?'),
            icona: 'image',
            taglia: 's',
            sezioni: [{
                testo: t('vs_nota_testo', 'Facoltativo, ma migliora molto la lettura: periodo, luogo, personaggi raffigurati, occasione. Quello che scrivi qui l\'AI lo tiene per VERO.'),
                campi: [{ id: 'nota', tipo: 'area', cresce: true,
                    etichetta: t('vs_nota_campo', 'Contesto (es. «manifesto USA del 1942; i tre schiacciati sono Hitler, Mussolini e l\u2019imperatore del Giappone»)') }]
            }, {
                // dove va la foto (0066): la stessa strada che prenderà `leggi`
                testo: _fornitore() === 'infomaniak'
                    ? t('vs_dove_ch', 'La foto va a Infomaniak, in Svizzera.')
                    : t('vs_dove_g', 'La foto va a Google, fuori dalla Svizzera.')
            }],
            azioni: [
                { id: 'no', etichetta: t('mm_annulla', 'Annulla') },
                { id: 'si', etichetta: t('vs_nota_avanti', 'Analizza'), ruolo: 'primario' }
            ]
        }).then(function (r) {
            if (!r || r.azione !== 'si') return { ok: false };
            return { ok: true, nota: (r.valori && r.valori.nota || '').trim() };
        });
    }

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
            return chiediNota(file.name).then(function (ctx) {
                if (!ctx.ok) return null;
                /* `fileGia` = la foto arriva dalle fonti di CREA (0069, giro 3) */
                return _analizza(file, ctx.nota, C, !!fileGia);
            });
        });
    }
    /* ── TUTTO NEL RIQUADRO (0069, giro 3; ADR 0016 rev. 1) ─────────────────────
       Con `mappai_dossier_fonte_scheda` acceso (di default dal 0088; lo spegne '0'), per una foto delle fonti di CREA e
       col guscio in grado di montare il riquadro, la superficie NON si apre: la
       scheda letta torna a chi l'ha chiesta (`leggiImmagineSorgente`, la stessa
       strada di «Usa questa fonte») con le opzioni di partenza dei materiali
       (`_opzioniIniziali`: le ultime scelte, o i default), e la si corregge, si
       scelgono i materiali e la si conferma nel riquadro. La decisione è del core
       (`MappAIDossierFonteCore.soloRiquadro`); spento, tutto come prima. */
    function _soloRiquadro(daCrea) {
        var DF = window.MappAIDossierFonteCore, G = window.MappAICreaIconografica;
        if (!DF || typeof DF.soloRiquadro !== 'function') return false;
        try {
            return DF.soloRiquadro({ acceso: DF.acceso(window.localStorage), daCrea: daCrea === true,
                guscio: !!(G && typeof G.puoMontare === 'function' && G.puoMontare()) });
        } catch (e) { return false; }
    }
    function _analizza(file, nota, C, daCrea) {
            var abbandonata = false;
            if (window.showLoadingOverlay) {
                window.showLoadingOverlay(true,
                    t('vs_leggo', 'Analizzo la fonte con l\'AI… qualche secondo.'),
                    'default', '', function () { abbandonata = true; });
            }
            return leggi(file, { nota: nota }).then(function (scheda) {
                if (window.showLoadingOverlay) window.showLoadingOverlay(false);
                /* «Annulla» abbandona l'ATTESA: una richiesta già partita non si
                   richiama indietro — il risultato arriva e si butta. */
                if (abbandonata) return null;
                if (_soloRiquadro(daCrea)) {
                    scheda.opzioni = _opzioniIniziali(null);
                    return scheda;
                }
                return apriScheda(scheda);
            }, function (err) {
                if (window.showLoadingOverlay) window.showLoadingOverlay(false);
                if (abbandonata) return null;
                var d = C.diagnosi(err);
                /* Il rimedio di «chiave» manda a controllare la chiave GOOGLE. Se la lettura è
                   affidata a Infomaniak, il 401/403 viene da lì: il rimedio giusto è il suo token
                   e il suo Product ID (0088, D7). Il core non si tocca, è della scheda dossier. */
                var rimedio = d.rimedio;
                if (d.codice === 'chiave' && _fornitore() === 'infomaniak') {
                    rimedio = t('vs_e_key_im_r', 'Controlla il token e il Product ID di Infomaniak nelle Impostazioni AI.');
                }
                toast(d.messaggio + ' ' + rimedio, 'error');
                return null;
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
        ricordaOpzioni: ricordaOpzioni,
        montaOpzioni: montaOpzioni,
        montaSuperficie: montaSuperficie,
        superficie: SUP,
        scordaSuperficie: scordaSuperficie,
        leggi: leggi
    };
    console.log('[MappAI] mappai-visione.js caricato ✓');
})();
