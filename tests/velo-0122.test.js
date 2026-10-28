'use strict';
/*
 * velo-0122.test.js — il lotto 4b1 del packet 0122: l'aiutante unico dei velini fatti a mano
 * (public/js/mappai-velo.js). Giacomo, 22/10: «Sì alla proposta del 4b in due commit: allarga il §2 e parti
 * col 4b1 (aiutante, statici, lotto 2)»; valgono il lotto 2 («tieni il blur + dimmer per tutti i modali di
 * tutta l'app, e quando è aperto un modale lo sfondo è sempre bloccato», «il tasto ESC deve chiudere i
 * modali») e il 4a (un velo solo). Il DOM è finto e piccolo: solo ciò che l'aiutante usa.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const leggi = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function casa() {
    const osservatori = [];
    const ascolti = [];
    class Classi extends Array {
        add(c) { if (!this.includes(c)) this.push(c); }
        remove(c) { const i = this.indexOf(c); if (i >= 0) this.splice(i, 1); }
        contains(c) { return this.includes(c); }
    }
    class El {
        constructor(id, classi) {
            this.id = id || ''; this.classList = Classi.from(classi || []); this.style = {}; this.dataset = {};
            this.children = []; this.parentNode = null; this._attr = new Map(); this._clic = null;
        }
        get isConnected() { let n = this; while (n) { if (n === body) return true; n = n.parentNode; } return false; }
        hasAttribute(a) { return this._attr.has(a); }
        setAttribute(a, v) { this._attr.set(a, v); }
        removeAttribute(a) { this._attr.delete(a); }
        appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
        remove() { if (!this.parentNode) return; const k = this.parentNode.children; k.splice(k.indexOf(this), 1); this.parentNode = null; }
        contains(x) { while (x) { if (x === this) return true; x = x.parentNode; } return false; }
        click() { if (this._clic) this._clic(); }
        focus() { document.activeElement = this; }
        addEventListener(t, fn, cattura) { (this._asc = this._asc || []).push({ t, fn, cattura: !!cattura }); }
        removeEventListener(t, fn, cattura) { this._asc = (this._asc || []).filter(a => !(a.t === t && a.fn === fn && a.cattura === !!cattura)); }
        clicSulVelo() {   // un clic con bersaglio il velino: prima la cattura, poi i gestori propri; dice se è arrivato in fondo
            let fermo = false; const e = { target: this, stopImmediatePropagation() { fermo = true; }, stopPropagation() { fermo = true; }, preventDefault() { } };
            for (const a of (this._asc || []).filter(x => x.t === 'click').sort((x, y) => y.cattura - x.cattura)) { if (fermo) break; a.fn(e); }
            return !fermo;
        }
        get firstElementChild() { return this.children[0] || null; }
        querySelector(sel) {   // solo «.classe» e «[role="dialog"]»: ciò che l'aiutante cerca
            const ok = (e) => sel.startsWith('.') ? e.classList.contains(sel.slice(1)) : (e._attr.get('role') === 'dialog');
            for (const c of this.children) { if (ok(c)) return c; const d = c.querySelector(sel); if (d) return d; }
            return null;
        }
    }
    const body = new El('body');
    const per = {};
    const document = {
        body, readyState: 'complete', activeElement: null,
        getElementById: (id) => per[id] || null,
        querySelectorAll: (sel) => sel === 'body > .mm-overlay' ? body.children.filter(e => e.classList.contains('mm-overlay')) : [],
        addEventListener: (t, fn, cattura) => { if (t === 'keydown') ascolti.push(fn); },
    };
    let z = 12000;
    const window = { MappAIModal: { prossimoZ: () => (z += 100) } };
    const ctx = vm.createContext({
        window, document, console,
        getComputedStyle: (el) => ({ display: el.style.display || (el.classList.contains('hidden') ? 'none' : 'block'), zIndex: el.style.zIndex || el._z || 'auto' }),
        MutationObserver: class { constructor(cb) { this.cb = cb; this.vivo = true; osservatori.push(this); } observe() { } disconnect() { this.vivo = false; } },
    });
    const nuovo = (id, classi, padre) => { const e = new El(id, classi); if (id) per[id] = e; (padre || body).appendChild(e); return e; };
    return {
        ctx, window, document, body, nuovo,
        carica() { vm.runInContext(leggi('public/js/mappai-velo.js'), ctx); return window.MappAIVelo; },
        muta() { osservatori.filter(o => o.vivo).forEach(o => o.cb([])); },
        esc() { let fermato = false; const e = { key: 'Escape', preventDefault() { }, stopPropagation() { fermato = true; }, stopImmediatePropagation() { fermato = true; } }; ascolti.forEach(fn => fn(e)); return fermato; },
    };
}

test('monta: il velo del motore al posto dei Tailwind, il piano più alto, lo sfondo bloccato col contatore', () => {
    const c = casa(); const V = c.carica();
    const sidebar = c.nuovo('sidebar'); const app = c.nuovo('app');
    const ov = c.nuovo('', ['fixed', 'inset-0', 'bg-slate-900/80', 'backdrop-blur-sm', 'z-[3000]']);
    ov.style.background = 'rgba(15,23,42,.5)';
    V.monta(ov, () => ov.remove());
    assert.ok(ov.classList.contains('mm-velo') && !ov.classList.contains('bg-slate-900/80') && !ov.classList.contains('backdrop-blur-sm'), [...ov.classList].join(' '));
    assert.equal(ov.style.background, '', 'niente velo inline: vincerebbe sulla classe');
    assert.equal(ov.style.zIndex, '12100', 'il piano lo dà il motore');
    assert.ok(sidebar.hasAttribute('inert') && app.hasAttribute('inert') && !ov.hasAttribute('inert'));
    assert.equal(sidebar.dataset.mmCongela, '1');
    assert.equal(V.aperti, 1);
});

test('un velo solo: sopra un velo già aperto il velino è trasparente, anche contro la regola per id', () => {
    const c = casa(); const V = c.carica();
    c.nuovo('console', ['mm-overlay']);
    const ov = c.nuovo('prompt-modal', ['fixed', 'inset-0']);
    V.monta(ov, () => ov.classList.add('hidden'));
    assert.ok(ov.classList.contains('mm-velo--sopra'));
    assert.equal(ov.style.background, 'transparent'); assert.equal(ov.style.backdropFilter, 'none');
});

test('Esc chiude solo il velino più in alto, e niente se sopra c\'è una finestra del motore', () => {
    const c = casa(); const V = c.carica();
    const chiusi = [];
    const a = c.nuovo('a'); V.monta(a, () => { chiusi.push('a'); a.remove(); c.muta(); });
    const b = c.nuovo('b'); V.monta(b, () => { chiusi.push('b'); b.remove(); c.muta(); });
    assert.ok(c.esc(), 'Esc fermato: la tabella di app.js non lo vede');
    assert.deepEqual(chiusi, ['b']);
    c.esc(); assert.deepEqual(chiusi, ['b', 'a']);
    assert.equal(V.aperti, 0);
    // una finestra del motore sopra il velino: Esc è suo
    const d = c.nuovo('d'); V.monta(d, () => chiusi.push('d'));
    const m = c.nuovo('m', ['mm-overlay']); m.style.zIndex = '99999';
    assert.equal(c.esc(), false); assert.ok(!chiusi.includes('d'));
});

test('si scioglie da sé quando il velino esce o si nasconde; l\'inert messo dal motore torna al suo posto', () => {
    const c = casa(); const V = c.carica();
    const sidebar = c.nuovo('sidebar');
    const motore = c.nuovo('console', ['mm-overlay']);
    // lo statico era stato congelato dal motore (la console aperta): lo si scongela finché è aperto
    const st = c.nuovo('edit-node-modal', ['hidden']); st.setAttribute('inert', ''); st.dataset.mmCongela = '1';
    sidebar.setAttribute('inert', ''); sidebar.dataset.mmCongela = '1';
    V.monta(st, () => { });
    assert.ok(!st.hasAttribute('inert'), 'lo statico si usa');
    assert.ok(motore.hasAttribute('inert') && sidebar.dataset.mmCongela === '2');
    st.classList.add('hidden'); c.muta();
    assert.equal(V.aperti, 0);
    assert.ok(st.hasAttribute('inert'), 'il congelamento del motore torna');
    assert.equal(sidebar.dataset.mmCongela, '1'); assert.ok(!motore.hasAttribute('inert'));
    assert.equal(st.style.zIndex, '');
});

test('gli statici si guardano da sé: si montano quando appaiono, Esc li chiude col loro bottone', () => {
    const c = casa();
    const pr = c.nuovo('prompt-modal', ['fixed', 'inset-0', 'hidden']);
    const annulla = c.nuovo('prompt-cancel', [], pr); annulla._clic = () => pr.classList.add('hidden');
    const lb = c.nuovo('image-lightbox', ['hidden']);
    const V = c.carica();
    assert.equal(V.aperti, 0);
    pr.classList.remove('hidden'); c.muta();
    assert.equal(V.aperti, 1); assert.ok(pr.classList.contains('mm-velo'));
    c.esc(); c.muta();
    assert.ok(pr.classList.contains('hidden')); assert.equal(V.aperti, 0);
    // nascosto, non si tiene `.mm-velo`: il motore cerca `body > .mm-velo` per decidere il velo trasparente
    assert.ok(!pr.classList.contains('mm-velo'), 'uno statico chiuso non porta la classe del velo');
    lb.classList.remove('hidden'); c.muta();
    assert.ok(!lb.classList.contains('mm-velo'), 'il visore delle immagini tiene il suo scuro');
    assert.ok(lb.style.zIndex, 'ma sale sopra tutto');
});

test('il caricamento e l\'elenco degli statici', () => {
    const html = leggi('public/index.html');
    const i = html.indexOf('<script src="js/mappai-modal.js?');
    const j = html.indexOf('<script src="js/mappai-velo.js?v=0122-20261023-4b2-3"></script>');
    assert.ok(i > 0 && j > i && html.slice(i, j).split('\n').length <= 3, 'subito dopo il motore');
    const v = leggi('public/js/mappai-velo.js');
    for (const id of ['alert-modal', 'prompt-modal', 'link-family-modal', 'confirm-modal', 'edit-node-modal', 'dossier-print-modal',
        'study-player-modal', 'source-modal', 'image-lightbox', 'validate-link-modal', 'app-tutorial-modal', 'app-guide-modal']) {
        assert.ok(v.includes("['" + id + "'"), 'manca ' + id);
    }
    for (const id of ['ai-modal', 'config-ai-modal', 'admin-dashboard']) assert.ok(!v.includes("['" + id + "'"), 'fuori: ' + id);
});

/* ── lotto 4b2 (Giacomo, 22/10: «Sì alla proposta del 4b in due commit»): i velini JS ── */
test('esc: false — il velino tiene il suo Esc, l\'aiutante fa tutto il resto (il Banco di revisione)', () => {
    const c = casa(); const V = c.carica();
    const sidebar = c.nuovo('sidebar');
    let chiuso = false;
    const banco = c.nuovo('banco', ['fixed', 'inset-0', 'bg-slate-900/70']);
    V.monta(banco, () => { chiuso = true; }, { esc: false });
    assert.ok(banco.classList.contains('mm-velo') && sidebar.hasAttribute('inert') && banco.style.zIndex);
    assert.equal(c.esc(), false, 'Esc non fermato: arriva al Banco');
    assert.equal(chiuso, false);
});

