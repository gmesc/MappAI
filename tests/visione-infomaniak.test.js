'use strict';
/*
 * visione-infomaniak.test.js — packet 0066: le foto si leggono in Svizzera.
 *
 * I moduli VERI in una vm (`infomaniak_bridge.js`, `mappai-catalogo-core.js`,
 * `mappai-visione-core.js`, `mappai-visione.js`, `mappai-visione-modello.js`)
 * davanti a un DOM finto — la vista «Impostazioni AI» quanto basta: il campo del
 * Product ID, il blocco di `#model-select` e `#modelli-setup` — e a un
 * `electronAPI` finto che registra ogni chiamata.
 *
 * ⚠️ Negli assert sul DOM finto solo booleani, testi, numeri e attributi, mai
 * l'elemento: un assert fallito su un oggetto del DOM finto può far girare Node
 * all'infinito.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RADICE = path.join(__dirname, '..');
const JS = f => fs.readFileSync(path.join(RADICE, 'public', 'js', f), 'utf8');
const C = require('../public/js/mappai-catalogo-core.js');
const riposo = (ms = 0) => new Promise(r => setTimeout(r, ms));

const GEMMA = 'google/gemma-4-31B-it';
const QWEN = 'Qwen/Qwen3.5-122B-A10B-FP8';
const MINISTRAL = 'mistralai/Ministral-3-14B-Instruct-2512';
const TOKEN_IM = 'TokInfomaniakDiProva_0123456789abcdef';
const CHIAVE_G = 'AIzaChiaveGoogleDiProva_987654321';
const PID = '105999';
const BYTES = Buffer.from('byte veri della foto di prova').toString('base64');

// ── il ponte, da solo ────────────────────────────────────────────────────────
function ponte() {
    const toast = [];
    const ctx = { console: { warn() { }, log() { } } };
    ctx.window = ctx;
    ctx.showToast = (m, tipo) => toast.push({ m, tipo });
    vm.createContext(ctx);
    vm.runInContext(JS('infomaniak_bridge.js'), ctx);
    return { B: ctx.InfomaniakBridge, toast };
}
const J = x => JSON.parse(JSON.stringify(x));

test('ponte: inlineData immagine → content array, testo e image_url con gli stessi byte', () => {
    const { B, toast } = ponte();
    const out = J(B.translatePayload({ contents: [{ parts: [
        { inlineData: { mimeType: 'image/jpeg', data: BYTES } },
        { text: 'Analizza la foto' }
    ] }], generationConfig: { maxOutputTokens: 4096 } }, QWEN, { immagini: true }));
    assert.equal(out.messages.length, 1);
    assert.deepEqual(out.messages[0], { role: 'user', content: [
        { type: 'text', text: 'Analizza la foto' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + BYTES } }
    ] });
    assert.equal(toast.length, 0);
});

test('ponte: inline_data (snake_case) lo stesso, più immagini nell\'ordine', () => {
    const { B, toast } = ponte();
    const out = J(B.translatePayload({ contents: [{ parts: [
        { text: 'Due foto' },
        { inline_data: { mime_type: 'image/png', data: 'AAA=' } },
        { inline_data: { mime_type: 'image/jpeg', data: 'BBB=' } }
    ] }] }, QWEN, { immagini: true }));
    assert.deepEqual(out.messages[0].content, [
        { type: 'text', text: 'Due foto' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA=' } },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,BBB=' } }
    ]);
    assert.equal(toast.length, 0);
});

test('ponte: con immagini:true audio, video e file_data si scartano, con il toast', () => {
    for (const parte of [{ inlineData: { mimeType: 'audio/mpeg', data: 'QQ==' } },
        { inline_data: { mime_type: 'video/mp4', data: 'QQ==' } },
        { file_data: { file_uri: 'https://x', mime_type: 'application/pdf' } }]) {
        const { B, toast } = ponte();
        const out = J(B.translatePayload({ contents: [{ parts: [parte, { text: 'solo testo' }] }] }, QWEN, { immagini: true }));
        assert.deepEqual(out.messages, [{ role: 'user', content: 'solo testo' }]);
        assert.equal(toast.length, 1);
        assert.equal(toast[0].tipo, 'warning');
    }
});

/* L'uscita del ponte della base (40511e00) su due payload senza immagini,
   congelata: un messaggio senza immagini resta una stringa identica a prima. */
