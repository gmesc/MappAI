/* Composizione del bento di COSTRUISCI — regole pure.
   Le tre domande a cui il validatore deve rispondere sono le tre cose che
   guardando a occhio erano sfuggite: una voce rimasta fuori (i preset), una
   riga che non chiude la griglia (l'azione spaiata), un figlio senza il suo
   master. */
const test = require('node:test');
const assert = require('node:assert');
const B = require('../public/js/mappai-bento-composizione.js');

test('la composizione di partenza non ha ERRORI', () => {
    const v = B.valida(B.MODULI);
    assert.deepStrictEqual(v.errori, []);
});

/* La revisione di Giacomo (3/8) lascia fuori quattro voci di proposito: la
   classe (vive nel chip), l'ambito, il genere «titolo» e la stima. Il test le
   fissa — se un domani ne esce una quinta senza che nessuno l'abbia deciso, si
   vede subito. */
test('le voci fuori dalla composizione sono quelle DECISE, non altre', () => {
    const v = B.valida(B.MODULI);
    /* Gli STRUMENTI (5/8) sono fuori per costruzione: sono le funzioni che la vista
       compatta nasconde, messe nell'inventario perché Giacomo le componga in
       officina. Il test guarda le voci della PIPELINE, che sono quelle su cui una
       sparizione involontaria costerebbe un'opzione. */
    const strumenti = new Set(B.VOCI.filter(x => x.tipo === 'strumento').map(x => x.id));
    const fuoriPipeline = v.fuori.filter(id => !strumenti.has(id)).sort();
    assert.deepStrictEqual(fuoriPipeline,
        ['mn-solo-mappa', 'mp-adapt-on', 'mp-adapt-scope', 'mp-angle', 'mp-class', 'mp-estimate'].sort());
});

/* ═══ GLI STRUMENTI: le funzioni che la vista compatta nasconde ═══════════════
   Stavano solo in un blocco CSS di nascondimenti: irraggiungibili E non
   discutibili. Nell'inventario diventano componibili come ogni altra voce. */
test('ogni strumento dichiara COME si monta e in quale gruppo', () => {
    const s = B.VOCI.filter(v => v.tipo === 'strumento');
    assert.ok(s.length >= 19, 'gli strumenti censiti dal blocco della vista compatta');
    s.forEach(v => {
        /* `raccoglie` è la terza forma (5/8): il pezzo non esiste al montaggio —
           la riga del testo libero nasce quando si preme «Testo» — quindi il posto
           dichiara che cosa raccoglie invece di dove andarlo a prendere */
        assert.ok(v.sposta || v.chiama || v.raccoglie,
            v.id + ': senza `sposta`, `chiama` o `raccoglie` non si sa cosa montare');
        assert.ok(v.gruppo, v.id + ': senza gruppo finisce in un elenco piatto');
        assert.ok(v.seFuori && v.seFuori.length > 10, v.id + ': deve dire cosa costa non averlo');
    });
});

test('gli strumenti coprono i quattro gruppi, e nessun selettore è ripetuto', () => {
    const s = B.VOCI.filter(v => v.tipo === 'strumento');
    const gruppi = [...new Set(s.map(v => v.gruppo))].sort();
    assert.deepStrictEqual(gruppi, ['Apri', 'Contenuto', 'Fonti', 'Motore']);
    const sel = s.map(v => v.sposta).filter(Boolean);
    assert.strictEqual(new Set(sel).size, sel.length,
        'due voci sullo stesso elemento se lo strapperebbero a vicenda');
});

test('uno strumento non è un campo della pipeline: non entra in hasOutput', () => {
    /* difesa: se un domani uno strumento prendesse una `chiave` di config, il
       bottone «Genera materiali» si accenderebbe per una funzione che non produce
       materiali */
    B.VOCI.filter(v => v.tipo === 'strumento').forEach(v => {
        assert.strictEqual(v.chiave, '—', v.id + ': uno strumento non dichiara chiavi di config');
    });
});

test('ogni voce dichiara cosa succede se resta fuori', () => {
    B.VOCI.forEach(v => assert.ok(v.seFuori && v.seFuori.length > 10, 'manca seFuori: ' + v.id));
});

/* ⚠️ Regressione: `vociDi` copiava a mano solo `et` e `w`, quindi ogni leva
   per-voce aggiunta dopo (il pop-up, il titolo del posto) finiva nel dato, si
   rileggeva dal file salvato e non arrivava MAI a chi disegna. Si rompeva in
   silenzio: la scelta c'era, l'effetto no. */
test('una voce porta a chi disegna TUTTI i campi che le sono stati scritti', () => {
    const m = { id: 'x', voci: [{ id: 'mp-angle', et: 'A', w: 90, aiuto: 'Spiegazione mia', titoloPosto: 'sempre' }] };
    const v = B.vociDi(m)[0];
    assert.strictEqual(v.aiuto, 'Spiegazione mia');
    assert.strictEqual(v.titoloPosto, 'sempre');
    assert.strictEqual(v.et, 'A');
    assert.strictEqual(v.w, 90);
    assert.ok(v.base, 'la voce dell\'inventario resta raggiungibile');
    assert.strictEqual(B.titoloPosto(v), 'sempre', 'e la leva ha effetto davvero');
});

test('una voce può riscrivere etichetta e larghezza del campo', () => {
    const m = { id: 'x', titolo: 'X', span: 1, voci: ['mp-angle', { id: 'mp-perbranch', et: 'Domande', w: 90 }] };
    const v = B.vociDi(m);
    assert.strictEqual(v[0].et, 'Angolo', 'la stringa tiene l\'etichetta dell\'inventario');
    assert.strictEqual(v[1].et, 'Domande');
    assert.strictEqual(v[1].w, 90);
});

test('lo stile di un modulo ha sempre tutti i campi (i mancanti dal base)', () => {
    const s = B.stileDi({ id: 'x', stile: { bg: '#ffffff' } });
    assert.strictEqual(s.bg, '#ffffff');
    assert.strictEqual(s.testo, B.STILE_BASE.testo);
    assert.strictEqual(s.bordoPx, B.STILE_BASE.bordoPx);
});

