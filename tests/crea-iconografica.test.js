'use strict';
/*
 * 0067 — CREA con una foto: la composizione della landing e le uscite del
 * dossier (ADR 0015 rev. 1). Si prova il core puro; il guscio lo monta.
 *
 * Le mutazioni del §6 del packet (M1–M8) devono far diventare rosso almeno un
 * caso qui sotto: ogni test dice quale mutazione lo protegge.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const IC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-crea-iconografica-core.js'));
const VC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-visione-core.js'));
const FC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-files-core.js'));
const PC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-pipeline-core.js'));

function scheda(over) {
    return Object.assign({
        titolo: "La Guerre est l'industrie Nationale de la Prusse",
        nomeFile: 'La_Guerre.jpg', fotoB64: 'AAAA', mime: 'image/jpeg',
        identita: { genere: 'Caricatura', titolo: 'x', autore: 'Anonimo', data: '1870', luogo: 'Parigi, francese', tecnica: '' },
        osservazione: { descrizione: 'Un soldato prussiano con un elmo a punta.' },
        interpretazione: { finalita: 'Denigrare la Prussia — lo dice lo slogan.' },
        critica: {}
    }, over || {});
}
const foto = (id, sch, nome) => ({ id, type: 'doc', file: { name: nome || 'La_Guerre.jpg', type: 'image/jpeg' }, _scheda: sch });
const pdf = (id) => ({ id, type: 'doc', file: { name: 'Lezione.pdf', type: 'application/pdf' }, content: 'testo' });

/* ── composizione ─────────────────────────────────────────────────────────── */

test('nessuna fonte → spenta e non pronta', () => {
    const c = IC.composizione([]);
    assert.equal(c.attiva, false);
    assert.equal(c.pronta, false);
    assert.equal(IC.composizione(undefined).attiva, false);
});

test('una fonte PDF → spenta, pronta come oggi', () => {
    const c = IC.composizione([pdf('s1')]);
    assert.equal(c.attiva, false);
    assert.equal(c.pronta, true);
    assert.equal(c.mancano, '');
});

test('foto con scheda ANNULLATA → spenta [M1]', () => {
    const c = IC.composizione([foto('s1', null)]);
    assert.equal(c.attiva, false, 'senza scheda la modalità non si accende');
});

test('foto con scheda confermata → accesa, titolo e identità giusti', () => {
    const c = IC.composizione([foto('s1', scheda())]);
    assert.equal(c.attiva, true);
    assert.equal(c.pronta, true);
    assert.equal(c.titolo, "La Guerre est l'industrie Nationale de la Prusse");
    /* il titolo NON è ripetuto nell'identità; i campi vuoti non compaiono */
    assert.deepEqual(c.identita.map(r => r.valore), ['Caricatura', 'Anonimo', '1870', 'Parigi, francese']);
    assert.equal(c.identita[0].et, 'Genere della fonte');
    assert.equal(c.etichetta, 'Genera il dossier della fonte');
    assert.equal(c.fonte.id, 's1');
    assert.equal(c.fonte.anteprima, true);
});

test('due foto → «e altre 1»', () => {
    const c = IC.composizione([foto('s1', scheda()), foto('s2', scheda({ titolo: 'Seconda' }), 'b.png')]);
    assert.equal(c.quante, 2);
    assert.ok(c.avvisi.some(a => a.indexOf('e altre 1') === 0), JSON.stringify(c.avvisi));
    assert.equal(c.titolo, "La Guerre est l'industrie Nationale de la Prusse", 'si mostra la prima');
});

test('tre parti su quattro → «3 parti su 4» [M3]', () => {
    const c = IC.composizione([foto('s1', scheda())]);   // critica vuota
    assert.equal(c.parti, 3);
    assert.equal(c.totali, VC.BLOCCHI.length);
    assert.match(c.statoParti, /3 parti su 4/);
    assert.deepEqual(c.nomiParti, ["Carta d'identità", 'Che cosa si vede', 'Che cosa vuole ottenere']);
});

test('HEIC: niente anteprima, il formato è dichiarato', () => {
    const c = IC.composizione([foto('s1', scheda(), 'IMG_4471.HEIC')]);
    assert.equal(c.fonte.anteprima, false);
    assert.equal(c.fonte.formato, 'HEIC');
});

