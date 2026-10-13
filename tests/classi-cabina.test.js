'use strict';
/*
 * classi-cabina.test.js — packet 0088 (beta.6), difetti D10 e D11 delle classi.
 *
 *  D10  Aperte DALLA Cabina (le quattro `MappAIClasses.open*`), le schermate «Nuovo profilo classe», «Profilo classe»,
 *       «Nuovo profilo allievo» e «Profilo allievo» tornavano con «Annulla»/«Indietro» alla vecchia finestra «Account
 *       classi e studenti», che si apriva sopra la Cabina. Ora tornano alla Cabina (la finestra si chiude); dalla lista
 *       storica (LIM › «Account classi», il chip) tornano alla lista, come prima.
 *  D11  Eliminare la classe ATTIVA la lasciava attiva (la chiave puntava a una classe che non c'è più). Ora la toglie anche
 *       dal contesto. Una parola diversa da quella da scrivere dà un avviso, «Annulla» non fa niente, e la parola è una
 *       sola nel dizionario («elimina» / «delete»), la stessa nell'etichetta e nel confronto.
 *
 * Il modulo VERO `mappai-live-classes.js` (col suo `mappai-live-core.js`) in una vm, davanti a un DOM di cartone: il
 * modulo scrive l'HTML delle sue finestre e poi ne cerca i bottoni per attributo o per classe, quindi basta rispondere
 * a quelle domande. ⚠️ Negli assert solo booleani, testi, numeri e attributi, mai l'elemento.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RADICE = path.join(__dirname, '..');
const JS = f => fs.readFileSync(path.join(RADICE, 'public', 'js', f), 'utf8');
const EN = vm.runInNewContext(fs.readFileSync(path.join(RADICE, 'public', 'traduzioni', 'en_translations.js'), 'utf8') + ';en_translations');
const giro = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };

const CLASSI = () => ({ schema: 'mappai-classes@1', classes: [
  { id: 'c2a', name: '2A', gradeNum: 2, section: 'A', system: 'Ticino', year: '2026/2027', students: [{ n: 1 }], disciplines: [], register: '', notes: '' },
  { id: 'c3b', name: '3B', gradeNum: 3, section: 'B', system: 'Ticino', year: '2026/2027', students: [{ n: 1 }], disciplines: [], register: '', notes: '' }
] });
const SCHEDE = () => [{ nickname: 'Giulia', grade: '2ª', age: '13', classId: 'c2a', notes: '' }];

function carica(o = {}) {
  const memoria = new Map(Object.entries(o.local || {}));
  const aperte = [];                 // le finestre «#class-accounts-modal» in vita
  const tutte = [];                  // tutte quelle create
  const toast = [];
  const chiedi = [];                 // le domande fatte al motore dei modali
  const scritti = [];

  /* il «DOM»: ogni elemento tiene l'HTML che gli si scrive e risponde alle ricerche per id, classe o attributo */
  function el() {
    const e = { style: {}, html: '', cache: {}, tutti: {}, id: '', className: '', rimosso: false,
      classList: { add() { }, remove() { }, toggle() { }, contains: () => false },
      addEventListener() { }, removeEventListener() { }, setAttribute() { }, getAttribute: () => '', focus() { }, appendChild() { }, contains: () => false,
      remove() { e.rimosso = true; const i = aperte.indexOf(e); if (i >= 0) aperte.splice(i, 1); } };
    Object.defineProperty(e, 'innerHTML', { get: () => e.html, set: v => { e.html = v; } });
    Object.defineProperty(e, 'textContent', { get: () => e.html, set: v => { e.html = String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); } });
    const presente = sel => {
      if (sel.startsWith('#')) return e.html.includes('id="' + sel.slice(1) + '"');
      if (sel.startsWith('.')) return new RegExp('class="[^"]*\\b' + sel.slice(1) + '\\b').test(e.html);
      const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(sel);
      if (m) return e.html.includes(m[1] + (m[2] !== undefined ? '="' + m[2] + '"' : ''));
      return true;
    };
    const figlio = (chiave, attr, valore) => {
      const k = chiave + '=' + valore;
      return e.cache[k] || (e.cache[k] = { onclick: null, onchange: null, oninput: null, onkeydown: null, value: '', checked: false, disabled: false,
        style: {}, dataset: {}, classList: { add() { }, remove() { }, toggle() { } }, addEventListener() { }, focus() { }, select() { },
        getAttribute: a => (a === attr ? valore : ''), setAttribute() { }, appendChild() { }, textContent: '', innerHTML: '', parentNode: { style: {} } });
    };
    e.querySelector = sel => {
      if (!presente(sel)) return null;
      const m = /^\[([\w-]+)="([^"]*)"\]$/.exec(sel);
      return figlio(sel, m ? m[1] : '', m ? m[2] : '');
    };
    e.querySelectorAll = sel => {
      const m = /^\[([\w-]+)\]$/.exec(sel);
      if (m) {
        const out = [], re = new RegExp(m[1] + '="([^"]*)"', 'g'); let r;
        while ((r = re.exec(e.html))) out.push(figlio(sel + '#' + out.length, m[1], r[1]));
        if (!out.length && e.html.includes(m[1])) out.push(figlio(sel, m[1], ''));
        return out;
      }
      return presente(sel) ? [figlio(sel, '', '')] : [];
    };
    tutte.push(e);
    return e;
  }
  const document = {
    readyState: 'complete', activeElement: null, head: { appendChild() { } },
    createElement: el, addEventListener() { }, removeEventListener() { }, dispatchEvent() { },
    body: { appendChild: e => { if (e.id === 'class-accounts-modal') aperte.push(e); } },
    getElementById: id => (id === 'class-accounts-modal' ? aperte[aperte.length - 1] || null : null)
  };
  const lingua = o.lingua === 'en' ? EN : null;
  const window = {
    t: (k, f) => (lingua && lingua[k] !== undefined ? lingua[k] : f),
    showToast: (m, k) => toast.push({ m: String(m), k }),
    electronAPI: {
      liveClassesLoad: async () => ({ success: true, data: o.classi || CLASSI() }),
      liveClassesSave: async d => { scritti.push(JSON.parse(JSON.stringify(d))); return { success: true }; }
    }
  };
  if (o.motore !== false) {
    window.MappAIModal = { chiedi: async arg => { chiedi.push(arg); return o.risposta === undefined ? null : o.risposta; }, conferma: async () => true, aperti: 0, prossimoZ: () => 12300 };
  }
  const ctx = vm.createContext({
    window, document, console: { log() { }, warn() { }, error() { } }, setTimeout, CustomEvent: function (n) { this.type = n; },
    localStorage: { getItem: k => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: k => memoria.delete(k) }
  });
  vm.runInContext('let appState = ' + JSON.stringify({ allProfiles: o.schede || SCHEDE(), userProfile: {} }) + ';', ctx);
  vm.runInContext(JS('mappai-live-core.js'), ctx);
  window.MappAILiveReports = { buildCredentialCardsHtml: () => '' };
  vm.runInContext(JS('mappai-live-classes.js'), ctx);
  const S = window.MappAIClasses;
  return {
    window, S, memoria, toast, chiedi, scritti, aperte, tutte,
    carica: async () => { await S.load(); },
    /* di che cosa è fatta la finestra aperta adesso */
    cosa: () => {
      const f = aperte[aperte.length - 1];
      if (!f) return 'nessuna';
      if (f.html.includes('data-activate') || f.html.includes('Nuova classe')) return 'lista-classi';
      if (f.html.includes('data-spick') || f.html.includes('data-snew')) return 'lista-studenti';
      if (f.html.includes('Nuovo profilo classe')) return 'nuova-classe';
      if (f.html.includes('Profilo classe')) return 'classe';
      if (f.html.includes('Nuovo profilo allievo')) return 'nuovo-allievo';
      if (f.html.includes('Profilo allievo')) return 'allievo';
      return 'altro';
    },
    finestra: () => aperte[aperte.length - 1]
  };
}

