'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const cheerio = require('cheerio');
const C = require('../public/js/mappai-percorso-lettura-core');
const P = require('../public/js/mappai-percorso-lettura-print');
function draft() {
  const d = { schemaVersion: 1, kind: 'percorso-lettura', projectId: 'progetto', percorsoId: 'lettura',
    title: 'Un ritorno', language: 'it', source: { sourceId: 'fonte', sourceRevision: 1,
      provenance: { kind: 'text' }, paragraphs: [
        { id: 'titolo', type: 'heading', text: 'Il ritorno', emphasis: [] },
        { id: 'p1', type: 'dialogue', text: '«Torno domani», disse Ada.\nMa non tornò.', emphasis: [{ start: 1, end: 6, kind: 'em' }] }
      ] }, activities: [
        { id: 'q1', revision: 1, format: 'mc', question: 'Che cosa promette Ada?', operation: 'informazioni-esplicite',
          difficulty: 'base', reference: { scope: 'passages', paragraphIds: ['p1'] },
          options: ['Domani.', 'Mai.', 'Oggi.', 'Fra un mese.'].map((text, i) => ({ id: 'o' + i, text })),
          teacher: { correctOptionId: 'o0', answer: 'CHIAVE_RISERVATA', criteria: ['CRITERIO_RISERVATO'],
            evidence: [{ paragraphId: 'p1', quote: 'PROVA_RISERVATA', sourceId: 'fonte' }],
            distractors: [1, 2, 3].map(i => ({ optionId: 'o' + i, reason: 'DISTRATTORE_RISERVATO' })) } },
        { id: 'q2', revision: 1, format: 'open', question: 'Spiega il finale.', lines: 4, operation: 'inferenze',
          difficulty: 'intermedia', reference: { scope: 'whole', paragraphIds: [] },
          teacher: { answer: 'GUIDA_RISERVATA', criteria: [], evidence: [] } }
      ] };
  d.sequence = C.initialSequence(d.source.paragraphs, d.activities);
  return d;
}
const options = () => ({ title: 'Verifica A', language: 'it', verificaId: 'verifica-a', versioneId: 'versione-1',
  mode: 'text-and-questions', typography: { fontId: 'testme-sans', fontSize: 14 }, margin: 18 });
const content = () => C.projectPublicContent(draft(), ['q1', 'q2']);

test('stampa: default della Sintesi e margini distinti, preset di sole preferenze e record uniformi compatibili', () => {
  const fs = require('node:fs'), synthesis = fs.readFileSync(require.resolve('../public/js/mappai-branch-synthesis'), 'utf8');
  assert.match(synthesis, /--ap-pt:\s*13pt/); assert.match(synthesis, /margin:\s*20mm 20mm 25mm 20mm/);
  assert.match(synthesis, /line-height:\s*1\.7/); assert.match(synthesis, /margin:\s*0 0 10px/);
  const d = P.defaults('atkinson');
  assert.equal(d.size, 13); assert.equal(d.line, 1.7); assert.ok(Math.abs(d.gap * 13 * 4 / 3 - 10) < 1e-12);
  assert.deepEqual([d.marginTop,d.marginRight,d.marginBottom,d.marginLeft], [20,20,25,20]);
  assert.equal(P.preferences(d).font, 'atkinson');
  const preset = P.presets([{ id: 'p1', name: '  Leggibile  ', values: { ...d, title: 'NON_SALVARE', html: '<secret>', projectId: 'SEGRETO' } }]);
  assert.equal(preset[0].name, 'Leggibile'); assert.equal(JSON.stringify(preset).includes('SEGRETO'), false);
  assert.equal(JSON.stringify(preset).includes('NON_SALVARE'), false); assert.equal(JSON.stringify(preset).includes('<secret>'), false);
  assert.throws(() => P.presets([preset[0],preset[0]]), /invalid_print_presets/);
  assert.throws(() => P.preferences({ ...d, marginBottom: 0 }), /invalid_print_margin/);
  assert.throws(() => P.preferences({ ...d, includeHelp: 'false' }), /invalid_print_preference/);
  const html = P.renderStudent(content(), { ...options(), typography: undefined, margin: undefined });
  assert.match(html, /font-size:13pt;line-height:1.7/); assert.match(html, /margin:20mm 20mm 25mm 20mm/);
  assert.match(P.renderStudent(content(), options()), /margin:18mm/);
});

