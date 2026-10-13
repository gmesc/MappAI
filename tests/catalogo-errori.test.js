'use strict';
/*
 * catalogo-errori.test.js — packet 0088 (beta.6), difetto D6: credenziali Infomaniak sbagliate.
 *
 * Con un token o un Product ID errati la riga sotto «Aggiorna Modelli» diceva solo «Catalogo non aggiornato…» e
 * l'HTTP 401 restava nella console. Ora dice che cosa non va, con le parole dell'app («Come crearlo?» per il token,
 * «Dove lo trovo?» per il Product ID), e il Product ID si ripulisce e si controlla prima di chiamare la rete.
 *
 * `window.refreshGeminiModels` VERA, estratta PER TESTO da `public/js/mappai-ui-modals.js` (come la «gara» di
 * tests/config-import.test.js): per questo la funzione non può usare aiuti esterni non protetti, `navigator` si
 * controlla con `typeof`, e nessuna riga dentro la funzione comincia con `}` in colonna 0.
 * Il numero HTTP arriva nel testo dell'errore: main.js lancia «Catalogo Infomaniak non aggiornato (HTTP 401).» e
 * Electron lo riveste con «Error invoking remote method …».
 *
 * ⚠️ Negli assert sul DOM finto solo booleani, testi, numeri e attributi, mai l'elemento.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RADICE = path.join(__dirname, '..');
const SORGENTE = fs.readFileSync(path.join(RADICE, 'public', 'js', 'mappai-ui-modals.js'), 'utf8');
const riposo = ms => new Promise(r => setTimeout(r, ms));
const TOKEN = 'QzX9wKtokenDiProvaPerLaDemo_0123456789';
const PID = '105999';
const CONSERVATE = 'Le ultime scelte sono conservate.';

function estrai() {
  const inizio = SORGENTE.indexOf('window.refreshGeminiModels = async function');
  assert.equal(inizio >= 0, true, 'refreshGeminiModels non trovata');
  const fine = SORGENTE.indexOf('\n}', inizio) + 2;
  return SORGENTE.slice(inizio, fine);
}

/* `navigator`: undefined = non c'è proprio (come nella vm della gara); altrimenti { onLine } */
function prova(o = {}) {
  const local = new Map(Object.entries(o.local || {}));
  const chiamate = [];
  const toast = [];
  const tendina = { innerHTML: '', value: '', options: [] };
  const campoPid = { value: o.pid === undefined ? PID : o.pid };
  const stato = { innerText: '', classe: new Set(['hidden']), classList: null };
  stato.classList = { add: c => stato.classe.add(c), remove: c => stato.classe.delete(c) };
  const rotellina = { style: { animation: '' } };
  let rifiuto = o.rifiuto;
  const g = {
    console: { log() { }, info() { }, warn() { }, error() { } },
    appState: { aiProvider: o.provider || 'infomaniak', infomaniakProductId: o.pidSalvato || '' },
    localStorage: {
      getItem: k => (local.has(k) ? local.get(k) : null),
      setItem: (k, v) => { local.set(k, String(v)); }, removeItem: k => { local.delete(k); }
    },
    document: {
      getElementById: id => ({ 'model-select': tendina, 'infomaniak-product-id': campoPid,
        'models-status': stato, 'refresh-models-icon': rotellina })[id] || null
    },
    electronAPI: Object.freeze({
      listInfomaniakModels: async arg => { chiamate.push({ rete: 'infomaniak', arg: JSON.parse(JSON.stringify(arg)) }); if (rifiuto) throw rifiuto; return [{ id: 'a/b' }]; },
      listModels: async arg => { chiamate.push({ rete: 'google', arg }); if (rifiuto) throw rifiuto; return [{ id: 'gemini-2.0-flash' }]; }
    }),
    MappAIModelliUI: { aggiornaCatalogo() { } },
    MappAICatalogo: { forPhase: rows => rows },
    matchModelKB: () => ({ tier: '🇨🇭 Swiss Made' }),
    renderModelSelect() { },
    _escModali: s => String(s),
    updateTokenCostEstimator() { },
    showToast: (m, t) => { toast.push({ m: String(m), t }); }
  };
  if (o.navigator !== undefined) g.navigator = o.navigator;
  g.window = g;
  g.getSystemKey = () => TOKEN;
  g.t = (_k, f) => f;
  vm.createContext(g);
  vm.runInContext(estrai(), g);
  return {
    g, local, chiamate, toast, stato, tendina,
    rifiuta: e => { rifiuto = e; },
    rete: async () => { const p = g.refreshGeminiModels(); await p; await riposo(1); }
  };
}
/* l'errore come arriva dal main attraverso l'IPC: Electron lo riveste */
const daMain = codice => new Error("Error invoking remote method 'list-infomaniak-models': Error: Catalogo Infomaniak non aggiornato" + (codice ? ` (HTTP ${codice}).` : '.'));

