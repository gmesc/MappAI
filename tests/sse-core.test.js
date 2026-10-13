'use strict';
/*
 * sse-core.test.js — il lettore dello stream SSE di Infomaniak (25/9/26).
 *
 * Il guasto: main.js (callInfomaniakChat) legge ogni pezzo della rete per conto
 * suo con `chunk.toString().split('\n')`. Una riga «data:» tagliata fra due
 * pezzi si perde, una lettera di più byte tagliata non si ricompone, e
 * finish_reason viene solo dall'ultimo pezzo: un `length` seguito dal pezzo di
 * sola `usage` diventa `stop`.
 *
 * `lettoreDiOggi` qui sotto è la copia fedele di quel codice (main.js, righe
 * 400-451 al 25/9/26). Serve due volte: su uno stream pulito il core deve dare
 * lo STESSO oggetto, così il collegamento è una sostituzione secca; sugli
 * stream rotti prova che questi test hanno denti, perché sugli stessi pezzi
 * il lettore di oggi perde davvero testo.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const SSE = require(path.join(__dirname, '..', 'public', 'js', 'mappai-sse-core.js'));

const MODELLO_RICHIESTO = 'mistralai/Mistral-Small-4-119B-2603';

// ── il lettore di oggi, copiato da main.js senza axios ─────────────────────
function lettoreDiOggi(pezzi, payloadModel = MODELLO_RICHIESTO) {
    let fullText = '';
    let lastChunk = null;
    for (const chunk of pezzi) {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                if (dataStr.trim() === '[DONE]') continue;
                try {
                    const dataObj = JSON.parse(dataStr);
                    lastChunk = dataObj;
                    const delta = dataObj.choices && dataObj.choices[0] && dataObj.choices[0].delta;
                    if (delta && delta.content) {
                        fullText += delta.content;
                    }
                } catch (e) {
                    // ignora errori di parsing parziali
                }
            }
        }
    }
    return {
        id: lastChunk?.id || 'stream',
        object: 'chat.completion',
        created: lastChunk?.created || Math.floor(Date.now() / 1000),
        model: lastChunk?.model || payloadModel,
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content: fullText
                },
                finish_reason: lastChunk?.choices?.[0]?.finish_reason || 'stop'
            }
        ],
        usage: lastChunk?.usage || {}
    };
}

// ── uno stream come lo manda un server compatibile OpenAI (vLLM) ───────────
const BASE = { id: 'chatcmpl-7f3a', object: 'chat.completion.chunk', created: 1758700000, model: 'swiss-ai/Apertus-v1.5-70B' };
const USAGE = { prompt_tokens: 1200, completion_tokens: 4096, total_tokens: 5296 };
const ruolo = () => ({ ...BASE, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }], usage: null });
const delta = (content) => ({ ...BASE, choices: [{ index: 0, delta: { content }, finish_reason: null }], usage: null });
const fine = (reason) => ({ ...BASE, choices: [{ index: 0, delta: {}, finish_reason: reason }], usage: null });
const soloUsage = () => ({ ...BASE, choices: [], usage: USAGE });
const data = (obj) => 'data: ' + JSON.stringify(obj) + '\n\n';
const DONE = 'data: [DONE]\n\n';

function flusso(parti, { finish = 'stop', conUsage = true, done = true } = {}) {
    const eventi = [ruolo(), ...parti.map(delta), fine(finish)];
    if (conUsage) eventi.push(soloUsage());
    return eventi.map(data).join('') + (done ? DONE : '');
}

const PARTI = ['La città ', 'è detta ', '“Berna” ', 'e «già» capitale.'];
const ATTESO = PARTI.join('');

// Pezzi «puliti»: ogni pezzo finisce dove finisce un evento (Buffer, come da axios).
function aEventi(testo, perPezzo = 1) {
    const eventi = testo.split(/(?<=\n\n)/).filter(Boolean);
    const pezzi = [];
    for (let i = 0; i < eventi.length; i += perPezzo) pezzi.push(Buffer.from(eventi.slice(i, i + perPezzo).join('')));
    return pezzi;
}

function taglia(buf, punti) {
    const pezzi = [];
    let da = 0;
    for (const p of punti) { pezzi.push(buf.subarray(da, p)); da = p; }
    pezzi.push(buf.subarray(da));
    return pezzi;
}

// Taglia DENTRO la lettera, dopo i primi `k` byte della sua codifica UTF-8.
function tagliaDentro(buf, lettera, k) {
    const i = buf.indexOf(Buffer.from(lettera, 'utf8'));
    assert.ok(i >= 0, 'lettera assente: ' + lettera);
    return taglia(buf, [i + k]);
}

function conIlCore(pezzi, modello = MODELLO_RICHIESTO) {
    const lettore = SSE.creaLettoreSSE();
    for (const p of pezzi) lettore.aggiungi(p);
    lettore.chiudi();
    return { r: lettore.risposta(modello), s: lettore.stato() };
}

const testoDi = (r) => r.choices[0].message.content;

// ── stream pulito: sostituzione secca ──────────────────────────────────────
test('stream pulito: stesso oggetto del lettore di oggi, pezzo per pezzo o a gruppi', () => {
    for (const opzioni of [{}, { conUsage: false }, { done: false }]) {
        for (const perPezzo of [1, 3]) {
            const pezzi = aEventi(flusso(PARTI, opzioni), perPezzo);
            const { r, s } = conIlCore(pezzi);
            assert.deepEqual(r, lettoreDiOggi(pezzi), JSON.stringify(opzioni) + ' · ' + perPezzo);
            assert.equal(testoDi(r), ATTESO);
            assert.equal(s.finishReason, 'stop');
            assert.equal(s.righeScartate, 0);
        }
    }
});

test('Uint8Array e stringhe danno lo stesso risultato dei Buffer', () => {
    const testo = flusso(PARTI);
    const buf = Buffer.from(testo);
    const punti = [10, 57, 200, 333];
    const comeBuffer = conIlCore(taglia(buf, punti)).r;
    assert.deepEqual(conIlCore(taglia(buf, punti).map(b => new Uint8Array(b))).r, comeBuffer);
    assert.deepEqual(conIlCore([testo.slice(0, 100), testo.slice(100)]).r, comeBuffer);
    assert.equal(testoDi(comeBuffer), ATTESO);
});

// ── guasto 1: la riga tagliata ─────────────────────────────────────────────
test('riga data: tagliata fra due pezzi: il core la ricompone, il lettore di oggi la perde', () => {
    const buf = Buffer.from(flusso(['Prima ', 'seconda ', 'terza.']));
    const pezzi = taglia(buf, [buf.indexOf('seconda') + 3]);     // taglio dentro il JSON
    const { r, s } = conIlCore(pezzi);
    assert.equal(testoDi(r), 'Prima seconda terza.');
    assert.equal(s.righeScartate, 0);
    assert.equal(testoDi(lettoreDiOggi(pezzi)), 'Prima terza.');
});

// ── guasto 2: la lettera tagliata ──────────────────────────────────────────
test('è, à, “ tagliate a metà fra due pezzi: nessuna «�», niente testo perso', () => {
    const buf = Buffer.from(flusso(PARTI));
    for (const [lettera, k] of [['è', 1], ['à', 1], ['“', 1], ['“', 2]]) {
        const pezzi = tagliaDentro(buf, lettera, k);
        const { r, s } = conIlCore(pezzi);
        const dove = `${lettera} tagliata dopo ${k} byte`;
        assert.equal(testoDi(r), ATTESO, dove);
        assert.ok(!testoDi(r).includes('�'), dove);
        assert.equal(s.righeScartate, 0, dove);
        assert.notEqual(testoDi(lettoreDiOggi(pezzi)), ATTESO, dove);
    }
});

test('a ogni punto di taglio, e con un byte per pezzo, il testo arriva intero (\\n e \\r\\n)', () => {
    for (const testo of [flusso(PARTI, { finish: 'length' }), flusso(PARTI, { finish: 'length' }).replace(/\n/g, '\r\n')]) {
        const buf = Buffer.from(testo);
        const unoAllaVolta = Array.from(buf, b => Uint8Array.of(b));
        for (const pezzi of [unoAllaVolta, ...Array.from({ length: buf.length + 1 }, (_, i) => taglia(buf, [i]))]) {
            const { r, s } = conIlCore(pezzi);
            assert.equal(testoDi(r), ATTESO);
            assert.equal(r.choices[0].finish_reason, 'length');
            assert.equal(s.righeScartate, 0);
        }
    }
});

// ── guasto 3: finish_reason dall'ultimo pezzo ──────────────────────────────
test('length seguito dal pezzo di sola usage (choices: []): resta length', () => {
    const pezzi = aEventi(flusso(['risposta arrivata al tetto'], { finish: 'length' }));
    const { r, s } = conIlCore(pezzi);
    assert.equal(r.choices[0].finish_reason, 'length');
    assert.equal(s.finishReason, 'length');
    assert.deepEqual(r.usage, USAGE);
    // il guasto misurato: oggi diventa stop (206 chiamate su 206 nel registro)
    assert.equal(lettoreDiOggi(pezzi).choices[0].finish_reason, 'stop');
});

test('id, model, created, usage, finish_reason: l\'ultimo non nullo, anche se i pezzi finali ne sono privi', () => {
    const coda = { choices: [{ index: 0, delta: {}, finish_reason: null }], usage: null };
    const pezzi = [data(delta('testo')), data(fine('length')), data({ choices: [], usage: USAGE }), data(coda), DONE];
    const { r, s } = conIlCore(pezzi);
    assert.equal(r.id, BASE.id);
    assert.equal(r.model, BASE.model);
    assert.equal(r.created, BASE.created);
    assert.deepEqual(r.usage, USAGE);
    assert.equal(r.choices[0].finish_reason, 'length');
    assert.deepEqual(s.ultimoChunk, coda);      // per i log: l'ultimo pezzo letto, come il lastChunk di oggi
});

test('finish_reason mai arrivato: ripiego stop come oggi, ma stato() lo dice', () => {
    const pezzi = [Buffer.from(data(ruolo()) + data(delta('connessione caduta a metà')))];
    const { r, s } = conIlCore(pezzi);
    assert.deepEqual(r, lettoreDiOggi(pezzi));
    assert.equal(r.choices[0].finish_reason, 'stop');
    assert.equal(s.finishReason, null);
});

// ── il formato SSE ─────────────────────────────────────────────────────────
test('[DONE] chiude senza contare, con e senza spazio', () => {
    const pezzi = [data(delta('ciao')), DONE, 'data:[DONE]\n\n', 'data: [DONE]  \n\n'];
    const { r, s } = conIlCore(pezzi);
    assert.equal(testoDi(r), 'ciao');
    assert.equal(s.righeScartate, 0);
});

test('a-capo \\r\\n, anche tagliato fra \\r e \\n', () => {
    const buf = Buffer.from(flusso(PARTI).replace(/\n/g, '\r\n'));
    const dopoOgniCR = [];
    for (let i = 0; i < buf.length; i++) if (buf[i] === 13) dopoOgniCR.push(i + 1);
    for (const pezzi of [[buf], taglia(buf, dopoOgniCR)]) {
        const { r, s } = conIlCore(pezzi);
        assert.equal(testoDi(r), ATTESO);
        assert.equal(r.choices[0].finish_reason, 'stop');
        assert.equal(s.righeScartate, 0);
    }
});

test('data: senza spazio si legge; commenti, event:, id:, retry: e righe vuote non contano', () => {
    const senzaSpazio = 'data:' + JSON.stringify(delta('senza spazio')) + '\n\n';
    const pezzi = [': ping\n', 'event: message\n', 'id: 42\n', 'retry: 1000\n', '\n',
        data(delta('con spazio, ')), ':\n\n', senzaSpazio, data(fine('stop'))];
    const { r, s } = conIlCore(pezzi);
    assert.equal(testoDi(r), 'con spazio, senza spazio');
    assert.equal(s.finishReason, 'stop');
    assert.equal(s.righeScartate, 0);
    assert.equal(testoDi(lettoreDiOggi(pezzi)), 'con spazio, ');
});

test('righe data: illeggibili: si contano, il testo buono resta, il loro contenuto no', () => {
    const SPIA = 'frammento-illeggibile-xyz';
    const pezzi = [data(delta('uno ')), `data: {"choices":[{"delta":{"content":"${SPIA}\n\n`,
        'data: 42\n\n', 'data: null\n\n', 'data: [1,2]\n\n', data(delta('due')), data(fine('stop'))];
    const { r, s } = conIlCore(pezzi);
    assert.equal(testoDi(r), 'uno due');
    assert.equal(s.righeScartate, 4);
    assert.equal(s.finishReason, 'stop');
    assert.ok(!JSON.stringify(s).includes(SPIA));
});

test('ultima riga senza a-capo: la legge chiudi(), una volta sola', () => {
    const lettore = SSE.creaLettoreSSE();
    lettore.aggiungi(data(delta('prima ')));
    lettore.aggiungi('data: ' + JSON.stringify({ ...BASE, choices: [{ index: 0, delta: { content: 'ultima' }, finish_reason: 'length' }] }));
    assert.equal(testoDi(lettore.risposta(MODELLO_RICHIESTO)), 'prima ');
    assert.equal(lettore.stato().finishReason, null);
    lettore.chiudi();
    lettore.chiudi();
    assert.equal(testoDi(lettore.risposta(MODELLO_RICHIESTO)), 'prima ultima');
    assert.equal(lettore.stato().finishReason, 'length');
    assert.equal(lettore.stato().righeScartate, 0);
});

test('stream vuoto: stesso oggetto di oggi, e finish_reason risulta mancato', (t) => {
    t.mock.method(Date, 'now', () => 1758700000123);
    for (const pezzi of [[], [Buffer.from(DONE)], [': keep-alive\n\n', DONE]]) {
        const { r, s } = conIlCore(pezzi);
        assert.deepEqual(r, lettoreDiOggi(pezzi));
        assert.deepEqual(r, {
            id: 'stream', object: 'chat.completion', created: 1758700000, model: MODELLO_RICHIESTO,
            choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
            usage: {}
        });
        assert.deepEqual(s, { finishReason: null, righeScartate: 0, ultimoChunk: null });
    }
});

// ── dalla revisione del 25/9: fine riga \r, eventi su più righe, righe lunghissime ──
function leggi(pezzi) {
    const l = SSE.creaLettoreSSE();
    for (const p of pezzi) l.aggiungi(p);
    l.chiudi();
    return { r: l.risposta(MODELLO_RICHIESTO), s: l.stato() };
}
const pezzoDelta = (c, fr) => JSON.stringify({ id: 'x', choices: [{ delta: { content: c }, finish_reason: fr || null }] });

test('fine riga col solo \\r (ammesso dallo standard SSE): il testo non si perde', () => {
    const { r, s } = leggi(['data: ' + pezzoDelta('uno ') + '\r\rdata: ' + pezzoDelta('due', 'stop') + '\r\r']);
    assert.equal(r.choices[0].message.content, 'uno due');
    assert.equal(s.finishReason, 'stop');
    assert.equal(s.righeScartate, 0);
});

test('un \\r\\n spezzato fra due pezzi non diventa una riga vuota in più', () => {
    const riga = 'data: ' + pezzoDelta('ciao', 'length');
    const { r, s } = leggi([riga + '\r', '\n\r\n']);
    assert.equal(r.choices[0].message.content, 'ciao');
    assert.equal(s.finishReason, 'length');
    assert.equal(s.righeScartate, 0);
});

test('un evento su più righe `data:` si ricompone fino alla riga vuota', () => {
    const j = pezzoDelta('ricomposto', 'stop');
    const meta = Math.floor(j.length / 2);
    const { r, s } = leggi(['data: ' + j.slice(0, meta) + '\ndata: ' + j.slice(meta) + '\n\n']);
    assert.equal(r.choices[0].message.content, 'ricomposto');
    assert.equal(s.righeScartate, 0);
});

test('una riga buona dopo una rotta, senza riga vuota in mezzo, vince da sola (come prima)', () => {
    const { r, s } = leggi(['data: {rotta\ndata: ' + pezzoDelta('buona') + '\n\n']);
    assert.equal(r.choices[0].message.content, 'buona');
    assert.equal(s.righeScartate, 1);
});

test('una riga da 1 MB a un byte per volta non costa il quadrato', () => {
    const lungo = 'x'.repeat(1024 * 1024);
    const riga = Buffer.from('data: ' + pezzoDelta(lungo, 'stop') + '\n\n');
    const l = SSE.creaLettoreSSE();
    const t0 = Date.now();
    for (let i = 0; i < riga.length; i++) l.aggiungi(riga.subarray(i, i + 1));
    l.chiudi();
    const ms = Date.now() - t0;
    assert.equal(l.risposta(MODELLO_RICHIESTO).choices[0].message.content.length, lungo.length);
    assert.ok(ms < 5000, 'ci ha messo ' + ms + ' ms (prima: 44 s)');
});

// ── dalla seconda revisione del ramo (25/9) ──────────────────────────────────
test('40.000 righe illeggibili senza riga vuota: costo lineare, tutte contate', () => {
    const t0 = Date.now();
    const { s } = leggi(['data: non json\n'.repeat(40000)]);
    assert.ok(Date.now() - t0 < 2000, 'prima: 11 s');
    assert.equal(s.righeScartate, 40000);
});

test('un evento su più righe con una riga interna che da sola è un JSON non si perde', () => {
    const righe = ['{"id":"x","choices":[{"delta":', '{"content":"ciao"}', ',"finish_reason":"stop"}]}'];
    const { r, s } = leggi(['data: ' + righe.join('\ndata: ') + '\n\n']);
    assert.equal(r.choices[0].message.content, 'ciao');
    assert.equal(s.finishReason, 'stop');
    assert.equal(s.righeScartate, 0);
});

/* ── LA GUARDIA DEL SILENZIO (0091) ──────────────────────────────────────────
   Un orologio finto: `avanza(ms)` fa scattare i timer scaduti, così la prova
   non aspetta minuti veri e non dipende dalla velocità della macchina. */
