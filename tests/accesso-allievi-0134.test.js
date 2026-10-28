'use strict';
/*
 * accesso-allievi-0134.test.js — un solo accesso per gli allievi (packet 0134).
 *
 * Le cinque pagine di accesso alle attività live (Mappa LIVE, Quiz e «Completa la timeline», Domande aperte,
 * «Costruisci la timeline», Chiedi e Rispondi) prendono le sei righe da un modulo solo,
 * public/js/mappai-accesso-allievi.js: progetto, classe, nome dell'attività, emoji, numero, «Entra».
 * Qui: il modulo (puro in Node), le pagine (che lo caricano e non hanno più il loro accesso), i tre server
 * (servono il file e mandano `attivita` in /api/session) e le emoji dei gruppi nascoste ma valide (D1).
 */
const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'public', 'js', 'mappai-accesso-allievi.js');
const URL_MODULO = '/public/js/mappai-accesso-allievi.js';
const LC = require(path.join(ROOT, 'public', 'js', 'mappai-live-core.js'));
const CC = require(path.join(ROOT, 'public', 'js', 'mappai-collab-core.js'));
const LR = require(path.join(ROOT, 'public', 'js', 'mappai-live-reports.js'));
const TR = require(path.join(ROOT, 'public', 'js', 'mappai-tutor-reports.js'));

const _cartelleTmp = [];
function tmpDir(prefisso) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefisso));
  _cartelleTmp.push(d);
  return d;
}
after(() => { _cartelleTmp.forEach(d => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} }); });

function modulo() { return require(FILE); }
function conta(s, ago) { return s.split(ago).length - 1; }
function ordine(s, aghi) {
  const pos = aghi.map(a => s.indexOf(a));
  return pos.every((p, i) => p >= 0 && (i === 0 || p > pos[i - 1]));
}
/* le regole del CSS come coppie { sel, corpo }; i blocchi @supports e @media danno le loro regole interne */
function regole(css) {
  const out = [], re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) out.push({ sel: m[1].trim(), corpo: m[2] });
  return out;
}

// ── Il modulo ──────────────────────────────────────────────────────────────

test('il modulo è UMD e scritto in ES5 (le pagine degli allievi girano su iPad vecchi)', () => {
  assert.ok(fs.existsSync(FILE), 'manca public/js/mappai-accesso-allievi.js');
  const src = fs.readFileSync(FILE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/\b(let|const|class)\s/.test(src), 'niente let, const, class');
  assert.ok(!src.includes('=>'), 'niente frecce');
  assert.ok(!src.includes('`'), 'niente template');
  assert.ok(src.includes('module.exports') && src.includes('window.MappAIAccesso'), 'UMD: Node e browser');
  const A = modulo();
  ['stile', 'html', 'monta', 'errore'].forEach(k => assert.strictEqual(typeof A[k], 'function', k));
});

test('html(): le sei righe nell\'ordine, senza titolo dell\'app e senza «La tua classe»', () => {
  const h = modulo().html({ progetto: 'Sistema Albero', classe: '1A', attivita: 'Scelta multipla · Esempio concreto',
    modo: 'singolo', emoji: LC.EMOJI_SET });
  assert.ok(ordine(h, ['ma-progetto', 'ma-classe', 'ma-attivita', 'ma-griglia', 'ma-numero', 'ma-entra', 'ma-errore']), 'ordine delle righe');
  assert.ok(/<h1 class="ma-progetto">Sistema Albero<\/h1>/.test(h), 'riga 1: il progetto è il titolo');
  assert.ok(/class="ma-classe">1A</.test(h), 'riga 2: la classe');
  assert.ok(/class="ma-attivita">Scelta multipla · Esempio concreto</.test(h), 'riga 3: l\'attività');
  assert.ok(!/<h1[^>]*>\s*(Mappa LIVE|MappAI Live|Domande a scelta|Chiedi e Rispondi)/.test(h), 'nessun titolo dell\'app');
  assert.ok(!h.includes('La tua classe'), 'niente campo della classe (D2)');
  assert.strictEqual(conta(h, 'class="ma-cella"'), 12, '12 celle');
  assert.ok(h.includes('placeholder="Il tuo numero (es. 07)"'), 'il testo di esempio (D6)');
  assert.ok(h.includes('inputmode="numeric"') && h.includes('aria-label="Il tuo numero"'), 'tastiera numerica ed etichetta per la sintesi vocale');
  assert.ok(/<button type="button" class="ma-entra[^"]*">Entra<\/button>/.test(h), 'riga 6: Entra');
});

