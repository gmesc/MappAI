/* mappai-config-core.js — il formato del file «MappAI - configurazione» (packet 0064).
 *
 * Un docente riceve un file (dal generatore della demo, fuori dal repo) con il
 * token e il Product ID Infomaniak, il modello e, se ci sono, le fasi. Questo core
 * dice soltanto se il file è valido e che cosa porta: niente DOM, niente IPC,
 * niente localStorage. Il guscio `mappai-config-import.js` applica i valori per la
 * stessa strada dei campi della vista «Impostazioni AI».
 *
 * Il contratto (versione 1):
 *   { "formato": "mappai-configurazione", "versione": 1, "nome": "BEDIGLIORA_001",
 *     "fornitore": "infomaniak", "infomaniak": { "token": "…", "productId": "105999" },
 *     "modello": "google/gemma-4-31B-it",
 *     "fasi": { "mappa": "…", "materiali": "…", "embeddings": "…", "giudice": null, "reranking": "…" },
 *     "visione": "mistralai/Ministral-3-14B-Instruct-2512",
 *     "creato": "2026-09-30", "nota": "…" }
 *
 * `leggi(testo)` non lancia mai e non modifica il suo ingresso. Quando rifiuta
 * restituisce SOLO un codice: nessun valore del file (il token meno di tutti) entra
 * in un risultato d'errore. Il profilo delle fasi lo valida `MappAIModelliCore.profilo`
 * nel guscio (inv. 6): qui si controlla solo la forma degli identificativi.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIConfigCore = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var FORMATO = 'mappai-configurazione';
    var VERSIONE = 1;
    var ESTENSIONI = Object.freeze(['.mappai-config', '.json']);
    var TETTO_BYTE = 65536;

    var RE_PRODUCT = /^\d{3,12}$/;
    var RE_NOME = /^[A-Za-z0-9_-]{1,40}$/;
    var RE_MODELLO = /^[A-Za-z0-9._\/-]{3,120}$/;
    var FASI_OBBLIGATORIE = ['mappa', 'materiali', 'embeddings'];
    var FASI_FACOLTATIVE = ['giudice', 'reranking'];

    function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
    function oggetto(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
    function modelloValido(v) { return typeof v === 'string' && RE_MODELLO.test(v); }

    /* byte UTF-8 di una stringa, senza TextEncoder né Buffer (il core gira ovunque) */
    function byteUtf8(s) {
        var n = 0;
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i);
            if (c < 0x80) n += 1;
            else if (c < 0x800) n += 2;
            else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
                var d = s.charCodeAt(i + 1);
                if (d >= 0xDC00 && d <= 0xDFFF) { n += 4; i++; } else n += 3;
            } else n += 3;
        }
        return n;
    }

    function errore(codice) { return { ok: false, codice: codice }; }

    /* le fasi: null se assenti; un oggetto nuovo con le cinque chiavi se valide;
       `false` se presenti ma non valide (→ avviso 'fasi-ignorate') */
    function leggiFasi(v) {
        if (v === undefined || v === null) return null;
        if (!oggetto(v)) return false;
        var out = {};
        for (var i = 0; i < FASI_OBBLIGATORIE.length; i++) {
            var k = FASI_OBBLIGATORIE[i];
            if (!own(v, k) || !modelloValido(v[k])) return false;
            out[k] = v[k];
        }
        for (var j = 0; j < FASI_FACOLTATIVE.length; j++) {
            var f = FASI_FACOLTATIVE[j];
            var x = own(v, f) ? v[f] : null;
            if (x === undefined || x === null) out[f] = null;
            else if (modelloValido(x)) out[f] = x;
            else return false;
        }
        return out;
    }

    function leggi(testo) {
        try {
            if (typeof testo !== 'string') return errore('illeggibile');
            var t = testo.charCodeAt(0) === 0xFEFF ? testo.slice(1) : testo;
            if (!t.trim() || t.length > TETTO_BYTE || byteUtf8(t) > TETTO_BYTE) return errore('illeggibile');
            var o;
            try { o = JSON.parse(t); } catch (_) { return errore('illeggibile'); }

            if (!oggetto(o) || o.formato !== FORMATO) return errore('formato');
            var v = o.versione;
            if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return errore('versione');
            if (v > VERSIONE) return errore('versione-nuova');
            if (o.fornitore !== 'infomaniak') return errore('fornitore');

            var info = oggetto(o.infomaniak) ? o.infomaniak : {};
            var token = info.token;
            if (typeof token !== 'string' || /\s/.test(token) || token.length < 20) return errore('token');
            var pid = info.productId;
            var pidTesto = typeof pid === 'string' ? pid
                : (typeof pid === 'number' && Number.isFinite(pid) ? String(pid) : '');
            if (!RE_PRODUCT.test(pidTesto)) return errore('product');

            var avvisi = [];
            var nome = typeof o.nome === 'string' && RE_NOME.test(o.nome) ? o.nome : '';

            var modello = '';
            if (o.modello !== undefined && o.modello !== null) {
                if (modelloValido(o.modello)) modello = o.modello;
                else avvisi.push('modello-ignorato');
            }

            var fasi = leggiFasi(o.fasi);
            if (fasi === false) { fasi = null; avvisi.push('fasi-ignorate'); }

            /* v4: il modello per la lettura delle foto, conservato dal guscio per lo 0066 */
            var visione = '';
            if (o.visione !== undefined && o.visione !== null) {
                if (modelloValido(o.visione)) visione = o.visione;
                else avvisi.push('visione-ignorata');
            }

            return { ok: true, dati: { nome: nome, token: token, productId: pidTesto, modello: modello, fasi: fasi, visione: visione }, avvisi: avvisi };
        } catch (_) {
            /* un getter o un oggetto ostile: il core non lancia mai */
            return errore('illeggibile');
        }
    }

    return Object.freeze({
        FORMATO: FORMATO, VERSIONE: VERSIONE, ESTENSIONI: ESTENSIONI, TETTO_BYTE: TETTO_BYTE,
        leggi: leggi
    });
}));