function orologioFinto() {
    let ora = 0, prossimo = 1;
    const timer = new Map();
    return {
        timer: {
            imposta(fn, ms) { const id = prossimo++; timer.set(id, { fn, quando: ora + ms }); return id; },
            annulla(id) { timer.delete(id); }
        },
        avanza(ms) {
            const fine = ora + ms;
            for (;;) {
                let primo = null;
                for (const [id, t] of timer) if (t.quando <= fine && (!primo || t.quando < primo[1].quando)) primo = [id, t];
                if (!primo) break;
                timer.delete(primo[0]); ora = primo[1].quando; primo[1].fn();
            }
            ora = fine;
        },
        attivi() { return timer.size; }
    };
}
function guardiaDiProva() {
    const o = orologioFinto();
    const scatti = [];
    const g = SSE.creaGuardia({ primoDato: 180000, fraDati: 90000, timer: o.timer, alloScadere: (i) => scatti.push(i) });
    return { o, g, scatti };
}

test('guardia: senza nessun dato scade dopo il tempo del primo dato, una volta sola', () => {
    const { o, g, scatti } = guardiaDiProva();
    g.avvia();
    o.avanza(179999);
    assert.equal(scatti.length, 0);
    assert.equal(g.scaduta(), false);
    o.avanza(1);
    assert.deepEqual(scatti, [{ secondi: 180, primoDato: true }]);
    assert.equal(g.scaduta(), true);
    o.avanza(1000000);
    assert.equal(scatti.length, 1, 'scade una volta sola');
});

