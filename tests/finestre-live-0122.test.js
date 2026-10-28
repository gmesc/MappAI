'use strict';
/*
 * finestre-live-0122.test.js — il lotto 2 del packet 0122: le quattro finestre delle
 * Attività live con una testata sola e la famiglia C (Giacomo, 21/10/2026, sul banco
 * `banco-finestre.html`: «C»).
 *  · il motore ACCETTA `veste: 'grande'` (una classe sul box) e, senza, disegna la
 *    stessa stringa di prima — l'impronta, come per i rimandi dello 0119;
 *  · il vestito vive nel foglio dei token con i valori della famiglia C;
 *  · le tre finestre a mano (Mappa LIVE, Chiedi e Rispondi, Materiali di studio)
 *    portano la testata del motore e i token al posto dei numeri inline.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const leggi = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const Core = require('../public/js/mappai-modal-core.js');
/* un DOM finto quanto basta (come tests/modal-rimandi.test.js) */
const vv = { height: 1000, offsetTop: 0, addEventListener() {}, removeEventListener() {} };
global.window = { visualViewport: vv, innerHeight: 1000 };
global.requestAnimationFrame = f => f();
global.document = {
    body: { style: {}, appendChild() {} },
    activeElement: null,
    addEventListener() {}, removeEventListener() {},
    createElement: tag => {
        if (tag === 'canvas') return { getContext: () => ({ measureText: s => ({ width: s.length * 10 }) }) };
        return {
            tag, className: '', innerHTML: '', style: {}, attrs: {},
            setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; }, removeAttribute(k) { delete this.attrs[k]; },
            addEventListener() {}, appendChild() {}, replaceChild() {}, remove() {}, focus() {},
            querySelector: () => null, querySelectorAll: () => []
        };
    }
};
const Modal = require('../public/js/mappai-modal.js');

const schema = () => ({
    titolo: 'Avvia un\'attività live', icona: 'radio', taglia: 'm', invio: false,
    sezioni: [
        { testo: 'Le domande ci sono già: nessuna generazione davanti alla classe.' },
        { id: 'mie', titolo: 'Le tue domande', campi: [{ id: 'mie', tipo: 'area', cresce: true, etichetta: 'Una domanda per riga', valore: '' }],
          azioni: [{ id: 'mie', etichetta: 'Avvia queste domande', ruolo: 'primario' }], sotto: 'Partono come domande aperte.' }
    ]
});

test('normalizzaSchema: `veste` è vuota di serie e vale solo «grande»', () => {
    assert.equal(Core.normalizzaSchema(schema()).veste, '');
    assert.equal(Core.normalizzaSchema(Object.assign(schema(), { veste: 'grande' })).veste, 'grande');
    assert.equal(Core.normalizzaSchema(Object.assign(schema(), { veste: 'enorme' })).veste, '');
});

test('validaSchema: una veste sconosciuta è un errore; «grande» e nessuna passano', () => {
    assert.equal(Core.validaSchema(schema()).errori.length, 0);
    assert.equal(Core.validaSchema(Object.assign(schema(), { veste: 'grande' })).errori.length, 0);
    const e = Core.validaSchema(Object.assign(schema(), { veste: 'enorme' })).errori;
    assert.ok(e.some(x => x.includes('veste «enorme» sconosciuta')), e.join(' | '));
});

test('render: `veste: grande` mette la classe mm-box--grande sul box; senza veste il box e l\'HTML sono identici a prima', () => {
    // `render` restituisce il BOX: la veste è la sua classe, e il contenuto è lo stesso
    const senza = Modal.render(schema());
    const con = Modal.render(Object.assign(schema(), { veste: 'grande' }));
    assert.equal(senza.className, 'mm-box');
    assert.equal(con.className, 'mm-box mm-box--grande');
    assert.ok(!senza.innerHTML.includes('mm-box--grande'));
    // dentro, la stringa è la stessa: la veste non cambia nient'altro (l'impronta dello 0119 resta in modal-rimandi.test.js)
    assert.equal(con.innerHTML, senza.innerHTML);
    assert.ok(senza.innerHTML.includes('<div class="mm-head"><div class="mm-head__ico">'), 'la testata del motore com\'era');
});

