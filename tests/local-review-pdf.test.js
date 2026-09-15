'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const geometry = require('../public/js/mappai-proiezione-core');

function harness() {
  const elements = new Map(), timers = new Map(); let resized, timerId = 0;
  function element() {
    return { style: {}, dataset: {}, hidden: false, events: {}, attributes: {}, clientWidth: 600, clientHeight: 500,
      addEventListener(name, fn) { this.events[name] = fn; },
      setAttribute(name, value) { this.attributes[name] = value; },
      getBoundingClientRect() { return { left: 10, top: 20 }; }, focus() {},
      setPointerCapture(id) { this.pointer = id; }, hasPointerCapture(id) { return this.pointer === id; }, releasePointerCapture() { this.pointer = null; },
      getContext() { return { drawImage: image => { this.drawn = image; } }; }
    };
  }
  for (const id of ['pdf-viewer', 'pdf-canvas', 'pdf-status', 'pdf-fit']) elements.set(id, element());
  const window = { MappAIProiezioneCore: geometry, devicePixelRatio: 2, addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../local-ai/review-pdf.js'), 'utf8'), {
    window, document: { getElementById: id => elements.get(id), createElement: element },
    ResizeObserver: class { constructor(fn) { resized = fn; } observe() {} },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); }
  });
  const viewer = elements.get('pdf-viewer'), canvas = elements.get('pdf-canvas');
  const state = () => canvas.style.transform.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/g).map(Number);
  const event = (name, fields = {}) => {
    const e = { preventDefault() { this.prevented = true; }, isPrimary: true, button: 0, pointerId: 1, ...fields };
    viewer.events[name](e); return e;
  };
  return { api: window.MappAIReviewPdf, viewer, canvas, elements, event, state, resize: () => resized(), timers };
}
function pdf(width = 600, height = 900) {
  const jobs = [];
  return { jobs, getViewport: ({ scale }) => ({ width: width * scale, height: height * scale }),
    render({ canvasContext, viewport }) {
      let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      const task = { promise, viewport, canvasContext, resolve, reject, cancel() { this.canceled = true; } }; jobs.push(task); return task;
    }
  };
}
async function load(h, page) { h.api.loading(); const ready = h.api.show(page); page.jobs.at(-1).resolve(); await ready; }

test('PDF wheel anchors the document under the pointer; drag, cancel, fit and resize stay reversible', async () => {
  const h = harness(), page = pdf(); await load(h, page);
  const before = h.state(), e = h.event('wheel', { clientX: 310, clientY: 220, deltaY: -100, deltaMode: 0 });
  const after = h.state(); assert(e.prevented); assert(after[2] > before[2]);
  assert(Math.abs((300 - before[0]) / before[2] - (300 - after[0]) / after[2]) < 1e-9);
  assert(Math.abs((200 - before[1]) / before[2] - (200 - after[1]) / after[2]) < 1e-9);
  h.event('pointerdown', { button: 2, clientX: 300, clientY: 200 }); assert.equal(h.viewer.pointer, undefined);
  h.event('pointerdown', { clientX: 300, clientY: 200 }); h.event('pointermove', { clientX: 340, clientY: 170 });
  assert.equal(h.state()[0], after[0] + 40); assert.equal(h.state()[1], after[1] - 30);
  h.event('pointercancel'); assert.equal(h.viewer.pointer, null); assert.equal(h.viewer.dataset.dragging, undefined);
  h.elements.get('pdf-fit').events.click(); assert.deepEqual(h.state(), [0, 0, 1]);
  h.viewer.clientWidth = 900; h.resize(); assert.deepEqual(h.state(), [0, 0, 1.5]);
  h.event('keydown', { key: 'ArrowDown' }); assert.equal(h.state()[1], -48);
  h.event('keydown', { key: '0' }); assert.deepEqual(h.state(), [0, 0, 1.5]);
});

test('a late PDF render or error never replaces the newly selected page', async () => {
  const h = harness(), old = pdf(400), next = pdf(800);
  h.api.loading(); const a = h.api.show(old);
  h.api.loading(); const b = h.api.show(next);
  next.jobs[0].resolve(); await b;
  assert.equal(h.canvas.style.width, '800px'); assert.equal(h.canvas.width, 1200);
  const visible = h.canvas.drawn;
  old.jobs[0].reject(Error('Late failure from previous page')); await a;
  assert.equal(h.canvas.drawn, visible); assert.equal(h.canvas.hidden, false);
  assert.equal(h.elements.get('pdf-status').hidden, true); assert(old.jobs[0].canceled);
});

test('PDF rerasterization is delayed during wheel gestures and bounded on Retina', async () => {
  const h = harness(), page = pdf(); await load(h, page);
  for (let i = 0; i < 30; i++) h.event('wheel', { clientX: 310, clientY: 220, deltaY: -100, deltaMode: 0 });
  assert.equal(page.jobs.length, 1); assert.equal(h.timers.size, 1);
  const draw = [...h.timers.values()][0](); const job = page.jobs.at(-1);
  assert(job.viewport.width * job.viewport.height <= 16000000.01);
  assert(Math.max(job.viewport.width, job.viewport.height) <= 8192);
  job.resolve(); await draw; assert.equal(h.canvas.hidden, false);
  assert(h.canvas.width * h.canvas.height <= 16000000);
});

test('restoring the already-rendered fit cancels a pending zoom bitmap', async () => {
  const h = harness(), page = pdf(); await load(h, page); const original = h.canvas.drawn;
  h.event('wheel', { clientX: 310, clientY: 220, deltaY: 100, deltaMode: 0 });
  const pending = [...h.timers.values()][0](), job = page.jobs.at(-1);
  h.elements.get('pdf-fit').events.click(); await [...h.timers.values()].at(-1)();
  job.resolve(); await pending;
  assert(job.canceled); assert.equal(h.canvas.drawn, original); assert.deepEqual(h.state(), [0, 0, 1]);
});

test('a synchronous renderer error is visible and ends the loading state', async () => {
  const h = harness(), page = pdf(); page.render = () => { throw Error('Renderer unavailable'); };
  h.api.loading(); await h.api.show(page);
  assert.equal(h.canvas.hidden, true); assert.equal(h.elements.get('pdf-status').hidden, false);
  assert.equal(h.elements.get('pdf-status').textContent, 'Renderer unavailable');
  assert.equal(h.viewer.attributes['aria-busy'], 'false');
});
