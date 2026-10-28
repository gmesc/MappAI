'use strict';
/*
 * importa-vault-porta-unica.test.js — packet 0124, lotto 1 (ADR 0025 in bozza).
 *
 * Un progetto entra in «MappAI - file» da una porta sola, «Importa vault» in CREA.
 * Giacomo, 23/10: «elimina il tasto e la funzione 'esporta nel vault'»; 24/10: «il
 * Graph manager sparisce del tutto (voce e finestra); «Importa vault» resta solo in
 * CREA. «Apri JSON» di CREA resta.»
 *
 * Che cosa si prova, sui file veri:
 *   · `saveMapVault` non esiste più e nessuno la chiama (era «Esporta nel Vault»: la
 *     cartella scelta, anche la Scrivania, DIVENTAVA la cartella del progetto);
 *   · «Sincronizza Vault» (`#sync-vault-btn`, stessa funzione) non c'è più, né chi lo
 *     mostrava o nascondeva;
 *   · il Graph manager non c'è più (la voce, la finestra, il campo nascosto del JSON
 *     che solo lui cliccava); gli hub «Materiali di studio» e «Documenti salvati» sì;
 *   · «Apri JSON» di CREA resta col suo campo;
 *   · il bottone di CREA e il modulo del bento dicono «Importa vault» (EN «Import vault»);
 *   · la vista ridotta non nasconde più l'unica porta;
 *   · i dizionari non tengono le chiavi rimaste senza lettori.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RADICE = path.join(__dirname, '..');
const PUB = path.join(RADICE, 'public');
const leggi = (...p) => fs.readFileSync(path.join(PUB, ...p), 'utf8');
const HTML = leggi('index.html');
const IT = vm.runInNewContext(leggi('traduzioni', 'it_translations.js') + ';it_translations');
const EN = vm.runInNewContext(leggi('traduzioni', 'en_translations.js') + ';en_translations');

// i JS dell'app (senza le librerie vendorizzate), col testo
function jsDellApp() {
  const out = [];
  (function giro(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'vendor') giro(p); }
      else if (e.name.endsWith('.js')) out.push([path.relative(RADICE, p), fs.readFileSync(p, 'utf8')]);
    }
  })(path.join(PUB, 'js'));
  return out;
}
const JS = jsDellApp();
const chiChiama = (re) => JS.filter(([, t]) => re.test(t)).map(([f]) => f);

// l'elemento con quell'id in index.html: il tag d'apertura e il testo fino alla chiusura
function elemento(id) {
  const i = HTML.indexOf('id="' + id + '"');
  if (i < 0) return null;
  const a = HTML.lastIndexOf('<', i);
  const tag = HTML.slice(a, HTML.indexOf('>', i) + 1);
  const nome = /^<([a-z]+)/.exec(tag)[1];
  const fine = HTML.indexOf('</' + nome + '>', a);
  return { tag, tutto: HTML.slice(a, fine + nome.length + 3) };
}

test('0124 L1: saveMapVault («Esporta nel Vault») non esiste più e nessuno la chiama', () => {
  assert.equal(/saveMapVault\s*=/.test(leggi('js', 'mappai-vault-io.js')), false, 'mappai-vault-io.js non definisce più saveMapVault');
  assert.deepEqual(chiChiama(/saveMapVault\s*\(/), [], 'nessun JS chiama saveMapVault');
  assert.equal(/saveMapVault/.test(HTML), false, 'index.html non la nomina');
});

test('0124 L1: «Sincronizza Vault» non c\'è più, né chi lo mostrava', () => {
  assert.equal(elemento('sync-vault-btn'), null, 'index.html senza #sync-vault-btn');
  assert.deepEqual(chiChiama(/sync-vault-btn/), [], 'nessun JS cerca #sync-vault-btn');
});

test('0124 L1: il Graph manager sparisce del tutto; gli altri hub restano', () => {
  assert.equal(/openGraphManagerModal/.test(HTML), false, 'la voce del menu «Azioni Rapide» non c\'è');
  assert.equal(elemento('menu-import-json'), null, 'il campo nascosto del JSON che solo il Graph manager cliccava non c\'è');
  assert.deepEqual(chiChiama(/openGraphManagerModal/), [], 'nessun JS definisce o chiama openGraphManagerModal');
  const hubs = leggi('js', 'mappai-menu-hubs.js');
  assert.match(hubs, /window\.openStudyMaterialsModal\s*=\s*function/, 'l\'hub «Materiali di studio» resta');
  assert.match(hubs, /window\.openSavedDocsModal\s*=\s*function/, 'l\'hub «Documenti salvati» resta');
});

test('0124 L1: «Apri JSON» di CREA resta, col suo campo', () => {
  const b = elemento('qa-apri-json');
  assert.ok(b, '#qa-apri-json c\'è');
  assert.match(b.tag, /window\.openJSONUploader\(\)/);
  const campo = elemento('landing-import');
  assert.ok(campo, '#landing-import c\'è');
  assert.match(campo.tag, /window\.importGraph\(event\)/);
});

test('0124 L1: il bottone di CREA e il modulo del bento si chiamano «Importa vault»', () => {
  const b = elemento('qa-apri-vault');
  assert.ok(b, '#qa-apri-vault c\'è');
  assert.match(b.tag, /window\.loadMapVault\(\)/, 'apre ancora l\'import (loadMapVault → MappAIImportVault)');
  const et = /data-i18n="btn_open_vault">([^<]*)</.exec(b.tutto);
  assert.ok(et, 'l\'etichetta passa dalla chiave btn_open_vault');
  assert.equal(et[1], 'Importa vault');
  assert.equal(IT.btn_open_vault, 'Importa vault');
  assert.equal(EN.btn_open_vault, 'Import vault');
  const riga = leggi('js', 'mappai-bento-composizione.js').split('\n').find(l => l.indexOf("id: 'mn-apri-vault'") >= 0);
  assert.ok(riga, 'il modulo mn-apri-vault c\'è');
  assert.match(riga, /et: 'Importa vault'/);
  assert.match(riga, /aiuto: '[^']*[Cc]opia[^']*'/, 'l\'aiuto dice che la cartella si copia');
});

test('0124 L1: la vista ridotta non nasconde l\'unica porta («Apri JSON» sì, come prima)', () => {
  const css = leggi('css', 'mappai-modal-tokens.css');
  assert.equal(/\.mappai-ridotta\s+#qa-apri-vault/.test(css), false);
  assert.match(css, /\.mappai-ridotta\s+#qa-apri-json/);
});

test('0124 L1: i dizionari non tengono le chiavi rimaste senza lettori', () => {
  const ORFANE = ['tt_open_vault', 'ui_export_vault', 'tt_save_vault', 'ui_import_vault', 'iv_tt_vimport', 'ui_sync_vault', 'tt_sync_vault',
    'tst_vault_created', 'ui_graph_manager', 'tt_graph_manager', 'gm_section_vault', 'gm_section_json', 'gm_section_notes',
    'tt_import_json', 'ui_export_notes', 'tt_export_notes_md'];
  ORFANE.forEach(k => {
    const re = new RegExp('[\'"]' + k + '[\'"]');
    assert.deepEqual(chiChiama(re), [], k + ': nessun JS la legge');
    assert.equal(re.test(HTML), false, k + ': index.html non la legge');
    assert.equal(Object.prototype.hasOwnProperty.call(IT, k), false, k + ' fuori da it_translations');
    assert.equal(Object.prototype.hasOwnProperty.call(EN, k), false, k + ' fuori da en_translations');
  });
  // `hub_fn_missing` ha altri lettori, e `import_json` lo legge `changeLanguage` (`t.import_json`): restano
  assert.ok(Object.prototype.hasOwnProperty.call(EN, 'hub_fn_missing'));
  assert.ok(Object.prototype.hasOwnProperty.call(IT, 'import_json') && Object.prototype.hasOwnProperty.call(EN, 'import_json'));
});