test('aiuti: inclusione per domanda e stampa, escaping e assenza della guida nella copia allievo', async () => {
  const d = draft(); d.activities[0].help = 'AIUTO <script>mai eseguito</script>'; d.activities[1].help = 'AIUTO_ESCLUSO';
  d.activities[1].includeHelp = false;
  const c = C.projectPublicContent(d, ['q1','q2']);
  assert.equal(c.activities[0].help, d.activities[0].help); assert.equal(c.activities[1].help, undefined);
  const html = P.renderStudent(c, options()); assert.equal(cheerio.load(html)('.lettura-help').text(), d.activities[0].help);
  assert.equal(cheerio.load(html)('script').length, 0); assert.equal(html.includes('AIUTO_ESCLUSO'), false);
  assert.equal(P.renderStudent(c, { ...options(), includeHelp: false }).includes('AIUTO'), false);
  const stripped = C.projectPublicContent(d, ['q1','q2'], { includeHelp: false });
  assert.equal(JSON.stringify(stripped).includes('AIUTO'), false);
  const wb = await P.prepareWorkbook(stripped, workbookOptions()); assert.equal(wb.includes('AIUTO'), false);
  assert.equal(wb.includes('CHIAVE_RISERVATA'), false);
});

test('stampa: testo completo oppure sole domande, stesso ordine e identità di versione', () => {
  const c = content(), full = cheerio.load(P.renderStudent(c, options()));
  const only = cheerio.load(P.renderStudent(c, { ...options(), mode: 'questions-only' }));
  assert.equal(full('[data-paragraph-id]').length, 2); assert.equal(only('[data-paragraph-id]').length, 0);
  for (const $ of [full, only]) {
    assert.deepEqual($('[data-activity-id]').map((_, el) => $(el).attr('data-activity-id')).get(), ['q1', 'q2']);
    assert.equal($('.lettura-print-identity').attr('data-versione-id'), 'versione-1');
    assert.equal($('.lettura-answer-line').length, 4); assert.equal($('li[data-option-id]').length, 4);
    assert.match($('style').text(), /break-inside:avoid/);
  }
  assert.equal(full('[data-paragraph-id="p1"]').text(), c.source.paragraphs[1].text);
  assert.equal(full('[data-paragraph-id="p1"] em').text(), 'Torno');
});

test('stampa: rispetta l’intercalazione mentre la sola copia domande mantiene l’ordine scelto', () => {
  const d = C.moveBlock(draft(), 2, -1), c = C.projectPublicContent(d, ['q2', 'q1']);
  const $ = cheerio.load(P.renderStudent(c, options()));
  assert.deepEqual($('main > *').map((_, el) => $(el).attr('data-paragraph-id') || $(el).attr('data-activity-id')).get(),
    ['titolo', 'q2', 'p1', 'q1']);
});

test('guida separata: chiave, criteri, prove e distrattori non compaiono mai nella copia allievo', () => {
  const d = draft(), c = C.projectPublicContent(d, ['q1', 'q2']);
  const student = P.renderStudent(c, options()), guide = P.renderGuide(d, ['q1', 'q2'], options());
  for (const secret of ['CHIAVE_RISERVATA', 'CRITERIO_RISERVATO', 'PROVA_RISERVATA', 'DISTRATTORE_RISERVATO', 'GUIDA_RISERVATA']) {
    assert.equal(student.includes(secret), false); assert.equal(guide.includes(secret), true);
  }
  assert.equal(cheerio.load(guide)('.lettura-print-identity').attr('data-versione-id'), 'versione-1');
  assert.throws(() => P.renderStudent({ ...c, teacher: 'riservato' }, options()), /fields/);
});

