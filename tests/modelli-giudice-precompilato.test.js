'use strict';
/*
 * modelli-giudice-precompilato.test.js — packet 0088 (beta.6), B11 e B11b.
 *
 * Con la revisione accesa il giudice gira sempre. Chi accendeva «Usa un modello per ogni fase» trovava il campo del
 * giudice VUOTO e «Più materiali insieme» si fermava su «Assegna un modello al giudice nel Setup AI prima di avviare il
 * controllo.» Ora, quando non c'è ancora un profilo salvato, il campo parte dal modello scelto (come mappa e materiali);
 * un profilo già salvato non cambia, e il blocco di `mappai-modelli.js` resta per chi svuota il campo a mano.
 * L'etichetta non dice più «se abilitato»: il giudice gira sempre. È solo «Giudice» (inglese «Judge»).
 *
 * I moduli VERI (`mappai-modelli-core.js`, `mappai-modelli.js`, `mappai-modelli-ui.js`) in una vm, davanti a un DOM
 * minimo che tiene l'albero degli elementi. ⚠️ Negli assert solo booleani, testi e numeri, mai l'elemento.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RADICE = path.join(__dirname, '..');
const JS = f => fs.readFileSync(path.join(RADICE, 'public', 'js', f), 'utf8');
const CATALOGO = require('../public/js/mappai-catalogo-core.js');
const EN = vm.runInNewContext(fs.readFileSync(path.join(RADICE, 'public', 'traduzioni', 'en_translations.js'), 'utf8') + ';en_translations');
const IT = vm.runInNewContext(fs.readFileSync(path.join(RADICE, 'public', 'traduzioni', 'it_translations.js'), 'utf8') + ';it_translations');

const QWEN = 'Qwen/Qwen3.5-122B-A10B-FP8';
const GEMINI = 'gemini-2.5-flash';

function nodo(tag) {
  const n = { tag, figli: [], attrs: {}, ascolti: {}, className: '', id: '', type: '', value: '', checked: false, label: '', textContent: '' };
  n.append = (...xs) => xs.forEach(x => n.figli.push(typeof x === 'string' ? { tag: '#text', textContent: x, figli: [], append() { } } : x));
  n.replaceChildren = (...xs) => { n.figli = []; n.append(...xs); };
  n.setAttribute = (k, v) => { n.attrs[k] = v; };
  n.addEventListener = (t, f) => { (n.ascolti[t] = n.ascolti[t] || []).push(f); };
  n.scatena = t => (n.ascolti[t] || []).forEach(f => f({ type: t, target: n }));
  return n;
}
const cerca = (radice, ok) => { for (const f of radice.figli) { if (ok(f)) return f; const x = cerca(f, ok); if (x) return x; } return null; };
const tutti = (radice, ok, out = []) => { for (const f of radice.figli) { if (ok(f)) out.push(f); tutti(f, ok, out); } return out; };

function app(o = {}) {
  const host = nodo('div'); host.id = 'modelli-setup';
  /* `#model-select`, la tendina principale: con Google ne escono le voci dei menu per fase */
  const principale = nodo('select'); principale.id = 'model-select';
  principale.options = (o.modelSelect || []).map(([value, textContent]) => ({ value, textContent }));
  const osservatori = [];
  const document = {
    readyState: 'complete', createElement: nodo, createTextNode: s => ({ tag: '#text', textContent: s, figli: [], append() { } }),
    getElementById: id => (id === 'modelli-setup' ? host : id === 'model-select' ? principale : cerca(host, n => n.id === id)),
    addEventListener() { }
  };
  const memoria = new Map(Object.entries(o.local || {}));
  const lingua = o.lingua === 'en' ? EN : IT;
  /* `window` è il globale stesso (come in tutti i test che caricano i moduli UMD): il core si appende a `globalThis` */
  const window = { t: (k, f) => (lingua[k] !== undefined ? lingua[k] : f), MappAICatalogo: CATALOGO, refreshGeminiModels() { },
    MutationObserver: function (fn) { this.observe = (nodo, opz) => osservatori.push({ nodo, opz, fn }); },
    document, console: { log() { }, warn() { }, error() { } },
    localStorage: { getItem: k => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: k => memoria.delete(k) } };
  window.window = window;
  const ctx = vm.createContext(window);
  vm.runInContext('let appState = ' + JSON.stringify({ aiProvider: o.provider || 'infomaniak' }) + ';', ctx);
  for (const f of ['mappai-modelli-core.js', 'mappai-modelli.js', 'mappai-modelli-ui.js']) vm.runInContext(JS(f), ctx, { filename: f });
  return {
    window, host, memoria, principale, osservatori,
    voci: fase => { const c = cerca(host, n => n.id === 'modelli-' + fase); return c ? c.figli.map(f => [f.value, f.textContent]) : null; },
    campo: fase => cerca(host, n => n.id === 'modelli-' + fase),
    valore: fase => { const c = cerca(host, n => n.id === 'modelli-' + fase); return c ? c.value : null; },
    etichetta: fase => { const riga = tutti(host, n => n.tag === 'label').find(l => cerca(l, n => n.id === 'modelli-' + fase)); return riga && riga.figli.find(f => f.tag === 'span').textContent; },
    salva: () => {
      const b = cerca(host, n => n.tag === 'button' && n.textContent === 'Salva assegnazioni');
      b.scatena('click');
      return cerca(host, n => !!n.attrs && n.attrs.role === 'status').textContent;
    }
  };
}
/* il catalogo vivo in cui il modello scelto è un modello di chat: serve al «Salva» con Infomaniak, che lo verifica */
const CATALOGO_VIVO = JSON.stringify(CATALOGO.catalogue([{ id: QWEN }],
  { all: [], chat: [{ name: QWEN }], embeddings: [{ name: 'bge_multilingual_gemma2' }] }));
