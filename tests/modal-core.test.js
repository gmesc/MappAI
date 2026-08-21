// Test del CORE DEI MODALI (mappai-modal-core.js): taglie, normalizzazione
// dello schema, validazione, contrasti della paletta, bersagli.
const { test } = require('node:test');
const assert = require('node:assert');
const MC = require('../public/js/mappai-modal-core.js');

// ── taglie ──────────────────────────────────────────────────────────────────
test('taglie: quattro valori, ignoto → m', () => {
    assert.strictEqual(MC.larghezza('s'), 440);
    assert.strictEqual(MC.larghezza('m'), 600);
    assert.strictEqual(MC.larghezza('l'), 820);
    assert.strictEqual(MC.larghezza('xl'), 1160);
    assert.strictEqual(MC.taglia('boh'), 'm');
    assert.strictEqual(MC.taglia(undefined), 'm');
});

test('tagliaVicina: le larghezze di oggi cadono nella taglia giusta', () => {
    assert.strictEqual(MC.tagliaVicina(384), 's');   // max-w-sm
    assert.strictEqual(MC.tagliaVicina(448), 's');   // max-w-md
    assert.strictEqual(MC.tagliaVicina(550), 'm');   // dossier-print
    assert.strictEqual(MC.tagliaVicina(672), 'm');   // max-w-2xl → 600 più vicino di 820
    assert.strictEqual(MC.tagliaVicina(896), 'l');   // max-w-4xl
    assert.strictEqual(MC.tagliaVicina(1200), 'xl'); // study-config
});

test('layoutValido: un cruscotto stretto non è un cruscotto', () => {
    assert.strictEqual(MC.layoutValido('cruscotto', 'xl'), 'cruscotto');
    assert.strictEqual(MC.layoutValido('cruscotto', 'l'), 'cruscotto');
    assert.strictEqual(MC.layoutValido('cruscotto', 'm'), 'una');
    assert.strictEqual(MC.layoutValido('tre', 'm'), 'due');
    assert.strictEqual(MC.layoutValido('due', 's'), 'una');
    assert.strictEqual(MC.layoutValido('inventato', 'l'), 'una');
});

// ── normalizzazione ─────────────────────────────────────────────────────────
test('normalizza: stringhe scorciatoia diventano oggetti completi', () => {
    const n = MC.normalizzaSchema({
        titolo: 'Prova',
        sezioni: ['Sezione sola'],
        azioni: ['Annulla', { etichetta: 'Salva', ruolo: 'primario' }]
    });
    assert.strictEqual(n.sezioni[0].titolo, 'Sezione sola');
    assert.strictEqual(n.sezioni[0].id, 'sez-1');
    assert.strictEqual(n.azioni[0].ruolo, 'secondario');
    assert.strictEqual(n.azioni[1].ruolo, 'primario');
    assert.strictEqual(n.taglia, 'm');
    assert.strictEqual(n.layout, 'una');
});

test('normalizza: il contratto tastiera è acceso salvo rinuncia esplicita', () => {
    const acceso = MC.normalizzaSchema({ titolo: 'x' });
    assert.strictEqual(acceso.esc, true);
    assert.strictEqual(acceso.invio, true);
    assert.strictEqual(acceso.veloChiude, true);
    const spento = MC.normalizzaSchema({ titolo: 'x', esc: false, invio: false, veloChiude: false });
    assert.strictEqual(spento.esc, false);
    assert.strictEqual(spento.invio, false);
    assert.strictEqual(spento.veloChiude, false);
});

test('normalizza campo: tipo ignoto → testo, spunta parte da falso', () => {
    const c = MC.normalizzaCampo({ etichetta: 'A', tipo: 'quantistico' }, 0);
    assert.strictEqual(c.tipo, 'testo');
    assert.strictEqual(c.valore, '');
    const s = MC.normalizzaCampo({ etichetta: 'B', tipo: 'spunta' }, 1);
    assert.strictEqual(s.valore, false);
});

// ── validazione ─────────────────────────────────────────────────────────────
test('valida: campo senza etichetta è un errore, non un avviso', () => {
    const v = MC.validaSchema({
        titolo: 'X',
        sezioni: [{ titolo: 'S', campi: [{ etichetta: '' }] }]
    });
    assert.strictEqual(v.ok, false);
    assert.ok(v.errori.some(e => /senza etichetta/.test(e)));
});

test('valida: due primari sono un errore', () => {
    const v = MC.validaSchema({
        titolo: 'X',
        azioni: [{ etichetta: 'A', ruolo: 'primario' }, { etichetta: 'B', ruolo: 'primario' }]
    });
    assert.strictEqual(v.ok, false);
    assert.ok(v.errori.some(e => /primarie/.test(e)));
});

test('valida: titolo mancante e modale vuoto', () => {
    const v = MC.validaSchema({});
    assert.strictEqual(v.ok, false);
    assert.strictEqual(v.errori.length, 2);
});

test('valida: dati in scrittura + velo che chiude = avviso, non blocco', () => {
    const v = MC.validaSchema({
        titolo: 'X', sporco: true,
        sezioni: [{ titolo: 'S', campi: [{ etichetta: 'Nome' }] }],
        azioni: [{ etichetta: 'Salva', ruolo: 'primario' }]
    });
    assert.strictEqual(v.ok, true);
    assert.ok(v.avvisi.some(a => /velo/.test(a)));
});

test('valida: taglia S con troppi campi avvisa', () => {
    const v = MC.validaSchema({
        titolo: 'X', taglia: 's',
        sezioni: [{ titolo: 'S', campi: ['A', 'B', 'C'] }],
        azioni: [{ etichetta: 'Ok', ruolo: 'primario' }]
    });
    assert.strictEqual(v.ok, true);
    assert.ok(v.avvisi.some(a => /taglia S/.test(a)));
});

test('valida: tendina senza opzioni è un errore', () => {
    const v = MC.validaSchema({
        titolo: 'X',
        sezioni: [{ titolo: 'S', campi: [{ etichetta: 'Classe', tipo: 'scelta' }] }]
    });
    assert.ok(v.errori.some(e => /tendina senza opzioni/.test(e)));
});