test('HTML della fonte e delle risposte trattato come testo, anche in titolo e metadati', () => {
  const d = draft(), attack = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  d.source.paragraphs[1].text = attack; d.source.paragraphs[1].emphasis = [];
  d.activities[0].question = attack; d.activities[0].options[0].text = attack + '.';
  d.activities[0].teacher.answer = attack;
  const o = { ...options(), title: attack, versioneId: attack, language: 'it"><script>alert(3)</script>' };
  for (const html of [P.renderStudent(C.projectPublicContent(d, ['q1']), o), P.renderGuide(d, ['q1'], o)]) {
    const $ = cheerio.load(html);
    assert.equal($('script,img,iframe,object').length, 0);
    assert.equal($('[onerror]').length, 0); assert.equal($('title').text(), attack);
    assert.equal($('.lettura-print-identity').attr('data-versione-id'), attack);
  }
});

test('modalità PDF obbligatoria e parametri tipografici validati, senza CSS fornito dal documento', () => {
  const o = options(); delete o.mode;
  assert.throws(() => P.renderStudent(content(), o), /print_mode_required/);
  for (const change of [o => { o.mode = 'entrambi'; }, o => { o.margin = '0;display:none'; },
    o => { o.typography.fontId = 'serif;display:none'; }, o => { o.typography.fontSize = 100; },
    o => { o.typography.lineHeight = NaN; }]) {
    const o = options(); change(o); assert.throws(() => P.renderStudent(content(), o));
  }
  const $ = cheerio.load(P.renderStudent(content(), { ...options(), margin: 25,
    typography: { fontId: 'testme-sans', fontSize: 20, lineHeight: 2, paragraphGap: 1.5, letterSpacing: .05 } }));
  assert.match($('style').text(), /margin:25mm/); assert.match($('style').text(), /font-size:20pt/);
  assert.match($('style').text(), /line-height:2/); assert.match($('style').text(), /letter-spacing:0.05em/);
});

test('preparazione PDF attende il font incorporabile e congela dati/opzioni prima dell’attesa', async () => {
  let complete, styleCalled = false;
  const runtime = { precaricaIncorporabile: () => new Promise(r => { complete = r; }),
    styleDocumento: id => { styleCalled = true; assert.equal(id, 'testme-sans'); return ':root{--doc-font:TestMe;}'; } };
  const c = content(), o = options(), work = P.preparePdf(c, o, runtime);
  assert.equal(styleCalled, false);
  c.source.paragraphs[1].text = 'MODIFICA_TARDIVA'; o.title = 'MODIFICA_TARDIVA'; o.typography.fontId = 'space-mono';
  complete(true); const html = await work;
  assert.equal(styleCalled, true); assert.equal(html.includes('MODIFICA_TARDIVA'), false);
  assert.ok(html.includes('--doc-font:TestMe'));
});

test('font assente/fallito ferma il PDF; la guida aspetta lo stesso caricamento', async () => {
  await assert.rejects(P.preparePdf(content(), options(), null), /font_runtime_missing/);
  const runtime = { precaricaIncorporabile: async () => false, styleDocumento: () => { throw new Error('non chiamare'); } };
  await assert.rejects(P.preparePdf(content(), options(), runtime), /font_not_embedded/);
  runtime.precaricaIncorporabile = async () => true; runtime.styleDocumento = () => ':root{--doc-font:TestMe;}';
  const html = await P.prepareGuidePdf(draft(), ['q1'], options(), runtime);
  assert.ok(html.includes('CHIAVE_RISERVATA')); assert.ok(html.includes('--doc-font:TestMe'));
});

const workbookOptions = () => ({ ...options(), uiCss: require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/css/mappai-ui.css'), 'utf8'), projectId: 'progetto', percorsoId: 'lettura', labels:
  Object.fromEntries(['student', 'session', 'newSession', 'start', 'answer', 'goToText', 'print', 'saveCopy',
    'saved', 'unsaved', 'conflict', 'invalidSession', 'emptyAnswer', 'localNotice', 'systemFont'].map(k => [k, k])) });

