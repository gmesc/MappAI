/* mappai-config-import.js — «Importa configurazione» (packet 0064).
 *
 * Nella vista «Impostazioni AI» (riquadro Infomaniak, che la Cabina sposta con
 * `_portaAi`) un bottone fa scegliere il file «MappAI - configurazione» ricevuto
 * per la demo. Il formato lo legge `MappAIConfigCore.leggi`; qui ci sono solo il
 * DOM, il file e i gestori di oggi, chiamati nello stesso ordine in cui li chiama
 * il docente a mano, con i campi riempiti PRIMA del cambio di fornitore:
 *   1. i due campi (token, Product ID);
 *   2. il token con l'espressione dell'`onblur` di #infomaniak-api-key-input;
 *   3. il Product ID con `updateInfomaniakProductId`;
 *   4. `switchAIProvider('infomaniak')`, che ricarica i modelli da sé leggendo i campi;
 *   5. il modello con `onModelSelectChange` (sceglie la chiave dal fornitore attivo);
 *   6. le fasi con `MappAIModelli.salvaProfilo` + `accendi` (come «Salva
 *      assegnazioni» e la casella «Usa un modello per ogni fase»);
 *   7. un secondo `refreshGeminiModels`, atteso: mostra nella tendina il modello;
 *   8. (v4) il modello per le foto nella chiave `mappai_config_visione` e, se c'è il
 *      modulo delle foto dello 0066, `MappAIVisioneModello.imposta(id)`.
 *
 * Il token non va mai in console, nel registro degli errori o in un messaggio; del
 * file si leggono solo i byte (nome e percorso non si toccano). La chiave
 * `mappai_reranker_infomaniak` non si legge e non si scrive.
 * Interruttore: `mappai_importa_config` — '0' → niente bottone (unico lettore: qui).
 */
