/**
 * MappAI - misuratore — bootstrap del renderer.
 * Commutazione dei tab, stato dell'applicazione, cablaggio del piè di pagina.
 * Il calcolo non passa da qui: sta nei core di public/js/core/.
 */
(function () {
    'use strict';

    const t = (k, s) => window.MisI18n.t(k, s);

    const stato = {
        tab: 'analizza',
        elementi: [],
        report: [],
        selezione: new Set(),
        profilo: null,
        radice: null,
    };
    window.misStato = stato;

    // ── Icone Lucide: rigenerate dopo ogni append al DOM ────────────────────
    function icone(root) {
        try {
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons(root ? { nameAttr: 'data-lucide', el: root } : undefined);
            }
        } catch (e) { /* icona mancante non deve far cadere la pagina */ }
    }
    window.misIcone = icone;

    // ── Tab ────────────────────────────────────────────────────────────────
    const TAB = ['analizza', 'andamento', 'metodo', 'basi'];

    function mostraTab(nome) {
        if (!TAB.includes(nome)) return;
        stato.tab = nome;
        TAB.forEach((n) => {
            const bottone = document.getElementById('tab-' + n);
            const pannello = document.getElementById('pan-' + n);
            const attivo = n === nome;
            if (bottone) bottone.setAttribute('aria-selected', attivo ? 'true' : 'false');
            if (pannello) pannello.hidden = !attivo;
        });
        if (nome === 'andamento' && window.MisUiAndamento) window.MisUiAndamento.render();
        if (nome === 'metodo' && window.MisUiMetodo) window.MisUiMetodo.render();
    }
    window.misMostraTab = mostraTab;

    function cablaTab() {
        TAB.forEach((n) => {
            const b = document.getElementById('tab-' + n);
            if (b) b.addEventListener('click', () => mostraTab(n));
        });
        // Frecce per navigare fra i tab da tastiera
        const barra = document.querySelector('.tabbar');
        if (barra) {
            barra.addEventListener('keydown', (e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                const i = TAB.indexOf(stato.tab);
                const j = e.key === 'ArrowRight' ? (i + 1) % TAB.length : (i - 1 + TAB.length) % TAB.length;
                mostraTab(TAB[j]);
                const b = document.getElementById('tab-' + TAB[j]);
                if (b) b.focus();
            });
        }
    }

    // ── Stati vuoti finché le fasi successive non li riempiono ─────────────
    function vuoto(testo) {
        return '<div class="vuoto">' + testo + '</div>';
    }

    function renderElementi() {
        const host = document.getElementById('corpo-elementi');
        const conta = document.getElementById('conta-elementi');
        if (!host) return;
        if (window.MisUiAnalizza && window.MisUiAnalizza.renderElementi) {
            window.MisUiAnalizza.renderElementi(host, stato);
        } else {
            host.innerHTML = vuoto(t('el_vuoto'));
        }
        if (conta) conta.textContent = stato.elementi.length ? '· ' + stato.elementi.length : '';
        icone(host);
    }

    function renderReport() {
        const host = document.getElementById('corpo-report');
        const conta = document.getElementById('conta-report');
        if (!host) return;
        if (window.MisUiAnalizza && window.MisUiAnalizza.renderReport) {
            window.MisUiAnalizza.renderReport(host, stato);
        } else {
            host.innerHTML = vuoto(t('rep_vuoto'));
        }
        if (conta) conta.textContent = stato.report.length ? '· ' + stato.report.length : '';
        icone(host);
    }

    function renderAndamento() {
        const host = document.getElementById('corpo-andamento');
        if (!host || window.MisUiAndamento) return;
        host.innerHTML =
            '<div class="sezione"><div class="sezione-corpo">' +
            '<div class="vuoto"><b>' + t('and_vuoto_titolo') + '</b><br><br>' +
            t('and_vuoto_testo') + '<br><br>' +
            '<button class="btn" id="btn-vai-analizza">' + t('and_vai') + '</button>' +
            '</div></div></div>';
        const b = document.getElementById('btn-vai-analizza');
        if (b) b.addEventListener('click', () => mostraTab('analizza'));
    }

    function renderMetodo() {
        const host = document.getElementById('corpo-metodo');
        if (!host || window.MisUiMetodo) return;
        host.innerHTML =
            '<div class="sezione"><div class="sezione-corpo">' +
            '<p style="color:var(--slate-500);font-size:.85rem">' + t('met_intro') + '</p>' +
            '<div class="vuoto">Il dettaglio dei parametri arriva con la fase 5.</div>' +
            '</div></div>';
    }

    window.misRenderTutto = function () {
        renderElementi();
        renderReport();
        renderAndamento();
        renderMetodo();
    };

    // ── Aggiornamento della barra di selezione ─────────────────────────────
    window.misAggiornaSelezione = function () {
        const n = stato.selezione.size;
        const label = document.getElementById('sel-conteggio');
        const avvia = document.getElementById('btn-avvia');
        if (label) {
            label.textContent = n === 0 ? t('sel_conteggio_zero')
                : n === 1 ? t('sel_conteggio_uno')
                : t('sel_conteggio_molti', { n: n });
        }
        if (avvia) avvia.disabled = n === 0;
    };

    // ── Basi scientifiche ──────────────────────────────────────────────────
    function cablaBasi() {
        const finestra = document.getElementById('btn-basi-finestra');
        const stampa = document.getElementById('btn-basi-stampa');
        const telaio = document.getElementById('basi-frame');
        if (finestra) {
            finestra.addEventListener('click', () => {
                window.open('../pitch/basi-scientifiche.html', '_blank');
            });
        }
        if (stampa && telaio) {
            stampa.addEventListener('click', () => {
                // Stampa il documento, non la chrome dell'app: il foglio di stile
                // di stampa del documento trasforma lo scorrimento in pagine.
                try { telaio.contentWindow.focus(); telaio.contentWindow.print(); }
                catch (e) { window.open('../pitch/basi-scientifiche.html', '_blank'); }
            });
        }
    }

    // ── Piè di pagina ──────────────────────────────────────────────────────
    async function cablaFooter() {
        const bottone = document.getElementById('btn-cartella-dati');
        if (bottone && window.misAPI) {
            bottone.addEventListener('click', () => window.misAPI.apriCartellaDati());
        }
        const ver = document.getElementById('ft-versione');
        if (ver) ver.textContent = t('ft_versione', { v: '1.0.0' });

        if (!window.misAPI) return;
        try {
            const d = await window.misAPI.datiRadice();
            stato.radice = d;
            const el = document.getElementById('ft-radice');
            if (el) el.textContent = d.radice;
        } catch (e) { /* fuori da Electron: il footer resta senza percorso */ }
    }

    // ── Profilo attivo ─────────────────────────────────────────────────────
    async function caricaProfilo() {
        if (!window.misAPI) return;
        try {
            const profili = await window.misAPI.profiliLista();
            stato.profilo = profili.find(p => p.id === 'indice-accessibilita@1') || profili[0] || null;
            if (stato.profilo && window.MisProfileCore) {
                const res = window.MisProfileCore.validate(stato.profilo);
                if (!res.ok) console.warn('[misuratore] profilo non valido:', res.errori);
            }
        } catch (e) {
            console.warn('[misuratore] profili non leggibili:', e && e.message);
        }
    }

    async function avvio() {
        cablaTab();
        await cablaFooter();
        await caricaProfilo();
        cablaBasi();
        if (window.MisUiAnalizza && window.MisUiAnalizza.cabla) window.MisUiAnalizza.cabla(stato);
        window.misRenderTutto();
        window.misAggiornaSelezione();
        mostraTab('analizza');
        icone();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', avvio);
    } else {
        avvio();
    }
}());