/* un catalogo con più modelli di chat e due di vettori, come quello vivo di Infomaniak */
const CHAT = [QWEN, 'google/gemma-4-31B-it', 'mistralai/Mistral-Small-4-119B-2603', 'swiss-ai/Apertus-v1.5-70B'];
const VETTORI = ['bge_multilingual_gemma2', 'Qwen/Qwen3-Embedding-8B'];
const CATALOGO_GRANDE = JSON.stringify(CATALOGO.catalogue(CHAT.concat(VETTORI).map(id => ({ id })),
  { all: [], chat: CHAT.map(name => ({ name })), embeddings: VETTORI.map(name => ({ name })) }));
const ACCESO = { mappai_multimodello: '1' };

test('0088 B11: senza un profilo salvato il campo del giudice parte dal modello scelto — come mappa e materiali (Infomaniak)', () => {
  const a = app({ local: { ...ACCESO, infomaniak_selected_model: QWEN } });
  assert.equal(a.valore('mappa'), QWEN);
  assert.equal(a.valore('materiali'), QWEN);
  assert.equal(a.valore('giudice'), QWEN);
});

test('0088 B11: lo stesso con Google', () => {
  const a = app({ provider: 'google', local: { ...ACCESO, gemini_selected_model: GEMINI } });
  assert.equal(a.valore('mappa'), GEMINI);
  assert.equal(a.valore('giudice'), GEMINI);
});

test('0088 B11: senza nessun modello scelto il campo resta vuoto (non si inventa niente)', () => {
  const a = app({ local: { ...ACCESO } });
  assert.equal(a.valore('giudice'), '');
});