(function () {
    'use strict';
    if (typeof window === 'undefined' || window.MappAIConfigImport) return;

    var FLAG = 'mappai_importa_config';
    var ID_BOTTONE = 'btn-importa-config';
    var inCorso = false;

    function t(k, f) { return (typeof window.t === 'function') ? window.t(k, f) : f; }
    function core() { return window.MappAIConfigCore; }
    function byId(id) { return document.getElementById(id); }
    function toast(msg, tipo) { if (typeof window.showToast === 'function') window.showToast(msg, tipo); }
    function acceso() { try { return localStorage.getItem(FLAG) !== '0'; } catch (_) { return true; } }

    /* ── il bottone ─────────────────────────────────────────────────────────── */
    function monta() {
        if (!acceso() || byId(ID_BOTTONE)) return false;
        var riquadro = byId('infomaniak-api-key-container');
        var campo = byId('infomaniak-api-key-input');
        if (!riquadro || !campo) return false;
        // il figlio diretto del riquadro che contiene il campo del token
        var blocco = campo;
        while (blocco && blocco.parentNode !== riquadro) blocco = blocco.parentNode;
        if (!blocco) return false;

        var box = document.createElement('div');
        var btn = document.createElement('button');
        btn.setAttribute('type', 'button');
        btn.id = ID_BOTTONE;
        btn.className = 'input_button_xs';
        btn.textContent = t('cfg_importa', 'Importa configurazione');
        btn.addEventListener('click', scegli);
        var aiuto = document.createElement('p');
        aiuto.className = 'input_label_xs';
        aiuto.textContent = t('cfg_importa_aiuto', 'Hai ricevuto un file «MappAI - configurazione»? Sceglilo qui: MappAI imposta da sé Infomaniak, il token, il Product ID e il modello.');
        box.appendChild(btn);
        box.appendChild(aiuto);
        riquadro.insertBefore(box, blocco);
        return true;
    }

    /* ── la scelta del file (come `pickPdf` dello 0059) ─────────────────────── */
    function scegli() {
        if (inCorso || !document.body) return;
        var campo = document.createElement('input');
        campo.type = 'file';
        var C = core();
        campo.accept = (C && C.ESTENSIONI) ? C.ESTENSIONI.join(',') : '.mappai-config,.json';
        campo.style.display = 'none';
        var togli = function () { try { campo.remove(); } catch (_) { /* già tolto */ } };
        campo.onchange = function () {
            var f = campo.files && campo.files[0];
            togli();
            return f ? leggiFile(f) : Promise.resolve(null);
        };
        campo.oncancel = togli;
        document.body.appendChild(campo);
        campo.click();
    }

    function leggiFile(f) {
        var C = core();
        if (!C || !f || typeof f.size !== 'number' || f.size > C.TETTO_BYTE) {
            toast(messaggioErrore('illeggibile'), 'error');
            return Promise.resolve({ ok: false, codice: 'illeggibile' });
        }
        return new Promise(function (risolvi) {
            var fr = new FileReader();
            fr.onload = function () { risolvi(typeof fr.result === 'string' ? fr.result : null); };
            fr.onerror = function () { risolvi(null); };
            fr.readAsText(f, 'utf-8');
        }).then(importaTesto);
    }

    /* ── i messaggi: mai un valore del file, tranne il nome ─────────────────── */
    function messaggioErrore(codice) {
        if (codice === 'versione' || codice === 'versione-nuova') {
            return t('cfg_e_versione', 'Questa configurazione è di una versione di MappAI diversa dalla tua: aggiorna l\'app o chiedi un file nuovo.');
        }
        if (codice === 'fornitore') return t('cfg_e_fornitore', 'Questa versione di MappAI importa solo configurazioni Infomaniak.');
        if (codice === 'token' || codice === 'product') {
            return t('cfg_e_dati', 'Nel file manca il token o il Product ID, oppure non sono validi: chiedi un file nuovo.');
        }
        return t('cfg_e_formato', 'Questo file non è una configurazione di MappAI.');
    }

    function messaggioRiuscita(nome, fasiAccese, avvisi) {
        var msg = nome
            ? t('cfg_ok', 'Configurazione importata: {nome}. Puoi cancellare il file che hai ricevuto: contiene il tuo token.').split('{nome}').join(nome)
            : t('cfg_ok_senza_nome', 'Configurazione importata. Puoi cancellare il file che hai ricevuto: contiene il tuo token.');
        if (fasiAccese) msg += ' ' + t('cfg_ok_fasi', 'MappAI ora usa un modello diverso per ogni fase del lavoro: lo vedi in «Usa un modello per ogni fase».');
        if (avvisi.indexOf('modello-ignorato') >= 0) msg += ' ' + t('cfg_ok_modello', 'Scegli tu il modello dalla tendina.');
        if (avvisi.indexOf('fasi-ignorate') >= 0) msg += ' ' + t('cfg_ok_fasi_no', 'Le fasi del file non sono valide: restano quelle di prima.');
        if (avvisi.indexOf('visione-ignorata') >= 0) msg += ' ' + t('cfg_ok_visione_no', 'Il modello per le foto indicato nel file non è valido: non è stato salvato.');
        return msg;
    }

    /* ── l'applicazione, per la stessa strada dei campi ─────────────────────── */
    async function importaTesto(testo) {
        var C = core();
        var r = C ? C.leggi(testo) : { ok: false, codice: 'illeggibile' };
        if (!r.ok) {
            toast(messaggioErrore(r.codice), 'error');
            return { ok: false, codice: r.codice };
        }
        var d = r.dati;
        var avvisi = r.avvisi.slice();
        inCorso = true;
        try {
            var prima = '';
            try { prima = localStorage.getItem('infomaniak_api_key') || ''; } catch (_) { prima = ''; }
            if (prima && prima !== d.token && window.MappAIModal && typeof window.MappAIModal.conferma === 'function') {
                var si = await window.MappAIModal.conferma({
                    titolo: t('cfg_sostituire_t', 'Sostituire il token?'),
                    testo: t('cfg_sostituire', 'In MappAI c\'è già un token Infomaniak. Il file lo sostituisce: quello di prima non si recupera da qui.'),
                    distruttivo: true
                });
                if (si !== true) return { ok: false, codice: 'annullato' };
            }

            var fasiAccese = false;
            try {
                // 1. i valori nei campi: il ricaricamento del passo 4 li legge da lì
                var campoToken = byId('infomaniak-api-key-input');
                var campoPid = byId('infomaniak-product-id');
                if (campoToken) campoToken.value = d.token;
                if (campoPid) campoPid.value = d.productId;
                // 2. il token, con l'espressione dell'onblur del campo (index.html)
                if (window.saveSecureKey) { await window.saveSecureKey('infomaniak_api_key', d.token); } else { localStorage.setItem('infomaniak_api_key', d.token); }
                // 3. il Product ID
                if (window.updateInfomaniakProductId) window.updateInfomaniakProductId(d.productId);
                // 4. il fornitore: DOPO i campi, perché ricarica i modelli da sé e senza attesa
                if (window.switchAIProvider) window.switchAIProvider('infomaniak');
                // 5. il modello: DOPO il fornitore, perché la chiave dipende dal fornitore attivo
                if (d.modello && window.onModelSelectChange) window.onModelSelectChange(d.modello);
                // 6. le fasi, come «Salva assegnazioni» + «Usa un modello per ogni fase»
                var M = window.MappAIModelli;
                if (d.fasi && M && typeof M.salvaProfilo === 'function') {
                    var salvato = false;
                    try {
                        M.salvaProfilo({ schema: 'mappai-modelli@1', provider: 'infomaniak', modelli: d.fasi });
                        salvato = true;
                    } catch (_) {
                        if (avvisi.indexOf('fasi-ignorate') < 0) avvisi.push('fasi-ignorate');
                    }
                    if (salvato) {
                        M.accendi();
                        fasiAccese = true;
                        if (window.MappAIModelliUI && typeof window.MappAIModelliUI.render === 'function') window.MappAIModelliUI.render();
                    }
                }
            } catch (_) {
                // niente dettagli: un errore qui non deve portare in giro nessun valore
                toast(t('cfg_e_applica', 'L\'importazione si è fermata a metà: controlla il token, il Product ID e il modello qui sotto.'), 'error');
                return { ok: false, codice: 'applica' };
            }

            // 7. il secondo ricaricamento, atteso: porta nella tendina il modello del passo 5
            if (window.refreshGeminiModels) {
                try { await window.refreshGeminiModels(); } catch (_) { /* la tendina ha i suoi messaggi */ }
            }
            // 8. (v4) il modello per le foto: la chiave sua (unico scrittore: questo modulo) e il gancio dello 0066.
            //    La chiave `mappai_visione_modello_infomaniak` dello 0066 non si legge e non si scrive da qui.
            if (d.visione) {
                try { localStorage.setItem('mappai_config_visione', d.visione); } catch (_) { /* cassetto pieno: resta il gancio */ }
                var V = window.MappAIVisioneModello;
                if (V && typeof V.imposta === 'function') {
                    try { V.imposta(d.visione); } catch (_) { /* il modulo delle foto ha i suoi messaggi */ }
                }
            }
            toast(messaggioRiuscita(d.nome, fasiAccese, avvisi), 'success');
            return { ok: true, fasi: fasiAccese, avvisi: avvisi.slice() };
        } finally {
            inCorso = false;
        }
    }

    window.MappAIConfigImport = Object.freeze({
        monta: monta, scegli: scegli, leggiFile: leggiFile, importaTesto: importaTesto
    });

    document.addEventListener('DOMContentLoaded', monta);
    if (document.readyState && document.readyState !== 'loading') monta();
})();