// Small DOM adapter: execute the actual exported script, with storage failures and two windows.
function workbookBrowser(html, store = { data: new Map() }) {
  const $ = cheerio.load(html), cache = new WeakMap(), handlers = new WeakMap(), windowEvents = {};
  const result = { store, prints: 0, downloads: [], blobs: [], navigations: 0 };
  function wrap(el) {
    if (!el) return null;
    if (cache.has(el)) return cache.get(el);
    let value, checked;
    const node = {
      tagName: (el.name || '').toUpperCase(),
      get dataset() { return Object.fromEntries(Object.entries(el.attribs || {}).filter(([k]) => k.startsWith('data-'))
        .map(([k, v]) => [k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v])); },
      get type() { return $(el).attr('type') || ''; },
      get value() { return value === undefined ? ($(el).attr('value') || (el.name === 'select' ? $(el).find('option').first().attr('value') : '') || '') : value; },
      set value(v) { value = v; },
      get checked() { return checked === undefined ? $(el).attr('checked') !== undefined : checked; },
      set checked(v) { checked = v; },
      get hidden() { return $(el).attr('hidden') !== undefined; },
      set hidden(v) { if (v) $(el).attr('hidden', ''); else $(el).removeAttr('hidden'); },
      get textContent() { return $(el).text(); }, set textContent(v) { $(el).text(v); },
      get outerHTML() { return $.html(el); },
      addEventListener(type, fn) { const h = handlers.get(node) || {}; h[type] = fn; handlers.set(node, h); },
      appendChild(child) { $(el).append(child._el); },
      replaceChildren() { $(el).empty(); value = undefined; },
      removeAttribute(name) { $(el).removeAttr(name); },
      querySelector(selector) { return wrap($(el).find(selector).get(0)); },
      querySelectorAll(selector) { return $(el).find(selector).toArray().map(wrap); },
      cloneNode() { return wrap($(el).clone().get(0)); },
      scrollIntoView() { result.navigations++; }, focus() {},
      click() { if (el.name === 'a') result.downloads.push({ href: node.href, name: node.download }); }, _el: el
    };
    cache.set(el, node); return node;
  }
  const document = { getElementById: id => wrap($('#' + id).get(0)),
    querySelectorAll: selector => $(selector).toArray().map(wrap),
    createElement: name => wrap($('<' + name + '>').get(0)), documentElement: wrap($('html').get(0)) };
  const window = { crypto: require('node:crypto').webcrypto,
    navigator: { locks: Object.prototype.hasOwnProperty.call(store, 'locks') ? store.locks :
      { request: (_key, fn) => Promise.resolve(fn()) } },
    localStorage: { getItem(key) { if (store.readError) throw new Error('denied'); const raw = store.data.get(key) ?? null;
      const afterRead = store.afterRead; store.afterRead = null; if (afterRead) afterRead(); return raw; },
      setItem(key, val) { if (store.writeError) throw new Error('quota'); store.data.set(key, val); } },
    print() { result.prints++; }, addEventListener(type, fn) { windowEvents[type] = fn; } };
  require('node:vm').runInNewContext($('script').last().text(), { window, document, Blob, Uint8Array,
    URL: { createObjectURL(blob) { result.blobs.push(blob); return 'blob:workbook'; }, revokeObjectURL() {} }, setTimeout: fn => fn() });
  result.node = id => document.getElementById(id);
  result.emit = (node, type) => handlers.get(node)?.[type]?.({ preventDefault() {} });
  result.event = (type, event) => windowEvents[type]?.(event);
  result.start = (student, id = '') => {
    result.node('wb-student').value = student; result.emit(result.node('wb-student'), 'input');
    result.node('wb-session').value = id; result.emit(result.node('wb-form'), 'submit');
    return result.node('wb-session').value;
  };
  result.answer = (id, val) => { const node = document.querySelectorAll('[data-answer]').find(n => n.dataset.answer === id && (n.type !== 'radio' || n.value === val));
    node.value = val; result.emit(node, 'input'); };
  result.response = id => document.querySelectorAll('[data-response]').find(n => n.dataset.response === id).textContent;
  result.click = id => result.emit(result.node(id), 'click');
  result.unloadBlocked = () => { let blocked = false; result.event('beforeunload', { preventDefault() { blocked = true; } }); return blocked; };
  return result;
}