test('0088 B11: un profilo GIÀ salvato non cambia — il giudice vuoto resta vuoto, quello scelto resta quello scelto', () => {
  const profilo = giudice => JSON.stringify({ schema: 'mappai-modelli@1', provider: 'infomaniak',
    modelli: { mappa: QWEN, materiali: QWEN, embeddings: 'bge_multilingual_gemma2', giudice, reranking: null } });
  const vuoto = app({ local: { ...ACCESO, infomaniak_selected_model: 'Altro/Modello', mappai_modelli_infomaniak: profilo(null) } });
  assert.equal(vuoto.valore('mappa'), QWEN);
  assert.equal(vuoto.valore('giudice'), '', 'il profilo salvato col giudice vuoto non viene riempito di nascosto');
  const scelto = app({ local: { ...ACCESO, infomaniak_selected_model: 'Altro/Modello', mappai_modelli_infomaniak: profilo('Mistral/Giudice') } });
  assert.equal(scelto.valore('giudice'), 'Mistral/Giudice');
});

test('0088 B11: salvando le assegnazioni precompilate il giudice è assegnato, e «Più materiali insieme» non si ferma più sul blocco', () => {
  const a = app({ local: { ...ACCESO, infomaniak_selected_model: QWEN, infomaniak_available_models: CATALOGO_VIVO } });
  assert.equal(a.salva(), 'Assegnazioni salvate per il prossimo lavoro.');
  const salvato = JSON.parse(a.memoria.get('mappai_modelli_infomaniak'));
  assert.equal(salvato.modelli.giudice, QWEN);
  const MM = a.window.MappAIModelli;
  assert.equal(MM.profiloSetup().modelli.giudice, QWEN);
  let errore = '';
  try { MM.avvia({ giudice: true, nuovo: true }); } catch (e) { errore = String(e.message); }
  assert.equal(/Assegna un modello al giudice/.test(errore), false, 'nessun blocco sul giudice: ' + errore);
});

test('0088 B11: il blocco resta per chi svuota il campo a mano — e dice che cosa fare', () => {
  const a = app({ local: { ...ACCESO, infomaniak_selected_model: QWEN, infomaniak_available_models: CATALOGO_VIVO } });
  a.campo('giudice').value = '';
  assert.equal(a.salva(), 'Assegnazioni salvate per il prossimo lavoro.');
  assert.equal(JSON.parse(a.memoria.get('mappai_modelli_infomaniak')).modelli.giudice, null);
  let errore = '';
  try { a.window.MappAIModelli.avvia({ giudice: true, nuovo: true }); } catch (e) { errore = String(e.message); }
  assert.equal(errore, 'Assegna un modello al giudice nel Setup AI prima di avviare il controllo.');
});

test('0088 B11b: l\'etichetta del campo è «Giudice» (inglese «Judge»), non più «se abilitato»', () => {
  assert.equal(app({ local: { ...ACCESO } }).etichetta('giudice'), 'Giudice');
  assert.equal(app({ local: { ...ACCESO }, lingua: 'en' }).etichetta('giudice'), 'Judge');
  assert.equal(IT.modelli_judge, 'Giudice');
  assert.equal(EN.modelli_judge, 'Judge');
  /* e le altre tre non cambiano */
  assert.equal(app({ local: { ...ACCESO } }).etichetta('mappa'), 'Mappa');
});

test('0088 B11: con i modelli per fase SPENTI non c\'è nessun campo (nessun cambiamento per chi non li usa)', () => {
  const a = app({ local: { infomaniak_selected_model: QWEN } });
  assert.equal(a.campo('giudice'), null);
});

// ── B12 (Giacomo, nel gate, 12/10): gli stessi token grafici dei menu «Modello AI» e «Modello per le foto» ─────────────
/* I due menu di riferimento prendono i token della console (fondo neutro, altezza e corpo dei controlli, raggio dei campi:
   `html[data-app="docente"] .mm-tela--colonna :is(input.form_input, select)` in mappai-modal-tokens.css, packet 0087 lotto 5).
   Un campo ne gode solo se è un `select` o un `input.form_input`: prima questi quattro erano input con classi Tailwind a mano
   (bianco, bordo, raggio 8px, corpo 14px). Dal 12/10 hanno la classe `form_input`. */
