'use strict';
/*
 * sidebar-0122.test.js — la sidebar della mappa dopo il lotto 1 del packet 0122
 * (Giacomo, 21/10/2026, sul banco `banco-sidebar`): i titoletti delle sette tab senza
 * icona, la tendina delle modalità del tutor, il bottone «Invia» quadrato con la sola
 * icona, le bolle a 15 con i bordi senza colore, la sidebar a sinistra e sillabata con
 * ogni carattere, le chiavi in inglese, i marcatori di cache.
 *
 * La sidebar è HTML statico in index.html più tre moduli: qui si legge il sorgente.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const leggi = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = leggi('public/index.html');
const aside = html.slice(html.indexOf('<aside id="sidebar"'), html.indexOf('</aside>'));

/* il div che contiene l'attributo dato, con quello che c'è fra il suo `<div` e il `</div>` */
function blocco(testo, attr) {
  const i = testo.indexOf(attr);
  assert.ok(i >= 0, 'manca ' + attr);
  const a = testo.lastIndexOf('<div', i), b = testo.indexOf('</div>', i);
  return testo.slice(a, b);
}

test('0122: i cinque titoletti statici hanno lo stile del titolo di «Vista studio» e nessuna icona', () => {
  ['sb_tit_indice', 'sb_tit_note', 'sb_tit_studio', 'sb_tit_finder', 'sb_tit_tutor'].forEach(k => {
    const b = blocco(aside, 'data-i18n="' + k + '"');
    assert.ok(/class="[^"]*\btext-sm\b[^"]*\bfont-bold\b[^"]*\btext-slate-600\b/.test(b), k + ': text-sm font-bold text-slate-600 — ' + b);
    assert.ok(!b.includes('data-lucide'), k + ': niente icona');
    assert.ok(!b.includes('uppercase'), k + ': non maiuscolo');
  });
  // alla stessa altezza (Giacomo al gate, 21/10): 16 dall'alto e da sinistra, 12 sotto — o da soli (px-4 pt-4 mb-3) o dentro una testata p-4
  ['sb_tit_indice', 'sb_tit_note', 'sb_tit_studio'].forEach(k => {
    assert.ok(blocco(aside, 'data-i18n="' + k + '"').includes('class="px-4 pt-4 mb-3 text-sm'), k + ' a 16/16 con 12 sotto');
  });
  ['sb_tit_finder', 'sb_tit_tutor'].forEach(k => {
    const i = aside.indexOf('data-i18n="' + k + '"');
    const testata = aside.slice(aside.lastIndexOf('<div class="p-4 border-b', i), i);
    const tag = testata.slice(0, testata.indexOf('>'));   // il solo tag di apertura: i commenti citano il «p-5» di prima
    assert.ok(tag.includes('sticky top-0') && !tag.includes('p-5'), k + ': dentro la testata p-4 (era p-5)');
  });
  assert.ok(aside.includes('<div id="tree-view-container" class="px-4 pb-4 space-y-1">'), 'l\'albero non aggiunge spazio sopra');
  assert.ok(aside.includes('<div id="study-dashboard" class="px-5 pb-4 flex flex-col gap-4">'), 'il cruscotto di Studio non aggiunge spazio sopra');
  // i testi italiani, come li ha detti Giacomo
  assert.ok(aside.includes('data-i18n="sb_tit_indice">Indice<'));
  assert.ok(aside.includes('data-i18n="sb_tit_note">Note<'));
  assert.ok(aside.includes('data-i18n="sb_tit_studio">Studio<'));
  assert.ok(aside.includes('data-i18n="sb_tit_finder">Finder<'));
  assert.ok(aside.includes('data-i18n="sb_tit_tutor">Tutor<'));
  // le intestazioni di prima, con l'icona, non ci sono più
  assert.ok(!aside.includes('data-i18n="ui_collector"'), '«RACCOGLITORE» via');
  assert.ok(!aside.includes('data-i18n="ui_global_tutor"'), '«TUTOR GLOBALE» via');
  assert.ok(!aside.includes('data-lucide="book-open"'), 'l\'icona di «RACCOGLITORE» via (il «bot» della linguetta della tab resta: è la tab, non il titolo)');
  const testaTutor = aside.slice(aside.indexOf('data-i18n="sb_tit_tutor"'), aside.indexOf('id="sidebar-tutor-chat-history"'));
  assert.ok(!testaTutor.includes('data-lucide="bot"'), 'nessun «bot» accanto al titoletto Tutor');
});

