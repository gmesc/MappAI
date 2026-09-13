'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cheerio = require('cheerio');
const R = require('../public/js/mappai-review-core');
const G = require('../public/js/mappai-grounding-core');

function approved(db, sources = []) {
  const review = R.createReview({ db, sources, checkStatus: 'completed' });
  const begun = R.beginApproval(review, db);
  return R.completeApproval(begun.review, begun.revision);
}

// Existing Cheerio dependency supplies the DOM; events explicitly exercise the
// production controller without a browser, network or model calls.
async function runtime(options = {}) {
  const $ = cheerio.load('<html><body><button id="previous">Apri</button></body></html>');
  const wrappers = new WeakMap(); let active;
  function wrap(node) {
    if (!node) return null;
    if (wrappers.has(node)) return wrappers.get(node);
    const el = { node, listeners: {},
      setAttribute(key, value) { $(node).attr(key, String(value)); },
      getAttribute(key) { return $(node).attr(key); },
      querySelector(selector) { return wrap($(node).find(selector)[0]); },
      querySelectorAll(selector) { return $(node).find(selector).toArray().map(wrap); },
      closest(selector) { return wrap($(node).closest(selector)[0]); },
      appendChild(child) { $(node).append(child.node); }, remove() { $(node).remove(); },
      focus() { active = this; },
      addEventListener(type, fn) { this.listeners[type] = fn; },
      showModal() { this.setAttribute('open', ''); },
      close() { $(node).removeAttr('open'); this.listeners.close?.({ target: this }); },
      async fire(type) {
        if (this.disabled) return;
        const event = { target: this, preventDefault() {} };
        await this['on' + type]?.(event);
        let current = node;
        while (current) { await wrap(current).listeners[type]?.(event); current = current.parent; }
      },
      async click() { return this.fire('click'); }
    };
    for (const key of ['id', 'className']) Object.defineProperty(el, key, {
      get() { return $(node).attr(key === 'className' ? 'class' : key) || ''; },
      set(value) { $(node).attr(key === 'className' ? 'class' : key, value); }
    });
    for (const key of ['disabled', 'hidden', 'checked']) Object.defineProperty(el, key, {
      get() { return $(node).attr(key) !== undefined; },
      set(value) {
        if (key === 'checked' && value && $(node).attr('type') === 'radio') $('input[name="' + $(node).attr('name') + '"]').removeAttr('checked');
        if (value) $(node).attr(key, ''); else $(node).removeAttr(key);
      }
    });
    Object.defineProperties(el, {
      innerHTML: { get() { return $(node).html(); }, set(value) { $(node).html(value); } },
      textContent: { get() { return $(node).text(); }, set(value) { $(node).text(String(value)); } },
      value: { get() { return $(node).val() || ''; }, set(value) { $(node).val(String(value)); } },
      dataset: { get() { return Object.fromEntries(Object.entries(node.attribs || {}).filter(([key]) => key.startsWith('data-')).map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), value])); } }
    });
    wrappers.set(node, el); return el;
  }
  const document = { body: wrap($('body')[0]), createElement: tag => wrap($('<' + tag + '>')[0]),
    getElementById: id => wrap($('#' + id)[0]), get activeElement() { return active; } };
  active = document.getElementById('previous');
  const db = { nodes: [{ id: 'root', label: 'Svizzera', desc: 'Contenuto approvato' }], links: [] };
  const items = Array.from({ length: 18 }, (_, i) => ({ id: 'item-' + i, kind: i % 2 ? 'open' : 'mc',
    question: 'Domanda ' + i + ' sulla ' + (i % 2 ? 'neutralità' : 'difesa'), areas: [i % 2 ? 'Neutralità' : 'Difesa'],
    options: ['Risposta A', 'Risposta B'], correctIndex: 0, guide: 'Una guida per il docente' }));
  const review = approved(db); review.final = { stage: 'done', items, review: approved({ items }) };
  const appState = { db, rootNodeLabel: 'Svizzera <script>non eseguire</script>', activeVaultPath: '/vault', _pipelineManifest: { review } };
  const writes = [], opened = [];
  const context = vm.createContext({ document, appState, console, MappAIReviewCore: R, MappAIGroundingCore: G,
    MappAIReview: { requireApproved: async () => options.allowed !== false },
    MappAIStudyDocs: { save: () => 'cached' },
    MappAIStudyExport: { openPrintable: html => opened.push(html) },
    MappAIDocHead: { lingua: () => options.language || 'it' },
    electronAPI: { saveVaultFile: async payload => { writes.push(payload); return { ok: true }; } }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/mappai-learning-path.js'), 'utf8'), context);
  const result = await context.MappAILearningPath.open();
  const q = selector => wrap($(selector)[0]);
  const choose = async id => { const input = q('[data-item="' + id + '"]'); input.checked = true; await input.fire('change'); };
  const input = async (selector, value, event = 'input') => { q(selector).value = value; await q(selector).fire(event); };
  return { $, q, choose, input, document, context, writes, opened, appState, review, result };
}

test('percorso UI: tre passi, catalogo paginato e filtri preservano selezione e limite', async () => {
  const h = await runtime();
  assert.equal(h.result, true);
  assert.equal(h.$('#mappai-learning-path-dialog script').length, 0, 'il nome progetto viene escapato');
  assert.equal(h.q('#sp-next').disabled, true);
  assert.equal(h.q('[data-step="1"]').getAttribute('aria-current'), 'step');
  await h.input('#sp-objective', 'Riconoscere le conseguenze della neutralità.');
  await h.input('#sp-max', '2');
  await h.q('#sp-next').click();
  assert.equal(h.q('#sp-step-2').hidden, false);
  assert.equal(h.$('[data-item]').length, 8);
  await h.choose('item-0');
  await h.q('#sp-page-next').click();
  await h.choose('item-8');
  assert.equal(h.q('#sp-count').textContent, '2 / 2');
  assert.equal(h.q('[data-item="item-9"]').disabled, true);
  await h.input('#sp-search', 'neutralità');
  assert.equal(h.$('[data-item]').length, 8);
  assert.equal(h.$('[data-edit]').length, 2, 'gli item selezionati restano nel riepilogo anche se nascosti dai filtri');
  await h.input('#sp-area', 'Difesa', 'change');
  assert.equal(h.$('[data-item]').length, 0);
  await h.q('#sp-reset').click();
  assert.equal(h.$('[data-item]').length, 8);
  await h.q('[data-remove="item-8"]').click();
  assert.equal(h.q('#sp-count').textContent, '1 / 2');
  assert.equal(h.q('[data-item="item-1"]').disabled, false);
  await h.choose('item-1');
  await h.q('#sp-next').click();
  assert.equal(h.q('#sp-step-3').hidden, false);
  assert.equal(h.q('#sp-create').disabled, false);
  await h.input('#sp-max', '1');
  assert.equal(h.q('#sp-create').disabled, true, 'abbassare il limite non scarta silenziosamente una selezione');
  assert.match(h.q('#sp-limit').textContent, /supera il limite/);
});

test('percorso UI: aiuti e modalità sopravvivono alla navigazione e arrivano nel documento salvato', async () => {
  const h = await runtime();
  await h.input('#sp-objective', 'Un obiettivo concreto');
  await h.q('#sp-next').click();
  await h.choose('item-0'); await h.choose('item-1');
  await h.q('[data-preview="item-0"]').click();
  assert.match(h.q('#sp-preview').textContent, /Risposta A/);
  assert.match(h.q('#sp-preview').textContent, /Soluzione e indicazioni/);
  assert.equal(h.document.activeElement.className, 'sp-preview-title', 'l’anteprima riceve il focus anche nel layout mobile');
  await h.q('#sp-next').click();
  assert.equal(h.q('#sp-help').dataset.help, 'item-0');
  await h.input('#sp-help', 'Aiuto personalizzato <b>senza markup</b>');
  await h.q('[data-edit-offset="1"]').click();
  await h.input('#sp-help', 'Secondo aiuto');
  const mode = h.q('input[name="sp-mode"][value="deeper"]'); mode.checked = true; await mode.fire('change');
  await h.q('[data-step="2"]').click();
  await h.input('#sp-kind', 'mc', 'change');
  await h.q('[data-edit="item-0"]').click();
  assert.equal(h.q('#sp-help').value, 'Aiuto personalizzato <b>senza markup</b>');
  assert.equal(h.q('#sp-summary-mode').textContent, 'Approfondimento');
  await h.q('#sp-create').click();
  assert.equal(h.writes.length, 1); assert.equal(h.opened.length, 1);
  const $saved = cheerio.load(h.writes[0].text), saved = JSON.parse($saved('#mappai-learning-path').text());
  assert.deepEqual(saved.items.map(it => it.id), ['item-0', 'item-1']);
  assert.equal(saved.mode, 'deeper');
  assert.equal(saved.items[0].help.origin, 'teacher');
  assert.equal(saved.items[0].help.text, 'Aiuto personalizzato <b>senza markup</b>');
  assert.equal(saved.items[1].help.text, 'Secondo aiuto');
  assert.equal($saved('.activity b').length, 0);
  assert.match(h.q('#sp-status').textContent, /Percorso salvato/);
  await h.q('#sp-close').click();
  assert.equal(h.document.activeElement.id, 'previous');
});

test('percorso UI: apertura richiede approvazione e un progetto cambiato non viene salvato', async () => {
  const denied = await runtime({ allowed: false });
  assert.equal(denied.result, false);
  assert.equal(denied.q('#mappai-learning-path-dialog'), null);
  const h = await runtime();
  await h.input('#sp-objective', 'Un obiettivo concreto'); await h.q('#sp-next').click();
  await h.choose('item-0'); await h.q('#sp-next').click();
  h.appState.activeVaultPath = '/altro-progetto';
  await h.q('#sp-create').click();
  assert.equal(h.writes.length, 0);
  assert.match(h.q('#sp-status').textContent, /contenuti sono cambiati/);
  assert.equal(h.q('#sp-create').disabled, false, 'la UI torna utilizzabile dopo l’errore');
});

test('percorso UI: i nuovi testi locali seguono la lingua dei documenti', async () => {
  const h = await runtime({ language: 'en' });
  assert.equal(h.q('#sp-dialog-title').textContent, 'Create a short practice path');
  assert.equal(h.q('#sp-summary-mode').textContent, 'With support');
  assert.match(h.q('#sp-step-3').textContent, /The student tries to answer/);
});
