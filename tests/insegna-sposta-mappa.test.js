'use strict';
/*
 * insegna-sposta-mappa.test.js — spostare di classe o materia la mappa APERTA (25/9)
 * `_applyAssignment` sposta la cartella e deve riallineare lo stato, o il prossimo
 * autosave riscrive il percorso vecchio. Leggeva `window.appState`, che non esiste:
 * `appState` è una `let` di app.js (invariante 3), quindi lo stato non si allineava
 * mai. I pezzi si prendono dal sorgente, come in teach-core.test.js.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mappai-landing-teach.js'), 'utf8');
function pezzo(da, a) {
    const i = src.indexOf(da), j = src.indexOf(a, i);
    assert.ok(i >= 0 && j > i, 'non trovo ' + da + ' … ' + a);
    return src.slice(i, j);
}
const FC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-files-core.js'));
/* `appState` e `StorageManager` entrano come nomi LESSICALI (parametri), come
   nell'app; `window` non li ha — è proprio il caso che il vecchio codice sbagliava */
const fabbrica = new Function('appState', 'StorageManager', 'window', 'localStorage', 'FCore', 'projectsRead', 'toast', '_t',
    pezzo('function _applyAssignment', '// Fallback senza Electron') +
    pezzo('function _appState', '/* La mappa CHIESTA') + '; return _applyAssignment;');

function prova(apertoId) {
    const appState = { activeVaultPath: '/Mappe/Generico/Clima', activeVaultClassDir: null, activeVaultDiscDir: null };
    const progetti = [{ id: 'p1', vault: 'Clima' }];
    const salvati = {};
    const win = {
        MappAIClasses: { get: id => (id === 'c1' ? { id: 'c1', name: '2B', sede: '' } : null) },
        electronAPI: { vaultRelocate: () => Promise.resolve({ success: true, folderName: 'Clima', fullPath: '/Mappe/2B/Geografia/Clima' }) }
    };
    const applica = fabbrica(appState, { currentProjectId: apertoId }, win,
        { setItem: (k, v) => { salvati[k] = JSON.parse(v); } }, () => FC, () => progetti, () => { }, (k, f) => f);
    return { appState, salvati, applica };
}

test('spostare la mappa aperta riallinea appState: il prossimo autosave scrive nella cartella nuova', async () => {
    const p = prova('p1');
    assert.equal(await p.applica({ p: { id: 'p1' }, v: { fullPath: '/Mappe/Generico/Clima' } }, 'c1', 'Geografia'), true);
    assert.equal(p.appState.activeVaultPath, '/Mappe/2B/Geografia/Clima');
    assert.equal(p.appState.activeVaultClassDir, FC.mapClassFolder('', '2B'));
    assert.equal(p.appState.activeVaultDiscDir, FC.disciplineFolder('Geografia'));
    assert.equal(p.salvati.tutor_ai_projects[0].cls, '2B', 'e i metadati del progetto seguono');
});

test('spostare un\'altra mappa non tocca lo stato di quella aperta', async () => {
    const p = prova('p9');
    await p.applica({ p: { id: 'p1' }, v: { fullPath: '/Mappe/Generico/Clima' } }, 'c1', 'Geografia');
    assert.equal(p.appState.activeVaultPath, '/Mappe/Generico/Clima');
    assert.equal(p.appState.activeVaultClassDir, null);
});
