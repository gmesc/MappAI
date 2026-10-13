'use strict';
/*
 * config-import.test.js — «Importa configurazione» (packet 0064): il guscio
 * `mappai-config-import.js` e il core `mappai-config-core.js` VERI in una vm,
 * davanti a un DOM finto (il riquadro Infomaniak della vista «Impostazioni AI»,
 * i due campi, la tendina) e a gestori finti che fanno quello che fanno i veri:
 * `switchAIProvider` scrive `ai_provider` e chiama `refreshGeminiModels` senza
 * aspettarlo (app.js:440-495), `updateInfomaniakProductId` scrive
 * `infomaniak_product_id` (app.js:423), `onModelSelectChange` sceglie la chiave dal
 * fornitore attivo (app.js:430), `refreshGeminiModels` legge la chiave e il
 * Product ID dai campi e, se mancano, dà il toast rosso (mappai-ui-modals.js:1165,
 * :1179).
 *
 * In coda, «La gara»: `window.refreshGeminiModels` estratta PER TESTO da
 * `public/js/mappai-ui-modals.js` (come review-store.test.js estrae da main.js) e
 * fatta girare con due risposte di rete che arrivano in ordine inverso.
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
const J = x => JSON.parse(JSON.stringify(x));
const riposo = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

const TOKEN = 'QzX9wKtokenDiProvaPerLaDemo_0123456789';
const PREFISSO = TOKEN.slice(0, 6);
const VECCHIO = 'VeCcHiOtokenDiPrimaDelDocente_987654321';
const PID = '105999';
const VISIONE = 'mistralai/Ministral-3-14B-Instruct-2512';
const NOME_FILE ='MappAI - configurazione BEDIGLIORA_001.mappai-config';
const FASI = {
  mappa: 'google/gemma-4-31B-it', materiali: 'google/gemma-4-31B-it',
  embeddings: 'bge_multilingual_gemma2', giudice: null, reranking: 'BAAI/bge-reranker-v2-m3'
};

function configurazione(over) {
  return Object.assign({
    formato: 'mappai-configurazione', versione: 1, nome: 'BEDIGLIORA_001', fornitore: 'infomaniak',
    infomaniak: { token: TOKEN, productId: PID }, modello: 'google/gemma-4-31B-it',
    fasi: Object.assign({}, FASI), visione: VISIONE, creato: '2026-09-30', nota: 'File personale: contiene una chiave…'
  }, over || {});
}
const testoDi = o => JSON.stringify(o);

// ── un DOM finto, quanto basta al guscio ────────────────────────────────────
function domFinto() {
  let body = null;
  function el(tag) {
    const e = {
      tagName: String(tag).toUpperCase(), id: '', className: '', style: {}, attributi: {}, figli: [], parentNode: null,
      clic: 0, value: '', files: null, textContent: '', ascolti: {}, type: '', accept: '',
      setAttribute(k, v) { this.attributi[k] = String(v); if (k === 'id') this.id = String(v); if (k === 'type') this.type = String(v); },
      getAttribute(k) { return k === 'id' ? (this.id || null) : (k in this.attributi ? this.attributi[k] : null); },
      hasAttribute(k) { return this.getAttribute(k) != null; },
      appendChild(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.figli.push(c); return c; },
      insertBefore(c, ref) {
        if (ref == null) return this.appendChild(c);
        const i = this.figli.indexOf(ref);
        if (i < 0) throw new Error('insertBefore: il riferimento non è figlio');
        if (c.parentNode) c.remove();
        c.parentNode = this; this.figli.splice(this.figli.indexOf(ref), 0, c); return c;
      },
      remove() { const p = this.parentNode; if (p) { p.figli = p.figli.filter(x => x !== this); this.parentNode = null; } },
      addEventListener(tipo, fn) { (this.ascolti[tipo] = this.ascolti[tipo] || []).push(fn); },
      removeEventListener() { },
      click() { this.clic++; (this.ascolti.click || []).forEach(f => f.call(this, { type: 'click', preventDefault() { } })); },
      get isConnected() { let n = this; while (n) { if (n === body) return true; n = n.parentNode; } return false; }
    };
    return e;
  }
  body = el('body');
  const cerca = (n, id) => { for (const c of n.figli) { if (c.id === id) return c; const x = cerca(c, id); if (x) return x; } return null; };
  const ascoltiDoc = {};
  const document = {
    body, readyState: 'loading',
    createElement: tag => el(tag),
    getElementById: id => cerca(body, id),
    addEventListener(tipo, fn) { (ascoltiDoc[tipo] = ascoltiDoc[tipo] || []).push(fn); },
    removeEventListener() { }
  };
  const lancia = tipo => (ascoltiDoc[tipo] || []).forEach(f => f({ type: tipo }));
  // la vista «Impostazioni AI»: il riquadro Infomaniak con i suoi figli diretti
  const riquadro = el('div'); riquadro.id = 'infomaniak-api-key-container';
  const nota = el('p'); nota.id = 'infomaniak-reranker-nota';
  const bloccoToken = el('div'); bloccoToken.id = 'blocco-token';
  const relative = el('div');
  const campoToken = el('input'); campoToken.id = 'infomaniak-api-key-input';
  relative.appendChild(campoToken); bloccoToken.appendChild(relative);
  const bloccoPid = el('div'); bloccoPid.id = 'blocco-pid';
  const campoPid = el('input'); campoPid.id = 'infomaniak-product-id';
  bloccoPid.appendChild(campoPid);
  riquadro.appendChild(nota); riquadro.appendChild(bloccoToken); riquadro.appendChild(bloccoPid);
  body.appendChild(riquadro);
  const tendina = el('select'); tendina.id = 'model-select';
  body.appendChild(tendina);
  return { document, body, el, lancia, riquadro, campoToken, campoPid, tendina };
}

// ── il banco: core e guscio veri in una vm ─────────────────────────────────
function banco(o = {}) {
  const d = domFinto();
  const local = new Map(Object.entries(o.local || {}));
  const accessi = [];          // ogni getItem/setItem/removeItem: { op, k }
  const eventi = [];           // l'ordine delle chiamate ai gestori
  const refresh = [];          // a ogni refreshGeminiModels: i valori dei due campi
  const toast = [];
  const consolle = [];
  const segreti = new Map();
  const conferme = [];
  const letture = { n: 0 };
  const modelli = { salvati: [], accesi: 0, render: 0 };
  const visioni = [];
  const g = {
    console: {
      log: (...a) => consolle.push(a.map(String).join(' ')), info: (...a) => consolle.push(a.map(String).join(' ')),
      warn: (...a) => consolle.push(a.map(String).join(' ')), error: (...a) => consolle.push(a.map(String).join(' '))
    },
    document: d.document, setTimeout, clearTimeout, Promise,
    localStorage: {
      getItem: k => { accessi.push({ op: 'get', k }); return local.has(k) ? local.get(k) : null; },
      setItem: (k, v) => { accessi.push({ op: 'set', k }); local.set(k, String(v)); },
      removeItem: k => { accessi.push({ op: 'remove', k }); local.delete(k); }
    },
    appState: { aiProvider: o.provider || 'google', infomaniakProductId: '', db: { nodes: [], links: [] } },
    FileReader: class {
      constructor() { letture.n++; this.result = null; this.onload = null; this.onerror = null; }
      readAsText(f) { setImmediate(() => { this.result = f._testo; if (this.onload) this.onload({}); }); }
    },
    showToast: (msg, tipo) => { toast.push({ msg: String(msg), tipo: tipo || 'error' }); }
  };
  g.window = g;
  g.updateInfomaniakProductId = v => {
    eventi.push('updateInfomaniakProductId');
    const val = v ? String(v).trim() : '';
    g.localStorage.setItem('infomaniak_product_id', val); g.appState.infomaniakProductId = val;
  };
  g.onModelSelectChange = m => {
    eventi.push('onModelSelectChange');
    const k = g.appState.aiProvider === 'infomaniak' ? 'infomaniak_selected_model' : 'gemini_selected_model';
    g.localStorage.setItem(k, m);
    g.console.log(`[Modello] Salvato: ${m} (${g.appState.aiProvider})`);
  };
  g.refreshGeminiModels = async () => {
    eventi.push('refreshGeminiModels');
    const voce = { token: d.campoToken.value, pid: d.campoPid.value, provider: g.appState.aiProvider, finito: false };
    refresh.push(voce);
    if (!voce.token) g.showToast('Inserisci prima una API Key per caricare i modelli.', 'error');
    else if (g.appState.aiProvider === 'infomaniak' && !voce.pid) g.showToast('Inserisci il Product ID per caricare i modelli Infomaniak.', 'error');
    await riposo(3);
    voce.finito = true;
  };
  g.switchAIProvider = p => {
    eventi.push('switchAIProvider');
    g.appState.aiProvider = p;
    g.localStorage.setItem('ai_provider', p);
    if (g.refreshGeminiModels) g.refreshGeminiModels();   // come app.js:494: senza aspettarlo
  };
  if (o.saveSecureKey) {
    g.saveSecureKey = async (k, v) => { eventi.push('saveSecureKey:' + k); segreti.set(k, v); };
  }
  if (o.modal !== false) {
    g.MappAIModal = {
      conferma: opzioni => { conferme.push({ titolo: String(opzioni && opzioni.titolo), testo: String(opzioni && opzioni.testo) }); return Promise.resolve(!!o.rispostaConferma); }
    };
  }
  if (o.modelli) {
    g.MappAIModelli = {
      salvaProfilo: input => {
        eventi.push('salvaProfilo');
        modelli.salvati.push(J(input));
        if (o.modelli === 'lancia') throw new Error('modelli_profilo_non_valido');
        g.localStorage.setItem('mappai_modelli_' + input.provider, JSON.stringify(input));
        return input;
      },
      accendi: () => { eventi.push('accendi'); modelli.accesi++; g.localStorage.setItem('mappai_multimodello', '1'); }
    };
    g.MappAIModelliUI = { render: () => { eventi.push('render'); modelli.render++; } };
  }
  if (o.visione) {
    // il gancio dello 0066 (v4): il modulo delle foto riceve l'identificativo
    g.MappAIVisioneModello = {
      imposta: id => {
        eventi.push('imposta'); visioni.push(id);
        if (o.visione === 'lancia') throw new Error('modello per le foto non valido');
      }
    };
  }
  const ctx = vm.createContext(g);
  vm.runInContext(JS('mappai-config-core.js'), ctx, { filename: 'mappai-config-core.js' });
  vm.runInContext(JS('mappai-config-import.js'), ctx, { filename: 'mappai-config-import.js' });
  // gli accessi fatti prima dell'importazione (il montaggio) non contano
  return { g, d, local, accessi, eventi, refresh, toast, consolle, segreti, conferme, letture, modelli, visioni, I: g.MappAIConfigImport };
}

const bottone = h => h.d.document.getElementById('btn-importa-config');
const erroriToast = h => h.toast.filter(t => t.tipo === 'error');
const scrittureLS = (h, da = 0) => h.accessi.slice(da).filter(a => a.op !== 'get').map(a => a.k);
const inputFile = h => h.d.body.figli.filter(c => c.tagName === 'INPUT' && c.type === 'file');

// ── il bottone ──────────────────────────────────────────────────────────────
test('il bottone nasce nel riquadro Infomaniak, subito prima del blocco del token', () => {
  const h = banco();
  assert.equal(!!bottone(h), false, 'prima di DOMContentLoaded il bottone non c\'è');
  h.d.lancia('DOMContentLoaded');
  const b = bottone(h);
  assert.equal(!!b, true);
  assert.equal(b.getAttribute('type'), 'button');
  assert.equal(b.textContent, 'Importa configurazione');
  assert.equal(b.className.includes('input_button_xs'), true);
  // il figlio diretto del riquadro che contiene il bottone
  let blocco = b; while (blocco.parentNode && blocco.parentNode !== h.d.riquadro) blocco = blocco.parentNode;
  assert.equal(blocco.parentNode === h.d.riquadro, true, 'il bottone sta nel riquadro');
  const i = h.d.riquadro.figli.indexOf(blocco);
  const iToken = h.d.riquadro.figli.findIndex(c => c.id === 'blocco-token');
  assert.equal(i, iToken - 1, 'subito prima del blocco del token');
  assert.equal(h.d.riquadro.figli.findIndex(c => c.id === 'infomaniak-reranker-nota') < i, true, 'dopo la nota del reranker');
  // l'aiuto accanto al bottone
  const testi = []; (function giro(n) { if (n.textContent) testi.push(n.textContent); n.figli.forEach(giro); })(blocco);
  assert.equal(testi.some(t => t.startsWith('Hai ricevuto un file «MappAI - configurazione»?')), true);
});

test('con mappai_importa_config = \'0\' il bottone non nasce', () => {
  const h = banco({ local: { mappai_importa_config: '0' } });
  h.d.lancia('DOMContentLoaded');
  assert.equal(!!bottone(h), false);
  assert.equal(h.d.riquadro.figli.length, 3, 'il riquadro è quello di oggi');
});

test('due DOMContentLoaded → un bottone solo', () => {
  const h = banco();
  h.d.lancia('DOMContentLoaded');
  h.d.lancia('DOMContentLoaded');
  let n = 0; (function giro(x) { if (x.id === 'btn-importa-config') n++; x.figli.forEach(giro); })(h.d.body);
  assert.equal(n, 1);
  assert.equal(h.d.riquadro.figli.length, 4);
});

test('caricato due volte, il modulo non si aggancia due volte', () => {
  const h = banco();
  vm.runInContext(JS('mappai-config-import.js'), h.g);
  h.d.lancia('DOMContentLoaded');
  assert.equal(h.d.riquadro.figli.length, 4);
});

// ── l'importazione, nell'ordine dei campi ──────────────────────────────────
test('file valido, cassetto vuoto: l\'ordine delle chiamate, nessun campo vuoto, nessun toast rosso', async () => {
  const h = banco();
  const r = await h.I.importaTesto(testoDi(configurazione({ fasi: undefined })));
  assert.equal(r.ok, true);
  assert.deepEqual(h.eventi, ['updateInfomaniakProductId', 'switchAIProvider', 'refreshGeminiModels',
    'onModelSelectChange', 'refreshGeminiModels']);
  // il token passa dal localStorage (niente saveSecureKey), PRIMA del fornitore
  const iToken = h.accessi.findIndex(a => a.op === 'set' && a.k === 'infomaniak_api_key');
  const iProvider = h.accessi.findIndex(a => a.op === 'set' && a.k === 'ai_provider');
  const iPid = h.accessi.findIndex(a => a.op === 'set' && a.k === 'infomaniak_product_id');
  const iModello = h.accessi.findIndex(a => a.op === 'set' && a.k === 'infomaniak_selected_model');
  assert.equal(iToken >= 0 && iPid > iToken && iProvider > iPid && iModello > iProvider, true, 'token → Product ID → fornitore → modello');
  assert.equal(h.local.get('infomaniak_api_key'), TOKEN);
  assert.equal(h.local.get('infomaniak_product_id'), PID);
  assert.equal(h.local.get('ai_provider'), 'infomaniak');
  assert.equal(h.local.get('infomaniak_selected_model'), 'google/gemma-4-31B-it');
  // ogni ricaricamento vede i due campi pieni
  assert.equal(h.refresh.length, 2);
  assert.equal(h.refresh.every(v => v.token === TOKEN && v.pid === PID), true, 'nessun ricaricamento con un campo vuoto');
  assert.equal(h.refresh[1].finito, true, 'l\'ultimo ricaricamento è atteso');
  assert.deepEqual(erroriToast(h), []);
  // i campi mostrano i valori del file
  assert.equal(h.d.campoToken.value, TOKEN);
  assert.equal(h.d.campoPid.value, PID);
  // il toast di riuscita: il nome, mai il token
  assert.equal(h.toast.length, 1);
  assert.equal(h.toast[0].tipo, 'success');
  assert.equal(h.toast[0].msg, 'Configurazione importata: BEDIGLIORA_001. Puoi cancellare il file che hai ricevuto: contiene il tuo token.');
  assert.equal(h.toast.some(t => t.msg.includes(PREFISSO)), false);
});

test('senza nome: «Configurazione importata.» e la stessa seconda frase', async () => {
  const h = banco();
  const c = configurazione({ fasi: undefined }); delete c.nome;
  await h.I.importaTesto(testoDi(c));
  assert.equal(h.toast[0].msg, 'Configurazione importata. Puoi cancellare il file che hai ricevuto: contiene il tuo token.');
});

test('senza modello nel file: nessun onModelSelectChange, il secondo ricaricamento c\'è', async () => {
  const h = banco();
  const c = configurazione({ fasi: undefined }); delete c.modello;
  await h.I.importaTesto(testoDi(c));
  assert.equal(h.eventi.includes('onModelSelectChange'), false);
  assert.equal(h.eventi.filter(e => e === 'refreshGeminiModels').length, 2);
});

test('modello non conforme: avviso nel toast, la tendina resta al docente', async () => {
  const h = banco();
  await h.I.importaTesto(testoDi(configurazione({ fasi: undefined, modello: 'gemma 4' })));
  assert.equal(h.eventi.includes('onModelSelectChange'), false);
  assert.equal(h.toast[0].msg.endsWith('Scegli tu il modello dalla tendina.'), true);
});

test('con window.saveSecureKey il token passa da lì, non da localStorage.setItem diretto', async () => {
  const h = banco({ saveSecureKey: true });
  await h.I.importaTesto(testoDi(configurazione({ fasi: undefined })));
  assert.equal(h.segreti.get('infomaniak_api_key'), TOKEN);
  assert.equal(h.accessi.some(a => a.op === 'set' && a.k === 'infomaniak_api_key'), false);
  assert.equal(h.eventi.indexOf('saveSecureKey:infomaniak_api_key') < h.eventi.indexOf('switchAIProvider'), true);
  assert.equal(h.eventi[0], 'saveSecureKey:infomaniak_api_key');
});

// ── la conferma sul token diverso ───────────────────────────────────────────
test('token diverso già presente, risposta no → nessuna scrittura, nessun gestore', async () => {
  const h = banco({ local: { infomaniak_api_key: VECCHIO }, rispostaConferma: false, modelli: true });
  const da = h.accessi.length;
  const r = await h.I.importaTesto(testoDi(configurazione()));
  assert.equal(r.ok, false);
  assert.equal(h.conferme.length, 1);
  assert.equal(h.conferme[0].titolo, 'Sostituire il token?');
  assert.equal(h.conferme[0].testo.startsWith('In MappAI c\'è già un token Infomaniak.'), true);
  assert.equal(h.conferme.some(c => c.testo.includes(PREFISSO) || c.titolo.includes(PREFISSO)), false);
  assert.deepEqual(scrittureLS(h, da), []);
  assert.deepEqual(h.eventi, []);
  assert.equal(h.local.get('infomaniak_api_key'), VECCHIO);
  assert.equal(h.d.campoToken.value, '');
  assert.equal(h.d.campoPid.value, '');
});

test('token diverso già presente, risposta sì → si importa', async () => {
  const h = banco({ local: { infomaniak_api_key: VECCHIO }, rispostaConferma: true });
  const r = await h.I.importaTesto(testoDi(configurazione({ fasi: undefined })));
  assert.equal(r.ok, true);
  assert.equal(h.conferme.length, 1);
  assert.equal(h.local.get('infomaniak_api_key'), TOKEN);
});

test('stesso token già presente → nessuna conferma', async () => {
  const h = banco({ local: { infomaniak_api_key: TOKEN }, rispostaConferma: false });
  const r = await h.I.importaTesto(testoDi(configurazione({ fasi: undefined })));
  assert.equal(r.ok, true);
  assert.equal(h.conferme.length, 0);
});

// ── i file che non vanno ────────────────────────────────────────────────────
for (const [caso, testo, atteso] of [
  ['versione 2', testoDi(configurazione({ versione: 2 })), 'Questa configurazione è di una versione di MappAI diversa dalla tua: aggiorna l\'app o chiedi un file nuovo.'],
  ['fornitore google', testoDi(configurazione({ fornitore: 'google' })), 'Questa versione di MappAI importa solo configurazioni Infomaniak.'],
  ['non JSON', 'questo non è JSON ' + TOKEN, 'Questo file non è una configurazione di MappAI.'],
  ['token corto', testoDi(configurazione({ infomaniak: { token: 'corto', productId: PID } })), 'Nel file manca il token o il Product ID, oppure non sono validi: chiedi un file nuovo.']
]) {
  test(`file con ${caso} → nessuna scrittura, toast d'errore senza valori`, async () => {
    const h = banco({ local: { infomaniak_api_key: VECCHIO }, modelli: true, saveSecureKey: true });
    const da = h.accessi.length;
    const r = await h.I.importaTesto(testo);
    assert.equal(r.ok, false);
    assert.deepEqual(scrittureLS(h, da), []);
    assert.deepEqual(h.eventi, []);
    assert.equal(h.conferme.length, 0);
    assert.equal(h.segreti.size, 0);
    assert.equal(h.toast.length, 1);
    assert.equal(h.toast[0].tipo, 'error');
    assert.equal(h.toast[0].msg, atteso);
    assert.equal(h.toast[0].msg.includes(PREFISSO) || h.toast[0].msg.includes(PID) || h.toast[0].msg.includes('BEDIGLIORA'), false);
  });
}

// ── le fasi ─────────────────────────────────────────────────────────────────
test('fasi: salvaProfilo con le cinque fasi, poi accendi una volta, poi render; il toast lo dice', async () => {
  const h = banco({ modelli: true });
  await h.I.importaTesto(testoDi(configurazione()));
  assert.equal(h.modelli.salvati.length, 1);
  assert.deepEqual(h.modelli.salvati[0], { schema: 'mappai-modelli@1', provider: 'infomaniak', modelli: FASI });
  assert.equal(h.modelli.accesi, 1);
  assert.equal(h.modelli.render, 1);
  const iS = h.eventi.indexOf('salvaProfilo'), iA = h.eventi.indexOf('accendi'), iR = h.eventi.indexOf('render');
  assert.equal(iS > h.eventi.indexOf('onModelSelectChange') && iA > iS && iR > iA, true, 'modello → salvaProfilo → accendi → render');
  assert.equal(h.eventi[h.eventi.length - 1], 'refreshGeminiModels', 'il secondo ricaricamento viene per ultimo');
  assert.equal(h.toast[0].msg.includes('MappAI ora usa un modello diverso per ogni fase del lavoro'), true);
  assert.equal(h.local.get('mappai_multimodello'), '1');
});

test('fasi: salvaProfilo che lancia → nessun accendi, toast con «Le fasi del file non sono valide»', async () => {
  const h = banco({ modelli: 'lancia' });
  const r = await h.I.importaTesto(testoDi(configurazione()));
  assert.equal(r.ok, true, 'il resto della configurazione vale');
  assert.equal(h.modelli.salvati.length, 1);
  assert.equal(h.modelli.accesi, 0);
  assert.equal(h.eventi.includes('accendi'), false);
  assert.equal(h.local.has('mappai_multimodello'), false);
  assert.equal(h.toast[0].tipo, 'success');
  assert.equal(h.toast[0].msg.includes('Le fasi del file non sono valide: restano quelle di prima.'), true);
  assert.equal(h.toast[0].msg.includes('MappAI ora usa un modello diverso'), false);
});

test('fasi non conformi nel file → né salvaProfilo né accendi, e l\'avviso', async () => {
  const h = banco({ modelli: true });
  const c = configurazione(); delete c.fasi.embeddings;
  await h.I.importaTesto(testoDi(c));
  assert.equal(h.modelli.salvati.length, 0);
  assert.equal(h.modelli.accesi, 0);
  assert.equal(h.toast[0].msg.includes('Le fasi del file non sono valide'), true);
});

test('file senza fasi → né salvaProfilo né accendi', async () => {
  const h = banco({ modelli: true });
  const c = configurazione(); delete c.fasi;
  await h.I.importaTesto(testoDi(c));
  assert.equal(h.modelli.salvati.length, 0);
  assert.equal(h.modelli.accesi, 0);
  assert.equal(h.eventi.includes('salvaProfilo') || h.eventi.includes('accendi'), false);
  assert.equal(h.toast[0].msg.includes('fase'), false);
});

// ── il modello per le foto (v4): la chiave sua e il gancio dello 0066 ───────
test('visione: mappai_config_visione vale l\'identificativo e imposta lo riceve una volta, dopo il secondo ricaricamento', async () => {
  const h = banco({ visione: true, modelli: true });
  const r = await h.I.importaTesto(testoDi(configurazione()));
  assert.equal(r.ok, true);
  assert.equal(h.local.get('mappai_config_visione'), VISIONE);
  assert.deepEqual(J(h.visioni), [VISIONE]);
  assert.equal(h.eventi.filter(e => e === 'imposta').length, 1);
  assert.equal(h.eventi.lastIndexOf('refreshGeminiModels') < h.eventi.indexOf('imposta'), true, 'il passo 8 viene dopo il 7');
  assert.equal(h.refresh[h.refresh.length - 1].finito, true, 'dopo l\'attesa del ricaricamento');
  const iVis = h.accessi.findIndex(a => a.op === 'set' && a.k === 'mappai_config_visione');
  const iMod = h.accessi.findIndex(a => a.op === 'set' && a.k === 'infomaniak_selected_model');
  assert.equal(iVis > iMod, true);
  assert.equal(h.toast[0].tipo, 'success');
  assert.equal(h.toast[0].msg.includes('foto'), false);
});

test('visione senza MappAIVisioneModello: nessun errore, la chiave si scrive lo stesso', async () => {
  const h = banco();
  const r = await h.I.importaTesto(testoDi(configurazione()));
  assert.equal(r.ok, true);
  assert.equal(h.local.get('mappai_config_visione'), VISIONE);
  assert.deepEqual(erroriToast(h), []);
});

test('visione: un imposta che lancia non ferma l\'importazione', async () => {
  const h = banco({ visione: 'lancia' });
  const r = await h.I.importaTesto(testoDi(configurazione()));
  assert.equal(r.ok, true);
  assert.equal(h.local.get('mappai_config_visione'), VISIONE);
  assert.equal(h.visioni.length, 1);
  assert.deepEqual(erroriToast(h), []);
  assert.equal(h.toast[0].tipo, 'success');
});

test('file senza visione: la chiave non si tocca e imposta non si chiama', async () => {
  const h = banco({ local: { mappai_config_visione: 'qualcosa/di-prima' }, visione: true });
  const c = configurazione(); delete c.visione;
  await h.I.importaTesto(testoDi(c));
  assert.equal(h.local.get('mappai_config_visione'), 'qualcosa/di-prima');
  assert.equal(h.accessi.some(a => a.op !== 'get' && a.k === 'mappai_config_visione'), false);
  assert.equal(h.visioni.length, 0);
});

test('visione non conforme: né chiave né imposta, e il toast lo dice', async () => {
  const h = banco({ visione: true });
  await h.I.importaTesto(testoDi(configurazione({ visione: 'mistralai/Ministral 3' })));
  assert.equal(h.local.has('mappai_config_visione'), false);
  assert.equal(h.visioni.length, 0);
  assert.equal(h.toast[0].tipo, 'success');
  assert.equal(h.toast[0].msg.includes('Il modello per le foto indicato nel file non è valido'), true);
  assert.equal(h.toast[0].msg.includes('Ministral'), false, 'nessun valore del file nel toast');
});

test('mappai_visione_modello_infomaniak (la chiave dello 0066) mai letta né scritta', async () => {
  for (const o of [{ visione: true }, {}, { visione: true, modelli: true, saveSecureKey: true }]) {
    const h = banco(Object.assign({ local: { mappai_visione_modello_infomaniak: 'Qwen/Qwen3.5-122B-A10B-FP8' } }, o));
    await h.I.importaTesto(testoDi(configurazione()));
    assert.equal(h.local.get('mappai_visione_modello_infomaniak'), 'Qwen/Qwen3.5-122B-A10B-FP8');
    assert.equal(h.accessi.some(a => a.k === 'mappai_visione_modello_infomaniak'), false);
  }
});

// ── la chiave del reranker delle citazioni non si tocca ─────────────────────
for (const v of ['1', '0']) {
  test(`mappai_reranker_infomaniak = '${v}': dopo vale lo stesso, e il guscio non l'ha mai letta né scritta`, async () => {
    const h = banco({ local: { mappai_reranker_infomaniak: v }, modelli: true, saveSecureKey: true });
    await h.I.importaTesto(testoDi(configurazione()));
    assert.equal(h.local.get('mappai_reranker_infomaniak'), v);
    assert.equal(h.accessi.some(a => a.k === 'mappai_reranker_infomaniak'), false);
  });
}

// ── le chiavi cambiate, il nome del file, la console ────────────────────────
test('dal bottone al file: solo le chiavi dei gestori, niente nome del file, niente token in console', async () => {
  const h = banco({ modelli: true });
  h.d.lancia('DOMContentLoaded');
  const prima = new Map(h.local);
  const da = h.accessi.length;
  bottone(h).click();
  const campi = inputFile(h);
  assert.equal(campi.length, 1, 'un campo file nascosto in body');
  assert.equal(campi[0].accept, '.mappai-config,.json');
  assert.equal(campi[0].hasAttribute('id'), false, 'senza id');
  assert.equal(campi[0].clic, 1, 'la scelta del file si apre');
  let nomeLetto = false;
  const testo = testoDi(configurazione());
  const file = { size: Buffer.byteLength(testo), _testo: testo, type: '' };
  Object.defineProperty(file, 'name', { get() { nomeLetto = true; return NOME_FILE; } });
  Object.defineProperty(file, 'path', { get() { nomeLetto = true; return '/Users/prova/Downloads/' + NOME_FILE; } });
  campi[0].files = [file];
  await campi[0].onchange();
  await riposo();
  assert.equal(inputFile(h).length, 0, 'il campo file si toglie dopo la scelta');
  assert.equal(h.letture.n, 1);
  assert.equal(nomeLetto, false, 'del file si usano solo i byte');
  const permesse = new Set(['ai_provider', 'infomaniak_api_key', 'infomaniak_product_id', 'infomaniak_selected_model',
    'mappai_modelli_infomaniak', 'mappai_multimodello', 'mappai_config_visione']);
  const cambiate = [...new Set(scrittureLS(h, da))];
  assert.deepEqual(cambiate.filter(k => !permesse.has(k)), [], 'chiavi fuori dall\'elenco');
  for (const [k, v] of h.local) {
    if (prima.get(k) === v) continue;
    assert.equal(k.includes('configurazione') || v.includes('configurazione') || v.includes('.mappai-config'), false, 'il nome del file non si salva');
  }
  assert.equal(h.consolle.some(l => l.includes(PREFISSO)), false, 'nessuna riga di console col token');
  assert.equal(h.toast.length, 1);
  assert.equal(h.toast[0].tipo, 'success');
});

test('la scelta annullata toglie il campo file e non scrive niente', () => {
  const h = banco();
  h.d.lancia('DOMContentLoaded');
  const da = h.accessi.length;
  bottone(h).click();
  const c = inputFile(h)[0];
  assert.equal(typeof c.oncancel, 'function');
  c.oncancel();
  assert.equal(inputFile(h).length, 0);
  assert.deepEqual(scrittureLS(h, da), []);
  assert.equal(h.letture.n, 0);
});

test('un file oltre TETTO_BYTE si rifiuta prima di leggerlo', async () => {
  const h = banco();
  h.d.lancia('DOMContentLoaded');
  const da = h.accessi.length;
  bottone(h).click();
  const c = inputFile(h)[0];
  c.files = [{ size: 65537, _testo: testoDi(configurazione()) }];
  await c.onchange();
  await riposo();
  assert.equal(h.letture.n, 0, 'nessun FileReader');
  assert.deepEqual(scrittureLS(h, da), []);
  assert.equal(h.toast.length, 1);
  assert.equal(h.toast[0].tipo, 'error');
  assert.equal(h.toast[0].msg, 'Questo file non è una configurazione di MappAI.');
});

test('nessuna riga di console porta il token, in nessun ramo', async () => {
  for (const o of [{}, { saveSecureKey: true }, { modelli: 'lancia' }, { local: { infomaniak_api_key: VECCHIO }, rispostaConferma: false }]) {
    const h = banco(o);
    await h.I.importaTesto(testoDi(configurazione()));
    await h.I.importaTesto(testoDi(configurazione({ versione: 2 })));
    await h.I.importaTesto('x' + TOKEN);
    assert.equal(h.consolle.some(l => l.includes(PREFISSO)), false);
    assert.equal(h.toast.some(t => t.msg.includes(PREFISSO)), false);
  }
});

// ── statico: il gestore del campo del token è ancora quello che il guscio ripete ──
test('statico: l\'onblur di #infomaniak-api-key-input usa ancora \'infomaniak_api_key\' e saveSecureKey', () => {
  const html = fs.readFileSync(path.join(RADICE, 'public', 'index.html'), 'utf8');
  const m = html.match(/id="infomaniak-api-key-input"\s+onblur="([^"]*)"/);
  assert.equal(!!m, true, 'l\'onblur del campo del token c\'è');
  assert.equal(m[1].includes('\'infomaniak_api_key\''), true);
  assert.equal(m[1].includes('saveSecureKey'), true);
  assert.equal(m[1].includes('localStorage.setItem(\'infomaniak_api_key\''), true);
});

// ── La gara: refreshGeminiModels VERA, estratta per testo ───────────────────
function gara(o = {}) {
  const src = JS('mappai-ui-modals.js');
  const inizio = src.indexOf('window.refreshGeminiModels = async function');
  assert.equal(inizio >= 0, true, 'refreshGeminiModels non trovata');
  const fine = src.indexOf('\n}', inizio) + 2;
  const codice = src.slice(inizio, fine);
  const local = new Map(Object.entries(o.local || {}));
  const rese = [];
  const attese = [];   // una per chiamata alla rete: { risolvi, rifiuta }
  const toast = [];
  const catalogo = { aggiornato: 0 };
  const tendina = { innerHTML: '', value: '', options: [] };
  const campoPid = { value: PID };
  const stato = { innerText: '', classList: { add() { }, remove() { } } };
  const rotellina = { style: { animation: '' } };
  const g = {
    console: { log() { }, info() { }, warn() { }, error() { } },
    appState: { aiProvider: o.provider || 'infomaniak', infomaniakProductId: PID },
    localStorage: {
      getItem: k => (local.has(k) ? local.get(k) : null),
      setItem: (k, v) => { local.set(k, String(v)); }, removeItem: k => { local.delete(k); }
    },
    document: {
      getElementById: id => ({ 'model-select': tendina, 'infomaniak-product-id': campoPid,
        'models-status': stato, 'refresh-models-icon': rotellina })[id] || null
    },
    /* con Infomaniak la rete LANCIA in caso d'errore (main.js:612): `rifiuta` */
    electronAPI: Object.freeze({
      listInfomaniakModels: () => new Promise((r, x) => { attese.push({ risolvi: r, rifiuta: x }); }),
      listModels: () => new Promise((r, x) => { attese.push({ risolvi: r, rifiuta: x }); })
    }),
    MappAIModelliUI: { aggiornaCatalogo: () => { catalogo.aggiornato++; } },
    MappAICatalogo: { forPhase: rows => rows },
    matchModelKB: () => ({ tier: '🇨🇭 Swiss Made' }),
    renderModelSelect: (models, el, currentValue) => { rese.push({ n: models.length, currentValue }); },
    _escModali: s => String(s),
    showToast: (m, t) => { toast.push({ m: String(m), t }); }
  };
  g.window = g;
  g.getSystemKey = () => TOKEN;
  g.t = (k, f) => f;
  vm.createContext(g);
  vm.runInContext(codice, g);
  return { g, local, rese, attese, toast, catalogo, stato, rotellina, refresh: () => g.refreshGeminiModels() };
}
const CATALOGO = [{ id: 'google/gemma-4-31B-it' }, { id: 'swiss-ai/Apertus-v1.5-70B' }];