const ATTESI = {
  401: 'Infomaniak non riconosce il token: copialo di nuovo dal Manager Infomaniak («Come crearlo?»). ' + CONSERVATE,
  403: 'Il token non apre questo Product ID: controlla il Product ID («Dove lo trovo?») e che token e prodotto siano dello stesso account. ' + CONSERVATE,
  pid: 'Infomaniak non trova un prodotto AI con questo Product ID: controllalo, sono solo cifre («Dove lo trovo?»). ' + CONSERVATE,
  429: 'Infomaniak chiede di aspettare: riprova fra qualche minuto. ' + CONSERVATE,
  5: 'Infomaniak non risponde in questo momento: riprova più tardi. ' + CONSERVATE,
  offline: 'Il computer non è collegato a Internet. ' + CONSERVATE
};

test('0088 D6: ogni codice HTTP ha il suo messaggio, con le parole dell\'app e la frase che le scelte sono conservate', async () => {
  const casi = [[401, ATTESI[401]], [403, ATTESI[403]], [400, ATTESI.pid], [404, ATTESI.pid], [422, ATTESI.pid],
    [429, ATTESI[429]], [500, ATTESI[5]], [502, ATTESI[5]], [503, ATTESI[5]]];
  for (const [codice, atteso] of casi) {
    const p = prova({ rifiuto: daMain(codice) });
    await p.rete();
    assert.equal(p.stato.innerText, atteso, 'HTTP ' + codice);
    assert.equal(p.stato.innerText.endsWith(CONSERVATE), true, 'HTTP ' + codice);
    assert.equal(JSON.parse(p.local.get('infomaniak_catalogue_state')).stale, true, 'il catalogo resta segnato «da aggiornare» (HTTP ' + codice + ')');
  }
});

test('0088 D6: token sbagliato, Product ID sbagliato e rete staccata danno tre messaggi DIVERSI', async () => {
  const token = prova({ rifiuto: daMain(401) }); await token.rete();
  const pid = prova({ rifiuto: daMain(404) }); await pid.rete();
  const rete = prova({ rifiuto: new Error('net::ERR_INTERNET_DISCONNECTED'), navigator: { onLine: false } }); await rete.rete();
  const testi = [token.stato.innerText, pid.stato.innerText, rete.stato.innerText];
  assert.equal(new Set(testi).size, 3);
  assert.equal(rete.stato.innerText, ATTESI.offline);
  assert.equal(testi[0].includes('Come crearlo?'), true);
  assert.equal(testi[1].includes('Dove lo trovo?'), true);
});

test('0088 D6: senza numero e con la rete (apparentemente) su, o senza `navigator`, il testo è quello di prima, invariato', async () => {
  const VECCHIO = 'Catalogo non aggiornato. Le ultime scelte sono conservate.';
  for (const navigator of [undefined, { onLine: true }]) {
    const p = prova({ rifiuto: new Error('rete giù'), navigator });
    await p.rete();
    assert.equal(p.stato.innerText, VECCHIO);
  }
  /* un numero che non ha un messaggio suo (408, 418): anche qui il testo di prima */
  const strano = prova({ rifiuto: daMain(418) }); await strano.rete();
  assert.equal(strano.stato.innerText, VECCHIO);
});

test('0088 D6: il testo grezzo dell\'errore non si mostra mai (né il token, né il Product ID, né «Error invoking»)', async () => {
  const p = prova({ rifiuto: new Error("Error invoking remote method 'list-infomaniak-models': Error: Catalogo Infomaniak non aggiornato (HTTP 401). token=" + TOKEN + ' pid=' + PID) });
  await p.rete();
  assert.equal(p.stato.innerText.includes('Error invoking'), false);
  assert.equal(p.stato.innerText.includes(TOKEN), false);
  assert.equal(p.stato.innerText.includes(PID), false);
  assert.equal(p.stato.innerText, ATTESI[401]);
});

test('0088 D6: con Google gli stessi errori NON cambiano (il messaggio di prima), anche se il testo nomina un HTTP', async () => {
  const p = prova({ provider: 'google', rifiuto: new Error('Errore Google (HTTP 401)') });
  await p.rete();
  assert.equal(p.stato.innerText, 'Catalogo non aggiornato. Le ultime scelte sono conservate.');
});

