/**
 * ┌─ COPIA DA MAPPAI — non modificare in loco ────────────────────────────────┐
 * │ Origine : public/js/mappai-files-core.js  (MappAI re) — safeName, isoDate │
 * │ Commit  : 0751fa4 · Copiato il 28/07/2026                                 │
 * │ Motivo   : i nomi di cartella e di file del misuratore devono seguire le  │
 * │            stesse regole di MappAI, così un vault copiato in Upload/      │
 * │            conserva un nome riconoscibile e sicuro sul filesystem.        │
 * │ Aggiorn. : rileggere l'originale, non correggere qui. Vedi RIUSO.md.      │
 * └───────────────────────────────────────────────────────────────────────────┘
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MisFilesNames = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Sicuro per il filesystem, ma CONSERVA accenti e trattini: «1ª A» resta
    // leggibile. Niente fallback implicito: lo sceglie il chiamante.
    function safeName(s, fallback) {
        const out = String(s == null ? '' : s)
            .replace(/[\/\\:*?"<>|\u0000-\u001f]/g, ' ')
            .replace(/\s+/g, ' ').trim()
            .replace(/[. ]+$/, '');
        return out || (fallback || '');
    }

    function pad2(n) { return String(n).padStart(2, '0'); }

    // AAAA-MM-GG — ordinabile alfabeticamente. Serve ai nomi dei report.
    function isoDate(d) {
        let x = d ? new Date(d) : new Date();
        if (isNaN(x.getTime())) x = new Date();
        return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate());
    }

    // GG/MM/AAAA — formato di visualizzazione, regola MappAI 15. Mai
    // toLocaleDateString con mese testuale: cambia fra macchine.
    function fmtDate(d) {
        let x = d ? new Date(d) : new Date();
        if (isNaN(x.getTime())) return '—';
        return pad2(x.getDate()) + '/' + pad2(x.getMonth() + 1) + '/' + x.getFullYear();
    }

    // Suffisso « · 02», « · 03»… quando il nome è già occupato (FR-003).
    function nomeSenzaCollisione(base, esistenti) {
        const presi = new Set(esistenti || []);
        if (!presi.has(base)) return base;
        for (let i = 2; i < 100; i++) {
            const cand = base + ' · ' + pad2(i);
            if (!presi.has(cand)) return cand;
        }
        return base + ' · ' + Date.now();
    }

    return { safeName, isoDate, fmtDate, pad2, nomeSenzaCollisione };
}));
