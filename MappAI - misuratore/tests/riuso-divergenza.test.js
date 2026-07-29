/**
 * Guardia contro la divergenza silenziosa delle copie da MappAI (research.md R6).
 *
 * La regola 12 di MappAI dice che un verbo di relazione nuovo si aggiunge UNA
 * volta sola in mappai-relations.js e si propaga ovunque. Qui NON si propaga:
 * `public/js/riuso/edge-families.js` è una copia. Se qualcuno aggiunge
 * «ostacola» alla famiglia opposizione in MappAI, il componente 8 dell'indice
 * continuerebbe a ignorarlo, in silenzio, per sempre.
 *
 * Se MappAI non è raggiungibile — misuratore distribuito da solo — il test si
 * SALTA invece di fallire: un rosso per un file assente addestrerebbe a
 * ignorare i rossi.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const EF = require('../public/js/riuso/edge-families.js');

// Il misuratore vive in <repo>/MappAI - misuratore/, MappAI in <repo>/public/.
const ORIGINALE = path.resolve(__dirname, '..', '..', 'public', 'js', 'mappai-relations.js');
const raggiungibile = fs.existsSync(ORIGINALE);

function verbiDaOriginale() {
    const src = fs.readFileSync(ORIGINALE, 'utf8');
    const i = src.indexOf('EDGE_FAMILIES = {');
    assert.ok(i >= 0, 'EDGE_FAMILIES non trovata in mappai-relations.js: la copia va rifatta a mano');
    // Estrae i soli array keywords/keywordsEn dal blocco, senza valutare codice.
    const blocco = src.slice(i, src.indexOf('REL_FAMILY_MAP', i));
    const verbi = [];
    const re = /keywords(?:En)?:\s*\[([^\]]*)\]/g;
    let m;
    while ((m = re.exec(blocco)) !== null) {
        m[1].split(',').forEach((v) => {
            const s = v.trim().replace(/^['"]|['"]$/g, '').trim();
            if (s) verbi.push(s);
        });
    }
    return verbi;
}

test('la copia di EDGE_FAMILIES è allineata all’originale di MappAI',
    { skip: raggiungibile ? false : 'MappAI non raggiungibile da qui: copia non verificabile' },
    () => {
        const originali = new Set(verbiDaOriginale());
        const copiati = new Set(EF.tuttiIVerbi());

        const mancanti = [...originali].filter(v => !copiati.has(v)).sort();
        const inPiu = [...copiati].filter(v => !originali.has(v)).sort();

        const istruzione = '\n\n→ Riapri public/js/mappai-relations.js in MappAI, riporta le modifiche '
            + 'in MappAI - misuratore/public/js/riuso/edge-families.js, e aggiorna commit e data '
            + 'nell’intestazione e in RIUSO.md. Mai il contrario.';

        assert.deepStrictEqual(mancanti, [],
            'Verbi presenti in MappAI e ASSENTI nella copia: ' + mancanti.join(', ') + istruzione);
        assert.deepStrictEqual(inPiu, [],
            'Verbi presenti nella copia e ASSENTI in MappAI: ' + inPiu.join(', ') + istruzione);
    });

test('la copia espone le famiglie che il componente 8 considera nessi logici', () => {
    // Indipendente dall'originale: verifica il contratto interno di cui il
    // componente 8 ha bisogno.
    assert.ok(EF.FAMIGLIE_LOGICHE.has('trasformazione'));
    assert.ok(EF.FAMIGLIE_LOGICHE.has('dipendenza'));
    assert.ok(EF.FAMIGLIE_LOGICHE.has('opposizione'));
    assert.ok(!EF.FAMIGLIE_LOGICHE.has('appartenenza'), 'la gerarchia non è un nesso logico');
});

test('i verbi rappresentativi finiscono nella famiglia giusta', () => {
    assert.strictEqual(EF.famigliaDi('causa'), 'trasformazione');
    assert.strictEqual(EF.famigliaDi('richiede'), 'dipendenza');
    assert.strictEqual(EF.famigliaDi('si oppone a'), 'opposizione');
    assert.strictEqual(EF.famigliaDi('comprende'), 'appartenenza');
    assert.strictEqual(EF.famigliaDi('verbo inventato'), 'altro');
    assert.strictEqual(EF.famigliaDi(''), 'altro');
});

test('«include» resta fuori dalla mappa delle famiglie, come nell’originale', () => {
    // Mapparla ad appartenenza classificherebbe come ricco l'intero albero
    // di ogni mappa mentale.
    assert.strictEqual(EF.REL_FAMILY_MAP['include'], undefined);
    assert.strictEqual(EF.REL_FAMILY_MAP['includes'], undefined);
});