test('la gara: due ricaricamenti, il secondo risponde per primo → una resa sola, col modello nuovo', async () => {
  const h = gara({ local: { infomaniak_selected_model: 'vecchio/modello-di-prima' } });
  const p1 = h.refresh();                       // il ricaricamento dentro switchAIProvider
  await riposo(2);
  h.local.set('infomaniak_selected_model', 'google/gemma-4-31B-it');   // onModelSelectChange
  const p2 = h.refresh();                       // il ricaricamento atteso dal guscio
  await riposo(2);
  assert.equal(h.attese.length, 2, 'due chiamate alla rete');
  h.attese[1].risolvi(CATALOGO);                // la seconda risponde per prima
  await p2;
  h.attese[0].risolvi(CATALOGO);                // poi la prima, superata
  await p1;
  assert.equal(h.rese.length, 1, 'renderModelSelect una volta sola');
  assert.equal(h.rese[0].currentValue, 'google/gemma-4-31B-it');
  assert.deepEqual(h.toast, []);
});

test('la gara: il modello cambiato durante l\'attesa della rete arriva nella tendina', async () => {
  const h = gara({ local: { infomaniak_selected_model: 'vecchio/modello-di-prima' } });
  const p = h.refresh();
  await riposo(2);
  h.local.set('infomaniak_selected_model', 'google/gemma-4-31B-it');
  h.attese[0].risolvi(CATALOGO);
  await p;
  assert.equal(h.rese.length, 1);
  assert.equal(h.rese[0].currentValue, 'google/gemma-4-31B-it');
});

