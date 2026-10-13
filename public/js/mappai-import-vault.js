/*
 * mappai-import-vault.js — «Importa dal Vault» COPIA la cartella in Mappe/ (0095, ADR 0021)
 * -----------------------------------------------------------------------
 * Prima «Importa dal Vault» apriva la cartella dov'era: il docente ci lavorava
 * dentro e la mappa restava fuori dall'ordine di `Mappe/<classe>/<materia>/`.
 * Ora un modale legge da `index.yaml` titolo, classe e materia, dice dove la
 * mette, la copia lì (l'originale non si tocca) e restituisce la copia, che
 * `loadMapVault` apre come apriva prima la cartella scelta.
 *
 * Scelte di Giacomo (13/10): se la materia non c'è si propone PER PRIMA di
 * aggiungerla alle sue materie (scelta «c»); se la classe non c'è si crea solo
 * la cartella (D1); la copia tiene classe e materia di chi l'ha fatta (D2).
 * Le decisioni stanno nel core puro (`mappai-import-vault-core.js`, inv. 4);
 * la copia la fa main.js (`import-vault-copy`).
 *
 * Interruttore `mappai_nome_da_cartella` (lo stesso dello 0094): spento solo
 * con '0', e allora «Importa dal Vault» apre la cartella dov'è, come prima.
 */