test('il vestito «grande» sta nel foglio dei token coi valori della famiglia C e l\'icona nuda', () => {
    // dal lotto 4a (Giacomo, 22/10: «le console seguono la famiglia C», «anche su ipad») i valori del vestito
    // sono la RADICE e .mm-box--grande resta come alias vuoto; le regole della testata nuda sono base
    const css = leggi('public/css/mappai-modal-tokens.css');
    const i = css.indexOf('.mm-box--grande {');
    assert.ok(i >= 0, 'l\'alias resta');
    const blocco = css.slice(i, css.indexOf('}', i));
    assert.ok(!/--mm-fs-/.test(blocco), 'il vestito non ridefinisce più nulla: è la radice');
    const radice = css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')));
    ['--mm-fs-titolo: 20px', '--mm-fs-testo: 16px', '--mm-fs-label: 13px', '--mm-fs-sez: 12px', '--mm-btn-fs: 14px', '--mm-icona-head: 26px', '--mm-fs-lettura: 16px']
        .forEach(d => assert.ok(radice.includes(d), d + ' su :root'));
    assert.ok(css.includes('.mm-head { align-items: center; gap: 10px; }'), 'testata centrata, regola base');
    assert.ok(!css.includes('background: var(--mm-accent-soft);\n    display: flex;'), 'l\'icona di testata è nuda: niente riquadro 40×40');
});

test('«Avvia un\'attività live» chiede il vestito grande', () => {
    const s = leggi('public/js/mappai-live-teacher.js');
    const i = s.indexOf("titolo: t('lv_scegli_set_t', 'Avvia un\\'attività live')");
    assert.ok(i >= 0);
    assert.ok(s.slice(i, i + 300).includes("veste: 'grande'"));
});

test('le tre finestre a mano: box col vestito, testata del motore (icona nuda, mm-title, mm-close da 44), padding e raggio dai token', () => {
    const testata = (chiudi) => `<div class="mm-head"><div class="mm-head__ico"><i data-lucide="\${icon}"></i></div><div class="mm-head__testi"><div class="mm-title">\${title}</div></div><button type="button" class="mm-close ${chiudi}" aria-label="Chiudi">&times;</button></div>`;
    const collab = leggi('public/js/mappai-collab-teacher.js');
    const tutor = leggi('public/js/mappai-tutor-teacher.js');
    const live = leggi('public/js/mappai-live-teacher.js');
    assert.ok(collab.includes(testata('ch-close')), 'Mappa LIVE');
    assert.ok(tutor.includes(testata('tq-close')), 'Chiedi e Rispondi');
    assert.ok(live.includes('<div class="mm-head"><div class="mm-head__ico"><i data-lucide="\' + icon + \'"></i></div>') &&
        live.includes('<div class="mm-head__testi"><div class="mm-title">\' + esc(title) + \'</div></div>') &&
        live.includes('<button type="button" class="mm-close lh-close" aria-label="Chiudi">&times;</button></div>'), 'Materiali di studio');
    [collab, tutor, live].forEach(s => {
        assert.ok(s.includes('class="mm-box--grande" style="background:#f8fafc;border-radius:var(--mm-r-box, 16px);'), 'il box col vestito e il raggio del motore');
        assert.ok(s.includes('padding:var(--mm-pad, 22px)" role="dialog"'), 'il padding del motore');
        assert.ok(!s.includes('font-size:17px'), 'il 17 inline della testata di prima non c\'è più');
        assert.ok(!s.includes('<i data-lucide="${icon}" style="width:22px') && !s.includes('style="width:22px;height:22px;color:#4f46e5"></i>\' + esc(title)'), 'l\'icona non ha più la misura inline');
    });
});

test('i corpi delle tre finestre leggono i token: niente mezzi punti né 11/12/13 inline in openStart, openSetup, renderMaterials, fieldHtml', () => {
    const fra = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)));
    const collab = fra(leggi('public/js/mappai-collab-teacher.js'), 'function openStart(', 'function populateResume(');
    const tutor = fra(leggi('public/js/mappai-tutor-teacher.js'), 'TT.openSetup = function', "modal('message-circle', t('tq_title', 'Chiedi e Rispondi'), body, 'var(--mm-m)')");
    const live = leggi('public/js/mappai-live-teacher.js');
    const materiali = fra(live, 'function renderMaterials(', "modal('folder-down'");
    const actBtn = fra(live, 'function actBtn(', '\n  }');
    const net = fra(leggi('public/js/mappai-net-mode.js'), 'NM.fieldHtml = function', 'NM.bind = function');
    for (const [nome, s] of [['openStart', collab], ['openSetup', tutor], ['renderMaterials', materiali], ['actBtn', actBtn], ['fieldHtml', net]]) {
        const inline = [...s.matchAll(/font-size:\s*([0-9.]+)px/g)].map(m => m[1]);
        assert.deepEqual(inline, [], nome + ': corpi inline rimasti ' + inline.join(', '));
    }
    assert.ok(collab.includes('id="cl-start"') && collab.includes('font-weight:700;font-size:var(--mm-btn-fs);margin-top:14px'), '«Avvia sessione» di Mappa LIVE ha un corpo suo (prima ereditava il 16 del button nudo)');
    assert.ok(tutor.includes('font-weight:700;font-size:var(--mm-btn-fs);width:100%'), '«Avvia sessione» di Interroga idem');
    assert.ok(tutor.includes("font-size:var(--mm-fs-sez);font-weight:700;text-transform:uppercase;letter-spacing:.08em;"), 'le etichette di sezione di Interroga nella forma del motore');
    assert.ok(materiali.includes('font-size:var(--mm-fs-sez);font-weight:700;text-transform:uppercase;letter-spacing:.08em;'), '«FILE PUBBLICATI» idem');
    assert.ok(net.includes('font-size:var(--mm-fs-sez);font-weight:700;text-transform:uppercase;letter-spacing:.08em;'), '«RETE STUDENTI» idem');
});

