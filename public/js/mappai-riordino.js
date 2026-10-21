/*
 * mappai-riordino.js — i riferimenti dopo la riorganizzazione della beta.8 (0104, ADR 0023)
 * -----------------------------------------------------------------------
 * La riorganizzazione la fa main.js prima che si apra la finestra, e ripara su
 * disco `pipeline.json` e i `vault.json` delle sessioni. Qui si ripara ciò che
 * vive nella memoria della finestra (localStorage): la riga del cassetto, la
 * fotografia di «Riprendi», la padronanza. Lo fa `MappAIRinomina.riparaRiferimenti`
 * (0094): uno spostamento di progetto è come una rinomina dal Finder (ADR 0021).
 *
 * Al primo caricamento si leggono dal registro gli spostamenti di progetto non
 * ancora applicati in QUESTA finestra (`mappai_riordino_applicato`: id del
 * registro → quanti) e si applicano in ordine; il ritorno indietro è nello stesso
 * registro (giro «indietro»), quindi segue la stessa strada. Una volta sola.
 *
 * API: window.MappAIRiordino.applica() → Promise<{ applicati }>
 */
(function () {
    'use strict';

    var LS = 'mappai_riordino_applicato';
    function RC() { return window.MappAIRiordinoCore; }
    function FC() { return window.MappAIFilesCore; }
    function NC() { return window.MappAINomeCartellaCore; }
    function _letti() { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { return {}; } }
    function _scrivi(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) { } }
    function _righe() {
        try { var r = JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]'); return Array.isArray(r) ? r : []; }
        catch (e) { return []; }
    }
    function _stesso(a, b) {
        var C = NC();
        if (C && C.stessoPercorso) return C.stessoPercorso(a, b);
        return !!a && String(a).replace(/\\/g, '/').replace(/\/+$/, '') === String(b).replace(/\\/g, '/').replace(/\/+$/, '');
    }

    /* La riga del cassetto di quel progetto: per id (il projectId del registro) o,
       per le cartelle senza id, per percorso (`vaultPath`, o `cartella` relativa
       alla cartella madre) e, se la riga non lo scrive, per la sua fotografia di
       «Riprendi», che il percorso ce l'ha sempre (gate del 16/10: le righe di due
       cartelle senza id restavano sulla cartella vecchia). */
    function _fotoDi(id) {
        try { var f = JSON.parse(localStorage.getItem(id) || 'null'); return f && f.activeVaultPath; } catch (e) { return null; }
    }
    function idRiga(righe, f, vecchio, radice) {
        var R = RC();
        var hit = (righe || []).filter(function (p) {
            if (!p) return false;
            if (f.projectId && (p.id === f.projectId || p.projectId === f.projectId)) return true;
            if (p.vaultPath && _stesso(p.vaultPath, vecchio)) return true;
            if (p.cartella) {
                var c = String(p.cartella);
                var abs = /^([\/\\]|[a-zA-Z]:)/.test(c) ? c : R.assoluto(radice, c.split(/[\/\\]/));
                if (_stesso(abs, vecchio)) return true;
            }
            return false;
        })[0];
        if (!hit) hit = (righe || []).filter(function (p) { return p && p.id && _stesso(_fotoDi(p.id), vecchio); })[0];
        return hit ? hit.id : null;
    }

    /* classe e materia dalla POSIZIONE nuova (invariante 7): segmenti relativi alla
       cartella madre → { classDir, discDir }. Classi/<c>/[<m>/]<p>, Classi/Senza
       classe/…, Allievi/<n>/[<m>/]<p>, e al ritorno Mappe/<c>/[<m>/]<p>, Mappe/Generico/<p>. */
    function posizione(a) {
        var F = FC(), SUB = F.SUB;
        a = a || [];
        var testa = a[0], dentro = a.slice(1, -1);
        if (testa === SUB.students) return { classDir: null, discDir: dentro.length === 2 ? dentro[1] : null };
        if (testa === SUB.classes || testa === SUB.maps) {
            if (!dentro.length) return { classDir: null, discDir: null };
            return { classDir: F.classDirDaCartella(dentro[0]), discDir: dentro.length === 2 ? dentro[1] : null };
        }
        return { classDir: null, discDir: null };
    }
    function _posaPosizione(id, a) {
        if (!id) return;
        var pos = posizione(a), righe = _righe(), cambiata = false;
        righe = righe.map(function (p) {
            if (!p || p.id !== id) return p;
            cambiata = true;
            return Object.assign({}, p, { classDir: pos.classDir, discDir: pos.discDir });
        });
        if (cambiata) { try { localStorage.setItem('tutor_ai_projects', JSON.stringify(righe)); } catch (e) { } }
    }

    async function applica() {
        var api = window.electronAPI;
        if (!api || !api.strutturaStato || !RC() || !FC()) return { applicati: 0 };
        var st;
        try { st = await api.strutturaStato(); } catch (e) { return { applicati: 0 }; }
        var reg = st && st.ok && st.registro;
        if (!reg || !reg.id || !st.rootDir) return { applicati: 0 };
        var fatti = RC().spostamentiFatti(reg), letti = _letti(), n = letti[reg.id] || 0, applicati = 0;
        var Rin = window.MappAIRinomina;
        for (var i = n; i < fatti.length; i++) {
            var f = fatti[i];
            if (f.tipo === 'progetto' && Rin && Rin.riparaRiferimenti) {
                var vecchio = RC().assoluto(st.rootDir, f.da), nuovo = RC().assoluto(st.rootDir, f.a);
                var id = idRiga(_righe(), f, vecchio, st.rootDir);
                try { await Rin.riparaRiferimenti({ vecchio: vecchio, nuovo: nuovo, idRiga: id }); } catch (e) { }
                _posaPosizione(id, f.a);
                applicati++;
            }
            letti[reg.id] = i + 1;
            _scrivi(letti);
        }
        if (applicati) { try { if (window.MappAIVaults) window.MappAIVaults.segnala('riorganizzata', {}); } catch (e) { } }
        return { applicati: applicati };
    }

    window.MappAIRiordino = { applica: applica, posizione: posizione, idRiga: idRiga };

    /* al primo caricamento: i moduli che servono (rinomina, core) sono caricati
       quando arriva `load`; un attimo dopo, per non pesare sull'avvio */
    if (typeof window.addEventListener === 'function') {
        window.addEventListener('load', function () { setTimeout(function () { applica().catch(function () { }); }, 0); });
    }
})();
