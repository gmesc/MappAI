/* =========================================================================
   mappai-rinomina.js — «RINOMINA…» UN PROGETTO (0094, ADR 0021)

   Giacomo, 13/10/2026: «i nomi della sidebar devono essere personalizzabili
   indipendentemente dal nome assegnato al momento della generazione […] siano i
   nomi del vault salvato sul pc»; «la mappa aperta si può rinominare»; «Rinomina…»
   nei menu della briciola e col tasto destro sulle voci della sidebar.

   Che cosa fa:
     · `apri(progetto)`        il modale del motore, poi `vault-rename` (main.js),
                               poi `riparaRiferimenti`, poi il bus degli elenchi;
     · `riparaRiferimenti(o)`  mappa aperta, riga del cassetto, fotografia,
                               padronanza, poi `riparaPipeline`;
     · `riparaPipeline(c, v)`  il `pipeline.json` di una cartella (anche per lo 0095);
     · `menuContestuale(box, risolvi)`  il menu col tasto destro della colonna;
     · il segnale della finestra che torna davanti (gli elenchi si rileggono).

   Le regole stanno nel core (`mappai-nome-cartella-core.js`); qui I/O e DOM.
   Interruttore `mappai_nome_da_cartella` (spento solo con '0').
   ⚠️ `appState` (let di app.js) e `StorageManager` (const di storage-lang) non
   stanno su window: si chiedono al nome lessicale (invariante 3).
   ========================================================================= */
