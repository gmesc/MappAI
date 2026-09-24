'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const Layout = require('../public/js/mappai-studio-layouts');
const Draw = require('../public/js/mappai-studio-draw');
const Editor = require('../public/js/mappai-link-editor-core');
const d3 = require('../public/js/d3.v7.min');

// Only the SVG DOM/selection is synthetic. Geometry, drawing, events, view
// controller and link identity use the application modules.
class SVG {
  constructor(tag = 'svg') { this.tag = tag; this.attrs = {}; this.events = {}; this.children = []; }
  append(tag) { const el = new SVG(tag); this.children.push(el); return el; }
  attr(key, value) { if (arguments.length === 1) return this.attrs[key]; this.attrs[key] = value; return this; }
  style(key, value) { return this.attr(key, value); }
  text(value) { this.content = value; return this; }
  on(event, fn) { this.events[event] = fn; return this; }
  selectAll() { return { remove: () => { this.children = []; } }; }
  all() { return this.children.flatMap(c => [c, ...c.all()]); }
}
function harness(mode) {
  const svg = new SVG(), focus = new SVG(), menus = [], warnings = [];
  const data = { nodes: ['ROOT', 'a', 'b'].map((id, i) => ({ id, label: id, level: i, group: 1 })),
    links: [{ id: '1', source: 'ROOT', target: 'a', rel: 'comprende' },
      { id: '2', source: 'a', target: 'b', rel: 'anticipa' },
      { id: '3', source: 'b', target: 'a', rel: 'segue', isCross: true },
      { id: '4', source: 'a', target: 'b', rel: 'influenza', isCross: true }] };
  const appState = { db: data, studioProfile: { mode, defv: 3, set: 'all', labels: 'full', bands: false, hops: true } };
  const window = { d3, MappAIStudioLayouts: Layout, MappAILinkEditorCore: Editor,
    MappAILinkEditor: { enabled: () => true }, showContextMenu: (ev, kind, link) => menus.push({ kind, link }),
    showToast: (...args) => warnings.push(args),
    MappAIStudioDraw: { draw: (el, res, nodes, opts) => Draw.draw(el, res, nodes, {
      ...opts, interactive: false, d3: { ...d3, select: el => el }
    }) } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/mappai-studio-view'), 'utf8'), {
    window, appState, console: { log() {} }, localStorage: { getItem: () => null },
    document: { getElementById: id => id === 'studio-svg' ? svg : id === 'sv-focus-svg' ? focus : null, addEventListener() {} }
  });
  window.MappAIStudioView._state.active = true;
  window.MappAIStudioView.render();
  return { svg, focus, data, window, menus, warnings };
}
function rightClick(el) {
  let prevented = 0, stopped = 0;
  el.events.contextmenu({ preventDefault: () => prevented++, stopPropagation: () => stopped++ });
  assert.equal(prevented, 1); assert.equal(stopped, 1);
}
for (const mode of ['td', 'dag']) {
  test(`${mode}: lines, cross-links and labels open the original link; blank links and focus refresh`, () => {
    const h = harness(mode), view = h.window.MappAIStudioView;
    const res = view._state.lastRes, drawn = res.edges.concat(res.extraEdges || []);
    assert.equal(drawn.length, h.data.links.length, 'parallel relations must remain addressable');
    if (mode === 'dag') assert.ok(drawn.some(e => e.edge.reversed));
    const hitPaths = h.svg.all().filter(el => el.attrs['data-link-hit'] != null);
    assert.equal(hitPaths.length, drawn.length);
    hitPaths.forEach(el => rightClick(el));
    assert.deepEqual(h.menus.map(m => m.link.id).sort(), ['1', '2', '3', '4']);
    h.menus.forEach(m => { assert.equal(m.kind, 'link'); assert.ok(h.data.links.includes(m.link)); });
    const label = h.svg.all().find(el => el.tag === 'text' && el.content === 'anticipa');
    rightClick(label); assert.equal(h.menus.at(-1).link, h.data.links[1]);
    const oldHit = hitPaths[0], original = h.menus[0].link;
    original.rel = ''; original.relNone = true;
    rightClick(oldHit); assert.equal(h.warnings.length, 1, 'stale geometry cannot edit a changed relation');
    view._state.focus = { id: 'a', mode: 'vicini', nodes: h.data.nodes, links: [] };
    view.refreshLinks();
    assert.ok(!h.svg.all().some(el => el.tag === 'text' && el.content === 'comprende'));
    assert.ok(!h.focus.all().some(el => el.tag === 'text' && el.content === 'comprende'));
    const blank = h.svg.all().find(el => el.attrs['data-link-hit'] === 0);
    rightClick(blank); assert.equal(h.menus.at(-1).link, original);
    assert.equal(h.data.nodes[1].level, 1);
    h.window.MappAILinkEditor.enabled = () => false;
    const before = h.menus.length; rightClick(blank); assert.equal(h.menus.length, before);
  });
}

test('synthetic paths have no edit handler; duplicate original identities fail closed', () => {
  const h = harness('dag'), svg = new SVG();
  const res = Layout.run(h.data.nodes, h.data.links, d3, { mode: 'percorso' });
  Draw.draw(svg, res, h.data.nodes, { d3: { ...d3, select: el => el }, interactive: false, onLinkContext() {} });
  assert.equal(svg.all().filter(el => el.events.contextmenu).length, 0);
  h.data.links.push({ ...h.data.links[0] });
  rightClick(h.svg.all().find(el => el.attrs['data-link-hit'] === 0));
  assert.equal(h.menus.length, 0); assert.equal(h.warnings.length, 1);
});
