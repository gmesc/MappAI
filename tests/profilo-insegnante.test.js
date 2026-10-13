'use strict';
/*
 * profilo-insegnante.test.js — packet 0088 (beta.6), difetti D1, D2, D3 del profilo insegnante.
 *
 * Il modulo VERO `mappai-teacher-profile.js` in una vm con una `Date` finta (l'anno scolastico dipende dal mese),
 * e, per D1 e per il falso «Uscire senza salvare?» di D2, la console VERA `mappai-cabina.js` nella stessa vm, davanti
 * a un motore dei modali finto che si limita a tenere lo schema e a lasciar chiamare `suAzione` e `sporco`.
 *
 *  D1  «Gestisci profili» non conclude la finestra (`chiude:false`) e la Cabina porta alla voce «Allievi»;
 *      il profilo scritto fin lì resta, e uscire con modifiche in sospeso chiede «Uscire senza salvare?».
 *  D2  l'anno scolastico vuoto vale quello in corso (la tendina lo mostra già): un profilo mai salvato non risulta
 *      «modificato» senza che nessuno abbia toccato niente. Un anno già salvato non si tocca.
 *  D3  «Ora di classe» e «Servizio o istituto di riferimento» non sono più sullo schermo, ma i dati salvati restano
 *      intatti anche dopo aver toccato e salvato il profilo; i testi non promettono più effetti che non ci sono.
 *
 * ⚠️ Negli assert sul DOM/schemi finti solo booleani, testi e numeri, mai l'oggetto: un assert fallito su un oggetto
 * grosso può far girare Node all'infinito.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const TC = require('../public/js/mappai-teach-core.js');
const VC = require('../public/js/mappai-vista-core.js');

/* una Date che, senza argomenti, vale `iso` (ora locale): l'anno scolastico comincia in agosto */
function dataFinta(iso) {
  const fissa = new Date(iso).getTime();
  return class extends Date {
    constructor(...a) { if (a.length) super(...a); else super(fissa); }
    static now() { return fissa; }
  };
}

function memoria(salvato) {
  const local = new Map();
  if (salvato) local.set('mappai_teacher_profile', JSON.stringify(salvato));
  return {
    local,
    localStorage: {
      getItem: k => (local.has(k) ? local.get(k) : null), setItem: (k, v) => local.set(k, String(v)),
      removeItem: k => local.delete(k), get length() { return local.size; }, key: i => [...local.keys()][i]
    }
  };
}

/* il solo profilo */
function profilo(o = {}) {
  const m = memoria(o.salvato);
  const win = { t: (_k, f) => f, showToast() { } };
  const ctx = vm.createContext({
    window: win, console: { log() { }, warn() { }, error() { } }, Date: dataFinta(o.ora || '2026-10-12T10:00:00'),
    localStorage: m.localStorage
  });
  vm.runInContext(JS('mappai-teacher-profile.js'), ctx);
  return { TP: win.MappAITeacherProfile, local: m.local, win };
}

/* il profilo e la Cabina insieme */
function cabinaVera(o = {}) {
  const m = memoria(o.salvato);
  const spie = { schemi: [], esterni: [] };
  let aperta = null;
  const box = { querySelector: () => null };
  const win = {
    t: (_k, f) => f, showToast() { },
    MappAIModal: { open: s => { aperta = s; return new Promise(() => { }); }, conferma: () => Promise.resolve(true) },
    MappAIFilesCore: { SUB: { mappe: 'Mappe' } }, MappAITeachCore: TC, MappAIVistaCore: VC,
    MappAIErrori: { cassetto: () => ({ pct: 10, livello: 'ok' }) },
    electronAPI: { filesRootGet: async () => ({ organized: true, rootDir: '/R' }), openExternal: u => { spie.esterni.push(u); } },
    addEventListener() { }
  };
  const ctx = vm.createContext({
    window: win, console: { log() { }, warn() { }, error() { } }, setTimeout, Date: dataFinta(o.ora || '2026-10-12T10:00:00'),
    document: { addEventListener() { }, querySelector: () => null, documentElement: { dataset: {} } },
    StorageManager: { validVaultFolders: null }, localStorage: m.localStorage,
    navigator: o.userAgent === undefined ? undefined : { userAgent: o.userAgent }
  });
  vm.runInContext(JS('mappai-teacher-profile.js'), ctx);
  vm.runInContext(JS('mappai-cabina.js'), ctx);
  const rid = s => { spie.schemi.push(s); return box; };
  const c = {
    win, spie, local: m.local,
    apri: async voce => {
      win.MappAICabina.apri(voce || 'profilo');
      aperta.suApertura(box, rid);
      for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r));
    },
    schema: () => spie.schemi[spie.schemi.length - 1] || aperta,
    azione: (azione, valori, extra) => aperta.suAzione(Object.assign({ azione, valori: valori || {} }, extra || {}), box, rid),
    sporco: () => aperta.sporco()
  };
  return c;
}