const PRIMA = [{"model":"google/gemma-4-31B-it","messages":[{"role":"system","content":"Sei un tutor."},{"role":"user","content":"Ciao\nmondo"},{"role":"assistant","content":"Risposta"},{"role":"user","content":"Domanda"}],"temperature":0.3,"max_tokens":1234,"frequency_penalty":0.3,"presence_penalty":0.1},{"model":"Qwen/Qwen3.5-122B-A10B-FP8","messages":[{"role":"user","content":"Dammi JSON\n\nSTRUTTURA JSON ATTESA (rispetta ESATTAMENTE chiavi e nidificazione):\n{\n  \"a\": \"<string>\"\n}\nVINCOLI DELLO SCHEMA (enum e campi obbligatori):\n{\"type\":\"object\",\"properties\":{\"a\":{\"type\":\"string\"}},\"required\":[\"a\"]}\n\nREGOLE DI OUTPUT TASSATIVE:\n1. Rispondi SOLO con il JSON, nient'altro.\n2. NIENTE testo introduttivo (es. \"Ecco il JSON:\"), NIENTE spiegazioni finali.\n3. NIENTE blocchi markdown (vietati ```json e ```).\n4. Il primo carattere della risposta deve essere { (o [) e l'ultimo } (o ])."}],"temperature":0.3,"max_tokens":4000,"frequency_penalty":0.3,"presence_penalty":0.1,"chat_template_kwargs":{"enable_thinking":false}}];
const SCHEMA = { type: 'OBJECT', properties: { a: { type: 'STRING' } }, required: ['a'] };

