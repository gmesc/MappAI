/* =========================================================================
   VISTA STUDIO (1/8) — il passo «STUDIO» del ciclo LAYOUT.
   Overlay a card sopra il canvas: il force layout resta intatto sotto e si
   ritrova uscendo. Comandi nel tab «Vista studio» della sidebar (visibile
   solo qui). Il profilo vive in appState.studioProfile → viaggia col
   progetto (autosave); la scrittura nel vault arriva in una fase successiva.
   Kill-switch: localStorage mappai_studio_view='0' (gestito in toggleLayout).
   Dipende da: mappai-studio-layouts.js (motori), mappai-studio-draw.js
   (renderer), jsPDF + svg2pdf (export), appState (scope lessicale condiviso).
   ========================================================================= */
(function () {
    'use strict';

    const t = (k, f) => (window.t ? window.t(k, f) : f);
    const L = () => window.MappAIStudioLayouts;
    const DRAW = () => window.MappAIStudioDraw;

    /* Taratura di partenza. Geometria: quella scelta da Giacomo dal vivo (1/8) —
       corridoi larghi fra i livelli, card strette e un po' più alte.
       ⚠️ 12/8: le LEVE DI RESA cambiano default. Il pannello aveva sedici
       comandi tutti accesi su valori «da banco di prova», e un docente che apre
       la vista per la prima volta si trova a decidere sedici cose prima di
       vedere una mappa leggibile. I nuovi valori sono la mappa più semplice che
       la vista sa produrre: albero, dall'alto, solo la gerarchia, niente
       linking words, niente gerarchia visiva. Da lì si aggiunge, non si toglie. */
    const DEF_PROFILE = {
        mode: 'td', orient: 'td', routing: 'curva', set: 'hier', labels: 'off',
        gapLayer: 156, gapNode: 30, w: 118, h: 54,
        fsNode: 12, fsRel: 10, hier: 'no', depth: 999,
        bands: false, centerId: null,
        hops: false, ports: true, hl: 'vicini'
    };

    /* ── UNA TARATURA PER MOTORE (16/8) ──────────────────────────────────────
       Prima la taratura era UNA sola per tutta la vista, e passando da un
       motore all'altro restavano addosso le misure del precedente. Non è un
       dettaglio: i tre motori disegnano cose di scala diversa — l'albero e il
       DAG vogliono card grandi e corridoi larghi (si leggono da vicino, una
       card è una scheda), i fasci vogliono card piccole e livelli stretti
       (si guarda la forma dell'intreccio, non il testo). Con una taratura sola
       o si sceglieva per l'uno o per l'altro, e l'altro usciva illeggibile.

       Ora ogni motore ricorda la SUA taratura (`p.perMotore`), e questi sono i
       punti di partenza scelti da Giacomo dal vivo (16/8, dagli screenshot).
       Albero e DAG sono la stessa geometria: cambia solo QUALI archi si
       disegnano — «solo gerarchia» contro «gerarchia + cross», che è esattamente
       la differenza fra i due motori. */
    const DEF_BASE = {
        orient: 'td', routing: 'curva', hier: 'no', hl: 'parenti', depth: 999,
        bands: false, hops: false, ports: true, fsRel: 9
    };
    const DEF_MOTORE = {
        // Albero: la gerarchia e basta, card da leggere
        td: { set: 'hier', labels: 'full', gapLayer: 260, gapNode: 28, w: 176, h: 120, fsNode: 22 },
        // DAG: stessa geometria, ma i cross-link entrano nel disegno
        dag: { set: 'all', labels: 'full', gapLayer: 260, gapNode: 28, w: 176, h: 120, fsNode: 22 },
        // Fasci: si guarda l'intreccio. Card minime, niente parole sugli archi
        // (in un fascio l'etichetta cadrebbe sul bundle e non si leggerebbe).
        fasci: { set: 'all', labels: 'off', gapLayer: 50, gapNode: 30, w: 80, h: 30, fsNode: 11 }
    };
    /* Le leve che appartengono al MOTORE e viaggiano con lui. Fuori restano
       `mode` (quale motore), `centerId` (vale per una mappa, non è una
       preferenza), `focus` e `defv`. */
    const LEVE_MOTORE = ['orient', 'routing', 'set', 'labels', 'hier', 'hl', 'depth',
        'gapLayer', 'gapNode', 'w', 'h', 'fsNode', 'fsRel', 'bands', 'hops', 'ports'];

    /* La taratura di partenza di un motore. I quattro motori di «Altre opzioni»
       non hanno una taratura loro: ereditano quella dell'albero, che è la più
       neutra (chi apre «Anelli» non si aspetta le card da 80px dei fasci). */
    function defaultsDi(mode) {
        return Object.assign({}, DEF_BASE, DEF_MOTORE[mode] || DEF_MOTORE.td);
    }

    /* I default nuovi devono VINCERE una volta sola anche sui profili già
       salvati: senza, chi ha aperto la vista prima d'oggi si porta dietro per
       sempre la taratura vecchia e non vede il miglioramento. Poi comanda la
       scelta dell'utente — è la stessa regola dei default del bento.
       ⚠️ Alla versione 3 si azzerano anche le tarature per-motore: erano
       state scritte con le misure vecchie, e tenerle vorrebbe dire che i
       default nuovi valgono per il motore aperto adesso e non per gli altri. */
    const DEF_VER = 3;
    // Il Focus ha una geometria SUA: poche card, grandi, molto spazio. Vive a
    // parte per non travasare la taratura della vista d'insieme (e viceversa):
    // le stesse leve regolano cose diverse nei due contesti. Persiste col
    // progetto dentro studioProfile.focus. 'auto' = verticale sotto le 15 card,
    // orizzontale sopra (il comportamento storico del Focus).
    const DEF_FOCUS = { orient: 'td', gapLayer: 96, gapNode: 30, w: 210, h: 64, fsNode: 13, fsRel: 11 };

    /* ⚠️ Le leve del FOCUS sono SOLO queste: geometria e corpi del testo. Tutto
       il resto (motore, instradamento, archi usati, linking words, gerarchia,
       evidenzia, ponticelli, bande) lo governa il profilo della vista intera —
       una leva sola per la stessa cosa, così il pannello resta lo stesso
       entrando e uscendo dal focus (richiesta di Giacomo, 12/8). La geometria
       resta separata perché le stesse misure regolano cose diverse: dieci card
       grandi qui, cento piccole là. */
    const CHIAVI_FOCUS = ['orient', 'gapLayer', 'gapNode', 'w', 'h', 'fsNode', 'fsRel'];

    /* Il profilo dell'UTENTE, non del progetto (12/8). Le leve della vista sono
       il modo in cui QUEL docente legge le mappe: ritararle a ogni mappa nuova
       è il lavoro che questo giro serve a togliere. Si scrive uscendo dalla
       vista e chiudendo l'app; si legge quando un progetto non ha ancora un
       profilo suo. Il profilo del progetto resta la fonte per quella mappa. */
    const USER_KEY = 'mappai_studio_profile';
    /* «Ci ero dentro quando ho chiuso» (12/8). Il MOTORE (albero, DAG…) sta nel
       profilo e si ritrovava già; a non tornare era il PASSO DEL CICLO — si
       riapriva l'app sul layout libero e bisognava ripremere LAYOUT quattro
       volte. Il flag dice solo «l'utente vuole la vista studio»: si accende
       entrando e si spegne SOLO uscendo col bottone LAYOUT.
       ⚠️ Le uscite di servizio (cambio mappa, ritorno alla landing) chiamano
       `exit()` senza volontarietà e NON lo spengono: quelle smontano l'overlay
       da un canvas che sta per essere ricostruito, non dicono che il docente ha
       cambiato idea. Confonderle rendeva il ricordo inutile — si perdeva a ogni
       cambio di mappa, che è il momento in cui serve di più. */
    const ATTIVO_KEY = 'mappai_studio_attivo';
    function letto() {
        try {
            const raw = localStorage.getItem(USER_KEY);
            const o = raw ? JSON.parse(raw) : null;
            return (o && typeof o === 'object') ? o : null;
        } catch (e) { return null; }
    }
    function scriviUtente() {
        try {
            const p = appState && appState.studioProfile;
            if (!p) return;
            const o = Object.assign({}, p);
            delete o.centerId;                 // vale per UNA mappa: non è una preferenza
            localStorage.setItem(USER_KEY, JSON.stringify(o));
        } catch (e) { /* best-effort */ }
    }
    // Chiudendo l'app non passa da `exit()`: l'ultimo stato si salva qui.
    try { window.addEventListener('beforeunload', scriviUtente); } catch (e) { /* noop */ }

    const S = { active: false, lastRes: null, lastNodes: null, focus: null, avanzate: false };

    function profile() {
        if (!appState.studioProfile) {
            appState.studioProfile = Object.assign({}, DEF_PROFILE, letto() || {});
        }
        const p = appState.studioProfile;
        // profili salvati da versioni precedenti: campi nuovi ai default
        Object.keys(DEF_PROFILE).forEach(k => {
            if (p[k] === undefined) p[k] = DEF_PROFILE[k];
        });
        // i default nuovi vincono una volta sola (vedi DEF_VER)
        if (p.defv !== DEF_VER) {
            p.perMotore = {};
            applicaDefault(p, p.mode);
            p.defv = DEF_VER;
        }
        if (!p.perMotore || typeof p.perMotore !== 'object') p.perMotore = {};
        return p;
    }

    /* Le leve del motore corrente, in una copia. Le leve VIVE restano piatte su
       `p` — tutto il resto del modulo (e il renderer) legge `p.gapLayer`,
       `p.w`… e non deve sapere che esiste una taratura per motore. Questa è
       solo la fotografia da riporre quando si cambia motore. */
    function leveCorrenti(p) {
        const o = {};
        LEVE_MOTORE.forEach(k => { o[k] = p[k]; });
        return o;
    }
    function applicaLeve(p, o) {
        LEVE_MOTORE.forEach(k => { if (o[k] !== undefined) p[k] = o[k]; });
    }
    function applicaDefault(p, mode) {
        applicaLeve(p, defaultsDi(mode));
    }

    /* Cambio di motore: si ripone la taratura di quello che si lascia e si
       tira fuori quella di quello che si prende — la sua, se c'è già stata
       toccata, altrimenti il default del motore.
       ⚠️ `set` va ricontrollato dopo: le scelte disponibili («solo gerarchia»
       esiste solo dove c'è una gerarchia) dipendono dalla MAPPA, non dal
       motore, e un valore che quella mappa non offre lascerebbe il segmento
       senza nessuna scelta accesa. */
    function cambiaMotore(p, nuovo) {
        if (p.mode === nuovo) return;
        p.perMotore[p.mode] = leveCorrenti(p);
        p.mode = nuovo;
        const salvato = p.perMotore[nuovo];
        if (salvato) applicaLeve(p, salvato); else applicaDefault(p, nuovo);
        const ok = currentData().choices.map(c => c.v);
        if (ok.indexOf(p.set) < 0) p.set = ok[0];
    }

    /* «Ripristina default» — la taratura di partenza del motore ATTIVO, non di
       tutti: chi la preme sta guardando una vista sola e vuole rimettere a
       posto quella. Cancella anche la copia riposta, altrimenti tornando su
       questo motore ricomparirebbe la taratura appena buttata via. */
    function ripristina() {
        const p = profile();
        applicaDefault(p, p.mode);
        delete p.perMotore[p.mode];
        const ok = currentData().choices.map(c => c.v);
        if (ok.indexOf(p.set) < 0) p.set = ok[0];
        if (S.focus) { p.focus = Object.assign({}, DEF_FOCUS); }
        render();
        if (S.focus) openFocus(S.focus.id, S.focus.mode);
        buildControls();
        persist(); scriviUtente();
        if (window.showToast) {
            window.showToast(t('sv_reset_ok', 'Opzioni riportate ai valori di partenza.'), 'success');
        }
    }
    function fprofile() {
        const p = profile();
        if (!p.focus || typeof p.focus !== 'object') p.focus = Object.assign({}, DEF_FOCUS);
        Object.keys(DEF_FOCUS).forEach(k => {
            if (p.focus[k] === undefined) p.focus[k] = DEF_FOCUS[k];
        });
        return p.focus;
    }
    // Quale profilo governa QUESTA leva adesso: col focus aperto la geometria
    // va sul profilo del focus, tutto il resto resta della vista intera.
    function profiloDi(k) {
        return (S.focus && CHIAVI_FOCUS.indexOf(k) >= 0) ? fprofile() : profile();
    }
    function persist() {
        // StorageManager e' una const lessicale, NON e' su window: la guardia
        // giusta e' typeof (review 1/8 — regola nota: mai window.StorageManager)
        try { if (typeof StorageManager !== 'undefined') StorageManager.saveCurrentProject(); } catch (e) { /* best-effort */ }
    }

    /* ── dati dal db, normalizzati (i link possono avere source a oggetto) ── */
    function dataset() {
        const nodes = (appState.db.nodes || []).map(n => ({
            id: n.id, label: n.label || n.id, group: n.group, level: n.level,
            desc: String(n.desc || n.content || '').slice(0, 260)
        }));
        const links = (appState.db.links || []).map(l => ({
            source: (typeof l.source === 'object' && l.source) ? l.source.id : l.source,
            target: (typeof l.target === 'object' && l.target) ? l.target.id : l.target,
            rel: l.rel || '', isCross: !!l.isCross
        }));
        return { nodes, links };
    }

    // quali insiemi di archi hanno senso per QUESTA mappa (come nel banco)
    function edgeSetChoices(d) {
        const hasComm = d.nodes.some(n => /^COMM_/.test(n.id));
        const hasCross = d.links.some(l => l.isCross);
        if (hasComm) return [
            { v: 'sem', label: t('sv_set_sem', 'Solo relazioni') },
            { v: 'all', label: t('sv_set_comm', '+ comunità') }];
        if (hasCross) return [
            { v: 'all', label: t('sv_set_all', 'Gerarchia + cross') },
            { v: 'hier', label: t('sv_set_hier', 'Solo gerarchia') }];
        return [{ v: 'all', label: t('sv_set_tutti', 'Tutti gli archi') }];
    }
    function sliceSet(d, set) {
        if (set === 'hier') return { nodes: d.nodes, links: d.links.filter(l => !l.isCross) };
        if (set === 'sem') return {
            nodes: d.nodes.filter(n => !/^COMM_/.test(n.id)),
            links: d.links.filter(l => l.isCross)
        };
        return d;
    }

    function currentData() {
        const p = profile();
        const d0 = dataset();
        const choices = edgeSetChoices(d0);
        if (!choices.some(c => c.v === p.set)) p.set = choices[0].v;
        let d = sliceSet(d0, p.set);
        // profondità: taglia il sottografo e il layout si ricalcola su quello
        const dep = L().depths(d.nodes, d.links);
        let maxD = 0; dep.forEach(v => { if (v > maxD) maxD = v; });
        if (p.depth < maxD) {
            const keep = new Set(d.nodes.filter(n => (dep.get(n.id) || 0) <= p.depth).map(n => n.id));
            d = { nodes: d.nodes.filter(n => keep.has(n.id)),
                  links: d.links.filter(l => keep.has(l.source) && keep.has(l.target)) };
        }
        return { d, maxD, choices };
    }

    function compute(d, p) {
        const opt = {
            mode: p.mode, orient: p.orient, routing: p.routing,
            gapLayer: +p.gapLayer, gapNode: +p.gapNode, w: +p.w, h: +p.h,
            subRows: '1', ports: p.ports !== false, centerId: p.centerId || undefined
        };
        const res = L().run(d.nodes, d.links, window.d3, opt);
        const m = L().measure(res, res.kind === 'td');
        // ponticelli: hanno senso dove gli archi corrono in corridoi
        if (p.hops !== false && ['dag', 'td', 'colonne'].indexOf(res.kind) >= 0) {
            L().addHops(res, { r: Math.max(8, Math.min(14, Math.round(opt.gapNode / 2.2))) });
        }
        return { res, m };
    }

    /* ── overlay sul canvas ─────────────────────────────────────────────── */
    function ensureOverlay() {
        let ov = document.getElementById('studio-overlay');
        if (ov) return ov;
        const host = document.getElementById('d3-container');
        if (!host) return null;
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        ov = document.createElement('div');
        ov.id = 'studio-overlay';
        ov.style.cssText = 'position:absolute;inset:0;z-index:5;background:#fafbff;' +
            'background-image:radial-gradient(#e2e8f0 1px,transparent 1px);background-size:22px 22px;';
        ov.innerHTML = '<svg id="studio-svg" style="width:100%;height:100%;display:block;cursor:grab"></svg>';
        host.appendChild(ov);
        return ov;
    }

    // Se il contenitore cambia taglia (finestra, sidebar trascinata) il
    // disegno resta con l'inquadratura vecchia — e se al momento del montaggio
    // l'area era ancora a zero restava microscopico. Un solo osservatore per
    // sessione, con un filo di ritardo per non rincorrere il trascinamento.
    function watchResize() {
        const host = document.getElementById('d3-container');
        if (!host || host._svResizeObs || typeof ResizeObserver === 'undefined') return;
        let t = null;
        host._svResizeObs = new ResizeObserver(() => {
            clearTimeout(t);
            t = setTimeout(() => {
                if (!S.active) return;
                if (S.focus && S.focus.handle) S.focus.handle.fit('all');
                else if (S.handle) S.handle.fit('read');
            }, 120);
        });
        host._svResizeObs.observe(host);
    }

    function render() {
        if (!S.active) return;
        const p = profile();
        const { d, maxD } = currentData();
        if (!d.nodes.length) return;
        const { res, m } = compute(d, p);
        S.lastRes = res; S.lastNodes = d.nodes;
        const handle = DRAW().draw(document.getElementById('studio-svg'), res, d.nodes, {
            d3: window.d3, prefix: 'stv',
            custom: (appState.db && appState.db.customColors) || {},
            fsNode: +p.fsNode, fsRel: +p.fsRel,
            labels: p.labels, hier: p.hier, bands: p.bands, hover: p.hl,
            onNodeContext: openNodeMenu
        });
        handle.fit('read');
        S.handle = handle;
        updateMetricsRow(res, m, d, maxD);
    }

    function updateMetricsRow(res, m, d, maxD) {
        const el = document.getElementById('sv-metrics');
        if (!el) return;
        const parts = [d.nodes.length + ' ' + t('sv_nodi', 'nodi'), d.links.length + ' ' + t('sv_archi', 'archi')];
        if (res.kind !== 'matrice') parts.push(m.incroci + ' ' + t('sv_incroci', 'incroci'));
        if (res.ponticelli) parts.push(res.ponticelli + ' ' + t('sv_ponti', 'ponticelli'));
        if (res.stats && res.stats.archiInvertiti) parts.push(res.stats.archiInvertiti + ' ' + t('sv_inv', 'invertiti'));
        // quante linking words non hanno trovato un posto pulito: se il numero
        // è alto la mappa è troppo fitta per quella taglia di card/spazi
        const lc = S.handle && S.handle.stats ? S.handle.stats.labelConflitti : 0;
        if (lc) parts.push(lc + ' ' + t('sv_lbl_conflitti', 'etichette accavallate'));
        el.textContent = parts.join(' · ');
        const ds = document.getElementById('sv-depth');
        if (ds) {
            ds.max = Math.max(1, maxD);
            if (+ds.value > maxD) ds.value = maxD;
            const out = document.getElementById('sv-depth-out');
            if (out) out.textContent = (+ds.value >= maxD) ? t('sv_tutti', 'tutti') : ('0–' + ds.value);
        }
    }

    /* ── comandi della sidebar ──────────────────────────────────────────── */
    /* I motori si dividono in due: quelli che disegnano la mappa COME ci si
       aspetta di vederla (albero, DAG, fasci) restano a vista; gli altri
       quattro sono letture oblique — utili, ma non nella prima schermata di chi
       apre la vista per la prima volta. Stessa chiave `mode` per entrambi i
       gruppi: è una scelta sola, spezzata in due posti. */
    /* «Mappa» non è un motore: è l'USCITA dalla vista studio, cioè il passo
       `default` del ciclo — la mappa libera, col force layout. Sta qui, primo
       fra le scelte del motore, perché da dentro la vista è una delle forme
       fra cui si sceglie, e cercarla altrove (il bottone LAYOUT premuto tre
       volte) non è quello che uno si aspetta.
       Porta un valore RISERVATO, non un `mode`: se finisse nel profilo, alla
       riapertura la vista proverebbe a disegnare con un motore inesistente. */
    const USCITA = '__mappa';
    const MOTORI = [[USCITA, 'Mappa'], ['td', 'Albero'], ['dag', 'DAG'], ['fasci', 'Fasci']];
    const MOTORI_ALT = [['anelli', 'Anelli'], ['colonne', 'Colonne'], ['percorso', 'Percorso'], ['matrice', 'Matrice']];
    /* Il nome del motore in chiaro: lo usano il bottone «Ripristina default» e
       l'etichetta del bottone LAYOUT. Una fonte sola — i due posti dicono lo
       stesso nome per costruzione. */
    function nomeMotore(m) {
        const v = MOTORI.concat(MOTORI_ALT).find(o => o[0] === m);
        return v ? v[1] : String(m || '');
    }
    function seg(k, opts, cur) {
        return '<div class="flex flex-wrap gap-1" data-sv-seg="' + k + '">' + opts.map(o =>
            '<button type="button" data-v="' + o[0] + '" class="px-2 py-1.5 rounded-lg text-[11px] font-bold border ' +
            (String(cur) === String(o[0]) ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50') + '">' + o[1] + '</button>'
        ).join('') + '</div>';
    }
    function fld(label, inner) {
        return '<div class="mb-3"><div class="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">' +
            label + '</div>' + inner + '</div>';
    }
    function slider(k, min, max, step, val, suff) {
        return '<div class="flex items-center gap-2">' +
            '<input type="range" data-sv-sl="' + k + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" class="flex-1 accent-indigo-600">' +
            '<b class="text-[11px] tabular-nums w-11 text-right" data-sv-out="' + k + '">' + val + (suff || 'px') + '</b></div>';
    }
    function chk(k, label, on, mb) {
        return '<label class="flex items-center gap-2 text-[11px] font-bold text-slate-500 ' + (mb || 'mb-1.5') + ' cursor-pointer">' +
            '<input type="checkbox" data-sv-chk="' + k + '" ' + (on ? 'checked' : '') + ' class="accent-indigo-600">' +
            label + '</label>';
    }

    /* IL PANNELLO È UNO SOLO (12/8). Prima ce n'erano due — la vista intera e
       una versione ridotta per il Focus — e le leve sparivano proprio quando si
       guarda un pezzo di mappa da vicino, cioè quando servono. Uguale dentro e
       fuori: cambia solo la testata (dentro il focus dice su quale nodo si è, e
       come uscirne) e a quale profilo va ogni leva (`profiloDi`). */
    function buildControls() {
        const panel = document.getElementById('sidebar-panel-vista');
        if (!panel) return;
        const p = profile();
        const g = S.focus ? fprofile() : p;                 // geometria e corpi
        const { maxD, choices } = currentData();
        const f = S.focus;
        panel.innerHTML =
            (f ? testataFocus(f) :
                '<div class="text-sm font-bold text-slate-600 mb-3 flex items-center gap-2">' +
                '<i data-lucide="layout-panel-top" class="w-4 h-4 text-indigo-400"></i>' +
                t('sv_title', 'Vista studio') + '</div>') +
            fld(t('sv_motore', 'Motore'), seg('mode', MOTORI, p.mode)) +
            fld(t('sv_orient', 'Orientamento'), seg('orient', [['td', t('sv_alto', "dall'alto ↓")], ['lr', t('sv_sinistra', 'da sinistra →')]], g.orient)) +
            fld(t('sv_archi_usati', 'Archi usati'), seg('set', choices.map(c => [c.v, c.label]), p.set)) +
            fld(t('sv_labels', 'Linking words'), seg('labels', [['off', t('sv_no', 'no')], ['short', t('sv_brevi', 'brevi')], ['full', t('sv_intere', 'intere')]], p.labels)) +
            fld(t('sv_hier', 'Gerarchia visiva'), seg('hier', [['no', t('sv_no', 'no')], ['foglie', t('sv_foglie', 'foglie')], ['livello', t('sv_livello', 'livello')], ['taglia', t('sv_taglia', '+ taglia')]], p.hier)) +
            fld(t('sv_hl', 'Evidenzia al passaggio'), seg('hl', [['no', t('sv_hl_no', 'niente')], ['vicini', t('sv_vicini', 'vicini')], ['parenti', t('sv_parenti', 'parentela')]], p.hl)) +
            fld(t('sv_depth', 'Mostra fino al livello'),
                '<div class="flex items-center gap-2">' +
                '<input type="range" id="sv-depth" data-sv-sl="depth" min="0" max="' + Math.max(1, maxD) + '" step="1" value="' + Math.min(p.depth, maxD) + '" class="flex-1 accent-indigo-600">' +
                '<b class="text-[11px] tabular-nums w-11 text-right" id="sv-depth-out">' + ((p.depth >= maxD) ? t('sv_tutti', 'tutti') : ('0–' + p.depth)) + '</b></div>') +
            fld(t('sv_gap_layer', 'Spazio fra livelli'), slider('gapLayer', 20, 260, 2, g.gapLayer)) +
            fld(t('sv_gap_node', 'Spazio fra card'), slider('gapNode', 6, 110, 2, g.gapNode)) +
            fld(t('sv_card_w', 'Larghezza card'), slider('w', 80, 320, 2, g.w)) +
            fld(t('sv_card_h', 'Altezza card'), slider('h', 30, 120, 2, g.h)) +
            fld(t('sv_fs_node', 'Testo dei nodi'), slider('fsNode', 8, 22, 1, g.fsNode)) +
            fld(t('sv_fs_rel', 'Testo linking words'), slider('fsRel', 7, 18, 1, g.fsRel)) +
            chk('ports', t('sv_ports', 'Frecce separate sul nodo'), p.ports !== false, 'mb-1.5') +
            chk('bands', t('sv_bands', 'Bande delle macro-aree'), !!p.bands, 'mb-3') +
            '<div id="sv-metrics" class="text-[11px] text-slate-400 font-bold mb-3"></div>' +
            '<button type="button" id="sv-pdf" class="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 flex items-center justify-center gap-2">' +
            '<i data-lucide="file-down" class="w-4 h-4"></i>' +
            (f ? t('sv_pdf_focus', 'Esporta PDF del Focus') : t('sv_pdf', 'Esporta PDF (A4)')) + '</button>' +
            (f ? '<button type="button" id="sv-focus-exit" class="w-full mt-2 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 text-xs font-bold hover:bg-slate-50 flex items-center justify-center gap-2">' +
                '<i data-lucide="corner-up-left" class="w-4 h-4"></i>' + t('sv_focus_exit', 'Chiudi il focus') + '</button>' : '') +
            /* Dice SEMPRE di quale vista parla: «ripristina» da solo, in un
               pannello dove ogni motore ha la sua taratura, non direbbe che
               cosa sta per tornare indietro (e quanto). */
            '<button type="button" id="sv-reset" class="w-full mt-2 py-2 rounded-xl bg-white border border-slate-200 text-slate-500 text-[11px] font-bold hover:bg-slate-50 hover:text-indigo-600 flex items-center justify-center gap-2">' +
            '<i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>' +
            t('sv_reset', 'Ripristina default') + ' · ' + nomeMotore(p.mode) + '</button>' +
            avanzate(p) +
            '<div class="text-[10px] text-slate-400 mt-2">' +
            t('sv_hint', 'Tasto destro su una card: Descrizione, Focus sui vicini o sulla parentela.') + '</div>';
        if (window.safeCreateIcons) window.safeCreateIcons();
        bindControls(panel);
    }

    function testataFocus(f) {
        const label = String((f.centro && f.centro.label) || f.id);
        return '<div class="text-sm font-bold text-slate-600 mb-1 flex items-center gap-2">' +
            '<i data-lucide="scan-search" class="w-4 h-4 text-indigo-400"></i>' +
            t('sv_focus_on', 'Focus attivo') + '</div>' +
            '<div class="text-[12px] font-bold text-slate-700 leading-snug mb-2 break-words">' + esc(label) + '</div>' +
            '<div class="flex gap-1.5 mb-3">' +
            [['vicini', t('sv_vicini', 'vicini')], ['parenti', t('sv_parenti', 'parentela')]].map(o =>
                '<button type="button" data-sv-fmode="' + o[0] + '" class="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold border ' +
                (f.mode === o[0] ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50') + '">' + o[1] + '</button>').join('') +
            '</div>';
    }

    /* Quello che un docente non deve incontrare per usare la vista: quattro
       motori di lettura obliqua, l'instradamento degli archi e i ponticelli.
       Non spariscono — chi li cerca li trova, aperti restano aperti (S.avanzate)
       finché non si chiude la vista. */
    function avanzate(p) {
        return '<div class="mt-3 border-t border-slate-100 pt-2">' +
            '<button type="button" id="sv-adv-t" aria-expanded="' + (S.avanzate ? 'true' : 'false') +
            '" class="w-full flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400 hover:text-indigo-500 py-1">' +
            '<i data-lucide="chevron-' + (S.avanzate ? 'down' : 'right') + '" class="w-3.5 h-3.5"></i>' +
            t('sv_avanzate', 'Altre opzioni') + '</button>' +
            (S.avanzate
                ? '<div class="pt-2">' +
                    fld(t('sv_motore_alt', 'Altri motori'), seg('mode', MOTORI_ALT, p.mode)) +
                    fld(t('sv_routing', 'Instradamento archi'), seg('routing', [['curva', t('sv_curva', 'curva')], ['dritto', t('sv_dritto', 'dritto')], ['orto', t('sv_orto', 'ortogonale')]], p.routing)) +
                    chk('hops', t('sv_hops', 'Ponticelli agli incroci'), p.hops !== false, 'mb-1') +
                  '</div>'
                : '') +
            '</div>';
    }

    /* Che cosa va ridisegnato dopo aver mosso la leva `k`.
       ⚠️ `set` e `depth` non sono leve di resa: cambiano QUALI nodi esistono,
       cioè l'insieme da cui il focus è stato ritagliato. Ridisegnare il focus
       com'è lo lascerebbe pieno di card che nella vista non ci sono più — va
       ritagliato di nuovo dallo stesso nodo. */
    function ridisegna(k) {
        if (S.focus) {
            if (k === 'set' || k === 'depth') { render(); openFocus(S.focus.id, S.focus.mode); return; }
            renderFocus();
            return;
        }
        render();
    }

    function bindControls(panel) {
        if (panel._svBound) return;
        panel._svBound = true;
        panel.addEventListener('click', ev => {
            if (ev.target.closest('#sv-pdf')) { exportViewPdf(); return; }
            if (ev.target.closest('#sv-focus-exit')) { closeFocus(); return; }
            const fm = ev.target.closest('[data-sv-fmode]');
            if (fm && S.focus) { openFocus(S.focus.id, fm.getAttribute('data-sv-fmode')); return; }
            if (ev.target.closest('#sv-adv-t')) {
                S.avanzate = !S.avanzate;
                buildControls();
                return;
            }
            if (ev.target.closest('#sv-reset')) { ripristina(); return; }
            const b = ev.target.closest('[data-sv-seg] button');
            if (b) {
                const k = b.closest('[data-sv-seg]').getAttribute('data-sv-seg');
                /* Il motore non è una leva come le altre: cambiandolo si ripone
                   la taratura di quello che si lascia e si tira fuori la sua. */
                if (k === 'mode') {
                    const v = b.getAttribute('data-v');
                    if (v === USCITA) { tornaAllaMappa(); return; }
                    cambiaMotore(profile(), v);
                    if (profile().mode !== 'anelli') profile().centerId = null;
                } else {
                    profiloDi(k)[k] = b.getAttribute('data-v');
                }
                persist(); buildControls(); ridisegna(k);
                return;
            }
        });
        panel.addEventListener('input', ev => {
            const sl = ev.target.closest('[data-sv-sl]');
            if (!sl) return;
            const k = sl.getAttribute('data-sv-sl');
            profiloDi(k)[k] = +sl.value;
            const out = panel.querySelector('[data-sv-out="' + k + '"]');
            if (out) out.textContent = sl.value + 'px';
            persist(); ridisegna(k);
        });
        panel.addEventListener('change', ev => {
            const c = ev.target.closest('[data-sv-chk]');
            if (!c) return;
            const k = c.getAttribute('data-sv-chk');
            profiloDi(k)[k] = c.checked;
            persist(); ridisegna(k);
        });
    }

    /* ── menu contestuale sulle card ────────────────────────────────────── */
    function closeMenu() {
        const m = document.getElementById('sv-ctxmenu');
        if (m) m.remove();
    }
    function openNodeMenu(ev, node) {
        closeMenu();
        const m = document.createElement('div');
        m.id = 'sv-ctxmenu';
        m.style.cssText = 'position:fixed;z-index:10000;background:#fff;border:1px solid #cbd5e1;' +
            'border-radius:11px;box-shadow:0 10px 30px rgba(15,23,42,.16);padding:5px;min-width:220px;' +
            "font-family:'Space Mono',monospace";
        const label = (node.label || node.id);
        // La descrizione è la PRIMA voce: è quello che si cerca più spesso su
        // una card, e da qui è raggiungibile sia sulla mappa intera sia dentro
        // una focus-map (prima viveva solo nel tooltip del browser).
        const voci = [
            [t('sv_desc_cmd', 'Descrizione'), () => openDescModal(node.id)],
            [t('sv_focus_vicini', 'Focus: vicini diretti'), () => openFocus(node.id, 'vicini')],
            [t('sv_focus_parenti', 'Focus: parentela'), () => openFocus(node.id, 'parenti')]
        ];
        // «Anelli da qui» cambia il motore della vista d'insieme: nel Focus non
        // ha un bersaglio visibile, quindi lì non compare.
        if (!S.focus) voci.push([t('sv_anelli_qui', 'Anelli da qui'), () => {
            profile().mode = 'anelli'; profile().centerId = node.id;
            persist(); buildControls(); render();
        }]);
        voci.push([t('sv_copia', 'Copia etichetta'), () => {
            if (navigator.clipboard) navigator.clipboard.writeText(label);
        }]);
        m.innerHTML = '<div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:#64748b;' +
            'font-weight:700;padding:7px 11px 4px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
            esc(label) + '</div>' +
            voci.map((v, i) => '<button type="button" data-i="' + i + '" style="display:block;width:100%;text-align:left;' +
                'font:inherit;font-size:12.5px;font-weight:700;border:0;background:none;color:#334155;' +
                'padding:8px 11px;border-radius:8px;cursor:pointer">' + v[0] + '</button>').join('');
        document.body.appendChild(m);
        const r = m.getBoundingClientRect();
        m.style.left = Math.min(ev.clientX, innerWidth - r.width - 8) + 'px';
        m.style.top = Math.min(ev.clientY, innerHeight - r.height - 8) + 'px';
        m.addEventListener('click', e => {
            const b = e.target.closest('button[data-i]');
            if (b) { const run = voci[+b.getAttribute('data-i')][1]; closeMenu(); run(); }
        });
        setTimeout(() => {
            document.addEventListener('click', function once(e) {
                if (!e.target.closest('#sv-ctxmenu')) { closeMenu(); document.removeEventListener('click', once); }
            });
        }, 0);
    }

    /* ── focus-map ───────────────────────────────────────────────────────
       Non è più una finestrella al centro dello schermo: occupa TUTTA l'area
       della mappa (overlay dentro #d3-container, sopra la vista d'insieme che
       resta intatta sotto). I comandi stanno nel tab, come per la vista. */
    function closeFocus() {
        const ov = document.getElementById('sv-focus-ov');
        if (ov) ov.remove();
        S.focus = null;
        if (S.active) buildControls();
    }
    function openFocus(id, mode) {
        const wasOpen = !!S.focus;
        closeFocus();
        const { d } = currentData();
        const byId = new Map(d.nodes.map(n => [n.id, n]));
        const succ = new Map(), pred = new Map();
        d.nodes.forEach(n => { succ.set(n.id, []); pred.set(n.id, []); });
        d.links.forEach(l => {
            if (succ.has(l.source)) succ.get(l.source).push(l.target);
            if (pred.has(l.target)) pred.get(l.target).push(l.source);
        });
        const reach = (from, map) => {
            const o = new Set(), q = [from];
            while (q.length) {
                const u = q.pop();
                (map.get(u) || []).forEach(v => { if (!o.has(v)) { o.add(v); q.push(v); } });
            }
            return o;
        };
        const keep = mode === 'vicini'
            ? new Set([id].concat(succ.get(id) || [], pred.get(id) || []))
            : new Set([id].concat([...reach(id, succ)], [...reach(id, pred)]));
        const nodes = d.nodes.filter(n => keep.has(n.id));
        const links = d.links.filter(l => keep.has(l.source) && keep.has(l.target));
        if (!nodes.length) {   // id fuori dal sottografo mostrato: niente overlay vuoto
            if (window.showToast) window.showToast(t('sv_focus_vuoto', 'Nodo non presente nella vista corrente.'), 'error');
            return;
        }
        const centro = byId.get(id) || { id };

        const ov = document.createElement('div');
        ov.id = 'sv-focus-ov';
        const host = document.getElementById('d3-container');
        if (host) {
            if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
            // sopra l'overlay della vista d'insieme (z-index 5), che resta sotto
            // intatto: chiudendo il focus si ritrova senza ricalcolare nulla.
            ov.style.cssText = 'position:absolute;inset:0;z-index:6;background:#ffffff;' +
                'background-image:radial-gradient(#eef2f7 1px,transparent 1px);background-size:22px 22px;' +
                "display:flex;flex-direction:column;font-family:'Space Mono',monospace";
        } else {
            ov.style.cssText = 'position:fixed;inset:0;z-index:9500;background:#ffffff;' +
                "display:flex;flex-direction:column;font-family:'Space Mono',monospace";
        }
        ov.innerHTML =
            // una riga sola, mai a capo: se la testata crescesse si mangerebbe
            // l'altezza del disegno (flex:1 → 0 in un contenitore basso)
            '<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;' +
            'border-bottom:1px solid #e2e8f0;background:rgba(255,255,255,.94);' +
            'flex-wrap:nowrap;flex:0 0 auto;overflow:hidden">' +
            '<span style="display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:700;' +
            'text-transform:uppercase;letter-spacing:.06em;color:#4f46e5;background:#eef2ff;' +
            'padding:3px 8px;border-radius:999px;flex:0 0 auto">FOCUS</span>' +
            '<b style="font-size:14px;color:#0f172a;white-space:nowrap;overflow:hidden;' +
            'text-overflow:ellipsis;flex:0 1 auto">' + esc(centro.label || id) + '</b>' +
            '<span id="sv-focus-sub" style="font-size:11px;color:#64748b;font-weight:700;' +
            'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto"></span>' +
            '<button type="button" id="sv-f-close" style="margin-left:auto;flex:0 0 auto;font:inherit;font-size:11px;' +
            'font-weight:700;color:#475569;background:#fff;border:1px solid #e2e8f0;border-radius:9px;' +
            'padding:6px 11px;cursor:pointer">' + t('sv_focus_exit', 'Chiudi il focus') + '</button>' +
            '</div>' +
            '<svg id="sv-focus-svg" style="flex:1;min-height:0;width:100%;display:block;cursor:grab"></svg>';
        (host || document.body).appendChild(ov);

        S.focus = { id, mode, nodes, links, centro, res: null, handle: null };
        // prima il pannello ridotto, poi il disegno: renderFocus scrive le
        // misure in #sv-metrics, che deve già essere quello del pannello Focus
        buildControls();
        renderFocus();
        if (window.switchSidebarTab && S.active) window.switchSidebarTab('vista');
        document.getElementById('sv-f-close').onclick = closeFocus;
        if (!wasOpen && nodes.length <= 1 && window.showToast) {
            window.showToast(t('sv_focus_solo', 'Questo nodo non ha relazioni nell\'insieme di archi selezionato.'), 'info');
        }
    }

    // Ridisegna la focus-map col profilo Focus corrente (le leve del tab).
    function renderFocus() {
        if (!S.focus) return;
        const svgEl = document.getElementById('sv-focus-svg');
        if (!svgEl) return;
        /* ⚠️ 12/8 — Motore, instradamento, linking words, gerarchia visiva,
           frecce e bande erano SCRITTI QUI: il focus disegnava sempre allo
           stesso modo, qualunque cosa dicesse il pannello. Con la sidebar unica
           sarebbe stato peggio di prima — leve a vista che non fanno niente.
           Ora la resa la governa il profilo della vista, la geometria quello
           del focus (`fp`). */
        const p = profile();
        const fp = fprofile();
        const { nodes, links, id } = S.focus;
        const orient = (fp.orient === 'td' || fp.orient === 'lr')
            ? fp.orient : (nodes.length > 14 ? 'lr' : 'td');
        const opt = { mode: p.mode, orient, routing: p.routing, ports: p.ports !== false, subRows: '1',
                      w: +fp.w, h: +fp.h, gapNode: +fp.gapNode, gapLayer: +fp.gapLayer,
                      // «Anelli» chiede un centro, e qui il centro è il nodo del focus
                      centerId: (p.mode === 'anelli') ? id : undefined };
        const res = L().run(nodes, links, window.d3, opt);
        const m = L().measure(res, res.kind === 'td');
        if (p.hops !== false && ['dag', 'td', 'colonne'].indexOf(res.kind) >= 0) {
            L().addHops(res, { r: Math.max(8, Math.min(14, Math.round((+fp.gapNode) / 2.2))) });
        }
        const handle = DRAW().draw(svgEl, res, nodes, {
            d3: window.d3, prefix: 'svf',
            custom: (appState.db && appState.db.customColors) || {},
            fsNode: +fp.fsNode, fsRel: +fp.fsRel,
            labels: p.labels, hier: p.hier, bands: p.bands, hover: p.hl, evidenzia: id,
            onNodeContext: openNodeMenu
        });
        handle.fit('all');
        S.focus.res = res; S.focus.handle = handle;

        const sub = document.getElementById('sv-focus-sub');
        if (sub) sub.textContent =
            (S.focus.mode === 'vicini' ? t('sv_focus_sub_v', 'vicini diretti') : t('sv_focus_sub_p', 'parentela completa')) +
            ' · ' + nodes.length + ' ' + t('sv_nodi', 'nodi') + ' · ' + links.length + ' ' + t('sv_rel', 'relazioni');
        const el = document.getElementById('sv-metrics');
        if (el) {
            const parti = [nodes.length + ' ' + t('sv_nodi', 'nodi'),
                           links.length + ' ' + t('sv_rel', 'relazioni'),
                           m.incroci + ' ' + t('sv_incroci', 'incroci'),
                           m.larghezza + '×' + m.altezza + 'px'];
            const lc = handle.stats ? handle.stats.labelConflitti : 0;
            if (lc) parti.push(lc + ' ' + t('sv_lbl_conflitti', 'etichette accavallate'));
            el.textContent = parti.join(' · ');
        }
    }

    /* ── scheda «Descrizione» del nodo ───────────────────────────────────
       Legge il nodo VERO da appState.db (dataset() tronca la desc a 260
       caratteri per il disegno: qui serve il testo intero). */
    function closeDescModal() {
        const m = document.getElementById('sv-desc-modal');
        if (m) { m.remove(); return true; }
        return false;
    }
    function openDescModal(id) {
        const n = (appState.db.nodes || []).find(x => x.id === id);
        if (!n) return;
        closeDescModal();
        // La scheda del nodo è QUELLA della mappa D3 («Scheda Focus»:
        // intestazione colorata per livello, parentela, fonti e note, strumenti
        // di lettura). Una seconda scheda solo per la vista studio avrebbe fatto
        // divergere due superfici che dicono la stessa cosa.
        if (typeof window.openSourceModal === 'function') { window.openSourceModal(id); return; }
        // Ripiego (harness/banco, dove il canvas dell'app non esiste).
        const desc = String(n.desc || n.content || '').trim();
        const col = DRAW().colorOf(n, (appState.db && appState.db.customColors) || {});
        const mo = document.createElement('div');
        mo.id = 'sv-desc-modal';
        // posizionamento TUTTO inline: il velo non deve dipendere da Tailwind
        // (le classi .pm-* dentro il riquadro sì, quelle sono dell'app)
        mo.style.cssText = 'position:fixed;inset:0;z-index:9600;display:flex;align-items:center;' +
            'justify-content:center;padding:24px;background:rgba(15,23,42,.45);backdrop-filter:blur(2px);' +
            "font-family:'Space Mono',monospace";
        mo.innerHTML =
            '<div style="background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(15,23,42,.3);' +
            'width:min(720px,94vw);max-height:86vh;display:flex;flex-direction:column;overflow:hidden">' +
            '<div style="display:flex;align-items:flex-start;gap:12px;padding:20px 22px 14px">' +
            '<div class="pm-icon-wrap" style="background:' + DRAW().tint(col, 0.14) + '">' +
            '<i data-lucide="file-text" class="w-5 h-5" style="color:' + col + '"></i></div>' +
            '<div style="min-width:0;flex:1">' +
            '<div class="pm-title" style="word-break:break-word">' + esc(n.label || n.id) + '</div>' +
            '<div class="pm-subtitle">' + (n.level != null ? t('sv_lv', 'Livello') + ' ' + n.level : t('sv_nodo', 'nodo')) + '</div>' +
            '</div>' +
            '<button type="button" id="sv-desc-x" style="font:inherit;border:0;background:none;cursor:pointer;' +
            'color:#94a3b8;padding:2px"><i data-lucide="x" class="w-5 h-5"></i></button>' +
            '</div>' +
            '<div style="padding:0 22px 6px;overflow:auto;flex:1">' +
            (desc
                ? '<div style="font-size:16px;line-height:1.75;color:#334155;white-space:pre-wrap;' +
                  'hyphens:auto;-webkit-hyphens:auto">' + esc(desc) + '</div>'
                : '<div class="pm-body-text">' + t('sv_desc_none', 'Questo nodo non ha ancora una descrizione.') + '</div>') +
            '</div>' +
            '<div style="padding:14px 22px 18px;display:flex;justify-content:flex-end">' +
            '<button type="button" id="sv-desc-ok" style="font:inherit;font-size:12px;font-weight:700;' +
            'background:#4f46e5;color:#fff;border:0;border-radius:11px;padding:10px 20px;cursor:pointer">' +
            t('sv_chiudi', 'Chiudi') + '</button></div></div>';
        document.body.appendChild(mo);
        if (window.safeCreateIcons) window.safeCreateIcons();
        // formule: stessa regola delle altre superfici di studio (§9)
        if (window.renderLatexInElement) {
            try { window.renderLatexInElement(mo); } catch (e) { /* testo semplice */ }
        }
        mo.addEventListener('mousedown', e => { if (e.target === mo) closeDescModal(); });
        mo.querySelector('#sv-desc-x').onclick = closeDescModal;
        mo.querySelector('#sv-desc-ok').onclick = closeDescModal;
    }

    // ESC a strati: prima il menu, poi la scheda del nodo, poi il focus.
    // La Scheda Focus dell'app la chiude closeActiveModals (app.js): qui si
    // esce e basta, altrimenti lo stesso ESC chiuderebbe ANCHE la focus-map.
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (document.getElementById('sv-ctxmenu')) { closeMenu(); return; }
        const sm = document.getElementById('source-modal');
        if (sm && !sm.classList.contains('hidden')) return;
        if (closeDescModal()) return;
        closeFocus();
    });

    /* ── export PDF (A4 orizzontale, vettoriale) ────────────────────────── */
    function safeName(s) { return String(s).replace(/[^\wÀ-ɏ -]+/g, '').trim().slice(0, 60) || 'mappa'; }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function exportPdfFromSvg(svgEl, bbox, fileName) {
        try {
            const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
            if (!jsPDFCtor || !jsPDFCtor.API || !jsPDFCtor.API.svg) {
                if (window.showToast) window.showToast(t('sv_pdf_missing', 'Librerie PDF non disponibili'), 'error');
                return;
            }
            const pad = 40;
            const w = (bbox.maxX - bbox.minX) + pad * 2, h = (bbox.maxY - bbox.minY) + pad * 2;
            const clone = svgEl.cloneNode(true);
            clone.removeAttribute('style');
            clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            clone.setAttribute('viewBox', (bbox.minX - pad) + ' ' + (bbox.minY - pad) + ' ' + w + ' ' + h);
            clone.setAttribute('width', w); clone.setAttribute('height', h);
            const inner = clone.querySelector('g');
            if (inner) inner.removeAttribute('transform');       // via lo zoom: si esporta il disegno intero

            // A4 orizzontale con margini, disegno scalato per starci
            const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            // Space Mono è vendorizzato (public/js/vendor/spacemono-font.js) e va
            // registrato NELL'ISTANZA: senza, svg2pdf ripiega su un font standard
            // e con le metriche sbagliate le etichette escono scentrate.
            // La chiave del font-family deve essere ESATTA ("Space Mono" nudo,
            // niente apici, niente fallback) o svg2pdf non la trova.
            let fontName = 'Helvetica';
            try {
                if (window.MappAISpaceMono && window.MappAISpaceMono.registerInto(doc)) {
                    fontName = window.MappAISpaceMono.fontName;
                }
            } catch (e) { console.warn('[StudioView] Space Mono non registrato:', e); }

            // svg2pdf non onora `paint-order: stroke fill`: l'alone bianco delle
            // linking words finirebbe SOPRA il testo. Come nell'export della
            // mappa: copia-alone bianca DIETRO, testo davanti senza stroke.
            clone.querySelectorAll('text[paint-order]').forEach(tx => {
                const sw = tx.getAttribute('stroke-width') || '3';
                const halo = tx.cloneNode(true);
                halo.setAttribute('fill', '#ffffff');
                halo.setAttribute('stroke', '#ffffff');
                halo.setAttribute('stroke-width', sw);
                halo.setAttribute('stroke-linejoin', 'round');
                halo.removeAttribute('paint-order');
                tx.removeAttribute('paint-order');
                tx.removeAttribute('stroke');
                tx.removeAttribute('stroke-width');
                tx.removeAttribute('stroke-linejoin');
                if (tx.parentNode) tx.parentNode.insertBefore(halo, tx);
            });
            clone.querySelectorAll('text, tspan').forEach(tx => tx.setAttribute('font-family', fontName));
            const MW = 277, MH = 190, MX = 10, MY = 10;
            const k = Math.min(MW / w, MH / h);
            const dw = w * k, dh = h * k;
            await doc.svg(clone, { x: MX + (MW - dw) / 2, y: MY + (MH - dh) / 2, width: dw, height: dh });
            doc.save(fileName);
            if (window.showToast) window.showToast(t('sv_pdf_ok', 'PDF esportato'), 'success');
        } catch (e) {
            console.error('[StudioView] export PDF:', e);
            if (window.showToast) window.showToast(t('sv_pdf_err', 'Export PDF fallito: ') + e.message, 'error');
        }
    }
    // Col Focus aperto il bottone del tab esporta LA FOCUS-MAP: è quello che
    // si sta guardando. Chiuso il focus torna a esportare la vista d'insieme.
    function exportViewPdf() {
        if (S.focus) {
            if (!S.focus.handle) return;
            exportPdfFromSvg(document.getElementById('sv-focus-svg'), S.focus.handle.bbox,
                'Focus-' + safeName((S.focus.centro && S.focus.centro.label) || S.focus.id) +
                '-' + (S.focus.mode === 'vicini' ? 'vicini' : 'parentela') + '.pdf');
            return;
        }
        if (!S.handle || !S.lastRes) return;
        const p = profile();
        exportPdfFromSvg(document.getElementById('studio-svg'), S.handle.bbox,
            'Studio-' + safeName(appState.rootNodeLabel || 'mappa') + '-' + p.mode + '.pdf');
    }

    /* ── ingresso e uscita ──────────────────────────────────────────────── */
    function enter(silenzioso) {
        if (!appState.db.nodes || !appState.db.nodes.length) return;
        S.active = true;
        try { localStorage.setItem(ATTIVO_KEY, '1'); } catch (e) { /* best-effort */ }
        ensureOverlay();
        watchResize();
        const tab = document.getElementById('sidebar-tab-vista');
        if (tab) { tab.classList.remove('hidden'); tab.classList.add('flex'); }
        buildControls();
        if (window.switchSidebarTab) window.switchSidebarTab('vista');
        render();
        // Rientrando da soli il messaggio non serve: spiega una scelta che in
        // quel momento l'utente non ha fatto, e comparirebbe a ogni apertura.
        if (!silenzioso && window.showToast) window.showToast(t('tst_studio_on', 'Vista studio: deterministica, da leggere. Il layout libero resta sotto.'), 'info');
    }
    /* Rientro automatico: la chiama chi ha appena finito di disegnare il canvas
       (initD3Visualization), che è l'unico momento in cui l'overlay può
       montarsi senza trovare una mappa a metà. Torna true se ha ripreso. */
    function riprendi() {
        if (S.active) return false;
        try { if (localStorage.getItem(ATTIVO_KEY) !== '1') return false; } catch (e) { return false; }
        if (localStorage.getItem('mappai_studio_view') === '0') return false;   // kill-switch
        if (!appState || !appState.db || !(appState.db.nodes || []).length) return false;
        appState.layoutMode = 'studio';
        enter(true);
        if (window.updateLayoutButtonLabel) window.updateLayoutButtonLabel();
        return true;
    }
    function exit(volontaria) {
        S.active = false;
        // Solo il bottone LAYOUT dice «non voglio più la vista studio»: le
        // uscite di servizio lasciano il ricordo dov'è (vedi ATTIVO_KEY).
        if (volontaria) { try { localStorage.setItem(ATTIVO_KEY, '0'); } catch (e) { /* best-effort */ } }
        // La taratura con cui si esce è quella con cui si vuole rientrare, anche
        // su una mappa diversa: si scrive qui e alla chiusura dell'app.
        scriviUtente();
        closeMenu(); closeFocus();
        const ov = document.getElementById('studio-overlay');
        if (ov) ov.remove();
        const tab = document.getElementById('sidebar-tab-vista');
        if (tab) { tab.classList.add('hidden'); tab.classList.remove('flex'); }
        if (window.switchSidebarTab) window.switchSidebarTab('structure');
    }

    /* Il ciclo LAYOUT entra nella vista già su un motore preciso (Albero,
       Fasci, DAG): passa DA QUI, così il cambio di motore ripone e ritira le
       tarature come farebbe il segmento nel pannello — una strada sola per la
       stessa cosa. Chiamabile anche a vista chiusa: `enter()` disegnerà con
       quello appena scelto. */
    /* Torna alla mappa libera — lo stesso posto in cui porta il bottone LAYOUT
       uscendo dal giro. Passa da `exit(true)`: è una scelta del docente («non
       voglio più la vista studio»), non un'uscita di servizio, quindi riaprendo
       l'app non deve ritrovarsi la vista addosso. Le forze si riapplicano qui,
       perché nessuno ce le rimette: `exit` smonta l'overlay e basta. */
    function tornaAllaMappa() {
        if (typeof appState !== 'undefined') appState.layoutMode = 'default';
        exit(true);
        try { if (window.updateLayoutButtonLabel) window.updateLayoutButtonLabel(); } catch (e) { }
        try { if (window.applyLayoutForces) window.applyLayoutForces(); } catch (e) { }
    }

    function setMotore(mode) {
        const p = profile();
        cambiaMotore(p, mode);
        if (mode !== 'anelli') p.centerId = null;
        if (S.active) { render(); buildControls(); }
        persist();
    }

    window.MappAIStudioView = {
        enter, exit, riprendi, render, openFocus, closeFocus, renderFocus, buildControls,
        openDescModal, profile, focusProfile: fprofile, _state: S,
        setMotore, ripristina, nomeMotore, salvaProfilo: scriviUtente,
        tornaAllaMappa, _defaultsDi: defaultsDi, MOTORI, USCITA
    };
    console.log('[MappAIStudioView] vista studio caricata (kill-switch: mappai_studio_view=0)');
})();