const campo = (sezioni, sez, id) => sezioni.find(x => x.id === sez).campi.find(k => k.id === id);

// ── D2 · l'anno scolastico ───────────────────────────────────────────────────────────────────────
test('0088 D2: un profilo mai salvato ha l\'anno in corso — da agosto il nuovo, fino a luglio il vecchio', () => {
  assert.equal(profilo({ ora: '2026-10-12T10:00:00' }).TP.get().anno, '2026/2027');
  assert.equal(profilo({ ora: '2027-03-10T10:00:00' }).TP.get().anno, '2026/2027');
  assert.equal(profilo({ ora: '2026-08-01T10:00:00' }).TP.get().anno, '2026/2027');
  assert.equal(profilo({ ora: '2026-07-31T10:00:00' }).TP.get().anno, '2025/2026');
});

test('0088 D2: la tendina mostra DAVVERO l\'anno dello store (il valore è fra le opzioni)', () => {
  const { TP } = profilo();
  const anno = campo(TP.sezioni(), 'chi', 'anno');
  assert.equal(anno.valore, '2026/2027');
  assert.equal(anno.opzioni.includes(anno.valore), true);
  assert.equal(anno.opzioni[0], '2025/2026', 'la finestra comincia dall\'anno prima: non è più il primo della lista a decidere');
});

test('0088 D2: un anno già salvato non si tocca, nemmeno fuori dalla finestra; un anno salvato vuoto riceve quello in corso', () => {
  const vecchio = profilo({ salvato: { anno: '2024/2025', ruolo: 'materia' } });
  assert.equal(vecchio.TP.get().anno, '2024/2025');
  assert.equal(campo(vecchio.TP.sezioni(), 'chi', 'anno').opzioni[0], '2024/2025', 'fuori dalla finestra resta in elenco, in testa');
  const salvatoIeri = profilo({ salvato: { anno: '2025/2026' } });
  assert.equal(salvatoIeri.TP.get().anno, '2025/2026');
  const vuoto = profilo({ salvato: { anno: '', nickname: 'Ada' } });
  assert.equal(vuoto.TP.get().anno, '2026/2027');
  assert.equal(JSON.parse(vuoto.local.get('mappai_teacher_profile')).anno, '', 'caricare non riscrive niente sul disco');
});

test('0088 D2: la Cabina, a profilo non toccato, NON chiede «Uscire senza salvare?» (il falso allarme dell\'anno vuoto)', async () => {
  const c = cabinaVera();
  await c.apri('profilo');
  assert.equal(c.sporco(), false, 'appena aperta');
  const S = c.schema();
  const chi = S.sezioni.find(x => x.id === 'chi');
  /* i valori che il modulo raccoglie da un form NON toccato: quelli che lo schermo MOSTRA. Una tendina il cui valore non è
     fra le opzioni mostra la prima (era il difetto: store '' e tendina su «2025/2026», cioè «modificato» da subito) */
  const annoSchema = chi.campi.find(k => k.id === 'anno');
  const mostrato = annoSchema.opzioni.includes(annoSchema.valore) ? annoSchema.valore : annoSchema.opzioni[0];
  const valori = { nome: chi.campi.find(k => k.id === 'nome').valore, anno: mostrato };
  c.azione('__campo', valori, { campo: 'nome' });
  assert.equal(c.sporco(), false, 'un campo attraversato senza cambiarlo non è una modifica');
  /* una modifica vera, invece, sì */
  c.azione('__campo', Object.assign({}, valori, { nome: 'Ada' }), { campo: 'nome' });
  assert.equal(c.sporco(), true);
});

// ── D3 · niente promesse false ───────────────────────────────────────────────────────────────────
test('0088 D3: sullo schermo non ci sono più «Ora di classe» né «Servizio o istituto», con nessuno dei due ruoli', () => {
  for (const ruolo of ['materia', 'sostegno']) {
    const { TP } = profilo({ salvato: { ruolo, oraDiClasse: true, oraDiClasseCls: '1A', sostegnoEnte: 'Servizio X' } });
    const sez = TP.sezioni();
    const ids = [];
    sez.forEach(s => (s.campi || []).forEach(k => ids.push(k.id)));
    for (const vietato of ['ora-classe', 'ora-quale', 'sostegno-ente']) assert.equal(ids.includes(vietato), false, ruolo + ': ' + vietato);
    assert.equal(sez.some(s => s.id === 'ora'), false, ruolo + ': la sezione «Ora di classe»');
    const tutto = JSON.stringify(sez);
    for (const falso of ['Ora di classe', 'Sono docente di classe', 'Servizio o istituto', 'intestazione dei materiali', 'Sblocca i profili', 'Attivi perché'])
      assert.equal(tutto.includes(falso), false, ruolo + ': «' + falso + '»');
  }
});