// ── colore ──────────────────────────────────────────────────────────────────
test('contrasto: valori noti', () => {
    assert.strictEqual(MC.contrasto('#000000', '#ffffff'), 21);
    assert.strictEqual(MC.contrasto('#ffffff', '#ffffff'), 1);
    // #64748b su bianco = 4.76 (la soglia scelta il 29/7)
    assert.ok(Math.abs(MC.contrasto('#64748b', '#ffffff') - 4.76) < 0.02);
    // #94a3b8 su bianco = 2.85 → sotto soglia
    assert.ok(MC.contrasto('#94a3b8', '#ffffff') < 3);
});

test('contrasto: hex corto e colore non valido', () => {
    assert.strictEqual(MC.contrasto('#fff', '#000'), 21);
    assert.strictEqual(MC.contrasto('rosso', '#fff'), null);
    assert.strictEqual(MC.esitoContrasto(null).ok, false);
});

test('esitoContrasto: soglia 3 per i componenti, 4.5 per il testo', () => {
    assert.strictEqual(MC.esitoContrasto(3.2, 'normale').ok, false);
    assert.strictEqual(MC.esitoContrasto(3.2, 'componente').ok, true);
    assert.strictEqual(MC.esitoContrasto(7.5, 'normale').etichetta, 'AAA');
});

test('verificaPaletta: una paletta che passa tutti gli accostamenti', () => {
    const buona = MC.verificaPaletta({
        accento: '#4f46e5', accentoTenue: '#eef2ff', testo: '#0f172a', testo2: '#475569',
        testo3: '#64748b', bordo: '#64748b', fondo: '#ffffff', fondoSez: '#f8fafc', distruttivo: '#dc2626'
    });
    assert.strictEqual(buona.falliti, 0, JSON.stringify(buona.esiti.filter(e => !e.ok)));
});

test('verificaPaletta: il segnaposto chiaro fallisce; il bordo è decorativo (decisione 31/7)', () => {
    // Paletta con segnaposto chiaro: la prova fissa il reperto storico.
    // Dal 31/7 i CAMPI non hanno bordo (si riconoscono dal riempimento):
    // il bordo resta sui riquadri come elemento decorativo → nessuna soglia.
    const oggi = MC.verificaPaletta({
        accento: '#4f46e5', accentoTenue: '#eef2ff', testo: '#0f172a', testo2: '#475569',
        testo3: '#94a3b8', bordo: '#e2e8f0', fondo: '#ffffff', fondoSez: '#f8fafc', distruttivo: '#dc2626'
    });
    assert.ok(oggi.falliti >= 2, 'segnaposto e testo terziario devono fallire');
    assert.ok(oggi.esiti.some(e => e.nome === 'segnaposto su campo' && !e.ok));
    const bordo = oggi.esiti.find(e => /bordo dei riquadri/.test(e.nome));
    assert.ok(bordo.ok, 'decorativo: sempre ok');
    assert.strictEqual(bordo.etichetta, 'decorativo');
    assert.ok(bordo.valore < 1.5, 'il valore resta misurato e visibile: ' + bordo.valore);
});

test('verificaPaletta: anche #94a3b8 come bordo resta sotto la soglia 3', () => {
    const v = MC.contrasto('#94a3b8', '#ffffff');
    assert.ok(v < 3, 'atteso <3, misurato ' + v);
    assert.strictEqual(MC.esitoContrasto(v, 'componente').ok, false);
});

// ── bersagli ────────────────────────────────────────────────────────────────
test('bersagli: il bottone della variante C sta sotto i 44px', () => {
    // padding 9, corpo 12, bordo 1 → 9*2 + 12*1.35 + 2 = 36
    const h = MC.altezzaBersaglio(9, 12, 1);
    assert.strictEqual(h, 36);
    assert.strictEqual(MC.bersaglioOk(h).ok, false);
    assert.strictEqual(MC.bersaglioOk(h).wcag, true);   // sopra il minimo 24 di WCAG 2.2
    // con padding 12 e corpo 13 si arriva a 44
    assert.ok(MC.bersaglioOk(MC.altezzaBersaglio(12, 13, 1)).ok);
});

// ── console (30/7): il layout che raccoglie ─────────────────────────────────
test('console: sotto XL non è una console, ripiega sul cruscotto', () => {
    // 260px di navigazione + una tabella: a 820 restano ~500px per l'elenco,
    // cioè un elenco, non una console.
    assert.strictEqual(MC.layoutValido('console', 'xl'), 'console');
    assert.strictEqual(MC.layoutValido('console', 'l'), 'cruscotto');
    assert.strictEqual(MC.layoutValido('console', 's'), 'cruscotto');
});

test('console: la vista piena vale solo per la console', () => {
    const c = MC.normalizzaSchema({ titolo: 'Registro', taglia: 'xl', layout: 'console', piena: true, nav: ['Classi'] });
    assert.strictEqual(c.piena, true);
    // stessa richiesta su un form: la vista piena si spegne da sé
    const f = MC.normalizzaSchema({ titolo: 'Profilo', taglia: 'm', layout: 'una', piena: true });
    assert.strictEqual(f.piena, false);
});

test('console senza navigazione è un errore, non un avviso', () => {
    const v = MC.validaSchema({
        titolo: 'Registro', taglia: 'xl', layout: 'console',
        tabella: { colonne: ['Classe'], righe: [['1ª A']] }
    });
    assert.strictEqual(v.ok, false);
    assert.ok(v.errori.some(e => /senza navigazione/.test(e)));
});

test('console: nessuna voce attiva → avviso SOLO se c’è una vista specifica', () => {
    // Con una tabella (o schede, o una tela) «dove sei» è una domanda vera.
    const conVista = MC.validaSchema({
        titolo: 'Registro', taglia: 'xl', layout: 'console',
        nav: [{ id: 'classi', etichetta: 'Classi' }, { id: 'allievi', etichetta: 'Allievi' }],
        tabella: { colonne: ['Classe'], righe: [['1ª A']] }
    });
    assert.ok(conVista.ok, 'lo schema è valido: manca solo l’indicazione di posizione');
    assert.ok(conVista.avvisi.some(a => /attiva/.test(a)));

    // Una console che mostra TUTTE le sue azioni in griglia non è «da nessuna
    // parte»: è nello stato senza filtro, e lo dice il sottotitolo (D1, 2/8).
    const griglia = MC.validaSchema({
        titolo: 'La Fotosintesi', taglia: 'xl', layout: 'console', area: 'tre',
        nav: [{ id: 'materiali', etichetta: 'Materiali' }, { id: 'live', etichetta: 'Live' }],
        sezioni: [{ titolo: 'Stampati', azioni: [{ id: 'a', etichetta: 'Foglio dei nodi' }] }]
    });
    assert.ok(!griglia.avvisi.some(a => /attiva/.test(a)));
});