test('una coppia fondo/testo illeggibile è un avviso', () => {
    const moduli = [{ id: 'x', titolo: 'X', span: 4, voci: ['mp-src-pdf'],
                      stile: { bg: '#ffffff', testo: '#f1f5f9' } }];
    const v = B.valida(moduli);
    assert.ok(v.avvisi.some(a => /non si legge/.test(a)), 'il banco deve dirlo prima');
});

test('contrasto: bianco su nero 21, e un hex sbagliato non fa esplodere nulla', () => {
    assert.strictEqual(B.contrasto('#ffffff', '#000000'), 21);
    assert.strictEqual(B.contrasto('rosso', '#000'), null);
});

test('nessun modulo della composizione ha una coppia fondo/testo illeggibile', () => {
    const v = B.valida(B.MODULI);
    assert.ok(!v.avvisi.some(a => /non si legge/.test(a)),
        'i colori scelti devono stare tutti sopra 4,5:1');
});

test('i preset stanno nella composizione (erano la voce sparita)', () => {
    const dentro = B.MODULI.some(m => B.vociDi(m).some(v => v.id === 'mp-preset'));
    assert.ok(dentro, 'mp-preset deve essere montato da qualche modulo');
});

test('una voce non assegnata viene segnalata come tale', () => {
    const moduli = B.MODULI.map(m => ({ ...m, voci: B.vociDi(m).filter(v => v.id !== 'mp-preset').map(v => v.id) }));
    const v = B.valida(moduli);
    assert.ok(v.fuori.includes('mp-preset'));
    assert.ok(v.avvisi.some(a => /non è montata/.test(a)));
});

test('la stessa voce in due moduli è un ERRORE (il campo sarebbe scritto due volte)', () => {
    const moduli = B.MODULI.concat([{ id: 'x', titolo: 'X', span: 2, voci: ['mp-src-pdf'] }]);
    const v = B.valida(moduli);
    assert.ok(v.errori.some(e => /sta in due moduli/.test(e)));
});

test('una riga che non chiude le 4 colonne è un avviso', () => {
    const moduli = [
        { id: 'a', titolo: 'A', span: 3, voci: ['mp-src-pdf'] },
        { id: 'b', titolo: 'B', span: 2, voci: ['mp-estimate'] }
    ];
    const v = B.valida(moduli);
    assert.strictEqual(v.righe.length, 2, 'il secondo modulo non entra nella prima riga');
    assert.ok(v.avvisi.some(a => /colonne vuote/.test(a)));
});

test('un modulo solo in fondo che non riempie la riga viene segnalato', () => {
    const moduli = [
        { id: 'a', titolo: 'A', span: 4, voci: ['mp-src-pdf'] },
        { id: 'b', titolo: 'B', span: 1, voci: ['mp-estimate'] }
    ];
    const v = B.valida(moduli);
    assert.ok(v.avvisi.some(a => /solo su una riga/.test(a)));
});

/* ⚠️ Il master di prova è `mp-syn-on` e non più `mp-quiz-on`: quello è diventato
   un master DERIVATO (si accende dai figli), quindi per lui l'avviso è falso —
   vedi il test subito sotto. Serve un master che stia davvero a schermo. */
test('un figlio staccato dal suo master è un avviso (resterebbe inerte)', () => {
    const moduli = [
        { id: 's', titolo: 'Sintesi', span: 2, master: 'mp-syn-on', voci: ['mp-src-pdf'] },
        { id: 'z', titolo: 'Altro', span: 2, voci: ['mp-syn-audio'] }
    ];
    const v = B.valida(moduli);
    assert.ok(v.avvisi.some(a => /senza avere effetto/.test(a)));
});

/* ═══ I MASTER DERIVATI ═══════════════════════════════════════════════════════
   I check «generici» (Quiz e flashcard · Fogli nodi) non stanno più a schermo:
   spuntare «Scelta multipla» dice già che i quiz si generano. Ma il master resta
   un DATO — il renderer lo monta nascosto — perché `_readConfig()` della pipeline
   deve continuare a essere l'unico posto che legge la configurazione. */
test('un master si deriva dai figli montati, e non conta come voce dimenticata', () => {
    const d = B.mastersDerivati(B.MODULI);
    const ids = d.map(x => x.id).sort();
    assert.deepStrictEqual(ids, ['mp-ns-on', 'mp-quiz-on']);
    const quiz = d.find(x => x.id === 'mp-quiz-on');
    /* «Domande aperte» (11/8) è il quarto figlio: sta nel box Quiz perché per il
       docente è la stessa scelta, e quindi deve accendere lo stesso master —
       senza, spuntarla da sola lascerebbe `mp-quiz-on` spento e la pipeline non
       genererebbe niente. */
    /* dal 19/8 i generi sono TRE: la pipeline non produce più quiz Vero/Falso
       (la spec resta viva solo per il gesto singolo di ELABORA). */
    assert.deepStrictEqual(quiz.da.slice().sort(), ['mp-qt-fc', 'mp-qt-mc', 'mp-qt-open']);
    const v = B.valida(B.MODULI);
    assert.ok(!v.fuori.includes('mp-quiz-on'), 'un master derivato è montato, nascosto');
    assert.ok(!v.fuori.includes('mp-ns-on'));
});

test('un master NON si deriva se nessuno dei suoi figli è a schermo', () => {
    const moduli = [{ id: 'x', titolo: 'X', span: 4, voci: ['mp-src-pdf'] }];
    assert.deepStrictEqual(B.mastersDerivati(moduli), [],
        'senza figli non c\'è niente da accendere: la sezione è davvero fuori');
});

test('un figlio di master derivato NON produce l\'avviso «resta senza effetto»', () => {
    /* i figli quiz e quelli dei fogli nodi stanno in moduli diversi e senza il
       loro master: prima era un avviso, ora è la forma normale */
    const v = B.valida(B.MODULI);
    assert.ok(!v.avvisi.some(a => /Quiz e flashcard/.test(a) && /senza avere effetto/.test(a)));
    assert.ok(!v.avvisi.some(a => /Fogli nodi/.test(a) && /senza avere effetto/.test(a)));
});

/* ═══ IL GATE DI «GENERA MATERIALI» ═══════════════════════════════════════════
   Le due forme complete di destinatario, che sono anche le due forme di cartella:
   classe+materia → Mappe/<classe>/<materia>/ · allievo → Allievi/<nome>/Mappe/ */
