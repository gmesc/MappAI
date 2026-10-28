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
 * Packet 0130 (27/10/2026): via il ruolo «Docente di sostegno / OPI» e il riquadro «Gestisci profili». Cinque casi dello 0088
 * cambiano col sì di Giacomo (packet 0130, §6 e §9): due escono (il ruolo, `chiude:false`), D1 passa dal menu della Cabina,
 * e `ruolo` e `sostegnoEnte` escono dal profilo al primo salvataggio («Pulirli al salvataggio»).
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

/* «0088 D3: il ruolo resta, con un testo onesto…» è uscito con lo 0130 (Giacomo: «Sì (Consigliato)»): il ruolo non c'è più,
   e la prima prova dello 0130, in fondo, dice che cosa resta sullo schermo. */

test('0088 D3: i dati di «Ora di classe» restano intatti — anche dopo aver toccato e salvato il profilo (quelli del ruolo escono: 0130)', () => {
  const salvato = { nickname: 'Ada', anno: '2026/2027', ruolo: 'sostegno', oraDiClasse: true, oraDiClasseCls: '1A', sostegnoEnte: 'Servizio X',
    sedi: ['Bedigliora'], discipline: ['Storia'] };
  const { TP, local } = profilo({ salvato });
  const S = JSON.parse(JSON.stringify(TP.get()));
  assert.equal(S.oraDiClasse, true);
  assert.equal(S.oraDiClasseCls, '1A');
  assert.equal('sostegnoEnte' in S, false, '0130: «Pulirli al salvataggio»');
  /* l'`assorbi` del form NON contiene i campi tolti: prima li azzerava (`!!undefined`) */
  TP.assorbi(S, { nome: 'Ada B.', anno: '2026/2027', 'ruolo-sostegno': true });
  assert.equal(S.oraDiClasse, true, 'la spunta «Ora di classe» non si azzera');
  assert.equal(S.oraDiClasseCls, '1A');
  assert.equal('sostegnoEnte' in S, false);
  TP.salva(S);
  const su = JSON.parse(local.get('mappai_teacher_profile'));
  assert.equal(su.oraDiClasse, true);
  assert.equal(su.oraDiClasseCls, '1A');
  assert.equal('sostegnoEnte' in su, false);
  assert.equal(su.nickname, 'Ada B.');
});

test('0088 D3: la nota in fondo al profilo non nomina più l\'ora di classe', () => {
  const { TP, win } = profilo();
  let schema = null;
  win.MappAIModal = { open: s => { schema = s; return new Promise(() => { }); } };
  win.showTeacherProfileModal();
  assert.equal(!!schema, true);
  assert.equal(schema.nota, 'Materie e sedi diventano filtri nella sezione Insegna.');
  assert.equal('ruolo' in TP.get(), false, '0130: il profilo non ha più il ruolo');
});

// ── D1 · la bozza del profilo e la voce «Allievi» ────────────────────────────────────────────────
/* «0088 D1: «Gestisci profili» è un'azione che NON conclude la finestra» è uscito con lo 0130 (Giacomo: «Sì (Consigliato)»):
   il bottone non c'è più. La garanzia di D1 resta, provata dal menu della Cabina. */

test('0088 D1 (0130: dal menu): passando alla voce «Allievi» il profilo scritto resta, e uscire chiede «Uscire senza salvare?»', async () => {
  const c = cabinaVera({ salvato: { ruolo: 'sostegno', nickname: '', anno: '2026/2027' } });
  await c.apri('profilo');
  assert.equal(c.sporco(), false);
  /* il docente scrive il nome e passa alla voce «Allievi» dal menu: il motore raccoglie i campi anche al cambio di voce */
  c.azione('__nav', { nome: 'Ada Bozza', anno: '2026/2027' }, { voce: 'allievi' });
  const voce = c.schema().nav.find(n => n.attiva);
  assert.equal(voce.id, 'allievi', 'la Cabina è sulla voce «Allievi»');
  assert.equal(c.sporco(), true, 'la bozza è in sospeso: uscire ora chiede conferma');
  /* tornando su «Profilo insegnante» la bozza è ancora lì */
  c.azione('__nav', {}, { voce: 'profilo' });
  assert.equal(c.schema().nav.find(n => n.attiva).id, 'profilo');
  assert.equal(campo(c.schema().sezioni, 'chi', 'nome').valore, 'Ada Bozza');
  assert.equal(c.sporco(), true);
});

// ── 0130 · via il ruolo «Docente di sostegno / OPI» ──────────────────────────────────────────────
const SORGENTE = f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const VECCHIO = { nickname: 'Ada', anno: '2026/2027', ruolo: 'sostegno', sostegnoEnte: 'Servizio X', oraDiClasse: true, oraDiClasseCls: '1A',
  sedi: ['Bedigliora'], discipline: ['Storia'] };
const ASPETTO = ['Ruolo professionale', 'Docente di materia', 'Docente di sostegno', 'Gestisci profili', 'Profili individuali', 'scorciatoia'];

test('0130: il profilo ha tre sezioni — Chi sei, Sedi, Materie — con qualunque profilo salvato, e nessuna traccia del ruolo', () => {
  for (const salvato of [undefined, { ruolo: 'materia' }, { ruolo: 'sostegno', sostegnoEnte: 'Servizio X' }]) {
    const nome = salvato ? salvato.ruolo : 'vuoto';
    const sez = profilo({ salvato }).TP.sezioni();
    assert.equal(sez.map(s => s.id).join(','), 'chi,sedi,materie', nome);
    const tutto = JSON.stringify(sez);
    for (const via of ASPETTO) assert.equal(tutto.includes(via), false, nome + ': «' + via + '»');
    assert.equal(tutto.includes('apri-prof'), false, nome + ': apri-prof');
  }
});

