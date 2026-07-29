/**
 * mis-profile-core — il profilo di parametri.
 *
 * È l'oggetto più importante del modello: al tempo stesso ciò che i core
 * leggono per calcolare e ciò da cui si genera il tab METODO e la sezione
 * «limiti» dei report (FR-054). Non esiste un secondo posto dove sia scritto
 * che cosa significa una metrica: è la lezione della calibrazione R1, dove
 * le liste dell'assessment del 2026 andarono perdute e resero irriproducibili
 * metà delle sue cifre.
 *
 * Puro: niente DOM, niente rete, niente Electron, nessuna data implicita.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MisProfileCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const PESO_TOTALE = 100;
    const CAMPI_DOC = ['definizione', 'motivo', 'limite'];

    function _clone(o) { return JSON.parse(JSON.stringify(o)); }

    // ── Validazione (FR-033-ter) ────────────────────────────────────────────
    function validate(profilo) {
        const errori = [];
        const err = (campo, vincolo, messaggio) => errori.push({ campo, vincolo, messaggio });

        if (!profilo || typeof profilo !== 'object') {
            return { ok: false, errori: [{ campo: '(profilo)', vincolo: 'presenza', messaggio: 'Profilo assente o non è un oggetto.' }] };
        }
        if (!profilo.id) err('id', 'presenza', 'Il profilo deve avere un id.');

        const params = profilo.parametri || {};
        Object.keys(params).forEach((k) => {
            const p = params[k];
            if (!p || typeof p !== 'object') {
                err('parametri.' + k, 'forma', 'Il parametro non è un oggetto.');
                return;
            }
            if (p.valore === undefined || p.valore === null) {
                err('parametri.' + k, 'presenza', 'Il parametro non ha un valore.');
            }
            // Ogni parametro DEVE dichiararsi: è ciò che impedisce di aggiungere
            // una soglia senza dirne il senso e la debolezza (FR-053).
            CAMPI_DOC.forEach((c) => {
                if (!p[c] || !String(p[c]).trim()) {
                    err('parametri.' + k + '.' + c, 'documentazione',
                        'Manca «' + c + '»: un parametro non dichiarato rende il metodo irriproducibile.');
                }
            });
            if (typeof p.valore === 'number') {
                if (p.min !== undefined && p.valore < p.min) {
                    err('parametri.' + k, 'intervallo', 'Valore ' + p.valore + ' sotto il minimo ' + p.min + '.');
                }
                if (p.max !== undefined && p.valore > p.max) {
                    err('parametri.' + k, 'intervallo', 'Valore ' + p.valore + ' sopra il massimo ' + p.max + '.');
                }
            }
        });

        const comps = Array.isArray(profilo.componenti) ? profilo.componenti : [];
        if (!comps.length) err('componenti', 'presenza', 'Nessun componente definito.');

        let somma = 0;
        comps.forEach((c, i) => {
            const dove = 'componenti[' + i + ']' + (c && c.nome ? ' (' + c.nome + ')' : '');
            if (!c || typeof c !== 'object') { err(dove, 'forma', 'Componente non valido.'); return; }
            if (typeof c.peso !== 'number' || c.peso < 0) {
                err(dove + '.peso', 'valore', 'Peso mancante o negativo.');
            } else {
                somma += c.peso;
            }
            CAMPI_DOC.forEach((k) => {
                if (!c[k] || !String(c[k]).trim()) {
                    err(dove + '.' + k, 'documentazione', 'Manca «' + k + '».');
                }
            });
            (c.metriche || []).forEach((m, j) => {
                const dm = dove + '.metriche[' + j + ']' + (m && m.id ? ' (' + m.id + ')' : '');
                const a = m && m.ancoraggi;
                if (!Array.isArray(a) || a.length < 2) {
                    err(dm + '.ancoraggi', 'presenza', 'Servono almeno due punti di ancoraggio.');
                    return;
                }
                // Monotonia: il PUNTEGGIO deve crescere o decrescere in modo
                // coerente. Un ancoraggio non monotòno renderebbe l'indice
                // ambiguo (due valori diversi con lo stesso punteggio).
                const punteggi = a.map(p => p[1]);
                const cresce = punteggi.every((v, k) => k === 0 || v >= punteggi[k - 1]);
                const cala = punteggi.every((v, k) => k === 0 || v <= punteggi[k - 1]);
                if (!cresce && !cala) {
                    err(dm + '.ancoraggi', 'monotonia',
                        'I punteggi non sono monotòni: ' + punteggi.join(' → ') + '.');
                }
                const valori = a.map(p => p[0]);
                const vCresce = valori.every((v, k) => k === 0 || v > valori[k - 1]);
                const vCala = valori.every((v, k) => k === 0 || v < valori[k - 1]);
                if (!vCresce && !vCala) {
                    err(dm + '.ancoraggi', 'monotonia',
                        'I valori di soglia non sono ordinati: ' + valori.join(' → ') + '.');
                }
                a.forEach((p, k) => {
                    if (p[1] < 0 || p[1] > 100) {
                        err(dm + '.ancoraggi[' + k + ']', 'intervallo', 'Punteggio fuori da 0-100.');
                    }
                });
            });
        });

        if (comps.length && Math.abs(somma - PESO_TOTALE) > 1e-9) {
            err('componenti.peso', 'somma',
                'I pesi sommano a ' + somma + ' invece che a ' + PESO_TOTALE + '.');
        }

        const fsMin = params.fattoreSostanzaMin && params.fattoreSostanzaMin.valore;
        if (fsMin !== undefined && (fsMin < 0.1 || fsMin > 1.0)) {
            err('parametri.fattoreSostanzaMin', 'intervallo',
                'Il fattore di sostanza deve restare fra 0,1 e 1,0.');
        }

        return { ok: errori.length === 0, errori };
    }

    // ── Derivazione (FR-055): mai modifica in loco ──────────────────────────
    // Non esiste una funzione che muti un profilo esistente: la reversibilità
    // sta nell'assenza di quella funzione, non nella disciplina di non usarla.
    function derive(profiloBase, modifiche, opts) {
        const nuovo = _clone(profiloBase);
        const mods = modifiche || {};

        Object.keys(mods.parametri || {}).forEach((k) => {
            if (nuovo.parametri && nuovo.parametri[k]) nuovo.parametri[k].valore = mods.parametri[k];
        });
        (mods.pesi ? Object.keys(mods.pesi) : []).forEach((n) => {
            const c = (nuovo.componenti || []).find(x => String(x.n) === String(n));
            if (c) c.peso = mods.pesi[n];
        });
        (mods.ancoraggi || []).forEach((a) => {
            const c = (nuovo.componenti || []).find(x => String(x.n) === String(a.componente));
            const m = c && (c.metriche || []).find(x => x.id === a.metrica);
            if (m) m.ancoraggi = a.ancoraggi;
        });

        nuovo.derivatoDa = profiloBase.id;
        nuovo.creatoIl = (opts && opts.adesso) || null;   // data iniettata, mai implicita
        nuovo.id = 'personale-' + fingerprint(nuovo);
        nuovo.nome = (opts && opts.nome) || ('Personale — derivato da ' + profiloBase.id);
        return nuovo;
    }

    // Impronta deterministica sui soli VALORI: cambiare la formulazione di un
    // «motivo» non deve creare un profilo nuovo e spezzare le serie
    // dell'ANDAMENTO. Cambiare una soglia sì.
    function fingerprint(profilo) {
        const rilevante = {
            p: Object.keys(profilo.parametri || {}).sort().map(k => [k, profilo.parametri[k].valore]),
            c: (profilo.componenti || []).map(c => [
                c.n, c.peso,
                (c.metriche || []).map(m => [m.id, m.ancoraggi]),
                c.moderatoDa || null,
            ]),
        };
        const s = JSON.stringify(rilevante);
        // Hash FNV-1a a 32 bit: deterministico e senza dipendenze.
        let h = 0x811c9dc5;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return ('0000000' + h.toString(16)).slice(-8);
    }

    // ── describe: UNICA fonte dei testi di METODO e dei «limiti» (FR-054) ───
    function describe(profilo) {
        const sezioni = [];

        sezioni.push({
            sezione: 'Componenti dell’indice',
            voci: (profilo.componenti || []).map(c => ({
                nome: c.n + '. ' + c.nome,
                valore: c.peso + ' su 100',
                definizione: c.definizione,
                motivo: c.motivo,
                limite: c.limite,
                ancoraggi: (c.metriche || []).map(m => ({
                    metrica: m.id,
                    punti: m.ancoraggi,
                    richiede: m.richiede || c.richiede || null,
                })),
                richiede: c.richiede || null,
                moderatoDa: c.moderatoDa || null,
            })),
        });

        const params = profilo.parametri || {};
        sezioni.push({
            sezione: 'Soglie e liste',
            voci: Object.keys(params).map(k => ({
                nome: k,
                valore: Array.isArray(params[k].valore)
                    ? params[k].valore.join(' · ')
                    : String(params[k].valore),
                definizione: params[k].definizione,
                motivo: params[k].motivo,
                limite: params[k].limite,
                tipo: params[k].tipo,
                min: params[k].min,
                max: params[k].max,
            })),
        });

        return sezioni;
    }

    // Elenco dei limiti dichiarati: alimenta la sezione «limiti» dei report
    // (FR-041) insieme a ciò che è realmente accaduto nell'analisi.
    function limitiDichiarati(profilo) {
        const out = [];
        (profilo.componenti || []).forEach(c => {
            if (c.limite) out.push({ origine: 'componente ' + c.n + ' — ' + c.nome, testo: c.limite });
        });
        const params = profilo.parametri || {};
        Object.keys(params).forEach(k => {
            if (params[k].limite) out.push({ origine: 'parametro ' + k, testo: params[k].limite });
        });
        return out;
    }

    function param(profilo, chiave, seAssente) {
        const p = profilo && profilo.parametri && profilo.parametri[chiave];
        return p && p.valore !== undefined ? p.valore : seAssente;
    }

    function componente(profilo, n) {
        return (profilo.componenti || []).find(c => String(c.n) === String(n)) || null;
    }

    return { PESO_TOTALE, validate, derive, fingerprint, describe, limitiDichiarati, param, componente };
}));