test('4b2: ogni velino JS raggiungibile passa dall\'aiutante; il vecchio Esc resta solo dove il reader copia il file', () => {
    const conta = (f, x) => leggi(f).split(x).length - 1;
    const SITI = [
        ['public/js/mappai-branch-synthesis.js', 3], ['public/js/mappai-jigsaw.js', 1], ['public/js/mappai-meta-analysis.js', 1],
        ['public/js/mappai-print-dossier.js', 1], ['public/js/mappai-material-pipeline.js', 3], ['public/js/mappai-timeline.js', 1],
        ['public/js/mappai-storage-lang.js', 1], ['public/js/mappai-review.js', 1], ['public/js/mappai-doc-editor.js', 1],
        ['public/js/mappai-landing-teach.js', 1], ['public/js/mappai-menu-hubs.js', 1], ['public/js/mappai-live-classes.js', 1],
        ['public/js/mappai-files-settings.js', 1], ['public/js/mappai-elabora.js', 2],
    ];
    for (const [f, n] of SITI) assert.equal(conta(f, 'if (window.MappAIVelo) window.MappAIVelo.monta('), n, f);
    // copiati dal reader (che non carica l'aiutante): il loro Esc resta, ma solo come riserva
    for (const [f, n] of [['public/js/mappai-branch-synthesis.js', 2], ['public/js/mappai-timeline.js', 1], ['public/js/mappai-print-dossier.js', 1]]) {
        assert.equal(conta(f, "window.MappAIVelo.monta(modal, function () { modal.remove(); });\n" + (f.includes('branch') ? '        else {' : '    else {')), n, f + ': la riserva sta nell\'else');
    }
    // non copiati: niente più Esc propri
    assert.ok(!leggi('public/js/mappai-material-pipeline.js').includes("const esc = (e) => { if (e.key === 'Escape') { modal.remove();"));
    assert.ok(!leggi('public/js/mappai-menu-hubs.js').includes('const escH ='));
    assert.ok(!leggi('public/js/mappai-files-settings.js').includes('var escH ='));
    assert.ok(!leggi('public/js/mappai-elabora.js').includes("const onKey = (e) => { if (e.key === 'Escape') close(); };"));
    for (const f of ['public/js/mappai-doc-editor.js', 'public/js/mappai-landing-teach.js']) {
        const s = leggi(f);
        assert.ok(!s.includes("document.addEventListener('keydown', onKey, true);"), f + ': niente Esc proprio');
        assert.ok(!s.includes('<div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"></div>'), f + ': il figlio non fa più da velo');
    }
    assert.ok(leggi('public/js/mappai-review.js').includes('window.MappAIVelo.monta(modal, null, { esc: false });'), 'il Banco tiene il suo Esc');
    assert.ok(leggi('public/js/mappai-storage-lang.js').includes("var ok = document.getElementById('lang-onb-ok'); if (ok) ok.click();"), 'Esc conferma la lingua');
    assert.ok(!/background:rgba\(15,23,42,\.45\)/.test(leggi('public/js/mappai-menu-hubs.js')), 'menu-hubs: niente velo inline');
});