test('0088 B7: il Product ID si ripulisce dagli spazi prima di chiamare la rete', async () => {
  for (const scritto of [' 105999', '105999 ', '  105999\n']) {
    const p = prova({ pid: scritto });
    await p.rete();
    assert.equal(p.chiamate.length, 1, JSON.stringify(scritto));
    assert.equal(p.chiamate[0].arg.productId, PID, JSON.stringify(scritto));
  }
  /* se il campo è vuoto, vale quello salvato (ripulito anche lui) */
  const salvato = prova({ pid: '', pidSalvato: ' 105999 ' });
  await salvato.rete();
  assert.equal(salvato.chiamate[0].arg.productId, PID);
});

test('0088 B7: un Product ID che non è fatto di sole cifre NON parte: nessuna chiamata, il messaggio dice di controllarlo, le scelte restano', async () => {
  for (const scritto of ['abc', '1059-99', '105 999', 'https://x.y/105999', '12345A']) {
    const p = prova({ pid: scritto, local: { infomaniak_selected_model: 'a/b' } });
    await p.rete();
    assert.equal(p.chiamate.length, 0, scritto);
    assert.equal(p.stato.innerText, ATTESI.pid, scritto);
    assert.equal(p.stato.classe.has('hidden'), false, 'la riga di stato si vede');
    assert.equal(p.tendina.innerHTML, '', 'la tendina non viene toccata');
    assert.equal(p.local.get('infomaniak_selected_model'), 'a/b');
  }
});

test('0088 B7: il campo vuoto resta il caso di prima (toast rosso «Inserisci il Product ID», nessuna chiamata)', async () => {
  const p = prova({ pid: '', pidSalvato: '' });
  await p.rete();
  assert.equal(p.chiamate.length, 0);
  assert.equal(p.toast.length, 1);
  assert.equal(p.toast[0].t, 'error');
  assert.equal(p.toast[0].m, 'Inserisci il Product ID per caricare i modelli Infomaniak.');
});

test('0088 D6: la funzione estratta non ha righe che cominciano con «}» in colonna 0 (la estrae per testo anche la gara)', () => {
  const codice = estrai();
  const righe = codice.split('\n');
  assert.equal(righe[righe.length - 1] === '' ? righe[righe.length - 2] : righe[righe.length - 1], '}');
  assert.equal(righe.slice(0, -2).some(r => r.startsWith('}')), false);
  assert.equal(/\btypeof navigator\b/.test(codice), true, '`navigator` si controlla con typeof');
});

// ── il bottone «Dove lo trovo?» in index.html ───────────────────────────────────────────────────
const HTML = fs.readFileSync(path.join(RADICE, 'public', 'index.html'), 'utf8');
const IT = vm.runInNewContext(fs.readFileSync(path.join(RADICE, 'public', 'traduzioni', 'it_translations.js'), 'utf8') + ';it_translations');
const EN = vm.runInNewContext(fs.readFileSync(path.join(RADICE, 'public', 'traduzioni', 'en_translations.js'), 'utf8') + ';en_translations');

test('0088 D6: «Dove lo trovo?» sta sotto «Product ID (Infomaniak)», con il testo in tutte e due le lingue, e apre la guida col browser di sistema', () => {
  const i = HTML.indexOf('Product ID\n                            (Infomaniak)</label>');
  assert.equal(i > 0, true, 'l\'etichetta del campo c\'è');
  const resto = HTML.slice(i, HTML.indexOf('id="infomaniak-product-id"', i));
  assert.equal(resto.includes('data-i18n="ui_pid_where"'), true, 'il bottone è fra l\'etichetta e il campo');
  assert.equal(resto.includes('>Dove lo trovo?</span>'), true);
  assert.equal(IT.ui_pid_where, 'Dove lo trovo?');
  assert.equal(EN.ui_pid_where, 'Where do I find it?');
  /* si apre con openExternal, MAI con window.open né target=_blank (main.js aprirebbe la pagina dentro l'app) */
  const bottone = /<button[^>]*onclick="([^"]*)"[^>]*>(?:(?!<\/button>)[\s\S])*ui_pid_where/.exec(resto);
  assert.equal(!!bottone, true);
  assert.equal(/window\.open|target=/.test(resto), false);
  const aperti = [];
  vm.runInNewContext(bottone[1], { window: { electronAPI: { openExternal: u => aperti.push(u) } } });
  assert.deepEqual(aperti, ['https://insegnai.ch/articoliblog/guida-infomaniak.html']);
  /* fuori da Electron non succede niente (e non si rompe) */
  assert.doesNotThrow(() => vm.runInNewContext(bottone[1], { window: {} }));
});

test('0088 D6: tutte le chiavi dei messaggi hanno la loro versione inglese', () => {
  for (const k of ['catalog_kept', 'catalog_err_401', 'catalog_err_403', 'catalog_err_pid', 'catalog_err_429', 'catalog_err_5xx', 'catalog_err_offline'])
    assert.equal(typeof EN[k] === 'string' && EN[k].length > 10, true, k);
});