test('tabella: righe con un numero di celle diverso dalle colonne sono un errore', () => {
    // è il modo in cui intestazioni e celle si scollegano (regola §10.15)
    const v = MC.validaSchema({
        titolo: 'Registro', taglia: 'xl', layout: 'console',
        nav: [{ id: 'c', etichetta: 'Classi', attiva: true }],
        tabella: {
            colonne: ['Classe', 'Allievi', 'Sede'],
            righe: [['1ª A', '19', 'Bellinzona'], ['2A', '18']]
        }
    });
    assert.strictEqual(v.ok, false);
    assert.ok(v.errori.some(e => /1 righe non hanno 3 celle/.test(e)));
});

test('tabella: normalizzazione tollerante (colonne come stringhe, allineamenti)', () => {
    const t = MC.normalizzaTabella({
        colonne: ['Classe', { etichetta: 'Token', allinea: 'destra', larghezza: '110px' }, { etichetta: 'X', allinea: 'boh' }],
        righe: [['1ª A', 184320, null]]
    });
    assert.strictEqual(t.colonne[0].allinea, 'sinistra');
    assert.strictEqual(t.colonne[1].allinea, 'destra');
    assert.strictEqual(t.colonne[1].larghezza, '110px');
    assert.strictEqual(t.colonne[2].allinea, 'sinistra', 'allineamento ignoto → sinistra');
    // le celle diventano stringhe, null → vuoto. Dal 2/8 la riga porta anche
    // `id`/`chiude` come proprietà proprie (riga che si sceglie): il confronto
    // guarda le celle, non l'oggetto array intero.
    assert.deepStrictEqual([].slice.call(t.righe[0]), ['1ª A', '184320', '']);
    assert.strictEqual(t.righe[0].id, '', 'senza id dichiarato la riga non si sceglie');
});

test('riga che si sceglie: l’id sopravvive alla seconda normalizzazione', () => {
    const t = MC.normalizzaTabella({
        colonne: ['Nome', ''],
        righe: [{ id: 'm:1', celle: ['Sintesi', { azioni: [{ id: 'del:1', icona: 'trash-2', etichetta: 'Elimina', soloIcona: true }] }] }]
    });
    assert.strictEqual(t.righe[0].id, 'm:1');
    assert.strictEqual(t.righe[0].chiude, true);
    assert.strictEqual(t.righe[0][1].azioni[0].chiude, false, 'i comandi di riga non concludono');
    // open() normalizza e render() rinormalizza: l'id non deve sparire
    const due = MC.normalizzaTabella(t);
    assert.strictEqual(due.righe[0].id, 'm:1');
    assert.strictEqual(due.righe[0][1].azioni[0].id, 'del:1');
});

test('voce di navigazione: contatore 0 si mostra, assente no', () => {
    assert.strictEqual(MC.normalizzaVoce({ etichetta: 'Classi', contatore: 0 }, 0).contatore, 0);
    assert.strictEqual(MC.normalizzaVoce({ etichetta: 'Classi' }, 0).contatore, null);
    assert.strictEqual(MC.normalizzaVoce('Classi', 3).id, 'voce-4');
});

test('console: area a colonne — valori ammessi, ignoto → una', () => {
    const base = { titolo: 'Mappa', taglia: 'xl', layout: 'console', nav: [{ id: 'x', etichetta: 'Azioni', attiva: true }] };
    assert.strictEqual(MC.normalizzaSchema(base).area, 'una');
    assert.strictEqual(MC.normalizzaSchema(Object.assign({ area: 'tre' }, base)).area, 'tre');
    assert.strictEqual(MC.normalizzaSchema(Object.assign({ area: 'sette' }, base)).area, 'una');
});

test('radio: il gruppo sopravvive alla normalizzazione (audit 31/7)', () => {
    // Prima il campo `gruppo` veniva scartato → campoHtml leggeva undefined e
    // TUTTI i radio del modale finivano nello stesso name: due domande radio
    // diverse si escludevano a vicenda.
    const s = MC.normalizzaSchema({
        titolo: 'Opzioni', sezioni: [{
            campi: [
                { id: 'a1', tipo: 'radio', gruppo: 'ambito', etichetta: 'Nodo' },
                { id: 'a2', tipo: 'radio', gruppo: 'ambito', etichetta: 'Ramo' },
                { id: 'f1', tipo: 'radio', gruppo: 'formato', etichetta: 'A4' }
            ]
        }]
    });
    const campi = s.sezioni[0].campi;
    assert.strictEqual(campi[0].gruppo, 'ambito');
    assert.strictEqual(campi[2].gruppo, 'formato');
    assert.notStrictEqual(campi[0].gruppo, campi[2].gruppo);
});


test('sezione con 2+ campi scritti e senza titolo → avviso (regola 31/7)', () => {
    // Coi campi a solo segnaposto, il titolo di sezione è l'indicazione che
    // resta dopo la compilazione.
    const senza = MC.validaSchema({
        titolo: 'Profilo', sezioni: [{
            campi: [{ id: 'a', etichetta: 'Nome' }, { id: 'b', etichetta: 'Sede' }]
        }]
    });
    assert.ok(senza.ok, 'è un avviso, non un errore');
    assert.ok(senza.avvisi.some(a => /senza titolo di sezione/.test(a)));
    // con il titolo, l'avviso sparisce
    const con = MC.validaSchema({
        titolo: 'Profilo', sezioni: [{
            titolo: 'Chi sei',
            campi: [{ id: 'a', etichetta: 'Nome' }, { id: 'b', etichetta: 'Sede' }]
        }]
    });
    assert.ok(!con.avvisi.some(a => /senza titolo di sezione/.test(a)));
    // un campo solo, o sole spunte, non lo richiedono
    const uno = MC.validaSchema({
        titolo: 'Titolo', sezioni: [{ campi: [{ id: 'a', etichetta: 'Nome' }] }]
    });
    assert.ok(!uno.avvisi.some(a => /senza titolo di sezione/.test(a)));
});

