/*
 * mappai-riassegna-copia.js — «Riassegna…» e «Copia…» nel menu della briciola (packet 0124, ADR 0025)
 * -----------------------------------------------------------------------
 * Giacomo, 23/10: «'Riassegna' apre un modale in cui selezionare le classi, gli
 * allievi e le materie esistenti nel profilo dell'insegnante, il sottotitolo del
 * modale dice 'Cambia cartella del progetto'»; «'Copia' […] il sottotitolo del
 * modale dice 'Copia tutto il progetto nella cartella di un altra destinazione'»;
 * «I modali devono obbligare a scegliere una classe o un allievo e poi una materia,
 * altrimenti bloccano l'operazione»; velo e uscita solo con × o Esc; sopra la
 * console. 24/10: niente «Generico»; «dopo il copia sto sul progetto nella nuova
 * posizione».
 *
 * Il modale passa dal motore (`MappAIModal.open`, veste «grande», inv. 10-11: il
 * piano più alto lo dà il motore, quindi sta sopra la console che lo apre). Le
 * scelte le fa il core (`MappAIRiassegnaCopiaCore`); lo spostamento e la copia
 * `main.js` (`vault-relocate`, `vault-copy`). Dopo «Riassegna» i riferimenti si
 * riparano come dopo «Rinomina…» (`MappAIRinomina.riparaRiferimenti`: mappa
 * aperta, riga, fotografia, padronanza, pipeline.json col manifesto in memoria).
 * La mappa aperta si salva PRIMA (le due chiamate di HOME), o non si muove niente.
 *
 * Interruttore `mappai_riassegna_copia`: acceso salvo '0' (le due voci spariscono).
 * Namespace: window.MappAIRiassegnaCopia = { attivo, apri }.
 */
