'use strict';
/*
 * 0093, lotto G — la barra dell'editor della sintesi a 1470 px (MacBook Air) andava a capo:
 * «PDF» ed «Esci» su una seconda riga. Decisioni di Giacomo (13/10): «Voce» e «HTML» solo
 * icona, come la stampante; la tendina del carattere corta («Space Mono · app») e larga
 * quanto la voce scelta; dentro la console niente titolo nella barra (come già niente
 * «‹ Documenti»). Misurato nel browser con l'editor vero in un'area di 1190 px (la console
 * a 1470): barra alta 107 → 59 px, su una riga anche con «Salva ed Esci» e con Atkinson.
 *
 * Qui si fissa il sorgente: la misura dipende dal motore di impaginazione, che Node non ha.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SRC = read('public/js/mappai-doc-editor.js');
const corpo = nome => {
    const i = SRC.indexOf('function ' + nome + '(');
    assert.ok(i >= 0, nome);
    return SRC.slice(i, SRC.indexOf('\n    }\n', i));
};

test('G: «Voce» e «HTML» senza parola nel bottone, con la parola nell\'aria-label e nel fumetto', () => {
    const bar = corpo('_docBar');
    assert.equal(/<i data-lucide="headphones" class="w-4 h-4"><\/i><\/button>/.test(bar), true, 'Voce solo icona');
    assert.equal(/aria-label="' \+ esc\(t\('de_voce', 'Voce'\)\) \+ '"/.test(bar), true, 'Voce aria-label');
    assert.equal(/esc\(t\('de_voce', 'Voce'\) \+ ' — ' \+ t\('de_voce_tip'/.test(bar), true, 'Voce nel fumetto');
    assert.equal(/aria-label="HTML"><i data-lucide="file-code-2" class="w-4 h-4"><\/i><\/button>/.test(bar), true, 'HTML solo icona');
    assert.equal(bar.includes('</i> HTML</button>'), false);
    assert.equal(bar.includes("</i> ' + esc(t('de_voce'"), false);
});

test('G: dentro la console la barra non ripete il titolo; fuori sì, col pallino delle modifiche', () => {
    const bar = corpo('_docBar');
    assert.equal(/\(_inConsole\(\) \? '' :\s*'<div class="de-bar-t">' \+ esc\(title\) \+ '<span class="de-dirty" id="de-dirty">•<\/span><\/div>'\)/.test(bar), true);
    assert.equal(/const d = document\.getElementById\('de-dirty'\);\s*if \(d\)/.test(corpo('_paintDirty')), true, 'senza pallino non si rompe');
});

test('G: la prima voce della tendina del carattere è «<carattere> · app», e la tendina è larga quanto la voce scelta', () => {
    const font = corpo('_fontBar');
    assert.equal(font.includes("esc(dellApp) + ' · ' + esc(t('de_font_app_breve', 'app'))"), true);
    assert.equal(font.includes("t('de_font_app', 'Come l’app')"), false);
    assert.equal(/\n\.de-font \{ field-sizing:content; \}/.test(SRC), true);
});

test('G: la chiave nuova è solo in inglese', () => {
    assert.equal(/\bde_font_app_breve: "app",/.test(read('public/traduzioni/en_translations.js')), true);
    assert.equal(/\bde_font_app_breve:/.test(read('public/traduzioni/it_translations.js')), false);
});