/* Giacomo, 23/10, al gate del 4b2 («Cartella documenti» sopra la Cabina): «lo sfondo della CABINA deve essere dimmato e
   blurrato come con tutti gli altri modali, senza il focus sulla text input area» */
test('sopra una console il velino ha il suo velo (una console è una pagina, non un velo); lo stesso nel motore', () => {
    const c = casa(); const V = c.carica();
    const cabina = c.nuovo('cabina', ['mm-overlay']); c.nuovo('', ['mm-box--console'], cabina);
    const ov = c.nuovo('cartella', ['mappai-files-overlay']);
    V.monta(ov, () => ov.remove());
    assert.ok(!ov.classList.contains('mm-velo--sopra') && ov.style.background !== 'transparent', 'velo scuro e sfumato sopra la Cabina');
    assert.ok(cabina.hasAttribute('inert'));
    const m = leggi('public/js/mappai-modal.js');
    assert.ok(m.includes("var veloInPila = pila.some(function (v) { return !(v.querySelector && v.querySelector('.mm-box--console')); });"));
    assert.ok(m.includes("((veloInPila || altroVelo) ? ' mm-overlay--sopra' : '')"), 'il motore non conta le console come velo');
});

test('il fuoco entra nel riquadro del velino e alla chiusura torna a chi l\'ha aperto', () => {
    const c = casa(); const V = c.carica();
    const cabina = c.nuovo('cabina', ['mm-overlay']);
    const bottone = c.nuovo('cart-cambia', [], cabina); bottone.focus();
    const ov = c.nuovo('cartella'); const riquadro = c.nuovo('', [], ov); riquadro.setAttribute('role', 'dialog');
    V.monta(ov, () => { ov.remove(); c.muta(); });
    assert.ok(c.document.activeElement === riquadro, 'il fuoco è nel riquadro, non su un campo');
    c.esc();
    assert.ok(c.document.activeElement === bottone, 'torna su «Cambia posizione»');
});