test('una foto e un testo incollato: la schermata dice che il testo non entra nel dossier', () => {
    /* foto + PDF non si può più avere (`fileAmmessi`); un link o un testo libero sì */
    const c = IC.composizione([foto('s1', scheda()), { id: 's2', type: 'text', content: 'appunti della lezione' }]);
    assert.equal(c.attiva, true);
    assert.ok(c.avvisi.some(a => /non entrano nel dossier/.test(a)), JSON.stringify(c.avvisi));
});

/* ── il titolo ────────────────────────────────────────────────────────────── */

test('titolo vuoto → si conserva il precedente [M2]', () => {
    assert.equal(IC.titoloCorretto('   ', 'Vecchio'), 'Vecchio');
    assert.equal(IC.titoloCorretto('', 'Vecchio'), 'Vecchio');
    assert.equal(IC.titoloCorretto('  Nuovo   titolo ', 'Vecchio'), 'Nuovo titolo');
});

/* ── il markup ────────────────────────────────────────────────────────────── */

test('apostrofi, virgolette e accenti → nessuna fuga di markup [M4]', () => {
    const s = scheda({ titolo: `L'industrie "Nationale" <b>è</b>`, identita: { genere: '<img src=x onerror=alert(1)>' } });
    const h = IC.htmlScheda(IC.composizione([foto('s1', s)]));
    assert.ok(!/<b>/.test(h), 'il tag del titolo è passato');
    assert.ok(!/<img/.test(h), "il tag dell'identità è passato");
    assert.ok(h.indexOf('value="L&#39;industrie &quot;Nationale&quot; &lt;b&gt;è&lt;/b&gt;"') >= 0, h);
    assert.ok(h.indexOf('è') >= 0, 'gli accenti restano caratteri, non entità');
    assert.equal(IC.esc(`a'b"c<d>&`), 'a&#39;b&quot;c&lt;d&gt;&amp;');
});

test('i bottoni del markup sono type="button" (stanno dentro un form)', () => {
    const h1 = IC.htmlScheda(IC.composizione([foto('s1', scheda())]));
    const h2 = IC.htmlScheda(IC.composizione([foto('s1', null)]));
    [h1, h2].forEach(h => {
        const n = (h.match(/<button/g) || []).length;
        const tb = (h.match(/<button type="button"/g) || []).length;
        assert.ok(n > 0 && n === tb, h);
    });
    assert.ok(h1.indexOf('data-ci="rivedi"') >= 0);
    assert.ok(h2.indexOf('data-ci="leggi"') >= 0);
});

/* ── uscite: la scheda è l'unica fonte dei materiali (01/10) ──────────────── */

/* il bento come lo vide Giacomo al gate: solo la scelta multipla spuntata */
const bentoSoloMc = () => ({ classId: 'c1', tuned: true, levelTuned: true, sourcePdf: true,
    quiz: { types: ['mc'], perBranch: 4, angle: 'auto', multi: [], angoli: [] },
    synthesis: null, causal: true, nodesheet: { maxLevel: 'all', modes: ['title'] } });
const ANGOLI = PC.angoliMulti();

test('scheda senza opzioni (nata prima) → i tre di sempre: aperte, flashcard, sintesi', () => {
    [null, undefined, {}, bentoSoloMc()].forEach(p => {
        const c = IC.uscite(p, scheda());
        assert.deepEqual(c.quiz.types, ['open', 'flashcards']);
        assert.ok(c.synthesis);
    });
});

test('il caso del gate: la scheda chiede aperte, flashcard e sintesi; il bento solo MC → vince la scheda [M10]', () => {
    const sch = scheda({ opzioni: IC.opzioniIniziali(null) });
    const c = IC.uscite(bentoSoloMc(), sch);
    assert.deepEqual(c.quiz.types, ['open', 'flashcards'], 'il bento non aggiunge la scelta multipla');
    assert.ok(c.synthesis, 'il bento non toglie la sintesi');
    assert.equal(c.classId, 'c1', 'il contesto del bento viaggia');
    assert.equal(c.nodesheet, null);
    assert.equal(c.causal, null);
});

