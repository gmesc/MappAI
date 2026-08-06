/* Le regole PURE del bento delle console (5/8/26).
   Provano quello che l'officina mostra: come i moduli si impacchettano in righe
   da quattro colonne, e che cosa il validatore contesta a una composizione. */
const test = require('node:test');
const assert = require('node:assert');
const CB = require('../public/js/mappai-console-bento.js');

function areaFinta(moduli, extra) {
    return Object.assign({
        id: 'prova', console: 'Prova', vista: 'Prova',
        briciole: [{ id: 'a', et: 'Crea' }],
        colonna: [], comandi: [], moduli: moduli
    }, extra || {});
}
const vocePiena = (forma) => ({ id: 'v', et: 'Voce', forma: forma || 'azione', aiuto: 'che cos\'è' });

test('le aree del file passano il validatore: si possono montare', () => {
    CB.AREE.forEach(a => {
        const v = CB.valida(a);
        assert.deepStrictEqual(v.errori, [], a.id + ': ' + v.errori.join(' · '));
    });
});

test('i moduli si impacchettano in righe da quattro colonne', () => {
    const a = areaFinta([
        { id: 'm1', span: 2, voci: [vocePiena()] },
        { id: 'm2', span: 1, voci: [vocePiena()] },
        { id: 'm3', span: 1, voci: [vocePiena()] },
        { id: 'm4', span: 4, voci: [vocePiena()] }
    ]);
    const r = CB.righe(a);
    assert.strictEqual(r.length, 2);
    assert.deepStrictEqual(r[0].map(m => m.id), ['m1', 'm2', 'm3']);
    assert.deepStrictEqual(r[1].map(m => m.id), ['m4']);
});

test('un modulo che sfonda le colonne va a capo, non deborda', () => {
    const a = areaFinta([
        { id: 'm1', span: 3, voci: [vocePiena()] },
        { id: 'm2', span: 3, voci: [vocePiena()] }
    ]);
    assert.strictEqual(CB.righe(a).length, 2);
});

test('una riga che non chiude le quattro colonne è un AVVISO, non un errore', () => {
    const a = areaFinta([{ id: 'm1', span: 2, voci: [vocePiena()] }]);
    const v = CB.valida(a);
    assert.deepStrictEqual(v.errori, []);
    assert.ok(v.avvisi.some(x => /buco a destra/.test(x)));
});

test('senza percorso nella barra la console non si monta', () => {
    const a = areaFinta([{ id: 'm1', span: 4, voci: [vocePiena()] }], { briciole: [] });
    assert.ok(CB.valida(a).errori.some(x => /percorso/.test(x)));
});

test('una forma che il renderer non sa disegnare è un errore', () => {
    const a = areaFinta([{ id: 'm1', span: 4, voci: [{ id: 'v', et: 'x', forma: 'astronave', aiuto: 'x' }] }]);
    assert.ok(CB.valida(a).errori.some(x => /astronave/.test(x)));
});

test('la tela vuole la riga intera, e una sola per area', () => {
    const stretta = areaFinta([{ id: 'm1', span: 2, voci: [vocePiena('tela')] }], {
        comandi: [{ id: 'c', et: 'Salva' }]
    });
    assert.ok(CB.valida(stretta).errori.some(x => /un quarto di riga/.test(x)));

    const due = areaFinta([
        { id: 'm1', span: 4, voci: [vocePiena('tela')] },
        { id: 'm2', span: 4, voci: [vocePiena('tela')] }
    ], { comandi: [{ id: 'c', et: 'Salva' }] });
    assert.ok(CB.valida(due).errori.some(x => /due tele/.test(x)));
});

test('una tela senza comandi nella colonna è un errore: il documento non si salverebbe', () => {
    /* è la regola del 5/8: tolta la sotto-barra, i comandi vivono nella colonna —
       se non ci sono, non sono stati spostati, sono spariti */
    const a = areaFinta([{ id: 'm1', span: 4, voci: [vocePiena('tela')] }]);
    assert.ok(CB.valida(a).errori.some(x => /nessun comando nella colonna/.test(x)));
});

