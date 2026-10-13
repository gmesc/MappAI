/* =========================================================================
   mappai-proiezione.js — PROIETTARE una fonte iconografica (20/8 notte)

   La vista-lezione di un DOSSIER, da INSEGNA («Proietta»): la fotografia a
   tutto schermo, e una SPLIT attivabile che le affianca la scheda di analisi
   o un set di domande — così il docente proietta l'immagine e fa rispondere
   per alzata di mano.

   · immagine: pannellino zoom (− · % · + · Adatta · 100%), rotellina = zoom
     sul puntatore, click&drag = pan. La geometria sta nel CORE
     (mappai-proiezione-core.js, provato in Node — invariante 4).
   · materiali: un bottone per la SCHEDA, due tendine per i set (domande
     aperte · flashcard). Le domande si mostrano SENZA le righe di risposta;
     le flashcard mostrano il FRONTE, e il retro si rivela col clic — prima
     si chiede, poi si mostra. A− / A+ scalano il corpo (18-40px).

   LA FOTO: prima quella PIENA da `Allegati/` del vault (fase 3 la scrive al
   dossier; `readVaultFile` la rilegge), col ripiego sul JPEG della scheda
   d'archivio per i dossier creati prima — proiettato sgrana, ma non si rompe.

   I DATI: la scheda e i fogli di domande aperte vengono dall'ARCHIVIO
   (`MappAIStudyDocs`, per mapName — quindi dal computer dove il dossier è
   stato creato); i set di flashcard dal DISCO del vault (`set-*.json` di
   «Materiale Studio», il marchio `_mappa` del 17/8). Trappola 17 dichiarata:
   archivio e disco sono due mondi, e qui si attinge a entrambi.
   ========================================================================= */