/* Giacomo, 23/10: «tutti i 'le finestre del motore', 'le finestre statiche' e 'i velini fatti a mano del 4b' devono avere
   veloChiude spento e chiudersi solo con 'x' e ESC» */
test('il clic sul velo non chiude più (salvo il visore delle immagini); nel motore veloChiude è spento per tutte', () => {
    const c = casa(); const V = c.carica();
    let chiuso = false;
    const ov = c.nuovo('hub'); ov.addEventListener('click', (e) => { if (e.target === ov) chiuso = true; });
    V.monta(ov, () => { });
    assert.equal(ov.clicSulVelo(), false, 'fermato in cattura'); assert.equal(chiuso, false);
    let visore = false;
    const lb = c.nuovo('lb'); lb.addEventListener('click', () => { visore = true; });
    V.monta(lb, () => { }, { velo: false, clicFuori: true });
    assert.equal(lb.clicSulVelo(), true); assert.equal(visore, true, 'il visore si chiude col clic');
    assert.ok(leggi('public/js/mappai-velo.js').includes("['image-lightbox', fn('closeLightbox'), { velo: false, clicFuori: true }]"));
    const core = leggi('public/js/mappai-modal-core.js');
    assert.ok(core.includes('            veloChiude: false,\n') && !core.includes('veloChiude: s.veloChiude !== false'), 'motore: spento per tutte');
    for (const f of ['public/js/mappai-doc-editor.js', 'public/js/mappai-landing-teach.js']) {
        assert.ok(!leggi(f).includes("m.querySelector('.absolute').onclick = close;"), f + ': il figlio-velo non chiude più (non c\'è più)');
    }
});

