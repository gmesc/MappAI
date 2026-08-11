/* ═══════════════════════════════════════════════════════════════════════════
   COSTRUISCI — stile «manifesto»: la tabella dei file e il BENTO delle opzioni
   (progetto Inkscape di Giacomo, pagina 2)

   Due pezzi, tutti e due nati da una richiesta precisa:

   1. LA TABELLA DEI FILE, accanto al bottone delle fonti. Prima il file caricato
      si vedeva solo dentro il campo di caricamento («3 file»): il nome intero, il
      peso e quante pagine sono non si leggevano da nessuna parte. La tabella usa
      il contenitore del motore (`.mm-tab-wrap` + `.mm-tab`), come gli elenchi
      delle console: una veste sola per la stessa cosa.
      ⚠️ Niente colonna «pagine»: sembrava un dato da leggere al volo dal file,
      invece costava l'apertura del PDF con pdf.js — che prende il suo worker da
      una CDN e senza rete lascia la pagina appesa. Decisione di Giacomo (3/8):
      non è un'informazione indispensabile, e toglierla toglie una dipendenza.

   2. IL BENTO DELLE OPZIONI, che sostituisce il modale «Genera materiali».
      ⚠️ Le card portano gli STESSI id dei campi del modale (`mp-quiz-on`,
      `mp-qt-mc`, `mp-ns-fmt`…). Non è un trucco: è la condizione perché
      `MappAIPipeline._readConfig()` continui a essere l'unico posto che legge la
      configurazione. Riscriverne una copia qui vorrebbe dire due letture della
      stessa cosa, che divergono al primo campo aggiunto.
      Per questo il modale, con la veste accesa, non si apre più: due superfici
      con gli stessi id aperte insieme sarebbero un guaio vero.

   Vive sotto `html.manifesto`: col kill-switch `mappai_stile_manifesto='0'`
   questo modulo non monta niente e il modale storico torna quello di prima.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    function t(k, f) { try { return window.t ? window.t(k, f) : f; } catch (e) { return f; } }
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function attivo() { return document.documentElement.classList.contains('manifesto'); }
    function icone() { if (window.safeCreateIcons) window.safeCreateIcons(); }

    /* ═══ 1. LA TABELLA DEI FILE ══════════════════════════════════════════ */

    /* ⚠️ Il cestino è un SVG IN LINEA (tracciato Lucide `trash-2`), non un
       `<i data-lucide>`. Motivo trovato misurando, e costoso: ridisegnare la
       tabella chiamava `safeCreateIcons()`, che è l'hub GLOBALE dell'app e
       riscrive le icone di tutta la pagina — comprese quelle dentro
       `#sources-container`, che è proprio ciò che il nostro osservatore guarda.
       Ridisegno → icone → mutazione → ridisegno: la pagina si fermava.
       È la stessa scelta di `mappai-doc-bar.js`, per la stessa ragione: non
       dipendere da chi disegna le icone altrove. */
    /* ⚠️ Il comando di eliminazione è un SVG IN LINEA, non un `<i data-lucide>`.
       Motivo trovato misurando, e costoso: ridisegnare l'elenco chiamava
       `safeCreateIcons()`, che è l'hub GLOBALE dell'app e riscrive le icone di
       tutta la pagina — comprese quelle dentro `#sources-container`, che è
       proprio ciò che il nostro osservatore guarda. Ridisegno → icone →
       mutazione → ridisegno: la pagina si fermava.
       È la stessa scelta di `mappai-doc-bar.js`, per la stessa ragione. */

    /* Il pallino di eliminazione (5/8, disegno di Giacomo): cerchio `#404040` con
       la × **bucata**, cioè ritagliata nel disco — non disegnata sopra. Si ottiene
       con un solo path e `fill-rule="evenodd"`: il cerchio e le due barre della ×
       sono sottopercorsi, e dove si sovrappongono il riempimento si cancella,
       lasciando vedere il fondo del box. Un tratto disegnato sopra sarebbe una
       seconda tinta da scegliere e da tenere leggibile; un foro no.
       Il riflesso in alto a sinistra è ciò che lo rende «lucido»: un ovale bianco
       al 22%, non un gradiente — su 20px un gradiente non si legge, una lumeggiatura
       sì. */
    var SVG_PALLINO_X =
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path fill="currentColor" fill-rule="evenodd" d="' +
        'M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22Z' +                    /* il disco */
        'M8.4 7.05 12 10.64l3.6-3.59 1.35 1.35L13.36 12l3.59 3.6-1.35 1.35L12 13.36l-3.6 3.59-1.35-1.35L10.64 12 7.05 8.4Z' +
        '"/>' +
        '<ellipse cx="8.6" cy="6.4" rx="4.6" ry="2.9" fill="#ffffff" opacity=".22" ' +
        'transform="rotate(-32 8.6 6.4)"/></svg>';

    function peso(n) {
        if (!n && n !== 0) return '—';
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
        return (n / 1048576).toFixed(1).replace('.', ',') + ' MB';
    }

    /* ── L'elenco di TUTTE le fonti caricate (5/8, decisione di Giacomo) ──────
       Prima elencava i soli file: chi incollava un URL o un testo non aveva un
       posto dove vedere che cosa avesse messo dentro — la stessa domanda («che
       cosa sto per dare in pasto all'AI?») trovava risposta per i PDF e non per il
       resto. Ora una riga per fonte, qualunque sia il genere; il CAMPO dove si
       incolla resta nel box «Fonti caricate», che è un'altra cosa: lì si scrive,
       qui si vede l'inventario.
       Si legge dal DOM e non da appState: `appState` è una const lessicale (non sta
       su window) e le righe portano comunque il dato vero. */
    function fontiCaricate() {
        var out = [];
        /* ⚠️ Si cercano nel DOCUMENTO, non dentro `#sources-container`: la riga del
           testo libero viene spostata nel suo box, e cercandola solo nel contenitore
           sparirebbe dall'inventario proprio mentre la si sta scrivendo. */
        var righe = document.querySelectorAll('.source-entry');
        for (var i = 0; i < righe.length; i++) {
            var riga = righe[i];
            /* il genere lo dichiara il titolo della riga («File PDF», «Link Web»,
               «Video YouTube», «Testo Libero», «Documenti…»): è il testo che
               `addSource` scrive, quindi non c'è una seconda lista da tenere
               allineata a quella dei tipi */
            var tit = riga.querySelector('.font-bold');
            var genere = tit ? tit.textContent.trim().split('(')[0].trim() : '';
            var inp = riga.querySelector('input[type="file"]');
            if (inp && inp.files && inp.files.length) {
                for (var j = 0; j < inp.files.length; j++) {
                    out.push({ id: riga.id, nome: inp.files[j].name, dett: peso(inp.files[j].size) });
                }
                continue;
            }
            var url = riga.querySelector('input[type="url"]');
            if (url && url.value.trim()) {
                out.push({ id: riga.id, nome: url.value.trim().replace(/^https?:\/\/(www\.)?/, ''), dett: genere });
                continue;
            }
            var ta = riga.querySelector('textarea');
            if (ta && ta.value.trim()) {
                var parole = ta.value.trim().split(/\s+/).length;
                out.push({
                    id: riga.id,
                    nome: ta.value.trim().replace(/\s+/g, ' ').slice(0, 60),
                    dett: parole + (parole === 1 ? ' parola' : ' parole')
                });
            }
            /* una riga appena aperta e ancora vuota NON si elenca: non c'è niente
               da mostrare, e comparirebbe un posto vuoto per un gesto a metà */
        }
        return out;
    }

    function montaTabellaFile() {
        var step = document.querySelector('#setup-form .source-buttons-container');
        if (!step || document.getElementById('mn-files')) return;
        var box = document.createElement('div');
        box.id = 'mn-files';
        step.parentNode.insertBefore(box, step.nextSibling);
        disegnaTabella();
    }

    /* Le due righe a colonne del progetto: comandi stretti a sinistra, ciò che
       producono a destra. ⚠️ Non con un `float`: lo step è un contenitore flex e
       lì il float è IGNORATO (misurato: la tabella finiva sotto i bottoni, non
       accanto). Serve un contenitore vero, e lo si costruisce qui invece che in
       index.html — così il kill-switch della veste resta una riga sola e il
       markup dell'app non si biforca. */
    /* Gli span arrivano da `MappAIBento.RIGHE` (5/8): la griglia è la STESSA del
       bento — `repeat(4, 1fr)`, gap 14 — quindi le colonne di queste due righe si
       allineano ai riquadri sotto. Prima erano `340px | 1fr` scritti nel CSS: una
       misura vicina a quella del bento e diversa, e «due colonne» non voleva dire
       niente. Ora è un dato, e si ritocca nell'Officina §7. */
    /* Un pezzo montato nel bento non va impaginato nella riga storica: sarebbe un
       contenitore che lo aspetta e non lo riceve mai (il bento se lo prende), cioè
       una riga vuota che consuma comunque il suo spazio — la trappola dell'item
       alto zero, già vista tre volte. Si chiede al DATO, non si indovina. */
    function nelBento(selettore) {
        var B = window.MappAIBento;
        if (!B) return false;
        var moduli = comp() || [];
        return moduli.some(function (m) {
            return B.vociDi(m).some(function (v) { return v.base && v.base.sposta === selettore; });
        });
    }

    function impagina(sinistra, destra, id) {
        if (nelBento(sinistra) || nelBento(destra)) return;
        var s = document.querySelector(sinistra), d = document.querySelector(destra);
        if (!s || !d || document.getElementById(id)) return;
        var riga = document.createElement('div');
        riga.id = id;
        riga.className = 'mn-riga';
        var B = window.MappAIBento;
        var def = (B && B.riga) ? B.riga(id) : null;
        if (def && def.span) {
            s.style.gridColumn = 'span ' + def.span[0];
            d.style.gridColumn = 'span ' + def.span[1];
        }
        s.parentNode.insertBefore(riga, s);
        riga.appendChild(s);
        riga.appendChild(d);
    }

    /* La riga del genere: MM/KG a sinistra e, accanto, il TEMA CENTRALE (MindMap)
       oppure lo SLIDER dei nodi (Knowledge Graph). I due pezzi vivono in due punti
       distanti del form: qui si portano nello stesso contenitore e si mostra quello
       che serve — non si duplicano, si spostano.
       Perché in un contenitore mio e non lasciandoli dov'erano: sono le due facce
       della stessa domanda («che mappa, e su cosa»), e devono occupare lo stesso
       posto sullo schermo, altrimenti passando da MM a KG la pagina salta. */
    function impaginaGenere() {
        if (document.getElementById('mn-genere-dx')) return;
        var root = document.getElementById('step-root-container');
        var kg = document.getElementById('step-kg-density-container');
        if (!root && !kg) return;
        var box = document.createElement('div');
        box.id = 'mn-genere-dx';
        (root || kg).parentNode.insertBefore(box, root || kg);
        if (root) box.appendChild(root);
        if (kg) box.appendChild(kg);
        sincronizzaGenere();
    }

    /* Quale dei due si vede lo decide `window.setMode`, che è la funzione VERA
       dell'app (mappai-ui-canvas.js): quella che i due bottoni chiamano già, e che
       oltre alle classi imposta `style.display` — quindi un toggle di classe scritto
       qui non potrebbe nemmeno vincerle contro.
       ⚠️ Prima questa funzione faceva il lavoro da sé, e all'avvio il tema restava
       nascosto: qualcuno metteva `hidden` DOPO il montaggio del bento e il mio
       toggle, girato una volta sola, aveva già perso. Delegare risolve il conflitto
       alla radice invece di rincorrerlo — e `setMode` è idempotente, quindi
       chiamarla per normalizzare lo stato non ha effetti collaterali. */
    function sincronizzaGenere() {
        if (typeof window.setMode !== 'function') return;
        var sel = document.getElementById('extraction-mode');
        var m = (sel && sel.value) || 'mindmap';
        try { window.setMode(m === 'kg' ? 'kg' : 'mindmap'); } catch (e) { }
    }

    /* ── Il Finder si apre al PRIMO clic ─────────────────────────────────────
       Prima ci volevano due clic e una riga in mezzo: «Documenti» apriva un
       riquadro con dentro un `<input type=file>` e il suo «Scegli file».
       Si avvolge `window.addSource` invece di toccarla: è esposta su window, e
       così ogni punto che la chiama guadagna il comportamento.
       ⚠️ Il `.click()` va fatto **nello stesso task** del gesto dell'utente: il
       selettore di file richiede una *transient activation*, che un `setTimeout`
       lascia scadere. Per questo qui non c'è nessun rinvio. */
    var TIPI_FILE = { doc: 1, pdf: 1, audio: 1, video: 1 };
    function apriSubitoIlFinder() {
        var orig = window.addSource;
        if (typeof orig !== 'function' || orig._mnFinder) return;
        var patch = function (tipo) {
            var prima = document.querySelectorAll('#sources-container .source-entry').length;
            orig.apply(this, arguments);
            if (!attivo() || !TIPI_FILE[tipo]) return;
            var righe = document.querySelectorAll('#sources-container .source-entry');
            if (righe.length <= prima) return;                 // nessuna riga nuova
            var riga = righe[righe.length - 1];
            /* La riga si MARCA e il foglio la nasconde: con il Finder che si apre
               da sé, quel riquadro direbbe una seconda volta il nome del file che
               l'elenco a destra già mostra — nella veste di prima.
               Marcata e non rimossa: l'`<input type=file>` vive lì ed è quello che
               il Finder riempie e che `handleFileUpload` legge. Le fonti che hanno
               davvero un campo da compilare (URL, YouTube, testo) NON si marcano e
               restano a schermo. */
            riga.classList.add('mn-src-file');
            var inp = riga.querySelector('input[type="file"]');
            if (inp) { try { inp.click(); } catch (e) { /* il riquadro resta usabile */ } }
        };
        patch._mnFinder = true;
        window.addSource = patch;
    }

    var inDisegno = false;
    function disegnaTabella() {
        var box = document.getElementById('mn-files');
        if (!box || inDisegno) return;      // rete: un ridisegno non ne innesca un altro
        inDisegno = true;
        /* le righe nuove vanno al loro posto PRIMA di contarle: l'inventario le
           trova comunque (cerca nel documento), ma la textarea deve trovarsi nel
           box dove si scrive già alla prima comparsa, non al ridisegno dopo */
        try { raccogliRighe(); _disegnaTabella(box); } finally { inDisegno = false; }
    }

    /* La riga delle fonti ha due colonne SOLO quando la destra ha qualcosa da
       dire. Senza file quella colonna resta vuota (misurato in Electron:
       868×426 di bianco su 1240) e i cinque bottoni si accalcano due per riga
       nei 340px di sinistra. A colonna unica si distendono su tutta la
       larghezza; al primo file la tabella prende il suo posto e i comandi
       tornano stretti. Lo dice una classe e non un `:has()`: in un foglio con
       700+ `!important` la cascata non è prevedibile a tavolino (§TRAPPOLE). */
    /* Lo span della sinistra segue `vuotoASinistra` quando l'elenco è vuoto. Oggi
       i due valori coincidono (2 e 2), quindi la riga non cambia mai forma — ed è
       la decisione del 5/8. La leva resta perché è un dato: se un domani si
       rivolesse la colonna distesa, si cambia il numero in `RIGHE`, non qui. */
    function segnalaColonna(pieno) {
        var riga = document.getElementById('mn-riga-fonti');
        if (!riga) return;
        var B = window.MappAIBento, def = (B && B.riga) ? B.riga('mn-riga-fonti') : null;
        var s = riga.querySelector('.source-buttons-container');
        if (s && def) s.style.gridColumn = 'span ' + (pieno ? def.span[0] : (def.vuotoASinistra || def.span[0]));
    }

    function _disegnaTabella(box) {
        var files = fontiCaricate();
        /* ⚠️ Il riquadro c'è SEMPRE, anche vuoto (5/8, decisione di Giacomo):
           la prima fase del mega-bento ha la sua impaginazione — bottone 2 colonne
           + elenco 2 colonne — e non la cambia al primo file. Prima la colonna di
           destra nasceva assente e i bottoni si distendevano su quattro: la riga
           si riformava sotto le dita nel momento in cui si caricava qualcosa. */
        box.classList.add('ha-file');
        segnalaColonna(true);
        if (!files.length) {
            box.innerHTML = '<div class="mn-files__box mn-files__box--vuoto"></div>';
            return;
        }
        /* Righe compatte e SENZA intestazione (5/8): il box è alto quanto il
           bottone accanto, e una fila «NOME FILE · DIMENSIONE» costerebbe un
           quinto di quello spazio per dire ciò che un nome di file e un «33,1 MB»
           dicono da soli. Con più file scorre (`overflow-y` nel foglio), quindi
           l'intestazione sparirebbe comunque scorrendo. */
        box.innerHTML = '<div class="mn-files__box">' + files.map(function (f) {
            var nome = f.nome;
            return '<div class="mn-file" data-src="' + esc(f.id) + '">' +
                '<span class="mn-file__n" title="' + esc(nome) + '">' + esc(nome) + '</span>' +
                '<span class="mn-file__p">' + esc(f.dett) + '</span>' +
                '<button type="button" class="mn-togli" data-src="' + esc(f.id) + '" ' +
                'aria-label="' + esc(t('mn_togli', 'Togli il file')) + '" ' +
                'title="' + esc(t('mn_togli', 'Togli il file')) + '">' + SVG_PALLINO_X + '</button>' +
                '</div>';
        }).join('') + '</div>';
    }

    /* ═══ 2. IL BENTO DELLE OPZIONI ═══════════════════════════════════════
       La COMPOSIZIONE non è scritta qui: sta in `mappai-bento-composizione.js`
       e si modifica nell'Officina §7 (trascinando). Qui si monta e basta.
       Perché: i corpi diversi, i preset spariti e la card fuori griglia erano lo
       stesso difetto — la composizione non era un dato, quindi non poteva essere
       né controllata né discussa. Ora il validatore dice cosa è rimasto fuori.
       Se l'officina ha scritto una composizione, vince quella. */

    function comp() {
        var B = window.MappAIBento;
        if (!B) return null;
        try {
            var s = localStorage.getItem('mappai_bento_layout');
            if (s) { var j = JSON.parse(s); if (Array.isArray(j) && j.length) return j; }
        } catch (e) { }
        return B.MODULI;
    }

    /* ── I pop-up informativi (5/8, richiesta di Giacomo) ─────────────────────
       Ogni opzione porta il suo `aiuto` come `data-tip`: il fumetto lo disegna
       `MappAITips`, che è già la delega globale dell'app e ora aspetta 950ms prima
       di aprire. Il testo sta nel DATO (`VOCI[].aiuto`) e si riscrive in officina,
       come l'etichetta: una spiegazione scritta nel renderer sarebbe una cosa che
       nessuno può correggere senza toccare il codice. */
    var _voceCorrente = null;
    function tip(v) {
        var a = v && (v.aiuto || (v.base && v.base.aiuto));
        return a ? ' data-tip="' + esc(a) + '"' : '';
    }
    function spunta(id, etichetta, on) {
        return '<label class="mn-op"' + tip(_voceCorrente) + '><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '>' +
            '<span>' + esc(etichetta) + '</span></label>';
    }
    function campo(etichetta, dentro) {
        return '<label class="mn-campo"' + tip(_voceCorrente) + '><span>' + esc(etichetta) + '</span>' + dentro + '</label>';
    }

    function opzioniClassi() {
        var out = '<option value="">' + esc(t('mp_no_class', '— nessuna classe —')) + '</option>';
        try {
            var CL = window.MappAIClasses;
            var att = CL && CL.activeId ? CL.activeId() : '';
            (CL && CL.list ? CL.list() : []).forEach(function (c) {
                out += '<option value="' + esc(c.id) + '"' + (c.id === att ? ' selected' : '') + '>' + esc(c.name) + '</option>';
            });
        } catch (e) { }
        return out;
    }
    /* ── «Chi» e «Cosa»: il contesto, dichiarato nel bento ───────────────────
       In COSTRUISCI il chip dell'header è nascosto (una sola superficie per la
       stessa informazione), quindi queste due tendine SONO il contesto. Non
       portano campi nuovi alla pipeline: scrivono `mappai_active_class` /
       `mappai_active_discipline` / il profilo attivo, da cui `_resolveFolderPath`
       e la taratura già leggono. I valori sono prefissati `c:` / `s:` perché una
       classe e un allievo non sono la stessa cosa e si escludono a vicenda. */
    function elencoAllievi() {
        try {
            var CL = window.MappAIClasses;
            return (CL && CL.students) ? CL.students() : [];
        } catch (e) { return []; }
    }

    function chiCorrente() {
        try {
            var CL = window.MappAIClasses;
            if (!CL) return '';
            var nick = CL.activeStudentName ? CL.activeStudentName() : '';
            if (nick) {
                var l = elencoAllievi();
                for (var i = 0; i < l.length; i++) if (l[i] && l[i].nickname === nick) return 's:' + i;
            }
            var id = CL.activeId ? CL.activeId() : '';
            return id ? 'c:' + id : '';
        } catch (e) { return ''; }
    }

    function opzioniChi() {
        var cur = chiCorrente();
        var sel = function (v) { return v === cur ? ' selected' : ''; };
        var out = '<option value="">' + esc(t('mn_chi_vuoto', '— scegli —')) + '</option>';
        var CL = window.MappAIClasses;
        var classi = [];
        try { classi = (CL && CL.list) ? CL.list() : []; } catch (e) { }
        if (classi.length) {
            out += '<optgroup label="' + esc(t('mn_chi_classi', 'Classi')) + '">';
            classi.forEach(function (c) {
                out += '<option value="c:' + esc(c.id) + '"' + sel('c:' + c.id) + '>' + esc(c.name) + '</option>';
            });
            out += '</optgroup>';
        }
        var allievi = elencoAllievi();
        var conNome = allievi.filter(function (p) { return p && p.nickname; });
        if (conNome.length) {
            out += '<optgroup label="' + esc(t('mn_chi_allievi', 'Allievi')) + '">';
            allievi.forEach(function (p, i) {
                if (!p || !p.nickname) return;
                out += '<option value="s:' + i + '"' + sel('s:' + i) + '>' + esc(p.nickname) + '</option>';
            });
            out += '</optgroup>';
        }
        return out;
    }

    /* La classe di riferimento di «Chi»: se è un allievo, quella della sua scheda
       (se ce l'ha). Serve a sapere QUALI materie proporre — un allievo di 2A non
       studia le materie di un'altra classe. */
    function classeDiChi(val) {
        var CL = window.MappAIClasses;
        if (!CL) return null;
        var v = String(val || '');
        try {
            if (v.indexOf('c:') === 0) return CL.get ? CL.get(v.slice(2)) : null;
            if (v.indexOf('s:') === 0) {
                var p = elencoAllievi()[parseInt(v.slice(2), 10)];
                return (p && p.classId && CL.get) ? CL.get(p.classId) : null;
            }
        } catch (e) { }
        return null;
    }

    function materieDi(val) {
        var CL = window.MappAIClasses;
        if (!CL || !CL.disciplineChoices) return [];
        var cls = classeDiChi(val);
        try { return CL.disciplineChoices(cls || {}) || []; } catch (e) { return []; }
    }

    function opzioniLivello() {
        var out = '<option value="all">' + esc(t('mp_all_levels', 'tutti')) + '</option>';
        for (var i = 1; i <= 5; i++) out += '<option value="' + i + '">L' + i + '</option>';
        return out;
    }
    function opzioniPreset() {
        var out = '<option value="">' + esc(t('mp_no_preset', '— nessun preset —')) + '</option>';
        try {
            var l = JSON.parse(localStorage.getItem('mappai_material_presets') || '[]');
            l.forEach(function (p) { out += '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; });
        } catch (e) { }
        return out;
    }
    function pdfDefault() {
        try {
            var CL = window.MappAIClasses;
            return !!(CL && CL.activeStudentName && CL.activeStudentName());
        } catch (e) { return false; }
    }

    /* una voce della composizione → il suo pezzo di interfaccia, con l'id VERO.
       `v.et` è l'etichetta (riscrivibile dall'officina) e `v.w` la larghezza del
       campo: due leve che prima erano scritte qui dentro, cioè in nessun posto
       dove si potessero discutere. */
    function pezzo(v) {
        _voceCorrente = v;          /* lo leggono spunta() e campo() per il pop-up */
        var B = window.MappAIBento;
        var w = v.w ? ' style="width:' + parseInt(v.w, 10) + 'px;max-width:100%"' : '';
        /* gli strumenti si riconoscono dal TIPO, non dall'id: sono diciannove e
           crescono, e un `case` per ognuno sarebbe un elenco da tenere allineato
           a `VOCI` — cioè due liste che divergono.
           ⚠️ Si ritorna l'HTML QUI: rimandare a `pezzo()` con un id finto rientrava
           in questo stesso ramo — ricorsione infinita, e il bento non si montava
           affatto (nessun errore in console: lo stack esplode dentro il try). */
        if (v.base && v.base.tipo === 'strumento') {
            /* `raccoglie` invece di `sposta`: il pezzo non esiste al montaggio —
               nasce quando si preme «Testo» — quindi il posto dichiara CHE COSA
               raccoglie e `raccogliRighe()` glielo porta appena compare. */
            var dove = v.base.raccoglie
                ? ' data-raccoglie="' + esc(v.base.raccoglie) + '"'
                : ' data-sposta="' + esc(v.base.sposta || '') + '"';
            /* `mostraEt`: l'etichetta del posto resta anche quando il pezzo è
               dentro. Serve dove il pezzo mostra un VALORE e non il proprio nome
               («ON», «A»…) — di norma non serve, perché le righe montate portano
               già la loro etichetta. È una leva per voce, decisa in officina. */
            /* il titolo del posto in tre stati, deciso dal dato: auto · sempre ·
               mai. «mai» non si nasconde col foglio — non si emette, e quello che
               non c'è non può ricomparire per una regola più forte. */
            var quale = B.titoloPosto ? B.titoloPosto(v) : 'auto';
            var att = quale === 'mai' ? '' : '<span class="mn-str__att">' + esc(v.et) + '</span>';
            return '<div class="mn-str' + (quale === 'sempre' ? ' mn-str--et' : '') + '"' +
                dove + tip(v) + '>' + att + '</div>';
        }
        switch (v.id) {
            /* i due punti di «Chi:» / «Cosa:» arrivano dall'etichetta in VOCI, non
               da qui: l'anteprima dell'Officina non deve divergere dal prodotto */
            case 'mp-chi':
                return campo(v.et, '<select id="mp-chi" class="mn-sel"' + w +
                    ' aria-label="' + esc(t('mn_chi_aria', 'Chi: classe o allievo destinatario')) + '">' + opzioniChi() + '</select>');
            case 'mp-disc':
                /* le opzioni le riempie `sincronizzaContesto()`: dipendono da «Chi»,
                   e scriverle qui vorrebbe dire due posti che le calcolano */
                return campo(v.et, '<select id="mp-disc" class="mn-sel"' + w +
                    ' aria-label="' + esc(t('mn_disc_aria', 'Cosa: materia')) + '"></select>');
            case 'mp-class':
                return '<select id="mp-class" class="mn-sel"' + w + ' aria-label="' + esc(v.et) + '">' + opzioniClassi() + '</select>';
            case 'mp-preset':
                /* Era la voce che mancava: si sceglievano le opzioni e non si
                   potevano conservare. I tre comandi chiamano le funzioni VERE
                   della pipeline — nessuna logica nuova. */
                return '<select id="mp-preset" class="mn-sel"' + w + ' aria-label="' + esc(v.et) + '">' + opzioniPreset() + '</select>' +
                    '<div class="mn-preset-az">' +
                    '<button type="button" class="mn-btn" data-preset="applica">' + esc(t('mp_apply', 'Applica')) + '</button>' +
                    '<button type="button" class="mn-btn" data-preset="salva">' + esc(t('mp_save', 'Salva')) + '</button>' +
                    '<button type="button" class="mn-btn" data-preset="elimina">' + esc(t('mp_delete', 'Elimina')) + '</button>' +
                    '</div>';
            case 'mp-adapt-on': return spunta('mp-adapt-on', v.et, false);
            case 'mp-adapt-scope':
                return '<div id="mp-adapt-body" class="mn-radio">' +
                    '<label><input type="radio" name="mp-adapt-scope" value="map"><span>' + esc(t('mp_adapt_map', 'Solo la mappa')) + '</span></label>' +
                    '<label><input type="radio" name="mp-adapt-scope" value="materials"><span>' + esc(t('mp_adapt_materials', 'Solo i materiali')) + '</span></label>' +
                    '<label><input type="radio" name="mp-adapt-scope" value="both" checked><span>' + esc(t('mp_adapt_both', 'Entrambi')) + '</span></label>' +
                    '</div>';
            case 'mp-perbranch':
                return campo(v.et, '<input type="number" id="mp-perbranch" min="1" max="10" value="3" class="mn-num"' + w + ' aria-label="' + esc(v.et) + '">');
            case 'mp-angle':
                return campo(v.et, '<select id="mp-angle" class="mn-sel"' + w + ' aria-label="' + esc(v.et) + '">' +
                    (window.buildQuizAngleOptions ? window.buildQuizAngleOptions('auto') : '<option value="auto">auto</option>') + '</select>');
            case 'mp-ns-level':
                return campo(v.et, '<select id="mp-ns-level" class="mn-sel"' + w + ' aria-label="' + esc(v.et) + '">' + opzioniLivello() + '</select>');
            case 'mp-ns-fmt':
                return campo(v.et, '<select id="mp-ns-fmt" class="mn-sel"' + w + ' aria-label="' + esc(v.et) + '">' +
                    '<option value="3x4">3×4</option><option value="2x2" selected>2×2</option><option value="2x1">2×1</option></select>');
            case 'mp-estimate':
                return '<div id="mp-estimate" class="mn-est" role="status"></div>';
            /* GLI STRUMENTI sono gestiti in cima alla funzione, per TIPO: il modulo
               accoglie l'ELEMENTO VERO e `spostaStrumenti()` lo mette dentro dopo il
               montaggio. Ridisegnare la copia di un toggle vorrebbe dire due
               controlli per lo stesso stato (la lezione di `#mn-genere-dx`). */
            case 'mp-src-pdf': return spunta('mp-src-pdf', v.et, pdfDefault());
            case 'mp-qt-mc': return spunta('mp-qt-mc', v.et, true);
            case 'mp-ns-title': return spunta('mp-ns-title', v.et, true);
            default:
                if (v.base && v.base.tipo === 'azione') {
                    /* un'azione dentro un modulo qualunque resta un BOTTONE: prima
                       cadeva qui e tornava stringa vuota — il modulo blu «Genera
                       Mappa» si vedeva colorato e senza testo. */
                    return '<button type="button" id="' + esc(v.id) + '" class="mn-azione-int">' +
                        '<i data-lucide="' + (v.base.primaria ? 'package' : 'git-merge') + '"></i>' +
                        '<span>' + esc(v.et) + '</span></button>';
                }
                if ((v.base && v.base.tipo) === 'spunta' || v.tipo === 'spunta') return spunta(v.id, v.et, false);
                return '';
        }
    }

    /* L'aspetto scelto nell'officina diventa stile INLINE: fondo, testo, bordo,
       altezza e colonne occupate. Inline e non classi perché sono scelte per-
       modulo, non famiglie: una classe per ogni combinazione sarebbe un foglio
       che cresce a ogni ritocco. */
    function stileAttr(m) {
        var B = window.MappAIBento;
        var st = B.stileDi(m);
        var azione = B.soloAzioni(m);   /* `nuda` non basta più: vedi montaBento */
        /* ⚠️ Su un bottone-azione il colore scelto è quello del SEGNO (l'icona),
           non del testo: a riposo si vede solo l'icona e l'etichetta prende il
           colore del fondo, come nei tre avvii. Al passaggio l'etichetta compare
           col colore del segno. Il CSS non sa leggere il `background`, quindi il
           colore del segno viaggia in una variabile che il modulo scrive qui. */
        /* ⚠️ Un modulo NUDO non porta fondo, testo e bordo: quelli sono del pezzo
           che accoglie. Scritti qui, il bottone che carica i documenti si
           ritroverebbe un rettangolo scuro dietro (il fondo di base) e un colore
           di testo che non è il suo. Del riquadro resta la sola cosa che è
           davvero sua: quante colonne occupa. */
        if (m.nuda && !azione) {
            var Pn = B.presentazione ? B.presentazione(m) : { vars: '', attr: '' };
            return ' style="grid-column: span ' + (m.span || 1) + ';' +
                (m.altezza ? 'min-height:' + parseInt(m.altezza, 10) + 'px;' : '') +
                Pn.vars + '"' + Pn.attr;
        }
        var css = 'grid-column: span ' + (m.span || 1) + ';' +
            'background:' + st.bg + ';' +
            /* ⚠️ Su un bottone-azione il `color` NON si scrive inline: lo stile
               inline batte qualunque regola non-important, quindi l'hover del CSS
               non poteva cambiarlo (misurato: il testo restava del colore del
               fondo anche al passaggio). Si passano le due tinte come variabili e
               a scegliere è il foglio — dove la cascata funziona. */
            (azione ? '--mn-seg:' + st.testo + ';--mn-fondo:' + st.bg + ';' : 'color:' + st.testo + ';') +
            (st.bordoPx ? 'border:' + parseInt(st.bordoPx, 10) + 'px solid ' + st.bordoCol + ';' : 'border:none;') +
            /* ⚠️ Per un modulo di STRUMENTI il minimo è `altezza + 15`, non `altezza`:
               i 15 sono lo scarto già misurato nel token `--mn-h-modulo` (130
               dichiarati = 145 reali). Senza, un box con poche voci si fermava a
               130 mentre i vicini stavano a 145 — disuniforme proprio nella riga
               che deve essere modulare (misurato su «Modalità» dopo che le sue voci
               si sono affiancate: il contenuto non arrivava più a 145). */
            (m.altezza
                ? 'min-height:' + (parseInt(m.altezza, 10) + (haStrumenti(m) ? 15 : 0)) + 'px;'
                : '') +
            /* ⚠️ Un modulo di STRUMENTI non può CRESCERE: le voci che accoglie sono
               elementi veri e in numero deciso da chi compone, e col solo
               `min-height` il riquadro arrivava a 365px sfondando la modularità
               della griglia (misurato con cinque voci). Con un tetto, il corpo
               scorre e chi compone vede subito che quel riquadro è pieno.
               Il tetto è `altezza + 15`, e i 15 sono lo STESSO scarto già misurato
               nel token `--mn-h-modulo`: un modulo che dichiara 130 viene alto 145.
               Così un box di strumenti pesa esattamente come i vicini — che è il
               punto — e se ne dichiara 300 il tetto sale a 315.
               ⚠️ `height` fisso non andava: include il padding, quindi il modulo
               veniva 130 contro i 145 dei vicini (misurato). Col `+36` del padding
               pieno veniva 166: sempre fuori. Il numero giusto è lo scarto, non il
               padding. */
            /* Un modulo di strumenti senza `altezza` dichiarata prende comunque il
               tetto di UN modulo: senza, FOCUS con cinque strumenti dentro arrivava
               a 529px (misurato) e la griglia non era più modulare. Chi vuole un box
               più alto lo dichiara. */
            (haStrumenti(m) && !puoCrescere(m)
                ? 'max-height:' + (m.altezza ? parseInt(m.altezza, 10) + 15 : 145) + 'px;' : '');
        /* I controlli granulari (disposizione delle voci, colonna delle etichette,
           colori dei bottoni interni) arrivano da `presentazione()`, che sta nel
           dato: l'anteprima dell'officina chiama la STESSA funzione, così il banco
           non può divergere dal prodotto. Emette solo ciò che è stato scelto —
           il resto resta al fallback del foglio. */
        var P = B.presentazione ? B.presentazione(m) : { vars: '', attr: '' };
        return ' style="' + css + P.vars + '"' + P.attr;
    }

    function haStrumenti(m) {
        var B = window.MappAIBento;
        if (!B) return false;
        return B.vociDi(m).some(function (v) { return v.base && v.base.tipo === 'strumento'; });
    }

    /* Un modulo che contiene una voce `cresce` (le fonti caricate) NON prende il
       tetto dei moduli-strumento: deve poter salire fino alle 30 righe di un testo
       incollato. Per questo la sua riga sta in fondo al bento. */
    function puoCrescere(m) {
        var B = window.MappAIBento;
        if (!B) return false;
        return B.vociDi(m).some(function (v) { return v.base && v.base.cresce; });
    }

    /* ⚠️ La classe destinataria può NON essere nel bento (è la scelta del 3/8:
       il contesto vive nel chip dell'header, e ripeterlo qui sarebbe la stessa
       informazione in due posti). Ma `_readConfig` cerca comunque `mp-class`:
       senza, `classId` resta vuoto e i materiali non finiscono nella cartella
       della classe. Quindi il campo si monta lo stesso, NASCOSTO, col valore del
       contesto attivo — la config resta vera e l'interfaccia non ripete niente. */
    /* ⚠️ Se «Adatta alla classe» non è nel bento, la taratura della classe
       attiva si applica LO STESSO: la spunta si monta nascosta e accesa.
       Scelta di Giacomo (4/8): chi ha assegnato un preset e delle note a una
       classe le ha già decise una volta — richiedergliele a ogni generazione
       vorrebbe dire che quella configurazione non conta. Senza radio dell'ambito
       la pipeline usa «Entrambi» (mappa + materiali), che è il suo default. */
    function adattaNascosta(moduli) {
        var B = window.MappAIBento;
        var montata = moduli.some(function (m) {
            return m.master === 'mp-adapt-on' ||
                B.vociDi(m).some(function (v) { return v.id === 'mp-adapt-on'; });
        });
        if (montata) return '';
        return '<input type="checkbox" id="mp-adapt-on" checked hidden>';
    }

    function classeNascosta(moduli) {
        var B = window.MappAIBento;
        var montata = moduli.some(function (m) {
            return B.vociDi(m).some(function (v) { return v.id === 'mp-class'; });
        });
        if (montata) return '';
        var id = '';
        try { var CL = window.MappAIClasses; id = (CL && CL.activeId && CL.activeId()) || ''; } catch (e) { }
        return '<input type="hidden" id="mp-class" value="' + esc(id) + '">';
    }

    /* ⚠️ I check «generici» (Quiz e flashcard · Fogli nodi) non stanno più a
       schermo: spuntare «Scelta multipla» dice già che i quiz si generano, e una
       conferma in più non è una decisione in più. Ma `_readConfig()` li cerca —
       e deve continuare a essere l'unico posto che legge la configurazione.
       Quindi si montano NASCOSTI e `derivaMaster()` li accende in base ai figli:
       la pipeline non cambia di una riga, e il modale storico (veste spenta)
       resta identico. Quali master e da quali figli lo dice `MappAIBento`. */
    function masterNascosti(moduli) {
        var B = window.MappAIBento;
        if (!B || !B.mastersDerivati) return '';
        return B.mastersDerivati(moduli).map(function (d) {
            return '<input type="checkbox" id="' + esc(d.id) + '" hidden>';
        }).join('');
    }

    function derivaMaster() {
        var B = window.MappAIBento;
        if (!B || !B.mastersDerivati) return;
        B.mastersDerivati(comp() || []).forEach(function (d) {
            var m = document.getElementById(d.id);
            if (!m) return;
            m.checked = d.da.some(function (id) {
                var e = document.getElementById(id);
                return !!(e && e.checked);
            });
        });
    }

    /* Riempie i posti lasciati da `pezzo()` con gli elementi VERI. Sposta, non
       clona: un toggle clonato è un secondo controllo per lo stesso stato.
       ⚠️ L'elemento esce dal suo posto storico anche nella vista piena — una casa
       sola per ogni controllo. Se il selettore non trova niente (markup cambiato,
       modulo non caricato) il posto resta con la sua etichetta, così nel banco si
       vede che quella voce è montata ma non ha trovato il suo pezzo. */
    function spostaStrumenti(radice) {
        var posti = (radice || document).querySelectorAll('.mn-str[data-sposta]');
        for (var i = 0; i < posti.length; i++) {
            var posto = posti[i];
            var sel = posto.getAttribute('data-sposta');
            if (!sel || posto.querySelector('*:not(.mn-str__att)')) continue;
            var el = null;
            try { el = document.querySelector(sel); } catch (e) { el = null; }
            if (!el || posto.contains(el)) continue;
            el.classList.add('mn-spostato');
            posto.appendChild(el);
            posto.classList.add('mn-str--pieno');
        }
    }

    /* ── I posti che RACCOLGONO (5/8) ────────────────────────────────────────
       Un posto normale accoglie un elemento che c'è già: lo si sposta una volta e
       finisce lì. Il testo libero no — la sua riga nasce quando si preme «Testo»,
       cioè dopo, e più volte. Quindi il posto dichiara che cosa raccoglie (un tipo
       di campo) e questa funzione, chiamata a ogni cambio delle fonti, gli porta le
       righe che gli spettano.
       Perché non lasciarle nell'elenco: là una riga è alta 32px e la textarea è
       l'unico posto della pagina dove si SCRIVE. Sono due gesti diversi. */
    function raccogliRighe() {
        var posti = document.querySelectorAll('#mn-bento .mn-str[data-raccoglie]');
        for (var i = 0; i < posti.length; i++) {
            var posto = posti[i], campo = posto.getAttribute('data-raccoglie');
            if (!campo) continue;
            var righe = document.querySelectorAll('.source-entry');
            for (var j = 0; j < righe.length; j++) {
                if (!righe[j].querySelector(campo)) continue;
                if (posto.contains(righe[j])) continue;
                righe[j].classList.add('mn-spostato');
                posto.appendChild(righe[j]);
                /* ⚠️ Via il segnaposto «Incolla qui i tuoi appunti…» (5/8, richiesta
                   di Giacomo): qui il campo bianco È l'invito, e la frase dentro
                   sarebbe la terza volta che si dice la stessa cosa (il bottone
                   «Testo», il titolo del box, il segnaposto). Si svuota SOLO la
                   copia che sta nel bento e si conserva l'originale: il campo è lo
                   stesso della UI storica, dove il segnaposto ha ancora senso. */
                var ta = righe[j].querySelector('textarea');
                if (ta && ta.placeholder) { ta.dataset.ph = ta.placeholder; ta.placeholder = ''; }
            }
            posto.classList.toggle('mn-str--pieno', !!posto.querySelector('.source-entry'));
        }
    }

    /* ── I contenitori RESIDUI del form ──────────────────────────────────────
       Quando uno strumento viene spostato nel bento, il contenitore che lo ospitava
       resta nel form: vuoto, ma vivo. In vista compatta non si vede (lo spegne il
       blocco dei nascondimenti), ma **uscendo** dalla vista compatta ricompare — e
       il mega-bento scende di 364px (misurato) portandosi dietro tutto.
       Qui si spengono i contenitori che non hanno più NIENTE di visibile dentro. È
       una condizione sul contenuto, non un elenco di id: se un domani una voce non
       viene montata nel bento, il suo contenitore ha ancora qualcosa da mostrare e
       resta a schermo, dove serve. */
    var RESIDUI = ['step-3-container', 'step-3-head', 'step-4-head', 'step-focus-container',
        'step-gen-settings-container', 'gen-settings-box', 'step-l1-wrap'];
    function svuotaContenitoriResidui() {
        RESIDUI.forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            /* ⚠️ Un contenitore che è stato MONTATO nel bento non è un residuo: è
               il pezzo. `#step-l1-wrap` sta in questa lista (era il contenitore da
               spegnere) ed è anche la voce «Macro-aree a mano» — spegnendolo, la
               voce restava a schermo con la sua etichetta e niente accanto: montata
               e inerte, che è il peggio dei due mondi. */
            if (el.closest('#mn-bento')) { el.style.removeProperty('display'); return; }
            /* «visibile» = un figlio che occupa spazio. Si guarda il DOM, non una
               lista di eccezioni: l'unica cosa che conta è se è rimasto qualcosa. */
            var vivo = false;
            var figli = el.querySelectorAll('*');
            for (var i = 0; i < figli.length; i++) {
                var f = figli[i];
                if (f.classList.contains('mn-spostato')) continue;
                if (f.offsetWidth > 0 || f.offsetHeight > 0) { vivo = true; break; }
            }
            if (vivo) el.style.removeProperty('display');
            else el.style.setProperty('display', 'none', 'important');
        });
    }

    /* ── I DEFAULT del bento (5/8, scelti da Giacomo) ─────────────────────────
       Adattiva · Multi · Profondità automatica ON · Adatta ON · KG A.
       ⚠️ Si scrive SOLO ciò che l'utente non ha mai scelto: `mappai_mm_logic`,
       `mappai_auto_depth` e `mappai_generation_pipeline` persistono, e riscriverli
       a ogni apertura cancellerebbe la scelta della sessione precedente — un
       default è il punto di partenza, non una decisione ripetuta ogni volta.
       «Adatta» invece non persiste da nessuna parte (vive in `MappAITune`), quindi
       va acceso ogni volta: è quello il suo default. */
    var CHIAVE_DEFAULT = 'mappai_bento_default_v1';
    function defaultDelBento() {
        /* ⚠️ Non basta guardare se la chiave è vuota: `mappai-storage-lang.js` al
           boot SCRIVE già un default suo (la pipeline a «B»), quindi quando questo
           codice gira non esiste più niente di «mai scelto». Serve un marcatore
           proprio: i default del bento si applicano UNA volta, poi la scelta
           dell'utente comanda per sempre. */
        var primaVolta = false;
        try { primaVolta = localStorage.getItem(CHIAVE_DEFAULT) == null; } catch (e) { }
        try {
            if (primaVolta) {
                if (window.setMMLogic) window.setMMLogic('triage', true);
                if (window.setAutoDepth) window.setAutoDepth(true);
                /* ⚠️ La pipeline KG resta al suo default storico (**B**, MappAI
                   classico), che `mappai-storage-lang.js` scrive già al boot:
                   qui non si tocca. Scelta di Giacomo, 5/8. */
                try { localStorage.setItem(CHIAVE_DEFAULT, '1'); } catch (e) { }
            }
            if (window.setMultiPassMode) window.setMultiPassMode(true, true);
            /* ⚠️ «Adatta» è DISABILITATA finché non c'è un contesto attivo: senza
               una classe o un allievo non esiste un livello a cui adattare, e la
               riga lo dice («nessun contesto attivo»). Accenderla lo stesso
               produrrebbe una spunta accesa che non fa niente — `levelBlock()`
               tornerebbe vuoto. Si accende quando si può, e `sincronizzaBento`
               ripassa a ogni scelta nel box giallo. */
            var lt = document.getElementById('level-tune-toggle');
            if (lt && !lt.disabled && !lt.checked) {
                lt.checked = true;
                /* ⚠️ Impostare `.checked` da JS NON scatena `onchange`: senza questa
                   riga la spunta sarebbe accesa a schermo e `MappAITune.levelArmed`
                   resterebbe falso — la taratura non finirebbe mai nel prompt. È lo
                   stesso difetto già trovato nella pipeline il 3/8. */
                if (window.MappAITune && window.MappAITune.armLevel) window.MappAITune.armLevel();
            }
        } catch (e) { }
    }

    function montaBento() {
        var host = document.getElementById('generation-details-card');
        var B = window.MappAIBento;
        if (!host || !B || document.getElementById('mn-bento')) return;

        var moduli = comp();
        /* il validatore parla anche qui, in console: una composizione che perde
           una voce non deve poterlo fare in silenzio */
        try {
            var esito = B.valida(moduli);
            if (esito.errori.length) console.warn('[Bento] errori di composizione:', esito.errori);
            if (esito.fuori.length) console.warn('[Bento] voci non montate:', esito.fuori.join(', '));
        } catch (e) { }

        var b = document.createElement('div');
        b.id = 'mn-bento';
        b.innerHTML = moduli.map(function (m) {
            /* ⚠️ La condizione è `soloAzioni`, non più `m.nuda`: dal 5/8 `nuda`
               vuol dire «senza riquadro», e i quattro moduli della prima sezione
               sono nudi ma NON sono bottoni. Il modulo di sole azioni resta il
               bottone, e lo si deduce dal contenuto. */
            if (B.soloAzioni(m)) {
                return B.vociDi(m).map(function (v) {
                    /* title + aria-label: l'etichetta si rivela solo al passaggio,
                       quindi il nome del comando non può dipendere dal mouse */
                    return '<button type="button" id="' + esc(v.id) + '" class="mn-card ' +
                        (v.base.primaria ? 'mn-card--genera' : 'mn-card--azione') + '"' +
                        ' title="' + esc(v.et) + '" aria-label="' + esc(v.et) + '"' + tip(v) +
                        stileAttr(m) + '>' +
                        '<i data-lucide="' + (v.base.primaria ? 'package' : 'git-merge') + '"></i>' +
                        '<span>' + esc(v.et) + '</span></button>';
                }).join('');
            }
            var corpo = B.vociDi(m).map(function (v) { return pezzo(v); }).join('');
            var testata;
            if (m.master) {
                var vm = B.voce(m.master);
                testata = '<label class="mn-card__t mn-card__t--on"><input type="checkbox" id="' + esc(m.master) + '" checked>' +
                    (m.icona ? '<i data-lucide="' + esc(m.icona) + '"></i>' : '') +
                    '<span>' + esc(m.titolo || (vm ? vm.et : '')) + '</span></label>';
            } else {
                testata = '<div class="mn-card__t">' + (m.icona ? '<i data-lucide="' + esc(m.icona) + '"></i>' : '') +
                    '<span>' + esc(m.titolo || '') + '</span></div>';
            }
            /* il corpo di una sezione che si accende porta l'id che `_syncSections`
               cerca per nasconderlo: <master senza «-on»> + «-body» */
            var idCorpo = m.master ? ' id="' + esc(m.master.replace(/-on$/, '')) + '-body"' : '';
            /* lo stato vuoto del box che cresce: senza fonti dice a che serve,
               invece di essere un rettangolo scuro di cui non si capisce niente.
               Sta in un attributo perché il testo lo mostra il CSS (`::after`), che
               non può leggere una stringa da nessun'altra parte. */
            var vuoto = B.vociDi(m).map(function (v) { return v.base && v.base.vuoto; }).filter(Boolean)[0];
            if (puoCrescere(m) || vuoto) idCorpo += ' data-vuoto="' +
                esc(vuoto || t('mn_input_vuoto', 'Scegli una fonte qui a sinistra: il campo per incollare il link o il testo compare qui.')) + '"';
            /* Le classi dicono CHE COS'È il modulo, e il foglio fa il resto:
               `--extra` = compare solo nella vista estesa (fondo scuro, §nascondibile)
               `--str`   = contiene strumenti (righe compatte, corpo che scorre)
               `--cresce`= può salire fino alle 30 righe di un testo incollato */
            var extra = (B.nascondibile && B.nascondibile(m)) ? ' mn-card--extra' : '';
            var str = haStrumenti(m) ? ' mn-card--str' : '';
            var cre = puoCrescere(m) ? ' mn-card--cresce' : '';
            /* `--nuda`: il modulo È il pezzo. Niente fondo, niente imballaggio,
               nessuna compattazione di ciò che accoglie — il bottone che carica i
               documenti e l'elenco delle fonti la loro veste ce l'hanno già. */
            var nuda = m.nuda ? ' mn-card--nuda' : '';
            return '<div class="mn-card' + extra + str + cre + nuda + '"' + stileAttr(m) + '>' +
                testata + '<div class="mn-card__b"' + idCorpo + '>' + corpo + '</div></div>';
        }).join('') + classeNascosta(moduli) + adattaNascosta(moduli) + masterNascosti(moduli);

        host.appendChild(b);
        raccogliRighe();
        /* dopo lo spostamento: i controlli sono nel bento e i loro `sync*` li
           ridipingono lì dentro */
        setTimeout(defaultDelBento, 0);
        /* prima le icone: spostare un elemento non ne cambia il contenuto, ma il
           posto va riempito appena il bento è nel DOM, o si vedrebbe un modulo con
           la sola etichetta della voce */
        spostaStrumenti(b);
        svuotaContenitoriResidui();
        icone();
        /* Rete sulle icone: `safeCreateIcons` converte gli <i data-lucide> in
           <svg>, ma se lucide non è ancora pronto quando il bento si monta gli
           <i> restano lì, muti. Il bento si monta UNA volta sola, quindi un
           secondo passaggio differito è sicuro (nessun osservatore da innescare). */
        setTimeout(function () {
            if (b.querySelector('i[data-lucide]')) icone();
        }, 400);

        b.addEventListener('click', function (ev) {
            var el = ev.target.closest ? ev.target.closest('[data-preset], #mn-genera, #mn-solo-mappa') : null;
            if (!el) return;
            var P = window.MappAIPipeline;
            if (el.id === 'mn-genera') {
                /* rete: un `<button disabled>` non emette click, ma il gate non
                   deve dipendere da quel dettaglio del browser */
                var st = statoContesto();
                if (!st.ok) { if (window.showToast) window.showToast(st.motivo, 'warning'); return; }
                /* la faccia del bottone e quello che fa premendolo devono essere la
                   stessa cosa: entrambe leggono `soloMappa()` */
                if (soloMappa()) { if (window.startGeneration) window.startGeneration(); return; }
                if (P && P._startFromModal) P._startFromModal();
                return;
            }
            if (el.id === 'mn-solo-mappa') { if (window.startGeneration) window.startGeneration(); return; }
            var a = el.getAttribute('data-preset');
            if (!P) return;
            if (a === 'applica' && P._applyPreset) P._applyPreset();
            else if (a === 'salva' && P._savePreset) P._savePreset();
            else if (a === 'elimina' && P._deletePreset) P._deletePreset();
        });
        b.addEventListener('change', function (ev) {
            var id = ev.target && ev.target.id;
            /* Scrivere il contesto SOLO da un gesto vero. Farlo anche al
               montaggio significherebbe un toast «Classe attiva: …» a ogni
               apertura della pagina, per una scelta che nessuno ha fatto ora. */
            if (id === 'mp-chi' || id === 'mp-disc') scriviContesto(id);
            sincronizzaBento();
        });
        b.addEventListener('input', ristima);
        sincronizzaBento();
    }

    /* ── Il contesto scelto nel bento diventa il contesto ATTIVO dell'app ─────
       Non si tiene una copia locale: classe, allievo e materia vivono già in
       localStorage e li leggono la taratura dei prompt, la cartella del vault e
       la sezione Insegna. Scriverli qui è ciò che rende il box giallo la fonte
       del contesto in COSTRUISCI, invece di una terza verità accanto al chip. */
    function scriviContesto(sorgente) {
        var CL = window.MappAIClasses;
        if (!CL) return;
        var chi = document.getElementById('mp-chi');
        var val = chi ? String(chi.value || '') : '';
        try {
            if (sorgente === 'mp-chi') {
                if (val.indexOf('s:') === 0) {
                    var p = elencoAllievi()[parseInt(val.slice(2), 10)];
                    if (CL.setActiveStudent) CL.setActiveStudent(p || null);
                } else if (val.indexOf('c:') === 0) {
                    if (CL.setActiveStudent) CL.setActiveStudent(null);
                    if (CL.setActive) CL.setActive(val.slice(2));
                } else {
                    if (CL.setActiveStudent) CL.setActiveStudent(null);
                    if (CL.setActive) CL.setActive('');
                }
                /* cambiando destinatario la materia resta solo se lui la fa:
                   è la stessa regola del chip e di «Assegna classe e disciplina» */
                var mat = materieDi(val), att = CL.activeDiscipline ? CL.activeDiscipline() : '';
                if (att && mat.indexOf(att) < 0 && CL.setActiveDiscipline) CL.setActiveDiscipline('');
            } else {
                var d = document.getElementById('mp-disc');
                if (CL.setActiveDiscipline) CL.setActiveDiscipline(d ? String(d.value || '') : '');
            }
        } catch (e) { }
    }

    /* ── IL BOX GIALLO SEGUE IL CONTESTO, ANCHE SE CAMBIA ALTROVE (11/8) ──────
       Le opzioni di «Chi» le scrive `opzioniChi()` al MONTAGGIO, con la scelta
       corrente già selezionata: se il contesto cambia dopo — dalla console
       ELABORA o INSEGNA, dalla Cabina, da «Assegna classe e disciplina» — il
       box giallo resta indietro e la generazione userebbe un destinatario
       diverso da quello che il docente crede.
       Il difetto è preesistente ma era MASCHERATO dal chip in alto, che quel
       cambio lo mostrava; togliendo chip e briciole da CREA (11/8) sarebbe
       diventato invisibile — cioè peggiore. Qui il box si riallinea sullo
       stesso evento che tutti gli altri ascoltano.
       ⚠️ Guardia anti-rientro: scegliendo NEL box giallo si chiama `setActive`,
       che emette lo stesso evento — senza la guardia si ricostruirebbe il
       select mentre l'utente ci sta dentro. */
    var _riallineo = false;
    function riallineaContesto() {
        if (_riallineo) return;
        var chi = document.getElementById('mp-chi');
        if (!chi) return;                     /* box giallo non montato: niente da fare */
        _riallineo = true;
        try {
            /* si ricostruiscono anche le OPZIONI: nel frattempo può essere nata
               una classe nuova (o esserne sparita una) */
            chi.innerHTML = opzioniChi();
            sincronizzaBento();
        } catch (e) { }
        _riallineo = false;
    }

    /* Le materie dipendono da «Chi»: senza un destinatario non c'è nulla da
       proporre, e un campo grigio senza spiegazione lascia indovinare. */
    function sincronizzaContesto() {
        var chi = document.getElementById('mp-chi');
        var disc = document.getElementById('mp-disc');
        var cls = document.getElementById('mp-class');
        if (!chi) return;
        var val = String(chi.value || '');
        /* `mp-class` resta il campo che la pipeline legge: un allievo NON è una
           classe, quindi lì il valore si azzera e la mappa finisce nella sua
           cartella (esclusione mutua, già nel modello). */
        if (cls) cls.value = val.indexOf('c:') === 0 ? val.slice(2) : '';
        if (!disc) return;
        var mat = materieDi(val);
        var CL = window.MappAIClasses;
        var att = '';
        try { att = (CL && CL.activeDiscipline) ? CL.activeDiscipline() : ''; } catch (e) { }
        if (!val) {
            disc.innerHTML = '<option value="">' + esc(t('mn_disc_prima', '— scegli prima «Chi» —')) + '</option>';
            disc.disabled = true;
            return;
        }
        if (!mat.length) {
            disc.innerHTML = '<option value="">' + esc(t('mn_disc_nessuna', '— nessuna materia nel profilo —')) + '</option>';
            disc.disabled = true;
            return;
        }
        disc.disabled = false;
        /* una materia sola non è una scelta: si preseleziona, così il gate si apre
           senza chiedere di confermare l'unica risposta possibile */
        var scelto = mat.indexOf(att) >= 0 ? att : (mat.length === 1 ? mat[0] : '');
        disc.innerHTML = '<option value="">' + esc(t('mn_disc_vuoto', '— scegli —')) + '</option>' +
            mat.map(function (d) {
                return '<option value="' + esc(d) + '"' + (d === scelto ? ' selected' : '') + '>' + esc(d) + '</option>';
            }).join('');
        if (scelto && scelto !== att) { try { if (CL && CL.setActiveDiscipline) CL.setActiveDiscipline(scelto); } catch (e) { } }
    }

    /* ── Il GATE di «Genera materiali» ────────────────────────────────────────
       Serve (classe + materia) oppure (allievo): sono le due forme complete di
       destinatario. Con un allievo la materia è facoltativa — la sua cartella non
       ha il livello disciplina, quindi non c'è niente da decidere.
       Perché è un gate e non un avviso al click: la generazione partiva e si
       fermava a metà su un contesto incompleto, senza dire dove. Meglio non farla
       partire, e dire nel bottone stesso che cosa manca. */
    function statoContesto() {
        var chi = document.getElementById('mp-chi');
        var B = window.MappAIBento;
        if (!chi || !B || !B.gate) return { ok: true, motivo: '' };   // box giallo non montato
        var val = String(chi.value || '');
        var disc = document.getElementById('mp-disc');
        var r = B.gate({
            chi: val,
            materia: disc ? disc.value : '',
            /* «quante materie si possono proporre»: se zero, la materia non è
               richiedibile e il gate non la pretende (profilo senza materie) */
            materieDisponibili: materieDi(val).length
        });
        if (r.ok) return { ok: true, motivo: '' };
        return {
            ok: false,
            motivo: r.manca === 'chi'
                ? t('mn_gate_chi', 'Scegli prima CHI: una classe o un allievo')
                : t('mn_gate_cosa', 'Scegli anche COSA: la materia della classe')
        };
    }

    /* ── Un bottone, DUE identità ─────────────────────────────────────────────
       Il modulo blu «Genera Mappa» non esiste più nella composizione (5/8): è
       questo stesso bottone che cambia faccia in base a quello che hai chiesto.
       Tre stati, e ognuno dice la verità su cosa succederà premendolo:
         contesto incompleto            → spento, col motivo
         contesto + almeno un materiale → VERDE  «Genera materiali» → pipeline
         contesto + nessun materiale    → BLU    «Genera Mappa»     → solo mappa
       Due bottoni affiancati costringevano a scegliere fra due cose di cui una
       era sempre sbagliata; un bottone che si adatta non ha quel problema — e
       «nessun materiale spuntato» non è più un errore da spiegare, è una scelta.
       ⚠️ «C'è un materiale?» lo chiede alla pipeline (`_hasOutputNow`): il bento
       non deve sapere quali campi sono materiali, o alla prossima aggiunta le due
       liste divergerebbero (è appena successo con la catena dei perché). */
    function soloMappa() {
        var P = window.MappAIPipeline;
        if (!P || !P._hasOutputNow) return false;
        try { return !P._hasOutputNow(); } catch (e) { return false; }
    }

    function aggiornaGate() {
        var b = document.getElementById('mn-genera');
        if (!b) return;
        var st = statoContesto();
        var mappa = st.ok && soloMappa();
        b.disabled = !st.ok;
        b.classList.toggle('mn-card--spento', !st.ok);
        b.classList.toggle('mn-card--mappa', mappa);
        b.setAttribute('aria-disabled', st.ok ? 'false' : 'true');
        var nome = mappa ? t('mn_genera_mappa', 'Genera Mappa') : t('mp_generate', 'Genera materiali');
        var etichetta = b.querySelector('span');
        if (etichetta) etichetta.textContent = nome;
        var glifo = b.querySelector('svg, i[data-lucide]');
        var icona = mappa ? 'git-merge' : 'package';
        if (glifo && glifo.getAttribute('data-lucide') !== icona) {
            /* `safeCreateIcons` converte gli <i> in <svg>: per cambiare glifo si
               rimette un <i> e si richiama la conversione. Solo quando l'icona
               cambia davvero — è l'hub globale, e chiamarlo a ogni spunta
               riscriverebbe le icone di tutta la pagina (fu il blocco del 3/8). */
            glifo.outerHTML = '<i data-lucide="' + icona + '"></i>';
            icone();
        }
        /* il motivo va nel nome accessibile, non solo nel fumetto: l'etichetta di
           questo bottone si rivela al passaggio, quindi chi non usa il mouse non
           avrebbe modo di sapere perché è spento */
        b.title = st.ok
            ? (mappa ? nome + ' — ' + t('mn_solo_mappa_tip', 'nessun materiale spuntato: genera la sola mappa') : nome)
            : nome + ' — ' + st.motivo;
        b.setAttribute('aria-label', b.title);
        var box = document.getElementById('mn-bento');
        if (box) box.classList.toggle('mn-manca-ctx', !st.ok);
    }

    function sincronizzaBento() {
        var on = function (id) { var e = document.getElementById(id); return e ? e.checked : false; };
        /* ⚠️ Il corpo di una sezione si nasconde solo se il master è a SCHERMO:
           un master derivato è nascosto e si accende dai figli, quindi spegnere il
           corpo che li contiene li renderebbe irraggiungibili — la sezione non si
           potrebbe più riaccendere. */
        var mostra = function (idCorpo, idMaster) {
            var e = document.getElementById(idCorpo), m = document.getElementById(idMaster);
            if (!e || !m || m.hidden) return;
            e.style.display = m.checked ? '' : 'none';
        };
        sincronizzaContesto();
        /* scegliendo «Chi» la riga «Adatta» si riabilita: il suo default (acceso)
           va applicato allora, non solo al montaggio */
        defaultDelBento();
        derivaMaster();
        mostra('mp-quiz-body', 'mp-quiz-on');
        mostra('mp-ns-body', 'mp-ns-on');
        mostra('mp-syn-body', 'mp-syn-on');
        mostra('mp-adapt-body', 'mp-adapt-on');
        aggiornaGate();
        ristima();
    }

    function ristima() {
        if (window.MappAIPipeline && window.MappAIPipeline._reestimate) window.MappAIPipeline._reestimate();
    }

    /* ═══ montaggio ═══════════════════════════════════════════════════════ */

    function avvio() {
        if (!attivo()) return;
        montaTabellaFile();
        apriSubitoIlFinder();
        impaginaGenere();
        impagina('#setup-form .source-buttons-container', '#mn-files', 'mn-riga-fonti');
        impagina('#setup-form .mode-buttons-container', '#mn-genere-dx', 'mn-riga-genere');
        /* I due bottoni chiamano già `setMode`, quindi al cambio non serve nessun
           aggancio: basta NORMALIZZARE lo stato una volta, perché all'avvio il tema
           poteva restare nascosto (qualcuno mette `hidden` dopo il montaggio).
           La seconda chiamata differita è la rete per quel «dopo»: `setMode` è
           idempotente, quindi eseguirla due volte non costa niente. */
        sincronizzaGenere();
        setTimeout(sincronizzaGenere, 300);
        /* La combo SHIFT+CTRL+L,K,J,H cambia vista: i contenitori residui del form
           tornerebbero a vista nella estesa, spingendo giù il mega-bento. Si guarda
           la classe su <html>, che è il segnale vero (nessun evento da attendere). */
        if (window.MutationObserver) {
            new MutationObserver(function () { svuotaContenitoriResidui(); })
                .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        }
        /* la prima passata di `disegnaTabella` avviene dentro `montaTabellaFile`,
           cioè PRIMA che la riga a due colonne esista: senza questa seconda
           chiamata la colonna unica non verrebbe mai segnalata all'avvio. */
        disegnaTabella();
        montaBento();
        /* il box giallo si riallinea quando il contesto cambia da un'altra
           superficie (console, Cabina, «Assegna classe e disciplina»).
           ⚠️ DUE eventi, non uno: `setActive` annuncia `…-class-changed` e
           `setActiveDiscipline` annuncia `…-discipline-changed`. Ascoltandone
           uno solo, «Chi» seguiva e la materia restava indietro — misurato
           cambiando classe e materia dalla console. */
        document.addEventListener('mappai-active-class-changed', riallineaContesto);
        document.addEventListener('mappai-active-discipline-changed', riallineaContesto);
        /* ⚠️ DOPO `montaBento`: il preset scrive nei campi della pipeline, e
           quei campi esistono solo quando il bento li ha montati.
           Dall'11/8 i quattro box delle opzioni stanno nella vista estesa, e la
           configurazione di partenza non può più venire dalle spunte del markup
           — nessuno le vede. La dice il preset «Default», che si crea da sé, si
           applica una volta e resta modificabile da chi apre la vista estesa. */
        try { if (window.MappAIPipeline && MappAIPipeline.assicuraPresetDefault) MappAIPipeline.assicuraPresetDefault(); } catch (e) { }
        /* la landing può comparire: il mega-bento c'è. Prima di questo punto si
           vedrebbe il form storico — è il lampo che Giacomo ha segnalato (5/8).
           Le due reti nello script di boot restano: se questa riga non si
           raggiunge, la pagina compare lo stesso. */
        try { if (window.__mnBootFine) window.__mnBootFine(); } catch (e) { }

        /* la tabella si ridisegna quando le fonti cambiano: le righe si
           aggiungono costruendo HTML (non c'è una funzione di render da cui
           passare), quindi il segnale è il DOM */
        var cont = document.getElementById('sources-container');
        if (cont && window.MutationObserver) {
            new MutationObserver(disegnaTabella).observe(cont, { childList: true, subtree: true });
            cont.addEventListener('change', function () { setTimeout(disegnaTabella, 0); });
        }
        /* ⚠️ Delegato sul DOCUMENTO, non sul contenitore: la riga del testo libero
           vive nel suo box, fuori da `#sources-container`, quindi un ascolto legato
           al contenitore non sentirebbe mai quello che ci si scrive dentro — e
           l'inventario resterebbe fermo a «0 parole». */
        document.addEventListener('input', function (ev) {
            var t = ev.target;
            if (!t || !t.closest || !t.closest('.source-entry')) return;
            clearTimeout(avvio._t);
            avvio._t = setTimeout(disegnaTabella, 250);
        });
        /* il cestino della tabella toglie la fonte vera */
        document.addEventListener('click', function (ev) {
            var b = ev.target.closest && ev.target.closest('#mn-files .mn-togli');
            if (!b) return;
            if (window.removeSource) window.removeSource(b.getAttribute('data-src'));
            setTimeout(disegnaTabella, 0);
        });
    }

    window.MappAICostruisci = {
        avvio: avvio, disegnaTabella: disegnaTabella, montaBento: montaBento,
        sincronizzaGenere: sincronizzaGenere, aggiornaGate: aggiornaGate
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvio);
    else avvio();
}());
