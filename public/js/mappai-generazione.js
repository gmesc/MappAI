/* mappai-generazione.js — IL LUCCHETTO DELLA GENERAZIONE (14/8/26)
 *
 * Il difetto: `mappaiOccupato()` copriva la PIPELINE dei materiali
 * (`Pipeline._running`), non una generazione MM/KG nuda. Finché il velo copriva
 * tutto lo schermo la cosa non si notava; da quando copre la sola area di CREA
 * si può girare per l'app, e basta un HOME — `backToLanding` fa
 * `location.reload()` — per uccidere una generazione in silenzio, coi token già
 * spesi.
 *
 * Qui c'è UN posto che sa se una generazione sta girando, e su che cosa. Chi
 * deve difendersi lo chiede; chi deve spegnere un comando lo chiede.
 *
 * ⚠️ La regola che governa tutto: durante una generazione si può GUARDARE, non
 * SOSTITUIRE. Quello che vive sul DISCO (INSEGNA: elencare i vault, aprire un
 * PDF o un HTML nell'iframe, stampare, QR, Finder) non tocca `appState` e resta
 * aperto; quello che CARICA una mappa in `appState` — o che ci scrive dentro —
 * si spegne, e lo dice invece di non fare niente.
 */
(function () {
    'use strict';

    var stato = { attiva: false, nome: '', modo: '', da: 0 };

    function t(k, f) { return window.t ? window.t(k, f) : f; }

    /* Le superfici che mostrano un comando spento non si accorgono da sole che
       lo stato è cambiato: si annuncia, come per i profili (una superficie che
       mostra dati scritti altrove non si aggiorna da sé). */
    function annuncia() {
        try {
            document.dispatchEvent(new CustomEvent('mappai-generazione-cambiata',
                { detail: { attiva: stato.attiva, nome: stato.nome } }));
        } catch (e) { }
        try { document.documentElement.classList.toggle('mappai-genera', stato.attiva); } catch (e) { }
    }

    /* ── I PROGETTI APPENA NATI ────────────────────────────────────────────
       Richiesta di Giacomo: finita la generazione, il progetto nuovo dev'essere
       facile da ritrovare negli elenchi — «chi magari distrattamente non
       ricorda più il nome». Un bollino sulla riga, che sparisce al primo clic.
       ⚠️ DUE chiavi per riga, e servono entrambe: ELABORA elenca progetti (id in
       localStorage) e INSEGNA elenca vault letti dal DISCO (percorso della
       cartella). Con una chiave sola il bollino comparirebbe in una lista e non
       nell'altra. */
    var NUOVI = 'mappai_progetti_nuovi';
    var CAP = 20;

    function leggiNuovi() {
        try { return JSON.parse(localStorage.getItem(NUOVI) || '[]') || []; } catch (e) { return []; }
    }
    function scriviNuovi(l) {
        try { localStorage.setItem(NUOVI, JSON.stringify(l.slice(-CAP))); } catch (e) { }
        try { document.dispatchEvent(new CustomEvent('mappai-nuovi-cambiati')); } catch (e) { }
    }
    /* Le chiavi con cui una riga di elenco si riconosce, comunque sia fatta:
       ELABORA passa `{id, p, v}`, INSEGNA `{id, v}`, e chi salva passa
       l'id del progetto e il percorso del vault. */
    function chiavi(m) {
        if (!m) return [];
        var k = [];
        if (typeof m === 'string') return [m];
        if (m.id) k.push('i:' + m.id);
        if (m.p && m.p.id) k.push('i:' + m.p.id);
        if (m.v && m.v.fullPath) k.push('v:' + m.v.fullPath);
        if (m.vault) k.push('v:' + m.vault);
        if (m.fullPath) k.push('v:' + m.fullPath);
        return k;
    }

    /* ── IL VELO DENTRO L'AREA DI CREA ─────────────────────────────────────
       Il velo di lavorazione è UNO (`#loading-overlay`, col suo cronometro e i
       suoi messaggi): non se ne disegna un secondo, lo si SPOSTA dentro l'area
       di CREA e gli si mette `.in-area` (`position:absolute`). Così quando CREA
       viene nascosta il velo sparisce con lei — è il contenitore a governarlo,
       non una riga di codice.
       L'implementazione stava nella pipeline; da qui la usano anche le
       generazioni MM/KG nude, che prima lasciavano il velo a tutto schermo. */
    var _segno = null;
    function veloNellArea() {
        var el = document.getElementById('loading-overlay');
        var area = document.getElementById('build-content');
        if (!el || !area || _segno) return;
        _segno = document.createComment(' velo: ora dentro CREA ');
        el.parentNode.insertBefore(_segno, el);
        if (getComputedStyle(area).position === 'static') area.style.position = 'relative';
        area.appendChild(el);
        el.classList.add('in-area');
    }
    function veloACasa() {
        var el = document.getElementById('loading-overlay');
        if (!el || !_segno || !_segno.parentNode) { _segno = null; return; }
        el.classList.remove('in-area');
        _segno.parentNode.insertBefore(el, _segno);
        _segno.parentNode.removeChild(_segno);
        _segno = null;
    }

    var API = {
        veloNellArea: veloNellArea,
        veloACasa: veloACasa,
        /* Marca un progetto come APPENA NATO. */
        segnaNuovo: function (info) {
            if (!info) return;
            var k = chiavi(info);
            if (!k.length) return;
            var l = leggiNuovi().filter(function (x) {
                return !(x.chiavi || []).some(function (c) { return k.indexOf(c) >= 0; });
            });
            l.push({ chiavi: k, nome: String(info.nome || '').trim() });
            scriviNuovi(l);
        },
        eNuovo: function (m) {
            var k = chiavi(m);
            if (!k.length) return false;
            return leggiNuovi().some(function (x) {
                return (x.chiavi || []).some(function (c) { return k.indexOf(c) >= 0; });
            });
        },
        /* Visto: il bollino sparisce al PRIMO clic, e sparisce da tutte e due le
           liste insieme — l'annuncio serve a questo (una superficie che mostra
           dati scritti altrove non si aggiorna da sé). */
        visto: function (m) {
            var k = chiavi(m);
            if (!k.length) return;
            var l = leggiNuovi();
            var resta = l.filter(function (x) {
                return !(x.chiavi || []).some(function (c) { return k.indexOf(c) >= 0; });
            });
            if (resta.length !== l.length) scriviNuovi(resta);
        },
        nuovi: function () { return leggiNuovi(); },

        inizia: function (nome, modo) {
            stato.attiva = true;
            /* il velo scende nell'area di CREA: la topbar resta viva (lo spinner
               e le briciole servono proprio mentre si lavora) e gli avvii rapidi
               qui sotto si spengono col foglio (`html.mappai-genera`) */
            veloNellArea();
            stato.nome = String(nome || '').trim();
            stato.modo = modo || '';
            stato.da = Date.now();
            annuncia();
        },
        fine: function () {
            stato.attiva = false;
            veloACasa();
            annuncia();
        },
        attiva: function () { return !!stato.attiva; },
        nome: function () { return stato.nome; },

        /* Il MOTIVO, in chiaro. Un comando spento senza motivo si legge come un
           difetto dell'app; con il motivo si legge come un'attesa. */
        motivo: function () {
            var n = stato.nome;
            return n
                ? t('gen_motivo_nome', 'Sto generando «') + n + t('gen_motivo_fine', '»: si riapre appena è pronta.')
                : t('gen_motivo', 'Generazione in corso: si riapre appena è pronta.');
        },

        /* La domanda che fanno i comandi: «posso caricare una mappa adesso?».
           `false` + toast col motivo, così chi chiama non deve ripetere la copia. */
        puoiCaricare: function (avvisa) {
            if (!stato.attiva) return true;
            if (avvisa !== false && window.showToast) window.showToast(API.motivo(), 'warning');
            return false;
        }
    };

    window.MappAIGen = API;
})();