test('workbook: stessa fonte pubblica, hash stabile, etichette obbligatorie e nessuna chiave privata', async () => {
  const c = content(), html = await P.prepareWorkbook(c, workbookOptions()), $ = cheerio.load(html);
  for (const marker of ['CHIAVE_RISERVATA', 'CRITERIO_RISERVATO', 'PROVA_RISERVATA', 'DISTRATTORE_RISERVATO', 'GUIDA_RISERVATA'])
    assert.equal(html.includes(marker), false);
  assert.equal($('script[src],link[href],textarea[maxlength]').length, 0);
  assert.equal($('[data-answer]').length, 5); assert.equal($('[data-paragraph-id]').length, 2);
  assert.match($('style').text(), /height:auto;max-height:none;overflow:visible/);
  assert.equal($('.wb-question.wb-mc').length, 1); assert.equal($('.wb-question:not(.wb-mc)').length, 1);
  assert.match($('style').text(), /\.wb-mc\{break-inside:avoid;page-break-inside:avoid\}/);
  const packet = JSON.parse($('#wb-data').text()); assert.match(packet.identity.fingerprint, /^sha256-[a-f0-9]{64}$/);
  const again = await P.prepareWorkbook({ sequence: c.sequence, activities: c.activities, source: c.source }, workbookOptions());
  assert.equal(JSON.parse(cheerio.load(again)('#wb-data').text()).identity.fingerprint, packet.identity.fingerprint);
  await assert.rejects(P.prepareWorkbook(c, { ...workbookOptions(), labels: {} }), /missing_label/);
  assert.equal($('html').attr('class'), 'ui');
  assert.equal($('style[data-mappai-ui]').text(), workbookOptions().uiCss);
  await assert.rejects(P.prepareWorkbook(c, { ...workbookOptions(), uiCss: undefined }), /workbook_ui_css_required/);
  await assert.rejects(P.prepareWorkbook(c, { ...workbookOptions(), uiCss: '</style><script>1</script>' }), /workbook_ui_css_required/);
  await assert.rejects(P.prepareWorkbook(c, { ...workbookOptions(), theme: 'unknown' }), /invalid_workbook_theme/);
  await assert.rejects(P.prepareWorkbook({ ...c, teacher: 'private' }, workbookOptions()), /fields/);
});

test('workbook: snapshot prima degli await, font incorporati se richiesti e testo ostile inerte', async () => {
  const c = content(), attack = '</script><img src=x onerror="alert(1)"> $&';
  c.source.paragraphs[1].text = attack; c.source.paragraphs[1].emphasis = [];
  const o = workbookOptions(), runtime = { precaricaIncorporabile: async () => true,
    styleDocumento: () => ':root{--doc-font:Embedded;}' };
  o.fontRuntime = runtime;
  const pending = P.prepareWorkbook(c, o);
  c.source.paragraphs[1].text = 'CAMBIO_TARDIVO'; o.title = 'CAMBIO_TARDIVO'; o.labels.answer = 'CAMBIO_TARDIVO'; o.uiCss = 'CAMBIO_TARDIVO'; o.theme = 'light';
  const html = await pending, $ = cheerio.load(html);
  assert.equal(html.includes('CAMBIO_TARDIVO'), false); assert.equal($('script').length, 2); assert.equal($('img').length, 0);
  assert.equal($('[data-paragraph-id="p1"]').text(), attack); assert.match($('style').text(), /--doc-font:Embedded/);
  assert.equal(JSON.parse($('#wb-data').text()).content.source.paragraphs[1].text, attack);
  runtime.precaricaIncorporabile = async () => false;
  await assert.rejects(P.prepareWorkbook(content(), o), /font_not_embedded/);
});