test('Mappa LIVE: «Mappa LIVE» è la riga 3, non il titolo (D9)', () => {
  const h = modulo().html({ progetto: 'Sistema Albero', classe: '1A', attivita: CC.NOME_ATTIVITA, modo: 'singolo', emoji: LC.EMOJI_SET });
  assert.strictEqual(CC.NOME_ATTIVITA, 'Mappa LIVE');
  assert.ok(/class="ma-attivita">Mappa LIVE</.test(h));
  assert.ok(!/<h1[^>]*>Mappa LIVE/.test(h));
});

test('classe vuota: la riga 2 non compare, le altre restano (D5)', () => {
  const h = modulo().html({ progetto: 'Sistema Albero', classe: '', attivita: 'Mappa LIVE', modo: 'singolo', emoji: LC.EMOJI_SET });
  assert.ok(!h.includes('ma-classe'));
  assert.ok(ordine(h, ['ma-progetto', 'ma-attivita', 'ma-griglia', 'ma-numero', 'ma-entra']));
});

test('gruppi a emoji: tre file da 4 con le etichette, l\'anteprima al posto del numero (D1, D7)', () => {
  const h = modulo().html({ progetto: 'Sistema Albero', classe: '1A', attivita: 'Mappa LIVE', modo: 'gruppo-emoji',
    gruppi: CC.grigliaGruppi([]) });
  assert.strictEqual(conta(h, 'class="ma-fila"'), 3, 'tre file');
  assert.strictEqual(conta(h, 'class="ma-cella"'), 12, '4 + 4 + 4');
  ['Animali', 'Cibo', 'Mezzi'].forEach(e => assert.ok(h.includes('>' + e + '<'), 'etichetta ' + e));
  assert.ok(ordine(h, ['ma-attivita', 'ma-gruppi', 'ma-anteprima', 'ma-entra']));
  assert.ok(!h.includes('ma-numero'), 'a gruppi niente numero');
  assert.ok(!h.includes('Scegli un\'emoji per ogni fila'), 'la frase dei gruppi esce (D7)');
});

test('gruppi col nome (LIVE, Timeline): la riga 4 è il campo «Nome del gruppo» (D8)', () => {
  const h = modulo().html({ progetto: 'Sistema Albero', classe: '1A', attivita: 'Timeline', modo: 'gruppo-nome' });
  assert.ok(ordine(h, ['ma-attivita', 'ma-nome', 'ma-entra']));
  assert.ok(h.includes('aria-label="Nome del gruppo"'));
  assert.ok(!h.includes('ma-griglia') && !h.includes('ma-numero'));
});

test('rientro rapido: emoji e numero già scelti, o le tre emoji già scelte', () => {
  const A = modulo();
  const h = A.html({ progetto: 'P', classe: '1A', attivita: 'Chiedi e Rispondi', modo: 'singolo', emoji: LC.EMOJI_SET,
    preseleziona: { emojiKey: 'volpe', num: '07' } });
  assert.ok(/data-key="volpe" aria-pressed="true"/.test(h), 'la volpe è premuta');
  assert.strictEqual(conta(h, 'aria-pressed="true"'), 1);
  assert.ok(h.includes('value="07"'));
  const g = A.html({ progetto: 'P', attivita: 'Mappa LIVE', modo: 'gruppo-emoji', gruppi: CC.grigliaGruppi([]),
    preseleziona: { combo: ['volpe', 'fragola', 'razzo'] } });
  assert.ok(/class="ma-anteprima[^"]*"[^>]*>🦊🍓🚀</.test(g), 'l\'anteprima mostra l\'identità del gruppo');
});