// ── D10 · Annulla e Indietro ─────────────────────────────────────────────────────────────────────
test('0088 D10: dalla Cabina «Indietro» del profilo classe CHIUDE la finestra (si torna alla Cabina)', async () => {
  const t = carica(); await t.carica();
  t.S.openClassEdit('c2a');
  assert.equal(t.cosa(), 'classe');
  t.finestra().querySelector('[data-back]').onclick();
  assert.equal(t.cosa(), 'nessuna', 'niente vecchia lista sopra la Cabina');
});

test('0088 D10: dalla Cabina «Annulla» del nuovo profilo classe e del nuovo profilo allievo CHIUDE la finestra', async () => {
  const t = carica(); await t.carica();
  t.S.openClassCreate();
  assert.equal(t.cosa(), 'nuova-classe');
  t.finestra().querySelector('[data-back]').onclick();
  assert.equal(t.cosa(), 'nessuna');
  t.S.openStudentCreate();
  assert.equal(t.cosa(), 'nuovo-allievo');
  t.finestra().querySelector('[data-back]').onclick();
  assert.equal(t.cosa(), 'nessuna');
});

test('0088 D10: dalla Cabina, eliminare un allievo dal suo profilo CHIUDE la finestra (prima: la vecchia lista sopra la Cabina)', async () => {
  const t = carica(); await t.carica();
  t.S.openStudentEdit(0);
  assert.equal(t.cosa(), 'allievo');
  assert.equal(t.finestra().querySelector('[data-back]'), null, 'il profilo allievo non ha «Indietro»: esce da qui');
  t.finestra().querySelector('[data-sdel]').onclick();       // «Elimina» → conferma (il motore finto risponde sì)
  await giro();
  assert.equal(t.cosa(), 'nessuna');
  assert.equal(t.S.students().length, 0, 'e la scheda è stata tolta');
});

