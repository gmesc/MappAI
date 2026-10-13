'use strict';
/*
 * 0067 (01/10) — la regola che scrive `dossier:` in index.yaml (`buildVaultMapData`,
 * mappai-vault-io.js). Le sidebar scelgono l'icona da lì senza aprire il vault.
 * Prima valeva solo se `fonte_0` era il PRIMO nodo in memoria: dopo la revisione o una
 * riapertura l'ordine cambia, e il dossier si salvava come mappa.
 * Il file vero si carica in una `vm`, con lo stretto indispensabile intorno.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mappai-vault-io.js'), 'utf8');

function mapData(nodes) {
    const ctx = {
        console: { log() {}, warn() {}, info() {}, error() {} },
        localStorage: { getItem() { return null; }, setItem() {} },
        document: { getElementById() { return null; }, addEventListener() {}, querySelector() { return null; } },
        addEventListener() {},
        tutorState: {},
        serializeTutorState() { return {}; },
        appState: { db: { nodes, links: [] }, extractionMode: 'mindmap', rootNodeLabel: 'x', aiProvider: 'google' }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx);
    return ctx.window.buildVaultMapData();
}

const fonte0 = { id: 'fonte_0', label: 'Foto', level: 0 };
const identita = { id: 'fonte_identita', label: "Carta d'identità", level: 1 };

test('dossier: fonte_0 primo nodo → dossier', () => {
    assert.equal(mapData([fonte0, identita]).dossier, true);
});

test('dossier: fonte_0 NON primo (ordine dopo una riapertura) → dossier lo stesso', () => {
    assert.equal(mapData([identita, fonte0]).dossier, true);
});

test('dossier: una mappa senza fonte_0 → non è un dossier', () => {
    assert.equal(mapData([{ id: 'n1', level: 0 }, { id: 'fonte_identita', level: 1 }]).dossier, false);
    assert.equal(mapData([]).dossier, false);
});