test('workbook: sessioni esplicite e omonime isolate, riapertura, MC senza giudizio e versione nuova vuota', async () => {
  const html = await P.prepareWorkbook(content(), workbookOptions()), browser = workbookBrowser(html);
  assert.equal(browser.node('wb-work').hidden, true); assert.equal(browser.store.data.size, 0);
  const first = browser.start('Ada'); browser.answer('q2', 'Prima risposta.'); browser.answer('q1', 'o2');
  const second = browser.start('Ada'); assert.notEqual(first, second); assert.equal(browser.response('q2'), 'emptyAnswer');
  browser.answer('q2', 'Seconda risposta.'); browser.start('Ada', first);
  assert.equal(browser.response('q2'), 'Prima risposta.'); assert.equal(browser.response('q1'), 'Oggi.');
  browser.node('wb-student').value = 'Bruno'; browser.emit(browser.node('wb-student'), 'input');
  assert.equal(browser.node('wb-work').hidden, true); assert.equal(browser.response('q2'), 'emptyAnswer');
  const reopened = workbookBrowser(html, browser.store); assert.equal(reopened.node('wb-work').hidden, true);
  reopened.start('Ada', first); assert.equal(reopened.response('q2'), 'Prima risposta.');
  const newHtml = await P.prepareWorkbook(content(), { ...workbookOptions(), versioneId: 'versione-2' });
  const newVersion = workbookBrowser(newHtml, browser.store); newVersion.start('Ada');
  assert.equal(newVersion.response('q2'), 'emptyAnswer'); assert.equal(browser.store.data.size, 2);
});

test('workbook: quota negata conserva risposta intera, stampa e backup HTML riapribile senza storage', async () => {
  const html = await P.prepareWorkbook(content(), workbookOptions()), store = { data: new Map(), readError: true, writeError: true };
  const browser = workbookBrowser(html, store), id = browser.start('Ada');
  const answer = 'Una risposta lunga.\n'.repeat(900) + '<script>non eseguire</script>𝒜';
  browser.answer('q2', answer); browser.answer('q1', 'o3');
  assert.equal(browser.response('q2'), answer); assert.equal(browser.node('wb-status').textContent, 'unsaved');
  browser.click('wb-print'); assert.equal(browser.prints, 1); assert.equal(browser.response('q2'), answer);
  browser.click('wb-copy'); const backup = await browser.blobs[0].text();
  assert.equal(JSON.parse(cheerio.load(backup)('#wb-data').text()).backup.answers.q2, answer);
  assert.equal(cheerio.load(backup)('script').length, 2); assert.equal(browser.downloads.length, 1);
  const recovered = workbookBrowser(backup, store); assert.equal(recovered.node('wb-work').hidden, true);
  recovered.start('Ada', id); assert.equal(recovered.response('q2'), answer); assert.equal(recovered.response('q1'), 'Fra un mese.');
  browser.node('wb-student').value = 'Bruno'; browser.emit(browser.node('wb-student'), 'input');
  let prevented = false; browser.event('beforeunload', { preventDefault() { prevented = true; } }); assert.equal(prevented, true);
});

test('workbook: corruzione, collisione di contenuto e scrittura concorrente non sovrascrivono dati', async () => {
  const html = await P.prepareWorkbook(content(), workbookOptions()), a = workbookBrowser(html), id = a.start('Ada');
  a.answer('q2', 'Originale'); const b = workbookBrowser(html, a.store); b.start('Ada', id); b.answer('q2', 'Altra finestra');
  const before = [...a.store.data.values()][0];
  assert.equal(a.unloadBlocked(), false);
  a.event('storage', { key: [...a.store.data.keys()][0] }); assert.equal(a.unloadBlocked(), true);
  a.answer('q2', 'Testo ancora in memoria');
  assert.equal(a.node('wb-status').textContent, 'conflict'); assert.equal([...a.store.data.values()][0], before);
  assert.equal(a.response('q2'), 'Testo ancora in memoria');
  const changed = content(); changed.activities[1].question = 'Domanda diversa';
  const c = workbookBrowser(await P.prepareWorkbook(changed, workbookOptions()), a.store); c.start('Ada');
  assert.equal(c.node('wb-status').textContent, 'conflict'); assert.equal([...a.store.data.values()][0], before);
  const key = [...a.store.data.keys()][0]; a.store.data.set(key, '{broken');
  const broken = workbookBrowser(html, a.store); broken.start('Ada'); broken.answer('q2', 'Non perdere');
  assert.equal(broken.node('wb-status').textContent, 'invalidSession'); assert.equal(a.store.data.get(key), '{broken');
  assert.equal(broken.response('q2'), 'Non perdere'); broken.click('wb-print'); assert.equal(broken.prints, 1);
});

function queuedLocks() {
  const queue = [];
  return { queue, request(key, fn) { return new Promise((resolve, reject) => queue.push({ key, fn, resolve, reject })); },
    run() { const task = queue.shift(); assert.ok(task, 'pending native lock');
      try { task.resolve(task.fn()); } catch (e) { task.reject(e); } },
    flush() { while (queue.length) this.run(); } };
}