test('0088 D10: dalla lista storica (LIM › «Account classi») «Indietro» e «Annulla» tornano alla LISTA, come prima', async () => {
  const t = carica(); await t.carica();
  t.window.openClassAccountsModal();
  await giro();
  assert.equal(t.cosa(), 'lista-classi');
  t.finestra().querySelectorAll('[data-edit]')[0].onclick({ stopPropagation() { } });
  assert.equal(t.cosa(), 'classe');
  t.finestra().querySelector('[data-back]').onclick();
  assert.equal(t.cosa(), 'lista-classi', '«Indietro» dal profilo classe');
  t.finestra().querySelector('[data-new]').onclick();
  assert.equal(t.cosa(), 'nuova-classe');
  t.finestra().querySelector('[data-back]').onclick();
  assert.equal(t.cosa(), 'lista-classi', '«Annulla» dal nuovo profilo classe');
});

test('0088 D10: dalla lista storica degli STUDENTI «Annulla» e «Indietro» tornano alla lista degli studenti', async () => {
  const t = carica(); await t.carica();
  t.S.openStudentCreate();                       // (come se fosse stata aperta dalla Cabina…)
  t.finestra().querySelector('[data-back]').onclick();
  t.window.openClassAccountsModal();             // …e poi la lista storica la riporta a «classi»
  await giro();
  t.finestra().querySelectorAll('[data-tab]').forEach(b => { if (b.getAttribute('data-tab') === 'studenti') b.onclick(); });
  assert.equal(t.cosa(), 'lista-studenti');
  t.finestra().querySelector('[data-snew]').onclick();
  assert.equal(t.cosa(), 'nuovo-allievo');
  t.finestra().querySelector('[data-back]').onclick();
  assert.equal(t.cosa(), 'lista-studenti', '«Annulla» dal nuovo allievo, nella lista storica');
  t.finestra().querySelectorAll('[data-sedit]')[0].onclick({ stopPropagation() { } });
  assert.equal(t.cosa(), 'allievo');
  t.finestra().querySelector('[data-sdel]').onclick();
  await giro();
  assert.equal(t.cosa(), 'lista-studenti', 'eliminato un allievo dalla lista storica, si torna alla lista');
});

test('0088 D10: aprire la lista storica DOPO una schermata della Cabina azzera il ricordo: «Indietro» torna alla lista', async () => {
  const t = carica(); await t.carica();
  t.S.openClassEdit('c2a');
  t.finestra().querySelector('.cls-close').onclick();      // chiusa con la ×: il segno «dalla Cabina» resterebbe vero
  assert.equal(t.cosa(), 'nessuna');
  t.window.openClassAccountsModal();
  await giro();
  t.finestra().querySelectorAll('[data-edit]')[0].onclick({ stopPropagation() { } });
  t.finestra().querySelector('[data-back]').onclick();
  assert.equal(t.cosa(), 'lista-classi');
});

// ── D11 · eliminare la classe ────────────────────────────────────────────────────────────────────
async function elimina(t, id, scritto) {
  t.S.openClassEdit(id);
  t.finestra().querySelector('[data-del]').onclick();
  await giro();
  return t.chiedi[t.chiedi.length - 1];
}

