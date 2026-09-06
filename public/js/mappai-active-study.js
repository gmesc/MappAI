/*
 * mappai-active-study.js — il LAUNCHER delle attività di studio
 * -------------------------------------------------------------
 * Una schermata sola da cui si aprono le attività, le viste e gli strumenti.
 *
 * ⚠️ Qui dentro NON c'è più nessuna modalità. Fino al 20/8/2026 il file conteneva
 * sette modalità che smontavano il grafo sul canvas (Costruisci mappa ·
 * Ricostruisci le gerarchie · Richiamo · Riempi le descrizioni · Trova l'intruso ·
 * Verbi delle relazioni · Ordina la sequenza) più il Cloze: 1832 righe, uno
 * snapshot profondo della mappa, una patch di `renderGraph`, e una macchina di
 * sicurezza (`emergencyExit`) nata da un guasto vero — una gerarchia persa per
 * sempre perché lo stato smontato era finito in `localStorage`.
 * Sono in PENSIONE, tutte insieme (fase F del piano «Domande a scelta»): al loro
 * posto ci sono attività che **leggono i materiali già nel vault** invece di
 * manomettere la mappa. La storia resta in git.
 *
 * Che cosa apre, oggi:
 *   · Domande a scelta · Quiz a scelta  → `MappAISceltaAttivita.apriInApp`
 *     (leggono i fogli e i set del vault; card spenta col motivo se non ce ne sono)
 *   · Palazzo della Memoria             → `MappAIPalace.start`
 *   · Heat map padronanza · Mappa lavoro (viste: accendono/spengono)
 *   · Cosa studiare ora · I tuoi progressi (strumenti)
 *
 * 📌 Conseguenza diretta della pensione: **nessuna attività tocca più il canvas**,
 * quindi non c'è più niente da salvare o ripristinare. `session`, `enter`,
 * `exit`, `handleNodeClick` ed `emergencyExit` non esistono più, e con loro sono
 * cadute le guardie che sei moduli tenevano per non litigare con una modalità
 * attiva (`ui-canvas`, `vault-io`, `vault-manager`, `storage-lang`,
 * `mastery-view`, `effort-view`).
 *
 * I record già scritti (`sessioni.jsonl`, padronanza) citano `mode: 1..7` e
 * `cloze`: **restano leggibili**. Un record di un'attività pensionata è storia,
 * non un errore — Progressi e Heat map continuano a mostrarli.
 *
 * Caricare in index.html DOPO app.js. Usa: window.t, showToast, safeCreateIcons,
 * MappAISceltaAttivita, MappAIPalace, MappAIMasteryView, MappAIEffortView,
 * MappAIStudyPath, MappAICeleration.
 */