test('la gara: una chiamata sola resta com\'è oggi (una resa col valore salvato)', async () => {
  const h = gara({ local: { infomaniak_selected_model: 'swiss-ai/Apertus-v1.5-70B' } });
  const p = h.refresh();
  await riposo(2);
  h.attese[0].risolvi(CATALOGO);
  await p;
  assert.equal(h.rese.length, 1);
  assert.equal(h.rese[0].currentValue, 'swiss-ai/Apertus-v1.5-70B');
  assert.equal(h.rese[0].n, 2);
  assert.equal(h.local.has('infomaniak_available_models'), true, 'il catalogo si deposita come oggi');
});

test('la gara, ramo errore: la prima RIFIUTATA dopo che la seconda è riuscita non tocca catalogo, stato e pannello', async () => {
  const h = gara({ local: { infomaniak_selected_model: 'google/gemma-4-31B-it' } });
  const p1 = h.refresh();
  await riposo(2);
  const p2 = h.refresh();
  await riposo(2);
  h.attese[1].risolvi(CATALOGO);
  await p2;
  const statoDopoSeconda = h.local.get('infomaniak_catalogue_state');
  const messaggio = h.stato.innerText;
  assert.equal(JSON.parse(statoDopoSeconda).stale, false);
  assert.equal(h.catalogo.aggiornato, 1, 'la seconda aggiorna il pannello delle fasi');
  h.attese[0].rifiuta(new Error('rete giù'));
  await p1;
  assert.equal(h.local.get('infomaniak_catalogue_state'), statoDopoSeconda, 'lo stato del catalogo è quello della seconda');
  assert.equal(JSON.parse(h.local.get('infomaniak_catalogue_state')).stale, false);
  assert.equal(h.catalogo.aggiornato, 1, 'nessun aggiornaCatalogo dalla prima');
  assert.equal(h.stato.innerText, messaggio, 'il messaggio di stato non cambia');
  assert.equal(h.rese.length, 1);
  assert.deepEqual(h.toast, []);
});