test('0088 D11: eliminare la classe ATTIVA la toglie anche dal contesto (la chiave non punta più a un fantasma)', async () => {
  const t = carica({ risposta: 'elimina', local: { mappai_active_class: 'c2a' } });
  await t.carica();
  assert.equal(t.S.activeId(), 'c2a');
  await elimina(t, 'c2a');
  assert.equal(t.S.list().some(c => c.id === 'c2a'), false, 'la classe non c\'è più');
  assert.equal(t.S.activeId(), '', 'e non è più attiva');
  assert.equal(t.memoria.has('mappai_active_class'), false);
  assert.equal(t.S.getActive(), null);
});

test('0088 D11: eliminare una classe NON attiva lascia com\'è la classe attiva', async () => {
  const t = carica({ risposta: 'elimina', local: { mappai_active_class: 'c3b' } });
  await t.carica();
  await elimina(t, 'c2a');
  assert.equal(t.S.list().map(c => c.id).join(), 'c3b');
  assert.equal(t.S.activeId(), 'c3b');
});

test('0088 D11: una parola sbagliata dà l\'avviso e NON elimina; «Annulla» non fa niente', async () => {
  const t = carica({ risposta: 'boh', local: { mappai_active_class: 'c2a' } });
  await t.carica();
  await elimina(t, 'c2a');
  assert.equal(t.S.list().length, 2);
  assert.equal(t.S.activeId(), 'c2a');
  assert.deepEqual(t.toast.map(x => x.m), ['Classe non eliminata: per cancellarla scrivi «elimina».']);
  /* Annulla: il motore risponde null */
  const u = carica({ risposta: null, local: { mappai_active_class: 'c2a' } });
  await u.carica();
  await elimina(u, 'c2a');
  assert.equal(u.S.list().length, 2);
  assert.equal(u.S.activeId(), 'c2a');
  assert.deepEqual(u.toast, [], 'nessun avviso, nessuna eliminazione');
});

test('0088 D11: la parola vale senza badare a maiuscole e spazi attorno; una stringa vuota è una parola sbagliata', async () => {
  const t = carica({ risposta: '  Elimina ' });
  await t.carica();
  await elimina(t, 'c3b');
  assert.equal(t.S.list().map(c => c.id).join(), 'c2a');
  const v = carica({ risposta: '' });
  await v.carica();
  await elimina(v, 'c3b');
  assert.equal(v.S.list().length, 2);
  assert.equal(v.toast.length, 1);
});

test('0088 D11: dalla Cabina, dopo l\'eliminazione la finestra si chiude; dalla lista storica si torna alla lista', async () => {
  const dallaCabina = carica({ risposta: 'elimina' });
  await dallaCabina.carica();
  await elimina(dallaCabina, 'c2a');
  assert.equal(dallaCabina.cosa(), 'nessuna');
  const dallaLista = carica({ risposta: 'elimina' });
  await dallaLista.carica();
  dallaLista.window.openClassAccountsModal();
  await giro();
  dallaLista.finestra().querySelectorAll('[data-edit]')[0].onclick({ stopPropagation() { } });
  dallaLista.finestra().querySelector('[data-del]').onclick();
  await giro();
  assert.equal(dallaLista.cosa(), 'lista-classi');
});

test('0088 D11 (inglese): la parola è «delete» nell\'etichetta e nel confronto; «elimina» NON basta più', async () => {
  const t = carica({ lingua: 'en', risposta: 'delete' });
  await t.carica();
  const domanda = await elimina(t, 'c2a');
  assert.equal(domanda.etichetta.includes('"delete"'), true, domanda.etichetta);
  assert.equal(domanda.etichetta.includes('{parola}'), false);
  assert.equal(t.S.list().length, 1, 'scrivere «delete» elimina davvero');
  const u = carica({ lingua: 'en', risposta: 'elimina' });
  await u.carica();
  await elimina(u, 'c2a');
  assert.equal(u.S.list().length, 2);
  assert.deepEqual(u.toast.map(x => x.m), ['Class not deleted: to delete it, type «delete».']);
});

test('0088 D11 (italiano): l\'etichetta chiede «elimina» e nomina la classe', async () => {
  const t = carica({ risposta: null });
  await t.carica();
  const domanda = await elimina(t, 'c2a');
  assert.equal(domanda.etichetta, 'Scrivi "elimina" per cancellare la classe 2A');
});

test('0088 D11: in inglese l\'etichetta e il messaggio hanno la stessa parola (una chiave sola nel dizionario)', () => {
  assert.equal(EN.cls_del_parola_chiave, 'delete');
  assert.equal(EN.cls_del_confirm.includes('{parola}'), true);
  assert.equal(EN.cls_del_parola.includes('{parola}'), true);
});
