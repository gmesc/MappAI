/**
 * Verifica d'integrazione: carica mappai-structure-analyzer.js in due sandbox
 * browser-like — una CON il bundle graphology, una SENZA — e confronta l'output
 * di analyzeStructure() sui dataset di esempio. Devono essere identici (a parte
 * stats.engine), confermando che il dispatcher e il fallback sono equivalenti.
 *
 *   node scripts/verify-analyzer-graphology.js
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BUNDLE = fs.readFileSync(path.join(ROOT, 'public/js/vendor/mappai-graphology.min.js'), 'utf8');
const ANALYZER = fs.readFileSync(path.join(ROOT, 'public/js/mappai-structure-analyzer.js'), 'utf8');

function makeSandbox(withGraphology) {
    const sandbox = {};
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.console = console;
    vm.createContext(sandbox);
    if (withGraphology) {
        vm.runInContext(BUNDLE, sandbox, { filename: 'mappai-graphology.min.js' });
    }
    vm.runInContext(ANALYZER, sandbox, { filename: 'mappai-structure-analyzer.js' });
    return sandbox.MappAIStructureAnalyzer;
}

function loadData(file) {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/esempi', file), 'utf8'));
    return {
        nodes: raw.nodes || (raw.db && raw.db.nodes) || [],
        links: raw.links || (raw.db && raw.db.links) || []
    };
}

const apiWith = makeSandbox(true);
const apiWithout = makeSandbox(false);

function canonical(suggestions) {
    // Ordina in modo stabile e rimuove rumore di ordinamento per confronto profondo.
    return suggestions
        .map(s => JSON.stringify({ type: s.type, nodeId: s.nodeId, severity: s.severity, message: s.message, data: s.data }))
        .sort();
}

let allOk = true;

['formato-esempio-claude.json', 'rete_elettrica.json'].forEach(file => {
    const { nodes, links } = loadData(file);
    const rWith = apiWith.analyzeStructure(nodes, links);
    const rWithout = apiWithout.analyzeStructure(nodes, links);

    const cWith = canonical(rWith.suggestions);
    const cWithout = canonical(rWithout.suggestions);

    const same = cWith.length === cWithout.length && cWith.every((s, i) => s === cWithout[i]);

    console.log(`\n=== ${file} (${nodes.length} nodi, ${links.length} link) ===`);
    console.log(`  engine WITH:    ${rWith.stats.engine}   (atteso: graphology)`);
    console.log(`  engine WITHOUT: ${rWithout.stats.engine}   (atteso: custom)`);
    console.log(`  suggerimenti: ${rWith.suggestions.length} vs ${rWithout.suggestions.length}`);
    console.log(`  topology: ${rWith.stats.topology} | mode: ${rWith.stats.mode} | density: ${rWith.stats.density}`);
    console.log(`  → suggerimenti IDENTICI: ${same ? 'SI ✅' : 'NO ❌'}`);

    if (rWith.stats.engine !== 'graphology') { console.log('  ❌ engine WITH non è graphology'); allOk = false; }
    if (rWithout.stats.engine !== 'custom') { console.log('  ❌ engine WITHOUT non è custom'); allOk = false; }
    if (!same) {
        allOk = false;
        console.log('  --- DIFF ---');
        cWith.forEach((s, i) => { if (s !== cWithout[i]) console.log('   WITH   :', s); });
        cWithout.forEach((s, i) => { if (s !== cWith[i]) console.log('   WITHOUT:', s); });
    }
});

console.log(`\n${allOk ? '✅ TUTTO OK — dispatcher e fallback equivalenti, engine corretto.' : '❌ DIFFERENZE RILEVATE — vedi sopra.'}`);
process.exit(allOk ? 0 : 1);