(function () {
    'use strict';
    if (window.MappAIProiezione) return;   /* trappola 22 */

    var t = function (k, f) { return window.t ? window.t(k, f) : f; };
    function CORE() { return window.MappAIProiezioneCore; }
    function toast(m, tipo) { if (window.showToast) window.showToast(m, tipo || 'info'); }
    var _nomeMappa = function (x) { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim().toLowerCase(); };

    /* ── I DATI DEL DOSSIER ──────────────────────────────────────────────────
       Tutto per NOME della mappa (= il titolo della fonte): la proiezione si
       apre da INSEGNA, dove la mappa non è caricata in appState. */
    function _schedaArchivio(mapName) {
        try {
            var SD = window.MappAIStudyDocs;
            var docs = (SD && SD.list && SD.list()) || [];
            var mie = docs.filter(function (d) {
                return d && d.kind === 'analisi' && d.hasHtml !== false &&
                    _nomeMappa(d.mapName) === _nomeMappa(mapName);
            }).sort(function (a, b) { return (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0); });
            if (!mie.length) return null;
            var pieno = SD.get(mie[0].id);
            return (pieno && window.schedaFromAnalisiHtml) ? window.schedaFromAnalisiHtml(pieno.html) : null;
        } catch (e) { return null; }
    }
    /* Il testo di un file del vault: `readVaultFile` restituisce base64 (è nato per
       i PDF). TextDecoder, MAI atob da solo (la trappola dell'UTF-8). */
    function _testoDaB64(b64) {
        var bin = atob(b64), bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder('utf-8').decode(bytes);
    }
    /* LA SCHEDA (0067, gate 3 del 01/10 sera): prima l'archivio di QUESTO computer,
       poi il VAULT (`pipeline.json` → `config.dossier`), così Proietta funziona anche
       su un altro computer. L'ordine lo decide il core (`schedaPerProiezione`).
       Asincrona: leggere il vault passa da un IPC. Nessuna delle due → null, e resta
       il messaggio di sempre. */
    function _scheda(mapName, vaultPath) {
        var IC = window.MappAICreaIconograficaCore;
        var scegli = function (pip) {
            return (IC && IC.schedaPerProiezione) ? IC.schedaPerProiezione(arch, pip) : (arch || null);
        };
        var arch = _schedaArchivio(mapName);
        var api = window.electronAPI;
        if (scegli(null) || !vaultPath || !api || !api.readVaultFile) return Promise.resolve(scegli(null));
        return api.readVaultFile({ vaultPath: vaultPath, relPath: 'pipeline.json' }).then(function (r) {
            if (!r || !r.ok || !r.base64) return scegli(null);
            try { return scegli(JSON.parse(_testoDaB64(r.base64))); } catch (e) { return scegli(null); }
        }, function () { return scegli(null); });
    }
    function _fogliAperte(mapName) {
        try {
            var SD = window.MappAIStudyDocs;
            return ((SD && SD.list && SD.list()) || []).filter(function (d) {
                return d && d.kind === 'quizpaper' && d.hasHtml !== false &&
                    /domande aperte/i.test(String(d.title || '')) &&
                    _nomeMappa(d.mapName) === _nomeMappa(mapName);
            });
        } catch (e) { return []; }
    }
    function _itemsFoglio(docId) {
        try {
            var pieno = window.MappAIStudyDocs.get(docId);
            var rip = pieno && window.MappAIQuizPrint && window.MappAIQuizPrint.setFromHtml
                ? window.MappAIQuizPrint.setFromHtml(pieno.html) : null;
            return (rip && rip.items) || [];
        } catch (e) { return []; }
    }
    /* I set di flashcard dal DISCO: i `set-<id>.json` che il vault porta in
       «Materiale Studio» (17/8, col marchio `_mappa`). È la fonte che funziona
       anche su un altro computer — il disco è la verità (inv. 7). Il testo dei
       file arriva in base64 (readVaultFile è nato per i PDF): si decodifica
       con TextDecoder, MAI con atob da solo (la trappola dell'UTF-8). */
    function _setsFlashcard(mapName, vaultPath) {
        var api = window.electronAPI;
        if (!vaultPath || !api || !api.vaultMaterialsList || !api.readVaultFile) return Promise.resolve([]);
        var daB64 = _testoDaB64;
        return api.vaultMaterialsList({ vaultPath: vaultPath }).then(function (r) {
            var setFiles = ((r && r.files) || []).filter(function (f) { return f && /^set-.*\.json$/i.test(f.name || ''); });
            return Promise.all(setFiles.map(function (f) {
                return api.readVaultFile({ vaultPath: vaultPath, relPath: 'Materiale Studio/' + f.name }).then(function (rr) {
                    if (!rr || !rr.ok || !rr.base64) return null;
                    try { return JSON.parse(daB64(rr.base64)); } catch (e) { return null; }
                }, function () { return null; });
            }));
        }).then(function (sets) {
            return (sets || []).filter(function (x) {
                if (!x || !Array.isArray(x.items) || !x.items.length) return false;
                if (x._mappa && _nomeMappa(x._mappa) !== _nomeMappa(mapName)) return false;
                return /flash/i.test(String(x.type || x.mode || ''));
            });
        }, function () { return []; });
    }

    /* ── LA FOTO, ALLA MIGLIORE RISOLUZIONE CHE C'È ──────────────────────────*/
    function _foto(mapName, vaultPath) {
        var dallaScheda = function () {
            return _scheda(mapName, vaultPath).then(function (sch) {
                return (sch && sch.fotoB64) ? { src: 'data:' + (sch.mime || 'image/jpeg') + ';base64,' + sch.fotoB64 } : null;
            });
        };
        var api = window.electronAPI;
        if (!vaultPath || !api || !api.readVaultFile || !api.vaultMaterialsList) return dallaScheda();
        /* il nome in Allegati/ lo scrive la pipeline con safeName(titolo): si
           CERCA fra i file invece di ricomporlo — due compositori divergono */
        return api.vaultMaterialsList({ vaultPath: vaultPath, dir: 'Allegati' }).then(function (r) {
            var f = ((r && r.files) || []).find(function (x) {
                return x && /\.(jpe?g|png)$/i.test(x.name || '');
            });
            if (!f) return dallaScheda();
            return api.readVaultFile({ vaultPath: vaultPath, relPath: 'Allegati/' + f.name }).then(function (rr) {
                if (!rr || !rr.ok || !rr.base64) return dallaScheda();
                var mime = /\.png$/i.test(f.name) ? 'image/png' : 'image/jpeg';
                return { src: 'data:' + mime + ';base64,' + rr.base64 };
            }, dallaScheda);
        }, dallaScheda);
    }

    /* ── IL PANNELLO DEI MATERIALI ───────────────────────────────────────────*/
    function _esc(x) {
        return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _htmlScheda(sch) {
        var C = window.MappAIVisioneCore;
        if (!sch || !C) return '<p>' + _esc(t('pj_no_scheda', 'Questo dossier non ha una scheda in archivio su questo computer.')) + '</p>';
        return C.BLOCCHI.map(function (bl) {
            var txt = C.testoBlocco(sch, bl.id);
            if (!txt) return '';
            return '<h3>' + _esc(bl.titolo) + '</h3>' +
                txt.split('\n').map(function (r) {
                    var i = r.indexOf(': ');
                    return i > 0
                        ? '<p><strong>' + _esc(r.slice(0, i)) + '</strong>: ' + _esc(r.slice(i + 2)) + '</p>'
                        : '<p>' + _esc(r) + '</p>';
                }).join('');
        }).join('');
    }
    /* le domande SENZA le righe di risposta: si proietta la domanda, si
       risponde per alzata di mano */
    function _htmlAperte(items) {
        if (!items.length) return '<p>' + _esc(t('pj_no_domande', 'Questo foglio non porta le sue domande.')) + '</p>';
        return items.map(function (it, i) {
            var aree = (it.areas || []).filter(Boolean).slice(0, 2);
            return '<div class="pj-domanda">' +
                '<div class="pj-kicker">' + (i + 1) +
                (aree.length ? ' · ' + _esc(aree.join(' + ')) : '') + '</div>' +
                '<div class="pj-testo">' + _esc(it.question || '') + '</div></div>';
        }).join('');
    }
    /* le flashcard: FRONTE sempre, il retro si rivela col clic sulla carta —
       il gesto dell'alzata di mano (prima si chiede, poi si mostra) */
    function _htmlFlash(items) {
        if (!items.length) return '<p>' + _esc(t('pj_no_carte', 'Questo set non porta le sue carte.')) + '</p>';
        return items.map(function (it, i) {
            var fronte = it.front || it.q || it.question || '';
            var retro = it.back || it.correct || it.answer || '';
            return '<button type="button" class="pj-carta" data-pj-flip aria-expanded="false">' +
                '<div class="pj-kicker">' + (i + 1) + '</div>' +
                '<div class="pj-testo">' + _esc(fronte) + '</div>' +
                '<div class="pj-retro" hidden>' + _esc(retro) + '</div></button>';
        }).join('');
    }

    /* ── 0079, LOTTO B ────────────────────────────────────────────────────────
       Interruttore `mappai_proietta_split` (acceso; '0' = la proiezione di prima):
       la scheda si legge nel DOCUMENTO della sintesi (barra di lettura: Aa,
       Evidenzia, Riga, voce, Stampa) e un divisore fra immagine e scheda porta
       a tutto schermo l'una o l'altra. */
    function _splitAcceso() {
        try { return localStorage.getItem('mappai_proietta_split') !== '0'; } catch (e) { return true; }
    }
    /* «Aa» (regola di Giacomo del 09/10): a schermo solo «Aa», la taglia nell'
       aria-label e nel suggerimento. La forma la dà `MappAIAa` (mappai-a11y.js). */
    function _aaEtichetta(corpo) {
        var C = CORE(), A = window.MappAIAa, f = C ? C.aaFattore(corpo) : 1;
        var nome = t('tts_scale', 'Grandezza del testo');
        return A && A.aria ? A.aria(nome, f) : nome + ': ×' + String(f).replace('.', ',');
    }
    /* Il documento della scheda, se esce dal costruttore della sintesi: con la
       foto nascosta a schermo (è già accanto). Il ripiego di quiz-print (il
       foglio di prima, senza `#ap-topbar`) qui non serve: si usa `_htmlScheda`. */
    function _docScheda(sch, mapName) {
        if (!sch || typeof window.buildAnalisiFonteHtml !== 'function') return null;
        try {
            var html = window.buildAnalisiFonteHtml(sch, { mapName: mapName, fotoAccanto: true, includeBar: false });
            if (typeof html !== 'string' || html.indexOf('id="ap-topbar"') < 0) return null;
            /* LA BARRA COMPATTA (Giacomo al gate del 09/10: «troppo ingombrante,
               far stare tutto su una linea»). Nel pannello il documento è largo
               ~560px: sotto i 790 la sua barra va a capo a scala ×1,6 (177px di
               altezza, misurati). Qui scala ×1 e lettore sulla stessa riga dei
               comandi: 49px, una riga; va a capo solo se il pannello si stringe
               molto. Lo stile entra dopo quello del documento e lo batte per ordine. */
            /* «a capo» permesso, il browser lo prende già a 543px (misurato: 83px):
               una riga SEMPRE, e sotto i 520px di pannello (la larghezza dell'iframe
               è quella del pannello, la media query la legge lì) il lettore scende. */
            var compatta = '<style id="pj-compatta">:root{--ap-ui-k:1}' +
                '#ap-topbar{padding:6px 10px;gap:6px;row-gap:6px;flex-wrap:nowrap}' +
                '#ap-bar{order:0;flex:1 1 auto;margin:0;gap:6px;min-width:0}' +
                '.ap-cmd{flex:0 0 auto;flex-wrap:nowrap;gap:4px}' +
                '.ap-prog{min-width:36px;flex-basis:36px}' +
                /* bottoni e chip del lettore come i comandi dell'app: 40px e 12px
                   (--mm-ctl-h, --mm-ctl-fs; il documento vive da solo e non vede i
                   token, i valori si scrivono qui — Giacomo al gate del 09/10) */
                '.ap-hdr-btn,.ap-print-btn{height:40px;padding-top:0;padding-bottom:0;font-size:12px;display:inline-flex;align-items:center}' +
                '.ap-chip{height:40px;box-sizing:border-box}' +
                '@media (max-width:520px){#ap-topbar{flex-wrap:wrap}#ap-bar{order:3;flex:1 0 100%}}</style>';
            var i = html.lastIndexOf('</head>');
            return i < 0 ? html : html.slice(0, i) + compatta + html.slice(i);
        } catch (e) { return null; }
    }

    /* ── LA VISTA ────────────────────────────────────────────────────────────*/
    function apri(opts) {
        opts = opts || {};
        var C = CORE();
        if (!C) { toast(t('pj_no_core', 'La proiezione non è caricata.'), 'warning'); return; }
        var mapName = opts.mapName || '';
        var nuovo = _splitAcceso();
        var z = (window.MappAIModal && window.MappAIModal.prossimoZ) ? window.MappAIModal.prossimoZ() : 12000;

        var ov = document.createElement('div');
        ov.id = 'pj-overlay';
        ov.style.cssText = 'position:fixed; inset:0; z-index:' + z + '; background:#0f172a; display:flex; flex-direction:column;';
        if (nuovo) ov.className = 'pj-v2';
        /* I comandi dei materiali (0079, Giacomo al gate del 09/10): non più in una
           fila sopra il pannello, ma nella barra in alto accanto ad «Affianca», e
           solo quando la scheda è aperta. Tutto a 40px e 12px (--mm-ctl-h,
           --mm-ctl-fs). Interruttore spento: la fila di prima, nel pannello. */
        var materiali =
            '      <button type="button" class="pj-btn" data-pj="scheda">' + _esc(t('pj_scheda', 'Scheda')) + '</button>' +
            '      <select class="pj-sel" data-pj="sel-oq"></select>' +
            '      <select class="pj-sel" data-pj="sel-fc"></select>';
        ov.innerHTML =
            '<div class="pj-bar">' +
            '  <span class="pj-titolo">' + _esc(mapName) + '</span>' +
            '  <span class="pj-sp"></span>' +
            (nuovo ? '  <span class="pj-materiali">' + materiali +
                '      <button type="button" class="pj-btn" data-pj="aa">Aa</button></span>' : '') +
            '  <button type="button" class="pj-btn" data-pj="split" aria-pressed="false">' + _esc(t('pj_affianca', 'Affianca')) + '</button>' +
            '  <button type="button" class="pj-btn" data-pj="chiudi" aria-label="' + _esc(t('mm_chiudi', 'Chiudi')) + '">&times;</button>' +
            '</div>' +
            '<div class="pj-corpo' + (nuovo ? ' pj-split is-mat-chiusa' : '') + '">' +
            '  <div class="pj-img-area">' +
            '    <img class="pj-img" alt="' + _esc(mapName) + '" draggable="false">' +
            /* Lo 0079 (Giacomo al gate del 09/10): pannellino più piccolo, il numero
               è il bottone — un clic adatta, doppio clic 100% — e «Adatta»/«100%»
               escono. Interruttore spento: il pannellino di prima. */
            (nuovo
                ? '    <div class="pj-zoombar pj-zoombar--compatta">' +
                  '      <button type="button" class="pj-btn" data-pj="z-">−</button>' +
                  '      <button type="button" class="pj-btn pj-pct" data-pj="fit" title="' + _esc(t('pj_pct_tip', 'Clic: l\'immagine si adatta all\'area · doppio clic: 100%')) + '">100%</button>' +
                  '      <button type="button" class="pj-btn" data-pj="z+">+</button>'
                : '    <div class="pj-zoombar">' +
                  '      <button type="button" class="pj-btn" data-pj="z-">−</button>' +
                  '      <span class="pj-pct">100%</span>' +
                  '      <button type="button" class="pj-btn" data-pj="z+">+</button>' +
                  '      <button type="button" class="pj-btn" data-pj="fit">' + _esc(t('pj_adatta', 'Adatta')) + '</button>' +
                  '      <button type="button" class="pj-btn" data-pj="z100">100%</button>') +
            '    </div>' +
            '  </div>' +
            (nuovo ? '  <div class="pj-divisore" role="separator" tabindex="0" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="100"></div>' : '') +
            '  <div class="pj-mat"' + (nuovo ? '' : ' hidden') + '>' +
            (nuovo ? '' :
                '    <div class="pj-mat-bar">' + materiali +
                '      <span class="pj-sp"></span>' +
                '      <button type="button" class="pj-btn" data-pj="aa">Aa</button>' +
                '    </div>') +
            '    <div class="pj-mat-corpo"></div>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(ov);

        var img = ov.querySelector('.pj-img');
        var area = ov.querySelector('.pj-img-area');
        var mat = ov.querySelector('.pj-mat');
        var matCorpo = ov.querySelector('.pj-mat-corpo');
        var pct = ov.querySelector('.pj-pct');
        var selOq = ov.querySelector('[data-pj="sel-oq"]');
        var selFc = ov.querySelector('[data-pj="sel-fc"]');

        /* lo stato della geometria: lo muovono rotellina, drag e pannellino */
        var st = { z: 1, x: 0, y: 0 };
        var corpo = C.CORPO_DEF;
        function applica() {
            st = C.clampPan(st, img.naturalWidth || 1, img.naturalHeight || 1, area.clientWidth, area.clientHeight);
            img.style.transform = 'translate(' + st.x + 'px,' + st.y + 'px) scale(' + st.z + ')';
            pct.textContent = Math.round(st.z * 100) + '%';
        }
        function fit() {
            st = C.adatta(img.naturalWidth || 1, img.naturalHeight || 1, area.clientWidth, area.clientHeight);
            applica();
        }
        img.addEventListener('load', fit);
        _foto(mapName, opts.vaultPath).then(function (f) {
            if (f && f.src) img.src = f.src;
            else {
                area.innerHTML = '<p style="color:#94a3b8; margin:auto; font-size:15px; padding:24px; text-align:center;">' +
                    _esc(t('pj_no_foto', 'La fotografia di questa fonte non è su questo computer: si proietta dal computer dove il dossier è stato creato.')) + '</p>';
            }
        });

        /* rotellina = ZOOM SUL PUNTATORE (core), drag = pan */
        area.addEventListener('wheel', function (e) {
            e.preventDefault();
            var r = area.getBoundingClientRect();
            st = C.zoomAlPunto(st, e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
            applica();
        }, { passive: false });
        var drag = null;
        area.addEventListener('pointerdown', function (e) {
            if (e.target.closest('.pj-zoombar')) return;
            drag = { x: e.clientX, y: e.clientY, sx: st.x, sy: st.y };
            area.setPointerCapture(e.pointerId);
            area.style.cursor = 'grabbing';
        });
        area.addEventListener('pointermove', function (e) {
            if (!drag) return;
            st.x = drag.sx + (e.clientX - drag.x);
            st.y = drag.sy + (e.clientY - drag.y);
            applica();
        });
        area.addEventListener('pointerup', function () { drag = null; area.style.cursor = ''; });

        /* la finestra cambia (o la split entra): l'immagine si ri-adatta solo
           se era «adattata» — un ingrandimento voluto non si tocca */
        var eraFit = true;
        /* 0079: con l'immagine chiusa dal divisore l'area è larga 0 — non si
           misura niente, o lo scostamento di un ingrandimento voluto si perde */
        function riFit() { if (!area.clientWidth) return; if (eraFit) fit(); else applica(); }
        window.addEventListener('resize', riFit);

        /* ── i materiali ── */
        function opzioni(sel, vuota, voci) {
            sel.innerHTML = '<option value="">' + _esc(vuota) + '</option>' +
                voci.map(function (v) { return '<option value="' + _esc(v.id) + '">' + _esc(v.et) + '</option>'; }).join('');
            sel.disabled = !voci.length;
        }
        var fogli = _fogliAperte(mapName);
        var mazzi = [];
        opzioni(selOq, t('pj_sel_oq', 'Domande aperte…'), fogli.map(function (d) {
            var nome = ''; try { nome = String(d.title).split(' - ')[1] || ''; } catch (e) { }
            return { id: d.id, et: nome || d.title };
        }));
        opzioni(selFc, t('pj_sel_fc', 'Flashcard…'), []);   /* arrivano dal disco */
        _setsFlashcard(mapName, opts.vaultPath).then(function (trovati) {
            mazzi = trovati;
            opzioni(selFc, t('pj_sel_fc', 'Flashcard…'), mazzi.map(function (x) {
                return { id: x.id, et: x.clone || x.title || 'Set' };
            }));
        });
        /* «Aa»: un bottone solo per la taglia di domande e flashcard (B7 nel core);
           sulla scheda-documento si nasconde, perché il documento ha il suo. */
        var aaBtn = ov.querySelector('[data-pj="aa"]');
        function aaScrivi() {
            var et = _aaEtichetta(corpo);
            aaBtn.setAttribute('aria-label', et);
            aaBtn.title = et + ' — ' + t('pj_aa_tip', 'un clic per la taglia successiva; dopo la più grande si torna a ×1');
        }
        aaScrivi();
        /* La voce del documento tace PRIMA che il documento sparisca: togliere
           l'iframe dal DOM non garantisce che speechSynthesis si fermi. */
        function spegniDoc() {
            var fr = matCorpo.querySelector('iframe.pj-doc');
            if (!fr) return;
            try { if (fr.contentWindow.speechSynthesis) fr.contentWindow.speechSynthesis.cancel(); } catch (e) { }
            try { Array.prototype.forEach.call(fr.contentDocument.querySelectorAll('audio'), function (au) { au.pause(); }); } catch (e) { }
        }
        function mostra(html) {
            spegniDoc();
            if (nuovo) apriMat();
            else {
                mat.hidden = false;
                ov.querySelector('[data-pj="split"]').setAttribute('aria-pressed', 'true');
            }
            matCorpo.classList.remove('pj-mat-corpo--doc');
            aaBtn.style.display = '';
            matCorpo.innerHTML = html;
            matCorpo.style.fontSize = corpo + 'px';
            riFit();
        }
        /* La scheda: col lotto B, il DOCUMENTO della sintesi in un iframe (senza
           sandbox, come i documenti dell'app in ELABORA; senza nascondere la sua
           barra: qui la barra È la lettura aumentata). Senza documento, la resa
           di prima. */
        function mostraScheda(sch) {
            var doc = nuovo ? _docScheda(sch, mapName) : null;
            if (!doc) { mostra(_htmlScheda(sch)); return; }
            spegniDoc();
            apriMat();
            matCorpo.innerHTML = '';
            matCorpo.classList.add('pj-mat-corpo--doc');
            matCorpo.style.fontSize = '';
            aaBtn.style.display = 'none';
            var fr = document.createElement('iframe');
            fr.className = 'pj-doc';
            fr.title = t('pj_scheda', 'Scheda');
            /* ESC chiude la proiezione anche col fuoco nel documento */
            fr.addEventListener('load', function () {
                try { fr.contentDocument.addEventListener('keydown', suTasto, true); } catch (e) { }
            });
            fr.srcdoc = doc;
            matCorpo.appendChild(fr);
            riFit();
        }

        /* ── LO SPLIT (lotto B): il disegno del divisore del Banco, chiuso da
           tutti e due i lati. La regola è nel core (splitDaPuntatore,
           splitDaTasto, splitLeggi); qui il DOM. Le colonne si chiudono con
           classi e `inert`, MAI con `hidden`: `#pj-overlay .pj-mat{display:flex}`
           batte l'attributo (misurato in Electron il 09/10: il pannello restava
           visibile). Si apre con la scheda chiusa; si ricorda solo la frazione.
           Sotto i 900px le colonne sono impilate: niente divisore, «Affianca»
           mostra e nasconde la scheda, nessuna colonna `inert`. */
        var corpoEl = ov.querySelector('.pj-corpo');
        var divisore = ov.querySelector('.pj-divisore');
        var splitBtn = ov.querySelector('[data-pj="split"]');
        var CHIAVE_SPLIT = 'mappai_proiezione_split';
        var sp = { frazione: C.SPLIT.DEF, chiusa: 'scheda' };
        try { sp.frazione = C.splitLeggi(localStorage.getItem(CHIAVE_SPLIT)); } catch (e) { }
        var mqStrette = null;
        try { mqStrette = window.matchMedia ? window.matchMedia('(max-width: 900px)') : null; } catch (e) { }
        function impilate() { return !!(mqStrette && mqStrette.matches); }
        function salvaSplit() { try { localStorage.setItem(CHIAVE_SPLIT, String(sp.frazione)); } catch (e) { } }
        var caricaScheda = false;
        /* `carica`: un gesto che apre la scheda vuota la va a prendere (non quando
           è `mostra` stesso ad aprirla per metterci domande o flashcard) */
        function applicaSplit(carica) {
            if (!nuovo) return;
            var stretto = impilate();
            var c = (stretto && sp.chiusa === 'immagine') ? null : sp.chiusa;
            corpoEl.classList.toggle('is-img-chiusa', c === 'immagine');
            corpoEl.classList.toggle('is-mat-chiusa', c === 'scheda');
            corpoEl.style.setProperty('--pj-img-w', (sp.frazione * 100).toFixed(2) + '%');
            area.inert = !stretto && c === 'immagine';
            mat.inert = !stretto && c === 'scheda';
            splitBtn.setAttribute('aria-pressed', c === 'scheda' ? 'false' : 'true');
            ov.classList.toggle('pj-mat-aperta', c !== 'scheda');   // i comandi dei materiali, in alto
            var et = c === 'immagine' ? t('pj_split_open_img', 'Riapri l\'immagine: trascina o fai clic')
                : c === 'scheda' ? t('pj_split_open_mat', 'Riapri la scheda: trascina o fai clic')
                    : t('pj_split_move', 'Sposta il confine fra immagine e scheda; oltre un bordo quella parte si chiude');
            divisore.title = et;
            divisore.setAttribute('aria-label', et);
            divisore.setAttribute('aria-valuenow', String(c === 'immagine' ? 0 : c === 'scheda' ? 100 : Math.round(sp.frazione * 100)));
            riFit();
            if (carica && c !== 'scheda' && !matCorpo.innerHTML && !caricaScheda) {
                caricaScheda = true;
                /* richiusa mentre si caricava: l'ultimo gesto del docente vince */
                _scheda(mapName, opts.vaultPath).then(function (sch) {
                    caricaScheda = false;
                    if (!matCorpo.innerHTML && sp.chiusa !== 'scheda') mostraScheda(sch);
                });
            }
        }
        function apriMat() { if (sp.chiusa === 'scheda') { sp = { frazione: sp.frazione, chiusa: null }; applicaSplit(false); } }
        function suLarghezza() { applicaSplit(false); }
        if (nuovo) {
            var presa = null;
            divisore.addEventListener('pointerdown', function (e) {
                if (e.button !== 0) return;
                e.preventDefault();
                presa = { x: e.clientX, mosso: false, id: e.pointerId, inizio: { frazione: sp.frazione, chiusa: sp.chiusa } };
                divisore.setPointerCapture(e.pointerId);
                corpoEl.classList.add('is-trascinando');
            });
            divisore.addEventListener('pointermove', function (e) {
                if (!presa || presa.id !== e.pointerId) return;
                if (Math.abs(e.clientX - presa.x) > 3) presa.mosso = true;
                if (!presa.mosso) return;
                var r = corpoEl.getBoundingClientRect();
                sp = C.splitDaPuntatore(e.clientX - r.left, r.width, presa.inizio);
                applicaSplit(false);
            });
            var lascia = function () {
                if (!presa) return;
                var p = presa; presa = null;
                corpoEl.classList.remove('is-trascinando');
                if (!p.mosso) {   // un clic: riapre la linguetta, sul divisore aperto non fa nulla
                    if (!sp.chiusa) return;
                    sp = { frazione: sp.frazione, chiusa: null };
                }
                applicaSplit(true); salvaSplit();
            };
            ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) { divisore.addEventListener(n, lascia); });
            divisore.addEventListener('keydown', function (e) {
                var dopo = C.splitDaTasto(sp, e.key);
                if (!dopo) return;
                e.preventDefault();
                sp = dopo; applicaSplit(true); salvaSplit();
            });
            if (mqStrette && typeof mqStrette.addEventListener === 'function') mqStrette.addEventListener('change', suLarghezza);
            applicaSplit(false);
        }
        selOq.addEventListener('change', function () {
            if (!selOq.value) return;
            selFc.value = '';
            mostra(_htmlAperte(_itemsFoglio(selOq.value)));
        });
        selFc.addEventListener('change', function () {
            if (!selFc.value) return;
            selOq.value = '';
            var set = mazzi.find(function (x) { return String(x.id) === selFc.value; });
            mostra(_htmlFlash((set && set.items) || []));
        });
        matCorpo.addEventListener('click', function (e) {
            var carta = e.target.closest && e.target.closest('[data-pj-flip]');
            if (!carta) return;
            var retro = carta.querySelector('.pj-retro');
            if (!retro) return;
            retro.hidden = !retro.hidden;
            carta.setAttribute('aria-expanded', retro.hidden ? 'false' : 'true');
        });

        function chiudi() {
            spegniDoc();
            document.removeEventListener('keydown', suTasto, true);
            window.removeEventListener('resize', riFit);
            if (mqStrette && typeof mqStrette.removeEventListener === 'function') mqStrette.removeEventListener('change', suLarghezza);
            ov.remove();
        }
        function suTasto(e) {
            if (e.key !== 'Escape') return;
            /* un modale del motore sopra (non dovrebbe): a lui il suo ESC */
            if (document.querySelector('.mm-overlay')) return;
            e.stopPropagation(); chiudi();
        }
        document.addEventListener('keydown', suTasto, true);

        ov.addEventListener('click', function (e) {
            var b = e.target.closest && e.target.closest('[data-pj]');
            if (!b) return;
            var a = b.getAttribute('data-pj');
            if (a === 'chiudi') chiudi();
            else if (a === 'split' && nuovo) {   // «Affianca» = la linguetta di destra (B3)
                sp = { frazione: sp.frazione, chiusa: sp.chiusa === 'scheda' ? null : 'scheda' };
                applicaSplit(true);
            }
            else if (a === 'split') {
                var aperta = !mat.hidden;
                mat.hidden = aperta;
                b.setAttribute('aria-pressed', aperta ? 'false' : 'true');
                if (!aperta && !matCorpo.innerHTML) _scheda(mapName, opts.vaultPath).then(function (sch) { mostra(_htmlScheda(sch)); });
                riFit();
            }
            else if (a === 'scheda') _scheda(mapName, opts.vaultPath).then(mostraScheda);
            else if (a === 'z+') { eraFit = false; var r1 = area.getBoundingClientRect(); st = C.zoomAlPunto(st, r1.width / 2, r1.height / 2, 1.25); applica(); }
            else if (a === 'z-') { eraFit = false; var r2 = area.getBoundingClientRect(); st = C.zoomAlPunto(st, r2.width / 2, r2.height / 2, 1 / 1.25); applica(); }
            else if (a === 'fit') { eraFit = true; fit(); }
            else if (a === 'z100') { eraFit = false; st.z = 1; applica(); }
            else if (a === 'aa') { corpo = C.aaSucc(corpo); matCorpo.style.fontSize = corpo + 'px'; aaScrivi(); }
        });
        area.addEventListener('pointerdown', function () { eraFit = false; }, true);
        area.addEventListener('wheel', function () { eraFit = false; }, true);
        /* il numero dello zoom: il clic adatta (data-pj="fit", qui sopra), il
           doppio clic porta al 100% — i due clic che lo precedono adattano, poi
           vince questo */
        var pctBtn = nuovo ? ov.querySelector('.pj-zoombar--compatta .pj-pct') : null;
        if (pctBtn) pctBtn.addEventListener('dblclick', function () { eraFit = false; st.z = 1; applica(); });
    }

    window.MappAIProiezione = { apri: apri };
    console.log('[MappAI] mappai-proiezione.js caricato ✓');
})();