test('guardia: con dati regolari non scade mai, anche dopo molto più del tempo totale', () => {
    const { o, g, scatti } = guardiaDiProva();
    g.avvia();
    o.avanza(170000);           // il modello pensa a lungo, ma entro il primo tempo
    g.tocca();
    for (let i = 0; i < 100; i++) { o.avanza(80000); g.tocca(); }   // 8000 s di risposta lenta ma viva
    assert.equal(scatti.length, 0);
    assert.equal(g.scaduta(), false);
});

test('guardia: dopo il primo dato scade col tempo fra i dati, non con quello del primo', () => {
    const { o, g, scatti } = guardiaDiProva();
    g.avvia();
    o.avanza(5000);
    g.tocca();
    o.avanza(89999);
    assert.equal(scatti.length, 0);
    o.avanza(1);
    assert.deepEqual(scatti, [{ secondi: 90, primoDato: false }]);
});

test('guardia: si ferma su fine ed errore e non lascia timer accesi', () => {
    for (const quando of ['prima dei dati', 'dopo i dati']) {
        const { o, g, scatti } = guardiaDiProva();
        g.avvia();
        if (quando === 'dopo i dati') g.tocca();
        g.ferma();
        assert.equal(o.attivi(), 0, quando);
        o.avanza(1000000);
        assert.equal(scatti.length, 0, quando);
        g.tocca();                  // un pezzo in ritardo dopo la fine non la riaccende
        assert.equal(o.attivi(), 0, quando);
        assert.equal(g.stato(), 'ferma');
    }
});

test('guardia: i tempi di base e quelli abbassati per la prova', () => {
    assert.deepEqual(SSE.tempiGuardia(undefined), { primoDato: 180000, fraDati: 90000 });
    assert.deepEqual(SSE.tempiGuardia('5000,3000'), { primoDato: 5000, fraDati: 3000 });
    assert.deepEqual(SSE.tempiGuardia('pippo'), { primoDato: 180000, fraDati: 90000 });
    assert.equal(SSE.messaggioGuardia(90), 'Infomaniak non risponde da 90 secondi: la richiesta è stata interrotta.');
});