test('0122: «Vista studio» e «Attività live» hanno il titoletto senza icona', () => {
  const sv = leggi('public/js/mappai-studio-view.js');
  assert.ok(!sv.includes('layout-panel-top'), 'l\'icona del titolo «Vista studio» è uscita');
  assert.equal((sv.match(/<div class="text-sm font-bold text-slate-600 mb-3">' \+\s*(\/\*[^*]*\*\/\s*)?t\('sv_title', 'Vista studio'\)/g) || []).length, 2, 'i due titoli (mappa libera e vista di studio)');
  const ct = leggi('public/js/mappai-collab-teacher.js');
  assert.ok(ct.includes("limTitoletto(t('sb_tit_live', 'Attività live'))"));
});

test('0122: il tutor — tendina delle modalità (12 px, alta 28), campo a 15, «Invia» quadrato con la sola icona', () => {
  const t = leggi('public/js/mappai-ai-tutor.js');
  const i = t.indexOf('window.renderSidebarTutorModes = function');
  const fn = t.slice(i, t.indexOf('\n};', i));
  assert.ok(fn.includes('<select aria-label="${eti}"'), 'una select con aria-label');
  assert.ok(fn.includes('onchange="window.setSidebarTutorMode(this.value || null)"'), 'la scelta passa da setSidebarTutorMode');
  assert.ok(fn.includes('class="w-full h-7 px-2 text-xs'), 'alta 28 (h-7), corpo 12 (text-xs)');
  assert.ok(fn.includes('<option value="${m.id || \'\'}" title="${tip}"'), 'ogni voce porta la spiegazione nel title');
  assert.ok(!fn.includes('rounded-full'), 'i chip non ci sono più');
  // il tutor del nodo tiene i suoi chip (fuori lotto)
  const j = t.indexOf('window.renderNodeTutorModes = function');
  assert.ok(t.slice(j, t.indexOf('\n};', j)).includes('rounded-full'), 'i chip del tutor del nodo restano');
  // index.html: il contenitore delle modalità, poi campo e bottone su una riga
  assert.ok(aside.includes('<div id="sidebar-tutor-modes"></div>'));
  const campo = aside.slice(aside.indexOf('id="ai-sidebar-input"'), aside.indexOf('onkeypress', aside.indexOf('id="ai-sidebar-input"')));
  assert.ok(campo.includes('flex-1 min-w-0') && campo.includes('text-[15px]'), 'campo a 15, che riempie la riga: ' + campo);
  // la regola del lotto 10b porterebbe il campo a 12 (--mm-ctl-fs): la regola di index.html, con l'id della sidebar, la vince
  assert.ok(html.includes('html[data-app="docente"] #sidebar #ai-sidebar-input { font-size: 15px; }'), 'il campo resta a 15 anche sotto data-app="docente"');
  const btn = aside.slice(aside.indexOf('id="btn-sidebar-tutor-send"'), aside.indexOf('</button>', aside.indexOf('id="btn-sidebar-tutor-send"')));
  assert.ok(btn.includes('aria-label="Invia"') && btn.includes('title="Invia"'), 'il bottone dice «Invia» a chi non vede l\'icona');
  assert.ok(btn.includes('h-[var(--mm-ctl-h)] w-[var(--mm-ctl-h)]') && btn.includes('p-0'), 'quadrato, alto quanto un controllo');
  assert.ok(!btn.includes('<span'), 'nessuna etichetta a schermo');
  assert.ok(btn.includes('data-lucide="send" class="w-5 h-5"'));
});

test('0122: le bolle della chat della sidebar a 15, bordi senza colore, l\'allievo col verde di «Genera»', () => {
  const t = leggi('public/js/mappai-ai-tutor.js');
  const bolla = 'p-3 rounded-lg text-[15px] leading-normal';
  // saluto (resetSidebarTutor e index.html), allievo e tutor (sendSidebarTutorMessage)
  const reset = t.slice(t.indexOf('window.resetSidebarTutor'), t.indexOf('window.sendSidebarTutorMessage'));
  assert.ok(reset.includes('bg-indigo-50 text-indigo-800 ' + bolla + ' rounded-tl-none border border-transparent'));
  const invio = t.slice(t.indexOf('window.sendSidebarTutorMessage'), t.indexOf('window.resetNodeTutor'));
  assert.ok(invio.includes('bg-[var(--man-verde,#41e6aa)] text-[var(--mm-testo,#404040)] ' + bolla + ' rounded-tr-none border border-transparent'), 'la bolla dell\'allievo');
  assert.ok(invio.includes('bg-indigo-50 text-indigo-800 ' + bolla + ' rounded-tl-none border border-transparent'), 'la bolla del tutor');
  assert.ok(!invio.includes('bg-emerald-500') && !invio.includes('rounded-lg text-xs'), 'niente verde smeraldo né bolle a 12 nella chat della sidebar');
  assert.ok(aside.includes('bg-indigo-50 text-indigo-800 ' + bolla + ' rounded-tl-none border border-transparent self-start shadow-sm markdown-body'), 'il saluto statico');
  // il tutor del nodo resta com\'era (fuori lotto)
  const nodo = t.slice(t.indexOf('window.sendNodeTutorMessage'));
  assert.ok(nodo.includes('bg-emerald-500 text-black p-3 rounded-lg text-xs'), 'le bolle del tutor del nodo non cambiano');
});

test('0122: la sidebar è a sinistra e sillabata con ogni carattere (style.css), e l\'albero ha i pallini nuovi', () => {
  const css = leggi('public/css/style.css');
  const i = css.indexOf('#sidebar .modal-scroll,\n#sidebar .modal-scroll * {');
  assert.ok(i >= 0, 'la regola della sidebar');
  const regola = css.slice(i, css.indexOf('}', i));
  ['hyphens: auto !important', 'text-align: left !important', 'text-align-last: auto !important'].forEach(d => assert.ok(regola.includes(d), d));
  assert.ok(!regola.includes('data-font') && !regola.includes('data-app'), 'vale per ogni carattere e anche per il reader');
  // viene DOPO la regola di Space Mono che giustifica (a parità di !important vince l'id, ma l'ordine non guasta)
  assert.ok(i > css.indexOf('html[data-font="space-mono"] .modal-scroll,'));
  // i pallini dell'albero in proporzione ai corpi nuovi
  assert.ok(html.includes('.tree-dot-toggle { width: 22px; height: 22px;'));
  assert.ok(html.includes('font-weight: 700; font-size: 16px; line-height: 1; display: block; }'), 'il segno del pallino a 16');
  assert.ok(html.includes('.tree-dot-static { width: 16px; height: 16px;'));
  assert.ok(html.includes('.tree-child-dot { width: 11px; height: 11px;'));
});

test('0122: le chiavi nuove stanno nel dizionario inglese; le vecchie del menu di MappAI Live restano', () => {
  const en = leggi('public/traduzioni/en_translations.js');
  ['sb_tit_indice', 'sb_tit_note', 'sb_tit_studio', 'sb_tit_finder', 'sb_tit_tutor', 'sb_tit_live',
    'lim_card_live', 'lim_card_live_d', 'lim_card_board', 'lim_card_board_d', 'lim_card_tutor', 'lim_card_tutor_d', 'lim_card_mat', 'lim_card_mat_d'
  ].forEach(k => assert.ok(new RegExp('^\\s*' + k + ': "', 'm').test(en), 'manca ' + k));
  assert.ok(/^\s*ui_send_question: "Send",/m.test(en), 'il bottone quadrato: «Send»');
  assert.ok(/^\s*lv_card_quiz: "Live active study",/m.test(en) && /^\s*cl_title: "/m.test(en), 'le chiavi del menu di MappAI Live e della lavagna non cambiano');
  // ogni data-i18n della sidebar ha la sua chiave in inglese
  const chiavi = [...aside.matchAll(/data-i18n="([a-z_]+)"/g)].map(m => m[1]);
  chiavi.forEach(k => assert.ok(new RegExp('^\\s*' + k + ': "', 'm').test(en), 'chiave senza inglese: ' + k));
});

test('0122: i marcatori di cache dei file toccati', () => {
  ['css/style.css', 'traduzioni/en_translations.js', 'js/mappai-studio-view.js', 'js/mappai-ai-tutor.js']
    .forEach(f => assert.ok(html.includes(f + '?v=0122-20261021-1'), f + ' col marcatore dello 0122'));
  // collab-teacher lo toccano anche il lotto 2 e il 4b1: il suo marcatore avanza (0122-20261021-2, 0122-20261022-4b1)
  assert.ok(/js\/mappai-collab-teacher\.js\?v=0122-202610\d\d-\w+/.test(html));
  // ui-modals tiene anche il segno dello 0113 (tests/figure-core.test.js lo pretende)
  assert.ok(html.includes('js/mappai-ui-modals.js?v=0113-0122-20261021-1'));
});