test("esitoContrasto: tipo 'decorativo' non ha soglia", () => {
    assert.strictEqual(MC.esitoContrasto(1.2, 'decorativo').ok, true);
    assert.strictEqual(MC.esitoContrasto(1.2, 'componente').ok, false);
});

// ── dati di contesto e contesto della console (31/7) ────────────────────────
test('dati: una riga per fatto, tollerante in ingresso', () => {
    const d = MC.normalizzaDati([
        { etichetta: 'Nodi', valore: 77 },
        'Densità: 1,22',
        'vault sincronizzato',
        { valore: '' },
        null
    ]);
    assert.strictEqual(d.length, 3, 'le righe vuote spariscono');
    assert.deepStrictEqual([d[0].etichetta, d[0].valore], ['Nodi', '77']);
    assert.deepStrictEqual([d[1].etichetta, d[1].valore], ['Densità', '1,22'], 'la stringa si spezza al primo :');
    assert.strictEqual(d[2].etichetta, '', 'senza : il fatto sta tutto nel valore');
    assert.strictEqual(d[2].valore, 'vault sincronizzato');
});

test('dati: un valore con : dentro non si spezza due volte', () => {
    const d = MC.normalizzaDati(['Vault: sincronizzato alle 14:02']);
    assert.strictEqual(d[0].etichetta, 'Vault');
    assert.strictEqual(d[0].valore, 'sincronizzato alle 14:02');
});

test('contesto: la selezione corrente vive nello schema, non nella vista', () => {
    const s = MC.normalizzaSchema({
        titolo: 'Registro', taglia: 'xl', layout: 'console',
        nav: [{ id: 'doc', etichetta: 'Documenti', attiva: true }],
        contesto: [{ id: 'classe', etichetta: '1ª A', icona: 'graduation-cap' }, 'Storia', { etichetta: '' }]
    });
    assert.strictEqual(s.contesto.length, 2, 'le voci vuote spariscono');
    // La × NON compare di default (cambio del 31/7, round 4): nel chip a due
    // metà ogni parte è un SELETTORE — si «toglie» scegliendo «tutte le
    // classi» dal suo elenco, non con una crocetta. La × resta disponibile
    // per le parti che si aggiungono al volo, come il documento aperto.
    assert.strictEqual(s.contesto[0].azzerabile, false);
    assert.strictEqual(s.contesto[0].scegli, true, 'di default la metà è cliccabile');
    assert.strictEqual(s.contesto[1].etichetta, 'Storia');
});

test('una console con solo navigazione e contesto non è «vuota»', () => {
    const v = MC.validaSchema({
        titolo: 'Registro', taglia: 'xl', layout: 'console',
        nav: [{ id: 'c', etichetta: 'Classi', attiva: true }],
        contesto: ['1ª A']
    });
    assert.ok(v.ok, v.errori.join(' · '));
});

test('sezione con dati: i dati non contano come campi scritti (niente falso avviso)', () => {
    const v = MC.validaSchema({
        titolo: 'Mappa', sezioni: [{
            dati: [{ etichetta: 'Nodi', valore: '77' }, { etichetta: 'Rami', valore: '6' }]
        }]
    });
    assert.ok(!v.avvisi.some(a => /senza titolo di sezione/.test(a)),
        'i dati sono di sola lettura: il titolo è consigliato, non richiesto dalla regola dei campi');
});

// ── chip di contesto e tela (31/7, round 4) ─────────────────────────────────
test('contesto: parti cliccabili di default, vuote riconoscibili', () => {
    const s = MC.normalizzaSchema({
        titolo: 'Registro', taglia: 'xl', layout: 'console',
        nav: [{ id: 'c', etichetta: 'Classi', attiva: true }],
        contesto: [
            { id: 'c', etichetta: 'Scegli la classe', vuoto: true },
            { id: 'd', etichetta: 'Storia' },
            { id: 'doc', etichetta: 'Quiz', scegli: false, azzerabile: true }
        ]
    });
    assert.strictEqual(s.contesto[0].vuoto, true);
    assert.strictEqual(s.contesto[0].scegli, true, 'anche vuota resta cliccabile: è l’invito a scegliere');
    assert.strictEqual(s.contesto[1].azzerabile, false, 'la × non compare se non richiesta');
    assert.strictEqual(s.contesto[2].scegli, false);
    assert.strictEqual(s.contesto[2].azzerabile, true);
});

test('tela: lo spazio libero dell’area, normalizzato', () => {
    const s = MC.normalizzaSchema({
        titolo: 'Documenti', taglia: 'xl', layout: 'console',
        nav: [{ id: 'q', etichetta: 'Quiz', attiva: true }],
        tela: { segnaposto: 'qui l’editor' }
    });
    assert.strictEqual(s.tela.id, 'tela');
    assert.strictEqual(s.tela.segnaposto, 'qui l’editor');
    assert.strictEqual(MC.normalizzaSchema({ titolo: 'x' }).tela, null);
});

test('tabella E tela insieme sono un errore: si contendono lo stesso spazio', () => {
    const v = MC.validaSchema({
        titolo: 'Documenti', taglia: 'xl', layout: 'console',
        nav: [{ id: 'q', etichetta: 'Quiz', attiva: true }],
        tabella: { colonne: ['A'], righe: [['1']] },
        tela: { segnaposto: 'editor' }
    });
    assert.strictEqual(v.ok, false);
    assert.ok(v.errori.some(e => /tabella E tela/.test(e)));
});

