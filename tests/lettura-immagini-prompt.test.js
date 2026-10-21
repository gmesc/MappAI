/* tests/lettura-immagini-prompt.test.js — il prompt «lettura delle immagini» nella console dei prompt (packet 0107, 16/10/2026)
 *
 * Tre varianti dello stesso prompt, nate dal banco del 16/10/2026 (`~/Claude/Coordinamento chat/banco-figure-esito.md`):
 * figura ritagliata, pagina intera col testo tipografico in {{testoTipografico}}, pagina scansionata senza testo tipografico.
 * Qui si fissa: che stanno in TUTTI E DUE i file dei prompt con lo stesso testo (il ripristino legge `public/prompts_default.json`,
 * l'app `prompts_config.json`); le due correzioni del banco (frecce solo se ci sono, niente crediti fotografici); il segnaposto;
 * la voce nella console (tab IMMAGINI, descrizioni, spiegazione) e le chiavi nei due dizionari; `fillPromptTemplate` che riempie
 * il testo tipografico e sceglie la lingua. Nessuna chiamata al modello. (Dallo 0113 la lettura delle figure in CREA usa questi prompt: `mappai-figure.js`, `testoConsole`.)
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const radice = path.join(__dirname, '..');
const leggi = f => fs.readFileSync(path.join(radice, f), 'utf8');
const SILENZIO = { log() { }, warn() { }, error() { }, info() { } };
const config = JSON.parse(leggi('prompts_config.json'));
const predefiniti = JSON.parse(leggi('public/prompts_default.json'));
const BASI = ['LETTURA_IMMAGINI_FIGURA', 'LETTURA_IMMAGINI_PAGINA', 'LETTURA_IMMAGINI_SCANSIONE'];
const CHIAVI = BASI.flatMap(b => [b + '_IT', b + '_EN']);
// packet 0113, lotto 6: FORMULE è un prompt in più (le regioni di formule, ADR 0024 §5.5), che il modulo legge dalla config
// (col ripiego FORMULE_PREDEFINITO). Dal packet 0114, lotto 4, sta anche nel tab IMMAGINI della console, come quarta voce;
// resta fuori da BASI perché le prove sulle frecce e sui crediti fotografici (sotto) non valgono per le formule.
const FORMULE = ['LETTURA_IMMAGINI_FORMULE_IT', 'LETTURA_IMMAGINI_FORMULE_EN'];
const VOCI_CONSOLE = BASI.concat(['LETTURA_IMMAGINI_FORMULE']);
// la coda «Trascrivi nella lingua in cui il testo è scritto nell'immagine; non tradurre» sostituisce «Rispondi in italiano» in FIGURA,
// FORMULE e SCANSIONE; la pagina intera non è nel lotto 6 e conserva la coda di prima
const CON_CODA_NON_TRADURRE = ['LETTURA_IMMAGINI_FIGURA', 'LETTURA_IMMAGINI_FORMULE', 'LETTURA_IMMAGINI_SCANSIONE'].flatMap(b => [b + '_IT', b + '_EN']);

function dizionario(nome) {
    const ctx = vm.createContext({ console: SILENZIO });
    vm.runInContext(leggi('public/traduzioni/' + nome) + ';globalThis.__d = ' + nome.replace('.js', '') + ';', ctx);
    return ctx.__d;
}

test('le otto chiavi (sei più FORMULE) stanno nei due file dei prompt, con lo stesso testo', () => {
    for (const k of CHIAVI.concat(FORMULE)) {
        assert.ok(typeof config[k] === 'string' && config[k].trim(), k + ' manca in prompts_config.json');
        assert.strictEqual(predefiniti[k], config[k], k + ' diverso fra prompts_config.json e public/prompts_default.json');
    }
    assert.deepStrictEqual(Object.keys(config).sort(), Object.keys(predefiniti).sort(), 'i due file dei prompt hanno chiavi diverse');
});

test('solo la pagina intera ha il segnaposto {{testoTipografico}}, dentro il blocco delimitato', () => {
    for (const lingua of ['_IT', '_EN']) {
        const pagina = config['LETTURA_IMMAGINI_PAGINA' + lingua];
        assert.ok(pagina.includes('{{testoTipografico}}'), 'pagina' + lingua + ' senza segnaposto');
        assert.ok(/---[^\n]*---\n\{\{testoTipografico\}\}\n---[^\n]*---$/.test(pagina), 'pagina' + lingua + ': il blocco del testo tipografico non è delimitato in coda');
        assert.ok(!config['LETTURA_IMMAGINI_FIGURA' + lingua].includes('{{'), 'figura' + lingua + ' con un segnaposto');
        assert.ok(!config['LETTURA_IMMAGINI_SCANSIONE' + lingua].includes('{{'), 'scansione' + lingua + ' con un segnaposto');
    }
});

test('le due correzioni del banco: frecce solo se ci sono, niente crediti fotografici; e le regole v2', () => {
    for (const k of CHIAVI) {
        const t = config[k], it = k.endsWith('_IT');
        assert.ok(it ? /Solo se nello schema ci sono frecce/.test(t) : /Only if the diagram has arrows/.test(t), k + ': le frecce non sono condizionate');
        assert.ok(/"A → B: (testo|text)"/.test(t), k + ': manca la forma della relazione');
        assert.ok(it ? /non inventarne/.test(t) : /invent none/.test(t), k + ': manca il divieto di inventare relazioni');
        assert.ok(it ? /Non riscrivere i crediti fotografici/.test(t) : /Do not copy photo credits/.test(t), k + ': mancano i crediti fotografici');
        assert.ok(it ? /blocchi di senso/.test(t) && /non per colonne/.test(t) : /blocks of meaning/.test(t) && /not by columns/.test(t), k + ': manca l\'ordine per blocchi di senso');
        assert.ok(it ? /Ripeti ogni etichetta tante volte quante compare/.test(t) : /Repeat every label as many times as it appears/.test(t), k + ': mancano le etichette ripetute');
        if (!CON_CODA_NON_TRADURRE.includes(k)) assert.ok(it ? /Rispondi in italiano, testo semplice/.test(t) : /Answer in English, plain text/.test(t), k + ': manca la lingua della risposta');
        assert.ok(!/Non ripetere il testo tipografico/.test(t), k + ': la frase v1 che faceva scartare le domande');
    }
    assert.ok(/serve solo a orientarti: nel dubbio trascrivi/.test(config.LETTURA_IMMAGINI_PAGINA_IT));
    assert.ok(/Non riscrivere l'intestazione del foglio/.test(config.LETTURA_IMMAGINI_PAGINA_IT));
    assert.ok(/\[TITOLO\], \[TESTO\], \[RIQUADRO\], \[DIDASCALIA\], \[LEGENDA\]/.test(config.LETTURA_IMMAGINI_SCANSIONE_IT));
    assert.ok(/Trascrivi TUTTO il testo della pagina/.test(config.LETTURA_IMMAGINI_SCANSIONE_IT));
    assert.ok(/Trascrivi SOLO ciò che sta/.test(config.LETTURA_IMMAGINI_FIGURA_IT) && /Trascrivi SOLO ciò che sta/.test(config.LETTURA_IMMAGINI_PAGINA_IT));
});

test('FORMULE: formula in una riga, frazioni (a)/(b), parentesi degli intervalli, soluzione dopo « → », solo ciò che si vede (ADR 0024 §5.5)', () => {
    const it = config.LETTURA_IMMAGINI_FORMULE_IT, en = config.LETTURA_IMMAGINI_FORMULE_EN;
    assert.ok(/in una riga sola/.test(it) && /one line|single line/.test(en), 'manca «una riga»');
    assert.ok(it.includes('(a)/(b)') && en.includes('(a)/(b)'), 'mancano le frazioni (a)/(b)');
    assert.ok(/parentesi giuste/.test(it) && /right brackets/.test(en), 'mancano le parentesi degli intervalli');
    assert.ok(it.includes('« → »') && en.includes('" → "'), 'manca la soluzione dopo la freccia');
    assert.ok(/Riscrivi solo le formule che vedi nell'immagine/.test(it) && /Rewrite only the formulas you see in the image/.test(en), 'manca «solo le formule che vedi»');
    for (const k of FORMULE) assert.ok(!config[k].includes('{{'), k + ' con un segnaposto: l\'àncora tipografica la accoda il core');
    // il ripiego del modulo e il testo dei file dicono la stessa cosa (stesse frasi chiave), così una console svuotata non cambia il contratto
    const modulo = leggi('public/js/mappai-figure.js').replace(/\\'/g, "'");
    for (const frase of ['(a)/(b)', 'parentesi giuste', 'Riscrivi solo le formule che vedi nell\'immagine']) assert.ok(modulo.includes(frase), 'FORMULE_PREDEFINITO senza «' + frase + '»');
});

test('la coda «non tradurre» sostituisce «Rispondi in italiano/inglese» in FIGURA, FORMULE e SCANSIONE; la pagina intera resta com\'era', () => {
    for (const k of CON_CODA_NON_TRADURRE) {
        const t = config[k], it = k.endsWith('_IT');
        assert.ok(it ? t.endsWith("Trascrivi nella lingua in cui il testo è scritto nell'immagine; non tradurre. Testo semplice, senza frasi di apertura o commenti.")
            : t.endsWith('Transcribe in the language the text is written in the image; do not translate. Plain text, with no opening sentence or comments.'), k + ': manca la coda «non tradurre» in fondo');
        assert.ok(!/Rispondi in italiano|Answer in English/.test(t), k + ': resta la coda che forza la lingua');
        assert.strictEqual(predefiniti[k], t, k + ' diverso fra i due file');
    }
    assert.ok(/Rispondi in italiano, testo semplice/.test(config.LETTURA_IMMAGINI_PAGINA_IT) && /Answer in English, plain text/.test(config.LETTURA_IMMAGINI_PAGINA_EN), 'la pagina intera non è nel lotto 6');
});

test('FORMULE passa dal motore dei prompt come le altre: fillPromptTemplate sceglie la lingua', () => {
    const w = consoleDeiPrompt('it');
    w.systemPromptsConfig = config;
    assert.strictEqual(w.fillPromptTemplate('LETTURA_IMMAGINI_FORMULE', {}), config.LETTURA_IMMAGINI_FORMULE_IT);
    const en = consoleDeiPrompt('en');
    en.systemPromptsConfig = config;
    assert.strictEqual(en.fillPromptTemplate('LETTURA_IMMAGINI_FORMULE', {}), config.LETTURA_IMMAGINI_FORMULE_EN);
});

function consoleDeiPrompt(lingua) {
    const window = { currentLanguage: lingua };
    const ctx = vm.createContext({ window, document: { readyState: 'complete', addEventListener() { } }, localStorage: { getItem: () => null }, console: SILENZIO });
    vm.runInContext(leggi('public/js/admin_prompts.js'), ctx);
    return window;
}

test('la console: tab IMMAGINI con le quattro voci (FORMULE compresa, 0114 lotto 4), descrizioni e spiegazione, e le chiavi nei due dizionari', () => {
    const w = consoleDeiPrompt('it');
    // ciò che esce dalla sandbox ha i prototipi dell'ALTRO realm: si confronta dopo un giro JSON
    assert.deepStrictEqual(JSON.parse(JSON.stringify(w.systemPromptsCategories.IMMAGINI)), VOCI_CONSOLE);
    assert.strictEqual(w.systemPromptsDescriptions.LETTURA_IMMAGINI_FORMULE, 'admin_prompt_desc_immagini_formule');
    assert.strictEqual(w.systemTabExplanations.IMMAGINI, 'admin_explanation_immagini');
    const it = dizionario('it_translations.js'), en = dizionario('en_translations.js');
    for (const b of VOCI_CONSOLE) {
        const d = w.systemPromptsDescriptions[b];
        assert.ok(d && d.startsWith('admin_prompt_desc_immagini_'), b + ' senza descrizione');
        assert.ok(it[d] && en[d], d + ' manca in un dizionario');
        assert.ok(/Lettura delle immagini/.test(it[d]), d + ': la descrizione italiana non dice «Lettura delle immagini»');
    }
    for (const k of ['admin_tab_immagini', 'admin_explanation_immagini']) assert.ok(it[k] && en[k], k + ' manca in un dizionario');
    assert.strictEqual(it.admin_tab_immagini, 'Immagini');
    // 0114 lotto 4 (Giacomo, 21/10): dallo 0113 la lettura delle figure usa questi prompt; la spiegazione non dice più il contrario
    assert.strictEqual(/ancora collegati/.test(it.admin_explanation_immagini) || /Not yet wired/.test(en.admin_explanation_immagini), false, 'la spiegazione del tab dice ancora «non collegati»');
    assert.strictEqual(/lettura delle figure dei PDF in CREA/.test(it.admin_explanation_immagini), true);
    const html = leggi('public/index.html');
    assert.ok(/data-tab="IMMAGINI"/.test(html), 'index.html senza il bottone del tab IMMAGINI');
    assert.ok(/switchAdminTab\('IMMAGINI'\)/.test(html));
    // nessuna delle tre basi contiene «_IT», «_EN», «_STUDENT», «_INFOMANIAK»: la console le spezza lì per trovare la base
    for (const k of CHIAVI.concat(FORMULE)) assert.strictEqual(k.split('_IT')[0].split('_EN')[0].split('_INFOMANIAK')[0].split('_STUDENT')[0], k.replace(/_(IT|EN)$/, ''));
});

test('fillPromptTemplate: riempie {{testoTipografico}} e sceglie la variante della lingua', () => {
    const w = consoleDeiPrompt('it');
    w.systemPromptsConfig = config;
    const testo = 'Riga uno\n$$x^2$$ e $& non si corrompono';
    const it = w.fillPromptTemplate('LETTURA_IMMAGINI_PAGINA', { testoTipografico: testo });
    assert.ok(it.includes('--- Testo tipografico della pagina ---\n' + testo + '\n--- fine del testo tipografico ---'));
    assert.ok(!it.includes('{{'), 'segnaposto rimasto');
    assert.strictEqual(w.fillPromptTemplate('LETTURA_IMMAGINI_FIGURA', {}), config.LETTURA_IMMAGINI_FIGURA_IT);
    assert.strictEqual(w.fillPromptTemplate('LETTURA_IMMAGINI_SCANSIONE', {}), config.LETTURA_IMMAGINI_SCANSIONE_IT);
    const en = consoleDeiPrompt('en');
    en.systemPromptsConfig = config;
    assert.strictEqual(en.fillPromptTemplate('LETTURA_IMMAGINI_FIGURA', {}), config.LETTURA_IMMAGINI_FIGURA_EN);
});
