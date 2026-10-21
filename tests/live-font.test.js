'use strict';
/*
 * Packet 0112 (allargamento del 20/10, richiesta di Giacomo) — le sessioni live
 * sul telefono dell'allievo ereditano il carattere scelto dal docente in MappAI.
 *
 * Il percorso: Cabina › Aspetto e leggibilità (`mappai_font_app`) →
 * `MappAIFont.attivo()` → opzioni di `liveStartSession` → `session.font` in
 * `main.js` → `/api/session` (solo se l'id è nel catalogo) → le pagine
 * dell'allievo (`student.html`, `scelta.html`, `timeline-build.html`) → la
 * scheda che l'allievo salva in PDF.
 *
 * Il catalogo è UNO: `MappAIFontCore`. Qui non si elenca nessun carattere.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const leggi = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const FC = require(path.join(ROOT, 'public/js/mappai-font-core.js'));
const MOD = 'public/js/mappai-live-font.js';
const PAGINE = ['public/live/student.html', 'public/live/scelta.html', 'public/live/timeline-build.html'];

test('il modulo del telefono esiste e produce le facce e la variabile dal catalogo', () => {
    assert.ok(fs.existsSync(path.join(ROOT, MOD)), MOD + ' non esiste');
    const LF = require(path.join(ROOT, MOD));
    assert.equal(typeof LF.css, 'function');
    assert.equal(typeof LF.applica, 'function');
    assert.equal(typeof LF.daSessione, 'function');
    // ogni carattere del catalogo diverso dal predefinito: stesse facce del catalogo + la variabile
    const altri = FC.FONTS.filter((f) => f.id !== FC.DEFAULT);
    assert.ok(altri.length >= 3, 'il catalogo ha almeno tre caratteri oltre Space Mono');
    for (const f of altri) {
        const css = LF.css(f.id);
        assert.ok(css.includes("font-family:'" + f.famiglia + "'"), f.id + ': manca la @font-face');
        assert.ok(css.includes('/public/fonts/' + f.file.normale), f.id + ': il file normale va cercato in /public/fonts/');
        assert.ok(css.includes('/public/fonts/' + f.file.grassetto), f.id + ': e il grassetto');
        assert.ok(css.includes("--live-font:'" + f.famiglia + "',var(--emoji)"), f.id + ': le emoji restano nello stack (regola emoji)');
        assert.ok(css.includes(f.ripiego), f.id + ': il ripiego del catalogo');
    }
});

test('Space Mono, un id ignoto o niente: la pagina resta com\'è', () => {
    const LF = require(path.join(ROOT, MOD));
    for (const id of [FC.DEFAULT, 'comic-sans', '', null, undefined, '<script>']) {
        assert.equal(LF.css(id), '', 'css(' + String(id) + ') deve essere vuoto');
    }
    assert.equal(LF.daSessione(null), false);
    assert.equal(LF.daSessione({}), false);
});

test('il docente: MappAIFont.attivo() viaggia nelle opzioni di liveStartSession', () => {
    const t = leggi('public/js/mappai-live-teacher.js');
    const i = t.indexOf('function launch(');
    assert.ok(i > 0);
    const corpo = t.slice(i, t.indexOf('liveStartSession(payload)', i));
    assert.match(corpo, /payload\.font *=/);
    assert.match(corpo, /MappAIFont/);
    assert.match(corpo, /attivo\(\)/);
});

test('main.js: la sessione porta il carattere, e solo come testo', () => {
    const m = leggi('main.js');
    const i = m.indexOf("ipcMain.handle('live-start-session'");
    const corpo = m.slice(i, m.indexOf('roster: Array.isArray(o.roster)', i));
    assert.match(corpo, /font: *typeof o\.font === 'string' \? o\.font : ''/);
});

test('le tre pagine dell\'allievo caricano il catalogo e il modulo, e usano --live-font con Space Mono come ripiego', () => {
    for (const p of PAGINE) {
        const h = leggi(p);
        const core = h.indexOf('<script src="/public/js/mappai-font-core.js'), mod = h.indexOf('<script src="/public/js/mappai-live-font.js');
        assert.ok(core > 0, p + ': manca il catalogo');
        assert.ok(mod > core, p + ': il modulo va dopo il catalogo');
        assert.match(h, /font-family: *var\(--live-font, *'Space Mono'/, p + ': il carattere si legge da --live-font');
        assert.match(h, /MappAILiveFont\.daSessione\(/, p + ': va applicato appena arriva la sessione');
        // Space Mono resta dichiarato in locale: è il ripiego senza rete e il carattere predefinito
        assert.match(h, /@font-face[^}]*SpaceMono-Regular\.ttf/, p + ': Space Mono locale resta');
    }
});

test('il server LAN serve il catalogo e il modulo, e niente altro di nuovo', () => {
    const s = leggi('live-server.js');
    assert.match(s, /'\/public\/js\/mappai-font-core\.js'/);
    assert.match(s, /'\/public\/js\/mappai-live-font\.js'/);
    // non si allarga a `mappai-font.js` (il modulo dell'app, con ascolti sullo storage)
    assert.equal(/'\/public\/js\/mappai-font\.js'/.test(s), false);
});

test('la scheda in PDF eredita il carattere della pagina', () => {
    const LR = require(path.join(ROOT, 'public/js/mappai-live-reports.js'));
    const p = LR.studentSheetParts({ mapTitle: 'X', className: '2A', dateStr: '20/10/2026' }, { emoji: '🐝', num: '10', displayName: '🐝 10', accuracyPct: 0, answered: 0, items: [] });
    assert.match(p.css, /\.lr-root\{font-family:var\(--live-font,'Space Mono'\)/);
    // il report del docente non cambia: vedi live-scheda-allievo.test.js
});