test('una voce senza pop-up è un avviso', () => {
    const a = areaFinta([{ id: 'm1', span: 4, voci: [{ id: 'v', et: 'Muta', forma: 'azione' }] }]);
    assert.ok(CB.valida(a).avvisi.some(x => /pop-up/.test(x)));
});

test('un modulo nudo con un titolo lo dichiara: quel titolo non si vedrebbe', () => {
    const a = areaFinta([{ id: 'm1', span: 4, nuda: true, titolo: 'Invisibile', voci: [vocePiena()] }]);
    assert.ok(CB.valida(a).avvisi.some(x => /nudo/.test(x)));
});

test('la larghezza di un modulo segue le colonne che occupa', () => {
    /* 1240px d'area, passo 14: le tre fughe valgono 42, quindi una colonna sta a
       299,5 → un modulo da 2 ne vale due più il passo che le separa */
    assert.strictEqual(CB.larghezza({ span: 1 }, 1240, 14), 300);
    assert.strictEqual(CB.larghezza({ span: 2 }, 1240, 14), 613);
    assert.strictEqual(CB.larghezza({ span: 4 }, 1240, 14), 1240);
});

test('la firma cambia con la STRUTTURA, non con le tinte', () => {
    const a = areaFinta([{ id: 'm1', span: 2, voci: [vocePiena()] }]);
    const uguale = areaFinta([{ id: 'm1', span: 2, stile: { bg: '#fff' }, voci: [vocePiena()] }]);
    const diversa = areaFinta([{ id: 'm1', span: 3, voci: [vocePiena()] }]);
    assert.strictEqual(CB.firma(a), CB.firma(uguale));
    assert.notStrictEqual(CB.firma(a), CB.firma(diversa));
});

test('l\'aspetto ha un ripiego uguale a com\'è oggi: un\'area che non dichiara niente non cambia', () => {
    const a = areaFinta([{ id: 'm', span: 4, voci: [vocePiena()] }]);
    const s = CB.aspettoDi(a);
    assert.strictEqual(s.colonna.larghezza, CB.ASPETTO_BASE.colonna.larghezza);
    assert.strictEqual(s.area.passo, CB.ASPETTO_BASE.area.passo);
    const v = CB.variabili(a);
    assert.strictEqual(v['--mm-console-side'], '272px');
    assert.strictEqual(v['--mnc-gap'], '14px');
    assert.strictEqual(v['--mnc-col-n'], '4');
});

test('quello che si dichiara vince, e finisce nelle variabili', () => {
    const a = areaFinta([{ id: 'm', span: 4, voci: [vocePiena()] }], {
        aspetto: { colonna: { larghezza: 220 }, area: { passo: 24, colonne: 3 }, barra: { corpo: 26 } }
    });
    const v = CB.variabili(a);
    assert.strictEqual(v['--mm-console-side'], '220px');
    assert.strictEqual(v['--mnc-gap'], '24px');
    assert.strictEqual(v['--mnc-col-n'], '3');
    assert.strictEqual(v['--mn-tit-fs'], '26px');
    /* le chiavi non toccate restano quelle di partenza */
    assert.strictEqual(v['--mnc-voce-h'], '44px');
});

test('un percorso che non si legge sulla barra bianca è un errore', () => {
    const a = areaFinta([{ id: 'm', span: 4, voci: [vocePiena()] }], { aspetto: { barra: { colore: '#e5e5e5' } } });
    assert.ok(CB.valida(a).errori.some(x => /non si legge/.test(x)));
});

test('una colonna troppo stretta e voci troppo basse sono avvisi, non errori', () => {
    const a = areaFinta([{ id: 'm', span: 4, voci: [vocePiena()] }], {
        aspetto: { colonna: { larghezza: 190, imballaggio: 30, altezzaVoce: 30 } }
    });
    const v = CB.valida(a);
    assert.deepStrictEqual(v.errori, []);
    assert.ok(v.avvisi.some(x => /si troncano/.test(x)));
    assert.ok(v.avvisi.some(x => /bersaglio/.test(x)));
});
