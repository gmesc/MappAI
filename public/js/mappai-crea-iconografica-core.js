/* =========================================================================
   mappai-crea-iconografica-core.js — CREA CON UNA FOTO, le regole (0067)

   ADR 0015 (rev. 1): quando fra le fonti di CREA c'è una scheda di fonte
   iconografica confermata, la landing mostra la foto e la scheda letta al
   posto della scelta Mappa/Knowledge Graph e del tema centrale; il dossier
   rispetta le preferenze dei materiali; nessuna mappa a schermo.

   Qui sta la DECISIONE, e solo lei (invariante 4): che cosa mostra la landing
   dato lo stato delle fonti (`composizione`), che cosa genera il dossier dato
   ciò che il docente ha lasciato nelle preferenze e ciò che dice la scheda
   (`uscite`). Il guscio (`mappai-crea-iconografica.js`) monta e smonta, e non
   contiene `if` di composizione; `cfgDossier` della pipeline chiama `uscite`.

   I materiali di una foto si scelgono SOLO nella scheda (Giacomo, 01/10: «sì,
   solo nella scheda» — scostamento dall'ADR 0015, decisione 1, dichiarato nel
   packet): quali (domande aperte, flashcard, scelta multipla, sintesi), da quali
   parti, con quali angoli e quante. La scheda ricorda le ultime scelte
   (`opzioniIniziali`), voce naturale compresa (decisione 9). Dal bento arriva solo
   ciò che non è «quali materiali»: il contesto e la taratura.
   Il titolo vive in `scheda.titolo` e basta.

   Il marcatore è la SCHEDA, non il tipo della fonte (come `_schedeImmagini`
   nella pipeline). Una foto riconosciuta (`MappAIVisioneCore.accetta`) SENZA
   scheda non è una fonte pronta: aprirebbe la strada della mappa e verrebbe
   rifiutata in fondo con un messaggio che parla d'altro (0067 §4).

   Logica pura: niente DOM, niente `window` nelle funzioni, niente localStorage.
   Dipende da `mappai-visione-core.js` (la griglia, il riconoscimento): letto,
   mai modificato.
   ========================================================================= */
