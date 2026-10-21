'use strict';
/*
 * Packet 0112 — il quiz a scelta multipla ha UN aspetto solo: quello del quiz LIVE.
 *
 * Prima la domanda a 24 px con l'altoparlante, le opzioni a 20 px ciascuna col suo
 * altoparlante e il verdetto stavano scritti dentro `public/live/student.html`;
 * la view «a scelta» (che il reader usa sull'iPad) aveva una copia più piccola e
 * muta. Ora li disegna `public/js/mappai-quiz-mc-view.js` e le due pagine lo
 * chiamano (invariante 6).
 *
 * Qui si prova, senza browser: (1) le misure del modulo, (2) la struttura che
 * produce, uguale a quella della pagina LIVE di prima, (3) che nessuno ne tenga
 * una seconda copia, (4) che il server LAN lo serva. Il confronto prima/dopo
 * dei pixel veri sta nelle misure del browser (nello scratchpad, gate (a)).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');

const ROOT = path.join(__dirname, '..');
const leggi = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const MOD = 'public/js/mappai-quiz-mc-view.js';
const esiste = () => fs.existsSync(path.join(ROOT, MOD));
const carica = () => require(path.join(ROOT, MOD));

test('il modulo comune esiste e dice che cosa offre', () => {
    assert.equal(esiste(), true, MOD + ' non esiste');
    const V = carica();
    for (const f of ['domanda', 'opzioni', 'verdetto', 'segna', 'parla', 'htmlDomanda', 'htmlOpzione', 'htmlVerdetto']) {
        assert.equal(typeof V[f], 'function', 'manca ' + f);
    }
    assert.equal(typeof V.CSS, 'string');
});

test('le misure sono quelle della pagina LIVE di prima, non "migliorate"', () => {
    const css = carica().CSS.replace(/\s+/g, ' ');
    const regola = (sel) => {
        // la regola che COMINCIA con questo selettore (non una lista che lo contiene)
        const m = css.match(new RegExp('(?:^|\\} )' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' ?\\{([^}]*)\\}'));
        return m ? m[1] : '';
    };
    assert.match(regola('.qmc .q-testo'), /font-size: ?24px/, 'domanda a 24 px');
    assert.match(regola('.qmc .q-testo'), /font-weight: ?700/);
    assert.match(regola('.qmc .q-testo'), /line-height: ?1\.45/);
    assert.match(regola('.qmc .tts'), /width: ?56px/, 'bersaglio dell\'altoparlante 56 px');
    assert.match(regola('.qmc .tts'), /min-height: ?56px/);
    assert.match(regola('.qmc .opt'), /font-size: ?20px/, 'opzione a 20 px');
    assert.match(regola('.qmc .opt'), /padding: ?18px 18px/);
    assert.match(regola('.qmc .verd'), /font-size: ?16px/, 'verdetto a 16 px');
    // coricato
    const coricato = css.match(/@media \(orientation: landscape\) and \(max-height: 560px\) \{(.*)\}\s*$/);
    assert.ok(coricato, 'manca la variante col telefono coricato');
    assert.match(coricato[1], /\.qmc \.q-testo ?\{[^}]*font-size: ?21px/);
    assert.match(coricato[1], /\.qmc \.opt ?\{[^}]*font-size: ?18px/);
    // il carattere dei bottoni è quello della pagina
    assert.match(css, /\.qmc \.opt, \.qmc \.tts \{ font-family: inherit; \}/);
    // ogni regola sta sotto `.qmc`: nell'app del docente `.tts` e `.opt` esistono già
    const nude = css.split('}').map((r) => r.split('{')[0].trim()).filter((s) => s && !s.startsWith('@') && !/\.qmc/.test(s));
    assert.deepEqual(nude, [], 'regole senza .qmc: ' + nude.join(' | '));
});

test('la testata: la domanda e UN altoparlante accanto', () => {
    const $ = cheerio.load(carica().htmlDomanda('Chi vinse a <b>Waterloo</b>?'));
    assert.equal($('.q-head').length, 1);
    assert.equal($('.q-head .q-testo').length, 1);
    assert.equal($('.q-head button.tts').length, 1);
    // il testo della domanda è testo, mai HTML
    assert.equal($('.q-testo b').length, 0);
    assert.equal($('.q-testo').text(), 'Chi vinse a <b>Waterloo</b>?');
    assert.equal(!!$('button.tts').attr('aria-label'), true);
});

test('ogni opzione è una riga: il bottone-testo e il SUO altoparlante', () => {
    const V = carica();
    const html = ['Wellington', 'Napoleone', '<i>Nessuno</i>'].map((t, i) => V.htmlOpzione(t, i, { scelta: 1 })).join('');
    const $ = cheerio.load('<div class="qmc">' + html + '</div>');
    assert.equal($('.opt-row').length, 3);
    assert.equal($('.opt-row > button.opt').length, 3);
    assert.equal($('.opt-row > button.tts').length, 3, 'un altoparlante per ogni opzione');
    assert.equal($('.opt.sel').length, 1);
    assert.equal($('.opt.sel').text(), 'Napoleone');
    assert.equal($('.opt i').length, 0, 'testo, non HTML');
    // senza `radio` la riga è quella di prima: nessun ruolo aggiunto
    assert.equal($('.opt[role]').length, 0);
    const $r = cheerio.load(V.htmlOpzione('A', 0, { scelta: 0, radio: true }));
    assert.equal($r('.opt').attr('role'), 'radio');
    assert.equal($r('.opt').attr('aria-checked'), 'true');
});

test('il verdetto: stesse parole e stesse classi della pagina LIVE', () => {
    const V = carica();
    const ok = cheerio.load(V.htmlVerdetto({ esito: 'right', giusta: 'Sarajevo', spiegazione: 'Il 28 giugno.' }));
    assert.equal(ok('.verd.verd-ok').length, 1);
    assert.equal(ok('.verd').attr('role'), 'status');
    assert.equal(ok('.verd > b').first().text(), 'Giusto');
    assert.match(ok('.verd').text(), /— corretta: Sarajevo/);
    assert.equal(ok('.verd .sp').text(), 'Il 28 giugno.');
    const ko = cheerio.load(V.htmlVerdetto({ esito: 'wrong', giusta: '<x>' }));
    assert.equal(ko('.verd.verd-ko').length, 1);
    assert.equal(ko('.verd > b').first().text(), 'Sbagliato');
    assert.equal(ko('.verd x').length, 0, 'la risposta giusta è testo');
    // le parole si possono dare da fuori (la view «a scelta» le traduce)
    const en = cheerio.load(V.htmlVerdetto({ esito: 'right', giusta: 'A' }, { giusto: 'Right', corretta: 'correct' }));
    assert.equal(en('.verd > b').first().text(), 'Right');
    assert.match(en('.verd').text(), /— correct: A/);
});

test('la pagina LIVE usa il modulo e non tiene più il disegno per conto suo', () => {
    const h = leggi('public/live/student.html');
    assert.match(h, /<script src="\/public\/js\/mappai-quiz-mc-view\.js\?v=[^"]+"><\/script>/, 'manca il tag del modulo');
    assert.ok(h.indexOf('mappai-quiz-mc-view.js') < h.indexOf('mappai-live-core.js'), 'il modulo va prima dello script inline');
    for (const resto of [/\.opt-row *\{/, /\.opt *\{/, /\.tts *\{/, /#qtext *\{/, /\.verd *\{/, /function optionRow/, /function ttsBtn/, /function speak/]) {
        assert.equal(resto.test(h), false, 'student.html ha ancora ' + resto);
    }
    assert.match(h, /var QMC = window\.MappAIQuizMcView/);
    assert.match(h, /QMC\.opzioni\(/);
    assert.match(h, /QMC\.verdetto\(/);
    assert.match(h, /QMC\.domanda\(/);
    // vero/falso e risposta aperta restano com'erano
    assert.match(h, /\.tf-btn *\{/);
    assert.match(h, /#qopen *\{/);
});

test('la view «a scelta» usa il modulo per la scelta multipla, le aperte non cambiano', () => {
    const v = leggi('public/js/mappai-scelta-view.js');
    assert.match(v, /MappAIQuizMcView/);
    assert.match(v, /\.opzioni\(/);
    assert.match(v, /\.verdetto\(/);
    // le domande aperte (e le spunte dei criteri) hanno ancora la loro veste
    assert.match(v, /'\.sc-dom\{/);
    assert.match(v, /'\.sc-ta\{/);
    assert.match(v, /role', 'checkbox'/);
});

test('le pagine che caricano la view «a scelta» caricano prima il modulo', () => {
    for (const [p, v] of [['public/live/scelta.html', 'mappai-scelta-view.js'], ['public/index.html', 'mappai-scelta-view.js']]) {
        const h = leggi(p);
        const a = h.indexOf('mappai-quiz-mc-view.js'), b = h.indexOf(v);
        assert.ok(a > 0, p + ': manca il modulo');
        assert.ok(a < b, p + ': il modulo deve stare PRIMA di ' + v);
    }
});

test('il server LAN serve il modulo con confronto esatto', () => {
    const s = leggi('live-server.js');
    assert.match(s, /'\/public\/js\/mappai-quiz-mc-view\.js'/);
});