// Gli elenchi TITOLATI sono un'altra cosa: l'area scorre e loro crescono col
// contenuto, quindi una tela può stare sotto un elenco richiudibile. È la forma
// dei Consumi in Cabina (2/8): le mappe si scelgono in testa, il cruscotto sta
// sotto. Vietarla avrebbe costretto a disegnare l'elenco a mano.
test('elenchi titolati E tela convivono: nessuno dei due riempie l’area', () => {
    const v = MC.validaSchema({
        titolo: 'Consumi', taglia: 'xl', layout: 'console', invio: false,
        nav: [{ id: 'c', etichetta: 'Consumi', attiva: true }],
        tabelle: [{ id: 'mappe', titolo: 'Mappe', colonne: ['A'], righe: [['1']] }],
        tela: { id: 'ud' }
    });
    assert.strictEqual(v.ok, true, v.errori.join(' · '));
    assert.strictEqual(v.errori.length, 0);
});

// Una riga con `chiude:false` non conclude: dentro una console sceglierla è una
// SELEZIONE, non un modo di uscire dalla finestra in cui si sta lavorando.
test('riga di tabella: `chiude:false` sopravvive alla doppia normalizzazione', () => {
    const riga = ['Mappa', '12'];
    riga.id = 'udp:7';
    riga.chiude = false;
    const uno = MC.normalizzaTabella({ colonne: ['A', 'B'], righe: [riga] });
    assert.strictEqual(uno.righe[0].id, 'udp:7');
    assert.strictEqual(uno.righe[0].chiude, false);
    const due = MC.normalizzaTabella({ colonne: ['A', 'B'], righe: uno.righe });
    assert.strictEqual(due.righe[0].id, 'udp:7');
    assert.strictEqual(due.righe[0].chiude, false);
});

test('una console con la sola tela non è «vuota»', () => {
    const v = MC.validaSchema({
        titolo: 'Documenti', taglia: 'xl', layout: 'console',
        nav: [{ id: 'q', etichetta: 'Quiz', attiva: true }],
        tela: { segnaposto: 'editor' }
    });
    assert.ok(v.ok, v.errori.join(' · '));
});

// ── celle di scelte e navigazione richiudibile (31/7, round 5) ──────────────
test('tabella: una cella può essere un gruppo di scelte cliccabili', () => {
    const t = MC.normalizzaTabella({
        colonne: ['Classe', 'Discipline'],
        righe: [['1ª A', { scelte: ['Storia', 'Educazione all’immagine'], azione: 'attiva' }]]
    });
    const cel = t.righe[0][1];
    assert.deepStrictEqual(cel.scelte, ['Storia', 'Educazione all’immagine']);
    assert.strictEqual(cel.azione, 'attiva');
    assert.strictEqual(t.righe[0][0], '1ª A', 'le celle normali restano stringhe');
});

test('tabella: scelte senza azione ricevono un id di riserva', () => {
    const t = MC.normalizzaTabella({ colonne: ['x'], righe: [[{ scelte: ['A'] }]] });
    assert.strictEqual(t.righe[0][0].azione, 'scelta');
});

test('navigazione richiudibile: attiva di default, chiusa senza comando è un avviso', () => {
    const base = {
        titolo: 'Documenti', taglia: 'xl', layout: 'console',
        nav: [{ id: 'q', etichetta: 'Quiz', attiva: true }], tela: { segnaposto: 'editor' }
    };
    // Dal 2/8 ogni console ha la maniglia: `navChiudibile` è vero per default,
    // quindi mostrarla già chiusa è legittimo — si riapre dalla maniglia.
    assert.strictEqual(MC.normalizzaSchema(base).navChiudibile, true);
    const chiusa = MC.validaSchema(Object.assign({ navChiusa: true }, base));
    assert.ok(!chiusa.avvisi.some(a => /non si può riaprire/.test(a)));
    // spegnere la maniglia E aprire già chiusa è la combinazione senza uscita
    const senzaUscita = MC.validaSchema(Object.assign({ navChiusa: true, navChiudibile: false }, base));
    assert.ok(senzaUscita.avvisi.some(a => /non si può riaprire/.test(a)));
});

// ── bollino nelle celle e azioni in testata (2/8) ───────────────────────────
test('tabella: cella con bollino di stato, sempre col suo significato', () => {
    const t = MC.normalizzaTabella({
        colonne: ['Classe'],
        righe: [[{ testo: '1ª A', bollino: 'ok', titolo: 'Taratura AI attiva' }], ['2A']]
    });
    assert.deepStrictEqual(t.righe[0][0], { testo: '1ª A', bollino: 'ok', titolo: 'Taratura AI attiva' });
    assert.strictEqual(t.righe[1][0], '2A', 'le celle semplici restano stringhe');
    // senza titolo il bollino resta, ma è il motore a non poterlo annunciare:
    // la normalizzazione non inventa un significato che non è stato dato
    const senza = MC.normalizzaTabella({ colonne: ['x'], righe: [[{ testo: 'A', bollino: 'ok' }]] });
    assert.strictEqual(senza.righe[0][0].titolo, '');
});

test('azioni in testata: normalizzate come le altre e contano come corpo', () => {
    const s = MC.normalizzaSchema({
        titolo: 'Documenti', taglia: 'xl', layout: 'console',
        nav: [{ id: 'q', etichetta: 'Quiz', attiva: true }],
        tela: { segnaposto: 'editor' },
        azioniTestata: [{ id: 'chiudi', etichetta: 'Chiudi', icona: 'x' }]
    });
    assert.strictEqual(s.azioniTestata.length, 1);
    assert.strictEqual(s.azioniTestata[0].ruolo, 'secondario');
    // una console con sole azioni in testata non è «vuota»
    const v = MC.validaSchema({ titolo: 'X', azioniTestata: [{ id: 'a', etichetta: 'Chiudi' }] });
    assert.ok(!v.errori.some(e => /vuoto/.test(e)));
});