test('0122 lotto 2: i marcatori di cache e il tetto dei corpi', () => {
    const html = leggi('public/index.html');
    ['css/mappai-modal-tokens.css?v=0119-0122-20261022-4', 'js/mappai-modal-core.js?v=0119-0122-20261021-2', 'js/mappai-modal.js?v=0119-0122-20261022-4',
        'js/mappai-net-mode.js?v=0122-20261021-2', 'js/mappai-collab-teacher.js?v=0122-20261022-4b1', 'js/mappai-live-teacher.js?v=0119-0122-20261022-4b1',
        'js/mappai-tutor-teacher.js?v=0093-0122-20261022-4b1', 'js/mappai-elabora-console.js?v=0105-0114-0122-20261022-1'].forEach(f => assert.ok(html.includes(f), f));
    // il censimento conta i valori dichiarati su :root (fs 7/7 anche col vestito): il tetto è rimasto 7 fino al lotto 4c,
    // dove entra --mnc-azione-fs 18 (le tessere di INSEGNA) col sì di Giacomo al 9 del 21/10
    const cens = leggi('tools/stile/censimento.js');
    assert.ok(cens.includes('const TETTO = { colore: 46, raggi: 4, fs: 9, ombre: 2, spazi: 16 };'));
    assert.ok(cens.includes('corpi 7 → 9 il 22/10/26 (packet 0122 lotto 4c)'), 'la riga di motivo');
});

/* gate del lotto 2 (Giacomo, 21/10): «tieni il blur + dimmer per tutti i modali di tutta l'app, e
   quando è aperto un modale lo sfondo è sempre bloccato» — le tre finestre a mano prendono il velo
   del motore (classe .mm-velo) e congelano lo sfondo con `inert` finché ci sono */
