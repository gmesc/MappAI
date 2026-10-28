'use strict';
/*
 * confini-core.test.js — le regole pure di `mappai-confini-core.js` (packet 0123, lotto 1; packet 0028).
 *
 * Tre domande, tre funzioni, zero Electron:
 *   - `apertura(url)`: una finestra nuova (window.open, un link con target) è dell'app, va al browser di
 *     sistema o non si apre affatto;
 *   - `navigazioneAmmessa(url, { radiceApp, figlia })`: la finestra principale (quella col ponte `electronAPI`)
 *     può andare SOLO su un file dell'app; una figlia (window.open, senza ponte) anche sul resto dell'app (0129);
 *   - `permessoAmmesso(nome)`: quali permessi del browser l'app concede (misurato il 22/10: solo gli appunti).
 * Le tabelle qui sotto sono il contratto: una riga nuova nel codice senza la sua riga qui non vale.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const C = require(path.join(__dirname, '..', 'public', 'js', 'mappai-confini-core.js'));

test('apertura: le finestre dell\'app — vuoto, about:, blob:, data:, file:, i server LAN su 127.0.0.1 e localhost, le pagine interne di Chromium', () => {
    const app = ['', 'about:blank', 'about:srcdoc', 'blob:file:///5c1a-0f', 'data:text/html;charset=utf-8,%3Ch1%3Eciao',
        'file:///Users/x/Documents/MappAI%20-%20file/Classi/a/b.pdf', 'http://127.0.0.1:3010/api/report?classe=4R',
        'http://localhost:8766/index.html?vault=dev', 'http://[::1]:9777/', 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html',
        'devtools://devtools/bundled/devtools_app.html', 'chrome://gpu'];
    app.forEach(u => assert.equal(C.apertura(u), 'app', u));
    assert.equal(C.apertura(null), 'app', 'window.open() senza indirizzo');
    assert.equal(C.apertura(undefined), 'app');
});

test('apertura: fuori dall\'app — http e https verso qualunque altro host, mailto', () => {
    const esterni = ['https://insegnai.ch', 'https://www.insegnai.ch/mappai.html', 'http://example.com/x', 'HTTPS://INSEGNAI.CH',
        'mailto:giacomo@insegnai.ch?subject=MappAI', '  https://aistudio.google.com/app/apikey  ',
        'http://127.0.0.1.evil.example/', 'http://localhost.evil.example/', 'https://127.0.0.1:443@evil.example/'];
    esterni.forEach(u => assert.equal(C.apertura(u), 'esterno', u));
});

test('apertura: mai — javascript:, gli schemi che lanciano un programma, ciò che non è un indirizzo', () => {
    const no = ['javascript:alert(1)', 'JavaScript:void(0)', 'smb://server/condivisa', 'ftp://x.y/z', 'ms-settings:display',
        'x-apple.systempreferences:com.apple.preference', 'vbscript:x', 'non è un indirizzo', 'http://', '://x'];
    no.forEach(u => assert.equal(C.apertura(u), 'no', u));
});

test('schemaEsterno: solo http, https e mailto, qualunque sia l\'host (è il filtro di «open-external»)', () => {
    ['https://insegnai.ch', 'http://127.0.0.1:3010/', 'mailto:a@b.c'].forEach(u => assert.equal(C.schemaEsterno(u), true, u));
    ['file:///Applications/Calculator.app', 'smb://srv/x', 'javascript:1', 'about:blank', 'data:text/html,x', '', null, 'x'].forEach(u =>
        assert.equal(C.schemaEsterno(u), false, String(u)));
});

/* la tabella della finestra col ponte: la legge anche il test delle figlie, che senza `figlia` deve dare gli stessi esiti */
const radice = 'file:///Users/giacomo/Claude/MappAI%20re';
const NAV_SI = [radice + '/public/index.html', radice + '/public/index.html?v=1#tab', 'file:///Users/giacomo/Claude/MappAI re/public/index.html',
    radice + '/tools/voxel-proto/studio.html'];