test('la barra dei filtri non chiede il titolo di sezione (2/8)', () => {
    // I campi dei filtri non si «compilano e si lasciano»: governano l'elenco
    // sotto e il loro effetto si vede subito.
    const filtri = MC.validaSchema({
        titolo: 'Documenti', taglia: 'xl', layout: 'console',
        nav: [{ id: 'd', etichetta: 'Documenti', attiva: true }],
        sezioni: [{
            colonna: 'filtri',
            campi: [{ id: 'q', etichetta: 'Cerca' }, { id: 'm', tipo: 'scelta', etichetta: 'Mappa', opzioni: ['Mappe'] }]
        }],
        tabella: { colonne: ['Documento'], righe: [['La Fotosintesi']] }
    });
    assert.ok(!filtri.avvisi.some(a => /senza titolo di sezione/.test(a)));
    // una sezione normale con gli stessi campi lo chiede ancora
    const form = MC.validaSchema({
        titolo: 'Profilo',
        sezioni: [{ campi: [{ id: 'a', etichetta: 'Nome' }, { id: 'b', etichetta: 'Sede' }] }]
    });
    assert.ok(form.avvisi.some(a => /senza titolo di sezione/.test(a)));
});

test('sezione: la riga di esito sta sotto le azioni, non fra le spiegazioni', () => {
    const s = MC.normalizzaSchema({
        titolo: 'Consegna', sezioni: [{
            titolo: 'Consegna via QR',
            testo: 'spiegazione, sopra',
            azioni: [{ id: 'f', etichetta: 'Scegli file' }],
            sotto: 'Scelto: Scheda.pdf · 1,2 MB'
        }]
    });
    const sez = s.sezioni[0];
    assert.strictEqual(sez.sotto, 'Scelto: Scheda.pdf · 1,2 MB');
    assert.strictEqual(sez.testo, 'spiegazione, sopra');
    assert.strictEqual(MC.normalizzaSezione({ titolo: 'x' }, 0).sotto, '', 'assente per default');
});

// ── gruppi nella navigazione (2/8) ──────────────────────────────────────────
test('navigazione: le intestazioni di gruppo non sono voci', () => {
    const s = MC.normalizzaSchema({
        titolo: 'Gestione', taglia: 'xl', layout: 'console',
        nav: [{ gruppo: 'La classe' }, { id: 'classi', etichetta: 'Classi', attiva: true },
              { gruppo: 'Documenti' }, { id: 'doc', etichetta: 'Documenti' }]
    });
    assert.strictEqual(s.nav[0].tipo, 'gruppo');
    assert.strictEqual(s.nav[0].etichetta, 'La classe');
    assert.strictEqual(s.nav[1].tipo, 'voce');
    assert.strictEqual(s.nav[0].attiva, false, 'un’intestazione non può essere attiva');
});

test('console con SOLE intestazioni di gruppo è un errore: non c’è navigazione', () => {
    const v = MC.validaSchema({
        titolo: 'Gestione', taglia: 'xl', layout: 'console',
        nav: [{ gruppo: 'La classe' }, { gruppo: 'Documenti' }]
    });
    assert.strictEqual(v.ok, false);
    assert.ok(v.errori.some(e => /senza navigazione/.test(e)));
});

test('l’avviso «nessuna voce attiva» ignora le intestazioni di gruppo', () => {
    const v = MC.validaSchema({
        titolo: 'Gestione', taglia: 'xl', layout: 'console',
        nav: [{ gruppo: 'La classe' }, { id: 'c', etichetta: 'Classi', attiva: true }],
        tabella: { colonne: ['Classe'], righe: [['1ª A']] }
    });
    assert.ok(!v.avvisi.some(a => /attiva/.test(a)), 'la voce attiva c’è: il gruppo non deve confondere il conto');
});

// ── campo elenco (2/8) ──────────────────────────────────────────────────────
test('elenco: valori e comando di aggiunta normalizzati', () => {
    const c = MC.normalizzaCampo({
        id: 'sedi', tipo: 'elenco', etichetta: 'Sedi',
        valori: ['SM Bellinzona 2', 'SM Giubiasco'], aggiungi: 'Aggiungi sede'
    }, 0);
    assert.strictEqual(c.tipo, 'elenco');
    assert.deepStrictEqual(c.valori, ['SM Bellinzona 2', 'SM Giubiasco']);
    assert.strictEqual(c.aggiungi, 'Aggiungi sede');
    assert.deepStrictEqual(MC.normalizzaCampo({ tipo: 'elenco', etichetta: 'x' }, 0).valori, []);
});

// ── campo che cresce col testo (21/8) ───────────────────────────────────────
// Regressione: `normalizzaCampo` costruisce un oggetto NUOVO elencando ciò che
// sopravvive, e per dieci mesi `cresce` non era in quell'elenco — la scheda
// della fonte lo dichiarava dal 20/8 e i suoi campi lunghi restavano alti tre
// righe. Terza proprietà persa così (dopo `gruppo` dei radio e `vociDi`).
test('cresce: sopravvive alla normalizzazione, e sopravvive due volte', () => {
    const c = MC.normalizzaCampo({ id: 'desc', tipo: 'area', cresce: true }, 0);
    assert.strictEqual(c.cresce, true);
    // idempotenza: open() normalizza e render() rinormalizza (difetto del 2/8)
    assert.strictEqual(MC.normalizzaCampo(c, 0).cresce, true);
    assert.strictEqual(MC.normalizzaCampo({ id: 'x', tipo: 'area' }, 0).cresce, false);
});

test('elenco senza etichetta di aggiunta → avviso (un «+» non dice cosa aggiunge)', () => {
    const v = MC.validaSchema({
        titolo: 'Profilo',
        sezioni: [{ titolo: 'Sedi', campi: [{ id: 's', tipo: 'elenco', etichetta: 'Sedi', valori: ['A'] }] }]
    });
    assert.ok(v.ok, 'è un avviso, non un errore');
    assert.ok(v.avvisi.some(a => /cosa aggiunge/.test(a)));
});

// ── ordinamento e ridimensionamento delle colonne (2/8) ─────────────────────
test('tabella: ordinabile e ridimensionabile sono attivi di default', () => {
    const t = MC.normalizzaTabella({ colonne: ['Classe'], righe: [['1ª A']] });
    assert.strictEqual(t.ordinabile, true);
    assert.strictEqual(t.ridimensionabile, true);
    assert.strictEqual(t.colonne[0].ordinabile, true);
    // si spengono dove non avrebbero senso
    const spenta = MC.normalizzaTabella({
        colonne: [{ etichetta: 'Azioni', ordinabile: false }],
        righe: [['—']], ordinabile: false, ridimensionabile: false
    });
    assert.strictEqual(spenta.ordinabile, false);
    assert.strictEqual(spenta.ridimensionabile, false);
    assert.strictEqual(spenta.colonne[0].ordinabile, false);
});

