/* tests/doc-head.test.js — la cornice condivisa dei documenti (testata + piè).
 *
 * Che cosa fissano questi test, e perché: la testata di NOVE documenti è stata
 * unificata qui. Le regressioni che costerebbero care non sono estetiche, sono
 * due: una content string di @page scritta male fa sparire il piè SENZA errori
 * (CSS invalido = dichiarazione ignorata), e un logo passato grande sfonda la
 * pagina. Entrambe sono coperte qui sotto.
 */
const test = require('node:test');
const assert = require('node:assert');

const H = require('../public/js/mappai-doc-head.js');

// ── TESTATA ──────────────────────────────────────────────────────────────────

test('testata: col solo titolo resta il titolo e la data di oggi', () => {
    const h = H.testata({ titolo: 'Nodo: Il Clima' });
    assert.ok(/class="mm-dh"/.test(h));
    assert.ok(/class="mm-dh__t">Nodo: Il Clima</.test(h));
    // la data non passata vale OGGI: tutti e nove i fogli storici una data la
    // mostrano, e un foglio senza data non si ritrova in una pila
    assert.ok(/class="mm-dh__s">\d{2}\/\d{2}\/\d{4}</.test(h), 'data di oggi nel sottotitolo');
    assert.ok(!/mm-dh__r/.test(h), 'nessuna riga di chip vuota');
});

test('testata: data:false la toglie (l\'assenza vale «oggi», serve un modo per dire «nessuna»)', () => {
    const h = H.testata({ titolo: 'X', data: false });
    assert.ok(!/mm-dh__s/.test(h), 'senza altro nel sottotitolo, la riga sparisce del tutto');
    assert.ok(/Sistema Terra<\/div>/.test(H.testata({ titolo: 'X', mappa: 'Sistema Terra', data: false })),
        'ma il resto del sottotitolo resta');
});

