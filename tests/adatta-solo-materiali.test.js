'use strict';
/*
 * 0093, lotto K — gate di Giacomo (13/10): nel modale «Genera materiali» aperto su un progetto GIÀ FATTO
 * (ELABORA, INSEGNA: `openModal({ fromApproved: true })`) la mappa non si rigenera — il giro fa solo i passi
 * dei materiali (`runApprovedMaterials`, `only: ['B','C','D','E']`) — quindi «Adatta alla classe» non offre
 * «Solo la mappa» né «Entrambi»: resta la spunta, che vale per i materiali. In CREA il modale resta com'era.
 *
 * `Pipeline.openModal` vero in una vm, con un DOM minimo che raccoglie l'HTML del modale.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function modale(daProgetto) {
    const aggiunti = [];
    const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, dataset: {},
        setAttribute() {}, getAttribute: () => null, addEventListener() {}, appendChild(c) { return c; }, remove() {},
        querySelector: () => null, querySelectorAll: () => [], innerHTML: '', id: '' });
    const ctx = vm.createContext({
        console: { log() {}, info() {}, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {},
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: el,
            body: { appendChild: c => { aggiunti.push(c); return c; } }, addEventListener() {}, readyState: 'complete',
            documentElement: { classList: { add() {}, remove() {}, contains: () => false } } },
        appState: { aiProvider: 'google', db: { nodes: [], links: [] }, sources: [{ name: 'f' }], activeVaultPath: '/v',
            _pipelineManifest: daProgetto ? { review: { approvedRevision: 'r1' } } : null },
        CustomEvent: class { constructor(n) { this.type = n; } }
    });
    ctx.window = ctx;
    Object.assign(ctx, { showToast() {}, t: (_k, f) => f, getSystemKey: () => 'k', safeCreateIcons() {},
        MappAIPipelineCore: require('../public/js/mappai-pipeline-core.js') });
    vm.runInContext(read('public/js/mappai-material-pipeline.js'), ctx);
    try { ctx.MappAIPipeline.openModal(daProgetto ? { fromApproved: true } : {}); } catch (e) { /* l'HTML è già nel DOM: si ferma dopo, collegando i bottoni (`onclick` su elementi che il DOM finto non ha) */ if (process.env.K_DEBUG) console.error(e); }
    return aggiunti.map(m => m.innerHTML || '').join('\n');
}

test('K: su un progetto già fatto «Adatta alla classe» non offre «Solo la mappa» né «Entrambi»', () => {
    const html = modale(true);
    assert.ok(html.includes('id="mp-adapt-on"'), 'il modale è stato costruito');
    assert.equal(html.includes('value="map"'), false);
    assert.equal(html.includes('value="both"'), false);
    assert.ok(html.includes('<input type="radio" name="mp-adapt-scope" value="materials" checked hidden>'));
    assert.ok(html.includes('Vale per i materiali: la sintesi segue registro e note della classe.'));
});

test('K: in CREA (modale senza progetto) le tre scelte restano', () => {
    const html = modale(false);
    assert.ok(html.includes('id="mp-adapt-on"'), 'il modale è stato costruito');
    assert.ok(html.includes('value="map"') && html.includes('value="materials"') && html.includes('value="both"'));
    assert.equal(html.includes('Vale per i materiali:'), false);
});

test('K: un preset «solo mappa» su un progetto già fatto spegne la spunta; la chiave inglese esiste', () => {
    assert.ok(read('public/js/mappai-material-pipeline.js').includes("else if (scope === 'map' && Pipeline._reviewTarget) set('mp-adapt-on', false);"));
    assert.ok(/\bmp_adapt_solo_mat: "Applies to the materials:/.test(read('public/traduzioni/en_translations.js')));
});