test('la voce della sintesi la decide la scheda, non il bento [M13]', () => {
    const spenta = scheda({ opzioni: IC.opzioniIniziali(null) });
    assert.deepEqual(IC.uscite({ synthesis: { audio: true } }, spenta).synthesis, { audio: false }, 'il bento non la accende');
    const accesa = scheda({ opzioni: IC.opzioniIniziali({ voce: true }) });
    assert.deepEqual(IC.uscite({ synthesis: null }, accesa).synthesis, { audio: true }, 'il bento non la spegne');
    assert.deepEqual(IC.uscite({ synthesis: { audio: false } }, accesa).synthesis, { audio: true });
});

test('la voce senza sintesi non c\u0027è; una scheda vecchia senza `voce` ha la voce spenta', () => {
    assert.equal(IC.uscite(null, scheda({ opzioni: { syn: false, voce: true } })).synthesis, null);
    assert.deepEqual(IC.uscite(null, scheda({ opzioni: { oq: { on: true }, syn: true } })).synthesis, { audio: false });
    assert.deepEqual(IC.uscite(null, scheda()).synthesis, { audio: false }, 'scheda senza opzioni');
    assert.equal(IC.voceChiesta({ syn: true, voce: true }), true);
    assert.equal(IC.voceChiesta({ syn: false, voce: true }), false);
    assert.equal(IC.voceChiesta({ syn: true }), false);
});

test('senza chiave Google la voce chiesta dalla scheda si spegne', () => {
    const accesa = scheda({ opzioni: IC.opzioniIniziali({ voce: true }) });
    assert.deepEqual(IC.uscite(null, accesa, { chiaveGoogle: false }).synthesis, { audio: false });
    assert.deepEqual(IC.uscite(null, accesa, { chiaveGoogle: true }).synthesis, { audio: true });
    assert.ok(IC.uscite(null, accesa, { chiaveGoogle: false }).synthesis, 'la sintesi resta, solo senza voce');
});

test('la voce: la prima volta spenta, poi ricordata, e contata nel preventivo', () => {
    assert.equal(IC.opzioniIniziali(null).voce, false);
    assert.equal(IC.opzioniIniziali({ voce: true }).voce, true);
    assert.equal(IC.opzioniIniziali({ voce: 'sì' }).voce, false, 'un valore non booleano non accende');
    const base = IC.stima(IC.opzioniIniziali(null), 4);
    const conVoce = IC.stima(IC.opzioniIniziali({ voce: true }), 4);
    assert.equal(base.voce, 0);
    assert.equal(conVoce.voce, 1);
    assert.equal(conVoce.chiamate, base.chiamate + 1);
    assert.equal(IC.stima(IC.opzioniIniziali({ voce: true, syn: false }), 4).voce, 0);
});

test('la scelta multipla dalla scheda, con le sue categorie, i suoi angoli e la sua quantità', () => {
    const op = IC.opzioniIniziali({ oq: { on: false }, fc: { on: false }, syn: false,
        mc: { on: true, n: 5, cat: ['osservazione', 'interpretazione'], angoli: ['causa', 'confronto'] } }, ANGOLI);
    const c = IC.uscite(bentoSoloMc(), scheda({ opzioni: op }));
    assert.deepEqual(c.quiz.types, ['mc']);
    assert.equal(c.synthesis, null);
    assert.deepEqual(PC.categoriePerTipo(c.quiz, 'mc'), ['osservazione', 'interpretazione']);
    assert.deepEqual(PC.angoliPerTipo(c.quiz, 'mc'), ['causa', 'confronto']);
    assert.equal(PC.quantiPerTipo(c.quiz, 'mc', 3), 5);
    assert.deepEqual(PC.multiTypes(c.quiz), ['mc']);
    assert.doesNotThrow(() => PC.createManifest(c, { now: '2026-10-01T00:00:00Z' }));
});

test('la scelta multipla senza angoli resta una generazione sola', () => {
    const op = IC.opzioniIniziali({ mc: { on: true } });
    const c = IC.uscite(null, scheda({ opzioni: op }));
    assert.ok(c.quiz.types.includes('mc'));
    assert.deepEqual(PC.multiTypes(c.quiz), []);
    assert.equal(PC.categoriePerTipo(c.quiz, 'mc'), null, 'tutte le categorie');
});