const NAV_NO = ['file:///Users/giacomo/Claude/MappAI%20re2/public/index.html', radice + '/../evil.html', 'file:///tmp/evil.html',
    'https://insegnai.ch', 'about:blank', 'data:text/html,x', 'blob:file:///x', 'javascript:1', 'mailto:a@b.c', radice, ''];

test('navigazioneAmmessa: la finestra col ponte va solo su un file sotto la radice dell\'app', () => {
    NAV_SI.forEach(u => assert.equal(C.navigazioneAmmessa(u, { radiceApp: radice }), true, u));
    NAV_NO.forEach(u => assert.equal(C.navigazioneAmmessa(u, { radiceApp: radice }), false, u));
    // la radice con la barra finale vale uguale; senza radice non si naviga da nessuna parte
    assert.equal(C.navigazioneAmmessa(radice + '/public/index.html', { radiceApp: radice + '/' }), true);
    assert.equal(C.navigazioneAmmessa(radice + '/public/index.html', {}), false);
    assert.equal(C.navigazioneAmmessa(radice + '/public/index.html'), false);
    // Windows: la lettera del disco
    const win = 'file:///C:/Users/docente/AppData/Local/Programs/MappAI/resources/app.asar';
    assert.equal(C.navigazioneAmmessa(win + '/public/index.html', { radiceApp: win }), true);
    assert.equal(C.navigazioneAmmessa('file:///C:/Users/docente/Desktop/x.html', { radiceApp: win }), false);
});

