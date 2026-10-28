'use strict';
/*
 * foglio-nodi-0122.test.js — il lotto 3 del packet 0122: il Foglio dei nodi con il passo di riga
 * fisso (24 px = 6,35 mm) e la descrizione a bandiera, a schermo e nel PDF (Giacomo, 22/10, sul
 * banco `banco-foglio.html`: «Scelgo la E: interlinea 24 px fissa, a sinistra»); e la variabile
 * `--pdf-line-height` del dossier, usata tre volte e mai definita.
 * 0128, allargamento 1 (Giacomo, 27/10, sul mockup: «C»): il passo non è più fisso per tutti i corpi ma il
 * più largo fra quei 6,35 mm e il corpo × 1,6 (`descPasso`), con +0,25 em fra le parole; lo leggono il
 * core, l'editor e il PDF, come prima la costante. La bandiera (niente giustificazione) resta.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const leggi = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('core: il passo della descrizione viene da descPasso (il fisso di 6,35 mm o corpo × 1,6), al posto di LINE.desc', () => {
    const s = leggi('public/js/mappai-nodesheet-core.js');
    assert.ok(s.includes('var DESC_LINE_MM = 6.35;'), 'il fisso dello 0122 resta il minimo');
    assert.ok(s.includes('var DESC_LINE_K = 1.6;') && s.includes('var DESC_WORD_EM = 0.25;'), 'interlinea e spazio della variante C');
    /* 0128, allargamento 5: l'interlinea scelta dal docente vale corpo × interlinea; di serie il passo di prima */
    assert.ok(s.includes('return k ? k * (pt || 0) * PT2MM : Math.max(DESC_LINE_MM, DESC_LINE_K * (pt || 0) * PT2MM);'));
    assert.ok(s.includes('descPasso: descPasso,') && s.includes('DESC_LINE_MM: DESC_LINE_MM,'), 'esportati');
    assert.ok(s.includes('var dStep = descPasso(g.descPt);'), 'il passo della descrizione');
    assert.ok(!s.includes('g.descPt * PT2MM * LINE.desc'), 'il multiplo del corpo non si usa più per la descrizione');
});

test('editor: la descrizione ha il passo del core in cqw accanto al corpo e lo spazio fra le parole, ed è a sinistra', () => {
    const s = leggi('public/js/mappai-doc-editor.js');
    assert.ok(s.includes('descLh: cq(NS().descPasso(g.descPt)),'), '_nsPx converte il passo del corpo in frazione di card');
    assert.ok(s.includes('descWs: NS().DESC_WORD_EM || 0,'), 'lo spazio in più, in em del corpo');
    assert.ok(s.includes("' style=\"font-size:' + P.desc.toFixed(2) + 'cqw;line-height:' + P.descLh.toFixed(2) + 'cqw;word-spacing:' + P.descWs + 'em\">' + esc(c.desc) + '</div>'"), 'la riga della descrizione');
    const regola = s.slice(s.indexOf('.de-ns-desc {'), s.indexOf('}', s.indexOf('.de-ns-desc {')));
    assert.ok(regola.includes('text-align:left'), 'a bandiera');
    assert.ok(!regola.includes('line-height') && !regola.includes('justify'), 'niente interlinea in rapporto né giustificazione nella regola');
});

test('PDF: il passo di riga è quello del core (ripiego 6,35), lo spazio fra le parole ha il di più del core, e le righe non si giustificano più', () => {
    const s = leggi('public/js/mappai-print-dossier.js');
    const i = s.indexOf('function _drawJustifiedDesc(');
    const fn = s.slice(i, s.indexOf('\nfunction ', i + 10));
    assert.ok(fn.includes("var lineH = (NSC && typeof NSC.descPasso === 'function') ? NSC.descPasso(sizePt) : ((NSC && NSC.DESC_LINE_MM) || 6.35);") && fn.includes('window.MappAINodeSheet) || null'), 'il passo dal core (il globale vero del core è MappAINodeSheet), col ripiego di prima');
    assert.ok(fn.includes("var spaceW = wWidth(' ', false) + ((NSC && NSC.DESC_WORD_EM > 0) ? NSC.DESC_WORD_EM * sizePt * PT2MM : 0);"), 'lo spazio in più vale per l\'a-capo e per il disegno');
    assert.ok(!fn.includes('sizePt * PT2MM * 1.4'), 'il 1.4 scritto a mano non c\'è più');
    assert.ok(fn.includes('var gap = spaceW;'), 'lo spazio fra le parole è sempre quello naturale');
    assert.ok(!fn.includes('(boxW - sum) / gaps'), 'nessuna distribuzione del residuo');
    assert.ok(fn.includes('function tryHyphen('), 'l\'a-capo con il trattino resta');
});

test('dossier HTML: --pdf-line-height è definita dove nascono le altre --pdf-*', () => {
    const s = leggi('public/js/mappai-print-dossier.js');
    const usi = (s.match(/var\(--pdf-line-height\)/g) || []).length;
    assert.ok(usi >= 3, 'è usata almeno tre volte: ' + usi);
    assert.ok(s.includes('--pdf-line-height: 1.6;'), 'definita a 1,6');
    assert.ok(s.indexOf('--pdf-line-height: 1.6;') < s.indexOf('var(--pdf-line-height)'), 'definita prima di essere usata');
});

test('0122 lotto 3: i marcatori di cache', () => {
    const html = leggi('public/index.html');
    ['js/mappai-nodesheet-core.js?v=0122-20261022-3', 'js/mappai-doc-editor.js?v=0102-0122-20261022-3', 'js/mappai-print-dossier.js?v=0042-0122-20261022-3']
        .forEach(f => assert.ok(html.includes(f), f));
});