test('una scheda vecchia senza `mc` → scelta multipla spenta', () => {
    const c = IC.uscite(bentoSoloMc(), scheda({ opzioni: { oq: { on: true }, fc: { on: true }, syn: true } }));
    assert.ok(!c.quiz.types.includes('mc'));
});

test('le categorie e gli angoli continuano ad arrivare dalla scheda [M6]', () => {
    const sch = scheda({ opzioni: {
        oq: { on: true, n: 4, cat: ['osservazione'], angoli: ['causa'] },
        fc: { on: true, n: 2, cat: ['identita', 'critica'], angoli: [] }, syn: true } });
    const c = IC.uscite(bentoSoloMc(), sch);
    assert.deepEqual(PC.categoriePerTipo(c.quiz, 'open'), ['osservazione']);
    assert.deepEqual(PC.categoriePerTipo(c.quiz, 'flashcards'), ['identita', 'critica']);
    assert.deepEqual(PC.angoliPerTipo(c.quiz, 'open'), ['causa']);
    assert.equal(PC.quantiPerTipo(c.quiz, 'open', 3), 4);
    assert.deepEqual(PC.multiTypes(c.quiz), ['open']);
});

test('la scheda che spegne tutto → nessun materiale', () => {
    const c = IC.uscite(bentoSoloMc(), scheda({ opzioni: { oq: { on: false }, fc: { on: false }, mc: { on: false }, syn: false } }));
    assert.equal(c.quiz, null);
    assert.equal(c.synthesis, null);
});

/* ── le ultime scelte della scheda ────────────────────────────────────────── */

test('la prima volta in assoluto: aperte, flashcard e sintesi accese, scelta multipla spenta [M5]', () => {
    [null, undefined, 'x', [], {}].forEach(v => {
        const o = IC.opzioniIniziali(v);
        assert.equal(o.oq.on, true);
        assert.equal(o.fc.on, true);
        assert.equal(o.mc.on, false);
        assert.equal(o.syn, true);
        assert.equal(o.oq.n, 3);
        assert.equal(o.oq.cat, null);
        assert.deepEqual(o.oq.angoli, []);
        const c = IC.uscite(null, scheda({ opzioni: o }));
        assert.deepEqual(c.quiz.types, ['open', 'flashcards'], 'mai una lista vuota la prima volta');
        assert.ok(c.synthesis);
    });
});

test('le scelte salvate tornano come valore iniziale', () => {
    const salvate = { oq: { on: false, n: 7, cat: ['critica'], angoli: [] },
        fc: { on: true, n: 2, cat: null, angoli: ['esempio'] },
        mc: { on: true, n: 4, cat: ['identita'], angoli: ['causa'] }, syn: false, voce: true };
    const o = IC.opzioniIniziali(JSON.parse(JSON.stringify(salvate)), ANGOLI);
    assert.deepEqual(o, salvate);
});

test('id di blocco e angoli sconosciuti si ignorano; se non ne resta nessuno valgono tutte', () => {
    const o = IC.opzioniIniziali({ oq: { cat: ['osservazione', 'blocco_sparito'], angoli: ['causa', 'angolo_sparito'] },
        fc: { cat: ['blocco_sparito'] }, mc: { on: true, cat: [], n: 99 } }, ANGOLI);
    assert.deepEqual(o.oq.cat, ['osservazione']);
    assert.deepEqual(o.oq.angoli, ['causa']);
    assert.equal(o.fc.cat, null, 'nessuna categoria valida → tutte');
    assert.deepEqual(o.mc.cat, [], 'nessuna categoria scelta a mano resta nessuna');
    assert.equal(o.mc.n, 3, 'quantità fuori scala → default');
});

test('il preventivo conta la scelta multipla', () => {
    const op = IC.opzioniIniziali({ mc: { on: true, angoli: ['causa', 'esempio'], cat: ['identita'] } });
    const s = IC.stima(op, 4);
    assert.equal(s.mc, 2, '2 angoli × 1 categoria');
    assert.equal(s.oq, 4);
    assert.equal(s.fc, 4);
    assert.equal(s.syn, 1);
    assert.equal(s.chiamate, 11);
    assert.equal(IC.stima(IC.opzioniIniziali(null), 4).mc, 0);
});

test('il dossier è la scheda STESSA (la pipeline ritrova la foto per identità)', () => {
    const sch = scheda();
    assert.equal(IC.uscite(null, sch).dossier, sch);
    assert.equal(IC.uscite(bentoSoloMc(), sch).dossier, sch);
});