test('0088 D3: il ruolo resta, con un testo onesto, e il riquadro degli allievi c\'è solo per il sostegno', () => {
  const sost = profilo({ salvato: { ruolo: 'sostegno' } }).TP.sezioni();
  const ruolo = sost.find(s => s.id === 'ruolo');
  assert.equal(ruolo.campi.some(k => k.id === 'ruolo-materia'), true);
  const aiuto = ruolo.campi.find(k => k.id === 'ruolo-sostegno').aiuto;
  assert.equal(aiuto.includes('scorciatoia'), true, aiuto);
  assert.equal(aiuto.includes('qualunque ruolo'), true, aiuto);
  const allievi = sost.find(s => s.id === 'allievi');
  assert.equal(allievi.testo.startsWith('I profili vivono sul tuo computer.'), true, allievi.testo);
  assert.equal(profilo({ salvato: { ruolo: 'materia' } }).TP.sezioni().some(s => s.id === 'allievi'), false);
});

test('0088 D3: i dati dei campi tolti restano intatti — anche dopo aver toccato e salvato il profilo', () => {
  const salvato = { nickname: 'Ada', anno: '2026/2027', ruolo: 'sostegno', oraDiClasse: true, oraDiClasseCls: '1A', sostegnoEnte: 'Servizio X',
    sedi: ['Bedigliora'], discipline: ['Storia'] };
  const { TP, local } = profilo({ salvato });
  const S = JSON.parse(JSON.stringify(TP.get()));
  assert.equal(S.oraDiClasse, true);
  assert.equal(S.oraDiClasseCls, '1A');
  assert.equal(S.sostegnoEnte, 'Servizio X');
  /* l'`assorbi` del form NON contiene i campi tolti: prima li azzerava (`!!undefined`) */
  TP.assorbi(S, { nome: 'Ada B.', anno: '2026/2027', 'ruolo-sostegno': true });
  assert.equal(S.oraDiClasse, true, 'la spunta «Ora di classe» non si azzera');
  assert.equal(S.oraDiClasseCls, '1A');
  assert.equal(S.sostegnoEnte, 'Servizio X');
  TP.salva(S);
  const su = JSON.parse(local.get('mappai_teacher_profile'));
  assert.equal(su.oraDiClasse, true);
  assert.equal(su.oraDiClasseCls, '1A');
  assert.equal(su.sostegnoEnte, 'Servizio X');
  assert.equal(su.nickname, 'Ada B.');
});

test('0088 D3: la nota in fondo al profilo non nomina più l\'ora di classe', () => {
  const { TP, win } = profilo();
  let schema = null;
  win.MappAIModal = { open: s => { schema = s; return new Promise(() => { }); } };
  win.showTeacherProfileModal();
  assert.equal(!!schema, true);
  assert.equal(schema.nota, 'Materie e sedi diventano filtri nella sezione Insegna.');
  assert.equal(TP.get().ruolo, 'materia');
});

// ── D1 · «Gestisci profili» ──────────────────────────────────────────────────────────────────────
test('0088 D1: «Gestisci profili» è un\'azione che NON conclude la finestra (chiude:false)', () => {
  const allievi = profilo({ salvato: { ruolo: 'sostegno' } }).TP.sezioni().find(s => s.id === 'allievi');
  const az = allievi.azioni.find(a => a.id === 'apri-prof');
  assert.equal(!!az, true);
  assert.equal(az.chiude, false);
});

test('0088 D1: nella Cabina il clic porta alla voce «Allievi»; il profilo scritto resta, e uscire chiede «Uscire senza salvare?»', async () => {
  const c = cabinaVera({ salvato: { ruolo: 'sostegno', nickname: '', anno: '2026/2027' } });
  await c.apri('profilo');
  assert.equal(c.schema().sezioni.some(s => s.id === 'allievi'), true, 'il riquadro degli allievi c\'è per il sostegno');
  assert.equal(c.sporco(), false);
  /* il docente scrive il nome e preme «Gestisci profili» */
  c.azione('apri-prof', { nome: 'Ada Bozza', anno: '2026/2027', 'ruolo-sostegno': true });
  const voce = c.schema().nav.find(n => n.attiva);
  assert.equal(voce.id, 'allievi', 'la Cabina è sulla voce «Allievi»');
  assert.equal(c.sporco(), true, 'la bozza è in sospeso: uscire ora chiede conferma');
  /* tornando su «Profilo insegnante» la bozza è ancora lì */
  c.azione('__nav', {}, { voce: 'profilo' });
  assert.equal(c.schema().nav.find(n => n.attiva).id, 'profilo');
  assert.equal(campo(c.schema().sezioni, 'chi', 'nome').valore, 'Ada Bozza');
  assert.equal(c.sporco(), true);
});