test('workbook: lock nativo serializza sessioni diverse anche se B scrive fra lettura e scrittura di A', async () => {
  const locks = queuedLocks(), store = { data: new Map(), locks }, html = await P.prepareWorkbook(content(), workbookOptions());
  const a = workbookBrowser(html, store), b = workbookBrowser(html, store), aid = a.start('Ada'), bid = b.start('Bruno');
  assert.equal(store.data.size, 0); assert.equal(a.unloadBlocked(), true); locks.flush();
  assert.equal(a.unloadBlocked(), false); assert.equal(b.unloadBlocked(), false);
  a.answer('q2', 'Risposta A'); store.afterRead = () => b.answer('q2', 'Risposta B');
  locks.run(); // B requests the same lock while A still holds it: no nested write.
  assert.equal(locks.queue.length, 1); assert.equal(b.unloadBlocked(), true);
  locks.flush();
  const box = JSON.parse([...store.data.values()][0]);
  assert.equal(box.sessions.find(r => r.sessioneId === aid).answers.q2, 'Risposta A');
  assert.equal(box.sessions.find(r => r.sessioneId === bid).answers.q2, 'Risposta B');
  assert.equal(a.node('wb-status').textContent, 'saved'); assert.equal(b.node('wb-status').textContent, 'saved');
});

test('workbook: coda pendente conserva input rapidi e sessione bersaglio quando cambia la sessione visibile', async () => {
  const locks = queuedLocks(), store = { data: new Map(), locks }, html = await P.prepareWorkbook(content(), workbookOptions());
  const browser = workbookBrowser(html, store), first = browser.start('Ada');
  browser.answer('q2', 'Prima'); browser.answer('q2', 'Ultima');
  const second = browser.start('Bruno'); browser.answer('q2', 'Risposta di Bruno');
  assert.equal(browser.unloadBlocked(), true); locks.run();
  assert.equal(browser.node('wb-status').textContent, 'unsaved'); assert.equal(browser.response('q2'), 'Risposta di Bruno');
  assert.equal(browser.unloadBlocked(), true); locks.flush();
  const box = JSON.parse([...store.data.values()][0]);
  assert.equal(box.sessions.find(r => r.sessioneId === first).answers.q2, 'Ultima');
  assert.equal(box.sessions.find(r => r.sessioneId === second).answers.q2, 'Risposta di Bruno');
  assert.equal(browser.node('wb-status').textContent, 'saved'); assert.equal(browser.unloadBlocked(), false);
});

test('workbook: senza lock o con lock negato nessuna scrittura non protetta, stampa e copia disponibili', async () => {
  const html = await P.prepareWorkbook(content(), workbookOptions());
  for (const locks of [null, { request: async () => { throw new Error('lock denied'); } }]) {
    const store = { data: new Map(), locks }, browser = workbookBrowser(html, store); browser.start('Ada'); browser.answer('q2', 'Conservami');
    await Promise.resolve();
    assert.equal(store.data.size, 0); assert.equal(browser.node('wb-status').textContent, 'unsaved');
    assert.equal(browser.unloadBlocked(), true); browser.click('wb-print'); browser.click('wb-copy');
    assert.equal(browser.prints, 1); const copy = await browser.blobs[0].text();
    assert.equal(JSON.parse(cheerio.load(copy)('#wb-data').text()).backup.answers.q2, 'Conservami');
  }
});

test('workbook: ID constructor e toString non leggono proprietà ereditate delle risposte', async () => {
  const c = content(); c.activities[0].id = 'constructor'; c.activities[1].id = 'toString';
  c.sequence.forEach(b => { if (b.kind === 'activity') b.activityId = b.activityId === 'q1' ? 'constructor' : 'toString'; });
  const html = await P.prepareWorkbook(c, workbookOptions()), browser = workbookBrowser(html), id = browser.start('Ada');
  assert.equal(browser.response('constructor'), 'emptyAnswer'); assert.equal(browser.response('toString'), 'emptyAnswer');
  browser.answer('constructor', 'o1'); browser.answer('toString', 'La mia risposta');
  const reopened = workbookBrowser(html, browser.store); reopened.start('Ada', id);
  assert.equal(reopened.response('constructor'), 'Mai.'); assert.equal(reopened.response('toString'), 'La mia risposta');
});