(function () {
    'use strict';

    var t = function (k, f) { return (typeof window.t === 'function') ? window.t(k, f) : f; };
    var NC = function () { return window.MappAINomeCartellaCore; };
    function _st() { try { return (typeof appState !== 'undefined') ? appState : null; } catch (e) { return null; } }
    function _sm() { try { return (typeof StorageManager !== 'undefined') ? StorageManager : null; } catch (e) { return null; } }
    function _acceso() { try { return !!(NC() && NC().acceso(window.localStorage)); } catch (e) { return false; } }
    function _toast(m, tipo) { try { if (window.showToast) window.showToast(m, tipo); } catch (e) { } }
    function _nome(p) { return String(p == null ? '' : p).split(/[\\/]/).filter(Boolean).pop() || ''; }
    function _testo(b64) {
        try { return new TextDecoder().decode(Uint8Array.from(atob(b64 || ''), function (c) { return c.charCodeAt(0); })); }
        catch (e) { return null; }
    }
    function _aperta(vaultPath) {
        var s = _st();
        return !!(s && s.activeVaultPath && NC() && NC().stessoPercorso(s.activeVaultPath, vaultPath));
    }

    /* ── pipeline.json ───────────────────────────────────────────────────────
       → { ok, cambiati, version, error }. Senza file: { ok:true, cambiati:0 }.
       Scrive solo se qualcosa è cambiato, con la versione attesa (saveManifest). */
    async function riparaPipeline(cartella, vecchio) {
        var api = window.electronAPI;
        if (!cartella || !api || !api.readVaultFile || !api.saveVaultFile || !NC()) return { ok: false, cambiati: 0, error: 'non disponibile' };
        var r;
        try { r = await api.readVaultFile({ vaultPath: cartella, relPath: 'pipeline.json' }); } catch (e) { return { ok: false, cambiati: 0, error: e.message }; }
        if (!r || !r.ok) {
            if (r && /non trovato/.test(String(r.error || ''))) return { ok: true, cambiati: 0 };
            return { ok: false, cambiati: 0, error: (r && r.error) || 'lettura non riuscita' };
        }
        var m;
        try { m = JSON.parse(_testo(r.base64)); } catch (e) { return { ok: false, cambiati: 0, error: 'pipeline.json non leggibile' }; }
        var esito = NC().riparaPercorsi(m, cartella, vecchio || null);
        if (!esito.cambiati) return { ok: true, cambiati: 0, version: m && m._storageVersion };
        var w;
        try {
            w = await api.saveVaultFile({ vaultPath: cartella, relPath: 'pipeline.json',
                text: JSON.stringify(esito.manifest, null, 2), expectedVersion: (m && m._storageVersion) || 0 });
        } catch (e) { return { ok: false, cambiati: 0, error: e.message }; }
        if (!w || !w.ok) return { ok: false, cambiati: 0, error: (w && w.error) || 'scrittura non riuscita' };
        return { ok: true, cambiati: esito.cambiati, version: w.version };
    }

    /* ── tutti i riferimenti ─────────────────────────────────────────────────
       La parte SINCRONA viene prima di qualunque attesa: la riga del cassetto deve
       dire il nome nuovo nello stesso giro che cambia `activeVaultPath`, o la rete
       del 15/8 (saveCurrentProject) coniare un id nuovo (packet 0094, §0). */
    async function riparaRiferimenti(o) {
        o = o || {};
        var vecchio = o.vecchio, nuovo = o.nuovo, C = NC();
        if (!vecchio || !nuovo || !C) return { ok: false };
        var s = _st(), sm = _sm(), aperta = _aperta(vecchio);
        var idRiga = o.idRiga || (aperta && sm ? sm.currentProjectId : null);
        // 1. la mappa aperta
        if (aperta) {
            s.activeVaultPath = nuovo;
            if (sm && sm.idInCartella && C.stessoPercorso(sm.idInCartella.percorso, vecchio)) {
                sm.idInCartella = Object.assign({}, sm.idInCartella, { percorso: nuovo });
            }
            if (s._pipelineManifest) s._pipelineManifest = C.riparaPercorsi(s._pipelineManifest, nuovo, vecchio).manifest;
        }
        // 2. la riga del cassetto
        try {
            var righe = JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]');
            if (Array.isArray(righe) && idRiga) {
                var cambiata = false;
                righe = righe.map(function (p) {
                    if (!p || p.id !== idRiga) return p;
                    cambiata = true;
                    return C.rigaRinominata(p, { vecchio: vecchio, nuovo: nuovo, radice: sm && sm._radice });
                });
                if (cambiata) localStorage.setItem('tutor_ai_projects', JSON.stringify(righe));
            }
        } catch (e) { /* la riga si ripara al primo salvataggio (eccezione `dallaCartella`) */ }
        // 3. la fotografia (a quota piena si lascia: «Riprendi» la ritrova per id, lotto D)
        try {
            var raw = idRiga ? localStorage.getItem(idRiga) : null;
            if (raw) {
                var foto = JSON.parse(raw);
                if (foto && C.stessoPercorso(foto.activeVaultPath, vecchio)) {
                    foto.activeVaultPath = nuovo;
                    if (foto._pipelineManifest) foto._pipelineManifest = C.riparaPercorsi(foto._pipelineManifest, nuovo, vecchio).manifest;
                    localStorage.setItem(idRiga, JSON.stringify(foto));
                }
            }
        } catch (e) { }
        // 4. la padronanza: la vecchia si toglie solo se la nuova si rilegge uguale
        try {
            var kv = 'mappai_mastery::' + vecchio, kn = 'mappai_mastery::' + nuovo, pv = localStorage.getItem(kv);
            if (pv && !localStorage.getItem(kn)) {
                localStorage.setItem(kn, pv);
                if (localStorage.getItem(kn) === pv) localStorage.removeItem(kv);
            }
        } catch (e) { }
        // 5. pipeline.json: per la mappa aperta si scrive quello in memoria (è quello che l'app scriverebbe dopo)
        var esito;
        if (aperta && s._pipelineManifest && window.MappAIReview && window.MappAIReview.writeManifest) {
            try { await window.MappAIReview.writeManifest(nuovo, s._pipelineManifest); esito = { ok: true, cambiati: 1 }; }
            catch (e) { esito = await riparaPipeline(nuovo, vecchio); }
        } else {
            esito = await riparaPipeline(nuovo, vecchio);
            if (aperta && esito.ok && esito.version && s._pipelineManifest && _aperta(nuovo)) s._pipelineManifest._storageVersion = esito.version;
        }
        return { ok: true, pipeline: esito };
    }

    /* ── il modale ───────────────────────────────────────────────────────────
       progetto = { vaultPath, nome, titolo, projectId, idRiga, lettura } */
    async function apri(p) {
        p = p || {};
        if (!_acceso()) return false;
        var api = window.electronAPI;
        if (!p.vaultPath || !api || !api.vaultRename) return false;
        if (window.mappaiOccupato && window.mappaiOccupato()) return false;   // dice da sé il motivo
        var s = _st();
        if (_aperta(p.vaultPath) && s && s.extractionMode === 'lettura') {
            _toast(t('rn_lettura_aperta', 'Questo percorso di lettura è aperto: apri un altro progetto, poi rinominalo.'), 'warning');
            return false;
        }
        var nome = p.nome || _nome(p.vaultPath);
        var FC = window.MappAIFilesCore;
        var proposta = NC().nomeProposto(nome, p.titolo, FC && FC.vaultFolderName);
        if (!window.MappAIModal || !window.MappAIModal.open) return false;
        var r = await window.MappAIModal.open({
            titolo: t('rn_titolo', 'Rinomina il progetto'), icona: 'pencil', taglia: 's',
            sezioni: [{ campi: [{ id: 'nome', tipo: 'testo', etichetta: t('rn_campo', 'Nome della cartella'), valore: proposta || nome }] }],
            azioni: [
                { id: 'no', etichetta: t('mm_annulla', 'Annulla') },
                { id: 'si', etichetta: t('rn_ok', 'Rinomina'), ruolo: 'primario' }
            ]
        });
        if (!r || r.azione !== 'si') return false;
        var scelto = String((r.valori && r.valori.nome) || '').trim();
        if (!scelto) { _toast(t('rn_vuoto', 'Scrivi un nome.'), 'warning'); return false; }
        if (window.mappaiOccupato && window.mappaiOccupato()) return false;
        var sm = _sm(), aperta = _aperta(p.vaultPath);
        var id = (aperta && sm && sm.idInCartella && NC().stessoPercorso(sm.idInCartella.percorso, p.vaultPath) && sm.idInCartella.id)
            || p.idRiga || null;
        var res;
        try { res = await api.vaultRename({ folderPath: p.vaultPath, nome: scelto, projectId: id }); } catch (e) { res = null; }
        if (!res || !res.success) { _toast(t('rn_ko', 'Non è stato possibile rinominare la cartella.'), 'error'); return false; }
        if (res.invariato) return true;
        await riparaRiferimenti({ vecchio: p.vaultPath, nuovo: res.fullPath, idRiga: p.idRiga || (aperta && sm ? sm.currentProjectId : null) });
        if (res.suffisso) _toast(t('rn_esiste', 'Questo nome esiste già, potrai modificarlo in seguito o tenere la numerazione automatica.'), 'info');
        else _toast(t('rn_fatto', 'Rinominato: «{nome}».').replace('{nome}', res.folderName), 'success');
        try { if (window.MappAIVaults) window.MappAIVaults.segnala('cartella-rinominata', { vaultPath: res.fullPath, prima: p.vaultPath }); } catch (e) { }
        if (typeof p.dopo === 'function') { try { p.dopo(res); } catch (e) { } }
        return res;
    }

    /* ── il menu col tasto destro della colonna ──────────────────────────────
       Stesso aspetto del menu della briciola (`.mn-bric-menu`, veste manifesto),
       uno stile minimo in linea per quando la veste è spenta. Una voce sola. */
    function _chiudiMenu() {
        var m = document.querySelector('.mn-bric-menu[data-rinomina]');
        if (m) m.remove();
    }
    /* ⚠️ Gate del 13/10: ELABORA ridisegna il riquadro della console, e un ascoltatore
       agganciato al riquadro di prima spariva con lui (in INSEGNA il riquadro resta).
       L'ascoltatore è UNO, sul documento; ogni console registra il suo `risolvi` (gli
       id delle voci non si sovrappongono: `p:`/`v:` in INSEGNA, `prog:` in ELABORA). */
    var _risolutori = [];
    function menuContestuale(box, risolvi) {
        if (typeof risolvi !== 'function') return;
        _risolutori = _risolutori.filter(function (r) { return r.box !== box; });
        _risolutori.push({ box: box, risolvi: risolvi });
        if (_risolutori.length > 4) _risolutori.shift();
        if (document._rinominaMenu) return;
        document._rinominaMenu = true;
        document.addEventListener('contextmenu', function (ev) {
            if (!_acceso()) return;
            var voce = ev.target && ev.target.closest && ev.target.closest('.mm-nav__v[data-nav]');
            if (!voce) return;
            var box = voce.closest('.mm-box') || document.body;
            var p = null, nav = voce.getAttribute('data-nav');
            for (var i = _risolutori.length - 1; i >= 0 && !p; i--) {
                try { p = _risolutori[i].risolvi(nav); } catch (e) { p = null; }
            }
            if (!p || !p.vaultPath) return;
            ev.preventDefault();
            _chiudiMenu();
            try { if (window.MappAIConsoleBento && window.MappAIConsoleBento.chiudiPercorso) window.MappAIConsoleBento.chiudiPercorso(); } catch (e) { }
            var menu = document.createElement('div');
            menu.className = 'mn-bric-menu';
            menu.setAttribute('role', 'menu');
            menu.setAttribute('data-rinomina', '');
            menu.style.cssText = 'position:absolute;z-index:30;background:#fff;border:1px solid var(--mm-bordo,#cbd5e1);border-radius:4px;padding:6px;';
            var it = document.createElement('button');
            it.type = 'button';
            it.setAttribute('role', 'menuitem');
            it.className = 'mn-bric-menu__it';
            it.innerHTML = '<span class="mn-bric-menu__et"></span>';
            it.firstChild.textContent = t('rn_voce', 'Rinomina…');
            it.addEventListener('click', function (e) { e.stopPropagation(); _chiudiMenu(); apri(p); });
            menu.appendChild(it);
            box.appendChild(menu);
            var rb = box.getBoundingClientRect();
            var x = Math.min(ev.clientX, window.innerWidth - menu.offsetWidth - 8), y = Math.min(ev.clientY, window.innerHeight - menu.offsetHeight - 8);
            menu.style.left = Math.max(8, x) - rb.left + box.scrollLeft + 'px';
            menu.style.top = Math.max(8, y) - rb.top + box.scrollTop + 'px';
            var fuori = function (e) {
                if (menu.contains(e.target)) return;
                _chiudiMenu(); document.removeEventListener('mousedown', fuori, true); document.removeEventListener('keydown', esc, true);
            };
            var esc = function (e) {
                if (e.key !== 'Escape') return;
                e.stopPropagation(); _chiudiMenu(); document.removeEventListener('mousedown', fuori, true); document.removeEventListener('keydown', esc, true);
            };
            setTimeout(function () { document.addEventListener('mousedown', fuori, true); document.addEventListener('keydown', esc, true); }, 0);
        });
    }

    /* ── la finestra che torna davanti (S5): gli elenchi si rileggono ──────── */
    var _via = 0;
    window.addEventListener('blur', function () { _via = Date.now(); });
    window.addEventListener('focus', function () {
        if (!_via) return;
        var fuori = Date.now() - _via; _via = 0;
        if (fuori < 1000 || !_acceso()) return;
        try { if (window.MappAIVaults) window.MappAIVaults.segnala('finestra-in-primo-piano', null); } catch (e) { }
    });

    window.MappAIRinomina = {
        apri: apri,
        riparaRiferimenti: riparaRiferimenti,
        riparaPipeline: riparaPipeline,
        menuContestuale: menuContestuale,
        acceso: _acceso
    };
})();