(function () {
    'use strict';

    var t = function (k, f) { try { return window.t ? window.t(k, f) : f; } catch (e) { return f; } };
    function C() { return window.MappAIRiassegnaCopiaCore; }
    function toast(m, k) { try { if (window.showToast) window.showToast(m, k || 'info'); } catch (e) { } }
    function _st() { try { return (typeof appState !== 'undefined') ? appState : window.appState; } catch (e) { return window.appState; } }
    function _sm() { try { return (typeof StorageManager !== 'undefined') ? StorageManager : null; } catch (e) { return null; } }
    function _nome(p) { return String(p == null ? '' : p).split(/[\\/]/).filter(Boolean).pop() || ''; }
    function _stesso(a, b) {
        var NC = window.MappAINomeCartellaCore;
        return !!(a && b && (NC && NC.stessoPercorso ? NC.stessoPercorso(a, b) : String(a) === String(b)));
    }

    function attivo() {
        try { return localStorage.getItem('mappai_riassegna_copia') !== '0'; } catch (e) { return true; }
    }

    /* gli elenchi: classi e allievi del profilo, materie della classe (o del profilo),
       in ordine con la regola delle briciole (inv. 6) */
    function _ordina(arr, chiave) {
        var CB = window.MappAIConsoleBento;
        return (CB && CB.ordinaElenco) ? CB.ordinaElenco(arr, chiave) : (arr || []).slice();
    }
    function _classi() { try { var CL = window.MappAIClasses; return (CL && CL.list && CL.list()) || []; } catch (e) { return []; } }
    function _allievi() {
        var s = _st();
        return ((s && s.allProfiles) || []).filter(function (p) { return p && p.nickname; });
    }
    function _materieDi(scelta) {
        if (!scelta) return [];
        try {
            if (scelta.tipo === 'classe') {
                var CL = window.MappAIClasses, c = CL && CL.get ? CL.get(scelta.id) : null;
                return _ordina((CL && CL.disciplineChoices) ? (CL.disciplineChoices(c || {}) || []) : []);
            }
            var TP = window.MappAITeacherProfile;
            return _ordina((TP && TP.disciplineList && TP.disciplineList()) || []);
        } catch (e) { return []; }
    }

    var TESTI = {
        riassegna: function () { return { titolo: t('rc_riassegna_titolo', 'Riassegna il progetto'), sottotitolo: t('rc_riassegna_sotto', 'Cambia cartella del progetto'), bottone: t('rc_riassegna_ok', 'Riassegna'), icona: 'folder-input' }; },
        copia: function () { return { titolo: t('rc_copia_titolo', 'Copia il progetto'), sottotitolo: t('rc_copia_sotto', 'Copia tutto il progetto nella cartella di un altra destinazione'), bottone: t('rc_copia_ok', 'Copia'), icona: 'copy' }; }
    };
    function _motivo(m) {
        return ({
            'Scegli una classe o un allievo.': t('rc_manca_chi', 'Scegli una classe o un allievo.'),
            'Scegli la materia.': t('rc_manca_materia', 'Scegli la materia.'),
            'Il progetto è già qui.': t('rc_gia_qui', 'Il progetto è già qui.')
        })[m] || m;
    }

    /* Il modale, come schema del motore. `stato` = { chi, materia }; `ctx` = ciò che
       non cambia mentre il modale è aperto (testi, scelte, posizione di adesso). */
    function _schema(ctx, stato) {
        var scelta = C().sceltaDa(stato.chi, ctx.scelte);
        var materie = _materieDi(scelta);
        var mat = materie.indexOf(stato.materia) >= 0 ? stato.materia : '';
        var v = C().valida(scelta, mat, ctx.attuale);
        var dest = v.ok ? C().destinazione(scelta, mat) : null;
        return {
            titolo: ctx.testi.titolo, sottotitolo: ctx.testi.sottotitolo, icona: ctx.testi.icona,
            taglia: 'm', veste: 'grande',
            sezioni: [
                { dati: [{ etichetta: t('rc_ora', 'Ora'), valore: C().dove(ctx.attuale, ctx.nome, ctx.nomiBasi) || ctx.vaultPath }] },
                {
                    campi: [
                        { id: 'chi', tipo: 'scelta', etichetta: t('rc_chi', 'Classe o allievo'), obbligatorio: true, valore: scelta ? scelta.valore : '',
                          opzioni: [{ valore: '', etichetta: t('rc_scegli', 'scegli') }].concat(ctx.scelte.map(function (s) {
                              return { valore: s.valore, etichetta: s.tipo === 'allievo' ? s.etichetta + ' (' + t('rc_allievo', 'allievo') + ')' : s.etichetta };
                          })) },
                        { id: 'materia', tipo: 'scelta', etichetta: t('rc_materia', 'Materia'), obbligatorio: true, valore: mat,
                          opzioni: [{ valore: '', etichetta: scelta ? t('rc_scegli', 'scegli') : t('rc_prima_chi', 'scegli prima la classe o l\'allievo') }]
                              .concat(materie.map(function (m) { return { valore: m, etichetta: m }; })) }
                    ]
                },
                { dati: [{ etichetta: t('rc_andra', 'Andrà in'), valore: dest ? C().dove(dest, ctx.nome, ctx.nomiBasi) : '—' }] }
            ],
            azioni: [
                { id: 'no', etichetta: t('mm_annulla', 'Annulla') },
                { id: 'ok', etichetta: ctx.testi.bottone, ruolo: 'primario', spento: !v.ok, fumetto: v.ok ? undefined : _motivo(v.motivo) }
            ]
        };
    }

    /* il contesto attivo segue la destinazione: la console la mostra e, per la mappa
       aperta, `index.yaml` non torna a dire la classe di prima (trappola dello 0082) */
    function _contestoVerso(dest, scelta) {
        try {
            var CL = window.MappAIClasses;
            if (!CL) return;
            if (scelta.tipo === 'allievo') {
                var p = _allievi().filter(function (x) { return x.nickname === scelta.nome; })[0];
                if (CL.setActive) CL.setActive('', { silenzioso: true });
                if (p && CL.setActiveStudent) CL.setActiveStudent(p);
            } else {
                if (CL.setActiveStudent) CL.setActiveStudent(null);
                if (CL.setActive) CL.setActive(scelta.id, { silenzioso: true });
            }
            if (CL.setActiveDiscipline) CL.setActiveDiscipline(dest.materia);
        } catch (e) { }
    }

    /* progetto = { vaultPath, nome, titolo, projectId, idRiga, lettura } (come per «Rinomina…»);
       opts.dopo({ modo, fullPath, dest }) quando il gesto è riuscito. → il risultato o false. */
    async function apri(modo, progetto, opts) {
        var p = progetto || {}, o = opts || {};
        var api = window.electronAPI, CORE = C();
        if (!attivo() || !CORE || !window.MappAIModal || !api || !p.vaultPath) return false;
        if (modo !== 'riassegna' && modo !== 'copia') return false;
        if (modo === 'riassegna' && !api.vaultRelocate) return false;
        if (modo === 'copia' && !api.vaultCopy) return false;
        if (window.mappaiOccupato && window.mappaiOccupato()) return false;   // dice da sé il motivo
        var st = _st(), sm = _sm();
        var aperta = !!(st && _stesso(st.activeVaultPath, p.vaultPath));
        if (aperta && st.extractionMode === 'lettura') {
            toast(t('rc_lettura_aperta', 'Questo percorso di lettura è aperto: apri un altro progetto, poi riprova.'), 'warning');
            return false;
        }
        var basi = null;
        try { basi = api.filesRootGet ? await api.filesRootGet() : null; } catch (e) { basi = null; }
        basi = { maps: (basi && basi.mapsBaseDir) || '', students: (basi && basi.studentsBaseDir) || '' };
        var ctx = {
            testi: TESTI[modo](), vaultPath: p.vaultPath, nome: p.nome || _nome(p.vaultPath),
            scelte: CORE.scelteChi(_ordina(_classi(), 'name'), _ordina(_allievi(), 'nickname')),
            attuale: CORE.posizioneDi(p.vaultPath, basi),
            nomiBasi: { maps: _nome(basi.maps) || 'Classi', students: _nome(basi.students) || 'Allievi' }
        };
        var schema = _schema(ctx, { chi: '', materia: '' });
        schema.suAzione = function (ev, box, ridisegna) {
            if (!ev || ev.azione !== '__campo' || typeof ridisegna !== 'function') return;
            var nuovo = _schema(ctx, { chi: (ev.valori || {}).chi || '', materia: (ev.valori || {}).materia || '' });
            nuovo.suAzione = schema.suAzione;
            ridisegna(nuovo);
        };
        var r = await window.MappAIModal.open(schema);
        if (!r || r.azione !== 'ok') return false;
        var val = r.valori || {};
        var scelta = CORE.sceltaDa(val.chi, ctx.scelte);
        var materia = _materieDi(scelta).indexOf(val.materia) >= 0 ? val.materia : '';
        var v = CORE.valida(scelta, materia, ctx.attuale);
        if (!v.ok) { toast(_motivo(v.motivo), 'warning'); return false; }
        var dest = CORE.destinazione(scelta, materia);
        if (window.mappaiOccupato && window.mappaiOccupato()) return false;

        /* la mappa aperta si scrive PRIMA: si sposta o si copia quello che c'è a schermo */
        if (aperta) {
            try { if (sm && sm.saveCurrentProject) sm.saveCurrentProject(); } catch (e) { }
            var w = null;
            try { w = (api.saveVault && window.buildVaultMapData) ? await api.saveVault({ folderPath: st.activeVaultPath, mapData: window.buildVaultMapData() }) : { success: true }; } catch (e) { w = null; }
            if (!w || !w.success) {
                toast(t('rc_salva_ko', 'Non riesco a salvare la mappa aperta: il progetto non è stato toccato.'), 'error');
                return false;
            }
        }
        /* verso un allievo la sua scheda, verso una classe la scheda vuota — quella che
           `_setActiveStudent(null)` mette in appState (mappai-live-classes.js): aprire la
           mappa rimette la scheda di index.yaml, e la briciola deve dire dove sta */
        var allievo = scelta.tipo === 'allievo' ? _allievi().filter(function (x) { return x.nickname === scelta.nome; })[0] : null;
        var dichiara = { classe: dest.classeNome, materia: dest.materia,
            userProfile: allievo ? Object.assign({}, allievo) : { nickname: '', age: '', grade: '', system: 'Ticino' } };
        var res = null, fullPath = '';
        if (modo === 'riassegna') {
            var idCartella = (aperta && sm && sm.idInCartella && _stesso(sm.idInCartella.percorso, p.vaultPath) && sm.idInCartella.id) || p.projectId || null;
            try { res = await api.vaultRelocate({ folderPath: p.vaultPath, base: dest.base, parti: dest.parti, dichiara: dichiara, projectId: idCartella }); } catch (e) { res = null; }
            if (!res || !res.success) { toast(t('rc_riassegna_ko', 'Non è stato possibile spostare il progetto.') + (res && res.error ? ' (' + res.error + ')' : ''), 'error'); return false; }
            fullPath = res.fullPath;
            var idRiga = p.idRiga || (aperta && sm ? sm.currentProjectId : null);
            if (window.MappAIRinomina && window.MappAIRinomina.riparaRiferimenti) {
                try { await window.MappAIRinomina.riparaRiferimenti({ vecchio: p.vaultPath, nuovo: fullPath, idRiga: idRiga }); } catch (e) { }
            }
            try {
                var righe = JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]');
                if (Array.isArray(righe) && idRiga) {
                    localStorage.setItem('tutor_ai_projects', JSON.stringify(righe.map(function (x) {
                        return (x && x.id === idRiga) ? CORE.rigaRiassegnata(x, dest, scelta) : x;
                    })));
                }
            } catch (e) { /* la riga si riallinea al primo salvataggio */ }
            if (aperta) {
                st.activeVaultClassDir = dest.classDir;
                st.activeVaultDiscDir = dest.discDir;
                st.vaultClasse = dichiara.classe;
                st.vaultMateria = dichiara.materia;
            }
            try { if (window.MappAIVaults) window.MappAIVaults.segnala('mappa-spostata', { vaultPath: fullPath, prima: p.vaultPath }); } catch (e) { }
            toast(t('rc_riassegnato', 'Spostato in {d}.').replace('{d}', CORE.dove(dest, res.folderName || ctx.nome, ctx.nomiBasi)), 'success');
        } else {
            var nuovoId = 'proj_' + Date.now();
            try { res = await api.vaultCopy({ src: p.vaultPath, base: dest.base, parti: dest.parti, nome: ctx.nome, projectId: nuovoId, dichiara: dichiara }); } catch (e) { res = null; }
            if (!res || !res.ok) { toast(t('rc_copia_ko', 'Non è stato possibile copiare il progetto.') + (res && res.error ? ' (' + res.error + ')' : ''), 'error'); return false; }
            fullPath = res.folderPath;
            try { if (window.MappAIVaults) window.MappAIVaults.segnala('mappa-creata', { vaultPath: fullPath }); } catch (e) { }
            toast(t('rc_copiato', 'Copiato in {d}.').replace('{d}', CORE.dove(dest, res.folderName || ctx.nome, ctx.nomiBasi)), 'success');
        }
        _contestoVerso(dest, scelta);
        if (typeof o.dopo === 'function') { try { o.dopo({ modo: modo, fullPath: fullPath, dest: dest }); } catch (e) { } }
        return res;
    }

    window.MappAIRiassegnaCopia = { attivo: attivo, apri: apri };
})();
