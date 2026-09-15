'use strict';
/*
 * Il CARATTERE delle pagine dello studente — locale dal 15/9/2026.
 *
 * Prima le sette pagine servite via QR chiedevano Space Mono a
 * fonts.googleapis.com: in aula senza rete, o dietro il filtro della scuola, il
 * telefono cadeva su `ui-monospace` senza dire niente — e il carattere è
 * proprio la cosa che serve di più a un allievo dislessico. index.html lo aveva
 * già risolto il 18/8; queste pagine no.
 *
 * Qui si prova che (1) nessuna pagina chiede più il carattere alla rete,
 * (2) i file locali esistono e il percorso relativo li trova, (3) i tre server
 * LAN li servono davvero — e (4) che aver allargato la loro allowlist NON ha
 * aperto altro: un file fuori da `/public/fonts/` resta 403.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const leggi = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const PAGINE = [
    'public/live/student.html', 'public/live/scelta.html', 'public/live/materials.html',
    'public/live/file.html', 'public/live/timeline-build.html',
    'public/collab/student.html', 'public/tutor/student.html',
];
const SERVER = ['live-server.js', 'collab-server.js', 'tutor-server.js'];

test('nessuna pagina dello studente chiede Space Mono alla rete', () => {
    for (const p of PAGINE) {
        const html = leggi(p);
        const remoti = html.match(/<link[^>]*fonts\.googleapis[^>]*>/gi) || [];
        for (const l of remoti) {
            assert.equal(/Space\+?%?20?Mono/i.test(l), false, `${p}: Space Mono ancora dalla rete`);
        }
    }
});

test('ogni pagina dichiara Space Mono locale, e i due file esistono', () => {
    for (const p of PAGINE) {
        const html = leggi(p);
        assert.match(html, /@font-face[^}]*SpaceMono-Regular\.ttf/, `${p}: manca il @font-face regular`);
        assert.match(html, /@font-face[^}]*SpaceMono-Bold\.ttf/, `${p}: manca il @font-face bold`);
        // `../fonts/` da public/<cartella>/<pagina>.html → public/fonts/
        for (const rel of [...html.matchAll(/url\('(\.\.\/fonts\/[^']+)'\)/g)].map(m => m[1])) {
            const risolto = path.resolve(path.dirname(path.join(ROOT, p)), rel);
            assert.ok(fs.existsSync(risolto), `${p}: ${rel} non esiste (${risolto})`);
        }
    }
});

test('Noto Color Emoji resta dalla rete — è una scelta, non una dimenticanza', () => {
    // 25 MB di font contro una differenza di stile: la decisione è scritta in
    // index.html (18/8) e vale anche qui. Se un giorno si vendorizza, si
    // vendorizza un SOTTOINSIEME, e questo test va riscritto apposta.
    for (const p of PAGINE) {
        assert.match(leggi(p), /fonts\.googleapis\.com[^"']*Noto\+Color\+Emoji/,
            `${p}: sparito anche Noto — se voluto, aggiorna questo test`);
    }
});

test('i tre server LAN ammettono la cartella dei font e ne sanno il tipo', () => {
    for (const s of SERVER) {
        const src = leggi(s);
        assert.match(src, /'\/public\/fonts\/'/, `${s}: /public/fonts/ non è in STATIC_ALLOW`);
        assert.match(src, /'\.ttf':\s*'font\/ttf'/, `${s}: manca il MIME .ttf`);
    }
});

// ── La prova vera: un server acceso, richieste reali ────────────────────────
let srv, porta, dir;
const { createCollabServer } = require(path.join(ROOT, 'collab-server.js'));
const chiedi = (p) => fetch('http://127.0.0.1:' + porta + p).then(r => ({
    status: r.status, tipo: r.headers.get('content-type'), lungo: r.headers.get('content-length')
}));

before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'font-studente-'));
    srv = createCollabServer({ repoRoot: ROOT, dir, session: { name: 'Prova', rootLabel: 'Prova' } });
    porta = await srv.listen(0, '127.0.0.1');
});
after(async () => { if (srv) await srv.stop(); });

test('il server LAN serve davvero il .ttf al telefono', async () => {
    const r = await chiedi('/public/fonts/SpaceMono-Regular.ttf');
    assert.equal(r.status, 200);
    assert.equal(r.tipo, 'font/ttf');
});

test('allargare l\'allowlist NON ha aperto altro', async () => {
    for (const fuori of [
        '/main.js',                          // il main process
        '/public/js/app.js',                 // il core del renderer
        '/prompts_config.json',              // i prompt
        '/public/fonts/../js/app.js',        // risalita esplicita
        '/public/fontsxx/SpaceMono-Regular.ttf', // prefisso che SEMBRA quello giusto
    ]) {
        const r = await chiedi(fuori);
        assert.ok(r.status === 403 || r.status === 404,
            `${fuori} risponde ${r.status}: non deve uscire dal server`);
    }
});