test('il gate chiede CHI, e prima di quello non serve altro', () => {
    assert.deepStrictEqual(B.gate({ chi: '', materia: '', materieDisponibili: 3 }),
        { ok: false, manca: 'chi' });
    assert.deepStrictEqual(B.gate({}), { ok: false, manca: 'chi' });
});

test('una classe senza materia NON apre il gate; con la materia sì', () => {
    assert.strictEqual(B.gate({ chi: 'c:cls_1', materia: '', materieDisponibili: 3 }).manca, 'cosa');
    assert.strictEqual(B.gate({ chi: 'c:cls_1', materia: 'Storia', materieDisponibili: 3 }).ok, true);
});

test('con un ALLIEVO la materia è facoltativa: la sua cartella non ha quel livello', () => {
    assert.strictEqual(B.gate({ chi: 's:0', materia: '', materieDisponibili: 3 }).ok, true);
});

test('senza materie da proporre il gate non le pretende (nessun vicolo cieco)', () => {
    /* profilo insegnante vuoto e classe senza materie: bloccare su un dato che
       l'app non sa fornire lascerebbe il bottone spento per sempre */
    assert.strictEqual(B.gate({ chi: 'c:cls_1', materia: '', materieDisponibili: 0 }).ok, true);
});

test('la scala tipografica ha TRE corpi dichiarati, non quattro', () => {
    const corpi = Object.keys(B.SCALA).map(k => B.SCALA[k].px);
    assert.strictEqual(corpi.length, 3);
    assert.strictEqual(new Set(corpi).size, 3, 'tre corpi distinti: niente 12 contro 12,5');
});

test('ogni voce dell\'inventario ha un id, un\'etichetta e un tipo', () => {
    B.VOCI.forEach(v => {
        assert.ok(v.id && v.et && v.tipo, 'voce incompleta: ' + JSON.stringify(v));
    });
});

test('forma() conta righe e moduli della composizione corrente', () => {
    const f = B.forma(B.MODULI);
    assert.strictEqual(f.colonne, 4);
    assert.strictEqual(f.moduli, B.MODULI.length);
    assert.ok(f.righe >= 2, '7 moduli da 1 colonna su 4 → almeno 2 righe');
});

/* ═══ IL VELO E IL MODALE: il numero che è costato un'ora ═════════════════════
   Il 4/8 una generazione è rimasta appesa 5 ore senza spendere un token. Catena:
   la pipeline alza `#loading-overlay` (z 9999) e POI chiama `startGeneration`,
   che apre il modale «Per quale classe e disciplina?» a z 9992 — sette punti
   sotto, quindi invisibile e non cliccabile. La sua promise non si risolveva mai,
   il `finally` di `Pipeline.run` non girava e `_running` restava true: da lì in
   poi nessuna generazione ripartiva, per nessuna classe.
   Questo test legge i due numeri dal codice VERO. Non prova l'impilamento a
   schermo (serve un browser) — pianta la sola cosa che si può piantare qui: il
   ripiego del modale deve stare SOPRA il velo. Se qualcuno alza il velo o
   abbassa il modale, si rompe qui invece che in mano a un docente. */
const fs = require('fs');
const path = require('path');

test('il modale scritto a mano sta SOPRA il velo di caricamento', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'style.css'), 'utf8');
    const blocco = css.match(/#loading-overlay\s*\{[^}]*\}/);
    assert.ok(blocco, 'blocco #loading-overlay non trovato in style.css');
    const zVelo = parseInt((blocco[0].match(/z-index:\s*(\d+)/) || [])[1], 10);
    assert.ok(zVelo > 0, 'z-index del velo non leggibile');

    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mappai-live-classes.js'), 'utf8');
    const fn = js.match(/function _zSopraMotore\(\)\s*\{[\s\S]*?\n  \}/);
    assert.ok(fn, 'funzione _zSopraMotore non trovata');
    const zModale = parseInt((fn[0].match(/return\s+(\d+);/) || [])[1], 10);
    assert.ok(zModale > 0, 'ripiego di _zSopraMotore non leggibile');

    assert.ok(zModale > zVelo,
        'il modale (' + zModale + ') deve stare sopra il velo di caricamento (' + zVelo +
        '): sotto, la generazione resta appesa su un modale che non si vede');
});

/* ═══ La CATENA DEI PERCHÉ è un materiale a sé (5/8) ══════════════════════════
   Era un'opzione dei fogli nodi. Se fosse rimasta fra i derivanti di `mp-ns-on`,
   spuntare la catena avrebbe accesso anche i fogli — e il docente si sarebbe
   trovato nella cartella un PDF di fogli nodi che non ha chiesto. */
test('la catena non è figlia dei fogli nodi né fra i loro derivanti', () => {
    const causal = B.voce('mp-ns-causal');
    assert.ok(causal, 'la voce esiste');
    assert.strictEqual(causal.figlioDi, undefined, 'nessun master sopra di lei');
    assert.strictEqual(causal.chiave, 'causal', 'chiave di config a sé, non nodesheet.causal');
    const ns = B.voce('mp-ns-on');
    assert.ok(!ns.derivato.includes('mp-ns-causal'),
        'spuntare la catena NON deve accendere i fogli nodi');
});

test('nella composizione la catena c\'è, e i fogli nodi restano derivati dai loro generi', () => {
    const dentro = B.MODULI.some(m => B.vociDi(m).some(v => v.id === 'mp-ns-causal'));
    assert.ok(dentro, 'la catena è montata');
    const d = B.mastersDerivati(B.MODULI).find(x => x.id === 'mp-ns-on');
    assert.ok(d, 'i fogli nodi si derivano ancora');
    assert.ok(!d.da.includes('mp-ns-causal'));
});

/* ⚠️ Il nero di COSTRUISCI è #404040 (5/8, scelta di Giacomo). Sul blu non si
   userebbe (2,27:1) — lì il segno resta bianco, e non passa da questi moduli. */
