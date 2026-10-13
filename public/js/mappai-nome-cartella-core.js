/* =========================================================================
   mappai-nome-cartella-core.js — IL NOME DEL PROGETTO È LA SUA CARTELLA (0094)

   ADR 0021 (Giacomo, 13/10/2026): la sidebar e gli elenchi mostrano il nome
   della cartella; il docente lo cambia con «Rinomina…»; l'identità resta il
   `projectId` (ADR 0013), mai il nome.

   Qui, e solo qui (invariante 4), le regole pure:
     · `acceso`          l'interruttore `mappai_nome_da_cartella` (acceso se manca
                         o vale '1', spento solo con '0');
     · `nomeLibero`      il nome libero fra i fratelli, col suffisso « · 0N»;
     · `riparaPercorsi`  i percorsi di un manifesto (`pipeline.json`) dopo che la
                         cartella ha cambiato nome o posto; la usa anche lo 0095;
     · `rigaRinominata`  la riga del cassetto (`tutor_ai_projects`) dopo la rinomina;
     · `nomeProvvisorio` / `nomeProposto`  i nomi dati dall'app, e la proposta dal titolo;
     · `stessoPercorso`  il confronto dei percorsi (NFC, `\` → `/`, senza `/` finale).

   Niente DOM, niente `window` nelle funzioni, niente localStorage (chi chiama
   passa il suo `storage`). Lo usano il renderer, `main.js` e i test.
   ========================================================================= */