(function (root, factory) {
    var VC = null;
    try {
        if (typeof module !== 'undefined' && module.exports) VC = require('./mappai-visione-core.js');
    } catch (e) { VC = null; }
    var CORE = factory(function () { return VC || (root && root.MappAIVisioneCore) || null; });
    if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
    if (root) root.MappAICreaIconograficaCore = CORE;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (visioneCore) {
    'use strict';

    /* i18n nei moduli provati in Node: mai `window.t` diretto (invariante 14) */
    function _tSafe(k, f) {
        try {
            if (typeof window !== 'undefined' && window && typeof window.t === 'function') return window.t(k, f);
        } catch (e) { /* in Node non esiste: resta l'italiano */ }
        return f;
    }
    function VC() { return visioneCore() || {}; }

    function _riga(x) { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim(); }

    /* Il markup lo scrive il core (si prova in Node, M4): ogni testo che arriva
       dalla scheda o dal nome di un file passa da qui. Apostrofi e virgolette
       compresi: il titolo finisce anche in un attributo `value`. */
    function esc(x) {
        return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function _nomeFonte(x) {
        if (!x) return '';
        return String((x.file && x.file.name) || x.name || x.path || '');
    }
    function _eImmagine(x) {
        var C = VC();
        return !!(C.accetta && C.accetta(_nomeFonte(x)));
    }
    function _testuale(x) {
        return !!(x && (x.file || (x.content && String(x.content).trim())));
    }

    /* ── Le parti della scheda ───────────────────────────────────────────────
       Un blocco conta se ha testo: i vuoti NON sono parti (M3). */
    function _partiPiene(sch) {
        var C = VC(), out = [];
        (C.BLOCCHI || []).forEach(function (bl) {
            if (C.testoBlocco && C.testoBlocco(sch, bl.id)) out.push(bl.titolo);
        });
        return out;
    }
    function _identita(sch) {
        var C = VC(), bl = null, out = [];
        (C.BLOCCHI || []).forEach(function (b) { if (b.id === 'identita') bl = b; });
        if (!bl) return out;
        var src = (sch && sch.identita) || {};
        bl.campi.forEach(function (c) {
            if (c.id === 'titolo') return;          /* il titolo ha il suo campo */
            var v = _riga(src[c.id]);
            if (v) out.push({ et: c.et, valore: v });
        });
        return out;
    }

    /* ── LA COMPOSIZIONE ──────────────────────────────────────────────────────
       `fonti` = `appState.sources`. Restituisce che cosa la landing deve dire:
         attiva     c'è almeno una scheda confermata → la modalità iconografica
         pronta     si può spendere: almeno una fonte pronta e NESSUNA foto da leggere
         daLeggere  le foto riconosciute senza scheda (annullata, fallita, rifiutata)
         mancano    la frase che lo dice, o ''
         titolo · identita · parti · totali · quante · statoParti · nomiParti
         avvisi     ciò che la schermata deve dichiarare (più foto, altre fonti, HEIC)
         fonte      {id, nome, formato, anteprima} della prima scheda
         etichetta  il nome del verde
         spunta     {nascosta} per «Manda la fonte all'allievo»
         nascondi   gli id delle voci del bento che con una foto non valgono (`vociDaNascondere`)
       `opts.inLettura` = gli id delle fonti la cui scheda si sta leggendo adesso (la foto
       è appena entrata, la scheda è aperta e non confermata): non sono ancora pronte,
       ma non si chiede di «leggerle» — lo si sta facendo. */
    function composizione(fonti, opts) {
        var inLettura = (opts && Array.isArray(opts.inLettura)) ? opts.inLettura : [];
        var C = VC();
        var lista = Array.isArray(fonti) ? fonti : [];
        var conScheda = [], daLeggere = [], testuali = [];
        /* 0069, giro 7: gli id delle fonti la cui scheda è una lettura fallita
           (`MappAIDossierFonteCore.letturaFallita`, lo passa il guscio a interruttore
           acceso): valgono come una foto da leggere, non come una fonte pronta */
        var fallite = (opts && Array.isArray(opts.fallite)) ? opts.fallite : [];
        lista.forEach(function (x) {
            if (!x) return;
            if (x._scheda && typeof x._scheda === 'object' && fallite.indexOf(x.id) >= 0) {
                daLeggere.push({ id: x.id, nome: _nomeFonte(x), inLettura: false, fallita: true }); return;
            }
            if (x._scheda && typeof x._scheda === 'object') { conScheda.push(x); return; }
            if (_eImmagine(x)) { daLeggere.push({ id: x.id, nome: _nomeFonte(x), inLettura: inLettura.indexOf(x.id) >= 0 }); return; }
            if (_testuale(x)) testuali.push(x);
        });

        var attiva = conScheda.length > 0;
        var pronta = daLeggere.length === 0 && (conScheda.length + testuali.length) > 0;
        /* 0069, giro 3: con il riquadro la superficie non c'è, quindi né «Usa questa
           fonte» né «Rivedi»; e «confermata» lo dice lo stato del riquadro. Senza
           `opts.riquadro` tutto come lo 0067. */
        var riquadro = !!(opts && opts.riquadro === true);
        var mancano = '';
        if (daLeggere.length) {
            mancano = (daLeggere[0].fallita
                ? _tSafe('ci_rq_mancano_fallita', 'La lettura della foto «{nome}» non è riuscita: leggila di nuovo.')
                : daLeggere[0].inLettura
                ? (riquadro
                    /* giro 18: il riquadro sta SOPRA il verde, non «qui sotto» */
                    ? _tSafe('ci_rq_in_lettura', 'Sto leggendo la foto «{nome}»: i campi compariranno nel riquadro della scheda, da confermare.')
                    : _tSafe('ci_in_lettura', 'Sto leggendo la foto «{nome}»: conferma la scheda con «Usa questa fonte».'))
                : _tSafe('ci_leggi_prima', 'Leggi prima la foto «{nome}»: senza la scheda letta non diventa un dossier.'))
                .replace('{nome}', daLeggere[0].nome);
        }

        /* 0069, giro 13: col riquadro una scheda non confermata (o cambiata dopo la
           conferma) non è una fonte pronta — il verde si blocca e l'avviso dice di
           confermarla. Una foto da leggere ha la precedenza: prima si legge. */
        /* giro 18: un LOTTO di più foto. Con lo stato di CIASCUNA scheda
           (`opts.stati`, da `opzioniRiquadro`) il riquadro mostra la prima scheda
           NON confermata, e il verde si libera solo quando lo sono tutte; tutte
           confermate, il riquadro resta su quella che mostrava (`opts.mostrata`).
           Senza `opts.stati`, la strada del giro 13: lo stato della prima. */
        var stati = (riquadro && opts && opts.stati && typeof opts.stati === 'object') ? opts.stati : null;
        var mostrata = conScheda[0] || null, confermate;
        var statoMostrata = riquadro ? String((opts && opts.statoConferma) || 'da_confermare') : '';
        var statoVerde = opts && opts.statoConferma;
        if (stati) {
            var statoDi = function (x) { return String(stati[x.id] || 'da_confermare'); };
            confermate = conScheda.filter(function (x) { return statoDi(x) === 'confermata'; }).length;
            mostrata = conScheda.filter(function (x) { return statoDi(x) !== 'confermata'; })[0] ||
                conScheda.filter(function (x) { return x.id === opts.mostrata; })[0] || conScheda[0] || null;
            statoMostrata = mostrata ? statoDi(mostrata) : 'da_confermare';
            statoVerde = conScheda.length && confermate === conScheda.length ? 'confermata' : statoMostrata;
        }
        var blocco = (attiva && pronta) ? bloccoDelVerde({ riquadro: riquadro, stato: statoVerde, confermate: confermate, quante: conScheda.length }) : { bloccato: false };
        if (blocco.bloccato) { pronta = false; mancano = blocco.avviso; }
        var out = {
            attiva: attiva, pronta: pronta, daLeggere: daLeggere, mancano: mancano,
            titolo: '', identita: [], parti: 0, totali: (C.BLOCCHI || []).length, quante: conScheda.length,
            statoParti: '', nomiParti: [], avvisi: [], fonte: null,
            etichetta: '', spunta: { nascosta: false }
        };

        if (stati) { out.confermate = confermate; out.statoConferma = statoMostrata; }

        var prima = mostrata;
        var schedaPrima = prima ? prima._scheda : null;
        var nomePrima = prima ? (_nomeFonte(prima) || (schedaPrima && schedaPrima.nomeFile) || '') : (daLeggere[0] ? daLeggere[0].nome : '');
        if (prima || daLeggere.length) {
            var ext = (C.estensioneDi ? C.estensioneDi(nomePrima) : '').replace('.', '').toUpperCase();
            out.fonte = {
                id: prima ? prima.id : daLeggere[0].id,
                nome: nomePrima,
                formato: ext,
                /* HEIC/HEIF: Chromium non lo decodifica (mappai-visione-core.js:65) — la
                   card dichiara il formato invece di mostrarlo */
                anteprima: !(C.serveConversione && C.serveConversione(nomePrima))
            };
        }

        if (attiva) {
            out.titolo = _riga(schedaPrima.titolo) || (C.titoloDaNome ? C.titoloDaNome(nomePrima) : nomePrima);
            out.identita = _identita(schedaPrima);
            out.nomiParti = _partiPiene(schedaPrima);
            out.parti = out.nomiParti.length;
            var statoRq = statoMostrata;
            out.statoParti = (!riquadro || statoRq === 'confermata'
                ? _tSafe('ci_stato_parti', 'Scheda confermata — {n} parti su {tot}')
                : statoRq === 'stale_revision'
                    ? _tSafe('ci_rq_parti_cambiata', 'Scheda cambiata dopo la conferma, da confermare di nuovo nel riquadro della scheda — {n} parti su {tot}')
                    : _tSafe('ci_rq_parti_letta', 'Scheda letta, da confermare nel riquadro della scheda — {n} parti su {tot}'))
                .replace('{n}', out.parti).replace('{tot}', out.totali);
            if (conScheda.length > 1) {
                out.avvisi.push(_tSafe('ci_altre_foto', 'e altre {n}: un dossier per ciascuna')
                    .replace('{n}', conScheda.length - 1));
            }
            if (testuali.length) {
                /* è quello che `_startFromModal` fa davvero (`mp_dossier_solo`): con una
                   scheda fra le fonti si generano SOLO i dossier */
                out.avvisi.push(_tSafe('ci_altre_fonti', 'Le fonti che non sono foto (link, video, audio, testo) restano nell\'elenco ma non entrano nel dossier: per farne una mappa, togli la foto e genera a parte.'));
            }
            out.etichetta = conScheda.length > 1
                ? _tSafe('ci_genera_n', 'Genera i {n} dossier delle fonti').replace('{n}', conScheda.length)
                : _tSafe('ci_genera', 'Genera il dossier della fonte');
            /* LA SPUNTA (0068 fuso, strada A; Giacomo 01/10: «per le foto nascondi
               l'opzione»). Un dossier non chiama `copySourcesTo` e la foto piena va
               SEMPRE in `Allegati/`, che l'allievo riceve: la spunta non ha niente da
               decidere, quindi non si mostra (vedi anche sotto, per la foto da leggere). */
        }
        /* con una foto fra le fonti — letta o da leggere — la spunta non compare:
           O IMMAGINE O PDF (`fileAmmessi`), quindi non c'è un PDF da mandare */
        out.spunta.nascosta = attiva || daLeggere.length > 0;
        out.nascondi = vociDaNascondere(attiva || daLeggere.length > 0);
        if (riquadro) out.riquadro = true;
        if (riquadro) out.bloccoConferma = !!blocco.bloccato;
        return out;
    }

    /* ── IL VERDE E LA CONFERMA DELLA SCHEDA (0069, giro 13; Giacomo al gate 3) ──
       «se in CREA dopo aver validato la scheda il docente compie nuovamente una
       modifica allora il bottone … deve essere bloccato e deve apparire un avviso
       che invita a confermare la scheda». Col riquadro (interruttore acceso) il
       verde è libero SOLO con la scheda confermata: cambiata dopo la conferma
       (`stale_revision`) o mai confermata → bloccato, con l'avviso che dice che
       cosa fare. Senza riquadro (spento): il verde dello 0067, libero.
       o = { riquadro, stato } → { bloccato, avviso } */
    function bloccoDelVerde(o) {
        o = o || {};
        if (o.riquadro !== true || o.stato === 'confermata') return { bloccato: false, avviso: '' };
        /* giro 18: un lotto di più foto dice quante schede sono confermate */
        var lotto = typeof o.confermate === 'number' && o.quante > 1;
        if (o.stato === 'stale_revision') {
            return { bloccato: true, avviso: _tSafe('ci_rq_verde_cambiata', 'La scheda è cambiata dopo la conferma: confermala di nuovo nel riquadro prima di generare.') +
                (lotto ? ' ' + _tSafe('ci_rq_lotto_conto', '{c} di {q} schede confermate.').replace('{c}', o.confermate).replace('{q}', o.quante) : '') };
        }
        if (lotto) {
            return { bloccato: true, avviso: _tSafe('ci_rq_verde_lotto', 'Conferma tutte le schede nel riquadro prima di generare: {c} di {q} confermate.')
                .replace('{c}', o.confermate).replace('{q}', o.quante) };
        }
        return { bloccato: true, avviso: _tSafe('ci_rq_verde_conferma', 'Conferma la scheda della fonte nel riquadro prima di generare.') };
    }

    /* ── CON UNA FOTO, QUALI VOCI DEL BENTO VALGONO (Giacomo, 01/10) ─────────
       «quando ho inserito una fonte immagine tutte le opzioni, anche nel menu
       nascosto, devono aggiornarsi e mostrare solo le opzioni lasciate valide per le
       immagini». Una voce resta se la strada del DOSSIER legge davvero il suo valore
       (`_readConfig` → `_startFromModal` → `uscite` → `run`, ramo dossier); quelle che
       quella strada non legge si nascondono. Gli id sono quelli di `VOCI`
       (mappai-bento-composizione.js).
       ⚠️ Si elencano le NON valide: una voce non classificata resta VISIBILE, così una
       voce nuova non sparisce di nascosto con una foto. */
    var NON_VALIDE_CON_FOTO = [
        /* la mappa: genere, tema, nodi, motore, contenuto — il dossier non genera una mappa */
        'mn-genere', 'mn-genere-opz', 'mn-solo-mappa',
        'mn-multipass', 'mn-mmlogic', 'mn-autodepth', 'mn-gendepth', 'mn-pipeline',
        'mn-l1', 'mn-focus', 'mn-lenti', 'mn-disciplina', 'mn-stima',
        /* i materiali: con una foto li sceglie la scheda (`uscite` riscrive quiz e fogli) */
        'mp-qt-mixed', 'mp-qt-mc', 'mp-qt-fc', 'mp-qt-open', 'mp-perbranch', 'mp-fc-count', 'mp-angle',
        'mp-ang-definizione', 'mp-ang-causa', 'mp-ang-conseguenza', 'mp-ang-esempio',
        'mp-ang-confronto', 'mp-ang-eccezione', 'mp-ang-applicazione',
        'mp-ns-causal', 'mp-preset', 'mp-estimate',
        /* la sintesi e la sua voce: con una foto le sceglie la scheda (decisione 9 del 01/10) */
        'mp-syn-on', 'mp-syn-audio',
        /* le fonti che il dossier non legge (decisione 8 del 01/10): si nascondono i
           bottoni e i riquadri per AGGIUNGERNE; una fonte già presente resta
           nell'elenco delle fonti (`mn-elenco`), e l'avviso dice che non entra */
        'mn-src-url', 'mn-src-youtube', 'mn-src-audio', 'mn-src-text', 'mn-input-box', 'mn-testo',
        /* la fonte all'allievo: la foto va in Allegati comunque */
        'mp-src-pdf',
        /* «Adatta» (decisione 10 del 01/10, Giacomo: «si auto attiva già con la
           selezione della classe»): il dossier ne legge ancora il valore, ma lo
           decide la classe scelta nel giallo — a schermo non serve */
        'mn-livello'
    ];
    function visibileConFoto(id) { return NON_VALIDE_CON_FOTO.indexOf(String(id)) < 0; }
    function vociDaNascondere(conFoto) { return conFoto ? NON_VALIDE_CON_FOTO.slice() : []; }

    /* ── O IMMAGINE O DOCUMENTO (Giacomo, 01/10) ──────────────────────────────
       «se un docente carica un'immagine non deve poter caricare un PDF: o immagine
       o PDF». Vale per i FILE delle fonti-documento (`doc`, `pdf`): link, YouTube,
       audio e testo libero restano come prima. Le classi sono due: immagine
       (`accetta`) e documento (tutto il resto che «Documenti» accetta: PDF, testi,
       DOCX) — un DOCX accanto a una foto non entrerebbe nel dossier più di un PDF.
       Più foto insieme restano permesse, più documenti pure.
       Una scelta che MESCOLA le due classi si rifiuta per intero: niente entra, e la
       frase dice perché (la cosa più semplice da capire e da rifare).
       `fonti` = `appState.sources`; `nomi` = i nomi dei file scelti; `escludi` = l'id
       della fonte che sta ricevendo i file (la sua riga non conta). */
    function _classe(nome) {
        var C = VC();
        return (C.accetta && C.accetta(nome)) ? 'immagine' : 'documento';
    }
    function fileAmmessi(fonti, nomi, escludi) {
        var nuovi = (Array.isArray(nomi) ? nomi : []).map(String).filter(Boolean);
        if (!nuovi.length) return { ok: true, motivo: '' };
        var classi = {};
        nuovi.forEach(function (n) { classi[_classe(n)] = true; });
        if (classi.immagine && classi.documento) {
            return { ok: false, motivo: _tSafe('ci_no_misto', 'O foto o documenti: hai scelto insieme immagini e PDF (o altri documenti). Scegli solo le foto, oppure solo i documenti.') };
        }
        var nuova = classi.immagine ? 'immagine' : 'documento';
        var gia = '';
        (Array.isArray(fonti) ? fonti : []).forEach(function (x) {
            if (!x || x.id === escludi || !x.file) return;
            if (x.type !== 'doc' && x.type !== 'pdf') return;
            gia = gia || _classe(_nomeFonte(x));
        });
        if (!gia || gia === nuova) return { ok: true, motivo: '' };
        return { ok: false, motivo: gia === 'immagine'
            ? _tSafe('ci_no_pdf', 'Fra le fonti c\'è una foto: da una foto nasce un dossier, e un PDF o un altro documento non può stare con lei. Togli la foto per generare da un documento.')
            : _tSafe('ci_no_foto', 'Fra le fonti c\'è già un documento: una foto non può stare con lui. Togli il documento per fare il dossier di una foto.') };
    }

    /* ── IL TITOLO ────────────────────────────────────────────────────────────
       Vuoto si rifiuta: torna l'ultimo valore buono (M2). */
    function titoloCorretto(proposto, precedente) {
        var p = _riga(proposto);
        return p || _riga(precedente);
    }

    /* ── LA FONTE DI UNA SCHEDA (01/10) ───────────────────────────────────────
       Per copiare la foto piena in `Allegati/` la pipeline deve ritrovare, fra le
       fonti, quella da cui è nata la scheda del dossier. Dal 12/9 `Pipeline.run`
       lavora su una COPIA della config (JSON), quindi il confronto per identità
       (`x._scheda === config.dossier`) non trovava mai niente e la copia saltava in
       silenzio: `Allegati/` vuota in ogni dossier. Si cerca per contenuto: prima
       l'identità (chi chiama senza clonare), poi nome del file E titolo, poi il
       solo nome del file se è uno solo. Nessuna corrispondenza certa → null: meglio
       nessuna copia che la foto di un'altra fonte. */
    function fontePerScheda(fonti, dossier) {
        var tutte = (fonti || []).filter(function (x) { return x && x._scheda; });
        if (!dossier) return null;
        var stessa = tutte.filter(function (x) { return x._scheda === dossier; });
        if (stessa.length) return stessa[0];
        var nome = _riga(dossier.nomeFile);
        if (!nome) return null;
        var perNome = tutte.filter(function (x) { return _riga(x._scheda.nomeFile) === nome; });
        var perTitolo = perNome.filter(function (x) { return _riga(x._scheda.titolo) === _riga(dossier.titolo); });
        if (perTitolo.length === 1) return perTitolo[0];
        return perNome.length === 1 ? perNome[0] : null;
    }

    /* ── LE OPZIONI DELLA SCHEDA: valore salvato o default (01/10) ──────────────
       La scheda parte dalle ULTIME SCELTE confermate (`salvate`, la chiave
       `mappai_dossier_opzioni`, letta e scritta fuori di qui) oppure — la prima
       volta in assoluto — dai default di sempre: domande aperte, flashcard e
       sintesi accese, scelta multipla spenta. Lo stesso normalizzatore vale per
       le opzioni di una scheda già confermata (riaperta con «Rivedi»): una scheda
       nata prima del riquadro «Scelta multipla» non ha `mc`, e resta spenta.
       Le categorie salvate devono restare valide: un id di blocco sconosciuto si
       ignora; se così non ne resta nessuno, valgono tutte (null). Lo stesso per
       gli angoli, se si passa l'elenco di quelli che esistono. */
    var GENERI = ['oq', 'fc', 'mc'];
    var ACCESO_DI_DEFAULT = { oq: true, fc: true, mc: false };
    var N_DEFAULT = 3;
    function _idBlocchi() { return (VC().BLOCCHI || []).map(function (b) { return b.id; }); }
    function _genere(g, pref, angoliValidi) {
        var on = (g && typeof g.on === 'boolean') ? g.on : ACCESO_DI_DEFAULT[pref];
        var n = g ? parseInt(g.n, 10) : NaN;
        n = (n >= 1 && n <= 30) ? n : N_DEFAULT;
        var cat = null;
        if (g && Array.isArray(g.cat)) {
            var ids = _idBlocchi();
            var buone = g.cat.filter(function (c) { return ids.indexOf(c) >= 0; });
            cat = (g.cat.length && !buone.length) ? null : buone;
        }
        var ang = (g && Array.isArray(g.angoli)) ? g.angoli.map(String) : [];
        if (Array.isArray(angoliValidi)) ang = ang.filter(function (a) { return angoliValidi.indexOf(a) >= 0; });
        return { on: on, n: n, cat: cat, angoli: ang };
    }
    function opzioniIniziali(salvate, angoliValidi) {
        var o = (salvate && typeof salvate === 'object' && !Array.isArray(salvate)) ? salvate : {};
        var out = {};
        GENERI.forEach(function (k) { out[k] = _genere(o[k], k, angoliValidi); });
        out.syn = (typeof o.syn === 'boolean') ? o.syn : true;
        /* la voce naturale della sintesi (decisione 9 del 01/10): la prima volta, e su
           una scheda nata prima, è SPENTA — costa e fa uscire il testo dalla Svizzera */
        out.voce = (typeof o.voce === 'boolean') ? o.voce : false;
        return out;
    }

    /* ── IL PREVENTIVO DELLA SCHEDA ───────────────────────────────────────────
       `stimaDossier` di visione-core conta domande aperte, flashcard e sintesi; la
       scelta multipla si conta con la STESSA regola (angoli × categorie), passandola
       nel posto di un genere — senza un secondo calcolo scritto qui. */
    function stima(op, nBlocchiPieni) {
        var C = VC();
        op = op || {};
        if (!C.stimaDossier) return { chiamate: 0, oq: 0, fc: 0, mc: 0, syn: 0 };
        var base = C.stimaDossier(op, nBlocchiPieni);
        var mc = (op.mc && op.mc.on === true) ? C.stimaDossier({ oq: op.mc, fc: { on: false }, syn: false }, nBlocchiPieni).oq : 0;
        /* la voce costa una chiamata per blocco della sintesi: prima di generarla i
           blocchi non si conoscono, quindi si conta il minimo, 1 (come `estimateCalls`
           della pipeline quando `audioBlocks` manca) */
        var voce = voceChiesta(op) ? 1 : 0;
        return { chiamate: base.chiamate + mc + voce, oq: base.oq, fc: base.fc, mc: mc, syn: base.syn, voce: voce };
    }

    /* ── LE USCITE DEL DOSSIER ────────────────────────────────────────────────
       `preferenze` = la configurazione del bento (`_readConfig()`): ne restano il
       contesto (classe, taratura); QUALI materiali, da dove e la voce della sintesi
       li dice soltanto la scheda (`sch.opzioni`). Una scheda senza opzioni
       (nata prima del 20/8) fa domande aperte, flashcard e sintesi, come sempre.
       ⚠️ `dossier` è la scheda STESSA, non una copia: la pipeline ritrova la foto da
       copiare in `Allegati/` confrontando `x._scheda === config.dossier`. */
    /* La scheda chiede la voce? Solo se chiede anche la sintesi. */
    function voceChiesta(op) { return !!(op && op.syn !== false && op.voce === true); }
    /* `opts.chiaveGoogle`: false se la chiave Google manca — la voce si fa solo con
       Google, quindi si spegne (chi chiama lo dice, con l'avviso rosso dello 0065).
       Assente = non controllato qui. */
    function uscite(preferenze, scheda, opts) {
        var base = (preferenze && typeof preferenze === 'object') ? preferenze : {};
        var sch = scheda || {};
        var op = sch.opzioni || {};
        var chiave = !(opts && opts.chiaveGoogle === false);
        var g = { open: op.oq || {}, flashcards: op.fc || {}, mc: op.mc || {} };
        var types = [];
        if (g.open.on !== false) types.push('open');
        if (g.flashcards.on !== false) types.push('flashcards');
        if (g.mc.on === true) types.push('mc');          /* spenta se la scheda non la nomina */
        var quiz = null;
        if (types.length) {
            var multi = [], angoli = [], angoliPerTipo = {}, perTipo = {}, catPerTipo = {};
            types.forEach(function (t) {
                var a = Array.isArray(g[t].angoli) ? g[t].angoli.slice() : [];
                /* un genere si MOLTIPLICA solo se ha degli angoli scelti: senza, resta
                   una generazione sola ad angolo misto (multiTypes chiede angoli) */
                if (a.length) multi.push(t);
                angoli = angoli.concat(a);
                angoliPerTipo[t] = a;
                perTipo[t] = g[t].n;
                catPerTipo[t] = g[t].cat || null;
            });
            quiz = { types: types, perBranch: 3, angle: 'auto', multi: multi, angoli: angoli,
                angoliPerTipo: angoliPerTipo, perTipo: perTipo, catPerTipo: catPerTipo };
        }
        return Object.assign({}, base, {
            quiz: quiz,
            /* la voce dalla SCHEDA (decisione 9 del 01/10), non più dal bento */
            synthesis: (op.syn === false) ? null : { audio: voceChiesta(op) && chiave },
            /* fogli nodi e catena non sono uscite di un dossier: la pipeline li spegne
               comunque (`run`, ramo dossier) — detto anche qui */
            nodesheet: null,
            causal: null,
            dossier: scheda
        });
    }

    /* ── LA FINE DI UN LOTTO DI DOSSIER (gate 3, 01/10 sera) ──────────────────
       Dopo la generazione da foto si apre ELABORA del progetto e CREA si ripulisce
       (Giacomo: «ELABORA del progetto»). Con più foto i dossier sono un LOTTO
       (`config._lotto = {id, n, i}`, lo scrive `cfgDossier`): si apre ELABORA
       dell'ULTIMO che finisce e si ripulisce UNA volta, quando sono finiti tutti. Se
       uno fallisce il lotto non si chiude: il docente deve poter riprovare (il
       «Riprova» del riepilogo rifà il giro con la stessa config, e chiude il lotto).
       `registro` = ciò che si è già visto finire (in memoria), `esito` =
       {ok, dossier:{nomeFile, titolo}}. Restituisce il registro nuovo e, se il lotto
       è chiuso, l'elenco dei dossier da togliere da CREA. Senza `_lotto` (una
       rigenerazione da ELABORA) non chiude niente: il comportamento di prima. */
    function fineLotto(registro, lotto, esito) {
        var reg = (registro && typeof registro === 'object') ? Object.assign({}, registro) : {};
        if (!lotto || !lotto.id || !(lotto.n >= 1) || !esito || !esito.ok) return { registro: reg, chiudi: false, dossier: [] };
        var voce = (reg[lotto.id] || []).filter(function (x) { return x.i !== lotto.i; });
        voce.push({ i: lotto.i, nomeFile: _riga(esito.dossier && esito.dossier.nomeFile), titolo: _riga(esito.dossier && esito.dossier.titolo) });
        reg[lotto.id] = voce;
        if (voce.length < lotto.n) return { registro: reg, chiudi: false, dossier: [] };
        delete reg[lotto.id];
        return { registro: reg, chiudi: true, dossier: voce.map(function (x) { return { nomeFile: x.nomeFile, titolo: x.titolo }; }) };
    }

    /* ── INSEGNA: il primo comando del progetto (gate 3, 01/10 sera) ────────────
       Per un dossier il primo bottone non apre la tela (da una foto non nasce una
       mappa da guardare): è «Proietta». Per una mappa resta «Mappa». */
    function primoComando(p) { return (p && p.dossier) ? 'proietta' : 'apri'; }

    /* ── PROIETTA: quale scheda (gate 3, 01/10 sera) ────────────────────────────
       Prima l'archivio dei documenti di QUESTO computer (la scheda ricostruita
       dall'HTML dell'analisi: è quella eventualmente ricorretta in ELABORA), poi il
       VAULT (`pipeline.json`, `config.dossier`: la scheda con cui il dossier è nato),
       così Proietta funziona anche su un altro computer. Nessuna delle due → null. */
    function _eScheda(x) {
        if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
        return (VC().BLOCCHI || []).some(function (bl) { return x[bl.id] && typeof x[bl.id] === 'object'; });
    }
    function schedaPerProiezione(daArchivio, pipeline) {
        if (_eScheda(daArchivio)) return daArchivio;
        var d = pipeline && pipeline.config && pipeline.config.dossier;
        return _eScheda(d) ? d : null;
    }

    /* ── IL MARKUP DELLA SCHEDA LETTA ─────────────────────────────────────────
       Una stringa: il guscio la inserisce e aggancia gli eventi ai `data-ci`.
       Due stati: la scheda confermata (titolo nel campo, identità, parti, avvisi,
       «Rivedi la scheda») e la foto da leggere (la frase, il motivo, «Leggi la foto»). */
    function htmlScheda(comp, extra) {
        comp = comp || {};
        extra = extra || {};
        var h = '';
        if (comp.attiva && comp.riquadro) {
            /* 0069, giro 3: il titolo si corregge nel riquadro (un comando solo,
               inv. 21); qui si legge e basta */
            h += '<p class="ci-etichetta">' + esc(_tSafe('ci_titolo', 'Titolo della fonte')) + '</p>';
            h += '<p class="ci-titolo-testo">' + esc(comp.titolo) + '</p>';
        } else if (comp.attiva) {
            h += '<label class="ci-etichetta" for="ci-titolo">' + esc(_tSafe('ci_titolo', 'Titolo della fonte')) + '</label>';
            h += '<input type="text" id="ci-titolo" class="ci-titolo" data-ci="titolo" value="' + esc(comp.titolo) + '"' +
                ' aria-label="' + esc(_tSafe('ci_titolo', 'Titolo della fonte')) + '">';
        }
        if (comp.attiva) {
            if (comp.identita && comp.identita.length) {
                h += '<p class="ci-identita">' + comp.identita.map(function (r) {
                    return '<span title="' + esc(r.et) + '">' + esc(r.valore) + '</span>';
                }).join(' · ') + '</p>';
            }
            h += '<p class="ci-stato">' + esc(comp.statoParti) +
                (comp.nomiParti && comp.nomiParti.length ? ': ' + esc(comp.nomiParti.join(' · ')) : '') + '</p>';
            (comp.avvisi || []).forEach(function (a) { h += '<p class="ci-avviso">' + esc(a) + '</p>'; });
        }
        /* una foto da leggere blocca anche quando un'altra è già confermata: la
           frase sta nella card, non solo nel fumetto del verde */
        var daLeggere = comp.daLeggere && comp.daLeggere.length;
        if (daLeggere) {
            h += '<p class="ci-manca">' + esc(comp.mancano) + '</p>';
            if (extra.motivo) h += '<p class="ci-avviso">' + esc(extra.motivo) + '</p>';
        }
        h += '<div class="ci-azioni">';
        /* con il riquadro nessun gesto riapre la superficie (0069, giro 3) */
        if (comp.attiva && !comp.riquadro) h += '<button type="button" class="mn-btn" data-ci="rivedi">' + esc(_tSafe('ci_rivedi', 'Rivedi la scheda')) + '</button>';
        if (daLeggere && comp.daLeggere.some(function (d) { return !d.inLettura; })) h += '<button type="button" class="mn-btn" data-ci="leggi">' + esc(_tSafe('ci_leggi', 'Leggi la foto')) + '</button>';
        h += '</div>';
        return h;
    }

    /* ── IL RIQUADRO DELLA SCHEDA (0069, ADR 0016 rev. 1; layout del giro 4) ────
       Largo quattro colonne nel bento, al posto della riga della foto e del titolo
       (Giacomo, 03/10: «la riga numero 2 del bento deve diventare parte del box
       dell'analisi»). Dall'alto in basso, ognuno a tutta larghezza:
         · il titolo della fonte, con «Aa» accanto;
         · la foto, centrata, intera (la condizione dell'ADR: la scheda si
           conferma con la foto davanti — senza foto la conferma resta spenta);
         · i campi della scheda, uno per riga, che crescono col loro testo —
           oppure, mentre la foto si legge, la frase che lo dice;
         · la scelta dei materiali, su due colonne (la monta il guscio);
         · gli avvisi, la frase di stato (una sola) e la conferma.
       Tutti i campi della griglia, anche vuoti: il docente può riempirne uno che
       il modello ha lasciato vuoto («meglio vuoto che inventato»).
       I pezzi sono funzioni separate perché il guscio li aggiorna uno per volta:
       quando la lettura finisce cambia il corpo, non il titolo — chi ci sta
       scrivendo non perde il fuoco. `htmlRiquadro` li compone tutti. */

    /* La fase: c'è la scheda, la foto si sta leggendo, o è da leggere (lettura
       annullata o fallita: vale la regola dello 0067, «Leggi prima la foto»). */
    function faseRiquadro(o) {
        o = o || {};
        /* giro 7: la scheda c'è ma è il ripiego di una risposta illeggibile
           (`MappAIDossierFonteCore.letturaFallita`, lo decide il chiamante) */
        if (o.scheda && typeof o.scheda === 'object') return o.fallita === true ? 'fallita' : 'letta';
        return o.inLettura === true ? 'in_lettura' : 'da_leggere';
    }
    /* «Aa». Giro 5 (Giacomo, 03/10: «fattore di incremento della dimensione del
       +25% per ogni step del loop»): +25% ADDITIVO sulla base, tre stati —
       ×1 → ×1,25 → ×1,5 → ×1 (non composto: dopo 1,25 viene 1,5, non 1,5625).
       Un valore che non è uno dei tre vale ×1: il passo dopo è ×1,25. A schermo
       il bottone dice sempre e solo «Aa» («non deve mostrare il fattore»; era
       «Aa+» fino al 09/10/26, poi la regola del comando unico «Aa» per tutta
       l'app, packet 0087 lotto 6: Giacomo, «Diventa "Aa"»); il fattore lo dice
       l'`aria-label` (`ariaZoom`). Non si ricorda fra le sedute. */
    var ZOOM = [1, 1.25, 1.5];
    function zoomSuccessivo(z) {
        var i = ZOOM.indexOf(z);
        return ZOOM[(i < 0 ? 0 : i) + 1] || ZOOM[0];
    }
    function etichettaZoom() { return 'Aa'; }
    /* giro 18: il fattore già scritto nella stringa di ciascuna lingua (virgola in
       italiano, punto in inglese): il separatore decimale non si indovina */
    function ariaZoom(z) {
        var v = ZOOM.indexOf(z) >= 0 ? z : 1;
        if (v === 1.25) return _tSafe('ci_rq_zoom_aria_125', 'Ingrandisci il testo delle descrizioni: ×1,25');
        if (v === 1.5) return _tSafe('ci_rq_zoom_aria_15', 'Ingrandisci il testo delle descrizioni: ×1,5');
        return _tSafe('ci_rq_zoom_aria_1', 'Ingrandisci il testo delle descrizioni: ×1');
    }
    /* Il titolo, quando la lettura finisce. Mentre la foto si legge il campo vale
       il nome del file (`titoloDaNome`: senza estensione, trattini bassi come
       spazi); il «titolo dato dall'AI» è il campo «Titolo o slogan» della carta
       d'identità, l'unico titolo che la lettura produce. La regola: se il docente
       ha scritto nel campo durante la lettura (un testo diverso dal provvisorio,
       e non vuoto), vince il suo; altrimenti quello dell'AI; se l'AI non ne ha
       letto uno, resta il nome del file. */
    function titoloDopoLettura(o) {
        o = o || {};
        var prov = _riga(o.provvisorio), scritto = _riga(o.scritto), ai = _riga(o.dallAI);
        if (scritto && scritto !== prov) return scritto;
        return ai || prov;
    }
    /* Quale foto mostrare: il file intero se il browser lo decodifica (la copia
       della scheda è ridotta a 900 px, e il riquadro è largo 1240), altrimenti
       la copia della scheda (HEIC convertito); nessuna delle due → ''. */
    function fotoDelRiquadro(o) {
        o = o || {};
        if (o.file && o.anteprima) return 'file';
        return o.fotoB64 ? 'b64' : '';
    }
    /* Le sezioni dei materiali, raggruppate per genere (`op-<genere>[-cat|-ang]`,
       gli id di `_sezioniOpzioni`): ogni genere è una cella della griglia a due
       colonne, con le sue parti e i suoi angoli sotto di lui. Una sezione che
       non si riconosce non si perde: va in fondo, in «altro». */
    /* Giro 6 (Giacomo, 03/10: «vanno raggruppati per items: flashcard, domande
       aperte, Quiz MC»): l'ordine dei box è il suo — Flashcard, Domande aperte,
       Scelta multipla, poi Sintesi; un genere che non è nell'elenco va dopo,
       «altro» in fondo. Dentro un box: testa, parti, angoli. */
    var ORDINE_GENERI = ['fc', 'oq', 'mc', 'syn'];
    var ORDINE_SEZIONI = ['', 'cat', 'ang'];
    function gruppiOpzioni(ids) {
        var out = [], perGenere = {}, altro = [];
        (Array.isArray(ids) ? ids : []).forEach(function (id) {
            var m = /^op-([a-z]+)(?:-(cat|ang))?$/.exec(String(id));
            if (!m) { altro.push(String(id)); return; }
            if (!perGenere[m[1]]) { perGenere[m[1]] = { genere: m[1], sezioni: [], arrivo: out.length }; out.push(perGenere[m[1]]); }
            perGenere[m[1]].sezioni.push(String(id));
        });
        var posto = function (g) { var i = ORDINE_GENERI.indexOf(g.genere); return i < 0 ? ORDINE_GENERI.length + g.arrivo : i; };
        var parte = function (id) { var m = /-(cat|ang)$/.exec(id); return ORDINE_SEZIONI.indexOf(m ? m[1] : ''); };
        out.sort(function (a, b) { return posto(a) - posto(b); });
        out = out.map(function (g) {
            return { genere: g.genere, sezioni: g.sezioni.slice().sort(function (a, b) { return parte(a) - parte(b); }) };
        });
        if (altro.length) out.push({ genere: 'altro', sezioni: altro });
        return out;
    }
    /* LA FRASE DI STATO, SEMPRE IN DUE RIGHE (giro 13/14; Giacomo: «le due frasi
       del messaggio devono stare su due righe», con lo stesso corpo per ogni stato).
       La prima riga dice lo stato, la seconda che cosa succede o che cosa fare.
       ⚠️ «confermata» diceva «dopo la generazione si va diretti alla revisione dei
       materiali»: non è vero — G2 si apre solo se il controllo trova qualcosa (o
       sotto quarantena). Ora dice quello che succede di sicuro. */
    function righeStato(stato) {
        if (stato === 'confermata') return [
            _tSafe('ci_rq_conf_1', 'Scheda confermata con la foto davanti: è la fonte del dossier.'),
            _tSafe('ci_rq_conf_2', 'Dopo la generazione non c\'è la revisione dei contenuti: si passa ai materiali.')];
        if (stato === 'stale_revision') return [
            _tSafe('ci_rq_camb_1', 'La scheda è cambiata dopo la conferma: il cancello si è richiuso.'),
            _tSafe('ci_rq_camb_2', 'Rileggila con la foto davanti e confermala di nuovo.')];
        return [
            _tSafe('ci_rq_dac_1', 'Scheda da confermare: è la lettura del modello, non ancora validata.'),
            _tSafe('ci_rq_dac_2', 'Rileggila con la foto davanti, correggi ciò che il modello ha letto male e confermala: diventa la fonte del dossier.')];
    }
    function testoStato(stato) { return righeStato(stato).join(' '); }
    /* Le due righe per ogni fase: la scheda letta (stato + «(n parti su 4)» in coda
       alla seconda), la lettura in corso, la lettura fallita; «da leggere» è la frase
       della composizione, una sola. */
    function righeFrase(o) {
        o = o || {};
        if (o.fase === 'in_lettura') return [
            _tSafe('ci_rq_lett_1', 'Sto leggendo la foto «{nome}».').replace('{nome}', String(o.nome == null ? '' : o.nome)),
            _tSafe('ci_rq_lett_2', 'I campi della scheda compariranno qui, da rileggere e confermare.')];
        if (o.fase === 'fallita') return [
            _tSafe('ci_rq_fall_1', 'La lettura della foto non è riuscita: il modello ha risposto in una forma che non si legge.'),
            _tSafe('ci_rq_fall_2', 'Leggi di nuovo la foto.')];
        if (o.fase === 'da_leggere') return [String(o.mancano || '')];
        /* giro 18: in un lotto di più foto la seconda riga dice anche quante schede
           sono confermate, nella stessa parentesi: «(4 parti su 4 · 1 di 2 schede confermate)» */
        var lotto = typeof o.confermate === 'number' && o.quante > 1;
        var parti = (typeof o.parti === 'number' && typeof o.totali === 'number')
            ? ' ' + (lotto
                ? _tSafe('ci_rq_parti_lotto', '({n} parti su {tot} · {c} di {q} schede confermate)').replace('{c}', o.confermate).replace('{q}', o.quante)
                : _tSafe('ci_rq_parti', '({n} parti su {tot})')).replace('{n}', o.parti).replace('{tot}', o.totali) : '';
        var r = righeStato(o.stato);
        return [r[0], r[1] + parti];
    }
    function fraseStato(o) { return righeFrase(o).join(' '); }
    /* Il markup delle righe: due blocchi, la stessa classe per ogni stato — la
       differenza la fa il testo, mai il corpo o il peso. */
    function htmlRighe(righe) {
        return righe.map(function (r) { return '<span class="ci-riquadro__riga">' + esc(r) + '</span>'; }).join('');
    }
    function htmlRiquadroTesta(titolo, zoom) {
        var z = ZOOM.indexOf(zoom) >= 0 ? zoom : 1;
        return '<div class="ci-rq-titolo"><label class="ci-campo" for="ci-rq-titolo">' + esc(_tSafe('ci_titolo', 'Titolo della fonte')) + '</label>' +
            '<input type="text" id="ci-rq-titolo" class="ci-titolo" data-ci-campo="titolo" value="' + esc(titolo == null ? '' : String(titolo)) + '"></div>' +
            '<button type="button" class="ci-zoom" data-ci="zoom" aria-pressed="' + (z > 1 ? 'true' : 'false') + '" aria-label="' +
            esc(ariaZoom(z)) + '" title="' + esc(_tSafe('ci_rq_zoom', 'Ingrandisci il testo delle descrizioni (×1, ×1,25, ×1,5)')) + '">' + esc(etichettaZoom(z)) + '</button>';
    }
    /* `o.formato`: il formato del file quando non c'è un'anteprima (HEIC mentre si legge) */
    function htmlRiquadroFoto(foto, o) {
        o = o || {};
        if (foto) return '<img class="ci-riquadro__img" src="' + esc(foto) + '" alt="' + esc(o.alt || _tSafe('ci_rq_foto', 'La foto della fonte')) + '">';
        if (o.formato) return '<p class="ci-riquadro__senza">' + esc(_tSafe('ci_formato', 'Formato {f}: l\'anteprima qui non si mostra, ma la foto c\'è.').replace('{f}', o.formato)) + '</p>';
        return '<p class="ci-riquadro__senza">' + esc(_tSafe('ci_rq_senza_foto', 'La foto qui non si vede: senza la foto davanti la scheda non si conferma.')) + '</p>';
    }
    function htmlRiquadroCampi(sch) {
        var C = VC(), h = '<div class="ci-riquadro__blocchi">';
        sch = (sch && typeof sch === 'object') ? sch : {};
        (C.BLOCCHI || []).forEach(function (bl) {
            var src = (sch[bl.id] && typeof sch[bl.id] === 'object') ? sch[bl.id] : {};
            h += '<fieldset class="ci-blocco" data-ci-blocco="' + esc(bl.id) + '"><legend>' + esc(bl.titolo) + '</legend>';
            bl.campi.forEach(function (c) {
                var id = 'ci-rq-' + bl.id + '-' + c.id;
                h += '<label class="ci-campo" for="' + esc(id) + '">' + esc(c.et) + '</label>' +
                    '<textarea id="' + esc(id) + '" class="ci-campo__testo" rows="1" data-ci-campo="' + esc(bl.id + '.' + c.id) + '">' +
                    esc(src[c.id] == null ? '' : String(src[c.id])) + '</textarea>';
            });
            h += '</fieldset>';
        });
        return h + '</div>';
    }
    /* Al posto dei campi, finché la scheda non c'è: la lettura in corso, oppure
       «Leggi prima la foto» col motivo e il bottone (la regola dello 0067). */
    function htmlRiquadroLettura(o) {
        o = o || {};
        if (o.fase === 'in_lettura') return '<p class="ci-manca ci-riquadro__stato">' + htmlRighe(righeFrase({ fase: 'in_lettura', nome: o.nome })) + '</p>';
        /* giro 7: la lettura è fallita. La frase, «Leggi di nuovo» (la stessa strada
           di «Leggi la foto»: `data-ci="leggi"`), e la risposta del modello SOLO in
           un <details> chiuso — mai come campo da rivedere: non è una scheda */
        if (o.fase === 'fallita') {
            return '<p class="ci-manca ci-riquadro__stato">' + htmlRighe(righeFrase({ fase: 'fallita' })) + '</p>' +
                '<div class="ci-azioni"><button type="button" class="mn-btn" data-ci="leggi">' + esc(_tSafe('ci_rq_rileggi', 'Leggi di nuovo')) + '</button></div>' +
                (o.grezzo ? '<details class="ci-riquadro__grezzo"><summary>' + esc(_tSafe('ci_rq_grezzo', 'Risposta del modello')) + '</summary>' +
                    '<pre class="ci-riquadro__grezzo-testo">' + esc(o.grezzo) + '</pre></details>' : '');
        }
        return '<p class="ci-manca">' + esc(o.mancano || '') + '</p>' +
            (o.motivo ? '<p class="ci-avviso">' + esc(o.motivo) + '</p>' : '') +
            '<div class="ci-azioni"><button type="button" class="mn-btn" data-ci="leggi">' + esc(_tSafe('ci_leggi', 'Leggi la foto')) + '</button></div>';
    }
    /* Il piede: gli avvisi dello 0067 (altre foto, altre fonti), la frase di
       stato, la conferma — accesa solo con la scheda letta E la foto vista. */
    function htmlRiquadroPiede(o) {
        o = o || {};
        var letta = o.fase === 'letta', stato = letta ? (o.stato || 'da_confermare') : (o.fase || 'da_leggere');
        var h = (o.avvisi || []).map(function (a) { return '<p class="ci-avviso">' + esc(a) + '</p>'; }).join('');
        /* giro 18: la scheda a schermo è letta, ma nel lotto c'è una foto da leggere
           (annullata o fallita): il motivo e «Leggi la foto», che legge la prima
           (`_suAzione` legge `daLeggere[0]`). Una foto in lettura no: lo si sta facendo. */
        var dl = Array.isArray(o.daLeggere) ? o.daLeggere[0] : null;
        if (letta && dl && !dl.inLettura) {
            h += (o.mancano ? '<p class="ci-avviso">' + esc(o.mancano) + '</p>' : '') +
                '<div class="ci-azioni"><button type="button" class="mn-btn" data-ci="leggi">' +
                esc(_tSafe('ci_rq_leggi_lotto', 'Leggi la foto «{nome}»').replace('{nome}', String(dl.nome == null ? '' : dl.nome))) + '</button></div>';
        }
        h += '<div class="ci-riquadro__piede">';
        /* senza la scheda la frase sta al posto dei campi (`htmlRiquadroLettura`):
           qui resta vuota, una frase sola */
        h += '<p class="ci-riquadro__stato" role="status" aria-live="polite" data-ci-stato="' + esc(stato) + '">' +
            (letta ? htmlRighe(righeFrase(o)) : '') + '</p>';
        h += '<button type="button" class="mn-btn" data-ci="conferma"' + (letta && o.foto ? '' : ' disabled aria-disabled="true"') + '>' +
            esc(stato === 'confermata' ? _tSafe('ci_rq_riconferma', 'Conferma di nuovo') : _tSafe('ci_rq_conferma', 'Confermo la scheda')) + '</button>';
        return h + '</div>';
    }
    /* Il riquadro intero (lo scheletro del guscio, e i test). `opts`: foto,
       stato, zoom, fase ('letta' se c'è la scheda), titolo, nome, parti, totali,
       mancano, motivo, avvisi, formato. */
    function htmlRiquadro(sch, opts) {
        opts = opts || {};
        var haScheda = !!(sch && typeof sch === 'object');
        if (!haScheda && !opts.fase) return '';
        var fase = haScheda ? 'letta' : opts.fase;
        var foto = opts.foto ? String(opts.foto) : '';
        var titolo = opts.titolo != null ? opts.titolo : (haScheda ? sch.titolo : '');
        return _cuci(htmlRiquadroTesta(titolo, opts.zoom),
            htmlRiquadroFoto(foto, { alt: _riga(titolo), formato: opts.formato }),
            fase === 'letta' ? htmlRiquadroCampi(sch) : htmlRiquadroLettura(opts),
            htmlRiquadroPiede(Object.assign({}, opts, { fase: fase, foto: !!foto })));
    }
    /* giro 18: L'ORDINE DEL RIQUADRO, in un posto solo (inv. 6) — titolo con «Aa»,
       la foto SOPRA i campi (Giacomo, giro 4), i materiali, il fondo. Lo usano il
       riquadro pieno e lo scheletro che il guscio monta e poi riempie a pezzi. */
    function _cuci(testa, foto, campi, fondo) {
        return '<div class="ci-rq-testa">' + testa + '</div>' +
            '<div class="ci-riquadro__foto">' + foto + '</div>' +
            '<div class="ci-riquadro__campi">' + campi + '</div>' +
            '<div class="ci-riquadro__materiali" data-ci-materiali></div>' +
            '<div class="ci-riquadro__fondo">' + fondo + '</div>';
    }
    function scheletroRiquadro(titolo, zoom) { return _cuci(htmlRiquadroTesta(titolo, zoom), '', '', ''); }
    /* giro 18: le opzioni della composizione col riquadro, per un LOTTO di foto:
       quali schede sono letture fallite e lo stato della conferma di CIASCUNA
       (le regole sono del core del dossier, passate dal guscio: `statoConferma`,
       `letturaFallita`); `mostrata` = la scheda che il riquadro ha a schermo. */
    function opzioniRiquadro(fonti, o) {
        o = o || {};
        var fallita = typeof o.letturaFallita === 'function' ? o.letturaFallita : function () { return false; };
        var stato = typeof o.statoConferma === 'function' ? o.statoConferma : function () { return 'da_confermare'; };
        var con = (Array.isArray(fonti) ? fonti : []).filter(function (x) { return x && x._scheda && typeof x._scheda === 'object'; });
        var out = { inLettura: Array.isArray(o.inLettura) ? o.inLettura.slice() : [], riquadro: true, stati: {} };
        out.fallite = con.filter(function (x) { return fallita(x._scheda); }).map(function (x) { return x.id; });
        con.forEach(function (x) { if (out.fallite.indexOf(x.id) < 0) out.stati[x.id] = stato(x._scheda, x._confermaScheda); });
        if (o.mostrata != null) out.mostrata = o.mostrata;
        return out;
    }
    /* Il piede col lotto: le parti, gli avvisi, il conto delle schede confermate e
       la foto da leggere vengono dalla composizione (`o`: fase, stato, nome, foto) */
    function htmlPiedeDelLotto(comp, o) {
        comp = comp || {};
        return htmlRiquadroPiede(Object.assign({ parti: comp.parti, totali: comp.totali, avvisi: comp.avvisi,
            confermate: comp.confermate, quante: comp.quante, daLeggere: comp.daLeggere, mancano: comp.mancano }, o || {}));
    }

    /* La riga della fonte nell'elenco di CREA (giro 3). `leggiImmagineSorgente`
       (app.js, fuori perimetro) scrive «scheda confermata: farà un dossier» appena
       la scheda entra: con il riquadro la scheda entra NON confermata, e la riga
       deve dire lo stato vero. `tono`: 'ok' (verde) · 'avviso' (ambra). */
    function rigaFonte(stato, nome) {
        var n = String(nome == null ? '' : nome);
        if (stato === 'confermata') return { tono: 'ok', testo: n + ' — ' + _tSafe('src_img_ok', 'scheda confermata: farà un dossier') };
        if (stato === 'stale_revision') return { tono: 'avviso', testo: n + ' — ' + _tSafe('ci_rq_riga_cambiata', 'scheda cambiata dopo la conferma: confermala di nuovo nel riquadro') };
        if (stato === 'lettura_fallita') return { tono: 'avviso', testo: n + ' — ' + _tSafe('ci_rq_riga_fallita', 'lettura non riuscita: leggila di nuovo') };
        return { tono: 'avviso', testo: n + ' — ' + _tSafe('ci_rq_riga_letta', 'scheda letta: rileggila e confermala nel riquadro') };
    }

    return {
        rigaFonte: rigaFonte,
        bloccoDelVerde: bloccoDelVerde,
        htmlRiquadro: htmlRiquadro,
        scheletroRiquadro: scheletroRiquadro,
        opzioniRiquadro: opzioniRiquadro,
        htmlPiedeDelLotto: htmlPiedeDelLotto,
        htmlRiquadroTesta: htmlRiquadroTesta,
        htmlRiquadroFoto: htmlRiquadroFoto,
        htmlRiquadroCampi: htmlRiquadroCampi,
        htmlRiquadroLettura: htmlRiquadroLettura,
        htmlRiquadroPiede: htmlRiquadroPiede,
        faseRiquadro: faseRiquadro,
        fraseStato: fraseStato,
        righeFrase: righeFrase,
        zoomSuccessivo: zoomSuccessivo,
        etichettaZoom: etichettaZoom,
        ariaZoom: ariaZoom,
        titoloDopoLettura: titoloDopoLettura,
        fotoDelRiquadro: fotoDelRiquadro,
        gruppiOpzioni: gruppiOpzioni,
        testoStato: testoStato,
        composizione: composizione,
        uscite: uscite,
        opzioniIniziali: opzioniIniziali,
        voceChiesta: voceChiesta,
        stima: stima,
        titoloCorretto: titoloCorretto,
        fileAmmessi: fileAmmessi,
        fontePerScheda: fontePerScheda,
        fineLotto: fineLotto,
        primoComando: primoComando,
        schedaPerProiezione: schedaPerProiezione,
        visibileConFoto: visibileConFoto,
        vociDaNascondere: vociDaNascondere,
        htmlScheda: htmlScheda,
        esc: esc
    };
});