(function () {
    'use strict';

    var t = function (k, f) { try { return window.t ? window.t(k, f) : f; } catch (e) { return f; } };
    var ultimoContesto = null;   // classe e materia dell'ultima copia, per INSEGNA (D11)
    function toast(m, k) { if (window.showToast) window.showToast(m, k || 'info'); else console.log(m); }
    function velo(on, testo) { try { if (window.showLoadingOverlay) window.showLoadingOverlay(on, testo); } catch (e) { /* nessun velo */ } }
    function core() { return window.MappAIImportVaultCore; }
    function chiave(x) { var v = String(x == null ? '' : x).trim(); try { v = v.normalize('NFC'); } catch (e) { } return v.toLowerCase(); }

    function attivo() {
        try { return localStorage.getItem('mappai_nome_da_cartella') !== '0'; } catch (e) { return true; }
    }

    /* Il nome libero col suffisso « · 0N»: la regola della rinomina, una fonte
       sola (inv. 6) — `MappAINomeCartellaCore.nomeLibero` dello 0094. */
    function nomeLibero(nome, fratelli) {
        var N = window.MappAINomeCartellaCore;
        if (!N || !N.nomeLibero) throw new Error('regola del nome libero non disponibile');
        return N.nomeLibero(nome, fratelli, []);
    }

    function classiDelDocente() {
        try {
            var CL = window.MappAIClasses;
            return ((CL && CL.list && CL.list()) || []).map(function (c) { return { name: c.name, sede: c.sede || '' }; });
        } catch (e) { return []; }
    }
    /* Le materie «mie» come le conta la sidebar (`_materieMie`): quelle del
       profilo e quelle dichiarate dalle classi, senza doppioni. */
    function materieDelDocente() {
        var out = [], visti = {};
        var metti = function (d) { var k = chiave(d); if (k && !visti[k]) { visti[k] = true; out.push(String(d).trim()); } };
        try {
            var TP = window.MappAITeacherProfile;
            ((TP && TP.disciplineList && TP.disciplineList()) || []).forEach(metti);
            var CL = window.MappAIClasses;
            ((CL && CL.list && CL.list()) || []).forEach(function (c) {
                ((CL.disciplinesOf && CL.disciplinesOf(c)) || []).forEach(metti);
            });
        } catch (e) { }
        return out;
    }

    /* D7: la materia va nel profilo e, se la classe di destinazione è del
       docente e dichiara un suo elenco di materie, anche lì — con le API
       pubbliche dei due moduli. */
    function aggiungiMateria(materia, classeNome) {
        var m = String(materia || '').trim();
        if (!m) return Promise.resolve();
        try {
            var TP = window.MappAITeacherProfile;
            if (TP && TP.get && TP.salva) {
                var S = TP.get() || {};
                var lista = Array.isArray(S.discipline) ? S.discipline.slice() : [];
                if (!lista.some(function (d) { return chiave(d) === chiave(m); })) {
                    lista.push(m);
                    TP.salva(Object.assign({}, S, { discipline: lista }));
                }
            }
        } catch (e) { console.warn('[Import] materia nel profilo:', e.message); }
        try {
            var CL = window.MappAIClasses;
            var c = classeNome && CL && CL.list ? CL.list().filter(function (x) { return chiave(x.name) === chiave(classeNome); })[0] : null;
            if (c && Array.isArray(c.disciplines) && c.disciplines.length && !c.disciplines.some(function (d) { return chiave(d) === chiave(m); })) {
                c.disciplines.push(m);
                return Promise.resolve(CL.save()).catch(function (e) { console.warn('[Import] materia nella classe:', e && e.message); });
            }
        } catch (e) { console.warn('[Import] materia nella classe:', e.message); }
        return Promise.resolve();
    }

    function dove(dest) { return ['Mappe'].concat(dest.segmenti || []).join(' › '); }
    function avvisoNome(dest) {
        return t('iv_nome_esiste', 'Questo nome esiste già, potrai modificarlo in seguito o tenere la numerazione automatica.') +
            ' ' + t('iv_nome_sara', 'Il vault si chiamerà «{n}».').replace('{n}', dest.nome);
    }

    /* La riga della proposta: dice che cosa succede, con le parole del docente. */
    function testoProposta(piano) {
        var manca = piano.mancano, out = [];
        if (manca.indexOf('materia') >= 0) out.push(t('iv_aggiungi_materia', 'Aggiungi «{m}» alle tue materie.').replace('{m}', piano.materia.nome));
        if (manca.indexOf('classe') >= 0) out.push(t('iv_classe_cartella', 'La classe «{c}» non è fra le tue: si crea solo la sua cartella, e la mappa ti comparirà sotto «Generico».').replace('{c}', piano.classe.nome));
        out.push(t('iv_va_in', 'Il vault va in {d}.').replace('{d}', dove(piano.destinazione)));
        return out.join(' ');
    }

    /* D8 (Giacomo, gate del 13/10): con la proposta scelta le due tendine di
       «Mettilo in una tua classe e materia» sono bloccate; si sbloccano solo
       scegliendo quella strada. Il motore non ha un campo «bloccato»: si agisce
       sul DOM del modale, all'apertura e a ogni cambio di campo (`__campo`). */
    function bloccaTendine(radice) {
        try {
            var r = radice && radice.querySelector ? radice : null;
            if (!r) return;
            var scelta = r.querySelector('[data-campo="iv_scelta"]');
            var off = !(scelta && scelta.checked);
            ['iv_classe', 'iv_materia'].forEach(function (id) {
                var el = r.querySelector('[data-campo="' + id + '"]');
                if (el) el.disabled = off;
            });
        } catch (e) { /* senza DOM (Node): niente da bloccare */ }
    }

    /* Il modale. Esce { via: 'proposta' } · { via: 'scelta', classe, materia } · null. */
    function modale(piano, classi, materie) {
        var MM = window.MappAIModal;
        var dati = [
            { etichetta: t('iv_titolo_mappa', 'Titolo'), valore: piano.titolo || '—' },
            { etichetta: t('iv_dal_vault', 'Classe e materia del vault'),
              valore: [piano.classe.nome || t('iv_nessuna_classe', 'nessuna classe'), piano.materia.nome || t('iv_nessuna_materia', 'nessuna materia')].join(' · ') }
        ];
        var sezioni = [{ dati: dati }];
        if (!piano.mancano.length) {
            sezioni.push({ titolo: t('iv_dove_t', 'Dove lo metto'), testo: t('iv_va_in', 'Il vault va in {d}.').replace('{d}', dove(piano.destinazione)) });
        } else {
            var opzClassi = [{ valore: '', etichetta: t('iv_generico', 'Generico (nessuna classe)') }]
                .concat(classi.map(function (c) { return { valore: c.name, etichetta: c.name }; }));
            var opzMaterie = [{ valore: '', etichetta: t('iv_nessuna_materia_opz', '— nessuna materia —') }]
                .concat(materie.map(function (m) { return { valore: m, etichetta: m }; }));
            sezioni.push({
                titolo: t('iv_dove_t', 'Dove lo metto'),
                campi: [
                    { id: 'iv_proposta', tipo: 'radio', gruppo: 'iv_dove', valore: true,
                      etichetta: piano.mancano.indexOf('materia') >= 0 ? t('iv_proposta_m', 'Aggiungi la materia e crea la cartella')
                                                                       : t('iv_proposta_c', 'Crea la cartella della classe'),
                      aiuto: testoProposta(piano) },
                    { id: 'iv_scelta', tipo: 'radio', gruppo: 'iv_dove',
                      etichetta: t('iv_scelta', 'Mettilo in una tua classe e materia'),
                      aiuto: t('iv_scelta_d', 'Scegli qui sotto. Con «Generico» la materia non fa cartella.') },
                    { id: 'iv_classe', tipo: 'scelta', etichetta: t('iv_classe', 'Classe'), valore: '', opzioni: opzClassi, larghezza: 'meta' },
                    { id: 'iv_materia', tipo: 'scelta', etichetta: t('iv_materia', 'Materia'), valore: piano.materia.mia ? piano.materia.nome : '', opzioni: opzMaterie, larghezza: 'meta' }
                ]
            });
        }
        if (piano.destinazione.suffisso && !piano.mancano.length) sezioni.push({ testo: avvisoNome(piano.destinazione) });
        else if (piano.destinazione.suffisso) sezioni.push({ testo: t('iv_proposta_nome', 'Con la proposta: ') + avvisoNome(piano.destinazione) });
        var aperto = MM.open({
            titolo: t('iv_titolo', 'Importa un vault'),
            icona: 'folder-input',
            taglia: 'm',
            sezioni: sezioni,
            azioni: [
                { id: 'annulla', etichetta: t('iv_annulla', 'Annulla'), ruolo: 'quieto' },
                { id: 'importa', etichetta: t('iv_importa', 'Importa'), ruolo: 'primario' }
            ],
            suAzione: function (ev, box) { if (ev && ev.azione === '__campo') bloccaTendine(box); }
        });
        /* il motore monta il modale dentro `open`, in modo sincrono: le tendine ci sono già */
        if (piano.mancano.length) { try { bloccaTendine(document); } catch (e) { } }
        return aperto.then(function (r) {
            if (!r || r.azione !== 'importa') return null;
            var v = r.valori || {};
            if (piano.mancano.length && v.iv_scelta) return { via: 'scelta', classe: v.iv_classe || '', materia: v.iv_materia || '' };
            return { via: 'proposta' };
        });
    }

    var ERRORI = {
        'non-vault': function () { return t('iv_non_vault', 'Questa cartella non è un vault di MappAI (manca index.yaml).'); },
        'esiste': function () { return t('iv_esiste', 'Nel frattempo è comparsa una cartella con lo stesso nome: riprova.'); },
        'dentro-se-stessa': function () { return t('iv_dentro_se', 'Questa cartella contiene la cartella delle mappe: non si può copiare dentro se stessa.'); }
    };
    function messaggio(err) {
        var f = ERRORI[err];
        return f ? f() : (t('iv_copia_ko', 'Copia non riuscita: ') + String(err || ''));
    }

    /* «Importa dal Vault» → { folderPath, dossier } da aprire (la copia, o la
       cartella scelta se sta già in Mappe/ o in Allievi/: D3) · { annullato: true }.
       Senza i due IPC (versione vecchia, reader) la cartella si apre dov'è. */
    function importa(src) {
        var api = window.electronAPI;
        var C = core();
        if (!api || !api.importVaultInfo || !api.importVaultCopy || !C || !window.MappAIModal) return Promise.resolve({ folderPath: src });
        var stato = {};
        return Promise.resolve(api.importVaultInfo({ src: src })).then(function (info) {
            if (!info || !info.ok) { toast(t('iv_non_trovata', 'Non riesco a leggere la cartella scelta.'), 'error'); return { annullato: true }; }
            /* D9: un dossier da foto, una volta aperto, va in «Proietta» (lo fa loadMapVault) */
            stato.dossier = String((info.indice || {}).dossier) === 'true';
            if (info.dentro) return { folderPath: src, dossier: stato.dossier };
            if (!info.haIndice) {
                return Promise.resolve(window.MappAIModal.avviso({ titolo: t('iv_titolo', 'Importa un vault'), icona: 'folder-x', testo: messaggio('non-vault') }))
                    .then(function () { return { annullato: true }; });
            }
            return Promise.resolve(api.getAllVaults ? api.getAllVaults() : []).catch(function () { return []; }).then(function (cartelle) {
                var voci = [];
                try { voci = JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]') || []; } catch (e) { voci = []; }
                var classi = classiDelDocente(), materie = materieDelDocente();
                var q = { classi: classi, cartelle: cartelle || [], nomeLibero: nomeLibero };
                var piano = C.pianoImport({ indice: info.indice || {}, nomeOrigine: info.nome, cartelle: cartelle || [], voci: voci,
                    classi: classi, materieMie: materie, nomeLibero: nomeLibero });
                return modale(piano, classi, materie).then(function (scelta) {
                    if (!scelta) return { annullato: true };
                    stato.piano = piano;
                    stato.dest = piano.destinazione;
                    stato.materiaNuova = scelta.via === 'proposta' && piano.mancano.indexOf('materia') >= 0;
                    stato.contesto = { cls: piano.classe.nome || '', disc: piano.classe.nome ? (piano.materia.nome || '') : '' };
                    if (scelta.via !== 'scelta') return { avanti: true };
                    stato.dest = C.destinazioneScelta(piano, { classe: scelta.classe, materia: scelta.materia }, q);
                    stato.contesto = { cls: scelta.classe || '', disc: scelta.classe ? (scelta.materia || '') : '' };
                    if (!stato.dest.suffisso) return { avanti: true };
                    // la destinazione scelta ha già quel nome: lo si dice prima di copiare
                    return window.MappAIModal.conferma({
                        titolo: t('iv_titolo', 'Importa un vault'), icona: 'folder-input',
                        testo: avvisoNome(stato.dest) + ' ' + t('iv_va_in', 'Il vault va in {d}.').replace('{d}', dove(stato.dest)),
                        conferma: t('iv_importa', 'Importa')
                    }).then(function (si) { return si ? { avanti: true } : { annullato: true }; });
                });
            });
        }).then(function (passo) {
            if (!passo || !passo.avanti) return passo || { annullato: true };
            velo(true, t('iv_velo', 'Copia del vault…'));
            return Promise.resolve(api.importVaultCopy({
                src: src, classDir: stato.dest.classDir, discDir: stato.dest.discDir,
                nome: stato.dest.nome, projectId: stato.piano.id.valore
            })).then(function (res) {
                velo(false);
                if (!res || !res.ok) { toast(messaggio(res && res.error), 'error'); return { annullato: true }; }
                /* la materia si aggiunge solo a copia riuscita: un import fallito non lascia tracce nel profilo */
                return (stato.materiaNuova ? aggiungiMateria(stato.piano.materia.nome, stato.piano.classe.mia ? stato.piano.classe.nome : '') : Promise.resolve())
                    .then(function () {
                        toast(t('iv_fatto', 'Vault importato in {d}.').replace('{d}', dove(stato.dest)), 'success');
                        ultimoContesto = { vaultPath: res.folderPath, cls: (stato.contesto || {}).cls || '', disc: (stato.contesto || {}).disc || '' };
                        return { folderPath: res.folderPath, dossier: !!stato.dossier };
                    });
            }, function (e) {
                velo(false);
                toast(messaggio(e && e.message), 'error');
                return { annullato: true };
            });
        }).catch(function (e) {
            velo(false);
            console.warn('[Import] non riuscito:', e);
            toast(messaggio(e && e.message), 'error');
            return { annullato: true };
        });
    }

    /* ── D9 e D11 (Giacomo, gate del 13/10): un dossier da foto si apre in «Proietta»,
       e uscendo da «Proietta» si torna a INSEGNA, sul progetto — come quando lo si
       proietta da lì. Si apre prima la console INSEGNA sulla voce del progetto
       (contesto allineato alla sua classe e materia), poi «Proietta» sopra: il
       motore dà a chi apre DOPO il piano più alto, e la × di «Proietta» scopre la
       console. Solo API pubbliche (`MappAITeach`, `MappAIProiezione`). */
    function apriDossier(vaultPath, titolo) {
        var P = window.MappAIProiezione, T = window.MappAITeach;
        if (!P || !P.apri) return Promise.resolve(false);
        var proietta = function () { P.apri({ mapName: titolo || '', vaultPath: vaultPath }); return true; };
        if (!T || !T.setMode || !T.mappeDelContesto) return Promise.resolve(proietta());
        var ctx = (ultimoContesto && ultimoContesto.vaultPath === vaultPath) ? ultimoContesto : null;
        if (!ctx) {
            /* un dossier già in Mappe/ (D3): classe e materia dalla posizione della cartella */
            var st = null;
            try { st = (typeof appState !== 'undefined') ? appState : window.appState; } catch (e) { st = window.appState; }
            if (st && st.activeVaultPath === vaultPath) ctx = { cls: st.activeVaultClassDir || '', disc: st.activeVaultDiscDir || '' };
        }
        try { if (ctx && T.allineaContestoA) T.allineaContestoA({ cls: ctx.cls, disc: ctx.disc }); } catch (e) { }
        return Promise.resolve(T.mappeDelContesto()).catch(function () { return []; }).then(function (list) {
            var m = (T.mappaCorrente && T.mappaCorrente(list)) ||
                (list || []).filter(function (x) { return x && x.v && x.v.fullPath === vaultPath; })[0] || null;
            try { T.setMode('teach', m ? m.id : undefined); } catch (e) { console.warn('[Import] INSEGNA:', e && e.message); }
            return proietta();
        });
    }

    window.MappAIImportVault = { attivo: attivo, importa: importa, apriDossier: apriDossier, core: core, _materieDelDocente: materieDelDocente, _aggiungiMateria: aggiungiMateria };
})();
