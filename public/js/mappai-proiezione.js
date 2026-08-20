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
    function _scheda(mapName) {
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
        function daB64(b64) {
            var bin = atob(b64), bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return new TextDecoder('utf-8').decode(bytes);
        }
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
            var sch = _scheda(mapName);
            return (sch && sch.fotoB64)
                ? Promise.resolve({ src: 'data:' + (sch.mime || 'image/jpeg') + ';base64,' + sch.fotoB64 })
                : Promise.resolve(null);
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

    /* ── LA VISTA ────────────────────────────────────────────────────────────*/
    function apri(opts) {
        opts = opts || {};
        var C = CORE();
        if (!C) { toast(t('pj_no_core', 'La proiezione non è caricata.'), 'warning'); return; }
        var mapName = opts.mapName || '';
        var z = (window.MappAIModal && window.MappAIModal.prossimoZ) ? window.MappAIModal.prossimoZ() : 12000;

        var ov = document.createElement('div');
        ov.id = 'pj-overlay';
        ov.style.cssText = 'position:fixed; inset:0; z-index:' + z + '; background:#0f172a; display:flex; flex-direction:column;';
        ov.innerHTML =
            '<div class="pj-bar">' +
            '  <span class="pj-titolo">' + _esc(mapName) + '</span>' +
            '  <span class="pj-sp"></span>' +
            '  <button type="button" class="pj-btn" data-pj="split" aria-pressed="false">' + _esc(t('pj_affianca', 'Affianca')) + '</button>' +
            '  <button type="button" class="pj-btn" data-pj="chiudi" aria-label="' + _esc(t('mm_chiudi', 'Chiudi')) + '">&times;</button>' +
            '</div>' +
            '<div class="pj-corpo">' +
            '  <div class="pj-img-area">' +
            '    <img class="pj-img" alt="' + _esc(mapName) + '" draggable="false">' +
            '    <div class="pj-zoombar">' +
            '      <button type="button" class="pj-btn" data-pj="z-">−</button>' +
            '      <span class="pj-pct">100%</span>' +
            '      <button type="button" class="pj-btn" data-pj="z+">+</button>' +
            '      <button type="button" class="pj-btn" data-pj="fit">' + _esc(t('pj_adatta', 'Adatta')) + '</button>' +
            '      <button type="button" class="pj-btn" data-pj="z100">100%</button>' +
            '    </div>' +
            '  </div>' +
            '  <div class="pj-mat" hidden>' +
            '    <div class="pj-mat-bar">' +
            '      <button type="button" class="pj-btn" data-pj="scheda">' + _esc(t('pj_scheda', 'Scheda')) + '</button>' +
            '      <select class="pj-sel" data-pj="sel-oq"></select>' +
            '      <select class="pj-sel" data-pj="sel-fc"></select>' +
            '      <span class="pj-sp"></span>' +
            '      <button type="button" class="pj-btn" data-pj="a-">A−</button>' +
            '      <button type="button" class="pj-btn" data-pj="a+">A+</button>' +
            '    </div>' +
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
        function riFit() { if (eraFit) fit(); else applica(); }
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
        function mostra(html) {
            mat.hidden = false;
            ov.querySelector('[data-pj="split"]').setAttribute('aria-pressed', 'true');
            matCorpo.innerHTML = html;
            matCorpo.style.fontSize = corpo + 'px';
            riFit();
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
            document.removeEventListener('keydown', suTasto, true);
            window.removeEventListener('resize', riFit);
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
            else if (a === 'split') {
                var aperta = !mat.hidden;
                mat.hidden = aperta;
                b.setAttribute('aria-pressed', aperta ? 'false' : 'true');
                if (!aperta && !matCorpo.innerHTML) mostra(_htmlScheda(_scheda(mapName)));
                riFit();
            }
            else if (a === 'scheda') mostra(_htmlScheda(_scheda(mapName)));
            else if (a === 'z+') { eraFit = false; var r1 = area.getBoundingClientRect(); st = C.zoomAlPunto(st, r1.width / 2, r1.height / 2, 1.25); applica(); }
            else if (a === 'z-') { eraFit = false; var r2 = area.getBoundingClientRect(); st = C.zoomAlPunto(st, r2.width / 2, r2.height / 2, 1 / 1.25); applica(); }
            else if (a === 'fit') { eraFit = true; fit(); }
            else if (a === 'z100') { eraFit = false; st.z = 1; applica(); }
            else if (a === 'a+') { corpo = C.corpoSu(corpo); matCorpo.style.fontSize = corpo + 'px'; }
            else if (a === 'a-') { corpo = C.corpoGiu(corpo); matCorpo.style.fontSize = corpo + 'px'; }
        });
        area.addEventListener('pointerdown', function () { eraFit = false; }, true);
        area.addEventListener('wheel', function () { eraFit = false; }, true);
    }

    window.MappAIProiezione = { apri: apri };
    console.log('[MappAI] mappai-proiezione.js caricato ✓');
})();
