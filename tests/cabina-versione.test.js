'use strict';
/*
 * cabina-versione.test.js — packet 0088 (beta.6): la versione e la licenza si dichiarano, a schermo e nel pacchetto.
 *
 *  R1  `package.json` e `package-lock.json` dicono la stessa versione (una beta, non più la beta.5).
 *  R2  la segnalazione via email porta la versione VERA (letta dallo user agent di Electron, `MappAI/<versione>`),
 *      non più la cifra fissa «1.0.0»; senza user agent dice «sconosciuta».
 *  R3  Cabina › «insegnai.ch» ha un riquadro «Versione e licenza» (versione dallo user agent, «—» se manca; licenza GPL;
 *      due collegamenti che si aprono nel browser di sistema) e il pacchetto contiene LICENSE e THIRD-PARTY-NOTICES.md.
 *
 * La console VERA `mappai-cabina.js` in una vm, con un motore dei modali finto che tiene lo schema e lascia chiamare
 * `suAzione`. ⚠️ Negli assert solo booleani, testi e numeri, mai l'oggetto.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RADICE = path.join(__dirname, '..');
const JS = f => fs.readFileSync(path.join(RADICE, 'public', 'js', f), 'utf8');
const TC = require('../public/js/mappai-teach-core.js');
const VC = require('../public/js/mappai-vista-core.js');

const UA_ELECTRON = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) MappAI/1.0.0-beta.6 Chrome/146.0.0.0 Electron/41.10.7 Safari/537.36';

/* `userAgent` undefined = NIENTE `navigator` nella vm */
function cabina(userAgent) {
  const esterni = [];
  let aperta = null;
  const schemi = [];
  const box = { querySelector: () => null };
  const win = {
    t: (_k, f) => f, showToast() { },
    MappAIModal: { open: s => { aperta = s; return new Promise(() => { }); }, conferma: () => Promise.resolve(true) },
    MappAITeacherProfile: { get: () => ({}), sezioni: () => [], assorbi() { } },
    MappAIFilesCore: { SUB: { mappe: 'Mappe' } }, MappAITeachCore: TC, MappAIVistaCore: VC,
    MappAIErrori: { cassetto: () => ({ pct: 10, livello: 'ok' }) },
    electronAPI: { filesRootGet: async () => ({ organized: true, rootDir: '/R' }), openExternal: u => { esterni.push(u); } },
    addEventListener() { }
  };
  const sandbox = {
    window: win, console: { log() { }, warn() { }, error() { } }, setTimeout,
    document: { addEventListener() { }, querySelector: () => null, documentElement: { dataset: {} } },
    StorageManager: { validVaultFolders: null },
    localStorage: { getItem: () => null, setItem() { }, removeItem() { }, get length() { return 0; }, key: () => null }
  };
  if (userAgent !== undefined) sandbox.navigator = { userAgent };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(JS('mappai-cabina.js'), ctx);
  const rid = s => { schemi.push(s); return box; };
  return {
    esterni,
    apri: async () => {
      win.MappAICabina.apri('insegnai');
      aperta.suApertura(box, rid);
      for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r));
    },
    schema: () => schemi[schemi.length - 1] || aperta,
    azione: id => aperta.suAzione({ azione: id, valori: {} }, box, rid)
  };
}
/* gli array nati dentro la vm hanno un altro prototipo: si confrontano per JSON */
const J = x => JSON.parse(JSON.stringify(x));
const riquadro = S => S.sezioni.find(x => x.id === 'in-ver');
const dato = (S, etichetta) => (riquadro(S).dati.find(d => d.etichetta === etichetta) || {}).valore;

// ── R3 · la Cabina ───────────────────────────────────────────────────────────────────────────────
test('0088 R3: Cabina › insegnai.ch ha il riquadro «Versione e licenza», largo, con la versione dello user agent', async () => {
  const c = cabina(UA_ELECTRON);
  await c.apri();
  const S = c.schema();
  assert.equal(!!riquadro(S), true);
  assert.equal(riquadro(S).titolo, 'Versione e licenza');
  assert.equal(riquadro(S).largo, true);
  assert.equal(dato(S, 'Versione'), '1.0.0-beta.6');
  assert.equal(dato(S, 'Licenza'), 'Software libero: GNU GPL v3 o successiva');
  const ids = S.sezioni.map(x => x.id);
  assert.deepEqual(J(ids.slice(ids.indexOf('in-ver') - 1, ids.indexOf('in-ver') + 2)), ['in-prog', 'in-ver', 'in-link']);
});