test('il testo scuro dei moduli è #404040, e resta leggibile su ogni fondo', () => {
    const scuri = B.MODULI.filter(m => (B.stileDi(m).testo || '').toLowerCase() === '#404040');
    /* erano sei coi quattro riquadri chiari delle opzioni; dall'11/8 quelli
       stanno nella vista estesa (fondo scuro, testo bianco) e restano il box
       giallo del contesto e l'azione verde */
    assert.ok(scuri.length >= 2, 'il box giallo e l\'azione verde');
    scuri.forEach(m => {
        const st = B.stileDi(m);
        const k = B.contrasto(st.bg, st.testo);
        assert.ok(k >= 4.5, 'modulo «' + (m.titolo || m.id) + '»: ' + k + ':1 sotto soglia');
    });
    assert.ok(!B.MODULI.some(m => (B.stileDi(m).testo || '').toLowerCase() === '#0b0b0b'),
        'nessun modulo usa più il nero pieno');
});

/* ═══ LE RIGHE SOPRA IL BENTO (5/8) ══════════════════════════════════════════
   Fonti e genere di mappa erano impaginate con due numeri scritti nel CSS
   (`340px | 1fr`): «due colonne» non voleva dire niente e non si poteva
   verificare. Ora sono un dato, usano la stessa griglia a 4 colonne del bento —
   così le colonne si allineano ai riquadri sotto — e gli span devono chiuderle. */
test('le due righe sopra il bento chiudono le quattro colonne', () => {
    assert.deepStrictEqual(B.validaRighe(B.RIGHE), [], 'nessuna riga lascia bianco a destra');
    B.RIGHE.forEach(r => {
        assert.strictEqual(r.span[0] + r.span[1], B.COLONNE, r.id + ': ' + r.span.join('+'));
    });
});

test('le proporzioni sono quelle chieste: fonti 2+2, genere 1+3', () => {
    assert.deepStrictEqual(B.riga('mn-riga-fonti').span, [2, 2]);
    assert.deepStrictEqual(B.riga('mn-riga-genere').span, [1, 3]);
});

test('una riga che non chiude le colonne è un ERRORE, non un avviso', () => {
    const rotte = [{ id: 'x', span: [2, 1], nota: 'prova' }];
    const e = B.validaRighe(rotte);
    assert.strictEqual(e.length, 1);
    assert.ok(/3 colonne su 4|bianco/.test(e[0]));
    assert.strictEqual(B.validaRighe([{ id: 'y', span: [0, 4], nota: 'prova' }]).length, 1,
        'uno span a zero non è una riga');
});

test('senza contenuto a destra la sinistra si distende, e non oltre le colonne', () => {
    B.RIGHE.forEach(r => {
        const v = r.vuotoASinistra || r.span[0];
        assert.ok(v >= r.span[0], r.id + ': il vuoto non può stringere');
        assert.ok(v <= B.COLONNE, r.id + ': non può superare le colonne');
    });
    /* ⚠️ Dal 5/8 vale 2, non 4 (decisione di Giacomo): bottone ed elenco ci sono
       da subito, anche a elenco vuoto — la prima fase del mega-bento non cambia
       impaginazione al primo file. La leva resta perché è un dato. */
    assert.strictEqual(B.riga('mn-riga-fonti').vuotoASinistra, 2,
        'la riga delle fonti non cambia forma quando arriva il primo file');
});

test('ogni riga dichiara dove prendere i suoi due pezzi', () => {
    B.RIGHE.forEach(r => {
        assert.ok(r.sinistra && r.destra, r.id + ': selettori mancanti');
        assert.ok(r.nota && r.nota.length > 10, r.id + ': senza nota nessuno sa cos\'è');
    });
});

/* ═══ I BOX NASCONDIBILI: la vista estesa (5/8) ════════════════════════════════
   Il mega-bento resta com'è in entrambe le viste; la combo rivela i riquadri col
   fondo scuro, che stanno in fondo. Il marcatore è il FONDO e non un flag nuovo:
   così la distinzione si vede mentre si compone in officina. */
test('un modulo col fondo scuro è nascondibile, uno chiaro no', () => {
    assert.strictEqual(B.nascondibile({ id: 'x' }), true, 'senza stile prende il fondo scuro di base');
    assert.strictEqual(B.nascondibile({ id: 'x', stile: { bg: '#404040' } }), true);
    assert.strictEqual(B.nascondibile({ id: 'x', stile: { bg: '#f1f4f8' } }), false);
    assert.strictEqual(B.nascondibile({ id: 'x', stile: { bg: '#FFF700' } }), false);
    assert.strictEqual(B.nascondibile({ id: 'x', stile: { bg: '#404040'.toUpperCase() } }), true,
        'il confronto non dipende da maiuscole/minuscole');
});

test('nella composizione il mega-bento è STABILE e gli strumenti sono extra', () => {
    const stabili = B.MODULI.filter(m => !B.nascondibile(m)).map(m => m.id);
    const extra = B.MODULI.filter(B.nascondibile).map(m => m.id);
    /* ⚠️ Dall'11/8 la schermata d'ingresso è SEI box (Giacomo: «meno box, meno
       attrito»): i quattro pezzi della prima sezione + il box giallo del
       contesto + l'azione che conclude. Le opzioni della generazione — preset,
       quiz, fogli nodi, fonte&sintesi — sono passate alla vista estesa, e la
       configurazione di partenza la dice ora il preset «Default».
       Restano MONTATE nel DOM: `_readConfig()` legge i loro campi. */
    assert.deepStrictEqual(stabili,
        ['upload', 'elenco', 'genere', 'genere-opz', 'ctx', 'azioni']);
    /* «output» (20/8): il box a tutta riga con le spunte di CHE COSA si genera,
       primo degli extra — è l'unica decisione da prendere per un DOSSIER. */
    assert.deepStrictEqual(extra,
        ['output', 'preset', 'quiz', 'ns', 'src', 'multi', 'modalita', 'focus', 'macroaree', 'input', 'input-box', 'testo']);
});