test('gate: le tre finestre a mano hanno il velo del motore (scuro + sfumato) e congelano lo sfondo', () => {
    const css = leggi('public/css/mappai-modal-tokens.css');
    assert.ok(css.includes('.mm-velo { background: var(--mm-velo); backdrop-filter: blur(3px); }'), 'la classe del velo nel foglio dei token');
    assert.ok(css.includes('.mm-overlay {\n    position: fixed;') && css.includes('    background: var(--mm-velo);\n    backdrop-filter: blur(3px);\n}'), 'il velo del motore com\'era');
    for (const [f, id] of [['public/js/mappai-collab-teacher.js', 'collab-hub-modal'], ['public/js/mappai-tutor-teacher.js', 'tutorq-modal'], ['public/js/mappai-live-teacher.js', 'live-hub-modal']]) {
        const s = leggi(f);
        const i = s.indexOf("'" + id + "'");
        const dopo = s.slice(i, i + 400);
        assert.ok(dopo.includes("className = 'mm-velo'"), f + ': il velo');
        assert.ok(!dopo.includes('background:rgba(15,23,42'), f + ': niente velo inline (vincerebbe sulla classe)');
        // dal lotto 4b1 lo sfondo bloccato lo fa l'aiutante unico (tests/velo-0122.test.js): niente più copie locali
        assert.ok(!s.includes('function congela('), f + ': nessuna copia locale di congela');
        assert.ok(/document\.body\.appendChild\((overlay|ov)\);\n\s+if \(window\.MappAIVelo\) window\.MappAIVelo\.monta\((overlay|ov), /.test(s), f + ': MappAIVelo.monta subito dopo il mount');
    }
});

/* gate del lotto 2 (Giacomo, 22/10): «il tasto ESC deve chiudere i modali ma è attivo solo sul modale
   'Esercizi'» — le tre finestre a mano chiudono con Esc, ma solo se sono l'ultimo velo aperto */
test('gate: Esc chiude le tre finestre a mano, solo se sono l\'ultimo velo; l\'ascolto va via allo sblocco', () => {
    // dal lotto 4b1 Esc lo gestisce MappAIVelo (un ascolto solo, in cattura, il velino più in alto): qui si controlla che ognuna gli passi la sua chiusura
    for (const [f, chiamata] of [['public/js/mappai-collab-teacher.js', 'window.MappAIVelo.monta(overlay, function () { overlay.remove(); });'],
        ['public/js/mappai-tutor-teacher.js', 'window.MappAIVelo.monta(overlay, chiudi);'], ['public/js/mappai-live-teacher.js', 'window.MappAIVelo.monta(ov, chiudiOChiedi);']]) {
        assert.ok(leggi(f).includes(chiamata), f + ': ' + chiamata);
    }
    const v = leggi('public/js/mappai-velo.js');
    assert.ok(v.includes("document.addEventListener('keydown', tasti, true);") && v.includes("if (e.key !== 'Escape' || !aperti.length) return;"), 'Esc nell\'aiutante');
});

/* Giacomo, 22/10: «Rinomina il modale della sidebar 'Materiali di studio' in 'Invia file'» */
test('la finestra di «Invia file» si chiama come la card', () => {
    assert.ok(leggi('public/js/mappai-live-teacher.js').includes("t('lv_mat_title', 'Invia file')"));
    assert.ok(/^\s*lv_mat_title: "Send files",/m.test(leggi('public/traduzioni/en_translations.js')));
});

/* Giacomo, 22/10: «questo modale [MappAI Live] deve mostrare le card con i titoli e le desc uguali a
   quelle visibili nella sidebar» — le stesse chiavi della tab Attività live; l'ordine dello 0116 resta */
test('il menu «MappAI Live» ha le stesse card della sidebar (titoli, sottotitoli, icona del QR)', () => {
    const s = leggi('public/js/mappai-live-teacher.js');
    const i = s.indexOf('function openHubMenu()');
    const corpo = s.slice(i, s.indexOf('\n  }\n', i));
    [
        "card('radio', t('lim_card_live', 'Esercizi'), t('lim_card_live_d', 'QuizMC, Domande aperte o Domande al volo.'),",
        "card('presentation', t('lim_card_board', 'Mappa'), t('lim_card_board_d', 'Mappe condivise'),",
        "card('qr-code', t('lim_card_mat', 'Invia file'), t('lim_card_mat_d', 'Scegli dalle risorse salvate'),",
        "card('message-circle', t('lim_card_tutor', 'Interroga'), t('lim_card_tutor_d', 'Domanda con risposta assistita'),",
    ].forEach(k => assert.ok(corpo.includes(k), 'manca ' + k));
    assert.ok(!corpo.includes("'lv_card_quiz'") && !corpo.includes("'lv_card_mat'") && !corpo.includes("'lv_card_tutor'") && !corpo.includes("'lv_card_board'"), 'le chiavi vecchie non ci sono più nel menu');
    const pos = ["'quiz')", "'board')", "'materials')", "'tutor')"].map(k => corpo.indexOf(k));
    assert.ok(pos.every((p, j) => p >= 0 && (j === 0 || p > pos[j - 1])), 'ordine dello 0116: quiz, board, materials, tutor');
});

/* Giacomo, 22/10 (gate): «Un velo solo» e «Crea nuovo» col vestito delle attività live */
test('un velo solo: sopra un velo già aperto le finestre a mano non ne aggiungono uno; «Crea nuovo» ha il vestito grande', () => {
    const css = leggi('public/css/mappai-modal-tokens.css');
    assert.ok(css.includes('.mm-velo--sopra { background: transparent; backdrop-filter: none; }'));
    for (const f of ['public/js/mappai-collab-teacher.js', 'public/js/mappai-tutor-teacher.js', 'public/js/mappai-live-teacher.js']) {
        const s = leggi(f);
        assert.ok(!s.includes('mm-velo--sopra'), f + ': il velo solo non è più qui');
    }
    assert.ok(leggi('public/js/mappai-velo.js').includes("ov.classList.add('mm-velo--sopra');"), 'il velo solo lo mette l\'aiutante');
    const ec = leggi('public/js/mappai-elabora-console.js');
    const i = ec.indexOf("titolo: t('ec_crea_t', 'Crea nuovo'), icona: 'plus', taglia: 'xl', invio: false,");
    assert.ok(i >= 0 && ec.slice(i, i + 200).includes("veste: 'grande'"), '«Crea nuovo» chiede il vestito grande');
});