test('navigazioneAmmessa con `figlia` (packet 0129): la finestra aperta da window.open carica i server su 127.0.0.1 e localhost, blob: e about:; un file: solo sotto la radice', () => {
    const figlia = { radiceApp: radice, figlia: true };
    const si = ['http://127.0.0.1:3010/api/report?admin=a1b2c3&which=students', 'http://localhost:3010/api/report?admin=a1b2c3&which=questions',
        'http://[::1]:3010/', 'blob:file:///5c1a-0f', 'about:blank', radice + '/public/index.html'];
    si.forEach(u => assert.equal(C.navigazioneAmmessa(u, figlia), true, u));
    // un file: fuori dalla radice resta fuori anche per una figlia: con file: Electron le dà l'origine della madre, e quindi il suo ponte (sonda 3, 27/10);
    // e fuori il resto che `apertura` dà 'app' ma che nessuna figlia carica (Giacomo, 27/10: i tre tipi)
    const no = ['file:///tmp/evil.html', 'file:///Users/giacomo/Downloads/x.html', radice + '/../evil.html', 'https://evil.example/',
        'https://insegnai.ch', 'mailto:a@b.c', 'javascript:1', 'smb://srv/x', 'http://127.0.0.1.evil/', 'x y', '',
        'data:text/html,x', 'chrome://gpu', 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html', 'devtools://devtools/bundled/inspector.html'];
    no.forEach(u => assert.equal(C.navigazioneAmmessa(u, figlia), false, u));
    // i report non chiedono la radice; un file: sì
    assert.equal(C.navigazioneAmmessa('blob:file:///5c1a-0f', { figlia: true }), true);
    assert.equal(C.navigazioneAmmessa(radice + '/public/index.html', { figlia: true }), false);
    // senza `figlia`, o con `figlia: false`, la tabella della finestra col ponte intera: il report del LIVE non ci entra
    [undefined, false].forEach(f => {
        NAV_SI.forEach(u => assert.equal(C.navigazioneAmmessa(u, { radiceApp: radice, figlia: f }), true, u + ' figlia=' + f));
        NAV_NO.forEach(u => assert.equal(C.navigazioneAmmessa(u, { radiceApp: radice, figlia: f }), false, u + ' figlia=' + f));
        assert.equal(C.navigazioneAmmessa(si[0], { radiceApp: radice, figlia: f }), false, 'figlia=' + f);
    });
});

test('permessoAmmesso: solo la scrittura negli appunti; tutto il resto negato', () => {
    assert.equal(C.permessoAmmesso('clipboard-sanitized-write'), true);
    ['media', 'geolocation', 'notifications', 'fullscreen', 'pointerLock', 'openExternal', 'fileSystem', 'clipboard-read',
        'display-capture', 'unknown', '', null].forEach(p => assert.equal(C.permessoAmmesso(p), false, String(p)));
    assert.deepEqual(C.PERMESSI_AMMESSI, ['clipboard-sanitized-write']);
});

/* ── 0123 lotto 4 (0027): IL PERCORSO STA SOTTO UNA RADICE ─────────────────────────────────────────────
   Una regola sola per tutti gli sportelli di main.js che toccano il disco. I percorsi arrivano già
   risolti da main.js (`vero` = realpath dell'antenato che esiste); qui si confrontano i segmenti. */
test('sottoRadice: dentro una radice o coincidente — sì; accanto, sopra o altrove — no', () => {
    const R = ['/Users/d/Documents/MappAI - file', '/Users/d/Library/Application Support/mappai/dev'];
    const si = ['/Users/d/Documents/MappAI - file', '/Users/d/Documents/MappAI - file/', '/Users/d/Documents/MappAI - file/Classi/4R/Storia/Svizzera',
        '/Users/d/Documents/MappAI - file/Classi/./4R//Storia', '/Users/d/Library/Application Support/mappai/dev/visione-tmp/x.png',
        '/Users/d/Documents/MappAI - file/Classi/4R/../4S/Storia'];
    si.forEach(p => assert.equal(C.sottoRadice(p, R), true, p));
    const no = ['/Users/d/Documents/MappAI - file2/x', '/Users/d/Documents/MappAI - fil', '/Users/d/Documents', '/Users/d/Library/LaunchAgents/x.plist',
        '/Users/d/.ssh/id_ed25519', '/Users/d/Documents/MappAI - file/../.ssh/id', '/Users/d/Documents/MappAI - file/Classi/../../../.ssh/id',
        '/', '', null, undefined, 42, 'Classi/4R', './MappAI - file/x', '/Users/d/Documents/MappAI - file\0/x'];
    no.forEach(p => assert.equal(C.sottoRadice(p, R), false, String(p)));
    assert.equal(C.sottoRadice('/Users/d/Documents/MappAI - file/x', []), false, 'senza radici niente');
    assert.equal(C.sottoRadice('/Users/d/Documents/MappAI - file/x'), false);
    assert.equal(C.sottoRadice('/Users/d/x', ['', null, 'relativa']), false, 'una radice vuota o relativa non apre niente');
});

test('sottoRadice: i link simbolici si risolvono con `vero` prima del confronto, da tutte e due le parti', () => {
    const vero = (p) => p.replace(/^\/tmp(?=\/|$)/, '/private/tmp').replace('/MappAI - file/scorciatoia', '/Users/d/.ssh');
    const R = ['/tmp/casa/MappAI - file'];
    assert.equal(C.sottoRadice('/private/tmp/casa/MappAI - file/Classi/x', R, { vero }), true, '/tmp è /private/tmp');
    assert.equal(C.sottoRadice('/tmp/casa/MappAI - file/Classi/x', R, { vero }), true);
    assert.equal(C.sottoRadice('/tmp/casa/MappAI - file/scorciatoia/id_ed25519', R, { vero }), false, 'un link che porta fuori resta fuori');
    // un `vero` che lancia non apre niente di più: si confronta il percorso così com'è
    assert.equal(C.sottoRadice('/tmp/casa/MappAI - file/x', R, { vero: () => { throw new Error('no'); } }), true);
    assert.equal(C.sottoRadice('/etc/passwd', R, { vero: () => { throw new Error('no'); } }), false);
});

test('sottoRadice: maiuscole e minuscole uguali solo se il disco le confonde (APFS, NTFS)', () => {
    const R = ['/Users/d/Documents/MappAI - file'];
    assert.equal(C.sottoRadice('/users/d/documents/mappai - FILE/Classi', R), false, 'di serie le maiuscole contano');
    assert.equal(C.sottoRadice('/users/d/documents/mappai - FILE/Classi', R, { ignoraMaiuscole: true }), true);
    assert.equal(C.sottoRadice('/users/d/documents/mappai - FILE2/Classi', R, { ignoraMaiuscole: true }), false);
});

test('sottoRadice: Windows — barre rovesciate e lettera del disco; fuori da Windows la barra rovesciata è un carattere', () => {
    const W = { windows: true, ignoraMaiuscole: true };
    const R = ['C:\\Users\\docente\\Documents\\MappAI - file'];
    ['C:\\Users\\docente\\Documents\\MappAI - file\\Classi\\4R', 'c:/users/docente/documents/mappai - file/Classi',
        'C:\\Users\\docente\\Documents\\MappAI - file'].forEach(p => assert.equal(C.sottoRadice(p, R, W), true, p));
    ['D:\\Users\\docente\\Documents\\MappAI - file\\x', 'C:\\Users\\docente\\Documents\\MappAI - file\\..\\..\\AppData\\x',
        'C:\\Users\\docente\\Documents\\MappAI - file2', 'Users\\docente\\Documents\\MappAI - file\\x', 'C:relativo\\x'].forEach(p =>
        assert.equal(C.sottoRadice(p, R, W), false, p));
    // su macOS `..\x` è il NOME di una cartella: non risale, e non fa entrare chi sta fuori
    assert.equal(C.sottoRadice('/altrove/..\\Users\\d\\MappAI - file\\x', ['/Users/d/MappAI - file']), false);
    assert.equal(C.sottoRadice('/Users/d/MappAI - file/a\\..\\..\\b', ['/Users/d/MappAI - file']), true, 'è un file con un nome strano, dentro');
});

/* Le fonti di CREA (un .docx, una foto, un audio o un video) arrivano dalla finestra di sistema, da
   qualunque cartella (Scaricati, Scrivania, iCloud): il confine non è la cartella ma il TIPO, e mai
   un file dentro una cartella nascosta (~/.ssh, ~/.aws, ~/.config). */
test('fonteLeggibile: l\'estensione giusta, fuori dalle cartelle nascoste', () => {
    const DOCX = ['.docx'];
    assert.equal(C.fonteLeggibile('/Users/d/Downloads/Verifica Storia.docx', DOCX), true);
    assert.equal(C.fonteLeggibile('/Users/d/Library/Mobile Documents/com~apple~CloudDocs/Relazione.DOCX', DOCX), true, 'maiuscole');
    ['/Users/d/.ssh/id_ed25519', '/Users/d/.ssh/x.docx', '/Users/d/Downloads/x.docx/../../.aws/credentials', '/Users/d/Downloads/x.doc',
        '/Users/d/Downloads/x.docx.app', '/Users/d/Downloads/docx', 'Downloads/x.docx', '', null, '/Users/d/.config/a/b.docx'].forEach(p =>
        assert.equal(C.fonteLeggibile(p, DOCX), false, String(p)));
    assert.equal(C.fonteLeggibile('/Users/d/x.docx', []), false, 'senza estensioni niente');
    assert.equal(C.fonteLeggibile('C:\\Users\\d\\Downloads\\a.MP4', ['.mp4'], { windows: true }), true);
    // un link simbolico che porta in una cartella nascosta resta fuori
    assert.equal(C.fonteLeggibile('/Users/d/Downloads/scorciatoia.docx', DOCX, { vero: () => '/Users/d/.ssh/x.docx' }), false);
});
