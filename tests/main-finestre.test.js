'use strict';
/*
 * main-finestre.test.js — la guardia delle finestre di main.js (packet 0123, lotto 1; packet 0028).
 *
 * Fino al 22/10/2026 `setWindowOpenHandler` rispondeva `allow` a qualunque indirizzo e nessuno
 * guardava dove la finestra principale navigava: un link esterno in una desc portava la finestra
 * col ponte `electronAPI` sul sito remoto. Qui il blocco della guardia si prende dal TESTO di
 * main.js (come fanno gli altri test di main.js: nessun `require` di Electron) e gira in una vm con
 * `shell`, `session` e `app` finti; le regole vengono dal core vero (`mappai-confini-core.js`).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Confini = require(path.join(__dirname, '..', 'public', 'js', 'mappai-confini-core.js'));

const MAIN = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const RADICE = 'file:///Users/giacomo/Claude/MappAI%20re';

function pezzo(da, a) {
    const i = MAIN.indexOf(da);
    assert.ok(i >= 0, 'main.js non contiene ' + JSON.stringify(da));
    const j = MAIN.indexOf(a, i);
    assert.ok(j > i, 'main.js: ' + JSON.stringify(da) + ' senza la chiusura ' + JSON.stringify(a));
    return MAIN.slice(i, j + a.length);
}

function banco() {
    const log = { esterni: [], avvisi: [], handlers: {} };
    const ctx = vm.createContext({
        console: { warn: (...a) => log.avvisi.push(a.join(' ')), log: () => { }, error: () => { } },
        shell: { openExternal: async (u) => { log.esterni.push(u); } },
        session: { defaultSession: { setPermissionRequestHandler: (fn) => { log.permessi = fn; } } },
        app: { on: (ev, fn) => { if (ev === 'web-contents-created') log.suFinestra = fn; } },
        ipcMain: { handle: (n, fn) => { log.handlers[n] = fn; } },
        Confini, RADICE_APP: RADICE
    });
    vm.runInContext(pezzo('function guardiaFinestre(', '\n}'), ctx);
    vm.runInContext(pezzo('function impostaPermessi(', '\n}'), ctx);
    vm.runInContext(pezzo("app.on('web-contents-created'", ');'), ctx);
    vm.runInContext(pezzo("ipcMain.handle('open-external',", '\n});'), ctx);
    vm.runInContext('impostaPermessi()', ctx);
    assert.equal(typeof log.suFinestra, 'function', 'main.js non registra web-contents-created');
    assert.equal(typeof log.permessi, 'function', 'impostaPermessi non imposta il gestore dei permessi');
    return log;
}

/* una finestra finta: registra i gestori che la guardia le mette addosso. Con `opener` è una figlia (window.open):
   Electron lo dà alla nascita, a `web-contents-created`, e lo lascia vuoto per le finestre che crea main.js (sonde 0129). */
function finestra(log, opener) {
    const f = { eventi: {}, opener: opener || null, on(ev, fn) { f.eventi[ev] = fn; return f; }, setWindowOpenHandler(fn) { f.apri = fn; } };
    log.suFinestra({}, f);
    assert.equal(typeof f.apri, 'function', 'nessun setWindowOpenHandler');
    assert.equal(typeof f.eventi['will-navigate'], 'function', 'nessun will-navigate');
    assert.equal(typeof f.eventi['will-frame-navigate'], 'function', 'nessun will-frame-navigate');
    return f;
}
const evento = (extra) => Object.assign({ fermato: false, preventDefault() { this.fermato = true; } }, extra || {});