test('0088 B12: i quattro campi per fase (Infomaniak) hanno la classe `form_input`, non più il bianco col bordo scritto a mano', () => {
  const a = app({ local: { ...ACCESO, infomaniak_selected_model: QWEN } });
  for (const fase of ['mappa', 'materiali', 'embeddings', 'giudice']) {
    const campo = a.campo(fase);
    assert.equal(campo.tag, 'select', fase);
    assert.equal(campo.className, 'form_input', fase);
    assert.equal(/border-slate-300|rounded-lg|bg-white|p-2/.test(campo.className), false, fase + ': nessuna classe a mano');
  }
});

test('0088 B12: con Google anche la tendina dei vettori (un select) ha `form_input`, come gli altri tre campi', () => {
  const a = app({ provider: 'google', local: { ...ACCESO, gemini_selected_model: GEMINI,
    gemini_embedding_models: JSON.stringify([{ id: 'gemini-embedding-001', displayName: 'Gemini Embedding 001' }]) } });
  for (const fase of ['mappa', 'materiali', 'embeddings', 'giudice']) {
    assert.equal(a.campo(fase).tag, 'select', fase);
    assert.equal(a.campo(fase).className, 'form_input', fase);
  }
});

test('0088 B12: la classe `form_input` esiste nel foglio e il token dei campi della console la riconosce', () => {
  const html = fs.readFileSync(path.join(RADICE, 'public', 'index.html'), 'utf8');
  assert.equal(/\.form_input\s*\{\s*@apply/.test(html), true, 'la classe è definita in index.html');
  const css = fs.readFileSync(path.join(RADICE, 'public', 'css', 'mappai-modal-tokens.css'), 'utf8');
  assert.equal(/\.mm-tela--colonna :is\(input\.form_input, select\)\s*\{[^}]*background:\s*var\(--mm-neutro\)/.test(css), true,
    'la regola dei token dei campi nomina input.form_input e select');
});

// ── B13 (Giacomo, nel gate, 12/10): tutti i menu per fase funzionano come «Modello AI» e «Modello per le foto» ─────────
/* Prima erano campi di testo con una lista a scomparsa (`datalist`) che filtrava le voci con ciò che c'era scritto: con un
   modello già scelto nella lista restava solo quello. Ora sono menu a tendina VERI (`select`): mostrano sempre tutte le voci,
   con la scelta di adesso selezionata e, come «Modello per le foto», il valore salvato resta anche se il catalogo non lo contiene. */
const ID = voci => voci.map(v => v[0]);

test('0088 B13: sono tutti menu `select` — nessun campo di testo, nessuna lista a scomparsa — con tutti i modelli della fase', () => {
  const a = app({ local: { ...ACCESO, infomaniak_selected_model: QWEN, infomaniak_available_models: CATALOGO_GRANDE } });
  assert.equal(tutti(a.host, n => n.tag === 'input' && n.type === 'text').length, 0, 'nessun campo di testo');
  assert.equal(tutti(a.host, n => n.tag === 'datalist').length, 0, 'nessuna lista a scomparsa');
  for (const fase of ['mappa', 'materiali', 'giudice']) {
    const voci = a.voci(fase);
    assert.equal(voci[0][0], '', fase + ': la prima voce è il segnaposto');
    assert.deepEqual(ID(voci).slice(1).sort(), CHAT.slice().sort(), fase + ': TUTTI i modelli di chat, anche con QWEN già scelto');
    assert.equal(a.valore(fase), QWEN, fase + ': la scelta di adesso è selezionata');
  }
  assert.deepEqual(ID(a.voci('embeddings')).slice(1).sort(), VETTORI.slice().sort(), 'i vettori sono solo i modelli di vettori');
  assert.equal(ID(a.voci('mappa')).some(id => VETTORI.includes(id)), false, 'e i vettori non finiscono fra i modelli di chat');
});

test('0088 B13: le voci si leggono come in «Modello per le foto»: «modello — prezzo»', () => {
  const a = app({ local: { ...ACCESO, infomaniak_selected_model: QWEN, infomaniak_available_models: CATALOGO_GRANDE } });
  const voce = a.voci('mappa').find(v => v[0] === QWEN);
  assert.equal(voce[1], QWEN + ' — ' + CATALOGO.priceLabel(QWEN));
  assert.equal(voce[1].includes(' — ') && /CHF/.test(voce[1]), true, voce[1]);
});

test('0088 B13: un valore salvato che il catalogo non contiene RESTA fra le voci, selezionato, con «Non disponibile nel catalogo aggiornato»', () => {
  const profilo = JSON.stringify({ schema: 'mappai-modelli@1', provider: 'infomaniak',
    modelli: { mappa: 'vecchio/Modello-Ritirato-9B', materiali: QWEN, embeddings: 'bge_multilingual_gemma2', giudice: null, reranking: null } });
  const a = app({ local: { ...ACCESO, mappai_modelli_infomaniak: profilo, infomaniak_available_models: CATALOGO_GRANDE } });
  assert.equal(a.valore('mappa'), 'vecchio/Modello-Ritirato-9B');
  const voce = a.voci('mappa').find(v => v[0] === 'vecchio/Modello-Ritirato-9B');
  assert.equal(voce[1], 'vecchio/Modello-Ritirato-9B — Non disponibile nel catalogo aggiornato');
  assert.equal(a.valore('materiali'), QWEN, 'gli altri non cambiano');
  assert.equal(a.valore('giudice'), '', 'il giudice vuoto resta il segnaposto');
});

test('0088 B13: il giudice si può lasciare «nessuno» e un ridisegno dell\'elenco non rimette il modello', () => {
  const a = app({ local: { ...ACCESO, infomaniak_selected_model: QWEN, infomaniak_available_models: CATALOGO_GRANDE } });
  const g = a.campo('giudice');
  assert.equal(g.value, QWEN);
  g.value = ''; g.scatena('change');                          // sceglie il segnaposto
  a.window.MappAIModelliUI.aggiornaCatalogo();                // il catalogo si aggiorna
  assert.equal(a.valore('giudice'), '', 'resta «nessuno»');
  a.memoria.set('infomaniak_available_models', CATALOGO_GRANDE);
  a.window.MappAIModelliUI.aggiornaCatalogo();
  assert.equal(a.valore('giudice'), '');
  assert.equal(a.salva(), 'Assegnazioni salvate per il prossimo lavoro.');
  assert.equal(JSON.parse(a.memoria.get('mappai_modelli_infomaniak')).modelli.giudice, null);
});

test('0088 B13: scegliere un altro modello da un menu lo seleziona, lo salva, e gli altri menu restano interi', () => {
  const a = app({ local: { ...ACCESO, infomaniak_selected_model: QWEN, infomaniak_available_models: CATALOGO_GRANDE } });
  const gemma = 'google/gemma-4-31B-it';
  const m = a.campo('materiali');
  m.value = gemma; m.scatena('change');
  assert.equal(a.valore('materiali'), gemma);
  assert.equal(a.valore('mappa'), QWEN, 'mappa non cambia');
  assert.deepEqual(ID(a.voci('materiali')).slice(1).sort(), CHAT.slice().sort(), 'e la lista di «materiali» resta intera dopo la scelta');
  assert.equal(a.salva(), 'Assegnazioni salvate per il prossimo lavoro.');
  const salvato = JSON.parse(a.memoria.get('mappai_modelli_infomaniak')).modelli;
  assert.equal(salvato.materiali, gemma);
  assert.equal(salvato.mappa, QWEN);
});

test('0088 B13: con Google le voci sono quelle della tendina principale, e la seguono quando si ridisegna', () => {
  const a = app({ provider: 'google', modelSelect: [], local: { ...ACCESO, gemini_selected_model: GEMINI,
    gemini_embedding_models: JSON.stringify([{ id: 'gemini-embedding-001', displayName: 'Gemini Embedding 001' }]) } });
  assert.deepEqual(ID(a.voci('mappa')), ['', GEMINI], 'con la tendina principale vuota resta il segnaposto e la scelta di adesso');
  assert.equal(a.osservatori.length, 1, 'si osserva la tendina principale');
  assert.equal(a.osservatori[0].nodo.id, 'model-select');
  assert.equal(a.osservatori[0].opz.childList, true);
  /* `refreshGeminiModels` riempie `#model-select` DOPO aver avvisato il pannello: l'osservatore ridisegna i menu */
  a.principale.options = [{ value: GEMINI, textContent: 'Gemini 2.5 Flash' }, { value: 'gemini-2.5-pro', textContent: 'Gemini 2.5 Pro' }];
  a.osservatori[0].fn();
  assert.deepEqual(a.voci('mappa'), [['', '— scegli un modello —'], [GEMINI, 'Gemini 2.5 Flash'], ['gemini-2.5-pro', 'Gemini 2.5 Pro']]);
  assert.equal(a.valore('mappa'), GEMINI);
  assert.deepEqual(ID(a.voci('embeddings')), ['', 'gemini-embedding-001'], 'i vettori restano quelli di embedContent');
  assert.equal(a.voci('embeddings')[1][1], 'Gemini Embedding 001 · gemini-embedding-001');
});

test('0088 B13: «scegli un modello» in inglese, e il segnaposto ha la sua chiave', () => {
  assert.equal(EN.modelli_scegli, '— choose a model —');
  const a = app({ lingua: 'en', local: { ...ACCESO } });
  assert.equal(a.voci('mappa')[0][1], '— choose a model —');
  assert.equal(app({ local: { ...ACCESO } }).voci('mappa')[0][1], '— scegli un modello —');
});

test('0088 B13: sotto il menu resta solo la disponibilità (il prezzo sta già nella voce), segue la scelta, e un valore fuori catalogo lo dice', () => {
  const a = app({ local: { ...ACCESO, infomaniak_selected_model: QWEN, infomaniak_available_models: CATALOGO_GRANDE } });
  const riga = fase => { const l = tutti(a.host, n => n.tag === 'label').find(x => cerca(x, n => n.id === 'modelli-' + fase)); return l.figli[l.figli.length - 1].textContent; };
  assert.equal(/Elencato dal prodotto|Accesso del prodotto da verificare/.test(riga('mappa')), true, riga('mappa'));
  assert.equal(/CHF/.test(riga('mappa')), false, 'il prezzo non si ripete sotto la voce: ' + riga('mappa'));
  const gemma = 'google/gemma-4-31B-it';
  const mappa = a.campo('mappa'); mappa.value = gemma; mappa.scatena('change');
  assert.equal(/Elencato dal prodotto|Accesso del prodotto da verificare/.test(riga('mappa')), true, 'il suggerimento resta dopo il cambio di scelta');
  assert.equal(a.voci('mappa').find(v => v[0] === gemma)[1].includes(CATALOGO.priceLabel(gemma)), true, 'e il prezzo sta nella voce');
  const profilo = JSON.stringify({ schema: 'mappai-modelli@1', provider: 'infomaniak',
    modelli: { mappa: 'vecchio/Modello-Ritirato-9B', materiali: QWEN, embeddings: 'bge_multilingual_gemma2', giudice: null, reranking: null } });
  const b = app({ local: { ...ACCESO, mappai_modelli_infomaniak: profilo, infomaniak_available_models: CATALOGO_GRANDE } });
  const l = tutti(b.host, n => n.tag === 'label').find(x => cerca(x, n => n.id === 'modelli-mappa'));
  assert.equal(l.figli[l.figli.length - 1].textContent.includes('Modello non verificato per questa funzione'), true);
});

// ── B13 · i vettori NON prendono mai i modelli di chat (ADR 0004; richiesta di ADMIN dopo `fff38c95`) ─────────────────
test('0088 B13: con Google la tendina dei vettori ha solo i modelli di embedContent, la scelta salvata resta (in cima) e l\'elenco vuoto avvisa', () => {
  const CHATG = [['gemini-2.5-flash', 'Gemini 2.5 Flash'], ['gemini-2.5-pro', 'Gemini 2.5 Pro']];
  /* deposito dei vettori VUOTO e tendina principale piena di modelli di chat: nei vettori NON ne entra nessuno */
  const vuoto = app({ provider: 'google', modelSelect: CHATG, local: { ...ACCESO, gemini_selected_model: GEMINI } });
  assert.deepEqual(ID(vuoto.voci('embeddings')), ['', 'gemini-embedding-001'], 'segnaposto e scelta di adesso, nient\'altro');
  assert.equal(ID(vuoto.voci('embeddings')).some(id => id.includes('flash') || id.includes('pro')), false);
  const riga = fase => { const l = tutti(vuoto.host, n => n.tag === 'label').find(x => cerca(x, n => n.id === 'modelli-' + fase)); return l.figli[l.figli.length - 1].textContent; };
  assert.equal(riga('embeddings'), 'Elenco non ancora caricato: premi «Aggiorna Modelli» qui sopra.');
  assert.equal(riga('mappa'), '', 'gli altri menu non hanno l\'avviso');
  /* con il deposito pieno: solo quelli; una scelta salvata che il deposito non conosce sta in CIMA, subito dopo il segnaposto */
  const profilo = JSON.stringify({ schema: 'mappai-modelli@1', provider: 'google',
    modelli: { mappa: GEMINI, materiali: GEMINI, embeddings: 'embedding-vecchio-001', giudice: null, reranking: null } });
  const pieno = app({ provider: 'google', modelSelect: CHATG, local: { ...ACCESO, mappai_modelli_google: profilo, gemini_selected_model: GEMINI,
    gemini_embedding_models: JSON.stringify([{ id: 'gemini-embedding-001', displayName: 'Gemini Embedding 001' }, { id: 'text-embedding-004', displayName: 'Text Embedding 004' }]) } });
  assert.deepEqual(ID(pieno.voci('embeddings')), ['', 'embedding-vecchio-001', 'gemini-embedding-001', 'text-embedding-004']);
  assert.equal(pieno.valore('embeddings'), 'embedding-vecchio-001', 'la scelta già salvata resta selezionata');
  assert.equal(ID(pieno.voci('embeddings')).some(id => id.startsWith('gemini-2.5')), false);
});

test('0088 B13: con Infomaniak i vettori sono solo quelli del catalogo per la fase; senza catalogo restano la scelta di adesso e il segnaposto, mai i modelli di chat', () => {
  const con = app({ local: { ...ACCESO, infomaniak_selected_model: QWEN, infomaniak_available_models: CATALOGO_GRANDE } });
  assert.deepEqual(ID(con.voci('embeddings')).slice(1).sort(), VETTORI.slice().sort());
  /* il ripiego senza il catalogo (modulo assente) non deve pescare dalla tendina principale, che è di chat */
  const senza = app({ modelSelect: [[QWEN, QWEN], ['google/gemma-4-31B-it', 'gemma']], local: { ...ACCESO, infomaniak_selected_model: QWEN } });
  senza.window.MappAICatalogo = undefined;
  senza.window.MappAIModelliUI.render();
  assert.deepEqual(ID(senza.voci('embeddings')), ['', 'bge_multilingual_gemma2'], 'solo il segnaposto e la scelta di adesso');
  assert.equal(ID(senza.voci('embeddings')).includes(QWEN), false);
});
