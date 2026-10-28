/* =========================================================================
   mappai-confini-core.js — DOVE PUÒ ANDARE UNA FINESTRA, e che cosa può chiedere
   (22/10/26, packet 0123 lotto 1; specifica nel packet 0028)

   Fino al 22/10 main.js rispondeva `allow` a ogni `window.open` e non guardava
   dove navigava la finestra principale: un link esterno in una desc o nel
   tutor portava la finestra col ponte `electronAPI` su un sito remoto, che da
   lì aveva il disco del docente. Qui stanno le REGOLE, pure: main.js le
   applica (`web-contents-created`, `setWindowOpenHandler`, `will-navigate`,
   `setPermissionRequestHandler`, `open-external`), i test le leggono in Node.

   Tre domande:
   - apertura(url) → 'app' | 'esterno' | 'no'. Una finestra NUOVA (window.open,
     un link con target="_blank"): 'app' si apre dentro Electron — le stampe
     su about:blank + document.write, i PDF in blob:, i resoconti LIVE dei
     server dell'app su 127.0.0.1, le pagine interne di Chromium; 'esterno' va
     al browser di sistema — http e https verso altri host, mailto; 'no' non si
     apre da nessuna parte — javascript:, smb:, ftp:, gli schemi che lanciano
     un programma, ciò che non è un indirizzo.
   - navigazioneAmmessa(url, { radiceApp, figlia }) → la finestra col ponte
     può cambiare pagina SOLO verso un file sotto la radice dell'app (la
     ricarica di HOME è `location.reload()` su public/index.html). Una figlia
     (aperta da window.open, nasce senza ponte) carica anche i server su
     127.0.0.1 e localhost, blob: e about: (packet 0129). Tutto il resto si
     ferma; ciò che è 'esterno' va al browser di sistema.
   - permessoAmmesso(nome) → i permessi del browser che l'app concede.
     Misurato il 22/10 su public/js: nessun microfono, camera, notifica,
     posizione, schermo intero; solo `navigator.clipboard.writeText` (12
     righe), che in Electron chiede `clipboard-sanitized-write`. La voce
     (speechSynthesis) non chiede permessi.
   E dal lotto 4 (23/10) una quarta, sul disco:
   - sottoRadice(percorso, radici, opts) → il percorso sta sotto una delle
     cartelle dell'app (o coincide con una)? Vedi in fondo.
   ========================================================================= */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIConfiniCore = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var SCHEMI_APP = ['about:', 'blob:', 'data:', 'file:', 'chrome:', 'chrome-extension:', 'devtools:'];
    var SCHEMI_ESTERNI = ['http:', 'https:', 'mailto:'];
    var HOST_APP = ['127.0.0.1', 'localhost', '[::1]'];
    var PERMESSI_AMMESSI = ['clipboard-sanitized-write'];

    function _url(u) {
        try { return new URL(String(u == null ? '' : u).trim()); } catch (e) { return null; }
    }

    /* `window.open()` senza indirizzo apre about:blank: vuoto, null e
       undefined sono la stessa finestra dell'app. */
    function apertura(url) {
        var s = url == null ? '' : String(url).trim();
        if (!s) return 'app';
        var u = _url(s);
        if (!u) return 'no';
        if (SCHEMI_APP.indexOf(u.protocol) >= 0) return 'app';
        if (u.protocol === 'mailto:') return 'esterno';
        if (u.protocol === 'http:' || u.protocol === 'https:') {
            if (!u.hostname) return 'no';
            /* l'host intero, non un prefisso: «127.0.0.1.evil» è fuori */
            return HOST_APP.indexOf(u.hostname) >= 0 ? 'app' : 'esterno';
        }
        return 'no';
    }

    /* Il filtro di `open-external`: qualunque host, ma solo gli schemi che un
       browser o un programma di posta sanno aprire senza eseguire niente. */
    function schemaEsterno(url) {
        var u = _url(url);
        if (!u || SCHEMI_ESTERNI.indexOf(u.protocol) < 0) return false;
        return u.protocol === 'mailto:' || !!u.hostname;
    }

    /* Si confrontano i soli percorsi (niente ?query né #hash), dopo che `URL`
       ha risolto `..` e codificato gli spazi da tutte e due le parti: la radice
       arriva da `pathToFileURL(__dirname)` in main.js, l'indirizzo da Chromium.
       Senza radice nessun file:.
       Una figlia (packet 0129) carica anche i tre tipi che le figlie dell'app
       aprono: il report LIVE su 127.0.0.1, il PDF in blob:, la stampa su
       about:blank. Non data:, chrome:, chrome-extension:, devtools: (il lettore
       dei PDF sta in una cornice, non al posto della figlia). Un file: solo
       sotto la radice anche per lei: Electron dà a file: l'origine della madre,
       e da lì `window.opener.electronAPI`. */
    var SCHEMI_FIGLIA = ['about:', 'blob:'];
    function _solo(u) { return u.protocol + '//' + u.host + u.pathname; }
    function navigazioneAmmessa(url, ctx) {
        var u = _url(url);
        if (!u) return false;
        if (u.protocol !== 'file:') {
            if (!(ctx && ctx.figlia)) return false;
            if (SCHEMI_FIGLIA.indexOf(u.protocol) >= 0) return true;
            return (u.protocol === 'http:' || u.protocol === 'https:') && HOST_APP.indexOf(u.hostname) >= 0;
        }
        var radice = ctx && ctx.radiceApp ? _url(ctx.radiceApp) : null;
        if (!radice || radice.protocol !== 'file:') return false;
        var r = _solo(radice).replace(/\/+$/, '') + '/';
        var dove = _solo(u);
        return dove.indexOf(r) === 0 && dove.length > r.length;
    }

    function permessoAmmesso(nome) {
        return PERMESSI_AMMESSI.indexOf(String(nome == null ? '' : nome)) >= 0;
    }

    /* ── IL PERCORSO STA SOTTO UNA RADICE (23/10/26, packet 0123 lotto 4; 0027) ──
       Gli sportelli di main.js che leggono, scrivono, aprono o copiano un file
       prendevano il percorso dal renderer così com'era: un `vaultPath` o un
       nome con `../` arrivava a ~/Library/LaunchAgents o a ~/.ssh. Una regola
       sola, qui; le radici le elenca main.js (`radiciAmmesse`).
       `opts.vero` risolve i link simbolici (main.js passa il realpath
       dell'antenato che esiste, come `importaDentroDi`): si applica a tutte e
       due le parti, e se lancia si confronta il percorso così com'è.
       `opts.windows`: la barra rovesciata è un separatore e la lettera del
       disco non conta per le maiuscole; fuori da Windows è un carattere del
       nome, e trattarla da separatore farebbe entrare `/altrove/..\radice`.
       `opts.ignoraMaiuscole`: per i dischi che le confondono (APFS, NTFS).
       Un percorso relativo, vuoto o con un byte nullo non sta sotto niente. */
    function _normaPercorso(p, opts) {
        if (typeof p !== 'string' || !p || p.indexOf('\0') >= 0) return null;
        var s = p, testa = '';
        if (opts.windows) {
            s = s.replace(/\\/g, '/');
            var d = /^([a-zA-Z]):(\/|$)/.exec(s);
            if (d) { testa = d[1].toLowerCase() + ':'; s = s.slice(2); }
        }
        if (s.charAt(0) !== '/') return null;
        var fuori = [];
        s.split('/').forEach(function (seg) {
            if (!seg || seg === '.') return;
            if (seg === '..') fuori.pop();
            else fuori.push(seg);
        });
        var r = testa + '/' + fuori.join('/');
        return opts.ignoraMaiuscole ? r.toLowerCase() : r;
    }

    function sottoRadice(percorso, radici, opts) {
        var o = opts || {};
        var vero = function (x) {
            if (typeof o.vero !== 'function' || typeof x !== 'string') return x;
            try { return o.vero(x); } catch (e) { return x; }
        };
        var p = _normaPercorso(vero(percorso), o);
        if (!p || !Array.isArray(radici)) return false;
        return radici.some(function (r) {
            var rr = _normaPercorso(vero(r), o);
            if (!rr) return false;
            if (p === rr) return true;
            return p.indexOf(rr.charAt(rr.length - 1) === '/' ? rr : rr + '/') === 0;
        });
    }

    /* Le fonti di CREA (un .docx, una foto, un audio o un video) arrivano dalla
       finestra di sistema (`webUtils.getPathForFile`), da qualunque cartella:
       Scaricati, Scrivania, iCloud. Lì il confine non è la cartella ma il TIPO:
       solo le `estensioni` dello sportello, e mai un file sotto una cartella
       nascosta (~/.ssh, ~/.aws, ~/.config), dopo `vero`. */
    function fonteLeggibile(percorso, estensioni, opts) {
        var o = opts || {};
        var vero = percorso;
        if (typeof o.vero === 'function' && typeof percorso === 'string') { try { vero = o.vero(percorso); } catch (e) { vero = percorso; } }
        var p = _normaPercorso(vero, { windows: o.windows });
        if (!p || !Array.isArray(estensioni) || !estensioni.length) return false;
        var segs = p.split('/').filter(Boolean);
        if (segs.some(function (s) { return s.charAt(0) === '.'; })) return false;
        var nome = segs[segs.length - 1] || '', punto = nome.lastIndexOf('.');
        if (punto <= 0) return false;
        var est = nome.slice(punto).toLowerCase();
        return estensioni.some(function (e) { return String(e).toLowerCase() === est; });
    }

    return { apertura, schemaEsterno, navigazioneAmmessa, permessoAmmesso, sottoRadice, fonteLeggibile, PERMESSI_AMMESSI: PERMESSI_AMMESSI.slice() };
}));