test('il titolo corretto nel campo è quello che diventa il nome del dossier', () => {
    const sch = scheda();
    sch.titolo = IC.titoloCorretto('Titolo del docente', sch.titolo);
    assert.equal(IC.uscite(null, sch).dossier.titolo, 'Titolo del docente');
});

/* ── la spunta «Manda la fonte all'allievo» (0068 fuso) ───────────────────── */

test('con una foto la spunta si nasconde [M7]', () => {
    assert.equal(IC.composizione([foto('s1', scheda())]).spunta.nascosta, true);
    assert.equal(IC.composizione([foto('s1', null)]).spunta.nascosta, true, 'anche con la foto da leggere');
    assert.equal(IC.composizione([foto('s1', scheda()), foto('s2', scheda(), 'b.png')]).spunta.nascosta, true);
});

test('con un PDF la spunta si comporta come oggi', () => {
    assert.equal(IC.composizione([pdf('s1')]).spunta.nascosta, false);
    assert.equal(IC.composizione([]).spunta.nascosta, false);
});

/* ── o foto o documenti (Giacomo, 01/10) ──────────────────────────────────── */

const vuota = (id, type) => ({ id, type: type || 'doc', content: '', file: null });

test('con una foto fra le fonti un PDF non entra [M9]', () => {
    const r = IC.fileAmmessi([foto('s1', scheda()), vuota('s2')], ['Lezione.pdf'], 's2');
    assert.equal(r.ok, false);
    assert.match(r.motivo, /c'è una foto/);
    /* anche una foto ancora da leggere conta */
    assert.equal(IC.fileAmmessi([foto('s1', null)], ['appunti.docx'], 's2').ok, false);
});

test('con un PDF fra le fonti una foto non entra', () => {
    const r = IC.fileAmmessi([pdf('s1'), vuota('s2')], ['g.jpg'], 's2');
    assert.equal(r.ok, false);
    assert.match(r.motivo, /già un documento/);
});

test('più foto insieme restano permesse, più documenti pure', () => {
    assert.equal(IC.fileAmmessi([foto('s1', scheda())], ['b.png', 'c.HEIC'], 's2').ok, true);
    assert.equal(IC.fileAmmessi([pdf('s1')], ['b.pdf', 'note.txt'], 's2').ok, true);
    assert.equal(IC.fileAmmessi([], ['a.jpg', 'b.jpeg'], 's1').ok, true);
});

test('una scelta che mescola foto e PDF si rifiuta per intero', () => {
    const r = IC.fileAmmessi([], ['a.jpg', 'b.pdf'], 's1');
    assert.equal(r.ok, false);
    assert.match(r.motivo, /insieme/);
});

test('le fonti non-file non contano: link, testo, audio restano come oggi', () => {
    const fonti = [{ id: 'u', type: 'url', content: 'https://x.ch' }, { id: 't', type: 'text', content: 'appunti' },
        { id: 'a', type: 'audio', file: { name: 'lezione.mp3' } }];
    assert.equal(IC.fileAmmessi(fonti, ['g.jpg'], 's9').ok, true);
    assert.equal(IC.fileAmmessi(fonti, ['b.pdf'], 's9').ok, true);
});

test('la riga che riceve i file non conta contro sé stessa; nessun file → ok', () => {
    assert.equal(IC.fileAmmessi([pdf('s1')], ['g.jpg'], 's1').ok, true);
    assert.equal(IC.fileAmmessi([foto('s1', scheda())], [], 's2').ok, true);
});

test("relVaultStudente('Allegati/fonte.jpg') continua a passare", () => {
    assert.equal(FC.relVaultStudente('Allegati/fonte.jpg'), 'Allegati/fonte.jpg');
});

/* ── la foto senza scheda (gate 3 dello 0065) ─────────────────────────────── */

test('una foto senza scheda → non pronta, con la frase giusta [M8]', () => {
    const c = IC.composizione([foto('s1', null)]);
    assert.equal(c.pronta, false);
    assert.deepEqual(c.daLeggere.map(x => x.id), ['s1']);
    assert.match(c.mancano, /^Leggi prima la foto «La_Guerre\.jpg»/);
    const h = IC.htmlScheda(c, { motivo: 'Per leggere la foto con Infomaniak servono il token.' });
    assert.ok(h.indexOf('Leggi prima la foto') >= 0);
    assert.ok(h.indexOf('servono il token') >= 0, 'il motivo del provider resta a schermo');
});

test('la stessa fonte dopo la conferma della scheda → pronta', () => {
    const src = foto('s1', null);
    assert.equal(IC.composizione([src]).pronta, false);
    src._scheda = scheda();
    const c = IC.composizione([src]);
    assert.equal(c.pronta, true);
    assert.equal(c.mancano, '');
});

test('una foto confermata e una da leggere: non pronta, e la card lo dice', () => {
    const c = IC.composizione([foto('s1', scheda()), foto('s2', null, 'b.png')]);
    assert.equal(c.attiva, true);
    assert.equal(c.pronta, false);
    const h = IC.htmlScheda(c);
    assert.ok(h.indexOf('Leggi prima la foto «b.png»') >= 0, h);
    assert.ok(h.indexOf('data-ci="rivedi"') >= 0 && h.indexOf('data-ci="leggi"') >= 0);
});

test('una foto senza scheda PIÙ un PDF → resta non pronta', () => {
    const c = IC.composizione([foto('s1', null), pdf('s2')]);
    assert.equal(c.pronta, false);
    assert.equal(c.attiva, false);
});

test('un .docx senza scheda → pronto come oggi (la regola vale solo per le immagini)', () => {
    const c = IC.composizione([{ id: 's1', type: 'doc', file: { name: 'appunti.docx' } }]);
    assert.equal(c.pronta, true);
    assert.deepEqual(c.daLeggere, []);
});

test('una riga appena aggiunta (senza file né testo) non è una fonte', () => {
    assert.equal(IC.composizione([{ id: 's1', type: 'text', content: '   ' }]).pronta, false);
});

/* ── 01/10: la fonte di una scheda, per copiare la foto in Allegati/ ─────────
   `Pipeline.run` clona la config: il dossier che arriva alla copia NON è più lo
   stesso oggetto di `src._scheda`. */
test('fontePerScheda: la scheda clonata ritrova la sua fonte (era la causa di Allegati/ vuota)', () => {
    const s = scheda();
    const foto = { id: 'a', file: { name: 'La_Guerre.jpg' }, _scheda: s };
    const clone = JSON.parse(JSON.stringify(s));
    assert.notEqual(clone, s);
    assert.equal(IC.fontePerScheda([{ id: 'p' }, foto], clone), foto);
});

test('fontePerScheda: due foto, si sceglie quella col nome del file e il titolo giusti', () => {
    const a = { id: 'a', _scheda: scheda({ nomeFile: 'uno.jpg', titolo: 'Uno' }) };
    const b = { id: 'b', _scheda: scheda({ nomeFile: 'due.jpg', titolo: 'Due' }) };
    assert.equal(IC.fontePerScheda([a, b], JSON.parse(JSON.stringify(b._scheda))), b);
});

test("fontePerScheda: nessuna corrispondenza certa → null (mai la foto di un\'altra fonte)", () => {
    const a = { id: 'a', _scheda: scheda({ nomeFile: 'x.jpg', titolo: 'A' }) };
    const b = { id: 'b', _scheda: scheda({ nomeFile: 'x.jpg', titolo: 'B' }) };
    assert.equal(IC.fontePerScheda([a, b], scheda({ nomeFile: 'x.jpg', titolo: 'C' })), null);
    assert.equal(IC.fontePerScheda([a], scheda({ nomeFile: 'altro.jpg' })), null);
    assert.equal(IC.fontePerScheda([a], null), null);
    assert.equal(IC.fontePerScheda([{ id: 'p', file: { name: 'x.jpg' } }], scheda({ nomeFile: 'x.jpg' })), null);
});

/* ── con una foto, solo le voci del bento che il dossier legge (gate 01/10) ── */
const B = require(path.join(__dirname, '..', 'public', 'js', 'mappai-bento-composizione.js'));

test('con una foto le voci della mappa e dei materiali del bento si nascondono [M11]', () => {
    const giu = IC.vociDaNascondere(true);
    ['mn-genere', 'mn-genere-opz', 'mn-multipass', 'mn-mmlogic', 'mn-autodepth', 'mn-gendepth', 'mn-pipeline',
     'mn-l1', 'mn-focus', 'mn-lenti', 'mn-disciplina', 'mn-stima', 'mn-solo-mappa',
     'mp-qt-mixed', 'mp-qt-mc', 'mp-qt-fc', 'mp-qt-open', 'mp-perbranch', 'mp-fc-count', 'mp-preset',
     'mp-ns-causal',
     'mp-ang-causa', 'mp-src-pdf'].forEach(id => {
        assert.ok(giu.includes(id), id + ' resterebbe a schermo con una foto');
        assert.equal(IC.visibileConFoto(id), false, id);
    });
});

test('con una foto restano il contesto, il verde, l\u0027upload e l\u0027elenco', () => {
    ['mp-chi', 'mp-disc', 'mn-genera', 'mn-upload', 'mn-elenco', 'mn-foto', 'mn-scheda'].forEach(id => {
        assert.equal(IC.visibileConFoto(id), true, id + ' sparirebbe con una foto');
    });
});

test('con una foto sparisce anche «Adatta»: lo decide la classe (decisione 10 del 01/10)', () => {
    assert.equal(IC.visibileConFoto('mn-livello'), false);
    assert.ok(IC.vociDaNascondere(true).includes('mn-livello'));
});

test('con una foto spariscono le fonti che il dossier non legge, e la sintesi del bento [M12]', () => {
    ['mn-src-url', 'mn-src-youtube', 'mn-src-audio', 'mn-src-text', 'mn-input-box', 'mn-testo',
     'mp-syn-on', 'mp-syn-audio'].forEach(id => assert.equal(IC.visibileConFoto(id), false, id));
    /* l'upload resta: più foto insieme sono permesse */
    assert.equal(IC.visibileConFoto('mn-upload'), true);
});

test('una fonte non-file già presente resta fra le fonti, e l\u0027avviso lo dice', () => {
    const c = IC.composizione([foto('s1', scheda()), { id: 'u', type: 'url', content: 'https://x.ch' }]);
    assert.ok(c.avvisi.some(a => /restano nell'elenco ma non entrano nel dossier/.test(a)), JSON.stringify(c.avvisi));
});

test('una voce non classificata resta visibile (una voce nuova non sparisce di nascosto)', () => {
    assert.equal(IC.visibileConFoto('mn-voce-che-nascera-domani'), true);
});

test("ogni voce da nascondere esiste davvero nell'inventario del bento", () => {
    const ids = new Set(B.VOCI.map(v => v.id));
    IC.vociDaNascondere(true).forEach(id => assert.ok(ids.has(id), 'id sconosciuto: ' + id));
});

test('senza foto non si nasconde niente; con una foto da leggere sì', () => {
    assert.deepEqual(IC.vociDaNascondere(false), []);
    assert.deepEqual(IC.composizione([pdf('s1')]).nascondi, []);
    assert.ok(IC.composizione([foto('s1', null)]).nascondi.includes('mn-genere'));
    assert.ok(IC.composizione([foto('s1', scheda())]).nascondi.includes('mp-preset'));
});

/* ── la foto appena entrata, con la scheda ancora aperta (gate 01/10) ─────── */

test('una foto in lettura: spunta nascosta, non pronta, nessun «Leggi la foto»', () => {
    const c = IC.composizione([foto('s1', undefined)], { inLettura: ['s1'] });
    assert.equal(c.spunta.nascosta, true);
    assert.equal(c.pronta, false);
    assert.match(c.mancano, /^Sto leggendo la foto «La_Guerre\.jpg»/);
    const h = IC.htmlScheda(c);
    assert.ok(h.indexOf('data-ci="leggi"') < 0, 'si sta già leggendo');
});

test('finita la lettura senza scheda torna «Leggi prima la foto» col bottone', () => {
    const c = IC.composizione([foto('s1', null)], { inLettura: [] });
    assert.match(c.mancano, /^Leggi prima la foto/);
    assert.ok(IC.htmlScheda(c).indexOf('data-ci="leggi"') >= 0);
});

/* ── la fine di un lotto di dossier: ELABORA e CREA ripulita (gate 3, 01/10 sera) ── */

test('un dossier solo: finito bene → si chiude il lotto, con la sua fonte da togliere', () => {
    const r = IC.fineLotto({}, { id: 'L1', n: 1, i: 0 }, { ok: true, dossier: { nomeFile: 'g.jpg', titolo: 'Guerre' } });
    assert.equal(r.chiudi, true);
    assert.deepEqual(r.dossier, [{ nomeFile: 'g.jpg', titolo: 'Guerre' }]);
    assert.deepEqual(r.registro, {}, 'il lotto chiuso non resta nel registro');
});

test("più foto: si chiude solo con l'ULTIMO, e una volta sola", () => {
    let r = IC.fineLotto({}, { id: 'L2', n: 2, i: 0 }, { ok: true, dossier: { nomeFile: 'a.jpg', titolo: 'A' } });
    assert.equal(r.chiudi, false);
    r = IC.fineLotto(r.registro, { id: 'L2', n: 2, i: 0 }, { ok: true, dossier: { nomeFile: 'a.jpg', titolo: 'A' } });
    assert.equal(r.chiudi, false, 'lo stesso dossier finito due volte conta una volta');
    r = IC.fineLotto(r.registro, { id: 'L2', n: 2, i: 1 }, { ok: true, dossier: { nomeFile: 'b.jpg', titolo: 'B' } });
    assert.equal(r.chiudi, true);
    assert.deepEqual(r.dossier.map(d => d.nomeFile).sort(), ['a.jpg', 'b.jpg']);
});

test('un dossier fallito non chiude il lotto (il docente deve poter riprovare); il «Riprova» riuscito sì', () => {
    let r = IC.fineLotto({}, { id: 'L3', n: 1, i: 0 }, { ok: false, dossier: { nomeFile: 'a.jpg' } });
    assert.equal(r.chiudi, false);
    r = IC.fineLotto(r.registro, { id: 'L3', n: 1, i: 0 }, { ok: true, dossier: { nomeFile: 'a.jpg' } });
    assert.equal(r.chiudi, true);
});

test('senza lotto (una rigenerazione da ELABORA) non si chiude niente', () => {
    assert.equal(IC.fineLotto({}, undefined, { ok: true, dossier: {} }).chiudi, false);
    assert.equal(IC.fineLotto({}, { id: '', n: 1, i: 0 }, { ok: true, dossier: {} }).chiudi, false);
});

test('le fonti da togliere si ritrovano per contenuto (la config è clonata)', () => {
    const sch = scheda({ nomeFile: 'La_Guerre.jpg' });
    const src = foto('s1', sch);
    const r = IC.fineLotto({}, { id: 'L4', n: 1, i: 0 }, { ok: true, dossier: JSON.parse(JSON.stringify(sch)) });
    assert.equal(IC.fontePerScheda([pdf('p'), src], r.dossier[0]), src);
});

/* ── INSEGNA: il primo comando di un dossier è «Proietta» ─────────────────── */

test('il primo bottone di un dossier è Proietta, di una mappa resta Mappa [M15]', () => {
    assert.equal(IC.primoComando({ dossier: true, nome: 'Guerre' }), 'proietta');
    assert.equal(IC.primoComando({ dossier: false, type: 'mindmap' }), 'apri');
    assert.equal(IC.primoComando({ type: 'kg' }), 'apri');
    assert.equal(IC.primoComando(null), 'apri');
});

/* ── PROIETTA: la scheda dall'archivio, poi dal vault ─────────────────────── */

test("la scheda di Proietta: prima l'archivio, poi il vault, se no niente [M14]", () => {
    const arch = scheda({ titolo: "Dall'archivio" });
    const vault = { config: { dossier: scheda({ titolo: 'Dal vault' }) } };
    assert.equal(IC.schedaPerProiezione(arch, vault), arch, "l'archivio vince");
    assert.equal(IC.schedaPerProiezione(null, vault).titolo, 'Dal vault', 'su un altro computer: il vault');
    assert.equal(IC.schedaPerProiezione(null, { config: {} }), null);
    assert.equal(IC.schedaPerProiezione(null, null), null);
    assert.equal(IC.schedaPerProiezione({ titolo: 'senza blocchi' }, null), null, 'un oggetto qualsiasi non è una scheda');
    assert.equal(IC.schedaPerProiezione(null, { config: { dossier: 'x' } }), null);
});