test('stile(): griglia, campo, anteprima ed «Entra» hanno UNA regola di larghezza, il 75% del lato corto (D4)', () => {
  const css = modulo().stile();
  const R = regole(css);
  const larghe = R.filter(r => /(^|[;\s])width\s*:/.test(r.corpo) && /ma-(griglia|gruppi|campo|anteprima|entra)/.test(r.sel));
  assert.strictEqual(larghe.length, 1, 'una regola sola: ' + larghe.map(r => r.sel).join(' | '));
  ['.ma-griglia', '.ma-gruppi', '.ma-campo', '.ma-anteprima', '.ma-entra'].forEach(s => assert.ok(larghe[0].sel.includes(s), s));
  assert.ok(/width\s*:\s*var\(--ma-l\)/.test(larghe[0].corpo));
  assert.ok(/--ma-l\s*:\s*min\(75vw,\s*75vh\)/.test(css), 'il lato corto in vw/vh');
  assert.ok(/--ma-l\s*:\s*min\(75svw,\s*75svh\)/.test(css), 'e in svw/svh dove c\'è (Safari con le barre)');
});

test('stile(): celle di almeno 44 px, e il carattere delle emoji solo nelle celle e nell\'anteprima', () => {
  const R = regole(modulo().stile());
  assert.ok(R.some(r => /\.ma-cella\b/.test(r.sel) && /min-height\s*:\s*44px/.test(r.corpo) && /min-width\s*:\s*44px/.test(r.corpo)), 'cella ≥ 44 px');
  const conEmoji = R.filter(r => /font-family\s*:[^;]*--emoji/.test(r.corpo));
  assert.ok(conEmoji.length >= 1, 'le celle usano le emoji');
  conEmoji.forEach(r => assert.ok(/^[^,]*\.ma-(cella|anteprima)\b[^,]*(,\s*[^,]*\.ma-(cella|anteprima)\b[^,]*)*$/.test(r.sel), 'solo celle e anteprima: ' + r.sel));
  assert.ok(!R.some(r => /ma-(progetto|classe|attivita)/.test(r.sel) && /font-family/.test(r.corpo)), 'le righe di testo ereditano il carattere della pagina');
});

// ── Le pagine ──────────────────────────────────────────────────────────────

const PAGINE = ['public/collab/student.html', 'public/live/student.html', 'public/live/scelta.html',
  'public/live/timeline-build.html', 'public/tutor/student.html'];