test('0088 R3: senza `navigator`, o con uno user agent che non nomina MappAI, la versione è «—» (mai inventata)', async () => {
  for (const ua of [undefined, '', 'Mozilla/5.0 Chrome/146 Safari/537.36', 'Mozilla/5.0 MappAI senza numero Chrome/146']) {
    const c = cabina(ua);
    await c.apri();
    assert.equal(dato(c.schema(), 'Versione'), '—', String(ua));
  }
});

test('0088 R3: la versione si legge anche in minuscolo e con una beta o una release candidate', async () => {
  for (const [ua, atteso] of [['x mappai/2.1.0 y', '2.1.0'], ['x MAPPAI/1.0.0-rc.1 y', '1.0.0-rc.1'], ['x MappAI/1.0.0-beta.7 Chrome/1', '1.0.0-beta.7']]) {
    const c = cabina(ua);
    await c.apri();
    assert.equal(dato(c.schema(), 'Versione'), atteso, ua);
  }
});

test('0088 R3: i due collegamenti del riquadro si aprono nel browser di sistema; «Dove trovarmi» resta com\'era', async () => {
  const c = cabina(UA_ELECTRON);
  await c.apri();
  const azioni = riquadro(c.schema()).azioni;
  assert.deepEqual(J(azioni.map(a => [a.id, a.etichetta, a.icona, a.chiude])),
    [['ins:codice', 'Codice sorgente', 'code-xml', false], ['ins:versioni', 'Versioni e note di rilascio', 'tag', false]]);
  c.azione('ins:codice');
  c.azione('ins:versioni');
  assert.deepEqual(c.esterni, ['https://github.com/gmesc/MappAI', 'https://github.com/gmesc/MappAI/releases']);
  const link = c.schema().sezioni.find(x => x.id === 'in-link');
  assert.deepEqual(J(link.azioni.map(a => a.id)), ['ins:sito', 'ins:mail', 'ins:ig', 'ins:fb'], 'i collegamenti della persona non si mescolano con quelli del software');
});

test('0088 R3: la nota della vista non promette più «versione e note di rilascio» che «finiranno» qui', async () => {
  const c = cabina(UA_ELECTRON);
  await c.apri();
  assert.equal(c.schema().nota, 'Le novità di ogni versione stanno nelle note di rilascio, su GitHub.');
});

// ── R2 · la segnalazione via email ───────────────────────────────────────────────────────────────
test('0088 R2: la «Versione App» della segnalazione si legge dallo user agent; senza, «sconosciuta»', () => {
  const src = fs.readFileSync(path.join(RADICE, 'public', 'js', 'app.js'), 'utf8');
  assert.equal(/const appVersion = "1\.0\.0";/.test(src), false, 'la cifra fissa è sparita');
  const riga = src.split('\n').find(r => r.includes('const appVersion ='));
  assert.equal(!!riga, true);
  const valuta = userAgent => vm.runInNewContext(riga.trim().replace(/^const /, 'var ') + '; appVersion', { userAgent });
  assert.equal(valuta(UA_ELECTRON), '1.0.0-beta.6');
  assert.equal(valuta('Mozilla/5.0 Chrome/146'), 'sconosciuta');
  assert.equal(valuta(undefined), 'sconosciuta');
  assert.equal(src.includes('`Versione App: ${appVersion}\\n`'), true, 'la riga della email usa la variabile');
});

// ── R1 · il pacchetto ────────────────────────────────────────────────────────────────────────────
test('0088 R1: package.json e package-lock.json dicono la stessa versione, e non è più la beta.5', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(RADICE, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(RADICE, 'package-lock.json'), 'utf8'));
  assert.equal(pkg.version, lock.version);
  assert.equal(pkg.version, lock.packages[''].version);
  assert.equal(pkg.version === '1.0.0-beta.5', false);
  assert.equal(/^1\.0\.0-beta\.\d+$/.test(pkg.version), true, pkg.version);
});

test('0088 R3: LICENSE e THIRD-PARTY-NOTICES.md esistono e vanno nel pacchetto (build.files)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(RADICE, 'package.json'), 'utf8'));
  for (const f of ['LICENSE', 'THIRD-PARTY-NOTICES.md']) {
    assert.equal(fs.existsSync(path.join(RADICE, f)), true, f + ' esiste');
    assert.equal(pkg.build.files.includes(f), true, f + ' è in build.files');
  }
  assert.match(fs.readFileSync(path.join(RADICE, 'LICENSE'), 'utf8'), /GNU GENERAL PUBLIC LICENSE/);
});