test('il vecchio «allow a tutto» non c\'è più, e la guardia vale per ogni finestra (web-contents-created)', () => {
    assert.ok(!/setWindowOpenHandler\(\(\{ url \}\) => \{\s*return \{ action: 'allow' \};/.test(MAIN), 'main.js risponde ancora allow a tutto');
    assert.ok(MAIN.includes("app.on('web-contents-created'"), 'la guardia non è agganciata a web-contents-created');
    assert.ok(MAIN.includes("impostaPermessi()"), 'impostaPermessi non viene chiamata');
});

test('finestre nuove: quelle dell\'app si aprono, le esterne vanno al browser di sistema e qui si negano, il resto si nega e basta', () => {
    const log = banco(), f = finestra(log);
    assert.equal(f.apri({ url: 'about:blank' }).action, 'allow', 'la stampa del dossier (about:blank + document.write)');
    assert.equal(f.apri({ url: 'blob:file:///5c1a' }).action, 'allow', 'il PDF in blob:');
    assert.equal(f.apri({ url: 'http://127.0.0.1:3010/api/report?classe=4R' }).action, 'allow', 'il resoconto LIVE');
    assert.deepEqual(log.esterni, []);
    assert.equal(f.apri({ url: 'https://insegnai.ch' }).action, 'deny');
    assert.equal(f.apri({ url: 'mailto:giacomo@insegnai.ch' }).action, 'deny');
    assert.deepEqual(log.esterni, ['https://insegnai.ch', 'mailto:giacomo@insegnai.ch'], 'gli esterni passano da shell.openExternal');
    assert.equal(f.apri({ url: 'javascript:alert(1)' }).action, 'deny');
    assert.equal(f.apri({ url: 'smb://server/x' }).action, 'deny');
    assert.equal(log.esterni.length, 2, 'javascript: e smb: non arrivano a shell');
    assert.ok(log.avvisi.some(a => a.includes('javascript:alert(1)')), 'il rifiuto si legge in console');
});

test('la finestra principale naviga solo su un file dell\'app; mailto e https vanno fuori e la finestra resta', () => {
    const log = banco(), f = finestra(log), nav = f.eventi['will-navigate'];
    let e = evento(); nav(e, RADICE + '/public/index.html'); assert.equal(e.fermato, false, 'la ricarica (HOME) passa');
    e = evento(); nav(e, 'mailto:giacomo@insegnai.ch?subject=Segnalazione'); assert.equal(e.fermato, true);
    e = evento(); nav(e, 'https://evil.example/phish'); assert.equal(e.fermato, true);
    assert.deepEqual(log.esterni, ['mailto:giacomo@insegnai.ch?subject=Segnalazione', 'https://evil.example/phish']);
    e = evento(); nav(e, 'file:///tmp/evil.html'); assert.equal(e.fermato, true, 'un file fuori dall\'app');
    e = evento(); nav(e, 'javascript:alert(1)'); assert.equal(e.fermato, true);
    assert.equal(log.esterni.length, 2, 'file: e javascript: non vanno al browser');
    assert.ok(log.avvisi.some(a => a.includes('file:///tmp/evil.html')));
});

const REPORT = 'http://127.0.0.1:3010/api/report?admin=a1b2c3&which=students';

test('una figlia (con `opener`) carica i report del LIVE, i PDF in blob: e le stampe; un esterno va al browser, un file fuori dall\'app no (packet 0129)', () => {
    const log = banco(), f = finestra(log, { url: RADICE + '/public/index.html' }), nav = f.eventi['will-navigate'];
    [REPORT, 'http://127.0.0.1:3010/api/report?admin=a1b2c3&which=questions', 'http://127.0.0.1:3011/api/report?admin=z9&which=workshop',
        'blob:file:///5c1a-0f', 'about:blank'].forEach(u => { const e = evento(); nav(e, u); assert.equal(e.fermato, false, u); });
    assert.ok(!log.avvisi.some(a => a.includes('rifiutata')), 'nessun rifiuto nel log: ' + log.avvisi.join(' | '));
    let e = evento(); nav(e, 'https://evil.example/'); assert.equal(e.fermato, true);
    assert.deepEqual(log.esterni, ['https://evil.example/'], 'l\'esterno va al browser di sistema');
    e = evento(); nav(e, 'file:///tmp/evil.html'); assert.equal(e.fermato, true, 'un file fuori dall\'app: con file: la figlia avrebbe il ponte della madre');
    e = evento(); nav(e, 'javascript:alert(1)'); assert.equal(e.fermato, true);
    e = evento(); nav(e, 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html'); assert.equal(e.fermato, true, 'il lettore dei PDF sta in una cornice, non al posto della figlia');
    assert.equal(log.esterni.length, 1, 'file:, javascript: e chrome-extension: non vanno al browser');
});

test('la finestra col ponte (senza `opener`) non va sul server del LIVE; una figlia resta figlia anche se poi perde l\'opener (packet 0129)', () => {
    const log = banco(), madre = finestra(log);
    const e = evento(); madre.eventi['will-navigate'](e, REPORT);
    assert.equal(e.fermato, true, 'la finestra col ponte resta stretta');
    // `opener` si legge alla nascita: se la madre ricarica o si chiude, la regola della figlia non cambia
    const figlia = finestra(log, { url: RADICE + '/public/index.html' });
    figlia.opener = null;
    const e2 = evento(); figlia.eventi['will-navigate'](e2, 'blob:file:///5c1a-0f');
    assert.equal(e2.fermato, false);
});

test('le cornici (iframe): il riquadro principale lo tratta will-navigate; una cornice interna verso un sito esterno si ferma e va al browser', () => {
    const log = banco(), f = finestra(log), nav = f.eventi['will-frame-navigate'];
    let e = evento({ url: 'https://evil.example/', isMainFrame: true }); nav(e);
    assert.equal(e.fermato, false, 'il riquadro principale non si gestisce due volte');
    assert.deepEqual(log.esterni, []);
    e = evento({ url: 'https://evil.example/', isMainFrame: false }); nav(e);
    assert.equal(e.fermato, true); assert.deepEqual(log.esterni, ['https://evil.example/']);
    ['about:srcdoc', 'about:blank', 'blob:file:///x', 'data:text/html,x', 'chrome-extension://abc/index.html', 'http://127.0.0.1:9/']
        .forEach(u => { const ev = evento({ url: u, isMainFrame: false }); nav(ev); assert.equal(ev.fermato, false, u); });
    e = evento({ url: 'javascript:1', isMainFrame: false }); nav(e); assert.equal(e.fermato, true);
    assert.equal(log.esterni.length, 1);
});

test('permessi del browser: solo gli appunti; ogni negato si legge in console', () => {
    const log = banco();
    const risposte = [];
    const chiedi = (p) => log.permessi({}, p, (ok) => risposte.push(p + ':' + ok), {});
    chiedi('clipboard-sanitized-write'); chiedi('media'); chiedi('notifications'); chiedi('openExternal'); chiedi('fullscreen');
    assert.deepEqual(risposte, ['clipboard-sanitized-write:true', 'media:false', 'notifications:false', 'openExternal:false', 'fullscreen:false']);
    assert.equal(log.avvisi.filter(a => a.includes('negato')).length, 4);
});

test('open-external: solo http, https e mailto; un file: o uno schema che lancia un programma non arriva a shell', async () => {
    const log = banco(), h = log.handlers['open-external'];
    assert.equal(typeof h, 'function');
    assert.equal((await h({}, 'https://insegnai.ch/mappai/guida/')).success, true);
    assert.equal((await h({}, 'mailto:giacomo@insegnai.ch')).success, true);
    const r1 = await h({}, 'file:///Applications/Calculator.app');
    assert.equal(r1.success, false); assert.ok(r1.error);
    const r2 = await h({}, 'smb://server/condivisa');
    assert.equal(r2.success, false);
    const r3 = await h({}, 'javascript:alert(1)');
    assert.equal(r3.success, false);
    assert.deepEqual(log.esterni, ['https://insegnai.ch/mappai/guida/', 'mailto:giacomo@insegnai.ch']);
});