(function () {
    'use strict';

    function S() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }
    function toast(msg, type) { if (window.showToast) window.showToast(msg, type || 'info'); }
    /* ⚠️ `window.t` può non esserci (banco, pagina servita, caricamento a metà):
       l'italiano scritto qui è il ripiego, e senza questa guardia il launcher
       moriva alla prima riga con «window.t is not a function» (inv. 14). */
    function _t(k, f) { try { return (window.t ? window.t(k, f) : f) || f; } catch (e) { return f; } }
    function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
    /* escaping per i testi dentro un attributo (data-tip) */
    function _escAttr(s) { return String(s || '').replace(/"/g, '&quot;'); }

    const ActiveStudy = window.ActiveStudy = {};

    function buildModal(title, bodyHtml, buttons, opts) {
        const overlay = document.createElement('div');
        overlay.className = 'as-modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif';
        const card = document.createElement('div');
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        card.setAttribute('aria-label', title);
        // opts.maxWidth: il launcher usa un formato landscape largo; gli altri modali restano 520px.
        card.style.cssText = 'background:#fff;border-radius:16px;max-width:' + ((opts && opts.maxWidth) || '520px') + ';width:92%;max-height:84vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);padding:22px';
        let btnHtml = '';
        (buttons || []).forEach(b => {
            const style = b.primary
                ? 'background:#4f46e5;color:#fff'
                : 'background:#f1f5f9;color:#334155';
            btnHtml += `<button type="button" id="${b.id}" style="${style};border:0;border-radius:10px;padding:9px 16px;cursor:pointer;font-weight:600;margin-left:8px">${b.label}</button>`;
        });
        // opts.icon: icona Lucide SVG accanto al titolo (mai emoji — richiesta utente 11/7/26)
        const iconHtml = (opts && opts.icon)
            ? `<i data-lucide="${opts.icon}" style="width:22px;height:22px;color:#4f46e5;flex:0 0 auto"></i>` : '';
        card.innerHTML = `<h3 style="display:flex;align-items:center;gap:10px;margin:0 0 14px;font-size:18px;color:#0f172a;font-weight:700">${iconHtml}${escapeHtml(title)}</h3>
            <div>${bodyHtml}</div>
            <div style="display:flex;justify-content:flex-end;margin-top:18px">${btnHtml}</div>`;
        overlay.appendChild(card);
        if (!opts || opts.dismissable !== false) {
            overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        }
        document.body.appendChild(overlay);
        if (window.safeCreateIcons) window.safeCreateIcons();   // renderizza ogni <i data-lucide> di titolo/body
        overlay.remove = function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
        return overlay;
    }

    // ------------------------------------------------------------- launcher
    ActiveStudy.openLauncher = function () {
        const nodes = (S() && S().db && S().db.nodes) || [];
        if (!nodes.length) { toast(_t('tst_as_open_map', 'Apri una mappa per usare lo studio attivo'), 'error'); return; }

        /* Due colonne: a sinistra le ATTIVITÀ (si aprono), a destra le VISTE
           (si accendono) e gli STRUMENTI (letture dei dati che le attività
           scrivono). Prima erano bottoni flottanti sul canvas. */
        const mvOn = !!(window.MappAIMasteryView && window.MappAIMasteryView.active);
        const evOn = !!(window.MappAIEffortView && window.MappAIEffortView.active);
        /* ── Le attività: CONSUMANO i materiali del vault ────────────────────
           Non generano niente: leggono i fogli «Domande aperte» e i set a scelta
           multipla che la mappa ha già prodotto. Se non ce ne sono la card resta
           lì, disabilitata, e dice la strada — mai una card che apre il vuoto. */
        const _SA = window.MappAISceltaAttivita;
        const _saOn = !!(_SA && _SA.attiva());
        /* una lettura sola dell'archivio: `leggiFogli` apre e analizza gli HTML
           dei fogli, e chiamarla per genere la farebbe due volte */
        let _pooli = { open: [], mc: [] };
        try { if (_saOn) _pooli = _SA.pooliPerLauncher(); } catch (e) { /* archivio illeggibile: card spente */ }
        const _nOpen = _pooli.open.length, _nMc = _pooli.mc.length;
        const scelteModes = !_saOn ? [] : [
            { key: 'scelta_open', icon: 'list-checks', ok: true, quante: _nOpen,
              title: _t('as_scelta_open_title', 'Domande a scelta'),
              manca: _t('as_scelta_open_missing', 'Nessun foglio «Domande aperte» per questa mappa: generali da CREA (spunta «Domande aperte» in «Output automatici») o da ELABORA › «Crea un documento».'),
              hint: _t('as_scelta_open_hint', 'Leggi i richiami della mappa e scegli a quali rispondere: alla fine scopri quali tipi di richiamo ti accendono.') },
            { key: 'scelta_mc', icon: 'circle-check-big', ok: true, quante: _nMc,
              title: _t('as_scelta_mc_title', 'Quiz a scelta'),
              manca: _t('as_scelta_mc_missing', 'Nessun set a scelta multipla per questa mappa: generali da CREA (spunta «Scelta multipla» in «Output automatici»).'),
              hint: _t('as_scelta_mc_hint', 'Come «Domande a scelta», ma si risponde scegliendo fra le opzioni: la correzione è immediata.') }
        ];
        const extraModes = [
            { key: 'palace', icon: 'landmark', ok: !!(window.MappAIPalace && window.MappAIPalace.start),
              title: _t('as_palace_title', 'Palazzo della Memoria'),
              hint: _t('as_palace_hint', 'Viaggio per stanze col metodo dei loci.') }
        ];
        const views = [
            { key: 'heatmap', icon: 'target', ok: !!window.MappAIMasteryView, on: mvOn,
              title: _t('as_heatmap_title', 'Heat map padronanza'),
              hint: mvOn ? _t('as_view_on', 'Vista ATTIVA — clicca per spegnere') : _t('as_view_off', 'Vista spenta — clicca per accendere') },
            { key: 'effort', icon: 'flame', ok: !!window.MappAIEffortView, on: evOn,
              title: _t('as_effort_title', 'Mappa lavoro'),
              hint: evOn ? _t('as_view_on', 'Vista ATTIVA — clicca per spegnere') : _t('as_view_off', 'Vista spenta — clicca per accendere') }
        ];
        const tools = [
            { key: 'studypath', icon: 'compass', ok: !!(window.MappAIStudyPath && window.MappAIStudyPath.open),
              title: _t('as_studypath_title', 'Cosa studiare ora'),
              hint: _t('as_studypath_hint', 'Percorso consigliato e ripasso programmato.') },
            { key: 'celeration', icon: 'trending-up', ok: !!(window.MappAICeleration && window.MappAICeleration.open),
              title: _t('as_celeration_title', 'I tuoi progressi nel tempo'),
              hint: _t('as_celeration_hint', 'Grafico di crescita delle tue sessioni (celeration).') }
        ];
        const sectionHeader = txt => `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin:0 0 8px">${txt}</div>`;
        /* ⚠️ Niente numeri sulle card: la scala 1…7 era delle modalità
           pensionate, e con due sole attività un numero prometterebbe un ordine
           che non c'è. `num` resta come parametro per chi lo volesse.
           Le spiegazioni vivono nel fumetto al passaggio (`data-tip`); il testo
           grigio resta SOLO per il motivo di una card spenta — un elemento
           disabilitato non emette eventi mouse, quindi il fumetto non uscirebbe. */
        const extraCard = (x, num) => {
            const dis = x.ok ? '' : (x.mancaMotivo || _t('as_extra_missing', 'Funzione non disponibile.'));
            const activeBorder = x.on ? '#4f46e5' : '#e2e8f0';
            const label = num ? `${num}. ${x.title}` : x.title;
            return `<button type="button" class="as-extra-card" data-extra="${x.key}" ${dis ? 'disabled' : ''} data-tip="${_escAttr(x.hint)}" style="display:flex;gap:12px;align-items:center;width:100%;text-align:left;background:${x.on ? '#eef2ff' : '#fff'};border:1px solid ${activeBorder};border-radius:12px;padding:12px 14px;margin-bottom:8px;cursor:${dis ? 'default' : 'pointer'};transition:border-color .15s;${dis ? 'opacity:.5' : ''}">
                <i data-lucide="${x.icon}" style="width:22px;height:22px;color:#4f46e5;flex:0 0 auto"></i>
                <span><span style="display:block;font-weight:700;color:#0f172a">${label}</span>
                ${dis ? `<span style="display:block;font-size:12.5px;color:#64748b;line-height:1.45;margin-top:2px">${dis}</span>` : ''}</span>
            </button>`;
        };

        // auto-fit: su finestre strette le colonne si impilano da sole.
        const body = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:4px 22px;align-items:start">
            <div>${sectionHeader(_t('as_modes_header', 'Attività di studio'))}${scelteModes.map(x => extraCard(Object.assign({}, x, { ok: x.quante > 0, mancaMotivo: x.manca }))).join('')}${extraModes.map(x => extraCard(x)).join('')}</div>
            <div>
                ${sectionHeader(_t('as_views_header', 'Viste ed esercizi rapidi'))}${views.map(x => extraCard(x)).join('')}
                <div style="height:10px"></div>
                ${sectionHeader(_t('as_tools_header', 'Strumenti'))}${tools.map(x => extraCard(x)).join('')}
            </div>
        </div>`;

        const modal = buildModal(_t('as_title', 'Studio attivo') + ' — ' + _t('as_pick_mode', 'scegli un\'attività'), body, [{ label: _t('as_close', 'Chiudi'), id: 'as-launch-cancel' }], { maxWidth: '980px', icon: 'puzzle' });
        modal.querySelector('#as-launch-cancel').onclick = () => modal.remove();
        modal.querySelectorAll('.as-extra-card').forEach(btn => {
            if (btn.disabled) return;
            btn.onclick = () => {
                const key = btn.getAttribute('data-extra');
                modal.remove();
                if (key === 'heatmap') { if (window.MappAIMasteryView) window.MappAIMasteryView.toggle(); }
                else if (key === 'effort') { if (window.MappAIEffortView) window.MappAIEffortView.toggle(); }
                else if (key === 'studypath') { if (window.MappAIStudyPath) window.MappAIStudyPath.open(); }
                else if (key === 'palace') { if (window.MappAIPalace) window.MappAIPalace.start(); }
                else if (key === 'scelta_open') { if (_SA) _SA.apriInApp('open'); }
                else if (key === 'scelta_mc') { if (_SA) _SA.apriInApp('mc'); }
                else if (key === 'celeration') { if (window.MappAICeleration) window.MappAICeleration.open(); }
            };
        });
        if (window.safeCreateIcons) window.safeCreateIcons();
    };


    console.log('[MappAI] mappai-active-study.js (launcher) caricato ✓');
})();