test('testata: CLASSE e MATERIA sono i due chip chiesti da Giacomo', () => {
    const h = H.testata({
        titolo: 'Nodo: Il Clima', tipo: 'Quiz', mappa: 'Sistema Terra',
        classe: '2A', materia: 'Geografia', data: '05/08/2026', badge: '12 domande'
    });
    assert.ok(/mm-dh__c--cls">2A</.test(h), 'chip classe');
    assert.ok(/mm-dh__c--mat">Geografia</.test(h), 'chip materia');
    assert.ok(/mm-dh__b">12 domande</.test(h), 'badge del conteggio');
    assert.ok(/Sistema Terra · Quiz · 05\/08\/2026/.test(h), 'sottotitolo: mappa · tipo · data');
    // l'ordine conta: prima la classe, poi la materia — è l'ordine delle
    // colonne nelle tabelle di INSEGNA e dei livelli di cartella su disco
    assert.ok(h.indexOf('mm-dh__c--cls') < h.indexOf('mm-dh__c--mat'), 'classe prima di materia');
});

test('testata: senza classe o materia i chip semplicemente non ci sono', () => {
    const h = H.testata({ titolo: 'X', badge: '3 carte' });
    assert.ok(!/mm-dh__c--cls|mm-dh__c--mat/.test(h));
    assert.ok(/mm-dh__b">3 carte</.test(h), 'il badge resta');
});

test('testata: il contenuto è sempre sfuggito (un titolo può contenere < e ")', () => {
    const h = H.testata({ titolo: '<script>x</script>', classe: 'A "B"' });
    assert.ok(!/<script>/.test(h), 'nessun tag iniettabile');
    assert.ok(/&lt;script&gt;/.test(h));
    assert.ok(/A &quot;B&quot;/.test(h));
});

test('testata: soloSchermo la avvolge in no-print (fogli il cui stampato è solo il corpo)', () => {
    const h = H.testata({ titolo: 'Dossier', soloSchermo: true });
    assert.ok(/^<div class="no-print"><div class="mm-dh">/.test(h));
    assert.ok(!/no-print/.test(H.testata({ titolo: 'Dossier' })), 'di default stampa');
});

// ── DATA ─────────────────────────────────────────────────────────────────────

test('data: GG/MM/AAAA — un formato solo, e SENZA ora', () => {
    assert.strictEqual(H.data(new Date(2026, 7, 5, 9, 4)), '05/08/2026');
    /* L'ora non è un'opzione spenta: non si scrive (decisione di Giacomo).
       Il secondo argomento non esiste più — se qualcuno lo rimettesse, questo
       test cadrebbe. Su un foglio di studio il minuto non dice niente, e fa
       sembrare diverse due copie identiche della stessa scheda. */
    assert.strictEqual(H.data(new Date(2026, 7, 5, 9, 4), true), '05/08/2026', 'nessun secondo argomento');
    assert.ok(!/\d{2}:\d{2}/.test(H.testata({ titolo: 'X' })), 'nessuna ora nella testata');
    assert.ok(!/\d{2}:\d{2}/.test(H.pieSchermo({})), 'nessuna ora nel piè');
    assert.strictEqual(H.data('non-una-data'), '', 'una data illeggibile non stampa NaN');
});

test('privacy: col contesto su un ALLIEVO la testata resta MUTA', () => {
    /* Decisione di Giacomo (11/8/26). Un foglio stampato gira — banco,
       fotocopiatrice, pila sulla cattedra — e il nome di una persona con misure
       compensative non deve viaggiare su carta. La regola è QUI e non dedotta
       dall'esclusione classe/allievo che vive in un altro file. */
    const salva = global.window;
    try {
        global.window = {
            MappAIClasses: {
                activeStudentName: () => 'Anna Rossi',
                // anche se una classe risultasse attiva (l'esclusione potrebbe
                // cambiare altrove), la guardia esce PRIMA
                getActive: () => ({ id: 'c1', name: '2A' }),
                effectiveDiscipline: () => 'Geografia'
            }
        };
        assert.deepStrictEqual(H.contestoAttivo(), { classe: '', materia: '' });
        const h = H.testata(H.conContesto({ titolo: 'Nodo: Il Clima' }));
        assert.ok(!/Anna Rossi/.test(h), 'mai il nome dell\'allievo');
        assert.ok(!/mm-dh__c/.test(h), 'nessun chip: nemmeno la materia da sola');

        // …e con una CLASSE attiva i chip ci sono, come deve essere
        global.window.MappAIClasses.activeStudentName = () => '';
        assert.deepStrictEqual(H.contestoAttivo(), { classe: '2A', materia: 'Geografia' });

        // se leggere il contesto lancia, nel dubbio non si scrive
        global.window.MappAIClasses.activeStudentName = () => { throw new Error('boom'); };
        assert.deepStrictEqual(H.contestoAttivo(), { classe: '', materia: '' });
    } finally {
        if (salva === undefined) delete global.window; else global.window = salva;
    }
});

test('privacy: chi SA il destinatario lo dichiara, e quello vince', () => {
    // la pipeline conosce classe e materia dalla config: non passa dal contesto
    const h = H.testata(H.conContesto({ titolo: 'X', classe: '1B', materia: 'Storia' }));
    assert.ok(/mm-dh__c--cls">1B</.test(h) && /mm-dh__c--mat">Storia</.test(h));
});

test('data: una stringa già pronta passa intatta (i chiamanti storici hanno il loro `now`)', () => {
    const h = H.testata({ titolo: 'X', data: '5 agosto 2026 alle 09:04' });
    assert.ok(/5 agosto 2026 alle 09:04/.test(h));
});

// ── STILE E PIÈ ──────────────────────────────────────────────────────────────

test('stile: le misure sono UNA sola serie, e la testata prende l\'accento del foglio', () => {
    const s = H.stile({ accento: '#0f766e' });
    assert.ok(/\.mm-dh \{[\s\S]*border-bottom:2px solid #0f766e/.test(s), 'bordo = accento passato');
    assert.ok(/padding:26px 16px 20px/.test(s));
    assert.ok(/\.mm-dh__t \{ font-size:20px; font-weight:900/.test(s));
    assert.ok(/border-bottom:2px solid #4f46e5/.test(H.stile({})), 'senza accento: indigo');
});

test('piè: numero di pagina COL TOTALE, nei margin-box di @page', () => {
    const s = H.stile({});
    // counter(page) fuori da @page vale 0: il numero DEVE stare qui dentro
    assert.ok(/@page \{/.test(s));
    assert.ok(/@bottom-right \{ content: "pagina " counter\(page\) " di " counter\(pages\)/.test(s),
        'pagina X di Y — senza il totale non si sa se ne mancano');
    assert.ok(/@bottom-left \{ content: "MappAI · insegnai\.ch"/.test(s), 'marchio a sinistra');
});

test('piè: il logo entra come url() e solo se passato', () => {
    const conLogo = H.stile({ logo: 'data:image/png;base64,AAA' });
    assert.ok(/@bottom-left \{ content: url\("data:image\/png;base64,AAA"\) "MappAI/.test(conLogo));
    assert.ok(!/url\(/.test(H.stile({})), 'senza logo nessun url() vuoto');
});

test('piè: la mappa si aggiunge al marchio (identifica il foglio caduto per terra)', () => {
    assert.ok(/content: "MappAI · insegnai\.ch · Sistema Terra"/.test(H.stile({ mappa: 'Sistema Terra' })));
});

test('piè: si può spegnere — numeri, piè intero, o tutto @page', () => {
    assert.ok(!/@bottom-right/.test(H.stile({ numeriPagina: false })), 'via i numeri');
    assert.ok(!/@bottom-left|@bottom-right/.test(H.stile({ piePagina: false })), 'via il piè');
    assert.ok(/@page/.test(H.stile({ piePagina: false })), '…ma @page resta: detta il formato');
    assert.ok(!/@page/.test(H.stile({ pagina: false })), 'via anche il formato');
});

test('piè: formato e margini del foglio sono un parametro', () => {
    const s = H.stile({ pagina: { size: 'A4 landscape', margine: '10mm' } });
    assert.ok(/@page \{ size:A4 landscape; margin:10mm;/.test(s));
    assert.ok(/@page \{ size:A4; margin:15mm 15mm 20mm;/.test(H.stile({})), 'default: A4 con banda per il piè');
});

test('piè: 🐛 una content string mal quotata farebbe sparire il piè SENZA errori', () => {
    /* CSS invalido = dichiarazione ignorata in silenzio. È il modo in cui questo
       pezzo può rompersi senza che nessuno se ne accorga finché non guarda un
       foglio stampato — quindi l'escape è provato, non dato per buono. */
    const s = H.stile({ brand: 'Liceo "Lugano" \\ Sez. A', mappa: 'a\nb' });
    assert.ok(/content: "Liceo \\"Lugano\\" \\\\ Sez\. A · a b"/.test(s),
        'virgolette e barra rovescia protette, a-capo appiattito');
    assert.strictEqual(H.escCss('x"y'), 'x\\"y');
    assert.strictEqual(H.escCss('r\niga'), 'r iga');
});

test('piè: il numero compare su ogni pagina perché è @page, non un elemento fisso', () => {
    /* Documentato dalla prova con Electron su un documento di 3 pagine:
       position:fixed salta la PRIMA pagina (è il difetto del dossier di oggi),
       il margin-box no. Qui si fissa solo che non torniamo a un elemento fisso. */
    const s = H.stile({});
    assert.ok(!/position: *fixed/.test(s), 'nessun piè a elemento fisso: salterebbe pagina 1');
});

// ── LOGO ─────────────────────────────────────────────────────────────────────

test('logoPiccolo: in Node non c\'è canvas → stringa vuota, mai un errore', async () => {
    assert.strictEqual(await H.logoPiccolo(), '');
    // e il documento regge senza logo
    assert.ok(/@bottom-left \{ content: "MappAI/.test(H.stile({ logo: '' })));
});

test('MISURE e COLORI sono esportati: chi migra un foglio confronta invece di indovinare', () => {
    assert.strictEqual(H.MISURE.titolo, 20);
    assert.strictEqual(H.MISURE.bordo, 2);
    assert.strictEqual(H.MISURE.logo, 24);
    assert.strictEqual(H.COLORI.classeTesto, '#4338ca');
    assert.strictEqual(H.ACCENTO, '#4f46e5');
});