test('tabella: l’allineamento a sinistra è il default, gli altri sono deroghe', () => {
    const t = MC.normalizzaTabella({
        colonne: ['Classe', { etichetta: 'Token', allinea: 'destra' }, { etichetta: 'X', allinea: 'boh' }],
        righe: [['1ª A', '184.320', '—']]
    });
    assert.strictEqual(t.colonne[0].allinea, 'sinistra');
    assert.strictEqual(t.colonne[1].allinea, 'destra', 'la deroga esplicita resta possibile');
    assert.strictEqual(t.colonne[2].allinea, 'sinistra', 'un valore ignoto ricade a sinistra');
});

// ── VOCI: righe che si scelgono (archetipo «Elenco», 2/8) ───────────────────
test('voce: si comporta come un bottone — conclude, salvo dirlo', () => {
    const v = MC.normalizzaVoce({ id: 'cls-1', etichetta: '1ª A', sotto: '1ª media · Ticino', icona: 'graduation-cap', badge: '24 allievi' }, 0);
    assert.strictEqual(v.tipo, 'voce');
    assert.strictEqual(v.etichetta, '1ª A');
    assert.strictEqual(v.sotto, '1ª media · Ticino');
    assert.strictEqual(v.badge, '24 allievi');
    assert.strictEqual(v.chiude, true, 'sceglierla conclude');
    const resta = MC.normalizzaVoce({ id: 'x', etichetta: 'x', chiude: false }, 0);
    assert.strictEqual(resta.chiude, false);
});

/* La figura della sezione: il ritratto accanto al testo che presenta. L'`alt`
   è la parte che conta — un ritratto senza nome, per chi legge con lo schermo,
   è un buco. Una figura senza `src` non esiste: non si emette un <img> vuoto. */
test('sezione: la figura porta il suo alt, e senza src non c’è', () => {
    const s = MC.normalizzaSezione({ titolo: 'Chi c’è dietro', figura: { src: 'foto.png', alt: 'Ritratto', tonda: true } }, 0);
    assert.strictEqual(s.figura.src, 'foto.png');
    assert.strictEqual(s.figura.alt, 'Ritratto');
    assert.strictEqual(s.figura.tonda, true);
    assert.strictEqual(MC.normalizzaSezione({ figura: { alt: 'orfana' } }, 0).figura, null);
    assert.strictEqual(MC.normalizzaSezione({ titolo: 'x' }, 0).figura, null);
});

/* La classe di deroga serve alla voce «Segnalazione» della Cabina, che è il
   clone del bottone ambra del cassetto insegnai. Deve sopravvivere alla DOPPIA
   normalizzazione (`open()` normalizza, `render()` rinormalizza): senza, la
   veste si perdeva al primo ridisegno e la voce tornava una riga come le altre
   — è la trappola già vista sulle intestazioni di gruppo. */
test('voce: la classe di deroga resta, e regge la doppia normalizzazione', () => {
    const una = MC.normalizzaVoce({ id: 'feedback', etichetta: 'Segnalazione', classe: 'mm-nav__v--segnala' }, 0);
    assert.strictEqual(una.classe, 'mm-nav__v--segnala');
    const due = MC.normalizzaVoce(una, 0);
    assert.strictEqual(due.classe, 'mm-nav__v--segnala');
    assert.strictEqual(MC.normalizzaVoce({ etichetta: 'Privacy' }, 0).classe, '', 'senza deroga la voce resta standard');
});

test('voce: i comandi in coda NON concludono (si elimina e l’elenco resta aperto)', () => {
    const v = MC.normalizzaVoce({
        id: 'doc-1', etichetta: 'Sintesi',
        azioni: [{ id: 'del', etichetta: 'Elimina', ruolo: 'distruttivo' },
                 { id: 'apri', etichetta: 'Apri', chiude: true }]
    }, 0);
    assert.strictEqual(v.azioni[0].chiude, false, 'il default si rovescia sui comandi di riga');
    assert.strictEqual(v.azioni[1].chiude, true, 'salvo dirlo esplicitamente');
});

test('voci: le intestazioni di gruppo non sono voci e non si cliccano', () => {
    const s = MC.normalizzaSezione({ voci: [{ gruppo: 'Già usate con la classe' }, 'La Fotosintesi'] }, 0);
    assert.strictEqual(s.voci.length, 2);
    assert.strictEqual(s.voci[0].tipo, 'gruppo');
    assert.strictEqual(s.voci[0].etichetta, 'Già usate con la classe');
    assert.strictEqual(s.voci[1].tipo, 'voce');
});

test('voce senza etichetta = errore; id ripetuto = errore', () => {
    const muta = MC.validaSchema({ titolo: 'Scegli', sezioni: [{ voci: [{ id: 'a', etichetta: '' }] }] });
    assert.ok(!muta.ok);
    assert.ok(muta.errori.some(e => /che cosa si sceglie/.test(e)));
    const doppia = MC.validaSchema({
        titolo: 'Scegli',
        sezioni: [{ voci: [{ id: 'a', etichetta: 'Uno' }, { id: 'a', etichetta: 'Due' }] }]
    });
    assert.ok(!doppia.ok);
    assert.ok(doppia.errori.some(e => /id ripetuto/.test(e)));
});

test('un elenco di sole voci NON è un modale vuoto', () => {
    const v = MC.validaSchema({ titolo: 'Scegli la classe', sezioni: [{ voci: ['1ª A', '1B'] }] });
    assert.ok(v.ok, v.errori.join(' · '));
    assert.ok(!v.errori.some(e => /vuoto/.test(e)));
});

test('oltre una decina di voci senza gruppi → avviso (diventa un muro)', () => {
    const tante = Array.from({ length: 14 }, (_, i) => ({ id: 'v' + i, etichetta: 'Mappa ' + i }));
    const senza = MC.validaSchema({ titolo: 'Scegli', sezioni: [{ voci: tante }] });
    assert.ok(senza.avvisi.some(a => /muro/.test(a)));
    const con = MC.validaSchema({ titolo: 'Scegli', sezioni: [{ voci: [{ gruppo: 'Recenti' }].concat(tante) }] });
    assert.ok(!con.avvisi.some(a => /muro/.test(a)));
});