test('i box extra stanno DOPO il mega-bento, e quello che cresce è l\'ultimo', () => {
    const ids = B.MODULI.map(m => m.id);
    const primoExtra = ids.findIndex(id => B.nascondibile(B.MODULI.find(m => m.id === id)));
    const ultimoStabile = ids.reduce((acc, id, i) =>
        B.nascondibile(B.MODULI.find(m => m.id === id)) ? acc : i, -1);
    assert.ok(primoExtra > ultimoStabile,
        'un box extra in mezzo al mega-bento lo spezzerebbe quando la combo lo rivela');
    /* il box che può crescere è l'ULTIMO: un testo incollato non deve spostare
       niente di quello che sta sopra — è la ragione per cui la sua riga sta in fondo */
    /* dal 5/8 quello che cresce è l'AREA DI SCRITTURA del testo libero: l'elenco
       delle fonti è diventato un elenco vero, con righe di altezza fissa */
    const cresce = B.VOCI.filter(v => v.cresce).map(v => v.id);
    assert.deepStrictEqual(cresce, ['mn-testo']);
    const modCresce = B.MODULI.filter(m => B.vociDi(m).some(v => v.base && v.base.cresce));
    assert.strictEqual(modCresce.length, 1);
    assert.strictEqual(B.MODULI[B.MODULI.length - 1].id, modCresce[0].id,
        'il box che cresce deve essere l\'ultimo della composizione');
});

/* ═══ I DUE BOX DELLE FONTI NON-PDF (5/8) ═════════════════════════════════════
   Erano uno solo, e faceva due mestieri: mostrare che cosa è stato caricato e dare
   un posto dove scrivere. Ora l'elenco è un elenco (righe come quelle dei PDF) e
   l'area di scrittura è un box suo, largo tutta la riga. */
test('l\'elenco delle fonti è un elenco, l\'area di scrittura è un\'altra cosa', () => {
    const el = B.voce('mn-input-box');
    assert.strictEqual(el.sposta, '#sources-container');
    assert.strictEqual(el.forma, 'elenco');
    assert.ok(!el.cresce, 'un elenco ha righe di altezza fissa: non cresce');
    assert.ok(/URL|YouTube|Audio/i.test(el.seFuori), 'senza il box quelle fonti sono inutilizzabili');

    const tx = B.voce('mn-testo');
    assert.ok(tx, 'la voce del testo libero esiste');
    assert.strictEqual(tx.raccoglie, 'textarea', 'raccoglie le righe con una textarea');
    assert.strictEqual(tx.sposta, undefined, 'non c\'è un elemento fisso da spostare: nasce dopo');
    assert.strictEqual(tx.cresce, true, 'fino a 30 righe, poi scorre');
    assert.ok(tx.vuoto && tx.vuoto.length > 10, 'da vuoto deve dire a che serve');
});

test('il box del testo libero è largo tutta la riga', () => {
    const m = B.MODULI.find(x => x.id === 'testo');
    assert.ok(m, 'il modulo esiste');
    assert.strictEqual(m.span, B.COLONNE, 'un campo di scrittura stretto non serve a niente');
    assert.deepStrictEqual(B.vociDi(m).map(v => v.id), ['mn-testo']);
});

/* ═══ LA FIRMA della composizione (5/8) ═══════════════════════════════════════
   L'Officina salva il lavoro in localStorage e al caricamento lo preferisce al
   file: giusto finché si compone, sbagliato quando la composizione del CODICE è
   cambiata sotto — si ritoccava una versione vecchia credendo che le correzioni
   non arrivassero. La firma è quello che permette di accorgersene. */
test('la firma cambia se cambia la STRUTTURA', () => {
    const base = [{ id: 'a', span: 2, altezza: 130, voci: ['mp-qt-mc'] }];
    const f = B.firma(base);
    assert.match(f, /^c[0-9a-z]+$/, 'firma corta e stampabile');
    assert.notStrictEqual(f, B.firma([{ id: 'a', span: 3, altezza: 130, voci: ['mp-qt-mc'] }]), 'span');
    assert.notStrictEqual(f, B.firma([{ id: 'a', span: 2, altezza: 200, voci: ['mp-qt-mc'] }]), 'altezza');
    assert.notStrictEqual(f, B.firma([{ id: 'b', span: 2, altezza: 130, voci: ['mp-qt-mc'] }]), 'id');
    assert.notStrictEqual(f, B.firma([{ id: 'a', span: 2, altezza: 130, voci: ['mp-qt-fc'] }]), 'voci');
    assert.notStrictEqual(f, B.firma(base.concat([{ id: 'z', span: 2, voci: [] }])), 'un modulo in più');
});

test('la firma NON cambia per i colori: si ritoccano di continuo e non sono struttura', () => {
    const a = [{ id: 'a', span: 2, altezza: 130, voci: ['mp-qt-mc'], stile: { bg: '#f1f4f8' } }];
    const b = [{ id: 'a', span: 2, altezza: 130, voci: ['mp-qt-mc'], stile: { bg: '#404040' } }];
    assert.strictEqual(B.firma(a), B.firma(b));
});

test('la firma è deterministica e distingue l\'ORDINE dei moduli', () => {
    assert.strictEqual(B.firma(B.MODULI), B.firma(B.MODULI), 'due letture, stessa firma');
    const scambiati = [B.MODULI[1], B.MODULI[0]].concat(B.MODULI.slice(2));
    assert.notStrictEqual(B.firma(B.MODULI), B.firma(scambiati),
        'l\'ordine conta: è quello che decide le righe della griglia');
});

/* ═══ I CONTROLLI GRANULARI DEL MODULO (5/8) ══════════════════════════════════
   Le quattro leve chieste da Giacomo: colori dei bottoni interni, posizione delle
   etichette, colonna che le allinea, disposizione delle voci. La regola che tiene
   insieme tutto è che una leva non toccata non deve cambiare NIENTE: per questo
   `presentazione()` emette solo ciò che è stato scelto, e i test lo piantano. */
test('senza scelte, layout e bottoni tornano i valori di partenza', () => {
    const L = B.layoutDi({ id: 'x' });
    assert.deepStrictEqual(L, B.LAYOUT_BASE, 'un modulo senza `layout` non è un caso speciale');
    const P = B.presentazione({ id: 'x' });
    assert.strictEqual(P.vars, '', 'niente variabili → il foglio resta sul suo fallback');
    assert.strictEqual(P.attr, '', 'niente attributi → le regole nuove non lo agganciano nemmeno');
});