test('la gara, ramo errore: una chiamata sola che fallisce resta com\'è oggi (stale:true)', async () => {
  const h = gara({ local: { infomaniak_catalogue_state: JSON.stringify({ fetchedAt: '2026-09-29T10:00:00.000Z', stale: false }) } });
  const p = h.refresh();
  await riposo(2);
  assert.equal(h.rotellina.style.animation !== '', true, 'la rotellina gira durante l\'attesa');
  h.attese[0].rifiuta(new Error('rete giù'));
  await p;
  const st = JSON.parse(h.local.get('infomaniak_catalogue_state'));
  assert.equal(st.stale, true);
  assert.equal(st.fetchedAt, '2026-09-29T10:00:00.000Z');
  assert.equal(h.catalogo.aggiornato, 1);
  assert.equal(h.stato.innerText, 'Catalogo non aggiornato. Le ultime scelte sono conservate.');
  assert.equal(h.rotellina.style.animation, '', 'la rotellina si ferma');
  assert.equal(h.rese.length, 0);
});

test('la gara: la rotellina la ferma solo l\'ultima chiamata', async () => {
  const h = gara();
  const p1 = h.refresh();
  await riposo(2);
  const p2 = h.refresh();
  await riposo(2);
  h.attese[0].risolvi(CATALOGO);                // la prima, superata, finisce mentre la seconda è in volo
  await p1;
  assert.equal(h.rotellina.style.animation !== '', true, 'la seconda è ancora in volo: la rotellina gira');
  h.attese[1].risolvi(CATALOGO);
  await p2;
  assert.equal(h.rotellina.style.animation, '');
  assert.equal(h.rese.length, 1);
});

test('la gara, ramo Google: due chiamate in ordine inverso → una resa sola, col modello nuovo', async () => {
  const h = gara({ provider: 'google', local: { gemini_selected_model: 'gemini-vecchio' } });
  const p1 = h.refresh();
  await riposo(2);
  h.local.set('gemini_selected_model', 'gemini-2.0-flash');
  const p2 = h.refresh();
  await riposo(2);
  const RIGHE = [{ id: 'gemini-2.0-flash' }, { id: 'gemini-2.5-pro' }];
  h.attese[1].risolvi(RIGHE);
  await p2;
  h.attese[0].risolvi(RIGHE);
  await p1;
  assert.equal(h.rese.length, 1);
  assert.equal(h.rese[0].currentValue, 'gemini-2.0-flash');
});