/* Giacomo, 23/10, al gate del 4b2: «disegna il frame attorno ai bottoni e cambia il nome del bottone 'cambia posizione' in
   'cartella progetti' e poi aggiorna anche il nome del suo modale in 'cartella progetti'» */
test('«Gestione cartelle»: «Cartella progetti» sul bottone e sulla finestra, i secondari con la cornice', () => {
    assert.ok(leggi('public/js/mappai-cabina.js').includes("{ id: 'cart-cambia', etichetta: t('cb_ca_cambia', 'Cartella progetti'),"));
    assert.ok(leggi('public/js/mappai-files-settings.js').includes("overlay('folder-cog', _t('fx_title', 'Cartella progetti'),"));
    const en = leggi('public/traduzioni/en_translations.js');
    assert.ok(en.includes('    cb_ca_cambia: "Projects folder",') && en.includes('    fx_title: "Projects folder",'));
    const css = leggi('public/css/mappai-modal-tokens.css');
    assert.ok(css.includes('.mm-sez__azioni:has([data-azione="cart-cambia"]) .mm-btn--secondario {\n    border-color: var(--mm-bordo);\n}'));
});

/* Giacomo, 23/10: «Nel modale di 'cartella progetti' allinea l'icone e il nome del bottone 'apri la cartella' su una linea
   sola. Poi tutti i bottoni 'apri la cartela' cambiali in 'apri nel finder' e su windows 'apri in esplora risorse'» */
test('i bottoni che aprono una cartella dicono «Apri nel Finder» / «Apri in Esplora risorse» secondo il sistema', () => {
    for (const [piattaforma, atteso] of [['MacIntel', 'Apri nel Finder'], ['Win32', 'Apri in Esplora risorse'], ['Linux x86_64', 'Apri la cartella']]) {
        const ctx = vm.createContext({ window: {}, navigator: { platform: piattaforma }, localStorage: { getItem: () => 'it' } });
        vm.runInContext(leggi('public/traduzioni/i18n-helper.js'), ctx);
        assert.equal(ctx.window.tApriCartella(), atteso, piattaforma);
    }
    const en = leggi('public/traduzioni/en_translations.js');
    assert.ok(en.includes('ui_open_finder: "Open in Finder",') && en.includes('ui_open_explorer: "Open in File Explorer",') && en.includes('ui_open_folder: "Open folder",'));
    for (const [f, vecchia] of [['public/js/mappai-cabina.js', "t('cb_ca_apri', 'Apri la cartella')"], ['public/js/mappai-files-settings.js', "_t('fx_open', 'Apri la cartella')"],
        ['public/js/mappai-percorso-lettura.js', "t('pl_open_folder', 'Apri la cartella')"], ['public/js/mappai-live-teacher.js', "t('lv_folder', 'Apri cartella')"],
        ['public/js/mappai-collab-teacher.js', "t('cl_folder', 'Apri cartella')"], ['public/js/mappai-tutor-teacher.js', "t('cl_folder', 'Apri cartella')"],
        ['public/js/mappai-timeline-teacher.js', "_t('tl_openfolder', 'Apri cartella')"]]) {
        assert.ok(leggi(f).includes('window.tApriCartella ? window.tApriCartella() : ' + vecchia), f);
    }
    assert.ok(leggi('public/js/mappai-files-settings.js').includes("btnPrimary + ';display:inline-flex;align-items:center;gap:6px\"><i data-lucide=\"folder-open\""), 'icona ed etichetta su una riga');
});