test('ogni pagina carica il modulo e non ha più il suo accesso', () => {
  PAGINE.forEach(p => {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    assert.ok(h.includes('<script src="' + URL_MODULO + '?v=0134"></script>'), p + ': carica il modulo');
    assert.ok(h.includes('var A = window.MappAIAccesso;') && /A\.monta\(\$\('(join|login)'\), /.test(h) && /\{ progetto: /.test(h), p + ': monta l\'accesso');
    ['La tua classe', 'id="emoji-grid"', 'egrid-btn', 'emoji-cell', 'emoji-btn', 'combo-row', 'combo-preview',
      'Scegli un\'emoji per ogni fila', 'id="in-num"', 'id="num-input"', 'id="in-nick"', 'id="login-title"',
      '<h1>Mappa LIVE</h1>', '<h1>MappAI Live</h1>', '<h1>Domande a scelta</h1>', '<h1>Costruisci la timeline</h1>']
      .forEach(x => assert.ok(!h.includes(x), p + ': resta «' + x + '»'));
  });
});

// ── I server ───────────────────────────────────────────────────────────────

const { createLiveServer } = require(path.join(ROOT, 'live-server.js'));
const { createCollabServer } = require(path.join(ROOT, 'collab-server.js'));
const { createTutorServer } = require(path.join(ROOT, 'tutor-server.js'));

function apiFactory(port) {
  return (p) => fetch('http://127.0.0.1:' + port + p).then(async r => ({
    status: r.status, tipo: r.headers.get('content-type') || '', testo: await r.text()
  }));
}
const ROSTER = [{ emojiKey: 'volpe', emoji: '🦊', num: '00', name: '' }];
const DOMANDE = [{ type: 'mc', question: 'Che cos\'è la clorofilla?', options: ['Un pigmento', 'Un sale'], answer: 0 }];

async function conServer(crea, fn) {
  const srv = crea();
  const port = await srv.listen(0, '127.0.0.1');
  try { await fn(apiFactory(port), srv.state().session.token); } finally { await srv.stop(); }
}
const live = (session) => () => createLiveServer({ repoRoot: ROOT, dir: tmpDir('acc-live-'), session, roster: ROSTER, questions: DOMANDE });
const collab = (dir, session) => () => createCollabServer({ repoRoot: ROOT, dir, session });
const tutor = () => () => createTutorServer({ repoRoot: ROOT, dir: tmpDir('acc-tutor-'),
  session: { name: 'Sistema Albero', className: '1A', topic: { kind: 'map', id: '', label: '' }, mode: 'socratic', cap: 3,
    provider: 'google', model: 'gemini-test', maxTokens: 400 },
  secrets: { apiKey: 'K', systemInstruction: 'S' }, roster: ROSTER, callModel: async () => ({ text: '' }) });

test('i tre server servono il modulo, e niente accanto', async () => {
  const atteso = fs.readFileSync(FILE, 'utf8');
  for (const crea of [live({ name: 'Sistema Albero', activity: 'Quiz', className: '1A' }),
    collab(tmpDir('acc-collab-'), { name: 'Sistema Albero', rootLabel: 'Albero', className: '1A' }), tutor()]) {
    await conServer(crea, async (api) => {
      const r = await api(URL_MODULO + '?v=0134');
      assert.strictEqual(r.status, 200);
      assert.ok(r.tipo.includes('javascript'));
      assert.strictEqual(r.testo, atteso);
      assert.notStrictEqual((await api(URL_MODULO + '.bak')).status, 200, 'un .bak accanto non esce');
      assert.notStrictEqual((await api('/public/js/mappai-accesso-allievi-core.js')).status, 200);
    });
  }
});

test('LIVE /api/session: `attivita` è la parte di mezzo del titolo del report (titoloLive)', async () => {
  const casi = [
    [{ name: 'Sistema Albero', activity: 'Quiz', className: '1A', materiale: 'Scelta multipla · Esempio concreto' }, 'Scelta multipla · Esempio concreto', 'Report allievi'],
    [{ name: 'Sistema Albero', activity: 'Domande aperte', className: '1A', mode: 'scelta', materiale: 'Domande aperte · Causa' }, 'Domande aperte · Causa', 'Report domande'],
    [{ name: 'Sistema Albero', activity: 'timeline', className: '1A', mode: 'build', materiale: 'Timeline' }, 'Timeline', 'Report costruzione'],
    [{ name: 'Sistema Albero', activity: 'Quiz', className: '1A' }, 'Quiz', 'Report allievi']   // nata prima dello 0127
  ];
  for (const [session, atteso, coda] of casi) {
    await conServer(live(session), async (api, tok) => {
      const b = JSON.parse((await api('/api/session?s=' + tok)).testo);
      assert.strictEqual(b.attivita, atteso);
      assert.strictEqual(b.attivita, LR.titoloLive({ materiale: session.materiale, activity: session.activity }));
      assert.strictEqual(LR.titoloLive({ mapTitle: b.name, materiale: session.materiale, activity: session.activity }, coda),
        'Sistema Albero · ' + b.attivita + ' · ' + coda, 'la riga 3 e la barra del report vengono dalla stessa funzione');
      assert.strictEqual(b.className, '1A');
    });
  }
});

test('Mappa LIVE /api/session: la classe e «Mappa LIVE»', async () => {
  await conServer(collab(tmpDir('acc-collab-'), { name: 'Sistema Albero', rootLabel: 'Albero', className: '1A' }), async (api, tok) => {
    const b = JSON.parse((await api('/api/session?s=' + tok)).testo);
    assert.strictEqual(b.className, '1A');
    assert.strictEqual(b.attivita, CC.NOME_ATTIVITA);
  });
});

test('Chiedi e Rispondi /api/session: il nome di titoloTutor', async () => {
  await conServer(tutor(), async (api, tok) => {
    const b = JSON.parse((await api('/api/session?s=' + tok)).testo);
    assert.strictEqual(b.attivita, TR.NOME_ATTIVITA);
    assert.strictEqual(TR.titoloTutor({ name: 'Sistema Albero' }), 'Sistema Albero · ' + b.attivita + ' · Report tutor');
    assert.strictEqual(b.className, '1A');
  });
});

// ── Le emoji dei gruppi (D1: nascoste, non tolte) ──────────────────────────

test('D1: le sei voci restano valide, la griglia ne mostra 4 per fila', () => {
  assert.deepStrictEqual(CC.GROUP_EMOJI.map(s => s.items.length), [4, 6, 6]);
  assert.ok(CC.validateGroupCombo(['volpe', 'pizza', 'razzo']).ok, 'pizza resta valida');
  assert.strictEqual(CC.comboEmojiLabel('volpe-pizza-razzo'), '🦊🍕🚀');
  const g = CC.grigliaGruppi([]);
  assert.deepStrictEqual(g.map(s => s.items.length), [4, 4, 4]);
  assert.deepStrictEqual(g[1].items.map(i => i.key), ['mela', 'banana', 'fragola', 'uva']);
  assert.deepStrictEqual(g[2].items.map(i => i.key), ['treno', 'razzo', 'bici', 'barca']);
  const r = CC.grigliaGruppi(['volpe-pizza-razzo', 'gatto-mela-treno', 'Nome libero']);
  assert.deepStrictEqual(r[1].items.map(i => i.key), ['mela', 'banana', 'fragola', 'uva', 'pizza'], 'pizza torna nella sua fila');
  assert.deepStrictEqual(r[2].items.map(i => i.key), ['treno', 'razzo', 'bici', 'barca']);
});

test('D1: una sessione nuova manda 4 + 4 + 4; una ripresa col gruppo volpe-pizza-razzo rimette pizza', async () => {
  const dir = tmpDir('acc-collab-ripresa-');
  await conServer(collab(dir, { name: 'Sistema Albero', rootLabel: 'Albero', className: '1A' }), async (api, tok) => {
    const b = JSON.parse((await api('/api/session?s=' + tok)).testo);
    assert.deepStrictEqual(b.groupEmoji.map(s => s.items.length), [4, 4, 4]);
  });
  fs.writeFileSync(path.join(dir, 'groups', 'volpe-pizza-razzo.json'),
    JSON.stringify({ nick: 'volpe-pizza-razzo', color: CC.PALETTE[0], nodes: [], links: [], rev: 1, updatedAt: Date.now() }));
  await conServer(collab(dir, {}), async (api, tok) => {
    const b = JSON.parse((await api('/api/session?s=' + tok)).testo);
    assert.deepStrictEqual(b.groupEmoji[1].items.map(i => i.key), ['mela', 'banana', 'fragola', 'uva', 'pizza']);
    assert.strictEqual(b.className, '1A', 'la classe della sessione ripresa');
  });
});