test('normalizzare due volte non cambia niente: open() normalizza e render() rinormalizza', () => {
    // Il difetto vero (2/8): alla seconda passata un'intestazione di gruppo non
    // porta più il campo `gruppo` (è diventato `etichetta`) e tornava un bottone.
    const una = MC.normalizzaVoce({ gruppo: 'Stesso grado' }, 0);
    const due = MC.normalizzaVoce(una, 0);
    assert.strictEqual(due.tipo, 'gruppo');
    assert.strictEqual(due.etichetta, 'Stesso grado');
    // e vale per l'intero schema: nav della console + voci di elenco
    const s1 = MC.normalizzaSchema({
        titolo: 'x', taglia: 'xl', layout: 'console',
        nav: [{ gruppo: 'La classe' }, { id: 'reg', etichetta: 'Registro', attiva: true }],
        sezioni: [{ voci: [{ gruppo: 'Recenti' }, 'La Fotosintesi'] }]
    });
    const s2 = MC.normalizzaSchema(s1);
    assert.deepStrictEqual(s2.nav.map(v => v.tipo), ['gruppo', 'voce']);
    assert.deepStrictEqual(s2.sezioni[0].voci.map(v => v.tipo), ['gruppo', 'voce']);
    assert.deepStrictEqual(s2, s1, 'la seconda passata è un no-op');
});

test('bottone di sola icona: l’etichetta non sparisce, diventa il nome accessibile', () => {
    const b = MC.normalizzaBottone({ id: 'del', icona: 'trash-2', etichetta: 'Elimina', soloIcona: true }, 0);
    assert.strictEqual(b.soloIcona, true);
    assert.strictEqual(b.etichetta, 'Elimina', 'resta: diventerà aria-label e title');
    // senza icona non ha senso: sarebbe un bottone vuoto
    const muto = MC.normalizzaBottone({ id: 'x', etichetta: 'Elimina', soloIcona: true }, 0);
    assert.strictEqual(muto.soloIcona, false);
});

// ── Più elenchi nella stessa vista, sezioni nude e richiudibili (2/8) ───────
test('tabelle multiple: il titolo è ciò che le rende richiudibili', () => {
    const n = MC.normalizzaSchema({
        titolo: 'Insegna', taglia: 'xl', layout: 'console', nav: [{ id: 'a', etichetta: 'x', attiva: true }],
        tabelle: [
            { id: 'sin', titolo: 'Sintesi', colonne: ['Nome', 'Data'], righe: [['S1', '01/08/2026']] },
            { id: 'qz', titolo: 'Quiz', colonne: ['Nome'], righe: [['Q1']], chiusa: true },
            { colonne: ['Nome'], righe: [['boh']] }            // senza titolo
        ]
    });
    assert.strictEqual(n.tabelle.length, 3);
    assert.strictEqual(n.tabelle[0].collassabile, true);
    assert.strictEqual(n.tabelle[1].chiusa, true);
    assert.strictEqual(n.tabelle[2].collassabile, false, 'senza titolo non c’è niente su cui cliccare');
    assert.strictEqual(n.tabelle[2].chiusa, false);
});

test('tabelle multiple: le righe storte restano un errore, col nome dell’elenco', () => {
    const v = MC.validaSchema({
        titolo: 'x', taglia: 'xl', layout: 'console', nav: [{ id: 'a', etichetta: 'x', attiva: true }],
        tabelle: [{ id: 't', titolo: 'Quiz', colonne: ['A', 'B'], righe: [['solo una']] }]
    });
    assert.ok(!v.ok);
    assert.ok(v.errori.some(e => /tabella «Quiz»/.test(e)), v.errori.join(' · '));

    /* Il conflitto con la tela riguarda la tabella PRINCIPALE, che prende
       `flex:1` e riempie l'area. Gli elenchi titolati no: l'area scorre e loro
       crescono col contenuto, quindi convivono con una tela (Consumi, 2/8). */
    const conviventi = MC.validaSchema({
        titolo: 'x', taglia: 'xl', layout: 'console', invio: false,
        nav: [{ id: 'a', etichetta: 'x', attiva: true }],
        tabelle: [{ titolo: 'Q', colonne: ['A'], righe: [['a']] }], tela: { segnaposto: 'x' }
    });
    assert.ok(!conviventi.errori.some(e => /tabella E tela/.test(e)), conviventi.errori.join(' · '));
});

test('sezione nuda e sezione richiudibile', () => {
    const s = MC.normalizzaSezione({ titolo: 'Comandi', nuda: true }, 0);
    assert.strictEqual(s.nuda, true);
    assert.strictEqual(s.collassabile, false);
    const c = MC.normalizzaSezione({ titolo: 'Materiali', collassabile: true, chiusa: true }, 0);
    assert.strictEqual(c.collassabile, true);
    assert.strictEqual(c.chiusa, true);
    // «chiusa» senza «collassabile» sarebbe una sezione che non si può riaprire
    const bloccata = MC.normalizzaSezione({ titolo: 'x', chiusa: true }, 0);
    assert.strictEqual(bloccata.chiusa, false);
});

/* La tela nasce per UN pezzo e lo centra; con più blocchi il centraggio li
   mette in fila (è successo alle Impostazioni AI, tre pezzi del markup
   storico). `forma: 'colonna'` è la deroga, e come ogni deroga si dichiara. */
test('tela: la forma «colonna» si dichiara, e nient’altro è ammesso', () => {
    const s = MC.normalizzaSchema({ titolo: 'x', tela: { id: 'ai', forma: 'colonna' } });
    assert.strictEqual(s.tela.forma, 'colonna');
    assert.strictEqual(MC.normalizzaSchema({ titolo: 'x', tela: { id: 'ai' } }).tela.forma, '');
    assert.strictEqual(MC.normalizzaSchema({ titolo: 'x', tela: { id: 'ai', forma: 'griglia' } }).tela.forma, '');
});