test('HTML di lavoro ELABORA: testo e attività intercalati, font comune e nessuna identità assegnata o guida privata', async () => {
  const d = C.moveBlock(draft(), 2, -1), c = C.projectPublicContent(d, ['q2', 'q1']);
  const fonts = [], runtime = { precaricaIncorporabile: async id => { fonts.push(id); return true; },
    styleDocumento: id => ':root{--doc-font:' + id + ';}' };
  const html = await P.prepareWorkingDocument(c, { title: 'Percorso <Ada>', language: 'it',
    verificaId: 'NON_ASSEGNATO', versioneId: 'NON_ASSEGNATA' }, runtime);
  const $ = cheerio.load(html);
  assert.deepEqual($('main > *').map((_, el) => $(el).attr('data-paragraph-id') || $(el).attr('data-activity-id')).get(),
    ['titolo', 'q2', 'p1', 'q1']);
  assert.equal($('[data-paragraph-id="p1"]').text(), c.source.paragraphs[1].text);
  assert.equal($('[data-paragraph-id="p1"] em').text(), 'Torno');
  assert.equal($('[data-activity-id="q1"] [data-option-id]').length, 4);
  assert.equal($('.lettura-answer-line').length, 4);
  assert.equal($('title').text(), 'Percorso <Ada>'); assert.equal($('html').attr('lang'), 'it');
  const defaultFont = require('../public/js/mappai-font-core').DEFAULT;
  assert.deepEqual(fonts, [defaultFont]); assert.ok($('style').text().includes('--doc-font:' + defaultFont));
  assert.match($('style').text(), /font-size:13pt/);
  assert.equal($('[data-verifica-id],[data-versione-id],.lettura-print-identity').length, 0);
  assert.equal($('script,form,input,textarea,nav,.mm-doc-bar,#wb-data,#wb-work').length, 0);
  for (const secret of ['NON_ASSEGNATO', 'NON_ASSEGNATA', 'CHIAVE_RISERVATA', 'CRITERIO_RISERVATO',
    'PROVA_RISERVATA', 'DISTRATTORE_RISERVATO', 'GUIDA_RISERVATA']) assert.equal(html.includes(secret), false);
  const contaminated = structuredClone(c); contaminated.activities[0].teacher = d.activities[0].teacher;
  await assert.rejects(P.prepareWorkingDocument(contaminated, { title: d.title, language: d.language }, runtime), /fields/);
});

test('HTML di lavoro ELABORA: fotografia prima dei font e nessun documento se incorporazione fallisce', async () => {
  let complete;
  const c = content(), o = { title: 'Bozza da leggere', language: 'it', typography: { fontId: 'testme-sans', fontSize: 20 } };
  const runtime = { precaricaIncorporabile: () => new Promise(resolve => { complete = resolve; }),
    styleDocumento: id => { assert.equal(id, 'testme-sans'); return ':root{--doc-font:Incorporato;}'; } };
  const waiting = P.prepareWorkingDocument(c, o, runtime);
  c.source.paragraphs[1].text = 'CAMBIO_DURANTE_FONT'; c.activities[0].question = 'CAMBIO_DURANTE_FONT';
  o.title = 'CAMBIO_DURANTE_FONT'; o.typography.fontId = 'space-mono'; o.typography.fontSize = 35;
  complete(true); const html = await waiting;
  assert.equal(html.includes('CAMBIO_DURANTE_FONT'), false); assert.match(html, /font-size:20pt/);
  assert.ok(html.includes('--doc-font:Incorporato'));
  await assert.rejects(P.prepareWorkingDocument(content(), { title: 'Bozza', language: 'it' }, null), /font_runtime_missing/);
  await assert.rejects(P.prepareWorkingDocument(content(), { title: 'Bozza', language: 'it' }, {
    precaricaIncorporabile: async () => false, styleDocumento() { throw new Error('non chiamare'); }
  }), /font_not_embedded/);
});