test('0130: la Cabina vera, con un profilo che era «sostegno», mostra Chi sei, Sedi, Materie e Gestione cartelle', async () => {
  const c = cabinaVera({ salvato: VECCHIO });
  await c.apri('profilo');
  assert.equal(c.schema().sezioni.map(s => s.id).join(','), 'chi,sedi,materie,pr-cartelle');
  const tutto = JSON.stringify(c.schema().sezioni);
  for (const via of ASPETTO) assert.equal(tutto.includes(via), false, '«' + via + '»');
});

test('0130: un profilo vecchio si carica senza scrivere e senza risultare «modificato»; il primo «Salva profilo» della Cabina toglie ruolo e sostegnoEnte', async () => {
  const c = cabinaVera({ salvato: VECCHIO });
  const prima = c.local.get('mappai_teacher_profile');
  await c.apri('profilo');
  assert.equal(c.local.get('mappai_teacher_profile') === prima, true, 'caricare non riscrive niente sul disco');
  assert.equal(c.sporco(), false, 'i due campi spariti non sono una modifica');
  c.azione('salva-prof', { nome: 'Ada', anno: '2026/2027' });
  const su = JSON.parse(c.local.get('mappai_teacher_profile'));
  assert.equal('ruolo' in su, false, 'ruolo');
  assert.equal('sostegnoEnte' in su, false, 'sostegnoEnte');
  assert.equal(su.oraDiClasse, true);
  assert.equal(su.oraDiClasseCls, '1A');
  assert.equal(su.sedi.join(','), 'Bedigliora');
  assert.equal(su.discipline.join(','), 'Storia');
  assert.equal(su.nickname, 'Ada');
  assert.equal(c.sporco(), false, 'dopo il salvataggio, niente in sospeso');
});

test('0130: anche il «Salva profilo» del modale storico toglie ruolo e sostegnoEnte', async () => {
  const { win, local } = profilo({ salvato: VECCHIO });
  let schema = null;
  win.MappAIModal = { open: s => { schema = s; return Promise.resolve({ azione: 'salva', valori: { nome: 'Ada', anno: '2026/2027' } }); } };
  win.showTeacherProfileModal();
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
  assert.equal(schema.sottotitolo, 'Sedi e materie: da qui vengono i nomi che il resto dell’app usa');
  assert.equal(schema.sezioni.map(s => s.id).join(','), 'chi,sedi,materie');
  const su = JSON.parse(local.get('mappai_teacher_profile'));
  assert.equal('ruolo' in su, false, 'ruolo');
  assert.equal('sostegnoEnte' in su, false, 'sostegnoEnte');
  assert.equal(su.oraDiClasse, true);
});

test('0130: la nota della voce «Allievi» non nomina più il ruolo', async () => {
  const c = cabinaVera();
  await c.apri('allievi');
  const nota = c.schema().nota;
  assert.equal(nota.startsWith('Le schede allievo sono la taratura individuale: si creano qui con «Crea profilo».'), true, nota);
  assert.equal(nota.includes('ruolo'), false, nota);
});

test('0130: nei due moduli non resta niente del ruolo e del riquadro', () => {
  const moduli = { 'mappai-teacher-profile.js': SORGENTE('js/mappai-teacher-profile.js'), 'mappai-cabina.js': SORGENTE('js/mappai-cabina.js') };
  for (const [f, src] of Object.entries(moduli))
    for (const via of ['apri-prof', 'ruolo-sostegno', 'ruolo-materia', 'isSostegno', 'sostegnoEnte', 'tp_ruolo', 'tp_allievi', 'qualunque sia il tuo ruolo'])
      assert.equal(src.includes(via), false, f + ': ' + via);
});

test('0130: il dizionario inglese — otto chiavi fuori, due riscritte', () => {
  const en = SORGENTE('traduzioni/en_translations.js');
  for (const k of ['tp_ruolo', 'tp_ruolo_materia', 'tp_ruolo_materia_aiuto', 'tp_ruolo_sostegno', 'tp_ruolo_sostegno_aiuto',
    'tp_allievi', 'tp_allievi_testo', 'tp_allievi_apri'])
    assert.equal(new RegExp('^\\s*' + k + ':', 'm').test(en), false, k);
  assert.equal(en.includes('tp_sub: "Sites and subjects: this is where the names used across the app come from",'), true, 'tp_sub');
  assert.equal(en.includes('cb_allievi_nota: "Student cards are the individual tuning: create them here with «New profile».",'), true, 'cb_allievi_nota');
});

test('index.html: i ?v= dei tre file portano il segno dello 0130', () => {
  const html = SORGENTE('index.html');
  for (const v of ['js/mappai-teacher-profile.js?v=0088-20261012-1-0130-1', 'js/mappai-cabina.js?v=0116-20261020-2-0122-4b2-2-0130-1',
    'traduzioni/en_translations.js?v=0122-20261021-1-0123-2-0122-4b2-2-0124-3-0126-1-0130-1'])
    assert.equal(html.includes(v), true, v);
});