test('ponte: senza immagini il payload è identico a quello di prima', () => {
    const { B, toast } = ponte();
    const P1 = { systemInstruction: { parts: [{ text: 'Sei un tutor.' }] }, contents: [
        { role: 'user', parts: [{ text: 'Ciao' }, { text: 'mondo' }] }, { role: 'model', parts: [{ text: 'Risposta' }] },
        { role: 'user', parts: [{ text: ' Domanda ' }] }], generationConfig: { maxOutputTokens: 1234, temperature: 0.9 } };
    const P2 = { contents: [{ role: 'user', parts: [{ text: 'Dammi JSON' }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA } };
    assert.deepEqual(J([B.translatePayload(P1, GEMMA), B.translatePayload(P2, QWEN)]), PRIMA);
    assert.equal(toast.length, 0);
});

test('ponte: con le immagini le regole del JSON vanno nella parte di testo, l\'array resta intero', () => {
    const { B } = ponte();
    const out = J(B.translatePayload({ contents: [{ parts: [
        { inlineData: { mimeType: 'image/png', data: 'AAA=' } }, { text: 'Dammi JSON' }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA } }, QWEN, { immagini: true }));
    const c = out.messages[0].content;
    assert.equal(Array.isArray(c), true);
    assert.equal(c.length, 2);
    assert.equal(c[0].type, 'text');
    assert.equal(c[0].text, PRIMA[1].messages[0].content);
    assert.equal(c[1].image_url.url, 'data:image/png;base64,AAA=');
});

/* Le fonti-immagine di CREA passano da `app.js` (`inline_data`) al modello della tendina principale, spesso Gemma
   (solo testo): senza `immagini: true` il ponte si comporta come sulla base 40511e00, uscita e toast congelati. */
test('ponte: senza immagini:true le foto di app.js restano scartate come prima (stessa uscita, stesso toast)', () => {
    const { B, toast } = ponte();
    const out = J(B.translatePayload({ contents: [
        { parts: [{ inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } }, { text: 'Fonte caricata' }] },
        { parts: [{ inlineData: { mimeType: 'image/png', data: 'REVG' } }, { text: 'Foto camel' }] }] }, GEMMA));
    assert.deepEqual(out, {"model":"google/gemma-4-31B-it","messages":[{"role":"user","content":"Fonte caricata"},{"role":"user","content":"Foto camel"}],"temperature":0.3,"max_tokens":4000,"frequency_penalty":0.3,"presence_penalty":0.1});
    assert.deepEqual(toast.map(x => x.m), ['⚠️ Infomaniak: file audio/video/immagini non supportati. Solo il testo estratto verrà analizzato.']);
});

// ── D7 (0088): il rimedio di una chiave rifiutata dipende dal fornitore ─────────────────────────
const NOTA_SI = () => Promise.resolve({ azione: 'si', valori: { nota: '' } });
test('0088 D7: con Infomaniak un 401 o un 403 dà il rimedio di Infomaniak (token e Product ID), mai «la chiave Google»', async () => {
    for (const codice of [401, 403]) {
        const a = app();
        const toast = [];
        a.ctx.showToast = (m, tipo) => toast.push({ m: String(m), tipo });
        a.ctx.MappAIModal.open = NOTA_SI;
        a.ctx.electronAPI.generateInfomaniak = async () => { throw new Error('Infomaniak API Error (' + codice + '): rifiutato'); };
        assert.equal(await a.ctx.MappAIVisione.nuovaScheda(FOTO), null);
        const errori = toast.filter(x => x.tipo === 'error').map(x => x.m);
        assert.equal(errori.length, 1, 'un solo avviso rosso, codice ' + codice);
        assert.equal(errori[0].includes('La chiave API non è valida per questo servizio.'), true);
        assert.equal(errori[0].includes('Controlla il token e il Product ID di Infomaniak nelle Impostazioni AI.'), true, errori[0]);
        assert.equal(errori[0].includes('Google'), false, errori[0]);
    }
});

test('0088 D7: con Google la stessa chiave rifiutata dà ancora il rimedio di Google', async () => {
    const a = app({ provider: 'google' });
    const toast = [];
    a.ctx.showToast = (m, tipo) => toast.push({ m: String(m), tipo });
    a.ctx.MappAIModal.open = NOTA_SI;
    a.ctx.fetchModelAPI = async () => { throw new Error('API key not valid (403)'); };
    assert.equal(await a.ctx.MappAIVisione.nuovaScheda(FOTO), null);
    const errori = toast.filter(x => x.tipo === 'error').map(x => x.m);
    assert.equal(errori.length, 1);
    assert.equal(errori[0].includes('Controlla la chiave Google nelle Impostazioni AI.'), true, errori[0]);
    assert.equal(errori[0].includes('Infomaniak'), false);
});

test('0088 D7: un errore che NON è di chiave con Infomaniak (429) non cambia: resta il suo rimedio', async () => {
    const a = app();
    const toast = [];
    a.ctx.showToast = (m, tipo) => toast.push({ m: String(m), tipo });
    a.ctx.MappAIModal.open = NOTA_SI;
    a.ctx.electronAPI.generateInfomaniak = async () => { throw new Error('Infomaniak API Error (429): troppe richieste'); };
    await a.ctx.MappAIVisione.nuovaScheda(FOTO);
    const errori = toast.filter(x => x.tipo === 'error').map(x => x.m);
    assert.equal(errori.length, 1);
    assert.equal(errori[0].includes('Controlla il token e il Product ID di Infomaniak'), false, errori[0]);
});

// ── il catalogo ──────────────────────────────────────────────────────────────
function catalogoFinto(extra) {
    return C.catalogue([{ id: GEMMA }, { id: QWEN }, { id: MINISTRAL }, { id: 'nuovo/Visione-Mai-Vista-9B' }],
        Object.assign({ all: [{ name: 'BAAI/bge-reranker-v2-m3' }, { name: 'bge_multilingual_gemma2' }],
            chat: [{ name: 'nuovo/Visione-Mai-Vista-9B' }], embeddings: [{ name: 'bge_multilingual_gemma2' }] }, extra || {}));
}
test('catalogo: leggeImmagini vero per ogni modello di chat (Gemma compresa), falso per embeddings e reranker (0088, D8)', () => {
    const per = id => catalogoFinto().find(r => r.id === id);
    /* i due elenchi di Infomaniak non dicono niente sulle modalità di input e Giacomo ha verificato che oggi tutti i modelli
       leggono immagini: l'elenco dei «solo testo» è vuoto, e la tendina delle foto segue il catalogo vivo */
    assert.equal(C.leggeImmagini(per(GEMMA)), true);
    assert.equal(C.leggeImmagini(per('bge_multilingual_gemma2')), false);
    assert.equal(C.leggeImmagini(per('BAAI/bge-reranker-v2-m3')), false);
    assert.equal(C.leggeImmagini(per(QWEN)), true);
    assert.equal(C.leggeImmagini(per(MINISTRAL)), true);
    assert.equal(C.leggeImmagini(per('nuovo/Visione-Mai-Vista-9B')), true);
    assert.equal(C.leggeImmagini(null), false);
    assert.equal(C.leggeImmagini({ id: '' }), false);
});
test('catalogo: un modello come Nemotron (non più elencato da Infomaniak) non è escluso a mano: nessun elenco di «solo testo» (0088, B5)', () => {
    const riga = { id: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-FP8' };
    const c = C.catalogue([riga, { id: QWEN }], { all: [], chat: [{ name: riga.id }, { name: QWEN }], embeddings: [] });
    /* se il catalogo vivo lo elenca come modello di chat, la tendina lo mostra: cade da sola quando Infomaniak lo ritira */
    assert.equal(C.leggeImmagini(c.find(r => r.id === riga.id)), true);
    /* e dichiarando le sue modalità un modello solo testo resta fuori: è la strada giusta per un modello futuro */
    assert.equal(C.leggeImmagini(Object.assign({}, c.find(r => r.id === riga.id), { input_modalities: ['text'] })), false);
});
test('catalogo: un campo di modalità, se c\'è, vale più dell\'elenco', () => {
    const qwen = catalogoFinto().find(r => r.id === QWEN);
    assert.equal(C.leggeImmagini(Object.assign({}, qwen, { input_modalities: ['text'] })), false);
    assert.equal(C.leggeImmagini(Object.assign({}, qwen, { modalities: 'text' })), false);
    const gemma = catalogoFinto().find(r => r.id === GEMMA);
    assert.equal(C.leggeImmagini(Object.assign({}, gemma, { input_modalities: ['text'] })), false);
    assert.equal(C.leggeImmagini(Object.assign({}, gemma, { input_modalities: ['text', 'image'] })), true);
    assert.equal(C.leggeImmagini(Object.assign({}, gemma, { architecture: { input_modalities: 'text+image' } })), true);
    // il campo di modalità non scavalca il ruolo: un reranker o un embedding multimodale non entra
    assert.equal(C.leggeImmagini({ id: 'BAAI/bge-reranker-v2-m3', roles: ['reranking'], modalities: ['text', 'image'] }), false);
    assert.equal(C.leggeImmagini({ id: 'bge_multilingual_gemma2', roles: ['embeddings'], input_modalities: ['image'] }), false);
});

// ── il lettore della scheda: gli a capo dentro le stringhe (decisione di Giacomo, 30/09) ─────────────
const V = require('../public/js/mappai-visione-core.js');
const SALVAGE = require('../public/js/mappai-json-salvage.js').salvage;
test('lettore: una risposta con a capo DENTRO le stringhe (Ministral 3) si legge intera, con e senza riparatore', () => {
    const raw = '```json\n{\n  "identita": {\n    "genere": "manifesto propagandistico",\n    "data": "1942"\n  },\n' +
        '  "osservazione": {\n    "descrizione": "Due figure \\"caricaturali\\" schiacciate da ingranaggi.",\n' +
        '    "testo": "\n    \'GRIND THESE HEELS IN OUR WHEELS\'\n    \'OF U.S. PRODUCTION\'\n    "\n  },\n' +
        '  "critica": {\n    "prova": "Le intenzioni\tdi chi l\'ha prodotta."\n  }\n}\n```';
    for (const sal of [null, SALVAGE]) {
        const a = V.normalizzaAnalisi(raw, sal);
        assert.equal(a.identita.genere, 'manifesto propagandistico');
        assert.equal(a.identita.data, '1942');
        assert.equal(a.osservazione.descrizione, 'Due figure "caricaturali" schiacciate da ingranaggi.');
        assert.equal(a.osservazione.testo, "'GRIND THESE HEELS IN OUR WHEELS' 'OF U.S. PRODUCTION'");
        assert.equal(a.critica.prova, "Le intenzioni di chi l'ha prodotta.");
    }
});
test('lettore: un JSON valido e il testo nudo escono come prima', () => {
    const valido = JSON.stringify({ identita: { genere: 'Dipinto', titolo: 'Riga\ncon a capo scritto bene' },
        interpretazione: { finalita: 'celebrare — lo dice la luce' } });
    const a = V.normalizzaAnalisi(valido, null);
    assert.equal(a.identita.titolo, 'Riga con a capo scritto bene');
    assert.equal(a.interpretazione.finalita, 'celebrare — lo dice la luce');
    // il ripiego usa il testo ORIGINALE: niente «\n» letterali nella descrizione
    const nudo = 'Una piazza con "virgolette aperte\ne un a capo';
    const b = V.normalizzaAnalisi(nudo, SALVAGE);
    assert.equal(b.osservazione.descrizione, 'Una piazza con "virgolette aperte e un a capo');
    assert.equal(b.identita.genere, '');
});

// ── l'app finta: DOM, localStorage, electronAPI ─────────────────────────────
function domFinto() {
    function el(tag) {
        const e = {
            tagName: String(tag).toUpperCase(), id: '', className: '', style: {}, attributi: {}, figli: [], parentNode: null,
            value: '', textContent: '', ascolti: {},
            setAttribute(k, v) { this.attributi[k] = String(v); if (k === 'id') this.id = String(v); },
            getAttribute(k) { return k in this.attributi ? this.attributi[k] : null; },
            appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.figli.push(c); return c; },
            insertBefore(c, ref) {
                if (ref == null) return this.appendChild(c);
                if (c.parentNode) c.parentNode.removeChild(c);
                c.parentNode = this; this.figli.splice(this.figli.indexOf(ref), 0, c); return c;
            },
            removeChild(c) { this.figli = this.figli.filter(x => x !== c); c.parentNode = null; return c; },
            get firstChild() { return this.figli[0] || null; },
            get nextSibling() { const p = this.parentNode; if (!p) return null; return p.figli[p.figli.indexOf(this) + 1] || null; },
            addEventListener(tipo, fn) { (this.ascolti[tipo] = this.ascolti[tipo] || []).push(fn); },
            removeEventListener() { },
            scatena(tipo) { (this.ascolti[tipo] || []).forEach(f => f.call(this, { type: tipo })); }
        };
        if (e.tagName === 'SELECT') {
            // come il DOM vero: un valore senza la sua opzione non si seleziona
            let v = '';
            Object.defineProperty(e, 'value', { get() { return this.figli.some(o => o.value === v) ? v : ''; },
                set(x) { v = this.figli.some(o => o.value === String(x)) ? String(x) : ''; } });
        }
        return e;
    }
    const body = el('body');
    const cerca = (n, id) => { for (const c of n.figli) { if (c.id === id) return c; const x = cerca(c, id); if (x) return x; } return null; };
    const document = {
        readyState: 'complete', body,
        createElement: el,
        getElementById: id => cerca(body, id),
        addEventListener() { }, removeEventListener() { }, querySelector() { return null; }
    };
    // la vista «Impostazioni AI», quanto basta
    const pid = el('input'); pid.id = 'infomaniak-product-id'; body.appendChild(pid);
    const bG = el('button'); bG.id = 'provider-google'; body.appendChild(bG);
    const bI = el('button'); bI.id = 'provider-infomaniak'; body.appendChild(bI);
    const vista = el('div'); body.appendChild(vista);
    const blocco = el('div'); vista.appendChild(blocco);
    const rel = el('div'); blocco.appendChild(rel);
    const principale = el('select'); principale.id = 'model-select'; rel.appendChild(principale);
    const setup = el('div'); setup.id = 'modelli-setup'; vista.appendChild(setup);
    return { document, pid, principale, vista };
}

function app(o) {
    o = o || {};
    const d = domFinto();
    d.pid.value = o.pid === undefined ? PID : o.pid;
    const store = new Map(Object.entries(o.local || {}));
    const scritture = [];
    const localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { scritture.push(k); store.set(k, String(v)); },
        removeItem: k => store.delete(k)
    };
    const chiamate = { generateInfomaniak: [], generateGemini: [], fetchModelAPI: [], list: [], usage: [], modale: [] };
    const osservatori = [];
    const ctx = {
        console: { log() { }, warn() { }, error() { } }, document: d.document, localStorage, setTimeout, clearTimeout, Promise, Buffer,
        btoa: s => Buffer.from(s, 'binary').toString('base64'),
        MutationObserver: function (fn) { this.observe = (nodo, opz) => osservatori.push({ nodo, opz, fn }); }
    };
    ctx.window = ctx;
    ctx.appState = { aiProvider: o.provider || 'infomaniak', infomaniakProductId: '' };
    ctx.showToast = () => { };
    ctx.getSystemKey = () => (ctx.appState.aiProvider === 'infomaniak' ? (o.token === undefined ? TOKEN_IM : o.token) : CHIAVE_G);
    ctx.getProviderKey = p => (p === 'infomaniak' ? (o.token === undefined ? TOKEN_IM : o.token) : CHIAVE_G);
    ctx.fetchModelAPI = async (payload, key) => {
        chiamate.fetchModelAPI.push({ payload, key });
        return { candidates: [{ content: { parts: [{ text: RISPOSTA }] }, finishReason: 'STOP' }] };
    };
    ctx.MappAIUsage = { setContext() { }, current: () => ({ cat: 'pipeline', sub: 'visione' }), record: r => chiamate.usage.push(r) };
    ctx.MappAIModal = { open: s => { chiamate.modale.push(s); return Promise.resolve({ azione: 'no' }); } };
    ctx.electronAPI = {
        getPathForFile: f => f.path,
        immaginePrepara: async ({ quale }) => ({ ok: true, base64: quale === 'lettura' ? BYTES : 'Rk9HTElP', mime: quale === 'lettura' ? 'image/png' : 'image/jpeg' }),
        generateInfomaniak: async arg => {
            chiamate.generateInfomaniak.push(arg);
            return { model: arg.payload.model, choices: [{ message: { content: RISPOSTA }, finish_reason: 'stop' }],
                usage: { prompt_tokens: 1500, completion_tokens: 400, total_tokens: 1900 } };
        },
        generateGemini: async arg => { chiamate.generateGemini.push(arg); throw new Error('mai'); },
        listInfomaniakModels: async arg => { chiamate.list.push(arg); return o.catalogo || catalogoFinto(); }
    };
    vm.createContext(ctx);
    for (const f of ['mappai-catalogo-core.js', 'infomaniak_bridge.js', 'mappai-visione-core.js', 'mappai-visione.js', 'mappai-visione-modello.js']) {
        vm.runInContext(JS(f), ctx, { filename: f });
    }
    const tendina = () => d.document.getElementById('visione-modello-select');
    const box = () => d.document.getElementById('visione-modello-box');
    return { ctx, d, store, scritture, chiamate, osservatori, tendina, box,
        valori: () => (tendina() ? tendina().figli.map(x => x.value) : []),
        testi: () => (tendina() ? tendina().figli.map(x => x.textContent) : []) };
}
const RISPOSTA = '{"identita":{"genere":"Manifesto","titolo":"Prova"},"osservazione":{"descrizione":"Una piazza"}}';
const FOTO = { name: 'manifesto.jpg', path: '/tmp/manifesto.jpg' };

// ── la lettura ───────────────────────────────────────────────────────────────
test('lettura con Infomaniak: UNA generateInfomaniak col modello per le foto e l\'immagine dentro; niente Google', async () => {
    const a = app({ local: { infomaniak_selected_model: GEMMA, mappai_visione_modello_infomaniak: MINISTRAL } });
    const og = a.d.document.createElement('option'); og.value = GEMMA; a.d.principale.appendChild(og);
    a.d.principale.value = GEMMA;
    assert.equal(a.d.principale.value, GEMMA);
    const scheda = await a.ctx.MappAIVisione.leggi(FOTO, { nota: '' });
    assert.equal(a.chiamate.generateInfomaniak.length, 1);
    assert.equal(a.chiamate.generateGemini.length, 0);
    assert.equal(a.chiamate.fetchModelAPI.length, 0);
    const arg = a.chiamate.generateInfomaniak[0];
    assert.equal(arg.payload.model, MINISTRAL);
    assert.equal(arg.productId, PID);
    assert.equal(arg.apiKey, TOKEN_IM);
    const parti = arg.payload.messages[arg.payload.messages.length - 1].content;
    assert.equal(Array.isArray(parti), true);
    assert.equal(parti.some(p => p.type === 'image_url' && p.image_url.url === 'data:image/png;base64,' + BYTES), true);
    assert.equal(JSON.stringify(a.chiamate.generateInfomaniak).includes(CHIAVE_G), false);
    assert.equal(scheda.identita.genere, 'Manifesto');
    // il registro dei consumi: una riga infomaniak, col modello per le foto
    assert.equal(a.chiamate.usage.length, 1);
    // la stessa riga di fetchModelAPI (app.js, «const usageRecord»): stesse chiavi, stessi valori
    assert.deepEqual(JSON.parse(JSON.stringify(a.chiamate.usage[0])), { provider: 'infomaniak', model: MINISTRAL,
        requestedModel: MINISTRAL, actualModel: MINISTRAL, usageKnown: true, inTok: 1500, outTok: 400, thoughts: 0,
        n: null, stop: 'STOP', tetto: 4096, ctx: { cat: 'pipeline', sub: 'visione' } });
    assert.equal(a.ctx.appState.generationUsage.costRecords.length, 1);
    assert.equal(a.ctx.appState.generationUsage.totalTokens, 1900);
});

test('lettura con Infomaniak senza scelta: il predefinito Qwen, mai il modello della tendina principale', async () => {
    const a = app({ local: { infomaniak_selected_model: GEMMA } });
    const og = a.d.document.createElement('option'); og.value = GEMMA; a.d.principale.appendChild(og);
    a.d.principale.value = GEMMA;
    await a.ctx.MappAIVisione.leggi(FOTO, {});
    assert.equal(a.chiamate.generateInfomaniak[0].payload.model, QWEN);
});

test('lettura con Infomaniak senza token o senza Product ID: nessuna chiamata, il messaggio della chiave', async () => {
    for (const o of [{ token: '' }, { pid: '' }]) {
        const a = app(o);
        await assert.rejects(a.ctx.MappAIVisione.leggi(FOTO, {}), e => {
            assert.equal(a.ctx.MappAIVisioneCore.diagnosi(e).codice, 'provider');
            return true;
        });
        assert.equal(a.chiamate.generateInfomaniak.length + a.chiamate.generateGemini.length + a.chiamate.fetchModelAPI.length, 0);
    }
});

test('lettura con Infomaniak: un errore del server non porta fuori token né Product ID', async () => {
    const a = app();
    a.ctx.electronAPI.generateInfomaniak = async () => { throw new Error('rifiutato ' + TOKEN_IM + ' su ' + PID); };
    await assert.rejects(a.ctx.MappAIVisione.leggi(FOTO, {}), e => {
        assert.equal(e.message.includes(TOKEN_IM), false);
        assert.equal(e.message.includes(PID), false);
        return true;
    });
});

test('lettura con Google: come prima, da fetchModelAPI con la chiave Google', async () => {
    const a = app({ provider: 'google', local: { mappai_visione_modello_infomaniak: MINISTRAL } });
    await a.ctx.MappAIVisione.leggi(FOTO, {});
    assert.equal(a.chiamate.fetchModelAPI.length, 1);
    assert.equal(a.chiamate.fetchModelAPI[0].key, CHIAVE_G);
    assert.equal(a.chiamate.fetchModelAPI[0].payload.contents[0].parts[0].inlineData.data, BYTES);
    assert.equal(a.chiamate.generateInfomaniak.length, 0);
});

test('riquadro «Che cosa sai di questa fonte?»: la riga dice dove va la foto', async () => {
    const im = app();
    assert.equal(await im.ctx.MappAIVisione.nuovaScheda(FOTO), null);
    const tIm = JSON.stringify(im.chiamate.modale[0].sezioni);
    assert.equal(tIm.includes('Infomaniak, in Svizzera'), true);
    assert.equal(tIm.includes('fuori dalla Svizzera'), false);
    const g = app({ provider: 'google' });
    await g.ctx.MappAIVisione.nuovaScheda(FOTO);
    assert.equal(JSON.stringify(g.chiamate.modale[0].sezioni).includes('Google, fuori dalla Svizzera'), true);
});

// ── la tendina ───────────────────────────────────────────────────────────────
test('tendina: nasce sotto «Modello AI» e si riempie dal catalogo vivo: tutti i modelli di chat, Gemma compresa, non embeddings né reranker (0088)', async () => {
    const a = app();
    assert.equal(!!a.box(), true);
    assert.equal(a.box().parentNode === a.d.vista, true);
    assert.equal(a.box().nextSibling && a.box().nextSibling.id, 'modelli-setup');
    await a.ctx.MappAIVisioneModello.riempi();
    assert.equal(a.chiamate.list.length, 1);
    assert.deepEqual(a.valori().slice().sort(), [GEMMA, MINISTRAL, QWEN, 'nuovo/Visione-Mai-Vista-9B'].sort());
    assert.equal(a.tendina().value, QWEN);
    assert.equal(a.testi().some(x => x.includes('Non disponibile')), false);
    assert.equal(a.box().style.display, '');
});

test('tendina: si riempie quando si riempie #model-select (osservatore), una chiamata sola per ridisegno', async () => {
    const a = app();
    assert.deepEqual(a.osservatori.map(o => o.nodo.id), ['model-select', 'provider-google', 'provider-infomaniak']);
    a.osservatori[0].fn([]); a.osservatori[0].fn([]); a.osservatori[0].fn([]);
    await riposo(90);
    assert.equal(a.chiamate.list.length, 1);
    assert.equal(a.valori().includes(GEMMA), true);
    assert.equal(a.valori().includes('bge_multilingual_gemma2'), false);
});

test('tendina: il valore salvato fuori catalogo resta, con «Non disponibile nel catalogo aggiornato»', async () => {
    const a = app({ local: { mappai_visione_modello_infomaniak: 'vecchio/Modello-Foto-1B' } });
    await a.ctx.MappAIVisioneModello.riempi();
    assert.equal(a.tendina().value, 'vecchio/Modello-Foto-1B');
    assert.equal(a.testi().some(x => x.startsWith('vecchio/Modello-Foto-1B') && x.includes('Non disponibile nel catalogo aggiornato')), true);
});

test('tendina: la scelta del docente scrive la chiave dello 0066; con Google la tendina non si vede', async () => {
    const a = app();
    await a.ctx.MappAIVisioneModello.riempi();
    a.tendina().value = MINISTRAL; a.tendina().scatena('change');
    assert.equal(a.store.get('mappai_visione_modello_infomaniak'), MINISTRAL);
    assert.equal(a.ctx.MappAIVisioneModello.modello(), MINISTRAL);
    a.ctx.appState.aiProvider = 'google';
    const prima = a.chiamate.list.length;
    await a.ctx.MappAIVisioneModello.riempi();
    assert.equal(a.box().style.display, 'none');
    assert.equal(a.chiamate.list.length, prima);
});

// ── il patto con lo 0064 ────────────────────────────────────────────────────
test('patto 0064: chiave vuota e mappai_config_visione piena → la tendina nasce su Ministral, senza scrivere', async () => {
    const a = app({ local: { mappai_config_visione: MINISTRAL } });
    assert.equal(a.tendina().value, MINISTRAL);
    assert.equal(a.ctx.MappAIVisioneModello.modello(), MINISTRAL);
    await a.ctx.MappAIVisioneModello.riempi();
    assert.equal(a.tendina().value, MINISTRAL);
    await a.ctx.MappAIVisione.leggi(FOTO, {});
    assert.equal(a.chiamate.generateInfomaniak[0].payload.model, MINISTRAL);
    assert.equal(a.scritture.includes('mappai_config_visione'), false);
    assert.equal(a.scritture.includes('mappai_visione_modello_infomaniak'), false);
});

test('patto 0064: imposta(id) scrive la chiave dello 0066 e seleziona la voce; un id non valido non scrive e non lancia', async () => {
    const a = app();
    await a.ctx.MappAIVisioneModello.riempi();
    a.ctx.MappAIVisioneModello.imposta(MINISTRAL);
    assert.equal(a.store.get('mappai_visione_modello_infomaniak'), MINISTRAL);
    assert.equal(a.tendina().value, MINISTRAL);
    a.ctx.MappAIVisioneModello.imposta('altro/Fuori-Catalogo-2B');
    assert.equal(a.tendina().value, 'altro/Fuori-Catalogo-2B');
    assert.equal(a.testi().some(x => x.includes('Non disponibile nel catalogo aggiornato')), true);
    const n = a.scritture.length;
    assert.doesNotThrow(() => a.ctx.MappAIVisioneModello.imposta('non valido !'));
    assert.doesNotThrow(() => a.ctx.MappAIVisioneModello.imposta(undefined));
    assert.equal(a.scritture.length, n);
    assert.equal(a.store.get('mappai_visione_modello_infomaniak'), 'altro/Fuori-Catalogo-2B');
    assert.equal(a.scritture.includes('mappai_config_visione'), false);
});

test('tendina: un cambio di fornitore col catalogo giù la mostra e la nasconde lo stesso (bottoni del fornitore)', async () => {
    const a = app({ provider: 'google' });
    assert.equal(a.box().style.display, 'none');
    a.ctx.electronAPI.listInfomaniakModels = async () => { throw new Error('Catalogo Infomaniak non aggiornato.'); };
    a.ctx.appState.aiProvider = 'infomaniak';
    a.osservatori.find(o => o.nodo.id === 'provider-infomaniak').fn([]);   // switchAIProvider riscrive il bottone
    await riposo(90);
    assert.equal(a.box().style.display, '');
    assert.equal(a.tendina().value, QWEN);
    assert.equal(a.d.document.getElementById('visione-modello-box').figli[3].textContent.includes('Catalogo non aggiornato'), true);
    a.ctx.appState.aiProvider = 'google';
    a.osservatori.find(o => o.nodo.id === 'provider-google').fn([]);
    await riposo(90);
    assert.equal(a.box().style.display, 'none');
});

test('tendina: la gara — vale l\'ultimo giro partito, anche se il primo risponde dopo', async () => {
    const a = app();
    const attese = [];
    a.ctx.electronAPI.listInfomaniakModels = () => new Promise(r => attese.push(r));
    const p1 = a.ctx.MappAIVisioneModello.riempi();
    const p2 = a.ctx.MappAIVisioneModello.riempi();
    attese[1](C.catalogue([{ id: MINISTRAL }], {}));
    await p2;
    attese[0](catalogoFinto());
    await p1;
    assert.deepEqual(a.valori(), [MINISTRAL, QWEN]);
    assert.equal(a.testi()[1].includes('Non disponibile'), true);
});

test('tendina: un id del catalogo che non si potrebbe salvare non si offre', async () => {
    const a = app({ catalogo: catalogoFinto().concat(C.catalogue([{ id: 'strano/Modello:con+segni' }], {})) });
    await a.ctx.MappAIVisioneModello.riempi();
    assert.equal(a.valori().includes('strano/Modello:con+segni'), false);
});