test('presentazione emette SOLO ciò che è stato scelto', () => {
    const m = { id: 'x', layout: { colonneVoci: 3, etLarghezza: 90 }, bottoni: { bg: '#ffffff' } };
    const P = B.presentazione(m);
    assert.match(P.vars, /--mn-col-n:3;/);
    assert.match(P.vars, /--mn-et-w:90px;/);
    assert.match(P.vars, /--mn-btn-bg:#ffffff;/);
    assert.ok(!/--mn-col-min/.test(P.vars), 'il minimo di colonna non è stato toccato');
    assert.ok(!/--mn-btn-txt/.test(P.vars), 'il testo dei bottoni resta derivato');
    assert.match(P.attr, /data-voci-n="3"/);
    assert.match(P.attr, /data-et-w="1"/);
    assert.match(P.attr, /data-btn="1"/);
});

test('un valore fuori scala torna al default invece di finire nel CSS', () => {
    assert.strictEqual(B.layoutDi({ layout: { colonneVoci: 9 } }).colonneVoci, 'auto');
    assert.strictEqual(B.layoutDi({ layout: { colonneVoci: 0 } }).colonneVoci, 'auto');
    assert.strictEqual(B.layoutDi({ layout: { etLarghezza: -20 } }).etLarghezza, 0);
    assert.strictEqual(B.layoutDi({ layout: { etichette: 'diagonale' } }).etichette, 'sinistra');
    assert.strictEqual(B.layoutDi({ layout: { colonneVoci: '2' } }).colonneVoci, 2, 'il JSON può portarlo come stringa');
});

/* ⚠️ Il contrasto dei bottoni si misura sul fondo COMPOSITO: il foglio dà loro
   una tinta al 14% del colore del testo, quindi «testo sul fondo del riquadro»
   sarebbe un numero che a schermo non si vede. Verificato contro la misura reale:
   bianco al 14% su #404040 dà #5b5b5b. */
test('componi() dà il colore che si VEDE, non quello dichiarato', () => {
    assert.strictEqual(B.componi('#404040', '#ffffff', 14), '#5b5b5b');
    assert.strictEqual(B.componi('#000000', '#ffffff', 0), '#000000');
    assert.strictEqual(B.componi('#000000', '#ffffff', 100), '#ffffff');
    assert.strictEqual(B.componi('rosso', '#fff', 14), null, 'un hex sbagliato non fa esplodere il banco');
});

test('i colori dei bottoni si derivano dal modulo finché nessuno li sceglie', () => {
    const d = B.bottoniDi({ id: 'x' });                       // fondo scuro di base
    assert.strictEqual(d.bg, '#5b5b5b', 'il fondo composito del foglio');
    assert.strictEqual(d.testo, B.STILE_BASE.testo);
    assert.strictEqual(d.hoverBg, B.BOTTONI_DERIVA.hoverBg);
    assert.deepStrictEqual(d.scelti, { bg: false, testo: false, hoverBg: false, hoverTesto: false });
    assert.strictEqual(B.haBottoniScelti({ id: 'x' }), false);
    const s = B.bottoniDi({ id: 'x', bottoni: { bg: '#ffffff' } });
    assert.strictEqual(s.bg, '#ffffff');
    assert.strictEqual(s.testo, B.STILE_BASE.testo, 'quello che non si sceglie resta derivato');
    assert.strictEqual(B.haBottoniScelti({ id: 'x', bottoni: { bg: '#ffffff' } }), true);
});

test('bottoni interni illeggibili: avviso a riposo E al passaggio', () => {
    /* il difetto vero: testo del colore del fondo — 1:1, si vedeva solo in hover */
    const nero = [{ id: 'x', titolo: 'X', span: 4, voci: ['mn-multipass'],
                    bottoni: { bg: '#404040', testo: '#404040' } }];
    assert.ok(B.valida(nero).avvisi.some(a => /bottoni interni/.test(a)), 'a riposo');
    /* e l'hover non deve spostare il difetto: bianco su verde fa 1,6:1 */
    const hov = [{ id: 'y', titolo: 'Y', span: 4, voci: ['mn-multipass'],
                   bottoni: { hoverBg: '#41e6aa', hoverTesto: '#ffffff' } }];
    assert.ok(B.valida(hov).avvisi.some(a => /al passaggio/.test(a)));
});

test('i bottoni derivati della composizione stanno tutti sopra 4,5:1', () => {
    const v = B.valida(B.MODULI);
    assert.ok(!v.avvisi.some(a => /bottoni interni|al passaggio/.test(a)),
        'nessun modulo lascia bottoni illeggibili — è il difetto del 5/8');
});

test('una colonna di voci troppo stretta è un avviso, con il numero', () => {
    /* cinque voci per riga in un riquadro da UNA colonna: 47px l'una */
    const stretto = [{ id: 'x', titolo: 'Stretto', span: 1, voci: ['mn-multipass'],
                       layout: { colonneVoci: 5 } }];
    const v = B.valida(stretto);
    assert.ok(v.avvisi.some(a => /px: sotto i 120px/.test(a)));
    /* lo stesso riquadro largo 4 colonne ci sta */
    const largo = [{ id: 'x', titolo: 'Largo', span: 4, voci: ['mn-multipass'],
                     layout: { colonneVoci: 5 } }];
    assert.ok(!B.valida(largo).avvisi.some(a => /sotto i 120px/.test(a)));
});

test('largezzaVoce conta le colonne come le conta il CSS', () => {
    assert.strictEqual(B.largezzaVoce({ span: 4, layout: { colonneVoci: 'colonna' } }),
        Math.round(B.largezzaModulo({ span: 4 }) - B.GEOM.padding), 'in colonna la voce prende tutto');
    const auto1 = B.largezzaVoce({ span: 1 });
    assert.ok(auto1 > 200, 'un riquadro da una colonna sta sotto il minimo di 220 → una colonna sola');
    const auto4 = B.largezzaVoce({ span: 4 });
    assert.ok(auto4 >= 220 && auto4 < 320, 'a 4 colonne ci stanno cinque voci da ~230px');
});

test('una leva che non può avere effetto viene detta, non taciuta', () => {
    const m1 = [{ id: 'x', titolo: 'X', span: 4, voci: ['mn-multipass'],
                  layout: { etichette: 'sopra', etLarghezza: 90 } }];
    assert.ok(B.valida(m1).avvisi.some(a => /non ha effetto: con le etichette SOPRA/.test(a)));
    const m2 = [{ id: 'y', titolo: 'Y', span: 4, voci: ['mn-multipass'],
                  layout: { colonneVoci: 2, colMin: 300 } }];
    assert.ok(B.valida(m2).avvisi.some(a => /minimo di colonna .* non ha effetto/.test(a)));
});

/* ═══ LA PRIMA SEZIONE ENTRA NELLA COMPOSIZIONE (5/8) ═════════════════════════
   Upload, elenco delle fonti, MM/KG e le sue opzioni erano impaginati da `RIGHE`,
   cioè fuori dal dato: l'officina mostrava una schermata e l'app un'altra. */
test('i quattro pezzi della prima sezione sono voci componibili', () => {
    ['mn-upload', 'mn-elenco', 'mn-genere', 'mn-genere-opz'].forEach(id => {
        const v = B.voce(id);
        assert.ok(v, 'manca la voce ' + id);
        assert.strictEqual(v.tipo, 'strumento');
        assert.ok(v.sposta, id + ': senza selettore non si sa cosa montare');
        assert.strictEqual(v.grande, true, id + ': non va compattato a riga come una voce qualunque');
    });
});

test('i quattro moduli della prima sezione sono NUDI e chiudono le due righe', () => {
    const primi = B.MODULI.slice(0, 4);
    assert.deepStrictEqual(primi.map(m => m.id), ['upload', 'elenco', 'genere', 'genere-opz']);
    primi.forEach(m => {
        assert.strictEqual(m.nuda, true, m.id + ': un riquadro attorno a un box che è già un box');
        assert.strictEqual(m.stile, undefined, m.id + ': fondo e testo sono del pezzo, non del modulo');
    });
    /* gli span sono quelli delle righe storiche: l'impaginazione a schermo non cambia */
    assert.strictEqual(primi[0].span + primi[1].span, B.COLONNE, 'upload 2 + elenco 2');
    assert.strictEqual(primi[2].span + primi[3].span, B.COLONNE, 'genere 1 + opzioni 3');
});

test('un modulo NUDO non è mai nascondibile: non ha un fondo da leggere', () => {
    /* senza questa regola i quattro moduli della prima sezione, che stile non ne
       hanno, prenderebbero il fondo scuro di base e sparirebbero dalla vista
       compatta — cioè la schermata d'ingresso resterebbe senza il bottone del PDF */
    assert.strictEqual(B.nascondibile({ id: 'x', nuda: true }), false);
    assert.strictEqual(B.nascondibile({ id: 'x', nuda: true, stile: { bg: '#404040' } }), false);
    B.MODULI.slice(0, 4).forEach(m => assert.strictEqual(B.nascondibile(m), false, m.id));
});

test('un modulo nudo NON è un modulo di azioni (due cose diverse)', () => {
    assert.strictEqual(B.soloAzioni(B.MODULI[0]), false, 'upload è nudo ma non è un bottone');
    const azioni = B.MODULI.find(m => m.id === 'azioni');
    assert.strictEqual(B.soloAzioni(azioni), true, 'il modulo che conclude resta il bottone');
});

/* ═══ I POP-UP INFORMATIVI (5/8) ══════════════════════════════════════════════
   Ogni opzione deve spiegarsi da sola: passando il mouse, dopo 950ms, compare che
   cosa fa. Il testo sta nel DATO e si riscrive in officina — scritto nel renderer
   sarebbe una spiegazione che nessuno può correggere senza toccare il codice. */
test('ogni voce dell\'inventario ha il suo pop-up', () => {
    const senza = B.VOCI.filter(v => !v.aiuto || v.aiuto.length < 15).map(v => v.id);
    assert.deepStrictEqual(senza, [], 'voci senza aiuto: si spiegherebbero da nessuna parte');
});

test('l\'aiuto dice che cosa FA, non che cosa succede se manca', () => {
    /* `seFuori` risponde a una domanda diversa (che cosa costa non montarla) e
       nel fumetto non servirebbe a niente: sono due campi apposta */
    B.VOCI.forEach(v => assert.notStrictEqual(v.aiuto, v.seFuori, v.id));
});

test('il ritardo del fumetto è 950ms, dichiarato nel codice', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mappai-menu-hubs.js'), 'utf8');
    const m = js.match(/const ATTESA = (\d+);/);
    assert.ok(m, 'costante ATTESA non trovata in MappAITips');
    assert.strictEqual(parseInt(m[1], 10), 950);
});