(function (root, factory) {
    var CORE = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
    if (typeof window !== 'undefined') window.MappAINomeCartellaCore = CORE;
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var CHIAVE = 'mappai_nome_da_cartella';

    function acceso(storage) {
        try { return !storage || typeof storage.getItem !== 'function' || storage.getItem(CHIAVE) !== '0'; }
        catch (e) { return true; }
    }

    function _nfc(s) { var v = String(s == null ? '' : s); try { return v.normalize('NFC'); } catch (e) { return v; } }
    function _chiave(s) { return _nfc(s).toLowerCase(); }
    function _forma(p) { return _nfc(p).replace(/\\/g, '/').replace(/\/+$/, ''); }
    function stessoPercorso(a, b) { var x = _forma(a), y = _forma(b); return !!x && x === y; }
    function _esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    /* Il nome libero fra i FRATELLI (le cartelle della stessa cartella madre) e i
       nomi RISERVATI. Confronto NFC + minuscole (APFS non distingue le maiuscole);
       il nome che esce tiene la grafia chiesta. Preso → « · 0N» con N = max(2,
       ultimo + 1): la regola di `vault-relocate` e di `_nomeCartellaLibero`. */
    function nomeLibero(nome, fratelli, riservati) {
        var base = String(nome == null ? '' : nome);
        var tutti = [].concat(Array.isArray(fratelli) ? fratelli : [], Array.isArray(riservati) ? riservati : [])
            .map(_chiave);
        var k = _chiave(base);
        if (tutti.indexOf(k) < 0) return { nome: base, suffisso: false };
        var re = new RegExp('^' + _esc(k) + ' · (\\d+)$'), ultimo = 1;
        tutti.forEach(function (f) { var m = re.exec(f); if (m) ultimo = Math.max(ultimo, parseInt(m[1], 10) || 0); });
        var n = Math.max(2, ultimo + 1), cand;
        do { cand = base + ' · ' + String(n).padStart(2, '0'); n++; } while (tutti.indexOf(_chiave(cand)) >= 0);
        return { nome: cand, suffisso: true };
    }

    /* I percorsi di un manifesto. Copia profonda; a QUALUNQUE profondità (le tre
       chiavi dell'ADR, la catena `review.final.previous.…`, `review.deliveries[]`,
       `modelliGiro.chiamate[]`, misurati sui `pipeline.json` veri il 13/10) ogni
       stringa uguale a un percorso vecchio diventa `nuovo`, e ogni stringa che
       comincia con un percorso vecchio seguito da `/` o `\` diventa `nuovo` + il
       resto. I percorsi vecchi: `vecchio`, se c'è; se no i valori distinti delle
       chiavi `vaultPath` del manifesto stesso (lo 0095: il percorso vecchio è di
       un altro computer). `_storageVersion` resta com'è. */
    function riparaPercorsi(manifest, nuovo, vecchio) {
        var copia = (manifest && typeof manifest === 'object') ? JSON.parse(JSON.stringify(manifest)) : manifest;
        var esito = { manifest: copia, cambiati: 0 };
        if (!copia || typeof copia !== 'object' || !nuovo) return esito;
        var dest = String(nuovo).replace(/[\\/]+$/, '');
        var vecchi = [];
        if (vecchio) vecchi.push(_forma(vecchio));
        else {
            (function cerca(o) {
                if (!o || typeof o !== 'object') return;
                Object.keys(o).forEach(function (k) {
                    var v = o[k];
                    if (k === 'vaultPath' && typeof v === 'string' && v.trim()) {
                        var f = _forma(v);
                        if (f && vecchi.indexOf(f) < 0) vecchi.push(f);
                    } else if (v && typeof v === 'object') cerca(v);
                });
            })(copia);
        }
        vecchi = vecchi.filter(function (v) { return v && v !== _forma(dest); });
        if (!vecchi.length) return esito;
        function rifai(s) {
            var f = _nfc(s).replace(/\\/g, '/');
            for (var i = 0; i < vecchi.length; i++) {
                var v = vecchi[i];
                if (f.replace(/\/+$/, '') === v) return dest;
                if (f.indexOf(v + '/') === 0) return dest + f.slice(v.length);
            }
            return null;
        }
        (function cammina(o) {
            Object.keys(o).forEach(function (k) {
                var v = o[k];
                if (typeof v === 'string') {
                    var r = rifai(v);
                    if (r !== null && r !== v) { o[k] = r; esito.cambiati++; }
                } else if (v && typeof v === 'object') cammina(v);
            });
        })(copia);
        return esito;
    }

    function _ultimo(p) { return String(p == null ? '' : p).split(/[\\/]/).filter(Boolean).pop() || ''; }
    function _relativo(full, radice) {
        if (full == null || String(full) === '') return null;
        if (!radice) return String(full);
        var f = String(full).replace(/\\/g, '/'), r = String(radice).replace(/\\/g, '/').replace(/\/+$/, '');
        if (r && f.indexOf(r + '/') === 0) { var rel = f.slice(r.length + 1).replace(/^\/+|\/+$/g, ''); if (rel) return rel; }
        return String(full);
    }

    /* La riga del cassetto dopo la rinomina: `vault` = il nome nuovo; `cartella`
       (se la riga ce l'ha) = il percorso relativo alla radice o intero, come
       `percorsoRiga`; `vaultPath` e `superata.cartella` solo se erano `vecchio`.
       Il titolo (`name`) resta: lo usano il registro delle sessioni e i
       materiali (scelta S1 del packet). */
    function rigaRinominata(riga, o) {
        o = o || {};
        if (!riga || typeof riga !== 'object' || !o.nuovo) return riga;
        var r = JSON.parse(JSON.stringify(riga));
        r.vault = _ultimo(o.nuovo);
        if (Object.prototype.hasOwnProperty.call(r, 'cartella') && r.cartella != null) r.cartella = _relativo(o.nuovo, o.radice);
        if (o.vecchio && typeof r.vaultPath === 'string' && stessoPercorso(r.vaultPath, o.vecchio)) r.vaultPath = String(o.nuovo);
        if (o.vecchio && r.superata && typeof r.superata === 'object' && r.superata.cartella && stessoPercorso(r.superata.cartella, o.vecchio)) {
            r.superata.cartella = String(o.nuovo);
        }
        return r;
    }

    /* I nomi che l'app ha dato da sola: `Lettura-proj_<cifre>` (le letture prima
       dello 0094) e i doppioni « · <cifre>». */
    function nomeProvvisorio(nome) {
        var s = _nfc(nome).trim();
        return /^Lettura-proj_\d+$/.test(s) || / · \d+$/.test(s);
    }
    function _senzaSuffisso(s) { return _nfc(s).trim().replace(/ · \d+$/, ''); }

    /* La proposta dal titolo, se il nome è provvisorio e il titolo dà un nome
       diverso dal nome senza suffisso; altrimenti ''. `pulisci` = la regola dei
       nomi (FilesCore.vaultFolderName), passata da chi chiama. */
    function nomeProposto(nome, titolo, pulisci) {
        if (!nomeProvvisorio(nome)) return '';
        var t = String(titolo == null ? '' : titolo).trim();
        if (!t) return '';
        var p = typeof pulisci === 'function' ? String(pulisci(t) || '') : t;
        if (!p.trim()) return '';
        if (_chiave(p) === _chiave(_senzaSuffisso(nome))) return '';
        return p;
    }

    return {
        CHIAVE: CHIAVE,
        acceso: acceso,
        nomeLibero: nomeLibero,
        riparaPercorsi: riparaPercorsi,
        rigaRinominata: rigaRinominata,
        nomeProvvisorio: nomeProvvisorio,
        nomeProposto: nomeProposto,
        stessoPercorso: stessoPercorso
    };
}));