/* ═══ GLI SWITCH: si monta la RIGA, non mezzo interruttore ════════════════════
   Puntando al singolo bottone (`#multipass-on`) nel bento arrivava metà switch,
   senza nome e senza spiegazione: a schermo si leggeva «ON», «MappAI», «A». */
test('i controlli a due facce montano la riga intera', () => {
    ['mn-multipass', 'mn-mmlogic', 'mn-autodepth', 'mn-pipeline'].forEach(id => {
        const v = B.voce(id);
        assert.ok(v, 'manca ' + id);
        assert.match(v.sposta, /^#row-/, id + ': deve montare la riga, non un bottone');
    });
});

test('le due profondità si distinguono dal nome', () => {
    const logica = B.voce('mn-mmlogic').et.toLowerCase();
    const prof = B.voce('mn-autodepth').et.toLowerCase();
    assert.ok(/adattiva/.test(logica), 'la logica dei rami nomina «Adattiva»');
    assert.ok(/profondit/.test(prof) && !/profondit/.test(logica),
        'una sola delle due si chiama «profondità»: erano indistinguibili');
    assert.ok(/mostra fino a/i.test(B.voce('mn-autodepth').aiuto),
        'l\'aiuto deve dire che NON è il filtro di vista');
});

/* ═══ IL TITOLO DEL POSTO, IN TRE STATI (5/8) ═════════════════════════════════
   `mostraEt` e `nascondiEt` erano due booleani opposti nati a due giorni di
   distanza: uno stato che si poteva scrivere in modo contraddittorio. Una leva
   sola — auto · sempre · mai — e i due flag restano leggibili per non invalidare
   le composizioni già salvate. */
test('il titolo del posto ha tre stati, e «auto» è il default', () => {
    assert.strictEqual(B.titoloPosto({ id: 'x', base: {} }), 'auto');
    assert.strictEqual(B.titoloPosto({ id: 'x', titoloPosto: 'mai', base: {} }), 'mai');
    assert.strictEqual(B.titoloPosto({ id: 'x', base: { titoloPosto: 'sempre' } }), 'sempre');
});

test('i due flag storici restano leggibili', () => {
    assert.strictEqual(B.titoloPosto({ id: 'x', nascondiEt: true, base: {} }), 'mai');
    assert.strictEqual(B.titoloPosto({ id: 'x', mostraEt: true, base: {} }), 'sempre');
    /* la scelta della VOCE vince su quella dell'inventario: è il caso di chi
       compone e vuole rimettere un titolo che la voce dichiara «mai» */
    assert.strictEqual(B.titoloPosto({ id: 'x', titoloPosto: 'auto', base: { nascondiEt: true } }), 'auto');
});

test('i due box delle fonti non scrivono nessun titolo', () => {
    ['mn-input-box', 'mn-testo'].forEach(id => {
        assert.strictEqual(B.titoloPosto({ id: id, base: B.voce(id) }), 'mai', id);
    });
});

test('la firma cambia col LAYOUT (è struttura) e non coi colori dei bottoni', () => {
    const base = [{ id: 'a', span: 2, voci: ['mp-qt-mc'] }];
    assert.notStrictEqual(B.firma(base),
        B.firma([{ id: 'a', span: 2, voci: ['mp-qt-mc'], layout: { colonneVoci: 2 } }]),
        'la disposizione decide quante voci stanno per riga: è struttura');
    assert.strictEqual(B.firma(base),
        B.firma([{ id: 'a', span: 2, voci: ['mp-qt-mc'], bottoni: { bg: '#ffffff' } }]),
        'una tinta è un ritocco, come il fondo del modulo');
});

test('una voce in forma di oggetto conta come il suo id', () => {
    assert.strictEqual(
        B.firma([{ id: 'a', voci: ['mp-angle'] }]),
        B.firma([{ id: 'a', voci: [{ id: 'mp-angle', et: 'Altro nome', w: 200 }] }]),
        'riscrivere un\'etichetta non è un cambio di struttura'
    );
});


/* ══ IL BOX «PIÙ SET PER ANGOLO» (19/8) ═══════════════════════════════════════
   Sta nella vista estesa e a tutta riga, SOTTO i quattro box delle opzioni:
   moltiplica per sette il costo di ciò che sta nel box «Quiz», quindi gli sta
   sotto e non dentro. */

test('«Più set per angolo» è un box suo, a tutta riga, nella vista estesa', () => {
    const m = B.MODULI.find(x => x.id === 'multi');
    assert.ok(m, 'il box esiste nella composizione');
    assert.strictEqual(m.span, 4, 'a tutta riga: chiude la griglia da solo');
    assert.strictEqual(B.nascondibile(m), true, 'è un\'impostazione: vive nella vista estesa');
    const righe = B.valida(B.MODULI).righe.map(r => r.map(x => x.id).join('+'));
    assert.ok(righe.indexOf('multi') >= 0, 'una riga tutta sua');
    assert.ok(righe.indexOf('multi') > righe.indexOf('preset+quiz+ns+src'),
        'sta SOTTO i quattro box delle opzioni: moltiplica il loro costo');
});

test('il box porta SOLO una casella per angolo: i generi stanno in «Output automatici»', () => {
    const ids = B.vociDi(B.MODULI.find(x => x.id === 'multi')).map(v => v.id);
    assert.ok(!B.voce('mp-multi-open') && !B.voce('mp-multi-mc'), 'i due generi non si ripetono qui (4/9)');
    const angoli = ids;
    assert.strictEqual(angoli.length, 7, 'una casella per angolo (senza «misto»)');
    angoli.forEach(id => assert.ok(id.indexOf('mp-ang-') === 0, id + ' non è una casella-angolo'));
    assert.ok(!B.voce('mp-multi-on'), 'l\'interruttore generale non c\'è più: spegnere le caselle È lo spegnimento');
});

test('la tendina «Angolo» è uscita dal box Quiz: due comandi per la stessa domanda', () => {
    const quiz = B.MODULI.find(x => x.id === 'quiz');
    assert.ok(B.vociDi(quiz).every(v => v.id !== 'mp-angle'));
    assert.ok(B.voce('mp-angle'), 'resta nell\'inventario, con il suo `seFuori` che spiega dove si scelgono gli angoli');
});


test('la pipeline non genera più quiz Vero/Falso (19/8)', () => {
    assert.ok(!B.voce('mp-qt-tf'), 'la casella è uscita dall\'inventario, non solo dalla composizione');
    /* Dal 20/8 le spunte dei generi stanno nel box «Output automatici» (a tutta
       riga, coi due della sintesi); nel box «Quiz» resta il PARAMETRO. */
    const out = B.MODULI.find(x => x.id === 'output');
    assert.deepStrictEqual(B.vociDi(out).map(v => v.id),
        ['mp-qt-mc', 'mp-qt-fc', 'mp-qt-open', 'mp-syn-on', 'mp-syn-audio']);
    const quiz = B.MODULI.find(x => x.id === 'quiz');
    assert.deepStrictEqual(B.vociDi(quiz).map(v => v.id), ['mp-perbranch']);
});

/* ═══ IL BOX «OUTPUT AUTOMATICI» (20/8) ═══════════════════════════════════════
   Le spunte sono SPOSTATE, non duplicate (inv. 6): gli id restano quelli che
   `_readConfig()` legge, e nessuna voce può stare in due moduli. */
test('output automatici: spostate, non duplicate — e la famiglia resta legata', () => {
    const v = B.valida(B.MODULI);
    assert.strictEqual(v.errori.length, 0, v.errori.join(' | '));
    /* il master del quiz resta DERIVATO: spuntare «Flashcard» lo accende da sé */
    const d = B.mastersDerivati(B.MODULI).map(x => x.id).sort();
    assert.deepStrictEqual(d, ['mp-ns-on', 'mp-quiz-on']);
    /* la fonte-immagine NON ha più una voce sua (20/8 sera): le foto entrano
       dal bottone «Documenti», autoriconosciute dall'estensione */
    assert.ok(!B.voce('mn-src-img'));
});
